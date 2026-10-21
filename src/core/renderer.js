// Renderer + post stack (MSAA HDR target → optional GTAO → bloom → grade/vignette → output).
// Apple GPUs (ANGLE's Metal backend): multisampled half-float targets cost ~30 ms/frame at 1920×1200 on an M1 Pro,
// so there the HDR target is single-sampled and edges are smoothed by SMAA after output, and GTAO runs at half res.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { QUALITY, RENDER_RUNGS, rendererQuality, withProfile, renderDensity, densityFloor } from '../config.js';
import { rungDensity } from './render-gov.js';
import { G } from './ctx.js';
import { shouldUseTouch } from './touch.js';

const BLOOM = [0.28, 0.45, 2.4];   // default bloom: strength, radius, HDR threshold

// three's OutputPass (Neutral tone mapping at the renderer's exposure, then the sRGB transfer) as the end of whichever pass
// comes last before SMAA — the grade, or the screen FX while it is on — instead of a pass the size of the screen of its own
// (uOut 1; touch only, where SMAA is the last pass: LEARN §50). iwNeutral is three r186's NeutralToneMapping, word for word,
// with its exposure as uToneExp (tests/learn/perf.test.mjs holds the two side by side).
export const OUT_FRAG = /* glsl */`
    uniform float uOut; uniform float uToneExp;
    vec3 iwNeutral( vec3 color ) {
      const float StartCompression = 0.8 - 0.04;
      const float Desaturation = 0.15;
      color *= uToneExp;
      float x = min( color.r, min( color.g, color.b ) );
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max( color.r, max( color.g, color.b ) );
      if ( peak < StartCompression ) return color;
      float d = 1. - StartCompression;
      float newPeak = 1. - d * d / ( peak + d - StartCompression );
      color *= newPeak / peak;
      float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
      return mix( color, vec3( newPeak ), g );
    }
    vec4 iwOut( vec4 c ) { if ( uOut < 0.5 ) return c; c.rgb = iwNeutral( c.rgb ); return sRGBTransferOETF( c ); }
`;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.08 },
    uVib: { value: 0.12 },                               // extra saturation for muted colours only (ink never clips)
    uContrast: { value: 1.07 },                          // log-space contrast around mid grey
    uShadowTint: { value: new THREE.Vector3(0.975, 0.99, 1.035) },
    uHighTint: { value: new THREE.Vector3(1.025, 1.0, 0.972) },
    uLift: { value: 0.0 },
    uExposure: { value: 1.0 },                           // per-theme exposure (the renderer's own exposure stays fixed: the lobby set shares it)
    uVignette: { value: 0.22 },
    uHurt: { value: 0 },
    uHurtColor: { value: new THREE.Color(1, 0.2, 0.3) },
    uFlash: { value: 0 },
    uAspect: { value: 1.7 },
    tBloom: { value: null }, uBloomOn: { value: 0 },   // the bloom's composite, added here instead of in a pass of its own (BloomIntoGrade)
    uOut: { value: 0 }, uToneExp: { value: 1 },        // the output step, when this is the last pass before SMAA (OUT_FRAG)
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uVignette; uniform float uHurt; uniform vec3 uHurtColor; uniform float uFlash; uniform float uAspect;
    uniform float uVib; uniform float uContrast; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uLift; uniform float uExposure;
    uniform sampler2D tBloom; uniform float uBloomOn;
    ${OUT_FRAG}
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uBloomOn > 0.5) c += texture2D(tBloom, vUv);   // (the bloom's own blend was ONE, ONE onto this frame: the same sum)
      c.rgb *= uExposure;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // vibrance: muted colours gain saturation, already-saturated ones (team ink) barely move
      float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
      float chroma = (mx - mn) / max(mx, 1e-4);
      c.rgb = max(mix(vec3(l), c.rgb, uSat + uVib * (1.0 - smoothstep(0.1, 0.7, chroma))), 0.0);
      // contrast in log space around mid grey (keeps HDR highlights ordered), then a cool-shadow / warm-light split tone
      c.rgb = 0.18 * pow(max(c.rgb, vec3(1e-6)) / 0.18, vec3(uContrast)) + uLift;
      // split tone is for the world's neutrals: strongly saturated colours (team ink) keep their exact hue
      float lt = smoothstep(0.015, 0.55, l);
      c.rgb *= mix(vec3(1.0), mix(uShadowTint, uHighTint, lt), 1.0 - 0.85 * smoothstep(0.35, 0.8, chroma));
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      float v = smoothstep(0.55, 1.25, r);
      c.rgb *= 1.0 - uVignette * v;
      // low health: the HUD draws the coloured edge; here we only drain saturation + darken the rim slightly
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, vec3(lum), uHurt * 0.45);
      c.rgb *= 1.0 - uHurt * 0.25 * smoothstep(0.4, 1.2, r);
      c.rgb += uFlash;
      gl_FragColor = iwOut(c);
    }`,
};

// UnrealBloomPass ends by adding its composite onto the frame (ONE, ONE) — a pass the size of the screen; here it stops at the
// composite (renderTargetsHorizontal[0]) and the grade adds it (uBloomOn, tBloom). The rest is r186's render, step for step.
class BloomIntoGrade extends UnrealBloomPass {
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    renderer.getClearColor(this._oldClearColor);
    this._oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    if (maskActive) renderer.state.buffers.stencil.setTest(false);
    // 1. the bright areas
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this._fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    renderer.clear();
    this._fsQuad.render(renderer);
    // 2. every mip blurred, each from the one before
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i];
      this._fsQuad.material = m;
      m.uniforms.colorTexture.value = input.texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      renderer.clear();
      this._fsQuad.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      renderer.clear();
      this._fsQuad.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    // 3. the mips composited (what the grade adds)
    this._fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    renderer.clear();
    this._fsQuad.render(renderer);
    if (maskActive) renderer.state.buffers.stencil.setTest(true);
    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }
}

// r186's PCF filter uses a 5-tap rotated Vogel disk with per-pixel noise, which reads as grainy stipple on every soft
// shadow edge. Swap it for a noise-free 3×3 grid of hardware-compared (bilinear) taps: smooth and temporally stable.
(function patchShadowFilter() {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) { console.warn('[inkwave] shadow chunk layout changed; keeping stock PCF'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `vec2 ts = texelSize * max( shadowRadius * 0.55, 0.6 );
				float s9 = 0.0;
				for ( int sx = -1; sx <= 1; sx ++ ) for ( int sy = -1; sy <= 1; sy ++ ) s9 += texture( shadowMap, vec3( shadowCoord.xy + vec2( float( sx ), float( sy ) ) * ts, shadowCoord.z ) );
				shadow = s9 * ( 1.0 / 9.0 );`);
})();

// GTAO's own Default output copies the whole frame into the other buffer and multiplies the AO onto the copy — two passes the
// size of the screen; multiplying straight onto the frame it read is the same image for one (LEARN §50). Its other outputs
// (the debug views) go the stock way.
class GTAOInPlace extends GTAOPass {
  constructor(...a) { super(...a); this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    if (this.output !== GTAOPass.OUTPUT.Default) { this.needsSwap = true; return super.render(renderer, writeBuffer, readBuffer, dt, mask); }
    this.needsSwap = false;
    this.output = GTAOPass.OUTPUT.Off;   // (normals if its own, the AO, the denoise — and no copy)
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
    this.output = GTAOPass.OUTPUT.Default;
    this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
    this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
    this._renderPass(renderer, this.blendMaterial, this.renderToScreen ? null : readBuffer);
  }
}

function isAppleGPU(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return /Apple/i.test(name) && !/Intel|AMD|Radeon|NVIDIA/i.test(name);
}

export class Renderer {
  constructor(container, settings) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    // Shader status checks make every compile synchronous (the main thread waits on the GPU process for the link
    // result): a mid-game compile then stalls input, netcode and all. Players run without them; ?shadercheck (the
    // smoke test and dev tools) turns them back on so a broken shader still fails loudly.
    r.debug.checkShaderErrors = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shadercheck');
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.info.autoReset = false;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x9fd8f0, 1);
    container.appendChild(r.domElement);
    // (?applegpu: the Apple-GPU profile on any GPU — the audits' way to see the iPhone's sharper density and bloom in SwiftShader)
    // (her App named an iPhone / iPad — a render step is set, main.js boot: an Apple GPU even if the renderer string is masked)
    this.appleGPU = isAppleGPU(r.getContext()) || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('applegpu')) || !!G.renderProfile;
    r.domElement.id = 'game-canvas';
    this.container = container;
    this.scene = null; this.camera = null;
    this.settings = settings;
    this.touch = shouldUseTouch(settings);
    // her App's render step (main.js boot, src/core/render-gov.js): density, bloom, AO and shadow map from it while the tier is its own
    this.profile = G.renderProfile || null;
    this.q = withProfile(rendererQuality(settings, this.touch, this.appleGPU), this.profile, settings);
    // (the live ladder's rung while the step is in effect — LEARN §50: main.js _liveApply moves it; null = the old density)
    this.rung = this.q.rungs ? this.q.rungs[0] : null;
    this._w = 0; this._h = 0;
    // the window's size is read when it changes (resize / orientation / visual viewport) and once a second besides — not every
    // frame: innerWidth read after the frame's DOM writes forces a style recalc there and then (LEARN §50)
    this._sizeDirty = true; this._sizeT = 0;
    if (typeof window !== 'undefined' && window.addEventListener) {
      const dirty = () => { this._sizeDirty = true; };
      window.addEventListener('resize', dirty); window.addEventListener('orientationchange', dirty);
      window.visualViewport?.addEventListener?.('resize', dirty);
    }
  }

  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    this._buildComposer();
  }

  _buildComposer() {
    const r = this.renderer, q = this.q;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    this.dynScale = this.dynScale || 1;
    const pr = this._density() * this.dynScale;
    r.setPixelRatio(pr);
    const w = window.innerWidth, h = window.innerHeight;
    r.setSize(w, h);
    // MSAA is skipped where it costs the most. On Apple GPUs a multisampled half-float target is brutally slow; on a
    // touch device it is the most bandwidth-hungry object in the frame and a phone has the least bandwidth to give.
    // The trade is worth making because MSAA charges every frame for an edge-smoothing benefit that a single
    // full-screen SMAA pass (added below) delivers for a fraction of the cost.
    this.noMSAA = this.appleGPU || this.touch;
    this.samples = this.noMSAA ? 0 : q.msaa || 0;
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.samples });
    const comp = (this.composer = new EffectComposer(r, rt));
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    this.renderPass = new RenderPass(this.scene, this.camera);
    comp.addPass(this.renderPass);
    this.gtao = null;
    if (q.ao) {
      const ao = (this.gtao = new GTAOInPlace(this.scene, this.camera, w, h));
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.8;   // never crush to black: fully enclosed spots (tunnel mouths, under the overpass) keep 20 % of their light
      // contact AO: a metre-scale radius so crates, planters and pillar feet sit on the deck (it multiplies the lit
      // frame, so it stays short-range — no dirty halos on sunlit walls)
      ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.6, thickness: 1.0, scale: 1.5, samples: 12, distanceFallOff: 1.0 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      if (this.appleGPU) { const set = ao.setSize.bind(ao); ao.setSize = (sw, sh) => set(Math.ceil(sw / 2), Math.ceil(sh / 2)); }
      comp.addPass(ao);
    }
    this.bloom = new BloomIntoGrade(new THREE.Vector2(w, h), ...BLOOM);
    this.bloom.enabled = !!(q.bloom && this.settings.bloom);
    comp.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
    this._gradeSrc = null;   // (re)apply the theme grade + bloom to the new passes
    comp.addPass(this.grade);
    // optional screen-FX pass (src/fx/screenfx.js) — runs in HDR linear space before tone mapping/output
    if (this.extraPass) comp.addPass(this.extraPass);
    this.output = new OutputPass();
    comp.addPass(this.output);
    // SMAA stands in for MSAA where MSAA was skipped; it runs on the tone-mapped sRGB image — and then the output step is the
    // end of the pass before it (OUT_FRAG: render() picks the grade or the screen FX each frame), not a pass of its own
    this.mergeOut = !!(q.msaa && !this.samples);
    this.output.enabled = !this.mergeOut;
    if (this.mergeOut) comp.addPass(new SMAAPass());
    r.shadowMap.enabled = this.settings.shadows !== false;
    this._w = w; this._h = h;
    this.grade.uniforms.uAspect.value = w / h;
    this._rungPasses();
  }

  // Install (or replace) the screen-FX post pass; kept across quality/setting rebuilds.
  setExtraPass(pass) {
    this.extraPass = pass;
    if (this.scene) this._buildComposer();
  }

  applySettings(settings) {
    const prevQ = this.q;
    this.settings = settings;
    this.touch = shouldUseTouch(settings);
    this.q = withProfile(rendererQuality(settings, this.touch, this.appleGPU), this.profile, settings);
    const shadowChanged = this.renderer.shadowMap.enabled !== (settings.shadows !== false);
    if (prevQ !== this.q || shadowChanged) {
      if (prevQ !== this.q) { this.dynScale = 1; this.bloomShed = false; }
      if (!this.q.rungs) this.rung = null; else if (this.rung == null) this.rung = this.q.rungs[0];   // (the live ladder only with the step's own tier)
      this._buildComposer();
      this.scene?.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((mm) => (mm.needsUpdate = true)); } });
    }
    if (this.bloom) this.bloom.enabled = !!(this.q.bloom && settings.bloom) && !this.bloomShed;
    this._rungPasses();
  }

  // ---- her App's live ladder (LEARN §50; config.js RENDER_RUNGS, src/core/render-gov.js LiveGov, main.js _liveApply): a rung
  // is a density (its pixel budget on this screen) and which of the step's passes are on — targets resized, passes turned on
  // or off, nothing recompiled (the passes' programs are built in the loading screen: warmPasses)
  setRung(n) {
    if (!this.q.rungs || !RENDER_RUNGS[n] || n === this.rung) return false;
    this.rung = n;
    const pr = this._density();
    if (Math.abs(pr - this.renderer.getPixelRatio()) > 1e-3) { this.renderer.setPixelRatio(pr); this.composer.setPixelRatio(pr); this.composer.setSize(this._w, this._h); }
    this._rungPasses();
    return true;
  }
  _rungPasses() {
    if (this.rung == null || !this.q.rungs) return;
    const R = RENDER_RUNGS[this.rung];
    if (this.bloom) this.bloom.enabled = !!(this.q.bloom && this.settings.bloom && R.bloom);
    if (this.gtao) this.gtao.enabled = !!R.ao;
  }
  // the loading screen's warm-up frames draw with every pass the step has (on = true), so a rung turning one on later builds
  // nothing; then back to the rung's own (on = false)
  warmPasses(on) {
    if (this.rung == null) return;
    if (!on) return this._rungPasses();
    if (this.bloom && this.q.bloom && this.settings.bloom) this.bloom.enabled = true;
    if (this.gtao) this.gtao.enabled = true;
  }

  // Lowest dynamic scale: never below 0.75 of CSS-pixel density, so Retina screens (preset density > 1) can give
  // more back.
  //
  // Touch devices get no reduction at all, because on them the trade is close to pure loss: this scene is
  // vertex-bound, not fill-bound, so quadrupling the pixel count (0.5 -> 1.0) measured only 42 -> 39 fps, while the
  // halved density is immediately visible as blur on a 3x screen. Reducing resolution bought ~3 frames and cost the
  // whole image.
  dynFloor() {
    return densityFloor(this.q, this.touch, window.devicePixelRatio || 1, window.innerWidth, window.innerHeight);
  }
  // the render density before the dynamic scale (config.js renderDensity: the tier's cap; an Apple touch device's sharper
  // ratio inside its pixel budget)
  // (with the live ladder: the rung's budget on this screen — render-gov.js rungDensity)
  _density() {
    const d = window.devicePixelRatio || 1, w = window.innerWidth, h = window.innerHeight;
    return this.rung != null ? rungDensity(this.rung, d, w, h) : renderDensity(this.q, d, w, h);
  }
  // frames still miss at the lowest density: shed the bloom the Apple default turned on (main.js _dynRes; a pass flag, no
  // program changes). A quality change brings it back (applySettings).
  shedBloom() {
    if (!this.q.apple || this.bloomShed || !this.bloom || !this.bloom.enabled) return false;
    this.bloomShed = true; this.bloom.enabled = false;
    return true;
  }

  // Dynamic resolution (never on ultra): scale the render density between dynFloor() and 1 of the quality preset.
  setDynamicScale(s) {
    s = Math.max(this.dynFloor(), Math.min(1, s));
    if (Math.abs(s - this.dynScale) < 0.01) return;
    this.dynScale = s;
    const pr = this._density() * s;
    this.renderer.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this._w, this._h);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);   // (every pass, the AO's at its own scale — a second gtao.setSize(w, h) here used to drop it to CSS pixels)
    this.grade.uniforms.uAspect.value = w / h;
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  // Shadow casters: three draws them all with one depth material, which re-derives its whole program (parameters, key) each time
  // the caster kind changes — instanced, plain, skinned: ~9 times a frame in a level (LEARN §50). One depth material per kind
  // instead (same programs: three's cache shares them by key). A caster that needs three's own per-material copy (alpha-tested,
  // displaced, clipped, alpha-to-coverage, morphed) keeps it, and so does one with a depth material of its own (cloth, flags).
  // Checked every 60 frames and on a new scene: casters come and go, materials change.
  _depthKinds() {
    const sc = this.scene;
    if (!sc || !this.renderer.shadowMap.enabled) return;
    const D = this._depthMats || (this._depthMats = {});
    sc.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      const cur = o.customDepthMaterial;
      if (cur !== undefined && !(cur && cur.userData.iwKind)) return;
      const m = o.material, g = o.geometry;
      let k = null;
      if ((o.isInstancedMesh || o.isSkinnedMesh) && m && !Array.isArray(m) && !(m.alphaTest > 0 && (m.map || m.alphaMap)) && !m.alphaToCoverage &&
          !(m.displacementMap && m.displacementScale !== 0) && !(m.clipShadows && m.clippingPlanes && m.clippingPlanes.length) &&
          !(g && g.morphAttributes && (g.morphAttributes.position || g.morphAttributes.normal || g.morphAttributes.color))) {
        k = o.isInstancedMesh ? 'inst' + (o.instanceColor ? '+color' : '') + (o.morphTexture ? '+morph' : '') : 'skin';
      }
      if (!k) { if (cur !== undefined) o.customDepthMaterial = undefined; return; }
      let d = D[k];
      if (!d) { d = D[k] = new THREE.MeshDepthMaterial(); d.name = 'iw-depth-' + k; d.userData.iwKind = k; }
      if (cur !== d) o.customDepthMaterial = d;
    });
  }

  render() {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this._sizeDirty || now - this._sizeT > 1000) { this._sizeDirty = false; this._sizeT = now; this.resize(); }
    if (this.scene !== this._depthScene || !(++this._depthN < 60)) { this._depthScene = this.scene; this._depthN = 0; this._depthKinds(); }
    // colour grade recommended by the environment theme (day / dusk)
    const gr = G.env && G.env.grade;
    if (gr && gr !== this._gradeSrc && this.grade) {
      this._gradeSrc = gr;
      const u = this.grade.uniforms;
      for (const k of ['uSat', 'uVib', 'uContrast', 'uLift', 'uVignette', 'uExposure']) u[k].value = gr[k] ?? GradeShader.uniforms[k].value;
      u.uShadowTint.value.set(...(gr.uShadowTint || [0.975, 0.99, 1.035]));
      u.uHighTint.value.set(...(gr.uHighTint || [1.025, 1.0, 0.972]));
      // bloom per theme: [strength, radius, threshold] — dusk lets lamps / lit windows bloom, daylight keeps it to the sun
      const bl = gr.bloom || BLOOM;
      this.bloom.strength = bl[0]; this.bloom.radius = bl[1]; this.bloom.threshold = bl[2];
    }
    const u = this.grade.uniforms;
    u.uBloomOn.value = this.bloom.enabled ? 1 : 0;
    // (the output step: in the screen FX while it is on, else in the grade — only where SMAA comes after; mergeOut)
    const fx = this.extraPass && this.extraPass.uniforms && this.extraPass.uniforms.uOut ? this.extraPass.uniforms : null, fxOn = !!(fx && this.extraPass.enabled);
    u.uOut.value = this.mergeOut && !fxOn ? 1 : 0; u.uToneExp.value = this.renderer.toneMappingExposure;
    if (fx) { fx.uOut.value = this.mergeOut && fxOn ? 1 : 0; fx.uToneExp.value = this.renderer.toneMappingExposure; }
    // the scene's world matrices once for the whole frame: each of its renders (the main pass, the AO's normals, the harbour's
    // reflection) used to walk the whole tree again (LEARN §50); nothing moves between them
    const sc = this.scene, auto = sc ? sc.matrixWorldAutoUpdate : false;
    if (sc && auto) { sc.updateMatrixWorld(); sc.matrixWorldAutoUpdate = false; }
    try {
      // the harbour's planar reflection, before the frame and not inside it (it used to render from the sea's onBeforeRender, in
      // the main pass: a nested render has lights of its own in three, with another version number — every lit material drawn
      // in both then rebuilt its program parameters twice a frame; LEARN §50)
      G.env?.renderReflection?.(this.renderer, sc, this.camera);
      this.composer.render();
    } finally { if (sc && auto) sc.matrixWorldAutoUpdate = true; }
  }
}

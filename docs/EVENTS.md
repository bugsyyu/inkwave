# Game event bus

`import { on, emit, G } from '../core/ctx.js'` — `on(name, fn)` returns an unsubscribe function. Effects, HUD and
screen-FX modules should subscribe to these instead of editing gameplay code.

## Emitted today
| event | payload | where |
|---|---|---|
| `hit` | `{ attacker, victim, damage, killed, weaponId }` | weapons.js applyHit / storm |
| `damage` | `{ victim, attacker, amount, source }` | actor.damage |
| `splatted` | `{ victim, attacker, cause }` (cause: weapon id, 'water', …) | actor.splat |
| `respawn` | `{ actor }` | actor.respawn |
| `special:ready` | `{ actor }` | actor.addTurf |
| `special:use` | `{ actor, id }` ('slam' / 'storm') | actor._startSpecial |
| `superjump` | `{ actor, phase: 'charge' \| 'flight', to? }` | actor.superJump |
| `shake` | `{ amount, pos? }` | camera trauma requests |
| `recoil` | `{ amount }` | local-player visual recoil |
| `lowink` | `{ actor, need? }` | weapons |
| `match:state` | `{ state, match }` ('intro','playing','finish','judge','results') | match.js |
| `match:oneminute` / `match:count` | `{}` / `{ n }` | match.js |
| `actor:<name>` | `{ actor, surface, ...data }` — re-emitted from `character.onEvent(name, data)`; surface 0 dry · 1 own ink · 2 enemy ink | actor.js wiring |

## To add
| event | payload |
|---|---|
| `actor:jump` | `{ actor, surface, swim }` |
| `actor:land` | `{ actor, speed, surface, pos }` |
| `actor:form` | `{ actor, form: 'kid' \| 'squid', surface }` |
| `actor:dive` / `actor:emerge` | `{ actor, pos, speed }` (squid enters / leaves own ink) |
| `actor:climb` | `{ actor, on }` |
| `actor:enemyInk` | `{ actor, on }` |
| `weapon:fire` | `{ actor, weapon, muzzle, dir, charge? }` |
| `weapon:impact` | `{ pos, normal, team, kind, radius }` (kind: 'shot','blast','drop','charger','roll') |
| `bomb:throw` / `bomb:arm` / `bomb:explode` | `{ actor?, pos, team, radius? }` |
| `special:slam` | `{ actor, pos, radius }` |
| `storm:start` / `storm:end` | `{ pos, team }` |
| `superjump:land` | `{ actor, pos }` |
| `turf` | `{ actor, area }` (every claimed chunk; aggregate yourself) |

## Character → actor` inside character.js)
| name | data |
|---|---|
| `footstep` | `{ foot: 'L' \| 'R', pos: THREE.Vector3 (world, copy it) , speed }` at each foot plant |
| `handplant` (optional) | `{ pos }` roller/charger heavy moments |

## Audio (lead-owned, src/audio/audio.js)
- The lead plays footstep sounds on `actor:footstep` (surface-aware: `step_dry`, `step_ink`, `step_enemy`) and runs the
  harbour ambience (`harbor_ambience` loop + random `gull` cries). Don't duplicate these.
- Extra SFX names available to everyone via `G.audio.play(name, { pos, volume, pitch })`: `step_dry`, `step_ink`,
  `step_enemy`, `ink_drip`, `gull`, `harbor_ambience` (loop) — plus the full list in docs/CONTRACTS.md §2.
- Need a new sound? Add a def in src/audio/audio.js and list it in SFX_GROUPS.

## Added since upstream 1.0 (this fork)
Specials, subs and Zone Control emit these on top of the table above. `actor:dive`, `footstep` and `handplant` are no
longer emitted.

| event | payload | where |
|---|---|---|
| `actor:cheer` | `{ actor, helped }` | specials.js (Cheer Orb) |
| `actor:dodge` / `weapon:dodge` | `{ actor, dir }` / `{ actor, pos, dir }` | weapons.js (Twins dodge roll) |
| `actor:poisoned` / `actor:tracked` | `{ actor }` / `{ actor, team }` | subs.js (poison / point sensor) |
| `bomb:arm` / `bomb:explode` | `{ actor, pos, team, radius }` | subs.js |
| `match:count` | `{ n }` (final countdown) | match.js |
| `special:start` / `special:end` | `{ actor, id }` / `{ actor, id, reason }` | specials.js |
| `special:launch` / `special:sonar` / `special:shield` | `{ actor, to }` / `{ actor, pos }` / `{ actor, time }` | specials.js |
| `special:strike` / `special:wail` | `{ actor, pos, radius }` / `{ actor, pos, dir }` | specials.js |
| `storm:end` | `{ pos, team, actor }` | weapons.js |
| `sub:use` | `{ actor, kind }` | subs.js |
| `sub:land` / `sub:arm` / `sub:cloud` / `sub:destroyed` | `{ kind, pos, team, radius? }` | subs.js |
| `sub:charge` | `{ actor, kind: 'shaker', level, max }` — the Shaker Bomb in hand reached a new charge (2, then 3 = max) | kits/shaker.js |
| `sub:lock` / `sub:end` | `{ kind: 'waddle', pos, team, actor, target }` / `{ kind, why, team, pos }` (why: reached · travel · life · lost · stuck · fuse · popped · sea · fell · cleared) | kits/waddle.js |
| `zones:zone` | `{ zone, owner }` — one zone taken (≥ 80 % ink); it is then flooded with the taker's ink | zones.js |
| `zones:control` | `{ owner, prev, objective }` — the live objective's holder changed (owner −1 = neutral) | zones.js |
| `zones:contest` | `{ zone, holder, share }` — the other team has inked a held zone to the warning share (ZONES.warn) | zones.js |
| `zones:penalty` | `{ team, penalty, total, start, end }` | zones.js |
| `zones:active` | `{ objective, zones, final, moved }` — rotation (final = the last-30-s centre lock) | zones.js |
| `zones:overtime` | `{ losing }` | zones.js |
| `zones:end` | `{ winner, reason, counts }` (reason: knockout · time · comeback · retake · neutralised · overtime-cap) | zones.js |

## 关卡学习 (docs/LEARN.md; src/learn/flow.js)
A learning level (`match.mode === 'learn'`) emits these; `match.learn.log` keeps the same records in order for audits.

| event | payload | where |
|---|---|---|
| `learn:gate` | `{ id, index, total, locks, opened }` — she reached a gate (`opened: false`, the match is now held for its questions) / the gate opened (`opened: true`, the ink trail runs on to the next one) | learn/flow.js |
| `learn:question` | `{ itemId, gate, type: 'typed' \| 'choice', form: 'normal' \| 'alt' }` — a question is up in the learn layer (`alt`: the same item re-asked in its other form after a miss) | learn/flow.js |
| `learn:answer` | `{ itemId, ok, first, gate }` — judged; `first` = this was the day's first answer for the item (the one the store / memory model counts) | learn/flow.js |
| `learn:done` | `{ done, total, due, firsts, locks, week, day }` — the last gate opened; `due` = `[{ en, zh }]` of the words the store says are due | learn/flow.js |

### 双人联机赛 / 双人成形合作赛（docs/LEARN.md §14; src/learn/forms/versus2.js, coop2.js）
The two-player online forms keep the same records in `match.learn.log` on every screen (each screen logs what it saw).

| event | payload | where |
|---|---|---|
| `learn:question` | versus2 `{ itemId, q, type, form }` · coop2 adds `{ gate, role: 'clue' \| 'hands' }` — the same question opened on every screen | versus2.js / coop2.js |
| `learn:answer` | versus2 `{ itemId, ok, first, q, ms }` (`none: true` = time ran out, nothing recorded) · coop2 `{ itemId, ok, first, gate, by, q, role }` (`first` only on the screen that answered) | versus2.js / coop2.js |
| `learn:ink` | `{ q, team, by, radius, at, cells, share }` — versus2: the first right answer's side flooded the live zone (every screen applies the host's record) | versus2.js |
| `learn:close` | `{ q, win, by, res }` — versus2: the question closed (`res: [[playerId, 1 \| 0 \| -1]…]`) | versus2.js |
| `learn:gate` | as above — coop2: `opened: false` when both pads are held and the host declared it | coop2.js |
| `learn:done` | versus2 `{ form, week, day, asked, right, firsts, firstRight, wins }` (the match left `playing`) · coop2 `{ done, total, firsts, locks, week, day, form, mine, pair, left }` | versus2.js / coop2.js |


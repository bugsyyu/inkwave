// gf-weeks (docs/LEARN.md §44): the audits' --pack <week.json> — a made-up account on the audited page's origin holding
// that course pack, so a week past content/ plays from it (src/learn/weeks.js). Written once (only when no account is
// there yet: the evidence a whole day's segments push into it carries on); her clock is the device's (tz 'device'), so an
// audit that dates leaves on the device's clock agrees. Never her data: the week comes from the file named.
import fs from 'node:fs';

export async function packAccount(ctx, file) {
  if (!file) return;
  const week = JSON.parse(fs.readFileSync(file, 'utf8'));
  await ctx.addInitScript((w) => {
    try {
      if (localStorage.getItem('ielts-workbench:data:v1')) return;
      localStorage.setItem('ielts-workbench:data:v1', JSON.stringify({ profile: { v: 1, setup: true, startDate: '2026-09-21', cp: {}, ci: {} }, packs: { [w.id]: { week: w, at: '2026-10-19' } } }));
      localStorage.setItem('ielts-workbench:prefs:v1', JSON.stringify({ tz: 'device' }));
    } catch (e) { /* none */ }
  }, week);
}

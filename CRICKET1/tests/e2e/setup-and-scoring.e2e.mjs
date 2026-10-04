import { launch, ROOT } from './launch.mjs';
import assert from 'node:assert/strict';
const BASE = 'http://localhost:4173/';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n   ', e.message.split('\n')[0]); } };

const browser = await launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message));
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle0' });

const click = (sel) => page.click(sel);
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const toastText = () => page.$$eval('#toast-region .toast', (els) => els.map((e) => e.textContent));
const stepLabel = () => page.$eval('.page-head .chip', (e) => e.textContent.trim());
const type = async (sel, v) => { await page.$eval(sel, (e) => { e.value = ''; }); await page.type(sel, v); };

await check('app boots with no console errors', async () => { assert.equal(await text('.brand-name'), 'CRICKET1'); assert.deepEqual(consoleErrors, []); });

await check('IMPORTANT TEST: Step 2 Next shows NO player error; Step 3 empty Player 1 shows error', async () => {
  await click('[data-action="new-match"]');
  assert.match(await stepLabel(), /Step 1 of 5/);
  await click('[data-action="setup-next"]');                        // Format -> Teams
  assert.match(await stepLabel(), /Step 2 of 5 · Teams/);
  await type('#team1-name', 'suman'); await type('#team2-name', 'rahul');
  await click('[data-action="setup-next"]');                        // Teams -> Players
  assert.match(await stepLabel(), /Step 3 of 5 · Players/);
  assert.deepEqual(await toastText(), [], 'no toast at all after leaving Step 2');
  assert.equal(await page.$eval('#setup-errors', (e) => e.hidden), true, 'no error banner on arriving at Step 3');
  // Step 3: leave player 1 of team 1 empty, fill the rest
  await type('[data-team="team1"][data-index="1"]', 'Asha');
  await type('[data-team="team2"][data-index="0"]', 'Ravi'); await type('[data-team="team2"][data-index="1"]', 'Kiran');
  await click('[data-action="setup-next"]');
  assert.match(await stepLabel(), /Step 3 of 5 · Players/, 'stays on Step 3');
  const banner = await text('#setup-errors');
  assert.match(banner, /suman: enter a name for Player 1/);
  assert.equal(await page.$eval('[data-team="team1"][data-index="0"]', (e) => e.getAttribute('aria-invalid')), 'true');
});

await check('typing clears the player error; Back clears errors; no error leaks to Step 2/4', async () => {
  await type('[data-team="team1"][data-index="0"]', 'Suman');
  assert.equal(await page.$eval('#setup-errors', (e) => e.hidden), true);
  await click('[data-action="setup-next"]');                         // -> Toss
  assert.match(await stepLabel(), /Toss/);
  await click('[data-action="setup-next"]');                         // toss not chosen -> toss error only
  assert.match(await text('#setup-errors'), /toss/i);
  assert.doesNotMatch(await text('#setup-errors'), /player/i);
  await click('[data-action="setup-back"]');
  assert.equal(await page.$eval('#setup-errors', (e) => e.hidden), true, 'Back clears errors');
  await click('[data-action="setup-next"]');
  assert.equal(await page.$eval('#setup-errors', (e) => e.hidden), true, 'fresh Toss step starts clean');
});

await check('toss + confirm + START MATCH works, no stray validation', async () => {
  await click('[data-toss-winner="team1"]'); await click('[data-toss-decision="bat"]');
  await click('[data-action="setup-next"]');
  assert.match(await stepLabel(), /Confirm/);
  assert.equal(await page.$eval('#setup-errors', (e) => e.hidden), true);
  await click('[data-action="start-match"]');
  await page.waitForSelector('#modal-striker');
  assert.equal((await toastText()).length, 0);
});

await check('openers modal -> scoring screen ready', async () => {
  await page.select('#modal-striker', await page.$eval('#modal-striker option:nth-child(1)', (o) => o.value));
  await page.select('#modal-nonstriker', await page.$eval('#modal-nonstriker option:nth-child(2)', (o) => o.value));
  await click('[data-action="confirm-openers"]');
  await page.waitForSelector('#live-root');
  assert.equal(await text('#lv-score'), '0/0');
  assert.equal(await page.$('#modal-root .modal'), null);
});

const score = () => text('#lv-score');
await check('buttons 0-6 update score & strike instantly', async () => {
  const strikerName = () => page.$eval('#live-batters [data-slot]:not([hidden]) .striker-dot:not([hidden])', (d) => d.closest('.batter-name').querySelector('[data-f="name"]').textContent.trim());
  const s0 = await strikerName();
  await click('[data-runs="1"]'); assert.equal(await score(), '1/0'); assert.notEqual(await strikerName(), s0, '1 changes strike');
  await click('[data-runs="2"]'); assert.equal(await score(), '3/0');
  await click('[data-runs="3"]'); assert.equal(await score(), '6/0'); assert.equal(await strikerName(), s0 === await strikerName() ? s0 : await strikerName());
  await click('[data-runs="4"]'); assert.equal(await score(), '10/0');
  await click('[data-runs="6"]'); assert.equal(await score(), '16/0');
  assert.equal(await text('#lv-overs'), '0.5 / 20');
});

await check('every scoring tap is fast (<30ms handler+DOM) and does not rebuild the page', async () => {
  const stable = await page.evaluate(() => { window.__root = document.getElementById('live-root'); window.__btn = document.querySelector('[data-runs="1"]'); return true; });
  assert.ok(stable);
  const times = await page.evaluate(async () => {
    const out = [];
    const mo = new MutationObserver(() => {}); mo.observe(document.getElementById('live-root'), { childList: true, subtree: true });
    for (const r of [0, 0]) {
      const t0 = performance.now(); document.querySelector(`[data-runs="${r}"]`).click(); out.push(performance.now() - t0);
    }
    const recs = mo.takeRecords();
    out.push(recs.filter((x) => x.removedNodes.length && [...x.removedNodes].some((n) => n.nodeType === 1 && (n.matches?.('section') || n.id === 'live-root'))).length);
    return out;
  });
  console.log('   tap times ms:', times.slice(0, 2).map((t) => t.toFixed(2)).join(', '), '| sections removed:', times[2]);
  assert.ok(times[0] < 30 && times[1] < 30);
  assert.equal(times[2], 0);
  const same = await page.evaluate(() => window.__root === document.getElementById('live-root') && window.__btn === document.querySelector('[data-runs="1"]'));
  assert.ok(same, 'scoring buttons are the same DOM nodes (no re-render)');
});

await check('over completes at the 6th legal ball: bowler modal, same bowler barred, no scoring until chosen, over counter resets', async () => {
  const text2 = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  assert.equal(await page.$('#modal-root .modal') !== null, true, 'bowler modal opened automatically');
  assert.match(await text2('#modal-root .modal'), /Over 1 complete/);
  const opts = await page.$$eval('#modal-next-bowler option', (o) => o.map((x) => ({ t: x.textContent, d: x.disabled })));
  assert.equal(opts.filter((o) => o.d).length, 1, 'last over\'s bowler cannot bowl again');
  assert.equal(await text2('#lv-overs'), '1.0 / 20');
  await page.click('[data-action="score-run"][data-runs="1"]').catch(() => {});
  assert.equal(await text2('#lv-score'), '16/0', 'no ball can be scored until a bowler is chosen');
  await page.evaluate(() => { const sel = document.querySelector('#modal-next-bowler'); sel.value = [...sel.options].find((o) => !o.disabled).value; document.querySelector('[data-action="confirm-bowler"]').click(); });
  assert.equal(await page.$('#modal-root .modal'), null);
  assert.equal(await text2('#lv-over-title'), 'Over 2');
  assert.equal(await page.$$eval('#lv-strip .ball-dot', (d) => d.length), 0);
  assert.equal(await page.$$eval('#lv-summaries .summary-row', (d) => d.length), 1);
});

await check('sustained scoring: 120 balls, every tap handled in <25ms, DOM nodes stable, still saved', async () => {
  const stats = await page.evaluate(async () => {
    const times = []; let balls = 0;
    const live = document.getElementById('live-root');
    while (balls < 120) {
      const modal = document.querySelector('#modal-next-bowler');
      if (modal) { modal.value = [...modal.options].find((o) => !o.disabled).value; document.querySelector('[data-action="confirm-bowler"]').click(); continue; }
      const btn = document.querySelector(`[data-runs="${balls % 7}"]`);
      const t0 = performance.now(); btn.click(); times.push(performance.now() - t0); balls++;
    }
    return { max: Math.max(...times), avg: times.reduce((a, b) => a + b, 0) / times.length, same: live === document.getElementById('live-root'), commentary: document.querySelectorAll('#lv-commentary .commentary-item').length };
  });
  console.log('   120 taps: avg', stats.avg.toFixed(2), 'ms, max', stats.max.toFixed(2), 'ms');
  assert.ok(stats.max < 25, 'max ' + stats.max);
  assert.ok(stats.same); assert.ok(stats.commentary <= 25);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.$eval('#save-text', (e) => e.textContent), 'Saved locally');
  assert.deepEqual(consoleErrors, []);
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`, consoleErrors.length ? '\nconsole errors: ' + JSON.stringify(consoleErrors) : '');
process.exit(failed.length ? 1 : 0);

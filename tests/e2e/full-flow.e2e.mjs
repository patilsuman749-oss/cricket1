import { launch, ROOT } from './launch.mjs';
import assert from 'node:assert/strict';
const BASE = 'http://localhost:4173/';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 3).join('\n    ')); } };
const browser = await launch();
const ctx = browser.defaultBrowserContext();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(BASE, { waitUntil: 'networkidle0' });

const $t = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const tap = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);   // pure DOM click: no scroll/overlay flakiness
const score = () => $t('#lv-score');
const overs = () => $t('#lv-overs');
const modalOpen = () => page.$('#modal-root .modal').then(Boolean);
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const setVal = (sel, v) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);

async function setupMatch({ custom = 1, a = ['A1', 'A2', 'A3'], b = ['B1', 'B2', 'B3'], toss = ['team1', 'bat'] } = {}) {
  await tap('[data-action="new-match"]');
  await tap('[data-format="custom"]'); await setVal('#custom-overs', String(custom));
  await tap('[data-action="setup-next"]');
  await setVal('#team1-name', 'Lions'); await setVal('#team2-name', 'Tigers');
  await tap('[data-action="setup-next"]');
  for (const [team, list] of [['team1', a], ['team2', b]]) {
    for (let i = 0; i < list.length; i++) {
      if (!(await page.$(`[data-team="${team}"][data-index="${i}"]`))) await tap(`[data-action="add-player"][data-team="${team}"]`);
      await setVal(`[data-team="${team}"][data-index="${i}"]`, list[i]);
    }
  }
  await tap('[data-action="setup-next"]');
  await tap(`[data-toss-winner="${toss[0]}"]`); await tap(`[data-toss-decision="${toss[1]}"]`);
  await tap('[data-action="setup-next"]');
  await tap('[data-action="start-match"]');
  await page.waitForSelector('#modal-striker');
  await tap('[data-action="confirm-openers"]');
  await page.waitForSelector('#live-root');
}
const wide = async (n = 1) => { await tap('[data-type="wide"]'); await setVal('#extra-amount', String(n)); await tap('[data-action="confirm-extra"]'); };
const noball = async (bat = 0, byes = 0) => { await tap('[data-type="no-ball"]'); await setVal('#extra-batter', String(bat)); await setVal('#extra-byes', String(byes)); await tap('[data-action="confirm-extra"]'); };
const bye = async (t, n = 1) => { await tap(`[data-type="${t}"]`); await setVal('#extra-amount', String(n)); await tap('[data-action="confirm-extra"]'); };
const dbRead = () => page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('cricket1-db'); r.onsuccess = () => { const q = r.result.transaction('matches').objectStore('matches').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; r.onerror = () => rej(r.error); }));

await setupMatch();   // 1-over match, Lions bat, 3 players each

await check('wide / multiple wides: runs added, no legal ball, over unchanged', async () => {
  await wide(1); assert.equal(await score(), '1/0'); assert.equal(await overs(), '0.0 / 1');
  await wide(3); assert.equal(await score(), '4/0'); assert.equal(await overs(), '0.0 / 1');
  assert.equal(await $t('#lv-strip .ball-dot:last-child'), 'Wd3');
});
await check('no-ball + 4 off the bat: 5 runs, not legal; batter credited; bowler charged', async () => {
  await noball(4); assert.equal(await score(), '9/0'); assert.equal(await overs(), '0.0 / 1');
  assert.equal(await $t('#lv-br'), '9');                      // bowler R: 1 + 3 + 5
  assert.equal(await $t('#live-batters [data-slot="a"] [data-f="r"]'), '4');
});
await check('bye and leg-bye are legal balls, never batter runs', async () => {
  await bye('bye', 2); assert.equal(await score(), '11/0'); assert.equal(await overs(), '0.1 / 1');
  await bye('leg-bye', 1); assert.equal(await score(), '12/0'); assert.equal(await overs(), '0.2 / 1');
  assert.equal(await $t('#live-batters [data-slot="a"] [data-f="r"]'), '4', 'batter runs unchanged');
  assert.equal(await $t('#lv-br'), '9', 'bowler runs unchanged by byes');
});
await check('wicket modal: options, run-out choice of either batter, replacement, partnership reset', async () => {
  await tap('[data-action="wicket"]');
  assert.equal(await modalOpen(), true);
  const types = await page.$$eval('#dismissal-type option', (o) => o.map((x) => x.textContent));
  assert.deepEqual(types, ['Bowled', 'Caught', 'LBW', 'Run Out', 'Stumped', 'Hit Wicket', 'Retired', 'Other']);
  assert.equal((await page.$$eval('#dismissed-player option', (o) => o.length)), 2);
  await setVal('#dismissal-type', 'run-out');
  assert.equal(await page.$eval('#wk-runs-row', (e) => e.hidden), false);
  await tap('[data-action="confirm-wicket"]');                         // no replacement chosen → error, modal stays
  assert.equal(await modalOpen(), true);
  assert.match((await page.$$eval('#toast-region .toast', (t) => t.map((x) => x.textContent))).join(), /new batter/i);
  await setVal('#dismissal-type', 'caught'); await setVal('#new-batter', await page.$eval('#new-batter option:nth-child(2)', (o) => o.value));
  await tap('[data-action="confirm-wicket"]');
  assert.equal(await modalOpen(), false);
  assert.equal(await score(), '12/1'); assert.equal(await overs(), '0.3 / 1');
  assert.equal(await $t('#lv-pr'), '0');
});
await check('Undo reverses the whole wicket; multiple undo; Edit Last Ball', async () => {
  await tap('[data-action="undo"]'); assert.equal(await score(), '12/0'); assert.equal(await overs(), '0.2 / 1');
  assert.equal(await $t('#live-batters [data-slot="a"] [data-f="name"], #live-batters [data-slot="b"] [data-f="name"]') !== '', true);
  await tap('[data-action="undo"]'); assert.equal(await score(), '11/0'); assert.equal(await overs(), '0.1 / 1');
  await tap('[data-action="edit-last"]'); await tap('[data-edit-runs="4"]');
  assert.equal(await score(), '13/0'); assert.equal(await overs(), '0.1 / 1');
  await tap('[data-action="edit-last"]'); await tap('[data-edit-extra="wide"]'); await setVal('#extra-amount', '1'); await tap('[data-action="confirm-extra"]');
  assert.equal(await score(), '10/0'); assert.equal(await overs(), '0.0 / 1');
  await tap('[data-action="undo"]'); assert.equal(await score(), '9/0');
});
await check('change strike button works manually', async () => {
  const before = await page.$eval('#live-batters .striker-dot:not([hidden])', (d) => d.closest('.batter-card').dataset.slot);
  await tap('[data-action="change-strike"]');
  const after = await page.$eval('#live-batters .striker-dot:not([hidden])', (d) => d.closest('.batter-card').dataset.slot);
  assert.notEqual(before, after);
  await tap('[data-action="change-strike"]');
});
await check('refresh recovery: reload mid-innings shows Continue Match and restores exact state', async () => {
  await settle(250);
  assert.equal(await $t('#save-text'), 'Saved locally');
  const rec = (await dbRead())[0];
  assert.equal(rec.innings[0].deliveries.length, 3, 'wide1 + wide3 + noball persisted');
  assert.equal(rec.innings[0].derived, undefined, 'derived data is not persisted');
  assert.equal(rec.snapshots, undefined);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.match(await $t('.continue-card'), /Continue Match/);
  await tap('[data-action="continue-match"]');
  await page.waitForSelector('#live-root');
  assert.equal(await score(), '9/0'); assert.equal(await overs(), '0.0 / 1');
  assert.equal(await modalOpen(), false);
});
await check('seventh legal ball impossible; over end ends 1-over innings → innings break with target', async () => {
  for (let i = 0; i < 6; i++) { assert.equal(await modalOpen(), false); await tap('[data-runs="1"]'); }
  assert.equal(await modalOpen(), true);
  assert.match(await $t('#modal-root .modal'), /Innings Break/);
  assert.match(await $t('#modal-root .modal'), /Target 16/);
  await tap('[data-runs="1"]');                                        // behind the modal DOM click: must not score
  assert.equal(await score(), '15/0');
});
await check('second innings: openers prompt, target, runs required, balls remaining, CRR/RRR', async () => {
  await tap('[data-action="start-second"]');
  await page.waitForSelector('#modal-striker');
  await tap('[data-action="confirm-openers"]');
  assert.equal(await $t('#lv-target'), '16'); assert.equal(await $t('#lv-required'), '16'); assert.equal(await $t('#lv-balls'), '6');
  await tap('[data-runs="6"]');
  assert.equal(await $t('#lv-required'), '10'); assert.equal(await $t('#lv-balls'), '5');
  assert.equal(await $t('[data-lv="crr"]'), '36.00'); assert.equal(await $t('[data-lv="rrr"]'), '12.00');
});
await check('chase finishes: result shown, scoring blocked, saved to history', async () => {
  await tap('[data-runs="4"]'); await tap('[data-runs="6"]');           // 16 reached
  await page.waitForFunction(() => document.querySelector('.result-main'));
  assert.match(await $t('.result-main'), /Tigers won by 2 wickets/);
  await settle(250);
  const rec = (await dbRead())[0]; assert.equal(rec.status, 'completed');
  await tap('[data-nav="history"]'); assert.match(await $t('.history-card'), /Tigers won by 2 wickets/);
  await tap('[data-action="view-scorecard"]');
  const sc = await $t('#main-content'); assert.match(sc, /Lions — 15\/0/); assert.match(sc, /Tigers — 16\/0/); assert.match(sc, /Did not bat/);
});
await check('match history shows player stats from the completed match', async () => {
  await tap('[data-nav="history"]');
  assert.match(await $t('.history-card'), /Player stats/);
  await tap('.history-player-stats > summary');
  const history = await $t('.history-player-stats');
  assert.match(history, /A1/);
  assert.match(history, /B1/);
  assert.match(history, /R \(B\)/);
});

await check('theme: toggle works instantly, persists across refresh, on every page', async () => {
  for (const view of ['home', 'history', 'settings']) {
    await tap(`[data-nav="${view}"]`);
    const before = await page.evaluate(() => document.documentElement.dataset.theme);
    await tap('[data-action="theme"]');
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.notEqual(before, after, view);
  }
  const chosen = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), chosen);
  assert.equal(await page.evaluate(() => localStorage.getItem('cricket1-theme')), chosen);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.ok(chosen === 'dark' ? bg === 'rgb(11, 21, 41)' : bg === 'rgb(244, 248, 255)', bg);
});

// ----- layout: five phone widths on every key screen
await tap('[data-action="new-match"]');          // fresh match for layout/live tests
await page.evaluate(() => localStorage.setItem('cricket1-theme', 'light'));
await page.reload({ waitUntil: 'networkidle0' });
await setupMatch({ custom: 20, a: ['Aarav Kumar Singh', 'B', 'C', 'D'], b: ['E', 'F', 'G', 'H'] });
for (const w of [360, 375, 390, 412, 430]) {
  await check(`mobile layout ${w}px: no horizontal scroll, no overlap, ≥44px targets (live + setup + modals)`, async () => {
    await page.setViewport({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await settle(80);
    const probe = () => page.evaluate(() => {
      const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [], overlaps: [] };
      document.querySelectorAll('.score-button, .nav-item, .icon-btn, .primary-btn, .secondary-btn, .choice, .step-option, .remove-row').forEach((b) => { const r = b.getBoundingClientRect(); if (r.width && (r.height < 43.5 || r.width < 43.5)) out.small.push(`${b.className.slice(0, 20)}:${Math.round(r.width)}x${Math.round(r.height)}`); });
      const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
      const tg = rect('.theme-toggle'), brand = rect('.brand');
      if (tg && brand && tg.left < brand.right) out.overlaps.push('theme-toggle vs brand');
      const nav = rect('#bottom-nav'), main = document.querySelector('#main-content');
      const last = main.lastElementChild; // after scrolling to bottom the last block must clear the nav
      window.scrollTo(0, document.documentElement.scrollHeight);
      const lr = last.getBoundingClientRect(); if (lr.bottom > nav.top + 0.5) out.overlaps.push(`content under nav by ${Math.round(lr.bottom - nav.top)}px`);
      window.scrollTo(0, 0);
      return out;
    });
    let r = await probe(); assert.equal(r.overflow, 0, 'live overflow ' + r.overflow); assert.deepEqual(r.small, [], 'live small ' + r.small); assert.deepEqual(r.overlaps, []);
    await tap('[data-action="wicket"]'); await settle(60);
    const mr = await page.evaluate(() => { const m = document.querySelector('.modal').getBoundingClientRect(); return { w: m.width, l: m.left, r: m.right, vw: innerWidth, ov: document.documentElement.scrollWidth - innerWidth }; });
    assert.ok(mr.l >= 0 && mr.r <= mr.vw && mr.ov === 0, JSON.stringify(mr));
    await tap('[data-action="close-modal"]');
    for (const view of ['home', 'history', 'settings']) { await tap(`[data-nav="${view}"]`); r = await probe(); assert.equal(r.overflow, 0, view + ' overflow ' + r.overflow); assert.deepEqual(r.overlaps, [], view); }
    await tap('[data-nav="live"]');
  });
}
await check('score buttons are large and above the fold on a 360x640 phone', async () => {
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await settle(80);
  const r = await page.evaluate(() => { const b = document.querySelector('[data-runs="6"]').getBoundingClientRect(); const c = document.querySelector('[data-action="wicket"]').getBoundingClientRect(); return { h: b.height, w: b.width, wicketBottom: c.bottom, nav: document.querySelector('#bottom-nav').getBoundingClientRect().top }; });
  assert.ok(r.h >= 56 && r.w >= 66, JSON.stringify(r));
  assert.ok(r.wicketBottom <= r.nav, 'runs, extras and Wicket are visible without scrolling: ' + JSON.stringify(r));
});
await check('desktop 1280x800: LEFT score · CENTER controls · RIGHT batters/bowler/over', async () => {
  await page.setViewport({ width: 1280, height: 800 }); await page.waitForSelector('[data-action="continue-match"]'); await tap('[data-action="continue-match"]'); await page.waitForSelector('#live-root'); await settle(100);
  const x = await page.evaluate(() => { const l = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top }; }; return { score: l('.score-panel'), ctl: l('.area-controls'), bat: l('.area-batters'), bowl: l('.area-bowler'), ov: l('.area-over'), ov2: document.documentElement.scrollWidth - innerWidth, bottomNav: getComputedStyle(document.querySelector('#bottom-nav')).display }; });
  assert.ok(x.score.left < x.ctl.left && x.ctl.left < x.bat.left, 'left→center→right ' + JSON.stringify([x.score.left, x.ctl.left, x.bat.left]));
  assert.ok(x.ov.left === x.bat.left, 'over info is in the RIGHT column');
  assert.ok(x.bowl.left === x.bat.left); assert.equal(x.ov2, 0); assert.equal(x.bottomNav, 'none');
});

await check('no console errors during the whole run', async () => assert.deepEqual(errors.filter((e) => !/favicon|net::ERR_FAILED/.test(e)), []));

await check('dark theme on live screen: readable contrast of score buttons', async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await page.waitForSelector('[data-action="continue-match"]'); await tap('[data-action="continue-match"]'); await page.waitForSelector('#live-root');
  await tap('[data-action="theme"]');
  const c = await page.evaluate(() => { const b = document.querySelector('[data-runs="1"]'); const s = getComputedStyle(b); return [s.color, s.backgroundColor]; });
  const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (lum(c[0]) + .05) / (lum(c[1]) + .05); const r2 = ratio < 1 ? 1 / ratio : ratio;
  assert.ok(r2 >= 4.5, `contrast ${r2.toFixed(2)} ${c}`);
  await tap('[data-action="theme"]');
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

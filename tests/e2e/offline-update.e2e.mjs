import { launch, ROOT } from './launch.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 3).join('\n    ')); } };
const browser = await launch();
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const URL_ = 'http://localhost:4173/';
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const tap = (s) => page.evaluate((s) => document.querySelector(s).click(), s);
const setVal = (sel, v) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const cacheNames = () => page.evaluate(() => caches.keys());
const VERSION_FILE = ROOT + '/version.js';
const original = fs.readFileSync(VERSION_FILE, 'utf8');

await page.goto(URL_, { waitUntil: 'networkidle0' });
await page.evaluate(() => navigator.serviceWorker.ready);
await settle(800);

await check('service worker installs and controls the page; versioned cache created', async () => {
  const reg = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { active: !!r?.active, scope: r?.scope }; });
  assert.ok(reg.active);
  assert.deepEqual(await cacheNames(), ['cricket1-2.0.0']);
});
await check('all app files precached (offline shell is complete)', async () => {
  const urls = await page.evaluate(async () => (await (await caches.open('cricket1-2.0.0')).keys()).map((r) => new URL(r.url).pathname));
  for (const f of ['/', '/index.html', '/src/app.js', '/src/pages/live.js', '/src/scoring/engine.js', '/src/storage/saveQueue.js', '/src/styles/app.css', '/version.js', '/service-worker.js'].filter((f) => f !== '/service-worker.js')) assert.ok(urls.includes(f) || urls.includes('/index.html'), f);
  const onDisk = [];
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = d + '/' + n.name; if (n.isDirectory()) walk(p); else if (/\.js$/.test(n.name)) onDisk.push(p.replace(ROOT, '')); } };
  walk(ROOT + '/src');
  for (const f of onDisk) assert.ok(urls.includes(f), `${f} missing from precache list`);
});

// create a match so we can prove data survives updates + offline
await tap('[data-action="new-match"]'); await tap('[data-action="setup-next"]');
await tap('[data-action="setup-next"]');
for (const [t, i, v] of [['team1', 0, 'P1'], ['team1', 1, 'P2'], ['team2', 0, 'Q1'], ['team2', 1, 'Q2']]) await setVal(`[data-team="${t}"][data-index="${i}"]`, v);
await tap('[data-action="setup-next"]'); await tap('[data-toss-winner="team1"]'); await tap('[data-toss-decision="bat"]'); await tap('[data-action="setup-next"]'); await tap('[data-action="start-match"]');
await page.waitForSelector('#modal-striker'); await tap('[data-action="confirm-openers"]'); await page.waitForSelector('#live-root');
await tap('[data-runs="4"]'); await tap('[data-runs="6"]'); await settle(300);

await check('OFFLINE: reload with no network → app starts from cache, match is still there', async () => {
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.continue-card', { timeout: 8000 });
  await tap('[data-action="continue-match"]'); await page.waitForSelector('#live-root');
  assert.equal(await page.$eval('#lv-score', (e) => e.textContent), '10/0');
  await tap('[data-runs="2"]'); await settle(300);                  // scoring + saving works offline
  assert.equal(await page.$eval('#lv-score', (e) => e.textContent), '12/0');
  assert.equal(await page.$eval('#save-text', (e) => e.textContent), 'Saved locally');
  await page.setOfflineMode(false);
});

await check('UPDATE: bump version → new cache, old cache deleted, new JS loads, banner appears, data intact', async () => {
  fs.writeFileSync(VERSION_FILE, original.replace("'2.0.0'", "'2.0.1'"));
  // also change a module so we can prove the *new code* is served instead of a stale copy
  const live = ROOT + '/src/pages/home.js'; const homeSrc = fs.readFileSync(live, 'utf8');
  fs.writeFileSync(live, homeSrc.replace('Every Run.</span>', 'Every Run.</span><!--v201-->'));
  try {
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await page.waitForFunction(async () => { const k = await caches.keys(); return k.length === 1 && k[0] === 'cricket1-2.0.1'; }, { timeout: 10000 });
    assert.deepEqual(await cacheNames(), ['cricket1-2.0.1'], 'old cache removed');
    await page.waitForFunction(() => !document.querySelector('#update-banner').hidden, { timeout: 5000 });
    assert.match(await page.$eval('#update-banner', (e) => e.textContent), /new version/i);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.ok((await page.content()).includes('<!--v201-->'), 'NEW home.js was served (no stale code)');
    assert.equal(await page.evaluate(() => globalThis.CRICKET1_VERSION), '2.0.1');
    await tap('[data-action="continue-match"]'); await page.waitForSelector('#live-root');
    assert.equal(await page.$eval('#lv-score', (e) => e.textContent), '12/0', 'match survives an update');
  } finally { fs.writeFileSync(VERSION_FILE, original); fs.writeFileSync(live, homeSrc); }
});

await check('UPDATE back (stale-HTML guard): reverting serves reverted code on the next load', async () => {
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await page.waitForFunction(async () => { const k = await caches.keys(); return k.length === 1 && k[0] === 'cricket1-2.0.0'; }, { timeout: 10000 });
  assert.deepEqual(await cacheNames(), ['cricket1-2.0.0']);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.ok(!(await page.content()).includes('<!--v201-->'));
});

await check('no uncaught page errors', async () => assert.deepEqual(errors, []));
await browser.close();
fs.writeFileSync(VERSION_FILE, original);
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

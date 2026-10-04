/* CRICKET1 service worker.
 *
 * Strategy (this is what ends the "old code keeps showing up" problem):
 *   - Cache name comes from version.js  →  bumping the version creates a new cache and the
 *     `activate` step deletes EVERY other cache.
 *   - HTML, JS, CSS, JSON, manifest : NETWORK-FIRST, fetched with cache:'no-cache' so the browser's
 *     HTTP cache can never serve a stale file. The cache copy is only used when offline.
 *   - Static assets (icons): cache-first.
 *   - install() precaches the shell with the same no-cache fetch, then skipWaiting()+clients.claim(),
 *     so an updated worker takes over immediately; the page then shows a "Reload" banner.
 */
importScripts('./version.js');
const VERSION = self.CRICKET1_VERSION || 'dev';
const CACHE = `cricket1-${VERSION}`;
const CORE = [
  './', './index.html', './version.js', './manifest.webmanifest',
  './src/styles/app.css', './src/app.js',
  './src/components/icons.js', './src/components/ui.js',
  './src/data/defaults.js', './src/utils/helpers.js',
  './src/state/store.js',
  './src/scoring/engine.js', './src/scoring/calculations.js',
  './src/statistics/aggregate.js',
  './src/storage/db.js', './src/storage/saveQueue.js',
  './src/services/feedback.js', './src/services/share.js', './src/services/theme.js', './src/services/updates.js',
  './src/pages/setup-validation.js', './src/pages/setup.js', './src/pages/home.js', './src/pages/live.js', './src/pages/live-modals.js',
  './src/pages/history.js', './src/pages/players.js', './src/pages/stats.js', './src/pages/settings.js', './src/pages/scorecard.js', './src/pages/result.js',
  './assets/icons/favicon.svg', './assets/icons/icon-192.svg', './assets/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!res.ok) throw new Error(`precache failed: ${url} ${res.status}`);
      // Store under the plain URL AND ignore query strings at lookup time (see matchApp).
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
    await self.clients.claim();
  })());
});

const isCode = (url) => /\.(?:html|js|mjs|css|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

async function matchApp(request, url) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('./index.html') : undefined) || undefined;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;                 // fonts/CDNs etc.: leave to the browser

  if (request.mode === 'navigate' || isCode(url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(request, { cache: 'no-cache' }));
        if (fresh.ok) { const copy = fresh.clone(); caches.open(CACHE).then((c) => c.put(url.pathname.endsWith('/') ? './index.html' : new Request(url.origin + url.pathname), copy)).catch(() => {}); }
        return fresh;
      } catch {
        const cached = await matchApp(request, url);
        if (cached) return cached;
        return new Response('CRICKET1 is offline and this file was not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {                            // static assets: cache-first
    const cached = await matchApp(request, url);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
    return res;
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

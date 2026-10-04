/**
 * Service-worker registration + update handling.
 * - `updateViaCache: 'none'` : the browser always revalidates service-worker.js itself.
 * - New worker installs, `skipWaiting()`s and claims clients; we then tell the page.
 * - The page shows a "new version" banner (never reloads in the middle of scoring).
 */
export function registerServiceWorker({ onUpdateReady }) {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) onUpdateReady?.(); });
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((err) => console.warn('CRICKET1 service worker not registered', err));
}

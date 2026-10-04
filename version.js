/* Single source of truth for the app version. Loaded as a classic script by index.html AND by
   service-worker.js (importScripts). BUMP THIS ON EVERY DEPLOY: it renames the service-worker cache,
   which deletes every older cache and makes browsers pick up the new code. */
globalThis.CRICKET1_VERSION = '2.0.1';

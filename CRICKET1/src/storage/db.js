/** IndexedDB access for CRICKET1. One shared connection; records are plain JSON (see serializeMatch). */
const DB_NAME = 'cricket1-db';
const DB_VERSION = 1;
const MATCH_STORE = 'matches';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MATCH_STORE)) db.createObjectStore(MATCH_STORE, { keyPath: 'matchId' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };   // let a newer tab/version upgrade
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Storage is blocked by another tab. Close other CRICKET1 tabs.')); };
  });
  return dbPromise;
}

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx, value) => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.')); });

export async function openStorage() { await openDb(); }

/** Persist a serialized match record (no derived data). */
export async function putRecord(record) {
  const db = await openDb();
  const tx = db.transaction(MATCH_STORE, 'readwrite');
  tx.objectStore(MATCH_STORE).put(record);
  return done(tx, record.matchId);
}
export async function getAllRecords() { const db = await openDb(); return wrap(db.transaction(MATCH_STORE).objectStore(MATCH_STORE).getAll()); }
export async function getRecord(matchId) { const db = await openDb(); return (await wrap(db.transaction(MATCH_STORE).objectStore(MATCH_STORE).get(matchId))) || null; }
export async function deleteMatch(matchId) { const db = await openDb(); const tx = db.transaction(MATCH_STORE, 'readwrite'); tx.objectStore(MATCH_STORE).delete(matchId); return done(tx); }
export async function clearMatches() { const db = await openDb(); const tx = db.transaction(MATCH_STORE, 'readwrite'); tx.objectStore(MATCH_STORE).clear(); return done(tx); }

/** Write many records in one transaction. Records must already be validated. */
export async function putRecords(records) {
  const db = await openDb();
  const tx = db.transaction(MATCH_STORE, 'readwrite');
  const store = tx.objectStore(MATCH_STORE);
  records.forEach((r) => store.put(r));
  return done(tx, records.length);
}

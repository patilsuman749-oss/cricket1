import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";
import { serializeMatch, hydrateMatch } from "../scoring/engine.js";

const MATCHES = "matches";
const DELETED = "deleted";

function userId() {
  return auth.currentUser?.uid || null;
}

function matchRef(uid, matchId) {
  return doc(db, "users", uid, MATCHES, matchId);
}

function deletedRef(uid, matchId) {
  return doc(db, "users", uid, DELETED, matchId);
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export async function saveMatchToCloud(match) {
  const uid = userId();
  if (!uid || !match?.matchId) return { synced: false, reason: "not-signed-in" };

  const record = serializeMatch(match);

  await setDoc(
    matchRef(uid, record.matchId),
    {
      ...record,
      ownerId: uid,
      cloudUpdatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return { synced: true };
}

export async function deleteMatchFromCloud(matchId) {
  const uid = userId();
  if (!uid || !matchId) return { synced: false, reason: "not-signed-in" };

  await setDoc(
    deletedRef(uid, matchId),
    {
      ownerId: uid,
      deletedAt: serverTimestamp(),
      deletedAtIso: new Date().toISOString()
    },
    { merge: true }
  );

  await deleteDoc(matchRef(uid, matchId));
  return { synced: true };
}

/**
 * Merge the local IndexedDB copy with the signed-in user's Firestore copy.
 * Newer `updatedAt` wins. Cloud-only matches are downloaded; local-only matches are uploaded.
 * Local deletions leave a tombstone so a deleted cloud match is not resurrected.
 */
export async function syncLocalWithCloud(localMatches = []) {
  const uid = userId();
  if (!uid) return { uploaded: 0, downloaded: 0, deleted: 0, skipped: 0 };

  const [cloudSnap, deletedSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, MATCHES)),
    getDocs(collection(db, "users", uid, DELETED))
  ]);

  const cloudMap = new Map();
  for (const snap of cloudSnap.docs) {
    const raw = snap.data();
    if (!raw?.matchId) continue;
    try {
      cloudMap.set(raw.matchId, hydrateMatch(raw));
    } catch (error) {
      console.warn("Skipping unreadable cloud match", raw?.matchId, error);
    }
  }

  const deletedMap = new Map();
  for (const snap of deletedSnap.docs) {
    const raw = snap.data();
    if (raw?.deletedAtIso) deletedMap.set(snap.id, toMs(raw.deletedAtIso));
  }

  const localMap = new Map(localMatches.filter(Boolean).map((m) => [m.matchId, m]));
  const merged = new Map(localMap);

  let uploaded = 0;
  let downloaded = 0;
  let deleted = 0;
  let skipped = 0;

  // Local records first: upload if newer, or download the newer cloud copy.
  for (const [id, local] of localMap) {
    const tombstoneMs = deletedMap.get(id) || 0;
    const localMs = toMs(local.updatedAt);
    const cloud = cloudMap.get(id);
    const cloudMs = toMs(cloud?.updatedAt);

    if (tombstoneMs >= localMs && tombstoneMs >= cloudMs) {
      if (cloud) {
        await deleteDoc(matchRef(uid, id));
        deleted++;
      }
      merged.delete(id);
      continue;
    }

    if (!cloud || localMs > cloudMs) {
      await saveMatchToCloud(local);
      uploaded++;
      continue;
    }

    if (cloudMs > localMs) {
      merged.set(id, cloud);
      downloaded++;
    } else {
      skipped++;
    }
  }

  // Cloud-only records: download unless a newer tombstone exists.
  for (const [id, cloud] of cloudMap) {
    if (localMap.has(id)) continue;

    const tombstoneMs = deletedMap.get(id) || 0;
    const cloudMs = toMs(cloud.updatedAt);

    if (tombstoneMs >= cloudMs) {
      await deleteDoc(matchRef(uid, id)).catch(() => {});
      deleted++;
      continue;
    }

    merged.set(id, cloud);
    downloaded++;
  }

  return {
    uploaded,
    downloaded,
    deleted,
    skipped,
    matches: [...merged.values()]
  };
}

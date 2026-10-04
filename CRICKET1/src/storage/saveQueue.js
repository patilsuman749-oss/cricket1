/**
 * Autosave queue. The scorer's tap updates the screen FIRST; persistence happens right after,
 * off the click's critical path:
 *   - `enqueue` is O(1): it only remembers the newest match object and arms a short timer.
 *   - Rapid taps coalesce into one write of the newest state (never one write per tap).
 *   - Only one IndexedDB transaction is ever in flight; a tap during a write marks it dirty and
 *     one more write follows.
 *   - `flushNow` runs when the tab is hidden/closed so the last ball is not lost.
 */
import { serializeMatch } from '../scoring/engine.js';
import { putRecord } from './db.js';

const DELAY_MS = 40;
let pending = null, timer = null, writing = false, dirty = false;
let status = 'saved';
const listeners = new Set();

function setStatus(next) { if (status !== next) { status = next; listeners.forEach((fn) => fn(next)); } }
export function onSaveStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); }
export function getSaveStatus() { return status; }

export function enqueue(match) {
  pending = match;
  setStatus('saving');
  if (timer === null) timer = setTimeout(flush, DELAY_MS);
}

async function flush() {
  timer = null;
  if (writing) { dirty = true; return; }
  writing = true;
  try {
    do {
      dirty = false;
      const match = pending;
      if (!match) break;
      await putRecord(serializeMatch(match));
    } while (dirty);
    setStatus(pending && timer !== null ? 'saving' : 'saved');
  } catch (err) {
    console.error('CRICKET1 autosave failed', err);
    setStatus('error');
  } finally {
    writing = false;
    if (dirty || (timer === null && status === 'saving')) { timer = setTimeout(flush, DELAY_MS); }
  }
}

/** Write immediately (used on hide/unload and before navigation that needs the DB current). */
export async function flushNow() {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (!pending) return;
  if (writing) { dirty = true; return; }
  await flush();
}

export function installLifecycleFlush() {
  const hidden = () => { if (document.visibilityState === 'hidden') flushNow(); };
  document.addEventListener('visibilitychange', hidden);
  addEventListener('pagehide', () => { flushNow(); });
}

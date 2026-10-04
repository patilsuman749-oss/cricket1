/**
 * CRICKET1 application shell: boot, routing, and ONE set of delegated event listeners
 * (registered exactly once in `installListeners`). Every control maps to exactly one handler below.
 */
import { signInWithGoogle, logout, watchAuth } from './services/auth.js';
import { icon } from './components/icons.js';
import { $, escapeHtml } from './utils/helpers.js';
import { state, upsertMatch, activeMatches } from './state/store.js';
import * as Engine from './scoring/engine.js';
import * as Setup from './pages/setup-validation.js';
import { renderSetup, focusFirstInvalid, clearErrorUI } from './pages/setup.js';
import { renderHome } from './pages/home.js';
import { renderLive, bindLive, updateLive, showSaveStatus, blockedAction } from './pages/live.js';
import * as Modals from './pages/live-modals.js';
import { renderHistory } from './pages/history.js';
import { renderPlayers } from './pages/players.js';
import { renderStats } from './pages/stats.js';
import { renderSettings } from './pages/settings.js';
import { renderScorecardPage } from './pages/scorecard.js';
import { renderResult } from './pages/result.js';
import { toast, clearToasts, closeModal, isModalOpen, trapFocus } from './components/ui.js';
import { getAllRecords, putRecord, putRecords, deleteMatch, clearMatches } from './storage/db.js';
import { enqueue, flushNow, onSaveStatus, installLifecycleFlush } from './storage/saveQueue.js';
import { shareMatch, downloadJson, downloadScorecardHtml } from './services/share.js';
import { vibrate, playFeedback, celebrate, primeAudio } from './services/feedback.js';
import { applyTheme, getTheme, setTheme, toggleTheme } from './services/theme.js';
import { registerServiceWorker } from './services/updates.js';

const NAV = [['home', 'Home', 'home'], ['live', 'Live', 'play'], ['history', 'History', 'history'], ['players', 'Players', 'users'], ['stats', 'Stats', 'chart'], ['settings', 'Settings', 'settings']];

/* ================================================================== boot */

async function boot() {
  applyTheme(getTheme());
  installListeners();
  installLifecycleFlush();
  onSaveStatus(showSaveStatus);

  // Render the application shell immediately. Do NOT block the first paint on IndexedDB.
  // A slow/locked browser database previously left the page completely blank for several
  // seconds because boot() awaited getAllRecords() before the first render.
  state.loading = false;
  render();

  // Restore saved matches in the background. When storage is ready, refresh the visible
  // dashboard without delaying the initial UI.
  try {
    const records = await getAllRecords();
    state.matches = records.flatMap((r) => { try { return [Engine.hydrateMatch(r)]; } catch (e) { console.warn('Skipping unreadable match', r?.matchId, e); return []; } });
    render();
  } catch (err) {
    console.error(err);
    state.storageError = err;
    render();
  }

  registerServiceWorker({ onUpdateReady: showUpdateBanner });
}

/* ============================================================== rendering */

function render() { renderTopbar(); renderMain(); renderBottomNav(); }

function viewTitle() {
  if (state.view === 'live' && state.match) { const inn = Engine.currentInnings(state.match); return Engine.teamById(state.match, inn.battingTeamId).name; }
  return { home: 'Dashboard', 'new-match': 'New Match' }[state.view] || state.view.charAt(0).toUpperCase() + state.view.slice(1);
}

function renderTopbar() {
  const dark = getTheme() === 'dark';
  const showBack = ['new-match', 'scorecard'].includes(state.view);
  $('#topbar').innerHTML = `${showBack ? `<button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('back')}</button>` : ''}
    <div class="brand"><img class="brand-mark" src="assets/icons/favicon.svg" alt=""><div class="brand-text"><div class="brand-name">CRICKET1</div><span class="brand-tag">${escapeHtml(viewTitle())} · Every Ball. Every Run. Every Moment.</span></div></div>
    <div class="topbar-spacer"></div>
    <div class="desktop-nav">${NAV.map(([id, label, ic]) => navButton(id, label, ic, 17)).join('')}</div>
    <div class="topbar-actions"><button type="button" class="icon-btn theme-toggle" data-action="theme" aria-label="Switch to ${dark ? 'light' : 'dark'} theme" aria-pressed="${dark}">${icon(dark ? 'sun' : 'moon', 18)}</button></div>`;
}
const navButton = (id, label, ic, size) => `<button type="button" class="nav-item ${state.view === id ? 'active' : ''}" data-nav="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(ic, size)}<span class="nav-label">${label}</span></button>`;
function renderBottomNav() { $('#bottom-nav').innerHTML = NAV.map(([id, label, ic]) => navButton(id, label, ic, 18)).join(''); }

function renderMain() {
  const root = $('#main-content');
  document.body.dataset.view = state.view;
  if (state.loading) { root.innerHTML = '<div class="empty"><strong>Loading CRICKET1…</strong><span class="small">Restoring your locally saved matches.</span></div>'; return; }
  if (state.storageError) { root.innerHTML = `<div class="card"><h2>Storage unavailable</h2><p class="subtle">CRICKET1 could not open local browser storage, so matches cannot be saved. Allow site storage (or leave private browsing) and reload.</p></div>`; return; }
  switch (state.view) {
    case 'new-match': root.innerHTML = renderSetup(); break;
    case 'live': renderLiveView(root); break;
    case 'history': root.innerHTML = renderHistory(); break;
    case 'players': root.innerHTML = renderPlayers(); break;
    case 'stats': root.innerHTML = renderStats(); break;
    case 'settings': root.innerHTML = renderSettings(); break;
    case 'scorecard': root.innerHTML = renderScorecardPage(); break;
    default: root.innerHTML = renderHome();
  }
}

function renderLiveView(root) {
  const m = state.match;
  if (!m) { root.innerHTML = `<div class="empty"><strong>No active match</strong><span class="small">Start a new match to use Live scoring.</span><div style="margin-top:14px"><button type="button" class="primary-btn" data-action="new-match">Start New Match</button></div></div>`; return; }
  if (m.status === 'completed') { root.innerHTML = renderResult(); return; }
  root.innerHTML = renderLive(m);
  bindLive();
  updateLive(m);
}

function showUpdateBanner() {
  state.updateReady = true;
  const el = $('#update-banner');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<span>A new version of CRICKET1 is ready.</span><button type="button" class="primary-btn" data-action="reload-app">Reload</button>`;
}

/* ============================================================== navigation */

function go(view) {
  if (view === 'live') {
    if (!state.match) {
      const a = activeMatches()[0];
      if (!a) { toast('No active match yet — start one first.', 'warning'); return; }
      state.match = a;
    }
    if (state.match.status === 'completed') { state.scorecardMatchId = state.match.matchId; view = 'scorecard'; }
  }
  closeModal({ silent: true });
  clearToasts();
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

function openMatch(id) {
  const m = state.matches.find((x) => x.matchId === id);
  if (!m) return;
  state.match = m;
  if (m.status === 'completed') { state.scorecardMatchId = id; go('scorecard'); return; }
  state.view = 'live'; closeModal({ silent: true }); render(); window.scrollTo({ top: 0 });
  promptIfNeeded(m);
}

/** After (re)opening a match: surface whatever is needed to continue. */
function promptIfNeeded(m) {
  const inn = Engine.currentInnings(m);
  if (Engine.isInningsOver(m, inn)) { if (m.innings.length === 1) Modals.openInningsBreakModal(m); return; }
  if (!inn.striker || !inn.nonStriker) Modals.openOpenersModal(m);
  else if (!inn.currentBowler) Modals.openBowlerModal(m, { afterOver: inn.derived.overSummaries.length > 0 });
}

/* ================================================================ scoring */

function afterDelivery(result) {
  const m = state.match;
  updateLive(m);                       // 1. the screen
  enqueue(m);                          // 2. persistence (async, coalesced, after paint)
  const del = result.delivery;
  const wicket = del.wicket;
  playFeedback(wicket ? 'wicket' : result.overComplete ? 'over' : 'run');
  vibrate(wicket ? 'wicket' : result.overComplete ? 'over' : 'small');
  if (del.batterRuns && state.match) {
    const runs = Engine.currentInnings(m).derived.batterStats[del.striker]?.runs || 0;
    if ([50, 100].some((t) => runs >= t && runs - del.batterRuns < t)) celebrate();
  }
  if (result.inningsOver || result.matchOver) { handleInningsEnd(); return; }
  if (result.overComplete) { toast('Over complete — choose the next bowler.', 'success'); Modals.openBowlerModal(m, { afterOver: true }); }
}

function handleInningsEnd() {
  const m = state.match;
  flushNow();
  if (m.status === 'completed') { toast(m.result.text, 'success'); render(); return; }
  if (m.innings.length === 1) Modals.openInningsBreakModal(m);
}

function handleBlocked(block) {
  if (block.action === 'openers') Modals.openOpenersModal(state.match);
  else if (block.action === 'bowler') Modals.openBowlerModal(state.match, { afterOver: state.match && Engine.currentInnings(state.match).derived.overSummaries.length > 0 });
  else if (state.match.status !== 'completed' && state.match.innings.length === 1) Modals.openInningsBreakModal(state.match);
  else toast(block.reason, 'warning');
}

function scoreRun(runs) {
  const m = state.match;
  if (!m) return;
  const block = blockedAction(m);
  if (block) return handleBlocked(block);
  let result;
  try { result = Engine.addRuns(m, runs); } catch (e) { toast(e.message, 'error'); return; }
  afterDelivery(result);
}

function guardedModal(open) {
  const block = blockedAction(state.match);
  if (block) return handleBlocked(block);
  open();
}

function undoLast() {
  const m = state.match;
  const wasCompleted = m.status === 'completed';
  try { Engine.undo(m); } catch (e) { toast(e.message, 'warning'); return false; }
  if (wasCompleted) render(); else updateLive(m);
  enqueue(m);
  toast('Last ball undone.', 'success');
  return true;
}

function commitScoring(fn) {
  try { const result = fn(); closeModal({ silent: true }); afterDelivery(result); return true; }
  catch (e) { toast(e.message, 'error'); return false; }
}

/* ================================================================== setup */

const rerenderSetup = () => { renderMain(); if (Setup.visibleErrors(state.setup).length) focusFirstInvalid(); };

async function startMatch() {
  const check = Setup.validateAllForStart(state.setup);
  if (!check.ok) { rerenderSetup(); return; }
  let match;
  try { match = Engine.createMatch(Setup.toMatchConfig(state.setup)); }
  catch (e) { toast(e.message, 'error'); return; }
  state.match = match; upsertMatch(match);
  try { await putRecord(Engine.serializeMatch(match)); } catch { toast('Could not save the new match to this device.', 'error'); }
  state.view = 'live'; render(); window.scrollTo({ top: 0 });
  Modals.openOpenersModal(match);
}

function newMatch() {
  state.setup = Setup.createSetupState();
  clearToasts();
  state.view = 'new-match'; render(); window.scrollTo({ top: 0 });
}

/* ================================================================ actions */

const actions = {
  theme: () => { toggleTheme(); renderTopbar(); if (state.view === 'settings') renderMain(); },
  'sign-in': async () => {
  try {
    await signInWithGoogle();
    toast('Signed in with Google.', 'success');
    render();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Google sign-in failed.', 'error');
  }
},

'sign-out': async () => {
  try {
    await logout();
    toast('Signed out.', 'success');
    render();
  } catch (e) {
    console.error(e);
    toast(e?.message || 'Could not sign out.', 'error');
  }
},
  'reload-app': async () => { await flushNow(); location.reload(); },
  'check-update': async () => {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (!reg) { toast('Updates are checked automatically when online.', 'info'); return; }
    toast('Checking for updates…', 'info'); await reg.update().catch(() => {});
  },
  'new-match': newMatch,
  'continue-match': (btn) => openMatch(btn.dataset.id || activeMatches()[0]?.matchId),
  back: () => go(state.view === 'scorecard' ? (state.match?.status === 'active' && state.scorecardMatchId === state.match.matchId ? 'live' : 'history') : 'home'),
  home: () => go('home'),

  'setup-next': () => { const r = Setup.advance(state.setup); rerenderSetup(); if (r.ok) window.scrollTo({ top: 0 }); },
  'setup-back': () => { Setup.goBack(state.setup); renderMain(); window.scrollTo({ top: 0 }); },
  'start-match': startMatch,
  'add-player': (btn) => {
    const key = btn.dataset.team, idx = Setup.addPlayer(state.setup, key);
    renderMain();
    document.querySelector(`[data-setup="player"][data-team="${key}"][data-index="${idx}"]`)?.focus();
  },
  'remove-player': (btn) => { if (!Setup.removePlayer(state.setup, btn.dataset.team, Number(btn.dataset.index))) toast('Each team needs at least two players.', 'warning'); else renderMain(); },

  'score-run': (btn) => scoreRun(Number(btn.dataset.runs)),
  extra: (btn) => guardedModal(() => Modals.openExtraModal(btn.dataset.type)),
  wicket: () => guardedModal(() => Modals.openWicketModal(state.match)),
  undo: undoLast,
  'edit-last': () => {
    const last = Engine.lastDelivery(state.match);
    if (!last) { toast('No ball to edit yet.', 'warning'); return; }
    Modals.openEditModal(state.match, Engine.ballLabel(last));
  },
  'change-strike': () => { try { Engine.changeStrike(state.match); updateLive(state.match); enqueue(state.match); toast('Strike changed.', 'success'); } catch (e) { toast(e.message, 'warning'); } },
  'change-bowler': () => Modals.openBowlerModal(state.match),
  'blocked-fix': (btn) => handleBlocked({ action: btn.dataset.fix }),

  'confirm-extra': (btn) => {
    const spec = Modals.readExtra(btn.dataset.type);
    commitScoring(() => btn.dataset.mode === 'edit' ? Engine.editLastBall(state.match, { kind: 'extra', ...spec }) : Engine.addExtra(state.match, spec.type, spec.amount, spec.batterRuns));
  },
  'confirm-wicket': (btn) => {
    const spec = Modals.readWicket();
    commitScoring(() => btn.dataset.mode === 'edit' ? Engine.editLastBall(state.match, spec) : Engine.addWicket(state.match, spec));
  },
  'confirm-bowler': () => { try { Engine.setBowler(state.match, Modals.readBowler()); closeModal({ silent: true }); updateLive(state.match); enqueue(state.match); } catch (e) { toast(e.message, 'error'); } },
  'confirm-openers': () => {
    const o = Modals.readOpeners();
    try { Engine.setOpeners(state.match, o.striker, o.nonStriker, o.bowler); closeModal({ silent: true }); updateLive(state.match); enqueue(state.match); } catch (e) { toast(e.message, 'error'); }
  },
  'start-second': () => {
    try { Engine.finishFirstInnings(state.match); } catch (e) { toast(e.message, 'error'); return; }
    enqueue(state.match); closeModal({ silent: true }); render(); Modals.openOpenersModal(state.match);
  },
  'undo-from-break': () => { if (undoLast()) closeModal({ silent: true }); },
  'undo-result': () => { if (undoLast()) { state.view = 'live'; render(); } },
  'finish-innings': () => {
    const m = state.match;
    if (m.status === 'completed') { render(); return; }
    if (Engine.isInningsOver(m)) { if (m.innings.length === 1) Modals.openInningsBreakModal(m); else handleInningsEnd(); }
    else toast('The innings is still in progress — it ends at the over limit or when the team is all out.', 'warning');
  },
  'open-scorecard': () => { state.scorecardMatchId = state.match?.matchId; go('scorecard'); },
  'view-scorecard': (btn) => { state.scorecardMatchId = btn.dataset.id; go('scorecard'); },
  share: async (btn) => {
    const m = state.matches.find((x) => x.matchId === btn.dataset.id) || state.match;
    if (!m) return;
    try { const r = await shareMatch(m); toast(r === 'shared' ? 'Share sheet opened' : r === 'copied' ? 'Scorecard copied to clipboard' : 'Scorecard downloaded', 'success'); }
    catch (e) { if (e?.name !== 'AbortError') toast('Could not share the scorecard.', 'error'); }
  },
  'download-scorecard': (btn) => { const m = state.matches.find((x) => x.matchId === btn.dataset.id) || state.match; if (m) { downloadScorecardHtml(m); toast('Scorecard file created.', 'success'); } },
  'delete-match': async (btn) => {
    const id = btn.dataset.id;
    if (!confirm('Delete this saved match from this device?')) return;
    await deleteMatch(id);
    state.matches = state.matches.filter((m) => m.matchId !== id);
    if (state.match?.matchId === id) state.match = null;
    render(); toast('Match deleted.', 'success');
  },
  export: async () => { await flushNow(); downloadJson({ app: 'CRICKET1', schemaVersion: Engine.SCHEMA_VERSION, exportedAt: new Date().toISOString(), matches: state.matches.map(Engine.serializeMatch) }); toast('Backup exported.', 'success'); },
  import: () => $('#import-file').click(),
  'clear-data': async () => {
    if (!confirm('Delete ALL CRICKET1 matches from this device? Export a backup first if you need one.')) return;
    await clearMatches(); state.matches = []; state.match = null; render(); toast('Local data cleared.', 'success');
  },
  'close-modal': () => closeModal(),
  'modal-backdrop': (_btn, ev) => { if (ev.target === _btn) closeModal(); }
};

async function importFile(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data?.matches;
    if (!Array.isArray(list)) throw new Error('This file does not contain CRICKET1 matches.');
    const good = [];
    for (const raw of list) { try { good.push(Engine.hydrateMatch(structuredClone(raw))); } catch { /* counted below */ } }
    if (!good.length) throw new Error('No valid matches found in this file.');
    await putRecords(good.map(Engine.serializeMatch));
    good.forEach(upsertMatch);
    if (state.view === 'settings') renderMain();
    toast(`${good.length} match${good.length === 1 ? '' : 'es'} imported${good.length < list.length ? `, ${list.length - good.length} skipped` : ''}.`, 'success');
  } catch (e) { toast(`Import failed: ${e.message}`, 'error'); }
}

/* ============================================================= listeners */

const CLICK_TARGETS = '[data-action],[data-nav],[data-step],[data-format],[data-toss-winner],[data-toss-decision],[data-theme-set],[data-edit-runs],[data-edit-extra],[data-edit-wicket],[data-fill]';
let installed = false;

function installListeners() {
  if (installed) return;                                   // never register twice
  installed = true;

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest(CLICK_TARGETS);
    if (!el) return;
    primeAudio();
    const d = el.dataset;
    try {
      if (d.action) { const fn = actions[d.action]; if (fn) { const r = fn(el, ev); if (r?.catch) r.catch((e) => toast(e?.message || 'Something went wrong.', 'error')); } }
      else if (d.nav) go(d.nav);
      else if (d.step) { Setup.goToStep(state.setup, d.step); rerenderSetup(); }
      else if (d.format) { Setup.setFormat(state.setup, d.format); renderMain(); }
      else if (d.tossWinner) { Setup.setToss(state.setup, { winner: d.tossWinner }); renderMain(); }
      else if (d.tossDecision) { Setup.setToss(state.setup, { decision: d.tossDecision }); renderMain(); }
      else if (d.themeSet) { setTheme(d.themeSet); renderTopbar(); renderMain(); }
      else if (d.editRuns !== undefined) commitScoring(() => Engine.editLastBall(state.match, { kind: 'runs', runs: Number(d.editRuns) }));
      else if (d.editExtra) { closeModal({ silent: true }); Modals.openExtraModal(d.editExtra, 'edit'); }
      else if (d.editWicket) { const preview = Engine.cloneMatch(state.match); Engine.undo(preview); closeModal({ silent: true }); Modals.openWicketModal(preview, 'edit'); }
      else if (d.fill) { const t = document.getElementById(d.fill); if (t) t.value = d.value; }
    } catch (err) { toast(err?.message || 'Something went wrong.', 'error'); }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target, kind = el.dataset?.setup;
    if (!kind || state.view !== 'new-match') return;
    const s = state.setup;
    if (kind === 'team-name') Setup.setTeamName(s, el.dataset.team, el.value);
    else if (kind === 'player') Setup.setPlayerName(s, el.dataset.team, Number(el.dataset.index), el.value);
    else if (kind === 'overs') Setup.setCustomOvers(s, el.value);
    else if (kind === 'team-color') { s[el.dataset.team].color = el.value; return; }
    clearErrorUI();                                         // editing wipes stale errors without a re-render
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'dismissal-type') Modals.syncWicketForm();
    else if (el.id === 'setting-sound') localStorage.setItem('cricket1-sound', el.checked ? 'on' : 'off');
    else if (el.id === 'setting-vibration') localStorage.setItem('cricket1-vibration', el.checked ? 'on' : 'off');
    else if (el.id === 'setting-celebrations') localStorage.setItem('cricket1-celebrations', el.checked ? 'on' : 'off');
    else if (el.id === 'import-file' && el.files?.[0]) { importFile(el.files[0]); el.value = ''; }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isModalOpen()) { closeModal(); return; }
    if (isModalOpen()) { trapFocus(ev); return; }
    if (ev.key === 'Enter' && ev.target.matches?.('[data-setup]') && state.view === 'new-match') {
      ev.preventDefault();
      const inputs = [...document.querySelectorAll('#setup-body input[data-setup]:not([type="color"])')];
      const next = inputs[inputs.indexOf(ev.target) + 1];
      if (next) next.focus(); else document.querySelector('#setup-body [data-action="setup-next"]')?.click();
    }
  });
}

boot();

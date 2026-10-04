/**
 * Live scoring view.
 *
 *   renderLive(match)  -> static skeleton HTML (built ONCE per visit; scoring buttons live here)
 *   bindLive()         -> caches element references
 *   updateLive(match)  -> patches only what changed (text nodes + keyed list rows)
 *
 * A scoring tap therefore does: engine mutation -> updateLive (≈30 text writes) -> done.
 * Nothing is re-rendered, no listeners are re-attached (one delegated listener lives in app.js).
 */
import { icon } from '../components/icons.js';
import { escapeHtml, formatNumber, formatOvers, formatTime } from '../utils/helpers.js';
import * as Engine from '../scoring/engine.js';
import { currentPartnership } from '../scoring/calculations.js';

let R = null;                      // cached refs for the mounted live view
const COMMENTARY_LIMIT = 25;

const RUN_BUTTONS = [0, 1, 2, 3, 4, 5, 6];

export function renderLive(match) {
  const inn = Engine.currentInnings(match);
  const bat = Engine.teamById(match, inn.battingTeamId), bowl = Engine.teamById(match, inn.bowlingTeamId);
  const stat = (key, label) => `<div class="mini-stat"><div class="mini-stat-label">${label}</div><div class="mini-stat-value" data-lv="${key}">—</div></div>`;
  const batterCard = (slot) => `<div class="batter-card" data-slot="${slot}" hidden><div><div class="batter-name"><span data-f="name"></span><span class="striker-dot" data-f="dot" hidden title="On strike"> ● <span class="sr-only">on strike</span></span></div><div class="player-line-stats"><span>R <b data-f="r">0</b></span><span>B <b data-f="b">0</b></span><span>4s <b data-f="f">0</b></span><span>6s <b data-f="s">0</b></span><span>SR <b data-f="sr">0.00</b></span></div></div><div class="batter-num" data-f="num">0</div></div>`;
  return `<div class="page-head"><div><div class="page-kicker">Live match · ${escapeHtml(match.matchId)}</div><h1 id="lv-title">${escapeHtml(bat.name)} vs ${escapeHtml(bowl.name)}</h1><p class="subtle" id="lv-sub"></p></div><div class="topbar-actions"><button type="button" class="secondary-btn" data-action="open-scorecard">Scorecard</button><button type="button" class="ghost-btn" data-action="finish-innings" id="lv-finish">Finish innings</button></div></div>
  <div class="match-layout" id="live-root">
    <section class="score-panel score-banner" aria-label="Score">
      <div class="score-top"><div><div class="score-team" id="lv-team"></div><div class="score-main"><span class="score-num" id="lv-score" aria-live="polite">0/0</span><span class="score-overs" id="lv-overs">0.0 / 0</span></div>
        <div class="score-extra-line"><span>Target: <strong id="lv-target">—</strong></span><span>Required: <strong id="lv-required">—</strong></span><span>Balls: <strong id="lv-balls">0</strong></span></div></div>
        <span class="chip chip-on-dark" id="lv-chip"></span></div>
      <div class="score-stats">${stat('crr', 'CRR')}${stat('rrr', 'RRR')}${stat('extras', 'Extras')}${stat('wickets', 'Wickets')}${stat('overs', 'Overs')}${stat('target', 'Target')}${stat('required', 'Required')}</div>
    </section>

    <section class="live-card area-batters" id="live-batters" aria-label="Current batters"><div class="card-header"><div><h3>Current Batters</h3><div class="small">Striker marked with ●</div></div><button type="button" class="secondary-btn" data-action="change-strike">Change Strike</button></div>${batterCard('a')}${batterCard('b')}
      <div class="controls-label">Partnership</div><div class="live-row"><strong><span id="lv-pr">0</span> runs</strong><span class="small"><span id="lv-pb">0</span> balls</span></div></section>

    <section class="live-card area-bowler" id="live-bowler" aria-label="Current bowler"><div class="card-header"><div><h3>Current Bowler</h3><div class="small" id="lv-bowler-hint">Bowler for this over</div></div><button type="button" class="secondary-btn" data-action="change-bowler">Change</button></div>
      <div id="lv-bowler-ok"><div class="bowler-number" id="lv-bowler-name">—</div><div class="player-line-stats"><span>O <b id="lv-bo">0.0</b></span><span>M <b id="lv-bm">0</b></span><span>R <b id="lv-br">0</b></span><span>W <b id="lv-bw">0</b></span><span>ECO <b id="lv-be">0.00</b></span></div></div></section>

    <section class="live-card area-controls" aria-label="Scoring controls"><div class="card-header"><div><h3>Scoring Controls</h3><div class="small">Tap once per ball.</div></div><span class="save-state" id="save-state" role="status"><span class="save-dot"></span><span id="save-text">Saved locally</span></span></div>
      <div class="notice" id="lv-notice" role="status" hidden><span id="lv-notice-text"></span><button type="button" class="primary-btn" id="lv-notice-btn" data-action="blocked-fix">Fix</button></div>
      <div class="scoring-controls" id="lv-controls">${RUN_BUTTONS.map((r) => `<button type="button" class="score-button ${r === 4 ? 'run-four' : r === 6 ? 'run-six' : ''}" data-action="score-run" data-runs="${r}" aria-label="${r} run${r === 1 ? '' : 's'}">${r}</button>`).join('')}<button type="button" class="score-button extra wide" data-action="extra" data-type="wide">Wide</button><button type="button" class="score-button extra" data-action="extra" data-type="no-ball">No Ball</button><button type="button" class="score-button extra" data-action="extra" data-type="bye">Bye</button><button type="button" class="score-button extra" data-action="extra" data-type="leg-bye">Leg Bye</button><button type="button" class="score-button wicket" data-action="wicket">Wicket</button><button type="button" class="score-button undo" data-action="undo">Undo</button><button type="button" class="score-button edit" data-action="edit-last">Edit Last Ball</button></div></section>

    <section class="live-card area-over" aria-label="This over"><div class="card-header"><div><h3 id="lv-over-title">Over 1</h3><div class="small" id="lv-over-meta"></div></div></div><div class="ball-strip" id="lv-strip"></div></section>
    <section class="live-card area-commentary" aria-label="Commentary"><div class="card-header"><div><h3>Live Commentary</h3><div class="small">Latest delivery is highlighted.</div></div></div><div class="commentary" id="lv-commentary"></div></section>
    <section class="live-card area-summary" aria-label="Over summaries"><div class="card-header"><div><h3>Over Summaries</h3><div class="small">Completed overs only.</div></div></div><div id="lv-summaries"></div></section>
  </div>`;
}

/** Cache DOM references after the skeleton is in the document. */
export function bindLive() {
  const $ = (id) => document.getElementById(id);
  if (!$('live-root')) { R = null; return; }
  const row = (slot) => {
    const el = document.querySelector(`#live-batters [data-slot="${slot}"]`);
    const f = (k) => el.querySelector(`[data-f="${k}"]`);
    return { el, id: null, name: f('name'), dot: f('dot'), r: f('r'), b: f('b'), f4: f('f'), s6: f('s'), sr: f('sr'), num: f('num') };
  };
  const lv = (k) => document.querySelector(`[data-lv="${k}"]`);
  R = {
    title: $('lv-title'), sub: $('lv-sub'), team: $('lv-team'), score: $('lv-score'), overs: $('lv-overs'), target: $('lv-target'), required: $('lv-required'), balls: $('lv-balls'), chip: $('lv-chip'), finish: $('lv-finish'),
    stat: { crr: lv('crr'), rrr: lv('rrr'), extras: lv('extras'), wickets: lv('wickets'), overs: lv('overs'), target: lv('target'), required: lv('required') },
    rows: [row('a'), row('b')], pr: $('lv-pr'), pb: $('lv-pb'),
    bName: $('lv-bowler-name'), bo: $('lv-bo'), bm: $('lv-bm'), br: $('lv-br'), bw: $('lv-bw'), be: $('lv-be'), bHint: $('lv-bowler-hint'),
    controls: $('lv-controls'), notice: $('lv-notice'), noticeText: $('lv-notice-text'), noticeBtn: $('lv-notice-btn'),
    overTitle: $('lv-over-title'), overMeta: $('lv-over-meta'), strip: $('lv-strip'), commentary: $('lv-commentary'), summaries: $('lv-summaries'),
    saveState: $('save-state'), saveText: $('save-text'),
    cache: { overCount: -1, commentaryHead: null, summaryCount: -1, innings: -1 }
  };
}
export const liveBound = () => !!R;

const setText = (el, value) => { const v = String(value); if (el.textContent !== v) el.textContent = v; };
const setHidden = (el, hidden) => { if (el.hidden !== hidden) el.hidden = hidden; };

export function updateLive(match) {
  if (!R) return;
  const inn = Engine.currentInnings(match), d = inn.derived, m = Engine.currentMetrics(match);
  const bat = Engine.teamById(match, inn.battingTeamId), bowl = Engine.teamById(match, inn.bowlingTeamId);

  if (R.cache.innings !== inn.inningsNumber) {            // innings change: static labels
    R.cache.innings = inn.inningsNumber;
    setText(R.title, `${bat.name} vs ${bowl.name}`);
    setText(R.sub, `${inn.inningsNumber === 1 ? 'First innings' : 'Second innings'} · ${match.format.overs} overs`);
    setText(R.team, bat.name);
    setText(R.finish, inn.inningsNumber === 1 ? 'Finish innings' : 'Match details');
    R.cache.overCount = -1; R.cache.summaryCount = -1; R.cache.commentaryHead = null;
    R.strip.replaceChildren(); R.commentary.replaceChildren();
  }

  const score = `${d.total}/${d.wickets}`;
  setText(R.score, score);
  setText(R.overs, `${m.overs} / ${match.format.overs}`);
  setText(R.target, m.target ?? '—'); setText(R.required, m.runsRequired ?? '—'); setText(R.balls, m.ballsRemaining);
  setText(R.chip, inn.inningsNumber === 2 ? `Target ${m.target}` : 'First innings');
  setText(R.stat.crr, formatNumber(m.crr)); setText(R.stat.rrr, m.target == null ? '—' : formatNumber(m.rrr));
  setText(R.stat.extras, d.extras.total); setText(R.stat.wickets, d.wickets);
  setText(R.stat.overs, m.overs); setText(R.stat.target, m.target ?? '—'); setText(R.stat.required, m.runsRequired ?? '—');

  updateBatters(match, inn);
  const ps = currentPartnership(match);
  setText(R.pr, ps?.runs ?? 0); setText(R.pb, ps?.balls ?? 0);
  updateBowler(match, inn);
  updateOver(inn);
  updateCommentary(match, inn);
  updateSummaries(inn);
  updateControls(match);
}

function updateBatters(match, inn) {
  const d = inn.derived;
  const active = [inn.striker, inn.nonStriker].filter(Boolean);
  // Keep a batter in the row he already occupies; give newcomers a free row (wicket replacement = same row).
  for (const r of R.rows) if (r.id && !active.includes(r.id)) r.id = null;
  for (const id of active) if (!R.rows.some((r) => r.id === id)) { const free = R.rows.find((r) => !r.id); if (free) free.id = id; }
  for (const r of R.rows) {
    setHidden(r.el, !r.id);
    if (!r.id) continue;
    const s = d.batterStats[r.id] || { runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0 };
    setText(r.name, Engine.playerName(match, r.id));
    setHidden(r.dot, r.id !== inn.striker);
    setText(r.r, s.runs); setText(r.b, s.balls); setText(r.f4, s.fours); setText(r.s6, s.sixes); setText(r.sr, formatNumber(s.strikeRate)); setText(r.num, s.runs);
    r.el.classList.toggle('on-strike', r.id === inn.striker);
  }
}

function updateBowler(match, inn) {
  const d = inn.derived;
  if (!inn.currentBowler) { setText(R.bName, 'Not selected'); setText(R.bHint, 'Choose the bowler for the next over'); setText(R.bo, '—'); setText(R.bm, '—'); setText(R.br, '—'); setText(R.bw, '—'); setText(R.be, '—'); return; }
  const s = d.bowlerStats[inn.currentBowler] || { legalBalls: 0, maidens: 0, conceded: 0, wickets: 0, economy: 0 };
  setText(R.bName, Engine.playerName(match, inn.currentBowler, 'Bowler')); setText(R.bHint, 'Bowler for this over');
  setText(R.bo, formatOvers(s.legalBalls)); setText(R.bm, s.maidens); setText(R.br, s.conceded); setText(R.bw, s.wickets); setText(R.be, formatNumber(s.economy));
}

/* ---- keyed list helpers: change only the rows that were added/removed ---- */

function ballDot(del) {
  const el = document.createElement('span');
  el.className = `ball-dot ${del.wicket ? 'wicket-dot' : ''}`;
  el.dataset.id = del.deliveryId;
  el.textContent = Engine.ballLabel(del);
  el.setAttribute('aria-label', Engine.ballLabel(del));
  return el;
}

function updateOver(inn) {
  const d = inn.derived;
  const balls = [];
  for (let i = inn.deliveries.length - 1; i >= 0 && inn.deliveries[i].over === d.over; i--) balls.unshift(inn.deliveries[i]);
  if (R.cache.overCount !== d.over) { R.cache.overCount = d.over; R.strip.replaceChildren(); setText(R.overTitle, `Over ${d.over}`); }
  const strip = R.strip;
  const want = new Set(balls.map((b) => b.deliveryId));
  for (let c = strip.lastElementChild; c; c = strip.lastElementChild) { if (want.has(c.dataset.id)) break; c.remove(); }
  const have = new Set([...strip.children].map((c) => c.dataset.id));
  for (const b of balls) if (!have.has(b.deliveryId)) strip.appendChild(ballDot(b));
  if (!balls.length) { if (!strip.querySelector('.empty-note')) { const s = document.createElement('span'); s.className = 'small empty-note'; s.textContent = 'No balls yet'; strip.replaceChildren(s); } }
  else strip.querySelector('.empty-note')?.remove();
  const lastId = balls.length ? balls[balls.length - 1].deliveryId : null;
  strip.querySelectorAll('.latest').forEach((el) => { if (el.dataset.id !== lastId) el.classList.remove('latest'); });
  if (lastId) strip.querySelector(`[data-id="${lastId}"]`)?.classList.add('latest');
  setText(R.overMeta, `${balls.length} deliveries · ${d.overSummaries.length} completed overs`);
}

function commentaryItem(match, del) {
  const el = document.createElement('div');
  el.className = 'commentary-item';
  el.dataset.id = del.deliveryId;
  const title = document.createElement('div'); title.className = 'commentary-title'; title.textContent = Engine.deliveryCommentary(match, del);
  const time = document.createElement('span'); time.className = 'commentary-time'; time.textContent = `${formatTime(del.timestamp)} · ${Engine.playerName(match, del.bowler, 'Bowler')}`;
  el.append(title, time);
  return el;
}

function updateCommentary(match, inn) {
  const box = R.commentary;
  const items = [];
  for (let i = inn.deliveries.length - 1; i >= 0 && items.length < COMMENTARY_LIMIT; i--) items.push(inn.deliveries[i]);   // newest first
  if (!items.length) {
    if (!box.querySelector('.empty')) box.innerHTML = '<div class="empty" style="padding:28px"><strong>Ready for the first ball</strong><span class="small">Start scoring to build the live commentary.</span></div>';
    R.cache.commentaryHead = null; return;
  }
  box.querySelector('.empty')?.remove();
  const want = new Set(items.map((x) => x.deliveryId));
  [...box.children].forEach((c) => { if (!want.has(c.dataset.id)) c.remove(); });
  items.forEach((del, i) => {
    if (box.children[i]?.dataset.id !== del.deliveryId) box.insertBefore(commentaryItem(match, del), box.children[i] || null);
  });
  const head = items[0].deliveryId;
  if (R.cache.commentaryHead !== head) {
    box.querySelectorAll('.latest').forEach((el) => el.classList.remove('latest'));
    box.firstElementChild?.classList.add('latest');
    R.cache.commentaryHead = head;
  }
}

function updateSummaries(inn) {
  const list = inn.derived.overSummaries;
  if (R.cache.summaryCount === list.length) return;
  R.cache.summaryCount = list.length;
  R.summaries.innerHTML = list.slice().reverse().map((o) => `<div class="card summary-row"><div class="live-row"><strong>Over ${o.over}${o.maiden ? ' · Maiden' : ''}</strong><span>${o.runs} runs · ${o.wickets} wicket${o.wickets === 1 ? '' : 's'}</span></div><div class="small" style="margin-top:6px">${o.balls.map(escapeHtml).join(' | ')} · ${escapeHtml(o.bowlerName)}</div></div>`).join('') || '<div class="small">No completed overs yet.</div>';
}

/** What (if anything) blocks the next ball + the single action that fixes it. */
export function blockedAction(match) {
  const reason = Engine.scoringBlockReason(match);
  if (!reason) return null;
  const inn = Engine.currentInnings(match);
  if (match.status === 'completed' || Engine.isInningsOver(match, inn)) return { reason, action: null };
  if (!inn.striker || !inn.nonStriker) return { reason, action: 'openers', label: 'Select players' };
  return { reason, action: 'bowler', label: 'Select bowler' };
}

function updateControls(match) {
  const block = blockedAction(match);
  setHidden(R.notice, !block);
  R.controls.classList.toggle('is-blocked', !!block);
  if (block) {
    setText(R.noticeText, block.reason);
    setHidden(R.noticeBtn, !block.action);
    if (block.action) { R.noticeBtn.dataset.fix = block.action; setText(R.noticeBtn, block.label); }
  }
}

const SAVE_TEXT = { saved: 'Saved locally', saving: 'Saving…', error: 'Not saved — export a backup' };
export function showSaveStatus(status) {
  if (!R) return;
  setText(R.saveText, SAVE_TEXT[status] || SAVE_TEXT.saved);
  R.saveState.dataset.status = status;
}

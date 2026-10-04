/** Modals used while scoring. They only build HTML and read form values; app.js decides what to do with them. */
import { escapeHtml, formatOvers } from '../utils/helpers.js';
import { openModal, modalShell } from '../components/ui.js';
import { DISMISSALS } from '../data/defaults.js';
import * as Engine from '../scoring/engine.js';

const $ = (id) => document.getElementById(id);
const options = (players, selected = null) => players.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
const field = (label, control, id) => `<div class="form-field" style="margin-top:12px"><label for="${id}">${label}</label>${control}</div>`;

/* ---------------------------------------------------------------- openers */

export function openOpenersModal(match) {
  const inn = Engine.currentInnings(match);
  const bat = Engine.teamById(match, inn.battingTeamId), bowl = Engine.teamById(match, inn.bowlingTeamId);
  const striker = inn.striker || bat.players[0]?.id, non = inn.nonStriker || bat.players.find((p) => p.id !== striker)?.id;
  openModal(modalShell(inn.inningsNumber === 1 ? 'Start innings' : 'Start second innings',
    `<p class="small">${escapeHtml(bat.name)} bat · ${escapeHtml(bowl.name)} bowl</p>
    ${field('Striker', `<select id="modal-striker">${options(bat.players, striker)}</select>`, 'modal-striker')}
    ${field('Non-striker', `<select id="modal-nonstriker">${options(bat.players, non)}</select>`, 'modal-nonstriker')}
    ${field('Opening bowler', `<select id="modal-bowler">${options(bowl.players, inn.currentBowler)}</select>`, 'modal-bowler')}`,
    `<button type="button" class="primary-btn" data-action="confirm-openers">Start scoring</button>`), { label: 'Select openers' });
}
export const readOpeners = () => ({ striker: $('modal-striker').value, nonStriker: $('modal-nonstriker').value, bowler: $('modal-bowler').value });

/* ----------------------------------------------------------------- bowler */

export function openBowlerModal(match, { afterOver = false } = {}) {
  const inn = Engine.currentInnings(match);
  const choices = Engine.bowlerChoices(match);
  const first = choices.find((c) => !c.barred)?.player.id;
  const last = inn.derived.overSummaries[inn.derived.overSummaries.length - 1];
  openModal(modalShell(afterOver ? `Over ${last?.over ?? ''} complete` : 'Choose bowler',
    `<p class="small">${afterOver ? `${escapeHtml(last?.bowlerName || 'Bowler')} bowled ${last?.runs ?? 0} run${last?.runs === 1 ? '' : 's'}${last?.maiden ? ' (maiden)' : ''}. Strike has changed. ` : ''}Select the bowler for over ${inn.derived.over}.</p>
    ${field('Bowler', `<select id="modal-next-bowler">${choices.map((c) => `<option value="${c.player.id}" ${c.barred ? 'disabled' : ''} ${c.player.id === (inn.currentBowler || first) ? 'selected' : ''}>${escapeHtml(c.player.name)}${c.barred ? ' (bowled last over)' : ''}</option>`).join('')}</select>`, 'modal-next-bowler')}`,
    `<button type="button" class="primary-btn" data-action="confirm-bowler">Use bowler</button>`), { label: 'Select bowler' });
}
export const readBowler = () => $('modal-next-bowler').value;

/* ------------------------------------------------------------------ extras */

const EXTRA_LABEL = { wide: 'Wide', 'no-ball': 'No Ball', bye: 'Bye', 'leg-bye': 'Leg Bye' };
const quick = (target, values) => `<div class="quick-fill" role="group" aria-label="Quick values">${values.map((v) => `<button type="button" class="choice" data-fill="${target}" data-value="${v}">${v}</button>`).join('')}</div>`;

export function openExtraModal(type, mode = 'add') {
  let body;
  if (type === 'wide') body = `<p class="small">A wide is not a legal ball. 1 = the wide only; add any extra runs that were run.</p>${field('Total wide runs', `<input id="extra-amount" type="number" inputmode="numeric" min="1" max="20" value="1">`, 'extra-amount')}${quick('extra-amount', [1, 2, 3, 4, 5])}`;
  else if (type === 'no-ball') body = `<p class="small">A no-ball is not a legal ball and costs 1 run. Add what the batter hit and any byes run.</p>${field('Runs off the bat', `<input id="extra-batter" type="number" inputmode="numeric" min="0" max="6" value="0">`, 'extra-batter')}${quick('extra-batter', [0, 1, 2, 3, 4, 6])}${field('Byes run off the no-ball (optional)', `<input id="extra-byes" type="number" inputmode="numeric" min="0" max="19" value="0">`, 'extra-byes')}`;
  else body = `<p class="small">${type === 'bye' ? 'Byes' : 'Leg byes'} count as a legal ball. The runs go to the team, not the batter.</p>${field('Runs', `<input id="extra-amount" type="number" inputmode="numeric" min="1" max="20" value="1">`, 'extra-amount')}${quick('extra-amount', [1, 2, 3, 4])}`;
  openModal(modalShell(`${mode === 'edit' ? 'Change last ball to ' : ''}${EXTRA_LABEL[type]}`, body,
    `<button type="button" class="secondary-btn" data-action="close-modal">Cancel</button><button type="button" class="primary-btn" data-action="confirm-extra" data-type="${type}" data-mode="${mode}">Record ${EXTRA_LABEL[type]}</button>`), { label: EXTRA_LABEL[type] });
}
export function readExtra(type) {
  const num = (id, fallback) => { const el = $(id); return el && el.value !== '' ? Number(el.value) : fallback; };
  if (type === 'no-ball') return { type, amount: 1 + num('extra-byes', 0), batterRuns: num('extra-batter', 0) };
  return { type, amount: num('extra-amount', 1), batterRuns: 0 };
}

/* ------------------------------------------------------------------ wicket */

/** `m` is the match whose active batters/available batters the wicket applies to (a pre-ball preview when editing). */
export function openWicketModal(m, mode = 'add') {
  const inn = Engine.currentInnings(m);
  const bat = Engine.teamById(m, inn.battingTeamId);
  const active = [inn.striker, inn.nonStriker].filter(Boolean).map((id) => bat.players.find((p) => p.id === id));
  const available = Engine.availableBatters(m, inn);
  const willEnd = inn.derived.wickets + 1 >= Engine.maxWicketsFor(m, inn) || available.length === 0;
  openModal(modalShell(mode === 'edit' ? 'Change last ball to a wicket' : 'Wicket',
    `${field('How out', `<select id="dismissal-type">${DISMISSALS.map((d) => `<option value="${d.value}">${d.label}</option>`).join('')}</select>`, 'dismissal-type')}
    ${field('Batter out', `<select id="dismissed-player">${options(active, inn.striker)}</select>`, 'dismissed-player')}
    <div id="wk-delivery-row">${field('Ball type', `<select id="wk-extra"><option value="">Normal ball</option><option value="wide">Wide</option><option value="no-ball">No ball</option></select>`, 'wk-extra')}</div>
    <div id="wk-runs-row" hidden>${field('Runs completed before the run-out', `<select id="wk-runs">${[0, 1, 2, 3, 4, 5, 6].map((r) => `<option value="${r}">${r}</option>`).join('')}</select>`, 'wk-runs')}</div>
    ${willEnd ? `<p class="small notice-inline" id="wk-end-note">This wicket ends the innings — no new batter needed.</p>` : field('New batter', `<select id="new-batter"><option value="">Select new batter</option>${options(available)}</select>`, 'new-batter')}
    <p class="small" style="margin-top:12px">Bowled, caught, LBW, stumped and hit-wicket are credited to the bowler. Run-out, retired and other are not. Retired does not use a ball.</p>`,
    `<button type="button" class="secondary-btn" data-action="close-modal">Cancel</button><button type="button" class="danger-btn" data-action="confirm-wicket" data-mode="${mode}">Confirm Wicket</button>`), { label: 'Wicket' });
}
export function syncWicketForm() {
  const type = $('dismissal-type')?.value;
  const runs = $('wk-runs-row'), delivery = $('wk-delivery-row');
  if (runs) runs.hidden = type !== 'run-out';
  if (delivery) delivery.hidden = type === 'retired';
  if (type !== 'run-out' && $('wk-runs')) $('wk-runs').value = '0';
  if (type === 'retired' && $('wk-extra')) $('wk-extra').value = '';
}
export function readWicket() {
  return {
    kind: 'wicket', dismissalType: $('dismissal-type').value, dismissedPlayer: $('dismissed-player').value,
    newBatterId: $('new-batter')?.value || null, runs: Number($('wk-runs')?.value || 0), onExtra: $('wk-extra')?.value || null
  };
}

/* --------------------------------------------------------------- edit last */

export function openEditModal(match, lastLabel) {
  openModal(modalShell('Edit last ball',
    `<p class="small">Last ball: <strong>${escapeHtml(lastLabel)}</strong>. Pick what actually happened — the old ball is replaced in one step, and kept if the new one is not valid.</p>
    <div class="controls-label">Runs</div><div class="choice-grid choice-grid-4">${[0, 1, 2, 3, 4, 5, 6].map((r) => `<button type="button" class="choice" data-edit-runs="${r}">${r}</button>`).join('')}</div>
    <div class="controls-label">Extras</div><div class="choice-grid"><button type="button" class="choice" data-edit-extra="wide">Wide</button><button type="button" class="choice" data-edit-extra="no-ball">No Ball</button><button type="button" class="choice" data-edit-extra="bye">Bye</button><button type="button" class="choice" data-edit-extra="leg-bye">Leg Bye</button></div>
    <div class="controls-label">Wicket</div><div class="choice-grid"><button type="button" class="choice" data-edit-wicket="1">Wicket…</button></div>`), { label: 'Edit last ball' });
}

/* ----------------------------------------------------------- innings break */

export function openInningsBreakModal(match) {
  const first = match.innings[0];
  const team = Engine.teamById(match, first.battingTeamId);
  openModal(modalShell('Innings Break',
    `<div class="result-box"><div class="result-title">${escapeHtml(team.name)}</div><div class="result-main">${first.derived.total}/${first.derived.wickets}</div><div class="result-meta">${formatOvers(first.derived.legalBalls)} overs · Target ${first.derived.total + 1}</div></div>`,
    `<button type="button" class="secondary-btn" data-action="undo-from-break">Undo last ball</button><button type="button" class="primary-btn" data-action="start-second">START SECOND INNINGS</button>`), { label: 'Innings break' });
}

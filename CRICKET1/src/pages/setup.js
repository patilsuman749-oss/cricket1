/** New Match setup page: rendering only. All rules live in setup-validation.js. */
import { icon } from '../components/icons.js';
import { escapeHtml } from '../utils/helpers.js';
import { state } from '../state/store.js';
import { STEPS, STEP_LABELS, PRESET_OVERS, MIN_PLAYERS, stepName, visibleErrors, battingFirstName } from './setup-validation.js';

const hasError = (errors, field) => errors.some((e) => e.field === field);
const errAttrs = (errors, field) => (hasError(errors, field) ? ' aria-invalid="true" class="has-error"' : '');

function errorBanner(errors) {
  return `<div id="setup-errors" class="form-errors" role="alert" aria-live="assertive" ${errors.length ? '' : 'hidden'}>${errors.length ? `<strong>Please fix:</strong><ul>${errors.map((e) => `<li>${escapeHtml(e.message)}</li>`).join('')}</ul>` : ''}</div>`;
}

export function renderSetup() {
  const s = state.setup;
  const errors = visibleErrors(s);        // ← the ONLY errors this screen may show
  const name = stepName(s);
  const body = { format: stepFormat, teams: stepTeams, players: stepPlayers, toss: stepToss, confirm: stepConfirm }[name](s, errors);
  return `<div class="page-head"><div><div class="page-kicker">Match setup</div><h1>New Match</h1><p class="subtle">Set it up once, then score from the ground.</p></div><div class="chip" aria-live="polite">Step ${s.step} of 5 · ${STEP_LABELS[name]}</div></div>
    <nav class="card step-tabs" aria-label="Setup steps">${STEPS.map((x, i) => `<button type="button" class="step-option ${s.step === i + 1 ? 'active' : ''}" data-step="${i + 1}" ${s.step === i + 1 ? 'aria-current="step"' : ''}>${i + 1}. ${STEP_LABELS[x]}</button>`).join('')}</nav>
    <section class="section" id="setup-body">${body}</section>`;
}

const nav = (back = true, next = 'Next') => `<div class="setup-actions">${back ? `<button type="button" class="secondary-btn" data-action="setup-back">${icon('back', 16)} Back</button>` : '<span></span>'}<button type="button" class="primary-btn" data-action="setup-next">${next} ${icon('arrow', 16)}</button></div>`;

function stepFormat(s, errors) {
  const custom = s.customOvers;
  return `<div class="card"><div class="card-header"><div><h2>Match format</h2><div class="small">Overs per innings.</div></div></div>${errorBanner(errors)}
    <div class="stepper" role="group" aria-label="Overs per innings">${PRESET_OVERS.map((x) => `<button type="button" class="step-option ${!custom && s.formatOvers === x ? 'active' : ''}" data-format="${x}" aria-pressed="${!custom && s.formatOvers === x}">T${x}</button>`).join('')}<button type="button" class="step-option ${custom ? 'active' : ''}" data-format="custom" aria-pressed="${custom}">Custom Overs</button></div>
    ${custom ? `<div class="form-field" style="margin-top:14px;max-width:250px"><label for="custom-overs">Custom overs</label><input id="custom-overs" data-setup="overs" data-field="overs" type="number" inputmode="numeric" min="1" max="100" value="${Number.isFinite(s.formatOvers) ? s.formatOvers : ''}"${errAttrs(errors, 'overs')}></div>` : ''}
    ${nav(false)}</div>`;
}

function stepTeams(s, errors) {
  return `<div class="card"><div class="card-header"><div><h2>Team setup</h2><div class="small">Just the two team names. Player names come next.</div></div></div>${errorBanner(errors)}
    <div class="form-grid">
      <div class="form-field"><label for="team1-name">Team 1 Name</label><input id="team1-name" data-setup="team-name" data-team="team1" data-field="team1-name" value="${escapeHtml(s.team1.name)}" placeholder="e.g. Team A" autocomplete="off" autocapitalize="words" enterkeyhint="next"${errAttrs(errors, 'team1-name')}></div>
      <div class="form-field"><label for="team2-name">Team 2 Name</label><input id="team2-name" data-setup="team-name" data-team="team2" data-field="team2-name" value="${escapeHtml(s.team2.name)}" placeholder="e.g. Team B" autocomplete="off" autocapitalize="words" enterkeyhint="done"${errAttrs(errors, 'team2-name')}></div>
      <div class="form-field"><label for="team1-color">Team 1 Color</label><input id="team1-color" data-setup="team-color" data-team="team1" type="color" value="${s.team1.color}"></div>
      <div class="form-field"><label for="team2-color">Team 2 Color</label><input id="team2-color" data-setup="team-color" data-team="team2" type="color" value="${s.team2.color}"></div>
    </div>${nav()}</div>`;
}

function playerEditor(s, key, errors) {
  const list = s[`${key}Players`];
  const team = escapeHtml(s[key].name.trim() || (key === 'team1' ? 'Team 1' : 'Team 2'));
  return `<div class="card player-editor-card"><div class="card-header"><div><h2>${team}</h2><div class="small">Player names only.</div></div><span class="chip">${list.length} players</span></div>
    <div class="player-rows">${list.map((p, i) => {
      const field = `${key}-player-${i + 1}`;
      return `<div class="player-row"><span class="player-index" aria-hidden="true">${i + 1}</span><input data-setup="player" data-team="${key}" data-index="${i}" data-field="${field}" value="${escapeHtml(p.name)}" placeholder="Player ${i + 1}" autocomplete="off" autocapitalize="words" enterkeyhint="next" aria-label="${team} player ${i + 1} name"${errAttrs(errors, field)}>${list.length > MIN_PLAYERS ? `<button type="button" class="remove-row" data-action="remove-player" data-team="${key}" data-index="${i}" aria-label="Remove player ${i + 1}" title="Remove player">${icon('trash', 17)}</button>` : '<span class="row-spacer"></span>'}</div>`;
    }).join('')}</div>
    <button type="button" class="secondary-btn add-player" data-action="add-player" data-team="${key}">${icon('plus', 15)} Add Player</button></div>`;
}

function stepPlayers(s, errors) {
  return `<div class="card player-setup-intro"><div class="page-kicker">Player setup</div><h2>Enter player names</h2><p class="subtle">That’s all. Two players per team to start — tap <strong>Add Player</strong> for more.</p>${errorBanner(errors)}</div>${playerEditor(s, 'team1', errors)}<div style="height:14px"></div>${playerEditor(s, 'team2', errors)}${nav()}`;
}

function stepToss(s, errors) {
  const t1 = escapeHtml(s.team1.name), t2 = escapeHtml(s.team2.name);
  const pick = (cond) => `${cond ? 'active' : ''}" aria-pressed="${cond}`;
  return `<div class="card"><div class="card-header"><div><h2>Toss</h2><div class="small">Who won the toss, and what did they choose?</div></div></div>${errorBanner(errors)}
    <div class="controls-label">Toss winner</div><div class="choice-grid"><button type="button" class="choice ${pick(s.tossWinner === 'team1')}" data-toss-winner="team1">${t1}</button><button type="button" class="choice ${pick(s.tossWinner === 'team2')}" data-toss-winner="team2">${t2}</button></div>
    <div class="controls-label">Decision</div><div class="choice-grid"><button type="button" class="choice ${pick(s.tossDecision === 'bat')}" data-toss-decision="bat">Bat</button><button type="button" class="choice ${pick(s.tossDecision === 'bowl')}" data-toss-decision="bowl">Bowl</button></div>${nav()}</div>`;
}

function stepConfirm(s) {
  const first = battingFirstName(s);
  const winner = s.tossWinner ? escapeHtml(s[s.tossWinner].name) : '—';
  const stat = (label, value) => `<div class="stat-card card"><span class="stat-label">${label}</span><span class="stat-value" style="font-size:18px">${value}</span></div>`;
  const roster = (key) => `<div class="small"><strong>${escapeHtml(s[key].name)}:</strong> ${s[`${key}Players`].map((p) => escapeHtml(p.name || '—')).join(', ')}</div>`;
  return `<div class="card"><div class="card-header"><div><h2>Match confirmation</h2><div class="small">Check everything before the first ball.</div></div></div><div id="setup-errors" class="form-errors" role="alert" hidden></div>
    <div class="grid grid-2">${stat('Teams', `${escapeHtml(s.team1.name)} vs ${escapeHtml(s.team2.name)}`)}${stat('Format', `${s.formatOvers} Overs`)}${stat('Toss winner', winner)}${stat('Decision', escapeHtml((s.tossDecision || '—').toUpperCase()))}${stat('Batting first', escapeHtml(first?.batting || '—'))}${stat('Bowling first', escapeHtml(first?.bowling || '—'))}</div>
    <div style="margin-top:14px;display:grid;gap:4px">${roster('team1')}${roster('team2')}</div>
    <div class="setup-actions"><button type="button" class="secondary-btn" data-action="setup-back">${icon('back', 16)} Back</button><button type="button" class="primary-btn" data-action="start-match">${icon('play', 16)} START MATCH</button></div></div>`;
}

/** After an error render: bring the first invalid field into view (mobile keyboards hide it otherwise). */
export function focusFirstInvalid() {
  const el = document.querySelector('#setup-body [aria-invalid="true"]');
  if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'auto' }); }
  else document.querySelector('#setup-errors:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'auto' });
}

/** Cheap in-place clear (no re-render) used while typing. */
export function clearErrorUI() {
  const banner = document.getElementById('setup-errors');
  if (banner && !banner.hidden) { banner.hidden = true; banner.replaceChildren(); }
  document.querySelectorAll('#setup-body [aria-invalid]').forEach((el) => { el.removeAttribute('aria-invalid'); el.classList.remove('has-error'); });
}

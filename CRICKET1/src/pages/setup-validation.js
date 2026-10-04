/**
 * New-match setup: step model + per-step validation. Pure functions, no DOM, no toasts.
 *
 * ROOT-CAUSE NOTE
 * The old code validated through ad-hoc `if (step === n)` branches in a click handler and reported
 * every problem through one global toast that had no idea which step it belonged to. Anything that
 * ran the player check (START MATCH, a stale cached bundle, a stray extra tap) surfaced
 * "<team>: enter a name for player 1." no matter what step the screen showed.
 *
 * Now every validator returns errors tagged with the step they belong to:
 *     { step: 'players', field: 'team1-player-1', message: 'Enter a name for Player 1' }
 * and the UI only ever renders `visibleErrors(setup)` = errors whose step === the active step.
 * Errors are wiped on every navigation, edit, reset and successful Next.
 */

export const STEPS = ['format', 'teams', 'players', 'toss', 'confirm'];
export const STEP_LABELS = { format: 'Format', teams: 'Teams', players: 'Players', toss: 'Toss', confirm: 'Confirm' };
export const PRESET_OVERS = [5, 10, 20, 30, 50];
export const MIN_PLAYERS = 2;
export const MAX_NAME = 30;

let playerSeq = 0;
const newPlayer = () => ({ id: `sp-${Date.now().toString(36)}-${(playerSeq++).toString(36)}`, name: '' });

export function createSetupState() {
  return {
    step: 1,                       // 1..5, index into STEPS
    formatOvers: 20,
    customOvers: false,
    team1: { id: 'team1', name: 'Team A', color: '#0f5bd7' },
    team2: { id: 'team2', name: 'Team B', color: '#2d7ff3' },
    team1Players: [newPlayer(), newPlayer()],
    team2Players: [newPlayer(), newPlayer()],
    tossWinner: null,
    tossDecision: null,
    errors: []                     // [{step, field, message}]
  };
}

export const stepName = (setup) => STEPS[setup.step - 1];
const err = (step, field, message) => ({ step, field, message });
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

/* ---------------------------------------------------------- one validator per step */

export function validateFormatStep(s) {
  const out = [];
  const overs = Number(s.formatOvers);
  if (!Number.isInteger(overs) || overs < 1 || overs > 100) out.push(err('format', 'overs', 'Enter overs between 1 and 100'));
  return out;
}

export function validateTeamsStep(s) {
  const out = [];
  const a = clean(s.team1.name), b = clean(s.team2.name);
  if (!a) out.push(err('teams', 'team1-name', 'Enter Team 1 name'));
  else if (a.length > MAX_NAME) out.push(err('teams', 'team1-name', `Team 1 name must be ${MAX_NAME} characters or fewer`));
  if (!b) out.push(err('teams', 'team2-name', 'Enter Team 2 name'));
  else if (b.length > MAX_NAME) out.push(err('teams', 'team2-name', `Team 2 name must be ${MAX_NAME} characters or fewer`));
  if (a && b && a.toLowerCase() === b.toLowerCase()) out.push(err('teams', 'team2-name', 'Team names must be different'));
  return out;
}

export function validatePlayersStep(s) {
  const out = [];
  for (const key of ['team1', 'team2']) {
    const list = s[`${key}Players`];
    const team = clean(s[key].name) || (key === 'team1' ? 'Team 1' : 'Team 2');
    if (list.length < MIN_PLAYERS) out.push(err('players', `${key}-count`, `Add at least ${MIN_PLAYERS} players to ${team}`));
    const seen = new Map();
    list.forEach((p, i) => {
      const name = clean(p.name);
      const field = `${key}-player-${i + 1}`;
      if (!name) { out.push(err('players', field, `${team}: enter a name for Player ${i + 1}`)); return; }
      if (name.length > MAX_NAME) { out.push(err('players', field, `${team}: Player ${i + 1}'s name is too long`)); return; }
      const k = name.toLowerCase();
      if (seen.has(k)) out.push(err('players', field, `${team}: "${name}" is already used (Player ${seen.get(k)})`));
      else seen.set(k, i + 1);
    });
  }
  return out;
}

export function validateTossStep(s) {
  const out = [];
  if (s.tossWinner !== 'team1' && s.tossWinner !== 'team2') out.push(err('toss', 'toss-winner', 'Choose who won the toss'));
  if (s.tossDecision !== 'bat' && s.tossDecision !== 'bowl') out.push(err('toss', 'toss-decision', 'Choose bat or bowl'));
  return out;
}

/** The summary screen is read-only: it validates nothing by itself (START MATCH does the full check). */
export function validateConfirmationStep() { return []; }

export const STEP_VALIDATORS = {
  format: validateFormatStep, teams: validateTeamsStep, players: validatePlayersStep, toss: validateTossStep, confirm: validateConfirmationStep
};

/* ---------------------------------------------------------------- state machine */

/** Errors that belong to the screen the user is looking at — and nothing else. */
export function visibleErrors(s) { return s.errors.filter((e) => e.step === stepName(s)); }

export function clearErrors(s, field = null) {
  s.errors = field ? s.errors.filter((e) => e.field !== field) : [];
}

/** Next: validate ONLY the current step. */
export function advance(s) {
  const errors = STEP_VALIDATORS[stepName(s)](s);
  if (errors.length) { s.errors = errors; return { ok: false, errors }; }
  s.errors = [];
  s.step = Math.min(STEPS.length, s.step + 1);
  return { ok: true, errors: [] };
}

export function goBack(s) { s.errors = []; s.step = Math.max(1, s.step - 1); }

/** Jump via the step tabs. Going back is free; going forward validates every step on the way. */
export function goToStep(s, target) {
  target = Math.max(1, Math.min(STEPS.length, Number(target) || s.step));
  if (target <= s.step) { s.errors = []; s.step = target; return { ok: true, errors: [] }; }
  while (s.step < target) {
    const r = advance(s);
    if (!r.ok) return r;
  }
  return { ok: true, errors: [] };
}

/** START MATCH: run every step's own validator in order; stop at (and show) the first step that fails. */
export function validateAllForStart(s) {
  for (let i = 0; i < 4; i++) {
    const name = STEPS[i];
    const errors = STEP_VALIDATORS[name](s);
    if (errors.length) { s.step = i + 1; s.errors = errors; return { ok: false, step: name, errors }; }
  }
  s.errors = [];
  return { ok: true, errors: [] };
}

/* ------------------------------------------------------------------- mutations */

export function addPlayer(s, key) { s[`${key}Players`].push(newPlayer()); s.errors = []; return s[`${key}Players`].length - 1; }
export function removePlayer(s, key, index) {
  const list = s[`${key}Players`];
  if (list.length <= MIN_PLAYERS) return false;
  list.splice(index, 1); s.errors = []; return true;
}
export function setPlayerName(s, key, index, value) { const p = s[`${key}Players`][index]; if (p) p.name = value; s.errors = []; }
export function setTeamName(s, key, value) { s[key].name = value; s.errors = []; }
export function setFormat(s, value) {
  if (value === 'custom') { s.customOvers = true; if (PRESET_OVERS.includes(s.formatOvers)) s.formatOvers = 12; }
  else { s.customOvers = false; s.formatOvers = Number(value); }
  s.errors = [];
}
export function setCustomOvers(s, value) { s.formatOvers = value === '' ? NaN : Number(value); s.errors = []; }
export function setToss(s, { winner, decision }) {
  if (winner) s.tossWinner = winner;
  if (decision) s.tossDecision = decision;
  s.errors = [];
}

/** Cleaned payload for createMatch (trimmed names, no stray metadata). */
export function toMatchConfig(s) {
  const players = (list) => list.map((p) => ({ id: p.id, name: clean(p.name) }));
  return {
    formatOvers: Number(s.formatOvers),
    team1: { id: 'team1', name: clean(s.team1.name) }, team2: { id: 'team2', name: clean(s.team2.name) },
    color1: s.team1.color, color2: s.team2.color,
    team1Players: players(s.team1Players), team2Players: players(s.team2Players),
    tossWinner: s.tossWinner, tossDecision: s.tossDecision
  };
}

export function battingFirstName(s) {
  if (!s.tossWinner || !s.tossDecision) return null;
  const winner = s.tossWinner, bats = s.tossDecision === 'bat';
  const first = (winner === 'team1') === bats ? 'team1' : 'team2';
  return { batting: clean(s[first].name), bowling: clean(s[first === 'team1' ? 'team2' : 'team1'].name) };
}

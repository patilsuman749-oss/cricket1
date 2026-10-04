/**
 * CRICKET1 scoring engine.
 *
 * Source of truth  : `innings.deliveries` (append-only ball-by-ball history).
 * Derived state    : `innings.derived` (score, wickets, batter/bowler stats, partnership,
 *                    over summaries …). It is recomputed from the history in O(deliveries)
 *                    — a few microseconds for a T20 — and is NEVER persisted
 *                    (see `serializeMatch`). That is what makes undo / edit trivially correct:
 *                    remove a delivery, recompute.
 *
 * No DOM, no storage, no globals: pure data in, pure data out (easy to unit-test).
 */
import { uid, matchId as makeMatchId, formatOvers } from '../utils/helpers.js';

export const BALLS_PER_OVER = 6;
export const SCHEMA_VERSION = 2;
export const EXTRA_TYPES = ['wide', 'no-ball', 'bye', 'leg-bye'];
/** Dismissals credited to the bowler. */
export const BOWLER_CREDIT = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit-wicket']);
export const DISMISSAL_TYPES = ['bowled', 'caught', 'lbw', 'run-out', 'stumped', 'hit-wicket', 'retired', 'other'];
/** Dismissals that are legal on an illegal delivery. */
const ALLOWED_ON_WIDE = new Set(['run-out', 'stumped', 'hit-wicket', 'other']);
const ALLOWED_ON_NO_BALL = new Set(['run-out', 'other']);

/* ------------------------------------------------------------------ creation */

export function createMatch({ formatOvers: overs, team1, team2, tossWinner, tossDecision, team1Players, team2Players, color1 = '#0f5bd7', color2 = '#2d7ff3' }) {
  const overCount = Number(overs);
  if (!Number.isInteger(overCount) || overCount < 1 || overCount > 100) throw new Error('Overs must be a whole number from 1 to 100.');
  if (![team1.id, team2.id].includes(tossWinner)) throw new Error('Choose the toss winner.');
  if (!['bat', 'bowl'].includes(tossDecision)) throw new Error('Choose bat or bowl.');
  const withIds = (list) => list.map((p) => ({ id: p.id || uid('player'), name: String(p.name).trim() }));
  const p1 = withIds(team1Players), p2 = withIds(team2Players);
  if (p1.length < 2 || p2.length < 2) throw new Error('Each team needs at least two players.');
  const battingFirstId = (tossWinner === team1.id) === (tossDecision === 'bat') ? team1.id : team2.id;
  const stamp = new Date().toISOString();
  const match = {
    schemaVersion: SCHEMA_VERSION,
    matchId: makeMatchId(),
    status: 'active',
    createdAt: stamp,
    updatedAt: stamp,
    format: { overs: overCount },
    teams: [{ ...team1, color: color1, players: p1 }, { ...team2, color: color2, players: p2 }],
    toss: { winner: tossWinner, decision: tossDecision },
    innings: [],
    currentInningsIndex: 0,
    result: null,
    cloud: { readyForMatchSharing: true }
  };
  startInnings(match, battingFirstId, false);
  return match;
}

export function startInnings(match, battingTeamId, second = false) {
  const bowlingTeamId = match.teams.find((t) => t.id !== battingTeamId).id;
  const inn = {
    inningsNumber: match.innings.length + 1,
    battingTeamId, bowlingTeamId,
    target: null,
    striker: null, nonStriker: null, currentBowler: null,
    deliveries: []
  };
  if (second && match.innings[0]) inn.target = match.innings[0].derived.total + 1;
  inn.derived = deriveInnings(match, inn);
  match.innings.push(inn);
  match.currentInningsIndex = match.innings.length - 1;
  touch(match);
  return inn;
}

/**
 * Upgrade/repair a match loaded from storage or an import file and (re)compute derived state.
 * Handles records written by CRICKET1 v1 (match-level `current`, cached stats, undo snapshots).
 */
export function hydrateMatch(match) {
  if (!match || !Array.isArray(match.teams) || !Array.isArray(match.innings)) throw new Error('Invalid match record.');
  const legacyCurrent = match.current;
  delete match.snapshots;
  delete match.current;
  match.schemaVersion = SCHEMA_VERSION;
  match.currentInningsIndex = Math.min(Math.max(0, match.currentInningsIndex ?? match.innings.length - 1), Math.max(0, match.innings.length - 1));
  match.teams.forEach((t) => { t.players = (t.players || []).map((p) => ({ id: p.id, name: p.name })); });
  match.innings.forEach((inn, i) => {
    for (const k of ['total', 'wickets', 'legalBalls', 'extras', 'partnership', 'batterStats', 'bowlerStats', 'overSummaries']) delete inn[k];
    inn.deliveries ||= [];
    if (inn.striker === undefined) {
      const live = legacyCurrent && i === match.currentInningsIndex ? legacyCurrent : {};
      inn.striker = live.strikerId ?? null; inn.nonStriker = live.nonStrikerId ?? null; inn.currentBowler = live.bowlerId ?? null;
    }
    inn.target ??= null;
  });
  match.innings.forEach((inn) => { inn.derived = deriveInnings(match, inn); });
  return match;
}

/** Deep copy for read-only previews (e.g. editing the last ball). */
export function cloneMatch(match) { return hydrateMatch(JSON.parse(JSON.stringify(serializeMatch(match)))); }

/** Storage/export form: delivery history + minimal state, no derived values. */
export function serializeMatch(match) {
  return { ...match, innings: match.innings.map(({ derived, ...rest }) => rest) };
}

/* -------------------------------------------------------------------- lookups */

export function currentInnings(match) { return match.innings[match.currentInningsIndex]; }
export function teamById(match, id) { return match.teams.find((t) => t.id === id); }
export function getPlayer(match, id) {
  for (const t of match.teams) { const p = t.players.find((x) => x.id === id); if (p) return p; }
  return null;
}
export function playerName(match, id, fallback = 'Player') { return getPlayer(match, id)?.name || fallback; }
export function maxWicketsFor(match, inn = currentInnings(match)) { return Math.max(1, teamById(match, inn.battingTeamId).players.length - 1); }
const maxWickets = maxWicketsFor;

/* ------------------------------------------------------------------ derivation */

function newBat() { return { runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, singles: 0, twos: 0, threes: 0, strikeRate: 0 }; }
function newBowl() { return { conceded: 0, legalBalls: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0, dots: 0, foursConceded: 0, sixesConceded: 0, economy: 0 }; }

/** Does this delivery count as a ball faced by the striker? (all but wides and retirements) */
const facedByBatter = (d) => !d.nonDelivery && d.extraType !== 'wide';
/** Runs charged to the bowler on this delivery. */
const bowlerRunsOf = (d) => d.nonDelivery ? 0 : d.batterRuns + (d.extraType === 'wide' ? d.extras : d.extraType === 'no-ball' ? 1 : 0);

export function deriveInnings(match, inn) {
  const d = {
    total: 0, wickets: 0, legalBalls: 0,
    extras: { total: 0, wide: 0, noBall: 0, bye: 0, legBye: 0, other: 0 },
    batterStats: {}, bowlerStats: {}, out: {}, overSummaries: [],
    partnership: { runs: 0, balls: 0, byBatter: {} },
    over: 1, legalInOver: 0
  };
  let ov = { runs: 0, bowlerRuns: 0, wickets: 0, labels: [] };
  for (const del of inn.deliveries) {
    d.total += del.totalRuns;
    if (del.extras) {
      d.extras.total += del.extras;
      if (del.extraType === 'wide') d.extras.wide += del.extras;
      else if (del.extraType === 'no-ball') d.extras.noBall += del.extras;
      else if (del.extraType === 'bye') d.extras.bye += del.extras;
      else if (del.extraType === 'leg-bye') d.extras.legBye += del.extras;
      else d.extras.other += del.extras;
    }
    const bat = d.batterStats[del.striker] ||= newBat();
    d.batterStats[del.nonStriker] ||= newBat();
    if (facedByBatter(del)) {
      bat.balls += 1;
      if (del.batterRuns === 0) bat.dots += 1;
    }
    if (del.batterRuns) {
      bat.runs += del.batterRuns;
      if (del.batterRuns === 1) bat.singles += 1; else if (del.batterRuns === 2) bat.twos += 1;
      else if (del.batterRuns === 3) bat.threes += 1; else if (del.batterRuns === 4) bat.fours += 1;
      else if (del.batterRuns === 6) bat.sixes += 1;
    }
    bat.strikeRate = bat.balls ? (bat.runs / bat.balls) * 100 : 0;

    d.partnership.runs += del.totalRuns;
    if (del.isLegalBall) d.partnership.balls += 1;
    d.partnership.byBatter[del.striker] = (d.partnership.byBatter[del.striker] || 0) + del.batterRuns;

    if (!del.nonDelivery) {
      const w = d.bowlerStats[del.bowler] ||= newBowl();
      const br = bowlerRunsOf(del);
      w.conceded += br;
      if (del.extraType === 'wide') w.wides += del.extras;
      if (del.extraType === 'no-ball') w.noBalls += 1;
      if (del.batterRuns === 4) w.foursConceded += 1;
      if (del.batterRuns === 6) w.sixesConceded += 1;
      if (del.isLegalBall) { w.legalBalls += 1; if (br === 0) w.dots += 1; }
      if (del.wicket && BOWLER_CREDIT.has(del.dismissalType)) w.wickets += 1;
      ov.bowlerRuns += br;
    }
    ov.runs += del.totalRuns;
    if (del.wicket) ov.wickets += 1;
    ov.labels.push(ballLabel(del));

    if (del.wicket) {
      d.wickets += 1;
      d.out[del.dismissedPlayer] = { type: del.dismissalType, bowler: BOWLER_CREDIT.has(del.dismissalType) ? del.bowler : null, deliveryId: del.deliveryId };
      d.partnership = { runs: 0, balls: 0, byBatter: {} };
    }
    if (del.isLegalBall) {
      d.legalBalls += 1;
      if (d.legalBalls % BALLS_PER_OVER === 0) {
        const overNo = d.legalBalls / BALLS_PER_OVER;
        const maiden = ov.bowlerRuns === 0;
        if (maiden) (d.bowlerStats[del.bowler] ||= newBowl()).maidens += 1;
        d.overSummaries.push({ over: overNo, runs: ov.runs, wickets: ov.wickets, balls: ov.labels, bowler: del.bowler, bowlerName: playerName(match, del.bowler, 'Bowler'), maiden });
        ov = { runs: 0, bowlerRuns: 0, wickets: 0, labels: [] };
      }
    }
  }
  for (const w of Object.values(d.bowlerStats)) w.economy = w.legalBalls ? w.conceded / (w.legalBalls / BALLS_PER_OVER) : 0;
  d.over = Math.floor(d.legalBalls / BALLS_PER_OVER) + 1;
  d.legalInOver = d.legalBalls % BALLS_PER_OVER;
  return d;
}

/* --------------------------------------------------------------------- metrics */

export function currentMetrics(match) {
  const inn = currentInnings(match), d = inn.derived;
  const maxBalls = match.format.overs * BALLS_PER_OVER;
  const ballsRemaining = Math.max(0, maxBalls - d.legalBalls);
  const crr = d.legalBalls ? (d.total / d.legalBalls) * 6 : 0;
  const runsRequired = inn.target == null ? null : Math.max(0, inn.target - d.total);
  const rrr = inn.target == null || ballsRemaining === 0 ? 0 : (runsRequired / ballsRemaining) * 6;
  return { maxBalls, ballsRemaining, crr, rrr, runsRequired, target: inn.target, overs: formatOvers(d.legalBalls), finished: isInningsOver(match) };
}

export function inningsEndReason(match, inn = currentInnings(match)) {
  if (!inn) return 'no-innings';
  const d = inn.derived;
  if (inn.target != null && d.total >= inn.target) return 'target-reached';
  if (d.wickets >= maxWickets(match, inn)) return 'all-out';
  if (d.legalBalls >= match.format.overs * BALLS_PER_OVER) return 'overs-complete';
  return null;
}
export function isInningsOver(match, inn = currentInnings(match)) { return inningsEndReason(match, inn) !== null; }

/** Batters who may still come in: not out, not at the crease. */
export function availableBatters(match, inn = currentInnings(match)) {
  const active = new Set([inn.striker, inn.nonStriker]);
  return teamById(match, inn.battingTeamId).players.filter((p) => !inn.derived.out[p.id] && !active.has(p.id));
}

/** Why scoring is currently impossible, or null when it is allowed. */
export function scoringBlockReason(match) {
  if (!match) return 'No match.';
  if (match.status === 'completed') return 'The match is over.';
  const inn = currentInnings(match);
  if (isInningsOver(match, inn)) return 'This innings has ended.';
  if (!inn.striker || !inn.nonStriker) return 'Select the two batters first.';
  if (inn.striker === inn.nonStriker) return 'Striker and non-striker must be different.';
  if (!inn.currentBowler) return 'Select the bowler first.';
  return null;
}

/* ---------------------------------------------------------------- core: record */

function record(match, spec) {
  const block = scoringBlockReason(match);
  if (block) throw new Error(block);
  const inn = currentInnings(match);
  const prev = inn.derived;
  const { striker, nonStriker, currentBowler: bowler } = inn;
  const legal = !!spec.isLegalBall;
  const isWicket = !!spec.wicket;

  if (isWicket && ![striker, nonStriker].includes(spec.dismissedPlayer)) throw new Error('Select which active batter is out.');

  const delivery = {
    deliveryId: uid('delivery'), matchId: match.matchId, innings: inn.inningsNumber,
    over: prev.over,
    ball: prev.legalInOver + 1, // position in the over (an illegal ball is bowled "before" ball N)
    legalBall: prev.legalBalls + (legal ? 1 : 0),
    striker, nonStriker, bowler,
    batterRuns: spec.batterRuns || 0, totalRuns: (spec.batterRuns || 0) + (spec.extras || 0),
    extras: spec.extras || 0, extraType: spec.extraType || null, isLegalBall: legal,
    wicket: isWicket, dismissedPlayer: isWicket ? spec.dismissedPlayer : null,
    dismissalType: isWicket ? spec.dismissalType : null, newBatterId: spec.newBatterId || null,
    nonDelivery: !!spec.nonDelivery,
    timestamp: new Date().toISOString()
  };

  inn.deliveries.push(delivery);
  let next;
  try {
    next = deriveInnings(match, inn);
    if (isWicket && !isInningsOver(match, { ...inn, derived: next })) {
      const nb = spec.newBatterId;
      if (!nb) throw new Error('Select the new batter.');
      const ok = teamById(match, inn.battingTeamId).players.some((p) => p.id === nb) && !next.out[nb] && nb !== striker && nb !== nonStriker;
      if (!ok) throw new Error('That batter cannot come in.');
    }
  } catch (err) {
    inn.deliveries.pop();
    inn.derived = prev;
    throw err;
  }
  inn.derived = next;

  // --- who is where after this ball
  let s = striker, n = nonStriker;
  if ((spec.runsRun || 0) % 2 === 1) [s, n] = [n, s];
  if (isWicket) {
    const replacement = spec.newBatterId || null;
    if (s === spec.dismissedPlayer) s = replacement; else n = replacement;
  }
  const inningsOver = isInningsOver(match, inn);
  const overComplete = legal && next.legalBalls % BALLS_PER_OVER === 0;
  let bowlerAfter = bowler;
  if (overComplete && !inningsOver) {
    if (s && n) [s, n] = [n, s];
    bowlerAfter = null;
  }
  inn.striker = s; inn.nonStriker = n; inn.currentBowler = bowlerAfter;

  const matchOver = checkMatchOver(match);
  touch(match);
  return { delivery, overComplete, inningsOver, matchOver };
}

/* ------------------------------------------------------------ public scoring API */

export function addRuns(match, runs) {
  runs = Number(runs);
  if (![0, 1, 2, 3, 4, 5, 6].includes(runs)) throw new Error('Invalid run value.');
  return record(match, { batterRuns: runs, extras: 0, isLegalBall: true, runsRun: runs });
}

/**
 * wide    : `amount` = total wides (≥1, 1 = the penalty only). Runs actually run = amount-1.
 * no-ball : `amount` = total extras (≥1, 1 = penalty only, more = byes run off it); `batterRuns` off the bat.
 * bye/leg-bye : `amount` = runs run (legal ball, never credited to the batter).
 */
export function addExtra(match, type, amount = 1, batterRuns = 0) {
  if (!EXTRA_TYPES.includes(type)) throw new Error('Invalid extra type.');
  amount = Number(amount); batterRuns = Number(batterRuns) || 0;
  if (!Number.isInteger(amount) || amount < 1 || amount > 20) throw new Error('Extra runs must be between 1 and 20.');
  if (!Number.isInteger(batterRuns) || batterRuns < 0 || batterRuns > 6) throw new Error('Runs off the bat must be 0 to 6.');
  if (type !== 'no-ball' && batterRuns !== 0) throw new Error(type === 'wide' ? 'A batter cannot score off a wide.' : 'Byes and leg-byes do not belong to the batter.');
  const legal = type === 'bye' || type === 'leg-bye';
  const runsRun = type === 'wide' ? amount - 1 : type === 'no-ball' ? batterRuns + amount - 1 : amount;
  return record(match, { batterRuns, extras: amount, extraType: type, isLegalBall: legal, runsRun });
}

/**
 * Wicket. `runs` = runs completed before a run-out. `onExtra` = null | 'wide' | 'no-ball'.
 * The dismissed batter is replaced by `newBatterId` (required unless the innings ends).
 */
export function addWicket(match, { dismissalType, dismissedPlayer, newBatterId = null, runs = 0, onExtra = null }) {
  if (!DISMISSAL_TYPES.includes(dismissalType)) throw new Error('Choose how the batter was dismissed.');
  if (!dismissedPlayer) throw new Error('Choose the dismissed batter.');
  runs = Number(runs) || 0;
  if (!Number.isInteger(runs) || runs < 0 || runs > 6) throw new Error('Runs must be 0 to 6.');
  if (dismissalType === 'retired') {
    return record(match, { batterRuns: 0, extras: 0, isLegalBall: false, nonDelivery: true, wicket: true, dismissalType, dismissedPlayer, newBatterId, runsRun: 0 });
  }
  if (dismissalType !== 'run-out' && runs) throw new Error('Runs can only be added to a run-out.');
  if (onExtra === 'wide' && !ALLOWED_ON_WIDE.has(dismissalType)) throw new Error('That dismissal is not possible off a wide.');
  if (onExtra === 'no-ball' && !ALLOWED_ON_NO_BALL.has(dismissalType)) throw new Error('Only a run-out is possible off a no-ball.');
  let spec;
  if (onExtra === 'wide') spec = { batterRuns: 0, extras: 1 + runs, extraType: 'wide', isLegalBall: false, runsRun: runs };
  else if (onExtra === 'no-ball') spec = { batterRuns: runs, extras: 1, extraType: 'no-ball', isLegalBall: false, runsRun: runs };
  else spec = { batterRuns: runs, extras: 0, isLegalBall: true, runsRun: runs };
  return record(match, { ...spec, wicket: true, dismissalType, dismissedPlayer, newBatterId });
}

/** Apply a UI-neutral spec: {kind:'runs',runs} | {kind:'extra',type,amount,batterRuns} | {kind:'wicket',...}. */
export function applySpec(match, spec) {
  if (spec.kind === 'runs') return addRuns(match, spec.runs);
  if (spec.kind === 'extra') return addExtra(match, spec.type, spec.amount, spec.batterRuns);
  if (spec.kind === 'wicket') return addWicket(match, spec);
  throw new Error('Unsupported delivery.');
}

/* ------------------------------------------------------------------ undo / edit */

/** Reverse the most recent delivery completely (in place, no cloning). Returns the removed delivery. */
export function undo(match) {
  const inn = currentInnings(match);
  if (!inn || !inn.deliveries.length) throw new Error('Nothing to undo.');
  const del = inn.deliveries.pop();
  inn.striker = del.striker; inn.nonStriker = del.nonStriker; inn.currentBowler = del.bowler;
  inn.derived = deriveInnings(match, inn);
  if (match.status === 'completed') { match.status = 'active'; match.result = null; }
  touch(match);
  return del;
}

/** Replace the last delivery atomically: if the new one is invalid the original is restored untouched. */
export function editLastBall(match, spec) {
  const inn = currentInnings(match);
  if (!inn || !inn.deliveries.length) throw new Error('No ball to edit.');
  const original = inn.deliveries[inn.deliveries.length - 1];
  const post = { striker: inn.striker, nonStriker: inn.nonStriker, currentBowler: inn.currentBowler, status: match.status, result: match.result };
  undo(match);
  try { return applySpec(match, spec); }
  catch (err) {
    inn.deliveries.push(original);
    inn.striker = post.striker; inn.nonStriker = post.nonStriker; inn.currentBowler = post.currentBowler;
    match.status = post.status; match.result = post.result;
    inn.derived = deriveInnings(match, inn);
    throw err;
  }
}

export function lastDelivery(match) { const inn = currentInnings(match); return inn?.deliveries[inn.deliveries.length - 1] || null; }

/* --------------------------------------------------------------- manual controls */

export function changeStrike(match) {
  const inn = currentInnings(match);
  if (match.status === 'completed' || !inn.striker || !inn.nonStriker) throw new Error('Two batters are needed to change strike.');
  [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
  touch(match);
}

export function setOpeners(match, strikerId, nonStrikerId, bowlerId) {
  const inn = currentInnings(match);
  if (inn.deliveries.length) throw new Error('Openers can only be set before the first ball.');
  if (strikerId === nonStrikerId) throw new Error('Striker and non-striker must be different.');
  const bat = teamById(match, inn.battingTeamId), bowl = teamById(match, inn.bowlingTeamId);
  if (!bat.players.some((p) => p.id === strikerId) || !bat.players.some((p) => p.id === nonStrikerId)) throw new Error('Choose two batters from the batting team.');
  if (!bowl.players.some((p) => p.id === bowlerId)) throw new Error('Choose a bowler from the bowling team.');
  inn.striker = strikerId; inn.nonStriker = nonStrikerId; inn.currentBowler = bowlerId;
  touch(match);
}

export function bowlerChoices(match) {
  const inn = currentInnings(match);
  const last = inn.derived.overSummaries[inn.derived.overSummaries.length - 1];
  const barred = inn.derived.legalInOver === 0 && last ? last.bowler : null;
  return teamById(match, inn.bowlingTeamId).players.map((p) => ({ player: p, barred: p.id === barred }));
}

export function setBowler(match, bowlerId) {
  const inn = currentInnings(match);
  const choice = bowlerChoices(match).find((c) => c.player.id === bowlerId);
  if (!choice) throw new Error('Choose a bowler from the bowling team.');
  if (choice.barred) throw new Error('The same bowler cannot bowl two overs in a row.');
  inn.currentBowler = bowlerId;
  touch(match);
}

/* --------------------------------------------------------- innings & match end */

export function finishFirstInnings(match) {
  if (match.innings.length !== 1) throw new Error('First innings is already finished.');
  if (!isInningsOver(match)) throw new Error('The first innings is not finished yet.');
  startInnings(match, match.innings[0].bowlingTeamId, true);
}

export function checkMatchOver(match) {
  if (match.innings.length < 2) return false;
  const [first, second] = match.innings;
  const t2 = second.derived, t1 = first.derived;
  const chaseWon = t2.total >= t1.total + 1;
  const finished = chaseWon || t2.wickets >= maxWickets(match, second) || t2.legalBalls >= match.format.overs * BALLS_PER_OVER;
  if (!finished) return false;
  const batting2 = teamById(match, second.battingTeamId), batting1 = teamById(match, first.battingTeamId);
  if (chaseWon) {
    const left = Math.max(0, maxWickets(match, second) - t2.wickets);
    match.result = { type: 'win', winner: second.battingTeamId, text: `${batting2.name} won by ${left} wicket${left === 1 ? '' : 's'}` };
  } else if (t2.total === t1.total) {
    match.result = { type: 'tie', winner: null, text: 'MATCH TIED' };
  } else {
    const runs = t1.total - t2.total;
    match.result = { type: 'win', winner: first.battingTeamId, text: `${batting1.name} won by ${runs} run${runs === 1 ? '' : 's'}` };
  }
  match.status = 'completed';
  return true;
}

/* ------------------------------------------------------------------ presentation */

export function ballLabel(d) {
  if (d.nonDelivery) return 'Ret';
  const extra = d.extraType === 'wide' ? (d.extras > 1 ? `Wd${d.extras}` : 'Wd')
    : d.extraType === 'no-ball' ? (d.batterRuns ? `Nb+${d.batterRuns}` : d.extras > 1 ? `Nb+${d.extras - 1}` : 'Nb')
    : d.extraType === 'bye' ? `B${d.extras}` : d.extraType === 'leg-bye' ? `Lb${d.extras}` : null;
  if (d.wicket) return extra ? `W+${extra}` : (d.batterRuns ? `W${d.batterRuns}` : 'W');
  return extra ?? String(d.batterRuns);
}

export function deliveryCommentary(match, d) {
  const at = formatOvers(d.legalBall);
  const bat = playerName(match, d.striker, 'Batter');
  if (d.nonDelivery) return `${at} — ${playerName(match, d.dismissedPlayer)} retires`;
  if (d.wicket) {
    const how = d.dismissalType.replaceAll('-', ' ');
    const by = BOWLER_CREDIT.has(d.dismissalType) ? ` b ${playerName(match, d.bowler, 'Bowler')}` : '';
    return `${at} — WICKET! ${playerName(match, d.dismissedPlayer)} ${how}${by}${d.totalRuns ? ` (${d.totalRuns} run${d.totalRuns > 1 ? 's' : ''})` : ''}`;
  }
  if (d.extraType === 'wide') return `${at} — Wide${d.extras > 1 ? ` (${d.extras} runs)` : ''}`;
  if (d.extraType === 'no-ball') return `${at} — No ball${d.batterRuns ? `, ${bat} hits ${d.batterRuns}` : ''}${d.extras > 1 ? ` + ${d.extras - 1} bye${d.extras > 2 ? 's' : ''}` : ''}`;
  if (d.extraType === 'bye') return `${at} — ${d.extras} bye${d.extras > 1 ? 's' : ''}`;
  if (d.extraType === 'leg-bye') return `${at} — ${d.extras} leg bye${d.extras > 1 ? 's' : ''}`;
  if (d.batterRuns === 0) return `${at} — Dot ball, ${bat}`;
  if (d.batterRuns === 4) return `${at} — FOUR! ${bat}`;
  if (d.batterRuns === 6) return `${at} — SIX! ${bat}`;
  return `${at} — ${bat} scores ${d.batterRuns}`;
}

function touch(match) { match.updatedAt = new Date().toISOString(); }

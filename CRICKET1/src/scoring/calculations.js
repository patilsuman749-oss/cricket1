import { formatOvers } from '../utils/helpers.js';
import { ballLabel, teamById, playerName } from './engine.js';

const BLANK_BAT = { runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, dots: 0, singles: 0, twos: 0, threes: 0 };

/** Dismissal line for a scorecard row, e.g. "b Ravi", "run out", "not out". */
export function dismissalText(match, inn, playerId) {
  const out = inn.derived.out[playerId];
  if (out) {
    const how = out.type.replaceAll('-', ' ');
    return out.bowler ? `${how} b ${playerName(match, out.bowler, 'Bowler')}` : how;
  }
  if (playerId === inn.striker || playerId === inn.nonStriker) return 'not out';
  return inn.derived.batterStats[playerId] ? 'not out' : 'did not bat';
}

export function scorecardForInnings(match, inn) {
  const d = inn.derived;
  const players = teamById(match, inn.battingTeamId).players;
  const batting = players.map((p) => ({ player: p, ...(d.batterStats[p.id] || BLANK_BAT), status: dismissalText(match, inn, p.id), batted: !!d.batterStats[p.id] || !!d.out[p.id] }));
  const bowlers = Object.entries(d.bowlerStats).map(([id, s]) => ({ player: match.teams.flatMap((t) => t.players).find((p) => p.id === id), ...s, overs: formatOvers(s.legalBalls) })).filter((x) => x.player);
  return { batting, bowlers, extras: d.extras, total: d.total, wickets: d.wickets, overs: formatOvers(d.legalBalls), deliveries: inn.deliveries, overSummaries: d.overSummaries };
}

export function currentPartnership(match) {
  const inn = match.innings[match.currentInningsIndex];
  if (!inn) return null;
  const { partnership } = inn.derived;
  const ids = [inn.striker, inn.nonStriker].filter(Boolean);
  return { runs: partnership.runs, balls: partnership.balls, batters: ids.map((id) => ({ id, runs: partnership.byBatter[id] || 0, name: playerName(match, id) })) };
}

export function wicketsInMatch(match) { return match.innings.reduce((s, i) => s + i.derived.wickets, 0); }

export function oversToString(deliveries) {
  const byOver = new Map();
  for (const d of deliveries) { if (!byOver.has(d.over)) byOver.set(d.over, []); byOver.get(d.over).push(d); }
  return [...byOver.entries()].map(([over, ds]) => `${over}: ${ds.map(ballLabel).join(' | ')}`).join(' • ');
}

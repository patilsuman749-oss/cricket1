import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { escapeHtml, formatDate, formatOvers, formatNumber } from '../utils/helpers.js';
import { state, completedMatches, activeMatches } from '../state/store.js';

const playerStatsForMatch = (m) => {
  const players = m.teams.flatMap((team) =>
    team.players.map((player) => ({
      teamId: team.id,
      teamName: team.name,
      player,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      conceded: 0,
      legalBalls: 0,
      battingInnings: 0,
      bowlingInnings: 0,
    }))
  );

  const byId = new Map(players.map((row) => [row.player.id, row]));

  for (const inn of m.innings) {
    for (const [id, bat] of Object.entries(inn.derived?.batterStats || {})) {
      const row = byId.get(id);
      if (!row) continue;
      row.runs += bat.runs || 0;
      row.balls += bat.balls || 0;
      row.fours += bat.fours || 0;
      row.sixes += bat.sixes || 0;
      if ((bat.balls || 0) > 0) row.battingInnings += 1;
    }

    for (const [id, bowl] of Object.entries(inn.derived?.bowlerStats || {})) {
      const row = byId.get(id);
      if (!row) continue;
      row.wickets += bowl.wickets || 0;
      row.conceded += bowl.conceded || 0;
      row.legalBalls += bowl.legalBalls || 0;
      if ((bowl.legalBalls || 0) > 0) row.bowlingInnings += 1;
    }
  }

  return m.teams.map((team) => ({
    ...team,
    players: players.filter((row) => row.teamId === team.id),
  }));
};

const playerStatsTable = (m) => {
  const teams = playerStatsForMatch(m);

  const body = teams.map((team) => {
    const rows = team.players.map((p) => {
      const sr = p.balls ? (p.runs / p.balls) * 100 : 0;
      const econ = p.legalBalls ? p.conceded / (p.legalBalls / 6) : 0;
      const batting = p.battingInnings || p.runs || p.balls || p.fours || p.sixes;
      const bowling = p.bowlingInnings || p.legalBalls || p.wickets || p.conceded;
      return `<tr>
        <td><strong>${escapeHtml(p.player.name)}</strong></td>
        <td>${batting ? `${p.runs} (${p.balls})` : '—'}</td>
        <td>${batting ? p.fours : '—'}</td>
        <td>${batting ? p.sixes : '—'}</td>
        <td>${batting ? formatNumber(sr) : '—'}</td>
        <td>${bowling ? formatOvers(p.legalBalls) : '—'}</td>
        <td>${bowling ? p.conceded : '—'}</td>
        <td>${bowling ? p.wickets : '—'}</td>
        <td>${bowling ? formatNumber(econ) : '—'}</td>
      </tr>`;
    }).join('');

    return `<div class="history-team-stats">
      <div class="history-stats-team">${escapeHtml(team.name)}</div>
      <div class="table-scroll">
        <table class="history-player-table">
          <thead><tr><th>Player</th><th>R (B)</th><th>4s</th><th>6s</th><th>SR</th><th>O</th><th>Runs</th><th>W</th><th>Econ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  return `<details class="history-player-stats">
    <summary>${icon('users', 15)} Player stats</summary>
    <div class="history-stats-body">
      <div class="small history-stats-note">Batting and bowling performance from this match.</div>
      ${body}
    </div>
  </details>`;
};

const row = (m, live) => {
  const [a, b] = m.teams, i0 = m.innings[0], i1 = m.innings[1];
  const score = `${i0?.derived.total ?? 0}/${i0?.derived.wickets ?? 0}${i1 ? ` · ${i1.derived.total}/${i1.derived.wickets}` : ''}`;
  return `<div class="card history-card"><div class="history-summary"><div class="small">${formatDate(m.createdAt)} · ${escapeHtml(m.matchId)}${live ? ' · <strong>In progress</strong>' : ''}</div><div style="margin-top:5px;font-weight:800">${escapeHtml(a.name)} <span class="muted">vs</span> ${escapeHtml(b.name)}</div><div class="history-score">${score}</div><div class="small" style="margin-top:5px">${escapeHtml(live ? `${formatOvers((i1 || i0).derived.legalBalls)} overs bowled in innings ${i1 ? 2 : 1}` : m.result?.text || 'Match completed')}</div></div>
  <div class="history-actions">${live ? `<button type="button" class="primary-btn" data-action="continue-match" data-id="${m.matchId}">${icon('play', 15)} Continue</button>` : ''}<button type="button" class="secondary-btn" data-action="view-scorecard" data-id="${m.matchId}">Scorecard</button>${!live ? playerStatsTable(m) : ''}<button type="button" class="ghost-btn" data-action="share" data-id="${m.matchId}">${icon('share', 15)} Share</button><button type="button" class="ghost-btn" data-action="delete-match" data-id="${m.matchId}" aria-label="Delete match">${icon('trash', 15)} Delete</button></div></div>`;
};

export function renderHistory() {
  const live = activeMatches(), done = completedMatches();
  void state;
  if (!live.length && !done.length) return `${pageHead('Your matches', 'Match History', 'Previous matches with scorecards and player performance.')}<div class="empty"><strong>No matches yet</strong><span class="small">Finish your first match and it will appear here with player stats.</span><div style="margin-top:14px"><button type="button" class="primary-btn" data-action="new-match">Start New Match</button></div></div>`;
  return `${pageHead('Your matches', 'Match History', 'Previous matches with scorecards and player performance.')}<div class="grid">${live.map((m) => row(m, true)).join('')}${done.map((m) => row(m, false)).join('')}</div>`;
}

import { pageHead } from '../components/ui.js';
import { escapeHtml, formatNumber } from '../utils/helpers.js';
import { completedMatches } from '../state/store.js';
import { aggregatePlayers, topStats } from '../statistics/aggregate.js';

export function renderStats() {
  const players = aggregatePlayers(completedMatches());
  const t = topStats(players);
  const defs = [
    ['Top Run Scorer', t.runs, (p) => p.runs, (p) => `${p.player.name} · ${p.runs} runs`],
    ['Top Wicket Taker', t.wickets, (p) => p.wickets, (p) => `${p.player.name} · ${p.wickets} wickets`],
    ['Highest Strike Rate', t.strikeRate, (p) => formatNumber(p.strikeRate), (p) => `${p.player.name} · ${formatNumber(p.strikeRate)}`],
    ['Best Economy', t.economy, (p) => formatNumber(p.economy), (p) => `${p.player.name} · ${formatNumber(p.economy)}`],
    ['Most 4s', t.fours, (p) => p.fours, (p) => `${p.player.name} · ${p.fours}`],
    ['Most 6s', t.sixes, (p) => p.sixes, (p) => `${p.player.name} · ${p.sixes}`],
    ['Most Matches', t.matches, (p) => p.matches, (p) => `${p.player.name} · ${p.matches}`]
  ];
  if (!players.length) return `${pageHead('Performance', 'Statistics', 'A local dashboard built from completed matches.')}<div class="empty"><strong>No statistics yet</strong><span class="small">Complete a match to unlock the dashboard.</span></div>`;
  const chart = [...players].sort((a, b) => b.runs - a.runs).slice(0, 7);
  const max = Math.max(1, ...chart.map((x) => x.runs));
  return `${pageHead('Performance', 'Statistics', 'A local dashboard built from completed matches.')}<div class="grid grid-4">${defs.map(([label, obj, val, detail]) => `<div class="card stat-card"><span class="stat-label">${label}</span><span class="stat-value">${obj ? val(obj) : '—'}</span><div class="small">${obj ? escapeHtml(detail(obj)) : '—'}</div></div>`).join('')}</div>
  <div class="section card"><div class="card-header"><div><h3>Runs leaderboard</h3><div class="small">Top seven run scorers.</div></div></div><div class="chart-bars" role="img" aria-label="Runs by player">${chart.map((p) => `<div class="bar" style="height:${Math.max(16, Math.round((p.runs / max) * 125))}px"><span class="bar-value">${p.runs}</span><span class="bar-label">${escapeHtml(p.player.name.split(' ')[0])}</span></div>`).join('')}</div></div>`;
}

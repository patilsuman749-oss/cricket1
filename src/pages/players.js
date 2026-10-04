import { pageHead } from '../components/ui.js';
import { escapeHtml, formatNumber, initials } from '../utils/helpers.js';
import { completedMatches } from '../state/store.js';
import { aggregatePlayers } from '../statistics/aggregate.js';

export function renderPlayers() {
  const rows = aggregatePlayers(completedMatches());
  const cell = (label, v) => `<div class="badge-stat"><div class="small">${label}</div><strong>${v}</strong></div>`;
  return `${pageHead('Local player profiles', 'Players', 'Stats come from completed matches saved on this device.')}${rows.length ? `<div class="grid grid-2">${rows.sort((a, b) => b.runs - a.runs).map((a) => `<div class="card"><div class="player-profile"><div class="avatar" aria-hidden="true">${escapeHtml(initials(a.player.name))}</div><div><div class="profile-name">${escapeHtml(a.player.name)}</div><div class="profile-meta">${a.matches} match${a.matches === 1 ? '' : 'es'}</div></div></div><div class="grid grid-4" style="margin-top:14px">${cell('Matches', a.matches)}${cell('Runs', a.runs)}${cell('Highest', a.highest)}${cell('SR', formatNumber(a.strikeRate))}${cell('Average', formatNumber(a.average))}${cell('4s', a.fours)}${cell('6s', a.sixes)}${cell('Wickets', a.wickets)}${cell('50s', a.fifties)}${cell('100s', a.hundreds)}${cell('Best Bowling', escapeHtml(a.bestBowling))}</div></div>`).join('')}</div>` : `<div class="empty"><strong>Player profiles will appear here</strong><span class="small">Complete a match to start building local statistics.</span></div>`}`;
}

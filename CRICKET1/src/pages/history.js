import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { escapeHtml, formatDate, formatOvers } from '../utils/helpers.js';
import { state, completedMatches, activeMatches } from '../state/store.js';

const row = (m, live) => {
  const [a, b] = m.teams, i0 = m.innings[0], i1 = m.innings[1];
  const score = `${i0?.derived.total ?? 0}/${i0?.derived.wickets ?? 0}${i1 ? ` · ${i1.derived.total}/${i1.derived.wickets}` : ''}`;
  return `<div class="card history-card"><div><div class="small">${formatDate(m.createdAt)} · ${escapeHtml(m.matchId)}${live ? ' · <strong>In progress</strong>' : ''}</div><div style="margin-top:5px;font-weight:800">${escapeHtml(a.name)} <span class="muted">vs</span> ${escapeHtml(b.name)}</div><div class="history-score">${score}</div><div class="small" style="margin-top:5px">${escapeHtml(live ? `${formatOvers((i1 || i0).derived.legalBalls)} overs bowled in innings ${i1 ? 2 : 1}` : m.result?.text || 'Match completed')}</div></div>
  <div class="history-actions">${live ? `<button type="button" class="primary-btn" data-action="continue-match" data-id="${m.matchId}">${icon('play', 15)} Continue</button>` : ''}<button type="button" class="secondary-btn" data-action="view-scorecard" data-id="${m.matchId}">Scorecard</button><button type="button" class="ghost-btn" data-action="share" data-id="${m.matchId}">${icon('share', 15)} Share</button><button type="button" class="ghost-btn" data-action="delete-match" data-id="${m.matchId}" aria-label="Delete match">${icon('trash', 15)} Delete</button></div></div>`;
};

export function renderHistory() {
  const live = activeMatches(), done = completedMatches();
  void state;
  if (!live.length && !done.length) return `${pageHead('Your matches', 'Match History', 'Matches saved on this device.')}<div class="empty"><strong>No matches yet</strong><span class="small">Finish your first match and it will appear here.</span><div style="margin-top:14px"><button type="button" class="primary-btn" data-action="new-match">Start New Match</button></div></div>`;
  return `${pageHead('Your matches', 'Match History', 'Matches saved on this device.')}<div class="grid">${live.map((m) => row(m, true)).join('')}${done.map((m) => row(m, false)).join('')}</div>`;
}

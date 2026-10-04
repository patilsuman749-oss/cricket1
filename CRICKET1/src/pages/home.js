import { icon } from '../components/icons.js';
import { actionCard } from '../components/ui.js';
import { escapeHtml, formatOvers } from '../utils/helpers.js';
import { activeMatches } from '../state/store.js';
import { currentInnings, teamById } from '../scoring/engine.js';

function continueCard(m) {
  const inn = currentInnings(m), team = teamById(m, inn.battingTeamId);
  const bowl = teamById(m, inn.bowlingTeamId);
  return `<div class="card continue-card"><div><div class="page-kicker">Match in progress</div><div class="continue-title">${escapeHtml(team.name)} vs ${escapeHtml(bowl.name)}</div><div class="small">${escapeHtml(team.name)} ${inn.derived.total}/${inn.derived.wickets} · ${formatOvers(inn.derived.legalBalls)} / ${m.format.overs} overs · ${inn.inningsNumber === 1 ? '1st' : '2nd'} innings</div></div><button type="button" class="primary-btn" data-action="continue-match" data-id="${m.matchId}">${icon('play', 18)} Continue Match</button></div>`;
}

export function renderHome() {
  const active = activeMatches();
  return `<section class="hero"><div class="hero-copy"><div class="page-kicker">Live cricket scoring</div><h1 class="hero-title">Every Ball. <span>Every Run.</span> Every Moment.</h1><p class="subtle">Track cricket matches ball-by-ball with fast live scoring and complete player statistics.</p>
    <div class="hero-actions"><button type="button" class="primary-btn" data-action="new-match">${icon('plus', 18)} Start New Match</button>${active.length ? '' : `<button type="button" class="secondary-btn" data-nav="history">${icon('history', 18)} Match History</button>`}</div></div>
    <div class="sample-score" aria-hidden="true"><div class="sample-team">TEAM A</div><div class="sample-score-num">124/4</div><div class="small">17.3 Overs</div><div class="sample-micro"><span>CRR <strong>7.08</strong></span><span>RRR <strong>8.40</strong></span></div></div></section>
  ${active.length ? `<section class="section">${active.slice(0, 2).map(continueCard).join('')}</section>` : ''}
  <section class="section grid grid-3">
    ${actionCard('play', 'Start New Match', 'Set format, teams, players and toss.', 'new-match')}
    ${actionCard('history', 'Match History', 'Review scorecards and resume matches.', 'history')}
    ${actionCard('users', 'Players', 'Profiles and career-style local stats.', 'players')}
    ${actionCard('chart', 'Statistics', 'Top scorers, wicket takers and more.', 'stats')}
    ${actionCard('settings', 'Settings', 'Theme, feedback and data backup.', 'settings')}
    <div class="card"><div class="card-header"><h3>Offline first</h3><span class="chip">No internet needed</span></div><p class="small">Every ball is saved on this device, so a refresh or closed browser never loses your match.</p></div>
  </section>`;
}

import { icon } from '../components/icons.js';
import { escapeHtml, formatOvers } from '../utils/helpers.js';
import { activeMatches } from '../state/store.js';
import { currentInnings, teamById } from '../scoring/engine.js';
import { state } from '../state/store.js';

function continueCard(m) {
  const inn = currentInnings(m), team = teamById(m, inn.battingTeamId);
  const bowl = teamById(m, inn.bowlingTeamId);
  return `<div class="card continue-card"><div><div class="page-kicker">Match in progress</div><div class="continue-title">${escapeHtml(team.name)} vs ${escapeHtml(bowl.name)}</div><div class="small">${escapeHtml(team.name)} ${inn.derived.total}/${inn.derived.wickets} · ${formatOvers(inn.derived.legalBalls)} / ${m.format.overs} overs · ${inn.inningsNumber === 1 ? '1st' : '2nd'} innings</div></div><button type="button" class="primary-btn" data-action="continue-match" data-id="${m.matchId}">${icon('play', 18)} Continue Match</button></div>`;
}

function accountCard() {
  const user = state.authUser;
  const syncing = state.cloudSyncStatus === 'syncing';
  const status = syncing ? 'Syncing…' : 'Cloud connected';

  return `<section class="section">
    <div class="card account-home-card">
      <div class="card-header">
        <div>
          <div class="page-kicker">ScoreX account</div>
          <h3>Your account is connected</h3>
          <div class="small">Signed in as ${escapeHtml(user?.email || 'Google account')}. Your matches are linked to your ScoreX cloud account.</div>
        </div>
        <span class="chip">${status}</span>
      </div>
      <div class="hero-actions">
        <button type="button" class="secondary-btn" data-action="sign-out">${icon('users', 15)} Sign out</button>
        <button type="button" class="secondary-btn" data-nav="settings">Account settings</button>
      </div>
    </div>
  </section>`;
}

export function renderHome() {
  const active = activeMatches();
  return `<section class="hero">
    <div class="hero-copy">
      <div class="page-kicker">Live cricket scoring</div>
      <h1 class="hero-title">Every Ball. <span>Every Run.</span> Every Moment.</h1>
      <p class="subtle">Track cricket matches ball-by-ball with fast live scoring and complete player statistics.</p>
      <div class="hero-actions"><button type="button" class="primary-btn" data-action="new-match">${icon('plus', 18)} Start New Match</button></div>
    </div>
    <div class="sample-score" aria-hidden="true"><div class="sample-team">SCOREX</div><div class="sample-score-num">124/4</div><div class="small">17.3 Overs</div><div class="sample-micro"><span>CRR <strong>7.08</strong></span><span>RRR <strong>8.40</strong></span></div></div>
  </section>
  ${accountCard()}
  ${active.length ? `<section class="section">${active.slice(0, 2).map(continueCard).join('')}</section>` : ''}`;
}

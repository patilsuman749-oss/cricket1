import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { escapeHtml, formatDate, formatNumber } from '../utils/helpers.js';
import { state } from '../state/store.js';
import { teamById } from '../scoring/engine.js';
import { scorecardForInnings } from '../scoring/calculations.js';

export const scorecardMatch = () => state.matches.find((x) => x.matchId === state.scorecardMatchId) || state.match;

function inningsCard(m, inn, index) {
  const team = teamById(m, inn.battingTeamId), sc = scorecardForInnings(m, inn);
  const batted = sc.batting.filter((x) => x.batted), yet = sc.batting.filter((x) => !x.batted);
  return `<section class="section card"><div class="scorecard-head"><div><h2>${escapeHtml(team.name)} — ${sc.total}/${sc.wickets}</h2><div class="small">Innings ${index + 1} · ${sc.overs} overs · Extras ${sc.extras.total}</div></div><span class="chip">${index === 1 ? `Target ${m.innings[0].derived.total + 1}` : 'First innings'}</span></div>
  <h3 style="margin:14px 0 9px">Batting</h3><div class="table-wrap"><table><thead><tr><th>Player</th><th>Status</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>${batted.map((x) => `<tr><td><strong>${escapeHtml(x.player.name)}</strong></td><td>${escapeHtml(x.status)}</td><td>${x.runs}</td><td>${x.balls}</td><td>${x.fours}</td><td>${x.sixes}</td><td>${formatNumber(x.strikeRate)}</td></tr>`).join('') || '<tr><td colspan="7">No batting data yet.</td></tr>'}</tbody></table></div>
  ${yet.length ? `<div class="small" style="margin-top:9px">Did not bat: ${yet.map((x) => escapeHtml(x.player.name)).join(', ')}</div>` : ''}
  <div class="small" style="margin-top:9px">Extras — Wd ${sc.extras.wide} · Nb ${sc.extras.noBall} · B ${sc.extras.bye} · Lb ${sc.extras.legBye}</div>
  <h3 style="margin:18px 0 9px">Bowling</h3><div class="table-wrap"><table><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>ECO</th></tr></thead><tbody>${sc.bowlers.map((x) => `<tr><td><strong>${escapeHtml(x.player.name)}</strong></td><td>${x.overs}</td><td>${x.maidens}</td><td>${x.conceded}</td><td>${x.wickets}</td><td>${formatNumber(x.economy)}</td></tr>`).join('') || '<tr><td colspan="6">No bowling data yet.</td></tr>'}</tbody></table></div></section>`;
}

export function renderScorecardPage() {
  const m = scorecardMatch();
  if (!m) return '<div class="empty"><strong>Scorecard not found</strong></div>';
  return `${pageHead('Scorecard', `${m.teams[0].name} vs ${m.teams[1].name}`, `${formatDate(m.createdAt)} · ${m.matchId}`)}<div class="hero-actions" style="margin:0 0 18px"><button type="button" class="secondary-btn" data-action="share" data-id="${m.matchId}">${icon('share', 15)} Share</button><button type="button" class="secondary-btn" data-action="download-scorecard" data-id="${m.matchId}">${icon('download', 15)} Download Scorecard</button>${m.status === 'active' ? `<button type="button" class="primary-btn" data-action="continue-match" data-id="${m.matchId}">${icon('play', 15)} Back to scoring</button>` : ''}</div>${m.innings.map((inn, i) => inningsCard(m, inn, i)).join('')}<div class="section result-box"><div class="result-title">Result</div><div class="result-main">${escapeHtml(m.result?.text || 'Match in progress')}</div>${m.status === 'completed' ? `<div class="result-meta">Saved locally on ${formatDate(m.updatedAt)}</div>` : ''}</div>`;
}

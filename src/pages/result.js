import { icon } from '../components/icons.js';
import { escapeHtml } from '../utils/helpers.js';
import { state } from '../state/store.js';

export function renderResult() {
  const m = state.match;
  if (!m) return '';
  const [i0, i1] = m.innings;
  return `<div class="result-box"><div class="result-title">Match complete · ${escapeHtml(m.matchId)}</div><div class="result-main">${escapeHtml(m.result?.text || 'MATCH TIED')}</div><div class="result-meta">${escapeHtml(m.teams[0].name)} ${i0?.derived.total || 0}/${i0?.derived.wickets || 0} · ${escapeHtml(m.teams[1].name)} ${i1?.derived.total || 0}/${i1?.derived.wickets || 0}</div>
  <div class="hero-actions" style="justify-content:center"><button type="button" class="primary-btn" data-action="open-scorecard">View Scorecard</button><button type="button" class="secondary-btn" data-action="share" data-id="${m.matchId}">${icon('share', 15)} Share</button><button type="button" class="secondary-btn" data-action="undo-result">Undo last ball</button><button type="button" class="secondary-btn" data-action="home">Done</button></div></div>`;
}

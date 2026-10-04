import { escapeHtml, formatDate, formatOvers } from '../utils/helpers.js';

export function scorecardText(match){
  const lines=[`ScoreX — ${match.teams[0].name} vs ${match.teams[1].name}`,formatDate(match.createdAt),''];
  for(const inn of match.innings){ const team=match.teams.find(t=>t.id===inn.battingTeamId); lines.push(`${team.name}: ${inn.derived.total}/${inn.derived.wickets} (${formatOvers(inn.derived.legalBalls)} overs)`); const entries=Object.entries(inn.derived.batterStats).filter(([,s])=>s.balls>0); for(const [id,s] of entries){ const p=match.teams.flatMap(t=>t.players).find(x=>x.id===id); lines.push(`${p?.name||'Player'} ${s.runs} (${s.balls})`); } lines.push(''); }
  if(match.result) lines.push(match.result.text);
  lines.push(`Match ID: ${match.matchId}`); return lines.join('\n');
}

export async function shareMatch(match){
  const text=scorecardText(match);
  if(navigator.share){ await navigator.share({title:`ScoreX — ${match.teams[0].name} vs ${match.teams[1].name}`,text}); return 'shared'; }
  try{ await navigator.clipboard.writeText(text); return 'copied'; }catch{ downloadText(text,`ScoreX-${match.matchId}.txt`); return 'downloaded'; }
}

export function downloadText(text,filename){ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
export function downloadJson(payload){ downloadText(JSON.stringify(payload,null,2),`ScoreX-backup-${new Date().toISOString().slice(0,10)}.json`); }
export function downloadScorecardHtml(match){
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>ScoreX Scorecard</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:30px auto;padding:0 16px;color:#0e1d3a}table{width:100%;border-collapse:collapse;margin:10px 0 28px}th,td{padding:8px;border-bottom:1px solid #dfe9f7;text-align:left}h1{color:#0f5bd7}</style></head><body><h1>ScoreX</h1><p>${escapeHtml(match.teams[0].name)} vs ${escapeHtml(match.teams[1].name)} — ${escapeHtml(formatDate(match.createdAt))}</p>${match.innings.map(inn=>{const team=match.teams.find(t=>t.id===inn.battingTeamId);return `<h2>${escapeHtml(team.name)} — ${inn.derived.total}/${inn.derived.wickets} (${formatOvers(inn.derived.legalBalls)})</h2><table><tr><th>Player</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>${Object.entries(inn.derived.batterStats).filter(([,s])=>s.balls>0).map(([id,s])=>{const p=match.teams.flatMap(t=>t.players).find(x=>x.id===id);return `<tr><td>${escapeHtml(p?.name||'Player')}</td><td>${s.runs}</td><td>${s.balls}</td><td>${s.fours}</td><td>${s.sixes}</td><td>${s.balls?(s.runs/s.balls*100).toFixed(2):'0.00'}</td></tr>`}).join('')}</table>`}).join('')}<h2>${escapeHtml(match.result?.text||'Match ongoing')}</h2></body></html>`;
  downloadText(html,`ScoreX-${match.matchId}-scorecard.html`);
}

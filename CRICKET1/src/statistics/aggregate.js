export function aggregatePlayers(matches) {
  const map=new Map();
  for (const match of matches) {
    for (const team of match.teams) for (const p of team.players) {
      if (!map.has(p.id)) map.set(p.id,{ player:{...p}, matches:0,runs:0,balls:0,highest:0,fours:0,sixes:0,wickets:0,legalBalls:0,conceded:0,innings:0,notOuts:0 });
      const a=map.get(p.id); a.matches += 1;
      for (const inn of match.innings) {
        const bat=inn.derived.batterStats[p.id]; const bowl=inn.derived.bowlerStats[p.id];
        if (bat && bat.balls>0) { a.innings += 1; a.runs += bat.runs; a.balls += bat.balls; a.highest=Math.max(a.highest,bat.runs); a.fours += bat.fours; a.sixes += bat.sixes; a.fifties = (a.fifties||0) + (bat.runs>=50 && bat.runs<100 ? 1 : 0); a.hundreds = (a.hundreds||0) + (bat.runs>=100 ? 1 : 0); }
        if (bowl) { a.wickets += bowl.wickets; a.legalBalls += bowl.legalBalls; a.conceded += bowl.conceded; const bowlingFigure=[bowl.wickets,bowl.conceded]; if(!a.bestBowlingFigure || bowlingFigure[0]>a.bestBowlingFigure[0] || (bowlingFigure[0]===a.bestBowlingFigure[0] && bowlingFigure[1]<a.bestBowlingFigure[1])) a.bestBowlingFigure=bowlingFigure; }
      }
    }
  }
  return [...map.values()].map(a=>({ ...a,
    average:a.innings ? a.runs/a.innings : 0,
    strikeRate:a.balls ? a.runs/a.balls*100 : 0,
    economy:a.legalBalls ? a.conceded/(a.legalBalls/6) : 0,
    bestBowling:a.bestBowlingFigure ? `${a.bestBowlingFigure[0]}/${a.bestBowlingFigure[1]}` : '—', fifties:a.fifties||0, hundreds:a.hundreds||0
  }));
}

export function topStats(players) {
  const top=(key,fn=(x)=>x[key])=>players.filter(p=>fn(p)>0).sort((a,b)=>fn(b)-fn(a))[0]||null;
  return {
    runs:top('runs'), wickets:top('wickets'), strikeRate:top('strikeRate'), economy:players.filter(p=>p.legalBalls).sort((a,b)=>a.economy-b.economy)[0]||null,
    fours:top('fours'), sixes:top('sixes'), matches:top('matches')
  };
}

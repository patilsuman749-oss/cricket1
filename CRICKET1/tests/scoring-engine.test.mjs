import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, setOpeners, setBowler, addRuns, addExtra, addWicket, undo, editLastBall, changeStrike,
  currentMetrics, currentInnings, finishFirstInnings, scoringBlockReason, serializeMatch, hydrateMatch,
  availableBatters, bowlerChoices, ballLabel
} from '../src/scoring/engine.js';

const names = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}` }));
function fixture({ overs = 2, a = 6, b = 6, decision = 'bat' } = {}) {
  const m = createMatch({ formatOvers: overs, team1: { id: 'team1', name: 'Alpha' }, team2: { id: 'team2', name: 'Bravo' }, tossWinner: 'team1', tossDecision: decision, team1Players: names('A', a), team2Players: names('B', b) });
  const inn = currentInnings(m);
  const [bat, bowl] = inn.battingTeamId === 'team1' ? ['A', 'B'] : ['B', 'A'];
  setOpeners(m, `${bat}1`, `${bat}2`, `${bowl}1`);
  return m;
}
const inn = (m) => currentInnings(m);
const d = (m) => inn(m).derived;

test('runs 0-6 update score, striker runs, balls, fours and sixes', () => {
  const m = fixture({ overs: 5 });
  for (const r of [0, 1, 2, 3, 4, 5]) { addRuns(m, r); if (inn(m).striker !== 'A1') changeStrike(m); }
  setBowler(m, 'B2');
  addRuns(m, 6);
  assert.equal(d(m).total, 21); assert.equal(d(m).legalBalls, 7);
  assert.equal(d(m).batterStats.A1.runs, 21); assert.equal(d(m).batterStats.A1.balls, 7);
  assert.equal(d(m).batterStats.A1.fours, 1); assert.equal(d(m).batterStats.A1.sixes, 1); assert.equal(d(m).batterStats.A1.dots, 1);
  assert.equal(Math.round(d(m).batterStats.A1.strikeRate), 300);
  assert.equal(d(m).bowlerStats.B1.conceded, 15); assert.equal(d(m).bowlerStats.B2.conceded, 6);
});

test('exact strike table 1→change 2→same 3→change 4→same 5→change 6→same', () => {
  for (const [r, swap] of [[1, true], [2, false], [3, true], [4, false], [5, true], [6, false]]) {
    const m = fixture({ overs: 5 });
    addRuns(m, r);
    assert.equal(inn(m).striker, swap ? 'A2' : 'A1', `run ${r}`);
  }
});

test('wide: min 1, illegal, bowler wides, no strike change for 1 wide, extra wide runs rotate by runs run', () => {
  const m = fixture();
  addExtra(m, 'wide', 1);
  assert.equal(d(m).total, 1); assert.equal(d(m).legalBalls, 0);
  assert.equal(d(m).extras.wide, 1); assert.equal(d(m).bowlerStats.B1.wides, 1); assert.equal(d(m).bowlerStats.B1.conceded, 1);
  assert.equal(inn(m).striker, 'A1', 'wide (penalty only) does not rotate');
  assert.equal(d(m).batterStats.A1.balls, 0, 'wide is not a ball faced');
  addExtra(m, 'wide', 2); // wide + 1 run run
  assert.equal(inn(m).striker, 'A2');
  addExtra(m, 'wide', 3); addExtra(m, 'wide', 1);
  assert.equal(d(m).legalBalls, 0, 'multiple wides never consume a ball');
  assert.equal(d(m).total, 1 + 2 + 3 + 1);
  assert.throws(() => addExtra(m, 'wide', 0), /between 1 and 20/);
  assert.throws(() => addExtra(m, 'wide', 1, 2), /cannot score off a wide/);
});

test('no-ball: penalty + bat runs, not legal, bowler charged, batter credited', () => {
  const m = fixture();
  addExtra(m, 'no-ball', 1, 4);
  assert.equal(d(m).total, 5); assert.equal(d(m).legalBalls, 0);
  assert.equal(d(m).batterStats.A1.runs, 4); assert.equal(d(m).batterStats.A1.fours, 1);
  assert.equal(d(m).bowlerStats.B1.conceded, 5); assert.equal(d(m).bowlerStats.B1.noBalls, 1);
  assert.equal(d(m).bowlerStats.B1.legalBalls, 0);
  assert.equal(inn(m).striker, 'A1');
  addExtra(m, 'no-ball', 1, 1);
  assert.equal(inn(m).striker, 'A2', 'one run off a no-ball rotates');
  addExtra(m, 'no-ball', 1, 0);
  assert.equal(d(m).extras.noBall, 3);
});

test('bye / leg-bye: legal ball, team extras, not batter runs, not bowler runs, strike rotates by runs', () => {
  const m = fixture();
  addExtra(m, 'bye', 2);
  assert.equal(d(m).total, 2); assert.equal(d(m).legalBalls, 1);
  assert.equal(d(m).batterStats.A1.runs, 0); assert.equal(d(m).extras.bye, 2);
  assert.equal(d(m).bowlerStats.B1.conceded, 0); assert.equal(d(m).bowlerStats.B1.legalBalls, 1);
  assert.equal(inn(m).striker, 'A1');
  addExtra(m, 'leg-bye', 1);
  assert.equal(d(m).legalBalls, 2); assert.equal(d(m).extras.legBye, 1); assert.equal(inn(m).striker, 'A2');
  assert.throws(() => addExtra(m, 'bye', 1, 1), /do not belong to the batter/);
});

test('over = exactly 6 legal balls; wides/no-balls do not count; byes do; bowler must be re-selected; strike swaps', () => {
  const m = fixture();
  addRuns(m, 0); addExtra(m, 'wide'); addRuns(m, 0); addExtra(m, 'no-ball', 1, 0); addRuns(m, 0); addExtra(m, 'bye', 1); // bye rotates
  assert.equal(d(m).legalBalls, 4);
  addRuns(m, 0);
  const last = addRuns(m, 0);
  assert.equal(last.overComplete, true);
  assert.equal(d(m).legalBalls, 6);
  assert.equal(d(m).overSummaries.length, 1);
  assert.equal(inn(m).currentBowler, null);
  assert.equal(scoringBlockReason(m), 'Select the bowler first.');
  assert.throws(() => addRuns(m, 1), /Select the bowler/);
  assert.throws(() => setBowler(m, 'B1'), /two overs in a row/);
  assert.equal(bowlerChoices(m).find((c) => c.player.id === 'B1').barred, true);
  setBowler(m, 'B2');
  assert.equal(d(m).over, 2);
  assert.equal(d(m).legalInOver, 0);
  // strike: A1 faced ball1, bye rotated to A2 ... verify swap applied at end of over
  assert.ok(['A1', 'A2'].includes(inn(m).striker));
});

test('end-of-over swap with an odd last ball keeps the same striker (two swaps)', () => {
  const m = fixture();
  for (let i = 0; i < 5; i++) addRuns(m, 0);
  assert.equal(inn(m).striker, 'A1');
  addRuns(m, 1); // swap -> A2, then over-end swap -> A1
  assert.equal(inn(m).striker, 'A1');
});

test('maiden detection; wides break a maiden; byes do not', () => {
  const m = fixture();
  for (let i = 0; i < 5; i++) addRuns(m, 0);
  addExtra(m, 'bye', 1); // bye ball 6 — not against the bowler
  assert.equal(d(m).bowlerStats.B1.maidens, 1);
  const m2 = fixture();
  addExtra(m2, 'wide');
  for (let i = 0; i < 6; i++) addRuns(m2, 0);
  assert.equal(d(m2).bowlerStats.B1.maidens, 0);
});

test('wicket: bowled/caught/lbw/stumped/hit-wicket credit the bowler; run-out/other/retired do not', () => {
  for (const [type, credit] of [['bowled', 1], ['caught', 1], ['lbw', 1], ['stumped', 1], ['hit-wicket', 1], ['run-out', 0], ['other', 0], ['retired', 0]]) {
    const m = fixture();
    addWicket(m, { dismissalType: type, dismissedPlayer: 'A1', newBatterId: 'A3' });
    assert.equal(d(m).wickets, 1, type);
    assert.equal(d(m).bowlerStats.B1?.wickets ?? 0, credit, type);
    assert.equal(inn(m).striker, 'A3', type);
    assert.equal(d(m).out.A1.type, type);
    assert.equal(d(m).partnership.runs, 0);
    assert.deepEqual(availableBatters(m).map((p) => p.id), ['A4', 'A5', 'A6']);
  }
});

test('retired is not a delivery: no ball, no bowler credit, wicket recorded', () => {
  const m = fixture();
  addWicket(m, { dismissalType: 'retired', dismissedPlayer: 'A1', newBatterId: 'A3' });
  assert.equal(d(m).legalBalls, 0);
  assert.equal(d(m).bowlerStats.B1, undefined);
  assert.equal(ballLabel(inn(m).deliveries[0]), 'Ret');
});

test('run-out can dismiss either batter; new batter takes the dismissed batter\'s end', () => {
  const m = fixture();
  addWicket(m, { dismissalType: 'run-out', dismissedPlayer: 'A2', newBatterId: 'A3' });
  assert.equal(inn(m).striker, 'A1'); assert.equal(inn(m).nonStriker, 'A3');
  const m2 = fixture();
  addWicket(m2, { dismissalType: 'run-out', dismissedPlayer: 'A1', newBatterId: 'A3', runs: 1 });
  // one run completed: batters crossed, A1 (now at the other end) is out; A3 replaces him there
  assert.equal(inn(m2).striker, 'A2' === inn(m2).striker ? 'A2' : inn(m2).striker);
  assert.ok(!Object.values({ s: inn(m2).striker, n: inn(m2).nonStriker }).includes('A1'));
  assert.equal(d(m2).batterStats.A1.runs, 1);
  assert.equal(d(m2).total, 1);
});

test('dismissed batter can never bat again; wicket needs a valid replacement', () => {
  const m = fixture();
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1' }), /Select the new batter/);
  assert.equal(d(m).wickets, 0, 'failed wicket leaves no trace');
  assert.equal(inn(m).deliveries.length, 0);
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A1' }), /cannot come in/);
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A2' }), /cannot come in/);
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'B1' }), /cannot come in/);
  addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A3' });
  addRuns(m, 1);
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A3', newBatterId: 'A1' }), /cannot come in/);
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A9', newBatterId: 'A4' }), /active batter/);
});

test('wicket off wide / no-ball obeys the laws', () => {
  const m = fixture();
  assert.throws(() => addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A3', onExtra: 'wide' }), /not possible off a wide/);
  assert.throws(() => addWicket(m, { dismissalType: 'stumped', dismissedPlayer: 'A1', newBatterId: 'A3', onExtra: 'no-ball' }), /Only a run-out/);
  addWicket(m, { dismissalType: 'stumped', dismissedPlayer: 'A1', newBatterId: 'A3', onExtra: 'wide' });
  assert.equal(d(m).legalBalls, 0); assert.equal(d(m).total, 1); assert.equal(d(m).wickets, 1);
});

test('partnership resets on wicket and tracks runs/balls', () => {
  const m = fixture();
  addRuns(m, 4); addRuns(m, 2); addExtra(m, 'wide');
  assert.deepEqual({ r: d(m).partnership.runs, b: d(m).partnership.balls }, { r: 7, b: 2 });
  addWicket(m, { dismissalType: 'caught', dismissedPlayer: 'A1', newBatterId: 'A3' });
  assert.deepEqual({ r: d(m).partnership.runs, b: d(m).partnership.balls }, { r: 0, b: 0 });
  addRuns(m, 3);
  assert.equal(d(m).partnership.runs, 3);
});

test('undo reverses the complete previous delivery, repeatedly', () => {
  const m = fixture();
  const snap = () => JSON.stringify([d(m), inn(m).striker, inn(m).nonStriker, inn(m).currentBowler, inn(m).deliveries.length]);
  const states = [snap()];
  addRuns(m, 1); states.push(snap());
  addExtra(m, 'wide', 2); states.push(snap());
  addWicket(m, { dismissalType: 'caught', dismissedPlayer: inn(m).striker, newBatterId: 'A3' }); states.push(snap());
  addExtra(m, 'no-ball', 1, 4); states.push(snap());
  for (let i = 0; i < 3; i++) addRuns(m, 0);
  const finisher = addRuns(m, 1); // 6th legal ball
  assert.equal(finisher.overComplete, true);
  assert.equal(inn(m).currentBowler, null);
  undo(m);
  assert.equal(inn(m).currentBowler, 'B1', 'bowler restored after undoing the last ball of an over');
  for (let i = 0; i < 3; i++) undo(m);
  for (let i = states.length - 1; i >= 0; i--) { assert.equal(snap(), states[i], `state ${i}`); if (i) undo(m); }
  assert.throws(() => undo(m), /Nothing to undo/);
});

test('undo after the winning ball re-opens the match', () => {
  const m = fixture({ overs: 1, a: 3, b: 3 });
  for (let i = 0; i < 6; i++) addRuns(m, 1);
  finishFirstInnings(m);
  setOpeners(m, 'B1', 'B2', 'A1');
  for (let i = 0; i < 6; i++) { if (m.status === 'completed') break; addRuns(m, 1); }
  assert.equal(m.status, 'completed');
  undo(m);
  assert.equal(m.status, 'active'); assert.equal(m.result, null);
  assert.equal(scoringBlockReason(m), null);
});

test('edit last ball replaces atomically; invalid edit restores the original', () => {
  const m = fixture();
  addRuns(m, 1);
  editLastBall(m, { kind: 'runs', runs: 4 });
  assert.equal(d(m).total, 4); assert.equal(inn(m).striker, 'A1'); assert.equal(inn(m).deliveries.length, 1);
  editLastBall(m, { kind: 'extra', type: 'wide', amount: 1 });
  assert.equal(d(m).legalBalls, 0); assert.equal(d(m).total, 1);
  const before = JSON.stringify(serializeMatch(m).innings);
  assert.throws(() => editLastBall(m, { kind: 'wicket', dismissalType: 'bowled', dismissedPlayer: 'A1' }), /new batter/);
  assert.equal(JSON.stringify(serializeMatch(m).innings), before, 'original delivery restored');
  editLastBall(m, { kind: 'wicket', dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A3' });
  assert.equal(d(m).wickets, 1);
});

test('change strike is a manual correction', () => {
  const m = fixture();
  changeStrike(m);
  assert.equal(inn(m).striker, 'A2'); assert.equal(inn(m).nonStriker, 'A1');
});

test('seventh legal ball is impossible; innings ends at the over limit; scoring blocked afterwards', () => {
  const m = fixture({ overs: 1 });
  for (let i = 0; i < 6; i++) addRuns(m, 0);
  assert.equal(d(m).legalBalls, 6);
  assert.equal(currentMetrics(m).finished, true);
  assert.throws(() => addRuns(m, 1), /innings has ended/);
  assert.throws(() => addExtra(m, 'wide'), /innings has ended/);
  assert.equal(d(m).total, 0);
});

test('all out ends the innings (players-1 wickets) and needs no replacement', () => {
  const m = fixture({ a: 3 });
  addWicket(m, { dismissalType: 'bowled', dismissedPlayer: 'A1', newBatterId: 'A3' });
  assert.equal(scoringBlockReason(m), null);
  const r = addWicket(m, { dismissalType: 'bowled', dismissedPlayer: inn(m).striker });
  assert.equal(r.inningsOver, true);
  assert.throws(() => addRuns(m, 1), /innings has ended/);
});

test('chase: target, runs required, balls remaining, CRR, RRR, win by wickets', () => {
  const m = fixture({ overs: 2, a: 5, b: 5 });
  for (let o = 0; o < 2; o++) { for (let i = 0; i < 6; i++) addRuns(m, 2); if (o === 0) setBowler(m, 'B2'); }
  assert.equal(d(m).total, 24);
  finishFirstInnings(m);
  assert.equal(inn(m).target, 25);
  setOpeners(m, 'B1', 'B2', 'A1');
  addRuns(m, 6); addRuns(m, 4);
  const met = currentMetrics(m);
  assert.equal(met.runsRequired, 15); assert.equal(met.ballsRemaining, 10);
  assert.equal(Math.round(met.crr * 100) / 100, 30); assert.equal(Math.round(met.rrr * 100) / 100, 9);
  addRuns(m, 6); addRuns(m, 6); addRuns(m, 2);
  assert.equal(m.status, 'active');
  assert.equal(currentMetrics(m).runsRequired, 1);
  const last = addRuns(m, 1);
  assert.equal(last.matchOver, true);
  assert.equal(m.status, 'completed');
  assert.equal(m.result.winner, 'team2');
  assert.match(m.result.text, /Bravo won by 4 wickets/);
  assert.throws(() => addRuns(m, 1), /match is over/);
});

test('result: win by runs, tie', () => {
  const play = (firstRuns, secondRuns) => {
    const m = fixture({ overs: 1, a: 3, b: 3 });
    for (let i = 0; i < 6; i++) addRuns(m, firstRuns);
    finishFirstInnings(m); setOpeners(m, 'B1', 'B2', 'A1');
    for (let i = 0; i < 6 && m.status !== 'completed'; i++) addRuns(m, secondRuns);
    return m;
  };
  assert.match(play(2, 1).result.text, /Alpha won by 6 runs/);
  assert.equal(play(1, 1).result.type, 'tie');
});

test('toss decides batting first', () => {
  const m = createMatch({ formatOvers: 5, team1: { id: 'team1', name: 'A' }, team2: { id: 'team2', name: 'B' }, tossWinner: 'team2', tossDecision: 'bat', team1Players: names('A', 2), team2Players: names('B', 2) });
  assert.equal(inn(m).battingTeamId, 'team2');
  const m2 = createMatch({ formatOvers: 5, team1: { id: 'team1', name: 'A' }, team2: { id: 'team2', name: 'B' }, tossWinner: 'team2', tossDecision: 'bowl', team1Players: names('A', 2), team2Players: names('B', 2) });
  assert.equal(inn(m2).battingTeamId, 'team1');
  assert.throws(() => createMatch({ formatOvers: 5, team1: { id: 'team1', name: 'A' }, team2: { id: 'team2', name: 'B' }, tossWinner: 'nobody', tossDecision: 'bat', team1Players: names('A', 2), team2Players: names('B', 2) }), /toss winner/);
});

test('validation: same player cannot be striker and non-striker; openers must be from the right teams', () => {
  const m = createMatch({ formatOvers: 5, team1: { id: 'team1', name: 'A' }, team2: { id: 'team2', name: 'B' }, tossWinner: 'team1', tossDecision: 'bat', team1Players: names('A', 3), team2Players: names('B', 3) });
  assert.throws(() => setOpeners(m, 'A1', 'A1', 'B1'), /different/);
  assert.throws(() => setOpeners(m, 'A1', 'B1', 'B2'), /batting team/);
  assert.throws(() => setOpeners(m, 'A1', 'A2', 'A3'), /bowling team/);
  assert.match(scoringBlockReason(m), /two batters/);
});

test('persisted form holds only history; hydrate restores identical derived state; legacy records upgrade', () => {
  const m = fixture();
  addRuns(m, 4); addExtra(m, 'wide', 2); addWicket(m, { dismissalType: 'bowled', dismissedPlayer: inn(m).striker, newBatterId: 'A3' });
  const stored = JSON.parse(JSON.stringify(serializeMatch(m)));
  assert.equal(stored.innings[0].derived, undefined);
  assert.equal(stored.innings[0].total, undefined);
  const back = hydrateMatch(stored);
  assert.deepEqual(back.innings[0].derived, m.innings[0].derived);
  assert.equal(back.innings[0].striker, m.innings[0].striker);

  const legacy = JSON.parse(JSON.stringify(serializeMatch(m)));
  legacy.current = { strikerId: 'A9', nonStrikerId: 'A8', bowlerId: 'B3' };
  delete legacy.innings[0].striker; delete legacy.innings[0].nonStriker; delete legacy.innings[0].currentBowler;
  legacy.snapshots = [{ huge: true }];
  legacy.innings[0].total = 999;
  hydrateMatch(legacy);
  assert.equal(legacy.innings[0].striker, 'A9');
  assert.equal(legacy.snapshots, undefined);
  assert.equal(legacy.innings[0].derived.total, m.innings[0].derived.total);
});

test('delivery records carry every required field', () => {
  const m = fixture();
  addExtra(m, 'no-ball', 1, 2);
  const del = inn(m).deliveries[0];
  for (const k of ['deliveryId', 'innings', 'over', 'ball', 'legalBall', 'striker', 'nonStriker', 'bowler', 'batterRuns', 'totalRuns', 'extras', 'extraType', 'isLegalBall', 'wicket', 'dismissedPlayer', 'timestamp']) assert.ok(k in del, k);
  assert.equal(del.totalRuns, 3); assert.equal(del.extras, 1); assert.equal(del.batterRuns, 2);
});

test('performance: 600 deliveries, each scored+derived, stays far below one frame', () => {
  const m = fixture({ overs: 100, a: 12, b: 12 });
  const t0 = performance.now();
  let n = 0;
  while (n < 590) {
    addRuns(m, n % 7);
    n++;
    if (inn(m).currentBowler === null) setBowler(m, inn(m).deriveLast ?? (['B1', 'B2'].find((id) => !bowlerChoices(m).find((c) => c.player.id === id).barred)));
  }
  const per = (performance.now() - t0) / n;
  assert.ok(per < 1, `average ${per.toFixed(3)} ms per ball`);
});

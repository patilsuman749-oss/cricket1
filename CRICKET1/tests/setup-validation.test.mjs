import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/pages/setup-validation.js';

const fresh = () => S.createSetupState();

test('THE scenario: Step 2 with both team names, press Next → NO player error', () => {
  const s = fresh();
  assert.equal(S.advance(s).ok, true);           // step 1 → 2
  assert.equal(S.stepName(s), 'teams');
  S.setTeamName(s, 'team1', 'suman'); S.setTeamName(s, 'team2', 'rahul');
  // player names are still empty — must be irrelevant here
  assert.equal(S.validatePlayersStep(s).length, 2 * 2, 'players ARE invalid at this moment…');
  const r = S.advance(s);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(s.errors, []);                // …but nothing was reported
  assert.equal(S.stepName(s), 'players');
  assert.deepEqual(S.visibleErrors(s), [], 'arriving on Step 3 shows no errors yet');
});

test('Step 3: leave Player 1 empty, Next → player validation appears, user stays on Step 3', () => {
  const s = fresh();
  S.advance(s); S.setTeamName(s, 'team1', 'suman'); S.setTeamName(s, 'team2', 'rahul'); S.advance(s);
  S.setPlayerName(s, 'team1', 1, 'Asha');
  S.setPlayerName(s, 'team2', 0, 'Ravi'); S.setPlayerName(s, 'team2', 1, 'Kiran');
  const r = S.advance(s);
  assert.equal(r.ok, false);
  assert.equal(S.stepName(s), 'players');
  assert.deepEqual(S.visibleErrors(s), [{ step: 'players', field: 'team1-player-1', message: 'suman: enter a name for Player 1' }]);
});

test('Step 2 validates ONLY team fields (empty / duplicate / too long)', () => {
  const s = fresh(); S.advance(s);
  S.setTeamName(s, 'team1', '  '); 
  let r = S.advance(s);
  assert.deepEqual(r.errors.map((e) => [e.step, e.field]), [['teams', 'team1-name']]);
  S.setTeamName(s, 'team1', 'Lions'); S.setTeamName(s, 'team2', 'lions');
  assert.match(S.advance(s).errors[0].message, /different/);
  S.setTeamName(s, 'team2', 'x'.repeat(31));
  assert.match(S.advance(s).errors[0].message, /30 characters/);
  for (const e of s.errors) assert.equal(e.step, 'teams');
});

test('Step 1 validates only format / custom overs', () => {
  const s = fresh();
  S.setFormat(s, 'custom'); S.setCustomOvers(s, '0');
  assert.equal(S.advance(s).ok, false);
  assert.equal(S.visibleErrors(s)[0].field, 'overs');
  S.setCustomOvers(s, ''); assert.equal(S.advance(s).ok, false);
  S.setCustomOvers(s, '101'); assert.equal(S.advance(s).ok, false);
  S.setCustomOvers(s, '8'); assert.equal(S.advance(s).ok, true); assert.equal(s.formatOvers, 8);
  S.goBack(s); S.setFormat(s, 20); assert.equal(s.customOvers, false); assert.equal(S.advance(s).ok, true);
});

test('Step 3: min 2 players, empty names, duplicates within a team (not across teams)', () => {
  const s = fresh();
  s.team1Players.forEach((p, i) => (p.name = ['Asha', 'asha '][i]));
  s.team2Players.forEach((p, i) => (p.name = ['Asha', 'Bina'][i]));
  const errs = S.validatePlayersStep(s);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].field, 'team1-player-2');
  assert.match(errs[0].message, /already used/);
  assert.equal(S.removePlayer(s, 'team1', 0), false, 'cannot go below 2 players');
  const idx = S.addPlayer(s, 'team1'); assert.equal(idx, 2);
  assert.equal(S.removePlayer(s, 'team1', 2), true);
  assert.equal(s.team1Players.length, 2);
});

test('Step 4: toss must be chosen explicitly', () => {
  const s = fresh();
  assert.equal(s.tossWinner, null);
  assert.deepEqual(S.validateTossStep(s).map((e) => e.field), ['toss-winner', 'toss-decision']);
  S.setToss(s, { winner: 'team2' });
  assert.deepEqual(S.validateTossStep(s).map((e) => e.field), ['toss-decision']);
  S.setToss(s, { decision: 'bowl' });
  assert.deepEqual(S.validateTossStep(s), []);
  assert.deepEqual(S.battingFirstName(s), { batting: 'Team A', bowling: 'Team B' });
});

test('Step 5 (confirm) validates nothing; START re-checks everything and jumps to the failing step', () => {
  const s = fresh();
  assert.deepEqual(S.validateConfirmationStep(s), []);
  s.step = 5;                                    // simulate being on Confirm with an invalid setup
  assert.deepEqual(S.visibleErrors(s), []);
  const r = S.validateAllForStart(s);
  assert.equal(r.ok, false); assert.equal(r.step, 'players');
  assert.equal(S.stepName(s), 'players');
  assert.ok(S.visibleErrors(s).every((e) => e.step === 'players'));
});

test('stale errors can never show on another step', () => {
  const s = fresh();
  s.errors = [{ step: 'players', field: 'team1-player-1', message: 'suman: enter a name for Player 1' }];
  assert.deepEqual(S.visibleErrors(s), [], 'format step ignores a players error');
  s.step = 2; assert.deepEqual(S.visibleErrors(s), []);
  s.step = 4; assert.deepEqual(S.visibleErrors(s), []);
  s.step = 5; assert.deepEqual(S.visibleErrors(s), []);
  s.step = 3; assert.equal(S.visibleErrors(s).length, 1);
});

test('errors are cleared on Back, step change, edits, add/remove player, successful Next', () => {
  const mk = () => { const s = fresh(); s.errors = [{ step: 'format', field: 'x', message: 'm' }]; return s; };
  let s = mk(); S.goBack(s); assert.deepEqual(s.errors, []);
  s = mk(); S.goToStep(s, 1); assert.deepEqual(s.errors, []);
  s = mk(); S.setTeamName(s, 'team1', 'a'); assert.deepEqual(s.errors, []);
  s = mk(); S.setPlayerName(s, 'team1', 0, 'a'); assert.deepEqual(s.errors, []);
  s = mk(); S.addPlayer(s, 'team1'); assert.deepEqual(s.errors, []);
  s = mk(); S.setToss(s, { winner: 'team1' }); assert.deepEqual(s.errors, []);
  s = mk(); S.advance(s); assert.deepEqual(s.errors, []);
  s = mk(); S.clearErrors(s); assert.deepEqual(s.errors, []);
});

test('step tabs: forward jumps validate each step on the way and stop at the first failure', () => {
  const s = fresh();
  s.team1.name = '';
  const r = S.goToStep(s, 4);
  assert.equal(r.ok, false);
  assert.equal(S.stepName(s), 'teams');
  assert.ok(S.visibleErrors(s).every((e) => e.step === 'teams'));
  assert.equal(S.goToStep(s, 1).ok, true);       // backwards is free
  assert.deepEqual(s.errors, []);
});

test('full happy path produces a clean match config', () => {
  const s = fresh();
  S.advance(s);
  S.setTeamName(s, 'team1', ' Suman  XI '); S.setTeamName(s, 'team2', 'Rahul XI'); S.advance(s);
  S.setPlayerName(s, 'team1', 0, ' Suman '); S.setPlayerName(s, 'team1', 1, 'Asha');
  S.addPlayer(s, 'team2'); ['Ravi', 'Kiran', 'Meena'].forEach((n, i) => S.setPlayerName(s, 'team2', i, n)); S.advance(s);
  S.setToss(s, { winner: 'team1', decision: 'bat' }); assert.equal(S.advance(s).ok, true);
  assert.equal(S.stepName(s), 'confirm');
  assert.equal(S.validateAllForStart(s).ok, true);
  const c = S.toMatchConfig(s);
  assert.equal(c.team1.name, 'Suman XI'); assert.deepEqual(c.team1Players.map((p) => p.name), ['Suman', 'Asha']);
  assert.equal(c.team2Players.length, 3);
  for (const p of [...c.team1Players, ...c.team2Players]) assert.deepEqual(Object.keys(p).sort(), ['id', 'name']);
});

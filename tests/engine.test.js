// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const D = require("../assets/js/data.js");
const E = require("../assets/js/engine.js");

// The suspect list from the original 2013 random.html, in its original order.
const ORIGINAL = [[2,6,2],[3,4,2],[0,5,0],[1,4,3],[3,4,4],[3,3,4],[3,5,2],[5,6,3],[2,3,1],[1,2,4],[3,5,6],
  [2,3,0],[4,3,0],[1,5,3],[1,2,5],[4,0,1],[5,1,6],[2,0,2],[3,4,5],[5,2,2],[2,3,3],[6,3,0],[0,4,4],[0,0,1],
  [1,5,6],[2,6,5],[4,5,5],[2,3,6],[6,5,4],[5,4,3],[6,1,1],[1,0,2],[5,6,6],[0,3,3],[6,4,6],[5,2,0],[6,6,4],
  [6,1,5],[5,6,5],[0,4,2],[4,1,5],[6,0,1],[3,2,4],[0,2,1],[3,1,0],[4,2,3],[0,6,3],[0,5,2],[6,2,3]];

const N = 200000;
function game(players = 4, seed = 12345) { return E.newGame(["A", "B", "C", "D", "E", "F"].slice(0, players), {}, seed); }
function near(actual, expected, tol, msg) { assert.ok(Math.abs(actual - expected) < tol, `${msg}: ${actual} vs ${expected}`); }

test("suspect list matches the original game", () => {
  const key = s => s.join(",");
  assert.deepStrictEqual(D.SUSPECTS.map(key).sort(), ORIGINAL.map(key).sort());
  // Lineup order: one row per voice, then by studio, then by outfit.
  const order = s => [s[2], s[1], s[0]].join(",");
  for (let i = 1; i < D.SUSPECTS.length; i++) assert.ok(order(D.SUSPECTS[i - 1]) < order(D.SUSPECTS[i]));
});

test("interrogations are right (round + 1) / 10 of the time, wrong answers uniform", () => {
  for (const round of [1, 4, 8]) {
    const s = game(); s.round = round;
    const truth = D.SUSPECTS[s.perp][0], counts = Array(7).fill(0);
    for (let i = 0; i < N; i++) counts[E.drawAttribute(s, 0)]++;
    const p = (round + 1) / 10;
    near(counts[truth] / N, p, 0.005, `round ${round} correct`);
    counts.forEach((c, v) => { if (v !== truth) near(c / N, (1 - p) / 6, 0.005, `round ${round} wrong value ${v}`); });
  }
  assert.strictEqual(E.correctChance(9), 1);
});

test("the day has 24 hours, midnight to 11 PM", () => {
  assert.strictEqual(D.HOURS, 24);
  assert.deepStrictEqual([D.TIMES[0], D.TIMES[1], D.TIMES[12], D.TIMES[23]], ["Midnight", "1 AM", "Noon", "11 PM"]);
});

test("crime lab matches the rulebook: 16.7% exact, 44% within an hour, never 6 or more hours off", () => {
  const s = game(), counts = Array(24).fill(0);
  for (let i = 0; i < N; i++) counts[E.modDay(E.drawLab(s) - s.crimeTime)]++;
  near(counts[0] / N, 6 / 36, 0.005, "exact");
  near((counts[0] + counts[1] + counts[23]) / N, 16 / 36, 0.005, "within 1");
  near(counts[5] / N, 1 / 36, 0.003, "5 late");
  for (let off = 6; off <= 18; off++) assert.strictEqual(counts[off], 0, `off by ${off}`);
});

test("crime is 1 to 16 hours after the alibi (3d6 − 2), most often 8 or 9, wrapping past midnight", () => {
  const counts = Array(24).fill(0);
  let wrapped = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const s = game(4, seed);
    counts[E.modDay(s.crimeTime - s.alibis[s.perp])]++;
    if (s.crimeTime < s.alibis[s.perp]) wrapped++;
    assert.ok(s.alibis.every(a => a >= 0 && a < 24));
  }
  assert.strictEqual(counts[0], 0);
  for (let g = 17; g < 24; g++) assert.strictEqual(counts[g], 0);
  assert.ok([8, 9].includes(counts.indexOf(Math.max(...counts))));
  // An alibi rules out exactly 8 of the 24 hours.
  assert.strictEqual(Array.from({ length: 24 }, (_, g) => E.gapChance(g)).filter(p => p === 0).length, 8);
  near(E.gapChance(8), 27 / 216, 1e-12, "peak");
  near(Array.from({ length: 24 }, (_, g) => E.gapChance(g)).reduce((a, b) => a + b, 0), 1, 1e-12, "sums to 1");
  assert.ok(wrapped > 0, "some crimes happen after midnight");
});

test("same seed, same game", () => {
  const a = game(4, 99), b = game(4, 99);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual([E.drawAttribute(a, 1), E.drawLab(a)], [E.drawAttribute(b, 1), E.drawLab(b)]);
});

test("decks match the original card sheet", () => {
  const s = game();
  assert.strictEqual(s.actionDeck.length, 11);
  assert.strictEqual(s.donutDeck.length, 4);
  // Cards resolved on draw never go to the hand.
  s.actionDeck.push("lunch");
  assert.strictEqual(E.drawCard(s, 0, "actionDeck"), "lunch");
  assert.deepStrictEqual(s.hands[0], []);
});

test("weighted totals count each mark by its round", () => {
  const s = game();
  E.record(s, 0, { round: 1, cat: 0, value: 3 });
  E.record(s, 0, { round: 4, cat: 0, value: 3 });
  E.record(s, 0, { round: 2, cat: 1, value: 5, hand: 2 });
  E.record(s, 0, { round: 5, cat: E.TIME_CAT, value: 7 });
  const w = E.weightedTotals(s, 0);
  assert.strictEqual(w.attrs[0][3], 5);
  assert.strictEqual(w.attrs[1][5], 2);
  assert.strictEqual(w.times[7], 1);
});

test("hunches: passing carries half the stake", () => {
  const s = game();
  const values = [];
  for (const r of [2, 3, 4, 5, 6]) { values.push(E.hunchValue(s, 0, r)); E.makeHunch(s, 0, r, null); }
  assert.deepStrictEqual(values, [16, 16, 12, 8, 5]);
  // Hunching every round and always right: 16 + 8 + 4 + 2 + 1.
  const t = game();
  for (const r of [2, 3, 4, 5, 6]) E.makeHunch(t, 1, r, t.perp);
  t.over = true;
  assert.strictEqual(E.finalScores(t).rows[1].hunch, 31);
  // A hunch, right or wrong, uses up the carry.
  E.makeHunch(s, 2, 2, null); E.makeHunch(s, 2, 3, (s.perp + 1) % 49);
  assert.strictEqual(E.hunchValue(s, 2, 4), 4);
});

test("press releases: joint, conflicting, and once per category", () => {
  const s = game();
  let r = E.resolvePressReleases(s, [{ pi: 0, cat: 0, value: 2 }, { pi: 1, cat: 0, value: 2 },
                                     { pi: 2, cat: 1, value: 3 }, { pi: 3, cat: 1, value: 4 }]);
  assert.deepStrictEqual(r.made.map(m => m.by), [[0, 1]]);
  assert.deepStrictEqual(r.blocked.map(b => b.reason), ["conflict"]);
  r = E.resolvePressReleases(s, [{ pi: 2, cat: 0, value: 5 }]);
  assert.deepStrictEqual(r.blocked.map(b => b.reason), ["taken"]);
});

test("trial scoring, including joint prosecution rounding away from zero", () => {
  const s = game(6);
  const innocent = (s.perp + 1) % 49;
  let t = E.runTrial(s, innocent, [0, 1, 2], { 3: true, 4: false, 5: true });
  assert.deepStrictEqual(t.points, { 0: -2, 1: -2, 2: -2, 3: -4, 4: 7, 5: -4 }); // −12/3 = −4, +2 votes
  assert.ok(s.eliminated.includes(innocent) && !s.over);
  t = E.runTrial(s, s.perp, [0, 1, 2], { 3: true, 4: false, 5: false });
  assert.deepStrictEqual(t.points, { 0: 7, 1: 7, 2: 7, 3: 6, 4: -3, 5: -3 }); // 16/3 → 6, +1 vote
  assert.ok(s.over);
});

test("final scores add up and break ties on evidence", () => {
  const s = game(3);
  s.pressReleases[0] = { cat: 0, value: D.SUSPECTS[s.perp][0], by: [0] };
  s.hands[1].push("compliment", "compliment");
  E.record(s, 1, { cat: 0, value: 0 });
  E.record(s, 0, { cat: 0, value: 0 }); E.record(s, 0, { cat: 0, value: 1 });
  s.hands[1].push("compliment", "compliment", "compliment");
  const f = E.finalScores(s);
  assert.strictEqual(f.rows[0].total, 10);
  assert.strictEqual(f.rows[1].total, 10);
  assert.strictEqual(f.ranked[0].pi, 0); // tie on points, more evidence wins
});

test("rounds advance with the right number of turns, and the lead passes left", () => {
  const s = game(4); // 4 players: 4 turns per round
  const ended = [];
  for (let i = 0; i < 8; i++) ended.push(E.endTurn(s));
  assert.deepStrictEqual(ended, [0, 0, 0, 1, 0, 0, 0, 2]);
  assert.strictEqual(s.lead, 2);
});

// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../assets/js/data.js");
const E = require("../assets/js/engine.js");
const AI = require("../assets/js/ai.js");

function aiGame(seed = 7) {
  return E.newGame(AI.ORDER.map(k => ({ name: AI.PERSONALITIES[k].name, ai: k })), {}, seed);
}

test("AI detectives never read hidden information", () => {
  const src = fs.readFileSync(path.join(__dirname, "../assets/js/ai.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const secret of ["perp", "crimeTime", "alibis", "actionDeck[", "donutDeck["]) assert.ok(!src.includes(secret), secret);
  // Other detectives' notes are only counted (public: who went where), never read for values.
  assert.ok(!/notebooks\[k\][^;]*\.value/.test(src));
});

test("beliefs follow the evidence", () => {
  const s = aiGame(), truth = D.SUSPECTS[s.perp];
  let post = AI.posterior(s, 0);
  post.forEach(p => assert.ok(Math.abs(p - 1 / 49) < 1e-9));
  for (let r = 5; r <= 8; r++) for (let c = 0; c < 3; c++) E.record(s, 0, { round: r, cat: c, value: truth[c] });
  post = AI.posterior(s, 0);
  assert.strictEqual(post.indexOf(Math.max(...post)), s.perp);
  assert.ok(post[s.perp] > 0.9);
  assert.ok(Math.abs(post.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // The same report seen twice (a shared interview passed on in a trade) counts once.
  const t = aiGame(); E.record(t, 0, { round: 3, cat: 0, value: 2, ev: 99 }); const once = AI.posterior(t, 0);
  E.record(t, 0, { round: 3, cat: 0, value: 2, ev: 99, hand: 2 });
  assert.deepStrictEqual(AI.posterior(t, 0), once);
  // Cleared suspects are ruled out.
  t.eliminated.push(5);
  assert.strictEqual(AI.posterior(t, 0)[5], 0);
});

test("an alibi at the crime hour clears a suspect; one eight hours before implicates", () => {
  const s = aiGame();
  for (let i = 0; i < 4; i++) E.record(s, 1, { cat: E.TIME_CAT, value: 22, round: 1 }); // lab says 10 PM
  const atCrime = AI.pGuilty(s, 1, 3, 22, null), sixBefore = AI.pGuilty(s, 1, 3, 14, null);
  assert.ok(atCrime < 1 / 49 / 2, String(atCrime));
  assert.ok(sixBefore > 1 / 49 && sixBefore > atCrime * 5, String(sixBefore));
  // Wrapping past midnight: a 3 AM lab reading fits a 7 PM sign-out.
  const t = aiGame();
  for (let i = 0; i < 4; i++) E.record(t, 1, { cat: E.TIME_CAT, value: 3, round: 1 });
  assert.ok(AI.pGuilty(t, 1, 3, 19, null) > 1 / 49);
});

test("decisions are legal for every personality", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = aiGame(seed);
    s.round = 1 + (seed % 8);
    for (let k = 0; k < 10; k++) E.record(s, seed % 4, { cat: k % 4, value: E.randInt(s, k % 4 === 3 ? 24 : 7), round: 1 + (k % s.round) });
    s.players.forEach((p, pi) => {
      assert.ok([1, 2, 3, 4, 6].includes(AI.chooseDestination(s, pi)));
      const c = AI.prosecutorChoice(s, pi);
      if (c.kind === "name") assert.ok(c.suspect >= 0 && c.suspect < 49 && !s.eliminated.includes(c.suspect));
      else assert.ok(c.cat >= 0 && c.cat < 3 && !s.pressReleases[c.cat]);
      const h = AI.hunch(s, pi, 6);
      assert.ok(h !== null, "the last hunch is always taken");
      assert.ok([1, 2, 3].includes(AI.lunchJoin(s, pi)));
      const target = AI.peekTarget(s, pi);
      assert.ok(target !== pi && target >= 0 && target < 4);
      const time = AI.claimTime(s, [pi]);
      assert.ok(time >= 0 && time < 24);
    });
  }
});

test("AI trades are truthful and are not repeated", () => {
  const s = aiGame();
  E.record(s, 3, { cat: 0, value: 4, round: 2 }); E.record(s, 3, { cat: 1, value: 1, round: 3 });
  E.record(s, 1, { cat: 2, value: 6, round: 1 });
  const sw = AI.swap(s, 3, 1); // Dot gives 3, Iris gives 2: they swap the smaller number
  assert.strictEqual(sw.fromA.length, 1);
  assert.strictEqual(sw.fromB.length, 1);
  const got = s.notebooks[1].filter(e => e.hand === 2)[0];
  assert.ok(s.notebooks[3].some(e => e.ev === got.ev && e.value === got.value && e.round === got.round));
  // Dot already shared her best note with Iris, so next time she offers a different one.
  const next = AI.chooseGive(s, 3, 1, 3);
  assert.ok(next.every(e => e.ev !== got.ev));
});

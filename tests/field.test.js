// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const D = require("../assets/js/data.js");
const E = require("../assets/js/engine.js");
const F = require("../assets/js/field.js");

const INFO = { seed: 31337, players: 4, ramp: { start: 0.2, step: 0.1 }, assist: false };
function phone(badge, seat) { return F.newCase(F.parseCase(F.caseCode(INFO)), { name: "D" + seat, seat, badge }); }

test("case numbers round-trip their settings and reject typos", () => {
  for (const ramp of [{ start: 0.2, step: 0.1 }, { start: 0.5, step: -0.05 }, { start: 0.9, step: -0.15 }]) {
    for (const players of [3, 6]) {
      const info = { seed: 0xfffff, players, ramp, assist: true };
      const back = F.parseCase(F.caseCode(info));
      assert.deepStrictEqual([back.seed, back.players, back.ramp, back.assist], [info.seed, players, ramp, true]);
    }
  }
  const code = F.caseCode(INFO);
  assert.ok(F.parseCase(code.toLowerCase().replace("-", " ")), "forgiving about case and spacing");
  let caught = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "-") continue;
    const swapped = code.slice(0, i) + (code[i] === "7" ? "8" : "7") + code.slice(i + 1);
    if (!F.parseCase(swapped)) caught++;
  }
  assert.strictEqual(caught, 8, "every single-character typo is caught");
});

test("every phone on a case builds the same case and hears the same witnesses", () => {
  const a = phone(111, 1), b = phone(222, 2);
  assert.deepStrictEqual([a.perp, a.crimeTime, a.alibis], [b.perp, b.crimeTime, b.alibis]);
  for (let r = 1; r <= 5; r++) for (let n = 1; n <= 4; n++) {
    assert.deepStrictEqual(F.sample(a, r, 2, n), F.sample(b, r, 2, n));
  }
  // A Strong-arm extra belongs to one badge.
  assert.notStrictEqual(F.sample(a, 3, 1, 1, 111).ev, F.sample(a, 3, 1, 1, 222).ev);
});

test("shared reports keep the witness reliability of their round", () => {
  const a = phone(111, 1), truth = D.SUSPECTS[a.perp][0];
  for (const round of [1, 5]) {
    let right = 0, N = 0;
    for (let t = 1; t <= 4; t++) for (let k = 0; k < 2000; k++) {
      a.seed = k * 7919 + t; // vary the key stream; perp is unchanged
      if (F.sample(a, round, t, 1).value === truth) right++;
      N++;
    }
    assert.ok(Math.abs(right / N - E.reliability(a, round)) < 0.02, `round ${round}: ${right / N}`);
  }
});

test("tip codes look up the report and reject forgeries and future turns", () => {
  const a = phone(111, 1), b = phone(222, 2);
  a.round = b.round = 4; a.turn = b.turn = 3;
  const rep = F.sample(a, 2, 4, 3), extra = F.sample(a, 3, 1, 4, 111);
  assert.strictEqual(rep.code.length, 4);
  assert.deepStrictEqual(F.readTip(b, rep.code).report, rep);
  assert.deepStrictEqual(F.readTip(b, extra.code).report, extra);
  assert.ok(F.readTip(b, F.tipCode(a, { round: 4, turn: 4, n: 1 })).error, "a turn that hasn't happened");
  let accepted = 0;
  for (let i = 0; i < 4000; i++) {
    const c = Array.from({ length: 4 }, (_, k) => F.ALPHA[(i * 7 + k * 13 + (i >> 3)) % 32]).join("");
    if (F.readTip(b, c).report) accepted++;
  }
  assert.ok(accepted < 8, `random codes accepted: ${accepted}`);
});

test("a saved field game never contains the answer, and restores it on load", () => {
  const a = phone(111, 1);
  const saved = JSON.parse(JSON.stringify(F.strip(a)));
  for (const k of ["perp", "crimeTime", "alibis"]) assert.ok(!(k in saved), k);
  const back = F.restore(saved);
  assert.deepStrictEqual([back.perp, back.crimeTime, back.alibis], [a.perp, a.crimeTime, a.alibis]);
});

test("field trials score one detective; shared prosecutions split; seals match across phones", () => {
  const a = phone(111, 1), b = phone(222, 2);
  const wrong = (a.perp + 1) % D.SUSPECTS.length;
  assert.strictEqual(F.trial(a, wrong, "prosecutor", { shared: 2 }).points[0], -5);
  assert.strictEqual(F.trial(b, wrong, "juror", { vote: false }).points[0], 4);
  assert.strictEqual(F.seal(a), F.seal(b));
  assert.strictEqual(E.finalScores(a).rows[0].prosecution, -5);
  F.trial(b, (a.perp + 2) % D.SUSPECTS.length, "juror", { vote: true });
  assert.notStrictEqual(F.seal(a), F.seal(b), "a trial only one phone saw changes its seal");
  assert.strictEqual(E.turnsPerRound(a), D.TURNS_PER_ROUND[4]);
});

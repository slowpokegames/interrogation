/*
 * Interrogation — rules engine.
 * Pure game logic: randomness, evidence, notebooks and scoring. All randomness
 * comes from a seeded generator stored in the game state, so a saved game
 * resumes exactly where it left off.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.Engine = factory(root.GameData);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  var TIME_CAT = 3; // notebook category index used for crime lab times

  // ---------- randomness ----------

  // mulberry32: small, fast, and its whole state is one 32-bit integer.
  function random(state) {
    var t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, n) { return Math.floor(random(state) * n); }
  function d6(state) { return randInt(state, 6) + 1; }
  // Hours wrap around the clock, past midnight into the next day.
  function modDay(n) { return ((n % D.HOURS) + D.HOURS) % D.HOURS; }

  function shuffle(state, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(state, i + 1), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildDeck(state, counts) {
    var deck = [];
    Object.keys(counts).forEach(function (k) { for (var i = 0; i < counts[k]; i++) deck.push(k); });
    return shuffle(state, deck);
  }

  // ---------- setup ----------

  function newGame(names, options, seed) {
    var state = {
      version: 2,
      seed: seed >>> 0,
      rng: seed >>> 0,
      // players: [{ name, ai }] where ai is a personality key or null for a person at the table.
      players: names.map(function (n) { return typeof n === "string" ? { name: n, ai: null } : { name: n.name, ai: n.ai || null }; }),
      options: Object.assign({ pickMode: "phone", assist: false }, options || {}),
      round: 1,
      turn: 1,
      lead: 0,
      log: [],
      notebooks: names.map(function () { return []; }),
      hands: names.map(function () { return []; }),
      hunches: names.map(function () { return { carry: 0, made: {} }; }),
      pressReleases: {},
      trials: [],
      eliminated: [],
      over: false,
      nextEv: 1
    };
    state.alibis = [];
    for (var i = 0; i < D.SUSPECTS.length; i++) state.alibis.push(randInt(state, D.HOURS));
    state.perp = randInt(state, D.SUSPECTS.length);
    // An alibi is the hour the gate log shows a suspect leaving the lot. The killer slipped
    // back in 3d6 − 2 hours later: 1 to 16, most often 8 or 9.
    state.crimeTime = modDay(state.alibis[state.perp] + d6(state) + d6(state) + d6(state) - 2);
    state.actionDeck = buildDeck(state, D.ACTION_DECK);
    state.donutDeck = buildDeck(state, D.DONUT_DECK);
    return state;
  }

  // Chance the killer struck exactly g hours after signing out (3d6 − 2). Zero outside 1–16,
  // so an alibi rules out the sign-out hour and the 7 hours before it.
  var GAP = (function () {
    var p = [];
    for (var g = 0; g < 24; g++) p.push(0);
    for (var a = 1; a <= 6; a++) for (var b = 1; b <= 6; b++) for (var c = 1; c <= 6; c++) p[a + b + c - 2] += 1 / 216;
    return p;
  })();
  function gapChance(g) { return GAP[modDay(g)]; }

  function turnsPerRound(state) { return D.TURNS_PER_ROUND[state.players.length] || 3; }

  // ---------- evidence ----------

  // Chance an interrogation gives the true attribute: 20% in round 1, +10% per round.
  function correctChance(round) { return Math.min(1, (round + 1) / 10); }

  // One interrogation result. When wrong, any of the six wrong values is equally likely.
  function drawAttribute(state, cat) {
    var truth = D.SUSPECTS[state.perp][cat];
    if (random(state) < correctChance(state.round)) return truth;
    var v = randInt(state, 6);
    return v >= truth ? v + 1 : v;
  }

  // Crime lab: the true hour shifted by 2d6 − 7 hours (16.7% exact, 44% within an hour).
  function drawLab(state) { return modDay(state.crimeTime + d6(state) + d6(state) - 7); }

  function alibiOf(state, suspect) { return state.alibis[suspect]; }

  // ---------- notebooks ----------

  // entry: { round, cat (0-2 attribute, 3 time), value, hand (1 first, 2 second), src, ev }.
  // ev identifies one piece of evidence, so copies of the same report can be recognized.
  function newEv(state) { return state.nextEv++; }
  function record(state, pi, entry) {
    var e = Object.assign({ round: state.round, hand: 1 }, entry);
    if (e.ev == null) e.ev = newEv(state);
    state.notebooks[pi].push(e);
    return e;
  }

  // The data-sheet rule: each mark is worth its round number. Lab times are not weighted
  // because the crime lab's accuracy never changes.
  function weightedTotals(state, pi) {
    var t = [0, 1, 2].map(function () { return [0, 0, 0, 0, 0, 0, 0]; });
    var times = [];
    for (var h = 0; h < D.HOURS; h++) times.push(0);
    state.notebooks[pi].forEach(function (e) {
      if (e.cat === TIME_CAT) times[e.value] += 1;
      else t[e.cat][e.value] += e.round;
    });
    return { attrs: t, times: times };
  }

  function suspectScores(state, pi) {
    var w = weightedTotals(state, pi).attrs;
    return D.SUSPECTS.map(function (s, i) {
      return { suspect: i, score: w[0][s[0]] + w[1][s[1]] + w[2][s[2]],
               eliminated: state.eliminated.indexOf(i) >= 0 };
    });
  }

  function evidenceCount(state, pi) { return state.notebooks[pi].length; }

  // Steal a Peek: two of the target's first-hand entries from last round
  // (in round 1, from this round so far). Recorded as second-hand for the thief.
  function stealPeek(state, thief, target) {
    var from = Math.max(1, state.round - 1);
    var pool = state.notebooks[target].filter(function (e) { return e.hand === 1 && e.round === from; });
    shuffle(state, pool);
    return pool.slice(0, 2).map(function (e) {
      return record(state, thief, { round: e.round, cat: e.cat, value: e.value, hand: 2, ev: e.ev,
                                    src: state.players[target].name });
    });
  }

  // ---------- cards ----------

  function drawCard(state, pi, deckName) {
    var deck = state[deckName];
    if (!deck.length) return null;
    var card = deck.pop();
    if (D.CARDS[card].when !== "draw") state.hands[pi].push(card);
    return card;
  }

  function discard(state, pi, card) {
    var i = state.hands[pi].indexOf(card);
    if (i >= 0) state.hands[pi].splice(i, 1);
  }

  // ---------- hunches ----------

  function hunchRounds() { return Object.keys(D.SCORING.hunchBase).map(Number); }

  // Worth after round r: base points plus anything carried from passed hunches.
  function hunchValue(state, pi, afterRound) {
    return (D.SCORING.hunchBase[afterRound] || 0) + state.hunches[pi].carry;
  }

  // suspect === null means pass: half the stake carries to the next hunch.
  function makeHunch(state, pi, afterRound, suspect) {
    var h = state.hunches[pi], value = hunchValue(state, pi, afterRound);
    h.made[afterRound] = { suspect: suspect, value: value };
    h.carry = suspect === null ? value / 2 : 0;
  }

  // ---------- press releases ----------

  // subs: [{ pi, cat, value }]. Same claim → joint release. Conflicting values in a
  // category → no release there. Each category can be released only once per game.
  function resolvePressReleases(state, subs) {
    var byCat = {};
    subs.forEach(function (s) { (byCat[s.cat] = byCat[s.cat] || []).push(s); });
    var made = [], blocked = [];
    Object.keys(byCat).forEach(function (c) {
      var list = byCat[c], cat = Number(c);
      if (state.pressReleases[cat]) { blocked.push({ cat: cat, by: list.map(pis), reason: "taken" }); return; }
      var same = list.every(function (s) { return s.value === list[0].value; });
      if (!same) { blocked.push({ cat: cat, by: list.map(pis), reason: "conflict" }); return; }
      var rel = { cat: cat, value: list[0].value, by: list.map(pis), round: state.round };
      state.pressReleases[cat] = rel;
      made.push(rel);
    });
    return { made: made, blocked: blocked };
  }
  function pis(s) { return s.pi; }

  // ---------- trials ----------

  // namings: [{ pi, suspect }] → one trial per distinct suspect, joint when they agree.
  function groupProsecutions(namings) {
    var groups = [];
    namings.forEach(function (n) {
      var g = groups.filter(function (x) { return x.suspect === n.suspect; })[0];
      if (g) g.prosecutors.push(n.pi);
      else groups.push({ suspect: n.suspect, prosecutors: [n.pi] });
    });
    return groups;
  }

  function awayFromZero(x) { return x < 0 ? -Math.ceil(-x) : Math.ceil(x); }

  // votes: { pi: true (guilty) | false (not guilty) } from the non-prosecutors.
  function runTrial(state, suspect, prosecutors, votes, claimedTime) {
    var S = D.SCORING, guilty = suspect === state.perp;
    var guiltyVotes = Object.keys(votes).filter(function (k) { return votes[k]; }).length;
    var points = {};
    prosecutors.forEach(function (pi) {
      var base = guilty ? S.prosecution.guilty : S.prosecution.innocent;
      points[pi] = awayFromZero(base / prosecutors.length) + guiltyVotes * S.prosecution.perGuiltyVote;
    });
    Object.keys(votes).forEach(function (pi) {
      var v = votes[pi];
      points[pi] = guilty ? (v ? S.vote.guiltyIfGuilty : S.vote.notGuiltyIfGuilty)
                          : (v ? S.vote.guiltyIfInnocent : S.vote.notGuiltyIfInnocent);
    });
    var trial = { round: state.round, turn: state.turn, suspect: suspect, prosecutors: prosecutors.slice(),
                  votes: votes, guilty: guilty, points: points, alibi: state.alibis[suspect],
                  claimedTime: claimedTime == null ? null : claimedTime };
    state.trials.push(trial);
    if (guilty) state.over = true;
    else if (state.eliminated.indexOf(suspect) < 0) state.eliminated.push(suspect);
    return trial;
  }

  // ---------- rounds ----------

  // Advance one turn. Returns the round that just ended, or 0 mid-round.
  function endTurn(state) {
    if (state.turn < turnsPerRound(state)) { state.turn += 1; return 0; }
    var ended = state.round;
    state.round += 1;
    state.turn = 1;
    state.lead = (state.lead + 1) % state.players.length;
    return ended;
  }

  // ---------- final scoring ----------

  function finalScores(state) {
    var S = D.SCORING;
    var rows = state.players.map(function (p, pi) {
      var hunch = 0;
      Object.keys(state.hunches[pi].made).forEach(function (r) {
        var h = state.hunches[pi].made[r];
        if (h.suspect === state.perp) hunch += h.value;
      });
      var press = 0;
      Object.keys(state.pressReleases).forEach(function (c) {
        var rel = state.pressReleases[c];
        if (rel.by.indexOf(pi) >= 0)
          press += rel.value === D.SUSPECTS[state.perp][rel.cat] ? S.pressRelease.right : S.pressRelease.wrong;
      });
      var prosecution = 0, votes = 0;
      state.trials.forEach(function (t) {
        if (t.points[pi] == null) return;
        if (t.prosecutors.indexOf(pi) >= 0) prosecution += t.points[pi];
        else votes += t.points[pi];
      });
      var compliment = state.hands[pi].filter(function (c) { return c === "compliment"; }).length * S.compliment;
      return { pi: pi, name: p.name, hunch: hunch, press: press, prosecution: prosecution, votes: votes,
               compliment: compliment, total: hunch + press + prosecution + votes + compliment,
               evidence: evidenceCount(state, pi) };
    });
    // Ties go to the detective with the most evidence (first and second hand).
    var ranked = rows.slice().sort(function (a, b) { return b.total - a.total || b.evidence - a.evidence; });
    return { rows: rows, ranked: ranked };
  }

  return {
    TIME_CAT: TIME_CAT, random: random, randInt: randInt, d6: d6, modDay: modDay, shuffle: shuffle,
    newGame: newGame, gapChance: gapChance, turnsPerRound: turnsPerRound, correctChance: correctChance,
    drawAttribute: drawAttribute, drawLab: drawLab, alibiOf: alibiOf,
    record: record, newEv: newEv, weightedTotals: weightedTotals, suspectScores: suspectScores,
    evidenceCount: evidenceCount, stealPeek: stealPeek, drawCard: drawCard, discard: discard,
    hunchRounds: hunchRounds, hunchValue: hunchValue, makeHunch: makeHunch,
    resolvePressReleases: resolvePressReleases, groupProsecutions: groupProsecutions,
    awayFromZero: awayFromZero, runTrial: runTrial, endTurn: endTurn, finalScores: finalScores
  };
});

/*
 * Interrogation — AI detectives.
 * Each AI reasons only from what a real player at the table would know: its own
 * notebook, its own hand, and public information (press releases, cleared
 * suspects, trials). It never looks at the killer, the crime time or anyone
 * else's notes. Personalities change how sure it needs to be before acting,
 * where it likes to go, and how it trades.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./engine.js"));
  else root.AI = factory(root.GameData, root.Engine);
})(typeof self !== "undefined" ? self : this, function (D, E) {
  "use strict";

  // nameAt / pressAt / hunchAt / guiltyAt: how sure the detective must be to act.
  // give: pieces of evidence offered per trade; share: which ones ("best", "worst", "random").
  // social: chance of calling the Donut Shop; cardLove: taste for action cards;
  // noise: how erratic location choices are; trust: how often a rival's press release is believed to be right (about 1 in 3 really are);
  // crowd: how much being charged at all makes a defendant look guilty.
  var PERSONALITIES = {
    hothead: {
      name: "Vic Malone", alt: "Rocco Brandt", title: "The Hothead", pronoun: "he",
      blurb: "Kicks the door in first and checks the address later. He prosecutes early, votes Guilty easily and hates sitting still.",
      nameAt: 0.32, pressAt: 0.34, hunchAt: 0.22, guiltyAt: 0.31,
      give: 1, share: "random", social: 0.1, cardLove: 0.5, sirens: true, noise: 0.35, trust: 0.4, crowd: 2.2,
      lines: {
        name: "{n} slams the file on the desk: “I don't need a lab report to know a killer when I see one.”",
        trade: "{n} drums his fingers: “Make it quick. I've got doors to kick.”"
      }
    },
    professor: {
      name: "Iris Kemp", alt: "Ada Whitfield", title: "The Professor", pronoun: "she",
      blurb: "Runs the numbers twice before she moves. Patient, accurate and stingy with her best notes. The toughest opponent.",
      nameAt: 0.62, pressAt: 0.46, hunchAt: 0.4, guiltyAt: 0.44,
      give: 2, share: "worst", social: 0.25, cardLove: 0.3, sirens: false, noise: 0.08, trust: 0.3, crowd: 1.2,
      lines: {
        name: "{n} adjusts her glasses: “The evidence is consistent with exactly one person, your honor.”",
        trade: "{n} opens a color-coded binder: “Shall we exchange data? Fair is fair.”"
      }
    },
    glory: {
      name: "Sal Romano", alt: "Chet Lawson", title: "The Glory Hound", pronoun: "he",
      blurb: "Lives for the front page. He rushes out press releases, loves Speed with Sirens and follows the crowd on the jury.",
      nameAt: 0.5, pressAt: 0.3, hunchAt: 0.3, guiltyAt: 0.39, pressBonus: 0.8,
      give: 1, share: "random", social: 0.15, cardLove: 0.6, sirens: true, noise: 0.2, trust: 0.45, crowd: 1.7,
      lines: {
        name: "{n} straightens his tie for the cameras: “Get my good side, boys. I'm about to close this case.”",
        trade: "{n} winks: “I'll tell you mine if you tell me yours. Off the record.”"
      }
    },
    donut: {
      name: "Dot Kowalski", alt: "Bea Pruitt", title: "The Donut Lover", pronoun: "she",
      blurb: "Never met a box of crullers she didn't share. She trades often and generously, and her tips are usually her best.",
      nameAt: 0.55, pressAt: 0.4, hunchAt: 0.35, guiltyAt: 0.44,
      give: 3, share: "best", social: 0.55, cardLove: 0.4, sirens: false, noise: 0.25, trust: 0.35, crowd: 1.4,
      lines: {
        name: "{n} brushes powdered sugar off the case file: “Hon, I'm pretty sure it's this one.”",
        trade: "{n} slides the box across: “Grab a cruller. Now, what've you got?”"
      }
    }
  };
  var ORDER = ["hothead", "professor", "glory", "donut"];

  function pers(state, pi) { return PERSONALITIES[state.players[pi].ai]; }
  function isAI(state, pi) { return !!state.players[pi].ai; }
  function rand(state) { return E.random(state); }
  function gumbel(state) { return -Math.log(-Math.log(Math.max(1e-9, rand(state)))); }

  // ---------- beliefs ----------

  function unique(entries) {
    var seen = {};
    return entries.filter(function (e) {
      if (e.ev == null) return true;
      if (seen[e.ev]) return false;
      seen[e.ev] = true;
      return true;
    });
  }

  // Probability each suspect is the killer, given this detective's notes and public information.
  function posterior(state, pi) {
    var P = pers(state, pi) || PERSONALITIES.professor;
    var lw = D.SUSPECTS.map(function (s, i) { return state.eliminated.indexOf(i) >= 0 ? -Infinity : 0; });
    function evidence(cat, value, p) {
      var hit = Math.log(p), miss = Math.log((1 - p) / 6);
      D.SUSPECTS.forEach(function (s, i) { lw[i] += s[cat] === value ? hit : miss; });
    }
    unique(state.notebooks[pi]).forEach(function (e) {
      if (e.cat < 3) evidence(e.cat, e.value, Math.min(0.985, E.correctChance(e.round)));
    });
    // Rivals' press releases count as evidence, once per attribute value (copies add nothing new).
    var heard = {};
    state.pressReleases.forEach(function (r) {
      var key = r.cat + ":" + r.value;
      if (r.by.indexOf(pi) >= 0 || heard[key]) return;
      heard[key] = true;
      evidence(r.cat, r.value, P.trust);
    });
    var max = Math.max.apply(null, lw);
    if (max === -Infinity) return lw.map(function () { return 1 / lw.length; });
    var w = lw.map(function (x) { return Math.exp(x - max); });
    var sum = w.reduce(function (a, b) { return a + b; }, 0);
    return w.map(function (x) { return x / sum; });
  }

  function marginals(post) {
    var m = [0, 1, 2].map(function () { return [0, 0, 0, 0, 0, 0, 0]; });
    post.forEach(function (p, i) { for (var c = 0; c < 3; c++) m[c][D.SUSPECTS[i][c]] += p; });
    return m;
  }

  function best(arr) {
    var k = 0;
    for (var i = 1; i < arr.length; i++) if (arr[i] > arr[k]) k = i;
    return k;
  }

  function entropy(dist) {
    return dist.reduce(function (h, p) { return p > 0 ? h - p * Math.log(p) : h; }, 0);
  }

  // Crime lab error: 2d6 − 7 hours. Alibi gap: 3d6 − 2 hours (see Engine.gapChance).
  function labWeight(off) {
    off = E.modDay(off);
    if (off > D.HOURS / 2) off -= D.HOURS;
    return Math.abs(off) > 5 ? 0 : (6 - Math.abs(off)) / 36;
  }
  function gapWeight(g) { return E.gapChance(g); }

  function labReadings(state, pi) {
    return unique(state.notebooks[pi]).filter(function (e) { return e.cat === E.TIME_CAT; }).map(function (e) { return e.value; });
  }

  // Probability of each crime hour, given lab readings.
  function timePosterior(readings) {
    var p = [];
    for (var c = 0; c < D.HOURS; c++) {
      var w = 1;
      readings.forEach(function (r) { w *= labWeight(r - c); });
      p.push(w);
    }
    var sum = p.reduce(function (a, b) { return a + b; }, 0);
    return sum > 0 ? p.map(function (x) { return x / sum; }) : p.map(function () { return 1 / D.HOURS; });
  }

  // How likely the defendant is guilty once the alibi is known.
  function pGuilty(state, pi, suspect, alibi, claimed) {
    var P = pers(state, pi), prior = posterior(state, pi)[suspect];
    var readings = labReadings(state, pi);
    if (claimed != null) readings.push(claimed);
    var tp = timePosterior(readings), lik = 0;
    for (var c = 0; c < D.HOURS; c++) lik += tp[c] * gapWeight(c - alibi);
    var ratio = lik * D.HOURS * P.crowd;
    prior = Math.min(prior, 0.999);
    var odds = prior / (1 - prior) * ratio;
    return odds / (1 + odds);
  }

  // ---------- decisions ----------

  function openCategories(state, pi) { return [0, 1, 2].filter(function (c) { return E.canRelease(state, pi, c); }); }

  function topSuspect(state, pi) {
    var post = posterior(state, pi), i = best(post);
    return { suspect: i, p: post[i], post: post };
  }

  function bestPress(state, pi, post) {
    var m = marginals(post), out = null;
    openCategories(state, pi).forEach(function (c) {
      var v = best(m[c]);
      if (!out || m[c][v] > out.p) out = { cat: c, value: v, p: m[c][v] };
    });
    return out;
  }

  // What to do at the Prosecutor's Office.
  function prosecutorChoice(state, pi) {
    var P = pers(state, pi), top = topSuspect(state, pi), press = bestPress(state, pi, top.post);
    if (top.p >= P.nameAt || !press) return { kind: "name", suspect: top.suspect };
    if (press.p >= P.pressAt) return { kind: "press", cat: press.cat, value: press.value };
    // Nothing clears the bar: take whichever has the better expected payoff.
    var P2 = D.SCORING;
    var evPress = (P2.pressRelease.right - P2.pressRelease.wrong) * press.p + P2.pressRelease.wrong;
    var evName = (P2.prosecution.guilty - P2.prosecution.innocent) * top.p + P2.prosecution.innocent;
    return evName > evPress ? { kind: "name", suspect: top.suspect } : { kind: "press", cat: press.cat, value: press.value };
  }

  // Where to go this turn: 1, 2, 3, 4 or 6 (the Donut Shop is only ever called openly).
  function chooseDestination(state, pi) {
    var P = pers(state, pi), top = topSuspect(state, pi), m = marginals(top.post);
    var reliability = E.correctChance(state.round), score = {};
    for (var c = 0; c < 3; c++) score[c + 1] = entropy(m[c]) / Math.log(7) * (0.4 + reliability);
    var labs = labReadings(state, pi).length;
    score[4] = 0.3 * (labs < 2 ? 1 : 0.35) + (state.actionDeck.length ? 0.3 * P.cardLove : 0);
    score[6] = -Infinity;
    var press = bestPress(state, pi, top.post);
    if (top.p >= P.nameAt) score[6] = 1.6 + top.p;
    else if (press && press.p >= P.pressAt) score[6] = 0.9 + press.p + 0.3 * (P.pressBonus || 0);
    var pick = 1, bestScore = -Infinity;
    [1, 2, 3, 4, 6].forEach(function (n) {
      var s = score[n] + P.noise * gumbel(state);
      if (s > bestScore) { bestScore = s; pick = n; }
    });
    return pick;
  }

  function wantsDonuts(state, pi) {
    if (state.notebooks[pi].length < 2) return false;
    return rand(state) < pers(state, pi).social;
  }

  // One turn card to play now, or null.
  function cardToPlay(state, pi, dest, crowd) {
    var P = pers(state, pi), hand = state.hands[pi];
    var info = dest >= 1 && dest <= 4;
    if (info && hand.indexOf("strongarm") >= 0) return "strongarm";
    if (info && crowd > 1 && hand.indexOf("sirens") >= 0 && (P.sirens || rand(state) < 0.3)) return "sirens";
    if (dest !== 5 && crowd > 1 && hand.indexOf("donuts") >= 0 && rand(state) < P.social + 0.3) return "donuts";
    return null;
  }

  function policeChoice(state, pi) {
    var P = pers(state, pi);
    if (!state.actionDeck.length) return "lab";
    var labs = labReadings(state, pi).length;
    return rand(state) < (labs < 1 ? P.cardLove * 0.5 : P.cardLove) ? "draw" : "lab";
  }

  // Steal a Peek: whoever was out gathering evidence last round (public knowledge).
  function peekTarget(state, pi) {
    var from = Math.max(1, state.round - 1), pick = null, most = -1;
    state.players.forEach(function (p, k) {
      if (k === pi) return;
      var n = state.notebooks[k].filter(function (e) { return e.hand === 1 && e.round === from; }).length + rand(state) * 0.5;
      if (n > most) { most = n; pick = k; }
    });
    return pick;
  }

  // Work During Lunch: the interview with the most to teach.
  function lunchJoin(state, pi) {
    var m = marginals(posterior(state, pi));
    var h = [0, 1, 2].map(function (c) { return entropy(m[c]); });
    return best(h) + 1;
  }

  function claimTime(state, prosecutors) {
    var readings = [];
    prosecutors.forEach(function (pi) { readings = readings.concat(labReadings(state, pi)); });
    if (!readings.length) return E.randInt(state, D.HOURS);
    return best(timePosterior(readings));
  }

  function vote(state, pi, suspect, alibi, claimed) {
    return pGuilty(state, pi, suspect, alibi, claimed) >= pers(state, pi).guiltyAt;
  }

  // A suspect, or null to pass. The last hunch of the game is always taken.
  function hunch(state, pi, afterRound) {
    var top = topSuspect(state, pi), rounds = E.hunchRounds();
    if (afterRound === rounds[rounds.length - 1]) return top.suspect;
    return top.p >= pers(state, pi).hunchAt ? top.suspect : null;
  }

  // ---------- trading ----------
  // No bluffing: an AI only ever hands over real entries from its notebook.

  function gaveList(state, pi, partner) {
    var p = state.players[pi];
    p.gave = p.gave || {};
    return (p.gave[partner] = p.gave[partner] || []);
  }

  function chooseGive(state, pi, partner, k) {
    var P = pers(state, pi), gave = gaveList(state, pi, partner);
    var pool = unique(state.notebooks[pi]).filter(function (e) { return gave.indexOf(e.ev) < 0; });
    if (P.share === "best") pool.sort(function (a, b) { return b.round - a.round || a.hand - b.hand; });
    else if (P.share === "worst") pool.sort(function (a, b) { return a.round - b.round || b.hand - a.hand; });
    else E.shuffle(state, pool);
    return pool.slice(0, k == null ? P.give : k).map(function (e) {
      return { round: e.round, cat: e.cat, value: e.value, ev: e.ev };
    });
  }

  // Remember what was handed over, so it isn't offered to the same detective again.
  function markGiven(state, pi, partner, entries) {
    var gave = gaveList(state, pi, partner);
    entries.forEach(function (e) { gave.push(e.ev); });
  }

  // Record evidence handed to an AI, and remember not to hand it back.
  function receive(state, pi, entries, from) {
    var gave = gaveList(state, pi, from);
    entries.forEach(function (e) {
      E.record(state, pi, { round: e.round, cat: e.cat, value: e.value, ev: e.ev, hand: 2, src: state.players[from].name });
      gave.push(e.ev);
    });
  }

  // Two AIs swap notes one for one: as many as the stingier one will give, and both have.
  function swap(state, a, b) {
    var k = Math.min(pers(state, a).give, pers(state, b).give);
    var fromA = chooseGive(state, a, b, k), fromB = chooseGive(state, b, a, k);
    k = Math.min(fromA.length, fromB.length);
    fromA = fromA.slice(0, k); fromB = fromB.slice(0, k);
    markGiven(state, a, b, fromA);
    markGiven(state, b, a, fromB);
    receive(state, b, fromA, a);
    receive(state, a, fromB, b);
    return { fromA: fromA, fromB: fromB };
  }

  // What an AI prosecutor tells the court: its evidence for each of the defendant's attributes.
  function caseFor(state, pi, suspect) {
    return [0, 1, 2].map(function (c) {
      var v = D.SUSPECTS[suspect][c], count = 0, score = 0;
      unique(state.notebooks[pi]).forEach(function (e) {
        if (e.cat === c && e.value === v) { count++; score += e.round; }
      });
      return { cat: c, value: v, count: count, score: score };
    });
  }

  // A personality's flavor line, with the detective's first name filled in.
  function line(state, pi, key) {
    return pers(state, pi).lines[key].replace("{n}", state.players[pi].name.split(" ")[0]);
  }

  return {
    line: line,
    PERSONALITIES: PERSONALITIES, ORDER: ORDER, isAI: isAI,
    posterior: posterior, marginals: marginals, timePosterior: timePosterior, pGuilty: pGuilty,
    chooseDestination: chooseDestination, wantsDonuts: wantsDonuts, cardToPlay: cardToPlay,
    policeChoice: policeChoice, peekTarget: peekTarget, lunchJoin: lunchJoin,
    prosecutorChoice: prosecutorChoice, claimTime: claimTime, vote: vote, hunch: hunch,
    chooseGive: chooseGive, markGiven: markGiven, receive: receive, swap: swap, caseFor: caseFor
  };
});

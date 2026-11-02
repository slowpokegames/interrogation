/*
 * Interrogation — shared screen pieces.
 * HTML builders used by both the pass-around app (app.js) and the field kit,
 * where every detective plays on his or her own phone (field-app.js).
 * Anything that depends on the game takes the game state as its first argument.
 */
(function (root) {
  "use strict";

  var D = root.GameData, E = root.Engine, A = root.Art;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pct(p) { return Math.round(p * 100) + "%"; }
  function attrName(cat, v) { return esc(D.CATEGORIES[cat].values[v]); }
  function timeName(t) { return D.TIMES[t]; }
  function loc(n) { return D.LOCATIONS[n - 1]; }
  function btn(act, label, cls, arg) {
    return '<button class="btn ' + (cls || "") + '" data-act="' + act + '"' +
      (arg != null ? ' data-arg="' + esc(arg) + '"' : "") + ">" + label + "</button>";
  }

  var QUOTES = {
    1: "An extra leans in: “I'm telling you, the one acting funny was in…”",
    2: "A grip lowers his voice: “The struggle? It came from…”",
    3: "A starlet waves a cigarette holder: “Darling, the voice was…”",
    4: "The crime lab hands over a smudged report: “Hour of death, give or take a few…”"
  };

  function evidenceCard(state, n, cat, value, quote, round) {
    var big = cat === E.TIME_CAT ? A.clock(value) : A.attributeIcon(cat, value);
    var label = cat === E.TIME_CAT ? esc(timeName(value)) : attrName(cat, value);
    return '<div class="evidence pop">' +
      '<div class="ev-loc">' + A.locationIcon(n) + "<span>" + esc(loc(n).name) + "</span></div>" +
      '<p class="type ev-quote">' + quote + "</p>" +
      '<div class="ev-icon">' + big + "</div>" +
      '<div class="ev-value">' + label + "</div>" +
      '<p class="muted small">Recorded in your notebook. Reliability ' + (round && round !== state.round ? "in round " + round : "this round") + ": " +
      (cat === E.TIME_CAT ? "the lab is always a little off" : pct(E.reliability(state, round || state.round))) + ".</p></div>";
  }

  // The lineup, one row per voice.
  function suspectGrid(state, opts) {
    opts = opts || {};
    var V = D.CATEGORIES[2], html = "", row = -1;
    D.SUSPECTS.forEach(function (s, i) {
      if (s[2] !== row) {
        if (row >= 0) html += "</div></div>";
        row = s[2];
        html += '<div class="voice-row" style="--vc:' + V.colors[row] + '"><div class="voice-head"><span class="voice-ic">' + A.voiceIcon(row) + "</span>" + esc(V.values[row]) + '</div><div class="lineup">';
      }
      var cleared = state.eliminated.indexOf(i) >= 0;
      var cls = "suspect-card" + (cleared ? " cleared" : "") + (opts.selected === i ? " selected" : "");
      var dis = opts.act && cleared && !opts.allowCleared;
      html += (opts.act && !dis ? '<button class="' + cls + '" data-act="' + opts.act + '" data-arg="' + i + '">' : '<div class="' + cls + '">') +
        A.portrait(i, { number: true }) +
        (opts.scores ? '<div class="score-tag">' + opts.scores[i] + "</div>" : "") +
        (opts.act && !dis ? "</button>" : "</div>");
    });
    return html + "</div></div>";
  }

  function suspectHero(i, caption) {
    return '<div class="hero-suspect pop"><div class="hero-mug">' + A.portrait(i, { number: true }) + "</div>" +
      "<div><div class=\"kicker\">" + (caption || "Suspect No." + A.pad(i + 1)) + "</div>" +
      [0, 1, 2].map(function (c) {
        return '<div class="attr-line">' + '<span class="attr-ic">' + A.attributeIcon(c, D.SUSPECTS[i][c]) + "</span>" + attrName(c, D.SUSPECTS[i][c]) + "</div>";
      }).join("") + "</div></div>";
  }

  function clockPicker(act, selected) {
    var html = '<div class="clock-pick">';
    for (var t = 0; t < D.HOURS; t++)
      html += '<button class="time-btn' + (selected === t ? " selected" : "") + '" data-act="' + act + '" data-arg="' + t + '">' +
        '<span class="mini-clock">' + A.clock(t) + "</span>" + D.TIME_SHORT[t] + "</button>";
    return html + "</div>";
  }

  function locationChoices(act, exclude, selected) {
    return '<div class="loc-grid">' + D.LOCATIONS.filter(function (l) { return exclude.indexOf(l.n) < 0; }).map(function (l) {
      return '<button class="loc-btn' + (selected === l.n ? " selected" : "") + '" data-act="' + act + '" data-arg="' + l.n + '" style="--c:' + A.LOCATION_COLORS[l.n - 1] + '">' +
        '<span class="die">' + l.n + "</span>" + A.locationIcon(l.n) + "<b>" + esc(l.name) + "</b><small>" + esc(l.blurb) + "</small></button>";
    }).join("") + "</div>";
  }

  function cardArt(c) {
    var n = { donuts: 5, peek: 1, compliment: 4, strongarm: 3, sirens: 4, lunch: 1 }[c];
    return A.locationIcon(n);
  }
  function cardFace(c) {
    var C = D.CARDS[c];
    return '<div class="card-face card-' + c + '"><div class="card-title">' + esc(C.name) + "</div>" +
      '<div class="card-art">' + cardArt(c) + "</div><p>" + esc(C.text) + "</p></div>";
  }

  function entryLine(e) {
    var ic = e.cat === E.TIME_CAT ? A.clock(e.value) : A.attributeIcon(e.cat, e.value);
    var label = e.cat === E.TIME_CAT ? esc(timeName(e.value)) : attrName(e.cat, e.value);
    return '<div class="entry"><span class="attr-ic">' + ic + "</span><span>" + label + "</span>" +
      '<span class="spacer"></span><span class="chip">R' + e.round + (e.hand === 2 ? " · 2nd" : "") + "</span></div>";
  }

  // Witness reliability for each round 1-9 with its data-sheet weight. upto: dim rounds after it.
  function rampStrip(ramp, upto) {
    var st = { options: { ramp: ramp } }, cells = "";
    for (var r = 1; r <= 9; r++) {
      var p = E.reliability(st, r);
      cells += '<div class="ramp-cell' + (upto && r > upto ? " later" : "") + '"><span>R' + r + '</span><div class="ramp-bar"><i style="height:' + Math.round(p * 100) + '%"></i></div>' +
        "<b>" + Math.round(p * 100) + '%</b><small>×' + E.roundWeight(st, r) + "</small></div>";
    }
    return '<div class="ramp">' + cells + "</div>";
  }
  function rampSummary(ramp) {
    var st = { options: { ramp: ramp } }, a = E.reliability(st, 1), d = E.reliability(st, 4);
    var head = ramp.step > 0 ? "Witnesses get more reliable each round." : ramp.step < 0 ? "Witnesses forget as the case drags on." : "Witnesses never get any better.";
    var tail = ramp.step > 0 ? "Move too early and you'll be wrong. Wait too long and someone else takes the credit."
      : ramp.step < 0 ? "The best leads come early. Gather fast, and don't trust late reports much."
      : "Every report counts the same, so it all comes down to legwork.";
    return "<b>" + head + "</b> In round 1 they are right " + pct(a) + " of the time; by round 4, " + pct(d) + ". " + tail;
  }
  function rampName(ramp) {
    var p = D.RAMP_PRESETS.filter(function (x) { return x.start === ramp.start && x.step === ramp.step; })[0];
    if (p) return p.name;
    return pct(ramp.start) + (ramp.step ? (ramp.step > 0 ? " +" : " −") + pct(Math.abs(ramp.step)) + " a round" : " all game");
  }

  // Preset chips plus round-1 and per-round selects, for a setup screen.
  function rampPanel(r) {
    var presets = D.RAMP_PRESETS.map(function (p) {
      var on = p.start === r.start && p.step === r.step;
      return '<button class="chip-btn' + (on ? " selected" : "") + '" data-act="ramp" data-arg="' + p.key + '" title="' + esc(p.blurb) + '">' + esc(p.name) + "</button>";
    }).join("");
    var match = D.RAMP_PRESETS.filter(function (p) { return p.start === r.start && p.step === r.step; })[0];
    var starts = D.RAMP_STARTS.map(function (v) {
      return '<option value="' + v + '"' + (v === r.start ? " selected" : "") + ">" + pct(v) + "</option>";
    }).join("");
    var steps = D.RAMP_STEPS.map(function (v) {
      var label = v > 0 ? "+" + pct(v) + " a round" : v < 0 ? "−" + pct(-v) + " a round" : "No change";
      return '<option value="' + v + '"' + (v === r.step ? " selected" : "") + ">" + label + "</option>";
    }).join("");
    return '<div class="panel"><h3>Witness reliability</h3>' +
      '<p class="muted small">How often an interrogation is right, round by round. The standard game starts at 20% and climbs 10% a round.</p>' +
      '<div class="row chips">' + presets + "</div>" +
      '<div class="grid two ramp-pick"><label><span class="muted small">Round 1</span><select data-ramp="start">' + starts + "</select></label>" +
      '<label><span class="muted small">Then</span><select data-ramp="step">' + steps + "</select></label></div>" +
      rampStrip(r) + (match ? '<p class="muted small">' + esc(match.blurb) + "</p>" : "") +
      '<p class="muted small">Never below 15% (a blind guess is 14%) or above 100%. The ×weights are what each round\'s marks count for in the notebook.</p></div>';
  }

  // A detective's weighted tallies: one row per attribute, then the crime lab hours.
  function notebookGrid(state, pi) {
    var w = E.weightedTotals(state, pi), nb = state.notebooks[pi];
    var cats = [0, 1, 2].map(function (c) {
      var max = Math.max.apply(null, w.attrs[c]);
      var cells = D.CATEGORIES[c].values.map(function (v, k) {
        var first = 0, second = 0;
        nb.forEach(function (e) { if (e.cat === c && e.value === k) { if (e.hand === 1) first++; else second++; } });
        var score = w.attrs[c][k];
        return '<div class="nb-cell' + (score && score === max ? " top" : "") + '"><span class="attr-ic">' + A.attributeIcon(c, k) + "</span>" +
          '<span class="nb-name">' + esc(D.CATEGORIES[c].short[k]) + "</span>" +
          '<span class="nb-marks">' + (first ? first + "×" : "") + (second ? " +" + second + "′" : "") + "</span>" +
          '<span class="nb-score">' + score + "</span></div>";
      }).join("");
      return '<div class="nb-cat"><h3>' + esc(D.CATEGORIES[c].name) + '</h3><div class="nb-row">' + cells + "</div></div>";
    }).join("");
    var tmax = Math.max.apply(null, w.times);
    var times = '<div class="nb-cat"><h3>Crime lab</h3><div class="nb-row times">' + w.times.map(function (n, k) {
      return '<div class="nb-cell' + (n && n === tmax ? " top" : "") + '"><span class="attr-ic">' + A.clock(k) + '</span><span class="nb-name">' + D.TIME_SHORT[k] + '</span><span class="nb-score">' + (n || "") + "</span></div>";
    }).join("") + "</div></div>";
    var weights = E.isStandardRamp(state) ? '<div class="kicker">Each mark counts its round number. Highest totals are most likely.</div>'
      : '<div class="kicker">Each mark counts its round\'s weight. Highest totals are most likely.</div>' + rampStrip(state.options.ramp, state.round);
    return weights + cats + times;
  }

  // Detective assist: the top five suspects by weighted score.
  function assistPanel(state, pi) {
    var ranked = E.suspectScores(state, pi).filter(function (s) { return !s.eliminated; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
    return '<div class="panel"><div class="kicker">Detective assist: top suspects by weighted score</div><div class="assist">' +
      ranked.map(function (s) { return '<div class="assist-item">' + A.portrait(s.suspect, { number: true }) + "<b>" + s.score + "</b></div>"; }).join("") + "</div></div>";
  }

  // Notebook entries with repeats of the same report removed.
  function uniqueEntries(list) {
    var seen = {};
    return list.filter(function (e) {
      if (e.ev == null) return true;
      if (seen[e.ev]) return false;
      seen[e.ev] = true;
      return true;
    });
  }

  root.Views = {
    esc: esc, pct: pct, attrName: attrName, timeName: timeName, loc: loc, btn: btn, QUOTES: QUOTES,
    evidenceCard: evidenceCard, suspectGrid: suspectGrid, suspectHero: suspectHero, clockPicker: clockPicker,
    locationChoices: locationChoices, cardArt: cardArt, cardFace: cardFace, entryLine: entryLine,
    rampStrip: rampStrip, rampSummary: rampSummary, rampName: rampName, rampPanel: rampPanel,
    notebookGrid: notebookGrid, assistPanel: assistPanel, uniqueEntries: uniqueEntries
  };
})(typeof self !== "undefined" ? self : this);

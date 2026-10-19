/*
 * Interrogation — companion app.
 * One shared phone runs the game. Each turn is a queue of tasks: public screens
 * everyone can see, and private screens behind a "pass the phone" cover. The
 * whole game (including the queue) is saved after every step, so a reload
 * resumes exactly where play left off.
 */
(function () {
  "use strict";

  var D = window.GameData, E = window.Engine, A = window.Art, AI = window.AI;
  var SAVE_KEY = "interrogation.save.v2";
  var S = null;        // the saved game state
  var view = null;     // overlay: null | "lineup" | "log" | "menu" | "notebooks" | "confirm-new" | "confirm-end"
  var app = document.getElementById("app");
  var overlay = document.getElementById("overlay");

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function name(pi) { return esc(S.players[pi].name) + (S.players[pi].ai ? ' <span class="ai-tag">AI</span>' : ""); }
  function isAI(pi) { return !!S.players[pi].ai; }
  function humansIn(list) { return list.filter(function (pi) { return !isAI(pi); }); }
  function allHumans() { return humansIn(S.players.map(function (p, pi) { return pi; })); }
  function persOf(pi) { return AI.PERSONALITIES[S.players[pi].ai]; }
  // No people at the table: every AI screen is shown openly and the viewer taps through.
  function spectator() { return allHumans().length === 0; }
  function names(list) {
    var n = list.map(name);
    return n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " &amp; " + n[n.length - 1];
  }
  function attrName(cat, v) { return esc(D.CATEGORIES[cat].values[v]); }
  function timeName(t) { return D.TIMES[t]; }
  function loc(n) { return D.LOCATIONS[n - 1]; }
  function fromLead() {
    var out = [];
    for (var k = 0; k < S.players.length; k++) out.push((S.lead + k) % S.players.length);
    return out;
  }
  function log(msg) { S.log.push({ r: S.round, t: S.turn, m: msg }); }
  function btn(act, label, cls, arg) {
    return '<button class="btn ' + (cls || "") + '" data-act="' + act + '"' +
      (arg != null ? ' data-arg="' + esc(arg) + '"' : "") + ">" + label + "</button>";
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode: play on without saving */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  function newSeed() {
    if (window.crypto && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296);
  }

  // ---------- task queue ----------

  function cur() { return S.flow.tasks[0]; }
  function replaceCurrent(list) { S.flow.tasks.splice.apply(S.flow.tasks, [0, 1].concat(list)); }
  function insertNext(list) { S.flow.tasks.splice.apply(S.flow.tasks, [1, 0].concat(list)); }

  // Run task "enter" hooks until reaching a task that needs a screen.
  function settle() {
    var guard = 0;
    while (S.flow.tasks.length && guard++ < 500) {
      var t = cur(), h = H[t.t];
      if (!t.entered) {
        t.entered = true;
        if (h.enter && h.enter(t) === "skip") { S.flow.tasks.shift(); continue; }
      }
      if (cur() !== t) continue;
      if (!h.render) { S.flow.tasks.shift(); continue; }
      // A private screen meant only for AI detectives: they decide on their own.
      // When everyone is an AI, the decision is shown to the viewer instead of hidden.
      if (h.who && !humansIn(h.who(t)).length) {
        if (!t.autoDone) { t.autoDone = true; if (h.auto) h.auto(t); }
        if (spectator()) { t.open = true; break; }
        if (cur() === t) S.flow.tasks.shift();
        continue;
      }
      break;
    }
  }
  function done() { S.flow.tasks.shift(); settle(); }

  function newTurnFlow() {
    S.flow = { tasks: [{ t: "donut" }], dest: {}, played: [], results: {}, lunch: {}, pros: {}, trial: null, donutCalls: [] };
  }

  // Players at location n this turn, including anyone who joined over lunch.
  function present(n) {
    return S.players.map(function (p, pi) { return pi; }).filter(function (pi) {
      return S.flow.dest[pi] === n || S.flow.lunch[pi] === n;
    });
  }
  function playedAt(card, n) {
    return S.flow.played.filter(function (p) {
      return p.card === card && (S.flow.dest[p.pi] === n || S.flow.lunch[p.pi] === n);
    }).map(function (p) { return p.pi; });
  }

  // ---------- shared views ----------

  function evidenceCard(n, cat, value, quote) {
    var big = cat === E.TIME_CAT ? A.clock(value) : A.attributeIcon(cat, value);
    var label = cat === E.TIME_CAT ? esc(timeName(value)) : attrName(cat, value);
    return '<div class="evidence pop">' +
      '<div class="ev-loc">' + A.locationIcon(n) + "<span>" + esc(loc(n).name) + "</span></div>" +
      '<p class="type ev-quote">' + quote + "</p>" +
      '<div class="ev-icon">' + big + "</div>" +
      '<div class="ev-value">' + label + "</div>" +
      '<p class="muted small">Recorded in your notebook. Reliability this round: ' +
      (cat === E.TIME_CAT ? "the lab is always a little off" : Math.round(E.correctChance(S.round) * 100) + "%") + ".</p></div>";
  }

  var QUOTES = {
    1: "An extra leans in: “I'm telling you, the one acting funny was in…”",
    2: "A grip lowers his voice: “The struggle? It came from…”",
    3: "A starlet waves a cigarette holder: “Darling, the voice was…”",
    4: "The crime lab hands over a smudged report: “Hour of death, give or take a few…”"
  };

  // The lineup, one row per voice.
  function suspectGrid(opts) {
    opts = opts || {};
    var V = D.CATEGORIES[2], html = "", row = -1;
    D.SUSPECTS.forEach(function (s, i) {
      if (s[2] !== row) {
        if (row >= 0) html += "</div></div>";
        row = s[2];
        html += '<div class="voice-row" style="--vc:' + V.colors[row] + '"><div class="voice-head"><span class="voice-ic">' + A.voiceIcon(row) + "</span>" + esc(V.values[row]) + '</div><div class="lineup">';
      }
      var cleared = S.eliminated.indexOf(i) >= 0;
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

  // ---------- private-screen covers ----------

  function cover(t, audience) {
    var many = audience.length > 1;
    return '<section class="cover">' +
      '<div class="folder"><div class="stamp">Confidential</div>' +
      '<div class="kicker">' + (many ? "Eyes only" : "Pass the phone to") + "</div>" +
      '<h2 class="cover-name">' + names(audience) + "</h2>" +
      '<p class="muted">' + (many ? "Gather round, detectives. Everyone else, look away." : "Everyone else, look away.") + "</p>" +
      btn("open", many ? "We're ready, open the file" : "I'm " + name(audience[0]) + ", open the file", "primary block") +
      "</div></section>";
  }

  // Everyone is an AI: show a private decision openly, with the AI's reasoning.
  function spectate(t, h) {
    return '<section class="screen"><div class="kicker">Private decision · open because every detective is an AI</div>' +
      h.spectate(t) + btn("spectnext", "Continue", "primary block") + "</section>";
  }
  function pct(p) { return Math.round(p * 100) + "%"; }

  // The AI detectives at the table, introduced in the briefing.
  function aiRoster() {
    var bots = S.players.map(function (p, pi) { return pi; }).filter(isAI);
    if (!bots.length) return "";
    return '<div class="panel"><div class="kicker">AI detectives on the case</div>' + bots.map(function (pi) {
      var P = persOf(pi);
      return '<p class="ai-intro"><b>' + esc(S.players[pi].name) + "</b>, " + esc(P.title) + '<br><span class="muted small">' + esc(P.blurb) + "</span></p>";
    }).join("") + "</div>";
  }

  // ---------- task handlers ----------
  // Each handler: enter(t) runs once (may return "skip"); who(t) lists the private
  // audience; render(t) returns HTML; act holds button actions.

  var H = {};

  H.briefing = {
    render: function () {
      return '<section class="screen briefing">' +
        '<div class="kicker">Hollywood, 1983 · Case file 83-0417</div>' +
        '<h2 class="neon cyan big-title">The Body on Stage</h2>' +
        '<p class="type">Rising star <b>Suzanne Macky</b> landed the lead in <i>Drowning in Space</i>, filming on the sound stages of E. F. Studios. ' +
        "Inexperienced actors, a terrible script and murder all conspired to ruin the picture. For Miss Macky, it was the murder.</p>" +
        '<p class="type">Eyewitnesses disagree. The crime lab can only guess the hour of death. Forty-nine people had access to the lot, and the gate log shows when each one signed out. ' +
        "The killer signed out like everyone else, then slipped back in hours later. " +
        "Find the killer before the nation stops caring, and the detective who contributes most gets the promotion.</p>" +
        '<div class="panel tip"><b>Witnesses get more reliable each round.</b> In round 1 they are right 20% of the time; by round 4, half the time. ' +
        "Move too early and you'll be wrong. Wait too long and someone else takes the credit.</div>" +
        aiRoster() +
        '<p class="muted">Lead Detective: <b>' + name(S.lead) + "</b></p>" +
        btn("go", "Start round 1", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  H.donut = {
    enter: function () {
      fromLead().forEach(function (pi) {
        if (isAI(pi) && AI.wantsDonuts(S, pi)) S.flow.donutCalls.push(pi);
      });
    },
    render: function () {
      var rows = fromLead().map(function (pi) {
        var on = S.flow.donutCalls.indexOf(pi) >= 0;
        var inner = '<span class="tog-ic">' + A.locationIcon(5) + "</span><span>" + name(pi) + "</span><span class=\"spacer\"></span>" +
          '<span class="chip">' + (on ? "Going" : "Not going") + "</span>";
        if (isAI(pi)) return '<div class="toggle locked' + (on ? " on" : "") + '">' + inner + "</div>";
        return '<button class="toggle' + (on ? " on" : "") + '" data-act="toggle" data-arg="' + pi + '">' + inner + "</button>";
      }).join("");
      return '<section class="screen">' + turnHeader() +
        "<h2>Anyone for donuts?</h2>" +
        '<p class="muted">Starting with the Lead Detective and going around the table, say out loud whether you are heading to the <b>Donut Shop</b> to trade notes. Once you say it, you are committed for this turn.</p>' +
        '<div class="grid">' + rows + "</div>" +
        btn("go", !humansIn(fromLead()).length ? "Reveal destinations" : S.options.pickMode === "dice" ? "Everyone else: roll for it" : "Everyone else: choose in secret", "primary block") + "</section>";
    },
    act: {
      toggle: function (t, arg) {
        var pi = Number(arg), i = S.flow.donutCalls.indexOf(pi);
        if (isAI(pi)) return;
        if (i >= 0) S.flow.donutCalls.splice(i, 1); else S.flow.donutCalls.push(pi);
      },
      go: function () {
        var list = [];
        S.flow.donutCalls.forEach(function (pi) { S.flow.dest[pi] = 5; });
        var rest = fromLead().filter(function (pi) { return S.flow.dest[pi] !== 5; });
        // AI detectives choose in secret right away.
        rest.forEach(function (pi) { if (isAI(pi)) S.flow.dest[pi] = AI.chooseDestination(S, pi); });
        rest = humansIn(rest);
        if (rest.length) {
          if (S.options.pickMode === "dice") list.push({ t: "dice", who: rest });
          else rest.forEach(function (pi) { list.push({ t: "pick", pi: pi }); });
        }
        list.push({ t: "reveal" }, { t: "cards" });
        [1, 2, 3, 4, 5, 6].forEach(function (n) { list.push({ t: "loc", n: n }); });
        list.push({ t: "endturn" });
        replaceCurrent(list);
        settle();
      }
    }
  };

  function locationChoices(act, exclude, selected) {
    return '<div class="loc-grid">' + D.LOCATIONS.filter(function (l) { return exclude.indexOf(l.n) < 0; }).map(function (l) {
      return '<button class="loc-btn' + (selected === l.n ? " selected" : "") + '" data-act="' + act + '" data-arg="' + l.n + '" style="--c:' + A.LOCATION_COLORS[l.n - 1] + '">' +
        '<span class="die">' + l.n + "</span>" + A.locationIcon(l.n) + "<b>" + esc(l.name) + "</b><small>" + esc(l.blurb) + "</small></button>";
    }).join("") + "</div>";
  }

  H.pick = {
    who: function (t) { return [t.pi]; },
    render: function (t) {
      return '<section class="screen">' + turnHeader() + "<h2>Where to, " + name(t.pi) + "?</h2>" +
        '<p class="muted">Your choice stays secret until everyone has picked.</p>' + locationChoices("pick", [5]) + "</section>";
    },
    act: { pick: function (t, arg) { S.flow.dest[t.pi] = Number(arg); done(); } }
  };

  H.dice = {
    render: function (t) {
      var rows = t.who.map(function (pi) {
        var faces = [1, 2, 3, 4, 6].map(function (n) {
          return '<button class="die-btn' + (S.flow.dest[pi] === n ? " selected" : "") + '" data-act="set" data-arg="' + pi + ":" + n + '">' + n + "</button>";
        }).join("");
        return '<div class="dice-row"><b>' + name(pi) + '</b><div class="row">' + faces + "</div></div>";
      }).join("");
      var ready = t.who.every(function (pi) { return S.flow.dest[pi]; });
      return '<section class="screen">' + turnHeader() + "<h2>Reveal your dice</h2>" +
        '<p class="muted">Everyone not at the Donut Shop sets a die to a destination in secret, then all reveal at once. Enter what the dice show.</p>' +
        rows + btn("go", "Lock in destinations", "primary block" + (ready ? "" : " disabled")) + "</section>";
    },
    act: {
      set: function (t, arg) { var p = arg.split(":"); S.flow.dest[Number(p[0])] = Number(p[1]); },
      go: function (t) { if (t.who.every(function (pi) { return S.flow.dest[pi]; })) done(); }
    }
  };

  H.reveal = {
    enter: function () {
      log(D.LOCATIONS.map(function (l) {
        var p = present(l.n);
        return p.length ? l.name + ": " + p.map(function (pi) { return S.players[pi].name; }).join(", ") : null;
      }).filter(Boolean).join(" · "));
    },
    render: function () {
      var cards = D.LOCATIONS.map(function (l, k) {
        var p = present(l.n);
        return '<div class="dest-card flip" style="--d:' + k * 90 + "ms;--c:" + A.LOCATION_COLORS[k] + '">' +
          '<div class="dest-ic">' + A.locationIcon(l.n) + "</div><div><b>" + esc(l.name) + "</b>" +
          '<div class="muted">' + (p.length ? names(p) : "Nobody") + "</div></div></div>";
      }).join("");
      return '<section class="screen">' + turnHeader() + "<h2>Destinations</h2>" +
        '<div class="grid dests">' + cards + "</div>" + btn("go", "Continue", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  // Turn cards a player can play right now, given where they are.
  function playable(pi) {
    var d = S.flow.dest[pi];
    var already = S.flow.played.some(function (p) { return p.pi === pi; });
    if (already) return [];
    return S.hands[pi].filter(function (c, i, arr) {
      if (arr.indexOf(c) !== i) return false;
      if (c === "strongarm" || c === "sirens") return d >= 1 && d <= 4;
      if (c === "donuts") return present(d).length > 1;
      return false;
    });
  }

  H.cards = {
    enter: function () {
      fromLead().forEach(function (pi) {
        if (!isAI(pi) || !playable(pi).length) return;
        var c = AI.cardToPlay(S, pi, S.flow.dest[pi], present(S.flow.dest[pi]).length);
        if (!c || playable(pi).indexOf(c) < 0) return;
        E.discard(S, pi, c);
        S.flow.played.push({ pi: pi, card: c });
        log(S.players[pi].name + " played " + D.CARDS[c].name + ".");
      });
      var any = humansIn(fromLead()).some(function (pi) { return playable(pi).length; });
      if (!any && !S.flow.played.length) return "skip";
    },
    render: function () {
      var holders = humansIn(fromLead()).filter(function (pi) { return playable(pi).length; });
      var playedList = S.flow.played.map(function (p) {
        return '<li><b>' + name(p.pi) + "</b> played <i>" + esc(D.CARDS[p.card].name) + "</i></li>";
      }).join("");
      return '<section class="screen">' + turnHeader() + "<h2>Action cards</h2>" +
        (holders.length ? '<p class="muted">Anyone holding a card that can be played now may play one. Tap your name to look at your hand privately.</p>' : "") +
        (playedList ? '<ul class="played">' + playedList + "</ul>" : "") +
        '<div class="grid">' + holders.map(function (pi) { return btn("hand", name(pi) + "'s hand", "", pi); }).join("") + "</div>" +
        btn("go", holders.length ? "No more cards. Go!" : "Continue", "primary block") + "</section>";
    },
    act: {
      hand: function (t, arg) { S.flow.tasks.unshift({ t: "cardplay", pi: Number(arg), entered: true }); },
      go: function () { done(); }
    }
  };

  function cardFace(c) {
    var C = D.CARDS[c];
    return '<div class="card-face card-' + c + '"><div class="card-title">' + esc(C.name) + "</div>" +
      '<div class="card-art">' + cardArt(c) + "</div><p>" + esc(C.text) + "</p></div>";
  }
  function cardArt(c) {
    var n = { donuts: 5, peek: 1, compliment: 4, strongarm: 3, sirens: 4, lunch: 1 }[c];
    return A.locationIcon(n);
  }

  H.cardplay = {
    who: function (t) { return [t.pi]; },
    render: function (t) {
      var list = playable(t.pi);
      var held = S.hands[t.pi].map(function (c) {
        var can = list.indexOf(c) >= 0;
        return '<div class="hand-card">' + cardFace(c) + (can ? btn("play", "Play this card", "primary", c) : '<p class="muted small">Not playable here</p>') + "</div>";
      }).join("");
      return '<section class="screen"><h2>' + name(t.pi) + "'s hand</h2>" +
        '<div class="hand">' + held + "</div>" + btn("cancel", "Keep my cards", "ghost block") + "</section>";
    },
    act: {
      play: function (t, c) {
        E.discard(S, t.pi, c);
        S.flow.played.push({ pi: t.pi, card: c });
        log(S.players[t.pi].name + " played " + D.CARDS[c].name + ".");
        S.flow.tasks.shift();
      },
      cancel: function () { S.flow.tasks.shift(); }
    }
  };

  // Expand one location into its screens.
  H.loc = {
    enter: function (t) {
      var n = t.n, p = present(n), list = [];
      if (!p.length) return "skip";
      if (n <= 3 || n === 4 && p.length > 1) {
        var sirens = playedAt("sirens", n);
        var recipients = sirens.length ? sirens : p;
        list.push({ t: "interview", n: n, cat: n <= 3 ? n - 1 : E.TIME_CAT, who: recipients });
        playedAt("strongarm", n).forEach(function (pi) {
          if (recipients.indexOf(pi) >= 0) list.push({ t: "extra", n: n, pi: pi });
        });
      } else if (n === 4) {
        list.push({ t: "police", pi: p[0] });
        playedAt("strongarm", n).forEach(function (pi) { list.push({ t: "extra", n: n, pi: pi }); });
      } else if (n === 5) {
        if (p.length === 1) list.push({ t: "donutbox", pi: p[0] });
        else list.push({ t: "trade", n: n, who: p });
      } else if (n === 6) {
        p.forEach(function (pi) { list.push({ t: "prosecutor", pi: pi }); });
        list.push({ t: "prosresolve" });
      }
      if (n !== 5 && p.length > 1 && playedAt("donuts", n).length)
        list.push({ t: "trade", n: n, who: p, donuts: playedAt("donuts", n) });
      replaceCurrent(list);
    }
  };

  function draw(n, cat) { return cat === E.TIME_CAT ? E.drawLab(S) : E.drawAttribute(S, cat); }

  H.interview = {
    enter: function (t) {
      t.value = draw(t.n, t.cat);
      var ev = E.newEv(S);
      S.flow.results[t.n] = { cat: t.cat, value: t.value, ev: ev };
      t.who.forEach(function (pi) { E.record(S, pi, { cat: t.cat, value: t.value, ev: ev }); });
    },
    who: function (t) { return t.who; },
    render: function (t) {
      return '<section class="screen">' + evidenceCard(t.n, t.cat, t.value, QUOTES[t.n]) +
        btn("go", "Got it. Hide this", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  H.extra = {
    enter: function (t) {
      t.cat = t.n <= 3 ? t.n - 1 : E.TIME_CAT;
      t.value = draw(t.n, t.cat);
      E.record(S, t.pi, { cat: t.cat, value: t.value });
    },
    who: function (t) { return [t.pi]; },
    render: function (t) {
      return '<section class="screen"><div class="kicker">Strong-arm a Witness</div>' +
        evidenceCard(t.n, t.cat, t.value, "You lean on a witness a little harder. Just for you:") +
        btn("go", "Got it. Hide this", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  H.police = {
    who: function (t) { return [t.pi]; },
    auto: function (t) {
      var a = H.police.act;
      if (AI.policeChoice(S, t.pi) === "lab") { a.lab(t); return; }
      a.draw(t);
      if (t.card === "peek") a.target(t, AI.peekTarget(S, t.pi));
      if (t.card === "lunch") a.join(t, AI.lunchJoin(S, t.pi));
    },
    render: function (t) {
      if (t.stage === "lab") return '<section class="screen">' + evidenceCard(4, E.TIME_CAT, t.value, QUOTES[4]) + btn("go", "Got it. Hide this", "primary block") + "</section>";
      if (t.stage === "card") return '<section class="screen"><div class="kicker">You drew</div>' + cardFace(t.card) + cardFollowUp(t) + "</section>";
      var canDraw = S.actionDeck.length > 0;
      return '<section class="screen"><h2>Police Station</h2><p class="muted">You have the station to yourself. Choose one:</p>' +
        '<div class="grid two">' +
        '<button class="choice" data-act="lab">' + A.clock(null) + "<b>Crime Lab</b><small>Get an estimate of the hour of death.</small></button>" +
        '<button class="choice" data-act="draw"' + (canDraw ? "" : " disabled") + ">" + A.locationIcon(4) + "<b>Action Card</b><small>" +
        (canDraw ? S.actionDeck.length + " left in the deck." : "The deck is empty.") + "</small></button></div></section>";
    },
    act: {
      lab: function (t) {
        t.stage = "lab"; t.value = E.drawLab(S);
        E.record(S, t.pi, { cat: E.TIME_CAT, value: t.value });
      },
      draw: function (t) {
        if (!S.actionDeck.length) return;
        t.stage = "card"; t.card = E.drawCard(S, t.pi, "actionDeck");
        log(S.players[t.pi].name + " took an action card.");
      },
      target: function (t, arg) {
        t.target = Number(arg);
        t.stolen = E.stealPeek(S, t.pi, t.target);
        log(S.players[t.pi].name + " stole a peek at " + S.players[t.target].name + "'s notes.");
      },
      join: function (t, arg) {
        var n = Number(arg);
        t.joined = n;
        log(S.players[t.pi].name + " worked through lunch and joined the " + loc(n).name + ".");
        if (n > 4) { S.flow.lunch[t.pi] = n; return; }
        // That location already happened: share its result, or interview fresh if nobody went.
        var r = S.flow.results[n] || { cat: n - 1, value: draw(n, n - 1) };
        t.lunchResult = r;
        E.record(S, t.pi, { cat: r.cat, value: r.value, ev: r.ev });
      },
      go: function () { done(); }
    }
  };

  function cardFollowUp(t) {
    var go = btn("go", "Done. Hide this", "primary block");
    if (t.card === "peek") {
      if (t.target == null) {
        return "<h3>Whose notes?</h3><div class=\"grid\">" + S.players.map(function (p, pi) {
          return pi === t.pi ? "" : btn("target", name(pi), "", pi);
        }).join("") + "</div>";
      }
      var from = Math.max(1, S.round - 1);
      return "<h3>From " + name(t.target) + "'s round " + from + " notes</h3>" +
        (t.stolen.length ? '<div class="grid">' + t.stolen.map(entryLine).join("") + "</div>" : '<p class="muted">Nothing to see: ' + name(t.target) + " had no first-hand information from that round.</p>") +
        '<p class="muted small">Added to your notebook as second-hand information.</p>' + go;
    }
    if (t.card === "lunch") {
      if (t.joined == null) return "<h3>Join which location?</h3>" + locationChoices("join", [4]);
      if (t.lunchResult) return evidenceCard(t.joined, t.lunchResult.cat, t.lunchResult.value, "You catch the tail end of the interview:") + go;
      return '<p class="type">You\'ll join the ' + esc(loc(t.joined).name) + " when its turn comes.</p>" + go;
    }
    if (t.card === "compliment") return '<p class="muted">Keep it. It scores at the end of the game.</p>' + go;
    return '<p class="muted">It\'s in your hand. Play it on a later turn, after destinations are revealed.</p>' + go;
  }

  H.donutbox = {
    enter: function (t) {
      t.card = E.drawCard(S, t.pi, "donutDeck");
      if (t.card) log(S.players[t.pi].name + " picked up a Box of Donuts.");
    },
    who: function (t) { return [t.pi]; },
    render: function (t) {
      return '<section class="screen"><h2>Donut Shop</h2>' +
        (t.card ? '<p class="muted">Nobody else showed up, so you grab a box for later.</p>' + cardFace(t.card)
                : '<p class="type">Nobody else showed up, and the shop is out of boxes. Have a cruller.</p>') +
        btn("go", "Done", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  H.trade = {
    enter: function (t) {
      // AI detectives swap notes with each other on their own.
      var bots = t.who.filter(isAI);
      t.swaps = [];
      for (var a = 0; a < bots.length; a++)
        for (var b = a + 1; b < bots.length; b++) {
          var sw = AI.swap(S, bots[a], bots[b]);
          t.swaps.push({ a: bots[a], b: bots[b], fromA: sw.fromA, fromB: sw.fromB });
          log(S.players[bots[a]].name + " and " + S.players[bots[b]].name + " traded notes.");
        }
      t.done = {};
      if (!humansIn(t.who).length && !spectator()) return "skip";
    },
    render: function (t) {
      var people = humansIn(t.who), bots = t.who.filter(isAI);
      var talk = people.length > 1 ?
        "<p>" + names(people) + ": negotiate what you'll share, in pairs or as a group. You can offer first- or second-hand info, " +
        "but you can't attach conditions or promise future information. <b>No bluffing:</b> whatever you share must be true.</p>" +
        '<p class="muted">After the deal, each detective records what he or she received:</p>' +
        '<div class="grid">' + people.map(function (pi) { return btn("note", "Record for " + name(pi), "", pi); }).join("") + "</div>" : "";
      var deals = "";
      bots.forEach(function (ai) {
        deals += '<div class="panel ai-deal"><p class="type">' + esc(AI.line(S, ai, "trade")) + "</p><div class=\"grid\">" +
          people.map(function (pi) {
            var key = pi + ":" + ai;
            return t.done[key] ? '<div class="chip ok">' + name(pi) + " ⇄ " + name(ai) + ": done</div>"
              : btn("deal", name(pi) + " ⇄ " + name(ai), "", key);
          }).join("") + "</div></div>";
      });
      if (spectator()) {
        deals = t.swaps.map(function (sw) {
          return '<div class="panel ai-deal"><p class="type">' + esc(AI.line(S, sw.a, "trade")) + "</p>" +
            '<div class="kicker">' + name(sw.a) + " gives " + name(sw.b) + "</div><div class=\"grid\">" + (sw.fromA.map(entryLine).join("") || '<p class="muted">Nothing new.</p>') + "</div>" +
            '<div class="kicker">' + name(sw.b) + " gives " + name(sw.a) + "</div><div class=\"grid\">" + (sw.fromB.map(entryLine).join("") || '<p class="muted">Nothing new.</p>') + "</div></div>";
        }).join("");
      }
      else if (deals) deals = (talk ? "<h3>Trading with AI detectives</h3>" : "") +
        '<p class="muted">An AI detective swaps notes one for one, and it always tells the truth. Each trade is private: you pick what you give, then see what you get.</p>' + deals;
      return '<section class="screen"><div class="row"><span class="loc-ic">' + A.locationIcon(t.n) + "</span><h2>Trade time</h2></div>" +
        (t.donuts ? '<p class="type">' + names(t.donuts) + " brought a Box of Donuts to the " + esc(loc(t.n).name) + ".</p>" : "") +
        talk + deals + btn("go", "Trading's done", "primary block") + "</section>";
    },
    act: {
      note: function (t, arg) { S.flow.tasks.unshift({ t: "notebook", pi: Number(arg), entered: true, adding: true }); },
      deal: function (t, arg) {
        var p = arg.split(":"), pi = Number(p[0]), ai = Number(p[1]);
        S.flow.tasks.unshift({ t: "aitrade", pi: pi, ai: ai, key: arg, entered: true, sel: [],
                               offer: AI.chooseGive(S, ai, pi) });
      },
      go: function () { done(); }
    }
  };

  // A person trades privately with one AI detective: give first, then receive.
  H.aitrade = {
    who: function (t) { return [t.pi]; },
    render: function (t) {
      var head = '<section class="screen"><h2>' + name(t.pi) + " ⇄ " + name(t.ai) + "</h2>";
      if (t.stage === "got") {
        return head + '<p class="type">' + esc(AI.line(S, t.ai, "trade")) + "</p>" +
          (t.offer.length ? '<div class="kicker">' + esc(S.players[t.ai].name) + " shares</div><div class=\"grid\">" + t.offer.map(entryLine).join("") + "</div>" +
            '<p class="muted small">Added to your notebook as second-hand information, in the round it was gathered.</p>'
            : '<p class="muted">' + esc(S.players[t.ai].name) + " had nothing new to share with you.</p>") +
          btn("finish", "Done. Hide this", "primary block") + "</section>";
      }
      var mine = uniqueEntries(S.notebooks[t.pi]), need = Math.min(t.offer.length, mine.length);
      if (!need) {
        return head + '<p class="muted">' + (t.offer.length ? "You have nothing in your notebook to trade yet." : esc(S.players[t.ai].name) + " has nothing new to share with you.") + "</p>" +
          btn("cancel", "No deal", "primary block") + "</section>";
      }
      var list = mine.slice().reverse().map(function (e) {
        var k = S.notebooks[t.pi].indexOf(e), on = t.sel.indexOf(k) >= 0;
        return '<button class="pick-entry' + (on ? " selected" : "") + '" data-act="sel" data-arg="' + k + '">' + entryLine(e) + "</button>";
      }).join("");
      return head + "<p>" + name(t.ai) + " will share <b>" + need + "</b> piece" + (need > 1 ? "s" : "") + " of evidence. Pick " + need +
        " of yours to give in return. No bluffing: these are your real notes.</p>" +
        '<div class="grid">' + list + "</div>" +
        '<div class="sticky-bar">' + btn("give", "Give " + t.sel.length + " of " + need, "primary block" + (t.sel.length === need ? "" : " disabled")) +
        btn("cancel", "No deal", "ghost block") + "</div></section>";
    },
    act: {
      sel: function (t, arg) {
        var k = Number(arg), i = t.sel.indexOf(k);
        var need = Math.min(t.offer.length, uniqueEntries(S.notebooks[t.pi]).length);
        if (i >= 0) t.sel.splice(i, 1);
        else if (t.sel.length < need) t.sel.push(k);
      },
      give: function (t) {
        var need = Math.min(t.offer.length, uniqueEntries(S.notebooks[t.pi]).length);
        if (t.sel.length !== need) return;
        var given = t.sel.map(function (k) { return S.notebooks[t.pi][k]; });
        AI.receive(S, t.ai, given, t.pi);
        t.offer = t.offer.slice(0, need);
        AI.markGiven(S, t.ai, t.pi, t.offer);
        t.offer.forEach(function (e) {
          E.record(S, t.pi, { round: e.round, cat: e.cat, value: e.value, ev: e.ev, hand: 2, src: S.players[t.ai].name });
        });
        t.stage = "got";
        log(S.players[t.pi].name + " and " + S.players[t.ai].name + " traded notes.");
      },
      finish: function (t) { S.flow.tasks[1].done[t.key] = true; S.flow.tasks.shift(); },
      cancel: function (t) { S.flow.tasks[1].done[t.key] = true; S.flow.tasks.shift(); }
    }
  };

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

  // ---------- prosecutor's office ----------

  function openCategories() { return [0, 1, 2].filter(function (c) { return !S.pressReleases[c]; }); }

  H.prosecutor = {
    who: function (t) { return [t.pi]; },
    auto: function (t) { S.flow.pros[t.pi] = AI.prosecutorChoice(S, t.pi); },
    spectate: function (t) {
      var c = S.flow.pros[t.pi], post = AI.posterior(S, t.pi);
      if (c.kind === "name") {
        return "<h2>" + name(t.pi) + " names a suspect</h2>" + suspectHero(c.suspect, "Charged") +
          '<p class="type">' + esc(AI.line(S, t.pi, "name")) + "</p>" +
          '<p class="muted">Belief this is the killer: <b>' + pct(post[c.suspect]) + "</b></p>";
      }
      var m = AI.marginals(post)[c.cat][c.value];
      return "<h2>" + name(t.pi) + " drafts a press release</h2>" +
        '<div class="attr-line"><span class="attr-ic">' + A.attributeIcon(c.cat, c.value) + "</span>" + esc(D.CATEGORIES[c.cat].name) + ": " + attrName(c.cat, c.value) + "</div>" +
        '<p class="muted">Belief: <b>' + pct(m) + "</b></p>";
    },
    render: function (t) {
      var open = openCategories();
      if (!t.kind) {
        return '<section class="screen"><h2>Prosecutor\'s Office</h2><p class="muted">Choose one, in secret:</p><div class="grid two">' +
          '<button class="choice" data-act="kind" data-arg="press"' + (open.length ? "" : " disabled") + ">" + A.locationIcon(6) +
          "<b>Press Release</b><small>" + (open.length ? "Announce one attribute of the killer. +10 if right, −5 if wrong." : "All three press releases have been made.") + "</small></button>" +
          '<button class="choice" data-act="kind" data-arg="name">' + A.locationIcon(4) + "<b>Name the Perpetrator</b><small>Take a suspect to trial. +16 if guilty, −12 if innocent.</small></button></div>" + "</section>";
      }
      if (t.kind === "press") {
        var cats = open.map(function (c) {
          return "<h3>" + esc(D.CATEGORIES[c].name) + '</h3><div class="attr-grid">' + D.CATEGORIES[c].values.map(function (v, k) {
            var sel = t.cat === c && t.value === k;
            return '<button class="attr-btn' + (sel ? " selected" : "") + '" data-act="attr" data-arg="' + c + ":" + k + '">' +
              '<span class="attr-ic">' + A.attributeIcon(c, k) + "</span>" + esc(D.CATEGORIES[c].short[k]) + "</button>";
          }).join("") + "</div>";
        }).join("");
        return '<section class="screen"><h2>Press release</h2><p class="muted">Pick the one attribute you\'ll announce.</p>' + cats +
          btn("submit", "Submit press release", "primary block" + (t.cat == null ? " disabled" : "")) + btn("back", "Back", "ghost block") + "</section>";
      }
      return '<section class="screen"><h2>Name the perpetrator</h2><p class="muted">Tap the suspect you will prosecute.</p>' +
        suspectGrid({ act: "accuse", selected: t.suspect }) +
        '<div class="sticky-bar">' + btn("submit", "Name No." + (t.suspect != null ? A.pad(t.suspect + 1) : "—"), "primary block" + (t.suspect == null ? " disabled" : "")) +
        btn("back", "Back", "ghost block") + "</div></section>";
    },
    act: {
      kind: function (t, arg) { t.kind = arg; },
      attr: function (t, arg) { var p = arg.split(":"); t.cat = Number(p[0]); t.value = Number(p[1]); },
      accuse: function (t, arg) { t.suspect = Number(arg); },
      back: function (t) { t.kind = null; t.cat = null; t.value = null; t.suspect = null; },
      submit: function (t) {
        if (t.kind === "press" && t.cat == null || t.kind === "name" && t.suspect == null) return;
        S.flow.pros[t.pi] = t.kind === "press" ? { kind: "press", cat: t.cat, value: t.value } : { kind: "name", suspect: t.suspect };
        done();
      }
    }
  };

  H.prosresolve = {
    enter: function (t) {
      var subs = [], namings = [];
      Object.keys(S.flow.pros).forEach(function (k) {
        var p = S.flow.pros[k], pi = Number(k);
        if (p.kind === "press") subs.push({ pi: pi, cat: p.cat, value: p.value });
        else namings.push({ pi: pi, suspect: p.suspect });
      });
      t.press = E.resolvePressReleases(S, subs);
      t.press.made.forEach(function (r) {
        log("PRESS RELEASE by " + r.by.map(function (pi) { return S.players[pi].name; }).join(" & ") + ": the killer's " +
            D.CATEGORIES[r.cat].name.toLowerCase() + " is " + D.CATEGORIES[r.cat].values[r.value] + ".");
      });
      t.trials = E.groupProsecutions(namings);
      if (!subs.length) {
        replaceCurrent(t.trials.map(function (g) { return { t: "trial", suspect: g.suspect, prosecutors: g.prosecutors }; }));
        return;
      }
      insertNext(t.trials.map(function (g) { return { t: "trial", suspect: g.suspect, prosecutors: g.prosecutors }; }));
    },
    render: function (t) {
      var made = t.press.made.map(function (r) {
        return '<div class="press pop"><div class="press-head">EXTRA! EXTRA!</div>' +
          '<div class="press-body"><span class="attr-ic big">' + A.attributeIcon(r.cat, r.value) + "</span><div>" +
          '<div class="kicker">Police say the killer\'s ' + esc(D.CATEGORIES[r.cat].name.toLowerCase()) + " is</div>" +
          '<div class="press-value">' + attrName(r.cat, r.value) + "</div>" +
          '<div class="muted">Released by ' + names(r.by) + "</div></div></div></div>";
      }).join("");
      var blocked = t.press.blocked.map(function (b) {
        return '<p class="muted">' + names(b.by) + ": no " + esc(D.CATEGORIES[b.cat].name.toLowerCase()) + " press release " +
          (b.reason === "taken" ? "(already released this game)." : "(the detectives disagreed).") + "</p>";
      }).join("");
      return '<section class="screen"><h2>Press releases</h2>' + made + blocked +
        btn("go", t.trials.length ? "On to the trial" : "Continue", "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  // ---------- trials ----------

  // AI prosecutors state their case: the evidence they hold for each of the defendant's attributes.
  function aiCase(t) {
    return t.prosecutors.filter(isAI).map(function (pi) {
      var lines = AI.caseFor(S, pi, t.suspect).map(function (c) {
        return '<div class="attr-line"><span class="attr-ic">' + A.attributeIcon(c.cat, c.value) + "</span>" + attrName(c.cat, c.value) +
          '<span class="spacer"></span><span class="muted small">' + (c.count ? c.count + " report" + (c.count > 1 ? "s" : "") + ", weight " + c.score : "no reports") + "</span></div>";
      }).join("");
      return '<div class="panel"><p class="type">' + esc(AI.line(S, pi, "name")) + "</p>" + lines + "</div>";
    }).join("");
  }

  H.trial = {
    enter: function (t) {
      if (S.over) return "skip";
      S.flow.trial = { suspect: t.suspect, prosecutors: t.prosecutors, votes: {}, claimed: null };
      // AI prosecutors pick the hour their lab readings point to; a person prosecuting alongside decides.
      var bots = t.prosecutors.filter(isAI);
      if (bots.length) t.aiClaim = AI.claimTime(S, bots);
      if (bots.length === t.prosecutors.length) S.flow.trial.claimed = t.aiClaim;
      log("TRIAL: " + t.prosecutors.map(function (pi) { return S.players[pi].name; }).join(" & ") + " charged suspect No." + A.pad(t.suspect + 1) + ".");
    },
    render: function (t) {
      var tr = S.flow.trial;
      var head = '<section class="screen trial"><div class="kicker">The People v. Suspect No.' + A.pad(t.suspect + 1) + "</div>" +
        suspectHero(t.suspect, "The defendant") +
        '<p>Prosecuting: <b>' + names(t.prosecutors) + "</b></p>" + aiCase(t);
      var people = humansIn(t.prosecutors);
      if (!t.stage) {
        if (!people.length) {
          return head + '<div class="panel center"><div class="kicker">The prosecution says the crime was at</div><div class="clock-lg">' + A.clock(tr.claimed) + "</div><b>" + esc(timeName(tr.claimed)) + "</b></div>" +
            btn("alibi", "Check the alibi", "primary block") + "</section>";
        }
        return head + '<div class="panel"><p><b>' + (people.length > 1 ? "Prosecutors" : "Prosecutor") + ", make your case.</b> State your evidence for each attribute out loud, then name the hour of the crime" +
          (t.prosecutors.length > 1 ? " (agree on it together; you may compare crime lab notes privately first)" : "") + ".</p>" +
          (t.aiClaim != null ? '<p class="muted">The AI co-prosecutor suggests <b>' + esc(timeName(t.aiClaim)) + "</b>.</p>" : "") +
          clockPicker("claim", tr.claimed) + "</div>" +
          btn("alibi", "Check the alibi", "primary block" + (tr.claimed == null ? " disabled" : "")) + "</section>";
      }
      var alibi = S.alibis[t.suspect];
      return head + '<div class="grid two">' +
        '<div class="panel center"><div class="kicker">Prosecution says the crime was at</div><div class="clock-lg">' + A.clock(tr.claimed) + "</div><b>" + esc(timeName(tr.claimed)) + "</b></div>" +
        '<div class="panel center pop"><div class="kicker">Alibi: the defendant signed out at</div><div class="clock-lg">' + A.clock(alibi) + "</div><b>" + esc(timeName(alibi)) + "</b></div></div>" +
        '<p class="muted small">The killer slipped back onto the lot 1 to 16 hours after signing out, most often 8 or 9. If the crime happened at the hour the defendant signed out, or in the 7 hours before it, the defendant is innocent.</p>' +
        btn("vote", "The jury will now vote", "primary block") + "</section>";
    },
    act: {
      claim: function (t, arg) { S.flow.trial.claimed = Number(arg); },
      alibi: function (t) {
        if (S.flow.trial.claimed == null) return;
        t.stage = "alibi";
        log("The defendant signed out at " + timeName(S.alibis[t.suspect]) + ". Prosecution's hour of the crime: " + timeName(S.flow.trial.claimed) + ".");
      },
      vote: function (t) {
        var jurors = fromLead().filter(function (pi) { return t.prosecutors.indexOf(pi) < 0; });
        replaceCurrent(jurors.map(function (pi) { return { t: "vote", pi: pi }; }).concat([{ t: "verdict" }]));
        settle();
      }
    }
  };

  H.vote = {
    who: function (t) { return [t.pi]; },
    auto: function (t) {
      var tr = S.flow.trial;
      tr.votes[t.pi] = AI.vote(S, t.pi, tr.suspect, S.alibis[tr.suspect], tr.claimed);
    },
    spectate: function (t) {
      var tr = S.flow.trial, p = AI.pGuilty(S, t.pi, tr.suspect, S.alibis[tr.suspect], tr.claimed);
      return "<h2>" + name(t.pi) + " votes " + (tr.votes[t.pi] ? "Guilty" : "Not guilty") + "</h2>" + suspectHero(tr.suspect, "The defendant") +
        '<p class="muted">After hearing the alibi, ' + esc(S.players[t.pi].name.split(" ")[0]) + " puts the chance of guilt at <b>" + pct(p) + "</b>. " +
        "Guilty needs at least " + pct(persOf(t.pi).guiltyAt) + ".</p>";
    },
    render: function (t) {
      var tr = S.flow.trial;
      return '<section class="screen"><h2>Your vote, ' + name(t.pi) + "</h2>" + suspectHero(tr.suspect, "The defendant") +
        '<p class="muted small">Guilty: +6 if the defendant did it, −4 if not. Not guilty: −3 if the defendant did it, +7 if not.</p>' +
        '<div class="grid two">' + btn("cast", "Guilty", "primary", "1") + btn("cast", "Not guilty", "", "0") + "</div></section>";
    },
    act: { cast: function (t, arg) { S.flow.trial.votes[t.pi] = arg === "1"; done(); } }
  };

  H.verdict = {
    render: function (t) {
      var tr = S.flow.trial, votes = Object.keys(tr.votes);
      var tally = votes.map(function (pi) {
        return '<div class="vote-chip ' + (tr.votes[pi] ? "g" : "n") + ' pop">' + name(Number(pi)) + ": " + (tr.votes[pi] ? "Guilty" : "Not guilty") + "</div>";
      }).join("");
      var html = '<section class="screen trial"><h2>The jury has spoken</h2>' +
        (votes.length ? '<div class="row">' + tally + "</div>" : '<p class="muted">Every detective is prosecuting. There is no jury.</p>');
      if (!t.result) return html + suspectHero(tr.suspect, "The defendant") + btn("check", "Check the suspect", "primary block") + "</section>";
      var r = t.result;
      var pts = Object.keys(r.points).map(function (pi) {
        var v = r.points[pi];
        return "<li>" + name(Number(pi)) + ' <b class="' + (v >= 0 ? "pos" : "neg") + '">' + (v > 0 ? "+" : "") + v + "</b></li>";
      }).join("");
      return html + '<div class="verdict-wrap">' + suspectHero(tr.suspect, "The defendant") +
        '<div class="verdict-stamp ' + (r.guilty ? "guilty" : "innocent") + '">' + (r.guilty ? "Guilty" : "Innocent") + "</div></div>" +
        (r.guilty ? "" : '<p class="type">Suspect No.' + A.pad(tr.suspect + 1) + " walks free and is cleared for the rest of the game. The investigation continues.</p>") +
        '<div class="panel"><div class="kicker">Points from this trial</div><ul class="pts">' + pts + "</ul></div>" +
        btn("go", r.guilty ? "Close the case" : "Back to work", "primary block") + "</section>";
    },
    act: {
      check: function (t) {
        var tr = S.flow.trial;
        t.result = E.runTrial(S, tr.suspect, tr.prosecutors, tr.votes, tr.claimed);
        log("VERDICT: suspect No." + A.pad(tr.suspect + 1) + " is " + (t.result.guilty ? "GUILTY." : "innocent."));
      },
      go: function () {
        if (S.over) { S.flow.tasks = [{ t: "gameover" }]; settle(); return; }
        done();
      }
    }
  };

  // ---------- rounds ----------

  H.endturn = {
    enter: function () {
      var ended = E.endTurn(S);
      newTurnFlow();
      if (!ended) return;
      var list = [];
      if (E.hunchRounds().indexOf(ended) >= 0) {
        fromLead().forEach(function (pi) { list.push({ t: "hunch", pi: pi, round: ended }); });
        list.push({ t: "hunchlog", round: ended });
      }
      list.push({ t: "newround" });
      S.flow.tasks = list.concat(S.flow.tasks);
    }
  };

  H.hunch = {
    who: function (t) { return [t.pi]; },
    auto: function (t) { E.makeHunch(S, t.pi, t.round, AI.hunch(S, t.pi, t.round)); },
    spectate: function (t) {
      var h = S.hunches[t.pi].made[t.round], post = AI.posterior(S, t.pi);
      if (h.suspect === null) {
        var top = post.indexOf(Math.max.apply(null, post));
        return "<h2>" + name(t.pi) + " passes</h2><p>Best guess so far is No." + A.pad(top + 1) + " at only <b>" + pct(post[top]) + "</b>. Half of the " + h.value + "-point stake carries forward.</p>";
      }
      return "<h2>" + name(t.pi) + " writes a hunch</h2>" + suspectHero(h.suspect, "Worth " + h.value + " points if right") +
        '<p class="muted">Belief: <b>' + pct(post[h.suspect]) + "</b></p>";
    },
    render: function (t) {
      var stake = E.hunchValue(S, t.pi, t.round);
      return '<section class="screen"><div class="kicker">End of round ' + t.round + "</div><h2>Got a hunch, " + name(t.pi) + "?</h2>" +
        '<p>A correct hunch now is worth <b class="pos">' + stake + " points</b>. A wrong hunch scores nothing. " +
        (t.round < 6 ? "Pass, and half of it (" + stake / 2 + ") carries to your next hunch." : "This is the last hunch of the game.") + "</p>" +
        suspectGrid({ act: "pickh", selected: t.suspect }) +
        '<div class="sticky-bar">' + btn("commit", "Hunch: No." + (t.suspect != null ? A.pad(t.suspect + 1) : "—"), "primary block" + (t.suspect == null ? " disabled" : "")) +
        btn("pass", "Pass this round", "ghost block") + "</div></section>";
    },
    act: {
      pickh: function (t, arg) { t.suspect = Number(arg); },
      commit: function (t) { if (t.suspect == null) return; E.makeHunch(S, t.pi, t.round, t.suspect); done(); },
      pass: function (t) { E.makeHunch(S, t.pi, t.round, null); done(); }
    }
  };

  H.hunchlog = {
    enter: function (t) {
      var made = [], passed = [];
      S.players.forEach(function (p, pi) { (S.hunches[pi].made[t.round].suspect === null ? passed : made).push(p.name); });
      log("Hunches after round " + t.round + ": " + (made.length ? made.join(", ") + " wrote one" : "nobody wrote one") +
          (passed.length ? "; " + passed.join(", ") + " passed." : "."));
    }
  };

  H.newround = {
    render: function () {
      var pct = Math.round(E.correctChance(S.round) * 100);
      return '<section class="screen center round-banner"><div class="kicker">The investigation continues</div>' +
        '<h2 class="neon big-title flicker">Round ' + S.round + "</h2>" +
        '<div class="meter"><div class="meter-fill" style="width:' + pct + '%"></div></div>' +
        "<p>Witnesses are now right <b>" + pct + "%</b> of the time.</p>" +
        "<p>New Lead Detective: <b>" + name(S.lead) + "</b></p>" + btn("go", "Start round " + S.round, "primary block") + "</section>";
    },
    act: { go: function () { done(); } }
  };

  // ---------- notebook (private) ----------

  function entryLine(e) {
    var ic = e.cat === E.TIME_CAT ? A.clock(e.value) : A.attributeIcon(e.cat, e.value);
    var label = e.cat === E.TIME_CAT ? esc(timeName(e.value)) : attrName(e.cat, e.value);
    return '<div class="entry"><span class="attr-ic">' + ic + "</span><span>" + label + "</span>" +
      '<span class="spacer"></span><span class="chip">R' + e.round + (e.hand === 2 ? " · 2nd" : "") + "</span></div>";
  }

  function notebookView(pi, t) {
    var w = E.weightedTotals(S, pi), nb = S.notebooks[pi];
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

    var assist = "";
    if (isAI(pi)) {
      var post = AI.posterior(S, pi), order = post.map(function (p, i) { return i; })
        .sort(function (a, b) { return post[b] - post[a]; }).slice(0, 5);
      assist = '<div class="panel"><div class="kicker">' + esc(S.players[pi].name) + "'s beliefs: chance each suspect is the killer</div><div class=\"assist\">" +
        order.map(function (i) { return '<div class="assist-item">' + A.portrait(i, { number: true }) + "<b>" + pct(post[i]) + "</b></div>"; }).join("") + "</div></div>";
    } else if (S.options.assist) {
      var ranked = E.suspectScores(S, pi).filter(function (s) { return !s.eliminated; })
        .sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
      assist = '<div class="panel"><div class="kicker">Detective assist: top suspects by weighted score</div><div class="assist">' +
        ranked.map(function (s) { return '<div class="assist-item">' + A.portrait(s.suspect, { number: true }) + "<b>" + s.score + "</b></div>"; }).join("") + "</div></div>";
    }

    var add = isAI(pi) ? "" : '<div class="panel"><div class="kicker">Record shared (second-hand) info</div>' +
      '<div class="add-grid">' +
      '<select data-field="cat">' + [0, 1, 2, 3].map(function (c) {
        return '<option value="' + c + '"' + (t.addCat === c ? " selected" : "") + ">" + (c === 3 ? "Crime lab time" : esc(D.CATEGORIES[c].name)) + "</option>";
      }).join("") + "</select>" +
      '<select data-field="value">' + (t.addCat === 3 ? D.TIMES.map(function (x, k) { return '<option value="' + k + '">' + esc(timeName(k)) + "</option>"; })
        : D.CATEGORIES[t.addCat || 0].values.map(function (x, k) { return '<option value="' + k + '">' + esc(x) + "</option>"; })).join("") + "</select>" +
      '<select data-field="round">' + Array.apply(null, Array(S.round)).map(function (x, k) {
        return '<option value="' + (k + 1) + '"' + (k + 1 === S.round ? " selected" : "") + ">Gathered in round " + (k + 1) + "</option>";
      }).join("") + "</select>" + btn("add", "Add", "") + "</div>" +
      '<p class="muted small">Use the round the information was <i>gathered</i> in. Later rounds are more reliable and count for more.</p></div>';

    var recent = nb.slice(-8).reverse().map(entryLine).join("");
    return '<div class="kicker">Each mark counts its round number. Highest totals are most likely.</div>' + cats + times + assist + add +
      (recent ? '<h3>Latest entries</h3><div class="grid">' + recent + "</div>" : "");
  }

  H.notebook = {
    who: function (t) { return [t.pi]; },
    render: function (t) {
      if (t.addCat == null) t.addCat = 0;
      var flash = t.flash ? '<div class="chip ok pop">Added to your notebook</div>' : "";
      t.flash = false;
      return '<section class="screen"><h2>' + name(t.pi) + "'s notebook</h2>" + flash + notebookView(t.pi, t) +
        btn("close", "Close notebook", "primary block") + "</section>";
    },
    act: {
      add: function (t) {
        var get = function (f) { return Number(app.querySelector('[data-field="' + f + '"]').value); };
        E.record(S, t.pi, { cat: get("cat"), value: get("value"), round: get("round"), hand: 2 });
        t.flash = true;
      },
      close: function () { S.flow.tasks.shift(); settle(); }
    }
  };

  // ---------- game over ----------

  H.gameover = {
    enter: function () { S.over = true; },
    render: function () {
      var f = E.finalScores(S), win = f.ranked[0];
      var rows = f.ranked.map(function (r, k) {
        var hunches = Object.keys(S.hunches[r.pi].made).map(function (rd) {
          var h = S.hunches[r.pi].made[rd];
          return h.suspect === null ? "R" + rd + ": pass" : "R" + rd + ": No." + A.pad(h.suspect + 1) + (h.suspect === S.perp ? " ✓" : "");
        }).join(", ");
        return "<tr" + (k === 0 ? ' class="winner"' : "") + "><td><b>" + esc(r.name) + "</b>" + (hunches ? '<div class="muted small">' + hunches + "</div>" : "") + "</td>" +
          "<td>" + r.hunch + "</td><td>" + r.press + "</td><td>" + r.prosecution + "</td><td>" + r.votes + "</td><td>" + r.compliment + "</td><td><b>" + r.total + "</b></td></tr>";
      }).join("");
      return '<section class="screen gameover"><div class="kicker">Case closed</div>' +
        '<h2 class="neon big-title">' + esc(win.name) + " gets the promotion</h2>" +
        '<div class="verdict-wrap">' + suspectHero(S.perp, "The killer") + '<div class="verdict-stamp guilty">Guilty</div></div>' +
        '<div class="grid two"><div class="panel center"><div class="kicker">Hour of the crime</div><div class="clock-lg">' + A.clock(S.crimeTime) + "</div><b>" + esc(timeName(S.crimeTime)) + "</b></div>" +
        '<div class="panel center"><div class="kicker">The killer signed out at</div><div class="clock-lg">' + A.clock(S.alibis[S.perp]) + "</div><b>" + esc(timeName(S.alibis[S.perp])) + "</b></div></div>" +
        '<div class="panel table-wrap"><table class="scores"><thead><tr><th>Detective</th><th>Hunch</th><th>Press</th><th>Trial</th><th>Votes</th><th>Chief</th><th>Total</th></tr></thead><tbody>' +
        rows + "</tbody></table><p class=\"muted small\">Ties go to the detective with the most evidence gathered.</p></div>" +
        btn("again", "New case", "primary block") + "</section>";
    },
    act: { again: function () { clearSave(); S = null; view = null; } }
  };

  // ---------- setup ----------

  var setup = { count: 4, names: ["", "", "", "", "", ""], kinds: ["", "", "", "", "", ""], pickMode: "phone", assist: false };

  // Seats in use, with AI names filled in. A personality can sit at the table twice, under two names.
  function seats() {
    var used = {}, out = [];
    for (var k = 0; k < setup.count; k++) {
      var ai = setup.kinds[k];
      if (!ai) { out.push({ name: setup.names[k].trim() || "Detective " + (k + 1), ai: null }); continue; }
      var P = AI.PERSONALITIES[ai];
      out.push({ name: used[ai] ? P.alt : P.name, ai: ai });
      used[ai] = (used[ai] || 0) + 1;
    }
    return out;
  }
  function personalityCount(ai, upto) {
    var n = 0;
    for (var k = 0; k < setup.count; k++) if (k !== upto && setup.kinds[k] === ai) n++;
    return n;
  }

  function renderSetup() {
    var list = seats(), rows = "";
    for (var k = 0; k < setup.count; k++) {
      var opts = '<option value="">Person</option>' + AI.ORDER.map(function (ai) {
        var full = personalityCount(ai, k) >= 2;
        return '<option value="' + ai + '"' + (setup.kinds[k] === ai ? " selected" : "") + (full ? " disabled" : "") + ">AI: " + esc(AI.PERSONALITIES[ai].title) + "</option>";
      }).join("");
      rows += '<div class="seat"><span class="seat-n">' + (k + 1) + "</span>" +
        (setup.kinds[k] ? '<div class="seat-ai"><b>' + esc(list[k].name) + '</b><span class="muted small">' + esc(AI.PERSONALITIES[setup.kinds[k]].blurb) + "</span></div>"
          : '<input type="text" maxlength="16" data-name="' + k + '" placeholder="Detective ' + (k + 1) + '" value="' + esc(setup.names[k]) + '">') +
        '<select data-seat="' + k + '" aria-label="Seat ' + (k + 1) + ' is played by">' + opts + "</select></div>";
    }
    var people = list.filter(function (p) { return !p.ai; }).length;
    var counts = [3, 4, 5, 6].map(function (n) {
      return '<button class="die-btn' + (setup.count === n ? " selected" : "") + '" data-act="count" data-arg="' + n + '">' + n + "</button>";
    }).join("");
    var note = people === 0 ? "Every seat is an AI: you'll watch the case unfold and tap through each step, with every secret shown."
      : people === 1 ? "One person at the table: no need to pass the phone, and nothing is hidden from you except the AIs' notes."
      : "Pass the phone for private screens. AI detectives decide on their own.";
    return '<section class="screen setup">' +
      '<div class="title-block"><div class="kicker">A game of evidence, odds and nerve</div><h1 class="neon flicker title">Interrogation</h1>' +
      '<p class="type">Hollywood, 1983. Someone killed a starlet on the set of <i>Drowning in Space</i>.</p></div>' +
      '<div class="panel"><h3>Detectives</h3><div class="row">' + counts + '<span class="muted">players · ' +
      D.TURNS_PER_ROUND[setup.count] + " turns per round</span></div>" +
      '<p class="muted small">Seat order: list detectives clockwise around the table. The first is the Lead Detective. Any seat can be an AI detective.</p>' +
      '<div class="grid seats">' + rows + '</div><p class="muted small">' + note + "</p></div>" +
      (people ? '<div class="panel"><h3>Choosing destinations</h3><div class="grid two">' +
      '<button class="choice' + (setup.pickMode === "phone" ? " selected" : "") + '" data-act="mode" data-arg="phone">' + A.locationIcon(4) + "<b>On the phone</b><small>Pass the phone; everyone picks in secret. Nothing else needed.</small></button>" +
      '<button class="choice' + (setup.pickMode === "dice" ? " selected" : "") + '" data-act="mode" data-arg="dice"><span class="die big">6</span><b>With dice</b><small>Everyone sets a die in secret and reveals together. Faster at a big table.</small></button>' +
      "</div></div>" +
      '<div class="panel"><label class="row check"><input type="checkbox" data-act="assist"' + (setup.assist ? " checked" : "") + ">" +
      "<span><b>Detective assist</b><br><span class=\"muted small\">Notebooks rank the top suspects for you. Easier, but less of the fun is yours.</span></span></label></div>" : "") +
      btn("start", people ? "Open the case" : "Watch the case", "primary block") +
      '<p class="center small"><a href="rules.html">Read the rules</a> · <a href="print/index.html">Printables</a></p></section>';
  }

  var setupAct = {
    count: function (arg) { setup.count = Number(arg); },
    mode: function (arg) { setup.pickMode = arg; },
    assist: function () { setup.assist = !setup.assist; },
    start: function () {
      var list = seats();
      S = E.newGame(list, { pickMode: setup.pickMode, assist: setup.assist }, newSeed());
      newTurnFlow();
      S.flow.tasks.unshift({ t: "briefing" });
      log("Case opened. " + list.length + " detectives on the case. Lead Detective: " + list[0].name + ".");
      settle();
    }
  };

  // ---------- chrome: header and overlays ----------

  function turnHeader() {
    return '<div class="turn-head"><span class="chip">Round ' + S.round + "</span>" +
      '<span class="chip">Turn ' + S.turn + " of " + E.turnsPerRound(S) + "</span>" +
      '<span class="chip lead">Lead: ' + name(S.lead) + "</span></div>";
  }

  function topBar() {
    return '<header class="topbar"><a class="brand" href="index.html" title="Home">' + A.locationIcon(4) + "</a>" +
      '<span class="top-status">Round ' + S.round + " · Turn " + S.turn + "</span><span class=\"spacer\"></span>" +
      '<button class="icon-btn" data-act="view" data-arg="lineup">Lineup</button>' +
      '<button class="icon-btn" data-act="view" data-arg="notebooks">Notebook</button>' +
      '<button class="icon-btn" data-act="view" data-arg="log">Log</button>' +
      '<button class="icon-btn" data-act="view" data-arg="menu" aria-label="Menu">☰</button></header>';
  }

  function renderOverlay() {
    if (!view) return "";
    var body = "";
    if (view === "lineup") {
      var pr = [0, 1, 2].map(function (c) {
        var r = S.pressReleases[c];
        return '<div class="press-mini"><span class="kicker">' + esc(D.CATEGORIES[c].name) + "</span>" +
          (r ? '<span class="attr-ic">' + A.attributeIcon(c, r.value) + "</span><b>" + attrName(c, r.value) + '</b><span class="muted small">by ' + names(r.by) + "</span>"
             : '<span class="muted">No release yet</span>') + "</div>";
      }).join("");
      body = "<h2>The lineup</h2><div class=\"press-row\">" + pr + "</div>" + suspectGrid({});
    } else if (view === "log") {
      body = "<h2>Case log</h2><ol class=\"log type\">" + S.log.slice().reverse().map(function (l) {
        return '<li><span class="chip">R' + l.r + "·T" + l.t + "</span> " + esc(l.m) + "</li>";
      }).join("") + "</ol>";
    } else if (view === "notebooks") {
      body = "<h2>Whose notebook?</h2><p class=\"muted\">Notebooks are private. The phone will ask to be passed.</p><div class=\"grid\">" +
        (spectator() ? S.players.map(function (p, pi) { return pi; }) : allHumans()).map(function (pi) { return btn("nb", name(pi), "block", pi); }).join("") + "</div>";
    } else if (view === "menu") {
      body = "<h2>Menu</h2><div class=\"grid\">" +
        '<a class="btn block" href="rules.html" target="_blank">Rules</a>' +
        '<a class="btn block" href="print/index.html" target="_blank">Printables</a>' +
        btn("view", "End the game and reveal the killer", "block", "confirm-end") +
        btn("view", "Start a new case", "block", "confirm-new") + "</div>";
    } else if (view === "confirm-new") {
      body = "<h2>Start a new case?</h2><p>This game will be lost for good.</p><div class=\"grid two\">" + btn("newgame", "Yes, new case", "primary") + btn("view", "Cancel", "", "menu") + "</div>";
    } else if (view === "confirm-end") {
      body = "<h2>Give up and reveal?</h2><p>The killer is revealed and the game is scored as it stands.</p><div class=\"grid two\">" + btn("reveal", "Reveal the killer", "primary") + btn("view", "Cancel", "", "menu") + "</div>";
    }
    return '<div class="sheet" role="dialog" aria-modal="true"><button class="close-x" data-act="view" data-arg="" aria-label="Close">✕</button>' + body + "</div>";
  }

  var globalAct = {
    open: function () { cur().open = true; },
    view: function (arg) { view = arg || null; },
    nb: function (arg) {
      view = null;
      cur().open = false; // never return to someone else's private screen
      S.flow.tasks.unshift({ t: "notebook", pi: Number(arg), entered: true });
    },
    newgame: function () { clearSave(); S = null; view = null; },
    spectnext: function () { done(); },
    reveal: function () { view = null; S.flow.tasks = [{ t: "gameover" }]; settle(); }
  };

  // ---------- render loop ----------

  function render() {
    if (!S) {
      app.innerHTML = renderSetup();
      overlay.innerHTML = "";
      document.body.classList.remove("in-game");
      return;
    }
    document.body.classList.add("in-game");
    var t = cur(), h = H[t.t];
    var audience = h.who ? humansIn(h.who(t)) : null;
    // With only one person at the table there is nobody to hide the screen from.
    if (audience && allHumans().length <= 1) t.open = true;
    var inner = audience && !t.open ? cover(t, audience) : t.autoDone && h.spectate ? spectate(t, h) : h.render(t);
    var noBar = t.t === "gameover" || audience && !t.open;
    app.innerHTML = (noBar ? "" : topBar()) + inner;
    overlay.innerHTML = renderOverlay();
    document.body.classList.toggle("private", !!(audience && audience.length && t.open));
  }

  function handle(el) {
    var act = el.getAttribute("data-act"), arg = el.getAttribute("data-arg");
    if (el.disabled || el.classList.contains("disabled")) return;
    var scrollTop = act === "pickh" || act === "accuse" || act === "attr" || act === "claim" || act === "set" || act === "toggle" || act === "count" || act === "mode";
    if (!S) {
      if (setupAct[act]) setupAct[act](arg);
    } else if (globalAct[act]) {
      globalAct[act](arg);
    } else {
      var t = cur(), h = H[t.t];
      if (h.act && h.act[act]) h.act[act](t, arg);
    }
    if (S) save();
    var y = window.scrollY;
    render();
    window.scrollTo(0, scrollTop ? y : 0);
  }

  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT") return;
    ev.preventDefault();
    handle(el);
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.matches('input[type="checkbox"][data-act]')) handle(el);
    if (S && el.matches('select[data-field="cat"]')) { cur().addCat = Number(el.value); save(); render(); }
    if (!S && el.matches("select[data-seat]")) { setup.kinds[Number(el.getAttribute("data-seat"))] = el.value; render(); }
  });
  document.addEventListener("input", function (ev) {
    var k = ev.target.getAttribute("data-name");
    if (k != null) setup.names[Number(k)] = ev.target.value;
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && view) { view = null; render(); }
  });

  // ---------- boot ----------

  S = load();
  if (S && (!S.flow || !S.flow.tasks || !S.flow.tasks.length || S.version !== 2)) S = null;
  // Never resume straight onto someone's private screen.
  if (S) { S.flow.tasks.forEach(function (t) { t.open = false; }); settle(); }
  render();
})();

/*
 * Interrogation — field kit app.
 * Every detective plays on his or her own phone. Phones never talk to each other:
 * the table says things out loud, and phones agree because they share a case number.
 * This phone knows only its own detective. Other detectives' moves are entered as
 * the table announces them (who else is here, cards played, trials called).
 */
(function () {
  "use strict";

  var D = window.GameData, E = window.Engine, A = window.Art, AI = window.AI, F = window.Field, V = window.Views;
  var SAVE_KEY = "interrogation.field.v1";
  var OPENED_KEY = "interrogation.field.opened";   // every case file this phone has opened; survives "New case"
  var S = null;         // this phone's game: an engine state with one detective, plus S.field
  var view = null;      // overlay: null | "lineup" | "notebook" | "menu" | "peek" | "confirm-new" | "confirm-end"
  var covered = false;  // privacy cover, raised whenever the phone is put down
  var app = document.getElementById("app");
  var overlay = document.getElementById("overlay");

  var esc = V.esc, btn = V.btn, loc = V.loc, attrName = V.attrName, timeName = V.timeName;

  // ---------- helpers ----------

  function f() { return S.field; }
  function tableSize() { return S.options.tableSize; }
  function leadSeat(round) { return (round - 1) % tableSize() + 1; }
  function seatName(seat) { return seat === f().seat ? "you" : "Seat " + seat; }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(F.strip(S))); } catch (e) { /* private mode: play on without saving */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY), s = raw ? JSON.parse(raw) : null;
      return s && s.field && s.version === 3 ? F.restore(s) : null;
    } catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  // Has this phone opened this case file before? Starting over shows on the badge.
  function markOpened(key) {
    var list = [];
    try { list = JSON.parse(localStorage.getItem(OPENED_KEY) || "[]"); } catch (e) { list = []; }
    var seen = list.indexOf(key) >= 0;
    if (!seen) {
      list.push(key);
      try { localStorage.setItem(OPENED_KEY, JSON.stringify(list.slice(-50))); } catch (e) { /* ignore */ }
    }
    return seen;
  }

  function newTurn() { return { stage: "donut", results: [] }; }

  // Add a report to the notebook unless it's already there. Returns the entry, or null.
  function recordReport(rep, hand, src) {
    if (S.notebooks[0].some(function (e) { return e.ev === rep.ev; })) return null;
    return E.record(S, 0, { round: rep.round, cat: rep.cat, value: rep.value, ev: rep.ev, code: rep.code, hand: hand, src: src });
  }

  // ---------- shared screen pieces ----------

  function topBar() {
    return '<header class="topbar"><a class="brand" href="index.html" title="Home">' + A.locationIcon(4) + "</a>" +
      '<span class="top-status">R' + S.round + " · T" + S.turn + "</span>" +
      '<span class="chip badge-chip" title="Your badge number">#' + f().badge + "</span>" +
      (f().reopened ? '<span class="chip warn" title="This phone opened this case file before">Reopened</span>' : "") +
      '<span class="spacer"></span>' +
      '<button class="icon-btn" data-act="view" data-arg="lineup">Lineup</button>' +
      '<button class="icon-btn" data-act="view" data-arg="notebook">Notebook</button>' +
      '<button class="icon-btn" data-act="hide" aria-label="Hide the screen" title="Hide the screen">◐</button>' +
      '<button class="icon-btn" data-act="view" data-arg="menu" aria-label="Menu">☰</button></header>';
  }

  function turnHeader() {
    var lead = leadSeat(S.round);
    return '<div class="turn-head"><span class="chip">Round ' + S.round + "</span>" +
      '<span class="chip">Turn ' + S.turn + " of " + E.turnsPerRound(S) + "</span>" +
      '<span class="chip lead">Lead: ' + (lead === f().seat ? "You" : "Seat " + lead) + "</span>" +
      '<span class="spacer"></span>' + (S.over ? "" : '<button class="chip-btn trial-btn" data-act="jury">Trial called</button>') + "</div>";
  }

  function evidence(rep, quote) { return V.evidenceCard(S, rep.n || nOf(rep), rep.cat, rep.value, quote, rep.round); }
  function nOf(rep) { return rep.cat === E.TIME_CAT ? 4 : rep.cat + 1; }

  function codeChip(code) { return '<span class="tip-code">' + esc(code) + "</span>"; }

  function verdictBlock(tr) {
    var v = tr.points[0];
    return '<div class="verdict-wrap">' + V.suspectHero(tr.suspect, "The defendant") +
      '<div class="verdict-stamp ' + (tr.guilty ? "guilty" : "innocent") + '">' + (tr.guilty ? "Guilty" : "Innocent") + "</div></div>" +
      (tr.guilty ? "" : '<p class="type">Suspect No.' + A.pad(tr.suspect + 1) + " walks free and is cleared for the rest of the game.</p>") +
      '<div class="panel"><div class="kicker">Your points from this trial</div><p class="big-num ' + (v >= 0 ? "pos" : "neg") + '">' + (v > 0 ? "+" : "") + v + "</p></div>";
  }

  // ---------- setup ----------

  var setup = { mode: null, players: 4, ramp: { start: D.RAMP.start, step: D.RAMP.step }, assist: false, name: "", code: "", seat: null, error: "" };

  function caseSummary(info) {
    if (!info) return '<span class="muted small">Eight characters, like 4KQ7-M2ZP.</span>';
    return '<span class="chip ok">' + info.players + " detectives · " + esc(V.rampName(info.ramp)) + (info.assist ? " · assist on" : "") + "</span>";
  }

  function renderSetup() {
    var head = '<div class="title-block"><div class="kicker">Field kit · every detective on his or her own phone</div><h1 class="neon flicker title">Interrogation</h1>' +
      '<p class="type">Hollywood, 1983. Someone killed a starlet on the set of <i>Drowning in Space</i>.</p></div>';
    var nameField = '<label class="field"><span class="muted small">Your name</span><input type="text" maxlength="16" data-field="name" placeholder="Detective" value="' + esc(setup.name) + '"></label>';
    if (!setup.mode) {
      return '<section class="screen setup">' + head +
        '<div class="grid two">' +
        '<button class="choice" data-act="mode" data-arg="open">' + A.locationIcon(4) + "<b>Open a new case</b><small>One detective opens the case and reads the case number out to the table.</small></button>" +
        '<button class="choice" data-act="mode" data-arg="join">' + A.locationIcon(6) + "<b>Join a case</b><small>Type in the case number you were given.</small></button></div>" +
        '<div class="panel tip"><p><b>How it works.</b> Every phone builds the same case from the case number. Each turn you pick a destination on your own phone, then everyone reveals together. ' +
        "Detectives at the same place hear the same witness. You trade notes by reading out short tip codes. Each phone keeps its own score, and you compare at the end.</p></div>" +
        '<p class="center small"><a href="play.html">Playing on one phone, passed around?</a> · <a href="rules.html#field">Rules</a></p></section>';
    }
    if (setup.mode === "open") {
      var counts = [3, 4, 5, 6].map(function (n) {
        return '<button class="die-btn' + (setup.players === n ? " selected" : "") + '" data-act="players" data-arg="' + n + '">' + n + "</button>";
      }).join("");
      return '<section class="screen setup">' + head +
        '<div class="panel"><h3>Open a new case</h3>' + nameField +
        '<div class="row">' + counts + '<span class="muted">detectives · ' + D.TURNS_PER_ROUND[setup.players] + " turns per round</span></div>" +
        '<p class="muted small">You are Seat 1 and the first Lead Detective. Number the other seats clockwise from you.</p></div>' +
        V.rampPanel(setup.ramp) +
        '<div class="panel"><label class="row check"><input type="checkbox" data-act="assist"' + (setup.assist ? " checked" : "") + ">" +
        "<span><b>Detective assist</b><br><span class=\"muted small\">Notebooks rank the top suspects. It's part of the case number, so everyone gets it or nobody does.</span></span></label></div>" +
        btn("open", "Open the case", "primary block") + btn("mode", "Back", "ghost block", "") + "</section>";
    }
    var info = F.parseCase(setup.code);
    var seats = "";
    if (info) {
      for (var k = 2; k <= info.players; k++)
        seats += '<button class="die-btn' + (setup.seat === k ? " selected" : "") + '" data-act="seat" data-arg="' + k + '">' + k + "</button>";
    }
    var ready = info && setup.seat && setup.seat <= info.players;
    return '<section class="screen setup">' + head +
      '<div class="panel"><h3>Join a case</h3>' +
      '<label class="field"><span class="muted small">Case number</span><input type="text" class="code-in" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" data-field="code" placeholder="XXXX-XXXX" value="' + esc(setup.code) + '"></label>' +
      '<div id="case-summary">' + caseSummary(info) + "</div>" + nameField +
      (info ? '<div><span class="muted small">Your seat, counting clockwise from the detective who opened the case (Seat 1)</span><div class="row">' + seats + "</div></div>" : "") +
      (setup.error ? '<p class="neg">' + esc(setup.error) + "</p>" : "") + "</div>" +
      btn("join", "Join the case", "primary block" + (ready ? "" : " disabled")) + btn("mode", "Back", "ghost block", "") + "</section>";
  }

  function startCase(info, seat) {
    var reopened = markOpened(info.code + "#" + seat);
    S = F.newCase(info, { name: setup.name.trim() || "Detective " + seat, seat: seat, badge: F.randomBadge(), reopened: reopened });
    f().stage = "briefing";
    f().turnState = newTurn();
  }

  var setupAct = {
    mode: function (arg) { setup.mode = arg || null; setup.error = ""; },
    players: function (arg) { setup.players = Number(arg); },
    assist: function () { setup.assist = !setup.assist; },
    ramp: function (arg) {
      var p = D.RAMP_PRESETS.filter(function (x) { return x.key === arg; })[0];
      if (p) setup.ramp = { start: p.start, step: p.step };
    },
    seat: function (arg) { setup.seat = Number(arg); },
    open: function () {
      var info = { seed: F.randomSeed(), players: setup.players, ramp: setup.ramp, assist: setup.assist };
      info.code = F.caseCode(info);
      startCase(F.parseCase(info.code), 1);
    },
    join: function () {
      var info = F.parseCase(setup.code);
      if (!info) { setup.error = "That case number doesn't check out. Ask for it again."; return; }
      if (!setup.seat || setup.seat > info.players) { setup.error = "Pick your seat."; return; }
      startCase(info, setup.seat);
    }
  };

  // ---------- game screens ----------

  var G = {};   // per-stage screens: { render, act }

  G.briefing = {
    render: function () {
      return '<section class="screen briefing">' +
        '<div class="kicker">Hollywood, 1983 · Case file 83-0417</div>' +
        '<h2 class="neon cyan big-title">The Body on Stage</h2>' +
        '<div class="panel center"><div class="kicker">Case number</div><div class="case-code">' + esc(f().code) + "</div>" +
        '<p class="muted small">' + (f().seat === 1 ? "Read it out. Everyone else taps <b>Join a case</b> and types it in." : "Check that it matches everyone else's.") + "</p>" +
        '<div class="row center-row"><span class="chip">Seat ' + f().seat + '</span><span class="chip badge-chip">Badge #' + f().badge + "</span><span class=\"chip\">" + plural(tableSize(), "detective") + "</span></div></div>" +
        '<p class="type">Rising star <b>Suzanne Macky</b> was murdered on the sound stages of E. F. Studios. Eyewitnesses disagree, the crime lab can only guess the hour, and forty-nine people had access to the lot. ' +
        "Find the killer before the nation stops caring.</p>" +
        '<div class="panel"><h3>Playing on your own phone</h3><ul class="tight">' +
        "<li><b>Say your badge number out loud now.</b> It stays the same all game. A phone that restarts the case gets a new one.</li>" +
        "<li>Everyone moves through each turn together. Wait for the table before tapping on.</li>" +
        "<li>Your phone only knows what you tell it. When it asks who else is at your location, or what was played there, answer honestly.</li>" +
        "<li>Trade by reading out tip codes. A code can't lie: the other phone looks the report up itself.</li>" +
        "<li>Your phone hides itself whenever you put it down. Tap ◐ to hide it yourself.</li></ul></div>" +
        '<div class="panel tip">' + V.rampSummary(S.options.ramp) + V.rampStrip(S.options.ramp) + "</div>" +
        btn("go", "Start round 1", "primary block") + "</section>";
    },
    act: { go: function () { f().stage = "turn"; } }
  };

  G.newround = {
    render: function () {
      var p = Math.round(E.reliability(S, S.round) * 100), lead = leadSeat(S.round);
      return '<section class="screen center round-banner"><div class="kicker">The investigation continues</div>' +
        '<h2 class="neon big-title flicker">Round ' + S.round + "</h2>" +
        '<div class="meter"><div class="meter-fill" style="width:' + p + '%"></div></div>' +
        "<p>Witnesses are now right <b>" + p + "%</b> of the time.</p>" +
        "<p>Lead Detective: <b>" + (lead === f().seat ? "You" : "Seat " + lead) + "</b></p>" +
        (S.round === D.CASE_ROUNDS ? '<p class="panel tip"><b>Last round.</b> If nobody convicts the killer this round, the case goes cold.</p>' : "") +
        btn("go", "Start round " + S.round, "primary block") + "</section>";
    },
    act: { go: function () { f().stage = "turn"; } }
  };

  G.hunch = {
    render: function () {
      var r = f().hunchRound, stake = E.hunchValue(S, 0, r), sel = f().hunchSel;
      return '<section class="screen"><div class="kicker">End of round ' + r + "</div><h2>Got a hunch?</h2>" +
        '<p>A correct hunch now is worth <b class="pos">' + stake + " points</b>. A wrong hunch scores nothing. " +
        (r < 6 ? "Pass, and half of it (" + stake / 2 + ") carries to your next hunch." : "This is the last hunch of the game.") + "</p>" +
        V.suspectGrid(S, { act: "pickh", selected: sel }) +
        '<div class="sticky-bar">' + btn("commit", "Hunch: No." + (sel != null ? A.pad(sel + 1) : "—"), "primary block" + (sel == null ? " disabled" : "")) +
        btn("pass", "Pass this round", "ghost block") + "</div></section>";
    },
    act: {
      pickh: function (arg) { f().hunchSel = Number(arg); },
      commit: function () { if (f().hunchSel == null) return; E.makeHunch(S, 0, f().hunchRound, f().hunchSel); afterHunch(); },
      pass: function () { E.makeHunch(S, 0, f().hunchRound, null); afterHunch(); }
    }
  };
  function afterHunch() {
    var r = f().hunchRound;
    f().hunchRound = null; f().hunchSel = null;
    roundOver(r);
  }
  function roundOver(ended) {
    if (ended >= D.CASE_ROUNDS) { S.over = true; f().cold = true; f().stage = "over"; }
    else f().stage = "newround";
  }

  function endTurn() {
    var ended = E.endTurn(S);
    f().turnState = newTurn();
    if (!ended) return;
    if (E.hunchRounds().indexOf(ended) >= 0) { f().stage = "hunch"; f().hunchRound = ended; }
    else roundOver(ended);
  }

  // ---------- a turn ----------

  function playable(t) {
    var n = t.dest;
    return S.hands[0].filter(function (c, i, arr) {
      if (arr.indexOf(c) !== i) return false;
      if (c === "strongarm" || c === "sirens") return n >= 1 && n <= 4;
      if (c === "donuts") return n !== 5 && t.others > 0;
      return false;
    });
  }

  G.turn = {
    render: function () {
      var t = f().turnState;
      return '<section class="screen">' + turnHeader() + TURN[t.stage](t) + "</section>";
    },
    act: {}
  };
  var TURN = {};

  TURN.donut = function () {
    var lead = leadSeat(S.round);
    return "<h2>Anyone for donuts?</h2>" +
      '<p class="muted">Starting with the Lead Detective (' + (lead === f().seat ? "you" : "Seat " + lead) + ") and going clockwise, say out loud whether you're heading to the <b>Donut Shop</b> to trade notes. Once you say it, you're committed.</p>" +
      '<div class="grid two">' +
      '<button class="choice" data-act="donut">' + A.locationIcon(5) + "<b>I'm going</b><small>Say it out loud first.</small></button>" +
      '<button class="choice" data-act="nodonut">' + A.locationIcon(1) + "<b>Not me</b><small>Pick somewhere else in secret.</small></button></div>";
  };
  G.turn.act.donut = function (t) { t.dest = 5; t.stage = "here"; };
  G.turn.act.nodonut = function (t) { t.stage = "pick"; };

  TURN.pick = function (t) {
    return "<h2>Where to?</h2>" +
      '<p class="muted">Pick in secret. Once you lock it in, it can\'t be changed.</p>' + V.locationChoices("pick", [5], t.sel) +
      btn("auto", "Investigate for me", "ghost block") +
      '<div class="sticky-bar">' + btn("lock", t.sel ? "Lock in: " + esc(loc(t.sel).name) : "Lock in", "primary block" + (t.sel ? "" : " disabled")) + "</div>";
  };
  G.turn.act.pick = function (t, arg) { t.sel = Number(arg); };
  G.turn.act.auto = function (t) { t.sel = AI.scout(S, 0); };
  G.turn.act.lock = function (t) { if (!t.sel) return; t.dest = t.sel; t.stage = "sealed"; };

  TURN.sealed = function () {
    return '<div class="folder sealed"><div class="stamp">Sealed</div><div class="kicker">Your destination is locked in</div>' +
      '<p>When every detective has locked in, turn your phones around together.</p>' + btn("unseal", "Reveal", "primary block") + "</div>";
  };
  G.turn.act.unseal = function (t) { t.stage = "here"; };

  TURN.here = function (t) {
    var n = t.dest, others = "";
    for (var k = 0; k < tableSize(); k++)
      others += '<button class="die-btn' + (t.others === k ? " selected" : "") + '" data-act="others" data-arg="' + k + '">' + k + "</button>";
    var toggles = "";
    if (t.others > 0 && n <= 4) toggles += toggle("sirens", t.sirens, "Someone else here played <i>Speed with Sirens</i>");
    if (t.others > 0 && n !== 5) toggles += toggle("donuts", t.donuts, "Someone else here played <i>A Box of Donuts</i>");
    var cards = t.others == null ? [] : playable(t);
    var hand = cards.length ? '<div class="kicker">Play one of your cards here?</div><div class="grid">' + cards.map(function (c) {
      return toggle("play", t.played === c, "Play <i>" + esc(D.CARDS[c].name) + "</i>", c);
    }).join("") + "</div>" : "";
    return '<div class="dest-card big flip" style="--c:' + A.LOCATION_COLORS[n - 1] + '"><div class="dest-ic">' + A.locationIcon(n) + "</div><div><div class=\"kicker\">You went to</div><b>" + esc(loc(n).name) + "</b></div></div>" +
      '<p class="muted small">Show the table.</p>' +
      "<h3>How many other detectives are here?</h3><div class=\"row\">" + others + "</div>" +
      (t.others != null ? '<p class="muted small">Anyone holding a card that can be played now says so out loud and plays it. Then tell your phone what happened here.</p>' : "") +
      toggles + hand +
      btn("go", "Continue", "primary block" + (t.others == null ? " disabled" : ""));
  };
  function toggle(act, on, label, arg) {
    return '<button class="toggle' + (on ? " on" : "") + '" data-act="' + act + '"' + (arg ? ' data-arg="' + arg + '"' : "") + "><span>" + label +
      '</span><span class="spacer"></span><span class="chip">' + (on ? "Yes" : "No") + "</span></button>";
  }
  G.turn.act.others = function (t, arg) {
    t.others = Number(arg);
    if (!t.others) { t.sirens = false; t.donuts = false; }
    if (t.played && playable(t).indexOf(t.played) < 0) t.played = null;
  };
  G.turn.act.sirens = function (t) { t.sirens = !t.sirens; };
  G.turn.act.donuts = function (t) { t.donuts = !t.donuts; };
  G.turn.act.play = function (t, c) { t.played = t.played === c ? null : c; };
  G.turn.act.go = function (t) {
    if (t.others == null) return;
    if (t.played) E.discard(S, 0, t.played);
    f().itinerary.push({ round: S.round, turn: S.turn, dest: t.dest, others: t.others, played: t.played || null });
    resolveLocation(t);
    t.stage = "result";
  };

  // What happens at this phone's location once destinations and cards are known.
  function resolveLocation(t) {
    var n = t.dest, r = S.round, tu = S.turn, me = f().badge;
    var blocked = t.sirens && t.played !== "sirens";
    t.results = [];
    function add(rep, quote) { rep.n = rep.cat === E.TIME_CAT ? 4 : rep.cat + 1; recordReport(rep, 1); t.results.push({ rep: rep, quote: quote }); }
    if (n <= 3 || n === 4 && t.others > 0) {
      if (blocked) t.blocked = true;
      else add(F.sample(S, r, tu, n), V.QUOTES[n]);
      if (t.played === "strongarm" && !blocked) add(F.sample(S, r, tu, n, me), "You lean on a witness a little harder. Just for you:");
    } else if (n === 4) {
      t.police = "choose";
      if (t.played === "strongarm") add(F.sample(S, r, tu, 4, me), "You lean on the lab a little harder. Just for you:");
    } else if (n === 5) {
      if (!t.others) {
        t.box = F.drawCard(S, D.DONUT_DECK, "box|" + r + "|" + tu + "|" + me);
        S.hands[0].push(t.box);
      } else t.trade = true;
    } else if (n === 6) t.pros = {};
    if (n !== 5 && t.others > 0 && (t.donuts || t.played === "donuts")) t.trade = true;
  }

  TURN.result = function (t) {
    var n = t.dest, html = "";
    t.results.forEach(function (x) { html += evidence(x.rep, x.quote); });
    if (t.blocked) html += '<div class="panel"><p class="type">Sirens wail. By the time you get through the crowd, the witnesses at the ' + esc(loc(n).name) + " have scattered. Nothing for you this turn.</p></div>";
    if (t.police) html += policeView(t);
    if (t.box) html += "<h2>Donut Shop</h2><p class=\"muted\">Nobody else showed up, so you grab a box for later.</p>" + V.cardFace(t.box);
    if (t.pros) html += prosecutorView(t);
    if (t.trade) html += tradeView(t);
    var busy = t.police === "choose" || t.police === "card" && cardBusy(t) || t.pros && prosBusy(t.pros);
    return html + (busy ? "" : btn("next", S.turn < E.turnsPerRound(S) ? "Done. Next turn" : "Done. End of round " + S.round, "primary block")) +
      (busy ? "" : '<p class="muted small center">Wait until the whole table is done.</p>');
  };
  G.turn.act.next = function () { endTurn(); };

  // ---------- police station ----------

  function policeView(t) {
    if (t.police === "choose") {
      return "<h2>Police Station</h2><p class=\"muted\">You have the station to yourself. Choose one:</p><div class=\"grid two\">" +
        '<button class="choice" data-act="lab">' + A.clock(null) + "<b>Crime Lab</b><small>Get an estimate of the hour of death.</small></button>" +
        '<button class="choice" data-act="draw">' + A.locationIcon(4) + "<b>Action Card</b><small>Draw one from the deck.</small></button></div>";
    }
    if (t.police !== "card") return "";
    var c = t.card, html = '<div class="kicker">You drew</div>' + V.cardFace(c);
    if (c === "peek") {
      return html + "<h3>Whose notes?</h3><p>Pick a detective. He or she opens <b>☰ → Steal a Peek</b> and reads you two tip codes.</p>" +
        tipInput(t, 2 - (t.peekGot || 0)) + (t.peekGot >= 2 || t.peekDone ? "" : btn("peekdone", "He or she had nothing to show", "ghost block"));
    }
    if (c === "lunch") {
      if (t.lunch == null) return html + "<h3>Join which location?</h3>" + V.locationChoices("join", [4]);
      return html + '<p class="type">You join the ' + esc(loc(t.lunch).name) + " for the rest of this turn.</p>";
    }
    if (c === "compliment") return html + '<p class="muted">Keep it. It scores at the end of the game.</p>';
    return html + '<p class="muted">It\'s in your hand. Play it on a later turn, after destinations are revealed.</p>';
  }
  function cardBusy(t) {
    if (t.card === "peek") return !(t.peekGot >= 2 || t.peekDone);
    if (t.card === "lunch") return t.lunch == null;
    return false;
  }
  G.turn.act.lab = function (t) {
    if (t.police !== "choose") return;
    t.police = "lab";
    var rep = F.sample(S, S.round, S.turn, 4);
    rep.n = 4; recordReport(rep, 1);
    t.results.push({ rep: rep, quote: V.QUOTES[4] });
  };
  G.turn.act.draw = function (t) {
    if (t.police !== "choose") return;
    t.police = "card";
    t.card = F.drawCard(S, D.ACTION_DECK, "action|" + S.round + "|" + S.turn + "|" + f().badge);
    if (D.CARDS[t.card].when !== "draw") S.hands[0].push(t.card);
  };
  G.turn.act.peekdone = function (t) { t.peekDone = true; };
  G.turn.act.join = function (t, arg) {
    if (t.lunch != null) return;
    var n = Number(arg);
    t.lunch = n;
    f().itinerary[f().itinerary.length - 1].lunch = n;
    if (n <= 3) {
      var rep = F.sample(S, S.round, S.turn, n);
      rep.n = n; recordReport(rep, 1);
      t.results.push({ rep: rep, quote: "You catch the tail end of the interview:" });
    } else if (n === 5) t.trade = true;
    else if (n === 6) t.pros = {};
  };

  // ---------- trading by tip code ----------

  function tipInput(t, limit) {
    var msg = t.tipMsg ? '<p class="' + (t.tipMsg.ok ? "pos" : "neg") + '">' + t.tipMsg.text + "</p>" : "";
    var got = (t.received || []).map(function (e) { return V.entryLine(e); }).join("");
    if (limit != null && limit <= 0) return (got ? '<div class="grid">' + got + "</div>" : "") + msg;
    return '<div class="panel"><div class="kicker">Receive a tip</div><div class="tip-row">' +
      '<input type="text" id="tip-in" class="code-in" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Tip code">' +
      btn("tip", "Add", "primary") + "</div>" + msg +
      (got ? '<div class="grid">' + got + "</div>" : "") + "</div>";
  }

  function tradeView(t) {
    var mine = V.uniqueEntries(S.notebooks[0]).slice().reverse();
    var share = mine.length ? mine.map(function (e) {
      var open = (t.showing || []).indexOf(e.ev) >= 0;
      return '<button class="pick-entry' + (open ? " selected" : "") + '" data-act="show" data-arg="' + esc(e.ev) + '">' + V.entryLine(e).replace('<span class="spacer"></span>', '<span class="spacer"></span>' + (open ? codeChip(e.code) : "")) + "</button>";
    }).join("") : '<p class="muted">Nothing in your notebook yet.</p>';
    return '<div class="row"><span class="loc-ic">' + A.locationIcon(5) + "</span><h2>Trade time</h2></div>" +
      "<p>Negotiate out loud, in pairs or as a group. You can't attach conditions or promise future information. " +
      "<b>No bluffing:</b> you share by reading out a report's tip code, and the other phone looks the report up for itself.</p>" +
      '<div class="panel"><div class="kicker">Share: tap a report to show its code</div><div class="grid">' + share + "</div></div>" +
      tipInput(t);
  }
  G.turn.act.show = function (t, ev) {
    t.showing = t.showing || [];
    var i = t.showing.indexOf(ev);
    if (i >= 0) t.showing.splice(i, 1); else t.showing.push(ev);
  };
  G.turn.act.tip = function (t) {
    var el = document.getElementById("tip-in"), res = F.readTip(S, el ? el.value : "");
    if (res.error) { t.tipMsg = { ok: false, text: esc(res.error) }; return; }
    var e = recordReport(res.report, 2, "tip");
    if (!e) { t.tipMsg = { ok: false, text: "You already have that report." }; return; }
    t.received = (t.received || []).concat([e]);
    if (t.card === "peek" && t.police === "card") t.peekGot = (t.peekGot || 0) + 1;
    t.tipMsg = { ok: true, text: "Added to your notebook as second-hand information, in the round it was gathered." };
  };

  // ---------- prosecutor's office ----------

  function openCategories() { return [0, 1, 2].filter(function (c) { return E.canRelease(S, 0, c); }); }

  function prosecutorView(t) {
    var p = t.pros, open = openCategories();
    if (!p.stage) {
      return "<h2>Prosecutor's Office</h2><p class=\"muted\">Choose one:</p><div class=\"grid two\">" +
        '<button class="choice" data-act="kind" data-arg="press"' + (open.length ? "" : " disabled") + ">" + A.locationIcon(6) +
        "<b>Press Release</b><small>" + (open.length ? "Announce one attribute of the killer. +10 if right, −5 if wrong. You get one per attribute." : "You've made all three of your press releases.") + "</small></button>" +
        '<button class="choice" data-act="kind" data-arg="name">' + A.locationIcon(4) + "<b>Name the Perpetrator</b><small>Take a suspect to trial. +12 if guilty, −10 if innocent.</small></button></div>" +
        btn("kind", "Neither this turn", "ghost block", "done");
    }
    if (p.stage === "press") {
      var cats = open.map(function (c) {
        return "<h3>" + esc(D.CATEGORIES[c].name) + '</h3><div class="attr-grid">' + D.CATEGORIES[c].values.map(function (v, k) {
          var sel = p.cat === c && p.value === k;
          return '<button class="attr-btn' + (sel ? " selected" : "") + '" data-act="attr" data-arg="' + c + ":" + k + '">' +
            '<span class="attr-ic">' + A.attributeIcon(c, k) + "</span>" + esc(D.CATEGORIES[c].short[k]) + "</button>";
        }).join("") + "</div>";
      }).join("");
      return "<h2>Press release</h2><p class=\"muted\">Pick the one attribute you'll announce.</p>" + cats +
        btn("release", "Submit press release", "primary block" + (p.cat == null ? " disabled" : "")) + btn("kind", "Back", "ghost block", "");
    }
    if (p.stage === "name") {
      return "<h2>Name the perpetrator</h2><p class=\"muted\">Tap the suspect you will prosecute. Once you submit, the trial goes ahead.</p>" +
        V.suspectGrid(S, { act: "accuse", selected: p.suspect }) +
        '<div class="sticky-bar">' + btn("accuse-go", "Name No." + (p.suspect != null ? A.pad(p.suspect + 1) : "—"), "primary block" + (p.suspect == null ? " disabled" : "")) +
        btn("kind", "Back", "ghost block", "") + "</div>";
    }
    if (p.stage === "shared") {
      var opts = "";
      for (var k = 0; k <= t.others; k++)
        opts += '<button class="die-btn' + (p.co === k ? " selected" : "") + '" data-act="co" data-arg="' + k + '">' + k + "</button>";
      return V.suspectHero(p.suspect, "You charged") + "<h3>Did anyone else here name the same suspect this turn?</h3>" +
        '<p class="muted small">Everyone at the Prosecutor\'s Office reveals together. Prosecutors who name the same suspect share one trial and split the points.</p>' +
        '<div class="row">' + opts + "</div>" + btn("co-go", "Continue", "primary block" + (p.co == null ? " disabled" : ""));
    }
    if (p.stage === "claim") {
      return '<div class="kicker">The People v. Suspect No.' + A.pad(p.suspect + 1) + "</div>" + V.suspectHero(p.suspect, "The defendant") +
        '<div class="panel"><p><b>Make your case.</b> Tell the table the suspect number and state your evidence for each attribute. Every other detective taps <b>Trial called</b> on his or her phone.</p>' +
        "<p>Then name the hour of the crime" + (p.co ? " (agree on it with your co-prosecutor" + (p.co > 1 ? "s" : "") + ")" : "") + ".</p>" +
        V.clockPicker("claim", p.claimed) + "</div>" +
        btn("alibi", "Check the alibi", "primary block" + (p.claimed == null ? " disabled" : ""));
    }
    if (p.stage === "alibi") {
      return '<div class="kicker">The People v. Suspect No.' + A.pad(p.suspect + 1) + "</div>" + V.suspectHero(p.suspect, "The defendant") +
        alibiPanels(p.suspect, p.claimed) +
        '<p class="muted">The jury votes on their own phones. When every juror has locked in a vote, read the verdict together.</p>' +
        btn("verdict", "Every juror has voted. Read the verdict", "primary block");
    }
    if (p.stage === "verdict") return verdictBlock(p.trial) + (p.trial.guilty ? btn("close", "Close the case", "primary block") : "");
    if (p.stage === "released") {
      var r = p.release;
      return '<div class="press pop"><div class="press-head">EXTRA! EXTRA!</div><div class="press-body"><span class="attr-ic big">' + A.attributeIcon(r.cat, r.value) + "</span><div>" +
        '<div class="kicker">Police say the killer\'s ' + esc(D.CATEGORIES[r.cat].name.toLowerCase()) + " is</div>" +
        '<div class="press-value">' + attrName(r.cat, r.value) + '</div><div class="muted">Read it out to the table. It\'s scored at the end of the game.</div></div></div></div>';
    }
    return "";
  }

  function alibiPanels(suspect, claimed) {
    var alibi = S.alibis[suspect];
    return '<div class="grid two">' +
      (claimed != null ? '<div class="panel center"><div class="kicker">Prosecution says the crime was at</div><div class="clock-lg">' + A.clock(claimed) + "</div><b>" + esc(timeName(claimed)) + "</b></div>" : "") +
      '<div class="panel center pop"><div class="kicker">Alibi: the defendant signed out at</div><div class="clock-lg">' + A.clock(alibi) + "</div><b>" + esc(timeName(alibi)) + "</b></div></div>" +
      '<p class="muted small">The killer slipped back onto the lot 1 to 16 hours after signing out, most often 8 or 9. If the crime happened at the hour the defendant signed out, or in the 7 hours before it, the defendant is innocent.</p>';
  }

  G.turn.act.kind = function (t, arg) {
    var p = t.pros;
    if (arg === "done") { p.stage = "done"; return; }
    p.stage = arg || null; p.cat = null; p.value = null; p.suspect = null;
  };
  G.turn.act.attr = function (t, arg) { var x = arg.split(":"); t.pros.cat = Number(x[0]); t.pros.value = Number(x[1]); };
  G.turn.act.release = function (t) {
    var p = t.pros;
    if (p.cat == null) return;
    var res = E.resolvePressReleases(S, [{ pi: 0, cat: p.cat, value: p.value }]);
    if (!res.made.length) return;
    p.release = res.made[0];
    p.stage = "released";
  };
  G.turn.act.accuse = function (t, arg) { t.pros.suspect = Number(arg); };
  G.turn.act["accuse-go"] = function (t) {
    if (t.pros.suspect == null) return;
    t.pros.stage = t.others > 0 ? "shared" : "claim";
    t.pros.co = t.others > 0 ? null : 0;
  };
  G.turn.act.co = function (t, arg) { t.pros.co = Number(arg); };
  G.turn.act["co-go"] = function (t) { if (t.pros.co != null) t.pros.stage = "claim"; };
  G.turn.act.claim = function (t, arg) { t.pros.claimed = Number(arg); };
  G.turn.act.alibi = function (t) { if (t.pros.claimed != null) t.pros.stage = "alibi"; };
  G.turn.act.verdict = function (t) {
    var p = t.pros;
    if (p.stage !== "alibi") return;
    p.trial = F.trial(S, p.suspect, "prosecutor", { shared: p.co + 1, claimed: p.claimed });
    p.stage = "verdict";
  };
  G.turn.act.close = function () { f().stage = "over"; };

  // The office holds up the end of the turn until a choice is made and any trial is over.
  function prosBusy(p) {
    if (p.stage === "verdict") return p.trial.guilty;
    return p.stage !== "done" && p.stage !== "released";
  }

  // ---------- jury duty ----------
  // Someone else took a suspect to trial. Every detective who isn't prosecuting votes.

  function juryView() {
    var j = f().jury;
    if (j.stage === "pick") {
      return '<section class="screen trial"><h2>Trial called</h2><p class="muted">Tap the suspect the prosecution named.</p>' +
        V.suspectGrid(S, { act: "jpick", selected: j.suspect }) +
        '<div class="sticky-bar">' + btn("jgo", "The defendant is No." + (j.suspect != null ? A.pad(j.suspect + 1) : "—"), "primary block" + (j.suspect == null ? " disabled" : "")) +
        btn("jcancel", "Cancel", "ghost block") + "</div></section>";
    }
    var head = '<section class="screen trial"><div class="kicker">The People v. Suspect No.' + A.pad(j.suspect + 1) + "</div>";
    if (j.stage === "vote") {
      return head + V.suspectHero(j.suspect, "The defendant") + alibiPanels(j.suspect, null) +
        '<p>Listen to the prosecution\'s evidence and the hour it names, then vote. <span class="muted small">Guilty: +6 if the defendant did it, −4 if not. Not guilty: −4 if the defendant did it, +4 if not.</span></p>' +
        '<div class="grid two">' + btn("jvote", "Guilty", "primary", "1") + btn("jvote", "Not guilty", "", "0") + "</div></section>";
    }
    if (j.stage === "wait") {
      return head + V.suspectHero(j.suspect, "The defendant") +
        '<div class="panel center"><div class="kicker">Your vote is locked in</div><p class="big-num">' + (j.vote ? "Guilty" : "Not guilty") + "</p></div>" +
        '<p class="muted">When every juror has voted, read the verdict together.</p>' + btn("jverdict", "Read the verdict", "primary block") + "</section>";
    }
    return head + verdictBlock(j.trial) + btn("jdone", j.trial.guilty ? "Close the case" : "Back to work", "primary block") + "</section>";
  }

  var juryAct = {
    jury: function () { if (!S.over) f().jury = { stage: "pick" }; },
    jpick: function (arg) { f().jury.suspect = Number(arg); },
    jgo: function () { if (f().jury.suspect != null) f().jury.stage = "vote"; },
    jcancel: function () { f().jury = null; },
    jvote: function (arg) { f().jury.vote = arg === "1"; f().jury.stage = "wait"; },
    jverdict: function () {
      var j = f().jury;
      if (j.stage !== "wait") return;
      j.trial = F.trial(S, j.suspect, "juror", { vote: j.vote });
      j.stage = "verdict";
    },
    jdone: function () {
      var guilty = f().jury.trial.guilty;
      f().jury = null;
      if (guilty) f().stage = "over";
    }
  };

  // ---------- game over ----------

  G.over = {
    render: function () {
      var row = E.finalScores(S).rows[0], caught = S.trials.some(function (t) { return t.guilty; });
      var hunches = Object.keys(S.hunches[0].made).map(function (r) {
        var h = S.hunches[0].made[r];
        return h.suspect === null ? "R" + r + ": pass" : "R" + r + ": No." + A.pad(h.suspect + 1) + (h.suspect === S.perp ? " ✓" : "");
      }).join(", ");
      var press = S.pressReleases.map(function (r) {
        var right = r.value === D.SUSPECTS[S.perp][r.cat];
        return "<li>" + esc(D.CATEGORIES[r.cat].name) + ": " + attrName(r.cat, r.value) + " (R" + r.round + ') <b class="' + (right ? "pos" : "neg") + '">' + (right ? "right" : "wrong") + "</b></li>";
      }).join("");
      var trials = S.trials.map(function (t) {
        return "<li>R" + t.round + ": No." + A.pad(t.suspect + 1) + ", " + (t.role === "prosecutor" ? "you prosecuted" + (t.shared ? " (shared " + t.shared + " ways)" : "") : "you voted " + (t.votes[0] ? "guilty" : "not guilty")) +
          ' <b class="' + (t.points[0] >= 0 ? "pos" : "neg") + '">' + (t.points[0] > 0 ? "+" : "") + t.points[0] + "</b></li>";
      }).join("");
      return '<section class="screen gameover"><div class="kicker">' + (caught ? "Case closed" : f().cold ? "The case went cold. The nation stopped caring." : "Case abandoned") + "</div>" +
        '<h2 class="neon big-title">Your total: ' + row.total + "</h2>" +
        '<div class="panel table-wrap"><table class="scores"><thead><tr><th>Hunch</th><th>Press</th><th>Trial</th><th>Votes</th><th>Chief</th><th>Total</th></tr></thead><tbody><tr>' +
        "<td>" + row.hunch + "</td><td>" + row.press + "</td><td>" + row.prosecution + "</td><td>" + row.votes + "</td><td>" + row.compliment + "</td><td><b>" + row.total + "</b></td></tr></tbody></table>" +
        '<p class="muted small">Read out your total. Highest score gets the promotion. Ties go to the detective with the most evidence: you have <b>' + plural(row.evidence, "report") + "</b>.</p>" +
        (hunches ? '<p class="muted small">Hunches: ' + hunches + "</p>" : "") +
        (press ? '<ul class="tight small">' + press + "</ul>" : "") + (trials ? '<ul class="tight small">' + trials + "</ul>" : "") + "</div>" +
        '<div class="panel center"><div class="kicker">Case seal</div><div class="case-code">' + F.seal(S) + "</div>" +
        '<p class="muted small">Every phone at the table should show the same seal. One that doesn\'t took part in a trial nobody else saw. ' +
        "Badge <b>#" + f().badge + "</b> should match the number this detective announced at the start." +
        (f().reopened ? ' <b class="neg">This phone opened this case file more than once.</b>' : "") + "</p></div>" +
        '<div class="verdict-wrap">' + V.suspectHero(S.perp, caught ? "The killer" : "The killer, still at large") +
        '<div class="verdict-stamp ' + (caught ? "guilty" : "innocent") + '">' + (caught ? "Guilty" : "At large") + "</div></div>" +
        '<div class="grid two"><div class="panel center"><div class="kicker">Hour of the crime</div><div class="clock-lg">' + A.clock(S.crimeTime) + "</div><b>" + esc(timeName(S.crimeTime)) + "</b></div>" +
        '<div class="panel center"><div class="kicker">The killer signed out at</div><div class="clock-lg">' + A.clock(S.alibis[S.perp]) + "</div><b>" + esc(timeName(S.alibis[S.perp])) + "</b></div></div>" +
        itinerary() +
        btn("again", "New case", "primary block") + "</section>";
    },
    act: { again: function () { clearSave(); S = null; view = null; setup.mode = null; } }
  };

  // Where this detective went, turn by turn, for the table to check against what was announced.
  function itinerary() {
    var rounds = {};
    f().itinerary.forEach(function (x) { (rounds[x.round] = rounds[x.round] || []).push(x); });
    var rows = Object.keys(rounds).map(function (r) {
      return "<tr><td>R" + r + "</td><td>" + rounds[r].map(function (x) {
        return '<span class="it-stop" title="' + esc(loc(x.dest).name) + '">' + A.locationIcon(x.dest) + (x.lunch ? "<small>+" + x.lunch + "</small>" : "") + "</span>";
      }).join("") + "</td></tr>";
    }).join("");
    return rows ? '<div class="panel"><div class="kicker">Your legwork</div><table class="itinerary">' + rows + "</table></div>" : "";
  }

  // ---------- overlays ----------

  function renderOverlay() {
    if (!view || !S) return "";
    var body = "";
    if (view === "lineup") {
      var pr = S.pressReleases.map(function (r) {
        return '<div class="press-line"><span class="attr-ic">' + A.attributeIcon(r.cat, r.value) + "</span><b>" + attrName(r.cat, r.value) + '</b> <span class="muted small">your release · R' + r.round + "</span></div>";
      }).join("");
      body = "<h2>The lineup</h2>" + (pr ? '<div class="panel">' + pr + "</div>" : "") +
        '<p class="muted small">Cleared suspects are faded. Note other detectives\' press releases on paper if you like.</p>' + V.suspectGrid(S, {});
    } else if (view === "notebook") {
      var recent = S.notebooks[0].slice(-10).reverse().map(V.entryLine).join("");
      body = "<h2>Your notebook</h2>" + V.notebookGrid(S, 0) + (S.options.assist ? V.assistPanel(S, 0) : "") +
        (recent ? '<h3>Latest entries</h3><div class="grid">' + recent + "</div>" : "");
    } else if (view === "peek") {
      var two = F.peekPick(S), from = Math.max(1, S.round - 1);
      body = "<h2>Steal a Peek</h2><p>Someone played <i>Steal a Peek</i> on you. Read these tip codes out to that detective, and no one else.</p>" +
        (two.length ? '<div class="grid">' + two.map(function (e) {
          return '<div class="entry-code">' + V.entryLine(e) + codeChip(e.code) + "</div>";
        }).join("") + "</div>" : '<p class="muted">You have no first-hand information from round ' + from + '. Say so: there\'s nothing to see.</p>') +
        '<p class="muted small">Two of your first-hand reports from round ' + from + ", picked at random.</p>";
    } else if (view === "menu") {
      body = "<h2>Menu</h2><div class=\"grid\">" +
        btn("view", "Steal a Peek was played on me", "block", "peek") +
        '<a class="btn block" href="rules.html#field" target="_blank">Rules</a>' +
        btn("view", "Close the case and reveal the killer", "block", "confirm-end") +
        btn("view", "Start a new case", "block", "confirm-new") + "</div>" +
        '<p class="muted small">Case ' + esc(f().code) + " · Seat " + f().seat + " · Badge #" + f().badge + "</p>";
    } else if (view === "confirm-new") {
      body = "<h2>Start a new case?</h2><p>This game will be lost for good.</p><div class=\"grid two\">" + btn("newgame", "Yes, new case", "primary") + btn("view", "Cancel", "", "menu") + "</div>";
    } else if (view === "confirm-end") {
      body = "<h2>Close the case?</h2><p>Only when the whole table agrees to stop. Your phone reveals the killer and scores your game as it stands, and you can't go back.</p><div class=\"grid two\">" +
        btn("reveal", "Reveal the killer", "primary") + btn("view", "Cancel", "", "menu") + "</div>";
    }
    return '<div class="sheet" role="dialog" aria-modal="true"><button class="close-x" data-act="view" data-arg="" aria-label="Close">✕</button>' + body + "</div>";
  }

  function coverScreen() {
    return '<section class="cover"><div class="folder"><div class="stamp">Confidential</div>' +
      '<div class="kicker">Field kit · Seat ' + f().seat + "</div>" +
      '<h2 class="cover-name">Badge #' + f().badge + "</h2>" +
      '<p class="muted">' + esc(S.players[0].name) + "'s case file. Hands off, detectives.</p>" +
      btn("uncover", "Open my file", "primary block") + "</div></section>";
  }

  var globalAct = {
    view: function (arg) { view = arg || null; },
    hide: function () { covered = true; view = null; },
    uncover: function () { covered = false; },
    newgame: function () { clearSave(); S = null; view = null; setup.mode = null; },
    reveal: function () { view = null; f().jury = null; f().stage = "over"; }
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
    if (covered) { app.innerHTML = coverScreen(); overlay.innerHTML = ""; return; }
    var stage = f().stage;
    var inner = f().jury && stage === "turn" ? juryView() : G[stage].render();
    app.innerHTML = (stage === "over" ? "" : topBar()) + inner;
    overlay.innerHTML = renderOverlay();
  }

  var KEEP_SCROLL = ["pick", "pickh", "accuse", "attr", "claim", "jpick", "others", "sirens", "donuts", "play", "show", "co", "players", "ramp", "seat", "tip"];

  function handle(el) {
    var act = el.getAttribute("data-act"), arg = el.getAttribute("data-arg");
    if (el.disabled || el.classList.contains("disabled")) return;
    if (!S) {
      if (setupAct[act]) setupAct[act](arg);
    } else if (globalAct[act]) {
      globalAct[act](arg);
    } else if (juryAct[act]) {
      juryAct[act](arg);
    } else {
      var g = G[f().stage];
      if (f().stage === "turn" && G.turn.act[act]) G.turn.act[act](f().turnState, arg);
      else if (g.act && g.act[act]) g.act[act](arg);
    }
    if (S) save();
    var y = window.scrollY;
    render();
    window.scrollTo(0, KEEP_SCROLL.indexOf(act) >= 0 ? y : 0);
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
    if (!S && el.matches("select[data-ramp]")) { setup.ramp[el.getAttribute("data-ramp")] = Number(el.value); var y = window.scrollY; render(); window.scrollTo(0, y); }
  });
  document.addEventListener("input", function (ev) {
    var k = ev.target.getAttribute("data-field");
    if (k === "name") setup.name = ev.target.value;
    if (k === "code") {
      // Update the summary and seat buttons without stealing focus from the box.
      var before = !!F.parseCase(setup.code);
      setup.code = ev.target.value;
      setup.error = "";
      var info = F.parseCase(setup.code);
      if (!!info !== before) {
        if (setup.seat && info && setup.seat > info.players) setup.seat = null;
        render();
        var box = app.querySelector('[data-field="code"]');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      }
    }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && view) { view = null; render(); }
    if (ev.key === "Enter" && ev.target.id === "tip-in") { ev.preventDefault(); handle(app.querySelector('[data-act="tip"]')); }
  });
  // Put the phone down and the file closes itself.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && S && !covered) { covered = true; view = null; render(); }
  });

  // ---------- boot ----------

  S = load();
  if (S && S.field.stage !== "over" && S.field.stage !== "briefing") covered = true;
  render();
})();

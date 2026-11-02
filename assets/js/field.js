/*
 * Interrogation — field kit rules.
 * In the field kit every detective plays on his or her own phone, with no network.
 * One case number, read aloud at the table, carries the seed and settings, so every
 * phone builds the same case. Every witness report is drawn from the case seed plus
 * the request itself (round, turn, location), so detectives at the same place hear the
 * same thing, asking again never gives a new answer, and a report can be handed to
 * another phone as a short tip code. Works as a browser global (window.Field) or a Node module.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"), require("./engine.js"));
  else root.Field = factory(root.GameData, root.Engine);
})(typeof self !== "undefined" ? self : this, function (D, E) {
  "use strict";

  // Crockford's base 32: no I, L, O or U, so codes are easy to read aloud.
  var ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  var SEED_BITS = 20;

  // FNV-1a, then the murmur3 finalizer so neighboring keys scatter.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function bitsOf(n, width) {
    var s = (n >>> 0).toString(2);
    while (s.length < width) s = "0" + s;
    return s.slice(-width);
  }
  function encode(bits) {
    while (bits.length % 5) bits += "0";
    var out = "";
    for (var i = 0; i < bits.length; i += 5) out += ALPHA[parseInt(bits.substr(i, 5), 2)];
    return out;
  }
  // Forgiving about case, spaces, dashes and look-alike letters.
  function normalize(code) {
    return String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  }
  function decode(code) {
    var bits = "";
    for (var i = 0; i < code.length; i++) {
      var k = ALPHA.indexOf(code[i]);
      if (k < 0) return null;
      bits += bitsOf(k, 5);
    }
    return bits;
  }
  function read(bits, at, width) { return parseInt(bits.substr(at, width), 2); }
  function pretty(code) { return code.length > 5 ? code.slice(0, 4) + "-" + code.slice(4) : code; }

  // ---------- case numbers ----------

  // 20-bit seed, table size, ramp and assist, then a 10-bit check: 8 characters.
  function caseCode(info) {
    var payload = bitsOf(info.seed, SEED_BITS) + bitsOf(info.players - 3, 2) +
      bitsOf(D.RAMP_STARTS.indexOf(info.ramp.start), 4) + bitsOf(D.RAMP_STEPS.indexOf(info.ramp.step), 3) +
      (info.assist ? "1" : "0");
    return pretty(encode(payload + bitsOf(hash("case|" + payload), 10)));
  }

  function parseCase(code) {
    var c = normalize(code);
    if (c.length !== 8) return null;
    var bits = decode(c), payload = bits.substr(0, 30);
    if (read(bits, 30, 10) !== (hash("case|" + payload) & 1023)) return null;
    var start = D.RAMP_STARTS[read(bits, 22, 4)], step = D.RAMP_STEPS[read(bits, 26, 3)];
    if (start == null || step == null) return null;
    return { code: pretty(c), seed: read(bits, 0, SEED_BITS), players: read(bits, 20, 2) + 3,
             ramp: { start: start, step: step }, assist: bits[29] === "1" };
  }

  function randomSeed() {
    var n = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    return n & ((1 << SEED_BITS) - 1);
  }
  // Badge numbers are 100-999. A new badge every time a phone joins, so a detective who
  // quietly restarts the case shows up with a different number.
  function randomBadge() {
    var n = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    return 100 + n % 900;
  }

  // ---------- the case on one phone ----------

  function engineSeed(seed) { return hash("interrogation|" + seed); }

  // An engine game with one detective, this phone's. Every phone with the same case number
  // gets the same killer, crime hour and alibis.
  function newCase(info, me) {
    var s = E.newGame([{ name: me.name }], { ramp: info.ramp, assist: info.assist, tableSize: info.players }, engineSeed(info.seed));
    s.field = { code: info.code, seat: me.seat, badge: me.badge, reopened: !!me.reopened, itinerary: [] };
    return s;
  }

  // The answer is never written to storage: a saved game is rebuilt from its seed on load.
  var SECRET = ["perp", "crimeTime", "alibis", "actionDeck", "donutDeck"];
  function strip(state) {
    var out = {};
    Object.keys(state).forEach(function (k) { if (SECRET.indexOf(k) < 0) out[k] = state[k]; });
    return out;
  }
  function restore(saved) {
    var fresh = E.newGame([{ name: "" }], saved.options, saved.seed);
    SECRET.forEach(function (k) { saved[k] = fresh[k]; });
    return saved;
  }

  // ---------- witness reports ----------

  function sampleKey(round, turn, n, badge) {
    return "r" + round + "t" + turn + "n" + n + (badge != null ? "b" + badge : "");
  }

  // The report at location n (1-3 witnesses, 4 crime lab) in a given round and turn. Everyone
  // there hears the same thing. A Strong-arm extra passes this detective's badge, so it is
  // his or hers alone.
  function sample(state, round, turn, n, badge) {
    var key = sampleKey(round, turn, n, badge);
    var draw = { rng: hash(state.seed + "|" + key), round: round, perp: state.perp, crimeTime: state.crimeTime, options: state.options };
    var cat = n <= 3 ? n - 1 : E.TIME_CAT;
    return { round: round, cat: cat, value: cat === E.TIME_CAT ? E.drawLab(draw) : E.drawAttribute(draw, cat),
             ev: key, code: tipCode(state, { round: round, turn: turn, n: n, badge: badge }) };
  }

  // ---------- tip codes ----------

  // A pointer to one report, not its value: the receiving phone looks the report up itself,
  // so a tip can't be faked. Round, turn, location and (for a Strong-arm extra) badge, plus
  // a check keyed to the case: 4 characters, or 6 for an extra.
  function tipPayload(p) {
    var extra = p.badge != null;
    return bitsOf(p.round - 1, 4) + bitsOf(p.turn - 1, 3) + bitsOf(p.n - 1, 2) + (extra ? "1" + bitsOf(p.badge, 10) : "0");
  }
  // The pointer is scrambled with a mask from the case seed, so codes look random and
  // reveal nothing about where or when the report was taken.
  function scramble(state, bits) {
    var mask = bitsOf(hash(state.seed + "|mask"), 20), out = "";
    for (var i = 0; i < bits.length; i++) out += bits[i] === mask[i] ? "0" : "1";
    return out;
  }
  function tipCode(state, p) {
    var payload = tipPayload(p);
    return pretty(encode(scramble(state, payload) + bitsOf(hash(state.seed + "|tip|" + payload), 10)));
  }

  // { report } for a good code, or { error } explaining what's wrong with it.
  function readTip(state, code) {
    var c = normalize(code);
    if (c.length !== 4 && c.length !== 6) return { error: "Tip codes are 4 or 6 characters." };
    var bits = decode(c), extra = c.length === 6, len = extra ? 20 : 10;
    var payload = scramble(state, bits.substr(0, len));
    bits = payload + bits.substr(len);
    if ((payload[9] === "1") !== extra) return { error: "That code doesn't check out. Ask for it again." };
    var p = { round: read(bits, 0, 4) + 1, turn: read(bits, 4, 3) + 1, n: read(bits, 7, 2) + 1, badge: extra ? read(bits, 10, 10) : null };
    if (read(bits, len, 10) !== (hash(state.seed + "|tip|" + payload) & 1023))
      return { error: "That code doesn't check out. Ask for it again." };
    var later = p.round > state.round || p.round === state.round && p.turn > state.turn;
    if (later || p.turn > E.turnsPerRound(state)) return { error: "That code is from a turn that hasn't happened yet. Check the case number." };
    return { report: sample(state, p.round, p.turn, p.n, p.badge) };
  }

  // ---------- cards ----------

  // Each phone draws from its own endless, shuffled-looking deck with the usual mix of cards.
  function drawCard(state, counts, key) {
    var total = 0, keys = Object.keys(counts);
    keys.forEach(function (k) { total += counts[k]; });
    var x = hash(state.seed + "|card|" + key) / 4294967296 * total;
    for (var i = 0; i < keys.length; i++) {
      x -= counts[keys[i]];
      if (x < 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  // Steal a Peek: two of this detective's first-hand reports from last round (in round 1, this
  // round so far), picked the same way however often the phone is asked.
  function peekPick(state) {
    var from = Math.max(1, state.round - 1), seen = {};
    var pool = state.notebooks[0].filter(function (e) {
      if (e.hand !== 1 || e.round !== from || seen[e.ev]) return false;
      return (seen[e.ev] = true);
    });
    var tmp = { rng: hash(state.seed + "|peek|" + state.round + "|" + state.turn + "|" + state.field.badge) };
    return E.shuffle(tmp, pool).slice(0, 2);
  }

  // ---------- trials ----------

  // role "prosecutor" (shared: how many named the same suspect this turn, including you)
  // or "juror" (vote: true for guilty).
  function trial(state, suspect, role, opts) {
    opts = opts || {};
    var t = E.runTrial(state, suspect, role === "prosecutor" ? [0] : [], role === "juror" ? { 0: !!opts.vote } : {}, opts.claimed);
    t.role = role;
    if (role === "prosecutor" && opts.shared > 1) {
      t.shared = opts.shared;
      t.points[0] = E.awayFromZero((t.guilty ? D.SCORING.prosecution.guilty : D.SCORING.prosecution.innocent) / opts.shared);
    }
    return t;
  }

  // The public record: every trial, by round and defendant. Every phone at the table should
  // show the same seal at the end. A different seal means someone held a trial nobody saw.
  function seal(state) {
    var list = state.trials.map(function (t) { return t.round + ":" + t.suspect; }).sort().join(",");
    return encode(bitsOf(hash(state.seed + "|seal|" + list), 20));
  }

  return {
    ALPHA: ALPHA, hash: hash, normalize: normalize, caseCode: caseCode, parseCase: parseCase,
    randomSeed: randomSeed, randomBadge: randomBadge, newCase: newCase, strip: strip, restore: restore,
    sampleKey: sampleKey, sample: sample, tipCode: tipCode, readTip: readTip, drawCard: drawCard,
    peekPick: peekPick, trial: trial, seal: seal
  };
});

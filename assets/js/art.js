/*
 * Interrogation — artwork.
 * Every illustration is generated SVG: the 49 suspect mugshots are assembled
 * from an outfit, a sound-stage backdrop and a color-coded voice badge.
 * Returns SVG strings, so the same art works in the app and the printables.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./data.js"));
  else root.Art = factory(root.GameData);
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  var uid = 0;
  function nextId() { uid += 1; return "a" + uid; }
  var VOICE_COLORS = D.CATEGORIES[2].colors;

  // ---------- outfits ----------
  // Each outfit draws a torso (shoulders from y≈98 down to 140) and a head (centered 60,62).

  var SHOULDERS = "M10,140 C12,112 32,100 60,98 C88,100 108,112 110,140 Z";
  var SKIN = "#c9b6ee", SKIN_SHADOW = "#a08bd2", FEATURE = "#3a2a5e";

  function face() {
    return '<circle cx="53" cy="63" r="1.9" fill="' + FEATURE + '"/><circle cx="67" cy="63" r="1.9" fill="' + FEATURE + '"/>' +
      '<path d="M60,65 L58.6,70 L61.2,70" fill="none" stroke="' + SHADE + '" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M55,74.5 Q60,77 65,74.5" fill="none" stroke="' + FEATURE + '" stroke-width="1.4" stroke-linecap="round"/>';
  }
  var SHADE = "#8a74bf";

  function plainHead(id) {
    return '<rect x="52" y="78" width="16" height="24" rx="5" fill="' + SKIN_SHADOW + '"/>' +
      '<ellipse cx="60" cy="62" rx="19" ry="22" fill="url(#' + id + 'face)"/>' + face() +
      // Neon rim light so silhouettes read against the dark backdrop
      '<path d="M66,41.5 A19,22 0 0 1 72,79" fill="none" stroke="#22e4ff" stroke-width="2" stroke-linecap="round" opacity=".75"/>' +
      '<path d="M49,44 A19,22 0 0 0 43,72" fill="none" stroke="#ff2e88" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>';
  }

  var OUTFITS = [
    // 0 Street clothes: hoodie and ball cap
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="#3f6fb5"/>' +
        '<path d="M34,140 L36,118 M86,140 L84,118" stroke="#2e568f" stroke-width="3"/>' +
        '<path d="M40,104 Q60,124 80,104" fill="none" stroke="#2e568f" stroke-width="5"/>' +
        '<path d="M54,112 L52,128 M66,112 L68,128" stroke="#e8eef8" stroke-width="2" stroke-linecap="round"/>' +
        plainHead(id) +
        '<path d="M40,58 C40,36 80,36 80,58 Z" fill="#e94b4b"/>' +
        '<path d="M76,56 L100,60 L80,62 Z" fill="#c23636"/>' +
        '<circle cx="60" cy="40" r="2.4" fill="#c23636"/>';
    },
    // 1 Suit: fedora, lapels and a red tie
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="#30323f"/>' +
        '<path d="M46,99 L60,128 L74,99 Z" fill="#f1f1f4"/>' +
        '<path d="M57,104 L63,104 L65,130 L60,138 L55,130 Z" fill="#d7263d"/>' +
        '<path d="M46,99 L60,128 L42,140 L32,108 Z M74,99 L60,128 L78,140 L88,108 Z" fill="#3c3f50"/>' +
        '<circle cx="74" cy="126" r="1.6" fill="#c9cbd6"/>' +
        plainHead(id) +
        '<ellipse cx="60" cy="48" rx="31" ry="6" fill="#23242e"/>' +
        '<path d="M42,48 C42,26 78,26 78,48 Z" fill="#2b2c38"/>' +
        '<rect x="42" y="41" width="36" height="5" fill="#a8323e"/>';
    },
    // 2 Tattered clothes: ragged shirt and patches, Pigpen-style scribbled hair, smudges and a dust cloud
    function (id) {
      var dust = "#b8a184";
      return '<path d="' + SHOULDERS + '" fill="#8a6a4a"/>' +
        '<path d="M42,101 L48,110 L52,102 L58,112 L62,102 L68,111 L72,102 L78,101" fill="none" stroke="#5e4630" stroke-width="2.5"/>' +
        '<rect x="24" y="118" width="14" height="12" fill="#5d7f53" transform="rotate(-8 31 124)"/>' +
        '<rect x="24" y="118" width="14" height="12" fill="none" stroke="#e7d9b8" stroke-dasharray="2 2" transform="rotate(-8 31 124)"/>' +
        '<path d="M80,122 l6,-4 l3,7 l-5,6 z" fill="#2a1d12"/>' +
        '<path d="M56,128 l4,-3 l2,5 z" fill="#2a1d12"/>' +
        plainHead(id) +
        // Dirt smudges
        '<ellipse cx="49" cy="70" rx="3.5" ry="2" fill="#7d6a52" opacity=".55"/><ellipse cx="70" cy="56" rx="2.5" ry="1.6" fill="#7d6a52" opacity=".5"/>' +
        // Scribbled hair, a tight messy tangle on top
        '<g fill="none" stroke="#3b2a1c" stroke-linejoin="round" stroke-linecap="round">' +
        '<path d="M42,54 l2,-10 l2,9 l2,-11 l2,10 l2,-11 l2,10 l2,-11 l2,10 l2,-11 l2,10 l2,-11 l2,10 l2,-10 l2,9 l2,-9 l2,8 l2,-6" stroke-width="2"/>' +
        '<path d="M44,47 c1,-7 7,-7 7,-1 c0,-7 7,-8 8,-1 c1,-7 8,-7 8,0 c1,-6 7,-6 7,1" stroke-width="1.7"/>' +
        '<path d="M47,41 l3,-6 l2,5 l3,-7 l2,6 l3,-7 l2,6 l3,-6 l2,5 l3,-4" stroke-width="1.7"/>' +
        '<path d="M50,37 c4,-4 8,1 12,-2 c4,-3 7,1 10,0" stroke-width="1.4"/></g>' +
        // The dust cloud that follows him everywhere
        '<g fill="none" stroke="' + dust + '" stroke-width="1.5" stroke-linecap="round" opacity=".85">' +
        '<path d="M14,104 c-5,-3 -2,-10 4,-8 c1,-6 10,-6 10,0 c5,-1 7,6 2,8"/>' +
        '<path d="M92,96 c-1,-6 8,-8 10,-3 c5,-2 9,4 5,7 c4,3 0,9 -5,6"/>' +
        '<path d="M20,80 c-4,-2 -1,-8 4,-6 c2,-4 8,-2 7,2"/>' +
        '<path d="M88,74 c0,-5 7,-6 8,-1 c4,0 5,5 1,7"/>' +
        '<path d="M6,124 c4,-4 10,0 8,4"/><path d="M104,120 c4,-2 8,3 4,6"/></g>' +
        '<g fill="' + dust + '" opacity=".8"><circle cx="30" cy="92" r="1"/><circle cx="86" cy="88" r="1.1"/><circle cx="12" cy="90" r=".9"/>' +
        '<circle cx="104" cy="108" r="1"/><circle cx="36" cy="72" r=".8"/><circle cx="84" cy="62" r=".9"/></g>';
    },
    // 3 Alien costume: green suit, bug eyes and antennae
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="#4fbf5a"/>' +
        '<path d="M28,118 Q60,108 92,118 M22,130 Q60,120 98,130" fill="none" stroke="#3a9a45" stroke-width="3"/>' +
        '<rect x="52" y="78" width="16" height="24" rx="5" fill="#3a9a45"/>' +
        '<path d="M60,40 C82,40 84,62 74,78 C68,88 52,88 46,78 C36,62 38,40 60,40 Z" fill="#6ee07a"/>' +
        '<ellipse cx="51" cy="62" rx="7" ry="11" fill="#101418" transform="rotate(-25 51 62)"/>' +
        '<ellipse cx="69" cy="62" rx="7" ry="11" fill="#101418" transform="rotate(25 69 62)"/>' +
        '<ellipse cx="49" cy="58" rx="2" ry="3" fill="#ffffff" opacity=".8"/>' +
        '<ellipse cx="67" cy="58" rx="2" ry="3" fill="#ffffff" opacity=".8"/>' +
        '<path d="M52,42 L44,22 M68,42 L76,22" stroke="#6ee07a" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="44" cy="21" r="4.5" fill="#ff4fd8"/><circle cx="76" cy="21" r="4.5" fill="#ff4fd8"/>';
    },
    // 4 Leather jacket, the Fonz: black leather with a popped collar over a white T-shirt,
    // a greased pompadour with sideburns, and a thumbs-up
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="#f2f2f5"/>' +
        '<path d="M44,101 Q60,108 76,101" fill="none" stroke="#c9c9d2" stroke-width="2"/>' +
        // Open jacket over the T-shirt
        '<path d="M10,140 C12,112 30,101 46,99 L53,140 Z" fill="#17171d"/>' +
        '<path d="M110,140 C108,112 90,101 74,99 L67,140 Z" fill="#17171d"/>' +
        // Popped collar
        '<path d="M46,99 L35,88 L28,106 L47,114 Z M74,99 L85,88 L92,106 L73,114 Z" fill="#26262f" stroke="#4a4a58" stroke-width="1"/>' +
        '<path d="M52,140 L49,114" stroke="#c9ccd6" stroke-width="1.6" stroke-dasharray="2 1.5"/>' +
        // Leather shine
        '<path d="M22,122 Q28,112 36,110 M96,124 Q92,116 86,113" fill="none" stroke="#55556a" stroke-width="1.6" stroke-linecap="round"/>' +
        plainHead(id) +
        // Sideburns
        '<path d="M41.5,56 L44.5,56 L44.5,71 L42.5,69 Z M78.5,56 L75.5,56 L75.5,71 L77.5,69 Z" fill="#141018"/>' +
        // Slicked-back hair over the whole head, with a tall pompadour swept up and forward
        '<path d="M40.5,62 C38,42 48,36 60,36 C72,36 82,42 79.5,62 C77,52 72,47 60,47 C48,47 43,52 40.5,62 Z" fill="#141018"/>' +
        '<path d="M43,50 C40,34 52,24 66,24 C80,24 89,31 84,40 C80,35 73,34 67,37 C60,40 52,42 45,52 Z" fill="#141018"/>' +
        '<path d="M50,38 C56,30 66,27 78,29" fill="none" stroke="#5c5576" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M56,42 C62,37 70,36 76,37" fill="none" stroke="#3a3550" stroke-width="1.4" stroke-linecap="round"/>' +
        // Thumbs up: "Aaay!"
        '<rect x="82" y="124" width="22" height="16" rx="3" fill="#17171d"/>' +
        '<rect x="84" y="110" width="17" height="15" rx="4.5" fill="' + SKIN + '" stroke="' + SHADE + '" stroke-width="1"/>' +
        '<path d="M87,115 h12 M87,119 h12" stroke="' + SHADE + '" stroke-width="1"/>' +
        '<rect x="85" y="97" width="6.5" height="16" rx="3.2" fill="' + SKIN + '" stroke="' + SHADE + '" stroke-width="1"/>';
    },
    // 5 Wet suit: neoprene with a stripe, mask and snorkel
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="#13161f"/>' +
        '<path d="M14,128 C30,116 90,116 106,128 L108,136 C90,124 30,124 12,136 Z" fill="#ffd23f"/>' +
        '<path d="M60,100 L60,140" stroke="#2a2f3d" stroke-width="2"/>' +
        '<rect x="52" y="78" width="16" height="24" rx="5" fill="#13161f"/>' +
        '<ellipse cx="60" cy="62" rx="19" ry="22" fill="#13161f"/>' +
        '<ellipse cx="60" cy="70" rx="9" ry="10" fill="url(#' + id + 'face)"/>' +
        '<path d="M56.5,74 Q60,76.5 63.5,74" fill="none" stroke="' + FEATURE + '" stroke-width="1.4" stroke-linecap="round"/>' +
        '<rect x="40" y="46" width="40" height="15" rx="7" fill="#ffd23f"/>' +
        '<rect x="44" y="49" width="32" height="9" rx="4.5" fill="#7de3ff" opacity=".85"/>' +
        '<path d="M47,51 L56,51" stroke="#ffffff" stroke-width="1.5" opacity=".9"/>' +
        '<path d="M80,52 L86,52 L86,30" fill="none" stroke="#ff6b35" stroke-width="4" stroke-linecap="round"/>';
    },
    // 6 Knight's armor: great helm with a plume, pauldrons
    function (id) {
      return '<path d="' + SHOULDERS + '" fill="url(#' + id + 'steel)"/>' +
        '<ellipse cx="22" cy="114" rx="16" ry="11" fill="#b5bdcc" stroke="#6f7788" stroke-width="1.5"/>' +
        '<ellipse cx="98" cy="114" rx="16" ry="11" fill="#b5bdcc" stroke="#6f7788" stroke-width="1.5"/>' +
        '<path d="M60,104 L60,140" stroke="#6f7788" stroke-width="1.5"/>' +
        '<path d="M44,122 Q60,130 76,122" fill="none" stroke="#6f7788" stroke-width="1.5"/>' +
        // Mail neck guard (gorget) between the helm and the shoulders
        '<path d="M45,82 L75,82 L80,104 Q60,110 40,104 Z" fill="#9aa3b5" stroke="#6f7788" stroke-width="1.5"/>' +
        '<path d="M45,88 H76 M44,93 H77 M42,98 H78" stroke="#6f7788" stroke-width="1.6" stroke-dasharray="2 1.4"/>' +
        '<path d="M60,30 C82,30 82,42 82,56 L82,86 L38,86 L38,56 C38,42 38,30 60,30 Z" fill="url(#' + id + 'steel)" stroke="#6f7788" stroke-width="1.5"/>' +
        '<rect x="40" y="56" width="40" height="4" rx="2" fill="#0d0d14"/>' +
        '<path d="M60,32 L60,86" stroke="#6f7788" stroke-width="1.5"/>' +
        '<circle cx="50" cy="72" r="1.4" fill="#0d0d14"/><circle cx="50" cy="78" r="1.4" fill="#0d0d14"/>' +
        '<circle cx="70" cy="72" r="1.4" fill="#0d0d14"/><circle cx="70" cy="78" r="1.4" fill="#0d0d14"/>' +
        '<path d="M60,30 C58,16 66,8 80,10 C70,14 70,22 66,30 Z" fill="#e63946"/>';
    }
  ];

  // ---------- voices ----------

  var VOICE_GLYPHS = [
    // Deep, raspy: a slow rough wave
    '<path d="M-9,1 Q-6,-5 -3,1 T3,1 T9,1" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 1"/>',
    // Squeaky: a fast high zigzag
    '<path d="M-9,1 L-7,-4 L-5,3 L-3,-4 L-1,3 L1,-4 L3,3 L5,-4 L7,3 L9,-2" fill="none" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/>',
    // Nasal: a nose
    '<path d="M-1,-6 C-2,-1 -6,2 -4,4 C-2,5 2,5 4,4 C5,3 3,2 2,2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    "RU", "FR", "DE", "ES"
  ];

  function voiceBadge(v, x, y, r) {
    var g = VOICE_GLYPHS[v], color = VOICE_COLORS[v], s = (r || 14) / 14;
    var inner = g.charAt(0) === "<" ? g :
      '<text x="0" y="4.5" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="13" fill="#fff">' + g + "</text>";
    return '<g transform="translate(' + x + "," + y + ") scale(" + s + ')">' +
      '<path d="M-14,-11 h28 a4,4 0 0 1 4,4 v14 a4,4 0 0 1 -4,4 h-18 l-7,6 l1,-6 h-4 a4,4 0 0 1 -4,-4 v-14 a4,4 0 0 1 4,-4 z" fill="' + color + '" stroke="#0b0716" stroke-width="1.5"/>' +
      inner + "</g>";
  }

  // ---------- portraits ----------

  function defs(id, studio) {
    var hue = [330, 190, 45, 280, 150, 15, 220][studio];
    return "<defs>" +
      '<radialGradient id="' + id + 'face" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#e6dafc"/><stop offset=".6" stop-color="' + SKIN + '"/><stop offset="1" stop-color="' + SKIN_SHADOW + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'steel" x1="0" x2="1"><stop offset="0" stop-color="#7d8698"/><stop offset=".45" stop-color="#e3e8f0"/><stop offset="1" stop-color="#8c95a6"/></linearGradient>' +
      '<linearGradient id="' + id + 'bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + hue + ',45%,16%)"/><stop offset="1" stop-color="hsl(' + hue + ',55%,7%)"/></linearGradient>' +
      '<filter id="' + id + 'glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      "</defs>";
  }

  // opts: { number: true } shows the lineup number; { ink: true } is the printer-friendly version.
  function portrait(i, opts) {
    opts = opts || {};
    var s = D.SUSPECTS[i], id = nextId(), neon = ["#ff2e88", "#22e4ff", "#ffb000", "#b26bff", "#3dff9a", "#ff5a36", "#5b8cff"][s[1]];
    var out = '<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Suspect ' + (i + 1) + ": " + D.suspectLabel(i) + '">' + defs(id, s[1]);
    out += opts.ink ? '<rect width="120" height="140" fill="#f4efe4"/>' : '<rect width="120" height="140" fill="url(#' + id + 'bg)"/>';
    // Booking-room height lines
    for (var y = 20; y < 140; y += 14)
      out += '<path d="M0,' + y + ' H120" stroke="' + (opts.ink ? "#cfc6b4" : "#ffffff") + '" stroke-opacity="' + (opts.ink ? 1 : 0.07) + '" stroke-width="1"/>';
    // Neon sound-stage number
    out += '<text x="98" y="44" text-anchor="middle" font-family="Monoton, Impact, sans-serif" font-size="40" fill="none" stroke="' + neon + '" stroke-width="1.6"' +
      (opts.ink ? "" : ' filter="url(#' + id + 'glow)"') + ">" + (s[1] + 1) + "</text>";
    out += OUTFITS[s[0]](id);
    out += voiceBadge(s[2], 24, 30, 13);
    if (opts.number)
      out += '<g transform="translate(60,128)"><rect x="-17" y="-9" width="34" height="16" rx="2" fill="#0b0716" stroke="#f4efe4" stroke-width="1"/>' +
        '<text x="0" y="3.5" text-anchor="middle" font-family="Special Elite, Courier New, monospace" font-size="10" fill="#f4efe4">No.' + pad(i + 1) + "</text></g>";
    return out + "</svg>";
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  // Just the figure, for attribute headers and the notebook.
  function outfitIcon(d) {
    var id = nextId();
    return '<svg viewBox="8 18 104 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + defs(id, 0) + OUTFITS[d](id) + "</svg>";
  }

  function voiceIcon(v) {
    return '<svg viewBox="-20 -14 40 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + voiceBadge(v, 0, 0, 14) + "</svg>";
  }

  function studioIcon(st, ink) {
    var neon = ["#ff2e88", "#22e4ff", "#ffb000", "#b26bff", "#3dff9a", "#ff5a36", "#5b8cff"][st];
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="2" y="2" width="36" height="36" rx="6" fill="' + (ink ? "#fff" : "#140e22") + '" stroke="' + neon + '" stroke-width="2.5"/>' +
      '<text x="20" y="29" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="24" fill="' + (ink ? "#111" : neon) + '">' + (st + 1) + "</text></svg>";
  }

  function attributeIcon(cat, value, ink) {
    return cat === 0 ? outfitIcon(value) : cat === 1 ? studioIcon(value, ink) : voiceIcon(value);
  }

  // ---------- locations ----------

  var LOCATION_ART = [
    // 1 Diner: coffee cup
    '<path d="M14,30 h30 v14 a12,12 0 0 1 -12,12 h-6 a12,12 0 0 1 -12,-12 z"/><path d="M44,34 h4 a6,6 0 0 1 0,12 h-5"/>' +
      '<path d="M22,24 c-3,-4 3,-6 0,-11 M30,24 c-3,-4 3,-6 0,-11 M38,24 c-3,-4 3,-6 0,-11"/><path d="M8,58 h44"/>',
    // 2 Studio: clapperboard
    '<rect x="10" y="26" width="44" height="28" rx="2"/><path d="M10,26 l42,-10 l2,7"/><path d="M18,24 l6,-7 M30,21 l6,-7 M42,18 l6,-7"/>' +
      '<path d="M18,36 h28 M18,44 h18"/>',
    // 3 Rodeo Drive: Walk of Fame star
    '<path d="M32,8 l6.5,15 l16,1.5 l-12,10.5 l3.5,16 l-14,-8.5 l-14,8.5 l3.5,-16 l-12,-10.5 l16,-1.5 z"/><path d="M14,58 h36"/>',
    // 4 Police Station: badge
    '<path d="M32,6 l20,8 v16 c0,14 -9,22 -20,28 c-11,-6 -20,-14 -20,-28 v-16 z"/><path d="M32,20 l3.5,8 l8.5,0.8 l-6.5,5.6 l2,8.6 l-7.5,-4.6 l-7.5,4.6 l2,-8.6 l-6.5,-5.6 l8.5,-0.8 z"/>',
    // 5 Donut Shop: donut
    '<circle cx="32" cy="34" r="22"/><circle cx="32" cy="34" r="7"/><path d="M14,28 c6,-12 30,-12 36,0"/>' +
      '<path d="M22,22 l3,2 M36,18 l1,3 M44,26 l-3,1 M28,16 l-2,2"/>',
    // 6 Prosecutor's Office: scales of justice
    '<path d="M32,10 v44 M20,56 h24 M14,18 h36"/><path d="M14,18 l-8,18 h16 z M50,18 l-8,18 h16 z"/><circle cx="32" cy="10" r="3"/>'
  ];
  var LOCATION_COLORS = ["#ffb000", "#ff2e88", "#facc15", "#22e4ff", "#ff7ac6", "#b26bff"];

  function locationIcon(n, ink) {
    var c = ink ? "#111" : LOCATION_COLORS[n - 1], id = nextId();
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      (ink ? "" : '<defs><filter id="' + id + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>') +
      '<g fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"' + (ink ? "" : ' filter="url(#' + id + ')"') + ">" +
      LOCATION_ART[n - 1] + "</g></svg>";
  }

  // ---------- clock ----------

  // A dial reading hour t of the day (0-23, 0 is midnight), with no time (null) it is a blank dial.
  // The face shows the time of day: navy with a moon and stars at night, cyan with a sun by day,
  // and a gradient sky with the sun on the horizon at sunrise (right) and sunset (left).
  // AM or PM and the sun or moon sit on the far side of the dial from the hand.
  var NIGHT = 0, DAY = 1, SUNRISE = 2, SUNSET = 3;
  function phase(t) {
    if (t === 6 || t === 7) return SUNRISE;
    if (t === 18 || t === 19) return SUNSET;
    return t >= 8 && t < 18 ? DAY : NIGHT;
  }
  var FACES = {
    // bg: sky (one color or gradient stops), fg: ticks, ring and label, hand: hand color, edge: hand outline
    neon: { bg: "#140e22", fg: "#22e4ff" },
    0: { bg: "#13235a", fg: "#ffffff", hand: "#ffffff" },
    1: { bg: "#3fd3ec", fg: "#0d1f4f", hand: "#0d1f4f" },
    2: { bg: ["#1f2b6e", "#d9577f", "#ffb347"], fg: "#ffffff", hand: "#ffffff", edge: "#0d1f4f" },
    3: { bg: ["#3a1f6e", "#ef5a4a", "#ffcf5a"], fg: "#ffffff", hand: "#ffffff", edge: "#0d1f4f" },
    ink0: { bg: "#dfe4f2", fg: "#111", hand: "#d61f6f" },
    ink1: { bg: "#ffffff", fg: "#111", hand: "#d61f6f" },
    ink2: { bg: ["#dfe4f2", "#f6dbe3", "#fde7cf"], fg: "#111", hand: "#d61f6f" },
    ink3: { bg: ["#e5def2", "#fadcd6", "#fdf0cf"], fg: "#111", hand: "#d61f6f" }
  };
  var SUN = "#ffd23f", MOON = "#f6ecc9";

  function polar(angle, r) { return [32 + Math.sin(angle) * r, 32 - Math.cos(angle) * r]; }
  function near(a, b, gap) { var d = Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return d < gap; }

  function sunDisk(x, y, r, color, rays) {
    var out = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + color + '"/>';
    if (rays) for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2;
      out += '<line x1="' + (x + Math.sin(a) * (r + 1.5)).toFixed(1) + '" y1="' + (y - Math.cos(a) * (r + 1.5)).toFixed(1) +
        '" x2="' + (x + Math.sin(a) * (r + 3.2)).toFixed(1) + '" y2="' + (y - Math.cos(a) * (r + 3.2)).toFixed(1) +
        '" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round"/>';
    }
    return out;
  }

  function clock(t, ink) {
    var ph = t == null ? null : phase(t);
    var F = t == null ? (ink ? { bg: "#fff", fg: "#111" } : FACES.neon) : FACES[(ink ? "ink" : "") + ph];
    var id = nextId(), defs = "", sky = F.bg, art = "";
    if (Array.isArray(F.bg)) {
      defs += '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1">' + F.bg.map(function (c, k) {
        return '<stop offset="' + (k / (F.bg.length - 1)) + '" stop-color="' + c + '"/>';
      }).join("") + "</linearGradient>";
      sky = "url(#" + id + "sky)";
    }
    defs += '<clipPath id="' + id + 'dial"><circle cx="32" cy="32" r="28"/></clipPath>';

    var b = t == null ? 0 : ((t % 12) / 12) * Math.PI * 2, far = b + Math.PI;
    if (ph === SUNRISE || ph === SUNSET) {
      // Sun on the horizon: rising on the right, setting on the left, with dark ground below
      var sx = ph === SUNRISE ? 47 : 16;
      art += '<g clip-path="url(#' + id + 'dial)">' + sunDisk(sx, 41, 5.5, ink ? "#e0a400" : SUN, true) +
        '<rect x="0" y="41" width="64" height="24" fill="' + (ink ? "#c9c3d6" : "#1b1240") + '" opacity="' + (ink ? 0.7 : 0.75) + '"/>' +
        '<line x1="0" y1="41" x2="64" y2="41" stroke="' + F.fg + '" stroke-width="1" opacity=".6"/></g>';
    } else if (ph === NIGHT || ph === DAY) {
      var body = polar(far + 1.2, 12);
      if (ph === NIGHT) {
        // A few stars, kept clear of the hand, the label and the moon
        [[0.35, 17], [1.3, 15], [2.2, 18], [2.9, 14], [3.8, 17], [4.6, 15], [5.4, 18], [6.0, 14]].forEach(function (st) {
          if (near(st[0], b, 0.45) || near(st[0], far, 0.7) || near(st[0], far + 1.2, 0.6)) return;
          var p = polar(st[0], st[1]);
          art += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (st[1] > 16 ? 0.9 : 0.7) + '" fill="' + (ink ? "#5a6390" : "#ffffff") + '" opacity=".9"/>';
        });
        art += '<g transform="translate(' + body[0].toFixed(1) + "," + body[1].toFixed(1) + ')"><path d="M-2,-4.6 a5,5 0 1 0 6,6 a4,4 0 1 1 -6,-6 z" fill="' +
          (ink ? "#2a3570" : MOON) + '"/></g>';
      } else {
        art += sunDisk(body[0], body[1], 2.8, ink ? "#e0a400" : SUN, true);
      }
    }

    var ticks = "";
    for (var k = 0; k < 12; k++) {
      var a = (k / 12) * Math.PI * 2, p1 = polar(a, 22), p2 = polar(a, 26);
      ticks += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) +
        '" stroke="' + F.fg + '" stroke-width="' + (k % 3 ? 1.5 : 3) + '"/>';
    }

    var hand = "";
    if (t != null) {
      var lp = polar(far, 11), hp = polar(b, 17);
      hand += '<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3.8).toFixed(1) + '" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="11" fill="' + F.fg + '"' +
        (F.edge ? ' stroke="' + F.edge + '" stroke-width="2" paint-order="stroke"' : "") + ">" + (t < 12 ? "AM" : "PM") + "</text>";
      if (F.edge) hand += '<line x1="32" y1="32" x2="' + hp[0].toFixed(1) + '" y2="' + hp[1].toFixed(1) + '" stroke="' + F.edge + '" stroke-width="6.5" stroke-linecap="round"/>';
      hand += '<line x1="32" y1="32" x2="' + hp[0].toFixed(1) + '" y2="' + hp[1].toFixed(1) + '" stroke="' + F.hand + '" stroke-width="4.5" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' + defs + "</defs>" +
      '<circle cx="32" cy="32" r="29" fill="' + sky + '" stroke="' + F.fg + '" stroke-width="2.5"/>' + art + ticks + hand +
      '<circle cx="32" cy="32" r="3" fill="' + (F.hand || F.fg) + '"' + (F.edge ? ' stroke="' + F.edge + '" stroke-width="1"' : "") + "/></svg>";
  }

  return {
    portrait: portrait, outfitIcon: outfitIcon, voiceIcon: voiceIcon, studioIcon: studioIcon,
    attributeIcon: attributeIcon, locationIcon: locationIcon, clock: clock,
    LOCATION_COLORS: LOCATION_COLORS, pad: pad
  };
});

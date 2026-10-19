/*
 * Interrogation — game data.
 * The single source of truth shared by the companion app, the rulebook and
 * the printables. Works as a browser global (window.GameData) or a Node module.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The three attribute categories. Each is learned at one interrogation location.
  var CATEGORIES = [
    {
      key: "dress",
      name: "Appearance",
      location: 1,
      values: ["Street Clothes", "Suit", "Tattered Clothes", "Alien Costume",
               "Leather Jacket", "Wet Suit", "Knight's Armor"],
      short: ["Street", "Suit", "Tattered", "Alien", "Leather", "Wet Suit", "Armor"]
    },
    {
      key: "studio",
      name: "Location",
      location: 2,
      values: ["Studio 1", "Studio 2", "Studio 3", "Studio 4", "Studio 5", "Studio 6", "Studio 7"],
      short: ["1", "2", "3", "4", "5", "6", "7"]
    },
    {
      key: "voice",
      name: "Voice",
      location: 3,
      values: ["Deep, Raspy Voice", "Squeaky Voice", "Nasal Voice", "Russian Accent",
               "French Accent", "German Accent", "Spanish Accent"],
      short: ["Raspy", "Squeaky", "Nasal", "Russian", "French", "German", "Spanish"],
      // Each voice has its own color, used on the lineup, cards and data sheet.
      colors: ["#8b5cf6", "#facc15", "#22c55e", "#ef4444", "#3b82f6", "#f97316", "#ec4899"]
    }
  ];

  // Times are the 24 hours of the day. Index 0 is midnight, 12 is noon.
  var HOURS = 24;
  var TIMES = [], TIME_SHORT = [];
  for (var h = 0; h < HOURS; h++) {
    var twelve = h % 12 === 0 ? 12 : h % 12, half = h < 12 ? "AM" : "PM";
    TIMES.push(h === 0 ? "Midnight" : h === 12 ? "Noon" : twelve + " " + half);
    TIME_SHORT.push(twelve + " " + half);
  }

  // The 49 likely suspects as [dress, studio, voice], in lineup order:
  // one row per voice, sorted by studio and then outfit across each row. Outfit, the easiest
  // attribute to read from a picture, deliberately has nothing to do with position.
  var SUSPECTS = [
    [3, 1, 0], [5, 2, 0], [2, 3, 0], [4, 3, 0], [6, 3, 0], [0, 5, 0],
    [0, 0, 1], [4, 0, 1], [6, 0, 1], [6, 1, 1], [0, 2, 1], [2, 3, 1],
    [1, 0, 2], [2, 0, 2], [5, 2, 2], [0, 4, 2], [3, 4, 2], [0, 5, 2], [3, 5, 2], [2, 6, 2],
    [4, 2, 3], [6, 2, 3], [0, 3, 3], [2, 3, 3], [1, 4, 3], [5, 4, 3], [1, 5, 3], [0, 6, 3], [5, 6, 3],
    [1, 2, 4], [3, 2, 4], [3, 3, 4], [0, 4, 4], [3, 4, 4], [6, 5, 4], [6, 6, 4],
    [4, 1, 5], [6, 1, 5], [1, 2, 5], [3, 4, 5], [4, 5, 5], [2, 6, 5], [5, 6, 5],
    [5, 1, 6], [2, 3, 6], [6, 4, 6], [1, 5, 6], [3, 5, 6], [5, 6, 6]
  ];

  var LOCATIONS = [
    { n: 1, key: "diner", name: "The Diner", category: 0,
      blurb: "A hangout for extras. They saw some folks acting suspiciously and can describe what they wore." },
    { n: 2, key: "studio", name: "E. F. Studios", category: 1,
      blurb: "The scene of the crime: seven sound stages. People here heard what might have been a struggle." },
    { n: 3, key: "rodeo", name: "Rodeo Drive", category: 2,
      blurb: "The stars overheard the extras. They never looked, but they remember the voice." },
    { n: 4, key: "police", name: "Police Station", category: null,
      blurb: "Get an estimate of the hour of death from the crime lab. Alone? You may take an action card instead." },
    { n: 5, key: "donut", name: "Donut Shop", category: null,
      blurb: "Compare notes with other detectives. Alone? Grab a Box of Donuts card to share later." },
    { n: 6, key: "prosecutor", name: "Prosecutor's Office", category: null,
      blurb: "Make a press release, or name the perpetrator and take him or her to trial." }
  ];

  // Action cards. "when": "draw" = resolve as soon as drawn,
  // "turn" = play on a later turn after destinations are revealed, "end" = scored at game end.
  var CARDS = {
    donuts:     { name: "A Box of Donuts", when: "turn",
                  text: "Play on any turn after destinations are revealed. You may trade information with any detectives at your location." },
    peek:       { name: "Steal a Peek", when: "draw",
                  text: "Play immediately against any other detective. He or she reveals two pieces of information gathered last round." },
    compliment: { name: "Compliment the Chief", when: "end",
                  text: "Keep this card. It is worth 2 points at the end of the game." },
    strongarm:  { name: "Strong-arm a Witness", when: "turn",
                  text: "Play on any turn after destinations are revealed. You, and only you, get one extra piece of information at your location." },
    sirens:     { name: "Speed with Sirens", when: "turn",
                  text: "Play on any turn after destinations are revealed. No other detectives get information from your location." },
    lunch:      { name: "Work During Lunch", when: "draw",
                  text: "Play immediately. Join any other location this turn and take part in everything that has happened or will happen there." }
  };
  var ACTION_DECK = { peek: 3, compliment: 1, strongarm: 3, sirens: 2, lunch: 2 };
  var DONUT_DECK = { donuts: 4 };

  var TURNS_PER_ROUND = { 3: 6, 4: 4, 5: 3, 6: 3 };

  var SCORING = {
    hunchBase: { 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 },   // hunch made after round N
    pressRelease: { right: 10, wrong: -5 },
    prosecution: { guilty: 10, innocent: -8 },
    vote: { guiltyIfGuilty: 6, guiltyIfInnocent: -4, notGuiltyIfGuilty: -4, notGuiltyIfInnocent: 4 },
    compliment: 2
  };

  function suspectLabel(i) {
    var s = SUSPECTS[i];
    return CATEGORIES[0].values[s[0]] + " · " + CATEGORIES[1].values[s[1]] + " · " + CATEGORIES[2].values[s[2]];
  }

  return {
    CATEGORIES: CATEGORIES, HOURS: HOURS, TIMES: TIMES, TIME_SHORT: TIME_SHORT, SUSPECTS: SUSPECTS,
    LOCATIONS: LOCATIONS, CARDS: CARDS, ACTION_DECK: ACTION_DECK, DONUT_DECK: DONUT_DECK,
    TURNS_PER_ROUND: TURNS_PER_ROUND, SCORING: SCORING, suspectLabel: suspectLabel
  };
});

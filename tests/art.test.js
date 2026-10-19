// Run with: npm test
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const D = require("../assets/js/data.js");
const A = require("../assets/js/art.js");

test("every suspect gets a well-formed, uniquely-identified portrait", () => {
  const ids = new Set();
  D.SUSPECTS.forEach((s, i) => {
    for (const ink of [false, true]) {
      const svg = A.portrait(i, { number: true, ink });
      assert.match(svg, /^<svg [^>]*viewBox="0 0 120 140"/);
      assert.ok(svg.endsWith("</svg>"));
      assert.ok(svg.includes("No." + A.pad(i + 1)));
      const own = new Set([...svg.matchAll(/id="(a\d+)/g)].map(m => m[1]));
      assert.strictEqual(own.size, 1, "one id prefix per portrait");
      own.forEach(id => { assert.ok(!ids.has(id), "ids never repeat across portraits"); ids.add(id); });
    }
  });
});

test("icons exist for every attribute, location and time", () => {
  D.CATEGORIES.forEach((c, ci) => c.values.forEach((v, k) => assert.match(A.attributeIcon(ci, k), /^<svg/)));
  D.LOCATIONS.forEach(l => assert.match(A.locationIcon(l.n), /^<svg/));
  for (let t = 0; t < 24; t++) {
    const svg = A.clock(t);
    assert.match(svg, /<line x1="32" y1="32"/);
    assert.ok(svg.includes(t < 12 ? ">AM<" : ">PM<"));
  }
});

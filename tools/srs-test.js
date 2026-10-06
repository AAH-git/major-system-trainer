// Tests for srs.js. Run from the project folder:  node tools/srs-test.js
"use strict";
var SRS = require("../srs.js");

var W = SRS.DEFAULT_PARAMS, DAY = SRS.DAY_MS;
var failures = 0, passes = 0;

function check(name, cond, detail) {
  if (cond) { passes++; console.log("  ok   " + name); }
  else { failures++; console.log("  FAIL " + name + (detail ? "  -> " + detail : "")); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// Seeded random numbers so the simulation is repeatable.
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var EXPECTED = [];
for (var d = 0; d < 10; d++) EXPECTED.push(String(d));
for (var dd = 0; dd < 100; dd++) EXPECTED.push(dd < 10 ? "0" + dd : String(dd));
var IDS = EXPECTED.map(function (n) { return "n:" + n; })
  .concat(EXPECTED.map(function (n) { return "i:" + n; }));
var INDEX = {};
IDS.forEach(function (id, i) { INDEX[id] = i; });

// ---------------------------------------------------------------
console.log("Formulas");
check("R(S, S) = 0.9", near(SRS.retrievability(7, 7, W), 0.9, 1e-9));
check("R(0, S) = 1", near(SRS.retrievability(0, 5, W), 1, 1e-12));
check("interval at 90% retention equals S", near(SRS.intervalDays(12.5, W, 0.9), 12.5, 1e-9));
check("interval at 80% is longer than at 90%", SRS.intervalDays(10, W, 0.8) > 10);

var t0 = Date.UTC(2026, 0, 1, 9);
var good = SRS.review(null, SRS.GOOD, t0, W, "n:07");
var again = SRS.review(null, SRS.AGAIN, t0, W, "n:07");
check("new card answered Good: S = w2", near(good.s, W[2], 1e-12));
check("new card answered Again: S = w0", near(again.s, W[0], 1e-12));
check("new card D = w4 - e^(w5(G-1)) + 1", near(good.d, W[4] - Math.exp(W[5] * 2) + 1, 1e-12));
check("Again comes back in 10 minutes", again.due === t0 + 10 * 60000);
check("Good on a new card: due in about w2 days",
  Math.round((good.due - t0) / DAY) === Math.round(W[2]), (good.due - t0) / DAY);

var later = t0 + 3 * DAY;
var good2 = SRS.review(good, SRS.GOOD, later, W, "n:07");
var miss2 = SRS.review(good, SRS.AGAIN, later, W, "n:07");
check("remembering after days raises S", good2.s > good.s, good.s + " -> " + good2.s);
check("forgetting after days lowers S", miss2.s < good.s, good.s + " -> " + miss2.s);
check("forgetting raises D", miss2.d > good.d, good.d + " -> " + miss2.d);
check("lapses counted", miss2.lapses === 1 && good2.lapses === 0);

// A long run of successes: intervals grow but never exceed 60 days.
var c = null, t = t0, maxGap = 0, prevS = 0, grew = true;
for (var k = 0; k < 15; k++) {
  c = SRS.review(c, SRS.GOOD, t, W, "n:42");
  if (k > 0 && c.s <= prevS) grew = false;
  prevS = c.s;
  maxGap = Math.max(maxGap, (c.due - t) / DAY);
  t = c.due;
}
check("stability keeps growing with successes", grew);
check("interval capped at 60 days", maxGap <= 60, maxGap);
check("strong items reach the cap", maxGap === 60, maxGap);

// Cross-check one recall step against the formula written out by hand.
var r = SRS.retrievability(3, good.s, W);
var expectS = good.s * (1 + Math.exp(W[8]) * (11 - good.d) * Math.pow(good.s, -W[9]) *
  (Math.exp((1 - r) * W[10]) - 1));
check("recall stability matches FSRS formula", near(good2.s, expectS, 1e-9));

// ---------------------------------------------------------------
console.log("Building rounds");
var now = t0 + 30 * DAY;
function cardWith(s, lastDaysAgo, dueInDays) {
  return { s: s, d: 5, last: now - lastDaysAgo * DAY, due: now + dueInDays * DAY, reps: 3, lapses: 0 };
}
var cards = {};
// 3 due items with different recall probabilities
cards["n:10"] = cardWith(2, 10, -8);   // very overdue -> lowest R
cards["n:11"] = cardWith(5, 6, -1);
cards["i:12"] = cardWith(3, 4, -1);
// memorised, not due; n:20 was checked longest ago
cards["n:20"] = cardWith(40, 50, 5);
cards["n:21"] = cardWith(40, 20, 30);
// not due, not memorised
cards["n:30"] = cardWith(4, 1, 3);
// sibling of a due card: i:10 must not appear with n:10
cards["i:10"] = cardWith(2, 10, -8);

var pool = IDS.slice();
var round = SRS.buildRound(cards, pool, 10, now, W, { random: rng(1) });
var nums = round.map(function (id) { return id.slice(2); });
check("round has 10 items", round.length === 10, round.length);
check("no number appears twice", new Set(nums).size === nums.length, round.join(","));
check("check-up slot picks the memorised item checked longest ago", round.indexOf("n:20") >= 0);
check("only one check-up slot used", round.indexOf("n:21") < 0, round.join(","));
check("due items included", ["n:11", "i:12"].every(function (id) { return round.indexOf(id) >= 0; }));
check("one direction of 10 included", (round.indexOf("n:10") >= 0) !== (round.indexOf("i:10") >= 0));

// Due items come before unpractised ones: with 12 due items, no new ones get in.
var many = {};
for (var q = 0; q < 12; q++) many["n:" + EXPECTED[10 + q]] = cardWith(3, 5, -1);
var r2 = SRS.buildRound(many, pool, 10, now, W, { random: rng(2) });
check("due items fill the round before new ones", r2.every(function (id) { return many[id]; }));

// New items ordered by priority hint (weakest Performance % first).
var hintRound = SRS.buildRound({}, ["n:1", "n:2", "n:3", "n:4", "n:5"], 2, now, W, {
  random: rng(3),
  newPriority: function (id) { return id === "n:4" ? 0 : id === "n:2" ? 0.1 : 2; }
});
check("weakest unpractised items introduced first",
  hintRound.slice().sort().join(",") === "n:2,n:4", hintRound.join(","));

// Nothing due and nothing new: review ahead, lowest R first.
var allSeen = {};
pool.forEach(function (id, i) { allSeen[id] = cardWith(5 + (i % 7), 1 + (i % 3), 2); });
var r3 = SRS.buildRound(allSeen, pool, 10, now, W, { random: rng(4) });
check("round still built when nothing is due", r3.length === 10);

// Mixed pool with only a few items available.
var small = SRS.buildRound({}, ["n:1", "i:1", "n:2"], 10, now, W, { random: rng(5) });
check("small pool: returns what it can, no siblings", small.length === 2, small.join(","));

// ---------------------------------------------------------------
console.log("Personalisation (simulated learner)");

// A learner whose memory follows FSRS with different "true" parameters:
// stronger initial memories and a different forgetting curve.
var TRUE = W.slice();
TRUE[0] = 1.2;   // after a miss on first sight
TRUE[2] = 7.0;   // after knowing it on first sight
TRUE[20] = 0.35;

function simulate(days, seed) {
  var rand = rng(seed);
  var log = [], sched = {}, truth = {};
  var start = Date.UTC(2026, 0, 1, 8);
  for (var day = 0; day < days; day++) {
    var sessions = 1 + Math.floor(rand() * 3);         // 1-3 sessions a day
    for (var sIdx = 0; sIdx < sessions; sIdx++) {
      var tNow = start + day * DAY + sIdx * 4 * 3600000 + Math.floor(rand() * 3600000);
      var rnd = SRS.buildRound(sched, IDS, 10, tNow, W, { random: rand });
      rnd.forEach(function (id, j) {
        var at = tNow + j * 15000;
        var m = truth[id];
        var knew = m ? rand() < SRS.retrievability((at - m.last) / DAY, m.s, TRUE) : rand() < 0.75;
        var g = knew ? SRS.GOOD : SRS.AGAIN;
        truth[id] = SRS.review(m, g, at, TRUE, id);
        sched[id] = SRS.review(sched[id], g, at, W, id);
        log.push([INDEX[id], Math.round(at / 1000), g]);
      });
    }
  }
  return log;
}

var smallLog = simulate(3, 11);
var opt0 = new SRS.Optimiser(smallLog.slice(0, 30), W);
while (!opt0.step()) {}
check("under 50 answers: keeps defaults", opt0.result.stage === "default" && !opt0.result.accepted);

var midLog = simulate(14, 12);
midLog = midLog.slice(0, Math.min(midLog.length, 399));
var opt1 = new SRS.Optimiser(midLog, W);
while (!opt1.step()) {}
console.log("       pretrain on " + midLog.length + " answers: w0 " + W[0] + " -> " +
  opt1.result.params[0].toFixed(3) + ", w2 " + W[2] + " -> " + opt1.result.params[2].toFixed(3));
check("50-399 answers: pretrain stage", opt1.result.stage === "pretrain");
check("pretrain moves w2 toward the learner's true value",
  !opt1.result.accepted || opt1.result.params[2] > W[2], opt1.result.params[2]);

var bigLog = simulate(90, 13);
var opt2 = new SRS.Optimiser(bigLog, W);
var t1 = Date.now();
while (!opt2.step()) {}
var res = opt2.result;
console.log("       full fit on " + bigLog.length + " answers in " + (Date.now() - t1) + " ms; held-out log loss " +
  res.holdout.before.toFixed(4) + " -> " + res.holdout.after.toFixed(4) +
  " (" + res.holdout.count + " answers); w2 -> " + res.params[2].toFixed(2) + ", w20 -> " + res.params[20].toFixed(3));
check("400+ answers: full stage", res.stage === "full");
check("full fit beats defaults on held-out answers", res.accepted && res.holdout.after < res.holdout.before);
check("fitted parameters stay within bounds", res.params.every(function (v, i) {
  return v >= SRS.BOUNDS[i][0] - 1e-12 && v <= SRS.BOUNDS[i][1] + 1e-12;
}));
check("Hard/Easy-only parameters untouched", [1, 3, 15, 16].every(function (i) { return res.params[i] === W[i]; }));
var calDefault = SRS.calibration(bigLog, W), calFit = SRS.calibration(bigLog, res.params);
console.log("       predicted vs actual recall: defaults " + (calDefault.predicted * 100).toFixed(1) + "% vs " +
  (calDefault.actual * 100).toFixed(1) + "%, fitted " + (calFit.predicted * 100).toFixed(1) + "%");
check("fitted model is better calibrated",
  Math.abs(calFit.predicted - calFit.actual) < Math.abs(calDefault.predicted - calDefault.actual));

// Contradictory / random data: the safety check should refuse to change anything.
var noise = simulate(60, 14).map(function (e, i) {
  return [e[0], e[1], rng(100 + i)() < 0.5 ? SRS.GOOD : SRS.AGAIN];
});
var opt3 = new SRS.Optimiser(noise, W, { iterations: 30 });
while (!opt3.step()) {}
check("random answers: parameters only change if they predict better",
  !opt3.result.accepted || opt3.result.holdout.after < opt3.result.holdout.before);

var rebuilt = SRS.rebuildCards(bigLog, IDS, res.params);
check("cards can be rebuilt from the log", Object.keys(rebuilt).length > 100);

console.log("\n" + passes + " passed, " + failures + " failed");
process.exit(failures ? 1 : 0);

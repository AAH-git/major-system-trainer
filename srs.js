/*
  Spaced repetition for the Major System trainer, based on FSRS-6
  (Free Spaced Repetition Scheduler, the algorithm Anki uses by default).

  Formulas and default parameters follow the reference implementation:
    https://github.com/open-spaced-repetition/py-fsrs  (fsrs/scheduler.py)
    https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
  Parameter bounds follow fsrs-rs (src/parameter_clipper_v6.rs).

  Grades: the app only has two buttons, so "I know" = Good (3), "I don't know" = Again (1).

  Pure functions only (no DOM), so this file also runs under Node for tests.
*/
(function (root) {
  "use strict";

  var AGAIN = 1, GOOD = 3;
  var DAY_MS = 86400000;

  var DEFAULT_PARAMS = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
    1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658, 0.1542
  ];

  var BOUNDS = [
    [0.001, 100], [0.001, 100], [0.001, 100], [0.001, 100], // w0-w3 initial stability
    [1, 10],                                                 // w4 initial difficulty
    [0.001, 4], [0.001, 4], [0.001, 0.75],                   // w5-w7 difficulty
    [0, 4.5], [0, 0.8], [0.001, 3.5],                        // w8-w10 recall stability
    [0.001, 5], [0.001, 0.25], [0.001, 0.9], [0, 4],         // w11-w14 forget stability
    [0, 1], [1, 6],                                          // w15 hard penalty, w16 easy bonus
    [0, 2], [0, 2], [0.01, 0.8],                             // w17-w19 same-day
    [0.1, 0.8]                                               // w20 forgetting-curve decay
  ];

  // Parameters that pass/fail grading can inform. w1, w3, w15, w16 belong to the
  // Hard/Easy buttons, which this app doesn't have, so they stay at their defaults.
  var FIT_INDICES = [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20];

  var CONFIG = {
    retention: 0.9,          // target probability of recall when an item comes due
    relearnMinutes: 10,      // a missed item comes back after this long
    maxIntervalDays: 60,     // even "memorised" items come back at least this often
    memorisedStability: 21,  // stability (days) at which an item counts as memorised
    fuzzMinDays: 3,          // intervals at least this long get a little random spread...
    fuzz: 0.05,              // ...of +/- 5%
    pretrainMin: 50,         // answers needed before personalising initial stability
    fullFitMin: 400          // answers needed before fitting all parameters
  };

  // ---------- FSRS-6 memory model ----------

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function clampS(s) { return clamp(s, 0.001, 36500); }
  function clampD(d) { return clamp(d, 1, 10); }

  function decay(w) { return -w[20]; }
  function factor(w) { return Math.pow(0.9, 1 / decay(w)) - 1; }

  // Probability of recall after t days for an item with stability s.
  function retrievability(tDays, s, w) {
    return Math.pow(1 + factor(w) * Math.max(0, tDays) / s, decay(w));
  }

  // Days until recall probability falls to the target retention.
  function intervalDays(s, w, retention) {
    return (s / factor(w)) * (Math.pow(retention, 1 / decay(w)) - 1);
  }

  function initStability(g, w) { return clampS(w[g - 1]); }

  function initDifficulty(g, w, noClamp) {
    var d = w[4] - Math.exp(w[5] * (g - 1)) + 1;
    return noClamp ? d : clampD(d);
  }

  function nextDifficulty(d, g, w) {
    var delta = -w[6] * (g - 3);
    var damped = d + (10 - d) * delta / 9;                         // linear damping
    var reverted = w[7] * initDifficulty(4, w, true) + (1 - w[7]) * damped; // mean reversion
    return clampD(reverted);
  }

  function shortTermStability(s, g, w) {
    var inc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
    if (g >= 2) inc = Math.max(inc, 1);
    return clampS(s * inc);
  }

  function recallStability(d, s, r, g, w) {
    var hardPenalty = g === 2 ? w[15] : 1;
    var easyBonus = g === 4 ? w[16] : 1;
    return clampS(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
      (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus));
  }

  function forgetStability(d, s, r, w) {
    var longTerm = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) *
      Math.exp((1 - r) * w[14]);
    var shortTerm = s / Math.exp(w[17] * w[18]);
    return clampS(Math.min(longTerm, shortTerm));
  }

  // Update memory {s, d, last} for an answer at time tMs.
  // Returns the recall probability the model predicted for this answer
  // (null for a first answer or one less than a day after the previous).
  function updateMemory(m, g, tMs, w) {
    var t = (tMs - m.last) / DAY_MS;
    var predicted = null;
    var s;
    if (t < 1) {
      s = shortTermStability(m.s, g, w);
    } else {
      predicted = retrievability(t, m.s, w);
      s = g === AGAIN ? forgetStability(m.d, m.s, predicted, w)
                      : recallStability(m.d, m.s, predicted, g, w);
    }
    m.d = nextDifficulty(m.d, g, w);
    m.s = s;
    m.last = tMs;
    return predicted;
  }

  // Deterministic "random" number in [0, 1) from a string seed, so a review
  // gives the same due date when the history is replayed after a re-fit.
  function seededRandom(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 15; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function dueAfter(s, g, nowMs, w, id) {
    if (g === AGAIN) return nowMs + CONFIG.relearnMinutes * 60000;
    var days = intervalDays(s, w, CONFIG.retention);
    if (days >= CONFIG.fuzzMinDays) {
      var r = seededRandom(id + "@" + Math.round(nowMs / 1000));
      days *= 1 + CONFIG.fuzz * (2 * r - 1);
    }
    days = clamp(Math.round(days), 1, CONFIG.maxIntervalDays);
    return nowMs + days * DAY_MS;
  }

  // Apply one answer to a card (or create it). Returns a new card object.
  function review(card, g, nowMs, w, id) {
    var c;
    if (!card) {
      c = { s: initStability(g, w), d: initDifficulty(g, w), last: nowMs, reps: 0, lapses: 0 };
    } else {
      c = { s: card.s, d: card.d, last: card.last, reps: card.reps, lapses: card.lapses };
      updateMemory(c, g, nowMs, w);
    }
    c.reps++;
    if (g === AGAIN) c.lapses++;
    c.due = dueAfter(c.s, g, nowMs, w, id);
    return c;
  }

  function cardRetrievability(card, nowMs, w) {
    return retrievability((nowMs - card.last) / DAY_MS, card.s, w);
  }

  // ---------- Choosing a round ----------

  function shuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /*
    Pick `size` card ids from `pool` (ids like "n:07" / "i:07"):
      1. one check-up slot: the memorised item (not yet due) checked longest ago
      2. due items, lowest recall probability first
      3. unpractised items, ordered by opts.newPriority(id) (lower first)
      4. items not yet due, lowest recall probability first (review ahead)
    Never two cards for the same number. The result is shuffled.
  */
  function buildRound(cards, pool, size, nowMs, w, opts) {
    opts = opts || {};
    var rand = opts.random || Math.random;
    var newPriority = opts.newPriority || function () { return 0; };

    var due = [], fresh = [], ahead = [], memorised = [];
    pool.forEach(function (id) {
      var c = cards[id];
      if (!c) { fresh.push(id); return; }
      var r = cardRetrievability(c, nowMs, w);
      var entry = { id: id, r: r, last: c.last };
      if (c.due <= nowMs) due.push(entry);
      else {
        ahead.push(entry);
        if (c.s >= CONFIG.memorisedStability) memorised.push(entry);
      }
    });

    var chosen = [], usedNums = {}, usedIds = {};
    function take(id) {
      if (chosen.length >= size || usedIds[id]) return false;
      var num = id.slice(2);
      if (usedNums[num]) return false;
      usedNums[num] = true;
      usedIds[id] = true;
      chosen.push(id);
      return true;
    }
    function byR(a, b) { return a.r - b.r; }

    memorised.sort(function (a, b) { return a.last - b.last; });
    for (var i = 0; i < memorised.length; i++) if (take(memorised[i].id)) break;

    due.sort(byR).forEach(function (e) { take(e.id); });

    var freshOrdered = shuffle(fresh, rand)
      .map(function (id, k) { return { id: id, p: newPriority(id), k: k }; })
      .sort(function (a, b) { return (a.p - b.p) || (a.k - b.k); });
    freshOrdered.forEach(function (e) { take(e.id); });

    ahead.sort(byR).forEach(function (e) { take(e.id); });

    return shuffle(chosen, rand);
  }

  // ---------- Learning from the review log ----------
  // Log entries: [itemIndex, unixSeconds, grade].

  // Replay the log with parameters w. Collects the model's predictions for every
  // answer given at least a day after the previous one (the ones FSRS learns from).
  function replay(log, w, limit) {
    var mem = {};
    var preds = [], ys = [], at = [];
    var end = limit == null ? log.length : Math.min(limit, log.length);
    for (var k = 0; k < end; k++) {
      var e = log[k], i = e[0], tMs = e[1] * 1000, g = e[2];
      var m = mem[i];
      if (!m) {
        mem[i] = { s: initStability(g, w), d: initDifficulty(g, w), last: tMs };
        continue;
      }
      var p = updateMemory(m, g, tMs, w);
      if (p !== null) { preds.push(p); ys.push(g > AGAIN ? 1 : 0); at.push(k); }
    }
    return { preds: preds, ys: ys, at: at };
  }

  function logLoss(preds, ys, from, to) {
    var sum = 0, n = 0;
    for (var k = from; k < to; k++) {
      var p = clamp(preds[k], 1e-4, 1 - 1e-4);
      sum -= ys[k] ? Math.log(p) : Math.log(1 - p);
      n++;
    }
    return n ? sum / n : null;
  }

  // Loss on the answers logged at or after entry `split` (the held-out recent ones).
  function holdoutLoss(log, w, split) {
    var r = replay(log, w);
    var from = 0;
    while (from < r.at.length && r.at[from] < split) from++;
    return { loss: logLoss(r.preds, r.ys, from, r.preds.length), n: r.preds.length - from };
  }

  // Fit initial stabilities w0 (first answer "didn't know") and w2 ("knew it")
  // from what happened at each item's second answer, blended toward the current values.
  function pretrain(log, w, limit) {
    var first = {}, groups = { 1: [], 3: [] };
    var end = Math.min(limit, log.length);
    for (var k = 0; k < end; k++) {
      var e = log[k], i = e[0];
      if (!first[i]) { first[i] = { g: e[2], t: e[1], done: false }; continue; }
      var f = first[i];
      if (f.done) continue;
      f.done = true;
      var dt = (e[1] - f.t) / 86400;
      if (dt >= 1 && groups[f.g]) groups[f.g].push({ t: dt, y: e[2] > AGAIN ? 1 : 0 });
    }

    var out = w.slice();
    [1, 3].forEach(function (g) {
      var data = groups[g];
      if (data.length < 5) return;
      var bestS = w[g - 1], bestLL = -Infinity;
      for (var j = 0; j <= 300; j++) {
        var s = Math.exp(Math.log(0.01) + (Math.log(100) - Math.log(0.01)) * j / 300);
        var ll = 0;
        for (var q = 0; q < data.length; q++) {
          var p = clamp(retrievability(data[q].t, s, w), 1e-4, 1 - 1e-4);
          ll += data[q].y ? Math.log(p) : Math.log(1 - p);
        }
        if (ll > bestLL) { bestLL = ll; bestS = s; }
      }
      // Blend in log space: with few data points stay close to the current value.
      var K = 20, n = data.length;
      var blended = Math.exp((n * Math.log(bestS) + K * Math.log(w[g - 1])) / (n + K));
      out[g - 1] = clamp(blended, BOUNDS[g - 1][0], BOUNDS[g - 1][1]);
    });
    if (out[0] > out[2]) out[0] = out[2];
    return out;
  }

  /*
    Step-by-step optimiser so the page can run it without freezing:
      var opt = new Optimiser(log, currentParams);
      while (!opt.step()) {}   // or one step per setTimeout
      opt.result -> { params, accepted, stage, n, holdout: {before, after} }
  */
  function Optimiser(log, current, options) {
    options = options || {};
    this.log = log;
    this.current = current.slice();
    this.n = log.length;
    this.split = Math.floor(this.n * 0.8);
    this.stage = this.n < CONFIG.pretrainMin ? "default"
               : this.n < CONFIG.fullFitMin ? "pretrain" : "full";
    this.iterations = options.iterations || 80;
    this.phase = "pretrain";
    this.result = null;
  }

  Optimiser.prototype.step = function () {
    if (this.result) return true;
    var self = this;

    if (this.stage === "default") {
      this.result = { params: this.current, accepted: false, stage: "default", n: this.n };
      return true;
    }

    if (this.phase === "pretrain") {
      this.candidate = pretrain(this.log, this.current, this.split);
      if (this.stage === "pretrain") { this.phase = "evaluate"; return false; }
      // Set up Adam in normalised [0,1] coordinates for the fitted parameters.
      this.u = FIT_INDICES.map(function (i) {
        var b = BOUNDS[i];
        return (self.candidate[i] - b[0]) / (b[1] - b[0]);
      });
      this.uDefault = FIT_INDICES.map(function (i) {
        var b = BOUNDS[i];
        return (DEFAULT_PARAMS[i] - b[0]) / (b[1] - b[0]);
      });
      this.m = this.u.map(function () { return 0; });
      this.v = this.u.map(function () { return 0; });
      this.t = 0;
      this.trainCount = Math.max(1, replay(this.log, this.candidate, this.split).preds.length);
      this.phase = "adam";
      return false;
    }

    if (this.phase === "adam") {
      this.adamStep();
      if (this.t >= this.iterations) {
        this.candidate = this.paramsFrom(this.u);
        this.phase = "evaluate";
      }
      return false;
    }

    // Evaluate: keep the candidate only if it predicts the held-out answers better.
    var before = holdoutLoss(this.log, this.current, this.split);
    var after = holdoutLoss(this.log, this.candidate, this.split);
    var accepted;
    if (before.n < 10) accepted = this.stage === "pretrain"; // too little to judge; pretrain is already cautious
    else accepted = after.loss < before.loss - 1e-4;
    this.result = {
      params: accepted ? this.candidate : this.current,
      accepted: accepted,
      stage: this.stage,
      n: this.n,
      holdout: { before: before.loss, after: after.loss, count: before.n }
    };
    return true;
  };

  Optimiser.prototype.paramsFrom = function (u) {
    var w = this.candidate.slice();
    FIT_INDICES.forEach(function (i, k) {
      var b = BOUNDS[i];
      w[i] = b[0] + clamp(u[k], 0, 1) * (b[1] - b[0]);
    });
    return w;
  };

  Optimiser.prototype.objective = function (u) {
    var r = replay(this.log, this.paramsFrom(u), this.split);
    var loss = logLoss(r.preds, r.ys, 0, r.preds.length) || 0;
    // Gentle pull toward the defaults that fades as data grows.
    var penalty = 0;
    for (var k = 0; k < u.length; k++) {
      var dlt = u[k] - this.uDefault[k];
      penalty += dlt * dlt;
    }
    return loss + (10 / this.trainCount) * penalty;
  };

  Optimiser.prototype.adamStep = function () {
    var h = 1e-3, lr = 0.03, b1 = 0.9, b2 = 0.999, eps = 1e-8;
    var u = this.u, grad = [];
    for (var k = 0; k < u.length; k++) {
      var up = u.slice(), dn = u.slice();
      up[k] = Math.min(1, u[k] + h);
      dn[k] = Math.max(0, u[k] - h);
      grad.push((this.objective(up) - this.objective(dn)) / (up[k] - dn[k]));
    }
    this.t++;
    for (var j = 0; j < u.length; j++) {
      this.m[j] = b1 * this.m[j] + (1 - b1) * grad[j];
      this.v[j] = b2 * this.v[j] + (1 - b2) * grad[j] * grad[j];
      var mh = this.m[j] / (1 - Math.pow(b1, this.t));
      var vh = this.v[j] / (1 - Math.pow(b2, this.t));
      u[j] = clamp(u[j] - lr * mh / (Math.sqrt(vh) + eps), 0, 1);
    }
  };

  // Rebuild every card's state from the log with the given parameters.
  function rebuildCards(log, ids, w) {
    var cards = {};
    for (var k = 0; k < log.length; k++) {
      var e = log[k], id = ids[e[0]];
      if (!id) continue;
      cards[id] = review(cards[id], e[2], e[1] * 1000, w, id);
    }
    return cards;
  }

  // Average predicted vs actual recall over the whole log (for the Performance screen).
  function calibration(log, w) {
    var r = replay(log, w);
    if (r.preds.length === 0) return null;
    var p = 0, y = 0;
    for (var k = 0; k < r.preds.length; k++) { p += r.preds[k]; y += r.ys[k]; }
    return { predicted: p / r.preds.length, actual: y / r.preds.length, count: r.preds.length };
  }

  var SRS = {
    AGAIN: AGAIN, GOOD: GOOD, DAY_MS: DAY_MS,
    DEFAULT_PARAMS: DEFAULT_PARAMS, BOUNDS: BOUNDS, FIT_INDICES: FIT_INDICES, CONFIG: CONFIG,
    retrievability: retrievability, intervalDays: intervalDays,
    initStability: initStability, initDifficulty: initDifficulty, nextDifficulty: nextDifficulty,
    shortTermStability: shortTermStability, recallStability: recallStability,
    forgetStability: forgetStability,
    review: review, cardRetrievability: cardRetrievability, buildRound: buildRound,
    replay: replay, logLoss: logLoss, holdoutLoss: holdoutLoss, pretrain: pretrain,
    Optimiser: Optimiser, rebuildCards: rebuildCards, calibration: calibration
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SRS;
  else root.SRS = SRS;
})(this);

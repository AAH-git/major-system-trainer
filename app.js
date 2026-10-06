(function () {
  "use strict";

  var ROUND_LENGTH = 10;

  // All 110 expected numbers: 0-9 then 00-99.
  var EXPECTED = [];
  for (var d = 0; d < 10; d++) EXPECTED.push(String(d));
  for (var dd = 0; dd < 100; dd++) EXPECTED.push(dd < 10 ? "0" + dd : String(dd));

  var items = Array.isArray(window.MAJOR_ITEMS) ? window.MAJOR_ITEMS : [];

  var state = {
    mode: null,      // "numbers" | "images" | "mixed"
    questions: [],   // [{ item, type: "number" | "image" }]
    index: 0,
    known: 0,
    missed: []
  };

  function $(id) { return document.getElementById(id); }

  function showScreen(name) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
    $("screen-" + name).classList.add("active");
    window.scrollTo(0, 0);
    if (name === "menu") updateDueLine();
  }

  // ---------- Menu ----------

  function initMenu() {
    var warning = $("manifest-warning");
    if (items.length === 0) {
      warning.hidden = false;
      warning.textContent = "No images found. Add your images to the images/ folder and run " +
        "tools/build-manifest (see README).";
      var modes = document.querySelectorAll(".mode:not(#btn-stats)");
      for (var i = 0; i < modes.length; i++) modes[i].disabled = true;
    } else {
      var have = {};
      items.forEach(function (it) { have[it.num] = true; });
      var missing = EXPECTED.filter(function (n) { return !have[n]; });
      if (missing.length) {
        warning.hidden = false;
        warning.textContent = "Missing images for " + missing.length + " number(s): " +
          missing.join(", ") + ". You can still play with the rest.";
      }
    }
    $("item-count").textContent = items.length + " of " + EXPECTED.length + " images loaded";
  }

  // ---------- Round ----------

  function startRound(mode) {
    state.mode = mode;
    state.index = 0;
    state.known = 0;
    state.missed = [];
    // Spaced repetition picks the cards; a card id says which way round to ask ("n:07" / "i:07").
    var ids = SRS.buildRound(srs.cards, cardPool(mode), ROUND_LENGTH, Date.now(), srs.params,
      { newPriority: newCardPriority });
    var byNum = itemsByNum();
    state.questions = ids.map(function (id) {
      return { id: id, item: byNum[id.slice(2)], type: id.charAt(0) === "n" ? "number" : "image" };
    });

    // Preload every image used this round (prompts and the results thumbnails).
    state.questions.forEach(function (q) { new Image().src = q.item.src; });

    showScreen("question");
    renderQuestion();
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    var total = state.questions.length;
    var answered = state.index;

    $("progress").textContent = "Question " + (state.index + 1) + "/" + total;
    $("live-score").textContent = "✓ " + state.known + "  ✗ " + (answered - state.known);

    var num = $("prompt-number");
    var img = $("prompt-image");
    if (q.type === "number") {
      img.hidden = true;
      img.removeAttribute("src");
      num.hidden = false;
      num.textContent = q.item.num;
    } else {
      num.hidden = true;
      img.hidden = false;
      img.alt = "Image to recall (missing file?)";
      img.src = q.item.src;
    }
  }

  function answer(knewIt) {
    if (!$("screen-question").classList.contains("active")) return;
    var q = state.questions[state.index];
    recordAnswer(q.type, q.item.num, knewIt);
    scheduleAnswer(q.id, knewIt);
    if (knewIt) state.known++;
    else state.missed.push(q);

    state.index++;
    if (state.index >= state.questions.length) showResults();
    else renderQuestion();
  }

  // ---------- Results ----------

  function showResults() {
    var total = state.questions.length;
    $("final-score").textContent = state.known + " / " + total;

    var list = $("missed-list");
    list.innerHTML = "";

    if (state.missed.length === 0) {
      $("missed-title").textContent = "Perfect round — you knew them all!";
    } else {
      $("missed-title").textContent = "To review (" + state.missed.length + "):";
      state.missed.forEach(function (q) {
        var extra = state.mode === "mixed"
          ? (q.type === "number" ? "shown as number" : "shown as image")
          : null;
        list.appendChild(buildCard(q.item, extra));
      });
    }

    showScreen("results");
  }

  // Card with image, number and word. Shared by the results and review grids.
  function buildCard(item, extraText) {
    var li = document.createElement("li");

    var img = document.createElement("img");
    img.src = item.src;
    img.alt = "Image for " + item.num;
    img.loading = "lazy";
    li.appendChild(img);

    var num = document.createElement("div");
    num.className = "card-num";
    num.textContent = item.num;
    li.appendChild(num);

    if (item.word) {
      var word = document.createElement("div");
      word.className = "card-word";
      word.textContent = item.word;
      li.appendChild(word);
    }

    if (extraText) {
      var extra = document.createElement("div");
      extra.className = "card-extra";
      extra.textContent = extraText;
      li.appendChild(extra);
    }

    return li;
  }

  // ---------- Review ----------

  // 11 sets: 0-9, 00-09, 10-19, ... 90-99.
  var SETS = [];
  for (var s = 0; s < EXPECTED.length; s += 10) SETS.push(EXPECTED.slice(s, s + 10));

  function setLabel(set) { return set[0] + "–" + set[set.length - 1]; }

  var reviewIndex = 0;

  function initSetPicker() {
    var picker = $("set-picker");
    SETS.forEach(function (set, i) {
      var b = document.createElement("button");
      b.textContent = setLabel(set);
      b.addEventListener("click", function () { openReview(i); });
      picker.appendChild(b);
    });
  }

  function openReview(index) {
    reviewIndex = (index + SETS.length) % SETS.length;
    var set = SETS[reviewIndex];

    var byNum = {};
    items.forEach(function (it) { byNum[it.num] = it; });

    $("review-title").textContent = "Review " + setLabel(set);

    var buttons = $("set-picker").children;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", i === reviewIndex);
    }

    var grid = $("review-grid");
    grid.innerHTML = "";
    set.forEach(function (n) {
      if (byNum[n]) {
        grid.appendChild(buildCard(byNum[n], null));
      } else {
        var li = document.createElement("li");
        li.className = "missing";
        li.innerHTML = '<div class="missing-box">no image</div><div class="card-num"></div>';
        li.querySelector(".card-num").textContent = n;
        grid.appendChild(li);
      }
    });

    showScreen("review");
  }

  // ---------- Performance stats (saved in this browser only) ----------

  var STATS_KEY = "majorTrainer.stats.v1";
  var storageOk = true;
  var stats = loadStats();
  var statsView = { type: "number", sort: "number" };

  function emptyStats() { return { number: {}, image: {} }; }

  function loadStats() {
    var raw = null;
    try { raw = localStorage.getItem(STATS_KEY); } catch (e) { storageOk = false; }
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.number && parsed.image) return parsed;
    } catch (e) { /* corrupt data: start fresh */ }
    return emptyStats();
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function recordAnswer(type, num, knew) {
    var entry = stats[type][num] || (stats[type][num] = { known: 0, total: 0 });
    entry.total++;
    if (knew) entry.known++;
    saveStats();
  }

  // ---------- Spaced repetition (FSRS-6, see srs.js) ----------

  var SRS_KEY = "majorTrainer.srs.v1";
  var SRS_LOG_KEY = "majorTrainer.srslog.v1";
  var LOG_CAP = 50000;

  // 220 cards: each number asked both ways. The log stores a card's index in this list.
  var CARD_IDS = EXPECTED.map(function (n) { return "n:" + n; })
    .concat(EXPECTED.map(function (n) { return "i:" + n; }));
  var CARD_INDEX = {};
  CARD_IDS.forEach(function (id, i) { CARD_INDEX[id] = i; });

  var srs = loadSrs();
  var srsLog = loadSrsLog();
  var optimising = false;

  function emptySrs() {
    return { cards: {}, params: SRS.DEFAULT_PARAMS.slice(), fit: { stage: "default", n: 0, at: 0 } };
  }

  function loadSrs() {
    try {
      var parsed = JSON.parse(localStorage.getItem(SRS_KEY));
      if (parsed && parsed.cards && Array.isArray(parsed.params) &&
          parsed.params.length === SRS.DEFAULT_PARAMS.length && parsed.fit) return parsed;
    } catch (e) { /* blocked or corrupt: start fresh */ }
    return emptySrs();
  }

  function loadSrsLog() {
    try {
      var parsed = JSON.parse(localStorage.getItem(SRS_LOG_KEY));
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* blocked or corrupt: start fresh */ }
    return [];
  }

  function saveSrs() {
    try {
      localStorage.setItem(SRS_KEY, JSON.stringify(srs));
      localStorage.setItem(SRS_LOG_KEY, JSON.stringify(srsLog));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  function itemsByNum() {
    var byNum = {};
    items.forEach(function (it) { byNum[it.num] = it; });
    return byNum;
  }

  // Card ids a mode can ask about (only numbers that have an image).
  function cardPool(mode) {
    var ids = [];
    items.forEach(function (it) {
      if (mode !== "images") ids.push("n:" + it.num);
      if (mode !== "numbers") ids.push("i:" + it.num);
    });
    return ids;
  }

  // Order for introducing unpractised cards: weakest Performance % first, never-asked last.
  function newCardPriority(id) {
    var e = stats[id.charAt(0) === "n" ? "number" : "image"][id.slice(2)];
    return e && e.total ? e.known / e.total : 2;
  }

  function scheduleAnswer(id, knew) {
    var now = Date.now();
    var g = knew ? SRS.GOOD : SRS.AGAIN;
    srs.cards[id] = SRS.review(srs.cards[id], g, now, srs.params, id);
    srsLog.push([CARD_INDEX[id], Math.round(now / 1000), g]);
    if (srsLog.length > LOG_CAP) {
      srsLog.splice(0, srsLog.length - LOG_CAP);
      srs.fit.truncated = true; // early history gone: don't rebuild cards from the log any more
    }
    saveSrs();
  }

  function dueLabel(card, now) {
    if (!card) return "New";
    var ms = card.due - now;
    if (ms <= 0) return "Due";
    if (ms < 3600000) return "in " + Math.max(1, Math.round(ms / 60000)) + "m";
    var hours = Math.round(ms / 3600000);
    if (hours < 24) return "in " + hours + "h";
    return "in " + Math.max(1, Math.round(ms / SRS.DAY_MS)) + "d";
  }

  function scheduleCounts(ids, now) {
    var due = 0, fresh = 0, next = null;
    ids.forEach(function (id) {
      var c = srs.cards[id];
      if (!c) fresh++;
      else if (c.due <= now) due++;
      else if (!next || c.due < next.due) next = c;
    });
    return { due: due, fresh: fresh, next: next };
  }

  function updateDueLine() {
    var line = $("due-line");
    if (!items.length) { line.textContent = ""; return; }
    var now = Date.now();
    var c = scheduleCounts(cardPool("mixed"), now);
    var parts = [];
    if (c.due) parts.push(c.due + " due for review");
    if (c.fresh) parts.push(c.fresh + " not yet practised");
    line.textContent = parts.length ? parts.join(" · ")
      : "All caught up · next review " + dueLabel(c.next, now);
  }

  function maybeOptimise(force) {
    if (optimising) return;
    var n = srsLog.length, last = srs.fit.n || 0;
    if (n < SRS.CONFIG.pretrainMin) return;
    if (!force && n - last < Math.max(50, 0.2 * last)) return;

    optimising = true;
    renderModelLine();
    var opt = new SRS.Optimiser(srsLog.slice(), srs.params);

    // Run in short slices so the page stays responsive.
    (function tick() {
      var start = Date.now();
      while (!opt.step()) {
        if (Date.now() - start > 30) { setTimeout(tick, 0); return; }
      }
      var res = opt.result;
      if (res.accepted) {
        srs.params = res.params;
        if (!srs.fit.truncated) srs.cards = SRS.rebuildCards(srsLog, CARD_IDS, srs.params);
      }
      srs.fit = {
        stage: res.accepted ? res.stage : srs.fit.stage,
        n: n,
        at: Date.now(),
        truncated: srs.fit.truncated,
        lastCheck: { stage: res.stage, accepted: res.accepted }
      };
      saveSrs();
      optimising = false;
      if ($("screen-stats").classList.contains("active")) renderStats();
      updateDueLine();
    })();
  }

  function renderModelLine() {
    var n = srsLog.length;
    var text;
    if (optimising) {
      text = "Optimising your schedule…";
    } else {
      if (srs.fit.stage === "full") text = "Schedule fully personalised from " + srs.fit.n + " answers";
      else if (srs.fit.stage === "pretrain") text = "Schedule partly personalised from " + srs.fit.n + " answers";
      else if (n < SRS.CONFIG.pretrainMin) {
        text = "Schedule uses FSRS default settings. Personalisation starts at " +
          SRS.CONFIG.pretrainMin + " answers (you have " + n + ")";
      } else text = "Schedule uses FSRS default settings · " + n + " answers logged";

      var cal = SRS.calibration(srsLog, srs.params);
      if (cal && cal.count >= 20) {
        text += " · predicted recall " + Math.round(cal.predicted * 100) + "%, actual " +
          Math.round(cal.actual * 100) + "%";
      }
      var lc = srs.fit.lastCheck;
      if (lc && !lc.accepted && lc.stage !== "default") {
        text += " · last check found no improvement, kept current settings";
      }
      text += ".";
    }
    $("stats-model").textContent = text;
    var btn = $("btn-optimise");
    btn.disabled = optimising || n < SRS.CONFIG.pretrainMin;
    btn.textContent = optimising ? "Optimising…" : "Re-optimise now";
  }

  function openStats(type, sort) {
    statsView.type = type;
    statsView.sort = sort;
    renderStats();
    showScreen("stats");
  }

  function renderStats() {
    var data = stats[statsView.type];

    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute("data-type") === statsView.type;
      tabs[i].classList.toggle("active", on);
      tabs[i].setAttribute("aria-selected", on ? "true" : "false");
    }
    var sorts = document.querySelectorAll(".sort");
    for (var j = 0; j < sorts.length; j++) {
      sorts[j].classList.toggle("active", sorts[j].getAttribute("data-sort") === statsView.sort);
    }
    $("stats-note").hidden = storageOk;

    var byNum = itemsByNum();
    var prefix = statsView.type === "number" ? "n:" : "i:";
    var now = Date.now();

    var rows = EXPECTED.map(function (n, order) {
      var e = data[n];
      var card = srs.cards[prefix + n];
      return {
        num: n,
        order: order,
        item: byNum[n],
        known: e ? e.known : 0,
        total: e ? e.total : 0,
        pct: e && e.total ? e.known / e.total : null,
        due: card ? card.due : Infinity,
        dueText: dueLabel(card, now)
      };
    });

    var sched = scheduleCounts(cardPool(statsView.type === "number" ? "numbers" : "images"), now);
    $("stats-schedule").textContent = sched.due + " due now · " + sched.fresh + " not yet practised" +
      (sched.due === 0 && sched.next ? " · next review " + dueLabel(sched.next, now) : "");
    renderModelLine();

    var answers = 0, knownSum = 0, seen = 0;
    rows.forEach(function (r) {
      answers += r.total;
      knownSum += r.known;
      if (r.total) seen++;
    });
    $("stats-summary").textContent = answers === 0
      ? "No answers yet. Play a round to start tracking."
      : answers + " answers · " + Math.round(100 * knownSum / answers) + "% known · " +
        seen + " of " + EXPECTED.length + " seen";

    if (statsView.sort === "weakest") {
      rows.sort(function (a, b) {
        if (a.pct === null || b.pct === null) {
          if (a.pct === null && b.pct === null) return a.order - b.order;
          return a.pct === null ? 1 : -1;
        }
        return (a.pct - b.pct) || (b.total - a.total) || (a.order - b.order);
      });
    } else if (statsView.sort === "due") {
      rows.sort(function (a, b) {
        if (a.due === b.due) return a.order - b.order;
        return a.due < b.due ? -1 : 1;
      });
    }

    var list = $("stats-list");
    list.innerHTML = "";
    rows.forEach(function (r) { list.appendChild(buildStatsRow(r)); });
  }

  function buildStatsRow(r) {
    var li = document.createElement("li");
    if (r.pct === null) li.className = "unseen";

    if (r.item) {
      var img = document.createElement("img");
      img.src = r.item.src;
      img.alt = "";
      img.loading = "lazy";
      li.appendChild(img);
    } else {
      li.appendChild(document.createElement("span")).className = "thumb-missing";
    }

    var label = document.createElement("div");
    label.className = "stats-label";
    var num = document.createElement("span");
    num.className = "stats-num";
    num.textContent = r.num;
    label.appendChild(num);
    if (r.item && r.item.word) {
      var word = document.createElement("span");
      word.className = "stats-word";
      word.textContent = r.item.word;
      label.appendChild(word);
    }
    li.appendChild(label);

    var bar = document.createElement("div");
    bar.className = "bar";
    var fill = document.createElement("div");
    if (r.pct !== null) {
      fill.className = "bar-fill " + (r.pct < 0.5 ? "low" : r.pct < 0.8 ? "mid" : "high");
      fill.style.width = Math.round(r.pct * 100) + "%";
    }
    bar.appendChild(fill);
    li.appendChild(bar);

    var pct = document.createElement("div");
    pct.className = "stats-pct";
    pct.textContent = r.pct === null
      ? "—"
      : Math.round(r.pct * 100) + "% (" + r.known + "/" + r.total + ")";
    var due = document.createElement("span");
    due.className = "stats-due" + (r.dueText === "Due" ? " is-due" : "");
    due.textContent = r.dueText;
    pct.appendChild(due);
    li.appendChild(pct);

    return li;
  }

  // ---------- Wiring ----------

  var modeButtons = document.querySelectorAll(".mode[data-mode]");
  for (var i = 0; i < modeButtons.length; i++) {
    modeButtons[i].addEventListener("click", function () {
      startRound(this.getAttribute("data-mode"));
    });
  }

  $("btn-know").addEventListener("click", function () { answer(true); });
  $("btn-dont-know").addEventListener("click", function () { answer(false); });
  $("btn-quit").addEventListener("click", function () { showScreen("menu"); });
  $("btn-again").addEventListener("click", function () { startRound(state.mode); });
  $("btn-menu").addEventListener("click", function () { showScreen("menu"); });

  $("btn-review").addEventListener("click", function () { openReview(0); });
  $("btn-review-quit").addEventListener("click", function () { showScreen("menu"); });
  $("btn-set-prev").addEventListener("click", function () { openReview(reviewIndex - 1); });
  $("btn-set-next").addEventListener("click", function () { openReview(reviewIndex + 1); });

  $("btn-stats").addEventListener("click", function () { openStats("number", "number"); });
  $("btn-stats-quit").addEventListener("click", function () { showScreen("menu"); });
  var tabButtons = document.querySelectorAll(".tab");
  for (var t = 0; t < tabButtons.length; t++) {
    tabButtons[t].addEventListener("click", function () {
      statsView.type = this.getAttribute("data-type");
      renderStats();
    });
  }
  var sortButtons = document.querySelectorAll(".sort");
  for (var so = 0; so < sortButtons.length; so++) {
    sortButtons[so].addEventListener("click", function () {
      statsView.sort = this.getAttribute("data-sort");
      renderStats();
    });
  }
  $("btn-stats-reset").addEventListener("click", function () {
    if (!confirm("Reset all performance stats and your spaced-repetition schedule? " +
                 "This can't be undone.")) return;
    stats = emptyStats();
    srs = emptySrs();
    srsLog = [];
    try {
      localStorage.removeItem(STATS_KEY);
      localStorage.removeItem(SRS_KEY);
      localStorage.removeItem(SRS_LOG_KEY);
    } catch (e) { /* storage blocked */ }
    renderStats();
  });
  $("btn-optimise").addEventListener("click", function () { maybeOptimise(true); });

  document.addEventListener("keydown", function (e) {
    if ($("screen-question").classList.contains("active")) {
      if (e.key === "ArrowRight") { e.preventDefault(); answer(true); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); answer(false); }
    } else if ($("screen-review").classList.contains("active")) {
      if (e.key === "ArrowRight") { e.preventDefault(); openReview(reviewIndex + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); openReview(reviewIndex - 1); }
    }
  });

  initSetPicker();
  initMenu();
  updateDueLine();
  setTimeout(function () { maybeOptimise(false); }, 1500);
})();

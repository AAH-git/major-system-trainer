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
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
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
    state.questions = shuffle(items).slice(0, ROUND_LENGTH).map(function (item) {
      var type = mode === "numbers" ? "number"
               : mode === "images" ? "image"
               : (Math.random() < 0.5 ? "number" : "image");
      return { item: item, type: type };
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

    var byNum = {};
    items.forEach(function (it) { byNum[it.num] = it; });

    var rows = EXPECTED.map(function (n, order) {
      var e = data[n];
      return {
        num: n,
        order: order,
        item: byNum[n],
        known: e ? e.known : 0,
        total: e ? e.total : 0,
        pct: e && e.total ? e.known / e.total : null
      };
    });

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
    if (!confirm("Reset all performance stats? This can't be undone.")) return;
    stats = emptyStats();
    try { localStorage.removeItem(STATS_KEY); } catch (e) { /* storage blocked */ }
    renderStats();
  });

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
})();

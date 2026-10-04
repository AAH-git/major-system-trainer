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
      var modes = document.querySelectorAll(".mode");
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
        var li = document.createElement("li");

        var img = document.createElement("img");
        img.src = q.item.src;
        img.alt = "Image for " + q.item.num;
        img.loading = "lazy";
        li.appendChild(img);

        var num = document.createElement("div");
        num.className = "missed-num";
        num.textContent = q.item.num;
        li.appendChild(num);

        if (q.item.word) {
          var word = document.createElement("div");
          word.className = "missed-word";
          word.textContent = q.item.word;
          li.appendChild(word);
        }

        if (state.mode === "mixed") {
          var shown = document.createElement("div");
          shown.className = "missed-shown";
          shown.textContent = q.type === "number" ? "shown as number" : "shown as image";
          li.appendChild(shown);
        }

        list.appendChild(li);
      });
    }

    showScreen("results");
  }

  // ---------- Wiring ----------

  var modeButtons = document.querySelectorAll(".mode");
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

  document.addEventListener("keydown", function (e) {
    if (!$("screen-question").classList.contains("active")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); answer(true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); answer(false); }
  });

  initMenu();
})();

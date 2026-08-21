// ===== garden =====
(function () {
var s = window.activeStore();
var page = document.getElementById("page-garden");
if (!s || !page) return;
var G = "garden-data";
var PLOTS = 6;
var PI = 1800;
function pn() { return s.get("lbl-partner") || "TA"; }
function load() { try { var d = JSON.parse(s.get(G) || "{}"); if (!d.p) d.p = []; while (d.p.length < PLOTS) d.p.push(null); if (!d.l) d.l = []; if (!d.lpc) d.lpc = 0; if (!d.dex) d.dex = {}; if (!d.exp) d.exp = 0; if (!d.inv) d.inv = {}; if (!d.st) d.st = { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }; return d; } catch (e) { return { p: new Array(PLOTS).fill(null), l: [], lpc: 0, dex: {}, exp: 0, inv: {}, st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 } }; } }
function save(d) { try { s.set(G, JSON.stringify(d)); try { if (window.idbSet) window.idbSet(window.activePrefix() + ":" + G, JSON.stringify(d)); } catch (e2) {} } catch (e) {} }
(function r() { try { if (!window.idbGet) return; var pf = window.activePrefix(); if (!s.get(G)) window.idbGet(pf + ":" + G).then(function (v) { if (window.activePrefix() !== pf || !v) return; try { s.set(G, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} }); } catch (e) {} })();

var T = {
  rose: { n: "\u73AB\u7470", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF39"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1 },
  sunflower: { n: "\u5411\u65E5\u8475", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3B"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 518400], xp: 40, lv: 2 },
  tulip: { n: "\u90C1\u91D1\u9999", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF37"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1 },
  cactus: { n: "\u4ED9\u4EBA\u638C", e: ["\uD83C\uDF31", "\uD83C\uDF35"], sn: ["\u5C0F\u82BD", "\u6210\u578B"], g: [432000], xp: 50, lv: 4 },
  lavender: { n: "\u85B0\u8863\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83D\uDC90"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 345600], xp: 25, lv: 3 },
  daisy: { n: "\u96CF\u83CA", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3C"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 259200], xp: 20, lv: 1 }
};
var WM = [
  "\u4ECA\u5929\u4E5F\u8F9B\u82E6\u5566\uFF0C\u82B1\u82B1\u4EEC\u4E5F\u5728\u52AA\u529B\u957F\u5927\u54E6",
  "\u7ED9\u4F60\u7684\u5C0F\u82B1\u6D47\u4E86\u70B9\u6C34\uFF0C\u8981\u5FEB\u5FEB\u957F\u5927\u54E6",
  "\u770B\u7740\u82B1\u56ED\u91CC\u7684\u82B1\u82B1\uFF0C\u5C31\u60F3\u5230\u4F60\u4E86",
  "\u4ECA\u5929\u5FC3\u60C5\u4E0D\u9519\uFF0C\u987A\u4FBF\u7167\u987E\u4E86\u4E0B\u82B1\u56ED",
  "\u8FD9\u6735\u82B1\u5FEB\u5F00\u4E86\uFF0C\u7B49\u4F60\u6765\u770B",
  "\u6D47\u5B8C\u6C34\u4E86\uFF0C\u8BB0\u5F97\u591A\u4F11\u606F\u54E6",
  "\u82B1\u56ED\u91CC\u90FD\u662F\u6211\u4EEC\u4E00\u8D77\u79CD\u4E0B\u7684\uFF0C\u8981\u4E00\u76F4\u7167\u987E\u4E0B\u53BB"
];
var W = [
  { i: "\u2600\uFE0F", t: "\u6674\u6717" },
  { i: "\u26C5", t: "\u591A\u4E91" },
  { i: "\uD83C\uDF27\uFE0F", t: "\u5C0F\u96E8" },
  { i: "\uD83C\uDF08", t: "\u653E\u6674" }
];
var S = ["\uD83C\uDF38 \u6625\u5B63", "\u2600\uFE0F \u590F\u5B63", "\uD83C\uDF42 \u79CB\u5B63", "\u2744\uFE0F \u51AC\u5B63"];

function wx() { var d = new Date(); return W[(d.getDate() + d.getMonth() + d.getHours()) % 4]; }
function sea() { return S[Math.floor(new Date().getMonth() / 3) % 4]; }

var data = load();
var selPlot = -1;

function stageInfo(plot) {
  if (!plot) return null;
  var tp = T[plot.type]; if (!tp) return null;
  var now = Math.floor(Date.now() / 1000);
  var elapsed = now - plot.planted;
  var stage = 0;
  for (var i = 0; i < tp.g.length; i++) { if (elapsed >= tp.g[i]) stage = i + 1; else break; }
  var stageMax = tp.g.length;
  var bloomed = stage >= stageMax;
  var progress = bloomed ? 1 : (elapsed - (stage > 0 ? tp.g.slice(0, stage).reduce(function (a, b) { return a + b; }, 0) : 0)) / (tp.g[stage] || 1);
  var nextSec = bloomed ? 0 : (tp.g.slice(0, stage + 1).reduce(function (a, b) { return a + b; }, 0) - elapsed);
  return { key: plot.type, name: tp.n, stage: stage, stageMax: stageMax, stageName: tp.sn[Math.min(stage, tp.sn.length - 1)], emoji: tp.e[Math.min(stage, tp.e.length - 1)], bloomed: bloomed, progress: progress, nextSec: nextSec, plantedBy: plot.by || "\u6211" };
}

function waterLvl(plot) {
  if (!plot || !plot.watered) return 0;
  return Math.max(0, 1 - (Math.floor(Date.now() / 1000) - plot.watered) / 86400);
}

function gLv() { return Math.floor(Math.sqrt((data.exp || 0) / 10)) + 1; }
function gLvProg() { var lv = gLv(); var cur = (lv - 1) * (lv - 1) * 10; var nxt = lv * lv * 10; return { cur: data.exp - cur, max: nxt - cur, lv: lv }; }
function unlocked(type) { var tp = T[type]; if (!tp) return false; return gLv() >= (tp.lv || 1); }
function updDex(type, act) { if (!data.dex[type]) data.dex[type] = { p: 0, h: 0 }; if (act === "p") data.dex[type].p++; if (act === "h") data.dex[type].h++; }
function updSt(act, me) { var k = act; if (me) data.st[k] = (data.st[k] || 0) + 1; else data.st["m" + k] = (data.st["m" + k] || 0) + 1; }

var curWeather = wx();
var curSeason = sea();

function renderWeather() {
  var wi = document.getElementById("garden-weather-ico");
  var wt = document.getElementById("garden-weather-txt");
  var ws = document.getElementById("garden-season");
  if (wi) wi.textContent = curWeather.i;
  if (wt) wt.textContent = curWeather.t;
  if (ws) ws.textContent = curSeason;
}

function fmtRemain(sec) {
  if (sec <= 0) return "";
  var d = Math.floor(sec / 86400);
  var h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return "\u8FD8\u9700 " + d + "\u5929" + (h > 0 ? " " + h + "\u65F6" : "");
  if (h > 0) return "\u8FD8\u9700 " + h + "\u65F6";
  var m = Math.floor(sec / 60);
  return "\u8FD8\u9700 " + (m > 0 ? m : 1) + "\u5206";
}

function renderGrid() {
  var grid = document.getElementById("garden-grid");
  if (!grid) return;
  var h = "";
  for (var i = 0; i < PLOTS; i++) {
    var plot = data.p[i];
    var si = stageInfo(plot);
    var wl = waterLvl(plot);
    var cls = "garden-plot" + (si ? "" : " empty") + (wl > 0 ? " watered" : "") + (selPlot === i ? " selected" : "");
    h += "<div class=\"" + cls + "\" data-idx=\"" + i + "\">";
    if (si) {
      h += "<span class=\"garden-plant-emoji\">" + si.emoji + "</span>";
      h += "<span class=\"garden-plant-name\">" + si.name + "</span>";
      if (si.bloomed) {
        h += "<span class=\"garden-plant-stage\">\u5DF2\u6210\u719F\u2714</span>";
      } else {
        h += "<span class=\"garden-plant-stage\">" + si.stageName + " \u00b7 " + fmtRemain(si.nextSec) + "</span>";
        h += "<div class=\"garden-grow-bar\"><div class=\"garden-grow-fill\" style=\"width:" + Math.round(si.progress * 100) + "%\"></div></div>";
      }
      if (wl > 0) h += "<div class=\"garden-water-bar\"><div class=\"garden-water-fill\" style=\"width:" + Math.round(wl * 100) + "%\"></div></div>";
    } else {
      h += "<span class=\"garden-plant-emoji\">\uD83C\uDF31</span>";
      h += "<span class=\"garden-plot-empty-txt\">\u7A7A\u5730</span>";
    }
    h += "</div>";
  }
  grid.innerHTML = h;
}

function renderLog() {
  var el = document.getElementById("garden-log-list");
  if (!el) return;
  var entries = (data.l || []).slice(-20).reverse();
  if (!entries.length) { el.innerHTML = "<div class=\"garden-log-item\">\u8FD8\u6CA1\u6709\u8BB0\u5F55\FF0C\u5F00\u59CB\u6253\u7406\u82B1\u56ED\u5427</div>"; return; }
  var h = "";
  entries.forEach(function (e) {
    var tm = e.tm ? new Date(e.tm * 1000) : new Date();
    var ts = tm.getHours().toString().padStart(2, "0") + ":" + tm.getMinutes().toString().padStart(2, "0");
    h += "<div class=\"garden-log-item\"><span class=\"who\">" + (e.who || "") + "</span><span class=\"act\">" + (e.act || "") + "</span><span class=\"tm\">" + ts + "</span></div>";
  });
  el.innerHTML = h;
}

function addLog(who, act) {
  data.l.push({ who: who, act: act, tm: Math.floor(Date.now() / 1000) });
  if (data.l.length > 100) data.l = data.l.slice(-100);
}

function waterPlot(idx) {
  if (idx < 0 || idx >= PLOTS) return;
  var plot = data.p[idx];
  if (!plot) return;
  if (!plot.watered) plot.watered = Math.floor(Date.now() / 1000);
  else { var sec = Math.floor(Date.now() / 1000) - plot.watered; if (sec < 3600) return; plot.watered = Math.floor(Date.now() / 1000); }
  var si = stageInfo(plot);
  plot.planted = Math.max(0, plot.planted - 14400);
  addLog("\u6211", "\u7ED9 " + (si ? si.name : "\u7A7A\u5730") + " \u6D47\u4E86\u6C34");
  updSt("w", true);
  save(data); renderAll();
}

function plantSeed(idx, type) {
  if (idx < 0 || idx >= PLOTS) return;
  if (data.p[idx]) return;
  if (!unlocked(type)) return;
  var tp = T[type]; if (!tp) return;
  data.p[idx] = { type: type, planted: Math.floor(Date.now() / 1000), by: "\u6211" };
  addLog("\u6211", "\u79CD\u4E0B\u4E86\u4E00\u68F5 " + tp.n);
  updDex(type, "p");
  updSt("p", true);
  save(data); renderAll();
}

function fertilizePlot(idx) {
  if (idx < 0 || idx >= PLOTS) return;
  var plot = data.p[idx];
  if (!plot) return;
  plot.planted = Math.max(0, plot.planted - 43200);
  var si = stageInfo(plot);
  addLog("\u6211", "\u7ED9 " + (si ? si.name : "\u7A7A\u5730") + " \u65BD\u4E86\u80A5");
  updSt("f", true);
  save(data); renderAll();
}

function harvestPlot(idx) {
  if (idx < 0 || idx >= PLOTS) return;
  var plot = data.p[idx];
  if (!plot) return;
  var si = stageInfo(plot);
  if (!si || !si.bloomed) return;
  var name = si.name;
  var type = plot.type;
  var tp = T[type];
  data.p[idx] = null;
  data.exp = (data.exp || 0) + (tp ? tp.xp : 10);
  data.inv[type] = (data.inv[type] || 0) + 1;
  updDex(type, "h");
  updSt("h", true);
  addLog("\u6211", "\u6536\u83B7\u4E86 " + name + " (+" + (tp ? tp.xp : 10) + "\u7ECF\u9A8C)");
  save(data); renderAll();
}


function partnerAct(silent) {
  var pName = pn();
  var r = Math.random();
  var emptyPlots = [];
  var plantedPlots = [];
  var bloomedPlots = [];
  var dryPlots = [];
  for (var i = 0; i < PLOTS; i++) {
    if (!data.p[i]) emptyPlots.push(i);
    else {
      plantedPlots.push(i);
      var si = stageInfo(data.p[i]);
      if (si && si.bloomed) bloomedPlots.push(i);
      if (waterLvl(data.p[i]) < 0.3) dryPlots.push(i);
    }
  }
  var acted = false;
  if (r < 0.2 && emptyPlots.length > 0) {
    var idx = emptyPlots[Math.floor(Math.random() * emptyPlots.length)];
    var keys = Object.keys(T).filter(function (k) { return unlocked(k); });
    if (keys.length > 0) {
      var t = keys[Math.floor(Math.random() * keys.length)];
      var tp = T[t];
      data.p[idx] = { type: t, planted: Math.floor(Date.now() / 1000), by: pName };
      addLog(pName, "\u79CD\u4E0B\u4E86\u4E00\u68F5 " + tp.n);
      updDex(t, "p"); updSt("p", false);
      acted = true;
    }
  } else if (r < 0.55 && dryPlots.length > 0) {
    var idx = dryPlots[Math.floor(Math.random() * dryPlots.length)];
    var si = stageInfo(data.p[idx]);
    data.p[idx].watered = Math.floor(Date.now() / 1000);
    data.p[idx].planted = Math.max(0, data.p[idx].planted - 7200);
    addLog(pName, "\u7ED9 " + (si ? si.name : "\u690D\u7269") + " \u6D47\u4E86\u6C34");
    updSt("w", false);
    acted = true;
  } else if (r < 0.75 && bloomedPlots.length > 0) {
    var idx = bloomedPlots[Math.floor(Math.random() * bloomedPlots.length)];
    var si = stageInfo(data.p[idx]);
    var name = si ? si.name : "\u690D\u7269";
    var type = data.p[idx].type;
    var tp = T[type];
    data.p[idx] = null;
    data.exp = (data.exp || 0) + (tp ? tp.xp : 10);
    data.inv[type] = (data.inv[type] || 0) + 1;
    updDex(type, "h"); updSt("h", false);
    addLog(pName, "\u6536\u83B7\u4E86 " + name + " (+" + (tp ? tp.xp : 10) + "\u7ECF\u9A8C)");
    acted = true;
  } else if (r < 0.9 && plantedPlots.length > 0) {
    var idx = plantedPlots[Math.floor(Math.random() * plantedPlots.length)];
    var si = stageInfo(data.p[idx]);
    data.p[idx].planted = Math.max(0, data.p[idx].planted - 21600);
    addLog(pName, "\u7ED9 " + (si ? si.name : "\u690D\u7269") + " \u65BD\u4E86\u80A5");
    updSt("f", false);
    acted = true;
  }
  if (acted && Math.random() < 0.4) {
    var msg = WM[Math.floor(Math.random() * WM.length)];
    addLog(pName, "\uD83D\uDC95 " + msg);
  }
  data.lpc = Math.floor(Date.now() / 1000);
  save(data);
  if (!silent) renderAll();
  return acted;
}

function renderAll() {
  renderWeather();
  renderGrid();
  renderLog();
}

function checkPartnerPassive() {
  try {
    var d = load();
    var now = Math.floor(Date.now() / 1000);
    var last = d.lpc || 0;
    if (!last) { d.lpc = now; save(d); return; }
    var elapsed = now - last;
    if (elapsed < PI) return;
    var slots = Math.floor(elapsed / PI);
    if (slots > 8) slots = 8;
    data = d;
    var triggered = 0;
    for (var i = 0; i < slots; i++) {
      if (Math.random() < 0.35) {
        if (partnerAct(true)) triggered++;
      }
    }
    if (triggered > 0) {
      var pName = pn();
      addLog(pName, "\u6253\u7406\u4E86\u82B1\u56ED\uFF08\u540E\u53F0\uFF09");
      save(data);
    } else {
      data.lpc = now;
      save(data);
    }
  } catch (e) {}
}

function handlePlotClick(e) {
  var el = e.target.closest(".garden-plot");
  if (!el) return;
  var idx = parseInt(el.getAttribute("data-idx"));
  if (isNaN(idx)) return;
  if (data.p[idx]) {
    selPlot = selPlot === idx ? -1 : idx;
  } else {
    selPlot = idx;
  }
  renderGrid();
}

function handleTool(e) {
  var btn = e.target.closest(".garden-tool");
  if (!btn) return;
  var tool = btn.getAttribute("data-tool");
  if (tool === "water") {
    if (selPlot < 0) return;
    waterPlot(selPlot);
  } else if (tool === "fertilize") {
    if (selPlot < 0) return;
    fertilizePlot(selPlot);
  } else if (tool === "harvest") {
    if (selPlot < 0) return;
    harvestPlot(selPlot);
  } else if (tool === "plant") {
    if (selPlot < 0) return;
    if (data.p[selPlot]) return;
    if (!window.openModal) return;
    var keys = Object.keys(T);
    var pills = keys.map(function (k) {
      var tp = T[k];
      return { label: tp.e[tp.e.length - 1] + " " + tp.n, value: k };
    });
    window.openModal("\u9009\u62E9\u79CD\u690D", "", function (v) {
      if (v && T[v]) plantSeed(selPlot, v);
    }, { pills: pills, noInput: true });
  }
}

function openGarden() {
  var editing = Array.from(document.querySelectorAll(".app-grid")).some(function (g) { return g.classList.contains("editing"); });
  if (editing) return;
  document.querySelectorAll(".page").forEach(function (pg) { pg.hidden = true; });
  page.hidden = false;
  checkPartnerPassive();
  data = load();
  selPlot = -1;
  curWeather = wx();
  curSeason = sea();
  if (Math.random() < 0.3) partnerAct();
  renderAll();
}

var appBtn = document.querySelector('.app[data-app="garden"]');
if (appBtn && page) appBtn.addEventListener("click", openGarden);

var backBtn = document.getElementById("garden-back");
if (backBtn) backBtn.addEventListener("click", function () {
  document.querySelectorAll(".page").forEach(function (pg) { pg.hidden = true; });
  var home = document.getElementById("page-phone");
  if (home) home.hidden = false;
});

var gridEl = document.getElementById("garden-grid");
if (gridEl) gridEl.addEventListener("click", handlePlotClick);

var toolbarEl = document.getElementById("garden-toolbar");
if (toolbarEl) toolbarEl.addEventListener("click", handleTool);

document.addEventListener("contact-switched", function () {
  if (!page.hidden) { data = load(); selPlot = -1; renderAll(); }
});

(function watchHome() {
  var home = document.getElementById("page-phone");
  if (!home) return;
  var mo = new MutationObserver(function () {
    if (!home.hidden) {
      try { checkPartnerPassive(); } catch (e) {}
    }
  });
  mo.observe(home, { attributes: true, attributeFilter: ["hidden"] });
  if (!home.hidden) {
    try { checkPartnerPassive(); } catch (e) {}
  }
})();

})();
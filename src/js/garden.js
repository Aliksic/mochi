// ===== garden =====
(function () {
var s = window.activeStore();
var page = document.getElementById("page-garden");
if (!s || !page) return;
var G = "garden-data";
var PLOTS = 12;
var PI = 1800;
function pn() { return s.get("lbl-partner") || "TA"; }
function load() { try { var d = JSON.parse(s.get(G) || "{}"); if (!d.p) d.p = []; while (d.p.length < PLOTS) d.p.push(null); if (!d.l) d.l = []; if (!d.lpc) d.lpc = 0; if (!d.dex) d.dex = {}; if (!d.exp) d.exp = 0; if (!d.inv) d.inv = {}; if (!d.st) d.st = { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }; if (!d.decor) d.decor = {}; if (!d.visitor) d.visitor = null; return d; } catch (e) { return { p: new Array(PLOTS).fill(null), l: [], lpc: 0, dex: {}, exp: 0, inv: {}, st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }, decor: {}, visitor: null }; } }
function save(d) { try { s.set(G, JSON.stringify(d)); try { if (window.idbSet) window.idbSet(window.activePrefix() + ":" + G, JSON.stringify(d)); } catch (e2) {} } catch (e) {} }
(function r() { try { if (!window.idbGet) return; var pf = window.activePrefix(); if (!s.get(G)) window.idbGet(pf + ":" + G).then(function (v) { if (window.activePrefix() !== pf || !v) return; try { s.set(G, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} }); } catch (e) {} })();

var T = {
  rose: { n: "\u73AB\u7470", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF39"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1, ss: 3 },
  sunflower: { n: "\u5411\u65E5\u8475", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3B"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 518400], xp: 40, lv: 2, ss: 1 },
  tulip: { n: "\u90C1\u91D1\u9999", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF37"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1, ss: 0 },
  cactus: { n: "\u4ED9\u4EBA\u638C", e: ["\uD83C\uDF31", "\uD83C\uDF35"], sn: ["\u5C0F\u82BD", "\u6210\u578B"], g: [432000], xp: 50, lv: 4, ss: 1 },
  lavender: { n: "\u85B0\u8863\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83D\uDC90"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 345600], xp: 25, lv: 3, ss: 2 },
  daisy: { n: "\u96CF\u83CA", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3C"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 259200], xp: 20, lv: 1, ss: 0 },
  sakura: { n: "\u6A31\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF38"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 259200], xp: 25, lv: 1, ss: 0 },
  hibiscus: { n: "\u8299\u84C9", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3A"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 345600], xp: 35, lv: 1, ss: 1 },
  lotus: { n: "\u8377\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83E\uDEB7"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [259200, 432000], xp: 45, lv: 1, ss: 1 },
  clover: { n: "\u5E78\u8FD0\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF40"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u6210\u578B"], g: [43200, 129600], xp: 15, lv: 1, ss: 2 },
  camellia: { n: "\u5C71\u8336\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83D\uDCAE"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 259200], xp: 30, lv: 1, ss: 3 }
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

var DECOR = {
  fence: { n: "\u6728\u680F\u6746", e: "\uD83D\uDEE1\uFE0F", price: 50, max: 4, buff: { growth: 0.05, label: "\u751F\u957F+5%" } },
  light: { n: "\u5C0F\u8DEF\u706F", e: "\uD83D\uDCA1", price: 80, max: 2, buff: { growth: 0.08, label: "\u751F\u957F+8%" } },
  bench: { n: "\u957F\u6905", e: "\uD83E\uDD91", price: 120, max: 1, buff: { partner: 0.15, label: "\u68A6\u89D2\u5E38\u6765+15%" } },
  gnome: { n: "\u56ED\u4E11", e: "\uD83E\uDDD9", price: 100, max: 2, buff: { xp: 0.15, label: "\u7ECF\u9A8C+15%" } },
  windmill: { n: "\u98CE\u8F66", e: "\uD83C\uDF00", price: 150, max: 1, buff: { growth: 0.12, label: "\u751F\u957F+12%" } },
  fountain: { n: "\u55B7\u6CC9", e: "\u26F7\uFE0F", price: 200, max: 1, buff: { water: 0.5, label: "\u81EA\u52A8\u4FDD\u6C34" } }
};
var VISITORS = [
  { type: "butterfly", e: "\uD83E\uDE9B", n: "\u8774\u8776" },
  { type: "bee", e: "\uD83D\uDC1D", n: "\u871C\u8702" },
  { type: "bird", e: "\uD83D\uDC26", n: "\u5C0F\u9E1F" },
  { type: "ladybug", e: "\uD83D\uDC1E", n: "\u74E2\u866B" }
];

function wx() { var d = new Date(); return W[(d.getDate() + d.getMonth() + d.getHours()) % 4]; }
function sea() { return S[Math.floor(new Date().getMonth() / 3) % 4]; }

var data = load();
var selPlot = -1;

function stageInfo(plot) {
  if (!plot) return null;
  var tp = T[plot.type]; if (!tp) return null;
  var now = Math.floor(Date.now() / 1000);
  var elapsed = now - plot.planted;
  var seaIdx = Math.floor(new Date().getMonth() / 3) % 4;
  var seaBoost = (tp.ss === seaIdx) ? 1.3 : 0.85;
  var w = wx();
  var wBoost = (w.t === "\u6674\u6717") ? 1.1 : (w.t === "\u5C0F\u96E8") ? 0.9 : 1.0;
  var boost = seaBoost * wBoost * (1 + decorBuffs().growth);
  var eff = Math.floor(elapsed * boost);
  var stage = 0;
  for (var i = 0; i < tp.g.length; i++) { if (eff >= tp.g[i]) stage = i + 1; else break; }
  var stageMax = tp.g.length;
  var bloomed = stage >= stageMax;
  var progress = bloomed ? 1 : (eff - (stage > 0 ? tp.g.slice(0, stage).reduce(function (a, b) { return a + b; }, 0) : 0)) / (tp.g[stage] || 1);
  var nextSec = bloomed ? 0 : Math.ceil((tp.g.slice(0, stage + 1).reduce(function (a, b) { return a + b; }, 0) - eff) / boost);
  return { key: plot.type, name: tp.n, stage: stage, stageMax: stageMax, stageName: tp.sn[Math.min(stage, tp.sn.length - 1)], emoji: tp.e[Math.min(stage, tp.e.length - 1)], bloomed: bloomed, progress: progress, nextSec: nextSec, plantedBy: plot.by || "\u6211" };
}

function waterLvl(plot) {
  if (!plot || !plot.watered) return 0;
  return Math.max(0, 1 - (Math.floor(Date.now() / 1000) - plot.watered) / 86400);
}

function gLv() { return Math.floor(Math.sqrt((data.exp || 0) / 10)) + 1; }
function gLvProg() { var lv = gLv(); var cur = (lv - 1) * (lv - 1) * 10; var nxt = lv * lv * 10; return { cur: data.exp - cur, max: nxt - cur, lv: lv }; }
function unlocked(type) { return !!T[type]; }
function decorBuffs() {
  var b = { growth: 0, xp: 0, partner: 0, water: 0 };
  var keys = Object.keys(DECOR);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var cnt = data.decor[k] || 0;
    if (cnt <= 0) continue;
    var bf = DECOR[k].buff;
    if (!bf) continue;
    if (bf.growth) b.growth += bf.growth * cnt;
    if (bf.xp) b.xp += bf.xp * cnt;
    if (bf.partner) b.partner += bf.partner * cnt;
    if (bf.water) b.water += bf.water * cnt;
  }
  return b;
}
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

function fmtShort(sec) {
  if (sec <= 0) return "";
  var d = Math.floor(sec / 86400);
  var h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return d + "\u5929";
  if (h > 0) return h + "\u65F6";
  var m = Math.floor(sec / 60);
  return (m > 0 ? m : 1) + "\u5206";
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
        h += "<span class=\"garden-plant-stage\">\u6210\u719F</span>";
      } else {
        h += "<span class=\"garden-plant-stage\">" + fmtShort(si.nextSec) + "</span>";
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
  var xpg = Math.round((tp ? tp.xp : 10) * (1 + decorBuffs().xp));
  data.exp = (data.exp || 0) + xpg;
  data.inv[type] = (data.inv[type] || 0) + 1;
  updDex(type, "h");
  updSt("h", true);
  addLog("\u6211", "\u6536\u83B7\u4E86 " + name + " (+" + xpg + "\u7ECF\u9A8C)");
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
  if (r < 0.15 && emptyPlots.length > 0) {
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
  } else if (r < 0.35 && dryPlots.length > 0) {
    var idx = dryPlots[Math.floor(Math.random() * dryPlots.length)];
    var si = stageInfo(data.p[idx]);
    data.p[idx].watered = Math.floor(Date.now() / 1000);
    data.p[idx].planted = Math.max(0, data.p[idx].planted - 7200);
    addLog(pName, "\u7ED9 " + (si ? si.name : "\u690D\u7269") + " \u6D47\u4E86\u6C34");
    updSt("w", false);
    acted = true;
  } else if (r < 0.50 && dryPlots.length > 0) {
    var wcnt = 0;
    for (var pi = 0; pi < PLOTS; pi++) {
      if (data.p[pi] && waterLvl(data.p[pi]) < 0.3) {
        data.p[pi].watered = Math.floor(Date.now() / 1000);
        data.p[pi].planted = Math.max(0, data.p[pi].planted - 7200);
        wcnt++;
      }
    }
    if (wcnt > 0) { addLog(pName, "\u4E00\u952E\u6D47\u4E86 " + wcnt + " \u68F5\u690D\u7269"); updSt("w", false); acted = true; }
  } else if (r < 0.65 && bloomedPlots.length > 0) {
    var idx = bloomedPlots[Math.floor(Math.random() * bloomedPlots.length)];
    var si = stageInfo(data.p[idx]);
    var name = si ? si.name : "\u690D\u7269";
    var type = data.p[idx].type;
    var tp = T[type];
    var emoji = tp ? tp.e[tp.e.length - 1] : "\uD83C\uDF37";
    data.p[idx] = null;
    var xpg = Math.round((tp ? tp.xp : 10) * (1 + decorBuffs().xp));
    data.exp = (data.exp || 0) + xpg;
    updDex(type, "h"); updSt("h", false);
    if (Math.random() < 0.3) {
      addLog(pName, "\u9001\u4F60\u4E00\u6735 " + name + " \uD83D\uDC95");
      var gmsg = "\u521A\u6458\u7684" + name + "\u9001\u7ED9\u4F60\uFF0C\u6536\u597D\u54E6~";
      if (window.chatSendFlower) { try { window.chatSendFlower(emoji, name, gmsg, true); } catch (e) {} }
    } else {
      data.inv[type] = (data.inv[type] || 0) + 1;
      addLog(pName, "\u6536\u83B7\u4E86 " + name + " (+" + xpg + "\u7ECF\u9A8C)");
    }
    acted = true;
  } else if (r < 0.78 && bloomedPlots.length > 1) {
    var hcnt = 0;
    for (var pi = 0; pi < PLOTS; pi++) {
      if (!data.p[pi]) continue;
      var si2 = stageInfo(data.p[pi]);
      if (!si2 || !si2.bloomed) continue;
      var tp2 = T[data.p[pi].type];
      var tpk = data.p[pi].type;
      data.p[pi] = null;
      var xpg2 = Math.round((tp2 ? tp2.xp : 10) * (1 + decorBuffs().xp));
      data.exp = (data.exp || 0) + xpg2;
      data.inv[tpk] = (data.inv[tpk] || 0) + 1;
      updDex(tpk, "h"); updSt("h", false);
      hcnt++;
    }
    if (hcnt > 0) { addLog(pName, "\u4E00\u952E\u6536\u83B7 " + hcnt + " \u6735\u82B1"); acted = true; }
  } else if (r < 0.90 && plantedPlots.length > 0) {
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

function renderLevel() {
  var el = document.getElementById("garden-level-bar");
  if (!el) return;
  var lp = gLvProg();
  var pct = Math.round(lp.cur / lp.max * 100);
  el.innerHTML = "<span class=\"garden-lv-num\">Lv." + lp.lv + "</span><div class=\"garden-lv-track\"><div class=\"garden-lv-fill\" style=\"width:" + pct + "%\"></div></div><span class=\"garden-lv-exp\">" + data.exp + " EXP</span>";
}

function renderStats() {
  var el = document.getElementById("garden-stats");
  if (!el) return;
  var st = data.st || {};
  var total = (st.p || 0) + (st.mp || 0);
  var water = (st.w || 0) + (st.mw || 0);
  var harvest = (st.h || 0) + (st.mh || 0);
  el.innerHTML = "<span class=\"gs-item\"><b>" + total + "</b>\u79CD</span><span class=\"gs-item\"><b>" + water + "</b>\u6D47</span><span class=\"gs-item\"><b>" + harvest + "</b>\u6536</span>";
}

function renderDex() {
  var el = document.getElementById("garden-dex");
  if (!el) return;
  var keys = Object.keys(T);
  var collected = 0;
  var h = "";
  keys.forEach(function (k) {
    var tp = T[k];
    var dx = data.dex[k] || { p: 0, h: 0 };
    var has = dx.p > 0 || dx.h > 0;
    if (has) collected++;
    var lock = !unlocked(k);
    if (has) {
      h += "<div class=\"garden-dex-item\" title=\"" + tp.n + " \u79CD" + dx.p + "\u6536" + dx.h + "\"><span class=\"dex-emoji\">" + tp.e[tp.e.length - 1] + "</span><span class=\"dex-name\">" + tp.n + "</span><span class=\"dex-cnt\">\u00d7" + dx.h + "</span></div>";
    } else if (lock) {
      h += "<div class=\"garden-dex-item locked\"><span class=\"dex-emoji\">\uD83D\uDD12</span><span class=\"dex-name\">Lv." + tp.lv + "</span></div>";
    } else {
      h += "<div class=\"garden-dex-item unknown\"><span class=\"dex-emoji\">\u2753</span><span class=\"dex-name\">???</span></div>";
    }
  });
  el.innerHTML = "<div class=\"garden-dex-title\">\u690D\u7269\u56FE\u9274 " + collected + "/" + keys.length + "</div><div class=\"garden-dex-grid\">" + h + "</div>";
}

function renderInv() {
  var el = document.getElementById("garden-inv");
  if (!el) return;
  var keys = Object.keys(data.inv || {}).filter(function (k) { return data.inv[k] > 0; });
  if (!keys.length) { el.innerHTML = "<div class=\"garden-inv-empty\">\u5E93\u5B58\u7A7A\u7A7A\uFF0C\u6536\u83B7\u82B1\u6735\u540E\u53EF\u5236\u4F5C\u82B1\u675F\u9001\u7ED9" + pn() + "</div>"; return; }
  var h = "<div class=\"garden-inv-title\">\u82B1\u6735\u5E93\u5B58</div><div class=\"garden-inv-list\">";
  keys.forEach(function (k) {
    var tp = T[k];
    if (!tp) return;
    h += "<span class=\"garden-inv-item\" data-flower=\"" + k + "\">" + tp.e[tp.e.length - 1] + " " + tp.n + " \u00d7" + data.inv[k] + "</span>";
  });
  h += "</div><button class=\"garden-bouquet-btn\" id=\"garden-bouquet-btn\">\uD83D\uDCC1 \u5236\u4F5C\u82B1\u675F\u9001\u7ED9" + pn() + "</button>";
  el.innerHTML = h;
  var btn = el.querySelector("#garden-bouquet-btn");
  if (btn) btn.addEventListener("click", makeBouquet);
}

function renderDecor() {
  var el = document.getElementById("garden-decor");
  if (!el) return;
  var keys = Object.keys(DECOR);
  var owned = keys.filter(function (k) { return (data.decor[k] || 0) > 0; });
  var h = "<div class=\"garden-decor-title\">\uD83C\uDFE0 \u82B1\u56ED\u88C5\u9970</div>";
  if (owned.length) {
    h += "<div class=\"garden-decor-list\">";
    owned.forEach(function (k) {
      var dp = DECOR[k];
      var bf = dp.buff ? " <span class=\"garden-decor-buff\">" + dp.buff.label + "</span>" : "";
      h += "<span class=\"garden-decor-item\">" + dp.e + " " + dp.n + " \u00d7" + data.decor[k] + bf + "</span>";
    });
    h += "</div>";
  } else {
    h += "<div class=\"garden-decor-empty\">\u8FD8\u6CA1\u6709\u88C5\u9970\uFF0C\u53BB\u5546\u5E97\u770B\u770B\u5427</div>";
  }
  h += "<button class=\"garden-decor-shop-btn\" id=\"garden-decor-shop-btn\">\uD83D\uDED2 \u88C5\u9970\u5546\u5E97\uFF08\u514D\u8D39\uFF09</button>";
  el.innerHTML = h;
  var btn = el.querySelector("#garden-decor-shop-btn");
  if (btn) btn.addEventListener("click", buyDecor);
}

function renderVisitor() {
  var el = document.getElementById("garden-visitor");
  if (!el) return;
  var v = data.visitor;
  if (!v) { el.innerHTML = ""; el.style.display = "none"; return; }
  var now = Math.floor(Date.now() / 1000);
  if (v.start + v.dur < now) { data.visitor = null; save(data); el.innerHTML = ""; el.style.display = "none"; return; }
  var vi = null;
  for (var i = 0; i < VISITORS.length; i++) { if (VISITORS[i].type === v.type) { vi = VISITORS[i]; break; } }
  if (!vi) { el.innerHTML = ""; el.style.display = "none"; return; }
  var remain = v.start + v.dur - now;
  var rmTxt = remain > 3600 ? Math.floor(remain / 3600) + "\u5C0F\u65F6" : Math.ceil(remain / 60) + "\u5206\u949F";
  el.style.display = "";
  el.innerHTML = "<span class=\"garden-visitor-emoji\">" + vi.e + "</span><span class=\"garden-visitor-txt\">" + vi.n + "\u6765\u8BBF\u4E86\u82B1\u56ED\uFF0C\u8FD8\u4F1A\u5F85 " + rmTxt + "</span>";
}

function renderLeaderboard() {
  var el = document.getElementById("garden-lb");
  if (!el) return;
  var st = data.st || {};
  var rows = [
    { label: "\u79CD\u690D", me: st.p || 0, ta: st.mp || 0 },
    { label: "\u6D47\u6C34", me: st.w || 0, ta: st.mw || 0 },
    { label: "\u65BD\u80A5", me: st.f || 0, ta: st.mf || 0 },
    { label: "\u6536\u83B7", me: st.h || 0, ta: st.mh || 0 }
  ];
  var h = "<div class=\"garden-lb-title\">\uD83C\uDFC6 \u7167\u6599\u6392\u884C\u699C</div>";
  h += "<div class=\"garden-lb-head\"><span>\u6211</span><span>" + pn() + "</span></div>";
  rows.forEach(function (r) {
    var total = r.me + r.ta;
    var mp = total > 0 ? Math.round(r.me / total * 100) : 50;
    var tp = 100 - mp;
    h += "<div class=\"garden-lb-row\"><span class=\"lb-label\">" + r.label + "</span>";
    h += "<div class=\"lb-bar\"><div class=\"lb-me\" style=\"width:" + mp + "%\">" + (r.me > 0 ? r.me : "") + "</div><div class=\"lb-ta\" style=\"width:" + tp + "%\">" + (r.ta > 0 ? r.ta : "") + "</div></div>";
    h += "</div>";
  });
  el.innerHTML = h;
}

function renderAll() {
  renderWeather();
  renderLevel();
  renderGrid();
  renderStats();
  renderVisitor();
  renderDex();
  renderInv();
  renderDecor();
  renderLeaderboard();
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
    var keys = Object.keys(T).filter(function (k) { return unlocked(k); });
    if (!keys.length) return;
    var pills = keys.map(function (k) {
      var tp = T[k];
      return { label: tp.e[tp.e.length - 1] + " " + tp.n, value: k };
    });
    window.openModal("\u9009\u62E9\u79CD\u690D", "", function (v) {
      if (v && T[v]) plantSeed(selPlot, v);
    }, { pills: pills, noInput: true });
  } else if (tool === "waterall") {
    waterAll();
  } else if (tool === "harvestall") {
    harvestAll();
  }
}

function waterAll() {
  var cnt = 0;
  for (var i = 0; i < PLOTS; i++) {
    var plot = data.p[i];
    if (!plot) continue;
    if (waterLvl(plot) > 0.5) continue;
    plot.watered = Math.floor(Date.now() / 1000);
    plot.planted = Math.max(0, plot.planted - 14400);
    cnt++;
  }
  if (cnt > 0) {
    addLog("\u6211", "\u4E00\u952E\u6D47\u4E86 " + cnt + " \u68F5\u690D\u7269");
    updSt("w", true);
    save(data); renderAll();
  }
}

function harvestAll() {
  var cnt = 0;
  var totalXp = 0;
  var xpb = 1 + decorBuffs().xp;
  for (var i = 0; i < PLOTS; i++) {
    var plot = data.p[i];
    if (!plot) continue;
    var si = stageInfo(plot);
    if (!si || !si.bloomed) continue;
    var tp = T[plot.type];
    var xpg = Math.round((tp ? tp.xp : 10) * xpb);
    data.p[i] = null;
    data.exp = (data.exp || 0) + xpg;
    data.inv[plot.type] = (data.inv[plot.type] || 0) + 1;
    updDex(plot.type, "h"); updSt("h", true);
    totalXp += xpg;
    cnt++;
  }
  if (cnt > 0) {
    addLog("\u6211", "\u4E00\u952E\u6536\u83B7 " + cnt + " \u6735\u82B1 (+" + totalXp + "\u7ECF\u9A8C)");
    save(data); renderAll();
  }
}

function makeBouquet() {
  var keys = Object.keys(data.inv || {}).filter(function (k) { return data.inv[k] > 0 && T[k]; });
  if (!keys.length) return;
  if (!window.openModal) return;
  var pills = keys.map(function (k) {
    var tp = T[k];
    return { label: tp.e[tp.e.length - 1] + " " + tp.n + " \u00d7" + data.inv[k], value: k };
  });
  window.openModal("\u9009\u4E00\u6735\u82B1\u5236\u4F5C\u82B1\u675F", "", function (v) {
    if (!v || !T[v] || !data.inv[v]) return;
    var tp = T[v];
    var emoji = tp.e[tp.e.length - 1];
    var defWish = "\u9001\u7ED9\u4F60\u4E00\u675F" + tp.n + "\uFF0C\u662F\u6211\u4EEC\u4E00\u8D77\u79CD\u7684\u54E6~";
    var mask = document.getElementById("modal-mask");
    if (mask) mask.hidden = true;
    setTimeout(function () {
      if (!window.openModal) return;
      window.openModal("\u9001\u82B1\u7559\u8A00\uFF08\u53EF\u4FEE\u6539\uFF09", defWish, function (wish) {
        data.inv[v]--;
        var msg = (wish && wish.trim()) ? wish.trim() : defWish;
        addLog("\u6211", "\u5236\u4F5C\u4E86\u4E00\u675F " + tp.n + "\u82B1\u9001\u7ED9" + pn());
        save(data);
        if (window.chatSendFlower) { try { window.chatSendFlower(emoji, tp.n, msg); } catch (e) {} }
        renderAll();
      }, {});
    }, 150);
  }, { pills: pills, noInput: true });
}

function buyDecor() {
  if (!window.openModal) return;
  var keys = Object.keys(DECOR);
  var pills = keys.map(function (k) {
    var dp = DECOR[k];
    var cnt = data.decor[k] || 0;
    var lock = cnt >= dp.max;
    var lbl = dp.e + " " + dp.n + " " + (lock ? "\u5DF2\u6EE1" : "\u514D\u8D39") + (dp.buff ? " " + dp.buff.label : "");
    return { label: lbl, value: k };
  });
  window.openModal("\u88C5\u9970\u5546\u5E97\uFF08\u514D\u8D39\uFF09", "", function (v) {
    if (!v || !DECOR[v]) return;
    var dp = DECOR[v];
    var cnt = data.decor[v] || 0;
    if (cnt >= dp.max) return;
    data.decor[v] = cnt + 1;
    addLog("\u6211", "\u8D2D\u4E70\u4E86 " + dp.n);
    save(data); renderAll();
  }, { pills: pills, noInput: true });
}

function spawnVisitor() {
  if (data.visitor) {
    var now = Math.floor(Date.now() / 1000);
    if (data.visitor.start + data.visitor.dur < now) data.visitor = null;
  }
  if (data.visitor) return;
  if (Math.random() > 0.25) return;
  var vi = VISITORS[Math.floor(Math.random() * VISITORS.length)];
  var dur = 3600 + Math.floor(Math.random() * 10800);
  data.visitor = { type: vi.type, start: Math.floor(Date.now() / 1000), dur: dur };
  addLog(vi.n, "\uD83C\uDF49 \u6765\u8BBF\u4E86\u82B1\u56ED");
  save(data);
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
  if (curWeather.t === "\u5C0F\u96E8") {
    for (var i = 0; i < PLOTS; i++) {
      if (data.p[i] && waterLvl(data.p[i]) < 0.3) {
        data.p[i].watered = Math.floor(Date.now() / 1000);
      }
    }
    save(data);
  }
  var dbf = decorBuffs();
  if (dbf.water > 0) {
    for (var wi = 0; wi < PLOTS; wi++) {
      if (data.p[wi] && waterLvl(data.p[wi]) < dbf.water) {
        data.p[wi].watered = Math.floor(Date.now() / 1000) - 86400 + Math.floor(86400 * dbf.water);
      }
    }
    save(data);
  }
  spawnVisitor();
  if (Math.random() < 0.3 + dbf.partner) partnerAct();
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

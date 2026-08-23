// ===== garden =====
(function () {
var s = window.activeStore();
var page = document.getElementById("page-garden");
if (!s || !page) return;
var G = "garden-data";
var G_GLOBAL = "garden-data-global";
var gs = null;
try { gs = window.xyStore("xy-home-v2"); } catch (e) {}
var isGlobal = false;
function curStore() { return isGlobal ? gs : s; }
function curKey() { return isGlobal ? G_GLOBAL : G; }
function curIdbKey() { return isGlobal ? ("xy-home-v2:" + G_GLOBAL) : (window.activePrefix() + ":" + G); }
var PLOTS = 12;
var PI = 1800;
var WILT_SEC = 172800;
function pn() { return s.get("lbl-partner") || "TA"; }
function load() { try { var d = JSON.parse(curStore().get(curKey()) || "{}"); if (!d.p) d.p = []; while (d.p.length < PLOTS) d.p.push(null); if (!d.l) d.l = []; if (!d.lpc) d.lpc = 0; if (!d.dex) d.dex = {}; if (!d.exp) d.exp = 0; if (!d.inv) d.inv = {}; if (!d.st) d.st = { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }; if (!d.decor) d.decor = {}; if (!d.visitor) d.visitor = null; return d; } catch (e) { return { p: new Array(PLOTS).fill(null), l: [], lpc: 0, dex: {}, exp: 0, inv: {}, st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }, decor: {}, visitor: null }; } }
function save(d) { try { curStore().set(curKey(), JSON.stringify(d)); try { if (window.idbSet) window.idbSet(curIdbKey(), JSON.stringify(d)); } catch (e2) {} } catch (e) {} }
(function r() { try { if (!window.idbGet) return; var pf = window.activePrefix(); if (!s.get(G)) window.idbGet(pf + ":" + G).then(function (v) { if (window.activePrefix() !== pf || !v) return; try { s.set(G, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} }); } catch (e) {} })();

var T = {
  rose: { n: "\u73AB\u7470", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF39"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1, ss: 3, m: "\u70ED\u70C8\u7684\u7231" },
  sunflower: { n: "\u5411\u65E5\u8475", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3B"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 518400], xp: 40, lv: 2, ss: 1, m: "\u6C89\u9ED8\u7684\u7231" },
  tulip: { n: "\u90C1\u91D1\u9999", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF37"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 432000], xp: 30, lv: 1, ss: 0, m: "\u6C38\u6052\u7684\u795D\u798F" },
  cactus: { n: "\u4ED9\u4EBA\u638C", e: ["\uD83C\uDF31", "\uD83C\uDF35"], sn: ["\u5C0F\u82BD", "\u6210\u578B"], g: [432000], xp: 50, lv: 4, ss: 1, m: "\u575A\u97F7\uFF0C\u5916\u521A\u5185\u67D4" },
  lavender: { n: "\u85B0\u8863\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83D\uDC90"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 345600], xp: 25, lv: 3, ss: 2, m: "\u7B49\u5F85\u7231\u60C5" },
  daisy: { n: "\u96CF\u83CA", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3C"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 259200], xp: 20, lv: 1, ss: 0, m: "\u7EAF\u771F\uFF0C\u6DF1\u85CF\u5FC3\u5E95\u7684\u7231" },
  sakura: { n: "\u6A31\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF38"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [86400, 259200], xp: 25, lv: 1, ss: 0, m: "\u4E00\u751F\u5E78\u798F" },
  hibiscus: { n: "\u8299\u84C9", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3A"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 345600], xp: 35, lv: 1, ss: 1, m: "\u7EA4\u7EC6\u4E4B\u7F8E" },
  lotus: { n: "\u8377\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83E\uDEB7"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [259200, 432000], xp: 45, lv: 1, ss: 1, m: "\u6E05\u96C5\u575A\u8D1E" },
  clover: { n: "\u5E78\u8FD0\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF40"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u6210\u578B"], g: [43200, 129600], xp: 15, lv: 1, ss: 2, m: "\u5E78\u8FD0\u4E0E\u5E0C\u671B" },
  camellia: { n: "\u5C71\u8336\u82B1", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83D\uDCAE"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [172800, 259200], xp: 30, lv: 1, ss: 3, m: "\u7406\u60F3\u7684\u7231" },
  flameRose: { n: "\u7EDE\u6A31\u73AB\u7470", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF39"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [432000, 864000], xp: 120, lv: 5, ss: 0, rare: true, m: "\u70BD\u70ED\u6C38\u6052\u7684\u7231" },
  blueRose: { n: "\u84DD\u73AB\u7470", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF39"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [432000, 864000], xp: 150, lv: 6, ss: 1, rare: true, m: "\u5947\u8FF9\u4E0E\u4E0D\u53EF\u80FD\u7684\u7231" },
  goldSun: { n: "\u91D1\u5411\u65E5\u8475", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3B"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [432000, 777600], xp: 130, lv: 5, ss: 1, rare: true, m: "\u5FE0\u8BDA\u7684\u4FE1\u4EF0" },
  nightLotus: { n: "\u591C\u83B2", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83E\uDEB7"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u5F00\u82B1"], g: [604800, 1036800], xp: 180, lv: 7, ss: 2, rare: true, m: "\u6697\u591C\u91CC\u7684\u575A\u5B88" },
  rainbowClover: { n: "\u5F69\u8679\u8349", e: ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF40"], sn: ["\u79CD\u5B50", "\u53D1\u82BD", "\u6210\u578B"], g: [259200, 518400], xp: 100, lv: 5, ss: 3, rare: true, m: "\u5E78\u8FD0\u964D\u4E34" }
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
  var wilted = bloomed && plot.bloomedAt && (now - plot.bloomedAt > WILT_SEC);
  var progress = bloomed ? 1 : (eff - (stage > 0 ? tp.g.slice(0, stage).reduce(function (a, b) { return a + b; }, 0) : 0)) / (tp.g[stage] || 1);
  var nextSec = bloomed ? 0 : Math.ceil((tp.g.slice(0, stage + 1).reduce(function (a, b) { return a + b; }, 0) - eff) / boost);
  return { key: plot.type, name: tp.n, stage: stage, stageMax: stageMax, stageName: tp.sn[Math.min(stage, tp.sn.length - 1)], emoji: tp.e[Math.min(stage, tp.e.length - 1)], bloomed: bloomed, wilted: !!wilted, progress: progress, nextSec: nextSec, plantedBy: plot.by || "\u6211" };
}
function markBloomed() {
  var changed = false;
  var now = Math.floor(Date.now() / 1000);
  for (var i = 0; i < data.p.length; i++) {
    var plot = data.p[i];
    if (!plot) continue;
    var si = stageInfo(plot);
    if (si && si.bloomed && !plot.bloomedAt) { plot.bloomedAt = now; changed = true; }
  }
  if (changed) save(data);
}

function waterLvl(plot) {
  if (!plot || !plot.watered) return 0;
  return Math.max(0, 1 - (Math.floor(Date.now() / 1000) - plot.watered) / 86400);
}

function gLv() { return Math.floor(Math.sqrt((data.exp || 0) / 10)) + 1; }
function gLvProg() { var lv = gLv(); var cur = (lv - 1) * (lv - 1) * 10; var nxt = lv * lv * 10; return { cur: data.exp - cur, max: nxt - cur, lv: lv }; }
function unlocked(type) { var tp = T[type]; if (!tp) return false; if (tp.rare) return false; return true; }
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
function todayStr() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function updDaily(act) {
  var t = todayStr();
  if (!data.daily || data.daily.day !== t) data.daily = { day: t, w: 0, h: 0, f: 0, done: false, buffed: false };
  if (act === "w") data.daily.w++;
  else if (act === "h") data.daily.h++;
  else if (act === "f") data.daily.f++;
  if (!data.daily.done && data.daily.w >= 5 && data.daily.h >= 3 && data.daily.f >= 1) {
    data.daily.done = true;
    data.exp = (data.exp || 0) + 50;
    addLog("\u2605", "\u4ECA\u65E5\u4EFB\u52A1\u5B8C\u6210\uFF0C\u5956\u52B150\u7ECF\u9A8C");
  }
}

var curWeather = wx();
var curSeason = sea();

function renderWeather() {
  var wi = document.getElementById("garden-weather-ico");
  var wt = document.getElementById("garden-weather-txt");
  var ws = document.getElementById("garden-season");
  if (wi) wi.textContent = curWeather.i;
  if (wt) wt.textContent = curWeather.t;
  if (ws) ws.textContent = curSeason;

  var hr = new Date().getHours();
  page.dataset.night = (hr >= 19 || hr < 6) ? "1" : "0";
  page.dataset.season = String(Math.floor(new Date().getMonth() / 3) % 4);
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
  for (var i = 0; i < data.p.length; i++) {
    var plot = data.p[i];
    var si = stageInfo(plot);
    var wl = waterLvl(plot);
    var cls = "garden-plot" + (si ? "" : " empty") + (wl > 0 ? " watered" : "") + (selPlot === i ? " selected" : "") + (si && si.bloomed ? " bloomed" : "") + (si && si.wilted ? " wilted" : "") + (plot && T[plot.type] && T[plot.type].rare ? " rare" : "");
    h += "<div class=\"" + cls + "\" data-idx=\"" + i + "\">";
    if (si) {
      if (isGlobal && plot.by && plot.by.indexOf("@") >= 0) {
        h += "<span class=\"garden-plant-src\">" + plot.by.split("@")[1] + "</span>";
      }
      var emoji = si.wilted ? "\uD83E\uDD40" : si.emoji;
      h += "<span class=\"garden-plant-emoji\">" + emoji + "</span>";
      h += "<span class=\"garden-plant-name\">" + si.name + "</span>";
      if (si.wilted) {
        h += "<span class=\"garden-plant-stage wilted-stage\">\u5DF2\u51CB\u8C22</span>";
      } else if (si.bloomed) {
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

function updWaterStreak() {
  var t = todayStr();
  if (data.lastWaterDay === t) return;
  var d = new Date(); d.setDate(d.getDate() - 1);
  var y = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  if (data.lastWaterDay === y) data.waterStreak = (data.waterStreak || 0) + 1;
  else data.waterStreak = 1;
  data.lastWaterDay = t;
}
function waterPlot(idx) {
  if (idx < 0 || idx >= data.p.length) return;
  var plot = data.p[idx];
  if (!plot) return;
  if (!plot.watered) plot.watered = Math.floor(Date.now() / 1000);
  else { var sec = Math.floor(Date.now() / 1000) - plot.watered; if (sec < 3600) return; plot.watered = Math.floor(Date.now() / 1000); }
  var si = stageInfo(plot);
  plot.planted = Math.max(0, plot.planted - 14400);
  addLog("\u6211", "\u7ED9 " + (si ? si.name : "\u7A7A\u5730") + " \u6D47\u4E86\u6C34");
  updSt("w", true);
  updDaily("w");
  updWaterStreak();
  save(data); renderAll();
}

function plantSeed(idx, type) {
  if (idx < 0 || idx >= data.p.length) return;
  if (data.p[idx]) return;
  var tp = T[type]; if (!tp) return;
  data.p[idx] = { type: type, planted: Math.floor(Date.now() / 1000), by: "\u6211" };
  addLog("\u6211", "\u79CD\u4E0B\u4E86\u4E00\u68F5 " + tp.n + (tp.rare ? " \u2728" : ""));
  updDex(type, "p");
  updSt("p", true);
  save(data); renderAll();
}
function dropRareSeed() {
  if (Math.random() > 0.05) return null;
  var rareKeys = Object.keys(T).filter(function (k) { return T[k].rare; });
  if (!rareKeys.length) return null;
  var k = rareKeys[Math.floor(Math.random() * rareKeys.length)];
  if (!data.rareInv) data.rareInv = {};
  data.rareInv[k] = (data.rareInv[k] || 0) + 1;
  return k;
}

function fertilizePlot(idx) {
  if (idx < 0 || idx >= data.p.length) return;
  var plot = data.p[idx];
  if (!plot) return;
  plot.planted = Math.max(0, plot.planted - 43200);
  var si = stageInfo(plot);
  addLog("\u6211", "\u7ED9 " + (si ? si.name : "\u7A7A\u5730") + " \u65BD\u4E86\u80A5");
  updSt("f", true);
  updDaily("f");
  save(data); renderAll();
}

function harvestPlot(idx) {
  if (idx < 0 || idx >= data.p.length) return;
  var plot = data.p[idx];
  if (!plot) return;
  var si = stageInfo(plot);
  if (!si || !si.bloomed) return;
  var name = si.name;
  var type = plot.type;
  var tp = T[type];
  var wilted = si.wilted;
  data.p[idx] = null;
  var xpg = Math.round((tp ? tp.xp : 10) * (1 + decorBuffs().xp) * (wilted ? 0.5 : 1));
  data.exp = (data.exp || 0) + xpg;
  data.inv[type] = (data.inv[type] || 0) + 1;
  if (wilted) data.wiltedSeen = true;
  updDex(type, "h");
  updSt("h", true);
  updDaily("h");
  var dropped = dropRareSeed();
  addLog("\u6211", "\u6536\u83B7\u4E86 " + name + (wilted ? "\uFF08\u5DF2\u51CB\u8C22\uFF09" : "") + " (+" + xpg + "\u7ECF\u9A8C)" + (dropped ? " \u2728\u83B7\u5F97\u7A00\u6709\u79CD\u5B50" + T[dropped].n : ""));
  save(data); renderAll();
}


function partnerAct(silent) {
  var pName = pn();
  var r = Math.random();
  var emptyPlots = [];
  var plantedPlots = [];
  var bloomedPlots = [];
  var dryPlots = [];
  for (var i = 0; i < data.p.length; i++) {
    if (!data.p[i]) emptyPlots.push(i);
    else {
      plantedPlots.push(i);
      var si = stageInfo(data.p[i]);
      if (si && si.bloomed) bloomedPlots.push(i);
      if (waterLvl(data.p[i]) < 0.3) dryPlots.push(i);
    }
  }
  bloomedPlots.sort(function (a, b) {
    var ba = (data.p[a] && data.p[a].bloomedAt) || 0;
    var bb = (data.p[b] && data.p[b].bloomedAt) || 0;
    return ba - bb;
  });
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
    for (var pi = 0; pi < data.p.length; pi++) {
      if (data.p[pi] && waterLvl(data.p[pi]) < 0.3) {
        data.p[pi].watered = Math.floor(Date.now() / 1000);
        data.p[pi].planted = Math.max(0, data.p[pi].planted - 7200);
        wcnt++;
      }
    }
    if (wcnt > 0) { addLog(pName, "\u4E00\u952E\u6D47\u4E86 " + wcnt + " \u68F5\u690D\u7269"); updSt("w", false); acted = true; }
  } else if (r < 0.65 && bloomedPlots.length > 0) {
    var idx = bloomedPlots[0];
    var si = stageInfo(data.p[idx]);
    var name = si ? si.name : "\u690D\u7269";
    var type = data.p[idx].type;
    var tp = T[type];
    var wilted = si ? si.wilted : false;
    var emoji = wilted ? "\uD83E\uDD40" : (tp ? tp.e[tp.e.length - 1] : "\uD83C\uDF37");
    data.p[idx] = null;
    var xpg = Math.round((tp ? tp.xp : 10) * (1 + decorBuffs().xp) * (wilted ? 0.5 : 1));
    data.exp = (data.exp || 0) + xpg;
    updDex(type, "h"); updSt("h", false);
    if (Math.random() < 0.3) {
      addLog(pName, "\u9001\u4F60\u4E00\u6735 " + name + (wilted ? "\uFF08\u5E72\u82B1\uFF09" : "") + " \uD83D\uDC95");
      var gmsg = wilted ? "\u8FD9\u6735" + name + "\u5FEB\u51CB\u4E86\uFF0C\u8D76\u7D27\u9001\u4F60~" : "\u521A\u6458\u7684" + name + "\u9001\u7ED9\u4F60\uFF0C\u6536\u597D\u54E6~";
      if (window.chatSendFlower) { try { window.chatSendFlower(emoji, name, gmsg, true); } catch (e) {} }
    } else {
      data.inv[type] = (data.inv[type] || 0) + 1;
      addLog(pName, "\u6536\u83B7\u4E86 " + name + (wilted ? "\uFF08\u5DF2\u51CB\u8C22\uFF09" : "") + " (+" + xpg + "\u7ECF\u9A8C)");
    }
    acted = true;
  } else if (r < 0.78 && bloomedPlots.length > 1) {
    var hcnt = 0;
    for (var pi = 0; pi < data.p.length; pi++) {
      if (!data.p[pi]) continue;
      var si2 = stageInfo(data.p[pi]);
      if (!si2 || !si2.bloomed) continue;
      var tp2 = T[data.p[pi].type];
      var tpk = data.p[pi].type;
      var wilted2 = si2.wilted;
      data.p[pi] = null;
      var xpg2 = Math.round((tp2 ? tp2.xp : 10) * (1 + decorBuffs().xp) * (wilted2 ? 0.5 : 1));
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
  var normal = keys.filter(function (k) { return !T[k].rare; });
  var rare = keys.filter(function (k) { return !!T[k].rare; });
  function renderItems(list) {
    var h = "";
    list.forEach(function (k) {
      var tp = T[k];
      var dx = data.dex[k] || { p: 0, h: 0 };
      var has = dx.p > 0 || dx.h > 0;
      var lock = tp.rare ? !has : (tp.lv > gLv());
      if (has) {
        h += "<div class=\"garden-dex-item" + (tp.rare ? " rare" : "") + "\" title=\"" + tp.n + " \u79CD" + dx.p + "\u6536" + dx.h + "\"><span class=\"dex-emoji\">" + tp.e[tp.e.length - 1] + "</span><span class=\"dex-name\">" + tp.n + "</span><span class=\"dex-cnt\">\u00d7" + dx.h + "</span></div>";
      } else if (lock) {
        h += "<div class=\"garden-dex-item locked\"><span class=\"dex-emoji\">\uD83D\uDD12</span><span class=\"dex-name\">" + (tp.rare ? "\u7A00\u6709" : "Lv." + tp.lv) + "</span></div>";
      } else {
        h += "<div class=\"garden-dex-item unknown\"><span class=\"dex-emoji\">\u2753</span><span class=\"dex-name\">???</span></div>";
      }
    });
    return h;
  }
  var nC = normal.filter(function (k) { var dx = data.dex[k] || { p: 0, h: 0 }; return dx.p > 0 || dx.h > 0; }).length;
  var rC = rare.filter(function (k) { var dx = data.dex[k] || { p: 0, h: 0 }; return dx.p > 0 || dx.h > 0; }).length;
  el.innerHTML = "<div class=\"garden-dex-title\">\u690D\u7269\u56FE\u9274 " + nC + "/" + normal.length + " \u00B7 \u7A00\u6709 " + rC + "/" + rare.length + "</div><div class=\"garden-dex-grid\">" + renderItems(normal) + "</div>" + (rare.length ? "<div class=\"garden-dex-sub\">\u2728 \u7A00\u6709\u54C1\u79CD</div><div class=\"garden-dex-grid rare-grid\">" + renderItems(rare) + "</div>" : "");
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

var ACHV = [
  { id: "firstBloom", n: "首次开花", e: "\uD83C\uDF38", d: "收获第一朵花", check: function () { return (data.st.h || 0) + (data.st.mh || 0) >= 1; } },
  { id: "greenThumb", n: "满级园丁", e: "\uD83C\uDF3E", d: "花园达 Lv.10", check: function () { return gLv() >= 10; } },
  { id: "collector", n: "全图鉴", e: "\uD83D\uDCD6", d: "收集全部普通花并", check: function () { var n = Object.keys(T).filter(function (k) { return !T[k].rare; }); return n.every(function (k) { var dx = data.dex[k] || {}; return dx.p > 0 || dx.h > 0; }); } },
  { id: "rareColl", n: "稀有收藏家", e: "\u2728", d: "收获任一稀有花", check: function () { return Object.keys(T).some(function (k) { return T[k].rare && data.dex[k] && data.dex[k].h > 0; }); } },
  { id: "water7", n: "坚持浇水", e: "\uD83D\uDCA7", d: "连续浇水 7 天", check: function () { return (data.waterStreak || 0) >= 7; } },
  { id: "harvest10", n: "丰收一日", e: "\uD83E\uDD4B", d: "单日收获 10 朵", check: function () { return (data.daily && data.daily.h >= 10) || (data.st.h || 0) >= 10; } },
  { id: "planter10", n: "勤劳园丁", e: "\uD83C\uDF31", d: "种下 10 棵花", check: function () { return (data.st.p || 0) + (data.st.mp || 0) >= 10; } },
  { id: "waterer50", n: "浇水达人", e: "\uD83C\uDF26", d: "浇水 50 次", check: function () { return (data.st.w || 0) + (data.st.mw || 0) >= 50; } },
  { id: "harv50", n: "花海", e: "\uD83C\uDF3C", d: "收获 50 朵花", check: function () { return (data.st.h || 0) + (data.st.mh || 0) >= 50; } },
  { id: "decorAll", n: "尽善尽美", e: "\uD83C\uDFE0", d: "买齐全部装饰", check: function () { return Object.keys(DECOR).every(function (k) { return (data.decor[k] || 0) >= DECOR[k].max; }); } },
  { id: "visitor", n: "生机勃勃", e: "\uD83E\uDE9B", d: "招待过访客", check: function () { return !!data.visitor; } },
  { id: "bouquet3", n: "花束使者", e: "\uD83D\uDCC1", d: "制作 3 束花", check: function () { return (data.bouquetCnt || 0) >= 3; } },
  { id: "partnerCare", n: "同育之情", e: "\uD83D\uDC95", d: "梦角打理 10 次", check: function () { return (data.st.mp || 0) + (data.st.mw || 0) + (data.st.mh || 0) + (data.st.mf || 0) >= 10; } },
  { id: "rich", n: "花山花海", e: "\uD83D\uDCB0", d: "库存 20 朵花", check: function () { var t = 0; Object.keys(data.inv || {}).forEach(function (k) { t += data.inv[k] || 0; }); return t >= 20; } },
  { id: "wiltedSee", n: "封存时光", e: "\uD83E\uDD40", d: "见证花朵凋谢", check: function () { return !!data.wiltedSeen; } }
];
function ensureDailyUI() {
  if (document.getElementById("garden-daily")) return;
  var el = document.createElement("div");
  el.id = "garden-daily";
  el.className = "garden-daily";
  var pg = document.getElementById("garden-panel-garden");
  if (pg) pg.insertBefore(el, pg.firstChild);
  else { var bar = page.querySelector(".garden-level-bar"); if (bar) bar.parentNode.insertBefore(el, bar.nextSibling); }
}
function renderDaily() {
  ensureDailyUI();
  var el = document.getElementById("garden-daily");
  if (!el) return;
  var t = todayStr();
  if (!data.daily || data.daily.day !== t) data.daily = { day: t, w: 0, h: 0, f: 0, done: false };
  var d = data.daily;
  var tasks = [
    { n: "\u6D47\u6C34", cur: d.w, goal: 5, e: "\uD83D\uDCA7" },
    { n: "\u6536\u83B7", cur: d.h, goal: 3, e: "\uD83C\uDF3C" },
    { n: "\u65BD\u80A5", cur: d.f, goal: 1, e: "\uD83D\uDC9A" }
  ];
  var h = "<div class=\"garden-daily-title\">\u4ECA\u65E5\u4EFB\u52A1" + (d.done ? " \u2728\u5DF2\u5B8C\u6210" : "") + "</div><div class=\"garden-daily-tasks\">";
  tasks.forEach(function (tk) {
    var ok = tk.cur >= tk.goal;
    h += "<div class=\"garden-daily-task" + (ok ? " done" : "") + "\"><span class=\"dt-emoji\">" + tk.e + "</span><span class=\"dt-name\">" + tk.n + " " + Math.min(tk.cur, tk.goal) + "/" + tk.goal + "</span></div>";
  });
  h += "</div>";
  el.innerHTML = h;
}
function ensureAchvUI() {
  if (document.getElementById("garden-achv")) return;
  var el = document.createElement("div");
  el.id = "garden-achv";
  el.className = "garden-achv";
  var pa = document.getElementById("garden-panel-achv");
  if (pa) pa.appendChild(el);
  else { var scroll = page.querySelector(".garden-scroll"); if (scroll) scroll.appendChild(el); }
}
function renderAchv() {
  ensureAchvUI();
  var el = document.getElementById("garden-achv");
  if (!el) return;
  if (!data.achv) data.achv = {};
  var got = 0;
  var h = "";
  ACHV.forEach(function (a) {
    var ok = !!data.achv[a.id];
    if (ok) got++;
    h += "<div class=\"garden-achv-item" + (ok ? " done" : "") + "\" title=\"" + a.d + "\"><span class=\"achv-emoji\">" + (ok ? a.e : "\uD83D\uDD12") + "</span><span class=\"achv-name\">" + a.n + "</span></div>";
  });
  el.innerHTML = "<div class=\"garden-achv-title\">\uD83C\uDFC6 \u6210\u5C31\u5899 " + got + "/" + ACHV.length + "</div><div class=\"garden-achv-grid\">" + h + "</div>";
}
function checkAchv() {
  if (!data.achv) data.achv = {};
  var newly = [];
  ACHV.forEach(function (a) {
    if (data.achv[a.id]) return;
    try { if (a.check()) { data.achv[a.id] = Math.floor(Date.now() / 1000); newly.push(a); } } catch (e) {}
  });
  if (newly.length) {
    save(data);
    newly.forEach(function (a) { addLog("\u2605", "\u89E3\u9501\u6210\u5C31\u300C" + a.n + "\u300D " + a.e); });
    if (window.openModal) {
      var a0 = newly[0];
      window.openModal(a0.e + " \u89E3\u9501\u6210\u5C31", a0.n + "\n" + a0.d + (newly.length > 1 ? "\n\uFF08\u672C\u6B21\u5171\u89E3\u9501 " + newly.length + " \u4E2A\uFF09" : ""), function () {}, { pills: [{ label: "\u597D\u7684", value: "ok" }], noInput: true });
    }
  }
}
var curTab = "garden";
var TABS = [
  { id: "garden", n: "\u82B1\u56ED", e: "\uD83C\uDF31" },
  { id: "dex", n: "\u56FE\u9274", e: "\uD83D\uDCD6" },
  { id: "craft", n: "\u5DE5\u574A", e: "\uD83D\uDC83" },
  { id: "shop", n: "\u88C5\u9970", e: "\uD83C\uDFE1" },
  { id: "achv", n: "\u6210\u5C31", e: "\uD83C\uDFC6" },
  { id: "report", n: "\u5E74\u62A5", e: "\uD83D\uDCCA" }
];
function ensureTabUI() {
  if (document.getElementById("garden-tabs")) return;
  var scroll = page.querySelector(".garden-scroll");
  if (!scroll) return;
  var tabs = document.createElement("div");
  tabs.id = "garden-tabs";
  tabs.className = "garden-tabs";
  TABS.forEach(function (t) {
    var b = document.createElement("button");
    b.className = "garden-tab" + (t.id === curTab ? " active" : "");
    b.dataset.tab = t.id;
    b.innerHTML = '<span class="gt-emoji">' + t.e + '</span><span class="gt-name">' + t.n + '</span>';
    tabs.appendChild(b);
  });
  var lvl = document.getElementById("garden-level-bar");
  lvl.parentNode.insertBefore(tabs, lvl.nextSibling);
  TABS.forEach(function (t) {
    var p = document.createElement("div");
    p.id = "garden-panel-" + t.id;
    p.className = "garden-panel" + (t.id === curTab ? " active" : "");
    scroll.appendChild(p);
  });
  var move = function (id, pid) {
    var el = document.getElementById(id);
    var p = document.getElementById("garden-panel-" + pid);
    if (el && p) p.appendChild(el);
  };
  move("garden-grid", "garden");
  move("garden-stats", "garden");
  move("garden-visitor", "garden");
  move("garden-toolbar", "garden");
  move("garden-log", "garden");
  move("garden-dex", "dex");
  move("garden-inv", "craft");
  move("garden-decor", "shop");
  move("garden-lb", "shop");
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest(".garden-tab");
    if (!b) return;
    curTab = b.dataset.tab;
    page.querySelectorAll(".garden-tab").forEach(function (x) { x.classList.toggle("active", x.dataset.tab === curTab); });
    page.querySelectorAll(".garden-panel").forEach(function (p) { p.classList.toggle("active", p.id === "garden-panel-" + curTab); });
  });
}
var RECIPES = [
  { id: "firstLove", n: "\u521D\u604B", e: "\uD83D\uDC90", need: { rose: 3, daisy: 2 }, wish: "\u4E09\u6735\u73AB\u7470\u4E24\u6735\u96CF\u83CA\uFF0C\u50CF\u521D\u604B\u822C\u70ED\u70C8\u53C8\u7EAF\u771F" },
  { id: "passion", n: "\u70ED\u604B", e: "\uD83D\uDC9D", need: { rose: 2, sunflower: 1 }, wish: "\u73AB\u7470\u4E0E\u5411\u65E5\u8475\uFF0C\u70ED\u70C8\u5730\u671D\u5411\u4F60" },
  { id: "miss", n: "\u601D\u5FF5", e: "\uD83C\uDF19", need: { lavender: 3, sakura: 1 }, wish: "\u85B0\u8863\u8349\u7684\u7B49\u5F85\uFF0C\u6A31\u82B1\u7684\u77ED\u6682\uFF0C\u90FD\u662F\u601D\u5FF5" },
  { id: "eternal", n: "\u6C38\u6052", e: "\u221E", need: { tulip: 2, camellia: 1 }, wish: "\u90C1\u91D1\u9999\u7684\u795D\u798F\uFF0C\u5C71\u8336\u82B1\u7684\u7406\u60F3\uFF0C\u613F\u6C38\u6052" },
  { id: "lucky", n: "\u5E78\u8FD0", e: "\uD83C\uDF40", need: { clover: 3, daisy: 1 }, wish: "\u56DB\u53F6\u8349\u52A0\u96CF\u83CA\uFF0C\u5E78\u8FD0\u4F34\u7EAF\u771F" },
  { id: "miracle", n: "\u5947\u8FF9", e: "\u2728", need: { flameRose: 1, blueRose: 1 }, wish: "\u7EDE\u6A31\u4E0E\u84DD\u73AB\u7470\uFF0C\u4E0D\u53EF\u80FD\u7684\u5947\u8FF9" }
];
function ensureCraftUI() {
  if (document.getElementById("garden-craft")) return;
  var p = document.getElementById("garden-panel-craft");
  if (!p) return;
  var el = document.createElement("div");
  el.id = "garden-craft";
  el.className = "garden-craft";
  p.appendChild(el);
}
function renderCraft() {
  ensureCraftUI();
  var el = document.getElementById("garden-craft");
  if (!el) return;
  if (!data.recipes) data.recipes = {};
  var h = '<div class="garden-craft-title">\uD83D\uDC83 \u82B1\u827A\u914D\u65B9</div><div class="garden-craft-list">';
  RECIPES.forEach(function (r) {
    var canMake = true;
    var needTxt = [];
    Object.keys(r.need).forEach(function (k) {
      var have = data.inv[k] || 0;
      if (have < r.need[k]) canMake = false;
      var tp = T[k];
      needTxt.push((tp ? tp.e[tp.e.length - 1] : "") + "\u00d7" + r.need[k]);
    });
    var made = !!data.recipes[r.id];
    h += '<div class="garden-recipe' + (canMake ? " can" : "") + (made ? " made" : "") + '">';
    h += '<div class="recipe-head"><span class="recipe-emoji">' + r.e + '</span><span class="recipe-name">' + r.n + '</span>' + (made ? '<span class="recipe-made">\u2713\u5DF2\u5408\u6210</span>' : "") + '</div>';
    h += '<div class="recipe-need">' + needTxt.join(" ") + '</div>';
    h += '<div class="recipe-wish">' + r.wish + '</div>';
    if (canMake) h += '<button class="recipe-btn" data-recipe="' + r.id + '">\u5408\u6210\u82B1\u675F</button>';
    h += '</div>';
  });
  h += '</div>';
  el.innerHTML = h;
  el.querySelectorAll(".recipe-btn").forEach(function (b) { b.addEventListener("click", function () { craftRecipe(b.dataset.recipe); }); });
}
function craftRecipe(id) {
  var r = null;
  for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) { r = RECIPES[i]; break; }
  if (!r) return;
  for (var k in r.need) { if ((data.inv[k] || 0) < r.need[k]) return; }
  for (var k2 in r.need) { data.inv[k2] = (data.inv[k2] || 0) - r.need[k2]; if (data.inv[k2] < 0) data.inv[k2] = 0; }
  if (!data.recipes) data.recipes = {};
  data.recipes[id] = Math.floor(Date.now() / 1000);
  data.bouquetCnt = (data.bouquetCnt || 0) + 1;
  addLog("\u6211", "\u5408\u6210\u300C" + r.n + "\u300D\u82B1\u675F " + r.e);
  save(data);
  if (window.chatSendFlower) { try { window.chatSendFlower(r.e, r.n + "\u82B1\u675F", r.wish); } catch (e) {} }
  renderAll();
}
function ensureReportUI() {
  if (document.getElementById("garden-report")) return;
  var p = document.getElementById("garden-panel-report");
  if (!p) return;
  var el = document.createElement("div");
  el.id = "garden-report";
  el.className = "garden-report";
  p.appendChild(el);
}
function renderReport() {
  ensureReportUI();
  var el = document.getElementById("garden-report");
  if (!el) return;
  var st = data.st || {};
  var year = new Date().getFullYear();
  var totalPlant = (st.p || 0) + (st.mp || 0);
  var totalWater = (st.w || 0) + (st.mw || 0);
  var totalHarv = (st.h || 0) + (st.mh || 0);
  var totalFert = (st.f || 0) + (st.mf || 0);
  var topFlower = null, topCnt = 0;
  Object.keys(data.dex || {}).forEach(function (k) { var c = (data.dex[k].p || 0) + (data.dex[k].h || 0); if (c > topCnt && T[k]) { topCnt = c; topFlower = T[k]; } });
  var invTotal = 0; Object.keys(data.inv || {}).forEach(function (k) { invTotal += data.inv[k] || 0; });
  var achvCnt = Object.keys(data.achv || {}).length;
  var bouquet = data.bouquetCnt || 0;
  var streak = data.waterStreak || 0;
  var dexGot = Object.keys(data.dex || {}).filter(function (k) { var d = data.dex[k]; return d.p > 0 || d.h > 0; }).length;
  var partnerCare = (st.mp || 0) + (st.mw || 0) + (st.mh || 0) + (st.mf || 0);
  var h = '<div class="garden-report-card">';
  h += '<div class="report-year">' + year + ' \u82B1\u56ED\u5E74\u62A5</div>';
  h += '<div class="report-lv">Lv.' + gLv() + ' \u00B7 ' + (data.exp || 0) + ' EXP</div>';
  h += '<div class="report-stats"><div class="rs-item"><b>' + totalPlant + '</b>\u79CD\u690D</div><div class="rs-item"><b>' + totalWater + '</b>\u6D47\u6C34</div><div class="rs-item"><b>' + totalHarv + '</b>\u6536\u83B7</div><div class="rs-item"><b>' + totalFert + '</b>\u65BD\u80A5</div></div>';
  h += '<div class="report-row"><span>\u6700\u5E38\u79CD</span><b>' + (topFlower ? topFlower.e[topFlower.e.length - 1] + " " + topFlower.n : "\u2014") + '</b></div>';
  h += '<div class="report-row"><span>\u5E93\u5B58\u82B1\u6735</span><b>' + invTotal + ' \u6735</b></div>';
  h += '<div class="report-row"><span>\u5236\u4F5C\u82B1\u675F</span><b>' + bouquet + ' \u675F</b></div>';
  h += '<div class="report-row"><span>\u89E3\u9501\u6210\u5C31</span><b>' + achvCnt + '/' + ACHV.length + '</b></div>';
  h += '<div class="report-row"><span>\u8FDE\u7EED\u6D47\u6C34</span><b>' + streak + ' \u5929</b></div>';
  h += '<div class="report-row"><span>\u56FE\u9274\u6536\u96C6</span><b>' + dexGot + '/' + Object.keys(T).length + '</b></div>';
  h += '<div class="report-row"><span>\u68A6\u89D2\u6253\u7406</span><b>' + partnerCare + ' \u6B21</b></div>';
  h += '</div>';
  h += '<button class="report-share-btn" id="garden-report-share">\uD83D\uDCF8 \u5206\u4EAB\u5230\u670B\u53CB\u5708</button>';
  el.innerHTML = h;
  var sb = el.querySelector("#garden-report-share");
  if (sb) sb.addEventListener("click", function () {
    var lines = [
      year + " \u82B1\u56ED\u5E74\u62A5 \uD83C\uDF3F",
      "Lv." + gLv() + " \u00B7 " + (data.exp || 0) + " EXP",
      "\u79CD\u690D" + totalPlant + " \u6D47\u6C34" + totalWater + " \u6536\u83B7" + totalHarv + " \u65BD\u80A5" + totalFert,
      "\u6700\u5E38\u79CD\uFF1A" + (topFlower ? topFlower.n : "\u2014"),
      "\u5236\u4F5C\u82B1\u675F" + bouquet + " \u89E3\u9501\u6210\u5C31" + achvCnt + "/" + ACHV.length,
      "\u8FDE\u7EED\u6D47\u6C34" + streak + "\u5929 \u68A6\u89D2\u6253\u7406" + partnerCare + "\u6B21",
      "\uD83C\uDF38 \u613F\u6211\u4EEC\u7684\u82B1\u56ED\u4E00\u76F4\u7E41\u76DB"
    ];
    var text = lines.join("\n");
    var ok = false;
    try {
      var st = window.xyStore ? window.xyStore("xy-home-v2") : null;
      if (st) {
        var FK = "feed-posts";
        var arr = []; try { arr = JSON.parse(st.get(FK) || "[]"); } catch (e2) {}
        var owner = "default"; try { if (window.__activeCid) owner = window.__activeCid; } catch (e2) {}
        var an = "\u6211"; try { var as = window.activeStore ? window.activeStore() : null; if (as) { var nn = as.get("feed-user-name") || as.get("lbl-user"); if (nn) an = nn; } } catch (e2) {}
        arr.unshift({ id: "f_" + Date.now(), role: "me", owner: owner, authorName: an, authorAv: "", taName: "", taAv: "", content: text, imgs: [], ts: Date.now(), likes: [], comments: [] });
        var raw = JSON.stringify(arr);
        st.set(FK, raw);
        if (window.idbSet) window.idbSet("xy-home-v2:" + FK, raw);
        ok = true;
      }
    } catch (e3) {}
    try { document.dispatchEvent(new CustomEvent("garden-share-report", { detail: { ok: ok } })); } catch (e4) {}
    if (window.openModal) window.openModal(ok ? "\u2705 \u5DF2\u53D1\u5E03\u5230\u670B\u53CB\u5708" : "\u53D1\u5E03\u5931\u8D25", ok ? "\u82B1\u56ED\u5E74\u62A5\u5DF2\u53D1\u5230\u670B\u53CB\u5708\uFF0C\u53BB\u670B\u53CB\u5708\u770B\u770B\u5427~" : "\u8BF7\u7A0D\u540E\u518D\u8BD5", function () {}, { pills: [{ label: "\u597D\u7684", value: "ok" }], noInput: true });
  });
}
function renderAll() {
  markBloomed();
  ensureTabUI();
  renderWeather();
  renderDaily();
  renderLevel();
  renderGrid();
  renderStats();
  renderVisitor();
  renderDex();
  renderInv();
  renderDecor();
  renderLeaderboard();
  renderAchv();
  renderCraft();
  renderReport();
  renderLog();
  checkAchv();
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
  page.querySelectorAll(".garden-plot").forEach(function (p) {
    var i = parseInt(p.getAttribute("data-idx"));
    p.classList.toggle("selected", i === selPlot);
  });
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
    var normalKeys = Object.keys(T).filter(function (k) { return unlocked(k); });
    var rareKeys = Object.keys(data.rareInv || {}).filter(function (k) { return data.rareInv[k] > 0 && T[k] && T[k].rare; });
    var pills = normalKeys.map(function (k) {
      var tp = T[k];
      return { label: tp.e[tp.e.length - 1] + " " + tp.n, value: k };
    });
    rareKeys.forEach(function (k) {
      var tp = T[k];
      pills.push({ label: "\u2728 " + tp.e[tp.e.length - 1] + " " + tp.n + " \u00d7" + data.rareInv[k], value: "rare:" + k });
    });
    if (!pills.length) return;
    window.openModal("\u9009\u62E9\u79CD\u690D", "", function (v) {
      if (!v) return;
      if (v.indexOf("rare:") === 0) {
        var rk = v.slice(5);
        if (data.rareInv && data.rareInv[rk] > 0) { data.rareInv[rk]--; plantSeed(selPlot, rk); }
      } else if (T[v]) { plantSeed(selPlot, v); }
    }, { pills: pills, noInput: true });
  } else if (tool === "waterall") {
    waterAll();
  } else if (tool === "harvestall") {
    harvestAll();
  }
}

function waterAll() {
  var cnt = 0;
  for (var i = 0; i < data.p.length; i++) {
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
  var dropped = [];
  for (var i = 0; i < data.p.length; i++) {
    var plot = data.p[i];
    if (!plot) continue;
    var si = stageInfo(plot);
    if (!si || !si.bloomed) continue;
    var tp = T[plot.type];
    var wilted = si.wilted;
    var xpg = Math.round((tp ? tp.xp : 10) * xpb * (wilted ? 0.5 : 1));
    data.p[i] = null;
    data.exp = (data.exp || 0) + xpg;
    data.inv[plot.type] = (data.inv[plot.type] || 0) + 1;
    if (wilted) data.wiltedSeen = true;
    updDex(plot.type, "h"); updSt("h", true); updDaily("h");
    var dr = dropRareSeed(); if (dr) dropped.push(dr);
    totalXp += xpg;
    cnt++;
  }
  if (cnt > 0) {
    addLog("\u6211", "\u4E00\u952E\u6536\u83B7 " + cnt + " \u6735\u82B1 (+" + totalXp + "\u7ECF\u9A8C)" + (dropped.length ? " \u2728\u83B7\u5F97" + dropped.length + "\u9897\u7A00\u6709\u79CD\u5B50" : ""));
    save(data); renderAll();
  }
}

function makeBouquet() {
  var keys = Object.keys(data.inv || {}).filter(function (k) { return data.inv[k] > 0 && T[k]; });
  if (!keys.length) return;
  if (!window.openModal) return;
  var pills = keys.map(function (k) {
    var tp = T[k];
    return { label: tp.e[tp.e.length - 1] + " " + tp.n + " \u00d7" + data.inv[k] + (tp.m ? " \u00B7 " + tp.m : ""), value: k };
  });
  window.openModal("\u9009\u4E00\u6735\u82B1\u5236\u4F5C\u82B1\u675F", "", function (v) {
    if (!v || !T[v] || !data.inv[v]) return;
    var tp = T[v];
    var emoji = tp.e[tp.e.length - 1];
    var meaning = tp.m || "";
    var defWish = "\u9001\u7ED9\u4F60\u4E00\u675F" + tp.n + "\uFF0C\u662F\u6211\u4EEC\u4E00\u8D77\u79CD\u7684\u54E6~" + (meaning ? "\n\u82B1\u8BED\uFF1A" + meaning : "");
    var mask = document.getElementById("modal-mask");
    if (mask) mask.hidden = true;
    setTimeout(function () {
      if (!window.openModal) return;
      window.openModal("\u9001\u82B1\u7559\u8A00\uFF08\u53EF\u4FEE\u6539\uFF09", defWish, function (wish) {
        data.inv[v]--;
        data.bouquetCnt = (data.bouquetCnt || 0) + 1;
        var msg = (wish && wish.trim()) ? wish.trim() : defWish;
        addLog("\u6211", "\u5236\u4F5C\u4E86\u4E00\u675F " + tp.n + "\u82B1\u9001\u7ED9" + pn() + (meaning ? "\uFF08\u82B1\u8BED\uFF1A" + meaning + "\uFF09" : ""));
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
  if (isGlobal) toggleGlobal();
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
    for (var i = 0; i < data.p.length; i++) {
      if (data.p[i] && waterLvl(data.p[i]) < 0.3) {
        data.p[i].watered = Math.floor(Date.now() / 1000);
      }
    }
    save(data);
  }
  var dbf = decorBuffs();
  if (dbf.water > 0) {
    for (var wi = 0; wi < data.p.length; wi++) {
      if (data.p[wi] && waterLvl(data.p[wi]) < dbf.water) {
        data.p[wi].watered = Math.floor(Date.now() / 1000) - 86400 + Math.floor(86400 * dbf.water);
      }
    }
    save(data);
  }
  spawnVisitor();
  if (Math.random() < 0.3 + dbf.partner) partnerAct();
  renderAll();
  try { document.dispatchEvent(new CustomEvent("garden-enter")); } catch (e) {}
}

var appBtn = document.querySelector('.app[data-app="garden"]');
if (appBtn && page) appBtn.addEventListener("click", openGarden);

var backBtn = document.getElementById("garden-back");
if (backBtn) backBtn.addEventListener("click", function () {
  document.querySelectorAll(".page").forEach(function (pg) { pg.hidden = true; });
  var home = document.getElementById("page-phone");
  if (home) home.hidden = false;
  try { document.dispatchEvent(new CustomEvent("garden-leave")); } catch (e) {}
});

var gridEl = document.getElementById("garden-grid");
if (gridEl) gridEl.addEventListener("click", handlePlotClick);

var toolbarEl = document.getElementById("garden-toolbar");
if (toolbarEl) toolbarEl.addEventListener("click", handleTool);


document.addEventListener("contact-switched", function () {
  if (!page.hidden) {
    if (isGlobal) toggleGlobal();
    else { data = load(); selPlot = -1; renderAll(); }
  }
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

// ===== 全球园：真合并所有联系人花园数据，可继续种植/收获（原各联系人数据保留不动） =====
var globalBtn = null;
var remergeBtn = null;
function ensureGlobalUI() {
  if (globalBtn) return;
  var header = page.querySelector("header") || page.children[0];
  if (header) {
    globalBtn = document.createElement("span");
    globalBtn.className = "garden-ov-btn";
    globalBtn.textContent = "\uD83C\uDF10 \u5168\u90E8";
    globalBtn.addEventListener("click", toggleGlobal);
    header.appendChild(globalBtn);
    remergeBtn = document.createElement("span");
    remergeBtn.className = "garden-ov-btn garden-remerge-btn";
    remergeBtn.textContent = "\uD83D\uDD04 \u91CD\u65B0\u5408\u5E76";
    remergeBtn.hidden = true;
    remergeBtn.addEventListener("click", remergeGlobal);
    header.appendChild(remergeBtn);
  }
}
function loadGardenAsync(cid) {
  return new Promise(function (resolve) {
    var raw = null;
    try { raw = window.storeFor(cid).get("garden-data"); } catch (e) {}
    if (raw) { try { resolve(JSON.parse(raw)); return; } catch (e) {} }
    if (!window.idbGet) { resolve(null); return; }
    window.idbGet("xy-home-v2:" + cid + ":garden-data").then(function (v) {
      if (!v) { resolve(null); return; }
      try { resolve(typeof v === "string" ? JSON.parse(v) : v); } catch (e) { resolve(null); }
    }).catch(function () { resolve(null); });
  });
}
function loadAllGardensAsync() {
  var list = [];
  try { if (window.getContacts) list = window.getContacts() || []; } catch (e) {}
  if (!list.length) list = [{ id: "default", name: "\u9ED8\u8BA4" }];
  return Promise.all(list.map(function (c) {
    return loadGardenAsync(c.id).then(function (d) {
      if (!d) return null;
      var name = c.name || c.id;
      try { var pnn = window.storeFor(c.id).get("lbl-partner"); if (pnn) name = pnn; } catch (e) {}
      return { cid: c.id, name: name, data: d };
    });
  })).then(function (arr) { return arr.filter(function (x) { return !!x; }); });
}
function mergeAllToGlobal() {
  return loadAllGardensAsync().then(function (gardens) {
    var g = { p: [], l: [], lpc: Math.floor(Date.now() / 1000), dex: {}, exp: 0, inv: {}, st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 }, decor: {}, visitor: null };
    gardens.forEach(function (gd) {
      var d = gd.data || {};
        if (d.p) d.p.forEach(function (plot) {
          if (plot) {
            var np = { type: plot.type, planted: plot.planted, by: (plot.by || "\u6211") + "@" + gd.name };
            if (plot.watered) np.watered = plot.watered;
            if (plot.bloomedAt) np.bloomedAt = plot.bloomedAt;
            if (plot.coOp) np.coOp = plot.coOp;
            g.p.push(np);
          }
        });
      g.exp += (d.exp || 0);
      if (d.st) Object.keys(d.st).forEach(function (k) { g.st[k] = (g.st[k] || 0) + (d.st[k] || 0); });
      if (d.dex) Object.keys(d.dex).forEach(function (t) {
        if (!g.dex[t]) g.dex[t] = { p: 0, h: 0 };
        g.dex[t].p += d.dex[t].p || 0;
        g.dex[t].h += d.dex[t].h || 0;
      });
      if (d.inv) Object.keys(d.inv).forEach(function (t) { g.inv[t] = (g.inv[t] || 0) + (d.inv[t] || 0); });
      if (d.decor) Object.keys(d.decor).forEach(function (t) { g.decor[t] = (g.decor[t] || 0) + (d.decor[t] || 0); });
      if (d.l) d.l.forEach(function (e) { g.l.push({ who: e.who, act: (e.act || "") + " @" + gd.name, tm: e.tm }); });
      if (d.visitor) {
        var now = Math.floor(Date.now() / 1000);
        if (d.visitor.start + d.visitor.dur > now) {
          if (!g.visitor || d.visitor.start > g.visitor.start) g.visitor = d.visitor;
        }
      }
    });
    while (g.p.length < 12) g.p.push(null);
    if (g.p.length > 36) {
      var extra = g.p.splice(36);
      extra.forEach(function (plot) { if (plot && T[plot.type]) g.inv[plot.type] = (g.inv[plot.type] || 0) + 1; });
      while (g.p.length < 12) g.p.push(null);
    }
    g.l.sort(function (a, b) { return (a.tm || 0) - (b.tm || 0); });
    g.l = g.l.slice(-100);
    return g;
  });
}
function toggleGlobal() {
  ensureGlobalUI();
  if (isGlobal) {
    isGlobal = false;
    data = load();
    selPlot = -1;
    if (globalBtn) globalBtn.textContent = "\uD83C\uDF10 \u5168\u90E8";
    if (remergeBtn) remergeBtn.hidden = true;
    renderAll();
  } else {
    isGlobal = true;
    var existing = null;
    try { existing = gs.get(G_GLOBAL); } catch (e) {}
    if (existing) {
      data = load();
      selPlot = -1;
      if (globalBtn) globalBtn.textContent = "\u2190 \u8FD4\u56DE\u672C\u684C";
      if (remergeBtn) remergeBtn.hidden = false;
      renderAll();
    } else {
      var scroll = page.querySelector(".garden-scroll");
      var tip = null;
      if (scroll) {
        tip = document.createElement("div");
        tip.className = "garden-merge-tip";
        tip.textContent = "\u9996\u6B21\u5408\u5E76\u6240\u6709\u8054\u7CFB\u4EBA\u82B1\u56ED\u2026";
        scroll.insertBefore(tip, scroll.firstChild);
      }
      mergeAllToGlobal().then(function (g) {
        save(g);
        data = load();
        selPlot = -1;
        if (globalBtn) globalBtn.textContent = "\u2190 \u8FD4\u56DE\u672C\u684C";
        if (remergeBtn) remergeBtn.hidden = false;
        if (tip) tip.remove();
        renderAll();
      });
    }
  }
}
function remergeGlobal() {
  if (!window.openModal) { doRemerge(); return; }
  window.openModal("\u91CD\u65B0\u5408\u5E76", "", function (v) {
    if (v === "ok") doRemerge();
  }, { pills: [{ label: "\u786E\u8BA4\u5408\u5E76\uFF08\u8986\u76D6\u5F53\u524D\u5168\u7403\u56ED\uFF09", value: "ok" }, { label: "\u53D6\u6D88", value: "cancel" }], noInput: true });
}
function doRemerge() {
  mergeAllToGlobal().then(function (g) {
    save(g);
    data = load();
    selPlot = -1;
    renderAll();
  });
}
ensureGlobalUI();

window.gardenBloomDates = function () {
  var list = [];
  try {
    var contacts = window.getContacts ? (window.getContacts() || []) : [{ id: "default", name: "\u9ED8\u8BA4" }];
    contacts.forEach(function (c) {
      var st = window.storeFor ? window.storeFor(c.id) : null;
      if (!st) return;
      var raw = st.get("garden-data");
      if (!raw) return;
      var d; try { d = JSON.parse(raw); } catch (e) { return; }
      if (!d || !d.p) return;
      var name = c.name || c.id;
      try { var pnn = st.get("lbl-partner"); if (pnn) name = pnn; } catch (e) {}
      d.p.forEach(function (plot, i) {
        if (!plot || !T[plot.type]) return;
        var tp = T[plot.type];
        var totalSec = tp.g.reduce(function (a, b) { return a + b; }, 0);
        var bloomAt = (plot.planted || 0) + Math.ceil(totalSec / 1.1);
        list.push({ cid: c.id, name: name, type: plot.type, flower: tp.n, emoji: tp.e[tp.e.length - 1], bloomAt: bloomAt, idx: i });
      });
    });
  } catch (e) {}
  return list;
};

})();

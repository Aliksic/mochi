// ===== 功能：经期记录（桌面第三页） =====
// 记录经期开始/结束、预测下次经期、判断周期阶段（经期/排卵期/安全期）
// 数据 localStorage + IndexedDB 双写（键前缀 xy-home-v2:），纯本地无后端
// v3.10.x 全局共享：经期记录属"本人生理数据"，所有联系人桌面共用一份
//   全局键 xy-home-v2:period-*（参照 fish-log / garden-data-global 先例）。
//   首次启动 migrateToGlobal 遍历各联系人旧键合并去重写入全局并清理旧键
//   （period-migrated 标记幂等）。contacts.js EXCLUDE 已加 period-* 防
//   migrateLegacy 误迁全局键进 default 桌面。
// v3.10.x 增强：
//   1. 动态周期——取最近 6 次实际周期中位数 + 标准差 σ + CV 规律性徽章 + 黄体期反推
//   2. 置信区间渲染——预测日按高斯衰减着色（中心深边缘浅）
//   3. 每日属性——经量/症状/体温/情绪/备注，长按日格录入
//   4. 症状统计——常见症状 TOP3 + 频次柱状图
//   5. 本地通知——经期预测前 3/1/当天 + 延迟预警
//   6. 趋势图——近 12 次周期长度折线 + 均值线
//   7. 倒计时卡——大数字 + 圆环进度
(function () {
  var G = 'xy-home-v2';
  var store = window.xyStore(G);
  var page = document.getElementById('page-period');
  if (!store || !page) return;

  var KEY_REC = 'period-records';
  var KEY_CFG = 'period-cfg';
  var KEY_DAILY = 'period-daily';
  var KEY_NOTIFY = 'period-notify';

  function loadRecs() { try { return JSON.parse(store.get(KEY_REC) || '[]'); } catch (e) { return []; } }
  function saveRecs(list) {
    try {
      store.set(KEY_REC, JSON.stringify(list));
      try { if (window.idbSet) window.idbSet(G + ':' + KEY_REC, JSON.stringify(list)); } catch (e2) {}
    } catch (e) {}
  }
  function loadCfg() {
    try { var c = JSON.parse(store.get(KEY_CFG) || 'null'); if (c) return c; } catch (e) {}
    return { cycleLen: 28, periodLen: 5, lutealPhase: 14 };
  }
  function saveCfg(c) {
    try {
      store.set(KEY_CFG, JSON.stringify(c));
      try { if (window.idbSet) window.idbSet(G + ':' + KEY_CFG, JSON.stringify(c)); } catch (e2) {}
    } catch (e) {}
  }
  function loadDaily() { try { return JSON.parse(store.get(KEY_DAILY) || '{}'); } catch (e) { return {}; } }
  function saveDaily(obj) {
    try {
      store.set(KEY_DAILY, JSON.stringify(obj));
      try { if (window.idbSet) window.idbSet(G + ':' + KEY_DAILY, JSON.stringify(obj)); } catch (e2) {}
    } catch (e) {}
  }
  function loadNotify() {
    try { var n = JSON.parse(store.get(KEY_NOTIFY) || 'null'); if (n) return n; } catch (e) {}
    return { enabled: false, advanceDays: [3, 1, 0], hour: 9, fired: {} };
  }
  function saveNotify(n) {
    try {
      store.set(KEY_NOTIFY, JSON.stringify(n));
      try { if (window.idbSet) window.idbSet(G + ':' + KEY_NOTIFY, JSON.stringify(n)); } catch (e2) {}
    } catch (e) {}
  }
  // 启动时从 IDB 回填缺失键（导入备份/清空后不丢记录）
  (function restore() {
    try {
      if (!window.idbGet) return;
      var keys = [KEY_REC, KEY_CFG, KEY_DAILY, KEY_NOTIFY];
      keys.forEach(function (k) {
        if (!store.get(k)) window.idbGet(G + ':' + k).then(function (v) {
          if (!v) return;
          try { store.set(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
        });
      });
    } catch (e) {}
  })();

  // ---- v3.10.x 全局共享迁移：各联系人桌面旧 period-* 合并到全局键 ----
  // 等 mochi-restore-done（IDB 回填完）后跑，遍历所有联系人，把各桌面旧键
  // 合并去重写入全局 xy-home-v2:period-*，然后清理旧键，设 period-migrated 标记（幂等）。
  // records 用 normalize 合并重叠区间；daily 按日期并集合并属性；cfg/notify 取首个有效。
  function migrateToGlobal() {
    try {
      if (store.get('period-migrated')) return;
      if (!window.getContacts || !window.storeFor) return;
      var contacts = window.getContacts();
      var allRecs = [], allDaily = {}, mergedCfg = null, mergedNotify = null, hasAny = false;
      contacts.forEach(function (c) {
        try {
          var s = window.storeFor(c.id);
          var rRaw = s.get(KEY_REC);
          if (rRaw) { var r = JSON.parse(rRaw); if (Array.isArray(r) && r.length) { allRecs = allRecs.concat(r); hasAny = true; } }
          var dRaw = s.get(KEY_DAILY);
          if (dRaw) { var d = JSON.parse(dRaw); if (d && typeof d === 'object') { Object.keys(d).forEach(function (k) { if (!allDaily[k]) allDaily[k] = {}; Object.assign(allDaily[k], d[k]); }); hasAny = true; } }
          var cfRaw = s.get(KEY_CFG);
          if (cfRaw && !mergedCfg) { var cf = JSON.parse(cfRaw); if (cf && cf.cycleLen) { mergedCfg = cf; hasAny = true; } }
          var nfRaw = s.get(KEY_NOTIFY);
          if (nfRaw && !mergedNotify) { var nf = JSON.parse(nfRaw); if (nf) { mergedNotify = nf; hasAny = true; } }
        } catch (e) {}
      });
      if (hasAny) {
        if (allRecs.length) store.set(KEY_REC, JSON.stringify(normalize(allRecs)));
        if (Object.keys(allDaily).length) store.set(KEY_DAILY, JSON.stringify(allDaily));
        if (mergedCfg) store.set(KEY_CFG, JSON.stringify(mergedCfg));
        if (mergedNotify) store.set(KEY_NOTIFY, JSON.stringify(mergedNotify));
      }
      // 清理各桌面旧键（LS + IDB，storeFor 返回的 xyStore 三处同步）
      contacts.forEach(function (c) {
        try { var s = window.storeFor(c.id); s.remove(KEY_REC); s.remove(KEY_CFG); s.remove(KEY_DAILY); s.remove(KEY_NOTIFY); } catch (e) {}
      });
      store.set('period-migrated', '1');
      // 重载内存变量 + 刷新视图
      cfg = loadCfg(); recs = loadRecs(); daily = loadDaily(); notifyCfg = loadNotify();
      if (!page.hidden) { try { render(); checkNotify(); } catch (e) {} }
    } catch (e) {}
  }
  if (window.__mochiDataReady) { migrateToGlobal(); }
  else {
    try {
      document.addEventListener('mochi-restore-done', function h() {
        document.removeEventListener('mochi-restore-done', h);
        migrateToGlobal();
      });
    } catch (e) { migrateToGlobal(); }
  }

  var cfg = loadCfg();
  var recs = loadRecs();
  var daily = loadDaily();
  var notifyCfg = loadNotify();

  // ---- 日期工具 ----
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDay(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 864e5); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
  function todayStr() { return dayStr(new Date()); }
  function newId() { return Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  }

  // ---- 记录规范化：按 start 排序，合并重叠/相邻（间隔≤1天视为同一次）----
  function normalize(list) {
    list = list.slice().sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    var out = [];
    list.forEach(function (r) {
      var last = out[out.length - 1];
      if (last) {
        var lastEnd = last.end || last.start;
        if (diffDays(lastEnd, r.start) <= 1) {
          if (r.end && (!last.end || r.end > last.end)) last.end = r.end;
          return;
        }
      }
      out.push({ id: r.id || newId(), start: r.start, end: r.end || null });
    });
    return out;
  }

  // ---- 周期统计（方案 1）：取最近 6 次实际周期，中位数 + 标准差 + CV ----
  function cycleStats() {
    var norm = normalize(recs);
    var diffs = [];
    for (var i = 1; i < norm.length; i++) {
      var d = diffDays(norm[i - 1].start, norm[i].start);
      if (d >= 15 && d <= 60) diffs.push(d);
    }
    var recent = diffs.slice(-6);
    var n = recent.length;
    if (!n) return { n: 0, median: cfg.cycleLen, mean: cfg.cycleLen, std: 0, cv: 0, diffs: diffs };
    var med = median(recent);
    var mean = recent.reduce(function (s, x) { return s + x; }, 0) / n;
    var variance = recent.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / n;
    var std = Math.sqrt(variance);
    return { n: n, median: med, mean: mean, std: std, cv: mean ? std / mean : 0, diffs: diffs };
  }
  function effCycleLen() { var s = cycleStats(); return s.n >= 3 ? s.median : cfg.cycleLen; }
  function effStd() { var s = cycleStats(); return s.n >= 3 ? s.std : 0; }
  // 黄体期反推：若 daily 标记了排卵症状日，luteal = 周期 - 排卵日，取近 3 次中位数
  function effLuteal() {
    var norm = normalize(recs);
    var cl = effCycleLen();
    var luDays = [];
    for (var i = 0; i < norm.length; i++) {
      var cs = norm[i].start;
      for (var ds in daily) {
        if (daily[ds] && daily[ds].symptoms && daily[ds].symptoms.indexOf('ovulation') >= 0) {
          var dc = diffDays(cs, ds) + 1;
          if (dc >= 8 && dc <= 24) { luDays.push(cl - dc); break; }
        }
      }
    }
    if (luDays.length >= 1) {
      var med = median(luDays.slice(-3));
      return Math.min(20, Math.max(7, Math.round(med)));
    }
    return cfg.lutealPhase || 14;
  }
  function luteal() { return effLuteal(); }
  function regularity() {
    var s = cycleStats();
    if (s.n < 3) return null;
    if (s.cv < 0.1) return { label: '很规律', cls: 'reg-good' };
    if (s.cv < 0.2) return { label: '较规律', cls: 'reg-mid' };
    return { label: '不规律', cls: 'reg-bad' };
  }

  // ---- 当前状态 ----
  function status() {
    recs = normalize(recs);
    var today = todayStr();
    var cl = effCycleLen();
    var inPeriod = false, curRec = null;
    recs.forEach(function (r) {
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      if (today >= r.start && today <= end) { inPeriod = true; curRec = r; }
    });
    var last = recs[recs.length - 1];
    var baseStart = curRec ? curRec.start : (last ? last.start : null);
    var nextStart = null;
    var ovulationDay = cl - luteal();
    if (baseStart) {
      if (inPeriod) nextStart = addDays(curRec.start, cl);
      else { var s = baseStart; while (s <= today) s = addDays(s, cl); nextStart = s; }
    }
    var stats = cycleStats();
    var sigmaTxt = (stats.n >= 3 && stats.std >= 0.5) ? '（±' + Math.round(stats.std) + ' 天）' : '';
    if (inPeriod) {
      var dayOfPeriod = diffDays(curRec.start, today) + 1;
      var end2 = curRec.end || addDays(curRec.start, cfg.periodLen - 1);
      var remain = diffDays(today, end2) + 1;
      return { phase: 'period', inPeriod: true, nextStart: nextStart, dayOfCycle: dayOfPeriod, ovulationDay: ovulationDay, cycleLen: cl, title: '经期第 ' + dayOfPeriod + ' 天', sub: '预计还剩 ' + Math.max(0, remain) + ' 天 · 注意保暖休息', sigma: sigmaTxt };
    }
    if (!baseStart) return { phase: 'unknown', inPeriod: false, nextStart: null, dayOfCycle: 0, ovulationDay: ovulationDay, cycleLen: cl, title: '暂无记录', sub: '点下方按钮标记本次经期开始', sigma: '' };
    if (baseStart > today) return { phase: 'safe', inPeriod: false, nextStart: baseStart, dayOfCycle: 0, ovulationDay: ovulationDay, cycleLen: cl, title: '距下次经期约 ' + diffDays(today, baseStart) + ' 天' + sigmaTxt, sub: '已预记录未来经期开始', sigma: sigmaTxt };
    var dayOfCycle = diffDays(baseStart, today) + 1;
    if (dayOfCycle > cl) return { phase: 'safe', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, cycleLen: cl, title: '经期已推迟 ' + (dayOfCycle - cl) + ' 天', sub: '点下方按钮标记本次经期开始', sigma: sigmaTxt };
    if (dayOfCycle >= ovulationDay - 5 && dayOfCycle <= ovulationDay + 1) {
      var toOv = ovulationDay - dayOfCycle;
      return { phase: 'fertile', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, cycleLen: cl, title: '排卵期 · 第 ' + dayOfCycle + ' 天', sub: toOv > 0 ? '距排卵约 ' + toOv + ' 天' : (toOv === 0 ? '今天约为排卵日' : '排卵约 ' + (-toOv) + ' 天前'), sigma: sigmaTxt };
    }
    return { phase: 'safe', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, cycleLen: cl, title: nextStart ? '距下次经期约 ' + diffDays(today, nextStart) + ' 天' + sigmaTxt : '周期第 ' + dayOfCycle + ' 天', sub: '周期第 ' + dayOfCycle + ' 天', sigma: sigmaTxt };
  }

  // ---- 给定日期阶段（日历着色）----
  function dayPhase(ds) {
    recs = normalize(recs);
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      if (ds >= r.start && ds <= end) return 'period';
    }
    var last = recs[recs.length - 1];
    if (!last) return 'none';
    var today = todayStr();
    var cl = effCycleLen();
    var ovu = cl - luteal();
    // 所有周期起点（含最近一次实际开始 + 未来预测）
    var starts = [];
    var s = last.start, guard = 0;
    while (s <= addDays(today, cl * 3) && guard < 200) {
      starts.push(s);
      s = addDays(s, cl); guard++;
    }
    // 预测经期着色
    for (var j = 0; j < starts.length; j++) {
      var pEnd = addDays(starts[j], cfg.periodLen - 1);
      if (ds >= starts[j] && ds <= pEnd) return 'predict';
    }
    // 排卵期着色（排卵日前5天到后1天）
    for (var k = 0; k < starts.length; k++) {
      var ovStart = addDays(starts[k], ovu - 5 - 1);
      var ovEnd = addDays(starts[k], ovu + 1 - 1);
      if (ds >= ovStart && ds <= ovEnd) return 'fertile';
    }
    return 'none';
  }

  // ---- 预测置信度（方案 3）：距预测开始日越近越深，高斯衰减 ----
  function predictConfidence(ds) {
    var stats = cycleStats();
    if (stats.n < 3 || stats.std < 0.5) return 1;
    recs = normalize(recs);
    var last = recs[recs.length - 1];
    if (!last) return 1;
    var today = todayStr();
    var cl = stats.median;
    var sigma = stats.std;
    var k = 0, start = last.start;
    while (addDays(start, cl) <= ds && k < 200) { start = addDays(start, cl); k++; }
    if (start < today) return 1;
    var offset = diffDays(start, ds);
    if (offset >= cfg.periodLen) return 0;
    return Math.exp(-(offset * offset) / (2 * sigma * sigma));
  }

  // ---- 渲染 ----
  var PHASE_ICO = {
    period: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2C12 3.2 6 9.2 6 14.2a6 6 0 0 0 12 0c0-5-6-11-6-11z"/><path d="M12 16.4c0 0-2.3-1.4-2.3-2.9a1.25 1.25 0 0 1 2.3-.9 1.25 1.25 0 0 1 2.3.9c0 1.5-2.3 2.9-2.3 2.9z"/></svg>',
    fertile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/></svg>',
    safe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    unknown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2C12 3.2 6 9.2 6 14.2a6 6 0 0 0 12 0c0-5-6-11-6-11z"/><path d="M12 16.4c0 0-2.3-1.4-2.3-2.9a1.25 1.25 0 0 1 2.3-.9 1.25 1.25 0 0 1 2.3.9c0 1.5-2.3 2.9-2.3 2.9z"/></svg>'
  };

  function renderStatus() {
    var st = status();
    var card = document.getElementById('period-status-card');
    // 倒计时环（方案 10）
    if (card) {
      var ring = card.querySelector('.period-countdown');
      if (!ring) {
        ring = document.createElement('div');
        ring.className = 'period-countdown';
        card.insertBefore(ring, card.firstChild);
      }
      var daysToNext = st.nextStart ? diffDays(todayStr(), st.nextStart) : null;
      var progress = st.cycleLen && st.dayOfCycle ? Math.min(1, st.dayOfCycle / st.cycleLen) : 0;
      var bigNum, bigSub;
      if (st.inPeriod) { bigNum = st.dayOfCycle; bigSub = '经期第' + st.dayOfCycle + '天'; }
      else if (daysToNext !== null && daysToNext >= 0) { bigNum = daysToNext; bigSub = '天后'; }
      else { bigNum = '—'; bigSub = ''; }
      var circ = 2 * Math.PI * 26;
      var dash = circ * progress;
      ring.innerHTML = '<div class="pd-ring-wrap">' +
        '<svg viewBox="0 0 60 60" class="pd-ring">' +
          '<circle cx="30" cy="30" r="26" fill="none" stroke="#eee" stroke-width="4"/>' +
          '<circle cx="30" cy="30" r="26" fill="none" stroke="#e85a8f" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 30 30)"/>' +
        '</svg>' +
        '<div class="pd-num">' + bigNum + '</div>' +
        '</div>' +
        '<div class="pd-sub">' + bigSub + '</div>';
    }
    var ico = document.getElementById('period-status-ico');
    if (ico) { ico.innerHTML = PHASE_ICO[st.phase] || PHASE_ICO.unknown; ico.className = 'period-status-ico phase-' + st.phase; }
    var t = document.getElementById('period-status-title');
    if (t) t.textContent = st.title;
    var s = document.getElementById('period-status-sub');
    if (s) s.textContent = st.sub;
    // CV 规律性徽章（方案 1）
    var head = document.querySelector('.period-status-head');
    if (head) {
      var badge = head.querySelector('.reg-badge');
      var reg = regularity();
      if (reg) {
        if (!badge) { badge = document.createElement('span'); head.appendChild(badge); }
        badge.className = 'reg-badge ' + reg.cls;
        badge.textContent = reg.label;
      } else if (badge) { badge.remove(); }
    }
    var bar = document.getElementById('period-phase-bar');
    if (bar) {
      var activeSeg = -1;
      if (st.phase === 'period') activeSeg = 0;
      else if (st.phase === 'fertile') activeSeg = 1;
      var segs = ['经期', '排卵期'];
      bar.innerHTML = segs.map(function (n, i) { return '<span class="seg seg-' + i + (i === activeSeg ? ' active' : '') + '">' + n + '</span>'; }).join('');
    }
    var startBtn = document.getElementById('period-mark-start');
    var endBtn = document.getElementById('period-mark-end');
    if (startBtn) startBtn.hidden = st.inPeriod;
    if (endBtn) endBtn.hidden = !st.inPeriod;
  }

  var viewY = 0, viewM = -1;
  function renderGrid() {
    var grid = document.getElementById('period-grid');
    if (!grid) return;
    // 补排卵期图例（template 只有经期/预测，JS 补 fertile）
    var legend = grid.parentNode.querySelector('.period-legend');
    if (legend && !legend.querySelector('.lg-fertile')) {
      var lf = document.createElement('span');
      lf.className = 'lg lg-fertile';
      lf.textContent = '排卵期';
      legend.appendChild(lf);
    }
    var now = new Date();
    if (viewM < 0) { viewY = now.getFullYear(); viewM = now.getMonth(); }
    var y = viewY, m = viewM;
    var monthEl = document.getElementById('period-month-txt');
    if (monthEl) monthEl.textContent = y + ' 年 ' + (m + 1) + ' 月';
    var first = new Date(y, m, 1);
    var days = new Date(y, m + 1, 0).getDate();
    var startWd = first.getDay();
    var wds = ['日', '一', '二', '三', '四', '五', '六'];
    var html = wds.map(function (w) { return '<span class="pc-wd">' + w + '</span>'; }).join('');
    for (var i = 0; i < startWd; i++) html += '<span class="pc-cell blank"></span>';
    var today = todayStr();
    var stats = cycleStats();
    var hasBand = stats.n >= 3 && stats.std >= 0.5;
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var ph = dayPhase(ds);
      var isToday = ds === today;
      var cls = 'pc-cell ph-' + ph + (isToday ? ' today' : '');
      var style = '';
      if (ph === 'predict' && hasBand) {
        var conf = predictConfidence(ds);
        cls += ' band';
        style = ' style="--conf:' + conf.toFixed(2) + '"';
      }
      var dayInfo = daily[ds];
      var mark = '';
      if (dayInfo) {
        if (dayInfo.flow) mark += '<i class="dm-flow f-' + dayInfo.flow + '"></i>';
        if (dayInfo.symptoms && dayInfo.symptoms.length) mark += '<i class="dm-sym"></i>';
        if (dayInfo.note) mark += '<i class="dm-note"></i>';
      }
      html += '<span class="' + cls + '"' + style + ' data-date="' + ds + '">' + d + mark + '</span>';
    }
    grid.innerHTML = html;
  }

  function renderHistory() {
    var el = document.getElementById('period-history');
    if (!el) return;
    recs = normalize(recs);
    if (!recs.length) { el.innerHTML = '<div class="period-empty">还没有记录，标记本次经期开始后会显示在这里</div>'; return; }
    var arr = recs.slice().reverse();
    var html = '';
    arr.forEach(function (r, i) {
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      var len = diffDays(r.start, end) + 1;
      var next = arr[i - 1];
      var cycleTxt = next ? ' · 周期 ' + diffDays(r.start, next.start) + ' 天' : '';
      var endTxt = r.end ? r.end : '进行中';
      html += '<div class="period-hist-row"><span class="ph-date">' + r.start + ' ~ ' + endTxt + '</span><span class="ph-meta">持续 ' + len + ' 天' + cycleTxt + '</span><button class="ph-del" data-id="' + r.id + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6"/></svg></button></div>';
    });
    el.innerHTML = html;
  }

  // ---- 症状统计 + 趋势图（方案 5 + 9）----
  var SYMPTOMS = [
    { k: 'cramp', label: '痛经' }, { k: 'headache', label: '头痛' }, { k: 'backache', label: '腰酸' },
    { k: 'breast', label: '乳房胀' }, { k: 'acne', label: '痤疮' }, { k: 'fatigue', label: '疲劳' },
    { k: 'insomnia', label: '失眠' }, { k: 'moodlow', label: '情绪低落' }, { k: 'irritable', label: '易怒' },
    { k: 'appetite', label: '食欲增加' }, { k: 'ovulation', label: '排卵症状' }
  ];
  var FLOWS = [
    { k: 'spot', label: '点滴' }, { k: 'light', label: '轻' }, { k: 'medium', label: '中' }, { k: 'heavy', label: '重' }
  ];
  var SYM_MAP = {}; SYMPTOMS.forEach(function (s) { SYM_MAP[s.k] = s.label; });

  function renderStats() {
    var scroll = document.querySelector('#page-period .period-scroll');
    if (!scroll) return;
    var old = document.getElementById('period-stats-card');
    if (old) old.remove();
    var card = document.createElement('div');
    card.className = 'period-card glass';
    card.id = 'period-stats-card';
    // 症状频次
    var freq = {};
    for (var ds in daily) {
      var info = daily[ds];
      if (info && info.symptoms) info.symptoms.forEach(function (s) { freq[s] = (freq[s] || 0) + 1; });
    }
    var sorted = Object.keys(freq).map(function (k) { return { k: k, n: freq[k] }; }).sort(function (a, b) { return b.n - a.n; });
    var symHtml = '';
    if (sorted.length) {
      var max = sorted[0].n;
      var top3 = sorted.slice(0, 3).map(function (x) { return SYM_MAP[x.k] || x.k; }).join('、');
      symHtml = '<div class="ps-title">常见症状 · TOP3：' + top3 + '</div><div class="ps-bars">';
      sorted.slice(0, 8).forEach(function (x) {
        var pct = Math.round(x.n / max * 100);
        symHtml += '<div class="ps-bar"><span class="ps-name">' + (SYM_MAP[x.k] || x.k) + '</span><span class="ps-track"><span class="ps-fill" style="width:' + pct + '%"></span></span><span class="ps-num">' + x.n + '</span></div>';
      });
      symHtml += '</div>';
    } else {
      symHtml = '<div class="ps-empty">暂无症状记录（长按日格可录入）</div>';
    }
    // 趋势图
    var stats = cycleStats();
    var trendHtml = '';
    if (stats.diffs.length >= 2) {
      var diffs = stats.diffs.slice(-12);
      var minV = Math.min.apply(null, diffs), maxV = Math.max.apply(null, diffs);
      var mean = stats.mean;
      var pad = 2;
      var lo = Math.min(minV, mean) - pad, hi = Math.max(maxV, mean) + pad;
      if (hi <= lo) hi = lo + 1;
      var W = 280, H = 90, pl = 24, pr = 8, pt = 8, pb = 16;
      var xStep = (W - pl - pr) / Math.max(1, diffs.length - 1);
      var yOf = function (v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); };
      var pts = diffs.map(function (v, i) { return (pl + i * xStep).toFixed(1) + ',' + yOf(v).toFixed(1); });
      var meanY = yOf(mean);
      trendHtml = '<div class="ps-title">周期长度趋势（近 ' + diffs.length + ' 次）</div>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ps-trend" preserveAspectRatio="xMidYMid meet">' +
          '<line x1="' + pl + '" y1="' + meanY.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + meanY.toFixed(1) + '" stroke="#f5a623" stroke-dasharray="3 3" stroke-width="1"/>' +
          '<text x="' + (W - pr) + '" y="' + (meanY - 3).toFixed(1) + '" fill="#f5a623" font-size="9" text-anchor="end">均值 ' + mean.toFixed(1) + '</text>' +
          '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#e85a8f" stroke-width="2"/>' +
          diffs.map(function (v, i) { return '<circle cx="' + (pl + i * xStep).toFixed(1) + '" cy="' + yOf(v).toFixed(1) + '" r="2.5" fill="#e85a8f"/>'; }).join('') +
        '</svg>';
    }
    card.innerHTML = '<div class="period-card-title">统计</div>' + symHtml + trendHtml;
    var histCardEl = scroll.querySelector('#period-history');
    if (histCardEl) histCardEl = histCardEl.closest('.period-card');
    if (histCardEl && histCardEl.nextSibling) histCardEl.parentNode.insertBefore(card, histCardEl.nextSibling);
    else scroll.appendChild(card);
  }

  function render() { renderStatus(); renderGrid(); renderHistory(); renderStats(); }

  // ---- 操作 ----
  function markStart() {
    recs = normalize(recs);
    var today = todayStr();
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      if (today >= r.start && today <= end) { toast('当前已在经期中'); return; }
    }
    recs.push({ id: newId(), start: today, end: null });
    recs = normalize(recs);
    saveRecs(recs);
    toast('已记录经期开始');
    render();
    checkNotify();
  }
  function markEnd() {
    recs = normalize(recs);
    var today = todayStr();
    var found = null;
    recs.forEach(function (r) { if (!r.end && r.start <= today) found = r; });
    if (!found) { toast('没有进行中的经期记录'); return; }
    found.end = today;
    recs = normalize(recs);
    saveRecs(recs);
    toast('已记录经期结束');
    render();
  }
  function toggleDay(ds) {
    recs = normalize(recs);
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      if (ds >= r.start && ds <= end) {
        if (ds === r.start && ds === end) {
          recs = recs.filter(function (x) { return x !== r; });
        } else if (ds === r.start) {
          r.start = addDays(r.start, 1);
        } else if (ds === end) {
          r.end = addDays(ds, -1);
        } else {
          recs = recs.filter(function (x) { return x !== r; });
          recs.push({ id: newId(), start: r.start, end: addDays(ds, -1) });
          recs.push({ id: newId(), start: addDays(ds, 1), end: r.end });
        }
        recs = normalize(recs);
        saveRecs(recs);
        render();
        return;
      }
    }
    recs.push({ id: newId(), start: ds, end: ds });
    recs = normalize(recs);
    saveRecs(recs);
    render();
  }
  function delRec(id) {
    recs = recs.filter(function (r) { return String(r.id) !== String(id); });
    saveRecs(recs);
    toast('已删除');
    render();
  }

  function toast(msg) {
    var t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.className = 'cc-toast'; }, 2000);
  }

  // ---- 每日详情浮层（方案 4）----
  function openDayPop(ds) {
    var existing = document.getElementById('period-day-pop');
    if (existing) existing.remove();
    var info = daily[ds] || {};
    var pop = document.createElement('div');
    pop.id = 'period-day-pop';
    pop.className = 'period-day-pop';
    var flowHtml = FLOWS.map(function (f) {
      return '<button class="dp-flow' + (info.flow === f.k ? ' on' : '') + '" data-flow="' + f.k + '">' + f.label + '</button>';
    }).join('');
    var symHtml = SYMPTOMS.map(function (s) {
      var on = info.symptoms && info.symptoms.indexOf(s.k) >= 0;
      return '<button class="dp-sym' + (on ? ' on' : '') + '" data-sym="' + s.k + '">' + s.label + '</button>';
    }).join('');
    pop.innerHTML =
      '<div class="dp-mask"></div>' +
      '<div class="dp-sheet">' +
        '<div class="dp-head"><span class="dp-date">' + ds + '</span><button class="dp-close" aria-label="关闭">×</button></div>' +
        '<div class="dp-section"><div class="dp-label">经量</div><div class="dp-flow-row">' + flowHtml + '</div></div>' +
        '<div class="dp-section"><div class="dp-label">症状</div><div class="dp-sym-grid">' + symHtml + '</div></div>' +
        '<div class="dp-section"><div class="dp-label">基础体温（℃）</div><input class="dp-temp" type="number" step="0.1" min="35" max="38" value="' + (info.temp || '') + '" placeholder="36.5"/></div>' +
        '<div class="dp-section"><div class="dp-label">情绪（1-5）</div><div class="dp-mood-row"><input class="dp-mood" type="range" min="1" max="5" value="' + (info.mood || 3) + '"/><span class="dp-mood-val">' + (info.mood || 3) + '</span></div></div>' +
        '<div class="dp-section"><div class="dp-label">备注</div><textarea class="dp-note" placeholder="今天的感觉…">' + (info.note || '') + '</textarea></div>' +
        '<div class="dp-actions"><button class="dp-del">删除</button><button class="dp-save period-btn primary">保存</button></div>' +
      '</div>';
    document.body.appendChild(pop);
    document.body.classList.add('scroll-lock');
    pop.querySelector('.dp-mask').addEventListener('click', closeDayPop);
    pop.querySelector('.dp-close').addEventListener('click', closeDayPop);
    var moodEl = pop.querySelector('.dp-mood');
    var moodVal = pop.querySelector('.dp-mood-val');
    moodEl.addEventListener('input', function () { moodVal.textContent = moodEl.value; });
    pop.querySelectorAll('.dp-flow').forEach(function (b) {
      b.addEventListener('click', function () {
        pop.querySelectorAll('.dp-flow').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
    pop.querySelectorAll('.dp-sym').forEach(function (b) {
      b.addEventListener('click', function () { b.classList.toggle('on'); });
    });
    pop.querySelector('.dp-save').addEventListener('click', function () {
      var flowBtn = pop.querySelector('.dp-flow.on');
      var syms = [];
      pop.querySelectorAll('.dp-sym.on').forEach(function (b) { syms.push(b.getAttribute('data-sym')); });
      var temp = parseFloat(pop.querySelector('.dp-temp').value);
      var mood = parseInt(pop.querySelector('.dp-mood').value, 10);
      var note = pop.querySelector('.dp-note').value.trim();
      var obj = {};
      if (flowBtn) obj.flow = flowBtn.getAttribute('data-flow');
      if (syms.length) obj.symptoms = syms;
      if (!isNaN(temp) && temp >= 35 && temp <= 38) obj.temp = temp;
      if (mood && mood !== 3) obj.mood = mood;
      if (note) obj.note = note;
      if (Object.keys(obj).length) daily[ds] = obj; else delete daily[ds];
      saveDaily(daily);
      closeDayPop();
      render();
      toast('已保存');
    });
    pop.querySelector('.dp-del').addEventListener('click', function () {
      delete daily[ds];
      saveDaily(daily);
      closeDayPop();
      render();
      toast('已删除');
    });
  }
  function closeDayPop() {
    var pop = document.getElementById('period-day-pop');
    if (pop) pop.remove();
    document.body.classList.remove('scroll-lock');
  }

  // ---- 本地通知（方案 6）----
  function notifyAssist(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (reg) {
          try { reg.showNotification(title, { body: body, tag: 'period-' + Date.now() }); }
          catch (e) { try { new Notification(title, { body: body }); } catch (e2) {} }
        });
      } else {
        try { new Notification(title, { body: body }); } catch (e) {}
      }
    } catch (e) {}
  }
  function checkNotify() {
    if (!notifyCfg.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var st = status();
    var today = todayStr();
    notifyCfg.fired = notifyCfg.fired || {};
    var fired = false;
    if (st.nextStart && !st.inPeriod) {
      var d = diffDays(today, st.nextStart);
      notifyCfg.advanceDays.forEach(function (adv) {
        if (d === adv && !notifyCfg.fired[today + '_adv' + adv]) {
          var txt = adv === 0 ? '今天预计是经期开始日' : '距下次经期约 ' + adv + ' 天';
          notifyAssist('经期提醒', txt + ' · 注意保暖、备好用品');
          notifyCfg.fired[today + '_adv' + adv] = 1;
          fired = true;
        }
      });
    }
    if (st.phase === 'safe' && /推迟/.test(st.title)) {
      var m = st.title.match(/推迟 (\d+) 天/);
      var delayDays = m ? parseInt(m[1], 10) : 0;
      if (delayDays >= 5 && !notifyCfg.fired[today + '_delay']) {
        notifyAssist('经期延迟提醒', '经期已延迟 ' + delayDays + ' 天，如持续异常建议关注');
        notifyCfg.fired[today + '_delay'] = 1;
        fired = true;
      }
    }
    var cut = addDays(today, -30);
    Object.keys(notifyCfg.fired).forEach(function (k) { if (k < cut) delete notifyCfg.fired[k]; });
    if (fired) saveNotify(notifyCfg);
  }
  // ---- 周期设置浮层（stepper 分别设定 + 上次开始日 + 排卵日预览）----
  function openSettingsPop() {
    var existing = document.getElementById('period-settings-pop');
    if (existing) existing.remove();
    var cur = loadCfg();
    var norm = normalize(recs);
    var lastStart = norm.length ? norm[norm.length - 1].start : '';
    var pop = document.createElement('div');
    pop.id = 'period-settings-pop';
    pop.className = 'period-day-pop';
    function stepper(label, key, min, max, unit) {
      return '<div class="dp-section"><div class="dp-label">' + label + '</div>' +
        '<div class="dp-stepper" data-key="' + key + '" data-min="' + min + '" data-max="' + max + '">' +
          '<button class="st-btn st-minus">−</button>' +
          '<span class="st-val">' + cur[key] + '</span>' +
          '<button class="st-btn st-plus">+</button>' +
          '<span class="st-unit">' + (unit || '天') + '</span>' +
        '</div></div>';
    }
    pop.innerHTML =
      '<div class="dp-mask"></div>' +
      '<div class="dp-sheet">' +
        '<div class="dp-head"><span class="dp-date">周期设置</span><button class="dp-close">×</button></div>' +
        stepper('周期长度', 'cycleLen', 15, 60) +
        stepper('经期天数', 'periodLen', 2, 14) +
        stepper('黄体期', 'lutealPhase', 7, 20) +
        '<div class="dp-section"><div class="dp-label">预计排卵日</div><div class="dp-ovu-preview">周期第 ' + (cur.cycleLen - cur.lutealPhase) + ' 天</div></div>' +
        '<div class="dp-section"><div class="dp-label">上次经期开始日（填了即可预测）</div><input class="dp-date-input" type="date" value="' + lastStart + '"/></div>' +
        '<div class="dp-tip">周期长度=两次经期开始间隔；经期天数=每次持续天数；黄体期=排卵后到下次经期的天数。每个人不同，按自己情况设。</div>' +
        '<div class="dp-actions"><button class="dp-save period-btn primary">保存</button></div>' +
      '</div>';
    document.body.appendChild(pop);
    document.body.classList.add('scroll-lock');
    pop.querySelector('.dp-mask').addEventListener('click', closeSettingsPop);
    pop.querySelector('.dp-close').addEventListener('click', closeSettingsPop);
    var work = { cycleLen: cur.cycleLen, periodLen: cur.periodLen, lutealPhase: cur.lutealPhase };
    var ovuPreview = pop.querySelector('.dp-ovu-preview');
    pop.querySelectorAll('.dp-stepper').forEach(function (st) {
      var key = st.getAttribute('data-key');
      var min = parseInt(st.getAttribute('data-min'), 10);
      var max = parseInt(st.getAttribute('data-max'), 10);
      var valEl = st.querySelector('.st-val');
      st.querySelector('.st-minus').addEventListener('click', function () {
        if (work[key] > min) { work[key]--; valEl.textContent = work[key]; ovuPreview.textContent = '周期第 ' + (work.cycleLen - work.lutealPhase) + ' 天'; }
      });
      st.querySelector('.st-plus').addEventListener('click', function () {
        if (work[key] < max) { work[key]++; valEl.textContent = work[key]; ovuPreview.textContent = '周期第 ' + (work.cycleLen - work.lutealPhase) + ' 天'; }
      });
    });
    pop.querySelector('.dp-save').addEventListener('click', function () {
      saveCfg(work); cfg = work;
      var dateVal = pop.querySelector('.dp-date-input').value;
      if (dateVal) {
        var norm2 = normalize(recs);
        var exists = norm2.some(function (r) { return r.start === dateVal; });
        if (!exists) {
          norm2.push({ id: newId(), start: dateVal, end: null });
          norm2 = normalize(norm2);
          saveRecs(norm2); recs = norm2;
        }
      }
      closeSettingsPop();
      render();
      toast('已保存');
      checkNotify();
    });
  }
  function closeSettingsPop() {
    var pop = document.getElementById('period-settings-pop');
    if (pop) pop.remove();
    document.body.classList.remove('scroll-lock');
  }

  function openNotifyPop() {
    var existing = document.getElementById('period-notify-pop');
    if (existing) existing.remove();
    var pop = document.createElement('div');
    pop.id = 'period-notify-pop';
    pop.className = 'period-day-pop';
    var advOpts = [3, 2, 1, 0];
    var advHtml = advOpts.map(function (d) {
      var on = notifyCfg.advanceDays.indexOf(d) >= 0;
      return '<button class="dp-sym adv' + (on ? ' on' : '') + '" data-adv="' + d + '">' + (d === 0 ? '当天' : '前' + d + '天') + '</button>';
    }).join('');
    pop.innerHTML =
      '<div class="dp-mask"></div>' +
      '<div class="dp-sheet">' +
        '<div class="dp-head"><span class="dp-date">经期提醒设置</span><button class="dp-close">×</button></div>' +
        '<div class="dp-section"><div class="dp-label">启用提醒</div><button class="dp-toggle' + (notifyCfg.enabled ? ' on' : '') + '">' + (notifyCfg.enabled ? '已开启' : '已关闭') + '</button></div>' +
        '<div class="dp-section"><div class="dp-label">提醒提前天数</div><div class="dp-sym-grid">' + advHtml + '</div></div>' +
        '<div class="dp-section"><div class="dp-label">提醒时间（小时 0-23）</div><input class="dp-hour" type="number" min="0" max="23" value="' + (notifyCfg.hour || 9) + '"/></div>' +
        '<div class="dp-tip">提醒在打开应用时检查并推送；后台通知需浏览器支持。</div>' +
        '<div class="dp-actions"><button class="dp-save period-btn primary">保存</button></div>' +
      '</div>';
    document.body.appendChild(pop);
    document.body.classList.add('scroll-lock');
    pop.querySelector('.dp-mask').addEventListener('click', closeNotifyPop);
    pop.querySelector('.dp-close').addEventListener('click', closeNotifyPop);
    var toggleBtn = pop.querySelector('.dp-toggle');
    toggleBtn.addEventListener('click', function () {
      notifyCfg.enabled = !notifyCfg.enabled;
      toggleBtn.textContent = notifyCfg.enabled ? '已开启' : '已关闭';
      toggleBtn.classList.toggle('on', notifyCfg.enabled);
      if (notifyCfg.enabled && 'Notification' in window && Notification.permission === 'default') {
        try { Notification.requestPermission(); } catch (e) {}
      }
    });
    pop.querySelectorAll('.adv').forEach(function (b) {
      b.addEventListener('click', function () { b.classList.toggle('on'); });
    });
    pop.querySelector('.dp-save').addEventListener('click', function () {
      var advs = [];
      pop.querySelectorAll('.adv.on').forEach(function (b) { advs.push(parseInt(b.getAttribute('data-adv'), 10)); });
      if (!advs.length) advs = [3, 1, 0];
      var h = parseInt(pop.querySelector('.dp-hour').value, 10);
      notifyCfg.advanceDays = advs;
      notifyCfg.hour = isNaN(h) ? 9 : Math.min(23, Math.max(0, h));
      saveNotify(notifyCfg);
      closeNotifyPop();
      toast('已保存');
      checkNotify();
    });
  }
  function closeNotifyPop() {
    var pop = document.getElementById('period-notify-pop');
    if (pop) pop.remove();
    document.body.classList.remove('scroll-lock');
  }

  // ---- 事件绑定 ----
  var app = document.querySelector('.app[data-app="period"]');
  if (app && page) {
    app.addEventListener('click', function () {
      var editing = Array.from(document.querySelectorAll('.app-grid')).some(function (g) { return g.classList.contains('editing'); });
      if (editing) return;
      document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
      page.hidden = false;
      cfg = loadCfg(); recs = loadRecs(); daily = loadDaily(); notifyCfg = loadNotify();
      viewM = -1;
      render();
      checkNotify();
    });
  }
  var back = document.getElementById('period-back');
  if (back) back.addEventListener('click', function () {
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
    var home = document.getElementById('page-phone');
    if (home) home.hidden = false;
  });
  var prevBtn = document.getElementById('period-prev');
  if (prevBtn) prevBtn.addEventListener('click', function () { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderGrid(); });
  var nextBtn = document.getElementById('period-next');
  if (nextBtn) nextBtn.addEventListener('click', function () { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderGrid(); });
  var ms = document.getElementById('period-mark-start');
  if (ms) ms.addEventListener('click', markStart);
  var me = document.getElementById('period-mark-end');
  if (me) me.addEventListener('click', markEnd);
  // 日历日格：短按切换经期标记，长按打开每日详情浮层
  var grid = document.getElementById('period-grid');
  if (grid) {
    var pressTimer = null, longPressed = false;
    grid.addEventListener('click', function (e) {
      if (longPressed) { longPressed = false; return; }
      var cell = e.target.closest('.pc-cell');
      if (!cell || cell.classList.contains('blank')) return;
      toggleDay(cell.getAttribute('data-date'));
    });
    grid.addEventListener('contextmenu', function (e) {
      var cell = e.target.closest('.pc-cell');
      if (!cell || cell.classList.contains('blank')) return;
      e.preventDefault();
      openDayPop(cell.getAttribute('data-date'));
    });
    grid.addEventListener('touchstart', function (e) {
      var cell = e.target.closest('.pc-cell');
      if (!cell || cell.classList.contains('blank')) return;
      var ds = cell.getAttribute('data-date');
      longPressed = false;
      pressTimer = setTimeout(function () { pressTimer = null; longPressed = true; openDayPop(ds); }, 500);
    }, { passive: true });
    grid.addEventListener('touchmove', function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true });
    grid.addEventListener('touchend', function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true });
    grid.addEventListener('touchcancel', function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true });
  }
  var hist = document.getElementById('period-history');
  if (hist) hist.addEventListener('click', function (e) {
    var del = e.target.closest('.ph-del');
    if (!del) return;
    delRec(del.getAttribute('data-id'));
  });
  var cog = document.getElementById('period-cog');
  if (cog) cog.addEventListener('click', openSettingsPop);
  // 通知设置入口：在 cog 旁加铃铛按钮（JS 创建，不改 template）
  var cogEl = document.getElementById('period-cog');
  if (cogEl && cogEl.parentNode && !document.getElementById('period-notify-btn')) {
    var nb = document.createElement('span');
    nb.id = 'period-notify-btn';
    nb.className = 'period-cog';
    nb.title = '提醒设置';
    nb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    nb.addEventListener('click', openNotifyPop);
    cogEl.parentNode.insertBefore(nb, cogEl);
  }

  // v3.10.x 全局共享：经期数据不随联系人切换重载（所有桌面共用全局键）。
  // contact-switched 无需处理；进页面时 app click handler 已重读全局同一份数据。

  // 启动后稍延迟检查通知（经期预测/延迟预警）
  setTimeout(checkNotify, 3000);
})();

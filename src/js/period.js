// ===== 功能：经期记录（桌面第三页） =====
// 记录经期开始/结束、预测下次经期、判断周期阶段（经期/易孕期/安全期）
// 数据 localStorage + IndexedDB 双写（键前缀 xy-home-v2:），纯本地无后端
// v3.6.x：日历可点选日期标记/取消经期日；按周期长度预测未来经期与易孕期
(function () {
  var store = window.activeStore();
  var page = document.getElementById('page-period');
  if (!store || !page) return;

  var KEY_REC = 'period-records';
  var KEY_CFG = 'period-cfg';

  function loadRecs() { try { return JSON.parse(store.get(KEY_REC) || '[]'); } catch (e) { return []; } }
  function saveRecs(list) {
    try {
      store.set(KEY_REC, JSON.stringify(list));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + KEY_REC, JSON.stringify(list)); } catch (e2) {}
    } catch (e) {}
  }
  function loadCfg() {
    try { var c = JSON.parse(store.get(KEY_CFG) || 'null'); if (c) return c; } catch (e) {}
    return { cycleLen: 28, periodLen: 5, lutealPhase: 14 };
  }
  function saveCfg(c) {
    try {
      store.set(KEY_CFG, JSON.stringify(c));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + KEY_CFG, JSON.stringify(c)); } catch (e2) {}
    } catch (e) {}
  }
  // 启动时从 IDB 回填缺失键（导入备份/清空后不丢记录）
  (function restore() {
    try {
      if (!window.idbGet) return;
      var myPrefix = window.activePrefix();
      if (!store.get(KEY_REC)) window.idbGet(myPrefix + ':' + KEY_REC).then(function (v) {
        if (window.activePrefix() !== myPrefix || !v) return;
        try { store.set(KEY_REC, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
      });
      if (!store.get(KEY_CFG)) window.idbGet(myPrefix + ':' + KEY_CFG).then(function (v) {
        if (window.activePrefix() !== myPrefix || !v) return;
        try { store.set(KEY_CFG, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
      });
    } catch (e) {}
  })();

  var cfg = loadCfg();
  var recs = loadRecs();

  // ---- 日期工具 ----
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDay(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 864e5); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); }
  function todayStr() { return dayStr(new Date()); }
  function newId() { return Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

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

  function luteal() { return cfg.lutealPhase || 14; }

  // ---- 当前状态 ----
  function status() {
    recs = normalize(recs);
    var today = todayStr();
    var inPeriod = false, curRec = null;
    recs.forEach(function (r) {
      var end = r.end || addDays(r.start, cfg.periodLen - 1);
      if (today >= r.start && today <= end) { inPeriod = true; curRec = r; }
    });
    var last = recs[recs.length - 1];
    var baseStart = curRec ? curRec.start : (last ? last.start : null);
    var nextStart = null;
    var ovulationDay = cfg.cycleLen - luteal();
    if (baseStart) {
      if (inPeriod) nextStart = addDays(curRec.start, cfg.cycleLen);
      else { var s = baseStart; while (s <= today) s = addDays(s, cfg.cycleLen); nextStart = s; }
    }
    if (inPeriod) {
      var dayOfPeriod = diffDays(curRec.start, today) + 1;
      var end2 = curRec.end || addDays(curRec.start, cfg.periodLen - 1);
      var remain = diffDays(today, end2) + 1;
      return { phase: 'period', inPeriod: true, nextStart: nextStart, dayOfCycle: dayOfPeriod, ovulationDay: ovulationDay, title: '经期第 ' + dayOfPeriod + ' 天', sub: '预计还剩 ' + Math.max(0, remain) + ' 天 · 注意保暖休息' };
    }
    if (!baseStart) return { phase: 'unknown', inPeriod: false, nextStart: null, dayOfCycle: 0, ovulationDay: ovulationDay, title: '暂无记录', sub: '点下方按钮标记本次经期开始' };
    if (baseStart > today) return { phase: 'safe', inPeriod: false, nextStart: baseStart, dayOfCycle: 0, ovulationDay: ovulationDay, title: '距下次经期约 ' + diffDays(today, baseStart) + ' 天', sub: '已预记录未来经期开始' };
    var dayOfCycle = diffDays(baseStart, today) + 1;
    if (dayOfCycle > cfg.cycleLen) return { phase: 'safe', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, title: '经期已推迟 ' + (dayOfCycle - cfg.cycleLen) + ' 天', sub: '点下方按钮标记本次经期开始' };
    if (dayOfCycle >= ovulationDay - 5 && dayOfCycle <= ovulationDay + 1) {
      var toOv = ovulationDay - dayOfCycle;
      return { phase: 'fertile', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, title: '易孕期 · 第 ' + dayOfCycle + ' 天', sub: toOv > 0 ? '距排卵约 ' + toOv + ' 天' : (toOv === 0 ? '今天约为排卵日' : '排卵约 ' + (-toOv) + ' 天前') };
    }
    return { phase: 'safe', inPeriod: false, nextStart: nextStart, dayOfCycle: dayOfCycle, ovulationDay: ovulationDay, title: '安全期 · 第 ' + dayOfCycle + ' 天', sub: nextStart ? '距下次经期约 ' + diffDays(today, nextStart) + ' 天' : '—' };
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
    if (!last) return 'safe';
    var today = todayStr();
    var predicts = [];
    var s = last.start, guard = 0;
    while (s <= addDays(today, cfg.cycleLen * 3) && guard < 200) {
      if (s >= today) predicts.push({ start: s, end: addDays(s, cfg.periodLen - 1) });
      s = addDays(s, cfg.cycleLen); guard++;
    }
    for (var j = 0; j < predicts.length; j++) {
      if (ds >= predicts[j].start && ds <= predicts[j].end) return 'predict';
    }
    var refStart = null;
    recs.forEach(function (r) { if (r.start <= ds) refStart = r.start; });
    predicts.forEach(function (p) { if (p.start <= ds) refStart = p.start; });
    if (!refStart) return 'safe';
    var dayOfCycle = diffDays(refStart, ds) + 1;
    var ovulationDay = cfg.cycleLen - luteal();
    if (dayOfCycle >= ovulationDay - 5 && dayOfCycle <= ovulationDay + 1) return 'fertile';
    return 'safe';
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
    var ico = document.getElementById('period-status-ico');
    if (ico) { ico.innerHTML = PHASE_ICO[st.phase] || PHASE_ICO.unknown; ico.className = 'period-status-ico phase-' + st.phase; }
    var t = document.getElementById('period-status-title');
    if (t) t.textContent = st.title;
    var s = document.getElementById('period-status-sub');
    if (s) s.textContent = st.sub;
    var bar = document.getElementById('period-phase-bar');
    if (bar) {
      var activeSeg = -1;
      if (st.phase === 'period') activeSeg = 0;
      else if (st.phase === 'fertile') activeSeg = 2;
      else if (st.phase === 'safe') activeSeg = (st.dayOfCycle > 0 && st.ovulationDay > 0 && st.dayOfCycle > st.ovulationDay + 1) ? 3 : 1;
      var segs = ['经期', '安全', '易孕', '安全'];
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
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var ph = dayPhase(ds);
      var isToday = ds === today;
      html += '<span class="pc-cell ph-' + ph + (isToday ? ' today' : '') + '" data-date="' + ds + '">' + d + '</span>';
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

  function render() { renderStatus(); renderGrid(); renderHistory(); }

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

  // ---- 事件绑定 ----
  var app = document.querySelector('.app[data-app="period"]');
  if (app && page) {
    app.addEventListener('click', function () {
      var editing = Array.from(document.querySelectorAll('.app-grid')).some(function (g) { return g.classList.contains('editing'); });
      if (editing) return;
      document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
      page.hidden = false;
      cfg = loadCfg(); recs = loadRecs();
      viewM = -1;
      render();
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
  var grid = document.getElementById('period-grid');
  if (grid) grid.addEventListener('click', function (e) {
    var cell = e.target.closest('.pc-cell');
    if (!cell || cell.classList.contains('blank')) return;
    toggleDay(cell.getAttribute('data-date'));
  });
  var hist = document.getElementById('period-history');
  if (hist) hist.addEventListener('click', function (e) {
    var del = e.target.closest('.ph-del');
    if (!del) return;
    delRec(del.getAttribute('data-id'));
  });
  var cog = document.getElementById('period-cog');
  if (cog) cog.addEventListener('click', function () {
    if (!window.openModal) return;
    var cur = loadCfg();
    window.openModal('周期设置（输入：周期,经期,黄体期）', cur.cycleLen + ',' + cur.periodLen + ',' + luteal(), function (v) {
      var parts = (v || '').split(/[,\s，]+/).filter(Boolean).map(Number);
      if (parts.length < 2 || parts.some(isNaN)) { toast('格式不正确，示例 28,5,14'); return; }
      var nc = {
        cycleLen: Math.min(60, Math.max(15, parts[0] || 28)),
        periodLen: Math.min(14, Math.max(2, parts[1] || 5)),
        lutealPhase: Math.min(20, Math.max(7, parts[2] || 14))
      };
      saveCfg(nc); cfg = nc; render(); toast('已保存');
    });
  });

  // 切换联系人：重载本桌面数据
  document.addEventListener('contact-switched', function () {
    try { cfg = loadCfg(); recs = loadRecs(); viewM = -1; if (!page.hidden) render(); } catch (e) {}
  });
})();
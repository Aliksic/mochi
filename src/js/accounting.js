// ===== 功能：记账（桌面第三页） =====
// 记录收支、分类管理、按月统计、按日分组列表
// 数据 localStorage + IndexedDB 双写（键前缀 xy-home-v2:），纯本地无后端
// 启动时自动确保桌面第三页存在（首次），把记账图标露出来
(function () {
  var G = 'xy-home-v2';
  var store = window.activeStore();
  var page = document.getElementById('page-accounting');
  if (!store || !page) return;

  var KEY_REC = 'accounting-records';
  var KEY_CAT = 'accounting-categories';

  var DEF_CATS = {
    expense: ['餐饮', '交通', '购物', '娱乐', '医疗', '居住', '通讯', '教育', '其他'],
    income: ['工资', '兼职', '红包', '投资', '其他']
  };

  function loadRecs() { try { return JSON.parse(store.get(KEY_REC) || '[]'); } catch (e) { return []; } }
  function saveRecs(list) {
    try {
      store.set(KEY_REC, JSON.stringify(list));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + KEY_REC, JSON.stringify(list)); } catch (e2) {}
    } catch (e) {}
  }
  function loadCats() {
    try { var c = JSON.parse(store.get(KEY_CAT) || 'null'); if (c && c.expense && c.income) return c; } catch (e) {}
    return { expense: DEF_CATS.expense.slice(), income: DEF_CATS.income.slice() };
  }
  function saveCats(c) {
    try {
      store.set(KEY_CAT, JSON.stringify(c));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + KEY_CAT, JSON.stringify(c)); } catch (e2) {}
    } catch (e) {}
  }
  // 启动时从 IDB 回填缺失键
  (function restore() {
    try {
      if (!window.idbGet) return;
      var myPrefix = window.activePrefix();
      if (!store.get(KEY_REC)) window.idbGet(myPrefix + ':' + KEY_REC).then(function (v) {
        if (window.activePrefix() !== myPrefix || !v) return;
        try { store.set(KEY_REC, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
      });
      if (!store.get(KEY_CAT)) window.idbGet(myPrefix + ':' + KEY_CAT).then(function (v) {
        if (window.activePrefix() !== myPrefix || !v) return;
        try { store.set(KEY_CAT, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
      });
    } catch (e) {}
  })();

  // ---- 日期工具 ----
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDay(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayStr() { return dayStr(new Date()); }
  function newId() { return Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  // ---- 状态 ----
  var recs = loadRecs();
  var cats = loadCats();
  var now = new Date();
  var viewY = now.getFullYear();
  var viewM = now.getMonth();
  var curType = 'expense';
  var curCat = '';
  var curFilter = 'all';

  // ---- 金额格式化 ----
  function fmt(n) {
    n = Math.round(n * 100) / 100;
    var s = Math.abs(n).toFixed(2);
    s = s.replace(/\.?0+$/, '');
    return (n < 0 ? '-' : '') + '¥' + s;
  }

  // ---- 渲染：概览 ----
  function renderOverview() {
    var ym = viewY + '-' + pad2(viewM + 1);
    var exp = 0, inc = 0;
    recs.forEach(function (r) {
      if (r.date.indexOf(ym) === 0) {
        if (r.type === 'expense') exp += r.amount;
        else if (r.type === 'income') inc += r.amount;
      }
    });
    var el;
    if ((el = document.getElementById('acc-ov-expense'))) el.textContent = fmt(exp);
    if ((el = document.getElementById('acc-ov-income'))) el.textContent = fmt(inc);
    if ((el = document.getElementById('acc-ov-balance'))) el.textContent = fmt(inc - exp);
    if ((el = document.getElementById('acc-month-txt'))) el.textContent = viewY + ' 年 ' + (viewM + 1) + ' 月';
  }

  // ---- 渲染：分类胶囊 ----
  function renderCatGrid() {
    var grid = document.getElementById('acc-cat-grid');
    if (!grid) return;
    var list = cats[curType] || [];
    if (curCat && list.indexOf(curCat) < 0) curCat = '';
    if (!curCat && list.length) curCat = list[0];
    grid.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'acc-cat' + (c === curCat ? ' sel' : '');
      b.textContent = c;
      b.setAttribute('data-cat', c);
      b.addEventListener('click', function () { curCat = c; renderCatGrid(); });
      grid.appendChild(b);
    });
  }

  // ---- 渲染：记录列表 ----
  function renderList() {
    var box = document.getElementById('acc-list');
    if (!box) return;
    var ym = viewY + '-' + pad2(viewM + 1);
    var filtered = recs.filter(function (r) {
      if (r.date.indexOf(ym) !== 0) return false;
      if (curFilter !== 'all' && r.type !== curFilter) return false;
      return true;
    });
    if (!filtered.length) {
      box.innerHTML = '<div class="acc-empty">本月还没有记录，点上方「记一笔」开始</div>';
      return;
    }
    // 按日期分组（倒序）
    var groups = {};
    filtered.forEach(function (r) {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    var dates = Object.keys(groups).sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });
    var html = '';
    var today = todayStr();
    dates.forEach(function (d) {
      var items = groups[d].sort(function (a, b) { return b.time - a.time; });
      var dayExp = 0, dayInc = 0;
      items.forEach(function (r) {
        if (r.type === 'expense') dayExp += r.amount;
        else dayInc += r.amount;
      });
      var dt = parseDay(d);
      var label = (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日 · 周' + WEEK[dt.getDay()];
      if (d === today) label += ' · 今天';
      html += '<div class="acc-day">';
      html += '<div class="acc-day-head"><span class="acc-day-date">' + label + '</span>';
      if (dayExp) html += '<span class="acc-day-sum expense">' + fmt(dayExp) + '</span>';
      if (dayInc) html += '<span class="acc-day-sum income">' + fmt(dayInc) + '</span>';
      html += '</div>';
      items.forEach(function (r) {
        var amt = (r.type === 'expense' ? '-' : '+') + fmt(r.amount).replace(/^-/, '');
        html += '<div class="acc-row" data-id="' + r.id + '">';
        html += '<div class="acc-row-info"><div class="acc-row-cat">' + esc(r.category) + '</div>';
        html += '<div class="acc-row-note">' + esc(r.note || '无备注') + '</div></div>';
        html += '<span class="acc-row-amount ' + r.type + '">' + amt + '</span>';
        html += '<button class="acc-row-del" data-id="' + r.id + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>';
        html += '</div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function render() {
    recs = loadRecs();
    cats = loadCats();
    renderOverview();
    renderCatGrid();
    renderList();
  }

  // ---- 记一笔 ----
  function saveOne() {
    var amountEl = document.getElementById('acc-amount');
    var noteEl = document.getElementById('acc-note');
    var dateEl = document.getElementById('acc-date');
    if (!amountEl) return;
    var amount = parseFloat(amountEl.value);
    if (isNaN(amount) || amount <= 0) { toast('请输入金额'); amountEl.focus(); return; }
    amount = Math.round(amount * 100) / 100;
    var note = (noteEl ? noteEl.value : '').trim();
    var date = dateEl && dateEl.value ? dateEl.value : todayStr();
    if (!curCat) curCat = (cats[curType] && cats[curType][0]) || '其他';
    var rec = { id: newId(), type: curType, amount: amount, category: curCat, note: note, date: date, time: Date.now() };
    var list = loadRecs();
    list.push(rec);
    saveRecs(list);
    recs = list;
    amountEl.value = '';
    if (noteEl) noteEl.value = '';
    toast('已记 ' + (curType === 'expense' ? '支出 ' : '收入 ') + fmt(amount));
    renderOverview();
    renderList();
  }

  // ---- 删除记录 ----
  function delOne(id) {
    if (!window.openModal) { doDel(id); return; }
    var rec = recs.filter(function (r) { return r.id === id; })[0];
    var txt = rec ? (rec.type === 'expense' ? '支出 ' : '收入 ') + fmt(rec.amount) + ' · ' + rec.category + (rec.note ? ' · ' + rec.note : '') : '这条记录';
    window.openModal('删除这条记录？', '', function (v) { if (v === 'ok') doDel(id); }, { noInput: true, staticText: txt });
  }
  function doDel(id) {
    var list = loadRecs().filter(function (r) { return r.id !== id; });
    saveRecs(list);
    recs = list;
    renderOverview();
    renderList();
    toast('已删除');
  }

  // ---- 分类管理 ----
  function manageCats() {
    if (!window.openModal) return;
    window.openModal('分类管理', '', function (v) {
      if (!v) return;
      if (v.indexOf('add:') === 0) {
        var type = v.slice(4);
        window.openModal('添加' + (type === 'expense' ? '支出' : '收入') + '分类', '', function (name) {
          name = (name || '').trim();
          if (!name) return;
          var c = loadCats();
          if (c[type].indexOf(name) >= 0) { toast('该分类已存在'); return; }
          c[type].push(name);
          saveCats(c);
          cats = c;
          renderCatGrid();
          toast('已添加「' + name + '」');
        });
      } else if (v.indexOf('del:') === 0) {
        var type2 = v.slice(4);
        var c2 = loadCats();
        if (!c2[type2].length) { toast('没有可删除的分类'); return; }
        window.openModal('选择要删除的' + (type2 === 'expense' ? '支出' : '收入') + '分类', '', function (name) {
          if (!name) return;
          var c3 = loadCats();
          var i = c3[type2].indexOf(name);
          if (i < 0) return;
          var used = loadRecs().some(function (r) { return r.type === type2 && r.category === name; });
          if (used) { toast('「' + name + '」下有记录，无法删除'); return; }
          c3[type2].splice(i, 1);
          saveCats(c3);
          cats = c3;
          if (curType === type2 && curCat === name) curCat = '';
          renderCatGrid();
          toast('已删除「' + name + '」');
        }, { noInput: true, pills: c2[type2].map(function (c) { return { label: c, value: c }; }) });
      }
    }, {
      noInput: true,
      pills: [
        { label: '添加支出分类', value: 'add:expense' },
        { label: '添加收入分类', value: 'add:income' },
        { label: '删除支出分类', value: 'del:expense' },
        { label: '删除收入分类', value: 'del:income' }
      ]
    });
  }

  function toast(msg) {
    var t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.className = 'cc-toast'; }, 2000);
  }

  // ---- 事件绑定 ----
  var app = document.querySelector('.app[data-app="accounting"]');
  if (app && page) {
    app.addEventListener('click', function () {
      var editing = Array.from(document.querySelectorAll('.app-grid')).some(function (g) { return g.classList.contains('editing'); });
      if (editing) return;
      document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
      page.hidden = false;
      var d = new Date();
      viewY = d.getFullYear(); viewM = d.getMonth();
      curType = 'expense'; curCat = ''; curFilter = 'all';
      var de = document.getElementById('acc-date');
      if (de) de.value = todayStr();
      render();
    });
  }
  var back = document.getElementById('acc-back');
  if (back) back.addEventListener('click', function () {
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
    var home = document.getElementById('page-phone');
    if (home) home.hidden = false;
  });
  var prevBtn = document.getElementById('acc-prev');
  if (prevBtn) prevBtn.addEventListener('click', function () { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderOverview(); renderList(); });
  var nextBtn = document.getElementById('acc-next');
  if (nextBtn) nextBtn.addEventListener('click', function () { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderOverview(); renderList(); });

  var typeTabs = document.getElementById('acc-type-tabs');
  if (typeTabs) typeTabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.acc-type-tab');
    if (!btn) return;
    curType = btn.getAttribute('data-type');
    curCat = '';
    typeTabs.querySelectorAll('.acc-type-tab').forEach(function (b) { b.classList.toggle('sel', b === btn); });
    renderCatGrid();
  });

  var filterTabs = document.getElementById('acc-filter-tabs');
  if (filterTabs) filterTabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.acc-filter-tab');
    if (!btn) return;
    curFilter = btn.getAttribute('data-filter');
    filterTabs.querySelectorAll('.acc-filter-tab').forEach(function (b) { b.classList.toggle('sel', b === btn); });
    renderList();
  });

  var saveBtn = document.getElementById('acc-save');
  if (saveBtn) saveBtn.addEventListener('click', saveOne);

  var listEl = document.getElementById('acc-list');
  if (listEl) listEl.addEventListener('click', function (e) {
    var del = e.target.closest('.acc-row-del');
    if (!del) return;
    delOne(del.getAttribute('data-id'));
  });

  var cog = document.getElementById('acc-cog');
  if (cog) cog.addEventListener('click', manageCats);

  // 切换联系人：重载本桌面数据
  document.addEventListener('contact-switched', function () {
    try {
      recs = loadRecs(); cats = loadCats();
      if (!page.hidden) render();
    } catch (e) {}
    setTimeout(ensureP3, 200);
  });

  // ===== 每次启动/切联系人都检查：p3-grid 若不在 slide 里就修复 =====
  function ensureP3() {
    var box = document.getElementById('desktop-pages');
    var p3 = document.querySelector('[data-desk-widget="p3apps"]');
    if (!box || !p3) return;
    // 已在某个可见 page-slide 里 → 不用动
    if (p3.closest && p3.closest('.page-slide') && !p3.closest('#desk-widget-pool')) return;
    // 确保 desk-page-count >= 3（用 activeStore 写命名空间键，与 deskPageCount() 读取一致）
    try {
      var s = window.activeStore();
      var n = parseInt(s.get('desk-page-count'), 10);
      if (isNaN(n) || n < 3) s.set('desk-page-count', '3');
    } catch (e) {}
    // 找到或创建第三页 slide
    var slides = box.querySelectorAll('.page-slide');
    var third;
    if (slides.length >= 3) {
      third = slides[2];
    } else {
      third = document.createElement('div');
      third.className = 'page-slide desk-page third';
      third.setAttribute('data-desk', '2');
      box.appendChild(third);
    }
    // 清理空白页提示（如果存在）
    var hint = third.querySelector('.desk-page-hint');
    var addBtn = third.querySelector('.desk-page-add');
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    if (addBtn && addBtn.parentNode) addBtn.parentNode.removeChild(addBtn);
    // 把 p3-grid 移到第三页
    third.appendChild(p3);
    if (window.deskRebuild) window.deskRebuild();
  }
  window.ensureP3 = ensureP3;
  if (window.__mochiDataReady) ensureP3();
  else {
    try {
      document.addEventListener('mochi-restore-done', function h() {
        document.removeEventListener('mochi-restore-done', h);
        ensureP3();
      });
    } catch (e) { ensureP3(); }
  }
})();
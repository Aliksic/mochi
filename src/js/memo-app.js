// ===== 备忘录（桌面第三页图标，纯动态注入；独立文件——与 p2-features.js 解耦避免同文件并发改动） =====
// 待办清单式备忘：添加 / 勾选完成 / 点文字多行编辑 / 置顶 / 删除 / 清已完成；
// 完成全部有 TA 夸夸 + 震动；可选「完成后自动发到聊天」（默认关，memo-app-send='1' 开）。
// 数据全局共享（所有桌面联系人互通一份，参照 fish-log/period 先例）：
// 键在 xy-home-v2 根命名空间——memo-app-items = JSON [{id,t,done,pin,ts}]、memo-app-send、
// memo-app-global-migrated（迁移幂等标记）。store.set 自动 LS+IDB 双写。
(function () {
  const GNS = 'xy-home-v2';
  function gStore() { try { return window.xyStore(GNS); } catch (e) { return null; } }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function editingNow() { return Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing')); }
  function toast(msg) {
    let t = document.getElementById('memo-app-toast');
    if (!t) { t = document.createElement('div'); t.id = 'memo-app-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._tm); t._tm = setTimeout(() => { t.className = 'cc-toast'; }, 1800);
  }
  // 与 p2-features 同频/伸手/喝水页同款开页方式：rAF 后隐藏 tabbar/状态栏并加 .full
  function openPage(pg) {
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    pg.hidden = false;
    requestAnimationFrame(() => {
      const tabbar = document.querySelector('.tabbar');
      const phone = document.querySelector('.phone');
      if (tabbar) tabbar.hidden = true;
      if (phone) phone.classList.add('no-statusbar');
      pg.classList.add('full');
    });
  }
  function backHome(pg) {
    if (pg) pg.classList.remove('full');
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const home = document.getElementById('page-phone');
    if (home) home.hidden = false;
  }

  const DEF_MEMO_ALLDONE = ['都做完啦，真棒', '全部完成，说到做到', '清零啦，奖励一个抱抱'];
  const DEF_MEMO_DONE = ['又完成一件，好棒', '进度 +1，继续呀', '完成啦'];
  const DEF_MEMO_ADD = ['记下来啦，我盯着你完成', '嗯，我记着了', '好的，一件一件来'];

  // ---- 图标注入第三页 ----
  const host = (document.getElementById('page-phone') || {}).parentNode || document.body;
  const memoApp = document.createElement('div');
  memoApp.className = 'app'; memoApp.setAttribute('data-app', 'memo'); memoApp.setAttribute('data-desk-widget', 'app-memo');
  memoApp.innerHTML =
    '<div class="app-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4.5h8a2 2 0 012 2V19a2 2 0 01-2 2H8a2 2 0 01-2-2V6.5a2 2 0 012-2z"/><path d="M9.5 3h5v3h-5z"/><path d="M9 11h6M9 14.5h6M9 18h3.5"/></svg></div>' +
    '<div class="app-name">备忘录</div>';
  // 默认进第三页图标组。注意：全新冷启动时序里 buildDeskPages(DESK_PAGE_MIN 收缩) 会先把
  // 第三页整页（含 p3apps 组）短暂移进隐藏池、稍后由 accounting.js 的 ensureP3 找回归位——
  // 所以这里必须无条件 append 进当前网格节点（哪怕它在池里），随组一起回第三页；
  // 不能做「在池里就跳过」的守卫（那会让图标永远孤儿）。装修布局里若已单独摆放过
  // app-memo，随后的 applyDeskLayout 重应用会把节点挪到配置的位置。
  (function placeMemo() {
    const p3 = document.querySelector('.app-grid.p3-grid');
    if (p3) p3.appendChild(memoApp);
    try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
  })();

  // ---- 备忘录页 ----
  const memoPage = document.createElement('div');
  memoPage.className = 'page'; memoPage.id = 'page-memo'; memoPage.hidden = true;
  memoPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="memo-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">备忘录</span></div>' +
    '<div class="memo-body">' +
      '<div class="memo-input-row"><input class="memo-inp" id="memo-inp" type="text" placeholder="记一件想做的事…" maxlength="200"><button class="memo-add" id="memo-add-btn">添加</button></div>' +
      '<div class="memo-msg glass" id="memo-msg"></div>' +
      '<div class="memo-toolbar"><span class="memo-count" id="memo-count"></span><button class="memo-cleardone" id="memo-cleardone">清已完成</button></div>' +
      '<div class="memo-list" id="memo-list"></div>' +
      '<div class="memo-empty" id="memo-empty">还没有备忘<br>想做的事、要买的东西、突然的念头<br>都可以写在这里</div>' +
      '<div class="memo-manage"><button class="memo-send-btn" id="memo-send">完成发到聊天：关</button></div>' +
    '</div>';
  host.appendChild(memoPage);

  // ---- 数据层：全局根命名空间（所有桌面联系人互通一份） ----
  function memoItems() { const s = gStore(); if (!s) return []; try { const a = JSON.parse(s.get('memo-app-items') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function memoSave(a) { const s = gStore(); if (s) try { s.set('memo-app-items', JSON.stringify(a)); } catch (e) {} }
  function memoSendOn() { const s = gStore(); try { return s.get('memo-app-send') === '1'; } catch (e) { return false; } }
  function memoPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function memoFmt(ts) { const d = new Date(ts); const p = (n) => (n < 10 ? '0' + n : '' + n); return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function memoShowMsg(t) { const el = document.getElementById('memo-msg'); if (el) { el.classList.add('fade'); setTimeout(() => { el.textContent = t; el.classList.remove('fade'); }, 200); } }

  // ---- 全局共享迁移 + 误迁自愈（全部在本文件完成，不改 contacts.js——对方域） ----
  // ① 存量迁移：把各联系人命名空间（含 default）的 memo-app-* 合并进根键（按 id 去重、
  //    冲突取 ts 新者；发送开关任一桌面开过即全局开），合并后清理各桌面旧键，幂等标记防重跑。
  // ② 误迁自愈：contacts.js migrateLegacy 会把无冒号的根命名空间键当「旧顶层键」拷进
  //    default 桌面并删 LS 根键（memo-app-* 尚未加进其 EXCLUDE 列表）。这里每次启动
  //    检测：根键空而 default 有副本 → 写回根并删副本（与 migrateLegacy 内 bg-keepalive
  //    修复同套路）；根键有值而 default 残留旧副本 → 清掉副本。IDB 根键迁移时保留，
  //    idbRestore 会回填，数据不丢。AI-B 后续把三键加进 EXCLUDE 后自愈逻辑自然闲置。
  function memoMergeById(a, b) {
    const map = {};
    a.forEach(x => { if (x && x.id) map[x.id] = x; });
    b.forEach(x => { if (x && x.id) { const cur = map[x.id]; if (!cur || (x.ts || 0) > (cur.ts || 0)) map[x.id] = x; } });
    return Object.keys(map).map(k => map[k]);
  }
  function memoParseItems(raw) { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function memoGlobalRepair() {
    const root = gStore(); if (!root) return;
    let def = null; try { def = window.xyStore(GNS + ':default'); } catch (e) {}
    if (!def) return;
    // 只做「LS 根键缺失 → 从 default 副本写回」。必须看裸 localStorage 而不是
    // root.get()——migrateLegacy 只删 LS（memoryCache 仍在），root.get 会被
    // memoryCache 掩盖误判「还有值」，导致 LS 根键永远补不回来。
    // default 命名空间的键既可能是 migrateLegacy 误迁副本（根键被吃），也可能是
    // 未迁移的旧版按桌面存量（合并前）——两种情况都不能在根键有值时贸然删
    // default 键，统一交给下方按 id 幂等合并处理，避免误删存量。
    ['memo-app-items', 'memo-app-send', 'memo-app-global-migrated'].forEach(k => {
      try {
        let lsRoot = null; try { lsRoot = localStorage.getItem(GNS + ':' + k); } catch (e) {}
        if (lsRoot === null) {
          const dv = def.get(k);
          if (dv !== null && dv !== undefined && dv !== '') { root.set(k, dv); }
        }
      } catch (e) {}
    });
  }
  function memoMigrateGlobal() {
    const root = gStore(); if (!root) return;
    memoGlobalRepair();
    try {
      if (root.get('memo-app-global-migrated') === '1') return;
      let merged = memoParseItems(root.get('memo-app-items'));
      let sendOn = root.get('memo-app-send') === '1';
      let touched = false;
      let contacts = [];
      try { contacts = (window.getContacts && window.getContacts()) || []; } catch (e) {}
      if (!contacts.length) contacts = [{ id: 'default' }];
      contacts.forEach(c => {
        const cid = c && c.id; if (!cid) return;
        let s = null; try { s = window.storeFor(cid); } catch (e) {}
        if (!s) return;
        try {
          const raw = s.get('memo-app-items');
          if (raw) {
            const arr = memoParseItems(raw);
            if (arr.length) { merged = memoMergeById(merged, arr); touched = true; }
            s.remove('memo-app-items');
          }
          if (s.get('memo-app-send') === '1') { sendOn = true; touched = true; }
          try { s.remove('memo-app-send'); } catch (e) {}
        } catch (e) {}
      });
      if (touched || merged.length) {
        root.set('memo-app-items', JSON.stringify(merged));
        if (sendOn) root.set('memo-app-send', '1');
      }
      root.set('memo-app-global-migrated', '1');
    } catch (e) {}
  }
  memoMigrateGlobal();
  try {
    // IDB 回填完成后重跑一次：根键/各桌面旧键可能只在 IDB 里（大键或 Edge LS 丢失场景）。
    // 另外 migrateLegacy（contacts.js，未把 memo-app-* 加 EXCLUDE 前）会在 restore-done
    // 后按 idbGet promise 异步逐键把根键拷进 default 并删 LS 根键——时序总晚于本文件
    // 的同步修复，所以再补两个延迟修复点把 LS 根键写回（幂等，纯 LS 补写，开销可忽略），
    // 保证备份导出（按 LS 前缀遍历）能直接带上根键。
    document.addEventListener('mochi-restore-done', function h() {
      document.removeEventListener('mochi-restore-done', h);
      memoMigrateGlobal();
      if (!memoPage.hidden) memoRender();
      [600, 2000].forEach(ms => { try { setTimeout(memoMigrateGlobal, ms); } catch (e) {} });
    });
  } catch (e) {}

  function memoRender() {
    const items = memoItems();
    const list = document.getElementById('memo-list');
    if (!list) return;
    list.innerHTML = '';
    const undone = items.filter(x => !x.done).length;
    const cnt = document.getElementById('memo-count');
    if (cnt) cnt.textContent = items.length ? ('共 ' + items.length + ' 条 · 待办 ' + undone) : '';
    const empty = document.getElementById('memo-empty');
    if (empty) empty.hidden = items.length > 0;
    // 展示顺序：置顶在前；同组内未完成的排前面，其余保持原顺序
    const rows = items.slice().sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || ((a.done ? 1 : 0) - (b.done ? 1 : 0)));
    rows.forEach(it => {
      const row = document.createElement('div');
      row.className = 'memo-item glass' + (it.done ? ' done' : '') + (it.pin ? ' pinned' : '');
      const chk = document.createElement('span');
      chk.className = 'mm-check';
      chk.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      chk.addEventListener('click', () => {
        if (editingNow()) return;
        const a = memoItems(); const cur = a.find(x => x.id === it.id); if (!cur) return;
        cur.done = !cur.done; memoSave(a);
        if (cur.done) vibrate(8);
        memoRender();
        if (cur.done) {
          const arr = memoItems();
          if (arr.length && arr.every(x => x.done)) { vibrate([60, 40, 60]); memoShowMsg(memoPick(DEF_MEMO_ALLDONE)); }
          else if (Math.random() < 0.35) memoShowMsg(memoPick(DEF_MEMO_DONE));
          if (memoSendOn() && window.chatAddIn) { try { window.chatAddIn('✓ 完成啦：「' + cur.t + '」'); } catch (e) {} }
        }
      });
      const main = document.createElement('div'); main.className = 'mm-main';
      const txt = document.createElement('div'); txt.className = 'mm-text'; txt.textContent = it.t || '';
      txt.addEventListener('click', () => {
        if (editingNow()) return;
        if (!window.openModal) return;
        window.openModal('编辑备忘', it.t, (v) => {
          const val = (v || '').trim(); if (!val) return;
          const a = memoItems(); const cur = a.find(x => x.id === it.id); if (!cur) return;
          cur.t = val.slice(0, 500); cur.ts = Date.now(); memoSave(a); memoRender();
        }, { textarea: true });
      });
      const tm = document.createElement('div'); tm.className = 'mm-time'; tm.textContent = memoFmt(it.ts || Date.now());
      main.appendChild(txt); main.appendChild(tm);
      const pin = document.createElement('button');
      pin.className = 'mm-pin' + (it.pin ? ' on' : ''); pin.textContent = '📌'; pin.title = it.pin ? '取消置顶' : '置顶';
      pin.addEventListener('click', () => {
        if (editingNow()) return;
        const a = memoItems(); const cur = a.find(x => x.id === it.id); if (!cur) return;
        cur.pin = !cur.pin; memoSave(a); vibrate(6); memoRender();
      });
      const del = document.createElement('button');
      del.className = 'mm-del'; del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'; del.title = '删除';
      del.addEventListener('click', () => {
        if (editingNow()) return;
        if (!window.openModal) { memoSave(memoItems().filter(x => x.id !== it.id)); memoRender(); return; }
        const short = (it.t || '').length > 16 ? (it.t || '').slice(0, 16) + '…' : (it.t || '');
        window.openModal('删除这条备忘？', '', () => { memoSave(memoItems().filter(x => x.id !== it.id)); memoRender(); toast('已删除'); }, { noInput: true, staticText: '「' + short + '」删除后无法恢复。' });
      });
      row.appendChild(chk); row.appendChild(main); row.appendChild(pin); row.appendChild(del);
      list.appendChild(row);
    });
  }

  function memoAddFromInput() {
    if (editingNow()) return;
    const inp = document.getElementById('memo-inp'); if (!inp) return;
    const v = (inp.value || '').trim(); if (!v) { toast('先写点内容吧'); return; }
    const a = memoItems();
    a.unshift({ id: Date.now() + '-' + Math.floor(Math.random() * 1000), t: v.slice(0, 500), done: false, pin: false, ts: Date.now() });
    memoSave(a); inp.value = ''; memoRender();
    if (Math.random() < 0.25) memoShowMsg(memoPick(DEF_MEMO_ADD));
  }
  function memoGreet() {
    const a = memoItems();
    if (!a.length) memoShowMsg('把想做的事记下来，我帮你记着');
    else if (a.every(x => x.done)) memoShowMsg(memoPick(DEF_MEMO_ALLDONE));
    else if (Math.random() < 0.5) memoShowMsg('还有 ' + a.filter(x => !x.done).length + ' 件没做完呢，慢慢来');
  }

  if (memoApp) memoApp.addEventListener('click', () => { if (editingNow()) return; openPage(memoPage); memoRender(); memoGreet(); });
  document.getElementById('memo-back').addEventListener('click', () => backHome(memoPage));
  document.getElementById('memo-add-btn').addEventListener('click', memoAddFromInput);
  // 安卓输入框被转成 ce-box 后仍走 input.value / 原生事件代理；Enter 兜底走按钮路径
  try { document.getElementById('memo-inp').addEventListener('keydown', (e) => { if (e && (e.key === 'Enter' || e.keyCode === 13)) { e.preventDefault(); memoAddFromInput(); } }); } catch (e) {}
  document.getElementById('memo-cleardone').addEventListener('click', () => {
    if (editingNow()) return;
    const n = memoItems().filter(x => x.done).length;
    if (!n) { toast('没有已完成的'); return; }
    if (!window.openModal) { memoSave(memoItems().filter(x => !x.done)); memoRender(); return; }
    window.openModal('清掉已完成的？', '', () => { memoSave(memoItems().filter(x => !x.done)); memoRender(); toast('已清理 ' + n + ' 条'); }, { noInput: true, staticText: '将清除 ' + n + ' 条已完成备忘，无法恢复。' });
  });
  const memoSendBtn = document.getElementById('memo-send');
  if (memoSendBtn) {
    memoSendBtn.textContent = '完成发到聊天：' + (memoSendOn() ? '开' : '关');
    memoSendBtn.addEventListener('click', () => {
      const s = gStore(); const on = !memoSendOn();
      if (s) try { s.set('memo-app-send', on ? '1' : '0'); } catch (e) {}
      memoSendBtn.textContent = '完成发到聊天：' + (on ? '开' : '关');
    });
  }
  document.addEventListener('contact-switched', () => { if (!memoPage.hidden) memoRender(); });
})();

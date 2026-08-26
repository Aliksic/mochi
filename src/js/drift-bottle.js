// ===== 漂流瓶：两个世界之间的海（聊天「更多功能」→【互动】进入；独立全屏页 page-drift） =====
// 定位（对齐用户设计文档）：不是随机陌生人社交瓶，而是「偶尔收到一份来自TA的东西」——
//   你写下的话会漂到两个世界之间，过几天可能漂回来（熟悉的瓶子）；
//   TA 的话像从另一个世界慢慢漂过来（字卡库抽取，绝不 AI 瞎编）；偶尔是空瓶/小礼物。
// 核心玩法：
//   捡一个 → 概率出瓶（普通60 / 空瓶·小物25 / 特殊10 / TA5，按状态微调：
//   今天互动多→TA概率↑；很久没来→第一瓶大概率是TA刚漂来的；TA瓶每日上限3防刷）；
//   我也放一个 → 记录 + 随机排期「漂回来」（36~96h 后 70% 概率回到捡瓶队列）
//   + 45% 概率排期「TA的回应」（6~40h 后生成回应瓶 + 聊天一次性轻提示，双人漂流瓶）；
//   心意币联动：每日首次捡瓶 +2、特殊瓶 +5，每日上限 10，写 gift-wallet 同一本账
//   （与心意集市/红包共用，只加我的余额），不做成刷币工具。
// 字卡库联动：DEFAULT_CARD_DATA.drift 三组（TA的话/TA的回应/海风），字卡库【系统预设字卡】
//   「漂流瓶」tab 可逐张开关（dc-off-drift:*），getLibPool 同源抽取，全关回退内置兜底。
// 数据按联系人桌面隔离：activeStore() 键 drift-data，IndexedDB 镜像兜底（room/garden 同款）。
// 入口接线全部在本文件内完成（more-drift 按钮 / 返回键），不改 chat.js。
(function () {
  const KEY = 'drift-data';
  const page = document.getElementById('page-drift');
  if (!page) return;

  // ---- 基础工具 ----
  function S() { try { return window.activeStore(); } catch (e) { return null; } }
  function pn() {
    try { const s = S(); return (s && (s.get('cs-lbl-partner') || s.get('lbl-partner'))) || 'TA'; } catch (e) { return 'TA'; }
  }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function todayKey() { const t = new Date(); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); }
  function fmtDay(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function fmtTime(ts) { const d = new Date(ts); const h = d.getHours(), m = d.getMinutes(); return fmtDay(ts) + ' ' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  let toastT = null;
  function toast(t) {
    let el = document.getElementById('cc-toast');
    if (!el) { el = document.createElement('div'); el.id = 'cc-toast'; document.body.appendChild(el); }
    el.textContent = t; el.className = 'cc-toast'; void el.offsetWidth; el.className = 'cc-toast show';
    clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'cc-toast'; }, 2200);
  }
  function taFit(t) { let s = String(t == null ? '' : t).replace(/\{n\}/g, pn()); try { if (window.taFit) s = window.taFit(s); } catch (e) {} return s; }

  // ---- 字卡池（与字卡库【漂流瓶】tab 同源；逐张开关过滤；全关回退内置兜底） ----
  const FB = {
    ta: ['过来一点。', '我在。', '今天也陪着你。', '别急，慢慢来。'],
    reply: ['看到了。', '好。等我。', '嗯，收到了。', '我也想你。这句是回礼。'],
    sea: ['今天有没有好好休息？', '慢慢来，海不催任何人。', '你已经做得很好了。', '想见的人，总会再见的。']
  };
  function poolLine(group, fbKey, fit) {
    let arr = null;
    try { arr = window.getLibPool ? window.getLibPool('drift', group, FB[fbKey] || []) : null; } catch (e) {}
    if (!arr || !arr.length) arr = FB[fbKey] || [];
    else {
      try { if (window.isDefaultCardOff) { const f = arr.filter(c => !window.isDefaultCardOff('drift', c)); if (f.length) arr = f; } } catch (e) {}
    }
    const t = String(rnd(arr));
    return fit === false ? t : taFit(t);
  }

  // ---- 小物品目录 ----
  const ITEMS = [
    { e: '🌸', n: '一朵花' }, { e: '🐚', n: '一个小贝壳' }, { e: '🪶', n: '一根软软的羽毛' },
    { e: '⭐', n: '一颗星星贴纸' }, { e: '🍬', n: '一颗没化掉的糖' }, { e: '🧸', n: '一只迷你小熊' }
  ];
  const EMPTY_LINES = [
    '瓶子里什么都没有，只有一点海的味道。',
    '空瓶子。软木塞倒是雕了一朵小花。',
    '只有一张被海水晕开的白纸。',
    '瓶底躺着两粒沙，亮晶晶的。'
  ];
  const ITEM_LINES = [
    '瓶子里装着{g}，还有一张小纸条：「给捡到它的人。」',
    '摇晃的声响很轻——里面是{g}。',
    '{g}躺在瓶底，像特意留下的。'
  ];

  // ---- 数据 ----
  const MINE_CAP = 50, GOT_CAP = 120, PICK_CD = 20000;
  function fresh() {
    return {
      mine: [], got: [],
      day: { date: '', picks: 0, coin: 0, taGot: 0 },
      lastVisit: 0, cdUntil: 0
    };
  }
  let d = null;
  function fix(o) {
    if (!Array.isArray(o.mine)) o.mine = [];
    if (!Array.isArray(o.got)) o.got = [];
    if (!o.day || typeof o.day !== 'object') o.day = { date: '', picks: 0, coin: 0, taGot: 0 };
    o.mine.forEach(m => { if (typeof m.fav !== 'number') m.fav = 0; });
    o.got.forEach(g => { if (typeof g.fav !== 'number') g.fav = 0; });
    if (!isFinite(o.lastVisit)) o.lastVisit = 0;
    if (!isFinite(o.cdUntil)) o.cdUntil = 0;
    if (o.mine.length > MINE_CAP) o.mine = o.mine.slice(-MINE_CAP);
    if (o.got.length > GOT_CAP) o.got = o.got.slice(-GOT_CAP);
  }
  function load() {
    try {
      const v = S().get(KEY);
      if (v) { const o = JSON.parse(v); if (o && typeof o === 'object') { fix(o); return o; } }
    } catch (e) {}
    return fresh();
  }
  function save() {
    try { S().set(KEY, JSON.stringify(d)); } catch (e) {}
    try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + KEY, JSON.stringify(d)); } catch (e) {}
  }

  // IndexedDB 回填兜底（LS 写失败的老设备）：LS 为空则读 IDB 副本写回（room/garden 同款思路）
  (function restoreIdb() {
    try {
      const s = S(); if (!s || !window.idbGet || s.get(KEY)) return;
      const pf = window.activePrefix();
      window.idbGet(pf + ':' + KEY).then(v => {
        if (!v || window.activePrefix() !== pf || s.get(KEY)) return;
        try {
          const o = typeof v === 'string' ? JSON.parse(v) : v;
          if (!o || typeof o !== 'object') return;
          fix(o);
          s.set(KEY, JSON.stringify(o));
          const empty = !d || ((!d.mine.length && !d.got.length));
          if (!booted || empty) { d = o; if (!page.hidden) renderAll(); }
        } catch (e) {}
      });
    } catch (e) {}
  })();

  // ---- 心意币（与心意集市/红包同一本账 gift-wallet，只加「我的」余额） ----
  function addCoin(fen) {
    if (!fen) return false;
    ensureDaily();
    if (d.day.coin >= DAILY_COIN_CAP) return false;
    const real = Math.min(fen, DAILY_COIN_CAP - d.day.coin);
    try {
      const s = S();
      let w = null;
      try { w = JSON.parse(s.get('gift-wallet') || ''); } catch (e) {}
      if (!w || typeof w.myBalance !== 'number') w = { myBalance: 99999999, systemBalance: 99999999 };
      w.myBalance += real;
      s.set('gift-wallet', JSON.stringify(w));
      d.day.coin += real;
      save();
      return true;
    } catch (e) { return false; }
  }
  const FIRST_PICK_COIN = 200, SPECIAL_COIN = 500, DAILY_COIN_CAP = 1000;

  // ---- 今日互动信号（读当前桌面聊天末尾若干条，带体积守卫防大记录卡顿） ----
  function chatActiveToday() {
    try {
      const cid = window.__activeCid || 'default';
      const raw = localStorage.getItem('xy-home-v2:' + cid + ':chat-msgs');
      if (!raw || raw.length > 400000) return false;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return false;
      const tk = todayKey();
      for (let i = arr.length - 1, seen = 0; i >= 0 && seen < 30; i--, seen++) {
        const m = arr[i];
        if (!m || !m.ts || m.side !== 'out') continue;
        const t = new Date(m.ts);
        if (tk === t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate()) return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- 出瓶概率 ----
  // 基础：普通60 / 空瓶·小物25 / 特殊10 / TA5；
  // 微调：今天互动多→TA 提到 9；距上次来访 ≥48h 且今日还没见过 TA 瓶→本次 TA 大幅加权（久违漂来）；
  // TA 瓶每日上限 3，到顶后权重并入普通瓶。
  let _forceKind = '';
  function rollKind() {
    if (_forceKind) { const k = _forceKind; _forceKind = ''; return k; }
    ensureDaily();
    let taW = 5;
    const absentH = d.lastVisit ? (Date.now() - d.lastVisit) / 3600000 : 999;
    if (absentH >= 48 && d.day.taGot < 1) taW = 26;
    else if (chatActiveToday()) taW = 9;
    if (d.day.taGot >= 3) taW = 0;
    const table = [['normal', Math.max(0, 60 + (5 - taW) - (taW >= 26 ? 16 : 0))], ['item', 25], ['special', 10], ['ta', taW]];
    let total = 0; table.forEach(x => total += x[1]);
    let r = Math.random() * total;
    for (let i = 0; i < table.length; i++) { r -= table[i][1]; if (r < 0) return table[i][0]; }
    return 'normal';
  }

  // ---- 漂回 / 回应 排期结算（开页与每次捡瓶前都会跑一遍） ----
  function settleSchedules() {
    ensureDaily();
    const now = Date.now();
    // ① 我放的瓶子漂回来：backAt 到点 70% 概率进入「下一瓶必是它」队列（否则再漂一段）
    d.mine.forEach(m => {
      if (!m.backed && m.backAt && now >= m.backAt) {
        if (Math.random() < 0.7) { m.backed = true; m.pendingBack = true; }
        else { m.backAt = now + ri(24, 72) * 3600000; }
      }
    });
    // ② 双人漂流瓶：TA 的回应到点生成（每条只生成一次），并给聊天发一条一次性轻提示
    d.mine.forEach(m => {
      if (m.willReply && !m.replied && m.replyAt && now >= m.replyAt) {
        m.replied = now;
        pushGot({ kind: 'reply', from: 'ta', text: poolLine('TA的回应', 'reply'), relateId: m.id });
        if (!m.noticed) {
          m.noticed = true;
          notifyChat('🌊 海上好像有什么漂回来了——去漂流瓶看看吧。');
        }
      }
    });
  }
  function takePendingBack() {
    for (let i = 0; i < d.mine.length; i++) {
      const m = d.mine[i];
      if (m.pendingBack) {
        m.pendingBack = false; m.backedAt = Date.now(); m.gone = true;
        return m;
      }
    }
    return null;
  }

  function notifyChat(text) {
    // 排期结算只在页面打开/回前台时跑（必然是当前桌面），走内存链路即可
    try { if (window.chatAddIn) window.chatAddIn(text, { tag: '漂流瓶' }); } catch (e) {}
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pushGot(rec) {
    rec.id = rec.id || uid();
    rec.ts = rec.ts || Date.now();
    if (typeof rec.fav !== 'number') rec.fav = 0;
    d.got.push(rec);
    if (d.got.length > GOT_CAP) d.got = d.got.slice(-GOT_CAP);
    save();
    return rec;
  }

  // ---- 捡一个 ----
  function pickBottle() {
    if (Date.now() < (d.cdUntil || 0)) { toast('海面还没恢复平静，稍等一下'); return; }
    settleSchedules();
    ensureDaily();
    // 漂回来的瓶子优先出现（熟悉的瓶子）
    const backMine = takePendingBack();
    let head, note, sig = '', gift = null, kind;
    let coinMsg = '';
    if (backMine) {
      kind = 'back';
      head = '🕰 你在海边捡到一个熟悉的瓶子';
      note = backMine.text;
      sig = '这是你以前写下的话';
    } else {
      kind = rollKind();
      if (kind === 'ta') {
        d.day.taGot++;
        head = '💙 ' + pn() + '漂来的瓶子';
        note = poolLine('TA的话', 'ta');
        sig = '—— ' + pn();
        if (Math.random() < 0.2) gift = rnd(ITEMS);
      } else if (kind === 'special') {
        head = '✨ 一个特别的瓶子';
        note = poolLine('海风', 'sea');
        sig = '瓶身缠着小小的星星绳';
      } else if (kind === 'item') {
        gift = rnd(ITEMS);
        head = '🫙 沉甸甸的小瓶子';
        note = rnd(ITEM_LINES).replace(/\{g\}/g, gift.e + ' ' + gift.n);
      } else if (kind === 'empty') {
        head = '🫙 一只空瓶子';
        note = rnd(EMPTY_LINES);
      } else {
        head = '🫙 你捡到了一个漂流瓶';
        note = poolLine('海风', 'sea');
      }
    }
    // 心意币：每日首次捡瓶 +2；特殊瓶 +5（计入每日上限，不做成刷币工具）
    const firstToday = d.day.picks === 0;
    let coin = 0;
    if (kind === 'special') coin = SPECIAL_COIN;
    else if (firstToday) coin = FIRST_PICK_COIN;
    if (coin && addCoin(coin)) coinMsg = coin === SPECIAL_COIN ? '🪙 +5 心意币' : '🪙 +2 心意币（今日首捡）';
    d.day.picks++;
    d.cdUntil = Date.now() + PICK_CD;
    const rec = pushGot({ kind: kind, from: kind === 'ta' || kind === 'reply' ? 'ta' : 'sea', text: note, gift: gift ? gift.e + ' ' + gift.n : '', coinFen: coin });
    save();
    renderPickAnim(head, note, sig, gift, coinMsg, rec);
    renderStats(); renderList();
    tickCd();
  }

  // ---- 放一个 ----
  function putBottle() {
    if (!window.openModal) return;
    window.openModal('写一句话，放进海里', '', function (val) {
      const text = String(val == null ? '' : val).trim().slice(0, 100);
      if (!text) { toast('空的瓶子漂不远，写点什么吧'); return; }
      ensureDaily();
      const rec = {
        id: uid(), text: text, ts: Date.now(), fav: 0,
        // 漂回来：36~96 小时后随机到点；TA 的回应：45% 概率排期 6~40 小时后
        backAt: Date.now() + ri(36, 96) * 3600000,
        willReply: Math.random() < 0.45,
        replyAt: 0
      };
      if (rec.willReply) rec.replyAt = Date.now() + ri(6, 40) * 3600000;
      d.mine.push(rec);
      if (d.mine.length > MINE_CAP) d.mine = d.mine.slice(-MINE_CAP);
      save();
      vib(18);
      toast('瓶子已经放进海里了 🌊');
      renderStats(); renderList();
    }, { textarea: true, textareaPlaceholder: '今天也很想你。（最多 100 字）', maxlength: 100 });
  }

  // ---- 渲染 ----
  const $ = (id) => document.getElementById(id);
  let openRecId = '';
  function renderPickAnim(head, note, sig, gift, coinMsg, rec) {
    const box = $('d-open');
    if (!box) return;
    openRecId = rec.id;
    const bob = $('drift-bob');
    if (bob) { bob.classList.remove('d-arrive'); void bob.offsetWidth; bob.classList.add('d-arrive'); }
    setTimeout(() => {
      if (!rec || rec.id !== openRecId) return;
      const fav = rec.fav ? ' ♡已收藏' : ' ♡ 收藏';
      box.innerHTML =
        '<div class="do-head">' + taFit(head) + '</div>' +
        '<div class="do-paper"><div class="do-txt"></div>' +
        (sig ? '<div class="do-sig"></div>' : '') + '</div>' +
        '<div class="do-extra">' +
        (gift ? '<span class="do-gift">' + gift.e + ' ' + taFit(gift.n) + '</span>' : '') +
        (coinMsg ? '<span class="do-coin">' + coinMsg + '</span>' : '') +
        '</div>' +
        '<div class="do-btns">' +
        (kindCanFav(rec.kind) ? '<button class="do-fav" id="d-fav">' + (rec.fav ? '♥ 已收藏' : '♡ 收藏') + '</button>' : '') +
        '<button class="do-ok" id="d-ok">收好</button>' +
        '</div>';
      box.querySelector('.do-txt').textContent = note;
      const sigEl = box.querySelector('.do-sig');
      if (sigEl) sigEl.textContent = sig;
      box.hidden = false;
      box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
      const favBtn = $('d-fav');
      if (favBtn) favBtn.addEventListener('click', () => {
        rec.fav = rec.fav ? 0 : 1;
        save();
        favBtn.textContent = rec.fav ? '♥ 已收藏' : '♡ 收藏';
        toast(rec.fav ? '已收进收藏' : '已取消收藏');
        renderStats(); renderList();
      });
      $('d-ok').addEventListener('click', () => { box.hidden = true; openRecId = ''; });
      vib(12);
    }, 850);
  }
  function kindCanFav(k) { return k !== 'empty'; }

  function renderStats() {
    const el = $('d-stats');
    if (!el) return;
    const taCnt = d.got.filter(g => g.from === 'ta').length;
    const favCnt = d.got.filter(g => g.fav).length + d.mine.filter(m => m.fav).length;
    el.textContent = '我放入 ' + d.mine.length + ' · ' + pn() + '漂来 ' + taCnt + ' · 收藏 ' + favCnt;
  }

  function renderList() {
    const el = $('d-list');
    if (!el) return;
    const tab = curTab;
    el.innerHTML = '';
    let rows = [];
    if (tab === 'mine') rows = d.mine.slice().reverse().map(m => ({
      ts: m.ts, ico: m.replied ? '💙' : (m.backed ? '🕰' : '🌊'),
      text: m.text,
      sub: m.replied ? pn() + '回应了这个瓶子' : (m.backed ? '这个瓶子漂回来过' : '漂流中'),
      key: 'm:' + m.id, rec: m, mine: true
    }));
    else if (tab === 'got') rows = d.got.slice().reverse().map(g => ({
      ts: g.ts, ico: KIND_ICO[g.kind] || '🫙', text: g.text,
      sub: (g.from === 'ta' ? '来自 ' + pn() : '海边') + (g.coinFen ? ' · 🪙+' + Math.round(g.coinFen / 100) : ''),
      key: 'g:' + g.id, rec: g, mine: false
    }));
    else rows = d.got.filter(g => g.fav).slice().reverse().map(g => ({
      ts: g.ts, ico: KIND_ICO[g.kind] || '🫙', text: g.text,
      sub: g.from === 'ta' ? '来自 ' + pn() : '海边',
      key: 'gf:' + g.id, rec: g, mine: false
    })).concat(d.mine.filter(m => m.fav).slice().reverse().map(m => ({
      ts: m.ts, ico: '🌊', text: m.text, sub: '我放入的', key: 'mf:' + m.id, rec: m, mine: true
    }))).sort((a, b) => b.ts - a.ts);
    if (!rows.length) {
      el.innerHTML = '<div class="dl-empty">' + (tab === 'mine' ? '还没有放过的瓶子。写一句话放进海里吧。' : tab === 'got' ? '还没有捡到的瓶子。去海边捡一个试试。' : '还没有收藏的瓶子。') + '</div>';
      return;
    }
    rows.slice(0, 60).forEach(r => {
      const row = document.createElement('div');
      row.className = 'dl-row glass';
      row.innerHTML =
        '<span class="dl-ico">' + r.ico + '</span>' +
        '<div class="dl-main"><div class="dl-txt"></div>' +
        '<div class="dl-sub">' + fmtTime(r.ts) + ' · ' + taFit(r.sub) + '</div></div>' +
        '<button class="dl-fav" title="收藏">' + (r.rec.fav ? '♥' : '♡') + '</button>';
      row.querySelector('.dl-txt').textContent = r.text;
      const fv = row.querySelector('.dl-fav');
      fv.addEventListener('click', (e) => {
        e.stopPropagation();
        r.rec.fav = r.rec.fav ? 0 : 1;
        save();
        fv.textContent = r.rec.fav ? '♥' : '♡';
        renderStats(); renderList();
      });
      el.appendChild(row);
    });
  }
  const KIND_ICO = { normal: '🫙', empty: '🫙', item: '🎁', special: '✨', ta: '💙', back: '🕰', reply: '💙' };

  function renderSea() {
    const night = isNight();
    page.classList.toggle('night', night);
    const cap = $('drift-sea-cap');
    if (cap) cap.textContent = night ? '夜里的海，把声音都藏起来了' : '两个世界之间的海';
  }
  function isNight() { const h = new Date().getHours(); return h >= 19 || h < 6; }

  function renderAll() { renderSea(); renderStats(); renderList(); tickCd(); }

  function ensureDaily() {
    const tk = todayKey();
    if (d.day.date !== tk) d.day = { date: tk, picks: 0, coin: 0, taGot: 0 };
  }

  // 冷却倒计时（捡按钮 20s 冷却，防连点失去“偶尔”的感觉）
  let cdTimer = null;
  function tickCd() {
    const btn = $('drift-pick');
    if (!btn) return;
    clearInterval(cdTimer);
    const step = () => {
      const left = (d.cdUntil || 0) - Date.now();
      if (left > 0) {
        btn.disabled = true;
        btn.textContent = '海面恢复中… ' + Math.ceil(left / 1000) + 's';
      } else {
        btn.disabled = false;
        btn.textContent = '捡一个';
        clearInterval(cdTimer);
      }
    };
    step();
    cdTimer = setInterval(step, 500);
  }

  // ---- 信息说明 ----
  function infoModal() {
    if (!window.openModal) return;
    window.openModal('漂流瓶 · 关于这片海', '', function () {}, {
      noInput: true,
      staticText: '你写下的话会漂到两个世界之间：过几天它可能自己漂回来，也可能收到一句回应。\n\n有时候，也会捡到「' + pn() + '」漂来的瓶子——那些话都来自字卡库，不会凭空编造。\n\n每日首次捡瓶送 2 心意币，特殊瓶 +5（每天最多 10）。瓶子是偶尔的惊喜，不用一直守着海。'
    });
  }

  // ---- 打开 / 关闭 ----
  function openDrift() {
    d = load();
    ensureDaily();
    settleSchedules();
    save();
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    page.hidden = false;
    renderAll();
    // 记录来访时间（供「很久没来→TA 瓶概率提升」判断，先算 absence 再更新）
    d.lastVisit = Date.now();
    save();
  }
  function closeDrift(toChat) {
    save();
    page.hidden = true;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const target = toChat ? document.getElementById('page-chat') : document.getElementById('page-phone');
    if (target) target.hidden = false;
  }

  // ---- 入口接线（更多功能按钮 / 返回键） ----
  function boot() {
    d = load();
    const back = $('drift-back');
    if (back) back.addEventListener('click', function (e) {
      e.stopPropagation();
      closeDrift(window.__driftFrom === 'chat');
      window.__driftFrom = '';
    });
    const moreBtn = $('more-drift');
    if (moreBtn) moreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const mp = $('chat-more-panel');
      if (mp) mp.hidden = true;
      window.__driftFrom = 'chat';
      openDrift();
    });
    const pick = $('drift-pick');
    if (pick) pick.addEventListener('click', function (e) { e.stopPropagation(); pickBottle(); });
    const put = $('d-put');
    if (put) put.addEventListener('click', function (e) { e.stopPropagation(); putBottle(); });
    const info = $('drift-info-btn');
    if (info) info.addEventListener('click', function (e) { e.stopPropagation(); infoModal(); });
    document.querySelectorAll('#page-drift .d-tab').forEach(tab => {
      tab.addEventListener('click', function () {
        document.querySelectorAll('#page-drift .d-tab').forEach(t => t.classList.remove('sel'));
        tab.classList.add('sel');
        curTab = tab.dataset.t || 'mine';
        renderList();
      });
    });
    document.addEventListener('contact-switched', function () {
      d = load();
      if (!page.hidden) { openRecId = ''; const ob = $('d-open'); if (ob) ob.hidden = true; renderAll(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !page.hidden) { settleSchedules(); save(); renderAll(); }
    });
    // 测试钩子（极小面）：强制下一瓶类型 + 只读状态快照
    window.__driftNext = function (k) { _forceKind = k; };
    window.__driftState = function () { return JSON.parse(JSON.stringify(d)); };
    booted = true;
  }
  let booted = false;
  let curTab = 'mine';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

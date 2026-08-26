// ===== 功能：主页（最近动态：换头像记录 + 通话记录） =====
// 桌面「主页」按钮进入；换头像/通话事件自动写入，完整展示
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  function fmtDT(ts) {
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  // ---- 换头像记录（含事件文案 + 头像缩略图；最多 30 条） ----
  // 记录所有换头像事件：联系人主动换我的头像（直接换 / 邀请同意 / 邀请拒绝）、
  // 我手动换自己的头像等——统一由 chatSystem 写入，text 为聊天系统消息原文
  function avatarsLoad() {
    try { return JSON.parse(store.get('records-avatar') || '[]'); } catch (e) { return []; }
  }
  function avatarsSave(list) { store.set('records-avatar', JSON.stringify(list.slice(0, 30))); }
  window.addAvatarRecord = function (img, text) {
    const list = avatarsLoad();
    list.unshift({ img: img, text: text || '', ts: Date.now() });
    avatarsSave(list);
    if (!document.getElementById('page-home').hidden) render();
  };
  // ---- 通话记录 ----
  function callsLoad() {
    try { return JSON.parse(store.get('records-call') || '[]'); } catch (e) { return []; }
  }
  function callsSave(list) { store.set('records-call', JSON.stringify(list.slice(0, 50))); }
  window.addCallRecord = function (type, text) {
    const list = callsLoad();
    list.unshift({ type: type, text: text, ts: Date.now() });
    callsSave(list);
    if (!document.getElementById('page-home').hidden) render();
  };
  // ---- 摸鱼抓包记录（v3.15.x：双向） ----
  // type='me'：我抓到联系人摸鱼（p2-features.js 桌面浮字点击抓包成功时写入）
  // type='ta'：被联系人抓到我摸鱼（personalize.js 摸鱼+1 点太频被反向抓包时写入）
  function catchesLoad() {
    try { return JSON.parse(store.get('records-fishcatch') || '[]'); } catch (e) { return []; }
  }
  function catchesSave(list) { store.set('records-fishcatch', JSON.stringify(list)); } // v3.15.x：用户要求保留全部历史，不设上限（事件本身低频，量级可控）
  window.addFishCatchRecord = function (type, text) {
    const list = catchesLoad();
    list.unshift({ type: type, text: text || '', ts: Date.now() });
    catchesSave(list);
    if (!document.getElementById('page-home').hidden) render();
  };
  // 摸鱼抓包记录渲染（最新在前，全部保留；文案按当前联系人昵称动态适配）
  function renderCatch() {
    const el = document.getElementById('home-catch');
    if (!el) return;
    const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const list = catchesLoad();
    el.innerHTML = list.length
      ? list.map(x =>
          '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' +
          (x.type === 'ta'
            ? '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>' + name + ' 抓到我摸鱼'
            : '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' + '抓到 ' + name + ' 摸鱼') +
          '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
          (x.text ? '<div class="tc-li-line">' + (window.taFit ? window.taFit(esc(x.text)) : esc(x.text)) + '</div>' : '') +
          '</div>'
        ).join('')
      : '<div class="ta-empty">暂无摸鱼抓包记录（桌面浮字可点击抓包 TA；点太快会被 TA 反向抓包）</div>';
  }
  // ---- 心意币流水（v3.16.x：赚钱 / 申请记录，分列我和当前联系人） ----
  // 数据由 gift-shop.js 的 giftCoinLedgerLoad 提供（按联系人桌面前缀隔离）；记录结构 { ts, myFen, taFen, src }
  function renderCoinPanel(kind) {
    const el = document.getElementById(kind === 'ask' ? 'home-coinask' : 'home-coinearn');
    if (!el) return;
    const list = (window.giftCoinLedgerLoad ? window.giftCoinLedgerLoad(kind) : []) || [];
    const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    const myName = store.get('lbl-user') || '我';
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (!list.length) {
      el.innerHTML = '<div class="ta-empty">' + (kind === 'ask' ? '暂无申请记录（可点心意币余额行向 Mochi 申请）' : '暂无赚钱记录（玩游戏、种花、钓鱼都能赚心意币）') + '</div>';
      return;
    }
    const yuan = (fen) => (fen / 100).toFixed(2);
    el.innerHTML = list.map(x => {
      let line;
      if (x.myFen && x.taFen && x.myFen === x.taFen) line = '双方各 +¥' + yuan(x.myFen);
      else {
        const parts = [];
        if (x.myFen) parts.push(myName + ' +¥' + yuan(x.myFen));
        if (x.taFen) parts.push(name + ' +¥' + yuan(x.taFen));
        line = parts.join(' · ') || '—';
      }
      const src = x.src ? esc(x.src) : (kind === 'ask' ? '向 Mochi 申请' : '赚钱');
      return '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">🪙 ' + src + '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
        '<div class="tc-li-line">' + line + '</div></div>';
    }).join('');
  }
  // 供 gift-shop.js 记账后即时重绘当前可见的流水面板
  window.__renderHomeCoin = function () {
    if (htab === 'coinearn') renderCoinPanel('earn');
    else if (htab === 'coinask') renderCoinPanel('ask');
  };
  // ---- 渲染主页记录 ----
  function histList(key) { try { return JSON.parse(store.get(key) || '[]'); } catch (e) { return []; } }
  // v3.9.x：联系人今日情话 / 我的备忘 / 我的心情记录已迁移到日历页按天查看，主页不再保留
  let htab = 'av';
  // 每日摸鱼值记录
  window.renderFishHistory = function () {
    const el = document.getElementById('home-fish');
    if (!el) return;
    const h = (window.getFishHistory && window.getFishHistory()) || [];
    const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    const myName = store.get('lbl-user') || '我';
    // 顶部历史累计（我的 + 联系人）
    const tot = (window.getFishTotals && window.getFishTotals()) || { mine: 0, ta: 0 };
    const totalHtml =
      '<div class="fish-total">' +
        '<span class="ft-item"><b>' + myName + '</b> 累计 ' + (tot.mine || 0) + '</span>' +
        '<span class="ft-item"><b>' + name + '</b> 累计 ' + (tot.ta || 0) + '</span>' +
      '</div>';
    // v3.13.x：摸鱼连击纪录（桌面周末组件「摸鱼+1」短时连击的最高存档）
    const cb = (window.getFishComboBest && window.getFishComboBest()) || { today: 0, best: 0 };
    const comboHtml = (cb && (cb.today > 0 || cb.best > 0))
      ? '<div class="fish-combo-line">今日最高连击 ×' + (cb.today || 0) + ' · 历史最高 ×' + (cb.best || 0) + '</div>'
      : '';
    el.innerHTML = totalHtml + comboHtml + (h.length
      ? h.map(x => '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + x.date + '</span></div>' +
          '<div class="tc-li-line">' + myName + ' 当天摸鱼：+' + (x.mine || 0) + '</div>' +
          '<div class="tc-li-line">' + name + ' 当天摸鱼：+' + (x.ta || 0) + '</div></div>').join('')
      : '<div class="ta-empty">暂无摸鱼值记录</div>');
  };
  // 每日打工值记录（v3.5.65：与每日摸鱼值同款——顶部累计 + 每日新增）
  window.renderWorkHistory = function () {
    const el = document.getElementById('home-work');
    if (!el) return;
    const h = (window.getWorkHistory && window.getWorkHistory()) || [];
    const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    const myName = store.get('lbl-user') || '我';
    const tot = (window.getWorkTotals && window.getWorkTotals()) || { mine: 0, ta: 0 };
    const totalHtml =
      '<div class="fish-total">' +
        '<span class="ft-item"><b>' + myName + '</b> 累计 ' + (tot.mine || 0) + '</span>' +
        '<span class="ft-item"><b>' + name + '</b> 累计 ' + (tot.ta || 0) + '</span>' +
      '</div>';
    el.innerHTML = totalHtml + (h.length
      ? h.map(x => '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + x.date + '</span></div>' +
          '<div class="tc-li-line">' + myName + ' 当天打工：+' + (x.mine || 0) + '</div>' +
          '<div class="tc-li-line">' + name + ' 当天打工：+' + (x.ta || 0) + '</div></div>').join('')
      : '<div class="ta-empty">暂无打工值记录</div>');
  };
  function render() {
    // 只渲染当前 tab 面板（避免隐藏面板无谓渲染）
    const showOnly = htab;
    // 每日打工值记录
    if (showOnly === 'work') {
      window.renderWorkHistory();
    }
    // 每日摸鱼值记录
    if (showOnly === 'fish') {
      window.renderFishHistory();
    }
    // 摸鱼抓包记录（双向：我抓到 TA / 被 TA 抓到）
    if (showOnly === 'catch') {
      renderCatch();
    }
    // 心意币赚钱记录 / 申请记录（v3.16.x）
    if (showOnly === 'coinearn') {
      renderCoinPanel('earn');
    }
    if (showOnly === 'coinask') {
      renderCoinPanel('ask');
    }
    // 换头像记录（全部事件：直接换 / 邀请同意 / 邀请拒绝 / 我手动更换）
    if (showOnly === 'av') {
      const avEl = document.getElementById('home-av');
      if (avEl) {
        const list = avatarsLoad();
        const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        avEl.innerHTML = list.length
          ? list.map(x =>
              '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' + (window.taFit ? window.taFit(esc(x.text || (name + ' 更换了头像'))) : esc(x.text || (name + ' 更换了头像'))) + '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
              (x.img ? '<img class="rec-av-img" src="' + x.img + '" alt="头像">' : '') +
              '</div>'
            ).join('')
          : '<div class="ta-empty">暂无换头像记录</div>';
      }
    }
    // 通话记录
    if (showOnly === 'call') {
      const callEl = document.getElementById('home-call');
      if (callEl) {
        const list = callsLoad();
        const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
        callEl.innerHTML = list.length
          ? list.map(x =>
              '<div class="tc-listitem"><div class="tc-li-top"><span class="tc-li-q">' +
              (x.type === 'in' ? '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' + name + ' 来电' : '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/><path d="M16 3v6M19 6h-6"/></svg>' + name + ' 拨打') +
              '</span><span class="tc-li-time">' + fmtDT(x.ts) + '</span></div>' +
              (x.text ? '<div class="tc-li-line">' + (window.taFit ? window.taFit(x.text) : x.text) + '</div>' : '') +
              '</div>'
            ).join('')
          : '<div class="ta-empty">暂无通话记录</div>';
      }
    }
  }
  // 主页顶部 tab 切换
  document.querySelectorAll('#page-home .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      htab = tab.dataset.htab;
      document.querySelectorAll('#page-home .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      document.querySelectorAll('#page-home .cal-card').forEach(c => { c.hidden = c.dataset.hpanel !== htab; });
      render();
    });
  });
  // v3.5.113：IndexedDB 回填完成后重绘主页当前面板（导入/配额异常恢复后的数据）
  try {
    document.addEventListener('mochi-restore-done', function () {
      try {
        if (!document.getElementById('page-home').hidden) render();
      } catch (e) {}
    });
  } catch (e) {}
  // 入口：桌面「主页」按钮
  const homeApp = document.querySelector('.app[data-app="home"]');
  const homePage = document.getElementById('page-home');
  if (homeApp && homePage) {
    homeApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      render();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      homePage.hidden = false;
    });
  }
  const homeBack = document.getElementById('home-back');
  if (homeBack) {
    homeBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phone = document.getElementById('page-phone');
      if (phone) phone.hidden = false;
    });
  }
  render();

  // v3.5.94：换头像记录含图片，可能只存在 IndexedDB → 启动补读（主页打开时才渲染，届时读到）
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':records-avatar').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2) store.set('records-avatar', v);
      });
    }
  } catch (e) {}

  // 联系人主动来电已由 call.js 统一管理（弹窗/接听/小框/概率），此处仅保留记录存储

  // v3.6.x：多桌面——切换联系人后若记录页可见则重渲染（读新桌面数据）
  document.addEventListener('contact-switched', function () {
    try {
      const hp = document.getElementById('page-home');
      if (hp && !hp.hidden) render();
    } catch (e) {}
  });
})();

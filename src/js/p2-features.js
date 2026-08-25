// ===== 功能：聊天统计页 / 小互动页 / 今日备忘·心情 =====
// 音乐：音乐库、播放列表、播放历史
// 聊天统计：相处天数、消息数、表情包/拍一拍/情绪统计
// 小互动：拍一拍 TA / 送一句情话
// v3.5.27：今日备忘/今天的心情历史双写 IndexedDB——导入备份覆盖 localStorage 后记录可从 IDB 回填
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  // 备忘/心情历史：localStorage + IndexedDB 双写；启动时从 IDB 回填缺失键（导入/清空后不丢记录）
  function pushHist(key, text) {
    try {
      const list = JSON.parse(store.get(key) || '[]');
      list.unshift({ text: text, ts: Date.now() });
      if (list.length > 200) list.length = 200;
      store.set(key, JSON.stringify(list));
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + key, JSON.stringify(list)); } catch (e) {}
    } catch (e) {}
  }
  function restoreHist(key) {
    try {
      if (window.idbGet && !store.get(key)) {
        const myPrefix = window.activePrefix();
        window.idbGet(myPrefix + ':' + key).then(v => {
          if (window.activePrefix() !== myPrefix) return;
          if (!v) return;
          try { store.set(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
        });
      }
    } catch (e) {}
  }
  restoreHist('memo-history');
  restoreHist('mood-history');
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  // v3.7.x：本周日常点击其他日期查看当日内容用——按日期生成键
  function dayStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // 轻提示（全局唯一，与其它模块一致）
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cc-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // ================= 聊天统计页 =================
  const statsApp = document.querySelector('.app[data-app="stats"]');
  const statsPage = document.getElementById('page-stats');
  if (statsApp && statsPage) {
    statsApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      statsPage.hidden = false;
      renderStats();
    });
  }
  const statsBack = document.getElementById('stats-back');
  if (statsBack) {
    statsBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }
  // ================= 聊天统计（完整版：相处记录 / 聊天记录 / 情绪表达） =================
  function statsInfoCard(icon, label, value) {
    return '<div class="stats-row"><span class="stats-label">' + icon + ' ' + label + '</span><span class="stats-num" style="font-size:15px">' + value + '</span></div>';
  }
  function fmtDTFull(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function calcStreak(dateSet) {
    const dates = Array.from(dateSet).sort();
    if (!dates.length) return 0;
    let max = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 864e5;
      if (diff === 1) { cur++; max = Math.max(max, cur); } else cur = 1;
    }
    return max;
  }
  function statsBarSection(icon, title, countMap, topLabel, emptyText) {
    const entries = [];
    for (const k in countMap) if (countMap.hasOwnProperty(k)) entries.push({ name: k, count: countMap[k] });
    entries.sort((a, b) => b.count - a.count);
    let html = '<div class="stats-sec">' +
      '<div class="stats-sec-head"><span class="stats-sec-title">' + icon + title + '</span>' +
      '<span class="stats-sec-count">' + entries.length + ' 种</span></div>';
    if (!entries.length) {
      html += '<div class="ta-empty">' + emptyText + '</div>';
    } else {
      const top = entries[0].name;
      const topCount = entries[0].count;
      html += '<div class="stats-top">' +
        '<div class="stats-top-tag">' + topLabel + '</div>' +
        '<div class="stats-top-name">「' + String(top).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '」</div>' +
        '<div class="stats-top-num">' + topCount + ' 次</div></div>';
      html += '<div class="stats-list">';
      entries.slice(0, 5).forEach(e => {
        html += '<div class="stats-item">' +
          '<span class="stats-item-name">' + String(e.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '</span>' +
          '<span class="stats-item-num">' + e.count + '</span></div>';
      });
      html += '</div>';
    }
    return html + '</div>';
  }
  function renderStats() {
    let msgs = [];
    try { msgs = (window.getChatMsgs ? window.getChatMsgs() : JSON.parse(store.get('chat-msgs') || '[]')); } catch (e) {}
    const real = msgs.filter(m => m && m.side && m.text);
    const firstTs = real.length ? (real[0].ts || Date.now()) : 0;
    const lastTs = real.length ? (real[real.length - 1].ts || firstTs) : 0;
    // v3.5.81：相处天数 = 恋爱纪念日（love-start）起算；未设置则用第一条聊天记录时间；
    //   聊天记录被清空/新装时不再显示 0（用纪念日兜底）
    let daysStart = firstTs;
    try {
      const loveStart = store.get('love-start');
      if (loveStart) {
        const ls = new Date(loveStart + 'T00:00:00').getTime();
        if (!isNaN(ls)) daysStart = ls;
      }
    } catch (e) {}
    const days = daysStart ? Math.max(0, Math.floor((Date.now() - daysStart) / 864e5)) : 0;
    // ---- 相处记录 ----
    const recordEl = document.getElementById('st-record-cards');
    if (recordEl) {
      let mine = 0, ta = 0, textChars = 0;
      real.forEach(m => {
        if (m.side === 'out') mine++; else ta++;
        if (typeof m.text === 'string' && m.text.indexOf('data:') !== 0) textChars += m.text.length;
      });
      let favsCount = 0;
      try { favsCount = (JSON.parse(store.get('fav-msgs') || '[]') || []).length; } catch (e) {}
      recordEl.innerHTML =
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>', '第一次聊天', fmtDTFull(firstTs) || '暂无记录') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>', '最近聊天', fmtDTFull(lastTs) || '暂无记录') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>', '聊天消息', (mine + ta) + ' 条') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13l2 2 4-4"/></svg>', '文字数量', textChars + ' 字') +
        statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 5 5.6.8-4 4 .9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-4 5.6-.8z"/></svg>', '收藏记录', favsCount + ' 条');
    }
    // ---- 聊天记录 ----
    const chatEl = document.getElementById('st-chat-content');
    if (chatEl) {
      if (!real.length) { chatEl.innerHTML = '<div class="ta-empty">暂无聊天记录</div>'; }
      else {
        let userCount = 0, taCount = 0;
        const hourCount = {}, dayCount = {}, dateCount = {};
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        real.forEach(m => {
          if (m.side === 'out') userCount++; else taCount++;
          const t = new Date(m.ts || Date.now());
          hourCount[t.getHours()] = (hourCount[t.getHours()] || 0) + 1;
          dayCount[t.getDay()] = (dayCount[t.getDay()] || 0) + 1;
          const ds = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
          dateCount[ds] = (dateCount[ds] || 0) + 1;
        });
        const total = userCount + taCount;
        const userPct = total ? Math.round(userCount / total * 100) : 0;
        const taPct = total ? Math.round(taCount / total * 100) : 0;
        let peakHour = 0, peakHourVal = 0;
        for (const h in hourCount) if (hourCount[h] > peakHourVal) { peakHourVal = hourCount[h]; peakHour = Number(h); }
        let peakDay = 0, peakDayVal = 0;
        for (const d in dayCount) if (dayCount[d] > peakDayVal) { peakDayVal = dayCount[d]; peakDay = Number(d); }
        const totalDays = Math.max(1, Math.floor((Date.now() - firstTs) / 864e5));
        let maxSingle = 0;
        for (const d in dateCount) maxSingle = Math.max(maxSingle, dateCount[d]);
        const name = store.get('lbl-partner') || 'TA';
        chatEl.innerHTML =
          '<div style="margin-bottom:16px"><div style="font-size:13px;font-weight:700;color:#555;margin-bottom:8px">消息比例</div>' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="font-size:12px;color:var(--muted);width:28px">我</div>' +
          '<div style="flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden"><div style="height:100%;background:var(--ink);width:' + userPct + '%;border-radius:4px"></div></div>' +
          '<div style="font-size:12px;color:var(--ink);width:76px;text-align:right">' + userCount + ' 条 ' + userPct + '%</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px"><div style="font-size:12px;color:var(--muted);width:28px">' + name + '</div>' +
          '<div style="flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden"><div style="height:100%;background:#999;width:' + taPct + '%;border-radius:4px"></div></div>' +
          '<div style="font-size:12px;color:var(--ink);width:76px;text-align:right">' + taCount + ' 条 ' + taPct + '%</div></div></div>' +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>', '最常聊天时间', peakHour + ':00 - ' + ((peakHour + 1) % 24) + ':00') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>', '最常聊天日期', '星期' + dayNames[peakDay]) +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/></svg>', '平均每日消息', Math.round(total / totalDays) + ' 条') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 3-3 4-3 7a3 3 0 006 0c0-1-.3-2-.8-3 1.8 1 3 3 3 5a6 6 0 11-12 0c0-4 3-6 4.5-8.5z"/></svg>', '最长连续聊天', calcStreak(Object.keys(dateCount)) + ' 天') +
          statsInfoCard('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>', '单日最高消息', maxSingle + ' 条');
      }
    }
    // ---- 情绪表达 ----
    const exprEl = document.getElementById('st-expr-content');
    if (exprEl) {
      if (!real.length) { exprEl.innerHTML = '<div class="ta-empty">暂无聊天记录</div>'; }
      else {
        const textCount = {}, emotion = {}, heart = {}, intent = {};
        // v3.12.x：文字字卡排名剔除表情和颜文字——emoji/颜文字字卡发出时 type 就是 'text'
        //   （chat.js 的分类只在发送端选卡用），只能按内容过滤：去掉符号后不含任何
        //   可读文字（汉字/假名/字母/数字）的消息视为纯表情/颜文字，不入榜；
        //   「常用文字」前五名才能反映联系人平时说得最多的话。
        //   同时排除媒体消息（表情包/图片/语音）与链接，避免占位/乱码进榜。
        const EXPR_CORE_RE = /[^0-9A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/g;
        real.forEach(m => {
          if (typeof m.text === 'string' && m.text.indexOf('data:') !== 0 && !m.special && !m.retracted) {
            const t = m.text;
            const isMediaMsg = m.type === 'sticker' || m.type === 'image' || m.type === 'voice';
            const core = t.replace(EXPR_CORE_RE, '');
            // 颜文字兜底：带括号特征且可读部分只剩假名（ヾノ等装饰符）的也算颜文字
            const kaomojiShape = /[\(（｡◕(◕)(づ｡(¬]/.test(t) && /[\)）】)]/.test(t) &&
              /^[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9D]*$/.test(core);
            if (!isMediaMsg && t.indexOf('http') !== 0 && t.indexOf('|||') < 0 && core && !kaomojiShape) {
              textCount[t] = (textCount[t] || 0) + 1;
            }
          }
          (m.mood || []).forEach(md => {
            // v3.6.x：脏数据防御——mood 条目非对象（导入/损坏数据）时跳过，避免统计页中断
            if (!md || typeof md !== 'object') return;
            if (md.tag === '交流意图') intent[md.label] = (intent[md.label] || 0) + 1;
            else if (md.tag === '心意') heart[md.label] = (heart[md.label] || 0) + 1;
            else emotion[md.label] = (emotion[md.label] || 0) + 1;
          });
        });
        exprEl.innerHTML =
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>', '文字字卡', textCount, '常用文字', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5l.01.01M15 9.5l.01.01"/></svg>', '情绪字卡', emotion, '常见情绪', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M19 3.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></svg>', '心意字卡', heart, '常传递心意', '暂无使用记录') +
          statsBarSection('<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 01-12.6 7.4L4 21l1.5-4.4A8.5 8.5 0 1121 12z"/><path d="M8.5 10h7M8.5 13h4.5"/></svg>', '交流意图', intent, '常用交流', '暂无使用记录');
      }
    }
    const daysEl = document.getElementById('st-days');
    if (daysEl) daysEl.textContent = days;
  }
  // 统计 tab 切换
  document.querySelectorAll('#page-stats .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#page-stats .fav-tab').forEach(x => x.classList.toggle('sel', x === tab));
      const k = tab.dataset.stab;
      document.querySelectorAll('#page-stats .cal-card').forEach(c => {
        c.hidden = c.dataset.stpanel !== k;
      });
    });
  });

  // ================= 提问记录页（原小互动页） =================
  const interactApp = document.querySelector('.app[data-app="interact"]');
  const interactPage = document.getElementById('page-interact');
  if (interactApp && interactPage) {
    interactApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      if (window.renderAskRecords) window.renderAskRecords();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      interactPage.hidden = false;
    });
  }
  const interactBack = document.getElementById('interact-back');
  if (interactBack) {
    interactBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }

// ================= 查岗（TA 的日常）=================
const DEF_PLACES = ['在家', '在公司', '在咖啡店', '在公园', '在图书馆', '在路上', '在朋友家', '在健身房', '在超市', '在电影院'];
const DEF_ACTIONS = ['刷手机', '看书', '发呆', '听歌', '写东西', '吃零食', '喝奶茶', '散步', '玩游戏', '想你'];
const DEF_CHECK_MSGS = ['想你了', '记得按时吃饭', '今天也很喜欢你', '早点休息', '有空给我回消息', '别太累'];
// 查岗日常字卡（可自定义，localStorage 持久化；空则用默认）
// v3.6.x：是否使用系统预设字卡（默认开启；关闭后查岗只从用户添加的字卡里抽）
const CK_DEF_KEY = 'checkin-cards-default';
function getCkDefault() {
  const v = store.get(CK_DEF_KEY);
  return v === null ? true : v === '1';
}
function ckList(k, def) {
  try {
    const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch (e) {}
  return def.slice();
}
  function ckSaveList(k, list) { store.set('checkin-cards-' + k, JSON.stringify(list)); }
  // v3.6.x：纯自定义库读取（不 fallback 到默认）——批量添加/我的添加列表用这个，
  //   避免原 ckList() 在无自定义时返回默认库导致系统预设被"转正"存进自定义库
  function ckCustomList(k) {
    try {
      const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return [];
  }
  // v3.7.x：查岗字卡统一返回对象数组 [{t, grp}]（旧字符串数据自动转对象）——管理页/批量添加用
  function ckItems(k) {
    try {
      const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
      if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? { t: x } : (x && typeof x === 'object' && x.t != null ? x : null)).filter(Boolean);
    } catch (e) {}
    return [];
  }
  // v3.7.x：查岗字卡保存（统一对象数组）
  function ckSaveItems(k, items) { store.set('checkin-cards-' + k, JSON.stringify(items)); }
  // v3.7.x：查岗自定义分组（按 地点/在做什么/说的话 分类各自独立）——只用于管理页整理，抽取不分组
  function ckGroups(k) {
    try {
      const v = JSON.parse(store.get('checkin-cards-groups-' + k) || 'null');
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return [];
  }
  function ckSaveGroups(k, groups) { store.set('checkin-cards-groups-' + k, JSON.stringify(groups)); }
// v3.6.x：查岗系统预设字卡单卡开关——逐张开启/关闭（关闭后查岗不再抽取该条）
function isCkCardOff(k, x) { return store.get('ck-off-' + k + ':' + x) === '1'; }
function setCkCardOff(k, x, off) { store.set('ck-off-' + k + ':' + x, off ? '1' : '0'); }
function genCheckin() {
  const useDefault = getCkDefault();
  // v3.7.x：字卡可为 {t, grp} 对象——统一用 ckItems 取 .t
  let places = ckItems('place');
  let actions = ckItems('action');
  let msgs = ckItems('msg');
  // v3.7.x 修复：ckItems 只读自定义字卡（管理页要显示真实自定义，不 fallback），
  // 但 genCheckin 抽取时必须有字卡——自定义空时补系统预设（转 {t} 对象格式），
  // 否则 out.place/action/msg 全 undefined → 查岗页空白/记录不显示/聊天不发消息
  if (!places.length) places = DEF_PLACES.map(t => ({ t }));
  if (!actions.length) actions = DEF_ACTIONS.map(t => ({ t }));
  if (!msgs.length) msgs = DEF_CHECK_MSGS.map(t => ({ t }));
  const out = {};
  // 关闭「使用系统预设」时：只从用户添加的字卡里抽；某分类没有用户自定义则跳过该字段
  // v3.6.x：单卡开关过滤——用户关闭的字卡（ck-off-*）不参与抽取
  let place = useDefault ? places.filter(p => !isCkCardOff('place', p.t)) : places.filter(p => DEF_PLACES.indexOf(p.t) < 0 && !isCkCardOff('place', p.t));
  let action = useDefault ? actions.filter(a => !isCkCardOff('action', a.t)) : actions.filter(a => DEF_ACTIONS.indexOf(a.t) < 0 && !isCkCardOff('action', a.t));
  let msg = useDefault ? msgs.filter(m => !isCkCardOff('msg', m.t)) : msgs.filter(m => DEF_CHECK_MSGS.indexOf(m.t) < 0 && !isCkCardOff('msg', m.t));
  // 兜底：关闭预设且完全没有用户自定义时回退使用系统预设（避免查岗空白/undefined）
  if (!place.length && !action.length && !msg.length) {
    place = places; action = actions; msg = msgs;
  }
  if (place.length) out.place = place[Math.floor(Math.random() * place.length)].t;
  if (action.length) out.action = action[Math.floor(Math.random() * action.length)].t;
  if (msg.length) out.msg = msg[Math.floor(Math.random() * msg.length)].t;
  return out;
}
function renderCheckinHistory() {
  const histEl = document.getElementById('ck-history');
    if (!histEl) return;
    try {
      let h = [];
      try { h = JSON.parse(store.get('checkin-history') || '[]'); } catch (e) { h = []; }
      // 过滤无有效内容的记录（不渲染 "-- · -- · --" 占位），只显示实际存在的字段
      const valid = (Array.isArray(h) ? h : []).filter(x => x && (x.place || x.action));
      histEl.innerHTML = valid.length
        ? valid.slice().reverse().map(x => {
            const parts = [x.t, x.place, x.action].filter(Boolean);
            return '<div class="ck-location"><div class="ck-value" style="font-size:13px">' + parts.join(' · ') + '</div><div class="ck-label">' + (x.msg || '') + '</div></div>';
          }).join('')
        : '<div class="div-result-empty">暂无查岗记录</div>';
    } catch (e) {}
  }
  // 初始化：从 IndexedDB 恢复全部查岗记录
  (function () {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':checkin-history').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (!v) return;
        try {
          const data = typeof v === 'string' ? JSON.parse(v) : v;
          if (Array.isArray(data) && data.length && !store.get('checkin-history')) {
            store.set('checkin-history', JSON.stringify(data));
          }
        } catch (e) {}
      });
    }
  })();
  const checkinApp = document.querySelector('.app[data-app="checkin"]');
  const checkinPage = document.getElementById('page-checkin');
  // ---- 星言顶部栏字卡/随机换头像同款刷新机制 ----
  // 上次/下次更新时间戳持久化：首次启动立即生成一条，之后每 1-8 小时更新一次；
  // 每 60 秒轮询检查，刷新页面周期不重置
  function ckLast() { const v = parseInt(store.get('checkin-last'), 10); return isNaN(v) ? 0 : v; }
  function ckNext() { const v = parseFloat(store.get('checkin-next')); return isNaN(v) ? 0 : v; }
  function renderCheckinUI(ck) {
    const place = document.getElementById('ck-place');
    const action = document.getElementById('ck-action');
    const msg = document.getElementById('ck-msg');
    const status = document.getElementById('ck-status');
    const name = store.get('lbl-partner') || 'TA';
    // v3.6.x：关闭系统预设且某分类无自定义字卡时该字段为空——显示空串而非字面量 "undefined"
    if (place) place.textContent = ck.place || '';
    if (action) action.textContent = ck.action || '';
    if (msg) msg.textContent = ck.msg || '';
    if (status) status.textContent = name + ' 的日常';
  }
  function recordCheckin(ck) {
    // v3.6.x：undefined 字段不写入记录（JSON.stringify 自动丢弃 undefined 键）
    const entry = { t: fmtTime(Date.now()), place: ck.place, action: ck.action, msg: ck.msg, ts: Date.now() };
    try {
      const h = JSON.parse(store.get('checkin-history') || '[]');
      h.push(entry);
      store.set('checkin-history', JSON.stringify(h));
      if (window.idbSet) window.idbSet(window.activePrefix() + ':checkin-history', JSON.stringify(h));
    } catch (e) {}
    renderCheckinHistory();
  }
  // 生成新日常：渲染 + 推聊天消息（更新提示 + 概率提醒）+ 记录 + 重置计时
  function doCheckin() {
    const ck = genCheckin();
    store.set('checkin-current', JSON.stringify(ck));
    renderCheckinUI(ck);
    const name = store.get('lbl-partner') || 'TA';
    // 更新提示系统消息：先发「联系人 更新了一条日常」（v3.7.x 调整顺序——
    // 原先是字卡文字消息先发、系统提示后发，与用户预期相反）
    if (window.chatAddSystem) {
      window.chatAddSystem(name + ' 更新了一条日常');
    }
    // 再发日常更新内容消息（普通气泡消息，持久化）
    // v3.6.x：只拼接存在的字段，避免 "在咖啡店 · undefined" 写进聊天记录
    if (window.chatAddIn) {
      const line = [ck.place, ck.action, ck.msg].filter(Boolean).join(' · ');
      if (line) window.chatAddIn(line);
    }
    // 概率触发「提醒你来查岗」
    if (Math.random() * 100 < 30) {
      window.chatAddIn(name + ' 提醒你快来查岗');
    }
    recordCheckin(ck);
    store.set('checkin-last', String(Date.now()));
    store.set('checkin-next', String(1 + Math.random() * 7));
    // 同步聊天里打开的查岗半框
    const p = document.getElementById('ck-p-place');
    const a = document.getElementById('ck-p-action');
    const m = document.getElementById('ck-p-msg');
    if (p) p.textContent = ck.place || '';
    if (a) a.textContent = ck.action || '';
    if (m) m.textContent = ck.msg || '';
  }
  // 供聊天页「点联系人头像打开查岗半框」使用
  window.openCkPanel = function () {
    // 关闭其他底部半框（拍一拍/表情包/头像互动）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    const panel = document.getElementById('ck-panel');
    const nameEl = document.getElementById('ck-panel-name');
    const name = store.get('lbl-partner') || 'TA';
    if (nameEl) nameEl.textContent = name;
    // 显示当前日常；从未生成过则立即生成一条
    let cur = null;
    try { cur = JSON.parse(store.get('checkin-current') || 'null'); } catch (e) {}
    if (cur && cur.place) {
      const p = document.getElementById('ck-p-place');
      const a = document.getElementById('ck-p-action');
      const m = document.getElementById('ck-p-msg');
      if (p) p.textContent = cur.place || '';
      if (a) a.textContent = cur.action || '';
      if (m) m.textContent = cur.msg || '';
    } else {
      doCheckin();
    }
    // 更新时间：日常更新时记录的时间戳
    const upd = document.getElementById('ck-p-updated');
    if (upd) {
      const last = parseInt(store.get('checkin-last'), 10);
      upd.textContent = last ? '更新于 ' + fmtTime(last) : '';
    }
    if (panel) panel.hidden = false;
  };
  const ckPanelClose = document.getElementById('ck-panel-close');
  if (ckPanelClose) ckPanelClose.addEventListener('click', () => { document.getElementById('ck-panel').hidden = true; });
  // 自动轮询：启动立即 + 每 60 秒检查（首次 last=0 立即生成）
  // v3.5.118：首次检查延迟到 IndexedDB 回填完成后（mochi-restore-done）——
  // 否则启动瞬间 doCheckin→chatAddIn 会在聊天记录权威数据（导入后只在 IDB）
  // 读回前写入新消息，触发 saveMsgs 用 1 条覆盖 IDB 里的全部历史（导入后聊天记录丢失）
  let ckBootDone = false;
  // v3.5.128：回前台冷静期——后台切回时多个模块（发动态/来电/来信/询问/查岗）
  // 会同时判定，错峰 90 秒避免连环弹窗+连发消息
  let ckWakeAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ckWakeAt = Date.now() + 90000;
  });
  function checkAutoCheckin() {
    if (document.hidden) return; // v3.5.127：后台不自动查岗
    if (Date.now() < ckWakeAt) return; // 回前台冷静期
    if (!ckBootDone) return; // 首次：等数据就绪标志
    try {
      const now = Date.now();
      let last = ckLast(), next = ckNext();
      if (last > now || last < 0 || isNaN(last)) { last = 0; next = 0; }
      if ((now - last) / 36e5 < next) return;
      doCheckin();
    } catch (e) {}
  }
  setInterval(checkAutoCheckin, 60000);
  function bootCheckin() {
    // v3.5.129：数据未就绪不启动——3s 兜底在慢设备（分批恢复 >3s）上会
    // 绕过门控提前生成日常，导致导入后首启多出一条"日常更新"且查岗节奏被重置
    if (!window.__mochiDataReady) { setTimeout(bootCheckin, 500); return; }
    ckBootDone = true;
    checkAutoCheckin();
  }
  // 数据就绪（IDB 回填完成）后启动；无事件兜底 3 秒（空数据场景 idbRestore 也会派发）
  document.addEventListener('mochi-restore-done', bootCheckin);
  setTimeout(bootCheckin, 3000);
  if (checkinApp && checkinPage) {
    checkinApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      checkinPage.hidden = false;
      // 显示当前日常；从未生成过则立即生成一条
      let cur = null;
      try { cur = JSON.parse(store.get('checkin-current') || 'null'); } catch (e) {}
      if (cur && cur.place) renderCheckinUI(cur);
      else doCheckin();
      renderCheckinHistory();
    });
  }
  const checkinBack = document.getElementById('checkin-back');
  if (checkinBack) {
    checkinBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-phone');
      if (home) home.hidden = false;
    });
  }
const ckRefresh = document.getElementById('ck-refresh');
if (ckRefresh) {
  // v3.5.132：5 秒最小间隔——连点会在聊天里刷出多条"更新日常"消息
  let ckLastRefresh = 0;
  ckRefresh.addEventListener('click', () => {
    const now = Date.now();
    if (now - ckLastRefresh < 5000) { toast('刷新太频繁，稍后再试'); return; }
    ckLastRefresh = now;
    doCheckin();
  });
}

  // ================= 查岗日常字卡（管理页 + 字卡库入口） =================
  const CK_DEFS = [
    ['place', DEF_PLACES],
    ['action', DEF_ACTIONS],
    ['msg', DEF_CHECK_MSGS]
  ];
  const CK_LABEL = { place: '地点', action: '在做什么', msg: '说的话' };
  let ckTab = 'place';
  // v3.6.x：是否有用户自定义的查岗列表（有则默认项按内容匹配标【系统】；无则整库为系统预设）
  function ckHasCustom(k) {
    try {
      const v = JSON.parse(store.get('checkin-cards-' + k) || 'null');
      return Array.isArray(v) && v.length > 0;
    } catch (e) { return false; }
  }
  let ckTab2 = 'sys';
  function escCk(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function renderCkSysList() {
    const listEl = document.getElementById('cck-sys-list');
    const titleEl = document.getElementById('cck-sys-title');
    if (titleEl) titleEl.textContent = CK_LABEL[ckTab] || '';
    if (!listEl) return;
    const useDefault = getCkDefault();
    const def = { place: DEF_PLACES, action: DEF_ACTIONS, msg: DEF_CHECK_MSGS }[ckTab];
    listEl.innerHTML = '';
    if (!useDefault) {
      const tip = document.createElement('div');
      tip.className = 'ta-empty';
      tip.textContent = '系统预设字卡已关闭（查岗只从「我的添加」里抽取）。开启上方开关即可恢复使用。';
      listEl.appendChild(tip);
      return;
    }
    def.forEach(x => {
      const off = isCkCardOff(ckTab, x);
      const row = document.createElement('div');
      row.className = 'tc-qrow' + (off ? ' off' : '');
      row.innerHTML = '<div class="tc-qmain"><div class="tc-qtext">' + escCk(x) + ' <span class="tc-known">系统</span></div></div>';
      const lab = document.createElement('label');
      lab.className = 'toggle ccard-toggle';
      lab.innerHTML = '<input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span>';
      lab.querySelector('input').addEventListener('change', () => {
        const nowOff = !lab.querySelector('input').checked;
        setCkCardOff(ckTab, x, nowOff);
        renderCkSysList();
        updateCkCount();
        toast((nowOff ? '已关闭：' : '已开启：') + (x.length > 18 ? x.slice(0, 18) + '…' : x));
      });
      row.appendChild(lab);
      listEl.appendChild(row);
    });
  }
  function renderCkMineList() {
    const listEl = document.getElementById('cck-mine-list');
    const titleEl = document.getElementById('cck-mine-title');
    if (titleEl) titleEl.textContent = CK_LABEL[ckTab] || '';
    if (!listEl) return;
    const custom = ckItems(ckTab);
    const groups = ckGroups(ckTab);
    let html = '';
    html += '<div class="mg-grp-row"><button class="cc-tool mg-grp-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>新建分组</button></div>';
    if (!custom.length && !groups.length) {
      listEl.innerHTML = html + '<div class="ta-empty">暂未添加自定义字卡，可在上方批量输入（每行一个）。</div>';
      bindCkGroupOps();
      return;
    }
    // 自定义分组区块（置顶，与系统预设隔开）
    groups.forEach(g => {
      const arr = custom.filter(x => x.grp === g.id);
      html += '<div class="cal-card glass mg-block" data-gid="' + escCk(g.id) + '">' +
        '<div class="cal-card-title mg-title"><button class="mg-handle" data-gid="' + escCk(g.id) + '" title="拖动排序"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>' +
        '<span class="mg-name">' + escCk(g.name) + '</span><span class="mg-cnt">(' + arr.length + ')</span>' +
        '<span class="mg-ops"><button class="mg-op" data-g="' + escCk(g.id) + '" data-op="rn" title="重命名">✎</button><button class="mg-op" data-g="' + escCk(g.id) + '" data-op="rm" title="删除分组">✕</button></span></div>' +
        (arr.length ? arr.map(x => ckMineItemHtml(x, custom.indexOf(x))).join('') : '<div class="ta-empty">这个分组还没有内容</div>') +
        '</div>';
    });
    const ungrouped = custom.filter(x => !x.grp);
    html += '<div class="cal-card glass mg-block mg-ungrouped"><div class="cal-card-title mg-title"><span class="mg-name">未分组</span><span class="mg-cnt">(' + ungrouped.length + ')</span></div>';
    if (!ungrouped.length) html += '<div class="ta-empty">暂无未分组字卡，可在上方批量输入</div>';
    html += ungrouped.map(x => ckMineItemHtml(x, custom.indexOf(x))).join('');
    html += '</div>';
    listEl.innerHTML = html;
    listEl.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const l = ckItems(ckTab);
        l.splice(Number(b.dataset.idx), 1);
        ckSaveItems(ckTab, l);
        renderCkMineList();
        updateCkCount();
        toast('已删除');
      });
    });
    // v3.7.x：点击字卡内容编辑
    listEl.querySelectorAll('.tc-qtext[data-edit]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.edit);
        const l = ckItems(ckTab);
        const item = l[idx];
        if (!item || !window.openModal) return;
        window.openModal('编辑字卡', item.t, (v) => {
          const val = String(v == null ? '' : v).trim();
          if (!val) { toast('内容不能为空'); return; }
          if (val === item.t) return;
          if (l.some((x, xi) => xi !== idx && x.t === val)) { toast('已有相同内容'); return; }
          l[idx].t = val;
          ckSaveItems(ckTab, l);
          renderCkMineList();
          toast('已更新');
        });
      });
    });
    // v3.7.x：移动字卡到其他分组
    listEl.querySelectorAll('.ta-mv').forEach(b => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.idx);
        const l = ckItems(ckTab);
        const item = l[idx];
        if (!item || !window.openModal) return;
        const groups = ckGroups(ckTab);
        const opts = [{ label: '未分组', value: '' }].concat(groups.map(g => ({ label: g.name, value: g.id })));
        window.openModal('移动到分组', '', (v) => {
          if (v == null) return;
          l[idx].grp = v || '';
          ckSaveItems(ckTab, l);
          renderCkMineList();
          const tgt = v ? (groups.find(g => g.id === v) || {}).name : '未分组';
          toast('已移动到「' + tgt + '」');
        }, { pills: opts, pill: item.grp || '', noInput: true });
      });
    });
    bindCkGroupOps();
  }
  function ckMineItemHtml(x, idx) {
    return '<div class="tc-qrow"><div class="tc-qmain"><div class="tc-qtext" data-edit="' + idx + '">' + escCk(x.t) + '</div></div>' +
      '<button class="ta-mv" data-idx="' + idx + '" title="移动分组"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M3 7h13a4 4 0 014 4v0a4 4 0 01-4 4H7"/><path d="M7 11l-4 4 4 4"/></svg></button>' +
      '<button class="ta-del" data-idx="' + idx + '">✕</button></div>';
  }
  // 查岗 分组管理事件（新建 / 重命名 / 删除，按当前分类独立）
  function bindCkGroupOps() {
    const wrap = document.getElementById('cck-mine-list');
    if (!wrap) return;
    wrap.querySelectorAll('.mg-grp-add').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const groups = ckGroups(ckTab);
        window.cardGroups.addFlow(groups, g => {
          if (!g) return;
          ckSaveGroups(ckTab, groups);
          refreshCkGrpSelect();
          renderCkMineList();
          toast('已新建分组「' + g.name + '」');
        });
      });
    });
    wrap.querySelectorAll('.mg-op').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const groups = ckGroups(ckTab);
        const gid = b.dataset.g;
        const g = groups.find(x => x.id === gid);
        if (!g) return;
        if (b.dataset.op === 'rn') {
          window.cardGroups.renameFlow(g, groups, name => {
            if (!name) return;
            ckSaveGroups(ckTab, groups);
            refreshCkGrpSelect();
            renderCkMineList();
            toast('分组已重命名');
          });
        } else if (b.dataset.op === 'rm') {
          window.cardGroups.removeFlow(g.name, ok => {
            if (!ok) return;
            const l = ckItems(ckTab);
            l.forEach(x => { if (x.grp === gid) x.grp = ''; });
            ckSaveItems(ckTab, l);
            ckSaveGroups(ckTab, groups.filter(x => x.id !== gid));
            refreshCkGrpSelect();
            renderCkMineList();
            toast('已删除分组「' + g.name + '」');
          });
        }
      });
    });
    // v3.7.x：分组拖动排序（手柄 ≡ 触发，克隆标题行跟随手指 + 蓝色指示线）
    wrap.querySelectorAll('.mg-handle').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const gid = b.dataset.gid;
        const blocks0 = Array.from(wrap.querySelectorAll('.mg-block:not(.mg-ungrouped)'));
        const block = blocks0.find(bl => bl.dataset.gid === gid);
        if (!block) return;
        const title = block.querySelector('.mg-title');
        const rect = title.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const clone = title.cloneNode(true);
        clone.classList.add('mg-drag-clone');
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.margin = '0';
        clone.style.zIndex = '1000';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);
        block.classList.add('mg-dragging');
        let dropIdx = blocks0.indexOf(block);
        const onMove = (ev) => {
          ev.preventDefault();
          clone.style.top = (ev.clientY - offsetY) + 'px';
          const blocks2 = Array.from(wrap.querySelectorAll('.mg-block:not(.mg-ungrouped)'));
          dropIdx = blocks2.length;
          for (let i = 0; i < blocks2.length; i++) {
            if (blocks2[i] === block) continue;
            const r = blocks2[i].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) { dropIdx = i; break; }
          }
          wrap.querySelectorAll('.mg-drop-line').forEach(el => el.remove());
          const line = document.createElement('div');
          line.className = 'mg-drop-line';
          if (dropIdx >= blocks2.length) {
            const last = blocks2[blocks2.length - 1];
            if (last && last.nextSibling) wrap.insertBefore(line, last.nextSibling);
            else wrap.appendChild(line);
          } else {
            wrap.insertBefore(line, blocks2[dropIdx]);
          }
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          clone.remove();
          block.classList.remove('mg-dragging');
          wrap.querySelectorAll('.mg-drop-line').forEach(el => el.remove());
          const blocks2 = Array.from(wrap.querySelectorAll('.mg-block:not(.mg-ungrouped)'));
          const curIdx = blocks2.findIndex(bl => bl.dataset.gid === gid);
          if (curIdx < 0 || dropIdx === curIdx || dropIdx === curIdx + 1) return;
          const groups = ckGroups(ckTab);
          let target = dropIdx < curIdx ? dropIdx : dropIdx - 1;
          if (target < 0) target = 0;
          if (target > groups.length - 1) target = groups.length - 1;
          if (target === curIdx) return;
          const [moved] = groups.splice(curIdx, 1);
          groups.splice(target, 0, moved);
          ckSaveGroups(ckTab, groups);
          renderCkMineList();
          toast('分组已移动');
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
        e.preventDefault();
      });
    });
  }
  // 刷新批量输入的分组下拉（按当前分类）
  function refreshCkGrpSelect() {
    const grpSel = document.getElementById('cck-batch-grp');
    if (!grpSel) return;
    const groups = ckGroups(ckTab);
    grpSel.innerHTML = window.cardGroups.grpOnlyOptsHtml(groups, grpSel.value);
    window.cardGroups.bindNewGrp(grpSel, groups, function () { ckSaveGroups(ckTab, groups); });
  }
  function updateCkCount() {
    const useDefault = getCkDefault();
    let sysTotal = 0, mineTotal = 0;
    CK_DEFS.forEach(([k, def]) => {
      mineTotal += ckCustomList(k).length;
      if (useDefault) sysTotal += def.filter(x => !isCkCardOff(k, x)).length;
    });
    const cnt = document.getElementById('cc-checkin-count');
    if (cnt) cnt.textContent = sysTotal;
    const cntM = document.getElementById('cc-checkin-count-mine');
    if (cntM) cntM.textContent = mineTotal;
  }
  function switchCkTab2(tab) {
    ckTab2 = tab;
    const tabsWrap = document.getElementById('ck-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('ck-sys-panel');
    const minePanel = document.getElementById('ck-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    if (tab === 'sys') renderCkSysList(); else renderCkMineList();
  }
  function renderCheckinCards() {
    // 顶部分类 tab
    document.querySelectorAll('#page-checkin-cards .fav-tab').forEach(tab => {
      tab.classList.toggle('sel', tab.dataset.cktab === ckTab);
    });
    const useDefault = getCkDefault();
    const defEl = document.getElementById('ck-default');
    if (defEl) defEl.checked = useDefault;
    refreshCkGrpSelect(); // v3.7.x：切换分类时刷新该分类的分组下拉
    switchCkTab2(ckTab2);
    updateCkCount();
  }
  // v3.6.x：使用系统预设字卡开关（默认开启；关闭后查岗只从用户添加的字卡里抽）
  const ckDefaultEl = document.getElementById('ck-default');
  if (ckDefaultEl) {
    ckDefaultEl.addEventListener('change', () => {
      store.set(CK_DEF_KEY, ckDefaultEl.checked ? '1' : '0');
      renderCheckinCards();
      toast(ckDefaultEl.checked ? '系统预设字卡已开启' : '系统预设字卡已关闭（仅用你添加的字卡）');
    });
  }
  // 分类 tab 切换
  document.querySelectorAll('#page-checkin-cards .fav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      ckTab = tab.dataset.cktab;
      renderCheckinCards();
    });
  });
  // 系统预设/我的添加 双 tab 切换
  const ckTabsWrap = document.getElementById('ck-tabs');
  if (ckTabsWrap) {
    ckTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => { ckTab2 = tab.dataset.tab; switchCkTab2(ckTab2); });
    });
  }
  // 批量输入：每行一个，添加到当前分类（只追加到用户自定义库，不污染系统预设；v3.7.x 可选归入自定义分组）
  const batchAdd = document.getElementById('cck-batch-add');
  if (batchAdd) {
    refreshCkGrpSelect();
    batchAdd.addEventListener('click', () => {
      const ta = document.getElementById('cck-batch');
      const raw = ta ? ta.value : '';
      const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
      if (!items.length) { toast('请输入内容，每行一个'); return; }
      const grpSel = document.getElementById('cck-batch-grp');
      const parsed = window.cardGroups.parseCatVal(grpSel ? grpSel.value : '');
      if (!parsed) { toast('请先选择分组'); return; }
      const list = ckItems(ckTab);
      items.forEach(it => {
        const x = { t: it };
        if (parsed.grp) x.grp = parsed.grp;
        list.push(x);
      });
      ckSaveItems(ckTab, list);
      if (ta) ta.value = '';
      renderCkMineList();
      updateCkCount();
      toast('已添加 ' + items.length + ' 条到「' + (CK_LABEL[ckTab] || ckTab) + '」');
    });
  }
  // v3.7.x：「＋分组」按钮（批量输入卡片标题行）
  const ckNewGrp = document.getElementById('ck-new-grp');
  if (ckNewGrp) {
    ckNewGrp.addEventListener('click', () => {
      const groups = ckGroups(ckTab);
      window.cardGroups.addFlow(groups, g => {
        if (!g) return;
        ckSaveGroups(ckTab, groups);
        refreshCkGrpSelect();
        if (ckTab2 === 'mine') renderCkMineList();
        toast('已新建分组「' + g.name + '」');
      });
    });
  }
  // 入口：字卡库「查岗日常字卡」→ 管理页
  const liCK = document.getElementById('li-checkin-cards');
  const ckCardsPage = document.getElementById('page-checkin-cards');
  if (liCK && ckCardsPage) {
    liCK.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      ckCardsPage.hidden = false;
      ckTab2 = 'sys';
      const tw = document.getElementById('ck-tabs'); if (tw) tw.style.display = 'none';
      renderCheckinCards();
    });
  }
  // v3.9.x：「查岗日常·我的添加」入口——只看自定义
  const liCKMine = document.getElementById('li-checkin-cards-mine');
  if (liCKMine && ckCardsPage) {
    liCKMine.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      ckCardsPage.hidden = false;
      ckTab2 = 'mine';
      const tw = document.getElementById('ck-tabs'); if (tw) tw.style.display = 'none';
      renderCheckinCards();
    });
  }
  const ckCardsBack = document.getElementById('checkin-cards-back');
  if (ckCardsBack) {
    ckCardsBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  renderCheckinCards();
  // v3.9.x：注册查岗日常字卡跨分类搜索
  window.__cardSearchFns = window.__cardSearchFns || [];
  window.__cardSearchFns.push({ name: '查岗日常字卡', fn: function (kw) {
    const out = [];
    try {
      CK_DEFS.forEach(function (pair) {
        const k = pair[0]; const def = pair[1]; const label = CK_LABEL[k] || k;
        (def || []).forEach(function (x) { if (x && String(x).toLowerCase().indexOf(kw) >= 0) out.push({ t: String(x), cat: label + '·系统' }); });
        (ckCustomList(k) || []).forEach(function (item) { const txt = item && item.t ? item.t : ''; if (txt && txt.toLowerCase().indexOf(kw) >= 0) out.push({ t: txt, cat: label + '·我的' }); });
      });
    } catch (e) {}
    return out;
  } });

  // ================= 桌面第二页补充：今日备忘 / 今天的心情 / 本周日常 =================
  // 备忘/心情保存时写入历史（主页展示全部记录）
  // v3.7.x：备忘/心情按「天」显示——读当日快照（memo-YYYY-MM-DD / today-mood-YYYY-MM-DD），
  // 当天没写过就显示占位，第二天自动重新开始（前一天内容留在历史里，可点本周日常查看）。
  // 兼容：老版本只存固定键 memo/today-mood，无当日快照时视为「今天还没写」，不再把旧内容
  // 一直挂在桌面上（这正是"备忘/心情不每天刷新"的根因）。
  function todayMemoText() { return store.get('memo-' + dayStr(new Date())) || legacyToday('memo', 'memo-history'); }
  function todayMoodText() { return store.get('today-mood-' + dayStr(new Date())) || legacyToday('today-mood', 'mood-history'); }
  // v3.7.x 兼容升级：老版本把备忘/心情存在固定键（无日期）。当天历史第一条记录是今天写的
  // → 把固定键内容迁移成今日快照（老内容留在桌面、不丢），否则视为「今天还没写」。
  // 只迁移一次（迁移后已有快照，直接返回），无副作用。
  function legacyToday(curKey, histKey) {
    try {
      const list = JSON.parse(store.get(histKey) || '[]');
      if (list.length && list[0].ts &&
          new Date(list[0].ts).toDateString() === new Date().toDateString()) {
        const legacy = store.get(curKey);
        if (legacy) {
          const ds = dayStr(new Date());
          store.set(curKey + '-' + ds, legacy);
          try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + curKey + '-' + ds, legacy); } catch (e) {}
          return legacy;
        }
      }
    } catch (e) {}
    return '';
  }
  const memoEl = document.getElementById('memo-text');
  if (memoEl) {
    memoEl.textContent = todayMemoText() || '点这里记一句话';
    memoEl.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('今日备忘', memoEl.textContent === '点这里记一句话' ? '' : memoEl.textContent, (v) => {
          const val = (v || '').trim();
          if (val) {
            memoEl.textContent = val; store.set('memo', val); pushHist('memo-history', val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':memo', val); } catch (e) {}
            // v3.7.x：补写按日期快照，供本周日常点击其他日期查看当日备忘（桌面显示也读它）
            const ds = dayStr(new Date());
            store.set('memo-' + ds, val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':memo-' + ds, val); } catch (e) {}
          }
        });
      }
    });
  }
  const moodEl = document.getElementById('today-mood-text');
  if (moodEl) {
    moodEl.textContent = todayMoodText() || '点一下选心情';
    moodEl.addEventListener('click', () => {
      if (window.openModal) {
        const moods = ['开心', '平静', '想你', '忙碌', '困', '充实', '温柔'];
        window.openModal('今天的心情', '', (v) => {
          const val = (v || '').trim();
          if (val) {
            moodEl.textContent = val; store.set('today-mood', val); pushHist('mood-history', val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':today-mood', val); } catch (e) {}
            // v3.7.x：补写按日期快照，供本周日常点击其他日期查看当日心情（桌面显示也读它）
            const ds = dayStr(new Date());
            store.set('today-mood-' + ds, val);
            try { if (window.idbSet) window.idbSet(window.activePrefix() + ':today-mood-' + ds, val); } catch (e) {}
          }
        }, { pills: moods.map(m => ({ label: m, value: m })), pill: todayMoodText() || '' });
      }
    });
  }
  const weekEl = document.getElementById('week-days');
  if (weekEl) {
    // v3.5.37：统一布局——第一行周（日一二三四五六，今天显示「今」），第二行本周对应日期数字
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const todayIdx = now.getDay();
    // 本周起始 = 本周日（getDay() 0 即周日，周一~周六往前推）
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - todayIdx);
    weekEl.innerHTML = names.map((n, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const ds = dayStr(d);
      return '<div class="week-day' + (i === todayIdx ? ' today' : '') + '" data-date="' + ds + '"' + (i === todayIdx ? '' : ' role="button"') + '><b>' + (i === todayIdx ? '今' : n) + '</b>' + d.getDate() + '</div>';
    }).join('');
    // v3.7.x：点击其他日期查看当日备忘与我们的心情（今天保持原状，数据已在桌面展示；
    // TA 的当日内容/留言归日历页查看，本周日常只保留属于我们自己的备忘与心情）
    weekEl.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.week-day');
      if (!cell || cell.classList.contains('today')) return;
      // 装修模式下不触发查看（避免与卡片拖拽/编辑冲突）
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      const ds = cell.getAttribute('data-date');
      if (!ds || !window.openModal) return;
      const parts = ds.split('-');
      const dd = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      const wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const dateLabel = (+parts[1]) + ' 月 ' + (+parts[2]) + ' 日（' + wdNames[dd.getDay()] + '）';
      // v3.7.x bugfix：未来日期不生成不读取内容，只显示空态提示，避免"超前显示"
      const n2 = new Date();
      const isFuture = dd > new Date(n2.getFullYear(), n2.getMonth(), n2.getDate());
      // 备忘/心情：按日快照缺失时回退查当天历史（v3.7.x 之前老版本只存历史列表，
      // 没有 memo-YYYY-MM-DD / today-mood-YYYY-MM-DD 快照，直接读会显示"没有记录"）
      const histOnDay = function (histKey) {
        try {
          const list = JSON.parse(store.get(histKey) || '[]');
          const t = dd.toDateString();
          return list.filter(x => x && x.ts && new Date(x.ts).toDateString() === t)
            .map(x => x.text).filter(Boolean);
        } catch (e) { return []; }
      };
      const memo = isFuture ? '' : (store.get('memo-' + ds) || histOnDay('memo-history').join('；'));
      const mood = isFuture ? '' : (store.get('today-mood-' + ds) || histOnDay('mood-history').join('；'));
      const lines = [];
      lines.push(dateLabel);
      lines.push('');
      if (isFuture) {
        lines.push('（未来的日子还没有内容，等到了那一天再来看吧）');
      } else {
        lines.push('【今日备忘】');
        lines.push(memo || '（这一天没有备忘）');
        lines.push('');
        lines.push('【今天的心情】');
        lines.push(mood || '（这一天没有记录心情）');
      }
      window.openModal(ds + ' 当日备忘与心情', '', () => {}, { noInput: true, staticText: lines.join('\n') });
    });
  }

  // v3.6.x：多桌面——切换联系人后刷新桌面第二页常驻组件（备忘/心情按新桌面的值回显）。
  // store 动态绑定当前联系人，直接重读即可。
  document.addEventListener('contact-switched', function () {
    try {
      const memoEl2 = document.getElementById('memo-text');
      if (memoEl2) {
        memoEl2.textContent = todayMemoText() || '点这里记一句话';
      }
      const moodEl2 = document.getElementById('today-mood-text');
      if (moodEl2) {
        moodEl2.textContent = todayMoodText() || '点一下选心情';
      }
      // v3.7.x：关闭查岗半框——否则切换后仍浮在新桌面显示旧桌面日常（数据串桌面）
      const ckPanel = document.getElementById('ck-panel');
      if (ckPanel) ckPanel.hidden = true;
    } catch (e) {}
  });
  // v3.7.x：跨天自动刷新——页面一直开着跨过午夜时，备忘/心情应显示新一天的空状态
  //（桌面其余按日内容（本周日常/倒计时）本身随日期重渲染，备忘/心情是持久化文本需手动刷）
  (function () {
    let lastDay = dayStr(new Date());
    setInterval(function () {
      try {
        const now = dayStr(new Date());
        if (now === lastDay) return;
        lastDay = now;
        const m = document.getElementById('memo-text');
        if (m) m.textContent = todayMemoText() || '点这里记一句话';
        const md = document.getElementById('today-mood-text');
        if (md) md.textContent = todayMoodText() || '点一下选心情';
      } catch (e) {}
    }, 30000);
  })();
})();

// ===== 功能：TA在身边·位置（查岗半框内入口，位置面板独立词库） =====
// 位置卡 = 普通聊天消息（TA 发的 side=in），位置面板单独维护当前位置/时间线
// 收到位置卡时屏幕光点动效
(function () {
  const store = window.activeStore();
  // ---- 位置词库（内置，独立于聊天字卡库） ----
  const LOC = {
    dir: ['在你左边', '在你右边', '在你身后', '在你前面', '离你两步', '抬头就能看到', '在你看不到的地方偷看你'],
    dist: ['再近一点', '再远一点', '就停这儿', '马上到你身边', '一直在原地等你'],
    state: ['跟在你后面', '陪你走着', '停下来等你', '绕着你转圈', '在你身边'],
    sense: ['在你看不到的地方', '隔着世界在你身边', '感觉到了吗', '能摸到我吗', '一直没走远', '隐约在你身旁'],
    egg: '在你心里'
  };
  const LOC_LABEL = { dir: '方位', dist: '距离', state: '状态', sense: '感知', egg: '彩蛋', custom: '自定义', combo: '组合' };
  // 方位/感知/彩蛋 → 光点落点（相对视口 0~1）
  const DIR_POS = {
    '在你左边': { x: 0.08, y: 0.5 },
    '在你右边': { x: 0.92, y: 0.5 },
    '在你身后': { x: 0.5, y: 0.08 },
    '在你前面': { x: 0.5, y: 0.92 },
    '离你两步': { x: 0.5, y: 0.38 },
    '抬头就能看到': { x: 0.5, y: 0.12 },
    '在你看不到的地方偷看你': { x: 0.86, y: 0.16 },
    '在你看不到的地方': { x: 0.72, y: 0.28 },
    '隔着世界在你身边': { x: 0.5, y: 0.5, center: true },
    '感觉到了吗': { x: 0.5, y: 0.5, center: true },
    '能摸到我吗': { x: 0.5, y: 0.5, center: true },
    '一直没走远': { x: 0.5, y: 0.45 },
    '隐约在你身旁': { x: 0.55, y: 0.5 },
    '在你心里': { x: 0.5, y: 0.5, center: true }
  };
  // 距离卡微调：往中心靠（正）/ 往边缘退（负）
  const DIST_ADJUST = { '再近一点': 0.15, '再远一点': -0.15, '就停这儿': 0, '马上到你身边': 0.3, '一直在原地等你': 0 };
  function adjustTowardCenter(pos, amount) {
    return { x: pos.x + (0.5 - pos.x) * amount, y: pos.y + (0.5 - pos.y) * amount, center: pos.center };
  }
  // 最近一张方位卡文本（距离/状态卡落点基准）
  function lastDirText() {
    const hist = loadHist();
    for (const h of hist) {
      if (h.type === 'dir') return h.text;
      if (h.type === 'combo') return h.text.split(' ')[0];
    }
    return null;
  }
  // 落点：方位/彩蛋取映射；距离卡取最近方位+微调；状态卡取最近方位
  function fxPos(text, type) {
    if (DIR_POS[text]) return DIR_POS[text];
    const dirText = lastDirText();
    const base = dirText ? (DIR_POS[dirText] || { x: 0.5, y: 0.3 }) : { x: 0.5, y: 0.3 };
    if (type === 'dist') {
      const adj = DIST_ADJUST[text] || 0;
      if (adj) return adjustTowardCenter(base, adj);
    }
    return base;
  }
  const EGG_COOLDOWN = 7 * 24 * 3600 * 1000;

  // ---- 存储 ----
  function loadCur() { try { return JSON.parse(store.get('loc-current') || 'null'); } catch (e) { return null; } }
  function saveCur(v) { store.set('loc-current', v ? JSON.stringify(v) : ''); }

  function loadHist() { try { return JSON.parse(store.get('loc-history') || '[]'); } catch (e) { return []; } }
  function saveHist(list) {
    const s = JSON.stringify(list);
    store.set('loc-history', s);
    try { if (window.idbSet) window.idbSet(window.activePrefix() + ':loc-history', s); } catch (e) {}
  }
  function eggLastTs() { return parseInt(store.get('loc-egg-last') || '0', 10) || 0; }
  function eggUsed() { return Date.now() - eggLastTs() < EGG_COOLDOWN; }
  // ---- 自定义位置卡 ----
  function loadCustom() { try { return JSON.parse(store.get('loc-custom') || '[]'); } catch (e) { return []; } }
  function saveCustom(list) {
    const s = JSON.stringify(list);
    store.set('loc-custom', s);
    try { if (window.idbSet) window.idbSet(window.activePrefix() + ':loc-custom', s); } catch (e) {}
  }
  // ---- 感知描述（基于最近位置卡 · 体现"偶尔能感觉到"） ----
  function senseDesc(cur) {
    if (!cur) return '还没感觉到 TA…';
    const t = cur.text;
    if (t.indexOf('看不到') >= 0 && t.indexOf('偷看') < 0) return 'TA 在你看不到的地方，但没走远';
    if (t.indexOf('隔着世界') >= 0) return 'TA 隔着世界，隐约在你身旁';
    if (t.indexOf('感觉到') >= 0) return '你感觉到了 TA，就在附近';
    if (t.indexOf('能摸到') >= 0) return '你能摸到 TA，很近很安心';
    if (t.indexOf('没走远') >= 0) return 'TA 一直没走远，就在身边';
    if (t.indexOf('隐约') >= 0) return 'TA 隐约在你身旁，感觉到了吗';
    if (t.indexOf('心里') >= 0) return 'TA 在你心里，最近的距离';
    if (t.indexOf('身后') >= 0) return '你感觉到 TA 在你身后，很近';
    if (t.indexOf('左边') >= 0) return '你感觉到 TA 在你左边';
    if (t.indexOf('右边') >= 0) return '你感觉到 TA 在你右边';
    if (t.indexOf('前面') >= 0) return '你感觉到 TA 在你前面';
    if (t.indexOf('身边') >= 0) return 'TA 就在你身边，很安心';
    if (t.indexOf('跟着') >= 0 || t.indexOf('陪你') >= 0) return 'TA 在陪你，感觉到了吗';
    return '你感觉到 TA 在附近：' + t;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function fmtT(ts) { if (!ts) return ''; const d = new Date(ts); const p = (n) => (n < 10 ? '0' + n : '' + n); return p(d.getHours()) + ':' + p(d.getMinutes()); }
  function toast(s) { try { if (typeof window.toast === 'function') window.toast(s); } catch (e) {} }

  // ---- 光点动效 ----
  function playLocFx(text, type) {
    const fx = document.getElementById('loc-fx');
    if (!fx) return;
    const pos = fxPos(text, type);
    fx.hidden = false;
    fx.className = 'loc-fx' + (pos.center ? ' loc-fx-center' : '');
    fx.style.left = (pos.x * 100) + '%';
    fx.style.top = (pos.y * 100) + '%';
    void fx.offsetWidth;
    fx.classList.add('loc-fx-show');
    clearTimeout(fx._t);
    fx._t = setTimeout(() => {
      fx.classList.remove('loc-fx-show');
      fx._t = setTimeout(() => { fx.hidden = true; }, 500);
    }, 2000);
  }

  // ---- 发位置卡（代 TA 发） ----
  function sendLocCard(text, type) {
    const ts = Date.now();
    if (type === 'egg' && eggUsed()) {
      toast('彩蛋「在你心里」一周只能用一次');
      return;
    }
    if (window.chatAddIn) window.chatAddIn(text);
    saveCur({ text: text, type: type, ts: ts });
    const hist = loadHist();
    hist.unshift({ text: text, type: type, ts: ts });
    saveHist(hist);
    if (type === 'egg') store.set('loc-egg-last', String(ts));
    playLocFx(text, type);
    locViewDate = dayStr(new Date());
    renderLocPanel();

  }

  // ---- 日期辅助（按日切换时间线） ----
  function dayStr(d) { const p = (n) => (n < 10 ? '0' + n : '' + n); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function dayLabel(s) {
    const today = dayStr(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (s === today) return '今天';
    if (s === dayStr(y)) return '昨天';
    const parts = s.split('-');
    return parts[1] + '月' + parts[2] + '日';
  }
  function uniqueDays(hist) {
    const set = new Set();
    hist.forEach(h => { try { set.add(dayStr(new Date(h.ts))); } catch (e) {} });
    return Array.from(set).sort().reverse();
  }
  let locViewDate = '';

  // ---- 组合发送（方位 + 距离） ----
  let comboMode = store.get('loc-combo') !== '0'; // 默认开，记住选择
  let pendingDir = null;
  function sendComboCard(dirText, distText) {
    const ts = Date.now();
    const text = dirText + ' ' + distText;
    if (window.chatAddIn) window.chatAddIn(text);
    saveCur({ text: text, type: 'combo', ts: ts });
    const hist = loadHist();
    hist.unshift({ text: text, type: 'combo', ts: ts });
    saveHist(hist);
    playLocFx(dirText, 'dir');
    pendingDir = null;
    locViewDate = dayStr(new Date());
    renderLocPanel();

  }

  // ---- 问 TA 一声 ----
  let asking = false;
  function askWhere() {
    if (asking) return;
    asking = true;
    if (window.chatSendMsg) window.chatSendMsg('你在哪？');
    toast(window.taFit ? window.taFit('已问 TA 一声，等 TA 回位置…') : '已问 TA 一声，等 TA 回位置…');
    setTimeout(() => {
      asking = false;
      const d = LOC.dir[Math.floor(Math.random() * LOC.dir.length)];
      const t = LOC.dist[Math.floor(Math.random() * LOC.dist.length)];
      sendComboCard(d, t);
    }, 2000 + Math.random() * 2000);
  }


  // ---- 位置变化提醒气泡（TA 主动换位置时顶部轻提示） ----
  function showLocChangeBubble(text) {
    let bub = document.getElementById('loc-change-bubble');
    if (!bub) {
      bub = document.createElement('div');
      bub.id = 'loc-change-bubble';
      bub.className = 'loc-change-bubble';
      document.body.appendChild(bub);
    }
    bub.textContent = window.taFit ? window.taFit('你感觉到 TA 换了位置：' + text) : ('你感觉到 TA 换了位置：' + text);
    bub.classList.add('loc-bubble-show');
    clearTimeout(bub._t);
    bub._t = setTimeout(() => { bub.classList.remove('loc-bubble-show'); }, 3000);
  }

  // ---- 渲染位置面板 ----
  function renderLocPanel() {
    const body = document.getElementById('loc-body');
    if (!body) return;
    const cur = loadCur();

    const allHist = loadHist();
    const used = eggUsed();

    // 按日切换：默认今天（或有记录的最近一天）
    const days = uniqueDays(allHist);
    if (!locViewDate || days.indexOf(locViewDate) < 0) locViewDate = days[0] || dayStr(new Date());
    const dayHist = allHist.filter(h => { try { return dayStr(new Date(h.ts)) === locViewDate; } catch (e) { return false; } });
    const dayIdx = days.indexOf(locViewDate);

    let html = '';
    // 感知描述
    html += '<div class="loc-sense-box"><div class="loc-sense-title">你感觉到的</div><div class="loc-sense-text">' + esc(senseDesc(cur)) + '</div></div>';
    // 此刻位置
    html += '<div class="loc-section"><div class="loc-sec-title">TA 此刻的位置</div>';
    html += '<div class="loc-sec-value">' + (cur
      ? esc(cur.text) + '<span class="loc-sec-sub">' + (LOC_LABEL[cur.type] || (cur.type === 'combo' ? '组合' : '')) + ' · ' + fmtT(cur.ts) + '</span>'
      : '— 还没有位置卡') + '</div></div>';

    // 时间线（按日切换）
    html += '<div class="loc-section"><div class="loc-sec-title">位置时间线（按日查看）</div>';
    html += '<div class="loc-day-switch"><button class="loc-day-btn" id="loc-day-prev"' + (dayIdx >= days.length - 1 ? ' disabled' : '') + '>‹</button><span class="loc-day-label">' + dayLabel(locViewDate) + '</span><button class="loc-day-btn" id="loc-day-next"' + (dayIdx <= 0 ? ' disabled' : '') + '>›</button></div>';
    if (dayHist.length) {
      html += '<div class="loc-timeline">' + dayHist.map(h => {
        const tag = LOC_LABEL[h.type] || '';
        const auto = h.auto ? '<span class="loc-tl-auto">TA</span>' : '';
        return '<div class="loc-tl-item"><span class="loc-tl-time">' + fmtT(h.ts) + '</span><span class="loc-tl-text">' + esc(h.text) + '</span><span class="loc-tl-tag">' + esc(tag) + '</span>' + auto + '</div>';
      }).join('') + '</div>';
      html += '<div class="loc-day-count">共 ' + dayHist.length + ' 条</div>';
    } else {
      html += '<div class="loc-sec-value loc-empty">这天没有位置记录</div>';
    }
    html += '</div>';
    // 问 TA 一声
    html += '<button class="loc-ask-btn" id="loc-ask-btn">问 TA 一声「你在哪？」</button>';
    // TA 发位置卡词库
    html += '<div class="loc-send-area"><div class="loc-send-tip">TA 想告诉你 TA 在哪（发出后有光点动效）</div>';
    // 组合开关
    html += '<div class="loc-combo-toggle"><label class="loc-switch"><input type="checkbox" id="loc-combo-chk"' + (comboMode ? ' checked' : '') + '><span class="loc-switch-tk"></span></label><span class="loc-combo-label">组合发送（方位 + 距离）</span></div>';
    if (comboMode && pendingDir) {
      html += '<div class="loc-combo-pending">已选方位：<b>' + esc(pendingDir) + '</b>，再点距离卡组合发送 <span class="loc-combo-clear" id="loc-combo-clear">取消</span></div>';
    } else if (comboMode) {
      html += '<div class="loc-combo-pending loc-empty">组合模式：先点一张方位卡选中，再点距离卡组合发送</div>';
    }
    function groupHtml(key, label, arr) {
      const cards = arr.map(t => {
        const sel = (key === 'dir' && comboMode && pendingDir === t) ? ' loc-card-sel' : '';
        return '<button class="loc-card' + sel + '" data-text="' + esc(t) + '" data-type="' + key + '">' + esc(t) + '</button>';
      }).join('');
      return '<div class="loc-grp"><div class="loc-grp-label">' + label + '</div><div class="loc-grp-cards">' + cards + '</div></div>';
    }
    html += groupHtml('dir', '方位卡', LOC.dir);
    html += groupHtml('dist', '距离卡', LOC.dist);
    html += groupHtml('state', '状态卡', LOC.state);
    html += groupHtml('sense', '感知卡', LOC.sense);
    const custom = loadCustom();
    if (custom.length) {
      const ccards = custom.map((t, i) => '<button class="loc-card loc-card-custom" data-text="' + esc(t) + '" data-type="custom">' + esc(t) + '<span class="loc-card-del" data-del="' + i + '">✕</span></button>').join('');
      html += '<div class="loc-grp"><div class="loc-grp-label">我的自定义</div><div class="loc-grp-cards">' + ccards + '</div></div>';
    }
    html += '<button class="loc-add-custom" id="loc-add-custom">+ 添加自定义位置卡</button>';
    html += '<div class="loc-grp"><div class="loc-grp-label">彩蛋' + (used ? '（本周已用）' : '（一周一次 · 特殊动效）') + '</div><div class="loc-grp-cards">' +
      '<button class="loc-card loc-card-egg' + (used ? ' disabled' : '') + '" data-text="' + esc(LOC.egg) + '" data-type="egg"' + (used ? ' disabled' : '') + '>' + esc(LOC.egg) + '</button></div></div>';
    html += '</div>';

    body.innerHTML = html;

    const askBtn = document.getElementById('loc-ask-btn');
    if (askBtn) askBtn.addEventListener('click', askWhere);

    // 日期切换
    const prevBtn = document.getElementById('loc-day-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => { if (dayIdx < days.length - 1) { locViewDate = days[dayIdx + 1]; renderLocPanel(); } });
    const nextBtn = document.getElementById('loc-day-next');
    if (nextBtn) nextBtn.addEventListener('click', () => { if (dayIdx > 0) { locViewDate = days[dayIdx - 1]; renderLocPanel(); } });
    // 组合开关
    const comboChk = document.getElementById('loc-combo-chk');
    if (comboChk) comboChk.addEventListener('change', () => { comboMode = comboChk.checked; store.set('loc-combo', comboMode ? '1' : '0'); pendingDir = null; renderLocPanel(); });
    const comboClear = document.getElementById('loc-combo-clear');
    if (comboClear) comboClear.addEventListener('click', () => { pendingDir = null; renderLocPanel(); });
    // 自定义卡添加
    const addCustom = document.getElementById('loc-add-custom');
    if (addCustom) addCustom.addEventListener('click', () => {
      if (window.openModal) window.openModal('添加自定义位置卡', '', (val) => {
        if (val && val.trim()) { const list = loadCustom(); list.push(val.trim()); saveCustom(list); renderLocPanel(); toast('已添加：' + val.trim()); }
      });
    });
    // 自定义卡删除
    body.querySelectorAll('.loc-card-del').forEach(del => {
      del.addEventListener('click', (e) => { e.stopPropagation(); const idx = parseInt(del.dataset.del, 10); const list = loadCustom(); list.splice(idx, 1); saveCustom(list); renderLocPanel(); });
    });
    // 字卡点击/长按
    body.querySelectorAll('.loc-card').forEach(btn => {
      const text = btn.dataset.text;
      const type = btn.dataset.type;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        if (comboMode) {
          if (type === 'dir') { pendingDir = (pendingDir === text) ? null : text; renderLocPanel(); return; }
          if (type === 'dist') { if (pendingDir) { sendComboCard(pendingDir, text); return; } toast('组合模式：请先点一张方位卡'); return; }
          pendingDir = null;
          sendLocCard(text, type);
          return;
        }
        sendLocCard(text, type);
      });
    });
  }

  // ---- 打开/关闭 ----
  function openLocPanel() {
    const panel = document.getElementById('loc-panel');
    const nameEl = document.getElementById('loc-name');
    if (nameEl) nameEl.textContent = store.get('lbl-partner') || 'TA';
    renderLocPanel();
    if (panel) panel.hidden = false;
    const ck = document.getElementById('ck-panel');
    if (ck) ck.hidden = true;
  }
  function closeLocPanel() {
    const panel = document.getElementById('loc-panel');
    if (panel) panel.hidden = true;
  }

  const entry = document.getElementById('ck-loc-entry');
  if (entry) entry.addEventListener('click', openLocPanel);
  const closeBtn = document.getElementById('loc-close');
  if (closeBtn) closeBtn.addEventListener('click', closeLocPanel);

  try {
    if (window.idbGet && !store.get('loc-history')) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':loc-history').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v) { try { store.set('loc-history', typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
      });
    }
  } catch (e) {}

  // ---- TA 主动发位置卡（自动机制：梦角经常待在身边没走远） ----
  // 每隔 2-6 小时自动发一张：70% 发陪伴卡（表达陪伴），30% 系统随机出（TA 控制不住，符合设定）
  let locAutoTimer = null, locWakeAt = 0;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') locWakeAt = Date.now() + 60000; });
  function locTypeOf(text) {
    if (LOC.dir.indexOf(text) >= 0) return 'dir';
    if (LOC.dist.indexOf(text) >= 0) return 'dist';
    if (LOC.state.indexOf(text) >= 0) return 'state';
    if (LOC.sense.indexOf(text) >= 0) return 'sense';
    return 'custom';
  }
  function doLocAuto() {
    if (document.hidden || Date.now() < locWakeAt || !window.__mochiDataReady) return;
    const companion = ['在你身边', '一直没走远', '隔着世界在你身边', '隐约在你身旁', '在你看不到的地方'];
    let text;
    if (Math.random() < 0.7) {
      text = companion[Math.floor(Math.random() * companion.length)];
    } else {
      const all = [].concat(LOC.dir, LOC.dist, LOC.state, LOC.sense, loadCustom());
      text = all[Math.floor(Math.random() * all.length)];
    }
    if (!text) return;
    const type = locTypeOf(text);
    const ts = Date.now();
    const oldCur = loadCur();
    if (window.chatAddIn) window.chatAddIn(text);
    saveCur({ text: text, type: type, ts: ts, auto: true });
    const hist = loadHist();
    hist.unshift({ text: text, type: type, ts: ts, auto: true });
    saveHist(hist);
    playLocFx(text, type);

    if (oldCur && oldCur.text !== text) showLocChangeBubble(text);
  }
  function scheduleLocAuto() {
    clearTimeout(locAutoTimer);
    if (store.get('loc-auto') === '0') { locAutoTimer = setTimeout(scheduleLocAuto, 60000); return; }
    locAutoTimer = setTimeout(() => { doLocAuto(); scheduleLocAuto(); }, (2 + Math.random() * 4) * 3600000);
  }
  function bootLocAuto() { if (!window.__mochiDataReady) { setTimeout(bootLocAuto, 500); return; } scheduleLocAuto(); }
  document.addEventListener('mochi-restore-done', bootLocAuto);
  setTimeout(bootLocAuto, 3000);

  document.addEventListener('contact-switched', () => {
    try { closeLocPanel(); locViewDate = ''; } catch (e) {}
  });

  window.playLocFx = playLocFx;
})();

// ===== v3.x：世界观·他偶发出现（统一频率 + 浮层 + 打卡字卡） =====
// 梦角是灵体，常在身边但看不见；字卡表达有限，偶尔出得不准——不准配温柔解读。
// 供喝水/番茄钟/摸鱼/打卡复用，避免各功能各自造浮层刷屏。
(function () {
  function store() { try { return window.activeStore(); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function dayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // 他此刻近不近（基于位置卡 loc-current）
  window.taIsNear = function () {
    const s = store(); if (!s) return false;
    let cur = null; try { cur = JSON.parse(s.get('loc-current') || 'null'); } catch (e) {}
    if (!cur) return false;
    const t = cur.text || '';
    return /能摸到|没走远|身边|心里|感觉到|隐约|陪你|跟着|马上到/.test(t);
  };
  window.taSenseDesc = function () {
    const s = store(); if (!s) return '还没感觉到 TA…';
    let cur = null; try { cur = JSON.parse(s.get('loc-current') || 'null'); } catch (e) {}
    if (!cur) return '还没感觉到 TA…';
    const t = cur.text || '';
    if (t.indexOf('隔着世界') >= 0) return window.taFit ? window.taFit('TA 隔着世界，隐约在你身旁') : 'TA 隔着世界，隐约在你身旁';
    if (t.indexOf('感觉到') >= 0) return window.taFit ? window.taFit('你感觉到了 TA，就在附近') : '你感觉到了 TA，就在附近';
    if (t.indexOf('能摸到') >= 0) return window.taFit ? window.taFit('你能摸到 TA，很近很安心') : '你能摸到 TA，很近很安心';
    if (t.indexOf('没走远') >= 0) return window.taFit ? window.taFit('TA 一直没走远，就在身边') : 'TA 一直没走远，就在身边';
    if (t.indexOf('隐约') >= 0) return window.taFit ? window.taFit('TA 隐约在你身旁，感觉到了吗') : 'TA 隐约在你身旁，感觉到了吗';
    if (t.indexOf('身边') >= 0) return window.taFit ? window.taFit('TA 就在你身边，很安心') : 'TA 就在你身边，很安心';
    return window.taFit ? window.taFit('你感觉到 TA 在附近') : '你感觉到 TA 在附近';
  };

  // 统一频率：冷却 + 每日上限（localStorage 记录）
  window.taChimeAllow = function (key, opts) {
    opts = opts || {};
    const s = store(); if (!s) return false;
    const now = Date.now();
    if (opts.cooldown) { let last = 0; try { last = parseInt(s.get('ta-chime:' + key + ':last') || '0', 10) || 0; } catch (e) {} if (now - last < opts.cooldown) return false; }
    if (opts.dailyMax) { let rec = null; try { rec = JSON.parse(s.get('ta-chime:' + key + ':day') || 'null'); } catch (e) {} if (rec && rec.date === dayKey() && rec.n >= opts.dailyMax) return false; }
    return true;
  };
  window.taChimeUse = function (key) {
    const s = store(); if (!s) return;
    try { s.set('ta-chime:' + key + ':last', '' + Date.now()); } catch (e) {}
    let rec = null; try { rec = JSON.parse(s.get('ta-chime:' + key + ':day') || 'null'); } catch (e) {}
    if (!rec || rec.date !== dayKey()) rec = { date: dayKey(), n: 0 };
    rec.n++; try { s.set('ta-chime:' + key + ':day', JSON.stringify(rec)); } catch (e) {}
  };

  // 他偶发浮层（fixed 底部偏上，淡入淡出，4s 自隐）
  // v3.x.x：称呼跟随——所有桌面浮字统一在此按当前联系人性别替换 TA/他（显示层）
  let el = null, timer = null;
  window.taChimeShow = function (text, opts) {
    opts = opts || {};
    if (window.taFit) text = window.taFit(text);
    if (!el) { el = document.createElement('div'); el.className = 'ta-chime-note'; document.body.appendChild(el); }
    const miss = opts.miss ? '<span class="ta-chime-miss">' + esc(window.taFit ? window.taFit(opts.miss) : opts.miss) + '</span>' : '';
    el.innerHTML = '<span class="ta-chime-dot"></span><span class="ta-chime-text">' + esc(text) + '</span>' + miss;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(timer); timer = setTimeout(() => { el.classList.remove('show'); }, opts.dur || 4200);
  };

  // 打卡字卡：他递来一张；低概率"没控制住"配温柔解读。cb(card|null)，card={text, miss?}
  const CHECKIN_TA_CARDS = ['你今天也努力了', '我一直看着你呢', '又一起过了一天', '辛苦啦，过来抱抱', '嗯，今天也好好过来了', '你在，我就安心'];
  const CHECKIN_TA_MISS = ['（字卡有限，他想说的比这张多）', '（这张好像不是他想说的，别在意）', '（他没控制住，意思不全是这个）'];
  window.checkinTaCard = function (cb) {
    if (!window.taChimeAllow('checkin-ta', { cooldown: 24 * 3600 * 1000, dailyMax: 1 })) { if (cb) cb(null); return; }
    window.taChimeUse('checkin-ta');
    const miss = Math.random() < 0.22;
    const text = CHECKIN_TA_CARDS[Math.floor(Math.random() * CHECKIN_TA_CARDS.length)];
    const card = miss ? { text: text, miss: CHECKIN_TA_MISS[Math.floor(Math.random() * CHECKIN_TA_MISS.length)] } : { text: text };
    if (cb && window.taFit) { card.text = window.taFit(card.text); if (card.miss) card.miss = window.taFit(card.miss); }
    if (cb) cb(card);
  };
})();

// ===== v3.x：同频 / 伸手（桌面第三页图标，纯动态注入；不依赖 template.html / tabs.js 白名单） =====
// 世界观：梦角是灵体，常在身边但看不见，偶尔能感觉到、能摸到有体感；字卡表达有限。
// 同频：TA 此刻状态（字卡拼）+ 敲三下暗号（跨世界弱连接，甜蜜安稳，不往危机写）。
// 伸手：长按伸手，有概率摸到（震动+暖光+悄悄话字卡），有概率什么都没有——贴合"偶尔能感觉到"。
(function () {
  function curStore() { try { return window.storeFor(window.__activeCid || 'default'); } catch (e) { return null; } }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function editingNow() { return Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing')); }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function openPage(pg) {
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    pg.hidden = false;
    // tabs.js 的 syncChrome 在初始 .page hidden 变化时触发，本页不在 FULL_PAGES 会显示 tabbar；
    // rAF 在该 microtask 之后手动恢复全屏 chrome（隐藏 tabbar/状态栏、加 .full）。
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
  function onLongPress(el, cb, duration) {
    duration = duration || 450;
    let timer = null;
    function start() { clearTimeout(timer); timer = setTimeout(cb, duration); }
    function cancel() { clearTimeout(timer); }
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('mousedown', (e) => { if (e.button === 0) start(); });
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
  }
  const host = (document.getElementById('page-phone') || {}).parentNode || document.body;

  // ---- 图标注入第三页 ----
  function makeApp(app, name, svg) {
    const a = document.createElement('div');
    a.className = 'app'; a.setAttribute('data-app', app); a.setAttribute('data-desk-widget', 'app-' + app);
    a.innerHTML = '<div class="app-ico">' + svg + '</div><div class="app-name">' + name + '</div>';
    return a;
  }
  const tpApp = makeApp('tongpin', '同频', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h3l2-6 4 14 3-9 2 5h6"/></svg>');
  const ssApp = makeApp('shenshou', '伸手', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V5.5a1.5 1.5 0 013 0V11"/><path d="M10 11V4a1.5 1.5 0 013 0v7"/><path d="M13 11V5.5a1.5 1.5 0 013 0V11"/><path d="M16 11V7a1.5 1.5 0 013 0v6c0 4-2 7-6 7s-6-2-6-6v-3z"/></svg>');
  const waterApp = makeApp('water', '喝水', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5C8 7 5.5 11 5.5 14.5a6.5 6.5 0 0013 0C18.5 11 16 7 12 2.5z"/></svg>');
  const eatApp = makeApp('eat', '吃什么', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v8a3 3 0 003 3v7"/><path d="M8 3v8"/><path d="M17 3c-1.5 0-2.5 2-2.5 5s1 5 2.5 5v8"/></svg>');
  const piggyApp = makeApp('piggy', '存钱罐', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7h6"/><path d="M5 13.5C5 10.4 8.1 8 12 8s7 2.4 7 5.5c0 1.6-.9 3.1-2.3 4.1V20h-2.4l-.4-1.2a9.3 9.3 0 01-3.8 0L9.7 20H7.3v-2.4C5.9 16.6 5 15.1 5 13.5z"/><circle cx="9.3" cy="12.7" r=".55" fill="#111111" stroke="none"/><path d="M18.8 12.3l1.7-.9"/></svg>');
  const pomoApp = makeApp('pomo', '番茄钟', '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.8" r="7.2"/><path d="M12 6.6V4.6"/><path d="M12 6.6C10.6 5.4 9 5.3 7.8 6.1"/><path d="M12 6.6c1.4-1.2 3-1.3 4.2-.5"/></svg>');
  // 默认放第三页；若用户已装修（desk-layout 存在）且布局未含本图标 → 放新的一页，避免破坏自定义布局。
  const pagesBox = document.getElementById('desktop-pages');
  const st0 = curStore();
  let layArr = null;
  try { if (st0) layArr = JSON.parse(st0.get('desk-layout') || 'null'); } catch (e) {}
  const hasLayout = Array.isArray(layArr);
  const alreadyInLay = hasLayout && layArr.some(p => (p || []).some(w => w === 'app-tongpin' || w === 'app-shenshou' || w === 'app-water' || w === 'app-eat' || w === 'app-pomo' || w === 'app-piggy'));
  let placed = false;
  if (hasLayout && !alreadyInLay && pagesBox) {
    const curCnt = pagesBox.querySelectorAll('.page-slide').length;
    if (curCnt < 5) {
      const slide = document.createElement('div');
      slide.className = 'page-slide desk-page';
      slide.dataset.desk = String(curCnt);
      const grid = document.createElement('div');
      grid.className = 'app-grid';
      grid.setAttribute('data-app', 'tp-page');
      grid.appendChild(tpApp); grid.appendChild(ssApp); grid.appendChild(waterApp); grid.appendChild(eatApp); grid.appendChild(pomoApp); grid.appendChild(piggyApp);
      slide.appendChild(grid);
      pagesBox.appendChild(slide);
      try {
        st0.set('desk-page-count', String(curCnt + 1));
        layArr.push(['app-tongpin', 'app-shenshou', 'app-water', 'app-eat', 'app-pomo', 'app-piggy']);
        st0.set('desk-layout', JSON.stringify(layArr));
      } catch (e) {}
      try { if (window.deskRebuild) window.deskRebuild(); } catch (e) {}
      placed = true;
    }
  }
  if (!placed) {
    const p3 = document.querySelector('.app-grid.p3-grid');
    if (p3) { p3.appendChild(tpApp); p3.appendChild(ssApp); p3.appendChild(waterApp); p3.appendChild(eatApp); p3.appendChild(pomoApp); p3.appendChild(piggyApp); }
    // 重应用布局：personalize.js 的 applyDeskLayout 在本文件之前执行过一次，那时图标未注入被跳过；
    // 此处图标已在 DOM，重应用可把图标按 desk-layout 移到用户装修过的目标页（alreadyInLay 时生效）。
    try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
  }

  // ---- 同频页 ----
  const DEF_STATUS = ['在听雨', '在看你写东西', '没睡，在发呆', '刚路过你身边', '在想你', '在发呆', '在看你', '在等你看我'];
  const tpPage = document.createElement('div');
  tpPage.className = 'page'; tpPage.id = 'page-tongpin'; tpPage.hidden = true;
  tpPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="tp-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">同频</span></div>' +
    '<div class="tp-body">' +
      '<div class="tp-card glass"><div class="tp-label">TA 此刻</div><div class="tp-status" id="tp-status">…</div><button class="tp-refresh" id="tp-refresh">换一个</button></div>' +
      '<div class="tp-card glass"><div class="tp-label">' + (window.taFit ? window.taFit('敲三下 · 看他回不回') : '敲三下 · 看他回不回') + '</div><div class="tp-knock" id="tp-knock"><span class="tp-dot"></span><span class="tp-dot"></span><span class="tp-dot"></span></div><div class="tp-hint" id="tp-hint">长按下方 · 凑三下敲桌面</div><div class="tp-knock-area" id="tp-knock-area">长按这里</div></div>' +
      '<div class="tp-manage"><button class="tp-add" id="tp-add">+ 添加状态字卡</button><button class="tp-send-btn" id="tp-send">发到聊天：开</button></div>' +
    '</div>';
  host.appendChild(tpPage);

  function tpCards() { const s = curStore(); if (!s) return DEF_STATUS.slice(); try { const a = JSON.parse(s.get('tongpin-status') || '[]'); return a.length ? a : DEF_STATUS.slice(); } catch (e) { return DEF_STATUS.slice(); } }
  function tpSave(a) { const s = curStore(); if (s) try { s.set('tongpin-status', JSON.stringify(a)); } catch (e) {} }
  // 状态池：用户自定义 + TA 日常 action 字卡（在做什么）合并去重，接入字卡库
  function tpPool() {
    const s = curStore(); let pool = DEF_STATUS.slice();
    try { const a = JSON.parse((s && s.get('tongpin-status')) || '[]'); if (Array.isArray(a) && a.length) pool = a.slice(); } catch (e) {}
    try { const a = JSON.parse((s && s.get('checkin-cards-action')) || '[]'); if (Array.isArray(a)) a.forEach(x => { const t = typeof x === 'string' ? x : (x && x.t); if (t && pool.indexOf(t) < 0) pool.push(t); }); } catch (e) {}
    return pool.length ? pool : DEF_STATUS.slice();
  }
  function tpPick() { const a = tpPool(); const el = document.getElementById('tp-status'); if (el) el.textContent = a[Math.floor(Math.random() * a.length)]; }
  let knock = 0, knockTimer = null;
  function tpResetKnock() { knock = 0; document.querySelectorAll('#tp-knock .tp-dot').forEach(d => d.classList.remove('on')); }
  function tpKnock() {
    if (editingNow()) return;
    const dots = document.querySelectorAll('#tp-knock .tp-dot');
    if (knock < dots.length) dots[knock].classList.add('on');
    knock++;
    clearTimeout(knockTimer);
    const hint = document.getElementById('tp-hint');
    if (knock < 3) { if (hint) hint.textContent = '再敲 ' + (3 - knock) + ' 下'; knockTimer = setTimeout(tpResetKnock, 5000); return; }
    const area = document.getElementById('tp-knock-area');
    const pool = tpPool();
    if (Math.random() < 0.6) {
      vibrate([40, 60, 40, 60, 40]);
      if (area) area.classList.add('flash');
      setTimeout(() => { if (area) area.classList.remove('flash'); }, 700);
      const r = pool[Math.floor(Math.random() * pool.length)];
      if (hint) hint.textContent = window.taFit ? window.taFit('他回你了 · ' + r) : ('他回你了 · ' + r);
      if (tpSendOn() && window.chatAddIn) { try { window.chatAddIn(r); } catch (e) {} }
    } else {
      if (Math.random() < 0.4) {
        const miss = ['…没听到', '没接住', '好像走开了'];
        if (hint) hint.textContent = miss[Math.floor(Math.random() * miss.length)];
      } else {
        if (hint) hint.textContent = '没接住 · 过会儿再敲';
      }
    }
    knockTimer = setTimeout(tpResetKnock, 1400);
  }
  if (tpApp) tpApp.addEventListener('click', () => { if (editingNow()) return; openPage(tpPage); });
  document.getElementById('tp-back').addEventListener('click', () => backHome(tpPage));
  // 状态自动流动：页面可见时每 20-40s 淡入淡出换一句；离开停
  let tpFlowTimer = null;
  function tpPickFade() { const el = document.getElementById('tp-status'); if (!el) { tpPick(); return; } el.classList.add('fade'); setTimeout(() => { tpPick(); el.classList.remove('fade'); }, 400); }
  function tpStartFlow() { clearTimeout(tpFlowTimer); const tick = () => { tpPickFade(); tpFlowTimer = setTimeout(tick, 20000 + Math.random() * 20000); }; tpFlowTimer = setTimeout(tick, 20000 + Math.random() * 20000); }
  function tpStopFlow() { clearTimeout(tpFlowTimer); tpFlowTimer = null; }
  new MutationObserver(() => { if (tpPage.hidden) tpStopFlow(); else { tpPick(); tpStartFlow(); } }).observe(tpPage, { attributes: true, attributeFilter: ['hidden'] });
  document.getElementById('tp-refresh').addEventListener('click', () => { if (editingNow()) return; tpPick(); });
  onLongPress(document.getElementById('tp-knock-area'), tpKnock, 350);
  document.getElementById('tp-add').addEventListener('click', () => { if (!window.openModal) return; window.openModal('添加状态字卡', '', (v) => { if (v) { const a = tpCards(); a.push(v); tpSave(a); toast('已添加'); } }); });
  function tpSendOn() { const s = curStore(); try { return s.get('tongpin-send-chat') !== '0'; } catch (e) { return true; } }
  const tpSendBtn = document.getElementById('tp-send');
  if (tpSendBtn) { tpSendBtn.textContent = '发到聊天：' + (tpSendOn() ? '开' : '关'); tpSendBtn.addEventListener('click', () => { const s = curStore(); const on = !tpSendOn(); if (s) try { s.set('tongpin-send-chat', on ? '1' : '0'); } catch (e) {} tpSendBtn.textContent = '发到聊天：' + (on ? '开' : '关'); }); }

  // ---- 伸手页 ----
  const DEF_WHISPER = ['被你抓到了', '嗯，在', '刚路过你', '我在', '摸到了吧', '没走远'];
  const ssPage = document.createElement('div');
  ssPage.className = 'page'; ssPage.id = 'page-shenshou'; ssPage.hidden = true;
  ssPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="ss-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">伸手</span></div>' +
    '<div class="ss-body">' +
      '<div class="ss-area" id="ss-area"><div class="ss-glow" id="ss-glow"></div><div class="ss-hint" id="ss-hint">长按 · 伸手去摸身边</div></div>' +
      '<div class="ss-result" id="ss-result"></div>' +
      '<div class="ss-count" id="ss-count">摸到 0 次</div>' +
      '<button class="ss-add" id="ss-add">+ 添加悄悄话字卡</button><button class="ss-send-btn" id="ss-send">发到聊天：开</button>' +
    '</div>';
  host.appendChild(ssPage);

  function ssCards() { const s = curStore(); if (!s) return DEF_WHISPER.slice(); try { const a = JSON.parse(s.get('shenshou-cards') || '[]'); return a.length ? a : DEF_WHISPER.slice(); } catch (e) { return DEF_WHISPER.slice(); } }
  function ssSave(a) { const s = curStore(); if (s) try { s.set('shenshou-cards', JSON.stringify(a)); } catch (e) {} }
  function ssCount() { const s = curStore(); if (!s) return 0; try { return parseInt(s.get('shenshou-count') || '0', 10) || 0; } catch (e) { return 0; } }
  function ssSetCount(n) { const s = curStore(); if (s) try { s.set('shenshou-count', '' + n); } catch (e) {} }
  function ssRenderCount() { const el = document.getElementById('ss-count'); if (el) el.textContent = '摸到 ' + ssCount() + ' 次'; }
  const SS_FEEL = [
    { label: '温热', vib: [80], cls: 'hot', cards: ['好暖', '嗯，在', '靠着你', '体温'] },
    { label: '微凉', vib: [30], cls: 'cold', cards: ['有点凉', '刚吹过风', '指尖凉'] },
    { label: '发丝', vib: [10, 20, 10], cls: 'soft', cards: ['痒痒的', '发丝擦过', '轻轻的'] }
  ];
  function ssSendOn() { const s = curStore(); try { return s.get('shenshou-send-chat') !== '0'; } catch (e) { return true; } }
  function ssTry() {
    if (editingNow()) return;
    const hint = document.getElementById('ss-hint'); if (hint) hint.textContent = '正在伸手…';
    const glow = document.getElementById('ss-glow'); if (glow) glow.classList.add('reach');
    setTimeout(() => {
      if (glow) glow.classList.remove('reach');
      if (Math.random() < 0.55) {
        const feel = SS_FEEL[Math.floor(Math.random() * SS_FEEL.length)];
        const cards = feel.cards.concat(ssCards());
        const txt = cards[Math.floor(Math.random() * cards.length)];
        vibrate(feel.vib);
        if (glow) { glow.classList.add('on'); glow.classList.add(feel.cls); }
        if (hint) hint.textContent = '摸到了 · ' + feel.label;
        const res = document.getElementById('ss-result'); if (res) { res.textContent = feel.label + ' · \u201c' + txt + '\u201d'; res.className = 'ss-result reach'; }
        ssSetCount(ssCount() + 1); ssRenderCount();
        if (ssSendOn() && window.chatAddIn) { try { window.chatAddIn(txt); } catch (e) {} }
        setTimeout(() => { if (glow) { glow.classList.remove('on'); glow.classList.remove(feel.cls); } }, 1400);
      } else {
        if (glow) glow.classList.add('dim');
        if (hint) hint.textContent = '什么都没有';
        const res = document.getElementById('ss-result'); if (res) { res.textContent = '…'; res.className = 'ss-result miss'; }
        setTimeout(() => { if (glow) glow.classList.remove('dim'); }, 1200);
      }
    }, 700);
  }
  // 他主动碰你：进页面时按概率 / 久未进去后高概率，留一道光痕 + 一句悄悄话
  function ssMaybePassive() {
    const s = curStore(); if (!s) return;
    let last = 0; try { last = parseInt(s.get('shenshou-last-visit') || '0', 10) || 0; } catch (e) {}
    const gap = Date.now() - last;
    try { s.set('shenshou-last-visit', '' + Date.now()); } catch (e) {}
    const prob = gap > 6 * 3600000 ? 0.7 : 0.25;
    if (Math.random() >= prob) return;
    const cards = ssCards();
    const txt = cards[Math.floor(Math.random() * cards.length)];
    vibrate(30);
    const area = document.getElementById('ss-area');
    if (area) { const tr = document.createElement('div'); tr.className = 'ss-trace'; area.appendChild(tr); setTimeout(() => { try { tr.remove(); } catch (e) {} }, 1600); }
    const hint = document.getElementById('ss-hint'); if (hint) hint.textContent = window.taFit ? window.taFit('他刚才碰了你一下') : '他刚才碰了你一下';
    const res = document.getElementById('ss-result'); if (res) { res.textContent = '\u201c' + txt + '\u201d'; res.className = 'ss-result reach'; }
  }
  if (ssApp) ssApp.addEventListener('click', () => { if (editingNow()) return; openPage(ssPage); ssRenderCount(); ssMaybePassive(); });
  document.getElementById('ss-back').addEventListener('click', () => backHome(ssPage));
  onLongPress(document.getElementById('ss-area'), ssTry, 500);
  document.getElementById('ss-add').addEventListener('click', () => { if (!window.openModal) return; window.openModal('添加悄悄话字卡', '', (v) => { if (v) { const a = ssCards(); a.push(v); ssSave(a); toast('已添加'); } }); });
  const ssSendBtn = document.getElementById('ss-send');
  if (ssSendBtn) { ssSendBtn.textContent = '发到聊天：' + (ssSendOn() ? '开' : '关'); ssSendBtn.addEventListener('click', () => { const s = curStore(); const on = !ssSendOn(); if (s) try { s.set('shenshou-send-chat', on ? '1' : '0'); } catch (e) {} ssSendBtn.textContent = '发到聊天：' + (on ? '开' : '关'); }); }

  // ---- 喝水页 ----
  const DEF_WATER_MSGS = ['该喝水了', '别忘了喝水', '喝口水吧', '你今天水喝够了吗'];
  const DEF_WATER_PRAISE = ['今天喝够啦', '真棒', '完成了', '好乖'];
  const DEF_WATER_ENCOURAGE = ['再来一杯', '继续', '嗯', '快了'];
  const DEF_WATER_TA = ['TA 说：{m}', 'TA 让我提醒你：{m}', 'TA 念着：{m}', 'TA 托我带句话：{m}'];
  // 世界观：他视角提醒（灵体在身边，字卡语态）；偶尔出得不准配温柔解读
  const DEF_WATER_TA_GENTLE = ['水凉了，喝一口？', '你忘了吧，喝一口', '我在呢，先喝口水', '嗯，去喝一口好不好', '别忙忘了喝水'];
  const waterPage = document.createElement('div');
  waterPage.className = 'page'; waterPage.id = 'page-water'; waterPage.hidden = true;
  waterPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="water-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">喝水</span></div>' +
    '<div class="water-body">' +
      '<div class="water-card glass">' +
        '<div class="water-num" id="water-num">0</div>' +
        '<div class="water-unit" id="water-unit">0 杯 · 0 ml / <span id="water-goal-text">8</span> 杯</div>' +
        '<div class="water-bar"><div class="water-fill" id="water-fill"></div></div>' +
        '<div class="water-cups" id="water-cups"></div>' +
      '</div>' +
      '<div class="water-week" id="water-week"></div>' +
      '<div class="water-streak" id="water-streak"></div>' +
      '<div class="water-btns"><button class="water-minus" id="water-minus">−1</button><button class="water-plus" id="water-plus">+1</button></div>' +
      '<div class="water-msg glass" id="water-msg">点 +1 记一杯</div>' +
      '<div class="water-actions">' +
        '<button class="water-send" id="water-send">发到聊天</button>' +
        '<button class="water-ta" id="water-ta">' + (window.taFit ? window.taFit('TA 提醒') : 'TA 提醒') + '</button>' +
      '</div>' +
      '<div class="water-manage"><button class="water-set-goal" id="water-set-goal">设目标</button><button class="water-set-size" id="water-set-size">单次量</button><button class="water-add-msg" id="water-add-msg">+ 提醒字卡</button></div>' +
    '</div>';
  host.appendChild(waterPage);

  function waterDayStr(offset) { const d = new Date(); if (offset) d.setDate(d.getDate() + offset); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function waterToday() { const s = curStore(); if (!s) return { date: '', count: 0 }; try { const o = JSON.parse(s.get('water-today') || '{}'); const today = waterDayStr(0); if (o.date !== today) return { date: today, count: 0 }; return { date: today, count: o.count || 0 }; } catch (e) { return { date: '', count: 0 }; } }
  function waterHistory() { const s = curStore(); if (!s) return {}; try { return JSON.parse(s.get('water-history') || '{}') || {}; } catch (e) { return {}; } }
  function waterSave(count) {
    const s = curStore(); if (!s) return;
    const today = waterDayStr(0);
    try { s.set('water-today', JSON.stringify({ date: today, count: count })); } catch (e) {}
    try {
      const h = waterHistory(); h[today] = count;
      const keys = Object.keys(h).sort();
      while (keys.length > 15) { delete h[keys.shift()]; }
      s.set('water-history', JSON.stringify(h));
    } catch (e) {}
    try {
      const g = waterGoal();
      let st = null; try { st = JSON.parse(s.get('water-streak') || 'null'); } catch (e) {}
      const y = waterDayStr(-1);
      if (count >= g) {
        if (st && st.date === y) st = { date: today, n: (st.n || 0) + 1 };
        else if (st && st.date === today) { /* 今日已记 */ }
        else st = { date: today, n: 1 };
        s.set('water-streak', JSON.stringify(st));
      } else if (st && st.date === today) {
        s.set('water-streak', JSON.stringify({ date: y, n: Math.max(0, (st.n || 1) - 1) }));
      }
    } catch (e) {}
  }
  function waterGoal() { const s = curStore(); try { return parseInt(s.get('water-goal') || '8', 10) || 8; } catch (e) { return 8; } }
  function waterSetGoal(n) { const s = curStore(); if (s) try { s.set('water-goal', '' + n); } catch (e) {} }
  function waterSize() { const s = curStore(); try { return parseInt(s.get('water-size') || '250', 10) || 250; } catch (e) { return 250; } }
  function waterSetSize(n) { const s = curStore(); if (s) try { s.set('water-size', '' + n); } catch (e) {} }
  function waterMsgs() { const s = curStore(); if (!s) return DEF_WATER_MSGS.slice(); try { const a = JSON.parse(s.get('water-msgs') || '[]'); return a.length ? a : DEF_WATER_MSGS.slice(); } catch (e) { return DEF_WATER_MSGS.slice(); } }
  function waterSaveMsgs(a) { const s = curStore(); if (s) try { s.set('water-msgs', JSON.stringify(a)); } catch (e) {} }
  function waterRender() {
    const t = waterToday(); const g = waterGoal(); const sz = waterSize();
    const el = document.getElementById('water-num'); if (el) el.textContent = t.count;
    const gt = document.getElementById('water-goal-text'); if (gt) gt.textContent = g;
    const unit = document.getElementById('water-unit'); if (unit) unit.textContent = t.count + ' 杯 · ' + (t.count * sz) + ' ml / ' + g + ' 杯 · ' + (g * sz) + ' ml';
    const fill = document.getElementById('water-fill'); if (fill) fill.style.width = Math.min(100, t.count / g * 100) + '%';
    waterRenderCups(t.count, g);
    waterRenderWeek();
    waterRenderStreak();
    waterSave(t.count);
  }
  function waterRenderCups(count, goal) {
    const box = document.getElementById('water-cups'); if (!box) return;
    const max = Math.max(1, Math.min(goal, 8));
    let html = '';
    for (let i = 0; i < max; i++) html += '<i class="water-cup' + (i < count ? ' on' : '') + '"></i>';
    box.innerHTML = html;
  }
  function waterRenderWeek() {
    const box = document.getElementById('water-week'); if (!box) return;
    const h = waterHistory(); const g = waterGoal(); const today = waterDayStr(0);
    let html = '';
    for (let i = 6; i >= 0; i--) {
      const ds = waterDayStr(-i);
      const c = h[ds] || 0;
      const pct = g ? Math.min(100, Math.round(c / g * 100)) : 0;
      const todayCls = ds === today ? ' today' : '';
      const hitCls = c > 0 ? (c >= g ? ' hit' : ' ok') : ' miss';
      const taMark = (function () { const ss = curStore(); return ss && ss.get('water-ta-mark:' + ds) === '1'; })();
      const taCls = taMark ? ' ta' : '';
      html += '<div class="water-col' + todayCls + hitCls + taCls + '"><i style="height:' + pct + '%"></i><b>' + (c || '') + '</b><em>' + ds.slice(8) + '</em></div>';
    }
    box.innerHTML = '<div class="water-week-title">近 7 天</div><div class="water-week-bars">' + html + '</div>';
  }
  function waterStreak() { const s = curStore(); if (!s) return null; try { return JSON.parse(s.get('water-streak') || 'null'); } catch (e) { return null; } }
  function waterRenderStreak() {
    const el = document.getElementById('water-streak'); if (!el) return;
    const st = waterStreak();
    if (!st || st.date !== waterDayStr(0) || !st.n) { el.textContent = ''; return; }
    el.textContent = '🔥 连续达标 ' + st.n + ' 天';
  }
  function waterShowMsg(txt) { const el = document.getElementById('water-msg'); if (el) { el.classList.add('fade'); setTimeout(() => { el.textContent = '\u201c' + txt + '\u201d'; el.classList.remove('fade'); }, 200); } }
  function waterMaybeRemind() {
    const s = curStore(); if (!s) return;
    let last = 0; try { last = parseInt(s.get('water-last-visit') || '0', 10) || 0; } catch (e) {}
    try { s.set('water-last-visit', '' + Date.now()); } catch (e) {}
    const t = waterToday(); const g = waterGoal();
    if (t.count < g && Date.now() - last > 2 * 3600000) {
      // 世界观：偶尔他视角浮层（灵体在身边提醒），否则原系统语态
      if (window.taChimeAllow && window.taChimeAllow('water-ta', { cooldown: 30 * 60 * 1000, dailyMax: 3 }) && Math.random() < 0.5) {
        window.taChimeUse('water-ta');
        const m = DEF_WATER_TA_GENTLE[Math.floor(Math.random() * DEF_WATER_TA_GENTLE.length)];
        const miss = Math.random() < 0.2 ? '（字卡有限，他想说的比这张多）' : null;
        if (window.taChimeShow) window.taChimeShow(m, { miss: miss });
      }
      const msgs = waterMsgs(); waterShowMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    }
    // 世界观：他替你记的那杯——每天低概率生成一个标记，柱状图上叠半透明格
    waterMaybeTaMark();
  }
  function waterMaybeTaMark() {
    if (!window.taChimeAllow || !window.taChimeAllow('water-ta-mark', { cooldown: 24 * 3600 * 1000, dailyMax: 1 })) return;
    if (Math.random() > 0.4) return;
    window.taChimeUse('water-ta-mark');
    const s = curStore(); if (!s) return;
    try { s.set('water-ta-mark:' + waterDayStr(0), '1'); } catch (e) {}
  }
  // 暴露给 calendar.js：该日期是否有喝水记录（日历打点）
  window.waterDayHas = function (ds) { try { const h = waterHistory(); return (h[ds] || 0) > 0; } catch (e) { return false; } };
  if (waterApp) waterApp.addEventListener('click', () => { if (editingNow()) return; openPage(waterPage); waterRender(); waterMaybeRemind(); });
  document.getElementById('water-back').addEventListener('click', () => backHome(waterPage));
  document.getElementById('water-plus').addEventListener('click', () => {
    if (editingNow()) return;
    const t = waterToday(); const g = waterGoal(); const n = t.count + 1;
    const justDone = t.count < g && n >= g;
    waterSave(n); waterRender();
    if (justDone) {
      vibrate([60, 40, 60]);
      const card = document.querySelector('#page-water .water-card');
      if (card) { card.classList.add('done'); setTimeout(() => card.classList.remove('done'), 900); }
      const p = DEF_WATER_PRAISE; waterShowMsg(p[Math.floor(Math.random() * p.length)]);
    }
    else if (Math.random() < 0.2) { const e = DEF_WATER_ENCOURAGE; waterShowMsg(e[Math.floor(Math.random() * e.length)]); }
  });
  document.getElementById('water-minus').addEventListener('click', () => {
    if (editingNow()) return;
    const t = waterToday(); if (t.count <= 0) return; waterSave(t.count - 1); waterRender();
  });
  document.getElementById('water-send').addEventListener('click', () => {
    if (editingNow()) return;
    const t = waterToday(); const g = waterGoal(); const sz = waterSize();
    const done = t.count >= g;
    const base = '我今天喝了 ' + t.count + ' / ' + g + ' 杯（' + (t.count * sz) + 'ml）';
    const tail = done ? '，' + DEF_WATER_PRAISE[Math.floor(Math.random() * DEF_WATER_PRAISE.length)] : '，还差 ' + (g - t.count) + ' 杯';
    if (window.chatAddIn) { try { window.chatAddIn(base + tail); } catch (e) {} }
    toast('已发送');
  });
  document.getElementById('water-ta').addEventListener('click', () => {
    if (editingNow()) return;
    const t = waterToday(); const g = waterGoal();
    const m = waterMsgs()[Math.floor(Math.random() * waterMsgs().length)];
    const fmt = DEF_WATER_TA[Math.floor(Math.random() * DEF_WATER_TA.length)].replace('{m}', m);
    const tail = t.count < g ? '（还差 ' + (g - t.count) + ' 杯）' : '（今天喝够啦）';
    const shown = window.taFit ? window.taFit(fmt + tail) : (fmt + tail);
    waterShowMsg(shown);
    if (window.chatAddIn) { try { window.chatAddIn(fmt + tail); } catch (e) {} }
  });
  document.getElementById('water-set-goal').addEventListener('click', () => { if (!window.openModal) return; window.openModal('设目标（杯）', String(waterGoal()), (v) => { if (v) { const n = parseInt(v, 10); if (n > 0 && n < 100) { waterSetGoal(n); waterRender(); toast('已设置'); } } }); });
  document.getElementById('water-set-size').addEventListener('click', () => { if (!window.openModal) return; window.openModal('单次容量（ml）', String(waterSize()), (v) => { if (v) { const n = parseInt(v, 10); if (n > 0 && n < 2000) { waterSetSize(n); waterRender(); toast('已设置'); } } }); });
  document.getElementById('water-add-msg').addEventListener('click', () => { if (!window.openModal) return; window.openModal('添加提醒字卡', '', (v) => { if (v) { const a = waterMsgs(); a.push(v); waterSaveMsgs(a); toast('已添加'); } }); });

  // ---- 吃什么页 ----
  const DEF_EAT_DISHES = ['番茄炒蛋', '红烧肉', '清蒸鱼', '麻婆豆腐', '宫保鸡丁', '酸辣土豆丝', '蛋炒饭', '牛肉面', '饺子', '馄饨', '皮蛋瘦肉粥', '可乐鸡翅', '糖醋排骨', '清炒时蔬', '蛋花汤', '凉拌黄瓜', '回锅肉', '水煮肉片', '鱼香肉丝', '葱油拌面'];
  const DEF_EAT_COMMENTS = ['就吃这个吧', '听起来不错', '我想吃这个', '可以', '这个好吃', '嗯，就这个', '想吃'];
  const eatPage = document.createElement('div');
  eatPage.className = 'page'; eatPage.id = 'page-eat'; eatPage.hidden = true;
  eatPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="eat-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">吃什么</span></div>' +
    '<div class="eat-body">' +
      '<div class="eat-card glass"><div class="eat-label">今天吃</div><div class="eat-dish" id="eat-dish">…</div><div class="eat-comment" id="eat-comment">…</div></div>' +
      '<div class="eat-btns"><button class="eat-change" id="eat-change">换一个</button><button class="eat-send" id="eat-send">发到聊天</button></div>' +
      '<button class="eat-add" id="eat-add">+ 添加菜名</button>' +
    '</div>';
  host.appendChild(eatPage);

  function eatDishes() { const s = curStore(); let pool = DEF_EAT_DISHES.slice(); try { const a = JSON.parse((s && s.get('eat-cards')) || '[]'); if (Array.isArray(a)) a.forEach(d => { if (d && pool.indexOf(d) < 0) pool.push(d); }); } catch (e) {} return pool; }
  function eatSaveDishes(a) { const s = curStore(); if (s) try { s.set('eat-cards', JSON.stringify(a)); } catch (e) {} }
  function eatPick() {
    const dishes = eatDishes(); const dish = dishes[Math.floor(Math.random() * dishes.length)];
    const comments = DEF_EAT_COMMENTS; const comment = comments[Math.floor(Math.random() * comments.length)];
    const de = document.getElementById('eat-dish'); const ce = document.getElementById('eat-comment');
    if (de) { de.classList.add('fade'); setTimeout(() => { de.textContent = dish; de.classList.remove('fade'); }, 200); }
    if (ce) { ce.classList.add('fade'); setTimeout(() => { ce.textContent = '\u201c' + comment + '\u201d'; ce.classList.remove('fade'); }, 200); }
    return dish + ' · ' + comment;
  }
  let eatLastPick = '';
  if (eatApp) eatApp.addEventListener('click', () => { if (editingNow()) return; openPage(eatPage); eatLastPick = eatPick(); });
  document.getElementById('eat-back').addEventListener('click', () => backHome(eatPage));
  document.getElementById('eat-change').addEventListener('click', () => { if (editingNow()) return; eatLastPick = eatPick(); });
  document.getElementById('eat-send').addEventListener('click', () => { if (editingNow()) return; if (eatLastPick && window.chatAddIn) { try { window.chatAddIn(eatLastPick); } catch (e) {} toast('已发送'); } });
  document.getElementById('eat-add').addEventListener('click', () => { if (!window.openModal) return; window.openModal('添加菜名', '', (v) => { if (v) { const a = eatDishes(); a.push(v); eatSaveDishes(a.filter(d => d)); toast('已添加'); } }); });

  // ---- 番茄钟页 ----
  // 专注/小憩/长休三档倒计时 + 圆环进度；完成专注记一个 🍅（今日/累计），可发到聊天。
  // 计时基于 endAt 时间戳（不依赖 interval 精度），离开页面后台照走、熄屏回来时间正确。
  const DEF_POMO_PRAISE = ['专注的你最棒了', '认真的人最好看', '加油，我在陪你', '嗯嗯，我安静陪着', '专注完抱一下'];
  // 世界观：他此刻近时，专注完成用近状态语（灵体在旁边静静陪）
  const DEF_POMO_NEAR = ['你专注的时候，我就静静待在旁边', '认真完啦，过来靠靠你', '我一直在旁边看着你呢', '专注完啦，抱一下', '你在认真，我在旁边，挺好'];
  const POMO_MODES = { focus: { name: '专注', def: 25 }, short: { name: '小憩', def: 5 }, long: { name: '长休', def: 15 } };
  const POMO_RING_C = 552.92; // 2π×88 圆环周长
  const pomoPage = document.createElement('div');
  pomoPage.className = 'page'; pomoPage.id = 'page-pomodoro'; pomoPage.hidden = true;
  pomoPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="pomo-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">番茄钟</span></div>' +
    '<div class="pomo-body">' +
      '<div class="pomo-card glass">' +
        '<div class="pomo-tabs"><button class="pomo-tab sel" data-pmode="focus">专注</button><button class="pomo-tab" data-pmode="short">小憩</button><button class="pomo-tab" data-pmode="long">长休</button></div>' +
        '<div class="pomo-dial">' +
          '<svg class="pomo-ring" viewBox="0 0 200 200"><circle class="pomo-ring-bg" cx="100" cy="100" r="88"/><circle class="pomo-ring-fill" id="pomo-ring" cx="100" cy="100" r="88"/></svg>' +
          '<div class="pomo-center"><div class="pomo-time" id="pomo-time">25:00</div><div class="pomo-state" id="pomo-state">准备专注</div></div>' +
          '<div class="pomo-spark" id="pomo-spark"></div>' +
        '</div>' +
      '</div>' +
      '<div class="pomo-btns"><button class="pomo-start" id="pomo-start">开始</button><button class="pomo-reset" id="pomo-reset">重置</button></div>' +
      '<button class="pmp-go" id="pomo-companion">🍅 陪伴模式</button>' +
      '<div class="pomo-msg glass" id="pomo-msg">点开始，专注一会儿</div>' +
      '<div class="pomo-stats" id="pomo-stats">今日 🍅 × 0 · 累计 0 个</div>' +
      '<div class="pomo-manage"><button class="pomo-set-dur" id="pomo-set-dur">设时长</button><button class="pomo-add-msg" id="pomo-add-msg">+ 夸夸字卡</button><button class="tp-send-btn pomo-send-btn" id="pomo-send">发到聊天：开</button></div>' +
    '</div>';
  host.appendChild(pomoPage);

  function pomoCfg() {
    let c = null;
    try { c = JSON.parse((curStore() && curStore().get('pomo-cfg')) || '{}'); } catch (e) {}
    const ok = (n, d) => (n && n >= 1 && n <= 180 ? n : d);
    return {
      f: ok(c && c.f, POMO_MODES.focus.def),
      s: ok(c && c.s, POMO_MODES.short.def),
      l: ok(c && c.l, POMO_MODES.long.def)
    };
  }
  function pomoSetCfg(c) { const s = curStore(); if (s) try { s.set('pomo-cfg', JSON.stringify(c)); } catch (e) {} }
  function pomoModeMin(m) { const c = pomoCfg(); return m === 'focus' ? c.f : m === 'short' ? c.s : c.l; }
  function pomoTodayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function pomoToday() {
    const s = curStore();
    try { const o = JSON.parse((s && s.get('pomo-today')) || '{}'); if (o.date === pomoTodayKey()) return { date: o.date, count: o.count || 0 }; } catch (e) {}
    return { date: pomoTodayKey(), count: 0 };
  }
  function pomoSaveToday(t) { const s = curStore(); if (s) try { s.set('pomo-today', JSON.stringify(t)); } catch (e) {} }
  function pomoTotal() { const s = curStore(); try { return parseInt((s && s.get('pomo-total')) || '0', 10) || 0; } catch (e) { return 0; } }
  function pomoSaveTotal(n) { const s = curStore(); if (s) try { s.set('pomo-total', '' + n); } catch (e) {} }
  function pomoCustomMsgs() { const s = curStore(); try { const a = JSON.parse((s && s.get('pomo-msgs')) || '[]'); if (Array.isArray(a)) return a; } catch (e) {} return []; }
  function pomoSaveMsgs(a) { const s = curStore(); if (s) try { s.set('pomo-msgs', JSON.stringify(a)); } catch (e) {} }
  function pomoPool() { return DEF_POMO_PRAISE.concat(pomoCustomMsgs()); }
  function pomoSendOn() { const s = curStore(); try { return s.get('pomo-send-chat') !== '0'; } catch (e) { return true; } }

  let pomoMode = 'focus';
  let pomoRunning = false;
  let pomoEndAt = 0;
  let pomoRemainMs = 0;
  let pomoTickTimer = null;

  function pomoRender() {
    const totalMs = pomoModeMin(pomoMode) * 60000;
    const remain = Math.max(0, Math.min(totalMs, pomoRunning ? pomoEndAt - Date.now() : (pomoRemainMs > 0 ? pomoRemainMs : totalMs)));
    const sec = Math.ceil(remain / 1000);
    const te = document.getElementById('pomo-time');
    if (te) te.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    const ring = document.getElementById('pomo-ring');
    if (ring) ring.style.strokeDashoffset = String(POMO_RING_C * (1 - remain / totalMs));
    const st = document.getElementById('pomo-state');
    if (st) st.textContent = pomoRunning ? (pomoMode === 'focus' ? '专注中…' : '休息中…') : (remain < totalMs ? '已暂停' : '准备' + POMO_MODES[pomoMode].name);
    const sb = document.getElementById('pomo-start');
    if (sb) sb.textContent = pomoRunning ? '暂停' : (remain < totalMs ? '继续' : '开始');
    document.querySelectorAll('#page-pomodoro .pomo-tab').forEach(t2 => t2.classList.toggle('sel', t2.dataset.pmode === pomoMode));
    const t = pomoToday();
    const stats = document.getElementById('pomo-stats');
    if (stats) stats.textContent = '今日 🍅 × ' + t.count + ' · 累计 ' + pomoTotal() + ' 个';
    pmpRefreshGoBtn();
    if (pmpActive()) pmpRefreshBar();
    // 世界观：专注运行时圆环上叠一个缓慢游走的光点（他在旁边静静陪）
    const spark = document.getElementById('pomo-spark');
    if (spark) spark.classList.toggle('on', pomoRunning && pomoMode === 'focus');
  }
  function pomoStopTick() { clearInterval(pomoTickTimer); pomoTickTimer = null; }
  function pomoStartTick() {
    pomoStopTick();
    pomoTickTimer = setInterval(() => {
      if (!pomoRunning) return;
      if (Date.now() >= pomoEndAt) { pomoComplete(); return; }
      pomoRender();
    }, 250);
  }
  function pomoShowMsg(txt) { const el = document.getElementById('pomo-msg'); if (el) { el.classList.add('fade'); setTimeout(() => { el.textContent = '\u201c' + txt + '\u201d'; el.classList.remove('fade'); }, 200); } }
  function pomoIdleAt(m) { if (pmpActive()) pmpDetach(); pomoRunning = false; pomoRemainMs = 0; pomoEndAt = 0; pomoStopTick(); pomoMode = m; pomoRender(); }
  function pomoComplete() {
    vibrate([120, 60, 120]);
    if (pomoMode === 'focus') {
      const mins = pomoModeMin('focus');
      const t = pomoToday(); t.count++; pomoSaveToday(t);
      pomoSaveTotal(pomoTotal() + 1);
      // 世界观：他此刻近时，70% 用近状态语（灵体在旁边静静陪），否则原夸夸字卡
      const near = window.taIsNear && window.taIsNear();
      let praise;
      if (near && Math.random() < 0.7) praise = DEF_POMO_NEAR[Math.floor(Math.random() * DEF_POMO_NEAR.length)];
      else { const pool = pomoPool(); praise = pool[Math.floor(Math.random() * pool.length)]; }
      const brk = t.count % 4 === 0 ? 'long' : 'short';
      const wasPmp = pmpActive();
      if (wasPmp) {
        try { pmpCAdd('ta', PMP_DONE[Math.floor(Math.random() * PMP_DONE.length)]); } catch (e) {}
        pmpFlash('\u2705 完成 +1 🍅');
        pmpDetach();
      }
      pomoIdleAt(brk);
      pomoShowMsg(POMO_MODES[brk].name + ' ' + pomoModeMin(brk) + ' 分钟 · ' + praise);
      if (!wasPmp && pomoSendOn() && window.chatAddIn) { try { window.chatAddIn('🍅 完成了 ' + mins + ' 分钟专注，去休息一会儿'); } catch (e) {} }
    } else {
      pomoIdleAt('focus');
      pomoShowMsg('休息好了，来下一个番茄吧');
    }
  }
  if (pomoApp) pomoApp.addEventListener('click', () => { if (editingNow()) return; openPage(pomoPage); pomoRender(); });
  document.getElementById('pomo-back').addEventListener('click', () => backHome(pomoPage));
  document.getElementById('pomo-start').addEventListener('click', () => {
    if (editingNow()) return;
    if (pomoRunning) {
      pomoRemainMs = Math.max(0, pomoEndAt - Date.now());
      pomoRunning = false; pomoStopTick(); pomoRender(); pmpSyncFromEngine();
      return;
    }
    const totalMs = pomoModeMin(pomoMode) * 60000;
    const remain = pomoRemainMs > 0 && pomoRemainMs < totalMs ? pomoRemainMs : totalMs;
    pomoEndAt = Date.now() + remain;
    pomoRunning = true; pomoStartTick(); pomoRender(); pmpSyncFromEngine();
  });
  document.getElementById('pomo-reset').addEventListener('click', () => { pomoIdleAt(pomoMode); });
  pomoPage.querySelectorAll('.pomo-tab').forEach(t2 => t2.addEventListener('click', () => {
    if (t2.dataset.pmode === pomoMode) return;
    pomoIdleAt(t2.dataset.pmode);
  }));
  document.getElementById('pomo-set-dur').addEventListener('click', () => {
    if (!window.openModal) return;
    const c = pomoCfg();
    window.openModal('设时长（分钟）', c.f + ',' + c.s + ',' + c.l, (v) => {
      if (!v) return;
      const p = String(v).split(/[,,\s]+/).map(x => parseInt(x, 10));
      if (p.length < 3 || p.some(n => !(n >= 1 && n <= 180))) { toast('格式：25,5,15（各 1-180）'); return; }
      pomoSetCfg({ f: p[0], s: p[1], l: p[2] });
      pomoIdleAt(pomoMode);
      toast('已设置');
    }, { placeholder: '专注,小憩,长休 如 25,5,15' });
  });
  document.getElementById('pomo-add-msg').addEventListener('click', () => {
    if (!window.openModal) return;
    window.openModal('添加夸夸字卡', '', (v) => { if (v) { const a = pomoCustomMsgs(); a.push(v); pomoSaveMsgs(a); toast('已添加'); } });
  });
  const pomoSendBtn = document.getElementById('pomo-send');
  if (pomoSendBtn) {
    pomoSendBtn.textContent = '发到聊天：' + (pomoSendOn() ? '开' : '关');
    pomoSendBtn.addEventListener('click', () => { const s = curStore(); const on = !pomoSendOn(); if (s) try { s.set('pomo-send-chat', on ? '1' : '0'); } catch (e) {} pomoSendBtn.textContent = '发到聊天：' + (on ? '开' : '关'); });
  }

  // ---- 存钱罐页 ----
  // 世界观：两个人一起攒的小金库（所有桌面/联系人共用一份，同 period/fish-log 全局先例）；
  // TA 是灵体，久未打开时有概率「塞给你」一枚硬币——纯彩蛋提示不入账，由你决定要不要存；
  // 存钱/取钱时用碎碎念字卡回应，攒够目标会庆祝。
  const DEF_PIGGY_IN = ['叮～又攒下一点啦', '小猪替你收好了', '离目标更近了哦', '嗯嗯，我看着呢', '慢慢攒，不着急'];
  const DEF_PIGGY_OUT = ['该花的花，别太省', '买什么了呀？', '咦，少了一点点', '没关系，再攒回来'];
  const DEF_PIGGY_FULL = ['我们存够啦！！', '目标达成，真棒', '攒够了！想好怎么花了吗'];
  // 里程碑（存到目标的 25/50/75% 时各庆祝一次，标记存在心愿对象上防重复）
  const PIGGY_MS = [{ p: 25, t: '已经攒到四分之一啦' }, { p: 50, t: '过半啦，好厉害' }, { p: 75, t: '就差一点点了' }];
  // 取款后 TA 的关心追问（可回复一句）
  const PIGGY_CARE = ['花在哪了呀？', '买什么了？跟我说说嘛', '没乱花钱吧？', '钱去哪啦，说来听听'];
  const PIGGY_TA_COINS = [0.52, 5.2, 5.21, 6.66, 8.88, 9.99, 13.14];
  const PIGGY_TA_NOTES = ['偷偷塞了一点', '给你也存了一份', '嘿嘿，别问哪来的'];
  const piggyPage = document.createElement('div');
  piggyPage.className = 'page'; piggyPage.id = 'page-piggy'; piggyPage.hidden = true;
  piggyPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="piggy-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">存钱罐</span></div>' +
    '<div class="piggy-body">' +
      '<div class="piggy-hero glass"><div class="piggy-goal-name" id="piggy-goal-name">先设个小目标吧</div><div class="piggy-bal" id="piggy-bal"><i>¥</i>0.00</div><div class="piggy-bar"><div class="piggy-fill" id="piggy-fill"></div></div><div class="piggy-sub" id="piggy-sub">每一笔都算数</div></div>' +
      '<div class="piggy-btns"><button class="piggy-out" id="piggy-out">取一笔</button><button class="piggy-in" id="piggy-in">存一笔</button></div>' +
      '<div class="piggy-msg glass" id="piggy-msg">小猪替你保管着呢</div>' +
      '<div class="piggy-share glass" id="piggy-share" hidden><div class="piggy-reply-q" id="piggy-share-title">谁来监督这个心愿？（可多选）</div><div class="piggy-share-chips" id="piggy-share-chips"></div><div class="piggy-reply-row"><button class="piggy-reply-send" id="piggy-share-ok">保存心愿</button><button class="piggy-reply-skip" id="piggy-share-cancel">取消</button></div></div>' +
      '<div class="piggy-reply glass" id="piggy-reply" hidden><div class="piggy-reply-q" id="piggy-reply-q"></div><div class="piggy-reply-row"><input class="piggy-reply-in" id="piggy-reply-in" type="text" maxlength="40" placeholder="回一句给TA（可不填）"><button class="piggy-reply-send" id="piggy-reply-send">发送</button><button class="piggy-reply-skip" id="piggy-reply-skip">不用啦</button></div></div>' +
      '<div class="piggy-goals glass" id="piggy-goals"></div>' +
      '<div class="piggy-hist glass" id="piggy-hist"></div>' +
      '<div class="piggy-manage"><button class="piggy-set-goal" id="piggy-set-goal">＋ 新小心愿</button><button class="piggy-add-msg" id="piggy-add-msg">+ TA的碎碎念</button></div>' +
    '</div>';
  host.appendChild(piggyPage);

  function piggyEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function piggyFmt(n) { try { return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return (Math.round(n * 100) / 100).toFixed(2); } }
  // 输入容错：全角数字先转半角（部分输入法默认全角），只留数字和点，两位小数，0 < n ≤ 9,999,999
  function piggyAmt(v) {
    const s = String(v == null ? '' : v).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)).trim().replace(/[^\d.]/g, '');
    const n = Math.round(parseFloat(s) * 100) / 100;
    return (n > 0 && n <= 9999999) ? n : 0;
  }
  // 全局 store：根命名空间 xy-home-v2:*（所有联系人桌面读写同一份数据；xyStore.set 自动双写 IDB）
  function piggyStore() { try { return window.xyStore('xy-home-v2'); } catch (e) { return null; } }
  function piggyLog() { const s = piggyStore(); try { const a = JSON.parse(s.get('piggy-log') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function piggySaveLog(a) { const s = piggyStore(); if (s) try { s.set('piggy-log', JSON.stringify(a)); } catch (e) {} }
  function piggyBal(a) { let n = 0; (a || piggyLog()).forEach(x => { n += (x && x.type === 'out' ? -1 : 1) * ((x && x.amt) || 0); }); return Math.round(n * 100) / 100; }
  // 心愿单（多目标）：piggy-goals = [{n,a,ms:[已庆祝里程碑],done}]；余额全罐共享，
  // 每个心愿各自算进度。老单目标（piggy-goal-name/am）首次读取时自动迁移。
  function piggyGoals() {
    const s = piggyStore(); let a = null;
    try { a = JSON.parse(s.get('piggy-goals') || 'null'); } catch (e) {}
    if (!Array.isArray(a)) {
      try {
        const gn = s.get('piggy-goal-name'); const ga = parseFloat(s.get('piggy-goal-amt')) || 0;
        a = (gn && ga > 0) ? [{ n: gn, a: ga }] : [];
      } catch (e) { a = []; }
    }
    return a.filter(function (g) { return g && g.n && (+g.a) > 0; }).map(function (g) {
      return {
        n: String(g.n), a: Math.round((+g.a) * 100) / 100,
        ms: Array.isArray(g.ms) ? g.ms.slice() : [], done: !!g.done,
        // 监督人/可见范围：[] 或缺省=所有桌面可见；['*']=全部；否则为联系人 id 列表
        by: Array.isArray(g.by) ? g.by.filter(function (x) { return x && typeof x === 'string'; }) : []
      };
    });
  }
  function piggySaveGoals(a) { const s = piggyStore(); if (s) try { s.set('piggy-goals', JSON.stringify(a)); } catch (e) {} }
  function piggyCur() { const s = piggyStore(); try { return parseInt(s.get('piggy-goal-cur') || '0', 10) || 0; } catch (e) { return 0; } }
  function piggySetCur(i) { const s = piggyStore(); if (s) try { s.set('piggy-goal-cur', '' + i); } catch (e) {} }
  // 心愿是否在当前桌面可见（全局金库，但心愿可指定只给某些联系人看）
  function piggyGoalVisible(g) {
    if (!g.by || !g.by.length) return true;
    const cid = window.__activeCid || 'default';
    return g.by.indexOf('*') >= 0 || g.by.indexOf(cid) >= 0;
  }
  function piggyContactName(cid) {
    let l = [];
    try { l = window.getContacts ? window.getContacts() : []; } catch (e) {}
    for (let k = 0; k < l.length; k++) if (l[k] && l[k].id === cid) return l[k].name || cid;
    return cid;
  }
  // 当前桌面视角下的激活心愿：cur 游标指向全量数组下标，不可见时回退到第一个可见
  function piggyActive() {
    const all = piggyGoals();
    const vis = [];
    all.forEach(function (g, i) { if (piggyGoalVisible(g)) vis.push({ g: g, i: i }); });
    if (!vis.length) return { g: null, i: -1, all: all, vis: vis };
    const cur = piggyCur();
    let hit = null;
    for (let k = 0; k < vis.length; k++) if (vis[k].i === cur) { hit = vis[k]; break; }
    if (!hit) hit = vis[0];
    return { g: hit.g, i: hit.i, all: all, vis: vis };
  }
  function piggyUserCards() { const s = piggyStore(); try { const a = JSON.parse(s.get('piggy-cards') || '[]'); return Array.isArray(a) ? a.filter(x => x) : []; } catch (e) { return []; } }
  function piggySaveUserCards(a) { const s = piggyStore(); if (s) try { s.set('piggy-cards', JSON.stringify(a)); } catch (e) {} }
  function piggyPick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function piggyShowMsg(txt) { const el = document.getElementById('piggy-msg'); if (el) { el.classList.add('fade'); setTimeout(() => { el.textContent = '\u201c' + txt + '\u201d'; el.classList.remove('fade'); }, 200); } }
  function piggyInPool() { const u = piggyUserCards(); return u.length ? u.concat(DEF_PIGGY_IN) : DEF_PIGGY_IN.slice(); }
  let piggyHistAll = false; // 记录展开状态（false=最近6条，true=全部+按月分组）
  function piggyRowHtml(x) {
    const d = new Date((x && x.t) || Date.now());
    const ds = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const out = x && x.type === 'out';
    return '<div class="piggy-row"><span class="pr-amt ' + (out ? 'out' : 'in') + '">' + (out ? '\u2212' : '+') + '¥' + piggyFmt((x && x.amt) || 0) + '</span><span class="pr-note">' + piggyEsc((x && x.note) || (out ? '取出' : '存入')) + '</span><span class="pr-date">' + ds + '</span></div>';
  }
  function piggyRender() {
    const log = piggyLog(); const bal = piggyBal(log);
    const be = document.getElementById('piggy-bal'); if (be) be.innerHTML = '<i>¥</i>' + piggyFmt(bal < 0 ? 0 : bal);
    const act = piggyActive(); const g = act.g;
    const ne = document.getElementById('piggy-goal-name');
    const fill = document.getElementById('piggy-fill');
    const sub = document.getElementById('piggy-sub');
    if (g) {
      const pct = Math.min(100, Math.max(0, Math.round(bal / g.a * 100)));
      if (ne) ne.textContent = (g.done ? '已达成 · ' : '小目标 · ') + g.n;
      if (fill) fill.style.width = pct + '%';
      if (sub) sub.textContent = g.done ? ('已存满 ' + piggyFmt(g.a) + '，换个小目标继续吧') : ('已存 ' + piggyFmt(Math.max(0, bal)) + ' / ' + piggyFmt(g.a) + '（' + pct + '%）');
    } else {
      if (ne) ne.textContent = '先设个小目标吧';
      if (fill) fill.style.width = '0';
      if (sub) sub.textContent = log.length ? ('已经攒了 ' + log.length + ' 笔啦') : '每一笔都算数';
    }
    // 心愿单（仅显示当前桌面可见的心愿）
    const glEl = document.getElementById('piggy-goals');
    if (glEl) {
      let h = '<div class="piggy-hist-top"><span class="piggy-hist-title">心愿单</span><button class="piggy-more" id="piggy-goal-add">＋ 添加</button></div>';
      if (!act.all.length) h += '<div class="piggy-empty">还没有小心愿，点右上角添加</div>';
      else if (!act.vis.length) h += '<div class="piggy-empty">这个桌面没有可见的心愿</div>';
      else act.vis.forEach(function (ent) {
        const gg = ent.g;
        const p = Math.min(100, Math.max(0, Math.round(bal / gg.a * 100)));
        const byTxt = (!gg.by || !gg.by.length) ? '监督：所有桌面' : '监督：' + piggyEsc(gg.by.map(piggyContactName).join('、'));
        h += '<div class="pg-row' + (ent.i === act.i ? ' cur' : '') + '" data-pick="' + ent.i + '">' +
          '<span class="pg-name' + (gg.done ? ' done' : '') + '"><span class="pg-nm">' + piggyEsc(gg.n) + (gg.done ? ' ✓' : '') + '</span><span class="pg-by">' + byTxt + '</span></span>' +
          '<span class="pg-bar"><i style="width:' + p + '%"></i></span><span class="pg-pct">' + p + '%</span>' +
          '<button class="pg-del" data-del="' + ent.i + '">✕</button></div>';
      });
      glEl.innerHTML = h;
    }
    // 记录（收起=最近6条倒序；全部=正序+按月分组小计）
    const hist = document.getElementById('piggy-hist');
    if (hist) {
      let body;
      if (!log.length) body = '<div class="piggy-empty">还没存过，投第一枚硬币吧</div>';
      else if (!piggyHistAll) {
        body = log.slice(-6).reverse().map(piggyRowHtml).join('');
      } else {
        const asc = log.slice().sort(function (a, b) { return (a && a.t || 0) - (b && b.t || 0); });
        const parts = []; let curKey = ''; let sum = 0;
        asc.forEach(function (x) {
          const d = new Date((x && x.t) || Date.now());
          const key = d.getFullYear() + '-' + d.getMonth();
          if (key !== curKey) {
            if (curKey !== '') parts.push('<div class="pr-sub">本月小结 · ' + (sum >= 0 ? '+' : '\u2212') + '¥' + piggyFmt(Math.abs(sum)) + '</div>');
            curKey = key; sum = 0;
            parts.push('<div class="pr-month">' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月</div>');
          }
          sum += ((x && x.type === 'out' ? -1 : 1) * ((x && x.amt) || 0));
          parts.push(piggyRowHtml(x));
        });
        parts.push('<div class="pr-sub">本月小结 · ' + (sum >= 0 ? '+' : '\u2212') + '¥' + piggyFmt(Math.abs(sum)) + '</div>');
        body = parts.join('');
      }
      hist.innerHTML = '<div class="piggy-hist-top"><span class="piggy-hist-title">存钱记录</span>' +
        (log.length ? '<button class="piggy-more" id="piggy-more">' + (piggyHistAll ? '只看最近' : '全部记录') + '</button>' : '') +
        '</div>' + body;
    }
  }
  function piggyAdd(type, amt, note) {
    const log = piggyLog(); log.push({ t: Date.now(), type: type, amt: amt, note: note || '' });
    piggySaveLog(log); piggyRender();
    const bal = piggyBal(log);
    const act = piggyActive(); const g = act.g;
    if (type !== 'out') {
      if (g && !g.done) {
        // 攒够当前心愿：标记达成 → 庆祝 → 自动切到下一个未完成的可见心愿
        if (bal >= g.a) {
          const gs = act.all;
          [25, 50, 75].forEach(function (m) { if (gs[act.i].ms.indexOf(m) < 0) gs[act.i].ms.push(m); });
          gs[act.i].done = true;
          piggySaveGoals(gs);
          vibrate([60, 40, 60]);
          piggyShowMsg(piggyPick(DEF_PIGGY_FULL));
          let nxt = -1;
          for (let k2 = 0; k2 < act.vis.length; k2++) { if (act.vis[k2].i !== act.i && !act.vis[k2].g.done) { nxt = act.vis[k2].i; break; } }
          if (nxt >= 0) piggySetCur(nxt);
          piggyRender();
          return;
        }
        // 里程碑 25/50/75%（各庆祝一次，取最高新达成的档）
        for (let k = PIGGY_MS.length - 1; k >= 0; k--) {
          const m = PIGGY_MS[k];
          if (bal >= g.a * m.p / 100 && g.ms.indexOf(m.p) < 0) {
            const gs = act.all; gs[act.i].ms.push(m.p); piggySaveGoals(gs);
            vibrate([40, 30, 40]);
            piggyShowMsg(m.t);
            return;
          }
        }
      }
      piggyShowMsg(piggyPick(piggyInPool()));
    } else {
      piggyShowMsg(piggyPick(DEF_PIGGY_OUT));
      piggyAskCare();
    }
  }
  // 取款后 TA 关心追问：内联回复框（发送=以我的身份发到聊天；也可忽略）
  function piggyAskCare() {
    const box = document.getElementById('piggy-reply');
    if (!box) return;
    const q = document.getElementById('piggy-reply-q');
    if (q) q.textContent = (window.taFit ? window.taFit('TA：' + PIGGY_CARE[Math.floor(Math.random() * PIGGY_CARE.length)]) : ('TA：' + PIGGY_CARE[Math.floor(Math.random() * PIGGY_CARE.length)]));
    const inp = document.getElementById('piggy-reply-in'); if (inp) inp.value = '';
    box.hidden = false;
  }
  function piggyCloseCare() { const b = document.getElementById('piggy-reply'); if (b) b.hidden = true; }
  // 打开时 TA 有概率「塞给你」一枚硬币：越久没来概率越高。只是心意彩蛋——
  // 不写进真实存钱账目，只提示你替 TA 存进去，由你自己决定。
  function piggyMaybeTa() {
    const s = piggyStore(); if (!s) return;
    let last = 0; try { last = parseInt(s.get('piggy-last-visit') || '0', 10) || 0; } catch (e) {}
    const gap = Date.now() - last;
    try { s.set('piggy-last-visit', '' + Date.now()); } catch (e) {}
    const prob = gap > 12 * 3600000 ? 0.45 : (gap > 3600000 ? 0.25 : 0.12);
    if (Math.random() >= prob) return;
    const amt = PIGGY_TA_COINS[Math.floor(Math.random() * PIGGY_TA_COINS.length)];
    const note = PIGGY_TA_NOTES[Math.floor(Math.random() * PIGGY_TA_NOTES.length)];
    vibrate([20, 60, 20]);
    setTimeout(() => { piggyShowMsg(window.taFit ? window.taFit(note + ' ¥' + piggyFmt(amt) + ' · 替TA存进去？') : (note + ' ¥' + piggyFmt(amt) + ' · 替TA存进去？')); }, 400);
  }
  if (piggyApp) piggyApp.addEventListener('click', () => { if (editingNow()) return; openPage(piggyPage); piggyMaybeTa(); piggyRender(); });
  document.getElementById('piggy-back').addEventListener('click', () => backHome(piggyPage));
  document.getElementById('piggy-in').addEventListener('click', () => {
    if (editingNow() || !window.openModal) return;
    window.openModal('存入金额（元）', '', (v) => {
      const amt = piggyAmt(v);
      if (!amt) { if (String(v || '').trim()) toast('金额没看懂，再试试'); return; }
      // 注意：openModal 点确定后统一走 close()，回调里同步再开会立刻被关掉——延迟一帧
      setTimeout(() => {
        window.openModal(window.taFit ? window.taFit('跟TA说一句（可不填）') : '跟TA说一句（可不填）', '', (v2) => { piggyAdd('in', amt, String(v2 || '').trim()); }, { maxlength: 40 });
      }, 60);
    }, { maxlength: 10 });
  });
  document.getElementById('piggy-out').addEventListener('click', () => {
    if (editingNow() || !window.openModal) return;
    const bal = piggyBal();
    if (bal <= 0) { toast('罐子还是空的哦'); return; }
    window.openModal('取出金额（元）· 可用 ' + piggyFmt(bal), '', (v) => {
      const amt = piggyAmt(v);
      if (!amt) { if (String(v || '').trim()) toast('金额没看懂，再试试'); return; }
      if (amt > piggyBal()) { toast('罐子里没有这么多'); return; }
      setTimeout(() => {
        window.openModal('用在哪啦（可不填）', '', (v2) => { piggyAdd('out', amt, String(v2 || '').trim()); }, { maxlength: 40 });
      }, 60);
    }, { maxlength: 10 });
  });
  document.getElementById('piggy-set-goal').addEventListener('click', () => {
    if (editingNow() || !window.openModal) return;
    window.openModal('小心愿（如：一起去看海）', '', (v1) => {
      const name = String(v1 || '').trim();
      if (!name) { toast('先写个心愿吧'); return; }
      // openModal 点确定后统一 close()——延迟一帧再开金额弹窗
      setTimeout(() => {
        window.openModal('目标金额（元）', '', (v2) => {
          const amt = piggyAmt(v2);
          if (!amt) { toast('金额没看懂，再试试'); return; }
          piggyOpenShare(name, amt);
        }, { maxlength: 9 });
      }, 60);
    }, { maxlength: 16 });
  });
  // 监督人选择：全局金库人人可见余额，但每个心愿可指定哪些联系人（桌面）可见/监督。
  // ['*']=全部；默认勾选当前桌面。多选 chips，点「全部桌面」互斥。
  let piggyDraft = null;
  function piggyOpenShare(n, a) {
    piggyDraft = { n: n, a: a };
    const chips = document.getElementById('piggy-share-chips');
    const box = document.getElementById('piggy-share');
    if (!chips || !box) { piggyCommitShare([]); return; }
    let list = [];
    try { list = (window.getContacts ? window.getContacts() : []).map(function (c) { return { id: c.id, name: c.name }; }); } catch (e) {}
    if (!list.some(function (c) { return c.id === 'default'; })) list.unshift({ id: 'default', name: '默认' });
    const me = window.__activeCid || 'default';
    let h = '<span class="pg-chip" data-cid="*">全部桌面</span>';
    list.forEach(function (c) {
      h += '<span class="pg-chip' + (c.id === me ? ' on' : '') + '" data-cid="' + piggyEsc(c.id) + '">' + piggyEsc(c.name || c.id) + '</span>';
    });
    chips.innerHTML = h;
    box.hidden = false;
  }
  function piggyCommitShare(sel) {
    if (!piggyDraft) return;
    if (sel.indexOf('*') >= 0) sel = [];
    const gs = piggyGoals();
    gs.push({ n: piggyDraft.n, a: piggyDraft.a, ms: [], done: false, by: sel });
    piggySaveGoals(gs); piggySetCur(gs.length - 1);
    piggyDraft = null;
    piggyRender(); toast('已添加');
  }
  document.getElementById('piggy-share').addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.classList && t.classList.contains('pg-chip')) {
      if (t.getAttribute('data-cid') === '*') {
        document.querySelectorAll('#piggy-share-chips .pg-chip').forEach(c => c.classList.toggle('on', c === t));
      } else {
        t.classList.toggle('on');
        if (t.classList.contains('on')) {
          const star = document.querySelector('#piggy-share-chips .pg-chip[data-cid="*"]');
          if (star) star.classList.remove('on');
        }
      }
      return;
    }
    if (t.id === 'piggy-share-ok') {
      const box = document.getElementById('piggy-share');
      if (!piggyDraft) { if (box) box.hidden = true; return; }
      const sel = [];
      document.querySelectorAll('#piggy-share-chips .pg-chip.on').forEach(c => sel.push(c.getAttribute('data-cid')));
      if (!sel.length) { toast('至少选一个监督人'); return; }
      if (box) box.hidden = true;
      piggyCommitShare(sel);
      return;
    }
    if (t.id === 'piggy-share-cancel') { piggyDraft = null; const b = document.getElementById('piggy-share'); if (b) b.hidden = true; }
  });
  document.getElementById('piggy-add-msg').addEventListener('click', () => {
    if (editingNow() || !window.openModal) return;
    window.openModal(window.taFit ? window.taFit('添加TA的碎碎念（存钱时说）') : '添加TA的碎碎念（存钱时说）', '', (v) => {
      const t = String(v || '').trim(); if (!t) return;
      const a = piggyUserCards(); a.push(t); piggySaveUserCards(a); toast('已添加');
    }, { maxlength: 30 });
  });
  // 心愿单点击委托：＋添加 / 点行切换当前心愿 / ✕ 删除（确认弹窗）
  document.getElementById('piggy-goals').addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'piggy-goal-add') { piggyOpenAddGoal(); return; }
    if (t.classList && t.classList.contains('pg-del')) {
      const idx = parseInt(t.getAttribute('data-del'), 10);
      const gs = piggyGoals();
      if (!(idx >= 0 && idx < gs.length)) return;
      if (!window.openModal) return;
      window.openModal('删除心愿「' + gs[idx].n + '」？', '', () => {
        const gs2 = piggyGoals(); gs2.splice(idx, 1);
        let cur = piggyCur(); if (cur >= gs2.length) cur = 0;
        piggySaveGoals(gs2); piggySetCur(cur);
        piggyRender(); toast('已删除');
      }, { noInput: true });
      return;
    }
    const row = t.closest ? t.closest('[data-pick]') : null;
    if (row) {
      if (editingNow()) return;
      piggySetCur(parseInt(row.getAttribute('data-pick'), 10));
      piggyRender();
    }
  });
  function piggyOpenAddGoal() {
    if (editingNow() || !window.openModal) return;
    document.getElementById('piggy-set-goal').click();
  }
  // 记录展开/收起
  document.getElementById('piggy-hist').addEventListener('click', (e) => {
    if (e.target && e.target.id === 'piggy-more') { piggyHistAll = !piggyHistAll; piggyRender(); }
  });
  // 取款后回复 TA
  document.getElementById('piggy-reply-send').addEventListener('click', () => {
    if (editingNow()) return;
    const inp = document.getElementById('piggy-reply-in');
    const t = inp ? String(inp.value || '').trim() : '';
    if (t && window.chatAddIn) { try { window.chatAddIn(t); } catch (e) {} toast('已回复'); }
    piggyCloseCare();
  });
  document.getElementById('piggy-reply-skip').addEventListener('click', piggyCloseCare);
  document.getElementById('piggy-reply-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); document.getElementById('piggy-reply-send').click(); }
  });

  // ---- 番茄钟 · 陪伴模式 ----
  // 专属聊天窗（#page-pmp-chat）：陪伴期间所有对话只进独立小窗，不写普通聊天记录；
  // 普通聊天页仅保留倒计时状态条。会话持久化（endAt 时间戳，刷新/重开继续）；切联系人自动退出。
  const PMP_GREET = ['好，我陪着你', '去吧，我在这等你', '专注吧，我不吵你', '嗯，一起加油'];
  const PMP_ENC = ['在呢', '继续哦', '摸摸头', '嗯嗯，陪你', '快了快了', '我在看你专注'];
  const PMP_DONE = ['🍅 完成一个！为你骄傲', '🍅 太棒了，去休息一下吧', '🍅 收工！今天也超认真'];
  const PMP_REPLIES = ['嗯嗯，我在', '专心哦，我看着你呢', '加油，很快就完成了', '嗯，陪你', '别分心呀，专注完再聊', '好，一起加油', '我在呢，安心专注'];
  const PMP_TIRED = ['累就先歇口气，深呼吸一下', '辛苦啦，摸摸头，再坚持一小会儿', '累了就慢一点，我不催你'];
  let pmpRec = null;
  try { pmpRec = JSON.parse((curStore() && curStore().get('pomo-companion')) || 'null'); } catch (e) { pmpRec = null; }
  if (!pmpRec || typeof pmpRec !== 'object') pmpRec = null;
  const chatPageEl = document.getElementById('page-chat');
  const pmpBar = document.createElement('div');
  pmpBar.className = 'pmp-bar'; pmpBar.id = 'pmp-bar'; pmpBar.hidden = true;
  pmpBar.innerHTML =
    '<span class="pmp-bar-time" id="pmp-bar-time">25:00</span>' +
    '<span class="pmp-bar-label" id="pmp-bar-label">专注中</span>' +
    '<button class="pmp-bar-toggle" id="pmp-bar-toggle">暂停</button>' +
    '<button class="pmp-bar-more" id="pmp-bar-more">⋯</button>' +
    '<div class="pmp-progress"><div class="pmp-progress-fill" id="pmp-fill"></div></div>';
  const pmpMenu = document.createElement('div');
  pmpMenu.className = 'pmp-menu'; pmpMenu.id = 'pmp-menu'; pmpMenu.hidden = true;
  pmpMenu.innerHTML =
    '<button data-pmp="page" type="button">回番茄钟页</button>' +
    '<button data-pmp="quit" type="button">提前结束</button>';
  if (chatPageEl) {
    const anchor = document.getElementById('chat-body');
    if (anchor) { chatPageEl.insertBefore(pmpMenu, anchor); chatPageEl.insertBefore(pmpBar, pmpMenu); }
    else chatPageEl.appendChild(pmpBar);
  }

  // —— 专属陪伴聊天窗：独立全屏页，与普通聊天完全隔离 ——
  const pmpCPage = document.createElement('div');
  pmpCPage.className = 'page'; pmpCPage.id = 'page-pmp-chat'; pmpCPage.hidden = true;
  pmpCPage.innerHTML =
    '<div class="chat-head"><span class="ch-back" id="pmpc-back"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span><span class="ch-name">陪伴专注</span></div>' +
    '<div class="pmp-bar" id="pmp-cd"><span class="pmp-bar-time" id="pmp-cd-time">25:00</span><span class="pmp-bar-label" id="pmp-cd-label">专注中 · TA 陪着你</span><button class="pmp-bar-toggle" id="pmp-cd-toggle">暂停</button><button class="pmp-bar-more" id="pmp-cd-more">⋯</button><div class="pmp-progress"><div class="pmp-progress-fill" id="pmp-cd-fill"></div></div></div>' +
    '<div class="pmp-menu" id="pmp-c-menu" hidden><button data-pmpc="page" type="button">回番茄钟页</button><button data-pmpc="quit" type="button">提前结束</button></div>' +
    '<div class="pmp-c-list" id="pmp-c-list"></div>' +
    '<div class="pmp-c-inputbar"><input class="pmp-c-in" id="pmp-c-in" type="text" maxlength="120" placeholder="想说点什么…（TA 安静陪着）"><button class="pmp-c-send" id="pmp-c-send">发送</button></div>';
  host.appendChild(pmpCPage);

  function pmpLog() { try { const a = JSON.parse((curStore() && curStore().get('pomo-companion-log')) || '[]'); if (Array.isArray(a)) return a; } catch (e) {} return []; }
  function pmpLogSave(a) { const s = curStore(); if (!s) return; try { s.set('pomo-companion-log', JSON.stringify(a.slice(-300))); } catch (e) {} }
  function pmpEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pmpCRender() {
    const box = document.getElementById('pmp-c-list'); if (!box) return;
    const a = pmpLog();
    if (!a.length) {
      box.innerHTML = '<div class="pmp-c-empty">这里是陪伴模式的专属小窗<br>专注时的鼓励和悄悄话都在这里<br>不会进普通聊天记录</div>';
      return;
    }
    let h = '';
    for (let i = 0; i < a.length; i++) {
      // v3.x.x：称呼跟随——TA 的陪伴消息在渲染层替换（存储原文不动）
      const t = (a[i].w !== 'me' && window.taFit) ? window.taFit(a[i].t) : a[i].t;
      h += '<div class="pmp-c-row' + (a[i].w === 'me' ? ' me' : '') + '"><div class="pmp-c-bub">' + pmpEsc(t) + '</div></div>';
    }
    box.innerHTML = h;
    box.scrollTop = box.scrollHeight;
  }
  function pmpCAdd(who, text) {
    const a = pmpLog(); a.push({ w: who === 'me' ? 'me' : 'ta', t: String(text || ''), ts: Date.now() }); pmpLogSave(a);
    if (!pmpCPage.hidden) pmpCRender();
  }
  let pmpReplyTimer = null;
  function pmpCReply(userText) {
    clearTimeout(pmpReplyTimer);
    const t = String(userText || '');
    let pool = PMP_REPLIES;
    if (/累|难|烦|倦|困/.test(t)) pool = PMP_TIRED;
    else if (/完成|好了|结束|收工/i.test(t)) pool = PMP_DONE;
    const txt = pool[Math.floor(Math.random() * pool.length)];
    pmpReplyTimer = setTimeout(() => { try { vibrate([30]); } catch (e) {} pmpCAdd('ta', txt); }, 700 + Math.random() * 800);
  }
  function pmpCSend() {
    const inp = document.getElementById('pmp-c-in');
    const t = inp ? String(inp.value || '').trim() : '';
    if (!t) return;
    if (inp) inp.value = '';
    pmpCAdd('me', t);
    pmpCReply(t);
  }
  document.getElementById('pmpc-back').addEventListener('click', () => backHome(pmpCPage));
  document.getElementById('pmp-c-send').addEventListener('click', pmpCSend);
  document.getElementById('pmp-c-in').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); pmpCSend(); }
  });
  function pmpActive() { return !!pmpRec; }
  function pmpSave() { const s = curStore(); if (!s) return; try { if (pmpRec) s.set('pomo-companion', JSON.stringify(pmpRec)); else s.remove('pomo-companion'); } catch (e) {} }
  function pmpDetach() {
    clearTimeout(pmpEncTimer);
    clearTimeout(pmpReplyTimer);
    pmpRec = null; pmpSave();
    pmpMenu.hidden = true;
    const cm = document.getElementById('pmp-c-menu'); if (cm) cm.hidden = true;
    pmpSyncBar();
  }
  function pmpSyncFromEngine() {
    if (!pmpActive()) return;
    pmpRec.paused = pomoRunning ? 0 : 1;
    if (pomoRunning) { pmpRec.endAt = pomoEndAt; pmpRec.remainMs = 0; }
    else pmpRec.remainMs = pomoRemainMs;
    pmpSave();
    if (pomoRunning) pmpScheduleEnc();
    pmpRefreshBar();
  }
  function pmpRefreshBar() {
    if (!pmpActive()) return;
    const remainMs = Math.max(0, pomoRunning ? pomoEndAt - Date.now() : (pmpRec.remainMs || pmpRec.totalMs));
    const sec = Math.ceil(remainMs / 1000);
    const tmTxt = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    const lbTxt = pomoRunning ? '专注中 · TA 陪着你' : '已暂停';
    const tgTxt = pomoRunning ? '暂停' : '继续';
    [['pmp-bar-time', 'pmp-bar-label', 'pmp-bar-toggle', 'pmp-fill'], ['pmp-cd-time', 'pmp-cd-label', 'pmp-cd-toggle', 'pmp-cd-fill']].forEach((ids) => {
      const tm = document.getElementById(ids[0]);
      if (tm) tm.textContent = tmTxt;
      const lb = document.getElementById(ids[1]);
      if (lb) lb.textContent = lbTxt;
      const tg = document.getElementById(ids[2]);
      if (tg) tg.textContent = tgTxt;
      const fl = document.getElementById(ids[3]);
      if (fl && pmpRec.totalMs) fl.style.width = Math.min(100, Math.max(0, (1 - remainMs / pmpRec.totalMs) * 100)) + '%';
    });
  }
  let pmpFlashing = false;
  let pmpFlashTimer = null;
  function pmpFlash(txt) {
    pmpFlashing = true;
    [['pmp-bar-time', 'pmp-bar-toggle', 'pmp-bar-more', 'pmp-fill', 'pmp-bar-label'], ['pmp-cd-time', 'pmp-cd-toggle', 'pmp-cd-more', 'pmp-cd-fill', 'pmp-cd-label']].forEach((ids) => {
      const tm = document.getElementById(ids[0]); if (tm) tm.textContent = '00:00';
      const tg = document.getElementById(ids[1]); if (tg) tg.style.display = 'none';
      const mo = document.getElementById(ids[2]); if (mo) mo.style.display = 'none';
      const fl = document.getElementById(ids[3]); if (fl) fl.style.width = '100%';
      const lb = document.getElementById(ids[4]); if (lb) lb.textContent = txt;
    });
    if (chatPageEl) pmpBar.hidden = !!chatPageEl.hidden;
    clearTimeout(pmpFlashTimer);
    pmpFlashTimer = setTimeout(() => {
      pmpFlashing = false;
      ['pmp-bar-toggle', 'pmp-bar-more', 'pmp-cd-toggle', 'pmp-cd-more'].forEach((id) => { const el = document.getElementById(id); if (el) el.style.display = ''; });
      // 会话已随完成结束：专属窗顶部倒计时条收起（普通聊天页状态条由 pmpSyncBar 自行隐藏）
      if (!pmpActive()) {
        const cd = document.getElementById('pmp-cd'); if (cd) cd.hidden = true;
        const cm2 = document.getElementById('pmp-c-menu'); if (cm2) cm2.hidden = true;
      }
      pmpSyncBar();
      if (!pmpCPage.hidden && pmpActive()) pmpRefreshBar();
    }, 2600);
  }
  function pmpSyncBar() {
    if (!chatPageEl) return;
    const show = (pmpActive() || pmpFlashing) && !chatPageEl.hidden;
    pmpBar.hidden = !show;
    if (show) { if (pmpActive()) pmpRefreshBar(); }
    else pmpMenu.hidden = true;
  }
  let pmpEncTimer = null;
  function pmpScheduleEnc() {
    clearTimeout(pmpEncTimer);
    if (!pmpActive() || pmpRec.paused || (pmpRec.enc || 0) >= 2) return;
    const now = Date.now();
    if (!pmpRec.nextEncAt || pmpRec.nextEncAt < now - 30000) {
      pmpRec.nextEncAt = now + (5 + Math.random() * 3) * 60000;
      pmpSave();
    }
    pmpEncTimer = setTimeout(pmpMaybeEnc, Math.max(1000, Math.min(60000, pmpRec.nextEncAt - now)));
  }
  function pmpMaybeEnc() {
    if (!pmpActive() || pmpRec.paused) return;
    const now = Date.now();
    if (pomoRunning && now >= pmpRec.nextEncAt && (pmpRec.enc || 0) < 2) {
      pmpRec.enc = (pmpRec.enc || 0) + 1;
      pmpRec.nextEncAt = now + (5 + Math.random() * 3) * 60000;
      pmpSave();
      try { pmpCAdd('ta', PMP_ENC[Math.floor(Math.random() * PMP_ENC.length)]); } catch (e) {}
    }
    pmpScheduleEnc();
  }
  function pmpRefreshGoBtn() {
    const gb = document.getElementById('pomo-companion');
    if (gb) gb.textContent = pmpActive() ? (pmpRec.paused ? '陪伴已暂停 · 返回陪伴' : '陪伴中 · 返回陪伴') : '🍅 陪伴模式';
  }
  // 暂停/继续（普通聊天页状态条与专属窗共用一套引擎操作）
  function pmpToggleRun() {
    if (!pmpActive()) return;
    if (pomoRunning) {
      pomoRemainMs = Math.max(0, pomoEndAt - Date.now());
      pomoRunning = false; pomoStopTick();
    } else {
      pomoEndAt = Date.now() + (pmpRec.remainMs || pmpRec.totalMs);
      pomoRunning = true; pomoStartTick();
    }
    pmpSyncFromEngine(); pomoRender();
  }
  // 提前结束确认弹窗（两个入口共用）；结束后 TA 回应进专属窗，若在专属窗内则带回番茄钟页
  function pmpQuitAsk() {
    if (!window.openModal) return;
    window.openModal('提前结束这个番茄？', '', (v) => {
      if (v !== '1') return;
      if (pomoRunning) { pomoRunning = false; pomoStopTick(); }
      pomoRemainMs = 0; pomoMode = 'focus';
      const inWin = !pmpCPage.hidden;
      try { pmpCAdd('ta', '没事，休息一下也可以'); } catch (e) {}
      pmpDetach(); pomoRender();
      if (inWin) { openPage(pomoPage); pomoRender(); }
    }, { noInput: true, lock: true, pills: [{ label: '结束', value: '1' }, { label: '再撑一会儿', value: '0' }], staticText: '提前结束的话，这个 🍅 就不计入今天啦' });
  }
  // 入口：番茄钟页「陪伴模式」按钮——未在跑则开一个新专注并挂上陪伴；进入/返回的都是专属聊天窗
  const pmpGoBtn = document.getElementById('pomo-companion');
  if (pmpGoBtn) pmpGoBtn.addEventListener('click', () => {
    if (editingNow()) return;
    if (pmpActive()) { openPage(pmpCPage); pmpCRender(); return; }
    if (pomoMode !== 'focus') { pomoRunning = false; pomoRemainMs = 0; pomoStopTick(); pomoMode = 'focus'; }
    if (!pomoRunning) {
      pomoRemainMs = 0;
      pomoEndAt = Date.now() + pomoModeMin('focus') * 60000;
      pomoRunning = true; pomoStartTick();
    }
    pmpRec = { mode: 'focus', totalMs: pomoModeMin('focus') * 60000, endAt: pomoEndAt, startedAt: Date.now(), paused: 0, remainMs: 0, enc: 0, nextEncAt: 0 };
    pmpSave();
    const cdEl = document.getElementById('pmp-cd'); if (cdEl) cdEl.hidden = false;
    try { pmpCAdd('ta', PMP_GREET[Math.floor(Math.random() * PMP_GREET.length)]); } catch (e) {}
    pmpScheduleEnc();
    pmpSyncBar(); pomoRender();
    openPage(pmpCPage); pmpCRender();
  });
  // 倒计时条按钮：暂停/继续 与 ⋯ 菜单（普通聊天页状态条）
  const pmpToggleBtn = document.getElementById('pmp-bar-toggle');
  if (pmpToggleBtn) pmpToggleBtn.addEventListener('click', pmpToggleRun);
  const pmpMoreBtn = document.getElementById('pmp-bar-more');
  if (pmpMoreBtn) pmpMoreBtn.addEventListener('click', () => { pmpMenu.hidden = !pmpMenu.hidden; });
  pmpMenu.querySelectorAll('button[data-pmp]').forEach(b => b.addEventListener('click', () => {
    pmpMenu.hidden = true;
    if (b.dataset.pmp === 'page') { openPage(pomoPage); pomoRender(); return; }
    if (b.dataset.pmp !== 'quit') return;
    pmpQuitAsk();
  }));
  // 专属窗内的暂停/继续与 ⋯ 菜单
  const pmpCdToggle = document.getElementById('pmp-cd-toggle');
  if (pmpCdToggle) pmpCdToggle.addEventListener('click', pmpToggleRun);
  const pmpCdMore = document.getElementById('pmp-cd-more');
  if (pmpCdMore) pmpCdMore.addEventListener('click', () => { const m = document.getElementById('pmp-c-menu'); if (m) m.hidden = !m.hidden; });
  document.querySelectorAll('#pmp-c-menu button[data-pmpc]').forEach(b => b.addEventListener('click', () => {
    const m = document.getElementById('pmp-c-menu'); if (m) m.hidden = true;
    if (b.dataset.pmpc === 'page') { openPage(pomoPage); pomoRender(); return; }
    if (b.dataset.pmpc !== 'quit') return;
    pmpQuitAsk();
  }));
  // 聊天页显隐时同步条显示
  if (chatPageEl) new MutationObserver(pmpSyncBar).observe(chatPageEl, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('contact-switched', () => { if (pmpActive()) pmpDetach(); });
  // 启动恢复：上次会话还在进行 → 引擎接续走；已在关闭期间完成 → 补记一个 🍅
  (function pmpRestore() {
    if (!pmpRec) return;
    if (pmpRec.mode !== 'focus' || !pmpRec.totalMs) { pmpDetach(); return; }
    const now = Date.now();
    pomoMode = 'focus';
    if (pmpRec.paused) {
      pomoRunning = false; pomoStopTick(); pomoRemainMs = pmpRec.remainMs || pmpRec.totalMs;
      pmpScheduleEnc();
    } else if (pmpRec.endAt > now) {
      pomoRemainMs = 0; pomoEndAt = pmpRec.endAt; pomoRunning = true; pomoStartTick();
      pmpScheduleEnc();
    } else {
      const t = pomoToday(); t.count++; pomoSaveToday(t);
      pomoSaveTotal(pomoTotal() + 1);
      // silent:true——启动早期音频子系统未必就绪，勿因提示音阻断恢复流程
      try { pmpCAdd('ta', '🍅 你刚才完成了一个专注，回来看到啦，很棒'); } catch (e) {}
      pmpDetach();
    }
    pmpSyncBar();
  })();
  pmpRefreshGoBtn();

  document.addEventListener('contact-switched', () => {
    tpStopFlow();
    if (!pmpCPage.hidden) backHome(pmpCPage);
    if (!tpPage.hidden) tpPick();
    if (!ssPage.hidden) ssRenderCount();
    if (!waterPage.hidden) waterRender();
    if (!pomoPage.hidden) pomoRender();
    if (!piggyPage.hidden) piggyRender();
  });
})();

// ===== v3.x：世界观·TA 摸鱼值自动涨时桌面偶尔飘一行小字 =====
// TA 摸鱼值由 personalize.js 每 60s 60% 概率自动涨（"他在那边也偷了个懒"的来源）。
// 这里只做监听：值变化且通过频率控制（冷却 45 分钟 + 每日最多 12 次 + 35% 随机，
// 让"他一整天都可能摸鱼被看见"，又不至于刷屏）时，桌面浮一行小字。
(function () {
  let lastTa = null;
  function chk() {
    if (document.hidden) return;
    const s = window.activeStore && window.activeStore(); if (!s) return;
    let cur = 0; try { cur = parseInt(s.get('fish-total-ta') || '0', 10) || 0; } catch (e) {}
    if (lastTa === null) { lastTa = cur; return; }
    if (cur > lastTa && window.taChimeAllow && window.taChimeAllow('fish-ta-note', { cooldown: 45 * 60 * 1000, dailyMax: 12 }) && Math.random() < 0.35) {
      window.taChimeUse('fish-ta-note');
      if (window.taChimeShow) window.taChimeShow('他在那边也偷了个懒', { dur: 3600 });
    }
    lastTa = cur;
  }
  setInterval(chk, 60 * 1000);
  setTimeout(chk, 5000);
  document.addEventListener('contact-switched', () => { lastTa = null; });
})();

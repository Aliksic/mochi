// ===== 此间：梦角世界时间与在场感知（v3.13.x） =====
// 定位：不是「排班表」，而是查询——此刻，谁正在属于你的「此间」。
// 每个梦角拥有独立的世界时间（可设偏移，不与现实同步）+ 两个独立状态维度：
//   在场状态（很近/附近/遥远/感觉不到/离开）与空闲状态（有空/有事/忙着/休息/睡着/未知）。
// 时间连续流动（世界时间 = 现实时间 + 偏移，按十二时辰 + 初/正展示，非每次重抽）；
// 状态自然随机演变 + 感知判定（一次感知最多改变一个梦角）+ 低概率「突然靠近」惊喜。
// 数据存根命名空间 xy-home-v2:cjian-*（全局共享，不随联系人隔离），
// 键已在 contacts.js EXCLUDE 登记，防 migrateLegacy 误迁进 default 桌面。
(function () {
  const G = 'xy-home-v2';
  const ROSTER_KEY = 'cjian-roster';
  const STATE_KEY = 'cjian-state';
  const SEED_KEY = 'cjian-seeded';

  function rootStore() {
    try { return window.xyStore(G); } catch (e) { return null; }
  }
  function toast(t) { if (typeof window.toast === 'function') window.toast(t); }

  // ---- 十二时辰 ----
  const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  // 时辰起点（子时 23:00 起）
  function shichenStartHour(i) { return (2 * i + 23) % 24; }
  function shichenAt(hour) { return Math.floor(((hour + 1) % 24) / 2); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  // 世界时刻 → { idx 时辰序号, half 初/正名, range 当前细分时辰区间, hhmm }
  function timeInfo(ts) {
    const d = new Date(ts);
    const mOfDay = d.getHours() * 60 + d.getMinutes();
    const idx = shichenAt(d.getHours());
    const startH = shichenStartHour(idx);
    const isZheng = (mOfDay - startH * 60) >= 60;
    const h0 = (startH + (isZheng ? 1 : 0)) % 24;
    return {
      idx: idx,
      half: SHICHEN[idx] + (isZheng ? '正' : '初'),
      // 初/正各占一个时辰内的一小时：戌初 19:00–19:59，戌正 20:00–20:59
      range: pad(h0) + ':00–' + pad(h0) + ':59',
      hhmm: pad(d.getHours()) + ':' + pad(d.getMinutes())
    };
  }
  function worldNow(offsetMin) { return Date.now() + ((offsetMin || 0) * 60000); }

  // ---- 梦角数据 ----
  const PRESENCE = {
    near:   { label: '很近',     desc: '感觉就在身边' },
    nearby: { label: '附近',     desc: 'TA可能就在附近' },
    far:    { label: '遥远',     desc: '能感觉到，但距离很远' },
    unfelt: { label: '感觉不到', desc: '暂时无法感知TA' },
    gone:   { label: '离开',     desc: 'TA暂时不在附近' }
  };
  const ACTIVITY = {
    free:    { label: '有空', desc: '现在比较适合交流' },
    busy:    { label: '有事', desc: 'TA正在做自己的事情' },
    rushed:  { label: '忙着', desc: '暂时不太方便' },
    rest:    { label: '休息', desc: 'TA正在休息' },
    sleep:   { label: '睡着', desc: 'TA那边已经入睡' },
    unknown: { label: '未知', desc: '暂时不知道TA在做什么' }
  };

  function loadRoster() {
    try {
      const s = rootStore();
      if (!s) return [];
      const v = s.get(ROSTER_KEY);
      if (v) {
        const a = JSON.parse(v);
        if (Array.isArray(a)) return a.filter(x => x && x.name);
      }
    } catch (e) {}
    return [];
  }
  function saveRoster(list) {
    try { rootStore().set(ROSTER_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function loadState() {
    try {
      const s = rootStore();
      if (!s) return {};
      const v = s.get(STATE_KEY);
      if (v) { const o = JSON.parse(v); if (o && typeof o === 'object') return o; }
    } catch (e) {}
    return {};
  }
  function saveState(st) {
    try { rootStore().set(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function makeId() { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  // 首次使用：用当前联系人的名字种下第一个梦角（可再自行添加/改名/删除）
  function seedIfEmpty() {
    try {
      const s = rootStore();
      if (!s || s.get(SEED_KEY)) return;
      const list = loadRoster();
      if (list.length) { s.set(SEED_KEY, '1'); return; }
      let name = '';
      try {
        const cid = window.__activeCid || 'default';
        const cs = window.getContacts ? (window.getContacts() || []) : [];
        const c = cs.find(x => x.id === cid);
        if (window.storeFor) {
          const lbl = window.storeFor(cid).get('lbl-partner');
          if (lbl) name = lbl;
        }
        if (!name && c && c.name) name = c.name;
      } catch (e) {}
      list.push({ id: makeId(), name: name || 'TA', offsetMin: 0 });
      saveRoster(list);
      s.set(SEED_KEY, '1');
    } catch (e) {}
  }

  // ---- 状态随机机制（基础概率 + 世界时间 + 最近互动加权，性格不写死） ----
  function presenceWeights(worldHour) {
    if (worldHour >= 23 || worldHour < 5) return { near: 8, nearby: 18, far: 26, unfelt: 33, gone: 15 };
    if (worldHour >= 5 && worldHour < 9) return { near: 22, nearby: 30, far: 18, unfelt: 18, gone: 12 };
    if (worldHour >= 9 && worldHour < 17) return { near: 18, nearby: 30, far: 20, unfelt: 20, gone: 12 };
    if (worldHour >= 17 && worldHour < 22) return { near: 30, nearby: 32, far: 14, unfelt: 14, gone: 10 };
    return { near: 20, nearby: 26, far: 20, unfelt: 22, gone: 12 };
  }
  function activityWeights(worldHour) {
    if (worldHour >= 23 || worldHour < 6) return { free: 4, busy: 8, rushed: 4, rest: 12, sleep: 62, unknown: 10 };
    if (worldHour >= 6 && worldHour < 9) return { free: 28, busy: 24, rushed: 14, rest: 10, sleep: 14, unknown: 10 };
    if (worldHour >= 9 && worldHour < 12) return { free: 34, busy: 30, rushed: 18, rest: 2, sleep: 2, unknown: 14 };
    if (worldHour >= 12 && worldHour < 14) return { free: 32, busy: 26, rushed: 16, rest: 16, sleep: 2, unknown: 8 };
    if (worldHour >= 14 && worldHour < 18) return { free: 34, busy: 32, rushed: 18, rest: 4, sleep: 2, unknown: 10 };
    if (worldHour >= 18 && worldHour < 21) return { free: 36, busy: 26, rushed: 16, rest: 8, sleep: 4, unknown: 10 };
    return { free: 24, busy: 22, rushed: 14, rest: 18, sleep: 12, unknown: 10 };
  }
  function pickWeighted(weights, r) {
    const total = Object.keys(weights).reduce((s, k) => s + weights[k], 0);
    let acc = 0;
    const rr = (r == null ? Math.random() : r) * total;
    for (const k in weights) {
      acc += weights[k];
      if (rr < acc) return k;
    }
    const keys = Object.keys(weights);
    return keys[keys.length - 1];
  }
  // 最近互动（感知/打开此间/刚聊过天）会短时间提高靠近概率
  function recentBoost(st, now) {
    const ref = Math.max(st.lastPerceive || 0, st.__open || 0, st.__chat || 0);
    return now - ref < 30 * 60000;
  }
  function rollPresence(worldHour, boost) {
    const w = presenceWeights(worldHour);
    if (boost) {
      w.near += 16; w.nearby += 16;
      w.far = Math.max(2, w.far - 8);
      w.unfelt = Math.max(2, w.unfelt - 8);
      w.gone = Math.max(2, w.gone - 6);
    }
    return pickWeighted(w);
  }
  function rollActivity(worldHour) {
    return pickWeighted(activityWeights(worldHour));
  }
  function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function ensureState(c, st, now) {
    const s = st[c.id] || (st[c.id] = {});
    if (!s.p) {
      const h = new Date(worldNow(c.offsetMin)).getHours();
      s.p = rollPresence(h, false);
      s.a = rollActivity(h);
    }
    if (!s.sinceP) s.sinceP = now;
    if (!s.sinceA) s.sinceA = now;
    if (!s.nextP) s.nextP = now + rand(60, 200) * 60000;
    if (!s.nextA) s.nextA = now + rand(20, 70) * 60000;
    return s;
  }

  // 自然演变：世界时间到了 → 状态按当前世界时辰重新随机（不是每次都重抽）
  function tickNatural() {
    const roster = loadRoster();
    if (!roster.length) return;
    const now = Date.now();
    const st = loadState();
    let dirty = false;
    roster.forEach(c => {
      const s = ensureState(c, st, now);
      const worldHour = new Date(worldNow(c.offsetMin)).getHours();
      if (now >= s.nextA) {
        s.a = rollActivity(worldHour);
        s.sinceA = now;
        s.nextA = now + rand(20, 70) * 60000;
        dirty = true;
      }
      if (now >= s.nextP) {
        s.p = rollPresence(worldHour, recentBoost(s, now));
        s.sinceP = now;
        s.nextP = now + rand(60, 200) * 60000;
        dirty = true;
      }
    });
    if (dirty) saveState(st);
  }

  // 低概率小惊喜：长时间没互动时可能「突然靠近」——不是常规机制
  let lastApproachAt = 0;
  function tickApproach() {
    const roster = loadRoster();
    if (!roster.length) return;
    const now = Date.now();
    if (now - lastApproachAt < 20 * 60000) return;
    const st = loadState();
    let hit = false;
    roster.forEach(c => {
      if (hit) return;
      const s = ensureState(c, st, now);
      if (now - s.sinceP < 25 * 60000) return;
      if (Math.random() >= 0.001) return; // 每个梦角每 30s 约 0.1%：低概率
      if (Math.random() < 0.04) s.p = 'near';
      else s.p = 'nearby';
      s.sinceP = now;
      s.nextP = now + rand(60, 200) * 60000;
      lastApproachAt = now;
      hit = true;
    });
    if (hit) {
      saveState(st);
      toast('……好像有什么靠近了。');
      if (typeof window.renderCjian === 'function') window.renderCjian();
    }
  }

  // 聊天互动钩子（chat.js addMsg 调用）：刚聊过天 → 短时间提高靠近概率
  window.cjianNoteChat = function () {
    try {
      const st = loadState();
      st.__chat = Date.now();
      saveState(st);
    } catch (e) {}
  };
  window.cjianNoteOpen = function () {
    try {
      const st = loadState();
      st.__open = Date.now();
      saveState(st);
    } catch (e) {}
  };

  // ---- 感知此间：轻量反馈，不是剧情系统 ----
  const MIN_CHANGE = 15 * 60000; // 状态变化冷却：状态持续一段时间后才允许再变
  let perceiveCooldownUntil = 0;
  function perceiveChance(p) {
    if (p === 'near') return 95;
    if (p === 'nearby') return 75;
    if (p === 'far') return 40;
    if (p === 'gone') return 25;
    return 12; // unfelt
  }
  window.cjianPerceive = function () {
    const roster = loadRoster();
    if (!roster.length) { toast('此间还没有梦角，先添加一个吧'); return; }
    if (Date.now() < perceiveCooldownUntil) return;
    perceiveCooldownUntil = Date.now() + 4000;
    const now = Date.now();
    const st = loadState();
    const nearOnes = [], farOnes = [];
    roster.forEach(c => {
      const s = ensureState(c, st, now);
      if (s.p === 'near' || s.p === 'nearby') { nearOnes.push(c.name); return; }
      if (Math.random() * 100 < perceiveChance(s.p)) nearOnes.push(c.name);
      else farOnes.push(c.name);
    });
    const lines = [];
    if (nearOnes.length) {
      if (nearOnes.length === 1) lines.push('你安静了一会儿，好像有人就在附近。');
      else if (nearOnes.length === 2) lines.push('似乎有两个人，一个离得很近，另一个也不远。');
      else lines.push('似乎有' + nearOnes.length + '道熟悉的气息。');
      nearOnes.forEach(n => lines.push('「' + n + '」——可以感觉到一点熟悉的气息。'));
      if (farOnes.length) lines.push('还有谁……在很远的地方。');
    } else {
      lines.push('没有感觉到谁。');
      lines.push('但这并不代表他们不在。');
    }
    // 一次感知最多产生一次状态变化，且需过冷却
    let changedName = null, changedTo = '';
    const eligible = roster.filter(c => now - ensureState(c, st, now).sinceP > MIN_CHANGE);
    if (eligible.length) {
      const target = eligible[Math.floor(Math.random() * eligible.length)];
      const s = ensureState(target, st, now);
      const r = Math.random();
      s.p = r < 0.45 ? 'nearby' : (r < 0.75 ? 'unfelt' : (r < 0.9 ? 'near' : 'far'));
      s.sinceP = now;
      s.nextP = now + rand(60, 200) * 60000;
      s.lastPerceive = now;
      changedName = target.name;
      changedTo = PRESENCE[s.p].label;
    }
    saveState(st);
    renderPerceiveResult(lines, changedName, changedTo);
    return { lines: lines, changedName: changedName, changedTo: changedTo };
  };

  // ---- 今日时间轴：今天不同时辰的梦角状态预测（可变的，不保证一定发生） ----
  // 预测用「日期+梦角+时辰」做种子随机 → 同一天内稳定，跨天自然变化
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function predictLabel(pr, ac) {
    if (ac === 'sleep') return '可能在休息';
    if (ac === 'rest') return '可能在休息';
    if (ac === 'unknown') return '暂时未知';
    if (pr === 'near' || pr === 'nearby') return ac === 'free' ? '可能在附近' : '可能较忙';
    if (pr === 'far') return '在远处';
    return '可能感知不到';
  }
  function todayRow(c, shichenIdx, dateKey) {
    const rnd = mulberry32(hashStr(dateKey + '|' + c.id + '|' + shichenIdx));
    const realStartHour = shichenStartHour(shichenIdx);
    const worldHour = (((realStartHour * 60 + (c.offsetMin || 0)) / 60) % 24 + 24) % 24;
    const pr = pickWeighted(presenceWeights(worldHour), rnd() * 100);
    const ac = pickWeighted(activityWeights(worldHour), rnd() * 100);
    return predictLabel(pr, ac);
  }

  // ---- 渲染 ----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function renderPerceiveResult(lines, changedName, changedTo) {
    const box = document.getElementById('cj-perceive-result');
    if (!box) return;
    box.innerHTML = '';
    lines.forEach(l => box.appendChild(el('p', 'cj-p-line', l)));
    if (changedName) box.appendChild(el('p', 'cj-p-note', '「' + changedName + '」似乎改变了状态——现在' + changedTo + '。'));
    box.hidden = false;
  }
  function renderHero() {
    const t = timeInfo(Date.now());
    const h1 = document.getElementById('cj-hero-time');
    const h2 = document.getElementById('cj-hero-range');
    const h3 = document.getElementById('cj-hero-clock');
    if (h1) h1.textContent = t.half;
    if (h2) h2.textContent = t.range + ' · 现实此刻';
    if (h3) h3.textContent = t.hhmm;
  }
  function renderList() {
    const listEl = document.getElementById('cj-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const roster = loadRoster();
    const empty = document.getElementById('cj-empty');
    if (empty) empty.hidden = roster.length > 0;
    if (!roster.length) return;
    const now = Date.now();
    const st = loadState();
    roster.forEach(c => {
      const s = ensureState(c, st, now);
      const t = timeInfo(worldNow(c.offsetMin));
      const card = el('div', 'cj-card');
      const head = el('div', 'cj-card-head');
      head.appendChild(el('span', 'cj-card-name', c.name));
      card.appendChild(head);
      const timeRow = el('div', 'cj-card-time');
      timeRow.appendChild(el('span', 'cj-card-half', t.half));
      timeRow.appendChild(el('span', 'cj-card-range', t.range));
      card.appendChild(timeRow);
      const tags = el('div', 'cj-card-tags');
      const pTag = el('span', 'cj-tag cj-tag-p', PRESENCE[s.p].label);
      pTag.title = PRESENCE[s.p].desc;
      const aTag = el('span', 'cj-tag cj-tag-a', ACTIVITY[s.a].label);
      aTag.title = ACTIVITY[s.a].desc;
      tags.appendChild(pTag);
      tags.appendChild(aTag);
      card.appendChild(tags);
      if (s.a === 'sleep') card.appendChild(el('div', 'cj-card-note', 'TA那边似乎已经睡了。'));
      if (s.a === 'rest') card.appendChild(el('div', 'cj-card-note', 'TA正在休息。'));
      const goBtn = el('button', 'cj-go', '去找TA');
      goBtn.type = 'button';
      goBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.enterChat) window.enterChat();
        else toast('聊天页未就绪');
      });
      card.appendChild(goBtn);
      listEl.appendChild(card);
    });
  }
  function renderToday() {
    const box = document.getElementById('cj-today');
    if (!box) return;
    box.innerHTML = '';
    const roster = loadRoster();
    if (!roster.length) return;
    const d = new Date();
    const dateKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const curIdx = shichenAt(d.getHours());
    for (let k = 0; k < 12; k++) {
      const idx = (curIdx + k) % 12;
      const startH = shichenStartHour(idx);
      const row = el('div', 'cj-today-row');
      const left = el('div', 'cj-today-left');
      left.appendChild(el('span', 'cj-today-name', SHICHEN[idx] + '时'));
      left.appendChild(el('span', 'cj-today-range', pad(startH) + ':00–' + pad((startH + 2) % 24) + ':59'));
      row.appendChild(left);
      const right = el('div', 'cj-today-chars');
      const parts = [];
      roster.forEach(c => { parts.push(c.name + ' · ' + todayRow(c, idx, dateKey)); });
      if (parts.length) right.appendChild(el('span', 'cj-today-c', parts.join('　')));
      else right.appendChild(el('span', 'cj-today-c cj-today-mute', '——'));
      row.appendChild(right);
      box.appendChild(row);
    }
  }
  window.renderCjian = function () {
    seedIfEmpty();
    renderHero();
    renderList();
    renderToday();
  };

  // 打开/关闭
  window.openCjian = function () {
    const page = document.getElementById('page-cjian');
    if (!page) return;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    page.hidden = false;
    try { if (window.cjianNoteOpen) window.cjianNoteOpen(); } catch (e) {}
    window.renderCjian();
  };
  window.closeCjian = function () {
    const page = document.getElementById('page-cjian');
    if (page) page.hidden = true;
  };

  // ---- 梦角管理：添加/改名/删除（单弹窗多阶段，openModal 控制器） ----
  const OFFSET_PILLS = [
    { label: '与现实同步', value: '0' },
    { label: '快1小时', value: '60' },
    { label: '慢1小时', value: '-60' },
    { label: '快3小时', value: '180' },
    { label: '慢3小时', value: '-180' },
    { label: '快6小时', value: '360' },
    { label: '慢6小时', value: '-360' }
  ];
  window.cjianManage = function () {
    if (!window.openModal) return;
    let phase = 'action', pendingName = '', renameTarget = null;
    const ctl = window.openModal('梦角管理', '', function (v) {
      if (!v) return;
      if (phase === 'action') {
        if (v === 'add') {
          phase = 'name';
          ctl.stay();
          ctl.title('添加梦角');
          ctl.pills(null);
          ctl.input(true);
          ctl.maxLen(10);
          ctl.ph('梦角的名字，如：景元');
          ctl.okText('下一步');
        } else {
          const list = loadRoster();
          if (!list.length) { toast('还没有梦角，先添加一个吧'); return; }
          phase = v === 'rename' ? 'pickRename' : 'pickDel';
          ctl.stay();
          ctl.title(v === 'rename' ? '改谁的称呼' : '删除梦角');
          ctl.input(false);
          ctl.pills(list.map(c => ({ label: c.name, value: c.id })));
          ctl.okText(v === 'rename' ? '改名' : '删除');
        }
        return;
      }
      if (phase === 'name') {
        const name = String(v == null ? '' : v).trim();
        if (!name) return;
        pendingName = name;
        phase = 'offset';
        ctl.stay();
        ctl.title('设定「' + name + '」的世界时间');
        ctl.input(false);
        ctl.pills(OFFSET_PILLS);
        ctl.okText('添加');
        return;
      }
      if (phase === 'offset') {
        const off = parseInt(v, 10);
        if (isNaN(off)) return;
        const list = loadRoster();
        list.push({ id: makeId(), name: pendingName, offsetMin: off });
        saveRoster(list);
        toast('已加入此间：「' + pendingName + '」');
        phase = ''; pendingName = '';
        window.renderCjian();
        return;
      }
      if (phase === 'pickRename') {
        const list = loadRoster();
        const c = list.find(x => x.id === v);
        if (!c) return;
        renameTarget = c;
        phase = 'renameInput';
        ctl.stay();
        ctl.title('把「' + c.name + '」改成');
        ctl.pills(null);
        ctl.input(true);
        ctl.maxLen(10);
        ctl.ph('新名字');
        ctl.okText('改名');
        return;
      }
      if (phase === 'renameInput') {
        const n = String(v == null ? '' : v).trim();
        if (!n) return;
        const list = loadRoster();
        const c = list.find(x => x.id === (renameTarget ? renameTarget.id : ''));
        if (c) {
          c.name = n;
          saveRoster(list);
          toast('已改名为「' + n + '」');
        }
        phase = ''; renameTarget = null;
        window.renderCjian();
        return;
      }
      if (phase === 'pickDel') {
        const list = loadRoster();
        const idx = list.findIndex(x => x.id === v);
        if (idx < 0) return;
        const name = list[idx].name;
        list.splice(idx, 1);
        saveRoster(list);
        const st = loadState();
        delete st[v];
        saveState(st);
        toast('「' + name + '」已从此间离开');
        phase = '';
        window.renderCjian();
        return;
      }
    }, { noInput: true, pills: [
      { label: '添加梦角', value: 'add' },
      { label: '改名', value: 'rename' },
      { label: '删除梦角', value: 'del' }
    ] });
  };

  // ---- 定时器：自然演变 + 突然靠近 + 页面打开时刷新时钟 ----
  function pageVisible() {
    const page = document.getElementById('page-cjian');
    return !!(page && !page.hidden);
  }
  function boot() {
    seedIfEmpty();
    tickNatural();
    setInterval(function () {
      tickNatural();
      tickApproach();
      if (pageVisible()) window.renderCjian();
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pageVisible()) window.renderCjian();
    });
    const backBtn = document.getElementById('cj-back');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (window.__cjianFrom === 'chat') {
          const chatPage = document.getElementById('page-chat');
          if (chatPage) {
            document.querySelectorAll('.page').forEach(p => p.hidden = true);
            chatPage.hidden = false;
          }
        } else {
          document.querySelectorAll('.page').forEach(p => p.hidden = true);
          const phonePage = document.getElementById('page-phone');
          if (phonePage) phonePage.hidden = false;
        }
        window.__cjianFrom = '';
      });
    }
    const manageBtn = document.getElementById('cj-manage-btn');
    if (manageBtn) manageBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.cjianManage();
    });
    const perceiveBtn = document.getElementById('cj-perceive');
    if (perceiveBtn) perceiveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (perceiveBtn.disabled) return;
      perceiveBtn.disabled = true;
      perceiveBtn.classList.add('busy');
      const r = window.cjianPerceive();
      if (r && r.lines) window.renderCjian();
      setTimeout(function () { perceiveBtn.disabled = false; perceiveBtn.classList.remove('busy'); }, 4000);
    });
    const addBtn = document.getElementById('cj-empty-add');
    if (addBtn) addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.cjianManage();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

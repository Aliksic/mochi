// ===== 此间：梦角世界时间与在场感知（v3.13.x 重设计） =====
// 核心哲学：
//   时间不是纯随机——梦角世界时间 = 现实时间 + 偏移，连续流动（按十二时辰+初/正展示）；
//   刷新机制本质是随机——状态不是模拟出来的，是每个梦角【自己随机选择】的：
//   冷却过了就重新选一次（受世界时辰加权 / 最近互动加权约束，但选择本身是随机抽取）。
// 双维状态：在场（很近/附近/遥远/感觉不到/离开）+ 空闲（有空/有事/忙着/休息/睡着/未知）。
// 数据存根命名空间 xy-home-v2:cjian-*（全局共享），键已在 contacts.js EXCLUDE 登记。
(function () {
  const G = 'xy-home-v2';
  const ROSTER_KEY = 'cjian-roster';
  const STATE_KEY = 'cjian-state';
  const SEED_KEY = 'cjian-seeded';

  function rootStore() {
    try { return window.xyStore(G); } catch (e) { return null; }
  }
  function toast(t) { if (typeof window.toast === 'function') window.toast(t); }
  function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  // ---- 十二时辰 ----
  const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  function shichenStartHour(i) { return (2 * i + 23) % 24; }
  function shichenAt(hour) { return Math.floor(((hour + 1) % 24) / 2); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // 世界时刻 → 时辰细分（初/正）
  // 初 = 时辰前半小时（戌初 19:00–19:29）；正 = 其后（含中段一小时与末半小时，戌正 19:30–20:29）。
  function timeInfo(ts) {
    const d = new Date(ts);
    const hour = d.getHours();
    const idx = shichenAt(hour);
    const startH = shichenStartHour(idx);
    const mInto = hour * 60 + d.getMinutes() - startH * 60; // 进入时辰的分钟数 0..119
    let half, range;
    if (mInto < 30) {
      half = SHICHEN[idx] + '初';
      range = pad(startH) + ':00–' + pad(startH) + ':29';
    } else if (mInto < 90) {
      half = SHICHEN[idx] + '正';
      range = pad(startH) + ':30–' + pad((startH + 1) % 24) + ':29';
    } else {
      half = SHICHEN[idx] + '正';
      range = pad((startH + 1) % 24) + ':30–' + pad((startH + 1) % 24) + ':59';
    }
    return { idx: idx, half: half, range: range, hhmm: pad(hour) + ':' + pad(d.getMinutes()) };
  }
  function worldNow(offsetMin) { return Date.now() + ((offsetMin || 0) * 60000); }
  function offsetLabel(off) {
    if (!off) return '与现实同步';
    if (off % 60 === 0) return off > 0 ? ('比现实快' + (off / 60) + '小时') : ('比现实慢' + (-off / 60) + '小时');
    return '独立时间流';
  }

  // ---- 状态定义 ----
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

  // ---- 存储 ----
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

  // 首次使用：用当前联系人的名字种下第一个梦角
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

  // ---- 随机选择核心（基础概率 + 世界时间 + 最近互动；性格不写死） ----
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
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let acc = 0;
    const rr = (r == null ? Math.random() : r) * total;
    for (const k of keys) {
      acc += weights[k];
      if (rr < acc) return k;
    }
    return keys[keys.length - 1];
  }
  // 最近互动（感知/打开此间/刚聊过天）30 分钟内提高靠近概率
  function recentBoost(s, now) {
    const ref = Math.max(s.lastPerceive || 0, s.__open || 0, s.__chat || 0);
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

  // 每梦角独立状态（含随机冷却：状态持续一段时间后梦角才会重新选择）
  function ensureState(c, st, now) {
    const s = st[c.id] || (st[c.id] = {});
    if (!s.p) {
      const h = new Date(worldNow(c.offsetMin)).getHours();
      s.p = rollPresence(h, false);
      s.a = rollActivity(h);
    }
    if (!s.sinceP) s.sinceP = now;
    if (!s.sinceA) s.sinceA = now;
    if (!s.cdP) s.cdP = rand(20, 45) * 60000;
    if (!s.cdA) s.cdA = rand(8, 25) * 60000;
    return s;
  }

  // 刷新：梦角自己随机选择——冷却过了就重新选。返回是否有变化。
  function refreshStates() {
    const roster = loadRoster();
    if (!roster.length) return false;
    const now = Date.now();
    const st = loadState();
    let dirty = false;
    roster.forEach(c => {
      const s = ensureState(c, st, now);
      const worldHour = new Date(worldNow(c.offsetMin)).getHours();
      const boost = recentBoost(s, now);
      if (now - s.sinceA >= s.cdA) {
        s.a = rollActivity(worldHour);
        s.sinceA = now;
        s.cdA = rand(8, 25) * 60000;
        dirty = true;
      }
      if (now - s.sinceP >= s.cdP) {
        s.p = rollPresence(worldHour, boost);
        s.sinceP = now;
        s.cdP = rand(20, 45) * 60000;
        dirty = true;
      }
    });
    if (dirty) saveState(st);
    return dirty;
  }
  window.cjianRefresh = refreshStates; // 测试/运维钩子

  // 低概率小惊喜：长时间没互动且状态久未变化，可能「突然靠近」——不是常规机制
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
      if (now - s.sinceP < 120 * 60000) return;
      if (Math.random() >= 0.003) return; // 每个梦角每次刷新约 0.3%
      s.p = Math.random() < 0.1 ? 'near' : 'nearby';
      s.sinceP = now;
      s.cdP = rand(20, 45) * 60000;
      lastApproachAt = now;
      hit = true;
    });
    if (hit) {
      saveState(st);
      toast('……好像有什么靠近了。');
      if (typeof window.renderCjian === 'function') window.renderCjian(false);
    }
  }

  // 聊天互动钩子（chat.js addMsg 调用）
  window.cjianNoteChat = function () {
    try { const st = loadState(); st.__chat = Date.now(); saveState(st); } catch (e) {}
  };
  window.cjianNoteOpen = function () {
    try { const st = loadState(); st.__open = Date.now(); saveState(st); } catch (e) {}
  };

  // ---- 感知此间：轻量反馈，不是剧情系统 ----
  const MIN_CHANGE = 15 * 60000; // 状态变化冷却：一次感知最多改变一个梦角
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
      if (s.p === 'near' || s.p === 'nearby') { nearOnes.push(c); return; }
      if (Math.random() * 100 < perceiveChance(s.p)) nearOnes.push(c);
      else farOnes.push(c);
    });
    const lines = [];
    if (nearOnes.length) {
      if (nearOnes.length === 1) lines.push('你安静了一会儿。\n好像有人就在附近。');
      else lines.push('似乎有' + nearOnes.length + '个人。\n有的离得很近。');
      nearOnes.forEach(n => lines.push('「' + n.name + '」\n可以感觉到一点熟悉的气息。'));
      if (farOnes.length) lines.push('还有谁……在很远的地方。');
    } else {
      lines.push('没有感觉到谁。');
      lines.push('但这并不代表他们不在。');
    }
    // 一次感知最多产生一次状态变化，且需过 15 分钟状态冷却
    let changedName = null, changedTo = '';
    const eligible = roster.filter(c => now - ensureState(c, st, now).sinceP > MIN_CHANGE);
    if (eligible.length) {
      const target = eligible[Math.floor(Math.random() * eligible.length)];
      const s = ensureState(target, st, now);
      const r = Math.random();
      s.p = r < 0.45 ? 'nearby' : (r < 0.75 ? 'unfelt' : (r < 0.9 ? 'near' : 'far'));
      s.sinceP = now;
      s.cdP = rand(20, 45) * 60000;
      s.lastPerceive = now;
      changedName = target.name;
      changedTo = PRESENCE[s.p].label;
    }
    saveState(st);
    renderPerceiveResult(lines, changedName, changedTo);
    return { lines: lines, changedName: changedName, changedTo: changedTo };
  };

  // ---- 预测文案（可能发生，不保证） ----
  function predictPhrase(pr, ac) {
    if (ac === 'sleep' || ac === 'rest') return '可能在休息';
    if (ac === 'unknown') return '此时尚不可知';
    if (pr === 'near') return '可能就在身边';
    if (pr === 'nearby') return ac === 'free' ? '可能在附近' : '可能较忙';
    if (pr === 'far') return '在远处';
    if (pr === 'gone') return '离开中';
    return '可能感知不到';
  }
  function trajectoryPhrase(pr, ac) {
    if (ac === 'sleep') return '睡眠';
    if (ac === 'rest') return '休息';
    if (ac === 'unknown') return '此时尚不可知';
    if (ac === 'free') return pr === 'near' ? '很近' : (pr === 'nearby' ? '可能在附近' : '有空');
    if (ac === 'busy') return '有事';
    if (ac === 'rushed') return '忙着';
    if (pr === 'far') return '在远处';
    if (pr === 'gone') return '离开';
    return '感知不到';
  }

  // ---- 今日时间轴：每次打开「此间」，梦角重新随机选择今天的可能轨迹 ----
  // 缓存：打开时随机一次，浏览期间保持稳定（只把当前时辰行换成实时状态），下次打开再选。
  let todayCache = null;
  function rollTodayForecast() {
    const roster = loadRoster();
    const d = new Date();
    const curIdx = shichenAt(d.getHours());
    const cache = [];
    for (let k = 0; k < 12; k++) {
      const idx = (curIdx + k) % 12;
      const realStartH = shichenStartHour(idx);
      const parts = roster.map(c => {
        const worldHour = (((realStartH * 60 + (c.offsetMin || 0)) / 60) % 24 + 24) % 24;
        const pr = rollPresence(worldHour, false);
        const ac = rollActivity(worldHour);
        return c.name + ' · ' + predictPhrase(pr, ac);
      });
      cache.push({ idx: idx, startH: realStartH, parts: parts });
    }
    todayCache = cache;
  }
  function renderToday(liveNow) {
    const box = document.getElementById('cj-today');
    if (!box) return;
    box.innerHTML = '';
    if (!todayCache) return;
    const roster = loadRoster();
    if (!roster.length) return;
    const now = Date.now();
    const st = loadState();
    todayCache.forEach((row, k) => {
      const rowEl = el('div', 'cj-today-row');
      const left = el('div', 'cj-today-left');
      left.appendChild(el('span', 'cj-today-name', SHICHEN[row.idx] + '时'));
      left.appendChild(el('span', 'cj-today-range', pad(row.startH) + ':00–' + pad((row.startH + 2) % 24) + ':59'));
      rowEl.appendChild(left);
      const right = el('div', 'cj-today-chars');
      let parts = row.parts;
      if (k === 0) {
        // 当前时辰行始终反映实时状态
        parts = roster.map(c => {
          const s = ensureState(c, st, now);
          return c.name + ' · ' + predictPhrase(s.p, s.a);
        });
      }
      if (parts.length) right.appendChild(el('span', 'cj-today-c', parts.join('　')));
      else right.appendChild(el('span', 'cj-today-c cj-today-mute', '——'));
      rowEl.appendChild(right);
      box.appendChild(rowEl);
    });
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
    lines.forEach(l => {
      const segs = String(l).split('\n');
      segs.forEach((seg, i) => {
        const p = el('p', 'cj-p-line', seg);
        if (i > 0) p.style.marginTop = '2px';
        box.appendChild(p);
      });
    });
    if (changedName) box.appendChild(el('p', 'cj-p-note', '「' + changedName + '」似乎改变了状态——现在' + changedTo + '。'));
    box.hidden = false;
  }
  function renderHero() {
    const t = timeInfo(Date.now());
    const h1 = document.getElementById('cj-hero-time');
    const h2 = document.getElementById('cj-hero-range');
    if (h1) h1.textContent = t.half;
    if (h2) h2.textContent = t.range + ' · 现实此刻 ' + t.hhmm;
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
      card.setAttribute('data-id', c.id);
      const head = el('div', 'cj-card-head');
      head.appendChild(el('span', 'cj-card-name', c.name));
      head.appendChild(el('span', 'cj-card-hint', '查看TA的一天 ›'));
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
      card.addEventListener('click', () => window.cjianOpenDetail(c.id));
      listEl.appendChild(card);
    });
  }

  // ---- 梦角详情（TA 自己的一天） ----
  let detailId = '';
  window.cjianOpenDetail = function (id) {
    const main = document.getElementById('cj-main');
    const det = document.getElementById('cj-detail');
    if (!main || !det) return;
    detailId = id;
    renderDetail();
    main.hidden = true;
    det.hidden = false;
  };
  window.cjianCloseDetail = function () {
    const main = document.getElementById('cj-main');
    const det = document.getElementById('cj-detail');
    if (!main || !det) return;
    det.hidden = true;
    main.hidden = false;
    detailId = '';
  };
  function renderDetail() {
    const body = document.getElementById('cj-detail-body');
    if (!body) return;
    body.innerHTML = '';
    const roster = loadRoster();
    const c = roster.find(x => x.id === detailId);
    if (!c) { window.cjianCloseDetail(); return; }
    const now = Date.now();
    const st = loadState();
    const s = ensureState(c, st, now);
    const t = timeInfo(worldNow(c.offsetMin));
    body.appendChild(el('div', 'cj-d-name', c.name));
    body.appendChild(el('div', 'cj-d-offset', offsetLabel(c.offsetMin)));
    const timeBig = el('div', 'cj-d-time');
    timeBig.appendChild(el('span', 'cj-d-half', t.half));
    body.appendChild(timeBig);
    body.appendChild(el('div', 'cj-d-range', t.range + ' · 世界时间 ' + t.hhmm));
    if (c.offsetMin) body.appendChild(el('div', 'cj-d-real', '现实此刻 ' + timeInfo(Date.now()).hhmm));
    const tags = el('div', 'cj-card-tags');
    const pTag = el('span', 'cj-tag cj-tag-p', PRESENCE[s.p].label);
    pTag.title = PRESENCE[s.p].desc;
    const aTag = el('span', 'cj-tag cj-tag-a', ACTIVITY[s.a].label);
    aTag.title = ACTIVITY[s.a].desc;
    tags.appendChild(pTag);
    tags.appendChild(aTag);
    body.appendChild(tags);
    if (s.a === 'sleep') body.appendChild(el('div', 'cj-d-note', 'TA那边似乎已经睡了。'));
    if (s.a === 'rest') body.appendChild(el('div', 'cj-d-note', 'TA正在休息。'));
    body.appendChild(el('div', 'cj-d-today-title', 'TA的今日'));
    const traj = el('div', 'cj-d-today');
    for (let k = 0; k < 12; k++) {
      const idx = (t.idx + k) % 12;
      const row = el('div', 'cj-d-row');
      row.appendChild(el('span', 'cj-d-row-name', SHICHEN[idx] + '时'));
      let pr, ac;
      if (k === 0) { pr = s.p; ac = s.a; }
      else {
        pr = rollPresence((t.idx + k) % 24, false);
        ac = rollActivity((t.idx + k) % 24);
      }
      row.appendChild(el('span', 'cj-d-row-p', trajectoryPhrase(pr, ac)));
      traj.appendChild(row);
    }
    body.appendChild(traj);
    body.appendChild(el('div', 'cj-d-foot', '这不是TA的日程表，只是TA可能的样子。'));
    const goBtn = el('button', 'cj-go', '去找TA');
    goBtn.type = 'button';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.enterChat) window.enterChat();
      else toast('聊天页未就绪');
    });
    body.appendChild(goBtn);
  }

  // ---- 整页渲染 ----
  window.renderCjian = function (forceForecast) {
    seedIfEmpty();
    if (forceForecast || !todayCache) rollTodayForecast();
    refreshStates();
    renderHero();
    renderList();
    renderToday(true);
    if (detailId) renderDetail();
  };

  window.openCjian = function () {
    const page = document.getElementById('page-cjian');
    if (!page) return;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    page.hidden = false;
    try { if (window.cjianNoteOpen) window.cjianNoteOpen(); } catch (e) {}
    window.renderCjian(true);
  };
  window.closeCjian = function () {
    const page = document.getElementById('page-cjian');
    if (page) page.hidden = true;
  };

  // ---- 梦角管理：添加/改名/删除（单弹窗多阶段，openModal 控制器） ----
  const OFFSET_PILLS = [
    { label: '与现实同步', value: '0' },
    { label: '比现实快1小时', value: '60' },
    { label: '比现实慢1小时', value: '-60' },
    { label: '比现实快3小时', value: '180' },
    { label: '比现实慢3小时', value: '-180' },
    { label: '独立时间流', value: 'rand' }
  ];
  // 独立时间流：一个只属于TA自己的随机偏移（非整点，跨天稳定）
  function randomOffset() {
    let off = rand(10, 540);
    if (off % 60 === 0) off += 17;
    return (Math.random() < 0.5 ? -1 : 1) * off;
  }
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
        const off = v === 'rand' ? randomOffset() : parseInt(v, 10);
        if (v !== 'rand' && isNaN(off)) return;
        const list = loadRoster();
        list.push({ id: makeId(), name: pendingName, offsetMin: off });
        saveRoster(list);
        toast('已加入此间：「' + pendingName + '」');
        phase = ''; pendingName = '';
        todayCache = null;
        window.renderCjian(true);
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
        window.renderCjian(false);
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
        if (detailId === v) window.cjianCloseDetail();
        todayCache = null;
        window.renderCjian(true);
        return;
      }
    }, { noInput: true, pills: [
      { label: '添加梦角', value: 'add' },
      { label: '改名', value: 'rename' },
      { label: '删除梦角', value: 'del' }
    ] });
  };

  // ---- 定时器：随机刷新 + 突然靠近 + 页面打开时刷新时钟 ----
  function pageVisible() {
    const page = document.getElementById('page-cjian');
    return !!(page && !page.hidden);
  }
  function boot() {
    seedIfEmpty();
    setInterval(function () {
      tickApproach();
      if (pageVisible()) window.renderCjian(false);
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pageVisible()) window.renderCjian(false);
    });
    const backBtn = document.getElementById('cj-back');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        // 详情打开时先返回列表；否则按来源返回
        if (!document.getElementById('cj-detail').hidden) {
          window.cjianCloseDetail();
          return;
        }
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
    const detailBack = document.getElementById('cj-detail-back');
    if (detailBack) detailBack.addEventListener('click', function (e) {
      e.stopPropagation();
      window.cjianCloseDetail();
    });
    const manageBtn = document.getElementById('cj-manage-btn');
    if (manageBtn) manageBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.cjianManage();
    });
    // 桌面「此间」图标：从桌面进入，返回时回桌面（聊天「更多功能」入口由 chat.js 接线，
    // 打开前会置 __cjianFrom='chat'；这里显式置空避免残留来源）
    const cjianApp = document.querySelector('.app[data-app="cjian"]');
    if (cjianApp) {
      cjianApp.addEventListener('click', function (e) {
        e.stopPropagation();
        try {
          const editing = Array.from(document.querySelectorAll('.app-grid'))
            .some(g => g.classList.contains('editing'));
          if (editing) return;
        } catch (err) {}
        window.__cjianFrom = '';
        window.openCjian();
      });
    }
    const perceiveBtn = document.getElementById('cj-perceive');
    if (perceiveBtn) perceiveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (perceiveBtn.disabled) return;
      perceiveBtn.disabled = true;
      perceiveBtn.classList.add('busy');
      const r = window.cjianPerceive();
      if (r && r.lines) window.renderCjian(false);
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

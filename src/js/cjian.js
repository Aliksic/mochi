// ===== 此间：梦角世界时间与在场感知（v3.13.x 重设计；v3.14.x 按桌面分组） =====
// 核心哲学：
//   时间不是纯随机——梦角世界时间 = 现实时间 + 偏移，连续流动（按十二时辰+初/正展示）；
//   刷新机制本质是随机——状态不是模拟出来的，是每个梦角【自己随机选择】的：
//   冷却过了就重新选一次（受世界时辰加权 / 最近互动加权约束，但选择本身是随机抽取）。
// 双维状态：在场（很近/附近/遥远/感觉不到/离开）+ 空闲（有空/有事/忙着/休息/睡着/未知）。
// v3.14.x 分组：梦角名单/状态按桌面（联系人）命名空间分离——每个桌面有自己的梦角，
//   页内顶部 chips 可直接切换查看别的桌面的梦角，「全部」总览一次看完全部梦角状态。
//   存量全局键迁移进当前桌面（合并去重，绝不丢数据）；梦角档案（memo-arc）改为
//   合并读取各桌面名单，档案仍全局共享不受影响。键形 xy-home-v2:<cid>:cjian-*，
//   命中 contacts.js 命名空间排除规则，不会被 migrateLegacy 误迁。
(function () {
  const G = 'xy-home-v2';
  const ROSTER_KEY = 'cjian-roster';
  const STATE_KEY = 'cjian-state';
  const SEED_KEY = 'cjian-seeded';
  const ALL = '__all__'; // 总览模式：一次查看全部桌面的全部梦角

  function rootStore() {
    try { return window.xyStore(G); } catch (e) { return null; }
  }
  function curCid() { return window.__activeCid || 'default'; }
  function storeOf(cid) {
    try { return window.xyStore(G + ':' + (cid || 'default')); } catch (e) { return null; }
  }
  function contacts() {
    try {
      const a = window.getContacts ? window.getContacts() : null;
      if (Array.isArray(a) && a.length) return a;
    } catch (e) {}
    return [{ id: 'default', name: '默认' }];
  }
  function contactName(cid) {
    const c = contacts().find(x => x.id === cid);
    return (c && c.name) || '默认';
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

  // ---- 存储（按桌面命名空间分离） ----
  function loadRoster(cid) {
    try {
      const s = storeOf(cid);
      if (!s) return [];
      const v = s.get(ROSTER_KEY);
      if (v) {
        const a = JSON.parse(v);
        if (Array.isArray(a)) return a.filter(x => x && x.name && x.id);
      }
    } catch (e) {}
    return [];
  }
  function saveRoster(list, cid) {
    try { storeOf(cid).set(ROSTER_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function loadState(cid) {
    try {
      const s = storeOf(cid);
      if (!s) return {};
      const v = s.get(STATE_KEY);
      if (v) { const o = JSON.parse(v); if (o && typeof o === 'object') return o; }
    } catch (e) {}
    return {};
  }
  function saveState(st, cid) {
    try { storeOf(cid).set(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }
  function makeId() { return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  // ---- 存量迁移：旧版全局键 → 当前桌面（合并去重，幂等，绝不丢数据） ----
  // 老数据本就是用当时激活桌面 TA 名播种的一份数据，归入当前桌面最贴近原意；
  // 若本桌面已有名单（如 IDB 回填迟到导致迁移跑过又见到根键），按 id 并集合入，
  // 之后清掉根键——memo-arc 已改为合并读取各桌面名单并兼容根键残留，不受影响。
  function migrateSplit() {
    const r = rootStore();
    if (!r) return;
    let gr = null, gs = null;
    try { const v = r.get(ROSTER_KEY); gr = v ? JSON.parse(v) : null; } catch (e) {}
    try { const v = r.get(STATE_KEY); gs = v ? JSON.parse(v) : null; } catch (e) {}
    const gseed = r.get(SEED_KEY);
    const grArr = Array.isArray(gr) ? gr.filter(x => x && x.name && x.id) : [];
    const gsObj = (gs && typeof gs === 'object') ? gs : {};
    if (!grArr.length && !Object.keys(gsObj).length) { if (gseed) r.remove(SEED_KEY); return; }
    const cid = curCid();
    const s = storeOf(cid);
    if (!s) return;
    const nsList = loadRoster(cid);
    const have = {};
    nsList.forEach(x => { have[x.id] = 1; });
    const add = grArr.filter(x => !have[x.id]);
    if (add.length) {
      const st = loadState(cid);
      add.forEach(x => { if (gsObj[x.id]) st[x.id] = gsObj[x.id]; });
      saveRoster(nsList.concat(add), cid);
      saveState(st, cid);
    }
    if (gseed || nsList.length || add.length) s.set(SEED_KEY, '1');
    r.remove(ROSTER_KEY); r.remove(STATE_KEY); r.remove(SEED_KEY);
  }

  // 首次使用：每个桌面各自种下自己的第一个梦角（用该桌面 TA 的名字）
  function seedIfEmpty(cid) {
    try {
      const s = storeOf(cid);
      if (!s || s.get(SEED_KEY)) return;
      const list = loadRoster(cid);
      if (list.length) { s.set(SEED_KEY, '1'); return; }
      let name = '';
      try {
        const lbl = s.get('lbl-partner');
        if (lbl) name = lbl;
        if (!name) name = contactName(cid);
      } catch (e) {}
      list.push({ id: makeId(), name: name || 'TA', offsetMin: 0 });
      saveRoster(list, cid);
      s.set(SEED_KEY, '1');
    } catch (e) {}
  }
  function ensureAllSeeds() { contacts().forEach(ct => seedIfEmpty(ct.id)); }

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

  // 刷新：梦角自己随机选择——冷却过了就重新选。遍历【所有桌面】的梦角（后台也在流动）。
  function refreshStates() {
    const now = Date.now();
    let dirtyAny = false;
    contacts().forEach(ct => {
      const roster = loadRoster(ct.id);
      if (!roster.length) return;
      const st = loadState(ct.id);
      let dirty = false;
      roster.forEach(c => {
        // v3.14.x 修复：新梦角首次生成的初始状态必须落盘——否则状态只存在于本次渲染的
        // 临时对象里，下次渲染（30s 心跳/重开页面）会重新随机一次，表现为新梦角
        // 状态每 30 秒无规律跳动，且列表/详情/今日轴各滚各的（老版遗留隐患）
        const isNew = !st[c.id];
        const s = ensureState(c, st, now);
        if (isNew) dirty = true;
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
      if (dirty) { saveState(st, ct.id); dirtyAny = true; }
    });
    return dirtyAny;
  }
  window.cjianRefresh = refreshStates; // 测试/运维钩子

  // 低概率小惊喜：长时间没互动且状态久未变化，可能「突然靠近」——不是常规机制
  let lastApproachAt = 0;
  function tickApproach() {
    const now = Date.now();
    if (now - lastApproachAt < 20 * 60000) return;
    let hitName = '';
    contacts().forEach(ct => {
      if (hitName) return;
      const roster = loadRoster(ct.id);
      if (!roster.length) return;
      const st = loadState(ct.id);
      let dirty = false;
      roster.forEach(c => {
        if (hitName) return;
        const s = ensureState(c, st, now);
        if (now - s.sinceP < 120 * 60000) return;
        if (Math.random() >= 0.003) return; // 每个梦角每次刷新约 0.3%
        s.p = Math.random() < 0.1 ? 'near' : 'nearby';
        s.sinceP = now;
        s.cdP = rand(20, 45) * 60000;
        lastApproachAt = now;
        hitName = c.name;
        dirty = true;
      });
      if (dirty) saveState(st, ct.id);
    });
    if (hitName) {
      toast('……好像有什么靠近了。');
      if (typeof window.renderCjian === 'function') window.renderCjian(false);
    }
  }

  // 聊天互动钩子（chat.js addMsg 调用）——记在当前桌面的状态上
  window.cjianNoteChat = function () {
    try { const cid = curCid(); const st = loadState(cid); st.__chat = Date.now(); saveState(st, cid); } catch (e) {}
  };
  window.cjianNoteOpen = function () {
    try { const cid = curCid(); const st = loadState(cid); st.__open = Date.now(); saveState(st, cid); } catch (e) {}
  };

  // ---- 视图范围：单个桌面 / 全部总览 ----
  let viewCid = ''; // '' 未初始化；打开此间时置为当前桌面
  function scopeCids() {
    if (viewCid === ALL) return contacts().map(ct => ct.id);
    const v = viewCid || curCid();
    return [v];
  }
  // 全部梦角扁平列表（联系人顺序 × 名单顺序），供详情上一位/下一位切换
  function flatEntries() {
    const out = [];
    contacts().forEach(ct => {
      loadRoster(ct.id).forEach(c => out.push({ c: c, cid: ct.id }));
    });
    return out;
  }
  function cidOfDreamer(id) {
    let hit = '';
    contacts().some(ct => {
      if (loadRoster(ct.id).some(x => x.id === id)) { hit = ct.id; return true; }
      return false;
    });
    return hit;
  }

  // ---- 感知此间：轻量反馈，不是剧情系统（范围跟随当前视图） ----
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
    const entries = [];
    scopeCids().forEach(cid => {
      loadRoster(cid).forEach(c => entries.push({ c: c, cid: cid }));
    });
    if (!entries.length) { toast('此间还没有梦角，先添加一个吧'); return; }
    if (Date.now() < perceiveCooldownUntil) return;
    perceiveCooldownUntil = Date.now() + 4000;
    const now = Date.now();
    const states = {}; // cid -> st（惰性加载，最后统一回写）
    function stOf(cid) { return states[cid] || (states[cid] = loadState(cid)); }
    const nearOnes = [], farOnes = [];
    entries.forEach(en => {
      const s = ensureState(en.c, stOf(en.cid), now);
      if (s.p === 'near' || s.p === 'nearby') { nearOnes.push(en.c); return; }
      if (Math.random() * 100 < perceiveChance(s.p)) nearOnes.push(en.c);
      else farOnes.push(en.c);
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
    const eligible = entries.filter(en => now - ensureState(en.c, stOf(en.cid), now).sinceP > MIN_CHANGE);
    if (eligible.length) {
      const target = eligible[Math.floor(Math.random() * eligible.length)];
      const s = ensureState(target.c, stOf(target.cid), now);
      const r = Math.random();
      s.p = r < 0.45 ? 'nearby' : (r < 0.75 ? 'unfelt' : (r < 0.9 ? 'near' : 'far'));
      s.sinceP = now;
      s.cdP = rand(20, 45) * 60000;
      s.lastPerceive = now;
      changedName = target.c.name;
      changedTo = PRESENCE[s.p].label;
    }
    Object.keys(states).forEach(cid => saveState(states[cid], cid));
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
  // 缓存（v3.14.x 起按视图分桶）：打开时随机一次，浏览期间保持稳定——切换桌面/总览
  // 再切回来仍是同一份预测（各视图各一份），只把当前时辰行换成实时状态；
  // 关闭重开（openCjian forceForecast）才全部重掷，名单增删改也会作废对应缓存。
  let todayCacheMap = {};
  function scopeKey() { return viewCid === ALL ? ALL : (viewCid || curCid()); }
  function rollTodayForecast() {
    const entries = flatEntries().filter(en => scopeCids().indexOf(en.cid) >= 0);
    const d = new Date();
    const curIdx = shichenAt(d.getHours());
    const cache = [];
    for (let k = 0; k < 12; k++) {
      const idx = (curIdx + k) % 12;
      const realStartH = shichenStartHour(idx);
      const parts = entries.map(en => {
        const worldHour = (((realStartH * 60 + (en.c.offsetMin || 0)) / 60) % 24 + 24) % 24;
        const pr = rollPresence(worldHour, false);
        const ac = rollActivity(worldHour);
        return en.c.name + ' · ' + predictPhrase(pr, ac);
      });
      cache.push({ idx: idx, startH: realStartH, parts: parts });
    }
    todayCacheMap[scopeKey()] = cache;
  }
  function renderToday(liveNow) {
    const box = document.getElementById('cj-today');
    if (!box) return;
    box.innerHTML = '';
    const rows = todayCacheMap[scopeKey()];
    if (!rows) return;
    const entries = flatEntries().filter(en => scopeCids().indexOf(en.cid) >= 0);
    if (!entries.length) return;
    const now = Date.now();
    const states = {};
    rows.forEach((row, k) => {
      const rowEl = el('div', 'cj-today-row');
      const left = el('div', 'cj-today-left');
      left.appendChild(el('span', 'cj-today-name', SHICHEN[row.idx] + '时'));
      left.appendChild(el('span', 'cj-today-range', pad(row.startH) + ':00–' + pad((row.startH + 2) % 24) + ':59'));
      rowEl.appendChild(left);
      const right = el('div', 'cj-today-chars');
      let parts = row.parts;
      if (k === 0) {
        // 当前时辰行始终反映实时状态
        parts = entries.map(en => {
          const st = states[en.cid] || (states[en.cid] = loadState(en.cid));
          const s = ensureState(en.c, st, now);
          return en.c.name + ' · ' + predictPhrase(s.p, s.a);
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

  // 桌面分组切换条：每个桌面一枚 chips + 「全部」总览（v3.14.x）
  function renderGroupBar() {
    const main = document.getElementById('cj-main');
    if (!main) return;
    let bar = document.getElementById('cj-groups');
    if (!bar) {
      bar = el('div', 'cj-groups');
      bar.id = 'cj-groups';
      main.insertBefore(bar, main.firstChild);
    }
    bar.innerHTML = '';
    function chip(label, val) {
      const b = el('button', 'cj-gchip' + (viewCid === val ? ' on' : ''), label);
      b.type = 'button';
      b.addEventListener('click', e => {
        e.stopPropagation();
        setView(val);
      });
      bar.appendChild(b);
    }
    contacts().forEach(ct => chip(contactName(ct.id), ct.id));
    chip('全部', ALL);
  }
  function setView(v) {
    if (viewCid === v) return;
    viewCid = v;
    // 不清缓存：同一浏览期内每个视图的今日预测各自保持稳定，切回来还是原来那份
    window.renderCjian(false);
    const main = document.getElementById('cj-main');
    if (main) main.scrollTop = 0;
  }

  function cardEl(c, cid, s) {
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
      // 不是当前桌面的梦角：先切到 TA 所在桌面再进聊天
      try { if (cid !== curCid() && window.setActiveContact) window.setActiveContact(cid); } catch (err) {}
      if (window.enterChat) window.enterChat();
      else toast('聊天页未就绪');
    });
    card.appendChild(goBtn);
    card.addEventListener('click', () => window.cjianOpenDetail(c.id, cid));
    return card;
  }
  function renderList() {
    const listEl = document.getElementById('cj-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    const empty = document.getElementById('cj-empty');
    const now = Date.now();
    if (viewCid === ALL) {
      // 总览模式：按桌面分组，一次看完全部梦角状态
      if (empty) empty.hidden = true;
      let any = false;
      contacts().forEach(ct => {
        const roster = loadRoster(ct.id);
        const head = el('div', 'cj-group-head');
        head.appendChild(el('span', null, contactName(ct.id)));
        head.appendChild(el('span', 'cj-group-count', roster.length + '位'));
        listEl.appendChild(head);
        if (!roster.length) {
          listEl.appendChild(el('div', 'cj-group-empty', '这个桌面还没有梦角。'));
          return;
        }
        any = true;
        const st = loadState(ct.id);
        roster.forEach(c => listEl.appendChild(cardEl(c, ct.id, ensureState(c, st, now))));
      });
      if (!any) listEl.appendChild(el('div', 'cj-all-tip', '各个桌面还没有梦角。'));
      return;
    }
    const cid = viewCid || curCid();
    const roster = loadRoster(cid);
    if (empty) empty.hidden = roster.length > 0;
    if (!roster.length) return;
    const st = loadState(cid);
    roster.forEach(c => listEl.appendChild(cardEl(c, cid, ensureState(c, st, now))));
  }

  // ---- 梦角详情（TA 自己的一天；可上一位/下一位直接切换别的梦角） ----
  let detailId = '', detailCid = '';
  window.cjianOpenDetail = function (id, cid) {
    const main = document.getElementById('cj-main');
    const det = document.getElementById('cj-detail');
    if (!main || !det) return;
    detailId = id;
    detailCid = cid || cidOfDreamer(id) || curCid();
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
    detailCid = '';
  };
  function renderDetail() {
    const body = document.getElementById('cj-detail-body');
    if (!body) return;
    body.innerHTML = '';
    const c = loadRoster(detailCid).find(x => x.id === detailId);
    if (!c) { window.cjianCloseDetail(); return; }
    const now = Date.now();
    const st = loadState(detailCid);
    const s = ensureState(c, st, now);
    const t = timeInfo(worldNow(c.offsetMin));
    body.appendChild(el('div', 'cj-d-name', c.name));
    body.appendChild(el('div', 'cj-d-offset', offsetLabel(c.offsetMin)));
    body.appendChild(el('div', 'cj-d-src', '来自「' + contactName(detailCid) + '」的此间'));
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
    // 上一位 / 下一位：不回列表直接切换查看别的梦角（跨桌面，循环）
    const entries = flatEntries();
    const pos = entries.findIndex(en => en.c.id === detailId);
    if (pos >= 0 && entries.length > 1) {
      function jump(en) { detailId = en.c.id; detailCid = en.cid; renderDetail(); }
      const nav = el('div', 'cj-d-nav');
      const prevB = el('button', 'cj-d-nav-btn', '‹ 上一位');
      prevB.type = 'button';
      prevB.addEventListener('click', e => {
        e.stopPropagation();
        jump(entries[(pos - 1 + entries.length) % entries.length]);
      });
      nav.appendChild(prevB);
      nav.appendChild(el('span', 'cj-d-nav-pos', (pos + 1) + '/' + entries.length));
      const nextB = el('button', 'cj-d-nav-btn', '下一位 ›');
      nextB.type = 'button';
      nextB.addEventListener('click', e => {
        e.stopPropagation();
        jump(entries[(pos + 1) % entries.length]);
      });
      nav.appendChild(nextB);
      body.appendChild(nav);
    }
    const goBtn = el('button', 'cj-go', '去找TA');
    goBtn.type = 'button';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { if (detailCid !== curCid() && window.setActiveContact) window.setActiveContact(detailCid); } catch (err) {}
      if (window.enterChat) window.enterChat();
      else toast('聊天页未就绪');
    });
    body.appendChild(goBtn);
  }

  // ---- 整页渲染 ----
  window.renderCjian = function (forceForecast) {
    ensureAllSeeds();
    if (viewCid !== ALL && !contacts().some(ct => ct.id === viewCid)) viewCid = curCid(); // 视图兜底
    if (forceForecast) todayCacheMap = {}; // 每次打开此间：TA们重新选择今天的可能样子
    if (!todayCacheMap[scopeKey()]) rollTodayForecast();
    refreshStates();
    renderHero();
    renderGroupBar();
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
    viewCid = curCid(); // 每次打开回到当前桌面
    window.renderCjian(true);
  };
  window.closeCjian = function () {
    const page = document.getElementById('page-cjian');
    if (page) page.hidden = true;
  };

  // ---- 梦角管理：添加/改名/删除（单弹窗多阶段，openModal 控制器） ----
  // 总览模式下先进「选桌面」阶段，管理动作作用于所选桌面自己的名单。
  const OFFSET_PILLS = [
    { label: '与现实同步', value: '0' },
    { label: '比现实快1小时', value: '60' },
    { label: '比现实慢1小时', value: '-60' },
    { label: '比现实快3小时', value: '180' },
    { label: '比现实慢3小时', value: '-180' },
    { label: '独立时间流', value: 'rand' }
  ];
  const ACTION_PILLS = [
    { label: '添加梦角', value: 'add' },
    { label: '改名', value: 'rename' },
    { label: '删除梦角', value: 'del' }
  ];
  // 独立时间流：一个只属于TA自己的随机偏移（非整点，跨天稳定）
  function randomOffset() {
    let off = rand(10, 540);
    if (off % 60 === 0) off += 17;
    return (Math.random() < 0.5 ? -1 : 1) * off;
  }
  window.cjianManage = function () {
    if (!window.openModal) return;
    let mCid = (viewCid === ALL) ? '' : (viewCid || curCid());
    let phase = mCid ? 'action' : 'pickGroup', pendingName = '', renameTarget = null;
    const ctl = window.openModal('梦角管理', '', function (v) {
      if (!v) return;
      if (phase === 'pickGroup') {
        mCid = v;
        phase = 'action';
        ctl.stay();
        ctl.title('梦角管理 · 「' + contactName(mCid) + '」');
        ctl.input(false);
        ctl.pills(ACTION_PILLS);
        return;
      }
      if (phase === 'action') {
        if (v === 'add') {
          phase = 'name';
          ctl.stay();
          ctl.title('添加梦角 · 「' + contactName(mCid) + '」');
          ctl.pills(null);
          ctl.input(true);
          ctl.maxLen(10);
          ctl.ph('梦角的名字，如：景元');
          ctl.okText('下一步');
        } else {
          const list = loadRoster(mCid);
          if (!list.length) { toast('这个桌面还没有梦角，先添加一个吧'); return; }
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
        const list = loadRoster(mCid);
        list.push({ id: makeId(), name: pendingName, offsetMin: off });
        saveRoster(list, mCid);
        toast('已加入此间：「' + pendingName + '」');
        phase = ''; pendingName = '';
        todayCacheMap = {}; // 名单变了，各视图的今日预测全部作废
        window.renderCjian(true);
        return;
      }
      if (phase === 'pickRename') {
        const list = loadRoster(mCid);
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
        const list = loadRoster(mCid);
        const c = list.find(x => x.id === (renameTarget ? renameTarget.id : ''));
        if (c) {
          c.name = n;
          saveRoster(list, mCid);
          toast('已改名为「' + n + '」');
        }
        phase = ''; renameTarget = null;
        todayCacheMap = {}; // 名字出现在今日预测里，一并作废
        window.renderCjian(true);
        return;
      }
      if (phase === 'pickDel') {
        const list = loadRoster(mCid);
        const idx = list.findIndex(x => x.id === v);
        if (idx < 0) return;
        const name = list[idx].name;
        list.splice(idx, 1);
        saveRoster(list, mCid);
        const st = loadState(mCid);
        delete st[v];
        saveState(st, mCid);
        // v3.14.x：同步清掉 TA 的梦角档案（narc-<id>，memo-arc.js 存根命名空间）
        // 与指向 TA 的 narc-cur（档案页打开时会自愈，这里顺手清干净不留孤儿数据）
        try {
          const r0 = rootStore();
          if (r0) {
            r0.remove('narc-' + v);
            if ((r0.get('narc-cur') || '') === v) r0.remove('narc-cur');
          }
        } catch (err) {}
        toast('「' + name + '」已从此间离开');
        phase = '';
        if (detailId === v) window.cjianCloseDetail();
        todayCacheMap = {}; // 名单变了，各视图的今日预测全部作废
        window.renderCjian(true);
        return;
      }
    }, mCid ? { noInput: true, pills: ACTION_PILLS } : { noInput: true, pills: contacts().map(ct => ({ label: contactName(ct.id), value: ct.id })) });
  };

  // ---- 定时器：随机刷新 + 突然靠近 + 页面打开时刷新时钟 ----
  function pageVisible() {
    const page = document.getElementById('page-cjian');
    return !!(page && !page.hidden);
  }
  function boot() {
    migrateSplit();
    ensureAllSeeds();
    // 迁移时机加固：IndexedDB 回填（mochi-restore-done）可能晚于本模块启动——旧全局键
    // 迟到时首次迁移会扑空（老梦角要等下次刷新才合并回来）。就绪后幂等重跑一次合并
    // （并集去重 + 清根键，重复执行无副作用），升级当天即可见老梦角。
    let reMigrated = false;
    document.addEventListener('mochi-restore-done', function () {
      if (reMigrated) return;
      reMigrated = true;
      try { migrateSplit(); } catch (e) {}
    });
    setInterval(function () {
      tickApproach();
      if (pageVisible()) window.renderCjian(false);
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pageVisible()) window.renderCjian(false);
    });
    // 分组条吸顶态：滚离顶部后才有底色/阴影（平时透明贴合页面渐变）。
    // rAF 合帧 + passive 监听，滚动主线程零阻塞（低端安卓也不抖）
    const scroller = document.getElementById('cj-main');
    if (scroller) {
      let stickTick = false;
      scroller.addEventListener('scroll', function () {
        if (stickTick) return;
        stickTick = true;
        requestAnimationFrame(function () {
          stickTick = false;
          const barEl = document.getElementById('cj-groups');
          if (barEl) barEl.classList.toggle('stuck', scroller.scrollTop > 4);
        });
      }, { passive: true });
    }
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

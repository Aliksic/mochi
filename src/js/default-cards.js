// ===== 功能：聊天默认字卡 =====
// 数据来自星言简易版默认通用字卡；可开关；分类浏览（主字卡/颜文字/emoji）；
// 开启后联系人回复按「整体概率 + 分类占比」混入默认字卡
(function () {
  const list = document.getElementById('dc-list');
  const tabsWrap = document.getElementById('dc-tabs');
  const enabledEl = document.getElementById('dc-enabled');
  if (!list || !tabsWrap || !enabledEl) return;

  const uid = window.activePrefix();
  const ls = window.activeStore();
  // v3.6.x：轻提示（复用 cc-toast 风格）
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  function toastCard(txt, off) {
    const s = String(txt == null ? '' : txt);
    toast((off ? '已关闭：' : '已开启：') + (s.length > 18 ? s.slice(0, 18) + '…' : s));
  }
  // ---- 开关/概率读取（store 参数化）----
  // 所有 dc-* 键都按桌面（联系人命名空间）独立保存；顶层 API 绑 activeStore（当前
  // 桌面），群聊等跨桌面场景用 defaultCardApiFor(目标桌面 store) 按成员自己的桌面读。
  // 默认值（对应星言 defaultCommonOverallProb=30, probs 各30）
  function apiFor(st) {
    const gE = function () { const v = st.get('dc-enabled'); return v === null ? true : v === '1'; };
    const gO = function () { const v = st.get('dc-overall'); return v === null ? 30 : Number(v); };
    const gP = function (k) { const v = st.get('dc-prob-' + k); return v === null ? 30 : Number(v); };
    const gU = function (k) { const v = st.get('dc-use-' + k); return v === null ? true : v === '1'; };
    const gC = function (k) { const v = st.get('dc-cat-' + k); return v === null ? true : v === '1'; };
    const gOff = function (cat, c) { return st.get('dc-off-' + cat + ':' + c) === '1'; };
    return {
      enabled: gE,
      overall: gO,
      prob: gP,
      use: gU,
      cat: gC,
      isOff: gOff,
      // 不依赖 this（箭头闭包）——调用方解构单个方法也不会丢上下文
      cfg: function () {
        return { enabled: gE(), overall: gO(), probs: { main: gP('main'), kaomoji: gP('kaomoji'), emoji: gP('emoji'), touch: gP('touch') } };
      }
    };
  }
  const api = apiFor(ls);
  function getEnabled() { return api.enabled(); }
  function getOverall() { return api.overall(); }
  function getProb(k) { return api.prob(k); }
  // v3.7.x：场景开关——默认字卡可分别用于 聊天 / 信箱 / 朋友圈（默认全开）
  //   存 localStorage 键：dc-use-chat / dc-use-mail / dc-use-feed（'1' 开启）
  function getUse(k) { return api.use(k); }
  function setUse(k, on) { ls.set('dc-use-' + k, on ? '1' : '0'); }
  window.defaultCardUse = function (k) { return getUse(k); };
  // v3.8.x：分类开关——主字卡 / 颜文字 / emoji / 拍一拍 可分别开启/关闭（默认全开）
  //   存 localStorage 键：dc-cat-<k>（'1' 开启）；关闭后该分类不参与聊天混入/信箱混入/
  //   朋友圈补池/拍一拍抽取
  function getCat(k) { return api.cat(k); }
  function setCat(k, on) { ls.set('dc-cat-' + k, on ? '1' : '0'); }
  window.defaultCardCat = function (k) { return getCat(k); };
  window.defaultCardCfg = function () { return api.cfg(); };
  // v3.12.x：按指定桌面的 store 读一套开关（供群聊按成员所在桌面取：
  // 某成员桌面关闭【聊天使用】→ 单聊和群聊里这个成员都不再使用默认字卡）
  window.defaultCardApiFor = apiFor;

  // 数据（提取自星言 08_default_cards_data.js）
  const DATA = (window.DEFAULT_CARD_DATA) || { main: [], kaomoji: [], emoji: [] };

  // v3.6.x：单卡开关——系统预设字卡可逐张开启/关闭使用
  //   存 localStorage 键：dc-off-<分类>:<字卡内容>，关闭为 '1'
  function isCardOff(cat, c) { return api.isOff(cat, c); }
  function setCardOff(cat, c, off) { ls.set('dc-off-' + cat + ':' + c, off ? '1' : '0'); }
  // v3.6.x：暴露单卡开关查询（供 chat.js 字卡池兜底过滤：自定义字卡为空时
  //   系统字卡补池也必须跳过用户已关闭的字卡）
  window.isDefaultCardOff = function (cat, c) { return isCardOff(cat, c); };

  // ---- 页面 UI ----
  let cur = 'main';
  let q = '';
  enabledEl.checked = getEnabled();
  enabledEl.addEventListener('change', () => {
    ls.set('dc-enabled', enabledEl.checked ? '1' : '0');
    // v3.6.x：总开关也弹轻提示（与单卡开关一致）
    toast(enabledEl.checked ? '已开启：使用系统预设字卡' : '已关闭：使用系统预设字卡');
  });
  // v3.7.x：场景开关绑定——聊天 / 信箱 / 朋友圈 分别控制默认字卡的使用
  [['chat', '聊天'], ['mail', '信箱'], ['feed', '朋友圈']].forEach(([k, label]) => {
    const el = document.getElementById('dc-use-' + k);
    if (!el) return;
    el.checked = getUse(k);
    el.addEventListener('change', () => {
      setUse(k, el.checked);
      toast((el.checked ? '已开启' : '已关闭') + '：默认字卡' + label + '使用');
    });
  });
  // v3.12.x：场景开关下方小字说明——dc-* 键按桌面（联系人）独立保存；
  // 某联系人桌面关闭【聊天使用】，单聊和群聊里这个联系人都不会再使用默认字卡
  (function () {
    const row = document.getElementById('dc-use-feed');
    if (!row) return;
    const grp = row.closest('.set-group');
    if (!grp || document.getElementById('dc-scope-note')) return;
    const note = document.createElement('div');
    note.id = 'dc-scope-note';
    note.style.cssText = 'margin:8px 12px 10px;font-size:11px;line-height:1.6;color:#999;';
    note.textContent = '以上开关按当前桌面对应的联系人独立保存：当当前桌面联系人关闭【聊天使用】，聊天和群聊里这个联系人也无法使用默认字卡（其他联系人不受影响）。';
    grp.parentNode.insertBefore(note, grp.nextSibling);
  })();
  // v3.8.x：分类开关绑定——主字卡 / 颜文字 / emoji / 拍一拍 分别控制默认字卡分类使用
  [['main', '主字卡'], ['kaomoji', '颜文字'], ['emoji', 'emoji'], ['touch', '拍一拍']].forEach(([k, label]) => {
    const el = document.getElementById('dc-cat-' + k);
    if (!el) return;
    el.checked = getCat(k);
    el.addEventListener('change', () => {
      setCat(k, el.checked);
      toast((el.checked ? '已开启' : '已关闭') + '：默认字卡' + label + '使用');
    });
  });

  let curGroup = '';
  function renderGroupsBar2() {
    const bar = document.getElementById('dc-groups-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const grps = DATA[cur] || [];
    const chips = [['', '全部']].concat(grps.map(g => [g[0], g[0]]));
    chips.forEach(([val, label]) => {
      const cEl = document.createElement('span');
      cEl.className = 'cc-g-chip' + (curGroup === val ? ' sel' : '');
      cEl.textContent = label;
      cEl.addEventListener('click', () => { curGroup = val; renderGroupsBar2(); render(); });
      bar.appendChild(cEl);
    });
  }
  // v3.7.x：分批渲染——main 分类 4621 张字卡一次性同步构建 DOM（每卡 div+innerHTML+
  // querySelector+addEventListener）会阻塞 iOS Safari 主线程数百毫秒到数秒，低端机白屏；
  // 改为每帧挂载一批（rAF + DocumentFragment），首屏立即可滚动，后续渐进填充。
  // 切换 tab/分组/搜索时递增 renderToken，旧批次发现 token 不匹配即废弃，防旧卡复活。
  const RENDER_BATCH = 120;
  let renderToken = 0;
  // change 委托查表：idx → {c, item, input}。原每卡一个 change 监听器（4621 个）是
  // 内存与启动负担，改为 list 单一 change 监听器按 data-idx 查表（rec.input 校验防旧批次残留）
  let cardByIdx = [];
  function render() {
    const token = ++renderToken;
    const grps = DATA[cur] || [];
    let shown = grps;
    if (curGroup) shown = shown.filter(g => g[0] === curGroup);
    if (q) {
      // 基于已选分组过滤后的 shown 再筛内容（v3.6.x：修复搜索覆盖分组筛选的 bug）
      shown = shown.map(([g, arr]) => [g, arr.filter(c => c.indexOf(q) >= 0)]).filter(([g, arr]) => arr.length || g.indexOf(q) >= 0);
    }
    list.innerHTML = '';
    cardByIdx = [];
    if (!shown.length) {
      list.innerHTML = '<div class="cc-empty">暂无默认字卡</div>';
      return;
    }
    // 展开扁平结构：分组 header 与字卡项交错
    const flat = [];
    shown.forEach(([gname, arr]) => {
      flat.push({ header: true, gname, count: arr.length });
      arr.forEach(c => flat.push({ header: false, c }));
    });
    const frag = document.createDocumentFragment();
    let pos = 0;
    const step = () => {
      if (token !== renderToken) return; // 新渲染已开始，废弃本批次
      const end = Math.min(pos + RENDER_BATCH, flat.length);
      for (; pos < end; pos++) {
        const it = flat[pos];
        if (it.header) {
          const h = document.createElement('div');
          h.className = 'cc-group-header';
          h.innerHTML = '<span class="ccg-name">' + it.gname + '</span><span class="ccg-count">' + it.count + '</span>';
          frag.appendChild(h);
        } else {
          const c = it.c;
          const off = isCardOff(cur, c);
          const d = document.createElement('div');
          d.className = 'cc-item glass' + (off ? ' off' : '');
          // v3.6.x：整页为系统预设字卡，统一标【系统】与自定义字卡区分；
          // 右侧单卡开关——逐张开启/关闭该字卡（关闭后聊天回复不再抽取）
          d.innerHTML = '<div class="cc-txt"><div class="t">' + c + ' <span class="tc-known">系统</span></div></div>' +
            '<label class="toggle ccard-toggle"><input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span></label>';
          d.dataset.idx = cardByIdx.length;
          cardByIdx.push({ c, item: d, input: d.querySelector('input') });
          frag.appendChild(d);
        }
      }
      // 每帧挂载一批：列表渐进出现，首屏立即可滚动
      list.appendChild(frag);
      if (pos < flat.length) requestAnimationFrame(step);
    };
    step(); // 首帧同步跑第一批（小列表一次完成，行为与原一致）
  }
  // v3.7.x：change 事件委托——list 单一监听器替代每卡一个（4621 → 1）
  list.addEventListener('change', (e) => {
    const input = e.target;
    if (!input || input.type !== 'checkbox') return;
    const item = input.closest('.cc-item');
    if (!item) return;
    const rec = cardByIdx[Number(item.dataset.idx)];
    if (!rec || rec.input !== input) return; // 旧批次残留 DOM，忽略
    const nowOff = !input.checked;
    setCardOff(cur, rec.c, nowOff);
    item.classList.toggle('off', nowOff);
    toastCard(rec.c, nowOff);
  });

  // v3.7.x：互动回应 tab（JS 注入，避免改 template.html）——展示互动卡片预设话术池
  // （邀请TA 接受/拒绝、问问TA 回应、小问题/好奇/吐槽/询问 的预设回应，数据在
  // DEFAULT_CARD_DATA.interact）；逐张开关（dc-off-interact-*）与互动回复抽取联动，
  // ta-ask.js pickAskCardReply / chat.js chatChooseReply 会读取该开关过滤已关闭话术
  if (!tabsWrap.querySelector('[data-type="interact"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'interact';
    b.textContent = '互动回应';
    tabsWrap.appendChild(b);
  }
  // v3.13.x：摸鱼浮字 tab（JS 注入）——TA 摸鱼值上涨时的桌面浮字与抓包回应预设池
  //（DEFAULT_CARD_DATA.fish）；逐张开关（dc-off-fish:*）与 p2-features.js 实际抽取联动
  if (!tabsWrap.querySelector('[data-type="fish"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'fish';
    b.textContent = '摸鱼浮字';
    tabsWrap.appendChild(b);
  }
  // v3.13.x：花园/同频/伸手/喝水/存钱罐 tab（JS 注入）——各功能预设话术池
  //（DEFAULT_CARD_DATA.garden/sync/reach/water/piggy）；逐张开关与实际抽取联动
  [['garden', '花园'], ['sync', '同频'], ['reach', '伸手'], ['water', '喝水'], ['piggy', '存钱罐']].forEach(([k, label]) => {
    if (!tabsWrap.querySelector('[data-type="' + k + '"]')) {
      const b = document.createElement('button');
      b.className = 'cc-tab';
      b.dataset.type = k;
      b.textContent = label;
      tabsWrap.appendChild(b);
    }
  });
  // v3.15.x：房间 tab（JS 注入）——双人小屋互动话术池（DEFAULT_CARD_DATA.room，
  // 进门/打招呼/靠近/坐到旁边等分组）；逐张开关（dc-off-room:*）与 room.js 实际抽取联动
  if (!tabsWrap.querySelector('[data-type="room"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'room';
    b.textContent = '房间';
    tabsWrap.appendChild(b);
  }
  // v3.14.x：经期关心 tab（JS 注入）——period.js 梦角关心触发同源预设池
  //（DEFAULT_CARD_DATA.period）；逐张开关（dc-off-period:*）与 period.js pickCareLine 联动
  if (!tabsWrap.querySelector('[data-type="period"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'period';
    b.textContent = '经期关心';
    tabsWrap.appendChild(b);
  }
  // v3.14.x：吃什么 tab（JS 注入）——TA 饭点概率提醒话术池（DEFAULT_CARD_DATA.eat，
  // 分组「提醒吃饭/追问关心」）；逐张开关（dc-off-eat:*）与 p2-features.js 实际抽取联动
  if (!tabsWrap.querySelector('[data-type="eat"]')) {
    const b = document.createElement('button');
    b.className = 'cc-tab';
    b.dataset.type = 'eat';
    b.textContent = '吃什么';
    tabsWrap.appendChild(b);
  }

  tabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.remove('sel'));
      tab.classList.add('sel');
      cur = tab.dataset.type;
      q = '';
      curGroup = '';
      renderGroupsBar2();
      render();
    });
  });

  // 搜索：页内输入框直接过滤（v3.6.x：与自定义聊天字卡一致，不再弹窗，输入即筛，清空即恢复）
  const searchInput = document.getElementById('dc-search-input');
  if (searchInput) {
    // v3.5.138：不再标记 ceDone 跳过 contenteditable 转换——手机 Chrome 对
    // 原生 input 聚焦弹「自动填充」白条；ce-box 兼容 input 转发 + value 代理
    // v3.7.x：150ms 防抖——main 分类 4621 张字卡每敲一个字全量渲染会卡，输入停顿后再筛
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      q = searchInput.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 150);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { searchInput.value = ''; q = ''; render(); searchInput.blur(); }
    });
  }

  // v3.6.x：懒渲染——4621+ 张系统字卡在启动时全部构建 DOM（每个都带开关 toggle），
  // 低端机（尤其 iOS Safari）启动同步构建数百毫秒级 DOM，改为首次打开「系统字卡」
  // 页才构建；聊天抽取（defaultCardCfg）走数据不依赖 DOM，功能不受影响
  let renderedOnce = false;
  function ensureRendered() {
    if (renderedOnce) return;
    renderedOnce = true;
    renderGroupsBar2();
    render();
  }

  // 入口/返回
  const li = document.getElementById('li-default-cards');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-default-cards');
      if (page) page.hidden = false;
      ensureRendered();
    });
  }
  const back = document.getElementById('dc-back');
  if (back) {
    back.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }

  // ---- 回复混入：供 chat.js 调用 ----
  // 返回当前分类下按权重选中一个分组的字卡数组；未触发返回 []
  // v3.12.x：核心逻辑抽成 getDefaultCardsFor(st)——st 传目标桌面 store；
  //   群聊用它按成员所在桌面抽取（成员桌面关了聊天使用 → 该成员在群聊里也不用默认字卡）
  function drawCards(a) {
    // v3.7.x：聊天场景开关——关闭后聊天回复混入/拍一拍均不使用默认字卡
    if (!a.use('chat')) return [];
    const cfg = a.cfg();
    if (!cfg.enabled) return [];
    if (Math.random() * 100 >= cfg.overall) return [];
    // 按 probs 加权选分类（v3.8.x：已关闭的分类权重按 0 处理，不参与抽取）
    const keys = ['main', 'kaomoji', 'emoji', 'touch'];
    const weights = keys.map(k => (a.cat(k) ? Math.max(0, cfg.probs[k] || 0) : 0));
    const total = weights.reduce((x, y) => x + y, 0);
    if (total <= 0) return [];
    let roll = Math.random() * total;
    let chosen = 'main';
    for (let i = 0; i < keys.length; i++) {
      roll -= weights[i];
      if (roll < 0) { chosen = keys[i]; break; }
    }
    // v3.6.x：单卡开关过滤——用户关闭的字卡不参与抽取，整组关完则跳过该组
    const grps = (DATA[chosen] || [])
      .map(g => [g[0], g[1].filter(c => !a.isOff(chosen, c))])
      .filter(g => g[1].length);
    if (!grps.length) return [];
    const g = grps[Math.floor(Math.random() * grps.length)];
    const text = g[1][Math.floor(Math.random() * g[1].length)];
    return { text: text, type: chosen === 'touch' ? 'poke' : 'text' };
  }
  window.getDefaultCardsFor = function (st) { return drawCards(apiFor(st)); };
  window.getDefaultCards = function () { return drawCards(api); };
  // 默认字卡分组（供页面按分组查看）
  window.getDefaultCardGroups = function (cat) {
    return (DATA[cat] || []).slice();
  };
  // v3.7.x：互动回应预设池读取（供互动卡片回复侧使用）——name 分组名（邀请TA·接受/
  // 邀请TA·拒绝/问问TA·回应/小问题·回应/好奇·回应/吐槽·回应/询问·回应），
  // 与「互动回应」tab 展示同源（DEFAULT_CARD_DATA.interact）；数据缺失时回退 fallback
  // v3.7.x：互动回应预设池读取（供互动卡片回复侧使用）——name 分组名（邀请TA·接受/
  // 邀请TA·拒绝/问问TA·回应/小问题·回应/好奇·回应/吐槽·回应/询问·回应），
  // 与「互动回应」tab 展示同源（DEFAULT_CARD_DATA.interact）；数据缺失时回退 fallback
  // v3.13.x：泛化为 getLibPool(分类, 分组, 兜底)——摸鱼浮字/花园/同频/伸手/喝水/存钱罐
  // 各功能统一走它取同源池（消费侧再按 isDefaultCardOff(分类, 文案) 过滤已关卡片）
  window.getLibPool = function (cat, group, fallback) {
    const g = (DATA[cat] || []).find(x => x[0] === group);
    const arr = g && Array.isArray(g[1]) && g[1].length ? g[1] : (Array.isArray(fallback) ? fallback : []);
    return arr.slice();
  };
  window.getInteractPool = function (name, fallback) {
    return window.getLibPool('interact', name, fallback);
  };
  window.getFishPool = function (name, fallback) {
    return window.getLibPool('fish', name, fallback);
  };
})();

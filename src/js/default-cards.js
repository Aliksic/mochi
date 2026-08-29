// ===== 功能：聊天默认字卡 + 其他互动功能字卡 =====
// 数据来自星言简易版默认通用字卡；可开关；分类浏览（主字卡/颜文字/emoji）；
// 开启后联系人回复按「整体概率 + 分类占比」混入默认字卡
// v3.16.x：功能触发字卡（摸鱼/吃饭/经期/喝水/花园/同频/伸手/此间/房间/存钱罐/
// 漂流瓶/互动回应）从「聊天默认字卡」页拆出，独立成「其他互动功能字卡」页——
// 这些字卡不是聊天通用回复，是触发对应功能时联系人才会使用。
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

  // v3.16.x：字卡库入口角标数量动态化——template.html 里写死的「3260」早已过期
  //（主字卡现 4621，全库含互动回应/摸鱼/吃什么/经期/喝水/花园等同源功能池共 5800+），
  // 改为按 DEFAULT_CARD_DATA 全部分类实时合计；后续新增分类角标自动跟上不再写死。
  // v3.16.x：拆页后「聊天默认字卡」角标只统计四大基础分类；
  // 「其他互动功能字卡」入口角标统计全部功能分类（fish/eat/period/water/garden/
  // sync/reach/cjian/room/piggy/drift/interact）。
  // deskcheck（联系人跨桌面查岗）独立成系统预设字卡里的单独入口，见 page-deskcheck。
  const FUNC_KEYS = ['fish', 'eat', 'period', 'water', 'garden', 'sync', 'reach', 'cjian', 'room', 'piggy', 'drift', 'interact'];
  const BASE_KEYS = ['main', 'kaomoji', 'emoji', 'touch'];
  function sumKeys(keys) {
    let n = 0;
    keys.forEach(k => { (DATA[k] || []).forEach(g => { n += Array.isArray(g[1]) ? g[1].length : 0; }); });
    return n;
  }
  function refreshLibCount() {
    const el = document.getElementById('dc-lib-count');
    if (el) el.textContent = String(sumKeys(BASE_KEYS));
    const fel = document.getElementById('fc-lib-count');
    if (fel) fel.textContent = String(sumKeys(FUNC_KEYS));
    const dkel = document.getElementById('dk-lib-count');
    if (dkel) dkel.textContent = String(sumKeys(['deskcheck']));
  }
  refreshLibCount();

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
  // v3.26.x：小键写日志异步合并（idb.js mochi-wrj-heal）把 dc-* 键修正后，重同步
  // 总开关/场景开关/分类开关的 UI——修荣耀 Edge 杀进程回滚 LS 后「开关退出重进变回去」
  // 且已打开的设置页仍显示旧值的问题
  document.addEventListener('mochi-wrj-heal', function () {
    try {
      enabledEl.checked = getEnabled();
      ['chat', 'mail', 'feed'].forEach(function (k) {
        const el = document.getElementById('dc-use-' + k);
        if (el) el.checked = getUse(k);
      });
      ['main', 'kaomoji', 'emoji', 'touch'].forEach(function (k) {
        const el = document.getElementById('dc-cat-' + k);
        if (el) el.checked = getCat(k);
      });
    } catch (e) {}
  });

  // ---- 双页共用渲染内核 ----
  // v3.16.x：把「分类 tab + 分组条 + 搜索 + 分批列表 + change 委托」抽成工厂，
  // 聊天默认字卡页（dc-* 锚点，仅基础分类）与 其他互动功能字卡页（fc-* 锚点，
  // 仅功能分类）各持一份独立状态；数据/开关键（dc-off-<分类>:*）与池 API 完全不变。
  function mountCardView(ids, allowedKeys, emptyText) {
    const viewList = document.getElementById(ids.list);
    const viewTabs = document.getElementById(ids.tabs);
    const viewBar = document.getElementById(ids.groupsBar);
    const viewSearch = document.getElementById(ids.search);
    const pageEl = document.getElementById(ids.page);
    if (!viewList || !viewTabs || !viewBar || !viewSearch || !pageEl) return null;
    const view = {
      keys: allowedKeys.slice(),
      cur: allowedKeys[0] || '',
      q: '',
      curGroup: '',
      cardByIdx: [],
      renderToken: 0,
      RENDER_BATCH: 120
    };
    function renderGroupsBar() {
      viewBar.innerHTML = '';
      const grps = DATA[view.cur] || [];
      const chips = [['', '全部']].concat(grps.map(g => [g[0], g[0]]));
      chips.forEach(([val, label]) => {
        const cEl = document.createElement('span');
        cEl.className = 'cc-g-chip' + (view.curGroup === val ? ' sel' : '');
        cEl.textContent = label;
        cEl.addEventListener('click', () => { view.curGroup = val; renderGroupsBar(); render(); });
        viewBar.appendChild(cEl);
      });
    }
    function render() {
      const token = ++view.renderToken;
      const grps = DATA[view.cur] || [];
      let shown = grps;
      if (view.curGroup) shown = shown.filter(g => g[0] === view.curGroup);
      if (view.q) {
        shown = shown.map(([g, arr]) => [g, arr.filter(c => c.indexOf(view.q) >= 0)]).filter(([g, arr]) => arr.length || g.indexOf(view.q) >= 0);
      }
      viewList.innerHTML = '';
      view.cardByIdx = [];
      if (!shown.length) {
        viewList.innerHTML = '<div class="cc-empty">' + emptyText + '</div>';
        return;
      }
      const flat = [];
      shown.forEach(([gname, arr]) => {
        flat.push({ header: true, gname, count: arr.length });
        arr.forEach(c => flat.push({ header: false, c }));
      });
      const frag = document.createDocumentFragment();
      let pos = 0;
      const step = () => {
        if (token !== view.renderToken) return;
        const end = Math.min(pos + view.RENDER_BATCH, flat.length);
        for (; pos < end; pos++) {
          const it = flat[pos];
          if (it.header) {
            const h = document.createElement('div');
            h.className = 'cc-group-header';
            h.innerHTML = '<span class="ccg-name">' + it.gname + '</span><span class="ccg-count">' + it.count + '</span>';
            frag.appendChild(h);
          } else {
            const c = it.c;
            const off = isCardOff(view.cur, c);
            const d = document.createElement('div');
            d.className = 'cc-item glass' + (off ? ' off' : '');
            // 整页为系统预设字卡，统一标【系统】与自定义字卡区分；
            // 右侧单卡开关——逐张开启/关闭该字卡（关闭后功能/聊天回复不再抽取）
            d.innerHTML = '<div class="cc-txt"><div class="t">' + c + ' <span class="tc-known">系统</span></div></div>' +
              '<label class="toggle ccard-toggle"><input type="checkbox"' + (off ? '' : ' checked') + '><span class="tk"></span></label>';
            d.dataset.idx = view.cardByIdx.length;
            view.cardByIdx.push({ c, item: d, input: d.querySelector('input') });
            frag.appendChild(d);
          }
        }
        viewList.appendChild(frag);
        if (pos < flat.length) requestAnimationFrame(step);
      };
      step();
    }
    // change 事件委托——list 单一监听器替代每卡一个
    viewList.addEventListener('change', (e) => {
      const input = e.target;
      if (!input || input.type !== 'checkbox') return;
      const item = input.closest('.cc-item');
      if (!item) return;
      const rec = view.cardByIdx[Number(item.dataset.idx)];
      if (!rec || rec.input !== input) return;
      const nowOff = !input.checked;
      setCardOff(view.cur, rec.c, nowOff);
      item.classList.toggle('off', nowOff);
      toastCard(rec.c, nowOff);
    });
    viewTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.cc-tab[data-type]');
      if (!tab) return;
      if (view.keys.indexOf(tab.dataset.type) < 0) return;
      viewTabs.querySelectorAll('.cc-tab').forEach(t => t.classList.remove('sel'));
      tab.classList.add('sel');
      view.cur = tab.dataset.type;
      view.q = '';
      view.curGroup = '';
      renderGroupsBar();
      render();
    });
    viewSearch.addEventListener('input', () => {
      view.q = viewSearch.value.trim();
      clearTimeout(view._searchTimer);
      view._searchTimer = setTimeout(render, 150);
    });
    viewSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { viewSearch.value = ''; view.q = ''; render(); viewSearch.blur(); }
    });
    // 懒渲染：打开页才构建（大库不阻塞启动）
    let renderedOnce = false;
    function ensureRendered() {
      if (renderedOnce) return;
      renderedOnce = true;
      refreshLibCount();
      renderGroupsBar();
      render();
    }
    return { view, ensureRendered };
  }

  // 聊天默认字卡页：仅四大基础分类
  const dcView = mountCardView({
    list: 'dc-list', tabs: 'dc-tabs', groupsBar: 'dc-groups-bar', search: 'dc-search-input', page: 'page-default-cards'
  }, BASE_KEYS, '暂无默认字卡');
  // 其他互动功能字卡页：仅功能分类（模板已预置全部功能 tab）
  const fcView = mountCardView({
    list: 'fc-list', tabs: 'fc-tabs', groupsBar: 'fc-groups-bar', search: 'fc-search-input', page: 'page-fun-cards'
  }, FUNC_KEYS, '暂无功能触发字卡');

  // 兜底：若 template 静态 fc-tabs 里缺某个 FUNC_KEYS 分类，动态补一个 tab。
  // （其余功能分类已在模板静态预置；新增功能的 tab 靠这里自动补。）
  (function () {
    const tabs = document.getElementById('fc-tabs');
    if (!tabs) return;
    const known = Array.prototype.map.call(tabs.querySelectorAll('.cc-tab'), t => t.dataset.type);
    FUNC_KEYS.forEach(function (k) {
      if (known.indexOf(k) >= 0) return;
      const b = document.createElement('button');
      b.className = 'cc-tab';
      b.dataset.type = k;
      b.textContent = k === 'deskcheck' ? '联系人跨桌面查岗' : k;
      tabs.appendChild(b);
    });
  })();

  // 联系人跨桌面查岗（独立入口，单独页面渲染）：仅 deskcheck 一个分类
  const dkView = mountCardView({
    list: 'dk-list', tabs: 'dk-tabs', groupsBar: 'dk-groups-bar', search: 'dk-search-input', page: 'page-deskcheck'
  }, ['deskcheck'], '暂无联系人跨桌面查岗字卡');

  // 入口/返回
  const li = document.getElementById('li-default-cards');
  if (li) {
    li.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-default-cards');
      if (page) page.hidden = false;
      if (dcView) dcView.ensureRendered();
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
  const liFun = document.getElementById('li-fun-cards');
  if (liFun) {
    liFun.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-fun-cards');
      if (page) page.hidden = false;
      if (fcView) fcView.ensureRendered();
    });
  }
  const fcBack = document.getElementById('fc-back');
  if (fcBack) {
    fcBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }
  const liDk = document.getElementById('li-deskcheck');
  if (liDk) {
    liDk.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const page = document.getElementById('page-deskcheck');
      if (page) page.hidden = false;
      if (dkView) dkView.ensureRendered();
    });
  }
  const dkBack = document.getElementById('dk-back');
  if (dkBack) {
    dkBack.addEventListener('click', () => {
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
  // v3.17.x：桌面查岗回应字卡池（跨桌面「来消息」查岗——回复后按概率抽取，见 chat.js）
  // v3.18.x：按方向取池——dir 'meToTa'（联系人申请我对联系人查岗）抽「联系人申请我对
  // 联系人查岗」分组，否则（toMe / 未指定）抽「联系人对我查岗」分组，过滤已关卡片
  window.getDeskCheckPool = function (dir, fallback) {
    const group = dir === 'meToTa' ? '联系人申请我对联系人查岗' : '联系人对我查岗';
    let arr = window.getLibPool('deskcheck', group, fallback);
    if (!arr.length && Array.isArray(fallback) && fallback.length) arr = fallback.slice();
    return arr.filter(c => !(window.isDefaultCardOff && window.isDefaultCardOff('deskcheck', c)));
  };
})();

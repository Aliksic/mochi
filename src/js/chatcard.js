// ===== 功能：自定义聊天字卡（分类 + 分组筛选 + 批量导入 + 图片导入） =====
// 内置分组按 7 分类预置；可新建分组、按【分组名】批量导入文字字卡；
// 【表情包】【图片】分类支持直接上传图片表情（存 dataURL）；
// 分组内的字卡会作为联系人自动回复的素材池
(function () {
  const list = document.getElementById('cc-list');
  const tabsWrap = document.getElementById('cc-tabs');
  const groupsBar = document.getElementById('cc-groups-bar');
  if (!list || !tabsWrap) return;

  const uid = window.activePrefix();
  const store = window.activeStore();

  // ================= v3.11.x：字卡双作用域（公用 / 专属） =================
  // 公用字卡：全局根命名空间键 xy-home-v2:cc-groups-public——以后每个桌面的联系人都能使用；
  // 专属字卡：各联系人命名空间键 xy-home-v2:<cid>:cc-groups（原 cc-groups，语义不变）——
  //           只有当前桌面绑定的联系人才能使用。
  // 管理页打开时由入口决定写哪个作用域；聊天/朋友圈/信箱等回复池一律取「公用+专属」合并。
  const PUB_PREFIX = 'xy-home-v2';
  const PUB_KEY = 'cc-groups-public';
  let ccScope = 'own'; // 当前管理页打开的作用域：'own'=专属 | 'public'=公用
  function pubStore() { return window.xyStore(PUB_PREFIX); }
  function curStore() { return ccScope === 'public' ? pubStore() : store; }
  function curKey() { return ccScope === 'public' ? PUB_KEY : 'cc-groups'; }
  // 解析公用键（带缓存：回复池每次发消息都会取合并池，不能反复 JSON.parse 大库）
  let pubCache = null;
  function pubInvalidate() { pubCache = null; }
  function pubGroupsRaw() {
    if (!pubCache) pubCache = buildGroupsFrom(pubStore().get(PUB_KEY));
    return pubCache;
  }
  function ownGroupsRaw() { return buildGroupsFrom(store.get('cc-groups')); }
  // 合并视图：当前作用域字卡 + 公用字卡（同分类分组拼接；只读，供回复池/搜索用）
  const CC_TYPES = ['text', 'kaomoji', 'emoji', 'sticker', 'image', 'poke', 'voice'];
  function mergeWithPublic(g) {
    const p = pubGroupsRaw();
    let has = false;
    for (let i = 0; i < CC_TYPES.length; i++) { if ((p[CC_TYPES[i]] || []).length) { has = true; break; } }
    if (!has) return g;
    const out = {};
    CC_TYPES.forEach(t => { out[t] = (g[t] || []).concat(p[t] || []); });
    Object.keys(g).forEach(t => { if (!(t in out)) out[t] = g[t]; });
    return out;
  }

  // 内置分组数据（key: 类型 -> [分组名, 字卡数组]）
  // v3.6.x：不再向用户提供系统内置预设字卡——这里仅作为「清理旧数据」的依据：
  //   老版本用户已存的这些内置字卡会被剔除（loadGroups → stripBuiltins），
  //   只保留用户自己添加的字卡；全新用户打开是空字卡库
  const BUILTIN = {
    text: [
      ['日常回应', ['哈哈哈哈哈', '好的好的，收到', '嗯嗯，我在听', '笑死我了', '我支持你', '今天也要开心呀', '没事的，别担心', '想你了']],
      ['晚安问候', ['晚安，做个好梦', '早点休息呀', '明天见啦', '睡个好觉']]
    ],
    kaomoji: [
      ['开心', ['(｡♥‿♥｡)', '(◕‿◕)', '(￣▽￣)~*', 'ᕙ(⇀‸↼‶)ᕗ']],
      ['日常', ['(¬‿¬)', '( ´･･)ﾉ(._.`)', '(ಥ_ಥ)', '(⊙_☉)', '(づ｡◕‿‿◕｡)づ']]
    ],
    emoji: [
      ['常用', ['😂', '🥰', '😭', '😡', '😳', '🤔', '😴', '🤗', '😘', '🙄']]
    ],
    sticker: [],
    image: [],
    poke: [
      ['互动', ['戳一戳', '拍了拍你', '戳了戳你的脸蛋']]
    ],
    voice: []
  };
  const MEDIA_TYPES = { sticker: '表情包', image: '图片', voice: '语音' };
  // v3.8.x：补正音频 dataURL 的 MIME。安卓部分浏览器/文件管理器（如雨见）返回的音频
  // File.type 为空，readAsDataURL 会产出 data:;base64,（空 MIME）——空 MIME 既无法被
  // new Audio() 播放，也不满足全站 data:audio 判定，会被整段 base64 当文字存下发进聊天
  // 变成乱码。这里统一按文件名扩展名推导音频 MIME 归一化。
  function audioMimeFromName(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const map = {
      mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4',
      ogg: 'audio/ogg', ogx: 'application/ogg', aac: 'audio/aac', amr: 'audio/amr',
      flac: 'audio/flac', webm: 'audio/webm', opus: 'audio/ogg'
    };
    return map[ext] || '';
  }
  function normalizeAudioDataURL(dataURL, file) {
    if (!dataURL) return dataURL;
    const m = /^data:([^;,]*);/.exec(dataURL);
    const mime = m ? m[1] : '';
    if (mime && mime.indexOf('audio/') === 0) return dataURL; // 已是有效音频 MIME
    // MIME 缺失或非音频（如 data:;base64,）：剥掉前缀取 base64 载荷，用扩展名 MIME 重拼
    const comma = dataURL.indexOf(',');
    const payload = comma >= 0 ? dataURL.slice(comma + 1) : dataURL;
    const extMime = audioMimeFromName(file && file.name) || (file && file.type) || 'audio/mpeg';
    return 'data:' + extMime + ';base64,' + payload;
  }
  const IMG_TYPES = MEDIA_TYPES;

  // v3.8.x：iOS Safari 下未挂到 DOM 的 <input type=file>.click() 不会弹出选择器，
  // 必须先 appendChild 到 body。这里统一封装：建隐藏 input → 挂 body → 点击 → 回调后清理。
  function pickFiles(accept, multiple, onFiles) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = !!multiple;
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(input);
    input.onchange = () => {
      const files = Array.prototype.slice.call(input.files || []);
      input.value = ''; // 允许重选同一文件
      try { input.remove(); } catch (e) {}
      if (onFiles) onFiles(files);
    };
    // 取消选择（change 不触发）时也清理，避免残留
    input.onblur = () => {
      setTimeout(() => { try { if (input.parentNode) input.remove(); } catch (e) {} }, 1500);
    };
    try { input.click(); } catch (e) { try { input.remove(); } catch (e2) {} }
  }

  // v3.6.x：剔除系统内置预设字卡（BUILTIN 同分组同内容）与空分组，只保留用户添加的字卡；
  // 返回是否发生了删除（供调用方决定是否写回）
  function stripBuiltins(groups) {
    let changed = false;
    Object.keys(BUILTIN).forEach(cat => {
      const gs = groups[cat];
      if (!Array.isArray(gs)) return;
      BUILTIN[cat].forEach(([gname, arr]) => {
        const g = gs.find(x => x[0] === gname);
        if (!g || !Array.isArray(g[1])) return;
        const before = g[1].length;
        g[1] = g[1].filter(c => arr.indexOf(c) < 0);
        if (g[1].length !== before) changed = true;
      });
      // 删掉因此变空的分组
      const before = gs.length;
      groups[cat] = gs.filter(g => Array.isArray(g[1]) && g[1].length);
      if (groups[cat].length !== before) changed = true;
    });
    return changed;
  }

  // 读取全部分组：{ 类型: [ [分组名, [字卡...]], ... ] }
  // v3.11.x：按当前作用域读——公用页读全局键 cc-groups-public，专属页读本联系人 cc-groups
  function loadGroups() {
    try {
      const saved = JSON.parse(curStore().get(curKey()) || 'null');
      if (saved && saved.text) {
        // 迁移：删除旧版语音占位（语音1/语音2）
        if (saved.voice) {
          let changed = false;
          saved.voice.forEach(g => {
            if (!Array.isArray(g) || !Array.isArray(g[1])) return;
            const before = g[1].length;
            g[1] = g[1].filter(c => c !== '语音1' && c !== '语音2');
            if (g[1].length !== before) changed = true;
          });
          saved.voice = saved.voice.filter(g => Array.isArray(g) && Array.isArray(g[1]) && g[1].length);
          if (changed) { try { curStore().set(curKey(), JSON.stringify(saved)); } catch (e) {} }
        }
        // v3.6.x：剔除旧版内置预设字卡（只保留用户添加的）
        if (stripBuiltins(saved)) { try { curStore().set(curKey(), JSON.stringify(saved)); } catch (e) {} }
        return saved;
      }
    } catch (e) {}
    // v3.6.x：不再自动生成系统内置预设字卡，全新用户打开是空字卡库
    return { text: [], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
  }
  // 初始化：从 IndexedDB 恢复字卡数据（权威持久库）
  // localStorage 可能因配额写失败而停留在旧数据；只要 IDB 数据【内容更多】就用 IDB 覆盖，
  // 避免新增的表情包分组/内容因 localStorage 配额问题"消失"。
  // （不采用"不一致即覆盖"：若 idbSet 偶尔失败而 localStorage 已写入最新，覆盖会反向丢数据）
  // v3.11.x：双作用域各恢复各的——专属键 xy-home-v2:<cid>:cc-groups + 公用键
  // xy-home-v2:cc-groups-public。只有与当前打开作用域一致的键才刷新内存 groups 与界面；
  // 另一个键只更新字卡库列表页角标。ownRestoreP 在专属键恢复尝试落定（成功/键不存在/
  // 重试耗尽）后 resolve，供存量归属迁移协调时序（防止迁移读到尚未恢复的空库）。
  let ownRestoreResolve = null;
  const ownRestoreP = new Promise(res => { ownRestoreResolve = res; });
  (function () {
    if (!window.idbGet) { ownRestoreResolve(); return; }
    const myPrefix = window.activePrefix();
    // v3.9.x：OPPO Chrome 等慢 IDB 浏览器首次打开可能失败/超时，原实现读到
    // undefined 直接放弃且永不重试——大键字卡库（表情包/图片 dataURL 只进 IDB）
    // 启动时读不到就显示空库（用户反馈「表情包丢失」）。改为失败后延迟重试，
    // 直到读到数据或 3 次用尽；读到后按「IDB 内容更多才覆盖」恢复。
    const MAX_RETRY = 3;
    const cardCount = (g) => {
      let n = 0;
      try { Object.keys(g).forEach(t => (g[t] || []).forEach(x => n += (Array.isArray(x[1]) ? x[1].length : 0))); } catch (e) {}
      return n;
    };
    function applyRestored(lsKey, st, data) {
      stripBuiltins(data);
      st.set(lsKey, JSON.stringify(data));
      pubInvalidate();
      // 只刷新与当前作用域一致的管理页视图；另一作用域只更新列表页角标
      if (lsKey === 'cc-groups' && ccScope === 'own' && window.activePrefix() === myPrefix) {
        groups = data;
        try { renderGroupsBar(); render(); } catch (e) {}
      } else if (lsKey === PUB_KEY && ccScope === 'public') {
        groups = data;
        try { renderGroupsBar(); render(); } catch (e) {}
      } else if (lsKey === 'cc-groups' && window.activePrefix() !== myPrefix) {
        // 恢复期间已切走联系人：数据写进新命名空间快照即可，不动界面（contact-switched 会重载）
      }
      refreshLibCounts(true);
    }
    function attempt(idbFullKey, lsKey, st, isOwn, state) {
      window.idbGet(idbFullKey).then(v => {
        if (isOwn && window.activePrefix() !== myPrefix) { ownRestoreResolve(); return; }
        if (v === undefined || v === null) {
          if (state.retry < MAX_RETRY) { state.retry++; setTimeout(() => attempt(idbFullKey, lsKey, st, isOwn, state), 800 * state.retry); return; }
          if (isOwn) ownRestoreResolve();
          return;
        }
        try {
          const data = typeof v === 'string' ? JSON.parse(v) : v;
          if (data && data.text) {
            let localData = null;
            try { localData = JSON.parse(st.get(lsKey) || 'null'); } catch (e) {}
            const localCount = localData && localData.text ? cardCount(localData) : -1;
            if (localCount < 0 || cardCount(data) > localCount) applyRestored(lsKey, st, data);
          }
        } catch (e) {}
        if (isOwn) ownRestoreResolve();
      }).catch(() => { if (isOwn) ownRestoreResolve(); });
    }
    attempt(myPrefix + ':cc-groups', 'cc-groups', store, true, { retry: 0 });
    attempt(PUB_PREFIX + ':' + PUB_KEY, PUB_KEY, pubStore(), false, { retry: 0 });
  })();
  function saveGroups(groups) {
    // 统一走适配层：localStorage 快照 + IndexedDB 权威（配额满也不丢，启动自动恢复）
    // v3.11.x：按当前作用域写入对应键
    curStore().set(curKey(), JSON.stringify(groups));
    pubInvalidate();
    refreshLibCounts(true);
  }

  let groups = loadGroups();
  let cur = 'text';
  let q = '';
  let curGroup = ''; // '' = 全部

  // 轻提示
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

  // 查看大图（字卡库 / 聊天消息 共用）
  function viewImage(src) {
    let mask = document.getElementById('img-view-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'img-view-mask';
      mask.className = 'img-view-mask';
      mask.innerHTML = '<img class="img-view-img" alt="大图">';
      mask.addEventListener('click', () => { mask.hidden = true; });
      document.body.appendChild(mask);
    }
    mask.querySelector('.img-view-img').src = src;
    mask.hidden = false;
  }
  window.viewChatImage = viewImage;

  function totalCount(g) {
    let n = 0;
    Object.keys(g).forEach(t => g[t].forEach(grp => n += grp[1].length));
    return n;
  }

  // 图片压缩（上传图片表情用）
  // v3.6.x：失败/超大图不再回退存原图——iOS Safari 解码超大 dataURL 会拖崩渲染进程
  //（画面正常但点击无响应），失败返回 null 由调用方提示换图
  function compressImage(dataUrl, maxSide, format, quality) {
    return new Promise((resolve) => {
      // 解码前拦截：>8MB base64 不解码不存储（48MP/ProRAW 级别）
      if (typeof dataUrl === 'string' && dataUrl.length > 8 * 1024 * 1024) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          // 解码后像素拦截：高压缩格式小文件也可能是超大图（48MP HEIC）
          if (img.width * img.height > 26000000) { resolve(null); return; }
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          // v3.7.x：JPEG 无透明通道，先填白底避免透明区域变黑
          if (format === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL(format || 'image/png', quality));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // 渲染分组筛选栏（每个分组显示字卡数量）
  function renderGroupsBar() {
    if (!groupsBar) return;
    groupsBar.innerHTML = '';
    const grps = groups[cur] || [];
    const allCount = grps.reduce((s, g) => s + (Array.isArray(g[1]) ? g[1].length : 0), 0);
    const chips = [['', '全部', allCount]].concat(grps.map(g => [g[0], g[0], Array.isArray(g[1]) ? g[1].length : 0]));
    chips.forEach(([val, label, n]) => {
      const c = document.createElement('span');
      c.className = 'cc-g-chip' + (curGroup === val ? ' sel' : '');
      c.textContent = label + ' (' + n + ')';
      c.addEventListener('click', () => {
        curGroup = val;
        // v3.7.x：管理模式放宽视图变化时清空已选——避免选中屏幕外（被过滤隐藏）的卡
        if (manageMode) { selected.clear(); updateCount(); }
        renderGroupsBar();
        render();
      });
      groupsBar.appendChild(c);
    });
  }

  // v3.6.x：HTML 转义——文件名/字卡内容/分组名是用户输入，直接拼 innerHTML 会破坏结构或注入
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // 字卡项 HTML：图片 dataURL 显示缩略图，否则文字（删除统一走【管理字卡】）
  function cardItemHtml(c) {
    // 语音字卡：文件名|||data:audio 音频数据（播放按钮：播放中显示动态波形 + 高亮）
    // v3.6.x：显示时也去掉 mp3/mp4 后缀（旧上传的语音仍带后缀）
    // v3.6.x：仅当 ||| 之后是音频 dataURL 才算语音——普通文字（如颜文字）里含 ||| 字符不应误判
    if (typeof c === 'string' && c.indexOf('|||') > 0) {
      const pIdx = c.indexOf('|||');
      const src = c.slice(pIdx + 3) || '';
      if (src.indexOf('data:audio') === 0) {
        const parts = c.split('|||');
        const name = (parts[0] || '音频').replace(/\.[^.]+$/, '');
        // v3.6.x：audio dataURL 不再嵌进按钮（几十条语音时 HTML 字符串会膨胀到
        // 几十 MB，手机端 render/滚动必卡）——播放时从 groups 数据按 item 定位取
        return '<div class="cc-ico" style="background:rgba(0,0,0,.05)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg></div>' +
          '<div class="cc-txt"><div class="t" style="color:var(--muted)">' + esc(name) + '</div></div>' +
          '<button class="cc-play" title="播放">' +
          '<span class="cc-play-ico"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
          '<span class="cc-play-bars"><i></i><i></i><i></i></span></button>';
      }
    }
    // v3.11.x：链接导入的字卡存原始 http(s) 链接（图床不允许跨域转存时的回退形态），
    // 缩略图同样按图片渲染；懒加载 observer 只做 data-src→src 拷贝，对链接天然兼容
    if (typeof c === 'string' && (c.indexOf('data:') === 0 || /^https?:\/\//i.test(c))) {
      // 图片字卡：缩略图 + 点击查看大图（无文字标签）
      // v3.6.x：data-src 懒加载——表情包/图片多时不一次性解码全部 dataURL，
      // 只解码进入视口的图（render 里用 IntersectionObserver 补 src），
      // 删除/重渲染也不再有全量解码开销
      return '<div class="cc-ico cc-imgbox"><img class="cc-img" data-src="' + esc(c) + '" alt="图片" decoding="async"></div>';
    }
    return '<div class="cc-txt"><div class="t">' + esc(c) + '</div></div>';
  }

  // v3.6.x：分类 tab 显示每个大分类的字卡数量（主字卡/颜文字/emoji/表情包/图片/拍一拍/语音）
  function renderTabCounts() {
    tabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      const grps = groups[tab.dataset.type] || [];
      let n = 0;
      grps.forEach(g => { if (Array.isArray(g) && Array.isArray(g[1])) n += g[1].length; });
      let em = tab.querySelector('.cc-tab-n');
      if (!em) {
        em = document.createElement('em');
        em.className = 'cc-tab-n';
        tab.appendChild(em);
      }
      em.textContent = n;
      em.classList.toggle('zero', n === 0);
    });
  }

  // v3.6.x：图片字卡懒加载——只给进入视口的图补 src（dataURL 解码），
  // 表情包/图片分类几百张图时首屏只解码可见部分；重渲染/删除不再全量解码。
  // 无 IntersectionObserver 的旧浏览器由 render() 直接全部补 src 兜底
  const imgObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    for (let i = 0; i < entries.length; i++) {
      const en = entries[i];
      if (!en.isIntersecting) continue;
      const img = en.target;
      if (img && img.dataset && img.dataset.src && !img.getAttribute('src')) {
        img.setAttribute('src', img.dataset.src);
        img.removeAttribute('data-src');
      }
      try { imgObserver.unobserve(img); } catch (e) {}
    }
  }, { root: list, rootMargin: '300px 0px' }) : null;

  // 给图片节点注册懒加载（render / 局部重建共用）
  function attachLazy(img) {
    if (!img) return;
    if (imgObserver) { try { imgObserver.observe(img); } catch (e) {} }
    else {
      img.setAttribute('src', img.dataset.src || '');
      img.removeAttribute('data-src');
    }
  }

  // v3.6.x：语音卡 audio dataURL 不嵌 DOM——用 WeakMap 存 播放按钮节点 -> 音频数据，
  // 节点移除自动释放；搜索过滤后数组索引会错位，不能靠 dataset 索引回查，
  // 直接按节点取最稳
  const audioSrcMap = new WeakMap();

  // 渲染后为卡片节点补数据（图片懒加载注册 / 语音按钮音频注册）——render 与局部重建共用
  function attachCardData(d, c) {
    attachLazy(d.querySelector('img[data-src]'));
    const pb = d.querySelector('.cc-play');
    if (pb && typeof c === 'string' && c.indexOf('|||') > 0) {
      const p = c.indexOf('|||');
      const s = c.slice(p + 3);
      if (s.indexOf('data:audio') === 0) audioSrcMap.set(pb, s);
    }
  }

  // v3.7.x：单卡点击编辑——文字类字卡（主字卡/颜文字/emoji/拍一拍）在卡片上直接点击
  // 打开编辑弹窗修改内容；媒体字卡（图片/表情包/语音）保持原交互（查看大图/播放），不走这里
  function openEditCard(gname, i) {
    if (manageMode) return;
    const grps = groups[cur] || [];
    const g = grps.find(x => x[0] === gname);
    if (!g) return;
    const c = g[1][i];
    if (typeof c !== 'string' || !c) return;
    // 媒体字卡：图片 dataURL / 文件名|||音频 dataURL，不提供文字编辑
    if (c.indexOf('data:') === 0) return;
    if (c.indexOf('|||') > 0 && c.slice(c.indexOf('|||') + 3).indexOf('data:audio') === 0) return;
    if (!window.openModal) return;
    window.openModal('编辑字卡', c, (v) => {
      const val = String(v == null ? '' : v).trim();
      if (!val) { toast('字卡内容不能为空'); return; }
      if (val === c) return; // 内容未变化，直接关闭
      // 与批量导入一致：同一分组内不保留重复内容
      const dup = g[1].find((x, xi) => xi !== i && x === val);
      if (dup !== undefined) { toast('该分组已有相同内容'); return; }
      g[1][i] = val;
      updateCardDom(gname, i, val);
      // v3.7.x：内存与 DOM 即时生效，持久化延后（saveGroups 序列化大库会卡住确认）
      scheduleSave();
      toast('字卡已更新');
    });
  }

  // 编辑后局部更新单张卡的 DOM（图片懒加载/语音按钮数据同步重挂），大列表不全量重渲染；
  // 搜索过滤开启时内容可能不再匹配关键词——匹配则原地更新，不匹配则移除该卡并同步分组
  // header 计数（与 render() 的过滤条件一致：卡按内容过滤，组因组名含关键词时可保留空 header）
  function updateCardDom(gname, i, val) {
    // 分块渲染进行中：局部更新会被旧批次覆盖，改走全量 render（render 的 token 会废弃旧批次）
    if (rendering) { renderGroupsBar(); render(); return; }
    const sel = (window.CSS && CSS.escape) ? CSS.escape(String(gname)) : String(gname).replace(/["\\]/g, '\\$&');
    const node = list.querySelector('.cc-item[data-g="' + sel + '"][data-idx="' + i + '"]');
    if (node) {
      if (imgObserver) node.querySelectorAll('img[data-src]').forEach(im => { try { imgObserver.unobserve(im); } catch (e) {} });
      if (q) {
        const matches = (typeof val === 'string' && val.indexOf('data:') !== 0) && val.indexOf(q) >= 0;
        if (matches) {
          node.innerHTML = cardItemHtml(val);
          attachCardData(node, val);
        } else {
          node.remove();
          const h = list.querySelector('.cc-group-header[data-g="' + sel + '"]');
          if (h) {
            const cnt = h.querySelector('.ccg-count');
            if (cnt) cnt.textContent = Math.max(0, (parseInt(cnt.textContent, 10) || 1) - 1);
            if (cnt && parseInt(cnt.textContent, 10) === 0 && gname.indexOf(q) < 0) h.remove();
          }
        }
      } else {
        node.innerHTML = cardItemHtml(val);
        attachCardData(node, val);
      }
    }
    updateCountsOnly();
  }

  // v3.7.x：编辑持久化延后执行——saveGroups 会序列化整个字卡库（表情包/图片/语音
  // dataURL 可让库达几 MB~几十 MB），在确认回调里同步执行会阻塞弹窗关闭（用户反馈
  // 「点击确认卡顿」）。内存与 DOM 已即时更新，延后到下一帧后再写 LS+IDB；
  // 120ms 内连续编辑合并成一次写入，避免高频操作反复序列化大库
  let editSaveTimer = null;
  function scheduleSave() {
    clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(function () {
      editSaveTimer = null;
      try { saveGroups(groups); } catch (e) {}
    }, 120);
  }

  // v3.11.x：字卡库列表页「公用字卡 / 专属字卡」两行入口的角标计数。
  // 角标与当前打开作用域无关（公用行恒显全局键总量、专属行恒显当前联系人键总量）；
  // 带缓存：render→updateCountsOnly 高频触发，不重复 JSON.parse 大库，变更方强制刷新
  const libCounts = { pub: -1, own: -1 };
  function countOf(g) {
    let n = 0;
    try { Object.keys(g || {}).forEach(t => (g[t] || []).forEach(grp => { if (Array.isArray(grp) && Array.isArray(grp[1])) n += grp[1].length; })); } catch (e) {}
    return n;
  }
  function refreshLibCounts(force) {
    if (force) { libCounts.pub = -1; libCounts.own = -1; pubInvalidate(); }
    if (libCounts.pub < 0) libCounts.pub = countOf(buildGroupsFrom(pubStore().get(PUB_KEY)));
    if (libCounts.own < 0) libCounts.own = countOf(ownGroupsRaw());
    const pe = document.getElementById('cc-pub-count');
    if (pe) pe.textContent = libCounts.pub;
    const oe = document.getElementById('cc-list-count');
    if (oe) oe.textContent = libCounts.own;
  }

  // v3.6.x：只更新各类计数（tab 徽标/分组栏/总数），不重建列表 DOM——
  // 删除字卡/删除分组等高频操作改局部移除 DOM + 本函数，替代整页 render()
  function updateCountsOnly() {
    renderTabCounts();
    renderGroupsBar();
    const total = totalCount(groups);
    const totalEl = document.getElementById('cc-total');
    if (totalEl) totalEl.textContent = total + ' 张';
    refreshLibCounts(false);
  }

  // v3.6.x：定位某分组在列表中的 DOM 节点（header 带 data-g 标记，item 也带）
  function groupBlockNodes(gname) {
    const sel = (window.CSS && CSS.escape) ? CSS.escape(String(gname)) : String(gname).replace(/["\\]/g, '\\$&');
    const nodes = [];
    const header = list.querySelector('.cc-group-header[data-g="' + sel + '"]');
    if (header) nodes.push(header);
    list.querySelectorAll('.cc-item[data-g="' + sel + '"]').forEach(el => nodes.push(el));
    return nodes;
  }

  // v3.6.x：删除后重建某个分组在列表中的卡片区（含未观察 img 的解绑），
  // 其余分组 DOM 保持不动——删除一张卡不再整页重建；
  // 分组仍在但被删空时保留 header（显示 0 张），与原来整页渲染的行为一致
  function rebuildGroupAfterRemove(gname) {
    // 分组不在当前视图（被分组筛选隐藏）：数据已删即可，不要动 DOM
    if (curGroup && curGroup !== gname) return;
    groupBlockNodes(gname).forEach(el => {
      if (imgObserver) el.querySelectorAll('img[data-src]').forEach(im => { try { imgObserver.unobserve(im); } catch (e) {} });
      el.remove();
    });
    const grps = groups[cur] || [];
    const g = grps.find(x => x[0] === gname);
    if (!g) return; // 分组整体已删（走删除分组流程，不经过这里）
    // 重建 header（数量更新；空分组显示 0 张）
    const h = document.createElement('div');
    h.className = 'cc-group-header';
    h.dataset.g = gname;
    h.innerHTML = '<span class="ccg-name">' + esc(gname) + '</span><span class="ccg-count">' + g[1].length + '</span>';
    // 找插入锚点：下一个分组的 header（按 DOM 顺序），否则 list 末尾
    const grpNames = grps.map(x => x[0]);
    const nextIdx = grpNames.indexOf(gname) + 1;
    const nextSel = (window.CSS && CSS.escape) ? CSS.escape(String(grpNames[nextIdx] || '')) : '';
    const anchor = nextIdx < grpNames.length
      ? list.querySelector('.cc-group-header[data-g="' + nextSel + '"]')
      : null;
    const frag = document.createDocumentFragment();
    frag.appendChild(h);
    g[1].forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'cc-item glass';
      d.dataset.g = gname;
      d.dataset.idx = i;
      d.innerHTML = cardItemHtml(c);
      attachCardData(d, c);
      if (manageMode && selected.has(gname + '\u0001' + i)) d.classList.add('sel');
      d.addEventListener('click', () => {
        if (manageMode) { toggleSelect(d, gname, i); return; }
        // v3.11.x：图片/表情字卡（含链接导入的 http(s) 字卡）点击查看大图
        if (typeof c === 'string' && (c.indexOf('data:') === 0 || /^https?:\/\//i.test(c))) { viewImage(c); return; }
        openEditCard(gname, i);
      });
      attachCardDrag(d, gname, i);
      frag.appendChild(d);
    });
    if (anchor && anchor.parentNode === list) list.insertBefore(frag, anchor);
    else list.appendChild(frag);
  }

  // v3.6.x：大列表分块渲染——几千张卡一次性创建会卡死主线程（手机端明显），
  // 首帧同步渲染一批立即可见，其余按帧分批挂载，期间不阻塞滚动；
  // 渲染途中触发新 render（切分类/筛选/搜索）通过 token 废弃旧批次
  const RENDER_BATCH = 80;
  let renderToken = 0;
  let rendering = false; // 分块渲染进行中（局部删除前判断：渲染中改走全量 render，防旧批次复活已删卡片）

  // v3.7.x：字卡拖动排序——长按 350ms 触发，可在同分组内排序 / 跨分组移动
  // 仅在主字卡/颜文字/emoji/表情包分类启用；管理模式/搜索/分块渲染中禁用
  const DRAG_CATS = ['text', 'kaomoji', 'emoji', 'sticker'];
  function attachCardDrag(el, gname, i) {
    if (DRAG_CATS.indexOf(cur) < 0) return;
    let pressTimer = null;
    let startX = 0, startY = 0;
    el.addEventListener('pointerdown', (e) => {
      if (manageMode || q || rendering) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      startX = e.clientX; startY = e.clientY;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (manageMode || q || rendering) return;
        startCardDrag(e, el, gname, i);
      }, 350);
    });
    el.addEventListener('pointermove', (e) => {
      if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
        clearTimeout(pressTimer); pressTimer = null;
      }
    });
    const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
  }
  function startCardDrag(e, el, gname, i) {
    const rect = el.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const clone = el.cloneNode(true);
    clone.classList.add('cc-drag-clone');
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.zIndex = '1000';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    el.classList.add('cc-dragging');
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
    let dropTarget = null;
    const onMove = (ev) => {
      ev.preventDefault();
      clone.style.top = (ev.clientY - offsetY) + 'px';
      dropTarget = computeCardDrop(ev.clientY);
      updateCardDropIndicator(dropTarget);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      clone.remove();
      el.classList.remove('cc-dragging');
      clearCardDropIndicator();
      if (dropTarget) moveCardTo(gname, i, dropTarget);
    };
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }
  function computeCardDrop(clientY) {
    const items = Array.from(list.querySelectorAll('.cc-item:not(.cc-dragging)'));
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        return { gname: item.dataset.g, idx: parseInt(item.dataset.idx, 10), before: true };
      }
    }
    // 落在所有 item 之后：按 header 判断属于哪个分组，追加到该分组末尾（含空分组）
    const headers = Array.from(list.querySelectorAll('.cc-group-header'));
    let lastHeader = null;
    for (const h of headers) {
      if (clientY >= h.getBoundingClientRect().top) lastHeader = h;
    }
    if (lastHeader) {
      const gname = lastHeader.dataset.g;
      const grps = groups[cur] || [];
      if (grps.find(x => x[0] === gname)) {
        const groupItems = items.filter(it => it.dataset.g === gname);
        if (groupItems.length) {
          const last = groupItems[groupItems.length - 1];
          return { gname, idx: parseInt(last.dataset.idx, 10), before: false };
        }
        return { gname, idx: 0, before: true, empty: true };
      }
    }
    if (items.length) {
      const last = items[items.length - 1];
      return { gname: last.dataset.g, idx: parseInt(last.dataset.idx, 10), before: false };
    }
    return null;
  }
  function updateCardDropIndicator(target) {
    clearCardDropIndicator();
    if (!target) return;
    const sel = (window.CSS && CSS.escape) ? CSS.escape(String(target.gname)) : String(target.gname).replace(/["\\]/g, '\\$&');
    const line = document.createElement('div');
    line.className = 'cc-drop-line';
    if (target.empty) {
      const header = list.querySelector('.cc-group-header[data-g="' + sel + '"]');
      if (header && header.nextSibling) list.insertBefore(line, header.nextSibling);
      else if (header) list.appendChild(line);
      return;
    }
    const ref = list.querySelector('.cc-item[data-g="' + sel + '"][data-idx="' + target.idx + '"]');
    if (!ref) return;
    if (target.before) list.insertBefore(line, ref);
    else if (ref.nextSibling) list.insertBefore(line, ref.nextSibling);
    else list.appendChild(line);
  }
  function clearCardDropIndicator() {
    list.querySelectorAll('.cc-drop-line').forEach(el => el.remove());
  }
  function moveCardTo(fromGname, fromIdx, target) {
    const grps = groups[cur] || [];
    const fromG = grps.find(g => g[0] === fromGname);
    if (!fromG) return;
    const card = fromG[1][fromIdx];
    if (card === undefined) return;
    const toG = grps.find(g => g[0] === target.gname);
    if (!toG) return;
    let toIdx = target.before ? target.idx : target.idx + 1;
    if (fromGname === target.gname) {
      if (fromIdx === toIdx || fromIdx === toIdx - 1) return; // 原地未动
      fromG[1].splice(fromIdx, 1);
      if (fromIdx < toIdx) toIdx -= 1;
      fromG[1].splice(toIdx, 0, card);
    } else {
      fromG[1].splice(fromIdx, 1);
      toG[1].splice(toIdx, 0, card);
    }
    saveGroups(groups);
    renderGroupsBar();
    render();
    toast('字卡已移动');
  }

  function render() {
    const token = ++renderToken;
    rendering = true;
    renderTabCounts();
    // 表情包分类：网格一行四个；图片分类：网格一行两个；emoji 分类：网格一行六个；其他分类保持行式列表
    list.classList.toggle('cc-grid', cur === 'sticker');
    list.classList.toggle('cc-grid2', cur === 'image');
    list.classList.toggle('cc-grid6', cur === 'emoji');
    const grps = groups[cur] || [];
    let shown = grps;
    // 分组筛选
    if (curGroup) shown = shown.filter(g => g[0] === curGroup);
    if (q) {
      // v3.7.x：保留原始索引——搜索过滤后 data-idx 必须仍是原始数组索引，
      // 否则单卡点击编辑/删除会按错位索引改到别的字卡
      shown = shown
        .map(([g, arr]) => [g, arr
          .map((c, oi) => ({ c: c, oi: oi }))
          .filter(x => (typeof x.c === 'string' && x.c.indexOf('data:') !== 0) && x.c.indexOf(q) >= 0)])
        .filter(([g, arr]) => arr.length || g.indexOf(q) >= 0);
    }
    updateCountsOnly();
    // v3.6.x：清空前先解除旧图片懒加载观察，避免 observer 引用累积
    if (imgObserver) list.querySelectorAll('img[data-src]').forEach(im => { try { imgObserver.unobserve(im); } catch (e) {} });
    list.innerHTML = '';
    if (!shown.length) {
      const emptyTxt = cur === 'sticker' ? '暂无表情包 · 点击右上角批量导入上传图片'
        : cur === 'image' ? '暂无图片 · 点击右上角批量导入上传图片'
        : cur === 'voice' ? '暂无语音 · 点击右上角批量导入上传音频'
        : '暂无字卡';
      list.innerHTML = '<div class="cc-empty">' + emptyTxt + '</div>';
      return;
    }
    // 展开扁平结构：分组 header 与字卡项交错（header 带 data-g 供局部更新定位）
    const flat = [];
    shown.forEach(([gname, arr]) => {
      flat.push({ header: true, gname, count: arr.length });
      arr.forEach((o, i) => {
        // 搜索过滤时元素是 {c, oi} 对象（保留原始索引）；否则是原始字卡字符串
        flat.push({ header: false, gname, c: q ? o.c : o, i: q ? o.oi : i });
      });
    });
    const frag = document.createDocumentFragment();
    let pos = 0;
    const build = (el, it) => {
      if (it.header) {
        el.className = 'cc-group-header';
        el.dataset.g = it.gname;
        el.innerHTML = '<span class="ccg-name">' + esc(it.gname) + '</span><span class="ccg-count">' + it.count + '</span>';
      } else {
        el.className = 'cc-item glass';
        el.dataset.g = it.gname;
        el.dataset.idx = it.i;
        el.innerHTML = cardItemHtml(it.c);
        attachCardData(el, it.c);
        if (manageMode && selected.has(it.gname + '\u0001' + it.i)) el.classList.add('sel');
        el.addEventListener('click', () => {
          if (manageMode) { toggleSelect(el, it.gname, it.i); return; }
          // 图片/表情字卡（含链接导入的 http(s) 字卡）：点击查看大图
          if (typeof it.c === 'string' && (it.c.indexOf('data:') === 0 || /^https?:\/\//i.test(it.c))) {
            viewImage(it.c);
            return;
          }
          openEditCard(it.gname, it.i);
        });
        attachCardDrag(el, it.gname, it.i);
      }
    };
    const step = () => {
      if (token !== renderToken) { rendering = false; return; } // 新渲染已开始，废弃本批次
      const end = Math.min(pos + RENDER_BATCH, flat.length);
      for (; pos < end; pos++) {
        const el = document.createElement('div');
        build(el, flat[pos]);
        frag.appendChild(el);
      }
      // 每帧挂载一批：列表渐进出现，首屏立即可滚动
      list.appendChild(frag);
      if (pos < flat.length) requestAnimationFrame(step);
      else rendering = false;
    };
    step(); // 首帧同步跑第一批（小列表一次完成，行为与原一致）
  }

  // 分类切换
  tabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // v3.6.x：切换分类时退出管理模式并清空选中——旧逻辑不清，
      // 旧分类的「分组名\1索引」选中 key 在新分类下匹配不到，删除/移动静默失败
      if (manageMode) exitManage();
      selected.clear();
      tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.remove('sel'));
      tab.classList.add('sel');
      cur = tab.dataset.type;
      q = '';
      curGroup = '';
      // 清空两个搜索框
      const s1 = document.getElementById('cc-search-input');
      const s2 = document.getElementById('chatcard-search');
      if (s1) s1.value = '';
      if (s2) s2.value = '';
      renderGroupsBar();
      render();
    });
  });

  // 搜索：页内输入框直接过滤（v3.6.x：不再弹窗，输入即筛，清空即恢复）
  const searchInput = document.getElementById('cc-search-input');
  const searchInput2 = document.getElementById('chatcard-search');
  function setupSearchInput(input) {
    if (!input) return;
    // v3.5.138：不再标记 ceDone 跳过 contenteditable 转换——之前为兼容
    // 雨见浏览器特意保留原生 input，但这手机 Chrome 对原生 input 聚焦仍弹
    // 「自动填充」白条。ce-box 已兼容 input 事件转发 + value 代理 + Escape
    // keydown 转发（见 mobile-adapt.js），转接后输入即筛/清空恢复照常工作。
    // v3.6.x：120ms 防抖——字卡多时每敲一个字全量渲染会卡，输入停顿后再筛
    let searchTimer = null;
    input.addEventListener('input', () => {
      // v3.7.x：管理模式放开搜索——搜索过滤已保留原始索引（{c,oi}），
      // 勾选删除/移动按原始索引匹配不会错位（v3.5.130 禁用的误删风险已消除）；
      // 过滤视图变化时清空已选并刷新计数，避免残留选中屏幕外的卡
      q = input.value.trim();
      if (manageMode) { selected.clear(); updateCount(); }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 120);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = ''; q = '';
        if (manageMode) { selected.clear(); updateCount(); }
        clearTimeout(searchTimer);
        render();
        input.blur();
      }
    });
  }
  setupSearchInput(searchInput);
  // v3.9.x：字卡库列表页搜索——跨所有分类搜字卡内容
  const searchResultEl = document.createElement('div');
  searchResultEl.className = 'cc-search-result';
  searchResultEl.style.cssText = 'padding:0 12px';
  searchResultEl.hidden = true;
  (function () { const w = document.querySelector('#page-chatcard .tc-search-wrap'); if (w && w.parentNode) w.parentNode.insertBefore(searchResultEl, w.nextSibling); })();
  function renderSearchResult(kw) {
    if (!kw) { searchResultEl.hidden = true; searchResultEl.innerHTML = ''; return; }
    searchResultEl.hidden = false;
    const fns = window.__cardSearchFns || [];
    let all = [];
    fns.forEach(function (reg) { try { (reg.fn(kw) || []).forEach(function (r) { all.push({ t: r.t, cat: r.cat, mod: reg.name }); }); } catch (e) {} });
    if (!all.length) { searchResultEl.innerHTML = '<div class="ta-empty" style="padding:20px 12px">没有找到含「' + esc(kw) + '」的字卡</div>'; return; }
    let html = '<div class="cal-card-title" style="padding:10px 2px">找到 ' + all.length + ' 张含「' + esc(kw) + '」的字卡</div>';
    all.forEach(function (r) {
      html += '<div class="tc-qrow"><div class="tc-qmain"><div class="tc-qtext">' + esc(r.t) + '</div><div class="tc-qmeta" style="font-size:11px;color:var(--muted)">' + esc(r.mod) + (r.cat ? ' · ' + esc(r.cat) : '') + '</div></div></div>';
    });
    searchResultEl.innerHTML = html;
  }
  if (searchInput2) {
    const filterEntries = function () {
      const kw = String(searchInput2.value || '').trim().toLowerCase();
      const customEl = document.getElementById('cc-sect-custom');
      const presetEl = document.getElementById('cc-sect-preset');
      if (kw) {
        if (customEl) customEl.hidden = true;
        if (presetEl) presetEl.hidden = true;
        renderSearchResult(kw);
      } else {
        renderSearchResult('');
        const cur = document.querySelector('.cc-top-tabs .cc-tab.sel');
        const k = cur ? cur.getAttribute('data-ccsect') : 'custom';
        if (customEl) customEl.hidden = (k !== 'custom');
        if (presetEl) presetEl.hidden = (k !== 'preset');
      }
    };
    searchInput2.addEventListener('input', filterEntries);
    searchInput2.addEventListener('keydown', function (e) { if (e.key === 'Escape') { searchInput2.value = ''; filterEntries(); searchInput2.blur(); } });
    const ccPage = document.getElementById('page-chatcard');
    if (ccPage) { new MutationObserver(function () { if (!ccPage.hidden && searchInput2.value) { searchInput2.value = ''; filterEntries(); } }).observe(ccPage, { attributes: true, attributeFilter: ['hidden'] }); }
  }
  // 跨分类搜索注册：自定义聊天字卡 / 默认聊天字卡 / 情绪·回应
  window.__cardSearchFns = window.__cardSearchFns || [];
  window.__cardSearchFns.push({ name: '自定义聊天字卡', fn: function (kw) {
    const out = [];
    try {
      // v3.11.x：公用 + 专属合并后参与搜索
      const groups = mergeWithPublic(loadGroups());
      Object.keys(groups).forEach(function (type) {
        (groups[type] || []).forEach(function (grp) {
          const gname = grp[0]; const cards = grp[1] || [];
          cards.forEach(function (c) { const txt = typeof c === 'string' ? c : (c && c.t) || ''; if (txt && txt.toLowerCase().indexOf(kw) >= 0) out.push({ t: txt, cat: gname }); });
        });
      });
    } catch (e) {}
    return out;
  } });
  window.__cardSearchFns.push({ name: '默认聊天字卡', fn: function (kw) {
    const out = [];
    try {
      const d = window.DEFAULT_CARD_DATA || {};
      Object.keys(d).forEach(function (k) { (d[k] || []).forEach(function (grp) { const gname = grp[0]; const cards = grp[1] || []; cards.forEach(function (c) { if (c && String(c).toLowerCase().indexOf(kw) >= 0) out.push({ t: String(c), cat: gname }); }); }); });
    } catch (e) {}
    return out;
  } });
  window.__cardSearchFns.push({ name: '聊天情绪/回应', fn: function (kw) {
    const out = [];
    try {
      const d = window.MOOD_FOLLOWUP_DATA || {};
      (d.mood || []).forEach(function (g) { (g.cards || []).forEach(function (c) { const txt = c && c.content ? c.content : ''; if (txt && txt.toLowerCase().indexOf(kw) >= 0) out.push({ t: txt, cat: '情绪·' + (g.group || '') }); }); });
      (d.followup || []).forEach(function (g) { const grp = g.group || g.cat || ''; (g.cards || []).forEach(function (c) { const txt = typeof c === 'string' ? c : (c && c.content) || ''; if (txt && txt.toLowerCase().indexOf(kw) >= 0) out.push({ t: txt, cat: '回应·' + grp }); }); });
    } catch (e) {}
    return out;
  } });

  // 管理分组：列出当前分类的分组，可新建 / 删除（内置分组不可删除）
  const ngBtn = document.getElementById('cc-new-group');
  if (ngBtn) {
    ngBtn.addEventListener('click', openManageGroups);
  }
  function openManageGroups() {
    // 创建/复用管理面板
    let mask = document.getElementById('cc-mg-mask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'cc-mg-mask';
      mask.className = 'mg-mask';
      mask.innerHTML =
        '<div class="mg-panel">' +
          '<div class="mg-head"><span>管理分组</span><button class="mg-close">✕</button></div>' +
          '<div class="mg-list"></div>' +
          '<button class="mg-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M12 5v14M5 12h14"/></svg>新建分组</button>' +
        '</div>';
      document.body.appendChild(mask);
      mask.querySelector('.mg-close').addEventListener('click', () => { mask.hidden = true; });
      mask.addEventListener('click', (e) => { if (e.target === mask) mask.hidden = true; });
      mask.querySelector('.mg-add').addEventListener('click', () => {
        if (window.openModal) {
          window.openModal('新建分组', '', (v) => {
            const name = (v || '').trim();
            if (!name) return;
            if (!groups[cur]) groups[cur] = [];
            if (groups[cur].some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
            groups[cur].push([name, []]);
            saveGroups(groups);
            renderGroupsBar();
            render();
            renderMgList();
            // v3.6.x：新建成功后自动关掉【管理分组】弹窗，不再手动点 ✕
            mask.hidden = true;
          });
        }
      });
    }
    // v3.7.x：管理分组面板——分组拖动排序（左侧 ≡ 手柄触发，document 监听 pointermove/up）
    function attachGroupRowDrag(row, gi) {
      const handle = row.querySelector('.mg-handle');
      if (!handle) return;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const listEl = mask.querySelector('.mg-list');
        if (!listEl) return;
        const rect = row.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const clone = row.cloneNode(true);
        clone.classList.add('mg-drag-clone');
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.width = rect.width + 'px';
        clone.style.margin = '0';
        document.body.appendChild(clone);
        row.classList.add('mg-dragging');
        let dropIdx = gi;
        const onMove = (ev) => {
          ev.preventDefault();
          clone.style.top = (ev.clientY - offsetY) + 'px';
          const rows = Array.from(listEl.querySelectorAll('.mg-row'));
          dropIdx = rows.length;
          for (let i = 0; i < rows.length; i++) {
            if (rows[i] === row) continue;
            const r = rows[i].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) { dropIdx = i; break; }
          }
          listEl.querySelectorAll('.mg-drop-line').forEach(el => el.remove());
          const line = document.createElement('div');
          line.className = 'mg-drop-line';
          if (dropIdx >= rows.length) listEl.appendChild(line);
          else listEl.insertBefore(line, rows[dropIdx]);
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          clone.remove();
          row.classList.remove('mg-dragging');
          listEl.querySelectorAll('.mg-drop-line').forEach(el => el.remove());
          if (dropIdx === gi || dropIdx === gi + 1) return; // 原地未动
          const grps = groups[cur] || [];
          let target = dropIdx < gi ? dropIdx : dropIdx - 1;
          if (target < 0) target = 0;
          if (target > grps.length - 1) target = grps.length - 1;
          if (target === gi) return;
          const [moved] = grps.splice(gi, 1);
          grps.splice(target, 0, moved);
          saveGroups(groups);
          renderGroupsBar();
          render();
          renderMgList();
          toast('分组已移动');
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
        e.preventDefault();
      });
    }
    function renderMgList() {
      const listEl = mask.querySelector('.mg-list');
      const grps = groups[cur] || [];
      if (!grps.length) { listEl.innerHTML = '<div class="mg-empty">暂无分组，点击下方新建</div>'; return; }
      listEl.innerHTML = '';
      const handleSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
      const editSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>';
      grps.forEach(([gname, arr], gi) => {
        const row = document.createElement('div');
        row.className = 'mg-row';
        row.dataset.gidx = String(gi);
        const builtin = (BUILTIN[cur] || []).some(b => b[0] === gname);
        row.innerHTML = '<button class="mg-handle" aria-label="拖动排序">' + handleSvg + '</button>' +
          '<span class="mg-name">' + esc(gname) + '</span><span class="mg-count">' + arr.length + ' 张</span>' +
          (builtin ? '<span class="mg-tag">内置</span>' : '<button class="mg-rn" aria-label="重命名">' + editSvg + '</button><button class="mg-del">✕</button>');
        attachGroupRowDrag(row, gi);
        if (!builtin) {
          const rnBtn = row.querySelector('.mg-rn');
          if (rnBtn) rnBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.openModal) {
              window.openModal('重命名分组', gname, (v) => {
                const name = String(v == null ? '' : v).trim();
                if (!name) return;
                if (name === gname) return;
                if ((groups[cur] || []).some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
                const g = groups[cur][gi];
                if (!g) return;
                const oldName = g[0];
                g[0] = name;
                if (curGroup === oldName) curGroup = name;
                if (selected.size) {
                  const newSel = new Set();
                  selected.forEach(k => {
                    const sep = k.indexOf('\u0001');
                    if (sep > 0 && k.slice(0, sep) === oldName) newSel.add(name + '\u0001' + k.slice(sep + 1));
                    else newSel.add(k);
                  });
                  selected.clear(); newSel.forEach(k => selected.add(k));
                }
                saveGroups(groups);
                renderGroupsBar();
                render();
                renderMgList();
                toast('已重命名为「' + name + '」');
              });
            }
          });
          row.querySelector('.mg-del').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.openModal) {
              window.openModal('删除分组「' + gname + '」及其全部字卡？', '', () => {
                const wasCur = curGroup === gname;
                groups[cur] = groups[cur].filter(([g]) => g !== gname);
                if (wasCur) curGroup = '';
                saveGroups(groups);
                // v3.6.x：不再整页 render——分组在 DOM 中则局部移除该块 + 只更新计数；
                // 当前筛选/搜索视图受影响时（需恢复全部视图或 DOM 无法精确定位）才全量重建；
                // 分块渲染进行中同样走全量（防旧批次复活已删分组）
                if (wasCur || rendering) {
                  render();
                } else if (!q) {
                  groupBlockNodes(gname).forEach(el => {
                    if (imgObserver) el.querySelectorAll('img[data-src]').forEach(im => { try { imgObserver.unobserve(im); } catch (e) {} });
                    el.remove();
                  });
                  updateCountsOnly();
                } else {
                  render();
                }
                renderMgList();
              }, { noInput: true });
            }
          });
        }
        listEl.appendChild(row);
      });
    }
    mask.hidden = false;
    renderMgList();
  }

  // ================= 管理字卡（批量勾选删除 / 移动分组） =================
  let manageMode = false;
  const selected = new Set(); // key: 分组名 + \u0001 + 数组索引
  let manageBar = null;
  let mgCountEl = null;

  function toggleSelect(el, gname, i) {
    const k = gname + '\u0001' + i;
    if (selected.has(k)) { selected.delete(k); el.classList.remove('sel'); }
    else { selected.add(k); el.classList.add('sel'); }
    updateCount();
  }
  function updateCount() {
    if (mgCountEl) mgCountEl.textContent = '已选 ' + selected.size + ' 张';
  }
  function selectedKeys() {
    const keys = [];
    (groups[cur] || []).forEach(([gname, arr]) => {
      if (curGroup && curGroup !== gname) return;
      arr.forEach((c, i) => {
        // v3.7.x：搜索态下「全选」只选当前过滤视图可见的卡（与 render 过滤条件一致），
        // 避免连带选中屏幕外的卡片
        if (q && !((typeof c === 'string' && c.indexOf('data:') !== 0) && c.indexOf(q) >= 0)) return;
        keys.push(gname + '\u0001' + i);
      });
    });
    return keys;
  }
  function delSelected() {
    let removed = 0;
    // v3.6.x：先记录受影响的分组（局部 DOM 更新需要），再倒序 splice 防错位
    const touched = new Set(); // 受影响分组名
    (groups[cur] || []).forEach(([gname, arr]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (selected.has(gname + '\u0001' + i)) {
          touched.add(gname);
          arr.splice(i, 1);
          removed++;
        }
      }
    });
    if (!removed) return;
    selected.clear();
    // v3.7.x：持久化延后——saveGroups 同步序列化整个字卡库（图片/语音 dataURL 可让库
    // 达几 MB~几十 MB），在确认回调里同步执行会阻塞弹窗关闭（用户反馈「点击确认卡顿」）；
    // 内存与 DOM 已即时删除，延后到下一帧再写 LS+IDB，与编辑字卡一致
    scheduleSave();
    // v3.6.x：局部移除被删卡片 + 重建受影响分组，不再整页 render（删除卡顿主因）；
    // 但分块渲染进行中时不能局部更新——旧批次会把已删的卡重新挂载，改走全量 render；
    // v3.7.x：搜索过滤开启时同样全量 render——rebuildGroupAfterRemove 重建整组不带
    // 搜索过滤，会把不匹配关键词的卡片重新显示出来
    if (rendering || q) { render(); updateCount(); toast('已删除 ' + removed + ' 张字卡'); return; }
    touched.forEach((gname) => {
      rebuildGroupAfterRemove(gname);
    });
    updateCountsOnly();
    updateCount();
    toast('已删除 ' + removed + ' 张字卡');
  }
  function moveSelected(target) {
    const mvGroups = [];
    (groups[cur] || []).forEach(([gname, arr]) => {
      const mv = [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (selected.has(gname + '\u0001' + i)) { mv.push(arr[i]); arr.splice(i, 1); }
      }
      if (mv.length) mvGroups.push(mv);
    });
    const total = mvGroups.reduce((s, a) => s + a.length, 0);
    if (!total) return;
    const tg = (groups[cur] || []).find(g => g[0] === target);
    if (tg) mvGroups.forEach(a => { tg[1] = tg[1].concat(a); });
    selected.clear();
    saveGroups(groups);
    renderGroupsBar();
    render();
    updateCount();
    toast('已移动 ' + total + ' 张字卡到「' + target + '」');
  }
  function enterManage() {
    manageMode = true;
    selected.clear();
    // v3.7.x：管理模式放开搜索——保留当前搜索/分组筛选视图继续筛选；
    // 搜索过滤已保留原始索引（{c,oi}），勾选删除/移动按原始索引匹配不会错位
    // （v3.5.130 禁用搜索的原因——过滤后索引与原始数组错位——已被 v3.7.x 修复）
    render();
    list.classList.add('cc-managing');
    document.querySelectorAll('.cc-toolbar').forEach(t => { t.style.display = 'none'; });
    if (!manageBar) {
      manageBar = document.createElement('div');
      manageBar.id = 'cc-manage-bar';
      manageBar.className = 'cc-manage-bar';
      manageBar.innerHTML =
        '<span class="cc-m-count">已选 0 张</span>' +
        '<button class="cc-m-btn" id="cc-m-all">全选</button>' +
        '<button class="cc-m-btn cc-m-del" id="cc-m-del">删除</button>' +
        '<button class="cc-m-btn" id="cc-m-move">移动</button>' +
        '<button class="cc-m-btn" id="cc-m-exit">退出</button>';
      document.body.appendChild(manageBar);
      mgCountEl = manageBar.querySelector('.cc-m-count');
      manageBar.querySelector('#cc-m-all').addEventListener('click', () => {
        const all = selectedKeys();
        if (selected.size === all.length && all.length) selected.clear();
        else all.forEach(k => selected.add(k));
        render();
        updateCount();
      });
      manageBar.querySelector('#cc-m-del').addEventListener('click', () => {
        if (!selected.size) { toast('请先勾选字卡'); return; }
        if (window.openModal) {
          // 弹窗里明确列出勾选删除的字卡（只含勾选的），未勾选的字卡不出现在确认弹窗里；
          // 文字字卡显示内容，语音显示文件名，图片/表情包显示占位
          const list = [];
          (groups[cur] || []).forEach(([gname, arr]) => {
            arr.forEach((c, i) => {
              if (!selected.has(gname + '\u0001' + i)) return;
              let t = c;
              // 语音字卡：文件名|||data:audio 音频；含 ||| 的普通文字（如颜文字）不算语音
              if (typeof t === 'string' && t.indexOf('|||') > 0 && t.slice(t.indexOf('|||') + 3).indexOf('data:audio') === 0) t = '🎵 ' + t.split('|||')[0];
              else if (typeof t === 'string' && t.indexOf('data:') === 0) t = '🖼 图片';
              list.push(t);
            });
          });
          const MAX_SHOW = 30;
          const shown = list.slice(0, MAX_SHOW).join('\n');
          const more = list.length > MAX_SHOW ? '\n…等 ' + list.length + ' 张' : '';
          window.openModal('删除选中的 ' + selected.size + ' 张字卡？', '', () => delSelected(), { noInput: true, staticText: shown + more });
        }
      });
      manageBar.querySelector('#cc-m-move').addEventListener('click', () => {
        if (!selected.size) { toast('请先勾选字卡'); return; }
        const mList = (groups[cur] || []).map(g => g[0]);
        if (!mList.length) { toast('当前没有分组'); return; }
        if (window.openModal) {
          window.openModal('移动到分组', '', (v) => moveSelected(v), {
            pills: mList.map(n => ({ label: n, value: n })),
            pill: mList[0],
            noInput: true
          });
        }
      });
      manageBar.querySelector('#cc-m-exit').addEventListener('click', exitManage);
    }
    manageBar.hidden = false;
    updateCount();
  }
  function exitManage() {
    manageMode = false;
    selected.clear();
    list.classList.remove('cc-managing');
    document.querySelectorAll('.cc-toolbar').forEach(t => { t.style.display = ''; });
    if (manageBar) manageBar.hidden = true;
  }
  const mcBtn = document.getElementById('cc-manage-cards');
  if (mcBtn) mcBtn.addEventListener('click', () => { if (manageMode) exitManage(); else enterManage(); });

  // ================= 去重复字卡（同一分组内内容完全相同的字卡只保留 1 张） =================
  const ccDedupe = document.getElementById('cc-dedupe');
  if (ccDedupe) {
    ccDedupe.addEventListener('click', () => {
      // 先统计重复数量（不修改数据），确认后才真正删除
      let dup = 0;
      Object.keys(groups).forEach(cat => {
        (groups[cat] || []).forEach(([gname, arr]) => {
          dup += (arr || []).length - new Set(arr || []).size;
        });
      });
      if (!dup) { toast('没有发现重复字卡'); return; }
      if (window.openModal) {
        window.openModal('去重 ' + dup + ' 张重复字卡？', '', () => {
          let removed = 0;
          Object.keys(groups).forEach(cat => {
            (groups[cat] || []).forEach(([gname, arr]) => {
              const kept = [];
              const seen = new Set();
              (arr || []).forEach(c => {
                if (seen.has(c)) { removed++; return; }
                seen.add(c); kept.push(c);
              });
              arr.length = 0;
              arr.push.apply(arr, kept);
            });
          });
          saveGroups(groups);
          renderGroupsBar();
          render();
          toast('已去除 ' + removed + ' 张重复字卡');
        }, {
          noInput: true,
          staticText: '将删除同一分组内内容完全相同的重复字卡（每种内容只保留 1 张），并同步清理各分组的数量显示。'
        });
      }
    });
  }

  // ================= 导出数据（v3.7.x：弹窗选择分类 + 分组后导出 json） =================
  const ccExport = document.getElementById('cc-export');
  if (ccExport) {
    // 7 大分类 key + 显示名（与分类 tab 一致）
    const EXPORT_CATS = [
      ['text', '主字卡'], ['kaomoji', '颜文字'], ['emoji', 'emoji'],
      ['sticker', '表情包'], ['image', '图片'], ['poke', '拍一拍'], ['voice', '语音']
    ];
    const ceMask = document.getElementById('cc-export-mask');
    const ceCats = document.getElementById('ce-cats');
    const ceGrps = document.getElementById('ce-grps');
    const ceSummary = document.getElementById('ce-summary');
    const ceDo = document.getElementById('ce-do');
    const ceClose = document.getElementById('ce-close');
    // 选择状态：{ 分类key: { on: 是否选中分类, grps: { 分组名: 是否选中 } } }
    let ceState = {};
    if (ceMask && ceCats && ceGrps) {
      function ceInit() {
        ceState = {};
        EXPORT_CATS.forEach(([key]) => {
          const gs = groups[key] || [];
          const st = { on: gs.length > 0, grps: {} };
          gs.forEach(([name]) => { st.grps[name] = true; });
          ceState[key] = st;
        });
      }
      function ceRender() {
        // 分类 chips（显示数量，默认全选非空分类）
        ceCats.innerHTML = '';
        EXPORT_CATS.forEach(([key, name]) => {
          const gs = groups[key] || [];
          const n = gs.reduce((s, g) => s + (Array.isArray(g[1]) ? g[1].length : 0), 0);
          const b = document.createElement('span');
          b.className = 'cc-g-chip' + (ceState[key] && ceState[key].on ? ' sel' : '');
          b.textContent = name + ' ' + n;
          b.addEventListener('click', () => {
            const st = ceState[key];
            st.on = !st.on;
            // 重新打开的分类：其分组恢复全选（之前取消的选择不残留）
            if (st.on) Object.keys(st.grps).forEach(g => { st.grps[g] = true; });
            ceRender();
          });
          ceCats.appendChild(b);
        });
        // 分组 chips（按分类分段，只渲染选中的分类）
        ceGrps.innerHTML = '';
        const grpCats = EXPORT_CATS.filter(([key]) => ceState[key] && ceState[key].on && (groups[key] || []).length);
        if (!grpCats.length) {
          const e = document.createElement('div');
          e.className = 'cc-empty';
          e.textContent = '所选分类暂无分组，请先选择有字卡的分类';
          ceGrps.appendChild(e);
        } else {
          grpCats.forEach(([key, cname]) => {
            const gs = groups[key] || [];
            const sec = document.createElement('div');
            sec.className = 'ce-grp-sec';
            const secName = document.createElement('div');
            secName.className = 'ce-grp-cat';
            secName.textContent = cname;
            sec.appendChild(secName);
            const chips = document.createElement('div');
            chips.className = 'cc-groups-bar';
            gs.forEach(([gname, cards]) => {
              const n = Array.isArray(cards) ? cards.length : 0;
              const b = document.createElement('span');
              b.className = 'cc-g-chip' + (ceState[key].grps[gname] ? ' sel' : '');
              b.textContent = gname + ' ' + n;
              b.addEventListener('click', () => {
                ceState[key].grps[gname] = !ceState[key].grps[gname];
                ceRender();
              });
              chips.appendChild(b);
            });
            sec.appendChild(chips);
            ceGrps.appendChild(sec);
          });
        }
        // 汇总 + 按钮可用态
        let cards = 0, grps = 0, cats = 0;
        EXPORT_CATS.forEach(([key]) => {
          const st = ceState[key];
          if (!st || !st.on) return;
          cats++;
          (groups[key] || []).forEach(([gname, cs]) => {
            if (st.grps[gname]) { grps++; cards += Array.isArray(cs) ? cs.length : 0; }
          });
        });
        ceSummary.textContent = '已选 ' + cats + ' 个分类 · ' + grps + ' 个分组 · ' + cards + ' 张字卡';
        if (ceDo) ceDo.disabled = cards === 0;
      }
      function ceOpen() { ceInit(); ceRender(); ceMask.hidden = false; }
      function ceCloseFn() { ceMask.hidden = true; }
      ccExport.addEventListener('click', ceOpen);
      if (ceClose) ceClose.addEventListener('click', ceCloseFn);
      ceMask.addEventListener('click', (e) => { if (e.target === ceMask) ceCloseFn(); });
      if (ceDo) {
        ceDo.addEventListener('click', () => {
          try {
            const out = { text: [], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
            EXPORT_CATS.forEach(([key]) => {
              const st = ceState[key];
              if (!st || !st.on) return;
              (groups[key] || []).forEach(([gname, cs]) => {
                if (st.grps[gname]) out[key].push([gname, Array.isArray(cs) ? cs.slice() : []]);
              });
            });
            const data = JSON.stringify(out, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'mochi字卡库数据.json';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
            ceCloseFn();
            toast('已导出所选字卡');
          } catch (e) { toast('导出失败'); }
        });
      }
    }
  }

  // ================= 导入数据（字卡库 json） =================
  // v3.6.x：导入前先选模式——「追加字卡（自动去重）」保留现有字卡按分组合并、
  // 重复内容自动去除；「替换字卡」清空当前字卡库、完全使用文件内容。
  // 文件先完整解析、确认含有效字卡后才写入：格式错误/空文件不会改动现有字卡库
  const ccImportData = document.getElementById('cc-import-data');
  if (ccImportData) {
    const CAT_NAMES = { text: '主字卡', kaomoji: '颜文字', emoji: 'emoji', sticker: '表情包', image: '图片', poke: '拍一拍', voice: '语音' };
    ccImportData.addEventListener('click', () => {
      if (window.openModal) {
        const curName = CAT_NAMES[cur] || '当前分类';
        window.openModal('导入字卡数据', '', (mode) => {
          pickImportFile(mode);
        }, {
          noInput: true,
          staticText: '选择导入方式：\n· 追加字卡：保留现有字卡，按分组并入，重复内容自动去除\n· 导入到「' + curName + '」：文件里全部字卡都并入当前分类\n· 替换字卡：清空当前字卡库，完全使用文件内容',
          pills: [
            { label: '追加字卡（自动去重）', value: 'merge' },
            { label: '导入到「' + curName + '」', value: 'current' },
            { label: '替换字卡', value: 'replace' }
          ],
          pill: 'merge'
        });
      }
    });
    function pickImportFile(mode) {
      pickFiles('.json,application/json', false, (files) => {
        const f = files && files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result || ''));
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('格式错误');
            applyImportData(data, mode);
          } catch (e) {
            toast('导入失败：文件格式不正确');
          }
        };
        reader.readAsText(f);
      });
    }
    // 按模式写入：merge 分组内去重合并；replace 先清空再按文件填充；current 全部并入目标分类；返回 {added, dup}
    function writeImport(byCat, mode, targetCat) {
      let added = 0, dup = 0;
      if (mode === 'replace') {
        groups = { text: [], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
        Object.keys(byCat).forEach(cat => {
          const pairs = byCat[cat];
          groups[cat] = pairs.map(([n, cs]) => [n, cs.slice()]);
          pairs.forEach(([, cs]) => { added += cs.length; });
        });
      } else if (mode === 'current' && targetCat) {
        // v3.8.x：把文件里全部字卡都并入用户当前所在的分类（如颜文字），
        // 解决「颜文字当初加到主字卡、导出后在 text 键、导入回来仍在主字卡」的归属问题
        if (!groups[targetCat]) groups[targetCat] = [];
        Object.keys(byCat).forEach(cat => {
          byCat[cat].forEach(([name, cards]) => {
            const exist = groups[targetCat].find(x => x[0] === name);
            if (!exist) { groups[targetCat].push([name, cards.slice()]); added += cards.length; return; }
            const seen = new Set(exist[1]);
            cards.forEach(c => {
              if (seen.has(c)) { dup++; return; }
              seen.add(c); exist[1].push(c); added++;
            });
          });
        });
      } else {
        Object.keys(byCat).forEach(cat => {
          if (!groups[cat]) groups[cat] = [];
          byCat[cat].forEach(([name, cards]) => {
            const exist = groups[cat].find(x => x[0] === name);
            if (!exist) { groups[cat].push([name, cards.slice()]); added += cards.length; return; }
            const seen = new Set(exist[1]);
            cards.forEach(c => {
              if (seen.has(c)) { dup++; return; }
              seen.add(c); exist[1].push(c); added++;
            });
          });
        });
      }
      return { added: added, dup: dup };
    }
    // 解析文件 → byCat（{ 分类: [[分组名, 字卡数组], ...] }），再按模式写入
    function applyImportData(data, mode) {
      const byCat = {};
      let imported = 0;
      let fmt = '';
      // v3.5.72：识别星言简约版聊天字卡库导出 json（globalCards + cardGroups 结构）
      //   v3.5.73 修正：专属字卡的字卡内容+分组也正常导入，仅不导入其绑定的联系人
      //   （Mochi 无专属联系人概念，天然忽略联系人；不跳过任何字卡）
      if (Array.isArray(data.globalCards)) {
        fmt = '（星言格式）';
        const starToMochiCat = { custom: 'text', kaomoji: 'kaomoji', emojis: 'emoji', stickers: 'sticker', image: 'image', touch: 'poke', voices: 'voice' };
        const groupById = {};
        (Array.isArray(data.cardGroups) ? data.cardGroups : []).forEach(g => { if (g && g.id) groupById[g.id] = g; });
        const imgs = (data.images && typeof data.images === 'object') ? data.images : {};
        const voices = (data.voices && typeof data.voices === 'object') ? data.voices : {};
        data.globalCards.forEach(c => {
          if (!c || typeof c !== 'object') return;
          let content = c.content;
          if (typeof content === 'string' && content.indexOf('__img__') === 0) {
            content = imgs[c.id] || '';
          } else if (typeof content === 'string' && content.indexOf('__voice__') === 0) {
            content = voices[c.id] || '';
          }
          if (typeof content !== 'string' || !content) return;
          // 分类映射（未知分类归入主字卡）
          const cat = starToMochiCat[c.category] || 'text';
          // 分组名：cardGroups 匹配 groupId；无则用「默认」
          let gname = '默认';
          if (c.groupId && groupById[c.groupId]) gname = groupById[c.groupId].name || '默认';
          else if (c.groupName) gname = c.groupName;
          if (!byCat[cat]) byCat[cat] = [];
          let g = byCat[cat].find(x => x[0] === gname);
          if (!g) { g = [gname, []]; byCat[cat].push(g); }
          g[1].push(content);
          imported++;
        });
      }
      // v3.6.x：识别 milk 字卡库导出 json（customReplies/customReplyGroups/customEmojis/stickerLibrary 结构）
      const milkCards = [
        { cat: 'text',    field: 'customReplies', groups: ['customReplyGroups'] },
        { cat: 'poke',    field: 'customPokes',   groups: ['customPokeGroups'] },
        { cat: 'kaomoji', field: ['customKaomojis', 'customKaomoji', 'kaomojiLibrary'], groups: ['customKaomojiGroups', 'kaomojiGroups'] },
        { cat: 'sticker', field: ['stickerLibrary', 'customStickers'], groups: ['customStickerGroups', 'stickerGroups'] },
        { cat: 'emoji',   field: 'customEmojis', groups: [] }
      ];
      if (!fmt && milkCards.some(mc => {
        const f = Array.isArray(mc.field) ? mc.field : [mc.field];
        return f.some(k => Array.isArray(data[k])) || mc.groups.some(k => Array.isArray(data[k]));
      })) {
        fmt = '（milk 格式）';
        const pickField = (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) if (Array.isArray(data[k])) return data[k];
          return null;
        };
        // milk 分组（{id,name,color,disabled,items}）→ mochi 的 [分组名, 字卡数组]；未入组散卡归「未分组」
        const milkGroupPairs = (flat, grpKey) => {
          const pairs = [];
          const inGroup = new Set();
          const grpArr = grpKey ? data[grpKey] : null;
          if (Array.isArray(grpArr)) {
            grpArr.forEach(g => {
              if (!g || typeof g !== 'object') return;
              const name = String(g.name || '未分组');
              const cards = Array.isArray(g.items) ? g.items.filter(c => typeof c === 'string' && c) : [];
              if (!cards.length) return;
              cards.forEach(c => inGroup.add(c));
              const exist = pairs.find(x => x[0] === name);
              if (exist) exist[1] = exist[1].concat(cards);
              else pairs.push([name, cards.slice()]);
            });
          }
          if (Array.isArray(flat)) {
            const loose = flat.filter(c => typeof c === 'string' && c && !inGroup.has(c));
            if (loose.length) pairs.push(['未分组', loose]);
          }
          return pairs;
        };
        milkCards.forEach(mc => {
          const flat = pickField(mc.field);
          const grpKey = mc.groups.find(k => Array.isArray(data[k])) || null;
          const pairs = milkGroupPairs(flat, grpKey);
          if (!pairs.length) return;
          if (!byCat[mc.cat]) byCat[mc.cat] = [];
          pairs.forEach(([name, cards]) => { byCat[mc.cat].push([name, cards.slice()]); imported += cards.length; });
        });
      }
      // 本应用格式（mochi 字卡库导出 json）
      if (!fmt) {
        ['text', 'kaomoji', 'emoji', 'sticker', 'image', 'poke', 'voice'].forEach(k => {
          const arr = data[k];
          if (!Array.isArray(arr)) return;
          arr.forEach(g => {
            if (!Array.isArray(g) || g.length < 2) return;
            const name = String(g[0]);
            const cards = Array.isArray(g[1]) ? g[1].filter(c => typeof c === 'string' && c) : [];
            if (!cards.length) return;
            if (!byCat[k]) byCat[k] = [];
            const exist = byCat[k].find(x => x[0] === name);
            if (exist) exist[1] = exist[1].concat(cards);
            else byCat[k].push([name, cards.slice()]);
            imported += cards.length;
          });
        });
      }
      // v3.6.x：媒体类字卡 dataURL 白名单校验——导入 json 里混入的
      // `data:image/png" onerror=…` 之类（能通过 indexOf 前缀判断）会逃逸出
      // 聊天渲染的 src 属性注入 HTML；这里只放行 base64 图片/音频，其余丢弃。
      // 安全依据：base64 字符集（A-Za-z0-9+/=）不含引号/尖括号，无法逃逸属性；
      // MIME 放宽到全部 image/*（png/jpeg/gif/webp/svg/x-icon 等旧库不误丢）
      // v3.11.x：放行链接导入产生的 http(s) 图片字卡——URL 白名单同样禁引号/
      // 尖括号/空白字符，维持「无法逃逸 src 属性」的安全保证
      const RE_IMG = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]*$/;
      const RE_MEDIA_URL = /^https?:\/\/[^\s"'<>]+$/i;
      const RE_AUDIO = /^data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]*$/;
      let dropped = 0;
      ['image', 'sticker'].forEach(cat => {
        (byCat[cat] || []).forEach(pair => {
          const before = pair[1].length;
          pair[1] = pair[1].filter(c => { const s = String(c); return RE_IMG.test(s) || RE_MEDIA_URL.test(s); });
          dropped += before - pair[1].length;
        });
        byCat[cat] = (byCat[cat] || []).filter(pair => pair[1].length);
      });
      // 语音字卡：文件名|||音频dataURL
      if (byCat.voice) {
        byCat.voice.forEach(pair => {
          const before = pair[1].length;
          pair[1] = pair[1].filter(c => {
            const s = String(c);
            const p = s.indexOf('|||');
            return p > 0 && RE_AUDIO.test(s.slice(p + 3));
          });
          dropped += before - pair[1].length;
        });
        byCat.voice = byCat.voice.filter(pair => pair[1].length);
      }
      if (!imported) { toast('文件里没有可导入的字卡'); return; }
      const res = writeImport(byCat, mode, cur);
      saveGroups(groups);
      renderGroupsBar();
      render();
      if (mode === 'replace') toast('已替换字卡库 · 共 ' + res.added + ' 张字卡' + fmt + (dropped ? '，丢弃 ' + dropped + ' 条非法媒体' : ''));
      else if (mode === 'current') toast('已导入 ' + res.added + ' 张字卡到「' + (CAT_NAMES[cur] || '当前分类') + '」' + fmt + (res.dup ? '，自动去重 ' + res.dup + ' 条' : '') + (dropped ? '，丢弃 ' + dropped + ' 条非法媒体' : ''));
      else toast('已导入 ' + res.added + ' 张字卡' + fmt + (res.dup ? '，自动去重 ' + res.dup + ' 条' : '') + (dropped ? '，丢弃 ' + dropped + ' 条非法媒体' : ''));
    }
  }

  // ================= 清除全部字卡（v3.6.x） =================
  // 一键清空所有分类的全部字卡与全部分组；危险操作，需二次确认
  const ccClearAll = document.getElementById('cc-clear-all');
  if (ccClearAll) {
    ccClearAll.addEventListener('click', () => {
      if (window.openModal) {
        const total = totalCount(groups);
        window.openModal('清除全部字卡？', '', () => {
          // 各分类全清：字卡与分组一起删除，字卡库回到空状态
          Object.keys(groups).forEach(t => {
            groups[t] = [];
          });
          // 退出管理模式、清空搜索与分组筛选，回到全部视图
          if (manageMode) exitManage();
          q = '';
          curGroup = '';
          const si = document.getElementById('cc-search-input');
          if (si) si.value = '';
          selected.clear();
          saveGroups(groups);
          renderGroupsBar();
          render();
          toast('已清除全部字卡与分组');
        }, { noInput: true, staticText: '将删除全部 ' + total + ' 张字卡及所有分组（主字卡、颜文字、emoji、表情包、图片、拍一拍、语音），且无法恢复。确定继续吗？' });
      }
    });
  }

  // 批量导入：文字分类按【分组名】导入；【表情包】【图片】分类直接上传图片
  // v3.6.x：批量导入弹窗顶部「确定」按钮——安卓下多行输入被转成可自动增高的
  // ce-box，导入内容多时弹窗变高、底部「确定」滚出视野；在弹窗顶部标题栏右侧
  // 常驻一个「确定」按钮（复用底部按钮的点击，仅批量导入多行弹窗显示，
  // 弹窗关闭即还原，不影响其他弹窗）
  function showImportTopOk() {
    const mask = document.getElementById('modal-mask');
    const modal = mask ? mask.querySelector('.modal') : null;
    const title = document.getElementById('modal-title');
    if (!mask || !modal || !title) return;
    // 顶部条：标题 + 确定按钮（标题元素本身不动，仅换父节点，不影响其他逻辑读写它）
    let bar = document.getElementById('cc-modal-topbar');
    if (!bar || bar.parentNode !== modal) {
      bar = document.createElement('div');
      bar.id = 'cc-modal-topbar';
      bar.className = 'cc-modal-topbar';
      const btn = document.createElement('button');
      btn.id = 'cc-modal-top-ok';
      btn.className = 'cc-modal-top-ok';
      btn.textContent = '确定';
      btn.addEventListener('click', () => {
        const ok = document.getElementById('modal-ok');
        if (ok) ok.click();
      });
      bar.appendChild(btn);
      modal.insertBefore(bar, title);
      bar.insertBefore(title, btn);
    }
    // 监听弹窗关闭（确定/取消/遮罩/Enter）：还原标题位置并移除顶部条，
    // 下次打开其他弹窗不受影响
    if (mask && !mask.__ccTopOkWatch) {
      mask.__ccTopOkWatch = true;
      new MutationObserver(() => {
        if (!mask.hidden) return;
        const b = document.getElementById('cc-modal-topbar');
        if (b && b.parentNode === modal) {
          modal.insertBefore(title, b);
          b.remove();
        }
      }).observe(mask, { attributes: true, attributeFilter: ['hidden'] });
    }
  }
  const impBtn = document.getElementById('cc-import');
  if (impBtn) {
    impBtn.addEventListener('click', () => {
      // 媒体分类：表情包/图片上传图片，语音上传音频
      if (IMG_TYPES[cur]) {
        pickFiles(cur === 'voice' ? 'audio/*' : 'image/*', true, (files) => {
          if (!files.length) return;
          if (!groups[cur]) groups[cur] = [];
          // 目标分组：当前选中分组，否则默认分组（表情包/图片），再否则新建
          let g = null;
          if (curGroup) {
            g = groups[cur].find(g => g[0] === curGroup);
            if (!g) { g = [curGroup, []]; groups[cur].push(g); }
          } else {
            const defName = IMG_TYPES[cur];
            g = groups[cur].find(g => g[0] === defName);
            if (!g) { g = [defName, []]; groups[cur].push(g); }
          }
          let done = 0;
          let skipped = 0;
          // v3.6.x：上传大小限制——语音不压缩直接存 dataURL（字符串膨胀约 33%），
          // 超大音频会撑爆手机内存/IDB；图片虽有 260px 压缩兜底，原图读取也占峰值内存。
          // 语音限 10MB、图片限 20MB，超出跳过并提示
          const sizeLimit = cur === 'voice' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
          files.forEach((f) => {
            if (f.size > sizeLimit) {
              skipped++;
              done++;
              if (done === files.length) finishUpload(done - skipped, skipped);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const process = (data) => {
                // 语音：存 "文件名|||音频数据"，图片/表情：存图片 dataURL
                // v3.6.x：文件名去掉 mp3/mp4 等后缀（聊天里语音名称不显示 .mp3/.mp4）
                const val = cur === 'voice' ? ((f.name || '音频').replace(/\.[^.]+$/, '') + '|||' + data) : data;
                g[1].push(val);
                done++;
                if (done === files.length) finishUpload(done - skipped, skipped);
              };
              // v3.8.x：语音先归一化 MIME（安卓/雨见下 File.type 为空时 dataURL 无 audio/ 前缀，
              // 会触发乱码+无法播放），再存文件
              if (cur === 'voice') process(normalizeAudioDataURL(reader.result, f));
              else {
                // v3.7.x：GIF 动图跳过 canvas 压缩——canvas 只能画出第一帧，
                // 重绘成 PNG/JPEG 会把动图压成静态图，这里直存原图保留动画
                const isGif = /image\/gif/i.test(f.type || '') || /\.gif$/i.test(f.name || '');
                if (isGif) { process(reader.result); return; }
                // v3.7.x：原 260px 在 3x 高清屏被放大 2~3 倍导致模糊。
                //   图片分类当大图显示，压到 720px JPEG 0.85；表情包多小图且需透明背景，用 PNG 480px
                const isImg = cur === 'image';
                compressImage(reader.result, isImg ? 720 : 480, isImg ? 'image/jpeg' : 'image/png', isImg ? 0.85 : undefined).then((data) => {
                  // v3.6.x：压缩失败/图片过大返回 null——不存原图（防 iOS 解码崩溃），跳过并提示
                  if (!data) { skipped++; done++; if (done === files.length) finishUpload(done - skipped, skipped); return; }
                  process(data);
                });
              }
            };
            reader.readAsDataURL(f);
          });
          function finishUpload(ok, skip) {
            saveGroups(groups);
            renderGroupsBar();
            render();
            if (skip > 0) toast('已上传 ' + ok + ' 个，跳过 ' + skip + ' 个超大文件（' + (cur === 'voice' ? '音频>10MB' : '图片>20MB') + '）');
            else toast('已上传 ' + ok + ' 个' + (cur === 'voice' ? '音频' : '图片'));
          }
        });
        return;
      }
      // 文字分类：批量导入（一行一个；按【组名】识别分组 / txt 文件）
      if (window.openModal) {
        // v3.6.x：先注入顶部「确定」按钮，再打开弹窗（内容多时底部按钮滚出视野）
        showImportTopOk();
        window.openModal('批量导入字卡（一行一个）', '', (raw, targetGroup) => {
          // 一行一个字卡：统一按 \r\n / \r / \n 拆分——部分手机浏览器/剪贴板来源的换行是 \r，
          // 只按 \n 拆会把多行并成一行，全部混进同一个字卡
          const lines = String(raw || '').split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
          if (!lines.length) { toast('没有可导入的内容'); return; }
          if (!groups[cur]) groups[cur] = [];
          let curGrp = null;
          let imported = 0;
          let dup = 0;
          let newGroups = 0;
          // 同一分组内自动去重：分组已有字卡 + 本次已导入的都算，重复内容跳过
          const seenMap = new Map();
          const pushCard = (g, card) => {
            let seen = seenMap.get(g);
            if (!seen) { seen = new Set(g[1]); seenMap.set(g, seen); }
            if (seen.has(card)) { dup++; return false; }
            seen.add(card);
            g[1].push(card);
            return true;
          };
          if (targetGroup) {
            let g = groups[cur].find(g => g[0] === targetGroup);
            if (!g) { g = [targetGroup, []]; groups[cur].push(g); }
            curGrp = g;
          }
          lines.forEach(line => {
            const m = line.match(/^[【\[](.*?)[】\]](.*)$/);
            if (m && m[1].trim()) {
              const gname = m[1].trim();
              let g = groups[cur].find(g => g[0] === gname);
              if (!g) { g = [gname, []]; groups[cur].push(g); newGroups++; }
              curGrp = g;
              const rest = (m[2] || '').trim();
              if (rest && pushCard(g, rest)) imported++;
              return;
            }
            if (curGrp) {
              if (pushCard(curGrp, line)) imported++;
            } else {
              let g = groups[cur].find(g => g[0] === '未分组');
              if (!g) { g = ['未分组', []]; groups[cur].push(g); newGroups++; }
              if (pushCard(g, line)) imported++;
            }
          });
          saveGroups(groups);
          renderGroupsBar();
          render();
          toast('已导入 ' + imported + ' 条字卡' + (dup ? '，自动去重 ' + dup + ' 条' : '') + (newGroups ? '，新建 ' + newGroups + ' 个分组' : ''));
        }, {
          textarea: true,
          textareaPlaceholder: '【日常】\n你今天真好看\n我想你了',
          txtImport: true,
          // v3.6.x：传入当前分类的现有分组——openModal 的「目标分组」下拉只在
          // opts.groups 非空时显示；此前漏传，弹窗里永远没有分组选择框，
          // 只能靠【组名】前缀识别（回调的 targetGroup 逻辑一直在但从未触发）
          groups: (groups[cur] || []).map(g => g[0])
        });
      }
    });
  }

  // ================= 链接导入图片（v3.11.x，单链接/批量链接通用） =================
  // 【表情包】【图片】分类：粘贴图片 URL（一行一个）导入。
  // 优先 fetch 抓取 → 与上传同一压缩管线转存 dataURL（离线可用、聊天/收藏全兼容）；
  // 图床不允许跨域读取（CORS）/网络失败时回退存原始 http(s) 链接（需联网显示，
  // 聊天气泡按 type 渲染 <img src> 对远程链接天然兼容）；响应不是图片则判失败不存。
  // 拆行 + 清洗粘贴带上的尖括号/引号包裹，只放行 http(s) 地址；
  // 支持行首【组名】前缀指定落点分组（与文字批量导入同一写法）
  function splitUrlItems(raw) {
    return String(raw || '').split(/\r\n|\r|\n/)
      .map(l => l.trim()).filter(Boolean)
      .map(line => {
        const m = line.match(/^[【\[](.*?)[】\]]\s*(.*)$/);
        const rest = m ? (m[2] || '') : line;
        const url = rest.trim().replace(/^[<("'\u300a\u201c]+|[>)"'\u300b\u201d]+$/g, '');
        return { g: m && m[1].trim() ? m[1].trim() : '', url: url };
      })
      .filter(x => /^https?:\/\//i.test(x.url));
  }
  // 抓取单个链接：st='data' 转存成功 / st='url' 回退按链接保存 / st='fail' 彻底失败
  // processData(dataUrl)→Promise<string|null>：压缩管线（null=过大或解码失败）
  function fetchLinkImage(url, processData) {
    const once = (u) => new Promise((resolve) => {
      let settled = false;
      const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      // 12s 超时兜底：挂死的图床按「无法读取」回退链接保存，不拖死整批导入
      const timer = setTimeout(() => finish({ st: 'url', v: u }), 12000);
      fetch(u, { mode: 'cors' }).then(res => {
        if (!res.ok) throw new Error('http' + (res.status || ''));
        return res.blob();
      }).then(blob => {
        if (!/^image\//i.test(blob.type || '')) throw new Error('notimage');
        const fr = new FileReader();
        fr.onload = () => {
          const raw = String(fr.result || '');
          // GIF 直存原图保留动画（与上传口径一致）；超大 GIF 不解码存储，回退链接
          if (/image\/gif/i.test(blob.type)) {
            finish(raw.length > 8 * 1024 * 1024 ? { st: 'url', v: u } : { st: 'data', v: raw });
            return;
          }
          processData(raw).then(d => finish(d ? { st: 'data', v: d } : { st: 'url', v: u }));
        };
        fr.onerror = () => finish({ st: 'fail', v: u });
        fr.readAsDataURL(blob);
      }).catch(err => {
        // 非 CORS 类错误（能连上但内容不是图片）：存链接也只会得到破图，判失败
        const msg = (err && err.message) || '';
        finish(/^notimage|^http/.test(msg) ? { st: 'fail', v: u } : { st: 'url', v: u });
      });
    });
    // v3.11.x：https 站点下 http 图链会被浏览器按混合内容拦截——先自动升级 https
    // 试抓（多数图床 http/https 同源同图），失败再按用户粘贴的原始链接兜底保存
    if (location.protocol === 'https:' && /^http:\/\//i.test(url)) {
      return once(url.replace(/^http:\/\//i, 'https://')).then(r => r.st === 'data' ? r : once(url));
    }
    return once(url);
  }
  // 简易并发池（并发 4，保带宽不保序——上传路径的落库顺序本就取决于读取完成先后）
  // 结果按原始下标回填，Promise.all 结束后返回完整结果数组
  function runLinkPool(urls, worker) {
    const out = new Array(urls.length);
    let i = 0;
    function next() {
      if (i >= urls.length) return Promise.resolve();
      const idx = i++;
      return worker(urls[idx]).then((res) => { out[idx] = res; return next(); });
    }
    return Promise.all([0, 1, 2, 3].map(() => next())).then(() => out);
  }
  let linkImportBusy = false; // 防重复提交：上一批还在抓取时不允许叠开第二批
  const impLinkBtn = document.getElementById('cc-import-link');
  if (impLinkBtn) {
    impLinkBtn.addEventListener('click', () => {
      if (cur !== 'sticker' && cur !== 'image') { toast('链接导入仅支持「表情包」和「图片」分类'); return; }
      if (linkImportBusy) { toast('上一批链接还在导入中，请稍等'); return; }
      if (!window.openModal) return;
      window.openModal('链接导入' + MEDIA_TYPES[cur] + '（一行一个链接）', '', (raw, targetGroup) => {
        const items = splitUrlItems(raw);
        if (!items.length) { toast('没有可导入的图片链接（需以 http(s):// 开头）'); return; }
        linkImportBusy = true;
        if (!groups[cur]) groups[cur] = [];
        // 落点分组优先级：行首【组名】> 弹窗「目标分组」下拉 > 当前选中分组 > 分类默认分组
        // （与文字批量导入一致：前缀行永远进自己的组，下拉只接无前缀的行）
        let newGroups = 0;
        const buckets = {};
        const resolveBucket = (name) => {
          if (!buckets[name]) {
            let g = groups[cur].find(x => x[0] === name);
            if (!g) { g = [name, []]; groups[cur].push(g); newGroups++; }
            buckets[name] = { g: g, seen: new Set(g[1]) }; // 分组内去重：已有字卡 + 本次已导入都算重复
          }
          return buckets[name];
        };
        const jobs = items.map(it => ({ url: it.url, bucket: resolveBucket(it.g || targetGroup || curGroup || MEDIA_TYPES[cur]) }));
        let okData = 0, okUrl = 0, dup = 0, fail = 0, httpSaved = 0;
        toast('开始导入 ' + jobs.length + ' 个链接…');
        const isImgCat = cur === 'image';
        runLinkPool(jobs, (job) => fetchLinkImage(job.url, (dataUrl) =>
          compressImage(dataUrl, isImgCat ? 720 : 480, isImgCat ? 'image/jpeg' : 'image/png', isImgCat ? 0.85 : undefined)
        )).then(results => {
          results.forEach((res, i) => {
            const b = jobs[i].bucket;
            if (res.st === 'fail') { fail++; return; }
            if (b.seen.has(res.v)) { dup++; return; }
            b.seen.add(res.v);
            b.g[1].push(res.v);
            if (res.st === 'data') okData++;
            else {
              okUrl++;
              if (/^http:\/\//i.test(jobs[i].url)) httpSaved++; // 升级 https 抓取也失败才落到这里
            }
          });
          saveGroups(groups);
          renderGroupsBar();
          render();
          linkImportBusy = false;
          const got = okData + okUrl;
          toast('已导入 ' + got + ' 个' + MEDIA_TYPES[cur] +
            (okUrl ? '（其中 ' + okUrl + ' 个按链接保存，需联网显示' + (httpSaved ? '；含 ' + httpSaved + ' 个 http 链接，本站可能拦截不显示' : '') + '）' : '') +
            (dup ? '，跳过重复 ' + dup + ' 个' : '') +
            (fail ? '，失败 ' + fail + ' 个（非图片地址）' : '') +
            (newGroups ? '，新建 ' + newGroups + ' 个分组' : ''));
        }, () => {
          linkImportBusy = false;
          toast('导入出错，请重试');
        });
      }, {
        textarea: true,
        textareaPlaceholder: 'https://example.com/sticker.png\n一行一个链接，可粘贴多个批量导入\n可用【分组名】前缀指定分组，如：【日常】https://…\n\n提示：优先尝试转存为本地图片；图床不允许跨域时按链接保存',
        groups: (groups[cur] || []).map(g => g[0])
      });
    });
  }

  // 音频播放（事件委托；字卡删除统一走【管理字卡】）
  // 播放中：按钮高亮 + 图标变波形动画；再次点击暂停；同一时间只播放一条
  let playingAudio = null;
  let playingBtn = null;
  function stopPlay() {
    if (playingAudio) { try { playingAudio.pause(); } catch (e) {} playingAudio = null; }
    if (playingBtn) { playingBtn.classList.remove('playing'); playingBtn = null; }
  }
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.cc-play');
    if (!btn) return;
    if (playingBtn === btn) { stopPlay(); return; }
    // v3.6.x：audio dataURL 不存 DOM——从 WeakMap 按节点取（搜索过滤后索引会错位，不能回查）
    const src = audioSrcMap.get(btn) || '';
    if (!src) { stopPlay(); toast('音频数据不可用'); return; }
    stopPlay();
    playingAudio = new Audio(src);
    playingBtn = btn;
    btn.classList.add('playing');
    playingAudio.addEventListener('ended', stopPlay);
    playingAudio.addEventListener('error', stopPlay);
    playingAudio.play().catch(() => { stopPlay(); toast('播放失败'); });
  });

  renderGroupsBar();
  render();

  // ---- 回复池：给聊天页提供「自定义聊天字卡（公用+专属合并）」里所有字卡 ----
  // v3.11.x：公用字卡对所有桌面联系人生效——各回复池一律取当前作用域+公用合并视图
  window.getCustomCards = function () {
    const g = mergeWithPublic(groups);
    const out = [];
    Object.keys(g).forEach(t => g[t].forEach(([name, arr]) => arr.forEach(c => out.push(c))));
    return out;
  };
  // 拍一拍字卡（自定义字卡里【拍一拍】分类）
  window.getPokeCards = function () {
    const g = mergeWithPublic(groups);
    const out = [];
    (g['poke'] || []).forEach(([name, arr]) => arr.forEach(c => out.push(c)));
    return out;
  };
  // 拍一拍分组（分组名 + 字卡数组），供拍一拍页面展示
  window.getPokeGroups = function () {
    return (mergeWithPublic(groups)['poke'] || []).slice();
  };
  // 媒体字卡：表情包/图片 的图片 dataURL 列表、语音（文件名|||音频）列表（供回复/表情面板）
  // v3.11.x：链接导入的 http(s) 图片字卡同样放行（聊天气泡按 type 渲染 <img src>，
  // 对远程链接天然兼容；仅信件正文嵌入/朋友圈配图等「拼进文本」的场景仍只收 dataURL）
  function isMediaImg(c) {
    return typeof c === 'string' && (c.indexOf('data:image') === 0 || /^https?:\/\/[^\s"'<>]+$/i.test(c));
  }
  window.getMediaCards = function (type) {
    const g = mergeWithPublic(groups);
    const out = [];
    (g[type] || []).forEach(([name, arr]) => arr.forEach(c => {
      if (type === 'voice') {
        // 语音字卡：文件名|||音频数据
        if (typeof c === 'string' && c.indexOf('|||') > 0) out.push(c);
      } else if (isMediaImg(c)) {
        out.push(c);
      }
    }));
    return out;
  };
  // 媒体分组：表情包/图片 的分组结构（供表情面板展示）
  window.getMediaGroups = function (type) {
    const g = mergeWithPublic(groups);
    return (g[type] || []).map(([name, arr]) => [name, arr.filter(isMediaImg)]);
  };

  // ---- 多桌面：按指定联系人(cid)读取字卡（供朋友圈 TA 取各自桌面字卡）----
  function buildGroupsFrom(raw) {
    try {
      const g = JSON.parse(raw || 'null');
      if (g && g.text) return g;
    } catch (e) {}
    return { text: [], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
  }
  // 切换联系人后重载字卡库（好友圈 TA 取各自桌面字卡、当前桌面字卡库也要刷新）
  document.addEventListener('contact-switched', function () {
    if (editSaveTimer) { clearTimeout(editSaveTimer); editSaveTimer = null; }
    pubInvalidate();
    libCounts.pub = -1; libCounts.own = -1;
    groups = loadGroups();
    refreshLibCounts(false);
    try { renderGroupsBar(); render(); } catch (e) {}
  });
  // v3.11.x：For 系列同样合并公用字卡——朋友圈/信箱/群聊等按联系人取池时，
  // 公用字卡对该联系人生效（专属部分仍读各自桌面）
  window.getCustomCardsFor = function (cid) {
    const raw = (window.storeFor && window.storeFor(cid) || window.xyStore('xy-home-v2:' + cid)).get('cc-groups');
    const g = mergeWithPublic(buildGroupsFrom(raw));
    const out = [];
    Object.keys(g).forEach(t => (g[t] || []).forEach(([name, arr]) => (arr || []).forEach(c => out.push(c))));
    return out;
  };
  window.getPokeCardsFor = function (cid) {
    const raw = (window.storeFor && window.storeFor(cid) || window.xyStore('xy-home-v2:' + cid)).get('cc-groups');
    const g = mergeWithPublic(buildGroupsFrom(raw));
    const out = [];
    (g['poke'] || []).forEach(([name, arr]) => (arr || []).forEach(c => out.push(c)));
    return out;
  };
  window.getMediaCardsFor = function (cid, type) {
    const raw = (window.storeFor && window.storeFor(cid) || window.xyStore('xy-home-v2:' + cid)).get('cc-groups');
    const g = mergeWithPublic(buildGroupsFrom(raw));
    const out = [];
    (g[type] || []).forEach(([name, arr]) => (arr || []).forEach(c => {
      if (type === 'voice') {
        if (typeof c === 'string' && c.indexOf('|||') > 0) out.push(c);
      } else if (isMediaImg(c)) {
        out.push(c);
      }
    }));
    return out;
  };

  // ================= v3.11.x：存量自定义字卡归属迁移（一次性，幂等） =================
  // 需求规则：升级前已添加的自定义聊天字卡——
  //   · 有多个桌面联系人 → 归「专属」（原地保留在各联系人命名空间，不搬动）
  //   · 没有多个桌面联系人 → 归「公用」（迁到全局键 cc-groups-public 并清掉原专属键，
  //     之后新建的每个桌面联系人都共用这批字卡）
  // 时序：等 IDB 整体回填就绪（mochi-restore-done / __mochiDataReady）+ 本模块专属键
  // IDB 恢复尝试落定（ownRestoreP），防止把尚未恢复的空库当存量误迁；源数据在
  // LS/memoryCache 快照与 IDB 权威值之间取内容多者。标记 xy-home-v2:cc-scope-migrated。
  (function () {
    const gRoot = pubStore();
    let started = false;
    function run() {
      if (started) return;
      started = true;
      try {
        if (gRoot.get('cc-scope-migrated') === '1') return;
        const cs = (window.getContacts && window.getContacts()) || [{ id: 'default', name: '默认' }];
        if (cs.length > 1) { try { gRoot.set('cc-scope-migrated', '1'); } catch (e) {} return; }
        const cid = (cs[0] && cs[0].id) || 'default';
        const st = window.storeFor(cid);
        const isDefault = cid === 'default';
        // 旧版（多桌面功能之前）数据可能存顶层键 xy-home-v2:cc-groups——与 defaultStore()
        // 的回退读取口径一致：default 命名空间读空时回退顶层键；迁走后两处一起清
        let local = null;
        try { local = buildGroupsFrom(st.get('cc-groups')); } catch (e) {}
        if (isDefault && !countOf(local)) {
          try { local = buildGroupsFrom(gRoot.get('cc-groups')); } catch (e) {}
        }
        const pick = function (data) {
          try {
            if (!countOf(data)) { try { gRoot.set('cc-scope-migrated', '1'); } catch (e2) {} return; }
            gRoot.set(PUB_KEY, JSON.stringify(data));
            pubInvalidate();
            try { st.remove('cc-groups'); } catch (e2) {} // 迁走即清，防回复池公用+专属重复
            if (isDefault) { try { gRoot.remove('cc-groups'); } catch (e2) {} }
            libCounts.pub = -1; libCounts.own = -1;
            if (cid === (window.__activeCid || 'default')) {
              if (ccScope === 'own') { groups = loadGroups(); try { renderGroupsBar(); render(); } catch (e2) {} }
              else refreshLibCounts(false);
            } else refreshLibCounts(false);
            try { gRoot.set('cc-scope-migrated', '1'); } catch (e2) {}
          } catch (e) { try { gRoot.set('cc-scope-migrated', '1'); } catch (e3) {} }
        };
        if (window.idbGet) {
          // IDB 权威值参与比较（回填刚完成时两者一致；12s 保险丝提前放行时以 IDB 为准）
          const reads = [PUB_PREFIX + ':' + cid + ':cc-groups'];
          if (isDefault) reads.push(PUB_PREFIX + ':cc-groups');
          Promise.all(reads.map(k => window.idbGet(k).catch(() => null))).then(vals => {
            vals.forEach(v => {
              try {
                const d = typeof v === 'string' ? JSON.parse(v) : v;
                if (d && d.text && countOf(d) > countOf(local)) local = d;
              } catch (e) {}
            });
            pick(local);
          });
        } else pick(local);
      } catch (e) { try { gRoot.set('cc-scope-migrated', '1'); } catch (e2) {} }
    }
    let restoreReady = !!window.__mochiDataReady;
    if (restoreReady) ownRestoreP.then(run);
    else {
      document.addEventListener('mochi-restore-done', function h() {
        document.removeEventListener('mochi-restore-done', h);
        restoreReady = true;
        ownRestoreP.then(run);
      });
    }
  })();

  // ================= v3.11.x：字卡库 公用/专属 变动一次性提醒 =================
  // 升级后首次启动（数据就绪）弹出：说明双分类变动 + 引导先导出字卡 json 备份再使用新版。
  // 任一关闭路径（导出/知晓/✕/点遮罩）都记全局标记 cc-scope-notice-done，不再打扰；
  // 全新空库用户不打扰（直接置标记）。导出内容 =「当前桌面专属 + 公用」合并后的标准格式
  // json（与 字卡库→导入数据 完全兼容，选「追加字卡」即可恢复）。
  (function () {
    const gRoot = pubStore();
    function done() { try { gRoot.set('cc-scope-notice-done', '1'); } catch (e) {} }
    function totalMerged() {
      try { return countOf(mergeWithPublic(loadGroups())); } catch (e) { return 0; }
    }
    function show() {
      const mask = document.getElementById('cc-scope-mask');
      if (!mask) { done(); return; }
      const sum = document.getElementById('csn-summary');
      if (sum) sum.textContent = '已检测到你现有的字卡共 ' + totalMerged() + ' 张（公用 + 当前桌面专属）';
      const finish = function () { mask.hidden = true; done(); };
      const ex = document.getElementById('csn-export');
      const ok = document.getElementById('csn-ok');
      const cl = document.getElementById('csn-close');
      if (ex) ex.addEventListener('click', function () {
        try {
          const data = JSON.stringify(mergeWithPublic(loadGroups()), null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'mochi字卡库备份.json';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
          toast('字卡备份已导出');
        } catch (e) { toast('导出失败'); }
        finish();
      });
      if (ok) ok.addEventListener('click', finish);
      if (cl) cl.addEventListener('click', finish);
      mask.addEventListener('click', function (e) { if (e.target === mask) finish(); });
      mask.hidden = false;
    }
    function boot() {
      setTimeout(function () {
        try {
          if (gRoot.get('cc-scope-notice-done') === '1') return;
          if (!totalMerged()) { done(); return; } // 全新空库不打扰
          show();
        } catch (e) { try { done(); } catch (e2) {} }
      }, 1200);
    }
    if (window.__mochiDataReady) boot();
    else document.addEventListener('mochi-restore-done', function h() {
      document.removeEventListener('mochi-restore-done', h);
      boot();
    });
  })();

  // 入口：字卡库列表页点「公用字卡 / 专属字卡」进入本页（v3.11.x 双作用域）
  function openCcPage(scope) {
    ccScope = scope === 'public' ? 'public' : 'own';
    pubInvalidate();
    if (editSaveTimer) { clearTimeout(editSaveTimer); editSaveTimer = null; }
    groups = loadGroups();
    cur = 'text'; q = ''; curGroup = '';
    const ttl = document.getElementById('cc-page-title');
    if (ttl) ttl.textContent = ccScope === 'public' ? '公用字卡' : '专属字卡';
    const s1 = document.getElementById('cc-search-input');
    if (s1) s1.value = '';
    tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.type === 'text'));
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const ccPage = document.getElementById('page-custom-cards');
    if (ccPage) ccPage.hidden = false;
    try { renderGroupsBar(); render(); } catch (e) {}
  }
  const liPub = document.getElementById('li-custom-cards-public');
  if (liPub) liPub.addEventListener('click', () => openCcPage('public'));
  const li = document.getElementById('li-custom-cards');
  if (li) li.addEventListener('click', () => openCcPage('own'));
  const ccBack = document.getElementById('cc-back');
  if (ccBack) {
    ccBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
  }

  // v3.7.x：离开自定义字卡页时自动退出批量管理模式——manageBar 挂在 body 上，
  // 不随页面 hidden 隐藏，会残留并"跑到"其他页面（用户反馈）。监听 page-custom-cards
  // 的 hidden 变化，覆盖所有离开路径：返回按钮 / 底部 tab / 安卓返回键 / 其他入口
  const ccPageEl = document.getElementById('page-custom-cards');
  if (ccPageEl && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => {
      if (ccPageEl.hidden && manageMode) exitManage();
    }).observe(ccPageEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  // v3.7.x：字卡库页顶部两大分类切换（可自定义字卡 / 系统预设字卡）
  const ccSectBtns = document.querySelectorAll('.cc-top-tabs .cc-tab[data-ccsect]');
  const ccSectBodies = {
    custom: document.getElementById('cc-sect-custom'),
    preset: document.getElementById('cc-sect-preset')
  };
  ccSectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-ccsect');
      ccSectBtns.forEach(b => b.classList.toggle('sel', b === btn));
      if (searchInput2) searchInput2.value = '';
      if (searchResultEl) searchResultEl.hidden = true;
      Object.keys(ccSectBodies).forEach(key => {
        const el = ccSectBodies[key];
        if (el) el.hidden = (key !== k);
      });
    });
  });
})();

// ===== 功能：IndexedDB 存储（持久化关键数据，不丢失任何记录） =====
// 用于：字卡数据（cc-groups）、查岗记录（checkin-history）、聊天记录等
// 策略：写入时双写（localStorage 缓存 + IndexedDB 权威持久），
//       读取时优先 localStorage（同步快），初始化时从 IndexedDB 合并/恢复最新数据
(function () {
  const DB_NAME = 'mochi-db';
  const DB_VERSION = 1;
  const STORE = 'kv';

  let dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      try {
        if (!window.indexedDB) { reject(new Error('no idb')); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    // v3.6.x 修复（open 失败永久不可用）：失败时清 dbPromise 允许下次重试——
    // 原实现缓存 rejected Promise，整个会话 IDB 永久不可用（隐私模式/配额耗尽/
    // 浏览器临时禁用 IDB 后恢复时无法自愈）
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }
  // v3.25.x（修 iOS「字卡数据没有加载」高发）：iOS Safari/PWA 挂后台后会杀掉
  // IndexedDB 服务进程，原连接之后所有事务同步抛 InvalidStateError（"The database
  // connection is closing"）或 UnknownError（"Connection to Indexed Database server
  // lost"），而 open() 永久缓存旧连接 → 整个会话读写全废且永不自愈；若启动回填
  // 恰被打断，字卡库等大键本会话空载（字卡库空、TA 回复没有自定义字卡）。
  // 各事务入口检测到连接级错误时置 dbPromise=null，下一次 open() 重建连接
  //（新连接会按需拉起 IDB 服务，通常当场恢复）。
  function connLost(e) {
    try {
      if (!e) return false;
      if (e.name === 'InvalidStateError') return true;
      const m = String((e && e.message) || e);
      return /connection\s+(is\s+)?(closed|lost|closing)|server\s+lost|database\s+connection/i.test(m);
    } catch (err) { return false; }
  }

  // 写入（key: 完整键名，如 'xy-home-v2:cc-groups'）
  // v3.7.0：写入失败重试 2 次（间隔 100ms），累计失败超 5 次 openModal 告警。
  // 不破坏现有数据：重试是再写一次同样的 key/value，不删不改其他键。
  // 告警让用户感知"静默丢数据"风险——原实现 resolve(false) 调用方忽略返回值，
  // 数据只进 memoryCache 刷新即丢且无感知；告警后用户可主动导出备份。
  let _idbFailCnt = 0;
  let _idbFailAlerted = false;
  function _idbFailNotify() {
    _idbFailCnt++;
    if (_idbFailCnt < 5 || _idbFailAlerted) return;
    _idbFailAlerted = true;
    try { console.warn('[mochi] IDB 写入累计失败 ' + _idbFailCnt + ' 次，建议立即导出备份'); } catch (e) {}
    try {
      if (window.openModal) {
        window.openModal('存储异常', '', null, {
          noInput: true,
          staticText: '近期数据多次写入失败，可能因存储空间不足或浏览器限制。\n\n建议立即在设置页导出一份备份，避免数据丢失。'
        });
      }
    } catch (e) {}
  }
  window.idbSet = function (key, value) {
    function tryOnce() {
      return open().then(db => new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => { if (connLost(tx.error)) dbPromise = null; resolve(false); };
        } catch (e) { if (connLost(e)) dbPromise = null; resolve(false); }
      })).catch(() => false);
    }
    return (async () => {
      let ok = await tryOnce();
      if (!ok) { await new Promise(r => setTimeout(r, 100)); ok = await tryOnce(); }
      if (!ok) { await new Promise(r => setTimeout(r, 100)); ok = await tryOnce(); }
      if (!ok) _idbFailNotify();
      return ok;
    })();
  };

  // 批量写入（单事务一次完成，比逐条 idbSet 快；任一条失败则整体失败）
  window.idbSetAll = function (pairs) {
    if (!pairs || !pairs.length) return Promise.resolve(true);
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        pairs.forEach(p => { os.put(p.v, p.k); });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 读取
  // v3.9.x 修复（真我 Edge 切联系人后聊天记录消失）：IDB 事务在部分安卓内核
  //（真我 Edge 等）可能挂起——既不触发 onsuccess 也不触发 onerror，Promise 永不
  // resolve，上层 loadMsgs 回调永不执行，聊天记录渲染空后无法补回。加超时保护：
  // 4s 未返回则重试一次（新事务，偶发挂起可自愈），再 4s 仍未返回则 resolve(undefined)
  // 让上层走 LS 兜底/保险丝，避免永久卡死。总上限 8s（原 8+8=16s 进聊天页空白太久）。
  window.idbGet = function (key) {
    return open().then(db => new Promise((resolve) => {
      let done = false;
      let timer = null;
      function finish(val) { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(val); }
      function run() {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => finish(req.result);
          req.onerror = () => { if (connLost(req.error)) dbPromise = null; finish(undefined); };
        } catch (e) { if (connLost(e)) dbPromise = null; finish(undefined); }
      }
      let retried = false;
      timer = setTimeout(function () {
        if (done) return;
        if (!retried) {
          retried = true;
          // v3.25.x：重建连接再试——挂起超时多因连接已死（iOS 挂后台杀 IDB 服务），
          // 原地重试只会再等 4 秒；重开后新连接通常当场返回
          dbPromise = null;
          open().then(function (db2) {
            db = db2;
            run();
            timer = setTimeout(function () { dbPromise = null; finish(undefined); }, 4000);
          }).catch(function () { finish(undefined); });
          return;
        }
        dbPromise = null;
        finish(undefined);
      }, 4000);
      run();
    })).catch(() => undefined);
  };

  // v3.5.117：批量读取（单事务内多个 get，替代 N 次独立事务）——
  //   启动回填头像/图标/壁纸等几十个键时，从"几十次事务排队"降到"1 次事务"，
  //   手机端明显提速（每张图一个独立事务是桌面图片加载慢的主因之一）
  // v3.10.x：超时保护（与 idbGet 同款 4s+4s）——部分安卓内核（真我/荣耀 Edge 等）
  //   批量事务可能挂起（既不 onsuccess 也不 onerror），idbRestore 分批恢复链会整条
  //   卡死：12s 保险丝放行开屏后剩余键永远不回填，桌面头像/卡片背景/页面背景全部
  //   "丢失"。现在 4s 未完成对未返回的键重试一次（新事务），再 4s 放弃并返回已收到
  //   的部分结果，批次链继续走完。
  window.idbGetMany = function (keys) {
    const list = (keys || []).filter(Boolean);
    if (!list.length) return Promise.resolve({});
    return open().then(db => new Promise((resolve) => {
      const out = {};
      let done = false;
      let timer = null;
      let retried = false;
      const finish = () => { if (!done) { done = true; if (timer) clearTimeout(timer); resolve(out); } };
      function run(ks) {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const os = tx.objectStore(STORE);
          let pending = ks.length;
          ks.forEach(k => {
            const req = os.get(k);
            req.onsuccess = () => { out[k] = req.result; if (--pending <= 0) finish(); };
            req.onerror = () => { if (connLost(req.error)) dbPromise = null; if (--pending <= 0) finish(); };
          });
          tx.onerror = () => { if (connLost(tx.error)) dbPromise = null; finish(); };
          tx.onabort = () => { if (connLost(tx.error)) dbPromise = null; finish(); };
        } catch (e) { if (connLost(e)) dbPromise = null; finish(); }
      }
      timer = setTimeout(function () {
        if (done) return;
        if (!retried) {
          retried = true;
          const miss = list.filter(k => !(k in out));
          if (!miss.length) { finish(); return; }
          run(miss);
          timer = setTimeout(function () { dbPromise = null; finish(); }, 4000);
          return;
        }
        dbPromise = null;
        finish();
      }, 4000);
      run(list);
    })).catch(() => ({}));
  };

  // 列出所有键
  window.idbGetAllKeys = function () {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => { if (connLost(req.error)) dbPromise = null; resolve([]); };
      } catch (e) { if (connLost(e)) dbPromise = null; resolve([]); }
    })).catch(() => []);
  };

  // 删除
  window.idbDelete = function (key) {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 清空全部键（"清除所有数据"用）：不删库，避免连接占用导致 blocked
  window.idbClearAll = function () {
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // v3.6.x：原子替换全部键（导入备份用）——单事务内 clear() + 批量 put()。
  // 事务成功 = 全部替换完成；任一步失败/中止 → 整个事务回滚，store 保持事务开始前的
  // 旧数据。这取代「先 idbClearAll 清空、再逐条 idbSet」的导入流程——原流程清空与写入
  // 之间有几分钟无原子窗口，中途崩溃/杀进程会留下半空库，旧数据无法恢复。
  // 注意：不可克隆值（函数等）会让 put 同步抛 DataCloneError——必须捕获后主动 abort
  // 事务（否则同步异常只跳过该次 put，已排队的 clear/put 仍会提交，等于部分替换）。
  // entries: [{ k, v }, ...]；返回 Promise<boolean>（true=全部替换成功）
  window.idbReplaceAll = function (entries) {
    const list = (entries || []).filter(e => e && e.k !== undefined && e.k !== null);
    if (!list.length) return window.idbClearAll();
    return open().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        let bad = false;
        os.clear();
        try {
          list.forEach(e => { os.put(e.v, e.k); });
        } catch (e) {
          bad = true;
          try { tx.abort(); } catch (e2) {}
        }
        tx.oncomplete = () => resolve(!bad);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    })).catch(() => false);
  };

  // 存储适配层：各模块统一用它读写（接口与原 store 一致）。
  // IndexedDB 是权威持久层；localStorage 只是快速快照（配额满/隐私模式写失败也不丢数据——
  // 启动时从 IDB 恢复）；内存缓存兜底 localStorage 缺失的键。
  // v3.5.92：大键（>200KB，如头像池/壁纸/朋友圈背景等图片 dataURL）只写 IndexedDB，
  //   不写 localStorage——手机 5MB 配额不再被几十 MB 图片撑爆，大数据全进 IDB（配额大得多）
  const LS_BIG_LIMIT = 200 * 1024;
  let memoryCache = null;

  // v3.14.x：大键尺寸索引（OOM 防线之一）——启动回填前就能知道哪些键 >200KB，
  // 从而把大键单独逐批流式恢复（避免多个 MB 级字符串同批读入叠加峰值），
  // 并对大键驻留总量设预算上限（重度数据用户在手机上曾因回填把堆推到
  // 渲染进程上限直接崩溃，见 tools/diag-oom-repro.mjs 复现）。
  // 索引本身是极小的 JSON（只有键名+长度），存 localStorage；旧数据没有索引时
  // 回填会在读到实际值后自愈补记。键名带 __ 前缀，idbRestore 不回填它。
  const BIG_IDX_KEY = 'xy-home-v2:__big-idx';
  function bigIdxLoad() {
    try { return JSON.parse(localStorage.getItem(BIG_IDX_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  let _bigIdx = bigIdxLoad();
  let _bigIdxSaveTimer = null;
  function bigIdxSave() {
    if (_bigIdxSaveTimer) return;
    _bigIdxSaveTimer = setTimeout(function () {
      _bigIdxSaveTimer = null;
      try { localStorage.setItem(BIG_IDX_KEY, JSON.stringify(_bigIdx)); } catch (e) {}
    }, 300);
  }
  function bigIdxTrack(key, v) {
    const big = typeof v === 'string' && v.length > LS_BIG_LIMIT;
    if (big) {
      if (_bigIdx[key] !== v.length) { _bigIdx[key] = v.length; bigIdxSave(); }
    } else if (_bigIdx[key] !== undefined) {
      delete _bigIdx[key]; bigIdxSave();
    }
  }

  // v3.16.x：localStorage「写失败脏键」集合——set 时 localStorage.setItem 抛异常
  // （配额满/隐私模式）说明 LS 快照残留旧值，回填时这些键必须信 IndexedDB 而不是 LS。
  // 持久化双份：sessionStorage（同标签页刷新有效）+ IndexedDB 的 __ls-dirty 键
  // （跨浏览器重启仍有效——配额满/隐私模式通常持续，只有 IDB 是可靠源，用它记住
  // 哪些键的 LS 是坏的，回填时避开，不破坏 v3.16.x「IDB 权威」语义）。
  const LS_DIRTY_KEY = 'xy-home-v2:__ls-dirty';
  let _lsDirtyKeys = null;
  try {
    const s = sessionStorage.getItem(LS_DIRTY_KEY);
    if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) _lsDirtyKeys = new Set(arr); }
  } catch (e) {}
  function lsDirtySave() {
    const arr = _lsDirtyKeys ? Array.from(_lsDirtyKeys) : [];
    try { sessionStorage.setItem(LS_DIRTY_KEY, JSON.stringify(arr)); } catch (e) {}
    try { if (window.idbSet) window.idbSet(LS_DIRTY_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function lsDirtyAdd(k) {
    if (!_lsDirtyKeys) _lsDirtyKeys = new Set();
    _lsDirtyKeys.add(k);
    lsDirtySave();
  }
  function lsDirtyDel(k) {
    if (_lsDirtyKeys && _lsDirtyKeys.delete(k)) lsDirtySave();
  }

  window.xyStore = function (prefix) {
    return {
      get(k) {
        const key = prefix + ':' + k;
        // v3.16.x：内存缓存优先——localStorage 只是快速快照，配额满/隐私模式/存储异常时
        // setItem 静默失败，localStorage 会残留旧值；若 get 仍优先读它，memoryCache/IDB 里
        // 的新值被永久遮蔽（典型表现：换头像后聊天页顶部/气泡不更新，刷新、回前台重刷都不恢复）。
        // memoryCache 只在本会话写入（set 无条件写最新值；idbRestore/idbHydrateKey 回填 IDB
        // 权威值且跳过已有键），新鲜度恒 >= localStorage，优先读它保证「已写入的新值立即可见」。
        if (memoryCache && key in memoryCache) return memoryCache[key];
        try { const v = localStorage.getItem(key); if (v !== null) return v; } catch (e) {}
        return null;
      },
      set(k, v) {
        const key = prefix + ':' + k;
        // v3.5.111：内存缓存无条件初始化并写入——大键（壁纸/头像池等）只进 IDB + 内存、
        // 不进 localStorage；若缓存未初始化（页面刚加载、IDB 恢复未完成）就上传大图，
        // 会既不在 localStorage 也不在内存缓存，切回桌面时读空导致壁纸被清掉。
        if (!memoryCache) memoryCache = {};
        memoryCache[key] = v;
        try { bigIdxTrack(key, v); } catch (e) {}
        // 大键跳过 localStorage（只进 IDB + 内存缓存）
        const big = typeof v === 'string' && v.length > LS_BIG_LIMIT;
        if (!big) {
          try {
            localStorage.setItem(key, v);
            lsDirtyDel(key); // 写成功 → 清除脏标记
          } catch (e) {
            lsDirtyAdd(key); // 写失败 → 标记：回填时该键以 IDB 为准
          }
        } else {
          try { localStorage.removeItem(key); } catch (e) {}
        }
        try { if (window.idbSet) window.idbSet(key, v); } catch (e) {}
      },
      remove(k) {
        const key = prefix + ':' + k;
        if (memoryCache) delete memoryCache[key];
        try { localStorage.removeItem(key); } catch (e) {}
        if (_bigIdx[key] !== undefined) { delete _bigIdx[key]; bigIdxSave(); }
        try { if (window.idbDelete) window.idbDelete(key); } catch (e) {}
      }
    };
  };

  // v3.6.x：聊天记录键判定——旧顶层键 xy-home-v2:chat-msgs + 各联系人命名空间键
  // xy-home-v2:default:chat-msgs / xy-home-v2:cxxx:chat-msgs。聊天记录有独立的 LS
  // 兜底快照机制（chat.js writeLsSnapshot ≤2MB，专属 chat.js 管理），idbRestore
  // 与大键迁移都不得动它，否则聊天记录失去唯一 LS 备份。
  function isChatMsgsKey(k) {
    if (!k || typeof k !== 'string') return false;
    if (k.indexOf('xy-home-v2:') !== 0) return false;
    const tail = k.slice('xy-home-v2:'.length);
    return tail === 'chat-msgs' || /^[^:]+:chat-msgs$/.test(tail);
  }

  // 恢复：从 IndexedDB 读回 localStorage 缺失的键（初始化时调用）
  // v3.14.x OOM 防线（修复荣耀等安卓真机「开屏卡住→网页崩溃」）：
  //   原实现把所有键无上限读入 memoryCache 驻留——重度数据用户（几十 MB 字卡/
  //   图片键）启动回填时 JS 堆被推到渲染进程上限直接崩溃（diag-oom-repro.mjs
  //   实测 40MB 种子→堆 164MB→targetCrashed）。现改为：
  //   ① 大键（>200KB）按 __big-idx 索引提前识别，单独逐键流式恢复（不再与
  //      其他键同批叠加峰值）；旧数据无索引时读到实际值后自愈补记。
  //   ② 大键驻留总量设预算（设备内存 ≤4GB 取 12MB，否则 24MB）：超预算的键
  //      本会话不加载，记入 window.__xyIdbDeferredKeys，可用 window.idbHydrateKey(key)
  //      按需异步取回；小键行为完全不变。
  window.idbRestore = function (uidPrefix) {
    // v3.5.116：所有路径都设置就绪标志（空数据/无 IDB 也算就绪），
    //   开屏「点击进入」靠它判断，避免空数据场景误等
    let readySent = false;
    const sendReady = function () {
      if (readySent) return;
      readySent = true;
      try { window.__mochiDataReady = true; } catch (e) {}
      try { document.dispatchEvent(new Event('mochi-restore-done')); } catch (e) {}
    };
    let finished = false;
    const finish = function () {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      sendReady();
    };
    // v3.5.122：整体保险——极端情况（IndexedDB 事务挂起/设备存储异常）下
    //   12 秒后强制置就绪。否则 open() 或任一事务永不完成时，开屏永远
    //   「正在加载数据…」没有进入按钮（低端安卓机曾现卡死数分钟）。
    // v3.6.x：保险丝超时只放行开屏、不再截断恢复——低端机大量图片键分批恢复
    //   可能真的超过 12 秒，原逻辑会把剩余键丢弃（本会话数据缺失，只能刷新重试）；
    //   现在超时后开屏可进入，恢复循环继续后台把剩余键补齐
    const safety = setTimeout(function () {
      if (finished) return;
      sendReady(); // 放行开屏，不阻塞用户
      // 不置 finished：processBatch 继续恢复剩余键
    }, 12000);
    // v3.16.x：先恢复「LS 写失败脏键」集合（持久化在 IDB，跨浏览器重启仍有效）——
    // 必须在业务键回填之前读，回填时才能避开 LS 已损坏（残留旧值）的键、信 IDB 权威值
    Promise.all([window.idbGetAllKeys(), window.idbGet(LS_DIRTY_KEY)]).then(res => {
      const keys = res[0];
      try {
        const arr = JSON.parse(res[1] || '[]');
        if (Array.isArray(arr) && arr.length) {
          if (!_lsDirtyKeys) _lsDirtyKeys = new Set();
          arr.forEach(k => { if (k) _lsDirtyKeys.add(k); });
          try { sessionStorage.setItem(LS_DIRTY_KEY, JSON.stringify(Array.from(_lsDirtyKeys))); } catch (e) {}
        }
      } catch (e) {}
      if (!keys || !keys.length) { finish(); return; }
      const need = (keys || []).filter(k =>
        k.indexOf(uidPrefix) === 0 &&
        k !== LS_DIRTY_KEY && // 脏键索引自身不回填
        k.indexOf(uidPrefix + 'music-file:') !== 0 &&
        // v3.6.x：聊天记录不回填 localStorage——chat.js 已改为只写 IndexedDB，
        // 恢复到这里会重新占满 5MB 配额（几千条带图记录是几十 MB），且读取
        // 路径已不依赖 LS 快照（loadMsgs 直接 IDB 权威读）。
        // 修复：原 `indexOf(uidPrefix+'chat-msgs')!==0` 匹配不到命名空间键
        //（xy-home-v2:default:chat-msgs），改用 isChatMsgsKey 同时排除旧顶层键
        // 与各联系人命名空间键
        !isChatMsgsKey(k) &&
        // v3.7.0：自动备份副本键不回填——它是 data-backup.js 写入的全量 JSON 快照，
        // 体积可能几 MB，回填到 localStorage 会撑爆 5MB 配额，且不是业务数据
        k !== 'xy-home-v2:__auto-backup-snapshot' &&
        k !== BIG_IDX_KEY);
      if (!need.length) { finish(); return; }
      // v3.14.x：大键驻留预算——低内存手机（deviceMemory≤4GB）更保守。
      // 重度数据用户曾因回填把堆推到渲染进程上限直接崩溃（diag-oom-repro.mjs 复现：
      // 40MB 种子→手机级堆上限下 targetCrashed），预算封顶后最坏驻留可控。
      const deviceGB = (function () { try { return navigator.deviceMemory || 8; } catch (e) { return 8; } })();
      const BIG_BUDGET = (deviceGB <= 4 ? 12 : 24) * 1024 * 1024;
      let bigBudgetUsed = 0;
      let budgetWarned = false;
      window.__xyIdbDeferredKeys = [];
      // v3.14.x：已知大键分流（__big-idx 索引）——
      //   ① 超过整个预算的键【直接不读】：读了也留不下，白制造一次 MB 级垃圾峰值
      //     （GC 时机不可控，手机上垃圾堆积本身就是崩溃源），只登记挂起；
      //   ② 其余已知大键单独成批流式恢复；未知键单键起步探路，索引自愈后下次走快路
      const neverRead = [], knownBig = [], rest = [];
      need.forEach(function (k) {
        const sz = _bigIdx[k];
        if (typeof sz === 'number' && sz > LS_BIG_LIMIT) {
          if (sz > BIG_BUDGET) neverRead.push(k);
          else knownBig.push(k);
        } else rest.push(k);
      });
      if (neverRead.length) {
        budgetWarned = true;
        neverRead.forEach(function (k) { window.__xyIdbDeferredKeys.push(k); });
        try { console.info('[mochi] 启动回填：' + neverRead.length + ' 个超大键跳过加载（单键超 ' + Math.round(BIG_BUDGET / 1048576) + 'MB 预算），需要时可用 idbHydrateKey(键名) 按需取回'); } catch (e) {}
      }
      // 返回 true=已驻留；false=超预算挂起（或本会话已写入更新值，跳过）
      function retainValue(k, v) {
        if (v === undefined || v === null) return false;
        // 本会话已写入更新值则跳过（原 v3.6.x 语义）：OPPO 雨见等 IDB 慢的浏览器上，
        // 回填未完成时收到的新数据（大键只进 IDB+内存）若被 IDB 旧快照覆盖，
        // 会出现来信弹窗已提示、信箱列表却是旧数据的错位——memoryCache 有值即最新。
        if (memoryCache && (k in memoryCache)) return false;
        let str = typeof v === 'string' ? v : JSON.stringify(v);
        // v3.16.x 修复（摸鱼天数回退等）：idbSet 是异步 fire-and-forget，页面被杀/
        // 快速退出时 IDB 事务可能未完成 → IDB 值落后于 localStorage。若回填直接用
        // IDB 旧值写 memoryCache（get 优先读它），会把用户已写入的新值遮蔽——桌面
        // 摸鱼天数等显示旧值，且后续 logFish 等「读-改-写」基于旧值追加 → 真实丢数据。
        // 规则：localStorage 有该键且未标记「LS 写失败」→ 以 LS 为准（它是最新一次
        // 同步写成功的快照）；否则（LS 缺失 / LS 写失败过）→ 用 IDB 值（v3.16.x 语义）。
        // 注意：不回写 IDB——LS 写失败场景（配额满/隐私模式）IDB 是唯一新值源，
        // 回写会把 IDB 新值覆盖成旧值造成数据回退；IDB 落后会在下次业务 set
        // （logFish 等读-改-写）双写时自然追平。
        let lsVal = null;
        try { lsVal = localStorage.getItem(k); } catch (e) {}
        if (lsVal !== null && !(_lsDirtyKeys && _lsDirtyKeys.has(k))) {
          str = lsVal;
        }
        try { if (str.length > LS_BIG_LIMIT) { if (_bigIdx[k] !== str.length) { _bigIdx[k] = str.length; bigIdxSave(); } } else if (_bigIdx[k] !== undefined) { delete _bigIdx[k]; bigIdxSave(); } } catch (e) {}
        if (str.length > LS_BIG_LIMIT) {
          if (str.length > BIG_BUDGET || bigBudgetUsed + str.length > BIG_BUDGET) {
            window.__xyIdbDeferredKeys.push(k);
            if (!budgetWarned) {
              budgetWarned = true;
              try { console.info('[mochi] 启动回填：大键驻留超预算(' + Math.round(BIG_BUDGET / 1048576) + 'MB)，超出部分本会话挂起，可随时 idbHydrateKey(键名) 按需取回'); } catch (e) {}
            }
            return false;
          }
          bigBudgetUsed += str.length;
        }
        if (!memoryCache) memoryCache = {};
        memoryCache[k] = str;
        // v3.5.92：大键（>200KB 图片 dataURL）只留 IDB + 内存缓存，不回填 localStorage
        if (str.length > LS_BIG_LIMIT) return true;
        try {
          // 仅当 localStorage 无此键，或 IndexedDB 数据更新时覆盖
          if (!localStorage.getItem(k)) localStorage.setItem(k, str);
        } catch (e) {}
        return true;
      }
      // 队列：已知大键（solo 单元）优先，其后未知键按 curBatch 动态切批——
      // 初始单键探路（最坏瞬时峰值=最大单键×2，而非多键叠加），连续小键后恢复批量提速
      const soloQueue = knownBig.map(function (k) { return [k]; });
      let restIdx = 0;
      let curBatch = 1;
      let smallStreak = 0;
      function takeUnit() {
        if (soloQueue.length) return soloQueue.shift();
        if (restIdx >= rest.length) return null;
        const u = rest.slice(restIdx, restIdx + curBatch);
        restIdx += u.length;
        return u;
      }
      function processBatch() {
        if (finished) return;
        const unit = takeUnit();
        if (!unit) { finish(); return; }
        window.idbGetMany(unit).then(map => {
          let bytes = 0, allSmall = true;
          unit.forEach(k => { const v = map[k]; if (typeof v === 'string') { bytes += v.length; if (v.length > 65536) allSmall = false; } });
          // v3.25.x：本批没读到的键登记进挂起名单——事务部分超时/失败时这些键读丢了
          // 又不在名单里，下游所有按需取回路径（回复池/字卡库）都以名单为门槛，
          // 会整会话空载（iOS 挂后台打断回填时的高发症状）
          try { unit.forEach(function (k) { if (!(k in map) && window.__xyIdbDeferredKeys.indexOf(k) < 0) window.__xyIdbDeferredKeys.push(k); }); } catch (e0) {}
          unit.forEach(k => { retainValue(k, map[k]); map[k] = null; });
          // 自适应批次：本单元偏大 → 保持/回到单键探路；连续 10 个全小键单元 → 恢复批量
          if (bytes > 2 * 1048576) { curBatch = 1; smallStreak = 0; }
          else if (allSmall && ++smallStreak >= 10 && curBatch === 1) { curBatch = 4; smallStreak = 0; }
          setTimeout(processBatch, 0); // 让出主线程，下一批
        }).catch(() => {
          // v3.5.132：批次失败继续下一批（原实现 finish() 会截断剩余全部键——
          // 低端机偶发事务失败时几百个键本会话不恢复）
          // v3.25.x：失败批次整组登记挂起名单（留痕给按需取回路径，见上）
          try { unit.forEach(function (k) { if (window.__xyIdbDeferredKeys.indexOf(k) < 0) window.__xyIdbDeferredKeys.push(k); }); } catch (e0) {}
          setTimeout(processBatch, 0);
        });
      }
      setTimeout(processBatch, 0);
    }).catch(() => { finish(); });
  };
  // v3.14.x：按需恢复单个键（含被预算挂起的大键）——显式调用不受预算限制，
  // 成功后自动移出 __xyIdbDeferredKeys。供各功能模块对"用户正在看的"大数据
  // 做懒加载兜底（如打开字卡面板前先 idbHydrateKey('xy-home-v2:cc-groups')）。
  // v3.25.x：返回值区分三种结果——true=取回成功；null=健康连接确认 IDB 无此键
  //（新装/新联系人的正常空库，调用方可以缓存「确实没有」避免反复空读）；
  // false=读取失败/超时（如 iOS 挂后台连接被杀），调用方保持可重试。
  window.idbHydrateKey = function (key) {
    // v3.28.x：修「还有手机没解决」第三层——原实现单次 8s 超时，对「慢但可用」的 IDB
    //（真我/荣耀 Edge 等内核事务偶发挂起；MB 级字卡库读取耗时可能 >8s）会直接判失败，
    // 且不重试。字卡回复池整会话取不回自定义字卡，联系人一直发兜底那几条系统预设卡。
    // 与 idbGet 同款 4s+4s：4s 未返回先重建连接重试一次（挂起多因连接已死，重开后通常
    // 当场返回），再 4s 仍无返回才放弃——总上限仍 8s，但成功率大幅提升。
    return open().then(db => new Promise((resolve) => {
      let done = false;
      let timer = null;
      function finish(val) { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(val); }
      function run() {
        try {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => finish(req.result === undefined ? null : req.result);
          req.onerror = () => { if (connLost(req.error)) dbPromise = null; finish(undefined); };
        } catch (e) { if (connLost(e)) dbPromise = null; finish(undefined); }
      }
      let retried = false;
      timer = setTimeout(function () {
        if (done) return;
        if (!retried) {
          retried = true;
          dbPromise = null;
          open().then(function (db2) { db = db2; run(); timer = setTimeout(function () { dbPromise = null; finish(undefined); }, 4000); }).catch(function () { finish(undefined); });
          return;
        }
        dbPromise = null;
        finish(undefined);
      }, 4000);
      run();
    })).then(v => {
      if (v === null) return null;
      if (v === undefined) return false;
      if (!(memoryCache && (key in memoryCache))) {
        let str = typeof v === 'string' ? v : JSON.stringify(v);
        // 与 retainValue 同规则（v3.16.x 摸鱼天数回退修复）：LS 有值且未写失败 →
        // 以 LS 为准（IDB 异步写可能未落地）；LS 缺失/写失败 → 用 IDB 值；不回写 IDB
        let lsVal = null;
        try { lsVal = localStorage.getItem(key); } catch (e) {}
        if (lsVal !== null && !(_lsDirtyKeys && _lsDirtyKeys.has(key))) {
          str = lsVal;
        }
        if (!memoryCache) memoryCache = {};
        memoryCache[key] = str;
        try { if (str.length > LS_BIG_LIMIT) { if (_bigIdx[key] !== str.length) { _bigIdx[key] = str.length; bigIdxSave(); } } } catch (e) {}
        if (str.length <= LS_BIG_LIMIT) { try { if (!localStorage.getItem(key)) localStorage.setItem(key, str); } catch (e) {} }
      }
      const di = window.__xyIdbDeferredKeys;
      if (Array.isArray(di)) { const i = di.indexOf(key); if (i >= 0) di.splice(i, 1); }
      return true;
    }).catch(() => false);
  };
  window.__mochiLoadT = Date.now();
  // v3.5.24：启动时自动从 IndexedDB 回填 localStorage 缺失的键。
  // 之前只定义不调用——手机端导入/配额异常导致 localStorage 部分丢失后，IndexedDB 里的
  // 聊天记录/字卡/查岗等备份永远不会回填。现在初始化自动跑一次。
  try { window.idbRestore('xy-home-v2:'); } catch (e) {}

  // v3.5.92：一次性迁移——localStorage 里 >200KB 的旧大键（头像池/壁纸/朋友圈背景等）
  // 移入 IndexedDB 并从 localStorage 删除（老用户升级后 LS 立刻瘦身，不再撑爆 5MB）
  // v3.5.122：music-file 旧双写残留也一并迁移（旧版本音频存过 LS，读取路径会先查 IDB，
  //   迁移删掉 LS 副本后仍能从 IDB 读到；写入成功才删，失败保留下次重试）
  try {
    if (!sessionStorage.getItem('xy-ls-big-migrated')) {
      let moved = 0;
      // 先收集键再处理：避免边删边遍历导致索引跳跃漏项
      const bigKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('xy-home-v2:') !== 0) continue;
        // v3.6.x：聊天记录 LS 兜底快照（200KB~2MB 常见）绝不能当大键搬进 IDB 后
        // 删 LS——否则 Edge 等浏览器杀后台/强制关闭时丢 IndexedDB 数据，聊天记录
        // 连唯一备份都没了（vivo S16 Edge 实测：收藏/音乐/字卡/信/朋友圈都在
        //（LS+IDB 双写），唯独聊天记录整体消失——聊天是唯一只写 IDB 的数据）
        if (isChatMsgsKey(k)) continue;
        const v = localStorage.getItem(k);
        if (v && v.length > LS_BIG_LIMIT) bigKeys.push(k);
      }
      // v3.5.95：逐键写入成功才从 localStorage 删除（防 IDB 写失败时数据双丢）；
      // 全部成功才置迁移标记（部分失败时下次启动会重试未迁移的键）
      (async () => {
        let moved = 0;
        for (const k of bigKeys) {
          const v = localStorage.getItem(k);
          if (!v) continue;
          try {
            const ok = await window.idbSet(k, v);
            if (ok) {
              // v3.5.132：同步写 memoryCache——迁移的键不在 idbRestore 的快照里，
              // 不写 cache 的话本会话 store.get 三路全空（壁纸/背景"消失"直到刷新）
              if (!memoryCache) memoryCache = {};
              memoryCache[k] = v;
              try { localStorage.removeItem(k); } catch (e) {}
              moved++;
            }
          } catch (e) {}
        }
        if (moved > 0) { try { sessionStorage.setItem('xy-ls-big-migrated', '1'); } catch (e) {} }
      })();
    }
  } catch (e) {}

  // v3.16.x：跨上下文同步——get 改 memoryCache 优先后，另一上下文（PWA + 浏览器标签双开、
  // 多窗口）写入 localStorage 的新值会被本侧 memoryCache 旧值遮蔽。storage 事件（仅跨上下文
  // 触发）到达时删除对应缓存键，后续 get 自然回退读到 localStorage 新值；业务侧（如
  // avatar-lib 的 storage 监听）随后触发界面刷新。e.key 是完整键（含前缀），与 memoryCache 键一致。
  window.addEventListener('storage', function (e) {
    try {
      if (e && e.key && memoryCache && e.key in memoryCache) delete memoryCache[e.key];
    } catch (err) {}
  });
})();

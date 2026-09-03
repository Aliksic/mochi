// ===== #142 媒体池（内容寻址去重）=====
// 问题：聊天记录/收藏里同一张表情包/图片每发一次就整份 base64 存一遍（诊断实证
// chat-msgs 全桌面 ≈214MB，其中同一批字卡表情重复占大头）。
// 方案：图片 dataURL 按 SHA-256 内容哈希存进全局媒体池（IndexedDB 键 xy-home-v2:media:<hash>，
// 只存一份），消息/收藏里替换为令牌 @@m:<hash32>。令牌跨桌面/跨会话/跨设备（备份携带池键）
// 稳定自描述。渲染解析集中在本文档级 MutationObserver——img[src^="@@m:"] 内存命中同步重写、
// 未命中异步取回后重写，业务渲染代码零改动。
// 数据安全底线：
//   · 池数据落盘先于引用落盘（normalize 流程先 mochiMediaFlush 再 saveMsgs）——崩溃窗口内
//     最多「池多一条孤儿」，绝不会出现「令牌入库而池数据丢失」；
//   · 写池前先查池（idbGetMany 批量）——已有同哈希条目不重复写，跨会话零重写；
//   · crypto.subtle 不可用（非安全上下文）时整模块禁用，一切保持旧路径，绝无半启用态；
//   · v1 池只增不删（无 GC），孤儿条目体积=去重后的唯一内容量，可控。
// 消费方：chat.js（消息令牌化 normalize + 编辑入口展开）、chat.js 收藏压缩管道（CAS）。
// 注意：本文件须在 chat.js 之前加载（渲染解析要先于首屏渲染就位），jsFiles 已登记。
(function () {
  const FULL = 'xy-home-v2:media:';
  const TOK = '@@m:';
  const TOKEN_RE = /^@@m:([0-9a-f]{32})$/;
  // 非安全上下文/无 IDB → 整模块禁用（提供恒空展开，业务侧按 null 回退原值）
  const OK = typeof crypto !== 'undefined' && crypto.subtle && window.idbGet && window.idbGetMany && window.idbSetAll;
  window.mochiMediaExpand = function (s) { return null; };
  window.mochiMediaIsToken = function (s) { return typeof s === 'string' && TOKEN_RE.test(s); };
  if (!OK) return;

  const map = new Map();            // hash -> dataURL（已解析/已落池内容，渲染热缓存）
  const inflight = {};              // hash -> true（渲染侧单飞取回）
  let writeBuf = [];                // 待落池 [{k,v}]
  let flushT = null;
  // 真实现（OK 路径）：令牌→池内容；未知哈希/非令牌→null（调用方按 null 回退原值）
  window.mochiMediaExpand = function (s) {
    const m = TOKEN_RE.exec(s || '');
    return m ? (map.get(m[1]) || null) : null;
  };

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    const arr = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < arr.length; i++) out += arr[i].toString(16).padStart(2, '0');
    return out.slice(0, 32); // 128 位十六进制前缀——实际内容寻址撞库概率为 0，键长可控
  }
  window.mochiMediaFlush = function () {
    if (flushT) { clearTimeout(flushT); flushT = null; }
    if (!writeBuf.length) return Promise.resolve(true);
    const buf = writeBuf.splice(0);
    return window.idbSetAll(buf).then(function (ok) {
      if (!ok) { writeBuf = buf.concat(writeBuf); scheduleFlush(); }
      return ok;
    }).catch(function () { writeBuf = buf.concat(writeBuf); scheduleFlush(); return false; });
  };
  function scheduleFlush() { if (!flushT) flushT = setTimeout(function () { flushT = null; window.mochiMediaFlush(); }, 300); }
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') window.mochiMediaFlush();
    });
  } catch (e) {}

  // 池探测队列：同一哈希的多次 tokenize 合并成一次 idbGetMany（跨记录重复表情只查/写一次）
  const lookupQueue = new Map();    // hash -> { data, cbs:[] }
  let lookupT = null;
  window.mochiMediaTokenize = function (dataUrl) {
    return new Promise(function (resolve) {
      if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0 || dataUrl.length < 1024) { resolve(null); return; }
      sha256Hex(dataUrl).then(function (h) {
        if (map.has(h)) { resolve(TOK + h); return; }
        let q = lookupQueue.get(h);
        if (!q) { q = { data: dataUrl, cbs: [] }; lookupQueue.set(h, q); }
        q.cbs.push(resolve);
        if (!lookupT) lookupT = setTimeout(runLookups, 60);
      }).catch(function () { resolve(null); });
    });
  };
  async function runLookups() {
    lookupT = null;
    if (!lookupQueue.size) return;
    const entries = Array.from(lookupQueue.entries());
    lookupQueue.clear();
    let dirty = false;
    for (let i = 0; i < entries.length; i += 40) {
      const slice = entries.slice(i, i + 40);
      let vals = {};
      try { vals = (await window.idbGetMany(slice.map(function (e) { return FULL + e[0]; }))) || {}; } catch (e) { vals = {}; }
      slice.forEach(function (e) {
        const v = vals[FULL + e[0]];
        if (typeof v === 'string') { map.set(e[0], v); }          // 池里已有（跨会话/桌面重复）→ 不重写
        else { map.set(e[0], e[1].data); writeBuf.push({ k: FULL + e[0], v: e[1].data }); dirty = true; }
        e[1].cbs.forEach(function (cb) { try { cb(TOK + e[0]); } catch (e2) {} });
      });
      await new Promise(function (r) { setTimeout(r, 0); }); // 分批让出主线程
    }
    if (dirty) scheduleFlush();
  }

  // ===== 集中渲染解析：img[src^="@@m:"] → 池数据 =====
  function resolveImg(img) {
    const m = TOKEN_RE.exec(img.getAttribute('src') || '');
    if (!m) return;
    const h = m[1];
    const v = map.get(h);
    if (v) { img.src = v; return; }
    if (inflight[h]) return;
    inflight[h] = true;
    window.idbGet(FULL + h).then(function (v2) {
      delete inflight[h];
      if (typeof v2 !== 'string') return; // 池缺失（理论不发生：池先于引用落盘）→ 保持原样不伪装
      map.set(h, v2);
      let nodes;
      try { nodes = document.querySelectorAll('img[src="' + TOK + h + '"]'); } catch (e) { nodes = []; }
      Array.prototype.forEach.call(nodes, function (el) { el.src = v2; });
    }).catch(function () { delete inflight[h]; });
  }
  function scanRoot(root) {
    if (!root) return;
    let nodes;
    try { nodes = root.querySelectorAll ? root.querySelectorAll('img[src^="' + TOK + '"]') : null; } catch (e) { return; }
    if (nodes) Array.prototype.forEach.call(nodes, resolveImg);
    if (root.tagName === 'IMG') resolveImg(root);
  }
  try {
    const obs = new MutationObserver(function (muts) {
      for (let i = 0; i < muts.length; i++) {
        const mu = muts[i];
        if (mu.type === 'attributes' && mu.target && mu.target.tagName === 'IMG') resolveImg(mu.target);
        else if (mu.type === 'childList') {
          for (let j = 0; j < mu.addedNodes.length; j++) scanRoot(mu.addedNodes[j]);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  } catch (e) {}
  // 观察器挂载前已存在的 DOM（本脚本先于 body 尾部业务渲染执行，正常为空）兜底扫一遍
  function bootScan() { scanRoot(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootScan);
  else bootScan();
})();

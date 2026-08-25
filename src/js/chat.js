// ===== 功能：聊天页 =====
// 桌面点「聊天」进入；顶部标题/双方头像读取桌面设置；可发送消息
// 联系人回复按「通用设置」概率链生成（被动回复 + 主动发送）
// 消息持久化到 localStorage，刷新后恢复
(function () {
  const body = document.getElementById('chat-body');
  if (!body) return;

  const uid = window.activePrefix();
  const store = window.activeStore();

  // v3.5.116：收起输入法（手机端打开底部面板时先 blur，键盘不再挤压/遮挡面板）
  // v3.5.127：contenteditable 输入框（聊天输入栏 div 版）同样需 blur 收起输入法
  function closeIme() {
    try {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) ae.blur();
    } catch (e) {}
  }

  // ---- 消息存储 ----
  let msgs = [];
  // v3.6.x：本会话内被编辑/撤回/局部撤回过的消息索引——loadMsgs 用 IndexedDB 快照
  // 合并时，若命中索引（且与 IDB 条数对齐），以内存版本为准，防止防抖窗口内
  // 的编辑/撤回被旧 IDB 快照回滚（索引在消息只增不改的模型下稳定）
  const sessionChangedIdx = new Set();
  // v3.5.118：聊天记录权威加载防护——修复「导入后聊天记录丢失」的启动竞态：
  // 导入时聊天记录被挪进 IndexedDB（localStorage 无此键）；页面加载瞬间
  // 查岗/日常等模块会立即写入一条新消息（p2-features.doCheckin），此时 IDB
  // 权威数据尚未读回，若直接 saveMsgs 会用 [1条] 覆盖 IndexedDB 里的全部历史。
  // chatDbReady=false 期间 saveMsgs 只暂存内存、不落盘；loadMsgs 首次从 IDB
  // 读到完整历史后才置真，后续保存恢复正常双写。
  let chatDbReady = false;
  let pendingLocal = null; // 权威就绪前暂存的内存消息（绝不落盘，防止污染读取/覆盖 IDB）
  // v3.5.127：防抖——TA 连发多条（间隔 1-3s）时把多次全量序列化合并成一次
  //（历史上千条带图消息时每次 stringify 是几十 MB，逐条写会明显卡顿）
  // v3.6.x：聊天记录改为只写 IndexedDB——store.set 会同步写 localStorage
  //（<200KB 时），几千条带图记录下同步 setItem 会卡主线程；IDB 写入是异步的。
  // 读取路径（loadMsgs）同步改为 IDB 权威，localStorage 不再承担聊天记录快照。
  let saveTimer = null;
  // v3.6.x：多桌面——切换联系人后清空聊天内存状态。
  // loadMsgs 会把「内存 msgs + IDB 权威」合并，若不重置，旧桌面的消息会
  // 被并入新桌面的聊天记录（串桌面）；重置后下次 enterChat → loadMsgs 从
  // 新桌面的 IDB 命名空间重新加载。chatDbReady 归 false 使保存暂存内存，
  // 避免新桌面的历史被误覆盖。
  // v3.6.x：同一次切换一并清掉「会话内跨桌面残留」——待引用（lastQuote）、
  // TA 引用/收藏用的最后一条我的消息（lastMineText）、待发送图片草稿
  // （draftImgs）与输入框草稿文本。否则在 A 桌面选了引用/打了字再切到 B，
  // B 桌面发消息会带上 A 桌面聊天里的消息内容（数据串桌面）。
  document.addEventListener('contact-switched', function () {
    try {
      // v3.7.x：防抖期间切联系人——先把待写消息落盘到旧桌面，再清 timer + 重置 msgs
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (pendingSaveData && pendingSavePrefix) {
          try { if (window.idbSet) window.idbSet(pendingSavePrefix + ':chat-msgs', pendingSaveData); } catch (e) {}
          try { writeLsSnapshot(pendingSaveData, pendingSavePrefix); } catch (e) {}
        }
        pendingSaveData = null;
        pendingSavePrefix = null;
      }
      try { hideTyping(); } catch (e) {}
      msgs = [];
      pendingLocal = null;
      chatDbReady = false;
      sessionChangedIdx.clear();
      armReadyFuse();
      try { lastQuote = null; } catch (e) {}
      try { lastMineText = ''; } catch (e) {}
      try { lastQuotedText = ''; } catch (e) {}
      try {
        draftImgs = [];
        renderDraft();
      } catch (e) {}
      try { if (input) input.textContent = ''; } catch (e) {}
      // v3.7.x：切换联系人后刷新顶部栏名字 + 双方头像（原实现从不刷新，顶部栏停留在旧联系人名字）
      try { updateChatPartnerName(); } catch (e) {}
      try { fillAvatar('chat-user-av', 'cs-avatar-user'); fillAvatar('chat-partner-av', 'cs-avatar-partner'); } catch (e) {}
      // v3.7.x：切联系人后刷新"让对方继续说"入口（昵称 title / 底部按钮显隐）
      try { if (window.applyContinueSayUI) window.applyContinueSayUI(); } catch (e) {}
    } catch (e) {}
  });
  // v3.6.x：localStorage 兜底快照——聊天记录权威数据只存 IndexedDB（几千条带图
  // 记录是几十 MB，LS 5MB 配额放不下且同步 setItem 卡主线程），但个别安卓内核
  //（QQ浏览器 X5 等）可能清掉/丢失 IndexedDB 数据（信箱等 LS+IDB 双写功能不受
  // 影响，唯独聊天记录"重进后消失"）。为让聊天记录同样有 LS 兜底：写 IDB 的同时
  // 写一份【有损快照】到 LS（≤2MB；超限时剥掉 img/voice 等图片字段只保文本历史）。
  // loadMsgs 在 IDB 无数据时自动从这份快照恢复（复用了原「老版本 LS 迁入 IDB」
  // 的恢复分支，同一键名）。
  const LS_SNAP_LIMIT = 2 * 1024 * 1024;
  function writeLsSnapshot(raw, prefix) {
    try {
      let snap = raw;
      if (snap.length > LS_SNAP_LIMIT) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          snap = JSON.stringify(arr.map(m => {
            if (!m || typeof m !== 'object') return m;
            const hasBig = m.img || m.voice || (typeof m.text === 'string' && m.text.length > 8192);
            if (!hasBig) return m;
            const c = Object.assign({}, m);
            // v3.12.x：给有损副本打标记——冷启动先读这份快照，IDB 权威读回合并时
            // 剥过 img/voice 的记录指纹（img=''）必不等于完整版，会被当成新消息
            // append → 图片/语音类历史永久翻倍。带标记（及 img===''/voice==='' 的
            // 旧版剥离残留）的记录只要 IDB 已有同 ts+side 记录就不再计入本地新增。
            c._lsLite = 1;
            if (c.img) c.img = '';
            if (c.voice) c.voice = '';
            if (typeof c.text === 'string' && c.text.length > 8192) c.text = '[内容已省略]';
            return c;
          }));
        }
      }
      if (snap.length <= LS_SNAP_LIMIT) {
        localStorage.setItem((prefix || window.activePrefix()) + ':chat-msgs', snap);
      }
    } catch (e) {}
  }
  // v3.6.x：IDB 权威读取保险丝（仿 mail.js 15s）——X浏览器等第三方浏览器在 OPPO
  // 后台挂起时 indexedDB.open/读取可能永不返回，chatDbReady 永远 false → 消息只进
  // 内存不落盘，刷新即丢（用户实测"聊一天、第二天全没"）。15s 后强制就绪：此后
  // 保存至少走 LS 快照兜底，IDB 恢复后 loadMsgs 按权威合并；就绪时若有未落盘消息
  // 顺手写一份快照，防就绪后立刻被杀。仅在未就绪时武装一次，切联系人后重新武装。
  let readyFuse = null;
  function armReadyFuse() {
    if (readyFuse || chatDbReady) return;
    const fusePrefix = window.activePrefix();
    readyFuse = setTimeout(function () {
      readyFuse = null;
      if (chatDbReady) return;
      chatDbReady = true;
      const fuseMsgs = (pendingLocal && pendingLocal.length) ? pendingLocal : msgs;
      if (fuseMsgs && fuseMsgs.length) {
        try { writeLsSnapshot(JSON.stringify(fuseMsgs), fusePrefix); } catch (e) {}
      } else {
        // v3.9.x 修复（切联系人后聊天记录丢失）：IDB 读取挂起且内存为空时，
        //   从 LS 兜底快照恢复。否则 chatDbReady=true 后 loadMsgs 的 LS 预载条件
        //   （!chatDbReady）为 false 被跳过，画面永久空白；进聊天页 renderWindow
        //   渲染空 msgs，用户感知为"聊天记录丢失"
        try {
          const lsRaw = store.get('chat-msgs');
          if (lsRaw) {
            const lsArr = JSON.parse(lsRaw);
            if (Array.isArray(lsArr) && lsArr.length) {
              msgs = lsArr;
              try { syncLastMineText(); } catch (e) {}
            }
          }
        } catch (e) {}
      }
      // v3.9.x 修复（真我 Edge 切联系人后聊天记录消失）：IDB 读取挂起时保险丝兜底
      //   就绪，若聊天页可见且有消息但画面空白（同步渲染空 + IDB 回调未执行），
      //   强制重渲染补回，避免永久空白
      try {
        if (chatVisible() && msgs.length && !body.children.length) {
          renderWindow(false, true);
          scrollChatBottom();
        }
      } catch (e) {}
    }, 15000);
  }
  // v3.7.x：防抖期间切联系人 → contact-switched 清 saveTimer 会让待写消息丢失，
  //   暂存 data+prefix 供 handler 切前强制落盘到正确（旧）桌面
  let pendingSaveData = null, pendingSavePrefix = null;
  function saveMsgs() {
    const data = JSON.stringify(msgs);
    // 权威未就绪（IDB 打开/读取挂起，如 X浏览器等第三方浏览器后台挂起）：消息暂存
    // 内存，同时写 LS 快照兜底——loadMsgs 第一步会先读 LS 快照渲染，IDB 读回后按
    // 权威合并（快照仅兜底，不会覆盖 IDB 权威）；不写 LS 的话刷新后消息全部丢失
    if (!chatDbReady) {
      try { pendingLocal = msgs.slice(); } catch (e) {}
      writeLsSnapshot(data);
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    // v3.6.x 修复（防抖定时器跨联系人写串）：闭包捕获当前命名空间，
    // 防止 400ms 回调执行时 activePrefix() 已切到新联系人
    const myPrefix = window.activePrefix();
    pendingSaveData = data;
    pendingSavePrefix = myPrefix;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      pendingSaveData = null;
      pendingSavePrefix = null;
      try { if (window.idbSet) window.idbSet(myPrefix + ':chat-msgs', data); } catch (e) {}
      writeLsSnapshot(data, myPrefix);
    }, 400);
  }
  // v3.5.128：页面离开（刷新/关闭/切后台被回收）前强制落盘防抖窗口内的消息
  // v3.5.131：清除数据流程（window.__resetting）期间跳过——否则 beforeunload 会把
  // 清空前的聊天记录写回，等于没清
  function flushSave() {
    if (window.__resetting) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      const data = JSON.stringify(msgs);
      const myPrefix = window.activePrefix();
      try { if (window.idbSet) window.idbSet(myPrefix + ':chat-msgs', data); } catch (e) {}
      writeLsSnapshot(data, myPrefix);
    } else if (!chatDbReady && msgs.length) {
      // IDB 未就绪期间的杀进程/切后台：内存消息写 LS 快照兜底，下次启动从快照恢复
      writeLsSnapshot(JSON.stringify(msgs));
    }
  }
  // v3.5.134：暴露给导出/清除等外部流程（导出前强制落盘，防止备份缺最后几条消息）
  window.chatFlushSave = flushSave;
  try {
    window.addEventListener('beforeunload', flushSave);
    // v3.9.x：回前台时清掉残留横幅——切后台前刚弹出的横幅，其 6 秒自动隐藏
    // setTimeout 在后台被浏览器节流/冻结，回前台时还挂着几分钟前的旧消息；
    // （bg-keep 回前台汇总「你不在的时候收到 N 条新消息」会重新弹新横幅）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSave();
      else if (deskMsgEl && !deskMsgEl.hidden) hideDeskMsg();
    });
  } catch (e) {}
  // v3.5.127：暴露聊天记录内存数组（ta-ask/p2-features 等模块不要再 JSON.parse
  // 整条历史——几十 MB 的 stringify 结果每次解析几百毫秒，低端机点卡片即卡顿）
  window.getChatMsgs = function () { return msgs; };
  // v3.6.x：迁移历史乱码消息——之前「自动发送」把图片/表情包的 dataURL 当文本存了
  // （type='text'），渲染成超长 base64 乱码；按内容识别改回图片类型，历史恢复正常显示
  function migrateLegacyMediaMsgs() {
    let migrated = false;
    msgs.forEach(r => {
      if (r && (r.type === 'text' || !r.type) && typeof r.text === 'string' && r.text.indexOf('data:image/') === 0) {
        r.type = 'image';
        migrated = true;
      }
    });
    if (migrated) saveMsgs();
  }
  // v3.12.x：存量快速重复收敛——「输入复活/事件重派」类 bug 曾把同一条消息连写两遍
  //（同 side+同 text，Δts 多在一两秒内——iOS 中文键盘确认候选词即发送、文本重组回来
  // 后用户再点发送，间隔可达 1s+，人类刻意重发同一串字不会这么快）。
  // 只处理按 ts 排序后相邻的重复对（保守：中间隔着其他消息的不动），互动卡片
  //（special）不参与；用户手机里已被翻倍的历史在加载时自动收敛为一条。
  function collapseRapidDups(arr) {
    let removed = 0;
    for (let i = arr.length - 1; i > 0; i--) {
      const a = arr[i], b = arr[i - 1];
      if (!a || !b || a.side !== b.side || a.special || b.special) continue;
      if ((a.type || '') !== (b.type || '')) continue;
      const dts = (a.ts || 0) - (b.ts || 0);
      if (dts < 0 || dts > 1200) continue;
      if ((a.text || '') !== (b.text || '') || !!a.img !== !!b.img) continue;
      if (!a.text && !a.img) continue;
      arr.splice(i, 1);
      removed++;
    }
    return removed;
  }
  // v3.6.x：判断记录是否为「已作答」的互动卡片（小问题/好奇/吐槽/询问/邀请）
  function answeredRec(r) {
    if (!r) return false;
    if (r.special === 'ask-choose' && r.choiceStatus === 'answered') return true;
    if (r.special === 'ask-curious' && r.curiousStatus === 'answered') return true;
    if (r.special === 'ask-roast' && r.roastStatus === 'answered') return true;
    if (r.special === 'ask-card' && r.askStatus === 'answered') return true;
    if (r.special === 'invite' && r.inviteStatus === 'answered') return true;
    return false;
  }
  function loadMsgs() {
    armReadyFuse();
    // v3.6.x：聊天记录已改为只写 IndexedDB，这里不再优先读 localStorage 快照。
    // 仅当内存为空（首次启动/刷新）且 IDB 尚未读回时，用 localStorage 兜底渲染一次
    //（老版本数据/IDB 读取慢时的即时展示），IDB 权威合并后会覆盖它；
    // 后续读到 IDB 权威后会把 localStorage 残留清掉（见下）。
    if (!saveTimer && !msgs.length && !chatDbReady) {
      try { msgs = JSON.parse(store.get('chat-msgs') || '[]'); } catch (e) { msgs = []; }
      if (!Array.isArray(msgs)) msgs = [];
      // v3.7.x：LS 快照载入后先同步一次——TA 引用/收藏用的 lastMineText 不能为空
      try { syncLastMineText(); } catch (e) {}
    }
    migrateLegacyMediaMsgs();
    // v3.12.x：LS 预载副本同样收敛存量快速重复（IDB 挂起期间画面也不出现双条）
    try { if (collapseRapidDups(msgs)) saveMsgs(); } catch (e) {}
    // v3.5.119：每次进入聊天页都以 IndexedDB 为权威读一次并合并——
    // 手机上 IDB 读取可能偶发失败/时序靠后，之前"读完一次就置 chatDbReady 不再读"
    // 会让失败后的页面永远停留在空/残缺状态；现在每次 loadMsgs 都重试，
    // 且合并规则是「IDB 完整历史 + 本地更新的消息」，绝不覆盖 IDB 权威数据。
    try {
      if (window.idbGet) {
        // v3.6.x 修复（跨联系人写串桌面）：闭包捕获当前命名空间，回调内一律用 myPrefix，
        // 且回调开头校验是否已切换联系人——是则放弃本次合并（旧桌面的数据不写到新桌面）
        const myPrefix = window.activePrefix();
        window.idbGet(myPrefix + ':chat-msgs').then(v => {
          if (window.activePrefix() !== myPrefix) return;
          if (v === undefined || v === null) {
            // IDB 无权威数据：若 localStorage 还有老版本数据，迁入 IDB 并清掉 LS 拋留
            chatDbReady = true;
            try { syncLastMineText(); } catch (e) {}
            const lsRaw = store.get('chat-msgs');
            if (lsRaw) {
              try {
                const lsArr = JSON.parse(lsRaw);
                if (Array.isArray(lsArr) && lsArr.length) {
                  // v3.6.x：IDB 无数据 → 用 LS 快照恢复；写 IDB 后【保留】LS 快照
                  // 作双保险（原 store.remove 会把 IDB/LS/内存全删，若 idbSet 静默
                  // 失败则唯一的备份也没了）。writeLsSnapshot 会随后续保存持续刷新。
                  if (window.idbSet) window.idbSet(myPrefix + ':chat-msgs', lsRaw);
                }
              } catch (e) {}
            }
            // v3.6.x 修复（pendingLocal 丢失）：IDB 无数据时 pendingLocal 可能非空
            //（启动瞬间注入的日常/查岗消息），必须合并落盘，否则 chatDbReady 置 true
            // 后 pendingLocal 被遗忘、永不写入
            if (pendingLocal && pendingLocal.length) {
              msgs = pendingLocal.concat(msgs.filter(m => !pendingLocal.some(p => p && p.ts === m.ts && p.text === m.text)));
              pendingLocal = null;
              try { if (window.idbSet) window.idbSet(myPrefix + ':chat-msgs', JSON.stringify(msgs)); } catch (e) {}
              writeLsSnapshot(JSON.stringify(msgs), myPrefix);
            }
            return;
          }
          try {
            const idbArr = typeof v === 'string' ? JSON.parse(v) : v;
            if (!Array.isArray(idbArr)) { chatDbReady = true; return; }
            // v3.7.x 修复（用户反馈"切换桌面再切回，12点前的消息消失"）：
            //   原合并 localNew 只保留本地比 IDB 末条 ts 更新的消息（m.ts > idbLastTs），
            //   若 IDB 缺旧消息（写入失败/竞态导致 IDB 只有部分新消息，旧消息只在
            //   LS 快照/内存），本地旧消息 ts < idbLastTs 被 filter 掉，merged = idbArr
            //   不含旧消息 → 丢消息。改为按指纹取并集：localNew = 本地中 IDB 没有的
            //   （按 ts+text+side+img 指纹去重），不限 ts；merged 按 ts 排序。
            //   聊天消息只增不改（撤回/编辑打标记不删数组），取并集不会把已删消息加回。
            // v3.9.x：指纹 img 用前 32 字符而非 length——同秒发送两张等长但内容不同
            //   的图片，原 length 指纹相同导致 localNew 误去重丢一条
            const sigOf = (m) => { try { return JSON.stringify({ t: m && m.text, s: m && m.side, ts: m && m.ts, i: m && m.img ? (typeof m.img === 'string' ? m.img.slice(0, 32) : String(m.img.length)) : 0 }); } catch (e) { return ''; } };
            const idbSigs = new Set();
            idbArr.forEach(x => { if (x) idbSigs.add(sigOf(x)); });
            // v3.12.x：有损快照残影不重复计入本地新增——LS 兜底快照超限时剥掉
            // img/voice（_lsLite 标记；旧版无标记，但 img===''/voice==='' 本身就是
            // 剥离产物，正常写入不会产生），其指纹与 IDB 完整版必不相同，原逻辑会
            // 把同一消息 append 两遍并回写固化。改为按 ts+side 对照 IDB，已存在则跳过。
            const idbTsSide = new Set(idbArr.map(x => (((x && x.ts) || 0) + '|' + ((x && x.side) || ''))));
            const liteResidue = (m) => !!(m && (m._lsLite || m.img === '' || m.voice === ''));
            const localNew = (pendingLocal || msgs || []).filter(m => m && !idbSigs.has(sigOf(m))).filter(m => {
              if (!liteResidue(m)) return true;
              return !idbTsSide.has((((m && m.ts) || 0)) + '|' + ((m && m.side) || ''));
            });
            localNew.forEach(m => { try { delete m._lsLite; } catch (e) {} });
            const merged = idbArr.concat(localNew).sort((a, b) => ((a && a.ts || 0) - (b && b.ts || 0)));
            // v3.6.x：防止过期快照把刚作答的卡片刷回未作答——
            // 用户点卡片作答后 saveMsgsNow 已把「已作答」状态写入 IDB；但若本次
            // idbGet 的快照早于那次写盘（低端机/大聊天记录读取慢，或其它模块
            // 恰在作答瞬间触发 loadMsgs），合并会把旧快照里的「未作答」卡片搬回来，
            // 表现就是：回答了但卡片不显示内容、还能重复点卡片再答。
            // 聊天记录只增不改（作答只是给旧记录打状态），按位置对齐后，
            // 内存中已作答的记录以内存版本为准，防止状态被回滚。
            const curArr = pendingLocal || msgs || [];
            // v3.6.x：本会话编辑/撤回过的消息，在「与 IDB 条数对齐」（同一批消息）
            // 时以内存版本为准——否则防抖窗口内 loadMsgs 用旧 IDB 快照把这些变更
            // 回滚，随后任意一次落盘就把「已编辑/已撤回」固化回旧内容（编辑/撤回失效）
            if (merged.length === curArr.length) {
              curArr.forEach((m, i) => {
                if (!m || i >= merged.length) return;
                if (sessionChangedIdx.has(i)) merged[i] = m;
              });
            }
            // 已作答卡片保护（原有逻辑，条数不一致时也生效）
            curArr.forEach((m, i) => {
              if (!m || i >= merged.length) return;
              if (!answeredRec(m) || answeredRec(merged[i])) return;
              merged[i] = m;
            });
            let changed = localNew.length > 0 || merged.length !== msgs.length;
            // v3.6.x：LS 兜底快照预载可能是【有损版】（img/voice 字段被剥掉），
            // IDB 合并补全了图片后必须重渲染 + 回写，否则画面停留在缺图状态
            //（条数相同时 changed 恒 false 不会触发）
            if (!changed && merged.length === msgs.length && msgs.length) {
              changed = msgs.some(m => m && (m.img === '' || m.voice === ''));
            }
            msgs = merged;
            // 条数不一致（IDB 快照与内存不是同一批消息）→ 索引已失效，清空会话改动标记
            if (merged.length !== curArr.length) sessionChangedIdx.clear();
            // v3.12.x：收敛存量快速重复（历史版本把同一条消息写了两遍的脏数据），
            // 有收敛视为变更 → 走下方 changed 分支回写 IDB/LS + 重渲染
            if (collapseRapidDups(msgs)) { changed = true; sessionChangedIdx.clear(); }
            migrateLegacyMediaMsgs();
            // v3.7.x：IDB 权威合并完成后再同步一次 lastMineText（此时才是完整历史）
            try { syncLastMineText(); } catch (e) {}
            // v3.6.x：IDB 权威合并后再次还原乱码图标——同步部分的还原会被这里的
            // IDB 快照合并覆盖，必须对合并结果再还原一次并计入 changed，才会
            // 写回 IDB 并重渲染，历史乱码消息才能彻底修复
            if (restoreEscapedPokeIcons()) changed = true;
            pendingLocal = null;
            chatDbReady = true;
            // v3.6.x 修复（iQOO/QQ浏览器「聊天记录重进后消失」根因）：这里绝不能再用
            // store.remove('chat-msgs')——它是「内存缓存 + localStorage + IndexedDB」
            // 三连删，而 v3.6.x 起聊天记录权威数据只存 IDB：同一会话再次进入聊天页时
            // merged 与内存条数一致（changed=false），删掉后不会重写，杀掉 App 再进
            // IDB/LS 全空 → 聊天记录整体丢失且无法恢复。只需清 legacy 顶层键的 LS
            // 残留（旧版 xy-home-v2:chat-msgs），IDB 权威数据与当前命名空间的 LS
            // 快照（writeLsSnapshot 的兜底备份）一律保留。
            try { localStorage.removeItem('xy-home-v2:chat-msgs'); } catch (e) {}
            // v3.5.127：无变化（localNew 空且长度相同）时跳过重复写盘 + 全量重渲染
            // v3.6.x：IDB 合并产生新数据才写回（避免每次 loadMsgs 全量重写）
            if (changed) {
              try { if (window.idbSet) window.idbSet(myPrefix + ':chat-msgs', JSON.stringify(msgs)); } catch (e) {}
              // v3.9.x 修复（真我 Edge 切联系人后聊天记录消失）：IDB 权威合并后同步写
              //   LS 快照，确保曾在 IDB 读取成功过的联系人有 LS 兜底——下次切回即使
              //   IDB 事务挂起，loadMsgs 同步阶段也能从 LS 快照渲染，不消失。原实现
              //   只写 IDB 不写 LS，"只在 IDB、从未发消息"的联系人查看后 LS 仍空，
              //   切走再切回时 IDB 挂起 + LS 空 → 永久消失
              try { writeLsSnapshot(JSON.stringify(msgs), myPrefix); } catch (e) {}
              // 聊天页当前可见且贴近底部 → 重新渲染窗口，让恢复出的历史立即显示
              // v3.6.x：改用分页渲染（原全量 forEach 渲染几千条会卡顿）
              if (chatVisible() && chatNearBottom()) {
                renderWindow(false, true);
                scrollChatBottom();
              }
            }
          } catch (e) { /* 解析失败：不置 chatDbReady，下次进入再重试 */ }
        });
      }
    } catch (e) {}
    // 注意：换头像消息不做文案迁移——
    // 「昵称 更换了头像」是联系人自己换的头像（avatar-lib 自动随机/手动切换），
    // 「我 更换了 TA 的头像」是"我"给联系人换头像，两者都要保留原样
  // 旧消息迁移：来电消息里的铃铛图标 → 电话图标（历史消息的图标数据不会自动变）
  {
    const bellSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M4.2 4.2l2.2 2.2M2 12h3M19 12h3M4.2 19.8l2.2-2.2M17.6 17.6l2.2 2.2"/><path d="M12 6a6 6 0 016 6v4h-3v-4a3 3 0 00-6 0v4H6v-4a6 6 0 016-6z"/><path d="M9 20h6"/></svg>';
    const telSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';
    let iconMigrated = false;
    msgs.forEach(r => {
      if (r && typeof r.text === 'string' && r.text.indexOf(bellSvg) >= 0) {
        r.text = r.text.split(bellSvg).join(telSvg);
        iconMigrated = true;
      }
    });
    if (iconMigrated) saveMsgs();
  }
  // 旧消息迁移：来信提示里的 ✉️ emoji → 信封 SVG（历史消息的 emoji 不会自动变）
  {
    const envSvg = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
    let envMigrated = false;
    msgs.forEach(r => {
      if (r && r.special === 'poke' && typeof r.text === 'string') {
        const t = r.text.replace(/✉️\s*/g, '').replace(/✉\s*/g, '');
        if (t !== r.text) { r.text = envSvg + t; envMigrated = true; }
      }
    });
    if (envMigrated) saveMsgs();
  }
  // v3.7.x：好奇卡片快捷项快照人称修正——历史聊天记录里 ask-curious 卡片的
  // curiousQuick/curiousAnswer 快照在源数据修正前已写入，ta-ask.js 的迁移只修
  // ta-curious 数据不修聊天记录快照，这里补修历史卡片显示（cp6/cw4/cy11 三处）
  {
    const CQ_FIX = { '再等等，会遇到我': '再等等，会遇到你', '你身边': '我身边', '只给我看': '只给你看' };
    let cqMigrated = false;
    msgs.forEach(r => {
      if (!r || r.special !== 'ask-curious') return;
      if (Array.isArray(r.curiousQuick)) {
        const fixed = r.curiousQuick.map(o => CQ_FIX[o] || o);
        if (fixed.some((o, i) => o !== r.curiousQuick[i])) { r.curiousQuick = fixed; cqMigrated = true; }
      }
      if (typeof r.curiousAnswer === 'string' && CQ_FIX[r.curiousAnswer]) { r.curiousAnswer = CQ_FIX[r.curiousAnswer]; cqMigrated = true; }
    });
    if (cqMigrated) saveMsgs();
  }
  // v3.6.x：还原被 XSS 转义损坏的系统提示图标（历史乱码消息，函数定义见 escTxt 下方；
  // IDB 合并回调里还会再跑一次，防止同步还原被 IDB 权威快照覆盖）
  if (restoreEscapedPokeIcons()) saveMsgs();
    // 旧消息补时间戳（仅一次，保证每条都有精确到秒的时间）
    let changed = false;
    msgs.forEach(r => { if (r && !r.ts) { r.ts = Date.now(); changed = true; } });
    if (changed) saveMsgs();
  }

  // v3.6.x：XSS 修复——完整 HTML 转义（原各处只转 <，可被 `&lt;img onerror=…&gt;`
  // 预编码实体绕过，导入恶意字卡 json / 备份 json 时可注入任意 HTML）。
  // 文本用 escTxt（全量转义），属性值（src/data-src）用 attrEsc（引号优先）。
  function escTxt(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // v3.7.x：转义 + 换行转 <br>——多行文本（如占卜结果）在 HTML 里 \n 会被折叠成
  // 空格导致排版错乱，转义后再把换行转成显式换行标签
  function escTxtBr(s) {
    return escTxt(s).replace(/\n/g, '<br>');
  }
  // v3.6.x：系统提示图标白名单——call.js 等以固定 <svg class="st-ico"> 前缀拼接
  // 系统图标（非用户内容），渲染时原样保留；其余文本仍走 escTxt 全量转义
  function pokeIconHtml(text) {
    const s = String(text == null ? '' : text);
    const prefix = '<svg class="st-ico"';
    if (s.indexOf(prefix) === 0) {
      const end = s.indexOf('</svg>');
      if (end >= 0) return s.slice(0, end + 6) + escTxt(s.slice(end + 6));
    }
    return escTxt(s);
  }
  function attrEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // v3.6.x：还原被 XSS 转义损坏的系统提示图标——XSS 转义升级曾把 call.js 等
  // 拼接的内联图标（<svg class="st-ico">…</svg>）整段转义成 &lt;svg…&gt; 纯文本，
  // 历史来电/通话记录显示成一长串乱码。此处仅对系统白名单前缀（非用户内容）
  // 还原为真 SVG，其余文本一律不碰；返回是否发生还原（调用方决定是否落盘/重渲染）
  function restoreEscapedPokeIcons() {
    let escMigrated = false;
    msgs.forEach(r => {
      if (r && r.special === 'poke' && typeof r.text === 'string' && r.text.indexOf('&lt;svg class=&quot;st-ico&quot;') === 0) {
        const mm = r.text.match(/^(&lt;svg class=&quot;st-ico&quot;[\s\S]*?&lt;\/svg&gt;)([\s\S]*)$/);
        if (mm) {
          r.text = mm[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') + mm[2];
          escMigrated = true;
        }
      }
    });
    return escMigrated;
  }
  // v3.9.x：聊天域昵称——聊天专用键（cs-lbl-*）优先，未设置回退桌面键（lbl-*）。
  // 桌面/聊天昵称可独立设置：单独设置后聊天域显示聊天昵称，未设置则与桌面一致。
  function chatLabel(ck, dk, fb) {
    let v = null;
    try { v = store.get(ck); } catch (e) {}
    if (v) return v;
    try { v = store.get(dk); } catch (e) {}
    return v || fb;
  }
  function chatPartnerName() { return chatLabel('cs-lbl-partner', 'lbl-partner', 'TA'); }
  window.chatPartnerName = chatPartnerName;
  function chatUserName() { return chatLabel('cs-lbl-user', 'lbl-user', '我'); }
  // 头像回填（接受元素或 id）
  function fillAvatar(el, key) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    let data = store.get(key);
    // v3.9.x：聊天专用头像未设置时回退桌面头像（独立设置语义——未单独设置则与桌面一致）
    if (!data && key === 'cs-avatar-partner') data = store.get('avatar-partner');
    if (!data && key === 'cs-avatar-user') data = store.get('avatar-user');
    // v3.6.x：渲染前防护——超大 dataURL 不渲染（personalize 启动时已清除存量坏数据，
    // 这里兜底防止清理前渲染触发 iOS Safari 解码崩溃：画面正常但点击无响应）
    if (data && data.length > 500 * 1024) data = null;
    // v3.6.x：改用 src 属性赋值——dataURL 里若含引号，拼 innerHTML 会逃逸出属性注入 HTML
    if (data) {
      const img = document.createElement('img');
      img.src = data;
      img.alt = '';
      el.innerHTML = '';
      el.appendChild(img);
    } else {
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#999999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
    }
  }
  // v3.5.113：供 personalize.js 在 IndexedDB 回填完成后重绘聊天头像
  window.fillAvatar = fillAvatar;
  // v3.8.x：重绘聊天页全部头像（顶部栏 + 已渲染消息气泡），用聊天专用键 cs-avatar-*。
  // 供 chat-settings.js 改完头像后调用，刷新当前可见的消息气泡头像。
  function refreshChatAvatars() {
    fillAvatar('chat-user-av', 'cs-avatar-user');
    fillAvatar('chat-partner-av', 'cs-avatar-partner');
    document.querySelectorAll('.msg-in .msg-av').forEach(av => fillAvatar(av, 'cs-avatar-partner'));
    document.querySelectorAll('.msg-out .msg-av').forEach(av => fillAvatar(av, 'cs-avatar-user'));
  }
  window.refreshChatAvatars = refreshChatAvatars;
  fillAvatar('chat-user-av', 'cs-avatar-user');
  fillAvatar('chat-partner-av', 'cs-avatar-partner');
  // v3.5.113：IndexedDB 回填完成后（mochi-restore-done）轻量重绘——
  // 导入/配额异常恢复后聊天记录已在内存，聊天页可见时重新渲染一遍
  // v3.6.x：加贴底判断——数据恢复期间用户可能已在翻旧消息，全量重渲染
  // 会把滚动位置重置到底部（之前每条恢复消息也强制滚动到底）
  // v3.6.x：改用分页渲染（renderWindow）
  try {
    document.addEventListener('mochi-restore-done', function () {
      try {
        if (chatVisible() && chatNearBottom() && body && msgs.length) {
          renderWindow(false, true);
          scrollChatBottom();
        }
        fillAvatar('chat-user-av', 'cs-avatar-user');
        fillAvatar('chat-partner-av', 'cs-avatar-partner');
      } catch (e) {}
    });
  } catch (e) {}

  // 顶部标题 = 联系人的昵称
  // v3.7.x 修复（用户反馈"切换联系人后聊天顶部栏仍显示旧名/系统默认，不显示设置的角色名"）：
  //   原实现只在模块加载时读一次 lbl-partner 写入 #chat-partner-name，切换联系人后
  //   从不刷新；contacts.js refreshActiveContactUI 调的 window.renderChatHeader 也
  //   从未被定义（空检查永远跳过）。改为抽 updateChatPartnerName()，读 lbl-partner，
  //   缺失回退当前联系人的注册名（联系人管理里设的名字，如"Z"），再回退 'TA'；
  //   contact-switched 时调用，并挂 window.renderChatHeader 供 contacts.js 切换后刷新。
  // v3.9.x：聊天昵称可独立设置——优先读 cs-lbl-partner，未设置回退桌面 lbl-partner，
  //   再回退联系人注册名，最后 'TA'。
  const pname = document.getElementById('chat-partner-name');
  function updateChatPartnerName() {
    if (!pname) return;
    let saved = null;
    try { saved = store.get('cs-lbl-partner'); } catch (e) {}
    if (saved) { pname.textContent = saved; return; }
    try { saved = store.get('lbl-partner'); } catch (e) {}
    if (saved) { pname.textContent = saved; return; }
    try {
      if (window.getContacts) {
        const c = window.getContacts().find(x => x.id === (window.__activeCid || 'default'));
        if (c && c.name) { pname.textContent = c.name; return; }
      }
    } catch (e) {}
    pname.textContent = window.taWord ? window.taWord() : 'TA';
  }
  updateChatPartnerName();
  window.renderChatHeader = updateChatPartnerName;

  // ---- 联系人「正在输入」状态 ----
  // typing 行位于消息区与输入栏之间（不悬浮、不覆盖消息）。
  // v3.5.44：typing 行出现/消失都会改变消息区高度，立即把聊天滚动到底，
  // 保证最后一条消息始终完整可见、不被这一行"顶出/遮挡"
  const typingEl = document.getElementById('chat-typing');
  let typingOn = false;
  function chatVisible() {
    const p = document.getElementById('page-chat');
    return !!(p && !p.hidden);
  }
  function scrollChatBottom() {
    const cb = document.getElementById('chat-body');
    if (cb) cb.scrollTop = cb.scrollHeight;
  }
  // v3.6.x：消息区是否「贴近底部」（最后一条可见）。追加消息自动滚动只在贴底时执行，
  // 用户正在翻旧消息时不打断阅读位置
  function chatNearBottom() {
    const cb = document.getElementById('chat-body');
    if (!cb) return true;
    return cb.scrollHeight - cb.scrollTop - cb.clientHeight < 120;
  }
  // v3.6.x：追加消息后滚动——批量渲染（进入聊天/恢复历史）或聊天页未打开时跳过；
  // 原实现 renderMsg 每条消息都执行 scrollTop=scrollHeight（同步布局，强制整页 reflow），
  // TA 连发多条（间隔 1-3s）时每条都卡一下 = 收消息卡顿的主因之一
  // v3.9.x：追加消息分为「我发送」与「TA 消息」两类——
  //   我发送（side:out）：用户主动发消息必然意图看最新，一律滚到底；
  //   TA 消息：仅贴近底部时滚（贴底守卫仍在，翻旧消息时不被新消息打断阅读位置）。
  //   此前两类共用近底守卫：贴底阈值 120px 小于图片消息高度（CSS 上限 260px），
  //   且用户轻微上翻后守卫永久 false——导致「发送消息后不自动滚到最新」。
  // v3.9.x+：我发送的消息同步滚后异步补偿（rAF + 短延时）——emoji 字体加载、
  //   长文本换行 reflow、图片解码都会让 scrollHeight 在滚动后才变大，
  //   只同步滚一次会停在差几十像素处（「有时候没滚到底」）；补到高度稳定。
  function maybeScrollChatBottom(side) {
    if (batchRendering) {
      if (side === 'out') pendingOutScroll = true;
      return;
    }
    if (!chatVisible()) return;
    const out = side === 'out';
    if (!out && !chatNearBottom()) return;
    scrollChatBottom();
    if (out) {
      requestAnimationFrame(scrollChatBottom);
      setTimeout(scrollChatBottom, 120);
    }
  }
  function showTyping() {
    if (!typingEl) return;
    typingOn = true;
    if (chatVisible()) {
      typingEl.hidden = false;
      // 行出现 → 消息区变矮 → 滚到底保持最后一条可见
      scrollChatBottom();
      setTimeout(scrollChatBottom, 60);
    }
  }
  function hideTyping() {
    if (!typingEl) return;
    typingOn = false;
    typingEl.hidden = true;
    // 行消失 → 消息区变高 → 保持底部对齐
    scrollChatBottom();
  }

  // ---- 概率工具 ----
  function cfg() { return (window.replyCfg && window.replyCfg()) || {}; }
  // 带默认值读取（replyCfg 异常/缺失时主动发送等不会失效）
  function cfgn(c, k, d) { const v = c[k]; return v === undefined ? d : v; }
  function hit(p) { return Math.random() * 100 < p; }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
  function pickN(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (copy.length && out.length < n) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  // ---- 字卡池（按分类） ----
  function getPool() {
    const cards = (window.getCustomCards && window.getCustomCards()) || [];
    // v3.6.x：拍一拍字卡只走拍一拍模式（performPoke → getPokeCards），不进普通回复池——
    //   否则【拍一拍】分组里的字卡会被当普通聊天字卡发出去（不触发拍一拍模式）
    const pokeSet = (function () {
      const pk = (window.getPokeCards && window.getPokeCards()) || [];
      return pk.length ? new Set(pk) : null;
    })();
    const text = [], kaomoji = [], emoji = [], sticker = [], image = [], voice = [], poke = [];
    // 媒体字卡（图片 dataURL）
    const mediaSticker = (window.getMediaCards && window.getMediaCards('sticker')) || [];
    const mediaImage = (window.getMediaCards && window.getMediaCards('image')) || [];
    const mediaVoice = (window.getMediaCards && window.getMediaCards('voice')) || [];
    sticker.push.apply(sticker, mediaSticker);
    image.push.apply(image, mediaImage);
    voice.push.apply(voice, mediaVoice);
    cards.forEach(c => {
      if (pokeSet && pokeSet.has(c)) return; // 拍一拍字卡不进普通回复池
      if (typeof c === 'string' && c.indexOf('data:') === 0) return; // dataURL 已按媒体分类
      // v3.6.x：语音字卡（文件名|||audio;base64）不以 data: 开头，需单独丢弃——
      //   否则整段音频 base64 会被当文字发进聊天
      if (typeof c === 'string' && c.indexOf('|||') >= 0) return;
      if (/[\uD800-\uDBFF]/.test(c) || /^[😀-🙏🌀-🫿]/u.test(c)) emoji.push(c);
      else if (/[\(（｡◕(◕)(づ｡(¬)]/.test(c) && /[\)）】)]/.test(c)) kaomoji.push(c);
      else text.push(c);
    });
    // v3.6.x：默认字卡混入——「系统预设字卡」开启时，始终把默认主字卡混入 pool.text，
    // 保证回复多样性（原"三类任一为空才补"会导致用户添加少量自定义字卡后 pool.text 只剩
    // 自定义几十张，4621 张默认字卡不参与回复，联系人回复总在某个范围内）
    // v3.6.x：兜底必须与「系统预设字卡」开关一致——dc-enabled 关闭时整个兜底不注入
    //   系统字卡；单卡「关闭使用」的字卡也不进池（isDefaultCardOff）
    try {
      const dcfg = (window.defaultCardCfg && window.defaultCardCfg()) || {};
      const isOff = window.isDefaultCardOff || null;
      // v3.7.x：聊天场景开关——关闭后聊天字卡池兜底不注入默认字卡
      const useChat = window.defaultCardUse ? window.defaultCardUse('chat') : true;
      // v3.8.x：分类开关——已关闭的默认字卡分类不参与兜底注入
      const catOn = window.defaultCardCat || (() => true);
      if (dcfg.enabled !== false && useChat) {
        if (catOn('main')) {
          const defGrps = (window.getDefaultCardGroups && window.getDefaultCardGroups('main')) || [];
          defGrps.forEach(g => {
            const arr = g[1] || [];
            arr.forEach(c => {
              if (isOff && isOff('main', c)) return;
              if (typeof c !== 'string' || !c) return;
              if (/[\uD800-\uDBFF]/.test(c)) emoji.push(c);
              else if (/[\(（｡◕(◕)(づ｡(¬)]/.test(c) && /[\)）】)]/.test(c)) kaomoji.push(c);
              else text.push(c);
            });
          });
        }
        if (catOn('kaomoji') && !kaomoji.length) {
          const kg = (window.getDefaultCardGroups && window.getDefaultCardGroups('kaomoji')) || [];
          kg.forEach(g => (g[1] || []).forEach(c => { if (isOff && isOff('kaomoji', c)) return; if (typeof c === 'string' && c) kaomoji.push(c); }));
        }
        if (catOn('emoji') && !emoji.length) {
          const eg = (window.getDefaultCardGroups && window.getDefaultCardGroups('emoji')) || [];
          eg.forEach(g => (g[1] || []).forEach(c => { if (isOff && isOff('emoji', c)) return; if (typeof c === 'string' && c) emoji.push(c); }));
        }
      }
    } catch (e) {}
    return { text, kaomoji, emoji, sticker, image, voice, poke };
  }

  // ---- 消息渲染 ----
  // 时间格式：精确到秒 HH:MM:SS
  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // v3.9.x：时间分隔线文案（微信式：「下午 3:24 / 昨天 下午 3:24 / 8月20日 下午 3:24 / 2025年8月20日」）
  function timeDividerText(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const hm = (d.getHours() < 12 ? '上午 ' : '下午 ') + h12 + ':' + p(d.getMinutes());
    const dayOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dayGap = Math.round((dayOf(now) - dayOf(d)) / 86400000);
    if (dayGap <= 0) return hm;
    if (dayGap === 1) return '昨天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  // 聊天内语音播放：同一时间只播一条，播放中按钮高亮 + 波形动画
  let chatVoiceAudio = null;
  let chatVoiceBtn = null;
  function stopChatVoice() {
    if (chatVoiceAudio) { try { chatVoiceAudio.pause(); } catch (e) {} chatVoiceAudio = null; }
    if (chatVoiceBtn) { chatVoiceBtn.classList.remove('playing'); chatVoiceBtn = null; }
  }
  function playVoiceInChat(btn, src) {
    if (!src) { toast('语音数据缺失'); return; }
    if (chatVoiceBtn === btn) { stopChatVoice(); return; }
    stopChatVoice();
    const a = new Audio(src);
    chatVoiceAudio = a;
    chatVoiceBtn = btn;
    btn.classList.add('playing');
    a.addEventListener('ended', stopChatVoice);
    a.addEventListener('error', () => { stopChatVoice(); toast('语音播放失败'); });
    a.play().catch(() => { stopChatVoice(); toast('语音播放失败'); });
  }
  // v3.7.x：图片/表情包消息的引用占位文案——已有缩略图时不再重复显示文字（用户反馈）
  const QUOTE_PLACEHOLDER = /^(图片|表情包|\[图片\]|\[表情包\])$/;
  function quoteHtml(q, side) {
    // side = 被引用消息的发送方（'out'=我发，'in'=TA发）
    // v3.x.x：称呼跟随——引用 TA 发的内容在显示层替换称呼；引用我发的保持原文
    const __fitQ = (side !== 'out') && !!window.taFit;
    const FQ = (s) => (__fitQ ? window.taFit(s) : s);
    // v3.5.82：不再显示「引用 XX」标签行，只显示被引用的内容（方向也不再展示）
    if (q && typeof q === 'object') {
      // 组合消息引用：文字 + 图片缩略图（q = { t: 文字, imgs: [dataURL...] }）
      const imgs = (q.imgs || []).filter(s => typeof s === 'string' && s.indexOf('data:') === 0).slice(0, 3);
      const t = String(q.t || '');
      // t 若是 dataURL（纯表情包消息的 text 就是图片），不当作文字显示，避免 base64 乱码
      // v3.7.x：t 是占位文案（图片/表情包）且有缩略图时同样不显示——引用块只留图，去掉重复文字
      const tHtml = (t && t.indexOf('data:') !== 0 && !(imgs.length && QUOTE_PLACEHOLDER.test(t))) ? escTxtBr(FQ(t)) : '';
      let inner = '';
      if (imgs.length) inner += '<span class="msg-quote-imgs">' + imgs.map(s => '<img class="msg-quote-img" src="' + attrEsc(s) + '" alt="图片">').join('') + '</span>';
      if (tHtml) inner += '<span class="msg-quote-text">' + tHtml + '</span>';
      return '<div class="msg-quote">' + inner + '</div>';
    }
    if (typeof q === 'string' && q.indexOf('data:') === 0) {
      // 引用图片（表情包）缩略图
      return '<div class="msg-quote"><img class="msg-quote-img" src="' + attrEsc(q) + '" alt="图片"></div>';
    }
    return '<div class="msg-quote"><span class="msg-quote-text">' + escTxtBr(FQ(q)) + '</span></div>';
  }
  // v3.6.x：互动卡片就地作答——点击聊天里的互动卡片（小问题/好奇/吐槽/询问），
  // 直接在卡片内展开选项/输入框作答，不再强制弹窗。
  // TA 自动触发时的弹窗仍保留（带关闭按钮）；弹窗关闭后点卡片走就地作答。
  // 提交复用 window.chatChooseReply 等（它们会更新记录 + 发消息 + 就地重建卡片）。
  // 返回 true=就地展开成功；false=失败（调用方回退弹窗）
  // v3.7.x：就地作答输入草稿保护——renderWindow 全量重渲染会销毁 .msg-inplace
  // 输入框（TA 发消息触发窗口收紧/恢复时），打字中的内容会一起丢。
  // 渲染前收集、渲染后按 data-idx 恢复，输入过程中实时更新。
  let inplaceDrafts = {};
  function inplaceTypeOf(rec) {
    if (!rec) return null;
    if (rec.special === 'ask-choose') return 'choose';
    if (rec.special === 'ask-curious') return 'curious';
    if (rec.special === 'ask-roast') return 'roast';
    if (rec.special === 'ask-card') return 'ask';
    return null;
  }
  function collectInplaceDrafts() {
    if (!body) return;
    inplaceDrafts = {};
    body.querySelectorAll('.msg-ask[data-idx] .msg-inplace input.ip-input').forEach(inp => {
      const item = inp.closest('.msg-ask');
      if (!item || item.dataset.idx === undefined) return;
      const idx = Number(item.dataset.idx);
      const t = inplaceTypeOf(msgs[idx]);
      if (t && (inp.value || '').trim()) inplaceDrafts[idx] = { type: t, value: inp.value };
    });
  }
  function restoreInplaceDrafts() {
    if (!body) return;
    Object.keys(inplaceDrafts).forEach(k => {
      const idx = Number(k);
      const d = inplaceDrafts[k];
      if (!d || !d.type || d.type === 'choose') { delete inplaceDrafts[k]; return; } // 单选无输入框，草稿无效
      const item = body.querySelector('.msg-ask[data-idx="' + idx + '"]');
      if (!item || item.querySelector('.msg-inplace')) return;
      const rec = msgs[idx];
      if (!rec || !d.value) { delete inplaceDrafts[k]; return; }
      // 已作答/状态不符 → 不恢复并清草稿
      const done =
        (d.type === 'curious' && rec.curiousStatus === 'answered') ||
        (d.type === 'roast' && rec.roastStatus === 'answered') ||
        (d.type === 'ask' && rec.askStatus === 'answered');
      if (done) { delete inplaceDrafts[k]; return; }
      if (!expandCardInPlace(idx, d.type)) { delete inplaceDrafts[k]; return; }
      // 回填草稿内容（expandCardInPlace 已重建输入框并聚焦）
      const inp = body.querySelector('.msg-ask[data-idx="' + idx + '"] .msg-inplace input.ip-input');
      if (inp) {
        inp.value = d.value;
        try {
          const r = document.createRange();
          const box = inp.__ceBox || inp;
          r.selectNodeContents(box);
          r.collapse(false);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (e) {}
      }
    });
  }
  function expandCardInPlace(idx, type) {
    const el = body.querySelector('.msg-ask[data-idx="' + idx + '"]');
    if (!el) return false;
    const rec = msgs[idx];
    if (!rec) return false;
    // 已有就地区 → 再点收起（清草稿）
    if (el.querySelector('.msg-inplace')) { el.querySelector('.msg-inplace').remove(); delete inplaceDrafts[idx]; return true; }
    const done =
      (type === 'choose' && rec.choiceStatus === 'answered') ||
      (type === 'curious' && rec.curiousStatus === 'answered') ||
      (type === 'roast' && rec.roastStatus === 'answered') ||
      (type === 'ask' && rec.askStatus === 'answered');
    // v3.7.x：问问TA 单选题已作答 → 点击展开「选项查看」：列出设置的选项+各选项预设回应，TA 选的选项高亮
    if (done && type === 'ask' && rec.askType === 'single' && Array.isArray(rec.askOptions) && rec.askOptions.length) {
      const card = el.querySelector('.msg-ask-card');
      if (!card) return false;
      const wrap = document.createElement('div');
      wrap.className = 'msg-inplace';
      const chosen = String(rec.askAnswer || '');
      (rec.askOptions || []).forEach(o => {
        const row = document.createElement('div');
        row.className = 'ip-opt-row' + (String(o.t || '') === chosen ? ' sel' : '');
        // v3.7.x：reply 支持数组（多条）——展示"回应1 等3条"，单条原样
        let replyTxt = '';
        if (Array.isArray(o.reply) && o.reply.length) {
          const arr = o.reply.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
          if (arr.length === 1) replyTxt = arr[0];
          else if (arr.length > 1) replyTxt = arr[0] + ' 等' + arr.length + '条';
        } else if (typeof o.reply === 'string' && o.reply.trim()) {
          replyTxt = o.reply.trim();
        }
        row.innerHTML = '<span class="ip-opt-t">' + escTxt(String(o.t || '')) + '</span>' +
          (replyTxt ? '<span class="ip-opt-reply">' + escTxt(replyTxt) + '</span>' : '');
        wrap.appendChild(row);
      });
      card.appendChild(wrap);
      return true;
    }
    if (done) return false;
    const card = el.querySelector('.msg-choose-card, .msg-ask-card');
    if (!card) return false;
    const wrap = document.createElement('div');
    wrap.className = 'msg-inplace';
    if (type === 'choose') {
      // 单选题：选项按钮直接点选（默契计算与弹窗一致）
      const opts = rec.choiceOptions || [];
      if (!opts.length) return false;
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'ip-opt';
        b.textContent = String(o.t || '');
        b.addEventListener('click', () => {
          const prefIdx = typeof rec.choicePref === 'number' ? rec.choicePref : 0;
          const prefTxt = opts[prefIdx] ? opts[prefIdx].t : '';
          const isPref = i === prefIdx;
          const isLiked = o.liked === true || o.liked === 'true';
          const matchTxt = isPref ? '✦ 刚好想到了一起'
            : isLiked ? '你们想得不一样，不过TA似乎很喜欢你的答案'
            : '这次没有选到一起。TA心里想的是：「' + prefTxt + '」';
      if (window.chatChooseReply) window.chatChooseReply(idx, String(o.t || ''), o, matchTxt);
          if (window.logFish) window.logFish();
        });
        wrap.appendChild(b);
      });
    } else if (type === 'ask' && (rec.askType === 'single' || (rec.type === 'single' && Array.isArray(rec.options) && rec.options.length))) {
      // 问问TA 单选题：选项按钮直接点选（与 TA的小问题 同款交互）；
      // 选项预设了 TA 回应则按回应回复，否则 TA 从字卡文字池挑一条
      const opts = Array.isArray(rec.askOptions) ? rec.askOptions : (Array.isArray(rec.options) ? rec.options : []);
      if (!opts.length) return false;
      opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'ip-opt';
        b.textContent = String(o.t || '');
        b.addEventListener('click', () => {
          if (window.chatAskReply) window.chatAskReply(idx, String(o.t || ''), o.reply);
          if (window.logFish) window.logFish();
        });
        wrap.appendChild(b);
      });
    } else {
      // 好奇/吐槽/询问：快捷回复 chips（好奇有）+ 输入框 + 发送
      const quicks = (type === 'curious' ? (rec.curiousQuick || []) : []).filter(q => typeof q === 'string' && q);
      if (quicks.length) {
        const chips = document.createElement('div');
        chips.className = 'ip-chips';
        quicks.forEach(q => {
          const c = document.createElement('button');
          c.className = 'ip-chip';
          c.textContent = q;
          c.addEventListener('click', () => { try { inp.value = q; inp.focus(); } catch (e) {} });
          chips.appendChild(c);
        });
        wrap.appendChild(chips);
      }
      const row = document.createElement('div');
      row.className = 'ip-row';
      const inp = document.createElement('input');
      inp.className = 'ip-input';
      inp.type = 'text';
      inp.placeholder = type === 'roast' ? (window.taFit ? window.taFit('回 TA 一句…') : '回 TA 一句…') : '输入你的回答…';
      const send = document.createElement('button');
      send.className = 'ip-send';
      send.textContent = type === 'roast' ? (window.taFit ? window.taFit('回TA') : '回TA') : '回答';
      const doSend = () => {
        const v = (inp.value || '').trim();
        if (!v) return;
        if (type === 'curious' && window.chatCuriousReply) {
          const replies = (rec.curiousReplies && rec.curiousReplies.length) ? rec.curiousReplies : ['嗯，我记住了。', '原来是这样。', '好，我记住了。'];
          // v3.7.x：题预设 replies 池 + 字卡库自定义字卡 混合随机
          const reply = (window.pickAskCardReply ? window.pickAskCardReply(replies) : replies[Math.floor(Math.random() * replies.length)]);
          const fw = (rec.curiousFollowup && Math.random() < 0.3) ? rec.curiousFollowup : null;
          window.chatCuriousReply(idx, v, reply, fw);
        } else if (type === 'roast' && window.chatRoastReply) {
          // v3.7.x：吐槽话术池与「互动回应」tab 同源（getInteractPool），就地作答与弹窗两条路径一致
          const defs = ['你觉得我会信？', '少骗我。', '哼。', '好吧好吧。', '就这一次？', '行吧，放过你。', '嗯，这还差不多。'];
          const pool = window.getInteractPool ? window.getInteractPool('吐槽·回应', defs) : defs;
          // v3.7.x：吐槽固定句池 + 字卡库自定义字卡 混合随机
          const reply = (window.pickAskCardReply ? window.pickAskCardReply(pool) : pool[Math.floor(Math.random() * pool.length)]);
          window.chatRoastReply(idx, v, reply);
        } else if (type === 'ask' && window.chatAskReply) {
          // v3.7.x：文字题回应接「询问·回应」预设池（与弹窗路径一致）：池里随机一条作预设，
          // chatAskReply 内部 90%预设/10%字卡库 混合
          const defs = ['收到你的回答。', '好呀，我知道了。', '你这么说，我记住了。'];
          const pool = window.getInteractPool ? window.getInteractPool('询问·回应', defs) : defs;
          window.chatAskReply(idx, v, pool[Math.floor(Math.random() * pool.length)]);
        }
        if (window.logFish) window.logFish();
        // v3.7.x：发送成功 → 清理该卡片的输入草稿（卡片已变 answered，无需恢复）
        delete inplaceDrafts[idx];
      };
      send.addEventListener('click', doSend);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); doSend(); }
      });
      row.appendChild(inp);
      row.appendChild(send);
      wrap.appendChild(row);
      // v3.7.x：就地作答输入草稿——重渲染恢复（回填）+ 实时保存（TA 发消息触发
      // renderWindow 时内容不丢）。ip-input 由 mobile-adapt 转 ce-box，value 代理兼容。
      const draft = inplaceDrafts[idx];
      if (draft && draft.type === type && draft.value) {
        inp.value = draft.value;
      }
      inp.addEventListener('input', () => {
        inplaceDrafts[idx] = { type: type, value: inp.value || '' };
      });
    }
    card.appendChild(wrap);
    // 就地输入框聚焦（安卓 contenteditable 转换后 focus 会代理到 box）
    const fi = wrap.querySelector('input.ip-input');
    if (fi) setTimeout(() => { try { fi.focus(); } catch (e) {} }, 60);
    return true;
  }
  // v3.6.x：互动卡片事件委托——由 chat-body 统一监听点击（renderMsg 不再逐卡绑定），
  // 兼容重渲染/懒加载；就地展开失败（数据异常等）时回退到对应弹窗，保证点卡片必有反应
  if (body) {
    // 红包长按退回：长按 TA 的 pending 红包卡片 500ms 弹退回确认
    let rpPressTimer = null;
    let rpPressSuppressClick = false;
    body.addEventListener('pointerdown', (e) => {
      const rpCard = e.target.closest('.msg-rp-card');
      if (!rpCard) return;
      const rpItem = rpCard.closest('.msg-rp');
      if (!rpItem || rpItem.dataset.idx === undefined) return;
      const rpRec = msgs[Number(rpItem.dataset.idx)];
      if (!rpRec || rpRec.special !== 'redpacket' || rpRec.rpStatus !== 'pending' || rpRec.side !== 'in') return;
      rpPressTimer = setTimeout(() => {
        rpPressTimer = null;
        rpPressSuppressClick = true;
        if (window.openModal) {
          window.openModal('退回这个红包？', '', () => {
            rpRec.rpStatus = 'returned';
            const w = rpWalletGet();
            w.systemBalance += Math.round((rpRec.rpAmount || 0) * 100);
            rpWalletSet(w);
            saveMsgsNow();
            renderWindow(true, true);
            const amtTxt = '¥' + Number(rpRec.rpAmount || 0).toFixed(2);
            setTimeout(() => addIn('你退回了红包 ' + amtTxt, { special: 'poke' }), randInt(300, 800));
          }, { okText: '退回', cancelText: '取消' });
        }
      }, 500);
    });
    const rpClearPress = () => { if (rpPressTimer) { clearTimeout(rpPressTimer); rpPressTimer = null; } };
    body.addEventListener('pointerup', rpClearPress);
    body.addEventListener('pointerleave', rpClearPress);
    body.addEventListener('pointercancel', rpClearPress);
    body.addEventListener('click', (e) => {
      // v3.6.77：点击卡片外区域 → 所有互动卡片的收藏按钮收起
      if (!e.target.closest('.msg-ask-card, .msg-choose-card, .msg-fav-heart, .msg-inplace')) {
        body.querySelectorAll('.msg-ask-card.show-fav, .msg-choose-card.show-fav').forEach(c => c.classList.remove('show-fav'));
      }
      // 卡片收藏按钮：整卡收藏到我的收藏（不展开作答）
      const favBtn = e.target.closest('.msg-fav-heart');
      if (favBtn) {
        e.stopPropagation();
        const fItem = favBtn.closest('.msg-ask');
        if (fItem && fItem.dataset.idx !== undefined) window.favCardFromMsg(Number(fItem.dataset.idx));
        return;
      }
      // 红包卡片：点击领取（只有 TA 发的红包我能领取，入账 myBalance）
      const rpCard = e.target.closest('.msg-rp-card');
      if (rpCard) {
        if (rpPressSuppressClick) { rpPressSuppressClick = false; return; }
        e.stopPropagation();
        const rpItem = rpCard.closest('.msg-rp');
        if (!rpItem || rpItem.dataset.idx === undefined) return;
        const rpIdx = Number(rpItem.dataset.idx);
        const rpRec = msgs[rpIdx];
        if (!rpRec || rpRec.special !== 'redpacket') return;
        if (rpRec.rpStatus !== 'pending') return;
        if (rpRec.side !== 'in') { toast(window.taFit ? window.taFit('等待 TA 领取') : '等待 TA 领取'); return; }
        rpRec.rpStatus = 'received';
        rpRec.rpOpenedAt = Date.now();
        const wallet = rpWalletGet();
        wallet.myBalance += Math.round((rpRec.rpAmount || 0) * 100);
        rpWalletSet(wallet);
        saveMsgsNow();
        const amtTxt = '¥' + Number(rpRec.rpAmount || 0).toFixed(2);
        toast('已领取 ' + amtTxt);
        renderWindow(true, true);
        setTimeout(() => addIn('你领取了红包 ' + amtTxt, { special: 'poke' }), randInt(400, 1000));
        return;
      }
      // 就地作答区内部（选项按钮/发送/输入框）的点击不触发卡片委托
      if (e.target.closest('.msg-inplace')) return;
      const card = e.target.closest('.msg-ask-card, .msg-choose-card');
      if (!card) return;
      const item = card.closest('.msg-ask');
      if (!item || item.dataset.idx === undefined) return;
      // v3.6.77：点击卡片 toggle 收藏按钮显示（单选——先收起其它卡片的收藏按钮）
      const idx = Number(item.dataset.idx);
      const rec = msgs[idx];
      if (!rec) return;
      // v3.7.x：问问TA 单选题已作答 → 点击展开/收起「选项查看」（查看设置的选项+预设回应），
      // 同时照常切换收藏按钮显示
      if (card.classList.contains('answered') && rec.special === 'ask' && rec.askType === 'single' && Array.isArray(rec.askOptions) && rec.askOptions.length) {
        e.stopPropagation();
        const hadFav = card.classList.contains('show-fav');
        body.querySelectorAll('.msg-ask-card.show-fav, .msg-choose-card.show-fav').forEach(c => c.classList.remove('show-fav'));
        if (!hadFav) card.classList.add('show-fav');
        expandCardInPlace(idx, 'ask');
        return;
      }
      const hadFav = card.classList.contains('show-fav');
      body.querySelectorAll('.msg-ask-card.show-fav, .msg-choose-card.show-fav').forEach(c => c.classList.remove('show-fav'));
      if (!hadFav) card.classList.add('show-fav');
      if (card.classList.contains('answered')) { e.stopPropagation(); return; } // 已作答：只切换收藏按钮
      e.stopPropagation(); // 不冒泡触发气泡操作菜单
      let type = null;
      if (rec.special === 'ask-choose') type = 'choose';
      else if (rec.special === 'ask-curious') type = 'curious';
      else if (rec.special === 'ask-roast') type = 'roast';
      else if (rec.special === 'ask-card') type = 'ask';
      if (!type) return;
      // 先尝试就地展开；失败则回退弹窗（如弹窗已开着则由弹窗处理，这里跳过）
      const ok = expandCardInPlace(idx, type);
      if (!ok) {
        try {
          if (type === 'choose' && window.openTC) window.openTC(idx);
          else if (type === 'curious' && window.openCurious) window.openCurious(idx);
          else if (type === 'roast' && window.openRoast) window.openRoast(idx);
          else if (type === 'ask' && window.openAskReply) window.openAskReply(idx);
        } catch (err) {}
      }
    });
  }

  function bindToggle(b, side) {
    const who = side === 'out' ? '我' : '对方';
    b.style.cursor = 'pointer';
    b.onclick = function () {
      if (b.dataset.showing === '1') {
        b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + who + '撤回了一条消息</span>';
        b.dataset.showing = '0';
      } else {
        b.innerHTML = b.dataset.orig;
        b.dataset.showing = '1';
      }
    };
  }
  // v3.6.x：批量渲染标志——进入聊天/恢复历史时一次性渲染几百上千条消息，
  // 每条渲染后的强制滚动（scrollTop=scrollHeight）会触发同步布局，手机上
  // 大量消息时进入聊天页卡顿数秒；批量期间跳过滚动，结束后统一滚到底一次
  let batchRendering = false;
  // v3.9.x：批量渲染期间用户发送了消息（side:out）→ 渲染结束后强制贴底。
  // 批量中 renderMsg 里的 maybeScrollChatBottom 会被 batchRendering 跳过，
  // 若没有补偿，发送的消息渲染出来却停在视口外（「发送后不自动滚到最新」）。
  let pendingOutScroll = false;

  // v3.6.x：聊天记录分页渲染——首屏只渲染最近 RENDER_MAX 条，向上滚动加载更早。
  // 数据不变（msgs 全量在内存，getChatMsgs/统计/搜索遍历不受影响），只分 DOM 渲染层：
  // 几千条历史不再一次性建几千个消息节点，进入聊天页与历史恢复大幅提速。
  const RENDER_MAX = 200;   // 渲染窗口条数上限
  const WINDOW_MAX = 400;   // v3.10.x：增量渲染窗口硬上限（含上下缓冲，防 DOM 无限膨胀）
  const LOAD_STEP = 100;    // 向上滚动每次加载的条数
  const TOP_THRESHOLD = 150;// scrollTop 小于此值触发向上加载（px）
  const JUMP_VIEW = 30;     // 搜索跳转时目标索引上方预留的余量
  let renderStart = 0;      // 渲染窗口起点（msgs 下标）；0 = 全量
  let renderEnd = 0;        // v3.10.x：渲染窗口终点（msgs 下标，开区间）；增量裁剪/恢复用
  // v3.9.x：时间分隔线（聊天设置「时间轴样式-时间分隔线」）——消息间隔 ≥ TIME_DIVIDER_GAP
  // 时在消息流中插入一条居中时间胶囊（微信式）。插入逻辑只作用于聊天页 #chat-body：
  // 收藏页（#fav-list）/群聊（#gc-body）不含此逻辑，msg-time 保留原样式不受影响。
  const TIME_DIVIDER_GAP = 5 * 60 * 1000;
  function maybeInsertDivider(idx) {
    if (store.get('cs-time-style') !== 'divider') return;
    if (idx < 0 || idx >= msgs.length) return;
    const cur = msgs[idx];
    if (!cur || !cur.ts) return;
    if (idx > 0) {
      const prev = msgs[idx - 1];
      if (!prev || !prev.ts) return;
      if (cur.ts - prev.ts < TIME_DIVIDER_GAP) return;
    }
    // idx===0（全局第一条消息）无条件插入——第一条消息的时间不能被隐藏
    const d = document.createElement('div');
    d.className = 'msg-time-divider';
    d.innerHTML = '<span>' + timeDividerText(cur.ts) + '</span>';
    body.appendChild(d);
  }
  let suppressScrollUntil = 0; // 程序化滚动后短暂忽略 scroll 事件（防渲染本身触发向上加载）
  // 渲染 [renderStart, msgs.length) 窗口。
  // keepScroll=true：保持视觉位置（向上加载时新内容补在顶部，scrollTop 需下移对应高度）
  // clampTop=true：窗口超出 RENDER_MAX 时收紧到最近 RENDER_MAX 条（进入聊天/新消息/恢复）
  function renderWindow(keepScroll, clampTop) {
    const len = msgs.length;
    const prevTop = keepScroll ? body.scrollTop : 0;
    const prevHeight = keepScroll ? body.scrollHeight : 0;
    if (clampTop) renderStart = Math.max(0, len - RENDER_MAX);
    const start = Math.min(renderStart, len);
    renderEnd = len; // 整窗重建渲染到最新，窗口终点复位（裁剪状态随之清空）
    // v3.7.x：重渲染前保存就地作答输入草稿（TA 发消息触发重渲染时输入不丢）
    collectInplaceDrafts();
    body.innerHTML = '';
    batchRendering = true;
    for (let i = start; i < len; i++) {
      // v3.9.x：时间分隔线样式下，间隔足够大的消息前补插居中时间胶囊
      maybeInsertDivider(i);
      const m = renderMsg(msgs[i]);
      m.dataset.idx = i; // 覆盖 renderMsg 内的 msgs.length-1（批量渲染时必须为真实下标）
    }
    batchRendering = false;
    if (keepScroll && prevHeight > 0) {
      body.scrollTop = prevTop + (body.scrollHeight - prevHeight);
    }
    // v3.9.x：批量渲染期间发送的消息（side:out）补一次贴底——批量中滚动被跳过，
    // 渲染结束后新消息必须可见（发送即意图看最新）
    if (pendingOutScroll) {
      pendingOutScroll = false;
      scrollChatBottom();
    }
    suppressScrollUntil = Date.now() + 200; // 本轮渲染/滚动结束后 200ms 内不响应 scroll
    // v3.7.x：重建后恢复展开中的就地作答区（含草稿内容）
    restoreInplaceDrafts();
  }
  // v3.9.x：切换时间轴样式为「时间分隔线」时，已渲染的聊天消息需重渲染补插分隔条
  // （其余样式纯 CSS 即时生效无需重渲染；进入聊天页/恢复历史自带 renderWindow 补插，无需调用）
  window.chatReRenderTime = function () {
    if (chatPage.hidden || !body.children.length) return;
    renderWindow(true, false);
  };
  // v3.10.x：向上滚动加载更早消息——增量插顶 + 裁剪，不再整窗重建。
  // 锚点 = 原窗口第一条消息，插入后用其 offsetTop 增量校正 scrollTop，保持视觉不动。
  // 窗口条数超 WINDOW_MAX 时，裁掉远离视口的节点，防 DOM 随历史无限膨胀。
  function loadOlderIncremental() {
    const len = msgs.length;
    if (renderStart <= 0 || renderStart >= len) return;
    const newStart = Math.max(0, renderStart - LOAD_STEP);
    if (newStart === renderStart) return;
    const beforeTop = body.scrollTop;
    const preNum = body.children.length;
    const anchor = body.children[0] || null;
    batchRendering = true;
    // 新批渲染到 body 尾部（renderMsg 只会 append）
    for (let i = newStart; i < renderStart; i++) {
      maybeInsertDivider(i); // 时间分隔线：新批首条与前一条间距大时补胶囊
      const m = renderMsg(msgs[i]);
      m.dataset.idx = i;
    }
    batchRendering = false;
    renderStart = newStart;
    if (preNum > 0 && anchor) {
      // 把新批节点移到顶部，保持时间顺序；用锚点 offsetTop 校正滚动位置
      // v3.12.x：必须升序遍历——insertBefore(x, anchor) 每次都把 x 插到锚点紧前方
      //（即上一批已插节点的后面），降序遍历会把整批倒序排（深翻历史时顶部一段
      // 消息新旧颠倒的根源），升序插入才能得到 [旧…新, 锚点] 的正确时序
      const newNodes = Array.prototype.slice.call(body.children, preNum);
      for (let k = 0; k < newNodes.length; k++) body.insertBefore(newNodes[k], anchor);
      body.scrollTop = beforeTop + anchor.offsetTop;
    } else {
      body.scrollTop = body.scrollHeight; // 原窗口为空，直接滚到底
    }
    // 窗口超上限 → 从远离视口的底部（最新端）裁剪
    if (renderEnd - renderStart > WINDOW_MAX) pruneWindowBottom();
    suppressScrollUntil = Date.now() + 200;
  }
  // 向下滚动接近底部 → 加载被裁剪掉的最新端，保证能回到最新（从历史夹缝回来）
  function loadNewerIncremental() {
    const len = msgs.length;
    if (renderEnd >= len) return;
    const newEnd = Math.min(len, renderEnd + LOAD_STEP);
    if (newEnd === renderEnd) return;
    batchRendering = true;
    // v3.12.x：脱尾处理——深翻历史被裁尾后，新到的消息由 addRec 直接 append 在窗口外
    // （"脱尾"）。补画缺口时：已存在的下标跳过不重画；缺失节点插到「其后第一个已在
    // DOM 的节点」之前，保持先旧后新的时序
    let anchor = null;
    for (let i = renderEnd; i < newEnd; i++) {
      // 已由增量追加画过的下标直接跳过——防同一条消息/卡片出现两个气泡
      //（历史缺陷：addRec 不推进 renderEnd 时整段被原样重画）
      if (body.querySelector('.msg[data-idx="' + i + '"]')) continue;
      if (!anchor) {
        for (let j = i + 1; j < len && !anchor; j++) {
          anchor = body.querySelector('.msg[data-idx="' + j + '"]');
        }
      }
      maybeInsertDivider(i);
      const m = renderMsg(msgs[i]);
      m.dataset.idx = i;
      if (anchor && m.parentNode === body) body.insertBefore(m, anchor);
    }
    batchRendering = false;
    renderEnd = newEnd;
    // 窗口超上限 → 从远离视口的顶部（最早端）裁剪
    if (newEnd - renderStart > WINDOW_MAX) pruneWindowTop();
    suppressScrollUntil = Date.now() + 200;
  }
  // 移除 DOM 末尾 idx >= renderStart+WINDOW_MAX 的节点（最新端），同步 renderEnd
  function pruneWindowBottom() {
    const targetEnd = renderStart + WINDOW_MAX;
    if (renderEnd <= targetEnd) return;
    while (body.lastChild) {
      const last = body.lastChild;
      const idx = last.dataset.idx;
      if (idx !== undefined && parseInt(idx, 10) < targetEnd) break; // 已到应保留区
      body.removeChild(last);
    }
    renderEnd = targetEnd;
  }
  // 移除 DOM 顶部 idx < renderEnd-WINDOW_MAX 的节点（最早端），同步 renderStart
  function pruneWindowTop() {
    const targetStart = renderEnd - WINDOW_MAX;
    if (renderStart >= targetStart) return;
    while (body.firstChild) {
      const f = body.firstChild;
      const idx = f.dataset.idx;
      if (idx !== undefined && parseInt(idx, 10) >= targetStart) break; // 已到应保留区
      body.removeChild(f);
    }
    renderStart = targetStart;
  }
  // 向上滚动接近顶部 → 加载更早；向下接近底部 → 恢复被裁剪的最新端
  // （节流 100ms，程序化滚动 200ms 内忽略）
  let bodyScrollTimer = null;
  body.addEventListener('scroll', function () {
    if (Date.now() < suppressScrollUntil) return;
    if (bodyScrollTimer) return;
    bodyScrollTimer = setTimeout(function () {
      bodyScrollTimer = null;
      if (!chatVisible()) return;
      if (body.scrollTop < TOP_THRESHOLD) {
        loadOlderIncremental();
      } else if (renderEnd < msgs.length && body.scrollHeight - body.scrollTop - body.clientHeight < TOP_THRESHOLD) {
        loadNewerIncremental();
      }
    }, 100);
  }, { passive: true });
  function renderMsg(rec) {
    const m = document.createElement('div');
    // v3.x.x：称呼跟随——仅对方/系统消息在显示层把 TA/他 替换为性别称呼（我方消息保持原话）
    const __fit = rec.side !== 'out' && !!window.taFit;
    const T = (s) => (__fit ? window.taFit(s) : s);
    // 邀请TA：居中完整卡片（问题 + TA 的回应），等待中显示等待状态
    if (rec.special === 'invite') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.inviteStatus === 'answered';
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + T('邀请TA') + ' · ' + escTxt(rec.inviteContent || rec.text || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ ' + escTxt(T(rec.inviteAnswer || 'TA 回应了你')) + '</div>'
          : '<div class="msg-ask-tip">' + T('等待 TA 回应…') + '</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 问问TA：居中完整卡片（问题 + TA 的回答）
    if (rec.special === 'ask') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.askStatus === 'answered';
      const askIsSingle = rec.askType === 'single';
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + T('问问TA') + ' · ' + escTxt(rec.askQuestion || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ ' + T('TA：') + escTxt(T(rec.askAnswer || '回答了你')) + '</div>' + (rec.askReply ? '<div class="msg-choose-r">' + T('TA：') + escTxt(T(rec.askReply)) + '</div>' : '')
          : '<div class="msg-ask-tip">' + (askIsSingle ? T('等待 TA 选择…') : T('等待 TA 回答…')) + '</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 通话：居中卡片
    if (rec.special === 'call' || rec.special === 'call-reply' || rec.special === 'invite-reply') {
      m.className = 'msg-center';
      m.innerHTML = '<div class="msg-center-card">' + escTxt(T(rec.text)) + '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 拍一拍 / 换头像 / 互动卡片提示语：居中灰字小卡片，可选附带一张头像图
    // v3.5.146：'ask-msg' 为互动卡片提示语（TA想问你一个问题 等）——渲染与 poke 相同，
    // 但不算入 notable（addRec 的弹窗/通知联动），避免提示语与卡片各弹一条通知
    if (rec.special === 'poke' || rec.special === 'ask-msg') {
      // v3.10.x：信件通知（mail.js 写入 mailNotice）渲染为可点击样式，点击直达信箱
      m.className = 'msg-poke' + (rec.mailNotice ? ' mail-notice' : '');
      m.innerHTML = '<span>' + pokeIconHtml(T(rec.text)) + '</span>' +
        (rec.img ? '<img class="msg-poke-img" src="' + attrEsc(rec.img) + '" alt="新头像">' : '');
      if (rec.mailNotice) {
        m.addEventListener('click', () => { if (window.openMailPage) window.openMailPage(); });
      }
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 猜拳：居中白底卡片，显示双方出拳（灰色手势图标 + 名字）+ 结果文字，简约无彩色
    if (rec.special === 'rps') {
      m.className = 'msg-rps';
      // 手势图标来自 Phosphor Icons（MIT）
      const rpsIco = {
        rock: '<svg viewBox="0 0 256 256"><path fill="currentColor" d="M200 80h-16V64a32 32 0 0 0-56-21.13a32 32 0 0 0-55.79 17.55A32 32 0 0 0 24 88v40a104 104 0 0 0 208 0v-16a32 32 0 0 0-32-32m-48-32a16 16 0 0 1 16 16v16h-32V64a16 16 0 0 1 16-16M88 64a16 16 0 0 1 32 0v40a16 16 0 0 1-32 0ZM40 88a16 16 0 0 1 32 0v16a16 16 0 0 1-32 0Zm176 40a88 88 0 0 1-175.92 3.75A31.93 31.93 0 0 0 80 125.13a31.93 31.93 0 0 0 44.58 3.35a32.2 32.2 0 0 0 11.8 11.44A47.88 47.88 0 0 0 120 176a8 8 0 0 0 16 0a32 32 0 0 1 32-32a8 8 0 0 0 0-16h-16a16 16 0 0 1-16-16V96h64a16 16 0 0 1 16 16Z"/></svg>',
        scissors: '<svg viewBox="0 0 256 256"><path fill="currentColor" d="M212.24 30A28 28 0 0 0 161 36.77l-13 48.32l-12.95-48.32A28 28 0 1 0 81 51.26l9.38 35l-8.73-1.68a28 28 0 0 0-24.85 47.8a27.86 27.86 0 0 0-8.8 20.49V160a80 80 0 0 0 80 80h.61c43.78-.33 79.39-36.62 79.39-80.9v-3.34a55.88 55.88 0 0 0-11.77-34.27L215 51.26A27.8 27.8 0 0 0 212.24 30M97.61 38a12 12 0 0 1 22 2.9l14.77 55.15a28 28 0 0 0-14 4.77a2 2 0 0 0-.16-.26A27.65 27.65 0 0 0 108 90.35L96.42 47.12A11.94 11.94 0 0 1 97.61 38m-33.36 71.6a12 12 0 0 1 14.25-9.34l20.71 4a12 12 0 0 1 9.36 14.16a12 12 0 0 1-14.25 9.34l-20.75-4a12 12 0 0 1-9.32-14.15Zm0 40.72a12 12 0 0 1 14-9.37l10.11 2a12 12 0 0 1 9.36 14.15a12 12 0 0 1-14.2 9.35l-10-2a12 12 0 0 1-9.34-14.16ZM192 159.1c0 35.53-28.49 64.64-63.5 64.9a64.08 64.08 0 0 1-61.56-44.78a31 31 0 0 0 3.48.95l10 2a28.3 28.3 0 0 0 5.61.57a28 28 0 0 0 24.16-42.14c.79-.43 1.57-.89 2.32-1.4l.16.26a27.82 27.82 0 0 0 17.78 12l6.32 1.26a36 36 0 0 0 9.53 32.49A8 8 0 0 0 157.71 174a20 20 0 0 1-3.31-23.51a8 8 0 0 0-5.46-11.66l-15.34-3.07a12 12 0 0 1-9.35-14.15a12 12 0 0 1 14.18-9.35l21.41 4.28A40.1 40.1 0 0 1 192 155.76Zm7.59-112l-16.62 62a55.6 55.6 0 0 0-20-8.28l-2.5-.5l15.93-59.41a12 12 0 1 1 23.18 6.21Z"/></svg>',
        paper: '<svg viewBox="0 0 256 256"><path fill="currentColor" d="M188 88a27.75 27.75 0 0 0-12 2.71V60a28 28 0 0 0-41.36-24.6A28 28 0 0 0 80 44v6.71A27.75 27.75 0 0 0 68 48a28 28 0 0 0-28 28v76a88 88 0 0 0 176 0v-36a28 28 0 0 0-28-28m12 64a72 72 0 0 1-144 0V76a12 12 0 0 1 24 0v44a8 8 0 0 0 16 0V44a12 12 0 0 1 24 0v68a8 8 0 0 0 16 0V60a12 12 0 0 1 24 0v68.67A48.08 48.08 0 0 0 120 176a8 8 0 0 0 16 0a32 32 0 0 1 32-32a8 8 0 0 0 8-8v-20a12 12 0 0 1 24 0Z"/></svg>'
      };
      const rpsName = { rock: '石头', scissors: '剪刀', paper: '布' };
      const resTxt = rec.rpsResult > 0 ? '你赢了' : rec.rpsResult < 0 ? '你输了' : '平局';
      m.innerHTML = '<div class="msg-rps-card">' +
        '<div class="msg-rps-hands">' +
          '<span class="msg-rps-hand"><span class="msg-rps-ico">' + (rpsIco[rec.rpsMine] || '') + '</span><span class="msg-rps-name">你 · ' + escTxt(rpsName[rec.rpsMine] || '') + '</span></span>' +
          '<span class="msg-rps-vs">VS</span>' +
          '<span class="msg-rps-hand"><span class="msg-rps-ico">' + (rpsIco[rec.rpsTa] || '') + '</span><span class="msg-rps-name">' + T('TA') + ' · ' + escTxt(rpsName[rec.rpsTa] || '') + '</span></span>' +
        '</div>' +
        '<div class="msg-rps-result">' + escTxt(resTxt) + '</div>' +
      '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // Pong：居中白底卡片，显示比分与结果
    if (rec.special === 'pong') {
      m.className = 'msg-pong';
      m.innerHTML = '<div class="msg-pong-card">' +
        '<div class="msg-pong-label">' + T('双人 Pong') + '</div>' +
        '<div class="msg-pong-result">' + escTxt(T(rec.text || '')) + '</div>' +
      '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 双人贪吃蛇：居中白底卡片，双方长度/食物/得分 + 结果
    if (rec.special === 'snake') {
      m.className = 'msg-rps';
      const snkResTxt = rec.snkResult === 'win' ? '你赢了' : rec.snkResult === 'lose' ? T('TA 赢了') : '平局';
      const snkClr = rec.snkResult === 'win' ? '#34c759' : rec.snkResult === 'lose' ? '#ff6b6b' : '#888';
      m.innerHTML = '<div class="msg-rps-card msg-snake-card">' +
        '<div class="msg-snake-title">🐍 双人贪吃蛇</div>' +
        '<div class="msg-snake-row"><span class="msg-snake-side">你</span><span>长度 ' + rec.snkPLen + '</span><span>食物 ' + rec.snkPFood + '</span><span>' + rec.snkPScore + '分</span></div>' +
        '<div class="msg-snake-row"><span class="msg-snake-side">' + T('TA') + '</span><span>长度 ' + rec.snkOLen + '</span><span>食物 ' + rec.snkOFood + '</span><span>' + rec.snkOScore + '分</span></div>' +
        '<div class="msg-rps-result" style="color:' + snkClr + '">存活 ' + rec.snkTime + 's · ' + escTxt(snkResTxt) + '</div>' +
      '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 红包：居中白底卡片，红包图标 + 金额 + 留言 + 领取状态（简约白灰风格）
    if (rec.special === 'redpacket') {
      m.className = 'msg-rp';
      m.dataset.idx = msgs.length - 1;
      const sideTxt = rec.side === 'out' ? '我' : chatPartnerName();
      const cls = rpStatusCls(rec);
      const rpIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9c3 2 6 3 9 3s6-1 9-3"/><circle cx="12" cy="9" r="1.4"/></svg>';
      m.innerHTML = '<div class="msg-rp-card' + (cls ? ' ' + cls : '') + '">' +
        '<div class="msg-rp-top"><span class="msg-rp-ico">' + rpIco + '</span><span class="msg-rp-label">红包</span></div>' +
        '<div class="msg-rp-amt">¥' + escTxt(Number(rec.rpAmount || 0).toFixed(2)) + '</div>' +
        '<div class="msg-rp-wish">' + escTxt(rec.rpWish || '心意') + '</div>' +
        '<div class="msg-rp-foot">' +
          '<span class="msg-rp-side">' + escTxt(sideTxt) + ' 发出</span>' +
          '<span class="msg-rp-status">' + escTxt(rpStatusText(rec)) + '</span>' +
        '</div>' +
        favHeartHtml() +
        '</div>';
      if (rec.rpCover) {
        const cover = rpCoverGet();
        if (cover) {
          const card = m.querySelector('.msg-rp-card');
          if (card) {
            card.classList.add('has-cover');
            card.style.backgroundImage = 'url("' + cover + '")';
          }
        }
      }
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 花朵卡片：居中粉底卡片，花朵emoji + 花名 + 留言
    if (rec.special === 'flower') {
      m.className = 'msg-flower';
      const sideTxt = rec.side === 'out' ? '我' : chatPartnerName();
      m.innerHTML = '<div class="msg-flower-card">' +
        '<div class="msg-flower-bar"></div>' +
        '<div class="msg-flower-emoji">' + escTxt(rec.flEmoji || '\uD83C\uDF37') + '</div>' +
        '<div class="msg-flower-name">' + escTxt(rec.flName || '\u82B1') + '</div>' +
        '<div class="msg-flower-divider"><span></span>\u2739<span></span></div>' +
        '<div class="msg-flower-wish">\u201C' + escTxt(rec.flWish || '\u9001\u7ED9\u4F60~') + '\u201D</div>' +
        '<div class="msg-flower-foot"><span>' + escTxt(sideTxt) + ' \u9001\u51FA</span></div>' +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // 礼物卡片：简约黑白风 + 分类色圆底（emoji 底衬用市集分类色，其余黑白灰）
    if (rec.special === 'gift') {
      m.className = 'msg-gift';
      const sideTxt = rec.side === 'out' ? '我 送出' : (chatPartnerName() + ' 送来');
      const gc = ((window.GIFT_CAT_COLOR || {})[rec.giftCat]) || '#f2f2f5';
      m.innerHTML = '<div class="msg-gift-card">' +
        '<div class="msg-gift-emoji" style="background:' + escTxt(gc) + '">' + (rec.giftImg ? '<img class="msg-gift-img" src="' + escTxt(rec.giftImg) + '" alt="">' : escTxt(rec.giftEmoji || '\uD83C\uDF81')) + '</div>' +
        '<div class="msg-gift-name">' + escTxt(rec.giftName || '礼物') + '</div>' +
        '<div class="msg-gift-divider"></div>' +
        '<div class="msg-gift-wish">\u201C' + escTxt(rec.giftWish || '心意') + '\u201D</div>' +
        '<div class="msg-gift-foot"><span class="mg-side">' + escTxt(sideTxt) + '</span>' +
          '<span class="msg-gift-price">\u00A5' + escTxt(Number(rec.giftPrice || 0).toFixed(2)) + '</span></div>' +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // TA 的小问题：居中选择题卡片，未作答点击弹出选项
    if (rec.special === 'ask-choose') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.choiceStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + escTxt(rec.choiceQuestion || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你选择了：' + escTxt(rec.choiceAnswer) + '</div><div class="msg-choose-r">' + T('TA：') + escTxt(T(rec.choiceReply)) + '</div>'
          : '<div class="msg-ask-tip">点击选择你的答案</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // TA 的好奇：居中白卡显示问题，未回答可点击回答
    if (rec.special === 'ask-curious') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.curiousStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + escTxt(rec.curiousQuestion || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你：' + escTxt(rec.curiousAnswer) + '</div><div class="msg-choose-r">' + T('TA：') + escTxt(T(rec.curiousReply)) + '</div>'
          : '<div class="msg-ask-tip">' + T('点击回答 TA 的好奇') + '</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // TA 的吐槽：居中白卡显示吐槽，未回应可点击回一句
    if (rec.special === 'ask-roast') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.roastStatus === 'answered';
      m.innerHTML = '<div class="msg-choose-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + escTxt(rec.roastText || '') + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 你：' + escTxt(rec.roastAnswer) + '</div><div class="msg-choose-r">' + T('TA：') + escTxt(T(rec.roastReply)) + '</div>'
          : '<div class="msg-ask-tip">' + T('点击回 TA 一句') + '</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    // TA 的询问卡片：居中白卡显示问题，未回答可点击回答（星言 ta 的询问）
    // v3.6.x：支持单选题（askType/askOptions 由 ta-ask.js pushAsk 写入聊天记录）
    if (rec.special === 'ask-card') {
      m.className = 'msg-ask';
      m.dataset.idx = msgs.length - 1;
      const answered = rec.askStatus === 'answered';
      const isSingle = rec.askType === 'single' || (rec.type === 'single' && Array.isArray(rec.options) && rec.options.length);
      m.innerHTML = '<div class="msg-ask-card' + (answered ? ' answered' : '') + '">' +
        '<div class="msg-ask-q">' + escTxt(rec.askQuestion || rec.text) + '</div>' +
        (answered
          ? '<div class="msg-ask-a">✓ 已回答：' + escTxt(rec.askAnswer) + '</div>' + (rec.askReply ? '<div class="msg-choose-r">' + T('TA：') + escTxt(T(rec.askReply)) + '</div>' : '')
          : '<div class="msg-ask-tip">' + (isSingle ? '点击选择你的答案' : T('点击回答 TA 的提问')) + '</div>') +
        favHeartHtml() +
        '</div>';
      body.appendChild(m);
      maybeScrollChatBottom(rec.side);
      return m;
    }
    m.className = 'msg ' + (rec.side === 'out' ? 'msg-out' : 'msg-in');
    // 头像列：头像 + 时间轴（时间在头像底下）
    const timeHtml = rec.ts ? '<span class="msg-time">' + fmtTime(rec.ts) + '</span>' : '';
    const side = '<div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div>';
    // 我的消息：气泡在左、头像(带时间)在右；对方消息：头像(带时间)在左、气泡在右
    m.innerHTML = rec.side === 'out'
      ? '<div class="msg-bubble"></div>' + side
      : side + '<div class="msg-bubble"></div>';
    const av = m.querySelector('.msg-av');
    const b = m.querySelector('.msg-bubble');
    if (rec.special === 'read') {
      // 已读不回：保留正常聊天气泡
      b.innerHTML = '<span style="opacity:.5;font-size:12px">已读不回</span>';
    } else if (rec.type === 'sticker' || rec.type === 'image') {
      // 表情包：小图；图片：大图可点击查看（带引用则先显示引用块）
      b.style.padding = '6px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      b.innerHTML = (rec.quote ? quoteHtml(rec.quote, rec.qside) : '') + (rec.type === 'image'
        ? '<img class="msg-img msg-img-big" src="' + attrEsc(rec.text) + '" alt="图片" loading="lazy" decoding="async">'
        : '<img class="msg-img msg-img-sm" src="' + attrEsc(rec.text) + '" alt="表情" loading="lazy" decoding="async">');
      if (rec.type === 'image') {
        // v3.6.x：stopPropagation 防穿透——否则点图片会同时冒泡到 body 委托弹出操作菜单
        b.querySelector('.msg-img-big').addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.viewChatImage) window.viewChatImage(rec.text);
        });
      }
    } else if (rec.type === 'voice') {
      // 语音消息：播放按钮 + 波形动画（数据格式：文件名|||音频dataURL）
      b.style.padding = '8px 10px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      const vparts = String(rec.text || '').split('|||');
      // v3.6.x：语音名称去掉 mp3/mp4 等后缀（旧消息存的名字仍带后缀）
      const vname = (vparts[0] || '语音消息').replace(/\.[^.]+$/, '');
      const vsrc = vparts[1] || '';
      b.innerHTML = '<div class="msg-voice" data-src="' + attrEsc(vsrc) + '">' +
        '<button class="msg-voice-play" title="播放">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '</button>' +
        '<div class="msg-voice-wave"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<span class="msg-voice-name">' + escTxt(vname) + '</span>' +
        '</div>';
      // v3.6.x：stopPropagation 防穿透——否则点播放会同时冒泡弹出操作菜单
      b.querySelector('.msg-voice-play').addEventListener('click', function (e) {
        e.stopPropagation();
        playVoiceInChat(this, vsrc);
      });
    } else if (rec.retracted) {
      b.dataset.orig = rec.orig || rec.text;
      b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + (rec.side === 'out' ? '我' : '对方') + '撤回了一条消息</span>';
      bindToggle(b, rec.side);
    } else if (rec.parts && rec.parts.length) {
      // 组合消息：文字 + 图片/表情（同一气泡内，图片网格 + 文字）
      // 图片 → 大图可点击；表情包 → 小图（sub 字段区分，旧数据按图片处理）
      const imgs = rec.parts.filter(p => p.k === 'img').map(p => p);
      const textPart = rec.parts.filter(p => p.k === 'text').map(p => p.v).join(' ');
      let inner = '';
      if (imgs.length) {
        inner += '<div class="msg-parts-imgs' + (imgs.length > 1 ? ' multi' : '') + '">' +
          imgs.map(p => {
            const isSticker = p.sub === 'sticker';
            return '<img class="msg-img' + (isSticker ? ' msg-img-sm' : ' msg-img-big') + '" src="' + attrEsc(p.v) + '" alt="' + (isSticker ? '表情' : '图片') + '" loading="lazy" decoding="async">';
          }).join('') + '</div>';
      }
      if (textPart) {
        inner += '<span style="opacity:.85;word-break:break-word">' + escTxtBr(T(textPart)) + '</span>';
      }
      b.innerHTML = rec.quote
        ? quoteHtml(rec.quote, rec.qside) + inner
        : inner;
      // 组合消息里的图片（大图）可点击查看（v3.6.x：stopPropagation 防穿透弹菜单）
      b.querySelectorAll('.msg-img-big').forEach(img => {
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.viewChatImage) window.viewChatImage(img.src);
        });
      });
    } else if (rec.retractedSegs && rec.retractedSegs.length) {
      // ★ 字卡级局部撤回：正文隐藏被撤段，下方胶囊可展开查看
      const segs = splitCardSegs(rec.text);
      const rcs = rec.retractedSegs || [];
      let segHtml = '';
      for (let i = 0; i < segs.length; i++) {
        if (!rcs.some(r => r.idx === i)) {
          if (segHtml) segHtml += ' ';
          segHtml += escTxtBr(T(segs[i]));
        }
      }
      let sub = '';
      rcs.forEach(r => { sub += '<div style="padding:2px 0">（已撤回）' + escTxt(r.text || '') + '</div>'; });
      b.innerHTML = (rec.quote ? quoteHtml(rec.quote, rec.qside) : '') +
        '<span style="opacity:.85;word-break:break-word">' + (segHtml || '…') + '</span>' +
        '<div style="margin-top:6px;text-align:left">' +
        '<span class="msg-poke-seg" data-rc="1">' + (rec.side === 'out' ? '我' : '对方') + '撤回了 ' + rcs.length + ' 条字卡 ▾</span>' +
        '<div class="msg-poke-seg-detail" style="display:none">' + sub + '</div>' +
        '</div>';
      const tip = b.querySelector('.msg-poke-seg');
      if (tip) {
        // stopPropagation：展开/收起详情，不冒泡到 body 触发"引用/收藏"操作菜单（v3.5.42）
        tip.addEventListener('click', (e) => {
          e.stopPropagation();
          const d = tip.nextElementSibling;
          if (d) d.style.display = d.style.display === 'block' ? 'none' : 'block';
        });
      }
    } else {
      // v3.5.131：文本转义（用户输入含 < 会破坏气泡结构/注入 HTML）
      // v3.6.x：升级为完整转义（只转 < 可被 `&lt;…&gt;` 实体绕过）
      // v3.7.x：多行文本 \n 转 <br>（占卜结果等多行消息排版正常）
      const escTxtS = escTxtBr(T(rec.text));
      b.innerHTML = rec.quote
        ? quoteHtml(rec.quote, rec.qside) + '<span style="opacity:.85">' + escTxtS + '</span>'
        : '<span style="opacity:.85">' + escTxtS + '</span>';
    }
    // 恢复情绪字卡（持久化）：所有字卡包进一个 .msg-moods 容器，
    // 容器用一条虚线与正文隔离，字卡在容器内紧凑同行、放不下才自动换行
    if (rec.mood && rec.mood.length) {
      const mm = document.createElement('div');
      mm.className = 'msg-moods';
      const recalled = [];
      rec.mood.forEach((md, mi) => {
        // v3.7.x：被撤的情绪字卡不再直接隐藏——收进「撤回胶囊」，可展开查看原内容
        if (rec.retractedMood && rec.retractedMood.indexOf(mi) >= 0) { recalled.push(md); return; }
          const mt = escTxt(T(md.tag)), ml = escTxt(T(md.label));
        if (md.tag === '交流意图') {
          mm.innerHTML += '<div class="msg-mood msg-intent"><span class="msg-mood-tag">' + mt + '</span><span>' + ml + '</span></div>';
        } else {
          mm.innerHTML += '<div class="msg-mood"><span class="msg-mood-tag">' + mt + '</span><span>' + ml + '</span></div>';
        }
      });
      // v3.7.x：撤回的情绪字卡胶囊（点击展开查看被撤内容，与文本段撤回同风格）
      if (recalled.length) {
        mm.innerHTML += '<div style="margin-top:2px">' +
          '<span class="msg-poke-seg" data-rcm="1">' + (rec.side === 'out' ? '我' : '对方') + '撤回了 ' + recalled.length + ' 条情绪字卡 ▾</span>' +
          '<div class="msg-poke-seg-detail" style="display:none">' +
          recalled.map(md => '<div style="padding:2px 0">（已撤回）' + escTxt(md.tag || '') + '：' + escTxt(md.label || '') + '</div>').join('') +
          '</div></div>';
      }
      if (mm.children.length) b.appendChild(mm);
      const rctip = mm.querySelector('.msg-poke-seg[data-rcm]');
      if (rctip) {
        // stopPropagation：展开/收起详情，不冒泡到 body 触发"引用/收藏"操作菜单
        rctip.addEventListener('click', (e) => {
          e.stopPropagation();
          const d = rctip.nextElementSibling;
          if (d) d.style.display = d.style.display === 'block' ? 'none' : 'block';
        });
      }
    }
    fillAvatar(av, rec.side === 'out' ? 'cs-avatar-user' : 'cs-avatar-partner');
    // 点击联系人消息左侧头像 → 打开拍一拍半框，对 TA 使用拍一拍
    if (rec.side === 'in') {
      av.style.cursor = 'pointer';
      av.title = T('对 TA 拍一拍');
      av.addEventListener('click', (e) => {
        e.stopPropagation();
        openPokeCard();
      });
    }
    // v3.6.x：主动发送标识——联系人主动找你的消息气泡左上角加小爱心；
    // 开关在回复设置→主动发送（reply-as-badge，默认开）。撤回应不显示。
    if (rec.side === 'in' && rec.initiative && !rec.retracted) {
      try {
        const c = cfg();
        if (cfgn(c, 'as-badge', 1) === 1 && !b.querySelector('.msg-hi-heart')) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'msg-hi-heart');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'currentColor');
          svg.setAttribute('aria-hidden', 'true');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
          svg.appendChild(path);
          b.insertBefore(svg, b.firstChild);
        }
      } catch (e) {}
    }
    if (rec.side === 'in' || rec.side === 'out') m.dataset.idx = msgs.length - 1;
    // v3.9.x：图片/表情/引用图解码后消息高度才稳定（img 是 lazy + async 解码），
    // 同步滚动在图片撑开高度前执行会停在中间——加载完成瞬间补滚一次。
    // 只响应「刚插入（6s 内）」的图片，向上翻旧消息时历史图片迟加载不打断阅读位置
    // （in 消息仍受贴底守卫保护；out 消息是发送方意图看最新，无条件滚）。
    try {
      const ts = rec.ts || Date.now();
      m.querySelectorAll('img').forEach(img => {
        if (img.complete) return;
        img.addEventListener('load', () => {
          if (Date.now() - ts < 6000 && chatVisible()) maybeScrollChatBottom(rec.side);
        });
      });
    } catch (e) {}
    body.appendChild(m);
    // v3.9.x：side 透传——我发送的消息（side:out）一律滚到底（发送即意图看最新），
    // TA 消息贴近底部才滚（翻旧消息时不打断阅读位置）。修复「发送消息后不自动滚到最新」
    maybeScrollChatBottom(rec.side);
    return m;
  }

  // 拍一拍：联系人用自定义字卡【拍一拍】里的字卡，居中灰字显示 "昵称 + 字卡 + 对我"
  function performPoke() {
    // 优先用默认字卡【拍一拍】（聊天默认字卡开启时）
    let action = '';
    const dcfg = (window.defaultCardCfg && window.defaultCardCfg()) || {};
    // v3.7.x：聊天场景开关——关闭后拍一拍回退到自定义拍一拍
    const useChat = window.defaultCardUse ? window.defaultCardUse('chat') : true;
    // v3.8.x：分类开关——「拍一拍」分类被关闭时回退到自定义拍一拍
    const touchOn = window.defaultCardCat ? window.defaultCardCat('touch') : true;
    if (dcfg.enabled && useChat && touchOn && dcfg.probs && (dcfg.probs.touch || 0) > 0) {
      const d = (window.getDefaultCards && window.getDefaultCards()) || null;
      if (d && d.type === 'poke') action = d.text;
    }
    if (!action) {
      const cards = pokeAllCards();
      action = cards.length ? pick(cards) : '拍了拍你';
    }
    const name = chatPartnerName();
    const myName = chatUserName();
    // 显示：联系人昵称 + 字卡（v3.7.x 全格式处理）
    // 含"你"：如"拍了拍你"→"拍了拍我"；若卡面以"你/我"作主语（如"你拍了拍我的头"/
    //   "我拍了拍你的头"），主语=联系人，去掉后其余"你"换我的称呼
    // 含"我"（目标，如"拍了拍我的头"）或中性（如"闷闷垂头"）：直接拼接
    // 卡面以"我"作主语（如"我拍了拍"）：主语=联系人，去掉后其余原样
    // "你们/我们" 整体不替换（/你(?![们])/ 保护）
    let text;
    if (action.indexOf('你') >= 0) {
      if (action.charAt(0) === '你' || action.charAt(0) === '我') {
        text = name + ' ' + action.slice(1).replace(/你(?![们])/g, myName);
      } else {
        text = name + ' ' + action.replace(/你(?![们])/g, myName);
      }
    } else if (action.charAt(0) === '我') {
      text = name + ' ' + action.slice(1);
    } else {
      text = name + ' ' + action;
    }
    addIn(text, { special: 'poke' });
  }

  // v3.5.100：桌面「聊天」图标未读数字提醒
  // 未读数持久化到 chat-unread（跨页面/刷新保留），打开聊天页即清零（微信式）
  function chatUnread() { try { return parseInt(store.get('chat-unread'), 10) || 0; } catch (e) { return 0; } }
  function incChatUnread() {
    try { store.set('chat-unread', String(chatUnread() + 1)); } catch (e) {}
    updateChatBadge();
  }
  function clearChatUnread() {
    try { store.set('chat-unread', '0'); } catch (e) {}
    updateChatBadge();
  }
  function updateChatBadge() {
    const n = chatUnread();
    if (window.setDeskBadge) { window.setDeskBadge('chat', n); return; }
    const badge = document.getElementById('chat-badge');
    if (!badge) return;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
  }

  // v3.6.x：删除全部聊天记录——聊天设置页调用，不刷新页面原地清空：
  // 内存 msgs + 未落盘暂存 + 防抖定时器 + localStorage + IndexedDB（store.remove 双写）
  // 全部清掉，同时清空已渲染的消息 DOM 与未读角标；回聊天页即为空。
  // 顺带置 chatDbReady=true，清空后新消息直接走正常落盘路径。
  window.clearChatHistory = function () {
    msgs = [];
    pendingLocal = null;
    sessionChangedIdx.clear();
    chatDbReady = true;
    renderStart = 0; // v3.6.x：分页窗口起点复位（消息已清空）
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { store.remove('chat-msgs'); } catch (e) {}
    if (body) body.innerHTML = '';
    clearChatUnread();
  };

  // v3.6.x：导出聊天记录——聊天设置页调用，返回当前完整消息数组
  //（内存 msgs 即全量历史，renderStart 只影响渲染窗口不影响数据；导出前强制落盘，
  //  防抖窗口内未写盘的最后几条也已在内存里，返回切片避免调用方改动内部数组）
  window.chatExportMsgs = function () {
    if (window.chatFlushSave) window.chatFlushSave();
    return (msgs || []).slice();
  };

  // v3.6.x：导入聊天记录——聊天设置页调用，用传入数组整体覆盖当前历史（导出文件的还原）：
  // 校验 → 写 IndexedDB（权威，与 loadMsgs 读取路径一致）→ 清 localStorage 残留 →
  // 复位分页窗口起点/未读角标 → 聊天页可见时就地重渲染，无需刷新页面。
  // 消息渲染侧本就全量转义（escTxt），导入数据无需再预处理。
  window.chatImportMsgs = function (arr) {
    if (!Array.isArray(arr)) return false;
    msgs = arr.filter(m => m && typeof m === 'object');
    pendingLocal = null;
    sessionChangedIdx.clear();
    chatDbReady = true;
    renderStart = 0;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // v3.6.x 修复（导入竞态）：删除 store.remove——它内部 idbDelete 异步，与下一行
    // idbSet 并发可能后执行把刚导入的数据删掉。idbSet(put) 本就覆盖旧值，无需先删
    const importedData = JSON.stringify(msgs);
    try { if (window.idbSet) window.idbSet(window.activePrefix() + ':chat-msgs', importedData); } catch (e) {}
    writeLsSnapshot(importedData);
    if (body) body.innerHTML = '';
    clearChatUnread();
    if (chatVisible() && msgs.length) {
      renderWindow(false, true);
      scrollChatBottom();
    }
    return true;
  };

  // v3.5.102：桌面新消息横幅——TA 的普通消息进来且当前不在聊天页时，
  // 在桌面/任意页面顶部弹出横幅（头像 + 昵称 + 内容），点击直接进聊天
  const deskMsgEl = document.getElementById('desk-msg');
  const deskMsgAv = document.getElementById('desk-msg-av');
  const deskMsgName = document.getElementById('desk-msg-name');
  const deskMsgText = document.getElementById('desk-msg-text');
  let deskMsgTimer = null;
  let deskMsgAction = null; // v3.5.107：横幅点击回调（聊天进聊天页 / 信箱进信箱 / 朋友圈进朋友圈）
  let deskMsgCloseAnimTimer = null; // v3.5.136：关闭滑出动画定时器（防止与新横幅竞态）
  let deskMsgRevertTimer = null;    // v3.5.136：回弹动画定时器
  // v3.5.103：设置页「桌面消息弹窗」开关（默认开启；关闭后 TA 消息只进聊天角标，不弹横幅）
  function deskMsgEnabled() {
    const v = store.get('desk-msg-en');
    return v === null || v === undefined || v === '' ? true : v === '1';
  }
  // v3.5.107：通用前台桌面弹窗——聊天新消息、信箱来信/回信、朋友圈通知共用顶部横幅
  // opts：{ name: 标题（默认 TA 昵称）, text: 内容, type: 消息类型（图片/表情包等）, img: 图片 dataURL（缩略图）, onClick: 点击回调, isHidden: 可见性状态 }
  function showDeskPopup(opts) {
    opts = opts || {};
    let t = String(opts.text || '');
    // v3.5.157：图片占位文案统一按 imgSub 判定——sticker→[表情包]、image→[图片]、
    // 缺失→[图片]；voice→[语音]。imgSub 由 extractDeskMsg 从 parts.sub 提取
    const phOf = function () {
      if (opts.type === 'voice') return '[语音]';
      if (opts.imgSub === 'sticker' || opts.type === 'sticker') return '[表情包]';
      return '[图片]';
    };
    // v3.5.142：图片/表情包消息可能没有文字（纯图片），此时显示占位文案
    if (!t && opts.img) t = phOf();
    if (!t) return;
    if (t.indexOf('data:') === 0) t = phOf();
    // v3.5.132：正文里混入的 dataURL 片段（写信内容带表情包/图片/语音时，data: 前缀判断失效）
    // v3.6.x：正则从 data:image/ 扩展到任意 data:MIME/（覆盖 data:audio/ data:video/ 等），
    // 避免语音消息「名|||data:audio/...base64」里的音频 base64 漏过显示成乱码
    else if (t.indexOf('data:') > 0) t = t.replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[附件]');
    // v3.6.x：语音消息 text 格式「名称|||音频dataURL」——extractDeskMsg 已拆分，但其他
    // 调用路径可能仍传整段；兜底按 ||| 拆分取名称（去 mp3/mp4 等后缀），不显示 base64
    else if (t.indexOf('|||') >= 0) t = t.split('|||')[0].replace(/\.[^.]+$/, '').trim() || '[语音]';
    // v3.6.x：通话等系统消息的正文含内联 SVG（来电铃铛/电话图标），textContent 会把
    // 整段 SVG 源码当文本显示成乱码——剥离标签只保留可见文字（来电/挂断等）
    // v3.5.131：仅对含 svg 的系统消息剥离标签——普通消息里的 `<`（如"1<2"）不再被误删
    else if (t.indexOf('<svg') >= 0) t = t.replace(/<[^>]*>/g, '').trim();
    else if (t.length > 40) t = t.slice(0, 40) + '…';
    // v3.5.157：文字+图片/表情包组合消息 → 正文补图片占位（消息有图但正文只有文字时，
    // 用户看不到图片存在）。后台通知与前台横幅统一补：有 img 且正文没占位 → 追加
    let notifyT = t;
    if (opts.img && notifyT.indexOf('[图片]') < 0 && notifyT.indexOf('[表情包]') < 0 && notifyT.indexOf('[语音]') < 0 && notifyT.indexOf('[附件]') < 0) {
      notifyT = notifyT + ' ' + phOf();
    }
    // v3.5.140：后台弹窗联动——桌面弹窗能触发的消息（聊天/拍一拍/信箱来信回信/朋友圈
    // 通知），页面不在前台时同步发系统通知；放在 desk-msg-en 判断之前，桌面弹窗开关
    // 与后台通知开关互不影响（bgNotifyCheck 内部按 bg-notify 开关/权限/可见性判断）
    // v3.5.142：附上图片 dataURL（通知 image 字段显示缩略图 + 文字）
    // v3.9.x：页面在后台时只发系统通知、不弹应用内横幅——横幅的 6 秒自动隐藏
    // setTimeout 在后台会被浏览器节流/冻结，回前台时横幅还挂着几分钟前的旧消息
    // （用户反馈：切换后台后返回浏览器，后台弹窗突然弹几分钟前的播放音乐系统消息）
    // v3.9.x 修复：使用调用时捕获的 isHidden 状态，避免二次检查时可见性已变导致错判
    const isHidden = opts.isHidden === true;
    if (isHidden) {
      if (window.bgNotifyCheck) {
        // v3.7.x：跨桌面——av 字段透传发布者头像（朋友圈通知来自其它联系人桌面时，
        // 系统通知右侧大图标用发布者头像而非当前桌面 TA 头像）
        window.bgNotifyCheck(notifyT, Date.now(), { name: opts.name, img: opts.img, av: opts.av });
      }
      return;
    }
    if (!deskMsgEl || !deskMsgEnabled()) return;
    if (deskMsgText) deskMsgText.textContent = notifyT;
    if (deskMsgName) deskMsgName.textContent = opts.name || store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    if (deskMsgAv) {
      // v3.7.x：跨桌面通知（朋友圈等）弹窗头像用发布者头像（opts.av），
      // 普通聊天消息仍用当前桌面 TA 头像
      if (opts.av && typeof opts.av === 'string' && opts.av.indexOf('data:') === 0) {
        const img = document.createElement('img');
        img.src = opts.av;
        img.alt = '';
        deskMsgAv.innerHTML = '';
        deskMsgAv.appendChild(img);
      } else {
        fillAvatar(deskMsgAv, 'avatar-partner');
      }
    }
    deskMsgAction = (typeof opts.onClick === 'function') ? opts.onClick : null;
    // v3.5.136：清除上次关闭/回弹动画残留，避免新横幅带上 transform/transition
    if (deskMsgCloseAnimTimer) { clearTimeout(deskMsgCloseAnimTimer); deskMsgCloseAnimTimer = null; }
    if (deskMsgRevertTimer) { clearTimeout(deskMsgRevertTimer); deskMsgRevertTimer = null; }
    deskMsgEl.style.transition = '';
    deskMsgEl.style.transform = '';
    deskMsgEl.style.opacity = '';
    deskMsgEl.hidden = false;
    clearTimeout(deskMsgTimer);
    deskMsgTimer = setTimeout(() => { if (deskMsgEl) deskMsgEl.hidden = true; }, 6000);
  }
  // 聊天新消息横幅（TA 普通消息进来且不在聊天页时弹出，点击进聊天）
  // v3.5.142：接收整个消息记录——提取文字与图片（rec.parts 的 img / 纯图片消息
  // text 本身），文字 + 图片缩略图一起展示；文字里混的 dataURL 由 showDeskPopup 清洗
  // v3.5.145：修复「聊天页切后台后 TA 回复不弹系统通知」——
  // 原实现先 if (chatVisible()) return，聊天页打开（即使已切后台）时整条链路短路；
  // 系统通知应基于浏览器可见性（hidden）判断，而非页面 UI 状态
  function extractDeskMsg(rec) {
    let text = rec.text || '';
    // v3.5.150：恢复 rec.img 作为图片来源（拍一拍/换头像消息的图片照常展示）——
    // 上一版误移除；本次要改的只有通知左侧图标（见 bg-keep.js v3.5.148）
    let img = rec.img || '';
    // v3.5.157：图片子类型（sticker/image）——决定占位文案 [表情包]/[图片]。
    // 从 parts 的 sub 字段拿；纯图消息回退用 rec.type
    let imgSub = '';
    if (rec.parts && rec.parts.length) {
      const ims = rec.parts.filter(p => p.k === 'img');
      if (ims.length) {
        img = ims[0].v || '';
        imgSub = ims[0].sub || '';
      }
      const tp = rec.parts.filter(p => p.k === 'text').map(p => p.v).join(' ');
      if (tp) text = tp;
    } else if (text.indexOf('data:image/') === 0 ||
               ((rec.type === 'sticker' || rec.type === 'image') && /^https?:\/\//i.test(text))) {
      // v3.5.143：纯图片/表情包消息按内容识别（data: 前缀即图片），不依赖 type——
      // 旧数据 type 缺失时也能提取缩略图
      // v3.11.x：链接导入的表情包（http(s) 链接 + sticker/image 类型）同样按图处理，
      // 后台通知显示缩略图/[表情包] 占位而不是整段 URL；纯文字消息发链接不受影响
      img = text;
      text = '';
      imgSub = rec.type === 'sticker' ? 'sticker' : (rec.type === 'image' ? 'image' : '');
    }
    // v3.6.x：语音消息 text 格式「名称|||音频dataURL」——拆分取名称（去 mp3/mp4 等后缀），
    // 避免整段 base64 当文字显示成乱码（旧数据名称仍带后缀，一并去掉；与 renderMsg 一致）
    if (rec.type === 'voice') {
      const vname = String(text || '').split('|||')[0] || '';
      text = vname.replace(/\.[^.]+$/, '').trim() || '语音消息';
    }
    return { text: text, img: img, imgSub: imgSub };
  }
  function showDeskMsg(rec) {
    const info = extractDeskMsg(rec);
    const name = store.get('lbl-partner') || (window.taWord ? window.taWord() : 'TA');
    // v3.5.145：页面在后台 → 无论是否在聊天页都发系统通知（聊天页切后台，
    // TA 回复到达也要提醒）；showDeskPopup 内部 hidden 分支发通知
    // v3.5.157：imgSub 传给 showDeskPopup，后台通知正文据此补 [表情包]/[图片] 占位
    // v3.9.x 修复：捕获调用时的可见性状态，避免在 showDeskPopup 内部二次检查时状态已变
    const isHidden = document.visibilityState === 'hidden';
    if (isHidden) {
      showDeskPopup({ name: name, text: info.text, type: rec.type, img: info.img, imgSub: info.imgSub, isHidden: true });
      return;
    }
    // 前台：非聊天页才弹横幅（点击进聊天）；聊天页内消息已直接渲染，不弹
    if (chatVisible()) return;
    showDeskPopup({ name: name, text: info.text, type: rec.type, img: info.img, imgSub: info.imgSub, onClick: () => { if (!chatVisible()) enterChat(); }, isHidden: false });
  }
  function hideDeskMsg() {
    clearTimeout(deskMsgTimer);
    if (deskMsgCloseAnimTimer) { clearTimeout(deskMsgCloseAnimTimer); deskMsgCloseAnimTimer = null; }
    if (deskMsgRevertTimer) { clearTimeout(deskMsgRevertTimer); deskMsgRevertTimer = null; }
    deskMsgAction = null;
    if (deskMsgEl) {
      deskMsgEl.style.transition = '';
      deskMsgEl.style.transform = '';
      deskMsgEl.style.opacity = '';
      deskMsgEl.hidden = true;
    }
  }
  // 供信箱 / 朋友圈等模块复用（构建顺序：chat.js 先于 mail.js / feed.js 加载）
  window.showDeskPopup = showDeskPopup;
  window.hideDeskMsg = hideDeskMsg;

  // v3.5.106：横幅无 × 关闭按钮（v3.5.106 移除），点横幅直接进对应页面
  if (deskMsgEl) deskMsgEl.addEventListener('click', () => {
    if (deskMsgSuppressClick) { deskMsgSuppressClick = false; return; }
    const action = deskMsgAction;
    hideDeskMsg();
    if (action) action();
    else if (!chatVisible()) enterChat();
  });
  // v3.5.136：横幅右滑关闭重写为「系统通知式」交互——
  //   1) 触摸主力用原生 touch 事件（touchstart/touchmove/touchend）：比 pointer 事件
  //      在安卓 WebView / 部分 Chrome 上更稳定，配合 touch-action:pan-y 手势不丢；
  //   2) 跟手阈值 4px（仅防点击抖动，几乎无感），手指一动横幅即 1:1 跟随 + 微缩 + 淡出；
  //   3) 松手判定 = 位移 >30px **或** 甩动速度 >0.6px/ms（快速右滑即使位移不大也关闭）；
  //   4) 松手动画：关闭时平滑滑出后隐藏，未达阈值时平滑回弹（系统通知同款手感）；
  //   5) 鼠标拖拽（桌面）保留。
  let deskMsgSuppressClick = false;
  let deskMsgSuppressTimer = null;
  let dDrag = null;
  function deskMsgDragStart(cx, cy) {
    if (!deskMsgEl || deskMsgEl.hidden) return;
    dDrag = { x: cx, y: cy, moved: false, speed: 0, lastX: cx, lastT: Date.now() };
    deskMsgEl.style.transition = 'none'; // 拖拽过程中不带动画，实时跟手
  }
  function deskMsgDragMove(cx, cy) {
    if (!dDrag) return false;
    // v3.6.x：横幅已隐藏时立即放弃拖动状态——防止横幅计时关闭后 window 级
    // 事件继续拦截页面手势（iOS Safari 上表现为页面触摸滚动/点击失灵，像"卡死"）
    if (!deskMsgEl || deskMsgEl.hidden) { dDrag = null; return false; }
    const dx = cx - dDrag.x;
    const dy = cy - dDrag.y;
    // 记录滑动速度（估算最近 60ms 位移，用于甩动关闭）
    const now = Date.now();
    if (now - dDrag.lastT >= 60) {
      dDrag.speed = (cx - dDrag.lastX) / (now - dDrag.lastT);
      dDrag.lastX = cx;
      dDrag.lastT = now;
    }
    // 横向占优（dy ≤ dx×1.2，轻微斜滑仍算横向）且位移 >4px 即跟手
    if (Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      deskMsgEl.style.transform = 'translateX(' + dx + 'px) scale(' + Math.max(0.92, 1 - Math.abs(dx) / 500) + ')';
      deskMsgEl.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 140));
      dDrag.moved = true;
      return true; // 调用方据此 preventDefault，阻止浏览器手势接管
    }
    return false;
  }
  function deskMsgDragEnd(cx) {
    if (!dDrag) return;
    const dx = cx - dDrag.x;
    const wasMoved = dDrag.moved;
    const speed = dDrag.speed || 0;
    dDrag = null;
    if (!wasMoved || !deskMsgEl) return;
    // 只要有拖动，都抑制随后的 click——否则滑动松手会触发横幅点击进入页面
    deskMsgSuppressClick = true;
    clearTimeout(deskMsgSuppressTimer);
    deskMsgSuppressTimer = setTimeout(() => { deskMsgSuppressClick = false; }, 350);
    // 关闭判定：位移 >30px，或快速甩动（估算速度 >0.6px/ms）
    const shouldClose = Math.abs(dx) > 30 || Math.abs(speed) > 0.6;
    if (shouldClose) {
      deskMsgSuppressClick = false;
      clearTimeout(deskMsgSuppressTimer);
      // 平滑滑出后再隐藏（系统通知式关闭动画）
      deskMsgEl.style.transition = 'transform .18s ease, opacity .18s ease';
      deskMsgEl.style.transform = 'translateX(' + (dx >= 0 ? 160 : -160) + 'px)';
      deskMsgEl.style.opacity = '0';
      deskMsgCloseAnimTimer = setTimeout(hideDeskMsg, 180);
    } else {
      // 平滑回弹
      deskMsgEl.style.transition = 'transform .25s cubic-bezier(.25,.8,.35,1), opacity .25s ease';
      deskMsgEl.style.transform = '';
      deskMsgEl.style.opacity = '';
      deskMsgRevertTimer = setTimeout(() => { if (deskMsgEl) deskMsgEl.style.transition = ''; }, 260);
    }
  }
  if (deskMsgEl) {
    // 触摸拖拽（手机端主力路径）
    deskMsgEl.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (t) deskMsgDragStart(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!dDrag) return;
      const t = e.touches && e.touches[0];
      // 横向跟手时 preventDefault，阻止浏览器把横滑判定成滚动/手势接管
      if (t && deskMsgDragMove(t.clientX, t.clientY)) {
        try { e.preventDefault(); } catch (err) {}
      }
    }, { passive: false });
    const endTouch = (e) => {
      const c = e.changedTouches && e.changedTouches[0];
      deskMsgDragEnd(c ? c.clientX : (dDrag ? dDrag.x : 0));
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);
    // 鼠标拖拽（桌面）
    deskMsgEl.addEventListener('mousedown', (e) => deskMsgDragStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => { if (dDrag) deskMsgDragMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', (e) => deskMsgDragEnd(e.clientX));
  }
  // v3.5.103：桌面消息弹窗开关绑定（设置页回复设置-主动发送组）
  const deskMsgToggle = document.getElementById('desk-msg-en');
  if (deskMsgToggle) {
    deskMsgToggle.checked = deskMsgEnabled();
    deskMsgToggle.addEventListener('change', () => {
      try { store.set('desk-msg-en', deskMsgToggle.checked ? '1' : '0'); } catch (e) {}
    });
  }

  // 追加记录（存 + 渲染）
  function addRec(rec) {
    if (!rec.ts) rec.ts = Date.now();
    msgs.push(rec);
    saveMsgs();
    // v3.5.140：系统通知统一由 showDeskPopup 联动——聊天消息/拍一拍在非聊天页时
    // 会走 showDeskMsg → showDeskPopup，页面不在前台时由那里发系统通知；
    // 此处不再单独调用，避免同一消息发两条通知
    // v3.5.100：TA 新消息进来且聊天页未打开 → 桌面「聊天」图标未读数 +1
    // v3.6.x：换头像/拍一拍等「系统提示」也计入提醒——手机端联系人主动换头像时
    //   不在聊天页也能看到角标/横幅，而不是静默写进聊天记录
    const notable = rec.side === 'in' && (!rec.special || rec.special === 'poke' || rec.special === 'gift');
    // v3.5.145：hidden 时聊天页打开也走 showDeskMsg（其内部按可见性发系统通知）——
    // 修复「聊天页切后台后 TA 回复不弹通知」；未读计数仍只在非聊天页时 +1
    if (notable && (!chatVisible() || document.visibilityState === 'hidden')) {
      if (!chatVisible()) incChatUnread();
      // v3.5.102：非聊天页时桌面弹出新消息横幅（点击进聊天；v3.5.142 传入完整记录，
      // 文字 + 图片缩略图）；v3.5.145 后台时无论聊天页与否均触发通知
      showDeskMsg(rec);
    }
    // v3.6.x：分页渲染下窗口已满（新增后超出 RENDER_MAX）→ 重渲染窗口并贴底，
    // 避免窗口无限膨胀；否则走增量追加（renderMsg 尾部 append）
    // v3.6.x+：加贴底守卫——用户翻旧消息（renderStart>0、窗口已扩）时新消息
    // 进来不打断阅读位置，走增量追加（窗口暂时超 RENDER_MAX 无害，
    // 下次 enterChat / restore-done 合并会收紧）
    // v3.9.x：窗口收紧后强制贴底的条件与 maybeScrollChatBottom 对齐——
    // 我发送的消息（side:out）一律贴底（发送即意图看最新），TA 消息才看贴底守卫
    if (renderStart > 0 && msgs.length - renderStart > RENDER_MAX &&
        (rec.side === 'out' || chatNearBottom())) {
      renderWindow(false, true);
      scrollChatBottom();
      return body.lastElementChild;
    }
    // v3.9.x：时间分隔线样式下，新消息与上一条间隔足够大 → 插入居中时间胶囊
    maybeInsertDivider(msgs.length - 1);
    const el = renderMsg(rec);
    // v3.12.x：增量追加必须同步推进渲染窗口终点——renderEnd 只在整窗重建/上下增量
    // 加载时更新，这里不推进的话 renderEnd<msgs.length，贴底状态下下一次 scroll 事件
    // （收到消息的自动贴底/用户轻扫/发送后的补偿滚动）就会命中 loadNewerIncremental，
    // 把 [renderEnd,msgs.length) 原样重画一遍 → 同一条联系人消息/卡片出现两个气泡；
    // 我方发送常走整窗重建分支把重复冲掉，观感即"只有 TA 侧翻倍、我一发消息就恢复"。
    // 仅无缺口（renderEnd 恰指到本条之前）时直接推进；有缺口（深翻历史被裁过尾）保持
    // 不动，由 loadNewerIncremental 补画（其内部按 data-idx 跳过已渲染节点防重）。
    if (renderEnd >= msgs.length - 1) renderEnd = msgs.length;
    return el;
  }
  function addIn(text, opts) {
    opts = opts || {};
    // v3.5.60：联系人普通消息（非系统提示）播放设置的音效
    // v3.7.x：opts.silent——一轮回复/主动发送的第 2+ 条、红包感谢、决定币/Pong 回复等
    //   系统触发消息不响，避免多条连响听感"循环"及系统消息误响
    if (!opts.special && !opts.silent && window.playSfx) window.playSfx('in');
    // v3.6.x：主动发送标识——标记 initiative，渲染时气泡左上角显示小爱心
    // 注意：必须在此透传给 addRec（曾漏传导致爱心从不显示）
    return addRec({ side: 'in', text: text, initiative: opts.initiative, special: opts.special, quote: opts.quote, qidx: opts.qidx, type: opts.type, img: opts.img, parts: opts.parts, mailNotice: opts.mailNotice, askQuestion: opts.askQuestion, askStatus: opts.askStatus, askOptions: opts.askOptions, askType: opts.askType, choiceQuestion: opts.choiceQuestion, choiceOptions: opts.choiceOptions, choicePref: opts.choicePref, choiceCat: opts.choiceCat, choiceStatus: opts.choiceStatus, choiceAnswer: opts.choiceAnswer, choiceReply: opts.choiceReply, choiceMatch: opts.choiceMatch, curiousQuestion: opts.curiousQuestion, curiousQuick: opts.curiousQuick, curiousReplies: opts.curiousReplies, curiousFollowup: opts.curiousFollowup, curiousQid: opts.curiousQid, curiousCat: opts.curiousCat, curiousStatus: opts.curiousStatus, curiousAnswer: opts.curiousAnswer, curiousReply: opts.curiousReply, roastText: opts.roastText, roastCat: opts.roastCat, roastStatus: opts.roastStatus, roastAnswer: opts.roastAnswer, roastReply: opts.roastReply, rpAmount: opts.rpAmount, rpWish: opts.rpWish, rpStatus: opts.rpStatus, rpTs: opts.rpTs, rpCover: opts.rpCover });
  }
  function addOut(text) {
    return addRec({ side: 'out', text: text });
  }
  // 供头像库等外部模块追加"居中系统消息"（更换头像/拍一拍类）：
  // 即使聊天页当前关闭也会写入记录，下次进入聊天自动恢复
  // opts.img：可选，消息附带一张小头像图片（更换头像时显示新头像）
  // opts.choice*：TA 的小问题选择题数据
  // 注意：页面加载时 msgs 尚未 loadMsgs()（进入聊天才加载），
  // 写入前必须重新读取历史，否则会把空数组覆盖回 localStorage 导致聊天记录丢失
  // v3.6.x：boot 已同步加载聊天记录到内存（loadMsgs 在模块末尾调用），
  // 且 chatDbReady 未就绪时 saveMsgs 只暂存 pendingLocal 不落盘、IDB 合并会补上——
  // 这里不再每次全量 loadMsgs()（同步 JSON.parse 全量历史 + 异步 IDB 全量合并，
  // changed 时还 innerHTML='' 全量重渲染，查岗/日常/TA 模块频繁调用时反复重建
  // 整个消息列表 = 收消息卡顿来源之一）
  window.chatAddSystem = function (text, opts) {
    opts = opts || {};
    return addIn(text, { special: opts.special || 'poke', img: opts.img, mailNotice: opts.mailNotice, askQuestion: opts.askQuestion, askStatus: opts.askStatus, askOptions: opts.askOptions, askType: opts.askType, choiceQuestion: opts.choiceQuestion, choiceOptions: opts.choiceOptions, choicePref: opts.choicePref, choiceCat: opts.choiceCat, curiousQuestion: opts.curiousQuestion, curiousQuick: opts.curiousQuick, curiousReplies: opts.curiousReplies, curiousFollowup: opts.curiousFollowup, curiousQid: opts.curiousQid, curiousCat: opts.curiousCat, roastText: opts.roastText, roastCat: opts.roastCat });
  };
  // 供外部模块推送普通"联系人消息"（如查岗日常更新），持久化 + 渲染
  window.chatAddIn = function (text, opts) {
    const r = addIn(text, opts);
    if (opts && opts.enter && !chatVisible()) enterChat();
    return r;
  };
  window.chatAddGift = function (rec) { if (!rec.ts) rec.ts = Date.now(); return addRec(rec); };
  // v3.6.x：提交互动答案后立即同步写盘（不等防抖）——
  // chatChooseReply 等函数开头的 loadMsgs() 是异步读 IDB，其合并回调会在
  // 同步代码执行完后才跑，若此时 IDB 里还是旧的「未作答」数据，会触发
  // 全量重渲染把刚更新为 answered 的卡片刷回未作答（就地作答/弹窗提交都受影响）。
  // 这里立即把最新 msgs 写进 IndexedDB，让异步合并读到已作答状态。
  function saveMsgsNow() {
    const data = JSON.stringify(msgs);
    try { if (window.idbSet) window.idbSet(window.activePrefix() + ':chat-msgs', data); } catch (e) {}
    writeLsSnapshot(data);
  }

  // 回答 TA 的小问题（选择题）：更新记录 + 插入"我的选择"和 TA 回应
  // v3.7.x：第三参由「预设回应字符串」改为「选项对象 opt」——默契命中（选到TA心里想的/
  // TA喜欢的答案）时保留选项预设回应作为高光；未命中时预设回应 + 字卡库自定义字卡混合随机
  // v3.7.x：TA的小问题 通用回应变体池——选项 reply 为单条字符串时合并此池随机抽取，
  // 让"选同一答案"不再每次固定回复（用户诉求：增加联系人回应自由度）。
  // 选项 reply 为数组时直接用数组（用户在管理页自填多条），不叠加变体池。
  window.chatChooseReply = function (msgIdx, answer, opt, match) {
    // v3.6.x：不再调用 loadMsgs()——该函数是异步读 IDB，其合并回调会在同步代码
    // 执行完后用【旧 IDB 数据】全量重渲染，把刚更新为 answered 的卡片刷回未作答。
    // 这些函数只由用户在聊天页点卡片/弹窗触发，此时 msgs 已加载且为最新。
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-choose' || rec.choiceStatus === 'answered') return;
    // v3.7.x：选项 reply 支持多条（数组）——随机抽；空则纯字卡库
    const ownReplies = (function () {
      if (!opt) return [];
      if (Array.isArray(opt.reply) && opt.reply.length) return opt.reply.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
      if (typeof opt.reply === 'string' && opt.reply.trim()) return [opt.reply.trim()];
      return [];
    })();
    // v3.7.x：用户已在「系统预设字卡 → 互动回应」关闭的话术不参与抽取
    const pool = ownReplies.filter(c => !(window.isDefaultCardOff && window.isDefaultCardOff('interact', c)));
    const liked = !!(opt && (opt.liked === true || opt.liked === 'true'));
    const matched = typeof match === 'string' && match.indexOf('刚好想到在了一起') >= 0;
    let reply;
    if (matched || liked) {
      // 默契命中/心仪答案：从该选项的 reply 池随机抽（多条才自由），池空则字卡库
      reply = pool.length ? pool[Math.floor(Math.random() * pool.length)] : (window.pickAskCardReply ? window.pickAskCardReply() : '');
    } else {
      // 未命中：从该选项的 reply 池随机抽一条作预设，再 90%预设/10%字卡库 混合；池空则纯字卡库
      const preset = pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
      reply = preset ? (window.pickAskCardReply ? window.pickAskCardReply([preset]) : preset) : (window.pickAskCardReply ? window.pickAskCardReply() : '');
    }
    rec.choiceStatus = 'answered';
    rec.choiceAnswer = answer;
    rec.choiceReply = reply;
    if (match) rec.choiceMatch = match;
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    taFavCard(rec);
    // 就地更新已渲染的卡片
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + escTxt(rec.choiceQuestion || '') + '</div><div class="msg-ask-a">✓ 你选择了：' + escTxt(answer) + '</div><div class="msg-choose-r">' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(reply || '…') : (reply || '…')) + '</div>' + favHeartHtml() + '</div>';
    }
  };
  // 回答 TA 的好奇（开放式）：更新记录 + 插入"我的回答"和 TA 回应（含 30% 追问）
  window.chatCuriousReply = function (msgIdx, answer, reply, followup) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-curious' || rec.curiousStatus === 'answered') return;
    rec.curiousStatus = 'answered';
    rec.curiousAnswer = answer;
    rec.curiousReply = reply || '…';
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    if (followup) addIn(followup);
    taFavCard(rec);
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + escTxt(rec.curiousQuestion || '') + '</div><div class="msg-ask-a">✓ 你：' + escTxt(answer) + '</div><div class="msg-choose-r">' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(reply || '…') : (reply || '…')) + '</div>' + favHeartHtml() + '</div>';
    }
  };
  // 回应 TA 的吐槽：更新记录 + 插入"我的回应"和 TA 回应
  window.chatRoastReply = function (msgIdx, answer, reply) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-roast' || rec.roastStatus === 'answered') return;
    rec.roastStatus = 'answered';
    rec.roastAnswer = answer;
    rec.roastReply = reply || '…';
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(reply || '…');
    taFavCard(rec);
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-choose-card answered"><div class="msg-ask-q">' + escTxt(rec.roastText || '') + '</div><div class="msg-ask-a">✓ 你：' + escTxt(answer) + '</div><div class="msg-choose-r">' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(reply || '…') : (reply || '…')) + '</div>' + favHeartHtml() + '</div>';
    }
  };
  // 回答 TA 的询问：更新记录 + 插入"我的回答"和 TA 回复消息
  // v3.7.x：单选题选项预设的 TA 回应也参与混合——预设回应 + 字卡库自定义字卡随机；
  // 未预设或文字题时从字卡文字池挑一条（pickAskCardReply 内部同为两池混合）
  window.chatAskReply = function (msgIdx, answer, reply) {
    const rec = msgs[msgIdx];
    if (!rec || rec.special !== 'ask-card' || rec.askStatus === 'answered') return;
    rec.askStatus = 'answered';
    rec.askAnswer = answer;
    // v3.7.x：reply 支持数组（多条）——随机抽一条；字符串原样；空则不预设
    let preset = '';
    if (Array.isArray(reply) && reply.length) {
      const arr = reply.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim());
      if (arr.length) preset = arr[Math.floor(Math.random() * arr.length)];
    } else if (typeof reply === 'string' && reply.trim()) {
      preset = reply.trim();
    }
    const taReply = preset
      ? (window.pickAskCardReply ? window.pickAskCardReply([preset]) : preset)
      : (window.pickAskCardReply ? window.pickAskCardReply() : '收到你的回答。');
    rec.askReply = taReply;
    saveMsgs();
    saveMsgsNow();
    addOut(answer);
    addIn(taReply);
    taFavCard(rec);
    // 就地更新已渲染的询问卡片
    const el = body.querySelector('.msg-ask[data-idx="' + msgIdx + '"]');
    if (el) {
      el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">' + escTxt(rec.askQuestion || '') + '</div><div class="msg-ask-a">✓ 已回答：' + escTxt(answer) + '</div><div class="msg-choose-r">' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(taReply) : taReply) + '</div>' + favHeartHtml() + '</div>';
    }
    return taReply;
  };
  // 撤回：更新记录 + DOM（点击可查看原文）
  // v3.6.x：节点可能已被聊天页重渲染替换（撤回定时器持旧节点）——
  // 已分离时改用 body 中当前对应节点，避免「界面显示正常、数据却是撤回」的不一致
  function retractMsg(msgEl, side) {
    const idx = parseInt(msgEl.dataset.idx, 10);
    let target = msgEl;
    if (!msgEl.isConnected && body) {
      const cur = body.querySelector('.msg[data-idx="' + idx + '"]');
      if (cur) target = cur; else return;
    }
    const b = target.querySelector('.msg-bubble');
    if (!b) return;
    if (!isNaN(idx) && msgs[idx]) {
      msgs[idx].retracted = true;
      msgs[idx].orig = b.innerHTML;
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚撤回
      saveMsgs();
      // v3.6.x：撤回我的消息后同步 lastMineText（TA 引用/收藏不再指向已撤回内容）
      if (msgs[idx].side === 'out') syncLastMineText();
    }
    b.dataset.orig = b.innerHTML;
    b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + (side === 'out' ? '我' : '对方') + '撤回了一条消息</span>';
    bindToggle(b, side);
  }

// ★ 字卡级局部撤回（仿星言）：把消息文本拆成多个「字卡段」，
// 联系人可只撤回其中 1~3 个段，正文隐藏被撤段，下方胶囊可展开查看撤了什么
// v3.5.39 修复：不再把颜文字/表情符号切碎——
//   - 标点（。！？；\n）是明确边界，必切
//   - 空格/逗号只在「前后都是完整词（以词字符结尾/开头）」时切，
//     含内部空格的颜文字（如 "( ´･･)ﾉ(._.`)"）整体保留为一个段
//   - 段长 ≤1 的碎片并入前段，保证撤回的永远是完整字卡
function splitCardSegs(text) {
  const str = String(text || '').trim();
  if (!str) return [];
  const isWord = (ch) => /[\u4e00-\u9fffA-Za-z0-9]/.test(ch);
  const out = [];
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    // 强分隔：中文/英文句末标点、换行
    if ('。！？；\n!?;'.indexOf(ch) >= 0) {
      cur += ch;
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    // 弱分隔：空格/逗号——仅当前后都是完整词时切分
    if (ch === ' ' || ch === '，' || ch === ',') {
      const seg = cur.trim();
      const nextStart = str.slice(i + 1).trimStart()[0] || '';
      const segEnd = seg[seg.length - 1] || '';
      const canSplit = seg.length >= 2 && isWord(segEnd) && isWord(nextStart);
      if (canSplit) {
        if (seg) out.push(seg);
        cur = '';
      } else {
        cur += ch; // 并入当前段（保护颜文字/符号）
      }
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  // 碎片（≤1 字符）并入前段，避免纯符号段被单独撤回
  const filtered = [];
  out.forEach(s => {
    if (s.length <= 1 && filtered.length) filtered[filtered.length - 1] += ' ' + s;
    else filtered.push(s);
  });
  if (filtered.length < 2 && str.trim()) return [str.trim()];
  return filtered;
}
// 局部撤回：优先撤文本字卡段；文本单段则撤一条情绪/心意/意图字卡；都没有才整条撤回
function partialRetractMsg(msgEl, side) {
  const idx = parseInt(msgEl.dataset.idx, 10);
  // v3.6.x：节点可能已被重渲染替换——已分离时改用当前 body 中对应节点
  let target = msgEl;
  if (!msgEl.isConnected && body) {
    const cur = body.querySelector('.msg[data-idx="' + idx + '"]');
    if (cur) target = cur; else return;
  }
  const rec = (idx >= 0 && msgs[idx]) ? msgs[idx] : null;
  // v3.6.x：图片/表情包/语音消息不参与「字卡级局部撤回」——dataURL/base64 会被切成
  // 碎片并以文本形式露出，显示超长乱码；直接整条撤回
  if (!rec || rec.retracted || rec.parts || rec.type === 'sticker' || rec.type === 'image' || rec.type === 'voice') { retractMsg(target, side); return; }
  const segs = splitCardSegs(rec.text);
  if (segs.length > 1) {
    rec.retractedSegs = rec.retractedSegs || [];
    const remain = [];
    for (let i = 0; i < segs.length; i++) {
      if (!rec.retractedSegs.some(r => r.idx === i)) remain.push(i);
    }
    if (remain.length) {
      const n = 1 + Math.floor(Math.random() * Math.min(remain.length, 3));
      const k = Math.min(n, remain.length);
      for (let r = 0; r < k; r++) {
        const si = remain.splice(Math.floor(Math.random() * remain.length), 1)[0];
        rec.retractedSegs.push({ text: segs[si], idx: si });
      }
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚局部撤回
      saveMsgs();
      // 重建该条消息 DOM（沿用 renderMsg 渲染局部撤回样式）
      const m = renderMsg(rec);
      m.dataset.idx = idx;
      if (target.parentNode) target.parentNode.replaceChild(m, target);
      return;
    }
  }
  // 无多段文本：撤一条情绪/心意/意图字卡
  if (rec.mood && rec.mood.length) {
    rec.retractedMood = rec.retractedMood || [];
    const remain = [];
    for (let i = 0; i < rec.mood.length; i++) {
      if (rec.retractedMood.indexOf(i) < 0) remain.push(i);
    }
    if (remain.length) {
      const pick = remain[Math.floor(Math.random() * remain.length)];
      rec.retractedMood.push(pick);
      sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚局部撤回
      saveMsgs();
      const m = renderMsg(rec);
      m.dataset.idx = idx;
      if (target.parentNode) target.parentNode.replaceChild(m, target);
      return;
    }
  }
  retractMsg(target, side);
}

  // 按概率生成回复文本
  function genReplyText(c) {
    const pool = getPool();
    let reply = '', type = 'text';
    if (pool.sticker.length && hit(c['sticker-prob'])) {
      reply = pick(pool.sticker); type = 'sticker';
    } else if (pool.emoji.length && hit(c['emoji-prob'])) {
      reply = pick(pool.emoji); type = 'emoji';
    } else if (pool.image.length && hit(c['image-prob'])) {
      reply = pick(pool.image); type = 'image';
    } else if (pool.voice.length && hit(c['voice-prob'])) {
      reply = pick(pool.voice); type = 'voice';
    } else {
      reply = pick(pool.text) || '收到～';
    }
    if (type === 'text' && pool.kaomoji.length && hit(c['kaomoji-prob'])) {
      reply += ' ' + pick(pool.kaomoji);
    }
    return { text: reply, type: type };
  }

  // ---- 被动回复 ----
  function scheduleReply() {
    // v3.7.x：捕获发送时的联系人，回调执行时若已切换则放弃——否则 A 的回复会落到 B
    // 的 msgs/存储（scheduleReply 用匿名 setTimeout，contact-switched 无法 clearTimeout）
    const myCid = window.__activeCid || 'default';
    const sameCid = () => (window.__activeCid || 'default') === myCid;
    // v3.7.x：引用源在「调度时」快照，而非回调执行时再读 lastMineText——用户连发
    // 句1/句2/句3 会排多个回复轮，若执行时才读，各轮拿到的都是最后一条（引用永远
    // 指向最后一句），且多轮都命中 quote-prob 会连续引用同一条消息。改为每轮引用
    // 触发它的那条消息（句1 的回复轮引用句1，句3 的回复轮引用句3）。
    // v3.12.x：经 syncLastMineText 重扫取「文本+下标」成对快照——下标写入 TA 引用的
    // qidx，点引用块可跳回原消息；顺带保证不引用已撤回内容。
    syncLastMineText();
    const quoteSrc = lastMineText;
    const quoteSrcIdx = lastMineIdx;
    const c = cfg();
    if (hit(c['rn-prob'])) {
      setTimeout(() => { if (!sameCid()) return; addIn('', { special: 'read' }); }, randInt(1000, 4000));
      return;
    }
    const delay = (c['rs-min'] + Math.random() * Math.max(1, c['rs-max'] - c['rs-min'])) * 1000;
    // 等待回复期间显示「正在输入」
    showTyping();
    setTimeout(() => {
      if (!sameCid()) { hideTyping(); return; }
      hideTyping();
      if (hit(c['touch-prob'])) {
        performPoke();
        return;
      }
      // 回复条数（每条消息独立生成内容）
      // v3.6.x：设置页最小/最大可被调反（min>max），randInt 会得负区间导致 TA 应回的
      // 消息静默消失——此处兜底保证至少 1 条
      const rpMin = Math.max(1, Number(c['reply-min']) || 1);
      const rpMax = Math.max(rpMin, Number(c['reply-max']) || 2);
      const count = randInt(rpMin, rpMax);
      try { console.log('[mochi-reply] scheduleReply count=%s rpMin=%s rpMax=%s raw reply-min=%s reply-max=%s', count, rpMin, rpMax, c['reply-min'], c['reply-max']); window.__replyDiag = (window.__replyDiag||0)+1; window.__replyOnceDiag = 0; } catch(e){}
      // v3.7.x：一轮回复最多引用一次。引用源 quoteSrc 在本轮固定不变（TA 回复期间
      // 我没发新消息），若每条独立掷骰 hit(quote-prob) 会出现两种观感问题：
      //  ① 多条都命中 → 连续引用同一条消息发很多条；
      //  ② 全没命中 → 这一轮一条引用都没有。
      // 改为本轮整体掷骰一次：命中则只给第一条带引用（先引用再回复，更像真人），其余普通回复。
      // v3.7.x：同一内容不连续引用——lastQuotedText 记录上次实际引用过的文本，
      // 发送时再核对一次（并发回复轮交错时也能挡住），杜绝「一连引用两次句3」。
      const wantQuote = hit(c['quote-prob']) && !!quoteSrc;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (!sameCid()) return;
          hideTyping();
          const q = (wantQuote && i === 0 && quoteSrc !== lastQuotedText) ? quoteSrc : null;
          if (q) lastQuotedText = q;
          replyOnce(c, q, i > 0, q ? quoteSrcIdx : -1);
          // 还有下一条时继续显示「正在输入」
          if (i < count - 1) showTyping();
          // 最后一条回复完成后：音乐 TA 可能请求一起听歌（延后 2 秒）
          if (i === count - 1) {
            setTimeout(() => { if (!sameCid()) return; if (window.maybeMusicRequest) window.maybeMusicRequest(); }, 2000);
          }
        }, i * randInt(1200, 2800));
      }
    }, delay);
  }
  // 单条回复：生成内容 + 发送 + 收藏/情绪/撤回 附带逻辑（供普通回复与「让对方继续说」共用）
  // v3.7.x：silent——一轮多条回复时第 2+ 条不响音效（每轮只响一次）
  function replyOnce(c, quote, silent, quoteIdx) {
    try { console.log('[mochi-reply] replyOnce #%s quote=%s silent=%s', (window.__replyOnceDiag=(window.__replyOnceDiag||0)+1), !!quote, !!silent); } catch(e){}
    // v3.7.x：同 scheduleReply，回调执行时若已切联系人则放弃（防串桌面）
    const myCid = window.__activeCid || 'default';
    const sameCid = () => (window.__activeCid || 'default') === myCid;
    const rep = genOneReply(c);
    // v3.11.x：经期中 TA 的文字回复更温柔（梦角语态——period.js periodWarmText）
    if (rep && rep.type === 'text' && typeof rep.text === 'string' && window.periodWarmText) {
      try { const _w = window.periodWarmText(rep.text); if (_w) rep.text = _w; } catch (e) {}
    }
    // 引用我的消息：quote 是我发的文本，qside='out'（我发）
    const m = addIn(rep.text, { quote: quote, qside: 'out', qidx: quote ? quoteIdx : undefined, type: rep.type, parts: rep.parts, silent: silent });
    // TA 收藏夹：联系人有概率收藏我发的最新一条消息（独立于情绪系统，任何回复后判定）
    // v3.7.x：概率可调（收藏设置页），默认 30%
    const _favProbMsg = (window.favCfg ? window.favCfg().taMsg : 30);
    if (lastMineText && Math.random() * 100 < _favProbMsg) {
      const fav = getFav();
      // 同一条内容不重复收藏（已收藏过则跳过）
      if (!fav.some(f => f.side === 'out' && f.text === lastMineText)) {
        // 图片/表情按 dataURL 识别类型，避免收藏时按文本存导致显示超长乱码
        const favType = lastMineText.indexOf('data:') === 0 ? 'image' : 'text';
        // v3.10.x：组合消息一起收藏——找到对应消息的 parts（文字+图片+表情同一条气泡）
        let favParts = undefined;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const mm = msgs[i];
          if (mm && mm.side === 'out' && mm.text === lastMineText && mm.parts && mm.parts.length) { favParts = mm.parts.map(p => ({ k: p.k, v: p.v, sub: p.sub })); break; }
        }
        fav.push({ side: 'out', text: lastMineText, type: favType, ts: Date.now(), by: 'ta', parts: favParts });
        saveFav(fav);
        setTimeout(() => { if (!sameCid()) return; toast('TA 收藏了你的一条消息'); }, 1200);
      }
    }
    // 情绪系统触发链（星言完整版）：文字回复和表情包回复都会触发
    if (rep.type === 'text' || rep.type === 'sticker' || rep.type === 'image') {
      if (window.addChatCount) window.addChatCount();
      const chain = (window.triggerEmotionChain && window.triggerEmotionChain()) || null;
      if (chain && chain.length) {
        // 类型名映射：情绪 / 心意 / 交流意图
        const typeName = { mood: '情绪', heart: '心意', intent: '交流意图' };
        setTimeout(() => {
          if (!sameCid()) return;
          // 追加到主回复气泡 m 内部下方（不新增消息）
          // 所有字卡放进同一个 .msg-moods 容器：一条虚线与正文隔离，字卡紧凑同行
          const bm = m.querySelector('.msg-bubble');
          if (bm) {
            let mm = bm.querySelector('.msg-moods');
            if (!mm) {
              mm = document.createElement('div');
              mm.className = 'msg-moods';
              bm.appendChild(mm);
            }
            chain.forEach(it => {
              const tag = typeName[it.type] || '情绪';
              mm.innerHTML += '<div class="msg-mood' + (it.type === 'intent' ? ' msg-intent' : '') + '"><span class="msg-mood-tag">' + tag + '</span><span>' + it.content + '</span></div>';
            });
            // 持久化情绪字卡
            const idx2 = Number(m.dataset.idx);
            if (!isNaN(idx2) && msgs[idx2]) {
              msgs[idx2].mood = msgs[idx2].mood || [];
              chain.forEach(it => {
                msgs[idx2].mood.push({ tag: typeName[it.type] || '情绪', label: it.content });
              });
              saveMsgs();
            }
          }
        }, 500);
      }
      // 经期梦角关心：20% 概率门控防刷屏，checkCare 内部还有同日冷却+概率衰减
      if (Math.random() * 100 < 20) {
        try { window.periodCheckCare && window.periodCheckCare(); } catch (e) {}
      }
    }
    if (hit(c['rc-prob'])) {
      setTimeout(() => {
        if (!sameCid()) return;
        // ★ 字卡级局部撤回（仿星言）：多段文本/情绪卡优先局部撤回，否则整条撤回
        partialRetractMsg(m, 'in');
        if (hit(c['rc-refix'])) {
          showTyping();
          setTimeout(() => { if (!sameCid()) return; hideTyping(); replyOnce(c, null); }, 600);
        }
      }, 900);
    }
    // v3.6.x：来电挂钩——TA 回复消息后按「通话设置-来电概率」掷一次来电
    // （call.js 提供 window.callMaybeTrigger，与 maybeMusicRequest 同模式；延迟几秒更自然）
    setTimeout(() => { if (!sameCid()) return; if (window.callMaybeTrigger) window.callMaybeTrigger(); }, 3500);
    // 红包模拟器：回复完成后触发系统自动发红包（TA→我）+ pending 红包收取
    setTimeout(() => { if (!sameCid()) return; trySystemAutoSend(); tryCollectPending(); if (window.maybeAutoGift) window.maybeAutoGift(); }, 2500);
  }
  // 「让对方继续说」：cs-normal=0 理解回复（快速 0.3~1s 回 1 条）；=1 按正常回复时间（rs/reply 设置）
  // 跳过已读不回/拍一拍分支——这是"让对方继续说"，必须真说
  window.continueChat = function () {
    const myCid = window.__activeCid || 'default';
    const sameCid = () => (window.__activeCid || 'default') === myCid;
    const c = cfg();
    let delay, count;
    if (c['cs-normal'] === 1) {
      const rsMin = Math.max(1, Number(c['rs-min']) || 1);
      const rsMax = Math.max(rsMin, Number(c['rs-max']) || rsMin);
      delay = (rsMin + Math.random() * (rsMax - rsMin)) * 1000;
      const rpMin = Math.max(1, Number(c['reply-min']) || 1);
      const rpMax = Math.max(rpMin, Number(c['reply-max']) || 2);
      count = randInt(rpMin, rpMax);
    } else {
      delay = randInt(300, 1000); count = 1;
    }
    showTyping();
    setTimeout(() => {
      if (!sameCid()) { hideTyping(); return; }
      hideTyping();
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (!sameCid()) return;
          hideTyping();
          replyOnce(c, null, i > 0);
          if (i < count - 1) showTyping();
          if (i === count - 1) setTimeout(() => { if (!sameCid()) return; if (window.maybeMusicRequest) window.maybeMusicRequest(); }, 2000);
        }, i * randInt(1200, 2800));
      }
    }, delay);
  };
  // 点击顶部联系人昵称：让对方继续说（cs-trigger-name 控制是否生效）
  if (pname) {
    pname.addEventListener('click', () => {
      const c = cfg();
      if (c['cs-trigger-name'] === 1 && window.continueChat) window.continueChat();
    });
  }
  // 底部聊天栏「继续说」按钮（cs-trigger-bar 控制显隐）
  const csBtn = document.getElementById('chat-continue-btn');
  if (csBtn) csBtn.addEventListener('click', () => { if (window.continueChat) window.continueChat(); });
  // 刷新"让对方继续说"入口可见性（设置页改开关后即时生效）
  window.applyContinueSayUI = function () {
    try {
      const c = cfg();
      if (pname) pname.title = c['cs-trigger-name'] === 1 ? '点击让对方继续说' : '';
      if (csBtn) csBtn.style.display = c['cs-trigger-bar'] === 1 ? '' : 'none';
    } catch (e) {}
  };
  window.applyContinueSayUI();
  // 点击顶部联系人头像：打开查岗半框（复用 poke-card 样式）
  const pAv = document.getElementById('chat-partner-av');
  if (pAv) {
    pAv.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openCkPanel) window.openCkPanel();
    });
  }
  let lastMineText = '';
  // v3.12.x：lastMineText 对应消息的 msgs 下标——TA 引用时写入新记录的 qidx（点引用块跳回原消息）
  let lastMineIdx = -1;
  // v3.7.x：TA 上次实际引用过的文本——同内容不连续引用（防并发回复轮连续引用同一句）
  let lastQuotedText = '';
  // v3.6.x：撤回/编辑我的消息后重新扫描最后一条可见的"我"的消息，
  // 避免 TA 引用/收藏到已撤回或已编辑的旧内容
  function syncLastMineText() {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.side === 'out' && !m.retracted && typeof m.text === 'string' && m.text) {
        lastMineText = m.text;
        lastMineIdx = i;
        return;
      }
    }
    lastMineText = '';
    lastMineIdx = -1;
  }

  // 生成一条回复文本：每条消息多字卡回复命中 → 多卡空格拼接；否则单卡（默认字卡按概率混入）
  function genOneReply(c) {
    const pool = getPool();
    let t, type = 'text';
    if (c['py-en'] === 1 && hit(c['py-prob']) && pool.text.length) {
      const n = randInt(c['py-min'], c['py-max']);
      t = pickN(pool.text, n).join(' ');
    } else {
      const r = genReplyText(c);
      t = r.text;
      type = r.type;
    }
    // 图片/表情包/语音类型：直接返回（不附加文字类字卡）
    if (type === 'sticker' || type === 'image' || type === 'voice') {
      return { text: t, type: type };
    }
    // 默认字卡混入（对应星言 defaultCommon 逻辑）
    const defs = (window.getDefaultCards && window.getDefaultCards()) || null;
    if (defs && defs.type === 'text' && defs.text) {
      t = defs.text;
    }
    // 回应字卡（独立池，类似默认字卡）：开启时按概率直接使用一条回应字卡
    const replyWord = (window.getReplyCard && window.getReplyCard()) || '';
    if (replyWord) {
      t = replyWord;
    }
    // 回应连接词附着（cf-prob 命中 + 按回复特征选类）
    if (hit(c['cf-prob'])) {
      const w = (window.getFollowupWord && window.getFollowupWord(t)) || '';
      if (w) t += ' ' + w;
    }
    // 联系人也可组合发送：按概率附加 1 张表情包/图片到同一条消息（图片池来自自定义字卡媒体）
    // 表情包 → 小图 sub:'sticker'；图片 → 大图 sub:'image'
    const parts = [{ k: 'text', v: t }];
    if (hit(c['sticker-prob'] || 0)) {
      const st = (window.getMediaCards && window.getMediaCards('sticker')) || [];
      if (st.length) parts.push({ k: 'img', v: st[Math.floor(Math.random() * st.length)], sub: 'sticker' });
    } else if (hit(c['image-prob'] || 0)) {
      const im = (window.getMediaCards && window.getMediaCards('image')) || [];
      if (im.length) parts.push({ k: 'img', v: im[Math.floor(Math.random() * im.length)], sub: 'image' });
    }
    return { text: t, type: 'text', parts: parts.length > 1 ? parts : null };
  }

  // ---- 主动发送 ----
  // 只在应用加载时启动一次（不再依赖进入聊天页，且进聊天页不再重置计时器，
  // 否则用户频繁进出会导致间隔反复重置、TA 几乎从不主动发消息）
  let autoTimer = null;
  function scheduleAutoSend() {
    clearTimeout(autoTimer);
    const c = cfg();
    if (cfgn(c, 'as-en', 1) !== 1) {
      autoTimer = setTimeout(scheduleAutoSend, 30000);
      return;
    }
    // v3.6.x：异常/极端间隔值防御——真机上旧坏数据可能把 as-min/as-max 存成超大值
    // （如 99999），TA 要等几百天才发一次，用户以为"从不主动发"。NaN 由 getCfg 兜底。
    // v3.7.x：修复「设置的时间不生效」——旧实现 Math.min(30, as-min) 把用户设置的
    // 30 分钟以上「最短间隔」一律压回 30 分钟（设 60 分钟实际 30 分钟就来消息），
    // 且免打扰分支 asMin=1（秒）反而可能 1 秒就发。改为：尊重用户设置（UI 上限
    // 600 分钟），仅对超大坏数据钳制到 600 分钟；免打扰最小 30 分钟、最长 3 小时。
    let asMin = Math.min(600, Math.max(1, Number(cfgn(c, 'as-min', 5)) || 5)) * 60;
    let asMax = Math.min(600, Math.max(1, Number(cfgn(c, 'as-max', 10)) || 10)) * 60;
    if (cfgn(c, 'dnd-en', 0) === 1) { asMin = 30 * 60; asMax = 180 * 60; }
    // 设置被调反（min>max）时按最短间隔兜底
    if (asMax < asMin) asMax = asMin;
    const delay = (asMin + Math.random() * Math.max(1, asMax - asMin)) * 1000;
    autoTimer = setTimeout(() => {
      tryAutoSend();
      scheduleAutoSend();
    }, delay);
  }
  // v3.7.x：设置变更后立即重排定时器——原实现只在启动和每轮触发后重算，
  // 用户改了「主动发送概率/间隔」时，当前挂起的旧定时器（最长可能几小时）
  // 不重排，新设置要等下一轮才生效（表现为"没按设置的时间和概率来"）。
  window.rescheduleAutoSend = function () { try { scheduleAutoSend(); } catch (e) {} };
  // v3.7.x：切换联系人后按新联系人的回复设置重排（各联系人设置独立存放）
  document.addEventListener('contact-switched', function () {
    try { if (window.replyCfg) scheduleAutoSend(); } catch (e) {}
  });
  // ---- v3.9.x：联系人主动邀请（猜拳/游戏） ----
  // 命中后发一条邀请提示，typing 结束后弹窗让我同意/拒绝，同意才打开对应半框；
  // 拒绝则发一条拒绝消息。返回 true 表示本次主动发送已被邀请占用。
  // 游戏邀请在 Pong / 贪吃蛇之间随机。仅聊天页可见时触发。
  const INVITE_DECLINE = ['下次吧，现在不太想玩~', '等会儿再陪我玩好不好', '先不玩啦，待会儿再说', '现在没状态，下次一定'];
  function openInviteConfirm(title, staticText, onAccept) {
    const mask = document.getElementById('modal-mask');
    if ((mask && !mask.hidden) || !window.openModal) { onAccept(); return; }
    window.openModal(title, '', (v) => {
      if (v === '1') onAccept();
      else addOut(pick(INVITE_DECLINE));
    }, {
      noInput: true,
      lock: true,
      pills: [{ label: '同意', value: '1' }, { label: '拒绝', value: '0' }],
      staticText: staticText
    });
  }
  function tryActiveInvite(c) {
    if (!chatVisible()) return false;
    const name = chatPartnerName();
    // 猜拳邀请
    if (cfgn(c, 'ai-rps-en', 1) === 1 && hit(cfgn(c, 'ai-rps-prob', 8))) {
      addIn(name + ' 想和你猜拳，来一局？', { special: 'poke', initiative: true });
      showTyping();
      setTimeout(() => {
        hideTyping();
        openInviteConfirm(name + ' 的猜拳邀请', name + ' 邀请你猜拳，来一局？', () => openRpsPanel());
      }, randInt(700, 1400));
      return true;
    }
    // 游戏邀请（Pong / 贪吃蛇随机）
    if (cfgn(c, 'ai-game-en', 1) === 1 && hit(cfgn(c, 'ai-game-prob', 5))) {
      const isPong = Math.random() < 0.5;
      const gameName = isPong ? 'Pong' : '双人贪吃蛇';
      addIn(name + (isPong ? ' 想和你玩一局 Pong，来吗？' : ' 想和你玩双人贪吃蛇，来吗？'), { special: 'poke', initiative: true });
      showTyping();
      setTimeout(() => {
        hideTyping();
        openInviteConfirm(name + ' 的游戏邀请', name + ' 邀请你玩' + gameName + '，来吗？', () => {
          if (isPong) {
            // Pong 面板打开前关闭其他半框（openPongPanel 自身不清，参照 more-pong 的清理列表）
            const ids = ['poke-card', 'emoji-panel', 'chat-ask-panel', 'chat-search', 'chat-divine-panel', 'chat-decision-panel', 'chat-rps-panel', 'chat-rp-panel', 'chat-call-panel'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
            if (window.closeAvlib) window.closeAvlib();
            if (window.openPongPanel) window.openPongPanel();
          } else if (window.openSnakePanel) {
            window.openSnakePanel();
          }
        });
      }, randInt(700, 1400));
      return true;
    }
    return false;
  }
  // 暴露给主动发送链路（tryAutoSend）调用；同文件内其余模块/回归测试也可直接触发
  window.tryActiveInvite = tryActiveInvite;
  function tryAutoSend() {
    try {
    const c = cfg();
    try { console.log('[mochi-auto] tryAutoSend called as-en=%s as-prob=%s as-min=%s as-max=%s', cfgn(c,'as-en',1), cfgn(c,'as-prob',30), cfgn(c,'as-min',5), cfgn(c,'as-max',10)); } catch(e){}
    if (cfgn(c, 'as-en', 1) !== 1) { try { console.log('[mochi-auto] as-en OFF, skip'); } catch(e){} return; }
    // v3.5.101：概率为 0/空 时回退默认值——防止旧数据/误操作把概率存成 0 导致 TA 永不主动发送
    // v3.6.x：回退默认与回复设置默认一致（10 → 30）
    let prob = cfgn(c, 'as-prob', 30);
    if (!(prob > 0)) prob = 30;
    if (cfgn(c, 'dnd-en', 0) === 1) prob = 10;
    if (!hit(prob)) return;
    if (hit(cfgn(c, 'touch-prob', 5))) { performPoke(); return; }
    // v3.9.x：联系人主动邀请（猜拳/玩游戏）——TA 主动找你的消息按概率变成邀请：
    // 发一条邀请提示（带主动爱心标识）并打开对应半框（猜拳 / Pong / 贪吃蛇随机），
    // 取代普通主动消息；仅聊天页可见时触发（半框需要用户交互，后台触发会盖住别的页面）。
    // 概率独立于主动发送概率（as-prob 命中后再次按邀请概率掷），默认 8%/5%。
    if (tryActiveInvite(c)) return;
    // v3.9.x：TA 主动查岗——按概率发一张查岗问题卡（占用本轮主动消息，回 true 直接返回；
    // 概率/冷却/开关由 ck-question.js 判定，需开启「主动发送」与「TA 主动查岗」）
    if (window.ckQuestionTry && window.ckQuestionTry(c)) return;
    const pool = getPool();
    // 每条消息内容：主字卡/颜文字/emoji/表情包/图片 全 5 类混排（与回复一致）
    // v3.6.x：autoMsg 返回 {text, type}——之前直接返回 dataURL 字符串且 addIn 不传 type，
    //   图片/表情包会被当普通文本渲染成超长 base64 乱码
    const autoMsg = () => {
      const r = Math.random() * 100;
      if (pool.sticker.length && r < 15) return { text: pick(pool.sticker), type: 'sticker' };
      if (pool.image.length && r < 25) return { text: pick(pool.image), type: 'image' };
      if (pool.kaomoji.length && r < 40) return { text: pick(pool.kaomoji), type: 'text' };
      if (pool.emoji.length && r < 55) return { text: pick(pool.emoji), type: 'text' };
      return { text: pick(pool.text) || '在吗？', type: 'text' };
    };
    // v3.6.x：条数最少/最多调反时兜底（保证至少 1 条）
    const acMin = Math.max(1, Number(cfgn(c, 'as-count-min', 1)) || 1);
    const acMax = Math.max(acMin, Number(cfgn(c, 'as-count-max', 2)) || 2);
    const count = randInt(acMin, acMax);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        hideTyping();
        const am = autoMsg();
        // v3.6.x：主动发送标识——标记 initiative，渲染时气泡左上角显示小爱心
        const m = addIn(am.text, { type: am.type, initiative: true, silent: i > 0 });
        try { console.log('[mochi-auto] 主动发送消息: type=%s initiative=true', am.type); } catch(e){}
        if (hit(c['rc-prob'])) {
          setTimeout(() => {
            retractMsg(m, 'in');
            if (hit(c['rc-refix'])) {
              showTyping();
              setTimeout(() => { hideTyping(); addIn(pick(pool.text) || '…', { initiative: true }); }, 600);
            }
          }, 900);
        }
        // 还有下一条时继续显示「正在输入」
        if (i < count - 1) showTyping();
      }, i * randInt(900, 2600));
    }
    // v3.6.x：来电挂钩——TA 主动发完消息后按「通话设置-来电概率」掷一次来电
    // （等整批发完再加几秒缓冲，避免来电弹窗盖住刚发出去的消息）
    setTimeout(() => { if (window.callMaybeTrigger) window.callMaybeTrigger(); }, count * 2600 + 3500);
    // 红包模拟器：TA 主动发完后也触发系统红包 + pending 收取
    setTimeout(() => { trySystemAutoSend(); tryCollectPending(); if (window.maybeAutoGift) window.maybeAutoGift(); }, count * 2600 + 2500);
    } catch (e) {
      // v3.6.x：异常不杀链——原实现 tryAutoSend 抛错会阻止 scheduleAutoSend() 执行，
      // 一次异常（真机 DOM/媒体差异、字卡数据损坏等）后 TA 永久不再主动发送；
      // 记录异常并让调度继续下一周期（同时作为诊断信息暴露给开发者工具）
      try {
        const errArr = (window.__jsErrors = window.__jsErrors || []);
        errArr.push('autoSend:' + (e && e.message || e));
      } catch (x) {}
    }
  }

  // ---- 进入聊天页：恢复历史 ----
  const chatApp = document.querySelector('.app[data-app="chat"]');
  const chatPage = document.getElementById('page-chat');
  function scrollToBottom() {
    body.scrollTop = body.scrollHeight;
  }
  function enterChat() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const phoneTab = document.querySelector('.tab[data-page="page-phone"]');
    if (phoneTab) phoneTab.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    chatPage.hidden = false;
    fillAvatar('chat-user-av', 'cs-avatar-user');
    fillAvatar('chat-partner-av', 'cs-avatar-partner');
    if (window.applyChatSettings) window.applyChatSettings();
    // v3.5.100：打开聊天页即清零未读提醒（微信式）
    clearChatUnread();
    // 恢复历史消息（不打断 TA 正在输入的状态，返回时自动恢复显示）
    loadMsgs();
    // v3.6.x：分页渲染——首屏最近 RENDER_MAX 条（原全量渲染几千条卡顿数秒）
    renderWindow(false, true);
    // 定位到最新消息：立即滚 + 下一帧各补一次，
    // 避免图片/头像异步解码改变布局高度导致停在中间
    // v3.6.x：去重——原实现 rAF(→rAF) 与 setTimeout(80/400) 四重滚动效果相同，
    // 保留 rAF 双帧（等图片解码最紧的一帧）+ 单次延迟兜底，减少重复滚动
    scrollToBottom();
    if (window.requestAnimationFrame) {
      requestAnimationFrame(scrollToBottom);
      requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
    }
    setTimeout(scrollToBottom, 400);
    if (typingOn && chatVisible()) {
      typingEl.hidden = false;
      scrollChatBottom(); // typing 行占位时保持最后一条可见
    }
  }
  if (chatApp && chatPage) {
    chatApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid'))
        .some(g => g.classList.contains('editing'));
      if (editing) return;
      enterChat();
    });
  }

  // 返回桌面（不打断 TA 正在输入/发送的节奏）
  const back = document.getElementById('chat-back');
  if (back) {
    back.addEventListener('click', () => {
      const phonePage = document.getElementById('page-phone');
      if (phonePage) {
        document.querySelectorAll('.page').forEach(p => p.hidden = true);
        phonePage.hidden = false;
      }
    });
  }

  // 聊天设置：右上角三点进入，返回回聊天页
  // v3.7.x：变量名避免与上方 chat-continue-btn 的 csBtn 冲突（对方同名重复声明导致整包语法错误）
  const csOpenBtn = document.getElementById('chat-settings-btn');
  const csPage = document.getElementById('page-chat-settings');
  if (csOpenBtn && csPage) {
    csOpenBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      csPage.hidden = false;
    });
  }
  const csBack = document.getElementById('cs-back');
  if (csBack) {
    csBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      chatPage.hidden = false;
    });
  }

  // ---- 更多功能面板（顶部分类 tab：更多功能 / TA的提问，记住上次分类） ----
  const morePanel = document.getElementById('chat-more-panel');
  const moreBtn = document.getElementById('chat-more-btn');
  if (moreBtn && morePanel) {
    const moreTabFun = document.getElementById('more-tab-fun');
    const moreTabAsk = document.getElementById('more-tab-ask');
    const moreGridFun = document.getElementById('more-grid-fun');
    const moreGridAsk = document.getElementById('more-grid-ask');
    function applyMoreTab(tab) {
      const fun = tab !== 'ask';
      if (moreTabFun) moreTabFun.classList.toggle('sel', fun);
      if (moreTabAsk) moreTabAsk.classList.toggle('sel', !fun);
      if (moreGridFun) moreGridFun.hidden = !fun;
      if (moreGridAsk) moreGridAsk.hidden = fun;
      store.set('more-tab', fun ? 'fun' : 'ask');
    }
    if (moreTabFun) moreTabFun.addEventListener('click', (e) => { e.stopPropagation(); applyMoreTab('fun'); });
    if (moreTabAsk) moreTabAsk.addEventListener('click', (e) => { e.stopPropagation(); applyMoreTab('ask'); });
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 打开时停留在上次打开的分类
      if (morePanel.hidden) {
        let tab = 'fun';
        try {
          const saved = store.get('more-tab');
          if (saved === 'ask') tab = 'ask';
        } catch (err) {}
        applyMoreTab(tab);
        closeIme(); // v3.5.116：收起输入法，面板不被键盘遮挡
      }
      morePanel.hidden = !morePanel.hidden;
    });
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (!morePanel.hidden && !morePanel.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
        morePanel.hidden = true;
      }
    });
  }
  // 我方拍一拍：聊天页内浮层卡片（联系人昵称 / 我的昵称 双 tab，仿表情包面板）
  // v3.7.x：内置预设拍一拍 + 用户新增（每桌面独立）+ 字卡库【拍一拍】旧自定义字卡
  //   （按人称自动归类进两个 tab）；两个 tab 点卡片都发送"我 拍联系人"
  const pokeCard = document.getElementById('poke-card');
  const pokeList = document.getElementById('poke-list');
  const pokeClose = document.getElementById('poke-card-close');
  const pokeName = document.getElementById('poke-partner-name');
  // 内置预设拍一拍：ta=联系人昵称视角（联系人拍我），mine=我的昵称视角（我拍联系人）
  const POKE_PRESETS = {
    ta: ['拍了拍我', '戳了戳我的脸蛋', '弹了一下我的额头', '揉了揉我的头发', '捏了捏我的脸颊', '拍了拍我的肩膀'],
    mine: ['拍了拍你', '戳了戳你的脸蛋', '弹了一下你的额头', '揉了揉你的头发', '捏了捏你的脸颊', '拍了拍你的肩膀']
  };
  // 用户新增拍一拍（每桌面独立，localStorage + IndexedDB 双写，键带命名空间）
  // v3.7.x：改成分组存储 [[分组名, [字卡...]], ...]（仿我的表情包 my-emoji-groups），
  //   老版本扁平 poke-user-* 自动迁移为「我的新增」分组
  function pokeUserGroupsKey(kind) { return window.activePrefix() + ':poke-groups-' + kind; }
  function pokeUserGroupsLoad(kind) {
    try {
      const v = JSON.parse(store.get('poke-groups-' + kind) || 'null');
      if (Array.isArray(v)) return v.filter(g => Array.isArray(g) && Array.isArray(g[1]));
    } catch (e) {}
    return null;
  }
  function pokeUserGroupsSave(kind) {
    try {
      const data = JSON.stringify(pokeUserGroups[kind]);
      store.set('poke-groups-' + kind, data);
      if (window.idbSet) window.idbSet(pokeUserGroupsKey(kind), data);
    } catch (e) {}
  }
  function pokeUserGroupsInit(kind) {
    const loaded = pokeUserGroupsLoad(kind);
    if (loaded) return loaded;
    let legacy = [];
    try {
      const v = JSON.parse(store.get('poke-user-' + kind) || 'null');
      if (Array.isArray(v)) legacy = v.filter(x => typeof x === 'string' && x.trim());
    } catch (e) {}
    const g = [['我的新增', legacy]];
    try {
      store.set('poke-groups-' + kind, JSON.stringify(g));
      if (window.idbSet) window.idbSet(pokeUserGroupsKey(kind), JSON.stringify(g));
    } catch (e) {}
    return g;
  }
  const pokeUserGroups = { ta: pokeUserGroupsInit('ta'), mine: pokeUserGroupsInit('mine') };
  // IDB 恢复（配额满不丢；内容更多优先）
  (function () {
    if (!window.idbGet) return;
    ['ta', 'mine'].forEach(kind => {
      window.idbGet(pokeUserGroupsKey(kind)).then(v => {
        if (!v) return;
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr) && arr.length > pokeUserGroups[kind].length) pokeUserGroups[kind] = arr;
        } catch (e) {}
      }).catch(() => {});
    });
  })();
  // 字卡人称归类：含"你"→我方视角（我拍TA）；含"我"→联系人视角（TA拍我）；都不含→我方视角
  function pokeKindOf(card) {
    if (typeof card !== 'string') return 'mine';
    if (card.indexOf('你') >= 0) return 'mine';
    if (card.indexOf('我') >= 0) return 'ta';
    return 'mine';
  }
  // 全部拍一拍字卡（联系人自动拍一拍用）：预设 + 用户分组 + 字卡库【拍一拍】旧自定义
  function pokeAllCards() {
    const out = [];
    (POKE_PRESETS.ta || []).forEach(x => out.push(x));
    (POKE_PRESETS.mine || []).forEach(x => out.push(x));
    ['ta', 'mine'].forEach(kind => {
      (pokeUserGroups[kind] || []).forEach(g => {
        if (Array.isArray(g) && Array.isArray(g[1])) g[1].forEach(x => out.push(x));
      });
    });
    try { ((window.getPokeCards && window.getPokeCards()) || []).forEach(x => out.push(x)); } catch (e) {}
    return out;
  }
  // 拍一拍双 tab（复用表情包 .emoji-tabs/.emoji-tab 样式）+ 分组切换栏 + 工具行 + 自定义文字输入行
  // v3.6.x：JS 注入到 poke-card（模板只放静态头/列表锚点，这里与 renderPokeCard 同步）
  // v3.7.x：拍一拍面板是给用户用的——两个 tab 点卡片/输入都发送"我 拍联系人"
  //   （字卡里的"我/你"由 sendPoke 自动替换成联系人昵称），不再触发"联系人拍我"
  // v3.11.x：三分区 tab——公用拍一拍 / 联系人昵称的拍一拍（专属）/ 我的拍一拍
  let pokeMode = 'ta';            // 当前 tab：public=公用 / ta=联系人昵称的拍一拍 / mine=我的拍一拍
  let pokeCurGroup = '__preset';  // 当前选中分组（'__preset' = 预设）
  const pokeTabsRow = document.createElement('div');
  pokeTabsRow.className = 'poke-tabs-row';
  // 拍一拍多 tab 用独立 .poke-tab 类（不能用 .emoji-tab：表情包面板全局
  // document.querySelectorAll('.emoji-tab') 的监听会劫持拍一拍 tab 点击并把 sel 加回全部 tab）
  const pokeTabPub = document.createElement('button');
  pokeTabPub.className = 'poke-tab poke-tab-pub';
  pokeTabPub.type = 'button';
  pokeTabPub.dataset.ptab = 'public';
  const pokeTabTa = document.createElement('button');
  pokeTabTa.className = 'poke-tab sel poke-tab-ta';
  pokeTabTa.type = 'button';
  pokeTabTa.dataset.ptab = 'ta';
  const pokeTabMine = document.createElement('button');
  pokeTabMine.className = 'poke-tab poke-tab-mine';
  pokeTabMine.type = 'button';
  pokeTabMine.dataset.ptab = 'mine';
  pokeTabsRow.appendChild(pokeTabPub);
  pokeTabsRow.appendChild(pokeTabTa);
  pokeTabsRow.appendChild(pokeTabMine);
  // 工具行：新建分组 + 新增拍一拍（复用表情包 .emoji-tool 样式）
  const pokeToolsRow = document.createElement('div');
  pokeToolsRow.className = 'poke-tools';
  const pokeNewGroupBtn = document.createElement('button');
  pokeNewGroupBtn.className = 'emoji-tool poke-tool';
  pokeNewGroupBtn.type = 'button';
  pokeNewGroupBtn.textContent = '＋ 新建分组';
  const pokeAddBtn = document.createElement('button');
  pokeAddBtn.className = 'emoji-tool poke-tool';
  pokeAddBtn.type = 'button';
  pokeAddBtn.textContent = '＋ 新增拍一拍';
  pokeToolsRow.appendChild(pokeNewGroupBtn);
  pokeToolsRow.appendChild(pokeAddBtn);
  // 分组切换栏（chips 复用 .emoji-g-chip 样式）
  const pokeGroupsBar = document.createElement('div');
  pokeGroupsBar.className = 'poke-groups';
  const pokeInputRow = document.createElement('div');
  pokeInputRow.className = 'poke-input-row';
  const pokeInput = document.createElement('input');
  pokeInput.className = 'poke-input';
  pokeInput.type = 'text';
  pokeInput.placeholder = '输入拍一拍文字，如：拍了拍你的脸蛋';
  pokeInput.setAttribute('autocomplete', 'off');
  pokeInput.setAttribute('autocorrect', 'off');
  pokeInput.setAttribute('autocapitalize', 'off');
  pokeInput.setAttribute('spellcheck', 'false');
  const pokeInputGo = document.createElement('button');
  pokeInputGo.className = 'poke-input-go';
  pokeInputGo.type = 'button';
  pokeInputGo.textContent = '拍一拍';
  function doPokeInput() {
    const v = (pokeInput && pokeInput.value || '').trim();
    if (!v) { toast('先输入拍一拍文字'); return; }
    sendPoke(v);
    if (pokeInput) pokeInput.value = '';
    closePokeCard();
  }
  pokeInputGo.addEventListener('click', (e) => {
    e.stopPropagation();
    doPokeInput();
  });
  pokeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.stopPropagation();
      doPokeInput();
    }
  });
  pokeInputRow.appendChild(pokeInput);
  pokeInputRow.appendChild(pokeInputGo);
  if (pokeCard) {
    pokeCard.insertBefore(pokeTabsRow, pokeList);
    pokeCard.insertBefore(pokeToolsRow, pokeList);
    pokeCard.insertBefore(pokeGroupsBar, pokeList);
    pokeCard.insertBefore(pokeInputRow, pokeList);
  }
  // 发送一次拍一拍（触发联系人回复）（v3.7.x 全格式处理）
  function sendPoke(action) {
    const name = chatPartnerName();
    let text;
    if (action.indexOf('你') >= 0) {
      if (action.charAt(0) === '你') {
        // 卡面以"你"作主语（如"你拍了拍我的头"）：我方发送翻转视角 你→我(主语)、我→联系人(目标)
        text = action.replace(/^你/, '我').replace(/(?!^)我(?![们])/g, name);
      } else if (action.charAt(0) === '我') {
        // 卡面以"我"作主语且含"你"（如"我拍了拍你的头"）：我=我(主语)、你=联系人(目标)
        text = action.replace(/你(?![们])/g, name);
      } else {
        // 你=被拍对象（"拍了拍你"→"拍了拍TA"）；"你们"整体不替换
        text = '我 ' + action.replace(/你(?![们])/g, name);
      }
    } else if (action.indexOf('我') >= 0) {
      if (action.charAt(0) === '我') {
        // 卡面以"我"作主语（如"我拍了拍"）：主语保留，其余"我"(目标)换联系人
        text = '我 ' + action.slice(1).replace(/我(?![们])/g, name);
      } else {
        // "我"指被拍对象（"弹了一下我的额头"→"弹了一下TA的额头"）；"我们"整体不替换
        text = '我 ' + action.replace(/我(?![们])/g, name);
      }
    } else {
      // 中性字卡：直接"我 + 字卡"，不再末尾补联系人昵称（v3.7.x 修复：
      // 中性自述类字卡如"闷闷垂头"补昵称会变成「我 闷闷垂头 景元」）
      text = '我 ' + action;
    }
    addRec({ side: 'in', text: text, special: 'poke' });
    if (window.logFish) window.logFish();
    // 拍一拍后联系人快速响应：1-3 秒内必回复或已读不回（不等 rs 长延迟）
    setTimeout(() => {
      const c2 = cfg();
      if (hit(c2['rn-prob'])) {
        addIn('', { special: 'read' });
        return;
      }
      showTyping();
      setTimeout(() => {
        hideTyping();
        if (hit(c2['touch-prob'])) { performPoke(); return; }
        const r = genOneReply(c2);
        const m2 = addIn(r.text, { type: r.type });
        if (hit(c2['rc-prob'])) {
          setTimeout(() => { retractMsg(m2, 'in'); }, 900);
        }
      }, randInt(800, 2000));
    }, randInt(600, 1200));
  }
  // 记住最后打开的 tab + 分组（每桌面独立）
  function savePokePref() {
    try { store.set('poke-tab', pokeMode); } catch (e) {}
    try { store.set('poke-group-' + pokeMode, pokeCurGroup); } catch (e) {}
  }
  (function () {
    try {
      const p = store.get('poke-tab');
      if (p === 'mine' || p === 'public') pokeMode = p;
    } catch (e) {}
    try {
      const g = store.get('poke-group-' + pokeMode);
      if (typeof g === 'string' && g) pokeCurGroup = g;
    } catch (e) {}
  })();
  function pokeTabLabel(kind) {
    if (kind === 'public') return '公用拍一拍';
    if (kind === 'ta') {
      const n = chatPartnerName();
      return n + ' 的拍一拍';
    }
    const n = chatUserName();
    return (n === '我' ? '我的' : n + ' 的') + '拍一拍';
  }
  // 当前 tab 的分组列表 → [{key,label,cards}]
  // v3.7.x：我的拍一拍 = 预设 + 用户分组（可新增/新建分组）
  // v3.11.x：三分区——公用拍一拍 = 只读展示 公用字卡 → 拍一拍 分组；联系人昵称的
  //   拍一拍 = 只读展示 专属字卡 → 拍一拍 的分组和字卡（原样展示，不按人称归类、不混入预设/用户分组）
  function pokeTabGroups(kind) {
    const out = [];
    if (kind === 'public' || kind === 'ta') {
      let legacy = [];
      try { legacy = (window.getScopedGroups && window.getScopedGroups('poke', kind)) || []; } catch (e) {}
      legacy.forEach(g => {
        if (!Array.isArray(g) || !Array.isArray(g[1]) || !g[0]) return;
        out.push({ key: g[0], label: g[0], cards: g[1].slice() });
      });
      return out;
    }
    const presets = (POKE_PRESETS.mine || []).slice();
    out.push({ key: '__preset', label: '预设', cards: presets });
    (pokeUserGroups.mine || []).forEach(g => {
      if (!Array.isArray(g) || !Array.isArray(g[1]) || !g[0]) return;
      out.push({ key: g[0], label: g[0], cards: g[1].slice(), user: true });
    });
    return out;
  }
  function pokeCardEl(c, opts) {
    const d = document.createElement('div');
    d.className = 'cc-item glass';
    d.innerHTML = '<div class="cc-txt"><div class="t">' + c + '</div></div>';
    // 两个 tab 点卡片都发送"我 拍联系人"（sendPoke 把字卡里的"我/你"换成联系人昵称）
    d.addEventListener('click', () => { sendPoke(c); closePokeCard(); });
    // v3.7.x：我的拍一拍·用户分组字卡支持修改/删除（预设/联系人的只读，不显示按钮）
    if (opts && opts.editable) {
      const ops = document.createElement('div');
      ops.className = 'poke-card-ops';
      const eb = document.createElement('button');
      eb.type = 'button';
      eb.className = 'poke-card-op poke-op-edit';
      eb.title = '修改';
      eb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
      eb.addEventListener('click', (e) => {
        e.stopPropagation();
        pokeEditCard(opts.groupKey, opts.idx, c);
      });
      const db = document.createElement('button');
      db.type = 'button';
      db.className = 'poke-card-op poke-op-del';
      db.title = '删除';
      db.textContent = '✕';
      db.addEventListener('click', (e) => {
        e.stopPropagation();
        pokeDelCard(opts.groupKey, opts.idx, c);
      });
      ops.appendChild(eb);
      ops.appendChild(db);
      d.appendChild(ops);
    }
    return d;
  }
  // 修改/删除用户新增的拍一拍（仅我的拍一拍·用户分组；预设/联系人的只读）
  function pokeEditCard(groupKey, idx, old) {
    const groups = pokeUserGroups.mine;
    const g = groups.find(x => x[0] === groupKey);
    if (!g || !Array.isArray(g[1]) || idx < 0 || idx >= g[1].length) return;
    window.openModal('修改拍一拍', old, (v) => {
      v = (v || '').trim();
      if (!v) { toast('请输入拍一拍文字'); return; }
      const g2 = groups.find(x => x[0] === groupKey);
      if (!g2 || !Array.isArray(g2[1]) || idx < 0 || idx >= g2[1].length) return;
      if (g2[1][idx] === v) { toast('内容未变化'); return; }
      if (g2[1].indexOf(v) >= 0) { toast('该分组已有相同的拍一拍'); return; }
      g2[1][idx] = v;
      pokeUserGroupsSave('mine');
      renderPokeCard();
      toast('已修改');
    });
  }
  function pokeDelCard(groupKey, idx, c) {
    const groups = pokeUserGroups.mine;
    const g = groups.find(x => x[0] === groupKey);
    if (!g || !Array.isArray(g[1]) || idx < 0 || idx >= g[1].length) return;
    window.openModal('删除这条拍一拍？', '', () => {
      const g2 = groups.find(x => x[0] === groupKey);
      if (!g2 || !Array.isArray(g2[1]) || idx < 0 || idx >= g2[1].length) return;
      g2[1].splice(idx, 1);
      pokeUserGroupsSave('mine');
      renderPokeCard();
      toast('已删除');
    }, { noInput: true, staticText: '「' + c + '」\n\n删除后无法恢复。' });
  }
  function renderPokeGroupsBar(groups) {
    if (!pokeGroupsBar) return;
    pokeGroupsBar.innerHTML = '';
    if (!groups.some(g => g.key === pokeCurGroup)) pokeCurGroup = groups.length ? groups[0].key : '__preset';
    groups.forEach(g => {
      const c = document.createElement('span');
      c.className = 'emoji-g-chip' + (pokeCurGroup === g.key ? ' sel' : '');
      c.textContent = g.label + g.cards.length;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        pokeCurGroup = g.key;
        savePokePref();
        renderPokeCard();
      });
      pokeGroupsBar.appendChild(c);
    });
  }
  function renderPokeCard() {
    const name = chatPartnerName();
    if (pokeName) pokeName.textContent = name;
    pokeTabPub.textContent = pokeTabLabel('public');
    pokeTabTa.textContent = pokeTabLabel('ta');
    pokeTabMine.textContent = pokeTabLabel('mine');
    pokeTabPub.classList.toggle('sel', pokeMode === 'public');
    pokeTabTa.classList.toggle('sel', pokeMode === 'ta');
    pokeTabMine.classList.toggle('sel', pokeMode === 'mine');
    // v3.7.x：联系人的拍一拍 = 只读展示（隐藏新增/输入行）；我的拍一拍 = 可新增
    if (pokeToolsRow) pokeToolsRow.hidden = pokeMode !== 'mine';
    if (pokeInputRow) pokeInputRow.hidden = pokeMode !== 'mine';
    pokeInput.placeholder = '输入拍一拍文字，如：拍了拍你的脸蛋';
    const groups = pokeTabGroups(pokeMode);
    renderPokeGroupsBar(groups);
    if (!pokeList) return;
    pokeList.innerHTML = '';
    if (!groups.length) {
      pokeList.innerHTML = pokeMode === 'public'
        ? '<div class="cc-empty">暂无公用拍一拍<br>请到 字卡库 → 公用字卡 → 拍一拍 添加</div>'
        : pokeMode === 'ta'
          ? '<div class="cc-empty">暂无拍一拍字卡<br>请到 字卡库 → 专属字卡 → 拍一拍 添加</div>'
          : '<div class="cc-empty">暂无拍一拍字卡<br>点击「＋ 新增拍一拍」添加，或直接输入拍一拍文字</div>';
      return;
    }
    const cur = groups.find(g => g.key === pokeCurGroup) || groups[0];
    if (!cur.cards.length) {
      pokeList.innerHTML = pokeMode === 'public'
        ? '<div class="cc-empty">该分组暂无公用拍一拍<br>请到 字卡库 → 公用字卡 → 拍一拍 添加</div>'
        : pokeMode === 'ta'
          ? '<div class="cc-empty">该分组暂无拍一拍字卡<br>请到 字卡库 → 专属字卡 → 拍一拍 添加</div>'
          : '<div class="cc-empty">该分组暂无拍一拍<br>点击「＋ 新增拍一拍」添加到该分组</div>';
      return;
    }
    cur.cards.forEach((c, i) => {
      const editable = pokeMode === 'mine' && cur.key !== '__preset' && cur.user;
      pokeList.appendChild(pokeCardEl(c, editable ? { editable: true, groupKey: cur.key, idx: i } : null));
    });
  }
  function closePokeCard() {
    if (pokeCard) pokeCard.hidden = true;
  }
  pokeTabPub.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pokeMode !== 'public') { pokeMode = 'public'; savePokePref(); renderPokeCard(); }
  });
  pokeTabTa.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pokeMode !== 'ta') { pokeMode = 'ta'; savePokePref(); renderPokeCard(); }
  });
  pokeTabMine.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pokeMode !== 'mine') { pokeMode = 'mine'; savePokePref(); renderPokeCard(); }
  });
  pokeNewGroupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.openModal('新建拍一拍分组（当前为「' + pokeTabLabel(pokeMode) + '」）', '', (v) => {
      v = (v || '').trim();
      if (!v) { toast('请输入分组名'); return; }
      const groups = pokeUserGroups[pokeMode];
      if (groups.some(g => g[0] === v)) { toast('分组「' + v + '」已存在'); return; }
      groups.push([v, []]);
      pokeUserGroupsSave(pokeMode);
      pokeCurGroup = v;
      savePokePref();
      renderPokeCard();
      toast('已新建分组「' + v + '」');
    });
  });
  pokeAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const kind = pokeMode; // 工具行仅在我的拍一拍显示，kind 恒为 'mine'
    const groups = pokeUserGroups[kind];
    // 目标分组：当前选中的用户分组；否则第一个用户分组；都没有则新建「我的新增」
    let target = groups.find(g => g[0] === pokeCurGroup) || groups[0];
    if (!target) { target = ['我的新增', []]; groups.push(target); }
    const hint = '（将添加到「' + target[0] + '」，作为你的拍一拍）';
    window.openModal('新增拍一拍' + hint, '', (v) => {
      v = (v || '').trim();
      if (!v) { toast('请输入拍一拍文字'); return; }
      target[1].push(v);
      pokeUserGroupsSave(kind);
      pokeCurGroup = target[0];
      savePokePref();
      renderPokeCard();
      toast('已添加到「' + target[0] + '」');
    });
  });
  // 切换联系人桌面：重载该桌面的拍一拍分组 + 关闭面板
  document.addEventListener('contact-switched', function () {
    try { pokeUserGroups.ta = pokeUserGroupsInit('ta'); pokeUserGroups.mine = pokeUserGroupsInit('mine'); } catch (e) {}
    try { if (pokeCard) pokeCard.hidden = true; } catch (e) {}
  });
  const morePoke = document.getElementById('more-poke');
  if (morePoke) {
    morePoke.addEventListener('click', (e) => {
      e.stopPropagation();
      openPokeCard();
    });
  }

  // ---- 猜拳：聊天页底部半框（和联系人猜拳，联系人随机出拳，1/3 均匀）----
  const rpsPanel = document.getElementById('chat-rps-panel');
  const rpsCloseBtn = document.getElementById('chat-rps-close');
  const rpsScoreEl = document.getElementById('rps-score');
  const rpsHintEl = document.getElementById('rps-hint');
  const rpsNameEl = document.getElementById('rps-partner-name');
  function rpsReadScore() {
    try { return JSON.parse(store.get('rps-score') || '{"w":0,"l":0,"d":0}'); }
    catch (e) { return { w: 0, l: 0, d: 0 }; }
  }
  function rpsWriteScore(s) { store.set('rps-score', JSON.stringify(s)); }
  function rpsRenderScore() {
    if (!rpsScoreEl) return;
    const s = rpsReadScore();
    rpsScoreEl.textContent = '胜 ' + s.w + ' · 负 ' + s.l + ' · 平 ' + s.d;
  }
  function openRpsPanel() {
    if (!rpsPanel) return;
    const pc = document.getElementById('poke-card'); if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel'); if (ep) ep.hidden = true;
    const askP = document.getElementById('chat-ask-panel'); if (askP) closeChatAskPanel();
    const cs = document.getElementById('chat-search'); if (cs) cs.hidden = true;
    const dv = document.getElementById('chat-divine-panel'); if (dv) dv.hidden = true;
    const dp = document.getElementById('chat-decision-panel'); if (dp) dp.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    if (morePanel) morePanel.hidden = true;
    if (rpsNameEl) rpsNameEl.textContent = chatPartnerName();
    if (rpsHintEl) rpsHintEl.textContent = '选择你要出的拳';
    rpsRenderScore();
    rpsPanel.hidden = false;
  }
  function closeRpsPanel() { if (rpsPanel) rpsPanel.hidden = true; }
  // 判定胜负：0 平 / 1 我赢 / -1 我输
  function rpsJudge(a, b) {
    if (a === b) return 0;
    if ((a === 'rock' && b === 'scissors') ||
        (a === 'scissors' && b === 'paper') ||
        (a === 'paper' && b === 'rock')) return 1;
    return -1;
  }
  function sendRps(mine) {
    // 出拳后关闭半框，让用户看到聊天里的过程
    closeRpsPanel();
    // 先插入"我出了 X"的提示卡片，给用户即时反馈
    const mineName = { rock: '石头', scissors: '剪刀', paper: '布' }[mine] || '';
    addRec({ side: 'in', special: 'poke', text: '我出了 ' + mineName + '，等 TA 出拳…' });
    // TA 正在出拳：typing 动画 + 随机延迟，增加真实感
    showTyping();
    setTimeout(() => {
      hideTyping();
      // 联系人出拳纯随机（1/3 均匀），每次独立
      const ta = ['rock', 'scissors', 'paper'][Math.floor(Math.random() * 3)];
      const judge = rpsJudge(mine, ta);
      const s = rpsReadScore();
      if (judge > 0) s.w++; else if (judge < 0) s.l++; else s.d++;
      rpsWriteScore(s);
      addRec({ side: 'in', special: 'rps', rpsMine: mine, rpsTa: ta, rpsResult: judge });
      if (window.logFish) window.logFish();
    }, randInt(900, 1600));
  }
  const moreRps = document.getElementById('more-rps');
  if (moreRps) {
    moreRps.addEventListener('click', (e) => { e.stopPropagation(); openRpsPanel(); });
  }
  if (rpsCloseBtn) {
    rpsCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeRpsPanel(); });
  }
  if (rpsPanel) {
    rpsPanel.querySelectorAll('.rps-choice').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = btn.dataset.rps;
        if (v) sendRps(v);
      });
    });
  }

  // ---- 红包：聊天页底部半框（我和 TA 互发红包，情侣特殊金额 / 随机 / 七夕特别）----
  const rpPanel = document.getElementById('chat-rp-panel');
  const rpCloseBtn = document.getElementById('chat-rp-close');
  const rpNameEl = document.getElementById('rp-partner-name');
  const rpQixiTag = document.getElementById('rp-qixi-tag');
  const rpQixiSection = document.getElementById('rp-qixi-section');
  const rpRandVal = document.getElementById('rp-rand-val');
  const rpCustomInput = document.getElementById('rp-custom');
  const rpWishInput = document.getElementById('rp-wish');
  const rpSendBtn = document.getElementById('rp-send-btn');
  let rpSide = 'out';
  let rpPickedAmt = null;
  // 七夕公历日期表（农历七月初七对应的公历，2024-2030），用于"今天七夕"高亮
  const QIXI_DATES = ['2024-08-10','2025-08-29','2026-08-19','2027-08-08','2028-08-26','2029-08-15','2030-08-04'];
  function isQixiToday() {
    const d = new Date();
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return QIXI_DATES.indexOf(k) >= 0;
  }
  function openRpPanel() {
    if (!rpPanel) return;
    const pc = document.getElementById('poke-card'); if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel'); if (ep) ep.hidden = true;
    const askP = document.getElementById('chat-ask-panel'); if (askP) closeChatAskPanel();
    const cs = document.getElementById('chat-search'); if (cs) cs.hidden = true;
    const dv = document.getElementById('chat-divine-panel'); if (dv) dv.hidden = true;
    const dp = document.getElementById('chat-decision-panel'); if (dp) dp.hidden = true;
    const rpsP = document.getElementById('chat-rps-panel'); if (rpsP) rpsP.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    if (morePanel) morePanel.hidden = true;
    if (rpNameEl) rpNameEl.textContent = chatPartnerName();
    if (isQixiToday()) {
      if (rpQixiTag) rpQixiTag.hidden = false;
      if (rpQixiSection) { rpQixiSection.hidden = false; rpQixiSection.classList.add('qixi-today'); }
      if (rpWishInput) rpWishInput.placeholder = '七夕快乐';
    } else {
      if (rpQixiTag) rpQixiTag.hidden = true;
      if (rpQixiSection) { rpQixiSection.hidden = false; rpQixiSection.classList.remove('qixi-today'); }
      if (rpWishInput) rpWishInput.placeholder = '心意';
    }
    rpSide = 'out';
    rpPickedAmt = null;
    if (rpCustomInput) rpCustomInput.value = '';
    if (rpWishInput) rpWishInput.value = '';
    if (rpRandVal) rpRandVal.textContent = '';
    rpPanel.querySelectorAll('.rp-side').forEach(b => b.classList.toggle('sel', b.dataset.rpside === 'out'));
    rpPanel.querySelectorAll('.rp-amt').forEach(b => b.classList.remove('sel'));

    closeIme();
    rpRenderBalance();
    rpRenderCover();
    rpPanel.hidden = false;
  }
  function closeRpPanel() { if (rpPanel) rpPanel.hidden = true; }
  if (rpPanel) {
    rpPanel.querySelectorAll('.rp-side').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        rpSide = btn.dataset.rpside || 'out';
        rpPanel.querySelectorAll('.rp-side').forEach(b => b.classList.toggle('sel', b === btn));
      });
    });
    rpPanel.querySelectorAll('.rp-amt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = btn.dataset.rpamt;
        if (v === 'rand') {
          const r = Math.round(Math.random() * 20000 + 1) / 100;
          rpPickedAmt = r;
          if (rpRandVal) rpRandVal.textContent = '本次随机：¥' + r.toFixed(2);
          if (rpCustomInput) rpCustomInput.value = '';
          rpPanel.querySelectorAll('.rp-amt').forEach(b => b.classList.remove('sel'));
          btn.classList.add('sel');
          return;
        }
        rpPickedAmt = parseFloat(v);
        if (rpRandVal) rpRandVal.textContent = '';
        if (rpCustomInput) rpCustomInput.value = '';
        rpPanel.querySelectorAll('.rp-amt').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      });
    });
    if (rpCustomInput) {
      rpCustomInput.addEventListener('input', () => {
        rpPanel.querySelectorAll('.rp-amt').forEach(b => b.classList.remove('sel'));
        if (rpRandVal) rpRandVal.textContent = '';
      });
    }

  }
  // ---- 红包模拟器：双钱包账本 + 概率分支（系统自动发 / 退回 / 领取 / 过期）----
  // 钱包单位：分（整数计算精确）；展示用元。默认各 99999999 分（约 100 万元）
  const RP_WALLET_KEY = 'rp-wallet';
  const RP_DAILY_PREFIX = 'ml2_rp_daily_';
  const RP_EXPIRY_MS = 24 * 60 * 60 * 1000;
  const RP_SPECIAL_FEN = [520, 5200, 52000, 520000, 1314, 131400]; // 5.2/52/520/5200/13.14/1314 元
  function rpWalletGet() {
    try {
      const w = JSON.parse(store.get(RP_WALLET_KEY) || '');
      if (typeof w.myBalance === 'number' && typeof w.systemBalance === 'number') return w;
    } catch (e) {}
    return { myBalance: 99999999, systemBalance: 99999999 };
  }
  function rpWalletSet(w) { store.set(RP_WALLET_KEY, JSON.stringify(w)); }
  function rpDailyCount() {
    const k = RP_DAILY_PREFIX + new Date().toISOString().slice(0, 10);
    return Number(store.get(k)) || 0;
  }
  function rpDailyIncr() {
    const k = RP_DAILY_PREFIX + new Date().toISOString().slice(0, 10);
    store.set(k, String((Number(store.get(k)) || 0) + 1));
  }
  // 金额生成（分）：40% 特殊池 / 48% 随机小额 / 12% 随机大额
  function genRpAmount(systemBalanceFen) {
    let amt;
    if (Math.random() < 0.4) {
      amt = RP_SPECIAL_FEN[Math.floor(Math.random() * RP_SPECIAL_FEN.length)];
    } else if (Math.random() < 0.8) {
      const max = Math.min(5200000, systemBalanceFen); // 52000 元 = 5200000 分
      amt = Math.floor(Math.random() * max) + 1;
    } else {
      amt = Math.floor(Math.random() * systemBalanceFen) + 1;
    }
    return Math.min(amt, systemBalanceFen);
  }
  function rpStatusText(rec) {
    const st = rec.rpStatus || 'pending';
    if (st === 'received') return '已领取';
    if (st === 'expired') return '已过期·退回';
    if (st === 'returned') return '已退回';
    return rec.side === 'in' ? '待领取' : (window.taFit ? window.taFit('待TA领取') : '待TA领取');
  }
  function rpStatusCls(rec) {
    const st = rec.rpStatus || 'pending';
    if (st === 'received') return 'opened';
    if (st === 'expired' || st === 'returned') return 'expired';
    return '';
  }
  // 系统自动发红包（TA → 我）：回复完成后触发，每日上限 5
  // 七夕当天：触发概率翻倍（4% → 8%），且 60% 概率发七夕特别金额（¥7.77/77.77/777.77）
  function trySystemAutoSend() {
    if (rpDailyCount() >= 5) return;
    const qixi = isQixiToday();
    const baseRate = qixi ? 0.08 : 0.04;
    if (Math.random() >= baseRate) return;
    const wallet = rpWalletGet();
    if (wallet.systemBalance < 1) return;
    let amtFen, wish;
    if (qixi && Math.random() < 0.6) {
      const qixiPool = [777, 7777, 77777].filter(f => f <= wallet.systemBalance);
      if (qixiPool.length) {
        amtFen = pick(qixiPool);
        wish = pick(['七夕快乐', '七夕快乐呀', '宝宝七夕快乐', '今天七夕，给你花']);
      } else {
        amtFen = genRpAmount(wallet.systemBalance);
        wish = '七夕快乐';
      }
    } else {
      amtFen = genRpAmount(wallet.systemBalance);
      wish = pick(['心意', '给你花', '小礼物', '辛苦啦', '开心一下']);
    }
    if (amtFen < 1) return;
    wallet.systemBalance -= amtFen;
    rpWalletSet(wallet);
    rpDailyIncr();
    const amt = amtFen / 100;
    const myCid = window.__activeCid || 'default';
    setTimeout(() => {
      if ((window.__activeCid || 'default') !== myCid) return;
      addIn('', { special: 'redpacket', rpAmount: amt, rpWish: wish, rpStatus: 'pending', rpTs: Date.now(), rpCover: rpCoverGet() ? 1 : 0 });
      if (window.logFish) window.logFish();
    }, randInt(800, 2000));
  }
  // 我发红包后系统响应：20% 退回 / 70% 立即领取 / 10% pending（固定概率，不可调）
  function rpThanksMsg() {
    return pick(['谢谢亲爱的～', '收到啦❤', '嘿嘿谢谢宝宝', '爱你哟', '🥰 谢谢', '开心！谢谢～', '么么哒']);
  }
  // 领取后反馈：50% 感谢表情 / 30% 正常聊天字卡 / 20% 静默
  function rpCollectFeedback() {
    const myCid = window.__activeCid || 'default';
    const r = Math.random();
    if (r < 0.5) {
      setTimeout(() => { if ((window.__activeCid || 'default') !== myCid) return; addIn(rpThanksMsg(), { silent: true }); }, randInt(600, 1800));
    } else if (r < 0.8) {
      setTimeout(() => {
        if ((window.__activeCid || 'default') !== myCid) return;
        try {
          const c = cfg();
          const rep = genOneReply(c);
          addIn(rep.text, { type: rep.type, parts: rep.parts });
        } catch (e) {}
      }, randInt(800, 2000));
    }
  }
  function handleSendResponse(msg) {
    const idx = msgs.indexOf(msg);
    if (idx < 0) return;
    const rec = msgs[idx];
    if (!rec || rec.rpStatus !== 'pending') return;
    const myCid = window.__activeCid || 'default';
    const r = Math.random();
    const wallet = rpWalletGet();
    const amtFen = Math.round((rec.rpAmount || 0) * 100);
    if (r < 0.2) {
      rec.rpStatus = 'returned';
      wallet.myBalance += amtFen;
      rpWalletSet(wallet);
      saveMsgsNow();
      renderWindow(false, true);
      setTimeout(() => { if ((window.__activeCid || 'default') !== myCid) return; addIn('TA 退回了你的红包 ¥' + Number(rec.rpAmount || 0).toFixed(2), { special: 'poke' }); }, randInt(500, 1200));
    } else if (r < 0.9) {
      rec.rpStatus = 'received';
      rec.rpOpenedAt = Date.now();
      wallet.systemBalance += amtFen;
      rpWalletSet(wallet);
      saveMsgsNow();
      renderWindow(false, true);
      const amtTxt = '¥' + Number(rec.rpAmount || 0).toFixed(2);
      setTimeout(() => { if ((window.__activeCid || 'default') !== myCid) return; addIn('TA 领取了你的红包 ' + amtTxt, { special: 'poke' }); }, randInt(400, 1000));
      // TA 领取后发感谢表情/消息
      rpCollectFeedback();
    }
  }
  // pending 红包后续收取：回复完成后 8% 概率收走最早一个我发出的 pending 红包
  function tryCollectPending() {
    if (Math.random() >= 0.08) return;
    const idx = msgs.findIndex(m => m && m.special === 'redpacket' && m.side === 'out' && m.rpStatus === 'pending');
    if (idx < 0) return;
    const rec = msgs[idx];
    rec.rpStatus = 'received';
    rec.rpOpenedAt = Date.now();
    const wallet = rpWalletGet();
    wallet.systemBalance += Math.round((rec.rpAmount || 0) * 100);
    rpWalletSet(wallet);
    saveMsgsNow();
    renderWindow(false, true);
    const amtTxt = '¥' + Number(rec.rpAmount || 0).toFixed(2);
    const myCid = window.__activeCid || 'default';
    setTimeout(() => { if ((window.__activeCid || 'default') !== myCid) return; addIn('TA 领取了你的红包 ' + amtTxt, { special: 'poke' }); }, randInt(400, 1000));
    // TA 收取后发感谢
    rpCollectFeedback();
  }
  // 过期处理：24h 未处理 → expired + 退回
  function rpExpireCheck() {
    const now = Date.now();
    const wallet = rpWalletGet();
    let changed = false;
    for (let i = 0; i < msgs.length; i++) {
      const rec = msgs[i];
      if (rec && rec.special === 'redpacket' && rec.rpStatus === 'pending' && rec.rpTs) {
        if (now - rec.rpTs > RP_EXPIRY_MS) {
          rec.rpStatus = 'expired';
          rec.expiredAt = now;
          const amtFen = Math.round((rec.rpAmount || 0) * 100);
          if (rec.side === 'out') wallet.myBalance += amtFen;
          else wallet.systemBalance += amtFen;
          changed = true;
        }
      }
    }
    if (changed) { rpWalletSet(wallet); saveMsgsNow(); }
  }
  function rpRenderBalance() {
    const el = document.getElementById('rp-balance');
    if (!el) return;
    const w = rpWalletGet();
    el.textContent = '我的 ¥' + (w.myBalance / 100).toFixed(2) + ' · TA ¥' + (w.systemBalance / 100).toFixed(2) + ' · 点此设置金额';
  }
  // 钱包金额设置：点余额行依次弹「我的钱包」「TA 的钱包」输入（单位元，两位小数；留空 = 保持不变）
  function rpEditWallet() {
    if (!window.openModal) return;
    window.openModal('我的钱包金额（元）', (rpWalletGet().myBalance / 100).toFixed(2), (v) => {
      const s = String(v == null ? '' : v).trim();
      if (s !== '') {
        const n = parseFloat(s);
        if (isNaN(n) || n < 0) { toast('金额无效，未修改'); return; }
        const w = rpWalletGet(); w.myBalance = Math.round(n * 100); rpWalletSet(w); rpRenderBalance();
      }
      // 二级弹窗要等上一个 close 完成后再开（照 accounting.js manageCats 先例延迟 60ms）
      setTimeout(() => {
        window.openModal('TA 的钱包金额（元）', (rpWalletGet().systemBalance / 100).toFixed(2), (v2) => {
          const s2 = String(v2 == null ? '' : v2).trim();
          if (s2 === '') { toast('钱包金额未改动'); return; }
          const n2 = parseFloat(s2);
          if (isNaN(n2) || n2 < 0) { toast('金额无效，未修改'); return; }
          const w = rpWalletGet(); w.systemBalance = Math.round(n2 * 100); rpWalletSet(w); rpRenderBalance();
          toast('钱包金额已更新');
        });
      }, 60);
    });
  }
  const rpBalanceEl = document.getElementById('rp-balance');
  if (rpBalanceEl) rpBalanceEl.addEventListener('click', (e) => { e.stopPropagation(); rpEditWallet(); });

  // 红包封面预设：存 ls + idb（大键），键 {prefix}:rp-cover
  const RP_COVER_KEY = 'rp-cover';
  function rpCoverGet() { return store.get(RP_COVER_KEY) || ''; }
  function rpCoverSet(dataUrl) {
    if (dataUrl) {
      store.set(RP_COVER_KEY, dataUrl);
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + RP_COVER_KEY, dataUrl); } catch (e) {}
    } else {
      try { store.remove(RP_COVER_KEY); } catch (e) {}
      try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + RP_COVER_KEY, ''); } catch (e) {}
    }
  }
  function rpCompressCover(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, 400 / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.8));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }
  const rpCoverPreview = document.getElementById('rp-cover-preview');
  const rpCoverUploadBtn = document.getElementById('rp-cover-upload');
  const rpCoverDelBtn = document.getElementById('rp-cover-del');
  let rpCoverFileInput = null;
  function rpRenderCover() {
    const cover = rpCoverGet();
    if (cover) {
      if (rpCoverPreview) {
        rpCoverPreview.style.backgroundImage = 'url("' + cover + '")';
        const sp = rpCoverPreview.querySelector('span'); if (sp) sp.style.display = 'none';
      }
      if (rpCoverDelBtn) rpCoverDelBtn.hidden = false;
    } else {
      if (rpCoverPreview) {
        rpCoverPreview.style.backgroundImage = '';
        const sp = rpCoverPreview.querySelector('span'); if (sp) sp.style.display = '';
      }
      if (rpCoverDelBtn) rpCoverDelBtn.hidden = true;
    }
  }
  if (rpCoverUploadBtn) {
    rpCoverUploadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!rpCoverFileInput) {
        rpCoverFileInput = document.createElement('input');
        rpCoverFileInput.type = 'file';
        rpCoverFileInput.accept = 'image/*';
        rpCoverFileInput.addEventListener('change', () => {
          const f = rpCoverFileInput.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => {
            rpCompressCover(reader.result).then(data => {
              if (!data) { toast('图片处理失败'); return; }
              rpCoverSet(data);
              rpRenderCover();
              toast('封面已设置');
            });
          };
          reader.readAsDataURL(f);
          rpCoverFileInput.value = '';
        });
      }
      rpCoverFileInput.click();
    });
  }
  if (rpCoverDelBtn) {
    rpCoverDelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      rpCoverSet('');
      rpRenderCover();
      toast('已恢复默认封面');
    });
  }

  function sendRedpacket() {
    let amt = rpPickedAmt;
    if (rpCustomInput && rpCustomInput.value) {
      const cv = parseFloat(rpCustomInput.value);
      if (!isNaN(cv) && cv >= 0) amt = Math.round(cv * 100) / 100;
    }
    if (amt == null || isNaN(amt) || amt < 0) { toast('先选择或输入红包金额'); return; }
    const wish = (rpWishInput && rpWishInput.value || '').trim() || (isQixiToday() ? '七夕快乐' : '心意');
    const amtFen = Math.round(amt * 100);
    const wallet = rpWalletGet();
    if (rpSide === 'out') {
      if (amtFen > wallet.myBalance) { toast('我的余额不足'); return; }
      wallet.myBalance -= amtFen;
    } else {
      if (amtFen > wallet.systemBalance) { toast(window.taFit ? window.taFit('TA 余额不足') : 'TA 余额不足'); return; }
      wallet.systemBalance -= amtFen;
    }
    rpWalletSet(wallet);
    const cover = rpCoverGet();
    const rec = { side: rpSide, special: 'redpacket', rpAmount: amt, rpWish: wish, rpStatus: 'pending', rpTs: Date.now(), rpCover: cover ? 1 : 0 };
    addRec(rec);
    if (window.logFish) window.logFish();
    // 我发的红包 → 系统延迟响应（退回/领取/pending）
    if (rpSide === 'out') {
      setTimeout(() => handleSendResponse(rec), randInt(3000, 8000));
    }
    closeRpPanel();
  }
  if (rpSendBtn) rpSendBtn.addEventListener('click', (e) => { e.stopPropagation(); sendRedpacket(); });
  if (rpCloseBtn) rpCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeRpPanel(); });
  const moreRp = document.getElementById('more-rp');
  if (moreRp) {
    moreRp.addEventListener('click', (e) => { e.stopPropagation(); openRpPanel(); });
  }

  // ---- 占卜：聊天页底部半框（v3.5.53 露出聊天消息）----
  const chatDivinePanel = document.getElementById('chat-divine-panel');
  const chatDivineBody = document.getElementById('chat-divine-body');
  const chatDivineClose = document.getElementById('chat-divine-close');
  let chatDivineMode = 'tarot';
  let chatDivineCount = 3;
  function openChatDivine() {
    if (!chatDivinePanel) return;
    // 关闭其他底部半框
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    const askP = document.getElementById('chat-ask-panel');
    if (askP) closeChatAskPanel();
    const cs = document.getElementById('chat-search');
    if (cs) cs.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    chatDivinePanel.hidden = false;
    // v3.7.x：每次打开同步自动发送开关（每个联系人独立）并刷新历史记录
    try {
      const chatAuto = document.getElementById('div-chat-auto-send');
      if (chatAuto) chatAuto.checked = !!(window.divineAutoGet && window.divineAutoGet());
    } catch (err) {}
    try {
      const histList = document.getElementById('div-chat-history');
      if (histList && !histList.hidden && window.divineHistLoad) renderChatHistory();
    } catch (err) {}
  }
  const moreDivine = document.getElementById('more-divine');
  if (moreDivine) {
    moreDivine.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatDivine();
    });
  }
  if (chatDivineClose) chatDivineClose.addEventListener('click', (e) => { e.stopPropagation(); chatDivinePanel.hidden = true; });
  // 占卜半框：模式 / 张数切换
  if (chatDivineBody) {
    chatDivineBody.querySelectorAll('[data-chatmode]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        chatDivineMode = b.getAttribute('data-chatmode');
        chatDivineBody.querySelectorAll('[data-chatmode]').forEach(x => x.classList.toggle('sel', x === b));
        if (chatDrawCancel) { try { chatDrawCancel(); } catch (err) {} chatDrawCancel = null; }
        const drawBtn2 = document.getElementById('div-chat-draw');
        if (drawBtn2) drawBtn2.textContent = '抽牌';
        const r = document.getElementById('div-chat-result');
        if (r) r.innerHTML = '<div class="div-result-empty">点击上方按钮开始抽牌</div>';
      });
    });
    chatDivineBody.querySelectorAll('[data-chatcount]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        chatDivineCount = Number(b.getAttribute('data-chatcount'));
        chatDivineBody.querySelectorAll('[data-chatcount]').forEach(x => x.classList.toggle('sel', x === b));
        if (chatDrawCancel) { try { chatDrawCancel(); } catch (err) {} chatDrawCancel = null; }
        const drawBtn2 = document.getElementById('div-chat-draw');
        if (drawBtn2) drawBtn2.textContent = '抽牌';
        const r = document.getElementById('div-chat-result');
        if (r) r.innerHTML = '<div class="div-result-empty">点击上方按钮开始抽牌</div>';
      });
    });
    // v3.7.x：聊天半框历史记录渲染（每个联系人独立，走 divination.js 暴露的动态 store API）
    function renderChatHistory() {
      const listEl = document.getElementById('div-chat-history');
      if (!listEl) return;
      let list = [];
      try { list = (window.divineHistLoad && window.divineHistLoad()) || []; } catch (err) {}
      if (!Array.isArray(list)) list = [];
      if (!list.length) {
        listEl.innerHTML = '<div class="div-result-empty" style="padding:14px 0">暂无占卜记录</div>';
        return;
      }
      const fmt = (ts) => {
        const d = new Date(ts);
        const p = (n) => (n < 10 ? '0' + n : '' + n);
        return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
      };
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      listEl.innerHTML = list.map((h, i) =>
        '<div class="div-chat-hist-item">' +
        '<div class="div-chat-hist-q">' + (h.mode === 'tarot' ? '塔罗' : '雷诺曼') + ' · ' + h.count + ' 张' +
        (h.question ? ' · 问：' + esc(h.question) : '') + '</div>' +
        '<div class="div-chat-hist-meta">' + fmt(h.ts) + ' · ' +
        (Array.isArray(h.cards) ? h.cards.map(c => esc((c && c.name) || '') + (c && c.rev ? '(逆)' : '')).join('、') : '') +
        '</div>' +
        '<div class="div-chat-hist-acts">' +
        '<button class="div-chat-hist-view" data-hi="' + i + '">查看</button>' +
        '<button class="div-chat-hist-del" data-hi="' + i + '">删除</button>' +
        '</div></div>').join('');
      listEl.querySelectorAll('.div-chat-hist-view').forEach(b2 => b2.addEventListener('click', (e) => {
        e.stopPropagation();
        let cur = [];
        try { cur = (window.divineHistLoad && window.divineHistLoad()) || []; } catch (err) {}
        const h = cur[parseInt(b2.dataset.hi, 10)];
        if (h && Array.isArray(h.cards)) {
          const sr = document.getElementById('div-chat-result');
          if (sr) { sr.innerHTML = chatDivineResultHtml(h.cards, h.mode, h.question, h.summary || ''); bindChatCopy(sr, h.cards, h.mode, h.question, h.summary || ''); }
        }
      }));
      listEl.querySelectorAll('.div-chat-hist-del').forEach(b2 => b2.addEventListener('click', (e) => {
        e.stopPropagation();
        let cur = [];
        try { cur = (window.divineHistLoad && window.divineHistLoad()) || []; } catch (err) {}
        cur.splice(parseInt(b2.dataset.hi, 10), 1);
        if (window.divineHistSave) { try { window.divineHistSave(cur); } catch (err) {} }
        renderChatHistory();
      }));
    }
    // v3.7.x：聊天半框结果渲染（与桌面占卜页同风格）
    function chatDivineResultHtml(cards, mode, question, summary) {
      const icons = mode === 'tarot' ? (window.__TAROT_ICONS__ || {}) : (window.__LENO_ICONS__ || {});
      const labels = ((window.__MODE_LABELS__ || {})[mode] || {})[cards.length] || [];
      const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      let html = '<div class="div-spread">';
      cards.forEach((c, i) => {
        html += '<div class="div-mini">' +
          (labels[i] ? '<div class="div-mini-tag">' + labels[i] + '</div>' : '') +
          '<div class="div-card-face">' +
          '<div class="div-card-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[c.icon] || '') + '</svg></div>' +
          '<div class="div-card-name">' + esc(c.name) + (c.rev ? '（逆）' : '') + '</div>' +
          '</div>' +
          '<div class="div-card-meaning">' + esc(c.meaning) + '</div>' +
          '</div>';
      });
      html += '</div>';
      if (summary) html += '<div class="div-summary">' + esc(summary) + '</div>';
      if (question) html += '<div class="div-card-meaning" style="opacity:.6;text-align:center;margin-top:8px">问：' + esc(question) + '</div>';
      // v3.9.x：聊天半框结果下方「点击复制文字」——复制完整结果文字
      html += '<div class="div-result-actions"><button class="div-copy-btn" id="div-chat-copy-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;vertical-align:-3px;margin-right:6px"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>点击复制文字</button></div>';
      return html;
    }
    // v3.9.x：给聊天半框结果区绑定「点击复制文字」（复用 divination.js 复制的完整结果文字）
    function bindChatCopy(el, cards, mode, question, summary) {
      const b = el && el.querySelector && el.querySelector('#div-chat-copy-btn');
      if (!b) return;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.divineCopyResultText && window.divineBuildResultText) {
          window.divineCopyResultText(window.divineBuildResultText(mode, cards, summary, question));
        }
      });
    }
    // v3.7.x：自动发送开关（每个联系人独立）
    const chatAuto = document.getElementById('div-chat-auto-send');
    if (chatAuto) {
      chatAuto.addEventListener('change', () => {
        if (window.divineAutoSet) window.divineAutoSet(chatAuto.checked);
      });
    }
    // v3.9.x：问题输入框右侧「✕ 一键清空」（contenteditable ghost 兼容，与桌面页一致）
    chatDivineBody.querySelectorAll('.dec-inp-clear').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ta = document.getElementById(btn.dataset.clear);
        if (!ta) return;
        const box = ta.__ceBox;
        if (box) box.textContent = '';
        else ta.value = '';
        ta.focus();
        toast('已清空');
      });
    });
    // v3.7.x：历史记录展开/收起 + 清空
    const histToggle = document.getElementById('div-chat-hist-toggle');
    if (histToggle) {
      histToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const listEl = document.getElementById('div-chat-history');
        if (!listEl) return;
        const show = listEl.hidden;
        listEl.hidden = !show;
        histToggle.textContent = show ? '📜 占卜记录 ▴' : '📜 占卜记录 ▾';
        if (show) renderChatHistory();
      });
    }
    const histClear = document.getElementById('div-chat-hist-clear');
    if (histClear) {
      histClear.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.openModal) {
          window.openModal('清空本桌面的全部占卜记录？（不可恢复）', '', () => {
            if (window.divineHistSave) { try { window.divineHistSave([]); } catch (err) {} }
            renderChatHistory();
            toast('占卜记录已清空');
          });
        }
      });
    }
    const divDraw = document.getElementById('div-chat-draw');
    let chatDrawCancel = null;
    if (divDraw) {
      const divDrawIdleHTML = divDraw.innerHTML;
      divDraw.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = document.getElementById('div-chat-result');
        if (!r) return;
        // v3.8.x：重新抽牌状态（上轮结果已展示）→ 只清空结果区、恢复「抽牌」按钮，
        // 回到待抽牌状态；保留用户已输入的问题（不擅自清空输入框），用户可自行修改
        // 后再点一次开始抽牌；不再直接带旧问题开抽
        if (divDraw.textContent.indexOf('重新抽牌') !== -1) {
          if (chatDrawCancel) { try { chatDrawCancel(); } catch (err) {} chatDrawCancel = null; }
          r.innerHTML = '<div class="div-result-empty">点击上方按钮开始抽牌</div>';
          divDraw.innerHTML = divDrawIdleHTML;
          return;
        }
        // 连点/进行中：先取消进行中的流程
        if (chatDrawCancel) { try { chatDrawCancel(); } catch (err) {} chatDrawCancel = null; }
        const question = (document.getElementById('div-chat-question') || {}).value || '';
        const snapMode = chatDivineMode, snapCount = chatDivineCount;
        const deck = snapMode === 'tarot' ? (window.__TAROT__ || []) : (window.__LENO__ || []);
        if (!window.startDivineDraw || !deck.length) { r.innerHTML = '<div class="div-result-empty">占卜牌库加载中…</div>'; return; }
        divDraw.textContent = '抽牌中…';
        chatDrawCancel = window.startDivineDraw(r, {
          deck: deck,
          count: snapCount,
          labels: ((window.__MODE_LABELS__ || {})[snapMode] || {})[snapCount] || [],
          tarot: snapMode === 'tarot',
          onDone: (cards) => {
            chatDrawCancel = null;
            divDraw.textContent = '重新抽牌';
            const summary = (window.divineBuildSummary && window.divineBuildSummary(cards, snapMode, question)) || '';
            r.innerHTML = chatDivineResultHtml(cards, snapMode, question, summary);
            bindChatCopy(r, cards, snapMode, question, summary);
            // v3.7.x：自动发送开关——开启后抽牌完成自动把结果发到聊天
            // 置于历史保存之前执行：发送不依赖历史渲染结果，互不阻塞
            if (window.divineAutoGet && window.divineAutoGet() && window.divineSendResult) {
              setTimeout(() => { try { window.divineSendResult(snapMode, cards, summary, question); } catch (err) {} }, 600);
            }
            // v3.7.x：保存记录（每个联系人桌面独立）
            if (window.divineHistSave && window.divineHistLoad) {
              try {
                const list = window.divineHistLoad();
                if (!Array.isArray(list)) { if (window.divineHistSave) window.divineHistSave([]); }
                else {
                  list.unshift({ ts: Date.now(), mode: snapMode, count: snapCount, question: question, cards: cards, summary: summary });
                  window.divineHistSave(list);
                }
              } catch (err) {}
              try { renderChatHistory(); } catch (err) {
                try { if (window.__jsErrors) window.__jsErrors.push('divineHist: ' + (err && err.message)); } catch (e2) {}
              }
            }
          }
        });
      });
    }
  }

  // ---- TA的提问：4 个"让TA现在…"按钮（TA的询问/小问题/好奇/吐槽） ----
  function bindTaNow(id, fn) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (morePanel) morePanel.hidden = true;
        if (fn) fn();
      });
    }
  }
  bindTaNow('more-ask-now', () => { if (window.triggerTaAskNow) window.triggerTaAskNow(); });
  bindTaNow('more-choose-now', () => { if (window.triggerTaChooseNow) window.triggerTaChooseNow(); });
  bindTaNow('more-curious-now', () => { if (window.triggerTaCuriousNow) window.triggerTaCuriousNow(); });
  bindTaNow('more-roast-now', () => { if (window.triggerTaRoastNow) window.triggerTaRoastNow(); });

  // ---- 帮我决定：聊天页底部半框（v3.5.53 露出聊天消息）----
  const moreDecide = document.getElementById('more-decide');
  if (moreDecide) {
    moreDecide.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      if (window.openDecision) {
        // 关闭其他底部半框，再打开帮我决定
        const pc = document.getElementById('poke-card');
        if (pc) pc.hidden = true;
        const ep = document.getElementById('emoji-panel');
        if (ep) ep.hidden = true;
        const askP = document.getElementById('chat-ask-panel');
        if (askP) closeChatAskPanel();
        const cs = document.getElementById('chat-search');
        if (cs) cs.hidden = true;
        const dv = document.getElementById('chat-divine-panel');
        if (dv) dv.hidden = true;
        if (window.closeAvlib) window.closeAvlib();
        window.openDecision();
      } else toast('帮我决定加载失败');
    });
  }
  const chatDecisionClose = document.getElementById('chat-decision-close');
  if (chatDecisionClose) {
    chatDecisionClose.addEventListener('click', (e) => {
      e.stopPropagation();
      const dp = document.getElementById('chat-decision-panel');
      if (dp) dp.hidden = true;
    });
  }

  // ---- 邀请TA / 问问TA 触发后随机追加 4 类提问卡片（v3.5.33）----
  // TA 回应后，有 35% 概率顺带触发 询问/小问题/好奇/吐槽 之一（卡片发送到聊天，尊重各自弹窗开关）
  function maybeFollowupAskCard() {
    if (Math.random() >= 0.35) return;
    const roll = Math.random();
    try {
      if (roll < 0.25 && window.triggerTaAskNow) { window.triggerTaAskNow(); return; }
      if (roll < 0.5 && window.triggerTaChooseNow) { window.triggerTaChooseNow(); return; }
      if (roll < 0.75 && window.triggerTaCuriousNow) { window.triggerTaCuriousNow(); return; }
      if (window.triggerTaRoastNow) window.triggerTaRoastNow();
    } catch (e) {}
  }

  // ---- 邀请TA / 问问TA：聊天页内嵌半框（v3.5.52 露出聊天消息，星言式）----
  // 半框内输入 → 发送邀请/提问卡片 → TA 必回应（接受/拒绝/未回应 或 回答），记录历史
  const chatAskPanel = document.getElementById('chat-ask-panel');
  const chatAskTitle = document.getElementById('chat-ask-title');
  const chatAskInput = document.getElementById('chat-ask-input');
  const chatAskOk = document.getElementById('chat-ask-ok');
  const chatAskCancel = document.getElementById('chat-ask-cancel');
  const chatAskClose = document.getElementById('chat-ask-close');
  let chatAskMode = 'invite'; // invite / ask
  let chatAskType = 'text'; // ask 模式回复类型：text 文字回复 / single 单选题
  // v3.6.x：问问TA 回复类型选择（文字回复/单选题）——注入到半框（不手改 template.html），
  // 单选时显示选项输入框（每行一个，可写 选项~TA回应）；安卓下由 mobile-adapt 转 ce-box，
  // 读写/显隐仍走原 textarea（value 代理 + hidden 同步），与 ta-ask 管理页选项框同款处理
  function ensureChatAskTypeRow() {
    if (!chatAskPanel || chatAskPanel.querySelector('.chat-ask-type')) return;
    const askBody = chatAskPanel.querySelector('.chat-ask-body');
    if (!askBody) return;
    const typeRow = document.createElement('div');
    typeRow.className = 'chat-ask-type';
    typeRow.hidden = true;
    typeRow.innerHTML =
      '<button class="chat-ask-type-btn sel" data-atype="text">文字回复</button>' +
      '<button class="chat-ask-type-btn" data-atype="single">单选题</button>';
    const opts = document.createElement('textarea');
    opts.id = 'chat-ask-opts';
    opts.className = 'chat-ask-opts';
    opts.rows = 3;
    opts.placeholder = '单选题选项：每行一个；可写 选项~TA回应，TA会选一个并用该回应回复';
    opts.hidden = true;
    const actions = askBody.querySelector('.chat-ask-actions');
    if (actions) { askBody.insertBefore(typeRow, actions); askBody.insertBefore(opts, actions); }
    else { askBody.appendChild(typeRow); askBody.appendChild(opts); }
    const syncOptsHidden = () => {
      const show = chatAskType === 'single';
      opts.hidden = !show;
      // ce-box 转换后显隐跟随（转换器自身 MutationObserver 已同步，这里兜底双写）
      if (opts.__ceBox) opts.__ceBox.style.display = show ? 'block' : 'none';
      else if (opts.previousElementSibling && opts.previousElementSibling.classList && opts.previousElementSibling.classList.contains('ce-box')) opts.previousElementSibling.style.display = show ? 'block' : 'none';
      // v3.7.x：与主输入框同款——单选选项框显示期间内联 translateZ(0) 建独立
      // 合成层，防安卓键盘弹出时 fixed 半框内文字错位；隐藏时清除
      const obox = opts.__ceBox || (opts.previousElementSibling && opts.previousElementSibling.classList && opts.previousElementSibling.classList.contains('ce-box') ? opts.previousElementSibling : opts);
      try { obox.style.transform = show ? 'translateZ(0)' : ''; } catch (e) {}
    };
    typeRow.querySelectorAll('.chat-ask-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chatAskType = btn.dataset.atype === 'single' ? 'single' : 'text';
        typeRow.querySelectorAll('.chat-ask-type-btn').forEach(b => b.classList.toggle('sel', b === btn));
        syncOptsHidden();
        // v3.7.x：切换类型后选项框显隐使 fixed 半框高度变化，主输入框合成层
        // 仍锁在旧视口位置 → 输入文字停在旧位置、显示在输入栏外。此处重建
        // 合成层（移除 transform → reflow → 重新 translateZ(0)），与键盘动画
        // 结束时的 refresh 同款处理，浏览器按新布局位置重新合成
        askBoxes().forEach(({ box }) => {
          try {
            box.style.transform = '';
            void box.offsetHeight;
            box.style.transform = 'translateZ(0)';
          } catch (e) {}
        });
      });
    });
  }
  function resetChatAskType() {
    chatAskType = 'text';
    const typeRow = chatAskPanel ? chatAskPanel.querySelector('.chat-ask-type') : null;
    if (typeRow) {
      typeRow.hidden = chatAskMode !== 'ask';
      typeRow.querySelectorAll('.chat-ask-type-btn').forEach(b => b.classList.toggle('sel', b.dataset.atype === 'text'));
    }
    const opts = document.getElementById('chat-ask-opts');
    if (opts) {
      opts.hidden = true;
      if (opts.__ceBox) opts.__ceBox.style.display = 'none';
      else if (opts.previousElementSibling && opts.previousElementSibling.classList && opts.previousElementSibling.classList.contains('ce-box')) opts.previousElementSibling.style.display = 'none';
    }
  }
  // v3.7.x：半框输入框合成层修复（防安卓键盘弹出时 fixed 半框上移、文字停在
  // 旧位置"飞出输入栏"）——三管齐下：
  //  1. 面板打开立即内联 translateZ(0)+will-change（不等聚焦延迟，合成层先建好）
  //  2. 键盘弹出/收起动画由 visualViewport resize 驱动，动画结束后强制移除→reflow→
  //     重建合成层，浏览器按动画后的新布局位置重新合成，文本不再错位
  //  3. CSS :focus 同名规则兜底（部分 IME/焦点状态下 :focus 不匹配时靠内联样式）
  function askBoxes() {
    const arr = [chatAskInput, document.getElementById('chat-ask-opts')];
    return arr.filter(Boolean).map(el => ({ inp: el, box: el.__ceBox || el }));
  }
  function applyAskComposeLayers() {
    askBoxes().forEach(({ box }) => {
      try { box.style.transform = 'translateZ(0)'; box.style.willChange = 'transform'; } catch (e) {}
    });
  }
  function clearAskComposeLayers() {
    askBoxes().forEach(({ box }) => {
      try { box.style.transform = ''; box.style.willChange = ''; } catch (e) {}
    });
  }
  let askKbRefreshStop = null;
  function startAskKbRefresh() {
    if (askKbRefreshStop) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let t = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        // 键盘动画结束（resize 停止 160ms）→ 按当前布局位置重建合成层
        askBoxes().forEach(({ box }) => {
          try {
            box.style.transform = '';
            void box.offsetHeight; // 强制 reflow，浏览器按新位置重建合成层
            box.style.transform = 'translateZ(0)';
          } catch (e) {}
        });
      }, 160);
    };
    // v3.9.x：只监听 resize（键盘开合高度变化）——vv.scroll 是打字时 caret 微滚触发，
    //   高频调用 refresh 会每 160ms 强制 reflow（void offsetHeight）→ 半框输入打字
    //   周期性闪屏/卡顿（iOS Safari 复现，与主输入栏 mobile-adapt syncIosKb 同病）。
    //   合成层错位只发生在键盘弹出/收起位置突变时，由 resize 驱动，scroll 无需处理。
    vv.addEventListener('resize', refresh);
    askKbRefreshStop = () => {
      if (t) clearTimeout(t);
      t = null;
      vv.removeEventListener('resize', refresh);
      askKbRefreshStop = null;
    };
  }
  function openChatAskPanel(mode) {
    if (!chatAskPanel) return;
    chatAskMode = mode || 'invite';
    ensureChatAskTypeRow();
    resetChatAskType();
    if (chatAskTitle) chatAskTitle.textContent = chatAskMode === 'invite' ? '邀请TA' : '问问TA';
    if (chatAskInput) {
      chatAskInput.placeholder = chatAskMode === 'invite' ? '想邀请TA做什么？' : '你的问题？';
      chatAskInput.value = '';
    }
    // 关闭其他底部半框
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    chatAskPanel.hidden = false;
    closeIme(); // v3.5.116：收起输入法，半框完整不被键盘遮挡
    // v3.7.x：立即建合成层 + 监听键盘动画刷新（不等聚焦延迟，防文字停在旧位置）
    applyAskComposeLayers();
    startAskKbRefresh();
    setTimeout(() => {
      if (!chatAskInput) return;
      chatAskInput.focus();
    }, 80);
  }
  function closeChatAskPanel() {
    // v3.7.x：停止键盘监听、清除合成层标记（防下次打开残留）
    if (askKbRefreshStop) { try { askKbRefreshStop(); } catch (e) {} }
    clearAskComposeLayers();
    if (chatAskPanel) chatAskPanel.hidden = true;
  }
  function submitChatAsk() {
    if (!chatAskInput) return;
    const content = (chatAskInput.value || '').trim();
    if (!content) { toast('请输入内容'); return; }
    // v3.6.x：单选题选项在收起半框前读取——安卓 contenteditable 转换（ce-box）下
    // 面板隐藏后 innerText 读不到换行/内容，会把多行选项并成一行
    let askOpts = null;
    if (chatAskMode === 'ask' && chatAskType === 'single') {
      const optsEl = document.getElementById('chat-ask-opts');
      askOpts = String(optsEl ? optsEl.value || '' : '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
        const i = line.indexOf('~');
        return i >= 0 ? { t: line.slice(0, i).trim(), reply: line.slice(i + 1).trim() } : { t: line, reply: '' };
      });
      if (!askOpts.length) { toast('单选题请填写选项，每行一个'); return; }
    }
    closeChatAskPanel();
    if (chatAskMode === 'invite') {
      // 我的邀请：居中卡片（等待状态）
      addRec({ side: 'out', text: '邀请：' + content, special: 'invite', inviteContent: content, inviteStatus: 'pending' });
      const inviteIdx = msgs.length - 1;
      if (window.logFish) window.logFish();
      const histKey = 'invite-ask-history';
      const recTs = Date.now();
      // v3.7.x：捕获提交时联系人，回调执行时若已切换则放弃——否则 A 的邀请回应/历史串到 B
      const myCid = window.__activeCid || 'default';
      const sameCid = () => (window.__activeCid || 'default') === myCid;
      setTimeout(() => {
        if (!sameCid()) return;
        const roll = Math.random();
        const name = chatPartnerName();
        let status, answer, reply = null;
        if (roll < 0.6) {
          status = '接受';
          answer = name + ' 接受了你的邀请';
          // v3.7.x：接受话术池与「系统预设字卡 → 互动回应」tab 同源（getInteractPool），
          // 数据缺失时回退内置话术；pickAskCardReply 内部过滤已关闭的话术
          const pool = window.getInteractPool
            ? window.getInteractPool('邀请TA·接受', ['好，我答应你。', '可以呀。', '我陪你。', '走吧。', '嗯，陪你。'])
            : ['好，我答应你。', '可以呀。', '我陪你。', '走吧。', '嗯，陪你。'];
          // v3.7.x：接受话术池 + 字卡库自定义字卡 混合随机
          reply = (window.pickAskCardReply ? window.pickAskCardReply(pool) : pool[Math.floor(Math.random() * pool.length)]);
          setTimeout(() => { if (!sameCid()) return; addIn(reply); }, 800);
        } else if (roll < 0.85) {
          status = '拒绝';
          answer = name + ' 拒绝了你的邀请';
          // v3.7.x：拒绝话术池与「系统预设字卡 → 互动回应」tab 同源（getInteractPool），
          // 数据缺失时回退内置话术；pickAskCardReply 内部过滤已关闭的话术
          const pool = window.getInteractPool
            ? window.getInteractPool('邀请TA·拒绝', ['这次不行。', '下次吧。', '抱歉。', '今天不方便。'])
            : ['这次不行。', '下次吧。', '抱歉。', '今天不方便。'];
          // v3.7.x：拒绝话术池 + 字卡库自定义字卡 混合随机
          reply = (window.pickAskCardReply ? window.pickAskCardReply(pool) : pool[Math.floor(Math.random() * pool.length)]);
          setTimeout(() => { if (!sameCid()) return; addIn(reply); }, 800);
        } else {
          status = '未回应';
          answer = name + ' 暂时没有回应';
        }
        const rec = msgs[inviteIdx];
        if (rec && rec.special === 'invite') {
          rec.inviteStatus = 'answered';
          rec.inviteAnswer = answer;
          saveMsgs();
          taFavCard(rec);
          const el = body.querySelector('.msg-ask[data-idx="' + inviteIdx + '"]');
          if (el) {
            el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">' + (window.taFit ? window.taFit('邀请TA') : '邀请TA') + ' · ' + escTxt(content) + '</div><div class="msg-ask-a">✓ ' + escTxt(window.taFit ? window.taFit(answer) : answer) + '</div>' + favHeartHtml() + '</div>';
          }
        }
        try {
          const list = JSON.parse(store.get(histKey) || '[]');
          list.unshift({ type: 'invite', q: content, a: reply || status, ts: recTs });
          if (list.length > 200) list.length = 200;
          store.set(histKey, JSON.stringify(list));
        } catch (err) {}
        if (window.renderAskRecords) window.renderAskRecords();
        setTimeout(() => { if (!sameCid()) return; maybeFollowupAskCard(); }, 1200);
      }, 1500 + Math.random() * 2500);
    } else {
      // 问问TA
      // v3.6.x：回复类型——单选题选项已在收起半框前解析（askOpts，每行一个，
      // 可写 选项~TA回应）；v3.7.x：发送后 TA 随机选一个选项、只用选项文字作答，
      // 各选项预设回应保留在卡片里（点击已作答卡片展开可查看）
      const isSingle = !!askOpts;
      addRec({ side: 'out', text: '问：' + content, special: 'ask', askQuestion: content, askType: isSingle ? 'single' : 'text', askOptions: askOpts, askStatus: 'pending' });
      const askIdx = msgs.length - 1;
      if (window.logFish) window.logFish();
      const recTs = Date.now();
      const myCid = window.__activeCid || 'default';
      const sameCid = () => (window.__activeCid || 'default') === myCid;
      setTimeout(() => {
        if (!sameCid()) return;
        // v3.7.x：文字题话术池与「系统预设字卡 → 互动回应」tab 同源（getInteractPool），
        // 数据缺失时回退内置话术；pickAskCardReply 内部过滤已关闭的话术
        const defs = window.getInteractPool
          ? window.getInteractPool('问问TA·回应', ['嗯嗯', '我想想…', '应该吧', '好呀', '我陪你', '可以的', '那挺好呀', '我觉得可以', '听你的', '当然可以', '我很乐意'])
          : ['嗯嗯', '我想想…', '应该吧', '好呀', '我陪你', '可以的', '那挺好呀', '我觉得可以', '听你的', '当然可以', '我很乐意'];
        let text;
        if (isSingle && askOpts && askOpts.length) {
          const o = askOpts[Math.floor(Math.random() * askOpts.length)];
          // v3.7.x：单选题 TA 只能用选项作答——选项预设回应不再作为聊天回复消息，
          // 保留在选项数据里，点击已作答卡片展开可查看（选项+各自预设回应）
          text = o.t;
        } else {
          // v3.7.x：固定话术池 + 字卡库自定义字卡 混合随机
          text = (window.pickAskCardReply ? window.pickAskCardReply(defs) : defs[Math.floor(Math.random() * defs.length)]);
        }
        const rec = msgs[askIdx];
        if (rec && rec.special === 'ask') {
          rec.askStatus = 'answered';
          rec.askAnswer = text;
          saveMsgs();
          const el = body.querySelector('.msg-ask[data-idx="' + askIdx + '"]');
          if (el) {
            el.innerHTML = '<div class="msg-ask-card answered"><div class="msg-ask-q">' + (window.taFit ? window.taFit('问问TA') : '问问TA') + ' · ' + escTxt(content) + '</div><div class="msg-ask-a">✓ ' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(text) : text) + '</div>' + favHeartHtml() + '</div>';
          }
        }
        addIn(text);
        try {
          const list = JSON.parse(store.get('invite-ask-history') || '[]');
          list.unshift({ type: 'ask', q: content, a: text, ts: recTs });
          if (list.length > 200) list.length = 200;
          store.set('invite-ask-history', JSON.stringify(list));
        } catch (err) {}
        if (window.renderAskRecords) window.renderAskRecords();
        setTimeout(() => { if (!sameCid()) return; maybeFollowupAskCard(); }, 1200);
      }, 1500 + Math.random() * 2500);
    }
  }
  const moreInvite = document.getElementById('more-invite');
  if (moreInvite) {
    moreInvite.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatAskPanel('invite');
    });
  }
  const moreAsk = document.getElementById('more-ask');
  if (moreAsk) {
    moreAsk.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatAskPanel('ask');
    });
  }
  if (chatAskOk) chatAskOk.addEventListener('click', (e) => { e.stopPropagation(); submitChatAsk(); });
  if (chatAskCancel) chatAskCancel.addEventListener('click', (e) => { e.stopPropagation(); closeChatAskPanel(); });
  if (chatAskClose) chatAskClose.addEventListener('click', (e) => { e.stopPropagation(); closeChatAskPanel(); });
  if (chatAskInput) chatAskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.stopPropagation(); submitChatAsk(); } });

// ---- 搜索聊天记录（完整版：搜索全部历史，结果可点击跳转定位） ----
// ---- 搜索聊天记录：聊天页内嵌覆盖层（v3.5.52，星言式——不离开聊天页）----
  // 覆盖层内：返回聊天 / 关键词搜索（命中高亮）/ 点击结果跳转 / 跳转最新消息
  const chatSearchEl = document.getElementById('chat-search');
  const chatSearchInput = document.getElementById('chat-search-input');
  const chatSearchGo = document.getElementById('chat-search-go');
  const chatSearchResults = document.getElementById('chat-search-results');
  const chatSearchNew = document.getElementById('chat-search-new');
  const chatSearchDateFrom = document.getElementById('chat-search-date-from');
  const chatSearchDateTo = document.getElementById('chat-search-date-to');
  const chatSearchDateClear = document.getElementById('chat-search-date-clear');
  function openChatSearch() {
    if (!chatSearchEl) return;
    loadMsgs();
    chatSearchEl.hidden = false;
    chatSearchInput.value = '';
    if (chatSearchDateFrom) chatSearchDateFrom.value = '';
    if (chatSearchDateTo) chatSearchDateTo.value = '';
    chatSearchResults.innerHTML = '<div class="chat-search-empty">输入关键词，或选择日期范围搜索聊天记录</div>';
    setTimeout(() => chatSearchInput.focus(), 60);
  }
  function closeChatSearch() {
    if (chatSearchEl) chatSearchEl.hidden = true;
  }
  // v3.7.x：日期条件转时间戳（本地时区，结束日期含当天 24 点）
  function searchDateToTs(ds, inclusiveEnd) {
    if (!ds) return null;
    const parts = String(ds).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d.getTime() + (inclusiveEnd ? 86400000 : 0);
  }
  // v3.7.x：搜索结果时间带日期（MM-DD HH:MM，跨天搜索能看出是哪天）
  function fmtSearchTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function runChatSearch() {
    if (!chatSearchResults) return;
    const q = (chatSearchInput.value || '').trim();
    const fromTs = searchDateToTs(chatSearchDateFrom ? chatSearchDateFrom.value : '', false);
    const toTs = searchDateToTs(chatSearchDateTo ? chatSearchDateTo.value : '', true);
    const dateLabel = fromTs != null && toTs != null ? (chatSearchDateFrom.value + ' 至 ' + chatSearchDateTo.value) :
                      fromTs != null ? (chatSearchDateFrom.value + ' 起') :
                      toTs != null ? ('截至 ' + chatSearchDateTo.value) : '';
    if (!q && fromTs == null && toTs == null) {
      chatSearchResults.innerHTML = '<div class="chat-search-empty">输入关键词，或选择日期范围搜索聊天记录</div>';
      return;
    }
    loadMsgs();
    const partnerName = chatPartnerName();
    const myName = chatUserName();
    const results = [];
    msgs.forEach((m, i) => {
      if (!m || m.special) return;
      if (fromTs != null && (!m.ts || m.ts < fromTs)) return;
      if (toTs != null && (!m.ts || m.ts >= toTs)) return;
      let txt = typeof m.text === 'string' ? m.text : '';
      if (m.askQuestion) txt += ' ' + m.askQuestion;
      if (m.choiceQuestion) txt += ' ' + m.choiceQuestion;
      if (m.curiousQuestion) txt += ' ' + m.curiousQuestion;
      if (m.roastText) txt += ' ' + m.roastText;
      if (q && txt.indexOf(q) < 0) return;
      results.push({ i: i, m: m, txt: txt });
    });
    // v3.6.x：完整转义（原只转 </>，搜索词/昵称含 `&lt;…&gt;` 可绕过）
    const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (!results.length) {
      const emptyMsg = q ? ('没有找到包含「' + esc(q) + '」' + (dateLabel ? '（' + dateLabel + '）' : '') + '的消息') : (dateLabel ? dateLabel + ' 没有聊天记录' : '输入关键词，或选择日期范围搜索聊天记录');
      chatSearchResults.innerHTML = '<div class="chat-search-empty">' + emptyMsg + '</div>';
      return;
    }
    const hl = (x) => esc(x).split(q).join('<span class="chat-search-hl">' + esc(q) + '</span>');
    let head = '共 ' + results.length + ' 条 · 点击结果跳转到对应消息';
    if (dateLabel) head = dateLabel + ' · 共 ' + results.length + ' 条 · 点击结果跳转';
    let html = '<div style="font-size:11px;color:var(--muted);margin:6px 2px 10px">' + esc(head) + '</div>';
    results.slice(0, 80).forEach(r => {
      const isImg = r.txt.indexOf('data:') === 0;
      const label = isImg ? '[图片]' : (r.txt.length > 60 ? r.txt.slice(0, 60) + '…' : r.txt);
      const who = r.m.side === 'out' ? myName : partnerName;
      const time = r.m.ts ? fmtSearchTime(r.m.ts) : '';
      html += '<div class="tc-listitem" data-sidx="' + r.i + '"><div class="tc-li-top"><span class="tc-li-q">' + who + '：' + (isImg ? '[图片]' : (q ? hl(label) : esc(label))) + '</span><span class="tc-li-time">' + time + '</span></div></div>';
    });
    if (results.length > 80) html += '<div class="ta-empty">还有 ' + (results.length - 80) + ' 条…</div>';
    chatSearchResults.innerHTML = html;
    chatSearchResults.querySelectorAll('.tc-listitem').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.sidx);
        closeChatSearch();
        // v3.12.x：扩窗+滚动+高亮抽为 jumpToMsg（引用块点击跳转共用同一实现）
        if (!jumpToMsg(idx)) body.scrollTop = body.scrollHeight;
      });
    });
  }
  const moreSearch = document.getElementById('more-search');
  if (moreSearch) {
    moreSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      // 关闭其他底部半框，再打开搜索半框
      const pc = document.getElementById('poke-card');
      if (pc) pc.hidden = true;
      const askP = document.getElementById('chat-ask-panel');
      if (askP) closeChatAskPanel();
      if (window.closeAvlib) window.closeAvlib();
      openChatSearch();
    });
  }

  // ---- 聊天记录 导出 / 导入：已移至右上角三点 → 聊天设置「数据」分组（chat-settings.js） ----
  if (chatSearchGo) chatSearchGo.addEventListener('click', (e) => { e.stopPropagation(); runChatSearch(); });
  if (chatSearchInput) chatSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.stopPropagation(); runChatSearch(); } });
  // v3.7.x：按日期查询——日期变化自动搜索（关键词可留空）
  if (chatSearchDateFrom) chatSearchDateFrom.addEventListener('change', (e) => { e.stopPropagation(); runChatSearch(); });
  if (chatSearchDateTo) chatSearchDateTo.addEventListener('change', (e) => { e.stopPropagation(); runChatSearch(); });
  if (chatSearchDateClear) chatSearchDateClear.addEventListener('click', (e) => {
    e.stopPropagation();
    if (chatSearchDateFrom) chatSearchDateFrom.value = '';
    if (chatSearchDateTo) chatSearchDateTo.value = '';
    chatSearchResults.innerHTML = '<div class="chat-search-empty">输入关键词，或选择日期范围搜索聊天记录</div>';
    chatSearchInput.focus();
  });
  const chatSearchClose = document.getElementById('chat-search-close');
  if (chatSearchClose) chatSearchClose.addEventListener('click', (e) => { e.stopPropagation(); closeChatSearch(); });
  if (chatSearchNew) chatSearchNew.addEventListener('click', (e) => {
    e.stopPropagation();
    closeChatSearch();
    scrollChatBottom();
    const last = body.lastElementChild;
    if (last) {
      try { last.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e2) { last.scrollIntoView(); }
    }
  });

  // ---- 通话：聊天页底部半框（v3.7.x 更多功能「通话」→ 打开半框，不再直接拨打） ----
  // 半框内含：当前通话状态 + 拨打/挂断（「通话小框」开关已移至聊天设置页「隐藏通话小框」）
  const chatCallPanel = document.getElementById('chat-call-panel');
  const chatCallClose = document.getElementById('chat-call-close');
  const callPanelName = document.getElementById('call-panel-name');
  const callPanelStatus = document.getElementById('call-panel-status');
  const callPanelDial = document.getElementById('call-panel-dial');
  const callPanelHang = document.getElementById('call-panel-hang');

  let callPanelTimer = null;
  function fmtCallDur(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
  }
  function updateCallPanel() {
    if (!chatCallPanel || chatCallPanel.hidden) return;
    const pName = chatPartnerName();
    if (callPanelName) callPanelName.textContent = pName;
    let st = null;
    try { st = (window.getCallState && window.getCallState()) || null; } catch (err) { st = null; }
    if (st && st.status !== 'ended') {
      if (callPanelStatus) {
        callPanelStatus.textContent =
          st.status === 'connected' ? ('与 ' + (st.name || pName) + ' 通话中 · ' + fmtCallDur(st.durationSec)) :
          st.status === 'ringing' ? ((st.name || pName) + ' 来电…') :
          st.status === 'calling' ? ('正在呼叫 ' + (st.name || pName) + '…') : '通话中';
      }
      if (callPanelDial) callPanelDial.hidden = true;
      if (callPanelHang) callPanelHang.hidden = false;
    } else {
      if (callPanelStatus) callPanelStatus.textContent = '空闲 · 点击拨打语音通话';
      if (callPanelDial) callPanelDial.hidden = false;
      if (callPanelHang) callPanelHang.hidden = true;
    }
  }
  function openChatCall() {
    if (!chatCallPanel) return;
    // 关闭其他底部半框（与 openChatDivine 同步维护）
    const pc = document.getElementById('poke-card'); if (pc) pc.hidden = true;
    const ep = document.getElementById('emoji-panel'); if (ep) ep.hidden = true;
    const askP = document.getElementById('chat-ask-panel'); if (askP) closeChatAskPanel();
    const cs = document.getElementById('chat-search'); if (cs) cs.hidden = true;
    const dv = document.getElementById('chat-divine-panel'); if (dv) dv.hidden = true;
    const rp = document.getElementById('chat-rps-panel'); if (rp) rp.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    chatCallPanel.hidden = false;
    closeIme();

    updateCallPanel();
    clearInterval(callPanelTimer);
    callPanelTimer = setInterval(updateCallPanel, 1000);
  }
  function closeChatCall() {
    if (chatCallPanel) chatCallPanel.hidden = true;
    clearInterval(callPanelTimer);
    callPanelTimer = null;
  }
  const moreCall = document.getElementById('more-call');
  if (moreCall) {
    moreCall.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      openChatCall();
    });
  }
  // ---- Pong：更多功能「Pong」→ 打开底部半框（pong.js 负责游戏循环） ----
  const morePong = document.getElementById('more-pong');
  if (morePong) {
    morePong.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      // 关闭其他底部半框
      const pc = document.getElementById('poke-card'); if (pc) pc.hidden = true;
      const ep = document.getElementById('emoji-panel'); if (ep) ep.hidden = true;
      const askP = document.getElementById('chat-ask-panel'); if (askP) closeChatAskPanel();
      const cs = document.getElementById('chat-search'); if (cs) cs.hidden = true;
      const dv = document.getElementById('chat-divine-panel'); if (dv) dv.hidden = true;
      const dp = document.getElementById('chat-decision-panel'); if (dp) dp.hidden = true;
      const rpsP = document.getElementById('chat-rps-panel'); if (rpsP) rpsP.hidden = true;
      const rpP = document.getElementById('chat-rp-panel'); if (rpP) rpP.hidden = true;
      const callP = document.getElementById('chat-call-panel'); if (callP) callP.hidden = true;
      if (window.closeAvlib) window.closeAvlib();
      if (window.openPongPanel) window.openPongPanel();
    });
  }
  // ---- 双人贪吃蛇：更多功能「贪吃蛇」→ 打开底部半框（snake-game.js 负责游戏循环） ----
  const moreSnake = document.getElementById('more-snake');
  if (moreSnake) {
    moreSnake.addEventListener('click', (e) => {
      e.stopPropagation();
      if (morePanel) morePanel.hidden = true;
      if (window.openSnakePanel) window.openSnakePanel();
    });
  }
  // 贪吃蛇结束 → 写入聊天特殊卡片 + TA 字卡回应（调用 interact 字卡池：游戏胜利/失败/平局·回应）
  window.sendSnakeResult = function (d) {
    if (!d) return;
    addRec({ side: 'in', special: 'snake', snkResult: d.result, snkPLen: d.pLen, snkOLen: d.oLen, snkPFood: d.pFood, snkOFood: d.oFood, snkPScore: d.pScore, snkOScore: d.oScore, snkTime: d.time });
    if (window.logFish) window.logFish();
    showTyping();
    setTimeout(() => {
      hideTyping();
      const grp = d.result === 'win' ? '游戏失败·回应' : d.result === 'lose' ? '游戏胜利·回应' : '游戏平局·回应';
      const pool = window.getInteractPool ? window.getInteractPool(grp, ['再来一局？']) : ['再来一局？'];
      const say = pool.length ? pool[Math.floor(Math.random() * pool.length)] : '再来一局？';
      addRec({ side: 'in', text: say });
    }, randInt(900, 1600));
  };
  if (chatCallClose) chatCallClose.addEventListener('click', (e) => { e.stopPropagation(); closeChatCall(); });
  // 拨打（降级保留旧逻辑兜底）
  if (callPanelDial) callPanelDial.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.placeCall) window.placeCall();
    else {
      const name = chatPartnerName();
      addRec({ side: 'out', text: '拨打 ' + name + ' 语音通话', special: 'call' });
      if (window.logFish) window.logFish();
    }
    setTimeout(updateCallPanel, 120);
  });
  // 挂断（呼出中取消 / 通话中挂断 / 来电即拒接）
  if (callPanelHang) callPanelHang.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.hangupCall) window.hangupCall();
    setTimeout(updateCallPanel, 120);
  });

  // v3.7.x：切换联系人桌面时关闭通话半框（防半框残留到新桌面）
  document.addEventListener('contact-switched', function () {
    try { closeChatCall(); } catch (e) {}
  });

  if (pokeClose) pokeClose.addEventListener('click', (e) => { e.stopPropagation(); closePokeCard(); });
  // 打开拍一拍：关掉其他底部半框（表情包/头像互动），露出聊天消息
  function openPokeCard() {
    if (!pokeCard) return;
    const ep = document.getElementById('emoji-panel');
    if (ep) ep.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    pokeCard.hidden = false;
    if (morePanel) morePanel.hidden = true;
    closeIme(); // v3.5.116：收起输入法，面板不被键盘遮挡
    if (pokeInput) pokeInput.value = '';
    // v3.7.x：按当前桌面记忆的 tab + 分组打开
    try { const p = store.get('poke-tab'); if (p === 'mine') pokeMode = 'mine'; else if (p === 'ta') pokeMode = 'ta'; } catch (e) {}
    try { const g = store.get('poke-group-' + pokeMode); if (typeof g === 'string' && g) pokeCurGroup = g; } catch (e) {}
    renderPokeCard();
  }
  // 点击卡片外部关闭
  document.addEventListener('click', (e) => {
    if (pokeCard && !pokeCard.hidden && !pokeCard.contains(e.target)) closePokeCard();
  });
  // ---- 消息气泡操作：引用 / 收藏 / 撤回 / 编辑 ----
  const msgActions = document.getElementById('msg-actions');
  let activeMsgEl = null;   // 当前操作的消息 DOM
  let activeSide = 'in';    // 当前操作消息方向
  let lastQuote = null;     // 待引用内容

  // 收藏存储
  function getFav() { try { return JSON.parse(store.get('fav-msgs') || '[]'); } catch (e) { return []; } }
  function saveFav(list) { store.set('fav-msgs', JSON.stringify(list)); }
  // 编辑消息后同步收藏：我的收藏 + TA 收藏里同一条消息（side=out 且文本一致）的
  // 文本快照一起更新，避免联系人收藏夹里还是旧版错字（ts 不动，去重仍按 text+ts 匹配）
  function syncFavMsgText(oldText, newText) {
    if (oldText === newText) return;
    const fav = getFav();
    let changed = false;
    fav.forEach(f => {
      if ((f.kind || 'msg') === 'msg' && f.side === 'out' && f.text === oldText) {
        f.text = newText;
        f.type = 'text';
        changed = true;
      }
    });
    if (changed) saveFav(fav);
  }
  // 收藏去重：同类型(kind) + 同内容(q/text) + 同时刻(ts) 视为同一条（旧消息收藏无 kind，
  // 统一按 'msg' 处理，匹配规则不变：仍比对 text+ts，避免收藏重复消息）
  function favDup(list, f) {
    return list.some(x => (x.kind || 'msg') === (f.kind || 'msg') &&
      (x.q || '') === (f.q || '') && (x.text || '') === (f.text || '') && x.ts === f.ts);
  }
  // 收藏入口（我的收藏 / TA 收藏）：交互卡片 / 信箱回信 / 朋友圈动态 三种新条目共用，
  // 返回是否新增成功（false=已收藏过）。聊天消息收藏仍走气泡菜单原逻辑，不经这里。
  window.addMyFavItem = function (f) {
    const fav = getFav();
    if (favDup(fav, f)) return false;
    fav.push(Object.assign({ by: 'me' }, f));
    saveFav(fav);
    return true;
  };
  window.addTaFavItem = function (f) {
    const fav = getFav();
    if (favDup(fav, f)) return false;
    fav.push(Object.assign({ by: 'ta' }, f));
    saveFav(fav);
    return true;
  };
  // 互动卡片收藏快照：问题 + 我的回答 + 联系人的回复（邀请卡只有问题 + TA 的回应）
  function cardSnapshot(rec) {
    if (!rec) return null;
    let q = '', mine = '', ta = '', special = rec.special;
    if (special === 'ask-choose') { q = rec.choiceQuestion || ''; mine = rec.choiceAnswer || ''; ta = rec.choiceReply || ''; }
    else if (special === 'ask-curious') { q = rec.curiousQuestion || ''; mine = rec.curiousAnswer || ''; ta = rec.curiousReply || ''; }
    else if (special === 'ask-roast') { q = rec.roastText || ''; mine = rec.roastAnswer || ''; ta = rec.roastReply || ''; }
    else if (special === 'ask-card') { q = rec.askQuestion || ''; mine = rec.askAnswer || ''; ta = rec.askReply || ''; }
    else if (special === 'invite') { q = rec.inviteContent || ''; ta = rec.inviteAnswer || ''; }
    else return null;
    return { kind: 'card', special: special, q: q, mine: mine, ta: ta, ts: rec.ts || Date.now() };
  }
  // 我点击互动卡片上的收藏按钮：整卡收藏到我的收藏
  window.favCardFromMsg = function (idx) {
    const rec = msgs[idx];
    if (!rec) return;
    const f = cardSnapshot(rec);
    if (!f) return;
    if (window.addMyFavItem(f)) toast('已收藏互动卡片');
    else toast('已收藏过这张卡片');
  };
  // 互动卡片收藏按钮 HTML（问题+我的回答+联系人的回复 一整个卡片，点收藏进桌面收藏页）
  function favHeartHtml() {
    return '<button class="msg-fav-heart" title="收藏整张互动卡片"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>收藏</button>';
  }
  // TA 收藏整张互动卡片（概率可调，回答后随 TA 的回应一起判定）
  function taFavCard(rec) {
    const _favProbCard = (window.favCfg ? window.favCfg().taCard : 30);
    if (!rec || Math.random() * 100 >= _favProbCard) return;
    const f = cardSnapshot(rec);
    if (!f) return;
    if (window.addTaFavItem(f)) setTimeout(() => toast('TA 收藏了你们的互动卡片'), 1200);
  }

  function closeMsgActions() {
    if (msgActions) msgActions.hidden = true;
    activeMsgEl = null;
  }
  // v3.12.x：点击引用块跳转到被引用的原消息。
  // 新引用在记录上带 qidx（被引消息的 msgs 下标）；旧数据无 qidx 时按内容就近匹配：
  // 用与长按「引用」相同的快照规则重建候选消息的引用文案再比对（向前取第一条命中）。
  function quoteSnapOf(m) {
    let qi = (m.parts || []).filter(p => p.k === 'img').map(p => p.v).slice(0, 3);
    if (!qi.length && (m.type === 'sticker' || m.type === 'image')
        && typeof m.text === 'string'
        && (m.text.indexOf('data:') === 0 || /^https?:\/\//i.test(m.text))) {
      qi.push(m.text);
    }
    let qt = m.text;
    if (m.type === 'voice') qt = '[语音] ' + String(qt || '').split('|||')[0];
    else if (m.type === 'sticker') qt = '表情包';
    else if (qi.length && (String(qt || '').indexOf('data:') === 0 || /^https?:\/\//i.test(String(qt || '')))) qt = '图片';
    return qi.length ? { t: qt, imgs: qi } : qt;
  }
  function quoteEq(a, b) {
    if (a === b) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') return (a.t || '') === (b.t || '') && (a.imgs || []).join() === (b.imgs || []).join();
    return false;
  }
  function resolveQuoteTarget(selfIdx) {
    const rec = msgs[selfIdx];
    if (!rec || !rec.quote) return -1;
    const qs = rec.qside || 'out';
    // ① qidx 直查：目标存在、同方向、未撤回、在当前消息之前才采信；
    //    删除/重排造成的下标漂移由 ② 内容匹配兜底
    if (typeof rec.qidx === 'number' && rec.qidx >= 0 && rec.qidx < selfIdx) {
      const t = msgs[rec.qidx];
      if (t && !t.retracted && t.side === qs) return rec.qidx;
    }
    for (let i = selfIdx - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m || m.retracted || m.side !== qs) continue;
      if (quoteEq(rec.quote, quoteSnapOf(m))) return i;
    }
    return -1;
  }
  // 跳到指定下标的消息：分页窗口外先扩窗，滚动到视口中央并高亮闪烁（搜索跳转共用）
  function jumpToMsg(idx) {
    let target = body.querySelector('.msg[data-idx="' + idx + '"]');
    if (!target && idx < renderStart) {
      renderStart = Math.max(0, idx - JUMP_VIEW);
      renderWindow(true, false);
      target = body.querySelector('.msg[data-idx="' + idx + '"]');
    }
    if (!target) return false;
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { target.scrollIntoView(); }
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 2200);
    return true;
  }
  // 引用块点击委托——点引用区域只做「跳回原消息」，不弹操作菜单
  if (body) {
    body.addEventListener('click', (e) => {
      const qb = e.target.closest('.msg-quote');
      if (!qb) return;
      const item = qb.closest('.msg');
      if (!item || item.dataset.idx === undefined) return;
      const tIdx = resolveQuoteTarget(Number(item.dataset.idx));
      if (tIdx < 0 || !jumpToMsg(tIdx)) toast('未找到原消息');
    });
  }
  // 气泡点击弹出操作菜单
  if (body) {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('.msg-bubble');
      if (!b) { closeMsgActions(); return; }
      // v3.12.x：点引用块交给上方委托做「跳转原消息」，不弹操作菜单
      if (e.target.closest('.msg-quote')) return;
      const item = b.closest('.msg');
      if (!item) return;
      // 特殊消息不弹菜单（已读不回/拍一拍/撤回提示/局部撤回胶囊）
      const special = item.classList.contains('msg-poke');
      if (special) return;
      if (e.target.closest('.msg-poke-seg')) return;
      if (b.textContent.indexOf('撤回了一条消息') >= 0 || b.textContent.indexOf('已读不回') >= 0) return;
      e.stopPropagation();
      activeMsgEl = item;
      activeSide = item.classList.contains('msg-out') ? 'out' : 'in';
      // 显示对应按钮：我的消息多 撤回/编辑
      if (msgActions) {
        msgActions.querySelectorAll('.ma-mine').forEach(b2 => b2.hidden = activeSide !== 'out');
        // v3.10.x：删除联系人消息按钮——仅当开关开启且消息方向为 TA(in) 时显示
        const delBtn = msgActions.querySelector('.ma-del-ta');
        if (delBtn) {
          let delEn = false;
          try { delEn = store.get('cs-del-ta-msg') === '1'; } catch (e) {}
          delBtn.hidden = !(delEn && activeSide === 'in');
        }
        msgActions.hidden = false;
        // 定位到气泡旁边：优先气泡上方，空间不足放下方
        // v3.5.116：手机端输入法弹出时可视高度按 visualViewport 计算，
        // 菜单不再被键盘盖住/跑到键盘下面（全屏模式下老问题）
        const bRect = b.getBoundingClientRect();
        const aw = msgActions.offsetWidth || 200;
        const ah = msgActions.offsetHeight || 50;
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        let x = bRect.left + bRect.width / 2 - aw / 2;
        x = Math.max(10, Math.min(vw - aw - 10, x));
        let y = bRect.top - ah - 8;
        const below = bRect.bottom + 8;
        const aboveFits = y >= 50;
        const belowFits = below + ah <= vh - 8;
        // 上方放得下优先上方；下方被输入法/底部遮挡时也退回上方
        y = aboveFits || !belowFits ? y : below;
        msgActions.style.left = x + 'px';
        msgActions.style.top = y + 'px';
      }
    });
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (msgActions && !msgActions.hidden && !msgActions.contains(e.target)) closeMsgActions();
    });
  }
  // 操作执行
  if (msgActions) {
    msgActions.addEventListener('click', (e) => {
      const btn = e.target.closest('.ma-btn');
      if (!btn) return;
      const act = btn.dataset.act;
      const idx = activeMsgEl ? Number(activeMsgEl.dataset.idx) : -1;
      const rec = (idx >= 0 && msgs[idx]) ? msgs[idx] : null;
      if (act === 'quote') {
        // 引用：记录待引用内容，下次发送带引用块（组合消息同时带图片缩略图）
        // v3.7.x：设置后立即刷新引用预览条（输入栏上方显示引用了什么，可 ✕ 删除）
        if (rec) {
          const qimgs = (rec.parts || []).filter(p => p.k === 'img').map(p => p.v).slice(0, 3);
          // v3.9.x 修复（引用 TA 表情包/纯图片消息时图片消失）：TA 主动发表情包
          //   （addIn 不传 parts）和 TA 回复表情包（genOneReply 返回 {text,type} 无 parts）
          //   的消息 rec.parts 为 undefined → qimgs 空 → quoteValue 退化为字符串"表情包"
          //   → quoteHtml 只显示占位文字，图片缩略图丢失。兜底：无 parts 但 rec.text
          //   本身是 dataURL 时，用 rec.text 作为缩略图来源
          // v3.11.x：链接导入的表情包（rec.text 为 http(s) 链接）同样兜底
          if (!qimgs.length && (rec.type === 'sticker' || rec.type === 'image')
              && typeof rec.text === 'string'
              && (rec.text.indexOf('data:') === 0 || /^https?:\/\//i.test(rec.text))) {
            qimgs.push(rec.text);
          }
          // v3.5.131：语音消息引用存占位文案（rec.text 是「文件名|||base64」，
          // 直接引用会在预览条和气泡引用块里显示整段 base64 乱码）
          // v3.7.x：表情包/纯图片消息的 rec.text 本身就是整段 base64 dataURL——
          // 直接引用会在预览条和气泡引用块里显示乱码，统一换成占位文案
          let qtext = rec.text;
          if (rec.type === 'voice') {
            qtext = '[语音] ' + String(rec.text || '').split('|||')[0];
          } else if (rec.type === 'sticker') {
            qtext = '表情包';
          } else if (qimgs.length && (String(qtext || '').indexOf('data:') === 0 || /^https?:\/\//i.test(String(qtext || '')))) {
            qtext = '图片';
          }
          // v3.12.x：记录被引消息下标——发送后写入新消息的 qidx，点引用块可跳回原消息
          lastQuote = { side: rec.side, text: qtext, type: rec.type, imgs: qimgs, idx: idx };
          renderDraft();
        }
        closeMsgActions();
      } else if (act === 'fav') {
        if (rec) {
          const fav = getFav();
          // 同一条内容不重复收藏
          if (fav.some(f => f.side === rec.side && f.text === rec.text)) {
            toast('已收藏过这条消息');
          } else {
            // v3.10.x：组合消息（文字+图片+表情包同一条气泡）一起收藏——保存 parts，
            //   渲染时按组合消息还原整条气泡，不再只显示 text 或单张图
            fav.push({ side: rec.side, text: rec.text, type: rec.type || 'text', ts: rec.ts || Date.now(), by: 'me', mood: (rec.mood || []).slice(), parts: rec.parts && rec.parts.length ? rec.parts.map(p => ({ k: p.k, v: p.v, sub: p.sub })) : undefined });
            saveFav(fav);
            toast('已收藏到我的收藏');
          }
        }
        closeMsgActions();
      } else if (act === 'retract') {
        if (activeMsgEl) retractMsg(activeMsgEl, 'out');
        closeMsgActions();
      } else if (act === 'edit') {
        if (rec && window.openModal) {
          const orig = rec.text;
          // v3.5.131：闭包捕获气泡元素——closeMsgActions 会置 activeMsgEl=null，
          // 回调里再读必现 TypeError（编辑结果不更新界面）
          const editEl = activeMsgEl;
          window.openModal('编辑消息', orig.indexOf('data:') === 0 ? '' : orig, (v) => {
            const val = (v || '').trim();
            if (!val) return;
            // 更新记录与 DOM
            rec.text = val;
            rec.type = 'text';
            syncFavMsgText(orig, val); // v3.7.x：编辑后收藏夹里同一条消息快照同步更新（含 TA 收藏）
            sessionChangedIdx.add(idx); // v3.6.x：标记本会话变更，防 loadMsgs 合并回滚编辑
            saveMsgs();
            syncLastMineText(); // v3.6.x：编辑后 TA 引用/收藏不再拿旧文本
            const b = editEl && editEl.querySelector('.msg-bubble');
            if (b) b.innerHTML = '<span style="opacity:.85">' + escTxt(val) + '</span>';
          });
        }
        closeMsgActions();
      } else if (act === 'del') {
        // v3.10.x：删除联系人消息（真删除，不可恢复）。仅对 TA 消息生效，开关 cs-del-ta-msg 开启时可用。
        if (activeMsgEl && idx >= 0 && msgs[idx] && msgs[idx].side === 'in') {
          msgs.splice(idx, 1);
          sessionChangedIdx.clear();
          saveMsgs();
          renderWindow(true);
          toast('已删除该消息');
        }
        closeMsgActions();
      }
    });
  }
  // 轻提示（复用 cc-toast 风格）
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cc-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    // v3.10.x：不设内联 opacity（会污染其他模块 toast 残留 opacity:1 致不消失）
    t.style.opacity = '';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }

  // ---- 收藏页 ----
  const favPage = document.getElementById('page-fav');
  const favList = document.getElementById('fav-list');
  let favTab = 'mine'; // mine=我的收藏 ta=联系人的收藏
  let favKind = 'all'; // 收藏分类筛选：all=全部 msg=聊天消息 card=互动卡片 mail=信件 feed=朋友圈
  const FAV_KINDS = [
    { k: 'all', label: '全部', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' },
    { k: 'msg', label: '聊天', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
    { k: 'card', label: '互动', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 14h4"/></svg>' },
    { k: 'mail', label: '信件', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>' },
    { k: 'feed', label: '朋友圈', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9.5" r="2.2"/><path d="M14.5 19c0-2 2-3.5 4-3.5s2.5 1.5 2.5 3.5"/></svg>' }
  ];
  function renderFav() {    if (!favList) return;
    const fav = getFav();
    favList.innerHTML = '';
    const partnerName = chatPartnerName();
    const myName = chatUserName();
    // 按"谁收藏"分组：TA 收藏夹自动收藏（by==='ta'）归 TA；手动收藏（含旧数据）归我
    const myFav = fav.filter(f => f.by !== 'ta');
    const taFav = fav.filter(f => f.by === 'ta');
    // tab 高亮
    const tabsEl = document.getElementById('fav-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.fav-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === favTab));
    }
    const list = favTab === 'ta' ? taFav : myFav;
    // 分类 tab 计数 + 高亮（全部/聊天消息/互动卡片/信件/朋友圈）
    const kindTabsEl = document.getElementById('fav-kind-tabs');
    if (kindTabsEl) {
      const counts = { all: list.length, msg: 0, card: 0, mail: 0, feed: 0 };
      list.forEach(f => { const k = f.kind || 'msg'; if (k in counts) counts[k]++; });
      kindTabsEl.querySelectorAll('.fav-tab').forEach(t => {
        const k = t.dataset.kind;
        t.classList.toggle('sel', k === favKind);
        const n = counts[k] || 0;
        const cnt = t.querySelector('.fav-tab-cnt');
        if (cnt) cnt.textContent = n > 0 ? String(n) : '';
      });
    }
    // 按分类过滤
    const list2 = favKind === 'all' ? list : list.filter(f => (f.kind || 'msg') === favKind);
    // 最新收藏在上
    list2.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const title = favTab === 'ta' ? partnerName + ' 的收藏' : myName + ' 的收藏';
    let empty = favTab === 'ta' ? 'TA 还没有收藏' : '暂无收藏';
    if (favKind !== 'all') {
      const K_EMPTY = { msg: '聊天消息', card: '互动卡片', mail: '信件', feed: '朋友圈' };
      empty = (favTab === 'ta' ? 'TA 还没有收藏' : '暂无') + K_EMPTY[favKind];
    }
    // 组标题
    const h = document.createElement('div');
    h.className = 'cc-group-header';
    h.innerHTML = '<span class="ccg-name">' + title + '</span><span class="ccg-count">' + list2.length + '</span>';
    favList.appendChild(h);
    if (!list2.length) {
      favList.innerHTML += '<div class="fav-empty">' + empty + '</div>';
      return;
    }
    // 互动卡片类型名 / 信箱回信 / 朋友圈动态 的分类标签
    // 注意：必须在 list2.forEach 之前声明（renderFavItem 提升后引用 const 会 TDZ 报错）
    const FAV_KIND_LABEL = {
      'ask-choose': '小问题', 'ask-curious': '好奇', 'ask-roast': '吐槽',
      'ask-card': '问问TA', 'invite': '邀请TA'
    };
    // 信箱回信/朋友圈正文：图片/表情 dataURL 按缩略图渲染（与信箱 renderBody 一致）
    function favTextHtml(s) {
      const str = String(s || '');
      let html = '';
      const re = /((?:sticker|image):)?(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
      let last = 0, mm;
      while ((mm = re.exec(str))) {
        html += escTxt(str.slice(last, mm.index));
        html += '<img class="fav-item-img" src="' + mm[2] + '" alt="图片">';
        last = mm.index + mm[0].length;
      }
      html += escTxt(str.slice(last));
      return html;
    }
    list2.forEach(f => renderFavItem(f));
    function renderFavItem(f) {
      const kind = f.kind || 'msg';
      const m = document.createElement('div');
      m.className = 'msg ' + (f.side === 'out' ? 'msg-out' : 'msg-in');
      const timeHtml = f.ts ? '<span class="msg-time">' + fmtTime(f.ts) + '</span>' : '';
      const side = '<div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div>';
      if (kind === 'card') {
        // 互动卡片收藏：问题 + 我的回答 + 联系人的回复（一整个卡片）
        const label = FAV_KIND_LABEL[f.special] || '互动卡片';
        let html = '<div class="fav-item-card">' +
          '<span class="fav-item-tag">互动卡片 · ' + label + '</span>' +
          '<div class="fav-item-q">' + (f.special === 'invite' ? (window.taFit ? window.taFit('邀请TA') : '邀请TA') + ' · ' : '') + escTxt(f.q || '') + '</div>';
        if (f.mine) html += '<div class="fav-item-a">✓ 我：' + escTxt(f.mine) + '</div>';
        if (f.ta) html += '<div class="fav-item-r">' + (window.taFit ? window.taFit('TA：') : 'TA：') + escTxt(window.taFit ? window.taFit(f.ta) : f.ta) + '</div>';
        if (!f.mine && !f.ta) html += '<div class="fav-item-tip">等待回应…</div>';
        html += '</div>';
        m.innerHTML = html + side;
        fillAvatar(m.querySelector('.msg-av'), 'cs-avatar-user');
      } else if (kind === 'mail') {
        // 信箱收藏：来信 / 回信（mailType 区分；旧数据无 mailType 视为回信）
        const tag = f.mailType === 'received' ? '信箱来信' : '信箱回信';
        let html = '<div class="fav-item-card">' +
          '<span class="fav-item-tag">' + tag + (f.title ? ' · 《' + escTxt(f.title) + '》' : '') + '</span>' +
          '<div class="fav-item-body">' + favTextHtml(f.text) + '</div>' +
          '</div>';
        m.innerHTML = html + side;
        fillAvatar(m.querySelector('.msg-av'), 'cs-avatar-user');
      } else if (kind === 'feed') {
        // 朋友圈动态收藏
        let html = '<div class="fav-item-card">' +
          '<span class="fav-item-tag">朋友圈动态</span>' +
          (f.text ? '<div class="fav-item-body">' + favTextHtml(f.text) + '</div>' : '') +
          ((f.imgs && f.imgs.length) ? '<div class="fav-item-imgs">' + f.imgs.map(u => '<img src="' + attrEsc(u) + '" alt="图片">').join('') + '</div>' : '') +
          '</div>';
        m.innerHTML = html + side;
        fillAvatar(m.querySelector('.msg-av'), 'cs-avatar-user');
      } else {
        // 聊天消息收藏（原逻辑）
        m.innerHTML = f.side === 'out'
          ? '<div class="msg-bubble"></div>' + side
          : side + '<div class="msg-bubble"></div>';
        const b = m.querySelector('.msg-bubble');
        if (f.parts && f.parts.length) {
          // v3.10.x：组合消息收藏——文字 + 图片/表情同一气泡内一起显示（与聊天气泡渲染一致）
          const imgs = f.parts.filter(p => p.k === 'img');
          const textPart = f.parts.filter(p => p.k === 'text').map(p => p.v).join(' ');
          let inner = '';
          if (imgs.length) {
            inner += '<div class="msg-parts-imgs' + (imgs.length > 1 ? ' multi' : '') + '">' +
              imgs.map(p => {
                const isSticker = p.sub === 'sticker';
                return '<img class="msg-img' + (isSticker ? ' msg-img-sm' : ' msg-img-big') + '" src="' + attrEsc(p.v) + '" alt="' + (isSticker ? '表情' : '图片') + '" loading="lazy" decoding="async">';
              }).join('') + '</div>';
          }
          if (textPart) inner += '<span style="opacity:.85;word-break:break-word">' + escTxtBr(textPart) + '</span>';
          b.innerHTML = inner;
          b.querySelectorAll('.msg-img-big').forEach(img => {
            img.addEventListener('click', (e) => {
              e.stopPropagation();
              if (window.viewChatImage) window.viewChatImage(img.src);
            });
          });
        } else {
          // 图片/表情：按类型或按 dataURL 内容识别（兼容旧数据收藏时 type 误存为 text 的乱码）
          const isImg = f.type === 'sticker' || f.type === 'image' || (typeof f.text === 'string' && f.text.indexOf('data:') === 0);
          if (isImg) {
            b.style.padding = '6px';
            b.innerHTML = '<img class="msg-img" src="' + f.text + '" alt="表情">';
          } else {
            b.innerHTML = '<span style="opacity:.85">' + escTxtBr(f.text) + '</span>';
          }
        }
        // 收藏消息的情绪字卡
        if (f.mood && f.mood.length) {
          f.mood.forEach(md => {
            if (md.tag === '交流意图') {
              b.innerHTML += '<div class="msg-mood msg-intent"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
            } else {
              b.innerHTML += '<div class="msg-mood"><span class="msg-mood-tag">' + md.tag + '</span><span>' + md.label + '</span></div>';
            }
          });
        }
        fillAvatar(m.querySelector('.msg-av'), f.side === 'out' ? 'cs-avatar-user' : 'cs-avatar-partner');
      }
      // 朋友圈收藏的图片点击放大
      if (kind === 'feed') {
        m.querySelectorAll('.fav-item-imgs img').forEach(im => im.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.viewChatImage) window.viewChatImage(im.src);
        }));
      }
      // 收藏条目内容匹配（按 kind + 内容 + 时间，getFav() 每次 JSON.parse 新对象，
      // 必须按值匹配不能 indexOf 引用）
      function matchFav(x) {
        return (x.kind || 'msg') === kind &&
          (x.q || '') === (f.q || '') && (x.text || '') === (f.text || '') && x.ts === f.ts;
      }
      // 长按删除收藏（600ms）
      let pressTimer = null;
      m.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
          const fav2 = getFav();
          const idx2 = fav2.findIndex(matchFav);
          if (idx2 >= 0) {
            if (window.openModal) {
              window.openModal('删除这条收藏？', '', () => {
                fav2.splice(idx2, 1);
                saveFav(fav2);
                renderFav();
              }, { noInput: true });
            }
          }
        }, 600);
      }, { passive: true });
      m.addEventListener('touchend', () => clearTimeout(pressTimer));
      m.addEventListener('touchmove', () => clearTimeout(pressTimer));
      m.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const fav2 = getFav();
        const idx2 = fav2.findIndex(matchFav);
        if (idx2 >= 0 && window.openModal) {
          window.openModal('删除这条收藏？', '', () => {
            fav2.splice(idx2, 1);
            saveFav(fav2);
            renderFav();
          }, { noInput: true });
        }
      });
      favList.appendChild(m);
    }
  }
  // 收藏 tab 切换
  const favTabs = document.getElementById('fav-tabs');
  if (favTabs) {
    favTabs.addEventListener('click', (e) => {
      const tb = e.target.closest('.fav-tab');
      if (!tb) return;
      favTab = tb.dataset.tab;
      renderFav();
    });
  }
  // 收藏分类 tab（全部/聊天消息/互动卡片/信件/朋友圈）——JS 注入，不动 template.html
  const favKindTabs = document.createElement('div');
  favKindTabs.className = 'fav-tabs fav-kind-row';
  favKindTabs.id = 'fav-kind-tabs';
  favKindTabs.innerHTML = FAV_KINDS.map(o => '<button class="fav-tab" data-kind="' + o.k + '">' + o.icon + '<span class="fav-tab-label">' + o.label + '</span><span class="fav-tab-cnt"></span></button>').join('');
  if (favTabs && favTabs.parentNode) favTabs.parentNode.insertBefore(favKindTabs, favTabs.nextSibling);
  favKindTabs.addEventListener('click', (e) => {
    const tb = e.target.closest('.fav-tab');
    if (!tb) return;
    favKind = tb.dataset.kind;
    renderFav();
  });

  // 暴露 renderFav 供收藏设置页返回时刷新列表
  window.renderFav = renderFav;

  // 桌面收藏图标进入
  const favApp = document.querySelector('.app[data-app="note"]');
  if (favApp && favPage) {
    favApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      favPage.hidden = false;
      renderFav();
    });
  }
  const favBack = document.getElementById('fav-back');
  if (favBack) {
    favBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }

  // ---- 表情包面板：TA 的表情包 + 我的表情包（v3.5.31）----
  // 我的表情包独立存储（v3.12.x 起全局键 my-emoji-groups，各桌面互通）：可新建/管理分组、批量管理、添加表情
  const emojiPanel = document.getElementById('emoji-panel');
  const emojiList = document.getElementById('emoji-list');
  const emojiClose = document.getElementById('emoji-close');
  const emojiBtn = document.getElementById('chat-emoji-btn');
  const emojiGroupsBar = document.getElementById('emoji-groups');
  const emojiTools = document.getElementById('emoji-tools');
  const emojiBatch = document.getElementById('emoji-batch');
  const emojiBatchCount = document.getElementById('emoji-batch-count');
  let emojiMode = 'ta';        // public（公用表情包）/ ta（联系人专属）/ mine
  let emojiCurGroup = '';      // 联系人专属表情包分组筛选（记住上次打开的分类）
  let pubCurGroup = '';        // 公用表情包分组筛选（记住上次打开的分类）
  let myCurGroup = '';         // 我的表情包分组筛选（记住上次打开的分类）
  let myBatchMode = false;     // 批量管理模式
  let myGroups = [];           // 我的表情包 [[分组名, [dataURL...]], ...]
  let mySel = new Set();       // 批量勾选：分组名\u0001索引
  let emojiInsertCb = null;    // v3.6.x：写信/回信「插入模式」回调（点击表情插入信纸）
  // v3.11.x：插入模式放行链接表情（非 data:）——群聊发送用（信纸场景仍只支持 data: 内联图）
  let emojiInsertAllowUrl = false;
  // v3.12.x：我的表情包改全局共享——原按桌面隔离（xy-home-v2:<cid>:my-emoji-groups），
  // 每个联系人桌面各一份，切桌面就「换了一批」；现统一存全局根键
  // xy-home-v2:my-emoji-groups，所有桌面读写同一份（需求：我的表情包每个桌面数据互通）。
  // 存量各桌面数据由下方迁移块在数据就绪后一次性合并进全局键（幂等，标记 mye-global-migrated）。
  const MYE_G_PREFIX = 'xy-home-v2';
  function myEmojiStore() { return window.xyStore(MYE_G_PREFIX); }
  function MYE_KEY() { return MYE_G_PREFIX + ':my-emoji-groups'; }
  // v3.12.x：「隐藏联系人的表情包」开关（聊天设置，全局键 hide-ta-sticker）——开启后
  // 表情包面板隐藏 TA 的/公用 tab、只显示「我的表情包」；朋友圈评论面板读同一键。
  // 开关本身全局生效（面板 UI 跨桌面共用），故走根命名空间而非桌面 store。
  function taStickerHidden() {
    try { if (window.xyStore) return window.xyStore(MYE_G_PREFIX).get('hide-ta-sticker') === '1'; } catch (e) {}
    try { return store.get('hide-ta-sticker') === '1'; } catch (e) { return false; }
  }
  // v3.7.x：启动即从 localStorage 加载我的表情包——原实现只靠「IDB 内容更多才覆盖」
  // 的恢复块，LS 与 IDB 一致时（正常双写后刷新）myGroups 永远是空数组，
  // 刷新后我的表情包整组消失（与 chatcard.js cc-groups 的 loadGroups 模式对齐；
  // 下方恢复块仍在 IDB 内容更多时覆盖）
  myGroups = myEmojiLoad();

  // 记住最后打开的表情包分类（localStorage 持久化，刷新后仍在）
  function saveEmojiGroupPref() {
    store.set('emoji-last', JSON.stringify({ ta: emojiCurGroup, mine: myCurGroup, pub: pubCurGroup }));
  }
  (function () {
    try {
      const pref = JSON.parse(store.get('emoji-last') || 'null');
      if (pref && typeof pref === 'object') {
        if (typeof pref.ta === 'string') emojiCurGroup = pref.ta;
        if (typeof pref.mine === 'string') myCurGroup = pref.mine;
        if (typeof pref.pub === 'string') pubCurGroup = pref.pub;
      }
    } catch (e) {}
  })();

  // ---- 我的表情包数据：localStorage + IndexedDB 双写（失败检测 + 兜底恢复）----
  // v3.12.x：读写走全局根 store（不再随桌面切换）
  function myEmojiLoad() {
    try { const v = JSON.parse(myEmojiStore().get('my-emoji-groups') || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
    return [];
  }
  function myEmojiSave() {
    const data = JSON.stringify(myGroups);
    // 统一走适配层：localStorage 快照 + IndexedDB 权威（配额满也不丢，启动自动恢复）
    myEmojiStore().set('my-emoji-groups', data);
    return true;
  }
  // 启动恢复：IDB 内容更多优先（与字卡库一致，防配额丢数据）
  // v3.9.x：读到 undefined（慢 IDB 首次失败）延迟重试，防「我的表情包」整组消失。
  // v3.12.x：全局键后无「切桌面串写」问题，去掉桌面归属校验（原 myPrefix 守卫删除）。
  (function () {
    if (!window.idbGet) return;
    let retry = 0;
    function tryRestore() {
      window.idbGet(MYE_KEY()).then(v => {
        if (!v) { if (retry < 3) { retry++; setTimeout(tryRestore, 800 * retry); } return; }
        try {
          const data = typeof v === 'string' ? JSON.parse(v) : v;
          if (!Array.isArray(data)) return;
          const cnt = (g) => { let n = 0; g.forEach(x => n += (Array.isArray(x[1]) ? x[1].length : 0)); return n; };
          let local = null;
          try { local = JSON.parse(myEmojiStore().get('my-emoji-groups') || 'null'); } catch (e) {}
          const lc = Array.isArray(local) ? cnt(local) : -1;
          if (lc < 0 || cnt(data) > lc) {
            myGroups = data;
            if (!emojiPanel.hidden) renderEmojiPanel();
          }
        } catch (e) {}
      });
    }
    tryRestore();
  })();

  // ---- v3.12.x：存量各桌面「我的表情包」一次性合并迁移到全局键（幂等） ----
  // 升级前数据按桌面存 xy-home-v2:<cid>:my-emoji-groups；更老版本顶层键
  // xy-home-v2:my-emoji-groups（defaultStore 回退落点）恰好就是新全局键。
  // 迁移把 当前全局键 + 各联系人桌面键 + 顶层旧键 合并去重（同名分组并组、组内按
  // 字符串去重），写回全局键后清除各桌面键。时序：等 mochi-restore-done /
  // __mochiDataReady（IDB 整体回填就绪），防止把尚未恢复的空库当「无存量」误清；
  // 源数据在 LS/memoryCache 快照与 IDB 权威值之间都参与合并（大键可能只在 IDB）。
  (function () {
    const gStore = myEmojiStore();
    let started = false;
    const cntOf = (g) => { let n = 0; (g || []).forEach(x => n += (Array.isArray(x[1]) ? x[1].length : 0)); return n; };
    function parseArr(v) {
      try { const d = typeof v === 'string' ? JSON.parse(v) : v; if (Array.isArray(d)) return d; } catch (e) {}
      return null;
    }
    function mergeInto(merged, src) {
      (src || []).forEach(g => {
        if (!g || typeof g[0] !== 'string' || !Array.isArray(g[1])) return;
        let t = merged.find(x => x[0] === g[0]);
        if (!t) { t = [g[0], []]; merged.push(t); }
        g[1].forEach(item => { if (t[1].indexOf(item) < 0) t[1].push(item); });
      });
    }
    function finish(merged) {
      try {
        if (cntOf(merged)) gStore.set('my-emoji-groups', JSON.stringify(merged));
        (window.getContacts ? window.getContacts() : [{ id: 'default' }]).forEach(c => {
          try { window.storeFor(c.id || 'default').remove('my-emoji-groups'); } catch (e) {}
        });
        try { gStore.set('mye-global-migrated', '1'); } catch (e) {}
      } catch (e) { try { gStore.set('mye-global-migrated', '1'); } catch (e2) {} }
      if (cntOf(merged) && cntOf(merged) !== cntOf(myGroups)) {
        myGroups = merged;
        if (!emojiPanel.hidden) renderEmojiPanel();
      }
    }
    function run() {
      if (started) return;
      started = true;
      try {
        if (gStore.get('mye-global-migrated') === '1') return;
        // 合并顺序：当前桌面 → 其余联系人桌面 → 全局/顶层旧键（面板分组栏顺序与桌面一致）
        const cids = ((window.getContacts && window.getContacts()) || [{ id: 'default' }]).map(c => c.id || 'default');
        const cur = window.__activeCid || 'default';
        const order = cids.indexOf(cur) >= 0 ? [cur].concat(cids.filter(c => c !== cur)) : cids;
        const merged = [];
        order.forEach(c => { try { mergeInto(merged, parseArr(window.storeFor(c).get('my-emoji-groups'))); } catch (e) {} });
        mergeInto(merged, parseArr(gStore.get('my-emoji-groups'))); // 顶层旧键快照（= 全局键）
        if (!window.idbGet) { finish(merged); return; }
        const reads = order.map(c => MYE_G_PREFIX + ':' + c + ':my-emoji-groups');
        reads.push(MYE_KEY()); // 顶层旧键 IDB 权威
        Promise.all(reads.map(k => window.idbGet(k).catch(() => null))).then(vals => {
          vals.forEach(v => { const d = parseArr(v); if (d) mergeInto(merged, d); });
          finish(merged);
        });
      } catch (e) { try { gStore.set('mye-global-migrated', '1'); } catch (e2) {} }
    }
    if (window.__mochiDataReady) run();
    else document.addEventListener('mochi-restore-done', function h() {
      document.removeEventListener('mochi-restore-done', h);
      run();
    });
  })();

    // 待引用 → 引用块数据：有图片则对象 {t, imgs}（组合消息），否则字符串
  function quoteValue(q) {
    if (!q) return null;
    if (q.imgs && q.imgs.length) return { t: q.text, imgs: q.imgs };
    return q.text;
  }
  // 发送一个表情包（我的/TA 共用；有文字合并气泡，无文字直接发送；带引用则显示引用块）
  function sendSticker(src) {
    // v3.5.127：聊天输入框已改为 contenteditable div（防 Chrome 自动填充条），
    // 读取文本用 textContent 代替 input.value
    const inputEl = document.getElementById('chat-input');
    const text = (inputEl ? (inputEl.textContent || '') : '').trim();
    const quote = lastQuote ? { q: quoteValue(lastQuote), s: lastQuote.side, i: lastQuote.idx } : null;
    // v3.7.x：发送后清引用并刷新预览条（无文字分支也要清，否则引用条残留）
    if (quote) { lastQuote = null; renderDraft(); }
    if (text) {
      lastMineText = text;
      const rec = { side: 'out', text: text, parts: [{ k: 'text', v: text }, { k: 'img', v: src, sub: 'sticker' }] };
      if (quote) { rec.quote = quote.q; rec.qside = quote.s; if (typeof quote.i === 'number' && quote.i >= 0) rec.qidx = quote.i; }
      addRec(rec);
      if (inputEl) inputEl.textContent = '';
      renderDraft();
      if (window.logFish) window.logFish();
      scheduleReply();
    } else {
      lastMineText = src;
      const rec = { side: 'out', text: src, type: 'sticker', parts: [{ k: 'img', v: src }] };
      if (quote) { rec.quote = quote.q; rec.qside = quote.s; if (typeof quote.i === 'number' && quote.i >= 0) rec.qidx = quote.i; }
      addRec(rec);
      if (window.logFish) window.logFish();
      scheduleReply();
    }
    closeEmojiPanel();
  }

  // 分组栏
  // 顶部分组栏：只显示有内容的分组，chip 文本 = 分组名 + 张数（如「猫206」），
  // 点击才在下方显示该分组内容；再点同一分组取消选中（回到提示态）
  // v3.11.x：公用/联系人专属分区分别读 公用键 / 专属键（getScopedGroups，不合并）
  function renderEmojiGroupsBar() {
    if (!emojiGroupsBar) return;
    emojiGroupsBar.innerHTML = '';
    let list = [];
    let cur = '';
    if (emojiMode === 'public') {
      list = (window.getScopedGroups && window.getScopedGroups('sticker', 'public')) || [];
      cur = pubCurGroup;
    } else if (emojiMode === 'ta') {
      list = (window.getScopedGroups && window.getScopedGroups('sticker', 'own')) || [];
      cur = emojiCurGroup;
    } else {
      list = myGroups;
      cur = myCurGroup;
    }
    if (cur && !list.some(g => g[0] === cur)) cur = '';
    // v3.7.x：我的表情包分组栏显示全部分组（含空的）——新建的空分组立即可见；
    // 公用/专属表情包（字卡库 sticker 分类）仍只显示有内容的分组（空分类无意义）
    const chips = list.filter(g => emojiMode === 'mine' ? true : g[1].length).map(g => [g[0], g[0] + g[1].length]);
    chips.forEach(([val, label]) => {
      const c = document.createElement('span');
      c.className = 'emoji-g-chip' + (cur === val ? ' sel' : '');
      c.textContent = label;
      // stopPropagation：防止重渲染后元素被移除，事件冒泡到 document 误判"面板外点击"而关闭面板
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        if (emojiMode === 'public') pubCurGroup = (cur === val ? '' : val);
        else if (emojiMode === 'ta') emojiCurGroup = (cur === val ? '' : val);
        else myCurGroup = (cur === val ? '' : val);
        saveEmojiGroupPref();
        renderEmojiPanel();
      });
      emojiGroupsBar.appendChild(c);
    });
  }

  // 渲染一个分组的网格（分组名已在上方分组栏显示，网格内不再重复标题）
  function renderEmojiGroup(gname, arr, mode) {
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    arr.forEach((src, i) => {
      const d = document.createElement('div');
      d.className = 'emoji-item';
      if (mode === 'mine' && myBatchMode) {
        const k = gname + '\u0001' + i;
        const on = mySel.has(k);
        d.classList.toggle('sel', on);
        // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
        const img = document.createElement('img');
        img.src = src;
        img.alt = '表情';
        d.appendChild(img);
        if (on) {
          const ck = document.createElement('span');
          ck.className = 'emoji-check';
          ck.textContent = '✓';
          d.appendChild(ck);
        }
        d.addEventListener('click', () => {
          if (mySel.has(k)) mySel.delete(k); else mySel.add(k);
          updateBatchCount();
          // v3.5.127：局部 toggle——原先每次勾选整格全量重建（几百张表情时 O(n²)）
          d.classList.toggle('sel', mySel.has(k));
          let ck = d.querySelector('.emoji-check');
          if (mySel.has(k)) {
            if (!ck) { ck = document.createElement('span'); ck.className = 'emoji-check'; ck.textContent = '✓'; d.appendChild(ck); }
          } else if (ck) {
            ck.remove();
          }
        });
      } else {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '表情';
        d.appendChild(img);
        d.addEventListener('click', () => {
          // v3.6.x：写信/回信场景通过 openEmojiPanelForInsert 打开面板 →
          // 点击表情插入信纸而不是发消息（与聊天发消息共用同一个面板）
          if (emojiInsertCb) {
            // 链接导入的表情（原始 URL）不支持插入信纸——信件正文按 data:image 正则
            // 识别内联图片，插 URL 只会显示一长串链接文字；
            // v3.11.x：allowUrl 场景（群聊发送）放行，直接当消息发出去
            if (!/^data:/i.test(src) && !emojiInsertAllowUrl) { toast('链接保存的表情暂不支持插入信纸，请发送消息使用'); return; }
            const cb = emojiInsertCb;
            emojiInsertCb = null;
            emojiInsertAllowUrl = false;
            cb(src);
            closeEmojiPanel();
          } else {
            sendSticker(src);
          }
        });
      }
      grid.appendChild(d);
    });
    emojiList.appendChild(grid);
  }

  function updateBatchCount() {
    if (emojiBatchCount) emojiBatchCount.textContent = '已选 ' + mySel.size + ' 张';
  }

  function renderEmojiPanel() {
    if (!emojiList) return;
    // v3.12.x：开启「隐藏联系人的表情包」→ 隐藏公用/TA 的 tab，强制回到我的表情包
    //（关闭时恢复显示；写信插入/群聊等所有入口都经这里，一处收口）
    const hts = taStickerHidden();
    document.querySelectorAll('#emoji-panel .emoji-tab').forEach(t => { if (t.dataset.etab !== 'mine') t.hidden = hts; });
    if (hts && emojiMode !== 'mine') emojiMode = 'mine';
    // 头部 tab 高亮 + 动态标签（联系人昵称的分区名随当前桌面变化）
    // v3.11.x：选择器收窄到 #emoji-panel——朋友圈评论表情面板复用 .emoji-tab 类，不能误改
    document.querySelectorAll('#emoji-panel .emoji-tab').forEach(t => t.classList.toggle('sel', t.dataset.etab === emojiMode));
    const taTabEl = document.querySelector('#emoji-panel .emoji-tab[data-etab="ta"]');
    if (taTabEl) taTabEl.textContent = chatPartnerName() + ' 的表情包';
    // 工具行 / 批量条：仅我的表情包模式
    if (emojiTools) emojiTools.hidden = emojiMode !== 'mine';
    if (emojiBatch) emojiBatch.hidden = !(emojiMode === 'mine' && myBatchMode);
    renderEmojiGroupsBar();
    emojiList.innerHTML = '';
    if (emojiMode !== 'mine') {
      // ---- 公用 / 联系人专属（sticker 字卡池）：点分组才显示内容 ----
      const isPub = emojiMode === 'public';
      const groups = (window.getScopedGroups && window.getScopedGroups('sticker', isPub ? 'public' : 'own')) || [];
      const emptyAll = isPub
        ? '<div class="emoji-empty">暂无公用表情包<br>请到 字卡库 → 公用字卡 → 表情包 上传</div>'
        : '<div class="emoji-empty">暂无表情包<br>请到 字卡库 → 专属字卡 → 表情包 上传</div>';
      if (!groups.length) {
        emojiList.innerHTML = emptyAll;
        return;
      }
      const curn = isPub ? pubCurGroup : emojiCurGroup;
      if (!curn || !groups.some(x => x[0] === curn)) {
        emojiList.innerHTML = '<div class="emoji-empty">点击上方分组查看表情包</div>';
        return;
      }
      const g = groups.find(x => x[0] === curn);
      if (!g || !g[1].length) {
        emojiList.innerHTML = isPub
          ? '<div class="emoji-empty">该分组暂无公用表情包<br>请到 字卡库 → 公用字卡 → 表情包 上传</div>'
          : '<div class="emoji-empty">该分组暂无表情包<br>请到 字卡库 → 专属字卡 → 表情包 上传</div>';
        return;
      }
      renderEmojiGroup(g[0], g[1], 'ta');
    } else {
      // ---- 我的表情包：点分组才显示内容 ----
      if (!myGroups.length) {
        emojiList.innerHTML = '<div class="emoji-empty">暂无我的表情包<br>点击上方「添加」上传，或「新建分组」</div>';
        return;
      }
      if (!myCurGroup) {
        emojiList.innerHTML = '<div class="emoji-empty">点击上方分组查看表情包</div>';
        return;
      }
      const g = myGroups.find(x => x[0] === myCurGroup);
      if (!g || !g[1].length) {
        emojiList.innerHTML = '<div class="emoji-empty">该分组暂无表情包<br>点击「添加」上传到该分组</div>';
        return;
      }
      renderEmojiGroup(g[0], g[1], 'mine');
      updateBatchCount();
    }
  }

  function openEmojiPanel() {
    if (!emojiPanel) return;
    // v3.9.x：打开前补读 IDB 权威数据（我的表情包大键慢 IDB 下可能只在 IDB；v3.12.x 起为全局键）
    reloadMyEmojiFromIdb();
    // 关闭其他底部半框（拍一拍/头像互动）
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    if (window.closeAvlib) window.closeAvlib();
    // v3.6.x：聊天入口打开 → 面板底部位置恢复正常（写信/回信时用 mail-emoji-mode 贴近底部）
    document.body.classList.remove('mail-emoji-mode');
    // 分组保留上次打开的分类（不重置）；仅退出批量模式
    myBatchMode = false;
    mySel.clear();
    closeIme(); // v3.5.116：收起输入法，面板完整不被键盘遮挡
    renderEmojiPanel();
    emojiPanel.hidden = false;
    // v3.9.x：面板展开挤矮可视区——最底部那条消息会被面板盖住，贴底保持最新可见
    scrollChatBottom();
    if (morePanel) morePanel.hidden = true;
  }
  function closeEmojiPanel() {
    if (emojiPanel) emojiPanel.hidden = true;
    // v3.6.x：关闭面板即放弃「插入信纸」模式，回到聊天发消息语义
    emojiInsertCb = null;
    emojiInsertAllowUrl = false;
  }
  // v3.9.x：打开面板时补读 IDB 权威数据——我的表情包大键（图片 dataURL）可能只在
  // IDB，慢 IDB（OPPO Chrome）下 memoryCache 尚未回填，myEmojiLoad() 读到空 →
  // 「我的表情包整组消失」。重载逻辑与启动恢复一致：IDB 内容更多才覆盖。
  // v3.12.x：全局键后切桌面数据不变，此函数保留为「补读 IDB 权威」（去桌面归属校验）。
  function reloadMyEmojiFromIdb() {
    if (!window.idbGet) return;
    window.idbGet(MYE_KEY()).then(v => {
      if (!v) return;
      try {
        const data = typeof v === 'string' ? JSON.parse(v) : v;
        if (!Array.isArray(data)) return;
        const cnt = (g) => { let n = 0; g.forEach(x => n += (Array.isArray(x[1]) ? x[1].length : 0)); return n; };
        let local = null;
        try { local = JSON.parse(myEmojiStore().get('my-emoji-groups') || 'null'); } catch (e) {}
        const lc = Array.isArray(local) ? cnt(local) : -1;
        if (lc < 0 || cnt(data) > lc) {
          myGroups = data;
          if (!emojiPanel.hidden) renderEmojiPanel();
        }
      } catch (e) {}
    });
  }
  document.addEventListener('contact-switched', function () {
    // v3.12.x：全局共享后数据不随桌面变，重读 + 补渲染仅作慢 IDB 兜底
    myGroups = myEmojiLoad();
    if (!emojiPanel.hidden) renderEmojiPanel();
    reloadMyEmojiFromIdb();
  });
  // v3.12.x：聊天设置切换「隐藏联系人的表情包」→ 面板开着时立即按新状态重渲染
  document.addEventListener('hide-ta-sticker-changed', function () {
    if (emojiPanel && !emojiPanel.hidden) renderEmojiPanel();
  });
  // 邮件写信/回信插入表情也走 openEmojiPanelForInsert → 内部 openEmojiPanel（见下），
  // openEmojiPanel 内已补读新桌面 IDB，避免显示旧桌面残留
  // v3.6.x：写信/回信以「插入模式」打开同一个表情包面板——点击表情回调 cb（插入信纸）
  // v3.11.x：opts.allowUrl=true 时链接保存的表情也走回调（群聊页复用本面板直接发送）
  window.openEmojiPanelForInsert = function (cb, opts) {
    emojiInsertCb = cb || null;
    emojiInsertAllowUrl = !!(opts && opts.allowUrl);
    openEmojiPanel();
    document.body.classList.add('mail-emoji-mode');
  };
  // v3.11.x：群聊页「更多功能」面板打开前收起输入法（closeIme 在本闭包内，暴露只读入口）
  window.closeIme = function () { try { closeIme(); } catch (e) {} };
  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiInsertCb = null; // 聊天入口始终是发消息
      emojiInsertAllowUrl = false;
      openEmojiPanel();
    });
  }
  if (emojiClose) emojiClose.addEventListener('click', (e) => { e.stopPropagation(); closeEmojiPanel(); });
  document.addEventListener('click', (e) => {
    if (emojiPanel && !emojiPanel.hidden && !emojiPanel.contains(e.target) && !emojiBtn.contains(e.target)) closeEmojiPanel();
  });

  // ---- v3.11.x：批量发送（聊天设置「批量发送消息」开启后，输入栏右侧显示按钮）----
  // 可插入文字 / 表情包 / 图片，每个项目作为一条消息，按顺序批量发送到聊天框
  const batchPanel = document.getElementById('batch-panel');
  const batchList = document.getElementById('batch-list');
  const batchCount = document.getElementById('batch-count');
  const batchText = document.getElementById('batch-text');
  const batchBtn = document.getElementById('chat-batch-btn');
  let batchItems = []; // [{type:'text'|'img'|'sticker', text?, src?}]
  let batchPicking = false; // 文件选择器打开期间忽略「点击面板外关闭」，防选图后批量面板被误关
  function batchEnabled() {
    try { return store.get('cs-batch-send') === '1'; } catch (e) { return false; }
  }
  function closeBatchPanel() {
    if (batchPanel) batchPanel.hidden = true;
    try { if (batchText && document.activeElement === batchText) batchText.blur(); } catch (e) {}
  }
  function openBatchPanel() {
    if (!batchPanel) return;
    // 关闭其他底部半框，避免叠加
    const pc = document.getElementById('poke-card');
    if (pc) pc.hidden = true;
    closeEmojiPanel();
    if (window.closeAvlib) window.closeAvlib();
    closeIme(); // 收起输入法，面板完整不被键盘遮挡
    renderBatchList();
    batchPanel.hidden = false;
    scrollChatBottom();
    const morePanel = document.getElementById('chat-more-panel');
    if (morePanel) morePanel.hidden = true;
  }
  function renderBatchList() {
    if (!batchList) return;
    if (batchCount) batchCount.textContent = batchItems.length + ' 条';
    batchList.innerHTML = '';
    if (!batchItems.length) {
      batchList.innerHTML = '<div class="batch-empty">还没有要发送的消息<br>可添加文字 / 表情包 / 图片</div>';
      return;
    }
    batchItems.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'batch-item';
      const idx = document.createElement('span');
      idx.className = 'batch-item-idx';
      idx.textContent = i + 1;
      row.appendChild(idx);
      if (it.type === 'text') {
        const t = document.createElement('span');
        t.className = 'batch-item-text';
        t.textContent = it.text;
        row.appendChild(t);
      } else {
        const img = document.createElement('img');
        img.className = 'batch-item-media';
        img.src = it.src;
        img.alt = it.type === 'sticker' ? '表情包' : '图片';
        row.appendChild(img);
      }
      const ty = document.createElement('span');
      ty.className = 'batch-item-type';
      ty.textContent = it.type === 'text' ? '文字' : (it.type === 'sticker' ? '表情包' : '图片');
      row.appendChild(ty);
      const x = document.createElement('button');
      x.className = 'batch-item-x';
      x.textContent = '✕';
      x.addEventListener('click', () => { batchItems.splice(i, 1); renderBatchList(); });
      row.appendChild(x);
      batchList.appendChild(row);
    });
  }
  function batchAddText() {
    if (!batchText) return;
    const v = (batchText.value || '').trim();
    if (!v) { toast('请输入文字'); return; }
    batchItems.push({ type: 'text', text: v });
    batchText.value = '';
    renderBatchList();
  }
  // 批量插入图片：多选 → 压缩（同输入栏图片按钮逻辑，720px / JPEG .85）→ 每张一条
  function batchAddImages(files) {
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            const scale = Math.min(1, 720 / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            batchItems.push({ type: 'img', src: c.toDataURL('image/jpeg', 0.85) });
          } catch (err) {
            batchItems.push({ type: 'img', src: reader.result });
          }
          renderBatchList();
        };
        img.onerror = () => {
          batchItems.push({ type: 'img', src: reader.result });
          renderBatchList();
          toast('部分图片无法压缩，已按原图添加');
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  }
  // 每个项目作为一条独立消息发送（按顺序）
  function sendBatchItem(it) {
    if (it.type === 'text') {
      lastMineText = it.text;
      addRec({ side: 'out', text: it.text, parts: [{ k: 'text', v: it.text }] });
    } else if (it.type === 'img') {
      lastMineText = it.src;
      addRec({ side: 'out', text: it.src, parts: [{ k: 'img', v: it.src, sub: 'image' }] });
    } else {
      lastMineText = it.src;
      addRec({ side: 'out', text: it.src, type: 'sticker', parts: [{ k: 'img', v: it.src }] });
    }
  }
  function sendBatchAll() {
    if (!batchItems.length) { toast('还没有要发送的消息'); return; }
    const items = batchItems.slice();
    batchItems = [];
    renderBatchList();
    closeBatchPanel();
    if (window.playSfx) window.playSfx('out');
    items.forEach(sendBatchItem);
    if (window.logFish) window.logFish();
    scheduleReply();
    toast('已批量发送 ' + items.length + ' 条消息');
  }
  function syncBatchBtn() {
    if (!batchBtn) return;
    batchBtn.style.display = batchEnabled() ? '' : 'none';
    if (!batchEnabled()) closeBatchPanel();
  }
  if (batchBtn) {
    batchBtn.addEventListener('click', (e) => { e.stopPropagation(); openBatchPanel(); });
  }
  const batchClose = document.getElementById('batch-close');
  if (batchClose) batchClose.addEventListener('click', (e) => { e.stopPropagation(); closeBatchPanel(); });
  const batchAdd = document.getElementById('batch-text-add');
  if (batchAdd) batchAdd.addEventListener('click', (e) => { e.stopPropagation(); batchAddText(); });
  if (batchText) {
    batchText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); batchAddText(); }
    });
  }
  const batchEmoji = document.getElementById('batch-emoji');
  if (batchEmoji) {
    batchEmoji.addEventListener('click', (e) => {
      e.stopPropagation();
      // 先收起批量面板，再弹表情包面板——两者同为 .poke-card 底部半框（z-index 相同），
      // 不收起会叠在一起：DOM 靠后的批量面板盖在表情包面板上，导致表情包面板无法使用
      closeBatchPanel();
      // 复用表情包面板「插入模式」：点表情加入批量队列（不直接发送），选完自动回到批量面板
      if (window.openEmojiPanelForInsert) {
        window.openEmojiPanelForInsert((src) => {
          batchItems.push({ type: 'sticker', src: src });
          renderBatchList();
          openBatchPanel(); // 重新打开批量面板，方便继续添加 / 发送
        });
      } else {
        toast('表情包面板暂不可用');
      }
    });
  }
  const batchImg = document.getElementById('batch-img');
  if (batchImg) {
    batchImg.addEventListener('click', (e) => {
      e.stopPropagation();
      // iOS Safari：input 必须先挂到 body 再 click（同 chatcard.pickFiles 套路）
      // 部分浏览器（安卓系统文件选择器）选完/取消后会向 document 派发 click，会触发
      // 「点击面板外关闭」把批量面板误关——打开选择器期间用 batchPicking 屏蔽
      batchPicking = true;
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
      fi.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(fi);
      fi.onchange = () => {
        batchPicking = false;
        const files = Array.prototype.slice.call(fi.files || []);
        fi.value = '';
        try { fi.remove(); } catch (err2) {}
        if (files.length) batchAddImages(files);
      };
      fi.onblur = () => {
        // 选择器关闭（选中或取消）后恢复；延迟等系统对话框彻底退场
        setTimeout(() => {
          batchPicking = false;
          try { if (fi.parentNode) fi.remove(); } catch (err2) {}
        }, 800);
      };
      try { fi.click(); } catch (err2) { batchPicking = false; try { fi.remove(); } catch (err3) {} }
    });
  }
  const batchClear = document.getElementById('batch-clear');
  if (batchClear) batchClear.addEventListener('click', (e) => { e.stopPropagation(); batchItems = []; renderBatchList(); });
  const batchSendAll = document.getElementById('batch-send-all');
  if (batchSendAll) batchSendAll.addEventListener('click', (e) => { e.stopPropagation(); sendBatchAll(); });
  // 点击面板外关闭（文件选择器打开期间忽略，避免选图后误关批量面板）
  document.addEventListener('click', (e) => {
    if (batchPicking) return;
    if (batchPanel && !batchPanel.hidden && !batchPanel.contains(e.target) && batchBtn && !batchBtn.contains(e.target)) closeBatchPanel();
  });
  // 切联系人：清空队列 + 同步按钮显隐 + 关闭面板（开关按联系人独立）
  document.addEventListener('contact-switched', () => {
    batchItems = [];
    renderBatchList();
    syncBatchBtn();
  });
  // 聊天设置开关变化：即时刷新按钮显隐
  document.addEventListener('batch-send-changed', syncBatchBtn);
  syncBatchBtn();

  // ---- 我的表情包：tab 切换 + 工具 ----
  document.querySelectorAll('.emoji-tab').forEach(t => t.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiMode = t.dataset.etab;
    myBatchMode = false;
    mySel.clear();
    // 分组各自保留（TA/我的 分开记忆），切换不重置
    saveEmojiGroupPref();
    renderEmojiPanel();
    // v3.12.x：部分安卓浏览器（vivo/OPPO 等）对保持聚焦的按钮画虚线框，被点的 tab
    // 会显示成虚线与其他两个不一致——点完即失焦（CSS 已同时关 outline 兜底）
    try { t.blur(); } catch (err) {}
  }));

  // 压缩图片（我的表情包添加用，260px 与字卡库一致）
  // v3.6.x：失败/超大图不再回退存原图——iOS Safari 解码超大 dataURL 会拖崩渲染进程
  //（画面正常但点击无响应，刷新后恢复又崩），失败返回 null 由调用方提示换图
  function compressMyEmoji(dataUrl, maxSide) {
    return new Promise((resolve) => {
      // 解码前拦截：>8MB base64 不解码不存储
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
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // 新建分组（已并入「管理分组」弹层，不再单独展示按钮）
  const myeNew = document.getElementById('mye-new');
  if (myeNew) {
    myeNew.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openModal) {
        window.openModal('新建表情包分组', '', (v) => {
          const name = (v || '').trim();
          if (!name) return;
          if (myGroups.some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
          // v3.7.x：新分组插到最前，创建后选中并打开该分组（顶部分组栏立即可见）
          myGroups.unshift([name, []]);
          myEmojiSave();
          myCurGroup = name;
          saveEmojiGroupPref();
          renderEmojiPanel();
        });
      }
    });
  }

  // 添加表情（上传图片到当前分组；无分组自动建「默认」）
  const myeAdd = document.getElementById('mye-add');
  if (myeAdd) {
    myeAdd.addEventListener('click', (e) => {
      e.stopPropagation();
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
      fi.onchange = () => {
        const files = Array.prototype.slice.call(fi.files || []);
        if (!files.length) return;
        // 目标分组：当前选中分组 → 第一个分组 → 新建「默认」
        let g = null;
        if (myCurGroup) g = myGroups.find(x => x[0] === myCurGroup) || null;
        if (!g && myGroups.length) g = myGroups[0];
        if (!g) { g = ['默认', []]; myGroups.unshift(g); }
        let done = 0, okCount = 0;
        files.forEach(f => {
          const reader = new FileReader();
          reader.onload = () => {
            // v3.7.x：GIF 动图直存原图——canvas 压缩只能画第一帧，会把动图压成静态图；
            // 但超大 GIF 的 base64 会撑爆存储，超过 8MB 跳过（与 compressMyEmoji 拦截口径一致）
            const isGif = /image\/gif/i.test(f.type || '') || /\.gif$/i.test(f.name || '');
            if (isGif) {
              if (reader.result.length > 8 * 1024 * 1024) {
                done++;
                if (done === files.length) { myEmojiSave(); renderEmojiPanel(); toast('动图过大，已跳过（请用 10MB 以内的 GIF）'); }
                return;
              }
              g[1].push(reader.result);
              okCount++;
              done++;
              if (done === files.length) {
                const ok = myEmojiSave();
                myCurGroup = g[0];
                renderEmojiPanel();
                if (!ok) toast('存储空间不足：表情已用备用存储，刷新后恢复。请清理不用的表情');
                else toast('已添加 ' + okCount + ' 个表情');
              }
              return;
            }
            compressMyEmoji(reader.result, 260).then(data => {
              // v3.6.x：压缩失败/图片过大返回 null——不存原图（防 iOS 解码崩溃），提示换图
              if (!data) {
                done++;
                if (done === files.length) { myEmojiSave(); renderEmojiPanel(); toast('图片过大或格式不支持，已跳过'); }
                return;
              }
              g[1].push(data);
              okCount++;
              done++;
              if (done === files.length) {
                const ok = myEmojiSave();
                myCurGroup = g[0];
                renderEmojiPanel();
                if (!ok) toast('存储空间不足：表情已用备用存储，刷新后恢复。请清理不用的表情');
                else toast('已添加 ' + okCount + ' 个表情');
              }
            });
          };
          reader.onerror = () => { done++; if (done === files.length) { myEmojiSave(); renderEmojiPanel(); toast('部分图片读取失败'); } };
          reader.readAsDataURL(f);
        });
      };
      fi.click();
    });
  }

  // 链接导入表情（v3.11.x，单链接/批量链接通用）：粘贴图片 URL 一行一个。
  // 优先 fetch 抓取 → compressMyEmoji 转存（与上传同一压缩口径，离线可用）；
  // 图床不允许跨域读取（CORS）/网络失败时回退存原始 http(s) 链接（需联网显示，
  // 表情面板/聊天气泡按 <img src> 渲染对远程链接天然兼容）；响应不是图片则判失败不存。
  // 拆行 + 清洗粘贴带上的尖括号/引号包裹，只放行 http(s) 地址；
  // 支持行首【组名】前缀指定落点分组（与字卡库/文字批量导入同一写法）
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
  function fetchLinkImage(url, processData) {
    const once = (u) => new Promise((resolve) => {
      let settled = false;
      const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => finish({ st: 'url', v: u }), 12000);
      fetch(u, { mode: 'cors' }).then(res => {
        if (!res.ok) throw new Error('http' + (res.status || ''));
        return res.blob();
      }).then(blob => {
        if (!/^image\//i.test(blob.type || '')) throw new Error('notimage');
        const fr = new FileReader();
        fr.onload = () => {
          const raw = String(fr.result || '');
          if (/image\/gif/i.test(blob.type)) {
            finish(raw.length > 8 * 1024 * 1024 ? { st: 'url', v: u } : { st: 'data', v: raw });
            return;
          }
          processData(raw).then(d => finish(d ? { st: 'data', v: d } : { st: 'url', v: u }));
        };
        fr.onerror = () => finish({ st: 'fail', v: u });
        fr.readAsDataURL(blob);
      }).catch(err => {
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
  // 简易并发池（并发 4，与 chatcard.js 字卡库导入同一套；结果按原始下标回填）
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
  let myeLinkBusy = false; // 防重复提交：上一批还在抓取时不允许叠开第二批
  const myeAddLink = document.getElementById('mye-add-link');
  if (myeAddLink) {
    myeAddLink.addEventListener('click', (e) => {
      e.stopPropagation();
      if (myeLinkBusy) { toast('上一批链接还在导入中，请稍等'); return; }
      if (!window.openModal) return;
      window.openModal('链接导入表情（一行一个链接）', '', (raw, targetGroup) => {
        const items = splitUrlItems(raw);
        if (!items.length) { toast('没有可导入的图片链接（需以 http(s):// 开头）'); return; }
        myeLinkBusy = true;
        // 落点分组优先级：行首【组名】> 弹窗「目标分组」下拉 > 当前选中分组 > 「默认」
        let newGroups = 0;
        const buckets = {};
        const resolveBucket = (name) => {
          if (!buckets[name]) {
            let g = myGroups.find(x => x[0] === name);
            if (!g) { g = [name, []]; myGroups.unshift(g); newGroups++; }
            buckets[name] = { g: g, seen: new Set(g[1]) }; // 分组内去重：已有表情 + 本次已导入都算重复
          }
          return buckets[name];
        };
        const jobs = items.map(it => ({ url: it.url, bucket: resolveBucket(it.g || targetGroup || myCurGroup || '默认') }));
        let okData = 0, okUrl = 0, dup = 0, fail = 0, httpSaved = 0;
        toast('开始导入 ' + jobs.length + ' 个链接…');
        runLinkPool(jobs, (job) => fetchLinkImage(job.url, (d) => compressMyEmoji(d, 260))).then(results => {
          results.forEach((res, i) => {
            const b = jobs[i].bucket;
            if (res.st === 'fail') fail++;
            else if (b.seen.has(res.v)) dup++;
            else {
              b.seen.add(res.v);
              b.g[1].push(res.v);
              if (res.st === 'data') okData++;
              else {
                okUrl++;
                if (/^http:\/\//i.test(jobs[i].url)) httpSaved++; // 升级 https 抓取也失败才落到这里
              }
            }
          });
          const ok = myEmojiSave();
          myCurGroup = jobs[0].bucket.g[0];
          renderEmojiPanel();
          myeLinkBusy = false;
          const got = okData + okUrl;
          if (!ok && got) toast('存储空间不足：表情已用备用存储，刷新后恢复。请清理不用的表情');
          else toast('已导入 ' + got + ' 个表情' +
            (okUrl ? '（其中 ' + okUrl + ' 个按链接保存，需联网显示' + (httpSaved ? '；含 ' + httpSaved + ' 个 http 链接，本站可能拦截不显示' : '') + '）' : '') +
            (dup ? '，跳过重复 ' + dup + ' 个' : '') +
            (fail ? '，失败 ' + fail + ' 个（非图片地址）' : '') +
            (newGroups ? '，新建 ' + newGroups + ' 个分组' : ''));
        }, () => {
          myeLinkBusy = false;
          toast('导入出错，请重试');
        });
      }, {
        textarea: true,
        textareaPlaceholder: 'https://example.com/sticker.png\n一行一个链接，可粘贴多个批量导入\n可用【分组名】前缀指定分组，如：【日常】https://…\n\n提示：优先尝试转存为本地图片；图床不允许跨域时按链接保存',
        groups: myGroups.map(g => g[0])
      });
    });
  }

  // 批量管理：进入 / 全选 / 删除 / 退出
  const myeBatch = document.getElementById('mye-batch');
  if (myeBatch) {
    myeBatch.addEventListener('click', (e) => {
      e.stopPropagation();
      myBatchMode = true;
      mySel.clear();
      renderEmojiPanel();
    });
  }
  const emojiBatchAll = document.getElementById('emoji-batch-all');
  if (emojiBatchAll) {
    emojiBatchAll.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!myCurGroup) { toast('请先点击上方分组'); return; }
      const keys = [];
      const list = myGroups.filter(g => g[0] === myCurGroup);
      list.forEach(([gname, arr]) => arr.forEach((c, i) => keys.push(gname + '\u0001' + i)));
      if (mySel.size === keys.length && keys.length) mySel.clear();
      else keys.forEach(k => mySel.add(k));
      renderEmojiPanel();
    });
  }
  const emojiBatchDel = document.getElementById('emoji-batch-del');
  if (emojiBatchDel) {
    emojiBatchDel.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!mySel.size) { toast('请先选择要删除的表情'); return; }
      if (window.openModal) {
        window.openModal('删除选中的 ' + mySel.size + ' 个表情？', '', () => {
          myGroups.forEach(([gname, arr]) => {
            for (let i = arr.length - 1; i >= 0; i--) {
              if (mySel.has(gname + '\u0001' + i)) arr.splice(i, 1);
            }
          });
          mySel.clear();
          myEmojiSave();
          renderEmojiPanel();
        }, { noInput: true });
      }
    });
  }
  const emojiBatchExit = document.getElementById('emoji-batch-exit');
  if (emojiBatchExit) {
    emojiBatchExit.addEventListener('click', (e) => {
      e.stopPropagation();
      myBatchMode = false;
      mySel.clear();
      renderEmojiPanel();
    });
  }

  // 管理分组：弹层（新建 / 重命名 / 删除）
  let myMgMask = null;
  function openMyEmojiManage() {
    if (!myMgMask) {
      myMgMask = document.createElement('div');
      myMgMask.className = 'mg-mask';
      myMgMask.innerHTML =
        '<div class="mg-panel my-mg-panel">' +
          '<div class="mg-head"><span>管理表情包分组</span><button class="mg-close">✕</button></div>' +
          '<div class="mg-list"></div>' +
          '<button class="mg-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M12 5v14M5 12h14"/></svg>新建分组</button>' +
        '</div>';
      document.body.appendChild(myMgMask);
      myMgMask.querySelector('.mg-close').addEventListener('click', () => { myMgMask.hidden = true; });
      myMgMask.addEventListener('click', (e) => { if (e.target === myMgMask) myMgMask.hidden = true; });
      myMgMask.querySelector('.mg-add').addEventListener('click', () => {
        if (window.openModal) {
          window.openModal('新建表情包分组', '', (v) => {
            const name = (v || '').trim();
            if (!name) return;
            if (myGroups.some(g => g[0] === name)) { toast('分组「' + name + '」已存在'); return; }
            // v3.7.x：新分组插到最前（顶部），创建后选中它并自动关掉管理弹层
            // （与字卡库「管理分组」一致），用户马上能在分组栏顶部看到并添加表情
            myGroups.unshift([name, []]);
            myEmojiSave();
            myCurGroup = name;
            saveEmojiGroupPref();
            myMgMask.hidden = true;
            renderEmojiPanel();
          });
        }
      });
    }
    function renderMyMgList() {
      const listEl = myMgMask.querySelector('.mg-list');
      if (!myGroups.length) { listEl.innerHTML = '<div class="mg-empty">暂无分组，点击下方新建</div>'; return; }
      listEl.innerHTML = '';
      myGroups.forEach((g, gi) => {
        const row = document.createElement('div');
        row.className = 'mg-row';
        row.innerHTML = '<span class="mg-name">' + g[0] + '</span><span class="mg-count">' + (g[1] || []).length + ' 张</span>' +
          '<button class="mg-rn">改名</button><button class="mg-del">✕</button>';
        row.querySelector('.mg-rn').addEventListener('click', () => {
          if (window.openModal) {
            window.openModal('重命名分组', g[0], (v) => {
              const name = (v || '').trim();
              if (!name || name === g[0]) return;
              if (myGroups.some(x => x[0] === name)) { toast('分组「' + name + '」已存在'); return; }
              g[0] = name;
              // v3.5.128：重命名后旧分组名的勾选键失效——清空选择，避免计数残留/删错
              mySel.clear();
              updateBatchCount();
              myEmojiSave();
              renderMyMgList();
              renderEmojiPanel();
            });
          }
        });
        row.querySelector('.mg-del').addEventListener('click', () => {
          if (window.openModal) {
            window.openModal('删除分组「' + g[0] + '」及其全部表情？', '', () => {
              myGroups.splice(gi, 1);
              if (myCurGroup === g[0]) myCurGroup = '';
              mySel.clear();
              myEmojiSave();
              renderMyMgList();
              renderEmojiPanel();
            }, { noInput: true });
          }
        });
        listEl.appendChild(row);
      });
    }
    myMgMask.hidden = false;
    renderMyMgList();
  }
  const myeManage = document.getElementById('mye-manage');
  if (myeManage) {
    myeManage.addEventListener('click', (e) => {
      e.stopPropagation();
      openMyEmojiManage();
    });
  }


  // 发送消息（支持 文字 + 图片/表情 组合成一条消息）
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const draftEl = document.getElementById('chat-draft');
  const draftItems = document.getElementById('chat-draft-items');
  const quoteEl = document.getElementById('chat-draft-quote');
  let draftImgs = []; // 待发送图片（表情包/图片 dataURL）
  // v3.7.x：引用预览条——点消息操作「引用」后在输入栏上方显示引用了什么，
  // 支持点 ✕ 删除（lastQuote 置空）。与图片草稿共用 #chat-draft 容器，
  // 引用条在上、图片缩略图在下，任一存在整条草稿区就可见。
  function renderQuoteBar() {
    if (!quoteEl) return;
    quoteEl.innerHTML = '';
    if (!lastQuote) { quoteEl.hidden = true; return; }
    quoteEl.hidden = false;
    const bar = document.createElement('div');
    bar.className = 'chat-draft-quote-bar';
    const thumb = (lastQuote.imgs && lastQuote.imgs.length) ? lastQuote.imgs[0] : null;
    if (thumb) {
      // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
      const img = document.createElement('img');
      img.className = 'chat-draft-quote-img';
      img.src = thumb;
      img.alt = '';
      bar.appendChild(img);
    }
    const t = document.createElement('span');
    t.className = 'chat-draft-quote-text';
    // v3.7.x：保险——text 若是 base64 dataURL（长乱码）换成占位，防其他路径传入
    const raw = lastQuote.text || '';
    // v3.7.x：图片/表情包引用——已有缩略图时占位文案（图片/表情包）不再重复显示
    const hidePh = !!(thumb && QUOTE_PLACEHOLDER.test(raw));
    t.textContent = (raw.indexOf('data:') === 0 && raw.length > 64)
      ? (lastQuote.type === 'sticker' ? '表情包' : '图片')
      : (hidePh ? '' : (raw || '图片'));
    bar.appendChild(t);
    const xBtn = document.createElement('button');
    xBtn.className = 'chat-draft-x chat-draft-quote-x';
    xBtn.textContent = '✕';
    xBtn.addEventListener('click', () => {
      lastQuote = null;
      renderDraft();
    });
    bar.appendChild(xBtn);
    quoteEl.appendChild(bar);
  }
  function renderDraft() {
    if (!draftEl || !draftItems) return;
    renderQuoteBar();
    draftEl.hidden = !draftImgs.length && !lastQuote;
    draftItems.innerHTML = '';
    draftImgs.forEach((src, i) => {
      const it = document.createElement('div');
      it.className = 'chat-draft-item';
      // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      const xBtn = document.createElement('button');
      xBtn.className = 'chat-draft-x';
      xBtn.dataset.i = i;
      xBtn.textContent = '✕';
      it.appendChild(img);
      it.appendChild(xBtn);
      xBtn.addEventListener('click', () => {
        draftImgs.splice(i, 1);
        renderDraft();
      });
      draftItems.appendChild(it);
    });
  }
  // 图片按钮：多选图片 → 压缩 → 加入待发送
  const imgBtn = document.getElementById('chat-img-btn');
  if (imgBtn) {
    imgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true;
      fi.onchange = () => {
        const files = Array.prototype.slice.call(fi.files || []);
        if (!files.length) return;
        files.forEach(f => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              try {
                const c = document.createElement('canvas');
                const scale = Math.min(1, 720 / Math.max(img.width, img.height));
                c.width = Math.max(1, Math.round(img.width * scale));
                c.height = Math.max(1, Math.round(img.height * scale));
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                draftImgs.push(c.toDataURL('image/jpeg', 0.85));
              } catch (err) {
                draftImgs.push(reader.result);
              }
              renderDraft();
            };
            // v3.5.131：解码失败（HEIC/损坏图）不再静默丢失——原图兜底 + 提示
            img.onerror = () => {
              draftImgs.push(reader.result);
              renderDraft();
              toast('部分图片无法压缩，已按原图添加');
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(f);
        });
      };
      fi.click();
    });
  }
  function buildParts(text) {
    const parts = [];
    const t = (text || '').trim();
    if (t) parts.push({ k: 'text', v: t });
    // 插入的图片：大图（可点击查看）
    draftImgs.forEach(src => parts.push({ k: 'img', v: src, sub: 'image' }));
    return parts;
  }
  // v3.12.x：防重发窗口——OPPO 默认浏览器 / vivo Edge / iOS Safari 实测均有重复问题：
  // 发送成功清空 contenteditable 后，输入法重组/自动填充会把刚发的文本"复活"回输入框
  //（iOS 中文键盘确认候选词还会先补发一个干净 Enter 触发"确认即发送"，清空时合成
  // 会话未结束→文本必然重组回来），用户看到字还在再点一次发送就出两条一模一样的
  // 消息；部分内核还对同一动作重复派发事件。复活后的补点一般在 0.1~1.2s 内，故窗口
  // 取 1200ms——同非空文本窗口内第二次 addMsg 直接吞掉并清理输入区（不响音效、不再
  // 排回复轮，TA 回复不再成对出现）；窗口外的人工重发不受影响。
  const SEND_GUARD_MS = 1200;
  let lastSendTxt = '', lastSendTs = 0;
  const addMsg = (text) => {
    const t0 = (text || '').trim();
    if (t0 && t0 === lastSendTxt && Date.now() - lastSendTs < SEND_GUARD_MS) {
      input.textContent = '';
      draftImgs = [];
      renderDraft();
      return;
    }
    const parts = buildParts(text);
    if (!parts.length) return;
    const t = t0;
    lastMineText = t || (draftImgs.length ? draftImgs[0] : '');
    const rec = { side: 'out', text: lastMineText, parts: parts };
    if (lastQuote) {
      rec.quote = quoteValue(lastQuote);
      rec.qside = lastQuote.side;
      // v3.12.x：带上被引消息下标（点引用块跳回原消息）
      if (typeof lastQuote.idx === 'number' && lastQuote.idx >= 0) rec.qidx = lastQuote.idx;
      lastQuote = null;
    }
    addRec(rec);
    lastSendTxt = t;
    lastSendTs = Date.now();
    // v3.5.60：我发送消息播放设置的音效
    if (window.playSfx) window.playSfx('out');
    // v3.5.127：contenteditable 版输入框清空用 textContent
    input.textContent = '';
    draftImgs = [];
    renderDraft();
    if (window.logFish) window.logFish();
    try { window.__replyOnceDiag = 0; console.log('[mochi-reply] addMsg 发送, 重置 replyOnce 计数'); } catch(e){}
    scheduleReply();
  };
  if (send) send.addEventListener('click', () => addMsg(input.innerText));
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        // v3.5.127：contenteditable 里 Enter 默认插入换行——阻止后由发送逻辑接管
        e.preventDefault();
        // v3.5.134：innerText 读值——粘贴多行文本时 textContent 会把换行拼成一行
        addMsg(input.innerText);
      }
    });
  }
  // 主动发送：应用加载即启动（不依赖进入聊天页，进聊天页也不重置计时器）
  // v3.6.x：延迟到 replyCfg 就绪后再启动——chat.js 先于 reply-settings.js 加载，
  // 同步启动会在 replyCfg 未定义时用代码内默认值（5~10 分钟）计算首次延迟，
  // 导致即使把发送间隔调到 1 分钟，第一条主动消息也要等 5~10 分钟
  function bootAutoSend() {
    if (window.replyCfg) scheduleAutoSend();
    else setTimeout(bootAutoSend, 500);
  }
  // v3.11.x：暴露给番茄钟陪伴模式——从番茄钟页一键进入聊天页
  window.enterChat = enterChat;
  bootAutoSend();
  // v3.5.128：启动即加载聊天记录到内存——统计页/TA问答等模块通过 getChatMsgs
  // 读取时不再拿到空数组（原先只有进聊天页才 loadMsgs）
  loadMsgs();
  // 红包过期检查：启动后 2s（待数据就绪）+ 每小时定时
  setTimeout(rpExpireCheck, 2000);
  setInterval(rpExpireCheck, 60 * 60 * 1000);
  // 红包封面：从 idb 补读到 ls（大键可能只存 idb）
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':' + RP_COVER_KEY).then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2) store.set(RP_COVER_KEY, v);
      });
    }
  } catch (e) {}
  // 对外发送消息接口（占卜结果发送给 TA 等复用）
  window.chatSendMsg = (text) => { if (typeof text === 'string' && text.trim()) addMsg(text.trim()); };
  // 花园送花卡片接口（garden.js 复用）：fromTA=true 时显示为对方送的花
  window.chatSendFlower = (emoji, name, wish, fromTA) => {
    return addRec({ side: fromTA ? 'in' : 'out', special: 'flower', flEmoji: emoji, flName: name, flWish: wish || '' });
  };
  // v3.5.94：收藏消息含图片，可能只存在 IndexedDB → 启动补读（收藏页打开时才渲染，届时读到）
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':fav-msgs').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2) store.set('fav-msgs', v);
      });
    }
  } catch (e) {}
  // v3.5.100：页面加载时恢复桌面「聊天」未读提醒
  updateChatBadge();
  // v3.x.x：称呼设置变化 → 重渲染当前窗口（显示层替换，存储原文不动）
  document.addEventListener('ta-word-changed', function () {
    try { if (msgs.length) renderWindow(false, false); } catch (e) {}
  });
})();

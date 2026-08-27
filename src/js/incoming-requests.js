// ===== 功能：跨桌面「来消息」弹窗（其他桌面联系人来查岗 / 求聊天） v3.17.x =====
// 你在 A 桌面时，B / C 桌面的 TA 可能按各自桌面的设置主动来查岗、求聊天。
// 触发 → 弹全局弹窗（openModal）：「<B 昵称> 来查岗了：xxx」[ 现在回TA / 稍后 ]。
// 点「现在回TA」→ 切到对应桌面 + 进聊天，等该桌面聊天加载就绪后，TA 当场发出
// 查岗卡（可回答）或一句开场白——对话是切过去之后自然产生的。
//
// 设计要点：
// ① 申请消息只存全局根键 xy-home-v2:incoming-requests，绝不写任何桌面的 chat-msgs，
//    聊天记录零污染（与 feed/call 的"系统消息直写他桌面聊天"不同）。
// ② 调度仿 feed.js maybeAutoPost：定时轮询遍历所有联系人，非激活桌面按各自配置
//    掷概率（查岗读回复设置 ckq-*、求聊天读 as-*），激活桌面不做跨桌面打扰。
// ③ 每联系人独立冷却 + 未处理 pending 不重复触发；页面在后台时走 bgNotifyCheck
//    系统通知，不弹页面窗。
// ④ v3.17.x：全局开关「桌面查岗」默认开启、可在设置页关闭——键 xy-home-v2:desk-checkin-en
//    存根命名空间（全桌面通，不随联系人隔离）；关闭后不再触发任何跨桌面查岗/求聊天。
//    设置页开关行由本文件动态插入（不动 template.html，避免跨域改 AI-B 文件）。
// ⑤ v3.17.x：跨桌面通话——非激活桌面的联系人按各自 call-incoming 概率来电（kind:'call'），
//    弹窗「接听/稍后」，接听切过去触发 triggerIncomingCall（通话归属该桌面，记录/系统消息正确）；
//    全局开关 xy-home-v2:desk-call-en 默认开启、可关闭（关闭后不再有跨桌面来电）。
// 归属：AI-A（业务功能）。依赖 idb.js/contacts.js/personalize.js(openModal)/chat.js/call.js。
(function () {
  if (!window.activeStore || !window.getContacts) return;
  const ROOT = 'xy-home-v2';
  const KEY = 'incoming-requests';
  const EN_KEY = 'desk-checkin-en';
  const CALL_EN_KEY = 'desk-call-en';
  const MAX = 20;                       // 队列上限，防膨胀
  const CHECK_MS = 60 * 1000;           // 轮询间隔
  const chatCoolMs = 3 * 60 * 60 * 1000; // 求聊天冷却（3 小时，比查岗久）
  const seenKeepMs = 24 * 60 * 60 * 1000; // seen 记录保留 24h 后清理
  const POKE_MSGS = ['在干嘛呢？', '忙完了吗？', '想我了没有？', '我来看看你。'];

  // ---- 全局开关（全桌面通，默认开启） ----
  function deskCheckinEn() {
    try {
      const v = window.xyStore(ROOT).get(EN_KEY);
      if (v === null || v === undefined || v === '') return true; // 默认开
      return v === '1';
    } catch (e) { return true; }
  }
  window.setDeskCheckinEn = function (en) {
    try { window.xyStore(ROOT).set(EN_KEY, en ? '1' : '0'); } catch (e) {}
  };
  function deskCallEn() {
    try {
      const v = window.xyStore(ROOT).get(CALL_EN_KEY);
      if (v === null || v === undefined || v === '') return true; // 默认开
      return v === '1';
    } catch (e) { return true; }
  }
  window.setDeskCallEn = function (en) {
    try { window.xyStore(ROOT).set(CALL_EN_KEY, en ? '1' : '0'); } catch (e) {}
  };

  // 设置页开关行（动态插入「开启群聊」行之后；样式复用 .set-row/.toggle/.txt .sub）
  // 全桌面通：根键不随联系人隔离，切桌面/回填后只需同步一次勾选态。
  function addSettingToggle(conf) {
    try {
      if (document.getElementById(conf.id + '-row')) return;
      const anchor = document.getElementById('sf-group-chat-row');
      if (!anchor) return;
      const row = document.createElement('div');
      row.className = 'set-row';
      row.id = conf.id + '-row';
      row.innerHTML =
        '<div class="ico">' + conf.ico + '</div>' +
        '<div class="txt">' + conf.title + '<span class="sub">' + conf.sub + '</span></div>' +
        '<label class="toggle"><input type="checkbox" id="' + conf.id + '"><span class="tk"></span></label>';
      anchor.parentNode.insertBefore(row, anchor.nextSibling);
      const input = row.querySelector('input');
      const sync = function () { const v = conf.get(); if (v !== input.checked) input.checked = v; };
      sync();
      input.addEventListener('change', function () {
        if (input.checked === conf.get()) return;
        conf.set(input.checked);
        if (typeof window.toast === 'function') window.toast(conf.toast(input.checked));
      });
      document.addEventListener('contact-switched', sync);
      document.addEventListener('mochi-restore-done', sync);
      return row;
    } catch (e) { return null; }
  }
  (function () {
    addSettingToggle({
      id: 'sf-desk-checkin',
      ico: '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M4.2 4.2l2.2 2.2M2 12h3M19 12h3M4.2 19.8l2.2-2.2M17.6 17.6l2.2 2.2"/><path d="M12 6a6 6 0 016 6v4h-3v-4a3 3 0 00-6 0v4H6v-4a6 6 0 016-6z"/><path d="M9 20h6"/></svg>',
      title: '开启 联系人跨桌面查岗',
      sub: '其他桌面的联系人是各自独立触发，互不影响：每 60 秒轮询一次，每人按各自概率（默认约 2%，可逐联系人调整）触发；每个联系人触发后 30 分钟内冷却、不再重复。你回复后 TA 会现场回应。关闭后不再打扰',
      get: deskCheckinEn,
      set: window.setDeskCheckinEn,
      toast: function (en) { return en ? '已开启：其他桌面的TA会来查岗、找你聊天' : '已关闭：其他桌面的TA不再来查岗打扰'; }
    });
    addSettingToggle({
      id: 'sf-desk-call',
      ico: '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>',
      title: '开启 联系人跨桌面打电话',
      sub: '其他桌面的联系人会主动给你打语音电话，你接听后即可通话；关闭后不再有跨桌面来电',
      get: deskCallEn,
      set: window.setDeskCallEn,
      toast: function (en) { return en ? '已开启：其他桌面的TA会主动给你打电话' : '已关闭：其他桌面的TA不再主动来电'; }
    });
  })();

  function rootGet(k) { try { return window.xyStore(ROOT).get(k); } catch (e) { return null; } }
  function rootSet(k, v) { try { window.xyStore(ROOT).set(k, v); } catch (e) {} }

  function queue() {
    let q = [];
    try { const v = rootGet(KEY); if (v) { const a = JSON.parse(v); if (Array.isArray(a)) q = a; } } catch (e) {}
    // 清理 seen 过久的（保留 pending）
    const now = Date.now();
    const filtered = q.filter(x => x.status !== 'seen' || now - (x.ts || 0) < seenKeepMs);
    if (filtered.length !== q.length) { rootSet(KEY, JSON.stringify(filtered)); q = filtered; }
    return q;
  }
  function saveQ(q) { rootSet(KEY, JSON.stringify(q.slice(-MAX))); }

  function cName(cid) {
    try {
      const c = (window.getContacts() || []).find(x => x.id === cid);
      if (c && c.name) return c.name;
    } catch (e) {}
    return cid === 'default' ? 'TA' : 'TA';
  }
  // 该桌面联系人自己的 partner 头像（聊天头像 cs-avatar-partner 优先，回退该桌面
  // 的身份图标 feed-ta-avatar，再回退桌面装饰 avatar-partner）——
  // 跨桌面查岗/求聊天/来电通知必须用它，否则 bg-keep 会回退当前桌面头像导致头像错。
  // 非 default 联系人的身份图标存在各自桌面命名空间 feed-ta-avatar；default 的联系人
  // 身份图存在根键，额外回退一次（与 feed.js taAvFor 同口径）。
  function cAvatar(cid) {
    try {
      const s = (cid && window.storeFor) ? window.storeFor(cid) : window.activeStore;
      let a = s.get('cs-avatar-partner') || s.get('feed-ta-avatar') || s.get('avatar-partner') || '';
      if (!a && cid === 'default' && window.xyStore) {
        a = window.xyStore('xy-home-v2').get('feed-ta-avatar') || '';
      }
      return (a && (a.indexOf('data:') === 0 || /^https?:\/\//i.test(a))) ? a : '';
    } catch (e) { return ''; }
  }
  // 各桌面专属设置：回复设置随联系人隔离（replyCfg(cid) 读取 storeFor(cid) 的 rc-*），
  // 这里用与 chat.js cfgn 同款读取，避免依赖未暴露的内部结构
  function cfgFor(cid) {
    try {
      if (window.replyCfgFor) return window.replyCfgFor(cid);
    } catch (e) {}
    return {};
  }
  function num(c, k, def) { const v = c && c[k]; if (typeof v === 'number' && v >= 0) return v; return def; }
  function lastKey(cid, kind) { return 'incoming-last:' + kind + ':' + cid; }
  function lastAt(cid, kind) { try { const v = rootGet(lastKey(cid, kind)); return parseInt(v, 10) || 0; } catch (e) { return 0; } }
  function markLast(cid, kind) { try { rootSet(lastKey(cid, kind), String(Date.now())); } catch (e) {} }
  function hasPending(cid) { return queue().some(x => x.cid === cid && x.status === 'pending'); }
  function setStatus(cid, status) {
    const q = queue();
    let hit = false;
    q.forEach(x => { if (x.cid === cid && x.status === 'pending') { x.status = status; x.ts = Date.now(); hit = true; } });
    if (hit) saveQ(q);
    return hit;
  }

  // 入队 + 表现：前台弹窗 / 后台系统通知
  function deliver(req) {
    const q = queue();
    if (q.some(x => x.cid === req.cid && x.status === 'pending')) return false; // 未处理不重复
    q.push(req);
    saveQ(q);
    markLast(req.cid, req.kind);
    const name = cName(req.cid);
    const title = req.kind === 'chat' ? name + ' 想找你聊天' : (req.kind === 'call' ? name + ' 来电了' : name + ' 来查岗了');
    if (document.hidden) {
      // v3.19.x：后台命中时不再只是通知——查岗/求聊天直接把卡写入对应联系人桌面聊天，
      // 切回前台到该联系人即可看到并回答；来电无法后台接听，只保留系统通知。
      try {
        // avFixed：明示大头像由本页面的 cAvatar(req.cid) 权威决定（该联系人自己桌面的头像）。
        // 若不传，bg-keep 会在 av 为空时回退当前桌面头像 → 把「当前桌面的联系人头像」错当成
        // 跨桌面联系人头像显示。传了 avFixed 后空值走中立 mochi 图标，绝不再借用当前桌面。
        const av = cAvatar(req.cid);
        if (req.kind === 'call') {
          if (window.bgNotifyCheck) window.bgNotifyCheck(title + (req.kind === 'call' ? '' : '：' + (req.text || '')), Date.now(), { name: name + '来电', av: av, avFixed: true });
        } else if (req.kind === 'checkin') {
          if (window.chatAppendDeskCkTo) window.chatAppendDeskCkTo(req.cid, req.q);
          if (window.bgNotifyCheck) window.bgNotifyCheck(title + '：' + (req.text || ''), Date.now(), { name: name + '查岗', av: av, avFixed: true });
        } else { // chat 求聊天
          if (window.chatAppendDeskTextTo) window.chatAppendDeskTextTo(req.cid, req.text || '想你了，来聊聊天吧。');
          if (window.bgNotifyCheck) window.bgNotifyCheck(title + '：来陪我聊聊天吧', Date.now(), { name: name + '来聊天', av: av, avFixed: true });
        }
      } catch (e) {}
      // 卡已入库聊天，释放 pending（避免占用队列挡住下一次正常弹窗查岗）
      setStatus(req.cid, 'seen');
      return true;
    }
    if (!window.openModal) return true;
    const okText = req.kind === 'chat' ? '同意' : (req.kind === 'call' ? '接听' : '现在回TA');
    const staticText = req.kind === 'call'
      ? '想听听你的声音，接一下好吗？'
      : (req.kind === 'chat' ? '想和你聊聊天，忙完记得过来。' : '想看看你在做什么，来陪陪我呀。') + '\n' + (req.text || '');
    window.openModal(title, '', function (v) {
      if (v === 'later') {
        setStatus(req.cid, 'seen');
        return;
      }
      // 现在回 / 同意 / 接听 → 切桌面并当场发话/来电
      goReply(req);
    }, {
      noInput: true,
      lock: true,
      staticText: staticText,
      pills: [{ label: '稍后', value: 'later' }, { label: okText, value: 'reply' }]
    });
    return true;
  }

  // 切换 + （查岗/聊天）进聊天 + 等加载就绪后 TA 当场发话；来电只切桌面不等聊天
  function goReply(req) {
    const cid = req.cid;
    try {
      if (window.setActiveContact && cid !== (window.__activeCid || 'default')) window.setActiveContact(cid);
    } catch (e) {}
    setStatus(cid, 'accepted');
    if (req.kind === 'call') {
      // 来电：切桌面后直接触发来电（通话归属该桌面，call.js 用当前 store 读昵称/头像/冷却）
      setTimeout(function () { fire(req); }, 300);
      return;
    }
    try {
      if (window.enterChat) window.enterChat();
    } catch (e) {}
    const once = { done: false };
    const tries = { n: 0 };
    const poll = function () {
      tries.n++;
      // 就绪判定：本桌面聊天已从 IDB 加载完成。chat.js 的 chatDbReady 会在
      // contact-switched 时置 false、loadMsgs 读完（或 12s 保险丝到期）后置 true，
      // 所以只需它即可防旧桌面残留——不要再比对 lastIdbLoadPrefix（无历史桌面
      // 走 confirmMiss 分支不更新该值，比对了会永远等超时）。
      const ready = !!(window.__chatDbReady && window.__chatDbReady());
      if (ready || tries.n > 120) {
        if (once.done) return;
        once.done = true;
        fire(req);
        return;
      }
      setTimeout(poll, 250);
    };
    setTimeout(poll, 300);
  }

  // v3.17.x：切到目标桌面后，确保该桌面 TA 昵称有值（contacts 注册表 name 兜底）——
  // 跨桌面来电/查岗面板读 lbl-partner，新建联系人桌面未设置时显示 TA 而非联系人名
  function ensureTaName(cid) {
    try {
      const s = (cid && window.storeFor) ? window.storeFor(cid) : null;
      if (!s) return;
      const cur = s.get('lbl-partner');
      if (cur) return;
      const c = (window.getContacts() || []).find(x => x.id === cid);
      if (c && c.name) s.set('lbl-partner', c.name);
    } catch (e) {}
  }

  function fire(req) {
    try {
      if (req.kind === 'call') {
        // 跨桌面来电：已切到目标桌面，先兜底 TA 昵称，再触发来电（call.js incomingCall
        // 用当前 store，通话归属/昵称/头像/记录都正确）
        ensureTaName(req.cid);
        if (window.triggerIncomingCall) window.triggerIncomingCall();
        return;
      }
      if (req.kind === 'checkin') {
        ensureTaName(req.cid);
        // v3.17.x：桌面查岗——切过来当场发卡前，先把这次查岗记进【该联系人自己桌面】的
        // records-care（主页「TA的关心」→「桌面查岗」区块按联系人聚合展示，见 records.js）
        if (window.addCareRecordFor) {
          try { window.addCareRecordFor(req.cid, 'desk-checkin', req.text, Date.now()); } catch (e) {}
        }
        // 用弹窗时抽好的题（req.q 入队时随申请保存）发卡——弹窗显示哪题、切过去就发哪题，
        // 保证用户看到的问题与回答时一致；题库被关/题被删时回退重抽。
        let q = (req.q && req.q.text) ? req.q : (window.ckQuestionPickFor ? window.ckQuestionPickFor(req.cid) : null);
        if (!q || !q.text) q = window.ckQuestionPickFor ? window.ckQuestionPickFor(req.cid) : null;
        if (q && q.text) {
          if (window.ckQuestionFire) window.ckQuestionFire(q, cfgFor(req.cid));
          else if (window.triggerCkQuestion) window.triggerCkQuestion();
          return;
        }
      }
      // 求聊天 / 查岗题库空 → 发一句开场白（TA 主动）
      const text = req.kind === 'chat'
        ? (req.text || '想你了，来聊聊天吧。')
        : '我来找你了。';
      if (window.chatAddIn) {
        window.chatAddIn(text, { initiative: true });
        if (window.showTyping) { try { window.showTyping(); } catch (e) {} }
      }
    } catch (e) {}
  }

  // 调度：遍历所有联系人，非激活桌面按各自配置掷概率（查岗/聊天/来电各自受开关控制）
  function maybeIncoming() {
    try {
      const cur = window.__activeCid || 'default';
      const list = window.getContacts() || [];
      if (list.length < 2) return; // 只有当前桌面：无需跨桌面打扰
      list.forEach(function (c) {
        const cid = c.id;
        if (cid === cur) return; // 激活桌面不跨桌面打扰（由原 tryAutoSend 正常触发）
        if (hasPending(cid)) return; // 已有未处理申请，不重复
        const cfg = cfgFor(cid);
        // v3.20.x：跨桌面来电——与跨桌面查岗对齐：触发概率 + 每人独立冷却。
        // 概率读 desk-call-prob（默认 2%，与查岗 ckq-prob 对齐）；冷却用独立键
        // incoming-last:call:<cid>（与查岗同套 lastAt/markLast，不与 call.js 的
        // records-call-last 共用，普通来电不受影响）；冷却时长沿用查岗 ckq-cool（默认 30 分钟）。
        if (deskCallEn() && !document.hidden) {
          const callCool = num(cfg, 'ckq-cool', 30);
          const callProb = num(cfg, 'desk-call-prob', 2);
          if (Date.now() - lastAt(cid, 'call') >= callCool * 60000 && Math.random() * 100 < callProb) {
            deliver({ cid: cid, kind: 'call', text: '', ts: Date.now(), status: 'pending' });
            return;
          }
        }
        // 查岗：开关 + 概率 + 冷却（ckq-*）
        if (deskCheckinEn() && num(cfg, 'ckq-en', 0) === 1) {
          const cool = num(cfg, 'ckq-cool', 30);
          const prob = num(cfg, 'ckq-prob', 2);
          if (Date.now() - lastAt(cid, 'checkin') >= cool * 60000 && Math.random() * 100 < prob) {
            const q = window.ckQuestionPickFor ? window.ckQuestionPickFor(cid) : null;
            if (q && q.text) {
              // v3.18.x：互动动作弹窗显示方向文案（比动作名更自然），切过去后当场发卡再随机方向
              const showText = q.type === 'action' ? (q.taToMe || q.text) : q.text;
              deliver({ cid: cid, kind: 'checkin', text: showText, q: q, ts: Date.now(), status: 'pending' });
              return;
            }
          }
        }
        // 求聊天：开关 + 概率 + 冷却（as-*）
        if (deskCheckinEn() && num(cfg, 'as-en', 0) === 1) {
          const prob = num(cfg, 'as-prob', 30);
          if (Date.now() - lastAt(cid, 'chat') >= chatCoolMs && Math.random() * 100 < prob) {
            deliver({ cid: cid, kind: 'chat', text: '想和你聊聊天，你有空吗？', ts: Date.now(), status: 'pending' });
          }
        }
      });
    } catch (e) {}
  }

  // 手动触发（测试 / 诊断用）：触发指定桌面一次查岗
  window.triggerIncomingCheckin = function (cid) {
    if (!deskCheckinEn()) { try { if (window.toast) window.toast('联系人跨桌面查岗已关闭（可在设置里开启）'); } catch (e) {} return false; }
    const q = window.ckQuestionPickFor ? window.ckQuestionPickFor(cid || 'default') : null;
    if (!q || !q.text) return false;
    return deliver({ cid: cid || 'default', kind: 'checkin', text: q.text, q: q, ts: Date.now(), status: 'pending' });
  };
  // 手动触发（测试 / 诊断用）：触发指定桌面一次来电
  window.triggerIncomingCallReq = function (cid) {
    if (!deskCallEn()) { try { if (window.toast) window.toast('联系人跨桌面打电话已关闭（可在设置里开启）'); } catch (e) {} return false; }
    return deliver({ cid: cid || 'default', kind: 'call', text: '', ts: Date.now(), status: 'pending' });
  };

  setTimeout(function () {
    maybeIncoming();
    setInterval(maybeIncoming, CHECK_MS);
  }, (30 + Math.random() * 60) * 1000);
})();

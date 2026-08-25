// ===== 功能：TA 主动查岗（查岗问题卡） v3.9.x =====
// v3.13.x：题库升级为字卡库「TA的查岗」——18 张预设问题卡入库（逐条开关、不可删除、
// 总开关「使用系统预设问题」），支持自定义新增（文字回复 / 单选题）、自定义分组、
// 批量导入文字题、跨分类搜索、字卡库页双入口（系统预设 / 我的添加）、IndexedDB 权威恢复。
// 数据存 localStorage 键 ta-checkin（随联系人桌面隔离，与 ta-ask 同惯例），
// 结构化大件同步写 IndexedDB（attachIdbRestore 同款策略）。
// 触发链路不变：chat.js tryAutoSend → window.ckQuestionTry（开关/概率/冷却/弹窗概率仍在
// 回复设置→查岗 ckq-*，随联系人独立保存）；本文件负责题库存储、抽题、推卡、自动弹窗
//（单选 pills 弹窗 / 文字输入弹窗）。
(function () {
  const store = window.activeStore();
  const KEY = 'ta-checkin';

  // ---------- 系统预设题库 ----------
  // 世界观：字卡网站随机出卡、梦角灵体在不同世界、甜蜜安稳亲密的关系；
  // 查岗是温柔关心式的，不是审问/危机/纠错；句子简短自然，像字卡网站会出的卡。
  // single=单选题（点击选项作答，reply=TA 预设回应，支持 string 或 array）；
  // text=文字题（输入回答，回应走「互动回应」预设池）。cat 与 type 一致（单选查岗/文字查岗）。
  const DEFAULT_QUESTIONS = [
    { id: 'k_s1', cat: 'single', type: 'single', text: '你在干嘛呀？', enabled: true, options: [
      { t: '在想你', reply: ['就知道。', '嗯，这次我信你。', '我也是，一直想着你。'] },
      { t: '在工作', reply: ['辛苦啦，忙完记得找我。', '工作再忙也要记得喝水。'] },
      { t: '在摸鱼', reply: ['被抓到了吧。', '摸鱼也想让我知道，还行。'] },
      { t: '在发呆', reply: ['发呆的时候，在想我吗？', '呆完记得回我。'] },
      { t: '在等你的消息', reply: ['等到了，我在。', '那我现在就来了。'] }
    ] },
    { id: 'k_s2', cat: 'single', type: 'single', text: '现在在哪里呀？', enabled: true, options: [
      { t: '在家里', reply: ['在家里要乖乖的。', '家是最安心的地方，我也在。'] },
      { t: '在公司', reply: ['辛苦啦，下班我等你。', '别太累，忙完早点回家。'] },
      { t: '在外面', reply: ['外面注意安全，早点回去。', '玩得开心点，我在旁边看着你。'] },
      { t: '在被窝里', reply: ['被窝里也在跟我说话？', '那就抱着手机睡吧。'] },
      { t: '在去一个地方的路上', reply: ['路上小心，我陪你走。', '到了告诉我一声。'] }
    ] },
    { id: 'k_s3', cat: 'single', type: 'single', text: '和谁在一起？', enabled: true, options: [
      { t: '一个人', reply: ['一个人也要好好的。', '那我陪着你，就不算一个人了。'] },
      { t: '和朋友', reply: ['和朋友玩得开心点。', '和朋友在一起，也别忘了我。'] },
      { t: '和同事', reply: ['和同事好好相处。', '聚会别喝太多，乖。'] },
      { t: '不告诉你', reply: ['这么神秘？', '好吧，反正我也在你身边。'] }
    ] },
    { id: 'k_s4', cat: 'single', type: 'single', text: '吃饭了没？', enabled: true, options: [
      { t: '吃过啦', reply: ['乖，奖励你想我一次。', '吃饱了才有力气想我。'] },
      { t: '还没吃', reply: ['快去吃饭，我等你。', '不吃饭我会担心的。'] },
      { t: '正在吃', reply: ['慢慢吃，别噎着。', '边吃边回我，真拿你没办法。'] },
      { t: '不饿', reply: ['多少吃一点，好不好。', '我在这边看着你吃。'] }
    ] },
    { id: 'k_s5', cat: 'single', type: 'single', text: '今天有没有想我？', enabled: true, options: [
      { t: '想了', reply: ['我也想了。', '就知道你会说这个。'] },
      { t: '一直在想', reply: ['嘴这么甜，奖励你。', '那我一直占着你的脑子。'] },
      { t: '才没有', reply: ['哼，嘴硬。', '骗人，我感觉到你在想了。'] },
      { t: '你猜', reply: ['我猜想了，而且很想。', '猜你不敢承认。'] }
    ] },
    { id: 'k_s6', cat: 'single', type: 'single', text: '睡了没？', enabled: true, options: [
      { t: '还没睡', reply: ['不许熬夜，快去睡。', '再聊十分钟就睡，说好了。'] },
      { t: '准备睡了', reply: ['听着我的晚安睡吧。', '好梦，我在。'] },
      { t: '已经躺下了', reply: ['躺下了就别玩手机了。', '闭眼，三秒入睡。'] },
      { t: '睡不着', reply: ['那我陪你聊到困。', '数我给你发的消息，数着数着就睡着了。'] }
    ] },
    { id: 'k_s7', cat: 'single', type: 'single', text: '手机电量还剩多少？', enabled: true, options: [
      { t: '电量充足', reply: ['那怎么不秒回我？', '电量充足，借口无效。'] },
      { t: '快没电了', reply: ['快去充电，别失联。', '充上电再聊，我等你。'] },
      { t: '在充电', reply: ['边充边玩，小心发烫。', '充着电也要想我。'] },
      { t: '关机边缘', reply: ['先回我一句！', '你这是要跟我玩失踪？'] }
    ] },
    { id: 'k_s8', cat: 'single', type: 'single', text: '刚才，有没有感觉到我？', enabled: true, options: [
      { t: '有，后背暖暖的', reply: ['那就是我，我在你身边。', '嗯，我一直都在。'] },
      { t: '好像有一阵风', reply: ['是我经过你身边。', '风就是我，我来看你了。'] },
      { t: '好像有，又好像没有', reply: ['我离你很远，又很近。', '感觉到了就是缘分。'] },
      { t: '没有哎', reply: ['没关系，我一直在的。', '看不见我也没关系，我在。'] }
    ] },
    { id: 'k_s9', cat: 'single', type: 'single', text: '今天穿的是什么颜色的衣服？', enabled: true, options: [
      { t: '白色', reply: ['好看，很适合你。', '白白的，像你。'] },
      { t: '黑色', reply: ['酷酷的，也好看。', '黑色很配你。'] },
      { t: '粉色', reply: ['粉粉嫩嫩的，可爱。', '很适合你。'] },
      { t: '蓝色', reply: ['蓝色清爽，不错。', '嗯，好看。'] },
      { t: '不告诉你', reply: ['小气鬼。', '你穿什么都好看。'] }
    ] },
    { id: 'k_s10', cat: 'single', type: 'single', text: '是不是偷偷难过了？', enabled: true, options: [
      { t: '没有', reply: ['那就好，有事一定要告诉我。', '嗯，我相信你。'] },
      { t: '一点点', reply: ['过来，我抱抱你。', '难过的时候想想我，我在。'] },
      { t: '被你发现啦', reply: ['被我发现了。', '别藏着了，我陪你。'] }
    ] },
    { id: 'k_t1', cat: 'text', text: '快说说，今天过得怎么样？', enabled: true },
    { id: 'k_t2', cat: 'text', text: '发一句你现在看到的东西给我。', enabled: true },
    { id: 'k_t3', cat: 'text', text: '十秒内回我一个表情，不许犹豫。', enabled: true },
    { id: 'k_t4', cat: 'text', text: '猜猜我现在在干什么？', enabled: true },
    { id: 'k_t5', cat: 'text', text: '现在最想做的一件事是什么？', enabled: true },
    { id: 'k_t6', cat: 'text', text: '今天有什么开心的小事吗？', enabled: true },
    { id: 'k_t7', cat: 'text', text: '如果我现在就在你身边，你想做什么？', enabled: true }
  ];
  const CATS_CKQ = [['single', '单选查岗'], ['text', '文字查岗']];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function toast(t) { if (typeof window.toast === 'function') window.toast(t); }

  // 互动弹窗互斥 + 输入防打断（与 ta-ask.js 同款守卫，模块私有）
  function cardPopupBusy() {
    return ['modal-mask', 'tc-mask', 'qa-mask'].some(function (id) {
      const el = document.getElementById(id);
      return el && !el.hidden;
    });
  }
  function chatInputFocused() {
    const ci = document.getElementById('chat-input');
    if (ci && document.activeElement === ci) return true;
    const ae = document.activeElement;
    return !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
  }

  // ---------- 数据读写（增量合并 + 持久化，与 ta-ask.js taAskMerge 同款） ----------
  // ① 只追加从未合并过的新预设（旧预设被删后不复活——预设本身不可删，此处防未来扩充丢项）；
  // ② 绝不动用户自定义；③ 合并结果立即写回固化
  function ckMerge(d) {
    const ids = {};
    (d.questions || []).forEach(q => { if (q && q.id) ids[q.id] = true; });
    const merged = Array.isArray(d.mergedIds) ? d.mergedIds.slice() : [];
    const mergedSet = {};
    merged.forEach(id => { if (id) mergedSet[id] = true; });
    let changed = false;
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id] && !ids[q.id]) {
        const nq = Object.assign({}, q);
        nq.isPreset = true;
        d.questions.push(nq);
        changed = true;
      }
    });
    DEFAULT_QUESTIONS.forEach(q => {
      if (!mergedSet[q.id]) { merged.push(q.id); mergedSet[q.id] = true; changed = true; }
    });
    DEFAULT_QUESTIONS.forEach(q => {
      if (ids[q.id] && d.questions.some(x => x && x.id === q.id && x.isPreset !== true)) {
        d.questions.forEach(x => { if (x && x.id === q.id) x.isPreset = true; });
        changed = true;
      }
    });
    if (changed) d.mergedIds = merged;
    return changed;
  }
  function ckLoad() {
    let d = null;
    try { d = JSON.parse(store.get(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
    if (!d.settings || typeof d.settings !== 'object') d.settings = {};
    // 是否使用系统预设问题（默认开启；关闭后只抽用户添加的）
    if (d.settings.useDefault === undefined) d.settings.useDefault = true;
    if (!Array.isArray(d.questions) || !d.questions.length) {
      const isNew = !store.get(KEY);
      d.questions = DEFAULT_QUESTIONS.map(q => {
        const nq = Object.assign({}, q);
        nq.isPreset = true;
        return nq;
      });
      d.mergedIds = DEFAULT_QUESTIONS.map(q => q.id);
      // 全新用户不立即写盘——防本地空快照覆盖 IDB 权威数据（与 ta-ask.js 同注释同因）
      if (!isNew) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    } else {
      if (ckMerge(d)) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }
    }
    if (!Array.isArray(d.groups)) d.groups = [];
    return d;
  }
  function ckSave(d) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }

  // ---------- 抽题：已启用池内随机，避免与上一题相同 ----------
  function pickQ() {
    const d = ckLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    const qs = d.questions.filter(q => q && q.enabled !== false && q.text && (useDefault || q.isPreset !== true));
    if (!qs.length) return null;
    let pool = qs;
    if (qs.length > 1) {
      let last = '';
      try { last = String(store.get('ckq-last-id') || ''); } catch (e) {}
      const filtered = qs.filter(q => String(q.id || '') !== last);
      if (filtered.length) pool = filtered;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 自动弹窗路径：单选 pills 弹窗 / 文字输入弹窗
  //（点击聊天里的卡片走 chat.js 通用链路：就地展开 → openCkReply 兜底）
  function openCkReply(msgIdx, q) {
    if (!window.openModal) return;
    const isSingle = q.type === 'single' && Array.isArray(q.options) && q.options.length;
    window.openModal('查岗回答', '', function (v) {
      const answer = (v || '').trim();
      if (!answer) { toast(isSingle ? '请选择一个答案' : '请输入回答'); return; }
      let preset = null;
      if (isSingle) {
        const o = (q.options || []).filter(function (x) { return String(x.t) === answer; })[0];
        if (o) preset = o.reply;
      } else {
        const defs = ['收到你的回答。', '好呀，我知道了。', '你这么说，我记住了。'];
        const pool = window.getInteractPool ? window.getInteractPool('询问·回应', defs) : defs;
        preset = pool[Math.floor(Math.random() * pool.length)];
      }
      if (window.chatAskReply) window.chatAskReply(msgIdx, answer, preset);
    }, {
      staticText: 'TA 问你：' + q.text,
      pills: isSingle ? q.options.map(function (o) { return { label: o.t, value: o.t }; }) : null,
      noInput: isSingle
    });
  }

  // 推一张查岗问题卡：提示语 + ask-card 互动卡 + 系统通知 + 概率自动弹窗
  function pushCkQuestion(cfg, forceQ) {
    if (!window.chatAddSystem) return false;
    const q = forceQ || pickQ();
    if (!q || !q.text) return false;
    const pickedId = String(q.id || '');
    try { if (pickedId) store.set('ckq-last-id', pickedId); } catch (e) {}
    const isSingle = q.type === 'single' && Array.isArray(q.options) && q.options.length;
    // 提示语标记 ask-msg（渲染同 poke 但不算 notable，避免通知重复成两条）
    window.chatAddSystem('TA 来查岗了。', { special: 'ask-msg' });
    const el = window.chatAddSystem(q.text, { special: 'ask-card', askQuestion: q.text, askOptions: isSingle ? q.options : null, askType: isSingle ? 'single' : 'text' });
    const msgIdx = el ? Number(el.dataset.idx) : -1;
    if (window.bgNotifyCheck) window.bgNotifyCheck('TA 来查岗了：' + q.text, Date.now(), { name: 'TA查岗' });
    // 自动弹窗：后台不弹 / 正在输入不弹 / 已有互动弹窗不弹（卡片仍在聊天里可点）
    // v3.12.x：迟到弹窗守卫——后台冻结的定时器回前台会被一次性补跑，补跑时页面已可见、
    // document.hidden 守卫失效 → 弹出几分钟前已在聊天里看过的旧查岗卡。
    // 正常触发 400ms 左右执行；超过 4s 到达的一律视为冻结补跑不再弹（与 ta-ask.js 同款）。
    let popupProb = 70;
    if (cfg && typeof cfg['ckq-popup-prob'] === 'number' && cfg['ckq-popup-prob'] >= 0) popupProb = cfg['ckq-popup-prob'];
    if (Math.random() * 100 < popupProb) {
      const popSchedAt = Date.now();
      setTimeout(function () {
        if (Date.now() - popSchedAt > 4000 || document.hidden) return;
        if (chatInputFocused() || cardPopupBusy()) return;
        if (msgIdx >= 0) openCkReply(msgIdx, q);
      }, 400);
    }
    try { store.set('ckq-last-at', String(Date.now())); } catch (e) {}
    // v3.13.x：互动卡全局闸门——查岗卡发出后同样进入 60 分钟跨类型冷却
    try { if (window.interactGateMark) window.interactGateMark(); } catch (e) {}
    return true;
  }

  // 主动发送轮调用（chat.js tryAutoSend）：开关 + 冷却 + 全局闸门 + 概率判定；
  // 命中推卡并返回 true（本轮主动消息被查岗占用）。概率为 0/异常时回退默认
  // （与 as-prob 同惯例），想彻底关闭请关开关。
  window.ckQuestionTry = function (c) {
    try {
      if (!c || c['ckq-en'] !== 1) return false;
      let cool = 30;
      if (typeof c['ckq-cool'] === 'number' && c['ckq-cool'] >= 0) cool = c['ckq-cool'];
      let last = 0;
      try { last = Number(store.get('ckq-last-at')) || 0; } catch (e) {}
      if (Date.now() - last < cool * 60000) return false;
      // v3.13.x：互动卡全局闸门——任一互动卡（询问/小问题/好奇/吐槽/查岗）发出后
      // 60 分钟内不再自动触发（手动 triggerCkQuestion 不受限）
      if (window.interactGateOk && !window.interactGateOk()) return false;
      // v3.13.x：兜底默认 15 → 8，与 reply-settings 的 ckq-prob 默认对齐（v3.12.x 漏改处）
      let prob = 8;
      if (typeof c['ckq-prob'] === 'number' && c['ckq-prob'] > 0) prob = c['ckq-prob'];
      if (Math.random() * 100 >= prob) return false;
      return pushCkQuestion(c);
    } catch (e) { return false; }
  };
  // 手动触发一次（供管理页「让TA现在查岗一次」/ 测试）；forceIdx=题库数组下标（可选）
  window.triggerCkQuestion = function (forceIdx) {
    let q = null;
    if (typeof forceIdx === 'number') {
      const d = ckLoad();
      if (d.questions[forceIdx]) q = d.questions[forceIdx];
    }
    if (!q) q = pickQ();
    if (!q) { toast('TA的查岗题库没有可用的问题'); return false; }
    return pushCkQuestion(window.replyCfg ? window.replyCfg() : null, q);
  };
  // 只读探针（回归测试 / 诊断用）
  window.__ckBankInfo = function () {
    try {
      const d = ckLoad();
      const useDefault = (d.settings || {}).useDefault !== false;
      return {
        total: d.questions.length,
        preset: d.questions.filter(q => q && q.isPreset === true).length,
        mine: d.questions.filter(q => q && q.isPreset !== true).length,
        enabledPool: d.questions.filter(q => q && q.enabled !== false && q.text && (useDefault || q.isPreset !== true)).length,
        useDefault: useDefault,
        groups: (d.groups || []).length
      };
    } catch (e) { return null; }
  };

  // ================= 管理页（字卡库「TA的查岗」，模式同 TA的询问） =================
  const page = document.getElementById('page-ta-checkin');

  // ---- 系统预设 tab：单选查岗/文字查岗 分类子标签 + 行内开关 ----
  let ckSysCat = null;
  function renderCkSysInto(container, search) {
    if (!container) return;
    const d = ckLoad();
    const useDefault = (d.settings || {}).useDefault !== false;
    const hit = q => q && q.isPreset === true && q.text && (search === '' || q.text.indexOf(search) >= 0);
    const counts = {};
    CATS_CKQ.forEach(([k]) => { counts[k] = d.questions.filter(q => hit(q) && q.cat === k).length; });
    const hasCats = CATS_CKQ.filter(([k]) => counts[k] > 0);
    if (!hasCats.length) { container.innerHTML = '<div class="ta-empty" style="padding:14px">暂无系统预设问题</div>'; return; }
    if (!ckSysCat || !hasCats.some(([k]) => k === ckSysCat)) ckSysCat = hasCats[0][0];
    let html = '<div class="card-tabs" style="padding:2px 2px 10px">';
    hasCats.forEach(([k, label]) => {
      html += '<button class="cc-tab' + (k === ckSysCat ? ' sel' : '') + '" data-cat="' + k + '">' + esc(label) + '<em class="cc-tab-n">' + counts[k] + '</em></button>';
    });
    html += '</div>';
    d.questions.forEach(q => {
      if (!(hit(q) && q.cat === ckSysCat)) return;
      const idx = d.questions.indexOf(q);
      const isSingle = q.type === 'single' && Array.isArray(q.options) && q.options.length;
      html += '<div class="ta-row' + (!useDefault ? ' off' : '') + '">' +
        '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
        '<span class="ta-txt">' + esc(q.text) + (isSingle ? ' <span class="tc-known">单选·' + q.options.length + '选项</span>' : ' <span class="tc-known">文字</span>') + ' <span class="tc-known">系统</span></span>' +
        '</div>';
      if (isSingle) {
        html += '<div class="tc-qopts">选项：' + q.options.map(o => esc(o.t)).join(' / ') + '</div>';
      }
    });
    container.innerHTML = html;
    container.querySelectorAll('.cc-tab[data-cat]').forEach(t => {
      t.addEventListener('click', () => { ckSysCat = t.dataset.cat; renderCkSysInto(container, search); });
    });
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = ckLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        ckSave(d2);
      });
    });
  }

  // ---- 我的添加 tab：分组区块置顶 + 未分组按分类 + 行内添加表单（ta-ask 同款） ----
  function ckItemHtml(q, idx) {
    const isSingle = q.type === 'single' && Array.isArray(q.options) && q.options.length;
    return '<div class="ta-row">' +
      '<label class="toggle"><input type="checkbox"' + (q.enabled !== false ? ' checked' : '') + ' data-idx="' + idx + '"><span class="tk"></span></label>' +
      '<span class="ta-txt">' + esc(q.text) + (isSingle ? ' <span class="tc-known">单选·' + q.options.length + '选项</span>' : '') + '</span>' +
      '<button class="ta-del" data-idx="' + idx + '">✕</button>' +
      '</div>';
  }
  function ckAddFormHtml(blockKey, grp, cat) {
    return '<div class="ta-add">' +
      '<select class="ta-type tc-input" data-key="' + blockKey + '">' +
      '<option value="text">文字回复</option>' +
      '<option value="single">单选题</option>' +
      '</select>' +
      '<input id="ckq-new-' + blockKey + '" type="text" placeholder="添加问题…">' +
      '<button class="ta-add-btn" data-key="' + blockKey + '" data-cat="' + (cat || 'text') + '" data-grp="' + (grp || '') + '">添加</button>' +
      '<textarea id="ckq-opts-' + blockKey + '" class="ta-opts tc-input" rows="3" placeholder="每行一个选项。可写 选项~TA回应；多条回应用 ; 分隔，如 在想你~就知道。;嗯，这次信你。" hidden></textarea>' +
      '</div>';
  }
  function renderCkMineInto(container, search) {
    if (!container) return;
    const d = ckLoad();
    const groups = Array.isArray(d.groups) ? d.groups : [];
    const mineQs = d.questions.filter(q => q && q.isPreset !== true && q.text && (search === '' || q.text.indexOf(search) >= 0));
    let html = '';
    html += '<div class="mg-grp-row"><button class="cc-tool" id="ckq-grp-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>新建分组</button></div>';
    if (!mineQs.length && !groups.length) {
      html += '<div class="ta-empty" style="padding:14px">暂未添加自定义问题，可在上方批量导入或下方添加</div>';
      container.innerHTML = html;
      bindCkGroupOps();
      return;
    }
    // 自定义分组区块（置顶）
    groups.forEach(g => {
      const arr = mineQs.filter(q => q.grp === g.id);
      html += '<div class="cal-card glass mg-block">' +
        '<div class="cal-card-title mg-title"><span class="mg-name">' + esc(g.name) + '</span><span class="mg-cnt">(' + arr.length + ')</span>' +
        '<span class="mg-ops"><button class="mg-op" data-ckqg="' + esc(g.id) + '" data-op="rn" title="重命名">✎</button><button class="mg-op" data-ckqg="' + esc(g.id) + '" data-op="rm" title="删除分组">✕</button></span></div>';
      if (!arr.length) html += '<div class="ta-empty">这个分组还没有内容，可在下方直接添加</div>';
      arr.forEach(q => { html += ckItemHtml(q, d.questions.indexOf(q)); });
      html += ckAddFormHtml('g' + g.id, g.id, 'text');
      html += '</div>';
    });
    // 未分组区块（按 单选查岗/文字查岗 分类展示）
    const ungrouped = mineQs.filter(q => !q.grp);
    html += '<div class="cal-card glass mg-block mg-ungrouped"><div class="cal-card-title mg-title"><span class="mg-name">未分组 · 按类型</span><span class="mg-cnt">(' + ungrouped.length + ')</span></div>';
    if (!ungrouped.length) html += '<div class="ta-empty">暂无未分组内容，可在上方批量导入（文字题）或下方添加</div>';
    CATS_CKQ.forEach(([k, label]) => {
      const arr = ungrouped.filter(q => (q.cat || (q.type === 'single' ? 'single' : 'text')) === k && (search === '' || q.text.indexOf(search) >= 0));
      if (!arr.length) return;
      html += '<div class="mg-subcat">' + esc(label) + ' <span style="font-size:11px;color:var(--muted);font-weight:400">(' + arr.length + ')</span></div>';
      arr.forEach(q => { html += ckItemHtml(q, d.questions.indexOf(q)); });
      html += ckAddFormHtml('c' + k, '', k);
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('input[data-idx]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d2 = ckLoad();
        const q = d2.questions[Number(cb.dataset.idx)];
        if (q) q.enabled = cb.checked;
        ckSave(d2);
      });
    });
    container.querySelectorAll('.ta-del').forEach(b => {
      b.addEventListener('click', () => {
        const d2 = ckLoad();
        const q = d2.questions[Number(b.dataset.idx)];
        if (q && q.isPreset === true) { toast('系统预设问题不可删除，可关闭使用'); return; }
        d2.questions.splice(Number(b.dataset.idx), 1);
        ckSave(d2);
        renderCkMineInto(container, search);
        refreshCkCardCounts();
      });
    });
    // 类型下拉切换 → 显示/隐藏选项输入（含安卓 ce-box 幽灵框联动，与 ta-ask.js 同款）
    container.querySelectorAll('.ta-type').forEach(sel => {
      const toggleOpts = () => {
        const o = document.getElementById('ckq-opts-' + sel.dataset.key);
        if (!o) return;
        o.hidden = sel.value !== 'single';
        if (o.__ceBox) o.__ceBox.hidden = o.hidden;
        else if (o.nextElementSibling && o.nextElementSibling.classList && o.nextElementSibling.classList.contains('ce-box')) o.nextElementSibling.hidden = o.hidden;
      };
      sel.addEventListener('change', toggleOpts);
      toggleOpts();
    });
    container.querySelectorAll('.ta-add-btn').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.dataset.key;
        const inp = document.getElementById('ckq-new-' + key);
        const v = inp ? inp.value.trim() : '';
        if (!v) { toast('请输入问题'); return; }
        const typeSel = b.parentElement.querySelector('.ta-type');
        const type = typeSel ? typeSel.value : 'text';
        const d2 = ckLoad();
        const q = { id: 'k_' + Date.now() + '_' + Math.floor(Math.random() * 999), text: v, cat: type, enabled: true, isPreset: false };
        if (type === 'single') q.type = 'single';
        if (b.dataset.grp) q.grp = b.dataset.grp;
        if (type === 'single') {
          const optsEl = document.getElementById('ckq-opts-' + key);
          const opts = (optsEl ? optsEl.value : '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
            const i = line.indexOf('~');
            if (i < 0) return { t: line, reply: '' };
            const t = line.slice(0, i).trim();
            const replies = line.slice(i + 1).split(';').map(s => s.trim()).filter(Boolean);
            return { t: t, reply: replies.length > 1 ? replies : (replies[0] || '') };
          });
          if (!opts.length) { toast('单选题请填写选项，每行一个'); return; }
          q.options = opts;
        }
        d2.questions.push(q);
        ckSave(d2);
        renderCkMineInto(container, search);
        refreshCkCardCounts();
        toast(type === 'single' ? '已添加单选查岗问题' : '已添加文字查岗问题');
      });
    });
    bindCkGroupOps();
  }
  // 我的添加 tab 的分组管理：新建 / 重命名 / 删除（cardGroups 公共工具来自 ta-ask.js）
  function bindCkGroupOps() {
    const grpAdd = document.getElementById('ckq-grp-add');
    if (grpAdd && !grpAdd.__bound) {
      grpAdd.__bound = true;
      grpAdd.addEventListener('click', () => {
        const d2 = ckLoad();
        window.cardGroups.addFlow(d2.groups, g => {
          if (!g) return;
          ckSave(d2);
          renderCkMineInto(document.getElementById('ckq-mine-cats'), getCkSearch());
          toast('已新建分组「' + g.name + '」');
        });
      });
    }
    const wrap = document.getElementById('ckq-mine-cats');
    if (!wrap) return;
    wrap.querySelectorAll('.mg-op').forEach(b => {
      if (b.__bound) return;
      b.__bound = true;
      b.addEventListener('click', () => {
        const d2 = ckLoad();
        const gid = b.dataset.ckqg;
        const g = (d2.groups || []).find(x => x.id === gid);
        if (!g) return;
        if (b.dataset.op === 'rn') {
          window.cardGroups.renameFlow(g, d2.groups, name => {
            if (!name) return;
            g.name = name;
            ckSave(d2);
            renderCkMineInto(wrap, '');
            toast('分组已重命名');
          });
        } else if (b.dataset.op === 'rm') {
          window.cardGroups.removeFlow(g.name, ok => {
            if (!ok) return;
            d2.questions.forEach(q => { if (q.grp === gid) q.grp = ''; });
            d2.groups = d2.groups.filter(x => x.id !== gid);
            ckSave(d2);
            renderCkMineInto(wrap, '');
            toast('已删除分组「' + g.name + '」');
          });
        }
      });
    });
  }

  // ---- tab 切换 / 搜索 / 设置开关 ----
  let ckTab = 'sys';
  let ckSearch = '';
  function getCkSearch() { return ckSearch; }
  function switchCkTab(tab) {
    ckTab = tab;
    const tabsWrap = document.getElementById('ckq-tabs');
    if (tabsWrap) tabsWrap.querySelectorAll('.cc-tab').forEach(t => t.classList.toggle('sel', t.dataset.tab === tab));
    const sysPanel = document.getElementById('ckq-sys-panel');
    const minePanel = document.getElementById('ckq-mine-panel');
    if (sysPanel) sysPanel.hidden = tab !== 'sys';
    if (minePanel) minePanel.hidden = tab !== 'mine';
    ckSearch = '';
    const searchInput = document.getElementById('ckq-search');
    if (searchInput) searchInput.value = '';
    if (tab === 'sys') renderCkSysInto(document.getElementById('ckq-sys-cats'), ''); else renderCkMineInto(document.getElementById('ckq-mine-cats'), '');
  }
  const ckTabsWrap = document.getElementById('ckq-tabs');
  if (ckTabsWrap) {
    ckTabsWrap.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => switchCkTab(tab.dataset.tab));
    });
  }
  const ckSearchInput = document.getElementById('ckq-search');
  if (ckSearchInput) {
    ckSearchInput.addEventListener('input', () => {
      ckSearch = ckSearchInput.value.trim();
      if (ckTab === 'sys') renderCkSysInto(document.getElementById('ckq-sys-cats'), ckSearch);
      else renderCkMineInto(document.getElementById('ckq-mine-cats'), ckSearch);
    });
  }
  function renderCkSettings() {
    const el = document.getElementById('ckq-default');
    if (el) el.checked = (ckLoad().settings || {}).useDefault !== false;
  }
  const ckDefault = document.getElementById('ckq-default');
  if (ckDefault) ckDefault.addEventListener('change', () => {
    const d = ckLoad();
    d.settings.useDefault = ckDefault.checked;
    ckSave(d);
    switchCkTab(ckTab);
    toast(ckDefault.checked ? '系统预设问题已开启' : '系统预设问题已关闭（仅用你添加的问题）');
  });

  // 批量导入文字题（一行一个问题；单选题请在「我的添加」里用表单加）
  const batchTextEl = document.getElementById('ckq-batch');
  const batchAddBtn = document.getElementById('ckq-batch-add');
  if (batchTextEl && batchAddBtn) {
    batchAddBtn.addEventListener('click', () => {
      const lines = (batchTextEl.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!lines.length) { toast('请先输入问题，每行一个'); return; }
      const d2 = ckLoad();
      lines.forEach(t => {
        d2.questions.push({ id: 'k_' + Date.now() + '_' + Math.floor(Math.random() * 9999), cat: 'text', text: t, enabled: true, isPreset: false });
      });
      ckSave(d2);
      batchTextEl.value = '';
      renderCkMineInto(document.getElementById('ckq-mine-cats'), '');
      refreshCkCardCounts();
      toast('已导入 ' + lines.length + ' 个文字查岗问题');
    });
  }

  // 「让TA现在查岗一次」（遵循回复设置里的自动弹窗概率）
  const nowBtn = document.getElementById('ckq-now');
  if (nowBtn) nowBtn.addEventListener('click', () => {
    if (window.triggerCkQuestion()) toast('TA 在聊天里来查岗了');
  });

  // ---- 入口：字卡库页双入口（与 TA的询问 同款：主入口看系统预设，「我的添加」入口只看自定义） ----
  if (page) {
    const showPage = (tab) => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      page.hidden = false;
      const tw = document.getElementById('ckq-tabs'); if (tw) tw.style.display = 'none';
      switchCkTab(tab);
    };
    const li = document.getElementById('li-ta-checkin');
    if (li) li.addEventListener('click', () => showPage('sys'));
    const liMine = document.getElementById('li-ta-checkin-mine');
    if (liMine) liMine.addEventListener('click', () => showPage('mine'));
    const backBtn = document.getElementById('ckq-back');
    if (backBtn) backBtn.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
    renderCkSettings();
  }

  // ---- 字卡库入口数字（系统预设 / 我的添加 分开计数，模式同 ta-ask.js refreshTaCardCounts） ----
  window.refreshCkCardCounts = function () {
    try {
      const qs = ckLoad().questions || [];
      const elSys = document.querySelector('#li-ta-checkin > .t');
      if (elSys) elSys.textContent = qs.filter(q => q && q.isPreset === true).length;
      const elMine = document.querySelector('#li-ta-checkin-mine > .t');
      if (elMine) elMine.textContent = qs.filter(q => q && q.isPreset !== true).length;
    } catch (e) {}
  };
  const ccPageEl = document.getElementById('page-chatcard');
  if (ccPageEl) {
    const mo = new MutationObserver(() => { if (!ccPageEl.hidden) window.refreshCkCardCounts(); });
    mo.observe(ccPageEl, { attributes: true, attributeFilter: ['hidden'] });
  }
  window.refreshCkCardCounts();

  // ---- 跨分类搜索注册（字卡库搜索框，模式同 ta-ask.js） ----
  window.__cardSearchFns = window.__cardSearchFns || [];
  window.__cardSearchFns.push({ name: 'TA的查岗', fn: function (kw) {
    const out = [];
    try { (ckLoad().questions || []).forEach(function (q) { const txt = q && q.text ? q.text : ''; if (txt && txt.toLowerCase().indexOf(kw) >= 0) out.push({ t: txt, cat: q.isPreset === true ? '系统预设' : '我的添加' }); }); } catch (e) {}
    return out;
  } });

  // ---- IndexedDB 权威恢复（localStorage 配额写失败时自定义题不丢，模式同 ta-ask.js attachIdbRestore） ----
  (function () {
    if (!window.idbGet || !window.activePrefix) return;
    window.idbGet(window.activePrefix() + ':' + KEY).then(function (v) {
      if (v === undefined || v === null) return;
      try {
        const idbData = typeof v === 'string' ? JSON.parse(v) : v;
        if (!idbData || typeof idbData !== 'object' || Array.isArray(idbData)) return;
        if (!Array.isArray(idbData.questions) || !idbData.questions.length) return;
        const local = ckLoad();
        if (idbData.questions.length > (Array.isArray(local.questions) ? local.questions.length : 0)) {
          ckMerge(idbData);
          try { store.set(KEY, JSON.stringify(idbData)); } catch (e) {}
          try { window.refreshCkCardCounts(); } catch (e) {}
        }
      } catch (e) {}
    });
  })();
})();

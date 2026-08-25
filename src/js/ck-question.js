// ===== 功能：TA 主动查岗（查岗问题卡） v3.9.x =====
// TA 查你的岗：主动发送轮（chat.js tryAutoSend）按概率发一张查岗问题卡。
// 复用 ask-card 互动卡机制（聊天卡片渲染/点击作答/就地展开/收藏/TA 回应全走
// chat.js 既有链路），本文件只负责：题库、概率与冷却判定、推卡、自动弹窗
//（单选 pills 弹窗 / 文字输入弹窗）。设置在 回复设置→查岗（ckq-*，随联系人
// 命名空间独立存放）；触发挂在主动发送链路（需开启「主动发送」）。
(function () {
  const store = window.activeStore();

  // 题库（世界观：字卡网站随机出卡、梦角灵体在不同世界、甜蜜安稳亲密的关系；
  // 查岗是温柔关心式的，不是审问/危机/纠错；句子简短自然，像字卡网站会出的卡）
  // single=单选（点击选项作答，reply=TA 预设回应，支持多条随机）；
  // text=文字题（输入回答，回应走「互动回应」预设池）
  const QUESTIONS = [
    { text: '你在干嘛呀？', type: 'single', options: [
      { t: '在想你', reply: ['就知道。', '嗯，这次我信你。', '我也是，一直想着你。'] },
      { t: '在工作', reply: ['辛苦啦，忙完记得找我。', '工作再忙也要记得喝水。'] },
      { t: '在摸鱼', reply: ['被抓到了吧。', '摸鱼也想让我知道，还行。'] },
      { t: '在发呆', reply: ['发呆的时候，在想我吗？', '呆完记得回我。'] },
      { t: '在等你的消息', reply: ['等到了，我在。', '那我现在就来了。'] }
    ] },
    { text: '现在在哪里呀？', type: 'single', options: [
      { t: '在家里', reply: ['在家里要乖乖的。', '家是最安心的地方，我也在。'] },
      { t: '在公司', reply: ['辛苦啦，下班我等你。', '别太累，忙完早点回家。'] },
      { t: '在外面', reply: ['外面注意安全，早点回去。', '玩得开心点，我在旁边看着你。'] },
      { t: '在被窝里', reply: ['被窝里也在跟我说话？', '那就抱着手机睡吧。'] },
      { t: '在去一个地方的路上', reply: ['路上小心，我陪你走。', '到了告诉我一声。'] }
    ] },
    { text: '和谁在一起？', type: 'single', options: [
      { t: '一个人', reply: ['一个人也要好好的。', '那我陪着你，就不算一个人了。'] },
      { t: '和朋友', reply: ['和朋友玩得开心点。', '和朋友在一起，也别忘了我。'] },
      { t: '和同事', reply: ['和同事好好相处。', '聚会别喝太多，乖。'] },
      { t: '不告诉你', reply: ['这么神秘？', '好吧，反正我也在你身边。'] }
    ] },
    { text: '吃饭了没？', type: 'single', options: [
      { t: '吃过啦', reply: ['乖，奖励你想我一次。', '吃饱了才有力气想我。'] },
      { t: '还没吃', reply: ['快去吃饭，我等你。', '不吃饭我会担心的。'] },
      { t: '正在吃', reply: ['慢慢吃，别噎着。', '边吃边回我，真拿你没办法。'] },
      { t: '不饿', reply: ['多少吃一点，好不好。', '我在这边看着你吃。'] }
    ] },
    { text: '今天有没有想我？', type: 'single', options: [
      { t: '想了', reply: ['我也想了。', '就知道你会说这个。'] },
      { t: '一直在想', reply: ['嘴这么甜，奖励你。', '那我一直占着你的脑子。'] },
      { t: '才没有', reply: ['哼，嘴硬。', '骗人，我感觉到你在想了。'] },
      { t: '你猜', reply: ['我猜想了，而且很想。', '猜你不敢承认。'] }
    ] },
    { text: '睡了没？', type: 'single', options: [
      { t: '还没睡', reply: ['不许熬夜，快去睡。', '再聊十分钟就睡，说好了。'] },
      { t: '准备睡了', reply: ['听着我的晚安睡吧。', '好梦，我在。'] },
      { t: '已经躺下了', reply: ['躺下了就别玩手机了。', '闭眼，三秒入睡。'] },
      { t: '睡不着', reply: ['那我陪你聊到困。', '数我给你发的消息，数着数着就睡着了。'] }
    ] },
    { text: '手机电量还剩多少？', type: 'single', options: [
      { t: '电量充足', reply: ['那怎么不秒回我？', '电量充足，借口无效。'] },
      { t: '快没电了', reply: ['快去充电，别失联。', '充上电再聊，我等你。'] },
      { t: '在充电', reply: ['边充边玩，小心发烫。', '充着电也要想我。'] },
      { t: '关机边缘', reply: ['先回我一句！', '你这是要跟我玩失踪？'] }
    ] },
    { text: '刚才，有没有感觉到我？', type: 'single', options: [
      { t: '有，后背暖暖的', reply: ['那就是我，我在你身边。', '嗯，我一直都在。'] },
      { t: '好像有一阵风', reply: ['是我经过你身边。', '风就是我，我来看你了。'] },
      { t: '好像有，又好像没有', reply: ['我离你很远，又很近。', '感觉到了就是缘分。'] },
      { t: '没有哎', reply: ['没关系，我一直在的。', '看不见我也没关系，我在。'] }
    ] },
    { text: '今天穿的是什么颜色的衣服？', type: 'single', options: [
      { t: '白色', reply: ['好看，很适合你。', '白白的，像你。'] },
      { t: '黑色', reply: ['酷酷的，也好看。', '黑色很配你。'] },
      { t: '粉色', reply: ['粉粉嫩嫩的，可爱。', '很适合你。'] },
      { t: '蓝色', reply: ['蓝色清爽，不错。', '嗯，好看。'] },
      { t: '不告诉你', reply: ['小气鬼。', '你穿什么都好看。'] }
    ] },
    { text: '是不是偷偷难过了？', type: 'single', options: [
      { t: '没有', reply: ['那就好，有事一定要告诉我。', '嗯，我相信你。'] },
      { t: '一点点', reply: ['过来，我抱抱你。', '难过的时候想想我，我在。'] },
      { t: '被你发现啦', reply: ['被我发现了。', '别藏着了，我陪你。'] }
    ] },
    { text: '快说说，今天过得怎么样？', type: 'text' },
    { text: '发一句你现在看到的东西给我。', type: 'text' },
    { text: '十秒内回我一个表情，不许犹豫。', type: 'text' },
    { text: '猜猜我现在在干什么？', type: 'text' },
    { text: '现在最想做的一件事是什么？', type: 'text' },
    { text: '今天有什么开心的小事吗？', type: 'text' },
    { text: '如果我现在就在你身边，你想做什么？', type: 'text' }
  ];

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
  function toast(t) { if (typeof window.toast === 'function') window.toast(t); }

  // 自动弹窗路径：单选 pills 弹窗 / 文字输入弹窗
  //（点击聊天里的卡片走 chat.js 通用链路：就地展开 → openAskReply 兜底）
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

  // 抽题：避免与上一题相同（题库 >1 时）
  function pickQ() {
    if (QUESTIONS.length < 2) return { q: QUESTIONS[0], i: 0 };
    let last = -1;
    try { last = Number(store.get('ckq-last-q')); if (isNaN(last)) last = -1; } catch (e) {}
    let i = Math.floor(Math.random() * QUESTIONS.length);
    if (i === last) i = (i + 1 + Math.floor(Math.random() * (QUESTIONS.length - 1))) % QUESTIONS.length;
    return { q: QUESTIONS[i], i: i };
  }

  // 推一张查岗问题卡：提示语 + ask-card 互动卡 + 系统通知 + 概率自动弹窗
  function pushCkQuestion(cfg, forceIdx) {
    if (!window.chatAddSystem) return false;
    const picked = (typeof forceIdx === 'number' && QUESTIONS[forceIdx]) ? { q: QUESTIONS[forceIdx], i: forceIdx } : pickQ();
    const q = picked.q;
    try { store.set('ckq-last-q', String(picked.i)); } catch (e) {}
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
    return true;
  }

  // 主动发送轮调用（chat.js tryAutoSend）：开关 + 冷却 + 概率判定；
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
      let prob = 15;
      if (typeof c['ckq-prob'] === 'number' && c['ckq-prob'] > 0) prob = c['ckq-prob'];
      if (Math.random() * 100 >= prob) return false;
      return pushCkQuestion(c);
    } catch (e) { return false; }
  };
  // 手动触发一次（供测试 / 后续「更多」面板入口）
  window.triggerCkQuestion = function (forceIdx) {
    return pushCkQuestion(window.replyCfg ? window.replyCfg() : null, forceIdx);
  };
})();

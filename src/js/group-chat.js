// ===== 功能：群聊页（所有桌面成员在一个窗口里聊天） =====
// 桌面点「群聊」进入；成员来自 window.getContacts()（所有联系人/桌面成员）；
// 用户发消息后随机 1-2 个成员回复，@昵称则被@的成员回复；
// 消息全局存储（xy-home-v2:group-chat-msgs），不随联系人切换变。
// 依赖：contacts.js（getContacts/storeFor/activeStore）、idb.js（idbGet/idbSet）、sfx.js（playSfx）
(function () {
  const body = document.getElementById('gc-body');
  if (!body) return;
  const G = 'xy-home-v2';
  const MSG_KEY = G + ':group-chat-msgs';
  const page = document.getElementById('page-group-chat');
  const input = document.getElementById('gc-input');
  const sendBtn = document.getElementById('gc-send');
  const backBtn = document.getElementById('gc-back');
  const nameEl = document.getElementById('gc-name');
  const typingEl = document.getElementById('gc-typing');
  const membersBtn = document.getElementById('gc-members-btn');
  const membersPanel = document.getElementById('gc-members-panel');
  const membersClose = document.getElementById('gc-mp-close');
  const membersBody = document.getElementById('gc-mp-body');
  const atBtn = document.getElementById('gc-at-btn');
  const atPanel = document.getElementById('gc-at-panel');
  const atBody = document.getElementById('gc-at-body');

  const FALLBACK_REPLIES = ['好的～', '嗯嗯', '收到', '哈哈', '在的', '我知道啦', '是吗', '然后呢', '有意思', '同意', '哈哈哈', '对的', '没错', '我也觉得', '确实', '哇'];

  let msgs = [];
  let saveTimer = null;
  const RENDER_MAX = 200;

  // ---- 成员信息 ----
  function getMembers() {
    try { return window.getContacts() || [{ id: 'default', name: '默认' }]; } catch (e) { return [{ id: 'default', name: '默认' }]; }
  }
  function memberName(cid) {
    try { const lbl = window.storeFor(cid).get('lbl-partner'); if (lbl) return lbl; } catch (e) {}
    const m = getMembers().find(x => x.id === cid);
    return m ? m.name : '成员';
  }
  function memberAvatar(cid) {
    try { return window.storeFor(cid).get('avatar-partner') || ''; } catch (e) { return ''; }
  }
  function myName() {
    try { const v = window.activeStore().get('lbl-user'); if (v) return v; } catch (e) {}
    return '我';
  }
  function myAvatar() {
    try { return window.activeStore().get('avatar-user') || ''; } catch (e) { return ''; }
  }

  // ---- 头像渲染 ----
  function fillAv(el, dataUrl) {
    if (!el) return;
    el.innerHTML = '';
    if (dataUrl && dataUrl.length > 10 && dataUrl.length < 500 * 1024) {
      const img = document.createElement('img');
      img.src = dataUrl; img.alt = '';
      el.appendChild(img);
    } else {
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
    }
  }

  // ---- 消息存储（LS 立即写保证持久化可见，IDB 防抖写减少异步开销） ----
  function saveMsgs() {
    const data = JSON.stringify(msgs);
    try { localStorage.setItem(MSG_KEY, data); } catch (e) {}
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { if (window.idbSet) window.idbSet(MSG_KEY, data); } catch (e) {}
    }, 300);
  }
  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const data = JSON.stringify(msgs);
    try { localStorage.setItem(MSG_KEY, data); } catch (e) {}
    try { if (window.idbSet) window.idbSet(MSG_KEY, data); } catch (e) {}
  }
  function loadMsgs() {
    try { msgs = JSON.parse(localStorage.getItem(MSG_KEY) || '[]'); } catch (e) { msgs = []; }
    if (!Array.isArray(msgs)) msgs = [];
    try {
      if (window.idbGet) {
        window.idbGet(MSG_KEY).then(v => {
          if (v === undefined || v === null) return;
          try { const a = JSON.parse(v); if (Array.isArray(a) && a.length >= msgs.length) { msgs = a; renderAll(); } } catch (e) {}
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // ---- 渲染 ----
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // v3.8.x：与 chat.js 的 escTxt/escTxtBr 对齐——全量转义 + 换行转 <br>。
  // 群聊气泡渲染与普通聊天页完全一致（此前用 textContent 设纯文本，多行消息不换行、
  // 且与普通聊天页的 span 包裹方式有差异）。
  function escTxt(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escTxtBr(s) { return escTxt(s).replace(/\n/g, '<br>'); }
  function attrEsc(s) { return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // 引用块（复用聊天页 .msg-quote 样式；图片/表情包引用只显示缩略图）
  function gcQuoteHtml(q) {
    if (q && typeof q === 'string') {
      if (q.indexOf('data:') === 0) {
        return '<div class="msg-quote"><img class="msg-quote-img" src="' + attrEsc(q) + '" alt="图片"></div>';
      }
      return '<div class="msg-quote"><span class="msg-quote-text">' + escTxtBr(q) + '</span></div>';
    }
    return '';
  }
  // 群聊语音播放（聊天页 playVoiceInChat 在 chat.js 闭包内不暴露，群聊独立一份）
  let gcVoiceAudio = null;
  let gcVoiceBtn = null;
  function gcPlayVoice(btn, src) {
    if (!src) return;
    if (gcVoiceBtn === btn) { try { gcVoiceAudio.pause(); } catch (e) {} gcVoiceAudio = null; if (gcVoiceBtn) gcVoiceBtn.classList.remove('playing'); gcVoiceBtn = null; return; }
    if (gcVoiceBtn) { try { gcVoiceAudio.pause(); } catch (e) {} gcVoiceBtn.classList.remove('playing'); }
    const a = new Audio(src);
    gcVoiceAudio = a; gcVoiceBtn = btn;
    btn.classList.add('playing');
    const stop = () => { if (gcVoiceBtn) gcVoiceBtn.classList.remove('playing'); gcVoiceBtn = null; gcVoiceAudio = null; };
    a.addEventListener('ended', stop);
    a.addEventListener('error', stop);
    a.play().catch(stop);
  }
  function renderMsg(rec, idx) {
    const m = document.createElement('div');
    m.className = 'msg ' + (rec.side === 'out' ? 'msg-out' : 'msg-in');
    if (idx === undefined) idx = msgs.length - 1;
    m.dataset.gcIdx = idx;
    const timeHtml = rec.ts ? '<span class="msg-time">' + fmtTime(rec.ts) + '</span>' : '';
    if (rec.side === 'out') {
      m.innerHTML = '<div class="msg-bubble"></div><div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div>';
    } else {
      // v3.8.x：群聊不显示成员昵称（与普通聊天页一致——头像 + 气泡，无名字）
      m.innerHTML = '<div class="msg-side"><div class="msg-av"></div>' + timeHtml + '</div><div class="msg-bubble"></div>';
    }
    const av = m.querySelector('.msg-av');
    const b = m.querySelector('.msg-bubble');
    if (rec.side === 'out') fillAv(av, myAvatar());
    else fillAv(av, memberAvatar(rec.cid));
    // 拍一拍：居中系统样式
    if (rec.special === 'poke') {
      m.className = 'msg-poke';
      m.innerHTML = '<span>' + escTxt(rec.text || '') + '</span>';
      body.appendChild(m);
      return m;
    }
    const quoteStr = rec.quote ? gcQuoteHtml(rec.quote) : '';
    // v3.9.x：按消息类型渲染（与聊天页 renderMsg 对齐：表情包小图/图片大图/语音可播放）
    if (rec.retracted) {
      b.innerHTML = '<span style="opacity:.6;font-size:12px">' + (rec.side === 'out' ? '我' : memberName(rec.cid)) + '撤回了一条消息</span>';
    } else if (rec.type === 'sticker' || rec.type === 'image') {
      b.style.padding = '6px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      b.innerHTML = quoteStr + (rec.type === 'image'
        ? '<img class="msg-img msg-img-big" src="' + attrEsc(rec.text) + '" alt="图片" loading="lazy" decoding="async">'
        : '<img class="msg-img msg-img-sm" src="' + attrEsc(rec.text) + '" alt="表情" loading="lazy" decoding="async">');
    } else if (rec.type === 'voice') {
      b.style.padding = '8px 10px';
      b.style.background = '';
      b.style.border = '';
      b.style.boxShadow = '';
      const vparts = String(rec.text || '').split('|||');
      const vname = (vparts[0] || '语音消息').replace(/\.[^.]+$/, '');
      const vsrc = vparts[1] || '';
      b.innerHTML = quoteStr + '<div class="msg-voice" data-src="' + attrEsc(vsrc) + '">' +
        '<button class="msg-voice-play" title="播放">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
        '</button>' +
        '<div class="msg-voice-wave"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<span class="msg-voice-name">' + escTxt(vname) + '</span>' +
        '</div>';
      b.querySelector('.msg-voice-play').addEventListener('click', function (e) {
        e.stopPropagation();
        gcPlayVoice(this, vsrc);
      });
    } else if (rec.parts && rec.parts.length) {
      const imgs = rec.parts.filter(p => p.k === 'img');
      const textPart = rec.parts.filter(p => p.k === 'text').map(p => p.v).join(' ');
      let inner = '';
      if (imgs.length) {
        inner += '<div class="msg-parts-imgs' + (imgs.length > 1 ? ' multi' : '') + '">' +
          imgs.map(p => {
            const isSticker = p.sub === 'sticker';
            return '<img class="msg-img' + (isSticker ? ' msg-img-sm' : ' msg-img-big') + '" src="' + attrEsc(p.v) + '" alt="' + (isSticker ? '表情' : '图片') + '" loading="lazy" decoding="async">';
          }).join('') + '</div>';
      }
      if (textPart) inner += '<span style="opacity:.85;word-break:break-word">' + escTxtBr(textPart) + '</span>';
      b.innerHTML = quoteStr + inner;
    } else {
      // v3.8.x：与 chat.js 一致——span 包裹 + 全量转义 + 换行转 <br>
      b.innerHTML = quoteStr + '<span style="opacity:.85">' + escTxtBr(rec.text || '') + '</span>';
    }
    body.appendChild(m);
    return m;
  }
  function renderAll() {
    body.innerHTML = '';
    const n = msgs.length;
    const start = Math.max(0, n - RENDER_MAX);
    for (let i = start; i < n; i++) renderMsg(msgs[i], i);
    scrollToBottom();
  }
  function scrollToBottom() { try { body.scrollTop = body.scrollHeight; } catch (e) {} }

  // ---- 发送 ----
  function addMsg(text) {
    const t = (text || '').trim();
    if (!t) return;
    const rec = { side: 'out', text: t, ts: Date.now() };
    msgs.push(rec);
    saveMsgs();
    renderMsg(rec);
    if (window.playSfx) window.playSfx('out');
    if (input) input.textContent = '';
    scheduleReply(t);
  }

  // ---- 回复内容生成（从该成员字卡池随机选，兜底数组） ----
  // v3.9.x：群聊回复全部走群聊回复设置（reply-settings.js 的 gc-* 键，全局生效）：
  // 每个联系人回复概率/回复速度/条数/拍一拍/表情包/emoji/图片/语音/颜文字/引用/撤回/多字卡
  function gcCfg() {
    const d = {
      'gc-prob': 60, 'gc-rs-min': 1, 'gc-rs-max': 40,
      'gc-reply-min': 1, 'gc-reply-max': 2,
      'gc-touch-prob': 5, 'gc-sticker-prob': 10, 'gc-emoji-prob': 5, 'gc-image-prob': 5, 'gc-voice-prob': 10,
      'gc-kaomoji-prob': 5, 'gc-quote-prob': 30, 'gc-rc-prob': 25, 'gc-rc-refix': 35,
      'gc-py-en': 1, 'gc-py-prob': 50, 'gc-py-min': 2, 'gc-py-max': 5
    };
    try {
      const c = (window.groupChatCfg && window.groupChatCfg()) || {};
      Object.keys(d).forEach(k => { if (c[k] === undefined) c[k] = d[k]; });
      return c;
    } catch (e) { return d; }
  }
  function hit(p) { return Math.random() * 100 < p; }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
  function pickN(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (copy.length && out.length < n) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    return out;
  }
  // 该成员的字卡池（按分类；媒体/自定义字卡读该联系人桌面，默认字卡兜底）
  function gcPool(cid) {
    const text = [], kaomoji = [], emoji = [], sticker = [], image = [], voice = [];
    try {
      const mediaSticker = (window.getMediaCardsFor && window.getMediaCardsFor(cid, 'sticker')) || [];
      const mediaImage = (window.getMediaCardsFor && window.getMediaCardsFor(cid, 'image')) || [];
      const mediaVoice = (window.getMediaCardsFor && window.getMediaCardsFor(cid, 'voice')) || [];
      sticker.push.apply(sticker, mediaSticker);
      image.push.apply(image, mediaImage);
      voice.push.apply(voice, mediaVoice);
      const raw = window.storeFor(cid).get('cc-groups');
      if (raw) {
        const groups = JSON.parse(raw);
        if (groups && typeof groups === 'object') {
          Object.keys(groups).forEach(key => {
            const g = groups[key];
            if (g && Array.isArray(g.cards)) {
              g.cards.forEach(card => {
                if (!card || typeof card !== 'object') return;
                if (card.type === 'text' && card.text) text.push(card.text);
                else if (card.type === 'emoji' && card.text) emoji.push(card.text);
                else if (card.type === 'kaomoji' && card.text) kaomoji.push(card.text);
                else if (card.type === 'sticker' && card.text) sticker.push(card.text);
                else if (card.type === 'image' && card.text) image.push(card.text);
                else if (card.type === 'voice' && card.text) voice.push(card.text);
              });
            }
          });
        }
      }
    } catch (e) {}
    // 默认字卡兜底（与聊天页 getPool 一致：按默认字卡开关/分类开关/聊天场景开关）
    try {
      const dcfg = (window.defaultCardCfg && window.defaultCardCfg()) || {};
      const useChat = window.defaultCardUse ? window.defaultCardUse('chat') : true;
      if (dcfg.enabled !== false && useChat && (!text.length || !kaomoji.length || !emoji.length)) {
        const catOn = window.defaultCardCat || (() => true);
        const isOff = window.isDefaultCardOff || null;
        if (catOn('main')) {
          const defGrps = (window.getDefaultCardGroups && window.getDefaultCardGroups('main')) || [];
          defGrps.forEach(g => {
            (g[1] || []).forEach(card => {
              if (isOff && isOff('main', card)) return;
              if (typeof card !== 'string' || !card) return;
              if (/[\uD800-\uDBFF]/.test(card)) emoji.push(card);
              else if (/[\(（｡◕(◕)(づ｡(¬)]/.test(card) && /[\)）】)]/.test(card)) kaomoji.push(card);
              else text.push(card);
            });
          });
        }
        if (catOn('kaomoji') && !kaomoji.length) {
          const kg = (window.getDefaultCardGroups && window.getDefaultCardGroups('kaomoji')) || [];
          kg.forEach(g => (g[1] || []).forEach(card => { if (isOff && isOff('kaomoji', card)) return; if (typeof card === 'string' && card) kaomoji.push(card); }));
        }
        if (catOn('emoji') && !emoji.length) {
          const eg = (window.getDefaultCardGroups && window.getDefaultCardGroups('emoji')) || [];
          eg.forEach(g => (g[1] || []).forEach(card => { if (isOff && isOff('emoji', card)) return; if (typeof card === 'string' && card) emoji.push(card); }));
        }
      }
    } catch (e) {}
    return { text, kaomoji, emoji, sticker, image, voice };
  }
  // 生成一条成员回复（多字卡/表情包/emoji/图片/语音/颜文字，同聊天页 genOneReply 语义）
  function gcGenReply(cid, c) {
    const pool = gcPool(cid);
    let t, type = 'text';
    if (c['gc-py-en'] === 1 && hit(c['gc-py-prob']) && pool.text.length) {
      const n = randInt(c['gc-py-min'], c['gc-py-max']);
      t = pickN(pool.text, n).join(' ');
    } else {
      if (pool.sticker.length && hit(c['gc-sticker-prob'])) {
        t = pick(pool.sticker); type = 'sticker';
      } else if (pool.emoji.length && hit(c['gc-emoji-prob'])) {
        t = pick(pool.emoji);
      } else if (pool.image.length && hit(c['gc-image-prob'])) {
        t = pick(pool.image); type = 'image';
      } else if (pool.voice.length && hit(c['gc-voice-prob'])) {
        t = pick(pool.voice); type = 'voice';
      } else {
        t = pick(pool.text) || FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
      }
    }
    if (type === 'text' && pool.kaomoji.length && hit(c['gc-kaomoji-prob'])) {
      t += ' ' + pick(pool.kaomoji);
    }
    // 组合消息：文字 + 表情包/图片 附加到同一条（同聊天页 genOneReply）
    let parts = null;
    if (type === 'text') {
      if (hit(c['gc-sticker-prob'] || 0) && pool.sticker.length) {
        parts = [{ k: 'text', v: t }, { k: 'img', v: pick(pool.sticker), sub: 'sticker' }];
      } else if (hit(c['gc-image-prob'] || 0) && pool.image.length) {
        parts = [{ k: 'text', v: t }, { k: 'img', v: pick(pool.image), sub: 'image' }];
      }
    }
    return { text: t, type: type, parts: parts };
  }
  // 成员拍一拍文本（该成员视角：成员名 + 字卡，含"你/我"按聊天页规则替换成我的称呼）
  function gcPokeText(cid) {
    const name = memberName(cid);
    let action = '';
    const dcfg = (window.defaultCardCfg && window.defaultCardCfg()) || {};
    const useChat = window.defaultCardUse ? window.defaultCardUse('chat') : true;
    const touchOn = window.defaultCardCat ? window.defaultCardCat('touch') : true;
    if (dcfg.enabled && useChat && touchOn && (dcfg.probs && (dcfg.probs.touch || 0) > 0)) {
      const d = (window.getDefaultCards && window.getDefaultCards()) || null;
      if (d && d.type === 'poke') action = d.text;
    }
    if (!action) {
      const poke = [];
      try {
        const raw = window.storeFor(cid).get('cc-groups');
        if (raw) {
          const groups = JSON.parse(raw);
          if (groups && groups.poke && Array.isArray(groups.poke.cards)) {
            groups.poke.cards.forEach(card => { if (card && card.text) poke.push(card.text); });
          }
        }
      } catch (e) {}
      action = poke.length ? pick(poke) : '拍了拍我';
    }
    let text;
    if (action.indexOf('你') >= 0) {
      if (action.charAt(0) === '你' || action.charAt(0) === '我') {
        text = name + ' ' + action.slice(1).replace(/你(?![们])/g, myName());
      } else {
        text = name + ' ' + action.replace(/你(?![们])/g, myName());
      }
    } else if (action.charAt(0) === '我') {
      text = name + ' ' + action.slice(1);
    } else {
      text = name + ' ' + action;
    }
    return text;
  }
  function showTyping(name) { if (typingEl) { typingEl.textContent = (name || '成员') + ' 正在输入…'; typingEl.hidden = false; } }
  function hideTyping() { if (typingEl) typingEl.hidden = true; }
  // v3.9.x：单条成员消息撤回（标记 + 局部重渲染）
  function retractGcMsg(idx) {
    if (idx < 0 || idx >= msgs.length) return;
    const rec = msgs[idx];
    if (!rec || rec.retracted) return;
    rec.retracted = true;
    saveMsgs();
    const target = body.querySelector('.msg[data-gc-idx="' + idx + '"]');
    if (target && target.parentNode) {
      const m = renderMsg(rec, idx);
      target.parentNode.replaceChild(m, target);
    }
  }
  // v3.9.x：成员回复——按群聊回复设置：回复速度/条数/拍一拍/表情包/emoji/图片/语音/
  // 颜文字/引用/撤回（含撤回补发），与聊天页被动回复语义一致
  function memberReply(cid, quoteText) {
    const c = gcCfg();
    const name = memberName(cid);
    const rsMin = Math.max(1, Number(c['gc-rs-min']) || 1);
    const rsMax = Math.max(rsMin, Number(c['gc-rs-max']) || rsMin);
    const delay = (rsMin + Math.random() * Math.max(1, rsMax - rsMin)) * 1000;
    showTyping(name);
    setTimeout(() => {
      hideTyping();
      // 拍一拍分支（同聊天页：命中则不回文字，直接拍）
      if (hit(c['gc-touch-prob'])) {
        const rec = { side: 'in', cid: cid, name: name, text: gcPokeText(cid), special: 'poke', ts: Date.now() };
        msgs.push(rec);
        saveMsgs();
        renderMsg(rec, msgs.length - 1);
        if (window.playSfx) window.playSfx('in');
        return;
      }
      // 回复条数（min/max 调反时兜底至少 1 条）
      const rpMin = Math.max(1, Number(c['gc-reply-min']) || 1);
      const rpMax = Math.max(rpMin, Number(c['gc-reply-max']) || 2);
      const count = randInt(rpMin, rpMax);
      // 本轮整体掷一次引用（只给第一条带引用，防多条连续引用同一句）
      const wantQuote = hit(c['gc-quote-prob']) && !!quoteText;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          hideTyping();
          const rep = gcGenReply(cid, c);
          const q = (wantQuote && i === 0) ? quoteText : null;
          const rec = { side: 'in', cid: cid, name: name, text: rep.text, type: rep.type, parts: rep.parts, ts: Date.now() };
          if (q) rec.quote = q;
          msgs.push(rec);
          saveMsgs();
          renderMsg(rec, msgs.length - 1);
          if (window.playSfx) window.playSfx('in');
          if (i < count - 1) showTyping(name);
          const myIdx = msgs.length - 1;
          // 撤回 + 撤回补发
          if (hit(c['gc-rc-prob'])) {
            setTimeout(() => {
              retractGcMsg(myIdx);
              if (hit(c['gc-rc-refix'])) {
                showTyping(name);
                setTimeout(() => {
                  hideTyping();
                  const rep2 = gcGenReply(cid, c);
                  const rec2 = { side: 'in', cid: cid, name: name, text: rep2.text, type: rep2.type, parts: rep2.parts, ts: Date.now() };
                  msgs.push(rec2);
                  saveMsgs();
                  renderMsg(rec2, msgs.length - 1);
                  if (window.playSfx) window.playSfx('in');
                }, 700);
              }
            }, 900);
          }
        }, i * randInt(1200, 2800));
      }
    }, delay);
  }
  // v3.9.x：@ 的成员必定回复；其余成员按「每个联系人回复概率」独立掷骰，命中才回
  function scheduleReply(userText) {
    const members = getMembers();
    if (!members.length) return;
    const c = gcCfg();
    // 检测 @提及
    const mentioned = [];
    members.forEach(m => {
      const n = memberName(m.id);
      if (userText.indexOf('@' + n) >= 0) mentioned.push(m.id);
    });
    let targets;
    if (mentioned.length) {
      targets = mentioned.slice();
    } else {
      targets = members.filter(() => hit(c['gc-prob'])).map(m => m.id);
    }
    if (!targets.length) return;
    // 各成员独立排期回复（成员间错开更自然）
    targets.forEach((cid, i) => {
      setTimeout(() => memberReply(cid, userText), i * (1200 + Math.random() * 1600));
    });
  }

  // ---- 进入/退出 ----
  function updateGroupName() {
    const n = getMembers().length;
    if (nameEl) nameEl.textContent = '群聊(' + n + ')';
  }
  function enterGroupChat() {
    const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
    if (editing) return;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    if (page) page.hidden = false;
    updateGroupName();
    loadMsgs();
    renderAll();
  }
  if (backBtn) backBtn.addEventListener('click', () => {
    saveNow();
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const home = document.getElementById('page-phone'); if (home) home.hidden = false;
  });

  // ---- 群聊按钮点击 ----
  const gcApp = document.querySelector('.app[data-app="group-chat"]');
  if (gcApp) gcApp.addEventListener('click', enterGroupChat);

  // ---- 发送按钮 ----
  if (sendBtn) sendBtn.addEventListener('click', () => addMsg(input.innerText));
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addMsg(input.innerText);
    }
  });

  // ---- 成员列表面板 ----
  function renderMembersPanel() {
    if (!membersBody) return;
    membersBody.innerHTML = '';
    const meRow = document.createElement('div');
    meRow.className = 'gc-mp-item';
    meRow.innerHTML = '<div class="gc-mp-av"></div><span class="gc-mp-name">' + escapeHtml(myName()) + '</span><span class="gc-mp-tag">我</span>';
    fillAv(meRow.querySelector('.gc-mp-av'), myAvatar());
    membersBody.appendChild(meRow);
    getMembers().forEach(m => {
      const row = document.createElement('div');
      row.className = 'gc-mp-item';
      row.innerHTML = '<div class="gc-mp-av"></div><span class="gc-mp-name">' + escapeHtml(memberName(m.id)) + '</span>';
      fillAv(row.querySelector('.gc-mp-av'), memberAvatar(m.id));
      membersBody.appendChild(row);
    });
  }
  if (membersBtn) membersBtn.addEventListener('click', () => { renderMembersPanel(); if (membersPanel) membersPanel.hidden = false; });
  if (nameEl) nameEl.addEventListener('click', () => { renderMembersPanel(); if (membersPanel) membersPanel.hidden = false; });
  if (membersClose) membersClose.addEventListener('click', () => { if (membersPanel) membersPanel.hidden = true; });

  // ---- @提及面板 ----
  function renderAtPanel() {
    if (!atBody) return;
    atBody.innerHTML = '';
    getMembers().forEach(m => {
      const row = document.createElement('div');
      row.className = 'gc-at-item';
      const n = memberName(m.id);
      row.innerHTML = '<div class="gc-at-av"></div><span>' + escapeHtml(n) + '</span>';
      fillAv(row.querySelector('.gc-at-av'), memberAvatar(m.id));
      row.addEventListener('click', () => {
        if (input) {
          const cur = input.innerText;
          input.innerText = cur + (cur && !cur.endsWith(' ') ? ' ' : '') + '@' + n + ' ';
          input.focus();
          try { const r = document.createRange(); r.selectNodeContents(input); r.collapse(false); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) {}
        }
        if (atPanel) atPanel.hidden = true;
      });
      atBody.appendChild(row);
    });
  }
  if (atBtn) atBtn.addEventListener('click', () => { renderAtPanel(); if (atPanel) atPanel.hidden = false; });

  // 点击面板背景关闭
  if (atPanel) atPanel.addEventListener('click', (e) => { if (e.target === atPanel) atPanel.hidden = true; });

  // ---- 切联系人：消息全局不变，刷新群名 + 重渲染（"我"头像/成员名可能变） ----
  document.addEventListener('contact-switched', function () {
    try { hideTyping(); } catch (e) {}
    updateGroupName();
    renderAll();
  });

  // 暴露（供数据备份等用）
  window.groupChatGetMsgs = function () { return msgs.slice(); };
  window.groupChatClear = function () { msgs = []; saveNow(); renderAll(); };
})();
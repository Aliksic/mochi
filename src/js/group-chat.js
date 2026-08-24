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
  const atPanel = document.getElementById('gc-at-panel');
  const atBody = document.getElementById('gc-at-body');
  // v3.11.x：输入栏与普通聊天页统一——更多功能/表情包/插入图片按钮 + 待发送图片草稿条
  // （原 @群成员 独立按钮移入「更多功能」面板 #gc-more-panel）
  const gcMoreBtn = document.getElementById('gc-input-more-btn');
  const gcMorePanel = document.getElementById('gc-more-panel');
  const gcMoreAt = document.getElementById('gc-more-at');
  const gcEmojiBtn = document.getElementById('gc-emoji-btn');
  const gcImgBtn = document.getElementById('gc-img-btn');
  const gcDraftBar = document.getElementById('gc-draft');
  const gcDraftItems = document.getElementById('gc-draft-items');

  const FALLBACK_REPLIES = ['好的～', '嗯嗯', '收到', '哈哈', '在的', '我知道啦', '是吗', '然后呢', '有意思', '同意', '哈哈哈', '对的', '没错', '我也觉得', '确实', '哇'];

  let msgs = [];
  let saveTimer = null;
  const RENDER_MAX = 200;

  // ---- 群聊形象设置（v3.9.x，全局 xy-home-v2:gc-profiles，不随桌面隔离） ----
  // { me: {name, avatar}, <cid>: {name, avatar} }——设置了群聊昵称/头像的成员/我，
  // 在群聊页统一显示群聊形象；未设的字段回退该联系人桌面昵称/头像（lbl-*/avatar-*）。
  // 群聊是全局功能（消息/回复设置均全局），成员形象也全局存储，切换桌面不丢。
  const gcProfiles = {};
  function gcProfileStore() { try { return window.xyStore(G); } catch (e) { return null; } }
  function gcProfileLoad() {
    try {
      const v = gcProfileStore().get('gc-profiles');
      if (v) {
        const o = JSON.parse(v);
        if (o && typeof o === 'object') Object.keys(o).forEach(k => { gcProfiles[k] = o[k]; });
      }
    } catch (e) {}
  }
  function gcProfileSave() {
    try { gcProfileStore().set('gc-profiles', JSON.stringify(gcProfiles)); } catch (e) {}
  }
  function gcProfileGet(key) { return gcProfiles[key] || {}; }
  // name/avatar 传空串或 undefined = 清除该字段；两个都空则删除整条记录
  function gcProfileSet(key, name, avatar) {
    const p = gcProfiles[key] || (gcProfiles[key] = {});
    if (name === undefined) delete p.name; else if (name) p.name = name; else delete p.name;
    if (avatar === undefined) delete p.avatar; else if (avatar) p.avatar = avatar; else delete p.avatar;
    if (!p.name && !p.avatar) delete gcProfiles[key];
    gcProfileSave();
    refreshGroupViews();
  }
  // 群聊形象/成员变动后统一刷新（消息、成员面板、@面板、设置面板、标题）
  function refreshGroupViews() {
    try { renderAll(); } catch (e) {}
    try { if (membersPanel && !membersPanel.hidden) renderMembersPanel(); } catch (e) {}
    try { if (atPanel && !atPanel.hidden) renderAtPanel(); } catch (e) {}
    try { if (settingsPanel && !settingsPanel.hidden) renderSettingsPanel(); } catch (e) {}
    try { updateGroupName(); } catch (e) {}
  }
  gcProfileLoad();

  // ---- 群聊美化设置（v3.9.x，全局 xy-home-v2:gc-beauty，独立于聊天美化） ----
  // 只作用于群聊页 #page-group-chat：CSS 变量在 page 元素上局部覆盖（不串到聊天页，
  // 聊天页读的是 documentElement 上的同名变量）；壁纸/字体/自定义 CSS 也作用域到
  // 群聊页。存储只写非默认值；键名与聊天设置 cs-* 一一对应。
  const GC_BEAUTY_DEFAULTS = {
    'out-bg': '#111111', 'out-ink': '#ffffff', 'in-bg': '#ffffff', 'in-ink': '#111111',
    'send-bg': '#111111', 'send-ink': '#ffffff', 'send-show': 'show',
    'font-size': '14px', 'bubble-size': '11px 14px',
    'av-shape': 'circle', 'time-style': 'under-av',
    'bg': '', 'font': '', 'css': ''
  };
  const GC_BEAUTY_STYLES = [
    { label: '头像下方', value: 'under-av' },
    { label: '气泡下方', value: 'under-bubble' },
    { label: '时间气泡', value: 'bubble' },
    { label: '气泡外侧悬浮', value: 'float' },
    { label: '消息上方居中', value: 'center' },
    { label: '隐藏', value: 'hidden' }
  ];
  const GC_FONT_SIZES = [
    { label: '小', value: '13px' },
    { label: '标准', value: '14px' },
    { label: '大', value: '16px' },
    { label: '特大', value: '18px' }
  ];
  const GC_BUBBLE_SIZES = [
    { label: '紧凑', value: '8px 10px' },
    { label: '标准', value: '11px 14px' },
    { label: '宽松', value: '14px 18px' }
  ];
  // 色板与聊天设置一致（气泡底色 / 文字色 / 发送按钮底）
  const GC_BUBBLE_BG = [
    { color: '#111111', label: '默认黑' }, { color: '#ffffff', label: '白色' }, { color: '#3a3a3a', label: '炭灰' },
    { color: '#ffd6e0', label: '樱花粉' }, { color: '#d6e4ff', label: '雾霭蓝' }, { color: '#d8f5e0', label: '薄荷绿' },
    { color: '#fff3d6', label: '奶油黄' }, { color: '#e8dcff', label: '淡紫' }, { color: '#ffdcc0', label: '暖橘' }
  ];
  const GC_INK_COLORS = [
    { color: '#111111', label: '默认黑' }, { color: '#ffffff', label: '白色' }, { color: '#444444', label: '深灰' },
    { color: '#d6336c', label: '玫红' }, { color: '#1a56db', label: '蓝' }, { color: '#1e8e5a', label: '绿' },
    { color: '#9a6b00', label: '黄褐' }, { color: '#7048e8', label: '紫' }, { color: '#b3540a', label: '橘' }
  ];
  const GC_SEND_BG = [
    { color: '#111111', label: '默认黑' }, { color: '#07c160', label: '微信绿' }, { color: '#fa5151', label: '红包红' },
    { color: '#3a8ee6', label: '天空蓝' }, { color: '#ff9500', label: '活力橙' }, { color: '#9254de', label: '优雅紫' },
    { color: '#ffffff', label: '白色' }, { color: '#3a3a3a', label: '炭灰' }
  ];
  const gcBeautyStored = {};
  function gcBeautyStore() { return gcProfileStore(); }
  function gcBeautyLoad() {
    try {
      const v = gcBeautyStore().get('gc-beauty');
      if (v) { const o = JSON.parse(v); if (o && typeof o === 'object') Object.keys(o).forEach(k => { gcBeautyStored[k] = o[k]; }); }
    } catch (e) {}
  }
  function gcBeautyGet(k) { return gcBeautyStored[k] !== undefined ? gcBeautyStored[k] : GC_BEAUTY_DEFAULTS[k]; }
  function gcBeautySave() { try { gcBeautyStore().set('gc-beauty', JSON.stringify(gcBeautyStored)); } catch (e) {} }
  // 设置（空值/默认值 → 删除键）；应用 + 刷新设置面板回显
  function gcBeautySet(k, v) {
    const def = GC_BEAUTY_DEFAULTS[k];
    if (v === undefined || v === null || v === '' || (def !== undefined && v === def)) delete gcBeautyStored[k];
    else gcBeautyStored[k] = v;
    gcBeautySave();
    applyGcBeauty();
    try { if (settingsPanel && !settingsPanel.hidden) renderSettingsPanel(); } catch (e) {}
  }
  // ---- 颜色对比度保护（v3.9.x 修复：黑底黑字消息看不见） ----
  // 用户在美化里把文字颜色设成与气泡同色（色板第一个「默认黑」很易误选）时，
  // 消息会完全不可见。这里按 WCAG 亮度算对比度：应用后 < 阈值则回滚并提示；
  // 设置面板里对存量低对比度组合显示警告行。
  const GC_MIN_CONTRAST = 2.2;
  const GC_COLOR_PAIRS = {
    'out-ink': ['out-bg', 'out-ink'],
    'out-bg': ['out-bg', 'out-ink'],
    'in-ink': ['in-bg', 'in-ink'],
    'in-bg': ['in-bg', 'in-ink']
  };
  function gcColorLum(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function gcContrast(a, b) {
    const la = gcColorLum(a), lb = gcColorLum(b);
    if (la === null || lb === null) return null;
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }
  // key（四个颜色键之一）当前组合对比度是否过低的布尔
  function gcColorPairBad(key) {
    const p = GC_COLOR_PAIRS[key];
    if (!p) return false;
    const ratio = gcContrast(gcBeautyGet(p[0]), gcBeautyGet(p[1]));
    return ratio !== null && ratio < GC_MIN_CONTRAST;
  }
  // 设置面板里警告行文案（供 renderBeautyView 用）
  function gcColorWarnText(key) {
    const names = { 'out-bg': '我的气泡', 'in-bg': '联系人气泡' };
    const n = names[key] || '';
    return n + '：文字与气泡颜色太接近，消息可能看不清，建议改深/改浅';
  }
  // 群聊页局部字体（不污染全局 body/html）
  function applyGcFont() {
    const page = document.getElementById('page-group-chat');
    const old = document.getElementById('gc-font-style');
    if (old) old.remove();
    if (page) page.style.fontFamily = '';
    const v = gcBeautyGet('font');
    if (!v) return;
    if (v.indexOf('data:') === 0) {
      const st = document.createElement('style');
      st.id = 'gc-font-style';
      st.textContent = '@font-face{font-family:"gc-custom-font";src:url("' + String(v).replace(/<\/style/gi, '') + '");font-display:swap;}' +
        '#page-group-chat{font-family:"gc-custom-font",sans-serif !important;}';
      document.head.appendChild(st);
    } else {
      page.style.fontFamily = '"' + v.replace(/"/g, "'") + '",sans-serif';
    }
  }
  // 群聊页局部自定义气泡 CSS（选择器自动加 #page-group-chat 作用域）
  function applyGcCss() {
    const old = document.getElementById('gc-bubble-style');
    if (old) old.remove();
    const css = gcBeautyGet('css');
    if (!css) return;
    let out = css;
    if (css.indexOf('{') < 0) {
      out = '#page-group-chat .msg-out .msg-bubble{' + css + '!important;}' +
            '#page-group-chat .msg-in .msg-bubble{' + css + '!important;}';
    } else {
      out = css
        .replace(/\.msg-out\b/g, '#page-group-chat .msg-out')
        .replace(/\.msg-in\b/g, '#page-group-chat .msg-in')
        .replace(/\.message-sent\b/g, '#page-group-chat .msg-out .msg-bubble')
        .replace(/\.message-received\b/g, '#page-group-chat .msg-in .msg-bubble')
        .replace(/\.mb\.self\b/g, '#page-group-chat .msg-out .msg-bubble')
        .replace(/\.mb\.other\b/g, '#page-group-chat .msg-in .msg-bubble')
        .replace(/\.bubble-self\b/g, '#page-group-chat .msg-out .msg-bubble')
        .replace(/\.bubble-other\b/g, '#page-group-chat .msg-in .msg-bubble');
    }
    const st = document.createElement('style');
    st.id = 'gc-bubble-style';
    st.textContent = out;
    document.head.appendChild(st);
  }
  // 应用群聊美化（CSS 变量在 #page-group-chat 上局部覆盖；默认值与聊天页默认一致）
  function applyGcBeauty() {
    const page = document.getElementById('page-group-chat');
    if (!page) return;
    const g = gcBeautyGet;
    page.style.setProperty('--msg-in-bg', g('in-bg'));
    page.style.setProperty('--msg-in-ink', g('in-ink'));
    page.style.setProperty('--msg-out-bg', g('out-bg'));
    page.style.setProperty('--msg-out-ink', g('out-ink'));
    page.style.setProperty('--chat-font-size', g('font-size'));
    page.style.setProperty('--chat-bubble-pad', g('bubble-size'));
    page.style.setProperty('--send-bg', g('send-bg'));
    page.style.setProperty('--send-ink', g('send-ink'));
    page.style.setProperty('--msg-av-radius', g('av-shape') === 'square' ? '10px' : '50%');
    const sendBtn = document.getElementById('gc-send');
    if (sendBtn) sendBtn.style.display = g('send-show') === 'hide' ? 'none' : '';
    // 时间轴样式：page 级类（始终挂类，含默认 under-av 的还原规则，隔离聊天页 body 级类）
    GC_BEAUTY_STYLES.forEach(s => page.classList.remove('cs-time-' + s.value));
    page.classList.add('cs-time-' + g('time-style'));
    // 壁纸（>6MB 异常存量清掉回默认，同聊天页防护）
    let bg = g('bg');
    if (bg && typeof bg === 'string' && bg.length > 6 * 1024 * 1024) {
      try { gcBeautySet('bg', ''); } catch (e) {}
      bg = '';
    }
    const want = bg ? 'url("' + bg + '")' : '';
    if (page.style.backgroundImage !== want) {
      page.style.backgroundImage = want;
      if (bg) { page.style.backgroundSize = 'cover'; page.style.backgroundPosition = 'center'; }
    }
    applyGcFont();
    applyGcCss();
  }
  gcBeautyLoad();
  applyGcBeauty();

  // ---- 成员信息 ----
  function getMembers() {
    try { return window.getContacts() || [{ id: 'default', name: '默认' }]; } catch (e) { return [{ id: 'default', name: '默认' }]; }
  }
  function memberName(cid) {
    // v3.9.x：群聊昵称覆盖优先，未设置回退该联系人桌面昵称（lbl-partner）
    try { const p = gcProfileGet(cid); if (p.name) return p.name; } catch (e) {}
    try { const lbl = window.storeFor(cid).get('lbl-partner'); if (lbl) return lbl; } catch (e) {}
    const m = getMembers().find(x => x.id === cid);
    return m ? m.name : '成员';
  }
  function memberAvatar(cid) {
    try { const p = gcProfileGet(cid); if (p.avatar) return p.avatar; } catch (e) {}
    try { return window.storeFor(cid).get('avatar-partner') || ''; } catch (e) { return ''; }
  }
  function myName() {
    // v3.9.x：我的群聊昵称覆盖优先（群聊里"我"不再随切换桌面变化），未设置回退当前桌面
    try { const p = gcProfileGet('me'); if (p.name) return p.name; } catch (e) {}
    try { const v = window.activeStore().get('lbl-user'); if (v) return v; } catch (e) {}
    return '我';
  }
  function myAvatar() {
    try { const p = gcProfileGet('me'); if (p.avatar) return p.avatar; } catch (e) {}
    // v3.10.x：与聊天页一致——TA 换我头像只写聊天专用键 cs-avatar-user，未设回退桌面 avatar-user
    try { const cs = window.activeStore().get('cs-avatar-user'); if (cs) return cs; } catch (e) {}
    try { return window.activeStore().get('avatar-user') || ''; } catch (e) { return ''; }
  }
  // 桌面原本昵称（设置面板里"原昵称"区分用；我的取当前桌面）
  function deskPartnerName(cid) {
    try { const lbl = window.storeFor(cid).get('lbl-partner'); if (lbl) return lbl; } catch (e) {}
    const m = getMembers().find(x => x.id === cid);
    return m ? m.name : '';
  }
  function deskMeName() {
    try { return window.activeStore().get('lbl-user') || ''; } catch (e) { return ''; }
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
      // v3.10.x：补齐点击查看原消息（与聊天页 bindToggle 一致）——原仅显示提示文本，
      // 无 cursor:pointer 且未绑 onclick，用户反馈"群聊无法点击查看撤回的消息"。
      b.dataset.orig = rec.orig || rec.text;
      const who = rec.side === 'out' ? '我' : memberName(rec.cid);
      b.innerHTML = '<span style="opacity:.6;font-size:12px;cursor:pointer">' + who + '撤回了一条消息</span>';
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
  // v3.11.x：待发送图片（插入图片按钮多选 → 压缩 → 草稿条预览，随文字合并为一条组合消息）
  let gcDraftImgs = [];
  function renderGcDraft() {
    if (!gcDraftBar || !gcDraftItems) return;
    gcDraftItems.innerHTML = '';
    if (!gcDraftImgs.length) { gcDraftBar.hidden = true; return; }
    gcDraftImgs.forEach((src, i) => {
      const it = document.createElement('div');
      it.className = 'chat-draft-item';
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      const x = document.createElement('button');
      x.className = 'chat-draft-x';
      x.textContent = '✕';
      x.addEventListener('click', () => { gcDraftImgs.splice(i, 1); renderGcDraft(); });
      it.appendChild(img);
      it.appendChild(x);
      gcDraftItems.appendChild(it);
    });
    gcDraftBar.hidden = false;
  }
  // 组合消息：文字 + 插入图片（与聊天页 buildParts 同构；renderMsg 已支持 parts 渲染）
  function buildGcParts(t) {
    const parts = [];
    if (t) parts.push({ k: 'text', v: t });
    gcDraftImgs.forEach(src => parts.push({ k: 'img', v: src, sub: 'image' }));
    return parts;
  }
  function addMsg(text) {
    const t = (text || '').trim();
    const parts = buildGcParts(t);
    if (!parts.length) return;
    const rec = { side: 'out', text: t, ts: Date.now() };
    if (gcDraftImgs.length) rec.parts = parts;
    msgs.push(rec);
    saveMsgs();
    renderMsg(rec);
    if (window.playSfx) window.playSfx('out');
    if (input) input.textContent = '';
    gcDraftImgs = [];
    renderGcDraft();
    scheduleReply(t);
  }
  // 表情包直接发送（复用聊天页表情包面板的插入模式回调，见下方 gc-emoji-btn）
  function sendGcSticker(src) {
    if (!src) return;
    const rec = { side: 'out', type: 'sticker', text: src, ts: Date.now() };
    msgs.push(rec);
    saveMsgs();
    renderMsg(rec);
    if (window.playSfx) window.playSfx('out');
    // 表情不带文字，无 @提及，成员按概率随机回复
    scheduleReply('');
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
    // v3.9.x：显示群聊昵称（主）+ 桌面原昵称（副，区分用）
    const meDesk = deskMeName();
    meRow.innerHTML = '<div class="gc-mp-av"></div><span class="gc-mp-name">' + escapeHtml(myName()) +
      '<span class="gc-mp-sub">' + (meDesk ? '桌面昵称：' + escapeHtml(meDesk) : '') + '</span></span><span class="gc-mp-tag">我</span>';
    fillAv(meRow.querySelector('.gc-mp-av'), myAvatar());
    membersBody.appendChild(meRow);
    getMembers().forEach(m => {
      const row = document.createElement('div');
      row.className = 'gc-mp-item';
      const desk = deskPartnerName(m.id);
      row.innerHTML = '<div class="gc-mp-av"></div><span class="gc-mp-name">' + escapeHtml(memberName(m.id)) +
        '<span class="gc-mp-sub">' + (desk ? '桌面昵称：' + escapeHtml(desk) : '') + '</span></span>';
      fillAv(row.querySelector('.gc-mp-av'), memberAvatar(m.id));
      membersBody.appendChild(row);
    });
  }
  // 点击群名标题 → 打开成员面板（右上角三点菜单里也有「群成员」入口）
  if (nameEl) nameEl.addEventListener('click', () => { renderMembersPanel(); if (membersPanel) membersPanel.hidden = false; });
  if (membersClose) membersClose.addEventListener('click', () => { if (membersPanel) membersPanel.hidden = true; });

  // ---- 右上角三点菜单（v3.9.x：群成员 + 群聊设置） ----
  const moreBtn = document.getElementById('gc-more-btn');
  const moreMenu = document.getElementById('gc-more-menu');
  function showMoreMenu(v) { if (moreMenu) moreMenu.hidden = !v; }
  if (moreBtn) moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showMoreMenu(moreMenu.hidden);
  });
  document.addEventListener('click', () => showMoreMenu(false));
  const moreMembers = document.getElementById('gc-more-members');
  if (moreMembers) moreMembers.addEventListener('click', () => {
    showMoreMenu(false);
    renderMembersPanel();
    if (membersPanel) membersPanel.hidden = false;
  });
  const moreSettings = document.getElementById('gc-more-settings');
  if (moreSettings) moreSettings.addEventListener('click', () => {
    showMoreMenu(false);
    renderSettingsPanel();
    if (settingsPanel) settingsPanel.hidden = false;
  });

  // ---- 群聊设置面板（v3.9.x：我的群聊形象 + 成员群聊形象） ----
  const settingsPanel = document.getElementById('gc-settings-panel');
  const settingsBody = document.getElementById('gc-set-body');
  const settingsClose = document.getElementById('gc-set-close');
  // 轻提示（与全站一致）
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
  // 头像压缩（与聊天设置一致：最长边 256、JPEG 0.85）
  function compressHead(dataUrl, maxSide) {
    return new Promise((resolve) => {
      try {
        if (typeof dataUrl !== 'string' || !dataUrl || dataUrl.length > 8 * 1024 * 1024) { resolve(null); return; }
        const img = new Image();
        img.onload = () => {
          try {
            if (img.width * img.height > 26000000) { resolve(null); return; }
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', 0.85));
          } catch (e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      } catch (e) { resolve(null); }
    });
  }
  function pickAvatarFile(cb) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        compressHead(reader.result, 256).then(data => {
          if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
          cb(data);
        });
      };
      reader.readAsDataURL(f);
    };
    input.click();
  }
  // 渲染设置面板：主视图（我的群聊 + 成员群聊形象 + 美化入口） / 美化视图（同聊天设置的美化行）
  let gcBeautyView = false;
  function setPanelTitle(t) {
    try {
      const h = settingsPanel && settingsPanel.querySelector('.gc-set-head span');
      if (h) h.textContent = t || '群聊设置';
    } catch (e) {}
  }
  function renderSettingsPanel() {
    if (!settingsBody) return;
    settingsBody.innerHTML = '';
    if (gcBeautyView) { setPanelTitle('美化聊天'); renderBeautyView(); return; }
    setPanelTitle('群聊设置');
    renderMainSettingsView();
  }
  function renderMainSettingsView() {
    const esc = escapeHtml;
    const item = (key, curName, curAv, deskName) => {
      const row = document.createElement('div');
      row.className = 'gc-set-item';
      const hasOverride = !!(curName || curAv);
      row.innerHTML =
        '<div class="gc-set-av"></div>' +
        '<div class="gc-set-info">' +
          '<div class="gc-set-name">' + esc(curName || '跟随桌面') + (key === 'me' ? '<span class="gc-set-tag">我</span>' : '') + '</div>' +
          '<div class="gc-set-desk">' + (deskName ? '桌面昵称：' + esc(deskName) : '') + '</div>' +
        '</div>' +
        '<div class="gc-set-ops">' +
          '<button class="gc-set-btn" data-op="av">' + (curAv ? '换头像' : '设头像') + '</button>' +
          '<button class="gc-set-btn" data-op="name">' + (curName ? '改昵称' : '设昵称') + '</button>' +
          (hasOverride ? '<button class="gc-set-btn ghost" data-op="reset">重置</button>' : '') +
        '</div>';
      // 预览：群聊当前生效头像（覆盖优先，回退桌面头像）
      let effAv = curAv;
      if (!effAv) { try { effAv = key === 'me' ? myAvatar() : memberAvatar(key); } catch (e) {} }
      fillAv(row.querySelector('.gc-set-av'), effAv || '');
      row.querySelector('[data-op="av"]').addEventListener('click', () => {
        pickAvatarFile(data => gcProfileSet(key, undefined, data));
      });
      row.querySelector('[data-op="name"]').addEventListener('click', () => {
        if (!window.openModal) return;
        window.openModal(key === 'me' ? '我的群聊昵称' : '成员群聊昵称', curName, (v) => {
          gcProfileSet(key, (v || '').trim(), undefined);
        }, { maxlength: 30 });
      });
      if (hasOverride) {
        row.querySelector('[data-op="reset"]').addEventListener('click', () => {
          gcProfileSet(key, '', '');
        });
      }
      return row;
    };
    // —— 我的群聊 ——
    const t1 = document.createElement('div');
    t1.className = 'gc-set-title';
    t1.textContent = '我的群聊';
    settingsBody.appendChild(t1);
    const meP = gcProfileGet('me');
    settingsBody.appendChild(item('me', meP.name || '', meP.avatar || '', deskMeName()));
    // —— 成员群聊形象 ——
    const t2 = document.createElement('div');
    t2.className = 'gc-set-title';
    t2.textContent = '成员群聊形象';
    settingsBody.appendChild(t2);
    getMembers().forEach(m => {
      const p = gcProfileGet(m.id);
      settingsBody.appendChild(item(m.id, p.name || '', p.avatar || '', deskPartnerName(m.id)));
    });
    // —— 美化聊天入口（v3.9.x） ——
    const bRow = document.createElement('div');
    bRow.className = 'gc-set-item gc-set-link';
    bRow.innerHTML =
      '<div class="gc-set-av">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/></svg>' +
      '</div>' +
      '<div class="gc-set-info">' +
        '<div class="gc-set-name">美化聊天</div>' +
        '<div class="gc-set-desk">气泡颜色、壁纸、字体、时间轴样式等</div>' +
      '</div>' +
      '<span class="gc-set-chev">›</span>';
    bRow.addEventListener('click', () => { gcBeautyView = true; renderSettingsPanel(); });
    settingsBody.appendChild(bRow);
    // —— 底部说明 ——
    const note = document.createElement('div');
    note.className = 'gc-set-note';
    note.textContent = '群聊昵称/头像只在本群聊页生效；成员回复内容来自该成员桌面自己的字卡库。';
    settingsBody.appendChild(note);
  }

  // ================= 美化视图（与聊天设置同款行） =================
  function beautyRow(label, val, fn) {
    const row = document.createElement('div');
    row.className = 'gc-set-row';
    row.innerHTML = '<span class="txt">' + escapeHtml(label) + '</span><span class="val">' + escapeHtml(val) + '</span><span class="chev">›</span>';
    row.addEventListener('click', fn);
    return row;
  }
  // 文字颜色色板里「默认黑」易被误认为默认选项（文字色默认其实是白色），
  // 在群聊美化里把第一格改标「黑色」，避免用户选成黑字黑底看不见
  function gcInkSwatches() {
    return GC_INK_COLORS.map(s => s.color === '#111111' ? { color: '#111111', label: '黑色' } : s);
  }
  function pickGcColor(key, title, swatches) {
    if (!window.openModal) return;
    const cur = gcBeautyGet(key);
    window.openModal(title, '', (v) => {
      const color = (typeof v === 'number' && swatches[v]) ? swatches[v].color : v;
      if (!color) return;
      const prev = gcBeautyGet(key);
      gcBeautySet(key, color);
      // 对比度保护：文字/气泡同色系 → 回滚并提示（防黑底黑字）
      if (gcColorPairBad(key)) {
        gcBeautySet(key, prev);
        toast('已恢复：该颜色与气泡太接近，消息会看不清');
      }
    }, { colorPicker: true, color: cur, swatches: swatches });
  }
  function pickGcPills(key, title, pills, def) {
    if (!window.openModal) return;
    window.openModal(title, '', (v) => { if (v) gcBeautySet(key, v); }, {
      pills: pills, pill: gcBeautyGet(key) || def, noInput: true
    });
  }
  // 群聊壁纸上传（同聊天设置：按物理像素上限压缩）
  function pickGcWallpaper() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            const screenH = (window.screen && window.screen.height) || 1920;
            const maxSide = Math.min(4096, Math.max(2160, Math.round(screenH * dpr)));
            const c = document.createElement('canvas');
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            gcBeautySet('bg', c.toDataURL('image/jpeg', 0.85));
            toast('群聊壁纸已应用');
          } catch (e) { toast('壁纸处理失败，请换一张'); }
        };
        img.onerror = () => { toast('图片读取失败，请换一张'); };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    input.click();
  }
  // 气泡框大小（openTCPanel 预设 + 自定义，同聊天设置）
  function pickGcBubbleSize() {
    if (!window.openTCPanel) return;
    const cur = gcBeautyGet('bubble-size');
    window.openTCPanel('聊天气泡框大小', '' +
      '<div class="sm-fld"><label>预设大小</label><select class="tc-input" id="gc-pad-preset">' +
      '<option value="">自定义</option>' +
      GC_BUBBLE_SIZES.map(p => '<option value="' + p.value + '"' + (p.value === cur ? ' selected' : '') + '>' + p.label + '</option>').join('') +
      '</select></div>' +
      '<div class="sm-fld"><label>自定义（格式：上下 左右，如 <code>8px 10px</code>）</label>' +
      '<input class="tc-input" id="gc-pad-input" value="' + String(cur).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
      '<div class="sm-set-hint">示例：紧凑 8px 10px · 标准 11px 14px · 宽松 14px 18px</div>' +
      '<div class="mail-actions"><button class="cc-tool" id="gc-pad-cancel">取消</button><button class="cc-tool" id="gc-pad-ok">应用</button></div>');
    document.getElementById('gc-pad-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
    document.getElementById('gc-pad-preset').addEventListener('change', () => {
      const v = document.getElementById('gc-pad-preset').value;
      if (v) document.getElementById('gc-pad-input').value = v;
    });
    document.getElementById('gc-pad-ok').addEventListener('click', () => {
      let v = (document.getElementById('gc-pad-input').value || '').trim();
      if (!v) { toast('请输入气泡框大小'); return; }
      // 规范化：数字+px 或 纯数字（默认px），已带 px 的 token 不动
      v = String(v).split(/[,\s]+/).filter(Boolean).map(function (tok) {
        return /^-?\d+(?:\.\d+)?px$/.test(tok) ? tok : tok.replace(/^(-?\d+(?:\.\d+)?)$/, '$1px');
      }).join(' ');
      gcBeautySet('bubble-size', v);
      document.getElementById('tc-mask').hidden = true;
      toast('气泡框大小已应用');
    });
  }
  // 群聊字体（上传 / 名字，作用域仅群聊页）
  function pickGcFont() {
    if (!window.openTCPanel) return;
    const cur = gcBeautyGet('font');
    window.openTCPanel('群聊字体', '' +
      '<div class="sm-fld"><label>上传本地字体（ttf / otf / woff / woff2），只对群聊页生效</label>' +
      '<input class="tc-input" id="gc-font-name" placeholder="也可直接输入字体名，如 Microsoft YaHei"' + (cur && cur.indexOf('data:') !== 0 && cur.indexOf('http') !== 0 ? ' value="' + String(cur).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"' : '') + '></div>' +
      '<div class="mail-actions"><button class="cc-tool" id="gc-font-upload">上传字体</button><button class="cc-tool" id="gc-font-clear">恢复默认</button><button class="cc-tool" id="gc-font-ok">应用</button></div>');
    document.getElementById('gc-font-upload').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.ttf,.otf,.woff,.woff2';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        toast('正在读取字体文件…');
        const reader = new FileReader();
        reader.onload = () => {
          gcBeautySet('font', reader.result);
          document.getElementById('tc-mask').hidden = true;
          toast('字体已应用（群聊页）');
        };
        reader.onerror = () => { toast('字体文件读取失败，请重试'); };
        reader.readAsDataURL(f);
      };
      inp.click();
    });
    document.getElementById('gc-font-clear').addEventListener('click', () => {
      gcBeautySet('font', '');
      document.getElementById('tc-mask').hidden = true;
      toast('已恢复默认字体');
    });
    document.getElementById('gc-font-ok').addEventListener('click', () => {
      const name = (document.getElementById('gc-font-name').value || '').trim();
      if (!name) { toast('请输入字体名'); return; }
      gcBeautySet('font', name);
      document.getElementById('tc-mask').hidden = true;
      toast('字体已应用（群聊页）');
    });
  }
  // 气泡 CSS（openTCPanel 文本框，作用域自动加 #page-group-chat）
  function pickGcCss() {
    if (!window.openTCPanel) return;
    window.openTCPanel('气泡 CSS', '' +
      '<div class="sm-fld-hint" style="margin-bottom:8px">输入自定义样式，只对群聊页生效，支持两种写法：<br>· 直接写声明，如 <code>border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.1)</code>（自动应用到双方气泡）<br>· 或写选择器，如 <code>.msg-out .msg-bubble{...}</code></div>' +
      '<textarea id="gc-css-input" class="tc-input" rows="6" placeholder="border-radius: 20px;' + '&#10;box-shadow: 0 2px 8px rgba(0,0,0,.12);"></textarea>' +
      '<div class="mail-actions"><button class="cc-tool" id="gc-css-clear">清空</button><button class="cc-tool" id="gc-css-ok">应用</button></div>');
    const ta = document.getElementById('gc-css-input');
    if (ta) ta.value = gcBeautyGet('css');
    document.getElementById('gc-css-clear').addEventListener('click', () => {
      gcBeautySet('css', '');
      document.getElementById('tc-mask').hidden = true;
      toast('已清空气泡样式');
    });
    document.getElementById('gc-css-ok').addEventListener('click', () => {
      gcBeautySet('css', (document.getElementById('gc-css-input').value || '').trim());
      document.getElementById('tc-mask').hidden = true;
      toast('气泡样式已应用');
    });
  }
  function renderBeautyView() {
    const g = gcBeautyGet;
    // 返回主设置
    const back = document.createElement('div');
    back.className = 'gc-set-back';
    back.innerHTML = '<span class="arr">‹</span> 返回群聊设置';
    back.addEventListener('click', () => { gcBeautyView = false; renderSettingsPanel(); });
    settingsBody.appendChild(back);
    const gtitle = (t) => { const d = document.createElement('div'); d.className = 'gc-set-title'; d.textContent = t; settingsBody.appendChild(d); };
    const add = (label, val, fn) => settingsBody.appendChild(beautyRow(label, val, fn));
    const bgLabel = (v, def) => v === def ? '默认 ' + def : v;
    // —— 壁纸 ——
    gtitle('壁纸');
    add('聊天壁纸', g('bg') ? '已设置' : '未设置', () => pickGcWallpaper());
    if (g('bg')) add('清空群聊壁纸', '', () => { gcBeautySet('bg', ''); toast('已恢复默认壁纸'); });
    // —— 气泡与文字 ——
    gtitle('气泡与文字');
    add('我的气泡颜色', bgLabel(g('out-bg'), '#111111'), () => pickGcColor('out-bg', '我的气泡颜色', GC_BUBBLE_BG));
    add('我的消息文字颜色', bgLabel(g('out-ink'), '#ffffff'), () => pickGcColor('out-ink', '我的消息文字颜色', gcInkSwatches()));
    add('联系人气泡颜色', bgLabel(g('in-bg'), '#ffffff'), () => pickGcColor('in-bg', '联系人气泡颜色', GC_BUBBLE_BG));
    add('联系人消息文字颜色', bgLabel(g('in-ink'), '#111111'), () => pickGcColor('in-ink', '联系人消息文字颜色', gcInkSwatches()));
    // 存量低对比度警告（我的/联系人气泡与文字同色系时提示）
    const warnRow = (key) => {
      if (!gcColorPairBad(key)) return;
      const w = document.createElement('div');
      w.className = 'gc-set-warn';
      w.textContent = '⚠️ ' + gcColorWarnText(key);
      settingsBody.appendChild(w);
    };
    warnRow('out-bg');
    warnRow('in-bg');
    // —— 发送按钮 ——
    gtitle('发送按钮');
    add('发送按钮显示/隐藏', g('send-show') === 'hide' ? '隐藏' : '显示', () => pickGcPills('send-show', '显示发送按钮', [
      { label: '显示', value: 'show' }, { label: '隐藏', value: 'hide' }
    ], 'show'));
    add('发送按钮颜色', bgLabel(g('send-bg'), '#111111'), () => pickGcColor('send-bg', '发送按钮颜色', GC_SEND_BG));
    add('发送文字颜色', bgLabel(g('send-ink'), '#ffffff'), () => pickGcColor('send-ink', '发送文字颜色', GC_INK_COLORS));
    // —— 气泡外观 ——
    gtitle('气泡外观');
    add('聊天气泡字体大小', (GC_FONT_SIZES.find(p => p.value === g('font-size')) || {}).label || g('font-size'), () => pickGcPills('font-size', '聊天气泡字体大小', GC_FONT_SIZES, '14px'));
    add('聊天气泡框大小', (GC_BUBBLE_SIZES.find(p => p.value === g('bubble-size')) || { label: '自定义' }).label, () => pickGcBubbleSize());
    add('聊天头像形状', g('av-shape') === 'square' ? '方形' : '圆形', () => pickGcPills('av-shape', '聊天头像形状', [
      { label: '圆形', value: 'circle' }, { label: '方形', value: 'square' }
    ], 'circle'));
    add('时间轴样式', (GC_BEAUTY_STYLES.find(s => s.value === g('time-style')) || {}).label || '头像下方', () => pickGcPills('time-style', '时间轴样式', GC_BEAUTY_STYLES, 'under-av'));
    // —— 字体与样式 ——
    gtitle('字体与样式');
    add('群聊字体', g('font') ? (g('font').indexOf('data:') === 0 ? '已上传' : g('font')) : '默认', () => pickGcFont());
    add('气泡 CSS', g('css') ? '已设置' : '默认', () => pickGcCss());
  }
  if (settingsClose) settingsClose.addEventListener('click', () => { if (settingsPanel) settingsPanel.hidden = true; });
  if (settingsPanel) settingsPanel.addEventListener('click', (e) => { if (e.target === settingsPanel) settingsPanel.hidden = true; });

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
  // v3.11.x：@群成员 入口移到输入栏「更多功能」面板（原独立按钮已删）
  if (gcMoreAt) gcMoreAt.addEventListener('click', () => {
    if (gcMorePanel) gcMorePanel.hidden = true;
    renderAtPanel();
    if (atPanel) atPanel.hidden = false;
  });

  // ---- 输入栏「更多功能」面板（与聊天页 chat-more-panel 同款交互）----
  if (gcMoreBtn && gcMorePanel) {
    gcMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gcMorePanel.hidden) {
        // 收起输入法，面板不被键盘遮挡（与聊天页 moreBtn 行为一致）
        try { if (window.closeIme) window.closeIme(); } catch (err) {}
        try { input.blur(); } catch (err) {}
      }
      gcMorePanel.hidden = !gcMorePanel.hidden;
    });
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (!gcMorePanel.hidden && !gcMorePanel.contains(e.target) && e.target !== gcMoreBtn && !gcMoreBtn.contains(e.target)) {
        gcMorePanel.hidden = true;
      }
    });
  }

  // ---- 表情包按钮：复用聊天页同一个表情包面板（写信/回信同款插入模式回调）----
  if (gcEmojiBtn) gcEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!window.openEmojiPanelForInsert) return;
    // allowUrl：链接保存的表情在群聊里直接发送（仅信纸插入才限 data:）
    window.openEmojiPanelForInsert((src) => sendGcSticker(src), { allowUrl: true });
    // mail-emoji-mode 会把面板压低到 bottom:64px（写信页布局），群聊页与聊天页一致用默认 96px
    document.body.classList.remove('mail-emoji-mode');
  });

  // ---- 插入图片按钮：多选图片 → 压缩 → 草稿条预览，随发送合并为组合消息（同聊天页）----
  if (gcImgBtn) gcImgBtn.addEventListener('click', (e) => {
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
              gcDraftImgs.push(c.toDataURL('image/jpeg', 0.85));
            } catch (err) {
              gcDraftImgs.push(reader.result);
            }
            renderGcDraft();
          };
          // 解码失败（HEIC/损坏图）按原图兜底，不静默丢失
          img.onerror = () => {
            gcDraftImgs.push(reader.result);
            renderGcDraft();
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(f);
      });
    };
    fi.click();
  });

  // 点击面板背景关闭
  if (atPanel) atPanel.addEventListener('click', (e) => { if (e.target === atPanel) atPanel.hidden = true; });

  // ---- 切联系人：消息全局不变，刷新群名 + 重渲染（"我"头像/成员名可能变） ----
  document.addEventListener('contact-switched', function () {
    try { hideTyping(); } catch (e) {}
    updateGroupName();
    renderAll();
    try { if (settingsPanel && !settingsPanel.hidden) renderSettingsPanel(); } catch (e) {}
  });

  // 暴露（供数据备份/回归测试用）
  window.groupChatGetMsgs = function () { return msgs.slice(); };
  window.groupChatClear = function () { msgs = []; saveNow(); renderAll(); };
  window.groupChatProfileGet = function (key) { try { return JSON.parse(JSON.stringify(gcProfileGet(key))); } catch (e) { return {}; } };
  // name/avatar：传 undefined 保持不变，传空串清除该字段
  window.groupChatProfileSet = function (key, name, avatar) { gcProfileSet(key, name, avatar); };
  window.groupChatBeautyGet = function (k) { return gcBeautyGet(k); };
  // 设置群聊美化（空值/默认值 = 恢复默认）
  window.groupChatBeautySet = function (k, v) { gcBeautySet(k, v); };
})();
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
  function renderMsg(rec) {
    const m = document.createElement('div');
    m.className = 'msg ' + (rec.side === 'out' ? 'msg-out' : 'msg-in');
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
    // v3.8.x：与 chat.js 一致——span 包裹 + 全量转义 + 换行转 <br>
    b.innerHTML = '<span style="opacity:.85">' + escTxtBr(rec.text || '') + '</span>';
    body.appendChild(m);
    return m;
  }
  function renderAll() {
    body.innerHTML = '';
    const n = msgs.length;
    const start = Math.max(0, n - RENDER_MAX);
    for (let i = start; i < n; i++) renderMsg(msgs[i]);
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
  function genReplyText(cid) {
    try {
      const raw = window.storeFor(cid).get('cc-groups');
      if (raw) {
        const groups = JSON.parse(raw);
        const pool = [];
        if (groups && typeof groups === 'object') {
          Object.keys(groups).forEach(key => {
            const g = groups[key];
            if (g && Array.isArray(g.cards)) {
              g.cards.forEach(c => { if (c && c.type === 'text' && c.text) pool.push(c.text); });
            }
          });
        }
        if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
      }
    } catch (e) {}
    return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
  }
  function showTyping(name) { if (typingEl) { typingEl.textContent = (name || '成员') + ' 正在输入…'; typingEl.hidden = false; } }
  function hideTyping() { if (typingEl) typingEl.hidden = true; }
  function memberReply(cid, quoteText) {
    const name = memberName(cid);
    const delay = 800 + Math.random() * 2000;
    showTyping(name);
    setTimeout(() => {
      hideTyping();
      const text = genReplyText(cid);
      const rec = { side: 'in', cid: cid, name: name, text: text, ts: Date.now() };
      if (quoteText) rec.quote = quoteText;
      msgs.push(rec);
      saveMsgs();
      renderMsg(rec);
      if (window.playSfx) window.playSfx('in');
    }, delay);
  }
  function scheduleReply(userText) {
    const members = getMembers();
    if (!members.length) return;
    // 检测 @提及
    const mentioned = [];
    members.forEach(m => {
      const n = memberName(m.id);
      if (userText.indexOf('@' + n) >= 0) mentioned.push(m.id);
    });
    if (mentioned.length) {
      mentioned.forEach((cid, i) => {
        setTimeout(() => memberReply(cid, userText), i * (1000 + Math.random() * 1500));
      });
      return;
    }
    // 随机 1-2 个成员回复
    const count = Math.random() < 0.6 ? 1 : 2;
    const avail = members.slice();
    for (let i = 0; i < count && avail.length; i++) {
      const idx = Math.floor(Math.random() * avail.length);
      const cid = avail.splice(idx, 1)[0].id;
      setTimeout(() => memberReply(cid, null), i * (1200 + Math.random() * 1600));
    }
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
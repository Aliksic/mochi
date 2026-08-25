// ===== 功能：聊天设置 =====
// 聊天壁纸、双方气泡颜色/文字颜色、字体大小、气泡框大小（localStorage 持久化）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const root = document.documentElement;
  const body = document.getElementById('chat-body');
  if (!body) return;
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
  }
  // 壁纸铺满整个聊天页（含顶部栏/输入栏）
  const chatPage = document.getElementById('page-chat');

  const FONT_SIZES = [
    { label: '小', value: '13px' },
    { label: '标准', value: '14px' },
    { label: '大', value: '16px' },
    { label: '特大', value: '18px' }
  ];
  const BUBBLE_SIZES = [
    { label: '紧凑', value: '8px 10px' },
    { label: '标准', value: '11px 14px' },
    { label: '宽松', value: '14px 18px' }
  ];
  // v3.9.x：时间轴样式（默认头像下方，与原实现一致）
  // under-av=头像下方  under-bubble=气泡下方  bubble=时间气泡  float=气泡外侧悬浮
  // center=消息上方居中  divider=时间分隔线（微信式，消息间隔大时插居中胶囊）  hidden=隐藏
  const TIME_STYLES = [
    { label: '头像下方', value: 'under-av' },
    { label: '气泡下方', value: 'under-bubble' },
    { label: '时间气泡', value: 'bubble' },
    { label: '气泡外侧悬浮', value: 'float' },
    { label: '消息上方居中', value: 'center' },
    { label: '时间分隔线', value: 'divider' },
    { label: '隐藏', value: 'hidden' }
  ];

  // v3.11.x：未自定义的配色默认值跟随深浅主题。此前默认色写死浅色（白气泡/黑时间字），
  // 且以 root 内联样式写入——内联优先级高于 dark.css 的 [data-theme] 覆盖，导致
  // 深色模式下联系人气泡纯白、时间戳纯黑看不见。用户自定义过（store 有值）仍优先。
  function themeDefaults() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? { inBg: '#2a2a2a', inInk: '#f0f0f0', outBg: '#3a3a3a', outInk: '#ffffff', timeInk: '#8a8a8a', sendBg: '#f0f0f0', sendInk: '#111111' }
      : { inBg: '#ffffff', inInk: '#111111', outBg: '#111111', outInk: '#ffffff', timeInk: '#111111', sendBg: '#111111', sendInk: '#ffffff' };
  }
  function applySettings() {
    // 设置页值写入（定义在最前，避免暂时性死区）
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const DEF = themeDefaults();
    const inBg = store.get('cs-in-bg') || DEF.inBg;
    const inInk = store.get('cs-in-ink') || DEF.inInk;
    const outBg = store.get('cs-out-bg') || DEF.outBg;
    const outInk = store.get('cs-out-ink') || DEF.outInk;
    const fs = store.get('cs-font-size') || '14px';
    const pad = store.get('cs-bubble-size') || '11px 14px';
    root.style.setProperty('--msg-in-bg', inBg);
    root.style.setProperty('--msg-in-ink', inInk);
    root.style.setProperty('--msg-out-bg', outBg);
    root.style.setProperty('--msg-out-ink', outInk);
    root.style.setProperty('--chat-font-size', fs);
    root.style.setProperty('--chat-bubble-pad', pad);
    // 时间轴颜色（默认黑/深色模式灰）
    const timeInk = store.get('cs-time-ink') || DEF.timeInk;
    root.style.setProperty('--msg-time-ink', timeInk);
    // 正在输入中颜色（默认灰）
    const typingInk = store.get('cs-typing-ink') || '#8a8a8a';
    root.style.setProperty('--typing-ink', typingInk);
    // 发送按钮颜色（默认黑/深色模式白）
    const sendBg = store.get('cs-send-bg') || DEF.sendBg;
    root.style.setProperty('--send-bg', sendBg);
    // 发送按钮文字颜色（默认白/深色模式黑）
    const sendInk = store.get('cs-send-ink') || DEF.sendInk;
    root.style.setProperty('--send-ink', sendInk);
    // 发送按钮显示/隐藏（默认显示；隐藏后仍可按 Enter 发送）
    const sendShow = store.get('cs-send-show') || 'show';
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.style.display = sendShow === 'hide' ? 'none' : '';
    set('cs-send-bg-val', sendBg === DEF.sendBg ? '默认 ' + DEF.sendBg : sendBg);
    set('cs-send-ink-val', sendInk === DEF.sendInk ? '默认 ' + DEF.sendInk : sendInk);
    // 双方气泡颜色/文字颜色当前值回显（默认值显示「默认 #色值」，让用户知道默认颜色）
    set('cs-out-bg-val', outBg === DEF.outBg ? '默认 ' + DEF.outBg : outBg);
    set('cs-out-ink-val', outInk === DEF.outInk ? '默认 ' + DEF.outInk : outInk);
    set('cs-in-bg-val', inBg === DEF.inBg ? '默认 ' + DEF.inBg : inBg);
    set('cs-in-ink-val', inInk === DEF.inInk ? '默认 ' + DEF.inInk : inInk);
    // 聊天头像形状（circle 圆形 / square 方形）
    const avShape = store.get('cs-av-shape') || 'circle';
    root.style.setProperty('--msg-av-radius', avShape === 'square' ? '10px' : '50%');
    set('cs-av-shape-val', avShape === 'square' ? '方形' : '圆形');
    // 时间轴样式：body 上挂 cs-time-* 类（CSS 控制布局，消息结构不变），
    // 移除旧类后挂新类——覆盖收藏页（#page-fav 是 body 后代），收藏项无需改动
    const ts = store.get('cs-time-style') || 'under-av';
    const tsLabel = (TIME_STYLES.find(s => s.value === ts) || {}).label || '头像下方';
    TIME_STYLES.forEach(s => document.body.classList.remove('cs-time-' + s.value));
    if (ts !== 'under-av') document.body.classList.add('cs-time-' + ts);
    set('cs-time-style-val', tsLabel);
    // 聊天壁纸：铺满整个聊天页
    // v3.6.x：值没变时不重写 style——applySettings 在每次进入聊天页时调用，
    // 反复重设 background-image（大图 dataURL）会让浏览器重新解码、触发重绘
    // v3.5.126：去掉 background-attachment:fixed——手机上 fixed 背景相对视口定位，
    // 全屏/输入法/安全区变化时与元素尺寸不一致 → 比例错位、露白；且移动端
    // 对 fixed 背景降采样 → 发糊。聊天页本身 overflow:hidden 不滚动（只有
    // .chat-body 内部滚动），默认 scroll 模式下背景相对 page 本来就是固定的，
    // fixed 纯属多余并引入视口耦合。
    // v3.6.x：存量大图渲染防护——旧版本聊天壁纸压缩失败时回退存过原图（48MP/ProRAW
    // 级别十几 MB），渲染 backgroundImage 会让 iOS Safari 解码卡死（打开页面卡顿点不动）。
    // 正常压缩产物（2160-4096px JPEG 0.85）≤6MB，>6MB 判定为异常存量，清除回默认
    let bg = store.get('cs-bg');
    if (bg && typeof bg === 'string' && bg.length > 6 * 1024 * 1024) {
      try { store.remove('cs-bg'); } catch (e) {}
      bg = null;
    }
    if (bg && chatPage) {
      if (chatPage.style.backgroundImage !== 'url("' + bg + '")') {
        chatPage.style.backgroundImage = 'url("' + bg + '")';
        chatPage.style.backgroundSize = 'cover';
        chatPage.style.backgroundPosition = 'center';
      }
    } else if (chatPage && chatPage.style.backgroundImage) {
      chatPage.style.backgroundImage = '';
    }
    set('cs-font-size-val', fs);
    const pn = BUBBLE_SIZES.find(p => p.value === pad);
    set('cs-bubble-size-val', pn ? pn.label : '自定义');
    set('cs-bg-val', bg ? '已设置' : '');
    const rm = document.getElementById('cs-bg-remove');
    if (rm) rm.hidden = !bg;
  }
  window.applyChatSettings = applySettings;
  applySettings();
  // v3.11.x：深色/浅色切换时重算默认配色（personalize.js 切换 html data-theme，
  // 这里监听属性变化即时重写内联变量，不用跨模块调用）
  try {
    new MutationObserver(() => { try { applySettings(); } catch (e) {} })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) {}

  // 各设置行
  const row = (id) => document.getElementById(id);
  const csBg = row('cs-bg-upload');
  if (csBg) {
    // v3.9.x：红米/真我等 Android Edge 对「点击时动态创建 + 立即 click()」的 file input
    // 会静默忽略（不弹系统选择器）。改为持久化 input（初始化时创建一次、永久挂 body、
    // 移出屏幕、每次复用），与 avatar-lib.js bindPoolUpload 已验证可用套路一致。
    const bgInput = document.createElement('input');
    bgInput.type = 'file'; bgInput.accept = 'image/*';
    bgInput.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(bgInput);
    bgInput.onchange = () => {
      const f = bgInput.files && bgInput.files[0];
      bgInput.value = ''; // 允许重选同一文件
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        // 压缩：v3.5.126 按设备物理像素定上限——之前固定 900px，
        // 在 2-3x 高分屏（物理宽 1080-1440）铺满时被放大发糊
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
            const data = c.toDataURL('image/jpeg', 0.85);
            store.set('cs-bg', data);
            applySettings();
          } catch (e) {}
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    csBg.addEventListener('click', () => {
      try { bgInput.click(); } catch (e) { toast('无法打开相册，请重试'); }
    });
  }
  const csBgRm = row('cs-bg-remove');
  if (csBgRm) {
    csBgRm.addEventListener('click', () => {
      store.remove('cs-bg');
      applySettings();
    });
  }

  const csAvShape = row('cs-av-shape');
  if (csAvShape) {
    csAvShape.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('聊天头像形状', '', (v) => { store.set('cs-av-shape', v); applySettings(); }, {
        pills: [
          { label: '圆形', value: 'circle' },
          { label: '方形', value: 'square' }
        ],
        pill: store.get('cs-av-shape') || 'circle',
        noInput: true
      });
    });
  }
  // v3.9.x：时间轴样式（胶囊选择，即时生效——body 上的类驱动布局，无消息重渲染）
  const csTimeStyle = row('cs-time-style');
  if (csTimeStyle) {
    csTimeStyle.addEventListener('click', () => {
      if (!window.openModal) return;
      const cur = store.get('cs-time-style') || 'under-av';
      window.openModal('时间轴样式', '', (v) => {
        store.set('cs-time-style', v);
        applySettings();
        // v3.9.x：divider（时间分隔线）需要重渲染补插分隔条，其余样式纯 CSS 即时生效
        //（divider 有 DOM 插入逻辑，不能像其它样式那样只切 body 类；聊天页已渲染时立即重渲染）
        if (v === 'divider' && window.chatReRenderTime) { try { window.chatReRenderTime(); } catch (e) {} }
      }, {
        pills: TIME_STYLES,
        pill: cur,
        noInput: true
      });
    });
  }
  // ================= 聊天专用昵称/头像（与桌面独立） =================
  // v3.8.x：聊天设置里编辑的昵称/头像只存 cs-lbl-*/cs-avatar-* 键，聊天页只读这套键；
  // 桌面 deco-widget 的 lbl-*/avatar-* 完全独立。未设时聊天页显示默认占位（TA/我 + 人形图标）。
  // v3.9.x：聊天昵称/头像未单独设置时**跟随桌面**（聊天页回退读桌面键）——设置后聊天域
  // 全部显示聊天专用值；设置页未设时右侧提示「跟随桌面（xx）」，明确当前生效来源。
  // 头像压缩与桌面 bindAvatar 一致（256px JPEG 0.85），内联实现避免依赖 personalize.js 导出。
  function compressHead(dataUrl, maxSide) {
    return new Promise((resolve) => {
      if (typeof dataUrl === 'string' && dataUrl.length > 8 * 1024 * 1024) { resolve(null); return; }
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
    });
  }
  // v3.9.x：红米/真我等 Android Edge 对「点击时动态创建 + 立即 click()」的 file input
  // 会静默忽略（不弹系统选择器）。改为持久化 input：初始化时创建一次、永久挂 body、
  // 移出屏幕、每次复用（先清 value 再 click）——与 avatar-lib.js bindPoolUpload
  // 已验证可用套路一致。两个头像按钮（联系人/我的）共用这一个 input，靠回调区分。
  let headCb = null;
  const headInput = document.createElement('input');
  headInput.type = 'file'; headInput.accept = 'image/*';
  headInput.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(headInput);
  headInput.onchange = () => {
    const f = headInput.files && headInput.files[0];
    headInput.value = ''; // 允许重选同一文件
    if (!f) return;
    const cb = headCb; headCb = null;
    const reader = new FileReader();
    reader.onload = () => {
      compressHead(reader.result, 256).then(data => {
        if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
        if (cb) cb(data);
      });
    };
    reader.readAsDataURL(f);
  };
  function pickHead(cb) {
    headCb = cb;
    try { headInput.click(); } catch (e) { toast('无法打开相册，请重试'); }
  }
  function applyProfile() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    // v3.9.x：聊天昵称未设置时显示「跟随桌面（xx）」，明确当前聊天页使用的昵称来源
    const follow = (chatKey, deskKey, fb) => {
      let d = null; try { d = store.get(deskKey); } catch (e) {}
      return d ? '跟随桌面（' + d + '）' : fb;
    };
    const lp = store.get('cs-lbl-partner');
    set('cs-lbl-partner-val', lp || follow('cs-lbl-partner', 'lbl-partner', ''));
    const lu = store.get('cs-lbl-user');
    set('cs-lbl-user-val', lu || follow('cs-lbl-user', 'lbl-user', ''));
    const ap = store.get('cs-avatar-partner');
    set('cs-avatar-partner-val', ap ? '已设置' : '');
    const ar = document.getElementById('cs-avatar-partner-remove');
    if (ar) ar.hidden = !ap;
    const au = store.get('cs-avatar-user');
    set('cs-avatar-user-val', au ? '已设置' : '');
    const aur = document.getElementById('cs-avatar-user-remove');
    if (aur) aur.hidden = !au;
  }
  applyProfile();
  const csLp = row('cs-lbl-partner');
  if (csLp) {
    csLp.addEventListener('click', () => {
      if (!window.openModal) return;
      const cur = store.get('cs-lbl-partner') || '';
      window.openModal('联系人昵称', cur, (v) => {
        const val = (v || '').trim();
        if (val) store.set('cs-lbl-partner', val); else store.remove('cs-lbl-partner');
        applyProfile();
        try { if (window.renderChatHeader) window.renderChatHeader(); } catch (e) {}
      }, { maxlength: 30 });
    });
  }
  const csLu = row('cs-lbl-user');
  if (csLu) {
    csLu.addEventListener('click', () => {
      if (!window.openModal) return;
      const cur = store.get('cs-lbl-user') || '';
      window.openModal('我的昵称', cur, (v) => {
        const val = (v || '').trim();
        if (val) store.set('cs-lbl-user', val); else store.remove('cs-lbl-user');
        applyProfile();
      }, { maxlength: 30 });
    });
  }
  const csAp = row('cs-avatar-partner');
  if (csAp) {
    csAp.addEventListener('click', () => {
      pickHead(data => {
        store.set('cs-avatar-partner', data);
        applyProfile();
        try { if (window.refreshChatAvatars) window.refreshChatAvatars(); } catch (e) {}
      });
    });
  }
  const csApRm = row('cs-avatar-partner-remove');
  if (csApRm) {
    csApRm.addEventListener('click', () => {
      store.remove('cs-avatar-partner');
      applyProfile();
      try { if (window.refreshChatAvatars) window.refreshChatAvatars(); } catch (e) {}
    });
  }
  const csAu = row('cs-avatar-user');
  if (csAu) {
    csAu.addEventListener('click', () => {
      pickHead(data => {
        store.set('cs-avatar-user', data);
        applyProfile();
        try { if (window.refreshChatAvatars) window.refreshChatAvatars(); } catch (e) {}
      });
    });
  }
  const csAuRm = row('cs-avatar-user-remove');
  if (csAuRm) {
    csAuRm.addEventListener('click', () => {
      store.remove('cs-avatar-user');
      applyProfile();
      try { if (window.refreshChatAvatars) window.refreshChatAvatars(); } catch (e) {}
    });
  }
  // ================= 双方气泡颜色 / 文字颜色 =================
  // 色板：气泡底色与文字色（v3.6.x：新增颜色设置入口，走 openModal 色板）
  const BUBBLE_BG_COLORS = [
    { color: '#111111', label: '默认黑' },
    { color: '#ffffff', label: '白色' },
    { color: '#3a3a3a', label: '炭灰' },
    { color: '#ffd6e0', label: '樱花粉' },
    { color: '#d6e4ff', label: '雾霭蓝' },
    { color: '#d8f5e0', label: '薄荷绿' },
    { color: '#fff3d6', label: '奶油黄' },
    { color: '#e8dcff', label: '淡紫' },
    { color: '#ffdcc0', label: '暖橘' }
  ];
  const BUBBLE_INK_COLORS = [
    { color: '#111111', label: '默认黑' },
    { color: '#ffffff', label: '白色' },
    { color: '#444444', label: '深灰' },
    { color: '#d6336c', label: '玫红' },
    { color: '#1a56db', label: '蓝' },
    { color: '#1e8e5a', label: '绿' },
    { color: '#9a6b00', label: '黄褐' },
    { color: '#7048e8', label: '紫' },
    { color: '#b3540a', label: '橘' }
  ];
  // 发送按钮背景色板（含微信绿/红包红等鲜艳色，适配按钮场景）
  const SEND_BG_COLORS = [
    { color: '#111111', label: '默认黑' },
    { color: '#07c160', label: '微信绿' },
    { color: '#fa5151', label: '红包红' },
    { color: '#3a8ee6', label: '天空蓝' },
    { color: '#ff9500', label: '活力橙' },
    { color: '#9254de', label: '优雅紫' },
    { color: '#ffffff', label: '白色' },
    { color: '#3a3a3a', label: '炭灰' }
  ];
  // 气泡颜色行统一处理：openModal 色板 → 存 cs-* 键 → applySettings 生效
  function bindBubbleColorRow(rowId, key, def, title, swatches) {
    const el = row(rowId);
    if (!el) return;
    el.addEventListener('click', () => {
      if (!window.openModal) return;
      const cur = store.get(key) || def;
      window.openModal(title, '', (v) => {
        // v 可能是色板下标（number）或自定义色值（#hex 字符串）
        const color = (typeof v === 'number' && swatches[v]) ? swatches[v].color : v;
        if (!color) return;
        store.set(key, color);
        applySettings();
        const val = document.getElementById(rowId + '-val');
        if (val) val.textContent = color === def ? '默认 ' + color : color;
      }, {
        colorPicker: true,
        color: cur,
        swatches: swatches
      });
    });
  }
  // 我的气泡（out 深色系）/ 联系人气泡（in 浅色系）与各自文字色
  bindBubbleColorRow('cs-out-bg', 'cs-out-bg', '#111111', '我的气泡颜色', BUBBLE_BG_COLORS);
  bindBubbleColorRow('cs-out-ink', 'cs-out-ink', '#ffffff', '我的消息文字颜色', BUBBLE_INK_COLORS);
  bindBubbleColorRow('cs-in-bg', 'cs-in-bg', '#ffffff', '联系人气泡颜色', BUBBLE_BG_COLORS);
  bindBubbleColorRow('cs-in-ink', 'cs-in-ink', '#111111', '联系人消息文字颜色', BUBBLE_INK_COLORS);
  // 发送按钮颜色 / 发送文字颜色
  bindBubbleColorRow('cs-send-bg', 'cs-send-bg', '#111111', '发送按钮颜色', SEND_BG_COLORS);
  bindBubbleColorRow('cs-send-ink', 'cs-send-ink', '#ffffff', '发送文字颜色', BUBBLE_INK_COLORS);
  // 发送按钮显示/隐藏（勾选=隐藏，默认显示；隐藏后仍可按回车键发送）。每联系人独立。
  const csSendShow = document.getElementById('cs-send-show');
  if (csSendShow) {
    const showGet = () => { try { return store.get('cs-send-show') === 'hide'; } catch (e) { return false; } };
    const showSet = (hide) => { try { store.set('cs-send-show', hide ? 'hide' : 'show'); } catch (e) {} };
    const syncCsSendShow = () => { const v = showGet(); if (v !== csSendShow.checked) csSendShow.checked = v; };
    syncCsSendShow();
    csSendShow.addEventListener('change', () => {
      if (csSendShow.checked === showGet()) return;
      showSet(csSendShow.checked);
      applySettings();
      toast(csSendShow.checked ? '发送按钮已隐藏：仍可按回车键发送消息' : '发送按钮已显示');
    });
    document.addEventListener('contact-switched', syncCsSendShow);
  }

  const csFont = row('cs-font-size');
  if (csFont) {
    csFont.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('聊天气泡字体大小', '', (v) => { store.set('cs-font-size', v); applySettings(); }, {
        pills: FONT_SIZES,
        pill: store.get('cs-font-size') || '14px'
      });
    });
  }
  const csPad = row('cs-bubble-size');
  if (csPad) {
    csPad.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      const cur = store.get('cs-bubble-size') || '11px 14px';
      const curLabel = (BUBBLE_SIZES.find(p => p.value === cur) || {}).label || '自定义';
      window.openTCPanel('聊天气泡框大小', '' +
        '<div class="sm-fld"><label>预设大小</label><select class="tc-input" id="cs-pad-preset">' +
        '<option value="">自定义</option>' +
        BUBBLE_SIZES.map(p => '<option value="' + p.value + '"' + (p.value === cur ? ' selected' : '') + '>' + p.label + '</option>').join('') +
        '</select></div>' +
        '<div class="sm-fld"><label>自定义（格式：上下 左右，如 <code>8px 10px</code>）</label>' +
        // v3.6.x：回填值做 HTML 转义——用户可写的值含 " 会破坏 value 属性（与 cs-font-name 一致）
        '<input class="tc-input" id="cs-pad-input" value="' + String(cur).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"></div>' +
        '<div class="sm-set-hint">示例：紧凑 8px 10px · 标准 11px 14px · 宽松 14px 18px</div>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-pad-cancel">取消</button><button class="cc-tool" id="cs-pad-ok">应用</button></div>');
      document.getElementById('cs-pad-cancel').addEventListener('click', () => { document.getElementById('tc-mask').hidden = true; });
      document.getElementById('cs-pad-preset').addEventListener('change', () => {
        const v = document.getElementById('cs-pad-preset').value;
        if (v) document.getElementById('cs-pad-input').value = v;
      });
      document.getElementById('cs-pad-ok').addEventListener('click', () => {
        let v = (document.getElementById('cs-pad-input').value || '').trim();
        if (!v) { toast('请输入气泡框大小'); return; }
        // 规范化：数字+px 或 纯数字（默认px）
        // v3.6.x：原正则会把 "1.5px" 改坏成 "1px.5px"（回溯拆开小数）——改为分词处理，
        // 已带 px 的 token 不动，纯数字补 px，避免无效 CSS 静默回退默认
        v = String(v).split(/[,\s]+/).filter(Boolean).map(function (tok) {
          return /^-?\d+(?:\.\d+)?px$/.test(tok) ? tok : tok.replace(/^(-?\d+(?:\.\d+)?)$/, '$1px');
        }).join(' ');
        store.set('cs-bubble-size', v);
        document.getElementById('tc-mask').hidden = true;
        applySettings();
        toast('气泡框大小已应用');
      });
    });
  }

  // ================= 全局字体（上传本地字体 / 输入字体名或链接，v3.5.34 起全局应用） =================
  const csFontRow = row('cs-font');
  const FONT_KEY = 'cs-font';
  function fontVal() { return store.get(FONT_KEY) || ''; }
  function applyFont() {
    // 移除旧的字体样式
    const old = document.getElementById('cs-font-style');
    if (old) old.remove();
    const v = fontVal();
    const setVal = document.getElementById('cs-font-val');
    if (setVal) setVal.textContent = v ? (v.indexOf('data:') === 0 ? '已上传' : v) : '默认';
    if (!v) {
      document.body.style.fontFamily = '';
      document.documentElement.style.fontFamily = '';
      return;
    }
    // dataURL → @font-face 注入 + 全局应用（body/html 继承到全部页面，不只聊天）
    if (v.indexOf('data:') === 0) {
      const st = document.createElement('style');
      st.id = 'cs-font-style';
      st.textContent = '@font-face{font-family:"cs-custom-font";src:url("' + v + '");font-display:swap;}' +
        'body,html{font-family:"cs-custom-font",sans-serif !important;}';
      document.head.appendChild(st);
      document.body.style.fontFamily = '';
      document.documentElement.style.fontFamily = '';
      return;
    }
    // 字体名直接应用（全局）
    document.body.style.fontFamily = '"' + v + '",sans-serif';
    document.documentElement.style.fontFamily = '"' + v + '",sans-serif';
  }
  if (csFontRow) {
    csFontRow.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      window.openTCPanel('全局字体', '' +
        '<div class="sm-fld"><label>上传本地字体（ttf / otf / woff / woff2），应用后全局生效</label>' +
        // v3.6.x：字体名做 HTML 转义——原逻辑直接拼接 value 属性，字体名含 " 或 < 会破坏弹层结构
        '<input class="tc-input" id="cs-font-name" placeholder="也可直接输入字体名或链接，如 Microsoft YaHei"' + (fontVal() && fontVal().indexOf('data:') !== 0 && fontVal().indexOf('http') !== 0 ? ' value="' + String(fontVal()).replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"' : '') + '></div>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-font-upload">上传字体</button><button class="cc-tool" id="cs-font-clear">恢复默认</button><button class="cc-tool" id="cs-font-ok">应用</button></div>');
      document.getElementById('cs-font-upload').addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.ttf,.otf,.woff,.woff2';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return;
          toast('正在读取字体文件…');
          const reader = new FileReader();
          reader.onload = () => {
            store.set(FONT_KEY, reader.result);
            document.getElementById('tc-mask').hidden = true;
            applyFont();
            toast('字体已应用成功');
          };
          reader.onerror = () => { toast('字体文件读取失败，请重试'); };
          reader.readAsDataURL(f);
        };
        inp.click();
      });
      document.getElementById('cs-font-clear').addEventListener('click', () => {
        store.remove(FONT_KEY);
        document.getElementById('tc-mask').hidden = true;
        applyFont();
        toast('已恢复默认字体');
      });
      document.getElementById('cs-font-ok').addEventListener('click', () => {
        const name = (document.getElementById('cs-font-name').value || '').trim();
        if (!name) { toast('请输入字体名或链接'); return; }
        // 链接：尝试下载并转 dataURL（失败则按字体名应用）；下载期间先提示，避免"没反应"
        if (/^https?:\/\/.+\.(ttf|otf|woff|woff2)$/i.test(name)) {
          toast('正在下载字体，请稍候…');
          fetch(name, { mode: 'cors' }).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          }).then(blob => {
            const rd = new FileReader();
            rd.onload = () => {
              store.set(FONT_KEY, rd.result);
              document.getElementById('tc-mask').hidden = true;
              applyFont();
              toast('字体下载并应用成功');
            };
            rd.onerror = () => {
              store.set(FONT_KEY, name);
              document.getElementById('tc-mask').hidden = true;
              applyFont();
              toast('字体读取失败，已按字体名应用');
            };
            rd.readAsDataURL(blob);
          }).catch(() => {
            store.set(FONT_KEY, name);
            document.getElementById('tc-mask').hidden = true;
            applyFont();
            toast('链接下载失败，已按字体名应用');
          });
          return;
        }
        store.set(FONT_KEY, name);
        document.getElementById('tc-mask').hidden = true;
        applyFont();
        toast('字体已应用成功');
      });
    });
  }
  applyFont();

  // ================= 气泡 CSS（自定义样式，极简黑白灰） =================
  const csCss = row('cs-css');
  const CSS_KEY = 'cs-bubble-css';
  // v3.14.x：安卓 ce-box 转换后 .value 代理在个别内核读空（mail.js/music-player.js/
  // period.js 同款先例）——代理读空但 ce-box 里仍有可见内容时直接从盒子取值兜底，
  // 防「点应用存了空串」→ 重进后退回默认气泡；用户真清空时盒子也是空的，语义不变
  function cssReadVal(el) {
    if (!el) return '';
    let v = '';
    try { v = el.value || ''; } catch (e) {}
    if (String(v).trim()) return String(v);
    try {
      const box = el.__ceBox || (el.parentNode && el.parentNode.querySelector('.ce-box[data-for="' + (el.id || '') + '"]'));
      if (box) {
        const t = box.innerText || box.textContent || '';
        if (String(t).trim()) return String(t);
      }
    } catch (e) {}
    return v;
  }
  function applyCss() {
    const old = document.getElementById('cs-bubble-style');
    if (old) old.remove();
    const css = store.get(CSS_KEY) || '';
    const setVal = document.getElementById('cs-css-val');
    if (setVal) setVal.textContent = css ? '已设置' : '默认';
    if (!css) return;
    let out = css;
    // 声明块（无选择器）→ 应用到我的/对方气泡
    if (css.indexOf('{') < 0) {
      out = '.msg-out .msg-bubble{' + css + '!important;}' +
            '.msg-in .msg-bubble{' + css + '!important;}';
    } else {
      // 用户选择器映射到 mochi 气泡
      out = css
        .replace(/\.msg-out\b/g, '.msg-out')
        .replace(/\.msg-in\b/g, '.msg-in')
        .replace(/\.message-sent\b/g, '.msg-out .msg-bubble')
        .replace(/\.message-received\b/g, '.msg-in .msg-bubble')
        .replace(/\.mb\.self\b/g, '.msg-out .msg-bubble')
        .replace(/\.mb\.other\b/g, '.msg-in .msg-bubble')
        .replace(/\.bubble-self\b/g, '.msg-out .msg-bubble')
        .replace(/\.bubble-other\b/g, '.msg-in .msg-bubble');
    }
    const st = document.createElement('style');
    st.id = 'cs-bubble-style';
    st.textContent = out;
    document.head.appendChild(st);
  }
  if (csCss) {
    csCss.addEventListener('click', () => {
      if (!window.openTCPanel) return;
      window.openTCPanel('气泡 CSS', '' +
        '<div class="sm-fld-hint" style="margin-bottom:8px">输入自定义样式，支持两种写法：<br>· 直接写声明，如 <code>border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.1)</code>（自动应用到双方气泡）<br>· 或写选择器，如 <code>.msg-out .msg-bubble{...}</code></div>' +
        '<textarea id="cs-css-input" class="tc-input" rows="6" placeholder="border-radius: 20px;' + '&#10;box-shadow: 0 2px 8px rgba(0,0,0,.12);"></textarea>' +
        '<div class="mail-actions"><button class="cc-tool" id="cs-css-clear">清空</button><button class="cc-tool" id="cs-css-ok">应用</button></div>');
      const ta = document.getElementById('cs-css-input');
      if (ta) ta.value = store.get(CSS_KEY) || '';
      document.getElementById('cs-css-clear').addEventListener('click', () => {
        store.remove(CSS_KEY);
        document.getElementById('tc-mask').hidden = true;
        applyCss();
        toast('已清空气泡样式');
      });
      document.getElementById('cs-css-ok').addEventListener('click', () => {
        const v = cssReadVal(document.getElementById('cs-css-input')).trim();
        store.set(CSS_KEY, v);
        document.getElementById('tc-mask').hidden = true;
        applyCss();
        toast('气泡样式已应用');
      });
    });
  }
  applyCss();

  // ================= 导出 / 导入聊天记录（数据，与清空同组） =================
  // 导出：打包为独立 JSON 下载（聊天记录可能含图片 dataURL，体积大也直接下载，不走 localStorage）
  const csExport = row('cs-export-msgs');
  if (csExport) {
    csExport.addEventListener('click', () => {
      if (!window.chatExportMsgs) { toast('聊天记录暂不可用'); return; }
      toast('正在导出，请稍候…');
      const arr = window.chatExportMsgs();
      const data = { app: 'mochi-zika-chat', version: '1.0', exportTime: new Date().toISOString(), msgs: arr };
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '聊天记录_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('已导出 ' + arr.length + ' 条聊天记录');
    });
  }
  // 导入：读取 JSON → 校验 → 预览摘要二次确认 → 覆盖当前记录
  const csImport = row('cs-import-msgs');
  if (csImport) {
    csImport.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        // FileReader 全兼容（旧 iOS File.text() 不支持）
        const reader = new FileReader();
        reader.onload = () => {
          let data;
          try { data = JSON.parse(String(reader.result || '')); } catch (e) { toast('无效的聊天记录文件'); return; }
          if (!data || typeof data !== 'object') { toast('无效的聊天记录文件'); return; }
          // 兼容三种结构：本功能导出的 {app,msgs} / 裸数组 / 整份 mochi 备份（取其中聊天记录）
          let arr = Array.isArray(data) ? data : null;
          if (!arr && data.msgs && Array.isArray(data.msgs)) arr = data.msgs;
          if (!arr && data.ls && typeof data.ls === 'object') {
            const raw = (data.idb && data.idb['xy-home-v2:chat-msgs']) || data.ls['xy-home-v2:chat-msgs'];
            try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { arr = null; }
          }
          if (!Array.isArray(arr) || !arr.length) { toast('文件里没有聊天记录数据'); return; }
          const n = arr.length;
          const fmt = (t) => t ? new Date(t).toLocaleString() : '未知';
          const lines = ['文件包含 ' + n + ' 条消息：',
            '· 最早：' + fmt(arr[0] && arr[0].ts),
            '· 最新：' + fmt(arr[n - 1] && arr[n - 1].ts),
            '导入将覆盖当前全部聊天记录（不可恢复）。'];
          if (!window.openModal) return;
          window.openModal('确认导入聊天记录？', '', () => {
            if (window.chatImportMsgs && window.chatImportMsgs(arr)) toast('已导入 ' + n + ' 条聊天记录');
            else toast('导入失败');
          }, { noInput: true, staticText: lines.join('\n') });
        };
        reader.onerror = () => { toast('文件读取失败，请重试'); };
        reader.readAsText(f, 'utf-8');
      };
      input.click();
    });
  }

  // ================= 删除全部聊天记录（危险操作，二次确认） =================
  const csClear = row('cs-clear-msgs');
  if (csClear) {
    csClear.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('确认删除全部聊天记录？（双方所有消息将被清空，且不可恢复）', '', () => {
        if (window.clearChatHistory) window.clearChatHistory();
        toast('聊天记录已清空');
      }, { noInput: true });
    });
  }

  // v3.5.93：聊天壁纸/上传字体等大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）——
  // 启动时从 IDB 补读后重新应用
  try {
    if (window.idbGet) {
      const myPrefix = window.activePrefix();
      window.idbGet(myPrefix + ':cs-bg').then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2 && !store.get('cs-bg')) {
          store.set('cs-bg', v);
          applySettings();
        }
      });
      window.idbGet(myPrefix + ':' + FONT_KEY).then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 2 && !store.get(FONT_KEY)) {
          store.set(FONT_KEY, v);
          applyFont();
        }
      });
      // v3.14.x：气泡 CSS 同款兜底——LS 写失败（配额满）或被浏览器清理后值只剩 IDB 副本，
      // boot 时 applyCss 跑在回填前读空 → 重进后退回默认气泡（荣耀200Pro Edge 实测）。
      // 启动补读 + 重应用（applyCss 幂等）
      window.idbGet(myPrefix + ':' + CSS_KEY).then(v => {
        if (window.activePrefix() !== myPrefix) return;
        if (v && typeof v === 'string' && v.length > 0 && !store.get(CSS_KEY)) {
          store.set(CSS_KEY, v);
          applyCss();
        }
      });
    }
  } catch (e) {}
  // v3.7.x 修复：上传字体 dataURL 属大键（>200KB）只进 IDB+memoryCache、localStorage 被删，
  //   刷新后 memoryCache 清空。本文件初始化时同步调用的 applyFont() 已跑过（当时无数据），
  //   上方 idbGet 补读又被 !store.get() 条件跳过（idbRestore 先回填 memoryCache 时）→
  //   字体刷新后不应用。数据就绪后兜底再应用一次（applyFont 幂等，重复调用安全）
  document.addEventListener('mochi-restore-done', function () {
    try { applyFont(); } catch (e) {}
    try { applyProfile(); } catch (e) {}
    // v3.14.x：气泡 CSS 补应用——boot 时 applyCss 跑在 IDB 回填完成前（值只在 IDB 时
    // 读空不注入），字体/头像此前有本兜底而气泡 CSS 漏了 → 重进后回退默认气泡。
    // applyCss 幂等：会话内已写入时 memoryCache 值更新，重应用无副作用
    try { applyCss(); } catch (e) {}
  });
  // v3.6.x：多桌面——切换联系人后重新应用聊天美化（壁纸/气泡颜色/字号/形状按新桌面）
  // v3.9.x 修复：气泡 CSS / 全局字体也是按联系人存储（cs-bubble-css / cs-font），
  // 但注入的 <style>（cs-bubble-style / cs-font-style）是全局标签，切换联系人后必须
  // 一并重应用/清除，否则 A 桌面的自定义气泡样式/字体会一直盖在 B 桌面上（改一个
  // 联系人所有联系人的气泡都跟着变）。
  document.addEventListener('contact-switched', function () {
    try { applySettings(); } catch (e) {}
    try { applyProfile(); } catch (e) {}
    try { applyCss(); } catch (e) {}
    try { applyFont(); } catch (e) {}
  });

  // v3.7.x：聊天设置顶部的「全屏模式」开关——镜像设置页 #sf-fullscreen（同一状态）。
  // 本页切换 → 代理到设置页开关并派发 change（走 fullscreen.js 全流程：原生全屏/CSS
  // 兜底/iOS 分支/失败回滚）；设置页或系统（fullscreenchange/切后台恢复/失败回滚）
  // 更新 sf-fullscreen 后，轮询把状态同步回本页开关。fullscreen.js 程序化赋值只改
  // property 不产生 attribute mutation，故用 500ms 轮询而非 MutationObserver。
  const csFs = document.getElementById('cs-fullscreen');
  const sfFs = document.getElementById('sf-fullscreen');
  if (csFs && sfFs) {
    const syncCsFs = () => { if (sfFs.checked !== csFs.checked) csFs.checked = sfFs.checked; };
    syncCsFs();
    csFs.addEventListener('change', () => {
      if (csFs.checked === sfFs.checked) return;
      sfFs.checked = csFs.checked;
      sfFs.dispatchEvent(new Event('change', { bubbles: true }));
    });
    setInterval(syncCsFs, 500);
  }

  // v3.9.x：聊天设置「全屏边缘防误触」开关——镜像设置页 #sf-edge-guard（同一状态双向同步）。
  // 仿 cs-fullscreen 模式：本页切换代理到设置页开关并派发 change（走 fullscreen.js
  // 边缘拦截层启停流程）；设置页变化 500ms 轮询同步回本页。
  const csEg = document.getElementById('cs-edge-guard');
  const sfEg = document.getElementById('sf-edge-guard');
  if (csEg && sfEg) {
    const syncCsEg = () => { if (sfEg.checked !== csEg.checked) csEg.checked = sfEg.checked; };
    syncCsEg();
    csEg.addEventListener('change', () => {
      if (csEg.checked === sfEg.checked) return;
      sfEg.checked = csEg.checked;
      sfEg.dispatchEvent(new Event('change', { bubbles: true }));
    });
    setInterval(syncCsEg, 500);
  }

  // v3.7.x：聊天设置「隐藏音乐悬浮小窗」开关——与音乐页 #music-float-en / 音乐设置
  // #sm-set-float 同源（music-global.floatEn，每桌面独立）。本开关语义反转：勾选=隐藏，
  // 与「隐藏通话小框」一致（音乐页/音乐设置里仍是勾选=开启）。本文件先于 music-player.js
  // 加载，故优先走 window.musicFloatGet/Set 钩子（完整走保存+悬浮框渲染流程）；
  // 钩子未就绪时退化为直读写 store（切换桌面/初始态兜底，浮框由音乐模块下次渲染兜住）。
  const csMf = document.getElementById('cs-music-float');
  if (csMf) {
    const mfGet = () => { // 返回「隐藏中」= !floatEn；floatEn 默认开 → 默认不隐藏
      if (window.musicFloatGet) return !window.musicFloatGet();
      try {
        const s = JSON.parse(store.get('music-global') || '{}');
        return s.floatEn !== undefined ? !s.floatEn : false;
      } catch (e) { return false; }
    };
    const mfSet = (hide) => {
      if (window.musicFloatSet) { window.musicFloatSet(!hide); return; }
      try {
        const s = JSON.parse(store.get('music-global') || '{}');
        s.floatEn = !hide;
        store.set('music-global', JSON.stringify(s));
      } catch (e) {}
    };
    const syncCsMf = () => { const v = mfGet(); if (v !== csMf.checked) csMf.checked = v; };
    syncCsMf();
    csMf.addEventListener('change', () => {
      if (csMf.checked === mfGet()) return;
      mfSet(csMf.checked);
      toast(csMf.checked ? '音乐悬浮小窗已隐藏：播放时不再显示右上角悬浮小框' : '音乐悬浮小窗已恢复显示：播放时右上角出现悬浮小框');
    });
    // 音乐页/音乐设置/桌面部件改动或切桌面后 500ms 内同步回本页开关
    setInterval(syncCsMf, 500);
    document.addEventListener('contact-switched', syncCsMf);
  }

  // v3.7.x：聊天设置「隐藏通话小框」开关——与通话半框/通话模块同源
  // （call-mini-enabled，每桌面独立，默认显示小框）。本开关语义反转：勾选=隐藏。
  // 优先走 window.getCallMiniEnabled/setCallMiniEnabled 钩子（call.js 暴露）；
  // 钩子未就绪时退化为直读写 store（call-mini-enabled !== '0' 即显示）。
  const csCmh = document.getElementById('cs-call-mini-hide');
  if (csCmh) {
    const cmhGet = () => {
      if (window.getCallMiniEnabled) return !window.getCallMiniEnabled();
      try { return store.get('call-mini-enabled') === '0'; } catch (e) { return false; }
    };
    const cmhSet = (hide) => {
      if (window.setCallMiniEnabled) { window.setCallMiniEnabled(!hide); return; }
      try { store.set('call-mini-enabled', hide ? '0' : '1'); } catch (e) {}
    };
    const syncCsCmh = () => { const v = cmhGet(); if (v !== csCmh.checked) csCmh.checked = v; };
    syncCsCmh();
    csCmh.addEventListener('change', () => {
      if (csCmh.checked === cmhGet()) return;
      cmhSet(csCmh.checked);
      toast(csCmh.checked ? '通话小框已隐藏：接通后保持通话面板，不弹出悬浮小框' : '通话小框已开启：接通后自动最小化为悬浮小框');
    });
    setInterval(syncCsCmh, 500);
    document.addEventListener('contact-switched', syncCsCmh);
  }

  // v3.8.x：主设置页「开启群聊」开关——每桌面独立（group-chat-enabled，默认关闭）。
  // 开启后桌面聊天按钮右侧显示「群聊」按钮、占卜按钮隐藏（移到隐藏池，可在装修模式添加到其他页）；
  // 关闭恢复原样。写回后广播 group-chat-mode-changed 事件，personalize.js 响应调整桌面图标。
  const sfGc = document.getElementById('sf-group-chat');
  if (sfGc) {
    // v3.10.x：群聊是全局功能（消息/形象/回复设置均全局存根命名空间），开关也改为
    // 全局存储——原按每桌面隔离（activeStore），切换到新桌面读不到该键→群聊按钮自己
    // 消失（用户反馈"开启群聊后切换桌面没保存"）。读时回退旧版每桌面值完成迁移。
    const GNS = 'xy-home-v2';
    const gcGet = () => {
      try { const v = window.xyStore ? window.xyStore(GNS).get('group-chat-enabled') : null; if (v !== null && v !== undefined) return v === '1'; } catch (e) {}
      try { return store.get('group-chat-enabled') === '1'; } catch (e) { return false; }
    };
    const gcSet = (en) => { try { if (window.xyStore) window.xyStore(GNS).set('group-chat-enabled', en ? '1' : '0'); } catch (e) {} };
    const syncGc = () => { const v = gcGet(); if (v !== sfGc.checked) sfGc.checked = v; };
    syncGc();
    sfGc.addEventListener('change', () => {
      if (sfGc.checked === gcGet()) return;
      gcSet(sfGc.checked);
      try { document.dispatchEvent(new Event('group-chat-mode-changed')); } catch (e) {}
      toast(sfGc.checked ? '群聊已开启：桌面新增群聊按钮，占卜按钮已隐藏（可在美化装修模式添加到其他页面）' : '群聊已关闭，占卜按钮已恢复');
    });
    setInterval(syncGc, 500);
    document.addEventListener('contact-switched', syncGc);
  }

  // v3.10.x：「允许删除联系人消息」开关——默认关闭，每联系人独立。开启后点击 TA 消息
  // 弹出的操作菜单里多出「删除」按钮，可永久移除该条 TA 消息（真删除，不可恢复）。
  const csDtm = document.getElementById('cs-del-ta-msg');
  if (csDtm) {
    const dtmGet = () => { try { return store.get('cs-del-ta-msg') === '1'; } catch (e) { return false; } };
    const dtmSet = (en) => { try { store.set('cs-del-ta-msg', en ? '1' : '0'); } catch (e) {} };
    const syncDtm = () => { const v = dtmGet(); if (v !== csDtm.checked) csDtm.checked = v; };
    syncDtm();
    csDtm.addEventListener('change', () => {
      if (csDtm.checked === dtmGet()) return;
      dtmSet(csDtm.checked);
      toast(csDtm.checked ? '已开启：点击联系人消息可在操作菜单里删除该条消息' : '已关闭删除联系人消息功能');
    });
    document.addEventListener('contact-switched', syncDtm);
  }

  // v3.11.x：「批量发送消息」开关——默认关闭，每联系人独立。开启后聊天输入栏右侧显示
  // 「批量发送」按钮：可插入表情包/图片/文字，每个项目一条消息，多条按顺序批量发送。
  // 存 cs-batch-send，chat.js 读同一键控制按钮显隐。
  const csBs = document.getElementById('cs-batch-send');
  if (csBs) {
    const bsGet = () => { try { return store.get('cs-batch-send') === '1'; } catch (e) { return false; } };
    const bsSet = (en) => { try { store.set('cs-batch-send', en ? '1' : '0'); } catch (e) {} };
    const syncBs = () => { const v = bsGet(); if (v !== csBs.checked) csBs.checked = v; };
    syncBs();
    csBs.addEventListener('change', () => {
      if (csBs.checked === bsGet()) return;
      bsSet(csBs.checked);
      // 通知聊天页即时刷新「批量发送」按钮显隐（不依赖切联系人）
      try { document.dispatchEvent(new Event('batch-send-changed')); } catch (e) {}
      toast(csBs.checked ? '已开启：聊天输入栏右侧显示「批量发送」按钮，可插入表情包/图片/文字批量发送' : '已关闭：聊天输入栏「批量发送」按钮已隐藏');
    });
    document.addEventListener('contact-switched', syncBs);
  }

  // v3.12.x：「隐藏联系人的表情包」开关——默认关闭，全局生效（存根命名空间，与
  // my-emoji-groups 全局化同口径：聊天/朋友圈表情包面板是跨桌面共用 UI，不随桌面切换）。
  // 开启后聊天与朋友圈的表情包面板只显示「我的表情包」，不再显示 TA 的/公用表情包。
  // 写回后广播 hide-ta-sticker-changed 事件，chat.js 即时重渲染面板；feed.js 每次打开时读键。
  const csHts = document.getElementById('cs-hide-ta-sticker');
  if (csHts) {
    const GNS = 'xy-home-v2';
    const KEY = 'hide-ta-sticker';
    const htsGet = () => {
      try { if (window.xyStore) return window.xyStore(GNS).get(KEY) === '1'; } catch (e) {}
      try { return store.get(KEY) === '1'; } catch (e) { return false; }
    };
    const htsSet = (en) => { try { if (window.xyStore) window.xyStore(GNS).set(KEY, en ? '1' : '0'); } catch (e) {} };
    const syncHts = () => { const v = htsGet(); if (v !== csHts.checked) csHts.checked = v; };
    syncHts();
    csHts.addEventListener('change', () => {
      if (csHts.checked === htsGet()) return;
      htsSet(csHts.checked);
      try { document.dispatchEvent(new Event('hide-ta-sticker-changed')); } catch (e) {}
      toast(csHts.checked ? '已隐藏：聊天和朋友圈的表情包面板只显示「我的表情包」' : '已恢复显示 TA 的和公用表情包');
    });
    setInterval(syncHts, 500);
    document.addEventListener('contact-switched', syncHts);
  }
})();

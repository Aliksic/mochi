// ===== 功能：情侣空间个性化 =====
// 头像上传、签名、纪念日照片、手机背景、自定义图标、恋爱纪念日、每日打卡（localStorage 持久化）
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  const gStore = window.xyStore('xy-home-v2'); // v3.9.x：fish-log 全局累计（跨所有联系人按自然日去重）
  // v3.6.x：桌面图片组件尺寸档位（宽度百分比：小/中/大）——const 声明必须放顶部，
  // renderDeskImages 在启动阶段（声明位置之前）就会被调用，放下面会触发 TDZ 报错
  const DESK_IMG_SIZES = { s: 40, m: 70, l: 100 };
  // v3.6.x：桌面图片查看器关闭监听幂等守卫——setupDeskImageViewerClose 启动时就会被调用，
  // let 声明同样必须放顶部，否则 TDZ 报错（会把 personalize 整个 IIFE 中断）
  let viewerBound = false;
  // v3.6.x：空白页提示显隐——有组件/图片的页内联隐藏（盖掉装修态 CSS 的 display:block），
  // 空页恢复为空（由 CSS 决定：仅装修模式显示，退出装修后空白页保持干净）。
  // 启动阶段 renderDeskImages/applyDeskLayout 就会调用它，声明必须放顶部（TDZ）
  const syncPageHint = (slide) => {
    if (!slide) return;
    const hint = slide.querySelector('.desk-page-hint');
    if (!hint) return;
    const hasContent = !!slide.querySelector('[data-desk-widget], [data-desk-image]');
    hint.style.display = hasContent ? 'none' : '';
  };

  // 图片压缩后再存储：大幅缩小体积，本地存储容量更宽松（头像/图标 256px，背景/照片 1000px）
  // v3.6.x：失败/超大图不再回退存原图——iOS Safari 对超大 dataURL（48MP/ProRAW 级别）
  // 的 img 解码会占数百 MB 位图内存，直接把渲染进程拖崩（表现：画面正常但所有按钮
  // 点击无响应，且刷新后 idbRestore 恢复该 dataURL 再次渲染又崩，「刷新后依然失效」）。
  // 解码前按 base64 长度、解码后按像素双重拦截，失败返回 null 由调用方提示换图。
  function compressImage(dataUrl, maxSide) {
    return new Promise((resolve) => {
      // 解码前拦截：>8MB base64（≈6MB 原图，48MP/ProRAW 级别）不解码不存储；
      // 1200 万像素普通照片（2-6MB base64）不受影响
      if (typeof dataUrl === 'string' && dataUrl.length > 8 * 1024 * 1024) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          // 解码后像素拦截：高压缩格式小文件也可能是超大图（48MP HEIC 约 5-8MB）
          if (img.width * img.height > 26000000) { resolve(null); return; }
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          // 压缩失败不再回退存原图（原图可能超大，存进去会让后续每次渲染重新崩溃）
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }
  // v3.10.x：压缩并保证产物体积达标——细节丰富的照片压到目标边长后 JPEG 仍可能超过
  // 渲染防护阈值（如卡片背景 1000px 可 >500KB），旧流程照常入库后，启动渲染时会被
  // sanitizeBg 判为超大值，表现为「设置成功、退出重进后变回默认白板，每次都要重新设置」。
  // 这里在上传端按 0.75 倍率逐级降边长重压（始终从原图压，避免二次 JPEG 糊化），
  // 确保产物 <= limit 才入库；压到 320px 仍超限的极端图返回最小一版由调用方提示。
  function compressImageFit(dataUrl, maxSide, limit) {
    let side = maxSide;
    const step = (data) => {
      if (!data) return Promise.resolve(null);
      if (data.length <= limit || side < 320) return Promise.resolve(data);
      side = Math.round(side * 0.75);
      return compressImage(dataUrl, side).then(step);
    };
    return compressImage(dataUrl, side).then(step);
  }
  // v3.5.107：手机壁纸清晰度——按设备物理像素计算压缩上限。
  // 之前固定压到最长边 1000px，在 2-3x 高分屏（物理宽 1080-1440）上会被放大发糊；
  // 这里用「屏幕物理最高边 × DPR」计算，保证壁纸铺满时不吃放大，同时不超 4096 防止体积过大
  // v3.5.117：上限 4096 → 2880——4096px 壁纸 base64 动辄 3-6MB，回填/解码明显拖慢
  //   启动（桌面图片慢加载的主因之一）；2880px 在 3x 屏依然清晰，体积约减半
  function phoneBgMaxSide() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const h = (window.screen && window.screen.height) || 1920;
    return Math.min(2880, Math.max(2160, Math.round(h * dpr)));
  }

  // v3.6.x：存量大图渲染防护——旧版本压缩失败时回退存过原图（48MP/ProRAW 级别
  // dataURL 十几 MB），渲染成 backgroundImage 会让 iOS Safari 解码占用数百 MB 位图
  // 内存、渲染进程卡死（表现：打开页面卡顿、什么也点不了，刷新重开依旧）。
  // 渲染前发现异常大值即清除（LS+IDB 双清）回默认，保证存量坏数据刷新后自动恢复。
  // 阈值：壁纸类正常压缩产物 ≤5MB（2880px JPEG 0.85），>6MB 判定为旧版回退原图；
  // 小图类（头像/卡片背景等 1000px 内压缩 <200KB）沿用 500KB（与 applyAvatar 一致）
  const BG_SAFE_LIMIT = 6 * 1024 * 1024;
  const IMG_SAFE_LIMIT = 500 * 1024;
  // v3.10.x：硬上限——仅旧版本绕过压缩存进去的原级别大图（渲染会拖垮 iOS Safari）
  // 才清除自愈；正常压缩产物偶尔超阈值时绝不再删数据
  const BG_HARD_LIMIT = 12 * 1024 * 1024;
  const sanitizeBg = (key, limit) => {
    const v = store.get(key);
    if (v && typeof v === 'string' && v.length > limit) {
      // v3.10.x：超限只跳过本次渲染，不再删除数据——旧实现 store.remove 会把
      // localStorage + IndexedDB 三处的图一起删掉，正常照片（如卡片背景压缩产物
      // 略超 500KB）表现为「设置成功、重启后被清掉回默认白板，每次都要重新设置」。
      // 配合上传端 compressImageFit 保证新设置的图都达标，存量略超标图保留在
      // 存储里（导出备份仍含），仅不渲染。
      if (v.length > BG_HARD_LIMIT) { try { store.remove(key); } catch (e) {} }
      return null;
    }
    return v;
  };

  // 头像（位于桌面纪念日卡片内，点击不触发卡片背景上传）
  function applyAvatar(id, key) {
    const box = document.getElementById(id);
    if (!box) return;
    const ring = box.querySelector('.ring');
    let saved = store.get(key);
    // v3.6.x：渲染前防护——256px 头像压缩后正常 <50KB；旧版本压缩失败时回退存过
    // 原图（可能十几 MB），直接渲染 img.src 会让 iOS Safari 解码崩溃（画面正常但
    // 点击无响应，且刷新后恢复数据再次崩溃）。发现超大值即清除（LS+IDB 双清），
    // 回到默认头像——保证存量坏数据在用户刷新后不再复现。
    if (saved && saved.length > 500 * 1024) {
      // v3.10.x：同 sanitizeBg——只跳过本次渲染，不再删数据（256px 正常头像远小于
      // 该阈值，触发即旧版原图残留；仅超硬上限的毒数据仍清除自愈）
      try { if (saved.length > 12 * 1024 * 1024) store.remove(key); } catch (e) {}
      saved = null;
    }
    // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
    if (saved && ring) {
      ring.innerHTML = '';
      const img = document.createElement('img');
      img.src = saved;
      img.alt = '';
      ring.appendChild(img);
    } else if (ring) {
      // v3.6.x：当前联系人未设置头像（或数据异常被清）→ 清掉残留的上一联系人头像，
      // 否则多桌面切换后旧桌面的头像 img 会一直留在 DOM 里（切到无头像桌面仍显示旧头像）。
      // v3.6.x 修复：恢复模板默认人形矢量图（此前 innerHTML='' 把 template.html 里
      // 的默认 SVG 也一并清掉，无头像时桌面圆圈变空白，与聊天页默认头像不一致）
      ring.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
    }
  }
  function bindAvatar(id, key) {
    const box = document.getElementById(id);
    if (!box) return;
    applyAvatar(id, key);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          compressImage(reader.result, 256).then(data => {
            // v3.6.x：压缩失败/图片过大返回 null——不再存原图（防 iOS 解码崩溃），提示换图
            if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
            const ring = box.querySelector('.ring');
            // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
            if (ring) {
              ring.innerHTML = '';
              const img = document.createElement('img');
              img.src = data;
              img.alt = '';
              ring.appendChild(img);
            }
            store.set(key, data);
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  bindAvatar('avatar-user', 'avatar-user');
  bindAvatar('avatar-partner', 'avatar-partner');

  // v3.5.113：IndexedDB 回填完成后（mochi-restore-done 事件）轻量重绘——
  // 头像/摸鱼值/聊天统计等只在启动时渲染一次的界面，导入/配额异常恢复后
  // 不会自动更新；这里统一重绘，不再整页 reload（v3.5.112 的回归修复）
  window.applyAvatars = function () {
    applyAvatar('avatar-user', 'avatar-user');
    applyAvatar('avatar-partner', 'avatar-partner');
    // 聊天页头像（chat.js 暴露的 fillAvatar）
    try {
      if (window.fillAvatar) {
        window.fillAvatar('chat-user-av', 'cs-avatar-user');
        window.fillAvatar('chat-partner-av', 'cs-avatar-partner');
      }
    } catch (e) {}
  };
try {
      document.addEventListener('mochi-restore-done', function () {
        window.applyAvatars();
        try { syncFishUI(); } catch (e) {}
        try { if (!gStore.get('fish-log-global-migrated')) migrateFishLogGlobal(true); } catch (e) {}
        try { updateFishDays(); } catch (e) {}
        // v3.5.116：回填完成后一并重绘桌面图标 + 壁纸——
        //   自定义图标/壁纸大键可能只存 IDB，回填完成前桌面显示的是默认/空白
        try { restoreAppIcons(); } catch (e) {}
        try { applyBgVisibility(); } catch (e) {}
        // v3.10.x：修复「退出重进后桌面卡片背景/页面背景/头像丢失变白板」——
        //   卡片背景(card-bg-*)、页面背景(page-bg-*)、图片组件(desk-image-src-*)都是
        //   大图键只存 IndexedDB，启动渲染时回填未完成读到空；旧重绘清单里没有它们，
        //   回填完成后界面一直停留在空白。现在补齐 + 直读兜底 + 延迟二次刷新。
        try { refreshDeskVisuals(); } catch (e) {}
        try { rescueDeskVisuals(); } catch (e) {}
        setTimeout(function () {
          try { refreshDeskVisuals(); } catch (e) {}
        }, 1800);
      });
    } catch (e) {}

  // 通用弹层：IAB 不支持 prompt/confirm，用页面内模态框替代；支持输入 / 色板
  (function () {
    const mask = document.getElementById('modal-mask');
    const title = document.getElementById('modal-title');
    const staticEl = document.getElementById('modal-static');
    const input = document.getElementById('modal-input');
    const textarea = document.getElementById('modal-textarea');
    const swatches = document.getElementById('modal-swatches');
    const pillsEl = document.getElementById('modal-pills');
    const sliderRow = document.getElementById('modal-slider');
    const sliderLabel = document.getElementById('modal-slider-label');
    const sliderVal = document.getElementById('modal-slider-val');
    const sliderRange = document.getElementById('modal-slider-range');
    const sliderPreview = document.getElementById('modal-slider-preview');
    const sliderPreviewIco = document.getElementById('modal-slider-preview-ico');
    const colorInput = document.getElementById('modal-color');
    const customBtn = document.getElementById('modal-custom');
    const selectEl = document.getElementById('modal-select');
    const fileBtn = document.getElementById('modal-file');
    const fileInput = document.getElementById('modal-file-input');
    const okBtn = document.getElementById('modal-ok');
    const cancelBtn = document.getElementById('modal-cancel');
    const copyBtn = document.getElementById('modal-copy');
    if (!mask || !input) return;
    // v3.10.x：vivo/OPPO Edge 等安卓内核对 ce-box（mobile-adapt 输入转换器）的
    // value 代理支持不完整——弹窗里明明打完字，点确定读 input.value 却是空，
    // 所有走通用弹窗的保存（昵称/金额/存钱罐小心愿…）静默失败。
    // 读值兜底：代理读到空时直接找接管输入的 .ce-box 取文本（同 music-player 方案）；
    // 聚焦兜底：有 ce-box 时直接聚焦它（focus 可能没被代理到，键盘不弹）。
    function ceBoxOf(el) {
      try {
        if (el.__ceBox) return el.__ceBox;
        if (el.parentNode) return el.parentNode.querySelector('.ce-box[data-for="' + (el.id || '') + '"]');
      } catch (e) {}
      return null;
    }
    function readModalVal(el) {
      try { const v = el.value; if (v != null && String(v).length) return String(v); } catch (e) {}
      const box = ceBoxOf(el);
      if (box) { try { const t = (box.innerText !== undefined ? box.innerText : box.textContent) || ''; if (t.length) return t; } catch (e) {} }
      try { return el.value || ''; } catch (e) { return ''; }
    }
    let cb = null;
    // v3.13.x：胶囊构建抽出共用——openModal 打开时与控制器 ctl.pills() 阶段切换
    // 都走这一份（选中态/点击翻转/pillClicked 语义不变）
    function buildPills(list, initVal) {
      pillClicked = false;
      pillVal = initVal !== undefined ? initVal : null;
      pillsEl.hidden = !(list && list.length);
      pillsEl.innerHTML = '';
      if (list && list.length) {
        list.forEach(p => {
          const b = document.createElement('button');
          b.className = 'pill' + (p.value === pillVal ? ' on' : '');
          b.textContent = p.label;
          b.addEventListener('click', () => {
            Array.prototype.forEach.call(pillsEl.children, c => c.classList.remove('on'));
            b.classList.add('on');
            pillVal = p.value;
            pillClicked = true;
          });
          pillsEl.appendChild(b);
        });
      }
    }
    let pillsOnOk = null;
    let noInput = false;
    let picked = -1;
    let customVal = null;
    let pillVal = null;
    let selectedGroup = null;
    let lock = false;
    // v3.13.x：「本次确定后保持打开」标记——cb 里调 ctl.stay() 置位，紧随其后的
    // close()（okBtn/Enter 的 finally）只跳过这一次。供同一弹窗内做多阶段表单
    // （钱包两侧连填/存钱罐金额→留言/记账分类管理），取代旧「60ms 后开第二层」
    // 的嵌套写法——真机键盘收起/再聚焦竞态会让第二层弹窗无法输入。
    let stayOnce = false;
    let sliderCfg = null;
    let sliderInitPill = null;
    // v3.6.x：用户是否真的点过 pill——区分「opts.pill 预设值」与「用户主动选择」。
    // 修复：今天的心情/字体大小等「pills + 输入框 + pill 预设」弹窗里，用户输入文字点确定时，
    // fire() 的 pills 分支误把预设的旧 pillVal 传回回调，输入的文本被丢弃（卡片不更新）。
    let pillClicked = false;
    window.openModal = function (t, v, fn, opts) {
      opts = opts || {};
      // v3.20.x：每次打开弹窗重置底部确认按钮文案为默认「确定」——此前只在调用方显式
      // ctl.okText() 时才会写，若某次弹窗（如心意币「申请」）设过、下一个弹窗
      // （如跨桌面通话/查岗的 pill 弹窗）没设，按钮就残留显示上一个弹窗文案。
      // 需要定制文案的调用方在 openModal 返回后调 ctl.okText() 覆盖即可。
      if (okBtn) okBtn.textContent = '确定';
      stayOnce = false;
      pillsOnOk = opts.pillsOnOk || null;
      noInput = !!(opts.noInput);
      pillClicked = false;
      // v3.6.x：opts.lock——锁定弹窗（换头像邀请等必须做出选择）：
      // 点遮罩不关闭、隐藏取消按钮，只能走确定（含 pills/输入）路径
      lock = !!(opts.lock);
      if (cancelBtn) cancelBtn.hidden = lock;
      title.textContent = t;
      if (staticEl) {
        staticEl.hidden = !opts.staticText;
        staticEl.textContent = opts.staticText || '';
      }
      input.hidden = noInput || !!opts.textarea;
      input.value = v || '';
      // v3.5.130：maxlength 由调用方控制——模板不再写死 12（编辑消息/备忘会被截断）；
      // 昵称类短输入传 opts.maxlength，编辑消息等不传
      if (opts.maxlength) input.maxLength = opts.maxlength;
      else input.removeAttribute('maxlength');
      // v3.13.x：opts.placeholder——单行输入占位符（此前调用方传了也被静默忽略，
      // 如 pomo 设时长/单选题选项；ce-box 转换后 placeholder 走代理 setter 同步
      // 到 box 的 data-ph，原生输入框与安卓转换框两端一致生效）
      if ('placeholder' in opts) { try { input.placeholder = opts.placeholder || ''; } catch (e) {} }
      // v3.13.x：opts.inputmode——金额等数字弹窗弹数字键盘；ghost 与已生成的
      // ce-box 都要写（转换器只在转换瞬间复制一次该属性）
      if ('inputmode' in opts) {
        var _im = opts.inputmode || '';
        try { if (_im) input.setAttribute('inputmode', _im); else input.removeAttribute('inputmode'); } catch (e) {}
        try { const _b = ceBoxOf(input); if (_b) { if (_im) _b.setAttribute('inputmode', _im); else _b.removeAttribute('inputmode'); } } catch (e) {}
      }
      if (textarea) {
        textarea.hidden = !opts.textarea;
        if (opts.textarea) {
          textarea.value = v || '';
          textarea.placeholder = opts.textareaPlaceholder || '多行内容';
        }
      }
      // 目标分组下拉
      if (selectEl) {
        selectEl.hidden = !(opts.groups && opts.groups.length);
        selectEl.innerHTML = '';
        selectedGroup = null;
        if (opts.groups && opts.groups.length) {
          const none = document.createElement('option');
          none.value = '';
          none.textContent = '导入到新分组（按【组名】识别）';
          selectEl.appendChild(none);
          opts.groups.forEach(g => {
            const o = document.createElement('option');
            o.value = g;
            o.textContent = '导入到现有分组：' + g;
            selectEl.appendChild(o);
          });
        }
      }
      // txt 文件导入
      if (fileBtn) {
        fileBtn.hidden = !opts.txtImport;
        fileBtn.onclick = () => { if (fileInput) fileInput.click(); };
      }
      // 色板
      swatches.hidden = !(opts.swatches && opts.swatches.length);
      swatches.innerHTML = '';
      picked = -1;
      customVal = null;
      if (opts.swatches && opts.swatches.length) {
        opts.swatches.forEach((label, i) => {
          const s = document.createElement('span');
          s.className = 'sw' + (i === opts.pick ? ' on' : '');
          s.style.background = label.color;
          s.title = label.label;
          s.addEventListener('click', () => {
            Array.prototype.forEach.call(swatches.children, c => c.classList.remove('on'));
            s.classList.add('on');
            picked = i;
            customBtn.classList.remove('on');
          });
          swatches.appendChild(s);
        });
      }
      // 选项胶囊（pills）——构建逻辑抽到 buildPills（ctl.pills 阶段切换共用）
      buildPills(opts.pills, opts.pill);
      // 自定义取色（简约按钮）
      customBtn.hidden = !opts.colorPicker;
      customBtn.classList.remove('on');
      if (opts.colorPicker && opts.pick === -2) customBtn.classList.add('on');
      if (opts.color) colorInput.value = opts.color;
      // v3.6.x：滑块（数值调整，如图标圆角）——opts.slider = { min, max, step, value, label, unit, preview, onChange }
      sliderCfg = (opts.slider && typeof opts.slider === 'object') ? opts.slider : null;
      sliderInitPill = pillVal;
      if (sliderRow) {
        sliderRow.hidden = !sliderCfg;
        if (sliderCfg) {
          const min = sliderCfg.min != null ? sliderCfg.min : 0;
          const max = sliderCfg.max != null ? sliderCfg.max : 100;
          const step = sliderCfg.step != null ? sliderCfg.step : 1;
          const val = sliderCfg.value != null ? sliderCfg.value : min;
          sliderRange.min = min; sliderRange.max = max; sliderRange.step = step;
          sliderRange.value = val;
          if (sliderLabel) sliderLabel.textContent = sliderCfg.label || '';
          if (sliderVal) sliderVal.textContent = val + (sliderCfg.unit || '');
          if (sliderPreview) {
            sliderPreview.hidden = !sliderCfg.preview;
            if (sliderCfg.preview && sliderPreviewIco) sliderPreviewIco.style.borderRadius = val + 'px';
          }
          if (sliderCfg.onChange) { try { sliderCfg.onChange(val); } catch (e) {} }
        }
      }
      cb = fn;
      mask.hidden = false;
      // v3.5.133：多行模式聚焦 textarea（原只 focus 单行 input——多行模式下 input 隐藏、
      // focus 打在 display:none 元素上，键盘不弹，批量导入用户首触必失败一次）
      setTimeout(() => {
        if (noInput) return;
        const target = (opts.textarea && textarea) ? textarea : input;
        if (!target) return;
        const box = ceBoxOf(target);
        try { if (box) { box.focus(); return; } } catch (e) {}
        try { target.focus(); } catch (e) {}
      }, 60);
      // v3.13.x：弹窗控制器——openModal 现在返回 ctl（旧调用方忽略返回值，零影响）。
      // 回调里用 ctl.stay() 让「本次确定」不关窗，再配合下列方法就地切换到下一阶段，
      // 实现单弹窗多阶段表单（钱包两侧连填/存钱罐/记账分类管理），消除嵌套竞态。
      const ctl = {
        stay: function () { stayOnce = true; },
        title: function (s) { title.textContent = String(s == null ? '' : s); },
        hint: function (s) { if (staticEl) { staticEl.hidden = !s; staticEl.textContent = s || ''; } },
        text: function (s) { try { input.value = s || ''; } catch (e) {} },
        maxLen: function (n) { try { if (n) input.maxLength = n; else input.removeAttribute('maxlength'); } catch (e) {} },
        ph: function (s) { try { input.placeholder = s || ''; } catch (e) {} },
        okText: function (s) { if (okBtn) okBtn.textContent = s || '确定'; },
        focus: function () {
          setTimeout(function () {
            if (noInput) return;
            const b3 = ceBoxOf(input);
            try { if (b3) { b3.focus(); return; } } catch (e) {}
            try { input.focus(); } catch (e) {}
          }, 60);
        },
        // 显示/隐藏输入框（安卓 ce-box 的显隐由转换器 MutationObserver 自动跟随）
        input: function (show) {
          noInput = !show;
          input.hidden = !show;
          if (show) ctl.focus();
        },
        // 重建胶囊组；传空数组/null 隐藏。initVal 设初始选中项
        pills: function (list, initVal) { buildPills(list, initVal); }
      };
      // v3.16.x：opts.copyBtn——弹窗底部「复制」按钮（诊断信息等只读展示场景）。
      // 传 { label, fn }，fn(ctl) 在点击时调用，可用 ctl.hint() 就地反馈复制结果；
      // 不传则按钮保持隐藏，对既有弹窗零影响。
      if (copyBtn) {
        const cfg = opts.copyBtn || null;
        copyBtn.hidden = !cfg;
        copyBtn.onclick = null;
        if (cfg) {
          if (cfg.label) copyBtn.textContent = cfg.label;
          if (typeof cfg.fn === 'function') {
            copyBtn.onclick = function () { try { cfg.fn(ctl); } catch (e) {} };
          }
        }
      }
      return ctl;
    };
    // iOS Safari：<input type="color"> 处于 display:none（hidden）时 .click() 不会弹取色器，
    // 点击【自定义颜色】前先临时取消隐藏并改成离屏（不占布局不挡触摸），
    // 再在本帧内点击触发原生取色器；取完色/取消后恢复隐藏。
    customBtn.addEventListener('click', function () {
      if (!colorInput) return;
      colorInput.hidden = false;
      colorInput.style.cssText = 'position:fixed;left:-9999px;top:0;width:40px;height:30px;opacity:0;pointer-events:none;z-index:-1;';
      void colorInput.offsetWidth; // 强制回流，确保 iOS 判定该元素已渲染
      try { colorInput.click(); } catch (e) { try { colorInput.hidden = true; colorInput.style.cssText = ''; } catch (e2) {} }
    });
    // v3.6.x：滑块拖动——实时更新值/预览块/onChange（图标圆角所见即所得）
    if (sliderRange) {
      sliderRange.addEventListener('input', () => {
        if (!sliderCfg) return;
        const val = parseInt(sliderRange.value, 10);
        if (sliderVal) sliderVal.textContent = val + (sliderCfg.unit || '');
        if (sliderPreviewIco) sliderPreviewIco.style.borderRadius = val + 'px';
        if (sliderCfg.onChange) { try { sliderCfg.onChange(val); } catch (e) {} }
      });
    }
    colorInput.addEventListener('change', () => {
      customVal = colorInput.value;
      Array.prototype.forEach.call(swatches.children, c => c.classList.remove('on'));
      customBtn.classList.add('on');
      picked = -2;
      // 取完色后把离屏状态恢复隐藏（值已进 customVal，不影响后续）
      try { colorInput.hidden = true; colorInput.style.cssText = ''; } catch (e) {}
    });
    function close() {
      if (stayOnce) { stayOnce = false; return; } // ctl.stay()：本次确定不关闭，cb 已就地切到下一阶段
      mask.hidden = true; cb = null;
    }
    function fire() {
      if (!cb) return;
      // 色板/自定义取色优先于 pills（v3.6.x：widget 颜色等弹窗同时带 pills 和色板时，
      // 点色板确定被 pills 分支拦截传 null → 设置不生效）
      if (swatches && !swatches.hidden && (picked === -2 || picked >= 0)) {
        if (picked === -2 && customVal) { cb(customVal); return; }
        if (picked >= 0) { cb(picked); return; }
      }
      // v3.6.x：滑块弹窗——先于 pills 判断（滑块弹窗可能带「恢复默认」pill）：
      // 用户点过 pill（值变化）→ 走 pills（如恢复默认）；否则提交滑块当前值
      if (sliderRow && !sliderRow.hidden && sliderCfg) {
        if (pillsEl && !pillsEl.hidden && pillVal !== sliderInitPill) {
          if (pillsOnOk) pillsOnOk(pillVal);
          cb(pillVal);
          return;
        }
        cb(parseInt(sliderRange.value, 10));
        return;
      }
      // v3.6.x：pills 分支只在「用户点过 pill」或「纯 pill 弹窗（noInput）」时走——
      // 用 pillClicked 判断（之前用 pillVal !== null 会被 opts.pill 预设值干扰，
      // 导致「今天的心情」等弹窗输入文字点确定时旧 pill 值覆盖输入）
      if (pillsEl && !pillsEl.hidden && (pillClicked || noInput)) {
        if (pillsOnOk) pillsOnOk(pillVal);
        cb(pillVal);
        return;
      }
      if (textarea && !textarea.hidden) { cb(readModalVal(textarea), selectedGroup); return; }
      if (swatches.hidden) cb(noInput ? 'ok' : readModalVal(input));
      else if (picked === -2 && customVal) cb(customVal);
      else if (picked >= 0) cb(picked);
    }
    // 分组下拉变化
    if (selectEl) {
      selectEl.addEventListener('change', () => { selectedGroup = selectEl.value || null; });
    }
    // txt 文件读取
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // v3.18.x：修复 txt 乱码——readAsText 默认按 UTF-8 解码，中文 txt 常为
          // GBK/GB2312（ANSI）编码（Windows 记事本等保存），会被解成乱码。
          // 改为读 ArrayBuffer 探测编码：能按 UTF-8 严格解（合法序列+自动去 BOM）就用 UTF-8，
          // 解不了说明是 GBK 系，回退用 gb18030（GBK 超集）解码。
          let txt = '';
          try {
            const buf = reader.result;
            if (buf) {
              try {
                txt = new TextDecoder('utf-8', { fatal: true }).decode(buf);
              } catch (e) {
                try {
                  txt = new TextDecoder('gb18030').decode(buf);
                } catch (e2) {
                  txt = new TextDecoder('utf-8').decode(buf); // 兜底
                }
              }
            }
          } catch (e) { txt = String(reader.result || ''); }
          if (textarea) textarea.value = txt; // 填入文本框，由用户确认
        };
        reader.readAsArrayBuffer(f);
        fileInput.value = '';
      });
    }
    okBtn.addEventListener('click', () => {
      // v3.5.130：回调抛异常（如存储配额满）也必须关闭弹窗，防止残留卡死
      try { fire(); } finally { close(); }
    });
    cancelBtn.addEventListener('click', close);
    mask.addEventListener('click', (e) => { if (e.target === mask && !lock) close(); });
    input.addEventListener('keydown', (e) => {
      // v3.6.x：与 OK 按钮一致用 try/finally——回调抛异常（如存储配额满）时也必须
      // 关闭弹窗，否则残留卡死、后续再点 OK 每次都抛
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { try { fire(); } finally { close(); } }
    });
  })();

  // 昵称（点击「我」/「TA」下方文字，弹层修改）
  function bindLabel(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = store.get(key);
    if (saved) el.textContent = saved;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.openModal) {
        window.openModal('修改昵称', el.textContent, (v) => {
          const val = (v || '').trim();
          if (val) {
            el.textContent = val;
            store.set(key, val);
            // 同步聊天页顶部标题（联系人的昵称）
            if (key === 'lbl-partner') {
              const pname = document.getElementById('chat-partner-name');
              if (pname) pname.textContent = val;
            }
          }
        }, { maxlength: 12 });
      }
    });
  }
  bindLabel('lbl-user', 'lbl-user');
  bindLabel('lbl-partner', 'lbl-partner');

  // 上传手机背景图片：设为 .phone 全屏背景铺满整个手机屏幕，仅桌面显示；localStorage 持久化
  const phoneEl = document.querySelector('.phone');
  const bgRow = document.getElementById('row-bg-upload');
  const bgVal = document.getElementById('bg-val');
  const bgRemove = document.getElementById('row-bg-remove');
  const bgHome = document.getElementById('page-phone');
  // v3.5.139：壁纸同时铺到 body——电脑桌面下 .phone 只是 390px 模拟器框，
  // 只设 .phone 的话两侧灰底还是默认背景，视觉上"壁纸没铺满页面"。
  // body 背景铺满整个窗口（桌面含两侧灰底；手机端 body 即全屏，与 .phone 同图无缝）。
  // v3.10.x：手机端不再把壁纸铺到 body——窄屏下 .phone 已撑满整个视口，
  // body 份被完全遮挡看不见，但 iOS Safari 仍会解码一份完整位图，壁纸内存翻倍，
  // 正是"进入后卡顿 / 用一会儿灰屏回开屏"（WebContent 内存被杀重载）的主要诱因。
  // 该 body 副本只对桌面模拟器窄框（.phone 只是 390px 小框、两侧露出褐色底）有意义，
  // 与 base.css 的 @media (max-width:900px) 全屏切换保持一致：宽屏才铺 body。
  const isDesktopFrame = () => !!(window.matchMedia && window.matchMedia('(min-width: 901px)').matches);
  const applyBodyBg = (data) => {
    try {
      const b = document.body;
      if (!isDesktopFrame()) { b.style.backgroundImage = ''; return; }
      if (data) {
        b.style.backgroundImage = 'url("' + data + '")';
        b.style.backgroundSize = 'cover';
        b.style.backgroundPosition = 'center';
        b.style.backgroundAttachment = 'scroll';
      } else {
        b.style.backgroundImage = '';
        b.style.backgroundSize = '';
        b.style.backgroundPosition = '';
        b.style.backgroundAttachment = '';
      }
    } catch (e) {}
  };
  const applyPhoneBg = (data) => {
    if (!phoneEl) return;
    // 壁纸铺满整个手机屏幕（含状态栏/导航条区域），且只在桌面显示
    phoneEl.style.backgroundImage = 'url("' + data + '")';
    phoneEl.style.backgroundSize = 'cover';
    phoneEl.style.backgroundPosition = 'center';
    phoneEl.style.backgroundAttachment = 'scroll';
    applyBodyBg(data);
    if (bgHome) {
      bgHome.classList.add('has-bg');
      bgHome.style.backgroundImage = 'none';
    }
  };
  const syncBgUI = () => {
    const has = !!store.get('phone-bg');
    if (bgVal) bgVal.textContent = has ? '已设置' : '';
    if (bgRemove) bgRemove.hidden = !has;
  };
  const clearPhoneBg = () => {
    if (phoneEl) phoneEl.style.backgroundImage = '';
    applyBodyBg(null);
    if (bgHome) {
      bgHome.classList.remove('has-bg');
      bgHome.style.backgroundImage = '';
    }
    store.remove('phone-bg');
    store.remove('phone-bg-preset');
    syncBgUI();
    const pv = document.getElementById('bg-preset-val'); if (pv) pv.textContent = '默认';
  };
  // v3.6.x：内置壁纸预设（CSS 渐变）
  const BG_PRESETS = [
    { name: '晨曦', css: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
    { name: '暮色', css: 'linear-gradient(135deg, #2c3e50 0%, #4a67a4 100%)' },
    { name: '森林', css: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)' },
    { name: '暖阳', css: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { name: '极简', css: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)' },
    { name: '星空', css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
    { name: '樱花', css: 'linear-gradient(135deg, #ffdde1 0%, #ee9ca7 100%)' },
    { name: '海洋', css: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' },
  ];
  const bgPresetRow = document.getElementById('row-bg-preset');
  const bgPresetVal = document.getElementById('bg-preset-val');
  const applyPhoneBgPreset = (css) => {
    if (!phoneEl) return;
    phoneEl.style.backgroundImage = css;
    phoneEl.style.backgroundSize = 'cover';
    phoneEl.style.backgroundPosition = 'center';
    // v3.10.x：body 仅桌面窄框需要（铺两侧底色）；手机端 .phone 已全屏，body 版被遮挡，
    // 跳过避免 iOS 冗余解码/存留
    if (isDesktopFrame()) {
      document.body.style.backgroundImage = css;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    }
    if (bgHome) { bgHome.classList.add('has-bg'); bgHome.style.backgroundImage = 'none'; }
  };
  const getBgPresetName = () => store.get('phone-bg-preset') || '';
  const syncBgPresetUI = () => { if (bgPresetVal) bgPresetVal.textContent = getBgPresetName() || '默认'; };
  { const savedPreset = getBgPresetName(); if (savedPreset) { const p = BG_PRESETS.find(b => b.name === savedPreset); if (p) applyPhoneBgPreset(p.css); } syncBgPresetUI(); }
  if (bgPresetRow) {
    bgPresetRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const pills = [{ label: '清除预设', value: '__clear__' }].concat(
        BG_PRESETS.map(p => ({ label: p.name, value: p.name }))
      );
      window.openModal('内置壁纸预设', '', (v) => {
        if (v === '__clear__') { clearPhoneBg(); return; }
        const p = BG_PRESETS.find(b => b.name === v);
        if (!p) return;
        clearPhoneBg();
        store.set('phone-bg-preset', p.name);
        applyPhoneBgPreset(p.css);
        syncBgPresetUI();
        toast('已切换为「' + p.name + '」壁纸');
      }, { noInput: true, pills: pills });
    });
  }
  if (bgRow) {
    const savedBg = sanitizeBg('phone-bg', BG_SAFE_LIMIT);
    if (savedBg) applyPhoneBg(savedBg);
    syncBgUI();
    bgRow.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // v3.10.x：压缩并保证 <=4.5MB（渲染防护 6MB 留余量），超限自动降边长重压
          compressImageFit(reader.result, phoneBgMaxSide(), 4.5 * 1024 * 1024).then(data => {
            // v3.6.x：压缩失败/图片过大返回 null——不存原图（防 iOS 解码崩溃）
            if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
            applyPhoneBg(data);
            store.set('phone-bg', data);
            store.remove('phone-bg-preset');
            syncBgUI();
            syncBgPresetUI();
            // v3.5.111：上传后立即同步一次桌面可见性，确保回桌面时壁纸已应用
            //（配合内存缓存修复：大壁纸不写 localStorage，靠内存缓存当前会话内读回）
            applyBgVisibility();
            toast('壁纸已设置');
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }
  if (bgRemove) {
    bgRemove.addEventListener('click', () => clearPhoneBg());
  }

  // 壁纸只在桌面显示：桌面时铺满全屏，切到字卡库/设置/聊天时隐藏（数据保留）
  const bgData = () => sanitizeBg('phone-bg', BG_SAFE_LIMIT);
  const applyBgVisibility = () => {
    if (!phoneEl) return;
    const home = document.getElementById('page-phone');
    const show = home && !home.hidden && bgData();
    if (show) {
      phoneEl.style.backgroundImage = 'url("' + bgData() + '")';
      phoneEl.style.backgroundSize = 'cover';
      phoneEl.style.backgroundPosition = 'center';
      phoneEl.style.backgroundAttachment = 'scroll';
      applyBodyBg(bgData());
    } else {
      phoneEl.style.backgroundImage = '';
      applyBodyBg(null);
    }
  };
  // 页面切换时同步壁纸显示
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', applyBgVisibility));
  document.querySelectorAll('.app[data-app="chat"]').forEach(a => a.addEventListener('click', applyBgVisibility));
  document.getElementById('chat-back') && document.getElementById('chat-back').addEventListener('click', applyBgVisibility);
  // 监听桌面容器 hidden 变化（兜底）
  const homePage = document.getElementById('page-phone');
  if (homePage) {
    const mo = new MutationObserver(applyBgVisibility);
    mo.observe(homePage, { attributes: true, attributeFilter: ['hidden'] });
  }
  applyBgVisibility();
  // v3.5.93：桌面壁纸大键可能只存在 IndexedDB（导入兜底写入/大键只进 IDB）——
  // 启动时从 IDB 补读后重新应用
  try {
    if (window.idbGet) {
      window.idbGet(window.activePrefix() + ':phone-bg').then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get('phone-bg')) {
          store.set('phone-bg', v);
          applyBgVisibility();
        }
      });
    }
  } catch (e) {}

  // 自定义手机桌面图标：点击设置项切到手机页进入编辑模式，再点击目标 app 上传替换
  // 注意：桌面分页后可能存在多个 .app-grid，全部绑定
  // v3.5.87：装修模式下点击已有自定义图的图标 → 弹「更换 / 清除」；清除恢复默认图标
  const grids = document.querySelectorAll('.app-grid');
  // 给每个图标存一份原始 SVG，清除时还原
  document.querySelectorAll('.app .app-ico').forEach(ico => {
    if (!ico.dataset.orig) ico.dataset.orig = ico.innerHTML;
  });
  const restoreAppIcons = () => {
    document.querySelectorAll('.app').forEach(app => {
      let saved = store.get('app-icon-' + app.dataset.app);
      const ico = app.querySelector('.app-ico');
      // v3.6.x：与头像同款防护——旧版本压缩失败存过超大原图，渲染会触发 iOS 解码崩溃
      // v3.10.x：只跳过本次渲染不删数据（仅超硬上限仍清除）
      if (saved && saved.length > 500 * 1024) {
        try { if (saved.length > 12 * 1024 * 1024) store.remove('app-icon-' + app.dataset.app); } catch (e) {}
        saved = null;
      }
      if (saved) {
        // v3.6.x：img 用属性赋值（dataURL 含引号时拼 innerHTML 会逃逸注入 HTML）
        if (ico) {
          ico.innerHTML = '';
          const img = document.createElement('img');
          img.src = saved;
          img.alt = '';
          ico.appendChild(img);
        }
      } else if (ico && ico.dataset.orig) {
        ico.innerHTML = ico.dataset.orig;
      }
    });
  };
  restoreAppIcons();
  // v3.6.x：恢复图标网格内自定义顺序（app-icon-order-<grid.app> 存 data-app 数组）
  const restoreAppIconOrder = () => {
    grids.forEach(grid => {
      const gid = grid.dataset.app;
      if (!gid) return;
      let order = null;
      try { const v = store.get('app-icon-order-' + gid); if (v) order = JSON.parse(v); } catch (e) {}
      if (!Array.isArray(order) || !order.length) return;
      const apps = Array.prototype.slice.call(grid.querySelectorAll('.app'));
      const byKey = {};
      apps.forEach(a => { byKey[a.dataset.app] = a; });
      order.forEach((k, i) => {
        const node = byKey[k];
        if (node && node.parentNode === grid) {
          // 插入到当前第 i 个位置前（移动节点不重建，事件绑定保留）
          const ref = grid.children[i];
          if (ref && ref !== node) grid.insertBefore(node, ref);
        }
      });
    });
  };
  restoreAppIconOrder();
  // v3.6.x：图标隐藏/恢复——装修模式下可隐藏图标，清空桌面后自定义布局
  const getHiddenIcons = () => {
    try { return JSON.parse(store.get('hidden-icons') || '[]'); } catch (e) { return []; }
  };
  const setHiddenIcons = (arr) => {
    store.set('hidden-icons', JSON.stringify(arr));
  };
  const applyHiddenIcons = () => {
    const hidden = getHiddenIcons();
    document.querySelectorAll('.app').forEach(app => {
      const key = app.dataset.app;
      if (hidden.indexOf(key) >= 0) app.style.display = 'none';
      else app.style.display = '';
    });
  };
  applyHiddenIcons();
  // v3.5.95：自定义图标大键可能只存在 IndexedDB（压缩失败兜底会存原始大图）→ 补读后重新恢复图标
  try {
    if (window.idbGetAllKeys) {
      window.idbGetAllKeys().then(keys => {
        const iconKeys = (keys || []).filter(k => k.indexOf(window.activePrefix() + ':app-icon-') === 0);
        if (!iconKeys.length) return;
        let p = Promise.resolve();
        iconKeys.forEach(k => {
          p = p.then(() => window.idbGet(k)).then(v => {
            if (v && typeof v === 'string' && v.length > 2) store.set(k.slice(window.activePrefix().length + 1), v);
          });
        });
        p.then(() => restoreAppIcons());
      });
    }
  } catch (e) {}

  // v3.14.x：换图标菜单提取为全局函数——图标可能被 applyGroupChatMode/applyDeskLayout
  // 移出 .app-grid（如群聊开启时占卜移到隐藏池，或用户拖到其他页），grid click 监听器
  // 不触发；暴露 window.openIconMenu 供各图标自身监听器兜底调用
  window.openIconMenu = function (app) {
    const grid = app.closest('.app-grid');
    const key = app.dataset.app;
    const ico = app.querySelector('.app-ico');
    const hasCustom = !!store.get('app-icon-' + key);
    const pickFile = () => {
      // v3.15.x：input 先挂 body 再 click——未挂 DOM 的 <input type=file>.click() 在
      // 部分内核（iOS Safari / vivo Edge 等真机）不弹选择器（v3.8.x chatcard pickFiles
      // 同款教训），选完/取消后移除防残留
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(input);
      input.onchange = () => {
        const f = input.files && input.files[0];
        try { if (input.parentNode) input.remove(); } catch (e) {}
        if (!f) { return; }
        const reader = new FileReader();
        reader.onload = () => {
          compressImage(reader.result, 256).then(data => {
            if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
            if (ico) {
              ico.innerHTML = '';
              const img = document.createElement('img');
              img.src = data;
              img.alt = '';
              ico.appendChild(img);
            }
            store.set('app-icon-' + key, data);
          });
        };
        reader.readAsDataURL(f);
      };
      input.onblur = () => { setTimeout(() => { try { if (input.parentNode) input.remove(); } catch (e) {} }, 1500); };
      try { input.click(); } catch (e) { try { input.remove(); } catch (e2) {} }
    };
    const moveApp = (dir) => {
      if (!grid) return;
      const apps = Array.prototype.slice.call(grid.querySelectorAll('.app'));
      const idx = apps.indexOf(app);
      if (dir === 'up' && idx > 0) grid.insertBefore(app, apps[idx - 1]);
      else if (dir === 'down' && idx < apps.length - 1) grid.insertBefore(apps[idx + 1], app);
      const order = Array.prototype.slice.call(grid.querySelectorAll('.app')).map(a => a.dataset.app);
      store.set('app-icon-order-' + grid.dataset.app, JSON.stringify(order));
      toast(dir === 'up' ? '已上移' : '已下移');
    };
    const pills = [];
    pills.push({ label: hasCustom ? '更换图片' : '上传图片', value: '1' });
    if (hasCustom) pills.push({ label: '清除图片', value: '2' });
    if (grid) { pills.push({ label: '上移', value: 'up' }); pills.push({ label: '下移', value: 'down' }); }
    pills.push({ label: '隐藏图标', value: 'hide' });
    if (window.openModal) {
      window.openModal('图标设置', '', (v) => {
        if (v === '1') pickFile();
        else if (v === '2' && hasCustom) {
          store.remove('app-icon-' + key);
          if (ico && ico.dataset.orig) ico.innerHTML = ico.dataset.orig;
          toast('已恢复默认图标');
        } else if (v === 'up') moveApp('up');
        else if (v === 'down') moveApp('down');
        else if (v === 'hide') {
          const hidden = getHiddenIcons();
          if (hidden.indexOf(key) < 0) hidden.push(key);
          setHiddenIcons(hidden);
          app.style.display = 'none';
          toast('已隐藏，可在装修栏恢复');
        }
      }, { noInput: true, pills: pills });
    } else {
      pickFile();
    }
  };
  grids.forEach(grid => {
    grid.addEventListener('click', (e) => {
      if (!grid.classList.contains('editing')) return;
      const app = e.target.closest('.app');
      if (!app) return;
      e.stopPropagation();
      window.openIconMenu(app);
    });
  });
  // v3.15.x：装修模式点「独立组件图标」换图兜底——被移出 .app-grid 的单个功能图标
  //（装修库「添加到此页」/拖拽换页后的 app-* 图标，第2/3页装修用户常见）不在任何
  // 网格内，上面的网格监听器不触发；而这类图标自身 handler 在 editing 时按约定
  // 直接 return 等网格兜底 → 谁都不处理，表现为「装修模式点图标没反应、换不了图」
  // （vivo Edge 真机反馈）。在 #page-phone 上委托：decor-on 且 .app 不在编辑态
  // 网格内时直接开图标菜单；网格内路径已 stopPropagation 冒泡不到这里，不会重复弹。
  const phoneDecorEl = document.getElementById('page-phone');
  if (phoneDecorEl) {
    phoneDecorEl.addEventListener('click', (e) => {
      if (!phoneDecorEl.classList.contains('decor-on')) return;
      if (e.target.closest('.desk-lib') || e.target.closest('.decor-bar') || e.target.closest('.desk-page-add')) return;
      const app = e.target.closest('.app');
      if (!app) return;
      const grid = app.closest('.app-grid');
      if (grid && grid.classList.contains('editing')) return;
      e.stopPropagation();
      window.openIconMenu(app);
    });
  }

  const iconRow = document.getElementById('row-custom-icon');
  // v3.6.x：进入装修模式的公共逻辑（自定义桌面图标 / 卡片背景两个入口共用）：
  // 切到桌面 + 图标网格进入 editing（点图标换图）+ 开启 decor-on（点卡片设背景）+ 显示装饰条
  const enterDecor = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const phoneTab = document.querySelector('.tab[data-page="page-phone"]');
    if (phoneTab) phoneTab.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const phonePage = document.getElementById('page-phone');
    if (phonePage) phonePage.hidden = false;
    grids.forEach(g => g.classList.add('editing'));
    const phone = document.getElementById('page-phone');
    if (phone) phone.classList.add('decor-on');
    const bar = document.getElementById('decor-bar');
    if (bar) bar.hidden = false;
  };
  if (iconRow) {
    iconRow.addEventListener('click', enterDecor);
  }
  // v3.6.x：装修模式设置卡片背景入口的绑定在 CARD_BG_TYPES 定义之后（见卡片背景段末尾）——
  // 该入口引用了 CARD_BG_TYPES 统计已设置数量，需等其声明后再绑定。

  // 小组件颜色：点击色板选择，CSS 变量 --widget-bg 实时生效
  const widgetColorRow = document.getElementById('row-widget-color');
  const widgetColorVal = document.getElementById('widget-color-val');
  const applyWidgetColor = (color) => {
    document.documentElement.style.setProperty('--widget-bg', color);
    if (widgetColorVal) widgetColorVal.textContent = color === '#ffffff' ? '默认白' : '';
  };
  const savedWidgetColor = store.get('widget-bg-color');
  if (savedWidgetColor) applyWidgetColor(savedWidgetColor);
  if (widgetColorRow) {
    const syncWidgetColorUI = () => {
      const c = store.get('widget-bg-color') || '#ffffff';
      if (widgetColorVal) widgetColorVal.textContent = c === '#ffffff' ? '默认白' : '';
    };
    syncWidgetColorUI();
    widgetColorRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-bg-color') || '#ffffff';
      // v3.6.x：20 色板（覆盖黑白灰 + 8 个常用色相浅色 + 8 个深/中色）——告别"阉割版"
      const swatchList = [
        { color: '#ffffff', label: '默认白' },
        { color: '#f5f0eb', label: '暖米白' },
        { color: '#fff0f0', label: '樱花粉' },
        { color: '#f0f4ff', label: '雾霭蓝' },
        { color: '#f0fff0', label: '薄荷绿' },
        { color: '#fff5e6', label: '奶油黄' },
        { color: '#f5e6ff', label: '淡紫' },
        { color: '#fff0e0', label: '暖橘' },
        { color: '#e6f7f5', label: '薄青' },
        { color: '#fff8dc', label: '米黄' },
        { color: '#fce4ec', label: '粉桃' },
        { color: '#e8eaf6', label: '淡靛' },
        { color: '#f1f8e9', label: '嫩绿' },
        { color: '#fafafa', label: '银灰' },
        { color: '#f0f0f0', label: '浅灰' },
        { color: '#d4d4d4', label: '中灰' },
        { color: '#111111', label: '深黑' },
        { color: '#e8b4b8', label: '玫瑰' },
        { color: '#b8d4e8', label: '天蓝' },
        { color: '#c8e6c9', label: '森绿' },
      ];
      window.openModal('小组件颜色', '', (v) => {
        // v 可能是色板下标（number）或自定义色值（#hex 字符串）
        const color = (typeof v === 'number' && swatchList[v]) ? swatchList[v].color : v;
        if (!color) return;
        if (color === '__reset__') {
          store.remove('widget-bg-color');
          applyWidgetColor('#ffffff');
          syncWidgetColorUI();
          return;
        }
        store.set('widget-bg-color', color);
        applyWidgetColor(color);
        syncWidgetColorUI();
      }, {
        colorPicker: true,
        noInput: true,
        color: current,
        swatches: swatchList,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // 小组件边框颜色：CSS 变量 --widget-border 实时生效
  const widgetBorderRow = document.getElementById('row-widget-border');
  const widgetBorderVal = document.getElementById('widget-border-val');
  const applyWidgetBorder = (color) => {
    document.documentElement.style.setProperty('--widget-border', color);
    if (widgetBorderVal) widgetBorderVal.textContent = color === 'rgba(0,0,0,.1)' ? '默认' : '';
  };
  const savedWidgetBorder = store.get('widget-border-color');
  if (savedWidgetBorder) applyWidgetBorder(savedWidgetBorder);
  if (widgetBorderRow) {
    const syncWidgetBorderUI = () => {
      const c = store.get('widget-border-color') || 'rgba(0,0,0,.1)';
      if (widgetBorderVal) widgetBorderVal.textContent = c === 'rgba(0,0,0,.1)' ? '默认' : '';
    };
    syncWidgetBorderUI();
    const borderSwatches = [
      { color: 'rgba(0,0,0,.1)', label: '默认' },
      { color: 'rgba(0,0,0,.15)', label: '浅灰' },
      { color: 'rgba(0,0,0,.25)', label: '中灰' },
      { color: 'rgba(0,0,0,.4)', label: '深灰' },
      { color: '#111111', label: '纯黑' },
      { color: '#ffffff', label: '纯白' },
      { color: '#e05555', label: '樱花粉' },
      { color: '#5555cc', label: '雾霭蓝' },
      { color: '#55aa55', label: '薄荷绿' },
      { color: '#d4a017', label: '暖橘黄' },
      { color: '#cc55cc', label: '淡紫' },
      { color: '#cc6622', label: '暖橘' },
      { color: '#e8b4b8', label: '玫瑰' },
      { color: '#b8d4e8', label: '天蓝' },
      { color: '#c8e6c9', label: '森绿' },
      { color: '#ffd54f', label: '明黄' },
    ];
    widgetBorderRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-border-color') || 'rgba(0,0,0,.1)';
      window.openModal('小组件边框颜色', '', (v) => {
        // 色板点击传下标（number），自定义取色传 #hex 字符串，pill 传 value
        const color = (typeof v === 'number' && borderSwatches[v]) ? borderSwatches[v].color : v;
        if (!color) return;
        if (color === '__reset__') {
          store.remove('widget-border-color');
          applyWidgetBorder('rgba(0,0,0,.1)');
          syncWidgetBorderUI();
          return;
        }
        store.set('widget-border-color', color);
        applyWidgetBorder(color);
        syncWidgetBorderUI();
      }, {
        colorPicker: true,
        noInput: true,
        color: current,
        swatches: borderSwatches,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // 按钮颜色：CSS 变量 --widget-btn 实时生效
  const widgetBtnRow = document.getElementById('row-widget-btn');
  const widgetBtnVal = document.getElementById('widget-btn-val');
  const applyWidgetBtn = (color) => {
    document.documentElement.style.setProperty('--widget-btn', color);
    if (widgetBtnVal) widgetBtnVal.textContent = color === '#111111' ? '默认黑' : '';
  };
  const savedWidgetBtn = store.get('widget-btn-color');
  if (savedWidgetBtn) applyWidgetBtn(savedWidgetBtn);
  if (widgetBtnRow) {
    const syncWidgetBtnUI = () => {
      const c = store.get('widget-btn-color') || '#111111';
      if (widgetBtnVal) widgetBtnVal.textContent = c === '#111111' ? '默认黑' : '';
    };
    syncWidgetBtnUI();
    const btnSwatches = [
      { color: '#111111', label: '默认黑' },
      { color: '#222222', label: '深灰' },
      { color: '#444444', label: '中深' },
      { color: '#666666', label: '中灰' },
      { color: '#888888', label: '灰' },
      { color: '#aaaaaa', label: '浅灰' },
      { color: '#ffffff', label: '白' },
      { color: '#e05555', label: '樱花粉' },
      { color: '#5555cc', label: '雾霭蓝' },
      { color: '#55aa55', label: '薄荷绿' },
      { color: '#d4a017', label: '暖橘黄' },
      { color: '#cc55cc', label: '淡紫' },
      { color: '#cc6622', label: '暖橘' },
      { color: '#e8b4b8', label: '玫瑰' },
      { color: '#b8d4e8', label: '天蓝' },
      { color: '#c8e6c9', label: '森绿' },
    ];
    widgetBtnRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-btn-color') || '#111111';
      window.openModal('按钮颜色', '', (v) => {
        // 色板点击传下标（number），自定义取色传 #hex 字符串，pill 传 value
        const color = (typeof v === 'number' && btnSwatches[v]) ? btnSwatches[v].color : v;
        if (!color) return;
        if (color === '__reset__') {
          store.remove('widget-btn-color');
          applyWidgetBtn('#111111');
          syncWidgetBtnUI();
          return;
        }
        store.set('widget-btn-color', color);
        applyWidgetBtn(color);
        syncWidgetBtnUI();
      }, {
        colorPicker: true,
        noInput: true,
        color: current,
        swatches: btnSwatches,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // 按钮文字颜色：CSS 变量 --widget-btn-text 实时生效（打卡按钮/周末倒计时按钮等）
  const widgetBtnTextRow = document.getElementById('row-widget-btn-text');
  const widgetBtnTextVal = document.getElementById('widget-btn-text-val');
  const applyWidgetBtnText = (color) => {
    document.documentElement.style.setProperty('--widget-btn-text', color);
    if (widgetBtnTextVal) widgetBtnTextVal.textContent = color === '#ffffff' ? '默认白' : '';
  };
  const savedWidgetBtnText = store.get('widget-btn-text-color');
  if (savedWidgetBtnText) applyWidgetBtnText(savedWidgetBtnText);
  if (widgetBtnTextRow) {
    const syncWidgetBtnTextUI = () => {
      const c = store.get('widget-btn-text-color') || '#ffffff';
      if (widgetBtnTextVal) widgetBtnTextVal.textContent = c === '#ffffff' ? '默认白' : '';
    };
    syncWidgetBtnTextUI();
    const btnTextSwatches = [
      { color: '#ffffff', label: '默认白' },
      { color: '#f2f2f2', label: '亮白' },
      { color: '#dddddd', label: '浅灰' },
      { color: '#bbbbbb', label: '中浅灰' },
      { color: '#999999', label: '中灰' },
      { color: '#777777', label: '深灰' },
      { color: '#555555', label: '更深灰' },
      { color: '#111111', label: '纯黑' },
      { color: '#e05555', label: '樱花粉' },
      { color: '#5555cc', label: '雾霭蓝' },
      { color: '#2e8b57', label: '薄荷绿' },
      { color: '#d4a017', label: '暖橘黄' },
      { color: '#cc55cc', label: '淡紫' },
      { color: '#cc6622', label: '暖橘' },
      { color: '#e8b4b8', label: '玫瑰' },
      { color: '#b8d4e8', label: '天蓝' },
    ];
    widgetBtnTextRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-btn-text-color') || '#ffffff';
      window.openModal('按钮文字颜色', '', (v) => {
        // 色板点击传下标（number），自定义取色传 #hex 字符串，pill 传 value
        const color = (typeof v === 'number' && btnTextSwatches[v]) ? btnTextSwatches[v].color : v;
        if (!color) return;
        if (color === '__reset__') {
          store.remove('widget-btn-text-color');
          applyWidgetBtnText('#ffffff');
          syncWidgetBtnTextUI();
          return;
        }
        store.set('widget-btn-text-color', color);
        applyWidgetBtnText(color);
        syncWidgetBtnTextUI();
      }, {
        colorPicker: true,
        noInput: true,
        color: current,
        swatches: btnTextSwatches,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // 爱心外框颜色：CSS 变量 --widget-heart 实时生效（打卡横幅「和 TA 一起摸鱼」的爱心圆底）
  const widgetHeartRow = document.getElementById('row-widget-heart');
  const widgetHeartVal = document.getElementById('widget-heart-val');
  const applyWidgetHeart = (color) => {
    document.documentElement.style.setProperty('--widget-heart', color);
    if (widgetHeartVal) widgetHeartVal.textContent = color === '#111111' ? '默认黑' : '';
  };
  const savedWidgetHeart = store.get('widget-heart-color');
  if (savedWidgetHeart) applyWidgetHeart(savedWidgetHeart);
  if (widgetHeartRow) {
    const syncWidgetHeartUI = () => {
      const c = store.get('widget-heart-color') || '#111111';
      if (widgetHeartVal) widgetHeartVal.textContent = c === '#111111' ? '默认黑' : '';
    };
    syncWidgetHeartUI();
    const heartSwatches = [
      { color: '#111111', label: '默认黑' },
      { color: '#222222', label: '深灰' },
      { color: '#444444', label: '中深' },
      { color: '#666666', label: '中灰' },
      { color: '#888888', label: '灰' },
      { color: '#aaaaaa', label: '浅灰' },
      { color: '#e05555', label: '樱花粉' },
      { color: '#5555cc', label: '雾霭蓝' },
      { color: '#2e8b57', label: '薄荷绿' },
      { color: '#d4a017', label: '暖橘黄' },
      { color: '#cc55cc', label: '淡紫' },
      { color: '#cc6622', label: '暖橘' },
      { color: '#e8b4b8', label: '玫瑰' },
      { color: '#b8d4e8', label: '天蓝' },
      { color: '#c8e6c9', label: '森绿' },
      { color: '#ffd54f', label: '明黄' },
    ];
    widgetHeartRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-heart-color') || '#111111';
      window.openModal('爱心外框颜色', '', (v) => {
        const color = (typeof v === 'number' && heartSwatches[v]) ? heartSwatches[v].color : v;
        if (!color) return;
        if (color === '__reset__') {
          store.remove('widget-heart-color');
          applyWidgetHeart('#111111');
          syncWidgetHeartUI();
          return;
        }
        store.set('widget-heart-color', color);
        applyWidgetHeart(color);
        syncWidgetHeartUI();
      }, {
        colorPicker: true,
        noInput: true,
        color: current,
        swatches: heartSwatches,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // 小组件透明度：CSS 变量 --widget-opacity（0~1），输入 0~100 百分比
  const widgetOpacityRow = document.getElementById('row-widget-opacity');
  const widgetOpacityVal = document.getElementById('widget-opacity-val');
  const applyWidgetOpacity = (pct) => {
    const op = Math.max(0, Math.min(100, pct)) / 100;
    document.documentElement.style.setProperty('--widget-opacity', String(op));
    if (widgetOpacityVal) widgetOpacityVal.textContent = (pct === 100 ? '不透明' : pct + '%');
  };
  const savedWidgetOpacity = store.get('widget-opacity');
  if (savedWidgetOpacity) applyWidgetOpacity(parseInt(savedWidgetOpacity, 10));
  if (widgetOpacityRow) {
    const syncWidgetOpacityUI = () => {
      const v = store.get('widget-opacity');
      if (widgetOpacityVal) widgetOpacityVal.textContent = (!v || v === '100') ? '不透明' : v + '%';
    };
    syncWidgetOpacityUI();
    widgetOpacityRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = store.get('widget-opacity') || '100';
      window.openModal('小组件透明度（0-100）', current, (v) => {
        const pct = parseInt(v, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) { toast('请输入 0-100 的数字'); return; }
        if (pct === 100) store.remove('widget-opacity');
        else store.set('widget-opacity', String(pct));
        applyWidgetOpacity(pct);
        syncWidgetOpacityUI();
      }, {
        maxlength: 3,
        pills: [
          { label: '100%', value: '100' },
          { label: '80%', value: '80' },
          { label: '60%', value: '60' },
          { label: '40%', value: '40' },
          { label: '20%', value: '20' },
        ],
      });
    });
  }

  // v3.7.x：背景模糊——slider 0~20px，CSS 变量 --desk-bg-blur。
  // v3.7.x 修复：blur(0px) 也会保持 backdrop-filter 激活（iOS 全屏每帧栅格化卡顿源），
  // 模糊为 0 时给 .phone-bg-mask 去 .blur-on（filter 属性整个移除），>0 才启用
  const bgBlurRow = document.getElementById('row-bg-blur');
  const bgBlurVal = document.getElementById('bg-blur-val');
  const getBgBlur = () => { const v = store.get('bg-blur'); if (v) { const n = parseInt(v, 10); if (!isNaN(n)) return Math.max(0, Math.min(20, n)); } return 0; };
  const setBgBlurClass = (px) => {
    const maskEl = document.querySelector('.phone-bg-mask');
    if (maskEl) maskEl.classList.toggle('blur-on', px > 0);
  };
  const applyBgBlur = (px) => {
    document.documentElement.style.setProperty('--desk-bg-blur', px + 'px');
    setBgBlurClass(px);
    if (bgBlurVal) bgBlurVal.textContent = px === 0 ? '关闭' : px + 'px';
  };
  applyBgBlur(getBgBlur());
  if (bgBlurRow) {
    bgBlurRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getBgBlur();
      window.openModal('背景模糊', '', (v) => {
        if (v === '__reset__') { store.remove('bg-blur'); applyBgBlur(0); return; }
        const px = parseInt(v, 10); if (isNaN(px)) return;
        if (px === 0) store.remove('bg-blur'); else store.set('bg-blur', String(px));
        applyBgBlur(px);
      }, {
        noInput: true,
        slider: { min: 0, max: 20, step: 1, value: current, label: '拖动调整背景模糊', unit: 'px',
          onChange: (val) => { applyBgBlur(val); } },
        pills: [{ label: '关闭', value: '__reset__' }],
      });
    });
  }

  // v3.7.x：背景遮罩——slider 0~80%，CSS 变量 --desk-bg-mask-op（白色半透明遮罩让背景变淡）
  const bgMaskOpRow = document.getElementById('row-bg-mask-op');
  const bgMaskOpVal = document.getElementById('bg-mask-op-val');
  const getBgMaskOp = () => { const v = store.get('bg-mask-op'); if (v) { const n = parseInt(v, 10); if (!isNaN(n)) return Math.max(0, Math.min(80, n)); } return 0; };
  const applyBgMaskOp = (pct) => {
    document.documentElement.style.setProperty('--desk-bg-mask-op', String(pct / 100));
    if (bgMaskOpVal) bgMaskOpVal.textContent = pct === 0 ? '关闭' : pct + '%';
  };
  applyBgMaskOp(getBgMaskOp());
  if (bgMaskOpRow) {
    bgMaskOpRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getBgMaskOp();
      window.openModal('背景遮罩', '', (v) => {
        if (v === '__reset__') { store.remove('bg-mask-op'); applyBgMaskOp(0); return; }
        const pct = parseInt(v, 10); if (isNaN(pct)) return;
        if (pct === 0) store.remove('bg-mask-op'); else store.set('bg-mask-op', String(pct));
        applyBgMaskOp(pct);
      }, {
        noInput: true,
        slider: { min: 0, max: 80, step: 5, value: current, label: '白色遮罩让背景变淡', unit: '%',
          onChange: (val) => { document.documentElement.style.setProperty('--desk-bg-mask-op', String(val / 100)); } },
        pills: [{ label: '关闭', value: '__reset__' }],
      });
    });
  }

  // v3.7.x：组件卡片圆角——slider 0~30px，CSS 变量 --desk-card-radius（默认 20px）
  const cardRadiusRow = document.getElementById('row-desk-card-radius');
  const cardRadiusVal = document.getElementById('desk-card-radius-val');
  const CARD_RADIUS_DEFAULT = 20;
  const getCardRadius = () => { const v = store.get('desk-card-radius'); if (v) { const n = parseInt(v, 10); if (!isNaN(n)) return Math.max(0, Math.min(30, n)); } return CARD_RADIUS_DEFAULT; };
  const applyCardRadius = (px) => {
    document.documentElement.style.setProperty('--desk-card-radius', px + 'px');
    if (cardRadiusVal) cardRadiusVal.textContent = px === CARD_RADIUS_DEFAULT ? '默认' : px + 'px';
  };
  applyCardRadius(getCardRadius());
  if (cardRadiusRow) {
    cardRadiusRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getCardRadius();
      window.openModal('组件圆角', '', (v) => {
        if (v === '__reset__') { store.remove('desk-card-radius'); applyCardRadius(CARD_RADIUS_DEFAULT); return; }
        const px = parseInt(v, 10); if (isNaN(px)) return;
        if (px === CARD_RADIUS_DEFAULT) store.remove('desk-card-radius'); else store.set('desk-card-radius', String(px));
        applyCardRadius(px);
      }, {
        noInput: true,
        slider: { min: 0, max: 30, step: 1, value: current, label: '拖动调整组件圆角', unit: 'px',
          onChange: (val) => { document.documentElement.style.setProperty('--desk-card-radius', val + 'px'); } },
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // v3.6.x：图标圆角——滑块 0~30px 自由调整（原「圆形/圆角方/直角方」三选一删除，
  // 旧 ico-shape 值迁移：circle→30 / square→0 / rounded→18），CSS 变量 --app-ico-radius
  const icoShapeRow = document.getElementById('row-ico-shape');
  const icoShapeVal = document.getElementById('ico-shape-val');
  const ICO_RADIUS_DEFAULT = 18;
  const getIcoRadius = () => {
    const v = store.get('ico-radius');
    if (v !== null && v !== undefined && v !== '') {
      const n = parseInt(v, 10);
      if (!isNaN(n)) return Math.max(0, Math.min(30, n));
    }
    const old = store.get('ico-shape');
    if (old === 'circle') return 30;
    if (old === 'square') return 0;
    return ICO_RADIUS_DEFAULT;
  };
  const applyIcoRadius = (px) => {
    document.documentElement.style.setProperty('--app-ico-radius', px + 'px');
    if (icoShapeVal) icoShapeVal.textContent = px === ICO_RADIUS_DEFAULT ? '18px（默认）' : px + 'px';
  };
  applyIcoRadius(getIcoRadius());
  if (icoShapeRow) {
    const syncIcoShapeUI = () => {
      const px = getIcoRadius();
      if (icoShapeVal) icoShapeVal.textContent = px === ICO_RADIUS_DEFAULT ? '18px（默认）' : px + 'px';
    };
    syncIcoShapeUI();
    icoShapeRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getIcoRadius();
      window.openModal('图标圆角', '', (v) => {
        if (v === '__reset__') {
          store.remove('ico-radius');
          store.remove('ico-shape');
          applyIcoRadius(ICO_RADIUS_DEFAULT);
          syncIcoShapeUI();
          return;
        }
        const px = parseInt(v, 10);
        if (isNaN(px)) return;
        store.set('ico-radius', String(px));
        applyIcoRadius(px);
        syncIcoShapeUI();
      }, {
        noInput: true,
        slider: {
          min: 0, max: 30, step: 1, value: current, label: '拖动调整图标圆角', unit: 'px',
          preview: true,
          onChange: (val) => { document.documentElement.style.setProperty('--app-ico-radius', val + 'px'); },
        },
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // v3.7.x：美化方案导入导出——收集所有美化相关 key 打包 JSON
  // v3.7.x 修复：小组件五个颜色键此前写成 widget-color/widget-border/... 与
  // 实际存储键 widget-bg-color/widget-border-color/... 全部对不上，导出静默漏掉；
  // 自定义图标（app-icon-*）/图标顺序（app-icon-order-*）/图片组件本体
  //（desk-image-src-*）为动态键，在 collectBeauty/导入处单独收集
  const BEAUTY_KEYS = [
    'phone-bg', 'phone-bg-preset', 'bg-blur', 'bg-mask-op',
    'desk-font-size', 'desk-card-scale', 'desk-card-radius',
    'widget-opacity', 'ico-radius', 'ico-shape',
    'widget-bg-color', 'widget-border-color', 'widget-btn-color', 'widget-btn-text-color', 'widget-heart-color',
    'desk-layout', 'desk-page-count',
    'desk-images', 'desk-texts', 'desk-countdowns',
  ];
  ['deco','quote','fish','checkin','music','memo','mood','week','weekend'].forEach(function(t) {
    BEAUTY_KEYS.push('card-bg-' + t, 'card-bg-mask-' + t);
  });
  for (var _i = 0; _i < 5; _i++) BEAUTY_KEYS.push('page-bg-' + _i);
  const collectBeauty = () => {
    const data = {};
    BEAUTY_KEYS.forEach(k => { const v = store.get(k); if (v !== null && v !== undefined) data[k] = v; });
    // 动态键：自定义图标 + 图标顺序（.app 的 data-app 与 .app-grid 的 data-app 各自成键）
    try {
      document.querySelectorAll('.app').forEach(app => {
        const k = 'app-icon-' + app.dataset.app;
        const v = store.get(k);
        if (v) data[k] = v;
      });
      document.querySelectorAll('.app-grid').forEach(grid => {
        const k = 'app-icon-order-' + grid.dataset.app;
        const v = store.get(k);
        if (v) data[k] = v;
      });
    } catch (e) {}
    // 动态键：图片组件本体（desk-image-src-<id> 只进 IDB+内存缓存，此前不导出 → 导入后空壳）
    try {
      const imgs = JSON.parse(store.get('desk-images') || '[]');
      if (Array.isArray(imgs)) imgs.forEach(m => {
        const v = store.get('desk-image-src-' + m.id);
        if (v) data['desk-image-src-' + m.id] = v;
      });
    } catch (e) {}
    return data;
  };
  const showBeautyFallback = (json) => {
    if (!window.openModal) return;
    // v3.7.x 修复：原 noInput 隐藏输入框且无 staticText，fallback 是空弹窗——
    // 改用 textarea 完整展示 JSON 供手动复制
    window.openModal('美化方案（全选复制）', json, () => {}, {
      textarea: true,
      textareaPlaceholder: '长按/全选复制，发给对方粘贴导入',
    });
  };
  // v3.17.x：导出改为可选「导出文件 / 复制文字」——此前只复制文本，剪贴板在部分
  // 浏览器不可用且大 JSON（含壁纸 dataURL）复制不便；现在弹窗二选一。
  const beautyExportRow = document.getElementById('row-beauty-export');
  if (beautyExportRow) {
    beautyExportRow.addEventListener('click', () => {
      const data = collectBeauty();
      try { const ac = localStorage.getItem('xy-home-v2:accent-color'); if (ac) data['__accent__'] = ac; } catch (e) {}
      try { const tm = localStorage.getItem('xy-home-v2:theme-mode'); if (tm) data['__theme__'] = tm; } catch (e) {}
      const json = JSON.stringify(data);
      if (!window.openModal) { showBeautyFallback(json); return; }
      window.openModal('导出美化方案', '', (v) => {
        if (v === 'file') {
          try {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mochi美化方案-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 1000);
            toast('已导出美化方案文件');
          } catch (e) { toast('导出文件失败'); }
        } else if (v === 'text') {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(() => toast('已复制到剪贴板，发给对方粘贴导入')).catch(() => showBeautyFallback(json));
          } else {
            showBeautyFallback(json);
          }
        }
      }, {
        noInput: true,
        staticText: '选择导出方式：\n· 导出文件：生成 .json 文件，可保存或发送\n· 复制文字：复制配置文本，发给对方粘贴导入',
        pills: [
          { label: '导出文件', value: 'file' },
          { label: '复制文字', value: 'text' },
        ],
      });
    });
  }
  // v3.17.x：美化数据写入当前桌面（导入 / 应用方案共用），含动态键与全局主题
  const applyBeautyData = (data) => {
    BEAUTY_KEYS.forEach(k => { if (data[k] !== undefined) store.set(k, data[k]); });
    // 动态键导入：自定义图标 / 图标顺序 / 图片组件本体
    Object.keys(data).forEach(k => {
      if ((k.indexOf('app-icon-') === 0 || k.indexOf('desk-image-src-') === 0) && data[k] !== undefined) {
        store.set(k, data[k]);
      }
    });
    if (data['__accent__']) { try { localStorage.setItem('xy-home-v2:accent-color', data['__accent__']); } catch (e) {} }
    if (data['__theme__']) { try { localStorage.setItem('xy-home-v2:theme-mode', data['__theme__']); } catch (e) {} }
  };
  const beautyImportRow = document.getElementById('row-beauty-import');
  if (beautyImportRow) {
    beautyImportRow.addEventListener('click', () => {
      if (!window.openModal) return;
      window.openModal('导入美化方案', '', (v) => {
        if (!v || !v.trim()) return;
        try {
          const data = JSON.parse(v.trim());
          if (typeof data !== 'object' || Array.isArray(data)) { toast('格式错误'); return; }
          applyBeautyData(data);
          toast('已导入，刷新生效');
          setTimeout(() => location.reload(), 800);
        } catch (e) { toast('解析失败，请检查文本'); }
      }, { textarea: true, textareaPlaceholder: '粘贴对方导出的美化方案文本，或点下方「从文件导入」选择 .json 文件', txtImport: true });
    });
  }

  // ===== v3.17.x：美化方案（全局保存，所有联系人桌面通用） =====
  // 方案数据与导出一致（collectBeauty + 全局主题），存根命名空间 xy-home-v2:beauty-schemes，
  // 切换联系人桌面后依然可见、可一键应用——满足「通用」需求。
  const SCHEMES_KEY = 'beauty-schemes';
  const getSchemes = () => {
    try { const a = JSON.parse(gStore.get(SCHEMES_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };
  const saveSchemesList = (arr) => { try { gStore.set(SCHEMES_KEY, JSON.stringify(arr)); } catch (e) {} };
  const collectBeautyFull = () => {
    const data = collectBeauty();
    try { const ac = localStorage.getItem('xy-home-v2:accent-color'); if (ac) data['__accent__'] = ac; } catch (e) {}
    try { const tm = localStorage.getItem('xy-home-v2:theme-mode'); if (tm) data['__theme__'] = tm; } catch (e) {}
    return data;
  };
  // 保存当前为方案：取名后入库（全局）；若方案管理器开着则重绘列表
  window.saveBeautyScheme = function () {
    if (!window.openModal) return;
    const ctl = window.openModal('保存当前为美化方案', '', (name) => {
      name = (name || '').trim();
      if (!name) { ctl.hint('请输入方案名称'); ctl.stay(); return; }
      const list = getSchemes();
      list.push({ name, time: Date.now(), data: collectBeautyFull() });
      saveSchemesList(list);
      toast('已保存方案「' + name + '」，所有桌面通用');
      const m = document.getElementById('beauty-scheme-manager');
      if (m && !m.hidden) window.openBeautySchemes();
    }, { maxlength: 20, placeholder: '例如：情侣粉、简约黑白…' });
  };
  // 方案管理器弹窗（自定义居中框，与联系人管理器同风格）
  function schemeModalEl() {
    let m = document.getElementById('beauty-scheme-manager');
    if (!m) {
      m = document.createElement('div'); m.id = 'beauty-scheme-manager'; m.hidden = true;
      m.style.cssText = 'position:fixed;inset:0;z-index:89;align-items:center;justify-content:center;background:rgba(0,0,0,.4)';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m) hideSchemeModal(m); });
    }
    return m;
  }
  function showSchemeModal(m) { m.style.display = 'flex'; m.hidden = false; }
  function hideSchemeModal(m) { m.style.display = 'none'; m.hidden = true; }
  function applyScheme(idx, m) {
    const s = getSchemes()[idx];
    if (!s || !window.openModal) return;
    window.openModal('应用方案「' + s.name + '」？', '', (v) => {
      if (v !== 'ok') return;
      applyBeautyData(s.data || {});
      toast('已应用「' + s.name + '」，刷新生效');
      setTimeout(() => location.reload(), 800);
    }, { noInput: true, staticText: '将覆盖当前桌面的美化设置，刷新生效', pills: [{ label: '应用', value: 'ok' }] });
  }
  function deleteScheme(idx, m) {
    const s = getSchemes()[idx];
    if (!s || !window.openModal) return;
    window.openModal('删除方案「' + s.name + '」？', '', (v) => {
      if (v !== 'ok') return;
      const list = getSchemes();
      list.splice(idx, 1);
      saveSchemesList(list);
      toast('已删除方案');
      window.openBeautySchemes();
    }, { noInput: true, staticText: '删除后不可恢复', pills: [{ label: '删除', value: 'ok' }] });
  }
  window.openBeautySchemes = function () {
    const m = schemeModalEl();
    m.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(92vw,420px);max-height:80vh;display:flex;flex-direction:column;background:var(--card-bg,#fff);color:var(--ink,#111);border-radius:16px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.2)';
    const head = document.createElement('div');
    head.innerHTML = '<div style="font-size:16px;font-weight:600;margin-bottom:4px">美化方案</div><div style="font-size:12px;color:var(--muted,#888);margin-bottom:12px">方案在所有联系人桌面通用，点「应用」一键切换当前桌面外观</div>';
    box.appendChild(head);
    const list = document.createElement('div'); list.className = 'cm-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;flex:1;min-height:0';
    const schemes = getSchemes();
    if (!schemes.length) {
      const empty = document.createElement('div');
      empty.innerHTML = '<div style="font-size:13px;color:var(--muted,#999);text-align:center;padding:20px 0">还没有保存的方案<br>先点下方「保存当前为方案」</div>';
      list.appendChild(empty);
    }
    schemes.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--card-border,#eee);border-radius:10px';
      const nm = document.createElement('div');
      const t = new Date(s.time || Date.now());
      const ds = (t.getMonth() + 1) + '-' + t.getDate();
      nm.innerHTML = '<div style="font-size:14px;font-weight:500;word-break:break-all">' + s.name + '</div><div style="font-size:11px;color:var(--muted,#999)">保存于 ' + ds + ' · 点「应用」切换</div>';
      nm.style.flex = '1';
      row.appendChild(nm);
      const applyBtn = document.createElement('button');
      applyBtn.textContent = '应用';
      applyBtn.style.cssText = 'font-size:12px;padding:4px 10px;border:none;border-radius:8px;background:var(--ink,#111);color:var(--bg-b,#fff)';
      applyBtn.addEventListener('click', () => applyScheme(i, m));
      const delBtn = document.createElement('button');
      delBtn.textContent = '删除';
      delBtn.style.cssText = 'font-size:12px;padding:4px 8px;border:1px solid rgba(163,45,45,.35);border-radius:8px;background:var(--danger-soft,#fff5f5);color:var(--danger-ink,#a32d2d)';
      delBtn.addEventListener('click', () => deleteScheme(i, m));
      row.appendChild(applyBtn); row.appendChild(delBtn);
      list.appendChild(row);
    });
    box.appendChild(list);
    const save = document.createElement('button');
    save.textContent = '+ 保存当前为方案';
    save.style.cssText = 'width:100%;padding:12px;border:none;border-radius:10px;background:var(--ink,#111);color:var(--bg-b,#fff);font-size:14px;font-weight:600';
    save.addEventListener('click', () => { window.saveBeautyScheme(); });
    box.appendChild(save);
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.style.cssText = 'width:100%;margin-top:8px;padding:10px;border:1px solid var(--card-border,#eee);border-radius:10px;background:var(--btn-cancel-bg,#fafafa);color:var(--btn-cancel-ink,#555)';
    close.addEventListener('click', () => hideSchemeModal(m));
    box.appendChild(close);
    m.appendChild(box);
    showSchemeModal(m);
  };
  const beautySaveRow = document.getElementById('row-beauty-save');
  if (beautySaveRow) beautySaveRow.addEventListener('click', () => window.saveBeautyScheme());
  const beautySchemesRow = document.getElementById('row-beauty-schemes');
  if (beautySchemesRow) beautySchemesRow.addEventListener('click', () => window.openBeautySchemes());

  // ===== v3.6.x：深色模式（两档手动开关：浅色/深色，不跟随系统） =====
  // 全局设置（不按联系人隔离），存储键 xy-home-v2:theme-mode
  // 切换时在 <html> 上设 data-theme 属性，base.css [data-theme=dark] + dark.css 覆盖
  const THEME_KEY = 'xy-home-v2:theme-mode';
  const themeModeRow = document.getElementById('row-theme-mode');
  const themeModeVal = document.getElementById('theme-mode-val');
  const getThemeMode = () => { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; } };
  const applyThemeMode = (mode) => {
    if (mode === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeModeVal) themeModeVal.textContent = '已开启';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeModeVal) themeModeVal.textContent = '关闭';
    }
  };
  applyThemeMode(getThemeMode());
  if (themeModeRow) {
    themeModeRow.addEventListener('click', () => {
      // 方向按当前实际生效的主题取反，不回读存储：存储不可用/写失败（iOS 隐私模式、
      // 配额满等）时回读恒为非 dark → 每次点击都算出 next=dark 再刷一遍深色，
      // 表现为「点得开、永远关不掉」。存储写入保持尽力而为，只影响下次启动的初始值。
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyThemeMode(next);
    });
  }

  // ===== v3.6.x：主题色（全局，覆盖按钮/激活态颜色） =====
  const ACCENT_KEY = 'xy-home-v2:accent-color';
  const accentRow = document.getElementById('row-accent-color');
  const accentVal = document.getElementById('accent-color-val');
  const ACCENT_PRESETS = [
    { color: '#111111', label: '经典黑' },
    { color: '#e05555', label: '珊瑚红' },
    { color: '#e8753a', label: '暖橘' },
    { color: '#f0a020', label: '琥珀金' },
    { color: '#4a9d5e', label: '森绿' },
    { color: '#3a7bd5', label: '天蓝' },
    { color: '#7b5fd6', label: '紫罗兰' },
    { color: '#d6459d', label: '玫红' },
  ];
  const accentLuminance = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  const getAccentColor = () => { try { return localStorage.getItem(ACCENT_KEY) || ''; } catch (e) { return ''; } };
  const applyAccentColor = (color) => {
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      document.documentElement.style.setProperty('--btn-bg', color);
      document.documentElement.style.setProperty('--btn-ink', accentLuminance(color) > 0.55 ? '#111111' : '#ffffff');
      if (accentVal) accentVal.textContent = color.toUpperCase() === '#111111' ? '默认' : '已设置';
    } else {
      document.documentElement.style.removeProperty('--btn-bg');
      document.documentElement.style.removeProperty('--btn-ink');
      if (accentVal) accentVal.textContent = '默认';
    }
  };
  applyAccentColor(getAccentColor());
  if (accentRow) {
    accentRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getAccentColor();
      window.openModal('主题色', '', (v) => {
        if (v === '__reset__') { try { localStorage.removeItem(ACCENT_KEY); } catch (e) {} applyAccentColor(''); return; }
        const color = (typeof v === 'number' && ACCENT_PRESETS[v]) ? ACCENT_PRESETS[v].color : v;
        if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return;
        try { localStorage.setItem(ACCENT_KEY, color); } catch (e) {}
        applyAccentColor(color);
      }, {
        noInput: true,
        colorPicker: true,
        color: current,
        swatches: ACCENT_PRESETS,
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // ===== v3.6.x：桌面字号（滑块 85~120%，默认 100%） =====
  const deskFontRow = document.getElementById('row-desk-font-size');
  const deskFontVal = document.getElementById('desk-font-size-val');
  const DESK_FONT_DEFAULT = 100;
  const getDeskFontPct = () => {
    const v = store.get('desk-font-size');
    if (v !== null && v !== undefined && v !== '') { const n = parseInt(v, 10); if (!isNaN(n)) return Math.max(85, Math.min(120, n)); }
    return DESK_FONT_DEFAULT;
  };
  const applyDeskFontPct = (pct) => {
    document.documentElement.style.setProperty('--desk-font-scale', String(pct / 100));
    if (deskFontVal) deskFontVal.textContent = pct === DESK_FONT_DEFAULT ? '默认' : pct + '%';
  };
  applyDeskFontPct(getDeskFontPct());
  if (deskFontRow) {
    const syncDeskFontUI = () => { const pct = getDeskFontPct(); if (deskFontVal) deskFontVal.textContent = pct === DESK_FONT_DEFAULT ? '默认' : pct + '%'; };
    syncDeskFontUI();
    deskFontRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getDeskFontPct();
      window.openModal('桌面字号', '', (v) => {
        if (v === '__reset__') { store.remove('desk-font-size'); applyDeskFontPct(DESK_FONT_DEFAULT); syncDeskFontUI(); return; }
        const pct = parseInt(v, 10); if (isNaN(pct)) return;
        store.set('desk-font-size', String(pct)); applyDeskFontPct(pct); syncDeskFontUI();
      }, {
        noInput: true,
        slider: { min: 85, max: 120, step: 1, value: current, label: '拖动调整桌面字号', unit: '%',
          onChange: (val) => { document.documentElement.style.setProperty('--desk-font-scale', String(val / 100)); } },
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // ===== v3.6.x：卡片大小（滑块 80~120%，默认 100%） =====
  const deskCardRow = document.getElementById('row-desk-card-scale');
  const deskCardVal = document.getElementById('desk-card-scale-val');
  const DESK_CARD_DEFAULT = 100;
  const getDeskCardPct = () => {
    const v = store.get('desk-card-scale');
    if (v !== null && v !== undefined && v !== '') { const n = parseInt(v, 10); if (!isNaN(n)) return Math.max(80, Math.min(120, n)); }
    return DESK_CARD_DEFAULT;
  };
  const applyDeskCardPct = (pct) => {
    document.documentElement.style.setProperty('--desk-card-scale', String(pct / 100));
    if (deskCardVal) deskCardVal.textContent = pct === DESK_CARD_DEFAULT ? '默认' : pct + '%';
  };
  applyDeskCardPct(getDeskCardPct());
  if (deskCardRow) {
    const syncDeskCardUI = () => { const pct = getDeskCardPct(); if (deskCardVal) deskCardVal.textContent = pct === DESK_CARD_DEFAULT ? '默认' : pct + '%'; };
    syncDeskCardUI();
    deskCardRow.addEventListener('click', () => {
      if (!window.openModal) return;
      const current = getDeskCardPct();
      window.openModal('卡片大小', '', (v) => {
        if (v === '__reset__') { store.remove('desk-card-scale'); applyDeskCardPct(DESK_CARD_DEFAULT); syncDeskCardUI(); return; }
        const pct = parseInt(v, 10); if (isNaN(pct)) return;
        store.set('desk-card-scale', String(pct)); applyDeskCardPct(pct); syncDeskCardUI();
      }, {
        noInput: true,
        slider: { min: 80, max: 120, step: 1, value: current, label: '拖动调整卡片大小', unit: '%',
          onChange: (val) => { document.documentElement.style.setProperty('--desk-card-scale', String(val / 100)); } },
        pills: [{ label: '恢复默认', value: '__reset__' }],
      });
    });
  }

  // ===== v3.6.x：卡片背景图片（每类卡片独立上传，遮罩/原图可切换） =====
  // 存储：card-bg-<type>（图片 dataURL）+ card-bg-mask-<type>（'on'=白色遮罩 / 'off'=原图直出）
  // 卡片类型 → 目标元素：统一用 [data-card-bg] 属性选择（v3.6.x：卡片可被移到新增页，
  // 不能依赖 .page-slide.second 等固定位置选择器，否则挪页后背景设置失效）
  const CARD_BG_TYPES = [
    { type: 'deco', name: '纪念日卡', sel: '[data-card-bg="deco"]' },
    { type: 'quote', name: '今日情话卡', sel: '[data-card-bg="quote"]' },
    { type: 'fish', name: '已摸鱼卡', sel: '[data-card-bg="fish"]' },
    { type: 'checkin', name: '打卡横幅', sel: '[data-card-bg="checkin"]' },
    { type: 'music', name: '音乐播放器', sel: '[data-card-bg="music"]' },
    { type: 'memo', name: '今日备忘卡', sel: '[data-card-bg="memo"]' },
    { type: 'mood', name: '今天的心情卡', sel: '[data-card-bg="mood"]' },
    { type: 'week', name: '本周日常卡', sel: '[data-card-bg="week"]' },
    { type: 'weekend', name: '周末倒计时卡', sel: '[data-card-bg="weekend"]' },
  ];
  const cardBgSel = (type) => {
    const def = CARD_BG_TYPES.find(c => c.type === type);
    return def ? def.sel : '';
  };
  // 应用单个卡片的背景：遮罩用多层背景（白色半透明叠加在图片上）
  // v3.6.x：遮罩浓度滑块 0~85（百分比），存数字字符串；旧值 'off'/'light'/'mid'/'strong'/'on' 迁移
  const MASK_ALPHA_LEGACY = { off: 0, light: 30, mid: 50, strong: 72, on: 50 };
  const maskAlphaOf = (type) => {
    const v = store.get('card-bg-mask-' + type);
    if (v === null || v === undefined || v === '') return 0.5;
    if (MASK_ALPHA_LEGACY[v] !== undefined) return MASK_ALPHA_LEGACY[v] / 100;
    const n = parseFloat(v);
    if (!isNaN(n)) return Math.max(0, Math.min(85, n)) / 100;
    return 0.5;
  };
  const maskPctOf = (type) => Math.round(maskAlphaOf(type) * 100);
  const applyCardBg = (type) => {
    const sel = cardBgSel(type);
    if (!sel) return;
    const els = document.querySelectorAll(sel);
    const img = sanitizeBg('card-bg-' + type, IMG_SAFE_LIMIT);
    const a = maskAlphaOf(type);
    els.forEach(el => {
      if (!el) return;
      if (img && typeof img === 'string' && img.length > 2) {
        // background-image 只放 url（与可选遮罩渐变层）；size/position 单独设置
        el.style.backgroundImage = a > 0
          ? 'linear-gradient(rgba(255,255,255,' + a + '), rgba(255,255,255,' + a + ')), url("' + img + '")'
          : 'url("' + img + '")';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
      } else {
        // 无图：恢复默认（清内联，回落到 --widget-bg 变量）
        el.style.backgroundImage = '';
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
        el.style.backgroundRepeat = '';
      }
    });
  };
  const applyAllCardBgs = () => CARD_BG_TYPES.forEach(c => applyCardBg(c.type));
  // v3.10.x：首屏外观键直读兜底——idbRestore 整体恢复可能迟迟完不成（安卓 Edge/雨见等
  // 内核偶发 IndexedDB 事务挂起，分批回填卡住），或本会话早期写入导致某键被跳过回填；
  // 双方头像 / 卡片背景 / 页面背景是用户最敏感的图，这里不依赖整体恢复进度，
  // 直接逐键 idbGet 回填（idbGet 自带 4s+4s 超时自愈），store 已有值则跳过不覆盖。
  function rescueDeskVisuals() {
    if (!window.idbGet) return;
    let pfx; try { pfx = window.activePrefix(); } catch (e) { return; }
    const keys = ['avatar-user', 'avatar-partner'];
    CARD_BG_TYPES.forEach(c => keys.push('card-bg-' + c.type));
    try { for (let i = 0; i < deskPageCount(); i++) keys.push('page-bg-' + i); } catch (e) {}
    const miss = keys.filter(k => !store.get(k));
    if (!miss.length) return;
    let left = miss.length, refreshed = false;
    const done = () => { if (!refreshed) { refreshed = true; try { refreshDeskVisuals(); } catch (e) {} } };
    miss.forEach(k => {
      window.idbGet(pfx + ':' + k).then(v => {
        if (v && typeof v === 'string' && v.length > 2 && !store.get(k)) {
          store.set(k, v);
        }
        if (--left <= 0) done();
      }).catch(() => { if (--left <= 0) done(); });
    });
  }
  // v3.10.x：桌面外观全面重应用——回填完成后/切桌面后统一调用（含头像、卡片背景、
  // 页面背景、图片组件），修复「大图键恢复完成但界面停留在启动时的空白」。
  function refreshDeskVisuals() {
    try { window.applyAvatars(); } catch (e) {}
    try { applyAllCardBgs(); } catch (e) {}
    try { applyPageBgs(); } catch (e) {}
    try { renderDeskImages(); } catch (e) {}
    try { syncBgUI(); } catch (e) {}
  }
  // 初始化 + 多桌面切换后重应用
  applyAllCardBgs();
  document.addEventListener('contact-switched', applyAllCardBgs);
  // 卡片背景设置公共逻辑（设置页行点击 / 装修模式点卡片共用）：
  // 上传 / 清除 / 遮罩开关。type 为卡片类型，name 为显示名。
  // v3.6.x：装修模式点卡片时额外传入 anchorEl（点击的卡片元素）→ 菜单追加
  // 「上移/下移/移出此页」摆放操作（替代原悬浮操作条按钮：操作条挂在 app-grid 上
  // 会遮挡图标导致无法恢复默认，且用户反馈按钮多余，改为收进点卡片菜单）。
  const openCardBgMenu = (type, name, anchorEl) => {
    const img = store.get('card-bg-' + type);

    const widgetEl = anchorEl ? anchorEl.closest('[data-desk-widget]') : null;
    const pickFile = () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // v3.10.x：压缩并保证 <=450KB（渲染防护阈值 500KB 留余量）——超限自动降边长重压，
          // 防止「设置成功、重启后被渲染防护跳过变白板」
          compressImageFit(reader.result, 1000, 450 * 1024).then(data => {
            if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
            store.set('card-bg-' + type, data);
            applyCardBg(type);
            syncCardBgUIs();
            toast(name + '背景已设置');
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    };
    const moveWidget = (dir) => {
      if (!widgetEl || !widgetEl.parentNode) return;
      if (dir === 'up') {
        const prev = widgetEl.previousElementSibling;
        if (prev) widgetEl.parentNode.insertBefore(widgetEl, prev);
      } else if (dir === 'down') {
        const next = widgetEl.nextElementSibling;
        if (next) widgetEl.parentNode.insertBefore(next, widgetEl);
      }
      saveDeskLayout();
      toast(dir === 'up' ? '已上移' : '已下移');
    };
// 组装菜单选项：背景操作 + （装修模式点卡片时）摆放操作
  // v3.6.x：遮罩浓度滑块 0~85%（替换原四档 pills）
  // 嵌套弹窗必须延迟到当前弹窗关闭后再开：okBtn 的 finally close() 会立刻关掉
  // 当前 openModal 并清空 cb（fire() 对 cb===null 直接 return），同步嵌套必然闪关。
  const openCardMenuNext = (t, v, fn, opts) => {
    setTimeout(() => { if (window.openModal) window.openModal(t, v, fn, opts); }, 0);
  };
  const pills = [];
    pills.push({ label: img ? '更换图片' : '上传图片', value: '1' });
    if (img) pills.push({ label: '清除图片', value: '2' });
    if (img) pills.push({ label: '遮罩浓度', value: 'mask' });
    if (img) pills.push({ label: maskPctOf(type) === 0 ? '原图直出 ✓' : '原图直出', value: 'origin' });
    pills.push({ label: '组件透明度', value: 'opacity' });
    if (widgetEl) {
      pills.push({ label: '上移', value: 'up' });
      pills.push({ label: '下移', value: 'down' });
      pills.push({ label: '移出此页', value: 'out' });
    }
    // 无背景且不在装修模式点卡片（设置页行）：直接选文件（原快捷行为）
    if (!img && !widgetEl) { pickFile(); return; }
    if (!window.openModal) return;
    window.openModal(name + '设置', '', (v) => {
      if (v === '1') pickFile();
      else if (v === '2') {
        store.remove('card-bg-' + type);
        applyCardBg(type);
        syncCardBgUIs();
        toast('已恢复默认');
      } else if (v === 'mask') {
        const cur = maskPctOf(type);
        openCardMenuNext('遮罩浓度', '', (sv) => {
          if (sv === '__reset__') { store.set('card-bg-mask-' + type, '50'); applyCardBg(type); syncCardBgUIs(); toast('已恢复默认 50%'); return; }
          const pct = parseInt(sv, 10);
          if (isNaN(pct)) return;
          store.set('card-bg-mask-' + type, String(pct));
          applyCardBg(type);
          syncCardBgUIs();
          toast(pct === 0 ? '已切换为原图直出' : '遮罩浓度 ' + pct + '%');
        }, {
          noInput: true,
          slider: {
            min: 0, max: 85, step: 1, value: cur, label: '拖动调整遮罩浓度（0 为原图直出）', unit: '%',
            onChange: (val) => {
              const a = val / 100;
              const els2 = document.querySelectorAll(cardBgSel(type));
              els2.forEach(el => {
                if (!el || !img) return;
                el.style.backgroundImage = a > 0
                  ? 'linear-gradient(rgba(255,255,255,' + a + '), rgba(255,255,255,' + a + ')), url("' + img + '")'
                  : 'url("' + img + '")';
              });
            },
          },
          pills: [
            { label: '原图直出', value: '0' },
            { label: '恢复默认', value: '__reset__' },
          ],
        });
      } else if (v === 'origin') {
        store.set('card-bg-mask-' + type, '0');
        applyCardBg(type);
        syncCardBgUIs();
        toast('已切换为原图直出');
      } else if (v === 'opacity') {
        const n = parseInt(store.get('widget-opacity'), 10);
        const curOp = !isNaN(n) ? Math.max(0, Math.min(100, n)) : 100;
        openCardMenuNext('组件透明度', '', (sv) => {
          if (sv === '__reset__') { store.remove('widget-opacity'); applyWidgetOpacity(100); toast('已恢复不透明'); return; }
          const pct = parseInt(sv, 10);
          if (isNaN(pct)) return;
          store.set('widget-opacity', String(pct));
          applyWidgetOpacity(pct);
          toast('组件透明度 ' + pct + '%');
        }, {
          noInput: true,
          slider: {
            min: 0, max: 100, step: 1, value: curOp, label: '拖动调整组件透明度', unit: '%',
            onChange: (val) => { document.documentElement.style.setProperty('--widget-opacity', String(val / 100)); },
          },
          pills: [{ label: '恢复默认', value: '__reset__' }],
        });
      } else if (v === 'up') moveWidget('up');
      else if (v === 'down') moveWidget('down');
      else if (v === 'out') {
        // v3.6.x：移出前记住来源页，移出后同步空白页提示（空页在装修模式重新显示提示）
        const fromSlide = widgetEl.closest('.page-slide');
        ensureWidgetPool().appendChild(widgetEl);
        saveDeskLayout();
        syncPageHint(fromSlide);
        toast('已移出此页（可在其他页「添加卡片」找回）');
      }
    }, {
      noInput: true,
      pills: pills,
    });
  };
  // 刷新所有设置行右侧状态文本
  const syncCardBgUIs = () => {
    CARD_BG_TYPES.forEach(c => {
      const val = document.getElementById('card-bg-val-' + c.type);
      if (!val) return;
      const img = store.get('card-bg-' + c.type);
      const pct = maskPctOf(c.type);
      const maskTxt = pct === 0 ? '原图' : '遮罩' + pct + '%';
      val.textContent = img ? '已设置 · ' + maskTxt : '';
    });
  };
  // 绑定每类卡片的设置行
  CARD_BG_TYPES.forEach(c => {
    const row = document.getElementById('row-card-bg-' + c.type);
    if (!row) return;
    syncCardBgUIs();
    row.addEventListener('click', () => openCardBgMenu(c.type, c.name));
  });
  // v3.6.x：装修模式下点击卡片直接上传背景（与自定义图标同交互）。
  // 用事件委托绑定在 #page-phone 上：仅 decor-on 装修模式生效，点击 [data-card-bg] 卡片弹设置菜单。
  // 注意 stopPropagation——装修模式下点击卡片不触发卡片自身功能（备忘/心情/打卡/音乐等），
  // 与「装修模式点击图标换图、不打开功能」的既有行为一致。
  const phonePageEl = document.getElementById('page-phone');
  if (phonePageEl) {
    phonePageEl.addEventListener('click', (e) => {
      if (!phonePageEl.classList.contains('decor-on')) return;
      // 组件库面板 / 装饰完成条 / 新增页「+ 添加卡片」点击不拦截
      if (e.target.closest('.desk-lib') || e.target.closest('.decor-bar') || e.target.closest('.desk-page-add')) return;
      const card = e.target.closest('[data-card-bg]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const type = card.getAttribute('data-card-bg');
      const def = CARD_BG_TYPES.find(c => c.type === type);
      // 传入 card 作为 anchorEl：菜单额外包含 上移/下移/移出此页
      openCardBgMenu(type, def ? def.name : type, card);
    }, true);
  }

  // ===== v3.6.x：桌面页面管理（新增空白主页 / 删除 / 每页独立背景图） =====
  // 页数存储：desk-page-count（默认 2，上限 5）；每页背景图：page-bg-<idx>（dataURL）
  const pagesBox = document.getElementById('desktop-pages');
  const pagesVal = document.getElementById('desk-pages-val');
  const delPageRow = document.getElementById('row-desk-del-page');
  const pageBgsBox = document.getElementById('desk-page-bgs');
  const DESK_PAGE_MAX = 5;
  // 前两页是核心页（情侣空间 + 音乐播放器），只可增删第 3 页及以后的空白页
  const DESK_PAGE_MIN = 2;
  const deskPageCount = () => {
    const v = parseInt(store.get('desk-page-count'), 10);
    return isNaN(v) || v < DESK_PAGE_MIN ? DESK_PAGE_MIN : Math.min(v, DESK_PAGE_MAX);
  };
  // v3.10.x：每页背景应用（从 buildDeskPages 抽出）——页面背景是大图键
  //（>200KB 只存 IndexedDB，不进 localStorage），启动渲染时回填往往未完成读到空，
  // 需要在 mochi-restore-done / 切换联系人后单独重应用，否则整页背景"丢失"变默认。
  const applyPageBgs = () => {
    if (!pagesBox) return;
    const slides = pagesBox.querySelectorAll('.page-slide');
    const n = Math.min(slides.length, deskPageCount());
    for (let i = 0; i < n; i++) {
      const s = slides[i];
      if (!s) continue;
      const bg = sanitizeBg('page-bg-' + i, BG_SAFE_LIMIT);
      if (bg && typeof bg === 'string' && bg.length > 2) {
        s.style.backgroundImage = 'url("' + bg + '")';
        s.style.backgroundSize = 'cover';
        s.style.backgroundPosition = 'center';
      } else {
        s.style.backgroundImage = '';
        s.style.backgroundSize = '';
        s.style.backgroundPosition = '';
      }
    }
  };
  // 重建桌面页结构：保证页数 = desk-page-count，新增页为空 page-slide
  const buildDeskPages = () => {
    if (!pagesBox) return;
    const target = deskPageCount();
    const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
    while (slides.length > target) {
      const delIdx = slides.length - 1;
      const s = slides.pop();
      if (s && s.parentNode) {
        // 该页上的组件移回隐藏池（不随页面删除丢失）
        // 只移动顶层组件——嵌套子组件（如 p3apps 内的 app-period/app-accounting）
        // 随父组件整体移动，避免拆散导致空壳
        const pool = ensureWidgetPool();
        const widgetNodes = Array.prototype.slice.call(s.querySelectorAll('[data-desk-widget]'));
        widgetNodes.forEach(node => {
          let parent = node.parentElement, nested = false;
          while (parent && parent !== s) {
            if (parent.hasAttribute && parent.hasAttribute('data-desk-widget')) { nested = true; break; }
            parent = parent.parentElement;
          }
          if (!nested) pool.appendChild(node);
        });
        // 该页上的图片组件直接删除（图片不跨页保留，避免索引错位）
        removeDeskImagesOnPage(delIdx);
        removeDeskTextsOnPage(delIdx);
        removeDeskCountdownsOnPage(delIdx);
        s.parentNode.removeChild(s);
        // v3.7.x 修复：删页后收缩已存布局——此前 desk-layout 仍保留被删页条目，
        // 之后新增页并刷新会把旧页组件插回新页（组件"复活"）。只在已有自定义布局时
        // 收缩；默认布局（desk-layout 为空）不写，保持原「保持 DOM 原状」语义。
        try { if (deskLayout()) saveDeskLayout(); } catch (e) {}
      }
    }
    for (let i = slides.length; i < target; i++) {
      const s = document.createElement('div');
      s.className = 'page-slide desk-page';
      s.dataset.desk = String(i);
      // 空白页装修提示 + 「+ 添加卡片」（仅新增页，第 0/1 页是核心页）
      const hint = document.createElement('div');
      hint.className = 'desk-page-hint';
      hint.textContent = '空白主页 · 可上传整页背景图';
      const addBtn = document.createElement('div');
      addBtn.className = 'desk-page-add';
      addBtn.textContent = '+ 添加卡片';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = Array.prototype.indexOf.call(pagesBox.querySelectorAll('.page-slide'), s);
        openDeskLib(s, curIdx);
      });
      s.appendChild(hint);
      s.appendChild(addBtn);
      pagesBox.appendChild(s);
      slides.push(s);
    }
    // 应用每页背景图（v3.10.x：抽出为 applyPageBgs，供回填完成后/切桌面后单独重应用）
    applyPageBgs();
    if (window.deskRebuild) window.deskRebuild();
    syncPagesUI();
    setTimeout(function () { if (window.ensureP3) window.ensureP3(); }, 50);
  };
  // 同步页面管理 UI（页数显示 + 每页背景行列表 + 删除按钮显隐）
  const syncPagesUI = () => {
    const n = deskPageCount();
    if (pagesVal) pagesVal.textContent = '共 ' + n + ' 页';
    if (delPageRow) delPageRow.hidden = n <= 1;
    if (!pageBgsBox) return;
    pageBgsBox.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'set-row' + (i >= 2 ? '' : '');
      const ico = document.createElement('div');
      ico.className = 'ico';
      ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/></svg>';
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.textContent = (i === 0 ? '首页' : '第 ' + (i + 1) + ' 页') + '背景图';
      const val = document.createElement('div');
      val.className = 'val';
      val.id = 'page-bg-val-' + i;
      const syncRowUI = () => {
        const bg = store.get('page-bg-' + i);
        val.textContent = bg ? '已设置' : '';
      };
      syncRowUI();
      row.appendChild(ico); row.appendChild(txt); row.appendChild(val);
      row.addEventListener('click', () => {
        const bg = store.get('page-bg-' + i);
        const pickPageBg = () => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*';
          input.onchange = () => {
            const f = input.files && input.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              // v3.10.x：压缩并保证 <=4.5MB（渲染防护 6MB 留余量），超限自动降边长重压
              compressImageFit(reader.result, phoneBgMaxSide(), 4.5 * 1024 * 1024).then(data => {
                if (!data) { toast('图片过大或格式不支持，请换一张小图'); return; }
                store.set('page-bg-' + i, data);
                buildDeskPages();
                syncRowUI();
                toast((i === 0 ? '首页' : '第 ' + (i + 1) + ' 页') + '背景已设置');
              });
            };
            reader.readAsDataURL(f);
          };
          input.click();
        };
        if (bg && window.openModal) {
          window.openModal((i === 0 ? '首页' : '第 ' + (i + 1) + ' 页') + '背景图', '', (v) => {
            if (v === '1') pickPageBg();
            else if (v === '2') {
              store.remove('page-bg-' + i);
              buildDeskPages();
              syncRowUI();
              toast('已恢复默认');
            }
          }, { noInput: true, pills: [{ label: '更换图片', value: '1' }, { label: '清除图片', value: '2' }] });
        } else {
          pickPageBg();
        }
      });
      pageBgsBox.appendChild(row);
    }
  };
  const addPageRow = document.getElementById('row-desk-add-page');
  if (addPageRow) {
    addPageRow.addEventListener('click', () => {
      const n = deskPageCount();
      if (n >= DESK_PAGE_MAX) { toast('最多 ' + DESK_PAGE_MAX + ' 页'); return; }
      store.set('desk-page-count', String(n + 1));
      buildDeskPages();
      toast('已新增第 ' + (n + 1) + ' 页');
    });
  }
  if (delPageRow) {
    delPageRow.addEventListener('click', () => {
      const n = deskPageCount();
      if (n <= DESK_PAGE_MIN) { toast('核心页不可删除'); return; }
      if (window.openModal) {
        window.openModal('删除最后一页？', '', (v) => {
          if (v === 'ok') {
            store.remove('page-bg-' + (n - 1));
            store.set('desk-page-count', String(n - 1));
            buildDeskPages();
            toast('已删除');
          }
        }, { noInput: true, staticText: '第 ' + n + ' 页上的卡片会移回隐藏池，可随时在其他页「添加卡片」找回' });
      } else {
        store.remove('page-bg-' + (n - 1));
        store.set('desk-page-count', String(n - 1));
        buildDeskPages();
      }
    });
  }
  const resetDeskRow = document.getElementById('row-desk-reset');
  if (resetDeskRow) {
    resetDeskRow.addEventListener('click', () => {
      window.openModal('恢复默认桌面', '将恢复桌面卡片布局与页数，桌面恢复为默认三页（每页已设置的背景图与图标不受影响）。确定继续？', (v) => {
        if (v !== '1') return;
        // v3.10.x 修复：恢复默认后第三页「经期」小组件消失——原先 remove 掉
        // desk-page-count 后按默认 2 页收缩，静态第三页被整页删除，desk-period
        // 与 p3apps 一起移进隐藏池；ensureP3 只找回 p3apps（图标组），desk-period
        // 留在池里不再显示。改为直接恢复为模板默认的 3 页：第三页未被删时
        // desk-period 原样保留；若此前第三页已被用户删掉（组件在池里），由下方
        // ensureP3 + 找回逻辑把 desk-period / p3apps 放回重建的第三页。
        try { store.set('desk-page-count', '3'); } catch (e) {}
        try { store.remove('desk-layout'); } catch (e) {}
        buildDeskPages();
        // v3.11.x 修复：恢复默认后老 desk-layout 里没有的新版组件（如第三页喝水/
        // 吃什么/同频/番茄钟等动态注入图标）会被 applyDeskLayout 收进隐藏池，
        // 只保证页数/找回 p3apps/desk-period 仍看不到它们 → 把池中模板默认应有的
        // 组件逐个找回默认页；仅桌面小组件（desk-clock/calendar/timer/anniv，
        // 模板本就默认在池中「未添加」）保持原状。
        try {
          var wpool = document.getElementById('desk-widget-pool');
          if (wpool) {
            var poolWidgets = Array.prototype.slice.call(wpool.querySelectorAll('[data-desk-widget]')).filter(function (nd) { return nd.parentNode === wpool; });
            var rslides2 = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
            var rp0 = rslides2[0] || null, rp1 = rslides2[1] || null, rp2 = rslides2[2] || null;
            var P3GRID = '[data-app="p3"][data-desk-widget="p3apps"]';
            // 第一遍：整组网格先回位（apps 首页组 / p2apps 第二页组 / p3apps 第三页组）
            poolWidgets.forEach(function (nd) {
              var wid = nd.getAttribute('data-desk-widget');
              if (wid === 'apps' && rp0) rp0.appendChild(nd);
              else if (wid === 'p2apps' && rp1) rp1.appendChild(nd);
              else if (wid === 'p3apps' && rp2) rp2.appendChild(nd);
            });
            // 第二遍：其余普通组件/图标回默认页
            poolWidgets.forEach(function (nd) {
              var wid = nd.getAttribute('data-desk-widget');
              if (wid === 'apps' || wid === 'p2apps' || wid === 'p3apps') return;
              if (wid === 'desk-clock' || wid === 'desk-calendar' || wid === 'desk-timer' || wid === 'desk-anniv') return;
              var tgt;
              if (wid === 'deco' || wid === 'quote-row' || wid === 'checkin') tgt = rp0;
              else if (wid === 'music' || wid === 'week' || wid === 'weekend') tgt = rp1;
              // v3.13.x：memo-row 不在此处回位——下方 setTimeout 统一放到第三页经期卡下方
              else if (wid === 'memo-row') return;
              else tgt = rp2;
              if (!tgt) return;
              if (wid.indexOf('app-') === 0) {
                var p3grid = document.querySelector(P3GRID);
                if (p3grid) p3grid.appendChild(nd);
                else tgt.appendChild(nd);
                return;
              }
              var p3g2 = document.querySelector(P3GRID);
              if (rp2 && p3g2 && p3g2.parentNode === rp2) rp2.insertBefore(nd, p3g2);
              else tgt.appendChild(nd);
            });
          }
        } catch (e) {}
        setTimeout(function () {
          try { if (window.ensureP3) window.ensureP3(); } catch (e) {}
          try {
            var dp = document.querySelector('[data-desk-widget="desk-period"]');
            var rbox = document.getElementById('desktop-pages');
            if (dp && rbox && dp.closest && dp.closest('#desk-widget-pool')) {
              var rslides = rbox.querySelectorAll('.page-slide');
              var rthird = rslides.length >= 3 ? rslides[2] : null;
              if (rthird) {
                var anchor = rthird.querySelector('[data-desk-widget="p3apps"]');
                if (anchor && anchor.parentNode === rthird) rthird.insertBefore(dp, anchor);
                else rthird.appendChild(dp);
              }
            }
          } catch (e) {}
          // v3.13.x：今日备忘/心情行放回第三页「经期卡」下方（p3apps 前）。
          // 不只看是否在池里——池外但位置不对（如已在页上但被后续找回的经期卡
          // 插到了前面）也一并校正为「紧跟经期卡之后」。
          try {
            var mr = document.querySelector('[data-desk-widget="memo-row"]');
            var rbox2 = document.getElementById('desktop-pages');
            if (mr && rbox2) {
              var rs2 = rbox2.querySelectorAll('.page-slide');
              var rt2 = rs2.length >= 3 ? rs2[2] : null;
              if (rt2) {
                var dp2 = rt2.querySelector('[data-desk-widget="desk-period"]');
                var okPos = dp2 && dp2.parentNode === rt2 && mr.parentNode === rt2 && mr.previousElementSibling === dp2;
                if (!okPos) {
                  if (dp2 && dp2.parentNode === rt2) rt2.insertBefore(mr, dp2.nextSibling);
                  else {
                    var an2 = rt2.querySelector('[data-desk-widget="p3apps"]');
                    if (an2 && an2.parentNode === rt2) rt2.insertBefore(mr, an2);
                    else rt2.appendChild(mr);
                  }
                }
              }
            }
          } catch (e) {}
        }, 100);
        toast('已恢复默认桌面');
      }, { noInput: true, pills: [{ label: '确定恢复默认', value: '1' }] });
    });
  }
  buildDeskPages();
  document.addEventListener('contact-switched', buildDeskPages);
  // v3.6.x 修复（刷新后桌面页数消失）：IndexedDB 回填完成前，desk-page-count 若只存于
  // IDB（localStorage 缺失，如旧数据迁移后/个别浏览器配额清理），首次 buildDeskPages
  // 会按默认 2 页构建，恢复完成后页数/新增页不会自动重建 → 刷新后「新增的页消失」。
  // 恢复完成事件后重建一次：页数未变时幂等（不动已存在页内容，仅重设背景/圆点）。
  const rebuildDeskWhenReady = () => {
    try { buildDeskPages(); } catch (e) {}
    // v3.14.x：回填完成后补应用组件布局——desk-layout 的 localStorage 副本可能因配额/
    // 浏览器清理而缺失（只存于 IndexedDB），首次 applyDeskLayout（脚本加载期，回填未完）
    // 读到空不应用；此前只重建页数不重排组件 → 用户装修的位置整次会话失效（重启回旧位），
    // 且失效期间的 saveDeskLayout 还会把默认 DOM 固化成新布局。此处补一次应用（幂等）；
    // 用 window 引用避免脚本顺序上的 TDZ 问题。
    try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
  };
  if (window.__mochiDataReady) rebuildDeskWhenReady();
  else {
    try {
      document.addEventListener('mochi-restore-done', function h() {
        document.removeEventListener('mochi-restore-done', h);
        rebuildDeskWhenReady();
      });
    } catch (e) { rebuildDeskWhenReady(); }
  }
  // v3.6.x：图片组件——启动渲染 + 点击/查看器初始化 + 切联系人重渲染
  renderDeskImages();
  setupDeskImageClick();
  setupDeskImageViewerClose();
  document.addEventListener('contact-switched', renderDeskImages);
  // v3.7.x：文字/倒计时组件——启动渲染 + 点击初始化 + 切联系人重渲染
  renderDeskTexts();
  setupDeskTextClick();
  renderDeskCountdowns();
  setupDeskCountdownClick();
  document.addEventListener('contact-switched', renderDeskTexts);
  document.addEventListener('contact-switched', renderDeskCountdowns);

  // ===== v3.6.x：卡片自由摆放（装修模式：上移/下移/移除；新增页可添加卡片） =====
  // 组件 id 列表（对应 template.html 中 [data-desk-widget]）；组件节点唯一，
  // 「添加」= 把节点移动到目标页（节点移动不重建，内部事件绑定保留）
  const WIDGET_IDS = ['deco', 'quote-row', 'checkin', 'apps', 'music', 'p2apps', 'memo-row', 'week', 'weekend', 'desk-clock', 'desk-calendar', 'desk-timer', 'desk-anniv', 'desk-period',
    'app-chat', 'app-group-chat', 'app-home', 'app-mail', 'app-feed', 'app-calendar', 'app-memory', 'app-divination', 'app-note', 'app-music', 'app-stats', 'app-interact', 'app-checkin', 'p3apps', 'app-period', 'app-accounting', 'app-garden',     'app-tongpin', 'app-shenshou', 'app-water', 'app-eat', 'app-pomo'];
  const WIDGET_NAMES = {
    deco: '纪念日卡', 'quote-row': '今日情话 / 已摸鱼', checkin: '打卡横幅', apps: '功能图标(整组)',
    music: '音乐播放器', p2apps: '第二页功能图标(整组)', 'memo-row': '今日备忘 / 心情', week: '本周日常', weekend: '周末倒计时',
    'desk-clock': '时钟', 'desk-calendar': '月历', 'desk-timer': '计时器', 'desk-anniv': '纪念日倒计时', 'desk-period': '经期倒计时',
    'app-chat': '聊天图标', 'app-group-chat': '群聊图标', 'app-home': '主页图标', 'app-mail': '信箱图标', 'app-feed': '朋友圈图标',
    'app-calendar': '日历图标', 'app-memory': '纪念图标', 'app-divination': '占卜图标', 'app-note': '收藏图标',
    'app-music': '音乐图标', 'app-stats': '聊天统计图标', 'app-interact': '提问记录图标', 'app-checkin': '寻踪图标',
    'p3apps': '第三页功能图标(整组)', 'app-period': '经期记录图标', 'app-accounting': '记账图标', 'app-garden': '花园图标',     'app-tongpin': '同频图标', 'app-shenshou': '伸手图标', 'app-water': '喝水图标', 'app-eat': '吃什么图标', 'app-pomo': '番茄钟图标',
  };
  // v3.7.x：装修模式组件库静态预览缩略图（glass 质感 + 真实 SVG 图标，不依赖真实数据/事件）
  const PREV_BOX = 'display:flex;align-items:center;justify-content:center;width:78px;height:58px;border-radius:10px;background:linear-gradient(135deg,#fff,#f6f6f6);border:1px solid rgba(0,0,0,.07);box-shadow:0 1px 3px rgba(0,0,0,.06);flex-shrink:0;overflow:hidden;padding:4px;box-sizing:border-box';
  const _av = '<span style="width:15px;height:15px;border-radius:50%;background:#f2f2f2;display:flex;align-items:center;justify-content:center"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></span>';
  const _card = (top) => '<span style="width:26px;height:34px;border-radius:6px;background:#fff;border:1px solid rgba(0,0,0,.07);display:flex;flex-direction:column;padding:4px 3px;gap:2px;box-sizing:border-box"><span style="font-size:6px;color:#bbb;font-weight:600">' + top + '</span><span style="height:3px;border-radius:2px;background:#e0e0e0;width:70%"></span><span style="height:3px;border-radius:2px;background:#eee;width:55%"></span></span>';
  const _ico = (svg) => '<span style="display:flex;align-items:center;justify-content:center">' + svg + '</span>';
  const _appIcoPrev = (label) => '<span style="display:flex;flex-direction:column;align-items:center;gap:3px"><span style="width:26px;height:26px;border-radius:8px;background:#f4f4f4;display:flex;align-items:center;justify-content:center"><span style="width:14px;height:14px;border-radius:4px;background:#ddd"></span></span><span style="font-size:6px;color:#999">' + label + '</span></span>';
  const _appIcos = [
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11.5L12 4l8.5 7.5"/><path d="M5.5 10v10h13V10"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13.5" rx="2.5"/><path d="M3.5 7.5L12 13l8.5-5.5"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0112 7.1a4.9 4.9 0 017.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 8.5l1.15 2.4 2.4 1.15-2.4 1.15L12 15.6l-1.15-2.4-2.4-1.15 2.4-1.15z"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 011 1v16l-6.5-4-6.5 4v-16a1 1 0 011-1z"/></svg>',
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  ];
  const WIDGET_PREV_HTML = {
    deco: '<span style="display:flex;gap:3px;align-items:center">' + _av + '<svg width="10" height="10" viewBox="0 0 24 24" fill="#ccc"><path d="M12 21s-7-4.5-9-8.5a4.5 4.5 0 019-3 4.5 4.5 0 019 3c-2 4-9 8.5-9 8.5z"/></svg>' + _av + '</span>',
    'quote-row': '<span style="display:flex;gap:4px">' + _card('情话') + _card('摸鱼') + '</span>',
    checkin: '<span style="display:flex;align-items:center;gap:4px;width:64px;height:22px;padding:0 6px;border-radius:11px;background:#fff;border:1px solid rgba(0,0,0,.07);box-sizing:border-box"><svg width="9" height="9" viewBox="0 0 24 24" fill="#ccc"><path d="M12 21s-7-4.5-9-8.5a4.5 4.5 0 019-3 4.5 4.5 0 019 3c-2 4-9 8.5-9 8.5z"/></svg><span style="flex:1;font-size:6px;color:#999">一起摸鱼</span><span style="font-size:6px;color:#fff;background:#111;padding:1px 5px;border-radius:5px">打卡</span></span>',
    apps: '<span style="display:grid;grid-template-columns:repeat(3,14px);gap:4px">' + _appIcos.map(_ico).join('') + '</span>',
    music: '<span style="display:flex;gap:5px;align-items:center;width:64px"><span style="width:26px;height:26px;border-radius:7px;background:#f4f4f4;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span><span style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="height:3px;border-radius:2px;background:#ccc;width:90%"></span><span style="height:3px;border-radius:2px;background:#eee;width:60%"></span><span style="height:2px;border-radius:1px;background:#111;width:40%"></span></span></span>',
    p2apps: '<span style="display:grid;grid-template-columns:repeat(2,16px);gap:4px">' + _appIcos.slice(0, 4).map(_ico).join('') + '</span>',
    'memo-row': '<span style="display:flex;gap:4px">' + _card('备忘') + _card('心情') + '</span>',
    week: '<span style="display:flex;gap:3px;align-items:center">' + ['日','一','二','三','四','五','六'].map((d, i) => '<span style="width:7px;height:7px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:5px;' + (i === 3 ? 'background:#111;color:#fff;font-weight:700' : 'background:#f0f0f0;color:#bbb') + '">' + d + '</span>').join('') + '</span>',
    weekend: '<span style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:56px;height:38px;border-radius:8px;background:#fff;border:1px solid rgba(0,0,0,.07);gap:1px"><span style="font-size:7px;color:#bbb">离周末还有</span><span style="font-size:13px;font-weight:700;color:#333">3 天</span></span>',
    'desk-clock': '<span style="display:flex;flex-direction:column;align-items:center;gap:2px"><span style="font-size:18px;font-weight:700;color:#222;letter-spacing:1px;font-variant-numeric:tabular-nums">12:30</span><span style="font-size:7px;color:#aaa">星期一 · 8 月 19 日</span></span>',
    'desk-calendar': '<span style="display:grid;grid-template-columns:repeat(7,6px);gap:2px">' + Array.from({ length: 21 }, (_, i) => '<span style="width:6px;height:6px;border-radius:2px;' + (i === 10 ? 'background:#111' : 'background:#eee') + '"></span>').join('') + '</span>',
    'desk-timer': '<span style="display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:14px;font-weight:700;color:#222;font-variant-numeric:tabular-nums">00:00.0</span><span style="display:flex;gap:3px"><span style="font-size:5px;color:#666;background:#f0f0f0;padding:1px 4px;border-radius:4px">开始</span><span style="font-size:5px;color:#666;background:#f0f0f0;padding:1px 4px;border-radius:4px">重置</span></span></span>',
    'desk-anniv': '<span style="display:flex;flex-direction:column;align-items:center;gap:1px"><span style="font-size:7px;color:#bbb">距下一个纪念日</span><span style="font-size:15px;font-weight:700;color:#333">30 天</span><span style="font-size:6px;color:#999">生日 · 9 月 18 日</span></span>',
    'desk-period': '<span style="display:flex;flex-direction:column;align-items:center;gap:1px"><span style="font-size:7px;color:#e85a8f">距下次经期</span><span style="font-size:15px;font-weight:700;color:#e85a8f">5 天</span><span style="font-size:6px;color:#999">周期第 23 天</span></span>',
    'app-chat': _appIcoPrev('聊天'), 'app-group-chat': _appIcoPrev('群聊'), 'app-home': _appIcoPrev('主页'), 'app-mail': _appIcoPrev('信箱'), 'app-feed': _appIcoPrev('朋友圈'),
    'app-calendar': _appIcoPrev('日历'), 'app-memory': _appIcoPrev('纪念'), 'app-divination': _appIcoPrev('占卜'), 'app-note': _appIcoPrev('收藏'),
    'app-music': _appIcoPrev('音乐'), 'app-stats': _appIcoPrev('统计'), 'app-interact': _appIcoPrev('提问'), 'app-checkin': _appIcoPrev('寻踪'),
    'app-period': _appIcoPrev('经期'), 'app-accounting': _appIcoPrev('记账'), 'app-garden': _appIcoPrev('花园'),     'app-tongpin': _appIcoPrev('同频'), 'app-shenshou': _appIcoPrev('伸手'), 'app-water': _appIcoPrev('喝水'), 'app-eat': _appIcoPrev('吃什么'), 'app-pomo': _appIcoPrev('番茄钟'), 'p3apps': _appIcoPrev('经期'),
  };
  // 隐藏池：被移除的组件暂存（display:none），可从组件库重新添加
  function ensureWidgetPool() {
    let pool = document.getElementById('desk-widget-pool');
    if (!pool) {
      pool = document.createElement('div');
      pool.id = 'desk-widget-pool';
      pool.style.display = 'none';
      document.body.appendChild(pool);
    }
    return pool;
  }
  // 读布局：desk-layout = JSON 数组（每页一个 widget id 数组）；无 → null（保持 DOM 原状）
  const deskLayout = () => {
    try {
      const v = store.get('desk-layout');
      if (v) { const a = JSON.parse(v); if (Array.isArray(a)) return a; }
    } catch (e) {}
    return null;
  };
  // 保存布局（按当前 DOM 状态，含隐藏池外的所有页）
  const saveDeskLayout = () => {
    const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
    const lay = slides.map(s => Array.prototype.slice.call(s.querySelectorAll('[data-desk-widget]')).map(n => n.getAttribute('data-desk-widget')));
    store.set('desk-layout', JSON.stringify(lay));
    return lay;
  };
  // v3.6.x：空白页提示显隐——有组件/图片的页内联隐藏（盖掉装修态 CSS 的 display:block），
  // 空页恢复为空（由 CSS 决定：仅装修模式显示，退出装修后空白页保持干净）。
  // 注：syncPageHint 声明在 IIFE 顶部（启动阶段 applyDeskLayout 会调用）
  // 按布局重建：把组件节点移动到对应页（默认布局保持 DOM 原状，不写布局）
  // v3.8.x：顺序修复——原实现只移动「不在本页」的节点，已在页内的节点即使
  // 顺序与布局不一致也不重排（刷新后用户排的顺序被 template 默认顺序覆盖）；
  // 且第 0/1 页没有 .desk-page-add，移入节点被 append 到页尾，顺序必然错乱。
  // 现在分两步：先移入不在本页的节点，再按布局数组顺序校正本页 widget 顺序
  //（顺序已一致则跳过，避免无谓 DOM 抖动；图片/文字组件有自己的排序存储，
  // 不在 desk-layout 内，重排时保持其节点不动）。
  const applyDeskLayout = () => {
    const lay = deskLayout();
    if (!lay) return;
    const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
    // v3.7.x：单个功能图标仍在 app-grid 内（未被移出作独立组件）时跳过——
    // 它由 app-grid 容器管理（grid 4 列横排），移到 slide 会脱离 grid 布局
    // 变成竖向排列（刷新后图标从横变竖）。与池逻辑的保护一致。
    const inGrid = (wid) => {
      if (wid.indexOf('app-') === 0) {
        const n = document.querySelector('[data-desk-widget="' + wid + '"]');
        return !!(n && n.closest('.app-grid'));
      }
      return false;
    };
    lay.forEach((pageWidgets, pi) => {
      const slide = slides[pi];
      if (!slide) return;
      const wids = pageWidgets || [];
      // 1) 移入不在本页的节点（插入到「+ 添加卡片」按钮之前）
      wids.forEach(wid => {
        if (inGrid(wid)) return;
        const node = document.querySelector('[data-desk-widget="' + wid + '"]');
        if (!node || node.parentNode === slide) return;
        const addBtn = slide.querySelector('.desk-page-add');
        if (addBtn) slide.insertBefore(node, addBtn);
        else slide.appendChild(node);
      });
      // 2) 顺序校正：比对当前 DOM 顺序与布局数组顺序，不一致才重排
      const want = wids.filter(wid => {
        if (inGrid(wid)) return false;
        const n = document.querySelector('[data-desk-widget="' + wid + '"]');
        return !!(n && n.parentNode === slide);
      });
      const cur = Array.prototype.slice.call(slide.querySelectorAll('[data-desk-widget]'))
        .map(n => n.getAttribute('data-desk-widget'))
        .filter(w => want.indexOf(w) >= 0);
      if (cur.join('|') !== want.join('|') && want.length) {
        const addBtn = slide.querySelector('.desk-page-add');
        want.forEach(wid => {
          const node = document.querySelector('[data-desk-widget="' + wid + '"]');
          if (!node) return;
          if (addBtn) slide.insertBefore(node, addBtn);
          else slide.appendChild(node);
        });
      }
      syncPageHint(slide);
    });
    // 布局外的组件 → 隐藏池
    const pool = ensureWidgetPool();
    WIDGET_IDS.forEach(wid => {
      // v3.7.x：apps/p2apps 老兼容——之前 app-grid 没 data-desk-widget，老 layout 不含它们；
      // 加 data-desk-widget 后若按常规移池会把老用户的功能图标藏掉，故跳过池逻辑保持原位
      if (wid === 'apps' || wid === 'p2apps') return;
      const node = document.querySelector('[data-desk-widget="' + wid + '"]');
      if (!node) return;
      // v3.7.x：单个功能图标仍在 app-grid 内（未被移出）时跳过池逻辑，保持原位
      if (wid.indexOf('app-') === 0 && node.closest('.app-grid')) return;
      const inLay = lay.some(page => (page || []).indexOf(wid) >= 0);
      if (!inLay && node.parentNode !== pool) pool.appendChild(node);
    });
    if (window.deskRebuild) window.deskRebuild();
    try { renderDeskWidgets(); } catch (e) {}
  };
  applyDeskLayout();
  window.applyDeskLayout = applyDeskLayout;
  document.addEventListener('contact-switched', applyDeskLayout);
  // v3.10.x：经期倒计时组件默认放第三页顶部（template 已置）。
  // 已装修过的用户（desk-layout 存在且不含 desk-period）自动加新页放 desk-period，不破坏现有布局。
  function ensureDeskPeriod() {
    const lay = deskLayout();
    const node = document.querySelector('[data-desk-widget="desk-period"]');
    if (!node) return;
    if (!lay) {
      // 新用户：desk-period 应在第三页顶部（template 默认），被其他联系人移走则移回
      const slides = pagesBox.querySelectorAll('.page-slide');
      const p3 = slides[2];
      if (p3 && node.parentNode !== p3) {
        const p3apps = p3.querySelector('[data-desk-widget="p3apps"]');
        if (p3apps) p3.insertBefore(node, p3apps);
        else p3.appendChild(node);
        try { renderDeskWidgets(); } catch (e) {}
      }
      return;
    }
    if (lay.some(page => (page || []).indexOf('desk-period') >= 0)) return; // 已含
    if (deskPageCount() >= DESK_PAGE_MAX) return; // 达上限不加页
    store.set('desk-page-count', String(deskPageCount() + 1));
    buildDeskPages();
    const slides = pagesBox.querySelectorAll('.page-slide');
    const newSlide = slides[slides.length - 1];
    if (!newSlide) return;
    const addBtn = newSlide.querySelector('.desk-page-add');
    if (addBtn) newSlide.insertBefore(node, addBtn);
    else newSlide.appendChild(node);
    const newLay = lay.slice();
    while (newLay.length < slides.length - 1) newLay.push([]);
    newLay.push(['desk-period']);
    store.set('desk-layout', JSON.stringify(newLay));
    if (window.deskRebuild) window.deskRebuild();
    try { renderDeskWidgets(); } catch (e) {}
  }
  ensureDeskPeriod();
  // v3.15.x 修复：全新冷启动时序里 desk-period 曾流失进隐藏池——buildDeskPages 按
  // desk-page-count 默认 2 页收缩时把静态第三页整页删进池，第三页由 ensureP3 在
  // setTimeout(50) 重建，而 ensureDeskPeriod 只在 0ms 同步跑一次（当时 slides[2] 尚不
  // 存在 → 直接 return），此后无人再补位，经期卡从此留在池里，第三页缺首卡。
  // 补两次延迟重跑（200/600ms，均晚于 ensureP3 的 50ms）：!lay 分支只在「新用户且
  // 节点不在第三页」时移回，已装修用户走原 lay 分支语义不变，不破坏删除意图。
  // 重跑后若 memo-row（150ms 兜底先落位）排在了经期卡前面，校正回模板默认顺序
  // 「经期卡 → 备忘心情行 → p3apps」。
  function ensureDeskPeriodP3Order() {
    ensureDeskPeriod();
    try {
      const p3 = pagesBox.querySelectorAll('.page-slide')[2];
      if (!p3) return;
      const dp = p3.querySelector('[data-desk-widget="desk-period"]');
      const mr = p3.querySelector('[data-desk-widget="memo-row"]');
      if (dp && mr && Array.prototype.indexOf.call(p3.children, dp) > Array.prototype.indexOf.call(p3.children, mr)) {
        p3.insertBefore(dp, mr);
      }
    } catch (e) {}
  }
  setTimeout(ensureDeskPeriodP3Order, 200);
  setTimeout(ensureDeskPeriodP3Order, 600);
  document.addEventListener('contact-switched', ensureDeskPeriod);
  // v3.13.x：今日备忘/心情卡默认位置改为第三页「经期倒计时」下方（template 已移）。
  // 老用户 desk-layout 里 memo-row 在第一/二页的自动迁到第三页经期卡下方，其余布局不动；
  // 已在第三页的不动；用户手动移除过（隐藏池）的尊重不找回。每联系人桌面独立迁移
  //（desk-layout 按桌面命名空间存储，切联系人时各自触发）。
  function ensureMemoRowP3() {
    const node = document.querySelector('[data-desk-widget="memo-row"]');
    if (!node || !pagesBox) return;
    const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
    const p3 = slides[2];
    if (!p3) return;
    const lay = deskLayout();
    const placeUnderPeriod = () => {
      const dp = p3.querySelector('[data-desk-widget="desk-period"]');
      if (dp && dp.parentNode === p3) p3.insertBefore(node, dp.nextSibling);
      else {
        const grid = p3.querySelector('[data-desk-widget="p3apps"]');
        if (grid && grid.parentNode === p3) p3.insertBefore(node, grid);
        else p3.appendChild(node);
      }
    };
    if (!lay) {
      // 未装修：模板默认就在第三页经期卡下方；被删页等流程挪走/进池则移回
      if (node.closest('.page-slide') !== p3) placeUnderPeriod();
      return;
    }
    const at = lay.findIndex(page => (page || []).indexOf('memo-row') >= 0);
    if (at === 2) return; // 已在第三页（顺序由 applyDeskLayout 按存储维护）
    if (at < 0) return;   // 不在任何页 = 用户已移除进池，不找回
    // 从原页数组摘除，插入第三页数组（经期卡后一位；无则放最前）
    lay[at] = (lay[at] || []).filter(w => w !== 'memo-row');
    const p3w = (lay[2] || []).slice();
    const dpAt = p3w.indexOf('desk-period');
    if (dpAt >= 0) p3w.splice(dpAt + 1, 0, 'memo-row');
    else p3w.unshift('memo-row');
    while (lay.length < 3) lay.push([]);
    lay[2] = p3w;
    store.set('desk-layout', JSON.stringify(lay));
    placeUnderPeriod();
    try { window.applyDeskLayout(); } catch (e) {} // 重跑一次布局应用刷新各页提示与顺序
  }
  ensureMemoRowP3();
  setTimeout(ensureMemoRowP3, 150); // 等 buildDeskPages 的 setTimeout(ensureP3) 补齐第三页后兜底一次
  document.addEventListener('contact-switched', ensureMemoRowP3);

  // ===== v3.13.x：第二页改版迁移（仿 ensureMemoRowP3 先例） =====
  // ① 功能图标组（p2apps：音乐/聊天统计/提问记录/寻踪/花园/此间 + 动态注入的同频/伸手）
  //    默认位置改为「周末倒计时」（摸鱼组件）下方——template 已移；
  //    老用户 desk-layout 里 p2apps 排在 weekend 前面的自动换序到其后（DOM+存储同步改写），
  //    已在其后的不动；两组件不在同一页 / weekend 已被用户移除进池的尊重现状不强行挪。
  // ② 第三页 p3apps 网格里的 花园/同频/伸手 图标归入第二页网格第二排（同频/伸手由 p2-features
  //    注入时直接落第二页，见该文件；此处兜底搬运仍留在第三页网格内的默认位节点）。
  //    喝水已默认移至第三页，绝不再拖回第二页。只搬仍位于 .p3-grid 内的节点——
  //    用户手动拖出成独立组件 / 移除进隐藏池的尊重不找回。
  // 每联系人桌面独立（desk-layout 按桌面命名空间存储，切联系人各自触发）。
  function ensureP2SecondRowIcons() {
    const p2g = document.querySelector('.app-grid.p2-grid');
    const p3g = document.querySelector('.app-grid.p3-grid');
    if (!p2g) return;
    let moved = false;
    ['app-tongpin', 'app-shenshou', 'app-garden'].forEach(wid => {
      const n = document.querySelector('[data-desk-widget="' + wid + '"]');
      if (!n || !p3g || n.parentNode !== p3g) return;
      p2g.appendChild(n); moved = true;
    });
    if (!moved) return;
    // 归位后按新默认排序追加在已有图标之后：花园 此间 同频 伸手（此间为模板静态图标，
    // 在 p2-grid 内；喝水留在第三页）
    ['app-garden', 'app-cjian', 'app-tongpin', 'app-shenshou'].forEach(wid => {
      const n = document.querySelector('[data-desk-widget="' + wid + '"]');
      if (n && n.parentNode === p2g) p2g.appendChild(n);
    });
  }
  function ensureP2AppsBelowWeekend() {
    const node = document.querySelector('[data-desk-widget="p2apps"]');
    const we = document.querySelector('[data-desk-widget="weekend"]');
    ensureP2SecondRowIcons();
    if (!node || !we) return;
    const domBefore = (() => {
      const s1 = node.closest('.page-slide');
      return !!(s1 && s1 === we.closest('.page-slide') &&
        Array.prototype.indexOf.call(s1.children, node) < Array.prototype.indexOf.call(s1.children, we));
    })();
    const lay = deskLayout();
    if (!lay) {
      // 未装修：模板默认即在 weekend 后；被其他流程挪到前面则校正 DOM（恢复默认桌面后也走这里兜底）
      if (domBefore) node.parentNode.insertBefore(node, we.nextSibling);
      return;
    }
    const pi = lay.findIndex(page => (page || []).indexOf('weekend') >= 0);
    const pj = lay.findIndex(page => (page || []).indexOf('p2apps') >= 0);
    if (pi < 0 || pj !== pi) return; // weekend 不在任何页(已移除)或两组不在同一页：尊重现状
    const pw = lay[pi] || [];
    const wi = pw.indexOf('weekend'), ni = pw.indexOf('p2apps');
    if (ni < 0 || wi < 0 || ni > wi) {
      // 存储已正确但 DOM 仍错位（如老版本写入顺序）：只校正 DOM
      if (domBefore) node.parentNode.insertBefore(node, we.nextSibling);
      return;
    }
    // 存储换序：摘出 p2apps 插到 weekend 后一位
    lay[pi] = pw.filter(w => w !== 'p2apps');
    lay[pi].splice((lay[pi].indexOf('weekend')) + 1, 0, 'p2apps');
    store.set('desk-layout', JSON.stringify(lay));
    if (domBefore || node.closest('.page-slide') !== we.closest('.page-slide')) {
      we.parentNode.insertBefore(node, we.nextSibling);
    }
    try { window.applyDeskLayout(); } catch (e) {} // 重跑一次布局应用刷新各页提示与顺序
  }
  ensureP2AppsBelowWeekend();
  setTimeout(ensureP2AppsBelowWeekend, 150); // 等 buildDeskPages/ensureP3 收尾后兜底一次
  window.ensureP2AppsBelowWeekend = ensureP2AppsBelowWeekend;
  window.ensureP2SecondRowIcons = ensureP2SecondRowIcons;
  document.addEventListener('contact-switched', () => { try { ensureP2AppsBelowWeekend(); } catch (e) {} });
  document.addEventListener('contact-switched', () => { applyDeskFontPct(getDeskFontPct()); applyDeskCardPct(getDeskCardPct()); });
  document.addEventListener('contact-switched', () => { const sp = getBgPresetName(); if (sp) { const p = BG_PRESETS.find(b => b.name === sp); if (p) applyPhoneBgPreset(p.css); else clearPhoneBg(); } syncBgPresetUI(); });

  // v3.14.x 修复：vivo/OPPO/真我等 Edge 内核 IndexedDB 打开/回填较慢，且 localStorage
  // 偶发写入失败——启动阶段上方 applyDeskLayout() 在恢复到 localStorage 前读到的是
  // 旧/空 desk-layout，回填完成后又没有任何机制再应用一次，于是桌面小组件"保存后
  // 重开又回到上次位置"。现在监听 mochi-restore-done（idb.js 回填完成即派发），
  // 再完整重放一次布局应用，让 IDB 权威布局最终落到 DOM。
  // 幂等安全：applyDeskLayout 仅在 DOM 顺序与存储不一致时才重排（比对 cur/want），
  // 已一致则跳过，不会抖动；不重放 ensureDeskPeriod——它在「删页进池」场景下会
  // 把用户已删除的经期卡拉回第三页（延迟执行时页面已自愈回 3 页），破坏删除意图。
  const reapplyDeskAfterRestore = () => {
    try {
      ensureMemoRowP3();
      ensureP2AppsBelowWeekend();
    } catch (e) {}
    try { window.applyDeskLayout(); } catch (e) {}
    try { if (window.ensureP2SecondRowIcons) window.ensureP2SecondRowIcons(); } catch (e) {}
  };
  let _reapplyScheduled = false;
  document.addEventListener('mochi-restore-done', () => {
    if (_reapplyScheduled) return;
    _reapplyScheduled = true;
    // 回填是分批异步的，desk-layout 可能在事件派发后一小会儿才落到 localStorage；
    // 用多次短延时覆盖不同内核的回填时序（幂等可重复调用）
    [0, 120, 400].forEach(del => setTimeout(reapplyDeskAfterRestore, del));
    // 本会话后续再收到 restore 事件不再重放（只拾重新载入时的一次消费）
    setTimeout(() => { _reapplyScheduled = false; }, 2000);
  });

  // v3.8.x：群聊模式——开启后桌面聊天按钮右侧显示「群聊」按钮，占卜按钮隐藏（移到隐藏池，
  // 可在美化装修模式组件库自由添加到其他页面）；关闭恢复原样。须在 applyDeskLayout 之后执行
  // （覆盖 desk-layout 对群聊/占卜图标的处置）。每桌面独立（group-chat-enabled，默认关闭）。
  function applyGroupChatMode() {
    try {
      // v3.10.x：group-chat-enabled 改全局存储（群聊是全局功能），读时回退旧版每桌面值完成迁移
      let en = false;
      try { const v = window.xyStore ? window.xyStore('xy-home-v2').get('group-chat-enabled') : null; if (v !== null && v !== undefined) en = v === '1'; else en = store.get('group-chat-enabled') === '1'; } catch (e) {}
      const mainGrid = document.querySelector('.app-grid[data-app="main"]');
      const pool = ensureWidgetPool();
      const chatBtn = document.querySelector('.app[data-app="chat"]');
      const gcBtn = document.querySelector('.app[data-app="group-chat"]');
      const divBtn = document.querySelector('.app[data-app="divination"]');
      const memBtn = document.querySelector('.app[data-app="memory"]');
      if (en) {
        // 群聊按钮：强制移到第一页 app-grid 的 chat 后面并显示
        if (gcBtn) {
          if (mainGrid && chatBtn && gcBtn.parentNode !== mainGrid) {
            mainGrid.insertBefore(gcBtn, chatBtn.nextSibling);
          } else if (mainGrid && chatBtn && gcBtn.previousElementSibling !== chatBtn) {
            mainGrid.insertBefore(gcBtn, chatBtn.nextSibling);
          }
          gcBtn.hidden = false;
        }
        // 占卜按钮：若仍在第一页 app-grid（原位），移到隐藏池；已在池或被用户移到其他页则不动
        if (divBtn && mainGrid && divBtn.parentNode === mainGrid) {
          pool.appendChild(divBtn);
        }
      } else {
        // 群聊按钮：移到隐藏池（脱离 app-grid 避免占位）
        if (gcBtn && gcBtn.parentNode !== pool) {
          pool.appendChild(gcBtn);
        }
        // 占卜按钮：若在隐藏池，移回第一页 app-grid 的 memory 后面（原位）；已被用户添加到其他页则不动
        if (divBtn && divBtn.parentNode === pool && mainGrid) {
          if (memBtn) mainGrid.insertBefore(divBtn, memBtn.nextSibling);
          else mainGrid.appendChild(divBtn);
        }
      }
    } catch (e) {}
  }
  applyGroupChatMode();
  document.addEventListener('contact-switched', applyGroupChatMode);
  document.addEventListener('group-chat-mode-changed', applyGroupChatMode);
  // 装修模式退出后重应用（用户可能在装修时移动了群聊/占卜按钮）
  document.addEventListener('decor-exited', applyGroupChatMode);
  // v3.9.x：idbRestore 异步回填完成后再应用一次——group-chat-enabled 是小键，
  // 正常情况同步写 localStorage，启动时即可读到。但 localStorage 配额紧张/被浏览器
  // 清理时该键只在 IndexedDB，applyGroupChatMode 同步首次调用读到 null→群聊按钮移入
  // 隐藏池；idbRestore 回填后 store.get 能读到 '1'，但此前不会重新触发 applyGroupChatMode
  //（contact-switched/group-chat-mode-changed 均不派发），群聊按钮留在池中"自己关闭"。
  // 监听 mochi-restore-done 在回填后重应用，与 buildDeskPages 的 rebuildDeskWhenReady 同模式。
  if (window.__mochiDataReady) applyGroupChatMode();
  else document.addEventListener('mochi-restore-done', applyGroupChatMode);

  // 组件库面板：列出所有组件 + 当前位置，点击「添加到此页」
  function openDeskLib(pageSlide, pageIdx) {
    const lib = document.createElement('div');
    lib.className = 'desk-lib';
    lib.addEventListener('click', (e) => { if (e.target === lib) lib.remove(); });
    const box = document.createElement('div');
    box.className = 'desk-lib-box';
    const title = document.createElement('div');
    title.className = 'desk-lib-title';
    title.textContent = '添加卡片到' + (pageIdx + 1 <= 2 ? (pageIdx === 0 ? '首页' : '第 ' + (pageIdx + 1) + ' 页') : '第 ' + (pageIdx + 1) + ' 页');
    const sub = document.createElement('div');
    sub.className = 'desk-lib-sub';
    sub.textContent = '组件全局唯一：选择后会从原位置移动过来';
    box.appendChild(title); box.appendChild(sub);
    WIDGET_IDS.forEach(wid => {
      const item = document.createElement('div');
      item.className = 'desk-lib-item';
      // v3.7.x：静态预览缩略图
      const prev = document.createElement('div');
      prev.className = 'dl-prev';
      prev.style.cssText = PREV_BOX;
      prev.innerHTML = WIDGET_PREV_HTML[wid] || '';
      const meta = document.createElement('div');
      meta.className = 'dl-meta';
      const name = document.createElement('div');
      name.className = 'dl-name';
      name.textContent = WIDGET_NAMES[wid] || wid;
      const node = document.querySelector('[data-desk-widget="' + wid + '"]');
      const curPage = node && node.closest('.page-slide') ? Array.prototype.indexOf.call(pagesBox.querySelectorAll('.page-slide'), node.closest('.page-slide')) : -1;
      const where = document.createElement('div');
      where.className = 'dl-where';
      where.textContent = curPage < 0 ? '已隐藏' : (curPage === pageIdx ? '已在本页' : (curPage === 0 ? '首页' : '第 ' + (curPage + 1) + ' 页'));
      const btn = document.createElement('button');
      btn.className = 'dl-btn';
      btn.textContent = curPage === pageIdx ? '已在' : '添加到此页';
      btn.disabled = curPage === pageIdx;
      btn.addEventListener('click', () => {
        if (!node) return;
        // 插入到「+ 添加卡片」按钮之前
        const addBtn = pageSlide.querySelector('.desk-page-add');
        if (addBtn) pageSlide.insertBefore(node, addBtn);
        else pageSlide.appendChild(node);
        syncPageHint(pageSlide);
        saveDeskLayout();
        if (window.deskRebuild) window.deskRebuild();
        lib.remove();
        toast('已添加到本页');
      });
      meta.appendChild(name); meta.appendChild(where);
      item.appendChild(prev); item.appendChild(meta); item.appendChild(btn);
      box.appendChild(item);
    });
    // v3.6.x：图片组件——可多个，上传新图片到本页
    const imgItem = document.createElement('div');
    imgItem.className = 'desk-lib-item';
    const imgPrev = document.createElement('div');
    imgPrev.className = 'dl-prev';
    imgPrev.style.cssText = PREV_BOX;
    imgPrev.innerHTML = '<span style="width:40px;height:30px;border-radius:6px;background:#f4f4f4;display:flex;align-items:center;justify-content:center;border:1px solid rgba(0,0,0,.06)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.8"/><path d="M5.5 17l4-4 3 3 2.5-2.5L19 17"/></svg></span>';
    const imgMeta = document.createElement('div');
    imgMeta.className = 'dl-meta';
    const imgName = document.createElement('div');
    imgName.className = 'dl-name';
    imgName.textContent = '图片（上传新图片）';
    const imgWhere = document.createElement('div');
    imgWhere.className = 'dl-where';
    imgWhere.textContent = '可多个';
    const imgBtn = document.createElement('button');
    imgBtn.className = 'dl-btn';
    imgBtn.textContent = '上传并添加';
    imgBtn.addEventListener('click', () => { addDeskImage(pageIdx); lib.remove(); });
    imgMeta.appendChild(imgName); imgMeta.appendChild(imgWhere);
    imgItem.appendChild(imgPrev); imgItem.appendChild(imgMeta); imgItem.appendChild(imgBtn);
    box.appendChild(imgItem);
    // v3.7.x：自定义文字组件——可多个
    const textItem = document.createElement('div');
    textItem.className = 'desk-lib-item';
    const textPrev = document.createElement('div');
    textPrev.className = 'dl-prev';
    textPrev.style.cssText = PREV_BOX;
    textPrev.innerHTML = '<span style="font-size:10px;color:#333;font-weight:600;line-height:1.3;text-align:center;padding:2px 6px">愿你<br>温柔且自由</span>';
    const textMeta = document.createElement('div');
    textMeta.className = 'dl-meta';
    const textName = document.createElement('div');
    textName.className = 'dl-name';
    textName.textContent = '文字（自定义一句话）';
    const textWhere = document.createElement('div');
    textWhere.className = 'dl-where';
    textWhere.textContent = '可多个';
    const textBtn = document.createElement('button');
    textBtn.className = 'dl-btn';
    textBtn.textContent = '添加文字';
    textBtn.addEventListener('click', () => { addDeskText(pageIdx); lib.remove(); });
    textMeta.appendChild(textName); textMeta.appendChild(textWhere);
    textItem.appendChild(textPrev); textItem.appendChild(textMeta); textItem.appendChild(textBtn);
    box.appendChild(textItem);
    // v3.7.x：通用倒计时组件——可多个
    const cdItem = document.createElement('div');
    cdItem.className = 'desk-lib-item';
    const cdPrev = document.createElement('div');
    cdPrev.className = 'dl-prev';
    cdPrev.style.cssText = PREV_BOX;
    cdPrev.innerHTML = '<span style="display:flex;flex-direction:column;align-items:center;gap:1px"><span style="font-size:6px;color:#bbb">距出差</span><span style="font-size:14px;font-weight:700;color:#333">28 天</span><span style="font-size:5px;color:#999">9 月 16 日</span></span>';
    const cdMeta = document.createElement('div');
    cdMeta.className = 'dl-meta';
    const cdName = document.createElement('div');
    cdName.className = 'dl-name';
    cdName.textContent = '倒计时（自定义事件）';
    const cdWhere = document.createElement('div');
    cdWhere.className = 'dl-where';
    cdWhere.textContent = '可多个';
    const cdBtn = document.createElement('button');
    cdBtn.className = 'dl-btn';
    cdBtn.textContent = '添加倒计时';
    cdBtn.addEventListener('click', () => { addDeskCountdown(pageIdx); lib.remove(); });
    cdMeta.appendChild(cdName); cdMeta.appendChild(cdWhere);
    cdItem.appendChild(cdPrev); cdItem.appendChild(cdMeta); cdItem.appendChild(cdBtn);
    box.appendChild(cdItem);
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.style.cssText = 'width:100%;margin-top:8px;padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa;font-size:13px;cursor:pointer;font-family:inherit';
    close.addEventListener('click', () => lib.remove());
    box.appendChild(close);
    lib.appendChild(box);
    document.body.appendChild(lib);
  }



  // ===== v3.6.x：桌面图片组件（可多个，每页可放多张不同图片） =====
  // 存储：desk-images（localStorage，元数据数组 [{id,page,addedAt,w}]）
  //       desk-image-src-<id>（IDB，图片 dataURL，大数据）
  // 组件节点用 [data-desk-image="<id>"] 标识，不参与 desk-layout（与现有组件系统解耦）
  // v3.6.x：w = 组件宽度百分比（40 小 / 70 中 / 100 大，档位见顶部 DESK_IMG_SIZES），不设时默认 100
  function loadDeskImagesMeta() {
    try { const v = JSON.parse(store.get('desk-images') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveDeskImagesMeta(arr) { store.set('desk-images', JSON.stringify(arr)); }
  // 渲染所有图片组件到对应页
  function renderDeskImages() {
    if (!pagesBox) return;
    pagesBox.querySelectorAll('[data-desk-image]').forEach(n => n.remove());
    const meta = loadDeskImagesMeta();
    const slides = pagesBox.querySelectorAll('.page-slide');
    meta.forEach(m => {
      const slide = slides[m.page];
      if (!slide) return;
      const node = document.createElement('div');
      node.className = 'desk-image-widget';
      node.dataset.deskImage = m.id;
      // v3.6.x：按 meta.w 应用宽度百分比——不同图片可设不同大小（小/中/大）
      const w = DESK_IMG_SIZES.l;
      const wv = (m.w === DESK_IMG_SIZES.s || m.w === DESK_IMG_SIZES.m) ? m.w : w;
      node.style.width = wv + '%';
      // v3.6.x：左右位置——窄图可 靠左(默认)/居中/靠右；满宽图无对齐效果
      if (wv < 100) node.style.alignSelf = m.align === 'c' ? 'center' : (m.align === 'r' ? 'flex-end' : 'flex-start');
      const img = document.createElement('img');
      node.appendChild(img);
      const addBtn = slide.querySelector('.desk-page-add');
      if (addBtn) slide.insertBefore(node, addBtn); else slide.appendChild(node);
      const srcKey = window.activePrefix() + ':desk-image-src-' + m.id;
      if (window.idbGet) {
        window.idbGet(srcKey).then(src => { if (src && node.dataset.deskImage === m.id) img.src = src; });
      } else {
        const src = store.get('desk-image-src-' + m.id);
        if (src) img.src = src;
      }
    });
    // v3.6.x：图片也算页面内容——有图页隐藏空白提示，空页恢复（装修模式才显示）
    for (let i = 0; i < slides.length; i++) syncPageHint(slides[i]);
  }
  // v3.6.x：图片组件上移/下移——只与同页相邻图片交换顺序，持久化到 meta
  function moveDeskImage(id, dir) {
    const meta = loadDeskImagesMeta();
    const idx = meta.findIndex(x => x.id === id);
    if (idx < 0) return;
    const same = [];
    meta.forEach((x, i) => { if (x.page === meta[idx].page) same.push(i); });
    const pos = same.indexOf(idx);
    if (dir === 'up' && pos > 0) {
      const a = same[pos - 1];
      const t = meta[a]; meta[a] = meta[idx]; meta[idx] = t;
    } else if (dir === 'down' && pos < same.length - 1) {
      const a = same[pos + 1];
      const t = meta[a]; meta[a] = meta[idx]; meta[idx] = t;
    } else {
      return;
    }
    saveDeskImagesMeta(meta);
    renderDeskImages();
    toast(dir === 'up' ? '已上移' : '已下移');
  }
  // 上传新图片到指定页
  function addDeskImage(pageIdx) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        compressImage(reader.result, 1280).then(data => {
          if (!data) { toast('图片过大或格式不支持，请换一张'); return; }
          const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          const meta = loadDeskImagesMeta();
          meta.push({ id: id, page: pageIdx, addedAt: Date.now() });
          saveDeskImagesMeta(meta);
          const srcKey = window.activePrefix() + ':desk-image-src-' + id;
          if (window.idbSet) window.idbSet(srcKey, data); else store.set('desk-image-src-' + id, data);
          renderDeskImages();
          toast('已添加图片');
        });
      };
      reader.readAsDataURL(f);
    };
    input.click();
  }
  // 换图
  function changeDeskImage(id) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        compressImage(reader.result, 1280).then(data => {
          if (!data) { toast('图片过大或格式不支持'); return; }
          const srcKey = window.activePrefix() + ':desk-image-src-' + id;
          if (window.idbSet) window.idbSet(srcKey, data); else store.set('desk-image-src-' + id, data);
          renderDeskImages();
          toast('已更换图片');
        });
      };
      reader.readAsDataURL(f);
    };
    input.click();
  }
  // 删除图片组件
  function removeDeskImage(id) {
    const meta = loadDeskImagesMeta().filter(m => m.id !== id);
    saveDeskImagesMeta(meta);
    try { if (window.idbDelete) window.idbDelete(window.activePrefix() + ':desk-image-src-' + id); } catch (e) {}
    try { store.remove('desk-image-src-' + id); } catch (e) {}
    renderDeskImages();
    toast('已删除图片');
  }
  // 删除指定页上的所有图片（删页时调用，避免索引错位）
  function removeDeskImagesOnPage(pageIdx) {
    const meta = loadDeskImagesMeta();
    const toRemove = meta.filter(m => m.page === pageIdx);
    const remain = meta.filter(m => m.page !== pageIdx);
    saveDeskImagesMeta(remain);
    toRemove.forEach(m => {
      try { if (window.idbDelete) window.idbDelete(window.activePrefix() + ':desk-image-src-' + m.id); } catch (e) {}
      try { store.remove('desk-image-src-' + m.id); } catch (e) {}
    });
  }
  // 图片组件点击：装修模式 → 菜单（换图/删除），非装修 → 全屏查看
  function setupDeskImageClick() {
    if (!pagesBox) return;
    pagesBox.addEventListener('click', (e) => {
      const widget = e.target.closest('[data-desk-image]');
      if (!widget) return;
      const id = widget.dataset.deskImage;
      const phone = document.getElementById('page-phone');
      const isDecor = phone && phone.classList.contains('decor-on');
      if (isDecor) {
        e.stopPropagation();
        if (!window.openModal) return;
        // v3.6.x：菜单加尺寸选项（小/中/大），当前尺寸打 ✓——不同图片可设不同大小
        const cur = (loadDeskImagesMeta().find(x => x.id === id) || {}).w || DESK_IMG_SIZES.l;
        const sizePill = (label, val, w) => ({ label: label + (cur === w ? ' ✓' : ''), value: val });
        // v3.6.x：移动子菜单——上移/下移换顺序，靠左/居中/靠右调水平位置（窄图才有效果）
        // 嵌套弹窗必须延迟到当前弹窗关闭后再开（okBtn 的 finally close() 会立刻关掉当前
        // openModal 并清空 cb，同步嵌套必然闪关）——openCardBgMenu 内的 openCardMenuNext
        // 是它的局部变量，这里不能引用，直接内联同样的 setTimeout 模式
        const openMoveMenu = () => {
          const m = loadDeskImagesMeta().find(x => x.id === id) || {};
          const al = m.align || 'l';
          const alPill = (label, val) => ({ label: label + (al === val ? ' ✓' : ''), value: val });
          const opts = {
            noInput: true,
            pills: [
              { label: '上移', value: 'up' },
              { label: '下移', value: 'down' },
              alPill('靠左', 'al'),
              alPill('居中', 'ac'),
              alPill('靠右', 'ar'),
            ],
          };
          setTimeout(() => { if (window.openModal) window.openModal('图片移动', '', (v2) => {
            if (v2 === 'up' || v2 === 'down') moveDeskImage(id, v2);
            else if (v2 === 'al' || v2 === 'ac' || v2 === 'ar') {
              const meta = loadDeskImagesMeta();
              const mm = meta.find(x => x.id === id);
              if (mm) {
                mm.align = v2 === 'ac' ? 'c' : v2 === 'ar' ? 'r' : 'l';
                saveDeskImagesMeta(meta);
                renderDeskImages();
                toast(v2 === 'al' ? '已靠左' : v2 === 'ac' ? '已居中' : '已靠右');
              }
            }
          }, opts); }, 0);
        };
        window.openModal('图片组件', '', (v) => {
          if (v === '1') changeDeskImage(id);
          else if (v === '2') removeDeskImage(id);
          else if (v === 'move') openMoveMenu();
          else if (v === 's' || v === 'm' || v === 'l') {
            const w = DESK_IMG_SIZES[v];
            const meta = loadDeskImagesMeta();
            const m = meta.find(x => x.id === id);
            if (m) {
              m.w = w;
              saveDeskImagesMeta(meta);
              renderDeskImages();
              toast(v === 's' ? '已设为小尺寸' : v === 'm' ? '已设为中尺寸' : '已设为大尺寸');
            }
          }
        }, {
          noInput: true,
          pills: [
            { label: '更换图片', value: '1' },
            sizePill('尺寸：小', 's', DESK_IMG_SIZES.s),
            sizePill('尺寸：中', 'm', DESK_IMG_SIZES.m),
            sizePill('尺寸：大', 'l', DESK_IMG_SIZES.l),
            { label: '移动', value: 'move' },
            { label: '删除图片', value: '2' },
          ],
        });
      } else {
        const img = widget.querySelector('img');
        if (!img || !img.src) return;
        // v3.6.x：防御——查看器元素若因 DOM 顺序/动态重建未绑定关闭事件，打开前补绑一次
        setupDeskImageViewerClose();
        const viewer = document.getElementById('desk-image-viewer');
        const viewerImg = document.getElementById('desk-image-viewer-img');
        if (viewer && viewerImg) { viewerImg.src = img.src; viewer.hidden = false; }
      }
    });
  }
  // 关闭全屏查看器
  // v3.6.x：viewerBound 幂等守卫（声明在 IIFE 顶部）——启动绑定一次，
  // 打开路径防御性重调时不再重复挂监听
  function setupDeskImageViewerClose() {
    const viewer = document.getElementById('desk-image-viewer');
    if (!viewer) return;
    if (viewerBound) return;
    viewerBound = true;
    const closeBtn = document.getElementById('desk-image-viewer-close');
    const close = () => { viewer.hidden = true; const vi = document.getElementById('desk-image-viewer-img'); if (vi) vi.src = ''; };
    if (closeBtn) closeBtn.addEventListener('click', close);
    viewer.addEventListener('click', (e) => { if (e.target === viewer) close(); });
  }

  // ===== v3.7.x：桌面文字组件（可多个，自定义一句话放桌面） =====
  // 存储：desk-texts（localStorage，[{id,page,text,size,color}]）
  // 组件节点用 [data-desk-text="<id>"] 标识，不参与 desk-layout
  function loadDeskTextsMeta() {
    try { const v = JSON.parse(store.get('desk-texts') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveDeskTextsMeta(arr) { store.set('desk-texts', JSON.stringify(arr)); }
  function renderDeskTexts() {
    if (!pagesBox) return;
    pagesBox.querySelectorAll('[data-desk-text]').forEach(n => n.remove());
    const meta = loadDeskTextsMeta();
    const slides = pagesBox.querySelectorAll('.page-slide');
    meta.forEach(m => {
      const slide = slides[m.page];
      if (!slide) return;
      const node = document.createElement('div');
      node.className = 'desk-text-widget';
      node.dataset.deskText = m.id;
      const p = document.createElement('p');
      p.textContent = m.text || '点击编辑文字';
      p.style.fontSize = (m.size || 15) + 'px';
      p.style.color = m.color || '#333';
      node.appendChild(p);
      const addBtn = slide.querySelector('.desk-page-add');
      if (addBtn) slide.insertBefore(node, addBtn); else slide.appendChild(node);
    });
    for (let i = 0; i < slides.length; i++) syncPageHint(slides[i]);
  }
  function addDeskText(pageIdx) {
    if (!window.openModal) return;
    window.openModal('添加文字', '', (v) => {
      if (!v || !v.trim()) return;
      const id = 'txt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const meta = loadDeskTextsMeta();
      meta.push({ id: id, page: pageIdx, text: v.trim(), size: 15, color: '#333' });
      saveDeskTextsMeta(meta);
      renderDeskTexts();
      toast('已添加文字');
    }, { placeholder: '输入要显示的文字' });
  }
  function removeDeskText(id) {
    saveDeskTextsMeta(loadDeskTextsMeta().filter(m => m.id !== id));
    renderDeskTexts();
    toast('已删除');
  }
  function removeDeskTextsOnPage(pageIdx) {
    saveDeskTextsMeta(loadDeskTextsMeta().filter(m => m.page !== pageIdx));
  }
  function setupDeskTextClick() {
    if (!pagesBox) return;
    pagesBox.addEventListener('click', (e) => {
      const widget = e.target.closest('[data-desk-text]');
      if (!widget) return;
      const id = widget.dataset.deskText;
      const phone = document.getElementById('page-phone');
      const isDecor = phone && phone.classList.contains('decor-on');
      if (!isDecor) return;
      e.stopPropagation();
      if (!window.openModal) return;
      // v3.7.x 修复：两处失效——① 原 setTimeout 里 querySelectorAll('.modal-pill')
      // 选择器不存在（pills 实际类名是 .pill、容器是 #modal-pills），字号+/字号-/
      // 换颜色/删除从未绑定、点了没反应；② 保存用 saveDeskTextsMeta(loadDeskTextsMeta())
      // 重新读旧数据存回，编辑的改动全部丢失。改为：一次 load 数组持有引用、
      // pill 动作走 openModal 确定回调（与全站 pills 弹窗一致：点 pill 记录、确定传回）。
      const meta = loadDeskTextsMeta();
      const m = meta.find(x => x.id === id);
      if (!m) return;
      window.openModal('编辑文字', m.text, (v) => {
        if (v === '__sizeup__') {
          m.size = Math.min(30, (m.size || 15) + 2);
          saveDeskTextsMeta(meta); renderDeskTexts(); toast('字号 ' + m.size + 'px');
        } else if (v === '__sizedn__') {
          m.size = Math.max(10, (m.size || 15) - 2);
          saveDeskTextsMeta(meta); renderDeskTexts(); toast('字号 ' + m.size + 'px');
        } else if (v === '__color__') {
          const colors = ['#333', '#666', '#999', '#e05555', '#3a7bd5', '#4a9d5e', '#d6459d', '#f0a020'];
          const ci = colors.indexOf(m.color || '#333');
          m.color = colors[(ci + 1) % colors.length];
          saveDeskTextsMeta(meta); renderDeskTexts(); toast('已换颜色');
        } else if (v === '__del__') {
          removeDeskText(id);
        } else if (v && v.trim()) {
          m.text = v.trim();
          saveDeskTextsMeta(meta); renderDeskTexts();
        }
      }, {
        placeholder: '输入文字',
        pills: [
          { label: '字号+', value: '__sizeup__' },
          { label: '字号-', value: '__sizedn__' },
          { label: '换颜色', value: '__color__' },
          { label: '删除', value: '__del__' },
        ],
      });
    });
  }

  // ===== v3.7.x：通用倒计时组件（可多个，自定义标题+目标日期） =====
  // 存储：desk-countdowns（localStorage，[{id,page,title,date}]）
  // 组件节点用 [data-desk-countdown="<id>"] 标识，不参与 desk-layout
  function loadDeskCountdownsMeta() {
    try { const v = JSON.parse(store.get('desk-countdowns') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveDeskCountdownsMeta(arr) { store.set('desk-countdowns', JSON.stringify(arr)); }
  function renderDeskCountdowns() {
    if (!pagesBox) return;
    pagesBox.querySelectorAll('[data-desk-countdown]').forEach(n => n.remove());
    const meta = loadDeskCountdownsMeta();
    const slides = pagesBox.querySelectorAll('.page-slide');
    meta.forEach(m => {
      const slide = slides[m.page];
      if (!slide) return;
      const node = document.createElement('div');
      node.className = 'desk-countdown-widget';
      node.dataset.deskCountdown = m.id;
      const target = new Date(m.date + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.round((target - today) / 86400000);
      node.innerHTML = '<div class="dcd-label">距' + (m.title || '事件') + '</div>' +
        '<div class="dcd-days">' + (days >= 0 ? days : '已过') + (days >= 0 ? ' 天' : '') + '</div>' +
        '<div class="dcd-date">' + m.date + '</div>';
      const addBtn = slide.querySelector('.desk-page-add');
      if (addBtn) slide.insertBefore(node, addBtn); else slide.appendChild(node);
    });
    for (let i = 0; i < slides.length; i++) syncPageHint(slides[i]);
  }
  function addDeskCountdown(pageIdx) {
    if (!window.openModal) return;
    const today = new Date().toISOString().slice(0, 10);
    window.openModal('添加倒计时', '', (v) => {
      if (!v || !v.trim()) return;
      const parts = v.split('|');
      const title = (parts[0] || '').trim();
      const date = (parts[1] || '').trim();
      if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('格式：标题|日期，如 出差|2026-09-16'); return; }
      const id = 'cd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const meta = loadDeskCountdownsMeta();
      meta.push({ id: id, page: pageIdx, title: title, date: date });
      saveDeskCountdownsMeta(meta);
      renderDeskCountdowns();
      toast('已添加倒计时');
    }, { placeholder: '标题|日期，如 出差|2026-09-16', value: '|' + today });
  }
  function removeDeskCountdown(id) {
    saveDeskCountdownsMeta(loadDeskCountdownsMeta().filter(m => m.id !== id));
    renderDeskCountdowns();
    toast('已删除');
  }
  function removeDeskCountdownsOnPage(pageIdx) {
    saveDeskCountdownsMeta(loadDeskCountdownsMeta().filter(m => m.page !== pageIdx));
  }
  function setupDeskCountdownClick() {
    if (!pagesBox) return;
    pagesBox.addEventListener('click', (e) => {
      const widget = e.target.closest('[data-desk-countdown]');
      if (!widget) return;
      const id = widget.dataset.deskCountdown;
      const phone = document.getElementById('page-phone');
      const isDecor = phone && phone.classList.contains('decor-on');
      if (!isDecor) return;
      e.stopPropagation();
      if (!window.openModal) return;
      // v3.7.x 修复：与文字组件同款——删除 pill 走确定回调、保存持有 meta 引用
      //（原 saveDeskCountdownsMeta(loadDeskCountdownsMeta()) 读旧数据存回、编辑丢失；
      //  原 setTimeout 的 .modal-pill 选择器不存在，删除 pill 从未绑定）
      const meta = loadDeskCountdownsMeta();
      const m = meta.find(x => x.id === id);
      if (!m) return;
      window.openModal('编辑倒计时', m.title + '|' + m.date, (v) => {
        if (v === '__del__') { removeDeskCountdown(id); return; }
        if (!v || !v.trim()) return;
        const parts = v.split('|');
        const title = (parts[0] || '').trim();
        const date = (parts[1] || '').trim();
        if (!title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('格式：标题|日期'); return; }
        m.title = title; m.date = date;
        saveDeskCountdownsMeta(meta);
        renderDeskCountdowns();
      }, {
        placeholder: '标题|日期，如 出差|2026-09-16',
        pills: [{ label: '删除', value: '__del__' }],
      });
    });
  }

  // v3.6.x：装修模式装饰条「+ 添加卡片」——找回被移出的桌面组件，加到当前页
  const decorAddBtn = document.getElementById('decor-add-widget');
  if (decorAddBtn) {
    decorAddBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pagesBox) return;
      // 当前页 = 滚动位置对应的 page-slide
      const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
      if (!slides.length) return;
      let curIdx = 0;
      if (pagesBox.clientWidth) {
        curIdx = Math.max(0, Math.min(slides.length - 1, Math.round(pagesBox.scrollLeft / pagesBox.clientWidth)));
      }
      openDeskLib(slides[curIdx], curIdx);
    });
  }

  // 卡片摆放操作已收进点卡片的设置菜单（openCardBgMenu 的 上移/下移/移出此页），
  // 不再注入悬浮操作条——原操作条挂在 [data-desk-widget]（含 app-grid 图标网格）上，
  // 会遮挡图标导致装修模式下点图标弹不出「更换/清除」菜单（无法恢复默认图标）。

  // 退出装修模式（含桌面顶部"完成"按钮）
  function exitDecor() {
    grids.forEach(g => g.classList.remove('editing'));
    const phone = document.getElementById('page-phone');
    if (phone) phone.classList.remove('decor-on');
    const bar = document.getElementById('decor-bar');
    if (bar) bar.hidden = true;
    try { document.dispatchEvent(new Event('decor-exited')); } catch (e) {}
  }
  // v3.5.131：暴露给 tabs.js 返回键（返回时退出编辑态，防止"点了没反应"）
  window.exitDecor = exitDecor;
  const decorDone = document.getElementById('decor-done');
  if (decorDone) {
    decorDone.addEventListener('click', exitDecor);
  }
  // v3.6.x：恢复隐藏图标——装修栏"恢复图标"按钮，弹窗列出已隐藏图标，点击恢复
  const decorRestoreIcon = document.getElementById('decor-restore-icon');
  if (decorRestoreIcon) {
    decorRestoreIcon.addEventListener('click', () => {
      const hidden = getHiddenIcons();
      if (!hidden.length) { toast('没有已隐藏的图标'); return; }
      if (!window.openModal) return;
      // 收集隐藏图标的标签
      const items = [];
      document.querySelectorAll('.app').forEach(app => {
        if (hidden.indexOf(app.dataset.app) >= 0) {
          const lbl = app.querySelector('.app-name');
          items.push({ key: app.dataset.app, label: lbl ? lbl.textContent : app.dataset.app });
        }
      });
      if (!items.length) { toast('没有已隐藏的图标'); return; }
      const pills = items.map(it => ({ label: '恢复「' + it.label + '」', value: it.key }));
      pills.push({ label: '全部恢复', value: '__all__' });
      window.openModal('恢复隐藏图标', '', (v) => {
        if (!v) return;
        if (v === '__all__') {
          setHiddenIcons([]);
          applyHiddenIcons();
          toast('已恢复全部图标');
          return;
        }
        const arr = getHiddenIcons().filter(k => k !== v);
        setHiddenIcons(arr);
        applyHiddenIcons();
        toast('已恢复');
      }, { noInput: true, pills: pills });
    });
  }
  // contact-switched 时重应用隐藏状态
  document.addEventListener('contact-switched', applyHiddenIcons);

  // 点击底部 tab 切换页面时退出图标编辑模式
  const tabbar = document.querySelector('.tabbar');
  if (tabbar && grids.length) {
    tabbar.addEventListener('click', () => {
      grids.forEach(g => g.classList.remove('editing'));
      const phone = document.getElementById('page-phone');
      if (phone) phone.classList.remove('decor-on');
      const bar = document.getElementById('decor-bar');
      if (bar) bar.hidden = true;
    });
  }

  // ===== v3.x：桌面长按拖拽重排（移动模式，复用 decor-on + desk-layout/app-icon-order） =====
  // 长按图标/组件 350ms → 进入移动模式（抖动可拖拽）→ 拖动跟手 → 释放重排 + 持久化
  // 参考 chatcard.js pointer 拖拽；跨页拖到边缘 300ms 自动翻页（window.deskGo）
  // 图标限本 app-grid 内换位（持久化 app-icon-order）；独立组件可跨页（持久化 desk-layout）
  {
    const phone = document.getElementById('page-phone');
    const MOVE_DELAY = 350, EDGE = 44, EDGE_DELAY = 300;
    let pressTimer = null, startX = 0, startY = 0, inMoveMode = false, dragging = false;
    const enterMoveMode = () => {
      if (inMoveMode) return;
      inMoveMode = true;
      enterDecor();
      if (phone) phone.classList.add('desk-move-mode');
      const span = document.querySelector('#decor-bar span');
      if (span) span.textContent = '移动模式 · 短按图标拖动换位 · 完成退出';
      // v3.14.x：清掉长按按住阶段已形成的文字选区——Android 选中文字弹「复制」气泡后
      // 触摸序列被气泡抢占，进移动模式后拖不动；CSS 已禁桌面选择，这里兜底清残留
      try { const _sel = window.getSelection(); if (_sel && _sel.removeAllRanges) _sel.removeAllRanges(); } catch (e) {}
      if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {}
    };
    // 装修栏「编辑布局」按钮：点击进入移动模式（短按即拖，绕开长按 + 浏览器手势抢占）
    const editLayoutBtn = document.getElementById('decor-edit-layout');
    if (editLayoutBtn) editLayoutBtn.addEventListener('click', enterMoveMode);
    const resetMoveMode = () => {
      inMoveMode = false;
      dragging = false;
      if (phone) phone.classList.remove('desk-move-mode');
      // 退出时清理拖拽残留（拖拽中按返回键/点完成/切 tab）
      document.querySelectorAll('.desk-drag-clone, .desk-edge-hint, .desk-drop-line').forEach(n => n.remove());
      document.querySelectorAll('.desk-dragging').forEach(n => n.classList.remove('desk-dragging'));
    };
    document.addEventListener('decor-exited', resetMoveMode);
    const _tabbar = document.querySelector('.tabbar');
    if (_tabbar) _tabbar.addEventListener('click', resetMoveMode);
    // v3.14.x：拦截桌面原生右键/长按系统菜单——Android 长按图片组件/头像会弹
    // 「保存/复制」上下文菜单（-webkit-touch-callout 只拦 iOS 管不到 Android），
    // 菜单一弹即抢占触摸序列导致拖拽中断（配合 home.css 的 #page-phone 禁选择）。
    // 桌面无任何右键功能，全时拦截（含桌面 PC 右键，避免误触发浏览器菜单打断拖拽）
    if (phone) phone.addEventListener('contextmenu', (e) => e.preventDefault());

    // touchstart capture 兜底：移动模式下短按即拖，浏览器会按 pan-x pan-y 接管触摸序列→
    // pointermove 被抢占/翻页→拖不动。在 touchstart capture 阶段 preventDefault，阻止浏览器
    // 启动 pan-x/pan-y 手势，让 pointer 完整派发。
    // ⚠️ 必须限 inMoveMode：touchstart 的 preventDefault 会阻止浏览器合成 click 事件，
    //    非移动模式下若也无条件 preventDefault，桌面所有功能按钮（.app）/卡片点击全部失效
    //    （v3.10.x 回归：开屏进入后桌面按钮全点不动）。仅在移动模式（编辑布局后短按即拖）才需要。
    pagesBox.addEventListener('touchstart', (e) => {
      if (!inMoveMode) return;
      if (e.target.closest('.desk-lib, .desk-page-add, .decor-bar')) return;
      if (!e.target.closest('[data-desk-widget], .app')) return;
      e.preventDefault();
    }, { capture: true, passive: false });
    // v3.14.x：touchmove capture 兜底——组件已允许 pan-x pan-y（移动模式下桌面横滑翻页），
    //   长按进移动模式那一下 touchstart 发生时 inMoveMode 还是 false 拦不到，但手指要 350ms
    //   后才开始移动，第一个 touchmove 到达时 inMoveMode 已是 true——这里 preventDefault 阻止
    //   浏览器把序列当滚动，长按拖拽不被抢占（否则组件允许 pan 后拖动会被浏览器抢成翻页）。
    //   限 inMoveMode + 组件目标，不影响移动模式下组件间隙/空白处的正常横滑翻页。
    pagesBox.addEventListener('touchmove', (e) => {
      if (!inMoveMode) return;
      if (e.target.closest('.desk-lib, .desk-page-add, .decor-bar')) return;
      if (!e.target.closest('[data-desk-widget], .app')) return;
      e.preventDefault();
    }, { capture: true, passive: false });

    // 长按检测（事件委托在 pagesBox）
    pagesBox.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.desk-lib, .desk-page-add, .decor-bar')) return;
      const target = e.target.closest('[data-desk-widget], .app');
      if (!target) return;
      startX = e.clientX; startY = e.clientY;
      const t = target;
      // 移动模式已开启：区分「快速横滑翻页」与「长按/短按拖拽」——组件 touch-action:none
      // 时浏览器不会自动滚动，手指快速横滑由 JS 判为翻页（v3.14.x：修复移动/装修模式桌面
      // 滑不动）。记录按下时刻：短按后立即横向位移>12px → 翻页；长按超过 MOVE_DELAY（按住
      // 不动）或纵向位移为主 → 拖拽。这样长按图标拖动仍可拖（长按超时后移动不被判横滑）。
      if (inMoveMode) {
        t._swipeX = e.clientX; t._swipeY = e.clientY;
        t._swipeT = Date.now();
        t._swiping = null;
        return; // 等 pointermove 判定方向
      }
      // 非移动模式：长按 350ms 进入移动模式 + 开始拖拽（兼容旧入口）
      pressTimer = setTimeout(() => {
        pressTimer = null;
        enterMoveMode();
        startDeskDrag(e, t);
      }, MOVE_DELAY);
    });
    pagesBox.addEventListener('pointermove', (e) => {
      if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
        clearTimeout(pressTimer); pressTimer = null;
      }
      // 移动模式下的横滑翻页判定：手指按下但未进入拖拽（_swiping 未定）时判定方向
      if (inMoveMode && !dragging) {
        const t = e.target.closest ? e.target.closest('[data-desk-widget], .app') : null;
        if (t && t._swiping !== undefined && t._swiping === null) {
          const dx = e.clientX - t._swipeX, dy = e.clientY - t._swipeY;
          // 长按超过 MOVE_DELAY 后移动 → 直接拖拽（按住图标/组件拖动的场景）
          if (Date.now() - t._swipeT > MOVE_DELAY) {
            t._swiping = 'v';
            startDeskDrag(e, t);
            return;
          }
          if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
            if (Math.abs(dx) > Math.abs(dy) * 1.5) {
              // 短按后立即横向位移为主 → 翻页手势（组件上快速横滑翻页），不进入拖拽
              t._swiping = 'h';
            } else {
              // 纵向为主 → 立即开始拖拽（短按即拖）
              t._swiping = 'v';
              startDeskDrag(e, t);
            }
          }
        }
        // 已判为横滑：跟手更新，但不动 scrollLeft（松手时 deskGo 吸附翻页）
        if (t && t._swiping === 'h' && window.deskIdx) {
          const dx = e.clientX - t._swipeX;
          if (Math.abs(dx) > 46) {
            const slides = pagesBox.querySelectorAll('.page-slide').length;
            const cur = window.deskIdx();
            const dir = dx < 0 ? 1 : -1; // 左滑下一页
            if (cur + dir >= 0 && cur + dir < slides) {
              if (window.deskGo) window.deskGo(cur + dir);
              t._swiping = 'done';
            }
          }
        }
      }
    });
    const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    pagesBox.addEventListener('pointerup', cancelPress);
    pagesBox.addEventListener('pointercancel', cancelPress);
    // v3.14.x：移动模式下横滑判定结束/取消时清理（避免残留 _swiping 状态）
    const clearSwipe = (e) => {
      const t = e.target.closest ? e.target.closest('[data-desk-widget], .app') : null;
      if (t) { t._swiping = undefined; t._swipeX = undefined; t._swipeY = undefined; }
    };
    pagesBox.addEventListener('pointerup', clearSwipe);
    pagesBox.addEventListener('pointercancel', clearSwipe);

    // v3.10.x：tap→click 兜底——部分国产浏览器（X5 内核/夸克/UC 等）触摸不合成 click
    // 事件，桌面所有 .app 按钮触摸点击无响应（直接 .click() 正常，证明监听器已绑定）。
    // 在 touchend 判定 tap（单指、未移动、短按）后，等 120ms 看 click 是否触发，
    // 未触发则手动 click()。正常浏览器 click 在 touchend 后即时合成（<10ms），
    // 120ms 内检测到即跳过，零影响；不合成的浏览器才兜底，最多 120ms 延迟。
    // 守卫：移动模式/拖拽中不兜底（短按即拖，不应切页）；target 非 .app 不兜底。
    let _tapStart = null;
    pagesBox.addEventListener('touchstart', (e) => {
      if (inMoveMode || dragging) { _tapStart = null; return; }
      if (e.touches.length !== 1) { _tapStart = null; return; }
      const t = e.touches[0];
      _tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }, { capture: true, passive: true });
    pagesBox.addEventListener('touchend', (e) => {
      const s = _tapStart; _tapStart = null;
      if (!s || inMoveMode || dragging) return;
      if (e.changedTouches.length !== 1) return;
      const c = e.changedTouches[0];
      if (Math.abs(c.clientX - s.x) > 10 || Math.abs(c.clientY - s.y) > 10) return;
      if (Date.now() - s.time > 500) return;
      const btn = e.target.closest && e.target.closest('.app');
      if (!btn) return;
      let clicked = false;
      const once = () => { clicked = true; btn.removeEventListener('click', once, true); };
      btn.addEventListener('click', once, true);
      setTimeout(() => {
        btn.removeEventListener('click', once, true);
        if (!clicked) { try { btn.click(); } catch (e2) {} }
      }, 120);
    }, { capture: true, passive: true });

    let dropLine = null;
    const clearDropLine = () => { if (dropLine) { dropLine.remove(); dropLine = null; } };

    function startDeskDrag(e, el) {
      if (dragging) return; // 多指触摸守卫：拖拽中忽略第二指
      dragging = true;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left, offsetY = e.clientY - rect.top;
      const clone = el.cloneNode(true);
      clone.classList.add('desk-drag-clone');
      clone.classList.remove('desk-dragging');
      clone.style.left = rect.left + 'px';
      clone.style.top = rect.top + 'px';
      clone.style.width = rect.width + 'px';
      clone.style.height = rect.height + 'px';
      document.body.appendChild(clone);
      el.classList.add('desk-dragging');
      // 捕获指针：长按后才加 touch-action:none 对当前触摸序列无效，浏览器仍会按 pan-x/pan-y
      // 接管触摸→pointermove 被抢占/pointercancel→"一直抖动拖不动"。setPointerCapture 夺回
      // 控制权，后续 pointermove 持续派发到 el 不被抢占。
      let captured = false;
      if (e.pointerId !== undefined && el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); captured = true; } catch (er) {}
      }
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {}
      let dropInfo = null, edgeTimer = null, edgeDir = 0;
      const edgeL = document.createElement('div'); edgeL.className = 'desk-edge-hint left';
      const edgeR = document.createElement('div'); edgeR.className = 'desk-edge-hint right';
      document.body.appendChild(edgeL); document.body.appendChild(edgeR);
      const clearEdge = () => {
        if (edgeTimer) { clearTimeout(edgeTimer); edgeTimer = null; }
        edgeL.classList.remove('show'); edgeR.classList.remove('show'); edgeDir = 0;
      };
      const inGrid = !!el.closest('.app-grid');
      const onMove = (ev) => {
        ev.preventDefault();
        clone.style.left = (ev.clientX - offsetX) + 'px';
        clone.style.top = (ev.clientY - offsetY) + 'px';
        if (!inGrid) {
          const w = window.innerWidth;
          const slides = pagesBox.querySelectorAll('.page-slide').length;
          const cur = window.deskIdx ? window.deskIdx() : 0;
          if (ev.clientX < EDGE && cur > 0) {
            edgeL.classList.add('show');
            if (edgeDir !== -1) { edgeDir = -1; if (edgeTimer) clearTimeout(edgeTimer); edgeTimer = setTimeout(() => { if (window.deskGo) window.deskGo(cur - 1); }, EDGE_DELAY); }
          } else if (ev.clientX > w - EDGE && cur < slides - 1) {
            edgeR.classList.add('show');
            if (edgeDir !== 1) { edgeDir = 1; if (edgeTimer) clearTimeout(edgeTimer); edgeTimer = setTimeout(() => { if (window.deskGo) window.deskGo(cur + 1); }, EDGE_DELAY); }
          } else { clearEdge(); }
        }
        dropInfo = computeDrop(el, ev.clientX, ev.clientY);
        updateDropLine(dropInfo);
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (captured && el.releasePointerCapture) { try { el.releasePointerCapture(e.pointerId); } catch (er) {} }
        dragging = false;
        clone.remove();
        el.classList.remove('desk-dragging');
        clearDropLine();
        clearEdge();
        edgeL.remove(); edgeR.remove();
        if (dropInfo) doDrop(el, dropInfo);
      };
      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }

    function computeDrop(dragged, clientX, clientY) {
      const inGrid = !!dragged.closest('.app-grid');
      if (inGrid) {
        const grid = dragged.closest('.app-grid');
        const apps = Array.prototype.slice.call(grid.querySelectorAll('.app'))
          .filter(a => a !== dragged && a.style.display !== 'none' && !a.hidden);
        for (const a of apps) {
          const r = a.getBoundingClientRect();
          if (clientX < r.left + r.width / 2 && clientY < r.top + r.height / 2) {
            return { type: 'grid', grid: grid, ref: a, before: true };
          }
        }
        for (const a of apps) {
          const r = a.getBoundingClientRect();
          if (clientY < r.bottom) return { type: 'grid', grid: grid, ref: a, before: false };
        }
        if (apps.length) return { type: 'grid', grid: grid, ref: apps[apps.length - 1], before: false };
        return null;
      }
      const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
      // 用 deskIdx()（go() 立即更新）而非 scrollLeft——翻页中途 scrollLeft 在两页之间会算错页
      let curIdx = window.deskIdx ? window.deskIdx() : 0;
      curIdx = Math.max(0, Math.min(slides.length - 1, curIdx));
      const slide = slides[curIdx];
      if (!slide) return null;
      const items = Array.prototype.slice.call(slide.querySelectorAll('[data-desk-widget]')).filter(n => {
        if (n === dragged) return false;
        const p = n.parentElement;
        if (p === slide) return true;
        if (p && p.closest('[data-desk-widget]')) return false;
        return true;
      });
      for (const n of items) {
        const r = n.getBoundingClientRect();
        if (clientY < r.top + r.height / 2) return { type: 'slide', slide: slide, ref: n, before: true };
      }
      if (items.length) return { type: 'slide', slide: slide, ref: items[items.length - 1], before: false };
      return { type: 'slide', slide: slide, ref: null, before: false };
    }

    function updateDropLine(info) {
      if (!info || !info.ref) { clearDropLine(); return; }
      const r = info.ref.getBoundingClientRect();
      const cls = 'desk-drop-line ' + (info.type === 'grid' ? 'vert' : 'horiz');
      if (!dropLine) { dropLine = document.createElement('div'); document.body.appendChild(dropLine); }
      if (dropLine.className !== cls) dropLine.className = cls;
      if (info.type === 'grid') {
        dropLine.style.width = '';
        dropLine.style.height = r.height + 'px';
        dropLine.style.top = r.top + 'px';
        dropLine.style.left = (info.before ? r.left : r.right) + 'px';
      } else {
        dropLine.style.height = '';
        dropLine.style.width = r.width + 'px';
        dropLine.style.left = r.left + 'px';
        dropLine.style.top = (info.before ? r.top : r.bottom) + 'px';
      }
    }

    function doDrop(dragged, info) {
      if (info.type === 'grid') {
        if (info.ref && dragged !== info.ref) {
          if (info.before) info.grid.insertBefore(dragged, info.ref);
          else info.grid.insertBefore(dragged, info.ref.nextSibling);
        }
        const order = Array.prototype.slice.call(info.grid.querySelectorAll('.app')).map(a => a.dataset.app);
        store.set('app-icon-order-' + info.grid.dataset.app, JSON.stringify(order));
      } else {
        const slides = Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide'));
        const targetIdx = slides.indexOf(info.slide);
        if (dragged.parentNode !== info.slide) {
          const addBtn = info.slide.querySelector('.desk-page-add');
          if (addBtn) info.slide.insertBefore(dragged, addBtn);
          else info.slide.appendChild(dragged);
        }
        if (info.ref && dragged !== info.ref) {
          if (info.before) info.slide.insertBefore(dragged, info.ref);
          else info.slide.insertBefore(dragged, info.ref.nextSibling);
        }
        try { saveDeskLayout(); } catch (e) {}
        Array.prototype.slice.call(pagesBox.querySelectorAll('.page-slide')).forEach(s => { try { syncPageHint(s); } catch (e) {} });
        if (targetIdx >= 0 && window.deskGo) window.deskGo(targetIdx); // 跨页后停在目标页
      }
      if (window.deskRebuild) window.deskRebuild();
      if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) {}
    }

    // 点空白退出移动模式
    pagesBox.addEventListener('click', (e) => {
      if (!inMoveMode) return;
      if (e.target.closest('[data-desk-widget], .app, .desk-page-add, .desk-lib, .decor-bar')) return;
      if (window.exitDecor) window.exitDecor();
    }, true);
  }

  // 已摸鱼天数：按和 TA 打卡或聊天的自然日统计
  // v3.9.x：改为全局累计（跨所有联系人按自然日去重），避免多联系人下每个桌面只显示各自天数
  function fishToday() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function getFishLog() {
    try { return JSON.parse(gStore.get('fish-log') || '[]'); } catch (e) { return []; }
  }
  function logFish() {
    const list = getFishLog();
    const t = fishToday();
    if (list.indexOf(t) === -1) {
      list.push(t);
      gStore.set('fish-log', JSON.stringify(list));
    }
    updateFishDays();
  }
  function updateFishDays() {
    const el = document.getElementById('fish-days');
    if (el) el.textContent = getFishLog().length || 0;
  }
  window.logFish = logFish; // 供聊天页调用
  // v3.9.x：一次性迁移——把各联系人命名空间下的旧 fish-log 合并到全局 fish-log（按自然日去重）
  function migrateFishLogGlobal(setMark) {
    try {
      const all = new Set();
      try { JSON.parse(gStore.get('fish-log') || '[]').forEach(d => all.add(d)); } catch (e) {}
      const contacts = window.getContacts ? window.getContacts() : [{ id: 'default' }];
      contacts.forEach(c => {
        try {
          const s = window.xyStore('xy-home-v2:' + c.id);
          JSON.parse(s.get('fish-log') || '[]').forEach(d => all.add(d));
        } catch (e) {}
      });
      if (all.size) gStore.set('fish-log', JSON.stringify(Array.from(all).sort()));
      if (setMark) gStore.set('fish-log-global-migrated', '1');
    } catch (e) {}
  }
  migrateFishLogGlobal(false); // 模块加载时先合并 LS 已有的
  updateFishDays();

  // 兼容旧数据：以前打过卡但未计入摸鱼天数的，自动补记（旧标记视为今天打卡）
  (function () {
    const ck = store.get('checkin');
    if (ck) {
      const d = ck === '1' ? fishToday() : ck; // 旧格式 '1' -> 今天；新格式为日期
      const list = getFishLog();
      if (list.indexOf(d) === -1) {
        list.push(d);
        gStore.set('fish-log', JSON.stringify(list));
        updateFishDays();
      }
    }
  })();

  // 今日情话：每天固定随机一条（按日期种子，当天不变，隔天换新）
  // 字卡库「桌面今日情话」可自定义字卡库；未自定义时用默认库
  // v3.6.x：抽成可复用函数——多桌面切换联系人后重读新桌面的字卡库与存档
  function renderQuoteOfDay() {
    const el = document.getElementById('love-quote');
    if (!el) return;
    const text = (window.getQuoteOfDay && window.getQuoteOfDay()) || '我偏爱你。';
    el.textContent = window.taFit ? window.taFit(text) : text;
    // 今日情话存档：每天一条，全部历史保存在主页（同一天不重复）
    try {
      const today = fishToday();
      const list = JSON.parse(store.get('quote-history') || '[]');
      if (!list.length || list[0].date !== today) {
        list.unshift({ date: today, text: text, ts: Date.now() });
        store.set('quote-history', JSON.stringify(list));
      }
    } catch (e) {}
  }
  renderQuoteOfDay();

  // 恋爱纪念日：已在一起天数（默认不预设日期，设置页选择后显示）
  function updateLove() {
    const start = store.get('love-start');
    const daysEl = document.getElementById('love-days');
    const dateEl = document.getElementById('love-date');
    const mDays = document.getElementById('mem-love-days');
    const mDate = document.getElementById('mem-love-date');
    const mNext = document.getElementById('mem-next');
    if (!start) {
      if (daysEl) daysEl.textContent = '';
      if (dateEl) dateEl.textContent = '';
      if (mDays) mDays.textContent = '—';
      if (mDate) mDate.textContent = '';
      if (mNext) mNext.textContent = '请先设置恋爱纪念日';
      return;
    }
    const d = new Date(start + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const days = Math.max(1, Math.floor((new Date() - d) / 864e5));
    const fmt = start.split('-').join('.');
    if (daysEl) daysEl.textContent = days + ' 天';
    if (dateEl) dateEl.textContent = fmt + ' 起 · 我们在一起';
    if (mDays) mDays.textContent = days;
    if (mDate) mDate.textContent = fmt + ' 起 · 我们在一起';
    // 下一个纪念日倒计时（下次同月同日）
    const now = new Date();
    const ann = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (ann.getTime() < now.getTime()) ann.setFullYear(ann.getFullYear() + 1);
    const cd = Math.ceil((ann - now) / 864e5);
    if (mNext) mNext.textContent = '还有 ' + cd + ' 天 · ' + (ann.getMonth() + 1) + ' 月 ' + ann.getDate() + ' 日';
  }
  updateLove();

  // 设置页恋爱纪念日：原生日期选择器（任何浏览器/手机上都能点开）
  const dateInput = document.getElementById('love-date-input');
  const dateBtnTxt = document.getElementById('love-date-btn-txt');
  const dateBtn = document.getElementById('love-date-btn');
  // 把已选的日期显示到按钮文字上（原生 date input 本身被覆盖为不可见）
  function syncLoveDateBtn(val) {
    if (!dateBtnTxt || !dateBtn) return;
    if (val) {
      const parts = val.split('-');
      dateBtnTxt.textContent = parts[0] + ' 年 ' + parts[1] + ' 月 ' + parts[2] + ' 日';
      dateBtn.setAttribute('data-set', '1');
    } else {
      dateBtnTxt.textContent = '点击设置日期';
      dateBtn.setAttribute('data-set', '0');
    }
  }
  if (dateInput) {
    const saved = store.get('love-start');
    if (saved) dateInput.value = saved;
    syncLoveDateBtn(dateInput.value);
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        store.set('love-start', dateInput.value);
        syncLoveDateBtn(dateInput.value);
        updateLove();
      }
    });
  }

  // 其他纪念日：可自由添加/删除（存本地）
  // 条目：{ name, date, type }——type: 'ann' 纪念日（已 X 天）/ 'count' 倒数日（还有 X 天）
  function getExtras() {
    try { return JSON.parse(store.get('mem-extras') || '[]'); } catch (e) { return []; }
  }
  function saveExtras(list) { store.set('mem-extras', JSON.stringify(list)); }
  function renderExtras() {
    const list = document.getElementById('mem-extra-list');
    if (!list) return;
    const extras = getExtras();
    list.innerHTML = '';
    extras.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'mem-extra';
      const target = new Date(it.date + 'T00:00:00');
      // v3.5.131：非法日期（导入的脏数据）跳过，不再显示"还有 NaN 天"
      if (isNaN(target.getTime())) return;
      // diff 正 = 日期在未来（倒计时）；负 = 已过
      const diff = Math.round((target.getTime() - Date.now()) / 864e5);
      const isCount = it.type === 'count' || diff > 0;
      const label = isCount
        ? (diff > 0 ? '还有 ' + diff + ' 天' : '就是今天')
        : '已 ' + Math.abs(diff) + ' 天';
      const fmt = it.date.split('-').join('.');
      d.innerHTML =
        '<span class="me-name">' + it.name + '</span>' +
        '<span class="me-date">' + fmt + '</span>' +
        '<span class="me-days' + (isCount ? ' count' : '') + '">' + label + '</span>' +
        '<button class="me-del">✕</button>';
      d.querySelector('.me-del').addEventListener('click', () => {
        const ex = getExtras();
        ex.splice(i, 1);
        saveExtras(ex);
        renderExtras();
      });
      list.appendChild(d);
    });
  }
  const memAdd = document.getElementById('mem-add');
  if (memAdd) {
    memAdd.addEventListener('click', openMemAddModal);
  }

  // ================= 添加纪念日 / 倒数日：日历选择弹层 =================
  // v3.5.29：从"文本输入名称+日期"改为可视化月历点选（更直观美观）
  let memMask = null;      // 弹层单例
  let memSelDate = '';     // 选中日期 'YYYY-MM-DD'
  let memSelType = 'auto'; // auto/ann/count
  let mvY = 0, mvM = -1;   // 弹层当前查看的年/月（-1=本月）
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function memToday() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function renderMemCal() {
    if (!memMask) return;
    const now = new Date();
    if (mvM < 0) { mvY = now.getFullYear(); mvM = now.getMonth(); }
    const y = mvY, m = mvM;
    memMask.querySelector('.mem-cal-title').textContent = y + ' 年 ' + (m + 1) + ' 月';
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const startWd = first.getDay();
    const wds = ['日', '一', '二', '三', '四', '五', '六'];
    const t = memToday();
    let html = wds.map(w => '<span class="mem-cal-wd">' + w + '</span>').join('');
    for (let i = 0; i < startWd; i++) html += '<span class="mem-cal-cell blank"></span>';
    for (let d = 1; d <= days; d++) {
      const ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
      const isToday = ds === t;
      const isSel = ds === memSelDate;
      html += '<span class="mem-cal-cell' + (isToday ? ' today' : '') + (isSel ? ' sel' : '') + '" data-d="' + ds + '">' + d + '</span>';
    }
    const grid = memMask.querySelector('.mem-cal-grid');
    grid.innerHTML = html;
    grid.querySelectorAll('.mem-cal-cell[data-d]').forEach(cell => {
      cell.addEventListener('click', () => {
        memSelDate = cell.getAttribute('data-d');
        renderMemCal();
      });
    });
  }
  function closeMemAdd() {
    if (memMask) memMask.hidden = true;
  }
  function openMemAddModal() {
    if (!memMask) {
      memMask = document.createElement('div');
      memMask.id = 'mem-add-mask';
      memMask.className = 'mg-mask';
      memMask.innerHTML =
        '<div class="mg-panel mem-add-panel">' +
          '<div class="mg-head"><span>添加纪念日 / 倒数日</span><button class="mg-close">✕</button></div>' +
          '<input type="text" class="mem-add-input" placeholder="名称（如：在一起一周年 / 生日）" maxlength="24">' +
          '<div class="mem-cal">' +
            '<div class="mem-cal-nav">' +
              '<button class="mem-cal-btn" data-nav="-1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M15 18l-6-6 6-6"/></svg></button>' +
              '<span class="mem-cal-title"></span>' +
              '<button class="mem-cal-btn" data-nav="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M9 18l6-6-6-6"/></svg></button>' +
            '</div>' +
            '<div class="mem-cal-grid"></div>' +
          '</div>' +
          '<div class="mem-type-row">' +
            '<button class="mem-type-pill sel" data-type="auto">自动</button>' +
            '<button class="mem-type-pill" data-type="ann">纪念日</button>' +
            '<button class="mem-type-pill" data-type="count">倒数日</button>' +
          '</div>' +
          '<div class="mem-type-hint">未来日期自动按倒数日显示，过去日期按纪念日显示</div>' +
          '<div class="mem-add-foot">' +
            '<button class="mem-add-cancel">取消</button>' +
            '<button class="mem-add-ok">添加</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(memMask);
      memMask.querySelector('.mg-close').addEventListener('click', closeMemAdd);
      memMask.addEventListener('click', (e) => { if (e.target === memMask) closeMemAdd(); });
      memMask.querySelector('.mem-add-cancel').addEventListener('click', closeMemAdd);
      // 月份切换
      memMask.querySelectorAll('.mem-cal-btn').forEach(b => b.addEventListener('click', () => {
        mvM += parseInt(b.getAttribute('data-nav'), 10);
        if (mvM < 0) { mvM = 11; mvY--; }
        if (mvM > 11) { mvM = 0; mvY++; }
        renderMemCal();
      }));
      // 类型切换
      memMask.querySelectorAll('.mem-type-pill').forEach(b => b.addEventListener('click', () => {
        memSelType = b.getAttribute('data-type');
        memMask.querySelectorAll('.mem-type-pill').forEach(x => x.classList.toggle('sel', x === b));
      }));
      // 确定添加
      memMask.querySelector('.mem-add-ok').addEventListener('click', () => {
        // v3.6.x：用 input.mem-add-input 精确命中输入框锚点——手机端（安卓 Chrome/Edge）
        // contenteditable 转换器会在原 input 前插一个同类的 .ce-box div，querySelector('.mem-add-input')
        // 会先匹配到这个 div（div.value 恒为 undefined），导致名称永远为空、纪念日添加不了
        const nameInput = memMask.querySelector('input.mem-add-input');
        const name = (nameInput.value || '').trim();
        if (!name) { nameInput.focus(); toast('请填写名称'); return; }
        if (!memSelDate) { toast('请选择日期'); return; }
        const type = memSelType === 'auto'
          ? (new Date(memSelDate + 'T00:00:00').getTime() > Date.now() ? 'count' : 'ann')
          : memSelType;
        const ex = getExtras();
        ex.push({ name: name, date: memSelDate, type: type });
        saveExtras(ex);
        renderExtras();
        closeMemAdd();
      });
    }
    // 每次打开重置：默认今天 + 自动类型
    memMask.hidden = false;
    memSelDate = memToday();
    memSelType = 'auto';
    const nameInput = memMask.querySelector('input.mem-add-input');
    nameInput.value = '';
    memMask.querySelectorAll('.mem-type-pill').forEach(x => x.classList.toggle('sel', x.getAttribute('data-type') === 'auto'));
    mvY = 0; mvM = -1;
    renderMemCal();
    setTimeout(() => nameInput.focus(), 80);
  }

  // 纪念页：桌面【纪念】图标进入
  const memApp = document.querySelector('.app[data-app="memory"]');
  const memPage = document.getElementById('page-memory');
  if (memApp && memPage) {
    memApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      updateLove();
      renderExtras();
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      memPage.hidden = false;
    });
  }
  const memBack = document.getElementById('mem-back');
  if (memBack) {
    memBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const phonePage = document.getElementById('page-phone');
      if (phonePage) phonePage.hidden = false;
    });
  }

  // 清除本地数据（重置所有自定义内容）
  const resetRow = document.getElementById('row-reset');
  if (resetRow) {
    resetRow.addEventListener('click', () => {
      if (window.openModal) {
        window.openModal('确认清除所有本地数据？（头像、昵称、背景、图标、纪念日、打卡、聊天记录、字卡、音乐、设置）', '', () => {
          // v3.5.131：清空屏障——reload 触发的 beforeunload 会调 flushSave 把内存里的
          // 聊天记录写回（等于没清）；置标志后各模块的落盘路径跳过
          try { window.__resetting = true; } catch (e) {}
          // v3.5.109：彻底清除——除 uid 前缀键外，一并删除历史遗留的「裸键」
          //   （divine-history 是 v3.5.92 前占卜历史存的无前缀键，不删的话刷新后
          //   divination.histLoad 会把它重新迁回，等于没清除）
          const BARE_KEYS = ['divine-history'];
          try {
            Object.keys(localStorage)
              .filter(k => k.indexOf(window.activePrefix() + ':') === 0 || BARE_KEYS.indexOf(k) >= 0)
              .forEach(k => localStorage.removeItem(k));
          } catch (e) {}
          // 清会话级迁移标记（大键迁移标记，随会话残留无实际数据，一并清掉）
          try { sessionStorage.removeItem('xy-ls-big-migrated'); } catch (e) {}
          // 清空 IndexedDB（mochi-db）：只清 localStorage 不清 IDB 的话，
          // 刷新后 idbRestore 会把 IDB 里的旧数据全部回填，等于没清除（手机端必现）
          const idbDone = (window.idbClearAll && window.idbClearAll()) || Promise.resolve(true);
          // 顺带清理 Service Worker 离线缓存（只缓存页面静态资源，不含用户数据）
          if (window.caches && caches.keys) {
            try {
              caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).catch(() => {});
            } catch (e) {}
          }
          idbDone.then(() => { location.reload(); });
        }, { noInput: true });
      }
    });
  }

  // 每日打卡
  const checkin = document.querySelector('.checkin');
  if (checkin) {
    const btn = checkin.querySelector('.ck-btn');
    // v3.5.131：按日期判断——键存在但跨天时恢复可打卡（原逻辑首次打卡后永久锁定）
    if (store.get('checkin') === fishToday()) {
      btn.textContent = '✓ 已打卡';
      btn.classList.add('done');
    }
    // 打卡反馈弹窗（IAB 用页面内弹窗）
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
    checkin.addEventListener('click', () => {
      if (btn.classList.contains('done')) {
        toast('今天已经打过卡啦');
        return;
      }
      btn.textContent = '✓ 已打卡';
      btn.classList.add('done');
      store.set('checkin', fishToday()); // 存日期，便于识别是哪天打的卡
      logFish();
      const days = getFishLog().length;
      toast('打卡成功！已摸鱼 ' + days + ' 天');
    });
  }

  // 离周末还有几天（点击摸鱼 +1，当天数值）
  const weDays = document.getElementById('weekend-days');
  const weCount = document.getElementById('weekend-count');
  const weFish = document.getElementById('weekend-fish');
  if (weDays) {
    const day = new Date().getDay(); // 0=日 6=六
    let daysTo = (6 - day + 7) % 7;   // 距周六
    if (day === 6 || day === 0) {
      // 周六/周日都算周末（v3.5.x：周日曾误显示"离周末还有 6 天"）
      weDays.textContent = '今天是周末';
    } else {
      weDays.textContent = '离周末还有 ' + daysTo + ' 天';
    }
  }

  // ===== 摸鱼值（当天值 + 每日新增记录 + 历史累计）=====
  // 三套数据（v3.5.26 起）：
  //  - day-fish-<日期> / day-fish-ta-<日期>：当天摸鱼值（每天 0 点自动重置）
  //  - fish-day-add：每日新增记录 [{date,mine,ta}]（按日期独立累加，导入备份不会互相覆盖）
  //  - fish-total / fish-total-ta：历史累计（主页「每日摸鱼值」顶部展示）
  function fishDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function fishDayLog() {
    try { return JSON.parse(store.get('fish-day-add') || '[]'); } catch (e) { return []; }
  }
  function saveFishDayLog(list) { store.set('fish-day-add', JSON.stringify(list)); }
  function dayVal(k) { return parseInt(store.get(k) || '0', 10) || 0; }
  // 当天摸鱼值（读 day 键；新的一天自动从 0 开始）
  function todayMine() { return dayVal('day-fish-' + fishDayKey()); }
  function todayTa() { return dayVal('day-fish-ta-' + fishDayKey()); }
  // 增加当天摸鱼值：写入 day 键（当天）+ fish-day-add（每日新增）+ fish-total*（历史累计）
  function addFish(addMine, addTa) {
    const key = fishDayKey();
    if (addMine) {
      store.set('day-fish-' + key, String(todayMine() + addMine));
      store.set('fish-total', String((dayVal('fish-total') || 0) + addMine));
    }
    if (addTa) {
      store.set('day-fish-ta-' + key, String(todayTa() + addTa));
      store.set('fish-total-ta', String((dayVal('fish-total-ta') || 0) + addTa));
    }
    // 每日新增记录：当天独立累加（不覆盖历史）
    const list = fishDayLog();
    const ex = list.find(x => x.date === key);
    if (ex) { ex.mine += addMine || 0; ex.ta += addTa || 0; }
    else list.push({ date: key, mine: addMine || 0, ta: addTa || 0 });
    if (list.length > 365) list.splice(0, list.length - 365);
    saveFishDayLog(list);
  }
  // v3.13.x：跨模块加分口（番茄钟补偿摸鱼 / 抓包 TA 翻倍用）——加完同步桌面数值 UI
  window.addFishPts = function (addMine, addTa) {
    try { addFish(addMine || 0, addTa || 0); } catch (e) {}
    try { syncFishUI(); } catch (e) {}
  };
  // 一次性迁移 v3.5.25 及更早数据：
  //  旧 weekend-fish / weekend-fish-ta（历史累计）→ fish-total*（历史累计）
  //  旧 fish-day-log（按天累计值）→ 按天差值拆成每日新增 fish-day-add + 重建当天 day-fish-*
  (function () {
    if (store.get('fish-migrated')) return;
    try {
      const oldMine = parseInt(store.get('weekend-fish') || '0', 10) || 0;
      const oldTa = parseInt(store.get('weekend-fish-ta') || '0', 10) || 0;
      // 历史累计
      if (!store.get('fish-total') && oldMine) store.set('fish-total', String(oldMine));
      if (!store.get('fish-total-ta') && oldTa) store.set('fish-total-ta', String(oldTa));
      // 旧按天累计记录 → 每日新增（后一天减前一天）
      let oldLog = [];
      try { oldLog = JSON.parse(store.get('fish-day-log') || '[]'); } catch (e) {}
      if (Array.isArray(oldLog) && oldLog.length) {
        const days = [];
        let prevMine = 0, prevTa = 0;
        // v3.5.131：按日期数值排序（原字符串排序在跨月时错乱——'2026-10-1' < '2026-8-16'）
        // v3.6.x：iOS Safari 对不补零日期（'2026-8-16'）按 ISO 解析返回 NaN——先补零再解析，
        // 否则 iOS 上比较器恒为 0、排序失效（超过 365 天记录时 slice(-365) 会截错）
        const parseDay = (s) => {
          const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || ''));
          if (!m) return NaN;
          return Date.parse(m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) + 'T00:00:00');
        };
        const byDate = (a, b) => (parseDay(a.date) || 0) - (parseDay(b.date) || 0);
        oldLog.slice().sort(byDate).forEach(x => {
          const m = parseInt(x.mine || '0', 10) || 0;
          const t = parseInt(x.ta || '0', 10) || 0;
          days.push({ date: x.date, mine: Math.max(0, m - prevMine), ta: Math.max(0, t - prevTa) });
          prevMine = m; prevTa = t;
        });
        const list = fishDayLog(); // 新格式（迁移前为空）
        const map = {};
        list.forEach(x => { map[x.date] = x; });
        days.forEach(x => {
          if (map[x.date]) { map[x.date].mine += x.mine; map[x.date].ta += x.ta; }
          else map[x.date] = x;
        });
        const merged = Object.keys(map).map(k => map[k]).sort((a, b) => (parseDay(a.date) || 0) - (parseDay(b.date) || 0)).slice(-365);
        saveFishDayLog(merged);
        // 重建当天 day 键（今天的新增 = 记录里今天的新增）
        const key = fishDayKey();
        const today = merged.find(x => x.date === key);
        if (today) {
          store.set('day-fish-' + key, String(dayVal('day-fish-' + key) + (today.mine || 0)));
          store.set('day-fish-ta-' + key, String(dayVal('day-fish-ta-' + key) + (today.ta || 0)));
        }
      } else {
        // 无旧记录：旧累计直接作为当天值（沿用）
        const key = fishDayKey();
        if (oldMine) store.set('day-fish-' + key, String(oldMine));
        if (oldTa) store.set('day-fish-ta-' + key, String(oldTa));
      }
      store.set('fish-migrated', '1');
    } catch (e) {}
  })();

  // ===== 工作值（v3.5.65：与摸鱼值完全并行——当天值 + 每日新增记录 + 历史累计） =====
  //  - day-work-<日期> / day-work-ta-<日期>：当天工作值（每天 0 点自动重置）
  //  - work-day-add：每日新增记录 [{date,mine,ta}]
  //  - work-total / work-total-ta：历史累计（主页「每日打工值」顶部展示）
  function workDayLog() {
    try { return JSON.parse(store.get('work-day-add') || '[]'); } catch (e) { return []; }
  }
  function saveWorkDayLog(list) { store.set('work-day-add', JSON.stringify(list)); }
  function todayWorkMine() { return dayVal('day-work-' + fishDayKey()); }
  function todayWorkTa() { return dayVal('day-work-ta-' + fishDayKey()); }
  function addWork(addMine, addTa) {
    const key = fishDayKey();
    if (addMine) {
      store.set('day-work-' + key, String(todayWorkMine() + addMine));
      store.set('work-total', String((dayVal('work-total') || 0) + addMine));
    }
    if (addTa) {
      store.set('day-work-ta-' + key, String(todayWorkTa() + addTa));
      store.set('work-total-ta', String((dayVal('work-total-ta') || 0) + addTa));
    }
    const list = workDayLog();
    const ex = list.find(x => x.date === key);
    if (ex) { ex.mine += addMine || 0; ex.ta += addTa || 0; }
    else list.push({ date: key, mine: addMine || 0, ta: addTa || 0 });
    if (list.length > 365) list.splice(0, list.length - 365);
    saveWorkDayLog(list);
  }

  // 我的摸鱼值（当天，与按钮数值一致）
  const weMineEl = document.getElementById('weekend-mine');
  const weMineName = document.getElementById('weekend-mine-name');
  if (weMineName) {
    const myName = store.get('lbl-user') || '我';
    // v3.5.75：新结构 grid 两列（.pair > i）——按列标签更新昵称
    const lab = weMineName.querySelectorAll('.pair i');
    if (lab.length >= 2) { lab[0].textContent = myName + ' 摸鱼值'; lab[1].textContent = myName + ' 工作值'; }
  }
  if (weMineEl) {
    weMineEl.textContent = todayMine();
  }
  if (weFish) {
    // ===== v3.13.x：摸鱼连击 + TA 反向抓包 =====
    // 连击：2.5 秒内连续点击算一波；第 3 连起每次 +2（翻倍），断了从头算。
    //   当天/历史最高连击存 fish-combo-best（主页「每日摸鱼值」顶部展示）。
    // 反向抓包：90 秒内点满 8 次且过冷却（10 分钟）时 45% 概率被 TA 抓包——
    //   弹窗调侃 + 这次点击改记工作值（不进摸鱼）+ 当前连击清零。
    const COMBO_WIN = 2500;
    let comboLast = 0, comboRun = 0, runMax = 0, runTimer = null;
    let recent = []; // 最近点击时间戳（反向抓包判定）
    let weComboEl = null;
    function comboBest() {
      try {
        const o = JSON.parse(store.get('fish-combo-best') || 'null');
        const dk = fishDayKey();
        if (o && o.d === dk) return { today: o.t || 0, best: o.b || 0 };
        return { today: 0, best: (o && o.b) || 0 };
      } catch (e) { return { today: 0, best: 0 }; }
    }
    function comboBestSave(today, best) {
      store.set('fish-combo-best', JSON.stringify({ d: fishDayKey(), t: today, b: best }));
    }
    function comboShow(n) {
      if (!n) { if (weComboEl) weComboEl.classList.remove('on'); return; }
      if (!weComboEl) {
        weComboEl = document.createElement('span');
        weComboEl.className = 'we-combo';
        weFish.parentNode.appendChild(weComboEl);
      }
      weComboEl.textContent = '连击 ×' + n;
      weComboEl.classList.add('on');
    }
    function runEnd() {
      if (runMax >= 3) {
        const cb = comboBest();
        if (runMax > cb.best) {
          comboBestSave(Math.max(runMax, cb.today), runMax);
          toast('连击新纪录 ×' + runMax + '！');
          if (window.renderFishHistory) window.renderFishHistory();
        }
      }
      comboRun = 0; runMax = 0; comboShow(0);
    }
    window.getFishComboBest = function () { return comboBest(); };
    weFish.addEventListener('click', () => {
      const now = Date.now();
      // —— 反向抓包判定 ——
      recent = recent.filter(t => now - t < 90 * 1000);
      recent.push(now);
      let caughtCd = 0;
      try { caughtCd = parseInt(store.get('fish-caught-me:last') || '0', 10) || 0; } catch (e) {}
      if (recent.length >= 8 && now - caughtCd > 10 * 60 * 1000 && Math.random() < 0.45 && window.openModal) {
        store.set('fish-caught-me:last', String(now));
        recent = [];
        comboRun = 0; runMax = 0; comboShow(0);
        addWork(1, 0); // 被抓包：这次算打工，不进摸鱼
        syncFishUI();
        const taName = store.get('lbl-partner') || 'TA';
        const tease = [
          '点这么快，老板就在身后吧？这次给你记成工作值啦。',
          '被抓包了！摸鱼太频繁会被发现的——这条先算打工。',
          '『你刚才是不是在疯狂点？』——嗯，被看见了。这次记工作值。',
          '摸鱼要有节奏感。连续猛点会被抓的，这条算你打工。'
        ][Math.floor(Math.random() * 4)];
        // v3.15.x：被抓包事件写入主页「摸鱼抓包」记录（双向之一：TA 抓到我）
        if (window.addFishCatchRecord) {
          try { window.addFishCatchRecord('ta', tease); } catch (e) {}
        }
        window.openModal('被 ' + taName + ' 抓包了！', '', () => {}, {
          noInput: true,
          staticText: (window.taFit ? window.taFit(tease) : tease) + '\n\n本次点击已改为 工作值 +1'
        });
        return;
      }
      // —— 连击 ——
      comboRun = (now - comboLast <= COMBO_WIN) ? comboRun + 1 : 1;
      comboLast = now;
      runMax = Math.max(runMax, comboRun);
      const pts = comboRun >= 3 ? 2 : 1; // 第 3 连起翻倍
      addFish(pts, 0);
      comboShow(comboRun);
      clearTimeout(runTimer);
      runTimer = setTimeout(runEnd, COMBO_WIN + 100);
      if (weCount) weCount.textContent = todayMine();
      if (weMineEl) weMineEl.textContent = todayMine();
      if (window.logFish) window.logFish();
    });
  }
  // 联系人摸鱼值：使用网站时每 60 秒 60% 概率 +1~10（当天值 + 每日记录 + 历史累计）
  // 我的摸鱼值：同样每 60 秒 60% 概率 +1~10（自动增长，按钮点击仍可 +1）
  const weTaEl = document.getElementById('weekend-ta');
  const weTaName = document.getElementById('weekend-ta-name');
  if (weTaName) {
    const name = store.get('lbl-partner') || 'TA';
    // v3.5.75：新结构 grid 两列（.pair > i）——按列标签更新昵称，不覆盖 pair 结构
    const lab = weTaName.querySelectorAll('.pair i');
    if (lab.length >= 2) { lab[0].textContent = name + ' 摸鱼值'; lab[1].textContent = name + ' 工作值'; }
  }
  function syncFishUI() {
    const mine = todayMine();
    const ta = todayTa();
    if (weMineEl) weMineEl.textContent = mine;
    if (weTaEl) weTaEl.textContent = ta;
    if (weCount) weCount.textContent = mine;
    // v3.5.65：工作值同步显示（桌面小字 + 主页历史）
    const wMine = todayWorkMine();
    const wTa = todayWorkTa();
    const weWorkMine = document.getElementById('weekend-work');
    const weWorkTa = document.getElementById('weekend-work-ta');
    if (weWorkMine) weWorkMine.textContent = wMine;
    if (weWorkTa) weWorkTa.textContent = wTa;
    // v3.5.74：昵称标签同步（摸鱼值 + 工作值标签一起更新昵称）
    const myName = store.get('lbl-user') || '我';
    const taName = store.get('lbl-partner') || 'TA';
    if (weMineName) {
      const lm = weMineName.querySelectorAll('.pair i');
      if (lm.length >= 2) { lm[0].textContent = myName + ' 摸鱼值'; lm[1].textContent = myName + ' 工作值'; }
    }
    if (weTaName) {
      const lt = weTaName.querySelectorAll('.pair i');
      if (lt.length >= 2) { lt[0].textContent = taName + ' 摸鱼值'; lt[1].textContent = taName + ' 工作值'; }
    }
    if (window.renderFishHistory) window.renderFishHistory();
    if (window.renderWorkHistory) window.renderWorkHistory();
  }
  if (weTaEl) {
    syncFishUI();
    setInterval(() => {
      try {
        if (document.hidden) return; // v3.5.127：后台不累计摸鱼/打工值
        // v3.13.x：番茄钟专注进行中——摸鱼值双方冻结（TA 在旁边安静陪），
        //   完成专注后由番茄钟结算「补偿摸鱼」；工作值照常累计（专注=在打工）
        if (window.pomoFocusActive && window.pomoFocusActive()) {
          let awm = 0, awt = 0;
          if (Math.random() * 100 < 60) awm = 1 + Math.floor(Math.random() * 10);
          if (Math.random() * 100 < 60) awt = 1 + Math.floor(Math.random() * 10);
          if (awm || awt) { addWork(awm, awt); syncFishUI(); }
          return;
        }
        let addMine = 0, addTa = 0, addWM = 0, addWT = 0;
        // 摸鱼值：双方各 60% 概率 +1~10
        if (Math.random() * 100 < 60) addTa = 1 + Math.floor(Math.random() * 10);
        if (Math.random() * 100 < 60) addMine = 1 + Math.floor(Math.random() * 10);
        // 工作值：同样各 60% 概率 +1~10（与摸鱼值刷新机制一致）
        if (Math.random() * 100 < 60) addWT = 1 + Math.floor(Math.random() * 10);
        if (Math.random() * 100 < 60) addWM = 1 + Math.floor(Math.random() * 10);
        if (addMine || addTa) addFish(addMine, addTa);
        if (addWM || addWT) addWork(addWM, addWT);
        syncFishUI();
      } catch (e) {}
    }, 60000);
  }
  // 每日摸鱼值历史（供主页展示；fish-day-add 按日期独立，最新在前）
  window.getFishHistory = function () { return fishDayLog().slice().reverse(); };
  // 历史累计（供主页顶部展示）
  window.getFishTotals = function () {
    return { mine: dayVal('fish-total'), ta: dayVal('fish-total-ta') };
  };
  // v3.5.65：每日工作值历史 + 累计（供主页「每日打工值」）
  window.getWorkHistory = function () { return workDayLog().slice().reverse(); };
  window.getWorkTotals = function () {
    return { mine: dayVal('work-total'), ta: dayVal('work-total-ta') };
  };

  // 可二传二改的说明：点设置行 → 全屏说明页
  const licRow = document.getElementById('row-license');
  if (licRow) {
    licRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const licPage = document.getElementById('page-license');
      if (licPage) licPage.hidden = false;
    });
  }
  const licBack = document.getElementById('lic-back');
  if (licBack) {
    licBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const setPage = document.getElementById('page-setting');
      if (setPage) setPage.hidden = false;
    });
  }

  // 原版功能介绍：点设置行 → 全屏介绍页
  const aboutRow = document.getElementById('row-about');
  if (aboutRow) {
    aboutRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const aboutPage = document.getElementById('page-about');
      if (aboutPage) aboutPage.hidden = false;
    });
  }
  const aboutBack = document.getElementById('about-back');
  if (aboutBack) {
    aboutBack.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const setPage = document.getElementById('page-setting');
      if (setPage) setPage.hidden = false;
    });
  }

  // 通话设置：点设置行 → 全屏设置页
  const callSettingsRow = document.getElementById('row-call-settings');
  if (callSettingsRow) {
    callSettingsRow.addEventListener('click', () => {
      document.querySelectorAll('.page').forEach(p => p.hidden = true);
      const csPage = document.getElementById('page-call-settings');
      if (csPage) csPage.hidden = false;
    });
  }

  // ===== v3.7.x：新增桌面小组件（时钟 / 月历 / 计时器 / 纪念日倒计时） =====
  // 时钟：实时更新时:分 + 星期 + 月日
  let deskClockTimer = null;
  function initDeskClock() {
    const el = document.getElementById('dc-time');
    const dateEl = document.getElementById('dc-date');
    if (!el || !dateEl || deskClockTimer) return;
    const week = ['日','一','二','三','四','五','六'];
    const update = () => {
      const d = new Date();
      const p = (n) => (n < 10 ? '0' + n : '' + n);
      el.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
      dateEl.textContent = '星期' + week[d.getDay()] + ' · ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    };
    update();
    deskClockTimer = setInterval(update, 5000);
  }
  // 月历：当月网格，高亮今天，标注有留言的日子，点击跳日历页
  function renderDeskCalendar() {
    const grid = document.getElementById('dcal-grid');
    const title = document.getElementById('dcal-title');
    if (!grid || !title) return;
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const p2 = (n) => (n < 10 ? '0' + n : '' + n);
    title.textContent = y + ' 年 ' + (m + 1) + ' 月';
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push('<span class="dcal-cell empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = y + '-' + p2(m + 1) + '-' + p2(d);
      const isToday = d === now.getDate();
      const hasMsg = !!store.get('cal-my-' + ds);
      cells.push('<span class="dcal-cell' + (isToday ? ' today' : '') + (hasMsg ? ' has-msg' : '') + '" data-date="' + ds + '">' + d + '</span>');
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.dcal-cell:not(.empty)').forEach(c => {
      c.addEventListener('click', () => {
        const calApp = document.querySelector('.app[data-app="calendar"]');
        if (calApp) calApp.click();
      });
    });
  }
  // 计时器：正计时 + 倒计时
  let deskTimerBound = false, dtTimer = null;
  let dtState = { mode: 'up', running: false, startTs: 0, elapsed: 0, target: 0 };
  function initDeskTimer() {
    const disp = document.getElementById('dt-disp');
    const startBtn = document.getElementById('dt-start');
    const resetBtn = document.getElementById('dt-reset');
    const modeBtn = document.getElementById('dt-toggle-mode');
    const modeLabel = document.getElementById('dt-mode-label');
    if (!disp || !startBtn || deskTimerBound) return;
    deskTimerBound = true;
    const fmt = (ms) => {
      if (ms < 0) ms = 0;
      const t = Math.floor(ms / 100);
      const mm = Math.floor(t / 600), ss = Math.floor((t % 600) / 10), ds = t % 10;
      return (mm < 10 ? '0' + mm : '' + mm) + ':' + (ss < 10 ? '0' + ss : '' + ss) + '.' + ds;
    };
    const render = () => {
      if (dtState.mode === 'up') {
        const ms = dtState.running ? (Date.now() - dtState.startTs + dtState.elapsed) : dtState.elapsed;
        disp.textContent = fmt(ms);
      } else {
        const remain = dtState.running ? (dtState.target - (Date.now() - dtState.startTs) - dtState.elapsed) : (dtState.target - dtState.elapsed);
        disp.textContent = fmt(remain);
        if (dtState.running && remain <= 0) {
          dtState.running = false;
          if (dtTimer) { clearInterval(dtTimer); dtTimer = null; }
          startBtn.textContent = '开始';
          disp.textContent = '00:00.0';
          toast('倒计时结束');
          try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
        }
      }
    };
    startBtn.addEventListener('click', () => {
      if (dtState.mode === 'down' && !dtState.running && dtState.target <= 0) {
        if (!window.openModal) return;
        window.openModal('倒计时分钟数', '5', (v) => {
          const min = parseFloat(v);
          if (!min || min <= 0) { toast('请输入有效分钟数'); return; }
          dtState.target = min * 60000;
          dtState.elapsed = 0;
          dtState.startTs = Date.now();
          dtState.running = true;
          startBtn.textContent = '暂停';
          if (dtTimer) clearInterval(dtTimer);
          dtTimer = setInterval(render, 100);
          render();
        });
        return;
      }
      if (dtState.running) {
        dtState.elapsed += Date.now() - dtState.startTs;
        dtState.running = false;
        if (dtTimer) { clearInterval(dtTimer); dtTimer = null; }
        startBtn.textContent = '继续';
      } else {
        dtState.startTs = Date.now();
        dtState.running = true;
        if (dtTimer) clearInterval(dtTimer);
        dtTimer = setInterval(render, 100);
        startBtn.textContent = '暂停';
      }
      render();
    });
    resetBtn.addEventListener('click', () => {
      dtState.running = false; dtState.elapsed = 0; dtState.target = 0;
      if (dtTimer) { clearInterval(dtTimer); dtTimer = null; }
      startBtn.textContent = '开始';
      disp.textContent = '00:00.0';
    });
    modeBtn.addEventListener('click', () => {
      if (dtState.running) { toast('请先暂停再切换模式'); return; }
      dtState.mode = dtState.mode === 'up' ? 'down' : 'up';
      dtState.elapsed = 0; dtState.target = 0;
      modeLabel.textContent = dtState.mode === 'up' ? '正计时' : '倒计时';
      modeBtn.textContent = dtState.mode === 'up' ? '倒计时' : '正计时';
      startBtn.textContent = '开始';
      disp.textContent = '00:00.0';
    });
    render();
  }
  // 纪念日倒计时：读 love-start + mem-extras，找未来最近的纪念日
  function renderDeskAnniv() {
    const daysEl = document.getElementById('da-days');
    const nameEl = document.getElementById('da-name');
    if (!daysEl || !nameEl) return;
    const now = new Date();
    const cands = [];
    const start = store.get('love-start');
    if (start) {
      const d = new Date(start + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        let ann = new Date(now.getFullYear(), d.getMonth(), d.getDate());
        if (ann.getTime() < now.getTime()) ann.setFullYear(ann.getFullYear() + 1);
        cands.push({ name: '恋爱纪念日', date: ann });
      }
    }
    try {
      const extras = JSON.parse(store.get('mem-extras') || '[]');
      extras.forEach(it => {
        if (!it.date) return;
        const d = new Date(it.date + 'T00:00:00');
        if (isNaN(d.getTime())) return;
        let dt = new Date(d.getTime());
        if (dt.getTime() < now.getTime()) {
          dt = new Date(now.getFullYear(), d.getMonth(), d.getDate());
          if (dt.getTime() < now.getTime()) dt.setFullYear(dt.getFullYear() + 1);
        }
        cands.push({ name: it.name || '纪念日', date: dt });
      });
    } catch (e) {}
    if (!cands.length) {
      daysEl.textContent = '—';
      nameEl.textContent = '未设置纪念日';
      return;
    }
    cands.sort((a, b) => a.date - b.date);
    const next = cands[0];
    const days = Math.ceil((next.date - now) / 864e5);
    daysEl.textContent = days + ' 天';
    nameEl.textContent = next.name + ' · ' + (next.date.getMonth() + 1) + ' 月 ' + next.date.getDate() + ' 日';
  }
  function renderDeskWidgets() {
    try { initDeskClock(); } catch (e) {}
    try { renderDeskCalendar(); } catch (e) {}
    try { initDeskTimer(); } catch (e) {}
    try { renderDeskAnniv(); } catch (e) {}
    try { window.periodRenderDeskWidget && window.periodRenderDeskWidget(); } catch (e) {}
  }
  renderDeskWidgets();

  // v3.6.x：多桌面——切换联系人后刷新桌面外观（壁纸/自定义图标/打卡/摸鱼展示）。
  // store 是动态绑定当前联系人的，restoreAppIcons/applyBgVisibility 会读新桌面的值；
  // 打卡按钮状态按新桌面的 checkin 键重新判断。
  document.addEventListener('contact-switched', function () {
    try { applyBgVisibility(); } catch (e) {}
    try { restoreAppIcons(); } catch (e) {}
    // v3.10.x：切桌面后按新命名空间重应用卡片背景/页面背景/图片组件 + 直读兜底
    //（这些大图键只存 IndexedDB，切桌面瞬间 memoryCache 可能还没新桌面的值）
    try { refreshDeskVisuals(); } catch (e) {}
    try { rescueDeskVisuals(); } catch (e) {}
    // v3.6.x：小组件三色（背景/边框/按钮）按桌面独立——切换后重新应用新桌面的值
    try { applyWidgetColor(store.get('widget-bg-color') || '#ffffff'); } catch (e) {}
    try { applyWidgetBorder(store.get('widget-border-color') || 'rgba(0,0,0,.1)'); } catch (e) {}
    try { applyWidgetBtn(store.get('widget-btn-color') || '#111111'); } catch (e) {}
    try { applyWidgetBtnText(store.get('widget-btn-text-color') || '#ffffff'); } catch (e) {}
    try { applyWidgetHeart(store.get('widget-heart-color') || '#111111'); } catch (e) {}
    try { const op = store.get('widget-opacity'); if (op) applyWidgetOpacity(parseInt(op, 10)); } catch (e) {}
    try { applyIcoRadius(getIcoRadius()); } catch (e) {}
    try {
      const btn = document.querySelector('.checkin .ck-btn');
      if (btn) {
        if (store.get('checkin') === fishToday()) {
          btn.textContent = '✓ 已打卡';
          btn.classList.add('done');
        } else {
          btn.textContent = '打卡';
          btn.classList.remove('done');
        }
      }
    } catch (e) {}
    try {
      const cnt = document.getElementById('weekend-count');
      if (cnt) cnt.textContent = String(dayVal('fish-total'));
    } catch (e) {}
    // v3.6.x：摸鱼天数 / 恋爱纪念日 / 今日情话 / 其他纪念日列表——初始化只跑一次，
    // 切换联系人后必须按新桌面的 store 重新渲染（store 动态绑定当前联系人）
    try { updateFishDays(); } catch (e) {}
    try { updateLove(); } catch (e) {}
    try { renderQuoteOfDay(); } catch (e) {}
    try { renderExtras(); } catch (e) {}
    try { renderDeskWidgets(); } catch (e) {}
    // v3.6.x：桌面双方昵称（lbl-user / lbl-partner）只在加载时写一次，
    // 切换联系人后必须按新桌面的 store 重新渲染，否则残留上一个联系人的名字
    // （新联系人未设昵称时回退默认「我 / TA」）
    try {
      const lu = document.getElementById('lbl-user');
      if (lu) { const v = store.get('lbl-user'); lu.textContent = v || '我'; }
      const lp = document.getElementById('lbl-partner');
      if (lp) { const v = store.get('lbl-partner'); lp.textContent = v || 'TA'; }
    } catch (e) {}
  });
})();
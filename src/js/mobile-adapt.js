// ===== 功能：手机端适配（v3.5.105，安卓 / iOS） =====
// CSS 已处理：输入框字号 16px 防 iOS 聚焦缩放、safe-area 底部留白、overscroll 防回弹
// 这里补 JS 层：iOS 手势/双击缩放兜底 + 文本输入框 contenteditable 化（防 Chrome 自动填充条）
//              + 输入法适配（v3.6.x 最小干预，不再锁 .phone 高度）+ 弹层滚动穿透锁
(function () {
  // 只在真实手机窄屏启用（桌面模拟器外壳不受影响）
  // v3.5.137：900px——Moto G100 等 2400px 物理屏 / DPR 2.75-3 的 CSS 视口约 800-873px，
  // 原 768px 上限会误判为桌面（显示 390px 小手机框 + 两侧灰底）
  let isMobile = false;
  try { isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches; } catch (e) {}

  // v3.7.x：iPad/平板检测——iPad 竖屏（768-834px CSS 视口）命中 isMobile 走手机全屏
  // 布局，内容被整屏拉宽（桌面图标间距巨大、气泡过宽）；iPad 横屏（≥1024px）走
  // 桌面模拟器外壳（390px 小框 + 两侧灰底）。两者都不适合平板。
  // 命中给 <html> 加 .tablet 类（base.css 平板布局：全高 + 内容限宽居中 +
  // 无模拟器外壳，竖屏/横屏观感一致）。
  // iPadOS 13+ 的 UA 伪装成 Macintosh（桌面 macOS UA + 触摸屏 maxTouchPoints>1），
  // 老系统 UA 带 iPad 关键字，两种都覆盖。
  let isTablet = false;
  try {
    const ua = String(navigator.userAgent || '');
    const plat = String(navigator.platform || '');
    // v3.7.x：/iPad/ 分支加 Android 排除——UA 伪装成 iPad 的安卓窄屏机（OPPO/Via 等）
    //   会被误判为平板走手机全屏布局，内容整屏拉宽。真 iPad 不含 Android 关键字，安全
    isTablet = (/iPad/i.test(ua) || plat === 'iPad') && !/android/i.test(ua) ||
      ((plat === 'MacIntel' || /Macintosh/i.test(ua)) && navigator.maxTouchPoints > 1 && 'ontouchstart' in window);
  } catch (e) {}
  if (isTablet) { try { document.documentElement.classList.add('tablet'); } catch (e) {} }

  // v3.9.x：UA 桌面伪装兜底——Edge/Via 等浏览器「桌面站点」模式把 UA 改成
  // Windows 桌面、layout viewport 拉到 980px，上面 matchMedia('(max-width:900px)')
  // 误判为桌面，走桌面模拟器外壳（390px 小框 + 两侧灰底），手机上显示「变小/
  // PC 端布局」，且全屏开关成了「恢复正常大小」的开关（熄屏/重开又变小）。
  // 物理特征兜底：触摸屏 + 窄 screen.width（设备物理 CSS 宽度，不随 UA/layout
  // viewport 变）→ 实为手机伪装桌面，强制走手机布局。真桌面 PC 无触摸屏不命中；
  // 平板 screen.width≥900 或已走 isTablet 分支不命中。
  if (!isMobile && !isTablet) {
    try {
      const sw = screen.width || screen.availWidth || 0;
      const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      if (sw > 0 && sw < 900 && touch) {
        isMobile = true;
        // 改 viewport meta 把 layout viewport 拉回设备宽度——让 CSS
        // @media(max-width:900px) 自然命中，所有手机端规则生效。桌面站点
        // 模式浏览器可能忽略 meta，下方加 force-mobile 类作 CSS 保底。
        try {
          document.querySelectorAll('meta[name="viewport"]').forEach(function (m) {
            m.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=overlays-content');
          });
        } catch (e) {}
        // 等一帧看媒体查询是否命中，未命中则加 force-mobile 类
        //（base.css 复刻 @media(max-width:900px) 关键规则作保底）
        try {
          requestAnimationFrame(function () {
            try {
              if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) {
                document.documentElement.classList.add('force-mobile');
              }
            } catch (e) {}
          });
        } catch (e) {}
      }
    } catch (e) {}
  }
  // 手机窄屏或平板都启用本文件适配（桌面模拟器外壳不受影响）
  if (!isMobile && !isTablet) return;

  // v3.6.x：iOS 检测——iOS Safari 上不启用 contenteditable 转换器（见下方 ceConvert 说明）
  // v3.7.x：加 Android 排除——UA 伪装成 iPhone 的安卓浏览器（OPPO/Via/夸克等）不应进 iOS 分支
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    && !/android/i.test(navigator.userAgent) && !window.MSStream;

  // iOS Safari：禁止双指/捏合手势缩放（配合 viewport 锁定，双保险）
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // 禁止双击放大页面（双击选中文本不在此列，长按选词不受影响）
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // v3.5.128：contenteditable 输入框转换器（手机端统一启用）——
  // Chrome 移动端对 <input>/<textarea> 聚焦必弹「自动填充」条（该版本无视
  // autocomplete=off / readonly / 关闭浏览器设置），聊天输入框已验证
  // contenteditable 方案可彻底规避。这里把站点所有文本输入框统一转换：
  // 原 input 退场为数据锚点（ghost），显示/输入由 contenteditable div 接管，
  // 通过 JS 定义 value/focus/blur/事件 实现与原代码全兼容，零改动其他模块。
  // v3.6.x：iOS Safari 不启用转换——该方案本为安卓 Chrome 的「自动填充条」而生，
  // iOS 上无此问题；而 contenteditable 在 iOS Safari 上已知会引发：聚焦键盘不弹、
  // :empty::before 占位符异常、派发 focus 干扰原生输入（页面卡住、无法输入文字）。
  // iOS 保留原生 input/textarea（聚焦弹键盘正常）。聊天输入框是模板原生
  // contenteditable div，不受此转换器影响，iOS Safari 原生支持 contenteditable。
  var ceInited = false;
  // v3.9.x：多行 ce-box 取值兜底——按 DOM 结构还原换行的纯文本提取器。
  // 背景：ce-box 是 white-space:pre-wrap 的 contenteditable，安卓标准内核按 Enter
  // 插入的是「字面 \n 文本节点」（渲染上可见分行），innerText 能还原；但夸克等
  // 内核的 innerText 实现会丢掉文本节点里的字面 \n（屏幕上明明分了行，读回却是
  // 一行）——批量导入「一行一个」全部并成 1 张卡的直接根因（华为 Mate 60 Pro
  // 夸克浏览器用户实测反馈）。这里不依赖内核 innerText 实现：
  //   · text 节点 → 原样保留（含字面 \n）
  //   · <br> → 一次换行
  //   · 块级元素（div/p/li/pre/blockquote）→ 前后补换行（粘贴富文本常见结构）
  function ceMultiText(box) {
    var out = '';
    function endNl() { return out.slice(-1) === '\n'; }
    function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3) { out += n.nodeValue || ''; continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        if (tag === 'BR') { out += '\n'; continue; }
        var block = tag === 'DIV' || tag === 'P' || tag === 'LI' || tag === 'PRE' || tag === 'BLOCKQUOTE';
        if (block) {
          if (out && !endNl()) out += '\n';
          walk(n);
          if (out && !endNl()) out += '\n';
        } else {
          walk(n);
        }
      }
    }
    walk(box);
    return out;
  }
  function initCeAll() {
    // 全量扫描可重复执行（ceConvert 内 dataset.ceDone 保证幂等），
    // 供 MutationObserver 处理动态新增的输入框（弹层/半框）
    // v3.5.133：补 input:not([type])——未写 type 的 input 默认 text 但不匹配 [type="text"]，
    // 漏转换的输入框（聊天搜索/字体名等）仍会弹 Chrome 自动填充条
    var list = document.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea');
    list.forEach(ceConvert);
    ceInited = true;
  }
  function ceConvert(inp) {
    if (!inp || inp.dataset.ceDone || inp.readOnly) return;
    var t = inp.type;
    // v3.6.x：原生选择器类型（date/time/datetime-local/…）不转换——转成 contenteditable
    // 后失去原生选择面板，且 contenteditable 不会派发 change 事件，恋爱纪念日这类
    // 依赖原生 picker 的输入会彻底失效（安卓 Chrome/Edge 上无法设置、桌面组件不更新）
    if (t === 'checkbox' || t === 'range' || t === 'file' || t === 'color' || t === 'hidden' ||
        t === 'date' || t === 'time' || t === 'datetime-local' || t === 'month' || t === 'week') return;
    inp.dataset.ceDone = '1';
    // 退场为幽灵锚点（占位1px不可见，保留 id 供现有代码 getElementById）
    inp.classList.add('ce-ghost');
    inp.setAttribute('aria-hidden', 'true');
    // 创建接管输入的 contenteditable div（插到 input 后面）
    var box = document.createElement('div');
    // 继承原输入框样式类（边框/背景/圆角等视觉不变）+ ce-box 基础排版
    box.className = 'ce-box ' + (inp.className || '');
    box.setAttribute('contenteditable', 'true');
    box.setAttribute('spellcheck', 'false');
    box.dataset.for = inp.id || '';
    // v3.5.138：复制 inputmode——数字输入框（回复设置 stepper 等设了 inputmode=decimal）
    // 转成 ce-box 后仍弹数字键盘，否则手机弹全键盘
    var inpMode = inp.getAttribute('inputmode');
    if (inpMode) box.setAttribute('inputmode', inpMode);
    var ph = inp.getAttribute('placeholder') || '';
    if (ph) box.setAttribute('data-ph', ph);
    // 高度：textarea 按行数估算，input 用原高度/默认
    if (inp.tagName === 'TEXTAREA') {
      var rows = parseInt(inp.getAttribute('rows'), 10) || 3;
      box.style.minHeight = Math.max(48, Math.round(rows * 1.5 * 16)) + 'px';
      box.style.resize = 'none';
    } else {
      box.style.minHeight = '24px';
    }
    box.style.display = 'block';
    box.style.boxSizing = 'border-box';
    // v3.5.133：复制原 inline style（margin 等元素选择器样式转换后丢失——
    // 如 #div-chat-question 的 margin:8px 0）；跳过 box 已设置的关键属性
    if (inp.getAttribute('style')) {
      var skip = ['display', 'min-height', 'box-sizing'];
      try {
        var st = inp.style;
        for (var si = 0; si < st.length; si++) {
          var pn = st[si];
          if (skip.indexOf(pn) >= 0) continue;
          var pv = st.getPropertyValue(pn);
          if (pv) box.style.setProperty(pn, pv);
        }
      } catch (e) {}
    }
    // v3.6.x：hidden 同步——原 input/textarea 可能被业务逻辑按需隐藏
    // （如通用弹层单行模式隐藏 textarea、编辑弹窗切输入/多行），contenteditable
    // box 必须跟随隐藏，否则会多出一个可见的占位框（昵称弹窗出现"多行内容"）。
    // 用内联 display 控制（hidden 属性会被 box.style.display='block' 覆盖，不生效）
    function syncCeHidden() {
      box.style.display = inp.hidden ? 'none' : 'block';
    }
    syncCeHidden();
    try {
      var hmo = new MutationObserver(syncCeHidden);
      hmo.observe(inp, { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) {}
    // maxlength 支持（contenteditable 不原生生效，手动截断）
    // v3.5.131：动态读取——maxLength 可能是弹窗打开后才设置的（openModal 设 input.maxLength），
    // 转换时固化会得到 0（安卓上昵称/备忘长度限制失效）
    var isMulti = inp.tagName === 'TEXTAREA';
    box.addEventListener('input', function () {
      var maxLen = parseInt(inp.getAttribute('maxlength'), 10) || inp.maxLength || 0;
      if (maxLen > 0 && box.textContent.length > maxLen) {
        // v3.5.133：按码点截断——UTF-16 slice 会切开 emoji 代理对产生乱码入库
        box.textContent = Array.from(box.textContent).slice(0, maxLen).join('');
        // 光标移到末尾
        try {
          var r = document.createRange();
          r.selectNodeContents(box);
          r.collapse(false);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (e) {}
      }
    });
    // v3.5.133：输入法组合结束补截一次（组合中被跳过的超长内容）
    box.addEventListener('compositionend', function () {
      var maxLen = parseInt(inp.getAttribute('maxlength'), 10) || inp.maxLength || 0;
      if (maxLen > 0 && box.textContent.length > maxLen) {
        box.textContent = Array.from(box.textContent).slice(0, maxLen).join('');
        try {
          var r = document.createRange();
          r.selectNodeContents(box);
          r.collapse(false);
          var s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        } catch (e) {}
      }
    });
    // 单行输入框：Enter 不插入换行（原 input 行为一致）
    if (!isMulti) {
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') e.preventDefault();
      });
    }
    // 注入数据锚点：input 的 value 读写、focus/blur、事件转发都由 box 代理
    inp.__ceBox = box;
    box.__ceInp = inp;
    // v3.5.128：box 必须插入 DOM（插到 input 前，ghost 只占 1px 不可见）——
    // 此前漏了插入，input 变 ghost 后用户看不到也输不了输入框
    try { inp.parentNode.insertBefore(box, inp); } catch (e) {}
    // 兼容原代码：input.value / input.focus / input.blur / input.addEventListener
    Object.defineProperty(inp, 'value', {
      get: function () {
        // v3.6.x：多行输入框（textarea）必须还原换行——contenteditable 里按 Enter
        // 产生的是块级 <div> 结构或字面 \n 文本，textContent 不保留块级换行（返回
        // 「选项1选项2」），依赖换行分割的业务（帮我决定选项、批量导入等按行读取）
        // 会拿到 1 行。v3.9.x：innerText 在夸克等内核会丢字面 \n，见下方 isMulti
        // 分支与 ceMultiText——多行取值 = innerText 与 DOM 遍历版取换行更多者。
        // v3.5.135：邮件媒体标记（隐藏 span.mail-media-mark 存 sticker:/image: 文本）
        // display:none 时 innerText 读不到——按 DOM 顺序重组保证图片与文字顺序一致；
        // 仅对含标记的 box 生效（其他输入框保持原 innerText/textContent 逻辑不变）
        try {
          if (box.querySelector('span.mail-media-mark') || box.querySelector('img[src*="data:image"]')) {
            let out = '';
            let lastWasMedia = false; // 上一段是媒体标记 → 后续文字补空格，防止 base64 与文字粘连
            box.childNodes.forEach(function (n) {
              if (n.nodeType === 3) {
                const t = n.textContent || '';
                if (lastWasMedia && t && out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
                out += t;
                lastWasMedia = false;
                return;
              }
              if (n.nodeType === 1) {
                if (n.classList && n.classList.contains('mail-media-mark')) {
                  if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
                  out += n.textContent;
                  lastWasMedia = true;
                  return;
                }
                if (n.tagName === 'IMG' && n.src && n.src.indexOf('data:image') === 0) {
                  // v3.5.137：mailInsertInto 插入图片时 <img> 后面紧跟隐藏标记 span，
                  // 完整标记文本已由 span 提供，这里跳过 img，避免同一张图被输出两遍
                  // （安卓写信/回信插入表情包/图片后，信件里同一张图出现两次的 bug）
                  // v3.6.x：兼容「用户在图片后点光标输入文字」（文本被插到 img 与
                  // span 之间，紧邻判断失效）——改为整框查找包含该 src 的隐藏标记
                  let covered = false;
                  try {
                    box.querySelectorAll('span.mail-media-mark').forEach(function (sp) {
                      if (!covered && sp.textContent && sp.textContent.indexOf(n.src) >= 0) covered = true;
                    });
                  } catch (e) {}
                  if (!covered) {
                    // img 的标记 span 被用户退格删掉时，从 src 重建标记——
                    // 否则该图片在保存时丢失（数据丢失风险）
                    if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
                    out += 'image:' + n.src;
                    lastWasMedia = true;
                  }
                  return;
                }
                if (n.tagName === 'DIV' || n.tagName === 'BR') {
                  out += '\n';
                  lastWasMedia = false;
                  return;
                }
                // v3.9.x：粘贴富文本的 <p> 段落标签——块级元素，前后补换行 +
                //   输出其文字（childNodes 扁平遍历不递归子节点，需用 textContent
                //   取段内文字，否则多段粘贴粘连成一行）
                if (n.tagName === 'P') {
                  const inner = n.textContent || '';
                  if (out && !out.endsWith('\n')) out += '\n';
                  if (inner) out += inner;
                  out += '\n';
                  lastWasMedia = false;
                  return;
                }
                // v3.6.x：其它内联元素（粘贴富文本产生的 <span>/<b>/<i> 等）——
                // 补充其文字，否则插入过图片后粘贴带格式文本，这些文字在保存时
                // 会静默丢失（信寄出去正文缺字）
                const inner = n.textContent || '';
                if (inner) {
                  if (out && !out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
                  out += inner;
                  lastWasMedia = false;
                }
              }
            });
            return out;
          }
        } catch (e) {}
        if (isMulti) {
          // v3.9.x：多行取值内核兜底——innerText 与 DOM 遍历版（ceMultiText）都算，
          // 取换行更多的那个。标准内核两者一致；夸克等 innerText 丢字面 \n 的内核
          // 走遍历版（屏幕上分了 N 行就能读回 N 行，所见即所得）；遍历版也漏掉
          // 的极端结构（罕见块级标签）仍保底 innerText
          try {
            var itTxt = '';
            try { itTxt = box.innerText || ''; } catch (e2) {}
            var walkTxt = ceMultiText(box);
            var itN = (itTxt.match(/\n/g) || []).length;
            var wkN = (walkTxt.match(/\n/g) || []).length;
            if (wkN > itN) return walkTxt;
            return itTxt || walkTxt || box.textContent || '';
          } catch (e) {}
        }
        return box.textContent || '';
      },
      set: function (v) {
        const s = (v == null ? '' : String(v));
        if (isMulti) {
          // v3.9.x：回填改 textContent 直写——ce-box 是 pre-wrap，字面 \n 即换行显示，
          // 全内核行为一致；innerText setter 的 \n→<br> 转换在部分内核（夸克等）
          // 不可靠，可能把多行回填写成一行
          try { box.textContent = s; return; } catch (e) {}
        }
        box.textContent = s;
      },
      configurable: true
    });
    Object.defineProperty(inp, 'placeholder', {
      get: function () { return box.getAttribute('data-ph') || ''; },
      set: function (v) { if (v) box.setAttribute('data-ph', v); else box.removeAttribute('data-ph'); },
      configurable: true
    });
    var origFocus = inp.focus, origBlur = inp.blur;
    inp.focus = function () { try { box.focus(); } catch (e) {} };
    inp.blur = function () { try { box.blur(); } catch (e) {} };
    // 事件转发：input/change/keydown/keyup/click 从 box 代理到 inp
    //（keydown 需复制 key/keyCode/isComposing——原代码用它判断 Enter/中文输入）
    // v3.5.133：cancelable:true——业务 e.preventDefault()（如 feed 评论 Enter）才能生效
    ['input', 'change', 'keydown', 'keyup', 'click', 'compositionstart', 'compositionend'].forEach(function (ev) {
      box.addEventListener(ev, function (e) {
        var clone = new Event(ev, { bubbles: true, cancelable: true });
        if (e.data !== undefined) clone.data = e.data;
        if (ev === 'keydown' || ev === 'keyup') {
          clone.key = e.key; clone.keyCode = e.keyCode; clone.isComposing = e.isComposing;
        }
        if (ev === 'input' && e.inputType !== undefined) clone.inputType = e.inputType;
        try { inp.dispatchEvent(clone); } catch (err) {}
      });
    });
    // 触摸/点击聚焦：contenteditable 天然可聚焦，无需额外处理
    box.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    // focus/blur 不冒泡，单独转发到 inp（原代码可能监听 inp 的 blur/focus）
    box.addEventListener('focus', function () { try { inp.dispatchEvent(new Event('focus', { bubbles: true })); } catch (e) {} });
    box.addEventListener('blur', function () { try { inp.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) {} });
    // 初始文本：input 若已有 value（如编辑回填），同步进 box
    // v3.5.130：textarea 的 value 是 JS 属性（无 value attribute）——getAttribute 取不到，
    // 导致打开面板后回显为空、点"应用"即清空内容；回退读 .value
    var initV = inp.getAttribute('value');
    if (initV === null && inp.value !== undefined) initV = inp.value;
    if (initV) box.textContent = initV;
  }
  // 启动转换：页面现有文本输入框 + 动态创建（MutationObserver 兜底）
  // v3.6.x：仅非 iOS 启用（iOS Safari 保留原生输入框，见上方说明）
  try { if (!isIOS) initCeAll(); } catch (e) {}
  try {
    if (!isIOS) {
      var ceMo = new MutationObserver(function () { initCeAll(); });
      ceMo.observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) {}

  // v3.5.128：readonly 起手方案已删除——它会被本转换器完全替代：
  // 文本输入框已统一变为 contenteditable div（Chrome 不对其弹自动填充条），
  // 原 input 退场为幽灵锚点不可交互，readonly 不再有任何作用且会干扰动态转换。

  // v3.6.x：输入法（IME）弹出适配改为「最小干预」——
  // 此前用 visualViewport 把 .phone 锁定成 position:fixed + 键盘高度 + --ime-h 补偿，
  // 在部分安卓机上实测引发：输入法弹窗被截断、页面持续闪屏、输入法弹不出来。
  // 根因：聚焦时 window.scrollTo(0,0) 与浏览器原生滚动打架，地址栏显隐使 visualViewport
  // 高度抖动被误判为「键盘弹出」→ 反复锁高/解锁形成闪烁死循环；锁高又把 .phone 压成
  // 错误高度，键盘像被「截断」。通话中来电 blur + --ime-h 补偿与之叠加更明显。
  // 现在不锁 .phone、不写 --ime-h、不加 ime-open：
  //   · viewport meta 已带 interactive-widget=resizes-content——安卓 Chrome/Edge 会把
  //     布局视口收缩到键盘上方，.phone 的 100dvh 随之重算，输入栏天然停靠键盘上方；
  //   · 其余浏览器由系统原生把聚焦输入框滚到键盘上方，无需 JS 干预。
  // 这里只保留一个轻量兜底：聚焦后把输入框所在的滚动容器（聊天消息区等）滚到可见，
  // 不滚 window、不重复执行——仅给个别浏览器原生滚动不到位时补位。
  function isTextEl(el) {
    return el && ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ? (el.type !== 'checkbox' && el.type !== 'range' && el.type !== 'file' && el.type !== 'color' && !el.readOnly)
      : el.isContentEditable === true);
  }
  var nudgeTimer = null;
  function nudgeInputVisible() {
    var active = document.activeElement;
    if (!isTextEl(active) || !active.getBoundingClientRect) return;
    var r = active.getBoundingClientRect();
    try {
      var scroller = active.closest('.chat-body, .card-list, .gs-scroll, .tc-body, .mem-scroll, .cal-scroll, .div-scroll, .fav-list, .mail-list, .qa-body, .modal, .chat-ask-body, .poke-card-scroll, .chat-decision-body');
      if (!scroller) return;
      var sr = scroller.getBoundingClientRect();
      if (r.bottom > sr.bottom - 8) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop + (r.bottom - sr.bottom) + 16);
      }
    } catch (e) {}
  }
  // 聚焦兜底：单次延迟补位（输入法弹出有时间差），不重复触发
  document.addEventListener('focusin', function () {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(nudgeInputVisible, 300);
  });
  // 输入法收起（失焦）无需任何处理：.phone 高度从未被 JS 改动

  // ================= iOS 专用：键盘（IME）弹出适配（v3.6.x） =================
  // iOS Safari 键盘是 overlay 模式——弹出时【不收缩布局视口】，.phone 的 100dvh
  // 不会重算，输入栏会被键盘盖住，看起来像"键盘没弹/无法输入"（安卓 Chrome/Edge
  // 靠 viewport 的 interactive-widget=resizes-content 自动收缩，无需此处理）。
  // 这里仅对 iOS 启用 visualViewport 锁高：键盘弹出时把 .phone 收缩到可视高度，
  // 输入栏天然停靠键盘上方；收起时恢复。安卓不受影响（isIOS 分支）。
  // .chat-body 的 translateZ(0)（防安卓白屏）在 iOS 上也会引发滚动异常——
  // 一并在此用内联 transform:none 豁免（JS 判断 iOS 比 CSS @supports 可靠）。
  // v3.6.x：不用 position:fixed 锁高——iOS Safari 已知问题：contenteditable
  // （聊天输入框就是模板原生 contenteditable div）位于 fixed 祖先内、键盘弹起时
  // 无法输入（caret 与 visualViewport 冲突，表现：点了输入框、键盘弹出、打不进字）。
  // 改用 flex 顶对齐 + 高度收缩：body 是 flex 容器（align-items:center），
  // 给 .phone 设 align-self:flex-start 顶对齐后高度=可视高度，底部恰好停在键盘
  // 上沿，效果与 fixed 一致；但 .phone 保持普通流定位（水平居中由 body 的
  // justify-content:center 负责，宽屏手机内容限宽也无需额外 hack），
  // contenteditable 正常输入。高度写入只在值变化时执行——键盘动画期间
  // visualViewport 高频 resize 事件不再每次触发整页 reflow（几千条消息时
  // 反复重排 = 打字卡顿）。
  if (isIOS) {
    try {
      var _phone = document.querySelector('.phone');
      var _cb = document.getElementById('chat-body');
      if (_cb) _cb.style.transform = 'none'; // iOS 豁免合成层，避免滚动卡顿
      var _vv = window.visualViewport;
      var _kbActive = false;
      var _pinUntil = 0; // v3.7.x：键盘开合动画窗口，窗口内才 pinScrollTop
      var _noKbH = _vv ? _vv.height : window.innerHeight;
      // v3.10.x：当前聚焦的文本元素（focusin/focusout 可靠上报）。iOS Safari 在
      // contenteditable（聊天输入栏就是 contenteditable div）聚焦/编辑时常返回
      // document.activeElement === <body>，isTextEl 判不出来 → 下方 _open 恒为 false
      // → .phone 永不收缩 → 键盘盖住输入栏完全无法输入。focusin 事件聚焦上报可靠，
      // 用它记录目标元素；用 activeElement 复合判断兜底。
      var _textFocused = null;
      // v3.6.x：键盘弹出期间把页面滚动钉在顶部——iOS Safari 键盘弹出时会自动把页面
      // 滚动到聚焦的输入框（聊天输入栏在 .phone 底部），而 .phone 已按 visualViewport
      // 收缩到键盘上沿，此时 window 再滚动会把 .phone 整体上移，其下方露出 body 灰色
      // 背景——表现就是「键盘上方出现一条横贯全屏的灰色栏，把所有页面都遮盖」。
      // 收缩状态下任何滚动都只会露出灰底（页面内容已全部在 .phone 内），直接归零。
      function pinScrollTop() {
        try {
          if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
            window.scrollTo(0, 0);
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          }
        } catch (e) {}
      }
      // v3.6.x：恢复 .phone 到自然高度（键盘收起）。统一入口——避免多处重复；
      // 恢复后若键盘又弹出，syncIosKb 会重新收缩
      function restoreKb() {
        if (!_kbActive) return;
        _kbActive = false;
        _phone.style.height = '';
        _phone.style.alignSelf = '';
        pinScrollTop();
        stopKbWatch();
      }
      function syncIosKb() {
        if (!_vv || !_phone) return;
        // activeElement + focusin 记录的 _textFocused 复合判断——iOS contenteditable
        // 聚焦时 activeElement 常是 <body>，只看它会把键盘误判为「未聚焦」→ 不收缩
        var _focused = isTextEl(_textFocused) || isTextEl(document.activeElement);
        var _h = _vv.height;
        // 键盘是否仍开——按可视高度判定，不依赖焦点。
        //   点击字卡/按钮时焦点短暂离开输入框但键盘未必收，靠焦点判断会误 restore
        //   → _phone 高度收缩↔回落反复 reflow → 每点一下闪一下（iOS 15 PWA 复现）
        var _kbStill = _h < _noKbH - 60;
        // 稳态早退：键盘已开 + 仍在输入框 + 已过开合动画窗口 → height 已设对，
        //   不做开合判定/pin。打字时 vv resize 偶发触发，早退防任何 reflow 闪屏
        if (_kbActive && _focused && _kbStill && Date.now() > _pinUntil) {
          var _hs0 = _h + 'px';
          if (_phone.style.height !== _hs0) _phone.style.height = _hs0;
          return;
        }
        // 无键盘时跟随可视高度更新基准（地址栏显隐变化不误判）
        if (!_kbActive && _h > _noKbH) _noKbH = _h;
        var _open = _focused && _kbStill;
        if (_open && !_kbActive) {
          _kbActive = true;
          // 顶对齐（替代 position:fixed）——避免 iOS contenteditable 在 fixed
          // 容器内无法输入的已知问题；水平居中交给 body flex 原有规则
          _phone.style.alignSelf = 'flex-start';
          // 键盘弹出瞬间浏览器可能已滚动页面，立即归零，防止灰底露出
          pinScrollTop();
          // v3.7.x：键盘弹出动画期（约 500ms）内持续钉顶防灰底露出；
          //   之后稳态打字不再 pinScrollTop——iOS Safari 在 contenteditable 里
          //   打字时系统会微滚布局视口让 caret 可见，每次强制归零会与系统滚动
          //   打架，表现就是「每打一个字屏幕闪一下」（iPhone 14 Safari 复现）
          _pinUntil = Date.now() + 500;
          startKbWatch();
        }
        if (_kbActive) {
          var _hs = _h + 'px';
          if (_phone.style.height !== _hs) _phone.style.height = _hs; // 值不变不重排
          // 仅在键盘开合动画窗口内钉顶；稳态打字期不 pin，避免 caret 微滚↔归零闪屏
          if (Date.now() < _pinUntil) pinScrollTop();
        }
        // 键盘真的收了（可视高度回升）才 restore——不看焦点，防点击字卡误 restore 闪屏
        if (!_kbStill && _kbActive) restoreKb();
      }
      // v3.6.x：键盘状态自愈——iOS Safari 键盘收起时**偶发不派发 visualViewport
      // resize**（程序化 blur / 键盘下滑收起 / 完成键收起等路径，聊天发送时
      // input.textContent='' 清空聚焦的 contenteditable 最易触发）。此时 .phone
      // 会卡在收缩高度：页面下方露出 body 灰色背景、页面位置与比例错乱，只有
      // 下一次完整键盘开合（如改昵称弹窗）才复位。
      // v3.10.x：升级为「聚焦期间主动轮询」——不再只做"恢复"。iOS 键盘弹出时
      // visualViewport resize 存在漏触发（尤其 contenteditable / 全屏聊天页），
      // focusin 的 250/450ms 一次性补偿也可能与键盘动画错开 → .phone 不收缩 →
      // 输入栏被键盘彻底盖住（用户反复反馈的"输入法挡住输入栏"）。改成：只要
      // 聚焦了文本输入框（或键盘仍开着），每 250ms 复审一次，调用 syncIosKb
      // 让它按可视高度主动收缩；未聚焦且键盘已收则停表。syncIosKb 稳态期
      // 高度值不变不写 DOM（字符串比对早退），打字时不重排、无闪屏。
      var _kbWatch = null;
      function startKbWatch() {
        if (_kbWatch) return;
        _kbWatch = setInterval(function () {
          try {
            var _foc = isTextEl(_textFocused) || isTextEl(document.activeElement);
            if (_foc) {
              // 聚焦中：主动按可视高度收缩 .phone（防 iOS vv resize 漏触发盖住输入栏）
              syncIosKb();
              // 收缩后内层滚动容器里的输入框（问问ta 问题栏等）高度随之变化，
              // 补一次可见性对齐，确保它停在键盘上方
              nudgeInputVisible();
            } else if (_kbActive) {
              // 失焦但键盘仍开着（含收起动画窗口 / vv resize 漏触发的收起）：
              // 只做「键盘真的收了吗」复原，不调 syncIosKb——它会在键盘收起动画
              // 期间每 250ms 反复写 .phone 高度（跟随 vv 爬升）+ 重排，
              // 每个键盘收起都闪屏（用户反馈），改回一次性复原判断
              if (_vv && _vv.height >= _noKbH - 60) restoreKb();
            } else {
              stopKbWatch();
            }
          } catch (e) {}
        }, 250);
      }
      function stopKbWatch() {
        if (_kbWatch) { clearInterval(_kbWatch); _kbWatch = null; }
      }
      // v3.7.x：vv scroll 独立处理——打字时系统微滚 caret 触发高频 vv scroll，
      //   若走 syncIosKb 会在稳态期反复读 vv.height/比较字符串（JS 开销→打字卡顿），
      //   且任何 DOM 写入都会 reflow 闪屏。scroll 只在键盘开合动画窗口内钉顶防灰底，
      //   稳态打字完全 no-op。键盘开合判定交给 resize（高度真正变化才触发）
      function onIosKbScroll() {
        if (_kbActive && Date.now() < _pinUntil) pinScrollTop();
      }
      if (_vv) {
        _vv.addEventListener('resize', syncIosKb);
        _vv.addEventListener('scroll', onIosKbScroll);
      }
      document.addEventListener('focusin', function (e) {
        try { if (isTextEl(e.target)) _textFocused = e.target; } catch (e2) {}
        // v3.10.x：立即同步一次——键盘弹出动画期间 vv.height 开始明显收缩，
        // 尽早收缩 .phone，避免头 300ms 输入栏还在键盘下面（视觉"被盖住"）
        try { syncIosKb(); } catch (e3) {}
        setTimeout(syncIosKb, 250);
        setTimeout(syncIosKb, 450);
        // v3.10.x：聚焦文本输入框即启动主动轮询兜底——即使 vv resize 漏触发，
        // 250ms 内也会按可视高度收缩 .phone，输入栏不会被键盘盖住
        if (isTextEl(e.target)) { try { startKbWatch(); } catch (e4) {} }
      });
      document.addEventListener('focusout', function (e) {
        try { if (e.target === _textFocused) _textFocused = null; } catch (e2) {}
        setTimeout(syncIosKb, 250);
        setTimeout(syncIosKb, 450);
        // 输入框失焦即键盘收起：不依赖 vv resize（iOS 程序化失焦/滑动收起常漏事件），
        // 400ms 后若可视高度已回升（键盘真的收了）才恢复——不靠焦点判断，
        //   防点击字卡/按钮时焦点短暂离开但键盘未收就误 restore→reflow 闪屏
        setTimeout(function () {
          if (_kbActive && _vv && _vv.height >= _noKbH - 60) restoreKb();
        }, 400);
      });
    } catch (e) {}
  }

  // ================= 安卓专用：键盘（IME）悬浮适配（v3.10.x） =================
  // 背景：安卓 Chrome/Edge 收键盘时「整屏白一下」——根因是 viewport 用了
  // interactive-widget=resizes-content：收键盘时布局视口被系统撑回全高，.phone
  // 的 100dvh 跟着整屏重算重绘，露底色的那帧就是白闪（红米 K80 复现，每次都这样）。
  // 修法：改走 interactive-widget=overlays-content，键盘只做悬浮 overlay、布局视口
  // 不再整屏重算 → 无 dvh 重绘白闪。代价是.input 栏不会自动被顶起，需手动把
  // .phone 收缩到键盘上方可视高度（visualViewport）。
  // 约定：与 iOS 分支互斥（iOS Safari 忽略 interactive-widget，保持原机制）。
  if (!isIOS) {
    try {
      var _aPhone = document.querySelector('.phone');
      var _aVV = window.visualViewport;
      if (_aVV && _aPhone) {
        var _aH = _aVV.height; // 无键盘基准（跟随地址栏显隐更新）
        var _aKb = false;
        // v3.10.x：当前聚焦的文本元素（focusin 可靠上报，部分安卓浏览器
        // activeElement 在 contenteditable 上返回 <body>，单看它会漏判聚焦）
        var _aTextFocused = null;
        function _aIsText(el) {
          return el && ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
            ? (el.type !== 'checkbox' && el.type !== 'range' && el.type !== 'file' && el.type !== 'color' && !el.readOnly)
            : el.isContentEditable === true);
        }
        function syncAndroidKb() {
          if (!_aVV || !_aPhone) return;
          var h = _aVV.height;
          var open = h < _aH - 60; // 可视高度明显变小 = 键盘弹出
          if (!open && h > _aH) _aH = h; // 无键盘时更新基准，地址栏变化不误判
          if (open && !_aKb) { _aKb = true; _aPhone.style.alignSelf = 'flex-start'; }
          if (!open && _aKb) {
            _aKb = false;
            _aPhone.style.height = '';
            _aPhone.style.alignSelf = '';
            return;
          }
          if (_aKb) {
            var hs = h + 'px';
            // 值不变不写 DOM（字符串比对早退），打字/滚动时不重排
            if (_aPhone.style.height !== hs) _aPhone.style.height = hs;
          }
        }
        // v3.10.x：聚焦期间主动轮询兜底——安卓 visualViewport.resize 在键盘弹出时
        // 偶发漏触发（尤其 contenteditable / 全屏聊天页 / 部分国产 ROM），focusin 的
        // 120ms 一次性补偿也可能早于键盘动画完成（h 还没降）→ syncAndroidKb 判 open=false
        // 不收缩 → .phone 永不收缩 → 输入栏被键盘完全盖住。改成：只要聚焦文本输入框
        // （或键盘仍开着），每 250ms 复审一次调 syncAndroidKb 按可视高度主动收缩；
        // 未聚焦且键盘已收则停表。syncAndroidKb 稳态期高度值不变不写 DOM（字符串比对
        // 早退），打字时不重排、无白闪。
        var _aWatch = null;
        function startAWatch() {
          if (_aWatch) return;
          _aWatch = setInterval(function () {
            try {
              var foc = _aIsText(_aTextFocused) || _aIsText(document.activeElement);
              if (foc) {
                syncAndroidKb();
                nudgeInputVisible();
              } else if (_aKb) {
                if (_aVV.height >= _aH - 60) {
                  _aKb = false;
                  _aPhone.style.height = '';
                  _aPhone.style.alignSelf = '';
                }
              } else {
                stopAWatch();
              }
            } catch (e) {}
          }, 250);
        }
        function stopAWatch() {
          if (_aWatch) { clearInterval(_aWatch); _aWatch = null; }
        }
        _aVV.addEventListener('resize', syncAndroidKb);
        // 首次聚焦兜底：键盘弹出的 resize 偶发前置/漏触发，紧跟一次判定
        document.addEventListener('focusin', function (e) {
          try {
            if (_aIsText(e.target)) _aTextFocused = e.target;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
              try { syncAndroidKb(); } catch (e3) {}
              setTimeout(syncAndroidKb, 120);
              setTimeout(syncAndroidKb, 350);
              try { startAWatch(); } catch (e4) {}
            }
          } catch (e2) {}
        });
        // 失焦兜底：键盘收起偶发漏 resize，稍作延迟按可视高度复原
        document.addEventListener('focusout', function (e) {
          try { if (e.target === _aTextFocused) _aTextFocused = null; } catch (e2) {}
          setTimeout(syncAndroidKb, 120);
          setTimeout(syncAndroidKb, 350);
          // 失焦即键盘收起：不依赖 resize（安卓程序化失焦/滑动收起常漏事件），
          // 400ms 后若可视高度已回升（键盘真的收了）才恢复
          setTimeout(function () {
            if (_aKb && _aVV.height >= _aH - 60) {
              _aKb = false;
              _aPhone.style.height = '';
              _aPhone.style.alignSelf = '';
            }
          }, 400);
        });
      }
    } catch (e) {}
  }

  // v3.5.107：滚动穿透锁——全屏/半屏浮层打开时禁止背景滚动（手机端典型问题：
  // 在弹层里滑动，背景页面跟着滚；安卓/iOS 都常见）
  // v3.5.116：补上更多功能面板/搜索/帮我决定/占卜/头像互动/查岗半框；
  // 管理分组弹层（.mg-mask）是动态创建的，用类选择器 + body 观察兜底
  // v3.5.123：补 #modal-mask（通用弹窗）/ #msg-actions（气泡操作菜单）
  // v3.6.x：去掉 #desk-msg——新消息横幅只是顶部 fixed 小提示条（6 秒自动隐藏，
  //   不遮挡滚动区域），把它当浮层锁滚动会让整个页面在横幅弹出的 6 秒内滑不动，
  //   用户感知为「页面卡住/滑动失效」（iPad 夸克反馈）。横幅自身交互由 chat.js 处理。
  const FLOAT_SELECTORS = ['#tc-mask', '#cc-export-mask', '#call-mask', '#feed-notice-panel', '#feed-comment-panel', '#poke-card', '#emoji-panel', '#chat-ask-panel', '#qa-mask', '#chat-more-panel', '#chat-search', '#chat-decision-panel', '#chat-divine-panel', '#chat-rps-panel', '#chat-call-panel', '#chat-pong-panel', '#chat-snake-panel', '#avlib-card', '#ck-panel', '#loc-panel', '.mg-mask', '#modal-mask', '#msg-actions', '#desk-image-viewer', '.desk-lib', '#gc-members-panel', '#gc-at-panel', '#gc-settings-panel'];
  let locked = false;
  function applyLock() {
    const anyOpen = FLOAT_SELECTORS.some(function (sel) {
      try {
        const el = document.querySelector(sel);
        return el && !el.hidden;
      } catch (e) { return false; }
    });
    if (anyOpen && !locked) {
      document.body.classList.add('scroll-lock');
      locked = true;
    } else if (!anyOpen && locked) {
      document.body.classList.remove('scroll-lock');
      locked = false;
    }
  }
  try {
    const mo = new MutationObserver(applyLock);
    FLOAT_SELECTORS.forEach(function (sel) {
      try {
        const el = document.querySelector(sel);
        if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
      } catch (e) {}
    });
    // 动态创建的 .mg-mask（管理分组弹层）：插入 body 时补观察 hidden + 立即应用锁
    const bodyMo = new MutationObserver(function (muts) {
      let changed = false;
      muts.forEach(function (m) {
        if (!m.addedNodes) return;
        m.addedNodes.forEach(function (n) {
          if (n && n.nodeType === 1 && n.classList && n.classList.contains('mg-mask')) {
            try { mo.observe(n, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {}
            changed = true;
          }
        });
      });
      if (changed) applyLock();
    });
    bodyMo.observe(document.body, { childList: true });
  } catch (e) {}
  applyLock();
  // v3.6.x：滚动锁触摸兜底——极端情况下浮层已关闭但锁未解除（iOS Safari 上会
  // 表现为整个页面无法滚动/点击无响应、像"卡死"）。每次触摸时复查一次：
  // 若实际没有任何浮层打开就立即解锁，避免锁残留。
  document.addEventListener('touchstart', function () {
    try { applyLock(); } catch (e) {}
  }, { passive: true });
})();

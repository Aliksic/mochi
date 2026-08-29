// ===== 功能：统一设备判定（v3.16.x） =====
// 背景：isMobile / isTablet / isIOS / isAndroid / isVia 此前在 mobile-adapt.js /
// fullscreen.js / pwa.js / bg-keep.js 各算一遍，规则略有出入——同一台设备可能被
// 两个模块判成不同形态，行为互相打架（如 mobile-adapt 判手机、pwa 判桌面）。
// 这里收敛为唯一判定源 window.mochiDevice，各模块统一读取；以后新增浏览器 /
// 新伪装手段时只改本文件。判定逻辑 = mobile-adapt.js 完整版（含桌面伪装兜底：
// viewport 改写 / force-mobile / .tablet 类），仅此一处执行副作用。
(function () {
  // 只在真实手机窄屏启用（桌面模拟器外壳不受影响）
  // v3.5.137：900px——Moto G100 等 2400px 物理屏 / DPR 2.75-3 的 CSS 视口约 800-873px，
  // 原 768px 上限会误判为桌面（显示 390px 小手机框 + 两侧灰底）
  let isMobile = false;
  try { isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches; } catch (e) {}
  let mobileRule = isMobile ? 'viewport<=900' : '';
  const ua = String(navigator.userAgent || '');

  // ===== v3.26.x：手动布局偏好（识别失手时用户自救）=====
  // 「桌面版网站」模式会把 UA / screen / 触摸能力 / layout viewport 整套仿真成桌面，
  // 纯指纹识别必有漏网。留一条不依赖判定的通道：设置页「手机布局（强制）」开关，
  // 或地址栏 ?mobile=1（强制手机）/ ?pc=1（强制桌面外壳），落 localStorage 长期生效。
  // 空值 = 跟随自动判定。
  const LAYOUT_KEY = 'xy-home-v2:__layout-pref';
  let layoutPref = '';
  try { layoutPref = localStorage.getItem(LAYOUT_KEY) || ''; } catch (e) {}
  try {
    const pq = /[?&](mobile|pc)=(\d)/.exec(location.search || '');
    if (pq) {
      const want = pq[2] === '1' ? pq[1] : '';
      if (want !== layoutPref) {
        layoutPref = want;
        try {
          if (want) localStorage.setItem(LAYOUT_KEY, want);
          else localStorage.removeItem(LAYOUT_KEY);
        } catch (e2) {}
      }
    }
  } catch (e) {}

  // v3.7.x：iPad/平板检测——iPad 竖屏（768-834px CSS 视口）命中 isMobile 走手机全屏
  // 布局，内容被整屏拉宽（桌面图标间距巨大、气泡过宽）；iPad 横屏（≥1024px）走
  // 桌面模拟器外壳（390px 小框 + 两侧灰底）。两者都不适合平板。
  // 命中给 <html> 加 .tablet 类（base.css 平板布局：全高 + 内容限宽居中 +
  // 无模拟器外壳，竖屏/横屏观感一致）。
  // iPadOS 13+ 的 UA 伪装成 Macintosh（桌面 macOS UA + 触摸屏 maxTouchPoints>1），
  // 老系统 UA 带 iPad 关键字，两种都覆盖。
  let isTablet = false;
  try {
    const plat = String(navigator.platform || '');
    // v3.7.x：/iPad/ 分支加 Android 排除——UA 伪装成 iPad 的安卓窄屏机（OPPO/Via 等）
    //   会被误判为平板走手机全屏布局，内容整屏拉宽。真 iPad 不含 Android 关键字，安全
    isTablet = (/iPad/i.test(ua) || plat === 'iPad') && !/android/i.test(ua) ||
      ((plat === 'MacIntel' || /Macintosh/i.test(ua)) && navigator.maxTouchPoints > 1 && 'ontouchstart' in window);
  } catch (e) {}

  // ===== 伪装桌面兜底判定（v3.9.x 起逐轮补强；v3.26.x 收进规则表）=====
  // 场景：Edge/Via 等浏览器「桌面版网站」模式把 UA 改成 Windows 桌面、layout
  // viewport 拉到 980px → 上面 matchMedia('(max-width:900px)') 误判为桌面，手机
  // 显示成「390px 小框 + 两侧灰底」的 PC 外壳，且连带全屏判定失效。
  // v3.26.x 的关键修正：前三条规则都要求触摸信号为真（maxTouchPoints>0 或
  // ontouchstart），而 Edge 安卓桌面模式会把触摸能力一并仿真掉 → 四条全落空。
  // 现补一组不依赖触摸的规则（下列 4~8），并保留原规则不动。
  const sig = {
    sw: 0, sh: 0, touch: false, uaDesk: false, uaMobile: false, oriApi: false,
    coarse: false, hoverNone: false, vvW: 0, uchMobile: false, uchAndroid: false
  };
  try {
    sig.sw = screen.width || screen.availWidth || 0;
    sig.sh = screen.height || screen.availHeight || 0;
    sig.touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    sig.uaDesk = /Windows NT|Macintosh|X11|CrOS/i.test(ua);
    sig.uaMobile = /Android|iPhone|iPod|Mobile/i.test(ua);
    sig.oriApi = typeof window.orientation !== 'undefined';
    if (window.matchMedia) {
      sig.coarse = !!window.matchMedia('(pointer: coarse)').matches;
      sig.hoverNone = !!window.matchMedia('(hover: none)').matches;
    }
    sig.vvW = (window.visualViewport && window.visualViewport.width) || 0;
    // UA-CH（Chromium 系 client hints）：桌面模式改的多是 UA 字符串本身，
    // 低熵值 platform/mobile 常与真实内核保持一致，作为附加信号（不做唯一依据）
    const uch = navigator.userAgentData;
    if (uch) {
      sig.uchMobile = uch.mobile === true;
      sig.uchAndroid = /android/i.test(String(uch.platform || ''));
    }
  } catch (e) {}
  // screen.width<900：设备物理 CSS 宽，桌面显示器 ≥1024，不随窗口缩放
  const narrowScreen = sig.sw > 0 && sig.sw < 900;
  // 竖屏手机外形：窄 + 明显高过宽。真桌面即便窄也横向居多
  const phoneShaped = narrowScreen && sig.sh >= sig.sw * 1.25;
  // 移动端内核/手指输入特征（这两条媒体查询反映硬件，桌面模式改不掉）
  const mobileInput = sig.coarse && sig.hoverNone;
  const RULES = [
    ['narrow-screen+touch', sig.touch && narrowScreen],
    ['vv<=900+touch', sig.touch && sig.vvW > 0 && sig.vvW <= 900],
    ['desktop-ua+touch', sig.touch && sig.uaDesk && (sig.oriApi || mobileInput)],
    ['mobile-ua+narrow-screen', sig.uaMobile && narrowScreen],
    ['desktop-ua+phone-screen', sig.uaDesk && phoneShaped],
    ['desktop-ua+coarse-pointer', sig.uaDesk && mobileInput],
    ['desktop-ua+mobile-uch', sig.uaDesk && (sig.uchMobile || sig.uchAndroid)],
    ['desktop-ua+vv<=900+mobile-input', sig.uaDesk && sig.vvW > 0 && sig.vvW <= 900 && (sig.oriApi || mobileInput)]
  ];
  let viewportFixed = false;
  // 把 layout viewport 拉回设备宽度：改 viewport meta → 不奏效再改显式像素宽度 →
  // 仍不奏效才加 html.force-mobile 类作 CSS 保底（base.css 复刻手机端关键规则）。
  function applyViewportFix() {
    if (viewportFixed) return;
    viewportFixed = true;
    // 改 viewport meta 把 layout viewport 拉回设备宽度——让 CSS
    // @media(max-width:900px) 自然命中，所有手机端规则生效。桌面站点
    // 模式浏览器可能忽略 meta，下方加 force-mobile 类作 CSS 保底。
    try {
      document.querySelectorAll('meta[name="viewport"]').forEach(function (m) {
        m.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual');
      });
    } catch (e) {}
    // 等一帧看媒体查询是否命中；未命中说明该内核「桌面站点」模式下连
    // device-width 都被仿真成桌面大屏（980）→ 改写 viewport 为【显式像素
    // 宽度】再试：真实设备 CSS 宽用 visualViewport 反推（vv.width×vv.scale
    // ≈ 物理 CSS 宽，桌面模式初始缩小显示时 scale<1、两者乘积恒为真宽）。
    // 数字宽度不依赖 device-width 仿真，多数内核会直接采纳 → 媒体查询全量
    // 生效（force-mobile 类只复刻关键规则，覆盖不了各功能页的手机端样式）。
    // 再等两帧复查，仍未命中才加 force-mobile 类作最终保底。
    try {
      requestAnimationFrame(function () {
        try {
          if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) {
            var vw = 0;
            try {
              var vv = window.visualViewport;
              // v3.13.x：优先采信 vv.width（桌面站点模式下 = 真机 CSS 宽 ~360-412，
              // 不会被 980 伪装）；vv.width×vv.scale 在桌面模式会算出伪装的 980
              // 而被下方区间过滤掉 → viewport 改写静默失败只能退 force-mobile，
              // 故仅在 vv.width 缺失时才用乘积兜底。
              var est = vv && vv.width > 0 ? Math.round(vv.width)
                : (vv && vv.scale > 0 && vv.width > 0 ? Math.round(vv.width * vv.scale) : 0);
              // 合理区间过滤：缩放中/异常值不采信（手机 CSS 宽 200-899）
              if (est >= 200 && est < 900) vw = est;
            } catch (e2) {}
            if (vw) {
              document.querySelectorAll('meta[name="viewport"]').forEach(function (m) {
                m.setAttribute('content', 'width=' + vw + ', initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual');
              });
            }
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                try {
                  if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) {
                    document.documentElement.classList.add('force-mobile');
                  }
                } catch (e3) {}
              });
            });
          }
        } catch (e) {}
      });
    } catch (e) {}
  }
  if (!isMobile && !isTablet) {
    for (let ri = 0; ri < RULES.length; ri++) {
      if (RULES[ri][1]) {
        isMobile = true;
        mobileRule = RULES[ri][0];
        break;
      }
    }
    if (isMobile) applyViewportFix();
  } else if (isTablet) {
    mobileRule = 'tablet';
  }

  // 手动偏好最后覆盖（识别失手也不至于把用户锁死在错误形态里）
  if (layoutPref === 'mobile') {
    isMobile = true; isTablet = false; mobileRule = 'pref:mobile';
    applyViewportFix();
  } else if (layoutPref === 'pc') {
    isMobile = false; isTablet = false; mobileRule = 'pref:pc';
  }
  if (isTablet) { try { document.documentElement.classList.add('tablet'); } catch (e) {} }

  // 历史沿革：v3.9.x 触摸屏+窄 screen → v3.11.x orientation/pointer 输入特征 →
  // v3.13.x visualViewport.width → 均在 vivo Y35 + Edge「桌面版网站」模式前失手，
  // 根因是这组规则都要求触摸信号为真。已统一收进上方 RULES + applyViewportFix。

  // 平台判定（含 UA 伪装排除——OPPO/Via/夸克等浏览器可把 UA 伪装成 iPhone）
  // v3.7.x：/iphone|ipad|ipod/ 分支加 Android 排除（多数 UA 切换不彻底会保留
  // Android 标识）；!window.MSStream 排除 Windows Phone 的 IE/Spartan
  const isIOS = /iphone|ipad|ipod/i.test(ua) && !/android/i.test(ua) && !window.MSStream;
  const isAndroid = /android/i.test(ua);
  // v3.6.x：Via 浏览器（UA 特征）——实测其 WebView 禁用了方向锁（lock 无效），
  // 网页全屏必转横屏，fullscreen.js 需据此走 CSS 兜底
  const isVia = /via/i.test(ua);

  // 唯一判定源：全模块统一从这里读
  // mobileRule = 本次判定依据（诊断信息/设置页文案用），signals = 参与判定的原始信号
  function setLayoutPref(v) {
    layoutPref = v || '';
    try {
      if (layoutPref) localStorage.setItem(LAYOUT_KEY, layoutPref);
      else localStorage.removeItem(LAYOUT_KEY);
    } catch (e) {}
    return layoutPref;
  }
  window.mochiDevice = {
    isMobile: !!isMobile,
    isTablet: !!isTablet,
    isIOS: !!isIOS,
    isAndroid: !!isAndroid,
    isVia: !!isVia,
    mobileRule: mobileRule,
    layoutPref: layoutPref,
    signals: sig,
    setLayoutPref: setLayoutPref
  };

  // ===== v3.26.x：视口 / 键盘 / 全屏现场探针（只读）window.mochiVvDiag() =====
  // iOS 三项报障（输入栏下空一块、页面突然上移点不动、全屏开关没反应）在无头
  // Chrome 里都拿不到 WebKit 的真实几何，只能把现场数据随诊断文本一起回收。
  // 组合两路：本函数从 DOM/计算样式实测 + mobile-adapt.js 的 iOS 键盘内部状态
  // （window.__mochiIosKb，安卓/桌面下不存在）——后者才知道棘轮基线/文档锁到底残留没有。
  window.mochiVvDiag = function () {
    try {
      const d = document.documentElement;
      const cs = window.getComputedStyle(d);
      const vv = window.visualViewport || null;
      const phone = document.querySelector('.phone');
      const ps = phone ? window.getComputedStyle(phone) : null;
      const pr = phone ? phone.getBoundingClientRect() : null;
      let fsMode = '关闭';
      if (document.fullscreenElement || document.webkitFullscreenElement) fsMode = '原生全屏';
      else if (d.classList.contains('fs-css-active')) fsMode = 'CSS兜底全屏';
      else if (d.classList.contains('ios-fs-active')) fsMode = 'iOS隐藏模拟状态栏';
      else if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) fsMode = '系统级全屏(display_override)';
      const out = {
        innerH: window.innerHeight || 0,
        innerW: window.innerWidth || 0,
        vvH: vv ? Math.round(vv.height) : null,
        vvW: vv ? Math.round(vv.width) : null,
        vvOffsetTop: vv ? Math.round(vv.offsetTop || 0) : null,
        vvScale: vv ? vv.scale : null,
        screenH: (window.screen && screen.height) || 0,
        docScrollY: Math.round(window.scrollY || window.pageYOffset || 0),
        safeBottom: cs.getPropertyValue('--mochi-safe-bottom').trim() || '(未设→env)',
        iosH: cs.getPropertyValue('--mochi-ios-h').trim() || '(未设)',
        phoneH: ps ? Math.round(parseFloat(ps.height) || 0) : 0,
        phoneTop: pr ? Math.round(pr.top) : null,
        phoneBottom: pr ? Math.round(pr.bottom) : null,
        phoneInlineH: phone && phone.style.height ? phone.style.height : '',
        phoneAlignSelf: phone && phone.style.alignSelf ? phone.style.alignSelf : '',
        htmlInlineOverflow: d.style.overflow || '',
        bodyScrollLock: !!(document.body && document.body.classList.contains('scroll-lock')),
        vvFit: d.classList.contains('ios-vv-fit'),
        standalone: d.classList.contains('ios-pwa-standalone'),
        fsMode: fsMode,
        kb: null
      };
      // 底部空隙实测：可视区底边到 .phone 底边的差（>8px 即用户说的「下面空一块」）
      if (pr && vv) out.gapBottom = Math.round(vv.height - pr.bottom);
      try { if (typeof window.__mochiIosKb === 'function') out.kb = window.__mochiIosKb(); } catch (e2) {}
      try { if (typeof window.scrollLockInfo === 'function') out.lock = window.scrollLockInfo(); } catch (e3) {}
      return out;
    } catch (e) { return null; }
  };
})();

// ===== 复制诊断信息（设置页入口，v3.16.x；v3.25.x 扩充） =====
// 用户报障时拿数据，别靠来回猜：一键复制设备判定 / 视口 / 特性检测 / 存储配额 /
// 更新状态（远端 version.json 时间戳比对，判断「TA 手机是不是旧缓存」）/
// 最近错误（含调用栈 + 资源加载失败 + console.error）/ 环境变化（旋转/键盘/前后台）/
// 长任务卡顿记录 / 网络失败 / 存储键明细 / 交互轨迹。
// 贴进 openModal 的多行文本框，剪贴板可用时自动写入（GitHub Pages https 环境可用）。
(function () {
  const row = document.getElementById('row-diagnostics');
  if (!row) return;
  // 独立取 UA：设备判定 IIFE 里的 ua 是局部变量，这里拿不到（压缩后更名），
  // 诊断模块自己读 navigator 即可
  const ua = String(navigator.userAgent || '');

  // v3.26.x 修复：开屏版本/构建时间戳在进入应用 400ms 后被 clock.js 从 DOM 移除
  //（#splash-ver 随之消失），诊断要等用户点进设置页才执行 → 版本号永远读不到、
  // 比对永远「本机无构建时间戳」。这里在 IIFE 启动时（开屏还在）先缓存一份，
  // collectDiag 改读缓存，不再依赖仍在 DOM 里的 #splash-ver。
  let verCache = '', localTsCache = 0;
  try {
    const sv = document.getElementById('splash-ver');
    if (sv) {
      const vb = sv.querySelector('.sv-app b');
      const verTxt = (vb && vb.textContent ? String(vb.textContent).trim() : '') || (sv.getAttribute('data-version') || '');
      const ts = sv.getAttribute('data-build-ts');
      verCache = verTxt + (ts ? ' 构建 ts=' + ts : '');
      localTsCache = Number(ts) || 0;
    }
  } catch (e) {}

  // ===== 错误自动采集（v3.16.x） =====
  // 报障文本自带最近错误栈：window.onerror / unhandledrejection 采集最近 5 条
  //（含 UA + 设备判定 + 页面），存 localStorage（键 __diag-errs）。纯本地、
  // 不发送任何外部服务；诊断信息里追加「最近错误」一节，用户报障直接带出来。
  const ERR_KEY = 'xy-home-v2:__diag-errs';
  function errSnap() {
    const d = window.mochiDevice || {};
    return {
      t: Date.now(),
      ua: (navigator.userAgent || '').slice(0, 160),
      dev: 'M' + (d.isMobile ? 1 : 0) + ' T' + (d.isTablet ? 1 : 0) + ' I' + (d.isIOS ? 1 : 0) + ' A' + (d.isAndroid ? 1 : 0) + ' V' + (d.isVia ? 1 : 0),
      page: (function () {
        var v = '';
        try {
          document.querySelectorAll('.page').forEach(function (p) {
            if (!p.hidden) { v = p.id || ''; }
          });
        } catch (e) {}
        return v;
      })(),
      href: (location.pathname || '').slice(0, 80)
    };
  }
  function pushErr(msg, stack) {
    try {
      var arr = [];
      try {
        var old = localStorage.getItem(ERR_KEY);
        if (old) { var o = JSON.parse(old); if (Array.isArray(o)) arr = o; }
      } catch (e) {}
      var ent = Object.assign({ msg: String(msg).slice(0, 300) }, errSnap());
      var st = String(stack || '').slice(0, 400);
      if (st) ent.stack = st;
      // 5s 内同文去重：定时器/轮询里的重复报错会刷掉环形缓冲里其他线索
      var last = arr.length ? arr[arr.length - 1] : null;
      if (last && last.msg === ent.msg && ent.t - (last.t || 0) < 5000) return;
      arr.push(ent);
      if (arr.length > 5) arr = arr.slice(arr.length - 5);
      try { localStorage.setItem(ERR_KEY, JSON.stringify(arr)); } catch (e) {}
      // v3.26.x：错误记录同时写 IndexedDB——备份导入会清空 xy-home-v2:* 前缀的
      // localStorage 键、配额满/隐私模式也会静默丢 LS 数据，错误线索就这样"没记录"。
      // 双写后 IDB 始终有副本：启动时 idbRestore 会回填，collectDiag/refreshBadge
      // 读 LS 为空时也回退 IDB，报障错误不再凭空消失。
      try { if (window.idbSet) window.idbSet(ERR_KEY, JSON.stringify(arr)); } catch (e) {}
      try { refreshBadge(); } catch (e) {}
    } catch (e) {}
  }
  // v3.26.x：错误记录读取（LS 优先，读不到回退 IndexedDB）。
  // LS 有值直接同步返回（快路径，不触发异步）；LS 为空/解析失败才查 IDB——
  // 本地数据恢复/清空后 IDB 仍保留副本，错误记录得以找回。
  function readErrs(cb) {
    let arr = [];
    try {
      const raw = localStorage.getItem(ERR_KEY);
      if (raw) { const o = JSON.parse(raw); if (Array.isArray(o)) arr = o; }
    } catch (e) {}
    if (arr.length || !window.idbGet) { try { cb(arr); } catch (e) {} return; }
    window.idbGet(ERR_KEY).then(function (raw) {
      let o = [];
      try { if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) o = p; } } catch (e) {}
      try { cb(o); } catch (e) {}
    }).catch(function () { try { cb([]); } catch (e) {} });
  }
  // v3.25.x：改捕获阶段监听——资源加载失败（script/css/图片 404，白屏元凶）的
  // error 事件不冒泡，只有 capture 才抓得到；JS 异常在 window 上派发，capture
  // 同样收到，一个监听覆盖两类。JS 异常带 e.error.stack 定位到文件+行号。
  try {
    window.addEventListener('error', function (e) {
      var m = '', st = '';
      try {
        if (e && e.message) {
          m = e.message;
          try { st = (e.error && e.error.stack) ? String(e.error.stack) : ''; } catch (e3) {}
        } else if (e && e.target && e.target !== window && (e.target.src || e.target.href)) {
          m = '资源加载失败 <' + String(e.target.tagName || '').toLowerCase() + '> ' + String(e.target.src || e.target.href || '').slice(0, 120);
        }
      } catch (e2) {}
      if (m) pushErr(m, st);
    }, true);
  } catch (e) {}
  try {
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      var m = '';
      try { m = (r && r.message) ? r.message : String(r); } catch (e2) {}
      if (m && String(m).indexOf('ResizeObserver') < 0) pushErr('(promise) ' + m, r && r.stack ? String(r.stack) : '');
    });
  } catch (e) {}
  // v3.25.x：console.error 也收进错误缓冲——代码里主动打的错误日志（如存储/
  // 接口失败）用户看不到，报障时一并带出来。包裹只转发不吞，原行为不变。
  try {
    var origCE = console.error;
    if (typeof origCE === 'function') {
      console.error = function () {
        try {
          var a = arguments, f = a[0], m = '', st = '';
          if (f instanceof Error) {
            m = f.message || String(f);
            try { st = f.stack ? String(f.stack) : ''; } catch (e3) {}
          } else if (a.length) {
            var parts = [];
            for (var i = 0; i < a.length; i++) {
              try { parts.push(typeof a[i] === 'object' && a[i] !== null ? JSON.stringify(a[i]) : String(a[i])); } catch (e4) {}
            }
            m = parts.join(' ');
          }
          if (m) pushErr('(console.error) ' + m.slice(0, 280), st);
        } catch (e2) {}
        return origCE.apply(console, arguments);
      };
    }
  } catch (e) {}
  // ===== 网络失败记录（v3.25.x） =====
  // 包一层 fetch（device.js 是首个脚本，先于所有业务模块执行），失败（网络错/
  // ≥400）记环形 6 条；1 分钟内同址同状态去重——pwa.js 弱网下每 15s 轮询
  // version.json 会连续失败，不去重会刷屏。AbortError（调用方主动超时）不算失败。
  function fetchFail(url, status) {
    try {
      var ent = { t: Date.now(), u: String(url || '').slice(0, 90), s: status || 0 };
      var last = null;
      try {
        var a = JSON.parse(localStorage.getItem(NET_KEY) || '[]');
        if (Array.isArray(a) && a.length) last = a[a.length - 1];
      } catch (e) {}
      if (last && last.u === ent.u && last.s === ent.s && ent.t - (last.t || 0) < 60000) return;
      ringPush(NET_KEY, ent, 6);
    } catch (e) {}
  }
  try {
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function () {
        var args = arguments;
        var url = '';
        try { url = String((args[0] && args[0].url) || args[0] || ''); } catch (e) {}
        return origFetch.apply(this, args).then(function (r) {
          try { if (r && r.status >= 400) fetchFail(url, r.status); } catch (e) {}
          return r;
        }).catch(function (err) {
          try { if (!err || err.name !== 'AbortError') fetchFail(url, 0); } catch (e) {}
          throw err;
        });
      };
    }
  } catch (e) {}
  // ===== 环境变化记录（v3.25.x） =====
  // 手机端 bug 常由「旋转 / 键盘弹起 / 切后台」触发，点开诊断那一刻的静态快照
  // 看不到。把最近 10 次环境变化（视口尺寸 / 前后台）带时间戳存 localStorage
  // （键 __diag-env），诊断信息末尾输出。resize 高度差 <100px 不记录：iOS Safari
  // 工具栏收展约 55-60px 且随滚动反复触发，全记会刷屏。
  const ENV_KEY = 'xy-home-v2:__diag-env';
  const LT_KEY = 'xy-home-v2:__diag-lt';
  const NET_KEY = 'xy-home-v2:__diag-net';
  const TAP_KEY = 'xy-home-v2:__diag-tap';
  // 通用环形缓冲写入（环境变化/长任务/网络失败/交互轨迹共用）
  function ringPush(key, ent, cap) {
    try {
      var arr = [];
      try {
        var old = localStorage.getItem(key);
        if (old) { var o = JSON.parse(old); if (Array.isArray(o)) arr = o; }
      } catch (e) {}
      arr.push(ent);
      if (arr.length > cap) arr = arr.slice(arr.length - cap);
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    } catch (e) {}
  }
  function envPush(k, x) {
    var ent = { t: Date.now(), k: String(k || '').slice(0, 20) };
    if (x) ent.x = String(x).slice(0, 120);
    ringPush(ENV_KEY, ent, 10);
  }
  var lastW = window.innerWidth || 0, lastH = window.innerHeight || 0;
  try {
    var rsT = null;
    window.addEventListener('resize', function () {
      if (rsT) clearTimeout(rsT);
      rsT = setTimeout(function () {
        rsT = null;
        try {
          var w = window.innerWidth || 0, h = window.innerHeight || 0;
          if (w === lastW && Math.abs(h - lastH) < 100) return;
          var x;
          if (Math.abs(w - lastW) > 20) x = w + 'x' + h + '（宽变了 ' + (w - lastW) + '，疑似旋转/分屏）';
          else if (h < lastH) x = w + 'x' + h + '（矮了 ' + (lastH - h) + 'px，疑似键盘弹起）';
          else x = w + 'x' + h + '（高了 ' + (h - lastH) + 'px，疑似键盘收起）';
          envPush('视口', x);
          lastW = w; lastH = h;
        } catch (e) {}
      }, 300);
    });
  } catch (e) {}
  try {
    document.addEventListener('visibilitychange', function () {
      envPush('前后台', document.hidden ? '切到后台' : '回到前台');
    });
  } catch (e) {}
  // ===== 长任务监测（v3.25.x） =====
  // 帧率采样只能测「打开诊断那一刻」；长任务 Observer 常驻记录 >50ms 主线程
  // 阻塞（掉帧元凶），TA 说「刚才卡了」时无需复现。环形 8 条存 localStorage
  // 跨刷新保留（靠时间戳辨新旧）。内核不支持时 ltSupported=false，输出处注明。
  var ltSupported = false;
  try {
    if ('PerformanceObserver' in window) {
      var ltObs = new PerformanceObserver(function (list) {
        try {
          var es = list.getEntries() || [];
          for (var i = 0; i < es.length; i++) {
            if (es[i] && es[i].duration >= 50) {
              ringPush(LT_KEY, { t: Date.now(), d: Math.round(es[i].duration) }, 8);
            }
          }
        } catch (e2) {}
      });
      try { ltObs.observe({ type: 'longtask', buffered: true }); ltSupported = true; } catch (e) {}
    }
  } catch (e) {}
  // ===== 交互轨迹（v3.25.x） =====
  // 捕获级点击委托，记最近 6 次点在哪个元素（标签#id.类名，最多向上 3 层）——
  // 「异常残留态」类 bug（如上轮房间取消标卡死）靠它还原用户操作路径。
  try {
    document.addEventListener('click', function (ev) {
      try {
        var desc = '', n = ev.target;
        for (var depth = 0; n && n !== document && depth < 3; depth++, n = n.parentNode) {
          var seg = n.tagName ? String(n.tagName).toLowerCase() : '';
          if (n.id) seg += '#' + n.id;
          if (typeof n.className === 'string' && n.className) seg += '.' + n.className.split(/\s+/).slice(0, 2).join('.');
          desc = desc ? seg + '>' + desc : seg;
        }
        if (desc) ringPush(TAP_KEY, { t: Date.now(), x: desc.slice(0, 80) }, 6);
      } catch (e) {}
    }, true);
  } catch (e) {}
  function mq(q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } }
  function cssSupports(decl) {
    try {
      if (!window.CSS || !CSS.supports) return '不支持';
      return CSS.supports(decl) ? '支持' : '不支持';
    } catch (e) { return '不支持'; }
  }
  function tsStr(t) { try { return t > 0 ? new Date(t).toLocaleString() : String(t); } catch (e) { return String(t); } }
  // v3.25.x：cache-bust 拉远端 version.json 与本机构建时间戳比对——GitHub Pages
  // PWA 最大类报障是「SW 缓存没更新，TA 手机跑的还是旧版」，让诊断直接给结论。
  // 与 pwa.js 轮询同口径：比 ts（构建时间戳），不比版本字符串。2s 超时兜底弱网。
  function fetchRemoteVer() {
    return new Promise(function (resolve) {
      try {
        fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
          if (!r.ok) return resolve({ ok: false });
          return r.json().then(function (j) {
            var ts = Number(j && j.ts);
            resolve({ ok: ts > 0, ts: ts > 0 ? ts : 0, info: String((j && j.info) || '') });
          }).catch(function () { resolve({ ok: false }); });
        }).catch(function () { resolve({ ok: false }); });
      } catch (e) { resolve({ ok: false }); }
      try { setTimeout(function () { resolve({ ok: false }); }, 2000); } catch (e) {}
    });
  }
  // SW 生命周期状态：waiting/installing 是「有新版没生效」的直接证据
  function swStateText() {
    return new Promise(function (resolve) {
      var out = '不支持';
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(function (reg) {
            try {
              if (!reg) { out = '未注册'; }
              else {
                var parts = [];
                if (reg.installing) parts.push('新版本安装中');
                if (reg.waiting) parts.push('有新版待激活（关掉本页全部标签重开生效）');
                if (reg.active) parts.push(navigator.serviceWorker.controller ? '当前版已生效' : '已激活但未控制本页（刷新一次接管）');
                out = parts.join('；') || '已注册（无活动状态）';
              }
            } catch (e2) { out = '读取失败'; }
            resolve(out);
          }).catch(function () { resolve('读取失败'); });
          try { setTimeout(function () { resolve('读取超时'); }, 2000); } catch (e) {}
          return;
        }
      } catch (e) {}
      resolve(out);
    });
  }
  // v3.25.x：高熵 UA 数据——国产浏览器/桌面模式常把 UA 里的机型抹成「K」，
  // Chromium 的 getHighEntropyValues 能拿到真实机型/系统版本/完整内核列表，
  // 用于判断「是不是特定机型才有的 bug」。不支持或超时 resolve('')。
  function uaDataModel() {
    return new Promise(function (resolve) {
      try {
        navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList']).then(function (v) {
          var parts = [];
          try {
            if (v && v.model) parts.push('机型=' + v.model);
            if (v && v.platformVersion) parts.push('系统版本=' + v.platformVersion);
            if (v && Array.isArray(v.fullVersionList)) {
              var brands = [];
              v.fullVersionList.forEach(function (b) {
                if (b && b.brand && !/^not/i.test(b.brand)) brands.push(b.brand + ' ' + b.version);
              });
              if (brands.length) parts.push('内核=' + brands.join('/'));
            }
          } catch (e2) {}
          resolve(parts.join('  '));
        }).catch(function () { resolve(''); });
      } catch (e) { resolve(''); }
      try { setTimeout(function () { resolve(''); }, 2000); } catch (e) {}
    });
  }
  // v3.25.x：500ms requestAnimationFrame 计数测实际帧率（「卡顿」类报障的实测
  // 线索）；后台页 rAF 被节流/暂停 → resolve(-1)，输出时注明。
  function fpsProbe() {
    return new Promise(function (resolve) {
      var n = 0, t0 = 0, done = false;
      var fin = function (v) { if (done) return; done = true; resolve(v); };
      try {
        var tick = function (t) {
          if (!t0) t0 = t;
          n++;
          if (t - t0 >= 500) { fin(Math.round(n * 1000 / (t - t0))); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch (e) { fin(-1); return; }
      try { setTimeout(function () { fin(-1); }, 1200); } catch (e) {}
    });
  }
  function collectDiag() {
    // v3.16.x：整个采集为 Promise 返回，调用方 .then 拿文本。
    // v3.25.x 修复：原实现在 Promise 构造器里同步 resolve，estimate()/persisted()
    // 的异步替换永远赶不上 join——配额行恒为「读取中…」、persisted 行永不出现。
    // 现改为 jobs 收集全部异步结果，Promise.all 后再 resolve；3s 兜底超时防个别
    // 内核异步 API 悬空导致弹窗永远不弹。
    return new Promise(function (resolve) {
    const d = window.mochiDevice || {};
    const L = [];
    const jobs = []; // 所有异步采集（配额/persisted/远端版本/SW 状态）进这里，最后 Promise.all
    // 版本号：开屏注入（构建时 __APP_VERSION__ 替换）。不能现读 #splash-ver——
    // 进入应用后它已被 clock.js 从 DOM 移除；用 IIFE 启动时缓存的 verCache/localTsCache
    let ver = verCache || '', localTs = localTsCache || 0;
    if (!ver) { try { ver = window.APP_VERSION || ''; } catch (e) {} }
    L.push('Mochi 诊断信息（' + ver + '）');
    L.push('时间：' + new Date().toLocaleString());
    L.push('');
    // v3.25.x：【更新状态】放最前——「TA 手机是不是旧缓存」是远端排障第一问。
    // 注意：L 是字符串数组，job 回调里改局部变量改不了已 push 的行，必须像
    // quotaIdx 一样记下标回写 L[...]——否则这三行永远停在「获取中/读取中」。
    L.push('【更新状态】');
    const remoteIdx = L.length; L.push('远端 version.json：获取中…');
    const cmpIdx = L.length; L.push('比对结论：');
    const swIdx = L.length; L.push('SW：读取中…');
    jobs.push(fetchRemoteVer().then(function (r) {
      if (!r || !r.ok) { L[remoteIdx] = '远端 version.json：获取失败（离线或网络受限）'; L[cmpIdx] = '比对结论：无法比较'; return; }
      L[remoteIdx] = '远端 version.json：' + (r.info ? r.info + '，' : '') + 'ts=' + r.ts + '（' + tsStr(r.ts) + '）';
      if (!localTs) { L[cmpIdx] = '比对结论：无法比较（本机无构建时间戳）'; return; }
      L[cmpIdx] = '比对结论：' + (r.ts > localTs
        ? '不一致——TA 手机上跑的是旧版（对方点顶部更新条刷新，或关掉全部标签页重开）'
        : (r.ts === localTs ? '一致（已是最新）' : '远端比本机还旧（GitHub Pages CDN 延迟？一般可忽略）'));
    }));
    jobs.push(swStateText().then(function (t) { L[swIdx] = 'SW：' + t; }));
    L.push('');
    L.push('【设备判定】');
    L.push('手机=' + !!d.isMobile + '  平板=' + !!d.isTablet + '  iOS=' + !!d.isIOS + '  安卓=' + !!d.isAndroid + '  Via=' + !!d.isVia);
    L.push('判定依据：' + (d.mobileRule || '(未命中任何兜底规则→按桌面)') + '  手动布局设置=' + (d.layoutPref || '自动')
      + '  视口=' + Math.round(window.innerWidth || 0) + '×' + Math.round(window.innerHeight || 0));
    // v3.26.x：启动瞬间的识别信号快照（判定就是按这份下的结论）——历轮修 vivo Edge
    // 都在猜哪条指纹被「桌面版网站」模式仿真掉了，报障文本直接给出全部输入值
    const _sg = d.signals || {};
    L.push('识别信号快照：screen=' + _sg.sw + '×' + _sg.sh + '  触摸=' + _sg.touch + '  coarse=' + _sg.coarse
      + '  hoverNone=' + _sg.hoverNone + '  orientationAPI=' + _sg.oriApi
      + '  UA谎称桌面=' + _sg.uaDesk + '  UA含移动标识=' + _sg.uaMobile
      + '  visualViewport宽=' + Math.round(_sg.vvW || 0)
      + '  UA-CH(mobile=' + _sg.uchMobile + ' android=' + _sg.uchAndroid + ')');
    L.push('html 类：' + (document.documentElement.className || '(空)'));
    const vp = document.querySelector('meta[name="viewport"]');
    L.push('viewport：' + (vp ? vp.content : '(无)'));
    L.push('');
    L.push('【浏览器】');
    L.push('UA：' + ua);
    L.push('platform=' + (navigator.platform || '') + '  language=' + (navigator.language || '') + '  vendor=' + (navigator.vendor || ''));
    L.push('maxTouchPoints=' + (navigator.maxTouchPoints || 0) + '  有触摸事件=' + ('ontouchstart' in window));
    // v3.25.x：高熵 UA——UA 被抹成「K」之类时，Chromium 这里仍拿得到真实机型
    // 与内核版本（iOS 无此接口，整行不输出）
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        let uadIdx = -1;
        try { L.push('uaData：读取中…'); uadIdx = L.length - 1; } catch (e2) {}
        jobs.push(uaDataModel().then(function (s) {
          if (uadIdx >= 0) L[uadIdx] = s ? 'uaData：' + s : 'uaData：无数据';
        }));
      }
    } catch (e) {}
    L.push('');
    L.push('【视口 / 屏幕】');
    L.push('innerWidth x Height=' + window.innerWidth + ' x ' + window.innerHeight);
    L.push('screen=' + screen.width + ' x ' + screen.height + '（可用 ' + screen.availWidth + ' x ' + screen.availHeight + '） DPR=' + (window.devicePixelRatio || 1));
    let vvTxt = '不支持';
    try {
      const vv = window.visualViewport;
      if (vv) vvTxt = vv.width + ' x ' + vv.height + ' scale=' + vv.scale;
    } catch (e) {}
    L.push('visualViewport=' + vvTxt);
    L.push('orientation=' + (typeof window.orientation !== 'undefined' ? window.orientation : 'undefined'));
    L.push('matchMedia(≤900px)=' + mq('(max-width: 900px)') + '  coarse=' + mq('(pointer: coarse)') + '  hoverNone=' + mq('(hover: none)'));
    L.push('display-mode: standalone=' + mq('(display-mode: standalone)') + '  fullscreen=' + mq('(display-mode: fullscreen)'));
    L.push('iOS 主屏幕打开(standalone)=' + (navigator.standalone === true));
    // v3.26.x：视口/键盘/全屏现场（iOS 三项报障的唯一可靠证据通道）——
    // 底部空隙 = 可视区底边到 .phone 底边的差；「残留」行专门抓
    // 「页面突然上移点不动」（收缩/文档锁/基线没复原）与全屏到底走了哪条路
    try {
      const vg = (typeof window.mochiVvDiag === 'function') ? window.mochiVvDiag() : null;
      if (vg) {
        L.push('视口实测：全屏=' + vg.fsMode + '  vv高=' + vg.vvH + '  .phone高=' + vg.phoneH
          + '（顶' + vg.phoneTop + '/底' + vg.phoneBottom + '）  底部空隙=' + vg.gapBottom
          + '  --mochi-ios-h=' + vg.iosH + '  --mochi-safe-bottom=' + vg.safeBottom
          + '  vv-fit=' + vg.vvFit);
        L.push('键盘/锁残留：kbActive=' + (vg.kb ? vg.kb.kbActive : 'n/a')
          + '  推定停靠=' + (vg.kb ? vg.kb.prov : 'n/a')
          + '  基线 inner/vv=' + (vg.kb ? vg.kb.fullInner + '/' + vg.kb.fullVv : 'n/a')
          + '  文档锁=' + (vg.kb ? vg.kb.docLocked : 'n/a')
          + '  html.overflow内联=' + (vg.htmlInlineOverflow || '(空)')
          + '  body.scroll-lock=' + vg.bodyScrollLock
          + '  .phone内联高=' + (vg.phoneInlineH || '(空)') + ' align-self=' + (vg.phoneAlignSelf || '(空)')
          + '  平移 vv.offsetTop=' + vg.vvOffsetTop + ' docY=' + vg.docScrollY);
      }
    } catch (e) {}
    L.push('');
    L.push('【能力】');
    L.push('Fullscreen API=' + !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen));
    L.push('方向锁 API=' + !!(screen.orientation && screen.orientation.lock));
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker) {
        const swc = navigator.serviceWorker.controller;
        L.push('serviceWorker=支持' + (swc ? '（已激活，controller=' + swc.scriptURL + '）' : '（未控制本页面）'));
      } else {
        L.push('serviceWorker=不支持');
      }
    } catch (e) { L.push('serviceWorker=读取失败'); }
    L.push('storage.persist=' + !!(navigator.storage && navigator.storage.persist));
    L.push('CSS dvh=' + cssSupports('height: 1dvh') + '  svh=' + cssSupports('height: 1svh') + '  env(safe-area)=' + cssSupports('padding-top: env(safe-area-inset-top)'));
    L.push('安卓输入框已转 ce-box=' + !!document.querySelector('.ce-box'));
    L.push('');
    // v3.25.x：【性能】——「卡顿」类报障的实测线索。帧率是打开诊断那一刻的
    // 现场采样（静态设置页满帧 ≠ 无卡顿，但静态页都掉帧说明系统性问题）；
    // 高刷屏（90/120Hz）读数 >60 属正常。JS 堆仅 Chrome 系提供，iOS 无。
    let fpsIdx = -1;
    L.push('【性能】');
    try { L.push('实测帧率：采样中…'); fpsIdx = L.length - 1; } catch (e) {}
    jobs.push(fpsProbe().then(function (fps) {
      if (fpsIdx < 0) return;
      L[fpsIdx] = fps > 0 ? '实测帧率≈' + fps + ' fps（500ms 现场采样，高刷屏>60 正常）' : '实测帧率：rAF 未触发（页面在后台被节流）';
    }));
    let memTxt = '不支持（仅 Chrome 系）';
    try {
      const pm = performance.memory;
      if (pm && pm.usedJSHeapSize) memTxt = 'JS堆 ' + (pm.usedJSHeapSize / 1048576).toFixed(1) + ' MB / 上限 ' + Math.round(pm.jsHeapSizeLimit / 1048576) + ' MB';
    } catch (e) {}
    L.push('JS 内存：' + memTxt);
    // v3.25.x：启动耗时 + 电量——「打开转圈久」与「低电量降频伪装成卡顿」的线索
    try {
      const nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
      if (nav && nav.domContentLoadedEventEnd > 0) {
        L.push('启动：首字节 ' + Math.round(nav.responseStart) + 'ms → DOM就绪 ' + Math.round(nav.domContentLoadedEventEnd) + 'ms → 加载完成 ' + (nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) + 'ms' : '未完成'));
      }
    } catch (e) {}
    try {
      const lts = JSON.parse(localStorage.getItem(LT_KEY) || '[]');
      if (Array.isArray(lts) && lts.length) {
        L.push('长任务>50ms（掉帧元凶）最近 ' + lts.length + ' 条（旧→新）：');
        lts.forEach(function (it) {
          const dt = it.t ? new Date(it.t).toLocaleTimeString() : '?';
          L.push('· ' + dt + ' 阻塞 ' + (it.d || '?') + 'ms');
        });
      } else {
        L.push('长任务>50ms：无' + (ltSupported ? '' : '（内核不支持观测）'));
      }
    } catch (e) {}
    try {
      if (navigator.getBattery) {
        let batIdx = -1;
        try { L.push('电量：读取中…'); batIdx = L.length - 1; } catch (e2) {}
        jobs.push(navigator.getBattery().then(function (b) {
          if (batIdx < 0) return;
          L[batIdx] = '电量=' + Math.round(b.level * 100) + '%' + (b.charging ? '（充电中）' : (b.level <= 0.2 ? '（低电量，省电降频可能伪装成卡顿）' : ''));
        }).catch(function () {
          if (batIdx >= 0) L[batIdx] = '电量：读取失败';
        }));
      }
    } catch (e) {}
    L.push('');
    L.push('【数据】');
    const G = 'xy-home-v2:';
    const usageStr = function (u) {
      if (u == null) return '(未知)';
      if (u >= 1048576) return (u / 1048576).toFixed(1) + ' MB';
      if (u >= 1024) return (u / 1024).toFixed(1) + ' KB';
      return u + ' B';
    };
    try {
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(G) === 0) n++;
      }
      L.push('localStorage 数据键=' + n + ' 个');
    } catch (e) { L.push('localStorage 不可访问'); }
    // v3.26.x：跨域名（device.js=AI-B）——回复字卡池诊断，报障「联系人只发【收到～】」直接定位
    try { if (window.__replyPoolDiag) L.push('回复字卡池：' + window.__replyPoolDiag()); } catch (e2) {}
    // v3.25.x：键明细——数据丢失类报障（键被清/写入失败/快照剥离）一眼定位：
    // 哪些键还在、各占多大。UTF-16 双字节估算，看量级够用。
    try {
      let total = 0;
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k2 = localStorage.key(i);
        if (!k2 || k2.indexOf(G) !== 0) continue;
        const sz = (k2.length + String(localStorage.getItem(k2) || '').length) * 2;
        total += sz;
        items.push({ k: k2.slice(G.length), size: sz });
      }
      items.sort(function (a, b) { return b.size - a.size; });
      L.push('数据总占用≈' + usageStr(total));
      const tops = items.slice(0, 8).map(function (it) { return it.k + '=' + usageStr(it.size); }).join('、');
      if (tops) L.push('最大键：' + tops);
    } catch (e) {}
    // v3.26.x：IndexedDB 大键明细——「存储配额已用 1.x GB」类报障一眼定位哪类数据在占空间：
    // 聊天图片（chat-msgs）/ 本地音乐（music-file）/ 头像库（avatar-lib）/ 备份快照
    // （__auto-backup-snapshot：手动导出时把全部数据复制一份进 IDB，是最常见的"数据翻倍"
    // 来源）/ 跨桌面副本（各联系人命名空间下的 music-file、avatar-lib、chat-msgs）。
    // 安全策略：只读候选大键（跳过几百个设置小键）；Blob/ArrayBuffer 只取 .size/.byteLength
    // 元数据不读数据；字符串逐键读后立即弃用，峰值内存=最大单键；单键读失败/超时跳过不阻塞。
    try {
      const idbIdx = L.length; L.push('IndexedDB 大键明细：读取中…');
      jobs.push(new Promise(function (res) {
        if (!window.idbGetAllKeys) { L[idbIdx] = 'IndexedDB 大键明细：接口不可用'; res(); return; }
        window.idbGetAllKeys().then(function (keys) {
          const cand = (keys || []).filter(function (k) {
            k = String(k || '');
            if (k.indexOf('xy-home-v2:') !== 0) return false;
            if (k.indexOf('music-file:') >= 0) return true;
            if (/:chat-msgs$/.test(k)) return true;
            if (/avatar-(lib|me-lib)$/.test(k)) return true;
            if (/:(phone-bg|wallpaper|chat-bg|page-bg|desk-bg|bg)$/.test(k)) return true;
            if (k.indexOf('__auto-backup-snapshot') >= 0) return true;
            return false;
          });
          if (!cand.length) { L[idbIdx] = 'IndexedDB 大键明细：无大键候选'; res(); return; }
          const out = [];
          (function loop(i) {
            if (i >= cand.length) {
              try {
                const real = out.filter(function (it) { return it.size >= 0; });
                real.sort(function (a, b) { return b.size - a.size; });
                const total = real.reduce(function (s, it) { return s + it.size; }, 0);
                const lines = ['IndexedDB 大键明细：' + cand.length + ' 个候选，合计≈' + usageStr(total) + '（设置小键未计）'];
                real.slice(0, 10).forEach(function (it) {
                  lines.push('· ' + String(it.k).slice('xy-home-v2:'.length) + '=' + (it.size >= 0 ? usageStr(it.size) : '?'));
                });
                L[idbIdx] = lines.join('\n');
              } catch (e) { L[idbIdx] = 'IndexedDB 大键明细：统计失败'; }
              res(); return;
            }
            const k = cand[i];
            if (!window.idbGet) { out.push({ k: k, size: -1 }); loop(i + 1); return; }
            window.idbGet(k).then(function (v) {
              let sz = -1;
              try {
                if (v instanceof Blob) sz = v.size;
                else if (v instanceof ArrayBuffer) sz = v.byteLength;
                else if (typeof v === 'string') sz = v.length * 2;
                else if (v !== undefined && v !== null) sz = JSON.stringify(v).length * 2;
              } catch (e) { sz = -1; }
              out.push({ k: k, size: sz });
              loop(i + 1);
            }).catch(function () { out.push({ k: k, size: -1 }); loop(i + 1); });
          })(0);
        }).catch(function () { L[idbIdx] = 'IndexedDB 大键明细：读取失败'; res(); });
      }));
    } catch (e) { try { L.push('IndexedDB 大键明细：读取失败'); } catch (e2) {} }
    // v3.26.x：开关持久化体检——荣耀 200 Pro Edge 报「系统预设字卡朋友圈/写信使用、
    // 我方发语音」关掉后退出浏览器重进变回去（Via/雨见正常）。把涉事键的
    // localStorage 原始值 / 读取接口值（内存优先）/ IndexedDB 权威值三层并列，
    // 配合 LS 写探针，一次诊断即可判断是「LS 写失败」「LS 落盘被回滚」还是「IDB 读取挂起」。
    try {
      const swIdx = L.length; L.push('开关持久化体检：读取中…');
      jobs.push(new Promise(function (res) {
        const cid = String(window.__activeCid || 'default');
        const P = G + cid + ':';
        const fmt = function (v) { return v === null || v === undefined ? '缺失' : JSON.stringify(String(v)); };
        const KEYS = ['dc-enabled', 'dc-use-chat', 'dc-use-mail', 'dc-use-feed', 'dc-cat-main', 'cs-voice-send'];
        const lines = ['开关持久化体检（当前桌面 ' + cid + '；\'1\'=开 \'0\'=关 缺失=默认值）：'];
        let probe = 'LS 写探针：正常';
        try {
          localStorage.setItem(G + '__ls-probe', 'p');
          if (localStorage.getItem(G + '__ls-probe') !== 'p') probe = 'LS 写探针：写入后读回不一致（异常！）';
          localStorage.removeItem(G + '__ls-probe');
        } catch (e3) { probe = 'LS 写探针：写入失败(' + ((e3 && e3.name) || '异常') + ')——配额满或存储被禁'; }
        lines.push(probe);
        let pend = KEYS.length;
        const done = function () { L[swIdx] = lines.join('\n'); res(); };
        const one = function (short) {
          let lsV = null, memV = null;
          try { lsV = localStorage.getItem(P + short); } catch (e3) { lsV = '(读失败)'; }
          try { memV = window.xyStore(P).get(short); } catch (e3) { memV = '(读失败)'; }
          const li = lines.length;
          lines.push('· ' + short + '：LS=' + fmt(lsV) + ' 读取=' + fmt(memV) + ' IDB=…');
          if (!window.idbGet) { lines[li] = lines[li].replace('IDB=…', 'IDB=(接口不可用)'); if (--pend <= 0) done(); return; }
          window.idbGet(P + short).then(function (iv) {
            lines[li] = lines[li].replace('IDB=…', 'IDB=' + (iv === undefined ? '(读失败/超时)' : fmt(iv)));
            if (--pend <= 0) done();
          }).catch(function () { lines[li] = lines[li].replace('IDB=…', 'IDB=(读失败)'); if (--pend <= 0) done(); });
        };
        KEYS.forEach(one);
        if (!pend) done();
      }));
    } catch (e) { try { L.push('开关持久化体检：读取失败'); } catch (e2) {} }
    // v3.16.x：存储配额/持久化/在线状态——「数据写不进去/丢失」类报障的关键字段：
    // 配额满写失败曾是本项目真实根因（localStorage setItem 静默失败）。
    // v3.25.x：改用 jobs + 占位行下标替换（原 L.indexOf 找占位串有误配风险，
    // 且 resolve 时机问题见函数头注释）。
    let quotaIdx = -1, persistedIdx = -1;
    try { L.push('存储配额：读取中…'); quotaIdx = L.length - 1; } catch (e) {}
    try { L.push('navigator.onLine=' + navigator.onLine); } catch (e) {}
    try {
      const est = navigator.storage && navigator.storage.estimate;
      if (est) {
        jobs.push(est.call(navigator.storage).then(function (r) {
          const s = r || {};
          if (quotaIdx >= 0) L[quotaIdx] = '存储配额：已用 ' + usageStr(s.usage) + ' / ' + usageStr(s.quota);
        }).catch(function () {
          if (quotaIdx >= 0) L[quotaIdx] = '存储配额：读取失败';
        }));
      } else if (quotaIdx >= 0) {
        L[quotaIdx] = '存储配额：接口不可用';
      }
    } catch (e) { if (quotaIdx >= 0) L[quotaIdx] = '存储配额：读取失败'; }
    try {
      const per = navigator.storage && navigator.storage.persisted;
      if (per) {
        try { L.push('storage.persisted=读取中…'); persistedIdx = L.length - 1; } catch (e2) {}
        jobs.push(per.call(navigator.storage).then(function (p) {
          if (persistedIdx >= 0) L[persistedIdx] = 'storage.persisted=' + p;
        }).catch(function () {
          if (persistedIdx >= 0) L[persistedIdx] = 'storage.persisted=读取失败';
        }));
      }
    } catch (e) {}
    // v3.16.x：最近错误（onerror/unhandledrejection/console.error 自动采集）
    // v3.26.x：错误记录双写 IDB，这里 LS 读不到时异步回退 IndexedDB——
    // 备份导入/恢复清空 xy-home-v2:* 键后错误线索仍能找回，不再"最近错误：无"
    try {
      const errIdx = L.length; L.push('最近错误：读取中…');
      jobs.push(new Promise(function (res) {
        readErrs(function (errs) {
          try {
            if (Array.isArray(errs) && errs.length) {
              const lines = ['最近错误 ' + errs.length + ' 条：'];
              errs.forEach(function (it) {
                const dt = it.t ? new Date(it.t).toLocaleString() : '?';
                lines.push('· ' + dt + ' [' + (it.dev || '') + '] ' + (it.msg || '').slice(0, 180) + (it.page ? '（页面 ' + it.page + '）' : ''));
                // v3.25.x：带调用栈（只取前 4 行，够定位文件+行号又不刷屏）
                const st = String(it.stack || '');
                if (st) lines.push('    ' + st.split('\n').slice(0, 4).join('\n    '));
              });
              L[errIdx] = lines.join('\n');
            } else {
              L[errIdx] = '最近错误：无';
            }
          } catch (e) { L[errIdx] = '最近错误：读取失败'; }
          res();
        });
      }));
    } catch (e) { L.push('最近错误：读取失败'); }
    // v3.25.x：环境变化记录（旋转/键盘/前后台）——手机端 bug 的触发现场
    try {
      const envs = JSON.parse(localStorage.getItem(ENV_KEY) || '[]');
      if (Array.isArray(envs) && envs.length) {
        L.push('环境变化 ' + envs.length + ' 条（旧→新）：');
        envs.forEach(function (it) {
          const dt = it.t ? new Date(it.t).toLocaleTimeString() : '?';
          L.push('· ' + dt + ' ' + (it.k || '') + '：' + (it.x || ''));
        });
      } else {
        L.push('环境变化：无');
      }
    } catch (e) { L.push('环境变化：读取失败'); }
    // v3.25.x：网络失败 + 交互轨迹
    try {
      const nets = JSON.parse(localStorage.getItem(NET_KEY) || '[]');
      if (Array.isArray(nets) && nets.length) {
        L.push('网络失败 ' + nets.length + ' 条（旧→新，1 分钟内同址去重）：');
        nets.forEach(function (it) {
          const dt = it.t ? new Date(it.t).toLocaleTimeString() : '?';
          L.push('· ' + dt + ' ' + (it.u || '?') + (it.s ? ' HTTP ' + it.s : '（网络错误/断网）'));
        });
      } else {
        L.push('网络失败：无');
      }
    } catch (e) { L.push('网络失败：读取失败'); }
    try {
      const taps = JSON.parse(localStorage.getItem(TAP_KEY) || '[]');
      if (Array.isArray(taps) && taps.length) {
        L.push('交互轨迹 ' + taps.length + ' 条（旧→新）：');
        taps.forEach(function (it) {
          const dt = it.t ? new Date(it.t).toLocaleTimeString() : '?';
          L.push('· ' + dt + ' ' + (it.x || '?'));
        });
      } else {
        L.push('交互轨迹：无');
      }
    } catch (e) { L.push('交互轨迹：读取失败'); }
    // 全部异步结果（配额/persisted/远端版本/SW）就绪后再 join；3s 兜底保证弹窗必弹
    let finished = false;
    const finish = function () { if (finished) return; finished = true; resolve(L.join('\n')); };
    try { Promise.all(jobs).then(finish).catch(finish); } catch (e) { finish(); }
    try { setTimeout(finish, 3000); } catch (e) {}
    });
  }
  function copyText(t) {
    // v3.16.x：clipboard.writeText 在权限被拒/WebView 剪贴板不可用时可能永不 settle
    //（headless、部分 IAB 实测 Promise 悬空），会导致「复制诊断信息」弹窗永远不弹。
    // 加 1.5s 超时兜底：超时按复制失败处理，流程照常走到弹窗。
    //
    // v3.26.x：用户反馈「点【复制】没弹窗、还把网页刷了」。根因两类：
    // ① 复制结果只写回弹窗顶部提示行，且内容与打开时几乎相同 → 看不出有反馈；
    // ② 部分安卓 WebView 对 navigator.clipboard.writeText 会弹系统权限/卡死甚至
    //    整页重载。改：复制优先走原生 document.execCommand('copy')（divination.js
    //    长期在用，无权限体系、不重载），失败再回退 clipboard API；bottom toast 兜底反馈。
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (ok) { if (done) return; done = true; resolve(ok); };
      // 回退 1：clipboard API（execCommand 不可用/返回 false 时）
      function fallbackClipboard() {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t).then(function () { finish(true); }).catch(function () { finish(false); });
          } else { finish(false); }
        } catch (e) { finish(false); }
      }
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus();
        try { ta.select(); } catch (e) {}
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        setTimeout(function () { try { document.body.removeChild(ta); } catch (e2) {} }, 800);
        if (ok) { finish(true); return; }
        fallbackClipboard();
      } catch (e) { fallbackClipboard(); }
      // 回退 2：1.5s 超时兜底（async 路径永不 settle 时）
      try { setTimeout(function () { finish(false); }, 1500); } catch (e) {}
    });
  }
  // v3.26.x：复制/导出按钮的可见反馈——bottom toast（全站统一反馈），
  // 复制结果不再只写进弹窗顶部提示行（那行内容与打开时几乎一样，用户看不出变化）。
  function diagToast(msg) { try { if (typeof window.toast === 'function') window.toast(msg); } catch (e) {} }
  // ===== v3.25.x：导出 txt =====
  // 诊断文本变长后，部分安卓 IAB/WebView 剪贴板对大文本静默截断或失败——
  // 下载成文件再经聊天 App 发送最稳。Blob + a[download]（iOS 13+/安卓 Chrome
  // 均支持）；个别内核无下载行为时 hint 里给「用复制/长按选字」兜底提示。
  function exportTxt(text) {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mochi-diag-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.txt';
      document.body.appendChild(a);
      a.click();
      try {
        setTimeout(function () {
          try { document.body.removeChild(a); } catch (e2) {}
          try { URL.revokeObjectURL(url); } catch (e2) {}
        }, 800);
      } catch (e2) {}
      return true;
    } catch (e) { return false; }
  }
  // ===== v3.25.x：诊断入口角标 =====
  // 报障的人不知道去哪拿诊断数据：采集到新错误后，「复制诊断信息」行上挂
  // 红色数字角标（未看过的错误数），点开诊断后归零，把报障动线推到眼前。
  // 样式内联自包含（仅此一处使用，不为此动 setting.css）；红底白字明暗主题都可读。
  const SEEN_KEY = 'xy-home-v2:__diag-errs-seen';
  function badgeEl() {
    let b = null;
    try { b = row.querySelector('.diag-err-badge'); } catch (e) {}
    if (!b) {
      b = document.createElement('span');
      b.className = 'diag-err-badge';
      b.style.cssText = 'flex-shrink:0;background:#e5484d;color:#fff;font-size:11px;line-height:16px;min-width:16px;box-sizing:border-box;text-align:center;border-radius:9px;padding:0 5px;font-weight:600;letter-spacing:.3px;';
      const arrow = row.querySelector('.arrow');
      if (arrow) { try { row.insertBefore(b, arrow); } catch (e2) { row.appendChild(b); } }
      else row.appendChild(b);
    }
    return b;
  }
  function refreshBadge() {
    try {
      readErrs(function (errs) {
        try {
          const n = Array.isArray(errs) ? errs.length : 0;
          const seen = Number(localStorage.getItem(SEEN_KEY)) || 0;
          const b = badgeEl();
          if (n > seen) { b.textContent = String(n); b.style.display = ''; }
          else b.style.display = 'none';
        } catch (e) {}
      });
    } catch (e) {}
  }
  try { refreshBadge(); } catch (e) {}
  // v3.26.x：暴露给「查看存储」页——手动清理错误诊断记录后角标同步归零
  try { window.mochiRefreshDiagBadge = refreshBadge; } catch (e) {}
  row.addEventListener('click', function () {
    collectDiag().then(function (text) {
      // v3.25.x：看过诊断 = 已知错误，角标归零（v3.26.x：按 IDB 回退后的记录数计）
      readErrs(function (errsNow) {
        try { localStorage.setItem(SEEN_KEY, String(Array.isArray(errsNow) ? errsNow.length : 0)); } catch (e) {}
        try { refreshBadge(); } catch (e) {}
      });
      copyText(text).then(function (ok) {
        // v3.26.x：自动复制结果连同 bottom toast 一起给，避免「打开时提示&复制后提示
        // 长得几乎一样、点了没反应」的观感。
        diagToast(ok ? '诊断信息已复制，可直接粘贴发给开发者' : '自动复制失败，请点下方【复制】重试');
        const tip = ok
          ? '诊断信息已复制到剪贴板，直接粘贴发给开发者即可。\n（下方内容可再核对）'
          : '自动复制失败，请点下方【复制】按钮重试，或长按选字手动复制。';
        if (window.openModal) {
          window.openModal('复制诊断信息', text, function () {}, {
            noInput: true,
            textarea: true,
            textareaRows: 14,
            // v3.25.x：宽版弹窗——默认弹窗 272px 太窄、多行框 3 行装不下诊断长文，
            // 加宽加高便于核对；配合 openModal 的 opts.big / css .modal--big
            big: true,
            placeholder: '',
            staticText: tip,
            // v3.16.x：弹窗内「复制」按钮——自动复制失败/想再复制时直接点它重试，
            // 复制成功用 hint() 就地反馈，不用关窗重进。
            copyBtn: {
              label: '复制',
              fn: function (ctl) {
                copyText(ctl ? ctl.text() : text).then(function (ok2) {
                  const m2 = ok2 ? '已复制到剪贴板，直接粘贴发给开发者即可。' : '复制失败，请长按选字手动复制。';
                  if (ctl && ctl.hint) ctl.hint(m2);
                  diagToast(ok2 ? '已复制到剪贴板' : '复制失败，请长按选字手动复制');
                });
              }
            },
            // v3.25.x：导出 txt——复制失败/截断时的兜底，下载后经聊天 App 发送
            exportBtn: {
              label: '导出txt',
              fn: function (ctl) {
                const okDl = exportTxt(ctl ? ctl.text() : text);
                const m3 = okDl ? '已开始下载 txt 文件（见浏览器下载列表），直接发送该文件即可。' : '当前内核不支持下载，请用【复制】或长按选字手动复制。';
                if (ctl && ctl.hint) ctl.hint(m3);
                diagToast(okDl ? '已开始下载 txt 文件' : '当前内核不支持下载，请用【复制】复制');
              }
            }
          });
        }
      });
    });
  });
})();

// ===== 功能：布局手动兜底 UI（v3.26.x，设置页「手机布局（强制）」） =====
// 设备判定纯靠指纹，而浏览器「桌面版网站」模式能把指纹整套仿真掉（vivo Y35 + Edge
// 连栽 v3.9/3.11/3.13 三轮）。这里给一条不依赖判定的自救通道：开关写 __layout-pref
// 后整页重载——布局形态在启动时就定死，运行中改类名不足以复原各模块读到的 isMobile。
// 说明弹窗同时给出浏览器侧的正解（关掉桌面模式），那才是「页面大小 + 全屏不可用」
// 两个症状共同的根因。
(function () {
  const d = window.mochiDevice;
  const box = document.getElementById('sf-force-mobile');
  if (!d || !box) return;
  const sub = document.getElementById('sf-force-mobile-sub');
  box.checked = d.layoutPref === 'mobile';
  function renderSub() {
    if (!sub) return;
    const sig = d.signals || {};
    if (d.layoutPref === 'mobile') {
      sub.textContent = '已强制手机布局。关闭本开关恢复自动判定；想在手机上改用电脑外壳，地址栏加 ?pc=1。';
    } else if (d.layoutPref === 'pc') {
      sub.textContent = '已强制电脑外壳（地址栏 ?pc=1）。打开上方开关或去掉该参数即恢复自动判定。';
    } else if (d.isMobile) {
      sub.textContent = '自动判定：手机布局（依据 ' + (d.mobileRule || 'viewport<=900') + '）。'
        + (sig.uaDesk ? '检测到浏览器正以「桌面版网站」模式伪装成电脑，本页已自动纠正为手机布局。' : '');
    } else {
      sub.textContent = '自动判定：电脑外壳（当前是电脑，或浏览器把手机伪装成了桌面）。手机上看不到满屏布局时打开上方开关。';
    }
  }
  renderSub();
  box.addEventListener('change', function () {
    d.setLayoutPref(box.checked ? 'mobile' : '');
    try { location.reload(); } catch (e) {}
  });
  const help = document.getElementById('sf-force-mobile-help');
  const openHelp = function (e) {
    if (e) { try { e.stopPropagation(); e.preventDefault(); } catch (er) {} }
    if (!window.openModal) return;
    const sig = d.signals || {};
    const txt = [
      '为什么需要这个开关\n',
      '浏览器（Edge / Chrome / Via 等）的「桌面版网站」模式会把手机的浏览器标识、屏幕尺寸、触摸能力整套伪装成电脑。本应用因此显示成电脑上的「小手机框 + 两侧灰底」，全屏模式也连带失灵——伪装出来的宽视口会被当成横屏，开关直接被「请先转竖屏」的判断拦下。\n',
      '推荐做法：关掉浏览器桌面模式（一步解决大小 + 全屏）\n',
      '· Edge（安卓）：右上角 ⋯ 菜单 → 取消勾选「桌面版网站」；若长期开着，Edge 设置 → 浏览/内容 → 关闭「始终请求桌面版网站」；',
      '· Chrome：⋮ 菜单 → 取消勾选「电脑版网站」；',
      '· 其他浏览器：菜单里通常叫「电脑版网页 / 桌面版网站」。\n',
      '关掉后仍是电脑布局，说明本应用没认出这台手机 —— 打开本开关强制切回手机布局（长期生效，随时可关）。\n',
      '\n当前判定：' + (d.isMobile ? '手机布局' : '电脑外壳')
        + '（依据 ' + (d.mobileRule || '—') + '）',
      '浏览器伪装桌面标识：' + (sig.uaDesk ? '是' : '否')
        + '　手动设置：' + (d.layoutPref || '自动')
        + '　视口：' + Math.round(window.innerWidth || 0) + '×' + Math.round(window.innerHeight || 0)
    ].join('\n');
    window.openModal('手机布局（强制）', '', function () {}, { noInput: true, staticText: txt });
  };
  if (help) {
    help.addEventListener('click', openHelp);
    help.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') openHelp(e);
    });
  }
})();

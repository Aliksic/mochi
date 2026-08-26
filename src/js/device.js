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
  const ua = String(navigator.userAgent || '');

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
  if (isTablet) { try { document.documentElement.classList.add('tablet'); } catch (e) {} }

  // v3.9.x：UA 桌面伪装兜底——Edge/Via 等浏览器「桌面站点」模式把 UA 改成
  // Windows 桌面、layout viewport 拉到 980px，上面 matchMedia('(max-width:900px)')
  // 误判为桌面，走桌面模拟器外壳（390px 小框 + 两侧灰底），手机上显示「变小/
  // PC 端布局」，且全屏开关成了「恢复正常大小」的开关（熄屏/重开又变小）。
  // 物理特征兜底：触摸屏 + 窄 screen.width（设备物理 CSS 宽度，不随 UA/layout
  // viewport 变）→ 实为手机伪装桌面，强制走手机布局。真桌面 PC 无触摸屏不命中；
  // 平板 screen.width≥900 或已走 isTablet 分支不命中。
  // v3.11.x：vivo Y35 + Edge 用户报修「打开仍是 PC 端，只能手动关桌面版网站」
  // ——该场景下内核连 screen.width 都伪装成桌面大屏（≥900），上面的窄屏判断
  // 失效。补一组不受 UA/视口/screen 伪装影响的输入特征信号：
  //   · (pointer: coarse) / (hover: none)：主输入是手指。触屏笔电/一体机的主
  //     指针仍是鼠标 → fine/hover，不会命中；手机开桌面模式后这两条媒体查询
  //     反映真实硬件输入能力，不受伪装影响。
  //   · window.orientation !== undefined：移动端内核专属 API，桌面浏览器不存在；
  //     安卓内核即使整套伪装 UA 也保留此 API。
  //   · UA 谎称桌面系统（Windows NT/Macintosh/X11/CrOS）。安卓/iOS 正常 UA 不含。
  // 命中组合：触摸 + 谎称桌面系统 + （有 orientation API 或 主输入 coarse 且无
  // hover）→ 判定手机伪装桌面。误伤面只剩「安卓平板开桌面模式」被强制手机布局
  // （内容拉宽但可交互，优于 PC 外壳）；iPad 已在上方 isTablet 分支拦截。
  if (!isMobile && !isTablet) {
    try {
      const sw = screen.width || screen.availWidth || 0;
      const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      let uaDesk = false, oriApi = false, coarsePtr = false, hoverNone = false;
      try { uaDesk = /Windows NT|Macintosh|X11|CrOS/i.test(ua); } catch (e) {}
      try { oriApi = typeof window.orientation !== 'undefined'; } catch (e) {}
      try { coarsePtr = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
      try { hoverNone = window.matchMedia && window.matchMedia('(hover: none)').matches; } catch (e) {}
      // v3.13.x：vivo Y35 + Edge 仍被强制 PC 端——上面的 screen.width / UA / orientation
      // 指纹 Edge「桌面站点」模式能一并伪装。补真机最可靠、无法伪装的信号：
      // visualViewport.width 反映屏幕真实可见宽（真机 CSS 宽 ~360-412），无论 layout
      // viewport 被拉成 980 还是 UA 谎报 Windows 都不变；但仅限触摸屏（触碰笔电的
      // 窄窗口 innerWidth<900 与之耦合度极低，且触摸窄窗口本就更适合手机布局）。
      let vvW = 0;
      try { vvW = (window.visualViewport && window.visualViewport.width) || 0; } catch (e) {}
      if ((sw > 0 && sw < 900 && touch) ||
          (touch && vvW > 0 && vvW <= 900) ||
          (touch && uaDesk && (oriApi || (coarsePtr && hoverNone)))) {
        isMobile = true;
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
    } catch (e) {}
  }

  // 平台判定（含 UA 伪装排除——OPPO/Via/夸克等浏览器可把 UA 伪装成 iPhone）
  // v3.7.x：/iphone|ipad|ipod/ 分支加 Android 排除（多数 UA 切换不彻底会保留
  // Android 标识）；!window.MSStream 排除 Windows Phone 的 IE/Spartan
  const isIOS = /iphone|ipad|ipod/i.test(ua) && !/android/i.test(ua) && !window.MSStream;
  const isAndroid = /android/i.test(ua);
  // v3.6.x：Via 浏览器（UA 特征）——实测其 WebView 禁用了方向锁（lock 无效），
  // 网页全屏必转横屏，fullscreen.js 需据此走 CSS 兜底
  const isVia = /via/i.test(ua);

  // 唯一判定源：全模块统一从这里读
  window.mochiDevice = {
    isMobile: !!isMobile,
    isTablet: !!isTablet,
    isIOS: !!isIOS,
    isAndroid: !!isAndroid,
    isVia: !!isVia
  };
})();

// ===== 复制诊断信息（设置页入口，v3.16.x） =====
// 用户报障时拿数据，别靠来回猜：一键复制 UA / 视口 / 特性检测 / 设备判定结果，
// 用户发给开发者即可定位「哪条设备分支生效」。贴进 openModal 的多行文本框，
// 剪贴板可用时自动写入（GitHub Pages https 环境可用）。
(function () {
  const row = document.getElementById('row-diagnostics');
  if (!row) return;
  // 独立取 UA：设备判定 IIFE 里的 ua 是局部变量，这里拿不到（压缩后更名），
  // 诊断模块自己读 navigator 即可
  const ua = String(navigator.userAgent || '');

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
  function pushErr(msg) {
    try {
      var arr = [];
      try {
        var old = localStorage.getItem(ERR_KEY);
        if (old) { var o = JSON.parse(old); if (Array.isArray(o)) arr = o; }
      } catch (e) {}
      arr.push(Object.assign({ msg: String(msg).slice(0, 300) }, errSnap()));
      if (arr.length > 5) arr = arr.slice(arr.length - 5);
      try { localStorage.setItem(ERR_KEY, JSON.stringify(arr)); } catch (e) {}
    } catch (e) {}
  }
  try {
    window.addEventListener('error', function (e) {
      var m = '';
      try { m = (e && e.message) ? e.message : String(e); } catch (e2) {}
      if (m) pushErr(m);
    });
  } catch (e) {}
  try {
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      var m = '';
      try { m = (r && r.message) ? r.message : String(r); } catch (e2) {}
      if (m && String(m).indexOf('ResizeObserver') < 0) pushErr('(promise) ' + m);
    });
  } catch (e) {}
  function mq(q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } }
  function cssSupports(decl) {
    try {
      if (!window.CSS || !CSS.supports) return '不支持';
      return CSS.supports(decl) ? '支持' : '不支持';
    } catch (e) { return '不支持'; }
  }
  function collectDiag() {
    // v3.16.x：storage.estimate 是异步 API，整个采集改为 Promise 返回，调用方 .then 拿文本。
    // 内部同步段先拼行，配额占位行在异步回调里就地替换（保持【数据】区行序）。
    return new Promise(function (resolve) {
    const d = window.mochiDevice || {};
    const L = [];
    // 版本号：开屏注入（构建时 __APP_VERSION__ 替换），取不到时留空
    let ver = '';
    try {
      const sv = document.getElementById('splash-ver');
      if (sv) ver = (sv.getAttribute('data-version') || '') + (sv.getAttribute('data-build-ts') ? ' (构建 ts=' + sv.getAttribute('data-build-ts') + ')' : '');
    } catch (e) {}
    if (!ver) { try { ver = window.APP_VERSION || ''; } catch (e) {} }
    L.push('Mochi 诊断信息（' + ver + '）');
    L.push('时间：' + new Date().toLocaleString());
    L.push('');
    L.push('【设备判定】');
    L.push('手机=' + !!d.isMobile + '  平板=' + !!d.isTablet + '  iOS=' + !!d.isIOS + '  安卓=' + !!d.isAndroid + '  Via=' + !!d.isVia);
    L.push('html 类：' + (document.documentElement.className || '(空)'));
    const vp = document.querySelector('meta[name="viewport"]');
    L.push('viewport：' + (vp ? vp.content : '(无)'));
    L.push('');
    L.push('【浏览器】');
    L.push('UA：' + ua);
    L.push('platform=' + (navigator.platform || '') + '  language=' + (navigator.language || '') + '  vendor=' + (navigator.vendor || ''));
    L.push('maxTouchPoints=' + (navigator.maxTouchPoints || 0) + '  有触摸事件=' + ('ontouchstart' in window));
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
    L.push('【数据】');
    const G = 'xy-home-v2:';
    try {
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(G) === 0) n++;
      }
      L.push('localStorage 数据键=' + n + ' 个');
    } catch (e) { L.push('localStorage 不可访问'); }
    // v3.16.x：存储配额/持久化/在线状态——「数据写不进去/丢失」类报障的关键字段：
    // 配额满写失败曾是本项目真实根因（localStorage setItem 静默失败），
    // estimate() 是异步 API，先放占位行，回调里就地替换。
    try {
      L.push('存储配额：读取中…');
    } catch (e) {}
    try { L.push('navigator.onLine=' + navigator.onLine); } catch (e) {}
    try {
      const est = navigator.storage && navigator.storage.estimate;
      if (est) {
        const usageStr = function (u) {
          if (u == null) return '(未知)';
          if (u >= 1048576) return (u / 1048576).toFixed(1) + ' MB';
          if (u >= 1024) return (u / 1024).toFixed(1) + ' KB';
          return u + ' B';
        };
        try {
          est.call(navigator.storage).then(function (r) {
            const s = r || {};
            const idx = L.indexOf('存储配额：读取中…');
            const line = '存储配额：已用 ' + usageStr(s.usage) + ' / ' + usageStr(s.quota);
            if (idx >= 0) L[idx] = line; else L.push(line);
          }).catch(function () {
            const idx = L.indexOf('存储配额：读取中…');
            if (idx >= 0) L[idx] = '存储配额：读取失败';
          });
        } catch (e) {}
      } else {
        const idx = L.indexOf('存储配额：读取中…');
        if (idx >= 0) L[idx] = '存储配额：接口不可用';
      }
    } catch (e) {}
    try {
      navigator.storage && navigator.storage.persisted && navigator.storage.persisted().then(function (p) {
        L.push('storage.persisted=' + p);
      }).catch(function () {});
    } catch (e) {}
    // v3.16.x：最近错误（onerror/unhandledrejection 自动采集）
    try {
      const errs = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
      if (Array.isArray(errs) && errs.length) {
        L.push('最近错误 ' + errs.length + ' 条：');
        errs.forEach(function (it) {
          const dt = it.t ? new Date(it.t).toLocaleString() : '?';
          L.push('· ' + dt + ' [' + (it.dev || '') + '] ' + (it.msg || '').slice(0, 180) + (it.page ? '（页面 ' + it.page + '）' : ''));
        });
      } else {
        L.push('最近错误：无');
      }
    } catch (e) {}
    resolve(L.join('\n'));
    });
  }
  function copyText(t) {
    // v3.16.x：clipboard.writeText 在权限被拒/WebView 剪贴板不可用时可能永不 settle
    //（headless、部分 IAB 实测 Promise 悬空），会导致「复制诊断信息」弹窗永远不弹。
    // 加 1.5s 超时兜底：超时按复制失败处理，流程照常走到弹窗。
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (ok) { if (done) return; done = true; resolve(ok); };
      let started = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          started = true;
          navigator.clipboard.writeText(t).then(function () { finish(true); }).catch(function () { finish(false); });
        }
      } catch (e) {}
      if (!started) { finish(false); return; }
      try { setTimeout(function () { finish(false); }, 1500); } catch (e) {}
    });
  }
  row.addEventListener('click', function () {
    collectDiag().then(function (text) {
      copyText(text).then(function (ok) {
        const tip = ok
          ? '诊断信息已复制到剪贴板，直接粘贴发给开发者即可。\n（下方内容可再核对）'
          : '自动复制失败，请点下方【复制】按钮重试，或长按选字手动复制。';
        if (window.openModal) {
          window.openModal('复制诊断信息', text, function () {}, {
            noInput: true,
            textarea: true,
            textareaRows: 14,
            placeholder: '',
            staticText: tip,
            // v3.16.x：弹窗内「复制」按钮——自动复制失败/想再复制时直接点它重试，
            // 复制成功用 hint() 就地反馈，不用关窗重进。
            copyBtn: {
              label: '复制',
              fn: function (ctl) {
                copyText(ctl ? ctl.text() : text).then(function (ok2) {
                  if (ctl && ctl.hint) {
                    ctl.hint(ok2 ? '已复制到剪贴板，直接粘贴发给开发者即可。' : '复制失败，请长按选字手动复制。');
                  }
                });
              }
            }
          });
        }
      });
    });
  });
})();

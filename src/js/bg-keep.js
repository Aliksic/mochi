// ===== 功能：后台保活 + 后台通知（仿星言简约版） =====
// 后台保活：播放静音音频（1Hz 正弦波，音量 0.0001）保持页面定时器活跃，
//           并请求屏幕常亮（wakeLock），防止浏览器后台休眠导致消息/回复停止；
//           首次交互时恢复 AudioContext（浏览器自动播放策略要求）。
// 后台通知：开启后，页面不在前台时收到 TA 的新消息会弹出浏览器通知。
(function () {
  const uid = window.activePrefix();
  const store = window.activeStore();
  // v3.9.x：后台保活 / 后台通知是【系统级】设置（位于全局设置页 #page-setting），
  // 但原先按当前联系人桌面存储（activeStore）——切换桌面或系统恢复页面时 active-contact
  // 指向别的桌面，开关就会显示成「关」（用户自述：挂机几小时后回来看「后台保活自己关了」，
  // 导致夜里系统通知不弹）。改为存全局命名空间，读时回退旧版每桌面值完成迁移。
  const GNS = 'xy-home-v2';
  function gGet(k) {
    try { const v = window.xyStore ? window.xyStore(GNS).get(k) : null; if (v !== null && v !== undefined) return v; } catch (e) {}
    try { return store.get(k); } catch (e) { return null; }
  }
  function gSet(k, v) {
    try { if (window.xyStore) window.xyStore(GNS).set(k, v); } catch (e) {}
  }
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

  // ================= 后台保活 =================
  let keepAudio = null;
  let keepInterval = null;
  let keepEnabled = false;
  let wakeSentinel = null; // v3.5.131：模块级，供 stopKeepAlive 释放

  // v3.5.160：保活音频 dataURL——用 <audio> 元素循环播放（不是 Web Audio 振荡器）。
  // 关键机制：Chrome 安卓的媒体通知条（通知栏"正在播放"）绑定到 HTMLMediaElement
  // （<audio>/<video>），Web Audio 的 AudioContext 振荡器【不触发媒体条】——这正是
  // 之前"音乐能显示媒体条、保活看不到"的原因。改用 <audio> 后媒体条正常显示、
  // 后台不冻结。合成 1 秒极轻正弦波 WAV（220Hz，幅度 0.02，人耳几乎听不到）
  let KEEP_AUDIO_DATAURL = '';
  function ensureKeepAudioDataUrl() {
    if (KEEP_AUDIO_DATAURL) return KEEP_AUDIO_DATAURL;
    try {
      const sr = 44100, sec = 1, n = sr * sec;
      const buf = new ArrayBuffer(44 + n * 2);
      const dv = new DataView(buf);
      const ws = function (o, s) { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
      ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
      ws(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const v = Math.sin(2 * Math.PI * 220 * (i / sr)) * 0.02;
        dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
      }
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      KEEP_AUDIO_DATAURL = 'data:audio/wav;base64,' + btoa(bin);
    } catch (e) { KEEP_AUDIO_DATAURL = ''; }
    return KEEP_AUDIO_DATAURL;
  }

  // v3.9.x：设置"后台保活"媒体会话条。音乐播放时（__musicPlaying）让位给 music-player
  // 的歌曲 metadata + 控制 handler，避免通知栏按钮空响应无法控制音乐。
  function setKeepMediaSession() {
    try {
      if (!('mediaSession' in navigator) || !navigator.mediaSession || !window.MediaMetadata) return;
      if (window.__musicPlaying) return; // 音乐在播，保留音乐的媒体条
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: 'Mochi 后台保活',
        artist: 'mochi',
        album: '后台消息提醒运行中'
      });
      // v3.5.159：声明 playbackState='playing'——Chrome 安卓判定"页面正在播放媒体"
      // 必须 playbackState=playing + 音频实际输出，否则媒体会话不激活、后台照常冻结
      try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
      try {
        navigator.mediaSession.setActionHandler('play', function () {});
        navigator.mediaSession.setActionHandler('pause', function () {});
      } catch (e) {}
    } catch (e) {}
  }

  function startKeepAlive(showToast) {
    if (keepAudio) return;
    try {
      // v3.5.160：保活音频改用 <audio> 元素循环播放极轻正弦波——媒体通知条才会显示
      const src = ensureKeepAudioDataUrl();
      if (!src) { if (showToast) toast('后台保活启动失败（无法生成保活音频）'); return; }
      const keepEl = document.createElement('audio');
      keepEl.loop = true;
      keepEl.volume = 0.05;          // 低但非静音（近零音量会被 Chrome 无声节流）
      keepEl.src = src;
      keepEl.setAttribute('playsinline', '');
      const playIt = function () {
        const p = keepEl.play();
        if (p && p.catch) p.catch(function () {});
      };
      playIt();
      keepAudio = { el: keepEl };

      // v3.5.155：媒体会话标记——Chrome 安卓把「有活跃媒体会话 + 音频输出」的页面
      // 视为"正在播放媒体"，后台几乎不冻结（Youtube 网页版后台持续播放即此原理）。
      // 保活开启后在通知栏显示一个媒体条「mochi 后台保活」，既让用户看到保活在跑，
      // 又大幅提升后台定时器存活率 → 后台消息/通知到达率。比纯静音音频 + wakeLock
      // 强很多；停用保活时清除（stopKeepAlive）
      // v3.9.x：音乐播放时让位——music-player 已设置歌曲 metadata + 控制 handler，
      // 这里不覆盖（否则通知栏变成"后台保活"且按钮空响应，无法控制音乐）
      setKeepMediaSession();

      // 用户首次交互时恢复播放（浏览器自动播放策略要求）
      const resumeOnInteraction = function () {
        if (keepAudio && keepAudio.el && keepAudio.el.paused) {
          const p = keepAudio.el.play();
          if (p && p.catch) p.catch(function () {});
        }
      };
      document.addEventListener('click', resumeOnInteraction, { once: true });
      document.addEventListener('touchstart', resumeOnInteraction, { once: true });
      document.addEventListener('keydown', resumeOnInteraction, { once: true });
      // 每 5 秒尝试恢复（防止暂停 / mediaSession 失效）
      // v3.5.159：恢复时重设 playbackState='playing'（Chrome 挂起后可能把它重置）
      keepInterval = setInterval(function () {
        if (keepAudio && keepAudio.el) {
          if (keepAudio.el.paused) {
            const p = keepAudio.el.play();
            if (p && p.catch) p.catch(function () {});
          }
          // 音频在跑就持续声明"正在播放"，维持媒体会话活跃
          try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
        }
      }, 5000);

      // 屏幕常亮（wakeLock），释放后自动重试
      // v3.5.131：wakeSentinel 提升为模块级——stopKeepAlive 需要释放它（原闭包变量
      // 关闭保活后屏幕仍常亮，用户以为关了实际没关）
      const requestWakeLock = function () {
        if (navigator.wakeLock && document.visibilityState === 'visible') {
          navigator.wakeLock.request('screen').then(function (sentinel) {
            wakeSentinel = sentinel;
            if (wakeSentinel) {
              wakeSentinel.addEventListener('release', function () {
                setTimeout(function () { if (keepEnabled) requestWakeLock(); }, 1000);
              });
            }
          }).catch(function () {});
        }
      };
      requestWakeLock();
      // v3.5.132：visibilitychange 监听移到模块顶层注册一次（在 startKeepAlive 内
      // 每次开关都会累积一个监听器 + 一个旧 wakeLock 永不释放）

      if (showToast) {
        // v3.5.133：保活开启时通知发送结果做成可感知诊断——
        // 系统通知能不能显示由浏览器+系统决定，API 不报错但可能被系统拦截；
        // 分情况提示用户卡在哪一环，避免"开了保活但通知栏永远没消息"的静默失效
        if (!('Notification' in window)) {
          toast('后台保活已启动（注意：本环境不支持系统通知，需 HTTPS 访问）');
        } else if (Notification.permission !== 'granted') {
          toast('后台保活已启动（通知未授权：去设置→后台通知→开启并允许权限）');
        } else {
          showSysNotification('后台保活已启动', { body: '正在播放静音音频以保持后台活跃，请勿关闭此页面' }).then(function (ok) {
            toast(ok
              ? '后台保活已启动 · 通知栏应弹出提示条，若没有请到系统设置→通知→Chrome→允许通知'
              : '后台保活已启动（通知发送未受理，请检查系统通知权限）');
          });
        }
      }
    } catch (e) {}
  }
  function stopKeepAlive(showToast) {
    // v3.5.160：停掉 <audio> 保活音频（原来 stop osc/close ctx）
    try { if (keepAudio && keepAudio.el) { keepAudio.el.pause(); keepAudio.el.src = ''; } } catch (e) {}
    // v3.5.155：清除媒体会话标记（通知栏媒体条消失）
    // v3.9.x：音乐播放时不清除——music-player 正在用 MediaSession 控制音乐
    if (!window.__musicPlaying) {
      try {
        if ('mediaSession' in navigator && navigator.mediaSession) {
          navigator.mediaSession.metadata = null;
          try { navigator.mediaSession.setActionHandler('play', null); } catch (e) {}
          try { navigator.mediaSession.setActionHandler('pause', null); } catch (e) {}
        }
      } catch (e) {}
    }
    // v3.5.131：释放屏幕常亮（原实现从不 release——关闭保活后屏幕持续不熄）
    try { if (wakeSentinel) { wakeSentinel.release(); } } catch (e) {}
    wakeSentinel = null;
    clearInterval(keepInterval);
    keepAudio = null;
    keepInterval = null;
    if (showToast) toast('后台保活已关闭');
  }
  // v3.5.132：模块顶层注册一次（防反复开关保活累积监听器）
  // v3.9.x：回前台完整自愈——原逻辑回前台只补 wakeLock；Chrome/系统在后台/锁屏
  // 几小时后会挂起保活音频、丢弃媒体条，不恢复的话通知栏「Mochi 后台保活」条消失、
  // 静音音频停播 → 页面再次被后台冻结，TA 消息/弹窗停摆。现在回前台把音频/媒体条/
  // wakeLock 一并恢复，保证下一次后台会话依旧保活。
  function healKeepAlive() {
    if (!keepEnabled) return;
    // 1) 恢复被挂起的保活音频（回前台瞬间可能仍被浏览器阻塞，延迟再试几次）
    if (keepAudio && keepAudio.el && keepAudio.el.paused) {
      const p = keepAudio.el.play();
      if (p && p.catch) p.catch(function () {});
    }
    [0, 600, 1800].forEach(function (d) {
      setTimeout(function () {
        if (!keepEnabled) return;
        if (keepAudio && keepAudio.el && keepAudio.el.paused) {
          const p = keepAudio.el.play();
          if (p && p.catch) p.catch(function () {});
        }
      }, d);
    });
    // 2) 媒体条可能已被丢弃——重设「Mochi 后台保活」媒体会话（音乐在播时自动让位）
    setKeepMediaSession();
    // 3) 重新请求屏幕常亮
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (sentinel) {
          wakeSentinel = sentinel;
          if (wakeSentinel) {
            wakeSentinel.addEventListener('release', function () {
              setTimeout(function () { if (keepEnabled) requestWakeLockTop(); }, 1000);
            });
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') healKeepAlive();
  });
  // v3.9.x：窗口重新聚焦 / bfcache 恢复（pageshow persisted）同样自愈——
  // 有些浏览器从后台切回只触发 focus 不触发 visibilitychange；bfcache 恢复时
  // 定时器已暂停，恢复后保活音频也一并拉回
  document.addEventListener('focus', function () {
    if (document.visibilityState === 'visible') healKeepAlive();
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted || document.visibilityState === 'visible') healKeepAlive();
  });
  function requestWakeLockTop() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible' && keepEnabled) {
        navigator.wakeLock.request('screen').then(function (sentinel) {
          wakeSentinel = sentinel;
        }).catch(function () {});
      }
    } catch (e) {}
  }
  // v3.9.x：音乐停止后（music-media-release）恢复"后台保活"媒体条——
  // music-player 播放时覆盖了保活 metadata，停止后这里重新设回，保活后台存活率不降
  document.addEventListener('music-media-release', function () {
    if (keepEnabled) setKeepMediaSession();
  });
  const kaBtn = document.getElementById('bg-keepalive');
  function syncKeepUI() { if (kaBtn) kaBtn.checked = keepEnabled; }
  if (kaBtn) {
    kaBtn.addEventListener('change', function () {
      keepEnabled = kaBtn.checked;
      gSet('bg-keepalive', keepEnabled ? '1' : '0');
      if (keepEnabled) startKeepAlive(true);
      else stopKeepAlive(true);
    });
  }
  (function () {
    // v3.9.x：全局化迁移——旧版按桌面存（activeStore），读时回退旧值并写全局，
    // 之后开关不再随桌面/active-contact 变化而"自己关掉"
    let saved = gGet('bg-keepalive');
    if (saved === null) {
      const old = store.get('bg-keepalive');
      if (old !== null) { gSet('bg-keepalive', old); saved = old; }
    }
    keepEnabled = saved === null ? false : saved === '1';
    syncKeepUI();
    if (keepEnabled) startKeepAlive(false);
  })();

  // ================= 后台通知 =================
  let notifyEnabled = false;
  // v3.5.151：系统通知左侧图标用「带 mochi 字母的完整图标」（icon-512.png，
  // 与手机桌面快捷方式图标一致）。之前用 icon-192.png（纯心形小图标），
  // 用户看到的左侧是"爱心"而非带字母的 mochi 图标
  const NOTIFY_ICON = (function () {
    try { return new URL('./icon-512.png', location.href).href; } catch (e) { return ''; }
  })();
  // v3.5.135：统一走 Service Worker 显示通知——Chrome Android 规范：页面在后台（隐藏）
  //   时，页面脚本直接 new Notification() 会被静默抑制（通知不弹也不报错），
  //   标准做法是 navigator.serviceWorker.ready → reg.showNotification()（SW 独立于页面，
  //   隐藏时允许显示）。此辅助函数统一封装：优先 SW，失败回退页面 Notification。
  //   返回 Promise<boolean>：true=已提交显示（能否真正显示仍由系统通知权限决定）
  function showSysNotification(title, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      try {
        if (!('Notification' in window) || Notification.permission !== 'granted') { resolve(false); return; }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
          // v3.5.137：urgency:'high' 让通知以「高紧迫度」发送——Chrome 安卓上
          // 高紧迫度通知更可能以悬浮（head-up）形式显示在屏幕上方，而不是只进
          // 下拉通知栏；配合系统「横幅通知」权限即为微信式顶部弹窗
          const swOpts = Object.assign({}, opts);
          if (!swOpts.urgency) swOpts.urgency = 'high';
          // v3.5.156：mochi 图标设到 badge（左侧小图标）——安卓通知里 badge 才是
          // 左侧小图标位；icon 是右侧大图标位（由调用方传联系人头像/消息图）。
          // 此前把 mochi 设进 icon → 显示在右侧，左侧 badge 未设 → 浏览器默认图标
          if (!swOpts.badge && NOTIFY_ICON) swOpts.badge = NOTIFY_ICON;
          navigator.serviceWorker.ready.then(function (reg) {
            reg.showNotification(title, swOpts).then(function () { resolve(true); }, function () {
              // v3.5.142：逐级降级重发——带 image（图片缩略图）失败 → 去 image 重发；
              // 仍失败且带 icon → 再去 icon 重发；保证文字通知不因图片/图标异常整条丢失
              const tryNoImage = function () {
                if (swOpts.image) {
                  const noImg = Object.assign({}, swOpts);
                  delete noImg.image;
                  reg.showNotification(title, noImg).then(function () { resolve(true); }, function () {
                    if (swOpts.icon) {
                      const noIcon = Object.assign({}, swOpts);
                      delete noIcon.icon;
                      reg.showNotification(title, noIcon).then(function () { resolve(true); }, function () { resolve(false); });
                    } else {
                      resolve(false);
                    }
                  });
                } else if (swOpts.icon) {
                  const noIcon = Object.assign({}, swOpts);
                  delete noIcon.icon;
                  reg.showNotification(title, noIcon).then(function () { resolve(true); }, function () { resolve(false); });
                } else {
                  resolve(false);
                }
              };
              tryNoImage();
            });
          }).catch(function () {
            // SW 不可用回退页面路径：去掉 image 与 icon（页面 Notification 对
            // dataURL 图片/图标不稳定，带上会导致整条通知失败，v3.5.118 教训）
            const noMedia = Object.assign({}, opts);
            delete noMedia.image;
            delete noMedia.icon;
            try { new Notification(title, noMedia); resolve(true); } catch (e) { resolve(false); }
          });
        } else {
          const noMedia = Object.assign({}, opts);
          delete noMedia.image;
          delete noMedia.icon;
          try { new Notification(title, noMedia); resolve(true); } catch (e) { resolve(false); }
        }
      } catch (e) { resolve(false); }
    });
  }
  // v3.5.114：请求权限（支持成功/失败回调）——失败时开关要弹回关闭，
  //   否则 iOS 不支持 / 权限被拒时开关显示"开"但实际无效，误导用户
  function requestNotifyPermission(cb, failCb) {
    if (!('Notification' in window)) {
      // v3.7.x：按平台区分文案——安卓阉割 WebView（OPPO 自带/Via 等）也无 Notification API，
      //   原文案硬编码"iPhone"对安卓用户很困惑。iOS 仍引导装主屏（iOS PWA 也不支持本地通知）
      const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
        && !/android/i.test(navigator.userAgent) && !window.MSStream;
      toast(_isIOS
        ? 'iPhone 网页版不支持系统通知\n请安装到主屏幕后由系统接管'
        : '当前浏览器不支持系统通知\n请改用 Chrome/Edge，或添加到主屏幕后由系统接管');
      if (failCb) failCb();
      return;
    }
    if (Notification.permission === 'granted') { if (cb) cb(); return; }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { if (cb) cb(); }
        else {
          toast('未获得通知权限，后台消息无法弹窗');
          if (failCb) failCb();
        }
      }).catch(function () { if (failCb) failCb(); });
    } else {
      toast('通知权限被拒绝，请在浏览器设置中允许通知');
      if (failCb) failCb();
    }
  }
  const nbBtn = document.getElementById('bg-notify');
  function syncNotifyUI() { if (nbBtn) nbBtn.checked = notifyEnabled; }
  if (nbBtn) {
    nbBtn.addEventListener('change', function () {
      if (nbBtn.checked) {
        requestNotifyPermission(function () {
          notifyEnabled = true;
          gSet('bg-notify', '1');
          syncNotifyUI();
          showSysNotification('通知已开启', { body: '后台消息提醒将正常弹窗' });
          // v3.5.132：开启通知时自动联动开启后台保活——后台消息要"到达"必须
          //   页面定时器在后台仍运行（静音音频保活）；否则开关开了但页面休眠，
          //   消息根本不产生，通知永远不会弹（旧版只 toast 提醒，用户容易漏开）
          setTimeout(function () {
            const keep = document.getElementById('bg-keepalive');
            const keepOn = keepEnabled;
            if (!keepOn) {
              if (keep) keep.checked = true;
              keepEnabled = true;
              gSet('bg-keepalive', '1');
              startKeepAlive(false);
              syncKeepUI();
              toast('已自动开启后台保活（后台消息必需）');
            }
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
              toast('提醒：需 HTTPS 访问，浏览器才允许通知');
            }
          }, 400);
        }, function () {
          // 失败：弹回开关
          notifyEnabled = false;
          gSet('bg-notify', '0');
          syncNotifyUI();
        });
      } else {
        notifyEnabled = false;
        gSet('bg-notify', '0');
        syncNotifyUI();
      }
    });
  }
  (function () {
    // v3.9.x：全局化迁移（同 bg-keepalive）
    let saved = gGet('bg-notify');
    if (saved === null) {
      const old = store.get('bg-notify');
      if (old !== null) { gSet('bg-notify', old); saved = old; }
    }
    // v3.5.131：恢复时校验权限——浏览器/系统回收权限后开关仍显示"开"但通知静默失效
    notifyEnabled = saved === '1' && 'Notification' in window && Notification.permission === 'granted';
    if (saved === '1' && !notifyEnabled) {
      try { gSet('bg-notify', '0'); } catch (e) {}
      toast('通知权限已被回收，已自动关闭通知');
    }
    syncNotifyUI();
  })();
  // v3.5.115：后台通知「测试」按钮——点一下发条测试通知 + 环境诊断，
  //   安卓 Chrome 上通知不生效时一键定位卡在哪一环（HTTPS/权限/后台保活）
  // v3.5.116：增强诊断——权限未授权时主动请求；发送后追加系统级通知检查提示
  //   （红米/小米 HyperOS：站点权限通过后，系统设置里 Chrome 的通知仍可能被关，
  //   此时 API 不报错但通知不显示，需提示用户去系统设置检查）
  const testBtn = document.getElementById('bg-notify-test');
  if (testBtn) {
    testBtn.addEventListener('click', function () {
      const env = [];
      if (!('Notification' in window)) {
        env.push('✗ 当前浏览器不支持 Notification API');
        env.push('原因：安卓 Chrome 必须 HTTPS 访问才有通知');
        env.push('当前：' + location.protocol + '//' + location.host);
        env.push('解决：用 https:// 部署访问（GitHub Pages 即是 HTTPS）');
        toast('环境检查：\n' + env.join('\n'));
        return;
      }
      if (Notification.permission === 'default') {
        // 未授权：主动请求一次再继续
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') runTest(env);
          else {
            env.push('✗ 通知权限：拒绝了授权请求');
            env.push('解决：地址栏左侧图标 → 网站设置 → 通知 → 允许');
            toast('环境检查：\n' + env.join('\n'));
          }
        }).catch(function () {
          toast('环境检查：\n✗ 请求通知权限失败');
        });
        return;
      }
      runTest(env);
    });
    function runTest(env) {
      // v3.5.118：诊断首行显示当前版本——先核对手机上是否最新部署，
      //   旧版（如后台保活前）诊断结果会误导
      try {
        const verEl = document.querySelector('.ver');
        if (verEl) env.push('当前版本：' + (verEl.textContent || '').trim());
      } catch (e) {}
      if (Notification.permission === 'granted') env.push('✓ 通知权限：已允许');
      else env.push('✗ 通知权限：被拒绝（去浏览器站点设置开启）');
      const keep = document.getElementById('bg-keepalive');
      const keepOn = keepEnabled;
      env.push(keepOn ? '✓ 后台保活：已开启' : '✗ 后台保活：未开启（TA 消息后台到不了，通知不会弹）');
      const isHttps = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      env.push(isHttps ? '✓ 访问协议：HTTPS 或本地' : '✗ 访问协议：' + location.protocol + '//（安卓 Chrome 需 HTTPS 才弹通知，GitHub Pages 部署后即是 HTTPS）');
      // v3.5.144：聊天消息后台弹窗诊断——后台收不到聊天消息 ≠ 通知问题，
      // 多数是「后台根本没产生聊天消息」：主动发送按间隔+概率随机触发，且需页面存活
      try {
        const rc = (window.replyCfg && window.replyCfg()) || {};
        const asEn = rc['as-en'] === undefined ? 1 : rc['as-en'];
        if (asEn === 1) {
          const p = Number(rc['as-prob']) > 0 ? rc['as-prob'] : 30;
          const mn = Math.min(30, Number(rc['as-min']) || 5);
          const mx = Math.min(180, Number(rc['as-max']) || 10);
          env.push('✓ 主动发送：开启（每 ' + mn + '~' + mx + ' 分钟掷一次 · 概率 ' + p + '%）');
          if (rc['dnd-en'] === 1) env.push('  免打扰开启中（发送大幅减弱，最长 3 小时一次）');
        } else {
          env.push('✗ 主动发送：关闭（TA 不会主动发聊天消息 → 后台无聊天通知）');
        }
        env.push('  提示：TA 聊天消息按间隔随机产生，后台需保活让定时器存活才到点触发');
      } catch (e) {}
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        toast('环境检查：\n' + env.join('\n'));
        return;
      }
      // 环境 OK：真发一条测试通知（走 SW showNotification，页面隐藏也能显示）
      try {
        const name = store.get('lbl-partner') || 'TA';
        showSysNotification('后台通知测试', { body: '来自 ' + name + ' · 如果能看到这条，后台通知就通了' }).then(function (ok) {
          if (ok) {
            env.push('✓ 测试通知已发送（Service Worker）');
            // 红米/小米：系统级通知可能拦截（API 不报错但通知不显示）
            if (/miui|xiaomi|redmi|hyperos/i.test(navigator.userAgent) || /android/i.test(navigator.userAgent)) {
              env.push('悬浮开关：系统设置→通知管理→Chrome→通知类别/横幅通知→打开「在屏幕上方显示」');
            }
          } else {
            env.push('✗ 通知发送未受理（权限或系统通知被禁）');
          }
          toast('测试结果：\n' + env.join('\n'));
        });
      } catch (e) {
        toast('发送失败：\n' + env.join('\n'));
      }
    }
  }

  // v3.5.132：从后台回到前台时做一次状态检查——通知开但保活被关 / 权限被回收
  //   都是静默失效（页面照常运行、通知就是不弹），回到前台时主动提示一次
  // v3.5.137：回到前台时补弹应用内横幅——后台期间收到的消息系统通知已进通知栏，
  //   但页面切回前台时应用内顶部横幅（desk-msg）不会自动出现；这里根据未读数
  //   在屏幕上方补一条横幅（点击默认进聊天），实现「切回即见新消息」的体验
  // v3.5.161：修复「回前台重弹看过消息」——之前用 chat-unread 总量判断，但它是
  //   你【看过消息前】的旧未读累计（进聊天页才清零），回前台会把前几分钟看过的
  //   消息当新消息重弹。改为：切后台时记录未读基数（resumeUnreadBase），回前台
  //   只提示【后台期间新增】的未读增量；无增量则完全不弹。
  let resumeUnreadBase = -1; // 切后台时的未读基数；-1=未初始化（本次会话没切过后台）
  document.addEventListener('visibilitychange', function () {
    const vis = document.visibilityState;
    if (vis === 'hidden') {
      // 切后台：记录当前未读数，作为本次后台会话的基数
      try { resumeUnreadBase = parseInt(store.get('chat-unread'), 10) || 0; } catch (e) { resumeUnreadBase = 0; }
      return;
    }
    if (vis !== 'visible') return;
    const saved = gGet('bg-notify');
    if (saved === '1') {
      const keepOn = keepEnabled;
      if (!keepOn) {
        toast('提醒：后台保活已关闭，后台消息到不了，通知不会弹（设置里开启）');
      }
    }
    // 补弹应用内横幅 + 汇总系统通知：仅当【本次后台期间】未读有增量。
    // v3.5.161：用增量（当前未读 - 切后台时基数）而非总量，避免重弹看过消息；
    // 基数未初始化（本次会话没切过后台）时跳过，不弹旧未读
    try {
      if (resumeUnreadBase < 0) return;
      const chatPage = document.getElementById('page-chat');
      const inChat = chatPage && !chatPage.hidden;
      const unreadNow = parseInt(store.get('chat-unread'), 10) || 0;
      const inc = unreadNow - resumeUnreadBase;
      if (!inChat && inc > 0 && window.showDeskPopup) {
        const name = store.get('lbl-partner') || 'TA';
        // visibilitychange 为 visible 时触发，isHidden=false 显示应用内横幅
        window.showDeskPopup({ name: name, text: '你不在的时候收到 ' + inc + ' 条新消息', isHidden: false });
        const now = Date.now();
        if (saved === '1' && 'Notification' in window && Notification.permission === 'granted' &&
            (!lastResumeNotifyAt || now - lastResumeNotifyAt > 30000)) {
          lastResumeNotifyAt = now;
          showSysNotification(name, { body: '你不在的时候收到 ' + inc + ' 条新消息' });
        }
      }
    } catch (e) {}
  });
  let lastResumeNotifyAt = 0; // v3.5.154：回前台汇总通知去重

  // 供 chat.js（showDeskPopup 联动）/ 信箱 / 朋友圈调用：TA 相关新事件且页面不在
  // 前台时弹系统通知。第三参 extra：name 通知标题（信箱/朋友圈/机制名，默认 TA 昵称）、
  // img 图片 dataURL（通知 image 字段显示缩略图）；头像 + 昵称 + 时间（精确到秒）+ 内容
  window.bgNotifyCheck = function (text, ts, extra) {
    if (!notifyEnabled) return;
    if (document.visibilityState === 'visible') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    extra = extra || {};
    const name = extra.name || store.get('lbl-partner') || 'TA';
    let t = '';
    if (ts) {
      const d = new Date(ts);
      // v3.5.138：时间精确到秒（原只有 时:分）
      t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
    }
    // v3.5.142：正文防乱码——任何混入的 dataURL（图片/表情包/语音）都替换为占位文案，
    // 图片本体由 image 字段单独显示缩略图
    // v3.6.x：正则从 data:image/ 扩展到任意 data:MIME/（覆盖 data:audio/ 等），
    // 并清除语音「名|||dataURL」里 ||| 之后的音频 dataURL，避免 base64 乱码
    const body = String(text || '收到一条新消息')
      .replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[附件]')
      .replace(/\|\|\|.*$/, '');
    const opts = { body: (t ? t + '  ' : '') + (body && body.length > 40 ? body.slice(0, 40) + '…' : body) };
    // v3.5.156：修正安卓通知字段语义（此前 icon/badge/image 用反，导致
    // 「左侧浏览器图标、右侧 mochi、无头像」）：
    //   - badge（左侧小图标，单色）= mochi 字母图标（showSysNotification 兜底设）
    //   - icon（右侧大图标）= 联系人头像（v3.5.158：始终用头像，不被消息图顶替）
    //   - image（展开大图）= 消息图片（可选，有才设）
    // 头像/图片 dataURL → blob URL，安卓 Chrome 可靠渲染
    let bigIcon = '';   // 右侧大图标：始终联系人头像
    let previewImg = ''; // 展开大图：消息图片
    // v3.5.158：右侧固定显示联系人头像——即使消息带表情包/图片，右侧仍是 TA 的头像，
    // 消息图只放 image（展开大图），不顶替头像位置
    // v3.7.x：跨桌面——extra.av（朋友圈通知的发布者头像）优先，其次当前桌面 TA 头像
    const avatar = extra.av || store.get('avatar-partner') || '';
    if (avatar && (avatar.indexOf('data:') === 0 || /^https?:\/\//i.test(avatar))) bigIcon = avatar;
    if (extra.img && (extra.img.indexOf('data:') === 0 || /^https?:\/\//i.test(extra.img))) previewImg = extra.img;
    const toBlob = function (dataUrl, cb) {
      try {
        fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (b) {
          try { cb(URL.createObjectURL(b)); } catch (e) { cb(''); }
        }).catch(function () { cb(''); });
      } catch (e) { cb(''); }
    };
    const sendNotify = function (iconUrl, imgUrl) {
      if (iconUrl) opts.icon = iconUrl;
      if (imgUrl) opts.image = imgUrl;
      showSysNotification(name, opts);
    };
    // v3.5.158：右侧头像 + 展开大图（消息图）——头像 blob 转换后发送，消息图一并带上
    const doSend = function (iconUrl) {
      if (previewImg && previewImg.indexOf('data:') === 0) {
        toBlob(previewImg, function (u) { sendNotify(iconUrl, u || ''); });
      } else {
        sendNotify(iconUrl, previewImg);
      }
    };
    // v3.9.x 修复：头像裁剪为正方形，防止安卓通知拉伸变形
    // 通知的 icon 字段在安卓上会被强制拉伸填充，需预先裁剪为 1:1
    const cropAvatarToSquare = function (dataUrl, cb) {
      try {
        const img = new Image();
        img.onload = function () {
          try {
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            const c = document.createElement('canvas');
            c.width = size; c.height = size;
            c.getContext('2d').drawImage(img, sx, sy, size, size, 0, 0, size, size);
            cb(c.toDataURL('image/jpeg', 0.85));
          } catch (e) { cb(''); }
        };
        img.onerror = function () { cb(''); };
        img.src = dataUrl;
      } catch (e) { cb(''); }
    };
    if (bigIcon && bigIcon.indexOf('data:') === 0) {
      cropAvatarToSquare(bigIcon, function (u) { doSend(u || ''); });
    } else {
      doSend(bigIcon);
    }
  };
  // v3.5.147：通知缩略图压缩——canvas 把图片 dataURL 压到最长边 96px JPEG。
  // 压缩失败返回空串（调用方不带图发送，保证文字通知不丢）
  function compressNotifyImg(dataUrl, cb) {
    try {
      const img = new Image();
      img.onload = function () {
        try {
          const maxSide = 96;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(c.toDataURL('image/jpeg', 0.72));
        } catch (e) { cb(''); }
      };
      img.onerror = function () { cb(''); };
      img.src = dataUrl;
    } catch (e) { cb(''); }
  }
})();

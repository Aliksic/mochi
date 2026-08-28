// ===== 功能：状态栏显示真实时间 =====
(function () {
  const el = document.getElementById('clock');
  if (!el) return;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  function update() {
    const d = new Date();
    el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  update();
  setInterval(update, 15000); // 每 15 秒校准一次
})();

// ===== 开屏加载动画：页面就绪后淡出并移除 =====
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // v3.5.96：开屏显示「部署版本（构建时注入）+ 实时时间」——手机端可随时验证是否最新部署
  // v3.8.y：版本块分两行（名称+版本 / 部署时间），实时秒数只写进 #splash-ver-live，不再整块重写
  const verEl = document.getElementById('splash-ver');
  const verLiveEl = document.getElementById('splash-ver-live');
  let _verIv = null;
  if (verEl && verLiveEl) {
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const fill = () => {
      const d = new Date();
      verLiveEl.textContent = ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    };
    fill();
    _verIv = setInterval(fill, 1000);
  }
  // v3.5.111：开屏含公告 → 点击进入才进页面（点任意处或「点击进入」按钮均可）
  // v3.5.122：开屏等待数据（IndexedDB 回填）就绪后才显示「点击进入」——
  //   就绪前只显示「正在加载数据…」，不提供"跳过加载"入口（跳过后桌面数据
  //   未加载完，正是最初"没加载完就进入"的 bug）。idbRestore 已改为分批恢复
  //   + 12 秒整体保险（idb.js），正常几秒完成；这里 20 秒保险丝兜底任何意外，
  //   确保开屏永不卡死、进入时数据已完整。
  const hide = () => {
    // v3.5.129：开屏隐藏时才停止版本时间刷新（数据恢复慢时版本时间不再提前冻结）
    if (_verIv) { clearInterval(_verIv); _verIv = null; }
    if (splash.classList.contains('hide')) return;
    splash.classList.add('hide');
    setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 400);
  };
  const ready = () => !!(window.__mochiDataReady);
  const enterEl = document.getElementById('splash-enter');
  const loadingEl = document.getElementById('splash-loading');
  const hintEl = document.getElementById('splash-enter-hint');
  const noticeEl = document.getElementById('splash-notice');
  // v3.8.x：开屏即公告1页——原「开屏公告 + 进入后的报修确认层」两页合并为一页，
  //   全部说明已直接展示在开屏上，点【点击进入】即进入（点击即视为已阅读知晓），不再弹二次确认层。
  //   只允许点按钮进入（长公告需滚动阅读，避免误触整屏直接跳过）。
  // v3.8.y：必须把公告滑到底才能进入——未到底时按钮置灰不可点（无法跳过阅读）。
  let scrolledBottom = false;
  function checkScrolled() {
    let bottom = true;
    if (noticeEl) {
      // 公告内容可能由 notice.json 异步填充：未溢出/尚未渲染时视为已到底，
      // 渲染后高度变化由轮询 + 「mochi-notice-rendered」事件重新判定
      bottom = noticeEl.scrollHeight - noticeEl.scrollTop - noticeEl.clientHeight <= 8;
    }
    if (bottom !== scrolledBottom) { scrolledBottom = bottom; updateEnterState(); }
  }
  function updateEnterState() {
    const ok = ready() && scrolledBottom;
    if (loadingEl) loadingEl.hidden = ready();
    if (hintEl) hintEl.hidden = !ready() || ok;
    if (enterEl) {
      enterEl.hidden = !ready();
      enterEl.classList.toggle('is-disabled', !ok); // div 上设 disabled 属性不落 DOM，用 class 控制置灰
    }
  }
  const enter = () => {
    if (splash.classList.contains('hide')) return;
    if (!ready() || !scrolledBottom) return; // 数据未就绪或未滑到底：禁止进入
    hide();
  };
  updateEnterState();
  if (noticeEl) noticeEl.addEventListener('scroll', checkScrolled, { passive: true });
  if (enterEl) enterEl.addEventListener('click', (e) => { e.stopPropagation(); enter(); });
  // 数据回填完成 → 刷新状态（事件 + 轮询双保险：空数据场景只置标志不派发事件）
  document.addEventListener('mochi-restore-done', updateEnterState);
  // 公告由 notice.json 异步渲染完成 → 重新判定是否已滑到底
  document.addEventListener('mochi-notice-rendered', checkScrolled);
  // 轮询：数据就绪 + 已到底后停止；期间持续校正滚动/高度变化
  const readyPoll = setInterval(() => {
    if (ready() && scrolledBottom) { clearInterval(readyPoll); return; }
    updateEnterState();
    checkScrolled();
  }, 300);
  // 20 秒保险丝：数据极端异常未就绪时兜底放行（不自动跳过滑动）；
  //   idbRestore 自身 12 秒必置就绪，正常不触发
  setTimeout(() => { if (!ready()) hide(); }, 20000);
})();

// ===== 开屏公告远程化：notice.json 在线覆盖公告文案 =====
// 用法：改 src/pwa/notice.json 内容 → 构建部署，开屏公告即更新（无需改代码）。
// 字段：title / sub / tip（前置提示块，数组，元素可为字符串或 {h:块标题,p:[段落]}）
//       / sections（[{h:章节标题,p:[条目]}]，优先于旧 list）；
//       条目支持三种：字符串=自动编号条目；{h:"子标题"}；{b:"子列表项"}。
//       sections 为空数组 / hide:true 时隐藏整个公告区。
// 失败（离线/无网络）静默保留 template.html 写死的默认文案兜底。
(function () {
  const notice = document.getElementById('splash-notice');
  if (!notice) return;
  fetch('./notice.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('notice fetch ' + r.status); return r.json(); })
    .then(function (data) {
      if (!data || typeof data !== 'object') return;
      const title = notice.querySelector('.splash-notice-title');
      const sub = notice.querySelector('.splash-notice-sub');
      const list = notice.querySelector('.splash-notice-list');
      if (data.title !== undefined && title) title.textContent = String(data.title);
      if (data.sub !== undefined && sub) sub.textContent = String(data.sub);
      if (Array.isArray(data.sections)) {
        if (!data.sections.length || data.hide) { notice.style.display = 'none'; return; }
        if (list) {
          list.innerHTML = '';
          // 前置提示块（App 说明 / 系统预设字卡等引导内容，浅灰高亮）
          if (Array.isArray(data.tip) && data.tip.length) {
            data.tip.forEach(function (t) {
              const tip = document.createElement('div');
              tip.className = 'splash-tip';
              if (t && typeof t === 'object') {
                if (t.h !== undefined) {
                  const h = document.createElement('p');
                  h.className = 'splash-tip-h';
                  h.textContent = String(t.h);
                  tip.appendChild(h);
                }
                if (Array.isArray(t.p)) {
                  t.p.forEach(function (txt) {
                    const p = document.createElement('p');
                    p.textContent = String(txt);
                    tip.appendChild(p);
                  });
                }
              } else {
                const p = document.createElement('p');
                p.textContent = String(t);
                tip.appendChild(p);
              }
              list.appendChild(tip);
            });
          }
          // 章节：字符串=自动编号条目；{h}=子标题；{b}=子列表项
          data.sections.forEach(function (sec) {
            const wrap = document.createElement('div');
            wrap.className = 'splash-sec-wrap';
            if (sec && sec.h) {
              const h = document.createElement('p');
              h.className = 'splash-sec';
              h.textContent = String(sec.h);
              wrap.appendChild(h);
            }
            if (sec && Array.isArray(sec.p)) {
              sec.p.forEach(function (it) {
                const p = document.createElement('p');
                if (it && typeof it === 'object') {
                  if (it.h !== undefined) { p.className = 'splash-sub'; p.textContent = String(it.h); }
                  else if (it.b !== undefined) { p.className = 'splash-bullet'; p.textContent = String(it.b); }
                  else { p.className = 'splash-item'; p.textContent = String(it.t !== undefined ? it.t : ''); }
                } else {
                  p.className = 'splash-item';
                  p.textContent = String(it);
                }
                wrap.appendChild(p);
              });
            }
            list.appendChild(wrap);
          });
        }
      } else if (Array.isArray(data.list)) {
        if (!data.list.length || data.hide) { notice.style.display = 'none'; return; }
        if (list) {
          list.innerHTML = '';
          data.list.forEach(function (t) {
            const p = document.createElement('p');
            p.className = 'splash-item';
            p.textContent = String(t);
            list.appendChild(p);
          });
        }
      } else if (data.hide) {
        notice.style.display = 'none';
      }
      // 公告渲染完成（或隐藏）→ 通知开屏重新判定"是否已滑到底"
      document.dispatchEvent(new Event('mochi-notice-rendered'));
    })
    .catch(function () { /* 失败：保留模板默认公告 */ });
})();

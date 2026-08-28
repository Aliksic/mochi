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
  // v3.8.y：每日首次打开强制展开全文阅读；当日再次打开则保持折叠（内容短→无需滚动即可进入）
  const today = (function () {
    const d = new Date(), p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();
  const seenKey = 'xy-home-v2:splash-seen:' + today;
  let seenToday = false;
  try { seenToday = localStorage.getItem(seenKey) === '1'; } catch (e) {}
  // v3.8.z2：每日首次打开强制展开全文阅读（今日未读过 → 各章节初始展开），
  //   当日已读后再次打开才保持折叠——forceExpand 供在线/离线渲染统一读取。
  window.__splashForceExpand = !seenToday;
  // v3.8.z：全折叠+必读摘要——各章节默认收起、靠目录跳转；摘要承担必读。
  //   "每日首次强读"仍然生效（首次须滑到底才可进入），但不再展开全部章节。
  //   移除首开 forceExpand 全展开逻辑（默认折叠即可）。
  const enterEl = document.getElementById('splash-enter');
  const loadingEl = document.getElementById('splash-loading');
  const hintEl = document.getElementById('splash-enter-hint');
  // v3.8.y：整页一体滚动——滚动判定用 .splash-box（顶部+公告一起滚，需滚到整页底部）
  const splashBox = document.getElementById('splash-box');
  // v3.8.x：开屏即公告1页——原「开屏公告 + 进入后的报修确认层」两页合并为一页，
  //   全部说明已直接展示在开屏上，点【点击进入】即进入（点击即视为已阅读知晓），不再弹二次确认层。
  //   只允许点按钮进入（长公告需滚动阅读，避免误触整屏直接跳过）。
  // v3.8.y：必须把整页滑到底才能进入——未到底时按钮置灰不可点（无法跳过阅读）。
  let scrolledBottom = false;
  function checkScrolled() {
    let bottom = true;
    if (splashBox) {
      // 内容可能由 notice.json 异步填充：未溢出/尚未渲染时视为已到底，
      // 渲染后高度变化由轮询 + 「mochi-notice-rendered」事件重新判定
      bottom = splashBox.scrollHeight - splashBox.scrollTop - splashBox.clientHeight <= 8;
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
    // 今日首次进入（本次仍强制通读）→ 记下已读，当日再次打开不再展开全文
    if (!seenToday) {
      try { localStorage.setItem(seenKey, '1'); seenToday = true; } catch (e) {}
    }
    hide();
  };
  updateEnterState();
  if (splashBox) splashBox.addEventListener('scroll', checkScrolled, { passive: true });
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

// v3.8.y：章节渲染
// 条目支持三种：字符串=自动编号条目；{h:"子标题"}；{b:"子列表项"}
function renderSplashSections(container, sections, opt) {
  if (!container || !Array.isArray(sections)) return;
  const collapsible = !!(opt && opt.collapsible);
  // 首次打开强制展开：今日未读过 → 本章节初始不收起（全文可读）
  const forceExpand = !!(opt && opt.expandFirst) && !!window.__splashForceExpand;
  sections.forEach(function (sec) {
    const wrap = document.createElement('div');
    // v3.8.z：全折叠（已读后） / v3.8.z2：首次打开展开全文
    wrap.className = 'splash-sec-wrap'
      + (collapsible ? ' splash-sec-collapsible' : '')
      + (collapsible && !forceExpand ? ' is-collapsed' : '');
    let h = null;
    if (sec && sec.h) {
      h = document.createElement('p');
      h.className = 'splash-sec';
      h.textContent = String(sec.h);
      wrap.appendChild(h);
    }
    if (sec && Array.isArray(sec.p)) {
      // 折叠模式：细节内容包进 .splash-sec-content，点击标题切换显隐
      const body = collapsible ? document.createElement('div') : null;
      if (body) { body.className = 'splash-sec-content'; }
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
        if (body) body.appendChild(p); else wrap.appendChild(p);
      });
      if (body) wrap.appendChild(body);
    }
    container.appendChild(wrap);
  });
}

// v3.8.y：开屏公告「书签目录」——顶部可折叠入口（点击展开竖排章节索引，点击即展开并跳转对应章节）
// 复用 renderSplashSections 生成的 .splash-sec-wrap，在线/离线兜底两套 DOM 都生效
function buildSplashToc(list) {
  if (!list) return;
  if (list.querySelector('.splash-toc')) return; // 已注入则跳过（防重复）
  const headers = list.querySelectorAll('.splash-sec-wrap .splash-sec');
  if (!headers.length) return;
  const toc = document.createElement('div');
  toc.className = 'splash-toc';
  // 折叠入口头：显示章节数量，点击展开/收起
  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'splash-toc-head';
  head.setAttribute('aria-expanded', 'false');
  const headText = document.createElement('span');
  headText.className = 'splash-toc-head-text';
  headText.textContent = '目录（' + headers.length + ' 章）';
  const chevron = document.createElement('span');
  chevron.className = 'splash-toc-chev';
  chevron.textContent = '▾';
  head.appendChild(headText);
  head.appendChild(chevron);
  head.addEventListener('click', function () {
    toc.classList.toggle('open');
    head.setAttribute('aria-expanded', String(toc.classList.contains('open')));
  });
  toc.appendChild(head);
  // 可致的正文行
  const body = document.createElement('div');
  body.className = 'splash-toc-body';
  headers.forEach(function (h) {
    const wrap = h.parentNode; // .splash-sec-wrap
    // 标签去【】取正文；竖排整行有足够宽度，仅极长标题截断
    let label = String(h.textContent).replace(/^【|】$/g, '').trim() || '章节';
    if (label.length > 18) label = label.slice(0, 18) + '…';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'splash-toc-chip';
    chip.textContent = label;
    chip.addEventListener('click', function (e) {
      e.stopPropagation();
      // 点击正文后自动收起目录，减少遮挡
      toc.classList.remove('open');
      head.setAttribute('aria-expanded', 'false');
      Array.prototype.forEach.call(body.children, function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      // 折叠章节默认收起 → 从书签跳转时展开细节
      if (wrap.classList.contains('is-collapsed')) wrap.classList.remove('is-collapsed');
      // 滚动到该章节（#splash-box 是整页滚动容器，scrollIntoView 会滚动到它）
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    body.appendChild(chip);
  });
  toc.appendChild(body);
  list.insertBefore(toc, list.firstChild);
}

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
          // v3.8.z：必读摘要——固定展示在公告最顶部，承担"强读必读"内容，各章节折叠靠目录跳转
          if (Array.isArray(data.summary) && data.summary.length) {
            const sum = document.createElement('div');
            sum.className = 'splash-summary';
            const sumTitle = document.createElement('p');
            sumTitle.className = 'splash-summary-title';
            sumTitle.textContent = '必读摘要';
            sum.appendChild(sumTitle);
            data.summary.forEach(function (s) {
              const p = document.createElement('p');
              p.textContent = String(s);
              sum.appendChild(p);
            });
            list.appendChild(sum);
          }
          // 前置提示块（App 说明 / 系统预设字卡等引导内容，非必读 → 收进折叠条目，避免首屏一上来就一大片字）
          if (Array.isArray(data.tip) && data.tip.length) {
            const gwrap = document.createElement('div');
            // 首次打开强制展开阅读；已读后再次打开才折叠
            gwrap.className = 'splash-sec-wrap splash-sec-collapsible'
              + (window.__splashForceExpand ? '' : ' is-collapsed');
            const gh = document.createElement('p');
            gh.className = 'splash-sec';
            gh.textContent = '其他说明与常见问题';
            const gbody = document.createElement('div');
            gbody.className = 'splash-sec-content';
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
              gbody.appendChild(tip);
            });
            gwrap.appendChild(gh);
            gwrap.appendChild(gbody);
            list.appendChild(gwrap);
          }
          // 章节：字符串=自动编号条目；{h}=子标题；{b}=子列表项
          // v3.8.y：开屏公告折叠成章节索引，点标题展开细节
          renderSplashSections(list, data.sections, { collapsible: true, expandFirst: true });
          // v3.8.y：添加「书签目录」横向可跳转（需要等 renderSplashSections 生成 DOM 后再注入）
          buildSplashToc(list);
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
// v3.8.y：离线兜底（notice.json 加载失败时）公告用 template.html 里的静态章节，同样补一份「书签目录」。
// 在线路径已由上方 .then 内 buildSplashToc 注入（<button> 选择器会先序跳过已存在的 .splash-toc，不会重复）。
// v3.8.z：静态（离线/模板）章节原本是平铺展开，这里统一升级成「可折叠 + 默认收起」；折叠交互走
//   一次事件委托完成（在线 renderSplashSections 已带 splash-sec-collapsible 类，会跳过；点击由同委托处理，
//   两者统一，不重复绑定）。
window.addEventListener('DOMContentLoaded', function () {
  const nl = document.querySelector('.splash-notice-list');
  if (!nl) return;
  // 1) 离线平铺章节 → 折叠章节（默认收起），与在线折叠结构一致
  //    仅当渲染时序为「先 DOMContentLoaded 后 notice 异步填充」时才会动到模板静态 DOM；
  //    若 notice 已先行渲染（各节都已带 splash-sec-collapsible 类）则整体跳过。移动只允许
  //    把标题后的兄弟节点收进 content，绝不移入 content 自身/子孙，杜绝 "父节点塞进自身"。
  Array.prototype.forEach.call(nl.querySelectorAll('.splash-sec-wrap'), function (wrap) {
    if (wrap.classList.contains('splash-sec-collapsible')) return; // 在线已处理
    const head = wrap.querySelector(':scope > .splash-sec');
    if (!head) return;
    wrap.classList.add('splash-sec-collapsible');
    // 首次打开强制展开全文阅读；已读后再次打开才折叠
    if (!window.__splashForceExpand) wrap.classList.add('is-collapsed');
    let content = wrap.querySelector(':scope > .splash-sec-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'splash-sec-content';
      wrap.appendChild(content);
    }
    // 把标题之后的所有兄弟节点收进 content
    while (head.nextSibling && !content.contains(head.nextSibling)) content.appendChild(head.nextSibling);
  });
  // 2) 折叠/展开交互：事件委托，一次注册，在线/离线都生效
  nl.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== nl && !(t.classList && t.classList.contains('splash-sec'))) t = t.parentNode;
    if (!t || t === nl || !t.parentNode) return;
    const wrap = t.parentNode;
    if (wrap.classList && wrap.classList.contains('splash-sec-collapsible')) {
      wrap.classList.toggle('is-collapsed');
    }
  });
  buildSplashToc(nl);
  document.dispatchEvent(new Event('mochi-notice-rendered'));
});

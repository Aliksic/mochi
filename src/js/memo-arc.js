// ===== 梦角档案（v3.x：每个梦角一份，记录「我渐渐认识到的TA」） =====
// 入口：桌面第三页「梦角档案」图标。
// 理念：不是填写设定，而是随着相处慢慢填写的档案。区别——
//   梦角设定 = TA本来是什么样的人；梦角档案 = 我后来才慢慢发现TA原来是这样的人。
// 每个梦角一份独立档案（挂在「此间」的梦角 roster id 下，全局根命名空间共享，不随桌面隔离）。
// 数据键 xy-home-v2:narc-<rosterId>（已在 contacts.js EXCLUDE 登记，防 migrateLegacy 误迁）。
// v3.14.x：此间梦角名单已按桌面分离（xy-home-v2:<cid>:cjian-roster），档案仍全局互通——
//   名单改为合并读取所有桌面的 cjian-roster（按 id 去重），另兼容旧版根命名空间残留键。
// 模块：概览(名字/相处天数/统计/最近发现) → 我认识的TA / TA的习惯 / TA的喜好 / 我们之间 / 相处记录 / 还不了解 / 理解变化
(function () {
  const GNS = 'xy-home-v2';
  const page = document.getElementById('page-memo-arc');
  const root = document.getElementById('narc-root');

  function gStore() { try { return window.xyStore(GNS); } catch (e) { return null; } }
  function toast(m) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = m; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 1800);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function mdstr(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function short(s, n) { s = String(s == null ? '' : s); n = n || 18; return s.length > n ? s.slice(0, n) + '…' : s; }

  // ---- 类型与程度 ----
  const TYPES = [['like', 'TA喜欢'], ['dislike', 'TA不喜欢'], ['habit', 'TA习惯'], ['care', 'TA在意'],
    ['do', 'TA会'], ['dont', 'TA不会'], ['good', 'TA擅长'], ['bad', 'TA不擅长'],
    ['fear', 'TA害怕'], ['need', 'TA需要'], ['truth', 'TA其实'], ['us', '我们之间'], ['other', '其他']];
  const TYPE_MAP = {}; TYPES.forEach(t => TYPE_MAP[t[0]] = t[1]);
  const ALL_TYPES = TYPES.map(t => t[0]);
  const HABIT_TYPES = ['habit', 'do', 'dont', 'good', 'bad'];   // TA的习惯：行为模式
  const TASTE_TYPES = ['like', 'dislike', 'care'];               // TA的喜好
  const LEVELS = [['0', '🌱 初步发现', '目前只是我的感觉'], ['1', '🌿 越来越确定', '已经出现过几次类似情况'], ['2', '🌳 已确认', '相处中已经比较明确']];
  const BOND_CATS = { first: '第一次', habit: '共同习惯', secret: '只有我们知道的事' };
  function levelLabel(l) { const x = LEVELS[parseInt(l, 10)]; return x ? x[1] : ''; }
  function levelHint(l) { const x = LEVELS[parseInt(l, 10)]; return x ? x[2] : ''; }
  function typePills(types) { return types.map(t => ({ label: TYPE_MAP[t], value: t })); }
  const LEVEL_PILLS = LEVELS.map(l => ({ label: l[1], value: l[0] }));

  // ---- 数据存取 ----
  // v3.14.x：名单合并所有桌面命名空间的 cjian-roster（按 id 去重）+ 旧版根键兜底
  function roster() {
    const out = [], seen = {};
    const push = a => { (Array.isArray(a) ? a : []).forEach(x => { if (x && x.name && x.id && !seen[x.id]) { seen[x.id] = 1; out.push(x); } }); };
    let cs = null;
    try { cs = window.getContacts ? window.getContacts() : null; } catch (e) {}
    (cs && cs.length ? cs : [{ id: 'default' }]).forEach(c => {
      try { push(JSON.parse(window.xyStore(GNS + ':' + c.id).get('cjian-roster') || '[]')); } catch (e) {}
    });
    try { push(JSON.parse(gStore().get('cjian-roster') || '[]')); } catch (e) {}
    return out;
  }
  function keyOf(id) { return 'narc-' + id; }
  function loadArc(id) { const s = gStore(); if (!s) return null; try { const o = JSON.parse(s.get(keyOf(id)) || 'null'); if (o && typeof o === 'object') return o; } catch (e) {} return null; }
  function saveArc(id, o) { const s = gStore(); if (s) { try { s.set(keyOf(id), JSON.stringify(o)); } catch (e) {} } }
  function ensureArc(id) {
    let o = loadArc(id);
    if (!o) { o = { created: Date.now(), loves: [], bonds: [], moments: [], records: [], wonders: [], history: [] }; saveArc(id, o); }
    ['loves', 'bonds', 'moments', 'records', 'wonders', 'history'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
    return o;
  }
  function makeId() { return 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
  function curId() { try { return gStore().get('narc-cur') || ''; } catch (e) { return ''; } }
  function setCur(id) { try { gStore().set('narc-cur', id); } catch (e) {} }

  // ---- 页面当前状态 ----
  let cur = '';            // 当前梦角 roster id
  let view = 'knows';      // knows|habits|tastes|bonds|records|wonders|changes
  let bondsTab = 'first';  // first|habit|secret|moments

  // ---- 打开/关闭 ----
  window.openNarc = function () {
    const r = roster();
    if (!r.length) { cur = ''; }
    else { const c = curId(); cur = r.some(x => x.id === c) ? c : r[0].id; setCur(cur); }
    if (!page || !root) return;
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    page.hidden = false;
    render();
  };
  window.closeNarc = function () {
    if (!page) return;
    page.classList.remove('full');
    document.querySelectorAll('.page').forEach(p => p.hidden = true);
    const home = document.getElementById('page-phone');
    if (home) home.hidden = false;
  };

  // ---- 渲染主入口 ----
  function render() {
    if (!root) return;
    const r = roster();
    if (!r.length) { cur = ''; }
    else { const c = curId(); cur = r.some(x => x.id === c) ? c : r[0].id; setCur(cur); }
    let h = '';
    h += '<div class="narc-chips">';
    r.forEach(c => { h += '<button class="narc-chip' + (c.id === cur ? ' on' : '') + '" data-op="pick-roster" data-rid="' + esc(c.id) + '">' + esc(c.name) + '</button>'; });
    h += '<button class="narc-chip narc-addchip" data-op="add-roster">＋ 添加</button>';
    h += '</div>';

    if (!cur) {
      h += '<div class="narc-empty">此间还没有梦角<br>先添加一个你要慢慢认识的人吧';
      h += '<br><button class="ne-btn" data-op="add-roster">去添加梦角</button></div>';
      root.innerHTML = h;
      return;
    }
    const arc = ensureArc(cur); // created 初始化在这：打开即开始计相处天数
    const rosterName = (r.find(x => x.id === cur) || {}).name || 'TA';
    const days = Math.max(0, Math.floor((Date.now() - arc.created) / 86400000));
    const activeLoves = arc.loves.filter(x => x.status !== 'retired');
    const known = arc.loves.length;
    const bondsN = arc.bonds.length;
    const momentsN = arc.moments.length;
    const wondersOpen = arc.wonders.filter(w => !w.solved).length;
    let recent = null;
    activeLoves.forEach(x => { if (!recent || x.updated > recent.updated) recent = x; });

    h += '<div class="narc-hero">';
    h += '<div class="narc-hero-top"><span class="narc-name">' + esc(rosterName) + '</span><span class="narc-days">一起留下 · ' + days + ' 天</span></div>';
    h += '<div class="narc-hero-sub">「我认识的TA」不是TA的全部，是我和TA相处以后、慢慢知道的事。</div>';
    h += '<div class="narc-stats">';
    h += '<div class="narc-stat"><b>' + known + '</b><span>了解</span></div>';
    h += '<div class="narc-stat"><b>' + bondsN + '</b><span>共同经历</span></div>';
    h += '<div class="narc-stat"><b>' + momentsN + '</b><span>重要时刻</span></div>';
    h += '<div class="narc-stat"><b>' + wondersOpen + '</b><span>还不了解</span></div>';
    h += '</div>';
    if (recent) {
      h += '<div class="narc-recent"><b>最近发现</b>　' + (TYPE_MAP[recent.type] ? TYPE_MAP[recent.type] + '……' : '') + esc(short(recent.text, 26));
      h += '<span class="nr-date">' + mdstr(recent.updated) + '</span></div>';
    }
    h += '</div>';

    const NAVS = [['knows', '我认识的TA'], ['habits', 'TA的习惯'], ['tastes', 'TA的喜好'], ['bonds', '我们之间'], ['records', '相处记录'], ['wonders', '还不了解'], ['changes', '理解变化']];
    h += '<div class="narc-nav">';
    NAVS.forEach(n => { h += '<button class="narc-navchip' + (view === n[0] ? ' on' : '') + '" data-op="nav" data-view="' + n[0] + '">' + n[1] + '</button>'; });
    h += '</div>';

    h += '<div id="narc-content">' + contentHTML(arc, rosterName) + '</div>';
    root.innerHTML = h;
  }

  // ---- 各分区内容 ----
  function contentHTML(arc, rosterName) {
    if (view === 'knows') return knownsHTML(arc, ALL_TYPES, true, '我认识的TA', '这些是你相处后慢慢发现的TA。');
    if (view === 'habits') return knownsHTML(arc, HABIT_TYPES, false, 'TA的习惯', 'TA常常、偶尔会做的事。');
    if (view === 'tastes') return knownsHTML(arc, TASTE_TYPES, false, 'TA的喜好', '喜欢 / 不太喜欢 / 在意。');
    if (view === 'bonds') return bondsHTML(arc);
    if (view === 'records') return recordsHTML(arc);
    if (view === 'wonders') return wondersHTML(arc);
    if (view === 'changes') return changesHTML(arc);
    return '';
  }

  function knownsHTML(arc, types, all, title, sub) {
    const items = arc.loves.filter(l => types.indexOf(l.type) >= 0).sort((a, b) => b.created - a.created);
    let h = '<div class="narc-sect"><div><h3>' + esc(title) + '</h3><div class="narc-sect-sub">' + esc(sub) + '</div></div>';
    h += '<button class="narc-add" data-op="add-know" data-pool="' + (all ? 'all' : types.join(',')) + '">＋ 记录新的了解</button></div>';
    if (!items.length) {
      h += '<div class="narc-empty">还没有了解记录。<br>从第一次相处的发现开始填吧。</div>';
      return h;
    }
    items.forEach(it => {
      const retired = it.status === 'retired';
      h += '<div class="narc-k' + (retired ? ' retired' : '') + '">';
      h += '<div class="nk-top"><span class="nk-type">' + esc(TYPE_MAP[it.type] || '其他') + '……</span>';
      if (!retired) h += '<span class="nk-level" title="' + esc(levelHint(it.level)) + '">' + esc(levelLabel(it.level) || '') + '</span>';
      h += '</div>';
      h += '<div class="nk-text">' + esc(it.text) + '</div>';
      if (it.why) h += '<div class="nk-why">' + esc(it.why) + '</div>';
      if (retired && it.note) h += '<div class="narc-note">这条了解暂时不再适用' + (it.note ? '：' + esc(it.note) : '') + '</div>';
      h += '<div class="nk-meta"><span class="nk-date">' + (retired ? '' : '记录于 ' + mdstr(it.updated || it.created)) + '</span>';
      h += '<span class="nk-ops">';
      if (retired) {
        h += '<button class="nk-op" data-op="restore-know" data-id="' + it.id + '">恢复适用</button>';
        h += '<button class="nk-op warn" data-op="del-know" data-id="' + it.id + '">删除</button>';
      } else {
        h += '<button class="nk-op" data-op="edit-know" data-id="' + it.id + '">编辑</button>';
        h += '<button class="nk-op" data-op="revise-know" data-id="' + it.id + '">重新理解</button>';
        h += '<button class="nk-op" data-op="retire-know" data-id="' + it.id + '">暂不适用</button>';
        h += '<button class="nk-op warn" data-op="del-know" data-id="' + it.id + '">删除</button>';
      }
      h += '</span></div></div>';
    });
    return h;
  }

  function bondsHTML(arc) {
    const TABS = [['first', '第一次'], ['habit', '共同习惯'], ['secret', '只有我们知道的事'], ['moments', '重要时刻']];
    let h = '<div class="narc-sect"><div><h3>我们之间</h3><div class="narc-sect-sub">记录的是「我和你」发生过的事，不是TA一个人。</div></div></div>';
    h += '<div class="narc-btabs">';
    TABS.forEach(t => { h += '<button class="narc-btab' + (bondsTab === t[0] ? ' on' : '') + '" data-op="bond-tab" data-bt="' + t[0] + '">' + t[1] + '</button>'; });
    h += '</div>';
    if (bondsTab === 'moments') {
      h += '<div class="narc-sect" style="margin-top:2px"><span class="narc-spect"></span><button class="narc-add" data-op="add-moment">＋ 记一个重要时刻</button></div>';
      if (!arc.moments.length) h += '<div class="narc-empty">把特别的日子标记为 ⭐ 重要时刻<br>会在这里汇成你们的时光。</div>';
      arc.moments.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(m => {
        h += '<div class="narc-item">';
        h += '<div class="ni-top"><span class="ni-star on">⭐</span></div>';
        h += '<div class="ni-text">' + esc(m.text) + '</div>';
        h += '<div class="ni-meta"><span class="ni-date">' + esc(m.date || '') + '</span>';
        h += '<span class="nk-ops"><button class="nk-op" data-op="edit-entry" data-kind="moment" data-id="' + m.id + '">编辑</button>';
        h += '<button class="nk-op warn" data-op="del-entry" data-kind="moment" data-id="' + m.id + '">删除</button></span></div></div>';
      });
      return h;
    }
    h += '<div class="narc-sect" style="margin-top:2px"><span></span><button class="narc-add" data-op="add-bond" data-cat="' + bondsTab + '">＋ 记一条「' + BOND_CATS[bondsTab] + '」</button></div>';
    const items = arc.bonds.filter(b => b.cat === bondsTab).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!items.length) h += '<div class="narc-empty">这里还没有记录。<br>' + (bondsTab === 'first' ? '把第一次发生的事记下来。' : '记下你们共同的那一部分。') + '</div>';
    items.forEach(b => {
      h += '<div class="narc-item">';
      h += '<div class="ni-top"><span class="ni-tag">' + BOND_CATS[b.cat] + '</span></div>';
      h += '<div class="ni-text">' + esc(b.text) + '</div>';
      h += '<div class="ni-meta"><span class="ni-date">' + esc(b.date || '') + '</span>';
      h += '<span class="nk-ops"><button class="nk-op" data-op="edit-entry" data-kind="bond" data-id="' + b.id + '">编辑</button>';
      h += '<button class="nk-op warn" data-op="del-entry" data-kind="bond" data-id="' + b.id + '">删除</button></span></div></div>';
    });
    return h;
  }

  function recordsHTML(arc) {
    let h = '<div class="narc-sect"><div><h3>相处记录</h3><div class="narc-sect-sub">记录下来「发生了什么」。遇到特别的日子，点 ⭐ 记为重要时刻。</div></div>';
    h += '<button class="narc-add" data-op="add-record">＋ 写一条</button></div>';
    const items = arc.records.slice().sort((a, b) => b.created - a.created);
    if (!items.length) h += '<div class="narc-empty">还没有相处记录。<br>今天聊了些什么、发生了些什么，都可以写在这里。</div>';
    items.forEach(rec => {
      h += '<div class="narc-item">';
      h += '<div class="ni-top"><button class="ni-star' + (rec.momentId ? ' on' : '') + '" data-op="toggle-moment" data-id="' + rec.id + '" title="记为重要时刻">⭐</button>';
      h += (rec.momentId ? '<span class="ni-tag">重要时刻</span>' : ''); h += '</div>';
      h += '<div class="ni-text">' + esc(rec.text) + '</div>';
      h += '<div class="ni-meta"><span class="ni-date">' + esc(rec.date || '') + '</span>';
      h += '<span class="nk-ops"><button class="nk-op" data-op="edit-entry" data-kind="record" data-id="' + rec.id + '">编辑</button>';
      h += '<button class="nk-op warn" data-op="del-entry" data-kind="record" data-id="' + rec.id + '">删除</button></span></div></div>';
    });
    return h;
  }

  function wondersHTML(arc) {
    let h = '<div class="narc-sect"><div><h3>还不了解TA</h3><div class="narc-sect-sub">这是档案里的留白——留给未来的你们。</div></div>';
    h += '<button class="narc-add" data-op="add-wonder">＋ 记一个想了解的事</button></div>';
    const open = arc.wonders.filter(w => !w.solved);
    const solved = arc.wonders.filter(w => w.solved);
    if (!open.length && !solved.length) {
      h += '<div class="narc-empty">暂时没有「还不了解」的事。<br>可以把你正想知道、还没答案的问题写在这里。</div>';
      return h;
    }
    open.forEach(w => {
      h += '<div class="narc-item">';
      h += '<div class="ni-top"><span class="ni-tag">还不了解</span></div>';
      h += '<div class="ni-text">' + esc(w.text) + '</div>';
      h += '<div class="ni-meta"><span class="ni-date">' + mdstr(w.created) + '</span>';
      h += '<span class="nk-ops"><button class="nk-op" data-op="solve-wonder" data-id="' + w.id + '">已了解</button>';
      h += '<button class="nk-op warn" data-op="del-wonder" data-id="' + w.id + '">删除</button></span></div></div>';
    });
    if (solved.length) {
      h += '<div class="narc-sect" style="margin-top:16px"><h3 style="opacity:.7">已解开的疑问</h3></div>';
      solved.forEach(w => {
        h += '<div class="narc-item solved">';
        h += '<div class="ni-top"><span class="ni-tag">已了解</span></div>';
        h += '<div class="ni-text">' + esc(w.text) + '</div>';
        h += '<div class="ni-meta"><span class="ni-date">' + (w.solvedAt ? mdstr(w.solvedAt) + ' 有了答案' : '') + '</span>';
        h += '<span class="nk-ops"><button class="nk-op" data-op="reopen-wonder" data-id="' + w.id + '">重新打开</button>';
        h += '<button class="nk-op warn" data-op="del-wonder" data-id="' + w.id + '">删除</button></span></div></div>';
      });
    }
    return h;
  }

  function changesHTML(arc) {
    let h = '<div class="narc-sect"><div><h3>理解变化</h3><div class="narc-sect-sub">我对TA的理解，是怎样一点点改变的。</div></div></div>';
    const hist = arc.history.slice().sort((a, b) => b.time - a.time);
    if (!hist.length) {
      h += '<div class="narc-empty">还没有理解上的变化。<br>当有一天你发现自己——「原来TA不是我以为的那样」——它会出现在这里。</div>';
      return h;
    }
    hist.forEach(ev => {
      h += '<div class="narc-hist"><span class="nh-dot"></span><div class="nh-wrap"><div class="nh-date">' + mdstr(ev.time) + '</div><div class="nh-text">' + ev.text.replace(/〈([^〈]*)〉/g, '<em>「$1」</em>') + '</div></div></div>';
    });
    return h;
  }

  // ---- 新增/修改各实体（多项式 openModal） ----
  function addKnow(pool, prefill) {
    if (!window.openModal) return;
    const types = pool && pool.length ? pool : ALL_TYPES;
    let phase = 'type', pendingType = '', pendingText = '', pendingWhy = '';
    function typeOkText() { ctl.okText('下一步'); }
    const ctl = window.openModal('记录一条新的了解', prefill || '', function (v) {
      if (phase === 'type') {
        if (!v) return;
        pendingType = v;
        phase = 'text';
        ctl.stay();
        ctl.title(TYPE_MAP[v] + '……');
        ctl.hint('写下你的发现，一句话就好。');
        ctl.input(true); ctl.maxLen(120); ctl.ph('例如：不太喜欢被催着做决定');
        ctl.okText('下一步');
        if (prefill) ctl.text(prefill);
        return;
      }
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim();
        if (!t) { ctl.stay(); ctl.focus(); return; }
        pendingText = t;
        phase = 'why';
        ctl.stay();
        ctl.title('为什么这样认为？（可选）');
        ctl.hint('记下当时的场景/依据，不想写就点「下一步」。');
        ctl.text(''); ctl.maxLen(120); ctl.ph('可留空'); ctl.input(true); ctl.okText('下一步');
        return;
      }
      if (phase === 'why') {
        pendingWhy = String(v == null ? '' : v).trim();
        phase = 'level';
        ctl.stay();
        ctl.input(false);
        ctl.pills(LEVEL_PILLS, '0');
        ctl.title('你有多确定？');
        ctl.hint('初步的观察也可以记下，之后还能修改。');
        ctl.okText('保存');
        return;
      }
      if (phase === 'level') {
        const lvl = parseInt(v, 10);
        const arc = ensureArc(cur); const now = Date.now();
        arc.loves.push({ id: makeId(), type: pendingType, text: pendingText, why: pendingWhy, level: isNaN(lvl) ? 0 : (lvl || 0), created: now, updated: now, status: 'active', revisions: [] });
        arc.history.push({ time: now, text: '「' + (TYPE_MAP[pendingType] || '') + '」新增了解：' + short(pendingText) });
        saveArc(cur, arc);
        toast('记下了一条了解');
        render();
      }
    }, { noInput: true, pills: typePills(types) });
  }

  function editKnow(id) {
    const arc = ensureArc(cur); const it = arc.loves.find(x => x.id === id); if (!it) return;
    let phase = 'text', newText = '';
    const ctl = window.openModal('编辑这条了解', it.text, function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        newText = t; phase = 'why';
        ctl.stay(); ctl.title('为什么这样认为？（可选）'); ctl.hint('改动理解，也可以留一句话理由。');
        ctl.text(it.why || ''); ctl.maxLen(120); ctl.ph('可留空'); ctl.input(true); ctl.okText('下一步');
        return;
      }
      if (phase === 'why') {
        const why = String(v == null ? '' : v).trim();
        it.newText = newText; it.newWhy = why;
        phase = 'level';
        ctl.stay(); ctl.input(false);
        ctl.pills(LEVEL_PILLS, String(it.level));
        ctl.title('现在你有多确定？'); ctl.hint(levelHint(it.level)); ctl.okText('保存');
        return;
      }
      if (phase === 'level') {
        const lvl = parseInt(v, 10);
        const old = it.text;
        it.text = it.newText; it.why = it.newWhy || ''; it.newText = it.newWhy = undefined;
        it.level = isNaN(lvl) ? it.level : (lvl || 0);
        it.updated = Date.now();
        if (old !== it.text) arc.history.push({ time: it.updated, text: '「' + (TYPE_MAP[it.type] || '') + '」〈' + short(old) + '〉→〈' + short(it.text) + '〉' });
        saveArc(cur, arc); toast('已更新'); render();
      }
    }, { placeholder: '你发现的TA' });
  }

  function reviseKnow(id) {
    const arc = ensureArc(cur); const it = arc.loves.find(x => x.id === id); if (!it) return;
    let phase = 'text', newText = '';
    const ctl = window.openModal('重新理解TA', '', function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        newText = t; phase = 'why';
        ctl.stay(); ctl.title('为什么这样认为？（可选）'); ctl.hint('旧的看法会保留在「理解变化」里。');
        ctl.text(''); ctl.maxLen(120); ctl.ph('可留空'); ctl.input(true); ctl.okText('下一步');
        return;
      }
      if (phase === 'why') {
        const why = String(v == null ? '' : v).trim();
        it.newText = newText; it.newWhy = why;
        phase = 'level';
        ctl.stay(); ctl.input(false);
        ctl.pills(LEVEL_PILLS, String(it.level));
        ctl.title('现在你有多确定？'); ctl.okText('保存');
        return;
      }
      if (phase === 'level') {
        const lvl = parseInt(v, 10);
        const oldText = it.text, oldWhy = it.why, oldLevel = it.level;
        it.revisions.push({ text: oldText, why: oldWhy, level: oldLevel, time: Date.now() });
        it.text = it.newText; it.newText = undefined;
        it.why = it.newWhy || ''; it.newWhy = undefined;
        it.level = isNaN(lvl) ? it.level : (lvl || 0);
        it.updated = Date.now(); it.status = 'active';
        arc.history.push({ time: it.updated, text: '「' + (TYPE_MAP[it.type] || '') + '」重新理解：〈' + short(oldText) + '〉→〈' + short(it.text) + '〉' });
        saveArc(cur, arc); toast('更新了对TA的理解'); render();
      }
    }, { placeholder: '新的理解，例如：TA只是不习惯主动表达' });
  }

  function retireKnow(id) {
    const arc = ensureArc(cur); const it = arc.loves.find(x => x.id === id); if (!it) return;
    if (!window.openModal) return;
    let phase = 'ask';
    const ctl = window.openModal('暂不适用这条了解？', '', function (v) {
      if (phase === 'ask') {
        if (v === 'no') return;
        phase = 'note';
        ctl.stay(); ctl.title('想留句话吗？（可选）');
        ctl.hint('以后还能回来看，当初为什么暂停。');
        ctl.input(true); ctl.maxLen(120); ctl.ph('可留空'); ctl.okText('确认'); ctl.text('');
        return;
      }
      if (phase === 'note') {
        it.note = String(v == null ? '' : v).trim();
        it.status = 'retired'; it.updated = Date.now();
        arc.history.push({ time: it.updated, text: '「' + (TYPE_MAP[it.type] || '') + '」暂时不再适用：' + short(it.text) });
        saveArc(cur, arc); toast('已暂不适用'); render();
      }
    }, { noInput: true, pills: [{ label: '取消', value: 'no' }, { label: '暂不适用', value: 'yes' }] });
  }

  function restoreKnow(id) {
    const arc = ensureArc(cur); const it = arc.loves.find(x => x.id === id); if (!it) return;
    it.status = 'active'; it.updated = Date.now();
    arc.history.push({ time: it.updated, text: '「' + (TYPE_MAP[it.type] || '') + '」恢复适用：' + short(it.text) });
    saveArc(cur, arc); toast('已恢复'); render();
  }

  function delKnow(id) {
    const arc = ensureArc(cur);
    window.openModal('删除这条了解？', '', function (v) {
      if (v !== 'del') return;
      arc.loves = arc.loves.filter(x => x.id !== id);
      saveArc(cur, arc); toast('已删除'); render();
    }, { noInput: true, pills: [{ label: '取消', value: 'no' }, { label: '删除', value: 'del' }] });
  }

  function addBond(cat) {
    let phase = 'text', text = '';
    const ctl = window.openModal('记一条「' + BOND_CATS[cat] + '」', '', function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        text = t; phase = 'date';
        ctl.stay(); ctl.title('发生在哪一天？'); ctl.hint('留空默认今天。');
        ctl.text(mdstr(Date.now())); ctl.maxLen(30); ctl.input(true); ctl.ph('如 8月3日'); ctl.okText('保存');
        return;
      }
      if (phase === 'date') {
        const arc = ensureArc(cur);
        arc.bonds.push({ id: makeId(), cat: cat, text: text, date: String(v == null ? '' : v).trim() || mdstr(Date.now()), created: Date.now() });
        saveArc(cur, arc); toast('已记下'); render();
      }
    }, { placeholder: '例如：第一次一起玩游戏' });
  }

  function addMoment() {
    let phase = 'text', text = '';
    const ctl = window.openModal('记一个重要时刻', '', function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        text = t; phase = 'date';
        ctl.stay(); ctl.title('在哪一天？'); ctl.hint('留空默认今天。');
        ctl.text(mdstr(Date.now())); ctl.maxLen(30); ctl.input(true); ctl.ph('如 8月12日'); ctl.okText('保存');
        return;
      }
      if (phase === 'date') {
        const arc = ensureArc(cur);
        arc.moments.push({ id: makeId(), text: text, date: String(v == null ? '' : v).trim() || mdstr(Date.now()), created: Date.now() });
        arc.history.push({ time: Date.now(), text: '重要时刻：' + short(text) });
        saveArc(cur, arc); toast('记下了重要时刻'); render();
      }
    }, { placeholder: '例如：TA第一次主动说想留下来' });
  }

  function addRecord() {
    let phase = 'text', text = '';
    const ctl = window.openModal('记一条相处', '', function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        text = t; phase = 'date';
        ctl.stay(); ctl.title('在哪一天？'); ctl.hint('留空默认今天。');
        ctl.text(mdstr(Date.now())); ctl.maxLen(30); ctl.input(true); ctl.ph('如 8月25日'); ctl.okText('保存');
        return;
      }
      if (phase === 'date') {
        const arc = ensureArc(cur);
        arc.records.push({ id: makeId(), text: text, date: String(v == null ? '' : v).trim() || mdstr(Date.now()), created: Date.now() });
        saveArc(cur, arc); toast('已记下'); render();
      }
    }, { placeholder: '今天和TA聊了很久……' });
  }

  function editEntry(kind, id) {
    const arc = ensureArc(cur);
    const arr = kind === 'bond' ? arc.bonds : (kind === 'moment' ? arc.moments : arc.records);
    const it = arr.find(x => x.id === id); if (!it) return;
    let phase = 'text', newText = '';
    const ctl = window.openModal('编辑', it.text, function (v) {
      if (phase === 'text') {
        const t = String(v == null ? '' : v).trim(); if (!t) { ctl.stay(); ctl.focus(); return; }
        newText = t; phase = 'date';
        ctl.stay(); ctl.title('在哪一天？');
        ctl.text(it.date || mdstr(Date.now())); ctl.maxLen(30); ctl.input(true); ctl.ph('如 8月3日'); ctl.okText('保存');
        return;
      }
      if (phase === 'date') {
        it.text = newText; it.date = String(v == null ? '' : v).trim() || mdstr(Date.now());
        saveArc(cur, arc); toast('已更新'); render();
      }
    }, { placeholder: '内容' });
  }

  function delEntry(kind, id) {
    const arc = ensureArc(cur);
    window.openModal('删除这条？', '', function (v) {
      if (v !== 'del') return;
      if (kind === 'bond') arc.bonds = arc.bonds.filter(x => x.id !== id);
      else if (kind === 'moment') arc.moments = arc.moments.filter(x => x.id !== id);
      else { arc.records = arc.records.filter(x => x.id !== id); }
      saveArc(cur, arc); toast('已删除'); render();
    }, { noInput: true, pills: [{ label: '取消', value: 'no' }, { label: '删除', value: 'del' }] });
  }

  function toggleMoment(recId) {
    const arc = ensureArc(cur); const rec = arc.records.find(x => x.id === recId);
    if (!rec) return;
    if (rec.momentId) {
      arc.moments = arc.moments.filter(m => m.id !== rec.momentId);
      rec.momentId = '';
    } else {
      const m = { id: makeId(), text: rec.text, date: rec.date || mdstr(Date.now()), created: Date.now() };
      arc.moments.push(m); rec.momentId = m.id;
      arc.history.push({ time: Date.now(), text: '重要时刻：' + short(rec.text) });
    }
    saveArc(cur, arc); render();
  }

  function addWonder() {
    if (!window.openModal) return;
    window.openModal('记一个想了解的事', '', function (v) {
      const t = String(v == null ? '' : v).trim(); if (!t) return;
      const arc = ensureArc(cur);
      arc.wonders.push({ id: makeId(), text: t, solved: false, created: Date.now(), solvedAt: null });
      saveArc(cur, arc); toast('记下了，留给未来的你们'); render();
    }, { placeholder: '例如：TA真正害怕的是什么？' }).maxLen(80);
  }

  function solveWonder(id) {
    const arc = ensureArc(cur); const w = arc.wonders.find(x => x.id === id); if (!w) return;
    window.openModal('「' + short(w.text, 20) + '」已经有答案了吗？', '', function (v) {
      if (v === 'only') { w.solved = true; w.solvedAt = Date.now(); saveArc(cur, arc); toast('已了解'); render(); return; }
      if (v === 'convert') {
        w.solved = true; w.solvedAt = Date.now(); saveArc(cur, arc); render();
        addKnow(ALL_TYPES, w.text); // 把答案也记成一条「了解」
      }
    }, { noInput: true, pills: [{ label: '只是已了解', value: 'only' }, { label: '已了解 · 也记为了解', value: 'convert' }] });
  }

  function reopenWonder(id) {
    const arc = ensureArc(cur); const w = arc.wonders.find(x => x.id === id); if (!w) return;
    w.solved = false; w.solvedAt = null; saveArc(cur, arc); render();
  }
  function delWonder(id) {
    const arc = ensureArc(cur);
    window.openModal('删除这个疑问？', '', function (v) {
      if (v !== 'del') return;
      arc.wonders = arc.wonders.filter(x => x.id !== id);
      saveArc(cur, arc); toast('已删除'); render();
    }, { noInput: true, pills: [{ label: '取消', value: 'no' }, { label: '删除', value: 'del' }] });
  }

  // ---- 事件分发 ----
  function dispatch(op, el) {
    const id = el.getAttribute('data-id');
    const kind = el.getAttribute('data-kind');
    const cat = el.getAttribute('data-cat');
    const pool = el.getAttribute('data-pool');
    const view2 = el.getAttribute('data-view');
    const rid = el.getAttribute('data-rid');
    switch (op) {
      case 'nav': view = view2 || 'knows'; render(); break;
      case 'bond-tab': bondsTab = el.getAttribute('data-bt') || 'first'; render(); break;
      case 'pick-roster': cur = rid; setCur(cur); if (view === 'bonds') bondsTab = 'first'; render(); break;
      case 'add-roster': if (window.cjianManage) window.cjianManage(); break;
      case 'add-know': addKnow(pool && pool !== 'all' ? pool.split(',') : ALL_TYPES); break;
      case 'edit-know': editKnow(id); break;
      case 'revise-know': reviseKnow(id); break;
      case 'retire-know': retireKnow(id); break;
      case 'restore-know': restoreKnow(id); break;
      case 'del-know': delKnow(id); break;
      case 'add-bond': addBond(cat); break;
      case 'add-moment': addMoment(); break;
      case 'add-record': addRecord(); break;
      case 'edit-entry': editEntry(kind, id); break;
      case 'del-entry': delEntry(kind, id); break;
      case 'toggle-moment': toggleMoment(id); break;
      case 'add-wonder': addWonder(); break;
      case 'solve-wonder': solveWonder(id); break;
      case 'reopen-wonder': reopenWonder(id); break;
      case 'del-wonder': delWonder(id); break;
    }
  }

  // ---- 绑定 ----
  function bind() {
    const back = document.getElementById('narc-back');
    if (back) back.addEventListener('click', function () { window.closeNarc(); });
    const manage = document.getElementById('narc-manage');
    if (manage) manage.addEventListener('click', function (e) { e.stopPropagation(); if (window.cjianManage) window.cjianManage(); });
    const appIcon = document.querySelector('.app[data-app="memo-arc"]');
    if (appIcon) {
      appIcon.addEventListener('click', function () {
        const editing = Array.prototype.some.call(document.querySelectorAll('.app-grid'), g => g.classList.contains('editing'));
        if (editing) return;
        window.openNarc();
      });
    }
    if (root) {
      root.addEventListener('click', function (e) {
        const b = e.target.closest('[data-op]');
        if (!b) return;
        dispatch(b.getAttribute('data-op'), b);
      });
    }
  }

  function boot() {
    bind();
    // 此间梦角被管理（增删改名）后，下次打开/切换自动重读 roster —— 无需额外钩子。
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
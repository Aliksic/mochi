// ===== 功能：双人钓鱼（聊天页更多功能 → 钓鱼） =====
// 轻量资源获取小游戏：你与 TA 各一根鱼竿，你负责点击操作，TA 由代码状态机控制。
// 核心循环：抛竿 → 鱼漂晃动 → 时机收竿 → 获得鱼/物品 → 今日收获 → 出售 → 心意币（进 gift-wallet 统一账本）。
// 附属系统：鱼图鉴（首次钓到记录）、TA 送礼（特殊物品概率触发互动字卡 + 收藏）、一起钓鱼陪伴奖励（每日一次）。
// 不依赖聊天 AI；音效 Web Audio 短促音，可静音。存储键均走 window.activeStore()（随联系人桌面隔离，前缀 xy-home-v2）。
(function () {
  const panel = document.getElementById('chat-fish-panel');
  if (!panel) return;
  if (window.__fishInit) return;
  window.__fishInit = true;

  // ---- 基础工具 ----
  function store() { try { return window.activeStore(); } catch (e) { return null; } }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    t.style.opacity = '';
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.className = 'cc-toast'; }, 2000);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fit(s) { return window.taFit ? window.taFit(s) : s; }
  function partnerName() { try { return window.chatPartnerName ? window.chatPartnerName() : 'TA'; } catch (e) { return 'TA'; } }
  function taWord() { try { return window.taWord ? window.taWord() : 'TA'; } catch (e) { return 'TA'; } }
  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
  function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fenToStr(fen) { const y = fen / 100; return y.toFixed(y >= 100 ? 0 : 2); }
  function pickPool(name, fb) { try { if (window.getInteractPool) { const p = window.getInteractPool(name, fb); if (p && p.length) return p; } } catch (e) {} return fb; }

  // ---- 音效（Web Audio 短促音） ----
  let audioCtx = null, soundOn = true;
  function beep(freq, dur, vol, type) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = type || 'sine';
      g.gain.value = vol || 0.08;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime;
      o.start(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.08));
      o.stop(t + (dur || 0.08));
    } catch (e) {}
  }
  function sfxCast() { beep(360, 0.06, 0.1); }
  function sfxBite() { beep(720, 0.05, 0.12); beep(880, 0.05, 0.1); }
  function sfxCatch() { beep(520, 0.08, 0.14); setTimeout(function () { beep(780, 0.1, 0.14); }, 90); }
  function sfxMiss() { beep(240, 0.14, 0.1, 'triangle'); }
  function sfxSell() { beep(660, 0.06, 0.12); setTimeout(function () { beep(880, 0.08, 0.12); }, 80); setTimeout(function () { beep(1100, 0.1, 0.12); }, 160); }
  function sfxGift() { beep(880, 0.1, 0.12); setTimeout(function () { beep(1174, 0.12, 0.12); }, 110); }

  // ---- 物品表（price 单位：分，与 gift-wallet 一致；cat: fish/special/gift） ----
  const ITEMS = [
    { id: 'fish_small',    name: '小鱼',   icon: '🐟', price: 200,  cat: 'fish',    r: 1 },
    { id: 'fish_blue',     name: '蓝鱼',   icon: '🐠', price: 500,  cat: 'fish',    r: 2 },
    { id: 'fish_puffer',   name: '河豚',   icon: '🐡', price: 600,  cat: 'fish',    r: 2 },
    { id: 'fish_crab',     name: '螃蟹',   icon: '🦀', price: 700,  cat: 'fish',    r: 2 },
    { id: 'fish_big',      name: '大鱼',   icon: '🐟', price: 1200, cat: 'fish',    r: 3 },
    { id: 'fish_octopus',  name: '八爪鱼', icon: '🐙', price: 1200, cat: 'fish',    r: 3 },
    { id: 'fish_rare',     name: '稀有鱼', icon: '🐠', price: 3000, cat: 'fish',    r: 4 },
    { id: 'fish_gold',     name: '金色鱼', icon: '🌟', price: 5000, cat: 'fish',    r: 5 },
    { id: 'sp_flower',     name: '漂流花', icon: '🌸', price: 800,  cat: 'special', giftNote: 'flower' },
    { id: 'sp_chest',      name: '小宝箱', icon: '🎁', price: 2000, cat: 'special' },
    { id: 'gift_shell',    name: '小贝壳', icon: '🐚', cat: 'gift',    price: 0, giftNote: 'shell' },
    { id: 'gift_stone',    name: '小石头', icon: '🪨', cat: 'gift',    price: 0, giftNote: 'stone' },
    { id: 'gift_bottle',   name: '漂流瓶', icon: '🧴', cat: 'gift',    price: 0, giftNote: 'bottle' },
    { id: 'gift_trinket',  name: '小饰品', icon: '🎀', cat: 'gift',    price: 0, giftNote: 'trinket' }
  ];
  const ITEM_MAP = {}; ITEMS.forEach(function (it) { ITEM_MAP[it.id] = it; });
  // 可钓到的鱼池（按稀有度 r 加权，供玩家与 TA 共用）
  const FISH_POOL = ITEMS.filter(function (it) { return it.cat === 'fish' || it.cat === 'special'; });
  // TA 专属纪念池（小贝壳/小石头/漂流瓶/小饰品）——只有 TA 会钓到并主动送给你收藏
  const GIFT_POOL = ITEMS.filter(function (it) { return it.cat === 'gift'; });
  // 玩家出货：按品质给稀有度权重
  function qualityWeights(quality) {
    // perfect: 高稀有度倾斜；good: 中等；poor: 低稀有度倾斜
    if (quality === 'perfect') return { 1: 30, 2: 30, 3: 22, 4: 13, 5: 5 };
    if (quality === 'good')    return { 1: 45, 2: 30, 3: 16, 4: 7, 5: 2 };
    return { 1: 68, 2: 22, 3: 8, 4: 2, 5: 0 };
  }
  function rollFish(quality) {
    const w = qualityWeights(quality);
    const pool = FISH_POOL.filter(function (it) { return (w[it.r] || 0) > 0; });
    let total = 0; pool.forEach(function (it) { total += (w[it.r] || 0); });
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= (w[pool[i].r] || 0); if (r <= 0) return pool[i]; }
    return pool[0];
  }
  function successRate(quality) { return quality === 'perfect' ? 0.92 : quality === 'good' ? 0.6 : 0.22; }
  // TA 出货：约 15% 概率钓到「纪念品」送给你，其余走普通鱼池（稀有度按 good 倾斜）
  function rollTaItem() {
    if (Math.random() < 0.15 && GIFT_POOL.length) return GIFT_POOL[Math.floor(Math.random() * GIFT_POOL.length)];
    return rollFish('good');
  }

  // ---- 送礼 / 互动字卡池（内置兜底，优先读用户字卡库） ----
  const GIFT_NOTES = {
    shell: ['捡到一个小贝壳，给你。', '这个贝壳挺好看的，留给你。', '海边的小东西，收下吧。'],
    stone: ['捡到一块小石头，很光滑，给你。', '这块石头摸起来很舒服，送你。'],
    bottle: ['捞到一个漂流瓶，没舍得打开，给你。', '捡到一个漂流瓶，送你了。'],
    trinket: ['钓上来一个小饰品，是你的了。', '这个小东西，很想给你。'],
    flower: ['这朵花给你。', 'TA 把花递给你。', '捞起一朵花，觉得适合你。']
  };
  function giftNoteFor(item) {
    const builtin = GIFT_NOTES[item.giftNote || item.id] || ['这个给你。', '想把这份小惊喜留给你。'];
    const pool = pickPool('游戏胜利·回应', builtin);
    return pool && pool.length ? pick(pool) : pick(builtin);
  }

  // ---- 存储读写 ----
  function readJSON(key, fb) { const s = store(); if (!s) return fb; try { const v = JSON.parse(s.get(key) || 'null'); return v == null ? fb : v; } catch (e) { return fb; } }
  function writeJSON(key, v) { const s = store(); if (s) s.set(key, JSON.stringify(v)); }

  function dexKey() { return 'fishing-dex'; }
  function loadDex() { const d = readJSON(dexKey(), {}); return (d && typeof d === 'object') ? d : {}; }
  function saveDex(d) { writeJSON(dexKey(), d); }

  function todayDataKey() { return 'fishing-today'; }
  function loadToday() {
    const t = readJSON(todayDataKey(), null);
    if (t && t.date === todayKey()) return t;
    return { date: todayKey(), mine: {}, ta: {} };
  }
  function saveToday(t) { writeJSON(todayDataKey(), t); }

  function giftsKey() { return 'fishing-gifts'; }
  function loadGifts() { const g = readJSON(giftsKey(), []); return Array.isArray(g) ? g : []; }
  function saveGifts(g) { writeJSON(giftsKey(), g); }

  function togetherKey() { return 'fishing-together'; }
  function loadTogether() { const t = readJSON(togetherKey(), null); if (t && t.date === todayKey()) return t; return { date: todayKey(), sec: 0, rewarded: false }; }
  function saveTogether(t) { writeJSON(togetherKey(), t); }

  // ---- 心意币钱包（全局一本账：根键 xy-home-v2:gift-wallet，跨桌面共用，单位分）----
  // v3.15.x 二轮：默认对齐新用户 ¥520/¥520，读写切根命名空间；v3.16.x 发币已改走 giftWalletChange
  function walletGet() {
    const s = window.xyStore ? window.xyStore('xy-home-v2') : null;
    if (!s) return { myBalance: 52000, systemBalance: 52000 };
    try { const w = JSON.parse(s.get('gift-wallet') || ''); if (typeof w.myBalance === 'number' && typeof w.systemBalance === 'number') return w; } catch (e) {}
    const seed = { myBalance: 52000, systemBalance: 52000 };
    s.set('gift-wallet', JSON.stringify(seed));
    return seed;
  }
  function walletSet(w) { const s = window.xyStore ? window.xyStore('xy-home-v2') : null; if (s) s.set('gift-wallet', JSON.stringify(w)); }

  // ---- DOM ----
  const partnerNameEl = document.getElementById('fish-partner-name');
  const sceneEl = document.getElementById('fish-scene');
  const statusEl = document.getElementById('fish-status');
  const castBtn = document.getElementById('fish-cast');
  const reelBtn = document.getElementById('fish-reel');
  const soundBtn = document.getElementById('fish-sound');
  const timingWrapEl = document.getElementById('fish-timing-wrap');
  const timingBarEl = document.getElementById('fish-timing-bar');
  const timingCursorEl = document.getElementById('fish-timing-cursor');
  const pageEl = document.getElementById('fish-page');
  const tabEls = panel.querySelectorAll('.fish-tab');
  // 鱼漂（纯视觉元素，由 scene 的 data-mine/data-ta 状态驱动显隐/变色，见 chat-pages.css .fish-bobber）
  if (sceneEl && !sceneEl.querySelector('.fish-bobber')) {
    const bm = document.createElement('span'); bm.className = 'fish-bobber fish-bobber-mine';
    const bt = document.createElement('span'); bt.className = 'fish-bobber fish-bobber-ta';
    sceneEl.appendChild(bm); sceneEl.appendChild(bt);
  }

  // ---- 运行时状态 ----
  let mine = null;       // 玩家：{phase, since, biteAt, rafId}
  let ta = null;         // TA：{phase, until, ...}
  let taTimer = null, togetherTimer = null;
  let timingRafId = null;
  let curTab = 'today';
  let open = false;

  function resetMine() { mine = { phase: 'idle', since: 0, biteAt: 0 }; }
  function resetTa() { ta = { phase: 'idle', until: 0, next: 0 }; }
  resetMine(); resetTa();

  // ---- 玩家：抛竿 → 等待 → 咬钩时机条 → 收竿 ----
  function castMine() {
    if (mine.phase === 'waiting' || mine.phase === 'biting') return;
    sfxCast();
    if (statusEl) delete statusEl.dataset.keep;
    mine.phase = 'waiting'; mine.since = Date.now();
    mine.biteAt = Date.now() + rand(2000, 4500);
    const wait = mine.biteAt - Date.now();
    clearTimeout(mine._tm); mine._tm = setTimeout(function () {
      if (mine.phase !== 'waiting') return;
      startBiting();
    }, wait);
    render();
  }
  function startBiting() {
    mine.phase = 'biting'; mine.biteStart = Date.now(); mine.biteDur = 1600;
    sfxBite();
    if (timingRafId) cancelAnimationFrame(timingRafId);
    const loop = function (ts) {
      if (mine.phase !== 'biting') { timingRafId = null; return; }
      const p = Math.min(1, (Date.now() - mine.biteStart) / mine.biteDur);
      mine.progress = p;
      updateTimingVisual(p);
      if (p >= 1) { timingRafId = null; reelMine(); }
      else timingRafId = requestAnimationFrame(loop);
    };
    timingRafId = requestAnimationFrame(loop);
    render();
  }
  function reelMine() {
    if (mine.phase !== 'biting') return;
    const p = (mine.progress == null) ? 0 : mine.progress;
    let quality;
    if (p >= 0.38 && p <= 0.68) quality = 'perfect';
    else if ((p >= 0.2 && p < 0.38) || (p > 0.68 && p <= 0.85)) quality = 'good';
    else quality = 'poor';
    const hit = Math.random() < successRate(quality);
    if (timingRafId) { cancelAnimationFrame(timingRafId); timingRafId = null; }
    if (hit) {
      const item = rollFish(quality);
      sfxCatch();
      gainMine(item);
      flashScene(true, item);
      if (quality === 'perfect') statusText('完美收竿！钓到了 ' + item.icon + ' ' + item.name);
      else statusText('收竿！钓到了 ' + item.icon + ' ' + item.name);
    } else {
      sfxMiss();
      flashScene(false);
      statusText('鱼跑了…（' + (quality === 'perfect' ? '差一点点' : '时机不对') + '）');
    }
    mine.phase = 'idle'; mine.progress = null;
    render();
  }
  function gainMine(item) {
    const t = loadToday();
    t.mine[item.id] = (t.mine[item.id] || 0) + 1;
    saveToday(t);
    markDex(item);
  }

  // ---- 图鉴记录（首次钓到弹提示） ----
  function markDex(item) {
    const d = loadDex();
    if (!d[item.id]) {
      d[item.id] = true; saveDex(d);
      toast('发现新物品！' + item.icon + ' ' + item.name);
    }
  }

  // ---- 玩家收竿成功后的场景反馈（水花 + 徽章） ----
  function flashScene(got, item) {
    const wp = sceneEl.querySelector('.fish-water');
    if (!wp) return;
    const splash = document.createElement('div');
    splash.className = 'fish-splash' + (got ? ' ok' : '');
    splash.textContent = got ? (item ? item.icon : '🐟') : '💨';
    wp.appendChild(splash);
    setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 1200);
  }

  // ---- TA 状态机（概率行为，独立定时器） ----
  function taStep() {
    const now = Date.now();
    if (ta.phase === 'idle' || (ta.phase !== 'rest' && ta.phase !== 'waiting' && ta.phase !== 'biting' && now >= ta.next)) {
      ta.decide(now);
    } else if (now < ta.until) {
      // 状态持续中
    } else {
      ta.resolve(now);
    }
    render();
  }
  resetTa = function () {
    ta = {
      phase: 'idle', until: 0, next: 0,
      decide: function (now) {
        const r = Math.random();
        if (r < 0.05) { this.phase = 'rest'; this.until = now + rand(4000, 9000); this.next = now + rand(9000, 15000); }
        else if (r < 0.15) { this.phase = 'daze'; this.until = now + rand(2000, 5000); this.next = now + rand(5000, 9000); }
        else if (r < 0.25) { this.phase = 'shift'; this.until = now + rand(1500, 3500); this.next = now + rand(2500, 4500); }
        else {
          // 钓鱼：抛竿 → 等待（随机时长）→ 咬钩 → 收竿
          this.phase = 'casting'; this.until = now + rand(800, 1500);
          this.castAt = now; this.biteAt = now + rand(3000, 8000);
        }
      },
      resolve: function (now) {
        switch (this.phase) {
          case 'casting': this.phase = 'waiting'; this.until = this.biteAt; this.next = this.biteAt; break;
          case 'waiting':
            this.phase = 'biting'; this.until = now + rand(900, 1800); this.next = this.until; break;
          case 'biting':
            if (Math.random() < 0.8) {
              const item = rollTaItem();
              sfxCatch();
              taCaught(item);
            } else {
              sfxMiss();
              statusText(taWord() + ' 的鱼跑了…');
            }
            this.phase = 'idle'; this.next = now + rand(1500, 4000); break;
          default: this.phase = 'idle'; this.next = now + rand(1500, 3500);
        }
      }
    };
  };
  resetTa();
  function taCaught(item) {
    if (item.cat === 'gift') {
      // 纪念品：进「TA 送我的东西」收藏 + 触发送礼互动（不进入今日收获出售区）
      const g = loadGifts();
      g.unshift({ id: item.id, ts: Date.now() });
      saveGifts(g);
      sfxGift();
      const note = giftNoteFor(item);
      statusText(taWord() + ' 钓到了 ' + item.icon + ' ' + item.name + '，并把它送给了你。');
      sendTaLine(fit('TA：') + note, true);
    } else {
      const t = loadToday();
      t.ta[item.id] = (t.ta[item.id] || 0) + 1; saveToday(t);
      markDex(item);
      statusText(taWord() + ' 钓到了 ' + item.icon + ' ' + item.name);
      // 漂流花：概率触发赠送互动（花仍可出售）
      if (item.giftNote === 'flower' && Math.random() < 0.5) {
        const note = giftNoteFor(item);
        setTimeout(function () { sendTaLine(fit('TA：') + note, false); }, 700);
      }
    }
  }
  function sendTaLine(text, glow) {
    try { if (window.chatAddIn) window.chatAddIn(text, { silent: true }); } catch (e) {}
  }

  // ---- 一起钓鱼陪伴奖励（双方同时在场累计 5 分钟，每日一次） ----
  const TOGETHER_GOAL = 300; // 秒
  function startTogetherTimer() {
    stopTogetherTimer();
    togetherTimer = setInterval(function () {
      if (!open) return;
      const bothFishing = (mine.phase === 'waiting' || mine.phase === 'biting') && (ta.phase === 'casting' || ta.phase === 'waiting' || ta.phase === 'biting');
      if (!bothFishing) return;
      const t = loadTogether();
      if (t.rewarded) return;
      t.sec += 1; saveTogether(t);
      if (t.sec >= TOGETHER_GOAL) {
        t.rewarded = true; saveTogether(t);
        // v3.16.x：陪伴奖励双方同步同额（原只加我的余额）
        if (window.giftWalletChange) window.giftWalletChange(1314, 1314, '钓鱼陪伴奖励');
        sfxGift();
        toast('💕 陪伴奖励：一起钓鱼 5 分钟，心意币各 +¥13.14');
        if (window.chatAddIn) { try { window.chatAddIn(fit('陪了我这么久，鱼都知道你不走了。') + '（陪伴奖励各 +¥13.14）', { silent: true }); } catch (e) {} }
      }
    }, 1000);
  }
  function stopTogetherTimer() { if (togetherTimer) { clearInterval(togetherTimer); togetherTimer = null; } }

  // ---- 出售（今日收获 → 心意币） ----
  function sellAll() {
    const t = loadToday();
    let total = 0, count = 0;
    ['mine', 'ta'].forEach(function (side) {
      Object.keys(t[side]).forEach(function (id) {
        const it = ITEM_MAP[id];
        if (!it || it.cat === 'gift') return;
        const n = t[side][id] || 0;
        total += it.price * n; count += n;
      });
    });
    if (count === 0) { toast('还没有可出售的收获'); return; }
    // v3.16.x：出售收获双方同步同额（原只加我的余额）
    if (window.giftWalletChange) window.giftWalletChange(total, total, '钓鱼出售');
    t.mine = {}; t.ta = {}; saveToday(t);
    sfxSell();
    toast('已出售 ' + count + ' 件，心意币各 +' + fenToStr(total));
    render();
  }

  // ---- 兑换 TA 送的纪念品为心意币（v3.15.x 二调：¥5.2，对齐红包小额档） ----
  function exchangeGift(idx) {
    const g = loadGifts();
    const item = g[idx]; if (!item) return;
    g.splice(idx, 1); saveGifts(g);
    // v3.16.x：兑换 TA 纪念品双方同步同额（原只加我的余额）
    if (window.giftWalletChange) window.giftWalletChange(520, 520, '纪念品兑换');
    sfxSell();
    toast('已兑换心意币各 +¥5.2');
    render();
  }

  // ---- 渲染 ----
  function statusText(t) { if (statusEl) statusEl.textContent = t; }
  function updateTimingVisual(p) {
    if (!timingWrapEl) return;
    timingWrapEl.hidden = false;
    if (timingCursorEl) timingCursorEl.style.left = (p * 100).toFixed(1) + '%';
  }
  function render() {
    // 标题
    if (partnerNameEl) partnerNameEl.textContent = taWord();
    // 场景 class（反映双方状态）
    const sc = sceneEl;
    if (sc) {
      sc.setAttribute('data-mine', mine.phase);
      sc.setAttribute('data-ta', ta.phase);
      const taStateEl = sc.querySelector('.fish-ta-state'); if (taStateEl) taStateEl.textContent = taStateLabel();
    }
    // 按钮：等待期保留禁用态「等待鱼漂…」（避免按钮区塌陷跳动）；咬钩期只显示收竿
    const bitting = mine.phase === 'biting';
    if (castBtn) {
      const waiting = mine.phase === 'waiting';
      castBtn.hidden = bitting;
      castBtn.disabled = waiting;
      castBtn.textContent = waiting ? '等待鱼漂…' : '抛竿';
    }
    if (reelBtn) reelBtn.hidden = !bitting;
    if (timingWrapEl) timingWrapEl.hidden = !bitting;
    // 默认状态提示
    if (statusEl && !statusEl.dataset.keep) {
      if (mine.phase === 'waiting') statusEl.textContent = '鱼漂已下水，等 TA 咬钩…';
      else if (mine.phase === 'idle' && curTab === 'today') statusEl.textContent = '';
    }
    renderPage();
  }
  function taStateLabel() {
    switch (ta.phase) {
      case 'casting': return '抛竿';
      case 'waiting': return '静静等';
      case 'biting': return '有鱼！';
      case 'rest': return '休息';
      case 'daze': return '发呆';
      case 'shift': return '换位置';
      default: return '待着';
    }
  }
  function renderPage() {
    if (!pageEl) return;
    if (curTab === 'today') pageEl.innerHTML = renderToday();
    else if (curTab === 'dex') pageEl.innerHTML = renderDex();
    else if (curTab === 'gifts') pageEl.innerHTML = renderGifts();
  }
  function renderToday() {
    const t = loadToday();
    let total = 0, count = 0;
    function rows(side) {
      const m = t[side] || {};
      const ids = Object.keys(m);
      if (!ids.length) return '<div class="fish-empty">还没有收获</div>';
      let html = '';
      ids.forEach(function (id) {
        const it = ITEM_MAP[id]; if (!it) return;
        const n = m[id];
        const p = it.price * n;
        const sellable = it.cat !== 'gift';
        if (sellable) { total += p; count += n; }
        html += '<div class="fish-row"><span class="fish-ico">' + it.icon + '</span><span class="fish-name">' + esc(it.name) + (it.cat === 'gift' ? '<i class="fish-gift-tag">已收藏</i>' : '') + '</span><span class="fish-cnt">×' + n + '</span>' + (sellable ? '<span class="fish-price">+' + fenToStr(p) + '</span>' : '<span class="fish-price">纪念</span>') + '</div>';
      });
      return html;
    }
    const html =
      '<div class="fish-sub">今日收获</div>' +
      '<div class="fish-subhead">你</div>' + rows('mine') +
      '<div class="fish-subhead">' + esc(taWord()) + '</div>' + rows('ta') +
      '<div class="fish-sellbar">' + (count ? '<span>共 ' + count + ' 件 · 价值 <b>+' + fenToStr(total) + '</b> 心意币</span>' : '<span>还没有可出售的收获</span>') + '<button class="fish-sell" id="fish-sell-btn"' + (count ? '' : ' disabled') + '>' + (count ? '出售全部' : '出售') + '</button></div>';
    return html;
  }
  function renderDex() {
    const d = loadDex();
    let html = '<div class="fish-sub">我的鱼图鉴</div><div class="fish-dex-grid">';
    ITEMS.forEach(function (it) {
      const got = !!d[it.id];
      html += '<div class="fish-dex-item' + (got ? ' got' : '') + '"><span class="fish-dex-ico">' + (got ? it.icon : '?') + '</span><span class="fish-dex-name">' + esc(it.name) + '</span>' + (got ? '<span class="fish-dex-check">✓</span>' : '') + '</div>';
    });
    html += '</div>';
    const gotCount = Object.keys(d).length;
    html += '<div class="fish-dex-foot">已发现 ' + gotCount + ' / ' + ITEMS.length + '</div>';
    return html;
  }
  function renderGifts() {
    const g = loadGifts();
    const html =
      '<div class="fish-sub">TA 送我的东西</div>' +
      (g.length ? g.map(function (item, idx) {
        const it = ITEM_MAP[item.id]; if (!it) return '';
        return '<div class="fish-row"><span class="fish-ico">' + it.icon + '</span><span class="fish-name">' + esc(it.name) + '</span><span class="fish-gift-ts">' + esc(fmtTs(item.ts)) + '</span><button class="fish-exch" data-idx="' + idx + '">兑换 +3</button></div>';
      }).join('') : '<div class="fish-empty">TA 还没送你东西，继续一起钓鱼吧～</div>');
    return html;
  }
  function fmtTs(ts) { const d = new Date(ts); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  // ---- 事件 ----
  if (castBtn) castBtn.addEventListener('click', function (e) { e.stopPropagation(); castMine(); });
  if (reelBtn) reelBtn.addEventListener('click', function (e) { e.stopPropagation(); reelMine(); });
  if (soundBtn) soundBtn.addEventListener('click', function (e) { e.stopPropagation(); soundOn = !soundOn; soundBtn.textContent = soundOn ? '🔊' : '🔇'; soundBtn.classList.toggle('off', !soundOn); });
  if (pageEl) pageEl.addEventListener('click', function (e) {
    const sell = e.target.closest && e.target.closest('#fish-sell-btn');
    if (sell) { e.stopPropagation(); sellAll(); return; }
    const exch = e.target.closest && e.target.closest('.fish-exch');
    if (exch) { e.stopPropagation(); exchangeGift(parseInt(exch.getAttribute('data-idx'), 10)); return; }
  });
  tabEls.forEach(function (tab) {
    tab.addEventListener('click', function (e) {
      e.stopPropagation();
      curTab = tab.getAttribute('data-ftab');
      tabEls.forEach(function (x) { x.classList.toggle('sel', x === tab); });
      render();
    });
  });
  panel.querySelector('.fish-close').addEventListener('click', function (e) { e.stopPropagation(); closeFishPanel(); });

  // ---- 入口（供 chat.js 调用） ----
  // 兄弟半框互斥（connect-four 同款）：打开钓鱼时收起其他浮层；任何兄弟面板被打开时自动收起本面板
  const FISH_SIBLING_IDS = ['poke-card', 'emoji-panel', 'chat-search', 'chat-ask-panel', 'chat-divine-panel', 'chat-decision-panel', 'chat-gdecision-panel', 'chat-rps-panel', 'chat-rp-panel', 'chat-call-panel', 'chat-pong-panel', 'chat-snake-panel', 'chat-brick-panel', 'chat-c4-panel', 'chat-more-panel'];
  function hideSiblings() {
    FISH_SIBLING_IDS.forEach(function (id) { const el = document.getElementById(id); if (el && el !== panel) el.hidden = true; });
    try { if (window.closeAvlib) window.closeAvlib(); } catch (e) {}
  }
  (function bindFishMutual() {
    try {
      if (!window.MutationObserver) return;
      const mo = new MutationObserver(function () {
        if (!panel || panel.hidden || !window.closeFishPanel) return;
        for (let i = 0; i < FISH_SIBLING_IDS.length; i++) {
          const el = document.getElementById(FISH_SIBLING_IDS[i]);
          if (el && !el.hidden) { try { window.closeFishPanel(); } catch (e) {} break; }
        }
      });
      FISH_SIBLING_IDS.forEach(function (id) { const el = document.getElementById(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
    } catch (e) {}
  })();
  window.openFishPanel = function () {
    if (!panel) return;
    hideSiblings();
    resetTa();
    resetMine();
    panel.hidden = false;
    open = true;
    if (partnerNameEl) partnerNameEl.textContent = taWord();
    stopTaTimer();
    taTimer = setInterval(taStep, 1200);
    startTogetherTimer();
    // 停在心跳
    statusEl.dataset.keep = '1';
    statusEl.textContent = '你和 ' + taWord() + ' 在水边坐下，点「抛竿」开始。';
    render();
  };
  window.closeFishPanel = function () {
    open = false;
    stopTaTimer();
    stopTogetherTimer();
    if (timingRafId) { cancelAnimationFrame(timingRafId); timingRafId = null; }
    stopMineTimer();
    resetMine(); resetTa();
    if (statusEl) delete statusEl.dataset.keep;
    if (panel) panel.hidden = true;
  };
  function stopTaTimer() { if (taTimer) { clearInterval(taTimer); taTimer = null; } }
  function stopMineTimer() { if (mine && mine._tm) { clearTimeout(mine._tm); mine._tm = null; } }
  document.addEventListener('contact-switched', function () { try { closeFishPanel(); } catch (e) {} });

  // ---- 只读/驯化测试钩子（tools/verify-fishing-ui.mjs 专用；不影响正常玩法） ----
  window.__fishDebug = {
    state: function () { return { open: open, mine: mine && mine.phase, ta: ta && ta.phase, today: loadToday(), dex: loadDex(), gifts: loadGifts(), together: loadTogether(), wallet: walletGet() }; },
    forceBite: function () { if (mine.phase === 'waiting') { clearTimeout(mine._tm); startBiting(); } return mine.phase; },
    // 以指定进度收竿（p∈0..1，0.5=完美区间中心）；force=true 跳过成功概率必命中（仅测试）
    reelAt: function (p, force) {
      if (mine.phase !== 'biting') return false;
      mine.progress = p;
      if (force) {
        const q = (p >= 0.38 && p <= 0.68) ? 'perfect' : ((p >= 0.2 && p < 0.38) || (p > 0.68 && p <= 0.85)) ? 'good' : 'poor';
        const item = rollFish(q);
        if (timingRafId) { cancelAnimationFrame(timingRafId); timingRafId = null; }
        gainMine(item); flashScene(true, item);
        statusText((q === 'perfect' ? '完美收竿！钓到了 ' : '收竿！钓到了 ') + item.icon + ' ' + item.name);
        mine.phase = 'idle'; mine.progress = null; render();
        return true;
      }
      reelMine(); return true;
    },
    addTaGift: function (id) { const g = loadGifts(); g.unshift({ id: id || 'gift_shell', ts: Date.now() }); saveGifts(g); renderPage(); return true; }
  };
})();
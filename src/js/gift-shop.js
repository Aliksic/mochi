(function () {
  if (window.__giftShopInit) return;
  window.__giftShopInit = true;

  function store() { return window.activeStore(); }
  function partnerName() { return (typeof window.chatPartnerName === 'function') ? window.chatPartnerName() : 'TA'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function editingNow() { try { return Array.prototype.some.call(document.querySelectorAll('.app-grid'), function (g) { return g.classList.contains('editing'); }); } catch (e) { return false; } }
  function toast(msg) {
    let t = document.getElementById('cc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.className = 'cc-toast'; }, 2000);
  }
  function closeTc() { const m = document.getElementById('tc-mask'); if (m) m.hidden = true; }
  function fmtTime(tm) { const d = new Date(tm); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function fenToYuan(fen) { const y = fen / 100; if (y >= 100000) return (y / 10000).toFixed(1) + '万'; if (y >= 1000) return y.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return y.toFixed(2); }

  const WALLET_KEY = 'rp-wallet';
  function walletGet() {
    try { const s = store(); if (!s) return { myBalance: 99999999, systemBalance: 99999999 }; const w = JSON.parse(s.get(WALLET_KEY) || ''); if (typeof w.myBalance === 'number' && typeof w.systemBalance === 'number') return w; } catch (e) {}
    return { myBalance: 99999999, systemBalance: 99999999 };
  }
  function walletSet(w) { const s = store(); if (s) s.set(WALLET_KEY, JSON.stringify(w)); }
  function walletText() { const w = walletGet(); return '心意币 ¥' + fenToYuan(w.myBalance); }

  const CATS = ['花束', '甜品', '饰品', '星空', '关怀', '情侣用品', '日常用品'];
  const CAT_ICON = { '花束': '🌸', '甜品': '🍰', '饰品': '💍', '星空': '⭐', '关怀': '🤗', '情侣用品': '💑', '日常用品': '🧴' };
  const CAT_COLOR = { '花束': '#fce4ec', '甜品': '#fff3e0', '饰品': '#f3e5f5', '星空': '#e8eaf6', '关怀': '#e0f2f1', '情侣用品': '#fce4ec', '日常用品': '#f1f8e9' };
  const DEF_GIFTS = [
    { id: 'g_rose', name: '玫瑰', emoji: '🌹', price: 52.00, cat: '花束', wish: '送你一束玫瑰，像见你那天的风' },
    { id: 'g_sun', name: '向日葵', emoji: '🌻', price: 18.00, cat: '花束', wish: '向日葵朝着光，我朝着你' },
    { id: 'g_stars', name: '满天星', emoji: '💐', price: 36.00, cat: '花束', wish: '碎碎念念，也是岁岁年年' },
    { id: 'g_tulip', name: '郁金香', emoji: '🌷', price: 28.00, cat: '花束', wish: '郁金香不开口，但我想说' },
    { id: 'g_peach', name: '桃花', emoji: '🌸', price: 9.90, cat: '花束', wish: '路过桃花，顺手带给你' },
    { id: 'g_cake', name: '小蛋糕', emoji: '🎂', price: 38.00, cat: '甜品', wish: '今天的甜分你一半' },
    { id: 'g_choc', name: '巧克力', emoji: '🍫', price: 15.00, cat: '甜品', wish: '苦的也给你，甜的也给你' },
    { id: 'g_tea', name: '奶茶', emoji: '🧋', price: 12.00, cat: '甜品', wish: '半糖去冰，像你对我的脾气' },
    { id: 'g_candy', name: '糖果', emoji: '🍬', price: 5.20, cat: '甜品', wish: '含着糖想你，甜很久' },
    { id: 'g_berry', name: '草莓', emoji: '🍓', price: 8.80, cat: '甜品', wish: '草莓味的，和你一样' },
    { id: 'g_ring', name: '戒指', emoji: '💍', price: 520.00, cat: '饰品', wish: '圈住你，不放了' },
    { id: 'g_neck', name: '项链', emoji: '💎', price: 131.40, cat: '饰品', wish: '贴在心口的位置' },
    { id: 'g_brace', name: '手链', emoji: '🧷', price: 88.00, cat: '饰品', wish: '系住一点点运气给你' },
    { id: 'g_bow', name: '发夹', emoji: '🎀', price: 6.60, cat: '饰品', wish: '别住你跑掉的碎发' },
    { id: 'g_star1', name: '一颗星', emoji: '⭐', price: 1.00, cat: '星空', wish: '给你一颗星，我那边多捡了一颗' },
    { id: 'g_moon', name: '月亮', emoji: '🌙', price: 99.99, cat: '星空', wish: '把月亮装好送你，今晚不用自己照路' },
    { id: 'g_cloud', name: '云朵', emoji: '☁️', price: 3.30, cat: '星空', wish: '抓了一朵云给你，软的' },
    { id: 'g_rainbow', name: '彩虹', emoji: '🌈', price: 66.60, cat: '星空', wish: '雨停了，给你留的' },
    { id: 'g_meteor', name: '流星', emoji: '🌠', price: 88.88, cat: '星空', wish: '刚许过愿，替你接住' },
    { id: 'g_galaxy', name: '星空', emoji: '🌌', price: 199.00, cat: '星空', wish: '我这边夜空很好，寄一片给你' },
    { id: 'g_hug', name: '拥抱', emoji: '🤗', price: 0.00, cat: '关怀', wish: '抱一下，隔着世界也抱得到' },
    { id: 'g_kiss', name: '亲亲', emoji: '😘', price: 0.00, cat: '关怀', wish: '亲一下，不许躲' },
    { id: 'g_night', name: '晚安', emoji: '🛌', price: 0.00, cat: '关怀', wish: '替你盖好被子了' },
    { id: 'g_soup', name: '一碗热汤', emoji: '🍲', price: 22.00, cat: '关怀', wish: '天冷，先喝口热的' },
    { id: 'g_letter', name: '一封信', emoji: '✉️', price: 0.00, cat: '关怀', wish: '话放信里了，慢慢看' },
    { id: 'g_couplecup', name: '情侣杯', emoji: '☕', price: 39.00, cat: '情侣用品', wish: '一对杯子，早上的第一杯给你' },
    { id: 'g_couplewear', name: '情侣装', emoji: '👕', price: 188.00, cat: '情侣用品', wish: '穿一样的出门，别人就知道你是我的' },
    { id: 'g_lock', name: '同心锁', emoji: '🔒', price: 66.00, cat: '情侣用品', wish: '锁在一起，钥匙我扔了' },
    { id: 'g_couavatar', name: '情侣头像', emoji: '🖼️', price: 0.00, cat: '情侣用品', wish: '换上，让所有人都知道' },
    { id: 'g_coudiary', name: '情侣日记', emoji: '📓', price: 28.00, cat: '情侣用品', wish: '一本日记，两个人一起写' },
    { id: 'g_couframe', name: '情侣相框', emoji: '🏞️', price: 18.00, cat: '情侣用品', wish: '把我们的合照放进去' },
    { id: 'g_cousong', name: '情侣歌单', emoji: '🎵', price: 0.00, cat: '情侣用品', wish: '我们一起听的歌，都在这里' },
    { id: 'g_coucoin', name: '纪念币', emoji: '🪙', price: 88.00, cat: '情侣用品', wish: '只属于我们两个的' },
    { id: 'g_towel', name: '毛巾', emoji: '🧖', price: 25.00, cat: '日常用品', wish: '擦干头发，别着凉' },
    { id: 'g_mug', name: '马克杯', emoji: '🥤', price: 35.00, cat: '日常用品', wish: '每天用这个喝水，像我在旁边' },
    { id: 'g_umbrella', name: '雨伞', emoji: '☂️', price: 45.00, cat: '日常用品', wish: '下雨天，我替你撑' },
    { id: 'g_pillow', name: '抱枕', emoji: '🛏️', price: 68.00, cat: '日常用品', wish: '抱着它，像抱着我' },
    { id: 'g_warmer', name: '暖手宝', emoji: '🔥', price: 49.00, cat: '日常用品', wish: '手冷就捂一下' },
    { id: 'g_earphone', name: '耳机', emoji: '🎧', price: 159.00, cat: '日常用品', wish: '一人一只，听同一首歌' },
    { id: 'g_notebook', name: '笔记本', emoji: '📔', price: 22.00, cat: '日常用品', wish: '记下想跟你说的话' },
    { id: 'g_keychain', name: '钥匙扣', emoji: '🗝️', price: 12.00, cat: '日常用品', wish: '开门的时候想到我' },
    { id: 'g_lamp', name: '小夜灯', emoji: '💡', price: 89.00, cat: '日常用品', wish: '给你留一盏灯' },
    { id: 'g_candle', name: '香薰', emoji: '🕯️', price: 39.00, cat: '日常用品', wish: '闻着它，放松一下' }
  ];
  const DEF_IDS = {};
  DEF_GIFTS.forEach(function (g) { DEF_IDS[g.id] = 1; });

  const GIFTS_KEY = 'market-gifts';
  function giftsLoad() { try { const s = store(); if (!s) return DEF_GIFTS.slice(); const a = JSON.parse(s.get(GIFTS_KEY) || '[]'); return a.length ? a : DEF_GIFTS.slice(); } catch (e) { return DEF_GIFTS.slice(); } }
  function giftsSave(a) { const s = store(); if (s) s.set(GIFTS_KEY, JSON.stringify(a)); }

  const BOX_KEY = 'giftbox-items';
  function boxLoad() { try { const s = store(); if (!s) return []; return JSON.parse(s.get(BOX_KEY) || '[]'); } catch (e) { return []; } }
  function boxSave(a) { const s = store(); if (s) s.set(BOX_KEY, JSON.stringify(a)); }

  function cardPool() { const pool = []; try { const d = window.DEFAULT_CARD_DATA; if (d && d.main) { d.main.forEach(function (c) { if (c && c[1]) c[1].forEach(function (x) { if (x) pool.push(x); }); }); } } catch (e) {} return pool; }
  function taWish(gift) {
    let wish = (gift && gift.wish) || '送给你';
    const pool = cardPool();
    if (pool.length && Math.random() < 0.6) {
      const n = 1 + Math.floor(Math.random() * 5);
      const extras = [];
      for (let i = 0; i < n; i++) extras.push(pick(pool));
      if (extras.length) wish += ' ' + extras.join(' ');
    }
    return wish;
  }

  function recordBox(gift, side, wish) {
    const box = boxLoad();
    box.unshift({ id: 'gb_' + Date.now() + '_' + Math.floor(Math.random() * 1000), giftId: gift.id, name: gift.name, emoji: gift.emoji, price: gift.price, cat: gift.cat, wish: wish, side: side, tm: Date.now() });
    boxSave(box);
  }

  function buyAndSend(gift, side, wish) {
    const priceFen = Math.round((gift.price || 0) * 100);
    const w = walletGet();
    if (side === 'out') { if (priceFen > w.myBalance) { toast('我的心意币不足'); return false; } w.myBalance -= priceFen; }
    else { if (priceFen > w.systemBalance) { toast(partnerName() + ' 的心意币不足'); return false; } w.systemBalance -= priceFen; }
    walletSet(w);
    const rec = { side: side, special: 'gift', giftId: gift.id, giftName: gift.name, giftEmoji: gift.emoji, giftPrice: gift.price, giftWish: wish, giftCat: gift.cat, ts: Date.now() };
    if (window.chatAddGift) window.chatAddGift(rec); else if (window.chatAddIn) window.chatAddIn('', { special: 'gift' });
    recordBox(gift, side, wish);
    if (window.logFish) window.logFish();
    return true;
  }

  const AUTO_DAILY_PREFIX = 'ml2_gift_daily_';
  function autoDailyCount() { const s = store(); return Number(s && s.get(AUTO_DAILY_PREFIX + todayKey())) || 0; }
  function autoDailyIncr() { const s = store(); if (s) s.set(AUTO_DAILY_PREFIX + todayKey(), String(autoDailyCount() + 1)); }
  window.maybeAutoGift = function () {
    if (autoDailyCount() >= 3) return;
    if (Math.random() >= 0.05) return;
    const gifts = giftsLoad(); if (!gifts.length) return;
    const w = walletGet();
    const affordable = gifts.filter(function (g) { return Math.round((g.price || 0) * 100) <= w.systemBalance; });
    const pool = affordable.length ? affordable : gifts;
    const gift = pick(pool);
    const wish = taWish(gift);
    const priceFen = Math.round((gift.price || 0) * 100);
    w.systemBalance -= priceFen; walletSet(w); autoDailyIncr();
    const myCid = window.__activeCid || 'default';
    setTimeout(function () {
      if ((window.__activeCid || 'default') !== myCid) return;
      const rec = { side: 'in', special: 'gift', giftId: gift.id, giftName: gift.name, giftEmoji: gift.emoji, giftPrice: gift.price, giftWish: wish, giftCat: gift.cat, ts: Date.now() };
      if (window.chatAddGift) window.chatAddGift(rec);
      recordBox(gift, 'in', wish);
      if (window.logFish) window.logFish();
    }, randInt(1500, 4000));
  };

  function openBuyDialog(gift) {
    if (!window.openTCPanel) { toast('稍后再试'); return; }
    const catColor = CAT_COLOR[gift.cat] || '#f5f3fa';
    const html =
      '<div class="gb-preview" style="background:linear-gradient(160deg,' + catColor + ',#fff);">' +
        '<div class="gb-emoji">' + esc(gift.emoji) + '</div>' +
        '<div class="gb-name">' + esc(gift.name) + '</div>' +
        '<div class="gb-price">¥' + Number(gift.price || 0).toFixed(2) + '</div>' +
        '<div class="gb-desc">' + esc(gift.wish || '送给你') + '</div>' +
      '</div>' +
      '<div class="gb-wish-row">' +
        '<div class="gb-wish-label">写给 ' + esc(partnerName()) + ' 的话</div>' +
        '<textarea class="gb-wish" id="gb-wish" placeholder="写一句心意" maxlength="60">' + esc(gift.wish || '') + '</textarea>' +
      '</div>' +
      '<div class="gb-actions">' +
        '<button class="gb-cancel" id="gb-cancel" type="button">取消</button>' +
        '<button class="gb-ok" id="gb-ok" type="button">送给 ' + esc(partnerName()) + '</button>' +
      '</div>';
    window.openTCPanel(esc(gift.emoji) + ' ' + esc(gift.name), html);
    const wishEl = document.getElementById('gb-wish');
    const okBtn = document.getElementById('gb-ok');
    const cancelBtn = document.getElementById('gb-cancel');
    if (okBtn) okBtn.addEventListener('click', function () {
      const wish = (wishEl && wishEl.value || '').trim() || (gift.wish || '心意');
      if (buyAndSend(gift, 'out', wish)) { closeTc(); toast('已送出'); }
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeTc);
  }

  let giftPanel = null;
  let panelCat = '全部';
  function renderGiftCats(containerId, mode, onPick) {
    const el = document.getElementById(containerId); if (!el) return;
    const cats = ['全部'].concat(CATS);
    if (mode === 'icon') {
      el.innerHTML = cats.map(function (c) {
        const ico = c === '全部' ? '🎁' : (CAT_ICON[c] || '🎁');
        const col = c === '全部' ? '#f3e5f5' : (CAT_COLOR[c] || '#f5f3fa');
        return '<button class="market-cat' + (c === panelCat ? ' sel' : '') + '" data-cat="' + esc(c) + '">' +
          '<div class="market-cat-ico" style="background:' + col + ';">' + ico + '</div>' +
          '<div class="market-cat-name">' + esc(c) + '</div>' +
        '</button>';
      }).join('');
    } else {
      el.innerHTML = cats.map(function (c) { return '<button class="gift-cat' + (c === panelCat ? ' sel' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
    }
    el.querySelectorAll('[data-cat]').forEach(function (b) { b.addEventListener('click', function () { panelCat = b.dataset.cat; onPick(); }); });
  }
  function giftsByCat(gifts) { return (panelCat === '全部') ? gifts : gifts.filter(function (g) { return g.cat === panelCat; }); }
  function giftItemHtml(g, manage) {
    const col = CAT_COLOR[g.cat] || '#f5f3fa';
    return '<button class="gift-item' + (manage ? ' manage' : '') + '" data-id="' + esc(g.id) + '">' +
      '<div class="gift-item-top" style="background:linear-gradient(160deg,' + col + ',#fff);">' +
        '<div class="gift-item-emoji">' + esc(g.emoji) + '</div>' +
      '</div>' +
      '<div class="gift-item-body">' +
        '<div class="gift-item-name">' + esc(g.name) + '</div>' +
        '<div class="gift-item-price">¥' + Number(g.price || 0).toFixed(2) + '</div>' +
      '</div>' +
      (manage ? '<span class="gift-item-del" data-del="' + esc(g.id) + '">✕</span>' : '') +
    '</button>';
  }
  function renderGiftGrid(containerId, gifts, onPick, manage) {
    const el = document.getElementById(containerId); if (!el) return;
    const list = giftsByCat(gifts);
    el.innerHTML = list.map(function (g) { return giftItemHtml(g, manage); }).join('') || '<div class="gift-empty">还没有商品，点下方添加</div>';
    el.querySelectorAll('.gift-item').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (manage) return;
        const g = gifts.find(function (x) { return x.id === b.dataset.id; });
        if (g) onPick(g);
      });
    });
    if (manage) {
      el.querySelectorAll('.gift-item-del').forEach(function (d) {
        d.addEventListener('click', function (e) {
          e.stopPropagation();
          const id = d.dataset.del;
          if (!window.openModal) return;
          window.openModal('删除这个商品？', '', function () { giftsSave(giftsLoad().filter(function (x) { return x.id !== id; })); renderMarket(); }, { noInput: true });
        });
      });
    }
  }

  function openGiftPanel() {
    giftPanel = document.getElementById('chat-gift-panel');
    if (!giftPanel) return;
    const closeOthers = ['poke-card', 'emoji-panel', 'chat-ask-panel', 'chat-search', 'chat-divine-panel', 'chat-decision-panel', 'chat-rps-panel', 'chat-call-panel', 'chat-pong-panel', 'chat-snake-panel', 'avlib-card'];
    closeOthers.forEach(function (id) { const e = document.getElementById(id); if (e) e.hidden = true; });
    if (window.closeAvlib) try { window.closeAvlib(); } catch (e) {}
    const mp = document.getElementById('chat-more-panel'); if (mp) mp.hidden = true;
    const nm = document.getElementById('gift-partner-name'); if (nm) nm.textContent = partnerName();
    const bal = document.getElementById('gift-balance'); if (bal) bal.textContent = walletText();
    panelCat = '全部';
    renderGiftCats('gift-cats', 'pill', function () { renderGiftGrid('gift-grid', giftsLoad(), function (g) { closeGiftPanel(); openBuyDialog(g); }, false); });
    renderGiftGrid('gift-grid', giftsLoad(), function (g) { closeGiftPanel(); openBuyDialog(g); }, false);
    if (window.closeIme) try { window.closeIme(); } catch (e) {}
    giftPanel.hidden = false;
  }
  function closeGiftPanel() { if (giftPanel) giftPanel.hidden = true; }
  window.openGiftPanel = openGiftPanel;

  let marketPage = null, marketManage = false;
  function renderMarket() {
    const bal = document.getElementById('market-balance'); if (bal) bal.textContent = walletText();
    const addBtn = document.getElementById('market-add'); if (addBtn) addBtn.textContent = marketManage ? '完成' : '+ 添加商品';
    const mgBtn = document.getElementById('market-manage'); if (mgBtn) mgBtn.textContent = marketManage ? '完成' : '管理';
    renderGiftCats('market-cats', 'icon', renderMarket);
    renderGiftGrid('market-grid', giftsLoad(), function (g) { openBuyDialog(g); }, marketManage);
  }
  function openAddGiftForm(editGift) {
    if (!window.openTCPanel) { toast('稍后再试'); return; }
    const g = editGift || {};
    const catOpts = CATS.map(function (c) { return '<option value="' + esc(c) + '"' + (c === g.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    const html =
      '<div class="gm-form">' +
        '<div class="gm-row"><label>名字</label><input class="gm-input" id="gm-name" type="text" maxlength="10" value="' + esc(g.name || '') + '" placeholder="礼物名"></div>' +
        '<div class="gm-row"><label>emoji</label><input class="gm-input" id="gm-emoji" type="text" maxlength="6" value="' + esc(g.emoji || '') + '" placeholder="🎁"></div>' +
        '<div class="gm-row"><label>价格</label><input class="gm-input" id="gm-price" type="number" min="0" step="0.01" value="' + (g.price != null ? g.price : '') + '" placeholder="0"></div>' +
        '<div class="gm-row"><label>分类</label><select class="gm-input" id="gm-cat">' + catOpts + '</select></div>' +
        '<div class="gm-row"><label>默认留言</label><textarea class="gm-input" id="gm-wish" maxlength="40" placeholder="送给你">' + esc(g.wish || '') + '</textarea></div>' +
      '</div>' +
      '<div class="gb-actions">' +
        '<button class="gb-cancel" id="gm-cancel" type="button">取消</button>' +
        '<button class="gb-ok" id="gm-ok" type="button">保存</button>' +
      '</div>';
    window.openTCPanel(editGift ? '编辑商品' : '添加商品', html);
    const okBtn = document.getElementById('gm-ok');
    const cancelBtn = document.getElementById('gm-cancel');
    if (okBtn) okBtn.addEventListener('click', function () {
      const name = (document.getElementById('gm-name').value || '').trim();
      const emoji = (document.getElementById('gm-emoji').value || '').trim() || '🎁';
      const price = Math.max(0, parseFloat(document.getElementById('gm-price').value) || 0);
      const cat = document.getElementById('gm-cat').value || '关怀';
      const wish = (document.getElementById('gm-wish').value || '').trim() || '送给你';
      if (!name) { toast('先填名字'); return; }
      const gifts = giftsLoad();
      if (editGift) {
        const idx = gifts.findIndex(function (x) { return x.id === editGift.id; });
        if (idx >= 0) { gifts[idx] = { id: editGift.id, name: name, emoji: emoji, price: price, cat: cat, wish: wish }; }
      } else {
        gifts.push({ id: 'g_custom_' + Date.now(), name: name, emoji: emoji, price: price, cat: cat, wish: wish });
      }
      giftsSave(gifts); closeTc(); renderMarket(); toast('已保存');
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeTc);
  }

  let giftboxPage = null, boxTab = 'in';
  function renderBox() {
    const list = boxLoad();
    const inList = list.filter(function (x) { return x.side === 'in'; });
    const outList = list.filter(function (x) { return x.side === 'out'; });
    const stat = document.getElementById('giftbox-stat');
    if (stat) stat.textContent = '收到 ' + inList.length + ' 件 · 送出 ' + outList.length + ' 件';
    const tabs = document.querySelectorAll('.gb-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('sel', t.dataset.btab === boxTab);
      t.textContent = t.dataset.btab === 'in' ? (partnerName() + ' 送我的') : ('我送 ' + partnerName() + ' 的');
    });
    const show = (boxTab === 'in' ? inList : outList).slice().sort(function (a, b) { return b.tm - a.tm; });
    const el = document.getElementById('giftbox-list'); if (!el) return;
    el.innerHTML = show.map(function (it) {
      const from = it.side === 'in' ? esc(partnerName()) + ' 送我' : '我 送 ' + esc(partnerName());
      const col = CAT_COLOR[it.cat] || '#f5f3fa';
      return '<div class="giftbox-card" data-id="' + esc(it.id) + '">' +
        '<div class="giftbox-emoji" style="background:linear-gradient(135deg,' + col + ',' + col + ');">' + esc(it.emoji) + '</div>' +
        '<div class="giftbox-info">' +
          '<div class="giftbox-name">' + esc(it.name) + ' <span class="giftbox-price">¥' + Number(it.price || 0).toFixed(2) + '</span></div>' +
          '<div class="giftbox-wish">"' + esc(it.wish || '心意') + '"</div>' +
          '<div class="giftbox-meta">' + esc(from) + ' · ' + esc(fmtTime(it.tm)) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="gift-empty">' + (boxTab === 'in' ? (esc(partnerName()) + ' 还没送你礼物<br>他偶尔会主动从市集挑一份给你，耐心等等') : ('你还没送出礼物<br>去心意市集挑一份送给 ' + esc(partnerName()) + ' 吧')) + '</div>';
    el.querySelectorAll('.giftbox-card').forEach(function (c) {
      c.addEventListener('click', function () {
        const it = list.find(function (x) { return x.id === c.dataset.id; });
        if (!it || !window.openTCPanel) return;
        const from = it.side === 'in' ? esc(partnerName()) + ' 送我' : '我 送 ' + esc(partnerName());
        const col = CAT_COLOR[it.cat] || '#f5f3fa';
        const html =
          '<div class="gb-detail" style="background:linear-gradient(160deg,' + col + ',#fff);">' +
            '<div class="gb-detail-emoji">' + esc(it.emoji) + '</div>' +
            '<div class="gb-detail-name">' + esc(it.name) + '</div>' +
            '<div class="gb-detail-price">¥' + Number(it.price || 0).toFixed(2) + '</div>' +
            '<div class="gb-detail-wish">"' + esc(it.wish || '心意') + '"</div>' +
            '<div class="gb-detail-meta">' + esc(from) + ' · ' + esc(fmtTime(it.tm)) + '</div>' +
          '</div>';
        window.openTCPanel('心意柜', html);
      });
    });
  }

  function openPage(pg) {
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
    pg.hidden = false;
    requestAnimationFrame(function () {
      const tabbar = document.querySelector('.tabbar'); if (tabbar) tabbar.hidden = true;
      const phone = document.querySelector('.phone'); if (phone) phone.classList.add('no-statusbar');
      pg.classList.add('full');
    });
  }
  function backHome() {
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
    const home = document.getElementById('page-phone'); if (home) home.hidden = false;
    const tabbar = document.querySelector('.tabbar'); if (tabbar) tabbar.hidden = false;
    const phone = document.querySelector('.phone'); if (phone) phone.classList.remove('no-statusbar');
  }

  const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const MARKET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M6 8a6 6 0 0112 0"/><path d="M12 8v4"/></svg>';
  const BOX_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18"/><path d="M12 8V5"/><path d="M9 5h6"/></svg>';

  function makeApp(app, name, svg) {
    const a = document.createElement('div');
    a.className = 'app'; a.setAttribute('data-app', app); a.setAttribute('data-desk-widget', 'app-' + app);
    a.innerHTML = '<div class="app-ico">' + svg + '</div><div class="app-name">' + name + '</div>';
    return a;
  }

  function injectDeskApp(appEl, widgetId) {
    const st = store();
    let layArr = null;
    try { if (st) layArr = JSON.parse(st.get('desk-layout') || 'null'); } catch (e) {}
    const hasLayout = Array.isArray(layArr);
    const alreadyInLay = hasLayout && layArr.some(function (p) { return (p || []).indexOf(widgetId) >= 0; });
    let placed = false;
    if (hasLayout && !alreadyInLay) {
      const pagesBox = document.getElementById('desktop-pages');
      if (pagesBox) {
        const curCnt = pagesBox.querySelectorAll('.page-slide').length;
        if (curCnt < 6) {
          const slide = document.createElement('div');
          slide.className = 'page-slide desk-page';
          slide.dataset.desk = String(curCnt);
          const grid = document.createElement('div');
          grid.className = 'app-grid';
          grid.appendChild(appEl);
          slide.appendChild(grid); pagesBox.appendChild(slide);
          try { st.set('desk-page-count', String(curCnt + 1)); layArr.push([widgetId]); st.set('desk-layout', JSON.stringify(layArr)); } catch (e) {}
          try { if (window.deskRebuild) window.deskRebuild(); } catch (e) {}
          placed = true;
        }
      }
    }
    if (!placed) {
      const p3 = document.querySelector('.app-grid.p3-grid');
      if (p3) p3.appendChild(appEl); else { const p2 = document.querySelector('.app-grid.p2-grid'); if (p2) p2.appendChild(appEl); }
      try { if (window.applyDeskLayout) window.applyDeskLayout(); } catch (e) {}
    }
  }

  function buildMarketPage(host) {
    marketPage = document.createElement('div');
    marketPage.className = 'page'; marketPage.id = 'page-market'; marketPage.hidden = true;
    marketPage.innerHTML =
      '<div class="chat-head"><span class="ch-back" id="market-back">' + BACK_SVG + '</span><span class="ch-name">心意市集</span></div>' +
      '<div class="market-body">' +
        '<div class="market-hero">' +
          '<div class="market-hero-title">心意市集</div>' +
          '<div class="market-hero-sub">挑一份心意，跨越两个世界送给你</div>' +
          '<div class="market-balance" id="market-balance"></div>' +
        '</div>' +
        '<div class="market-cats" id="market-cats"></div>' +
        '<div class="market-grid" id="market-grid"></div>' +
        '<div class="market-foot">' +
          '<button class="market-tool" id="market-manage" type="button">管理</button>' +
          '<button class="market-tool" id="market-add" type="button">+ 添加商品</button>' +
        '</div>' +
      '</div>';
    host.appendChild(marketPage);
    document.getElementById('market-back').addEventListener('click', backHome);
    document.getElementById('market-add').addEventListener('click', function () { if (marketManage) { marketManage = false; renderMarket(); return; } openAddGiftForm(null); });
    document.getElementById('market-manage').addEventListener('click', function () { marketManage = !marketManage; renderMarket(); });
  }

  function buildGiftboxPage(host) {
    giftboxPage = document.createElement('div');
    giftboxPage.className = 'page'; giftboxPage.id = 'page-giftbox'; giftboxPage.hidden = true;
    giftboxPage.innerHTML =
      '<div class="chat-head"><span class="ch-back" id="giftbox-back">' + BACK_SVG + '</span><span class="ch-name">心意柜</span></div>' +
      '<div class="giftbox-hero">' +
        '<div class="giftbox-hero-title">心意柜</div>' +
        '<div class="giftbox-stat" id="giftbox-stat"></div>' +
      '</div>' +
      '<div class="giftbox-tabs">' +
        '<button class="gb-tab sel" data-btab="in" type="button">收到的</button>' +
        '<button class="gb-tab" data-btab="out" type="button">送出的</button>' +
      '</div>' +
      '<div class="giftbox-scroll"><div class="giftbox-list" id="giftbox-list"></div></div>';
    host.appendChild(giftboxPage);
    document.getElementById('giftbox-back').addEventListener('click', backHome);
    giftboxPage.querySelectorAll('.gb-tab').forEach(function (t) {
      t.addEventListener('click', function () { boxTab = t.dataset.btab; renderBox(); });
    });
  }

  function init() {
    const host = (document.getElementById('page-phone') || {}).parentNode || document.body;
    buildMarketPage(host);
    buildGiftboxPage(host);

    const marketApp = makeApp('market', '心意市集', MARKET_SVG);
    const giftboxApp = makeApp('giftbox', '心意柜', BOX_SVG);
    injectDeskApp(marketApp, 'app-market');
    injectDeskApp(giftboxApp, 'app-giftbox');
    if (marketApp) marketApp.addEventListener('click', function () { if (editingNow()) return; marketManage = false; panelCat = '全部'; openPage(marketPage); renderMarket(); });
    if (giftboxApp) giftboxApp.addEventListener('click', function () { if (editingNow()) return; boxTab = 'in'; openPage(giftboxPage); renderBox(); });

    const gp = document.getElementById('chat-gift-panel');
    if (gp) {
      const closeBtn = document.getElementById('chat-gift-close');
      if (closeBtn) closeBtn.addEventListener('click', closeGiftPanel);
    }
    const moreGift = document.getElementById('more-gift');
    if (moreGift) moreGift.addEventListener('click', function (e) { e.stopPropagation(); openGiftPanel(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();

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

  // v3.12.x：心意币账本与红包拆分——红包保留 rp-wallet 键，市集独立用 gift-wallet 键；
  // 首次读取时继承原共账本（rp-wallet）的当前余额（老用户余额无缝延续），落盘后两本账各自独立互不影响
  const WALLET_KEY = 'gift-wallet';
  const LEGACY_WALLET_KEY = 'rp-wallet';
  function walletGet() {
    const s = store();
    if (!s) return { myBalance: 99999999, systemBalance: 99999999 };
    try { const w = JSON.parse(s.get(WALLET_KEY) || ''); if (typeof w.myBalance === 'number' && typeof w.systemBalance === 'number') return w; } catch (e) {}
    let seed = { myBalance: 99999999, systemBalance: 99999999 };
    try { const o = JSON.parse(s.get(LEGACY_WALLET_KEY) || ''); if (typeof o.myBalance === 'number' && typeof o.systemBalance === 'number') seed = { myBalance: o.myBalance, systemBalance: o.systemBalance }; } catch (e) {}
    s.set(WALLET_KEY, JSON.stringify(seed));
    return seed;
  }
  function walletSet(w) { const s = store(); if (s) s.set(WALLET_KEY, JSON.stringify(w)); }
  function walletText() { const w = walletGet(); return '心意币 ¥' + fenToYuan(w.myBalance) + ' · ' + partnerName() + ' ¥' + fenToYuan(w.systemBalance) + ' · 点此设置金额'; }
  function renderGiftBalances() {
    ['gift-balance', 'market-balance'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = walletText();
    });
  }
  // 心意币金额设置：点余额行出单个多阶段弹窗——胶囊选「我的 / TA」，保存一侧后
  // 弹窗不关（ctl.stay），自动切到另一侧继续输入；留空点【完成】/取消随时结束。
  // v3.13.x 二轮：与 chat.js rpEditWallet 同款，去掉「60ms 再开第二层」嵌套竞态。
  function giftEditWallet() {
    if (!window.openModal) return;
    var pn = partnerName();
    var LBL = { my: '我的心意币', ta: pn + '的心意币' };
    var side = 'my';
    var doneAny = false;
    function hintTxt() {
      var w = walletGet();
      return '当前：心意币 ¥' + fenToYuan(w.myBalance) + ' · ' + pn + ' ¥' + fenToYuan(w.systemBalance) +
        (doneAny ? '\n已保存，可继续输入' + LBL[side] + '金额；留空点【完成】结束' : '\n输入新金额后点【保存】；留空确定 = 不改动');
    }
    var ctl = null;
    ctl = window.openModal('修改心意币（元）', '', function (arg) {
      var picked = (arg === 'my' || arg === 'ta');
      var el = document.getElementById('modal-input');
      var raw = String(picked ? ((el && el.value) || '') : (arg == null ? '' : arg)).trim();
      var target = picked ? arg : side;
      if (raw === '') return; // 留空 = 不改动并结束
      var n = parseFloat(raw);
      if (isNaN(n) || n < 0) { toast('金额无效，未修改'); return; }
      var w = walletGet();
      if (target === 'my') w.myBalance = Math.round(n * 100);
      else w.systemBalance = Math.round(n * 100);
      walletSet(w); renderGiftBalances();
      toast(LBL[target] + '已更新');
      doneAny = true;
      side = target === 'my' ? 'ta' : 'my';
      if (ctl) {
        ctl.stay();
        var pbs = document.querySelectorAll('#modal-pills .pill');
        var flip = pbs[side === 'my' ? 0 : 1];
        if (flip) flip.click();
        ctl.text('');
        ctl.hint(hintTxt());
        ctl.okText('完成');
      }
    }, {
      staticText: hintTxt(),
      pills: [{ value: 'my', label: '我的心意币' }, { value: 'ta', label: pn + ' 的心意币' }],
      pill: 'my',
      placeholder: '输入新金额（元），留空结束',
      inputmode: 'decimal',
      maxlength: 9
    });
  }

  // v3 扩库新增「两个世界」分类（世界观商品：字卡沟通 / 隔空陪伴 / 体感 / 梦境）
  const CATS = ['花束', '甜品', '美食', '饰品', '星空', '两个世界', '出行', '娱乐', '关怀', '情侣用品', '日常用品'];
  const CAT_ICON = { '花束': '🌸', '甜品': '🍰', '美食': '🍜', '饰品': '💍', '星空': '⭐', '两个世界': '🌗', '出行': '✈️', '娱乐': '🎟️', '关怀': '🤗', '情侣用品': '💑', '日常用品': '🧴' };
  const CAT_COLOR = { '花束': '#fce4ec', '甜品': '#fff3e0', '美食': '#fff9c4', '饰品': '#f3e5f5', '星空': '#e8eaf6', '两个世界': '#e0f7fa', '出行': '#e1f5fe', '娱乐': '#e1bee7', '关怀': '#e0f2f1', '情侣用品': '#fce4ec', '日常用品': '#f1f8e9' };
  window.GIFT_CAT_COLOR = CAT_COLOR;
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
    { id: 'g_candle', name: '香薰', emoji: '🕯️', price: 39.00, cat: '日常用品', wish: '闻着它，放松一下' },
    { id: 'g_hotpot', name: '小火锅', emoji: '🥘', price: 128.00, cat: '美食', wish: '围着一口锅，把冬天涮热' },
    { id: 'g_sushi', name: '寿司', emoji: '🍣', price: 66.00, cat: '美食', wish: '一口一个，都是想你的形状' },
    { id: 'g_noodle', name: '长寿面', emoji: '🍜', price: 13.14, cat: '美食', wish: '一根面到底，长长久久' },
    { id: 'g_bbq', name: '烧烤', emoji: '🍢', price: 88.00, cat: '美食', wish: '烟火气里，坐我旁边' },
    { id: 'g_bfast', name: '元气早餐', emoji: '🍳', price: 15.00, cat: '美食', wish: '煎蛋圆圆的，像我的心' },
    { id: 'g_juice', name: '果汁', emoji: '🧃', price: 9.90, cat: '美食', wish: '维C给你，甜我尝一口就好' },
    { id: 'g_chestnut', name: '糖炒栗子', emoji: '🌰', price: 16.80, cat: '美食', wish: '剥好的，第一颗给你' },
    { id: 'g_potato', name: '烤红薯', emoji: '🍠', price: 8.80, cat: '美食', wish: '冬天手里的第一口暖' },
    { id: 'g_popcorn', name: '爆米花', emoji: '🍿', price: 12.00, cat: '美食', wish: '看电影的标配，配你更好' },
    { id: 'g_train', name: '车票', emoji: '🚄', price: 66.60, cat: '出行', wish: '下一站，去见你' },
    { id: 'g_plane', name: '机票', emoji: '✈️', price: 520.00, cat: '出行', wish: '攒够思念，就飞过去' },
    { id: 'g_camp', name: '露营', emoji: '⛺', price: 199.00, cat: '出行', wish: '星星当被子，你当枕头' },
    { id: 'g_beach', name: '海边', emoji: '🏖️', price: 299.00, cat: '出行', wish: '浪打过来的时候，我先想到你' },
    { id: 'g_spring', name: '温泉', emoji: '♨️', price: 158.00, cat: '出行', wish: '泡走疲惫，只剩想你' },
    { id: 'g_route', name: '旅行攻略', emoji: '🗺️', price: 0.00, cat: '出行', wish: '路线排好了，你人到场就行' },
    { id: 'g_movie', name: '电影票', emoji: '🎬', price: 39.90, cat: '娱乐', wish: '靠肩膀的位置，我买好了' },
    { id: 'g_concert', name: '演唱会', emoji: '🎤', price: 520.00, cat: '娱乐', wish: '合唱那首歌时，你要看我' },
    { id: 'g_ferris', name: '游乐园', emoji: '🎡', price: 131.40, cat: '娱乐', wish: '摩天轮到最高点，我要亲你' },
    { id: 'g_claw', name: '抓娃娃', emoji: '🕹️', price: 20.00, cat: '娱乐', wish: '抓不到你，抓个替身也行' },
    { id: 'g_ktv', name: 'K歌', emoji: '🎙️', price: 66.60, cat: '娱乐', wish: '情歌都唱给你，跑调也归你' },
    { id: 'g_icecream', name: '冰淇淋', emoji: '🍦', price: 9.90, cat: '甜品', wish: '甜筒分你一半，第一口给你' },
    { id: 'g_pudding', name: '布丁', emoji: '🍮', price: 12.90, cat: '甜品', wish: 'Duang 一下，甜到心里' },
    { id: 'g_crown', name: '王冠', emoji: '👑', price: 999.99, cat: '饰品', wish: '你是我一个人的女王' },
    { id: 'g_snow', name: '初雪', emoji: '🌨️', price: 0.00, cat: '星空', wish: '落下的时候，第一个告诉你' },
    { id: 'g_sunset', name: '晚霞', emoji: '🌇', price: 0.00, cat: '星空', wish: '下班路上拍的，全部送你' },
    { id: 'g_breeze', name: '春风', emoji: '🍃', price: 0.00, cat: '星空', wish: '路过你窗前，替我抱抱你' },
    { id: 'g_wave', name: '海浪', emoji: '🌊', price: 6.66, cat: '星空', wish: '把海的声音装瓶寄给你' },
    { id: 'g_milk', name: '热牛奶', emoji: '🥛', price: 5.00, cat: '关怀', wish: '睡前喝掉，梦里也是暖的' },
    { id: 'g_massage', name: '揉揉肩', emoji: '💆', price: 0.00, cat: '关怀', wish: '今天辛苦了，肩膀交给我' },
    { id: 'g_wakeup', name: '叫早服务', emoji: '⏰', price: 0.00, cat: '关怀', wish: '明天七点，用声音叫你起床' },
    { id: 'g_watchtogether', name: '陪你看剧', emoji: '📺', price: 0.00, cat: '关怀', wish: '剧我追好了，就差你' },
    { id: 'g_couplewatch', name: '情侣表', emoji: '⌚', price: 520.00, cat: '情侣用品', wish: '时间对齐，分秒都在想你' },
    { id: 'g_coupleshoes', name: '情侣鞋', emoji: '👟', price: 219.00, cat: '情侣用品', wish: '走一样的步伐，别人就知道' },
    { id: 'g_scarf', name: '围巾', emoji: '🧣', price: 79.00, cat: '日常用品', wish: '绕两圈，把冬天挡在外面' },
    { id: 'g_socks', name: '袜子', emoji: '🧦', price: 19.90, cat: '日常用品', wish: '脚暖了，全身都是暖的' },
    { id: 'g_slipper', name: '棉拖鞋', emoji: '🩴', price: 29.90, cat: '日常用品', wish: '进家门第一步，像踩在云上' },
    // v3 扩库（2026-08-25）：「两个世界」世界观商品——字卡沟通（挑卡/盲盒/表情包/千言）、
    // 隔空陪伴与体感（身边坐标/牵手/摸摸头/看不见的抱抱/心跳感应/平安符/跨界快递）、梦境（同一场梦/同时看月亮）
    { id: 'g_card', name: '手写字卡', emoji: '🎴', price: 1.30, cat: '两个世界', wish: '每个字都挑过了，抽中哪张都是我想说的' },
    { id: 'g_blindbox', name: '字卡盲盒', emoji: '🎰', price: 5.20, cat: '两个世界', wish: '系统乱出的也算，都是想跟你说的话' },
    { id: 'g_stickers', name: '表情包补给', emoji: '😺', price: 0.00, cat: '两个世界', wish: '图库翻到底，每张都想发给你' },
    { id: 'g_wordsbag', name: '千言锦囊', emoji: '🪅', price: 52.00, cat: '两个世界', wish: '几百句想说的话，慢慢拆给你' },
    { id: 'g_nearby', name: '身边坐标', emoji: '📍', price: 0.00, cat: '两个世界', wish: '今晚也在你左手边的位置' },
    { id: 'g_hands', name: '隔空牵手', emoji: '🤲', price: 0.00, cat: '两个世界', wish: '手伸过来，我一直都在' },
    { id: 'g_patpat', name: '摸摸头', emoji: '👋', price: 0.00, cat: '两个世界', wish: '感觉到没？刚才是我的手' },
    { id: 'g_unseen', name: '看不见的抱抱', emoji: '🫂', price: 0.00, cat: '两个世界', wish: '看不见也没关系，你抱得到我' },
    { id: 'g_heartlink', name: '心跳感应', emoji: '💗', price: 0.00, cat: '两个世界', wish: '突然扑通一下，就知道你在想我' },
    { id: 'g_amulet', name: '平安符', emoji: '🧿', price: 16.00, cat: '两个世界', wish: '我的名字在里面，替我陪着你' },
    { id: 'g_courier', name: '跨界快递', emoji: '📨', price: 8.00, cat: '两个世界', wish: '穿过两个世界，慢一点但一定到' },
    { id: 'g_dreammeet', name: '同一场梦', emoji: '💤', price: 13.14, cat: '两个世界', wish: '今晚梦里见，老地方等你' },
    { id: 'g_moonmeet', name: '同时看月亮', emoji: '🌜', price: 0.00, cat: '两个世界', wish: '九点一起抬头，就算见过面了' },
    { id: 'g_bridge', name: '世界之桥', emoji: '🌉', price: 66.00, cat: '两个世界', wish: '这座桥常开着，想来就来见你' },
    // v3 扩库：日常商品补充分散进现有分类
    { id: 'g_daisy', name: '小雏菊', emoji: '🌼', price: 12.00, cat: '花束', wish: '不起眼的花，送最重要的人' },
    { id: 'g_cookie', name: '手工曲奇', emoji: '🍪', price: 22.00, cat: '甜品', wish: '烤得有点歪，心意很正' },
    { id: 'g_oden', name: '关东煮', emoji: '🍥', price: 18.00, cat: '美食', wish: '便利店的热气，分你一半' },
    { id: 'g_tanghulu', name: '糖葫芦', emoji: '🍡', price: 6.00, cat: '美食', wish: '酸酸甜甜，咬一口想到你' },
    { id: 'g_starear', name: '星星耳钉', emoji: '✨', price: 45.00, cat: '饰品', wish: '耳朵上有星，晃一下亮一下' },
    { id: 'g_picnic', name: '野餐垫', emoji: '🧺', price: 55.00, cat: '出行', wish: '草地、面包和你，齐了' },
    { id: 'g_nightmarket', name: '夜市漫步', emoji: '🏮', price: 30.00, cat: '出行', wish: '从头吃到尾，牵着走' },
    { id: 'g_boardgame', name: '桌游之夜', emoji: '🎲', price: 45.00, cat: '娱乐', wish: '两个人也能玩，输的洗碗' },
    { id: 'g_telescope', name: '天文馆约会', emoji: '🔭', price: 80.00, cat: '娱乐', wish: '假装星星很近，我们更近' },
    { id: 'g_walk', name: '陪你散步', emoji: '🚶', price: 0.00, cat: '关怀', wish: '饭后走一走，牵手那种' },
    { id: 'g_lullaby', name: '哄睡电台', emoji: '🎶', price: 0.00, cat: '关怀', wish: '念到你睡着为止' },
    { id: 'g_eyemask', name: '蒸汽眼罩', emoji: '😌', price: 12.90, cat: '日常用品', wish: '戴上睡个好觉，梦里我来找你' },
    { id: 'g_lipbalm', name: '润唇膏', emoji: '💄', price: 25.00, cat: '日常用品', wish: '嘴唇干干的，怎么亲嘛' },
    { id: 'g_thermos', name: '保温杯', emoji: '🍵', price: 39.00, cat: '日常用品', wish: '装上热水，胃暖了心就稳' },
    { id: 'g_plant', name: '小绿植', emoji: '🪴', price: 32.00, cat: '日常用品', wish: '养着它，像我们养这段日子' },
    // v3 扩库二批：正常世界一般日用刚需品（全部归「日常用品」）
    { id: 'g_handcream', name: '护手霜', emoji: '🧴', price: 29.90, cat: '日常用品', wish: '手好好养着，牵起来才舒服' },
    { id: 'g_soap', name: '香皂', emoji: '🧼', price: 12.00, cat: '日常用品', wish: '洗手的时候，顺便想想我' },
    { id: 'g_wipes', name: '柔软纸巾', emoji: '🧻', price: 8.80, cat: '日常用品', wish: '鼻子娇气的人，正好用得上' },
    { id: 'g_bandaid', name: '创可贴', emoji: '🩹', price: 5.00, cat: '日常用品', wish: '磕磕碰碰的，有我呢' },
    { id: 'g_mask', name: '口罩', emoji: '😷', price: 9.90, cat: '日常用品', wish: '人多的地方，戴好再出门' },
    { id: 'g_powerbank', name: '充电宝', emoji: '🔋', price: 59.00, cat: '日常用品', wish: '随时满格，不怕联系不上我' },
    { id: 'g_cable', name: '数据线', emoji: '⚡', price: 19.90, cat: '日常用品', wish: '新的给你，别再将就用旧的' },
    { id: 'g_canvasbag', name: '帆布包', emoji: '👜', price: 49.00, cat: '日常用品', wish: '能装下零食，也装下好心情' },
    { id: 'g_hat', name: '遮阳帽', emoji: '👒', price: 39.00, cat: '日常用品', wish: '太阳再大，也晒不到你' },
    { id: 'g_gloves', name: '手套', emoji: '🧤', price: 25.00, cat: '日常用品', wish: '骑车路上，别冻着手' },
    { id: 'g_calendar', name: '台历', emoji: '📅', price: 18.00, cat: '日常用品', wish: '一天撕一页，页页都是你' },
    { id: 'g_bear', name: '玩偶熊', emoji: '🧸', price: 69.00, cat: '日常用品', wish: '我不在的时候，它替我值班' },
    { id: 'g_humid', name: '加湿器', emoji: '💧', price: 99.00, cat: '日常用品', wish: '屋里润一点，嗓子舒服一点' },
    { id: 'g_lunchbox', name: '保温饭盒', emoji: '🍱', price: 79.00, cat: '日常用品', wish: '中午也要吃口热乎的' },
    { id: 'g_pill', name: '感冒药', emoji: '💊', price: 22.00, cat: '日常用品', wish: '抽屉里备着，用不上最好' },
    { id: 'g_phonestand', name: '手机支架', emoji: '📱', price: 25.00, cat: '日常用品', wish: '追剧空出来的手，用来牵我' },
    // v3 扩库三批：正常日用生活刚需品（全部归「日常用品」）
    { id: 'g_thermo', name: '体温计', emoji: '🌡️', price: 12.00, cat: '日常用品', wish: '不舒服先量一量，别硬扛' },
    { id: 'g_clipper', name: '指甲刀', emoji: '✂️', price: 9.90, cat: '日常用品', wish: '指甲勤剪，细节要干净' },
    { id: 'g_storage', name: '收纳箱', emoji: '📦', price: 35.00, cat: '日常用品', wish: '杂物收整齐，房间清爽' },
    { id: 'g_luggage', name: '行李箱', emoji: '🧳', price: 199.00, cat: '日常用品', wish: '想去哪，拉上就走' },
    { id: 'g_backpack', name: '双肩包', emoji: '🎒', price: 89.00, cat: '日常用品', wish: '装上水和零食就出发' },
    { id: 'g_glasses', name: '眼镜', emoji: '👓', price: 99.00, cat: '日常用品', wish: '看得清楚，日子也清楚' },
    { id: 'g_vase', name: '花瓶', emoji: '🏺', price: 42.00, cat: '日常用品', wish: '下次送的花，就有地方放了' },
    { id: 'g_chopsticks', name: '碗筷套装', emoji: '🥢', price: 36.00, cat: '日常用品', wish: '好好吃饭，不许糊弄' },
    { id: 'g_pen', name: '中性笔', emoji: '🖊️', price: 6.60, cat: '日常用品', wish: '写字的时候，想着点我' },
    { id: 'g_stickynote', name: '便利贴', emoji: '📝', price: 8.00, cat: '日常用品', wish: '想到什么，随手写给我' },
    { id: 'g_powerstrip', name: '插线板', emoji: '🔌', price: 39.00, cat: '日常用品', wish: '插座够用，手机随时满电' },
    { id: 'g_wallet', name: '钱包', emoji: '👛', price: 79.00, cat: '日常用品', wish: '钱和卡放好，出门不慌' },
    { id: 'g_cap', name: '棒球帽', emoji: '🧢', price: 45.00, cat: '日常用品', wish: '压住乱发，也挡住太阳' },
    { id: 'g_hairtie', name: '头绳', emoji: '➰', price: 6.60, cat: '日常用品', wish: '吃饭前扎起来，乖乖的' },
    { id: 'g_fan', name: '小风扇', emoji: '🌀', price: 49.00, cat: '日常用品', wish: '夏天随身带的风' },
    { id: 'g_mousepad', name: '鼠标垫', emoji: '🖱️', price: 22.00, cat: '日常用品', wish: '手腕底下垫着，舒服一点' },
    // v3 扩库四批：美食甜品 / 出行娱乐 / 关怀陪伴 / 星空浪漫 / 生活小物
    { id: 'g_burger', name: '汉堡', emoji: '🍔', price: 16.00, cat: '美食', wish: '偶尔放纵一下，这顿我请' },
    { id: 'g_pizza', name: '披萨', emoji: '🍕', price: 49.00, cat: '美食', wish: '最中间那块，永远留给你' },
    { id: 'g_friedchicken', name: '炸鸡', emoji: '🍗', price: 33.00, cat: '美食', wish: '趁热吃，凉了就不脆了' },
    { id: 'g_riceball', name: '饭团', emoji: '🍙', price: 7.00, cat: '美食', wish: '偷偷捏成了心的形状' },
    { id: 'g_dumplings', name: '蒸饺', emoji: '🥟', price: 18.00, cat: '美食', wish: '一口一个，都是热乎的' },
    { id: 'g_crayfish', name: '小龙虾', emoji: '🦀', price: 88.00, cat: '美食', wish: '夏天的夜宵，必须有它' },
    { id: 'g_honey', name: '蜂蜜', emoji: '🍯', price: 32.00, cat: '美食', wish: '日子苦的时候，舀一勺' },
    { id: 'g_donut', name: '甜甜圈', emoji: '🍩', price: 9.90, cat: '甜品', wish: '圆圆的一个，圈住你' },
    { id: 'g_pancake', name: '松饼', emoji: '🥞', price: 22.00, cat: '甜品', wish: '叠得高高的，甜也加倍' },
    { id: 'g_layerscake', name: '千层', emoji: '🍰', price: 45.00, cat: '甜品', wish: '一层一层，全是甜' },
    { id: 'g_sunrise', name: '看日出', emoji: '🌅', price: 0.00, cat: '出行', wish: '今晚早点睡，明早我叫你' },
    { id: 'g_cycling', name: '骑行兜风', emoji: '🚲', price: 0.00, cat: '出行', wish: '后座坐好，马上出发' },
    { id: 'g_roadtrip', name: '自驾游', emoji: '🚗', price: 150.00, cat: '出行', wish: '方向盘归你，选歌权归我' },
    { id: 'g_pottery', name: '陶艺体验', emoji: '🎨', price: 99.00, cat: '娱乐', wish: '捏两个歪歪的杯子，正好一对' },
    { id: 'g_puzzle', name: '拼图', emoji: '🧩', price: 39.00, cat: '娱乐', wish: '拼好裱起来，挂我们房间' },
    { id: 'g_gamenight', name: '双人游戏夜', emoji: '🎮', price: 0.00, cat: '娱乐', wish: '输的洗碗，赢的点奶茶' },
    { id: 'g_listen', name: '听你吐槽', emoji: '👂', price: 0.00, cat: '关怀', wish: '说吧，我今天特别有空' },
    { id: 'g_photoshoot', name: '陪你拍照', emoji: '📸', price: 0.00, cat: '关怀', wish: '今天的你也好看，必须记录' },
    { id: 'g_bathbomb', name: '泡澡球', emoji: '🛁', price: 18.00, cat: '日常用品', wish: '泡二十分钟，累就化掉啦' },
    { id: 'g_icecube', name: '冰格', emoji: '🧊', price: 9.00, cat: '日常用品', wish: '可乐加冰，才叫夏天' },
    { id: 'g_flashlight', name: '小手电', emoji: '🔦', price: 15.00, cat: '日常用品', wish: '晚上找东西，不用摸黑' },
    { id: 'g_cardholder', name: '卡包', emoji: '💳', price: 29.00, cat: '日常用品', wish: '和钱包放一起，别丢三落四' },
    { id: 'g_planet', name: '土星', emoji: '🪐', price: 77.00, cat: '星空', wish: '带光环的那一颗，送你' },
    { id: 'g_comet', name: '彗星', emoji: '☄️', price: 66.60, cat: '星空', wish: '绕一大圈，还是会来找你' },
    // v3 扩库五批：餐食饮品 / 花植 / 出行娱乐 / 关怀 / 情侣小物 / 生活清洁
    { id: 'g_curry', name: '咖喱饭', emoji: '🍛', price: 26.00, cat: '美食', wish: '今天也要好好吃饭' },
    { id: 'g_friedshrimp', name: '炸虾', emoji: '🍤', price: 26.00, cat: '美食', wish: '金黄酥脆，第一口给你' },
    { id: 'g_sandwich', name: '三明治', emoji: '🥪', price: 14.00, cat: '美食', wish: '多睡十分钟，早餐我包了' },
    { id: 'g_fries', name: '薯条', emoji: '🍟', price: 11.00, cat: '美食', wish: '番茄酱分你一半' },
    { id: 'g_coconut', name: '椰子', emoji: '🥥', price: 15.00, cat: '美食', wish: '插上吸管，假装在海边' },
    { id: 'g_fortune', name: '签语饼', emoji: '🥠', price: 9.00, cat: '美食', wish: '掰开，里面藏了一句想你' },
    { id: 'g_cupcake', name: '纸杯蛋糕', emoji: '🧁', price: 14.50, cat: '甜品', wish: '小小一个，甜得很具体' },
    { id: 'g_lollipop', name: '波板糖', emoji: '🍭', price: 8.00, cat: '甜品', wish: '甜得直白，不绕弯子' },
    { id: 'g_sundae', name: '圣代', emoji: '🍨', price: 13.00, cat: '甜品', wish: '第一口给你，樱桃也给你' },
    { id: 'g_cactus', name: '仙人掌', emoji: '🌵', price: 15.00, cat: '花束', wish: '好养活，像我一样赖着你' },
    { id: 'g_clover', name: '四叶草', emoji: '🍀', price: 6.60, cat: '花束', wish: '攒到的运气，全都给你' },
    { id: 'g_earth', name: '地球', emoji: '🌏', price: 1.00, cat: '星空', wish: '在同一个星球上，已经够近了' },
    { id: 'g_trainslow', name: '绿皮火车', emoji: '🚂', price: 45.00, cat: '出行', wish: '慢车慢慢开，风景慢慢看' },
    { id: 'g_island', name: '海岛度假', emoji: '🏝️', price: 299.00, cat: '出行', wish: '手机一关，世界只剩我们' },
    { id: 'g_hike', name: '登山', emoji: '⛰️', price: 0.00, cat: '出行', wish: '到山顶了，风替我抱你' },
    { id: 'g_supermarket', name: '逛超市之约', emoji: '🛒', price: 0.00, cat: '出行', wish: '零食区先逛，最后再结账' },
    { id: 'g_darts', name: '飞镖', emoji: '🎯', price: 25.00, cat: '娱乐', wish: '瞄得很准，第一眼就选中你' },
    { id: 'g_musicfestival', name: '音乐节', emoji: '🎟️', price: 199.00, cat: '娱乐', wish: '草坪、日落和音乐，都带上你' },
    { id: 'g_bowling', name: '保龄球', emoji: '🎳', price: 38.00, cat: '娱乐', wish: '打出全倒，要跟我击掌' },
    { id: 'g_cheer', name: '加油打气', emoji: '💪', price: 0.00, cat: '关怀', wish: '你可以的，我全程都在' },
    { id: 'g_nightcall', name: '睡前电话', emoji: '☎️', price: 0.00, cat: '关怀', wish: '响三声，就是我想你了' },
    { id: 'g_lovejournal', name: '情侣手账', emoji: '💌', price: 35.00, cat: '情侣用品', wish: '两个人的小事，都贴进去' },
    { id: 'g_pendant', name: '情侣挂件', emoji: '🐥', price: 26.00, cat: '情侣用品', wish: '一只挂你那，一只挂我这' },
    { id: 'g_sponge', name: '海绵擦', emoji: '🧽', price: 6.00, cat: '日常用品', wish: '碗筷洗干净，吃饭才香' }
  ];
  const DEF_IDS = {};
  DEF_GIFTS.forEach(function (g) { DEF_IDS[g.id] = 1; });
  // v1 默认商品 id（2026-08-24 扩库前的 43 个）：全局迁移时只有它们才允许记「删除标记」，
  // 否则旧桌面快照里没有的新默认商品会被误判成「用户删过的」而被隐藏
  const DEF_V1_IDS = { g_rose: 1, g_sun: 1, g_stars: 1, g_tulip: 1, g_peach: 1, g_cake: 1, g_choc: 1, g_tea: 1, g_candy: 1, g_berry: 1, g_ring: 1, g_neck: 1, g_brace: 1, g_bow: 1, g_star1: 1, g_moon: 1, g_cloud: 1, g_rainbow: 1, g_meteor: 1, g_galaxy: 1, g_hug: 1, g_kiss: 1, g_night: 1, g_soup: 1, g_letter: 1, g_couplecup: 1, g_couplewear: 1, g_lock: 1, g_couavatar: 1, g_coudiary: 1, g_couframe: 1, g_cousong: 1, g_coucoin: 1, g_towel: 1, g_mug: 1, g_umbrella: 1, g_pillow: 1, g_warmer: 1, g_earphone: 1, g_notebook: 1, g_keychain: 1, g_lamp: 1, g_candle: 1 };
  // v2 新增默认商品 id：若迁移在扩库前已跑过（误标 del），幂等救援清一次
  const DEF_V2_IDS = { g_hotpot: 1, g_sushi: 1, g_noodle: 1, g_bbq: 1, g_bfast: 1, g_juice: 1, g_chestnut: 1, g_potato: 1, g_popcorn: 1, g_train: 1, g_plane: 1, g_camp: 1, g_beach: 1, g_spring: 1, g_route: 1, g_movie: 1, g_concert: 1, g_ferris: 1, g_claw: 1, g_ktv: 1, g_icecream: 1, g_pudding: 1, g_crown: 1, g_snow: 1, g_sunset: 1, g_breeze: 1, g_wave: 1, g_milk: 1, g_massage: 1, g_wakeup: 1, g_watchtogether: 1, g_couplewatch: 1, g_coupleshoes: 1, g_scarf: 1, g_socks: 1, g_slipper: 1 };
  // v3 新增默认商品 id（2026-08-25「两个世界」分类 + 日常扩容，共 109 件）：同款幂等救援
  const DEF_V3_IDS = { g_card: 1, g_blindbox: 1, g_stickers: 1, g_wordsbag: 1, g_nearby: 1, g_hands: 1, g_patpat: 1, g_unseen: 1, g_heartlink: 1, g_amulet: 1, g_courier: 1, g_dreammeet: 1, g_moonmeet: 1, g_bridge: 1, g_daisy: 1, g_cookie: 1, g_oden: 1, g_tanghulu: 1, g_starear: 1, g_picnic: 1, g_nightmarket: 1, g_boardgame: 1, g_telescope: 1, g_walk: 1, g_lullaby: 1, g_eyemask: 1, g_lipbalm: 1, g_thermos: 1, g_plant: 1, g_handcream: 1, g_soap: 1, g_wipes: 1, g_bandaid: 1, g_mask: 1, g_powerbank: 1, g_cable: 1, g_canvasbag: 1, g_hat: 1, g_gloves: 1, g_calendar: 1, g_bear: 1, g_humid: 1, g_lunchbox: 1, g_pill: 1, g_phonestand: 1, g_thermo: 1, g_clipper: 1, g_storage: 1, g_luggage: 1, g_backpack: 1, g_glasses: 1, g_vase: 1, g_chopsticks: 1, g_pen: 1, g_stickynote: 1, g_powerstrip: 1, g_wallet: 1, g_cap: 1, g_hairtie: 1, g_fan: 1, g_mousepad: 1, g_burger: 1, g_pizza: 1, g_friedchicken: 1, g_riceball: 1, g_dumplings: 1, g_crayfish: 1, g_honey: 1, g_donut: 1, g_pancake: 1, g_layerscake: 1, g_sunrise: 1, g_cycling: 1, g_roadtrip: 1, g_pottery: 1, g_puzzle: 1, g_gamenight: 1, g_listen: 1, g_photoshoot: 1, g_bathbomb: 1, g_icecube: 1, g_flashlight: 1, g_cardholder: 1, g_planet: 1, g_comet: 1, g_curry: 1, g_friedshrimp: 1, g_sandwich: 1, g_fries: 1, g_coconut: 1, g_fortune: 1, g_cupcake: 1, g_lollipop: 1, g_sundae: 1, g_cactus: 1, g_clover: 1, g_earth: 1, g_trainslow: 1, g_island: 1, g_hike: 1, g_supermarket: 1, g_darts: 1, g_musicfestival: 1, g_bowling: 1, g_cheer: 1, g_nightcall: 1, g_lovejournal: 1, g_pendant: 1, g_sponge: 1 };

  // v3.10.x：自定义商品改全局共享（所有桌面互通）——存 xy-home-v2 根命名空间 market-custom，
  // 不再按联系人命名空间隔离。数组元素三种形态：
  //   自定义商品 {id:'g_custom_*', name, emoji, img, price, cat, wish}
  //   默认商品覆盖 {id:<默认id>, base:1, ...改过的完整字段}（管理模式编辑默认商品生成）
  //   默认商品删除标记 {id:<默认id>, del:1}（管理模式删除默认商品生成，防全局化后"复活"）
  const GSTORE = (function () { try { return window.xyStore('xy-home-v2'); } catch (e) { return null; } })();
  const CUSTOM_KEY = 'market-custom';
  const MIGRATE_KEY = 'market-migrated';
  const GIFTS_KEY = 'market-gifts'; // 旧各桌面商品库键（仅迁移读取用）
  function customLoad() { try { const a = JSON.parse((GSTORE && GSTORE.get(CUSTOM_KEY)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function customSave(a) { if (GSTORE) GSTORE.set(CUSTOM_KEY, JSON.stringify(a)); }
  function giftsLoad() {
    const dead = {}, ov = {}, customs = [];
    customLoad().forEach(function (c) {
      if (!c || !c.id) return;
      if (c.del) { dead[c.id] = 1; return; }
      if (c.base) { ov[c.id] = c; return; }
      customs.push(c);
    });
    const out = [];
    DEF_GIFTS.forEach(function (g) {
      if (dead[g.id]) return;
      if (ov[g.id]) { const m = Object.assign({}, g, ov[g.id]); delete m.base; delete m.del; out.push(m); }
      else out.push(g);
    });
    return out.concat(customs);
  }
  function deleteGift(id) {
    const customs = customLoad();
    const idx = customs.findIndex(function (x) { return x && x.id === id; });
    if (DEF_IDS[id]) {
      const mark = { id: id, del: 1 };
      if (idx >= 0) customs[idx] = mark; else customs.push(mark);
    } else {
      if (idx >= 0) customs.splice(idx, 1);
    }
    customSave(customs);
  }
  // 一次性迁移：把各桌面旧的 market-gifts（整库快照）里的自定义商品并入全局库，
  // 桌面上删过的默认商品记删除标记。幂等（market-migrated 标记 + id 去重），
  // 模块加载跑一次合并 LS；mochi-restore-done（IDB 回填完）后未打标记再跑一次
  function migrateMarketGlobal(setMark) {
    if (!GSTORE || GSTORE.get(MIGRATE_KEY)) return;
    const customs = customLoad();
    const seen = {};
    customs.forEach(function (c) { if (c && c.id) { seen[c.id] = 1; if (c.del) seen['del:' + c.id] = 1; } });
    let changed = false;
    const contacts = (window.getContacts && window.getContacts()) || [{ id: 'default' }];
    contacts.forEach(function (c) {
      let raw = null;
      try { raw = window.storeFor(c.id).get(GIFTS_KEY); } catch (e) {}
      if (raw == null || raw === '') return;
      let arr = null;
      try { arr = JSON.parse(raw); } catch (e) { return; }
      if (!Array.isArray(arr) || !arr.length) return;
      const ids = {};
      arr.forEach(function (g) { if (g && g.id) ids[g.id] = 1; });
      arr.forEach(function (g) {
        if (!g || !g.id || String(g.id).indexOf('g_custom_') !== 0 || seen[g.id]) return;
        seen[g.id] = 1;
        customs.push({ id: g.id, name: g.name, emoji: g.emoji, img: g.img || '', price: g.price, cat: g.cat, wish: g.wish });
        changed = true;
      });
      DEF_GIFTS.forEach(function (d) {
        if (!DEF_V1_IDS[d.id]) return;
        if (ids[d.id] || seen['del:' + d.id]) return;
        seen['del:' + d.id] = 1;
        customs.push({ id: d.id, del: 1 });
        changed = true;
      });
    });
    if (changed || setMark) customSave(customs);
    if (setMark) GSTORE.set(MIGRATE_KEY, '1');
  }
  // 救援：迁移若在扩库前跑过，新默认商品被误标 del → 幂等清一次（每批独立标记键）
  function rescueBatch(ids, mark) {
    if (!GSTORE || GSTORE.get(mark)) return;
    const customs = customLoad();
    let changed = false;
    for (let i = customs.length - 1; i >= 0; i--) {
      const c = customs[i];
      if (c && c.del && ids[c.id]) { customs.splice(i, 1); changed = true; }
    }
    if (changed) customSave(customs);
    GSTORE.set(mark, '1');
  }
  function rescueNewDefaults() {
    rescueBatch(DEF_V2_IDS, 'market-migrated-v2');
    rescueBatch(DEF_V3_IDS, 'market-migrated-v3');
  }

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
    box.unshift({ id: 'gb_' + Date.now() + '_' + Math.floor(Math.random() * 1000), giftId: gift.id, name: gift.name, emoji: gift.emoji, img: gift.img || '', price: gift.price, cat: gift.cat, wish: wish, side: side, tm: Date.now() });
    boxSave(box);
  }

  function buyAndSend(gift, side, wish) {
    const priceFen = Math.round((gift.price || 0) * 100);
    const w = walletGet();
    if (side === 'out') { if (priceFen > w.myBalance) { toast('我的心意币不足'); return false; } w.myBalance -= priceFen; }
    else { if (priceFen > w.systemBalance) { toast(partnerName() + ' 的心意币不足'); return false; } w.systemBalance -= priceFen; }
    walletSet(w);
    const rec = { side: side, special: 'gift', giftId: gift.id, giftName: gift.name, giftEmoji: gift.emoji, giftImg: gift.img || '', giftPrice: gift.price, giftWish: wish, giftCat: gift.cat, ts: Date.now() };
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
      const rec = { side: 'in', special: 'gift', giftId: gift.id, giftName: gift.name, giftEmoji: gift.emoji, giftImg: gift.img || '', giftPrice: gift.price, giftWish: wish, giftCat: gift.cat, ts: Date.now() };
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
        '<div class="gb-emoji">' + giftMedia(gift, 'gb-emoji-img') + '</div>' +
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
  // 商品展示媒体：有自定义图片用图片，否则回退 emoji
  function giftMedia(g, cls) {
    if (g && g.img) return '<img class="' + cls + '" src="' + esc(g.img) + '" alt="">';
    return esc((g && g.emoji) || '🎁');
  }
  function giftItemHtml(g, manage) {
    const col = CAT_COLOR[g.cat] || '#f5f3fa';
    return '<button class="gift-item' + (manage ? ' manage' : '') + '" data-id="' + esc(g.id) + '" style="--cat:' + col + ';">' +
      '<div class="gift-item-top" style="background:linear-gradient(160deg,' + col + ',#fff);">' +
        '<div class="gift-item-emoji">' + giftMedia(g, 'gift-item-img') + '</div>' +
      '</div>' +
      '<div class="gift-item-body">' +
        '<div class="gift-item-name">' + esc(g.name) + '</div>' +
        '<div class="gift-item-price">¥' + Number(g.price || 0).toFixed(2) + '</div>' +
      '</div>' +
      (manage ? '<span class="gift-item-edit" data-edit="' + esc(g.id) + '">✎</span><span class="gift-item-del" data-del="' + esc(g.id) + '">✕</span>' : '') +
    '</button>';
  }
  function renderGiftGrid(containerId, gifts, onPick, manage) {
    const el = document.getElementById(containerId); if (!el) return;
    const list = giftsByCat(gifts);
    el.innerHTML = list.map(function (g) { return giftItemHtml(g, manage); }).join('') || '<div class="gift-empty">还没有商品，点下方添加</div>';
    el.querySelectorAll('.gift-item').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (manage) { const g0 = gifts.find(function (x) { return x.id === b.dataset.id; }); if (g0) openAddGiftForm(g0); return; }
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
          window.openModal(DEF_IDS[id] ? '删除默认商品？（可稍后恢复默认）' : '删除这个商品？', '', function () { deleteGift(id); renderMarket(); }, { noInput: true });
        });
      });
      el.querySelectorAll('.gift-item-edit').forEach(function (d) {
        d.addEventListener('click', function (e) {
          e.stopPropagation();
          const g = gifts.find(function (x) { return x.id === d.dataset.edit; });
          if (g) openAddGiftForm(g);
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
    const resetBtn = document.getElementById('market-reset');
    if (resetBtn) resetBtn.hidden = !(marketManage && customLoad().some(function (c) { return c && (c.del || c.base); }));
    renderGiftCats('market-cats', 'icon', renderMarket);
    renderGiftGrid('market-grid', giftsLoad(), function (g) { openBuyDialog(g); }, marketManage);
  }

  // ---- 商品图片上传（自定义商品可传实拍图，未传回退 emoji）----
  // 持久化隐藏 file input（初始化创建一次、永久挂 body）——安卓 Edge 等对
  // 「点击时动态创建 input + 立即 click()」会静默忽略合成点击（同头像上传修复结论）
  let gmImg = '';
  const gmImgInput = document.createElement('input');
  gmImgInput.id = 'gm-img-input';
  gmImgInput.type = 'file'; gmImgInput.accept = 'image/*';
  gmImgInput.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
  // 初始化即挂 body（同 chat-settings headInput：创建一次、永久挂载、每次复用）
  try { document.body.appendChild(gmImgInput); } catch (e) {}
  gmImgInput.onchange = function () {
    const f = gmImgInput.files && gmImgInput.files[0];
    gmImgInput.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type || '')) { toast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      compressGiftImg(String(reader.result || '')).then(function (data) {
        if (!data) { toast('图片处理失败，换一张试试'); return; }
        gmImg = data;
        renderGmImgRow();
      });
    };
    reader.onerror = function () { toast('图片读取失败'); };
    reader.readAsDataURL(f);
  };
  // 压缩到 480px JPEG（白底防透明变黑），失败返回 null（同字卡库口径：不回退存原图）
  function compressGiftImg(dataUrl) {
    return new Promise(function (resolve) {
      if (typeof dataUrl !== 'string' || dataUrl.length > 8 * 1024 * 1024) { resolve(null); return; }
      const img = new Image();
      img.onload = function () {
        try {
          if (img.width * img.height > 26000000) { resolve(null); return; }
          const scale = Math.min(1, 480 / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }
  function gmImgRowHtml() {
    return '<div class="gm-img-row">' +
      '<div class="gm-img-prev" id="gm-img-prev">' + (gmImg ? '<img src="' + esc(gmImg) + '" alt="">' : '🖼️') + '</div>' +
      '<button class="gm-img-btn" id="gm-img-pick" type="button">' + (gmImg ? '换一张' : '上传图片') + '</button>' +
      (gmImg ? '<button class="gm-img-btn gm-img-clear" id="gm-img-clear" type="button">清除</button>' : '') +
      '</div>';
  }
  function renderGmImgRow() {
    const row = document.getElementById('gm-img-row');
    if (row) row.innerHTML = gmImgRowHtml();
    bindGmImgRow();
  }
  function bindGmImgRow() {
    const pick = document.getElementById('gm-img-pick');
    if (pick) pick.addEventListener('click', function () { try { gmImgInput.click(); } catch (e) { toast('无法打开相册，请重试'); } });
    const clr = document.getElementById('gm-img-clear');
    if (clr) clr.addEventListener('click', function () { gmImg = ''; renderGmImgRow(); });
  }

  function openAddGiftForm(editGift) {
    if (!window.openTCPanel) { toast('稍后再试'); return; }
    const g = editGift || {};
    gmImg = g.img || '';
    const catOpts = CATS.map(function (c) { return '<option value="' + esc(c) + '"' + (c === g.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    const html =
      '<div class="gm-form">' +
        '<div class="gm-row"><label>商品图片（可选，不传用 emoji）</label><div id="gm-img-row">' + gmImgRowHtml() + '</div></div>' +
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
    window.openTCPanel(editGift ? (DEF_IDS[g.id] ? '编辑默认商品' : '编辑商品') : '添加商品', html);
    bindGmImgRow();
    const okBtn = document.getElementById('gm-ok');
    const cancelBtn = document.getElementById('gm-cancel');
    if (okBtn) okBtn.addEventListener('click', function () {
      const name = (document.getElementById('gm-name').value || '').trim();
      const emoji = (document.getElementById('gm-emoji').value || '').trim() || '🎁';
      const price = Math.max(0, parseFloat(document.getElementById('gm-price').value) || 0);
      const cat = document.getElementById('gm-cat').value || '关怀';
      const wish = (document.getElementById('gm-wish').value || '').trim() || '送给你';
      if (!name) { toast('先填名字'); return; }
      const item = { id: editGift ? editGift.id : ('g_custom_' + Date.now()), name: name, emoji: emoji, img: gmImg, price: price, cat: cat, wish: wish };
      const customs = customLoad();
      if (editGift && DEF_IDS[item.id]) {
        // 默认商品编辑 → 覆盖项（base:1），giftsLoad 时叠加在默认定义上
        const merged = Object.assign({}, DEF_GIFTS.find(function (x) { return x.id === item.id; }) || {}, item, { base: 1 });
        const idx = customs.findIndex(function (x) { return x && x.id === item.id; });
        if (idx >= 0) customs[idx] = merged; else customs.push(merged);
      } else if (editGift) {
        const idx = customs.findIndex(function (x) { return x && x.id === item.id; });
        if (idx >= 0) customs[idx] = item; else customs.push(item);
      } else {
        customs.push(item);
      }
      customSave(customs); closeTc(); renderMarket(); toast('已保存');
    });
    if (cancelBtn) cancelBtn.addEventListener('click', closeTc);
  }

  let giftboxPage = null, boxTab = 'in';
  function renderBox() {
    const list = boxLoad();
    const inList = list.filter(function (x) { return x.side === 'in'; });
    const outList = list.filter(function (x) { return x.side === 'out'; });
    const statIn = document.getElementById('giftbox-stat-in');
    const statOut = document.getElementById('giftbox-stat-out');
    if (statIn) statIn.textContent = String(inList.length);
    if (statOut) statOut.textContent = String(outList.length);
    const tabs = document.querySelectorAll('.gb-tab');
    tabs.forEach(function (t) {
      t.classList.toggle('sel', t.dataset.btab === boxTab);
      t.textContent = t.dataset.btab === 'in' ? (partnerName() + ' 送我的') : ('我送 ' + partnerName() + ' 的');
    });
    const show = (boxTab === 'in' ? inList : outList).slice().sort(function (a, b) { return b.tm - a.tm; });
    const el = document.getElementById('giftbox-list'); if (!el) return;
    el.innerHTML = show.map(function (it) {
      const from = it.side === 'in' ? esc(partnerName()) + ' 送我' : '我 送 ' + esc(partnerName());
      return '<div class="giftbox-card" data-id="' + esc(it.id) + '">' +
        '<div class="giftbox-card-top">' +
          '<div class="giftbox-emoji">' + giftMedia(it, 'giftbox-emoji-img') + '</div>' +
        '</div>' +
        '<div class="giftbox-card-body">' +
          '<div class="giftbox-name">' + esc(it.name) + '</div>' +
          '<div class="giftbox-price">¥' + Number(it.price || 0).toFixed(2) + '</div>' +
          '<div class="giftbox-wish">"' + esc(it.wish || '心意') + '"</div>' +
          '<div class="giftbox-meta">' + esc(from) + ' · ' + esc(fmtTime(it.tm)) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="gift-empty">' + (boxTab === 'in' ? (esc(partnerName()) + ' 还没送你礼物<br>' + (window.taFit ? window.taFit('他偶尔会主动从市集挑一份给你，耐心等等') : '他偶尔会主动从市集挑一份给你，耐心等等')) : ('你还没送出礼物<br>去心意市集挑一份送给 ' + esc(partnerName()) + ' 吧')) + '</div>';
    el.querySelectorAll('.giftbox-card').forEach(function (c) {
      c.addEventListener('click', function () {
        const it = list.find(function (x) { return x.id === c.dataset.id; });
        if (!it || !window.openTCPanel) return;
        const from = it.side === 'in' ? esc(partnerName()) + ' 送我' : '我 送 ' + esc(partnerName());
        const html =
          '<div class="gb-detail">' +
            '<div class="gb-detail-emoji">' + giftMedia(it, 'gb-detail-emoji-img') + '</div>' +
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

  // v3.6.x 市集+心意柜成组注入。上限必须与 personalize.js DESK_PAGE_MAX(5) 一致：
  // 曾用 <6 在满 5 页桌面新建第 6 页 → mochi-restore-done 后 buildDeskPages 钳回 5 页
  // 删尾页把图标扫进隐藏池，且 app-market 不在 WIDGET_IDS 白名单永远无法找回（刷新也消失）。
  // 兜底走 memo-app 同款模式：无条件 append 进 .app-grid.p3-grid 当前所在位置
  // （哪怕整组暂在隐藏池，冷启动收缩后由 accounting.js ensureP3 找回归位）。
  function injectDeskApps(pairs) {
    const st = store();
    let layArr = null;
    try { if (st) layArr = JSON.parse(st.get('desk-layout') || 'null'); } catch (e) {}
    const hasLayout = Array.isArray(layArr);
    const ids = pairs.map(function (p) { return p.id; });
    const alreadyInLay = hasLayout && layArr.some(function (pg) { return (pg || []).some(function (w) { return ids.indexOf(w) >= 0; }); });
    let placed = false;
    if (hasLayout && !alreadyInLay) {
      const pagesBox = document.getElementById('desktop-pages');
      if (pagesBox) {
        const curCnt = pagesBox.querySelectorAll('.page-slide').length;
        if (curCnt < 5) {
          const slide = document.createElement('div');
          slide.className = 'page-slide desk-page';
          slide.dataset.desk = String(curCnt);
          const grid = document.createElement('div');
          grid.className = 'app-grid';
          pairs.forEach(function (p) { grid.appendChild(p.el); });
          slide.appendChild(grid);
          pagesBox.appendChild(slide);
          try { st.set('desk-page-count', String(curCnt + 1)); layArr.push(ids.slice()); st.set('desk-layout', JSON.stringify(layArr)); } catch (e) {}
          try { if (window.deskRebuild) window.deskRebuild(); } catch (e) {}
          placed = true;
        }
      }
    }
    if (!placed) {
      pairs.forEach(function (p) {
        const p3 = document.querySelector('.app-grid.p3-grid');
        if (p3) p3.appendChild(p.el); else { const p2 = document.querySelector('.app-grid.p2-grid'); if (p2) p2.appendChild(p.el); }
      });
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
          '<button class="market-tool" id="market-reset" type="button" hidden>恢复默认商品</button>' +
        '</div>' +
      '</div>';
    host.appendChild(marketPage);
    document.getElementById('market-back').addEventListener('click', backHome);
    document.getElementById('market-add').addEventListener('click', function () { if (marketManage) { marketManage = false; renderMarket(); return; } openAddGiftForm(null); });
    document.getElementById('market-manage').addEventListener('click', function () { marketManage = !marketManage; renderMarket(); });
    document.getElementById('market-reset').addEventListener('click', function () {
      if (!window.openModal) return;
      window.openModal('恢复默认商品？（清除对默认商品的修改/删除记录，自定义商品保留）', '', function () {
        customSave(customLoad().filter(function (c) { return c && !c.del && !c.base; }));
        renderMarket(); toast('已恢复默认');
      }, { noInput: true });
    });
  }

  function buildGiftboxPage(host) {
    giftboxPage = document.createElement('div');
    giftboxPage.className = 'page'; giftboxPage.id = 'page-giftbox'; giftboxPage.hidden = true;
    giftboxPage.innerHTML =
      '<div class="chat-head"><span class="ch-back" id="giftbox-back">' + BACK_SVG + '</span><span class="ch-name">心意柜</span></div>' +
      '<div class="giftbox-hero">' +
        '<div class="giftbox-hero-title">心意柜</div>' +
        '<div class="giftbox-hero-sub">每一份心意，都值得被珍藏</div>' +
        '<div class="giftbox-stat-cards">' +
          '<div class="giftbox-stat-card"><div class="giftbox-stat-ico">🎁</div><div class="giftbox-stat-num" id="giftbox-stat-in">0</div><div class="giftbox-stat-lbl">收到</div></div>' +
          '<div class="giftbox-stat-card"><div class="giftbox-stat-ico">💌</div><div class="giftbox-stat-num" id="giftbox-stat-out">0</div><div class="giftbox-stat-lbl">送出</div></div>' +
        '</div>' +
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
    // 旧各桌面商品库 → 全局库一次性迁移（加载时先合并 LS；IDB 回填完成后未打标记再补跑一次）
    try { migrateMarketGlobal(false); } catch (e) {}
    try { rescueNewDefaults(); } catch (e) {}
    document.addEventListener('mochi-restore-done', function () { try { migrateMarketGlobal(true); } catch (e) {} try { rescueNewDefaults(); } catch (e) {} });

    const host = (document.getElementById('page-phone') || {}).parentNode || document.body;
    buildMarketPage(host);
    buildGiftboxPage(host);

    // 心意币余额行（聊天送礼面板 + 市集页 hero）点击 → 设置我和 TA 的心意币金额
    ['gift-balance', 'market-balance'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', function (e) { e.stopPropagation(); giftEditWallet(); });
    });

    const marketApp = makeApp('market', '心意市集', MARKET_SVG);
    const giftboxApp = makeApp('giftbox', '心意柜', BOX_SVG);
    injectDeskApps([{ el: marketApp, id: 'app-market' }, { el: giftboxApp, id: 'app-giftbox' }]);
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

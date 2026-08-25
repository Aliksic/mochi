// ===== 功能：双人打砖块（聊天页更多功能 → 打砖块） =====
// 合作模式：玩家控制左侧挡板，梦角（TA）由代码控制右侧挡板，双方共同接住同一颗球清砖。
// 不依赖聊天 AI。梦角 = 落点预测 + 反应间隔 + 移动速度限制 + 锁定式预测误差（每次下落掷一次）
// + 概率放水 + 难度分档 + 本局发挥状态（正常/较好/走神/特殊，开局掷定）。
// 字卡只作低概率反馈：场内 TA 泡泡（接球/险救/清层/丢球）+ 结束后写聊天记录与 TA 回应。
// 音效 Web Audio 生成短 beep，可静音。
(function () {
  const panel = document.getElementById('chat-brick-panel');
  if (!panel) return;
  const canvas = document.getElementById('brick-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('brick-score');
  const comboEl = document.getElementById('brick-combo');
  const livesEl = document.getElementById('brick-lives');
  const levelEl = document.getElementById('brick-level');
  const hintEl = document.getElementById('brick-hint');
  const overlayEl = document.getElementById('brick-overlay');
  const overlayTitleEl = document.getElementById('brick-overlay-title');
  const overlayBodyEl = document.getElementById('brick-overlay-body');
  const overlayBtnEl = document.getElementById('brick-overlay-btn');
  const overlayCloseBtn = document.getElementById('brick-overlay-close');
  const diffSel = document.getElementById('brick-diff');
  const soundBtn = document.getElementById('brick-sound');
  const pauseBtn = document.getElementById('brick-pause');
  const fsBtn = document.getElementById('brick-fs');
  const closeBtn = document.getElementById('chat-brick-close');
  const partnerNameEl = document.getElementById('brick-partner-name');
  const footNameEl = document.getElementById('brick-foot-name');

  // ---- 逻辑尺寸（物理计算用；Canvas 像素按 DPR 缩放，CSS 拉伸到容器宽） ----
  const W = 400, H = 340;
  const COLS = 8, ROWS = 4;            // 砖块 8 列 × 4 行
  const B_MARGIN = 10, B_GAP = 4, B_TOP = 28, B_H = 15;
  const B_W = (W - B_MARGIN * 2 - (COLS - 1) * B_GAP) / COLS;   // 44
  const PADDLE_W = 62, PADDLE_H = 8;
  const PADDLE_Y = H - 14;             // 挡板顶边 y
  const BALL_R = 5;
  const BALL_HOME_Y = (B_TOP + ROWS * (B_H + B_GAP) + PADDLE_Y) / 2;   // 发球点（砖区与挡板之间居中）
  const PLAYER_HOME_X = W * 0.25, DREAM_HOME_X = W * 0.75;
  const PLAYER_V = 7.2;                // 玩家挡板最大速度（px/tick）
  const FPS = 60;

  // ---- 难度参数（思考间隔 / 移动速度 / 预测误差幅度 / 放水概率） ----
  const DIFFS = {
    easy:   { think: [250, 430], maxV: 2.35, err: 30, fumble: 0.17 },
    normal: { think: [135, 240], maxV: 3.5,  err: 16, fumble: 0.08 },
    hard:   { think: [80, 160],  maxV: 4.8,  err: 8,  fumble: 0.03 }
  };

  // ---- 本局发挥：每局开始掷定一次，只对难度做小幅波动，不覆盖难度 ----
  function rollPerformance() {
    const r = Math.random();
    if (r < 0.02) {
      // 特殊发挥（2%）：二选一的明显临场变化，整局只出现一次
      return Math.random() < 0.5
        ? { kind: 'special', variant: 'hot', used: false }   // 一段「超神」10s：接近上一档的控制力
        : { kind: 'special', variant: 'slip', used: false }; // 一次「大走神」：某次来球必然偏出挡板
    }
    if (r < 0.10) return { kind: 'good' };                   // 状态较好：更稳更准
    if (r < 0.18) return { kind: 'dazed', nextLapseAt: 0 };  // 偶尔走神：周期性短暂反应停摆
    return { kind: 'normal' };
  }

  // ---- TA 场内泡泡文案池（低概率触发，全局冷却 + 分事件冷却） ----
  const SAY_POOLS = {
    catch: ['接到了。', '继续。', '还在。'],
    nearmiss: ['差一点。', '……', '看球。'],
    save: ['漂亮。', '接得好。'],
    clear: ['清完了。', '不错。', '继续？'],
    fail: ['没接住。', '可惜。', '再来。'],
    coop: ['我们配合得不错。'],
    streak: ['还挺顺的。']
  };
  const SAY_COOLDOWN = { catch: 22000, nearmiss: 15000, save: 26000, clear: 12000, fail: 14000, coop: 0, streak: 0 };

  // ---- 音效 ----
  let audioCtx = null, soundOn = true;
  function beep(freq, dur, vol) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'square';
      g.gain.value = vol || 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime;
      o.start(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.06));
      o.stop(t + (dur || 0.06));
    } catch (e) {}
  }
  function sfxWall()   { beep(360, 0.04, 0.04); }
  function sfxPaddle() { beep(500, 0.05, 0.06); }
  function sfxBrick(hp){ beep(hp > 0 ? 300 : 640 + Math.random() * 120, hp > 0 ? 0.05 : 0.09, 0.07); }
  function sfxLose()   { beep(200, 0.22, 0.08); setTimeout(() => beep(150, 0.26, 0.08), 130); }
  function sfxClear()  { beep(620, 0.1, 0.08); setTimeout(() => beep(830, 0.14, 0.08), 110); }

  // ---- 工具 ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // 三角分布噪声（-σ ~ σ，中间概率高）：预测误差用
  const tri = (sigma) => (Math.random() + Math.random() - 1) * sigma;
  // X 轴镜像折叠：直线外推后折回场地（左右墙反弹的解析式）
  function foldX(x) {
    const lo = BALL_R, span = W - BALL_R * 2;
    let m = ((x - lo) % (2 * span) + 2 * span) % (2 * span);
    return m > span ? (2 * span - m) + lo : m + lo;
  }
  const taName = () => (window.taWord ? window.taWord() : 'TA');
  const T = (x) => (window.taFit ? window.taFit(x) : x);

  // ---- 关卡生成：8×4 基础网格，坚固砖比例随层涨；排列按层号轮换三种 ----
  function buildBricks(level) {
    const sturdyRatio = Math.min(0.10 + 0.07 * (level - 1), 0.45);
    const arr = [];
    const skip = {};   // 排列变化：挖掉少量格子改变阵形
    if (level % 3 === 1 && level >= 4) { skip['0_0'] = 1; skip['0_7'] = 1; }              // 切上角
    else if (level % 3 === 2 && level >= 5) { skip['3_0'] = 1; skip['3_7'] = 1; }         // 切下角
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (skip[r + '_' + c]) continue;
        // 层号轮换：普通排列 / 棋盘加固（坚固砖集中在偶数格）/ 中路加固
        let sturdy = Math.random() < sturdyRatio;
        if (level % 3 === 2 && (r + c) % 2 === 0 && r < 2) sturdy = true;
        if (level % 3 === 0 && c >= 3 && c <= 4 && r < 2) sturdy = Math.random() < sturdyRatio + 0.18;
        arr.push({ x: B_MARGIN + c * (B_W + B_GAP), y: B_TOP + r * (B_H + B_GAP), w: B_W, h: B_H, hp: sturdy ? 2 : 1, maxHp: sturdy ? 2 : 1 });
      }
    }
    return arr;
  }

  // ---- 球速：随层数提高，封顶防后期不可操作 ----
  const levelSpeed = (lv) => Math.min(3.0 + 0.32 * (lv - 1), 5.0);

  // ---- 游戏状态 ----
  let state = null;
  let running = false, paused = false;
  let rafId = null, lastTs = 0, acc = 0;

  function newState(diffKey) {
    const d = DIFFS[diffKey] || DIFFS.easy;
    return {
      diff: diffKey, params: d,
      perf: rollPerformance(),
      ball: { x: W / 2, y: BALL_HOME_Y, vx: 0, vy: 0 },
      player: { x: PLAYER_HOME_X, targetX: PLAYER_HOME_X },
      dream: { x: DREAM_HOME_X, targetX: DREAM_HOME_X, nextThinkAt: 0 },
      bricks: buildBricks(1),
      status: 'serve',           // serve | rally | clearing | over
      serveAt: 0,
      score: 0, combo: 0, maxCombo: 0, bricksCleared: 0, level: 1, lives: 3,
      prevVy: 0,
      dreamErr: 0,               // 锁定式误差：每次球向下飞只掷一次，整段保持
      fumbleOffset: null,        // 放水：本次下落故意偏离（非 null 即武装）
      slipArmed: false,          // 特殊发挥·slip 的必失球
      hotUntil: 0,               // 特殊发挥·hot 生效期
      rallyHits: 0,              // 双方连续接球数（合作默契反馈用）
      floaters: [],              // {x,y,text,until}
      taBubble: null,            // {text,until}
      comboFlashUntil: 0, lastComboShown: 0,
      cardLast: {},              // 各类泡泡上次触发时间戳
      cardGlobalAt: 0,
      endReplied: false
    };
  }

  // ---- 发球：中央向上 ±38°，短暂等待后自动发射 ----
  function serve(s, now) {
    const ang = rand(-38, 38) * Math.PI / 180;
    const sp = levelSpeed(s.level);
    s.ball.x = W / 2; s.ball.y = BALL_HOME_Y;
    s.ball.vx = Math.sin(ang) * sp;
    s.ball.vy = -Math.cos(ang) * sp;
    s.prevVy = s.ball.vy;
    s.status = 'rally';
    s.dreamErr = 0; s.fumbleOffset = null; s.slipArmed = false;
  }

  // ---- 梦角落点预测：从当前球态推演到挡板平面的 x（含左右墙反弹折叠） ----
  function predictLandingX(s) {
    const b = s.ball;
    if (b.vy <= 0.05) return null;
    const planeY = PADDLE_Y - BALL_R;
    const t = (planeY - b.y) / b.vy;
    if (t < 0 || t > 600) return null;
    return foldX(b.x + b.vx * t);
  }

  // ---- 特殊发挥触发 ----
  function maybeTriggerSpecial(s, now) {
    const pf = s.perf;
    if (!pf || pf.kind !== 'special' || pf.used) return;
    if (pf.variant === 'hot') { pf.used = true; s.hotUntil = now + 10000; }
    // slip 在下一次下落判定时消费（见 planDescent）
  }

  // ---- 梦角决策（每次下落掷定误差/放水；周期性思考更新目标） ----
  function planDescent(s, now) {
    const b = s.ball;
    // 新的一次下落（vy 由 ≤0 转 >0）→ 掷本段误差与放水
    if (b.vy > 0 && s.prevVy <= 0) {
      const pf = s.perf;
      const p = effectiveParams(s, now);
      s.dreamErr = tri(p.err);
      s.fumbleOffset = null;
      maybeTriggerSpecial(s, now);
      // slip：整局一次的明显走神（必偏出可接范围）
      if (pf.kind === 'special' && pf.variant === 'slip' && !pf.used && Math.random() < 0.6) {
        pf.used = true;
        s.slipArmed = true;
        s.fumbleOffset = (PADDLE_W * (0.9 + Math.random() * 0.35)) * (Math.random() < 0.5 ? -1 : 1);
      } else if (Math.random() < p.fumble) {
        s.fumbleOffset = (PADDLE_W * (0.72 + Math.random() * 0.33)) * (Math.random() < 0.5 ? -1 : 1);
      }
      // 走神发挥：安排一次短暂反应停摆
      if (pf.kind === 'dazed') {
        if (!pf.nextLapseAt) pf.nextLapseAt = now + rand(7000, 13000);
        if (now >= pf.nextLapseAt) {
          pf.nextLapseAt = now + rand(9000, 16000);
          s.lapseUntil = now + rand(450, 850);
        }
      }
    }
  }
  // 生效参数：难度为基础，叠加本局发挥 / 特殊发挥临场变化
  function effectiveParams(s, now) {
    const base = s.params;
    const pf = s.perf;
    let errMul = 1, vMul = 1, fumbleMul = 1;
    if (pf) {
      if (pf.kind === 'good') { errMul = 0.55; vMul = 1.12; fumbleMul = 0.45; }
      else if (pf.kind === 'dazed') { errMul = 1.25; vMul = 0.92; fumbleMul = 1.35; }
      else if (pf.kind === 'special' && pf.variant === 'hot' && now < s.hotUntil) { errMul = 0.3; vMul = 1.3; fumbleMul = 0; }
    }
    return {
      think: base.think, err: base.err * errMul,
      maxV: base.maxV * vMul, fumble: base.fumble * fumbleMul
    };
  }

  function dreamAI(s, now) {
    const d = s.dream;
    const b = s.ball;
    const p = effectiveParams(s, now);
    const pred = predictLandingX(s);
    const comingDown = b.vy > 0 && pred != null;
    if (comingDown) {
      let target = pred + s.dreamErr + (s.fumbleOffset || 0);
      // 球会落进玩家半场：梦角只压到中线附近待命，不做无意义横穿
      if (pred < W * 0.42) target = W / 2 + PADDLE_W / 2 + 6;
      d.targetX = clamp(target, W / 2 + PADDLE_W / 2, W - PADDLE_W / 2 - 4);
    } else {
      // 球远离/上行：缓慢回中路偏右待命（小幅游走，减少无意义移动）
      d.targetX = DREAM_HOME_X + Math.sin(now / 2600) * 12;
    }
    // 移动：限速 + 紧急度加成（球快到跟前时提速）；走神期间大幅减速
    let v = p.maxV;
    const dist = Math.abs(d.targetX - d.x);
    if (dist > 140) v *= 1.18;
    if (s.lapseUntil && now < s.lapseUntil) v *= 0.22;
    const step = clamp(d.targetX - d.x, -v, v);
    d.x = clamp(d.x + step, W / 2 + PADDLE_W / 2, W - PADDLE_W / 2 - 4);
  }

  // ---- 字卡泡泡（低概率 + 全局冷却 + 分事件冷却） ----
  function trySay(s, type, prob, now) {
    if (Math.random() > prob) return;
    if (now - s.cardGlobalAt < 9000) return;
    const cd = SAY_COOLDOWN[type] || 0;
    if (cd && now - (s.cardLast[type] || 0) < cd) return;
    s.cardGlobalAt = now;
    s.cardLast[type] = now;
    s.taBubble = { text: pick(SAY_POOLS[type]), until: now + 1500 };
  }

  // ---- 挡板反弹：击中位置决定角度（中央近垂直 / 边缘斜向） ----
  function bouncePaddle(s, px, isPlayer, now) {
    const b = s.ball;
    const hit = clamp((b.x - px) / (PADDLE_W / 2 + BALL_R), -1, 1);
    const sp = levelSpeed(s.level);
    const ang = hit * (Math.PI / 3);   // 最大 60°
    b.vx = Math.sin(ang) * sp;
    b.vy = -Math.cos(ang) * sp;
    b.y = PADDLE_Y - BALL_R - 0.5;
    s.prevVy = b.vy;
    s.dreamErr = 0; s.fumbleOffset = null; s.slipArmed = false;   // 新一段行程
    s.rallyHits++;
    sfxPaddle();
    if (isPlayer) {
      // 边缘惊险救球（|hit|>0.72 且球已很贴近底部）→ 低概率夸奖
      const danger = (PADDLE_Y - b.y) < 26;
      if (hit > 0 && danger && Math.abs(hit) > 0.72) trySay(s, 'save', 0.35, now);
    } else {
      // 梦角接住：低概率短句 + 边缘险接 → nearmiss 池
      if (Math.abs(hit) > 0.78) trySay(s, 'nearmiss', 0.3, now);
      else trySay(s, 'catch', 0.10, now);
      // 合作默契反馈：双方连续成功接球较多时极低概率说一次
      if (s.rallyHits >= 10) trySay(s, 'coop', 0.06, now);
    }
  }

  // ---- 砖块碰撞：圆 vs AABB，按穿透小的轴反弹；命中即扣血 ----
  function brickCollide(s) {
    const b = s.ball;
    for (let i = 0; i < s.bricks.length; i++) {
      const k = s.bricks[i];
      if (k.hp <= 0) continue;
      const cx = clamp(b.x, k.x, k.x + k.w);
      const cy = clamp(b.y, k.y, k.y + k.h);
      const dx = b.x - cx, dy = b.y - cy;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
      // 反弹轴：比较球心到砖面的重叠量
      const overlapX = BALL_R - Math.abs(dx), overlapY = BALL_R - Math.abs(dy);
      if (dx === 0 && dy === 0) { s.ball.vy = -s.ball.vy; }
      else if (overlapY <= overlapX) { b.vy = dy < 0 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y = dy < 0 ? k.y - BALL_R : cy + BALL_R; }
      else { b.vx = dx < 0 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x = dx < 0 ? k.x - BALL_R : cx + BALL_R; }
      k.hp--;
      if (k.hp <= 0) {
        const pts = k.maxHp >= 2 ? 20 : 10;
        s.score += pts;
        s.combo++;
        s.bricksCleared++;
        if (s.combo > s.maxCombo) s.maxCombo = s.combo;
        if (s.combo >= 2) { s.comboFlashUntil = performance.now() + 800; s.lastComboShown = s.combo; }
        s.floaters.push({ x: k.x + k.w / 2, y: k.y + B_H / 2, text: '+' + pts, until: performance.now() + 750 });
        if (s.combo >= 9) trySay(s, 'streak', 0.08, performance.now());
      }
      sfxBrick(k.hp);
      return;   // 每 tick 只处理一块，避免穿角双扣
    }
  }

  // ---- 一步物理更新 ----
  function step(s, now) {
    if (s.status === 'over') return;
    if (s.status === 'serve') {
      if (now >= s.serveAt) serve(s, now);
      return;
    }
    if (s.status === 'clearing') {
      if (now >= s.serveAt) {
        s.level++;
        s.bricks = buildBricks(s.level);
        s.ball.vx = 0; s.ball.vy = 0;
        s.status = 'serve'; s.serveAt = now + 900;
        hintEl.textContent = '第 ' + s.level + ' 层';
      }
      return;
    }
    if (s.status !== 'rally') return;

    // 玩家挡板：键盘持续位移 / 触摸目标追踪
    let pv = 0;
    if (keys.left) pv -= PLAYER_V;
    if (keys.right) pv += PLAYER_V;
    if (pv !== 0) s.player.targetX = clamp(s.player.targetX + pv, PADDLE_W / 2 + 4, W / 2 - PADDLE_W / 2);
    const pdx = clamp(s.player.targetX - s.player.x, -PLAYER_V, PLAYER_V);
    s.player.x = clamp(s.player.x + pdx, PADDLE_W / 2 + 4, W / 2 - PADDLE_W / 2);

    // 梦角：按思考间隔更新（危险=球快速下行时提高频率）
    planDescent(s, now);
    const b = s.ball;
    const urgent = b.vy > 0 && b.y > H * 0.55;
    if (now >= s.dream.nextThinkAt) {
      dreamAI(s, now);
      const p = effectiveParams(s, now);
      const th = urgent ? p.think[0] : rand(p.think[0], p.think[1]);
      s.dream.nextThinkAt = now + th;
    } else {
      dreamAI(s, now);   // 目标不变也要继续朝目标移动（限速在 dreamAI 内）
    }

    // 球移动
    b.x += b.vx; b.y += b.vy;

    // 左右墙 / 顶反弹
    if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx); sfxWall(); }
    if (b.x + BALL_R > W) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); sfxWall(); }
    if (b.y - BALL_R < 0) { b.y = BALL_R; b.vy = Math.abs(b.vy); sfxWall(); }

    brickCollide(s);

    // 挡板碰撞（vy>0 才判，防粘板）
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H + 6) {
      if (Math.abs(b.x - s.player.x) <= PADDLE_W / 2 + BALL_R && b.x < W / 2 + PADDLE_W) bouncePaddle(s, s.player.x, true, now);
      else if (Math.abs(b.x - s.dream.x) <= PADDLE_W / 2 + BALL_R && b.x >= W / 2 - PADDLE_W) bouncePaddle(s, s.dream.x, false, now);
    }
    s.prevVy = b.vy;

    // 球掉出场地 → 生命-1
    if (b.y - BALL_R > H) loseLife(s, now);

    // 清层判定
    if (s.status === 'rally' && !s.bricks.some(k => k.hp > 0)) {
      s.status = 'clearing';
      s.serveAt = now + 1300;
      hintEl.textContent = T('这一层完成！');
      sfxClear();
      trySay(s, 'clear', 0.4, now);
    }
  }

  function loseLife(s, now) {
    s.lives--;
    s.combo = 0;
    s.rallyHits = 0;
    sfxLose();
    // 失误方侧的低概率短句（右半场掉=梦角侧，也含「差点」语义池）
    if (s.ball.x >= W / 2) trySay(s, 'nearmiss', 0.22, now);
    if (s.lives > 0) {
      hintEl.textContent = T('差一点！还剩 ') + s.lives + T(' 次');
      s.ball.vx = 0; s.ball.vy = 0;
      s.status = 'serve';
      s.serveAt = now + 1000;
      trySay(s, 'fail', 0.3, now);
    } else {
      endGame(s, now);
    }
  }

  // ---- 游戏结束：结算面板 + 写入聊天记录 + TA 回应 ----
  function bestKey() { return (window.activePrefix && window.activePrefix() || 'xy-home-v2') + ':brick-best'; }
  function loadBest() { try { return Number(localStorage.getItem(bestKey())) || 0; } catch (e) { return 0; } }
  function endGame(s, now) {
    s.status = 'over';
    stopLoop();
    let best = loadBest();
    const isBest = s.score > best;
    if (isBest) { best = s.score; try { localStorage.setItem(bestKey(), String(best)); } catch (e) {} }
    const body =
      '<div class="pong-end-score">' + s.score + ' 分</div>' +
      '<div class="pong-end-stat">最高连击 ×' + s.maxCombo + ' · 清除砖块 ' + s.bricksCleared + ' 块</div>' +
      '<div class="pong-end-stat">完成层数 ' + (s.level - 1) + ' · 历史最佳 ' + best + ' 分' + (isBest ? ' 🎉新纪录' : '') + '</div>';
    showOverlay(T('游戏结束'), body, '再来一局');
    if (overlayCloseBtn) overlayCloseBtn.hidden = false;
    // 写聊天记录（居中小卡片）+ TA 回应（固定发送，语气随机二选一）
    try {
      if (window.chatAddSystem) {
        window.chatAddSystem(T('双人打砖块 · ') + s.score + ' 分 · 最高连击 ×' + s.maxCombo + ' · 完成第 ' + (s.level - 1) + ' 层', { special: 'brick' });
      }
      if (!s.endReplied) {
        s.endReplied = true;
        setTimeout(() => {
          try { if (window.chatAddIn) window.chatAddIn(pick(['还玩吗？', '再来一局？']), { silent: true }); } catch (e) {}
        }, 800);
      }
    } catch (e) {}
  }

  // ---- 渲染 ----
  function render(s, now) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#101625';
    ctx.fillRect(0, 0, W, H);
    // 中线（区分左右半场，虚线弱化）
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 9]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    // 砖块：普通蓝 / 坚固橙（被打一次后变淡+裂纹）
    for (const k of s.bricks) {
      if (k.hp <= 0) continue;
      const sturdy = k.maxHp >= 2;
      ctx.fillStyle = !sturdy ? '#58a6f0' : k.hp >= 2 ? '#f0a35a' : '#f6c793';
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(k.x, k.y, k.w, 3);
      if (sturdy && k.hp === 1) {
        ctx.strokeStyle = 'rgba(60,30,0,0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(k.x + k.w * 0.3, k.y + 2); ctx.lineTo(k.x + k.w * 0.5, k.y + k.h * 0.55); ctx.lineTo(k.x + k.w * 0.62, k.y + k.h - 2);
        ctx.stroke();
      }
    }
    // 挡板：玩家左（蓝）/ 梦角右（暖橙），带小标签帮助识别半场
    ctx.fillStyle = '#6ea8ff';
    ctx.fillRect(s.player.x - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#ffb27d';
    ctx.fillRect(s.dream.x - PADDLE_W / 2, PADDLE_Y, PADDLE_W, PADDLE_H);
    if ((s.rallyHits || 0) < 6 && s.status !== 'over') {
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(110,168,255,0.85)';
      ctx.fillText('你', s.player.x, PADDLE_Y - 5);
      ctx.fillStyle = 'rgba(255,178,125,0.85)';
      ctx.fillText(taName(), s.dream.x, PADDLE_Y - 5);
    }
    // 球
    const b = s.ball;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    // 发球前提示箭头
    if (s.status === 'serve') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲', W / 2, BALL_HOME_Y + 8);
    }
    // 得分漂浮数字
    for (const f of s.floaters) {
      const left = (f.until - now) / 750;
      if (left <= 0) continue;
      ctx.globalAlpha = Math.min(1, left * 1.6);
      ctx.fillStyle = '#ffe08a';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y - (1 - left) * 18);
      ctx.globalAlpha = 1;
    }
    s.floaters = s.floaters.filter(f => f.until > now);
    // 连击闪现
    if (now < s.comboFlashUntil && s.lastComboShown >= 2) {
      ctx.fillStyle = 'rgba(255,224,138,' + (0.5 + 0.5 * Math.sin(now / 90)).toFixed(2) + ')';
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('COMBO ×' + s.lastComboShown, W / 2, B_TOP + ROWS * (B_H + B_GAP) + 34);
    }
    // TA 泡泡（挡板上方浮现短句）
    if (s.taBubble) {
      if (now < s.taBubble.until) {
        const left = (s.taBubble.until - now) / 1500;
        ctx.save();
        ctx.globalAlpha = Math.min(1, left * 1.6);
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        const bx = clamp(s.dream.x, 46, W - 46);
        const by = PADDLE_Y - 22;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(s.taBubble.text, bx, by);
        ctx.restore();
      } else s.taBubble = null;
    }
    ctx.restore();
  }

  function renderInfo(s) {
    if (!scoreEl) return;
    scoreEl.textContent = s.score;
    if (comboEl) comboEl.textContent = s.combo >= 2 ? '×' + s.combo : '';
    if (livesEl) {
      const full = '❤'.repeat(Math.max(0, s.lives));
      const lost = '<span class="brick-hlost">' + '❤'.repeat(Math.max(0, 3 - s.lives)) + '</span>';
      if (livesEl.dataset.h !== full + (3 - s.lives)) { livesEl.innerHTML = full + lost; livesEl.dataset.h = full + (3 - s.lives); }
    }
    if (levelEl) levelEl.textContent = s.level;
  }

  function loop(ts) {
    if (!running) return;
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    if (!paused) {
      acc += dt;
      const frame = 1000 / FPS;
      let guard = 0;
      while (acc >= frame && guard < 5) { step(state, ts); acc -= frame; guard++; }
    }
    render(state, ts);
    renderInfo(state);
    if (!paused && state.status === 'rally' && hintEl.textContent) hintEl.textContent = '';
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---- Canvas 尺寸适配（DPR 清晰；全屏时按视口算最大尺寸保持比例） ----
  let isFs = false;
  function fitCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const box = canvas.parentElement;
    if (isFs) {
      const availW = window.innerWidth - 16;
      const availH = window.innerHeight - 190;
      let cw = availW, ch = Math.round(cw * H / W);
      if (ch > availH) { ch = availH; cw = Math.round(ch * W / H); }
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      if (box) { box.style.width = cw + 'px'; box.style.height = ch + 'px'; }
    } else {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.style.width = '';
      canvas.style.height = '';
      if (box) { box.style.width = ''; box.style.height = ''; }
    }
  }

  function showOverlay(title, body, btn) {
    if (!overlayEl) return;
    if (overlayTitleEl) overlayTitleEl.innerHTML = title || '';
    if (overlayBodyEl) overlayBodyEl.innerHTML = body || '';
    if (overlayBtnEl) overlayBtnEl.textContent = btn || '开始';
    overlayEl.hidden = false;
  }
  function hideOverlay() { if (overlayEl) overlayEl.hidden = true; }

  // ---- 开始 / 重开（再来一局：全重置、难度保持、重新生成本局发挥） ----
  function startGame() {
    state = newState((diffSel && diffSel.value) || 'easy');
    hideOverlay();
    if (overlayCloseBtn) overlayCloseBtn.hidden = true;
    fitCanvas();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    if (hintEl) hintEl.textContent = '';
    state.status = 'serve';
    state.serveAt = performance.now() + 900;
    running = true; lastTs = 0; acc = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!state || state.status === 'over' || state.status === 'serve') return;
    paused = !paused;
    if (paused) {
      stopLoop();
      if (pauseBtn) pauseBtn.textContent = '▶';
      if (hintEl) hintEl.textContent = '已暂停';
    } else {
      running = true; lastTs = 0; acc = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
      if (pauseBtn) pauseBtn.textContent = '⏸';
      if (hintEl) hintEl.textContent = '';
    }
  }

  function toggleFs() {
    isFs = !isFs;
    panel.classList.toggle('brick-fs', isFs);
    if (fsBtn) fsBtn.textContent = isFs ? '⤢' : '⛶';
    setTimeout(() => { if (panel && !panel.hidden) fitCanvas(); }, 60);
  }

  // ---- 输入：触摸 / 鼠标拖动（画面横向拖动控制玩家挡板，仅左半场有效映射） ----
  function inputX(clientX) {
    if (!state || state.status === 'over') return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * W;
    state.player.targetX = clamp(x, PADDLE_W / 2 + 4, W / 2 - PADDLE_W / 2);
  }
  let touching = false;
  canvas.addEventListener('touchstart', (e) => {
    if (!running || paused) return;
    touching = true;
    const t = e.touches[0];
    if (t) inputX(t.clientX);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!running || paused || !touching) return;
    const t = e.touches[0];
    if (t) inputX(t.clientX);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touching = false; });
  canvas.addEventListener('mousedown', (e) => { if (running && !paused) { touching = true; inputX(e.clientX); } });
  canvas.addEventListener('mousemove', (e) => { if (running && !paused && touching) inputX(e.clientX); });
  window.addEventListener('mouseup', () => { touching = false; });

  // 键盘：A/D 与 ← →
  const keys = { left: false, right: false };
  function keyToDir(k) {
    if (k === 'a' || k === 'arrowleft') return 'left';
    if (k === 'd' || k === 'arrowright') return 'right';
    return null;
  }
  document.addEventListener('keydown', (e) => {
    if (!running || paused || !panel || panel.hidden) return;
    const dir = keyToDir(e.key.toLowerCase());
    if (dir) { keys[dir] = true; e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => {
    const dir = keyToDir(e.key.toLowerCase());
    if (dir) keys[dir] = false;
  });

  // ---- 按钮 ----
  if (diffSel) diffSel.addEventListener('change', () => {
    // 进行中切换难度即时生效（下次思考起用新参数）；结束后只影响下一局
    if (state && state.status !== 'over') state.params = DIFFS[diffSel.value] || DIFFS.easy;
  });
  if (soundBtn) soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundBtn.style.opacity = soundOn ? '' : '.5';
  });
  // 覆盖层主按钮：开始新局 / 恢复进行中对局（resumeFn 非空时优先恢复，一次性）
  let resumeFn = null;
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBrickPanel(); });
  if (overlayBtnEl) overlayBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (resumeFn) { const f = resumeFn; resumeFn = null; f(); }
    else startGame();
  });
  function armResume(fn) { resumeFn = fn; }
  if (overlayCloseBtn) overlayCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBrickPanel(); });
  if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  if (fsBtn) fsBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFs(); });

  // 切后台自动暂停（回来自动恢复太突兀，保持暂停由玩家自己继续）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && running && !paused && state && state.status === 'rally') togglePause();
  });

  // ---- 入口（供 chat.js 调用） ----
  // 只读调试口（tools/verify-brick.mjs 专用：读取/注入 state 跑确定性用例）
  window.__brickDebug = {
    get state() { return state; },
    get running() { return running; },
    get paused() { return paused; }
  };
  window.openBrickPanel = function () {
    if (!panel) return;
    let name = taName();
    try {
      const st = window.activeStore && window.activeStore();
      name = (st && (st.get('cs-lbl-partner') || st.get('lbl-partner'))) || name;
    } catch (e) {}
    if (partnerNameEl) partnerNameEl.textContent = name;
    if (footNameEl) footNameEl.textContent = name;
    if (isFs) toggleFs();
    panel.hidden = false;
    fitCanvas();
    stopLoop();
    paused = false;
    if (pauseBtn) pauseBtn.textContent = '⏸';
    if (state && state.status !== 'over' && state.lives > 0 && state.bricksCleared + state.score > 0) {
      // 同一会话内有进行中的对局：直接回到暂停态让玩家选择
      showOverlay(T('双人打砖块'), '<div class="pong-start-tip">进行中 · ' + state.score + ' 分 · 第 ' + state.level + ' 层</div>', '继续');
      armResume(function () {
        hideOverlay();
        paused = false;
        running = true; lastTs = 0; acc = 0;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
        if (pauseBtn) pauseBtn.textContent = '⏸';
      });
      if (overlayCloseBtn) overlayCloseBtn.hidden = true;
      return;
    }
    const best = loadBest();
    armResume(null);
    showOverlay(T('双人打砖块'),
      '<div class="pong-start-tip">你和' + T('TA') + '各守半场接同一颗球<br>清光砖块进入下一层 · 共 3 次失误机会</div>' +
      '<div class="pong-start-ctrl">手机：按住画面左右拖动<br>电脑：A/D 或 ← →</div>' +
      (best > 0 ? '<div class="pong-end-stat">历史最佳 ' + best + ' 分</div>' : ''),
      '开始');
    if (overlayCloseBtn) overlayCloseBtn.hidden = true;
  };
  window.closeBrickPanel = function () {
    stopLoop();
    if (isFs) toggleFs();
    if (panel) panel.hidden = true;
  };
  // 切换联系人桌面时关闭（chat.js 会触发 contact-switched）
  document.addEventListener('contact-switched', () => { try { closeBrickPanel(); } catch (e) {} });
  window.addEventListener('resize', () => { if (panel && !panel.hidden) fitCanvas(); });
})();

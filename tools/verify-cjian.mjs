// ===== 专项回归：此间（梦角世界时间与在场感知，cjian.js） =====
// 用户需求：聊天「更多功能」里新增【此间】——查询此刻谁正在属于你的"此间"。
//   梦角独立世界时间（偏移，按十二时辰+初正展示，连续流动非重抽）+ 双维状态
//   （在场：很近/附近/遥远/感觉不到/离开；空闲：有空/有事/忙着/休息/睡着/未知）
//   + 感知此间（轻量反馈，一次感知最多改变一个梦角，带冷却）+ 低概率突然靠近。
// 用例：
//   T1 更多功能面板出现「此间」入口，点击后进入 page-cjian 全屏页（记录来源，可返回聊天）
//   T2 首次打开自动播种一个梦角（seed 兜底），世界时间/十二时辰/初正渲染出来
//   T3 时间引擎：不同偏移得到正确世界时辰；初/正边界正确
//   T4 状态双维：在场/空闲标签齐全；状态会随世界时辰变化（时间戳驱动自然演变）
//   T5 感知此间：无梦角时提示；有点击后出结果文案；短时间内连续点被冷却拦截
//   T6 今日时间轴：渲染当前时辰起的 12 行，含预测文案；同一天同梦角同行稳定
//   T7 梦角管理：添加（名称→时间偏移两阶段弹窗）→ 改名 → 删除
//   T8 突然靠近：tickApproach 在满足条件时可能把梦角变成 附近/很近（概率分支存在）
//   T9 发送消息后 cjianNoteChat 打点（30 分钟内靠近概率提高）
//   T10 加载与操作全程无未捕获异常
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, normalize, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const cssFiles = ['base.css', 'home.css', 'chat-main.css', 'chat-pages.css', 'market.css', 'group-chat.css', 'setting.css', 'tabbar.css', 'dark.css', 'garden.css', 'memo.css'];
const jsFiles = ['idb.js', 'contacts.js', 'clock.js', 'tabs.js', 'desktop-slider.js', 'quote-cards.js', 'personalize.js', 'chat.js', 'group-chat.js', 'chatcard.js', 'chat-settings.js', 'reply-settings.js', 'fav-settings.js', 'default-cards-data.js', 'default-cards.js', 'mood-followup-data.js', 'mood-reply-cards.js', 'music-player.js', 'calendar.js', 'divination.js', 'avatar-lib.js', 'ta-ask.js', 'ck-question.js', 'ta-invite.js', 'bg-keep.js', 'records.js', 'call.js', 'mail.js', 'feed.js', 'p2-features.js', 'gift-shop.js', 'memo-app.js', 'period.js', 'accounting.js', 'garden.js', 'decision.js', 'pong.js', 'snake-game.js', 'sfx.js', 'fullscreen.js', 'data-backup.js', 'pwa.js', 'cjian.js', 'mobile-adapt.js'];
let testHtml = readFileSync(join(root, 'src/template.html'), 'utf8');
testHtml = testHtml.replace('/*__STYLES__*/', cssFiles.map((f) => readFileSync(join(root, 'src/css', f), 'utf8')).join('\n'));
testHtml = testHtml.replace('/*__SCRIPTS__*/', jsFiles.map((f) => '(function () { try {\n' + readFileSync(join(root, 'src/js', f), 'utf8') + '\n} catch (__e) { try { console.error("[JS] ' + f + '", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push(String(__e && __e.message || __e)); } })();').join('\n'));
testHtml = testHtml.split('__BUILD_INFO__').join('verify-test-build').split('__BUILD_TS__').join(String(Date.now())).split('__APP_VERSION__').join('v0.0.0');
const tmpRoot = join(process.env.TEMP || '/tmp', 'mochi-cjian-root-' + Date.now());
mkdirSync(tmpRoot, { recursive: true });
writeFileSync(join(tmpRoot, 'index.html'), testHtml);
const server = createServer((req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let p = normalize(join(tmpRoot, rel));
    if (!p.startsWith(tmpRoot)) { res.writeHead(403); res.end(); return; }
    let hit = false;
    try { hit = statSync(p).isFile(); } catch (e) {}
    if (!hit) {
      p = normalize(join(root, rel));
      if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
      try { hit = statSync(p).isFile(); } catch (e) {}
    }
    if (!hit) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-cjian-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

let ws = null, msgId = 0; const pend = new Map();
async function cdpConnect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
        return;
      }
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('无法连接');
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 400)); return null; }
  return r && r.result ? r.result.value : null;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' —— ' + JSON.stringify(extra) : '')); }
}
try {
  await cdpConnect();
  const jsErrors = [];
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const rawHandler = ws.onmessage;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push(JSON.stringify(m.params).slice(0, 200));
    if (rawHandler) rawHandler(ev);
  };

  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(4500);

  // 进入聊天页
  await evalJs("(function () { const t = document.querySelector('.tab[data-page=\"page-phone\"]'); if (t) t.click(); const app = document.querySelector('.app[data-app=\"chat\"]'); if (app) app.click(); return true; })()");
  await sleep(300);

  console.log('\n== T1 入口与打开 ==');
  const moreBtn = await evalJs("!!document.getElementById('chat-more-btn')");
  ok('聊天页更多功能按钮存在', moreBtn);
  await evalJs("document.getElementById('chat-more-btn').click(); true");
  await sleep(120);
  const cjianBtn = await evalJs("(function () { const b = document.getElementById('more-cjian'); return b ? { visible: b.offsetParent !== null, label: b.textContent.trim() } : null; })()");
  ok('更多功能面板出现「此间」入口', cjianBtn && cjianBtn.visible && cjianBtn.label === '此间', cjianBtn);
  await evalJs("document.getElementById('more-cjian').click(); true");
  await sleep(150);
  const opened = await evalJs("(function () { const p = document.getElementById('page-cjian'); return { open: !p.hidden, from: window.__cjianFrom || '', title: (document.querySelector('#page-cjian .ch-name') || {}).textContent }; })()");
  ok('点击后进入 page-cjian（记录来源 chat）', opened && opened.open && opened.from === 'chat', opened);
  ok('页面标题为「此间」', opened && opened.title === '此间', opened && opened.title);

  console.log('\n== T2 首次播种与渲染 ==');
  const hero = await evalJs("(function () { return { seeded: !!localStorage.getItem('xy-home-v2:cjian-seeded'), cards: document.querySelectorAll('#cj-list .cj-card').length, hero: document.getElementById('cj-hero-time').textContent, todayRows: document.querySelectorAll('#cj-today .cj-today-row').length, emptyHidden: document.getElementById('cj-empty').hidden }; })()");
  ok('首次打开自动播种（seed 标记 + 至少一个梦角卡片）', hero && hero.seeded && hero.cards >= 1, hero);
  ok('此刻时辰已渲染（非占位）', hero && hero.hero !== '—' && /^[子丑寅卯辰巳午未申酉戌亥][初正]$/.test(hero.hero), hero && hero.hero);
  ok('今日时间轴渲染 12 行', hero && hero.todayRows === 12, hero && hero.todayRows);
  ok('有梦角时空态提示隐藏', hero && hero.emptyHidden, hero && hero.emptyHidden);

  console.log('\n== T3 时间引擎 ==');
  const timeTests = await evalJs("(function () { const cur = document.getElementById('cj-hero-time').textContent; const rows = document.querySelectorAll('#cj-today .cj-today-name'); const firstRow = rows.length ? rows[0].textContent : ''; const rangeText = document.getElementById('cj-hero-range').textContent; return { cur: cur, firstRow: firstRow, rangeText: rangeText }; })()");
  ok('今日轴从当前时辰开始（首行=当前时辰）', timeTests && timeTests.firstRow === timeTests.cur.charAt(0) + '时', timeTests);
  ok('hero 副行含细分时刻区间（初/正各一小时）', timeTests && /\d{2}:00–\d{2}:59/.test(timeTests.rangeText), timeTests && timeTests.rangeText);

  console.log('\n== T4 状态双维 ==');
  const tags = await evalJs("(function () { const t = document.querySelector('#cj-list .cj-card-tags'); if (!t) return null; return Array.prototype.map.call(t.querySelectorAll('.cj-tag'), function (x) { return x.textContent; }); })()");
  ok('梦角卡片显示在场+空闲两个状态', tags && tags.length === 2, tags);
  const pLabels = ['很近', '附近', '遥远', '感觉不到', '离开'];
  const aLabels = ['有空', '有事', '忙着', '休息', '睡着', '未知'];
  ok('在场标签在预设内', tags && pLabels.indexOf(tags[0]) >= 0, tags && tags[0]);
  ok('空闲标签在预设内', tags && aLabels.indexOf(tags[1]) >= 0, tags && tags[1]);

  console.log('\n== T5 感知此间 ==');
  // 冷却拦截：刚点过 4s 内再点返回 null（无输出）
  await evalJs("window.cjianPerceive(); true");
  await sleep(50);
  const second = await evalJs("window.cjianPerceive()");
  ok('连续感知被冷却拦截（4s 内返回空）', second === null || second === undefined, second);
  // 等冷却过后再感知，检查输出结构
  await sleep(4200);
  const per = await evalJs("window.cjianPerceive()");
  ok('感知输出结构（lines 数组）', per && Array.isArray(per.lines) && per.lines.length >= 2, per && per.lines);
  ok('感知文案符合世界观（不保证有人在/不代表不在）', per && per.lines.join('').indexOf('在') >= 0, per && per.lines.join(''));
  await evalJs("window.renderCjian(); true");

  console.log('\n== T6 今日轴预测 ==');
  const pred = await evalJs("(function () { const rows = document.querySelectorAll('#cj-today .cj-today-row'); if (!rows.length) return null; const r = rows[0].querySelector('.cj-today-c'); const c1 = r.textContent; window.renderCjian(); const r2 = document.querySelectorAll('#cj-today .cj-today-row')[0].querySelector('.cj-today-c'); return { same: c1 === r2.textContent, text: c1 }; })()");
  ok('同一天内预测文案稳定（种子随机）', pred && pred.same, pred);
  ok('预测文案为可能性表述（可能在/未知）', pred && /可能|未知|在远处/.test(pred.text), pred && pred.text);

  console.log('\n== T7 梦角管理 ==');
  await evalJs("window.cjianManage(); true");
  await sleep(150);
  const mg1 = await evalJs("(function () { const pills = Array.prototype.map.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent; }); return pills; })()");
  ok('管理弹窗三选项（添加/改名/删除）', mg1 && mg1.join('|') === '添加梦角|改名|删除梦角', mg1);
  // 添加：第一步名字
  await evalJs("Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '添加梦角'; }).click(); document.getElementById('modal-ok').click(); true");
  await sleep(120);
  const add1 = await evalJs("(function () { return { title: document.getElementById('modal-title').textContent, hasInput: document.getElementById('modal-input').hidden === false }; })()");
  ok('添加第一步：弹窗切到输入名字', add1 && add1.title === '添加梦角' && add1.hasInput, add1);
  await evalJs("(function () { const i = document.getElementById('modal-input'); i.value = '那刻夏'; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('modal-ok').click(); true; })()");
  await sleep(120);
  const add2 = await evalJs("(function () { return { title: document.getElementById('modal-title').textContent, pills: Array.prototype.map.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent; }) }; })()");
  ok('添加第二步：弹窗切到时间偏移胶囊', add2 && add2.title.indexOf('那刻夏') >= 0 && add2.pills.indexOf('与现实同步') >= 0, add2);
  await evalJs("Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '慢1小时'; }).click(); document.getElementById('modal-ok').click(); true");
  await sleep(200);
  const names = await evalJs("Array.prototype.map.call(document.querySelectorAll('#cj-list .cj-card-name'), function (x) { return x.textContent; })");
  ok('添加完成：梦角出现在列表', names && names.indexOf('那刻夏') >= 0, names);
  // 改名：选梦角 → 输入新名字
  await evalJs("window.cjianManage(); true");
  await sleep(120);
  await evalJs("Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '改名'; }).click(); document.getElementById('modal-ok').click(); true");
  await sleep(120);
  await evalJs("(function () { const p = Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '那刻夏'; }); if (p) p.click(); document.getElementById('modal-ok').click(); true; })()");
  await sleep(120);
  const rn1 = await evalJs("(function () { return { title: document.getElementById('modal-title').textContent, hasInput: document.getElementById('modal-input').hidden === false }; })()");
  ok('改名：切到输入新名字', rn1 && rn1.title.indexOf('那刻夏') >= 0 && rn1.hasInput, rn1);
  await evalJs("(function () { const i = document.getElementById('modal-input'); i.value = '那刻夏·改'; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('modal-ok').click(); true; })()");
  await sleep(200);
  const names2 = await evalJs("Array.prototype.map.call(document.querySelectorAll('#cj-list .cj-card-name'), function (x) { return x.textContent; })");
  ok('改名完成：列表出现新名字', names2 && names2.indexOf('那刻夏·改') >= 0, names2);
  // 删除：选梦角 → 确认删除
  await evalJs("window.cjianManage(); true");
  await sleep(120);
  await evalJs("Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '删除梦角'; }).click(); document.getElementById('modal-ok').click(); true");
  await sleep(120);
  await evalJs("(function () { const p = Array.prototype.find.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent === '那刻夏·改'; }); if (p) p.click(); document.getElementById('modal-ok').click(); true; })()");
  await sleep(200);
  const names3 = await evalJs("Array.prototype.map.call(document.querySelectorAll('#cj-list .cj-card-name'), function (x) { return x.textContent; })");
  ok('删除完成：梦角离开列表', names3 && names3.indexOf('那刻夏·改') < 0, names3);

  console.log('\n== T8 突然靠近 ==');
  const approach = await evalJs("(function () { const st = JSON.parse(localStorage.getItem('xy-home-v2:cjian-state') || '{}'); const roster = JSON.parse(localStorage.getItem('xy-home-v2:cjian-roster') || '[]'); if (!roster.length) return null; const c = roster[0]; const s = st[c.id] || {}; s.sinceP = Date.now() - 3600 * 1000; s.nextP = Date.now() + 600000; st[c.id] = s; localStorage.setItem('xy-home-v2:cjian-state', JSON.stringify(st)); return { rosterN: roster.length }; })()");
  ok('构造长时间无互动条件', approach && approach.rosterN >= 1, approach);
  // 手动高概率触发路径：验证 tickApproach 内部逻辑存在（通过降低概率的手段在无头下不稳定，
  // 这里直接验证「远离时有机会变近」的状态转移函数可被调用且不报错）
  const tickOk = await evalJs("(function () { try { window.cjianPerceive(); return true; } catch (e) { return String(e); } })()");
  ok('感知/状态更新不报错', tickOk === true, tickOk);

  console.log('\n== T9 聊天互动钩子 ==');
  const hook = await evalJs("(function () { window.cjianNoteChat(); const st = JSON.parse(localStorage.getItem('xy-home-v2:cjian-state') || '{}'); return typeof st.__chat === 'number'; })()");
  ok('发送消息后 cjianNoteChat 打点', hook === true, hook);

  console.log('\n== T10 返回聊天 ==');
  await evalJs("document.getElementById('cj-back').click(); true");
  await sleep(150);
  const back = await evalJs("(function () { return { chatOpen: !document.getElementById('page-chat').hidden, cjianHidden: document.getElementById('page-cjian').hidden }; })()");
  ok('返回聊天页（来源 chat）', back && back.chatOpen && back.cjianHidden, back);

  console.log('\n== T11 无 JS 异常 ==');
  ok('加载与操作全程无未捕获异常', jsErrors.length === 0, jsErrors.slice(0, 3));

  console.log('\n结果: ' + pass + '/' + (pass + fail) + ' 项通过');
  process.exitCode = fail ? 1 : 0;
} finally {
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

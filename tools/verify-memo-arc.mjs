// ===== 专项回归：梦角档案（memo-arc）顶部梦角切换 + 所有桌面数据互通 =====
// 用户需求：【梦角档案】需要所有桌面数据互通方便记录，顶部显示所有梦角名字点击切换。
// 用例：
//   T1 桌面第三页「梦角档案」图标存在，点击进入 page-memo-arc
//   T2 顶部名字切换栏：预置 3 个梦角 → 打开后 chips 全部显示（名字 + ＋ 添加）
//   T3 点击其它梦角 chip → 当前名字与档案内容切换为该梦角
//   T4 数据互通（核心）：切换桌面（setActiveContact）后重新打开 → 仍显示全部梦角、档案不丢
//   T5 记录归属正确：给梦角A记一条了解 → 切到B不串 → 切回A记录仍在
//   T6 与「此间」共享 roster：管理弹窗同源（＋ 添加走 cjianManage）
//   T7 全程无未捕获异常
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
const cssFiles = ['base.css', 'home.css', 'chat-main.css', 'chat-pages.css', 'market.css', 'group-chat.css', 'setting.css', 'tabbar.css', 'dark.css', 'garden.css', 'memo.css', 'memo-arc.css'];
const jsFiles = ['idb.js', 'contacts.js', 'clock.js', 'tabs.js', 'desktop-slider.js', 'quote-cards.js', 'personalize.js', 'chat.js', 'group-chat.js', 'chatcard.js', 'chat-settings.js', 'reply-settings.js', 'fav-settings.js', 'default-cards-data.js', 'default-cards.js', 'mood-followup-data.js', 'mood-reply-cards.js', 'music-player.js', 'calendar.js', 'divination.js', 'avatar-lib.js', 'ta-ask.js', 'ck-question.js', 'ta-invite.js', 'bg-keep.js', 'records.js', 'call.js', 'mail.js', 'feed.js', 'loc-lib.js', 'p2-features.js', 'gift-shop.js', 'memo-app.js', 'memo-arc.js', 'period.js', 'accounting.js', 'garden.js', 'decision.js', 'pong.js', 'snake-game.js', 'sfx.js', 'fullscreen.js', 'data-backup.js', 'pwa.js', 'cjian.js', 'mobile-adapt.js'];
let testHtml = readFileSync(join(root, 'src/template.html'), 'utf8');
testHtml = testHtml.replace('/*__STYLES__*/', cssFiles.map((f) => readFileSync(join(root, 'src/css', f), 'utf8')).join('\n'));
testHtml = testHtml.replace('/*__SCRIPTS__*/', jsFiles.map((f) => '(function () { try {\n' + readFileSync(join(root, 'src/js', f), 'utf8') + '\n} catch (__e) { try { console.error("[JS] " + f, __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push(String(__e && __e.message || __e)); } })();').join('\n'));
testHtml = testHtml.split('__BUILD_INFO__').join('verify-test-build').split('__BUILD_TS__').join(String(Date.now())).split('__APP_VERSION__').join('v0.0.0');
const tmpRoot = join(process.env.TEMP || '/tmp', 'mochi-narc-root-' + Date.now());
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-narc-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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

  console.log('\n== T1 桌面入口 ==');
  const icon = await evalJs("(function () { const i = document.querySelector('.app[data-app=\"memo-arc\"]'); return i ? { exists: true, name: (i.querySelector('.app-name') || {}).textContent } : null; })()");
  ok('桌面第三页「梦角档案」图标存在', icon && icon.name === '梦角档案', icon);

  // 预置 3 个梦角 + 各自档案（含一条「了解」记录），根命名空间共享
  // （v3.14.x 起此间按桌面分离、启动时各桌自动播种——先清掉 default 桌自动播种的
  //   名单，保证本用例的 chips 断言只看到预置的 3 个；memo-arc 合并读取含根键兜底）
  await evalJs(`(function () {
    const G = 'xy-home-v2';
    const mk = (id, name) => ({ id: id, name: name, offsetMin: 0 });
    const R = [mk('dAAA1', '景元'), mk('dBBB2', '丹恒'), mk('dCCC3', '三月七')];
    // 注意不能 removeItem——xyStore 读内存缓存优先级高于「键不存在」，直接置空名单才生效
    localStorage.setItem(G + ':default:cjian-roster', '[]');
    localStorage.setItem(G + ':cjian-roster', JSON.stringify(R));
    localStorage.setItem(G + ':narc-cur', 'dAAA1');
    const arcA = { created: Date.now() - 5 * 86400000, loves: [{ id: 'n1', type: 'habit', text: '不太喜欢被催着做决定', level: 1, created: Date.now() - 86400000, updated: Date.now() - 86400000, status: 'active', revisions: [] }], bonds: [], moments: [], records: [], wonders: [], history: [] };
    const arcB = { created: Date.now() - 2 * 86400000, loves: [{ id: 'n2', type: 'like', text: '喜欢睡前听一段雨声', level: 0, created: Date.now(), updated: Date.now(), status: 'active', revisions: [] }], bonds: [], moments: [], records: [], wonders: [], history: [] };
    const arcC = { created: Date.now() - 1 * 86400000, loves: [], bonds: [], moments: [], records: [], wonders: [], history: [] };
    localStorage.setItem(G + ':narc-dAAA1', JSON.stringify(arcA));
    localStorage.setItem(G + ':narc-dBBB2', JSON.stringify(arcB));
    localStorage.setItem(G + ':narc-dCCC3', JSON.stringify(arcC));
    return true;
  })()`);

  console.log('\n== T2 顶部名字切换栏 ==');
  await evalJs("window.openNarc(); true");
  await sleep(250);
  const chips = await evalJs("(function () { return Array.prototype.map.call(document.querySelectorAll('#narc-root .narc-chip'), function (b) { return b.textContent.trim(); }); })()");
  ok('顶部 chips 显示全部 3 个梦角名字 + 添加', chips && chips.join('|') === '景元|丹恒|三月七|＋ 添加', chips);
  const onChip = await evalJs("(function () { const on = document.querySelector('#narc-root .narc-chip.on'); return on ? on.textContent.trim() : null; })()");
  ok('默认选中已记录当前梦角（景元）', onChip === '景元', onChip);
  const hero1 = await evalJs("(function () { const h = document.querySelector('#narc-root .narc-name'); return h ? h.textContent : null; })()");
  ok('概览显示当前梦角名字', hero1 === '景元', hero1);

  console.log('\n== T3 点击切换 ==');
  await evalJs("(function () { const chips = document.querySelectorAll('#narc-root .narc-chip'); for (let i = 0; i < chips.length; i++) { if (chips[i].textContent.trim() === '丹恒') { chips[i].click(); break; } } return true; })()");
  await sleep(200);
  const hero2 = await evalJs("(function () { return { name: document.querySelector('#narc-root .narc-name').textContent, text: document.querySelector('#narc-root .nk-text') ? document.querySelector('#narc-root .nk-text').textContent : null, cur: localStorage.getItem('xy-home-v2:narc-cur') }; })()");
  ok('点击「丹恒」后概览名字切换', hero2 && hero2.name === '丹恒', hero2 && hero2.name);
  ok('内容切换为丹恒的档案（雨声记录）', hero2 && hero2.text === '喜欢睡前听一段雨声', hero2 && hero2.text);
  ok('当前梦角已持久化（narc-cur=丹恒）', hero2 && hero2.cur === 'dBBB2', hero2 && hero2.cur);

  console.log('\n== T4 所有桌面数据互通（核心） ==');
  // 切到另一个桌面（联系人），再打开梦角档案
  await evalJs("(function () { if (window.setActiveContact) window.setActiveContact('other-desk'); return window.__activeCid; })()");
  await sleep(250);
  await evalJs("window.openNarc(); true");
  await sleep(250);
  const afterSwitch = await evalJs("(function () { return { chips: Array.prototype.map.call(document.querySelectorAll('#narc-root .narc-chip'), function (b) { return b.textContent.trim(); }), name: document.querySelector('#narc-root .narc-name') ? document.querySelector('#narc-root .narc-name').textContent : null }; })()");
  ok('切换桌面后顶部仍显示全部梦角', afterSwitch && afterSwitch.chips.join('|') === '景元|丹恒|三月七|＋ 添加', afterSwitch && afterSwitch.chips);
  ok('切换桌面后当前档案不丢（仍是丹恒）', afterSwitch && afterSwitch.name === '丹恒', afterSwitch && afterSwitch.name);
  const nsCheck = await evalJs("(function () { return { rootNarc: !!localStorage.getItem('xy-home-v2:narc-dBBB2'), deskNarc: !!localStorage.getItem('xy-home-v2:other-desk:narc-dBBB2') }; })()");
  ok('档案键存根命名空间（非桌面隔离键）', nsCheck && nsCheck.rootNarc && !nsCheck.deskNarc, nsCheck);

  console.log('\n== T5 记录归属不串桌 ==');
  // 给当前（丹恒）加一条记录，切到景元再看，再切回丹恒
  await evalJs(`(function () {
    const G = 'xy-home-v2';
    const arc = JSON.parse(localStorage.getItem(G + ':narc-dBBB2'));
    arc.records.push({ id: 'r1', text: '今天一起看了海', date: '8月25日', created: Date.now() });
    localStorage.setItem(G + ':narc-dBBB2', JSON.stringify(arc));
    return true;
  })()`);
  await evalJs("window.openNarc(); true"); // 已在丹恒，先渲染
  await sleep(150);
  await evalJs("document.querySelector('#narc-root .narc-navchip[data-view=\"records\"]').click(); true");
  await sleep(150);
  const recB = await evalJs("(function () { const t = document.querySelector('#narc-root .nk-text') || document.querySelector('#narc-root .ni-text'); return t ? t.textContent : null; })()");
  ok('丹恒档案出现新记录', recB === '今天一起看了海', recB);
  await evalJs("(function () { const chips = document.querySelectorAll('#narc-root .narc-chip'); for (let i = 0; i < chips.length; i++) { if (chips[i].textContent.trim() === '景元') { chips[i].click(); break; } } return true; })()");
  await sleep(150);
  const recA = await evalJs("(function () { const t = document.querySelector('#narc-root .nk-text') || document.querySelector('#narc-root .ni-text'); return t ? t.textContent : null; })()");
  ok('切到景元不串入丹恒记录', recA !== '今天一起看了海', recA);
  await evalJs("(function () { const chips = document.querySelectorAll('#narc-root .narc-chip'); for (let i = 0; i < chips.length; i++) { if (chips[i].textContent.trim() === '丹恒') { chips[i].click(); break; } } return true; })()");
  await sleep(150);
  await evalJs("document.querySelector('#narc-root .narc-navchip[data-view=\"records\"]').click(); true");
  await sleep(150);
  const recB2 = await evalJs("(function () { const t = document.querySelector('#narc-root .nk-text') || document.querySelector('#narc-root .ni-text'); return t ? t.textContent : null; })()");
  ok('切回丹恒记录仍在', recB2 === '今天一起看了海', recB2);

  console.log('\n== T6 与「此间」共享梦角名单 ==');
  await evalJs("(function () { const chips = document.querySelectorAll('#narc-root .narc-chip'); for (let i = 0; i < chips.length; i++) { if (chips[i].textContent.trim() === '＋ 添加') { chips[i].click(); break; } } return true; })()");
  await sleep(200);
  const mg = await evalJs("(function () { const pills = Array.prototype.map.call(document.querySelectorAll('#modal-pills .pill'), function (b) { return b.textContent; }); return pills; })()");
  ok('＋ 添加 打开「此间」同款梦角管理弹窗（添加/改名/删除）', mg && mg.join('|') === '添加梦角|改名|删除梦角', mg);
  await evalJs("(function () { const p = document.querySelector('#modal-pills .pill'); if (p) p.click(); return true; })()"); // 关闭：点第一个选项
  await sleep(100);
  // 通过 cjianManage 添加一个梦角，验证 memo-arc chips 同步
  await evalJs(`(function () {
    const G = 'xy-home-v2';
    const R = JSON.parse(localStorage.getItem(G + ':cjian-roster') || '[]');
    R.push({ id: 'dNEW9', name: '停云', offsetMin: 0 });
    localStorage.setItem(G + ':cjian-roster', JSON.stringify(R));
    localStorage.removeItem(G + ':narc-cur');
    return true;
  })()`);
  await evalJs("window.openNarc(); true");
  await sleep(200);
  const chipsAfterAdd = await evalJs("(function () { return Array.prototype.map.call(document.querySelectorAll('#narc-root .narc-chip'), function (b) { return b.textContent.trim(); }); })()");
  ok('此间新增梦角后，梦角档案顶部同步出现', chipsAfterAdd && chipsAfterAdd.indexOf('停云') >= 0, chipsAfterAdd);

  console.log('\n== T7 无未捕获异常 ==');
  ok('全程无未捕获异常', jsErrors.length === 0, jsErrors.slice(0, 3));

  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
} finally {
  try { server.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
}
process.exit(fail ? 1 : 0);

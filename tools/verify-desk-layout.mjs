// ===== 验证脚本：桌面小组件顺序刷新后保持（v3.8.x 修复） =====
// 复现用户反馈：排好组件顺序（如把音乐从第二页移到第一页 quote-row 之后），
// 刷新/重新打开顺序错乱。
// 根因：applyDeskLayout 只移动「不在本页」的节点；已在页内的节点即使顺序与
// desk-layout 不一致也不重排，且第 0/1 页无 .desk-page-add，移入节点被 append 到页尾。
// 用法：node build.mjs && node tools/verify-desk-layout.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAYOUT_KEY = 'xy-home-v2:default:desk-layout';

// ---- 1. 找浏览器 ----
const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

// ---- 2. 静态服务器 ----
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

// ---- 3. 无头 Chrome + CDP ----
const cdpPort = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-desk-layout-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pend = new Map();
async function cdpConnect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
        };
        return;
      }
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('无法连接无头浏览器');
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) return { err: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'exception' };
  return r && r.result ? r.result.value : null;
}

// ---- 4. 工具 ----
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    const ready = await evalJs('window.__mochiDataReady === true');
    if (ready) return true;
    await sleep(200);
  }
  return false;
}
async function gotoPage() {
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(1200);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

// ---- 5. 测试 ----
await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await gotoPage();
if (!(await waitReady())) { console.log('页面未就绪，终止'); process.exit(1); }

// 5.1 注入用户排好的布局：music 从第二页移到第一页 quote-row 之后
//     （apps 整组 + grid 内 app-* 由原有跳过逻辑保护，这里仅测跨页移入 + 页内重排）
const layout = JSON.stringify([
  ['deco', 'quote-row', 'music', 'checkin', 'apps'],
  ['p2apps', 'memo-row', 'week', 'weekend']
]);
await evalJs('localStorage.setItem(' + JSON.stringify(LAYOUT_KEY) + ', ' + JSON.stringify(layout) + ')');
await cdp('Page.reload');
await sleep(1500);
await waitReady();

// 读取第一页 widget 顺序（只取布局中的 key，过滤 grid 内 app-*）
const orderExpr = `(() => {
  const slide = document.querySelectorAll('#desktop-pages .page-slide')[0];
  if (!slide) return 'NO_SLIDE';
  const want = ${JSON.stringify(['deco', 'quote-row', 'music', 'checkin', 'apps'])};
  return Array.from(slide.querySelectorAll('[data-desk-widget]'))
    .map(n => n.getAttribute('data-desk-widget'))
    .filter(w => want.indexOf(w) >= 0)
    .join(',');
})()`;
const order1 = await evalJs(orderExpr);
check('刷新后第一页顺序 = deco,quote-row,music,checkin,apps', order1 === 'deco,quote-row,music,checkin,apps', '实际: ' + order1);

// 5.2 二次刷新（模拟重新打开）顺序保持
await cdp('Page.reload');
await sleep(1500);
await waitReady();
const order2 = await evalJs(orderExpr);
check('再次刷新顺序仍保持', order2 === 'deco,quote-row,music,checkin,apps', '实际: ' + order2);

// 5.3 第二页不再含 music
const p2Expr = `(() => {
  const slide = document.querySelectorAll('#desktop-pages .page-slide')[1];
  if (!slide) return 'NO_SLIDE';
  return Array.from(slide.querySelectorAll('[data-desk-widget]')).map(n => n.getAttribute('data-desk-widget')).join(',');
})()`;
const p2 = await evalJs(p2Expr);
// 注意：第二页 p2 网格内仍有 app-music（功能图标），断言只检查 music 播放器组件本身
const p2HasMusic = (await evalJs(`(() => {
  const slide = document.querySelectorAll('#desktop-pages .page-slide')[1];
  if (!slide) return null;
  return Array.from(slide.querySelectorAll('[data-desk-widget]')).map(n => n.getAttribute('data-desk-widget')).indexOf('music') >= 0;
})()`));
check('第二页已移除 music 播放器组件', p2HasMusic === false, '实际: ' + p2);

// 5.4 默认布局（无 desk-layout）不受影响：清掉后刷新应保持 template 顺序
await evalJs('localStorage.removeItem(' + JSON.stringify(LAYOUT_KEY) + ')');
await cdp('Page.reload');
await sleep(1500);
await waitReady();
const order3 = await evalJs(orderExpr);
check('无自定义布局时保持默认顺序（deco,quote-row,checkin,apps）', order3 === 'deco,quote-row,checkin,apps', '实际: ' + order3);

// ---- 6. 汇总 ----
const failed = results.filter((r) => !r.ok);
console.log('\n结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过');
chrome.kill();
server.close();
process.exit(failed.length ? 1 : 0);

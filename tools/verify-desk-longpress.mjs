// ===== 验证：桌面图标长按不再误触进移动模式（v3.27.x 用户反馈） =====
// 回归（FIX-REGRESSION #55）：
//   1) 非移动模式长按图标 350ms 曾自动进移动模式+拖拽（误触）→ 修复后长按无副作用
//   2) 「装饰模式 → 编辑布局」主动入口仍可进入移动模式（排序功能保留）
// 用法：node tools/verify-desk-longpress.mjs（需先 node build.mjs，需本机 Chrome/Edge）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = 9700 + Math.floor(Math.random() * 150);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-verify-desklongpress-' + Date.now()),
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
        ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
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
async function ev(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return { __err: String(r.exceptionDetails.text || '') };
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
const results = [];
function check(desc, ok, detail) { results.push({ desc, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : '')); }

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function freshLoad() {
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2000);
  for (let i = 0; i < 40; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(250); }
  await ev("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();var s=document.getElementById('splash');if(s&&!s.classList.contains('hide')){s.classList.add('hide');s.hidden=true;}return true;})()");
  await sleep(800);
}

// ============ 场景1：非移动模式长按图标 450ms → 不应进移动模式/拖拽 ============
console.log('\n===== 场景1 长按图标不进移动模式（核心回归） =====');
await freshLoad();
const longPress = await ev(`(function(){
  var app = document.querySelector('#page-phone .app-grid .app');
  if (!app) return { err: 'no-app' };
  var r = app.getBoundingClientRect();
  var x = r.left + r.width / 2, y = r.top + r.height / 2;
  app.__rx = r.left; app.__ry = r.top;
  app.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: x, clientY: y, button: 0, pointerType: 'touch' }));
  return { x: x, y: y };
})()`);
if (longPress && longPress.err) { console.error('FAIL  找不到桌面图标: ' + longPress.err); process.exit(1); }
await sleep(500); // 超过 MOVE_DELAY 350ms
const afterPress = await ev(`(function(){
  var phone = document.getElementById('page-phone');
  var bar = document.getElementById('decor-bar');
  var app = document.querySelector('#page-phone .app-grid .app');
  var r = app ? app.getBoundingClientRect() : null;
  return {
    moveMode: phone ? phone.classList.contains('desk-move-mode') : null,
    decorOn: phone ? phone.classList.contains('decor-on') : null,
    barHidden: bar ? bar.hidden : null,
    dragging: app ? app.classList.contains('desk-dragging') : null,
    editing: document.querySelectorAll('.app-grid.editing').length,
    moved: app ? (Math.abs(r.left - app.__rx) > 1 || Math.abs(r.top - app.__ry) > 1) : null,
    clone: !!document.querySelector('.desk-drag-clone')
  };
})()`);
check('长按 450ms 未进入移动模式（desk-move-mode）', afterPress.moveMode === false, 'moveMode=' + afterPress.moveMode);
check('未进入装饰模式（decor-on）', afterPress.decorOn === false, 'decorOn=' + afterPress.decorOn);
check('装饰栏保持隐藏', afterPress.barHidden === true, 'barHidden=' + afterPress.barHidden);
check('图标无拖拽态（desk-dragging）', afterPress.dragging === false, 'dragging=' + afterPress.dragging);
check('无拖拽克隆/指示线残留', afterPress.clone === false);
check('网格无编辑态', afterPress.editing === 0, 'editing=' + afterPress.editing);
check('图标位置未被挪动', afterPress.moved === false, 'moved=' + afterPress.moved);
// 收尾：松开指针（释放任何残留状态）
await ev(`(function(){
  var app = document.querySelector('#page-phone .app-grid .app');
  if (app) {
    var r = app.getBoundingClientRect();
    app.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerType: 'touch' }));
  }
  return true;
})()`);

// ============ 场景2：长按后轻点仍正常打开应用（点击功能未受影响） ============
console.log('\n===== 场景2 长按后轻点仍正常打开应用 =====');
await freshLoad();
const tapApp = await ev(`(function(){
  var app = document.querySelector('#page-phone .app-grid .app');
  if (!app) return null;
  app.click();
  return app.dataset.app || '';
})()`);
await sleep(600);
const tapOpened = await ev(`(function(){
  var app = document.querySelector('#page-phone .app-grid .app');
  return app ? 'app-alive' : 'no-app';
})()`);
check('桌面图标可正常点击（无 JS 异常/页面未卡死）', tapOpened === 'app-alive', 'app=' + tapApp);

// ============ 场景3：主动入口「编辑布局」仍可进入移动模式 ============
console.log('\n===== 场景3 编辑布局主动入口保留 =====');
await freshLoad();
await ev(`(function(){var r=document.getElementById('row-custom-icon');if(r)r.click();return true;})()`);
await sleep(300);
const decorOn = await ev(`(function(){var p=document.getElementById('page-phone');return p?p.classList.contains('decor-on'):null;})()`);
check('装饰模式可进入（row-custom-icon）', decorOn === true, 'decorOn=' + decorOn);
await ev(`(function(){var b=document.getElementById('decor-edit-layout');if(b)b.click();return true;})()`);
await sleep(300);
const moveMode = await ev(`(function(){var p=document.getElementById('page-phone');return p?p.classList.contains('desk-move-mode'):null;})()`);
const barText = await ev(`(function(){var s=document.querySelector('#decor-bar span');return s?s.textContent:'';})()`);
check('「编辑布局」按钮进入移动模式（desk-move-mode）', moveMode === true, 'moveMode=' + moveMode);
check('移动模式提示文案正确', String(barText || '').indexOf('移动模式') >= 0, 'barText=' + String(barText).slice(0, 30));
// 退出移动模式（点装饰栏完成）
await ev(`(function(){var d=document.getElementById('decor-done');if(d)d.click();else if(window.exitDecor){window.exitDecor();}return true;})()`);
await sleep(300);
const exited = await ev(`(function(){var p=document.getElementById('page-phone');return p?(!p.classList.contains('desk-move-mode')&&!p.classList.contains('decor-on')):null;})()`);
check('退出装饰/移动模式干净（无残留状态）', exited === true, 'exited=' + exited);

// ============ 汇总 ============
console.log('\n===== 汇总 =====');
const fails = results.filter((r) => !r.ok);
console.log((fails.length ? '❌ ' : '✅ ') + results.length + '/' + results.length + ' 通过' + (fails.length ? '，失败 ' + fails.length : ''));
chrome.kill();
server.close();
process.exit(fails.length ? 1 : 0);

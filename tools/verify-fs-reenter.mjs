// ===== 验证脚本：切后台退出全屏后恢复意图保持（v3.8.x 修复） =====
// 复现用户反馈：OPPO Find X9 Chrome 从桌面快捷方式打开，开全屏后切后台
// 再回来退出全屏且不恢复。
// 根因：handleFsExit 在非 PWA 判定（OPPO Chrome 快捷方式态 display-mode
// 可能报 browser）下无条件清掉 fullscreen-enabled 标记 → 切回后 reenterFs
// 直接放弃；且 reenterFs 原 600ms 延迟装手势监听会丢失「切回立刻触摸」。
// 验证（无头环境 display-mode 为 browser，正好覆盖「非 PWA 判定」分支）：
//  1) 设置 fullscreen-enabled=1 后刷新：标记必须保留（修复前会被清 0）——证明
//     切后台系统退出不再被当成「主动放弃」。
//  2) 模拟前台系统 UI 退出（fullscreenchange，无切后台）：非 PWA 下标记应清 0
//     （保持 v3.7.x「浏览器标签模式尊重主动退出」语义，不回归死循环）。
// 用法：node build.mjs && node tools/verify-fs-reenter.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FS_KEY = 'xy-home-v2:default:fullscreen-enabled';
const FB_KEY = 'xy-home-v2:default:fullscreen-fallback';

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

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
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

const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-fs-reenter-' + Date.now()),
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
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    const ready = await evalJs('window.__mochiDataReady === true');
    if (ready) return true;
    await sleep(200);
  }
  return false;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(1200);
if (!(await waitReady())) { console.log('页面未就绪，终止'); process.exit(1); }

// 环境确认：无头环境应为非 PWA（display-mode 不含 standalone/fullscreen）
const dm = await evalJs(`(window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)`);
check('环境为非 PWA（display-mode 不匹配 standalone）', dm === false, '实际 matches=' + dm);

// ---- 测试 1：FS_KEY=1 后刷新，标记必须保留（切后台系统退出 ≠ 主动放弃） ----
await evalJs('localStorage.setItem(' + JSON.stringify(FS_KEY) + ', "1"); localStorage.removeItem(' + JSON.stringify(FB_KEY) + ')');
await cdp('Page.reload');
await sleep(1500);
await waitReady();
const fs1 = await evalJs('localStorage.getItem(' + JSON.stringify(FS_KEY) + ')');
// 修复前：启动 reenterFs 非 PWA 分支会清成 '0'；修复后保留 '1'
check('非 PWA 下 FS_KEY=1 刷新后意图保留（修复核心）', fs1 === '1', '实际: ' + fs1);

// ---- 测试 2：模拟前台系统 UI 退出全屏（无切后台）→ 非 PWA 应清标记（不回归） ----
// 直接调用页面内逻辑不可达，用合成 fullscreenchange 事件触发 handleFsExit
await evalJs(`(() => {
  document.documentElement.classList.remove('fs-active');
  document.dispatchEvent(new Event('fullscreenchange'));
})()`);
await sleep(300);
const fs2 = await evalJs('localStorage.getItem(' + JSON.stringify(FS_KEY) + ')');
check('前台系统 UI 退出（无切后台）非 PWA 清标记，尊重主动退出', fs2 === '0', '实际: ' + fs2);

const failed = results.filter((r) => !r.ok);
console.log('\n结果: ' + (results.length - failed.length) + '/' + results.length + ' 通过');
chrome.kill();
server.close();
process.exit(failed.length ? 1 : 0);

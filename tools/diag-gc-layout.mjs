// ===== 诊断：群聊 + 自定义 desk-layout 场景 =====
// 用户装修过桌面（有 desk-layout）→ 开启群聊 → 刷新 → 检查
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
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
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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

const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gc-lay-' + Date.now()),
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
  throw new Error('无法连接');
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return null;
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');

async function enterApp() {
  await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();return true;})()");
  await sleep(400);
  await evalJs("(function(){var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var b=c.querySelector('#splash-confirm-ok');if(b)b.click();}return true;})()");
  await sleep(900);
}

async function gotoHome() {
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2500);
  for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
  await sleep(800);
  await enterApp();
}

async function checkState(label) {
  const d = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var pool=document.getElementById('desk-widget-pool');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');var sf=document.getElementById('sf-group-chat');return JSON.stringify({gcHidden:gc?gc.hidden:'n/a',gcInPool:gc?gc.parentNode===pool:'n/a',gcInMain:gc?gc.parentNode===mainGrid:'n/a',sfChecked:sf?sf.checked:'n/a',val:window.activeStore().get('group-chat-enabled'),lay:window.activeStore().get('desk-layout')});})()") || '{}');
  console.log(label, JSON.stringify(d));
  return d;
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ===== 场景：先装修桌面（产生 desk-layout）→ 再开启群聊 → 刷新 =====
console.log('===== 装修过桌面后开启群聊再刷新 =====');
await gotoHome();

// 进装修模式，移动一个图标，退出（产生 desk-layout）
await evalJs("(function(){var b=document.getElementById('desk-decor-btn');if(b)b.click();return true;})()");
await sleep(700);
console.log('进入装修模式:', await evalJs("(function(){var g=document.querySelector('.app-grid.editing');return !!g;})()"));

// 在装修模式下移动一个图标（把 memory 移念图标移到第一位）
await evalJs("(function(){var grid=document.querySelector('.app-grid[data-app=\"main\"]');var mem=grid.querySelector('.app[data-app=\"memory\"]');var chat=grid.querySelector('.app[data-app=\"chat\"]');if(mem&&chat){grid.insertBefore(mem,chat);}return true;})()");
await sleep(300);

// 退出装修模式（会保存 desk-layout）
await evalJs("(function(){var b=document.getElementById('desk-decor-exit');if(b)b.click();return true;})()");
await sleep(700);
console.log('退出装修后 desk-layout:', await evalJs("window.activeStore().get('desk-layout')"));

// 开启群聊
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
await sleep(500);
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(500);
await checkState('开启群聊后:');

// 刷新
console.log('\n--- 刷新 ---');
await gotoHome();
await checkState('刷新后:');

// 再刷新一次
console.log('\n--- 再刷新 ---');
await gotoHome();
await checkState('再刷新后:');

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
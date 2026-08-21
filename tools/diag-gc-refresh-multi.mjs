// ===== 诊断：群聊刷新后是否保持开启（多桌面场景） =====
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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gc-multi-' + Date.now()),
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

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();

// ---- 创建新联系人并切换 ----
const newCid = await evalJs("window.createContact('二宝')");
console.log('创建联系人 id:', newCid);
await evalJs("window.setActiveContact('" + newCid + "')");
await sleep(500);
console.log('切换后 __activeCid:', await evalJs("window.__activeCid"));
console.log('切换后 active-contact:', await evalJs("localStorage.getItem('xy-home-v2:active-contact')"));

// ---- 进聊天设置开启群聊 ----
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
await sleep(500);

console.log('\n开启后 active-contact:', await evalJs("localStorage.getItem('xy-home-v2:active-contact')"));
console.log('开启后 __activeCid:', await evalJs("window.__activeCid"));
console.log('开启后 store.get(group-chat-enabled):', await evalJs("window.activeStore().get('group-chat-enabled')"));
const lsDump = await evalJs("(function(){var out={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('group-chat')>=0||k==='xy-home-v2:active-contact')out[k]=localStorage.getItem(k);}return JSON.stringify(out);})()");
console.log('开启后 localStorage 相关键:', lsDump);

const d1 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');return JSON.stringify({gcHidden:gc?gc.hidden:'n/a',gcInMain:gc?gc.parentNode===mainGrid:'n/a'});})()") || '{}');
console.log('开启后群聊按钮状态:', JSON.stringify(d1));

// ---- 刷新 ----
console.log('\n--- 刷新页面 ---');
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();

console.log('刷新后 active-contact:', await evalJs("localStorage.getItem('xy-home-v2:active-contact')"));
console.log('刷新后 __activeCid:', await evalJs("window.__activeCid"));
console.log('刷新后 store.get(group-chat-enabled):', await evalJs("window.activeStore().get('group-chat-enabled')"));
const lsDump2 = await evalJs("(function(){var out={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('group-chat')>=0||k==='xy-home-v2:active-contact')out[k]=localStorage.getItem(k);}return JSON.stringify(out);})()");
console.log('刷新后 localStorage 相关键:', lsDump2);

const d2 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var pool=document.getElementById('desk-widget-pool');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');var sf=document.getElementById('sf-group-chat');return JSON.stringify({gcHidden:gc?gc.hidden:'n/a',gcInPool:gc?gc.parentNode===pool:'n/a',gcInMain:gc?gc.parentNode===mainGrid:'n/a',sfChecked:sf?sf.checked:'n/a'});})()") || '{}');
console.log('刷新后群聊按钮状态:', JSON.stringify(d2));

await sleep(700);
const d3 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var pool=document.getElementById('desk-widget-pool');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');var sf=document.getElementById('sf-group-chat');return JSON.stringify({gcHidden:gc?gc.hidden:'n/a',gcInPool:gc?gc.parentNode===pool:'n/a',gcInMain:gc?gc.parentNode===mainGrid:'n/a',sfChecked:sf?sf.checked:'n/a'});})()") || '{}');
console.log('等待 syncGc 后群聊按钮状态:', JSON.stringify(d3));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
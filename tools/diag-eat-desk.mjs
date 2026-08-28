// ===== 实拍构建产物里的桌面「吃什么」图标（元素级截图） =====
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('no chrome'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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

const cdpPort = 9500 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-eatdesk-' + Date.now()),
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
  throw new Error('cannot connect');
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(700);
await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();var s=document.getElementById('splash');if(s&&!s.classList.contains('hide')){s.classList.add('hide');s.hidden=true;}return true;})()");
await sleep(700);

// 跳到桌面第三页 + 隐藏备份横幅等浮层 + 把图标滚到视口中央
await evalJs(`(function(){
  document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-phone');});
  var b=document.getElementById('backup-banner'); if(b) b.style.display='none';
  var dp=document.getElementById('desktop-pages');
  var slides=dp.querySelectorAll('.page-slide');
  dp.scrollLeft=slides.length*362;
  var eat=document.querySelector('.app[data-app="eat"]');
  if(eat) eat.scrollIntoView({block:'center', inline:'center'});
  return JSON.stringify({slides:slides.length, found:!!eat});
})()`);
await sleep(800);

const info = await evalJs(`(function(){
  var eat=document.querySelector('.app[data-app="eat"]');
  if(!eat) return 'NO EAT ICON';
  var r=eat.getBoundingClientRect();
  var svg=eat.querySelector('svg');
  var d=svg?svg.querySelector('path'):null;
  return JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),firstPathD:d?d.getAttribute('d').slice(0,30):null});
})()`);
console.log('eat icon:', info);

const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: (() => null)() || undefined });
// 元素级 clip：按 info 坐标裁一块 140x190
const ij = JSON.parse((await evalJs(`(function(){var e=document.querySelector('.app[data-app=\"eat\"]');if(!e)return 'null';var r=e.getBoundingClientRect();return JSON.stringify({x:r.x-56,y:r.y-40,w:170,h:220});})()`)) || 'null');
if (ij) {
  const shot2 = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: ij.x, y: ij.y, width: ij.w, height: ij.h, scale: 1 } });
  writeFileSync(join(root, 'tools', 'eat-desk-shot.png'), Buffer.from(shot2.data, 'base64'));
  console.log('saved tools/eat-desk-shot.png');
} else {
  writeFileSync(join(root, 'tools', 'eat-desk-shot.png'), Buffer.from(shot.data, 'base64'));
  console.log('saved full page (no clip)');
}

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(0);

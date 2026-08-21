// ===== 临时诊断：输入栏上方区域逐点扫描 =====
// 滚动聊天后，扫描输入栏上方整条区域，找出所有能 hit 到的元素（含伪元素/浮层）
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
if (!chromePath) { console.error('找不到 Chrome'); process.exit(1); }
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
const cdpPort = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-scan2-' + Date.now()),
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
  throw new Error('无法连接');
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 200) };
    return r && r.result ? r.result.value : null;
  } catch (e) { return { err: String(e) }; }
}
await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(3000);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(800);
await evalJs(`(function(){
  document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});
  var cb = document.getElementById('chat-body');
  for(var i=0;i<20;i++){ var m=document.createElement('div'); m.className='msg msg-in'; m.innerHTML='<span class="msg-av">TA</span><div class="msg-bubble">第'+i+'条消息内容，用来填满整个消息区让它可以滚动</div>'; cb.appendChild(m); }
  var ty = document.getElementById('chat-typing');
  ty.hidden = false;
  cb.scrollTop = cb.scrollHeight;
  return true;
})()`);
await sleep(400);
const r = await evalJs(`(function(){
  var ir = document.querySelector('.chat-input-row').getBoundingClientRect();
  var ty = document.getElementById('chat-typing').getBoundingClientRect();
  // 逐像素扫描输入栏上方区域
  var grid = [];
  var y0 = Math.round(ir.top - 40);
  var y1 = Math.round(ir.top);
  for (var y = y0; y < y1; y += 6) {
    var row = { y: y };
    for (var x = 15; x < 380; x += 30) {
      var el = document.elementFromPoint(x, y);
      if (el) {
        var key = el.id || (typeof el.className === 'string' ? String(el.className).split(' ')[0] : el.tagName);
        row[x] = key.slice(0, 20);
      }
    }
    grid.push(row);
  }
  return JSON.stringify({
    inputTop: Math.round(ir.top),
    typingTop: Math.round(ty.top), typingBottom: Math.round(ty.bottom), typingLeft: Math.round(ty.left), typingW: Math.round(ty.width),
    scan: grid
  });
})()`);
console.log(r);
try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
console.log('done');

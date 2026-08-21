// ===== 临时诊断：真实点击流程检查 splash/confirm 残留 =====
// 点「点击进入」→ 点「确认我已知晓」→ 进聊天 → 检查是否有元素残留覆盖
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-rc-' + Date.now()),
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
async function clickEl(sel) {
  return evalJs(`(function(){
    var el = document.querySelector('${sel}');
    if (!el) return 'not-found';
    el.click();
    return 'clicked';
  })()`);
}
await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(3000);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
console.log('=== 数据就绪 ===');
// 检查开屏状态
console.log('开屏状态:', await evalJs(`(function(){
  var sp = document.getElementById('splash');
  return JSON.stringify({ exists: !!sp, hidden: sp ? sp.hidden : 'n/a', hasHide: sp ? sp.classList.contains('hide') : 'n/a', display: sp ? getComputedStyle(sp).display : 'n/a' });
})()`));
// 点「点击进入」
console.log('点进入:', await clickEl('#splash-enter'));
await sleep(300);
console.log('点进入后 confirm 状态:', await evalJs(`(function(){
  var cf = document.getElementById('splash-confirm');
  return JSON.stringify({ exists: !!cf, hidden: cf ? cf.hidden : 'n/a', display: cf ? getComputedStyle(cf).display : 'n/a' });
})()`));
// 点「确认我已知晓」
console.log('点确认:', await clickEl('#splash-confirm-ok'));
await sleep(600);
console.log('点确认后 splash 状态:', await evalJs(`(function(){
  var sp = document.getElementById('splash');
  return JSON.stringify({ exists: !!sp, hasHide: sp ? sp.classList.contains('hide') : 'n/a' });
})()`));
// 等 splash 移除动画完成
await sleep(600);
console.log('最终 splash 是否还在 DOM:', await evalJs(`(function(){
  var sp = document.getElementById('splash');
  var cf = document.getElementById('splash-confirm');
  var body = document.body;
  var topEl = document.elementFromPoint(195, 400);
  return JSON.stringify({
    splashExists: !!sp,
    confirmExists: !!cf,
    topEl: topEl ? (topEl.id || String(topEl.className).slice(0, 30)) : 'null'
  });
})()`));
// 进聊天 + typing + 滚动，再扫描输入栏上方
await evalJs(`(function(){
  document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});
  var cb = document.getElementById('chat-body');
  for(var i=0;i<20;i++){ var m=document.createElement('div'); m.className='msg msg-in'; m.innerHTML='<span class="msg-av">TA</span><div class="msg-bubble">第'+i+'条消息内容</div>'; cb.appendChild(m); }
  document.getElementById('chat-typing').hidden = false;
  cb.scrollTop = cb.scrollHeight;
  return true;
})()`);
await sleep(300);
const r = await evalJs(`(function(){
  var ir = document.querySelector('.chat-input-row').getBoundingClientRect();
  var hits = {};
  for (var y = Math.round(ir.top-30); y < Math.round(ir.top); y += 4) {
    for (var x = 30; x < 360; x += 60) {
      var el = document.elementFromPoint(x, y);
      if (el) {
        var key = el.id || String(el.className).split(' ')[0];
        hits[key] = (hits[key]||0) + 1;
      }
    }
  }
  return JSON.stringify({ inputTop: Math.round(ir.top), hits: hits });
})()`);
console.log('聊天页输入栏上方命中统计:', r);
try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
console.log('done');

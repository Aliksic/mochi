// 诊断：点击桌面音乐按钮，捕获 console 错误和页面状态
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

const cdpPort = 9500 + Math.floor(Math.random() * 500);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-' + Date.now()),
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
  throw new Error('connect fail');
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return { __err: JSON.stringify(r.exceptionDetails) };
    return r && r.result ? r.result.value : null;
  } catch (e) { return { __err: String(e) }; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');

const errors = [];
ws.addEventListener?.('message', (ev) => {
  try {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errors.push('[' + m.params.type + '] ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push('[exception] ' + (m.params.exceptionDetails.exception ? (m.params.exceptionDetails.exception.description || m.params.exceptionDetails.exception.value) : m.params.exceptionDetails.text));
    }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  } catch (e) {}
});
if (!ws.addEventListener) ws.on('message', (data) => {
  try {
    const m = JSON.parse(data);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errors.push('[' + m.params.type + '] ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push('[exception] ' + (m.params.exceptionDetails.exception ? (m.params.exceptionDetails.exception.description || m.params.exceptionDetails.exception.value) : m.params.exceptionDetails.text));
    }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  } catch (e) {}
});

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(500);
await evalJs("(function(){var c=document.getElementById('splash-confirm-ok');if(c&&!c.hidden)c.click();return true;})()");
await sleep(800);

console.log('=== 进入桌面，当前错误 ===');
console.log(errors.slice().join('\n'));
errors.length = 0;

// 测聊天按钮（第一页，在视口内）
const APP = 'chat';
const btn = JSON.parse(await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');if(!b)return '{}';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),hidden:b.hidden,display:getComputedStyle(b).display,vis:getComputedStyle(b).visibility,pointerEvents:getComputedStyle(b).pointerEvents});})()") || '{}');
console.log(APP+'按钮:', JSON.stringify(btn));

const cover = await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');if(!b)return null;var r=b.getBoundingClientRect();var cx=r.left+r.width/2,cy=r.top+r.height/2;var el=document.elementFromPoint(cx,cy);return el?(el.tagName+(el.className?(' '+String(el.className).slice(0,40)):'')+(el.id?('#'+el.id):'')):null;})()");
console.log('坐标处实际元素:', cover);

// 列出按钮及祖先上的 touch 监听器和 preventDefault 情况
const touchInfo = await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');if(!b)return 'no btn';var info=[];var el=b;while(el){var n=el.tagName+(el.className?(' '+String(el.className).slice(0,30)):'')+(el.id?('#'+el.id):'');info.push(n);el=el.parentElement;}return info.join(' > ');})()");
console.log('祖先链:', touchInfo);

// 直接 click
const r1 = await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');if(!b)return 'no btn';b.click();return 'clicked';})()");
console.log('直接click:', r1);
await sleep(400);
const pageShown1 = await evalJs("(function(){var p=document.getElementById('page-"+(APP==='chat'?'chat':'music')+"');return p?('hidden='+p.hidden):'no page';})()");
console.log('页状态:', pageShown1);

// 回桌面
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-phone');});})()");
await sleep(400);

// 真实 touch 序列，并记录 touchstart/touchend/click 是否到达按钮
await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');window.__tev={ts:0,te:0,click:0,tsPD:0,tePD:0,moved:0,docTs:0,docTe:0,docTsTarget:'',docTsPD:0};document.addEventListener('touchstart',function(e){window.__tev.docTs++;window.__tev.docTsTarget=e.target?(e.target.tagName+(e.target.className?(' '+String(e.target.className).slice(0,30)):'')):'';window.__tev.docTsPD=e.defaultPrevented?1:0;},{capture:true,passive:true});document.addEventListener('touchend',function(e){window.__tev.docTe++;},{capture:true,passive:true});b.addEventListener('touchstart',function(e){window.__tev.ts++;window.__tev.tsPD=e.defaultPrevented?1:0;},{capture:true,passive:true});b.addEventListener('touchmove',function(e){window.__tev.moved++;},{capture:true,passive:true});b.addEventListener('touchend',function(e){window.__tev.te++;window.__tev.tePD=e.defaultPrevented?1:0;},{capture:true,passive:true});b.addEventListener('click',function(){window.__tev.click++;},{capture:true});return true;})()");

const btn2 = JSON.parse(await evalJs("(function(){var b=document.querySelector('.app[data-app=\\\""+APP+"\\\"]');if(!b)return '{}';var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()") || '{}');
console.log('touch前按钮坐标:', JSON.stringify(btn2));
if (btn2.x) {
  const ts = Date.now();
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', timestamp: ts / 1000, touches: [{ x: btn2.x, y: btn2.y, radiusX: 1, radiusY: 1, force: 1, id: 0 }] });
  await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', timestamp: (ts + 60) / 1000, touches: [] });
  await sleep(700);
  const tev = await evalJs('JSON.stringify(window.__tev)');
  console.log('事件计数:', tev);
  const pageShown2 = await evalJs("(function(){var p=document.getElementById('page-"+(APP==='chat'?'chat':'music')+"');return p?('hidden='+p.hidden):'no page';})()");
  console.log('touch后页状态:', pageShown2);
}
console.log('=== 全部错误 ===');
console.log(errors.slice().join('\n'));

try { ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
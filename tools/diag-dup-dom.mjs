// ===== 诊断：慢 IDB 下 DOM 双气泡——第二个节点从哪来 =====
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

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-dupdiag-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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
  if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 500)); return null; }
  return r && r.result ? r.result.value : null;
}

// 包装 renderMsg / appendChild 记录调用栈：谁在什么时候为 M 追加了节点
await cdpConnect();
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
(function () {
  const DELAY = 12000;
  const origOpen = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () {
    const req = origOpen.apply(this, arguments);
    let userFn = null;
    Object.defineProperty(req, 'onsuccess', {
      get: function () { return userFn; },
      set: function (f) { userFn = function (ev) { setTimeout(function () { f.call(req, ev); }, DELAY); }; }
    });
    return req;
  };
  window.__dupLog = [];
  document.addEventListener('DOMContentLoaded', function () {
    const cb = document.getElementById('chat-body');
    if (!cb || cb.__patched) return; cb.__patched = true;
    const origAppend = cb.appendChild.bind(cb);
    cb.appendChild = function (n) {
      try {
        const txt = (n.textContent || '').slice(0, 30);
        if (txt.indexOf('DUPTEST') >= 0 || (n.className || '').indexOf('msg-out') >= 0 || (n.className || '').indexOf('msg-in') >= 0) {
          window.__dupLog.push({ t: Date.now(), cls: n.className, txt: txt, stack: new Error().stack.split('\\n').slice(1, 5).join(' | ') });
        }
      } catch (e) {}
      return origAppend(n);
    };
  });
})();` });

await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
for (let i = 0; i < 90; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(600);

await evalJs(`(function(){
  window.enterChat();
  var inp = document.getElementById('chat-input');
  inp.textContent = ' DUPTEST-DIAG ';
  document.getElementById('chat-send').click();
  return 'sent';
})()`);
await sleep(19000);

const log = await evalJs('window.__dupLog || []');
console.log('=== #chat-body.appendChild 调用记录（含 DUPTEST 的消息节点） ===');
if (Array.isArray(log)) log.forEach((l, i) => console.log(`#${i} t=+${l.t} cls=${l.cls} txt=${JSON.stringify(l.txt)}\n    ${l.stack}`));

const detail = await evalJs(`(() => {
  const mk = 'DUPTEST-DIAG';
  const hits = Array.from(document.querySelectorAll('#chat-body .msg-out')).filter(n => (n.textContent || '').indexOf(mk) >= 0);
  return {
    count: hits.length,
    nodes: hits.map(n => ({ idx: n.dataset.idx, pos: Array.prototype.indexOf.call(n.parentElement.children, n), prevCls: n.previousElementSibling ? n.previousElementSibling.className : null })),
    bodyChildren: document.querySelectorAll('#chat-body').length,
    arrLen: (window.getChatMsgs() || []).length,
    ready: !!window.__mochiDataReady
  };
})()`);
console.log('=== 最终 DOM 状态 ===');
console.log(JSON.stringify(detail, null, 2));
chrome.kill();
process.exit(0);

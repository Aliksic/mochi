// 临时：追踪 memo 全局键在加载各时点的 LS/memoryCache 状态与 __jsErrors
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-dbg5-' + Date.now()), '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });
let ws = null, id = 0; const pend = new Map();
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
    const page = list.find(t => t.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
      break;
    }
  } catch (e) {}
  await sleep(150);
}
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }); return r && r.result ? r.result.value : null; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// 预置：根键 2 条 + default 旧键 1 条（模拟存量合并场景）
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  try {
    if (!localStorage.getItem('xy-home-v2:memo-app-items')) {
      localStorage.setItem('xy-home-v2:memo-app-items', JSON.stringify([{ id: 'r1', t: '根键事项', done: false, pin: false, ts: 1 }]));
    }
    localStorage.setItem('xy-home-v2:default:memo-app-items', JSON.stringify([{ id: 'legacy-1', t: '旧桌面遗留事项', done: false, pin: false, ts: 2 }]));
  } catch (e) {}
` });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
for (let i = 0; i < 60; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(200); }
const snap = `(() => ({
  lsRoot: localStorage.getItem('xy-home-v2:memo-app-items'),
  lsDef: localStorage.getItem('xy-home-v2:default:memo-app-items'),
  lsMarker: localStorage.getItem('xy-home-v2:memo-app-global-migrated'),
  mcRoot: (function () { try { return (window.xyStore('xy-home-v2').get('memo-app-items') || '').slice(0, 60); } catch (e) { return 'ERR'; } })(),
  errs: (window.__jsErrors || []).filter(function (e) { return e.indexOf('memo') >= 0; })
}))()`;
for (const t of [0, 500, 1500, 3000]) {
  await sleep(t === 0 ? 100 : t - (t === 500 ? 100 : t === 1500 ? 500 : 1500));
  console.log('t≈' + t + 'ms:', JSON.stringify(await ev(snap)));
}
chrome.kill(); server.close(); process.exit(0);

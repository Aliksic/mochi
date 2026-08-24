// 临时：诊断 verify-memo 测试15 场景的最终状态
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-dbg6-' + Date.now()), '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });
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

// 先正常加载一次，制造「已有 marker + IDB 有数据」的存量会话，再双清 + 预注入 + 重载（复刻测试 15 前置）
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
for (let i = 0; i < 60; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(1500);
await ev(`(function () {
  ['memo-app-items', 'memo-app-send', 'memo-app-global-migrated'].forEach(function (k) {
    localStorage.removeItem('xy-home-v2:' + k);
    localStorage.removeItem('xy-home-v2:default:' + k);
    if (window.idbDelete) window.idbDelete('xy-home-v2:' + k);
    if (window.idbDelete) window.idbDelete('xy-home-v2:default:' + k);
  });
  return 'wiped';
})()`);
await sleep(900);
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
  try {
    window.__preseedRan = true;
    ['memo-app-items', 'memo-app-send', 'memo-app-global-migrated'].forEach(function (k) {
      localStorage.removeItem('xy-home-v2:' + k);
      localStorage.removeItem('xy-home-v2:default:' + k);
    });
    localStorage.setItem('xy-home-v2:default:memo-app-items', JSON.stringify([
      { id: 'legacy-1', t: '旧桌面遗留事项', done: false, pin: false, ts: 1000 }
    ]));
    localStorage.setItem('xy-home-v2:czz9test:memo-app-items', JSON.stringify([
      { id: 'legacy-1', t: '旧桌面遗留事项', done: true, pin: false, ts: 2000 },
      { id: 'legacy-2', t: '另一桌面的事项', done: false, pin: false, ts: 3000 }
    ]));
    window.getContacts = function () { return [{ id: 'default' }, { id: 'czz9test' }]; };
  } catch (e) { window.__preseedErr = String(e); }
` });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
for (let i = 0; i < 60; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(3000);
console.log(JSON.stringify(await ev(`(() => ({
  preseedRan: window.__preseedRan, preseedErr: window.__preseedErr || null,
  lsRoot: localStorage.getItem('xy-home-v2:memo-app-items'),
  lsDef: localStorage.getItem('xy-home-v2:default:memo-app-items'),
  lsFake: localStorage.getItem('xy-home-v2:czz9test:memo-app-items'),
  lsMarker: localStorage.getItem('xy-home-v2:memo-app-global-migrated'),
  storeRoot: (function(){ try { return window.xyStore('xy-home-v2').get('memo-app-items'); } catch(e){ return 'ERR'; } })(),
  storeMarker: (function(){ try { return window.xyStore('xy-home-v2').get('memo-app-global-migrated'); } catch(e){ return 'ERR'; } })(),
  errs: (window.__jsErrors || []).filter(function (e) { return String(e).indexOf('memo') >= 0; })
}))()`), null, 1));
chrome.kill(); server.close(); process.exit(0);

// ===== 诊断：花园一键收获 A1 偶发失败 =====
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
const cdpPort = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-g-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });
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
  if (r && r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200);
  return r && r.result ? r.result.value : null;
}
async function gotoApp() {
  await cdp('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
  await sleep(1200);
}
await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await gotoApp();
await evalJs(`(function(){
  localStorage.setItem('xy-home-v2:default:garden-data', JSON.stringify({
    p: [{ type: 'clover', planted: Math.floor(Date.now() / 1000) - 200000, by: 'me', watered: null, pot: null }, null, null, null, null, null, null, null, null, null, null, null],
    l: [], lpc: 0, dex: {}, exp: 0,
    inv: {}, st: { p: 0, w: 0, h: 0, f: 0, mp: 0, mw: 0, mh: 0, mf: 0 },
    decor: {}, visitor: null
  }));
  return 'ok';
})()`);
await gotoApp();
console.log('open1:', await evalJs(`(function(){
  var g = document.querySelector('.app[data-app="garden"]');
  if (!g) return 'NOICON';
  g.click();
  var page = document.getElementById('page-garden');
  return JSON.stringify({ found: !!page, hidden: page ? page.hidden : null });
})()`));
for (const ms of [400, 600, 800]) {
  await sleep(ms);
  console.log('probe@+' + ms + ':', await evalJs(`(function(){
    var page = document.getElementById('page-garden');
    var btn = document.querySelector('#page-garden [data-tool="harvestall"]');
    var cells = document.querySelectorAll('#page-garden .g-plot, #page-garden [class*="plot"]');
    var txt = page ? (page.textContent || '').slice(0, 400) : '';
    return JSON.stringify({
      pageHidden: page ? page.hidden : null,
      btnExists: !!btn,
      btnHidden: btn ? btn.hidden : null,
      cellCount: cells.length,
      hasBloomWord: txt.indexOf('开') >= 0 || txt.indexOf('\\u5f00') >= 0,
      sample: txt.replace(/\\s+/g, ' ').slice(0, 160)
    });
  })()`));
}
console.log('click:', await evalJs(`(function(){
  var btn = document.querySelector('#page-garden [data-tool="harvestall"]');
  if (!btn) return 'NOBTN';
  btn.click();
  return 'clicked';
})()`));
await sleep(900);
console.log('after:', await evalJs(`(function(){
  var d = JSON.parse(localStorage.getItem('xy-home-v2:default:garden-data') || '{}');
  var day = new Date().toISOString().slice(0, 10);
  return JSON.stringify({
    plotsNull: (d.p || []).map(function (x) { return x === null ? 0 : 1; }).join(''),
    logs: (d.l || []).slice(-3),
    coinDay: Number(localStorage.getItem('xy-home-v2:default:ml2_coin_garden_' + day)) || 0,
    wallet: localStorage.getItem('xy-home-v2:default:gift-wallet')
  });
})()`));
chrome.kill(); server.close();
process.exit(0);

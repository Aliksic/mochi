// ===== 定位启动期神秘内存分配者：采样堆分析 =====
// 用法：node tools/diag-oom-alloc.mjs [seedMB] [heapMB] [sampleMs]
// 流程：种子(40MB cc-groups) → about:blank 清场 → 重载 → 立即开 HeapProfiler
//       采样分配 → 6 秒后停并输出 Top 分配调用栈（定位 +118MB 的来源）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED_MB = Number(process.argv[2] || 40);
const HEAP_MB = Number(process.argv[3] || 256);
const SAMPLE_MS = Number(process.argv[4] || 6000);

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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

let ws = null, msgId = 0;
let crashedFlag = false;
const pend = new Map();
const cdpPort = 9200 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-precise-memory-info',
  '--js-flags=--max-old-space-size=' + HEAP_MB,
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-alloc-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank',
], { stdio: 'ignore' });

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
          if (m.method === 'Inspector.targetCrashed') { crashedFlag = true; try { ws.close(); } catch (e) {} return; }
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
  return new Promise((res) => {
    const timer = setTimeout(() => { pend.delete(id); res({ __timeout: true }); }, 12000);
    pend.set(id, (r) => { clearTimeout(timer); res(r); });
    try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); res({ __timeout: true }); }
  });
}
async function evalJs(expr, awaitPromise = false) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r && r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 200) };
  return r && r.result ? r.result.value : null;
}

try {
  await cdpConnect();
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('HeapProfiler.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 种子
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2000);
  for (let i = 0; i < 40; i++) { const r = await evalJs('!!window.__mochiDataReady'); if (r === true) break; await sleep(250); }
  const seed = await evalJs(`(async function(){
    var STK = 'data:image/png;base64,' + 'B'.repeat(128000);
    var groups = [];
    var nG = ${Math.max(2, Math.round(SEED_MB * 1048576 / 128000 / 20))};
    for (var g = 0; g < nG; g++) groups.push({ id: 'g' + g, name: '分组' + g, items: Array.from({length: 20}, (_, k) => ({ id: 'g' + g + '-' + k, name: '包' + g + '_' + k, url: STK })) });
    var ok = await window.idbSet('xy-home-v2:cc-groups', JSON.stringify(groups));
    return ok ? 'ok' : 'fail';
  })()`, true);
  console.log('种子写入:', JSON.stringify(seed));

  // 清场后重载，立即开始分配采样
  await cdp('Page.navigate', { url: 'about:blank' });
  await sleep(1200);
  await cdp('Page.navigate', { url: baseUrl + '/index.html' }).catch(() => {});
  await cdp('HeapProfiler.startSampling', { samplingInterval: 262144 }); // 256KB 粒度
  const t0 = Date.now();
  while (Date.now() - t0 < SAMPLE_MS && !crashedFlag) await sleep(300);
  const prof = await cdp('HeapProfiler.stopSampling');
  const head = prof && prof.profile && prof.profile.head;
  if (!head) {
    console.log('未取到采样结果。crashed=', crashedFlag, ' resp keys=', prof ? Object.keys(prof).join(',') : String(prof));
    const alive = await evalJs('1+1');
    console.log('页面存活探测:', JSON.stringify(alive));
  } else {
    // 聚合每个节点的 selfSize（含其上分配的样本归属），按调用帧输出 Top 18
    const rows = [];
    (function walk(n, path) {
      const cf = n.callFrame || {};
      const label = [(cf.functionName || '(anonymous)'), (cf.url || '').replace(/^.*\//, '') + ':' + (cf.lineNumber + 1), 'col' + (cf.columnNumber + 1)].join(' @ ');
      if (n.selfSize > 0) rows.push({ label, bytes: n.selfSize, hits: n.hitCount });
      (n.children || []).forEach((c) => walk(c, path));
    })(head, '');
    rows.sort((a, b) => b.bytes - a.bytes);
    const mb = (b) => (b / 1048576).toFixed(1) + 'MB';
    console.log('\n===== Top 分配点（selfSize）=====');
    rows.slice(0, 18).forEach((r, i) => console.log(String(i + 1).padStart(2) + '. ' + mb(r.bytes).padStart(8) + '  hit×' + String(r.hits).padStart(4) + '  ' + r.label.slice(0, 130)));
    const total = rows.reduce((s, r) => s + r.bytes, 0);
    console.log('采样总分配量 ≈ ' + mb(total) + (crashedFlag ? '（渲染器在采样期间崩溃）' : ''));
  }
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

// ===== 诊断二：定位重度数据的内存驻留点（分阶段采样 + 强制 GC） =====
// 用法：node tools/diag-memory-where.mjs
// 流程：全新环境 → 写入种子数据（聊天28MB+字卡20MB）→ 重载后分阶段采样，
//       每阶段用 CDP HeapProfiler.collectGarbage 强制回收后再量堆，得到「真实驻留」。
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
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
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

let ws = null, msgId = 0;
const pend = new Map();
const cdpPort = 9500 + Math.floor(Math.random() * 300);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-precise-memory-info',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-memwhere-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });
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
      break;
    }
  } catch (e) {}
  await sleep(150);
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr, awaitPromise = false) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) };
    return r && r.result ? r.result.value : null;
  } catch (e) { return { __err: String(e) }; }
}
const mb = (b) => (b / 1048576).toFixed(1) + 'MB';
async function gcSnap(tag) {
  await cdp('HeapProfiler.enable');
  await cdp('HeapProfiler.collectGarbage');
  await sleep(400);
  const h = await evalJs('(function(){var m=performance.memory;return m?m.usedJSHeapSize:0;})()');
  console.log('[' + tag + '] GC后 JS堆驻留=' + mb(h));
  return h;
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

console.log('--- 加载 #1（全新环境） ---');
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady') === true) break; await sleep(300); }
const hEmpty = await gcSnap('A 全新环境');

console.log('\n--- 写入种子数据（聊天28MB + 字卡20MB）并重载 ---');
await evalJs(`(async function(){
  const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(96000);
  const STK = 'data:image/png;base64,' + 'B'.repeat(128000);
  const arr = [];
  const t0 = Date.now() - 2400 * 60000;
  for (let i = 0; i < 2400; i++) {
    const m = { ts: t0 + i * 60000, side: i % 2 ? 'out' : 'in', type: 'text', text: '占位消息第' + i + '条。' };
    if (i % 8 === 0) { m.type = 'image'; m.text = IMG; }
    arr.push(m);
  }
  const groups = [];
  for (let g = 0; g < 8; g++) groups.push({ id: 'g' + g, name: '分组' + g, items: Array.from({length: 20}, (_, k) => ({ id: 'x' + g + k, url: STK })) });
  await window.idbSet('xy-home-v2:default:chat-msgs', JSON.stringify(arr));
  await window.idbSet('xy-home-v2:cc-groups', JSON.stringify(groups));
  return 1;
})()`, true);

await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 120; i++) { if (await evalJs('!!window.__mochiDataReady') === true) break; await sleep(250); }
const hBoot = await gcSnap('B 重载就绪（restore刚放行，后台回填中）');

// 等后台回填批次结束
for (let i = 0; i < 20; i++) { await sleep(1000); }
const hRestored = await gcSnap('C 后台回填完成');

await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
await sleep(1500);

console.log('\n--- 进聊天页（loadMsgs 解析全部聊天记录） ---');
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return 1;})()");
await sleep(3500);
const hChat = await gcSnap('D 聊天页打开后');

console.log('\n=== 汇总 ===');
console.log('全新环境驻留        : ' + mb(hEmpty));
console.log('+48MB数据 重载就绪   : ' + mb(hBoot));
console.log('后台回填完成后驻留   : ' + mb(hRestored) + (hRestored > hEmpty ? '（比空环境多 ' + mb(hRestored - hEmpty) + '）' : ''));
console.log('聊天页解析记录后驻留 : ' + mb(hChat) + (hChat > hRestored ? '（再增 ' + mb(hChat - hRestored) + '）' : ''));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
console.log('\n完成。');

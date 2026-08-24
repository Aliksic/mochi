// ===== 诊断：内存压力实测（排查安卓 Chrome「他崩溃了」渲染进程崩溃） =====
// 用法：node tools/diag-memory-stress.mjs
// 需要：Node 21+（内置 fetch/WebSocket）+ 本机 Chrome/Edge（CHROME_PATH 可指定）
//
// 做什么：模拟「数据量大的用户」——往 IndexedDB 写入约 50MB 重度数据
// （聊天记录含大量图片 dataURL + 字卡表情包库），对比空数据/重数据的：
//   1) 启动后 JS 堆占用（performance.memory）
//   2) 数据就绪耗时（idbRestore 回填）
//   3) 进入聊天页并渲染 200 条消息后的堆增量
// 结论用于判断「网页崩溃」是否由数据量导致的渲染进程内存超限引起。
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
async function launch() {
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--enable-precise-memory-info',
    '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-memdiag-' + Date.now()),
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
        return chrome;
      }
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('无法连接无头浏览器');
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
async function heap() {
  const m = await evalJs('(function(){if(!performance.memory)return null;var m=performance.memory;return {used:m.usedJSHeapSize,total:m.totalJSHeapSize,limit:m.jsHeapSizeLimit};})()');
  return m && !m.__err ? m : null;
}

const chrome = await launch();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

console.log('=== 场景 A：空数据（全新用户） ===');
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady') === true) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
await sleep(1200);
const hA1 = await heap();
console.log('启动就绪后 JS 堆: used=' + (hA1 ? mb(hA1.used) : '?') + ' / total=' + (hA1 ? mb(hA1.total) : '?'));

console.log('\n=== 写入重度数据（模拟老用户） ===');
// 在页面内生成大字符串再写入 IDB（不经 CDP 传大文本）：
//  - 聊天记录 2400 条，其中 1/8 带 ~96KB 图片 dataURL ≈ 28MB
//  - 字卡库 cc-groups 160 张表情包 × ~128KB ≈ 20MB
//  合计 ≈ 48MB 原始字符串（IDB 里以字符串存）
const seedRes = await evalJs(`(async function(){
  try {
    if (!window.idbSet) return 'no idbSet';
    const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(96000);
    const STK = 'data:image/png;base64,' + 'B'.repeat(128000);
    const arr = [];
    const t0 = Date.now() - 2400 * 60000;
    for (let i = 0; i < 2400; i++) {
      const m = { ts: t0 + i * 60000, side: i % 2 ? 'out' : 'in', type: 'text', text: '今天也要开心哦，第' + i + '条消息内容占位文字。' };
      if (i % 8 === 0) { m.type = 'image'; m.text = IMG; }
      arr.push(m);
    }
    const groups = [];
    for (let g = 0; g < 8; g++) {
      groups.push({ id: 'g' + g, name: '分组' + g, items: Array.from({length: 20}, (_, k) => ({ id: 'g' + g + '-' + k, name: '包' + g + k, url: STK })) });
    }
    const ok1 = await window.idbSet('xy-home-v2:default:chat-msgs', JSON.stringify(arr));
    const ok2 = await window.idbSet('xy-home-v2:cc-groups', JSON.stringify(groups));
    return JSON.stringify({ ok1: !!ok1, ok2: !!ok2, msgs: arr.length, groups: groups.length });
  } catch (e) { return 'seed error: ' + (e && e.message || e); }
})()`, true);
console.log('写入结果:', JSON.stringify(seedRes));

console.log('\n=== 场景 B：重度数据用户（刷新触发 idbRestore 回填） ===');
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2000);
const tReady0 = Date.now();
let readyMs = -1;
for (let i = 0; i < 120; i++) {
  if (await evalJs('!!window.__mochiDataReady') === true) { readyMs = Date.now() - tReady0; break; }
  await sleep(250);
}
console.log('__mochiDataReady 就绪: ' + (readyMs >= 0 ? readyMs + 'ms' : '超时(>30s)'));
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
// 等 idbRestore 后台分批回填跑完（12s 保险丝放行后仍在继续）
await sleep(15000);
const hB1 = await heap();
console.log('回填完成后 JS 堆: used=' + (hB1 ? mb(hB1.used) : '?') + ' / total=' + (hB1 ? mb(hB1.total) : '?'));
if (hA1 && hB1) console.log('相对空数据增量: +' + mb(hB1.used - hA1.used));

console.log('\n=== 进入聊天页（渲染最近 200 条消息窗口） ===');
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return 1;})()");
await sleep(2500);
const hB2 = await heap();
const chatInfo = await evalJs("(function(){var b=document.querySelector('#page-chat .chat-body');return JSON.stringify({children:b?b.children.length:-1});})()");
console.log('聊天 DOM 消息节点数:', chatInfo);
console.log('进聊天页后 JS 堆: used=' + (hB2 ? mb(hB2.used) : '?'));
if (hB1 && hB2) console.log('进聊天页增量: +' + mb(hB2.used - hB1.used));

console.log('\n=== 堆上限参考 ===');
if (hB2) console.log('当前环境 jsHeapSizeLimit: ' + mb(hB2.limit));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
console.log('\n完成。');

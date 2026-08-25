// ===== diag-ask-records.html 专项冒烟 =====
// 模拟「localStorage 被清但 IndexedDB 有数据」「仅 LS 有数据」「数据在其他桌面」
// 「经期全局键在 IDB」四类场景，断言诊断页各区块检测正确、无 JS 异常。
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
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

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
const cdpPort = 9960 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-ask-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 400)); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
const results = [];
function check(desc, ok, detail) { results.push({ desc, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + String(detail).slice(0, 160) + ']' : '')); }

await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');

// ---- 同源种子页：写入模拟 localStorage + IndexedDB ----
await cdp('Page.navigate', { url: baseUrl + '/__seed404' });
await sleep(600);
const seeded = await evalJs(`(async function(){
  try {
    localStorage.clear();
    localStorage.setItem('xy-home-v2:active-contact', 'cabc123');
    localStorage.setItem('xy-home-v2:contacts', JSON.stringify([{id:'cabc123',name:'A'},{id:'cxyz789',name:'B'}]));
    // 场景1：ta-ask 仅在 IDB（当前桌面命名空间）——模拟 LS 被系统清理后未回填
    // 场景2：ta-choose 仅在 LS
    localStorage.setItem('xy-home-v2:cabc123:ta-choose', JSON.stringify({settings:{},questions:[{id:1}],history:[{q:1},{q:2},{q:3}]}));
    // 场景3：invite-ask-history 在 LS（根回退=default 桌面语义这里放当前桌面键）
    localStorage.setItem('xy-home-v2:cabc123:invite-ask-history', JSON.stringify([{q:'a'},{q:'b'},{q:'c'},{q:'d'},{q:'e'}]));
    // 场景4：其他桌面 cxyz789 的 ta-curious 在 IDB
    var db = await new Promise(function(res,rej){
      var rq = indexedDB.open('mochi-db', 1);
      rq.onupgradeneeded = function(){ if(!rq.result.objectStoreNames.contains('kv')) rq.result.createObjectStore('kv'); };
      rq.onsuccess = function(){ res(rq.result); }; rq.onerror = rej;
    });
    await new Promise(function(res,rej){
      var tx = db.transaction('kv','readwrite'); var os = tx.objectStore('kv');
      os.put(JSON.stringify({settings:{},questions:[{id:1},{id:2}],history:[{h:1},{h:2},{h:3},{h:4},{h:5},{h:6},{h:7}]}), 'xy-home-v2:cabc123:ta-ask');
      os.put(JSON.stringify([{s:'2026-08-01',e:'2026-08-05'},{s:'2026-07-03',e:'2026-07-07'}]), 'xy-home-v2:period-records');
      os.put(JSON.stringify({settings:{},questions:[],history:[{h:1},{h:2},{h:3},{h:4}]}), 'xy-home-v2:cxyz789:ta-curious');
      tx.oncomplete = res; tx.onerror = function(){ rej(tx.error); };
    });
    return 'seeded';
  } catch (e) { return 'ERR ' + e.message; }
})()`);
check('S1 种子数据写入成功', seeded === 'seeded', seeded);

// ---- 打开诊断页 ----
await cdp('Page.navigate', { url: baseUrl + '/diag-ask-records.html' });
for (let i = 0; i < 30; i++) { const p = await evalJs(`document.getElementById('prog').textContent`); if (p === '扫描完成') break; await sleep(300); }
await sleep(500);

const t1 = await evalJs(`document.getElementById('t-cid').textContent`);
check('C1 当前桌面识别 cabc123', String(t1).indexOf('cabc123') >= 0, t1);

const rowsAsk = await evalJs(`Array.from(document.querySelectorAll('#t-ask tr')).map(function(r){return r.textContent.replace(/\\s+/g,' ');}).join(' | ')`);
check('A1 ta-ask：LS ✗（被清）且 IDB ✓ 历史7条/题库2条', /TA的询问[\s\S]*?LS\s*✗/.test(rowsAsk) && /IDB\s*✓\s*历史7条\/题库2条/.test(rowsAsk), rowsAsk.slice(0, 160));
check('A2 ta-choose：LS ✓ 历史3条/题库1条', /TA的小问题[\s\S]*?✓\s*历史3条\/题库1条/.test(rowsAsk), '');
check('A3 邀请问问（数组结构）：LS ✓ 记录 5 条', /邀请\/问问[\s\S]*?✓\s*记录 5 条/.test(rowsAsk), '');
var dmCount = (rowsAsk.match(/LS\s*✗\s*无[\s|]*IDB\s*✗\s*无/g) || []).length;
check('A4 双缺失行恰好为未播种的 2 类（好奇/吐槽），有数据的类不误报', dmCount === 2, '双缺失行数=' + dmCount);

const tOther = await evalJs(`document.getElementById('t-other').textContent`);
check('B1 其他桌面发现 cxyz789 · TA的好奇 记录4条', /cxyz789\s*·\s*TA的好奇\s*✓\s*记录\s*4\s*条/.test(tOther.replace(/\s+/g, ' ')), tOther);

const tP = await evalJs(`document.getElementById('t-period').textContent`);
check('D1 period-records IDB ✓ 且显示记录区间 2 段', /period-records.*IDB ✓[\s\S]*记录区间 2 段/.test(tP.replace(/\s+/g, ' ')), tP.slice(0, 150));

const rep = await evalJs(`(function(){
  document.getElementById('btn-copy').click();
  var ta = document.getElementById('report');
  return { shown: ta.style.display !== 'none', len: (ta.value||'').length, hasMissing: (ta.value||'').indexOf('MISSING') >= 0 };
})()`);
check('E1 复制按钮生成报告文本框', !!rep && rep.shown === true && rep.len > 100, rep && JSON.stringify(rep));
check('E2 报告含 MISSING 标记（ta-ask 的 LS 缺失被如实上报）', !!rep && rep.hasMissing === true, '');

const errs = await evalJs(`window.__diagErrs || []`).catch(() => []);
console.log('');
const pass = results.filter((r) => r.ok).length;
console.log('结果: ' + pass + '/' + results.length + ' 项通过');
process.exit(pass === results.length ? 0 : 1);

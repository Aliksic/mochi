// ===== 诊断 2：勾选「隐藏通话小框」后，通话接通时小框是否真的不弹 =====
// 组 A：call-mini-enabled='0'（隐藏）→ 来电接听 → 2.5s 后：大面板常驻、mini 隐藏
// 组 B：call-mini-enabled='1'（显示）→ 来电接听 → 2.5s 后：大面板收起、mini 显示
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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
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

const cdpPort = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-callmini2-' + Date.now()),
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
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
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
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 200)); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
const waitReady = async () => {
  for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) return; await sleep(200); }
};

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await waitReady();
await sleep(1200);

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

// 组 A：隐藏小框（call-mini-enabled='0'）
await evalJs(`window.activeStore().set('call-mini-enabled', '0'); true;`);
await evalJs(`window.triggerIncomingCall(); true;`);
await sleep(600);
let st = await evalJs(`({
  maskHidden: document.getElementById('call-mask').hidden,
  miniHidden: document.getElementById('call-mini').hidden,
  state: window.getCallState()
})`);
console.log('== A: 来电中(隐藏) ==', JSON.stringify(st));
check('A: 来电面板显示', st.maskHidden === false);
await evalJs(`document.getElementById('call-answer-btn').click(); true;`);
await sleep(2600); // 2 秒最小化之后
st = await evalJs(`({
  maskHidden: document.getElementById('call-mask').hidden,
  miniHidden: document.getElementById('call-mini').hidden,
  state: window.getCallState()
})`);
console.log('== A: 接通 2.6s 后(隐藏) ==', JSON.stringify(st));
check('A: 大面板保持常驻（mask 未隐藏）', st.maskHidden === false, 'maskHidden=' + st.maskHidden);
check('A: 悬浮小框未弹出（mini 隐藏）', st.miniHidden === true, 'miniHidden=' + st.miniHidden);
await evalJs(`window.hangupCall(); true;`);
await sleep(400);

// 组 B：显示小框（call-mini-enabled='1'）
await evalJs(`window.activeStore().set('call-mini-enabled', '1'); true;`);
await evalJs(`window.triggerIncomingCall(); true;`);
await sleep(600);
await evalJs(`document.getElementById('call-answer-btn').click(); true;`);
await sleep(2600);
st = await evalJs(`({
  maskHidden: document.getElementById('call-mask').hidden,
  miniHidden: document.getElementById('call-mini').hidden,
  state: window.getCallState()
})`);
console.log('== B: 接通 2.6s 后(显示) ==', JSON.stringify(st));
check('B: 大面板收起（mask 隐藏）', st.maskHidden === true, 'maskHidden=' + st.maskHidden);
check('B: 悬浮小框弹出（mini 显示）', st.miniHidden === false, 'miniHidden=' + st.miniHidden);
await evalJs(`window.hangupCall(); true;`);

// 组 C：隐藏小框 + 去电接通
await evalJs(`window.activeStore().set('call-mini-enabled', '0'); true;`);
await evalJs(`window.placeCall(); true;`);
await sleep(4000); // 拨打 1.8~3.3s 出结果 + 接通 2s 最小化
st = await evalJs(`({
  maskHidden: document.getElementById('call-mask').hidden,
  miniHidden: document.getElementById('call-mini').hidden,
  state: window.getCallState()
})`);
console.log('== C: 去电接通后(隐藏) ==', JSON.stringify(st));
if (st.state && st.state.status === 'connected') {
  check('C: 去电接通后大面板常驻', st.maskHidden === false, 'maskHidden=' + st.maskHidden);
  check('C: 去电接通后 mini 未弹出', st.miniHidden === true, 'miniHidden=' + st.miniHidden);
} else {
  console.log('C: 去电未接通（概率结果），跳过断言', JSON.stringify(st.state));
}
await evalJs(`window.hangupCall(); true;`);

const failed = results.filter(r => !r.ok);
console.log('\n==== 结果：' + results.length + ' 项检查，' + failed.length + ' 项失败 ====');
if (failed.length) { failed.forEach(f => console.log('  FAIL:', f.desc)); process.exitCode = 1; }
else console.log('全部通过（无头环境未能复现通话行为问题）');
chrome.kill();
server.close();
process.exit(process.exitCode || 0);

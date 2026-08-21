// ===== 诊断 4：刷新持久化 + 切桌面回切（用 .click()，规避 headless 输入仿真问题） =====
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
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
const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-persist-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });
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
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) { try { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r && r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200); return r && r.result ? r.result.value : null; } catch (e) { return null; } }
const waitReady = async () => { for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) return; await sleep(200); } };
await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await waitReady(); await sleep(1200);
const results = [];
function check(desc, ok, detail) { results.push({ desc, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : '')); }

await evalJs(`(function(){ const s=document.getElementById('splash'); if(s) s.style.display='none'; return true; })()`);
// 进入聊天设置并勾选
await evalJs(`document.getElementById('chat-settings-btn').click(); true;`);
await sleep(400);
await evalJs(`(function(){ const el=document.getElementById('cs-call-mini-hide'); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
await sleep(300);
let st = await evalJs(`({ checked: document.getElementById('cs-call-mini-hide').checked, storeVal: window.activeStore().get('call-mini-enabled'), getMini: window.getCallMiniEnabled() })`);
console.log('勾选后:', JSON.stringify(st));
check('勾选后 checked=true', st.checked === true);
check('勾选后 store=0', st.storeVal === '0');

// 刷新页面（同 session 保持 localStorage）
await cdp('Page.reload');
await waitReady(); await sleep(1200);
st = await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  return { checked: el ? el.checked : null, storeVal: window.activeStore().get('call-mini-enabled'), getMini: window.getCallMiniEnabled(), lsRaw: localStorage.getItem('xy-home-v2:default:call-mini-enabled') };
})()`);
console.log('刷新后:', JSON.stringify(st));
check('刷新后开关保持勾选', st.checked === true, String(st.checked));
check('刷新后 getMini=false', st.getMini === false, String(st.getMini));
check('刷新后 LS 原始键=0', st.lsRaw === '0', String(st.lsRaw));

// 切桌面再切回（验证 activeStore 动态绑定不丢）
await evalJs(`(function(){
  const cid = window.__activeCid;
  window.__activeCid = 'c-test99';
  const before = window.activeStore().get('call-mini-enabled');
  window.activeStore().set('call-mini-enabled', '1');
  window.__activeCid = cid;
  return { testDeskVal: before };
})()`);
st = await evalJs(`({ checked: document.getElementById('cs-call-mini-hide').checked, storeVal: window.activeStore().get('call-mini-enabled'), getMini: window.getCallMiniEnabled() })`);
console.log('切桌面回切后:', JSON.stringify(st));
check('回切后开关仍勾选（桌面隔离正常）', st.checked === true, String(st.checked));
check('回切后 store 仍为 0', st.storeVal === '0', String(st.storeVal));

const failed = results.filter(r => !r.ok);
console.log('\n==== 结果：' + results.length + ' 项检查，' + failed.length + ' 项失败 ====');
if (failed.length) { failed.forEach(f => console.log('  FAIL:', f.desc)); process.exitCode = 1; }
else console.log('全部通过（持久化与多桌面隔离均正常）');
chrome.kill(); server.close();
process.exit(process.exitCode || 0);

// ===== 快速冒烟：群聊开关绑定 + 群聊页打开（v3.8.x） =====
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gc-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });
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
// 打开聊天设置，验证群聊开关绑定
await evalJs(`document.getElementById('chat-settings-btn').click(); true;`);
await sleep(400);
const gc = await evalJs(`(function(){
  const el = document.getElementById('cs-group-chat');
  return { exists: !!el, checked0: el ? el.checked : null };
})()`);
check('群聊开关存在', gc.exists);
check('群聊开关初始未勾选', gc.checked0 === false, String(gc.checked0));
// 点击群聊开关
await evalJs(`(function(){ const el=document.getElementById('cs-group-chat'); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
await sleep(300);
const gc2 = await evalJs(`(function(){
  return {
    checked: document.getElementById('cs-group-chat').checked,
    storeVal: window.activeStore().get('group-chat-enabled'),
    toast: document.getElementById('cc-toast') ? document.getElementById('cc-toast').textContent : ''
  };
})()`);
console.log('群聊开关点击后:', JSON.stringify(gc2));
check('群聊开关点击后勾选', gc2.checked === true, String(gc2.checked));
check('群聊 store=1', gc2.storeVal === '1', String(gc2.storeVal));
check('群聊 toast 弹出', gc2.toast.includes('群聊'), gc2.toast);
// 桌面出现群聊按钮
const desk = await evalJs(`(function(){
  const gcBtn = document.getElementById('gc-desk-btn') || document.querySelector('[data-widget="app-group-chat"]');
  const divineBtn = document.getElementById('divine-desk-btn') || document.querySelector('[data-widget="app-divination"]');
  return { gcBtn: !!gcBtn, divineVisible: divineBtn ? !divineBtn.hidden : 'n/a' };
})()`);
console.log('桌面群聊/占卜按钮:', JSON.stringify(desk));
// 打开群聊页
await evalJs(`(function(){
  const pages = document.querySelectorAll('.page');
  const gp = document.getElementById('page-group-chat');
  if (gp) { pages.forEach(p => p.hidden = true); gp.hidden = false; }
  return !!gp;
})()`);
await sleep(300);
const gp = await evalJs(`(function(){
  const p = document.getElementById('page-group-chat');
  const nm = document.getElementById('gc-name');
  return { pageVisible: p ? !p.hidden : false, name: nm ? nm.textContent : null, input: !!document.getElementById('gc-input'), send: !!document.getElementById('gc-send') };
})()`);
console.log('群聊页:', JSON.stringify(gp));
check('群聊页可打开且渲染', gp.pageVisible && gp.input && gp.send, JSON.stringify(gp));

const failed = results.filter(r => !r.ok);
console.log('\n==== 结果：' + results.length + ' 项检查，' + failed.length + ' 项失败 ====');
if (failed.length) { failed.forEach(f => console.log('  FAIL:', f.desc)); process.exitCode = 1; }
else console.log('群聊开关/页面冒烟全部通过');
chrome.kill(); server.close();
process.exit(process.exitCode || 0);

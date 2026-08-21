// ===== 诊断：聊天设置「隐藏通话小框」开关点击无效 =====
// 复现路径：进聊天页 → 右上角三点打开聊天设置 → 点击 #cs-call-mini-hide → 检查
//   1) change 后 checked 状态（立即 / 600ms 后是否被 500ms 轮询拨回）
//   2) store 里 call-mini-enabled 实际值（activeStore + 裸 localStorage 键）
//   3) window.getCallMiniEnabled() / setCallMiniEnabled 链路
//   4) toast 是否弹出、localStorage 剩余空间（QuotaExceeded 嫌疑）
// 对比项：同页 #cs-music-float 音乐悬浮小窗开关（同模式实现，作为对照组）
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-callmini-' + Date.now()),
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
    if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 300)); return null; }
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

// 进入聊天页（默认桌面），打开聊天设置
await evalJs(`(function(){
  const btn = document.getElementById('chat-settings-btn');
  if (btn) btn.click();
  return !!btn;
})()`);
await sleep(400);

// 初始状态
const init = await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  const mf = document.getElementById('cs-music-float');
  return {
    cmhExists: !!el, mfExists: !!mf,
    cmhChecked: el ? el.checked : null,
    mfChecked: mf ? mf.checked : null,
    pageVisible: !!document.getElementById('page-chat-settings') && !document.getElementById('page-chat-settings').hidden,
    getMini: typeof window.getCallMiniEnabled === 'function' ? window.getCallMiniEnabled() : 'NO-HOOK',
    setMini: typeof window.setCallMiniEnabled === 'function' ? 'exists' : 'NO-HOOK',
    storeVal: (function(){ try { return window.activeStore().get('call-mini-enabled'); } catch(e){ return 'ERR:'+e.message; } })(),
    lsKeys: Object.keys(localStorage).filter(k => k.includes('call-mini')),
    quotaUsed: (function(){ try { let n=0; for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); n+= (k.length + (localStorage.getItem(k)||'').length)*2; } return n; } catch(e){ return -1; } })()
  };
})()`);
console.log('== 初始状态 ==', JSON.stringify(init));
check('聊天设置页可见', init.pageVisible);
check('开关元素存在', init.cmhExists);
check('getCallMiniEnabled 钩子存在', init.getMini !== 'NO-HOOK');
check('store 初始为 undefined（默认开）', init.storeVal === null || init.storeVal === undefined, String(init.storeVal));

// 真实点击 label（模拟用户点开关）
await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  const row = document.getElementById('cs-call-mini-hide-row');
  const label = el.closest('label.toggle');
  label.click();  // label click → input toggle + change
  return true;
})()`);
const afterClick = await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  return {
    cmhChecked: el.checked,
    getMini: window.getCallMiniEnabled(),
    storeVal: window.activeStore().get('call-mini-enabled'),
    toastText: document.getElementById('cc-toast') ? document.getElementById('cc-toast').textContent : '',
    toastShow: document.getElementById('cc-toast') ? document.getElementById('cc-toast').className : ''
  };
})()`);
console.log('== 点击后（立即） ==', JSON.stringify(afterClick));
check('点击后 checked=true', afterClick.cmhChecked === true, String(afterClick.cmhChecked));
check('getCallMiniEnabled()=false', afterClick.getMini === false, String(afterClick.getMini));
check('store=0', afterClick.storeVal === '0', String(afterClick.storeVal));
check('toast 弹出', afterClick.toastShow && afterClick.toastShow.includes('show'), afterClick.toastText);

// 等 700ms，看 500ms 轮询是否把开关拨回
await sleep(700);
const afterWait = await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  return {
    cmhChecked: el.checked,
    getMini: window.getCallMiniEnabled(),
    storeVal: window.activeStore().get('call-mini-enabled')
  };
})()`);
console.log('== 点击后（+700ms 轮询） ==', JSON.stringify(afterWait));
check('700ms 后 checked 仍为 true（未被拨回）', afterWait.cmhChecked === true, String(afterWait.cmhChecked));
check('700ms 后 store 仍为 0', afterWait.storeVal === '0', String(afterWait.storeVal));

// 反向：再点一次取消勾选
await evalJs(`(function(){
  document.getElementById('cs-call-mini-hide').closest('label.toggle').click();
  return true;
})()`);
const afterUnclick = await evalJs(`(function(){
  const el = document.getElementById('cs-call-mini-hide');
  return { cmhChecked: el.checked, getMini: window.getCallMiniEnabled(), storeVal: window.activeStore().get('call-mini-enabled') };
})()`);
console.log('== 再次点击（取消勾选） ==', JSON.stringify(afterUnclick));
check('取消勾选后 checked=false', afterUnclick.cmhChecked === false, String(afterUnclick.cmhChecked));
check('取消勾选后 getMini=true', afterUnclick.getMini === true, String(afterUnclick.getMini));

// 对照组：音乐悬浮小窗开关
const mfInit = await evalJs(`(function(){
  const el = document.getElementById('cs-music-float');
  if (!el) return null;
  const before = { checked: el.checked, hook: typeof window.musicFloatGet === 'function' ? window.musicFloatGet() : 'NO' };
  el.closest('label.toggle').click();
  const after = { checked: el.checked, hook: typeof window.musicFloatGet === 'function' ? window.musicFloatGet() : 'NO' };
  return { before, after };
})()`);
console.log('== 对照组 music-float ==', JSON.stringify(mfInit));

// 裸 localStorage 键检查（看是否写到了别的命名空间）
const lsAll = await evalJs(`(function(){
  const out = {};
  for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k.includes('call-mini')) out[k]=localStorage.getItem(k); }
  return out;
})()`);
console.log('== localStorage 中所有 call-mini 键 ==', JSON.stringify(lsAll));

// localStorage 空间检查
const quota = await evalJs(`(function(){
  const sample = 'x'.repeat(1024);
  let free = -1;
  try { const k='__quota_probe__'; localStorage.setItem(k, sample); localStorage.removeItem(k); free = '可写'; } catch(e){ free = '写满! ' + e.name; }
  return { free, keys: localStorage.length };
})()`);
console.log('== localStorage 空间 ==', JSON.stringify(quota));

const failed = results.filter(r => !r.ok);
console.log('\n==== 结果：' + results.length + ' 项检查，' + failed.length + ' 项失败 ====');
if (failed.length) { failed.forEach(f => console.log('  FAIL:', f.desc)); process.exitCode = 1; }
else console.log('全部通过（无头环境未能复现，需结合真机现象判断）');
chrome.kill();
server.close();
process.exit(process.exitCode || 0);

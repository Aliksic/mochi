// ===== 诊断：切换桌面联系人后聊天记录丢失（用户反馈回归） =====
// 用法：node tools/diag-contact-switch-chat.mjs
// 场景：
//   S1 双桌面各种子独立历史 → 反复互切并进聊天页核对（显示正确 + 数据不丢）
//   S2 在 A 发消息后立即切 B（防抖窗口内）→ 消息必须落在 A，B 不被污染
//   S3 只切桌面不进聊天页来回多次 → 两边历史都完好
//   S4 切走再切回期间 TA 定时器补发消息（scheduleReply 匿名 setTimeout 无法被切换取消）
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

const cdpPort = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-switch-' + Date.now()),
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
    if (r && r.exceptionDetails) { console.error('  [eval err]', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 300)); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(900);

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}
async function openChat() {
  await evalJs(`(function(){ var app = document.querySelector('.app[data-app="chat"]'); if (app) app.click(); return !!app; })()`);
  await sleep(700);
  for (let i = 0; i < 20; i++) {
    const vis = await evalJs(`(function(){ var p=document.getElementById('page-chat'); return p && !p.hidden; })()`);
    if (vis) break;
    await sleep(250);
  }
  await sleep(500);
}
async function closeChat() {
  await evalJs(`(function(){ var b=document.getElementById('chat-back'); if(b){b.click();return true;} var p=document.getElementById('page-chat'); if(p) p.hidden=true; return false; })()`);
  await sleep(300);
}

// ============ 种子：两个联系人各自历史 ============
const seed = JSON.parse(await evalJs(`(function(){
  try {
    function mk(cidName, texts) {
      var cid = window.createContact(cidName);
      var msgs = texts.map(function(t, i){
        return { side: i % 2 ? 'out' : 'in', text: t, ts: Date.now() - (600 - i * 10) * 1000 };
      });
      window.idbSet('xy-home-v2:' + cid + ':chat-msgs', JSON.stringify(msgs));
      localStorage.setItem('xy-home-v2:' + cid + ':chat-msgs', JSON.stringify(msgs));
      return cid;
    }
    var cb = mk('角色B', ['B线-旧消息1', 'B线-旧消息2', 'B线-旧消息3']);
    return JSON.stringify({ ok: true, cidB: cb });
  } catch(e) { return JSON.stringify({ ok: false, err: e.message }); }
})()`) || '{}');
check('种子：创建联系人B 并写入独立历史', seed.ok === true, JSON.stringify(seed));
if (!seed.ok) process.exit(1);
const cidB = seed.cidB;

// default 桌面也种子几条
await evalJs(`(function(){
  var msgs = [
    { side: 'in', text: 'A线-默认桌消息1', ts: Date.now() - 500000 },
    { side: 'out', text: 'A线-默认桌消息2', ts: Date.now() - 490000 }
  ];
  window.idbSet('xy-home-v2:default:chat-msgs', JSON.stringify(msgs));
  localStorage.setItem('xy-home-v2:default:chat-msgs', JSON.stringify(msgs));
  return true;
})()`);
await sleep(300);

// ============ S1：反复互切核对 ============
async function chatSnapshot() {
  return JSON.parse(await evalJs(`(function(){
    var body = document.getElementById('chat-body');
    var name = document.getElementById('chat-partner-name');
    return JSON.stringify({
      visible: (function(){ var p=document.getElementById('page-chat'); return p && !p.hidden; })(),
      childCount: body ? body.children.length : -1,
      sample: body ? body.textContent.replace(/\\s+/g,' ').slice(0, 120) : '',
      title: name ? name.textContent : ''
    });
  })()`) || '{}');
}

console.log('\n--- S1: 默认 → B → 默认 → B ---');
await openChat();
let snap = await chatSnapshot();
console.log('  [默认桌聊天]', JSON.stringify(snap));
check('S1-1 默认桌聊天显示A线历史', snap.visible && snap.childCount >= 2 && snap.sample.indexOf('A线') >= 0, 'children=' + snap.childCount);
await closeChat();

await evalJs(`window.setActiveContact(${JSON.stringify(cidB)})`);
await sleep(600);
await openChat();
snap = await chatSnapshot();
console.log('  [B桌聊天]', JSON.stringify(snap));
check('S1-2 B桌聊天显示B线历史', snap.visible && snap.childCount >= 3 && snap.sample.indexOf('B线') >= 0, 'children=' + snap.childCount);
await closeChat();

await evalJs(`window.setActiveContact('default')`);
await sleep(600);
await openChat();
snap = await chatSnapshot();
console.log('  [回到默认桌聊天]', JSON.stringify(snap));
check('S1-3 切回默认桌A线历史仍在', snap.visible && snap.childCount >= 2 && snap.sample.indexOf('A线') >= 0, 'children=' + snap.childCount);
await closeChat();

await evalJs(`window.setActiveContact(${JSON.stringify(cidB)})`);
await sleep(600);
await openChat();
snap = await chatSnapshot();
check('S1-4 再切回B桌B线历史仍在', snap.visible && snap.childCount >= 3 && snap.sample.indexOf('B线') >= 0, 'children=' + snap.childCount);
await closeChat();

// ============ S2：发消息后立即切走（防抖窗口）============
console.log('\n--- S2: 默认桌发消息后 100ms 内切到 B ---');
await evalJs(`window.setActiveContact('default')`);
await sleep(600);
await openChat();
await evalJs(`(function(){
  var input = document.getElementById('chat-input');
  if (!input) return 'no input';
  input.textContent = 'S2防抖测试消息';
  var btn = document.getElementById('chat-send');
  if (btn) btn.click();
  return 'sent';
})()`);
await sleep(100); // 400ms 防抖窗口内立即切
await evalJs(`window.setActiveContact(${JSON.stringify(cidB)})`);
await sleep(1200); // 等防抖回调本应已被 contact-switched 兜底落盘
await openChat();
snap = await chatSnapshot();
console.log('  [切走后立刻看B桌]', JSON.stringify(snap));
check('S2-1 防抖期切走后 B 桌不含 A 的消息（不串桌面）', snap.sample.indexOf('S2防抖测试消息') < 0, 'sample=' + snap.sample.slice(0, 60));

// 回 default 看消息是否保住
await evalJs(`window.setActiveContact('default')`);
await sleep(800);
await openChat();
snap = await chatSnapshot();
console.log('  [回到默认桌]', JSON.stringify(snap));
check('S2-2 防抖期切走，A 桌新消息仍在', snap.sample.indexOf('S2防抖测试消息') >= 0, 'sample=' + snap.sample.slice(0, 80));
await closeChat();

// ============ S3：只切桌面不进聊天页来回快速多次 ============
console.log('\n--- S3: 快速来回切换 x6（不进聊天页）---');
for (let i = 0; i < 6; i++) {
  await evalJs(i % 2 ? `window.setActiveContact('default')` : `window.setActiveContact(${JSON.stringify(cidB)})`);
  await sleep(250);
}
await sleep(800);
// 终态在 default？6次循环: i=0→B,1→def,2→B,3→def,4→B,5→def → 终态 default
await openChat();
snap = await chatSnapshot();
check('S3-1 快速互切后默认桌A线+S2消息完整', snap.visible && snap.sample.indexOf('A线') >= 0 && snap.sample.indexOf('S2防抖测试消息') >= 0, 'sample=' + snap.sample.slice(0, 90));
await closeChat();
await evalJs(`window.setActiveContact(${JSON.stringify(cidB)})`);
await sleep(600);
await openChat();
snap = await chatSnapshot();
check('S3-2 快速互切后 B 桌B线完整', snap.visible && snap.childCount >= 3 && snap.sample.indexOf('B线') >= 0, 'children=' + snap.childCount);
await closeChat();

// ============ 数据层终检：直接读 IDB 键 ============
console.log('\n--- 数据层终检（IDB 权威键内容）---');
const finalData = JSON.parse(await evalJs(`(function(){
  return new Promise(function(resolve){
    var out = {};
    Promise.all([
      window.idbGet('xy-home-v2:default:chat-msgs'),
      window.idbGet('xy-home-v2:${cidB}:chat-msgs')
    ]).then(function(rs){
      out.def = rs[0] ? JSON.parse(rs[0]).map(function(m){ return m.text || (m.special||''); }).filter(Boolean) : [];
      out.b = rs[1] ? JSON.parse(rs[1]).map(function(m){ return m.text || (m.special||''); }).filter(Boolean) : [];
      resolve(JSON.stringify(out));
    });
  });
})()`) || '{}');
console.log('  default IDB:', JSON.stringify(finalData.def));
console.log('  B IDB:', JSON.stringify(finalData.b));
check('DATA-default 含A线两消息+S2消息', finalData.def.some(t => String(t).indexOf('A线-默认桌消息1') >= 0) && finalData.def.some(t => String(t).indexOf('S2防抖测试消息') >= 0), '');
check('DATA-B 三条B线都在', finalData.b.filter(t => String(t).indexOf('B线') >= 0).length === 3, JSON.stringify(finalData.b.filter(t => String(t).indexOf('B线') >= 0)));

const failed = results.filter(r => !r.ok);
console.log('\n===== 诊断结果：' + (results.length - failed.length) + '/' + results.length + ' 通过 =====');
chrome.kill();
server.close();
process.exit(failed.length ? 1 : 0);

// 临时诊断：确认「问问TA」里会不会出现 "HarmonyOS 系统 / 型号 STK-AL00" 这类文本
// 检查：① 预设题库/选项 ② localStorage 用户数据 ③ 单选题 TA 选择是否随机（多次提交）
// 用法：node tools/diag-ask-harmony.mjs
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
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-ask-diag-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });

let ws, msgId = 0; const pend = new Map();
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
  throw new Error('无法连接无头浏览器');
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { err: true, detail: r.exceptionDetails.text };
    return r && r.result ? r.result.value : null;
  } catch (e) { return { err: true, detail: String(e) }; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);

// ① 题库文本扫描（预设 + localStorage 全部键值）
const scan = await evalJs(`(function(){
  var hits = [];
  var bad = /harmony|stk-?al00|型号|harmonyos/i;
  // 预设题库：从 ta-ask 的默认问题/选项里找
  try {
    // 直接读 DEFAULT_QUESTIONS 不可见（闭包），改为扫描聊天记录与全部 localStorage
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k) || '';
      if (bad.test(k) || bad.test(v)) hits.push({ k: k, sample: v.slice(0, 200) });
    }
  } catch (e) { hits.push({ err: String(e) }); }
  return JSON.stringify({ hitCount: hits.length, hits: hits.slice(0, 10) });
})()`);
console.log('① localStorage 含 harmony/型号 的键值：\n' + JSON.stringify(JSON.parse(scan || '{}'), null, 2));

// ② 打开聊天页 → 打开「问问TA」面板，确认选项框初始为空
const appInfo = await evalJs(`(function(){
  var app = document.querySelector('.app[data-app="chat"]');
  var chatPage = document.getElementById('page-chat');
  return JSON.stringify({ appExists: !!app, chatPageHidden: chatPage ? chatPage.hidden : null });
})()`);
console.log('②-a 聊天入口：' + appInfo);
await evalJs(`(function(){
  var app = document.querySelector('.app[data-app="chat"]');
  if (app) app.click();
  return true;
})()`);
await sleep(800);
const afterChat = await evalJs(`(function(){
  var chatPage = document.getElementById('page-chat');
  var more = document.getElementById('more-ask');
  return JSON.stringify({ chatPageHidden: chatPage ? chatPage.hidden : null, moreExists: !!more });
})()`);
console.log('②-b 点击聊天后：' + afterChat);
await evalJs(`(function(){
  var more = document.getElementById('more-ask');
  if (more) more.click();
  return true;
})()`);
await sleep(500);
// 最小验证：填值后同一 eval 内立即读回（排除定时器清空/时序干扰）
const miniTest = await evalJs(`(function(){
  var panel = document.getElementById('chat-ask-panel');
  var btn = panel.querySelector('.chat-ask-type-btn[data-atype="single"]');
  var clicked = false;
  if (btn) { btn.click(); clicked = true; }
  var input = document.getElementById('chat-ask-input');
  var opts = document.getElementById('chat-ask-opts');
  var setInp = false, setOpts = false, readInp = null, readOpts = null;
  try { input.value = '今天想喝什么？'; setInp = true; } catch (e) { setInp = 'ERR:' + e.message; }
  try { readInp = input.value; } catch (e) { readInp = 'ERR:' + e.message; }
  try { opts.value = '选项A~回应A\\n选项B~回应B\\n选项C~回应C\\n选项D~回应D'; setOpts = true; } catch (e) { setOpts = 'ERR:' + e.message; }
  try { readOpts = opts.value; } catch (e) { readOpts = 'ERR:' + e.message; }
  return JSON.stringify({ clicked: clicked, setInp: setInp, readInp: readInp, setOpts: setOpts, readOpts: readOpts,
    optsHiddenAfter: opts ? opts.hidden : null, singleSelAfter: btn ? btn.classList.contains('sel') : null,
    inputBoxTxt: input.__ceBox ? input.__ceBox.textContent : null, optsBoxTxt: opts.__ceBox ? opts.__ceBox.textContent : null });
})()`);
console.log('②-c 最小验证（同 eval 赋值+读回）：' + miniTest);
const panelCheck = await evalJs(`(function(){
  var panel = document.getElementById('chat-ask-panel');
  var title = document.getElementById('chat-ask-title');
  var opts = document.getElementById('chat-ask-opts');
  var input = document.getElementById('chat-ask-input');
  return JSON.stringify({ panelOpen: panel ? !panel.hidden : null, title: title ? title.textContent : null,
    optsExists: !!opts, optsValue: opts ? opts.value : null, inputValue: input ? input.value : null });
})()`);
console.log('② 「问问TA」面板初始状态：\n' + JSON.stringify(JSON.parse(panelCheck || '{}'), null, 2));

// ③ 切单选题，填 4 个选项，多次提交验证 TA 是否随机选（不固定第一个）
// 聊天记录键：命名空间 xy-home-v2:default:chat-msgs（或旧顶层键）——动态找
function readChatMsgsExpr() {
  return `(function(){
    var k = null;
    for (var i = 0; i < localStorage.length; i++) {
      var kk = localStorage.key(i);
      if (/chat-msgs$/.test(kk)) { k = kk; }
    }
    if (!k) return null;
    try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return null; }
  })()`;
}
const picks = [];
for (let round = 0; round < 8; round++) {
  await evalJs(`(function(){
    // 关闭再重开，重置类型
    var cancel = document.getElementById('chat-ask-cancel'); if (cancel) cancel.click();
    var more = document.getElementById('more-ask'); if (more) more.click();
    return true;
  })()`);
  await sleep(300);
  const typeInfo = await evalJs(`(function(){
    var panel = document.getElementById('chat-ask-panel');
    var btn = panel ? panel.querySelector('.chat-ask-type-btn[data-atype="single"]') : null;
    var typeRow = panel ? panel.querySelector('.chat-ask-type') : null;
    return JSON.stringify({ panelHidden: panel ? panel.hidden : null, typeRowHidden: typeRow ? typeRow.hidden : null, btnExists: !!btn });
  })()`);
  if (round === 0) console.log('③ round0 类型行状态：' + typeInfo);
  const clickInfo = await evalJs(`(function(){
    var panel = document.getElementById('chat-ask-panel');
    var btn = panel ? panel.querySelector('.chat-ask-type-btn[data-atype="single"]') : null;
    var before = btn ? btn.classList.contains('sel') : null;
    if (btn) btn.click();
    var after = btn ? btn.classList.contains('sel') : null;
    var opts = document.getElementById('chat-ask-opts');
    var input = document.getElementById('chat-ask-input');
    var inputBox = input ? (input.__ceBox || null) : null;
    var optsBox = opts ? (opts.__ceBox || null) : null;
    return JSON.stringify({ btnExists: !!btn, selBefore: before, selAfter: after,
      optsHidden: opts ? opts.hidden : null, optsConnected: opts ? opts.isConnected : null,
      inputConnected: input ? input.isConnected : null, inputBoxConnected: inputBox ? inputBox.isConnected : null,
      optsBoxConnected: optsBox ? optsBox.isConnected : null });
  })()`);
  if (round === 0) console.log('③ round0 点击单选后：' + clickInfo);
  const assignInfo = await evalJs(`(function(){
    var input = document.getElementById('chat-ask-input');
    var opts = document.getElementById('chat-ask-opts');
    var out = {};
    try { out.in0 = input.value; } catch (e) { out.in0 = 'ERR:' + e.message; }
    try { input.value = '今天想喝什么？'; out.setInp = 'ok'; } catch (e) { out.setInp = 'ERR:' + e.message; }
    try { out.in1 = input.value; } catch (e) { out.in1 = 'ERR:' + e.message; }
    try { out.box1 = input.__ceBox ? input.__ceBox.textContent : null; } catch (e) { out.box1 = 'ERR:' + e.message; }
    try { opts.value = '选项A~回应A\n选项B~回应B\n选项C~回应C\n选项D~回应D'; out.setOpts = 'ok'; } catch (e) { out.setOpts = 'ERR:' + e.message; }
    try { out.op1 = opts.value; } catch (e) { out.op1 = 'ERR:' + e.message; }
    try { out.in2 = input.value; } catch (e) { out.in2 = 'ERR:' + e.message; }
    try { out.box2 = input.__ceBox ? input.__ceBox.textContent : null; } catch (e) { out.box2 = 'ERR:' + e.message; }
    return out;
  })()`);
  if (round === 0) console.log('③ round0 同eval赋值+读回：' + JSON.stringify(assignInfo));
  await sleep(300);
  const valInfo = await evalJs(`(function(){
    var input = document.getElementById('chat-ask-input');
    var opts = document.getElementById('chat-ask-opts');
    var btn = document.getElementById('chat-ask-panel').querySelector('.chat-ask-type-btn[data-atype="single"]');
    return JSON.stringify({
      inputVal: input ? input.value : null, optsVal: opts ? opts.value : null, optsHidden: opts ? opts.hidden : null,
      singleSel: btn ? btn.classList.contains('sel') : null,
      inputBoxTxt: input.__ceBox ? input.__ceBox.textContent : null,
      optsBoxTxt: opts.__ceBox ? opts.__ceBox.textContent : null
    });
  })()`);
  if (round === 0) console.log('③ round0 300ms后：' + valInfo);
  await evalJs(`(function(){
    var ok = document.getElementById('chat-ask-ok'); if (ok) ok.click();
    return true;
  })()`);
  // 轮询等待 TA 回答（最长 6 秒）
  let r = null;
  for (let w = 0; w < 30; w++) {
    await sleep(200);
    r = await evalJs(`(function(){
      var arr = ${readChatMsgsExpr().replace(/^\(function/, '(function')};
      if (!arr || !arr.length) return null;
      for (var i = arr.length - 1; i >= 0; i--) {
        var m = arr[i];
        if (m && m.special === 'ask' && m.askStatus === 'answered' && m.askQuestion === '今天想喝什么？') {
          return JSON.stringify({ pick: m.askAnswer });
        }
      }
      return null;
    })()`);
    if (r) break;
  }
  if (round === 0 && !r) {
    const debugInfo = await evalJs(`(function(){
      var arr = ${readChatMsgsExpr().replace(/^\(function/, '(function')};
      var last = arr && arr.length ? arr[arr.length - 1] : null;
      return JSON.stringify({ total: arr ? arr.length : -1, last: last ? { side: last.side, special: last.special, text: (last.text||'').slice(0,30) } : null });
    })()`);
    console.log('③ round0 未等到回答，最近消息：' + debugInfo);
  }
  picks.push(JSON.parse(r || '{}'));
}
const pickSet = new Set(picks.map(p => p.pick).filter(Boolean));
console.log('③ 8 次单选题 TA 的选项：' + JSON.stringify(picks.map(p => p.pick)));
console.log('   不同选项数：' + pickSet.size + '（>1 说明是随机选，不是固定第一个）');

// ④ 聊天记录里是否有 HarmonyOS 相关消息
const chatScan = await evalJs(`(function(){
  try {
    var msgs = JSON.parse(localStorage.getItem('xy-home-v2:chat-msgs') || '[]');
    var bad = /harmony|stk-?al00|型号/i;
    var hits = [];
    for (var i = 0; i < msgs.length; i++) {
      var s = JSON.stringify(msgs[i]);
      if (bad.test(s)) hits.push({ i: i, side: msgs[i].side, special: msgs[i].special, text: (msgs[i].text || msgs[i].askQuestion || '').slice(0, 80) });
    }
    return JSON.stringify({ total: msgs.length, hits: hits.slice(0, 10) });
  } catch (e) { return JSON.stringify({ err: String(e) }); }
})()`);
console.log('④ 聊天记录含 harmony/型号 的消息：\n' + JSON.stringify(JSON.parse(chatScan || '{}'), null, 2));

chrome.kill();
server.close();
process.exit(0);

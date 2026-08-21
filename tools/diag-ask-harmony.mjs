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

// ② 打开「问问TA」面板，确认选项框初始为空
await evalJs(`(function(){
  var more = document.getElementById('more-ask');
  if (more) more.click();
  return true;
})()`);
await sleep(500);
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
const picks = [];
for (let round = 0; round < 8; round++) {
  await evalJs(`(function(){
    // 关闭再重开，重置类型
    var cancel = document.getElementById('chat-ask-cancel'); if (cancel) cancel.click();
    var more = document.getElementById('more-ask'); if (more) more.click();
    return true;
  })()`);
  await sleep(300);
  await evalJs(`(function(){
    var panel = document.getElementById('chat-ask-panel');
    var btn = panel.querySelector('.chat-ask-type-btn[data-atype="single"]');
    if (btn) btn.click();
    var input = document.getElementById('chat-ask-input');
    input.value = '今天想喝什么？';
    var opts = document.getElementById('chat-ask-opts');
    opts.value = '选项A~回应A\n选项B~回应B\n选项C~回应C\n选项D~回应D';
    return true;
  })()`);
  await sleep(300);
  await evalJs(`(function(){
    var ok = document.getElementById('chat-ask-ok'); if (ok) ok.click();
    return true;
  })()`);
  await sleep(2800);
  const r = await evalJs(`(function(){
    try {
      var msgs = JSON.parse(localStorage.getItem('xy-home-v2:chat-msgs') || '[]');
      for (var i = msgs.length - 1; i >= 0; i--) {
        var m = msgs[i];
        if (m && m.special === 'ask' && m.askStatus === 'answered' && m.askQuestion === '今天想喝什么？') {
          return JSON.stringify({ pick: m.askAnswer });
        }
      }
      return JSON.stringify({ pick: null });
    } catch (e) { return JSON.stringify({ err: String(e) }); }
  })()`);
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

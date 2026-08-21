// ===== 专项验证：群聊功能（v3.8.x） =====
// 链路：聊天设置开启群聊 → 桌面群聊按钮显示/占卜隐藏 → 进群聊页发消息 → 成员回复 →
//       关闭开关 → 群聊按钮隐藏/占卜恢复 → 无 JS 异常。
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

const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gc-' + Date.now()),
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
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return null;
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

await cdpConnect();

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});})()" });

async function enterApp() {
  await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();return true;})()");
  await sleep(400);
  await evalJs("(function(){var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var b=c.querySelector('#splash-confirm-ok');if(b)b.click();}return true;})()");
  await sleep(900);
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();

// ---- 用例 1：默认状态（群聊关闭）——群聊按钮隐藏、占卜按钮可见 ----
const d0 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var div=document.querySelector('.app[data-app=\"divination\"]');var pool=document.getElementById('desk-widget-pool');return JSON.stringify({gcHidden:gc?gc.hidden:'n/a',gcInPool:gc?gc.parentNode===pool:'n/a',divVisible:div?!div.hidden&&div.parentNode!==pool:'n/a'});})()") || '{}');
check('默认：群聊按钮隐藏', d0.gcHidden === true || d0.gcInPool === true, JSON.stringify(d0));
check('默认：占卜按钮可见', d0.divVisible === true, JSON.stringify(d0));

// ---- 进聊天设置页 ----
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
check('聊天设置页已进入', await evalJs("(function(){var p=document.getElementById('page-chat-settings');return !!p&&!p.hidden;})()"));

// ---- 用例 2：开启群聊开关 ----
check('聊天设置页有「开启群聊」开关', await evalJs("!!document.getElementById('sf-group-chat')"));
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
await sleep(500);
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(500);

const d1 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var div=document.querySelector('.app[data-app=\"divination\"]');var pool=document.getElementById('desk-widget-pool');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');return JSON.stringify({gcVisible:gc?!gc.hidden:false,gcInMain:gc?gc.parentNode===mainGrid:false,divInPool:div?div.parentNode===pool:false,divInMain:div?div.parentNode===mainGrid:false});})()") || '{}');
check('开启后：群聊按钮显示', d1.gcVisible === true, JSON.stringify(d1));
check('开启后：群聊按钮在首页 app-grid', d1.gcInMain === true, JSON.stringify(d1));
check('开启后：占卜按钮已移到隐藏池', d1.divInPool === true, JSON.stringify(d1));

// ---- 用例 3：群聊按钮在聊天按钮右侧 ----
const d2 = await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var chat=document.querySelector('.app[data-app=\"chat\"]');if(!gc||!chat)return 'n/a';return gc.previousElementSibling===chat?'yes':'no';})()");
check('开启后：群聊按钮在聊天按钮右侧', d2 === 'yes', d2);

// ---- 用例 4：进群聊页 ----
await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');if(gc)gc.click();return true;})()");
await sleep(700);
check('群聊页已进入', await evalJs("(function(){var p=document.getElementById('page-group-chat');return !!p&&!p.hidden;})()"));
check('群聊页标题显示群聊(N)', await evalJs("(function(){var n=document.getElementById('gc-name');return !!n&&/群聊\\(/.test(n.textContent);})()"));

// ---- 用例 5：发送消息 ----
await evalJs("(function(){var i=document.getElementById('gc-input');i.innerText='大家好，这是群聊测试';var b=document.getElementById('gc-send');b.click();return true;})()");
await sleep(500);
const outCount = await evalJs("(function(){var bs=document.querySelectorAll('#gc-body .msg-out');return bs.length;})()");
check('发送后显示我的消息气泡', outCount >= 1, 'outCount=' + outCount);

// ---- 用例 6：等待成员回复（随机1-2个，延迟0.8-3s） ----
let inCount = 0;
for (let i = 0; i < 30; i++) {
  inCount = await evalJs("(function(){var bs=document.querySelectorAll('#gc-body .msg-in');return bs.length;})()") || 0;
  if (inCount >= 1) break;
  await sleep(300);
}
check('成员有回复消息', inCount >= 1, 'inCount=' + inCount);

// ---- 用例 7：回复消息不显示成员昵称（与普通聊天页一致） ----
const hasName = await evalJs("(function(){var n=document.querySelector('#gc-body .msg-in .gc-from-name');return !!n&&n.textContent.length>0;})()");
check('回复消息不显示成员昵称', hasName === false);

// ---- 用例 8：消息已持久化 ----
const stored = await evalJs("(function(){try{var v=localStorage.getItem('xy-home-v2:group-chat-msgs');if(!v)return false;var a=JSON.parse(v);return Array.isArray(a)&&a.length>=2;}catch(e){return false;}})()");
check('群聊消息已持久化到 localStorage', stored === true);

// ---- 用例 9：成员列表面板 ----
await evalJs("(function(){var b=document.getElementById('gc-members-btn');if(b)b.click();return true;})()");
await sleep(400);
const mpOk = await evalJs("(function(){var p=document.getElementById('gc-members-panel');var items=document.querySelectorAll('#gc-mp-body .gc-mp-item');return !!p&&!p.hidden&&items.length>=1;})()");
check('成员列表面板可打开且列出成员', mpOk === true);
await evalJs("(function(){var b=document.getElementById('gc-mp-close');if(b)b.click();return true;})()");
await sleep(300);

// ---- 用例 10：@提及面板 ----
await evalJs("(function(){var b=document.getElementById('gc-at-btn');if(b)b.click();return true;})()");
await sleep(400);
const atOk = await evalJs("(function(){var p=document.getElementById('gc-at-panel');var items=document.querySelectorAll('#gc-at-body .gc-at-item');return !!p&&!p.hidden&&items.length>=1;})()");
check('@提及面板可打开且列出成员', atOk === true);
await evalJs("(function(){var item=document.querySelector('#gc-at-body .gc-at-item');if(item)item.click();return true;})()");
await sleep(300);
const atInserted = await evalJs("(function(){var i=document.getElementById('gc-input');return /@/.test(i.innerText);})()");
check('@提及插入输入框', atInserted === true);

await evalJs("(function(){var b=document.getElementById('gc-back');if(b)b.click();return true;})()");
await sleep(500);

// ---- 用例 11：关闭群聊开关 → 恢复 ----
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');cb.checked=false;cb.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
await sleep(500);
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(500);

const d3 = JSON.parse(await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');var div=document.querySelector('.app[data-app=\"divination\"]');var pool=document.getElementById('desk-widget-pool');var mainGrid=document.querySelector('.app-grid[data-app=\"main\"]');return JSON.stringify({gcHidden:gc?gc.hidden:false,gcInPool:gc?gc.parentNode===pool:false,divInMain:div?div.parentNode===mainGrid:false});})()") || '{}');
check('关闭后：群聊按钮隐藏', d3.gcHidden === true || d3.gcInPool === true, JSON.stringify(d3));
check('关闭后：占卜按钮恢复到首页', d3.divInMain === true, JSON.stringify(d3));

// ---- 用例 12：无 JS 异常 ----
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);

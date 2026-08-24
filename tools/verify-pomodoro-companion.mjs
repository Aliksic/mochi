// ===== 番茄钟 · 陪伴模式 冒烟验证 =====
// 覆盖：入口按钮、进入聊天页+顶部倒计时条、开场白消息、暂停/继续、菜单回番茄钟页、
//       提前结束（弹窗+TA回应）、完成时祝贺+自动收条（Date.now 跳变模拟）、
//       勿扰标记、关闭期间完成的补记恢复。
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
const cdpPort = 9900 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-pmp-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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
    if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 300)); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
async function gotoApp(hash) {
  await cdp('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp('Page.navigate', { url: baseUrl + '/index.html' + (hash || '') });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
  await sleep(1200);
}
const results = [];
function check(desc, ok, detail) { results.push({ desc, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : '')); }

const barSnap = `(() => {
  var pg = document.getElementById('page-chat');
  var bar = document.getElementById('pmp-bar');
  var msgs = (window.getChatMsgs ? window.getChatMsgs() : []);
  var last = msgs.length ? (msgs[msgs.length - 1].text || '') : '';
  return {
    chatOpen: !!pg && !pg.hidden,
    barVisible: !!bar && !bar.hidden,
    time: (document.getElementById('pmp-bar-time') || {}).textContent || '',
    label: (document.getElementById('pmp-bar-label') || {}).textContent || '',
    toggle: (document.getElementById('pmp-bar-toggle') || {}).textContent || '',
    sessionAlive: !!localStorage.getItem('xy-home-v2:default:pomo-companion'),
    lastMsg: last,
    fillW: document.getElementById('pmp-fill') ? document.getElementById('pmp-fill').style.width : ''
  };
})()`;
const openPomo = () => evalJs(`(function(){ var i=document.querySelector('[data-desk-widget="app-pomo"]'); if(i) i.click(); return 'ok'; })()`);
const openChatApp = () => evalJs(`(function(){ var a=document.querySelector('.app[data-app="chat"]'); if(a){a.click(); return 'ok';} if(window.enterChat){try{window.enterChat();}catch(e){} return 'enterChat';} return 'no'; })()`);

await cdpConnect();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---- A 组：开启陪伴模式 ----
await gotoApp();
await openPomo();
await sleep(400);
let goTxt = await evalJs(`(document.getElementById('pomo-companion')||{}).textContent||''`);
check('A1 番茄钟页有「陪伴模式」按钮', goTxt.indexOf('陪伴模式') >= 0, goTxt);
await evalJs(`document.getElementById('pomo-companion').click()`);
await sleep(600);
let s = await evalJs(barSnap);
check('A2 自动进入聊天页 + 顶部倒计时条显示', s.chatOpen && s.barVisible, JSON.stringify({ chatOpen: s.chatOpen, bar: s.barVisible }));
check('A3 陪伴会话已建立（记录持久化）', s.sessionAlive === true);
const noQuiet = await evalJs(`window.__pomoCompanionQuiet === undefined`);
check('A3b 陪伴期间不抑制 TA 主动发送（勿扰标记已移除）', noQuiet === true);
check('A4 开场白已发到聊天', ['好，我陪着你', '去吧，我在这等你', '专注吧，我不吵你', '嗯，一起加油'].indexOf(s.lastMsg) >= 0, s.lastMsg);
check('A5 条上倒计时在走（≤25:00）', /^2[0-5]:\d{2}$/.test(s.time) && s.label.indexOf('专注中') >= 0, s.time + '/' + s.label);
const t5 = s.time;
await sleep(1300);
s = await evalJs(barSnap);
check('A6 时间在减少', s.time !== t5, t5 + '→' + s.time);

// 暂停 / 继续
await evalJs(`document.getElementById('pmp-bar-toggle').click()`);
await sleep(250);
s = await evalJs(barSnap);
check('A7 暂停 → 标签=已暂停 · 按钮=继续', s.label === '已暂停' && s.toggle === '继续', s.label + '/' + s.toggle);
const tp = s.time;
await sleep(700);
s = await evalJs(barSnap);
check('A8 暂停期间不走秒', s.time === tp, tp);
await evalJs(`document.getElementById('pmp-bar-toggle').click()`);
await sleep(900);
s = await evalJs(barSnap);
check('A9 继续后恢复走动', s.label.indexOf('专注中') >= 0 && s.time !== tp, s.time);

// 菜单：回番茄钟页
await evalJs(`document.getElementById('pmp-bar-more').click()`);
await sleep(200);
await evalJs(`var b=document.querySelector('.pmp-menu button[data-pmp="page"]'); if(b) b.click();`);
await sleep(400);
let pomoOpen = await evalJs(`!document.getElementById('page-pomodoro').hidden`);
let goTxt2 = await evalJs(`(document.getElementById('pomo-companion')||{}).textContent||''`);
check('A10 菜单「回番茄钟页」生效 + 按钮变「陪伴中」', pomoOpen === true && goTxt2.indexOf('陪伴中') >= 0, goTxt2);
await evalJs(`document.getElementById('pomo-companion').click()`);
await sleep(400);
s = await evalJs(barSnap);
check('A11 陪伴中再点按钮直接回聊天页', s.chatOpen && s.barVisible, '');

// 提前结束
await evalJs(`document.getElementById('pmp-bar-more').click()`);
await sleep(200);
await evalJs(`var b=document.querySelector('.pmp-menu button[data-pmp="quit"]'); if(b) b.click();`);
await sleep(500);
const modalShown = await evalJs(`!!(document.getElementById('modal-mask') && !document.getElementById('modal-mask').hidden)`);
check('A12 提前结束弹出确认弹窗', modalShown === true);
await evalJs(`(function(){ var pills=document.getElementById('modal-pills'); if(!pills||pills.hidden) return; var arr=pills.querySelectorAll('.pill'); for(var i=0;i<arr.length;i++){ if(arr[i].textContent.indexOf('结束')>=0){ arr[i].click(); break; } } })()`);
await sleep(250);
await evalJs(`var ok=document.getElementById('modal-ok'); if(ok&&!ok.hidden) ok.click();`);
await sleep(700);
s = await evalJs(barSnap);
check('A13 结束后：会话清除 + 条隐藏 + TA 温柔回应', s.sessionAlive === false && s.barVisible === false && s.lastMsg === '没事，休息一下也可以', s.lastMsg);

// ---- B 组：完成一个番茄（陪伴中）—— Date.now 跳变 ----
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(function () {
  if (location.hash.indexOf('pmpjump') < 0) return;
  var orig = Date.now.bind(Date); var t0 = orig();
  Date.now = function () { return orig() - t0 > 9000 ? orig() + 26 * 60000 : orig(); };
})();` });
await gotoApp('#pmpjump');
await openPomo();
await sleep(300);
await evalJs(`document.getElementById('pomo-companion').click()`);
await sleep(600);
await sleep(9200);
s = await evalJs(barSnap);
check('B1 完成后陪伴会话自动清除', s.sessionAlive === false);
const doneMsgs = await evalJs(`(function(){ var m=window.getChatMsgs?window.getChatMsgs():[]; var tail=m.slice(-3).map(function(x){return x.text||'';}); return tail; })()`);
check('B2 TA 发来完成祝贺', Array.isArray(doneMsgs) && doneMsgs.some(t => typeof t === 'string' && t.indexOf('🍅') >= 0), JSON.stringify(doneMsgs));
await sleep(3200);
s = await evalJs(barSnap);
check('B3 「✅ 完成 +1 🍅」闪条结束后自动隐藏', s.barVisible === false, '');
await openPomo();
await sleep(400);
const stats = await evalJs(`(document.getElementById('pomo-stats')||{}).textContent||''`);
const selTab = await evalJs(`JSON.stringify({ sel: (document.querySelector('#page-pomodoro .pomo-tab.sel')||{dataset:{}}).dataset.pmode || '', st: (document.getElementById('pomo-state')||{}).textContent || '', tabs: Array.prototype.map.call(document.querySelectorAll('#page-pomodoro .pomo-tab'), function(t){return t.dataset.pmode+':'+t.classList.contains('sel');}) })`);
check('B4 今日 🍅 计入 ×1 + 自动切小憩', stats.indexOf('× 1') >= 0 && (selTab.indexOf('"sel":"short"') >= 0 || selTab.indexOf('小憩') >= 0), stats + '/' + selTab);

// ---- C 组：关闭期间完成的补记 ----
// 注意：此时页面可能仍带 B 组的 Date.now 跳变钩子，种子时间一律用 performance 时间轴
await evalJs(`(function(){ var now = Math.floor(performance.timeOrigin + performance.now()); localStorage.setItem('xy-home-v2:default:pomo-companion', JSON.stringify({mode:'focus',totalMs:1500000,endAt:now-10000,startedAt:now-1510000,paused:0,remainMs:0,enc:1,nextEncAt:0})); })()`);
await gotoApp();
await sleep(2000);
let restoredMsgs = await evalJs(`(function(){ var m=window.getChatMsgs?window.getChatMsgs():[]; var tail=m.slice(-5).map(function(x){return x.text||'';}); return tail; })()`);
let recGone = await evalJs(`!localStorage.getItem('xy-home-v2:default:pomo-companion')`);
let todayCnt = await evalJs(`(JSON.parse(localStorage.getItem('xy-home-v2:default:pomo-today')||'{}').count)||0`);
check('C1 关闭期间完成 → 补记祝贺 + 会话记录清除', recGone === true && (Array.isArray(restoredMsgs) && restoredMsgs.some(t => String(t).indexOf('完成了一个专注') >= 0) || todayCnt >= 2), JSON.stringify({ msgs: restoredMsgs, recGone: recGone, today: todayCnt }));

// ---- D 组：进行中刷新 → 接续恢复 ----
await evalJs(`(function(){ var now = Math.floor(performance.timeOrigin + performance.now()); localStorage.setItem('xy-home-v2:default:pomo-companion', JSON.stringify({mode:'focus',totalMs:1500000,endAt:now+60000,startedAt:now,paused:0,remainMs:0,enc:0,nextEncAt:0})); })()`);
await gotoApp();
await openChatApp();
await sleep(600);
s = await evalJs(barSnap);
check('D1 刷新后陪伴接续：聊天页条恢复且剩余 ≤01:00', s.chatOpen && s.barVisible && /^0[0-1]:\d{2}$/.test(s.time), s.time + '/' + s.barVisible);
check('D2 恢复的会话记录仍在', s.sessionAlive === true);

// 清理：提前退出，不留状态给其他用例
await evalJs(`document.getElementById('pmp-bar-toggle') && document.getElementById('pmp-bar-more').click()`);
await sleep(150);
await evalJs(`var b=document.querySelector('.pmp-menu button[data-pmp="quit"]'); if(b) b.click();`);
await sleep(450);
await evalJs(`(function(){ var pills=document.getElementById('modal-pills'); if(!pills||pills.hidden) return; var arr=pills.querySelectorAll('.pill'); for(var i=0;i<arr.length;i++){ if(arr[i].textContent.indexOf('结束')>=0){ arr[i].click(); break; } } })()`);
await sleep(200);
await evalJs(`var ok=document.getElementById('modal-ok'); if(ok&&!ok.hidden) ok.click();`);

const passed = results.filter((r) => r.ok).length;
console.log('\n结果：' + passed + '/' + results.length + ' 项通过');
chrome.kill(); server.close();
process.exit(passed === results.length ? 0 : 1);

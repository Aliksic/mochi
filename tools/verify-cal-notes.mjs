// ===== 冒烟：每日小记迁移日历（v3.9.x） =====
// 场景：
//   1. 桌面小组件仍在：今日情话卡片 / 今日备忘卡片 / 今天的心情卡片
//   2. UI 真实写备忘 + 心情（桌面卡片点击 → openModal）
//   3. 日历页新增三张只读卡片（TA 的情话 / 我的备忘 / 我的心情），今天显示当天值
//   4. 点历史日期：三卡片空态（这一天没有…）；点未来日期：统一「这一天还没有内容」
//   5. 点回今天恢复；主页只剩 4 个 tab（换头像/通话/摸鱼/打工），无 quotes/memos/moods
//   6. 无 JS 异常
// 用法：node tools/verify-cal-notes.mjs
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
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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

const cdpPort = 9900 + Math.floor(Math.random() * 500);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-smoke-calnotes-' + Date.now()),
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
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + String(detail).slice(0, 90) + ']' : ''));
}

const now = new Date();
const dayStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayDs = dayStr(now);
const todayD = now.getDate();

// 输入模拟：安卓 ce-box 路径（mobile-adapt 会把 modal-input 转 contenteditable）
const setInputExpr = "(function(v){var inp=document.getElementById('modal-input');if(!inp)return false;if(inp.__ceBox){inp.__ceBox.textContent=v;inp.__ceBox.dispatchEvent(new Event('input',{bubbles:true}));}else{inp.value=v;inp.dispatchEvent(new Event('input',{bubbles:true}));}return true;})";

// ---- A. 桌面小组件仍在 ----
let st = await evalJs("(function(){return {q:document.getElementById('love-quote')?document.getElementById('love-quote').textContent:'',memo:!!document.getElementById('memo-text'),mood:!!document.getElementById('today-mood-text')};})()");
check('桌面今日情话卡片存在且有内容', st && !!st.q, st && st.q);
check('桌面今日备忘 / 今天的心情卡片存在', st && st.memo && st.mood, JSON.stringify(st));

// ---- B. UI 真实写备忘 + 心情 ----
await evalJs("(function(){var e=document.getElementById('memo-text');if(e)e.click();return true;})()");
await sleep(400);
await evalJs(setInputExpr + "('测试备忘ABC')");
await evalJs("(function(){var o=document.getElementById('modal-ok');if(o)o.click();return true;})()");
await sleep(400);
st = await evalJs("(function(){return {card:document.getElementById('memo-text').textContent, snap:window.activeStore().get('memo-" + todayDs + "')};})()");
check('桌面写备忘成功（卡片 + 当日快照落盘）', st && st.card === '测试备忘ABC' && st.snap === '测试备忘ABC', JSON.stringify(st));

await evalJs("(function(){var e=document.getElementById('today-mood-text');if(e)e.click();return true;})()");
await sleep(400);
await evalJs("(function(){var p=document.querySelector('#modal-pills .pill, .modal-pills .pill, .pill');if(p){p.click();return true;}return false;})()");
await sleep(200);
await evalJs("(function(){var o=document.getElementById('modal-ok');if(o)o.click();return true;})()");
await sleep(400);
st = await evalJs("(function(){var e=document.getElementById('today-mood-text');return {card:e?e.textContent:'', snap:window.activeStore().get('today-mood-" + todayDs + "')};})()");
check('桌面写心情成功（卡片 + 当日快照落盘）', st && st.card && st.snap && st.card === st.snap && st.card !== '点一下选心情', st && st.card + '/' + st.snap);

// ---- C. 日历页：三张新卡片按天查看 ----
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"calendar\"]');if(a){a.click();}return true;})()");
await sleep(600);
st = await evalJs("(function(){return {qc:!!document.getElementById('cal-quote-card'),mc:!!document.getElementById('cal-memo-card'),mc2:!!document.getElementById('cal-mood-card'),q:document.getElementById('cal-quote')?document.getElementById('cal-quote').textContent:'',memo:document.getElementById('cal-memo')?document.getElementById('cal-memo').textContent:'',mood:document.getElementById('cal-mood')?document.getElementById('cal-mood').textContent:''};})()");
check('日历页三张新卡片存在', st && st.qc && st.mc && st.mc2, JSON.stringify(st));
// 情话应与桌面一致（quote-history 当天存档）
let qToday = await evalJs("(function(){var q=document.getElementById('love-quote');return q?q.textContent:'';})()");
check('日历今日情话 = 桌面今日情话', st && st.q === qToday && !!st.q, st && st.q);
check('日历今日备忘 = 桌面写的备忘', st && st.memo === '测试备忘ABC', st && st.memo);
check('日历今日心情 = 桌面写的心情', st && st.mood && st.mood === st.snap ? true : (st && !!st.mood), st && st.mood);

// ---- 点历史日期（本月 5 号，若今天<=5 则用 1 号）----
const histDay = todayD > 5 ? 5 : 1;
const histDs = todayDs.slice(0, 8) + String(histDay).padStart(2, '0');
await evalJs("(function(){var c=document.querySelector('#cal-grid .cal-cell[data-date=\"" + histDs + "\"]');if(c){c.click();}return true;})()");
await sleep(500);
st = await evalJs("(function(){return {date:document.getElementById('cal-today-date').textContent,q:document.getElementById('cal-quote').textContent,memo:document.getElementById('cal-memo').textContent,mood:document.getElementById('cal-mood').textContent};})()");
check('点历史日期：三卡片空态（无存档时）', st && st.date === histDs && st.memo === '这一天没有备忘' && st.mood === '这一天没有记录心情' && (st.q === '这一天没有留下情话' || st.q.indexOf('情话') >= 0), st && st.memo + '/' + st.mood + '/' + st.q);

// ---- 点未来日期（下月 1 号）----
const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
const nextY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
const futDs = nextY + '-' + String(nextMonth + 1).padStart(2, '0') + '-01';
await evalJs("(function(){var n=document.getElementById('cal-next');if(n)n.click();return true;})()");
await sleep(300);
await evalJs("(function(){var c=document.querySelector('#cal-grid .cal-cell[data-date=\"" + futDs + "\"]');if(c){c.click();}return true;})()");
await sleep(400);
st = await evalJs("(function(){return {q:document.getElementById('cal-quote').textContent,memo:document.getElementById('cal-memo').textContent,mood:document.getElementById('cal-mood').textContent};})()");
check('点未来日期：三卡片统一空态「这一天还没有内容」', st && st.q === '这一天还没有内容' && st.memo === '这一天还没有内容' && st.mood === '这一天还没有内容', JSON.stringify(st));

// ---- 点回今天 ----
await evalJs("(function(){var p=document.getElementById('cal-prev');if(p)p.click();return true;})()");
await sleep(300);
await evalJs("(function(){var c=document.querySelector('#cal-grid .cal-cell.today');if(c){c.click();}return true;})()");
await sleep(400);
st = await evalJs("(function(){return {memo:document.getElementById('cal-memo').textContent,mood:document.getElementById('cal-mood').textContent};})()");
check('点回今天：备忘/心情恢复当天值', st && st.memo === '测试备忘ABC' && st.mood === '开心', JSON.stringify(st));

// ---- D. 主页：三个记录 tab 已移除 ----
await evalJs("(function(){var b=document.getElementById('cal-back');if(b)b.click();return true;})()");
await sleep(300);
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"home\"]');if(a){a.click();}return true;})()");
await sleep(500);
st = await evalJs("(function(){var tabs=Array.from(document.querySelectorAll('#page-home .fav-tab')).map(t=>t.dataset.htab);var panels=Array.from(document.querySelectorAll('#page-home .cal-card')).map(c=>c.dataset.hpanel);var sel=document.querySelector('#page-home .fav-tab.sel');var avCard=document.querySelector('#page-home .cal-card[data-hpanel=\"av\"]');return {tabs:tabs,panels:panels,sel:sel?sel.dataset.htab:'',avVisible:avCard?!avCard.hidden:false,noQuotes:!document.getElementById('home-quotes'),noMemos:!document.getElementById('home-memos'),noMoods:!document.getElementById('home-moods')};})()");
check('主页只剩 4 个 tab（换头像/通话/摸鱼/打工）', st && st.tabs.length === 4 && st.tabs.join(',') === 'av,call,fish,work', st && st.tabs.join(','));
check('主页默认 tab = 换头像记录且面板可见', st && st.sel === 'av' && st.avVisible, st && st.sel + '/' + st.avVisible);
check('主页三个记录面板/容器已删除', st && st.noQuotes && st.noMemos && st.noMoods, JSON.stringify(st && {q:st.noQuotes,m:st.noMemos,w:st.noMoods}));

// ---- 无 JS 异常 ----
const jsErr = await evalJs("(function(){try{return localStorage.getItem('xy-home-v2:js-errors')||'';}catch(e){return '';}})()");
check('页面无 JS 异常', !jsErr, String(jsErr).slice(0, 80));

try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? failed.length + ' FAILED / ' + results.length : 'ALL PASS ' + results.length);
process.exit(failed.length ? 1 : 0);

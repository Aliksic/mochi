// ===== 诊断：深色模式开启后设置行「真机点不到/无法关闭」 =====
// 用法：node tools/diag-dark-toggle.mjs
// 与 verify-dark-mode.mjs 的区别：不用 el.click()（合成点击可穿透遮挡层），
// 而是按 getBoundingClientRect 坐标派发 CDP 真实鼠标事件，
// 并在每次点击前后用 document.elementFromPoint 报告该点最顶层元素是谁。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 用法：node tools/diag-dark-toggle.mjs [normal|brokenstorage] [私有构建根目录]
const root = normalize(process.argv[3] || dirname(fileURLToPath(import.meta.url)) + '/..');
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
    const p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = 9700 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-dark-' + Date.now()),
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
    if (r && r.exceptionDetails) { console.log('EVAL-ERR ' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300)); return null; }
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
// 开屏流程：数据就绪后点「点击进入」→ 弹「关于bug报修」确认层 → 点「确认我已知晓」
await evalJs(`(function(){var e=document.getElementById('splash-enter');if(e)e.click();return 1;})()`);
await sleep(600);
await evalJs(`(function(){var o=document.getElementById('splash-confirm-ok');if(o)o.click();return 1;})()`);
await sleep(900);
console.log('splash hide =', await evalJs(`document.getElementById('splash').classList.contains('hide')`));

// 真实点击底部 tab 进入设置页
{
  const r = await evalJs(`(function(){var t=document.querySelector('.tabbar .tab[data-page="page-setting"]');var b=t.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2});})()`);
  const { x, y } = JSON.parse(r);
  await realTap(x, y);
}
await sleep(600);
console.log('设置页 hidden =', await evalJs(`document.getElementById('page-setting').hidden`));

// 把深色行滚到可视区
await evalJs(`(function(){var el=document.getElementById('row-theme-mode');el.scrollIntoView({block:'center'});return 1;})()`);
await sleep(400);

// 滚动锁状态参考
console.log('body.scroll-lock =', await evalJs(`document.body.classList.contains('scroll-lock')`));

function desc(el) {
  if (!el) return 'null';
  let s = el.tagName ? el.tagName.toLowerCase() : '?';
  if (el.id) s += '#' + el.id;
  if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).join('.');
  return s;
}
// 报告某坐标处的命中元素 + 覆盖它的 fixed 元素清单
const probeExpr = (x, y) => `(function(){
  var x=${x}, y=${y};
  var hit=document.elementFromPoint(x,y);
  var chain=[];
  var e=hit;
  while(e && chain.length<5){ chain.push(desc(e)); e=e.parentElement; }
  var covers=[];
  document.querySelectorAll('body *').forEach(function(el){
    var cs=getComputedStyle(el);
    if(cs.position!=='fixed' && cs.position!=='absolute') return;
    if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return;
    var r=el.getBoundingClientRect();
    if(r.width<4||r.height<4) return;
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){
      var top=getComputedStyle(el).zIndex;
      covers.push(desc(el)+' z='+(top==='auto'?'auto':top)+' rect='+Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+'x'+Math.round(r.height)+' pe='+cs.pointerEvents);
    }
  });
  function desc(el){var s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;if(el.className&&typeof el.className==='string')s+='.'+el.className.trim().split(/\\s+/).join('.');return s;}
  return JSON.stringify({theme:document.documentElement.getAttribute('data-theme'),hit:hit?desc(hit):null,chain:chain,covers:covers.slice(0,12)});
})()`;

async function realTap(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

async function probeAndTap(label) {
  const rowRect = JSON.parse(await evalJs(`(function(){var el=document.getElementById('row-theme-mode');if(!el)return 'null';var b=el.getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height});})()`));
  if (!rowRect) { console.log(label, ': 找不到 #row-theme-mode'); return null; }
  const before = JSON.parse(await evalJs(probeExpr(rowRect.x, rowRect.y)));
  console.log('\n[' + label + '] 点击前 theme=' + before.theme);
  console.log('  行中心 (' + Math.round(rowRect.x) + ',' + Math.round(rowRect.y) + ') 命中链: ' + before.chain.join(' < '));
  if (before.covers.length) console.log('  覆盖该点的定位元素: \n    - ' + before.covers.join('\n    - '));
  await realTap(rowRect.x, rowRect.y);
  await sleep(500);
  const themeAfter = await evalJs(`document.documentElement.getAttribute('data-theme')`);
  const valText = await evalJs(`(function(){var v=document.getElementById('theme-mode-val');return v?v.textContent:'';})()`);
  console.log('[' + label + '] 点击后 theme=' + themeAfter + '  val文案="' + valText + '"');
  return { theme: themeAfter, hitOk: hitRow(before.chain) };
}

// 场景选择：normal=真实点击双向切换；brokenstorage=localStorage 读写抛异常（iOS隐私模式/配额满）
const scen = process.argv[2] || 'normal';
const hitRow = (chain) => (chain || []).some((c) => String(c).indexOf('row-theme-mode') >= 0);

if (scen === 'brokenstorage') {
  await evalJs(`(function(){
    Storage.prototype.getItem=function(){throw new Error('simulated: storage unavailable');};
    Storage.prototype.setItem=function(){throw new Error('simulated: quota exceeded');};
    return 1;})()`);
  console.log('已注入 Storage.prototype 抛异常（模拟隐私模式/配额满）');
}

const t1 = await probeAndTap('第1次点击·应为开启');
const t2 = await probeAndTap('第2次点击·应能关闭');

console.log('\n===== 结论（场景 ' + scen + '）=====');
if (!t1 || !t1.hitOk) console.log('异常：点击未命中开关行（看上方覆盖元素）');
else if (t1.theme === 'dark' && t2.theme === 'dark') console.log('复现「关不掉」：开启后再次点击仍为深色');
else if (t1.theme === 'dark' && (t2.theme === null || t2.theme === undefined)) console.log('正常：第二次点击成功切回浅色');
else console.log('第一次=' + t1.theme + ' 第二次=' + t2.theme);

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(0);

// ===== 桌面三页（1/2/3）卡片尺寸与节奏对齐验证（390×844 无头 Chrome） =====
// 背景（v3.16.x 用户需求）：第三页「今日备忘/今天的心情」缩小放同一行；三页从顶部组件
// 到底部功能图标位置全部长度对齐（此前第三页总长 747 超出容器 714、比 1/2 页长出 111px）。
// 用法：node tools/verify-desk-align.mjs
// 断言：
//   A 组·横向对齐——三页所有卡片类组件同宽（无 2px 内缩残留）
//   B 组·纵向节奏——每页首卡距顶 14px；卡片间 gap 14px
//   C 组·跨页档位——P1/P2 首卡（deco↔music）高度一致；band 起点误差 ≤10px；
//                    图标网格顶部误差 ≤12px；week-card≈mini-row、weekend-box≈checkin（±14px）
//   C'组·第三页同列——经期卡 190 hero 档；备忘/心情左右两半卡同行（宽 171±1、高 77±2）；
//                    第三页图标组底部与 1/2 页功能图标底部对齐（±2px）
//   D 组·回归——无 JS 异常、摸鱼卡结构（.we-top 行 + 4 个值 ID）完整
// 注意：memo-p3/desk-persist 等存储类脚本存在 IDB 回填竞态（见 WORKLOG 2026-08-26），
// 本脚本只做几何断言、不写存储，结果稳定。
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
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }
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

const cdpPort = 9700 + Math.floor(Math.random() * 300);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-deskalign-' + Date.now()),
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
await evalJs("(function(){window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message).slice(0,120));});return true;})()");
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(600);
await evalJs("(function(){var b=document.getElementById('splash-confirm-ok');if(b)b.click();return true;})()");
// 关掉「数据备份提醒」横幅（若有），避免遮挡几何测量
await evalJs("(function(){var el=document.querySelector('.backup-reminder,.data-backup-bar,#backup-remind');if(el&&el.parentNode)el.parentNode.removeChild(el);return true;})()");
await sleep(600);

// 显示桌面页并采集三页几何
const data = JSON.parse(await evalJs(`(function(){
  document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-phone');});
  var dp=document.getElementById('desktop-pages');
  var out={pages:[],errs:window.__errs||[]};
  var slides=document.querySelectorAll('#desktop-pages .page-slide');
  var base=slides[0]?slides[0].getBoundingClientRect():{left:0,top:0};
  slides.forEach(function(sl,pi){
    var items=[];
    Array.prototype.forEach.call(sl.children,function(el){
      var isWidget = el.hasAttribute && el.hasAttribute('data-desk-widget');
      var isBadge = el.id === 'memo-app-badge';
      if(!isWidget && !isBadge)return;
      var cs=getComputedStyle(el);
      if(cs.display==='none')return;
      var r=el.getBoundingClientRect();
      items.push({w:el.getAttribute('data-desk-widget')||el.id,cls:(el.className||'').toString(),
        left:r.left, right:r.right, top:r.top, bottom:r.bottom, h:r.height});
    });
    var s=sl.getBoundingClientRect();
    out.pages.push({idx:pi, left:s.left, top:s.top, items:items});
  });
  return JSON.stringify(out);
})()`) || '{}');

const results = [];
function check(desc, ok, detail) {
  results.push(ok);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}
const pages = data.pages || [];
const rel = (pg, it) => ({ L: it.left - pg.left, R: it.right - pg.left, T: it.top - pg.top, B: it.bottom - pg.top, H: it.h });
const find = (pg, wid) => { const it = (pg.items || []).find(x => x.w === wid); return it ? rel(pg, it) : null; };

// ---- A 组：三页卡片同宽（左右边缘一致） ----
const cardW = [];
pages.forEach(pg => (pg.items || []).forEach(it => {
  const r = rel(pg, it);
  cardW.push([pg.idx + ':' + it.w, r.R - r.L]);
}));
const w0 = cardW.length ? cardW[0][1] : 0;
const badW = cardW.filter(x => Math.abs(x[1] - w0) > 0.6);
check('A1 三页全部卡片同宽（无 2px 内缩残留）', cardW.length >= 8 && badW.length === 0,
  '宽=' + w0.toFixed(1) + (badW.length ? ' 异常:' + badW.map(x => x[0] + '=' + x[1].toFixed(1)).join(',') : ' 共' + cardW.length + '张'));

// ---- B 组：纵向节奏（首卡距顶 14 / 卡间 14） ----
let bOK = true, bDetail = [];
pages.forEach(pg => {
  const its = (pg.items || []).slice().sort((a, b) => a.top - b.top);
  if (!its.length) return;
  const first = rel(pg, its[0]);
  if (Math.abs(first.T - 14) > 1) { bOK = false; bDetail.push('页' + pg.idx + '首卡T=' + first.T.toFixed(1)); }
  for (let i = 1; i < its.length; i++) {
    const gap = rel(pg, its[i]).T - rel(pg, its[i - 1]).B;
    if (Math.abs(gap - 14) > 1) { bOK = false; bDetail.push('页' + pg.idx + its[i].w + 'gap=' + gap.toFixed(1)); }
  }
});
check('B1 每页首卡距顶 14px、卡片间 14px', bOK, bDetail.join(' ') || '全部14');

// ---- C 组：跨页档位对齐 ----
const p0 = pages[0], p1 = pages[1];
if (p0 && p1) {
  const deco = find(p0, 'deco'), music = find(p1, 'music');
  const mini0 = find(p0, 'quote-row'), week = find(p1, 'week');
  const ck = find(p0, 'checkin'), wek = find(p1, 'weekend');
  check('C1 首卡同高（deco↔music 190 档）', !!(deco && music) && Math.abs(deco.H - music.H) <= 2,
    'deco=' + (deco && deco.H.toFixed(1)) + ' music=' + (music && music.H.toFixed(1)));
  check('C2 band2 同档 77（mini-row↔week-card ±2）', !!(mini0 && week) && Math.abs(mini0.H - week.H) <= 2,
    'mini=' + (mini0 && mini0.H.toFixed(1)) + ' week=' + (week && week.H.toFixed(1)));
  check('C3 band3 同档 66（checkin↔weekend-box ±2）', !!(ck && wek) && Math.abs(ck.H - wek.H) <= 2,
    'ck=' + (ck && ck.H.toFixed(1)) + ' wek=' + (wek && wek.H.toFixed(1)));
  const grid0 = find(p0, 'apps'), grid1 = find(p1, 'p2apps');
  const dGrid = grid0 && grid1 ? Math.abs(grid0.T - grid1.T) : 999;
  check('C4 图标组顶部跨页误差 ≤6px', dGrid <= 6, 'Δ=' + dGrid.toFixed(1));
  const d2 = mini0 && week ? Math.abs(mini0.T - week.T) : 999;
  check('C5 band2 起点跨页误差 ≤4px', d2 <= 4, 'Δ=' + d2.toFixed(1));
} else check('C 组前置：三页存在', false, 'pages=' + pages.length);

// ---- C' 组：第三页与 1/2 页整列同节奏（hero 190 / 备忘心情同行 77 / 图标组底部对齐） ----
const p2 = pages[2];
if (p2) {
  const period = find(p2, 'desk-period');
  const memoRow = find(p2, 'memo-row');
  const mini0 = p0 ? find(p0, 'quote-row') : null;
  const ck0 = p0 ? find(p0, 'checkin') : null;
  const grid0 = p0 ? find(p0, 'apps') : null;
  const grid2 = find(p2, 'p3apps');
  check('C6 第三页首卡=经期卡 190 hero 档（不流失隐藏池）',
    !!period && Math.abs(period.H - 190) <= 2 && Math.abs(period.T - 14) <= 1,
    period ? 'H=' + period.H.toFixed(1) + ' T=' + period.T.toFixed(1) : 'desk-period 不在第三页');
  // 备忘/心情已改左右两半卡同行（缩小）：行高 77 与本周日常档一致，两张卡各宽半行
  const cc = await evalJs(`(function(){
    var row=document.querySelector('.page-slide.third .mini-row');
    if(!row)return {};
    var m=row.querySelector('.memo-card'),d=row.querySelector('.mood-card');
    var g=function(el){return el?Math.round(el.getBoundingClientRect().height*10)/10:0;};
    var w=function(el){var r=el.getBoundingClientRect();return Math.round(r.width*10)/10;};
    return {memoH:g(m),moodH:g(d),memoW:w(m),moodW:w(d),stacked:getComputedStyle(row).flexDirection==='column'};
  })()`) || {};
  check('C7 第三页备忘/心情左右两半卡同行（非上下叠放）', cc.stacked === false && cc.memoW > 100 && cc.moodW > 100,
    JSON.stringify(cc));
  check('C8 备忘卡 77（↔ 本周日常档）', Math.abs((cc.memoH || 0) - 77) <= 2, 'memoH=' + cc.memoH);
  check('C9 心情卡 77（与备忘同高，同行两半卡）', Math.abs((cc.moodH || 0) - 77) <= 2, 'moodH=' + cc.moodH);
  check('C10 两卡各半行宽 171', Math.abs((cc.memoW || 0) - 171) <= 2 && Math.abs((cc.moodW || 0) - 171) <= 2,
    'memoW=' + cc.memoW + ' moodW=' + cc.moodW);
  // v3.16.x：三页功能图标底部对齐——第三页图标组底部与 1/2 页图标组底部误差 ≤2px
  const grid1 = p1 ? find(p1, 'p2apps') : null;
  const dBottom = grid0 && grid2 ? Math.abs(grid0.B - grid2.B) : 999;
  const dBottom12 = grid0 && grid1 ? Math.abs(grid0.B - grid1.B) : 999;
  check('C11 三页功能图标组底部对齐（P1↔P3 ≤2px）', dBottom <= 2, 'ΔP1P3=' + dBottom.toFixed(1) +
    ' P1B=' + (grid0 && grid0.B.toFixed(1)) + ' P2B=' + (grid1 && grid1.B.toFixed(1)) + ' P3B=' + (grid2 && grid2.B.toFixed(1)));
  check('C11b P1↔P2 图标组底部对齐（回归）', dBottom12 <= 2, 'Δ=' + dBottom12.toFixed(1));
  check('C12 备忘录横幅已删除（#memo-app-badge 不存在）',
    await evalJs("!document.getElementById('memo-app-badge')") === true, '');
  void memoRow; void ck0;
} else check("C' 组前置：第三页存在", false, '');

// ---- D 组：摸鱼卡结构 + 无 JS 异常 ----
const weTop = await evalJs(`(function(){
  var box=document.getElementById('weekend-box');
  if(!box)return '{}';
  var ids=['weekend-days','weekend-ta','weekend-work-ta','weekend-mine','weekend-work','weekend-count'];
  var miss=ids.filter(function(i){return !document.getElementById(i);});
  return JSON.stringify({weTop:!!box.querySelector('.we-top'),miss:miss});
})()`) || '{}';
const wd = JSON.parse(weTop);
check('D1 摸鱼卡 .we-top 标题行存在', wd.weTop === true, String(wd.weTop));
check('D2 摸鱼卡数值 ID 完整（JS 依赖不受结构重排影响）', Array.isArray(wd.miss) && wd.miss.length === 0,
  wd.miss && wd.miss.join(','));
check('D3 无 JS 异常', (data.errs || []).length === 0, (data.errs || []).join(' | '));
const poolHasPeriod = await evalJs(`(function(){
  var p=document.getElementById('desk-widget-pool');
  return !!(p && p.querySelector('[data-desk-widget="desk-period"]'));
})()`);
check('D4 经期卡不在隐藏池（fresh 冷启动补位修复）', poolHasPeriod === false, String(poolHasPeriod));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter(r => !r).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);

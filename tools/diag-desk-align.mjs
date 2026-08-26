// ===== 临时诊断：桌面三页组件横向/纵向对齐测量（390×844） =====
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
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
if (!chromePath) { console.error('no chrome'); process.exit(1); }

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

const cdpPort = 9800 + Math.floor(Math.random() * 300);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-' + Date.now()),
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
  throw new Error('cannot connect');
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
const w = 390, h = 844;
await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('splash-confirm-ok');if(b)b.click();return true;})()");
await sleep(700);

const data = JSON.parse(await evalJs(`(function(){
  var out = {pages:[]};
  var slides = document.querySelectorAll('#desktop-pages .page-slide');
  slides.forEach(function(sl, pi){
    var items = [];
    var kids = Array.prototype.filter.call(sl.children, function(el){
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && el.id !== 'desk-page-hint-x';
    });
    kids.forEach(function(el){
      var r = el.getBoundingClientRect();
      items.push({
        cls: (el.className||'').toString().split(' ').slice(0,2).join('.'),
        id: el.id || '',
        left: Math.round(r.left*10)/10, right: Math.round(r.right*10)/10,
        top: Math.round(r.top*10)/10, bottom: Math.round(r.bottom*10)/10,
        w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10
      });
    });
    out.pages.push({idx:pi, cls: sl.className, items: items});
  });
  var ph = document.querySelector('.phone').getBoundingClientRect();
  out.phoneLeft = Math.round(ph.left*10)/10; out.phoneRight = Math.round(ph.right*10)/10;
  out.deskPagesRect = (function(){var d=document.getElementById('desktop-pages').getBoundingClientRect(); return {left:Math.round(d.left*10)/10, right:Math.round(d.right*10)/10, top:Math.round(d.top*10)/10};})();
  return JSON.stringify(out);
})()`) || '{}');

const pool = JSON.parse(await evalJs(`(function(){
  var p = document.getElementById('desk-widget-pool');
  if (!p) return '[]';
  return JSON.stringify(Array.prototype.map.call(p.children, function(c){return c.getAttribute('data-desk-widget')||c.className;}));
})()`) || '[]');
console.log('pool widgets:', JSON.stringify(pool));
console.log('phone left/right:', data.phoneLeft, '-', data.phoneRight, ' desktop-pages:', JSON.stringify(data.deskPagesRect));
(data.pages || []).forEach((pg) => {
  console.log('\n== 页 ' + pg.idx + ' (' + pg.cls + ') ==');
  (pg.items || []).forEach((it) => {
    console.log('  ' + (it.cls || it.id).padEnd(28) +
      ' L=' + String(it.left).padStart(6) + ' R=' + String(it.right).padStart(6) +
      ' W=' + String(it.w).padStart(6) + ' T=' + String(it.top).padStart(6) + ' B=' + String(it.bottom).padStart(6) + ' H=' + it.h);
  });
});

// screenshots of each page（先截后测：赶在 日历留言/备份提醒 等定时浮层出现前）
// 无头下 programmatic scrollLeft 不重绘，改用「隐藏其他页」方式切页（截图后恢复）
await evalJs("(function(){window.scrollTo(0,0);document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-phone');});['daily-greet','desk-msg','backup-remind-bar','ver-update-bar'].forEach(function(id){var el=document.getElementById(id);if(el){el.hidden=true;if(el._timer)clearTimeout(el._timer);}});return true;})()");
for (let pi = 0; pi < 3; pi++) {
  await evalJs(`(function(){var dp=document.getElementById('desktop-pages');dp.scrollLeft=0;Array.prototype.forEach.call(dp.querySelectorAll('.page-slide'),function(s,i){s.style.display=(i===${pi}?'':'none');});return true;})()`);
  await evalJs("(function(){['daily-greet','desk-msg','backup-remind-bar','ver-update-bar'].forEach(function(id){var el=document.getElementById(id);if(el){el.hidden=true;if(el._timer)clearTimeout(el._timer);}});return true;})()");
  await sleep(350);
  const dbg = await evalJs(`(function(){
    var dp=document.getElementById('desktop-pages');
    var vis=[];Array.prototype.forEach.call(dp.querySelectorAll('.page-slide'),function(s,i){if(getComputedStyle(s).display!=='none')vis.push(i+':'+s.className+':'+(s.querySelector('.music-widget')?'MUSIC':(s.querySelector('.deco-widget')?'DECO':(s.querySelector('.desk-period')?'PERIOD':'?'))));});
    var r=dp.getBoundingClientRect();
    return JSON.stringify({visible:vis,scrollLeft:dp.scrollLeft,dpX:Math.round(r.x),dpW:Math.round(r.width),phoneHidden:document.querySelector('.phone').parentNode.hidden});
  })()`);
  console.log('SHOT ' + pi + ' DOM状态:', dbg);
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(root, 'tools', 'desk-align-p' + pi + '.png'), Buffer.from(shot.data, 'base64'));
}
await evalJs("(function(){var dp=document.getElementById('desktop-pages');Array.prototype.forEach.call(dp.querySelectorAll('.page-slide'),function(s){s.style.display='';});return true;})()");

// P3 mini-card 内部结构诊断
const mini = JSON.parse(await evalJs(`(function(){
  var row=document.querySelector('.page-slide.third .mini-row')||document.querySelectorAll('.page-slide')[2].querySelector('.mini-row');
  if(!row)return '{}';
  var out={rowH:row.getBoundingClientRect().height,cards:[]};
  Array.prototype.forEach.call(row.children,function(c){
    var o={cls:c.className,h:c.getBoundingClientRect().height,kids:[]};
    Array.prototype.forEach.call(c.children,function(k){
      var kr=k.getBoundingClientRect();
      var ks=getComputedStyle(k);
      o.kids.push({cls:k.className||k.id,h:Math.round(kr.height*10)/10,mt:ks.marginTop,mb:ks.marginBottom,fz:ks.fontSize,lh:ks.lineHeight});
    });
    out.cards.push(o);
  });
  var p3=document.querySelector('.page-slide.third');
  var grid=p3.querySelector('.app-grid');
  out.gridH=grid?grid.getBoundingClientRect().height:0;
  out.gridRows=grid?getComputedStyle(grid).gridTemplateRows:'';
  return JSON.stringify(out);
})()`) || '{}');
console.log('P3 mini-row 内部:', JSON.stringify(mini));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(0);

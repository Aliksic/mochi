// ===== 诊断：字卡库页（page-chatcard）无法滑动/卡顿 =====
// 复现路径：点底部 tab 进字卡库 → 检查
//   A body.scroll-lock 是否卡住 + 哪个浮层判定为打开（hidden 属性 vs 视觉状态）
//   B page-chatcard 滚动容器指标（scrollHeight/clientHeight/scrollTop、computed overflow）
//   C 程序化 scrollTop 是否生效（overflow:hidden 时会被清零）
//   D CDP 真实鼠标滚轮是否推动滚动
//   E 长任务统计（PerformanceObserver longtask，粗查卡顿）
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
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--window-size=390,844', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-ccscroll-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) { console.error('JS 异常:', JSON.stringify(r.exceptionDetails).slice(0, 300)); return null; }
  return r && r.result ? r.result.value : null;
}

try {
  await cdpConnect();
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(4500);
  await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
  await sleep(300);
  await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();var s=document.getElementById('splash');if(s&&!s.classList.contains('hide')){s.classList.add('hide');s.hidden=true;}return true;})()");
  await sleep(600);
  const splashGone = await evalJs("(function(){ var s=document.getElementById('splash'); var c=document.getElementById('splash-confirm'); return { splashHidden: !s || s.classList.contains('hide') || getComputedStyle(s).display==='none', confirmVisible: !!c && c.offsetParent !== null }; })()");
  console.log('开屏状态:', JSON.stringify(splashGone));

  // 安装长任务观察
  await evalJs("(function(){ window.__lt=[]; try{ var po=new PerformanceObserver(function(l){ window.__lt.push.apply(window.__lt, l.getEntries().map(function(e){return Math.round(e.duration);})); }); po.observe({entryTypes:['longtask']}); }catch(e){} return true; })()");

  // 通过底部 tab 打开字卡库（真实路径）
  const opened = await evalJs("(function(){ var t=document.querySelector('.tab[data-page=\"page-chatcard\"]'); if(!t) return 'no-tab'; t.click(); return 'ok'; })()");
  await sleep(500);

  const state = await evalJs("(function(){\n  var p = document.getElementById('page-chatcard');\n  var FLOAT=['#tc-mask','#cc-export-mask','#cc-scope-mask','#call-mask','#feed-notice-panel','#feed-comment-panel','#poke-card','#emoji-panel','#chat-ask-panel','#qa-mask','#chat-more-panel','#gc-more-panel','#chat-search','#chat-decision-panel','#chat-divine-panel','#chat-rps-panel','#chat-call-panel','#chat-pong-panel','#chat-snake-panel','#chat-gift-panel','#avlib-card','#ck-panel','#loc-panel','.mg-mask','#modal-mask','#msg-actions','#desk-image-viewer','.desk-lib','#gc-members-panel','#gc-at-panel','#gc-settings-panel'];\n  var openFloats=[];\n  FLOAT.forEach(function(sel){ try{ var el=document.querySelector(sel); if(el && !el.hidden){ var cs=getComputedStyle(el); openFloats.push({sel:sel, display:cs.display, vis:cs.visibility, op:cs.opacity, pe:cs.pointerEvents, rect:(function(){var r=el.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)].join('x');})()}); } }catch(e){} });\n  var cs=getComputedStyle(p);\n  return {\n    pageVisible: !p.hidden,\n    lock: document.body.classList.contains('scroll-lock'),\n    openFloats: openFloats,\n    overflowY: cs.overflowY,\n    sh: p.scrollHeight, ch: p.clientHeight, st: p.scrollTop,\n    items: p.querySelectorAll('.chat-item').length\n  };\n})()");
  console.log('打开:', opened, JSON.stringify(state, null, 1));

  // 程序化滚动测试
  const prog = await evalJs("(function(){ var p=document.getElementById('page-chatcard'); p.scrollTop=120; var a=p.scrollTop; p.scrollTop=300; var b=p.scrollTop; p.scrollTop=0; return {set120:a,set300:b}; })()");
  console.log('程序化滚动:', JSON.stringify(prog));

  // 遮挡探测 + 事件监听
  await evalJs("(function(){\n  window.__ev = { wheel:0, wheelPrev:0, touch:0, touchPrev:0 };\n  document.addEventListener('wheel', function(e){ window.__ev.wheel++; if(e.defaultPrevented) window.__ev.wheelPrev++; }, {capture:true, passive:true});\n  document.addEventListener('touchmove', function(e){ window.__ev.touch++; if(e.defaultPrevented) window.__ev.touchPrev++; }, {capture:true, passive:true});\n  return true; })()");
  const cover = await evalJs("(function(){\n  function desc(el){ if(!el) return null; var cs=getComputedStyle(el); return {tag:el.tagName, id:el.id||'', cls:(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)||'', pe:cs.pointerEvents, pos:cs.position, z:cs.zIndex, ta:cs.touchAction}; }\n  var el=document.elementFromPoint(195,500); var chain=[]; var n=0;\n  while(el && n++<8){ chain.push(desc(el)); el=el.parentElement; }\n  return chain;\n})()");
  console.log('elementFromPoint(195,500) 链:', JSON.stringify(cover, null, 1));

  // CDP 鼠标滚轮（在页面中部）
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 195, y: 500, button: 'middle', buttons: 4, clickCount: 0 });
  for (let i = 0; i < 10; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 195, y: 500, deltaX: 0, deltaY: 120 }); await sleep(30); }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 195, y: 500, button: 'middle', buttons: 0, clickCount: 0 });
  await sleep(200);
  const wheelSt = await evalJs("({ st: document.getElementById('page-chatcard').scrollTop, ev: window.__ev, lock: document.body.classList.contains('scroll-lock') })");
  console.log('滚轮后 scrollTop+事件计数:', JSON.stringify(wheelSt));

  // 触摸滑动模拟（触摸屏拖拽）
  await evalJs("(function(){ document.getElementById('page-chatcard').scrollTop=0; return true; })()");
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 600, id: 1 }] });
  for (let y = 600; y >= 360; y -= 40) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y, id: 1 }] }); await sleep(16); }
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
  const touchSt = await evalJs("({ st: document.getElementById('page-chatcard').scrollTop, ev: window.__ev })");
  console.log('触摸上滑后 scrollTop+事件计数:', JSON.stringify(touchSt));

  // 分区切换后再测（系统预设 tab 内容更长）
  await evalJs("(function(){ var b=document.querySelector('.cc-top-tabs .cc-tab[data-ccsect=\"preset\"]'); if(b) b.click(); return true; })()");
  await sleep(300);
  const presetState = await evalJs("(function(){ var p=document.getElementById('page-chatcard'); return { sh:p.scrollHeight, ch:p.clientHeight, lock:document.body.classList.contains('scroll-lock') }; })()");
  console.log('系统预设分区:', JSON.stringify(presetState));

  // 长任务
  const lt = await evalJs('({ n: (window.__lt||[]).length, max: Math.max.apply(null,[0].concat(window.__lt||[])), sum: (window.__lt||[]).reduce(function(a,b){return a+b;},0) })');
  console.log('长任务(longtask):', JSON.stringify(lt));

} finally {
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

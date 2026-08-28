// ===== 诊断：iOS「全屏模式」开关（v3.26.x W1）=====
// 用法：node tools/diag-ios-fs-switch.mjs
// 背景：用户 iPhone 17 + Edge 桌面快捷方式（= 浏览器标签态）报「全屏开关点了没反应，
// 有时候卡了一下会变全屏」。旧代码在 iOS 分支无条件拒绝原生全屏（只弹引导），而
// 「卡一下变全屏」来自 armRetry/reenterFs 注册的 capture touchstart/click —— 之后
// 任意一次触摸都可能补交全屏请求。本轮改为：手势内直接请求全屏；iOS 下不再注册
// 任何手势重入监听。
// 断言（390×844 + iPhone UA + CDP 真实鼠标点击=有 user activation）：
//   1. iOS 判定生效（mochiDevice.isIOS、非 standalone）
//   2. 点开关后 requestFullscreen 被【同步】调用（在同一次 change 内），且带 navigationUI:'hide'
//   3. 全屏真的进去：fullscreenElement 非空 + html.fs-active + 底部内衬走 env（--mochi-safe-bottom 摘除）
//   4. 再点一次能退出：fullscreenElement 归零 + 开关回滚 + 持久化 '0'
//   5. 迟到全屏已消灭：退出后补发 touchstart/click/pointerdown，requestFullscreen 调用数不再增长
//   6. 诊断面板新增的「视口实测：全屏=…」行确实输出
// 输出：各项 PASS/FAIL + __jsErrors。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = readFileSync(join(root, 'index.html'), 'utf8');
console.log('index.html 大小:', html.length);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    const path = req.url.split('?')[0];
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
    const p = normalize(join(root, decodeURIComponent(path)));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { try { res.writeHead(404); res.end('nf'); } catch (e2) {} }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const stamp = Date.now();
const cdpPort = 9980 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-iosfs-' + stamp),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pend = new Map();
async function cdpConnect() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
      const page = list.find((t) => t.type === 'page' && /^about:blank$|^http/.test(t.url || ''));
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
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) { console.log('JS异常:', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').split('\n')[0]); return null; }
  const v = r && r.result ? r.result.value : undefined;
  return v === undefined ? null : v;
}
const J = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (e) { return null; } };

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
// iPhone UA + iOS Edge 特征（device.js 的 isIOS 只看 UA：/iphone|ipad|ipod/）
const uaRes = await cdp('Emulation.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Edg/124.0.0.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone'
});
console.log('UA override 响应:', JSON.stringify(uaRes));
// requestFullscreen 间谍：记录每次调用的时刻/参数/是否处于 change 事件内
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
(function(){
  var calls=[]; window.__fsCalls=calls;
  var orig=Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen=function(opt){
    calls.push({t:Date.now(), duringChange:!!window.__inChange, opt:opt?JSON.stringify(opt):'', phase:document.readyState});
    try { return orig.call(this,opt); } catch(e){ calls[calls.length-1].threw=String(e); throw e; }
  };
  // 视口伪造：innerHeight 844 / screen.height 932（浏览器工具条占了 88px 的场景）
  var fake={height:844,width:390,offsetTop:0,offsetLeft:0,scale:1,listeners:{},
    addEventListener:function(t,fn){(this.listeners[t]=this.listeners[t]||[]).push(fn);},
    removeEventListener:function(){},
    scrollTo:function(x,y){fake.offsetTop=y||0;},
    __fire:function(t){(this.listeners[t||'resize']||[]).slice().forEach(function(fn){try{fn();}catch(e){}});}};
  try { Object.defineProperty(window,'visualViewport',{configurable:true,get:function(){return fake;}}); } catch(e){}
  window.__fakeVV=fake;
  try { Object.defineProperty(window.screen,'height',{configurable:true,get:function(){return window.__screenH||932;}}); } catch(e){}
})();
` });
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
await sleep(2600);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var e=document.getElementById('splash-enter');if(e)e.click();return 1;})()");
await sleep(900);
await evalJs("(function(){var s=document.getElementById('splash');if(s)s.remove();return 1;})()");

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

const dev = J(await evalJs("(function(){var d=window.mochiDevice||{};return {isIOS:!!d.isIOS,standalone:!!document.documentElement.classList.contains('ios-pwa-standalone'),fsApi:typeof document.documentElement.requestFullscreen==='function'};})()"));
console.log('device:', JSON.stringify(dev));
check('iOS 判定生效且非 standalone（Edge 桌面快捷方式=浏览器标签态）', !!dev && dev.isIOS === true && dev.standalone === false, JSON.stringify(dev));
check('iOS 键盘内部状态探针 __mochiIosKb 已导出', (await evalJs("typeof window.__mochiIosKb === 'function'")) === true);
console.log('页面 UA:', await evalJs("navigator.userAgent"));

// ---- 打开设置页，把全屏开关滚到可视区并拿坐标 ----
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=true;});var s=document.getElementById('page-setting');if(s)s.hidden=false;return 1;})()");
await sleep(400);
const box = J(await evalJs(`(function(){
  var el=document.getElementById('sf-fullscreen'); if(!el) return {err:'no #sf-fullscreen'};
  var page=document.getElementById('page-setting');
  el.scrollIntoView({block:'center'});
  // #sf-fullscreen 本体被 toggle 样式压成 0 尺寸 → 点它的 .toggle label（有尺寸、点击即改 checked 并派发 change）
  var t=el.closest('label.toggle')||el.parentElement;
  var r=t.getBoundingClientRect();
  var row=(t.closest('.gs-row')||{}).textContent;
  return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width), h:Math.round(r.height),
    checked:!!el.checked, target:t.tagName+'.'+t.className, pageShown:!!(page&&!page.hidden&&page.getClientRects().length),
    rowText:(row||'').slice(0,20)};
})()`));
console.log('switch rect:', JSON.stringify(box));
check('全屏开关可定位', !!box && box.w > 0 && box.h > 0, JSON.stringify(box));

async function realClick(x, y) {
  await evalJs("(function(){window.__inChange=1;return 1;})()");
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await evalJs("(function(){setTimeout(function(){window.__inChange=0;},0);return 1;})()");
}

// ---- 1) 点开：requestFullscreen 必须手势内同步调用 ----
await evalJs("(function(){window.__fsCalls.length=0;return 1;})()");
await realClick(box.x, box.y);
const syncCall = J(await evalJs("(function(){var c=window.__fsCalls||[];return {n:c.length,first:c[0]||null};})()"));
check('点击即在手势内同步请求全屏（不再走 iOS 拒绝分支）', !!syncCall && syncCall.n >= 1 && syncCall.first && syncCall.first.duringChange === true, JSON.stringify(syncCall));
check('iOS 分支不请求方向锁、并带 navigationUI:"hide"', !!syncCall && syncCall.first && /navigationUI/.test(syncCall.first.opt || ''), syncCall.first && syncCall.first.opt);
await sleep(1800);
// 真机上进入全屏后 innerHeight == screen.height（浏览器 UI 全部让位）；headless 窗口
// 尺寸不变，这里把伪造的 screen.height 跟到 innerHeight 并触发一次 vv resize，
// 让 syncSafeBottom 走「已铺满物理屏 → 摘除 --mochi-safe-bottom、回落 env()」这条真实路径
await evalJs("(function(){window.__screenH=window.innerHeight;window.__fakeVV.__fire('resize');return 1;})()");
await sleep(500);
const on = J(await evalJs(`(function(){var d=document.documentElement;var el=document.getElementById('sf-fullscreen');
  return {fs:!!(document.fullscreenElement||document.webkitFullscreenElement),fsActive:d.classList.contains('fs-active'),
  checked:el?!!el.checked:null,safeBottom:d.style.getPropertyValue('--mochi-safe-bottom')||'(未设)',
  iosH:d.style.getPropertyValue('--mochi-ios-h')||'(未设)',innerH:window.innerHeight,screenH:screen.height,
  vvFit:d.classList.contains('ios-vv-fit'),phoneH:Math.round(parseFloat(getComputedStyle(document.querySelector('.phone')).height)||0),
  calls:(window.__fsCalls||[]).length,
  storage:(function(){try{return localStorage.getItem('xy-home-v2:fullscreen-enabled')}catch(e){return 'n/a'}})()};})()`));
console.log('after ON:', JSON.stringify(on));
check('全屏实际进入（headless 若拒绝则本项 FAIL，说明环境限制而非代码）', !!on && on.fs === true, JSON.stringify(on));
check('全屏态挂 .fs-active 类（壁纸/安全区随之生效）', !!on && on.fsActive === true);
check('开关保持开启（未被误回滚）', !!on && on.checked === true);
check('全屏下 --mochi-safe-bottom 摘除（回落 env，底部留安全区）', !!on && on.safeBottom === '(未设)', on && on.safeBottom);
check('全屏下 .phone 高度==实测可视高（无底部死带）', !!on && Math.abs(on.phoneH - on.innerH) <= 1, on && ('phoneH=' + on.phoneH + ' innerH=' + on.innerH));

// ---- 2) 点关：能退出并持久化 ----
await evalJs("(function(){window.__fsCalls.length=0;return 1;})()");
await realClick(box.x, box.y);
await sleep(900);
const off = J(await evalJs(`(function(){var d=document.documentElement;var el=document.getElementById('sf-fullscreen');
  return {fs:!!(document.fullscreenElement||document.webkitFullscreenElement),fsActive:d.classList.contains('fs-active'),
  checked:el?!!el.checked:null,
  storage:(function(){try{return localStorage.getItem('xy-home-v2:fullscreen-enabled')}catch(e){return 'n/a'}})()};})()`));
check('再点一次可退出全屏（关不掉是旧报障之一）', !!off && off.fs === false && off.fsActive === false && off.checked === false, JSON.stringify(off));

// ---- 3) 迟到全屏：退出后任意触摸不得再请求全屏 ----
await evalJs("(function(){window.__fsCalls.length=0;return 1;})()");
await evalJs(`(function(){
  ['touchstart','pointerdown','click'].forEach(function(t){
    var ev;
    try { ev = t === 'click' ? new MouseEvent('click',{bubbles:true}) : new Event(t,{bubbles:true}); } catch(e){ ev=new Event(t,{bubbles:true}); }
    document.dispatchEvent(ev);
  });
  return 1;
})()`);
await sleep(700);
const late = J(await evalJs("(function(){return {n:(window.__fsCalls||[]).length,fs:!!document.fullscreenElement};})()"));
check('iOS 下不再注册手势重入监听（触摸后无补交全屏＝「卡一下变全屏」消失）', !!late && late.n === 0 && late.fs === false, JSON.stringify(late));

// ---- 4) 诊断文本含视口实测行 ----
const diag = await evalJs(`(function(){
  try {
    var vg=window.mochiVvDiag(); if(!vg) return {err:'no mochiVvDiag'};
    return {fsMode:vg.fsMode, phoneH:vg.phoneH, vvH:vg.vvH, gapBottom:vg.gapBottom, kb:vg.kb, innerH:vg.innerH, screenH:vg.screenH};
  } catch(e){ return {err:String(e)}; }
})()`);
console.log('mochiVvDiag:', JSON.stringify(diag));
check('mochiVvDiag 可读且 fsMode 有值', !!diag && typeof diag.fsMode === 'string' && diag.fsMode.length > 0, JSON.stringify(diag));
check('探针带 iOS 键盘内部状态（kb.kbActive）', !!diag && diag.kb && typeof diag.kb.kbActive === 'boolean', diag && JSON.stringify(diag.kb));

console.log('__jsErrors(全程):', await evalJs("JSON.stringify(window.__jsErrors||[])"));
console.log(fails === 0 ? '✅ 全部通过' : '❌ 失败项: ' + fails);
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(fails === 0 ? 0 : 1);

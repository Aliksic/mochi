// ===== 诊断：iOS 底部安全区实测变量 + 高度规则特异性（v3.26.x W2b）=====
// 用法：node tools/diag-ios-safebottom.mjs
// 背景：聊天输入栏下面「空着一大块」= 浏览器工具条已占掉底部，代码却又叠了一层
// env(safe-area-inset-bottom)（.phone 18px 内衬 + 输入栏 10px+env + tabbar env），
// 那条带子里没有任何可点内容。本轮由 JS 实测写 --mochi-safe-bottom（底部被工具条
// 占据时归零，铺满物理屏时摘除属性、回落 env()），CSS 侧 27 处统一改成
// var(--mochi-safe-bottom,env(safe-area-inset-bottom,0px))。
// 断言（390×844 + iPhone UA + 伪造 screen.height 模拟「工具条占据底部 / 铺满物理屏」）：
//   1. 工具条态：--mochi-safe-bottom=0px，输入栏 padding-bottom 恰好 10px
//      （若 var 链写错，整条声明会在计算值阶段失效 → 塌陷成 0px，这里能抓到）
//   2. 铺满物理屏（standalone/真全屏几何）：属性摘除，padding-bottom 仍解析为 10px（回落 env）
//   3. 静止态 .phone 高度==实测可视高、底边==可视底（无死带）
//   4. 特异性守卫：加上 ios-pwa-standalone 后，v3.15.x 的 100vh 必须重新赢过
//      html.ios-vv-fit 规则（否则 standalone 白边回归）——用「实测高 < 100vh」的场景验证
//   5. tabbar/输入栏在无键盘时始终落在可视底之上（可点）
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
    if (path === '/' || path === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
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
const cdpPort = 9680 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-iossb-' + stamp),
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
await cdp('Emulation.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Edg/124.0.0.0 Mobile/15E148 Safari/604.1',
  platform: 'iPhone'
});
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
(function(){
  var fake={height:844,width:390,offsetTop:0,offsetLeft:0,scale:1,listeners:{},
    addEventListener:function(t,fn){(this.listeners[t]=this.listeners[t]||[]).push(fn);},
    removeEventListener:function(){},
    scrollTo:function(x,y){fake.offsetTop=y||0;},
    __fire:function(t){(this.listeners[t||'resize']||[]).slice().forEach(function(fn){try{fn();}catch(e){}});}};
  try { Object.defineProperty(window,'visualViewport',{configurable:true,get:function(){return fake;}}); } catch(e){}
  window.__fakeVV=fake;
  // screen.height 可控：932 = 物理屏比布局视口高 88px（浏览器工具条占据底部）；
  // 跟随 innerHeight = 已铺满物理屏（standalone / 真全屏）
  try { Object.defineProperty(window.screen,'height',{configurable:true,get:function(){return window.__screenH||932;}}); } catch(e){}
  // innerHeight 也可控：真机上工具条收起视觉视口时布局视口一起缩（viewport 里写了
  // interactive-widget=resizes-content），只缩 vv 不缩 innerHeight 是不可能组合
  try { Object.defineProperty(window,'innerHeight',{configurable:true,get:function(){return window.__ih||844;}}); } catch(e){}
})();
` });
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
await sleep(2600);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var e=document.getElementById('splash-enter');if(e)e.click();return 1;})()");
await sleep(900);
await evalJs("(function(){var s=document.getElementById('splash');if(s)s.remove();return 1;})()");
// 进聊天页（输入栏在此页）
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=true;});document.getElementById('page-chat').hidden=false;return 1;})()");
await sleep(600);

let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

async function state() {
  return J(await evalJs(`(function(){
    var d=document.documentElement, phone=document.querySelector('.phone');
    var row=document.querySelector('#page-chat .chat-input-row');
    var tb=document.querySelector('.tabbar');
    var cs=getComputedStyle(d);
    return {
      safeBottom:cs.getPropertyValue('--mochi-safe-bottom').trim()||'(未设)',
      iosH:cs.getPropertyValue('--mochi-ios-h').trim()||'(未设)',
      vvFit:d.classList.contains('ios-vv-fit'), standalone:d.classList.contains('ios-pwa-standalone'),
      rowPadBottom:row?Math.round(parseFloat(getComputedStyle(row).paddingBottom)) : null,
      rowBottom:row?Math.round(row.getBoundingClientRect().bottom):null,
      phoneH:Math.round(parseFloat(getComputedStyle(phone).height)),
      phoneBottom:Math.round(phone.getBoundingClientRect().bottom),
      tbMB:tb?Math.round(parseFloat(getComputedStyle(tb).marginBottom)):null,
      innerH:window.innerHeight, vvH:Math.round(window.visualViewport.height), screenH:screen.height,
      scrollTop:Math.round((document.scrollingElement||document.documentElement).scrollTop)
    };
  })()`));
}
// 视觉视口与布局视口一起变（真机 resizes-content 模型）
async function geometry(screenH, vh) {
  await evalJs("(function(){window.__screenH=" + screenH + ";window.__ih=" + vh + ";window.__fakeVV.height=" + vh + ";window.__fakeVV.__fire('resize');window.__fakeVV.__fire('scroll');return 1;})()");
  await sleep(600);
}

const s1 = await state();
console.log('工具条态:', JSON.stringify(s1));
check('1 工具条占据底部 → --mochi-safe-bottom=0px（底部 inset 归零，死带不再叠加）',
  !!s1 && s1.safeBottom === '0px' && s1.screenH - s1.innerH > 60, JSON.stringify(s1));
check('1 输入栏 padding-bottom 解析为 10px（var 链有效；写错会塌陷成 0）', !!s1 && s1.rowPadBottom === 10, s1 && ('rowPadBottom=' + s1.rowPadBottom));
check('1 静止态 .phone 高度==实测可视高且底边==可视底（无死带）',
  !!s1 && Math.abs(s1.phoneH - s1.vvH) <= 1 && Math.abs(s1.phoneBottom - s1.vvH) <= 1, JSON.stringify(s1));

await geometry(844, 844);
const s2 = await state();
check('2 铺满物理屏（standalone/真全屏几何）→ 属性摘除、回落 env()', !!s2 && s2.safeBottom === '(未设)', JSON.stringify(s2));
check('2 摘除后输入栏 padding-bottom 仍解析为 10px（env 回退没让声明失效）', !!s2 && s2.rowPadBottom === 10, s2 && ('rowPadBottom=' + s2.rowPadBottom));

await geometry(932, 750);
const s3 = await state();
// 注：CSS 的 vh 单位跟着真实布局视口（844）算、伪造不了；此处 .phone 比文档短时会被
// 桌面模拟器居中下移 ~47px，所以本项只断言「高度取实测」，底边相等留给常态断言（1/5）
check('3 可视高变化 → --mochi-ios-h 跟到实测 750px 且 .phone 高度同步（无空块）',
  !!s3 && s3.iosH === '750px' && Math.abs(s3.phoneH - 750) <= 1, JSON.stringify(s3));

// ---- 4 特异性守卫：standalone 下 100vh 必须赢过 ios-vv-fit ----
await evalJs("(function(){document.documentElement.classList.add('ios-pwa-standalone');return 1;})()");
await geometry(932, 750);
const s4 = await state();
check('4 standalone 时 html.ios-vv-fit 规则不得生效（v3.15.x 的 100vh 修复仍赢，:not 守卫在位）',
  !!s4 && s4.standalone === true && s4.phoneH === 844, JSON.stringify(s4));
await evalJs("(function(){document.documentElement.classList.remove('ios-pwa-standalone');return 1;})()");
await geometry(932, 750);
const s5 = await state();
check('4 摘掉 standalone 后实测高规则恢复（750px 又生效）', !!s5 && Math.abs(s5.phoneH - 750) <= 1, JSON.stringify(s5));

await geometry(932, 844);
const s6 = await state();
check('5 复原后 tabbar 底部内衬归零且输入栏落在可视底（可点）',
  !!s6 && s6.tbMB === 0 && Math.abs(s6.rowBottom - s6.vvH) <= 1, JSON.stringify(s6));

console.log('__jsErrors(全程):', await evalJs("JSON.stringify(window.__jsErrors||[])"));
console.log(fails === 0 ? '✅ 全部通过' : '❌ 失败项: ' + fails);
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(fails === 0 ? 0 : 1);

// ===== 诊断：iOS 键盘/视口「永久收缩」回归门（v3.26.x W2）=====
// 用法：node tools/diag-ios-kb-latch.mjs
// 背景：旧实现用只涨不落的棘轮基线 _noKbH 判断「键盘是否还开着」。Edge iOS 工具条
// 瞬时收起把基线抬大后，_kbStill 在【没有键盘时】也恒真 → 聚焦任意输入框即触发
// 整套键盘流程：收缩 .phone + align-self:flex-start + 内联 html{overflow:hidden}
// + 250ms 反复 vv.scrollTo(0,0) —— 就是用户报的「页面突然上移、什么都点不动」。
// 本轮改为双向自校准基线（_fullInner/_fullVv）+ 双信号键盘判据 + 常驻 rAF 自愈。
// 断言（390×844 + iPhone UA + 伪造 visualViewport 驱动真实代码路径）：
//   A. 无键盘的视口瞬时抖动：基线双向跟随（旧棘轮只会单向抬高 → 这里必须回落）
//   B. 抖动后聚焦输入框但键盘没弹：kbActive=false、.phone 无内联高、html 无内联 overflow
//   C. 真键盘（vv 420）：kbActive=true、.phone 内联高≈420、文档锁上
//   D. 键盘收起（焦点未走的脏路径）：全部状态自动复原
//   E. 手工注入「残留态」（内联高 + flex-start + overflow:hidden）→ 自愈必须在数帧内清空
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
const cdpPort = 9780 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-ioskb-' + stamp),
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
// 伪造 visualViewport（可控高度/平移 + 可手动派发 resize/scroll）与 screen.height
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
(function(){
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

async function state() {
  return J(await evalJs(`(function(){
    var d=document.documentElement, phone=document.querySelector('.phone');
    if(!phone) return {err:'no .phone'};
    var kb=(typeof window.__mochiIosKb==='function')?window.__mochiIosKb():null;
    var pr=phone.getBoundingClientRect();
    return {
      kbActive:kb?kb.kbActive:null, prov:kb?kb.prov:null, docLocked:kb?kb.docLocked:null,
      fullInner:kb?kb.fullInner:null, fullVv:kb?kb.fullVv:null,
      inlineH:phone.style.height||'', alignSelf:phone.style.alignSelf||'',
      htmlOverflow:d.style.overflow||'',
      iosH:d.style.getPropertyValue('--mochi-ios-h')||'(未设)',
      phoneH:Math.round(pr.height), phoneTop:Math.round(pr.top),
      gapBottom:Math.round((window.visualViewport?window.visualViewport.height:0)-pr.bottom),
      vvH:Math.round(window.visualViewport?window.visualViewport.height:0),
      active:document.activeElement?document.activeElement.tagName+'#'+(document.activeElement.id||''):''
    };
  })()`));
}
async function setVV(h, top) {
  await evalJs("(function(){window.__fakeVV.height=" + h + ";window.__fakeVV.offsetTop=" + (top || 0) + ";window.__fakeVV.__fire('resize');window.__fakeVV.__fire('scroll');return 1;})()");
}
async function focusInput() {
  return await evalJs("(function(){var i=document.getElementById('chat-input')||document.querySelector('#page-chat input, #page-chat textarea');if(!i)return '';i.focus();return i.tagName+'#'+(i.id||'');})()");
}
async function blurInput() {
  await evalJs("(function(){document.activeElement&&document.activeElement.blur&&document.activeElement.blur();return 1;})()");
}

console.log('isIOS:', await evalJs("!!(window.mochiDevice&&window.mochiDevice.isIOS)"), 'probe:', await evalJs("typeof window.__mochiIosKb"));
check('iOS 判定 + 键盘探针可用（本诊断的前置）', (await evalJs("!!(window.mochiDevice&&window.mochiDevice.isIOS)")) === true && (await evalJs("typeof window.__mochiIosKb")) === 'function');

// 进聊天页（tabs.js 用 hidden 属性直切）
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=true;});document.getElementById('page-chat').hidden=false;return 1;})()");
await sleep(600);
const s0 = await state();
console.log('初始:', JSON.stringify(s0));
check('常态：无收缩、无文档锁、底部无死带（.phone 底边==可视底）',
  !!s0 && s0.kbActive === false && s0.inlineH === '' && s0.htmlOverflow === '' && Math.abs(s0.gapBottom) <= 2, JSON.stringify(s0));

// ---- A. 无键盘的视口瞬时抖动（Edge 工具条收起动画）→ 基线必须双向跟随 ----
await setVV(700); await sleep(500);
const a1 = await state();
await setVV(844); await sleep(500);
const a2 = await state();
check('A 基线跟随下抖（vv 700 → fullVv=700，旧棘轮会留在 844）', !!a1 && Math.abs(a1.fullVv - 700) <= 2, JSON.stringify(a1));
check('A 基线跟随回升（vv 844 → fullVv=844）', !!a2 && Math.abs(a2.fullVv - 844) <= 2, JSON.stringify(a2));
check('A 抖动全程没有误进键盘态（kbActive=false、无内联高、无文档锁）',
  !!a1 && !!a2 && a1.kbActive === false && a2.kbActive === false && a2.inlineH === '' && a2.docLocked === false && a2.htmlOverflow === '');

// ---- B. 抖动后聚焦输入框但键盘并未弹起（视口停在 700）----
await setVV(700); await sleep(450);
const fTag = await focusInput();
await sleep(900);
const b = await state();
check('B 聚焦但无键盘 → 不进键盘态（这是「上移点不动」的根因）', !!b && b.kbActive === false && b.active === fTag, JSON.stringify(b));
check('B 聚焦但无键盘 → .phone 无内联高 / 无 flex-start / html 无 overflow',
  !!b && b.inlineH === '' && b.alignSelf === '' && b.htmlOverflow === '', JSON.stringify(b));
check('B .phone 高度=实测可视高（跟住 700，既不空一块也不超屏）', !!b && Math.abs(b.phoneH - 700) <= 2, b && ('phoneH=' + b.phoneH));
await blurInput(); await setVV(844); await sleep(600);

// ---- C. 真键盘：聚焦 + vv 收到 420 ----
await focusInput(); await sleep(200);
await setVV(420); await sleep(700);
const c = await state();
check('C 键盘弹起：kbActive=true 且 .phone 内联高≈420（输入栏贴键盘上沿）',
  !!c && c.kbActive === true && Math.abs(parseFloat(c.inlineH) - 420) <= 8, JSON.stringify(c));
check('C 键盘期文档锁生效（背景不再跟着滚）', !!c && c.docLocked === true, c && ('htmlOverflow=' + c.htmlOverflow));
check('C 键盘期 .phone 底边==可视底（输入栏下方不留死带）', !!c && Math.abs(c.gapBottom) <= 2, c && ('gap=' + c.gapBottom));

// ---- D. 键盘收起但焦点未走（iOS 常见脏路径：滑动收起/程序化失焦漏事件）----
await setVV(844); await sleep(900);
const d1 = await state();
check('D 键盘收起：自动退出键盘态并清内联高（不靠 focusout）',
  !!d1 && d1.kbActive === false && d1.inlineH === '' && d1.alignSelf === '', JSON.stringify(d1));
check('D 键盘收起：文档锁已摘（html 无内联 overflow）', !!d1 && d1.docLocked === false && d1.htmlOverflow === '');
await blurInput(); await sleep(600);

// ---- E. 残留态自愈：手工注入旧版泄漏出来的三件套，必须被常驻自愈清掉 ----
await evalJs("(function(){var p=document.querySelector('.phone');p.style.height='500px';p.style.alignSelf='flex-start';document.documentElement.style.overflow='hidden';window.__fakeVV.offsetTop=120;return 1;})()");
await setVV(844); await sleep(200);
await evalJs("(function(){window.__fakeVV.__fire('scroll');return 1;})()");
await sleep(900);
const e1 = await state();
check('E 残留态自愈：内联高 / flex-start 已清空', !!e1 && e1.inlineH === '' && e1.alignSelf === '', JSON.stringify(e1));
check('E 残留态自愈：html{overflow:hidden} 已摘（否则整页再也点不动）', !!e1 && e1.htmlOverflow === '', e1 && ('overflow=' + e1.htmlOverflow));
check('E 残留态自愈：vv 平移归零（页面不再停在半截）', !!e1 && Math.abs(e1.vvH - 844) <= 2 && e1.phoneTop >= -2, JSON.stringify(e1));

console.log('__jsErrors(全程):', await evalJs("JSON.stringify(window.__jsErrors||[])"));
console.log(fails === 0 ? '✅ 全部通过' : '❌ 失败项: ' + fails);
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(fails === 0 ? 0 : 1);

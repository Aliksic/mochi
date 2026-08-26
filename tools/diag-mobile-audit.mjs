// ===== 手机端诊断：浮层几何/关闭按钮监听器/页面横向溢出（一次性 diag，不入库）=====
// 用法：node tools/diag-mobile-audit.mjs
// 从当前 src 自组装临时页（不依赖构建产物），无头 Chrome 390x844 移动视口：
//  A. 聊天页全部浮层逐个打开：面板是否在视口内、头部关闭按钮是否有 click 监听
//     （CDP DOMDebugger.getEventListeners 直查，比模拟点击精确——×按钮漏绑同款故障）、
//     点击后是否真的收起。
//  B. 全部 .page 页面横向溢出扫描（scrollWidth > clientWidth + 2px）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => readFileSync(join(root, 'src', f), 'utf8');

const cssFiles = ['base.css', 'home.css', 'chat-main.css', 'chat-pages.css', 'market.css', 'group-chat.css', 'setting.css', 'tabbar.css', 'dark.css', 'garden.css', 'memo.css', 'memo-arc.css', 'room.css'];
const jsFiles = ['idb.js', 'contacts.js', 'clock.js', 'tabs.js', 'desktop-slider.js', 'quote-cards.js', 'personalize.js', 'chat.js', 'group-chat.js', 'chatcard.js', 'chat-settings.js', 'reply-settings.js', 'fav-settings.js', 'default-cards-data.js', 'default-cards.js', 'mood-followup-data.js', 'mood-reply-cards.js', 'music-player.js', 'calendar.js', 'divination.js', 'avatar-lib.js', 'ta-ask.js', 'ck-question.js', 'ta-invite.js', 'bg-keep.js', 'records.js', 'call.js', 'mail.js', 'feed.js', 'loc-lib.js', 'p2-features.js', 'gift-shop.js', 'memo-app.js', 'memo-arc.js', 'period.js', 'accounting.js', 'garden.js', 'room.js', 'decision.js', 'group-decision.js', 'pong.js', 'snake-game.js', 'breakout.js', 'sfx.js', 'fullscreen.js', 'data-backup.js', 'pwa.js', 'cjian.js', 'mobile-adapt.js'];
let html = readFileSync(join(root, 'src', 'template.html'), 'utf8');
const styles = cssFiles.map((f) => read(join('css', f))).join('\n');
const scripts = jsFiles.map((f) => {
  const code = read(join('js', f));
  return '(function () { try {\n' + code + '\n} catch (__e) { try { console.error("[JS] ' + f + '", __e && __e.message || __e); } catch (x) {} } })();';
}).join('\n');
html = html.replace('/*__STYLES__*/', styles);
html = html.replace('/*__SCRIPTS__*/', scripts);
html = html.split('__BUILD_INFO__').join('diag-mobile-audit');
html = html.split('__BUILD_TS__').join(String(Date.now()));
html = html.split('__APP_VERSION__').join('v3.15.x-diag');
const tmpHtml = join(tmpdir(), 'mochi-maudit-' + Date.now() + '.html');
writeFileSync(tmpHtml, html);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  try {
    if (req.url === '/' || req.url.split('?')[0] === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return;
    }
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const cdpPort = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-maudit-' + Date.now()),
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
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { console.error('  JS异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').split('\n')[0]); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
// 带 objectId 的 evaluate（供 DOMDebugger 用）
async function evalObj(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: false });
  return r && r.result ? r.result.objectId : null;
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

const issues = [];
function report(sev, desc) { issues.push({ sev, desc }); console.log((sev === 'FAIL' ? 'FAIL' : sev === 'WARN' ? 'WARN' : 'INFO') + '  ' + desc); }

// 进聊天页
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});var a=document.querySelector('.app[data-app=chat]');if(a)a.click();return true;})()");
await sleep(800);

// ---- A. 浮层逐个体检 ----
// id → 打开方式（优先真实入口函数；无导出的直接 unhide，仅测几何与关闭绑定）
const OVERLAYS = [
  ['#chat-more-panel', "(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();})()"],
  ['#chat-decision-panel', '(function(){if(window.openDecision)window.openDecision();})()'],
  ['#chat-gdecision-panel', '(function(){if(window.openGroupDecision)window.openGroupDecision();})()'],
  ['#chat-divine-panel', '(function(){var b=document.getElementById("more-divine");var mp=document.getElementById("chat-more-panel");if(mp)mp.hidden=true;if(b)b.click();else{var p=document.getElementById("chat-divine-panel");if(p)p.hidden=false;}})()'],
  ['#poke-card', "(function(){var p=document.getElementById('poke-card');if(p)p.hidden=false;})()"],
  ['#emoji-panel', "(function(){var p=document.getElementById('emoji-panel');if(p)p.hidden=false;})()"],
  ['#chat-search', "(function(){var p=document.getElementById('chat-search');if(p)p.hidden=false;})()"],
  ['#chat-ask-panel', '(function(){if(window.openAskReply)window.openAskReply(0);else{var p=document.getElementById("chat-ask-panel");if(p)p.hidden=false;}})()'],
  ['#modal-mask', '(function(){if(window.openModal)window.openModal("测试弹窗","默认值",function(){});})()'],
  ['#avlib-card', '(function(){if(window.openAvlib)window.openAvlib();})()'],
  ['#loc-panel', "(function(){var p=document.getElementById('loc-panel');if(p)p.hidden=false;})()"],
  ['#batch-panel', "(function(){var b=document.getElementById('chat-batch-btn');if(b)b.click();else{var p=document.getElementById('batch-panel');if(p)p.hidden=false;}})()"],
  ['#chat-rps-panel', "(function(){var p=document.getElementById('chat-rps-panel');if(p)p.hidden=false;})()"],
  ['#chat-call-panel', "(function(){var p=document.getElementById('chat-call-panel');if(p)p.hidden=false;})()"],
  ['#chat-pong-panel', '(function(){if(window.openPongPanel)window.openPongPanel();else{var p=document.getElementById("chat-pong-panel");if(p)p.hidden=false;}})()'],
  ['#chat-snake-panel', '(function(){if(window.openSnakePanel)window.openSnakePanel();else{var p=document.getElementById("chat-snake-panel");if(p)p.hidden=false;}})()'],
  ['#chat-brick-panel', '(function(){if(window.openBrickPanel)window.openBrickPanel();else{var p=document.getElementById("chat-brick-panel");if(p)p.hidden=false;}})()'],
  ['#chat-gift-panel', '(function(){if(window.openGiftPanel)window.openGiftPanel();else{var p=document.getElementById("chat-gift-panel");if(p)p.hidden=false;}})()'],
  ['#chat-rp-panel', "(function(){var p=document.getElementById('chat-rp-panel');if(p)p.hidden=false;})()"],
  ['#ck-panel', '(function(){if(window.openCkPanel)window.openCkPanel();else{var p=document.getElementById("ck-panel");if(p)p.hidden=false;}})()']
];

console.log('== A. 聊天页浮层体检 ==');
for (const [sel, opener] of OVERLAYS) {
  // 先全部收起，避免兄弟互斥干扰判定
  await evalJs('(function(){document.querySelectorAll(".page .poke-card,#modal-mask,#tc-mask,#qa-mask,.mask,[id$=-panel]").forEach(function(e){try{e.hidden=true;}catch(x){}});return true;})()');
  await sleep(120);
  await evalJs(opener);
  await sleep(350);
  const st = JSON.parse(await evalJs('(function(){var el=document.querySelector("' + sel + '");if(!el)return JSON.stringify({exist:false});var cs=getComputedStyle(el);var r=el.getBoundingClientRect();var vw=window.innerWidth,vh=window.innerHeight;var closeBtn=el.querySelector(".poke-card-close,[class*=close],[id$=-close],[id*=close]");var cbR=closeBtn?closeBtn.getBoundingClientRect():null;return JSON.stringify({exist:true,hidden:el.hidden,disp:cs.display,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),vw:vw,vh:vh,hasClose:!!closeBtn,cbW:cbR?Math.round(cbR.width):0,cbH:cbR?Math.round(cbR.height):0});})()') || '{}');
  if (!st.exist) { report('WARN', sel + ' 模板中不存在（跳过）'); continue; }
  if (st.hidden || st.disp === 'none') { report('INFO', sel + ' 未被打开方式唤起（可能需要前置条件，仅跳过）'); continue; }
  const off = st.x < -4 || st.y < -4 || st.x + st.w > st.vw + 4 || st.y + st.h > st.vh + 4;
  if (off) report('FAIL', sel + ' 超出视口 rect=(' + st.x + ',' + st.y + ',' + st.w + 'x' + st.h + ') vw=' + st.vw + ' vh=' + st.vh);
  if (!st.hasClose) {
    report('INFO', sel + ' 无关闭按钮（外点关闭类设计则正常）');
  } else {
    if ((st.cbW && st.cbW < 24) || (st.cbH && st.cbH < 24)) report('WARN', sel + ' 关闭按钮触控区过小 ' + st.cbW + 'x' + st.cbH);
    // CDP 直查该按钮的 click 监听器
    const oid = await evalObj('(function(){var el=document.querySelector("' + sel + '");return el?el.querySelector(".poke-card-close,[class*=close],[id$=-close],[id*=close]"):null;})()');
    let hasClick = false;
    if (oid) {
      const l = await cdp('DOMDebugger.getEventListeners', { objectId: oid });
      hasClick = !!(l && l.listeners && l.listeners.some(function (x) { return x.type === 'click'; }));
      await cdp('DOM.discardObject', { objectId: oid }).catch(() => {});
    }
    if (!hasClick) {
      // 可能是父级委托：查一层祖先链
      const oid2 = await evalObj('(function(){var el=document.querySelector("' + sel + '");var b=el&&el.querySelector(".poke-card-close,[class*=close],[id$=-close],[id*=close]");if(!b)return null;var n=b;for(var i=0;i<4&&n;i++){n=n.parentElement;}return b.parentElement;})()');
      let delegated = false;
      if (oid2) {
        const l2 = await cdp('DOMDebugger.getEventListeners', { objectId: oid2 });
        delegated = !!(l2 && l2.listeners && l2.listeners.some(function (x) { return x.type === 'click'; }));
        await cdp('DOM.discardObject', { objectId: oid2 }).catch(() => {});
      }
      if (!delegated) report('FAIL', sel + ' 关闭按钮无任何 click 监听（×按钮同款 bug）');
    }
    // 点击后应收起
    await evalJs('(function(){var el=document.querySelector("' + sel + '");var b=el&&el.querySelector(".poke-card-close,[class*=close],[id$=-close],[id*=close]");if(b)b.click();return true;})()');
    await sleep(250);
    const after = await evalJs('(function(){var el=document.querySelector("' + sel + '");return el?(el.hidden||getComputedStyle(el).display==="none"):true;})()');
    if (!after) report('WARN', sel + ' 点了关闭按钮但未收起（可能有监听但逻辑分支未命中）');
  }
}

// ---- B. 全页面横向溢出扫描 ----
console.log('== B. 页面横向溢出扫描（390 宽） ==');
const pageIds = JSON.parse(await evalJs('(function(){return JSON.stringify(Array.prototype.map.call(document.querySelectorAll(".page"),function(p){return p.id;}));})()'));
for (const pid of pageIds) {
  await evalJs('(function(){document.querySelectorAll(".page").forEach(function(p){p.hidden=(p.id!=="' + pid + '");});return true;})()');
  await sleep(200);
  const r = JSON.parse(await evalJs('(function(){var p=document.getElementById("' + pid + '");if(!p||p.hidden)return JSON.stringify({skip:true});var d=p.scrollWidth-p.clientWidth;var bd=document.documentElement.scrollWidth-window.innerWidth;return JSON.stringify({skip:false,inner:d,body:bd});})()') || '{"skip":true}');
  if (r.skip) continue;
  if (r.inner > 2) report('FAIL', '#' + pid + ' 内容横向溢出 ' + r.inner + 'px');
  else if (r.body > 2) report('WARN', '#' + pid + ' 文档级横向溢出 ' + r.body + 'px');
}
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-home');});return true;})()");

console.log('\n== 手机端审计: FAIL=' + issues.filter(i=>i.sev==='FAIL').length + ' WARN=' + issues.filter(i=>i.sev==='WARN').length + ' INFO=' + issues.filter(i=>i.sev==='INFO').length + ' ==');
try { chrome.kill(); } catch (e) {}
server.close();
const stale = issues.filter(i => i.sev !== 'INFO');
process.exit(stale.length ? 2 : 0);

// ===== 诊断脚本：多桌面聊天美化是否互相串（用户反馈「iOS 自带浏览器：一个联系人换了
// 气泡，其他联系人的气泡也跟着变；不同桌面联系人的聊天美化要分开」） =====
// 用法：node tools/diag-chat-beauty-isolation.mjs（先 node build.mjs 保证 index.html 最新）
// 可选：SERVE_DIR=/path/to/dir 指定要测的构建目录（默认仓库根 index.html）
// 需要：Node 21+ + 本机 Chrome/Edge（CHROME_PATH 可指定）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(process.env.SERVE_DIR || (dirname(fileURLToPath(import.meta.url)) + '/..'));
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

const cdpPort = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-beauty-iso-' + Date.now()),
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
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { console.error('  [eval err]', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 300)); return null; }
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
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

// ---- 种子：新建联系人 cX，default 桌面写一套气泡颜色 ----
const seed = JSON.parse(await evalJs(`(function(){
  try {
    // 清掉 default 的 cs-* 旧设置，确保测试基线干净
    const ds = window.storeFor('default');
    ['cs-in-bg','cs-out-bg','cs-in-ink','cs-out-ink','cs-bubble-css','cs-font'].forEach(k => { try { ds.remove(k); } catch(e){} });
    const cid = window.createContact('角色X');
    return JSON.stringify({ cid: cid, ok: true, active: window.__activeCid });
  } catch(e) { return JSON.stringify({ ok: false, err: e.message }); }
})()`) || '{}');
check('种子：新建联系人 cX', seed.ok === true && !!seed.cid, JSON.stringify(seed));
if (!seed.ok || !seed.cid) process.exit(1);
const cid = seed.cid;

// 进入聊天页（default）——注入两条消息（一发一收），方便看气泡
await evalJs(`(function(){
  try { if (window.openChatDebug || window.__dbgAddMsg) {} } catch(e){}
  const app = document.querySelector('.app[data-app="chat"]');
  if (app) app.click();
  return true;
})()`);
await sleep(600);
await evalJs(`(function(){
  try { if (window.__chatDbgAddMsg) { window.__chatDbgAddMsg('out','测试我的消息'); window.__chatDbgAddMsg('in','测试TA消息'); } } catch(e){}
  return true;
})()`);
// 没有调试钩子就用消息发送接口
await evalJs(`(function(){
  try {
    if (window.sendMsg) { window.sendMsg('测试我的消息'); }
    if (window.__mochiChatDebug) {}
  } catch(e){}
  return true;
})()`);
await sleep(500);

async function snap() {
  // 确保聊天页打开（气泡元素才存在）
  await evalJs(`(function(){
    const app = document.querySelector('.app[data-app="chat"]');
    const chatPage = document.getElementById('page-chat');
    if (chatPage && chatPage.hidden && app) app.click();
    return true;
  })()`);
  await sleep(300);
  return JSON.parse(await evalJs(`(function(){
    const g = function(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
    const b = document.querySelector('.msg-in .msg-bubble');
    const bo = document.querySelector('.msg-out .msg-bubble');
    const cs = getComputedStyle(b || document.body);
    const styleTag = document.getElementById('cs-bubble-style');
    const fontTag = document.getElementById('cs-font-style');
    return JSON.stringify({
      active: window.__activeCid,
      vars: { in_bg: g('--msg-in-bg'), out_bg: g('--msg-out-bg'), fs: g('--chat-font-size') },
      inBubbleBg: b ? getComputedStyle(b).backgroundColor : null,
      outBubbleBg: bo ? getComputedStyle(bo).backgroundColor : null,
      cssStyleInjected: !!styleTag && !!styleTag.textContent,
      fontStyleInjected: !!fontTag && !!fontTag.textContent,
      bodyFont: document.body.style.fontFamily || ''
    });
  })()`));
}

// ---- 场景 1：default 设置粉色联系人气泡 → 切到 cX 看是否还粉 ----
const set1 = JSON.parse(await evalJs(`(function(){
  try {
    window.storeFor('default').set('cs-in-bg', '#ffd6e0');
    window.storeFor('default').set('cs-out-bg', '#d6e4ff');
    // 强制当前联系人重新应用（模拟用户改了设置后 applySettings）
    if (window.applyChatSettings) window.applyChatSettings();
    return JSON.stringify({ ok: true });
  } catch(e) { return JSON.stringify({ ok: false, err: e.message }); }
})()`) || '{}');
check('default 设置联系人气泡粉 #ffd6e0 + 我的气泡蓝 #d6e4ff', set1.ok === true);

await sleep(400);
const s1 = await snap();
console.log('  [default 上]', JSON.stringify(s1));
check('default 上联系人气泡显示粉色', s1.inBubbleBg === 'rgb(255, 214, 224)', s1.inBubbleBg + ' / var=' + s1.vars.in_bg);

// 切到 cX：应该恢复默认白
await evalJs(`(function(){ window.setActiveContact(${JSON.stringify(cid)}); return true; })()`);
await sleep(1200);
await evalJs(`(function(){ const app = document.querySelector('.app[data-app="chat"]'); if (app) app.click(); return true; })()`);
await sleep(600);
const s2 = await snap();
console.log('  [cX 上]', JSON.stringify(s2));
check('cX 上联系人气泡恢复默认（不继承 default 的粉）', s2.inBubbleBg !== 'rgb(255, 214, 224)', s2.inBubbleBg + ' / var=' + s2.vars.in_bg);
check('cX 上我的气泡恢复默认（不继承 default 的蓝）', s2.outBubbleBg !== 'rgb(214, 228, 255)', s2.outBubbleBg + ' / var=' + s2.vars.out_bg);

// ---- 场景 2：default 设置自定义气泡 CSS → 切到 cX 看 style 是否残留 ----
await evalJs(`(function(){ window.setActiveContact('default'); return true; })()`);
await sleep(800);
const set2 = JSON.parse(await evalJs(`(function(){
  try {
    window.storeFor('default').set('cs-bubble-css', 'border-radius:30px !important;');
    if (window.applyChatSettings) {} // cs css 走 applyCss
    if (window.__applyChatCss) {} 
    return JSON.stringify({ ok: true });
  } catch(e) { return JSON.stringify({ ok: false, err: e.message }); }
})()`) || '{}');
// applyCss 是闭包内部函数，通过刷新样式标签触发：直接调用 applyChatSettings 只刷颜色；
// 这里用事件模拟——重新触发一次 contact-switched 不方便，改用 reload 后观察
check('default 写入自定义气泡 CSS', set2.ok === true);

// 直接操作：注入 style 标签（模拟 applyCss 执行后的全局标签状态）
await evalJs(`(function(){
  try {
    var old = document.getElementById('cs-bubble-style');
    if (old) old.remove();
    var st = document.createElement('style');
    st.id = 'cs-bubble-style';
    st.textContent = '.msg-in .msg-bubble, .msg-out .msg-bubble{border-radius:30px !important;}';
    document.head.appendChild(st);
  } catch(e){}
  return true;
})()`);
await sleep(200);
// 切到 cX：contact-switched 会调用 applyCss()，它应清掉 default 的样式标签
await evalJs(`(function(){ window.setActiveContact(${JSON.stringify(cid)}); return true; })()`);
await sleep(1200);
const s3 = await snap();
console.log('  [cX 切后 style 标签]', JSON.stringify(s3));
check('cX 上 default 的自定义气泡 CSS 样式标签已清除/重应用', !s3.cssStyleInjected, 'styleInjected=' + s3.cssStyleInjected);

// ---- 场景 3：default 设置全局字体 → 切到 cX 看 body font 是否残留 ----
await evalJs(`(function(){ window.setActiveContact('default'); return true; })()`);
await sleep(800);
await evalJs(`(function(){
  try {
    window.storeFor('default').set('cs-font', 'Arial');
  } catch(e){}
  return true;
})()`);
// 模拟 applyFont 的全局标签/内联
await evalJs(`(function(){
  try {
    var old = document.getElementById('cs-font-style');
    if (old) old.remove();
    document.body.style.fontFamily = '"Arial",sans-serif';
    document.documentElement.style.fontFamily = '"Arial",sans-serif';
  } catch(e){}
  return true;
})()`);
await sleep(200);
await evalJs(`(function(){ window.setActiveContact(${JSON.stringify(cid)}); return true; })()`);
await sleep(1200);
const s4 = await snap();
console.log('  [cX 切后 font]', JSON.stringify(s4));
check('cX 上 default 的全局字体已清除', s4.bodyFont === '', 'bodyFont=' + s4.bodyFont);

// ---- 场景 4：切回 default 应恢复粉色（双向验证） ----
await evalJs(`(function(){ window.setActiveContact('default'); return true; })()`);
await sleep(1200);
const s5 = await snap();
console.log('  [切回 default]', JSON.stringify(s5));
check('切回 default 联系人气泡恢复粉色', s5.inBubbleBg === 'rgb(255, 214, 224)', s5.inBubbleBg + ' / var=' + s5.vars.in_bg);

console.log('\n==== 汇总: ' + results.filter(r => r.ok).length + '/' + results.length + ' ====');
chrome.kill();
server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);

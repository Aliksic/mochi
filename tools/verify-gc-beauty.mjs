// ===== 专项验证：群聊美化设置（v3.9.x 群聊设置 → 美化聊天） =====
// 链路：进群聊页 → 群聊设置 → 美化聊天入口/子视图 → 各美化项（气泡色/字体/气泡框/头像形状/
//       时间轴/发送按钮/壁纸/字体/气泡CSS）→ 应用只作用 #page-group-chat 不串聊天页 →
//       重置恢复默认 → 持久化 + 迁移排除 → 无 JS 异常。
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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

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
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gcbeauty-' + Date.now()),
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

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});})()" });

async function enterApp() {
  await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();return true;})()");
  await sleep(400);
  await evalJs("(function(){var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var b=c.querySelector('#splash-confirm-ok');if(b)b.click();}return true;})()");
  await sleep(900);
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();

// 开启群聊并进入群聊页
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');if(cb){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()");
await sleep(500);
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');if(gc)gc.click();return true;})()");
await sleep(700);
check('群聊页已进入', await evalJs("(function(){var p=document.getElementById('page-group-chat');return !!p&&!p.hidden;})()"));

// ---- 用例 1：设置面板有「美化聊天」入口 ----
await evalJs("(function(){var b=document.getElementById('gc-more-btn');if(b)b.click();return true;})()");
await sleep(250);
await evalJs("(function(){var b=document.getElementById('gc-more-settings');if(b)b.click();return true;})()");
await sleep(400);
const entry = JSON.parse(await evalJs("(function(){var items=document.querySelectorAll('#gc-set-body .gc-set-item');var hit=null;items.forEach(function(r){var n=r.querySelector('.gc-set-name');if(n&&n.textContent.indexOf('美化聊天')===0)hit=n.textContent.trim();});return JSON.stringify({hit:hit,count:items.length});})()") || '{}');
check('设置面板含「美化聊天」入口行', entry.hit === '美化聊天', JSON.stringify(entry));

// ---- 用例 2：进入美化视图（标题切换 + 返回行 + 分组） ----
await evalJs("(function(){var items=document.querySelectorAll('#gc-set-body .gc-set-item');var link=null;items.forEach(function(r){var n=r.querySelector('.gc-set-name');if(n&&n.textContent.indexOf('美化聊天')===0)link=r;});if(link)link.click();return true;})()");
await sleep(400);
const bv = JSON.parse(await evalJs("(function(){var p=document.getElementById('gc-settings-panel');var title=p?p.querySelector('.gc-set-head span'):null;var back=document.querySelector('#gc-set-body .gc-set-back');var rows=document.querySelectorAll('#gc-set-body .gc-set-row');var titles=Array.from(document.querySelectorAll('#gc-set-body .gc-set-title')).map(function(t){return t.textContent;});return JSON.stringify({title:title?title.textContent:'',back:!!back,rows:rows.length,titles:titles});})()") || '{}');
check('美化视图标题为「美化聊天」', bv.title === '美化聊天', String(bv.title));
check('美化视图有返回行', bv.back === true);
check('美化视图行数 ≥ 14（同聊天设置美化项）', (bv.rows || 0) >= 14, 'rows=' + bv.rows);
check('美化视图含分组标题（壁纸/气泡与文字/发送按钮/气泡外观/字体与样式）',
  ['壁纸', '气泡与文字', '发送按钮', '气泡外观', '字体与样式'].every(t => (bv.titles || []).indexOf(t) >= 0), JSON.stringify(bv.titles));

// ---- 用例 3：气泡颜色等 CSS 变量只作用群聊页，不串聊天页 ----
const rootBefore = await evalJs("(function(){return document.documentElement.style.getPropertyValue('--msg-out-bg')||'(unset)';})()") || '(unset)';
await evalJs("(function(){if(window.groupChatBeautySet)window.groupChatBeautySet('out-bg','#ffd6e0');return true;})()");
await sleep(300);
const vars = JSON.parse(await evalJs("(function(){var gc=document.getElementById('page-group-chat');var root=document.documentElement;return JSON.stringify({gc:gc.style.getPropertyValue('--msg-out-bg'),root:root.style.getPropertyValue('--msg-out-bg'),fs:gc.style.getPropertyValue('--chat-font-size'),pad:gc.style.getPropertyValue('--chat-bubble-pad'),av:gc.style.getPropertyValue('--msg-av-radius')});})()") || '{}');
check('我的气泡颜色已应用（#page-group-chat）', vars.gc === '#ffd6e0', JSON.stringify(vars));
check('聊天页（root）气泡颜色未被群聊设置改动（隔离）', vars.root === rootBefore, 'root=' + vars.root + ' before=' + rootBefore);

// ---- 用例 4：字体大小/气泡框/头像形状/发送按钮 ----
await evalJs("(function(){window.groupChatBeautySet('font-size','16px');window.groupChatBeautySet('bubble-size','14px 18px');window.groupChatBeautySet('av-shape','square');window.groupChatBeautySet('send-show','hide');return true;})()");
await sleep(300);
const v2 = JSON.parse(await evalJs("(function(){var gc=document.getElementById('page-group-chat');var send=document.getElementById('gc-send');return JSON.stringify({fs:gc.style.getPropertyValue('--chat-font-size'),pad:gc.style.getPropertyValue('--chat-bubble-pad'),av:gc.style.getPropertyValue('--msg-av-radius'),send:send?send.style.display:''});})()") || '{}');
check('字体大小/气泡框/头像形状已应用', v2.fs === '16px' && v2.pad === '14px 18px' && v2.av === '10px', JSON.stringify(v2));
check('发送按钮已隐藏', v2.send === 'none', 'send=' + v2.send);

// ---- 用例 5：时间轴样式（page 级类） ----
await evalJs("(function(){window.groupChatBeautySet('time-style','hidden');return true;})()");
await sleep(200);
const ts = await evalJs("(function(){var gc=document.getElementById('page-group-chat');return gc&&gc.classList.contains('cs-time-hidden')?'yes':'no';})()");
check('时间轴样式 hidden 已挂 page 级类', ts === 'yes', String(ts));

// ---- 用例 6：壁纸 ----
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await evalJs("(function(){window.groupChatBeautySet('bg','" + PNG + "');return true;})()");
await sleep(300);
const bg = await evalJs("(function(){var gc=document.getElementById('page-group-chat');return (gc.style.backgroundImage||'').indexOf('data:image')>=0?'yes':'no';})()");
check('群聊壁纸已应用到群聊页', bg === 'yes', String(bg));

// ---- 用例 7：气泡 CSS（作用域自动加 #page-group-chat） ----
await evalJs("(function(){window.groupChatBeautySet('css','border-radius:6px');return true;})()");
await sleep(200);
const css = await evalJs("(function(){var st=document.getElementById('gc-bubble-style');if(!st)return 'no-style';var t=st.textContent||'';return t.indexOf('#page-group-chat .msg-out .msg-bubble')===0?'scoped':'raw:'+t;})()");
check('气泡 CSS 已注入且作用域为群聊页', css === 'scoped', String(css));

// ---- 用例 8：重置回默认 ----
await evalJs("(function(){window.groupChatBeautySet('out-bg','#111111');window.groupChatBeautySet('av-shape','circle');window.groupChatBeautySet('send-show','show');window.groupChatBeautySet('time-style','under-av');return true;})()");
await sleep(300);
const reset = JSON.parse(await evalJs("(function(){var gc=document.getElementById('page-group-chat');var raw=localStorage.getItem('xy-home-v2:gc-beauty');var o={};try{o=JSON.parse(raw||'{}');}catch(e){}return JSON.stringify({outBg:gc.style.getPropertyValue('--msg-out-bg'),av:gc.style.getPropertyValue('--msg-av-radius'),timeHidden:gc.classList.contains('cs-time-hidden'),storedOutBg:o['out-bg']!==undefined,storedAv:o['av-shape']!==undefined});})()") || '{}');
check('重置后我的气泡颜色回默认', reset.outBg === '#111111', JSON.stringify(reset));
check('重置后头像形状回圆形', reset.av === '50%', 'av=' + reset.av);
check('重置后时间轴类已移除', reset.timeHidden === false);
check('重置后默认值不再写入存储', reset.storedOutBg === false && reset.storedAv === false);

// ---- 用例 9：持久化 + 迁移排除 + 刷新后仍生效 ----
await evalJs("(function(){window.groupChatBeautySet('font-size','16px');return true;})()");
await sleep(200);
const persist = JSON.parse(await evalJs("(function(){var root=localStorage.getItem('xy-home-v2:gc-beauty');var def=localStorage.getItem('xy-home-v2:default:gc-beauty');return JSON.stringify({root:!!root,def:!!def,fs:(function(){try{return JSON.parse(root||'{}')['font-size']||'';}catch(e){return '';}})()});})()") || '{}');
check('gc-beauty 持久化在根命名空间', persist.root === true, JSON.stringify(persist));
check('gc-beauty 未被迁移进 default 桌面', persist.def === false, 'def=' + persist.def);
await cdp('Page.reload');
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();
const afterReload = JSON.parse(await evalJs("(function(){var gc=document.getElementById('page-group-chat');var fs=gc?gc.style.getPropertyValue('--chat-font-size'):'';var root=localStorage.getItem('xy-home-v2:gc-beauty');var def=localStorage.getItem('xy-home-v2:default:gc-beauty');return JSON.stringify({fs:fs,root:!!root,def:!!def});})()") || '{}');
check('刷新后群聊美化仍生效（字体 16px）', afterReload.fs === '16px', JSON.stringify(afterReload));
check('刷新后仍只存根命名空间（未迁移）', afterReload.root === true && afterReload.def === false, 'root=' + afterReload.root + ' def=' + afterReload.def);

// ---- 用例 10：无 JS 异常 ----
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);

// ===== 诊断：四子棋入口在构建产物里点不开（用户反馈复现）=====
// 用法：node tools/diag-c4-open.mjs
// 对仓库根的 index.html（真构建产物）走完整 UI 路径：
//   进聊天 → 点「更多」→ 切「小游戏」tab → 点「四子棋」
// 输出：面板 hidden 状态、祖先链可见性、computed 尺寸、__jsErrors。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = readFileSync(join(root, 'index.html'), 'utf8');
console.log('index.html 大小:', html.length, ' 含 more-c4:', html.indexOf('more-c4') >= 0, ' 含 chat-c4-panel:', html.indexOf('chat-c4-panel') >= 0, ' 含 connect-four.js 包装:', html.indexOf('[JS] connect-four.js') >= 0);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    if (req.url === '/' || req.url.split('?')[0] === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    const p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const stamp = Date.now();
const cdpPort = 9720 + Math.floor(Math.random() * 120);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-c4diag-' + stamp),
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
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) { console.log('JS异常:', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').split('\n')[0]); return null; }
  return r && r.result ? r.result.value : null;
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const useFile = process.argv.includes('--file');
const urlArgIdx = process.argv.indexOf('--url');
const navUrl = urlArgIdx >= 0 ? process.argv[urlArgIdx + 1] : (useFile ? 'file:///' + normalize(join(root, 'index.html')).replace(/\\/g, '/') : 'http://127.0.0.1:' + server.address().port + '/index.html');
await cdp('Page.navigate', { url: navUrl });
console.log('导航到:', navUrl);
await sleep(2600);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
await sleep(900);
console.log('__jsErrors(启动期):', await evalJs("JSON.stringify(window.__jsErrors||[])"));

// 进聊天页
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return 1;})()");
await sleep(700);

// ① 点「更多」按钮（真实路径）
await evalJs("(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();return 1;})()");
await sleep(400);
console.log('更多面板打开:', await evalJs("!document.getElementById('chat-more-panel').hidden"));
// ② 切小游戏 tab
await evalJs("(function(){var t=document.querySelector('#more-tabs .more-tab[data-mcat=\"game\"]');if(t)t.click();return 1;})()");
await sleep(300);
console.log('game tab 后 #more-c4 可见(hidden属性):', await evalJs("!document.getElementById('more-c4').hidden"),
  ' rect:', await evalJs("(function(){var r=document.getElementById('more-c4').getBoundingClientRect();return JSON.stringify([r.x,r.y,r.width,r.height]);})()"));
// 真实命中测试：图标中心点上 elementFromPoint 实际命中的元素（检测透明浮层遮挡）
console.log('图标中心命中元素:', await evalJs("(function(){var b=document.getElementById('more-c4');var r=b.getBoundingClientRect();var x=r.x+r.width/2,y=r.y+r.height/2;var el=document.elementFromPoint(x,y);var path=[];while(el&&path.length<5){path.push((el.id||'')+'.'+(typeof el.className==='string'?el.className:''));el=el.parentElement;}var bb=b.getBoundingClientRect();b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}));return JSON.stringify({hit:path,topHitIsSelfOrChild:document.elementFromPoint(x,y)!==document.getElementById('more-c4')&&!document.getElementById('more-c4').contains(document.elementFromPoint(x,y))});})()"));
await sleep(500);
console.log('（事件派发后）面板打开:', await evalJs("!document.getElementById('chat-c4-panel').hidden"));
// 若上面没开，回退直接 click()
if (await evalJs("document.getElementById('chat-c4-panel').hidden")) {
  await evalJs("(function(){document.getElementById('more-c4').click();return 1;})()");
  await sleep(400);
}
// ③ 点四子棋（真实 click）
await evalJs("(function(){document.getElementById('more-c4').click();return 1;})()");
await sleep(500);
const st = JSON.parse(await evalJs("(function(){function anc(el){var out=[];var n=el;while(n&&n.tagName){out.push((n.id||n.tagName)+(n.hidden?'[hidden]':'')+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ').join('.'):''));n=n.parentElement;}return out.join(' <- ');}var p=document.getElementById('chat-c4-panel');if(p.hidden)return JSON.stringify({panelHidden:true,note:'直接click后仍未打开'});var r=p.getBoundingClientRect();var cs=getComputedStyle(p);return JSON.stringify({panelHidden:p.hidden,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],display:cs.display,pos:cs.position,z:cs.zIndex,ancestors:anc(p),overlayHidden:(document.getElementById('c4-overlay')||{}).hidden,cols:document.querySelectorAll('#c4-board .c4-col').length,errs:window.__jsErrors||[]});})()"));
console.log('点击后面板状态:', JSON.stringify(st, null, 2));

// 对照组：同路径点 Pong 是否能开（区分「全都不能开」vs「只有四子棋不能开」）
await evalJs("(function(){var mp=document.getElementById('chat-more-panel');if(!mp.hidden){}else{document.getElementById('chat-more-btn').click();}var t=document.querySelector('#more-tabs .more-tab[data-mcat=\"game\"]');if(t)t.click();document.getElementById('more-pong').click();return 1;})()");
await sleep(400);
console.log('对照-Pong面板打开:', await evalJs("!document.getElementById('chat-pong-panel').hidden"));

try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(0);

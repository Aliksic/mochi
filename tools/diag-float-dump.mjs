// ===== 诊断：聊天更多面板打开瞬间的浮层精确状态表 =====
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-floatdump-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(4500);
  await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
  await sleep(300);
  await evalJs("(function(){var b=document.getElementById('splash-confirm-ok');if(b)b.click();return true;})()");
  await sleep(400);

  const dumpFn = "(function(){\n  var SEL=['#tc-mask','#cc-export-mask','#cc-scope-mask','#call-mask','#feed-notice-panel','#feed-comment-panel','#poke-card','#emoji-panel','#chat-ask-panel','#qa-mask','#chat-more-panel','#gc-more-panel','#chat-search','#chat-decision-panel','#chat-divine-panel','#chat-rps-panel','#chat-call-panel','#chat-pong-panel','#chat-snake-panel','#chat-gift-panel','#avlib-card','#ck-panel','#loc-panel','.mg-mask','#modal-mask','#msg-actions','#desk-image-viewer','.desk-lib','#gc-members-panel','#gc-at-panel','#gc-settings-panel'];\n  var out=[];\n  SEL.forEach(function(sel){ try{ var el=document.querySelector(sel); if(!el) return; var notHidden=!el.hasAttribute('hidden'); if(!notHidden) return; var cs=getComputedStyle(el); var r=el.getBoundingClientRect(); var anc=el.offsetParent; var chain=[]; var p=el.parentElement;\n    while(p && p!==document.documentElement && chain.length<4){ var pcs=getComputedStyle(p); chain.push({tag:p.tagName,id:p.id||'',cls:(p.className||'').toString().slice(0,30),disp:pcs.display,ovf:pcs.overflow,cv:pcs.contentVisibility||''}); p=p.parentElement; }\n    out.push({sel:sel, display:cs.display, vis:cs.visibility, rects:el.getClientRects().length, rect:{w:Math.round(r.width),h:Math.round(r.height)}, offsetParent: anc?anc.tagName+'#'+(anc.id||''):null, chain:chain}); }catch(e){} });\n  return { lock: document.body.classList.contains('scroll-lock'), notHidden: out };\n})()";;

  // 进聊天页
  await evalJs("(function(){var t=document.querySelector('.tab[data-page=\"page-chat\"]');if(t)t.click();return true;})()");
  await sleep(400);
  // 装 hidden setter 陷阱：谁改 page-chat.hidden 就记下调用栈
  await evalJs("(function(){\n  var page=document.getElementById('page-chat'); window.__pageChatHidden=page.hidden;\n  var d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'hidden')||Object.getOwnPropertyDescriptor(Element.prototype,'hidden');\n  if(!d) return 'no-desc';\n  Object.defineProperty(page,'hidden',{configurable:true,\n    get:function(){return d.get.call(this);},\n    set:function(v){ try{ window.__hideStack=(v?'HIDE':'SHOW')+' @ '+String(new Error().stack||'').split('\\n').slice(1,6).join(' | ');}catch(e){} return d.set.call(this,v); }\n  });\n  return { hiddenAfterTab: page.hidden };\n})()");
  console.log('== 进聊天页（未点任何按钮） ==');
  console.log(JSON.stringify(await evalJs(dumpFn), null, 1));

  await evalJs("(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();return true;})()");
  await sleep(350);
  console.log('== 点 chat-more-btn 后 ==');
  console.log(JSON.stringify(await evalJs(dumpFn), null, 1));
  console.log('hidden setter 调用栈:', await evalJs('window.__hideStack || "(无)"'));

  // 关闭后再看
  await evalJs("(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();return true;})()");
  await sleep(350);
  console.log('== 再点一次（切换关闭） ==');
  console.log(JSON.stringify(await evalJs(dumpFn), null, 1));
} finally {
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

// 诊断：记忆翻牌面板在手机视口下的视觉/命中问题（截图 + elementFromPoint 命中测试）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const outDir = join(tmpdir(), 'opencode', 'mgm-diag');
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (v) => { try { return JSON.parse(v || '{}'); } catch (e) { return { _raw: String(v) }; } };

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  try {
    if (req.url === '/' || req.url.split('?')[0] === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(join(root, 'index.html'))); return; }
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const st = statSync(p);
    if (st.isDirectory()) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(join(root, 'index.html'))); return; }
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
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const stamp = Date.now();
const profileDir = join(tmpdir(), 'mochi-mgm-diag-' + stamp);
const cdpPort = 9920 + Math.floor(Math.random() * 60);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profileDir, '--remote-debugging-port=' + cdpPort, 'about:blank'
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
  throw new Error('no browser');
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').split('\n')[0] };
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  if (r && r.data) { writeFileSync(join(outDir, name), Buffer.from(r.data, 'base64')); console.log('shot -> ' + join(outDir, name)); }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');

async function runViewport(w, h, tag) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2200);
  for (let i = 0; i < 30; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
  await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
  await sleep(500);
  // 报修须知确认卡（headless 必现，真实用户确认过一次即不再出现）：必须先点掉
  await evalJs("(function(){var ok=document.getElementById('splash-confirm-ok');if(ok){ok.click();return 1;}var c=document.querySelector('.splash-confirm-card');if(c&&c.hidden!==true){var b=c.querySelector('button');if(b)b.click();}return 1;})()");
  await sleep(500);
  await evalJs("(function(){var m=document.getElementById('splash-confirm');if(m)m.hidden=true;return 1;})()");
  await sleep(300);
  // 关自动回复，进入聊天页
  await evalJs("(function(){var st=window.activeStore();st.set('reply-rs-min','9999');st.set('reply-rs-max','9999');st.set('reply-rn-prob','0');st.set('reply-as-en','0');window.__mgmDebug.fast=true;document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return 1;})()");
  await sleep(600);

  // 打开更多面板（走真实按钮），切到小游戏 chip，点入口
  await evalJs("(function(){var mb=document.getElementById('chat-more')||document.querySelector('[id*=more]');var mp=document.getElementById('chat-more-panel');if(mp)mp.hidden=false;var tabs=document.querySelectorAll('#more-tabs .more-tab');for(var i=0;i<tabs.length;i++){if(tabs[i].dataset.mcat==='game'){tabs[i].click();break;}}return 1;})()");
  await sleep(300);
  await shot(tag + '-00-moregrid.png');
  await evalJs("(function(){var b=document.getElementById('more-memory');if(b)b.click();return 1;})()");
  await sleep(400);
  await shot(tag + '-01-open.png');
  console.log(tag + ' open state:', JSON.stringify(await evalJs("(function(){var p=document.getElementById('chat-memory-panel');var pr=p.getBoundingClientRect();var ov=document.getElementById('memory-overlay');var or=ov.getBoundingClientRect();return JSON.stringify({panelHidden:p.hidden,panelRect:{x:Math.round(pr.x),y:Math.round(pr.y),w:Math.round(pr.width),h:Math.round(pr.height)},ovShown:!ov.hidden,ovRect:{x:Math.round(or.x),y:Math.round(or.y),w:Math.round(or.width),h:Math.round(or.height)},startBtn:(document.getElementById('memory-overlay-btn')||{}).textContent});})()")));

  // 命中测试：开始按钮中心点
  console.log(tag + ' startBtn hit:', JSON.stringify(await evalJs("(function(){var b=document.getElementById('memory-overlay-btn');var r=b.getBoundingClientRect();var el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return JSON.stringify({rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},hit:el?(el.id||el.className||el.tagName):null,same:el===b||(el&&b.contains(el))});})()")));
  // 点开始
  await evalJs("(function(){document.getElementById('memory-overlay-btn').click();return 1;})()");
  await sleep(500);
  await shot(tag + '-02-board.png');
  console.log(tag + ' board:', JSON.stringify(await evalJs("(function(){var bd=document.getElementById('memory-board');var br=bd.getBoundingClientRect();var cs=getComputedStyle(bd);var cards=[].slice.call(document.querySelectorAll('#memory-board .mgm-card'));var hits=cards.map(function(c,i){var r=c.getBoundingClientRect();var el=document.elementFromPoint(Math.min(Math.max(r.x+r.width/2,0),innerWidth-1),Math.min(Math.max(r.y+r.height/2,0),innerHeight-1));return{i:i,ok:el===c||(!!el&&c.contains(el)),hit:el?(String(el.className.baseVal!==undefined?el.className.baseVal:el.className)||el.tagName).slice(0,26):null};});var c0=cards[0]?cards[0].getBoundingClientRect():{width:0,height:0};return JSON.stringify({boardRect:{x:Math.round(br.x),y:Math.round(br.y),w:Math.round(br.width),h:Math.round(br.height)},display:cs.display,cols:cs.gridTemplateColumns.split(' ').length,nCards:cards.length,cardWH:[Math.round(c0.width),Math.round(c0.height)],allHitOk:hits.every(function(h){return h.ok;}),badHits:hits.filter(function(h){return !h.ok;}).slice(0,4)});})()")));
  // 玩家先手则翻一张看视觉
  await evalJs("(function(){var g=window.__mgmDebug.st();if(g&&g.turn==='player'&&g.phase==='idle'){var c=document.querySelector('#memory-board .mgm-card[data-idx=\"0\"]');if(c)c.click();}return 1;})()");
  await sleep(450);
  await shot(tag + '-03-flip.png');
  // 滚动容器检查
  console.log(tag + ' scroll:', JSON.stringify(await evalJs("(function(){var sc=document.querySelector('#chat-memory-panel .poke-card-scroll');var r=sc.getBoundingClientRect();var cs=getComputedStyle(sc);return JSON.stringify({rect:{y:Math.round(r.y),h:Math.round(r.height)},maxH:cs.maxHeight,overflowY:cs.overflowY,scrollH:sc.scrollHeight,clientH:sc.clientHeight});})()")));
}

await runViewport(390, 844, '390');
await runViewport(360, 640, '360');

try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
try { rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
console.log('done, shots in ' + outDir);

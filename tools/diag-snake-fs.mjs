// 一次性探针：贪吃蛇全屏态高度诊断
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
html = html.replace('/*__STYLES__*/', cssFiles.map((f) => read(join('css', f))).join('\n'));
html = html.replace('/*__SCRIPTS__*/', jsFiles.map((f) => '(function(){try{\n' + read(join('js', f)) + '\n}catch(__e){}})();').join('\n'));
html = html.split('__BUILD_INFO__').join('diag-snake').split('__BUILD_TS__').join(String(Date.now())).split('__APP_VERSION__').join('diag');
const tmpHtml = join(tmpdir(), 'mochi-snake-diag-' + Date.now() + '.html');
writeFileSync(tmpHtml, html);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  try {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    const p = normalize(join(root, decodeURIComponent(u)));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;
const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const cdpPort = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + join(tmpdir(), 'mochi-snake-diag-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });
let ws = null, msgId = 0;
const pend = new Map();
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
    const page = list.find((t) => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } }; break; }
  } catch (e) {}
  await sleep(150);
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }); return r && r.result ? r.result.value : null; }
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();})()");
await sleep(900);
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return true;})()");
await sleep(600);
console.log(JSON.parse(await evalJs(`(function(){
  if(window.openSnakePanel)window.openSnakePanel();
  var el=document.getElementById('chat-snake-panel');
  var cs=getComputedStyle(el);var r=el.getBoundingClientRect();
  var probe=document.createElement('div');probe.style.height='100vh';document.body.appendChild(probe);
  var vhPx=probe.getBoundingClientRect().height;probe.remove();
  return JSON.stringify({
    innerH:window.innerHeight, clientH:document.documentElement.clientHeight,
    vh100:Math.round(vhPx),
    rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
    cls:el.className, inlineStyle:el.getAttribute('style')||'',
    csPos:cs.position, csTop:cs.top, csBottom:cs.bottom, csHeight:cs.height, csMaxH:cs.maxHeight,
    phoneRect:(function(){var p=document.querySelector('.phone');var pr=p.getBoundingClientRect();return {h:Math.round(pr.height),styleH:p.style.height||''};})(),
    phoneZoom:getComputedStyle(document.querySelector('.phone')).zoom,
    docZoom:getComputedStyle(document.documentElement).zoom,
    bodyZoom:getComputedStyle(document.body).zoom,
    vvH:window.visualViewport?Math.round(window.visualViewport.height):null,
    vvScale:window.visualViewport?window.visualViewport.scale:null,
    offH:el.offsetHeight,
    ownTransform:cs.transform,
    chain:(function(){var out=[];var n=el;while(n&&n!==document.documentElement){var c=getComputedStyle(n);out.push({tag:n.id?('#+#'+n.id):(n.tagName+'.'+String(n.className).split(' ')[0]),tr:c.transform,pos:c.position,h:n.getBoundingClientRect().height|0});n=n.parentElement;}return out;})()
  });
})()`)));
try { chrome.kill(); } catch (e) {}
server.close();

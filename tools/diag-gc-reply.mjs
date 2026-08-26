// ===== 诊断：群聊成员文本回复为何未落地（捕获页面异常 + 轮询）=====
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
html = html.replace('/*__SCRIPTS__*/', jsFiles.map((f) => '(function () { try {\n' + read(join('js', f)) + '\n} catch (__e) { try { console.error("[JS] ' + f + '", __e && __e.message || __e); } catch (x) {} } })();').join('\n'));
html = html.split('__BUILD_INFO__').join('diag').split('__BUILD_TS__').join(String(Date.now())).split('__APP_VERSION__').join('v-diag');
const tmpHtml = join(tmpdir(), 'mochi-gcdiag-' + Date.now() + '.html');
writeFileSync(tmpHtml, html);

const server = createServer((req, res) => {
  try {
    if (req.url === '/' || req.url.split('?')[0] === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const cdpPort = 9300 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + join(tmpdir(), 'mochi-gcd-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pend = new Map();
async function conn() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
          if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            console.log('[PAGE-EXC]', (d.exception && d.exception.description || d.text || '').split('\n').slice(0, 4).join(' | '));
          }
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            console.log('[console.error]', m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
          }
        };
        return;
      }
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('no chrome');
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function ev(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) { console.log('[EVAL-EXC]', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').split('\n')[0]); return null; }
  return r && r.result ? r.result.value : null;
}

await conn();
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(300); }
await ev("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return 1;})()");
await sleep(800);

await ev("(function(){var st=window.xyStore('xy-home-v2');[['reply-gc-prob','100'],['reply-gc-rs-min','1'],['reply-gc-rs-max','1'],['reply-gc-touch-prob','0'],['reply-gc-reply-min','1'],['reply-gc-reply-max','1'],['reply-gc-sticker-prob','0'],['reply-gc-emoji-prob','0'],['reply-gc-image-prob','0'],['reply-gc-voice-prob','0'],['reply-gc-kaomoji-prob','0'],['reply-gc-quote-prob','0'],['reply-gc-rc-prob','0'],['reply-gc-py-en','0']].forEach(function(kv){st.set(kv[0],kv[1]);});window.getContacts=function(){return [{id:'gct1',name:'测试成员'}];};return 1;})()");
await ev("(function(){var a=document.querySelector('.app[data-app=\"group-chat\"]');a.hidden=false;a.click();return 1;})()");
await sleep(700);
await ev("(function(){window.groupChatClear();return 1;})()");
console.log('cfg=', await ev("(function(){var c=window.groupChatCfg();return JSON.stringify({p:c['gc-prob'],min:c['gc-rs-min'],max:c['gc-rs-max']});})()"));
await ev("(function(){var i=document.getElementById('gc-input');i.innerText='诊断消息';document.getElementById('gc-send').click();return 1;})()");
for (let t = 0; t < 14; t++) {
  await sleep(500);
  const st = await ev("(function(){var m=window.groupChatGetMsgs();var ty=document.getElementById('gc-typing');return JSON.stringify({n:m.length,last:m.length?m[m.length-1].side:'',typing:ty?!ty.hidden:false,typingTxt:ty?ty.textContent:''});})()");
  console.log('t+' + ((t + 1) * 0.5) + 's', st);
}
try { chrome.kill(); } catch (e) {}
server.close();
process.exit(0);

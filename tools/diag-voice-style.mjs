import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = process.argv[2] || process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
const { spawn } = await import('node:child_process');
const { createServer } = await import('node:http');
const { rmSync } = await import('node:fs');
const { normalize, extname } = await import('node:path');
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
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
const cdpPort = 9800 + Math.floor(Math.random() * 100);
const tmpProfile = join(process.env.TEMP || '/tmp', 'mochi-vdiag-' + Date.now());
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--user-data-dir=' + tmpProfile, '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch (e) {} try { rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {} });
let ws = null, msgId = 0;
const pend = new Map();
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
    const page = list.find((t) => t.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
      break;
    }
  } catch (e) {}
  await sleep(150);
}
function cdp(method, params = {}) { const id = ++msgId; return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r && r.result ? r.result.value : null;
}
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();var c=document.getElementById('splash-confirm-ok');if(c)c.click();return 1;})()");
await sleep(800);
await evalJs("(function(){try{window.enterChat();}catch(e){}return 1;})()");
await sleep(700);
// 注入一条我的（out 侧）语音消息：走 window.chatAddGift（直通 addRec），极短假 wav
const TINY = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const probe = await evalJs("(function(){ try { window.chatAddGift({ side: 'out', text: " + JSON.stringify('语音 2″|||' + TINY) + ", type: 'voice', ts: Date.now() }); } catch (e) { return 'ERR ' + e.message; } return 'ok'; })()");
console.log('inject:', probe);
await sleep(900);
const info = await evalJs("(function(){ var out = {}; var v = document.querySelector('#chat-body .msg-out .msg-voice'); out.found = !!v; if (!v) { var any = document.querySelector('#chat-body .msg-voice'); out.anyVoice = !!any; if (any) { var c = [], el = any; while (el && el.id !== 'chat-body') { c.push(el.className || el.tagName); el = el.parentElement; } out.anyChain = c.join(' < '); } return JSON.stringify(out); } var chain = [], el2 = v; while (el2 && el2.id !== 'chat-body') { chain.push(el2.className || el2.tagName); el2 = el2.parentElement; } out.chain = chain.join(' < '); var pb = v.querySelector('.msg-voice-play'); if (pb) { var cs = getComputedStyle(pb); out.pb = { bg: cs.backgroundColor, border: cs.borderColor, color: cs.color, display: cs.display, w: cs.width, opacity: cs.opacity, visibility: cs.visibility }; } else out.pb = null; var wi = v.querySelector('.msg-voice-wave i'); if (wi) { var cs2 = getComputedStyle(wi); out.wave = { bg: cs2.backgroundColor, opacity: cs2.opacity, h: cs2.height }; } var bubble = v.closest('.msg-bubble'); if (bubble) { var cs3 = getComputedStyle(bubble); out.bubble = { bg: cs3.backgroundColor, color: cs3.color }; } var btn = document.getElementById('voice-rec-btn'); if (btn) { var cs4 = getComputedStyle(btn); out.recBtn = { bg: cs4.backgroundColor, color: cs4.color }; } return JSON.stringify(out); })()");
console.log('LIGHT:', info);
// 深色下再探（含打开面板看录音按钮）
await evalJs("(function(){document.documentElement.setAttribute('data-theme','dark');window.activeStore().set('cs-voice-send','1');document.dispatchEvent(new Event('voice-send-changed'));document.getElementById('chat-mic-btn').click();return 1;})()");
await sleep(500);
const info2 = await evalJs("(function(){ var out = { theme: document.documentElement.getAttribute('data-theme') }; var btn = document.getElementById('voice-rec-btn'); if (btn) { var cs = getComputedStyle(btn); out.recBtn = { bg: cs.backgroundColor, color: cs.color }; } else out.recBtn = null; out.btnBgVar = getComputedStyle(document.documentElement).getPropertyValue('--btn-bg'); var v = document.querySelector('#chat-body .msg-out .msg-voice-play'); if (v) { var cs2 = getComputedStyle(v); out.pb = { bg: cs2.backgroundColor, color: cs2.color }; } return JSON.stringify(out); })()");
console.log('DARK:', info2);
chrome.kill();
try { server.close(); } catch (e) {}
process.exit(0);

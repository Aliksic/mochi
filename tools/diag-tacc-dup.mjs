// 诊断：「用了你建的字卡」标签行是否仍与气泡正文重复
// 运行时跑最新构建产物：确定性触发 TACC → 检查渲染后的气泡内正文出现次数
import { spawn } from 'node:child_process';
import { readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, dirname, sep } from 'node:path';
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

const tmpDir = mkdtempSync(join(tmpdir(), 'mochi-diag-tacc-'));
writeFileSync(join(tmpDir, 'index.html'), readFileSync(join(root, 'index.html'), 'utf8'));
writeFileSync(join(tmpDir, 'sw.js'), readFileSync(join(root, 'sw.js'), 'utf8'));
writeFileSync(join(tmpDir, 'manifest.json'), readFileSync(join(root, 'manifest.json'), 'utf8'));
for (const f of ['icon-192.png', 'icon-512.png']) { try { writeFileSync(join(tmpDir, f), readFileSync(join(root, f))); } catch (e) {} }
const baseUrl = 'file:///' + normalize(tmpDir).split(sep).join('/') + '/index.html';
const cdpPort = 9900 + Math.floor(Math.random() * 80);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-audio-output', '--disable-component-extensions-with-background-pages',
  '--user-data-dir=' + join(tmpdir(), 'mochi-diag-prof-' + Date.now()),
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
  if (r && r.exceptionDetails) { console.error('JS 异常:', String((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text).slice(0, 400)); return null; }
  return r && r.result ? r.result.value : null;
}

try {
  await cdpConnect();
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: baseUrl });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
  await sleep(800);
  await evalJs(`(function(){var b=document.querySelector('.splash-confirm-btn')||document.getElementById('splash-confirm-ok');if(b)b.click();var s=document.getElementById('splash');if(s)s.hidden=true;return true;})()`);
  await sleep(300);

  // 确定性环境：卡池只有一张纯文本卡，概率 100%
  const setup = await evalJs(`(function(){
    window.__origGCC = window.getCustomCards;
    window.getCustomCards = function(){ return ['今晚想吃火锅呀']; };
    var st = window.xyStore('xy-home-v2:default');
    st.set('reply-ai-cc-en','1'); st.set('reply-ai-cc-prob','100');
    st.set('ta-cc-state','{}'); st.set('interact-card-last','0');
    window.__origRandom = Math.random; Math.random = function(){ return 0; };
    return true;
  })()`);
  console.log('setup ok:', setup);
  await evalJs('window.maybeTriggerTACC(); true');
  await sleep(400);

  const info = await evalJs(`(function(){
    var m = window.getChatMsgs ? window.getChatMsgs() : [];
    var idx = -1;
    for (var i = m.length - 1; i >= 0; i--) { if (m[i] && m[i].text === '今晚想吃火锅呀' && m[i].side === 'in') { idx = i; break; } }
    if (idx < 0) return { found: false };
    var rec = m[idx];
    // 找到对应 DOM：聊天列表里第 idx+1 条（或按 data-idx）
    var items = document.querySelectorAll('#chat-list .msg, .chat-list .msg, [data-idx]');
    var bubble = null;
    for (var j = items.length - 1; j >= 0; j--) { if (String(items[j].dataset && items[j].dataset.idx) === String(idx)) { bubble = items[j].querySelector('.msg-bubble'); break; } }
    var domTextCount = -1, moodHtml = '';
    if (bubble) {
      domTextCount = (bubble.textContent.split('今晚想吃火锅呀').length - 1);
      var mm = bubble.querySelector('.msg-moods');
      moodHtml = mm ? mm.innerHTML : '(无 mood 行)';
    }
    return { found: true, idx: idx, recMood: rec.mood, recText: rec.text, domTextCount: domTextCount, moodHtml: String(moodHtml).slice(0, 500), bubbleFound: !!bubble };
  })()`);
  console.log(JSON.stringify(info, null, 2));

  // 再看整页该文本出现次数（排除其他模块干扰前先看原始值）
  const all = await evalJs(`document.body.textContent.split('今晚想吃火锅呀').length - 1`);
  console.log('全页出现次数:', all);
} catch (e) {
  console.error('异常:', e && e.message || e);
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  try { rmSync(join(tmpdir(), 'mochi-diag-prof-' + cdpPort), { recursive: true, force: true }); } catch (e) {}
}

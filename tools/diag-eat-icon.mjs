// ===== 吃什么桌面图标重设计预览：旧版 vs 候选A/B/C，实际尺寸(58px瓦片/28px svg)+放大96px，并输出几何边界 =====
import { spawn } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('no chrome'); process.exit(1); }

const HEAD = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';
const SVGS = {
  'D1 叉刀·经典': '<path d="M4.5 2.5v7c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-7"/><path d="M8.5 2.5v19"/><path d="M19.5 15V2.5a5 5 0 00-5 5v5.5c0 1.1.9 2 2 2h3z"/><path d="M19.5 15v6.5"/>',
  'D2 四齿叉+刀': '<path d="M4.5 2.5v7c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-7"/><path d="M7.2 2.5v8.3"/><path d="M9.8 2.5v8.3"/><path d="M8.5 11.5v10"/><path d="M19.5 15V2.5a5 5 0 00-5 5v5.5c0 1.1.9 2 2 2h3z"/><path d="M19.5 15v6.5"/>',
  'D3 叉+勺': '<path d="M4.5 2.5v7c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-7"/><path d="M8.5 2.5v19"/><ellipse cx="17.5" cy="6" rx="2.9" ry="3.5"/><path d="M17.5 9.5v12"/>',
  'D4 叉+开式刀': '<path d="M4.5 3.5v6c0 1 .8 1.8 1.8 1.8h4.4c1 0 1.8-.8 1.8-1.8v-6"/><path d="M8.5 3.5v17"/><path d="M19.5 20.5v-17"/><path d="M19.5 3.5c-2.9.9-5 3.6-5 6.7 0 2.6 1.7 4.3 3.5 4.3h1.5"/>'
};

let col = '';
const names = Object.keys(SVGS);
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const body = SVGS[name];
  const svg = HEAD + body + '</svg>';
  col += `
  <div class="col">
    <div class="tile">${svg}</div>
    <div class="name">${name}</div>
    <div class="zoom">${svg}</div>
    <pre class="bbox" id="bb-${i}">…</pre>
  </div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:18px;background:#efece7;font-family:sans-serif;display:flex;gap:26px}
.col{display:flex;flex-direction:column;align-items:center;gap:10px}
.tile{width:min(58px,21vw);height:58px;border-radius:18px;background:rgba(255,255,255,.92);
  border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 8px rgba(0,0,0,.04);
  display:flex;align-items:center;justify-content:center}
.tile svg{width:28px;height:28px;stroke:#333}
.zoom{width:110px;height:110px;background:#fff;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;margin-top:6px}
.zoom svg{width:96px;height:96px;stroke:#333}
.name{font-size:13px;font-weight:700;color:#222}
.bbox{font-size:10px;color:#666;margin:0;text-align:left;max-width:120px;white-space:pre-wrap;word-break:break-all}
.col{width:120px}
</style></head><body>${col}</body></html>`;

const htmlPath = join(root, 'tools', '_eat-icon-preview.html');
writeFileSync(htmlPath, html);

const cdpPort = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(tmpdir(), 'mochi-eaticom-' + Date.now()),
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
  throw new Error('cannot connect');
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r && r.result ? r.result.value : null;
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 300, deviceScaleFactor: 2, mobile: false });
await cdp('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
await sleep(900);

// 几何边界：每条 path 的 getBBox（不含描边宽度）必须落在 [1.2, 22.8] 内（描边半宽≈0.85 + 余量）
for (let i = 0; i < names.length; i++) {
  const key = names[i];
  const bb = await evalJs(`(function(){
    var z=document.querySelectorAll('.zoom svg')[${i}];
    var b=z.getBBox(); var out={x:b.x.toFixed(2),y:b.y.toFixed(2),x2:(b.x+b.width).toFixed(2),y2:(b.y+b.height).toFixed(2)};
    out.ok=(b.x>=1.2&&b.y>=1.2&&(b.x+b.width)<=22.8&&(b.y+b.height)<=22.8);
    return JSON.stringify(out);})()`);
  await evalJs(`document.getElementById('bb-${i}').textContent='${key}: ${bb}'`);
  console.log(key, bb);
}

const shot = await cdp('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(root, 'tools', 'eat-icon-preview.png'), Buffer.from(shot.data, 'base64'));
console.log('saved tools/eat-icon-preview.png');

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
process.exit(0);

// ===== 验证：#148 防骗+署名禁倒卖声明「运行时回填」（防倒卖核心机制） =====
// 回归背景：
//   1) 置顶声明是二传者最想删的内容——静态 DOM 可被从二传部署里删掉/改掉；
//   2) 该回填机制 f7a8b5c 首建后曾被 0965278 清理整块移除（修复被并行会话覆盖实例）。
// 机制（clock.js 顶部 IIFE）：JS 常量兜底 + fetch 官方 notice.json(alert/alert2) 强刷
//   「开屏两条置顶声明 data-anti-scam=1/2 + 设置页 set-alert」；缺失重建插最顶、
//   文案被改（标题+全部特征词 marks 不在位）重写回官方版。
// 用例（模拟二传者各种删改手段）：
//   1) 官方正常加载：两条置顶条在最顶、文案官方版、设置页声明含署名禁倒卖句
//   2) 静态条被整体删除（二传改 HTML）→ 回填重建两条到最顶
//   3) 静态条文案被篡改成收费内容 → 回填重写回官方版
//   4) 官方 notice.json 不可达（断网/被墙）→ 静态兜底仍在
//   5) 删条+断网叠加（离线二传副本）→ 仍从 JS 常量重建
// 用法：node tools/verify-anti-scam-backfill.mjs（需先 node build.mjs，需本机 Chrome/Edge；
//       用例 4/5 会真实拦截 ling233330-star.github.io 请求，不依赖外网）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
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
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

// —— 模拟二传者改副本：对构建产物 index.html 做字符串手术 ——
const RE_B1 = /<div class="splash-alert" data-anti-scam="1">[\s\S]*?<\/p>\s*<\/div>/;
const RE_B2 = /<div class="splash-alert" data-anti-scam="2">[\s\S]*?<\/p>\s*<\/div>/;
const modes = {
  // 删条：整块移除两条静态置顶声明（保留其余页面）
  strip(html) { return html.replace(RE_B1, '').replace(RE_B2, ''); },
  // 篡改文案：标题保留、正文改成收费内容（特征词 全部消失 → marked() 判不在位）
  tamper(html) {
    return html
      .replace(RE_B1, '<div class="splash-alert" data-anti-scam="1">\n          <div class="splash-alert-t">防骗提醒</div>\n          <p><strong>Mochi字卡高级版每月收费。</strong>购买后解锁全部功能与隐藏字卡。</p>\n        </div>')
      .replace(RE_B2, '<div class="splash-alert" data-anti-scam="2">\n          <div class="splash-alert-t">转载署名 · 严禁倒卖</div>\n          <p>转发本站链接需付费加入会员群。</p>\n        </div>');
  }
};

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  try {
    const [path, query] = req.url.split('?');
    let p = normalize(join(root, decodeURIComponent(path)));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    let body = readFileSync(p, 'utf8');
    const mode = new URLSearchParams(query || '').get('mode');
    if (p.endsWith('index.html') && mode && modes[mode]) {
      const out = modes[mode](body);
      if (out === body) { res.writeHead(500); res.end('mode surgery no-op'); return; } // 正则失配=产物结构变了，脚本必须红
      body = out;
    }
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = Number(process.env.MOCHI_CDP_PORT) || (9900 + Math.floor(Math.random() * 100));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-verify-backfill-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });

let ws = null, msgId = 0, eventHandler = null;
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
          if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
          if (m.method && eventHandler) eventHandler(m.method, m.params);
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
async function ev(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return { __err: String(r.exceptionDetails.text || '') };
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}
const results = [];
function check(desc, ok, detail) { results.push({ desc, ok: !!ok }); console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : '')); }

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function waitReady() {
  await sleep(2000);
  for (let i = 0; i < 40; i++) { if (await ev('!!window.__mochiDataReady')) break; await sleep(250); }
  await ev("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();var s=document.getElementById('splash');if(s&&!s.classList.contains('hide')){s.classList.add('hide');s.hidden=true;}return true;})()");
  await sleep(800);
}
async function load(mode) {
  await cdp('Page.navigate', { url: baseUrl + '/index.html' + (mode ? '?mode=' + mode : '') });
  await waitReady();
}
async function waitCond(expr, timeout = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (await ev(expr)) return true;
    if (Date.now() - t0 > timeout) return false;
    await sleep(250);
  }
}

const B1_OK = "(function(){var b=document.querySelector('#splash-notice .splash-alert[data-anti-scam=\"1\"]');var t=(b?b.textContent:'').replace(/\\s+/g,'');return !!b&&t.indexOf('防骗提醒')>-1&&t.indexOf('免费')>-1&&t.indexOf('诈骗')>-1&&t.indexOf('小红书@言序（1842523578）')>-1;})()";
const B2_OK = "(function(){var b=document.querySelector('#splash-notice .splash-alert[data-anti-scam=\"2\"]');var t=(b?b.textContent:'').replace(/\\s+/g,'');return !!b&&t.indexOf('转载署名')>-1&&t.indexOf('署名')>-1&&t.indexOf('倒卖')>-1&&t.indexOf('小红书@言序（1842523578）')>-1;})()";
const B1_TOP = "(function(){var n=document.getElementById('splash-notice');var b=document.querySelector('#splash-notice .splash-alert[data-anti-scam=\"1\"]');return !!b&&n.firstElementChild===b;})()";
const SET_OK = "(function(){var b=document.querySelector('#page-setting .set-alert');var t=b?b.textContent:'';return !!b&&t.indexOf('小红书@言序（1842523578）')>-1&&t.indexOf('免费')>-1&&t.indexOf('倒卖')>-1;})()";
// 拦截官方 notice.json（模拟二传副本断网/官方源不可达）
async function blockOfficial(on) {
  if (on) {
    await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://ling233330-star.github.io/*', requestStage: 'Request' }] });
    eventHandler = (method, params) => {
      if (method === 'Fetch.requestPaused') cdp('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Aborted' });
    };
  } else {
    eventHandler = null;
    await cdp('Fetch.disable');
  }
}

// ============ 用例 1：官方正常加载 ============
console.log('\n===== 用例1 官方正常加载：两条置顶声明在最顶 =====');
await load();
check('防骗置顶条在位且文案官方版', await waitCond(B1_OK));
check('署名禁倒卖置顶条在位且文案官方版', await waitCond(B2_OK));
check('防骗条位于公告区最顶（第一个元素子节点）', await ev(B1_TOP) === true);
check('设置页底部声明含署名+免费+禁倒卖', await waitCond(SET_OK));

// ============ 用例 2：二传副本删掉静态置顶条 → 回填重建 ============
console.log('\n===== 用例2 二传副本删条 → 重建到最顶 =====');
await load('strip');
check('删除后回填重建防骗条且文案官方版', await waitCond(B1_OK));
check('删除后回填重建署名禁倒卖条且文案官方版', await waitCond(B2_OK));
check('重建的防骗条插回公告区最顶', await ev(B1_TOP) === true);

// ============ 用例 3：二传副本篡改文案 → 重写回官方版 ============
console.log('\n===== 用例3 二传副本篡改成收费文案 → 重写官方版 =====');
await load('tamper');
check('防骗条被重写回官方版（收费篡改文案被清除）', await waitCond(B1_OK + "&&(document.querySelector('#splash-notice .splash-alert[data-anti-scam=\"1\"]').textContent.indexOf('高级版')===-1)"));
check('署名条被重写回官方版（会员群篡改文案被清除）', await waitCond(B2_OK + "&&(document.querySelector('#splash-notice .splash-alert[data-anti-scam=\"2\"]').textContent.indexOf('会员群')===-1)"));

// ============ 用例 4：官方 notice.json 不可达 → 静态兜底仍在 ============
console.log('\n===== 用例4 官方源不可达（拦截 ling233330-star.github.io）→ 兜底在位 =====');
await blockOfficial(true);
await load();
check('官方源失败后防骗条仍在（静态兜底）', await waitCond(B1_OK));
check('官方源失败后署名禁倒卖条仍在（静态兜底）', await waitCond(B2_OK));

// ============ 用例 5：删条+断网叠加 → JS 常量重建 ============
console.log('\n===== 用例5 离线二传副本删条 → JS 常量重建 =====');
await load('strip');
check('断网+删条后防骗条仍被重建（常量兜底）', await waitCond(B1_OK));
check('断网+删条后署名条仍被重建（常量兜底）', await waitCond(B2_OK));
await blockOfficial(false);

const passN = results.filter(r => r.ok).length;
console.log('\n===== 结果: ' + passN + '/' + results.length + ' =====');
try { chrome.kill(); } catch (e) {}
server.close();
process.exit(passN === results.length ? 0 : 1);

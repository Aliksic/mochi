// ===== 深色模式全功能颜色审计 =====
// 用法：node build.mjs && node tools/dark-audit.mjs
// 需要：Node 21+（fetch/WebSocket）+ 本机 Chrome/Edge（可用 CHROME_PATH 指定）
// 输出：
//   控制台：每步问题计数摘要 + 高危问题明细
//   tools/dark-audit-report.json：全部问题明细（步骤/选择器/类型/颜色/对比度）
//   tools/dark-audit/*.png：每步截图（供人工目检）
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    const p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = 9700 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-dark-audit-' + Date.now()),
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
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(1500);
await evalJs("(function(){try{localStorage.setItem('xy-home-v2:theme-mode','dark')}catch(e){};return 1})()");
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var ok=document.getElementById('splash-confirm-ok');if(ok)ok.click();c.hidden=true;}return 1;})()");
await sleep(900);

console.log('theme =', await evalJs("document.documentElement.getAttribute('data-theme')"));

// 注入审计函数
const fnSrc = readFileSync(join(root, 'tools', 'dark-audit-fn.js'), 'utf8');
await evalJs(fnSrc);

// 种入少量聊天消息（让聊天页有气泡/时间戳可审计）
await evalJs("(function(){try{window.chatAddSystem&&chatAddSystem('【审计】系统消息样例');}catch(e){} try{window.chatAddIn&&chatAddIn('这是联系人消息样例 hello~');}catch(e){} return 1})()");
await sleep(400);

mkdirSync(join(root, 'tools', 'dark-audit'), { recursive: true });
const report = [];
let stepIdx = 0;

async function auditStep(name, openJs, waitMs) {
  stepIdx++;
  const tag = String(stepIdx).padStart(2, '0') + '-' + name;
  if (openJs) await evalJs(openJs);
  await sleep(waitMs || 700);
  const issues = JSON.parse(await evalJs('JSON.stringify(window.__darkAudit())') || '[]');
  const vis = await evalJs('window.__darkVisibleInfo()');
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(root, 'tools', 'dark-audit', tag + '.png'), Buffer.from(shot.data, 'base64'));
  report.push({ step: tag, visible: vis, issues });
  const hi = issues.filter((x) => x.level === 'high');
  console.log('[ ' + tag + ' ] vis=' + vis + ' | issues=' + issues.length + ' (high=' + hi.length + ')');
  hi.slice(0, 6).forEach((x) => console.log('    HIGH ' + x.type + '  ' + x.sel + '  {' + x.detail + '}'));
  await evalJs('window.__darkReset()');
  await sleep(120);
}

// ---------- A. 动态扫桌面图标（含 JS 渲染的第二三页 app） ----------
const apps = JSON.parse(await evalJs(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.app[data-app]'),function(a){return a.getAttribute('data-app');}).filter(function(v,i,arr){return ['main','p2','p3','tp-page'].indexOf(v)<0&&arr.indexOf(v)===i;}))`) || '[]');
console.log('发现桌面 app：', apps.join(', '));
for (const app of apps) {
  await auditStep('app-' + app,
    `(function(){__darkReset();var el=document.querySelector('.app[data-app="${app}"]');if(!el)return 0;el.click();return 1;})()`, 800);
}

// ---------- B. 直接展示的静态页面（设置树 / 字卡库树等无桌面入口的页面） ----------
const pages = ['page-setting', 'page-about', 'page-license', 'page-reply-settings', 'page-call-settings',
  'page-sfx-settings', 'page-chatcard', 'page-custom-cards', 'page-default-cards', 'page-mood-cards',
  'page-reply-cards', 'page-quote-cards', 'page-checkin-cards', 'page-ta-ask', 'page-ta-choose',
  'page-ta-curious', 'page-ta-roast', 'page-ta-checkin', 'page-fav', 'page-fav-settings', 'page-memory',
  'page-stats', 'page-interact', 'page-accounting', 'page-garden', 'page-divine', 'page-music',
  'page-calendar', 'page-period', 'page-home', 'page-mail', 'page-mail-write', 'page-mail-reply',
  'page-feed', 'page-feed-all', 'page-feed-friends', 'page-checkin', 'page-chat-settings',
  'page-group-chat', 'page-chat'];
for (const pid of pages) {
  await auditStep(pid.replace(/^page-/, ''),
    `(function(){__darkReset();var p=document.getElementById('${pid}');if(!p)return 0;p.hidden=false;return 1;})()`, 600);
}

// ---------- C. 设置页入口点击链（真实导航，带渲染） ----------
const rowSteps = [
  ['row-appearance', 'nav-theme'],
  ['row-general', 'nav-reply-settings'],
  ['row-call-settings', 'nav-call-settings'],
  ['row-sfx-settings', 'nav-sfx-settings'],
  ['row-about', 'nav-about'],
  ['row-license', 'nav-license'],
  ['row-contacts', 'nav-contacts-manage'],
];
for (const [rowId, name] of rowSteps) {
  await auditStep(name,
    `(function(){__darkReset();document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-setting');});var r=document.getElementById('${rowId}');if(!r)return 0;r.click();return 1;})()`, 800);
}

// ---------- D. 聊天页浮层（强制显示） ----------
await auditStep('base-chat', `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;return 1;})()`, 600);
const floatSels = ['#emoji-panel', '#chat-more-panel', '#chat-search', '#msg-actions'];
for (const s of floatSels) {
  await auditStep('float-' + s.slice(1),
    `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;var e=document.querySelector('${s}');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
}
// 聊天更多功能里的半框面板（先开更多面板再点对应按钮更真实，这里直接强制显示）
const halfPanels = ['#chat-gift-panel', '#chat-call-panel', '#chat-decision-panel', '#chat-divine-panel',
  '#chat-rps-panel', '#chat-snake-panel', '#chat-pong-panel', '#ck-panel', '#loc-panel',
  '#qa-mask', '#tc-mask', '#poke-card', '#avlib-card'];
for (const s of halfPanels) {
  await auditStep('panel-' + s.slice(1),
    `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;var e=document.querySelector('${s}');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
}

// ---------- E. 其他浮层 ----------
await auditStep('modal-sample',
  "(function(){__darkReset();try{window.openModal&&openModal('深色审计','示例内容文本',null,{});}catch(e){}return 1;})()", 600);
await auditStep('feed-comment',
  `(function(){__darkReset();var p=document.getElementById('page-feed');if(p)p.hidden=false;var e=document.querySelector('#feed-comment-panel');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
await auditStep('gc-settings',
  `(function(){__darkReset();var p=document.getElementById('page-group-chat');if(p)p.hidden=false;var e=document.querySelector('#gc-settings-panel');if(e)e.hidden=false;var e2=document.querySelector('.gc-settings-panel');if(e2&&!e)e2.style.display='block';return 1;})()`, 500);

// ---------- E2. body 级弹窗与遗漏浮层（联系人管理/红包/批量导入/图片查看/字卡分组管理等） ----------
await auditStep('contact-manager',
  "(function(){__darkReset();try{window.openContactManager&&window.openContactManager();}catch(e){}return 1;})()", 700);
await auditStep('chat-rp-panel',
  `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;var e=document.querySelector('#chat-rp-panel');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
await auditStep('batch-panel',
  `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;var e=document.querySelector('#batch-panel');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
await auditStep('img-view-mask',
  `(function(){__darkReset();var p=document.getElementById('page-chat');if(p)p.hidden=false;var e=document.querySelector('#img-view-mask');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
await auditStep('cc-mg-mask',
  `(function(){__darkReset();var p=document.getElementById('page-custom-cards');if(p)p.hidden=false;var e=document.querySelector('#cc-mg-mask');if(!e)return 0;e.hidden=false;e.style.display='flex';return 1;})()`, 500);
await auditStep('cc-export-mask',
  `(function(){__darkReset();var p=document.getElementById('page-custom-cards');if(p)p.hidden=false;var e=document.querySelector('#cc-export-mask');if(!e)return 0;e.hidden=false;return 1;})()`, 500);
await auditStep('desk-lib',
  `(function(){__darkReset();var e=document.querySelector('.desk-lib');if(!e)return 0;e.hidden=false;e.style.display='block';return 1;})()`, 500);

// ---------- F. 周期日详情弹层（若可触发） ----------
await auditStep('period-daypop',
  `(function(){__darkReset();var p=document.getElementById('page-period');if(!p)return 0;p.hidden=false;var d=document.querySelector('.cal-day:not(.empty),.dp-day,.period-day');if(d)d.click();return 1;})()`, 700);

writeFileSync(join(root, 'tools', 'dark-audit-report.json'), JSON.stringify(report, null, 1));
const totalIssues = report.reduce((s, r) => s + r.issues.length, 0);
const totalHigh = report.reduce((s, r) => s + r.issues.filter((x) => x.level === 'high').length, 0);
console.log('\n==== 汇总 ====');
console.log('步骤数：' + report.length + '  问题总数：' + totalIssues + '  高危：' + totalHigh);
console.log('报告：tools/dark-audit-report.json  截图：tools/dark-audit/*.png');

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(0);

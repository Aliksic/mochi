// ===== 诊断：滚动锁（body.scroll-lock）全流程扫查 =====
// 依次走常用开/关流程（字卡库各管理页含新「TA的查岗」、聊天面板、弹窗、经期弹层），
// 每步结束后检查：① body 是否残留 scroll-lock；② 哪些浮层 !hidden；
// ③ 程序化 scrollTop 是否还能生效（页面未被 overflow:hidden 冻结）。
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
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-lockflow-' + Date.now()), '--remote-debugging-port=' + cdpPort, 'about:blank'], { stdio: 'ignore' });

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

let bad = 0;
async function checkpoint(name) {
  await sleep(250);
  const st = await evalJs("(function(){\n  var p = document.getElementById('page-chatcard');\n  var FLOAT=['#tc-mask','#cc-export-mask','#cc-scope-mask','#call-mask','#feed-notice-panel','#feed-comment-panel','#poke-card','#emoji-panel','#chat-ask-panel','#qa-mask','#chat-more-panel','#gc-more-panel','#chat-search','#chat-decision-panel','#chat-divine-panel','#chat-rps-panel','#chat-call-panel','#chat-pong-panel','#chat-snake-panel','#chat-gift-panel','#avlib-card','#ck-panel','#loc-panel','.mg-mask','#modal-mask','#msg-actions','#desk-image-viewer','.desk-lib','#gc-members-panel','#gc-at-panel','#gc-settings-panel'];\n  var open=[];\n  FLOAT.forEach(function(sel){ try{ var el=document.querySelector(sel); if(el&&!el.hidden&&el.getClientRects().length>0) open.push(sel);}catch(e){} });\n  ['period-day-pop','period-care-pop','period-report-pop','period-settings-pop','period-notify-pop'].forEach(function(id){ var el=document.getElementById(id); if(el) open.push('#'+id); });\n  var canScroll = true;\n  try { var target = document.getElementById('page-chatcard'); p.scrollTop = 60; canScroll = p.scrollTop === 60 || target.scrollHeight <= target.clientHeight; p.scrollTop = 0; } catch(e){}\n  return { name: '" + name + "', lock: document.body.classList.contains('scroll-lock'), open: open, canScroll: canScroll };\n})()");
  const okFlag = st && ((st.lock === false && st.open.length === 0 && st.canScroll === true) || (st.lock === true && st.open.length > 0));
  if (!okFlag) bad++;
  console.log((okFlag ? 'PASS ' : 'FAIL ') + name + '  lock=' + (st && st.lock) + ' open=' + JSON.stringify(st && st.open) + ' canScroll=' + (st && st.canScroll));
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
  await sleep(500);

  // 进字卡库
  await evalJs("(function(){var t=document.querySelector('.tab[data-page=\"page-chatcard\"]');if(t)t.click();return true;})()");
  await checkpoint('进字卡库');

  // 新增：TA的查岗 主入口 + 我的添加入口 + 返回
  await evalJs("(function(){var e=document.getElementById('li-ta-checkin');if(e)e.click();return true;})()");
  await checkpoint('TA的查岗·系统预设页');
  await evalJs("(function(){var b=document.getElementById('ckq-back');if(b)b.click();return true;})()");
  await checkpoint('查岗管理页返回');
  await evalJs("(function(){var e=document.getElementById('li-ta-checkin-mine');if(e)e.click();return true;})()");
  await checkpoint('TA的查岗·我的添加页');
  // 我的添加里点「新建分组」（走 cardGroups.addFlow → openModal），再取消
  await evalJs("(function(){var b=document.getElementById('ckq-grp-add');if(b)b.click();return true;})()");
  await checkpoint('查岗·新建分组弹窗打开');
  await evalJs("(function(){var m=document.getElementById('modal-mask');var c=m&&m.querySelector('.modal-cancel');if(c)c.click();else if(m)m.hidden=true;return true;})()");
  await checkpoint('查岗·新建分组弹窗关闭');
  // 批量导入空提交（toast 路径）
  await evalJs("(function(){var b=document.getElementById('ckq-batch-add');if(b)b.click();return true;})()");
  await checkpoint('查岗·批量导入空提交');
  await evalJs("(function(){var b=document.getElementById('ckq-back');if(b)b.click();return true;})()");
  await checkpoint('我的添加页返回');

  // 兄弟库对照：TA的询问
  await evalJs("(function(){var e=document.getElementById('li-ta-ask');if(e)e.click();return true;})()");
  await checkpoint('TA的询问管理页');
  await evalJs("(function(){var b=document.getElementById('ta-ask-back');if(b)b.click();return true;})()");
  await checkpoint('TA的询问返回');

  // 默认字卡页（历史上出过滑动 bug）
  await evalJs("(function(){var e=document.getElementById('li-default-cards');if(e)e.click();return true;})()");
  await checkpoint('默认聊天字卡页');
  await evalJs("(function(){var b=document.getElementById('dc-back');if(b)b.click();return true;})()");
  await checkpoint('默认字卡返回');

  // 聊天页浮层：更多面板 / 表情包 / 拍一拍
  await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=true});var t=document.querySelector('.tab[data-page=\"page-chat\"]');if(t)t.click();return true;})()");
  await sleep(300);
  await evalJs("(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();return true;})()");
  await checkpoint('聊天·更多面板打开');
  await evalJs("(function(){var p=document.getElementById('chat-more-panel');if(p)p.hidden=true;return true;})()");
  await checkpoint('聊天·更多面板关闭');
  await evalJs("(function(){var b=document.getElementById('emoji-btn');if(b)b.click();return true;})()");
  await checkpoint('表情包面板打开');
  await evalJs("(function(){var p=document.getElementById('emoji-panel');if(p){p.hidden=true;}return true;})()");
  await checkpoint('表情包面板关闭');

  // 经期弹层（动态创建 + 手动锁）
  await evalJs("(function(){try{ if(typeof window.openPeriodDayPop==='function'){window.openPeriodDayPop(new Date());} else { document.querySelectorAll('.page').forEach(function(p){p.hidden=true}); var t=document.querySelector('.tab[data-page=\"page-chatcard\"]'); if(t) t.click(); } }catch(e){} return true; })()");
  await sleep(300);
  const periodPop = await evalJs("({ has: !!document.getElementById('period-day-pop'), fn: typeof window.openPeriodDayPop })");
  console.log('经期日弹层探测:', JSON.stringify(periodPop));
  await evalJs("(function(){var p=document.getElementById('period-day-pop');if(p)p.remove();document.body.classList.remove('scroll-lock');return true;})()");
  await checkpoint('经期清理兜底');

  console.log(bad === 0 ? '\n全部通过：无滚动锁残留' : '\n发现 ' + bad + ' 个异常检查点');
} finally {
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

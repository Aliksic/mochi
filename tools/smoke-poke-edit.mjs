// ===== 专项验证：拍一拍面板「我的拍一拍」字卡修改/删除（v3.7.x） =====
// 链路：进聊天页 → 更多 → 拍一拍 → 切「我的拍一拍」tab → 用户分组字卡显示 ✎/✕ 按钮
//       （预设字卡不显示）→ 点 ✎ 弹修改框（预填原文字）→ 改后保存生效 →
//       点 ✕ 弹删除确认 → 确认后字卡消失 → 无 JS 异常。
// 需要 Node 21+ + 本机 Chrome/Edge；找不到时用 CHROME_PATH 指定。
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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

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
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-poke-edit-' + Date.now()),
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

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

// 测试种子：我的拍一拍·用户分组（应用启动前注入 localStorage）
const SEED = JSON.stringify([
  ['我的新增', ['拍了拍你的小脸', '戳了戳你的酒窝']],
  ['撒娇专用', ['蹭了蹭你的肩膀', '轻轻捏了捏你的手']]
]);

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});})()" });
// 应用启动前注入用户分组测试数据（我的拍一拍），保证 pokeUserGroups 初始化即读到
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('xy-home-v2:default:poke-groups-mine'," + JSON.stringify(SEED) + ");" });

// 进入应用：开屏 → 确认层 → 桌面
async function enterApp() {
  await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();return true;})()");
  await sleep(400);
  await evalJs("(function(){var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var b=c.querySelector('#splash-confirm-ok');if(b)b.click();}return true;})()");
  await sleep(900);
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();

// 进聊天页
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(900);
check('聊天页已进入', await evalJs("(function(){var p=document.getElementById('page-chat');return !!p&&!p.hidden&&!!document.getElementById('chat-input');})()"));

// ---- 前置：注入用户分组测试数据（我的拍一拍），绕过 UI 新增 ----
// 打开更多 → 拍一拍
await evalJs("(function(){var b=document.getElementById('chat-more-btn');if(!b){b=document.querySelector('.chat-more, #chat-more, [id*=more]');}if(b){b.click();return true;}return false;})()");
await sleep(400);
check('更多面板已打开', await evalJs("(function(){var m=document.getElementById('chat-more-panel');return !!m&&!m.hidden;})()"));
await evalJs("(function(){var b=document.getElementById('more-poke');if(b)b.click();return true;})()");
await sleep(400);
check('拍一拍面板已打开', await evalJs("(function(){var p=document.getElementById('poke-card');return !!p&&!p.hidden;})()"));

// 切到「我的拍一拍」tab
await evalJs("(function(){var b=document.querySelector('.poke-tab-mine');if(b)b.click();return true;})()");
await sleep(300);
const tabState = JSON.parse(await evalJs("(function(){return JSON.stringify({mineSel:!!document.querySelector('.poke-tab-mine.sel'),toolsHidden:document.querySelector('.poke-tools').hidden});})()") || '{}');
check('我的拍一拍 tab 选中且工具行显示', tabState.mineSel === true && tabState.toolsHidden === false);

// ---- 用例 1：用户分组字卡显示 ✎/✕，预设字卡不显示 ----
// 先切到用户分组「我的新增」
await evalJs("(function(){var chips=Array.from(document.querySelectorAll('.poke-groups .emoji-g-chip'));var c=chips.find(function(x){return x.textContent.indexOf('我的新增')>=0;});if(c)c.click();return true;})()");
await sleep(300);
const c1 = JSON.parse(await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item'));var withOps=items.filter(function(x){return !!x.querySelector('.poke-card-ops');});var texts=items.map(function(x){return x.querySelector('.cc-txt .t').textContent;});return JSON.stringify({count:items.length,withOps:withOps.length,texts:texts});})()") || '{}');
check('用户分组「我的新增」显示 2 张字卡', c1.count === 2, 'count=' + c1.count);
check('用户分组字卡全部带 ✎/✕ 按钮', c1.withOps === 2, 'withOps=' + c1.withOps);

// 切到预设分组
await evalJs("(function(){var chips=Array.from(document.querySelectorAll('.poke-groups .emoji-g-chip'));var c=chips.find(function(x){return x.textContent.indexOf('预设')>=0;});if(c)c.click();return true;})()");
await sleep(300);
const c2 = JSON.parse(await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item'));var withOps=items.filter(function(x){return !!x.querySelector('.poke-card-ops');});return JSON.stringify({count:items.length,withOps:withOps.length});})()") || '{}');
check('预设分组字卡无 ✎/✕ 按钮（只读）', c2.count > 0 && c2.withOps === 0, 'count=' + c2.count + ' withOps=' + c2.withOps);

// ---- 用例 2：✎ 修改 —— 弹修改框预填原文字 → 改后保存生效 ----
await evalJs("(function(){var chips=Array.from(document.querySelectorAll('.poke-groups .emoji-g-chip'));var c=chips.find(function(x){return x.textContent.indexOf('我的新增')>=0;});if(c)c.click();return true;})()");
await sleep(300);
await evalJs("(function(){var b=document.querySelector('#poke-list .cc-item .poke-op-edit');if(b)b.click();return true;})()");
await sleep(400);
const c3 = JSON.parse(await evalJs("(function(){var m=document.getElementById('modal-mask');var i=document.getElementById('modal-input');return JSON.stringify({open:!m.hidden,title:document.getElementById('modal-title').textContent,val:i.value});})()") || '{}');
check('点 ✎ 弹出修改框且预填原文字', c3.open === true && c3.title.indexOf('修改拍一拍') >= 0 && c3.val === '拍了拍你的小脸', 'val=' + c3.val);
await evalJs("(function(){var i=document.getElementById('modal-input');i.value='拍了拍你的小脸（已修改）';document.getElementById('modal-ok').click();return true;})()");
await sleep(400);
const c4 = JSON.parse(await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item .cc-txt .t'));var texts=items.map(function(x){return x.textContent;});var stored=window.activeStore().get('poke-groups-mine');return JSON.stringify({texts:texts,stored:stored});})()") || '{}');
check('修改后列表显示新文字', c4.texts.indexOf('拍了拍你的小脸（已修改）') >= 0 && c4.texts.indexOf('拍了拍你的小脸') < 0, c4.texts.join('|'));
check('修改已持久化到存储', c4.stored.indexOf('拍了拍你的小脸（已修改）') >= 0);

// ---- 用例 3：✕ 删除 —— 弹确认框 → 确认后字卡消失（删第 2 张） ----
await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item'));var t=items.find(function(x){return x.querySelector('.cc-txt .t').textContent.indexOf('戳了戳你的酒窝')>=0;});var b=t?t.querySelector('.poke-op-del'):null;if(b)b.click();return true;})()");
await sleep(400);
const c5 = JSON.parse(await evalJs("(function(){var m=document.getElementById('modal-mask');return JSON.stringify({open:!m.hidden,title:document.getElementById('modal-title').textContent,staticTxt:document.getElementById('modal-static').textContent});})()") || '{}');
check('点 ✕ 弹出删除确认框（含字卡内容）', c5.open === true && c5.title.indexOf('删除') >= 0 && c5.staticTxt.indexOf('戳了戳你的酒窝') >= 0, c5.staticTxt.split('\n')[0]);
await evalJs("(function(){document.getElementById('modal-ok').click();return true;})()");
await sleep(400);
const c6 = JSON.parse(await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item .cc-txt .t'));var texts=items.map(function(x){return x.textContent;});var stored=window.activeStore().get('poke-groups-mine');return JSON.stringify({texts:texts,stored:stored});})()") || '{}');
check('删除后列表少一张字卡且内容正确', c6.texts.length === 1 && c6.texts[0] === '拍了拍你的小脸（已修改）', c6.texts.join('|'));
check('删除已持久化到存储', c6.stored.indexOf('戳了戳你的酒窝') < 0);

// ---- 用例 4：修改时内容为空被拦截（弹窗关闭，字卡内容不变，按全站 openModal 惯例 toast 提示） ----
await evalJs("(function(){var b=document.querySelector('#poke-list .cc-item .poke-op-edit');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var i=document.getElementById('modal-input');i.value='   ';document.getElementById('modal-ok').click();return true;})()");
await sleep(300);
const c7 = JSON.parse(await evalJs("(function(){var items=Array.from(document.querySelectorAll('#poke-list .cc-item .cc-txt .t'));var texts=items.map(function(x){return x.textContent;});var m=document.getElementById('modal-mask');return JSON.stringify({texts:texts,modalClosed:m.hidden,toast:!!document.querySelector('.toast')});})()") || '{}');
check('空内容修改被拦截（字卡内容不变）', c7.modalClosed === true && c7.texts.length === 1 && c7.texts[0] === '拍了拍你的小脸（已修改）', c7.texts.join('|'));

// ---- 用例 5：无 JS 异常 ----
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);
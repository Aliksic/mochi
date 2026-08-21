// ===== 专项验证：群聊形象设置（v3.9.x 右上角三点菜单 → 群聊设置） =====
// 链路：进群聊页 → 三点菜单（群成员/群聊设置）→ 群聊设置面板（我的群聊 + 成员群聊形象）→
//       设置成员/我的群聊昵称与头像 → 设置面板/成员面板/@提及 生效 → 重置回退桌面 → 持久化 + 迁移排除 → 无 JS 异常。
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gcprof-' + Date.now()),
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

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});})()" });

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

// ---- 开启群聊（聊天设置开关），返回桌面进入群聊页 ----
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(700);
await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var cb=document.getElementById('sf-group-chat');if(cb){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()");
await sleep(500);
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(500);
await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');if(gc)gc.click();return true;})()");
await sleep(700);
check('群聊页已进入', await evalJs("(function(){var p=document.getElementById('page-group-chat');return !!p&&!p.hidden;})()"));

// ---- 用例 1：右上角三点菜单 ----
await evalJs("(function(){var b=document.getElementById('gc-more-btn');if(b)b.click();return true;})()");
await sleep(300);
const menuOk = await evalJs("(function(){var m=document.getElementById('gc-more-menu');var a=document.getElementById('gc-more-members');var s=document.getElementById('gc-more-settings');return !!m&&!m.hidden&&!!a&&!!s;})()");
check('三点菜单可打开且含「群成员/群聊设置」', menuOk === true);
await evalJs("(function(){var m=document.getElementById('gc-more-menu');if(m&&!m.hidden){m.hidden=true;}return true;})()");

// ---- 用例 2：群聊设置面板结构与我的/成员行 ----
await evalJs("(function(){var b=document.getElementById('gc-more-btn');if(b)b.click();return true;})()");
await sleep(250);
await evalJs("(function(){var b=document.getElementById('gc-more-settings');if(b)b.click();return true;})()");
await sleep(400);
const sp = JSON.parse(await evalJs("(function(){var p=document.getElementById('gc-settings-panel');if(!p)return '{}';var items=document.querySelectorAll('#gc-set-body .gc-set-item');var titles=Array.from(document.querySelectorAll('#gc-set-body .gc-set-title')).map(function(t){return t.textContent;});var rows=Array.from(items).map(function(r){var n=r.querySelector('.gc-set-name');var d=r.querySelector('.gc-set-desk');return {name:n?n.textContent.trim():'',desk:d?d.textContent.trim():''};});return JSON.stringify({open:!p.hidden,count:items.length,titles:titles,rows:rows,note:!!document.querySelector('#gc-set-body .gc-set-note')});})()") || '{}');
check('群聊设置面板已打开', sp.open === true);
check('设置面板含「我的群聊」「成员群聊形象」区块', Array.isArray(sp.titles) && sp.titles.indexOf('我的群聊') >= 0 && sp.titles.indexOf('成员群聊形象') >= 0, JSON.stringify(sp.titles));
check('设置面板行数 = 我 + 成员（≥2）', (sp.count || 0) >= 2, 'count=' + sp.count);
check('我的行显示「跟随桌面」', sp.rows && sp.rows.length > 0 && sp.rows[0].name.indexOf('跟随桌面') >= 0, JSON.stringify(sp.rows && sp.rows[0]));
check('成员行显示桌面原昵称副行（区分用）', sp.rows && sp.rows.length > 1 && sp.rows[1].desk.indexOf('桌面昵称：') === 0, JSON.stringify(sp.rows && sp.rows[1]));
check('设置面板底部有字卡库说明', sp.note === true);

// ---- 用例 3：设置成员群聊昵称 → 设置面板/成员面板/@提及 生效 ----
await evalJs("(function(){if(window.groupChatProfileSet)window.groupChatProfileSet('default','小美',undefined);return true;})()");
await sleep(300);
const nmApplied = await evalJs("(function(){var items=document.querySelectorAll('#gc-set-body .gc-set-item');var hit=null;items.forEach(function(r){var n=r.querySelector('.gc-set-name');if(n&&n.textContent.trim()==='小美'){hit=r;}});if(!hit)return 'no-row';var d=hit.querySelector('.gc-set-desk');return d?d.textContent.trim():'';})()");
check('成员群聊昵称设为「小美」且桌面原昵称副行保留', typeof nmApplied === 'string' && nmApplied.indexOf('桌面昵称：') === 0, String(nmApplied));

// 成员面板显示群聊昵称 + 副行
await evalJs("(function(){var b=document.getElementById('gc-more-btn');if(b)b.click();return true;})()");
await sleep(250);
await evalJs("(function(){var b=document.getElementById('gc-more-members');if(b)b.click();return true;})()");
await sleep(400);
const mp = JSON.parse(await evalJs("(function(){var items=document.querySelectorAll('#gc-mp-body .gc-mp-item');var out=[];items.forEach(function(r){out.push({name:(r.querySelector('.gc-mp-name')||{}).textContent||'',sub:(r.querySelector('.gc-mp-sub')||{}).textContent||'',av:!!r.querySelector('.gc-mp-av img')});});return JSON.stringify(out);})()") || '[]');
check('成员面板「默认」行显示群聊昵称 小美 + 桌面原昵称副行', mp.length >= 2 && mp[1].name.indexOf('小美') === 0 && mp[1].sub.indexOf('桌面昵称：') === 0, JSON.stringify(mp[1]));

// @提及面板用群聊昵称
await evalJs("(function(){var b=document.getElementById('gc-mp-close');if(b)b.click();return true;})()");
await sleep(300);
await evalJs("(function(){var b=document.getElementById('gc-at-btn');if(b)b.click();return true;})()");
await sleep(400);
const atName = await evalJs("(function(){var items=document.querySelectorAll('#gc-at-body .gc-at-item span');var hit=null;items.forEach(function(s){if(s.textContent.indexOf('小美')===0)hit=s.textContent;});return hit||'no';})()");
check('@提及面板显示群聊昵称 小美', atName === '小美', String(atName));
await evalJs("(function(){var p=document.getElementById('gc-at-panel');if(p)p.hidden=true;return true;})()");

// @群聊昵称 → 该成员必定回复（确定性：gc-rs 1 秒内）
await evalJs("(function(){if(window.saveReplyCfg){window.saveReplyCfg('gc-rs-min',1);window.saveReplyCfg('gc-rs-max',1);}return true;})()");
await sleep(200);
await evalJs("(function(){var i=document.getElementById('gc-input');i.innerText='@小美 在吗';var b=document.getElementById('gc-send');b.click();return true;})()");
let inCount = 0;
for (let i = 0; i < 30; i++) {
  inCount = await evalJs("(function(){var a=document.querySelectorAll('#gc-body .msg-in').length;var p=document.querySelectorAll('#gc-body .msg-poke').length;return a+p;})()") || 0;
  if (inCount >= 1) break;
  await sleep(300);
}
check('@群聊昵称触发该成员回复', inCount >= 1, 'in=' + inCount);

// ---- 用例 4：设置我的群聊昵称 ----
await evalJs("(function(){if(window.groupChatProfileSet)window.groupChatProfileSet('me','小美自己',undefined);return true;})()");
await sleep(300);
const meInPanel = await evalJs("(function(){var p=document.getElementById('gc-settings-panel');if(!p||p.hidden)return 'closed';var items=document.querySelectorAll('#gc-set-body .gc-set-item');if(!items.length)return 'no-row';var n=items[0].querySelector('.gc-set-name');if(!n)return 'no-name';var c=n.cloneNode(true);var tg=c.querySelector('.gc-set-tag');if(tg)tg.remove();return c.textContent.trim();})()");
check('我的群聊昵称设为「小美自己」（设置面板第一行）', meInPanel === '小美自己', String(meInPanel));

// ---- 用例 5：设置成员群聊头像 → 成员面板头像 img 生效 ----
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await evalJs("(function(){if(window.groupChatProfileSet)window.groupChatProfileSet('default',undefined,'" + PNG + "');return true;})()");
await sleep(300);
const avApplied = await evalJs("(function(){var items=document.querySelectorAll('#gc-set-body .gc-set-item');if(items.length<2)return 'no-row';var imgs=items[1].querySelectorAll('.gc-set-av img');return imgs.length&&imgs[0].src.indexOf('data:image')===0?'yes':'no';})()");
check('成员群聊头像已生效（设置面板预览 img）', avApplied === 'yes', String(avApplied));

// ---- 用例 6：重置清除覆盖 → 回退桌面昵称/头像 ----
await evalJs("(function(){if(window.groupChatProfileSet)window.groupChatProfileSet('default','','');return true;})()");
await sleep(300);
const resetOk = JSON.parse(await evalJs("(function(){var p=window.groupChatProfileGet?window.groupChatProfileGet('default'):null;var items=document.querySelectorAll('#gc-set-body .gc-set-item');var name='';if(items.length>1){var n=items[1].querySelector('.gc-set-name');name=n?n.textContent.trim():'';}return JSON.stringify({empty:!!p&&!p.name&&!p.avatar,name:name});})()") || '{}');
check('重置后成员覆盖已清空', resetOk.empty === true, JSON.stringify(resetOk));
check('重置后成员行回退「跟随桌面」', resetOk.name === '跟随桌面', String(resetOk.name));

// ---- 用例 7：持久化 + 迁移排除（root 键存在、未被迁进 default 命名空间） ----
const persist = JSON.parse(await evalJs("(function(){var root=localStorage.getItem('xy-home-v2:gc-profiles');var def=localStorage.getItem('xy-home-v2:default:gc-profiles');var me=null;if(root){try{var o=JSON.parse(root);me=(o.me&&o.me.name)||null;}catch(e){}}return JSON.stringify({root:!!root,def:!!def,me:me});})()") || '{}');
check('gc-profiles 持久化在根命名空间', persist.root === true, JSON.stringify(persist));
check('我的群聊昵称「小美自己」已持久化', persist.me === '小美自己', String(persist.me));
check('gc-profiles 未被 migrateLegacy 迁进 default 桌面', persist.def === false, 'def=' + persist.def);

// ---- 用例 8：刷新后群聊形象仍在（跨桌面/重启不丢） ----
await cdp('Page.reload');
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);
await enterApp();
const afterReload = JSON.parse(await evalJs("(function(){var p=window.groupChatProfileGet?window.groupChatProfileGet('me'):null;var root=localStorage.getItem('xy-home-v2:gc-profiles');var def=localStorage.getItem('xy-home-v2:default:gc-profiles');return JSON.stringify({me:p?(p.name||''):'',root:!!root,def:!!def});})()") || '{}');
check('刷新后我的群聊昵称仍生效', afterReload.me === '小美自己', JSON.stringify(afterReload));
check('刷新后仍只存根命名空间（未迁移）', afterReload.root === true && afterReload.def === false, 'root=' + afterReload.root + ' def=' + afterReload.def);

// ---- 用例 9：无 JS 异常 ----
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);

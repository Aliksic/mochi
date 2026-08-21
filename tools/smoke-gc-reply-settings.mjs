// ===== 专项验证：群聊回复设置（v3.9.x） =====
// 链路：回复设置页有「群聊」tab（4 tab）→ 群聊面板 19 个控件显示默认值 →
//       groupChatCfg() 默认值正确 → 修改后全局存储生效（跨桌面不隔离）→
//       gc-prob=0 静默 / gc-prob=100 全员回复 / @ 成员必定回复 /
//       多字卡回复生效 / 全程无 JS 异常。
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-gcr-' + Date.now()),
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

async function enterReplySettings() {
  await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
  await sleep(600);
  await evalJs("(function(){var b=document.getElementById('chat-settings-btn');if(b)b.click();return true;})()");
  await sleep(400);
  await evalJs("(function(){var b=document.getElementById('row-general');if(b)b.click();return true;})()");
  await sleep(400);
}
async function enableGroupChat() {
  await evalJs("(function(){var cb=document.getElementById('sf-group-chat');if(cb&&!cb.checked){cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()");
  await sleep(400);
}
async function openGroupChatPage() {
  await evalJs("(function(){var gc=document.querySelector('.app[data-app=\"group-chat\"]');if(gc)gc.click();return true;})()");
  await sleep(600);
}
async function sendGroupMsg(txt) {
  await evalJs("(function(){var i=document.getElementById('gc-input');i.innerText=" + JSON.stringify(txt) + ";var b=document.getElementById('gc-send');b.click();return true;})()");
  await sleep(300);
}
async function countInMsgs() {
  return (await evalJs("(function(){return document.querySelectorAll('#gc-body .msg-in').length;})()")) || 0;
}
async function lastInText() {
  return await evalJs("(function(){var bs=document.querySelectorAll('#gc-body .msg-in .msg-bubble span');if(!bs.length)return '';return bs[bs.length-1].textContent;})()") || '';
}

// ==================== 1. 设置页「群聊」tab ====================
await enterReplySettings();
check('回复设置页已进入', await evalJs("(function(){var p=document.getElementById('page-reply-settings');return !!p&&!p.hidden;})()"));
const tabInfo = JSON.parse(await evalJs("(function(){var tabs=[].slice.call(document.querySelectorAll('#page-reply-settings .fav-tab')).map(function(t){return t.dataset.rp;});var groupTab=document.querySelector('#page-reply-settings .fav-tab[data-rp=\"group\"]');var panel=document.querySelector('#page-reply-settings .gs-panel[data-rpanel=\"group\"]');return JSON.stringify({tabs:tabs,hasTab:!!groupTab,panelHidden:panel?panel.hidden:null});})()") || '{}');
check('回复设置页有 4 个 tab（聊天/群聊/信箱/朋友圈）', tabInfo.tabs && tabInfo.tabs.length === 4 && tabInfo.tabs.indexOf('group') === 1, JSON.stringify(tabInfo.tabs));
check('群聊 tab 存在且面板默认隐藏', tabInfo.hasTab === true && tabInfo.panelHidden === true, JSON.stringify({ hasTab: tabInfo.hasTab, panelHidden: tabInfo.panelHidden }));

await evalJs("(function(){var t=document.querySelector('#page-reply-settings .fav-tab[data-rp=\"group\"]');if(t)t.click();return true;})()");
await sleep(300);
const panelShown = await evalJs("(function(){var p=document.querySelector('#page-reply-settings .gs-panel[data-rpanel=\"group\"]');return !!p&&!p.hidden;})()");
check('点击群聊 tab 后面板显示', panelShown === true);

// ==================== 2. 群聊面板控件与默认值 ====================
const ctl = JSON.parse(await evalJs("(function(){var rows=[].slice.call(document.querySelectorAll('#page-reply-settings .gs-panel[data-rpanel=\"group\"] .stepper')).map(function(st){return {k:st.dataset.k,v:st.querySelector('input.stp-val')?st.querySelector('input.stp-val').value:null};});var pyEn=document.getElementById('gc-py-en');var titles=[].slice.call(document.querySelectorAll('#page-reply-settings .gs-panel[data-rpanel=\"group\"] .gs-title')).map(function(t){return t.textContent;});return JSON.stringify({steppers:rows,pyEn:pyEn?pyEn.checked:null,titles:titles});})()") || '{}');
const ks = (ctl.steppers || []).map(s => s.k);
const expectSteppers = ['gc-prob', 'gc-rs-min', 'gc-rs-max', 'gc-reply-min', 'gc-reply-max', 'gc-touch-prob', 'gc-sticker-prob', 'gc-emoji-prob', 'gc-image-prob', 'gc-voice-prob', 'gc-kaomoji-prob', 'gc-quote-prob', 'gc-rc-prob', 'gc-rc-refix', 'gc-py-prob', 'gc-py-min', 'gc-py-max'];
const missing = expectSteppers.filter(k => ks.indexOf(k) < 0);
check('群聊面板含全部 17 个 stepper', missing.length === 0, 'missing=' + missing.join(','));
const vmap = {};
(ctl.steppers || []).forEach(s => { vmap[s.k] = s.v; });
check('默认值：gc-prob=60', vmap['gc-prob'] === '60', vmap['gc-prob']);
check('默认值：gc-rs-min=1 / gc-rs-max=40', vmap['gc-rs-min'] === '1' && vmap['gc-rs-max'] === '40', vmap['gc-rs-min'] + '/' + vmap['gc-rs-max']);
check('默认值：gc-reply-min=1 / gc-reply-max=2', vmap['gc-reply-min'] === '1' && vmap['gc-reply-max'] === '2', vmap['gc-reply-min'] + '/' + vmap['gc-reply-max']);
check('默认值：拍一拍5/表情包10/emoji5/图片5/语音10/颜文字5/引用30/撤回25/补发35',
  vmap['gc-touch-prob'] === '5' && vmap['gc-sticker-prob'] === '10' && vmap['gc-emoji-prob'] === '5' && vmap['gc-image-prob'] === '5' && vmap['gc-voice-prob'] === '10' && vmap['gc-kaomoji-prob'] === '5' && vmap['gc-quote-prob'] === '30' && vmap['gc-rc-prob'] === '25' && vmap['gc-rc-refix'] === '35',
  '5/10/5/5/10/5/30/25/35');
check('默认值：gc-py-prob=50 / gc-py-min=2 / gc-py-max=5', vmap['gc-py-prob'] === '50' && vmap['gc-py-min'] === '2' && vmap['gc-py-max'] === '5', vmap['gc-py-prob'] + '/' + vmap['gc-py-min'] + '/' + vmap['gc-py-max']);
check('默认值：多字卡开关 gc-py-en 开启', ctl.pyEn === true);
check('群聊面板有两个分组标题', (ctl.titles || []).length === 2 && ctl.titles[0].indexOf('被动回复') >= 0 && ctl.titles[1].indexOf('多字卡') >= 0, JSON.stringify(ctl.titles));

// ==================== 3. groupChatCfg() 默认值 ====================
const cfg0 = JSON.parse(await evalJs("(function(){var c=window.groupChatCfg();return JSON.stringify({prob:c['gc-prob'],rsMin:c['gc-rs-min'],rsMax:c['gc-rs-max'],rMin:c['gc-reply-min'],rMax:c['gc-reply-max'],touch:c['gc-touch-prob'],stick:c['gc-sticker-prob'],emoji:c['gc-emoji-prob'],img:c['gc-image-prob'],voice:c['gc-voice-prob'],kao:c['gc-kaomoji-prob'],quote:c['gc-quote-prob'],rc:c['gc-rc-prob'],rcFix:c['gc-rc-refix'],pyEn:c['gc-py-en'],pyProb:c['gc-py-prob'],pyMin:c['gc-py-min'],pyMax:c['gc-py-max']});})()") || '{}');
const exp = { prob: 60, rsMin: 1, rsMax: 40, rMin: 1, rMax: 2, touch: 5, stick: 10, emoji: 5, img: 5, voice: 10, kao: 5, quote: 30, rc: 25, rcFix: 35, pyEn: 1, pyProb: 50, pyMin: 2, pyMax: 5 };
const cfgDiff = Object.keys(exp).filter(k => cfg0[k] !== exp[k]);
check('groupChatCfg() 默认值全部正确', cfgDiff.length === 0, 'diff=' + cfgDiff.join(','));

// ==================== 4. 修改设置 → 全局存储生效 ====================
await evalJs("(function(){window.saveReplyCfg('gc-prob', 100);window.saveReplyCfg('gc-rs-min', 1);window.saveReplyCfg('gc-rs-max', 1);window.saveReplyCfg('gc-reply-min', 1);window.saveReplyCfg('gc-reply-max', 1);window.saveReplyCfg('gc-py-en', 1);window.saveReplyCfg('gc-py-prob', 100);window.saveReplyCfg('gc-py-min', 2);window.saveReplyCfg('gc-py-max', 2);return true;})()");
await sleep(300);
const cfg1 = JSON.parse(await evalJs("(function(){var c=window.groupChatCfg();return JSON.stringify({prob:c['gc-prob'],rsMin:c['gc-rs-min'],rsMax:c['gc-rs-max'],pyEn:c['gc-py-en'],pyProb:c['gc-py-prob'],pyMin:c['gc-py-min'],pyMax:c['gc-py-max']});})()") || '{}');
check('修改后 groupChatCfg() 读到新值', cfg1.prob === 100 && cfg1.rsMin === 1 && cfg1.rsMax === 1 && cfg1.pyEn === 1 && cfg1.pyProb === 100 && cfg1.pyMin === 2 && cfg1.pyMax === 2, JSON.stringify(cfg1));
const lsVal = await evalJs("(function(){try{return localStorage.getItem('xy-home-v2:reply-gc-gc-prob');}catch(e){return null;}})()");
check('gc-* 存全局命名空间 xy-home-v2:reply-gc-gc-prob', lsVal === '100', lsVal);

// ==================== 5. 跨桌面不隔离（全局生效） ====================
await evalJs("(function(){var id=window.createContact('群聊测试桌面');window.setActiveContact(id);return true;})()");
await sleep(600);
const cfg2 = JSON.parse(await evalJs("(function(){var c=window.groupChatCfg();return JSON.stringify({prob:c['gc-prob']});})()") || '{}');
check('切换到新桌面后群聊设置不变（全局）', cfg2.prob === 100, JSON.stringify(cfg2));
await evalJs("(function(){window.setActiveContact('default');return true;})()");
await sleep(500);

// ==================== 6. 群聊页：gc-prob=100 + 快速回复 → 成员回复 ====================
await evalJs("(function(){var b=document.getElementById('cs-back');if(b)b.click();return true;})()");
await sleep(300);
await enableGroupChat();
await evalJs("(function(){var b=document.getElementById('chat-back');if(b)b.click();return true;})()");
await sleep(400);
await openGroupChatPage();
const before = await countInMsgs();
await sendGroupMsg('群聊概率测试消息');
let inNow = before;
for (let i = 0; i < 25; i++) {
  inNow = await countInMsgs();
  if (inNow > before) break;
  await sleep(300);
}
check('gc-prob=100 时成员有回复', inNow > before, 'in=' + inNow + ' before=' + before);

// ==================== 7. 多字卡回复生效（2 条字卡空格拼接） ====================
let multiOk = false, lastTxt = '';
for (let i = 0; i < 12; i++) {
  lastTxt = await lastInText();
  if (lastTxt.split(' ').length >= 2) { multiOk = true; break; }
  await sleep(300);
}
check('多字卡回复生效（gc-py-min=max=2 → 2 条字卡空格连接）', multiOk, JSON.stringify(lastTxt));
// 等待上一轮所有成员（第 5 步新建桌面 → 群聊 2 成员）的延迟回复全部到达
await sleep(4000);

// ==================== 8. gc-prob=0 → 静默 ====================
await evalJs("(function(){window.saveReplyCfg('gc-prob', 0);return true;})()");
await sleep(200);
const before2 = await countInMsgs();
await sendGroupMsg('无人回复测试消息');
await sleep(3500);
const after2 = await countInMsgs();
check('gc-prob=0 时成员不回复', after2 === before2, 'before=' + before2 + ' after=' + after2);

// ==================== 9. @ 成员必定回复（gc-prob=0 仍回） ====================
await evalJs("(function(){var b=document.getElementById('gc-at-btn');if(b)b.click();return true;})()");
await sleep(400);
const atName = await evalJs("(function(){var n=document.querySelector('#gc-at-body .gc-at-item span');return n?n.textContent:'';})()") || '';
await evalJs("(function(){var i=document.getElementById('gc-input');i.innerText='@' + " + JSON.stringify(atName) + " + ' ';var b=document.getElementById('gc-send');b.click();return true;})()");
await sleep(300);
let in3 = 0;
for (let i = 0; i < 25; i++) {
  in3 = await countInMsgs();
  if (in3 > after2) break;
  await sleep(300);
}
check('gc-prob=0 时 @ 成员仍必定回复', in3 > after2, 'in=' + in3 + ' before=' + after2);

// ==================== 10. 无 JS 异常 ====================
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);

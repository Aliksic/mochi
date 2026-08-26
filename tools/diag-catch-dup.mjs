// 诊断：「摸鱼抓包」标签行是否仍与气泡正文重复（含旧版遗留数据模拟）
// T1 当前发送路径（mood 空 label）→ 标签行应只有胶囊
// T2 模拟 v3.14.x 旧记录（mood label=正文，历史存量）→ 渲染层 dupBody 应去重
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

let pass = 0, fail = 0;
function check(name, cond, detail) { console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name + (detail !== undefined ? '  实际=' + JSON.stringify(detail) : '')); if (cond) pass++; else fail++; }

const tmpDir = mkdtempSync(join(tmpdir(), 'mochi-diag-catch-'));
writeFileSync(join(tmpDir, 'index.html'), readFileSync(join(root, 'index.html'), 'utf8'));
writeFileSync(join(tmpDir, 'sw.js'), readFileSync(join(root, 'sw.js'), 'utf8'));
writeFileSync(join(tmpDir, 'manifest.json'), readFileSync(join(root, 'manifest.json'), 'utf8'));
for (const f of ['icon-192.png', 'icon-512.png']) { try { writeFileSync(join(tmpDir, f), readFileSync(join(root, f))); } catch (e) {} }
const baseUrl = 'file:///' + normalize(tmpDir).split(sep).join('/') + '/index.html';
const cdpPort = 9980 + Math.floor(Math.random() * 40);
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
// 在气泡 DOM 里数某段文本出现次数 + 返回标签行结构
const inspectOf = `(function(txt){
  var items = document.querySelectorAll('[data-idx]');
  var out = [];
  for (var j = 0; j < items.length; j++) {
    var b = items[j].querySelector('.msg-bubble'); if (!b) continue;
    var n = b.textContent.split(txt).length - 1;
    var mm = b.querySelector('.msg-moods');
    out.push({ idx: items[j].dataset.idx, count: n, mood: mm ? mm.textContent : '' });
  }
  return out;
})`;

try {
  await cdpConnect();
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 392, height: 850, deviceScaleFactor: 2.75, mobile: true });
  await cdp('Page.navigate', { url: baseUrl });
  for (let i = 0; i < 60; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
  await sleep(800);
  await evalJs(`(function(){var b=document.querySelector('.splash-confirm-btn')||document.getElementById('splash-confirm-ok');if(b)b.click();var s=document.getElementById('splash');if(s)s.hidden=true;return true;})()`);
  await sleep(400);

  // T1：当前真实发送路径
  await evalJs(`window.chatAddIn(window.taFit ? window.taFit('抓个正着！上班时间刷手机，摸鱼值充公~') : '抓个正着！上班时间刷手机，摸鱼值充公~', { mood: [{ tag: '摸鱼抓包', label: '' }] }); true`);
  await sleep(300);
  const t1 = await evalJs(inspectOf + `('抓个正着！上班时间刷手机')`);
  const t1hit = (t1 || []).find(x => x.count > 0);
  check('T1 当前路径：正文只出现 1 次、标签行无右侧文案', !!t1hit && t1hit.count === 1 && t1hit.mood.trim() === '摸鱼抓包', t1hit);

  // 显示聊天页（renderWindow 需要 chatPage 非 hidden）
  await evalJs(`(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return true;})()`);
  await sleep(400);

  // T2：模拟 v3.14.x 旧版存量记录（mood label=正文），重渲后应被 dupBody 去重
  const t2push = await evalJs(`(function(){
    var msgs = window.getChatMsgs ? window.getChatMsgs() : [];
    msgs.push({ side: 'in', text: '旧版存量卡：带薪如厕是打工人最后的尊严', ts: Date.now(), mood: [{ tag: '摸鱼抓包', label: '旧版存量卡：带薪如厕是打工人最后的尊严' }] });
    if (window.chatReRenderTime) { window.chatReRenderTime(); return 'rerender'; }
    return 'no-rerender-fn';
  })()`);
  console.log('T2 注入+重渲:', t2push);
  await sleep(600);
  const t2 = await evalJs(inspectOf + `('旧版存量卡：带薪如厕是打工人最后的尊严')`);
  const t2hit = (t2 || []).find(x => x.count > 0);
  check('T2 旧版存量记录（label=正文）：渲染层去重后正文只出现 1 次', !!t2hit && t2hit.count === 1 && String(t2hit.mood).trim() === '摸鱼抓包', t2hit);

  console.log('\\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
} catch (e) {
  console.error('异常:', e && e.message || e); fail++;
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  try { rmSync(join(tmpdir(), 'mochi-diag-prof-' + cdpPort), { recursive: true, force: true }); } catch (e) {}
}
process.exit(fail ? 1 : 0);

// ===== 诊断：聊天「更多功能」各分类下实际显示的功能项 =====
// 用户反馈：分类内容重复（v3.15 的「常用」页签导致）。已移除「常用」，每个功能只归一个分类。
// 本脚本无头打开 index.html → 进聊天页 → 打开更多面板 →
// 逐个点分类 chips，收集每个分类下可见的 .more-item（id+文案），输出：
//  1) 每个分类的完整清单  2) 同一分类内的重复项  3) 跨分类的重复项
import { spawn } from 'node:child_process';
import { readFileSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
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

const tmpDir = mkdtempSync(join(tmpdir(), 'mochi-diag-morecats-'));
writeFileSync(join(tmpDir, 'index.html'), readFileSync(join(root, 'index.html'), 'utf8'));
const baseUrl = 'file:///' + normalize(tmpDir).split(sep).join('/') + '/index.html';
const cdpPort = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-audio-output', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-morecats-' + Date.now()),
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
  if (r && r.exceptionDetails) { const ed = r.exceptionDetails; console.error('JS 异常:', String((ed.exception && ed.exception.description) || ed.text).slice(0, 300)); return null; }
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
  // 直接进入聊天页并打开更多面板（清空使用统计→「常用」走默认集）
  await evalJs(`(function(){try{localStorage.removeItem('xy-home-v2:more-item-use');}catch(e){}document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');});return true;})()`);
  await sleep(300);
  await evalJs(`(function(){var b=document.getElementById('chat-more-btn');if(b)b.click();return true;})()`);
  await sleep(400);

  const cats = ['chat', 'game', 'tool', 'ask'];
  const result = {};
  for (const cat of cats) {
    await evalJs(`(function(){var t=document.querySelector('#more-tabs .more-tab[data-mcat="${cat}"]');if(t)t.click();return true;})()`);
    await sleep(150);
    result[cat] = await evalJs(`(function(){
      function reallyVisible(el){
        if (el.hidden) return false;
        // 祖先链上任一节点 hidden/display:none 都算不可见（TA的提问行靠父 grid hidden 隐藏）
        for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
          if (n.hidden) return false;
          var d = getComputedStyle(n).display;
          if (d === 'none') return false;
        }
        return el.getClientRects().length > 0;
      }
      // 只统计聊天页面板 #chat-more-panel（群聊页 #gc-more-panel 同类名，排除）
      var out=[];
      document.querySelectorAll('#chat-more-panel .more-item').forEach(function(it){
        out.push({id: it.id, label: ((it.querySelector('span:last-child')||{}).textContent||'').trim(), visible: reallyVisible(it)});
      });
      return JSON.stringify(out);
    })()`);
    result[cat] = JSON.parse(result[cat]).filter(x => x.visible);
  }
  console.log('=== 各分类可见功能项 ===');
  const names = { chat: '互动', game: '小游戏', tool: '工具', ask: 'TA的提问' };
  const labelMap = {}; // label -> [cat...]
  for (const cat of cats) {
    const items = result[cat] || [];
    console.log('\n【' + names[cat] + '】(' + items.length + ' 个): ' + items.map(i => i.label + '(' + i.id + ')').join('、'));
    const seen = {};
    for (const it of items) {
      seen[it.label] = (seen[it.label] || 0) + 1;
      (labelMap[it.label] = labelMap[it.label] || []).push(names[cat]);
    }
    const dupIn = Object.keys(seen).filter(l => seen[l] > 1);
    if (dupIn.length) console.log('  ⚠ 分类内重复: ' + dupIn.join('、'));
  }
  console.log('\n=== 跨分类重复（同一文案出现在多个分类） ===');
  let any = false;
  for (const [label, cs] of Object.entries(labelMap)) {
    if (cs.length > 1) { any = true; console.log('  ' + label + ' → ' + cs.join('、')); }
  }
  if (!any) console.log('  （无）');
} finally {
  try { chrome.kill(); } catch (e) {}
}

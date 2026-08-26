// ===== 诊断：开屏卡死+网页崩溃（荣耀/Chrome 真机反馈）=====
// 用法：node tools/diag-splash-crash.mjs [poison]
//   无参数      —— 干净基线（空数据）
//   poison=xxx  —— 注入可疑脏数据后重载（period0=周期长度0 / bigchat=超大聊天记录 /
//                  oldstart=经期记录起点远古 / all=全部注入）
// 监控：JS 异常 / console error / 长任务 / DOM 节点数 / 堆内存曲线 / 渲染器崩溃
import { spawn } from 'node:child_process';
import { statSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poisonMode = process.argv[2] || '';
const read = (p) => { try { return statSync(p).isFile(); } catch (e) { return false; } };
const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find(read);
if (!chromePath) { console.error('找不到 Chrome'); process.exit(1); }

const tmpDir = mkdtempSync(join(tmpdir(), 'mochi-diag-crash-'));
writeFileSync(join(tmpDir, 'index.html'), readFileSync(join(root, 'index.html'), 'utf8'));
const baseUrl = 'file:///' + normalize(tmpDir).split(sep).join('/') + '/index.html';

const cdpPort = 9300 + Math.floor(Math.random() * 200);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-audio-output', '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank',
], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pend = new Map();
const events = [];
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
          events.push(m);
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
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) };
  return r && r.result ? r.result.value : null;
}

try {
  await cdpConnect();
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Performance.enable');
  // 长任务观察：主线程被卡住时 longtask duration 会飙到几十秒
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__lt = []; window.__t0 = Date.now();
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    window.__lag = () => new Promise((res) => { const t0 = performance.now(); setTimeout(() => res(Math.round(performance.now() - t0)), 50); });
  `});
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; HONOR-Perf) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' });

  // ---- 第一趟：装载并按需注毒（localStorage 种子），随后刷新正式计时 ----
  await cdp('Page.navigate', { url: baseUrl });
  await sleep(1200);
  if (poisonMode) {
    const P = {
      period0: `try{localStorage.setItem('xy-home-v2:period-cfg',JSON.stringify({cycleLen:0,periodLen:5,lutealPhase:14}))}catch(e){}`,
      oldstart: `try{localStorage.setItem('xy-home-v2:period-recs',JSON.stringify([{id:'a',start:'2019-01-05',end:'2019-01-10'},{id:'b',start:'2025-07-01',end:null}]))}catch(e){}`,
      bigchat: `try{var big=[];for(var i=0;i<4000;i++)big.push({t:'你好呀这是一条比较长的测试消息用来撑大聊天记录体量'+i,me:i%2===0,ts:1700000000000+i*60000});localStorage.setItem('xy-home-v2:c1:chat-log',JSON.stringify(big))}catch(e){}`,
    };
    const keys = poisonMode === 'all' ? Object.keys(P) : [poisonMode];
    for (const k of keys) if (P[k]) await evalJs(P[k]);
  }
  await cdp('Page.navigate', { url: baseUrl });

  // 等开屏元素出现（页面加载完成）才开始计时
  let seen = false;
  for (let i = 0; i < 40; i++) {
    const ok = await evalJs(`!!document.getElementById('splash')`);
    if (ok) { seen = true; break; }
    await sleep(250);
  }
  if (!seen) console.log('⚠️ 10 秒内未出现 #splash（页面加载本身卡死/崩溃？）');

  const t0 = Date.now();
  const samples = [];
  let crashed = false;
  ws.onclose = () => { crashed = true; };

  for (let i = 0; i <= 60; i++) {
    const el = ((Date.now() - t0) / 1000).toFixed(1);
    if (crashed) { console.log(`[t=${el}s] ❌ 渲染器崩溃（WS 断开）`); break; }
    const s = await evalJs(`(function(){
      var sp=document.getElementById('splash');
      return {
        ready:!!window.__mochiDataReady,
        splashHidden:!!(sp&&sp.classList.contains('hide')),
        splashGone:!!document.getElementById('splash')===false,
        hadSplash:true,
        nodes:document.getElementsByTagName('*').length,
        heap:(performance.memory&&performance.memory.usedJSHeapSize||0)>>20,
        lt:(window.__lt||[]).slice(-3)
      };
    })()`);
    const lag = s && !s.__err ? await evalJs(`window.__lag()`) : -1;
    samples.push({ el, ...s, lag });
    if (i % 6 === 0 || (s && s.__err)) {
      console.log(`[t=${el}s] ready=${s.ready} splashHide=${s.splashHidden} nodes=${s.nodes} heap=${s.heap}MB lag=${lag}ms ${s.__err ? 'ERR:' + s.__err : ''}`);
    }
    if (seen && s.splashGone) { console.log(`[t=${el}s] ✅ 开屏已移除，页面正常`); break; }
    await sleep(500);
  }

  // 汇总
  await sleep(300);
  const excs = events.filter((e) => e.method === 'Runtime.exceptionThrown');
  const cerrs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning'));
  const lerrs = events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  const bigLt = events.length && await evalJs(`JSON.stringify((window.__lt||[]).filter(x=>x.d>1000).slice(-10))`);
  console.log('\n===== 汇总 =====');
  console.log('JS 异常数:', excs.length);
  excs.slice(0, 5).forEach((e) => console.log('  EXC:', String(e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text).split('\n')[0]));
  console.log('console error/warn:', cerrs.length); cerrs.slice(0, 5).forEach((e) => console.log('  CON:', e.params.args.map((a) => a.value || a.description).join(' ').slice(0, 160)));
  console.log('log error:', lerrs.length); lerrs.slice(0, 5).forEach((e) => console.log('  LOG:', e.params.entry.text.slice(0, 160)));
  console.log('>1s 长任务:', bigLt || '[]');
  const last = samples[samples.length - 1];
  console.log('末帧采样:', JSON.stringify(last));
} finally {
  try { chrome.kill(); } catch (e) {}
}

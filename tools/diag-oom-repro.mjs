// ===== 复现：重度数据用户启动回填 OOM 崩溃（荣耀/安卓 Chrome 真机症状） =====
// 用法：node tools/diag-oom-repro.mjs [seedMB] [heapMB]
//   seedMB —— 注入 IDB 的字卡库体积（默认 40，模拟重度用户；聊天记录已排除回填不注入）
//   heapMB —— 渲染器 V8 老生代上限（默认 256，模拟移动端受限堆）
// 流程：写入大 cc-groups 种子 → 重载 → 每 250ms 采样堆/DOM，直到开屏移除或渲染器崩溃。
// 判定：WS 断开 = 渲染器崩溃（真机表现为「网页崩溃」白屏重载）。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED_MB = Number(process.argv[2] || 40);
const HEAP_MB = Number(process.argv[3] || 256);

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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

let ws = null, msgId = 0;
let crashedFlag = false;
const pend = new Map();
const conLog = [];
const cdpPort = 9100 + Math.floor(Math.random() * 200);
// --js-flags 传给所有渲染进程：模拟移动端受限 V8 堆
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-precise-memory-info',
  '--js-flags=--max-old-space-size=' + HEAP_MB,
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-oom-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank',
], { stdio: 'ignore' });

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
          if (m.method === 'Inspector.targetCrashed') { crashedFlag = true; try { ws.close(); } catch (e) {} return; }
          if (m.method === 'Runtime.consoleAPICalled' && ['info', 'error', 'warning', 'debug', 'log'].indexOf(m.params.type) >= 0) {
            const txt = (m.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
            if (txt.indexOf('[restore-t]') >= 0 || txt.indexOf('[big-') === 0 || m.params.type !== 'debug') conLog.push(m.params.type + ': ' + txt.slice(0, 260));
          }
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
  return new Promise((res) => {
    const timer = setTimeout(() => { pend.delete(id); res({ __timeout: true }); }, 12000);
    pend.set(id, (r) => { clearTimeout(timer); res(r); });
    try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); res({ __timeout: true }); }
  });
}
async function evalJs(expr, awaitPromise = false) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r && r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 200) };
    return r && r.result ? r.result.value : null;
  } catch (e) { return { __err: String(e).slice(0, 120) }; }
}

try {
  await cdpConnect();
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // 大对象探针：谁在启动期解析/写入超大字符串（在任何应用脚本前注入）
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){
      var op = JSON.parse;
      JSON.parse = function(s){
        var r = op.apply(JSON, arguments);
        if (typeof s === 'string' && s.length > 524288) {
          try { console.debug('[big-parse] len=' + s.length + ' stack=' + (new Error()).stack.split('\\n').slice(1, 5).join(' | ').slice(0, 400)); } catch (e) {}
        }
        return r;
      };
      var os = JSON.stringify;
      JSON.stringify = function(v){
        var r = os.apply(JSON, arguments);
        if (typeof r === 'string' && r.length > 524288) {
          try { console.debug('[big-stringify] len=' + r.length + ' stack=' + (new Error()).stack.split('\\n').slice(1, 5).join(' | ').slice(0, 400)); } catch (e) {}
        }
        return r;
      };
    })();
    // 大键读写探针：捕获任何 >1MB 的 IDB 读回 / xyStore 写入及其调用栈
    (function(){
      var st = Date.now();
      ['idbGet', 'idbGetMany'].forEach(function (name) {
        var real;
        Object.defineProperty(window, name, {
          configurable: true,
          get: function () { return real; },
          set: function (fn) {
            real = function () {
              var args = arguments, keys = name === 'idbGetMany' ? (args[0] || []) : [args[0]];
              var r = fn.apply(this, arguments);
              try {
                Promise.resolve(r).then(function (out) {
                  keys.forEach(function (k) {
                    var v = name === 'idbGetMany' ? (out && out[k]) : out;
                    var len = typeof v === 'string' ? v.length : (v && v.byteLength) || 0;
                    if (len > 1048576) console.debug('[big-' + name + '] ' + k + ' len=' + len + ' at+' + (Date.now() - st) + 'ms stack=' + (new Error()).stack.split('\\n').slice(1, 4).join(' | ').slice(0, 300));
                  });
                }).catch(function () {});
              } catch (e) {}
              return r;
            };
          }
        });
      });
      var realStore = undefined;
      Object.defineProperty(window, 'xyStore', {
        configurable: true,
        get: function () { return realStore; },
        set: function (fn) {
          realStore = function (prefix) {
            var s = fn(prefix);
            var oset = s.set.bind(s);
            s.set = function (k, v) {
              var len = typeof v === 'string' ? v.length : 0;
              if (len > 1048576) { try { console.debug('[big-store-set] ' + prefix + ':' + k + ' len=' + len + ' stack=' + (new Error()).stack.split('\\n').slice(1, 4).join(' | ').slice(0, 300)); } catch (e) {} }
              return oset(k, v);
            };
            return s;
          };
        }
      });
    })();
  `});

  // 第一趟：全新环境装载 + 注入种子
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2000);
  for (let i = 0; i < 40; i++) { const r = await evalJs('!!window.__mochiDataReady'); if (r === true) break; await sleep(250); }
  console.log(`注入种子：cc-groups ≈ ${SEED_MB}MB（每张贴纸 128KB dataURL × ${Math.round(SEED_MB * 1048576 / 128000)} 张）…`);
  const seed = await evalJs(`(async function(){
    try {
      var STK = 'data:image/png;base64,' + 'B'.repeat(128000);
      var groups = [];
      var nG = ${Math.max(2, Math.round(SEED_MB * 1048576 / 128000 / 20))};
      for (var g = 0; g < nG; g++) groups.push({ id: 'g' + g, name: '分组' + g, items: Array.from({length: 20}, (_, k) => ({ id: 'g' + g + '-' + k, name: '包' + g + '_' + k, url: STK })) });
      var ok = await window.idbSet('xy-home-v2:cc-groups', JSON.stringify(groups));
      return ok ? 'ok' : 'write-fail';
    } catch (e) { return 'err:' + e.message; }
  })()`, true);
  console.log('种子写入:', JSON.stringify(seed));

  // 第二趟：先去 about:blank 让种子页释放内存（避免同进程新旧文档叠加干扰测量），
  // 再重载触发 idbRestore 回填，密集采样
  let crashed = false;
  ws.onclose = () => { crashed = true; };
  await cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
  await sleep(1200);
  await cdp('Page.navigate', { url: baseUrl + '/index.html' }).catch(() => {});

  // 等开屏出现
  let seenSplash = false;
  for (let i = 0; i < 40 && !crashed; i++) {
    if (crashedFlag) break;
    const ok = await evalJs(`!!document.getElementById('splash')`);
    if (ok === true) { seenSplash = true; break; }
    if (crashed || crashedFlag) break;
    await sleep(250);
  }
  if (!seenSplash && !crashed && !crashedFlag) console.log('⚠️ 开屏未出现');

  const t0 = Date.now();
  let peak = 0, readyAt = -1, lastHeap = 0;
  for (let i = 0; i < 160 && !crashed; i++) {
    if (crashedFlag) { crashed = true; break; }
    const el = ((Date.now() - t0) / 1000).toFixed(1);
    const s = await evalJs(`(function(){
      var sp=document.getElementById('splash');
      return { ready:!!window.__mochiDataReady, gone:!sp,
        deferred:(window.__xyIdbDeferredKeys||[]).length,
        heap:(performance.memory&&performance.memory.usedJSHeapSize||0)/1048576,
        total:(performance.memory&&performance.memory.totalJSHeapSize||0)/1048576 };
    })()`);
    if (s && s.__timeout) { crashed = true; lastHeap = peak; break; } // CDP 无响应=渲染器已挂
    if (!s || s.__err) { crashed = true; break; } // 执行上下文失效
    lastHeap = s.heap;
    if (s.heap > peak) peak = s.heap;
    if (s.ready && readyAt < 0) readyAt = Number(el);
    console.log(`[t=${el}s] ready=${s.ready} gone=${s.gone} 挂起=${s.deferred} heap=${s.heap.toFixed(0)}MB total=${(s.total||0).toFixed(0)}MB`);
    if (s.gone && s.ready) { console.log(`[t=${el}s] ✅ 存活：开屏已移除，峰值 ${peak.toFixed(0)}MB`); break; }
    await sleep(250);
  }

  console.log('\n===== 结果 =====');
  console.log(`种子=${SEED_MB}MB 堆上限=${HEAP_MB}MB`);
  console.log(crashed
    ? `❌ 渲染器崩溃（WS 断开）——崩溃前最后堆读数 ${lastHeap.toFixed(0)}MB，全程峰值 ${peak.toFixed(0)}MB`
    : `✅ 未崩溃——峰值 ${peak.toFixed(0)}MB，就绪 ${readyAt >= 0 ? readyAt + 's' : '超时'}`);
  conLog.slice(0, 12).forEach((l) => console.log('  [console]', l));

  // ---- 第二次启动：同配置文件重载（索引已自愈），验证超大键"直接不读"快路 ----
  if (!crashed) {
    crashedFlag = false;
    crashed = false;
    peak = 0; readyAt = -1; lastHeap = 0;
    console.log('\n----- 第二次启动（索引应已自愈） -----');
    await cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
    await sleep(1000);
    const t1 = Date.now();
    await cdp('Page.navigate', { url: baseUrl + '/index.html' }).catch(() => {});
    let seen2 = false;
    for (let i = 0; i < 40 && !crashed && !crashedFlag; i++) {
      if (crashedFlag) break;
      const ok = await evalJs(`!!document.getElementById('splash')`);
      if (ok === true) { seen2 = true; break; }
      await sleep(250);
    }
    for (let i = 0; i < 80 && !crashed; i++) {
      if (crashedFlag) { crashed = true; break; }
      const el = ((Date.now() - t1) / 1000).toFixed(1);
      const s = await evalJs(`(function(){
        var sp=document.getElementById('splash');
        return { ready:!!window.__mochiDataReady, gone:!sp,
          deferred:(window.__xyIdbDeferredKeys||[]).length,
          heap:(performance.memory&&performance.memory.usedJSHeapSize||0)/1048576,
          total:(performance.memory&&performance.memory.totalJSHeapSize||0)/1048576 };
      })()`);
      if (s && s.__timeout) { crashed = true; lastHeap = peak; break; }
      if (!s || s.__err) { crashed = true; break; }
      lastHeap = s.heap;
      if (s.heap > peak) peak = s.heap;
      if (s.ready && readyAt < 0) readyAt = Number(el);
      console.log(`[t=${el}s] ready=${s.ready} 挂起=${s.deferred} heap=${s.heap.toFixed(0)}MB`);
      if (s.ready && s.deferred > 0 && i >= 20) { console.log(`[t=${el}s] ✅ 二次启动稳定：挂起=${s.deferred} 峰值 ${peak.toFixed(0)}MB`); break; }
      if (i >= 79) { console.log(`二次启动 20s 结束：峰值 ${peak.toFixed(0)}MB`); }
      await sleep(250);
    }
    console.log(crashed
      ? `❌ 第二次启动仍崩溃——峰值 ${peak.toFixed(0)}MB`
      : `✅ 第二次启动未崩溃——峰值 ${peak.toFixed(0)}MB，挂起清单见上`);
  }
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

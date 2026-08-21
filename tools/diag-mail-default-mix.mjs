// ===== 诊断脚本：信箱写信混入默认字卡（v3.8.x 修复验证） =====
// 用法：node build.mjs && node tools/diag-mail-default-mix.mjs
// 场景：
//   A 有自定义字卡（分类全开）→ 来信应 自定义+默认 混用
//   B 关闭 dc-cat-main → 来信不含默认主字卡
//   C 关闭 dc-use-mail → 来信全为自定义
//   UI：page-default-cards 的 dc-cat-* 开关存在且点击后 defaultCardCat 翻转
// 需要：Node 21+ + 本机 Chrome/Edge（CHROME_PATH 可指定）
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
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    const body = readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-mail-' + Date.now()),
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
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) { console.error('  [eval err]', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 300)); return null; }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(900);

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

// ---- 种子：自定义字卡（3 张独特卡）+ 信箱概率拉满 ----
const customCards = ['【自定义卡甲乙丙】', '【自定义卡丁戊己】', '【自定义卡庚辛壬】'];
const seedOk = await evalJs(`(function(){
  try {
    const g = { text: [['测试组', ${JSON.stringify(customCards)}]], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
    window.activeStore().set('cc-groups', JSON.stringify(g));
    const s = window.activeStore();
    // 信箱配置带 reply- 前缀（replyCfg 读取规则）
    s.set('reply-ml-write-prob', '100');   // 必来信
    s.set('reply-ml-min-cards', '40');     // 每封信固定 40 张卡
    s.set('reply-ml-max-cards', '40');
    s.set('reply-ml-write-daily-max', '50');
    s.set('reply-ml-kaomoji-en', '0');     // 关闭尾部附加，只验正文混入
    s.set('reply-ml-emoji-en', '0');
    s.set('reply-ml-sticker-en', '0');
    s.set('mail-letter-last', '0');
    s.set('mail-letter-next', '0');
    s.set('dc-cat-main', '1');
    s.set('dc-cat-kaomoji', '1');
    s.set('dc-cat-emoji', '1');
    s.set('dc-cat-touch', '1');
    s.set('dc-use-mail', '1');
    s.set('dc-enabled', '1');
    return true;
  } catch(e) { return 'seed err: ' + e.message; }
})()`);
check('种子写入（自定义字卡 + 信箱配置）', seedOk === true, String(seedOk));
if (seedOk !== true) process.exit(1);

// ---- 等待来信（首个 maybeIncomingLetter 在加载后 20~60s 触发，之后每 60s 一封） ----
async function waitLetter(tag, timeoutMs, prevId) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const raw = await evalJs(`(function(){try{var l=JSON.parse(window.activeStore().get('mail-letters')||'[]');return l.length?{id:l[0].id,content:l[0].content}:null;}catch(e){return null;}})()`);
    if (raw && raw.id !== prevId) return raw;
    await sleep(2000);
  }
  return null;
}
function classifyLetter(content) {
  // 在页面内用 DEFAULT_CARD_DATA 判断每个词是否属于默认字卡
  return evalJs(`(function(){
    const c = ${JSON.stringify(content)};
    const D = window.DEFAULT_CARD_DATA || {};
    const mainSet = new Set(); (D.main||[]).forEach(g=>(g[1]||[]).forEach(x=>mainSet.add(x)));
    const kaoSet = new Set(); (D.kaomoji||[]).forEach(g=>(g[1]||[]).forEach(x=>kaoSet.add(x)));
    const emoSet = new Set(); (D.emoji||[]).forEach(g=>(g[1]||[]).forEach(x=>emoSet.add(x)));
    const words = String(c||'').split(/\s+/).filter(Boolean);
    let defMain=0, defKao=0, defEmo=0, custom=0, other=0;
    words.forEach(w=>{
      if (mainSet.has(w)) defMain++;
      else if (kaoSet.has(w)) defKao++;
      else if (emoSet.has(w)) defEmo++;
      else if (w.indexOf('【自定义卡')===0) custom++;
      else other++;
    });
    return JSON.stringify({total:words.length, defMain, defKao, defEmo, custom, other});
  })()`);
}

// 场景 A：分类全开 → 自定义 + 默认混用
let letter = await waitLetter('A', 75000, null);
if (!letter) { check('场景A 收到来信', false, '75s 内未收到'); process.exit(1); }
let cls = JSON.parse(await classifyLetter(letter.content) || '{}');
console.log('  [场景A 信件统计]', JSON.stringify(cls), '内容前80字:', String(letter.content).slice(0, 80));
check('场景A 自定义字卡在信件中', cls.custom > 0, 'custom=' + cls.custom);
check('场景A 默认字卡混入信件', (cls.defMain + cls.defKao + cls.defEmo) > 0, 'defMain=' + cls.defMain + ' defKao=' + cls.defKao + ' defEmo=' + cls.defEmo);

// 场景 B：关闭 dc-cat-main → 信里不再有默认主字卡（颜文字/emoji 默认仍可混入）
await evalJs(`(function(){var s=window.activeStore();s.set('dc-cat-main','0');s.set('mail-letter-last','0');s.set('mail-letter-next','0');return true;})()`);
letter = await waitLetter('B', 75000, letter.id);
if (letter) {
  cls = JSON.parse(await classifyLetter(letter.content) || '{}');
  console.log('  [场景B 信件统计]', JSON.stringify(cls));
  check('场景B 关闭主字卡后无默认主字卡', cls.defMain === 0, 'defMain=' + cls.defMain);
  check('场景B 自定义字卡仍在', cls.custom > 0, 'custom=' + cls.custom);
} else { check('场景B 收到来信', false, '75s 内未收到'); }

// 场景 C：关闭 dc-use-mail → 信里不含任何默认字卡
await evalJs(`(function(){var s=window.activeStore();s.set('dc-cat-main','1');s.set('dc-use-mail','0');s.set('mail-letter-last','0');s.set('mail-letter-next','0');return true;})()`);
letter = await waitLetter('C', 75000, letter ? letter.id : null);
if (letter) {
  cls = JSON.parse(await classifyLetter(letter.content) || '{}');
  console.log('  [场景C 信件统计]', JSON.stringify(cls));
  check('场景C 关闭信箱使用后无任何默认字卡', (cls.defMain + cls.defKao + cls.defEmo) === 0, 'defMain=' + cls.defMain + ' defKao=' + cls.defKao + ' defEmo=' + cls.defEmo);
  check('场景C 自定义字卡仍在', cls.custom > 0, 'custom=' + cls.custom);
} else { check('场景C 收到来信', false, '75s 内未收到'); }

// ---- UI：聊天默认字卡页分类开关存在且可翻转 ----
const ui = JSON.parse(await evalJs(`(function(){
  const out = {};
  ['main','kaomoji','emoji','touch'].forEach(k=>{
    const el = document.getElementById('dc-cat-'+k);
    out[k] = el ? {exists:true, checked: el.checked} : {exists:false};
  });
  return JSON.stringify(out);
})()`) || '{}');
console.log('  [UI 分类开关]', JSON.stringify(ui));
check('UI 分类开关齐全', Object.keys(ui).length === 4 && Object.values(ui).every(v => v.exists), JSON.stringify(ui));
check('UI 分类开关默认开启', Object.values(ui).every(v => v.exists && v.checked), JSON.stringify(ui));

const flip = JSON.parse(await evalJs(`(function(){
  const el = document.getElementById('dc-cat-touch');
  if (!el) return '{}';
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change', {bubbles:true}));
  return JSON.stringify({ cat: window.defaultCardCat ? window.defaultCardCat('touch') : null, stored: window.activeStore().get('dc-cat-touch') });
})()`) || '{}');
console.log('  [UI 翻转 touch]', JSON.stringify(flip));
check('UI 点击后 defaultCardCat 翻转', flip.cat === false && flip.stored === '0', JSON.stringify(flip));

const failed = results.filter(r => !r.ok);
console.log('\n===== 诊断结果：' + (results.length - failed.length) + '/' + results.length + ' 通过 =====');
chrome.kill();
server.close();
process.exit(failed.length ? 1 : 0);

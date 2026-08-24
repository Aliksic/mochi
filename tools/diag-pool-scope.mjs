// ===== 诊断：v3.11.x 双作用域后「联系人发不出专属拍一拍/表情包」回归 =====
// 用法：node tools/diag-pool-scope.mjs
// 复现路径：多桌面联系人 → 专属字卡里有 拍一拍/表情包 → 打开一次「公用字卡」管理页再返回
//   → ccScope 停在 'public'，groups 被换成公用库；回复池 getCustomCards/getMediaCards/
//   getPokeCards 全部以 groups 为基准 → 专属拍一拍/表情包从联系人侧消失。
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
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }

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

const cdpPort = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-pool-' + Date.now()),
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
    if (r && r.exceptionDetails) {
      console.error('  [eval err]', (r.exceptionDetails.exception && r.exceptionDetails.exception.description || '').slice(0, 300));
      return null;
    }
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail !== undefined ? '  [' + JSON.stringify(detail) + ']' : ''));
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function loadApp() {
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2200);
  for (let i = 0; i < 40; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
  await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
  await sleep(2300);
  await evalJs("(function(){var m=document.getElementById('cc-scope-mask');if(m&&!m.hidden){var b=document.getElementById('csn-ok');if(b)b.click();}return true;})()");
  await sleep(300);
}

async function purgeCcState() {
  return await evalJs(`(async function(){
    try {
      var keys=['cc-groups-public','cc-scope-migrated','cc-scope-notice-done','cc-groups'];
      var cids=['default','ctest1'];
      keys.forEach(function(k){ try{ localStorage.removeItem('xy-home-v2:'+k);}catch(e){} });
      cids.forEach(function(c){ try{ localStorage.removeItem('xy-home-v2:'+c+':cc-groups')}catch(e){} });
      if(window.idbDelete){
        for(const k of keys){ try{ await window.idbDelete('xy-home-v2:'+k);}catch(e){} }
        for(const c of cids){ try{ await window.idbDelete('xy-home-v2:'+c+':cc-groups')}catch(e){} }
      }
      return true;
    } catch(e) { return 'err:'+e.message; }
  })()`);
}

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

// ---- 种子：两个联系人，active=ctest1，ctest1 专属键有 拍一拍+表情包 ----
await loadApp();
await purgeCcState();
const seed = await evalJs(`(async function(){
  try{
    var g={text:[['闲聊',['专属一句']]],poke:[['互动',['专属戳戳']]],sticker:[['表情组',['${GIF}']]]};
    var s=JSON.stringify(g);
    localStorage.setItem('xy-home-v2:ctest1:cc-groups',s);
    localStorage.setItem('xy-home-v2:contacts',JSON.stringify([{id:'default',name:'默认'},{id:'ctest1',name:'小A'}]));
    localStorage.setItem('xy-home-v2:active-contact','ctest1');
    if(window.idbSet) await window.idbSet('xy-home-v2:ctest1:cc-groups',s);
    return true;
  }catch(e){ return 'err:'+e.message; }
})()`);
check('S0 种子写入成功', seed === true, seed);
await loadApp();

function poolProbe(tag) {
  return `(function(){
    var pk=(window.getPokeCards&&window.getPokeCards())||[];
    var st=(window.getMediaCards&&window.getMediaCards('sticker'))||[];
    return JSON.stringify({tag:'${tag}',poke:pk,stickerHas:st.indexOf('${GIF}')>=0,stN:st.length});
  })()`;
}

const base = JSON.parse(await evalJs(poolProbe('base')));
check('T1 基线：拍一拍池含专属「专属戳戳」', base.poke.indexOf('专属戳戳') >= 0, base.poke);
check('T2 基线：表情包池含专属表情', base.stickerHas === true, base);

// ---- 关键复现：打开一次「公用字卡」页 → 返回 ----
await evalJs("(function(){var t=document.querySelector('.tab[data-page=\"page-chatcard\"]');if(t)t.click();return !!t;})()");
await sleep(400);
await evalJs("(function(){var li=document.getElementById('li-custom-cards-public');if(li)li.click();return !!li;})()");
await sleep(400);
await evalJs("(function(){var b=document.getElementById('cc-back');if(b)b.click();return !!b;})()");
await sleep(400);

const after = JSON.parse(await evalJs(poolProbe('after-visit-public')));
console.log('访问公用页返回后：' + JSON.stringify(after));
check('T3 访问公用页后：拍一拍池仍含专属（期望）', after.poke.indexOf('专属戳戳') >= 0, after.poke);
check('T4 访问公用页后：表情包池仍含专属（期望）', after.stickerHas === true, after);

const pass = results.filter(r => r.ok).length;
console.log('\n结果：' + pass + '/' + results.length + ' 项通过');
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}
process.exit(pass === results.length ? 0 : 1);

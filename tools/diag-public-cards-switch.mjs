// ===== 诊断：切换桌面联系人后 字卡库【公用字卡】丢失（用户反馈） =====
// 用法：node tools/diag-public-cards-switch.mjs
// 注意：不依赖仓库根目录的构建产物——本脚本从当前 src/ 临时组装页面（镜像
// build.mjs 的拼接顺序、每文件独立 script 标签），避免与并行会话的官方构建互相干扰。
// 场景：
//   S1 双桌面 + 公用字卡（小库，正常设备路径）：默认桌 → B 桌 → 默认桌，
//      每步核对 ①列表页公用角标 ②公用字卡页内容 ③回复池 getCustomCards 含公用+专属
//   S2 大库挂起路径（低内存设备 __xyIdbDeferredKeys / 超预算键）：
//      公用库 >12MB 预算被启动回填挂起 → 列表页/回复池/切桌面后的表现
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readSrc = (f) => readFileSync(join(root, 'src', f), 'utf8');

// ---- 从当前 src 临时组装页面（顺序与 build.mjs 一致；每文件独立 script 隔离语法错误） ----
const cssFiles = ['base.css', 'home.css', 'chat-main.css', 'chat-pages.css', 'market.css', 'group-chat.css', 'setting.css', 'tabbar.css', 'dark.css', 'garden.css', 'memo.css', 'memo-arc.css', 'room.css'];
const jsFiles = ['idb.js', 'contacts.js', 'clock.js', 'tabs.js', 'desktop-slider.js', 'quote-cards.js', 'personalize.js', 'chat.js', 'group-chat.js', 'chatcard.js', 'chat-settings.js', 'reply-settings.js', 'fav-settings.js', 'default-cards-data.js', 'default-cards.js', 'mood-followup-data.js', 'mood-reply-cards.js', 'music-player.js', 'calendar.js', 'divination.js', 'avatar-lib.js', 'ta-ask.js', 'ck-question.js', 'ta-invite.js', 'bg-keep.js', 'records.js', 'call.js', 'mail.js', 'feed.js', 'loc-lib.js', 'p2-features.js', 'gift-shop.js', 'memo-app.js', 'memo-arc.js', 'period.js', 'accounting.js', 'garden.js', 'room.js', 'decision.js', 'group-decision.js', 'pong.js', 'snake-game.js', 'breakout.js', 'sfx.js', 'fullscreen.js', 'data-backup.js', 'pwa.js', 'cjian.js', 'mobile-adapt.js'];
let html = readFileSync(join(root, 'src', 'template.html'), 'utf8');
const styles = cssFiles.map((f) => readSrc(join('css', f))).join('\n');
const scripts = jsFiles.map((f) => {
  const code = readSrc(join('js', f));
  return '(function () { try {\n' + code + '\n} catch (__e) { try { console.error("[JS] ' + f + '", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push(String(__e && __e.message || __e)); } })();';
}).join('\n');
html = html.replace('/*__STYLES__*/', styles);
html = html.replace('/*__SCRIPTS__*/', scripts);
html = html.split('__BUILD_INFO__').join('diag-pubswitch');
html = html.split('__BUILD_TS__').join(String(Date.now()));
html = html.split('__APP_VERSION__').join('v3.15.x-diag');
const tmpHtml = join(tmpdir(), 'mochi-diag-pubswitch-' + Date.now() + '.html');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    // 首页一律回自组装页（避免漏出仓库根旧构建产物）
    if (req.url === '/' || req.url.split('?')[0] === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(tmpHtml));
      return;
    }
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
writeFileSync(tmpHtml, html);

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge'); process.exit(1); }

const cdpPort = 9700 + Math.floor(Math.random() * 60);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-diag-pub-' + Date.now()),
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

let pass = 0, fail = 0;
function check(desc, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + String(detail).slice(0, 160) + ']' : ''));
}

// ---------- 种子注入：app 脚本运行前写 localStorage（一次性标记，重载不再覆写） ----------
async function seedAndLoad(opts) {
  const big = opts && opts.big;
  const seedFn = `(function(){
    try {
      var G='xy-home-v2';
      if (localStorage.getItem(G+':diagseed:mochi-v1')==='1') return;
      localStorage.setItem(G+':contacts', JSON.stringify([{id:'default',name:'小A'},{id:'ctest1',name:'角色B'}]));
      localStorage.setItem(G+':active-contact','default');
      localStorage.setItem(G+':cc-scope-migrated','1');
      localStorage.setItem(G+':cc-scope-notice-done','1');
      function lib(cards){ return JSON.stringify({text:[['专属组',cards]],kaomoji:[],emoji:[],sticker:[],image:[],poke:[],voice:[]}); }
      localStorage.setItem(G+':cc-groups-public', JSON.stringify({text:[['公用组',['公用卡甲','公用卡乙']]],kaomoji:[],emoji:[],sticker:[],image:[],poke:[],voice:[]}));
      localStorage.setItem(G+':default:cc-groups', lib(['专属卡A1']));
      localStorage.setItem(G+':ctest1:cc-groups', lib(['专属卡B1']));
      localStorage.setItem(G+':diagseed:mochi-v1','1');
    } catch(e) {}
  })()`;
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: seedFn });
  await cdp('Page.navigate', { url: baseUrl + '/index.html' });
  await sleep(2500);
  for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
  await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
  await sleep(900);
}

async function openCardLib() {
  await evalJs(`(function(){
    var t=document.querySelector('.tab[data-page="page-chatcard"]');
    if(t){t.click();return 'tab';}
    var p=document.getElementById('page-chatcard'); if(p){p.hidden=false;return 'force';}
    return 'none';
  })()`);
  await sleep(600);
}
async function openPublicPage() {
  const ok = await evalJs(`(function(){
    var li=document.getElementById('li-custom-cards-public');
    if(!li) return false; li.click(); return true;
  })()`);
  await sleep(1200);
  return ok;
}
async function ccSnapshot() {
  return JSON.parse(await evalJs(`(function(){
    var page=document.getElementById('page-custom-cards');
    var list=document.getElementById('cc-list');
    var ttl=document.getElementById('cc-page-title');
    var txt = list ? list.textContent.replace(/\\s+/g,'') : '';
    return JSON.stringify({
      visible: !!page && !page.hidden,
      title: ttl ? ttl.textContent : '',
      hasJia: txt.indexOf('公用卡甲')>=0,
      hasBig1: txt.indexOf('公用大卡1_')>=0,
      items: list ? list.querySelectorAll('.cc-item').length : -1
    });
  })()`) || '{}');
}
async function badgePub() {
  return await evalJs(`(function(){ var e=document.getElementById('cc-pub-count'); return e? parseInt(e.textContent,10): -999; })()`);
}
async function poolProbe() {
  return JSON.parse(await evalJs(`(function(){
    var out={};
    try{ var cs=(window.getCustomCards&&window.getCustomCards())||[];
      out.pub=cs.indexOf('公用卡甲')>=0 || cs.some(function(c){return typeof c==='string'&&c.indexOf('公用大卡1_')===0;});
      out.ownA=cs.indexOf('专属卡A1')>=0; out.ownB=cs.indexOf('专属卡B1')>=0; out.n=cs.length; }catch(e){out.err=String(e);}
    out.deferred=(window.__xyIdbDeferredKeys||[]).filter(function(k){return k.indexOf('cc-groups-public')>=0;}).length;
    return JSON.stringify(out);
  })()`) || '{}');
}
async function backFromCc() {
  await evalJs(`(function(){ var b=document.getElementById('cc-back'); if(b)b.click(); return true; })()`);
  await sleep(400);
}

console.log('===== S1 小库（正常设备路径） =====');
await seedAndLoad({ big: false });

check('S1-0 公用根键种子在 LS', (await evalJs(`!!localStorage.getItem('xy-home-v2:cc-groups-public')`)) === true);

await openCardLib();
let b = await badgePub();
check('S1-1 默认桌：列表页公用角标=2', b === 2, 'badge=' + b);

await openPublicPage();
let snap = await ccSnapshot();
check('S1-2 默认桌：公用页打开且含「公用卡甲」', snap.visible && snap.title === '公用字卡' && snap.hasJia, JSON.stringify(snap));
await backFromCc();

let pp = await poolProbe();
check('S1-3 默认桌：回复池含公用+专属A', pp.pub === true && pp.ownA === true && !pp.ownB, JSON.stringify(pp));

console.log('--- 切到 角色B ---');
await evalJs(`window.setActiveContact('ctest1')`);
await sleep(800);

b = await badgePub();
check('S1-4 B桌：列表页公用角标=2', b === 2, 'badge=' + b);

await openPublicPage();
snap = await ccSnapshot();
check('S1-5 B桌：公用页仍含「公用卡甲」', snap.visible && snap.hasJia, JSON.stringify(snap));
await backFromCc();

pp = await poolProbe();
check('S1-6 B桌：回复池含公用+专属B', pp.pub === true && pp.ownB === true && !pp.ownA, JSON.stringify(pp));

console.log('--- 切回 小A ---');
await evalJs(`window.setActiveContact('default')`);
await sleep(800);
b = await badgePub();
check('S1-7 回默认桌：角标=2', b === 2, 'badge=' + b);
pp = await poolProbe();
check('S1-8 回默认桌：回复池含公用+专属A', pp.pub === true && pp.ownA === true, JSON.stringify(pp));

console.log('===== S2 大库挂起路径（>12MB，低内存预算） =====');
// 大键（13MB）无法直接种进 localStorage（配额~5MB）：先正常加载，用 idbSet 写权威层，
// 清掉内存/LS 副本模拟「下次冷启动」，再以 deviceMemory=2 重载触发启动回填挂起。
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'deviceMemory',{value:2,configurable:true});` });
const bigSeed = await evalJs(`(function(){
  return new Promise(function(resolve){
    var cards=[]; for(var i=0;i<260;i++){ cards.push('公用大卡'+i+'_'+'x'.repeat(50000)); }
    var lib=JSON.stringify({text:[['公用组',cards]],kaomoji:[],emoji:[],sticker:[],image:[],poke:[],voice:[]});
    window.idbSet('xy-home-v2:cc-groups-public', lib).then(function(ok){
      // 清运行时副本，模拟冷启动（下次加载 idbRestore 才会面对这个大键）
      try{ localStorage.removeItem('xy-home-v2:cc-groups-public'); }catch(e){}
      resolve(JSON.stringify({ok:!!ok, size:lib.length}));
    });
  });
})()`);
console.log('  [信息] 大库写入 IDB:', bigSeed);
check('S2-0 大库已写 IDB 权威层', /"ok":true/.test(String(bigSeed)));
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(3000);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await sleep(4000); // 等 idbRestore 分批跑完（挂起判定发生在处理该键时）
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(900);

pp = await poolProbe();
check('S2-1 大库被启动回填挂起（进入懒加载场景）', pp.deferred >= 1, JSON.stringify(pp));

await openCardLib();
const t0 = Date.now();
let b2 = -999;
for (let i = 0; i < 40; i++) { b2 = await badgePub(); if (b2 > 0) break; await sleep(500); }
console.log('  [信息] 列表页角标等待耗时 ms=', Date.now() - t0, ' 角标=', b2);
check('S2-2 打开字卡库列表页后：角标自动水合为 260', b2 === 260, 'badge=' + b2);

pp = await poolProbe();
check('S2-3 列表页触达后：回复池含公用大卡', pp.pub === true && pp.deferred === 0, JSON.stringify(pp));

await openPublicPage();
await sleep(1500);
snap = await ccSnapshot();
check('S2-4 公用页显示大库', snap.visible && snap.hasBig1, JSON.stringify(snap));
await backFromCc();

console.log('--- S2 切桌面后再看 ---');
await evalJs(`window.setActiveContact('ctest1')`);
await sleep(1200);
pp = await poolProbe();
check('S2-5 B桌：已水合的公用大卡仍在回复池', pp.pub === true, JSON.stringify(pp));

await openCardLib();
b2 = await badgePub();
check('S2-6 B桌：列表页公用角标>0', b2 > 0, 'badge=' + b2);

await openPublicPage();
await sleep(1500);
snap = await ccSnapshot();
check('S2-7 B桌：公用页显示大库', snap.visible && snap.hasBig1, JSON.stringify(snap));
await backFromCc();

console.log('===== S3 冷启动挂起期直接切桌面（用户原始路径：不先进字卡库） =====');
// 再造一次「冷启动挂起」：清内存副本无法软做——直接重载页面（IDB 大库仍在、LS 无副本）
await evalJs(`(function(){ try{ localStorage.removeItem('xy-home-v2:cc-groups-public'); }catch(e){} return true; })()`);
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(3000);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(300); }
await sleep(4000);
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(900);
pp = await poolProbe();
check('S3-1 冷启动后公用大键再次挂起', pp.deferred >= 1 && pp.pub === false, JSON.stringify(pp));

// 不进字卡库，直接切桌面（S2 结束时在 B 桌 → 切回默认桌，制造真实切换事件）
await evalJs(`window.setActiveContact('default')`);
const t3 = Date.now();
let ok3 = false;
for (let i = 0; i < 30; i++) {
  pp = await poolProbe();
  if (pp.pub === true && pp.deferred === 0) { ok3 = true; break; }
  await sleep(500);
}
console.log('  [信息] 切桌面后回复池等公用卡耗时 ms=', Date.now() - t3);
check('S3-2 切桌面触发懒加载：回复池补上公用大卡+专属A', ok3 === true && pp.ownA === true, JSON.stringify(pp));

b = await badgePub();
check('S3-3 列表页角标同步为 260', b === 260, 'badge=' + b);

console.log('\n===== 诊断结果：' + pass + '/' + (pass + fail) + ' 通过 =====');
chrome.kill();
server.close();
process.exit(fail ? 1 : 0);

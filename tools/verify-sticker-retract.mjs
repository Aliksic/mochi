// ===== 回归验证：表情包/图片/语音撤回（v3.16.x 修复） =====
// 背景：renderMsg 里 rec.retracted 分支排在 sticker/image/voice/parts 类型分支之后，
// 撤回表情包后任何全量重渲染（renderWindow/loadMsgs/切会话）都会命中类型分支，
// 把表情包 img 重新渲染出来 → 撤回失效（红米 K80 Chrome 反馈）。
// 本脚本走真实链路：addRec 发送表情包 → retractMsg 撤回 → renderWindow 全量重渲染
// → 断言仍显示「撤回了一条消息」且无 img；再验证点击展开/收回、TA 撤回、图片/语音/图文。
// 用法：node tools/verify-sticker-retract.mjs
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); });
await page.goto(baseUrl + '/index.html', { waitUntil: 'load', timeout: 20000 });
for (let i = 0; i < 40; i++) {
  if (await page.evaluate('!!window.__mochiDataReady')) break;
  await sleep(300);
}
await page.evaluate("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()");
await sleep(900);
// 进入聊天页
await page.evaluate("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-chat');}); if(window.enterChat) window.enterChat(); return true;})()");
await sleep(500);

const probe = await page.evaluate("(function(){return JSON.stringify({addRec:typeof addRec,retractMsg:typeof retractMsg,renderWindow:typeof renderWindow,msgs:typeof msgs});})()");
check('核心函数在全局可用', (probe || '').indexOf('"addRec":"function"') >= 0 && (probe || '').indexOf('"retractMsg":"function"') >= 0 && (probe || '').indexOf('"renderWindow":"function"') >= 0, probe);
if ((probe || '').indexOf('"addRec":"function"') < 0) { await browser.close(); server.close(); process.exit(1); }

// ---- 测试 1：用户撤回自己的表情包（关键回归点：重渲染后仍撤回） ----
const r1 = await page.evaluate(`(function(){
  const PNG = ${JSON.stringify(PNG)};
  const out = [];
  const el = addRec({ side:'out', text: PNG, type:'sticker', ts: Date.now() });
  let b = el && el.querySelector('.msg-bubble');
  const before = { hasImg: !!b.querySelector('img.msg-img-sm'), txt: b.textContent };
  retractMsg(el, 'out');
  const afterRetract = { hasImg: !!b.querySelector('img'), txt: b.textContent };
  renderWindow(true, true); // 全量重渲染（模拟 loadMsgs 完成后/新消息触发的重建）
  const fresh = body.querySelector('.msg[data-idx="' + (msgs.length - 1) + '"] .msg-bubble');
  const afterRender = { hasImg: !!fresh.querySelector('img'), txt: fresh.textContent, dataIdx: fresh.parentElement ? fresh.parentElement.dataset.idx : '' };
  // 点击展开应能看到原文（查看撤回的消息），再点击收回
  let expandWorks = false, collapseWorks = false;
  if (fresh) {
    fresh.click();
    expandWorks = !!fresh.querySelector('img.msg-img-sm');
    fresh.click();
    collapseWorks = !fresh.querySelector('img') && fresh.textContent.indexOf('撤回了一条消息') >= 0;
  }
  return JSON.stringify({ before, afterRetract, afterRender, expandWorks, collapseWorks });
})()`);
const j1 = JSON.parse(r1);
check('撤回前表情包 img 已渲染', j1.before.hasImg === true, j1.before.txt);
check('实时撤回后无 img、显示撤回文案', j1.afterRetract.hasImg === false && j1.afterRetract.txt.indexOf('撤回了一条消息') >= 0, j1.afterRetract.txt);
check('【核心】全量重渲染后仍无 img、仍显示撤回文案', j1.afterRender.hasImg === false && j1.afterRender.txt.indexOf('撤回了一条消息') >= 0, j1.afterRender.txt);
check('点击可展开查看原文（查看撤回的消息）', j1.expandWorks === true);
check('再点击收回、恢复撤回态', j1.collapseWorks === true);

// ---- 测试 2：TA 撤回自己的表情包 ----
const r2 = await page.evaluate(`(function(){
  const PNG = ${JSON.stringify(PNG)};
  const el = addIn(PNG, { type:'sticker', initiative:true, ts: Date.now() });
  retractMsg(el, 'in');
  renderWindow(true, true);
  const b = body.querySelector('.msg[data-idx="' + (msgs.length - 1) + '"] .msg-bubble');
  return JSON.stringify({ hasImg: !!b.querySelector('img'), txt: b.textContent });
})()`);
const j2 = JSON.parse(r2);
check('TA 撤回表情包：重渲染后无 img、显示对方撤回文案', j2.hasImg === false && j2.txt.indexOf('对方撤回了一条消息') >= 0, j2.txt);

// ---- 测试 3：图片 / 语音 / 图文混排（parts）撤回后重渲染 ----
const r3 = await page.evaluate(`(function(){
  const PNG = ${JSON.stringify(PNG)};
  const res = [];
  const cases = [
    { name:'image', rec:{ side:'out', text: PNG, type:'image', ts: Date.now() }, imgSel:'img.msg-img-big' },
    { name:'voice', rec:{ side:'out', text:'语音消息|||' + PNG, type:'voice', ts: Date.now() }, imgSel:'.msg-voice' },
    { name:'parts', rec:{ side:'out', parts:[{ k:'img', v: PNG, sub:'sticker' }], text:'配文', ts: Date.now() }, imgSel:'img.msg-img' }
  ];
  cases.forEach(c => {
    const el = addRec(c.rec);
    retractMsg(el, 'out');
    renderWindow(true, true);
    const b = body.querySelector('.msg[data-idx="' + (msgs.length - 1) + '"] .msg-bubble');
    res.push({ name: c.name, hasMedia: !!b.querySelector(c.imgSel), txt: b.textContent });
  });
  return JSON.stringify(res);
})()`);
const j3 = JSON.parse(r3);
j3.forEach(t => check('撤回「' + t.name + '」后重渲染：无原内容、显示撤回文案', t.hasMedia === false && t.txt.indexOf('撤回了一条消息') >= 0, t.txt));

// ---- 测试 4：全量撤回后不再附加情绪字卡 ----
const r4 = await page.evaluate(`(function(){
  const el = addRec({ side:'out', text:'摸鱼打卡', mood:[{ tag:'交流意图', label:'摸鱼打卡' }], ts: Date.now() });
  retractMsg(el, 'out');
  renderWindow(true, true);
  const m = body.querySelector('.msg[data-idx="' + (msgs.length - 1) + '"]');
  return JSON.stringify({ hasMood: !!m.querySelector('.msg-moods'), txt: m.querySelector('.msg-bubble').textContent });
})()`);
const j4 = JSON.parse(r4);
check('全量撤回后情绪字卡不再渲染', j4.hasMood === false && j4.txt.indexOf('撤回了一条消息') >= 0, j4.txt);

await browser.close();
server.close();
const fails = results.filter(r => !r.ok);
console.log('\n===== 汇总：' + (results.length - fails.length) + '/' + results.length + ' 通过 =====');
process.exit(fails.length ? 1 : 0);

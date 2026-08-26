// ===== 诊断脚本：换头像后「顶部栏更新、消息气泡不更新」专项 =====
// 用户反馈：荣耀 200 Pro + Edge，「头像互动」换头像只换了聊天顶部栏，
// 联系人/我的聊天气泡头像没换。
// 验证：走真实 UI 路径（打开头像互动半框 → 点击头像池图片），断言
// ①顶部栏头像更新 ②.msg-in 气泡头像同步更新 ③.msg-out 不受影响；
// 再叠加「localStorage 配额满」场景看旧版遮蔽路径是否影响气泡。
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const { chromium } = await import('playwright');
let browser = null;
try {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const fs = await import('node:fs');
  const exe = fs.existsSync(edgePath) ? edgePath : (fs.existsSync(chromePath) ? chromePath : null);
  browser = exe
    ? await chromium.launch({ executablePath: exe, headless: true })
    : await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(baseUrl + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__mochiDataReady === true, null, { timeout: 30000 }).catch(() => {});
  await sleep(500);

  // 准备：头像池两张图 + 进入聊天页渲染消息 DOM
  const prep = await page.evaluate(() => {
    const out = {};
    try {
      const S = window.activeStore();
      const AV1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const AV2 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMjIwMEZGIi8+PC9zdmc+';
      S.set('avatar-lib', JSON.stringify([AV1, AV2]));
      S.set('cs-avatar-partner', AV1);
      out.AV1 = AV1; out.AV2 = AV2;
    } catch (e) { out.error = String(e); }
    return out;
  });

  // 进入聊天页（渲染历史消息）
  await page.evaluate(() => { try { window.enterChat(); } catch (e) {} });
  await sleep(800);

  // 若聊天区没有消息气泡，手动注入两条（结构与 renderMsg 产物一致）
  const hasMsgs = await page.evaluate(() => {
    const b = document.querySelector('.chat-body') || document.querySelector('#chat-body');
    return !!b && b.querySelectorAll('.msg').length > 0;
  });
  if (!hasMsgs) {
    await page.evaluate(() => {
      const body = document.querySelector('.chat-body') || document.querySelector('#chat-body');
      if (!body) return;
      const mk = (side, text) => {
        const m = document.createElement('div');
        m.className = 'msg ' + side;
        m.innerHTML = '<div class="msg-side"><div class="msg-av"></div><span class="msg-time">12:00</span></div><div class="msg-bubble"><span style="opacity:.85">' + text + '</span></div>';
        if (side === 'msg-out') m.innerHTML = '<div class="msg-bubble"><span style="opacity:.85">' + text + '</span></div><div class="msg-side"><div class="msg-av"></div><span class="msg-time">12:00</span></div>';
        body.appendChild(m);
        return m;
      };
      mk('msg-in', 'hi');
      mk('msg-out', 'hello');
    });
    await page.evaluate(() => { try { window.refreshChatAvatars(); } catch (e) {} });
    await sleep(300);
  }

  // 快照初始状态
  const snap = (label) => page.evaluate((label) => {
    const g = (el) => { if (!el) return null; const img = el.querySelector('img'); return img ? img.getAttribute('src') : 'NO_IMG'; };
    const out = {};
    out.partnerTop = g(document.getElementById('chat-partner-av'));
    out.userTop = g(document.getElementById('chat-user-av'));
    out.inAv = Array.from(document.querySelectorAll('.msg-in .msg-av')).map(g);
    out.outAv = Array.from(document.querySelectorAll('.msg-out .msg-av')).map(g);
    return out;
  }, label);
  const before = await snap('before');

  // 打开头像互动半框（真实 UI 路径）
  await page.evaluate(() => { try { window.openAvlib(); } catch (e) {} });
  await sleep(300);

  // 点击头像池第 2 张图（AV2）→ switchAvatarFromLib 完整链路
  await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('#avlib-grid .avlib-cell img'));
    if (cells.length >= 2) cells[1].click();
  });
  await sleep(600);

  const after = await snap('after');

  // ---- 断言：真实路径 ----
  const p1 = after.partnerTop === prep.AV2;
  const p2 = after.inAv.every(v => v === prep.AV2);
  const p3 = after.outAv.every(v => v === prep.AV1 || v === before.outAv[0]);
  const p4 = errors.length === 0;
  check('D1 顶部栏头像已换为 AV2', p1, JSON.stringify(after.partnerTop && after.partnerTop.slice(0, 30)));
  check('D2 所有 .msg-in 气泡头像同步为 AV2', p2, 'count=' + after.inAv.length + ' srcs=' + JSON.stringify(after.inAv.map(v => v && v.slice(0, 30))));
  check('D3 .msg-out 气泡不受影响(仍为 AV1)', p3, JSON.stringify(after.outAv.map(v => v && v.slice(0, 30))));
  check('D4 无页面级 JS 异常', p4, errors.slice(0, 3).join(' | '));

  // ---- 场景 E：localStorage 配额满 + 换头像（旧版遮蔽路径），验证气泡是否也被兜住 ----
  const e = await page.evaluate(() => {
    const out = {};
    try {
      const S = window.activeStore();
      const prefix = window.activePrefix();
      // 填满 localStorage
      const junk = 'x'.repeat(1024);
      let filled = 0;
      try { for (;;) { localStorage.setItem('__fill_' + (filled++), junk); } } catch (err) {}
      // 换新头像（远大于旧值 → 配额满时必写失败 → 只进内存缓存 + IDB）
      const AV3 = 'data:image/svg+xml;base64,' + 'A'.repeat(4096);
      S.set('cs-avatar-partner', AV3);
      out.lsVal = localStorage.getItem(prefix + ':cs-avatar-partner'); // 应仍是旧值（写失败）
      out.got = S.get('cs-avatar-partner'); // 应 = AV3
      window.refreshChatAvatars();
      const topImg = document.querySelector('#chat-partner-av img');
      out.topSrc = topImg ? topImg.getAttribute('src') : null;
      out.inSrcs = Array.from(document.querySelectorAll('.msg-in .msg-av img')).map(i => i.getAttribute('src'));
      // 清理
      for (let i = 0; i < filled; i++) { try { localStorage.removeItem('__fill_' + i); } catch (err) {} }
    } catch (err) { out.error = String(err); }
    return out;
  });
  check('E1 配额满后 localStorage 残留旧值(写失败真实发生)', e.lsVal !== e.got && typeof e.got === 'string' && e.got.length > 1000, JSON.stringify({ lsLen: e.lsVal ? e.lsVal.length : 0, gotLen: e.got ? e.got.length : 0 }));
  check('E2 配额满换头像后顶部栏渲染新头像', e.topSrc === e.got, 'topLen=' + (e.topSrc || '').length);
  check('E3 配额满换头像后所有 .msg-in 气泡渲染新头像', Array.isArray(e.inSrcs) && e.inSrcs.length > 0 && e.inSrcs.every(s => s === e.got), 'count=' + (e.inSrcs || []).length + ' lens=' + JSON.stringify((e.inSrcs || []).map(s => (s || '').length)));

  await browser.close();
} catch (e) {
  console.error('脚本异常：', e);
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
} finally {
  server.close();
}

const fails = results.filter((r) => !r.ok);
console.log('\n=== avatar-bubble 诊断 ' + (fails.length ? fails.length + ' 项失败' : results.length + '/' + results.length + ' 全绿') + ' ===');
if (fails.length) process.exit(1);

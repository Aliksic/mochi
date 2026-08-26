import { webkit } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// 移除开屏遮罩与常见弹层（验证脚本无需走交互流程）
await page.evaluate(() => {
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('hide'); setTimeout(() => { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 50); }
  document.querySelectorAll('.qa-mask, .mask, [id$="-mask"]').forEach(el => { try { el.style.display = 'none'; } catch (e) {} });
});
await page.waitForTimeout(600);
await page.click('.app[data-app="home"]');
await page.waitForTimeout(300);

const tabs = await page.$$eval('#page-home .fav-tab', els => els.map(e => e.dataset.htab + ':' + e.textContent.trim()));
console.log('TABS:', JSON.stringify(tabs));

// 空态
await page.click('.fav-tab[data-htab="coinrp"]');
await page.waitForTimeout(200);
console.log('RP visible:', await page.isVisible('#home-coinrp'));
console.log('RP empty text:', (await page.textContent('#home-coinrp')).trim().slice(0, 60));

// 制造一笔双向红包聊天记录（TA 发已领取 + 我发）
await page.evaluate(() => {
  // 走真实 addIn 链路（同步内存 + localStorage），special 传 redpacket
  window.chatAddIn('', { special: 'redpacket', rpAmount: 52.00, rpWish: '心意', rpStatus: 'received', rpTs: Date.now() - 3600e3 });
  window.chatAddIn('', { special: 'redpacket', rpAmount: 13.14, rpWish: '小礼物', rpStatus: 'pending', rpTs: Date.now() });
});
// 重新进入主页刷新渲染
await page.click('.fav-tab[data-htab="av"]');
await page.waitForTimeout(150);
await page.click('.fav-tab[data-htab="coinrp"]');
await page.waitForTimeout(200);
console.log('RP after:', (await page.textContent('#home-coinrp')).trim());

// 验证统计页摘要（联系人发红包：只 TA 的 in 记录 → 1笔 ¥52 已领取）
await page.click('#home-back');
await page.waitForTimeout(300);
await page.click('.app[data-app="stats"]');
await page.waitForTimeout(400);
await page.click('.fav-tab[data-stab="chat"]'); // 聊天记录 tab
await page.waitForTimeout(300);
const body = await page.textContent('#st-chat-content');
const m = body.match(/发红包[^]*?累计心意币[^]*?¥([\d.]+)[^]*?共 ([\d]+) 次/);
console.log('STATS rp summary:', m ? ('¥' + m[1] + ' · ' + m[2] + ' 次') : 'NOT FOUND');
const hasDetail = body.includes('¥52.00') && body.includes('已领取');
console.log('STATS rp detail rows still present?', hasDetail);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();

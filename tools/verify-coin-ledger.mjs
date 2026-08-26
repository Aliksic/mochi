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
// 直接移除开屏遮罩与常见弹层（验证脚本无需走交互流程）
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

await page.click('.fav-tab[data-htab="coinearn"]');
await page.waitForTimeout(200);
console.log('EARN visible:', await page.isVisible('#home-coinearn'));
console.log('EARN empty text:', (await page.textContent('#home-coinearn')).trim().slice(0, 60));

await page.click('.fav-tab[data-htab="coinask"]');
await page.waitForTimeout(200);
console.log('ASK visible:', await page.isVisible('#home-coinask'));
console.log('ASK empty text:', (await page.textContent('#home-coinask')).trim().slice(0, 60));

// 模拟赚钱 + 申请各一笔
await page.evaluate(() => {
  window.giftWalletChange(1314, 1314, '四子棋');
  window.giftCoinLedgerAdd('ask', 5200, 0, '聊天申请');
  window.giftCoinLedgerAdd('ask', 0, 1314, 'TA自动申请');
});

await page.click('.fav-tab[data-htab="coinearn"]');
await page.waitForTimeout(200);
console.log('EARN after:', (await page.textContent('#home-coinearn')).trim());

await page.click('.fav-tab[data-htab="coinask"]');
await page.waitForTimeout(200);
console.log('ASK after:', (await page.textContent('#home-coinask')).trim());

// 验证钱包数值（双方同额）
const w = await page.evaluate(() => window.giftWalletGet());
console.log('WALLET:', JSON.stringify(w));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();

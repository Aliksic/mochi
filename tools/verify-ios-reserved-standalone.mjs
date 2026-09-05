// verify-ios-reserved-standalone.mjs — #200 iOS 18.x standalone「系统保留状态栏」形态 行为断言
// 症状（iPhone 15 Pro + Safari 18.3 主屏幕，多 iOS 机型通用）：滑动/切换卡顿，自检
// 自动采集 ✗顶部重叠+底部少填，.phone 顶=-29/底=823。
// 根因：该形态 inner=screen−envTop（系统已垫走状态栏）但 env() 仍报真实高度——
// 既有链 ①写 --mochi-safe-top=59（双重避让）②#179 公式 safeTop+inner 把 .phone 写到
// 852 超出布局视口 793，body flex 居中裁切 + 文档恒溢出 59px 与自愈 pin 对打。
// 修复：syncVvFit 甄别（standalone && _safeTop≥20 && screen−inner ≥ _safeTop−8）命中时
//   _safeTop 归 0 且显式写 '0px'（摘除会回落 env()）；高度 bump/fs 公式随之自然贴 inner。
//   device.js 判定器同步：期望底边=inner、sbTop 期望=12、fs 期望屏高=inner。
// 用法：node tools/verify-ios-reserved-standalone.mjs（退出码 0=全过 1=失败）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');
const ma = src('src/js/mobile-adapt.js');
const device = src('src/js/device.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// ===== A. mobile-adapt.js syncVvFit：保留形态甄别表达式（逻辑锚点） =====
console.log('[A] syncVvFit 系统保留形态甄别');
{
  const m = ma.match(/var _sbDiff = \([\s\S]*?var _topPx = [^\n]+\n/);
  ok(!!m, '甄别块可定位（_sbDiff/_resStand/_topPx）');
  const blk = m ? m[0] : '';
  ok(/var _resStand = d\.classList\.contains\('ios-pwa-standalone'\) && _safeTop >= 20 && _sbDiff >= _safeTop - 8 && _iosMajor >= 18;/.test(blk),
    '甄别式：standalone && _safeTop>=20 && screen−inner ≥ _safeTop−8 && iOS≥18');
  ok(/if \(_resStand\) _safeTop = 0;/.test(blk), '命中即 _safeTop 归 0（高度 bump/双重避让随之失效）');
  ok(/_topPx = _safeTop \? _safeTop \+ 'px' : \(_resStand \? '0px' : ''\)/.test(blk),
    "保留形态显式写 '0px'（摘除属性会回落 env() 反而避让）");
  // 覆盖形态/已避让形态不受影响：bump 分支仍要求 _safeTop>0
  ok(/if \(d\.classList\.contains\('ios-pwa-standalone'\) && _safeTop > 0 && _ih2 > 0\) \{\s*vh = Math\.min\(_safeTop \+ _ih2/.test(ma),
    '#179 bump 分支仍挂在 _safeTop>0（保留形态=0 自然跳过，覆盖形态照旧）');
}

// ===== B. _safeTop 甄别式行为断言（提取表达式四场景求值） =====
console.log('[B] 甄别式四场景');
{
  const m = ma.match(/var _resStand = d\.classList\.contains\('ios-pwa-standalone'\) && _safeTop >= 20 && _sbDiff >= _safeTop - 8 && _iosMajor >= 18;/);
  ok(!!m, '甄别语句可提取');
  if (m) {
    const evalIt = (standalone, safeTop, sh, ih, iosMajor) => {
      const d = { classList: { contains: (c) => c === 'ios-pwa-standalone' ? standalone : false } };
      const _sbDiff = (sh > 0 && ih > 0) ? (sh - ih) : 0;
      let _s = safeTop;
      const hit = Function('d', '_sbDiff', '_safeTop', '_iosMajor', `'use strict'; return d.classList.contains('ios-pwa-standalone') && _safeTop >= 20 && _sbDiff >= _safeTop - 8 && _iosMajor >= 18;`)(d, _sbDiff, _s, iosMajor);
      if (hit) _s = 0;
      return { safeTopOut: _s, safeTopPx: _s ? _s + 'px' : (hit ? '0px' : '') };
    };
    // 用户实机：iPhone 15 Pro iOS 18.3 standalone（inner 793 / screen 852 / env 59）
    let r = evalIt(true, 59, 852, 793, 18);
    ok(r.safeTopOut === 0 && r.safeTopPx === '0px', '保留形态（59/852/793）→ safeTop=0 且显式 0px');
    // 覆盖形态（#179 设备）：inner≈screen，diff=0 → 不命中，bump 照旧
    r = evalIt(true, 59, 852, 852, 17);
    ok(r.safeTopOut === 59 && r.safeTopPx === '59px', '覆盖形态（59/852/852）→ safeTop=59 不变');
    // #148 已避让形态（iOS 26）：env=0 → 甄别不参与（_safeTop 本来就 0），回落 env 链
    r = evalIt(true, 0, 874, 812, 26);
    ok(r.safeTopOut === 0 && r.safeTopPx === '', '已避让形态（env=0）→ 不写 var（回落 env）不变');
    // 浏览器形态（非 standalone）：永远不命中（#199 coverBrowser 链接管）
    r = evalIt(false, 59, 852, 793, 18);
    ok(r.safeTopOut === 59 && r.safeTopPx === '59px', '非 standalone → 不命中（#199 浏览器覆盖链不受影响）');
    r = evalIt(true, 59, 852, 793, 17);
    ok(r.safeTopOut === 59 && r.safeTopPx === '59px', 'iOS17 覆盖形态信号（59/852/793）→ 不命中（#179 链防回归）');
    // 高度效果：保留形态 vh 不再 bump（bump 分支 _safeTop>0 不成立）→ 793 贴可视区
    const vhAfter = (safeTop, ih, vv) => {
      let vh = vv;
      if (safeTop > 0) vh = Math.min(safeTop + ih, 852 || (safeTop + ih));
      return vh;
    };
    ok(vhAfter(0, 793, 793) === 793, '保留形态 .phone 高=793（贴可视区，无文档溢出）');
    ok(vhAfter(59, 852, 793) === 852, '覆盖形态 .phone 高仍=852（#179 语义不变）');
  }
}

// ===== C. device.js screenDiagJudge：保留形态期望底边=inner（修好后不误报） =====
console.log('[C] screenDiagJudge 判定器');
{
  const m = device.match(/function screenDiagJudge\(inp\) \{[\s\S]*?\n  \}/);
  ok(!!m, 'screenDiagJudge 可提取');
  if (m) {
    let body = m[0]
      .replace(/^function screenDiagJudge\(inp\) \{/, '')
      .replace(/\n  \}$/, '')
      .replace(/^\s*const F = \[\];/, '')
      .replace(/^\s*const add = \(ok, name, detail\) => F\.push\(\{ ok: !!ok, name: name, detail: detail \|\| '' \}\);/, '')
      .replace(/\n\s*return F;\s*$/, '');;
    const run = (inp) => Function('inp', `'use strict'; const OUT=[]; const add=(ok,name,detail)=>OUT.push({ok:!!ok,name:name,detail:detail||''}); ${body} return OUT;`)(inp);
    // 保留形态：phoneBottom=793 应判「底部贴合」；852 应判「底部超出」
    const base = { scale: 1, envTop: 59, varTop: 0, diff: 59, standalone: true, innerH: 793, sbTop: 14, phoneBottom: 793, fsActive: false, iosMajor: 18 };
    let F = run({ ...base });
    ok(F.some(f => f.name.indexOf('底部贴合') >= 0 && f.ok), '保留形态底=793 → 底部贴合（期望=inner）');
    ok(!F.some(f => f.name === '顶部重叠'), '保留形态 sbTop=14 → 不再误报顶部重叠');
    ok(F.some(f => f.name.indexOf('顶部形态判定：系统保留形态') >= 0), '形态文案识别为系统保留形态');
    F = run({ ...base, phoneBottom: 852 });
    ok(F.some(f => f.name.indexOf('底部超出') === 0), '保留形态底=852（旧 bug 值）→ 报底部超出');
    // 覆盖形态（#179 设备）：底=852 贴合、sbTop=73 不误报
    const cov = { scale: 1, envTop: 59, varTop: 59, diff: 59, standalone: true, innerH: 793, sbTop: 73, phoneBottom: 852, fsActive: false, iosMajor: 17 };
    F = run(cov);
    ok(F.some(f => f.name.indexOf('底部贴合') >= 0 && f.ok), 'iOS17 覆盖形态底=852 → 底部贴合（期望=envTop+inner）');
    ok(!F.some(f => f.name === '顶部重叠') && !F.some(f => f.name.indexOf('顶部双倍') >= 0), 'iOS17 覆盖形态 sbTop=73 → 顶部双判都不误报');
    F = run({ ...cov, phoneBottom: 793 });
    ok(F.some(f => f.name === '底部少填 59px 白带'), 'iOS17 覆盖形态底=793 → 仍按 #179 报少填（防回归）');
    // 浏览器覆盖形态（#199）：不变
    F = run({ scale: 1, envTop: 35, varTop: 35, diff: 0, standalone: false, innerH: 817, sbTop: 45, phoneBottom: 817, fsActive: false });
    ok(F.some(f => f.name.indexOf('底部贴合') >= 0 && f.ok), '#199 浏览器覆盖形态 → 底部贴合（期望=inner）不变');
    // fsActive 期望屏高
    F = run({ ...base, fsActive: true, iosH: 793 });
    ok(!F.some(f => f.name.indexOf('--mochi-ios-h 与期望屏高不符') >= 0), '保留形态 fs 期望屏高=inner（793 不误报）');
    F = run({ ...cov, fsActive: true, iosH: 852 });
    ok(!F.some(f => f.name.indexOf('--mochi-ios-h 与期望屏高不符') >= 0), 'iOS17 覆盖形态 fs 期望屏高=envTop+inner（852 不误报）');
    F = run({ ...base, iosMajor: 17 });
    ok(F.some(f => f.name === '底部少填 59px 白带'), '同信号 iOS17（未命中保留形态）→ 仍走 #179 判 852（防回归）');
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

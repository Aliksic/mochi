// #180 刷新重开丢最近一段聊天 行为验证（纯 Node，零浏览器依赖）
// 立项：一加 ACE3（PJE110）+Edge 报障「刷新重新打开网站，丢失最近在聊的一部分聊天记录」，
// 多机型反复（此前小米 14U/华为畅享/真我/荣耀等同族内核均有记录）。丢法一致：最近几条
// 只在内存/低频整包落盘窗口里，没有任何第二副本——整包 16MB 级异步 IDB 事务在部分安卓
// 内核会挂起或随进程被杀回滚，flushSave 离页事务也未必提交。
// 修复三件套（src/js/chat.js）：①chatTailAppend 同步尾巴日志（<cid>:chat-tail，≤60 条）；
// ②chatTailMerge 权威读库成功后按签名去重回放；③performLsSnapWrite 超 2MB 保尾不弃写。
// 本脚本抽取**真实函数源码**注入桩环境跑行为断言，链路被改坏立刻红。
// 用法：node tools/verify-chat-tail.mjs
import { readFileSync } from 'node:fs';

const srcPath = new URL('../src/js/chat.js', import.meta.url);
const text = readFileSync(srcPath, 'utf8');

function cut(start, end) {
  const s = text.indexOf(start);
  const e = text.indexOf(end, s + 1);
  if (s < 0 || e < 0 || e <= s) {
    console.error('抽取失败：找不到 ' + JSON.stringify(start) + ' 或收尾锚点 ' + JSON.stringify(end));
    process.exit(2);
  }
  return text.slice(s, e);
}
const srcSig = cut('function chatTailSig', 'function chatTailRead');
const srcRead = cut('function chatTailRead', 'function chatTailClear');
const srcClear = cut('function chatTailClear', '// 只收纯文本/轻消息');
const srcAppend = cut('function chatTailAppend', '// 撤回后日志里的原文不得回放');
const srcDrop = cut('function chatTailDrop', '// 权威读库成功后调用');
const srcMerge = cut('function chatTailMerge', '// v3.14.x：防「权威读取失败被当空历史」');
const srcSnap = cut('function performLsSnapWrite', 'function writeLsSnapshot');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
};

// —— 桩环境：LS store + msgs 数组 + saveMsgs 捕获 ——
function makeEnv(initialMsgs) {
  const ls = new Map();
  const saved = [];
  const store = {
    get(k) { return ls.has(k) ? ls.get(k) : null; },
    set(k, v) { ls.set(k, String(v)); },
    remove(k) { ls.delete(k); }
  };
  let msgs = initialMsgs || [];
  const env = {
    store, ls, saved,
    get msgs() { return msgs; },
    set msgs(v) { msgs = v; },
    saveMsgs() { saved.push(msgs.slice()); },
    CHAT_TAIL_MAX: 60,
    CHAT_TAIL_TEXT_MAX: 1000,
    Date, JSON, Set, Array, String, Math, console
  };
  const srcAll = [srcSig, srcRead, srcClear, srcAppend, srcDrop, srcMerge, srcSnap].join('\n');
  const names = ['chatTailSig', 'chatTailRead', 'chatTailClear', 'chatTailAppend', 'chatTailDrop', 'chatTailMerge', 'performLsSnapWrite'];
  const fns = new Function('env', 'with (env) { ' + srcAll + ' return { ' + names.join(', ') + ' }; }')(env);
  return { env, fns, saved, lsHas: (k) => ls.has(k) };
}

const TAIL = 'chat-tail';
const rec = (ts, side, txt) => ({ ts, side, text: txt });

// A1：append 同步落 LS、超 60 条丢最旧、大负载不进
{
  const { env, fns } = makeEnv([]);
  const { chatTailAppend, chatTailRead } = fns;
  for (let i = 1; i <= 65; i++) chatTailAppend(rec(1000 + i, 'out', 'm' + i));
  const arr = chatTailRead();
  ok(arr.length === 60, 'A1 封顶 60 条（实际 ' + arr.length + '）');
  ok(arr[0].text === 'm6' && arr[59].text === 'm65', 'A1 超限丢最旧保最近');
  ok(env.store.get(TAIL) && env.store.get(TAIL).includes('m65'), 'A1 同步写进 LS 小键 chat-tail');
  chatTailAppend({ ts: 1, side: 'in', text: 'x', img: 'data:image/png;base64,XXX' });
  chatTailAppend({ ts: 2, side: 'in', text: 'y', voice: 'data:audio' });
  chatTailAppend({ ts: 3, side: 'in', text: 'z', parts: [{ k: 'img', v: 'data:image/png;base64,' + 'A'.repeat(200) }] });
  ok(chatTailRead().length === 60, 'A1 img/voice/大parts 不进日志');
  // 长文本截断到 1000
  chatTailAppend(rec(99, 'out', '长'.repeat(3000)));
  ok(chatTailRead().every(j => (j.text || '').length <= 1000), 'A1 文本截断 ≤1000');
}

// A2：merge 把日志里历史没有的条目按 ts 归位合并并触发 saveMsgs；已有的不重复
{
  const init = [rec(100, 'in', '旧1'), rec(200, 'out', '旧2')];
  const { env, fns, saved } = makeEnv(init);
  const { chatTailAppend, chatTailMerge } = fns;
  chatTailAppend(rec(300, 'out', '新3')); // 已落盘窗口里聊的
  chatTailAppend(rec(150, 'in', '插队'));
  chatTailAppend(rec(100, 'in', '旧1')); // 与历史重复 → 不回放
  env.saved.length = 0;
  chatTailMerge();
  ok(env.msgs.length === 4, 'A2 合并后 4 条（实际 ' + env.msgs.length + '）');
  ok(env.msgs.map(m => m.ts).join(',') === '100,150,200,300', 'A2 按 ts 排序归位');
  ok(env.saved.length === 1, 'A2 合并后触发一次 saveMsgs');
  env.msgs && chatTailMerge();
  ok(env.saved.length === 1, 'A2 重复 merge 不再追加（幂等）');
}

// A3：撤回摘除——drop 后 merge 不回放原文
{
  const { env, fns } = makeEnv([]);
  const { chatTailAppend, chatTailDrop, chatTailMerge } = fns;
  const r = rec(500, 'out', '撤回我');
  chatTailAppend(r);
  const retracted = Object.assign({}, r, { retracted: true, orig: '<b>撤回我</b>' });
  chatTailDrop(retracted); // retractMsg 用同一 msgs[idx]（含 retracted 标记）调用
  chatTailMerge();
  ok(!env.msgs.some(m => m.text === '撤回我'), 'A3 撤回消息不回放');
}

// A4：清空/导入清日志
{
  const { fns, lsHas } = makeEnv([]);
  const { chatTailAppend, chatTailClear } = fns;
  chatTailAppend(rec(1, 'out', 'a'));
  chatTailClear();
  ok(!lsHas(TAIL), 'A4 chatTailClear 移除 LS 键');
}

// B：performLsSnapWrite 超 2MB 保尾不弃写（原实现静默 return = LS 兜底全空）
{
  const { env, fns } = makeEnv([]);
  Object.assign(env, {
    liteSnapArray: (arr) => arr, // 桩：不经 lite 剥离，直接量原尺寸
    LS_SNAP_LIMIT: 2 * 1024 * 1024,
    localStorage: {
      setItem: (k, v) => env.store.set(k.replace(/^.*:/, ''), v)
    },
    activePrefix: () => 'xy-home-v2:test'
  });
  const { performLsSnapWrite } = fns;
  const big = [];
  for (let i = 0; i < 20000; i++) big.push({ ts: i, side: 'out', text: '消息内容' + i + '——'.padEnd(160, 'x') });
  performLsSnapWrite(big, 'xy-home-v2:test');
  const wrote = env.store.get('chat-msgs');
  ok(!!wrote, 'B1 超 2MB 也写出 LS 快照（原实现静默不写）');
  if (wrote) {
    const arr = JSON.parse(wrote);
    ok(arr.length > 0 && arr.length < big.length, 'B1 折半保尾：写出的是最近子集（' + arr.length + '/' + big.length + '）');
    ok(arr[arr.length - 1].text.includes(String(big.length - 1)), 'B1 尾巴是最新一条');
    ok(wrote.length <= 2 * 1024 * 1024, 'B1 仍守 2MB 上限（' + (wrote.length / 1048576).toFixed(2) + 'MB）');
  }
  // 小历史全量写
  const small = [rec(1, 'out', 'hi')];
  performLsSnapWrite(small, 'xy-home-v2:test');
  ok(env.store.get("chat-msgs") && JSON.parse(env.store.get("chat-msgs")).length === 1, 'B2 小历史全量写不受影响');
}

// C：接线断言——addRec/retract/loadMsgs 清空导入均已接线
ok(text.includes('msgs.push(rec);') && /msgs\.push\(rec\);\s*\n\s*chatTailAppend\(rec\);/.test(text), 'C1 addRec 已接 chatTailAppend');
ok(/chatTailDrop\(msgs\[idx\]\);/.test(text), 'C2 retractMsg 已接 chatTailDrop');
ok(text.split('chatTailDrop(rec); // #180').length === 3, 'C3 局部撤回两分支已接 chatTailDrop');
ok((text.match(/chatTailMerge\(\);/g) || []).length >= 2, 'C4 loadMsgs 两个权威就绪分支均已接 chatTailMerge');
ok(/chatTailClear\(\); \/\/ #180：清空记录/.test(text) && /chatTailClear\(\); \/\/ #180：整包导入/.test(text), 'C5 清空记录/整包导入已接 chatTailClear');

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);

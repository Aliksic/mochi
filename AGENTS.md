# AGENTS.md — Mochi 字卡传讯（多人/AI 协作约定）

## 项目是什么

情侣模拟聊天 PWA（单页应用）。所有 CSS/JS 由 `build.mjs` 合并进**一个** `index.html`（GitHub Pages 直接部署仓库根目录）。

**部署 = 改** **`src/`** **下的源文件 → 执行** **`node build.mjs`** **→ git 提交/推送。**

## ⚠️ 最重要的规则：构建只允许一个人执行

`index.html` 是构建产物（**不要手改 index.html**），谁最后 build 谁决定线上内容。

- **每次开工在 WORKLOG 首行声明「本次构建者：X」**；未声明时默认 AI-B。除构建者外，其他人只改 `src/` 源文件，**改完保存即可，不要自己 build**。

- 构建者执行前先跑 `git status`，区分两类噪音：`M` = 对方未提交的进行中改动（构建会包含它，先确认对方已保存完整）；`??` = 未跟踪的临时诊断脚本/截图（多数可忽略，build.mjs 会对未跟踪 `.mjs` 报警）。

- 严禁两个进程同时执行 `node build.mjs`。

## 文件分工（默认归属，互不越界）

### AI-A：业务功能（聊天 / 字卡 / 查岗 / 日历 / 信箱 / 朋友圈 / 音乐 / 占卜 / 纪念 / 小游戏等）

- JS（45 个）：`chat.js` `group-chat.js` `chatcard.js` `chat-settings.js` `reply-settings.js` `fav-settings.js` `default-cards-data.js` `default-cards.js` `mood-followup-data.js` `mood-reply-cards.js` `quote-cards.js` `ta-ask.js` `ta-mood-data.js` `ta-mood.js` `ta-invite.js` `ck-question.js` `incoming-requests.js` `calendar.js` `divination.js` `mail.js` `feed.js` `music-player.js` `decision.js` `group-decision.js` `records.js` `p2-features.js` `avatar-lib.js` `loc-lib.js` `gift-shop.js` `memo-app.js` `memo-arc.js` `my-arc.js` `period.js` `accounting.js` `garden.js` `room.js` `drift-bottle.js` `breakout.js` `connect-four.js` `coop-mine.js` `fishing.js` `memory-game.js` `pong.js` `snake-game.js` `cjian.js`

- CSS（12 个）：`home.css` `chat-main.css` `chat-pages.css` `setting.css` `tabbar.css` `market.css` `group-chat.css` `garden.css` `memo.css` `memo-arc.css` `room.css` `drift-bottle.css`

### AI-B：系统 / 移动端 / 全屏 / PWA / 全局样式 / 数据层

- JS（14 个）：`fullscreen.js` `mobile-adapt.js` `pwa.js` `bg-keep.js` `call.js` `sfx.js` `idb.js` `clock.js` `tabs.js` `desktop-slider.js` `personalize.js` `data-backup.js` `device.js` `contacts.js`（contacts 提供 `activeStore`/`activePrefix` 全局命名空间，同 idb 属数据层）

- CSS（2 个）：`base.css`（全局 + 手机端适配 + 全屏安全区，**含共享样式**）、`dark.css`（全局暗色主题，涉及所有页面明暗适配）

- 其他：`src/template.html` `src/pwa/`（manifest.json / sw\.js / notice.json / 图标）`build.mjs` `package.json` `tools/`

- 构建产物（根目录 `index.html` `sw.js` `version.json` `manifest.json` `icon-*.png` `notice.json`）：**由 build.mjs 生成，不要手改**

### 共享文件

- `AGENTS.md` / `WORKLOG.md` / `FIX-REGRESSION.md`：双方可写；改 AGENTS.md 或 FIX-REGRESSION.md 时在 WORKLOG 留一行说明。

### 配套规则文件（每个 AI 开工前按需读）

- `AI-RULES.md` — 回答方式与 Token 节约（禁通读产物、日志限长、会话纪律），**开工前必读**。
- `BUGS.md` — bug 修复规则（防回归七条）：修前必查台账、修根因不修症状、最小改动、修复标记注释、产物同步、修完三件事、三次复发熔断。
- `TASKS.md` — 任务队列/认领板：认领 = 行内写「认领人：X」置「进行中」，防抢活防撞车。
- `FILEMAP.md` — 产物 ↔ 源文件映射表（按功能快速定位 src 归属；冲突以 build.mjs 为准）。

### 跨领域时

- 默认不碰对方文件，即使"只改一行"。确需改动时：**先在 WORKLOG 记一行「跨域改动 <文件>，理由：…」**，改完在当条记录里告知对方；涉及 `base.css` / `fullscreen.js` / `mobile-adapt.js` / `template.html` 的关键结构改动，改前先看对方最近的 WORKLOG 状态。

- 遇到对方文件的 bug：**不要直接改**，在 WORKLOG / 回复里说明「需要对方处理：xxx」。

## 快速定位（按功能找文件）

| 功能                           | 主要文件                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 开屏 / 版本检测 / 安装提示             | `clock.js` `pwa.js` `template.html`（splash 区）`notice.json`                                                      |
| 手机桌面（主页/第二页/美化）              | `home.css` `desktop-slider.js` `p2-features.js` `personalize.js`                                                |
| 聊天（消息/输入栏/表情/拍一拍/美化）         | `chat.js` `chat-main.css` `chat-settings.js` `mood-reply-cards.js`                                              |
| 群聊                           | `group-chat.js` `group-chat.css`                                                                                |
| 字卡库 / 字卡管理                   | `chatcard.js` `default-cards-data.js` `default-cards.js` `quote-cards.js` `reply-settings.js` `fav-settings.js` |
| 查岗 / 定位 / TA 互动              | `incoming-requests.js` `ck-question.js` `loc-lib.js` `ta-ask.js` `ta-invite.js` `ta-mood.js` `ta-mood-data.js`  |
| 日历 / 每日留言                    | `calendar.js`                                                                                                   |
| 占卜                           | `divination.js`                                                                                                 |
| 信箱                           | `mail.js`                                                                                                       |
| 朋友圈                          | `feed.js`                                                                                                       |
| 音乐                           | `music-player.js`                                                                                               |
| 纪念 / 收藏 / 统计 / 记账 / 经期 / 备忘录 | `records.js` `p2-features.js` `accounting.js` `period.js` `memo-app.js` `memo-arc.js` `my-arc.js`               |
| 花园 / 房间 / 漂流瓶 / 礼物           | `garden.js` `room.js` `drift-bottle.js` `gift-shop.js` `market.css`                                             |
| 小游戏                          | `breakout.js` `connect-four.js` `coop-mine.js` `fishing.js` `memory-game.js` `pong.js` `snake-game.js`          |
| 通话 / 音效                      | `call.js` `sfx.js`                                                                                              |
| 全屏 / 移动端适配 / PWA / 设备        | `fullscreen.js` `mobile-adapt.js` `device.js` `base.css` `src/pwa/`                                             |
| 数据层（本地存储/备份/联系人命名空间）         | `idb.js` `data-backup.js` `contacts.js`                                                                         |
| 设置 / 外观                      | `setting.css` `dark.css` `personalize.js` `chat-settings.js` `reply-settings.js`                                |

## 构建顺序（改样式/脚本前必读）

- CSS 合并顺序：`base.css → home.css → chat-main.css → chat-pages.css → market.css → group-chat.css → setting.css → tabbar.css → dark.css → garden.css → memo.css → memo-arc.css → room.css → drift-bottle.css`（**后加载覆盖先加载**；跨文件覆盖要看这个顺序，实际以 build.mjs 的 `cssFiles` 数组为准）。

- JS 合并顺序：见 build.mjs 的 `jsFiles` 数组（`device.js`/`idb.js` 最先、`mobile-adapt.js` 最后）。**新增 JS 文件必须加进该数组**才会被打包；依赖前置（如 `window.showDeskPopup` 由 chat.js 定义，mail/feed 后才能用）。

- 新增 CSS 文件同理要加进 `cssFiles`。

## 数据与存储约定

- 所有本地数据存 localStorage，键前缀 `xy-home-v2:`；结构化/大数据同时写 IndexedDB（`idb.js`，键同前缀，启动时 `idbRestore` 回填到 localStorage）。

- **多联系人 = 独立命名空间** **`xy-home-v2:<cid>:`**（`contacts.js` 的 `activeStore`/`activePrefix` 提供当前桌面命名空间）；读写键先确认是全局键还是 per-cid 键，改跨桌面行为前先查键的读取方。

- 读写接口：`window.idbSet(key, val)` / `window.idbGet(key)`（Promise）。

- 纯本地、无后端；备份导入导出在 `data-backup.js`（导入会触发 `idbRestore` + `mochi-restore-done` 事件，开屏数据就绪依赖它；**回填完成前读到的键可能为空，涉及恢复时监听该事件或做好重试**）。

- **定期备份提醒是产品功能，受保护**：`pwa.js` 的 `backup-remind-bar`（距上次成功导出超 7 天且近 7 天未提醒过 → 顶部提醒条；iOS Safari 会系统级清空存储，唯一防线就是用户定期导出）。任何 AI **不得删除或绕过该提醒逻辑**；重构 `pwa.js` / `data-backup.js` 时必须保持其正常，失效按 bug 处理并登记 `BUGS.md`。

## 通用模式（避免重复踩坑）

- 弹窗/确认/输入一律用 `window.openModal(title, value, cb, opts)`（定义在 `personalize.js`，全站唯一弹窗方案）；**不要用 alert/confirm/prompt**（IAB/部分浏览器不支持）。

- 安卓上文本输入框会被 `mobile-adapt.js` 自动转成 contenteditable div（`.ce-box`），原 `input` 变 1px 幽灵锚点：**读写值/聚焦仍走** **`input.value`** **/** **`input.focus()`**（已做代理兼容），不要假设 DOM 里的 `input` 可交互；iOS 不做转换，保留原生输入框。

- 页面内容大部分由 JS 渲染，`template.html` 只放静态锚点（`id`）；**新增区块要 template 锚点 + JS 渲染两边同步**。

- iOS 无 Fullscreen API（全屏走 `.ios-fs-active` 类隐藏模拟状态栏）；安卓真全屏下 `env(safe-area-inset-top)` 可能返回 0，需要 `max(..., 12px)` 兜底。

- 所有弹层打开时由 `mobile-adapt.js` 自动锁背景滚动（`body.scroll-lock`），新增加载层要加入其 `FLOAT_SELECTORS` 列表。

## 新增功能 checklist（新功能/新页面开工前对照）

1. 新 JS/CSS 文件 → 登记进 `build.mjs` 的 `jsFiles`/`cssFiles`（顺序按依赖，device/idb 靠前、mobile-adapt 最后）。
2. 新页面/入口 → `template.html` 加静态锚点 + JS 渲染，两边同步。
3. 新设置项 → 对应设置文件（`chat-settings.js` / `reply-settings.js` / `personalize.js` / 对应页面 JS）。
4. 借鉴外部灵感/功能 → `README.md` 标注来源（有历史要求，务必）。
5. 用户可感知功能 → 功能介绍页 / 开屏公告补文案（`template.html` + `src/pwa/notice.json`）。
6. 涉及用户反馈过的问题 → 见下「回归防线」。
7. 改完 `node --check` 语法自检 → 通知构建者收口。

## 回归防线（防"修复被并行会话覆盖"）

- 用户反馈过的问题修复后：**在** **`build.mjs`** **的** **`FIX_SENTINELS`** **数组加一行** `{ name, file, needle }`（needle 为产物中的特征串，构建后自动检查）；**在** **`FIX-REGRESSION.md`** **清单加一行**（问题 / 修复要点 / 验证方式）。

- **needle 要选「逻辑锚点」，不是「名字」（v3.27.x 铁律）**：必须是「修复生效时必然存在、逻辑被改时必然消失」的表达式/选择器片段——例如 iOS 高度修复登记 `height:min(var(--mochi-ios-h, 100dvh), 100dvh)`，而不是 `syncVvFit`。函数名/变量名能被保留（AI 重写时留着名字改掉实现），哨兵照样全绿；逻辑表达式被改就消失了，才拦得住「名字在、逻辑变」。

- **needle 要在自己登记的那个** **`file`** **里唯一**：跨文件撞名（别处也有这段文本）或多条登记共用同一 needle，都是「哑哨兵」——把修复整块删掉构建照样报绿（实测踩过：`window.__jsErrors = window.__jsErrors || []` 在 chat.js 也有一份，删掉 device.js 的初始化行仍 146/146 全绿）。构建会体检并列出哑哨兵（含 needle 在自己文件里找不到、多条共用同一 needle、登记的 src 文件已改名/删除），看到就要把锚点收到唯一。

- **哨兵缺失 / 删除型回流会让构建退出码 = 1**（不再只是醒目警告），报警行附带处置提示：「src 里也没有＝修复真丢了，去 `src/<file>` 补回」/「src 里仍在＝产物没接入，查 `jsFiles`/`cssFiles`」。

- **非构建者改完 src 必须当场验证（v3.27.x）**：跑 `node build.mjs --check-sentinels`（只检查不构建，不写产物）——自己改的文件里有没有把别人的修复锚点整块删掉，当场见分晓，不用等构建者收口。**这是防覆盖的关键一步：验证从「收口时」提前到「每次保存后」**。

- **复发 ≥2 次的修复必须配 verify 脚本（v3.27.x）**：哨兵只证「代码还在」，证不了「行为正确」。同一问题第二次复发时，除更新哨兵外必须补 `tools/verify-xxx.mjs` 行为断言并纳入 `npm run verify:all`（fishing keepKey、snake-fs-result 是现有榜样）。只有哨兵没脚本的修复，被「名字保留逻辑改坏」时依然漏网。

- 有专项验证脚本就建 `tools/verify-xxx.mjs`（可提交，供构建者复用）；构建后先看哨兵输出，再看 `npm run verify` 系列；**一次性复跑全部回归脚本用** **`npm run verify:all`**（= `node tools/verify-suite.mjs`，按 通过 / 断言失败 / 环境不满足 / 超时 四类计数，环境缺口不算回归，清单清干净后可加 `--strict` 当门禁）。

- 修复被覆盖的典型场景：并行会话重写同文件、编辑器旧缓冲回写、新文件漏接入 build.mjs——构建/布局检查都照常通过，只有哨兵能发现。

## 并行工作协议

1. **开工前**：读 `WORKLOG.md` 最近条目（今天日期段 + 最近 10 条即可，不必全读）+ `git status` + `git log --oneline -5 -- <目标文件>`（看对方最近是否动过它）。**重点**：对方标了「进行中」/「未构建」的文件不要碰；对方留了「需要对方处理：xxx」的先处理或回复。同时**在 WORKLOG 首行声明「本次构建者：X」**。
2. **编辑中**：只碰自己名下的文件；跨域改动先留言（见「跨领域时」）。
3. **改完**：只保存 + `node --check`，不构建、不提交；WORKLOG 追加一行（模板见下）。
4. **构建**：仅构建者执行；构建前 `git status` 核对对方无半成品；构建后跑哨兵检查 + `npm run verify`；产物与 src 改动**同一次提交**，commit message 写清涉及范围。
5. **不要并行 commit/push**，避免 git 冲突和半成品入库。
6. **同一文件同一时间只允许一个 AI 认领（v3.27.x 硬规则）**：mochi 历史教训「并行会话重写同文件、编辑器旧缓冲回写」全是同文件并发——比锁任务更直接的是**锁文件**。要改对方名下的文件前，先在 WORKLOG 声明「占用 <文件>：<任务>」并等对方回应；发现目标文件有他人「进行中」标记，换文件或等它结束，禁止并行改同一个文件。

## 交接日志（WORKLOG.md）

- 两个 AI 无法直接对话，靠 `WORKLOG.md` 互相留话：开工/完工各追加一行。

- 条目模板（尽量照填）：

  ```
  ### YYYY-MM-DD HH:MM（任务一句话）
  - [AI 域]（**改动文件清单；构建状态：已构建·sw 版本 / 未构建**）。
  - 需求/反馈、根因、方案、验证、待对方处理。
  ```

- **上限：保留最近 15 条左右**，更早的归档进 `WORKLOG-archive/<YYYY-MM>.md`（归档时文件头注明归档日期）；文件超过 1MB / 3000 行就要归档一次。

- 记录里说的任务完成后再清理旧行。

## 工具脚本分类（tools/）

- `verify-*.mjs`：回归验证资产，**可提交**（构建者对照 FIX-REGRESSION.md 复用）。

- `diag-*.mjs` / `tmp-*` / `smoke-*` / `_*.mjs` / `probe-*.mjs`：临时诊断/复现脚本，**用完即删**；build.mjs 构建时会对未跟踪 `.mjs` 报警，提交前 `git status` 里不应剩一堆 `?? diag-*`。

- 截图/预览图（`*.png`）不入库（`.gitignore` 已含 `tools/*.png`）。

- `codebase-structure.md` 是本地快照（已被 gitignore），**内容可能滞后，以本文件为准**。

## git 提交规范

- commit message 沿用现有格式：`v3.26.x: 改动摘要`（摘要写清本次涉及范围）。

- **pre-commit 钩子自动跑哨兵（v3.27.x）**：提交含 `src/` 改动时自动执行 `node build.mjs --check-sentinels`，修复锚点缺失 = 提交被拒（覆盖在提交时截住，不进历史）。钩子入库在 `tools/hooks/pre-commit`；**新克隆/新机器激活一次**：`git config core.hooksPath tools/hooks`。紧急逃生口 `git commit --no-verify`（须在 message 说明原因）。

- **版本号三处同步（唯一事实源 = build.mjs）**：
  1. `build.mjs` 的 `APP_VERSION`（如 `v3.26.0`）——设置页显示的版本，commit message 前缀与它的系列（`v3.26`）保持一致；
  2. `sw.js` 的 `CACHE = 'mochi-<时间戳>'`——**build.mjs 每次构建自动改写**，不要手改；
  3. `version.json` 的部署时间戳——build.mjs 生成，不要手改。
  改版本只改 `APP_VERSION`（升级系列时），其余两处交给构建；设置页版本与 commit 对不上 = 漏改 APP_VERSION。

- 构建产物（`index.html` / `sw.js` / `version.json`）必须与 src 改动**同一次提交**，保持线上与源码一致。

- 提交前 `git diff` 自查改动范围，确认没有夹带对方的文件或未完成的一半改动。

## 技术红线（双方都遵守）

- **禁止整页** **`zoom`** **/** **`transform: scale`** **缩放**（曾导致 iOS Safari 严重卡顿 + UI 不适配）。需要调整尺寸时只改具体字号/间距。

- `fullscreen.js` 与 `base.css` 的全屏安全区规则（`.fs-active` / `.ios-fs-active` / `@media (display-mode: fullscreen)`）互相耦合，改动前先看对方状态。

- 手机端状态栏（`.statusbar`）显示/隐藏会影响所有页面顶部间距，改动要全局验证（首页有、全屏页无是原设计）。

- 验证方式：`npm run build` 后按需跑 `npm run verify`（无头 Chrome 按 390×844 / 360×640 检查布局：无缩放、状态栏显示、页面占满、聊天页贴底）/ `npm run verify:webkit`（iOS WebKit 布局）/ `npm run verify:device`（真机回归清单）；无头环境无法验证 iOS 真机性能，涉及 iOS 的改动需要真机测试。


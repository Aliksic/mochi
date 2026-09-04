# TASKS.md — 任务队列 / 认领板（多人 AI 协作）

> 防止两个 AI 抢活 / 漏活 / 重复撞车。分工见 `AGENTS.md`，日志见 `WORKLOG.md`，bug 台账见 `BUGS.md`。
> **认领 = 在该任务行写「认领人：X」并置状态「进行中」。提交/构建前先扫一眼本表，避免并行撞车。**

## 认领规则
1. 状态只有四种：`待认领` / `进行中` / `已完成` / `已取消`。
2. 认领前先看是否 `已取消`（勿做），认领时在行内标注认领人；同一任务只允许一人 `进行中`。
3. 完成 = 改完 src + 该条对应的 `产物已构建`（构建者执行）；仅改完 src 不算完成，标注 `源已完成·待构建`。
4. `已取消` 保留原因，防止后人重新开工（如「合成大西瓜·不做」）。

## 任务列表（新任务在顶部追加；完成/取消的移入下方归档区）

| # | 状态 | 认领人 | 任务 | 关联文件/编号 | 备注 |
|---|---|---|---|---|---|
| 128 | 待认领 | | **字卡库媒体令牌化/瘦身**：cc-groups 双作用域实测 62.8MB（#160），字卡表情/大图不走媒体池（无去重），#160 只砍了新上传上限、存量未清。方向：①字卡媒体令牌化进媒体池（跨卡去重）②「字卡库瘦身」列表（按单卡体积排序、一键删大 GIF，接 #160「存量手动清」尾巴） | src/js/chatcard.js, src/js/media-pool.js | 存储优化评估（2026-09-05，#166 同批）遗留项；chatcard.js 属 AI-A 域，跨域先在 WORKLOG 声明 |
| 127 | 待认领 | | **聊天记录分片/归档**（架构级，存储收益最大）：chat-msgs 单键实测 155~214MB 且 saveMsgs 整包重写——发 1KB 文字也重写 155MB（写放大），读写超时/iOS OOM/开屏恢复慢皆衍生于此。方案：热片 `chat-msgs`（最近 N 条）+ 冷片 `chat-msgs:arch:<n>` 按需懒读；#90 条数账本、LS 快照（≤2MB）、备份导出、相关 verify 需同步适配 | src/js/chat.js, src/js/idb.js, tools/verify-* | 存储优化评估（2026-09-05，#166 同批）遗留项；改动大，务必专项会话做 |
| 126 | 已完成 | AI-A | **公用/专属字卡分组停用开关**（v3.30.x）：字卡库管理页每个分组 header 新增眼睛开关，停用后该分组不再进入任何自动回复池（聊天/拍一拍/表情包/语音/朋友圈/信箱/群聊/TA主动分享）与面板，字卡保留可随时重新启用；数据键公用 `xy-home-v2:cc-groups-public-off`（已进 contacts.js EXCLUDE）/专属 `<cid>:cc-groups-off`，格式 `{分类:[分组名]}`；回复池 getter 统一走 `replyPoolGroups/replyPoolGroupsFor` 过滤；验证 verify-cc-group-off 12/12 | src/js/chatcard.js, src/js/contacts.js, src/css/chat-pages.css, src/css/dark.css, build.mjs, tools/verify-cc-group-off.mjs, FIX-REGRESSION.md | 产物已构建（sw mochi-mtjkcawp）；另修 ZCode 删除型哨兵 `ta.focus();` needle 撞车误报（收窄 `appendChild(ta);ta.focus();`） |
| | 待认领 | | | | |

## 归档区（已完成 / 已取消）

| # | 状态 | 认领人 | 任务 | 关联文件/编号 | 结果/原因 |
|---|---|---|---|---|---|
| 125 | 已完成 | AI-B | **base.css 修复锚点丢失 7 条**（iOS .phone min() 钳制×3、#114 statusbar safe-area、color-scheme:light、#115 chat-input will-change/translateZ） | src/css/base.css | 已恢复；2026-09-04 复查 `node build.mjs --check-sentinels` 全绿 321/321 哑哨兵 0 |
| 124 | 已完成 | AI-B | 构建收口：device.js 诊断 6 缺陷修复 + 新哨兵 7 条 + 防覆盖基建（verify.yml / pre-commit 钩子 / FIX-REGRESSION 设备索引） | src/js/device.js, build.mjs, .github/workflows/verify.yml, tools/hooks/, FIX-REGRESSION.md | WORKLOG 2026-09-02 确认已随全量构建打入、6 条新锚点在位 |
| | | | | | |
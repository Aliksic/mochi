# FIX-REGRESSION — 修复点回归清单

用户反馈过的关键问题 → 对应验证方式。**每次构建/上传前对照本清单跑相关检查**，
防止「已修复的问题在新版本复发」（历史教训：修复被并行会话覆盖 / 编辑器旧缓冲
回写 / 新文件漏接入 build.mjs，构建照常通过但功能已丢）。

## 使用方法

1. 构建后先看 build.mjs 的「关键修复哨兵」输出（自动检查产物特征，缺失会醒目警告）。
2. 按本清单跑相关专项脚本（`node tools/verify-xxx.mjs`）。
3. 全绿才提交推送；有红项先定位再上线。

## 清单

| # | 用户反馈问题 | 修复要点 | 验证方式 |
|---|---|---|---|
| 1 | iOS 主屏幕键盘盖住输入栏 | mobile-adapt `_ensureInputDocked` 停靠自愈 + base.css 去 min-height | `verify-ios-pwa-kbd.mjs` / 哨兵 `_ensureInputDocked` |
| 2 | iOS 保活音频嘟嘟声 | bg-keep `kaIsIOS` iOS 幅度 0.002 不可闻 | `verify-bg-notify-dedup.mjs` / 哨兵 `kaIsIOS` |
| 3 | 批量导入两行并成一个字卡 | chatcard `split(/\r\n|\r|\n/)` 按行拆分 | `verify-cc-batch-import.mjs` / 哨兵 |
| 4 | 表情包 GIF 变静态图 | chatcard/chat `isGif` 跳过 canvas 压缩 | 哨兵 `isGif` |
| 5 | 新文件漏接入 build.mjs（fishing/memory/my-arc） | build.mjs jsFiles 登记 | 哨兵 `fishing`/`drift-bottle` |
| 6 | 切换联系人桌面残留旧数据 | contacts `applyAvatars` 重渲染 | `verify-desk-popup-avatar.mjs` / 哨兵 |
| 7 | 信箱刷新后数据丢失 | mail `mailDbReady` 权威加载防护 | `verify-mail-isolation.mjs` / 哨兵 |
| 8 | iOS 大图崩溃（48MP/ProRAW） | personalize >8MB 拦截 + 失败不存原图 | `verify-bugfix-six.mjs` / 哨兵 |
| 9 | 关情绪字卡仍发心意/意图卡 | mood-reply 总开关总闸 | `verify-data-loss.mjs` 相关 / 哨兵 |
| 10 | 通知图标黑圈/整条丢失 | bg-keep noMedia 降级重发 | `verify-bg-notify-dedup.mjs` / 哨兵 |
| 11 | iOS Edge 弹键盘整页挤压 | mobile-adapt lockDocScroll + visualViewport | `verify-ios-kb-edge-scroll.mjs` |
| 12 | 朋友圈多回合评论只剩一条 | feed 深度合并评论 | `verify-feed-comment-merge.mjs` |
| 13 | 聊天记录重进丢失 | chat LS 快照兜底 + IDB 权威 | `verify-chat-switch-idb-timeout.mjs` |
| 14 | OPPO/雨见 搜索框打不出字 | 搜索 input 标记 ceDone 跳过 ce-box | `verify-cc-scope.mjs` |
| 15 | 音乐本地上传无法播放（夸克） | Blob + URL.createObjectURL 播放 | `verify-music-dur-cover.mjs` |
| 16 | 全屏无法关闭（OPPO Edge） | fullscreen 关闭分支先无条件退出 | `verify-desktop-mode-force.mjs` |
| 17 | 桌面点聊天被今日留言弹窗挡住 | calendar 今日留言改顶部横幅 | `verify-cal-firstuse.mjs` |
| 18 | 字卡库打开卡顿/白屏（iOS） | chatcard 分批渲染 + 去阴影 | `verify-cc-tab-totals.mjs` |
| 19 | 后台收不到消息（小米） | bg-keep 回前台 dispatch mochi-fg-resume | `verify-bg-keep-retry.mjs` |
| 20 | 数据丢失（OPPO Chrome 三连） | migrateLegacy 全局键排除 + IDB 权威 | `verify-data-loss.mjs` |
| 21 | iOS 收藏页缺条目（收藏5条只显示3条 / 提示已收藏过却没显示） | chat 收藏判重按归属+时间戳；启动回填只补不覆盖 | `verify-fav-dedup.mjs` / 哨兵 `(f.by \|\| 'me') !== 'ta'` |
| 22 | 语音播放矢量图标点击无互动变化（录制面板试听钮 + 聊天语音气泡） | 播放/暂停双 SVG + `.playing` 换暂停竖条 + `:active` 按压缩放（chat.js/group-chat.js/template.html + chat-main.css） | `verify-voice-play-icon.mjs` / 哨兵 `voice-ico-pause`、`.msg-voice-play:active` |
| 23 | 单聊联系人发消息无音效（红米 Turbo4 Pro / Via：选了内置音效不响，其他音效正常） | chat.js addIn 统一播 `playSfx('in')`（silent 与已读回执 `special:'read'` 不播）；sfx.js playBuiltin 等 AudioContext resume 完成再 start | `verify-sfx-in-chat.mjs` / 哨兵 `opts.special !== 'read'`、`p.then(start)` |
| 24 | 群聊里语音被引用时整串 base64 代码霸屏（vivo Y35 + Edge 反馈） | group-chat.js `gcQuoteHtml` 增 `gcQuoteTextSafe` 清理（与聊天页 quoteTextSafe 同构）：历史/导入数据里语音引用存的是原始「名称\|\|\|data:audio;base64…」，字符串分支直出会霸屏；对象分支的 `q.t` 同样清理 | 哨兵 `gcQuoteTextSafe` / `verify-voice-quote-gc.mjs` |
| 25 | 三星 S24 / Chrome 进聊天页卡顿后页面崩溃（旧账号大数据 OOM） | chat.js 全量 migration/去重 pass 改**分批延迟归一化**（`runDeferredNormalization` 后台 2500 条/片 setTimeout 跑）；读库后先出首屏；无本地待合并数据时跳过全量签名 Set（hasLocal 短路）——主线程阻塞从数秒降到约百毫秒 | 哨兵 `scheduleDeferredNormalization` / `diag-oom-chat-load.mjs`（seed 4万条，同步段≈107ms、无崩溃、__jsErrors=0） |
| 26 | 消息长按打不开引用/操作菜单 | chat.js `msgActionEligible`+`openMsgActionsAt`：轻点保留，**新增长按**(touchstart 500ms) 弹菜单；`contextmenu`/`preventDefault` 抑制系统选中与默认菜单，`msgSuppressClickUntil` 抑制松开后误触发轻点（防弹即关）；群聊 group-chat.js `gcOpenMsgActions` 同步 | 哨兵 `openMsgActionsAt` / `gcOpenMsgActions` |
| 27 | 诊断角标显示有错误、导出却「最近错误：无」（错误记录无法保存） | device.js 错误记录双写 IndexedDB：`pushErr` 同步写 LS + `idbSet(ERR_KEY)`；新增 `readErrs`（LS 为空回退 IDB），collectDiag / refreshBadge / 已读计数统一走它；备份导入清空 `xy-home-v2:*` 键后启动时 idbRestore 自动回填，错误线索不再丢 | 哨兵 `idbSet(ERR_KEY` / 验证：记录错误→清空 xy-home-v2 前缀→刷新→诊断仍显示最近错误 |
| 28 | 已刷新到新版、顶部仍反复提示「刷新使用新版」 | pwa.js 更新条防重复：① 新增**按版本**免打扰标记 `xy-home-v2:ver-update-ack-ts`（点「刷新使用新版」/「稍后」时记为当时线上 version.json 的 ts，之后只对**比这更新的版本**再提醒——一天多次部署每次都会提醒一次，不会一天只弹一次）；② 版本轮询 + SW updatefound 两通道收敛共用 `showVerBar(onlineTs)` 跨通道一次性去重；③ SW 通道弹条前比对页面 data-build-ts 与线上 version.json ts，页面已最新则跳过（SW 交接期 reload 后新页面不再误报） | 哨兵 `ver-update-ack-ts` / `showVerBar` / 验证：刷新到新版后该版本不再弹；同日再部署新版仍会提示 |
| 29 | 聊天拍一拍面板「公用拍一拍」tab 选中态是虚线、与旁边 tab 不一致 | chat-main.css `.poke-tab-pub.sel` 去掉 `border-style:dashed`，改实心填充（与「我的拍一拍」`.sel` 同款）；dark.css 同步 `poke-tab-pub.sel` 实心（`--ink` 底 + 深字） | 哨兵 `poke-tab-pub.sel{background:var(--ink)` / 验证：拍一拍面板选中「公用拍一拍」时无虚线、与「我的拍一拍」选中观感一致 |
| 32 | 桌面美化点【恢复默认布局桌面】点了没反应（没恢复） | personalize.js 恢复默认弹窗用 `ctl.pills([{label:'确定恢复默认',value:'1'}],'1')` 预选中唯一 pill——noInput 弹窗只点底部「确定」时 fire() 传 pillVal=null → 静默不执行。与「删除美化方案」同因同修 | 哨兵 `确定恢复默认'}, '1')` / `tools/verify-desk-beauty.mjs`（只点确定 → desk-layout 清除） |
| 33 | 桌面美化的【内置壁纸预设】没应用到桌面（切 tab 后被清掉） | personalize.js `applyBgVisibility` 原来只认自定义 `phone-bg`，预设（`phone-bg-preset`）只在加载时铺一次，任何 tab 切换都把它清掉；现抽出 `bgPresetCss()`，可见性判断改为「自定义图优先、其次内置预设」 | 哨兵 `bgPresetCss` / `tools/verify-desk-beauty.mjs`（预置预设→刷新应用、切 tab 后仍在） |
| 30 | 吃什么「切换菜单」只能转盘随机，无法直接选指定菜单再用转盘抽菜 | p2-features.js 切换浮层（`eat-switch-overlay`）新增 `#eat-switch-chips` 菜单列表：点 chip 即 `eatSwitchTo(i)` 直接切到该菜单（不走随机）；转盘保留为「或转盘随机选」；chat-pages.css 增 `.eat-switch-chips`/`.eat-switch-or` | 哨兵 `function eatSwitchRenderChips` / 验证：多吃什么→切换菜单→浮层首行出现菜单 chips，点「外卖」立即切走并重画该菜单转盘，再点「转盘抽取」抽外卖菜品 |
| 34 | 聊天里联系人一直发送兜底那几条系统预设字卡（部分手机） | 双根因：① chat.js `ensureReplyCardsReady` 就绪判定用合并池（含系统默认字卡）→ 默认字卡开着时池恒非空、直接放行，挂起大键里的自定义字卡永不取回；改以「自定义字卡是否就位」为准（`hasCustomReplyCards`）。② chatcard.js `groups` 变量冷启动停在脚本加载期的空值，`applyRestored` 在「IDB 与本地数量相等」时跳过刷新 → 回复池 getter 只读得到公用字卡；新增 `replyScopeGroups` 在 getter 里检测 groups 空但 store 有数据时按需重载。群聊 `hydrateLibForCid` 已无条件取回不受影响 | 哨兵 `function replyScopeGroups` / `tools/diag-cards-hydrate.mjs` Phase E（冷启动 ensureReplyCardsReady 后 getPool 含自定义 MARKER，8/8 通过） |
| 35 | 桌面/聊天美化方案列表点【应用】只点底部确定没反应（没应用上） | 与「恢复默认桌面/删除方案」同因同修：personalize.js `applyScheme` 与 chat-settings.js `applyChatScheme` 的确认弹窗是 noInput 单 pill（「应用」），只点底部「确定」时 fire() 传 pillVal=null → `v!=='ok'` 静默不应用；现 `ctl.pills([{label:'应用',value:'ok'}],'ok')` 预选中唯一 pill | 哨兵 `{ label: '应用', value: 'ok' }], 'ok')` / 验证：美化方案→应用→只点确定→桌面/聊天立即生效并 toast |
| 36 | 档案/番茄钟等「取消/确认」型 noInput 弹窗只点底部确定没反应（删除这条/了解/疑问/暂不适用/已了解、删除描述卡、提前结束番茄） | 与 #32/#35 同因：noInput + pills + 无 `pill` 预设 → 只点底部「确定」时 fire() 传 pillVal=null → `v!=='del'/'yes'/'only'/'1'` 静默不执行。memo-arc.js delLi/delKnow/delEntry/delWonder/retireKnow/solveWonder、my-arc.js delLi/delSelf、p2-features.js `pmpQuitAsk` 均改 `pill:'del'/'yes'/'only'/'1'` 预选确认动作（删除/暂不适用/只是已了解/结束），只点确定即生效 | 哨兵 `noInput: true, pill: 'del', pills`（memo-arc + my-arc）、`noInput: true, lock: true, pill: '1', pills`（p2-features） / 验证：删除档案条目→只点确定→已删除 |
| 37 | 导出数据没有进度提示，且没弹确认框文件就直接下载了（用户还没点下载文件已保存） | data-backup.js doExport 复用 impShow 加**导出进度遮罩**（读取全部数据 n/total → 打包 → 写自动备份副本 → 准备保存），结束 impHide；saveBackupFile 删除静默自动 `a.click()` 兜底，改为返回 'blocked' 后弹「备份已打包完成」确认框，用户点「确定」（有效手势）才调 `anchorDownload(blob,fname)` 真正下载，避免"未经用户同意悄悄保存/Android 被拦截" | 哨兵 `anchorDownload` / 验证：导出大备份→出现进度遮罩、无提前下载、点确定才下载保存 |
| 38 | 设置页「复制诊断信息」点【复制】没弹窗反馈、还把浏览器网页刷新了 | 双修：① **反馈**——复制结果原本只写回弹窗顶部提示行（与打开时文案几乎相同→看不出变化）；现 device.js 改走原生 `document.execCommand('copy')`（divination.js 在用，无权限弹窗不重载）+ `window.toast` 底部气泡兜底，自动复制复/按钮复/导出都弹 toast。② **刷新**——弹窗底部 4 个按钮（复制/导出txt/取消/确定）是全站唯一漏写类型、默认 `submit` 的按钮组，个别 webview 点按会触发默认行为整页刷新；template.html 全部补 `type="button"` | 哨兵 `document.execCommand('copy')`、`type="button" class="modal-btn copy" id="modal-export"` / 验证：点【复制】出现底部「已复制到剪贴板」toast、页面不刷新；点【导出txt】出「已开始下载 txt」toast |
| 39 | 编辑聊天文字消息，发送一条新消息后，编辑内容会变回编辑前的原文（红米 K80 Chrome） | 单聊普通文字消息全部经 `buildParts` 生成 `rec.parts`，renderMsg 的 **parts 分支优先于 rec.text**。旧编辑逻辑只改 `rec.text` + 直接热替换气泡内文，`rec.parts` 仍是原文 → 一旦因发送新消息/滚动触发重渲染（renderWindow），底稿改回原文。现 chat.js 编辑确认回调内同步**重建 rec.parts**：保留非 text 段、文字段替换为新值 | 哨兵 `.filter(p => p && p.k !== 'text')` / 验证：编辑一条文字 → 发送新消息 → 编辑内容保持；再编辑一次仍显示当前值并持久化 |
| 40 | 荣耀 200 Pro Edge：系统预设字卡「朋友圈/写信使用」「我可发送语音」关掉后退出浏览器重进又变回去（Via/雨见正常）；语音开关点一次没反应要点第二次 | 双根因双修：① **写入挂起**——idbSet 无超时，荣耀/Edge 内核事务偶发挂起（既不 onsuccess 也不 onerror）→ Promise 永不 resolve、重试骨架永不触发，IDB 权威层停留旧值；加 4s 超时+重建连接重试（与 idbGet 同款）。② **杀进程回滚**——切开关后很快退出浏览器，Edge 把 localStorage 最近一次磁盘提交整批回滚；重启后 idbRestore retainValue 以「LS 有值且未标脏」为准 → 永远取回回滚后的旧值。新增**小键写日志** `__wr-journal`（xyStore.set 对 ≤64KB 值同步记 {k,v,t}，LS+IDB 双持久化，≤40 条/128KB），启动同步回放 LS 日志（先于模块初始化），restore 完成后异步合并 IDB 日志并广播 `mochi-wrj-heal`；dc-*/cs-voice-send 开关监听 heal 重同步 UI。语音开关另去掉「与存储值相同则静默早退」守卫（回填旧值时首点被静默吃掉=点一次没反应）。诊断新增「开关持久化体检」（LS/读取/IDB 三层值+写探针） | 哨兵 `连接疑似挂起`/`__wr-journal`/`mochi-wrj-heal`×2/`开关持久化体检` / 验证：切开关→立即杀浏览器进程重开→开关保持；若复现，设置→复制诊断信息看「开关持久化体检」三层值定位 |
| 41 | 仍有手机没解决：聊天里联系人一直发送兜底几条系统预设字卡（慢/挂 IDB 手机：真我/荣耀 Edge 事务偶发挂起、MB 级字卡库读取 >8s） | 在 #34 基础上第四轮收口：① **idbHydrateKey 4s+4s 改 6s+8s**——4s+4s 对「慢但可用」的读取有害（4s 到就重建连接重开事务白费读进度，二次也只给 4s → >8s 的慢机永远取不回）；改首试 6s 耐心等慢读、仍无返回才重建连接（挂起连接重开通常当场恢复）、二次给足 8s，总上限 14s（回复等待 20s 仍兜住）。② **群聊成员回复防卡死**——hydrateLibForCid 串行取公用+专属键最坏 28s，慢机被拖十几秒像卡死；新增 `gcHydrateWait` 上限 2.5s，超时放行、下次回复再取（含撤回补发路径两处统一）。③ #34 的 `replyScopeGroups` 惰性重载已覆盖单聊 getter 空库场景 | 哨兵 `window.idbHydrateKey = function` / `tools/diag-cards-hydrate.mjs` Phase E（冷启动 ensureReplyCardsReady 后 getPool 含自定义 MARKER，8/8 通过）/ 验证：慢/低端手机重启后联系人回复不再发兜底那几条预设卡 |

## 维护

- 新用户反馈问题修复后，**在 build.mjs FIX_SENTINELS 加一行哨兵**（代码特征）
- 有专项验证脚本的，在此表加一行
- 每次上传由构建者按本清单跑相关项，全绿才推送

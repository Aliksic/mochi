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

## 维护

- 新用户反馈问题修复后，**在 build.mjs FIX_SENTINELS 加一行哨兵**（代码特征）
- 有专项验证脚本的，在此表加一行
- 每次上传由构建者按本清单跑相关项，全绿才推送

# 本次构建者：AI-A（本会话：#153 Chromium139 后台冻结 1 分钟致后台通知全停/回前台积压爆发，改动 src/js/bg-keep.js、build.mjs 哨兵 2 条、FIX-REGRESSION.md #153 行；开工时 git status 干净，工作区含并行会话 #149 设备记录文档改动一并入库）

### 2026-09-04 17:4x（防倒卖文案铺开到开屏以外：链接分享卡片/设置页/功能介绍页/PWA 安装信息；已构建）
* [AI-B 域]（**改动文件：src/template.html（①title 改「Mochi 字卡传讯（完全免费·禁止倒卖）」+ meta description 补免费/倒卖诈骗/署名/买家直呼——QQ/微信转发链接时分享卡片标题与摘要直接显示防倒卖文案，掐死转发环节；②设置页 set-alert 静态块补署名+严禁倒卖+买家直呼句，与运行时回填写入内容一致（此前静态兜底缺倒卖句致回填每次重写，现 marked 通过不再重写）；③功能介绍页 lic 页 hero 药丸加「完全免费·禁止倒卖」、许可卡药丸加「严禁倒卖」+ 许可条目加严禁倒卖/买家直呼行）、src/pwa/manifest.json（description 同步防倒卖文案，PWA 安装提示/应用信息可见）；构建状态：已构建·sw mochi-mtmq0vkg 哨兵 305/305 哑哨兵 0、verify-anti-scam-backfill 13/13**）。
* 需求：用户要求开屏以外的地方也写防倒卖；边界不变（纯静态文案、零逻辑零性能开销、不影响正常用户与二传自部署）。
* 验证：产物断言 title/set-alert 倒卖句/lic 严禁倒卖行/manifest description 全部在位；node --check 无涉（纯 HTML/JSON 文案）；哨兵 305/305。
* 待真机：QQ/微信转发官方链接看分享卡片标题带「完全免费·禁止倒卖」；设置页底部声明含倒卖句；功能介绍页许可卡含严禁倒卖行。

### 2026-09-04 17:0x（防倒卖收尾：置顶条补「买家直呼」句——目标收窄为只防官方链接倒卖，不加任何影响用户/二传者的技术手段；已构建）
* [AI-B 域]（**改动文件：src/template.html（署名·禁倒卖置顶条 <p> 末句改）、src/pwa/notice.json（alert2 同步）、src/js/clock.js（回填 BARS[1].fallback 同步——三处文案源保持一致）；构建状态：已构建·sw mochi-mtmpg9sv 哨兵 305/305 哑哨兵 0、verify-anti-scam-backfill 13/13**）。
* 需求边界：用户确认不做反调试/误伤性手段、不误伤正常二传自部署，只防「官方链接被倒卖」——结论：现有防线（置顶双声明+回填+许可条款）即该场景的全部所需；原提「埋点分散化/远程时效公告」防的是代码搬运型倒卖，按边界放弃不做。
* 文案改动：「发现请拒买并举报」→「如果你是花钱买来的链接：你被骗了，请拒付退款并举报卖家」（直接对已付费买家喊话，杀死倒卖成交）。marks 特征词（署名/倒卖/署名锚点）不变，回填在位判定与 verify 断言不受影响。

### 2026-09-04 16:4x（#153 安卓多机型「挂后台不弹通知、回前台一口气弹出」：Chromium139 冻结线 5min→1min 撞上保活退避静默窗口；已构建）
* [AI-B 域]（改动：src/js/bg-keep.js 两处、build.mjs FIX_SENTINELS 2 条、FIX-REGRESSION.md #153 行）。
* 根因：Chromium 139 起安卓后台页面冻结 5 分钟→1 分钟（stop-in-background，Edge 等 chromium 系内核跟进，多机型同时出现=环境变化非代码回归）；保活音频被抢焦点暂停后退避最长 60s，静默窗口跨过冻结线→整页冻结→定时器全停=后台无消息无通知，回前台解冻+mochi-fg-resume 补触发一口气补跑。
* 修复（通用根因修复无机型分支）：①切后台方向保活自愈（visibilitychange→hidden：音频暂停时清退避+立即补播+最快档 5s 重试；原只有回前台 healKeepAlive，切后台方向空白）；②隐藏期补播退避封顶 20s（前台 60s 不变，不回归 v3.13.x 音频拉锯修复）。
* 验证：node --check 过；needle 双双源文件内唯一；构建哨兵 305/305 全绿哑哨兵 0。待真机：挂后台 10min+ 通知照常弹、回前台不再积压爆发、前台听歌切后台音频让位节奏不变。

# 本次构建者：AI-B（本会话：#151 切联系人桌面三回归修复，改动 src/js/personalize.js、build.mjs 哨兵5条、FIX-REGRESSION.md #151 行、tools/verify-desk-switch.mjs；开工时工作区含 #150/#149 会话已构建完成的改动，本次构建一并收口）

### 2026-09-04 15:0x（#149 第二台确认设备 vivo X200s Edge＝部署前旧版，同一 bug 无需改码；仅更新 FIX-REGRESSION 设备记录；文档提交）
* [AI-A 域]（**改动文件：FIX-REGRESSION.md（#149 症状补 vivo X200s Edge 13:38 诊断＝构建 ts 1788499094635 即 13:18 旧版，非新根因；设备索引 vivo X200s 加 149）、WORKLOG.md 本行；构建状态：无源码改动不涉及构建，线上 ts=1788503650235（14:34）已含 #149 修复**）。
* 核对：src/js/chat.js 四处 mochiMediaIsToken 判定在位（5 处引用）、build.mjs #149 哨兵 4 条在位、--check-sentinels 303/303 哑哨兵 0——#150/#151 两次后续构建未覆盖本修复。
* 待真机：vivo X200s 更新构建（杀 PWA 重开/刷新两次）后复测引用缩略图，同 #149 验证方式。
* 另记：vivo 诊断含一条 00:10:50 page-chat `Cannot read properties of null (reading 'duration')`（:40704，疑似音频元数据未就绪读 duration，仅 1 次未复现），暂不立案，复发再查。


### 2026-09-04 14:4x（#152 iQOO Neo10Pro 等安卓「继续说」按钮点击无回复：键盘收起吞 click，触摸改 pointerdown；源已完成·未构建，请构建者收口）
* [AI-A 域]（**改动文件：src/js/chat.js（chat-continue-btn 触摸 pointerdown 按下即触发+1.2s 防重入+鼠标 click 原样；continueChat 主逻辑不动）、src/js/group-chat.js（gc-continue-btn 同款，stopPropagation 语义保持）、build.mjs（FIX_SENTINELS 2 条——⚠️ 与你本会话的 5 条同文件，你追加时请基于最新文件重读，我的是数组尾部 #152 两条）、FIX-REGRESSION.md（#152 行，追加在文件尾）、tools/verify-continue-btn.mjs（新增行为断言 6/6，verify:all 自动纳入）；构建状态：未构建（工作区现行 index.html 是你 14:3x 版本，实测 grep 不含本修复，需要重新 build 收口）**）。
* 需求/反馈：iQOO Neo10Pro Chrome 149（诊断 v3.26.404）：回复设置开了「让对方继续说【按正常回复时间】【底部聊天栏按钮触发】」，点底部「继续说」按钮联系人不回复、无打字提示、无报错；用户反馈安卓其他机型也有（=机型无关）。要求不覆盖修复、登记防回归。
* 根因（无头 Chrome 真实触摸管线复现实证）：安卓键盘收起与点按手势重叠时（打字后立刻点按钮最典型），输入栏随视口回弹下移，touchend 的二次命中测试落在位移后的元素上，合成 click 被派发到错误元素（复现：click 落到 span.msg-time，按钮监听器 0 触发、无异常）——静默无回复。诊断里键盘状态机长时间滞留 kbActive/收起动画期（vv 卡 502/基线 690）正是高危环境；诊断轨迹 click 已命中按钮的个案与 cs-normal=1「回复速度」长延时（默认最长 40s）观感叠加。continueChat/replyOnce/字卡池/卡死状态下的点击链路均实测正常，排除。
* 方案：按钮触摸事件改 pointerdown（目标是真实按压元素，不经历触摸后的二次命中测试，布局位移吞不掉）+ 防重入 1.2s 挡 pointerdown 已触发后补发的合成 click 双触发；鼠标仍走 click；无 PointerEvent 老内核 click 兜底。群聊同款按钮同步修（同输入栏同风险）。
* 验证：node --check 过；临时目录真实构建哨兵 **303/303** 全绿哑哨兵 0（needle 含 `(e)`/属性链等产物稳定子串，与 #127/#150 同风格，实际构建输出实证在位）；verify-continue-btn **6/6**（①键盘收起吞 click 场景修复前 ccCalls=0→修复后=1 ②干净点按防重入只触发一次 ③纯 click 不回归 ④cs-normal=1 延时分条回复正常）；--check-sentinels 303 在位。
* 待真机（iQOO Neo10Pro 及任意机型）：打字后（键盘开着）立刻点「继续说」→ 出现打字提示并按设置的回复速度收到回复（「按正常回复时间」默认回复速度最长 40s，请用户等待窗口对齐设置值）；群聊输入栏同款场景生效；连点不双倍回复。
* 📌 顺带发现：FIX-REGRESSION.md 里 `| 151 |` 行出现两次（grep 计数=2），疑似你本会话追加重复，请自查去重，未代改（避免与你编辑冲突）。


### 2026-09-04 14:3x（#151 小米14U Edge 切联系人回桌面「小组件隐藏但可点/桌面串显示/壁纸不铺满」三回归；已构建）
* [AI-B 域]（**改动文件：src/js/personalize.js（五处：①切桌面美化键缺键复位 widget-opacity/bg-blur/bg-mask-op/desk-card-radius；②TEMPLATE_DESK_ARR 模板排布快照 + restoreTemplateDesk + applyDeskLayout 无布局分支接入；③setBgLayerImage 的 backgroundSize/Position 移出「图变才写」守卫；④deskSwitchBuild 标记——切桌面期间 buildDeskPages 删页收缩不落盘；⑤美化抽屉透明度滑杆统一 opacityRawToPct+存百分比整数）、build.mjs（FIX_SENTINELS 5 条）、FIX-REGRESSION.md（#151 行）、tools/verify-desk-switch.mjs（新增行为断言）；构建状态：最终构建·sw mochi-mtmkw8mz（14:34，含并行会话 #152「继续说」按钮修复一并收口）哨兵 303/303 哑哨兵 0**）。
* 需求/反馈：小米14U Edge（诊断 v3.26.404）：①联系人里切换联系人再切回原桌面，小组件隐藏但位置点得到；②不同桌面显示不一样；③桌面背景图片没按比例铺满。用户反馈安卓其他机型也出现（=机型无关的逻辑 bug）。防回归红线：不动既有哨兵锚点（含 #147 壁纸防 iOS 重解码语义原样保留）。
* 根因（三个独立机制叠加，详见 FIX-REGRESSION #151 行）：①美化键挂全局 CSS 变量但按桌面存键，切到无键桌面不复位 → 上一桌面透明度/蒙层残留（opacity 低的组件=不可见但可点中）；②无布局桌面切回时 applyDeskLayout 对 `!lay` 直接 return，被上个桌面布局扫进隐藏池的本桌组件永不归还（headless 实测复现：quote-row/checkin/music/weekend 卡池）；③#147 把 backgroundSize/Position 锁进「图变才写」守卫 → 壁纸定位/缩放改键不生效、同图异 pos 跨桌面串用（=「不按比例铺满」）；附带：切桌面 buildDeskPages 删页收缩把上一桌面排布写进新桌面 desk-layout（跨桌面污染持久化）、美化抽屉滑杆仍写 #146 同族小数脏值。
* 方案：全部最小改动收在 personalize.js（AI-B 域），不碰 home.css/p2-features.js/contacts.js；backgroundImage 写入仍值变才写（#147 语义不变，size/pos 各自值变才写不盲写）。
* 验证：node --check 过；verify-desk-switch **15/15**（四场景：无布局切回池归还+可选组件不误归还+布局键不被写串 / 透明度残留复位+按桌面应用 / 同图异 pos size 跟桌面走 / 删页不污染+有布局桌面正常归还）；构建哨兵 303/303 全绿哑哨兵 0；npm run verify:all 全量 131 通过/67 断言失败/2 超时（与 #140 时代基线 121/69/2 对比通过更多失败更少，失败项与桌面/美化域零关联，超时为 avatar-ta-change/pong-balance 两个历史慢脚本）；FIX-REGRESSION #151 行重复系本会话追加脚本误写两遍，已去重（并行会话 #152 发现并留话，致谢）。
* 待真机（小米14U Edge 及任意机型）：联系人来回切小组件保持显示、各桌面布局/透明度/壁纸互不串；壁纸定位/缩放实时生效。**历史被污染的设备**（布局键已被写串的）：设置→恢复默认桌面一次或重新装修即可清除。

# 本次构建者：AI-B（本会话：#150 后台来电系统通知，改动 call.js/bg-keep.js/build.mjs/FIX-REGRESSION.md；开工时 git status 有 #149 会话未提交改动（已构建完成），本次构建一并包含）


### 2026-09-04 14:1x（#150 联系人来电浏览器挂后台无系统通知：后台来电改发系统通知+未接记录；已构建）
* [AI-B 域]（改动：src/js/call.js、src/js/bg-keep.js、build.mjs 哨兵3条、FIX-REGRESSION.md #150 行；构建状态：见下）。
* 根因：maybeIncoming 后台直接 return（v3.5.127），响铃中切后台也只静默按未接处理——后台永远无来电通知。
* 修复：后台命中来电→写未接记录+聊天系统消息+SW 系统通知；响铃中切后台补发通知；bgNotifyCheck 增 extra.force 通道绕过 15s 过渡期/去重闸门。
* 验证：node --check 过；构建哨兵含 #150 3 条全绿。


### 2026-09-04 14:4x（防倒卖收尾：verify-anti-scam-backfill 5 用例试金石 + README 完整许可段 + marked() 空白归一化修复；已构建）
* [AI-B 域]（**改动文件：tools/verify-anti-scam-backfill.mjs（新增，verify:all 自动纳入）、src/js/clock.js（marked() 在位判定空白归一化——条2 文案「小红书 @言序」带空格 vs 锚点串无空格致永远判不在位每次重写，测出来即修）、README.md（新增「许可与使用条款」段：可二传二改/必须保留署名/禁商用/开屏公告不可删+回填校验说明/DMCA 投诉依据）、FIX-REGRESSION.md（#148 验证方式补脚本）；构建状态：已构建·sw mochi-mtmjjy3o 哨兵 293/293 哑哨兵 0**）。
* verify 脚本 5 用例全绿 **13/13**：①官方正常加载两条置顶条在最顶+设置页声明 ②二传副本删条→重建到最顶 ③篡改成收费文案→重写回官方版 ④拦截官方源（模拟断网）→静态兜底在位 ⑤删条+断网叠加→JS 常量重建；产物结构失配（正则 no-op）时脚本主动红。
* 提交含并行会话 WORKLOG 报障排查条目（14:2x 零改动条目，日志追加一并入库）；未跟踪 tmp-repro2-out.txt 不入库。

### 2026-09-04 14:2x（报障排查：Mi 10S+Via「所有页面无法滑动/强制在顶部」——代码层未复现，已回询诊断文件）
* [AI-B 域]（**零改动，未构建**：真实触摸事件探针（CDP dispatchTouchEvent）实测当前构建——Via 默认 UA / Via 伪装 iPhone UA / 原生 Chrome 三种下，开屏公告与 page-setting 均正常滚动，scroll-lock 未挂、键盘钉顶未激活；临时探针已删）。需对方/用户知悉：应用内可致全页滑不动的已知机制仅 浮层锁残留（有触摸兜底+1s看门狗自愈）与 键盘钉顶（键盘期门控），需用户按报修格式补「诊断信息文件」+ 说明 Via 是否开了桌面版网站/全屏模式/广告拦截、是否卡开屏公告页。

### 2026-09-04 14:0x（#149 聊天引用图片/表情包消息发送后引用块无缩略图（苹果17 等多机型）：引用链 data: 过滤丢媒体池令牌；已构建）
* [AI-A 域]（**改动文件：src/js/chat.js（quoteTextSafe 令牌→空 / quoteHtml 对象 imgs 过滤 + 字符串引用分支认 @@m: 令牌 / quoteTextOf 图片载荷判定加令牌 / 聊天搜索结果图片判定加令牌）、build.mjs（FIX_SENTINELS 4 条，needle 各取四处判定完整表达式且在 chat.js 内唯一）、FIX-REGRESSION.md（#149 行 + 设备索引苹果17 加 149）；构建状态：见下**）。
* 需求/反馈：苹果17 自带浏览器引用联系人的图片消息发送后不显示缩略图，用户反馈其他机型也有（= 机型无关）。
* 根因：#142 媒体池把聊天图片令牌化 `@@m:<hash>` 后，引用链四处仍按 `indexOf('data:') === 0` 判定图片载荷——quoteTextOf 快照把令牌当引用文本（历史坏数据 t=令牌）、quoteHtml imgs 过滤把令牌缩略图整段丢弃、字符串引用分支不认令牌、quoteTextSafe 直出令牌串。引用**刚发出未令牌化**的图片仍有 data: → 正常，所以「时好时坏」跨机型随机出现。
* 方案：判定统一扩为「data: 或 mochiMediaIsToken」，令牌照常渲染 `<img src>` 交 media-pool 文档级观察器解析（与消息本体图片同一机制）；不动 group-chat（群聊消息不令牌化）与 bg-keep（新消息通知发生在令牌化前，无实际影响）。
* 验证：node --check 过；构建哨兵全绿哑哨兵 0。
* 待真机（苹果17 及任意机型）：对**早前发过**的图片/表情包点引用 → 预览条出缩略图 → 发送后引用块出缩略图、无 `@@m:` 串；纯文字引用与引用跳转不回归。

### 2026-09-04 13:4x（防骗+署名禁倒卖声明「运行时回填」恢复并扩展双条（防倒卖核心手段）；已随并行会话 962347d 构建入库）
* [AI-B 域]（**改动文件：src/js/clock.js（顶部新增回填 IIFE：JS 常量兜底 + fetch 官方部署地址 notice.json 取权威 alert/alert2 强刷「开屏两条置顶声明 + 设置页 set-alert」——元素缺失重建插公告区最顶（条1防骗在上/条2署名紧跟）、文案被改（标题+全部特征词 marks 不在位）重写回官方版；二传者自己部署的副本也会向官方域名拉取，想删声明必须连回填逻辑一起改）、src/template.html（两条静态置顶条补 data-anti-scam="1"/"2" 标记供回填认领）、build.mjs（FIX_SENTINELS +3：insertBefore(box, refNode || notice.firstChild) / OFFICIAL_NOTICE, { cache: 'no-store' } / bar.marks.every，均 clock.js 内唯一逻辑锚点）、FIX-REGRESSION.md（#148 行）；构建状态：本会话 13:35 已构建（sw mochi-mtmisiew 哨兵 289/289），产物被并行会话 13:37 构建（mtmitlvc）覆盖，**全部改动随其 962347d 一并入库（其 WORKLOG 已留痕），哨兵全绿，双方知悉**）。
* 需求：用户确认恢复 f7a8b5c 首建、0965278 清理时被整块移除的「防骗声明运行时回填」，并扩展为防骗+署名禁倒卖双条（防倒卖核心：任何二传副本联网时仍显示官方权威声明）。
* 验证：node --check 过；node build.mjs --check-sentinels 289 全绿哑哨兵 0；HEAD index.html 含 OFFICIAL_NOTICE×2 / 缺失重建逻辑 / data-anti-scam×5。
* 待真机：官方站开屏最顶两条声明正常无重复；断网开屏仍有静态兜底；设置页底部声明含署名禁倒卖句；改动 notice.json 的 alert/alert2 并部署后，二传副本开屏声明会远程跟随更新。

### 2026-09-04 13:36（塔罗扩完整 78 张（22 大 + 56 小阿卡纳，全正逆位）+ 补 7 张完整牌阵选项；已构建）
* [AI-A 域]（**改动文件：src/js/divination.js（TAROT 扩 56 张小阿卡纳：权杖/圣杯/宝剑/星币 ×1~10+宫廷 4，均带正逆位寓意+详细解读；TAROT_ICONS 新增 staff/sword/coin/page/knight/queen/king 7 个花色/人物图标；MODE_LABELS 补 7 张位标签：塔罗=过去/现在/未来/阻碍/助力/态度/结果）、src/template.html（桌面页 div-counts + 聊天页半框各补「7 张」按钮；功能介绍页文案改 78 张）；构建状态：已构建·sw mochi-mtmitlvc 哨兵 289/289 哑哨兵 0**）。
* 用户报障「占卜牌的数量」：核对=抽牌逻辑无 bug、牌库数与注释一致；真差异=头注释承诺 7 张牌阵但 UI 从未有该按钮。本次扩 78 张 + 补 7 张按钮一并收口。
* 雷诺曼 40 张为星言复刻设计（标准牌库 36，多灵体/香炉/床/市场 4 张），保留不改。
* 验证：node --check 过；TAROT=78 / LENO=40 无重名；产物 星币国王、data-count="7"、data-chatcount="7"、"78 张完整牌库" 各 1 处；7 张结果 .div-mini flex-wrap 自适应（3+3+1）无需改 CSS。
* 待真机：7 张抽牌流程/记录/发送文案张数正确；小阿卡纳图标显示正常。

### 2026-09-04 12:0x（#147 iPhone16 Pro Safari 浏览器模式「退聊天回桌面巨卡」：壁纸清空/重设致 iOS 反复主线程解码 2.1MB 大图；已构建）
* [AI-B 域]（**改动文件：src/js/personalize.js（壁纸改写 .phone 内常驻图层 #phone-bg-layer：setBgLayerImage 值变才写 + setBgLayerVisible opacity 切换；applyPhoneBg/applyPhoneBgPreset/clearPhoneBg/applyBgVisibility 5 处 shell 写点全部改道，退出桌面不再清空 backgroundImage）、tools/verify-desk-beauty.mjs（壁纸断言同步改图层+opacity）、build.mjs（FIX_SENTINELS 2 条）、FIX-REGRESSION.md（#147 行）；构建状态：已构建·sw 见 version.json**）。
* 根因：applyBgVisibility 每次进出桌面清空/重设 .phone backgroundImage，2.1MB dataURL 壁纸在 iOS 上每次重设都主线程重新解码整张大图；chat-back 直挂 + page-phone MutationObserver 双触发=一次返回解码两次 → 用户实测退聊天回桌面巨卡、之后所有页面切换持续卡。
* 图层 z-index:1 低于 .page/.tabbar/.statusbar 的 z-index:2，视觉语义与原清空/重设一致；applyBodyBg 手机端本就清空不动。
* 验证：node --check 过；--check-sentinels 286 全绿哑哨兵 0；verify-desk-beauty 真实浏览器流程过（断言已改图层）。
* 待真机（iPhone16 Pro Safari）：聊天↔桌面来回切换流畅、2MB 壁纸桌面滚动不卡；壁纸显隐视觉与原一致。

# 本次构建者：AI-B（本会话：开屏公告更新——notice.json + template.html，改动前 git status 干净、无他人在途半成品）

### 2026-09-04 13:07（开屏最顶新增「转载署名·严禁倒卖」置顶声明条；已构建）
* [AI-B 域]（**改动文件：src/template.html（开屏公告区最顶防骗提醒条下方新增同款 .splash-alert 置顶条：二传须标作者署名 @言序（1842523578）禁止删除修改/严禁冒为自己制作、删改署名、收费倒卖链接安装包——静态 DOM，在线 notice.json 覆盖只改公告列表不影响此处，离线兜底也生效）、src/pwa/notice.json（新增 alert2 字段与置顶条文案同步，供未来运行时回填机制复用）；构建状态：已构建·sw mochi-mtmhsvhg 哨兵284/284 哑哨兵0**）。
* 需求：①「二传须标作者署名」说明要求放在开屏最顶（原来是互助群公告章节第二行）；②防链接倒卖。
* 方案：复用 v3.27.x 防骗置顶条形态（.splash-alert 静态 DOM + base.css 既有样式，无需改 CSS/JS），标题「转载署名 · 严禁倒卖」，与防骗提醒上下并列在公告区最顶。考证：f7a8b5c 曾加防骗声明运行时回填（OFFICIAL_NOTICE 拉官方 notice.json 强刷置顶条），0965278 整块移除（clock.js -62 行）；本次只做静态置顶条不动回填机制，防倒卖建议（含恢复回填的选项）在会话回复中说明。
* 验证：notice.json JSON.parse 过；产物 index.html 置顶条顺序=防骗提醒→转载署名·严禁倒卖（offset 验证）→之后才是公告标题；「转载署名 · 严禁倒卖」index.html 1 处、notice.json alert2 1 处；哨兵 284/284 全绿哑哨兵 0、sw.js 9/9。
* 待线上：真机刷新开屏，最顶两条置顶声明（防骗 + 署名禁倒卖），目录/章节内容不变。

### 2026-09-04 12:52（开屏公告新增【互助群公告】章节 + 删除「评论区问我」相关文案；已构建）
* [AI-B 域]（**改动文件：src/pwa/notice.json（sections 首位插入【互助群公告】章节：置顶图片链接指引/免费项目性质/二传需标作者署名@milk言序/milk json 导入/系统预设默认全开/免费非商业/互助群非客服/管理员是志愿者/bug 兼容归因/报修格式【手机型号+浏览器+问题+诊断信息文件】艾特群主/不承诺修复时间需自验/禁公屏梦；一章节删「评论区或互助群」句与小红书吞消息句、二章节「直接评论或群里艾特」改「群里艾特即可」）、src/template.html（离线兜底静态公告同步同款改动）；构建状态：已构建·sw mochi-mtmhfvyh 哨兵284/284 哑哨兵0**）。
* 需求：①互助群群公告原文插入开屏；②「公开里写的可以评论问我」相关文案删掉（小红书评论区渠道下线）；③开屏补充说明「二传使用链接需标作者署名：小红书 @言序（1842523578），禁止删除或修改」（与五/六章既有署名条款呼应，位置放在互助群公告章节第二行）。
* 方案：notice.json 在线渲染 + template.html 离线兜底两处同步（clock.js 拉取渲染逻辑无需改动）；章节条目格式沿用现有约定（字符串=编号条目/{h}=子标题/{b}=子列表项），报修格式与「二、关于 Bug 与报修」章节原有内容保持一致不冲突。
* 验证：notice.json JSON.parse 过；产物 index.html 含【互助群公告】1 处、「评论区/吞消息/评论或群里艾特」0 处、二传署名句 1 处；notice.json 副本同步含新章节；哨兵 284/284 全绿哑哨兵 0、sw.js 9/9。
* 待线上：部署后真机刷新看开屏目录出现【互助群公告】章节、原文无「评论区」字样；离线兜底（断网开屏）同款展示。

### 2026-09-04 12:0x（#146 删除桌面【一键随机美化】功能 + 修「随机美化后小组件全透明、恢复默认布局救不回」：v3.31.x；已构建）
* [AI-A 域跨改 personalize.js/template.html]（**改动文件：src/template.html（删 row-beauty-random 美化行 + desk-quick dq-random 快捷按钮）、src/js/personalize.js（删随机美化处理块与 bind；新增 opacityRawToPct 统一解析 + 启动脏值自愈，三处 parseInt 读取点换用）、build.mjs（FIX_SENTINELS 3 条：1 存在型 + 2 删除型 absent）、tools/verify-widget-opacity.mjs（新增行为断言）、FIX-REGRESSION.md（#146 行）；构建状态：已构建（随并行会话 #147 构建一并收口入库，产物已含修复，哨兵 284/284）**）。
* 根因：随机美化把 widget-opacity 写成小数（"0.9"/"1"），读取点 parseInt 按百分比解析 → parseInt("0.9")=0 → --widget-opacity:0 小组件全透明；该键属美化键，恢复默认布局只清 desk-layout 清不掉它。
* 修复：功能整体下线 + opacityRawToPct（≤1 按 ×100 换算）+ 启动把历史小数脏值改写为百分比存储（存量受影响设备升级后自动恢复显示）。
* 验证：node --check 过；verify-widget-opacity **8/8**（0.9→90 自愈 / 1→100 自愈 / 80 不误改 / 入口已删除）；--check-sentinels 284 全绿哑哨兵 0。
* 待真机：曾点过随机美化的设备升级后小组件恢复显示；美化页/快捷面板无随机美化入口；组件透明度滑杆、恢复全部默认美化正常。

### 2026-09-04 11:5x（#145 聊天/群聊输入栏【表情包】按钮再点无法关闭：按钮无条件 open 改切换开关；已构建）
* [AI-A 域跨改]（**改动文件：src/js/chat.js（表情按钮 click 改 toggle：面板已开先 closeEmojiPanel() 再 return；导出 window.closeEmojiPanelForInsert=closeEmojiPanel 供群聊复用）、src/js/group-chat.js（gc-emoji-btn 同款切换，复用导出关闭）、build.mjs（FIX_SENTINELS 2 条，window. 属性名锚点）、FIX-REGRESSION.md（#145 行）；构建状态：已构建·sw 见 version.json**）。
* 根因：chat.js 表情按钮 click 无条件 openEmojiPanel()，外点关闭监听又排除按钮本身（!emojiBtn.contains）→ 再点永不关；群聊 gc-emoji-btn 更绕（重开+document 外点关闭互相覆盖，终态仍开）。
* 验证：node --check 过；构建哨兵 281/281 全绿哑哨兵 0。待真机：聊天/群聊点表情按钮开→再点关；外点关闭/选表情发送/信箱批量插入模式不回归。
* ⚠️ 构建夹带说明：构建时工作区含并行会话未提交改动——src/js/personalize.js + src/template.html（#146 随机美化删除 + widget-opacity 小数脏值修复）、src/js/chat.js + src/template.html（v3.31.x 收藏批量管理 favBatch 族）——改动成套完整、语法与哨兵全过，已随本次构建一并进入产物并随提交入库，请该会话知悉（WORKLOG 留痕，AGENTS.md「构建不夹带」特此说明）。

### 2026-09-04 11:5x（#147 收藏页新增批量删除功能：v3.31.x；已构建）
* [AI-A 域]（**改动文件：src/template.html（收藏页顶栏加批量管理按钮 #fav-manage-btn + 底部操作栏 #fav-batch-bar（取消/全选/删除）+ 功能介绍页 02 收藏行补文案）、src/js/chat.js（renderFav 批量模式状态 favBatch/favBatchSel/favBatchArr/favBatchVis + syncBatchBar + renderFavItem 批量勾选分支 + 四个按钮事件 + fav-back 退出批量）、src/css/chat-pages.css（.fav-batch-bar/.fb-btn/.fav-check 亮色）、src/css/dark.css（同款暗色适配，跨域改动已在此行说明）；构建状态：已构建·sw 见 version.json**）。
* 构建者声明：本次 build 由本会话执行；**产物同时包含并行会话已完成的 #145（表情按钮再点关闭，build.mjs+chat.js+group-chat.js）与 #146（随机美化移除+透明度脏值修复，build.mjs+personalize.js+template.html）**——对方改动完整（其哨兵已随本次构建 284/284 验证在位），按 AGENTS.md 一并收口。
* 功能：收藏页顶栏新增勾选图标按钮 → 进入批量管理：条目外侧圆圈勾选（捕获阶段 click 抢先拦截气泡内图片查看大图）、切换「我的/TA的」或分类 tab 自动收窄勾选、底部「取消/全选(取消全选)/删除(N)」；删除走 openModal 二次确认，直接改当次渲染的 fav 数组引用后 saveFav（避免重复 getFav 解析致 indexOf 失配）；长按/右键单删在批量模式下不注册。
* 跨域改动 src/css/dark.css：仅追加收藏批量管理暗色 5 行（.fav-batch-bar/.fb-btn/.fav-check），未动其他规则。
* 验证：node --check 过；构建后 --check-sentinels 全绿。

### 2026-09-03 23:4x（#144 iPad Air 7 + Safari 主屏幕「全屏模式」无反应：iPadOS 伪装 UA 致 isIOS=false；已构建）
* [AI-B 域]（**改动文件：src/js/device.js（isIOS 补 Macintosh 伪装分支：platform=MacIntel || /Macintosh/ + maxTouchPoints>1 + ontouchstart——真桌面 Mac maxTouchPoints=0 不误判）、src/js/idb.js（armFgIdbReset 同款 UA 检查补 touchMac，伪装 UA 的 iPad 回前台也重建 IDB 连接）、build.mjs（FIX_SENTINELS 2 条）、FIX-REGRESSION.md（#144 行）；构建状态：已构建·sw 见 version.json**）。
* 根因：iPadOS 13+ UA 伪装桌面 Mac → isIOS=false → fullscreen.js 走错分支（iPad 无 Fullscreen API 开关被拒）+ ios-pwa-standalone 类不加（html 类空，#114/#129 安全区补偿在 iPad 全失效）；用户手动布局 pref:mobile 另把 isTablet 置假（保留不改，只管布局）。
* 验证：node --check 过；五场景 isIOS 测试 + 三场景 idb gate 测试全过；--check-sentinels 279 全绿哑哨兵 0。
* 待真机（iPad Air 7 + Safari 主屏幕）：点全屏模式有反应（内容顶满+iOS 说明弹出）、诊断 iOS=true html 类含 ios-pwa-standalone；iPad 杀后台重开数据正常。

# 本次构建者：AI-A（本会话：#142 心愿单功能收口构建——用户催部署；并行会话 #144 拍一拍昵称制（chat.js+verify-poke-nick.mjs）源已完成一并收口；AI-C 通话昵称已自行构建提交）

### 2026-09-03 18:07（用户反馈：聊天设置改了联系人昵称，拍一拍消息里人称仍显示 TA/ta；改「称呼制」为「昵称制」；源已完成·未构建）
* [AI-A 域]（**改动文件：src/js/chat.js（新增 pokePersonMap + 拍一拍渲染/桌面预览两处换用）、tools/verify-poke-nick.mjs（用例 A/E 预期随昵称制更新 + 新增 G/H）；构建状态：未构建，待构建者收口**）。
* 根因：拍一拍文案人称存在两套机制——「你/我」转出的 {ta}/{me} 占位按联系人昵称回填（正常）；字卡里**写死的 TA/ta/他/她**是「称呼占位」，只跟随联系人性别称呼（他/她/TA，未设则保持 TA/ta），与联系人昵称无关。用户改昵称后发「拍了拍TA的肩膀」这类字卡，昵称槽显示正常、写死的 TA 纹丝不动 → 观感「人称还是 TA」。
* 修复：v3.30.x 起拍一拍人称改「昵称制」——聊天内拍一拍气泡（renderMsg poke/ask-msg 分支）与桌面弹窗预览（extractDeskMsg）不再走 taFit 称呼替换，新增 pokePersonMap：{ta}/{me} 占位与字面独立人称 TA/ta/他/她 一律按 我的昵称/联系人昵称 回填（昵称未设回落默认 TA）；分段保护 svg 图标、base64、合成词（其他/他们/她们/他人）。历史拍一拍消息因渲染时才回填，进聊天自动随新规则显示昵称。
* 验证：node --check 过；verify-poke-nick **9/9**（A 昵称未设回落 TA 不再跟随称呼 / B 昵称槽位不回退 她 / C-D 双昵称回填 / E 写死 ta 按昵称 / G 大写 TA / H 他 → 昵称 / F 无异常）。


### 2026-09-03 17:4x（用户反馈：聊天设置改了联系人昵称，通话缩小悬浮小框里仍显示 TA/他/她；已构建）
* [AI-C 域]（**改动文件：src/js/contacts.js（新增 window.contactNameFor(cid)：按 cid 读联系人注册表名片名）、src/js/call.js（partnerName 与 syncCallName 回退链补齐名片名：cs-lbl-partner → contactNameFor(cid) → taWord；syncCallName 的性别称呼改按归属桌面 taWordFor(currentCall.cid)）、build.mjs（「通话昵称与聊天域解耦」哨兵 needle 换成新代码特征——旧 needle `store.get('cs-lbl-partner') || (window.taWord…` 被本次修改替换，且 minify 改变量名+剥续行缩进，needle 必须用产物稳定子串）、tools/repro-call-mini-name.mjs（新增回归脚本 8 断言）；构建状态：已构建·sw mochi-mtlcbbk6**）。
* 需求/根因：用户在聊天设置改了联系人昵称（或联系人管理里改了名片名），通话大面板/最小化小框仍显示 TA/他/她。排查实证：小框名字链是 cs-lbl-partner → taWord（他/她/TA），而聊天顶栏链是 cs-lbl-partner → 联系人名片名 → TA——两处回退链不一致，用户只改了名片名（renameContact 只同步 lbl-partner 不写 cs-lbl-partner）时顶栏有名字、小框回退 TA/他/她，观感像「改名没生效」。聊天设置→联系人昵称（cs-lbl-partner）路径实测本就正常（S1/S2 通过），问题出在名片名回退缺口。
* 修复：contacts.js 新增 contactNameFor(cid)（读注册表 c.name）；call.js 两处回退链补齐：partnerName()（通话发起时归属桌面）与 syncCallName()（通话中每秒自愈，按 currentCall.cid 读名片名，跨桌面通话不串名）。renameContact 既有 contact-renamed 广播继续驱动通话中实时刷新。
* 验证：node --check 过；repro-call-mini-name 8/8（S1 通话前设昵称/ S2 最小化中改昵称实时跟随 / S3 只改名片名顶栏与小框一致显示名片名 / S4 非默认桌面）；既有回归 verify-call-mini-live 14/14、verify-call-dur 6/6、verify-call-edit 11/11；哨兵 277/277 全绿哑哨兵 0、sw.js 9/9。
* 注意：repro 脚本曾误报 S2/S3——S2 须在未挂断的同一通最小化通话里改昵称再查（先 hangup 会 miniHidden=true 误判）；S3 断言顶栏回退前需手动 renderChatHeader()（renameContact 不触发顶栏重渲染）。

### 2026-09-03 17:3x（#143 一加Ace2+Edge 开屏「整页只有 mochi 字母图」进不去开屏：SW 最终重试写点污染 canonical index 键；已构建）
* [AI-B 域]（**改动文件：src/pwa/sw.js（两处：fetch 最终重试写点收口——仅导航请求才写 canonical './index.html' 键且必须过 isCompleteHtml，非导航资源只透传绝不写 index 键；导航兜底命中加 content-type 守卫，非 HTML 缓存当未命中放行去旧缓存扫描/网络重试）、build.mjs（swNeedles/swNeedlesSrc 各 +2 条 #143 逻辑锚点）、FIX-REGRESSION.md（#143 行，改该文件按约定留此说明）、tools/verify-sw-nav-fallback.mjs（新增回归脚本 src+产物 16 断言）；构建状态：已构建·sw mochi-mtlbu2gc**）。
* 需求/根因：用户反馈一加Ace2+Edge 开屏整页只有 mochi 英文字母图进不了开屏，且此前多机型复发过（#136 vivo+Chrome 同症状家族）。真根因在 #136 修复漏掉的第 5 处写缓存点：网络优先 3.5s 超时后的 catch 兜底同时接住非导航请求（慢网络下 icon-512.png 等），原实现把任何成功体一律写 canonical index 键且无校验——PNG 占位后离线导航第一级就命中图片=浏览器把图当文档渲染（整页一张字母图），图片文档不跑 JS #134 自检无法触发，且污染条目在兜底链第一优先会遮蔽旧缓存好 index；截断 HTML 亦绕过 #134 铁律。
* 修复/防覆盖：重试写点收口（仅导航+过 EOF 校验）+ 兜底命中 content-type 守卫；存量污染设备由 activate 既有自愈（EOF 校验失败删+抢救旧完整版）与联网导航成功覆写双通道治愈。#134/#136 全部锚点保留未动，哨兵 277/277 全绿哑哨兵 0 + sw.js 9/9。
* 验证：node --check 过；verify-sw-nav-fallback 16/16（含 5 处 canonical 写点全部受保护断言）；verify-html-eof 20/20；npm run verify 布局 10/10。
* 待真机（一加Ace2+Edge）：联网打开一次让新 SW 激活后，飞行模式/弱网冷启动能从缓存进入开屏不再出现整页字母图；vivo 等复发机型与 iOS 开屏行为不变。

### 2026-09-03 15:37（#142 心愿单功能：心意集市/心意柜「许愿—实现」闭环 + 设置面板；源已完成·未构建）
* [AI-A 域]（**改动文件：src/js/gift-shop.js、src/css/market.css（.market-foot +flex-wrap）；构建状态：未构建，待构建者收口**）。
* 需求（用户）：①我在市集买东西可直接加入心愿单，TA 有概率买我心愿单的礼物送我进我的心意柜；②TA 买东西也有概率不买而是加进 TA 的心愿单，我可买 TA 心愿单的礼物送 TA 进 TA 的心意柜；③TA 自己也能买东西放进自己的心意柜；④以上放「心意集市和心意柜设置」可开关+自定义概率；⑤小字【使用说明】。
* 构建状态更新（18:1x）：用户催部署，本条声明本次构建者=AI-A 并收口。工作区并行改动核对：chat.js + tools/verify-poke-nick.mjs = 并行会话 #144 拍一拍昵称制（WORKLOG 18:07 已声明源已完成，改动区 L5100-5190 拍一拍渲染与本会话零重叠，一并收口）；market.css/gift-shop.js = 本会话 #142。构建 + 哨兵 + verify 后同一次提交推送。
* 实现：心愿数据 per-cid（gift-wishlist / gift-wishlist-ta，存快照防商品改删）；设置全局键 market-wl-settings（默认全开：心愿兑现 20% / TA 加心愿 15% / TA 自购 10%，均 0~100 可调）。maybeAutoGift 改四档判定：心愿兑现（扣 TA 余额+先移心愿防连买）→ TA 自购（进心意柜 side 'self' 不发聊天消息，toast 提示）→ TA 加心愿（不花钱不占上限，去重+上限30，toast 提示）→ 原有 5% 随机送礼；购买类共享每日 3 次上限。UI：购买弹窗加「♡ 加入心愿单」+底部小字；市集底部「☆ 心愿单」双 tab 面板（TA 的心愿单点「送 TA」走正常购买、送出自动移除心愿）+「设置」入口；心意柜加第三栏「TA自己买的」（tab+统计卡）+ hero「⚙ 心意集市和心意柜设置」入口；设置面板=开关+概率输入（安卓 ce-box change 事件已由代理兼容）+【使用说明】小字（心愿单面板也有一份）。
* 验证：node --check 过；--check-sentinels 272 条全绿哑哨兵 0（本改动不新增哨兵，新功能非修复）。待构建者构建 + 真机：加心愿→TA 兑现进心意柜、TA 加心愿 toast、TA 自购进第三栏、设置开关概率即时生效且持久化。
* 备注：TA 自购不发聊天消息（仅 toast+入柜）为本次设计取舍；若用户要聊天可见再说。fishing.js recordGiftBox 仅用 'in'/'out'，不受 'self' 影响。
* 用户反馈补丁（看不了联系人心愿单）：①聊天送礼面板搜索行下注入「☆ 看看 TA 的心愿单」直达按钮（init 注入不动 template.html，点击关面板开 TA tab）；②心意柜 hero 新增同款入口；③市集商品卡对 TA 正许愿的商品显示「☆ TA想要的」角标（WL_TA_KEY 匹配 giftId）；④购买弹窗小字动态提示「TA 正许愿想要这件——买下送出即心愿兑现」；⑤任何途径买下 TA 许愿的礼物送出后一律 wishTaRemove 兑现（原仅 fromTaWish 路径），礼物照常进 TA 的心意柜「收到的」；⑥TA 心愿单面板提示+设置【使用说明】同步（补「礼物进 TA 的心意柜-收到的」）；⑦market.css 补 .gift-item-tawish/.gift-wish-row+暗色。
* 自查修复（本条内）：TA 兑现心愿漏扣款→补扣 TA 余额（可透支同口径）；每日 3 次上限误伤「TA 加心愿」→capped 只拦购买类（①②④）；三 tab/三按钮长名字溢出→gb-tab 与购买按钮 nowrap+ellipsis。node --check 过；--check-sentinels 277 全绿哑哨兵 0。

### 2026-09-03 15:3x（#141 安卓返回键/手势收键盘：输入栏下方灰块几秒才收（红米K80/小米15Pro/多机型 Chrome 通用）；已构建·含 #139/#140 一并收口）
* [AI-B 域]（**改动文件：src/js/mobile-adapt.js（四处：syncAndroidKb 顶部「h 高于上一帧且键盘开启态=收起动画」探测置 _aClosing + 250ms 轮询同判据补置 + 复原时 _aH 钳回 innerHeight + 悬浮键盘推定收口 _aProvUserConfirm）、build.mjs（FIX_SENTINELS +3 条）、FIX-REGRESSION.md（#141 行）、tools/verify-android-kb-close.mjs（新增行为断言 5 项）；构建状态：已构建·sw mochi-mtl7bm9x**）。
* 需求/根因：用户反馈（红米 K80、小米15Pro Chrome 等「其他安卓手机也这样」）——聊天输入栏打字后按返回键收键盘，输入栏这一行下方灰色块几秒才收起。#89 修「点发送失焦收起卡顿」把 _aClosing 闸门挂在 focusout；返回键/手势收键盘时内核保留焦点、focusout 不触发 → 收起动画每帧 vv.resize 照旧跑 _aPinPan/nudgeInputVisible 强制布局读取（重聊天页单帧 reflow ~100ms，小米15Pro 诊断长任务三连 98ms 即此时段），.phone 高度跟不上收起动画 → 下方露 body 灰底数秒。
* 修复（全部 mobile-adapt.js 安卓分支，不动 iOS 分支）：①「高度上升=收起动画」探测（门控只看相对上一帧在涨+_aKb 开启态，早期帧即置位）与 #89 失焦路径汇合同一收起分支——动画期只写 height 跟随、零强制布局读取；② 轮询补置（resize 漏触发内核兜底）；③ 复原时 _aH 基线钳回 window.innerHeight（防基线停留低位把 .phone 锁死中间高度）；④ _aProv 用户键入 1200ms 内推定收口（vv 不变化内核的灰块残留，不等 2200ms）。
* 验证：node --check 过；node build.mjs 哨兵 272/272 全绿哑哨兵 0 + sw 7/7；tools/verify-android-kb-close.mjs 5/5（动画期 offsetTop 探针 0 reads；移除修复重建→15 reads FAIL=有牙已实测）；回归全绿：verify-android-kb 3/3、verify-kb-pinpan-late 5/5、verify-kb-dock 12/12、verify-morekb-pan 7/7、verify-chat-input-guard 17/17。verify-ask-no-false-dock 场景2 FAIL 为基线既有（无本修复同样 FAIL，脚本断言环境漂移），非本次回归。
* 待真机（红米 K80/小米15Pro + Chrome）：打字后按返回键收键盘 → 灰块随手收起不残留；点发送失焦收起/弹键盘/打字/半框输入/面板停靠均不回归。
* 说明：FIX-REGRESSION.md 增 #141 行（本次改该文件，按约定留此说明）；#140 编号已被并行会话（desk-layout）占用，本条顺延 #141，编号不冲突。

### 2026-09-03 15:0x（#139 存储瘦身四件套：747MB→预计 ≈330MB；已构建·含 #140 一并收口）
* [AI-B 域·构建收口]（**改动文件：src/js/idb.js（lsResidueSweep LS 大键残留清扫 + idbBigSize 尺寸只读访问）、src/js/chatcard.js（专属字卡库去重模块 cc-dedupe-v1 + 导入兜底防复制 fromPubFallback + GIF 上传上限 CC_GIF_MAX_B64）、src/js/chat.js（收藏图片压缩 compressFavDataUrl/compressFavListImages/favImgPass CAS + saveFav 钩子 + 启动/换桌面迁移标记 fav-img-cmp-v1）、build.mjs（FIX_SENTINELS 5 条）、FIX-REGRESSION.md（#139 行）；构建状态：已构建·sw mochi-mtl6ng5m·v3.26.396**）。
* 跨域改动说明：chatcard.js/chat.js 属 AI-A 域，#138（ta-ask）已提交收口无在途标记，经用户批准本次跨域；改动区（chatcard 导入/上传/迁移模块、chat.js getFav/saveFav 一带）与 AI-A 最近提交区不重叠。
* 需求/根因：用户机诊断 747MB——字卡库 cc-groups 家族 ≈563MB（公用 138.22 + 三桌面专属 148.89/138.22/138.22，三份逐字节同大小=整份复制，来源疑为专属页导入全量备份时 `bag[PUB_PREFIX+':cc-groups']` 兜底把公用库整份写进专属键）；fav-msgs ≈21MB（收藏把消息图片 dataURL 原样整份进库）；LS 整域 10MB 满 QuotaExceededError（设置/桌面保存失败，真正报错的是 LS 的 10MB 独立上限而非 IDB 配额 747/10987MB）；GIF 直存原图无上限。
* 修复（数据零丢失底线）：① idb.js `lsResidueSweep`——restore/备份导入后清扫 LS >200KB 残留（排除 chat-msgs 快照/music-file/元键）：IDB 同值纯去重删 LS；IDB 缺失/落后先按 retainValue 规则以 LS 追平、写成功且 LS 未被业务再写才删（CAS 绝不先删后写）；② chatcard.js 专属库去重——`__big-idx` 尺寸+体检标记预检（稳态零开销免读大值），整库相等→删专属键（公用库始终保留一份，回复池本就「专属+公用」合并读取零损失），分组级同名同分类内容一致→剔除、剔空删键、剩余 <15MB 才回写；公用库只读不动；deviceMemory<4 不跑；③ 导入兜底防复制——专属页导入全量备份时公用库兜底改最后位 + fromPubFallback 守卫（合并结果与公用库完全相同不写专属键）；④ chat.js 收藏图片压缩——saveFav 钩子 + 一次性迁移（fav-img-cmp-v1）：只压 data:image（GIF/SVG/<4KB 跳过）、480px、WebP 优先（iOS 不支持自动回退 JPEG 白底）、必须比原图小才采用、写前 CAS 比对防并发覆盖；⑤ GIF 上传上限 ≈3MB（超限跳过提示）。媒体池按内容哈希去重 + Blob 直存为后续单独立项（用户已确认）。
* 验证：node --check 三文件过；node build.mjs 哨兵 269/269 全绿哑哨兵 0 + sw 7/7；verify:all / verify-desk-layout-guard 结果见构建后核对。
* 待真机（用户机 24117RK2CC）：升级后空闲约 1 分钟出现清理 toast；重新生成诊断核对 cc-groups ≈563MB→≈150MB 内、fav-msgs 显著下降、LS 写探针恢复、设置/桌面保存正常、字卡/回复/收藏内容无缺失。
* 打包收口：并行会话 #140（desktop-slider/personalize/mobile-adapt + FIX_SENTINELS 4 条 + tools/verify-desk-layout-guard.mjs）已声明「源已完成·待构建者收口」，本次构建已包含其改动与哨兵（269 = 260+5+4），其真机验证与 FIX-REGRESSION 登记由该会话负责。

### 2026-09-03 15:1x（#140 华为Pura70Pro+/Chrome122 桌面小组件卡片大部分不显示：desk-layout 损坏/空壳整批进隐藏池；源已完成·未构建）
* [AI-B 域]（**改动文件：src/js/personalize.js（deskLayout() 完整性校验+坏键自愈清除 / 隐藏池扫描跳过「布局有名」组件 / saveDeskLayout 写前防损坏）、src/js/desktop-slider.js（deskRebuild 页数钳制防 scrollLeft 落超界空白页）、build.mjs（FIX_SENTINELS +4 条）、tools/verify-desk-layout-guard.mjs（新增回归脚本 5 场景 10 断言）；构建状态：未构建——工作区有 #139 在途半成品，本会话按并行协议不构建不提交，待构建者一并收口**）。
* 根因：desk-layout 持久化值损坏/空壳（[[],[]…] / 页数超限 / 重复组件 id，安卓高 IO/配额压力下产生）时 applyDeskLayout 把布局外全部小组件卡整批扫进隐藏池，只剩图标网格=「卡片大部分不显示」；坏键落 IDB 每次启动回填复发（同 #87/#134/#136 存量大数据+慢 IO 家族，跨安卓机型）。Pura70Pro+ 诊断实证：LS 3.6MB 高占用、IDB 22.5MB、长任务密集、启动异常=无（非截断家族）。
* 验证：node --check 过；--check-sentinels 269 全绿哑哨兵 0；worktree 隔离构建 verify-desk-layout-guard 修复版 10/10；无修复基线反向对照 3/10（空壳/截断/重复 id 布局把 7~8 张卡整批吞进隐藏池且坏键留存=症状实锤复现）；基线 verify:all 121 通过/69 断言失败/2 超时与 #134 时代基线一致（均历史存量非本次引入）。
* 待真机（Pura70Pro+ Chrome 122 及其他安卓）：升级后冷启动一次（坏键自动清除回默认布局）小组件卡片全部显示；已装修用户布局保持不变；装修保存/删除页/恢复默认桌面正常。
* 需要对方处理（AI-A）：用户诊断里 page-room 有 Uncaught ReferenceError: floorPick is not defined（openModal 回调内，room.js 相关），本会话未动该文件。

### 2026-09-03 14:1x（#138 ta-ask 字卡回复文案修复「太平天国」；已构建已推送）
* [AI-A 域]（**改动文件：src/js/ta-ask.js（cr4「万一吵架了，谁先低头？」选「不吵架」的一条回复：「不吵架？那我们太平天国。」→「不吵架？那拉钩，谁反悔是小狗。」）；构建状态：已构建·sw mochi-mtl4nqrd·v3.26.396**）。
* 用户反馈原句突兀：「太平天国」是历史名词，放情侣对话里出戏。替换为同结构的俏皮回复，其余 3 条回复与选项不动。
* 验证：node --check 过；node build.mjs --check-sentinels 260 全绿哑哨兵 0。


### 2026-09-03 14:0x（#137 iPhone 15 + iOS 18.7 全屏态：通话小框卡在系统状态栏区点不了/拖不动；已构建）
* [AI-B 域]（**改动文件：src/js/call.js（miniSafeTop 三级探测链：env() 探针→原 screen-vv 差值法→47px 保守兜底 + \_miniSafeTopCache 缓存）、build.mjs（FIX_SENTINELS 1 条）、FIX-REGRESSION.md（#137 行）；构建状态：已构建·sw 见 version.json**）。
* 根因（#114 差值法漏网环境）：v3.28.x #114 复现修复把 .phone 改 100vh 铺满物理屏后，iOS 18.7 全屏态实测 screen=852=vv=852 → 差值=0 落在 20-160 过滤区间外 → miniSafeTop 返回 0；小框旧存档 y≈0 时恢复守卫不抬升、拖拽上边界=0，56px 胶囊整体落进系统状态栏悬浮区 → 触点全被系统栏吞（点挂断没反应、拖不动）。
* 修复：三级探测链——①env() 探针（隐藏 fixed 元素实测 safe-area-inset-top，viewport-fit=cover 下标准做法）；②差值法保留；③47px 保守兜底（刘海/灵动岛系统栏最小高度，仅 standalone iOS 生效）。恢复守卫+拖拽钳制同走此函数。#136 编号已被并行会话（vivo SW 离线兜底）占用，本条改 #137，编号不冲突。
* 验证：node --check 过；四场景功能测试（env=0+diff=0→47 / env=59→59 / diff=59→59 / 非 standalone→0）全过；--check-sentinels 260 全绿哑哨兵 0。
* 待真机（iPhone 15 iOS 18.7 全屏态）：通话缩小后小框自动离开系统状态栏区（y≥47px）可点挂断可拖动；旧存档位置自动抬升。

### 2026-09-03 15:1x（#137 续：用户复测小框仍卡顶 → 显示时抬升补强 + 兜底 47→59px；已构建）
* [AI-B 域]（**改动文件：src/js/call.js（兜底 47→59px=iPhone15 实测系统栏高；新增 liftMiniIntoSafeArea 显示时抬升，5 处 mini.hidden=false 显示点统一校正内联 top<安全线的旧坐标并回写存档）、build.mjs（#137 哨兵改 2 条：\`if (!top) top = 59;\` + \`function liftMiniIntoSafeArea()\`）、FIX-REGRESSION.md（#137 行补回归修补）；构建状态：已构建·sw 见 version.json**）。
* 复测复现分析：①上一版只在文件加载时抬一次旧存档，且用户诊断 ts 仍是 09:48 旧版（SW 未换代）→ 旧坐标持续在状态栏区；②47px 兜底对 iPhone15（系统栏 59px）不足。补强后任何路径显示小框都校正到 ≥59px，拖拽/恢复钳制同走 miniSafeTop。
* 验证：node --check 过；功能测试（59 兜底/env 探针/差值/非 standalone + 抬升 10→59 回写存档 + 默认底部居中不动）全过；--check-sentinels 277 全绿（并行会话 #140/#141 新锚点一并在位）。
* 待真机（iPhone 15）：**必须先更新到本版**——开应用等顶部更新条点「刷新使用新版」，或完全关掉重开两次；诊断版本应为「部署于 2026-09-03 15:0x」。更新后接电话→缩小，小框必在系统栏下方（y≥59px）可点挂断可拖动。

### 2026-09-03 12:4x（#136 vivo+Chrome「打开异常/单独 mochi 字母图/进不去开屏」：SW 离线兜底缓存键漏洞修复；源已完成·已构建）
* [AI-B 域]（**改动文件：src/pwa/sw.js（导航成功统一写 canonical './index.html' 键 + 兜底链补 caches.match(req) second chance + activate 删旧缓存前抢救最新完整 index 离线顶上）、build.mjs（swNeedles/swNeedlesSrc 各 +3 条 #136 锚点）、FIX-REGRESSION.md（#136 行）；构建状态：已构建·sw 见 version.json**）。
* 根因（三层叠加）：诊断实证 GitHub Pages 不可达（version.json 拉取失败、onLine=true）时 Chrome 错误页顶头=站点 icon-512（mochi 字母图）；①导航成功缓存写 req.url 键而兜底只 match('./index.html')，键不一致兜不住；②install 预缓存逐文件 3.5s 超时后当前 CACHE 可能无 canonical 键；③activate 补拉靠网络，被墙留空窗。#134 EOF 校验四处全部保留未动。
* 验证：node --check 过；--check-sentinels 259 全绿哑哨兵 0 + sw 源锚点 5/5（含 #136 新 3 条）。
* 待真机（vivo V2359A+Chrome）：弱网/飞行模式冷启动能从缓存进入开屏；联网后版本正常更新；其他机型开屏行为不变。
* 需要对方处理（AI-A）：诊断 00:33:50 有一条 page-chat 的 `资源加载失败 <img> https://ling233330-star.github.io/mochi/`（空 src img 解析成页面自身 URL，疑似图片类消息 rec.text 为空未守卫，chat.js 渲染 `<img src="">`）——属 AI-A 域文件，本会话未动 chat.js（该文件有上会话在途改动）。

### 2026-09-03 13:3x（#135 iPad 7 + Edge 开屏卡「正在加载数据」死锁：open() 永不落地 + 开屏门控无硬出口；已构建）
* [AI-B 域·构建收口]（**改动文件：src/js/idb.js（open() 加 8s 兜底落地超时 + onblocked 主动失败——open 挂起时所有 open().then 的事务超时计时器永不启动，idbRestore 永久挂起）、src/js/clock.js（20s 硬保险丝 readyForced：数据未就绪也放行进入按钮，点击改走 forceEnter 弹数据不全提示，开屏永不死锁）、build.mjs（FIX_SENTINELS 3 条）、FIX-REGRESSION.md（#135 行）、tools/verify-html-eof.mjs（#134 配套）；构建状态：已构建·sw 见 version.json**）。
* 根因：indexedDB.open 在 iPad 7 + Edge 存在「不 success/error/blocked」挂起形态或 blocked 无处理——open() 原本无落地超时，各事务超时计时器都注册在 open().then 里 → idbRestore 的 Promise.all 永久挂起 → __mochiDataReady 永不置位 → clock.js ready() 恒假 → 「点击进入/仍要进入」永远出不来。
* 验证：node --check 过；--check-sentinels 259 全绿哑哨兵 0；构建后哨兵含 3 条新锚点。
* 待真机（iPad 7 + Edge）：开屏最长 20s 必出现可点状态，滑到底可进入（数据多时弹数据不全提示）；正常设备行为不变。

### 2026-09-03 12:2x（#133 续：预设分组字卡无法单独编辑→预设持久化改造；已构建收口本项）
* [AI-B 构建收口]（**改动文件：src/js/chat.js（`myInviteG()` 首启注入 `['__preset', MY_INVITE_PRESETS.slice()]` + save、`myInviteView()` 预设改从持久化取且 forEach 跳过 `__preset`、字卡编辑按钮去掉 `if(cur.user)` 守卫）、build.mjs（FIX_SENTINELS 补第 6 条 `if (!myInviteGroups.some(g => g[0] === '__preset')) {`）、FIX-REGRESSION.md（#133 快照表补「回归修补2」+哨兵 6 条）、tools/tmp-invite-ask.mjs（D 部分预设编辑测试）；构建状态：已构建·sw mochi-mtl0fzv6**）。
* 根因：预设分组 cards 为 `MY_INVITE_PRESETS.slice()` 实时生成、不落持久化 `myInviteG()`，编辑按钮被 `if(cur.user)` 守卫（预设无 user）→ 预设字卡没有修改/删除按钮；即便放开，`myInviteEdit/myInviteDel` 也因找不到 `__preset` 条目而失效。修复=预设分组落持久化（系统卡首启注入），字卡按钮去守卫 → 预设/自建字卡均可单独改/删并落库（分组级批量管理仍限自建）。
* 验证：node --check chat.js 过；node build.mjs 哨兵全绿、哑哨兵 0；tools/tmp-invite-ask.mjs 批量勾选/全选 + 自建/预设字卡单独编辑 16/17 通过（唯一 FAIL 为诊断取幽灵锚点 input 宽 1px 误报）。待真机：预设与自建字卡均可单独修改/删除并持久化。

### 2026-09-03 01:0x（#134 iPhone X 桌面图标/小组件缺失反复发作 + 装修模式拖拽 HierarchyRequestError；已构建）
* [AI-B 域·构建收口]（**改动文件：src/pwa/sw.js（isCompleteHtml 完整性校验×4 处写缓存点 + activate 存量残缺缓存自愈 + PURGE_INDEX/PURGE_DONE 消息）、src/template.html（body 末 mochi-html-eof 锚点 + __MOCHI_EOF__ 注释双锚点）、build.mjs（</html> 后 EOF 兜底注释 + FIX_SENTINELS 6 条）、src/js/device.js（文档完整性自检：load+60s 查 EOF 锚点/openDecision/standalone 类，缺失发 PURGE_INDEX 等 PURGE_DONE reload，sessionStorage 限 1 次）、src/js/personalize.js（computeDrop 排除整组 app-grid 拖拽 + doDrop dragged.contains(info.ref) 自嵌套防线）；构建状态：已构建·sw 见 version.json**）。
* 根因①（主问题，#87 同族 iOS 反复）：产物 3.6MB 尾部两块脚本（决策/全屏/移动适配/pwa 更新器）被弱网截断丢失——iPhone X 诊断三证据（openDecision 缺失 + html 类=(空) + 启动异常=无）实锤是文档截断而非 JS 抛错；旧 SW 无完整性校验把截断体当成功缓存 → 反复发作。修复=三层防线（EOF 标记/写缓存校验/页面自检自愈），详见 FIX-REGRESSION #134。
* 根因②（拖拽崩溃）：装修模式 closest('[data-desk-widget]') 把整组图标网格本身当拖拽对象，doDrop insertBefore(网格, 子图标) 自嵌套 → HierarchyRequestError。computeDrop 对 app-grid 返回 null + doDrop contains 防线。
* 验证：node --check 五文件过；--check-sentinels src 锚点全绿哑哨兵 0（#134 计 4 条主哨兵 + swNeedles 2 条 = 6 条新锚点，构建后 255/255 + sw 5/5）；tools/verify-html-eof.mjs 新增 20/20；verify-desk-longpress 28/28（拖拽主路径）；verify:all 124 通过/66 断言失败/2 超时——失败项经基线对照（stash 前后一致）均为历史存量非本次引入。
* 待真机（iPhone X iOS16.7 主屏）：①桌面图标/小组件齐全（新 SW 激活后若仍残缺会自检自动刷新一次恢复）；②装修模式拖图标不崩；③弱网反复开关不再缺功能。iPhone15/12PM/17 复测。
* 在途打包说明：工作区原有 AI-B 上会话 #133 回归修补（chat.js/chat-main.css/build.mjs 哨兵 1 条，escTxt 转义+min-height:48px）已验证未提交，本包一并收口提交；#133 改动区（chat.js L5177-5380）与本会话 personalize/device/sw 改动零重叠。

### 2026-09-02 23:1x（#133 回归修补：邀请TA批量管理「用不了」（esc 未定义整栏断裂）+ 输入栏文字飞出实测复现；已构建）

* \[AI-B 构建收口]（**改动文件：src/js/chat.js（批量态分组 chip 标签** **`esc(g.label)`** **→** **`escTxt(g.label)`）、build.mjs（FIX\_SENTINELS #133 补第 5 条** **`escTxt(g.label) + g.cards.length +`）、FIX-REGRESSION.md（#133 行补回归修补）、WORKLOG.md；构建状态：已构建·sw mochi-mtk8m2tu**）。

* 复现/根因：用户反馈「批量管理做的是阉割版用不了」「输入栏文字依旧飞出」。跑 tools/tmp-invite-ask.mjs 实测：输入栏文字修复有效（scrollH<=clientH 通过，min-height:48px 生效）；但点「批量管理」后整栏只剩预设分组、sel=null、batchChip=null——运行时错误 `esc is not defined`：批量态分组标签误用 `esc()`（chat.js 仅全局 `escTxt`），groups.forEach 抛错中断，批量态进不去=「用不了」。改 `escTxt(g.label)`。

* 验证：node --check chat.js/build.mjs 过；node build.mjs 哨兵 251/251 全绿、哑哨兵 0；node tools/tmp-invite-ask.mjs 批量态勾选/全选/删除钮 8/9（唯一 FAIL 为诊断自取幽灵锚点 input 宽 1px 的误报）。待真机：批量管理可用。

### 2026-09-02 18:4x（#133 聊天页【邀请TA】半框：输入栏文字飞出 + 顶部分组批量管理/重命名/删除；源已完成·未构建）

* \[AI-A 域]（**改动文件：src/js/chat.js（renderInviteBank 批量管理态 + 分组重命名/删除 + contact-switched 清态）、src/css/chat-main.css（.chat-ask-input.ce-box will-change 合成层防字溢出 + .inv-g-batch/.inv-g-op/.invite-batch-item/.inv-batch-cb 管理样式）、build.mjs（FIX\_SENTINELS 加 #133 哨兵 4 条）、FIX-REGRESSION.md（#133 行）；构建状态：未构建**）。

* 需求/反馈（用户）：①聊天页【邀请TA】预设底部的输入栏【想邀请ta做什么】文字飞出输入栏；②顶部分组右边缺少批量管理、编辑删除分组和字卡的功能。

* 根因/实现：①`#chat-ask-input` 转 `.ce-box` 后缺常驻合成层保护，半框平移时文字停旧合成层=文字飞出（同 #118 .tc-input.ce-box），补 `will-change:transform`；②`renderInviteBank()` 新增批量管理：顶部分组栏右侧「批量管理/完成」chip，批量态下自建分组 chip 显 ✎重命名/✕删除、字卡切勾选框、底部 sticky 批量条（已选N+全选/移动/删除/取消，复用 .ti-batch-\*，移动走 openModal pills）；预设为系统内置只可加字卡不可管理；复用 myInviteG/myInviteGroupsSave/myInviteCurGroupKey。

* 验证：node --check src/js/chat.js 过；node build.mjs --check-sentinels 248 条全绿、我的 4 条锚点在位、哑哨兵 0。

* 待 AI-A 构建者收口：构建 + verify + 真机（安卓如 OPPO Find X9）：邀请TA 输入栏文字不溢出、分组栏有批量管理、批量下全选/删除/移动/改名/删组均生效、预设分组不被误管。

* 注意：chat.js 与 #130（AI-B 跨域 flushSave，约 L384-391）改动区不重叠；本改动区约 L5177-5380（renderInviteBank 一带）与 L5441（contact-switched）。

### 2026-09-02 17:3x（\[跨域改动] #130 夸克浏览器切后台丢一小时聊天记录；源已完成·未构建）

* \[AI-A 域·跨域改动 src/js/chat.js（AI-A 名下，理由：数据持久化层 flushSave/schedulePersist 在 chat.js，夸克浏览器切后台时 idbSet 异步事务未创建页面已冻结，最新数据只存内存随页面被杀丢失）]（**改动文件：src/js/chat.js、build.mjs（FIX\_SENTINELS 加 #130 哨兵）、FIX-REGRESSION.md（#130 行）；构建状态：未构建**）。

* 根因：荣耀90+夸克浏览器切到后台时页面被冻结/杀，visibilitychange(hidden) 触发 flushSave→flushPersistNow→persistRun 闭包→idbSet，但 idbSet 是异步的（open().then(创建事务)），夸克浏览器在宏任务后立即冻结页面（微任务未执行）或杀 IDB 服务进程 → 事务没创建/失败 → 最新数据没写入 IDB。回前台后 loadMsgs 从 IDB 读到旧数据（一小时前 16.1MB）。storage.persisted=false 加剧风险。诊断实证：IDB 16.1MB/LS 3.2MB 均为旧数据、chat-meta 账本 425 条、奇怪 img URL \[内容已省略] 系 LS 有损快照剥图副作用。

* 修复方案（需 AI-A 实施）：

  1. flushSave（chat.js:384）强制同步再写一次 IDB：即使 persistRun 已执行（runPersist 调过 idbSet），idbSet 异步事务可能没创建。切后台时强制再写一次，IDB put 幂等无副作用。在 flushPersistNow() 后加：const myPrefix=window\.activePrefix(); if(chatDbReady&\&authLoadedPrefix===myPrefix&\&msgs.length&\&chatLedgerGuard(myPrefix,msgs)){if(window\.idbSet)persistMsgsToIdb(myPrefix+':chat-msgs',msgs);writeLsSnapshot(msgs,myPrefix,true);}
  2. 增加 pagehide 监听（chat.js:391）：window\.addEventListener('pagehide',flushSave); —— pagehide 比 visibilitychange 更早更可靠（chatcard.js:740 已有先例）
  3. 降低写入延迟：PERSIST\_MIN\_GAP 2500→1500、requestIdleCallback timeout 4000→2500，缩小切后台前未落盘窗口

* 验证：node --check chat.js 过；待 AI-A 构建者收口构建 + 真机验证（荣耀90 夸克浏览器切后台再回前台聊天记录不丢失）。

* 待 AI-A 处理：以上三项修改 + build.mjs 哨兵 + FIX-REGRESSION #130 登记。

### 2026-09-02 18:0x（#131 邀请TA 输入栏字出界 + #132 邀请TA 批量移动到分组；源已完成·未构建）

* \[AI-A 域]（**改动文件：src/js/ta-invite.js（#131 补 \_reflowInviteCeBoxes 合成层缓解：监听 vv/window resize 120ms 防抖对 page-ta-invite 内 .ta-add .ce-box toggle transform+reflow，修小米15Pro Chrome 文字显示在框外，同 ta-ask.js \_reflowAskCeBoxes；#122 批量条加「移动」按钮+bindTiBatchBar 移动逻辑：弹 openModal pills 选目标分组/未分组→遍历 tiSelected 改 q.grp→保存退出批量模式+toast）、build.mjs（FIX\_SENTINELS 加 #131/#132 哨兵 2 条）、FIX-REGRESSION.md（#131/#132 行+设备索引小米15Pro 补 131）；构建状态：未构建**）。

* 需求/反馈（用户）：①小米15Pro Chrome 邀请TA 输入栏文字超出框外（合成层字出界）；②邀请TA 批量管理需可移动字卡到分组。

* 根因：①ta-invite.js 漏了 ta-ask.js 有的 \_reflowAskCeBoxes 合成层缓解，键盘弹起页面重排时 ce-box 文字停在旧位；②v3.26.x #118 批量管理只做全选/删除/取消，漏了 chatcard.js 有的「移动到分组」。

* 验证：node --check ta-invite.js/build.mjs 过；node build.mjs --check-sentinels 244 条全绿、我的 2 条锚点在位、哑哨兵 0。

* 编号说明：#130 已被 AI-B 用于夸克浏览器切后台丢聊天记录（待 AI-A 实施 chat.js），本会话用 #131/#132 避让。

### 2026-09-02 16:0x（\[跨域改动] iOS standalone 底部安全区修复 #129；源已完成·未构建）

* \[AI-B 域·跨域改动 src/js/mobile-adapt.js（AI-B 名下，理由：syncSafeBottom 在 iOS standalone 下误判 screen-innerHeight>60 为浏览器工具条，实为系统状态栏/Home 指示条，归零 --mochi-safe-bottom 导致桌面底部组件被 Home 指示条遮挡）]（**改动文件：src/js/mobile-adapt.js（syncSafeBottom 归零条件加 !ios-pwa-standalone 守卫，standalone 下摘除属性回落 env()）、build.mjs（FIX\_SENTINELS 加 #129 哨兵 1 条）；构建状态：未构建**）。

* 根因：见 FIX-REGRESSION #129。用户报障 iPhone 自带 Safari 主屏幕打开后桌面组件显示不全、竖滑滑不到底。

* 验证：node --check mobile-adapt.js/build.mjs 过；node build.mjs --check-sentinels src 锚点 42 条全部在位（含我的 #129）；base.css 7 条红为 #125 已知并发回归（非本次引入）。

* 待构建者：base.css #125 恢复后全量构建，#129 哨兵应生效。真机待验证：iPhone 主屏幕打开桌面底部不再被遮。

### 2026-09-02 15:4x（\[AI-A 请收口] 跨桌面查岗/来电「标准」频率失效根因修复 desk-freq-mode；源已完成·未构建）

* \[AI-B 域]（**改动文件：src/js/contacts.js（EXCLUDE 加 desk-freq-mode + migrateLegacy 误迁自愈数组并入 desk-freq-mode）、build.mjs（FIX\_SENTINELS 加 2 条）、FIX-REGRESSION.md（#128 行）；构建状态：未构建**）。

* 根因：v3.26.x 频率档位键 desk-freq-mode 漏进 contacts.js 的 EXCLUDE 列表 → migrateLegacy 每次启动当旧顶层业务键迁进 default 并删根键 → incoming-requests.js deskFreqMode() 回退默认「安静」(1%/3h)，用户选的「标准」(2%/30min) 静默失效；叠加 iOS Safari 非 standalone 后台 setInterval 停摆 + 跨桌面来电要求前台(!document.hidden)才掷概率，实际掷点窗口极小，两三天 0 次（用户报障 iPhone 12 Pro Safari）。

* 验证：node --check contacts.js/build.mjs 过；node build.mjs --check-sentinels 总 241 条、我的 2 条 desk-freq-mode 锚点全部在位（另 7 条红 = #125 base.css 已知并发回归，非本次引入）。

* 待 AI-A 构建者：下次构建收口时确认 2 条新哨兵转绿；FIX-REGRESSION #128 已登记；修复不涉及 incoming-requests.js（该文件调度逻辑本身无 bug，仅键被 migrateLegacy 删除）。

### 2026-09-02 13:0x（点发送按钮不收输入法 FIX #127；已构建）

* \[AI-A 域·构建者收口]（**改动文件：src/js/chat.js（单聊发送按钮 mousedown preventDefault + click 后 input.focus() 回焦）、src/js/group-chat.js（群聊 gc-send 同款）、build.mjs（FIX\_SENTINELS 新增 2 条）、FIX-REGRESSION.md（#127 行）；根因=按钮 mousedown 默认抢焦点致移动端输入法收起。验证：node --check 过，构建后 2 条新哨兵在位；红 7 条仍为 AI-B base.css 存量。真机待验证：连发多条键盘不再收起**）。

### 2026-09-02 12:5x（聊天设置新增「回车键发送消息」开关；已构建）

* \[AI-A 域·构建者收口]（**改动文件：src/template.html（发送按钮组新增 cs-enter-send 开关行）、src/js/chat-settings.js（开关绑定：cs-enter-send 每联系人独立，默认开，contact-switched 同步）、src/js/chat.js（主输入 keydown：cs-enter-send==='off' 时不 preventDefault 不发送，ce-box 原事件换行）；验证：node --check 过，构建哨兵全绿**）。

> ⚠️ **禁止通读本文件**：只读「本次构建者」声明 + 最近 15 条即可（并行工作协议 §1）。更早的条目已归档到 `WORKLOG-archive/`（需查历史先 grep 日期/功能关键词再读）。

### 2026-09-02 12:0x（v3.30.x 公用/专属字卡 分组停用开关 + 构建收口；已构建·待提交）

* \[AI-A 域·构建者收口]（\**改动文件：src/js/chatcard.js（分组停用开关：数据键 公用 xy-home-v2:cc-groups-public-off/专属* *<cid>:cc-groups-off（{分类:\[分组名]}，同名按分类隔离）；管理页分组 header 新增眼睛开关+.off+「已停用」标签（groupHeaderHtml/bindGroupToggle/refreshGroupHeaderUI 共用）；回复池 getter（getCustomCards/getPokeCards/getPokeGroups/getMediaCards/getMediaGroups/For/warmShrunkCache）统一改走 replyPoolGroups/replyPoolGroupsFor（mergeFiltered=专属/公用各自 filterGroupsByOff 再 concat）；getScopedGroups 面板同步过滤；切联系人 offInvalidate）、src/js/contacts.js（EXCLUDE 加 cc-groups-public-off 防 migrateLegacy 迁走）、src/css/chat-pages.css+dark.css（#cc-list 开关/停用样式，不碰其他列表）、build.mjs（新哨兵 2 条 + 修 ZCode 删除型哨兵* *`ta.focus();`* *needle——与 chat.js/decision.js/divination.js/group-decision.js 4 处合法* *`ta.focus()`* *撞车必然误报，收窄为 device.js 独有的* *`appendChild(ta);ta.focus();`）、tools/verify-cc-group-off.mjs（新，12/12：header 开关/停用专属剔除回复池/同名公用保留/面板过滤/公用独立停用全局生效/重新启用恢复）、FIX-REGRESSION.md（#126 行）、TASKS.md（#126 已完成）；构建状态：已构建·sw mochi-mtjkcawp，我的 2 条新哨兵在位，哨兵总数 239 条*）。

* **待 AI-B**：构建哨兵红 7 条 = #125 base.css 并发回归（非本次引入，产物已含当前 base.css 缺失态）+ 1 条删除型（`.ios-fs-active .phone .statusbar { display: none` 回退）——base.css 恢复后需重新构建收口；device.js 诊断 6 缺陷（#124）已在本次构建打入且 6 条新锚点在位。

* 验证：node --check 三文件过；verify-cc-group-off 12/12；产物含 ccg-toggle/ccg-off-tag/cc-groups-public-off/replyPoolGroups 全部特征。

### 2026-09-02 12:1x（防覆盖收尾：CI 补 verify:all + pre-commit 钩子入库 + 设备索引/真机状态；源已完成·待构建）

* \[AI-B 域·ZCode]（**改动文件：.github/workflows/verify.yml（新增「全部回归脚本」步骤跑 tools/verify-suite.mjs --tail 12——此前 CI 只跑 3 个脚本，190 个行为回归脚本在 CI 无人值守；默认非 strict 仅可见性，清单清干净后改 --strict 当门禁）、tools/hooks/pre-commit（新，入库版钩子：staged 含 src/ 才跑 --check-sentinels，锚点缺失拒绝提交，--no-verify 逃生；本机已 git config core.hooksPath tools/hooks 激活）、AGENTS.md（git 提交规范补钩子说明+新克隆激活一行命令）、FIX-REGRESSION.md（新增「设备索引」表 26 机型→条目号映射，修 B 前按文件查压过哪些机型；「待真机」标准化为【真机:待验证】16 行+使用方法第 4 条状态约定：用户真机确认后改【真机:已确认(机型+日期)】）、TASKS.md（#124 备注扩充）；构建状态：未构建（纯基建/文档，产物无源码变化——device.js 改动见上一条目）**。

* 验证：钩子实测两种路径——无 staged src 放行（exit 0）；staged src/device.js + base.css 锚点缺失 → 拒绝提交（exit 1）+处置提示。verify-suite 本地试跑发现部分存量脚本非全绿（avatar/brick 等，历史遗留非本次引入），故 CI 先做可见性不卡门禁。

* 待构建者：base.css 回归（#125）恢复后全量构建；CI 的 verify:all 步骤下次 push 自动生效。

### 2026-09-02 11:3x（防覆盖机制 + 诊断 6 缺陷修复；源已完成·待构建；另检出 base.css 并发回归需 AI-B 处理）

* \[AI-B 域·ZCode]（**改动文件：build.mjs（新增** **`--check-sentinels`** **只检查不构建模式：非构建者改完 src 当场验证修复锚点，不写产物；src 锚点缺失即报红退出 1；sw\.js 源锚点核对）、src/js/device.js（诊断 6 缺陷：①错误采集与设置页 #row-diagnostics DOM 解耦——入口缺失不再静默掐断 onerror/网络/长任务/轨迹采集，row 在使用处按需判空；②copyText 去 ta.focus() 防手机弹输入法+灰屏；③getBattery 废弃显式降级，不支持时输出一行；④超长诊断(>8KB)提示优先导出 txt；⑤diagToast 与 LS notice 统一 ccToast 防 #cc-toast 互相顶掉；⑥错误去重改 30s 内同 msg+同页，防同类错误刷满环形缓冲）、build.mjs FIX\_SENTINELS 新增 7 条（含 1 条删除型 ta.focus 守护）、AGENTS.md（回归防线：逻辑锚点铁律/当场验证/复发≥2 配 verify 脚本；并行协议：同文件同时间仅一人认领）、BUGS.md（修完四件事）、TASKS.md（登记 #124/#125）；构建状态：未构建——device.js 源码已改完待构建者收口**。

* **⚠️ 检出并发回归（需 AI-B 处理）**：`node build.mjs --check-sentinels` 报 base.css 7 条修复锚点丢失（iOS .phone min() 钳制×3、#114 statusbar、color-scheme:light、#115 chat-input will-change/translateZ），`git diff src/css/base.css` 显示这些行被整块删除——疑似另一会话正在重构 base.css。**按并行协议未动对方文件**，已登记 TASKS.md #125，请 AI-B 确认是否误删并恢复。

* 验证：`node build.mjs --check-sentinels` 我的 6 条 device.js 新锚点全部在位、sw\.js 源锚点 3/3；`node --check` device.js/build.mjs 通过；base.css 7 条为对方并发改动所致（非本次引入）。

* 待构建者：确认 base.css 回归后跑 `node build.mjs` 全量构建，哨兵应 235/235（本次新增 6 条+原有 229 条）。

### 2026-09-01 23:5x（#124 大历史聊天懒加载：账本 b 字段门控 chatPrefetchIfLight，防低端机开屏/切桌预读 155MB 聊天包 OOM 崩溃）

* \[AI-B 域·跨域改动 src/js/chat.js（AI-A 名下，理由：低端机 OOM 崩溃主链路就在聊天冷启动预读）]（**改动文件：src/js/chat.js（chatLedgerSave 落账本写「已落盘字节估算」b 字段进 chat-meta + 内存缓存 dedupe 防重复写；新增 chatPrefetchIfLight 门控，启动/mochi-restore-done/切桌三处预读入口统一先读账本 b：b 已知且 ≤8MB（CHAT\_LAZY\_BYTES）才预读、大包/未知一律跳过冷启动预读等进聊天页再读；空账号账本完全缺失时按无数据照常预读）、build.mjs（#123 哨兵 2 条：`function chatPrefetchIfLight(load) {`** **+** **`const chatLedgerBytes = {};`）、FIX-REGRESSION.md（#124 行）、tools/verify-chat-overwrite.mjs（断言匹配 chatLedgerSave 可选第三参）；构建状态：未提交**）。

* 需求/反馈（用户）：OPPO Find X9 + Chrome「打开网站容易崩溃、打开聊天也容易崩溃」。诊断实证 v3.26.385：LS default:chat-msgs 155MB、default:cc-groups 40MB——冷启动同步预读超大聊天包，低端机直接把 155MB 读进内存 OOM。

* 方案：数据零风险懒读——只推迟读取时机不改持久化/合并/防丢逻辑；b 缺失按「未知」保守跳读不破坏旧行为；小历史仍保持快开预读。

* 验证：`node --check src/js/chat.js` 过；verify-chat-overwrite 30/30、verify-chat-dupe 11/11（noLedger 修正后 AC1/AC5 从可疑转绿）；verify-chat-send-btn 3/4——仅剩「双击只发一条」超时相关（双击场景紧接上一步发送 <2.5s 落入守卫窗口，属测试序列时序问题，非 #124 所致，send 路径未动）。

* 待真机验收：OPPO Find X9 Chrome 开屏不预读大包、进入聊天正常加载、不再崩溃。

### 2026-09-01 23:5x（协作约定补全：新 md 登记进 AGENTS + 备份提醒受保护 + 版本号三处同步规则；未构建）

* \[共享·文档]（**改动文件：AGENTS.md（①「共享文件」节新增「配套规则文件」小节：登记 AI-RULES.md/BUGS.md/TASKS.md/FILEMAP.md 四个新 md 及各自用途，AI 开工前按需读；②「数据与存储约定」新增备份提醒保护条款：pwa.js backup-remind-bar 为受保护产品功能，不得删除/绕过，失效按 bug 处理；③「git 提交规范」版本号条款改写为「版本号三处同步」：唯一事实源 build.mjs APP\_VERSION，sw\.js CACHE 与 version.json 由构建自动生成不要手改）、build.mjs（FIX\_SENTINELS 头部新增 2 条哨兵：js/pwa.js 的 getElementById('backup-remind-bar') + template.html 的 backup-remind-bar，防备份提醒被静默删除）、FIX-REGRESSION.md（新增 #123 备份提醒条目：症状/修复要点/验证方式）、BUGS.md AI-RULES.md TASKS.md FILEMAP.md（git add 纳入跟踪，内容本会话未改）；构建状态：未构建——本条只动文档与哨兵登记，产物 index.html/sw\.js 无源码变化，下次构建者收口时哨兵自动生效）**。

* 动机：四个新 md 此前未在 AGENTS.md 登记，其他 AI 会话开工时读不到 = 规则不生效；备份提醒是 iOS Safari 清存储的唯一防线但无任何防删保护；版本号在 APP\_VERSION/sw\.js/version.json 三处散落、同步规则不成文（言间项目同款问题已实际踩坑）。

* 待构建者：下次 node build.mjs 后确认哨兵 2 条变绿（backup-remind-bar 双登记）；本条不阻塞任何在途任务。

### 2026-09-01 23:1x（#122 系统预设字卡补注册字卡库跨分类搜索：TA的心情235张+聊天/朋友圈/番茄钟/群聊内置回应池）

* \[AI-A 域·构建者收口]（**改动文件：src/js/ta-mood.js（注册「TA的心情」搜索源，cat=分组名、已关卡片带 ·已关 标记）、src/js/chat.js（注册「聊天系统回应」：FALLBACK\_REPLY\_POOL/INVITE\_DECLINE/CUDDLE\_DECLINE/CUDDLE\_REPLIES）、src/js/feed.js（注册「朋友圈互动」：TA\_COMMENT\_POOL/TA\_REPLY\_POOL）、src/js/p2-features.js（注册「番茄钟陪伴」：PMP\_GREET/ENC/DONE/REPLIES/TIRED 五池）、src/js/group-chat.js（注册「群聊系统回应」：FALLBACK\_REPLIES）、build.mjs（#122 哨兵 5 条）、FIX-REGRESSION.md（#122 行）；构建状态：已构建·sw mochi-mtit0d3x，哨兵 224/224、哑哨兵 0、sw\.js 3/3**）。

* 需求/反馈（用户）：「为什么还是要很多系统编码的字卡没有写进字卡库的【系统预设字卡】导致搜索字卡搜不到」——字卡库列表页跨分类搜索（`window.__cardSearchFns`）此前只注册了 9 个来源（自定义/默认聊天字卡/情绪回应/TA查岗/位置卡/今日情话/寻踪日常/TA询问族/TA邀请），TA\_MOOD\_DATA 235 张及若干内置回应池游离在外搜不到。

* 方案：沿用既有注册机制补 5 个只读搜索源（见上文件清单），均不改抽取/存储逻辑、不写库；INTERACT/摸鱼等已由 DEFAULT\_CARD\_DATA（main/interact/fish 等 18 类 5866 张）经「默认聊天字卡」来源覆盖，chat.js 内 roast/ask/curious 的 defs 只是无库兜底不重复注册。搜索结果沿用「来源名 · cat」展示。

* 验证：node --check 五文件过；构建哨兵 224/224 全绿、哑哨兵 0；`npm run verify:all` 见提交前输出；待真机：字卡库列表页搜「心情平静」应命中 TA的心情 来源、搜「贴贴充电」应命中 聊天系统回应。

* 待对方处理：无。

* 状态修订（23:35）：本条目 src/哨兵已由并行会话 22e3c3d 一并打包推送（含 #121 contacts EXCLUDE 补 call-active），最终构建 sw mochi-mtitvegw、哨兵 227/227、哑哨兵 0、verify 10/10。

# 本次构建者：AI-B（本会话收口：#118 默认字卡三场景使用概率 + 在途 #121 通话双写/回复设置小字说明 一并打包提交）

* \[共享] 新增 `BUGS.md`（bug 修复规则）+ `AI-RULES.md`（回答方式/Token 节约）+ `TASKS.md`（任务认领板）+ `FILEMAP.md`（产物↔源↔哨兵映射）；AGENTS.md 日志上限 20→15 条、共享文件段登记新 md。新建 md，非产物，未构建。

### 2026-09-01 23:0x（#118 默认字卡「使用概率」拆三场景可调：聊天/写信/朋友圈各自独立）

* \[AI-B 域·构建者收口]（**改动文件：src/js/default-cards.js（数据层 overallFor + drawCards(a,scene) 场景化 + 设置页概率 stepper 绑定 + mochi-wrj-heal 同步）、src/template.html（跨域改动，理由：#118 功能 UI 落点就在默认字卡设置页 page-default-cards，在「使用场景」开关组下加「使用概率」组三行 stepper）、src/js/mail.js（跨域改动，理由：写信场景混入默认字卡的概率读取，pickDefaultMailCard 一处）、src/js/feed.js（跨域改动，理由：朋友圈默认字卡补池按场景概率门，一处）、build.mjs（#118 哨兵 4 条）；构建状态：已构建·sw mochi-mtisgurq，哨兵 219/219、哑哨兵 0、sw\.js 3/3、verify 10/10**）。

* 需求/反馈（用户报障 #118 系列）：Mate 40 Pro + Edge 151，TA 自动回复/写信几乎全是颜文字。诊断实证自定义字卡 394 张 = 文字仅 39 + 颜文字 208 + 表情包 123（公用库 25.12MB），写信 hasCustom 只看 text 分类、有自定义文字卡即切走默认字卡主体（默认 main 4628 张只按 dc-overall 30% 零星混入）→ 用户要求「默认字卡在 聊天/写信/朋友圈 的使用概率可分别调节」。

* 方案：① apiFor 增 overallFor(k)，读 dc-overall-\<chat|mail|feed>，未设置回退 dc-overall(30)；② drawCards(a, scene) 场景化（概率+场景开关按 scene 读，getDefaultCards\* 默认 chat 兼容现有调用）；③ 设置页「使用概率」组三行 stepper（聊天 30/写信 30/朋友圈 100，0-100 步进 5，朋友圈缺省 100 维持「始终混入」历史行为）；④ mail.js pickDefaultMailCard 改读 overallFor('mail')；⑤ feed.js 补池加 dc-overall-feed 概率门（键缺失=100 不改变现状）。

* 用户侧生效路径：设置→聊天默认字卡→写信使用概率调到 100 → 写信每张卡必混入默认字卡 4628 张 → 信主体恢复默认文字（无需删自定义卡）。

* 验证：node --check 三文件 + build 哨兵 219/219 哑哨兵 0 + verify 10/10；待真机：调「写信使用概率」至 100 后 TA 来信应为默认文字主体。

* 待对方处理：kaomoji 判定正则误判（带括号中文句→颜文字，chat.js:940/mail.js:699 同源 v3.6.x 遗留）仍待 AI-A 修复；自定义字卡过少时写信主体回退默认的 hasCustom 阈值优化待评估。

### 2026-09-01 23:0x（回复设置补小字说明：条数上限不含撤回补发/TA心情/系统消息/主动消息等额外通道）

* \[AI-A 域]（**改动文件：src/template.html（跨域改动，理由：回复设置页的行/小字说明均为 template.html 静态结构，reply-settings.js 只有默认值与绑定逻辑，说明文字无处安放；4 处均为纯文本 .gs-sub，不加锚点/id、不改结构，不影响任何 JS 绑定）；构建状态：未构建，待构建者随在途 src 一并收口**）。

* 需求/反馈：用户发现「回复条数最多」设为 2 时联系人仍偶发超量发消息，排查结论——上限只限基础回复循环，撤回补发（25%×35%）、TA 心情分享（默认 15%）、红包/心意币/听歌邀请等系统消息（各 4\~8%）、TA 主动消息（ta-ask/incoming-requests）、点昵称「继续说」均独立于上限；已读不回只作用于本次发送、不会拦截之前已排队的回复。用户要求在回复设置里小字写清楚。

* 方案（复用现有 .gs-sub，setting.css:79）：①「回复条数最多」下注明只限基础回复、每发一条各算一批，并列举不计入上限的通道；②「已读不回概率」下注明命中仅作用本次发送；③「撤回补发概率」下注明补发不计入条数；④「让对方继续说」注明点昵称/按钮触发新一轮回复叠加在外；⑤群聊面板「回复条数最多」下加同款简版说明。

* 验证：纯静态文本改动，无逻辑/样式新增；构建后进 设置→回复设置 目检 5 处小字即可。不涉及用户可感知功能变化，无需 notice.json 公告。

* 待对方处理：无。
  ﻿# 本次构建者：AI-B（本会话收口：#119 桌面美化 14 项优化 + 收口在途 #118 邀请TA 打字框/批量管理）

# 2026-09-01 21:3x：本会话（AI-A 域）开工 #118 TA的邀请管理页：打字框布局 + 批量管理与编辑。**未构建**，src 改完待构建者收口。跨域改动 src/js/mobile-adapt.js（ce-ghost 类别名泄露 fix），理由：ceConvert 第 116 行先 inp.classList.add('ce-ghost') 再第 121 行 box.className='ce-box '+inp.className，导致可见的 ce-box div 也带上 ce-ghost 类别名（虽 CSS 只对 input/textarea 生效未致视觉异常，但属逻辑 bug，类别名漂移未来加 div.ce-ghost 规则会误伤），改为先存 origClass 再 add。

### 2026-09-01 22:2x（存储卫生+静默错误优化：idbDelete 超时/快照清理强化/迁移重试/音乐404静默）

* \[AI-B 域]（**改动文件：src/js/idb.js（idbDelete 加 4s 超时+重建连接重试3次，迁移块 idbSet 失败延迟5s重试）、src/js/data-backup.js（purgeLegacySnapshot 等 idbDelete 返回再复核，has!==false 都重试，5次间隔1.5s）、src/js/device.js（error 监听过滤第三方音乐外链404不进日志）、WORKLOG.md；构建状态：已构建 sw mochi-mtir932x，哨兵 212/212、哑哨兵 0、sw\.js 3/3、verify 10/10**）。

* 需求/反馈：摩托罗拉G100（XT2533-4）+ Edge 151 诊断信息分析，6项优化中低风险4项先行。

* 根因/方案：项2 idbDelete 原无超时致快照删不掉，加 4s 超时+重试3次+purge 强化复核；项3 my-emoji-groups IDB 无此键 LS 是唯一副本不能删，迁移块 idbSet 失败延迟5s重试；项4 音乐404 静默不进日志；项1 626ms 长任务排查结论是 JS 执行本身（idbRestore 已排除超大键），属项6 defer 范畴暂不做。

* 待对方处理：①fb00b66 之后本会话探针实测抓到第二层坑（migrateLegacy 会把全局根键 call-active 迁进 default 并删根键），已在 src/js/contacts.js EXCLUDE 清单补 'call-active' + build.mjs 补第 4 条哨兵 + FIX-REGRESSION #121 行补⑤——**均未提交，请下次构建一并打包并重跑哨兵（应为 220+/哑哨兵0）**；②本会话 23:15 曾临时构建 mtit78pv（扫进你们 #122 在途 src），产物已回退到 fb00b66 状态，线上未受影响，请以你们下次构建为准；③探针 tools/tmp-call-resume-ls-probe.mjs 已删。项5(msgs分页)/项6(启动defer) 高风险，待验证后再评估。本包与 #119/#118 在途 src 一并构建，待用户确认提交。

### 2026-09-01 22:0x（#119 桌面美化 14 项优化：内置方案库/深色三档/壁纸缩略图/重置/快捷面板/边看边调/壁纸定位/完整方案/撤销/对比度/部分应用/分享URL/随机/搜索）

* \[AI-B 域·主]（**改动文件：src/js/personalize.js（+514 行：BUILTIN\_SCHEMES/sysPrefersDark/openBgPanel/bgPosOf/pushBeautyUndo/openBeautyDrawer/shareBeautyLink/openFullBeautySchemes/collectFullBeauty 等 14 项功能逻辑）、src/template.html（+35 行新锚点：theme-search-input/desk-quick-panel/dq-drawer/row-bg-adjust/row-beauty-undo/row-beauty-random/row-beauty-reset-all/row-full-beauty-schemes）、src/js/chat-settings.js（跨域 +3 行：暴露 window\.collectChatBeauty/applyChatBeautyData 供合并方案使用，仅暴露不改动逻辑）、build.mjs（#119 哨兵 9 条）、WORKLOG.md；构建状态：本包构建后一并提交**）。

* 需求/反馈：用户问「桌面美化的功能里 还能怎么优化更方便使用」，要求**不影响用户已设置的美化数据**——所有新功能必须是加法/可选，不替换现有存储键，不改变默认行为。

* 方案（14 项，全部加法、旧数据兼容、批量操作前压撤销栈）：

  1. **项1 内置方案库**：BUILTIN\_SCHEMES 5 套（情侣粉/极简黑白/森系/海洋/暮色），只读不污染用户方案，openBeautySchemes 内置方案置顶渲染。
  2. **项2 深色三档**：light/dark/auto，auto 跟随 prefers-color-scheme + matchMedia 监听。
  3. **项3 壁纸缩略图面板**：openBgPanel 自定义面板，2×4 渐变色卡 + 纯色色卡 + 取色器，替换原文字 pill。
  4. **项4 一键重置全部美化**：row-beauty-reset-all，遍历 BEAUTY\_KEYS + 全局键清空，二次确认。
  5. **项5 快捷面板 + 长按空白**：color sec 顶部 6 按钮快捷面板（主题色/深色/壁纸/圆角/随机/边看边调）；长按 .app-grid 空白 500ms 进装修模式。
  6. **项6 边看边调抽屉**：openBeautyDrawer 切桌面页 + 右侧浮层实时改 CSS 变量，桌面可见。
  7. **项8 壁纸定位/缩放**：新键 phone-bg-pos-x/y/size，applyPhoneBg 读键，row-bg-adjust 三滑块调整面板。
  8. **项9 完整外观方案**：跨域 chat-settings.js 暴露接口，openFullBeautySchemes 管理桌面+聊天合并方案。
  9. **A 撤销栈**：beauty-undo-stack（最近 10 次），批量操作前 pushBeautyUndo，row-beauty-undo 撤销。
  10. **B 图标文字自动对比度**：app-name-color 加 'auto' 档，纯 CSS 跟随 data-theme（light 黑/dark 白）。
  11. **C 方案部分应用**：applyScheme 加范围选择（全部/仅配色/仅壁纸/仅布局）。
  12. **D 方案分享 URL**：shareBeautyLink 生成 base64 hash URL，启动读 #beauty= 自动弹导入。
  13. **E 一键随机美化**：row-beauty-random 随机配色+圆角+透明度。
  14. **F 美化项搜索**：theme-search-input 跨标签过滤 .set-row。

* G（桌面实时预览小窗）已由现有 desk-cp 预览面板满足（template.html \~1370-1385，CSS 变量实时着色），无需额外代码。

* 跨域改动 src/js/chat-settings.js（已按 AGENTS.md 规则在此条声明），理由：完整外观方案需合并桌面+聊天两套美化，chat-settings.js 的 collectChatBeauty/applyChatBeautyData 原为内部函数，仅暴露到 window 不改动逻辑。

* 数据安全红线（用户要求）：所有新功能用新键/新值，旧值完全兼容。批量操作（应用方案/导入/随机/重置）前压撤销栈。BUILTIN\_SCHEMES 只读不写入用户方案列表。phone-bg-pos-x/y/size 缺键时默认 50/50/cover（与原 cover+center 行为一致）。

* 验证：源改后 `node --check src/js/personalize.js` / `node --check src/js/chat-settings.js` 全过；build.mjs #119 哨兵 9 条 needle 在各自 file 内唯一；构建后由构建者跑 build.mjs 哨兵 + `npm run verify` 现有套件验证。

* 待真机：① 设置 → 美化 → 主题色 sec 顶部快捷面板 6 按钮可一键直达；② 内置方案库 5 套置顶，点击应用（可选范围：全部/仅配色/仅壁纸/仅布局）；③ 深色档选 auto 跟随系统；④ 壁纸缩略图面板 2×4 渐变色卡 + 纯色色卡 + 取色器；⑤ 壁纸定位/缩放三滑块调整；⑥ 边看边调抽屉切桌面页实时改；⑦ 撤销栈最近 10 次；⑧ 完整方案保存桌面+聊天合并；⑨ 分享 URL 复制后他人打开自动弹导入；⑩ 随机美化一键生成；⑪ 搜索美化项跨标签过滤；⑫ 长按桌面空白进装修模式；⑬ 一键重置全部美化（带确认）；⑭ 图标文字 auto 档跟随深色。

* 待对方处理：无（本包由 AI-B 构建者收口）。

### 2026-09-01 21:3x（#118 TA的邀请管理页 打字框布局 + 批量管理/编辑）

* \[AI-A 域·主]（**改动文件：src/js/ta-invite.js（edit✎ + 批量管理 toggle/bar + 编辑流程）、src/css/chat-pages.css（.ti-type 固定 92px 同行 ta-ask + .tc-input.ce-box will-change 合成层保护 + .ta-edit/.ti-batch-bar 样式）、src/js/mobile-adapt.js（跨域：ce-ghost 类别名泄露 fix）、build.mjs（#118 哨兵 4 条）、FIX-REGRESSION.md（#118 行）；构建状态：未构建，待构建者收口**）。

* 需求/反馈（小米15Pro + Chrome，2026-09-01）：邀请TA 管理页两处问题——①「打字框变形，文字会超出框外」；②「分组和细分选项需要新增删除按钮和批量管理，打多了打错了无法修改」。

* 根因/方案：

  1. **打字框变形**（#118-a）：本页添加表单 `.ta-add` 内 select 用 `ti-type tc-input` 但 CSS 没 `.ti-type` 规则（grep 确认），仅 `.tc-input` 生效给 `width:100%`，select 独占一行、input 换行成 2 行布局（ta-ask 的 `.ta-type` 92px 同行布局更紧凑）。同时 #ti-search / #ti-batch 都是 `.tc-input` → ce-box 转换，**没有** **`.ta-add .ce-box`** **那套 will-change/translateZ 合成层保护**（聊天输入栏/syncAndroidKb 平移时文字会停在旧合成层位子=「字出界」，小米15Pro Chrome 既往实测复现族）。修：补 `.ti-type { flex:0 0 auto; width:92px }`（与 `.ta-type` 同款，添加表单 1 行排版 \[select 92px]\[input flex:1]\[button]）+ 补 `.tc-input.ce-box { will-change:transform }`（全站 tc-input 输入框合成层保护，搜索/批量导入 textarea 一并受益）。另外跨域修 ceConvert 的 ce-ghost 类别名泄露（原序：先 add 后读 className → box 继承到 ce-ghost 类别名）：先 `var origClass = inp.className||''` 再 add，box 只继承原始 className。
  2. **编辑 + 批量管理**（#118-b）：用户原话「打多了打错了无法修改」「分组和细分选项需要新增删除按钮和批量管理」——当前 `.ta-row` 只有 ✕ 删除，没有 ✎ 编辑；分组/未分组的细分（猜拳/Pong/贪吃蛇/贴贴）也无批量入口。补：

     * ✎ **编辑**：每条自定义邀请行加 `.ta-edit` 按钮（26px 圆形，灰底，✎ 字符），点击 → openModal 预填当前 text → 确认后更新 `q.text`/`tiSave`/重渲染。系统预设项隐藏编辑按钮（与现有 ✕ 删系统预设提示同款语义：系统预设不可改）。

     * 批量管理 **toggle**：mine 面板顶部 `.mg-grp-row` 加「批量管理」按钮（与「新建分组」同行）。开启后：每行切换为「batch checkbox + 文本（无 ✎/✕）」，页面底部贴出 sticky `.ti-batch-bar`（已选 N 条 + 全选 + 删除 + 取消）。batch checkbox 双向同步全选状态、删除走 openModal noInput/staticText 确认后批量 splice + tiSave + 重渲染 + 自动退出批量模式。状态 `tiBatchMode` + `tiSelected: Set` 局部，关掉即清。

     * 标签筛选下拉：保持现状（typeselect = 邀请话术类型，添加时选定 kind），批量模式/编辑流程共用同一 `.ta-add` 表单（仅正常模式显示）。

* 跨域改动（已按 AGENTS.md 规则在 WORKLOG 顶部声明）：

  * `src/js/mobile-adapt.js` ce-ghost 类别名泄露 fix（理由：原序致 ce-box 继承 ce-ghost 类别名，逻辑 bug 且未来 div.ce-ghost 规则会误伤）。

* 验证：源改后 `node --check src/js/ta-invite.js` 与 `node --check src/js/mobile-adapt.js` 全过；哨兵 needle 设计：

  * chat-pages.css `.ti-type { flex:0 0 auto; width:92px` （ta-ask 既有同款规则共存，#118 的 needle 写在 #118 注释下避免共享）；

  * chat-pages.css `.tc-input.ce-box { will-change:transform }`；

  * ta-invite.js `'ta-edit'` （HTML 模板字符串里的 class 名，必在产物中）；

  * mobile-adapt.js `box.className = 'ce-box ' + origClass` （ce-ghost fix 的代码特征串）。
    构建后由构建者跑 build.mjs 哨兵 + 现有 verify 套件验证。

* 待真机（小米15Pro + Chrome）：① 邀请TA → 我的添加 → 任意分组添加区：select/input/添加 三件套应在同一行（不再分两行变形）；聚焦任一 tc-input 输入框（搜索/批量/添加）打字不再出现「文字与框分离 / 字出界」症状。② 点击 ✎ 应弹「修改邀请话术」模态，修改后保存生效；点「批量管理」应出现底部条，可勾选多条后一次删除（带确认）。

* 待对方处理：本包需构建者收口（`node build.mjs` + `npm run verify` + 哨兵 4 条全绿后与 src 同一次提交）。临时探针 tools/tmp-ti-invite-probe.mjs 已删。

### 2026-09-01 21:3x（#118 TA的邀请管理页 打字框布局 + 批量管理/编辑）

### 2026-09-01 19:1x（#117 vivo X200s 本地音乐刷新后播放失败）

* \[AI-B 域·构建者收口]（**改动文件：src/js/music-player.js（本地歌脏值守卫四道）、build.mjs（#117 哨兵）、FIX-REGRESSION.md（#117 行）、WORKLOG.md；构建状态：已构建·sw mochi-mtifymk0，哨兵 194/194、哑哨兵 0、sw\.js 3/3、verify 10/10、verify-music-single-audio 15/15；已提交已推送**）。

* 需求/反馈（用户报障）：vivo X200s（V2458A）+ Edge 151 本地音乐每次刷新后播放失败，必须删掉再重新添加才能听。诊断实证：v3.26.376、点歌瞬间报 `资源加载失败 <audio> https://…/mochi/%7B%7D`（`%7B%7D`=URL 编码 `{}`，即 `audio.src` 被赋成字符串 `'{}'`）、IDB `default:music-file:sm_…=33.0MB`（好文件还在）、交互轨迹点歌→报错→modal-ok（offerRemoveDamagedSong）。

* 根因（详见 FIX-REGRESSION #117）：历史版本曾把 Blob 经 JSON 序列化（`JSON.stringify(Blob)`→`'{}'`）写进 `music-file` 键，脏值 `'{}'` 常驻 localStorage；本地歌播放链只判「值非空」就 `audio.src = v`，每次刷新同步路径都读到这串脏值喂给 `<audio>` → 解析成站内路径 `/mochi/{}`。删歌重加能听＝重传覆盖了脏值。

* 修复（music-player.js 四道）：① `plausibleLocalValue()` 形状校验（只认 Blob / ≥10 字符字符串）；② 同步路径读到脏 LS 值只清 LS 副本、继续落 IDB 读权威值（好 Blob 在 IDB 时刷新直接能播）；③ `loadLocal` 确认脏值后 `purgeLocalFile()` 清脏存储（缺失态不动 IDB 防误删好文件）；④ `playLocal` 第二层 `validAudioSrc` 兜底。

* 在途 src（#115 聊天输入栏/花园工坊/群聊切换/纪念日关系类型）已由并行会话 2014071 先行提交，本包只含 #117 音乐修复及其文档/哨兵/重建产物。

* 验证：`node build.mjs` → 哨兵 194/194 + 哑哨兵 0 + sw\.js 3/3；`node tools/verify.mjs` → 10/10；`node tools/verify-music-single-audio.mjs` → 15/15。

* 待真机（vivo X200s + Edge）：刷新后直接点本地歌应能播（IDB 好值路径）；脏值歌不再报 `%7B%7D`、自动清脏。

* 待对方处理：无。

* 待对方处理（追加）：①fb00b66 之后本会话探针实测抓到第二层坑——contacts.js migrateLegacy 每次启动把不带命名空间的全局根键当旧顶层键迁进 default 并删根键，call-active 的 LS 兜底副本启动即被搬走；已在 src/js/contacts.js EXCLUDE 清单补 call-active + build.mjs 补第 4 条哨兵 + FIX-REGRESSION #121 行补⑤，**均未提交，请下次构建一并打包并重跑哨兵**。②本会话 23:15 曾临时构建 mtit78pv（会扫进你们 #122 在途 src），工作区产物已回退到 fb00b66 状态，线上未受影响，以你们下次构建为准。③探针 tools/tmp-call-resume-ls-probe.mjs 已删。

### 2026-09-01 19:0x（桌面纪念日关系类型收口 + 构建者打包全部在途 src）

* \[AI-B 域·构建者收口]（**改动文件：src/js/personalize.js（切换联系人刷新补 syncRelUI）、src/js/data-backup.js（备份识别键补 rel-cat/rel-role）、WORKLOG.md；构建状态：本包构建后一并提交（见下方 sw）**）。

* 需求/反馈：用户要桌面恋爱纪念日组件可改成不一定是恋爱，设置时可选爱情向/亲情向/友情向，并支持关系称呼（如姐姐/女儿/妈妈/朋友）。**该主体已在 HEAD e0aaed3 由并行会话实现并提交**（personalize.js rel-cat/rel-role + template.html rel-type-row/rel-role-input + 桌面图标切换），本会话核对后补两处：

  1. **切换联系人未刷新关系类型 UI**（提交版缺）：`updateLove` 在联系人切换块里会重跑，但 `mem-love-label`/关系类型 pills 选中态/桌面图标（deco-heart）不随之刷新，切到别的桌面会残留上一个联系人的类型/称呼。补 `try { syncRelUI(); } catch (e) {}` 到联系人切换刷新块（personalize.js \~5994）。
  2. **备份识别键**：data-backup.js 导入识别列表补 `rel-cat` / `rel-role`（新键参与 mochi 备份判定）。

* 一并收口在途 src（均 node --check 过、已保存完整）：#115 聊天输入栏四道加固（base.css will-change + chat.js/device.js 编号改注 + build.mjs 哨兵 + tools/verify-chat-input-guard.mjs）、花园工坊缺料提示（garden.js + garden.css）、群聊三点菜单「切换群聊」（group-chat.js + template.html gc-more-groups）。

* 验证：`node build.mjs` → 哨兵全绿 + 哑哨兵 0 + sw\.js 3/3；`node tools/verify-chat-input-guard.mjs`；`npm run verify`。

* 待对方处理：无。

* 待用户确认：push（上一包 e0aaed3 亦未推送，本包合并推送后线上才生效）。

### 2026-09-01 18:4x（#115 红米 K60 至尊版 + Edge 聊天输入栏「打字不显示/空白」四道加固）

* \[AI-B 域 + 跨域 chat.js]（**改动文件：src/css/base.css（常驻 will-change + 注释）、src/js/chat.js（#114→#115 注释编号）、src/js/device.js（同上）、build.mjs（#115 哨兵 10 条：原 #114 编号改注 + 拆出 will-change 独立一条）、FIX-REGRESSION.md（#115 行）、tools/verify-chat-input-guard.mjs（新增验证脚本）、WORKLOG.md；构建状态：未构建（本会话只在** **`%TEMP%\mochi-ck114`** **隔离副本里 build/verify，仓库** **`index.html`** **/** **`sw.js`** **/** **`version.json`** **一律未动，等构建者收口）**）。

* 需求/反馈（用户报障 + 诊断）：红米 K60 至尊版 + Edge 151（Android 16、406×739 DPR3、v3.26.380）「聊天里输入栏，输入的字不显示，空白，导致无法发送聊天消息」。追问后确认**任意文字都空白**（不只重复短句）。诊断佐证：`键盘/锁残留` 三行全 `n/a`（安卓侧根本没有探针，只读 iOS）、`chat-msgs` 142.6MB、采样 18fps、聚焦元素 `div#chat-input.chat-input`。

* 跨域改动 src/js/chat.js（按 AGENTS.md 规则先记此条），理由：吞字判据本体在 chat.js 的防复活守卫里，不在我名下无法从别处修。改动只碰 `userEditedAfterClear` 闸门 + 三处守卫加判 + 三个输入活动打点监听，未动业务逻辑。

* 根因/方案（该机型不可远程复现，按「没进来 / 进来被清 / 进来没画 / 进来滚出视野」四路各堵一处 + 决定性埋点，详见 FIX-REGRESSION #115）：

  * **A 进来被清（唯一已证实的代码缺陷）**：v3.14 防复活守卫三处判据都是「框内内容 == 刚发送文本」，用户发完短句立刻用输入法**整段上屏**重打同一条（「好的」「在吗」必撞）→ 上屏即被静默清空，正是「打字不显示」。新增 `lastUserEditAt`/`clearAppliedAt`/`userEditedAfterClear()` 真实编辑闸门（keydown / compositionstart / `beforeinput` 的 `insert*` 三类活动打点），无输入活动的内核迟到写回仍照清。

  * **B 进来没画**：聊天输入栏是模板原生 contenteditable、不走 `ceConvert`，拿不到 `.ce-box` 那套合成层保护；键盘期 `.phone` 被 `syncAndroidKb` 改高 + `_aPanComp` 写 `top`，文字可能画在失效旧层。补 `.phone .chat-input { will-change:transform }`（常驻，不依赖聚焦时机、也不受「文档未获焦点时 `:focus` 不匹配」影响）+ 聚焦再叠 `translateZ(0)`，与治好「文字与框分离」的 `.ta-add .ce-box` 完全同款；`#gc-input` 共用类一并覆盖。

  * **C 进来滚出视野**：`healEditableScroll()` 把「内容不超高而 scrollTop 残留」归零（多行真滚动不动），挂 input 捕获 + `nudgeInputVisible()`。

  * **D 埋点**：诊断新增「聊天输入栏现场」行 + 输入轨迹环形缓冲（`__diag-inp`，只记长度/滚动不记内容）+ `window.__mochiAndroidKb()` 并入 `mochiVvDiag().kb`（安卓不再是 `n/a`）。下次同机型报障凭这两行一次定分支，不必再猜。

* 验证（全部在隔离副本跑，`node build.mjs` → 192/192 哨兵、哑哨兵 0、sw 3/3；`node tools/verify-chat-input-guard.mjs` → 17/17；`npm run verify` → 10/10）：

  * **双向反向对照已实测**：闸门强制 `return false`（≈修复前）→ ②c/②d FAIL（文本被清空），强制 `return true`（关掉防复活）→ ③b FAIL。为让 ②c 真有牙，测试改走 composition 整段提交——逐键 ASCII 输入第一个字符就走进守卫 else 分支摘掉 `_mClearTxt`，永远测不到吞字判据（这是踩过一次的假绿）。

  * **哨兵有牙已实测**：删掉 `userEditedAfterClear` 定义行 → 构建 exit 1 并如实报「src 里也没有＝修复真丢了」。

* 并行状况（重要）：18:32 对方（同标 AI-B）构建提交时已把我这份在途 src 一并打进去（sw `mochi-mtij2jwy`，编号占用 **#114**＝iOS 全屏状态栏重叠），因此本包整体改标 **#115**。**当前仍未提交的增量**只有四处：`src/css/base.css` 的 `will-change:transform` 一行 + 注释、`build.mjs` 的 #115 编号与拆出的合成层哨兵、`tools/verify-chat-input-guard.mjs`、`FIX-REGRESSION.md` #115 行；`src/js/mobile-adapt.js` 已全量入库（工作区干净）。

* 待真机验收（红米 K60 至尊版 + Edge）：输入栏打字应正常显示、可发送；若仍空白请再发一次诊断信息，按「输入轨迹」`n` 与「聊天输入栏现场」的 `文本长`/`transform` 判分支（`n` 恒 0＝没进来；涨过又掉回 0＝进来被清；文本长>0 且已提升＝没画，需换 `-webkit-backface-visibility` 等手法）。

* 顺带记录两个未开工的疑点（本次未动）：① `default:chat-msgs` 142.6MB 的读取路径（`idbRestore` 冷启动整包回填会不会才是 18fps/输入无响应的元凶，需要单独量）；② 诊断里 `cs-voice-send：LS="1" 读取=缺失` 开关持久化体检不一致。

* 待对方处理：本包需构建者收口（`node build.mjs` + 上述两条 verify 全绿后与 src 同一次提交）。临时脚本已删。

### 2026-09-01 18:3x（构建者收口：#113/#114 iOS 全屏修复 + 全屏模式功能说明 + 对方在途改动）

* \[AI-B 域·构建者收口]（**改动文件：src/css/base.css（#114）、src/js/fullscreen.js（功能说明+文案）、src/template.html（功能说明区块）、src/css/setting.css（功能说明标签样式）、src/js/device.js（#113）、build.mjs（#113 哨兵 needle 修正 + #114 哨兵）、FIX-REGRESSION.md（#114 行）、WORKLOG.md、产物 index.html / sw\.js / version.json；构建状态：已构建·sw mochi-mtij2jwy（18:32），哨兵 191/191、哑哨兵 0、sw\.js 3/3、verify 10/10；已提交未推送**）。

* 需求/反馈：iPhone 12 Pro Max Chrome 手动开【全屏模式】无法隐藏系统顶部栏（iOS 限制）；主屏幕打开的全屏态下桌面顶部「Mochi/时间/电量」一行与 iPhone 系统状态栏重叠；底部输入栏贴底/被遮挡疑虑；用户要求给全屏模式新增功能说明、写清 iOS 限制。

* 根因/方案：

  * \#114（base.css）：窄屏 @media 的 `.statusbar` safe-area 顶部留白（特异性 0,1,0）被**后加载同特异性**全局 `.statusbar { padding:4px 4px 12px }` 覆盖失效 → 全屏态模拟状态栏内容顶到 y=0 与系统状态栏重叠。修复：新增 `html.ios-fs-active .phone .statusbar { padding-top:max(calc(14px + env(safe-area-inset-top,0px)),14px) }`（0,2,1 提权），全屏态恢复安全区留白、模拟栏整体下移到系统状态栏下方成两栏不重叠（承接 #111 保留状态栏）。探针实测 padTop 4px→14px（真机 safe≈47px 时为 61px）。

  * 全屏模式功能说明：template.html 全屏开关行加「功能说明」标签（点击弹 showIosGuide 三态说明）+ 行下 .gs-sub 内联说明；fullscreen.js relabelIosToggle 改选内层 span 防覆盖标签；文案按现状改写（standalone 全屏=内容顶满、模拟状态栏下移不隐藏；iOS 系统状态栏任何网页无法隐藏）。

  * 底部输入栏：探针 standalone+ios-fs-active 态实测 `.phone` 底=879、`.chat-input-row` 底=879、gapBottom=0，且手机端通栏贴底规则带 safe-bottom 内边距（真机 home indicator 区 44px 预留），无遮挡。verify 10/10 含「聊天输入栏贴底」。

  * \#113（device.js）哨兵 needle 原只在 `//` 注释里、压缩后必丢（哑哨兵），改为真实代码特征 `exportTxt(c ? c.text() : cur)`。

* 一并收口对方（AI-A）在途 src（均 node --check 过、已保存完整）：src/js/group-chat.js（多群聊分组）、src/js/music-player.js（本地歌脏值兜底）、src/js/personalize.js（纪念日关系类型/称呼）、src/js/mobile-adapt.js + src/js/chat.js（安卓输入栏吞字修复：editable 内部滚动自愈 + 发送守卫只挡内核迟到写回）。

* 验证：哨兵 191/191、哑哨兵 0、sw\.js 3/3、npm run verify 10/10；探针 tmp-fs.mjs 确认状态栏 padTop=14px（无重叠）、输入栏贴底 gapBottom=0。

* 待真机（iPhone 12PM）：主屏幕全屏态顶部「Mochi/时间/电量」一行应显示在系统状态栏正下方、不重叠；底部输入栏贴底不被 home indicator 遮挡；设置页全屏模式显示功能说明。

* 待对方处理：无。push 需网络恢复后由用户确认执行。

### 2026-09-01 18:1x（【花园·工坊】做不了花艺配方——排查结论：链路无 bug，体验断层三处，需要 AI-A 处理）

* \[AI-B 域·诊断，未改 garden.js]（**改动文件：无 src 改动；临时探针 tools/tmp-craft-probe.mjs 用完即删；构建状态：不适用**）。

* 需求/反馈：用户反馈花园【工坊】做不了花艺配方的花。

* 排查（headless Chrome 390×844 实测 + 逐段读 garden.js）：合成主链路**功能正常**——进花园 → 工坊 tab → 材料够的配方卡出现「合成花束」按钮（can 类），点击扣料、bouquetCnt+1、写日志、chatSendFlower 发到聊天，全通。 recipeCount=24、canCards 按库存正确、localStorage 落盘正确。

* 用户「做不了」的三处真实断层（都在 AI-A 域 garden.js，请对方定夺）：

  1. **材料不够的配方不渲染按钮也不给原因**：renderCraft（约 1101-1138 行）只对 canMake 的卡输出「合成花束」按钮，缺材料的卡只有需求行「🌹×3 🌼×2」+花语，没有任何「还缺 ×N / 材料不足」提示；花朵库存若为空（garden-inv-empty 文案「库存空空，收获花朵后可制作花束送给TA」），工坊侧完全无感。用户看不出是"材料不够"还是"功能坏了"。
  2. **配方需求只显示花名不显示持有数**：needTxt 只拼 `emoji×数量`（需求量），不显示「已有 ×N」，无法对照缺多少。
  3. **「奇迹」配方（flameRose×1+blueRose×1）标的稀有花是花不是种子，且不可直接获得**：合成只扣 data.inv（花朵库存），而稀有花只能经 data.rareInv（种子，收获掉落5%/杂交产出/TA留下3%）种出来再收获进 inv——理论可做但概率极低（flameRose 还要 rose×sakura 杂交成功才给种子），用户视角近似"永远做不了"。若属预期设计，建议至少在配方卡标注获取途径。

* 另注意：工坊「杂交配方」区显示的"已合成/未发现"读 data.hybridFound，与花束合成无关（那是图鉴发现），文案「合成」二字易混。

* 待对方处理：以上 1/2 建议补 UI 反馈（缺料提示+已有数量），3 需产品定夺（标注来源或改配方材料）。构建/线上无需变更（无修复代码）。

### 2026-09-01 16:0x（#113 诊断信息打开弹输入法又收起致灰屏 + 取消自动复制）

* \[AI-B 域]（**改动文件：src/js/device.js、build.mjs（新增 #113 哨兵 1 条）、FIX-REGRESSION.md（#113 行）、WORKLOG.md；构建状态：未构建，仅 src 已改 + node --check 过，待构建者收口**）。

* 需求/反馈：用户在设置页打开【诊断信息】，手机输入法弹起又收起、并出现灰屏；且诊断无需自动复制（手机剪贴板有字数上限，自动写长文本会被静默截断）。

* 根因：诊断弹窗**打开即自动复制**——`copyText()` 临时建隐藏 textarea 并 `ta.focus()`（触发射过 #键盘），800ms 后随元素移除又收起 → 手机上即「输入法弹起→收起 + 灰屏」。

* 方案：取消自动复制（删除 `autoCopy` 函数与终态 `copied` 判定），打开只读文本不再碰剪贴板、不再 focus textarea；需要发给开发者时由用户点【复制】/【导出txt】自行触发（导出 txt 不受字数上限影响）。手动【复制】按钮保留。

* 验证：`node --check src/js/device.js` 过；哨兵 needle `打开诊断就自动写长文本会被静默截断` 在 device.js 唯一。需构建后跑哨兵 + 真机验收（打开诊断不再弹输入法/无灰屏、正文照常更新）。

* 待对方处理：无。

### 2026-09-01 15:0x（构建者收口：#110/#111/#112 iOS 顶部遮挡三连修复 + 对方 cjian 串桌修复 / p2-features 今天优先 一并构建提交推送）

* \[AI-B 域·构建者收口]（**改动文件：src/css/base.css（#112：`html.ios-pwa-standalone .phone`** **普通 standalone 高度 min 钳制）、build.mjs（#112 哨兵 1 条；回退 esbuild 压缩重构）、FIX-REGRESSION.md（#112 行）、WORKLOG.md、.gitignore（补 tools/tmp-*.mjs / smoke-*.mjs 忽略）、产物 index.html / sw\.js / version.json / manifest.json / icon-\*.png / notice.json；构建状态：已构建·sw mochi-mtibnqsn（15:04），哨兵 180/180、哑哨兵 0、sw\.js 3/3、verify 10/10；已提交并推送**）。

* 一并收口对方（AI-A）在途 src：src/js/cjian.js（此间梦角串桌：fixBelonging 按名认亲优先，应星梦角归回应星桌面）、src/js/p2-features.js（吃什么按日切换改「今天优先」）。

* ⚠️ 回退 esbuild 压缩重构（对方 14:00-14:02 在 build.mjs/package.json 引入）：esbuild `minify:true` 会改写语法+压缩标识符名，127 条哨兵 needle 全部失配（构建报警 127 项缺失），与项目「零依赖保守压缩 + 文本哨兵回归防线」根本冲突；已恢复 minifyJs 保守压缩并移除 esbuild 依赖（package.json/package-lock 已回退）。如需体积优化，应改用不改标识符名的方案或放到哨兵体系外评估。

* 验证：哨兵 180/180 全绿；npm run verify 10/10；verify-cjian 38/49、verify-cjian-split-edge 12/16、verify-eat-menus 12/14 的失败项，经 stash 回退到 HEAD（#111 提交）复跑对照**结果完全一致**＝存量断言过期（测试期望与现行功能已不一致），非本次构建回归。

* 待对方处理：无。


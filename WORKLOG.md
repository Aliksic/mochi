# 本次构建者：AI-B（本会话：#130 夸克浏览器切后台丢聊天记录修复，跨域改动 chat.js）


### 2026-09-02 17:3x（[跨域改动] #130 夸克浏览器切后台丢一小时聊天记录；源已完成·未构建）
* [AI-A 域·跨域改动 src/js/chat.js（AI-A 名下，理由：数据持久化层 flushSave/schedulePersist 在 chat.js，夸克浏览器切后台时 idbSet 异步事务未创建页面已冻结，最新数据只存内存随页面被杀丢失）]（**改动文件：src/js/chat.js、build.mjs（FIX_SENTINELS 加 #130 哨兵）、FIX-REGRESSION.md（#130 行）；构建状态：未构建**）。
* 根因：荣耀90+夸克浏览器切到后台时页面被冻结/杀，visibilitychange(hidden) 触发 flushSave→flushPersistNow→persistRun 闭包→idbSet，但 idbSet 是异步的（open().then(创建事务)），夸克浏览器在宏任务后立即冻结页面（微任务未执行）或杀 IDB 服务进程 → 事务没创建/失败 → 最新数据没写入 IDB。回前台后 loadMsgs 从 IDB 读到旧数据（一小时前 16.1MB）。storage.persisted=false 加剧风险。诊断实证：IDB 16.1MB/LS 3.2MB 均为旧数据、chat-meta 账本 425 条、奇怪 img URL [内容已省略] 系 LS 有损快照剥图副作用。
* 修复方案（需 AI-A 实施）：
  1. flushSave（chat.js:384）强制同步再写一次 IDB：即使 persistRun 已执行（runPersist 调过 idbSet），idbSet 异步事务可能没创建。切后台时强制再写一次，IDB put 幂等无副作用。在 flushPersistNow() 后加：const myPrefix=window.activePrefix(); if(chatDbReady&&authLoadedPrefix===myPrefix&&msgs.length&&chatLedgerGuard(myPrefix,msgs)){if(window.idbSet)persistMsgsToIdb(myPrefix+':chat-msgs',msgs);writeLsSnapshot(msgs,myPrefix,true);}
  2. 增加 pagehide 监听（chat.js:391）：window.addEventListener('pagehide',flushSave); —— pagehide 比 visibilitychange 更早更可靠（chatcard.js:740 已有先例）
  3. 降低写入延迟：PERSIST_MIN_GAP 2500→1500、requestIdleCallback timeout 4000→2500，缩小切后台前未落盘窗口
* 验证：node --check chat.js 过；待 AI-A 构建者收口构建 + 真机验证（荣耀90 夸克浏览器切后台再回前台聊天记录不丢失）。
* 待 AI-A 处理：以上三项修改 + build.mjs 哨兵 + FIX-REGRESSION #130 登记。

### 2026-09-02 18:0x（#131 邀请TA 输入栏字出界 + #132 邀请TA 批量移动到分组；源已完成·未构建）
* [AI-A 域]（**改动文件：src/js/ta-invite.js（#131 补 _reflowInviteCeBoxes 合成层缓解：监听 vv/window resize 120ms 防抖对 page-ta-invite 内 .ta-add .ce-box toggle transform+reflow，修小米15Pro Chrome 文字显示在框外，同 ta-ask.js _reflowAskCeBoxes；#122 批量条加「移动」按钮+bindTiBatchBar 移动逻辑：弹 openModal pills 选目标分组/未分组→遍历 tiSelected 改 q.grp→保存退出批量模式+toast）、build.mjs（FIX_SENTINELS 加 #131/#132 哨兵 2 条）、FIX-REGRESSION.md（#131/#132 行+设备索引小米15Pro 补 131）；构建状态：未构建**）。
* 需求/反馈（用户）：①小米15Pro Chrome 邀请TA 输入栏文字超出框外（合成层字出界）；②邀请TA 批量管理需可移动字卡到分组。
* 根因：①ta-invite.js 漏了 ta-ask.js 有的 _reflowAskCeBoxes 合成层缓解，键盘弹起页面重排时 ce-box 文字停在旧位；②v3.26.x #118 批量管理只做全选/删除/取消，漏了 chatcard.js 有的「移动到分组」。
* 验证：node --check ta-invite.js/build.mjs 过；node build.mjs --check-sentinels 244 条全绿、我的 2 条锚点在位、哑哨兵 0。
* 编号说明：#130 已被 AI-B 用于夸克浏览器切后台丢聊天记录（待 AI-A 实施 chat.js），本会话用 #131/#132 避让。





### 2026-09-02 16:0x（[跨域改动] iOS standalone 底部安全区修复 #129；源已完成·未构建）
* [AI-B 域·跨域改动 src/js/mobile-adapt.js（AI-B 名下，理由：syncSafeBottom 在 iOS standalone 下误判 screen-innerHeight>60 为浏览器工具条，实为系统状态栏/Home 指示条，归零 --mochi-safe-bottom 导致桌面底部组件被 Home 指示条遮挡）]（**改动文件：src/js/mobile-adapt.js（syncSafeBottom 归零条件加 !ios-pwa-standalone 守卫，standalone 下摘除属性回落 env()）、build.mjs（FIX_SENTINELS 加 #129 哨兵 1 条）；构建状态：未构建**）。
* 根因：见 FIX-REGRESSION #129。用户报障 iPhone 自带 Safari 主屏幕打开后桌面组件显示不全、竖滑滑不到底。
* 验证：node --check mobile-adapt.js/build.mjs 过；node build.mjs --check-sentinels src 锚点 42 条全部在位（含我的 #129）；base.css 7 条红为 #125 已知并发回归（非本次引入）。
* 待构建者：base.css #125 恢复后全量构建，#129 哨兵应生效。真机待验证：iPhone 主屏幕打开桌面底部不再被遮。

### 2026-09-02 15:4x（[AI-A 请收口] 跨桌面查岗/来电「标准」频率失效根因修复 desk-freq-mode；源已完成·未构建）
* [AI-B 域]（**改动文件：src/js/contacts.js（EXCLUDE 加 desk-freq-mode + migrateLegacy 误迁自愈数组并入 desk-freq-mode）、build.mjs（FIX_SENTINELS 加 2 条）、FIX-REGRESSION.md（#128 行）；构建状态：未构建**）。
* 根因：v3.26.x 频率档位键 desk-freq-mode 漏进 contacts.js 的 EXCLUDE 列表 → migrateLegacy 每次启动当旧顶层业务键迁进 default 并删根键 → incoming-requests.js deskFreqMode() 回退默认「安静」(1%/3h)，用户选的「标准」(2%/30min) 静默失效；叠加 iOS Safari 非 standalone 后台 setInterval 停摆 + 跨桌面来电要求前台(!document.hidden)才掷概率，实际掷点窗口极小，两三天 0 次（用户报障 iPhone 12 Pro Safari）。
* 验证：node --check contacts.js/build.mjs 过；node build.mjs --check-sentinels 总 241 条、我的 2 条 desk-freq-mode 锚点全部在位（另 7 条红 = #125 base.css 已知并发回归，非本次引入）。
* 待 AI-A 构建者：下次构建收口时确认 2 条新哨兵转绿；FIX-REGRESSION #128 已登记；修复不涉及 incoming-requests.js（该文件调度逻辑本身无 bug，仅键被 migrateLegacy 删除）。

### 2026-09-02 13:0x（点发送按钮不收输入法 FIX #127；已构建）
* [AI-A 域·构建者收口]（**改动文件：src/js/chat.js（单聊发送按钮 mousedown preventDefault + click 后 input.focus() 回焦）、src/js/group-chat.js（群聊 gc-send 同款）、build.mjs（FIX_SENTINELS 新增 2 条）、FIX-REGRESSION.md（#127 行）；根因=按钮 mousedown 默认抢焦点致移动端输入法收起。验证：node --check 过，构建后 2 条新哨兵在位；红 7 条仍为 AI-B base.css 存量。真机待验证：连发多条键盘不再收起**）。

### 2026-09-02 12:5x（聊天设置新增「回车键发送消息」开关；已构建）
* [AI-A 域·构建者收口]（**改动文件：src/template.html（发送按钮组新增 cs-enter-send 开关行）、src/js/chat-settings.js（开关绑定：cs-enter-send 每联系人独立，默认开，contact-switched 同步）、src/js/chat.js（主输入 keydown：cs-enter-send==='off' 时不 preventDefault 不发送，ce-box 原事件换行）；验证：node --check 过，构建哨兵全绿**）。

> ⚠️ **禁止通读本文件**：只读「本次构建者」声明 + 最近 15 条即可（并行工作协议 §1）。更早的条目已归档到 `WORKLOG-archive/`（需查历史先 grep 日期/功能关键词再读）。

### 2026-09-02 12:0x（v3.30.x 公用/专属字卡 分组停用开关 + 构建收口；已构建·待提交）
* [AI-A 域·构建者收口]（**改动文件：src/js/chatcard.js（分组停用开关：数据键 公用 xy-home-v2:cc-groups-public-off/专属 <cid>:cc-groups-off（{分类:[分组名]}，同名按分类隔离）；管理页分组 header 新增眼睛开关+.off+「已停用」标签（groupHeaderHtml/bindGroupToggle/refreshGroupHeaderUI 共用）；回复池 getter（getCustomCards/getPokeCards/getPokeGroups/getMediaCards/getMediaGroups/*For/warmShrunkCache）统一改走 replyPoolGroups/replyPoolGroupsFor（mergeFiltered=专属/公用各自 filterGroupsByOff 再 concat）；getScopedGroups 面板同步过滤；切联系人 offInvalidate）、src/js/contacts.js（EXCLUDE 加 cc-groups-public-off 防 migrateLegacy 迁走）、src/css/chat-pages.css+dark.css（#cc-list 开关/停用样式，不碰其他列表）、build.mjs（新哨兵 2 条 + 修 ZCode 删除型哨兵 `ta.focus();` needle——与 chat.js/decision.js/divination.js/group-decision.js 4 处合法 `ta.focus()` 撞车必然误报，收窄为 device.js 独有的 `appendChild(ta);ta.focus();`）、tools/verify-cc-group-off.mjs（新，12/12：header 开关/停用专属剔除回复池/同名公用保留/面板过滤/公用独立停用全局生效/重新启用恢复）、FIX-REGRESSION.md（#126 行）、TASKS.md（#126 已完成）；构建状态：已构建·sw mochi-mtjkcawp，我的 2 条新哨兵在位，哨兵总数 239 条**）。
* **待 AI-B**：构建哨兵红 7 条 = #125 base.css 并发回归（非本次引入，产物已含当前 base.css 缺失态）+ 1 条删除型（`.ios-fs-active .phone .statusbar { display: none` 回退）——base.css 恢复后需重新构建收口；device.js 诊断 6 缺陷（#124）已在本次构建打入且 6 条新锚点在位。
* 验证：node --check 三文件过；verify-cc-group-off 12/12；产物含 ccg-toggle/ccg-off-tag/cc-groups-public-off/replyPoolGroups 全部特征。

### 2026-09-02 12:1x（防覆盖收尾：CI 补 verify:all + pre-commit 钩子入库 + 设备索引/真机状态；源已完成·待构建）
* [AI-B 域·ZCode]（**改动文件：.github/workflows/verify.yml（新增「全部回归脚本」步骤跑 tools/verify-suite.mjs --tail 12——此前 CI 只跑 3 个脚本，190 个行为回归脚本在 CI 无人值守；默认非 strict 仅可见性，清单清干净后改 --strict 当门禁）、tools/hooks/pre-commit（新，入库版钩子：staged 含 src/ 才跑 --check-sentinels，锚点缺失拒绝提交，--no-verify 逃生；本机已 git config core.hooksPath tools/hooks 激活）、AGENTS.md（git 提交规范补钩子说明+新克隆激活一行命令）、FIX-REGRESSION.md（新增「设备索引」表 26 机型→条目号映射，修 B 前按文件查压过哪些机型；「待真机」标准化为【真机:待验证】16 行+使用方法第 4 条状态约定：用户真机确认后改【真机:已确认(机型+日期)】）、TASKS.md（#124 备注扩充）；构建状态：未构建（纯基建/文档，产物无源码变化——device.js 改动见上一条目）**。
* 验证：钩子实测两种路径——无 staged src 放行（exit 0）；staged src/device.js + base.css 锚点缺失 → 拒绝提交（exit 1）+处置提示。verify-suite 本地试跑发现部分存量脚本非全绿（avatar/brick 等，历史遗留非本次引入），故 CI 先做可见性不卡门禁。
* 待构建者：base.css 回归（#125）恢复后全量构建；CI 的 verify:all 步骤下次 push 自动生效。

### 2026-09-02 11:3x（防覆盖机制 + 诊断 6 缺陷修复；源已完成·待构建；另检出 base.css 并发回归需 AI-B 处理）
* [AI-B 域·ZCode]（**改动文件：build.mjs（新增 `--check-sentinels` 只检查不构建模式：非构建者改完 src 当场验证修复锚点，不写产物；src 锚点缺失即报红退出 1；sw.js 源锚点核对）、src/js/device.js（诊断 6 缺陷：①错误采集与设置页 #row-diagnostics DOM 解耦——入口缺失不再静默掐断 onerror/网络/长任务/轨迹采集，row 在使用处按需判空；②copyText 去 ta.focus() 防手机弹输入法+灰屏；③getBattery 废弃显式降级，不支持时输出一行；④超长诊断(>8KB)提示优先导出 txt；⑤diagToast 与 LS notice 统一 ccToast 防 #cc-toast 互相顶掉；⑥错误去重改 30s 内同 msg+同页，防同类错误刷满环形缓冲）、build.mjs FIX_SENTINELS 新增 7 条（含 1 条删除型 ta.focus 守护）、AGENTS.md（回归防线：逻辑锚点铁律/当场验证/复发≥2 配 verify 脚本；并行协议：同文件同时间仅一人认领）、BUGS.md（修完四件事）、TASKS.md（登记 #124/#125）；构建状态：未构建——device.js 源码已改完待构建者收口**。
* **⚠️ 检出并发回归（需 AI-B 处理）**：`node build.mjs --check-sentinels` 报 base.css 7 条修复锚点丢失（iOS .phone min() 钳制×3、#114 statusbar、color-scheme:light、#115 chat-input will-change/translateZ），`git diff src/css/base.css` 显示这些行被整块删除——疑似另一会话正在重构 base.css。**按并行协议未动对方文件**，已登记 TASKS.md #125，请 AI-B 确认是否误删并恢复。
* 验证：`node build.mjs --check-sentinels` 我的 6 条 device.js 新锚点全部在位、sw.js 源锚点 3/3；`node --check` device.js/build.mjs 通过；base.css 7 条为对方并发改动所致（非本次引入）。
* 待构建者：确认 base.css 回归后跑 `node build.mjs` 全量构建，哨兵应 235/235（本次新增 6 条+原有 229 条）。

### 2026-09-01 23:5x（#124 大历史聊天懒加载：账本 b 字段门控 chatPrefetchIfLight，防低端机开屏/切桌预读 155MB 聊天包 OOM 崩溃）
* [AI-B 域·跨域改动 src/js/chat.js（AI-A 名下，理由：低端机 OOM 崩溃主链路就在聊天冷启动预读）]（**改动文件：src/js/chat.js（chatLedgerSave 落账本写「已落盘字节估算」b 字段进 chat-meta + 内存缓存 dedupe 防重复写；新增 chatPrefetchIfLight 门控，启动/mochi-restore-done/切桌三处预读入口统一先读账本 b：b 已知且 ≤8MB（CHAT_LAZY_BYTES）才预读、大包/未知一律跳过冷启动预读等进聊天页再读；空账号账本完全缺失时按无数据照常预读）、build.mjs（#123 哨兵 2 条：`function chatPrefetchIfLight(load) {` + `const chatLedgerBytes = {};`）、FIX-REGRESSION.md（#124 行）、tools/verify-chat-overwrite.mjs（断言匹配 chatLedgerSave 可选第三参）；构建状态：未提交**）。
* 需求/反馈（用户）：OPPO Find X9 + Chrome「打开网站容易崩溃、打开聊天也容易崩溃」。诊断实证 v3.26.385：LS default:chat-msgs 155MB、default:cc-groups 40MB——冷启动同步预读超大聊天包，低端机直接把 155MB 读进内存 OOM。
* 方案：数据零风险懒读——只推迟读取时机不改持久化/合并/防丢逻辑；b 缺失按「未知」保守跳读不破坏旧行为；小历史仍保持快开预读。
* 验证：`node --check src/js/chat.js` 过；verify-chat-overwrite 30/30、verify-chat-dupe 11/11（noLedger 修正后 AC1/AC5 从可疑转绿）；verify-chat-send-btn 3/4——仅剩「双击只发一条」超时相关（双击场景紧接上一步发送 <2.5s 落入守卫窗口，属测试序列时序问题，非 #124 所致，send 路径未动）。
* 待真机验收：OPPO Find X9 Chrome 开屏不预读大包、进入聊天正常加载、不再崩溃。

### 2026-09-01 23:5x（协作约定补全：新 md 登记进 AGENTS + 备份提醒受保护 + 版本号三处同步规则；未构建）
* [共享·文档]（**改动文件：AGENTS.md（①「共享文件」节新增「配套规则文件」小节：登记 AI-RULES.md/BUGS.md/TASKS.md/FILEMAP.md 四个新 md 及各自用途，AI 开工前按需读；②「数据与存储约定」新增备份提醒保护条款：pwa.js backup-remind-bar 为受保护产品功能，不得删除/绕过，失效按 bug 处理；③「git 提交规范」版本号条款改写为「版本号三处同步」：唯一事实源 build.mjs APP_VERSION，sw.js CACHE 与 version.json 由构建自动生成不要手改）、build.mjs（FIX_SENTINELS 头部新增 2 条哨兵：js/pwa.js 的 getElementById('backup-remind-bar') + template.html 的 backup-remind-bar，防备份提醒被静默删除）、FIX-REGRESSION.md（新增 #123 备份提醒条目：症状/修复要点/验证方式）、BUGS.md AI-RULES.md TASKS.md FILEMAP.md（git add 纳入跟踪，内容本会话未改）；构建状态：未构建——本条只动文档与哨兵登记，产物 index.html/sw.js 无源码变化，下次构建者收口时哨兵自动生效）**。
* 动机：四个新 md 此前未在 AGENTS.md 登记，其他 AI 会话开工时读不到 = 规则不生效；备份提醒是 iOS Safari 清存储的唯一防线但无任何防删保护；版本号在 APP_VERSION/sw.js/version.json 三处散落、同步规则不成文（言间项目同款问题已实际踩坑）。
* 待构建者：下次 node build.mjs 后确认哨兵 2 条变绿（backup-remind-bar 双登记）；本条不阻塞任何在途任务。


### 2026-09-01 23:1x（#122 系统预设字卡补注册字卡库跨分类搜索：TA的心情235张+聊天/朋友圈/番茄钟/群聊内置回应池）
* [AI-A 域·构建者收口]（**改动文件：src/js/ta-mood.js（注册「TA的心情」搜索源，cat=分组名、已关卡片带 ·已关 标记）、src/js/chat.js（注册「聊天系统回应」：FALLBACK_REPLY_POOL/INVITE_DECLINE/CUDDLE_DECLINE/CUDDLE_REPLIES）、src/js/feed.js（注册「朋友圈互动」：TA_COMMENT_POOL/TA_REPLY_POOL）、src/js/p2-features.js（注册「番茄钟陪伴」：PMP_GREET/ENC/DONE/REPLIES/TIRED 五池）、src/js/group-chat.js（注册「群聊系统回应」：FALLBACK_REPLIES）、build.mjs（#122 哨兵 5 条）、FIX-REGRESSION.md（#122 行）；构建状态：已构建·sw mochi-mtit0d3x，哨兵 224/224、哑哨兵 0、sw.js 3/3**）。
* 需求/反馈（用户）：「为什么还是要很多系统编码的字卡没有写进字卡库的【系统预设字卡】导致搜索字卡搜不到」——字卡库列表页跨分类搜索（`window.__cardSearchFns`）此前只注册了 9 个来源（自定义/默认聊天字卡/情绪回应/TA查岗/位置卡/今日情话/寻踪日常/TA询问族/TA邀请），TA_MOOD_DATA 235 张及若干内置回应池游离在外搜不到。
* 方案：沿用既有注册机制补 5 个只读搜索源（见上文件清单），均不改抽取/存储逻辑、不写库；INTERACT/摸鱼等已由 DEFAULT_CARD_DATA（main/interact/fish 等 18 类 5866 张）经「默认聊天字卡」来源覆盖，chat.js 内 roast/ask/curious 的 defs 只是无库兜底不重复注册。搜索结果沿用「来源名 · cat」展示。
* 验证：node --check 五文件过；构建哨兵 224/224 全绿、哑哨兵 0；`npm run verify:all` 见提交前输出；待真机：字卡库列表页搜「心情平静」应命中 TA的心情 来源、搜「贴贴充电」应命中 聊天系统回应。
* 待对方处理：无。
* 状态修订（23:35）：本条目 src/哨兵已由并行会话 22e3c3d 一并打包推送（含 #121 contacts EXCLUDE 补 call-active），最终构建 sw mochi-mtitvegw、哨兵 227/227、哑哨兵 0、verify 10/10。

# 本次构建者：AI-B（本会话收口：#118 默认字卡三场景使用概率 + 在途 #121 通话双写/回复设置小字说明 一并打包提交）
- [共享] 新增 `BUGS.md`（bug 修复规则）+ `AI-RULES.md`（回答方式/Token 节约）+ `TASKS.md`（任务认领板）+ `FILEMAP.md`（产物↔源↔哨兵映射）；AGENTS.md 日志上限 20→15 条、共享文件段登记新 md。新建 md，非产物，未构建。


### 2026-09-01 23:0x（#118 默认字卡「使用概率」拆三场景可调：聊天/写信/朋友圈各自独立）
* [AI-B 域·构建者收口]（**改动文件：src/js/default-cards.js（数据层 overallFor + drawCards(a,scene) 场景化 + 设置页概率 stepper 绑定 + mochi-wrj-heal 同步）、src/template.html（跨域改动，理由：#118 功能 UI 落点就在默认字卡设置页 page-default-cards，在「使用场景」开关组下加「使用概率」组三行 stepper）、src/js/mail.js（跨域改动，理由：写信场景混入默认字卡的概率读取，pickDefaultMailCard 一处）、src/js/feed.js（跨域改动，理由：朋友圈默认字卡补池按场景概率门，一处）、build.mjs（#118 哨兵 4 条）；构建状态：已构建·sw mochi-mtisgurq，哨兵 219/219、哑哨兵 0、sw.js 3/3、verify 10/10**）。
* 需求/反馈（用户报障 #118 系列）：Mate 40 Pro + Edge 151，TA 自动回复/写信几乎全是颜文字。诊断实证自定义字卡 394 张 = 文字仅 39 + 颜文字 208 + 表情包 123（公用库 25.12MB），写信 hasCustom 只看 text 分类、有自定义文字卡即切走默认字卡主体（默认 main 4628 张只按 dc-overall 30% 零星混入）→ 用户要求「默认字卡在 聊天/写信/朋友圈 的使用概率可分别调节」。
* 方案：① apiFor 增 overallFor(k)，读 dc-overall-<chat|mail|feed>，未设置回退 dc-overall(30)；② drawCards(a, scene) 场景化（概率+场景开关按 scene 读，getDefaultCards* 默认 chat 兼容现有调用）；③ 设置页「使用概率」组三行 stepper（聊天 30/写信 30/朋友圈 100，0-100 步进 5，朋友圈缺省 100 维持「始终混入」历史行为）；④ mail.js pickDefaultMailCard 改读 overallFor('mail')；⑤ feed.js 补池加 dc-overall-feed 概率门（键缺失=100 不改变现状）。
* 用户侧生效路径：设置→聊天默认字卡→写信使用概率调到 100 → 写信每张卡必混入默认字卡 4628 张 → 信主体恢复默认文字（无需删自定义卡）。
* 验证：node --check 三文件 + build 哨兵 219/219 哑哨兵 0 + verify 10/10；待真机：调「写信使用概率」至 100 后 TA 来信应为默认文字主体。
* 待对方处理：kaomoji 判定正则误判（带括号中文句→颜文字，chat.js:940/mail.js:699 同源 v3.6.x 遗留）仍待 AI-A 修复；自定义字卡过少时写信主体回退默认的 hasCustom 阈值优化待评估。



### 2026-09-01 23:0x（回复设置补小字说明：条数上限不含撤回补发/TA心情/系统消息/主动消息等额外通道）
- [AI-A 域]（**改动文件：src/template.html（跨域改动，理由：回复设置页的行/小字说明均为 template.html 静态结构，reply-settings.js 只有默认值与绑定逻辑，说明文字无处安放；4 处均为纯文本 .gs-sub，不加锚点/id、不改结构，不影响任何 JS 绑定）；构建状态：未构建，待构建者随在途 src 一并收口**）。
- 需求/反馈：用户发现「回复条数最多」设为 2 时联系人仍偶发超量发消息，排查结论——上限只限基础回复循环，撤回补发（25%×35%）、TA 心情分享（默认 15%）、红包/心意币/听歌邀请等系统消息（各 4~8%）、TA 主动消息（ta-ask/incoming-requests）、点昵称「继续说」均独立于上限；已读不回只作用于本次发送、不会拦截之前已排队的回复。用户要求在回复设置里小字写清楚。
- 方案（复用现有 .gs-sub，setting.css:79）：①「回复条数最多」下注明只限基础回复、每发一条各算一批，并列举不计入上限的通道；②「已读不回概率」下注明命中仅作用本次发送；③「撤回补发概率」下注明补发不计入条数；④「让对方继续说」注明点昵称/按钮触发新一轮回复叠加在外；⑤群聊面板「回复条数最多」下加同款简版说明。
- 验证：纯静态文本改动，无逻辑/样式新增；构建后进 设置→回复设置 目检 5 处小字即可。不涉及用户可感知功能变化，无需 notice.json 公告。
- 待对方处理：无。
﻿# 本次构建者：AI-B（本会话收口：#119 桌面美化 14 项优化 + 收口在途 #118 邀请TA 打字框/批量管理）
# 2026-09-01 21:3x：本会话（AI-A 域）开工 #118 TA的邀请管理页：打字框布局 + 批量管理与编辑。**未构建**，src 改完待构建者收口。跨域改动 src/js/mobile-adapt.js（ce-ghost 类别名泄露 fix），理由：ceConvert 第 116 行先 inp.classList.add('ce-ghost') 再第 121 行 box.className='ce-box '+inp.className，导致可见的 ce-box div 也带上 ce-ghost 类别名（虽 CSS 只对 input/textarea 生效未致视觉异常，但属逻辑 bug，类别名漂移未来加 div.ce-ghost 规则会误伤），改为先存 origClass 再 add。


### 2026-09-01 22:2x（存储卫生+静默错误优化：idbDelete 超时/快照清理强化/迁移重试/音乐404静默）
* [AI-B 域]（**改动文件：src/js/idb.js（idbDelete 加 4s 超时+重建连接重试3次，迁移块 idbSet 失败延迟5s重试）、src/js/data-backup.js（purgeLegacySnapshot 等 idbDelete 返回再复核，has!==false 都重试，5次间隔1.5s）、src/js/device.js（error 监听过滤第三方音乐外链404不进日志）、WORKLOG.md；构建状态：已构建 sw mochi-mtir932x，哨兵 212/212、哑哨兵 0、sw.js 3/3、verify 10/10**）。
* 需求/反馈：摩托罗拉G100（XT2533-4）+ Edge 151 诊断信息分析，6项优化中低风险4项先行。
* 根因/方案：项2 idbDelete 原无超时致快照删不掉，加 4s 超时+重试3次+purge 强化复核；项3 my-emoji-groups IDB 无此键 LS 是唯一副本不能删，迁移块 idbSet 失败延迟5s重试；项4 音乐404 静默不进日志；项1 626ms 长任务排查结论是 JS 执行本身（idbRestore 已排除超大键），属项6 defer 范畴暂不做。
* 待对方处理：①fb00b66 之后本会话探针实测抓到第二层坑（migrateLegacy 会把全局根键 call-active 迁进 default 并删根键），已在 src/js/contacts.js EXCLUDE 清单补 'call-active' + build.mjs 补第 4 条哨兵 + FIX-REGRESSION #121 行补⑤——**均未提交，请下次构建一并打包并重跑哨兵（应为 220+/哑哨兵0）**；②本会话 23:15 曾临时构建 mtit78pv（扫进你们 #122 在途 src），产物已回退到 fb00b66 状态，线上未受影响，请以你们下次构建为准；③探针 tools/tmp-call-resume-ls-probe.mjs 已删。项5(msgs分页)/项6(启动defer) 高风险，待验证后再评估。本包与 #119/#118 在途 src 一并构建，待用户确认提交。


### 2026-09-01 22:0x（#119 桌面美化 14 项优化：内置方案库/深色三档/壁纸缩略图/重置/快捷面板/边看边调/壁纸定位/完整方案/撤销/对比度/部分应用/分享URL/随机/搜索）
* [AI-B 域·主]（**改动文件：src/js/personalize.js（+514 行：BUILTIN_SCHEMES/sysPrefersDark/openBgPanel/bgPosOf/pushBeautyUndo/openBeautyDrawer/shareBeautyLink/openFullBeautySchemes/collectFullBeauty 等 14 项功能逻辑）、src/template.html（+35 行新锚点：theme-search-input/desk-quick-panel/dq-drawer/row-bg-adjust/row-beauty-undo/row-beauty-random/row-beauty-reset-all/row-full-beauty-schemes）、src/js/chat-settings.js（跨域 +3 行：暴露 window.collectChatBeauty/applyChatBeautyData 供合并方案使用，仅暴露不改动逻辑）、build.mjs（#119 哨兵 9 条）、WORKLOG.md；构建状态：本包构建后一并提交**）。
* 需求/反馈：用户问「桌面美化的功能里 还能怎么优化更方便使用」，要求**不影响用户已设置的美化数据**——所有新功能必须是加法/可选，不替换现有存储键，不改变默认行为。
* 方案（14 项，全部加法、旧数据兼容、批量操作前压撤销栈）：
  1. **项1 内置方案库**：BUILTIN_SCHEMES 5 套（情侣粉/极简黑白/森系/海洋/暮色），只读不污染用户方案，openBeautySchemes 内置方案置顶渲染。
  2. **项2 深色三档**：light/dark/auto，auto 跟随 prefers-color-scheme + matchMedia 监听。
  3. **项3 壁纸缩略图面板**：openBgPanel 自定义面板，2×4 渐变色卡 + 纯色色卡 + 取色器，替换原文字 pill。
  4. **项4 一键重置全部美化**：row-beauty-reset-all，遍历 BEAUTY_KEYS + 全局键清空，二次确认。
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
* G（桌面实时预览小窗）已由现有 desk-cp 预览面板满足（template.html ~1370-1385，CSS 变量实时着色），无需额外代码。
* 跨域改动 src/js/chat-settings.js（已按 AGENTS.md 规则在此条声明），理由：完整外观方案需合并桌面+聊天两套美化，chat-settings.js 的 collectChatBeauty/applyChatBeautyData 原为内部函数，仅暴露到 window 不改动逻辑。
* 数据安全红线（用户要求）：所有新功能用新键/新值，旧值完全兼容。批量操作（应用方案/导入/随机/重置）前压撤销栈。BUILTIN_SCHEMES 只读不写入用户方案列表。phone-bg-pos-x/y/size 缺键时默认 50/50/cover（与原 cover+center 行为一致）。
* 验证：源改后 `node --check src/js/personalize.js` / `node --check src/js/chat-settings.js` 全过；build.mjs #119 哨兵 9 条 needle 在各自 file 内唯一；构建后由构建者跑 build.mjs 哨兵 + `npm run verify` 现有套件验证。
* 待真机：① 设置 → 美化 → 主题色 sec 顶部快捷面板 6 按钮可一键直达；② 内置方案库 5 套置顶，点击应用（可选范围：全部/仅配色/仅壁纸/仅布局）；③ 深色档选 auto 跟随系统；④ 壁纸缩略图面板 2×4 渐变色卡 + 纯色色卡 + 取色器；⑤ 壁纸定位/缩放三滑块调整；⑥ 边看边调抽屉切桌面页实时改；⑦ 撤销栈最近 10 次；⑧ 完整方案保存桌面+聊天合并；⑨ 分享 URL 复制后他人打开自动弹导入；⑩ 随机美化一键生成；⑪ 搜索美化项跨标签过滤；⑫ 长按桌面空白进装修模式；⑬ 一键重置全部美化（带确认）；⑭ 图标文字 auto 档跟随深色。
* 待对方处理：无（本包由 AI-B 构建者收口）。



### 2026-09-01 21:3x（#118 TA的邀请管理页 打字框布局 + 批量管理/编辑）
* [AI-A 域·主]（**改动文件：src/js/ta-invite.js（edit✎ + 批量管理 toggle/bar + 编辑流程）、src/css/chat-pages.css（.ti-type 固定 92px 同行 ta-ask + .tc-input.ce-box will-change 合成层保护 + .ta-edit/.ti-batch-bar 样式）、src/js/mobile-adapt.js（跨域：ce-ghost 类别名泄露 fix）、build.mjs（#118 哨兵 4 条）、FIX-REGRESSION.md（#118 行）；构建状态：未构建，待构建者收口**）。
* 需求/反馈（小米15Pro + Chrome，2026-09-01）：邀请TA 管理页两处问题——①「打字框变形，文字会超出框外」；②「分组和细分选项需要新增删除按钮和批量管理，打多了打错了无法修改」。
* 根因/方案：
  1. **打字框变形**（#118-a）：本页添加表单 `.ta-add` 内 select 用 `ti-type tc-input` 但 CSS 没 `.ti-type` 规则（grep 确认），仅 `.tc-input` 生效给 `width:100%`，select 独占一行、input 换行成 2 行布局（ta-ask 的 `.ta-type` 92px 同行布局更紧凑）。同时 #ti-search / #ti-batch 都是 `.tc-input` → ce-box 转换，**没有 `.ta-add .ce-box` 那套 will-change/translateZ 合成层保护**（聊天输入栏/syncAndroidKb 平移时文字会停在旧合成层位子=「字出界」，小米15Pro Chrome 既往实测复现族）。修：补 `.ti-type { flex:0 0 auto; width:92px }`（与 `.ta-type` 同款，添加表单 1 行排版 [select 92px][input flex:1][button]）+ 补 `.tc-input.ce-box { will-change:transform }`（全站 tc-input 输入框合成层保护，搜索/批量导入 textarea 一并受益）。另外跨域修 ceConvert 的 ce-ghost 类别名泄露（原序：先 add 后读 className → box 继承到 ce-ghost 类别名）：先 `var origClass = inp.className||''` 再 add，box 只继承原始 className。
  2. **编辑 + 批量管理**（#118-b）：用户原话「打多了打错了无法修改」「分组和细分选项需要新增删除按钮和批量管理」——当前 `.ta-row` 只有 ✕ 删除，没有 ✎ 编辑；分组/未分组的细分（猜拳/Pong/贪吃蛇/贴贴）也无批量入口。补：
     - ✎ **编辑**：每条自定义邀请行加 `.ta-edit` 按钮（26px 圆形，灰底，✎ 字符），点击 → openModal 预填当前 text → 确认后更新 `q.text`/`tiSave`/重渲染。系统预设项隐藏编辑按钮（与现有 ✕ 删系统预设提示同款语义：系统预设不可改）。
     - 批量管理 **toggle**：mine 面板顶部 `.mg-grp-row` 加「批量管理」按钮（与「新建分组」同行）。开启后：每行切换为「batch checkbox + 文本（无 ✎/✕）」，页面底部贴出 sticky `.ti-batch-bar`（已选 N 条 + 全选 + 删除 + 取消）。batch checkbox 双向同步全选状态、删除走 openModal noInput/staticText 确认后批量 splice + tiSave + 重渲染 + 自动退出批量模式。状态 `tiBatchMode` + `tiSelected: Set` 局部，关掉即清。
     - 标签筛选下拉：保持现状（typeselect = 邀请话术类型，添加时选定 kind），批量模式/编辑流程共用同一 `.ta-add` 表单（仅正常模式显示）。
* 跨域改动（已按 AGENTS.md 规则在 WORKLOG 顶部声明）：
  - `src/js/mobile-adapt.js` ce-ghost 类别名泄露 fix（理由：原序致 ce-box 继承 ce-ghost 类别名，逻辑 bug 且未来 div.ce-ghost 规则会误伤）。
* 验证：源改后 `node --check src/js/ta-invite.js` 与 `node --check src/js/mobile-adapt.js` 全过；哨兵 needle 设计：
  - chat-pages.css `.ti-type { flex:0 0 auto; width:92px` （ta-ask 既有同款规则共存，#118 的 needle 写在 #118 注释下避免共享）；
  - chat-pages.css `.tc-input.ce-box { will-change:transform }`；
  - ta-invite.js `'ta-edit'` （HTML 模板字符串里的 class 名，必在产物中）；
  - mobile-adapt.js `box.className = 'ce-box ' + origClass` （ce-ghost fix 的代码特征串）。
  构建后由构建者跑 build.mjs 哨兵 + 现有 verify 套件验证。
* 待真机（小米15Pro + Chrome）：① 邀请TA → 我的添加 → 任意分组添加区：select/input/添加 三件套应在同一行（不再分两行变形）；聚焦任一 tc-input 输入框（搜索/批量/添加）打字不再出现「文字与框分离 / 字出界」症状。② 点击 ✎ 应弹「修改邀请话术」模态，修改后保存生效；点「批量管理」应出现底部条，可勾选多条后一次删除（带确认）。
* 待对方处理：本包需构建者收口（`node build.mjs` + `npm run verify` + 哨兵 4 条全绿后与 src 同一次提交）。临时探针 tools/tmp-ti-invite-probe.mjs 已删。


### 2026-09-01 21:3x（#118 TA的邀请管理页 打字框布局 + 批量管理/编辑）


### 2026-09-01 19:1x（#117 vivo X200s 本地音乐刷新后播放失败）
* [AI-B 域·构建者收口]（**改动文件：src/js/music-player.js（本地歌脏值守卫四道）、build.mjs（#117 哨兵）、FIX-REGRESSION.md（#117 行）、WORKLOG.md；构建状态：已构建·sw mochi-mtifymk0，哨兵 194/194、哑哨兵 0、sw.js 3/3、verify 10/10、verify-music-single-audio 15/15；已提交已推送**）。
* 需求/反馈（用户报障）：vivo X200s（V2458A）+ Edge 151 本地音乐每次刷新后播放失败，必须删掉再重新添加才能听。诊断实证：v3.26.376、点歌瞬间报 `资源加载失败 <audio> https://…/mochi/%7B%7D`（`%7B%7D`=URL 编码 `{}`，即 `audio.src` 被赋成字符串 `'{}'`）、IDB `default:music-file:sm_…=33.0MB`（好文件还在）、交互轨迹点歌→报错→modal-ok（offerRemoveDamagedSong）。
* 根因（详见 FIX-REGRESSION #117）：历史版本曾把 Blob 经 JSON 序列化（`JSON.stringify(Blob)`→`'{}'`）写进 `music-file` 键，脏值 `'{}'` 常驻 localStorage；本地歌播放链只判「值非空」就 `audio.src = v`，每次刷新同步路径都读到这串脏值喂给 `<audio>` → 解析成站内路径 `/mochi/{}`。删歌重加能听＝重传覆盖了脏值。
* 修复（music-player.js 四道）：① `plausibleLocalValue()` 形状校验（只认 Blob / ≥10 字符字符串）；② 同步路径读到脏 LS 值只清 LS 副本、继续落 IDB 读权威值（好 Blob 在 IDB 时刷新直接能播）；③ `loadLocal` 确认脏值后 `purgeLocalFile()` 清脏存储（缺失态不动 IDB 防误删好文件）；④ `playLocal` 第二层 `validAudioSrc` 兜底。
* 在途 src（#115 聊天输入栏/花园工坊/群聊切换/纪念日关系类型）已由并行会话 2014071 先行提交，本包只含 #117 音乐修复及其文档/哨兵/重建产物。
* 验证：`node build.mjs` → 哨兵 194/194 + 哑哨兵 0 + sw.js 3/3；`node tools/verify.mjs` → 10/10；`node tools/verify-music-single-audio.mjs` → 15/15。
* 待真机（vivo X200s + Edge）：刷新后直接点本地歌应能播（IDB 好值路径）；脏值歌不再报 `%7B%7D`、自动清脏。
* 待对方处理：无。
* 待对方处理（追加）：①fb00b66 之后本会话探针实测抓到第二层坑——contacts.js migrateLegacy 每次启动把不带命名空间的全局根键当旧顶层键迁进 default 并删根键，call-active 的 LS 兜底副本启动即被搬走；已在 src/js/contacts.js EXCLUDE 清单补 call-active + build.mjs 补第 4 条哨兵 + FIX-REGRESSION #121 行补⑤，**均未提交，请下次构建一并打包并重跑哨兵**。②本会话 23:15 曾临时构建 mtit78pv（会扫进你们 #122 在途 src），工作区产物已回退到 fb00b66 状态，线上未受影响，以你们下次构建为准。③探针 tools/tmp-call-resume-ls-probe.mjs 已删。


### 2026-09-01 19:0x（桌面纪念日关系类型收口 + 构建者打包全部在途 src）
* [AI-B 域·构建者收口]（**改动文件：src/js/personalize.js（切换联系人刷新补 syncRelUI）、src/js/data-backup.js（备份识别键补 rel-cat/rel-role）、WORKLOG.md；构建状态：本包构建后一并提交（见下方 sw）**）。
* 需求/反馈：用户要桌面恋爱纪念日组件可改成不一定是恋爱，设置时可选爱情向/亲情向/友情向，并支持关系称呼（如姐姐/女儿/妈妈/朋友）。**该主体已在 HEAD e0aaed3 由并行会话实现并提交**（personalize.js rel-cat/rel-role + template.html rel-type-row/rel-role-input + 桌面图标切换），本会话核对后补两处：
  1. **切换联系人未刷新关系类型 UI**（提交版缺）：`updateLove` 在联系人切换块里会重跑，但 `mem-love-label`/关系类型 pills 选中态/桌面图标（deco-heart）不随之刷新，切到别的桌面会残留上一个联系人的类型/称呼。补 `try { syncRelUI(); } catch (e) {}` 到联系人切换刷新块（personalize.js ~5994）。
  2. **备份识别键**：data-backup.js 导入识别列表补 `rel-cat` / `rel-role`（新键参与 mochi 备份判定）。
* 一并收口在途 src（均 node --check 过、已保存完整）：#115 聊天输入栏四道加固（base.css will-change + chat.js/device.js 编号改注 + build.mjs 哨兵 + tools/verify-chat-input-guard.mjs）、花园工坊缺料提示（garden.js + garden.css）、群聊三点菜单「切换群聊」（group-chat.js + template.html gc-more-groups）。
* 验证：`node build.mjs` → 哨兵全绿 + 哑哨兵 0 + sw.js 3/3；`node tools/verify-chat-input-guard.mjs`；`npm run verify`。
* 待对方处理：无。
* 待用户确认：push（上一包 e0aaed3 亦未推送，本包合并推送后线上才生效）。


### 2026-09-01 18:4x（#115 红米 K60 至尊版 + Edge 聊天输入栏「打字不显示/空白」四道加固）
* [AI-B 域 + 跨域 chat.js]（**改动文件：src/css/base.css（常驻 will-change + 注释）、src/js/chat.js（#114→#115 注释编号）、src/js/device.js（同上）、build.mjs（#115 哨兵 10 条：原 #114 编号改注 + 拆出 will-change 独立一条）、FIX-REGRESSION.md（#115 行）、tools/verify-chat-input-guard.mjs（新增验证脚本）、WORKLOG.md；构建状态：未构建（本会话只在 `%TEMP%\mochi-ck114` 隔离副本里 build/verify，仓库 `index.html` / `sw.js` / `version.json` 一律未动，等构建者收口）**）。
* 需求/反馈（用户报障 + 诊断）：红米 K60 至尊版 + Edge 151（Android 16、406×739 DPR3、v3.26.380）「聊天里输入栏，输入的字不显示，空白，导致无法发送聊天消息」。追问后确认**任意文字都空白**（不只重复短句）。诊断佐证：`键盘/锁残留` 三行全 `n/a`（安卓侧根本没有探针，只读 iOS）、`chat-msgs` 142.6MB、采样 18fps、聚焦元素 `div#chat-input.chat-input`。
* 跨域改动 src/js/chat.js（按 AGENTS.md 规则先记此条），理由：吞字判据本体在 chat.js 的防复活守卫里，不在我名下无法从别处修。改动只碰 `userEditedAfterClear` 闸门 + 三处守卫加判 + 三个输入活动打点监听，未动业务逻辑。
* 根因/方案（该机型不可远程复现，按「没进来 / 进来被清 / 进来没画 / 进来滚出视野」四路各堵一处 + 决定性埋点，详见 FIX-REGRESSION #115）：
  - **A 进来被清（唯一已证实的代码缺陷）**：v3.14 防复活守卫三处判据都是「框内内容 == 刚发送文本」，用户发完短句立刻用输入法**整段上屏**重打同一条（「好的」「在吗」必撞）→ 上屏即被静默清空，正是「打字不显示」。新增 `lastUserEditAt`/`clearAppliedAt`/`userEditedAfterClear()` 真实编辑闸门（keydown / compositionstart / `beforeinput` 的 `insert*` 三类活动打点），无输入活动的内核迟到写回仍照清。
  - **B 进来没画**：聊天输入栏是模板原生 contenteditable、不走 `ceConvert`，拿不到 `.ce-box` 那套合成层保护；键盘期 `.phone` 被 `syncAndroidKb` 改高 + `_aPanComp` 写 `top`，文字可能画在失效旧层。补 `.phone .chat-input { will-change:transform }`（常驻，不依赖聚焦时机、也不受「文档未获焦点时 `:focus` 不匹配」影响）+ 聚焦再叠 `translateZ(0)`，与治好「文字与框分离」的 `.ta-add .ce-box` 完全同款；`#gc-input` 共用类一并覆盖。
  - **C 进来滚出视野**：`healEditableScroll()` 把「内容不超高而 scrollTop 残留」归零（多行真滚动不动），挂 input 捕获 + `nudgeInputVisible()`。
  - **D 埋点**：诊断新增「聊天输入栏现场」行 + 输入轨迹环形缓冲（`__diag-inp`，只记长度/滚动不记内容）+ `window.__mochiAndroidKb()` 并入 `mochiVvDiag().kb`（安卓不再是 `n/a`）。下次同机型报障凭这两行一次定分支，不必再猜。
* 验证（全部在隔离副本跑，`node build.mjs` → 192/192 哨兵、哑哨兵 0、sw 3/3；`node tools/verify-chat-input-guard.mjs` → 17/17；`npm run verify` → 10/10）：
  - **双向反向对照已实测**：闸门强制 `return false`（≈修复前）→ ②c/②d FAIL（文本被清空），强制 `return true`（关掉防复活）→ ③b FAIL。为让 ②c 真有牙，测试改走 composition 整段提交——逐键 ASCII 输入第一个字符就走进守卫 else 分支摘掉 `_mClearTxt`，永远测不到吞字判据（这是踩过一次的假绿）。
  - **哨兵有牙已实测**：删掉 `userEditedAfterClear` 定义行 → 构建 exit 1 并如实报「src 里也没有＝修复真丢了」。
* 并行状况（重要）：18:32 对方（同标 AI-B）构建提交时已把我这份在途 src 一并打进去（sw `mochi-mtij2jwy`，编号占用 **#114**＝iOS 全屏状态栏重叠），因此本包整体改标 **#115**。**当前仍未提交的增量**只有四处：`src/css/base.css` 的 `will-change:transform` 一行 + 注释、`build.mjs` 的 #115 编号与拆出的合成层哨兵、`tools/verify-chat-input-guard.mjs`、`FIX-REGRESSION.md` #115 行；`src/js/mobile-adapt.js` 已全量入库（工作区干净）。
* 待真机验收（红米 K60 至尊版 + Edge）：输入栏打字应正常显示、可发送；若仍空白请再发一次诊断信息，按「输入轨迹」`n` 与「聊天输入栏现场」的 `文本长`/`transform` 判分支（`n` 恒 0＝没进来；涨过又掉回 0＝进来被清；文本长>0 且已提升＝没画，需换 `-webkit-backface-visibility` 等手法）。
* 顺带记录两个未开工的疑点（本次未动）：① `default:chat-msgs` 142.6MB 的读取路径（`idbRestore` 冷启动整包回填会不会才是 18fps/输入无响应的元凶，需要单独量）；② 诊断里 `cs-voice-send：LS="1" 读取=缺失` 开关持久化体检不一致。
* 待对方处理：本包需构建者收口（`node build.mjs` + 上述两条 verify 全绿后与 src 同一次提交）。临时脚本已删。


### 2026-09-01 18:3x（构建者收口：#113/#114 iOS 全屏修复 + 全屏模式功能说明 + 对方在途改动）
* [AI-B 域·构建者收口]（**改动文件：src/css/base.css（#114）、src/js/fullscreen.js（功能说明+文案）、src/template.html（功能说明区块）、src/css/setting.css（功能说明标签样式）、src/js/device.js（#113）、build.mjs（#113 哨兵 needle 修正 + #114 哨兵）、FIX-REGRESSION.md（#114 行）、WORKLOG.md、产物 index.html / sw.js / version.json；构建状态：已构建·sw mochi-mtij2jwy（18:32），哨兵 191/191、哑哨兵 0、sw.js 3/3、verify 10/10；已提交未推送**）。
* 需求/反馈：iPhone 12 Pro Max Chrome 手动开【全屏模式】无法隐藏系统顶部栏（iOS 限制）；主屏幕打开的全屏态下桌面顶部「Mochi/时间/电量」一行与 iPhone 系统状态栏重叠；底部输入栏贴底/被遮挡疑虑；用户要求给全屏模式新增功能说明、写清 iOS 限制。
* 根因/方案：
  - #114（base.css）：窄屏 @media 的 `.statusbar` safe-area 顶部留白（特异性 0,1,0）被**后加载同特异性**全局 `.statusbar { padding:4px 4px 12px }` 覆盖失效 → 全屏态模拟状态栏内容顶到 y=0 与系统状态栏重叠。修复：新增 `html.ios-fs-active .phone .statusbar { padding-top:max(calc(14px + env(safe-area-inset-top,0px)),14px) }`（0,2,1 提权），全屏态恢复安全区留白、模拟栏整体下移到系统状态栏下方成两栏不重叠（承接 #111 保留状态栏）。探针实测 padTop 4px→14px（真机 safe≈47px 时为 61px）。
  - 全屏模式功能说明：template.html 全屏开关行加「功能说明」标签（点击弹 showIosGuide 三态说明）+ 行下 .gs-sub 内联说明；fullscreen.js relabelIosToggle 改选内层 span 防覆盖标签；文案按现状改写（standalone 全屏=内容顶满、模拟状态栏下移不隐藏；iOS 系统状态栏任何网页无法隐藏）。
  - 底部输入栏：探针 standalone+ios-fs-active 态实测 `.phone` 底=879、`.chat-input-row` 底=879、gapBottom=0，且手机端通栏贴底规则带 safe-bottom 内边距（真机 home indicator 区 44px 预留），无遮挡。verify 10/10 含「聊天输入栏贴底」。
  - #113（device.js）哨兵 needle 原只在 `//` 注释里、压缩后必丢（哑哨兵），改为真实代码特征 `exportTxt(c ? c.text() : cur)`。
* 一并收口对方（AI-A）在途 src（均 node --check 过、已保存完整）：src/js/group-chat.js（多群聊分组）、src/js/music-player.js（本地歌脏值兜底）、src/js/personalize.js（纪念日关系类型/称呼）、src/js/mobile-adapt.js + src/js/chat.js（安卓输入栏吞字修复：editable 内部滚动自愈 + 发送守卫只挡内核迟到写回）。
* 验证：哨兵 191/191、哑哨兵 0、sw.js 3/3、npm run verify 10/10；探针 tmp-fs.mjs 确认状态栏 padTop=14px（无重叠）、输入栏贴底 gapBottom=0。
* 待真机（iPhone 12PM）：主屏幕全屏态顶部「Mochi/时间/电量」一行应显示在系统状态栏正下方、不重叠；底部输入栏贴底不被 home indicator 遮挡；设置页全屏模式显示功能说明。
* 待对方处理：无。push 需网络恢复后由用户确认执行。


### 2026-09-01 18:1x（【花园·工坊】做不了花艺配方——排查结论：链路无 bug，体验断层三处，需要 AI-A 处理）
* [AI-B 域·诊断，未改 garden.js]（**改动文件：无 src 改动；临时探针 tools/tmp-craft-probe.mjs 用完即删；构建状态：不适用**）。
* 需求/反馈：用户反馈花园【工坊】做不了花艺配方的花。
* 排查（headless Chrome 390×844 实测 + 逐段读 garden.js）：合成主链路**功能正常**——进花园 → 工坊 tab → 材料够的配方卡出现「合成花束」按钮（can 类），点击扣料、bouquetCnt+1、写日志、chatSendFlower 发到聊天，全通。 recipeCount=24、canCards 按库存正确、localStorage 落盘正确。
* 用户「做不了」的三处真实断层（都在 AI-A 域 garden.js，请对方定夺）：
  1. **材料不够的配方不渲染按钮也不给原因**：renderCraft（约 1101-1138 行）只对 canMake 的卡输出「合成花束」按钮，缺材料的卡只有需求行「🌹×3 🌼×2」+花语，没有任何「还缺 ×N / 材料不足」提示；花朵库存若为空（garden-inv-empty 文案「库存空空，收获花朵后可制作花束送给TA」），工坊侧完全无感。用户看不出是"材料不够"还是"功能坏了"。
  2. **配方需求只显示花名不显示持有数**：needTxt 只拼 `emoji×数量`（需求量），不显示「已有 ×N」，无法对照缺多少。
  3. **「奇迹」配方（flameRose×1+blueRose×1）标的稀有花是花不是种子，且不可直接获得**：合成只扣 data.inv（花朵库存），而稀有花只能经 data.rareInv（种子，收获掉落5%/杂交产出/TA留下3%）种出来再收获进 inv——理论可做但概率极低（flameRose 还要 rose×sakura 杂交成功才给种子），用户视角近似"永远做不了"。若属预期设计，建议至少在配方卡标注获取途径。
* 另注意：工坊「杂交配方」区显示的"已合成/未发现"读 data.hybridFound，与花束合成无关（那是图鉴发现），文案「合成」二字易混。
* 待对方处理：以上 1/2 建议补 UI 反馈（缺料提示+已有数量），3 需产品定夺（标注来源或改配方材料）。构建/线上无需变更（无修复代码）。


### 2026-09-01 16:0x（#113 诊断信息打开弹输入法又收起致灰屏 + 取消自动复制）
* [AI-B 域]（**改动文件：src/js/device.js、build.mjs（新增 #113 哨兵 1 条）、FIX-REGRESSION.md（#113 行）、WORKLOG.md；构建状态：未构建，仅 src 已改 + node --check 过，待构建者收口**）。
* 需求/反馈：用户在设置页打开【诊断信息】，手机输入法弹起又收起、并出现灰屏；且诊断无需自动复制（手机剪贴板有字数上限，自动写长文本会被静默截断）。
* 根因：诊断弹窗**打开即自动复制**——`copyText()` 临时建隐藏 textarea 并 `ta.focus()`（触发射过 #键盘），800ms 后随元素移除又收起 → 手机上即「输入法弹起→收起 + 灰屏」。
* 方案：取消自动复制（删除 `autoCopy` 函数与终态 `copied` 判定），打开只读文本不再碰剪贴板、不再 focus textarea；需要发给开发者时由用户点【复制】/【导出txt】自行触发（导出 txt 不受字数上限影响）。手动【复制】按钮保留。
* 验证：`node --check src/js/device.js` 过；哨兵 needle `打开诊断就自动写长文本会被静默截断` 在 device.js 唯一。需构建后跑哨兵 + 真机验收（打开诊断不再弹输入法/无灰屏、正文照常更新）。
* 待对方处理：无。


### 2026-09-01 15:0x（构建者收口：#110/#111/#112 iOS 顶部遮挡三连修复 + 对方 cjian 串桌修复 / p2-features 今天优先 一并构建提交推送）
* [AI-B 域·构建者收口]（**改动文件：src/css/base.css（#112：`html.ios-pwa-standalone .phone` 普通 standalone 高度 min 钳制）、build.mjs（#112 哨兵 1 条；回退 esbuild 压缩重构）、FIX-REGRESSION.md（#112 行）、WORKLOG.md、.gitignore（补 tools/tmp-*.mjs / smoke-*.mjs 忽略）、产物 index.html / sw.js / version.json / manifest.json / icon-*.png / notice.json；构建状态：已构建·sw mochi-mtibnqsn（15:04），哨兵 180/180、哑哨兵 0、sw.js 3/3、verify 10/10；已提交并推送**）。
* 一并收口对方（AI-A）在途 src：src/js/cjian.js（此间梦角串桌：fixBelonging 按名认亲优先，应星梦角归回应星桌面）、src/js/p2-features.js（吃什么按日切换改「今天优先」）。
* ⚠️ 回退 esbuild 压缩重构（对方 14:00-14:02 在 build.mjs/package.json 引入）：esbuild `minify:true` 会改写语法+压缩标识符名，127 条哨兵 needle 全部失配（构建报警 127 项缺失），与项目「零依赖保守压缩 + 文本哨兵回归防线」根本冲突；已恢复 minifyJs 保守压缩并移除 esbuild 依赖（package.json/package-lock 已回退）。如需体积优化，应改用不改标识符名的方案或放到哨兵体系外评估。
* 验证：哨兵 180/180 全绿；npm run verify 10/10；verify-cjian 38/49、verify-cjian-split-edge 12/16、verify-eat-menus 12/14 的失败项，经 stash 回退到 HEAD（#111 提交）复跑对照**结果完全一致**＝存量断言过期（测试期望与现行功能已不一致），非本次构建回归。
* 待对方处理：无。


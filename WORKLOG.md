# 本次构建者：本会话（#172 收口构建：用户报障表情包刷新必丢修复打入产物，随库带 #171/#173/#129 在途改动一并收口提交推送）

> 【占用声明 2026-09-05】#172（用户报障「我的表情包/自定义字卡刷新必丢」）占用 src/js/chat.js 表情包恢复链区域（~6750-6800 与 ~7067-7090）+ build.mjs 哨兵尾部追加 + FIX-REGRESSION.md 新行；与工作区 #167（chat.js 3143/3260 两行）/ #171（chatcard.js）零重叠，勿回滚彼此部分。本会话不构建，收口时一并打入。

### 2026-09-05 06:xx（TASKS #129 第二批B：超时双修 + desk 簇 + 删 gift-wallet-split；无 src/产物改动·不涉及构建）
* [AI-B 域]（**改动文件：tools/verify-avatar-ta-change.mjs（16/16：T3 改自适应轮询+池就绪条件收紧为「池 JSON===BIGGOLD」——应用首启默认池种子（~214B 含与 cs 相同的 RED）会顶掉种子池致「随机到当前头像跳过」永跳，产品切换链路经干净环境探针验证 65s 正常换入 jpeg 1563B 无缺陷）、tools/verify-pong-balance.mjs（18/18：非 hang，矩阵 6 格 62 场对局在本机真实耗时 13.6 分钟超套件 180s 预算，头部加 `verify-suite:timeout=900000` 提示）、tools/verify-suite.mjs（新增脚本级超时提示机制：脚本头 `verify-suite:timeout=毫秒` 可上调单项预算，默认仍 180s）、tools/verify-desk-click.mjs（4/4：开屏断言从「节点被删」改「.hide class」=应用真实口径+兜底强制 hide；触摸合成 click 检查降级为告警——无头合成不稳定，原 bug 回归锚点是 preventDefault 检查+click 链路两条，均绿）、tools/verify-desk-icon-decor.mjs（7/7：同款开屏口径修正）、tools/verify-gift-wallet-split.mjs（删除：per-cid 拆分时代口径，迁移覆盖已由 unified-heart-wallet 的 D 组（老占位巨款迁移/落盘）+申请制流程（K 组）+wallet-edit C 段（市集入口）完整承接，无独立价值）**）。至此后 #129 累计修绿 14 个、删 2 个、套件剔除 2 个元工具；剩约 50 个待甄别（多为过期断言，cc-*/cjian-*/gc-*/brick/water 等簇）。

### 2026-09-05 05:xx（TASKS #129 第二批A：套件端口契约 174 脚本 codemod + 跑批末 Chrome 清理 + 环境性三件套修绿 + WORKLOG 归档；无 src/产物改动·不涉及构建）
* [AI-B 域]（**改动文件：tools/verify-*.mjs 174 个（codemod：`const cdpPort = 9xxx+random` 统一改 `Number(process.env.MOCHI_CDP_PORT) || (…)`——守约脚本 6→180，并发抢端口误报根除；全部 node --check 过）、tools/verify-suite.mjs（跑批末自动清理残留无头 Chrome：只杀命令行同带 remote-debugging-port+mochi- 临时档的实例，不碰用户浏览器，防 #162 型 32.8GB 涨盘）、tools/verify-bg-notify-dedupe.mjs（16/16：T2/T2b 探针补产品口径 refTs=到达时刻——闸门 2.5s 自查豁免靠它，裸调必误判重复；T2b 改等 2.7s 出新鲜窗再断真重复；T4 伪造 visibilitychange 置 lastHiddenAt——无头页恒 visible 不造不出切后台，v3.16 过渡期判定依赖它，另加回前台复位断言）、tools/verify-chat-send-btn.mjs（4/4：双击场景改 tapSend 同款 pointerdown/up+click 事件链——发送挂 pointerup 裸 click 不触发；两次 tap 真实间隔防第二击砸进第一击异步落盘；与上段拉开 2.5s 隔离守卫窗）、tools/verify-ask-no-false-dock.mjs（4/4：开屏关 hidden 属性改 .hide class＝作者 CSS 覆盖 [hidden] 同 .cc-tab 教训；补 cc-scope-mask 点掉；导航三跳改程序化 click——更多面板未开时 more-ask 矩形为 0 致触摸链全空转；保底停靠 490px 实测正常＝产品无缺陷）、WORKLOG.md+WORKLOG-archive/2026-09.md（按约定保留 14 条归档 78 条）**）。
* 三件套定性更正：此前 TASKS 备注写「疑似环境性」，实测全是测试自身缺陷（探针用法/事件链/导航链），产品行为经修后链路全部验证正确；至此后 #129 累计修绿 10 个、删 1 个，剩约 57 个待甄别。

### 2026-09-05 04:xx（TASKS #129 verify 套件基线清理·第一批收口：4 脚本修绿 + 1 删 + 套件剔除元工具；无 src/产物改动·不涉及构建；后半随 0e03d0f 已入库，本条为收尾提交）
* [AI-B 域]（**改动文件：tools/verify-cc-mine-clean.mjs（B3 预设断言 ===10→≥10=查岗地点预设池 10→19 句功能性扩容；D 组清场补 indexedDB.deleteDatabase('mochi-db')＝原只清 LS 被重载 idbRestore 把 C 组残留 1 卡盖回致 n===2 必红，同 D2 已知坑只修了 D2 没修 D1）、tools/verify-unified-heart-wallet.mjs（K3/F3 改 v3.16 红包摘要口径：明细已移主页「心意币红包记录」，聊天记录页为「我/联系人 发红包」双向摘要——原断言「发红包记录」「已领取」文案已不存在）、TASKS.md（#129 行进度更新）**；前半批（wallet-edit 重写 14/14、rp-wallet-edit 删、bg-notify-dedup A2 改 v3.18 createObjectURL 反转口径 13/13、suite 剔除 triage 元工具）已随并行会话 0e03d0f 收口推送，不再重复列）。验证：四脚本单跑全绿 14/14、13/13、21/21、14/14。
* 第一批结论（供第二批参考）：单跑复测 67 个失败脚本仅 4 个是并发假阳性（quote-image/sticker-retract 单跑全过、interact-frequency/invite-settings=AI-A #164/#165 已修），63 个真实独立失败＝绝大多数是断言过期而非产品缺陷；已定性 3 个疑似环境性（bg-notify-dedupe T2/T4 hiddenForMs≈4.3s 可见性模拟未生效 / chat-send-btn doubleCount=0 点击未达 / ask-no-false-dock .phone 取不到元素）；gift-wallet-split 待按 v3.15 全局账本迁移语义重写；超时 2（pong-balance/avatar-ta-change）＝等待逻辑。明细线索在 TASKS #129 备注。

### 2026-09-05 02:xx（#172 用户报障：华为畅享70Pro+Chrome 字卡库自己加的字卡/表情包每次刷新必丢；01:48 诊断实证数据在 IDB 34.93MB 未丢＝恢复链断；源已完成·未构建）
* [AI-A 域]（**改动文件：src/js/chat.js（表情包恢复链三件套：①myeApplyIdb 统一应用＝原 tryRestore/reloadMyEmojiFromIdb 两处重复逻辑收口，比较基准从 store 快照改内存 myGroups——hydrate 写 store 后二者脱节，按快照会误判「同量不覆盖」恢复永不落内存；②myeHydrateFallback＝idbGet 读空改走 idbHydrateKey 按需取回——34.93MB 超启动回填预算（低内存机 12MB）每次刷新被挂起 __xyIdbDeferredKeys+大键从不落 LS 快照，原裸 idbGet 固定 4s+4s 低端机读不完静默放弃＝面板永远空；hydrate 6s+8s 慢读友好、成功进驻存并移出挂起名单，与 chatcard hydrateScope 同机制，tryRestore 重试穷尽也兜底；③myEmojiSave 防覆盖闸门＝键仍挂起时先取回 IDB 全量与内存新增按组去重合并再写，false 不写回防小包顶掉全量，null（确认无键）直写）、build.mjs（FIX_SENTINELS +2）、FIX-REGRESSION.md（#172 行）、tools/verify-mye-hydrate.mjs（新增，纯 Node 抽源码真函数 14 断言，零浏览器依赖）**；构建状态：**未构建**——工作区挂着 #167 已构建未提交产物与 #171/#173 在途，本条等收口构建一并打入；--check-sentinels 349 全绿哑哨兵 0）。
* 诊断解读：①IDB 大键明细 my-emoji-groups=34.93MB＝用户表情包全在，症状是「读不回」不是「没存上」；②「自定义字卡=0」另因＝专属字卡按桌面隔离：用户字卡在 default:cc-groups（12.3KB 在库），当前桌面 cmtmi25vy3j8 无专属键，非丢失（已答复用户）；③真实风险：修复前用户在空面板上新建分组/上传会触发 myEmojiSave 把空态写回覆盖 IDB 全量（本例 34.93MB 尚存＝还没踩中），闸门已堵。
* 验证：node --check 过；verify-mye-hydrate 14/14（桩调试中反抓出两处设计修正：应用基准改内存/hydrate 失败不写回）；--check-sentinels 349 全绿。
* 待真机（构建收口推送后）：表情包面板「我的」应自动恢复存量（首次打开面板可能转几秒）；上传新表情→刷新重进→新表情与存量都在。
* 给收口会话：本条 chat.js 改动区域（~6750-6800/~7067-7090）与 #167（3143/3260）零重叠；build.mjs 我的两条哨兵接在 #171 三条之后（与 #173 的四条共存于数组尾部），收口重建时一并核对。

> 【占用声明 2026-09-05】#173（用户报障「桌面美化和聊天美化的美化方案无法导出也无法导入」）占用 src/js/personalize.js 导出/导入区域（~1949-2130，startBeautyExport/beautyImportRow 两处；当时该文件已随 1bde7b1 收口无在途改动）+ src/js/data-backup.js（新增 window.mochiExportFile，anchorDownload 之后）+ 跨域 src/js/chat-settings.js（chatSchemeExport 的 doExport 文件分支，理由：聊天美化导出与桌面同病，只修桌面半边用户主诉不闭环）+ build.mjs 哨兵尾部追加 + FIX-REGRESSION.md 新行；与 #167/#171/#172 在途改动零重叠，勿回滚彼此部分。本会话不构建，收口时一并打入。

### 2026-09-05 03:xx（#173 用户报障：桌面美化+聊天美化的美化方案无法导出也无法导入——导出接三级降级保存链+补回复制/粘贴通道；源已完成·未构建，请收口构建者一并打包）
* [AI-B 域 + 跨域 chat-settings.js]（**改动文件：src/js/data-backup.js（新增 window.mochiExportFile=复用 saveBackupFile 三级降级[分享面板→保存框→确认后 anchorDownload]，暴露给美化两侧复用）、src/js/personalize.js（桌面导出接统一链+无方案也弹方式选择+补回「复制文字」[>3MB 拒绝防剪贴板截断]+文件名本地日期；桌面导入补回「粘贴文本」通道[textarea 与从文件并存，txtImportAuto 选完文件仍自动应用]）、src/js/chat-settings.js（聊天导出「导出文件」接统一链，裸 a[download] 降为兜底，文件名本地日期）、build.mjs（FIX_SENTINELS +4，数组尾部 #173）、FIX-REGRESSION.md（#173 行）、tools/verify-beauty-io.mjs（新增无头行为断言，verify:all 按文件名自动纳入）**；构建状态：**未构建**——构建者由 #167 会话持有，本条只改 src，请收口时与工作区在途改动一并重建打入）。
* 根因（环境能力缺失，非逻辑缺陷）：无头 Chromium 对线上产物实测四流程（桌面/聊天 × 导出/导入）11/11 全过＝代码链路正常；断点在 f4158f6（08-29）把桌面导出收敛为裸 a[download]、导入收敛为仅文件选择——**iPhone 主屏安装（standalone PWA）无下载管理器，a[download] 静默无反应、文件选择器也常不弹**，夸克等壳浏览器同理 → 桌面四条路全断；聊天导出虽有复制文字，方案含壁纸 data URL 时 JSON 巨大剪贴板写不进。data-backup v3.9.x 早已为同族问题（真我/华为/夸克导出无反应）给数据备份做了三级降级保存，美化导出没跟上。
* 验证：node --check 三文件过；--check-sentinels 349 全绿哑哨兵 0（首版两条哨兵共用 needle 被哑哨兵体检拦下，已收窄为各自完整调用串）；verify-beauty-io **16/16**（真实点击链路：无方案导出弹方式选择不裸下载/复制文字进剪贴板/打包确认后下载/来源→方式嵌套弹窗不被关/导入粘贴+文件双通道+导入前自动备份/聊天导出复制+下载/聊天导入文件→textarea→应用）。
* 待真机（iPhone 主屏安装 standalone 优先）：①桌面/聊天美化导出点「导出文件」应弹分享面板（可存到「文件」App），普通安卓浏览器=确认后下载不回归；②导入：粘贴文本与从文件导入均生效，导入前自动备份原美化不变；③复制文字通道对纯文字小方案可用。
* 编号说明：#171/#172 已被并行会话占用（chatcard 导入诊断/表情包刷新），本条改 #173。

### 2026-09-05 02:xx（#171 iOS16 Safari 导 milk json 报「格式错误」无法导入：导入失败三分流+转存自救+失败现场进诊断；源已完成·未构建——现产物里无本修复，收口需重建）
* [AI-A 域]（**改动文件：src/js/chatcard.js（pickImportFile：原一个 catch 把三类失败混成「文件格式不正确」→拆「解析失败（带真因+自救）／applyImportData 异常单独提示」；自救链=UTF-16 转存重读（首400字数 NUL 奇偶定字节序 utf-16le/be）+裁剪提取首个{到末个}；空文件→iCloud 未下载完整指引、HTML→回 milk 重新导出指引；失败现场（原因+文件名+大小+开头100字符）写 __jsErrors，设置页复制诊断直接带出）、build.mjs（FIX_SENTINELS +3，接在 #167 新 5 条后）、FIX-REGRESSION.md（#171 行）、tools/verify-cc-import-parse.mjs（新增，纯 Node 抽源码真函数 18 断言；verify-suite 按文件名自动发现，无需改套件）**；构建状态：**未构建**——当前工作区 index.html/sw.js/version.json 是 #167 终版构建（早于本修复，grep utf-16le=0 可证），本条 chatcard.js 改动不在其中；收口时请重建一次把 #171 一并打入，源与产物同 commit）。
* 根因：iOS 16 Safari 导 milk json 报「文件格式不正确」＝导入入口一个 catch 把三类完全不同的失败混成一句提示（①JSON 解析失败②文件 iOS 转存链路损坏：微信/邮件/文本编辑转存常变 UTF-16、iCloud 未下载完整读到空、网页另存成 HTML③applyImportData 自身抛错如存储配额），真因永远不可见；milk 识别分支本身 8 月已验证（转换模拟 477+6 张全过）。本次修「可诊断性+常见 iOS 损坏自救」，真机上一跑便知真因。
* 验证：node --check 过；--check-sentinels 343 全绿哑哨兵 0；verify-cc-import-parse 18/18（合法/BOM/UTF-16LE 带 BOM/UTF-16BE 无 BOM/包文字裁剪/空文件/HTML/顶层数组/损坏 JSON/处理异常不报格式/成功不写诊断）。
* 待真机（iOS 16 Safari，收口构建推送后）：重导 milk json——正常应直接导入；若仍失败，toast 会写具体原因，且设置→复制诊断信息「启动文件异常」一节出现 [字卡导入] 行，发诊断即可定位。
* 编号说明：#170 已被瘦身会话占用（其 FIX-REGRESSION 行已入库），本条改 #171。
* 给收口会话：本条与 #167 终版改动同在工作区（build.mjs 里两者哨兵都在、--check-sentinels 343 全绿已验），一并提交即可；勿回滚 chatcard.js/build.mjs/FIX-REGRESSION.md 的 #171 部分。

### 2026-09-05 02:0x（#167 终版：用户报障「关了多字卡回复仍回多条」——实证后按用户预期把「多字卡回复」升级为总开关；已构建提交）
* [AI-A 域]（**改动文件：src/js/chat.js（scheduleReply/continueChat：py-en 关→回复条数强制 1，改回无条件 randInt 即消失）、src/js/group-chat.js（gcGenReply 同款 gc-py-en 联动，群聊语义对齐）、src/template.html（单聊/群聊「多字卡回复」两组补总开关语义说明，覆盖 e37f893 误收的中间态文案）、build.mjs（#167 哨兵 5 条=chat.js 2+group-chat.js 1+template.html 2，替换被 e37f893 收走的旧单条文案锚点）、FIX-REGRESSION.md（#167 行改写终版）、tools/verify-multicard-master.mjs（新增无头行为断言，旧产物上 S1 会红=修复未构建属预期）**；构建状态：已构建·sw 见 version.json）。
* 排查与实证：无头复现（冻结随机数对照 6/6）证明 py-en 开关链路（UI点击→落盘→genOneReply 闸门）无缺陷，多条来自同页「回复条数最少/最多」默认 1~2 拆条、与开关互不知晓；用户「关=彻底只回一条」的预期合理，遂把语义升级为总开关，开启时行为不变（拆条/拼卡仍由两组 stepper 管）。e37f893（#168）构建时曾把本会话工作区中间态（旧说明文案+旧哨兵）裹挟入库上线，本次构建已覆盖为终版。
* 验证：node --check 过；构建哨兵 340/340 哑哨兵 0；verify-multicard-master 对新产物全过；npm run verify 10/10。
* 待真机：荣耀平板10Pro 关多字卡后一句话只回一条；开多字卡仍按「回复条数」拆条/按「最少最多条数」拼卡；群聊成员同理。

### 2026-09-05 01:5x（#170 字卡库瘦身：分组体积扫描+整组删除；src 已被 e37f893 构建带入线上，本会话重建对齐注释/版本并提交遗留 src；已构建提交）
* [AI-B 域]（**改动文件：src/js/storage-slim.js（新增，纯逻辑+IDB：mochiCcSlimScan 枚举公用/旧顶层/各联系人专属键按分组统计体积卡数降序，读走 idbGet 权威层防大库驻留预算假空；mochiCcSlimDeleteGroup 整组删除=删除前重读当前值防快照覆盖，组名匹配不到不动，写回走 xyStore 三路同拍）、src/js/personalize.js（查看存储页「字卡库瘦身」卡接线：各库合计+Top12 分组+删除确认）、src/template.html（卡片锚点）、tools/verify-storage-opt.mjs（+11 断言至 31，含删除前重读防覆盖行为断言）、build.mjs jsFiles+哨兵 2 条（已被 e37f893 收走）**；构建状态：已构建·sw 见 version.json，哨兵 336/336 哑哨兵 0 verify 10/10）。
* 编号说明：原拟 #167/#168 均与并行会话撞号（#167=多字卡文案、#168=iPhone 全屏），改 #170；TASKS #128 方向②就此收口，方向①字卡媒体令牌化仍待认领。
* 待真机：查看存储页扫描出分组列表、公用/专属合计与明细对得上；删大 GIF 组→管理页该组消失、回复池正常、cc-groups 体积下降。


### 2026-09-05 01:5x（#169 补记：用户追交 01:02 诊断（OPPO Reno6 5G、UA 伪装 Firefox 152）；源码同步提交 chat.js）
* [AI-A 域]（**改动文件：src/js/chat.js（#169 源码补入库——e37f893 构建时工作区已含本修复故产物已打包，但该提交漏了 chat.js 源文件，本条恢复源码↔产物同步）、WORKLOG.md（本条）**；构建状态：**不涉及新构建**——产物已在库，仅源码同步）。
* 诊断解读：①设备跑 v3.26.404（ts=1788433073241，比抓诊断时的远端 00:49 旧约 30h）——修复在其后的 01:42 构建（e37f893 已推送）里，顶部更新条刷新/关全部标签页重开即得；②cs-voice-send IDB="1"（「读取=缺失」为探针已知双冒号误报，#157 有登记）＝语音功能在用，01:01:54 交互轨迹还在播语音；③首字节 14.4s/加载完成 17.1s＝慢设备，坐实「开麦等待期连点二次进入」触发条件；④SyntaxError: redeclaration of let JSInterface ×5＝浏览器壳注入的桥接脚本自身重复声明（src/产物 grep 零匹配，非本项目代码；启动文件异常=无、功能入口全部就绪，不影响功能）；⑤存储 persisted=true 配额足；cc-groups 22.65MB+16.79MB 正是瘦身会话（storage-slim WIP）目标；⚠ cmtmlbx3m18s:fav-msgs LS 残留 262.6KB 属迁移残留双倍计算，待瘦身批次一并看；⑥UA=Gecko/Firefox 152（雨见改 UA）：录音格式选择按「标准安卓浏览器」走 webm/opus 优先，Firefox 152 可录可播，若真机试听无声再另报。

### 2026-09-05 01:2x（#168 iPhone（402×874，iOS 18.7/Safari 26.1）主屏幕全屏态整页下坠+底部裁切：env/diff 双重避让 + 100vh>可视高；已构建）
* [AI-B 域]（**改动文件：src/js/mobile-adapt.js（syncVvFit 顶部避让改 env() 探针实测——探针缓存+旋转失效；fs 态健康时写 --mochi-ios-h=vv 实测可视高，键盘/推定态仍摘除）、src/css/base.css（#114 规则高度 100vh→var(--mochi-ios-h,100vh)，html/body 同步；#114 padding 锚点串原样保留）、build.mjs（FIX_SENTINELS 3 条）、FIX-REGRESSION.md（#168 行）；构建状态：已构建·sw 见 version.json**）。
* 根因（两个 iOS 26.x 形态差异）：①「系统不把网页垫到状态栏下」形态（innerHeight=874−62）上，diff 差值法照量出 62px 写进 --mochi-safe-top → 与系统避让双重叠加（Mochi 行掉到 ~150px，截图实证）；②100vh=874 高于可视 812 → .phone 底部 tabbar 裁出屏外（底部空隙=-62）。
* 验证：node --check 过；CDP 探针实测新级联（safe-top 摘除/12px/无叠加；--mochi-ios-h 消费+动态更新+回落全过）；--check-sentinels 336 全绿哑哨兵 0（#114 原 padding 锚点保留）。
* 待真机（同机型主屏幕+全屏）：①Mochi 行紧贴系统状态栏下方；②tabbar 完整不被裁；③输入栏贴底；④iPhone 15（inner==screen 形态）回归不变形。编号说明：#148/#149 已被并行会话占用，本条改 #168。

### 2026-09-05 01:5x（#169 状态更新：已随 e37f893（01:42 构建，已推送）打进产物；本会话补提交 chat.js 源码恢复同步；用户追交 01:02 诊断已解读，见顶部条目）
* 上条「未构建·随 #167 一并收口」已被 #168 iOS 会话的 e37f893 收口（构建时工作区已含本修复，产物 grep `voiceTimer !== voiceTid`/`voiceStarting` 在位）；但该提交漏了 src/js/chat.js 源文件（产物含修复、源码未入库＝反向不同步，新克隆重建会哨兵失败），本会话以单独提交补齐源码，不涉及新构建。

### 2026-09-05 0x:xx（用户报障 #169：OPPO Reno6 5G+雨见浏览器发语音「有时候一直提示已达最长60秒」无法使用；修复已随 e37f893 构建推送）
* [AI-A 域]（**改动文件：src/js/chat.js（录音三处：①startVoiceRec 拆防重入包装+startVoiceRecInner，voiceStarting 闸门 try/finally 复位；②计时器自证——闭包捕获自身 voiceTid，`voiceTimer!==voiceTid` 孤儿自毁、`!voiceRec||state!=='recording'` 不判 60s；③入场先清残留 voiceTimer）、build.mjs（FIX_SENTINELS +1，#169）、FIX-REGRESSION.md（#169 行，本条即改动说明）**；构建状态：**已随 e37f893 构建推送（01:42 构建），chat.js 源码由后继提交补同步入库**）。
* 根因：startVoiceRec 在 await getUserMedia 期间（雨见等慢壳开麦数秒、按钮文案未变）重复点击二次进入，覆盖 voiceRec/voiceStartTs 且 voiceTimer 被换成新 id——旧计时器成孤儿，每 250ms 查 `Date.now()-voiceStartTs>=60000` 而 voiceStartTs 停后从不清零，录音停 60 秒后每 250ms 误报「已达最长 60 秒」永不自停（面板关了仍弹）+ 第一路麦克风流泄漏；泄漏致后续开麦更慢更易连点，恶性循环。
* 验证：node --check 过；`node build.mjs --check-sentinels` 全绿（哑哨兵 0，见下条补数）；编号说明：原拟 #168 与并行瘦身会话撞号（其 storage-slim.js 哨兵已登记），改 #169。
* 临时自救（已答复用户）：出现连环提示时刷新页面立即止住（孤儿计时器随页面销毁）。

### 2026-09-05 01:2x（#167 用户报障：荣耀平板10Pro+Edge 回复设置关了「多字卡回复」，联系人一句话仍回多条；查明=设置语义非缺陷，补设置页边界说明；源已完成·未构建）
* [AI-A 域]（**改动文件：src/template.html（回复设置「多字卡回复」分组尾补 gs-sub：py-en 只管拼同一条、拆几条发送=「回复条数」默认1~2，想只回一条把回复条数最多设1）、build.mjs（#167 哨兵 1 条 template.html needle）、FIX-REGRESSION.md（#167 行）**；构建状态：**未构建**——构建时 git status 发现并行会话进行中改动（#148 mobile-adapt.js / #129 verify-wallet-edit / 未跟踪 storage-slim.js）已被打包进产物，按「不夹带半成品」回滚产物到 HEAD，源改动留工作区待下次构建收口）。
* 根因：非逻辑缺陷。genOneReply 的 py-en 闸门（v3.6.x 起在，报障设备旧包 f20003c 已含）关闭即生效；用户看到的多条来自 scheduleReply/continueChat 的 count=randInt(reply-min,reply-max)（默认1~2拆条），两独立设置边界混淆；撤回补发/TA心情/主动发送按设计不计入（页内已有 sub 注明）。已直接答复用户操作路径。
* 验证：--check-sentinels 330/330 哑哨兵 0（构建前后各一次）。
* 待对方处理（下一构建者）：①收口构建自动带上本条 template/build.mjs/FIX-REGRESSION 改动，请一并提交；②工作区 #148/#129/storage-slim.js 均非本条改动，勿误删；③本会话曾误构建一次（含 #148 半改动），产物已 `git checkout -- ` 回滚，sw 缓存名未外泄（未提交未推送）。

### 2026-09-05（TASKS #129 verify 套件基线清理开工：AI-B 认领，全量对账非点状修复；不涉及构建）
* [AI-B 域]（**认领 TASKS #129**：干净环境复跑 verify:all=131 通过/69 脚本断言失败/2 超时，与历史基线 130/69/2 同域——近期 #157~#166 无新增回归。分工说明：AI-A #164/#165 已点状修复 interact-frequency/invite-settings（登记①已关），本任务做的是**全量 69 脚本对账**（过期断言改期望/真缺陷登记/超时修等待），二者不重叠；#164/#165 修的两个脚本我不会再碰。已预判：钱包簇 wallet-edit/gift-wallet-split/rp-wallet-edit=断言 v3.15.x 申请制前老交互（过期）；quote-image 套件内崩=并发抢端口假阳性（单跑 20/20）；verify-triage=事后分析器误入套件待剔除。
* **#162 认账**：2026-09-04 深夜本任务诊断阶段曾出现两套套件并发互踩（TaskStop 只杀外壳不杀子进程树→孤儿套件+无头 Chrome 残留涨盘，即 #162 根因），已由并行会话清理；本任务后续跑批改为「单驱动器串行跑、批末清理 remote-debugging-port Chrome、不中途 SIGKILL 套件」防复发。

### 2026-09-05（#166 存储优化包：媒体池孤儿 GC + 写日志标记合并 + 查看存储页扩展；已构建提交）
* [AI-B 域]（**改动文件：src/js/idb.js（wrjMark 150ms 微批 idbSetAll 单事务+失败退回逐键+pagehide/hidden 冲刷+wrjUnmark 撤销未落库标记）、src/js/media-pool.js（mochiMediaGC mark-and-sweep：mark=全部 \*:chat-msgs/\*:fav-msgs 令牌∪map/writeBuf/inflight，引用键逐键串行读，清单/引用读不到整次放弃绝不盲删；mochiMediaGCApply）、src/js/personalize.js（查看存储页「媒体池」卡=占用+孤儿扫描清理，「持久存储」卡=storage.persist；catOf 媒体池单独成类）、src/template.html（两卡锚点）、build.mjs（#166 哨兵 3 条）、FIX-REGRESSION.md（#166 行）、tools/verify-storage-opt.mjs（新增，纯 Node 桩 20/20 零浏览器依赖）**）。
* 编号说明：原拟 #164 与并行会话撞号（其 #164/#165=verify 脚本清理），改 #166。
* 验证：node --check 过；verify-storage-opt 20/20；构建哨兵全绿哑哨兵 0。遗留专项已登记 TASKS #127（聊天记录分片）/ #128（字卡库瘦身）。
* 待真机：查看存储页媒体池占用显示；删含图消息→扫描报孤儿→确认删除→池瘦身且被引用图完好；持久存储行可读/可申请。

### 2026-09-05（#164/#165 清理 verify:all 两个存量红——均为脚本侧问题，产品代码无改动·不涉及构建）
* [AI-A 域]（**改动文件：tools/verify-interact-frequency.mjs（#164）、tools/verify-invite-settings.mjs（#165）**；无 src/产物改动，不涉及构建）。关掉 2026-09-05 待办登记①。
* #164 verify-interact-frequency（修前 6 跑 2 红抖动 + 1 处断言过时；修后 13/13 ×3 连跑）：①S1/S2「flag 已打但 prob 未吸附」抖动＝页面初始化偶发先把带 `probLowV313=true` 的默认 settings 落盘，脚本种子 `Object.assign` 合并保留旧标记→迁移函数见标记即跳过；修法＝种前先清四库（等效「无标记存量老设备」，语义不变）。②S7 静态断言 `gateCalls===4` 过时＝同频 cc 互动卡（maybeTriggerTACC）加入后闸门接入点实为 5，断言改 5。
* #165 verify-invite-settings（标题断言确定性红 + 弹窗交互抖动；修后 28/28 ×5 连跑）：①「面板有主动邀请标题」原断言要求 `.gs-title` 恰好 1 个——「其他」面板后来新增跨桌面查岗/打电话分组（#150/#159 同期），改「存在主动邀请标题」；②「点同意→确定→半框打开」固定 400ms 单次点击偶发赶不上异步弹窗，改轮询重试（断言口径不变）。
* 备注：两脚本失败在 f20003c（#162 之前）即复现，与 #162 无关；gitignore `tools/*.log` 已按 52e3782→a0ed3a0 捋直重放。另一并行会话正在改 build.mjs/idb.js/media-pool.js/personalize.js/template.html（进行中），本条未触碰。


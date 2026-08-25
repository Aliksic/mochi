# WORKLOG — 双方交接日志（AI-A / AI-B 共用）

两个 AI 不能直接对话，开工/完工时在这里各写一行，让对方打开仓库就知道当前状态。

## 规则

### 2026-08-25（用户反馈：「他在那边也偷了个懒」每日 3 次太少，摸鱼应全天都可能）
- [本会话·完成]（**已改 src，未构建未提交**）：仅 `src/js/p2-features.js`（AI-A 域）。
  - `fish-ta-note` 桌面浮字频率放宽：冷却 2h→**45 分钟**、每日上限 3→**12 次**、随机概率 0.25→**0.35**（用户选定"更密集"档）。注释同步。`node --check` 通过。
  - 真机确认点：白天使用时约每 2~3 小时能见一次摸鱼浮字，且分布全天；无连续刷屏。

### 2026-08-24（AI-A：花园梦角打理触发机制优化——冷却/概率/离线/去重/成就/逛园时长）
- [本会话·完成]（**已改 src，未构建未提交**）：`src/js/garden.js`（AI-A 域）。未碰其他文件。
  - **优化点1（冷却重置过激）**：`checkPartnerPassive` 未命中时不再 `lpc=now` 浪费整个 30 分钟窗口，改为推进到已检查 slot 边界 `lpc = last + slots*PI`，下次平均 15 分钟即再有机会。
  - **优化点2（acted=false 不消耗冷却）**：`partnerAct` 末尾 `lpc` 重置/save/render 改为仅 `acted=true` 时执行；"尝试但没动作"不再算打理过。
  - **优化点4（冷启动保底）**：首次 `lpc=0` 不再直接 return 等 30 分钟，改为立刻 `partnerAct(true)` 保底一次；未成功则 `lpc=now-PI` 让下次立刻再有机会。
  - **优化点5（离线收益解封）**：slots 上限 8→24（覆盖 12 小时离线），每 slot 概率 0.35→0.4，加总动作软上限 16 防卡顿；长期离线梦角打理更充分。
  - **优化点6（概率分支跳层）**：`partnerAct` 改为先按 r 选 actType 再判条件，不满足走 patrol 兜底（acted=false），消除"1 朵花时施肥概率被放大"等状态漂移；harvestall 条件 >1 改 >0。
  - **优化点7（动作去重）**：`partnerAct(silent, used)` 加 used 参数，`pick()` 优先选未操作过的格子；`checkPartnerPassive` 循环传 used 集合。
  - **优化点8（成就门槛）**：`partnerCare` "同育之情" 10→30 次，与浇水 50/收获 50 档位匹配。
  - **优化点10（事件接线）**：`garden-enter`/`garden-leave` 监听记 `_enterTs` + 累加 `gardenTime`；年报新增"逛花园时长"行。
  - **优化点11（省 parse）**：`checkPartnerPassive` 入口用内存 `data.lpc` 预判冷却，冷却内直接 return 不 `load()`/JSON.parse。
  - 验证：`node --check` 通过。未构建（等 AI-B 统一 build）。真机确认点：梦角打理更活跃（离线 12h 回来约 10 次打理）；新用户首次进花园即见 TA 动作；花园年报显示逛花园时长。

### 2026-08-24（用户要求：番茄钟陪伴模式的聊天要独立窗口，不显示/不写普通聊天记录）
- [本会话·完成]（**已改 src + 已构建（22:19, sw: mochi-mt7bodyk），verify-pomodoro-companion 重写后 26/26 + verify-pomodoro 20/20 + 布局 verify 10/10，未提交**）：`src/js/p2-features.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物 + `tools/verify-pomodoro-companion.mjs`（重写适配新行为）。
  - **新形态**：新增独立全屏页 `#page-pmp-chat`「陪伴专注」（chat-head 返回 + 复用 .pmp-bar 倒计时条(暂停/⋯菜单) + .pmp-c-list 消息列表 + .pmp-c-inputbar 输入栏）。陪伴期间所有对话只进此窗：开场白/每5~8分钟鼓励/完成祝贺/提前结束回应全部改走 `pmpCAdd()`，**不再调 chatAddIn、不进普通聊天记录**；入口按钮与「已在陪伴中」再点击都 openPage 到专属窗（不再 enterChat）。
  - **窗内收发**：用户可发消息（Enter/发送按钮，maxlength120），TA 轻量回应（700~1500ms 延迟+震动30ms；关键词感知：累/难/烦→安慰池，完成/好了→祝贺池，其余→陪伴池）。记录存 `pomo-companion-log`（curStore 按联系人隔离，cap 300 条，跨会话保留可回看）。
  - **保留**：普通聊天页顶部倒计时状态条不动（仅状态显示无聊天内容，暂停/⋯菜单共用 pmpToggleRun/pmpQuitAsk）；切联系人自动退出并关窗；刷新接续/关闭期补记逻辑不变但消息改进窗。
  - **回归脚本重写**（26 项）：A 独立窗进入+开场白隔离 / B 窗内收发+暂停继续+菜单+提前结束 / C 完成跳变（祝贺只进窗记录、普通聊天无🍅）/ D 补记进窗 / E 普通聊天页状态条接续+旧入口可用。全程断言 getChatMsgs 不含陪伴消息。
  - ⚠️ **构建时工作区有对方未提交改动（memo/bg-keep/chat/feed/mail/group-chat/default-cards/memo.css 等 19 文件），构建产物已一并包含——提交前请确认各方已保存完整并重新 build 收口**。
  - ⚠️ 真机需确认（vivo Edge）：①专属窗输入框被 mobile-adapt 转 contenteditable 后发送正常 ②键盘弹出时窗内布局（list flex 收缩、输入栏贴底）③深色模式下气泡/输入栏配色。

### 2026-08-24（用户反馈：手机浏览器切后台再回前台，系统通知栏弹出几分钟前已在聊天页看过的旧消息）
- [本会话·完成]（**已改 src + 已构建（22:17, sw: mochi-mt7blwyb）+ 新专项 verify-bg-notify-dedupe 10/10 + 布局 verify 10/10，未提交**）：`src/js/bg-keep.js`（AI-B 域，本文件当时无人占用）+ 构建产物 + `tools/verify-bg-notify-dedupe.mjs`（新专项）。未碰 chat.js/template/CSS。
  - **根因（bgNotifyCheck 无内容记忆）**：后台通知只判断「页面是否隐藏」，切后台后保活定时器继续跑——回复链剩余部分/下一轮主动发送/查岗卡等一旦产出与刚才对话相同或延续的内容，就原样再发一条系统通知（用户视角：刚看过的消息又弹一遍）。
  - **修复（bg-keep.js bgNotifyCheck 前置两道闸门）**：① 隐藏时长门槛——`lastVisibleAt` 起算，切后台头 **15 秒内**不发系统通知（切换过渡期定时器到点的消息用户马上能看见）；② 内容去重——文本归一化指纹（剥 dataURL/语音 `|||` 段/SVG 标签、去空白取前 60 字），与【最近 30 分钟聊天记录里 TA 已说过的内容】或【最近 10 分钟已发过的通知】相同 → 不再重弹。消息本体照常进聊天记录与角标，只是不再重复弹系统通知。
  - **只读探针**：`window.bgNotifyGateInfo(text)` 返回 `{hiddenForMs, tooFreshHidden, dupNotified, dupInChat}`（诊断哪道闸门会拦）。
  - 验证：verify-bg-notify-dedupe.mjs 10/10（探针结构/闸门②命中/30 分钟窗外不误伤/可见态过渡期判定/带图带语音归一化同指纹/接线完好无异常）+ 布局 verify 10/10。真机确认点：刚聊完切后台几分钟再回来，通知栏不再出现刚才聊过的同款内容；后台较久（>15s）收到全新消息仍正常弹通知。
  - ⚠️ **构建扫入提示**：22:17 构建时工作区新增了另一批 memo 相关已保存改动（`src/css/memo.css`、`src/css/chat-pages.css`、`src/js/p2-features.js`、`memo-shot-*.jpg`、`tools/shot-memo.mjs`、`tools/verify-memo.mjs`），该批次尚未在 WORKLOG 登记——若该会话还未完成，完成后请重新 build；本会话构建前已跑布局 verify 10/10 与 memo-app/p2-features 的 node --check 均通过。

### 2026-08-24（用户反馈：17promax——加了公用/专属自定义字卡后，联系人发朋友圈只用自定义字卡，不再用系统默认字卡）
- [本会话·完成]（**已改 src + 已构建（21:47, sw: mochi-mt7aji26）+ 新专项 verify-feed-mail-pool 7/7 + 回归 verify-gc-pool-scope 10/10 + 布局 verify 10/10，未提交**）：`src/js/feed.js` + `src/js/mail.js`（均 AI-A 域）+ 构建产物 + `tools/verify-feed-mail-pool.mjs`（新专项）。未碰 template.html/CSS。
  - **根因（feed.js cardPool 补池门）**：默认主字卡补池条件是 `catOn('main') && !text.length`——自定义（公用+专属）字卡非空后 `text` 永远非空 → 4621 张默认字卡从此不参与 TA 动态/评论。与单聊 getPool v3.6.x 修过的「三类任一为空才补」同款问题（chat.js 注释有前车之鉴），朋友圈一直没跟上。
  - **修复（feed.js cardPool，三处对齐聊天页语义）**：① main **开启即始终混入**（去掉 !text.length 门）；② 开关按【该联系人桌面】读——`defaultCardApiFor(storeFor(cid))`（复用上一轮 default-cards.js 暴露的 API），某联系人桌面关「朋友圈使用」→ 只有这个联系人的动态/评论不用默认字卡；③ 补上此前漏掉的单卡开关（dc-off-*）过滤与 dc-enabled 总开关检查。kaomoji/emoji 保持「空才补」与聊天一致。
  - **顺手对齐（mail.js，同族开关归属问题）**：信箱混入机制本就正确（独立子池按概率混入），但 pushDefault/pickDefaultMailCard 读的是当前桌面开关——改按 `storeFor(cid)` 桌面读 use('mail')/cat/isOff/enabled/overall/probs；pickDefaultMailCard 加 cid 参数（唯一调用点 taLetterContent 已传）。
  - **只读探针**：`window.feedPoolFor/feedPoolHas(cid,…)`、`window.mailPoolFor(cid)`（素材池摘要/含卡判断，供回归与诊断）。
  - 验证：verify-feed-mail-pool.mjs 7/7（F1 自定义非空时池仍含 4623 条 / F2 三来源并存 / F3 关「朋友圈使用」联系人退出默认池且不误伤自定义 / F5 dc-enabled 按桌面 / M1-M2 信箱默认子池装载与按桌面清空）；回归 verify-gc-pool-scope 10/10 + 布局 verify 10/10。真机确认点：加了自定义字卡的设备上联系人朋友圈动态/评论重新出现系统默认话术；关闭某联系人桌面「朋友圈使用」后仅该联系人不混入。
  - ⚠️ 本会话与前一会话（群聊三来源）同仓同分支连续施工、改动均在工作区未提交；提交时建议合并为一个 commit（v3.12.x：字卡来源口径统一——聊天/群聊/朋友圈/信箱 = 公用+专属+默认，默认字卡开关按联系人桌面对应联系人生效）。

### 2026-08-24（用户要求：群聊联系人字卡来源捋顺——公用+专属+默认三来源；默认字卡页加小字说明）
- [本会话·完成]（**已改 src + 已构建（21:31, sw: mochi-mt79yax4）+ 新专项 verify-gc-pool-scope 10/10 + 布局 verify 10/10，未提交**）：`src/js/group-chat.js`（本会话认领）+ `src/js/default-cards.js`（均 AI-A 域）+ 构建产物 + `tools/verify-gc-pool-scope.mjs`（新专项）。未碰 template.html/CSS。
  - **用户口径**：群聊成员回复池 =【自定义聊天字卡·公用】+【该成员桌面专属】+【系统默认聊天字卡】；某成员桌面关闭【聊天使用】→ 聊天和群聊里这个成员都不再使用默认字卡（开关按桌面独立生效，需在默认字卡页小字说明）。
  - **①存量 bug（group-chat.js gcPool/gcPokeText）**：旧代码按 `{key:{cards:[{type,text}]}}` 解析 `cc-groups`，与实际存储 `{类型:[[分组,[卡]]]}` 结构不符——文字/emoji/颜文字的**专属字卡从未真正进过群聊回复池**（静默失效多年）；拍一拍同病。修复：改走 chatcard For 系列合并视图——`getCustomCardsFor(cid)`（公用+专属扁平，过滤 data:/|||/拍一拍后按正则分桶，emoji 判定对齐 chat.js 双正则）+ `getPokeCardsFor(cid)`（排除拍一拍进普通池）；媒体类 `getMediaCardsFor` 原本已合并不动。
  - **②默认字卡按成员桌面读取**：gcPool 兜底/gcPokeText 原读当前桌面开关（在 A 页面开群聊，B/C 成员跟着 A 的开关走）。新增 `default-cards.js` 开关读取 store 参数化：`window.defaultCardApiFor(st)`（enabled/use/cat/isOff/cfg）+ `window.getDefaultCardsFor(st)`（完整抽取逻辑复用 drawCards）；group-chat 用 `storeFor(cid)` 传入 → 每个成员按自己桌面的 总开关/【聊天使用】/分类/单卡开关/概率 生效。main 兜底门对齐单聊 getPool（开启即始终混入，颜文字/emoji 分类空才补，去掉旧的三类任一空整体门）。fallback 路径保留旧全局 API（a 为 null 时）。
  - **③默认字卡页小字说明（default-cards.js JS 注入，未动 template.html）**：场景开关组下方注入 `#dc-scope-note`：「以上开关按当前桌面对应的联系人独立保存：当当前桌面联系人关闭【聊天使用】，聊天和群聊里这个联系人也无法使用默认字卡（其他联系人不受影响）。」
  - **④文案同步**：群聊设置底部说明改为「成员回复内容来自：公用字卡 + 该成员桌面专属字卡 + 系统默认字卡；某成员桌面关闭【聊天使用】，聊天和群聊里这个成员都不再使用系统默认字卡。」
  - **⑤只读探针**：`window.groupChatPoolFor(cid)` 返回成员当前池数据副本（供回归测试与作用域问题诊断，此类问题已反复出现）。
  - 验证：verify-gc-pool-scope.mjs 10/10（T1 公用文字进池 / T2 专属隔离+旧结构 bug 回归 / T3 开关桌面含默认卡 / T4 关【聊天使用】成员池无默认卡 / T5 不误伤自定义 / T6 dc-enabled 按桌面 / T7 公用拍一拍合并 / T8 小字说明在页 / T9 探针安全）+ 布局 verify 10/10。真机确认点：群聊里各成员回复能用到自己桌面的自定义文字字卡；关闭某联系人桌面的【聊天使用】后，该成员在单聊+群聊都不再说系统预设话术，其他成员照常。
  - ⚠️ 本次构建（21:31）同时收口了 WORKLOG 上条遗留警告（bg-keep.js / mail.js 20:55 未入产物的问题已随本次 build 扫入）。工作区此前无其他未提交 src 改动（git status 仅本会话文件），提交前无需再 build。

### 2026-08-24（AI-A 留话给 AI-B：切联系人桌面淡入过渡——方案已与用户对齐，请 AI-B 执行）
- [AI-A·请求 AI-B 执行]（**未构建未提交，等 AI-B 改 personalize.js + home.css 后统一 build**）：`src/js/personalize.js` + `src/css/home.css`（均 AI-B 域）。AI-A 本会话不动任何 src 文件。
  - **需求**：`personalize.js:2138` `document.addEventListener('contact-switched', buildDeskPages)` 切联系人时整个桌面重建无过渡动画，体验生硬。加一个 240ms 淡入+微上移过渡。用户已审过方案确认要做。
  - **改法**（已与用户对齐，AI-B 照此执行即可）：
    1. `home.css` 加 keyframes + 类（放桌面样式区，约 `:220` 附近）：
       ```css
       .desk-fade-in { animation: deskFadeIn 240ms ease-out; }
       @keyframes deskFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
       ```
    2. `personalize.js:2138` 的 contact-switched 监听从直接传函数引用改为包装函数（重建后触发淡入）：
       ```js
       // 原：document.addEventListener('contact-switched', buildDeskPages);
       // 改为：
       document.addEventListener('contact-switched', () => {
         buildDeskPages();
         const dp = document.getElementById('desktop-pages');
         if (!dp) return;
         dp.classList.remove('desk-fade-in');
         void dp.offsetWidth; // 强制 reflow 重启动画
         dp.classList.add('desk-fade-in');
       });
       ```
  - **要点**：① 只在 `contact-switched` 时播淡入，`mochi-restore-done` 的 `rebuildDeskWhenReady`（`:2143`）不动——开屏数据就绪重建不播动画避免开屏闪烁；② `translateY(6px)` 是位移不是缩放，不违反 AGENTS.md「禁止整页 zoom/transform:scale」红线；③ transform 加在 `#desktop-pages` scroll 容器上，不影响子元素 scroll-snap；④ 240ms 短，频繁切联系人也不烦；⑤ `void dp.offsetWidth` 强制 reflow 确保连续切联系人时动画重新触发（否则 class 已在不会重播）；⑥ animationend 不需移除类，下次切联系人会先 remove 再 add。
  - **风险已评估**：① buildDeskPages 主体同步，淡入在返回后立即触发，主体已重建完；② transform 不影响子元素 fixed/absolute 定位（桌面组件都是 static/relative）；③ opacity 0→1 240ms 内可接受，不会让用户觉得卡。
  - **验证**：`node --check` + `npm run build` + `npm run verify`（布局 10/10）。真机确认：切联系人时桌面有淡入+微上移过渡；连续快速切两个联系人都触发动画；开屏首次加载不播动画（restore-done 路径不动）。
  - ⚠️ AI-A 侧无配合改动需求。AI-B 改完保存后按 AGENTS.md 构建者协议统一 build。本条任务完成后请 AI-B 在本行末尾追加「✅ 已完成」并补 build/verify 结果。

### 2026-08-24（AI-A 留话给 AI-B：图标徽章统一接口 setDeskBadge + 颜色设置工厂函数重构——方案已与用户对齐，请 AI-B 执行）
- [AI-A·请求 AI-B 执行 + AI-A 侧已改完]（**未构建未提交，等 AI-B 改 personalize.js 后统一 build**）：AI-A 侧 `src/js/chat.js` + `src/js/mail.js` + `src/js/feed.js` 已加 `window.setDeskBadge` 守卫（`node --check` 三文件通过）；AI-B 侧 `src/js/personalize.js` 待改。
  - **方案 6：图标徽章统一接口**（AI-B 侧）
    - **需求**：当前只有 chat/mail/feed 三个图标有 `app-badge` DOM（`template.html:150,162,166` 写死），其他图标（日历/纪念/占卜/收藏/音乐/统计…）想挂未读数没地方挂。抽统一接口 `window.setDeskBadge(appName, count)`，任何图标都能显示未读角标。
    - **AI-A 侧已改完**（向后兼容，AI-B 未加接口前行为完全不变）：
      - `chat.js:1786` `updateChatBadge()` — 加 `if (window.setDeskBadge) { window.setDeskBadge('chat', n); return; }` 守卫
      - `mail.js:108` `updateBadge()` — 加 `if (!badge && !window.setDeskBadge) return;` + try 内 `if (window.setDeskBadge) { window.setDeskBadge('mail', unread); return; }`
      - `feed.js:1110` `renderNoticeBadge()` 的 feed-app-badge 部分 — 加 `if (window.setDeskBadge) { window.setDeskBadge('feed', appN); } else { ...原逻辑... }`
    - **AI-B 侧待改**（`personalize.js`，加 setDeskBadge 接口实现，建议放在 `:887` 颜色设置代码之前、启动早期）：
      ```js
      window.setDeskBadge = function (appName, count) {
        const app = document.querySelector('.app[data-app="' + appName + '"]');
        if (!app) return;
        let box = app.querySelector('.app-badge-box');
        if (!box) {
          const ico = app.querySelector('.app-ico');
          if (!ico) return;
          box = document.createElement('div'); box.className = 'app-badge-box';
          ico.parentNode.insertBefore(box, ico); box.appendChild(ico);
        }
        let badge = box.querySelector('.app-badge');
        if (!badge) {
          badge = document.createElement('span'); badge.className = 'app-badge';
          box.appendChild(badge);
        }
        if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.hidden = false; }
        else badge.hidden = true;
      };
      ```
    - **要点**：① 接口自动给无 `app-badge-box` 的图标补 DOM，`template.html` 不用改（chat/mail/feed 已有 box 会被复用，不重复创建）；② 现有 `chat-badge`/`mail-badge`/`feed-app-badge` 的 id 仍保留（接口不删 id），其他模块直接 `getElementById` 的地方不受影响；③ `home.css:185` `.app-badge-box{position:relative}` 已就绪，接口给图标补 box 时把 `.app-ico` 包一层 div，样式不破；④ 接口要在 chat.js `updateChatBadge` 首次调用前定义，放启动早期即可。
    - **验证**：AI-B 加完接口后 `npm run build` + `npm run verify`。真机确认：聊天/信箱/朋友圈未读数仍正常显示；其他图标可由 AI-A 后续调 `setDeskBadge('calendar', 1)` 等挂角标。
  - **方案 10：颜色设置工厂函数重构**（AI-B 侧，纯重构不改功能）
    - **需求**：`personalize.js:887-1184` 五套颜色设置代码（widget-bg/border/btn/btn-text/heart）结构高度相似（每套 ~62 行：取 row/val → apply 函数 → 读 saved → syncUI → 绑 click → openModal 色板 → 保存），是复制粘贴五遍。抽成工厂函数 `createColorRow(opts)`，五套都调它，省 ~223 行。第六套透明度（`:1186-1223`）逻辑不同（百分比 + 输入框），保留独立不强行套工厂。
    - **改法**：在 `:887` 前定义工厂：
      ```js
      function createColorRow(o) {
        const row = document.getElementById(o.rowId);
        const val = document.getElementById(o.valId);
        const apply = (color) => {
          document.documentElement.style.setProperty(o.varName, color);
          if (val) val.textContent = color === o.defaultColor ? o.defaultLabel : '';
        };
        const saved = store.get(o.storeKey);
        if (saved) apply(saved);
        if (!row) return;
        const syncUI = () => {
          const c = store.get(o.storeKey) || o.defaultColor;
          if (val) val.textContent = c === o.defaultColor ? o.defaultLabel : '';
        };
        syncUI();
        row.addEventListener('click', () => {
          if (!window.openModal) return;
          const current = store.get(o.storeKey) || o.defaultColor;
          window.openModal(o.title, '', (v) => {
            const color = (typeof v === 'number' && o.swatches[v]) ? o.swatches[v].color : v;
            if (!color) return;
            if (color === '__reset__') { store.remove(o.storeKey); apply(o.defaultColor); syncUI(); return; }
            store.set(o.storeKey, color); apply(color); syncUI();
          }, { colorPicker: true, noInput: true, color: current, swatches: o.swatches, pills: [{ label: '恢复默认', value: '__reset__' }] });
        });
      }
      ```
      然后 `:887-1184` 五套替换为五次调用（色板数组原样搬进 opts.swatches，不改色值）：
      ```js
      createColorRow({ rowId: 'row-widget-color', valId: 'widget-color-val', varName: '--widget-bg', storeKey: 'widget-bg-color', defaultColor: '#ffffff', defaultLabel: '默认白', title: '小组件颜色', swatches: [/* 原 20 色，原样搬来 */] });
      createColorRow({ rowId: 'row-widget-border', valId: 'widget-border-val', varName: '--widget-border', storeKey: 'widget-border-color', defaultColor: 'rgba(0,0,0,.1)', defaultLabel: '默认', title: '小组件边框颜色', swatches: [/* 原 16 色 */] });
      createColorRow({ rowId: 'row-widget-btn', valId: 'widget-btn-val', varName: '--widget-btn', storeKey: 'widget-btn-color', defaultColor: '#111111', defaultLabel: '默认黑', title: '按钮颜色', swatches: [/* 原 16 色 */] });
      createColorRow({ rowId: 'row-widget-btn-text', valId: 'widget-btn-text-val', varName: '--widget-btn-text', storeKey: 'widget-btn-text-color', defaultColor: '#ffffff', defaultLabel: '默认白', title: '按钮文字颜色', swatches: [/* 原 16 色 */] });
      createColorRow({ rowId: 'row-widget-heart', valId: 'widget-heart-val', varName: '--widget-heart', storeKey: 'widget-heart-color', defaultColor: '#111111', defaultLabel: '默认黑', title: '爱心外框颜色', swatches: [/* 原 16 色 */] });
      ```
    - **要点**：① 纯重构，行为完全等价（每套的 apply/syncUI/openModal 逻辑都与原代码逐行对齐）；② 色板数组原样搬进调用，不改色值；③ 透明度（`:1186-1223`）不动；④ 重构后 `:887-1184` 从 ~298 行 → ~30 行（工厂）+ ~5×9 行（调用）= ~75 行，省 ~223 行。
    - **验证**：`node --check` + `npm run build` + `npm run verify`。真机确认：五个颜色设置行点击都弹色板、选色实时生效、恢复默认可用、刷新后保持。
  - ⚠️ AI-A 侧 chat.js/mail.js/feed.js 改动已保存未构建（加 setDeskBadge 守卫，向后兼容，当前构建行为不变）。AI-B 改完 personalize.js 后统一 build，AI-A 侧改动会自动扫入。本条任务完成后请 AI-B 在本行末尾追加「✅ 已完成」并补 build/verify 结果。

### 2026-08-24（AI-A 留话给 AI-B：桌面翻页平滑过渡——方案已与用户对齐，请 AI-B 执行）
- [AI-A·请求 AI-B 执行]（**未构建未提交，等 AI-B 改 desktop-slider.js 后统一 build**）：`src/js/desktop-slider.js`（AI-B 域）。AI-A 本会话不动任何 src 文件。
  - **需求**：圆点点击切换桌面页目前是瞬移（`go()` 在 `:29` 直接赋 `pages.scrollLeft`），改为平滑过渡。用户已审过完整方案确认要做。
  - **改法**（已与用户对齐，AI-B 照此执行即可）：
    1. 在 `desktop-slider.js:23` 的 `go()` 函数前拆出 `setScrollLeft(i, smooth)`：
       ```js
       function setScrollLeft(i, smooth) {
         const left = i * pageStep();
         if (smooth && pages.scrollTo) {
           try { pages.scrollTo({ left: left, behavior: 'smooth' }); return; }
           catch (e) {}
         }
         pages.scrollLeft = left;
       }
       ```
    2. `go()` 加 `smooth` 形参，内部 `pages.scrollLeft = idx * pageStep()`（`:29`）改为 `setScrollLeft(idx, smooth)`：
       ```js
       function go(i, smooth) {
         const slides = getSlides();
         idx = Math.max(0, Math.min(slides.length - 1, i));
         if (!pages.clientWidth) return;
         setScrollLeft(idx, smooth);
         getDots().forEach((d, k) => d.classList.toggle('active', k === idx));
       }
       ```
    3. 调用点改动（共 4 处）：
       - `:55` 圆点点击 `go(getDots().indexOf(dot))` → `go(getDots().indexOf(dot), true)`（**唯一传 true 的地方**，平滑过渡）
       - `:60` resize 校正、`:69` MutationObserver 返回桌面校正、`:91` deskRebuild 重建校正——**保持瞬切**（不传 smooth），避免返回桌面/旋转/重建时还播一段动画干扰
       - `:99` `window.deskGo = go` 暴露给拖拽跨页翻页保持瞬切（拖到边缘自动翻页用平滑会和 pointermove 拖拽手感冲突）
  - **风险已评估**（AI-A 已分析，AI-B 可直接采信）：① smooth 期间再点圆点，浏览器平滑过渡到新位置不卡；② smooth 期间 scroll 事件持续触发，`sync()` 防抖 120ms 后算出 `cur===idx` 不重复设圆点；③ 不支持 `scrollTo` 的老浏览器走 fallback 瞬切，无回退风险。注释里"避免 smooth 被 snap 打断"是误解——`scrollTo({behavior:'smooth'})` 程序触发的平滑滚动不会被 scroll-snap 打断（snap 只在手势惯性后吸附），Chrome/Safari/iOS 13+ 都支持。
  - **验证要求**：改后 `node --check src/js/desktop-slider.js` + `npm run build` + `npm run verify`（布局 10/10）。纯体验改动，现有 verify 覆盖桌面翻页结构，无新专项回归需要。真机确认点：圆点点击有平滑过渡；翻页中再点另一个圆点不卡；切到聊天页再回桌面不播动画（瞬切校正）；旋转屏幕不播动画。
  - ⚠️ AI-A 侧无配合改动需求。AI-B 改完保存后按 AGENTS.md 构建者协议统一 build。本条任务完成后请 AI-B 在本行末尾追加「✅ 已完成」并补 build/verify 结果。

### 2026-08-24（用户反馈：小米15 Pro Chrome 六项——贪吃蛇胜负/Pong 侧位/记账分类/朋友圈回复提醒+图片详情/默认字卡滑动/全屏失效）
- [本会话·完成]（**已改 src + 已构建（20:44, sw: mochi-mt78aon5）+ 新专项 verify-bugfix-six 21/21，未提交**）：`src/js/snake-game.js` + `src/js/pong.js` + `src/js/accounting.js` + `src/js/feed.js` + `src/js/fullscreen.js`（AI-B 域，跨域改动请知悉）+ `src/css/chat-pages.css` + `src/template.html` + 构建产物 + `tools/verify-bugfix-six.mjs`（新专项）。回归：布局 verify 10/10 + snake-smooth 11/11 + snake-features 8/8 + feed-comment-merge 10/10 + feed-comment-perf 18/18。
  - **①贪吃蛇胜负（snake-game.js endGame）**：原按存活判定（先死者即输），与面板展示的分数矛盾（"我分数高却显示他赢"；撞到一起也常判一边赢）。改为**按最终得分判定**——分高者胜、同分平局；存活结果仅用于触发结束。TA 回应池映射（chat.js sendSnakeResult）不受影响。
  - **②Pong 侧位（pong.js + template.html）**：代码里玩家实际控制**右侧**挡板，但开局提示写「你控制左侧挡板」、比分显示「你 X : Y TA」（左位是你）全部与实现相反。改为「你控制右侧挡板」+ 比分/结算面板统一 **TA x : y 你**（与球场左右对应）；底部提示改「手机：按住画面上下拖动」（触摸本就全画面有效，原文案「左半边」误导）。聊天系统消息文本保持「你 X : Y TA」不变（纯文字无方位语义）。
  - **③记账无法加分类（accounting.js manageCats）**：根因=WORKLOG 存钱罐同款坑——openModal 点确定后统一 close()，ok 回调里同步开的二级弹窗被立即关掉（一闪而过）。两个二级弹窗（添加/删除分类）照先例 setTimeout(60) 延迟开启。verify 实测：分类管理→添加支出分类→输入→确定，「宠物」写入 LS 且 toast 正确（含安卓 ce-box 转换路径）。
  - **④朋友圈评论回复（feed.js + chat-pages.css）**：
    - 无提醒根因：TA 评论回应只在 `(p2.role||p2.by)==='me'`（自己的动态）时 addNotice——评论**联系人的动态**后 TA 回你完全无通知。改为两种情况都通知：我的动态→「评论了你的动态：预览」；TA 的动态→「回复了你的评论：预览」。
    - 看不到详情根因：通知文字里 dataURL 被 noticeTextClean 清成「[表情包]」占位符，且点击只滚到整条动态。改进三件套：①addNotice 增加 loc={ci,ri} 定位，点击通知直接滚动闪烁到**具体那条评论/回复**（commentsHtmlFor 回复节点补 data-ri 锚点）；②通知列表对含图评论/回复**实时从动态数据取首图渲染缩略图**（.fn-thumb，不落盘防撑大存储键，点缩略图看大图）；③回复回应路径同样带定位。
  - **⑤默认字卡下滑卡住（chat-pages.css）**：前两轮修复叠加出双嵌套滚动容器——`.page` 整页滚动 + `#dc-list` 内部滚动（min-height:40vh 撑出页面级溢出）且带 `overscroll-behavior:contain` 阻断滚动链：手指在列表上内层到边界后外层永远接不上=卡住。改为**单滚动容器**：只有 .page 一层滚到底，`#dc-list` flex:0 0 auto + overflow:visible（选择器 `#page-default-cards #dc-list` 压过 `.card-list` 基础规则）。main 分类 DOM 两版本本就全量渲染，无虚拟列表回退风险。
  - **⑥全屏每次进入失效（fullscreen.js）**：旧 handleFsExit 在浏览器标签态同步判定「非切后台退出=用户主动退出」清 FS_KEY，但部分机型（小米 Chrome 方向）切后台时 fullscreenchange(exit) 早于 visibilitychange(hidden)，或退出事件推迟到回前台才补发——两种时序都误清持久化意图→下次进入永不恢复，只能手动重开。修复：①清除决策延迟 700ms 复核（复核时已转后台/_wentBg→保留；fs-css-active 在→横屏兜底自有状态不动；刚回前台 1.5s 内到达的 exit→后台期发生的系统退出，保留并立即尝试恢复；其余才算用户主动退出）；②手势重试监听（armRetry）改捕获阶段，防面板 stopPropagation 吞掉首次触摸；③开关开启后的失败回滚复核 900→1500ms（低端机全屏完成慢被误回滚）。真机预期：小米 Chrome 开全屏后切后台再回来，首次触摸即自动恢复全屏，无需关开开关。
  - 附带：`tools/smoke-accounting.mjs` 首条断言读了过时键名（xy-home-v2:desk-page-count，实际 xy-home-v2:default:desk-page-count）恒 FAIL——已修正键名，31/31 全绿（功能本就正常）。
  - ⚠️ 构建**已包含同时段拍一拍/表情包三分区会话的完整改动**（chatcard.js/chat.js/chat-main.css/template.html，对方 WORKLOG 有记录、20:32 前保存完）+ 此前 gift-shop/p2-features/period/personalize 未提交改动，提交时一并走。
  - ⚠️ **20:55 检测到 bg-keep.js / mail.js 在本会话构建（20:44）之后又被另一并发会话保存**——当前产物不含这两个文件的改动，**提交前请构建者重新 `node build.mjs` 收口**。
  - ⚠️ 真机确认（小米15 Pro Chrome）：①贪吃蛇打到分数高于 TA 后故意撞墙，应判「你赢了」；同分同死应「平局」②Pong 开局面板/比分/底部文案均为右侧挡板口径③记账 ⚙→添加收入/支出分类能弹出输入框并存入④评论联系人朋友圈，TA 回复有弹窗+角标，通知面板可见缩略图、点击直达那条回复⑤默认字卡页从头滑到尾无卡顿⑥开全屏→切后台→回来摸一下屏幕即回全屏。

### 2026-08-24（用户反馈：手机端播放音乐和后台保活禁音音频同时启动，音乐卡顿）
- [本会话·完成]（**已改 src + 已构建（20:55, sw: mochi-mt78nuuj），新专项 verify-music-keep-coexist 10/10 + verify-music-bg-resume 回归 10/10 + 布局 verify 10/10，未提交**）：仅 `src/js/bg-keep.js`（AI-B 域）+ 构建产物 + `tools/verify-music-keep-coexist.mjs`（新冒烟）。未碰 music-player.js。
  - **根因**：开后台保活后播放音乐，页面里两个 `<audio>` 同时持续输出——①手机端混音/音频焦点互相争抢；②保活的 5 秒轮询发现自身音频被暂停（焦点被音乐抢走）就补播拉回，与 music-player 自身的防暂停补播形成双向拉锯，每个轮询周期音乐都被打断一下 = 周期性卡顿；③回前台 healKeepAlive 还会连发 4 次补播尝试雪上加霜。
  - **修复（保活侧单向让位，零改动音乐模块）**：音乐播放期间（`window.__musicPlaying=true`）保活音频主动 pause 让位——音乐自带活跃媒体会话（playbackState=playing），防后台冻结目的不丢；停止/暂停后自动收回恢复保活。实现：①`Object.defineProperty` 监听 `__musicPlaying` 写入（music-player 先于本模块加载、只在 onplay/onpause/updateMediaSession 写），起播瞬间立即让位、停止瞬间立即收回，getter/setter 透传对其他读取方透明；②5 秒轮询在音乐在播时改为「保持让位 + 不再强设 mediaSession.playbackState='playing'」（顺带修复音乐暂停时被错误标成正在播）；③resumeOnInteraction/healKeepAlive 全部补播路径加让位守卫；④music-media-release 时同步收回（teardown 边缘路径双保险）。
  - 验证：新专项 10/10（mock Audio+createElement('audio')：保活随启动在播→点歌瞬间让位→5 秒周期零补播且 playbackState 保持 playing→visible/focus/pageshow 自愈不抢回→暂停音乐自动收回→媒体条恢复）；verify-music-bg-resume 10/10 无回归（该套件不开保活，watcher 安装无副作用）；npm run verify 布局 10/10。
  - [补充·稳妥排查轮] 全部 41 个 src JS `node --check` 通过；verify-music-dur-cover 9/9 + verify-music-vip-filter 6/6 回归全过；周边审计无同类问题——call.js 来电已正确 hold/恢复音乐（铃声为短促 sfx）、sfx.js 为一次性 WebAudio 短音无持续流、music-player teardown→music-media-release 派发条件正确、chatcard 语音预览单实例管理正常、全仓无模块全局操控所有 audio 元素；`git diff` 确认 bg-keep.js 仅 +82/-1 预期改动；根目录疑似误建文件 `indow.openModal…{,+40p` 已消失（对方会话已清理）。已知不修项：音乐暂停未完全停止时保活音频收回后媒体条仍显示歌名+playing——v3.9.x 保活依赖 playing 状态的原设计，非本次引入，不动。
  - ⚠️ 真机需确认（安卓 Chrome/Edge）：开启后台保活后播放音乐不再卡顿；通知栏显示歌曲信息可切歌；音乐暂停/停止后「Mochi 后台保活」媒体条回来、后台消息提醒仍正常。
  - ⚠️ 构建扫入工作区其他会话已保存未提交改动（chat/chatcard/feed/gift-shop/p2-features/period/personalize/accounting/pong/snake-game/fullscreen/mail/template/chat-main.css/chat-pages.css 等），提交前请构建者确认对方已保存完整并按需重新 build 收口。

### 2026-08-24（用户反馈：OPPO Reno16 Edge/Via——①自己寄出去的信没法点击查看、看不到有没有回信 ②经期记录设置不成生理期，编辑完确定不变红、卡住不动）
- [本会话·完成]（**已改 src + 已构建，新增 verify-mail-sent-view 16/16 + verify-period-mark 12/12 + 回归 verify-period-save 15/15 + 布局 verify 10/10，未提交**）：`src/js/mail.js` + `src/js/period.js`（均 AI-A 域）+ `src/js/chat.js`（**AI-A 域最小改动 3 处，请知悉**：addIn/chatAddSystem 字段透传加 `mailNotice`；renderMsg poke 分支对 mailNotice 消息加 `.mail-notice` 类 + 点击回调）+ `src/css/chat-main.css`（.msg-poke.mail-notice 可点样式 3 行）+ 构建产物 + tools/verify-mail-sent-view.mjs（新）+ tools/verify-period-mark.mjs（新）。
  - **问题②根因（三层叠加）**：
    1. **部署滞后**：上一会话已修好的「安卓 ce-box 转换后 `.dp-note`/`.dp-temp` 选择器先命中 div → 读值抛 TypeError → 保存回调中断」修复（readInpVal）只在工作区、**从未提交推送**——线上版本用户编辑完点保存必现「不变红且弹窗卡死」（与 vivo Edge 先例同源）。本次随构建一并带上线。
    2. **功能缺失**：日详情浮层原本只能记经量/症状，把某天标成经期（红色）唯一入口是**长按日格**——用户在浮层里「编辑→确定→期待变红」永远落空。已加「生理期」开关（复用 .dp-sym 样式）：保存时与 dayPhase 实际状态比对，变化才 toggleDay 一次（内部含 normalize/saveRecs/render）；重开回显 on 状态。
    3. **长按双触发竞态**：安卓长按同时触发 contextmenu 与 touchstart 的 500ms 定时器，各 toggle 一次 = 标红又立刻取消。已去重：谁先到谁生效（定时器已触发→contextmenu 跳过；contextmenu 先到→clearTimeout），longPressed 仍留给 click 吞合成点击。CDP 真实触摸两种到达顺序验证只 toggle 一次。
  - **问题①处理（当前代码 headless 全链路本就通过 → 加固三处 + 补可发现性）**：
    1. **读值兜底**：sendLetter/submitReply 改 readMailVal（value 代理读空再从 __ceBox 取 innerText，period/music-player 同先例）——防个别内核代理失效导致「信件内容不能为空」信根本没寄出去；
    2. **详情弹层兜底**：openTCPanel（ta-ask.js 尾部才定义，上游模块该机顶层抛错则永久缺失）未定义或打开失败时退回 window.openModal 静态文本展示（剥图），保证点击信件永远有响应；
    3. **寄出后自动跳转**：寄信成功自动回信箱页并选中「寄出的信」（selectMailTab 抽函数复用）——原实现停在写信页，返回后还停在写信卡片，用户以为没寄出去；
    4. **聊天通知可点击**：写信/回信/TA来信/TA回信四类系统消息带 mailNotice 标记渲染为可点击样式（虚线下划+按下反馈），点按直达信箱——原来只是灰字，用户在聊天里点了没反应自然以为「没法查看/看不到回信」。非当前桌面写入的原始 rec 同样带标记（切回该桌面后点击打开的就是该桌面信箱，语义正确）。
  - 验证：verify-mail-sent-view 16/16（写信寄出自动跳转/列表/详情/openModal 兜底/对方已回信标签+回信信纸/聊天通知点击直达/来信回归）；verify-period-mark 12/12（开关标记→变红→持久化/回显/取消/长按双触发两顺序去重）；verify-period-save 15/15 + verify.mjs 10/10 回归全绿。
  - ⚠️ **请构建者尽快提交推送**：问题②的核心修复（readInpVal）已在工作区滞留多轮未上线，线上用户一直踩坑。真机确认点：Reno16 Edge/Via 经期浮层标记生理期保存即变红；长按日格仍可快速标红且不闪断；寄出的信点击有弹层；聊天里「写了一封信/给你回了信」点按进信箱。若真机仍有异常，让用户在设置页确认版本时间（2026-08-24 之后）排除 SW 旧缓存。
  - ⚠️ **并发提示（构建者必读）**：本会话施工期间（20:29~20:56）检测到另一会话陆续保存 accounting/bg-keep/feed/fullscreen/pong/snake-game/chatcard/template/chat-pages.css 等（另有新脚本 verify-bugfix-six/verify-music-keep-coexist/verify-poke-emoji-tabs）。本会话最终构建为 20:58（sw: mochi-mt78ryzl），已包含其当时已保存状态（全部 node --check 通过 + 四套 verify 全绿）；但若对方其后仍有 src 改动，提交前请重新 build 收口。

### 2026-08-24（用户反馈：①拍一拍/表情包面板应显示【公用】【联系人昵称】【我的】三分区；②结构变了以后联系人无法发送拍一拍和表情包）
- [本会话·完成]（**已改 src + 已构建，新专项 verify-poke-emoji-tabs 15/15 + diag-pool-scope 5/5 + verify-cc-scope 27/27 + link-import 22 通过 + 布局 verify 10/10，未提交**）：`src/js/chatcard.js` + `src/js/chat.js` + `src/css/chat-main.css` + `src/template.html`（均 AI-A 域）+ 构建产物 + `tools/verify-poke-emoji-tabs.mjs`（新专项）。
  - **②根因（联系人发不出拍一拍/表情包）**：v3.11.x 双作用域拆分后，打开一次「公用字卡」管理页再返回，模块变量 `ccScope` 停在 `'public'`、内存 `groups` 被换成公用库——而聊天回复池 getCustomCards/getPokeCards/getMediaCards/getPool 全部以该 groups 为基准 → 公用库为空时专属拍一拍/表情包从联系人侧整体消失。修复：新增 `leaveCcPageReset()`，离开 page-custom-cards 时一律恢复专属作用域并重载 groups；挂在既有 MutationObserver（覆盖返回键/底部 tab/安卓返回/切页面所有离开路径）+ cc-back 双保险。tools/diag-pool-scope.mjs 复现场景由 T3/T4 FAIL 转 PASS。
  - **①三分区 UI**：
    - 拍一拍面板（chat.js 注入）：双 tab → 三 tab【公用拍一拍】【联系人昵称的拍一拍】【我的拍一拍】，新增 `.poke-tab-pub`（选中态虚线描边样式）；公用/联系人分区只读展示 公用键 / 专属键 的拍一拍分组（getScopedGroups，不再混显），我的分区不变（预设+用户分组可编辑）。tab 记忆扩展 public 值。
    - 表情包面板（template.html + chat.js）：双 tab → 三 tab【公用表情包】【小A 的表情包】【我的表情包】；联系人分区标签动态取 lbl-partner 昵称；公用/专属分区分别读两键（renderEmojiGroupsBar/renderEmojiPanel 按 emojiMode='public'|'ta' 取 getScopedGroups('sticker',…)，分组记忆 pubCurGroup 独立并入 emoji-last 偏好）；工具行/批量条仍仅我的分区显示。`.emoji-tab` 高亮选择器收窄为 `#emoji-panel .emoji-tab`（朋友圈评论面板复用同名类不受影响），三 tab 字号略收+长昵称省略号防溢出。
    - **回复池语义不变**：getPokeCards/getMediaCards/getMediaGroups/getCustomCards 保持「公用+专属」合并视图（联系人自动拍一拍/表情包回复同时用两份字卡）——仅展示层分区；新增 `window.getScopedGroups(type, scope)` 供面板按作用域读取（sticker/image 自动过滤链接字卡同 getMediaGroups 口径）。
    - 空态文案按分区指引到 公用字卡/专属字卡 对应入口。
  - 验证：verify-poke-emoji-tabs.mjs 15/15（合并池含两 scope / 访问公用页回归 B1-B4 / 拍一拍三分区 C1-C5 / 表情包三分区+动态昵称 D1-D4）；diag-pool-scope 5/5；verify-cc-scope 27/27、verify-link-import 22 通过、布局 verify 10/10 无回归。
  - ⚠️ 构建含工作区其他会话未提交改动（gift-shop/p2-features/period/personalize/WORKLOG 等），提交前请构建者确认对方已保存完整并重 build 收口。真机需确认：三个 tab 在窄屏(360px)不挤压换行、公用分区空态文案。

### 2026-08-24（用户反馈：vivo Edge 经期「记录今天」填完点保存不保存）
- [本会话·完成]（**已改 src/js/period.js；产物已被同时段 20:16/20:22 构建扫入（index.html 内 readInpVal 5 处命中已核对）**，专项 verify-period-save 15/15 + 布局 verify 10/10，未提交）：仅 `src/js/period.js`。
  - **根因（与上方存钱罐条目同族，但故障点不同）**：安卓上 mobile-adapt.js 的 ce-box 转换器把 input[type=number]/textarea 转成 contenteditable div 且**插在原输入框前、继承同名 class**——经期「记录今天」浮层里 `querySelector('.dp-note')` 先命中 div（无 value 属性），保存回调里备注读 `.value.trim()` 直接抛 TypeError 整体中断，`saveDaily` 未执行 → 点保存毫无反应（iOS 不转换所以正常）。同类错位共 4 处一起修：`.dp-note`（抛错中断主链路）、`.dp-temp`（体温恒 NaN 存不上）、`.dp-care-input`(关心语添加静默失效)、`.dp-hour`(提醒小时静默重置 9 点)。注意与 openModal 那条的区别：这里是浮层自建 input 用 class 选择器错位（代理本身没问题），不是 vivo Edge 代理读空——两种场景都要防。
  - **修复**：按 reply-settings.js:136 先例固定**按标签选回原输入框**（input.dp-temp / textarea.dp-note 等，value 已被 defineProperty 代理到 ce-box）；另加 `readInpVal()` 读值兜底（代理读到空时从 `__ceBox.innerText/textContent` 兜底，同 music-player readCeInput 先例），双保险覆盖两类内核。
  - **验证**：新专项 tools/verify-period-save.mjs 15/15——390×844 移动视口（转换器启用）先断言复现前提（A3/A4：.dp-note/.dp-temp 首匹配为 ce-box DIV），对旧构建实测点保存抛同款 `Cannot read properties of undefined (reading 'trim')`（= 用户反馈的直接复现）→ 新构建后保存全链路 15/15（持久化/备注体温读回/重开回显/删除/提醒小时 22/关心语添加）。布局 verify 10/10 无回归。
  - ⚠️ 真机确认（vivo Edge）：经期页「记录今天」→ 选经量/症状/填备注 → 保存应弹「已保存」且日历格子出现标记；重开回显正确。顺带验证提醒设置小时、关心语管理添加。


### 2026-08-24（用户反馈：vivo Edge——存钱罐小心愿输入完内容后无法保存）
- [本会话·完成]（**已改 src；产物已被同时段 20:16/20:22 构建扫入**，临时 CDP 探针 6/6 + 布局 verify 10/10，未提交）：`src/js/personalize.js`（AI-B 域，跨域改动请对方知悉）+ `src/js/p2-features.js`（AI-A 域 piggyAmt 一处）。
  - **根因（与 WORKLOG 2026-08 OPPO Edge ce-box 系列、Via 读空同源）**：安卓端 `#modal-input` 被 mobile-adapt 转成 ce-box 后，弹窗确定走 `input.value` 代理读取——vivo Edge 等内核对该代理支持不完整（defineProperty 被忽略/失败时 ghost 原生 value 恒空），用户明明打完字、点确定读回空串 → 心愿名弹「先写个心愿吧」/金额弹「金额没看懂」，三步添加链路静默卡死 =「输入完内容也没法保存」。标准 Chromium 无此问题（verify-piggy 全绿），故此前未暴露。
  - **修复①（personalize.js openModal，全站弹窗通用）**：新增 `ceBoxOf()`/`readModalVal()`——代理读到空时直接从接管输入的 `.ce-box[data-for]` 取 innerText/textContent 兜底（同 music-player readCeInput 方案）；单行/多行（textarea）分支都接入。聚焦兜底：openModal 的 60ms 聚焦定时器优先 `box.focus()`（代理失效设备上原 focus 打在 ghost 上键盘不弹）。
  - **修复②（p2-features.js piggyAmt）**：全角数字０-９先转半角再解析——部分输入法默认全角时「１００」此前会被过滤成空 →「金额没看懂」误报。
  - 验证：临时探针（直载 src 源码模拟手机环境，已删）：E0 弹窗输入框已被转换 / T1 标准路径两步弹窗 / **T2 defineProperty 把 input.value 钉死为''（vivo Edge 同款故障）+ 全角１００ → 兜底生效直达监督人卡** / T3 心愿落库 a:100 / T4 正常路径回归 / T5 焦点落在 ce-box，6/6；`node --check` 通过；npm run verify 10/10。
  - ⚠️ 真机确认（vivo Edge）：存钱罐＋新小心愿三步（名称→金额→监督人保存）应能走通并出现在心愿单；顺带验证任意弹窗（改昵称等）输入能保存。若真机仍卡在「打不出字」（连输入都失败），则是 OPPO Edge 式 ce-box 无法聚焦/打字，需下一步对 #modal-input 预标记 ceDone 跳过转换（原生 input 仅弹自动填充条不影响输入），待反馈。

### 2026-08-24（用户反馈：OPPO pj110 Chrome——更新后桌面没有【心意市集】图标，刷新也没有）
- [本会话·完成]（**已改 src + 已构建（20:16, sw: mochi-mt779xbw），新专项 verify-market-desk 10/10 + 布局 verify 10/10，未提交**）：仅 `src/js/gift-shop.js`（市集会话认领文件，1 处重构）+ 构建产物 + `tools/verify-market-desk.mjs`（新专项）。
  - **根因（页数上限冲突死循环）**：gift-shop.js `injectDeskApp` 新建页判断用 `curCnt < 6`，而 personalize.js `DESK_PAGE_MAX = 5`、`deskPageCount()` 会把页数钳回 5。已装修满 5 页的桌面：市集注入建出**第 6 页**并写 desk-page-count=6 → `mochi-restore-done` 后 personalize `buildDeskPages()` 按 5 页收缩 → **删尾页并把页上 `[data-desk-widget]` 图标扫进隐藏池**；而 `app-market`/`app-giftbox` 不在 personalize 装修白名单 `WIDGET_IDS` 里，组件库加不回、池逻辑也不管 → 每次启动「重建第 6 页→又被钳掉进池」循环，用户看到的就是刷新也没图标（开屏等数据就绪才进入，进入时钳页已完成）。不满 5 页的桌面不受影响，故只有重度装修用户翻车。
  - **修复**：两图标改 `injectDeskApps(pairs)` 成组注入——上限对齐 `curCnt < 5`（与 DESK_PAGE_MAX 一致）；放不下或布局已含时走 memo-app 同款安全兜底：**无条件 append 进 `.app-grid.p3-grid` 当前所在位置（哪怕整组暂在隐藏池，由 accounting ensureP3 随组找回）**+ `applyDeskLayout()` 按布局归位；两图标同进同出一页/同组，不再出现旧代码市集独占第 6 页、心意柜落第三页的分裂。
  - 验证：`node --check` 通过；verify-market-desk 10/10（未装修落第三页组 / **满 5 页装修桌面：不新建第 6 页+计数保持 5+数据就绪钳页前后两图标均不在隐藏池** / 布局残留 app-market 场景不被吞 / 点开市集页 79 商品渲染 / 心意柜开页）；布局 verify 10/10 无回归。
  - ⚠️ **需要 AI-B 后续处理（本会话未碰对方文件）**：personalize.js 装修白名单三处建议补 `app-market`/`app-giftbox`（以及 memo 会话遗留的 `app-memo`）——WIDGET_IDS 数组、WIDGET_NAMES、WIDGET_PREV_HTML。不加不影响本修复生效（图标已稳定落在 p3 组内），只影响装修模式组件库单独增删这三个图标。
  - ⚠️ **构建扫入了同时段另一会话已保存改动**：p2-features.js / period.js / personalize.js（openModal ce-box 安卓读值兜底+聚焦兜底）/ WORKLOG.md——git status 显示均为完整保存状态，提交前请构建者再确认对方已收尾；如对方其后还有 src 改动需重新 build 收口。
  - 真机确认（OPPO pj110 Chrome）：更新到新版本后桌面第三页图标组应出现【心意市集】【心意柜】两个图标，刷新/杀页面重进均在。

### 2026-08-24（用户反馈：vivo Edge——番茄钟「添加夸夸字卡」/存钱罐碎碎念添加后，屏幕最右边出现竖排「已添加」且永不消失，划掉后台才没了）
- [本会话·完成]（**已改 src + 已构建，verify-toast-cross-module 5/5 + 布局 verify 10/10 回归通过，未提交**）：仅 `src/js/p2-features.js`（AI-A 域，1 处）+ 构建产物。
  - **根因**：p2-features.js 第三段 IIFE（同频伸手/番茄钟/存钱罐/喝水吃饭页共用段，L1504-2635）自带的 `toast()` 创建的是 `id="tp-ss-toast"` 元素——而全站 toast 样式只写在 `#cc-toast` 这个 ID 选择器上（chat-pages.css L149），无任何 `.cc-toast` 类规则 → 该 div 完全无样式。html/body 是 `display:flex` 横向居中（base.css L41），手机上 .phone 占满宽度后这个多余 flex 子项被压缩到约 0 宽 → 「已添加」一字一行竖排挤在屏幕最右缘；又因没有 #cc-toast 的 fixed 定位 + opacity:0 初始态 + 自动淡出动画，JS timer 只移除 show 类、元素本身永远可见 → 杀页面才消失。该段内所有 toast 调用（番茄钟设时长/夸夸字卡、存钱罐存取/碎碎念/心愿、同频伸手、喝水/吃饭提醒等）全部中招。
  - **修复**：该 `toast()` 改为与其他 20+ 模块完全一致的写法——复用 `document.getElementById('cc-toast')`（无则建），timer 属性统一 `_timer`、2000ms。`node --check` 通过；tp-ss-toast 无其他引用点，无残留。
  - ⚠️ 真机需确认（vivo Edge）：番茄钟添加夸夸字卡、存钱罐加碎碎念后，底部居中出现黑色胶囊「已添加」约 2 秒自动消失，右侧不再有竖排文字。

### 2026-08-24（用户反馈：聊天「更多功能」里的【邀请TA】【问问TA】【搜索记录】打开后页面跑到聊天输入栏的下方，其他功能正常）
- [本会话·完成]（**已改 src + 已构建，新增 tools/verify-kb-dock.mjs 12/12 + verify-more-panel-scope 30/30 回归 + 布局 verify 10/10，未提交**）：src/css/chat-main.css（AI-A 域）+ 构建产物。
  - **根因（安卓键盘）**：三个异常功能是全部「更多功能」里**仅有的打开即自动聚焦输入框的功能**（邀请TA/问问TA 80ms 后 focus、搜索记录 60ms 后 focus）→ 面板一打开键盘立即弹出。安卓 viewport 是 interactive-widget=resizes-visual：键盘只缩 visualViewport 不缩 layout viewport，syncAndroidKb 据此把 .phone 收缩到可视高 → 输入栏上移停靠键盘上方；而 .poke-card/.more-panel/.emoji-card 半框是 position:**fixed**——锚定全高 layout viewport 原地不动 = 升起后的输入栏下方/键盘后面。其他功能不自动聚焦、键盘不弹，所以「正常显示」。headless 复现：模拟 vv.height 844→400 + resize，fixed 半框底边停在 748、输入栏顶升到 336，面板整体深入输入栏下方 348px。
  - **修复**：`.more-panel`/`.poke-card`/`.emoji-card` 基础规则 fixed → **absolute**——锚定收缩中的 .phone/#page-chat，键盘弹出时随容器一起停靠输入栏上方（复现脚本验证：面板底边 304 < 输入栏 top 336）。手机端 .phone 满屏时 absolute 与 fixed 几何等价（无键盘时矩形逐一比对不变）；桌面宽屏行为与上一轮 @media 修复一致（该 @media 现只剩 .call-mini 需要——其拖动坐标按视口计算，真机保持 fixed）；Pong/贪吃蛇 `-fs` 全屏变体是 #id.pong-fs 显式 fixed 特异性更高不受影响。附带收益：红包自定义金额/帮我决定表单等手动聚焦场景同样不再被键盘盖住。
  - **验证**：tools/verify-kb-dock.mjs（新专项）12/12——邀请TA/问问TA/搜索记录/帮我决定 四面板 × {无键盘贴输入栏上方 + pos=absolute + 模拟键盘弹出后仍贴输入栏上方}；verify-more-panel-scope 30/30（宽屏收进手机框 + 手机端矩形不变）+ npm run verify 10/10 无布局回归。
  - ⚠️ 真机需确认：安卓（红米 K80/vivo Y35）打开这三个功能时键盘弹出后面板应完整可见并随输入栏停靠在键盘上方；iOS resizes-content 本就正常（layout viewport 整体收缩，fixed/absolute 行为一致），理论零变化。

### 2026-08-24（用户要求：喝水页功能优化）
- [本会话·完成]（**已改 src + 已构建，verify-water 17/17 + 布局 verify 10/10，未提交**）：src/js/p2-features.js（AI-A 域）+ src/js/calendar.js（AI-A 域·日历打点 1 处）+ src/css/chat-pages.css（AI-A 域）+ 构建产物 + tools/verify-water.mjs（新专项）。
  - 功能：①发到聊天按钮（chatAddIn 推「我今天喝了 X/Y 杯（Zml）」）②TA 提醒按钮（字卡池随机×TA 语气模板 4 型+还差/喝够尾注，显示并推聊天）③达标彩蛋（达标瞬间震动+card.done 涟漪+8 小水杯点亮）④近7天柱状图（water-history 近15天 {date:count}，7 列达标绿/部分蓝/空灰今日高亮）⑤连续达标（water-streak{date,n} 跨天+1/减水回退，显示🔥连续达标N天）⑥单次容量ml（water-size 默认250，unit 显示 Xml/Yml）⑦日历打点（window.waterDayHas 暴露，calendar.js renderGrid 加 .cal-water 类，CSS 蓝点）。
  - 数据键（LS 命名空间）：water-today/water-goal/water-size(新)/water-msgs/water-history(新)/water-streak(新)/water-last-visit。
  - 验证：node --check 通过；verify 10/10；verify-water 17/17。需真机确认水杯点亮动画/card.done 涟漪/日历蓝点深色对比度。
  - ⚠️ 构建时工作区有未提交改动（memo/market/garden/chat 等），构建产物已包含，提交前请确认对方已保存完整。

### 2026-08-24（用户要求：心意市集自定义商品可编辑/上传图片 + 所有桌面互通）
- [本会话·完成]（**已改 src + 已构建，专项 verify-market-custom 15/15 + 布局 verify 10/10，未提交**）：`src/js/gift-shop.js` + `src/css/market.css`（本会话认领文件）+ `src/js/chat.js`（**AI-A 域最小改动 1 处，请知悉**：renderMsg gift 分支支持 `rec.giftImg` 渲染 `<img class="msg-gift-img">`，无图回退 emoji；基于 AI-A 同轮的分类色圆底新版改）+ `src/js/contacts.js`（**AI-B 域最小改动，请知悉**：EXCLUDE 加 `market-custom`/`market-migrated`/`market-migrated-v2`）+ 构建产物 + `tools/verify-market-custom.mjs`（新专项）+ `tools/shot-market-custom.mjs`（截图）。
  - **自定义商品库全局互通**：新键 `xy-home-v2:market-custom`（根命名空间，所有桌面一份）。元素三形态：自定义商品 `{id:'g_custom_*',…,img}` / 默认商品覆盖 `{id:<默认id>,base:1,…}`（管理模式编辑默认商品生成） / 删除标记 `{id,del:1}`（管理模式删默认商品，防全局化后复活）。`giftsLoad()` = 默认库 − 墓碑 + 覆盖 + 自定义。心意币钱包/心意柜记录仍按桌面隔离。
  - **存量迁移** `migrateMarketGlobal`（幂等 `market-migrated`）：模块加载合并 LS 一次 + `mochi-restore-done` 后打标记补跑一次；遍历 `getContacts()` 读各桌面旧 `market-gifts` 整库快照——`g_custom_*` 并入全局（id 去重）、缺失默认商品记墓碑。旧各桌面键保留不删（小 JSON 无图片，作备份）。与 AI-A 同轮扩库的配合（DEF_V1_IDS 只对旧 43 个记墓碑 + rescueNewDefaults 救援）见其条目，双方已互相融合、`node --check` 通过。
  - **商品图片上传**：添加/编辑表单新增「商品图片（可选）」行——持久化隐藏 file input（`gm-img-input`，初始化即挂 body，规避安卓 Edge 忽略动态 input 合成点击）→ FileReader → canvas 压缩 480px JPEG .85（白底防透明变黑，失败 toast 不存原图）→ 预览/换一张/清除。市集网格/聊天送礼面板/购买弹窗/心意柜卡片/心意柜详情/聊天礼物消息卡片共 6 处渲染位支持 img（object-fit:cover 圆角），无图回退 emoji。
  - **编辑能力**：管理模式点商品或 ✎ 徽章 → 编辑表单（默认商品也可改，存覆盖项，标题「编辑默认商品」）；✕ 删除（默认商品提示可恢复）；存在墓碑/覆盖时管理模式底部显示「恢复默认商品」（清墓碑+覆盖，自定义保留）。
  - 验证：verify-market-custom 15/15（迁移并入/墓碑只限 v1/幂等/市集渲染/CDP setFileInputFiles 真实走压缩链/保存含 jpeg480 图/编辑覆盖/删除墓碑+恢复按钮/恢复默认/跨桌面互通/聊天面板/聊天礼物卡片 img，无 JS 异常）+ 布局 verify 10/10 + 截图（网格带图卡片/编辑表单）。真机需确认：安卓/iOS 选图弹系统选择器、480px 图清晰度是否够。
  - ⚠️ 构建含工作区多方未提交改动（memo/番茄钟陪伴/存钱罐/garden/calendar/chatcard/feed/mail/p2-features/period/personalize/template/build.mjs 等），**提交前请构建者确认各方已保存完整并重新 build 收口**。本会话未提交任何文件。

### 2026-08-24（用户要求：心意市集扩充更多商品）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：仅 `src/js/gift-shop.js`（AI-A 域）+ 构建产物 + `tools/dbg-market.mjs`（市集打开状态调试+截图脚本）。
  - **新增 36 个默认商品**（总数 43→79）：新分类 3 个——美食🍜#fff9c4（小火锅/寿司/长寿面13.14/烧烤/元气早餐/果汁/糖炒栗子/烤红薯/爆米花 9 个）、出行✈️#e1f5fe（车票/机票520/露营/海边/温泉/旅行攻略 6 个）、娱乐🎟️#e1bee7（电影票/演唱会520/游乐园131.40/抓娃娃/K歌 5 个）；现有分类补充 16 个——甜品+2（冰淇淋/布丁）、饰品+1（王冠999.99）、星空+4（初雪/晚霞/春风/海浪，多为 0 元心意）、关怀+4（热牛奶/揉揉肩/叫早服务/陪你看剧）、情侣用品+2（情侣表/情侣鞋）、日常用品+3（围巾/袜子/棉拖鞋）。价格多用 5.20/13.14/66.60/131.40/520.00 等情侣数字，留言一句话情话风格。
  - **迁移适配（重要，配合对方的全局商品库重构）**：① `migrateMarketGlobal` 的「快照里没有的默认商品记 del 标记」改为**只对 DEF_V1_IDS（旧 43 个）生效**——否则旧桌面快照迁移时会把本次 36 个新默认商品误标成「用户删过」而永久隐藏；② 新增 `rescueNewDefaults()`（market-migrated-v2 幂等标记）：清理「迁移在扩库前已跑过」设备上误标 del 的 v2 新商品，init 与 mochi-restore-done 各跑一次。新架构（DEF_GIFTS+覆盖层）下新商品对未迁移用户自动生效，无需版本迁移。
  - 验证：`node --check` 通过 + verify 10/10 + dbg-market 实测（市集正常打开，grid 79 items / 11 分类入口，无 JS 异常）+ 截图 market-new.jpg。真机确认点：老数据设备进市集能看到新分类与新商品、管理里删除默认商品后重启不复活。
  - ⚠️ 本轮 gift-shop.js 与对方并行改动（全局商品库 market-custom 重构 + giftImg 图片商品）在同一文件交汇：对方的重构保留了我在 DEF_GIFTS/CATS 的扩充，我的迁移修复也兼容其结构；**提交时请双方改动一起走**。构建产物含工作区约 25 个文件改动，提交前确认对方已保存完整。

### 2026-08-24（用户要求：番茄钟新增「陪伴模式」——聊天页顶部数字倒计时）
- [修订·用户反馈「陪伴模式也可以和正常聊天一样，联系人可以主动发消息」]（**已构建：verify 10/10 + verify-pomodoro 20/20 + verify-pomodoro-companion 升级为 21/21，未提交**）：
  - **移除勿扰机制**：chat.js scheduleAutoSend 的 `__pomoCompanionQuiet` 守卫已删除（TA 专注期间照常主动发消息/邀请/查岗，与正常聊天完全一致）；p2-features.js 中该标记的置位/解除全部移除，`pmpActive()` 简化为只看会话记录。`window.enterChat` 暴露保留（入口跳转仍依赖）。
  - 开场白/鼓励/祝贺等陪伴消息保留不变；新增 A3b 回归断言（陪伴期间窗口上不存在勿扰标记，防回归）。
  - 教训记录：条走秒刷新原挂在 `window.__pomoCompanionQuiet` 条件上，删标记时漏改导致 A6/A9 失败一轮，已改为 `pmpActive()` 条件。
- [本会话·完成]（**已构建：verify 布局 10/10 + verify-pomodoro 20/20 + 新冒烟 tools/verify-pomodoro-companion.mjs 20/20，未提交**）。涉及 `src/js/p2-features.js` + `src/js/chat.js`（AI-A 域，2 处小改）+ `src/css/chat-pages.css`（AI-A 域）+ 构建产物。
  - **形态**：不做新页面，复用聊天页——番茄钟页新增「🍅 陪伴模式」按钮 → 启动专注 + `window.enterChat()`（chat.js 本次暴露）跳聊天页；`.chat-head` 下注入倒计时条 `.pmp-bar`（MM:SS 等宽数字 + 「TA 陪着你」标签 + 暂停/继续按钮 + ⋯菜单[回番茄钟页/提前结束] + 底部 2px 进度线）。
  - **勿扰**：置全局标记 `window.__pomoCompanionQuiet`，chat.js `scheduleAutoSend` 轮询遇标记跳过本轮主动发送/邀请（60s 后重试）；用户自己发消息 TA 照常回。
  - **陪伴消息**：开场白（4 选 1，silent）/ 每 5~8 分钟最多 2 次极简鼓励（6 选 1，silent+initiative 爱心标）/ 完成祝贺（3 选 1）/ 提前结束 TA 温柔回应「没事，休息一下也可以」。陪伴中完成走专属祝贺并闪「✅ 完成 +1 🍅」条 2.6s；常规番茄钟的「发到聊天」开关在陪伴模式下不重复发。
  - **持久化**：会话存 `pomo-companion`{mode,totalMs,endAt,startedAt,paused,remainMs,enc,nextEncAt}（LS+IDB 双写）——刷新/重开 App 接续计时；关闭期间已过期的会话启动时补记 🍅 并补发一条祝贺。
  - **退出**：⋯菜单提前结束（弹窗确认，不计入今日）；切联系人自动解除勿扰并收条（引擎继续作为普通番茄钟跑）。
  - chat.js 改动仅 2 行级：①scheduleAutoSend 勿扰守卫；②暴露 window.enterChat。未动 mobile-adapt FLOAT_SELECTORS（倒计时条是内嵌流式元素非浮层，无需滚动锁）。
  - 验证：node --check ×2 通过；三套件全绿（含 Date.now 跳变模拟完整完成流、暂停冻结、恢复接续、补记）。需真机确认：条在 iOS 键盘弹起时布局、音频/sfx 不被 silent 消息误触发。
  - ⚠️ 工作区仍有并发会话改动（memo/calendar/group-chat/mobile-adapt 等），构建产物为三方混合状态，提交前请各方确认保存完整。

### 2026-08-24（用户要求：桌面第三页新增【备忘录】功能）
- [本会话·完成]（**已构建 verify 10/10 + 新冒烟 verify-memo 14/14，未提交**）：新增 `src/js/memo-app.js` + `src/css/memo.css`（本功能专属新文件）+ `build.mjs`（jsFiles 在 gift-shop.js 后加 memo-app.js、cssFiles 尾部加 memo.css）+ `tools/verify-memo.mjs`（新冒烟）+ `tools/shot-memo.mjs`（截图工具）+ 构建产物。
  - 功能：第三页新增「备忘录」图标（便签本 SVG，与同频/喝水等同款动态注入模式）→ 全屏页（page-memo，复用 openPage/backHome 同款 rAF 全屏 chrome）。待办清单式：输入框+添加（Enter 也可）/ 勾选完成（划线+震动）/ 点文字多行编辑（openModal textarea）/ 📌置顶（置顶组排最前）/ 单条删除确认 / 清已完成（确认弹窗）/ 空态提示 / 计数「共 N · 待办 M」。TA 情侣感：完成全部夸夸+双震动、35% 概率完成鼓励、25% 概率添加回应、可选「完成发到聊天」（默认关，memo-app-send='1' 开，走 chatAddIn）。
  - 数据：按桌面独立 `memo-app-items`（JSON [{id,t,done,pin,ts}]，store.set 自动 LS+IDB 双写）；键尾含 `memo-` 已命中 data-backup.js 备份识别列表，无需改 data-backup。
  - **关键时序坑（重要，后续加第三页图标者必读）**：全新冷启动时 personalize.js 的 rebuildDeskWhenReady→buildDeskPages（desk-page-count 未存时按 DESK_PAGE_MIN 收缩）会把第三页整页（含 p3apps 组）**短暂移进隐藏池**，稍后 accounting.js 的 ensureP3 才把整组找回归位。所以动态图标注入**必须无条件 append 进 `.app-grid.p3-grid` 当前所在位置（哪怕在池里），随组一起回第三页**；不能加「在池里就跳过」守卫（会让图标永远孤儿——首版踩坑，verify-memo 抓出后已修）。
  - ⚠️ **需要 AI-B 后续处理（本会话未碰对方文件）**：personalize.js 装修白名单三处加 `app-memo`——WIDGET_IDS 数组、WIDGET_NAMES（'备忘录图标'）、WIDGET_PREV_HTML（_appIcoPrev('备忘')）。当时检测到对方会话正在编辑 personalize.js（16:11 有保存），按「对方进行中文件不碰」规则跳过。**不加不影响功能**（app-* 在 grid 内本就不进池逻辑、装修拖拽/布局持久化正常），只影响装修模式组件库单独增删该图标。
  - ⚠️ **并发提示**：本会话期间（16:05~16:14+）检测到另一会话在持续保存大量文件（p2-features/chat/chatcard/feed/mail/market.css/contacts/template/personalize/period/bg-keep 等，含番茄钟/存钱罐等新功能），最终构建（17:02, sw: mochi-mt70d0tg）已包含其当时已保存状态；**提交前请对方确认已保存完整，构建者建议再 build 一次收口**。本会话全程只新增文件+改 build.mjs，未碰任何对方正在编辑的文件。
  - **续改（同会话·用户要求全局互通）**：备忘录数据改为**所有桌面联系人共享一份**（参照 fish-log/period 先例）——键移到 `xy-home-v2` 根命名空间（memo-app-items / memo-app-send / memo-app-global-migrated 幂等标记）。① 存量迁移：遍历 getContacts() 把各命名空间旧 memo-app-* 按 id 合并进根键（冲突取 ts 新、发送开关任一开过即全局开）、清理旧键；② **误迁自愈（重点）**：contacts.js migrateLegacy 会把无冒号根键当旧顶层键拷进 default 并删 LS 根键（memo-app-* 尚未进 EXCLUDE，每次加载循环发生）——本文件在 eval / restore-done / +600ms / +2000ms 四个时点做「LS 根键缺失→从 default 副本写回」（必须看裸 localStorage，root.get 会被 memoryCache 掩盖误判），配合 IDB 根键保留 + memoryCache，数据三重兜底永不丢；**contacts.js 正被对方并发编辑（17:32 仍在保存），故未加 EXCLUDE，转交 AI-B 补三键**（'memo-app-items'/'memo-app-send'/'memo-app-global-migrated'，补后自愈逻辑自然闲置、default 副本循环消失）。verify-memo 扩到 16/16（新增：多桌面存量按 id 合并冲突取 ts 新 + 误迁自愈写回；测试读数必须走 xyStore.get——裸 localStorage 会被 eat 误判为空）。
  - 验证：`node --check` 全部 src/js 通过 + verify 布局 10/10 + verify-memo 14/14（图标落位第三页/开页全屏/添加/排序/勾选/置顶/编辑/删除/清理/刷新持久化/返回）。截图 tools/shot-memo.mjs 产物 memo-shot-p3.jpg（第三页图标）/ memo-shot-page.jpg（页面效果）在仓库根目录可看。需真机确认：安卓 ce-box 输入框添加备忘、Enter 提交、震动反馈、**切桌面联系人后备忘录数据一致**。

### 2026-08-24（用户要求：字卡库公用/专属更新需一次性弹窗提醒，引导先导出字卡 json 备份）
- [AI-A·完成]（**已构建 verify 10/10 + verify-cc-scope 扩至 27/27（新增场景 E 测弹窗），未提交**）：`src/js/chatcard.js` + `src/template.html`（#cc-scope-mask 弹层锚点）+ `src/js/contacts.js` + `src/js/mobile-adapt.js`（**两处 AI-B 域最小改动，请知悉**：EXCLUDE 加 `cc-scope-notice-done`；FLOAT_SELECTORS 加 `#cc-scope-mask`）+ 构建产物。
- 行为：升级后首次启动数据就绪即弹出「字卡库更新提醒」（复用 .tc-mask/.tc-panel 弹层体系）——说明公用/专属双分类变动、显示检测到的存量字卡数、按钮「导出字卡 json 备份」（下载 mochi字卡库备份.json = 当前桌面专属+公用合并标准格式，与 字卡库→导入数据 兼容）/「我已知晓，进入新版」。任一关闭路径置全局标记 `cc-scope-notice-done` 不再打扰；全新空库用户静默置标记不弹。
- 时序：等 mochi-restore-done 后延迟 1200ms 弹出（与存量迁移无顺序依赖——导出内容实时读双键，迁移先后均完整）。
- ⚠️ 本轮构建含另一会话心意市集礼物卡等改动，提交前请确认对方已保存完整。

### 2026-08-24（用户反馈：心意市集发到聊天里的礼物卡片太丑 → 三轮定稿：黑白简约 + 分类色圆底）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/chat.js`（礼物卡渲染结构）+ `src/js/gift-shop.js`（仅 1 行 `window.GIFT_CAT_COLOR = CAT_COLOR` 供聊天卡取分类色）+ `src/css/market.css`（礼物卡样式重写 + 暗色块同步）+ 构建产物 + `tools/shot-giftcard.mjs`（新截图脚本，支持 DARK=1 截暗色）。
  - 演进：一轮彩色心意卡（分类色舞台+星芒）→ 用户反馈颜色太杂（其主题简约黑白风）→ 二轮纯黑白 → 用户要求**按商品类型带点颜色** → 三轮定稿：**黑白简约骨架不变，唯一彩色元素 = emoji 的分类色圆形底衬**（复用市集 CAT_COLOR：花束粉/星空蓝紫/甜品橙…，未知分类回退浅灰 #f2f2f5），名字黑色 letter-spacing 2px + 46px 短灰线 + 灰色留言 + 底部（左「我 送出 / TA 送来」小灰字，右弱化价格）。无动画无渐变。暗色 #1c1c1e 卡，分类色圆底原样保留（浅色圆底在深卡上自然突出）。
  - 兼容：历史消息按 rec 数据重渲染自动用新样式；`.msg-gift-bar` 类已删（无他处引用）；favHeart 仍保留在 DOM（原本对礼物卡就不可见，行为不变）。
  - 验证：`node --check`（chat.js/gift-shop.js）+ verify 10/10 + 截图 giftcard-bwcat.jpg（定稿）/ giftcard-bw.jpg（纯黑白中间版）/ giftcard-after.jpg+giftcard-dark.jpg（一轮彩色废弃稿，均在仓库根目录未跟踪，可删）。
  - ⚠️ **本次构建扫入了对方进行中的大量改动**（memo-app.js/memo.css 新模块 + build.mjs 加载 memo.css + calendar/chatcard/contacts/feed/group-chat/mail/mobile-adapt/p2-features/period 等约 15 个文件，另有疑似误建文件 `indow.openModal = function (t, v, fn, opts) {,+40p` 请对方检查）。提交前务必确认对方已保存完整；礼物卡改动本身只涉及上述 3 个 src 文件。

### 2026-08-24（用户要求：桌面第三页新增【存钱罐】功能；二轮：全局互通+TA塞钱不入账；三轮：里程碑/多心愿监督/取款关心/全部记录）
- [本会话·完成]（**已构建 verify 基线 10/10 + tools/verify-piggy.mjs 37/37，未提交**）：`src/js/p2-features.js`（AI-A 域）+ `src/css/chat-pages.css`（AI-A 域，.piggy-* 样式）+ `src/js/contacts.js`（**AI-B 域越界一处：EXCLUDE 加 7 键**——piggy-log/piggy-goal-name/piggy-goal-amt/piggy-cards/piggy-last-visit/piggy-goals/piggy-goal-cur，照 period 先例防 migrateLegacy 误迁，请 AI-B 知悉）+ 构建产物。
  - 存储：**v2 改全局根命名空间 `xy-home-v2:piggy-log / piggy-goal-name / piggy-goal-amt / piggy-cards / piggy-last-visit`（所有联系人桌面互通一份金库，用户明确要求；xyStore.set 自动双写 IDB）**。⚠️ 已在 contacts.js migrateLegacy 的 EXCLUDE 加这 5 键——不加会被误迁进 default 桌面导致非 default 桌面读空（period 同款坑）。
  - **v2：TA 塞硬币改纯彩蛋不入账（用户要求）**——久未打开时只弹字卡「偷偷塞了一点 ¥X.XX · 替TA存进去？」+震动，不写 log、不动余额、不产生记录行，由用户自己决定是否存入。`piggy-last-visit` 仅作彩蛋频率控制。
  - **v3（用户选定优化 2/4/6/7）**：
    - ②里程碑庆祝：存到心愿的 25/50/75% 时各庆祝一次（字卡+震动，标记存 g.ms 防重复，取最高新达成档）；攒满走原达成庆祝并自动切下一个未完成心愿。
    - ⑥多目标心愿单：`piggy-goals`=[{n,a,ms,done,by}]，余额全罐共享、各心愿各自进度条；点行切换当前（hero 进度跟随）、✕ 删除带确认；老单目标键首次读取自动迁移。
    - **心愿监督人/可见性（用户新要求）**：添加心愿第三步选监督人 chips（全部桌面 / 各联系人，多选，默认勾当前桌面），存 `by`（[]=所有人）；各桌面只显示 by 包含自己的心愿，其余隐藏但数据保留；hero 游标指向不可见心愿时回退第一个可见。
    - ④取款关心：取款后 TA 追问（花在哪了呀/买什么了…），页内联回复框可回一句（发送=以我身份 chatAddIn 到聊天）或忽略。
    - ⑦全部记录：记录卡顶部「全部记录/只看最近」切换；展开=正序+按月分组+每月小结（净结余）。
    - 新键：`piggy-goals/piggy-goal-cur`（均已加 EXCLUDE）。
  - 功能：第三页「存钱罐」图标（并入同频/伸手/喝水/吃什么/番茄钟同组智能放置：默认第三页；已装修且布局含任一同组图标→留第三页；完全不含→整组一起进新页）。页面：余额大字 + 小目标名/金额/进度条（%）、存一笔（金额→给TA留言 两步弹窗）、取一笔（用途可选、超额拦截、空罐 toast 拦截）、TA 碎碎念字卡（可自定义 `piggy-cards`）、心愿单、最近记录、攒够目标庆祝字卡+震动。
  - ⚠️ **踩坑记录（重要）**：personalize 的 openModal 点确定后统一执行 close()（cb=null）——在 ok 回调里**同步**再开第二个弹窗会被立即关掉。已用 `setTimeout(...,60)` 延迟开启（存入留言/取出用途/设目标金额三处）。后续任何模块要做两步弹窗务必照此办理。
  - ⚠️ 并发提示：本会话施工期间检测到另一会话在同一文件（p2-features.js）追加「番茄钟」，以及 market/group-chat/period/build.mjs 等改动陆续落盘；已逐点核对共存、`node --check` 通过，构建产物包含双方当时已保存改动。若番茄钟会话其后仍有 src 改动，请其重新 build 一次。
  - 验证：`node --check`（p2-features/contacts）通过；`node tools/verify.mjs` 10/10；`node tools/verify-piggy.mjs` 37/37（图标放置×3 / 开页 / 空罐与超额拦截 / 存取两步弹窗 / 监督人三步添加+持久化 / 里程碑 50% 触发 / 达成 done 标记 / 取款 TA 追问+回复发送 / 心愿删除确认 / 全部记录按月分组小结 / 彩蛋不入账 / 重开持久化 / 跨桌面余额目标互通 + 可见性过滤）。无头无法验证真机键盘弹起与金色主题观感，需真机过一遍。

### 2026-08-24（用户反馈：手机端桌面打开心意市集 UI 太大/右侧被裁）
- [本会话·完成]（**已改 src + 已构建 verify 10/10，未提交**）：`src/css/market.css`（心意市集/心意柜样式，无归属文件，本会话认领）+ 构建产物。
  - **真实根因（布局 bug，不是元素尺寸问题）**：`.page` 是纵向 flex 容器，`.market-body` 写了 `max-width:560px + margin:0 auto` 却没写 `width`——flex item 左右边距为 auto 时不再 stretch、改按 fit-content 收缩，而分类行 `.market-cats`（8 个 `flex-shrink:0` 圆钮）固有宽约 590px，把整页撑到 560px：360px 手机上横向溢出 200px（商品卡 260px 宽、hero/卡片右侧被裁、整体观感「UI 太大」）；桌面 390px 模拟器外壳同样溢出。上一轮 de1bebe 只修了聊天送礼面板，市集页本身没修，故用户说「依旧太大」。
  - 修复：`.market-body` / `.giftbox-tabs` / `.giftbox-scroll` 三处同模式选择器显式 `width:100%`（+`box-sizing:border-box`），先按父宽撑满再被 max-width 限宽居中。360px 视口实测：body/grid 360、商品卡 160×138、scrollWidth 360 无溢出；两页页头 360×63、返回键/返回桌面正常。桌面宽屏仍 560px 居中限宽不变。
  - 新增 `tools/shot-market.mjs`（市集/心意柜截图冒烟：`node tools/shot-market.mjs 360 740 market|giftbox [输出.jpg]`）。
  - ⚠️ **本会话构建时工作区有对方大量进行中改动**（memo-app/memo.css 新文件、build.mjs、calendar/contacts/group-chat/mobile-adapt/period/chat/feed/mail/chatcard/template 等），产物 index.html 只是当时快照、**已过期**；提交前请构建者重新 `node build.mjs`（market.css 改动已保存，重构建必包含）。本会话未提交任何文件。

### 2026-08-24（用户要求：字卡库【自定义聊天字卡】拆成 公用字卡 / 专属字卡 双大分类）
- [AI-A·完成]（**已构建 verify 10/10 + 新专项 verify-cc-scope 22/22 + 链接导入回归 19/0，未提交**）：`src/js/chatcard.js` + `src/template.html`（字卡库列表锚点，AI-A 业务惯例）+ `src/js/chat.js`（仅 4 处空态引导文案）+ `src/js/contacts.js`（**AI-B 域越界最小改动，请知悉**）+ 构建产物。
- 需求：字卡库原「自定义聊天字卡」入口拆两个大分类——**公用字卡**（小字：以后每个桌面的联系人都能使用）/ **专属字卡**（小字：只有当前桌面绑定的联系人才能使用）。
- **数据模型**：新增全局根键 `xy-home-v2:cc-groups-public` 存公用字卡（全桌面共享）；专属沿用各联系人命名空间 `xy-home-v2:<cid>:cc-groups`。管理页按入口切作用域读写；聊天回复池/拍一拍/表情面板/信箱/朋友圈/日历留言/TA回应等所有消费方一律取「公用+专属」合并视图（getCustomCards / getPoke* / getMedia* 及 *For 系列内部 mergeWithPublic，pubCache 缓存防高频 JSON.parse）。
- **存量迁移**（一次性幂等，标记 `cc-scope-migrated`）：等 mochi-restore-done + 本模块专属键 IDB 恢复落定后执行——①多桌面用户：存量字卡原地保留即专属，不搬动；②单桌面用户：该桌面 cc-groups 迁入公用键并清旧键（含旧版顶层键 `xy-home-v2:cc-groups` 回退源，LS/memoryCache 与 IDB 取内容多者）。之后新建的桌面联系人生而共享公用、专属为空。
- **UI**：列表页两行入口（#li-custom-cards-public / #li-custom-cards，后者保留原 id 兼容既有脚本）；管理页标题随作用域显示「公用字卡/专属字卡」(#cc-page-title)；列表角标分显 #cc-pub-count / #cc-list-count（带缓存）；批量导入/导出/去重/清空均随当前作用域生效。
- ⚠️ contacts.js EXCLUDE 追加 `'cc-groups-public', 'cc-scope-migrated'` 两键——防 migrateLegacy 把全局键误迁进 default 桌面（同 period-* 先例），AI-B 后续改 EXCLUDE 时勿删。
- ⚠️ 本轮构建时 chatcard.js 已叠加另一会话已保存的「链接导入图片」改动（v3.11.x），两者编辑区域不重叠；构建产物同时含双方改动（SW 版本 mochi-mt6z2fgt），提交前请确认对方已保存完整。

### 2026-08-24（用户要求：桌面第三页新增【番茄钟】功能）
- [本会话·完成]（**已构建：verify 布局 10/10 + 新冒烟 tools/verify-pomodoro.mjs 20/20，未提交**）。涉及 `src/js/p2-features.js`（AI-A 域）+ `src/css/chat-pages.css`（AI-A 域）+ `src/js/personalize.js`（**AI-B 域仅装修白名单 3 处代改，请知悉**）+ 构建产物。
  - **功能**：第三页新增「番茄钟」图标（ tomato 线性 SVG，风格同喝水/吃什么）→ 独立全屏页：专注/小憩/长休三档 tab（默认 25/5/15 分钟）+ 圆环进度倒计时 + 开始/暂停/继续/重置 + TA 提示卡（完成随机夸夸字卡）+ 今日 🍅×N·累计统计 + 「设时长」（openModal 三值 25,5,15，各 1-180）+「+ 夸夸字卡」+「发到聊天」开关（默认开，完成专注自动发「🍅 完成了 X 分钟专注…」到聊天）。
  - **计时健壮性**：基于 endAt 时间戳（interval 仅 250ms 刷新显示），离开页面后台照走、锁屏回来时间正确；完成专注后每 4 个自动建议长休否则小憩（不自动开始）；震动 [120,60,120]。
  - **数据键**（按联系人命名空间，LS+IDB 双写）：`pomo-cfg`{f,s,l} / `pomo-today`{date,count 跨日自动归零} / `pomo-total` / `pomo-msgs` / `pomo-send-chat`。
  - **放置逻辑**：沿用喝水/吃什么模式——默认进第三页 p3apps 图标组；已装修且布局不含本组 → 新建一页放整组；布局已含任一同组图标 → p3 默认组。personalize.js WIDGET_IDS/WIDGET_NAMES/WIDGET_PREV_HTML 已加 `app-pomo`（装修模式可挪动）。
  - 验证：`node --check` 通过；verify 10/10；verify-pomodoro 20/20（含 Date.now 跳变模拟完成一个番茄的 E2E：自动切小憩/计数持久化/夸夸文案；三种放置场景；自定义时长）。需真机确认：圆环动画手感、震动、发到聊天的消息气泡样式。
  - ⚠️ 本会话构建时工作区有另一会话进行中改动（piggy/memo/chat/feed/mail 等），期间对方也重建过产物——当前 index.html 已同时包含番茄钟+存钱罐+备忘录三方改动（verify 复跑均绿）。提交前请各方确认对方已保存完整。

### 2026-08-24（用户反馈：荣耀 Power2 Chrome 打开 GitHub Pages「网页崩溃」反复复现）
- [本会话·排查完成]（**只新增诊断工具，未改任何 src 文件，未构建**——index.html/sw.js/version.json 与工作区既有未提交改动保持原样）。涉及新文件：`diag-storage.html`（仓库根目录独立诊断页）+ `tools/diag-memory-stress.mjs` + `tools/diag-memory-where.mjs` + `tools/smoke-diag-storage.mjs`。
  - 现象：荣耀 Power2 Chrome 打开部署链接，「他崩溃了」（Aw Snap=渲染进程崩溃），开屏即崩与使用一段时间后崩均出现；后台保活/竖屏全屏均未开启。
  - 已做检查：① `node tools/verify.mjs` 基线 10/10；② 代码审计——聊天分页渲染（RENDER_MAX=200）、图片上传压缩（720px/JPEG.85）、IDB 分批恢复（每批 8 键）、无整页 zoom/backdrop-filter 滥用、无无限循环模式，均正常；③ **内存压力实测**（无头 Chrome 精确内存）：空数据启动堆驻留仅 ~5MB；写入 48MB 种子数据（2400 条聊天含 300 张 96KB 图 + 160 张表情包）后，**启动回填期瞬时峰值 ~170MB、稳态驻留 ~111MB（放大约 2.2~3.5 倍）**。
  - 结论（高置信）：idbRestore 启动时把 IndexedDB 全部业务键（含所有图片 base64 字符串）拉进 memoryCache 常驻 + 各模块解析副本，数据量大的用户 JS 堆轻松数百 MB；手机端 Chrome 渲染进程堆上限远低于桌面（低配档 256~512MB），叠加图片解码位图 → 渲染进程 OOM 被杀 =「他崩溃了」。开屏崩（回填峰值）与用一会儿崩（逐页加载更多数据+位图）都吻合。
  - 待办（需真机数据确认规模）：用户部署根目录 `diag-storage.html` 后手机打开，看「站点总存储/IndexedDB Top15」并复制报告回传；或告知备份导出文件大小。之后讨论修复方案（候选：A 大值不常驻内存按需异步读；B idbRestore 只回填当前桌面命名空间+切换时增量恢复；C 更激进媒体压缩）。改动会涉及 idb.js（AI-B 域）/chat.js（AI-A 域），需按归属协调。

### 2026-08-24（用户反馈：点「恢复默认桌面布局」后第三页经期小组件消失）
- [AI-B·完成]（**已构建 verify 10/10 + 恢复默认桌面专项 10/10，未提交**）：`src/js/personalize.js`（AI-B 域）+ 构建产物 + `tools/verify-desk-reset-period.mjs`（新专项验证脚本）。
  - **根因**：reset 原 `remove('desk-page-count')` → `buildDeskPages()` 按默认页数 2 收缩 → 静态第三页被整页删除，顶层组件 `desk-period`（经期倒计时卡）与 `p3apps`（图标组）一起移进隐藏池；随后 `ensureP3()`（accounting.js）只负责找回 p3apps，desk-period 留在池里不再显示。平时不丢是因为 desk-page-count=3 已持久化、第三页从不参与收缩。
  - **修复（两道保险）**：① reset 改为 `store.set('desk-page-count','3')`（模板默认就是三页），第三页未被删时 desk-period 原样保留在原位；② ensureP3 之后把仍在隐藏池的 `[data-desk-widget="desk-period"]` 找回第三页、插到 p3apps 之前（模板默认顺序）——覆盖「第三页此前已被用户删掉、组件已在池里」的场景。弹窗文案同步改为「恢复为默认三页」。
  - 未改 accounting.js 的 ensureP3 全局行为（保持「删最后一页组件进池可从组件库找回」语义，也不把 desk-period 变成随切联系人强制复活的粘性组件）。
  - 验证：`node --check` 通过；verify 布局 10/10；`tools/verify-desk-reset-period.mjs` 10/10（正常三页 reset 后组件留在第三页且顺序正确 / count=2 删过页场景 reset 后从池找回 / 第一页 deco 不受影响）。需真机确认一次：装修模式随便挪动后设置→恢复默认桌面，第三页经期倒计时卡应还在。
  - ⚠️ 构建时工作区有未提交改动（chat-settings/bg-keep/idb/chat-pages.css/template.html 及 personalize.js 此前 v3.10.x 外观修复等），构建产物已包含，提交前请确认对方已保存完整。

### 2026-08-24（用户反馈：荣耀200Pro Edge 退出重进后桌面第一页「我+联系人」卡片变白板，背景图和头像每次都要重设）
- [AI-B·完成]（**已构建 verify 10/10 + 新冒烟 verify-desk-visuals-restore 5/5，未提交**）：`src/js/personalize.js`（AI-B 域）+ `src/js/idb.js`（AI-B 域）+ `tools/verify-desk-visuals-restore.mjs`（新冒烟）+ 构建产物。
  - **根因（两个叠加）**：
    1. **显示层**：卡片背景 `card-bg-*`、页面背景 `page-bg-*`、图片组件 `desk-image-src-*` 都是 >200KB 大图键，只存 IndexedDB 不进 localStorage；启动渲染时 idbRestore 回填未完成读到空→白板，而 `mochi-restore-done` 的旧重绘清单里只有头像/壁纸/图标，**没有这三类**——回填完成后界面永远停留在空白。且 `idbGetMany` 无超时保护，安卓 Edge 内核事务挂起时（真我 Edge 同款问题）整条恢复链卡死，12s 保险丝放行后头像也来不及恢复。
    2. **数据层**：`sanitizeBg` 读到超限值直接 `store.remove` 三处全删——卡片背景渲染阈值 500KB，1000px 细节丰富照片压缩产物很容易超，表现为「设置成功、重启后被清掉」，即用户描述的每次都要重新设置。
  - **修复**：
    - personalize.js：① `sanitizeBg` 超限只跳过本次渲染不再删数据（仅超 12MB 硬上限的旧版原图毒数据仍清除）；头像/自定义图标同款防护同步改；② 上传端新增 `compressImageFit`：压缩产物超限自动按 0.75 倍率降边长重压（卡片背景 ≤450KB / 壁纸与页面背景 ≤4.5MB），从源头保证设置的图能持久通过渲染防护；③ 抽出 `applyPageBgs()`；`refreshDeskVisuals()` 统一重应用头像+卡片背景+页面背景+图片组件，挂到 mochi-restore-done、1.8s 延迟兜底、contact-switched；④ 新增 `rescueDeskVisuals()`：首屏关键外观键（双方头像/9 类卡片背景/各页背景）绕过整体恢复进度直接逐键 `idbGet` 回填（自带超时自愈），完成后自动再刷一遍界面。
    - idb.js：`idbGetMany` 加与 `idbGet` 同款 4s+4s 超时保护——4s 未完成对未返回键换新事务重试一次，再 4s 放弃返回部分结果，批次链不再被单个挂起事务卡死。
  - 验证：`node --check` 通过 + verify 10/10 + 冒烟 5/5（无头 Chrome 模拟冷启动：IDB-only 大图卡片背景/页面背景恢复、超阈值存量图不再被删、头像恢复、多次重进数据仍在）。需荣耀200Pro Edge 真机确认：设置背景图+头像→完全退出浏览器→重进，桌面第一页卡片背景与头像应自动恢复。
  - ⚠️ 构建时工作区有未提交的对方改动（chat-settings.js 红米头像修复 / bg-keep.js / template.html 纪念日按钮 / chat-pages.css 等），构建产物已包含，提交前请确认对方已保存完整。

### 2026-08-24（用户反馈：红米12C Edge 聊天设置换头像无反应）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/chat-settings.js`（AI-A 域）+ 构建产物。
  - **真实根因**：对比本 App 已确认在安卓可用的上传（avatar-lib.js bindPoolUpload：**初始化时创建一次、永久挂 body、每次复用**）后发现，聊天设置里所有上传都是「点击时动态创建 input + 立即 click()」。红米/真我等 Android Edge 对这种动态创建的 file input 会**静默忽略合成 click**（不弹系统选择器），所以「更换联系人头像 / 更换我的头像」点了没反应。
  - 修复（全部改为持久化 input，与 avatar-lib 一致）：
    - 头像：`pickHead(cb)` 改为模块级**共用 1 个** `headInput`（init 时创建、挂 body、`left:-9999;1×1;opacity:0`），两个头像按钮靠 `headCb` 回调区分；每次 click 前清 value、click 包 try/catch。
    - 壁纸：`cs-bg-upload` 同样改为持久化 `bgInput`（顺带修复同一区域）。
  - 已知同类隐患（未改）：聊天记录导入 `cs-import-msgs`、字体上传 `cs-font-upload` 也是动态创建——如用户后续反馈再统一处理。
  - 验证：`node --check chat-settings.js` 通过 + verify 10/10。需真机（红米 12C Edge，**新 SW 版本 mochi-mt6vxyi0**）确认：聊天设置 → 联系人头像 / 我的头像能弹系统选择器并成功设置（壁纸上传一并验证）。
  - ⚠️ 构建时工作区有未提交的对方改动（bg-keep.js / personalize.js / chat-pages.css / template.html 等），构建产物含对方改动，提交前请确认对方已保存完整。

### 2026-08-23（用户要求：聊天输入栏新增「批量发送消息」）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/chat.js` + `src/js/chat-settings.js` + `src/css/chat-main.css` + `src/template.html`（均 AI-A 业务域）+ 构建产物。
  - 聊天设置新增「批量发送消息」开关（默认关闭，每联系人独立，存 `cs-batch-send`）。开启后聊天输入栏右侧（图片按钮与发送之间）显示「批量发送」按钮。
  - 面板：可输入文字点「添加」（Enter 也可）成为一条消息；「表情包」复用表情包面板插入模式逐张加入；「图片」多选图片压缩（720px / JPEG .85）每张一条；列表显示序号/缩略图/类型，可单条 ✕ 删除或「清空」；「发送全部」按加入顺序用 addRec 逐条发送（文字/图片/表情包各为一条独立消息）。
  - 交互：切联系人清空队列并同步按钮显隐（开关按联系人独立）；设置开关变化即时刷新按钮（`batch-send-changed` 事件）；点面板外关闭；复用 .poke-card 半框样式，dark.css 自动适配。
  - 验证：`node --check`（chat.js / chat-settings.js 通过）+ verify 10/10。需真机确认：按钮显示、插入文字/表情包/图片、按顺序批量发送。
  - **修复（用户反馈）**：① 点「插入图片」选图后批量面板被误关——部分浏览器（安卓系统文件选择器）选完/取消后向 document 派发 click，触发「点面板外关闭」；加 `batchPicking` 标志，文件选择器打开期间忽略面板外点击关闭（onchange/onblur 恢复）。② 点「插入表情包」表情包面板被遮挡——`emoji-panel` 与 `batch-panel` 同为 `.poke-card` 底部半框（z-index 相同），DOM 靠后的批量面板盖住表情包面板；改为点表情包先收起批量面板再弹表情包面板，选中后自动重新打开批量面板。
  - ⚠️ 构建时工作区有大量未提交的对方改动（garden/period/personalize/calendar/call/ta-ask 等），构建产物可能含对方半成品，提交前请确认对方已保存完整。

### 2026-08-23（用户反馈：Pong 全屏能滑动 + 下方空白 + 没铺满）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/pong.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物。
  - 根因：`.poke-card-scroll` 默认 `max-height:40vh + overflow-y:auto`，全屏时没覆盖 → scroll 只占 40vh 可滚动 + 下方 60vh 空白。
  - 修复：全屏改 flex 撑满布局——panel `padding:0`；scroll `max-height:none; flex:1; overflow:hidden; display:flex`；pong-wrap `flex:1`；canvas-box `flex:1 + flex center`（canvas 居中占满剩余）；bar/score/foot `flex-shrink:0`。不再滚动、无空白。
  - canvas 更大：availH 预留 230→200（UI 紧凑 gap 14→10/padding 减小），canvas 占更多空间。
  - 验证：`node --check` + verify 10/10。需真机确认全屏无滚动无空白、canvas 铺满。

### 2026-08-23（用户反馈：Pong 全屏没铺满 + UI 没放大）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/pong.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物。
  - 全屏 UI 全部放大：顶栏标题 20px、score 34px、难度 select 18px+padding、按钮 48px、foot 16px、倒计时 52px、overlay 标题/按钮放大。canvas 去圆角铺满。
  - fitCanvas 全屏 availW -24→-16 贴边、availH 170→230（UI 放大后预留增加，防 canvas 和 UI 重叠）。
  - 验证：`node --check` + verify 10/10。需真机确认全屏铺满 + UI 放大。

### 2026-08-23（用户反馈：Pong 页面太小不好操作）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/pong.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物。
  - canvas 逻辑高度 H 240→300（比例 5:3→4:3），显示高度增大约 25%，手机触摸区更大好操作。fitCanvas 按新比例自动算高度，全屏也自动适配。
  - 低难度挡板同步加长补偿画布变高：casual paddleH 92→104、easy 84→94（normal/hard 72 不变）。
  - canvas-box max-width 480→560px（平板/桌面更宽，手机已撑满不受限）。
  - 验证：`node --check` + verify 10/10。需真机确认 canvas 更大、操作更顺手。

### 2026-08-23（用户反馈：Pong 休闲档还是赢不了 + 接球表情每次都触发不说话）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/pong.js`（AI-A 域）+ 构建产物。
  - **进一步降难度**：休闲档 AI maxSpeed 2.4→1.7、预测误差 34→48、失误率 0.14→0.24、反应延迟 0.5-0.8→0.8-1.2、放水 0.14→0.24、beh slow/drift/miss 0.12→0.18；简单档 maxSpeed 2.8→2.2、预测误差 26→36、失误率 0.10→0.16、反应延迟 0.38-0.6→0.55-0.85、放水 0.08→0.15。normal/hard 不变。
  - **修表情/说话概率**（用户反馈"每次都触发表情、没有说话"）：原接球表情 100% 每次都冒 + 说话 18% 太低。改：接球表情 40% 概率 + 1.5s 冷却（防高频每次都冒）；得分/失误表情 75% 无冷却（关键事件保留反馈）；说话概率 18%→30%（在表情触发前提下）。tryTaSay 加 emojiProb/cooldownMs 参数，state 加 emojiCooldown 字段。
  - 验证：`node --check` + verify 10/10。需真机试玩确认休闲档能赢、表情不再每次冒、说话能见到。

### 2026-08-23（贪吃蛇三轮：格子放大 20→15 格 + canvas 360px）
- [AI-A·完成]（**已构建 verify 10/10 + snake 冒烟 11/11 + snake 功能 8/8，未提交**）：`src/js/snake-game.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物。
  - 用户反馈格子太小手机端不好玩。改 GRID 20→15，canvas 非全屏 300→360px（每格 24px，原 15px），全屏 480 不变（每格 32px）。
  - 旧存档兼容：20 格旧存档坐标在 15 格下越界，新增 `validCoord/validState` 检查，`loadSaved` 越界则清存档丢弃，`openSnakePanel` 恢复内存 state 也加 `validState` 守卫。初始位置 player x=4 / opp x=GRID-5=10 在 15 格下间距 6 合理。
  - 验证：verify 10/10 + verify-snake-smooth 11/11 + verify-snake-features 8/8。需真机确认格子大小合适。

### 2026-08-23（用户要求：降低联系人邀请玩游戏的概率）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/reply-settings.js` + `src/js/chat.js`（均 AI-A 域）+ 构建产物。
  - 改动：邀请概率默认值降低一半——猜拳邀请 `ai-rps-prob` 15%→8%、游戏邀请 `ai-game-prob` 10%→5%。reply-settings.js DEFAULTS + chat.js tryActiveInvite 里 cfgn fallback + 注释同步更新。
  - 生效范围：未手动调过这两个滑块的用户立即生效（getCfg 对存储 null 的键回退 DEFAULTS）；已手动调过的用户保持其设置不受影响。
  - 验证：`node --check` + verify 10/10。

### 2026-08-23（贪吃蛇二轮优化：dpr/圆角蛇身/粒子/穿墙安全/最高分/结果页/震动/方向锁定）
- [AI-A·完成]（**已构建 verify 10/10 + snake 冒烟 11/11 + snake 功能 8/8，未提交**）：`src/js/snake-game.js` + `src/css/chat-pages.css` + `src/template.html`（贪吃蛇面板锚点，AI-A 业务域）+ 构建产物 + `tools/verify-snake-features.mjs`（新增）。
  - 8 项优化：① **dpr 适配**：canvas 内部分辨率=逻辑尺寸×dpr（限 3），ctx.setTransform，retina 屏蛇身锐利；② **圆角蛇身连续绘制**：粗线段(lineCap/lineJoin=round)连接各节中心消除插值缝隙，头稍大圆+高光，穿墙跨边界断开线段；③ **食物脉动+吃食物粒子+10飘字**：食物呼吸脉动，吃到爆 8 粒子+「+10」上浮淡出；④ **滑动方向锁定**：touchmove 首次超阈值锁定主轴(横/竖)，防斜滑抖动误触；⑤ **触觉震动**：转向 vib(8)/吃食物 vib(12)/死亡 vib([20,40,20])；⑥ **穿墙/安全模式**：顶栏加「墙」「安」toggle 按钮，穿墙撞墙从对面出(wrap 坐标)，安全碰自己身不死(只怕对方身/墙/头碰头)，AI 候选方向适配穿墙，flags 跨局保留；⑦ **最高分+最长蛇记录**：按难度分档存 localStorage，结果页顶显示「🏆 X档：最高 Y 分 · 最长 Z」；⑧ **结果页丰富**：胜负图标(🏆/💔/🤝)+ scale 入场动画 + 「已分享到聊天 ✓」提示。
  - 验证：`node --check` + `node build.mjs` + verify 10/10 + verify-snake-smooth 11/11 + verify-snake-features 8/8（穿墙蛇不死/安全开关/结果图标/分享提示/动画类/最高分元素）。无头 Chrome 无法验证震动/真机手感，需真机确认。
  - ⚠️ 构建时工作区有大量未提交的对方改动（chat.js/chatcard.js/garden.js/mail.js/mobile-adapt.js/personalize.js 等），构建产物可能含对方半成品，提交前请确认对方已保存完整。

### 2026-08-23（用户反馈：贪吃蛇页面不好操作，蛇也不流畅）
- [AI-A·完成]（**已构建 verify 10/10 + snake 冒烟 11/11，未提交**）：`src/js/snake-game.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物 + `tools/verify-snake-smooth.mjs`（新增）。
  - 根因：① 操作笨——`touchend` 才转向一次，手指必须抬起再滑才能转第二次，无法连续转向；② 不流畅——`setTimeout` 调度 + 逻辑/渲染耦合，setTimeout 抖动 → 蛇一顿一顿，normal 起步 220ms（4.5fps）且无插值，格子跳跃感强。
  - 修复①输入：`touchmove` 实时识别方向，阈值 12px，一次滑动可连续多次转向（沿 Z 路径灵敏转向），同方向不重复触发；保留 touchstart/touchend/cancel 清基准；虚拟方向键加大（64→72px 宽、56→64px 高、font 20→22）+ `:active` scale(.9) 触感反馈。
  - 修复②渲染：`requestAnimationFrame` 主循环 + 累积时间步进（最多补 3 步防卡顿追赶）+ 蛇身位置插值（step 前保存 prevBody，render 用 alpha=acc/ti 在 prevBody→body 间线性插值），蛇视觉连续滑动；吃食物时 body 增长、prevBody[i] 缺失则该节不插值（尾巴原地不动，符合吃食物不 pop 语义）；死亡/暂停 alpha=0 对齐整格。
  - 速度调整：easy 280-220→200-140，normal 220-160→150-100，hard 160-100→105-70（配合插值，normal 150ms 视觉非常顺滑）。
  - 全屏 canvas 440→480；`tick` 拆为纯逻辑 `step` + `frame`(rAF) + `render(alpha)`；`startGame`/`resumeGame`/`openSnakePanel`/`togglePause` 启动 rAF 改用 `startFrame()`；`stopLoop`/`endGame` 加 `stopFrame()`；倒计时局部函数改名 `countdownStep` 避免与全局 `step` 同名混淆。
  - 验证：`node --check` + `node build.mjs` + `node tools/verify.mjs` 10/10 + `node tools/verify-snake-smooth.mjs` 11/11（面板打开/倒计时/rAF 跑动/撞墙结束/再来一局/暂停静止/继续恢复）。无头 Chrome 无法验证触摸真机手感，需真机确认：滑动连续转向灵敏、蛇身顺滑无顿挫。
  - ⚠️ 构建时工作区有未提交的对方改动（pong.js/template.html 等），构建产物可能含对方半成品，提交前请确认对方已保存完整。

### 2026-08-23（用户反馈：双人 Pong 难度太高赢不了）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/pong.js` + `src/template.html`（均 AI-A 域）+ 构建产物。
  - **第一轮降难度**：①新增「休闲」档（casual，AI maxSpeed 2.4/预测误差 34/失误率 0.14，比 easy 更松）；②easy 大幅放宽（maxSpeed 3.2→2.8、预测误差 20→26、失误率 0.07→0.10、反应延迟 0.32-0.5→0.38-0.6）；③球速上限 8→6.5；④玩家挡板最大速度 7→8.5（快球也追得上）；⑤默认难度 normal→easy（select 默认选 easy，startGame/resume/newState 回退都改 easy）。
  - **第二轮优化（用户选 4 项）**：
    - ①**低难度加长挡板+大球+3分即胜**：DIFFS 加 paddleH/ballR/winScore 字段，casual 挡板 92/球 8/3 分即胜，easy 84/7/4 分，normal/hard 72/6/5 分。PADDLE_H/BALL_R/WIN_SCORE 常量改从 state.params 读，影响 newState/predictY/opponentAI/movePaddle/checkPaddle/bouncePaddle/step/render/inputY/键盘控制/onScore 全部改用难度专属尺寸。template.html 获胜分提示加 id=pong-win-tip 由 JS 按难度更新。
    - ②**AI 偶尔放水**：DIFFS 加 fumble 字段（casual 0.14/easy 0.08/normal/hard 0），opponentAI 球向 TA 且 30<dist<130 时按概率触发 fumble 行为，故意把 predY 偏离挡板长度 60%-90% 确保接不到，让玩家得分自然不像施舍。复用 behTrigger 冷却系统。
    - ③**击球点颜色教学**：bouncePaddle 存 s.lastHit（-1~1），render 挡板闪光颜色按 |hit| 分级：<0.25 绿/<0.5 黄/<0.75 橙/else 红，教玩家「打中心球更直、打边角角度大」。新增 hitColor() 辅助函数。
    - ④**TA 表情泡泡**：state 加 taBubble={emoji,until}，TA 接球 😊（连击3 😎/连击5 🤩）、TA 得分 😤、玩家得分（TA 失误）😅，render 在 TA 挡板上方画 emoji 18px，1200ms 淡出消散，不挡视线。
  - **第三轮优化（用户选 6 项）**：
    - ⑤**发球前方向预警**：state 加 serveDir 预决定发球方向，serve 用它发球后预决定下次；render 在休闲/简单档 countdown 最后 500ms 或 scored 最后 500ms 在球起点显示 ←/→ 箭头，让玩家有反应时间。loop 改 render(state, ts) 传时间戳。
    - ⑥**战绩记录与展示**：endGame 读写 localStorage `:pong-stats`（每联系人独立），结构 {win,lose,draw,maxStreak,total}，结束面板加「累计 X胜 X负 X平 · 历史最高连得 N」行。
    - ⑦**连击奖励（球速暂停递增）**：state 加 playerRallyHits，bouncePaddle 玩家接球 +1，休闲/简单档玩家连击 >=3 时球速不递增（保持当前速度），鼓励长回合，连击中断（得分）重置。
    - ⑧**接球振动反馈**：bouncePaddle 球碰挡板时 navigator.vibrate(8)，随音效开关联动，困难档关闭。
    - ⑨**结束回应按难度分语气**：POOLS 改按难度分（casual/easy/normal/hard 各一组 player_win/opponent_win/draw），休闲/简单 TA 更宠溺温柔（「让你赢啦」「没事再来一局」），困难 TA 更认真。endGame 按 s.diff 选 pool。
    - ⑩**对局中 TA 偶尔说话**：新增 SAY_POOLS（接球/失误/得分三组）+ tryTaSay() 辅助，TA 接球/失误/得分时 18% 概率冒说话泡泡（与表情 emoji 叠加显示，文字在 emoji 上方），冷却 3 秒避免太吵。taBubble 扩展为 {emoji,text,until}。
  - 效果：休闲档 AI 又慢又蠢常放水+挡板长球大3分即胜+发球预警+连击奖励，新手轻松赢；easy 档真人正常发挥能赢；normal/hard 不变留给挑战。战绩给成就感，TA 说话/表情+按难度语气增加情侣感。
  - 验证：`node --check` + verify 10/10。无头 Chrome 无法验证游戏手感/振动/说话泡泡，需真机试玩确认。
  - ⚠️ 构建时工作区有多个未提交改动（chat.js/chatcard.js/divination.js/mobile-adapt.js/snake-game.js/chat-pages.css/garden.js/mail.js/group-chat.js/personalize.js 等，非本会话所改，疑对方进行中），构建产物已带上，提交前请确认对方已保存完整。

### 2026-08-23（用户反馈：iOS 聊天页点击输入栏，输入法弹窗完全遮住输入栏，无法输入）
- [AI-B·完成]（**已构建 verify 10/10，未提交**）：`src/js/mobile-adapt.js`（AI-B 域）+ 构建产物，含工作区其余未提交改动。
  - 根因：iOS 键盘弹出适配（`syncIosKb`）判定「键盘已开」要 `_open = _focused && _kbStill`，其中 `_focused` 只查 `document.activeElement`。iOS Safari 对 contenteditable（聊天输入栏就是 `#chat-input` contenteditable div）聚焦/编辑时常返回 `activeElement === <body>`，`isTextEl` 判不出 → `_open` 恒为 false → `.phone` 从不收缩 → 键盘（iOS 是 overlay 模式，不收缩布局视口）直接盖住输入栏 =「完全遮住，无法输入」。
  - 修复：新增 `_textFocused` 由 focusin/focusout 可靠上报（focusin 聚焦上报稳定），`syncIosKb` 用 `isTextEl(_textFocused) || isTextEl(document.activeElement)` 复合判断；focusin 时立即同步一次，让 `.phone` 尽早收缩到 vv 高度（输入栏停靠键盘上沿）。
  - **v3.10.x 加强**（用户实测仍被挡住，含问问ta 页面）：iOS 键盘弹出时 visualViewport `resize` 存在漏触发（contenteditable/全屏聊天页），focusin 的一次性补偿也可能与键盘动画错开 → 加**聚焦期间主动轮询**：`startKbWatch` 升级为每 250ms 调用 `syncIosKb`（聚焦文本输入框或键盘未收则续跑），不依赖任何事件，键盘一开就收缩 `.phone`；轮询里顺带 `nudgeInputVisible()` 让内层滚动容器里的输入框（问问ta 问题栏）也停在键盘上方。稳态打字因高度值不变不写 DOM（字符串比对早退），无重排闪屏。
  - 验证：`node --check` + `node build.mjs` + verify 10/10。SW 缓存版本变 `mochi-mt5j4msg`。无头 Chrome 无法模拟 iOS 键盘 overlay，需 iOS Safari 真机确认（**若仍显示旧版请强刷/重开应用**，见下方缓存提示）：聊天输入栏、问问ta 问题栏点开打字，应在键盘上方正常输入，键盘收起后 `.phone` 恢复全高。
  - ⚠️ **缓存提示**：本次 SW 版本已更新，但 iOS Safari 有时需完全关闭网页/应用或强刷一次才加载新 JS；若真机仍是旧表现，请确认已拿到 `mochi-mt5j4msg` 包。

### 2026-08-23（用户反馈：vivo Y35 Edge 刷新/重开/熄屏后界面变小，需手动开全屏才恢复；且手机端被当成 PC 端布局）
- [AI-B·完成]（**已构建 verify 10/10，未提交**）：`src/js/mobile-adapt.js` + `src/css/base.css`（均 AI-B 域）+ 构建产物。
  - 根因：Edge 安卓「桌面站点」模式（或默认请求桌面 UA）把 UA 改成 Windows 桌面、layout viewport 拉到 980px → `matchMedia('(max-width:900px)')` 和 `@media(max-width:900px)` 都不命中 → mobile-adapt.js 直接 return 不启用手机适配，base.css 走桌面模拟器外壳（390px 小框居中 + 两侧灰底）= 用户看到的「变小 / PC 端布局」。手动开全屏加 `fs-css-active` 类让 `.phone` 满屏 → 恢复正常；熄屏/重开类没了 → 又变小。
  - 修复：mobile-adapt.js 顶部加物理特征兜底——触摸屏（maxTouchPoints>0 或 ontouchstart）+ 窄 `screen.width`（<900，设备物理 CSS 宽度，不随 UA/layout viewport 变）→ 判定「手机伪装桌面」，强制 `isMobile=true`。命中后①改 viewport meta 把 layout viewport 拉回 device-width（让 CSS 媒体查询自然命中）；②rAF 后复查媒体查询仍未命中则给 html 加 `force-mobile` 类（meta 被忽略时的 CSS 保底）。base.css 复刻 `@media(max-width:900px)` 块1-6 关键规则到 `html.force-mobile` 选择器（.phone 满屏 + body padding + statusbar + 输入框 16px + touch-action + 聊天贴底 + tap-highlight + 桌面卡片 zoom:1），特异性高于桌面外壳样式。
  - 效果：vivo Y35 永远走手机满屏布局，不需要手动开全屏才恢复正常大小，熄屏/重开也不再变小。全屏开关回归纯「隐藏状态栏」功能。真桌面 PC 无触摸屏不命中；平板 screen.width≥900 或走 isTablet 分支不命中。
  - 验证：`node --check` + verify 10/10。无头 Chrome 无法模拟 Edge 桌面站点 UA 伪装，需 vivo Y35 Edge 真机确认：刷新/重开/熄屏后界面应直接满屏正常，无需手动开全屏。
  - ⚠️ 构建时工作区有 AI-A 进行中改动（period.js/contacts.js 等），构建产物可能含对方半成品，提交前请 AI-A 确认已保存完整。

### 2026-08-23（用户要求：经期记录每个桌面数据互通）
- [AI-A·进行中]（**只改 src，未构建未提交，待构建者统一 build**）。涉及 `src/js/period.js`（AI-A 域）+ `src/js/contacts.js`（AI-B 域，仅 EXCLUDE 加 5 键，请 AI-B 知悉）。
  - 需求：经期记录原按联系人命名空间隔离（`xy-home-v2:<cid>:period-*`），多桌面各自一份。改为所有联系人桌面共用一份全局数据（本人生理数据语义，参照 fish-log / garden-data-global 先例）。
  - **period.js 改动**：① store 由 `activeStore()` 改为 `xyStore('xy-home-v2')` 全局根命名空间；② 4 处 IDB 双写前缀 `window.activePrefix()` 改为固定 `G='xy-home-v2'`；③ restore 块去掉 myPrefix 联系人切换守卫（前缀固定后不会变）；④ 新增 `migrateToGlobal()`：等 `mochi-restore-done`（IDB 回填完）后遍历 `getContacts()`，把各桌面旧 `period-records/cfg/daily/notify` 合并去重写入全局键（records 用 normalize 合并重叠区间、daily 按日期并集合并属性、cfg/notify 取首个有效），清理各桌面旧键，设 `period-migrated` 幂等标记；⑤ 删除 `contact-switched` 重载监听（全局共享后切换联系人无需重载）。
  - **contacts.js 改动**（AI-B 域，仅 EXCLUDE 列表加 5 个字符串）：`period-records`/`period-cfg`/`period-daily`/`period-notify`/`period-migrated`。防 `migrateLegacy` 把全局根键误迁进 default 桌面导致非 default 桌面读到空。这是让全局共享正确工作的必要配套（fish-log 未加 EXCLUDE 靠迁移函数对抗误迁，但经期记录对数据可见性敏感，误迁后读到空会恐慌，故选加 EXCLUDE 彻底避免）。
  - 数据迁移：旧各桌面 `xy-home-v2:<cid>:period-*` 在首次启动 `migrateToGlobal` 时合并到全局 `xy-home-v2:period-*` 并清理旧键，老用户历史不丢。备份导出/导入按 `xy-home-v2:` 前缀遍历，全局键正常包含。
  - 验证：`node --check` 通过。待构建后 `npm run verify` + 多桌面真机确认（桌面A标记经期→切桌面B→经期记录可见且一致）。

### 2026-08-23（用户反馈：iOS Safari 自定义聊天字卡里上传【表情包】/【图片】无反应）
- [AI-B·完成]（**只改 src，未构建未提交，待构建者统一 build**）：`src/js/chatcard.js`（AI-A 域，仅此一次代修，请 AI-A 知悉）。
  - 根因：iOS Safari 下**未挂到 DOM** 的 `<input type=file>.click()` 不弹选择器。chatcard.js 里两处文件选择（①批量导入弹窗中媒体分类上传表情包/图片/语音；②菜单「导入字卡」的 `pickImportFile` JSON 导入）都是 `createElement('input')` 后直接 `input.click()`，input 是 detached，iOS 无反应。
  - 修复：新增公共函数 `pickFiles(accept, multiple, onFiles)`（挂到 body 再 click、onchange 回调、选中/取消后清理、允许重选同一文件），两处改用它。与已正常工作的 avatar-lib.js 头像上传（body.appendChild 后再点）同套路。
  - 验证：`node --check src/js/chatcard.js` 通过。无头 Chrome 无法真机触发 iOS 文件选择器，需 iOS Safari 真机确认：自定义字卡 → 表情包/图片分类 → 右上按钮上传图片应正常弹选择器。

### 2026-08-23（用户反馈：问问TA 管理页选单选题后输入问题/选项，键盘弹起时文字与输入框边框分离）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/ta-ask.js` + `src/css/chat-pages.css`（均 AI-A 域）+ 构建产物。
  - 现象：安卓键盘弹起（viewport interactive-widget=resizes-content 收缩 layout viewport）→ page-ta-ask 重排 → .ta-add 内 ce-box 文字合成层停旧位，框移新位/文字留旧位，表现=「文字不在输入栏里」（问题框、选项框均复现，键盘弹起时才出现）。与 chat-pages.css:1393 注释 v3.7.x 曾修的 translateZ(0):focus 同类，但 :focus 合成层在键盘弹起重排瞬间仍错位。
  - 修复（AI-A 域缓解）：① chat-pages.css `.ta-add .ce-box` 加 `will-change:transform` 常态提示合成层优化；② ta-ask.js IIFE 内监听 visualViewport.resize + window.resize，防抖 120ms，仅 page-ta-ask 可见时对 .ta-add .ce-box 强制 reflow（`void b.offsetHeight`）+ toggle `transform:translateZ(0)` 触发合成层重新提交位置。
  - 无头 Chrome（390×844 mobile）验证：ce-box 创建/文字进入/布局均正常，未破坏；verify 10/10。安卓真机需用户在问问TA管理页→我的添加→单选题→输入实测确认。
  - ⚠️ **需要 AI-B 处理（根因在 mobile-adapt.js 域）**：ce-box 键盘弹起合成层错位是**通用问题**（所有 ce-box 在安卓键盘弹起重排时都可能文字与框分离，不只 .ta-add）。本次只在 AI-A 域缓解了问问TA 的 .ta-add ce-box。建议 AI-B 在 mobile-adapt.js 的 ceConvert 里统一处理：安卓监听 visualViewport.resize/window.resize，键盘弹起后对所有可见 ce-box 强制 reflow + toggle transform 重新合成（可复用本次 ta-ask.js 的 _reflowAskCeBoxes 思路，提到 ceConvert 通用化）。另外 ceConvert 112 行 `box.className='ce-box '+(inp.className||'')` 会把 ce-ghost 类也复制到 ce-box（box 变 `ce-box ce-ghost`），当前因 `input.ce-ghost,textarea.ce-ghost` 选择器不匹配 div 无视觉副作用，但属代码异味，建议 AI-B 顺手修为 `box.className='ce-box '+((inp.className||'').replace(/(^|\s)ce-ghost(\s|$)/g,'$1').trim())`。

### 2026-08-23（用户反馈：聊天默认字卡页无法下滑，一次只能看一张字卡）
- [AI-A·完成]（**只改 src，未构建未提交，待构建者统一 build**）：`src/css/chat-pages.css`（AI-A 域）。
  - 定位：`#page-default-cards` 顶部设置区（dc-toggle + 两组 set-group + 标签 + dc-tabs + dc-groups-bar + card-search）占用极高，把 `#dc-list` 挤到只够 1 张卡；且该页被 v3.9 的 `#page-default-cards{overflow:hidden}` 锁定，头部溢出即无法下滑。
  - 修复：`#page-default-cards{overflow-y:auto}`（恢复整页滚动，头部过高时可滚下去）+ `#dc-list{min-height:40vh}`（列表保底高度，始终有足够空间内部下滑浏览字卡）。仅动本页专属选择器，不影响自定义字卡/情绪字卡等其他页面。

### 2026-08-23（用户要求：朋友圈头像/昵称可独立于聊天设置 + 新增朋友圈好友列表）
- [AI-A·完成]（**只改 src，未构建未提交，待 AI-B 统一 build**）。涉及 `src/js/feed.js`（AI-A 域）、`src/template.html`（feed 页+新增页）、`src/css/chat-pages.css`（好友列表样式）。
  - 新增我的朋友圈独立身份键（按桌面存于桌面 store）：`feed-user-name` / `feed-user-avatar`，未设置时回退聊天昵称/头像（`lbl-user`/`avatar-user`）。主朋友圈封面/动态列表/点赞/发布/全部朋友圈页已统一改用该身份（含回退）。
  - 联系人TA朋友圈身份沿用已有 `feed-ta-name` / `feed-ta-avatar`（按桌面独立）。
  - 新增页面 `page-feed-friends`（朋友圈好友列表）：朋友圈顶部加好友按钮进入；列出「我（当前桌面）」+ 各联系人，每行显示**桌面头像+桌面昵称**，并有「朋友圈头像/朋友圈昵称」两个按钮可独立设置（me 写 activeStore 的 feed-user-*，联系人写 storeFor(cid) 的 feed-ta-*）。返回后刷新列表。
  - 说明：沿用 `window.getContacts` / `window.storeFor` / `window.activeStore` / `window.openModal`；未新增构建顺序配置（仅改已有文件）。

### 2026-08-22（用户要求「排查避免再出现 iOS 闪屏」——全面排查高频事件 DOM 写入路径）
- [AI-B·完成]（**已构建，未提交**）：`src/js/chat.js`（**AI-A 域越界代修 1 处**，请 AI-A 知悉）+ 构建产物。在 8fd0699（mobile-adapt 主输入栏三条闪屏路径已修）基础上排查其余高频事件 DOM 写入路径：
  - **排查结论**（仅 1 处需修，其余无风险）：
    1. `chat.js startAskKbRefresh`（半框输入合成层重建，4176-4184）——**有闪屏风险，已修**：`vv.scroll` 监听 refresh，打字时 caret 微滚高频触发 → 160ms 防抖强制 reflow（`void box.offsetHeight`）→ 半框输入（问问TA/邀请/查岗）打字周期性闪屏/卡顿，与主输入栏 syncIosKb 同病。合成层错位只由键盘开合（resize）驱动，scroll 无需处理 → **去掉 `vv.scroll` 监听，只保留 `vv.resize`**。
    2. `chat.js:985` 就地作答 input handler — 只写 `inplaceDrafts[idx]`（JS 对象不写 DOM），无风险。
    3. `chat.js:1202` body scroll — passive，只读 scrollTop 加载更多消息，无风险。
    4. 主输入栏 `#chat-input` keydown — 只处理 Enter 发送，打字每字不触发，无风险；且未绑 input 事件，打字时无 JS DOM 写入。
    5. `mobile-adapt.js:179` compositionend — 安卓 ce-box 专用，iOS 不进转换器（isIOS 时跳过），无风险。
    6. `desktop-slider/pong/calendar` 等 scroll/resize — 非聊天输入场景，无风险。
  - 注：chat.js 改动仅删 `vv.addEventListener('scroll', refresh)` 及对应 removeEventListener，逻辑等价于"半框输入合成层重建只由键盘 resize 驱动"。iOS 真机需用户在 15pro 半框输入（问问TA）打字实测确认。

### 2026-08-22（已摸鱼天数改全局累计：跨所有联系人按自然日去重）
- [AI-B·完成]（**已改 src + 构建产物，verify 10/10 通过，未提交**）：`src/js/personalize.js`（AI-B 域）+ 构建产物。
  - 需求：用户反馈"桌面组件已摸鱼天数一直是第一天"（OPPO Edge）。fish-log 原按联系人命名空间隔离（xy-home-v2:<cid>:fish-log），多联系人下每个桌面只显示各自天数，与"用了多少天"心智不符。
  - 改动：fish-log 改为全局键 xy-home-v2:fish-log（gStore=xyStore('xy-home-v2')），所有联系人共享。getFishLog/logFish/兼容旧数据补记均改用 gStore。
  - 迁移 migrateFishLogGlobal：遍历 getContacts() 把各联系人命名空间下旧 fish-log 合并到全局（Set 去重+sort）。模块加载时跑一次（合并 LS 已有，不设标记），mochi-restore-done 后跑一次（设 fish-log-global-migrated 标记，合并 IDB 回填）。旧联系人命名空间 fish-log 保留不删。
  - 影响范围：仅"已摸鱼天数"显示（#fish-days）+ 打卡 toast。摸鱼值/工作值（fish-total/day-fish-*）仍按联系人隔离。
  - ⚠️ 若改完仍"一直是 1"，根因是写入持久化问题，需导出备份看 fish-log 实际值进一步排查。

### 2026-08-22（音乐听歌记录：我的听歌 / TA 邀请听歌 分开记）
- [本会话·完成]（**已构建 verify 10/10 + 听歌分离 14/14 + 封面 8/8 + 无种子 5/5 + 过滤 15/15，未提交**）：`src/js/music-player.js` + `src/css/chat-pages.css`（均 AI-A 域）+ `tools/verify-music-history-split.mjs`（新冒烟）+ 构建产物。未改 template.html/sw.js/build.mjs。
  - 需求：原"梦角邀请听歌记录"把用户自己点击听歌也记进去了（`playTrack()` 末尾 `addRecord(m.id, '')` 写入同一 `music-history`），和 TA 邀请/切歌/换模式混在一起。要求分开记。
  - **数据分离**：新增 `myHistory` 数组 + 键 `music-my-history`（我的听歌，自己点击播放）；`history`（`music-history`）保留为 TA 邀请听歌记录（邀请接受/拒绝/切歌/随机/换模式）。`playTrack` 里 `addRecord(m.id,'')` → 新增 `addMyRecord(m.id)` 写 myHistory。
  - **旧数据迁移**（loadAll 内联，幂等）：`music-history` 里 `triggerType==='' && !mode && !rejected` 的记录是旧版残留的"我的点歌"，一次性迁到 `music-my-history` 并从 `music-history` 删除，老用户历史不丢且自动分开。迁移后双键各 save 一次。
  - **UI 二级子 tab**（不动 template.html，JS 注入到 `#music-his-list` 顶部）：「我的听歌」/「TA 邀请听歌」，默认 `ta`（与原 tab 名"梦角邀请听歌记录"语义一致，分开后该列表只剩 TA 邀请相关，不再被自己的点歌污染）；点子 tab 切 `hisSubTab` 并重渲染。空态分别「还没有听歌记录，你播放过的歌会记在这里」/「还没有梦角邀请听歌记录，TA 邀请你一起听歌的记录会出现在这里」。
  - **跨桌面合并**：`mergeDesksMusic` 同步加 `music-my-history` 按 id 去重合并（与 music-history 同模式）。
  - **渲染重构**：原 `renderHistory` 内联的逐条渲染抽成 `renderHistoryItem(x)`（我的/TA 共用，封面回查/冗余 cover/mode 图标逻辑不变），`renderHistory` 改为按 `hisSubTab` 选数据源 + 顶部注入子 tab 条 + 绑子 tab 点击。
  - CSS：`.sm-his-subtabs`/`.sm-his-subtab`/`.sm-his-subtab.sel`（复用 `.fav-tab.sel` 配色风格）。
  - ⚠️ 不依赖对方文件，AI-A 自闭环。构建含工作区累积改动，提交时确认对方已保存完整。

### 2026-08-22（花园全球园：真合并所有联系人花园数据，可继续种植/收获）
- [AI-A·完成]（**已改 src，`node --check` 通过，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：`src/js/garden.js` + `src/css/garden.css`（均 AI-A 域，garden.css 为花园专属样式）。未改 template.html/sw.js/build.mjs。
  - 需求：用户要把所有联系人（桌面）的花园数据真合并保存成一份，可在合并花园里继续种植/收获/送花。原各联系人花园数据保留不动。
  - 实现：花园页 header 注入「🌐 全部」按钮（`garden-ov-btn`），点击切到全球园模式（`isGlobal=true`）；再点「← 返回本桌」切回。全球园模式时显示「🔄 重新合并」按钮（绿色，`garden-remerge-btn`），点击弹确认后从所有联系人当前数据重新合并覆盖全球园。
  - 数据存储：全局 store `gs = window.xyStore('xy-home-v2')`，键 `garden-data-global`（根命名空间，不随联系人切换）。`curStore()/curKey()/curIdbKey()` 按 isGlobal 切换本桌/全球园数据源。`save/load` 统一走这组函数，本桌逻辑不变。
  - 首次合并：`toggleGlobal` 切到全球园时若 `garden-data-global` 不存在，调 `mergeAllToGlobal()`（遍历 `getContacts()`，每个 cid 用 `storeFor(cid).get('garden-data')` 读 LS，空则 `idbGet` 兜底）合并生成：地块收集所有联系人非空地块（`by` 字段标注 `原种植者@联系人名`，上限36块，超出转库存）、经验/统计/图鉴/库存/装饰求和、日志合并标注 `@联系人名`（保留最近100条）、访客取最近有效。合并后 `save` 写入 `garden-data-global`。
  - 地块动态扩容：所有 `PLOTS` 引用（除 load 补齐和声明）改成 `data.p.length`，本桌仍 12 块，全球园按合并后地块数（12~36）。
  - 可操作：全球园模式下种植/浇水/施肥/收获/花束/装饰商店全正常工作，写入 `garden-data-global`。地块来源标注（`.garden-plant-src`）显示该花来自哪个联系人。
  - 切换处理：`openGarden` 进页时若 isGlobal 自动切回本桌；`contact-switched` 时若在全球园模式自动切回本桌（全球园是跨联系人的，切联系人应回本桌）。
  - ⚠️ 不动 template.html（AI-B 域），新 DOM（按钮）全 JS 注入到现有 header。不依赖对方文件。原各联系人 `garden-data` 永不修改，安全可逆。

### 2026-08-22（经期功能增强：动态周期/置信区间/每日属性/症状统计/通知/趋势图/倒计时）
- [AI-A·完成]（**已改 src，`node --check` 通过，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：`src/js/period.js` + `src/css/chat-pages.css`（均 AI-A 域）。未改 template.html/sw.js/build.mjs。
  - **方案1 动态周期**：`cycleStats()` 取最近 6 次实际周期中位数+标准差σ+CV；`effCycleLen()` n≥3 用中位数否则回退 cfg.cycleLen；`effLuteal()` 若 daily 标记排卵症状则反推黄体期；`regularity()` CV<0.1 很规律/0.1-0.2 较规律/>0.2 不规律，状态卡显示徽章；预测标题带「（±σ 天）」。
  - **方案3 置信区间**：`predictConfidence(ds)` 高斯衰减 exp(-offset²/2σ²)；renderGrid 预测日格加 `.band` + `--conf` CSS 变量，背景透明度按置信度渐变（中心深边缘浅）；数据不足（n<3 或 σ<0.5）回退原虚线框。
  - **方案10 倒计时卡**：状态卡顶部插入圆环 SVG（stroke-dasharray 按 dayOfCycle/cycleLen 进度）+ 大数字（经期中显示「第N天」/非经期显示「N天后」）。
  - **方案4 每日属性**：新增 KEY_DAILY 存 `{date:{flow,symptoms,mood,note,temp}}`，localStorage+IDB 双写；日格长按 500ms / 右键打开底部浮层（经量4档/症状11项多选/体温/情绪滑块/备注）；浮层手动加 `body.scroll-lock`（复用 mobile-adapt 类名，未改 mobile-adapt）；日格右下角标记点（经量色点/症状橙点/备注绿点）。
  - **方案5 症状统计**：历史卡后插入统计卡，TOP3 文字 + 频次柱状图（前8项，渐变填充条）。
  - **方案9 趋势图**：近12次周期长度 SVG 折线 + 均值虚线 + 均值标注。
  - **方案6 本地通知**：新增 KEY_NOTIFY 存 `{enabled,advanceDays,hour,fired}`；cog 旁加铃铛按钮（JS 创建不改 template）打开设置浮层（开关/提前天数多选/小时）；`checkNotify()` 在进页面/标记开始/启动3s后检查，经期预测前3/1/当天 + 延迟≥5天预警；通知走 `reg.showNotification` 优先 SW、回退 `new Notification`（未改 sw.js，后台通知依赖现有 SW）；**无任何孕期/备孕/排卵提醒**（按用户要求）。
  - **数据回填**：restore 块扩展 KEY_DAILY/KEY_NOTIFY 的 IDB 回填。
  - 验证：`node --check src/js/period.js` 通过；未构建未 verify，需构建后 `npm run verify` + 真机确认（长按日格弹浮层、置信带渐变、倒计时环、通知设置）。
  - **续修（用户反馈「不能自己设定天数 + 设定完无法预测」）**：① cog 设置从 `28,5,14` 逗号输入改为可视化 stepper 浮层（周期/经期/黄体期分别 ± 设定，含排卵日实时预览 + 说明文案）；② 浮层加「上次经期开始日」日期输入——填了即生成一条记录作为预测起点（解决只设参数没起点导致「暂无记录」无法预测）；③ `dayPhase` 增加排卵期着色（浅橙 .ph-fertile，排卵日前5天到后1天），日历可看到预测排卵期；④ JS 动态补「排卵期」图例项（未改 template）。`node --check` 通过。
  - ⚠️ 构建前请确认工作区无对方进行中改动；本次构建请统一包含工作区已保存改动。template.html 有对方未提交改动，本次未碰。

### 2026-08-21（续：每日摸鱼值/工作值也迁日历按天查看）
- [本会话·完成]（**已构建 verify 10/10 + verify-cal-notes 19/19，待提交**）：`src/js/calendar.js`（AI-A 域）+ `src/template.html`（AI-B 域，日历卡片）+ `tools/verify-cal-notes.mjs`（补 4 条用例）。
  - **日历页新增第 4 张每日卡片「摸鱼值 · 工作值」**（#cal-stats，我的心情卡之后）：按选中日期显示双方当天摸鱼/工作值。
  - **读取逻辑**：今天读实时键 `day-fish-<key>`/`day-fish-ta-<key>`/`day-work-<key>`/`day-work-ta-<key>`（与桌面周末面板一致）；历史日期读 `fish-day-add`/`work-day-add` 按天记录。⚠️ **fishDayKey 日期格式是 `YYYY-M-D` 无补零**（与日历 selDate 的 `YYYY-MM-DD` 不同），匹配前先归一化（padStart 补零）。
  - **主页「每日摸鱼值/每日打工值」两个 tab 保留**（用户确认——它们有历史累计统计，日历按天看替代不了）；本轮不动 records.js。
  - ⚠️ 构建已含工作区 AI-A 未提交累积改动，提交时确认对方已保存完整。

### 2026-08-22（用户反馈「苹果15pro Safari 加桌面后打字一直闪屏、点一下闪一下；调字卡卡住」）
- [AI-B·完成]（**已构建 verify 8/10，未提交**）：`src/js/mobile-adapt.js`。在 db91f6b（限 pinScrollTop 500ms 窗口）基础上进一步堵三条 PWA standalone 闪屏路径：
  - 根因：① `vv.scroll` 事件打字时高频触发 syncIosKb（caret 微滚），稳态期反复读高度/比较/DOM 写入 → 打字卡顿 + reflow 闪屏；② `focusout` 点击字卡/按钮时焦点短暂离开输入框但键盘未必收，syncIosKb 靠 `_focused` 判定误 restore → _phone 收缩↔回落 reflow → "点一下闪一下"（standalone 下 .phone 100vh 与 vv.height 差整个键盘高度，跳最剧烈）；③ `_kbWatch` 自愈用 `innerHeight - vv.height <= 80`，standalone 下 innerHeight 含系统状态栏，无键盘时差值可能 > 80 误判 → 周期 restore 闪。
  - 修复：① `vv.scroll` 独立走 `onIosKbScroll`——只在 `_pinUntil` 窗口内 pinScrollTop，稳态打字完全 no-op；键盘开合判定只交给 `vv.resize`。② syncIosKb 稳态早退：`_kbActive && _focused && _kbStill && 过 _pinUntil` 时只保 height 直接 return。③ 键盘是否仍开改用 `_kbStill = _h < _noKbH - 60`（按可视高度不靠焦点），restore 条件改 `!_kbStill`。④ `_kbWatch` 自愈改用 `_vv.height >= _noKbH - 60`，不依赖 innerHeight/焦点。⑤ `focusout` 400ms 兜底改按 `vv.height` 判定。
  - 注：仅改 iOS 块（isIOS 内），非 iOS/无头 verify 不受影响（stash 本改动后 verify 仍 8/10，确认 360x640 FAIL 是对方 fullscreen.js 改动导致）。verify 8/10 的两个"聊天输入栏贴底"失败需 AI-A 排查 chat.js 域。iOS 真机需用户在 15pro Safari + 加桌面实测确认。

### 2026-08-22（用户反馈「红米K90ProMax 雨见浏览器全屏后上下滑动变成音量/亮度调节」）
- [AI-B·完成]（**已构建 verify 8/10，待提交**）：`src/js/fullscreen.js`（AI-B 域）+ `src/template.html`（AI-B 域，设置页+聊天设置页开关）+ `src/js/chat-settings.js`（**AI-A 域越界**，加 cs-edge-guard 镜像同步，照抄 cs-fullscreen 模式，请 AI-A 知悉）+ 构建产物。
  - 根因：雨见浏览器（及 UC/QQ/百度等）全屏下自带"边缘手势"——左右边缘上下滑调音量/亮度，是浏览器应用层手势，网页 `preventDefault` 拦不住。小米自带浏览器无此功能故正常。非本项目代码 bug。
  - 方案（用户选 D 纯手动开关，不做 UA 检测）：设置页 + 聊天设置页各加「全屏边缘防误触」开关 `sf-edge-guard`/`cs-edge-guard`（镜像同步）。开启后全屏激活时挂左右边缘 24px 透明拦截层（`touch-action:none` 吃掉边缘触摸）+ touchstart capture 兜底 preventDefault；退出全屏或关开关时移除。开关开启弹一次性说明（明示对系统级手势可能无效，最可靠是浏览器设置关闭）。
  - 持久化键 `fs-edge-guard`；拦截层 z-index 99999，仅边缘 24px 不影响中央交互。MutationObserver 监听 documentElement class 变化（fs-active/fs-css-active/ios-fs-active）同步启停。
  - ⚠️ verify 8/10 的两个 FAIL（聊天输入栏贴底 748vs844 / 544vs640）是工作区既有问题（stash 本次改动后仍 8/10），与本次无关，**需 AI-A 排查 chat.js 域**。
  - ⚠️ 构建含工作区累积改动（chat/feed/mail/contacts/personalize 等 17 文件），提交时确认对方已保存完整。

### 2026-08-22（用户反馈「苹果14 默认浏览器聊天输入栏每打一个字屏幕闪一下」）
- [AI-B·完成]（**已构建 verify 10/10，已提交 db91f6b 并推送上线**）：`src/js/mobile-adapt.js`。
  - 根因：iOS Safari 上 #chat-input 是 contenteditable div，打字时每字触发 visualViewport resize/scroll → syncIosKb 无条件 pinScrollTop() → scrollTo(0,0) 与系统让 caret 可见的微滚打架，每打一字整页跳一次 = 闪屏。
  - 修复：pinScrollTop 限键盘开合动画窗口（500ms）内执行（_pinUntil 时间戳），稳态打字不再 pin；.phone height 更新保留（值不变不重排）。键盘动画期防灰底露出逻辑不变。
  - 注：mobile-adapt.js 源改动随 6c3e45e 入库，本次 db91f6b 为构建产物上线 + data-backup.js 备份导入前缀检测/确认弹窗增强；本地原领先 origin 9 提交，push 后线上获得修复。

### 2026-08-21（用户需求「桌面小组件每日内容（今日情话/备忘/心情）迁到日历按天查看，主页记录 tab 删掉」）
- [本会话·完成]（**已构建 verify 10/10 + 新冒烟 verify-cal-notes 15/15 + 旧日历回归 smoke-cal-select 15/15，待提交**）：`src/js/calendar.js`（AI-A 域）+ `src/js/records.js`（AI-A 域）+ `src/template.html`（AI-B 域，日历卡片 + 主页 tab + licence 说明）+ `tools/verify-cal-notes.mjs`（新冒烟脚本）。
  - **日历页新增三张只读卡片**（「我的留言」卡之后）：TA 的情话 / 我的备忘 / 我的心情，按选中日期切换查看：
    - 情话读 `quote-history` 按 `date` 字段匹配（桌面 personalize.js renderQuoteOfDay 每天存档），当天无存档时兜底 `getQuoteOfDay()`；
    - 备忘读 `memo-YYYY-MM-DD`、心情读 `today-mood-YYYY-MM-DD` 快照，老数据回退历史列表按 ts 当天过滤（与 p2-features 本周日常同逻辑）；
    - 未来日期统一空态「这一天还没有内容」；无记录空态「这一天没有留下情话/没有备忘/没有记录心情」。
  - **主页移除三个记录 tab**：`联系人今日情话 / 我的今日备忘 / 我的今天的心情`（fav-tab + data-hpanel + records.js 渲染分支 + htab 默认改 av），主页剩换头像/通话/摸鱼/打工 4 个 tab；「本周日常」弹窗保留（用户确认）。
  - **桌面小组件保留**（用户确认）：编辑仍走桌面卡片；历史查看统一以日历按天切换为入口。
  - licence 说明同步：主页统计去掉三项、日历区块补充按天查看说明。
  - ⚠️ 注意：**calendar.js 新增的 renderDayNotes(dd, isFuture) 必须接收 render() 的局部变量作参数**（dd/isFuture 是 render 局部，闭包在 IIFE 顶层引用不到，否则 ReferenceError 中断渲染——首版踩坑）。
  - ⚠️ 本次构建包含工作区 AI-A 未提交累积改动（chatcard/feed/mail/chat + 产物），提交时确认对方已保存完整。

### 2026-08-21（用户需求「回复设置里查岗概率设置：设成真的情侣查岗问题，不是拿已有卡片互动」）
- [本会话·完成]（**已构建 verify 10/10 + 查岗专项 18/18，待提交**）：`src/js/ck-question.js`（完成上一轮遗留的半成品：题库重写 + 接线）+ `src/js/chat.js`（AI-A 域透传 + 挂载）+ `build.mjs`（AI-B 域 jsFiles）+ `tools/verify-ck-question.mjs`（新回归脚本）+ 构建产物。
  - **题库重写（按用户世界观：字卡网站随机出卡 / 梦角灵体两世界 / 甜蜜安稳亲密，不写危机纠错）**：10 道单选（你在干嘛/在哪里/和谁在一起/吃饭没/想我没/睡了没/手机电量/有没有感觉到我(两世界体感)/穿什么颜色/是不是偷偷难过，各 3~5 个选项 + TA 预设回应多条随机）+ 7 道文字题（今天过得怎么样/发一句看到的/十秒内回表情/猜我在干什么/最想做什么/开心小事/如果我在你身边你想做什么）。题目句子简短自然，像字卡网站会出的卡。
  - **接线补全**（上一轮只写了文件没接入构建/链路，功能是死代码）：① build.mjs jsFiles 加 `'ck-question.js'`（ta-ask.js 之后）；② **chat.js chatAddSystem/addIn 透传 askOptions/askType**（此前漏透传 → 单选查岗卡/TA 询问卡选项数据丢失，点开永远走文字输入；ta-ask 与 ck-question 两条链路同受影响，本次一并修复）；③ chat.js tryAutoSend 在 tryActiveInvite 后挂 `window.ckQuestionTry(c)`（命中占用本轮主动消息）。
  - **验证**：verify-ck-question.mjs 18/18——模块加载/提示语/单选卡渲染（选项提示）/点卡展开 5 选项/就地点选作答（✓已回答+TA 回应）/我的回答 out 消息/文字题卡+输入框+作答/自动弹窗 pills 作答/刷新后 answered 持久化/聊天记录 askType+askOptions 持久化（透传修复直接证据）/刷新后新卡选项正常/开关关闭不触发/冷却期不触发/默认值 15/30/70/设置页面板完整。verify 布局 10/10。
  - ⚠️ 提交含对方累积改动：idb.js（AI-B 的 IDB 超时 8+8→4+4 修复，完整）+ garden.js（AI-A 的装饰增益 buff：生长/经验/梦角常来/自动保水，完整）；`tools/diag-ta-ask-single-input.mjs` 仍未跟踪待对方确认。

### 2026-08-21（用户反馈「群聊里我的气泡和文字都是黑色，发送的消息看不见」）
- [本会话·完成]（**已构建 verify 10/10 + 美化回归 26/26 + 形象回归 22/22 + 群聊冒烟 20/20，待推送**）：`src/js/group-chat.js`（AI-A 域）+ `src/css/group-chat.css`（AI-A 域）+ `tools/verify-gc-beauty.mjs`（补 4 条保护用例）+ 构建产物。
  - **排查结论**：无头 Chrome 实测本地新构建在浅色/深色/默认/自定义聊天色等场景下群聊 out 气泡均为黑底**白字**（`--msg-out-ink: #ffffff`）；旧版线上（origin/main）聊天设置默认也是白字（`cs-out-ink || '#ffffff'`）。默认状态下群聊不可能黑底黑字。黑底黑字只可能来自两条路径：① 用户在**群聊美化**里把「我的消息文字颜色」选成色板第一格「默认黑 #111111」（默认黑气泡 + 默认黑文字 = 完全看不见；群聊颜色已独立，聊天不受影响，正符合用户描述）；② 旧版群聊继承聊天页根变量（用户若在聊天设置自定义过文字颜色会连带），本地新版已用 page 级变量隔离修复。
  - **修复**：
    1. **颜色对比度保护**（防黑底黑字）：`gcColorLum/gcContrast` 按 WCAG 亮度算对比度（`GC_MIN_CONTRAST=2.2`）；`pickGcColor` 应用颜色后若文字/气泡对对比度过低 → **自动回滚到原色 + toast「已恢复：该颜色与气泡太接近，消息会看不清」**。仅 UI 路径保护（API `groupChatBeautySet` 不受影响，供测试/旧数据）。
    2. **存量低对比度警告行**：`renderBeautyView` 气泡与文字分组下，若我的/联系人气泡与文字同色系（`gcColorPairBad`），显示红字警告「⚠️ 我的气泡：文字与气泡颜色太接近，消息可能看不清，建议改深/改浅」（`.gc-set-warn` 样式）。
    3. **色板标签修正**：文字颜色色板第一格「默认黑」改为「黑色」（`gcInkSwatches()`），避免「默认」二字误导（文字色默认其实是白色）。
  - **验证**：`tools/verify-gc-beauty.mjs` 26/26（新增：色板弹窗打开 → 点第一格黑色 → 确定 → out-ink 自动回滚 #ffffff + toast 含「已恢复」；API 设黑字 → 警告行出现）。回归全绿：形象 22/22、冒烟 20/20、verify 10/10。
  - ⚠️ 对方注意：① 保护只做在群聊美化 UI 路径（pickGcColor），聊天设置的 `bindBubbleColorRow`（chat-settings.js，AI-A 域）存在同样的「默认黑」误导，如需同样保护请在聊天设置侧同步；② 本次构建包含对方累积改动（base.css/chat-main.css/chat.js/garden/mail/reply-settings/mobile-adapt/template/verify-mail-send-reply 等）与产物；`src/js/ck-question.js` 未跟踪未加入构建（jsFiles 未含），若为进行中功能请知悉；`tools/diag-ta-ask-single-input.mjs` 仍未跟踪待确认。

### 2026-08-21（用户需求「群聊右上角设置里需要美化聊天设置，就和聊天设置里的一样」）
- [本会话·完成]（**已构建 verify 10/10 + 新回归 22/22 + 旧形象回归 22/22 + 旧群聊冒烟 20/20，未推送**）：`src/js/group-chat.js`（AI-A 域，已包含上一项群聊形象功能；本轮新增群聊美化）+ `src/css/group-chat.css`（AI-A 域，新增美化行样式 + 群聊时间轴作用域规则）+ `src/js/contacts.js`（**AI-B 域代改 1 行**：EXCLUDE 加 `'gc-beauty'`）+ `tools/verify-gc-beauty.mjs`（新回归脚本）。
  - **入口**：群聊设置面板主视图（我的群聊/成员群聊形象之后）新增「美化聊天」入口行（闪光图标 + 副行说明「气泡颜色、壁纸、字体、时间轴样式等」+ 右 chevron）；点击进入美化子视图（标题切到「美化聊天」，面板头动态切换），首行「‹ 返回群聊设置」回主视图。
  - **美化行（与聊天设置 cs-* 一一对应）**：壁纸（上传/清空）/ 我的气泡颜色 / 我的消息文字颜色 / 联系人气泡颜色 / 联系人消息文字颜色 / 发送按钮显示·隐藏 / 发送按钮颜色 / 发送文字颜色 / 聊天气泡字体大小（pills）/ 聊天气泡框大小（openTCPanel 预设+自定义）/ 聊天头像形状（pills）/ 时间轴样式（pills）/ 群聊字体（openTCPanel 上传/名字）/ 气泡 CSS（openTCPanel 文本框）；值显示「默认 #色值」/「标准」/「未设置」等与聊天设置一致。
  - **交互复用**：颜色用 `openModal({colorPicker, color, swatches})` 同 BUBBLE_BG/INK/SEND 色板；pills 用 `openModal({pills, pill, noInput})`；气泡框大小/字体/气泡CSS 用 `openTCPanel`；头像上传/清空/应用按钮与聊天设置按钮同 id 模式。所有 toast 提示中文短句。
  - **存储**：全局 `xy-home-v2:gc-beauty` = JSON `{out-bg,out-ink,in-bg,in-ink,send-bg,send-ink,send-show,font-size,bubble-size,av-shape,time-style,bg,font,css}`，与上一项 `gc-profiles` 同机制（走 `xyStore(G)` 三写、idbRestore 回填）；`contacts.js` EXCLUDE 加 `'gc-beauty'` 防 migrateLegacy 误迁进 default 桌面（AI-B 域代改 1 行）。只存非默认值，空/默认值删除键保持存储干净。
  - **作用域隔离**（关键设计）：所有 CSS 变量在 `#page-group-chat` 元素上 `style.setProperty`（局部覆盖），不污染聊天页读 `documentElement` 的同名变量；壁纸/字体/自定义 CSS 同样作用域到 `#page-group-chat`。时间轴样式用 page 级 `cs-time-*` 类（不复用 body 级类，避免与聊天页 cs-time-* 冲突），并对默认 `under-av` 加还原规则，完整隔离聊天页 body 级类对群聊的泄漏。
  - **气泡 CSS 选择器自动作用域**：用户输入的 `.msg-out{...}` / `.message-sent{...}` / `.bubble-self{...}` 等映射到 `#page-group-chat .msg-out .msg-bubble` 等；无选择器的纯声明自动包装到群聊页双方气泡。
  - **API**：`window.groupChatBeautyGet(k)` / `window.groupChatBeautySet(k,v)` 暴露给回归测试和未来外部调用；与上一项 `groupChatProfileGet/Set` 同一风格。
  - **验证**：`tools/verify-gc-beauty.mjs` 22/22 — 美化入口/子视图标题切换/返回行/14 个美化行/5 个分组（壁纸/气泡与文字/发送按钮/气泡外观/字体与样式）/ CSS 变量在 #page-group-chat 而非 root（隔离证据：root 变量保持原值不变）/ 字体大小/气泡框/头像形状/发送按钮隐藏/时间轴 hidden 类已挂/壁纸背景图/气泡 CSS 作用域正确/重置回默认（值+存储 key 同步清理）/ 持久化根命名空间 + 迁移排除/刷新后仍生效/无 JS 异常；旧 `verify-gc-profile-settings.mjs` 22/22（主视图行数变 3，me/member/美化入口，不影响既有断言）；旧 `smoke-group-chat.mjs` 20/20；verify 布局 10/10。
  - ⚠️ 对方注意：① `contacts.js` EXCLUDE 加了 `'gc-beauty'`（AI-B 域代改 1 行），与上一项 `'gc-profiles'` 同机制；② `#page-group-chat.cs-time-*` 时间轴类始终挂（即使默认 under-av），目的是还原聊天页 body 级类的泄漏——若以后改聊天页时间轴 CSS（如新增样式值），需同步在 `group-chat.css` 的 `#page-group-chat.cs-time-<新值> ...` 块；③ `verify-gc-beauty.mjs` 中壁纸断言用 `.indexOf('data:image') >= 0`（浏览器 CSSOM 序列化 `backgroundImage` 时带 `url(` 前缀，不要用 `=== 0`）；未推送（网络问题），commit 在本地 main，可与上一项的 commit 842fcd5 一起或分开推送。

### 2026-08-21（用户需求「群聊页右上角三个点 → 群聊设置：联系人/我的群聊头像昵称」）
- [本会话·完成]（**已构建 verify 10/10 + 新回归 22/22 + 旧群聊冒烟 20/20，已提交**）：`src/js/group-chat.js`（AI-A 域）+ `src/template.html`（AI-A 域）+ `src/css/group-chat.css`（AI-A 域）+ `src/js/contacts.js`（**AI-B 域代改 1 行**）+ `src/js/mobile-adapt.js`（**AI-B 域代改 1 行**）+ `tools/verify-gc-profile-settings.mjs`（新回归）+ `tools/smoke-group-chat.mjs`（适配三点菜单入口）。
  - **入口**：群聊页头部右上角群成员图标按钮 → 三点按钮 `#gc-more-btn`（⋮）；下拉菜单 `#gc-more-menu` 含「群成员」「群聊设置」；点击群名标题仍可开成员面板（保留旧入口）。
  - **群聊设置面板** `#gc-settings-panel`（底部弹层，类 gc-at-panel 样式）：
    - 「我的群聊」section：我的群聊头像（点击设头像/换头像，文件上传 → 256px JPEG 0.85 压缩 + toast 提示）+ 我的群聊昵称（openModal 弹窗，maxlength 30，空值/清除即回退跟随桌面）+ 显示当前桌面昵称作为副行区分。
    - 「成员群聊形象」section：每个联系人一列，行为头像预览 + 群聊昵称（主）+ 「桌面昵称：xxx」副行（原桌面昵称作为区分）+ 设头像/改昵称/重置（红色，仅有覆盖时显示）按钮。
    - 底部说明：「群聊昵称/头像只在本群聊页生效；成员回复内容来自该成员桌面自己的字卡库。」
  - **存储**：全局 `xy-home-v2:gc-profiles`（不随桌面隔离，跨桌面/刷新都有效），结构 `{ me: {name, avatar}, <cid>: {name, avatar} }`，走 `xyStore(G).get/set('gc-profiles')` 三写（内存+LS+IDB，自动随 idbRestore 回填）。
  - **覆盖生效路径**：`memberName(cid)`/`memberAvatar(cid)`/`myName()`/`myAvatar()` 先读群聊覆盖、再回退桌面值（lbl-*/avatar-*）；影响：消息渲染（@提及检测、撤回文案、拍一拍文本、我的头像）、成员面板（主+副行）、@提及面板（成员显示群聊昵称），全部走覆盖 → 一次设置全场景生效。
  - **群聊回复内容按桌面**：成员回复字卡池 `gcPool(cid)` 读 `storeFor(cid).get('cc-groups')` + `getMediaCardsFor(cid, ...)`（v3.9.x 既有行为），不同桌面联系人用各自桌面的字卡库，无需改动。
  - **持久化与迁移**：`contacts.js` isExcluded 新增 `'gc-profiles'`（防 migrateLegacy 误迁进 default 桌面）+ 注释说明；mobile-adapt.js FLOAT_SELECTORS 新增 `'#gc-settings-panel'`（背景滚动锁）。两文件均 AI-B 域，请知悉。
  - **渲染刷新**：`gcProfileSet(key,name,avatar)` 写盘后统一调 `refreshGroupViews()`（renderAll + 成员面板/设置面板/标题），切联系人/开群聊时也按需刷新（contact-switched 监听中加 settingsPanel 可见时重新渲染）。
  - **回归**：`tools/verify-gc-profile-settings.mjs` 22/22 — 三点菜单/设置面板/我的+成员行/桌面原昵称副行/成员群聊昵称+头像生效/重置回退/@触发回复/持久化+迁移排除（refresh 后 gc-profiles 仍在根键、未进 default 命名空间）/无 JS 异常；`tools/smoke-group-chat.mjs` 20/20（更新用例 9 入口到三点菜单→群成员）；verify 布局 10/10。
  - ⚠️ 对方注意：① contacts.js / mobile-adapt.js 各 1 行业务无关改动（全局键保护 + 滚动锁），属于本功能必需；② 旧的 `#gc-members-btn` 已移除，旧回归脚本里若还有引用需改为「gc-more-btn → gc-more-members」；③ `tools/diag-ta-ask-single-input.mjs` 工作区未跟踪的临时脚本（19:00 起），本次构建未包含，按你的安排处理。

### 2026-08-21（用户反馈「iOS QQ浏览器、夸克浏览器：使用音乐功能，无法导入网易云歌单」）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/music-player.js`（AI-A 域）。
  - **排查结论**：① 主源 `api.injahow.cn` 和备用源 `api.i-meto.com` 的 CORS 头正确（`Access-Control-Allow-Origin: *`）、返回 200，从服务端看无问题；② 兜底的 3 个 CORS 代理**全部失效**——`api.allorigins.win` 返回 520、`corsproxy.io` 返回 403、`api.codetabs.com` 超时，导致 iOS QQ/夸克浏览器即使主源被内容过滤拦截、兜底也全挂；③ 找到可用新代理 `proxy.cors.sh`（Cloudflare Workers，CORS 头正确、返回完整 v6 歌单数据 200 首）。
  - **修复**：
    1. `fetchNeteasePlaylist`：用 `proxy.cors.sh` 替换已失效的 `codetabs`（保留 allorigins/corsproxy 作低优先级兜底，未来可能恢复）；`proxy.cors.sh` 放在 CORS 代理首位。
    2. `fetchV6Durations`：同样用 `proxy.cors.sh` 替换 `codetabs`（时长补全兜底链恢复可用）。
    3. `fetchNeteaseInfo`：在源列表开头加 `proxy.cors.sh`（单曲歌名/歌手识别也走新代理）。
    4. 导入失败提示增强：检测到 QQ/夸克浏览器（UA 含 `QQBrowser`/`Quark`）时提示「当前浏览器可能拦截了音乐 API，可换用 Safari 重试」，其他浏览器保持原提示。
  - 验证：`node --check` 通过 → build（sw 缓存 mochi-mt30v2rj）→ verify 10/10。
  - ⚠️ 构建前已确认工作区无对方进行中改动；本次构建统一包含工作区已保存改动。**注意**：`proxy.cors.sh` 的 URL 格式是 `https://proxy.cors.sh/<未encode的目标URL>`（path+query 拼接），与 allorigins/corsproxy 的 `?url=encode(目标)` 格式不同，已在代码里分别处理。

### 2026-08-21（用户反馈「有时候发送聊天消息，没有自动把位置到最底最新」）
- [本会话·完成]（**滚动修复随 65ca475 入库，回归脚本完善在 d04a5eb 独立提交，均含构建产物**）：`src/js/chat.js`（AI-A 域，代改 3 处）+ `tools/verify-chat-scroll-bottom.mjs`。
  - **根因 1（上翻后发送不滚）**：maybeScrollChatBottom 贴底守卫阈值 120px < 图片消息高度上限 260px，用户轻微上翻后守卫永久 false。修复：side:out（我发送）一律贴底，side:in 才看守卫。
  - **根因 2（图片/表情/长文本"有时候"差一截）**：图片 lazy+async 解码、emoji 字体、长文本 reflow 都在同步滚动后把 scrollHeight 撑大。修复：out 消息同步滚后补 rAF+120ms 延时；renderMsg 统一出口给消息内 img 绑 onload（6s 时间窗内才补滚，防上翻时历史图打断阅读）；批量渲染期间 out 消息记 pendingOutScroll，renderWindow 结束统一贴底。
  - **验证**：verify-chat-scroll-bottom 7/7（新增图片延迟 400ms 加载用例；前置禁用自动回复消除 typing 行竞态）+ verify 布局 10/10。
  - ⚠️ 对方注意：verify-chat-scroll-bottom.mjs 前置禁用自动回复（reply-rs-min/max=9999、rn-prob=0、as-en=0），否则 scheduleReply 的「正在输入」行会让断言不稳定，勿删。

### 2026-08-21（用户需求「回复设置新增其他 tab：联系人主动邀请猜拳/玩游戏概率」）
- [AI-B·完成]（**已构建 verify 10/10 + 专项 21/21 + 群聊回归 21/21，待提交**）：src/js/reply-settings.js + src/js/chat.js + src/template.html + 新回归 	ools/verify-invite-settings.mjs。
  - 回复设置页新增第 5 个 tab「其他」（聊天/群聊/信箱/朋友圈/其他）：「联系人主动邀请」分组——猜拳邀请开关+概率（ai-rps-en/ai-rps-prob，默认开/15%）、游戏邀请开关+概率（ai-game-en/ai-game-prob，默认开/10%），stepper 0-100 步进 5。
  - chat.js 新增 tryActiveInvite：TA 主动发送轮（tryAutoSend 内、拍一拍之后）按概率把主动消息替换成邀请——发一条带主动爱心标识的居中提示卡（special: poke）→ 模拟 typing 0.7-1.4s → 自动打开对应半框（猜拳 / Pong / 贪吃蛇随机）；仅聊天页可见时触发（半框需用户交互）；概率独立于 as-prob（命中后二次掷），默认低于普通主动消息避免频繁打扰。邀请消息文案用 chatPartnerName()。
  - 回归 verify-invite-settings 21/21：5 tab 结构/面板切换/控件与默认值/replyCfg 默认值/开关落库（当前联系人命名空间 xy-home-v2:<cid>:reply-ai-game-en）/关闭后不触发/猜拳与游戏邀请消息+半框自动打开/全关返回 false/无 JS 异常。修脚本三处断言：LS 键名带联系人前缀、邀请消息查 .msg-poke（special: poke 渲染为居中卡而非 .msg-in 气泡）。
  - ⚠️ 工作区另含 AI-A 累积改动（chat-settings 时间轴样式/发送按钮、chat.js 发送后滚底 maybeScrollChatBottom(side)、emoji 面板展开贴底、garden visitor/decor/lb、mail/music/idb/css 等）与未跟踪 verify-chat-scroll-bottom/verify-mail-send-reply 脚本，已一并构建，提交时请确认。

### 2026-08-21（用户反馈 OPPO Chrome「表情包丢失」「头像互动里上传的头像丢失」「还会自动关闭后台保活和后台弹窗」）
- [AI-B·完成]（**已构建 verify 10/10 + 专项 11/11，本提交含修复 + 新回归 `tools/verify-data-loss.mjs`**）：`src/js/contacts.js` + `src/js/avatar-lib.js` + `src/js/chat.js` + `src/js/chatcard.js`。
  - **根因 1（后台保活/弹窗自动关）**：v3.9.x 把 bg-keepalive/bg-notify 改存全局命名空间（bg-keep.js gSet 用 xyStore(GNS)），但 `contacts.js` 的 `migrateLegacy` 不认识这些新全局键——`isExcluded` 未排除，每次刷新把它们当旧顶层业务键迁移进 default 桌面并删根键，非 default 桌面刷新后开关读不到全局值自动变关。同批受害：`reply-gc-*`（群聊全局设置）、`__*` 内部标记。修复：`isExcluded` 增加全局系统键排除；`migrateLegacy` 开头增加存量坏数据反向恢复（default 桌面的 bg-keepalive/bg-notify/reply-gc-* 副本写回根命名空间并删 default 副本，幂等）。
  - **根因 2（头像互动上传的头像丢失）**：`avatar-lib.js` 启动恢复块无条件用 IDB 值覆盖当前值且无桌面归属校验——OPPO 慢 IDB 下启动的 idbGet 迟到返回旧值，覆盖用户刚上传的新头像（还串桌面）。修复：发起时捕获 myPrefix + 回调校验桌面归属（同 mail.js 3c6196a 模式）；仅当本地缺失或 IDB 内容更多才覆盖；慢 IDB 读空延迟重试；打开半框/切桌面时补读新桌面 IDB。
  - **根因 3（表情包丢失）**：`chat.js` my-emoji-groups 恢复块无桌面归属校验（迟到回调串写）+ 慢 IDB 首读空不重试；`chatcard.js` cc-groups 恢复块有归属校验但首读空直接放弃不重试。修复：两处都加归属校验 + 失败重试（800ms×1/2/3 三次）；chat.js 表情包模块加 contact-switched 重载 + 打开面板/写信插入时补读新桌面 IDB。
  - 验证：verify-data-loss 11/11——A 全局键不再误迁（bg/reply-gc/__*）+ 业务键仍迁移；B 存量坏数据反向恢复；C 头像池 IDB 旧值内容更少不覆盖新上传 + 本地空恢复；D 恢复块慢 IDB 重试分支 + 覆盖判定 + 模块加载；E reload 后真实 migrateLegacy 反向恢复全局键；verify 10/10。
  - ⚠️ 本提交含 AI-A 已保存的累积改动（period 图例 chat-pages.css/personalize.js/template.html + garden.js 时长参数 + diag-gc-idb.mjs + smoke-gc-reply-settings/smoke-group-chat 回归脚本），已一并构建验证。tools/diag-ask-harmony.mjs 未跟踪未提交，请确认。

### 2026-08-21（用户需求「回复设置里新增群聊设置，默认数据 + 应用到群聊」）
- [AI-A·完成]（**源码+构建产物已在 HEAD 08c6966 含本功能；新增回归 `tools/smoke-gc-reply-settings.mjs` 21/21 + 旧群聊冒烟 20/20 + verify 10/10**）：`src/js/reply-settings.js` + `src/js/group-chat.js` + `src/template.html`（均 AI-A 域）+ 更新 `tools/smoke-group-chat.mjs`（适配新默认概率）。
  - **回复设置页新增「群聊」tab**（聊天/群聊/信箱/朋友圈 4 tab）：被动回复分组——每个联系人回复概率 60%、回复速度最短 1 秒/最长 40 秒、回复条数最少 1/最多 2、拍一拍 5%、表情包 10%、emoji 5%、图片 5%、语音 10%、颜文字附加 5%、引用 30%、撤回 25%、撤回补发 35%；多字卡回复分组——开关默认开、触发概率 50%、最少 2 条/最多 5 条。
  - **存储**：`gc-*` 键存**全局命名空间** `xy-home-v2:reply-gc-*`（群聊是全局功能，不随桌面/联系人隔离，切换桌面设置不变）；`window.groupChatCfg()` 暴露读取（含默认值兜底）。
  - **群聊页接入**：发送后按「每个联系人回复概率」独立掷骰决定该成员回不回（**@ 的成员必定回复**）；回复内容按概率生成表情包/emoji/图片/语音/多字卡（空格拼接）+ 颜文字附加 + 引用（一轮最多一次）+ 撤回/撤回补发 + 拍一拍（居中样式）；回复速度/条数、撤回等全按群聊设置。群聊消息渲染补齐图片大图/表情包小图/语音播放/撤回样式（复用聊天页 CSS 类）。
  - 验证：无头 Chrome 专项 21/21（tab/默认值/全局存储/跨桌面/gc-prob=0 静默/@必定回/多字卡）+ 旧群聊冒烟 20/20 + verify 10/10。
  - ⚠️ 对方注意：本次功能源码已随 08c6966 入库（该提交由对方构建包含）；工作区当前剩余未提交为对方 period 图例改动（chat-pages.css/personalize.js/template.html period-legend + diag-gc-idb.mjs），以及本会话两个回归脚本（smoke-gc-reply-settings.mjs 新增、smoke-group-chat.mjs 适配）；`index.html`/`sw.js`/`version.json` 为对方 19:59 构建产物（v3.6.186，sw 缓存 mochi-mt2wd1g4，含本功能）。

### 2026-08-21（用户反馈「iOS 自带浏览器：一个联系人的气泡换了，其他联系人的气泡也跟着变；不同桌面联系人的聊天美化要分开」）
- [本会话·诊断完成]（**源码与构建产物均已在 HEAD（353d8b4）含修复，本次提交补齐回归脚本 + 推送部署**）：`src/js/chat-settings.js`（修复在 6ec9a16/353d8b4 已入库）+ 新增 `tools/diag-chat-beauty-isolation.mjs`。
  - **根因**：本地 HEAD 的 chat-settings.js 在 `contact-switched` 时已重应用/清除全部美化（applySettings + applyProfile + applyCss + applyFont）——颜色/自定义气泡 CSS/全局字体均按桌面隔离。但**线上部署版（origin/main，落后本地 6 个提交）只调 applySettings()**：切换联系人时 `cs-bubble-style`（自定义气泡 CSS）与 `cs-font-style`（全局字体）这两个**全局 <style>/body 内联字体不清除也不重应用**——default 桌面设的自定义气泡样式/字体一直盖在其他桌面上，正是用户看到的现象。
  - **复现**：用 SERVE_DIR 指到 origin/main 的 index.html 跑 diag → 7/9（自定义 CSS 样式标签残留 styleInjected=true、全局字体残留 bodyFont=Arial）；本地 HEAD 构建跑同脚本 → 9/9 全过。
  - **验证**：diag-chat-beauty-isolation 本地构建 9/9 + verify 布局 10/10；本次提交后推送 origin/main，iOS Safari 需刷新（强刷一次）拿到新构建即恢复按桌面隔离。
  - ⚠️ 对方注意：`tools/diag-ask-harmony.mjs` 工作区有对方进行中改动（19:00），本提交未包含该文件，请知悉。

### 2026-08-21（用户需求「桌面第三页加记账矢量图按钮 + 点击打开记账功能页」）
- [AI-A·完成]（**已构建 verify 10/10 + 记账专项 31/31，未提交**）：`src/template.html` + 新建 `src/js/accounting.js` + `src/css/chat-pages.css`（均 AI-A 域）+ `src/js/tabs.js`（FULL_PAGES 加 page-accounting）+ `build.mjs`（AI-B 域代改 jsFiles 加 accounting.js）+ `src/js/personalize.js`（AI-B 域代改 1 行：导入美化方案 placeholder→textarea，openModal 不支持 placeholder 参数导致输入框无提示，请知悉）+ 新增 `tools/smoke-accounting.mjs`（回归脚本，保留）。
  - **桌面第三页记账图标**：在 p3-grid（template.html 第三页图标组，原仅经期记录）加 `data-app="accounting"` 图标，SVG 为账本+¥ 矢量图。
  - **自动确保第三页**：ensureP3 每次启动/切联系人检查——若 p3-grid 不在任何 page-slide 里，自动设 desk-page-count=3 并移 p3-grid 到第三页 slide（清理空白页 hint/addBtn）；无标记依赖、不残留状态。（★ v2 修复：原版用 acc-p3-ensured 标记 + 仅首次确保，测试残留标记后第三页永远空白）
  - **记账功能页 page-accounting**：概览卡 + 记一笔表单 + 筛选 + 按日分组列表 + 分类管理，localStorage+IDB 双写按联系人隔离。
  - 验证：无头 Chrome 31/31 + verify 10/10。
  - ⚠️ **请 AI-B 知悉**：① build.mjs jsFiles 已加 accounting.js；② personalize.js 的 WIDGET_IDS/WIDGET_NAMES 未改，装修组件库暂无单独"记账图标"条目，建议后续把 `app-accounting` 加进 WIDGET_IDS/WIDGET_NAMES；③ personalize.js:1374 导入美化方案的 `{ placeholder: '…' }` 改为了 `{ textarea: true, textareaPlaceholder: '…' }`——原 openModal 不支持 placeholder，到使用者那里文字输入框里没有任何提示

### 2026-08-21（用户反馈「切换后台后返回浏览器，手机后台弹窗突然弹几分钟前的联系人播放音乐的系统消息」）
- [本会话·完成]（**已改 src，`node --check` 双文件通过，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：`src/js/chat.js` + `src/js/music-player.js`（均 AI-A 域）。
  - **根因**：① `maybeMusicRequest` 在页面隐藏时照常触发——tc-mask 听歌请求弹窗在后台打开（用户看不见），其 6 秒自动隐藏 setTimeout 在后台被浏览器节流/冻结，回前台时突然弹出几分钟前的「想和你一起听《...》」旧请求；② `showDeskPopup` 在 hidden 状态下仍设置/显示应用内顶部横幅（desk-msg），同原因导致回前台横幅还挂着几分钟前的系统消息。
  - **修复**：
    1. `music-player.js` `maybeMusicRequest`：入口加 `if (document.hidden) return`（保活期间后台回复完成后不再发起听歌请求，避免回前台弹旧请求弹窗；冷却不消耗，回前台后下轮回复可再触发）。
    2. `chat.js` `showDeskPopup`：`visibilityState==='hidden'` 时只发系统通知（bgNotifyCheck），不再设置/显示应用内横幅，直接 return。
    3. `chat.js` visibilitychange：回前台（visible）时若横幅残留（切后台前刚弹出、自动隐藏定时器被冻结）调用 `hideDeskMsg()` 清掉；bg-keep 回前台汇总「你不在的时候收到 N 条新消息」仍会正常弹新横幅。
  - 验证：`node --check src/js/chat.js` + `node --check src/js/music-player.js` 通过；未构建未验证，需构建后 verify + 真机确认（后台挂几分钟回前台不再弹旧音乐请求/旧横幅）。
  - ⚠️ 构建前请确认工作区无对方进行中改动；本次构建请统一包含工作区已保存改动（chat.js/divination.js/template.html 等已有未提交改动）。

### 2026-08-21（用户反馈「浏览器挂几个小时关了手机睡觉，夜里系统通知不弹；通知栏『后台保活』媒体条消失；设置里保活开关自己变关了」）
- [本会话·完成]（**已改 src，`node --check` 通过，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：`src/js/bg-keep.js`（AI-B 域，本会话代改）。
  - **排查结论**：①「开关自己关了」代码里不存在自动关闭路径——真实根因是 `bg-keepalive`/`bg-notify` 本属**全局设置页**（#page-setting 所有桌面共用），却按**当前联系人桌面**存储（activeStore）——切换桌面或系统恢复页面时 active-contact 指向别的桌面，开关就显示「关」；②「夜里不弹/媒体条消失」= 锁屏几小时后 Chrome/系统挂起保活音频、丢弃媒体条 → 页面再次被后台冻结 → 定时器停摆 → 无消息无弹窗（平台硬限制：灭屏几小时无法真后台运行，但可回来自愈）。
  - **修复**：
    1. **保活/通知改全局存储**：新增 `gGet/gSet`（写 `xy-home-v2:` 全局命名空间），读时回退旧版每桌面值并写全局做迁移（bg-keepalive 与 bg-notify 的 init、toggle、自动联动、测试诊断、回前台汇总全部改走 gGet/gSet）；开关不再随桌面/active-contact 变化而「自己关掉」。
    2. **回前台完整自愈**：新增 `healKeepAlive()`——visibilitychange→visible / window focus / pageshow(persisted bfcache) 时，恢复被挂起的 AudioContext（0/600/1800ms 三次重试）+ 重设「Mochi 后台保活」媒体会话条 + 重新请求 wakeLock；原逻辑只补 wakeLock，音频/媒体条不恢复。
  - 验证：`node --check src/js/bg-keep.js` 通过；未构建未验证，需构建后 verify + 无头/真机确认（保活媒体条恢复、多桌面切换开关保持开启）。
  - ⚠️ 请在构建前确认工作区无对方进行中改动；本次构建请统一包含工作区已保存改动。

### 2026-08-21（用户要求「回复设置·聊天·让对方继续说·按正常回复时间 后面加小字说明」）
- [本会话·完成]（**已构建 verify 10/10，未提交**）：`src/template.html` + `src/css/setting.css`（setting.css 为 AI-A 域，代改新增 `.gs-sub` 样式，请知悉）。
  - 「让对方继续说」分组内「按正常回复时间」开关下方新增小字说明「（未开启设置时间的情况下是点击后联系人立即回复）」，与 cs-normal=0 理解回复（快速回 1 条）语义一致；`.gs-sub` 11px 灰色小字样式（var(--muted)，深浅色通吃）。
  - 本次构建统一包含工作区已保存改动（bg-keep.js/chatcard.js/music-player.js 等），verify 10/10，产物已更新（sw 缓存 mochi-mt2h7tzd）。

### 2026-08-21（本会话，用户反馈「聊天设置里点击隐藏通话小框无效」）
- [AI-B·构建者·完成]（**已构建 verify 10/10 + 通话小框专项回归 26/26 + 群聊冒烟 6/6，本次提交推送**）：
  - **排查结论**：通话小框开关本身在最新构建上全链路正常（点击→store 写入 0→通话接通后大面板常驻、小框不弹→刷新持久化→多桌面隔离，CDP 专项 26/26 全过）。**线上真实问题是「开启群聊」开关**（dbdb8e9 只提交了模板 #cs-group-chat，绑定逻辑未构建）——点击无任何反应、开关弹回，位置紧挨在「隐藏通话小框」下方，最可能被误认为通话小框开关无效。
  - **本次构建内容**（统一包含工作区全部已保存改动）：①群聊功能全套（group-chat.js/css 新增、build.mjs 加构建条目、chat-settings.js 群聊开关绑定、personalize.js 桌面群聊图标+applyGroupChatMode、tabs.js page-group-chat 全屏、mobile-adapt.js 群聊弹层 FLOAT_SELECTORS）——线上「开启群聊」开关恢复可点；②AI-A 的 chat.js 就地作答草稿保护 + 问问TA半框文字飞出修复；③通话小框功能原样保留。
  - 验证：`node --check` 全部 src JS 通过 → build（sw 缓存 mochi-mt2fjylu）→ verify 10/10 → diag-call-mini.mjs 12/12（开关读写）→ diag-call-mini2.mjs 7/7（通话行为隐藏/显示）→ diag-call-mini4.mjs 7/7（刷新持久化+多桌面）→ smoke-group-chat.mjs 6/6（群聊开关绑定+页面渲染）。
  - 保留回归脚本：`tools/diag-call-mini.mjs` `diag-call-mini2.mjs` `diag-call-mini4.mjs` `smoke-group-chat.mjs`。
  - ⚠️ 请 AI-A 知悉：本次构建后线上群聊功能已生效；若真机上「隐藏通话小框」仍有问题，请用户提供具体现象（点击后是否弹回/通话时是否仍弹小框/哪个联系人桌面）。

### 2026-08-21（用户反馈「QQ浏览器：导入的歌曲点击播放显示被浏览器拦截，点击屏幕也没用」）
- [AI-A·完成]（**已构建 verify 10/10 + 自动播放专项 3/3，未提交**）：`src/js/music-player.js`（AI-A 域）。
  - 根因：QQ浏览器 X5 内核对 `new Audio()` 创建的未 attached 元素播放限制严格——即使用户手势内 `play()` 也被拒（NotAllowedError），muted 静音解锁也被拒，`armAutoResume` 手势续播时对同一 audio 元素的 `play()` 仍被拒（X5 缓存了 rejection 状态），导致"点击屏幕也没用"死循环。
  - 修复1：新增 `createAudio()` helper——`new Audio()` 后 `appendChild` 到 DOM（`display:none`），X5 内核对 DOM 内 audio 元素的手势播放放行。所有 4 处 `new Audio()` 替换为 `createAudio()`。
  - 修复2：`teardownAudio` 从 DOM 移除 audio 元素（`removeChild`），避免泄漏。
  - 修复3：`armAutoResume` retry 改为在用户手势内**重新创建 audio 元素** + 设置 src + `play()`——绕过 X5 内核对已 rejected 元素的 rejection 缓存。原 retry 只对同一元素 `play()`，X5 拒绝后 `armAuto8Resume()` 重新挂载，下次点击还是同一元素还是被拒。
  - 验证：无头 Chrome（劫持 play 前 2 次返回 NotAllowedError）3/3（audio attached 到 DOM / play 被调用 / 恢复播放成功）；verify 10/10。临时脚本已删&删。

### 2026-08-21（本会话，用户反馈「OPPO Reno14 + 雨见浏览器：回答问题时对面发消息输入内容消失；问问TA半框输入文字飞出输入栏」）
- [本会话·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：`src/js/chat.js`（AI-A 域）。
  - **Bug1 就地作答输入丢失**：TA 问问题卡片点开就地作答（`.msg-inplace` ip-input）打字时，TA 发消息触发 `renderWindow` 全量重渲染（`body.innerHTML=''`）→ 作答区与输入内容一起销毁。修复：新增 `inplaceDrafts` 草稿机制——`renderWindow` 重建前 `collectInplaceDrafts()` 收集（按 data-idx + type），重建后 `restoreInplaceDrafts()` 重新展开作答区并回填内容（含光标置尾）；`expandCardInPlace` 创建输入框时回填草稿 + input 事件实时保存；发送成功/收起/已作答时清草稿。
  - **Bug2 问问TA半框文字飞出输入栏**：`.poke-card` fixed 半框在安卓键盘弹出（布局视口收缩、半框上移）时，contenteditable 文本合成层停在旧位置。原修复只在 80ms 后设一次 `translateZ(0)`，未覆盖键盘动画结束后的重合成。修复：新增 `applyAskComposeLayers`（打开面板立即内联 `translateZ(0)`+`will-change:transform`，不等聚焦延迟）+ `startAskKbRefresh`（监听 `visualViewport` resize，动画停止 160ms 后强制移除→reflow→重建合成层）+ `closeChatAskPanel` 统一清理（停止监听、清 transform/will-change）；8 处直接 `askP.hidden=true` 的调用点统一改走 `closeChatAskPanel()`。
  - 验证：`node --check src/js/chat.js` 通过；未构建，需构建者 build + verify；文字飞出需 OPPO/安卓真机（键盘弹出场景）确认。
  - ⚠️ 工作区已有 AI-B 未提交改动（build.mjs/chat-settings.js/personalize.js/tabs.js 12:02 前），构建时注意一并包含。

### 2026-08-21（本会话，用户反馈「iPhone 12 mini + Safari 添加到桌面后底部导航栏下面有灰色图形，没有完全全屏」）
- [本会话·完成]（**已构建 verify 10/10，本次提交推送**）：`src/css/base.css`（AI-B 域）。
  - **根因**：iOS PWA standalone（添加主屏幕）+ black-translucent 下，部分 iOS 版本 100vh 不含底部 home indicator 安全区（约 34px），`.phone` 底部外露出 `html/body` 灰底（--page-bg #e9e9e9）→「底部导航栏下面有灰色图形」；与顶部全屏按钮无关（点了也一样）。
  - **修复**：① `.ios-pwa-standalone .phone` 补 `min-height:100vh`；② `html.ios-pwa-standalone, html.ios-pwa-standalone body { background: var(--bg-b) }`（浅色白/深色深，与 .phone 底部同色，露出即不可见）；③ `@media (display-mode: standalone)` 媒体查询兜底（不依赖 JS 加类，只改底色不动 .phone 高度——安卓 standalone 靠 100dvh 键盘自动收缩，锁 100vh 会盖输入栏）；④ 补 `.app[hidden]{display:none!important}` 兜底（.app 是 display:flex 会覆盖 hidden，防半成品图标意外显示）。
  - ⚠️ **对方注意**：工作区 `src/template.html`（群聊锚点 page-group-chat，hidden 占位）与 `src/js/chat.js`（TA 引用 lastQuotedText 逻辑）为 AI-A 侧已保存改动，已随本次构建进产物一并提交；群聊锚点暂为纯 HTML、JS 逻辑未见（grep group-chat 无匹配），因 hidden + [hidden] 兜底不影响线上显示，请 AI-A 完成后继续提交。

- 开工：追加一行「开工」；完工：追加一行「完成」。
- 每行写清：AI、时间、任务、涉及文件、是否已构建。
- 开工前先读这个文件 + `git status` + 相关文件 `LastWriteTime`。
- 旧记录随手清理，保留最近几条即可（这是协作笔记，不是发布日志）。

### 2026-08-20（本会话，用户反馈「网易云歌曲链接添加的歌曲不显示封面；点击播放个别歌曲也不显示封面」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 封面专项 5/5，本次提交**）：`src/js/music-player.js`（AI-A 域，用户直接反馈故本会话统一实现）。
  - **根因**：「添加链接音乐」「批量导入」导入的网易云单曲 `cover` 恒为空（只有歌单导入带 pic）；`setWidgetCover` 原来的异步拉封面走 `fetchNeteaseInfo` 的 pic 字段——该字段依赖已失效的 CORS 代理（且页面标题解析不返回 pic），基本拿不到。
  - **修复**：新增 `fetchNeteaseCover(id, cb)`（meting `type=song` 接口，与播放同源 api.injahow.cn，大陆直连、无 CORS、移动端可用，返回 pic 代理 URL → 302 https 图片 CDN）；新增封面并发队列（`enqueueCoverFetch`/`runCoverQueue`，并发 3，`_coverLoading` 防重）+ `ensureSongCover`（幂等入口）+ `ensureMissingCovers`（历史歌曲补全）+ `updateCoverUI`（局部刷新封面图标，不整页重渲染）。
  - **挂点**：「添加链接音乐」「批量导入」网易云单曲导入后自动拉封面；`playTrack` 播放时补封面；`setWidgetCover` 拉封面逻辑改走队列；音乐页打开时 `ensureMissingCovers()` 补历史缺封面歌曲。
  - 验证：CDP 真实导入 `#/song?id=27538343` → 1s 内 cover 写回（meting pic 代理地址）+ 列表图标 has-cov + 播放后桌面小组件 has-cover 背景图，无 JS 异常。

### 2026-08-20（本会话，用户反馈「网易云链接格式导入：新增 #/song?id= 与 outer/url?id=.mp3 格式自动转换导入；添加歌曲里说明可直接链接导入，不用只输入 ID」）
- [本会话·完成]（**已构建 verify 10/10 + 单测 10/10 + CDP 真实导入 10/10，本次提交**）：`src/js/music-player.js`（AI-A 域，用户直接反馈故本会话统一实现）。
  - **统一提取函数** `extractNeteaseSongId`（新增，放 extractPlaylistId 旁）：支持纯数字 ID、`song?id=xxx`、**`#/song?id=xxx`（hash 路由分享链接）**、**`song/media/outer/url?id=xxx.mp3`（官方外链）**、`/song/xxx` 路径、分享文本混排（「分享…《歌名》…https://music.163.com/song?id=xxx @QQ音乐」）——单测 10/10（含不误提取普通 mp3 直链）。「添加链接音乐」「批量导入」两处手写提取正则统一替换为它，提取后自动转 meting 播放直链。
  - **批量导入标签模式增强**：标签块内混入的裸链接/纯数字行直接当作 URL 值（原来静默忽略）。
  - **文案**：「添加链接音乐」label 改「网易云歌曲ID 或 链接 / 音乐直链」、hint 写明「直接粘贴完整网易云链接（如 music.163.com/#/song?id=xxx、song/media/outer/url?id=xxx.mp3），自动识别导入，不用手动填 ID」、占位符加 #/song?id= 示例；「批量导入」② 同步改「每行一个 ID 或直接粘贴完整网易云链接」+ 占位符加外链示例。
  - 验证：CDP 真实导入——`#/song?id=27538343` → 导入成功且 url 自动变 meting 直链；`outer/url?id=2064961530.mp3` → 同上；标签模式混入裸链接「音乐直链URL：https://music.163.com/#/song?id=1973665667」→ 导入且歌名识别「海屿你」；时长后台补全 3 首；无 JS 异常。
  - ⚠️ 本次提交同时包含 AI-A 已保存的 ta-ask.js 改动（预设题 reply 同步+展示文本，产物已含，同次提交保持一致）；**未跟踪 tools 调试脚本（diag-*/poke-dbg/verify-quote-image/_tc_opts.txt 等）未提交**，请 AI-A 确认哪些保留提交、哪些删除。

### 2026-08-20（用户需求「我的拍一拍里新增的字卡无法修改/删除，写错写重复没法处理」）
- [本会话·完成]（**已构建 verify 10/10 + 拍一拍编辑删除专项 15/15，未提交**，请构建者统一 commit+push）：`src/js/chat.js` + `src/css/chat-main.css`（均 AI-A 域）+ `src/css/dark.css`（AI-B 域代改 3 行按钮深色样式，请知悉）+ 新增 `tools/smoke-poke-edit.mjs`（回归脚本，保留）。
  - **修改**：我的拍一拍·用户分组每张字卡右侧新增 ✎ 按钮，点击弹 `openModal` 修改框（预填原文字），保存后写回对应分组（`pokeUserGroups.mine` → LS+IDB 双写），同分组查重「该分组已有相同的拍一拍」。
  - **删除**：每张字卡右侧 ✕ 按钮，点击弹确认框（noInput+staticText 展示被删字卡内容），确认后从分组移除并持久化。
  - **只读保持**：预设分组（`__preset`）与联系人 tab 不显示按钮（仅 `pokeMode==='mine' && cur.user && key!=='__preset'` 的字卡可编辑）。
  - 验证：无头 Chrome 15/15——用户分组 2 卡带按钮/预设 6 卡无按钮/修改预填+生效+持久化/删除确认含内容+生效+持久化/空内容修改拦截/无 JS 异常。⚠️ 本次构建统一包含对方已保存改动（chat.js reply 数组变体等），未提交。

### 2026-08-20（用户需求「日历日期可点击自选查看当日内容；本周日常只显示今日备忘+我们的心情」）
- [AI-A·完成]（**已构建 verify 10/10 + 日历点选专项 15/15 + 对方本周日常冒烟 11/11 全过，未提交**，请构建者统一 commit+push）：`src/js/calendar.js` `src/js/p2-features.js` `src/css/chat-pages.css`（均 AI-A 域）+ `src/css/dark.css`（AI-B 域代改 1 行，请知悉）+ 新增 `tools/smoke-cal-select.mjs`（回归脚本，保留）。
  - **日历页日期自选**：`#cal-grid` 日期格加 `data-date` + `.sel` 选中态（非今天日期选中后填充高亮，点击有 :active 反馈），点击任意日期 → 上方卡片显示该日内容（当日心情/TA 正在/TA 留言/我的留言）；我的留言仅今天可编辑（其他日期隐藏编辑按钮，空态「这一天没有留下留言」）；未来日期沿用对方 getDayEntry 空态守卫（不生成不读取，显示「这一天还没有内容，等到了那一天再来看吧」）；进入日历页/切联系人/今日留言横幅进日历页时复位到今天。
  - **本周日常简化**：点击其他日期弹窗只保留【今日备忘】【今天的心情】两项（TA 心情/TA 正在/TA 留言/我的留言移出，归日历页查看），保留对方未来日期守卫与历史快照回退逻辑，弹窗标题改「当日备忘与心情」。
  - ⚠️ 协作说明：本人改动与对方 21:55 的本周日常修复（历史回退/未来守卫）不冲突——对方构建（21:55:04 index.html）已包含本人全部改动；双方冒烟互测通过。dark.css 代改 1 行（`.cal-grid .cal-cell.sel`），请 AI-B 知悉。

### 2026-08-20（用户反馈「本周日常点击没有完整显示，8/18 记录的心情点开看不到；点 8/22 超前显示内容」）
- [本会话·完成]（**已构建 verify 10/10 + 专项冒烟 11/11，未提交，请构建者统一 commit+push**）：`src/js/calendar.js` + `src/js/p2-features.js`（均 AI-A 域）+ 新增 `tools/smoke-week-day.mjs`（回归脚本，保留）。
  - **根因 1（8/18 心情看不到）**：v3.7.x 才新增按日快照键（`today-mood-YYYY-MM-DD` / `memo-YYYY-MM-DD`），8/18 记录时线上版本只存历史列表（`mood-history`/`memo-history`），点击查看只读快照键 → 显示「没有记录心情」。修复：`p2-features.js` 点击查看时快照缺失回退查当天历史（按 ts 归属日过滤，多条合并展示）。
  - **根因 2（点 8/22 超前显示）**：`calGetDayEntry` 对未来日期也现场随机生成 TA 心情/正在/留言并落盘（`cal-2026-08-22`），弹窗显示预生成内容。修复：`calendar.js` `getDayEntry` 未来日期一律不读不写不生成并返回 null，且清理此前已误生成的未来数据（LS remove + IDB delete，防到点当天被回填）；`p2-features.js` 未来日期不调 calGetDayEntry，弹窗显示「（未来的日子还没有内容，等到了那一天再来看吧）」。
  - 验证：CDP 冒烟 11/11（本周 7 天 data-date 正确 / 8/18 历史回退显示两条心情+备忘 / 8/22 空态提示且不显示 TA 内容且不落盘 / 8/16 空态+日历记录正常生成 / 点今天不弹窗 / 无 JS 异常）；verify 10/10。
  - ⚠️ 本次构建统一包含工作区已保存的他人改动（base.css/fullscreen.js iOS 全屏、chat.js、chat-pages.css、dark.css、bg-keep.js、mobile-adapt.js、pwa.js、default-cards-data.js、ta-ask.js、template.html），未提交，待确认。

### 2026-08-20（用户反馈「iOS 添加到桌面全屏模式点不动，页面下面有白边，不是真的全屏」）
- [本会话·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：⚠️ **代改 AI-B 域文件**（`fullscreen.js` + `base.css`），请 AI-B 知悉并复核。
  - 根因：iOS PWA standalone（添加到主屏幕）+ `apple-mobile-web-app-status-bar-style: black-translucent` 下，`.phone` 的 `height:100dvh`（base.css:208）**不包含系统状态栏高度**——`100dvh` 基于"动态可视区"，standalone 下可视区从系统状态栏下方开始，但 `black-translucent` 让内容从 y=0 开始。结果 `.phone` 从 y=0 开始、高度缺一个状态栏，底部留出状态栏高度的白边；底部 tabbar/输入栏随 .phone 底部上移到屏幕底部上方，用户点屏幕底部点不到 tabbar → "下面有白边、点不动、不是真的全屏"。`100vh` 在 standalone+black-translucent 下包含状态栏（占满物理屏幕）。
  - 修复 1（`src/js/fullscreen.js:31`）：检测 `inIosStandalone`，给 `<html>` 加类 `ios-pwa-standalone`（AI-B 域，代改）。
  - 修复 2（`src/css/base.css:236`）：`.ios-pwa-standalone .phone { height:100vh }` 覆盖 100dvh，占满全屏（AI-B 域，代改）。
  - 键盘适配不受影响：iOS 键盘弹起时 `mobile-adapt.js` syncIosKb 把 `.phone` height 设为 `vv.height`（inline 覆盖 CSS），收起清 inline style 回落 100vh。安卓 PWA standalone 不加该类，仍用 100dvh（安卓 standalone 下 100dvh 含状态栏无白边）。
  - 验证：`node --check` fullscreen.js 通过；功能未构建未验证，需构建后 **iOS 真机测试**（添加到桌面 → 检查底部无白边 + tabbar 可点 + 键盘弹起输入栏停靠键盘上方）。

### 2026-08-20（用户反馈「聊天默认字卡页 iOS 端打开很困难，非常卡」）
- [AI-A·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：`src/js/default-cards.js` + `src/css/chat-pages.css`（均 AI-A 域）。
  - 根因：`main` 分类 **4621 张字卡 / 274 个分组**，`render()` 一次性同步构建全部 DOM（每卡 = div + innerHTML + querySelector + addEventListener），iOS Safari 主线程长阻塞数百毫秒到数秒、低端机白屏；叠加 `.glass` 的 `box-shadow` × 4621 触发大量 paint、`.cc-item` 的 `transform` transition 让每卡成合成层候选；搜索 `input` 每键一次全量重建。
  - 修复 1（分批渲染）：仿 chatcard.js 既有模式——`RENDER_BATCH=120` + `renderToken` 版本号 + `requestAnimationFrame(step)` + `DocumentFragment` 每帧挂载一批，首屏立即可滚动、后续渐进填充；切换 tab/分组/搜索时递增 token，旧批次发现不匹配即废弃，防旧卡复活。
  - 修复 2（事件委托）：原每卡一个 change 监听器（4621 个）改为 `#dc-list` 单一 change 监听器，按 `data-idx` 查 `cardByIdx` 表（`rec.input === input` 校验防旧批次残留 DOM 误触发）。
  - 修复 3（搜索防抖）：input 事件加 150ms debounce，避免每敲一个字全量渲染。
  - 修复 4（CSS paint 优化）：`#dc-list .cc-item` 去掉 `.glass` 的 `box-shadow` 与 `.cc-item` 的 `transform` transition/`:active` scale（右侧 toggle 开关已是交互反馈，视觉无损；仅限默认字卡页，不影响其他页 `.cc-item`）。
  - 验证：`node --check` 通过；功能未构建未验证，需构建后无头 verify + **iOS 真机测试**（无头环境无法验证 iOS Safari 性能）。

### 2026-08-20（用户反馈「收藏页右上角没有收藏设置按钮，无法调整联系人自动收藏概率」）
- [本会话·完成]（**已构建，verify 10/10 + 收藏设置专项 5/5 通过；未提交/未推送，等待部署确认**）：
  - 排查结论：功能已在 src + 本地构建产物里完整存在（`fav-settings.js` + `#page-fav-settings` 弹层 + 4 个概率 stepper），但**从未推送到 GitHub（origin/main 落后本地 8 个提交，线上部署停在 17:42）**——用户看不到按钮的原因是部署未执行，不是功能缺失。
  - 修复 bug：`src/js/reply-settings.js` 的 stepper 全局绑定 `document.querySelectorAll('.stepper')` 会连带绑定收藏设置页的 stepper——点一次 `+` 会先被 reply-settings 处理器 +5（写进 `reply-ta-msg` 错位键）再被 fav-settings 处理器再 +5（实际每次 +10）。已把 4 处全局查询收窄为 `#page-reply-settings .stepper, #page-call-settings .stepper`（通话设置 stepper 本来就依赖该全局绑定，不能误收），收藏/回复/通话三处 stepper 均验证 +5 一次、只写各自存储。
  - 注：`fav-settings.js` 是对方新模块，本次仅改了我方 `reply-settings.js` 一处（跨文件联动，需对方知悉）；另发现 `tabs.js` 的 FULL_PAGES 缺 `page-fav-settings`（收藏设置页会残留底部 tabbar/状态栏，属对方文件，**需要对方处理**）。
  - 待办：确认后由构建者统一 commit + push（提交时带上本次 reply-settings 修复 + 对方 fav-settings 模块及既有未提交改动）。

### 2026-08-20（用户要求「自定义聊天字卡里导出数据，需点击后弹窗选择导出的分类和里面的具体分组」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 导出弹层专项 19/19，已提交**）：
  - `src/template.html`：新增导出选择弹层 `#cc-export-mask`（复用 tc-mask/tc-panel 居中弹窗 + mg-head 头部），内部分类区 `#ce-cats` / 分组区 `#ce-grps` / 汇总 `#ce-summary` / 导出按钮 `#ce-do`。
  - `src/js/chatcard.js`：ccExport 点击改为打开选择弹窗——7 大分类 chips（主字卡/颜文字/emoji/表情包/图片/拍一拍/语音，带数量，默认选中非空分类）多选；下方按分类分段显示分组 chips（多选，默认全选，分类重开时恢复全选）；实时汇总「已选 N 分类 · M 分组 · X 字卡」；无选中字卡时导出按钮禁用；导出 JSON 保持原格式（未选分类为空数组，可直接导入）。
  - `src/css/chat-pages.css`：弹层 chips 复用 .cc-g-chip；新增 .cc-export-row/.cc-export-grps/.ce-grp-sec/.ce-grp-cat/.ce-summary/.ce-btn + `.cc-tool[disabled]` 禁用态。
  - `src/js/mobile-adapt.js`：`#cc-export-mask` 加入 FLOAT_SELECTORS（锁背景滚动）。
  - CDP 验证：注入 5 分类测试数据（注意避开 BUILTIN 内置分组/内容，会被 stripBuiltins 剔除）——默认选中非空分类/分组全选/汇总正确、取消分类→分组区联动、重开分类分组恢复全选、取消单分组、全取消按钮禁用、下载 JSON 内容断言（只含选中分类与分组、可直接导入）。

### 2026-08-20（用户要求「聊天设置音乐悬浮小窗下新增隐藏通话小框按钮；删除更多功能·通话半框里的通话小框开关及说明文字」）
- [本会话·完成]（**已构建 verify 10/10，未提交**）：
  - `src/template.html`：聊天设置页「全屏」组内、音乐悬浮小窗开关下方新增「隐藏通话小框」开关 `#cs-call-mini-hide`（电话听筒图标）；同时删除通话半框（`#chat-call-panel`）内的「通话小框」`#call-mini-toggle` 开关 + 副标题 + `.call-panel-hint` 说明文字。
  - `src/js/chat-settings.js`：仿 `cs-music-float` 模式绑定新开关——语义反转（勾选=隐藏），走 `window.getCallMiniEnabled/setCallMiniEnabled` 钩子（call.js 暴露），未就绪时退化为直读写 `call-mini-enabled` store（默认显示）；初始同步 + change 写回 + toast 提示 + 500ms 轮询 + contact-switched 同步。
  - `src/js/chat.js`：删除 `callMiniToggle` 变量定义、`openChatCall` 中同步开关代码、change 监听三处；更新注释。
  - `src/css/chat-main.css`：删除已无用的 `.call-panel-switch` / `.call-panel-switch-sub` / `.call-panel-hint` 样式，更新注释。
  - 验证：`node --check` 双 JS 通过；`node tools/verify.mjs` 10/10；产物文本断言：新开关/文案存在、旧开关/提示/副标题已删（"接通后自动最小化为悬浮小框"仅保留在新开关 toast 文案中，符合预期）。
  - ⚠️ 构建同时包含工作区已保存的对方改动（chatcard.js/mood-reply-cards.js/music-player.js/ta-ask.js/chat-pages.css），未提交，待用户确认。

### 2026-08-20（用户反馈「引用后没有取消按钮；引用含表情包/图片的消息时缩略图区域乱码挡住文字」）
- [本会话·完成]（**已构建 verify 10/10 + 引用预览冒烟 18/18，本次提交**）：`src/css/chat-main.css`（AI-A 域）、`src/js/chat.js`（AI-A 域）、`tools/smoke-quote-preview.mjs`（冒烟增强）。
  - 根因 1（取消按钮不可见）：`.chat-draft-quote-x { position:static }` 写在 `.chat-draft-x { position:absolute }` **之前**——同优先级 (0,1,0) 后定义者生效，按钮被覆盖成 absolute 定位跑出预览条外（CDP 实测按钮 right=390 超出条 right=376，用户根本看不到删除按钮）。修复：按钮覆盖规则移到 `.chat-draft-x` 之后，顺带 18px 圆形更明显。
  - 根因 2（乱码）：表情包/纯图片消息的 `rec.text` 本身就是整段 base64 dataURL，引用时 qtext 直接用 → 预览条和发送后气泡引用块都显示 base64 乱码挤占文字。修复：引用时 `type==='sticker'` → 占位「表情包」、text 以 data: 开头且带图 → 占位「图片」；`renderQuoteBar` 再加 dataURL 保险（>64 字符的 data: 文本显示占位）。
  - 验证：冒烟 18/18（文字引用流程 + ✕ 按钮位置/定位断言 xInBar/xStatic + 注入伪造表情包消息重进聊天页 → 引用显示「表情包」占位无乱码 + 发送后引用块正常 + 无 JS 异常）。
  - ⚠️ 本次构建统一包含对方未提交改动：chat.js（邀请/问问TA异步回调联系人守卫、红包/收藏 idb 补读守卫）、sfx.js、call.js、chatcard.js、p2-features.js、records.js、divination.js、decision.js、chat-settings.js 等已保存改动。

### 2026-08-20（用户要求「可自定义字卡/系统预设字卡 两大分类做成字卡库顶部栏，可点击切换」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 切换专项 11/11，已提交**）：
  - `src/template.html`：字卡库页（page-chatcard）顶部 `chat-title` 下新增切换栏 `.cc-top-tabs`（复用 .card-tabs/.cc-tab 样式）——两个 tab【可自定义字卡】【系统预设字卡】；7 个自定义入口包进 `#cc-sect-custom`、3 个预设入口包进 `#cc-sect-preset`（默认 hidden），删除原静态 .cc-sect 标题。
  - `src/js/chatcard.js`（IIFE 末尾）：切换逻辑——点 tab 切 `sel` 选中态 + 切两个容器的 hidden。放在 chatcard.js 内（guard `cc-list/cc-tabs` 恒存在，必执行）。
  - `src/css/chat-pages.css`：.cc-sect 样式替换为 `.cc-top-tabs`（tab 等宽 flex:1 + 底部容器 `.cc-sect-body[hidden]{display:none}`）。
  - CDP 验证：初始自定义显示/预设隐藏、点预设↔自定义双向切换、选中态正确、预设组入口 li-default-cards 可正常进入页面并返回保持选中。li id/跳转全不变。

### 2026-08-20（用户要求「聊天音效：设计系统内置默认可切换使用的提示音」）
- [本会话·完成]（**已构建 verify 10/10 + 内置音效专项 31/31，本次提交含 AI-A 已保存的 chat.js 切桌面防串桌守卫**）：
  - `src/js/sfx.js`：新增内置音效库（Web Audio API 实时合成、零存储占用）——短提示音 6 个：气泡/叮咚/小鸟/水滴/钢琴/轻叩；来电铃声 2 个：温馨铃/经典铃。AudioContext 单例 + 首次手势 resume（与既有 HTMLMediaElement 解锁并存）；AudioBuffer 缓存复用。
  - 播放优先级：自定义上传 > 内置音效 > 静音；新存储键 sfx-*-b（每桌面独立）：'none'=静音、缺省=默认内置（in=气泡 / out=轻叩 / ring=温馨铃）。playSfx/stopSfx 兼容内置 ring 循环与自定义 ring。
  - `src/template.html`：三类音效行下新增预设胶囊容器（#sfx-ring-presets / #sfx-in-presets / #sfx-out-presets），上传按钮改名「自定义音频」，提示语更新。
  - `src/css/base.css` + `dark.css`：.sfx-presets 胶囊样式（浅色 + 深色覆盖）。
  - 交互：点胶囊即应用+试听；选内置自动替换自定义；「静音」关该类音效；「清除」只清自定义回落内置；contact-switched 切桌面重渲染。
  - 验证：`node tools/smoke-sfx-builtin.mjs` 31/31（渲染/默认高亮/切换/静音不播/自定义优先级与替换/清除回落/ring 循环停止/切桌面/无 JS 异常），脚本保留。

### 2026-08-20（用户要求「字卡库顶部新增 2 个大分类【可自定义字卡】【系统预设字卡】」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 字卡库页专项 5/5，已提交 9e6f989**）：
  - `src/template.html`：字卡库页（page-chatcard）入口重排为两组——【可自定义字卡】自定义聊天/查岗日常/桌面今日情话/TA的询问/TA的小问题/TA的好奇/TA的吐槽（7 个，顺序同用户清单）；【系统预设字卡】聊天默认/聊天情绪/聊天回应（3 个）。**「逻辑连接词字卡」= 聊天回应字卡**（页内 8 类连接词：接话/确认/继续/轻追问/连接/转折/停顿/收束），未拆独立入口，保留其副标题「逻辑连接词字卡」。
  - `src/css/chat-pages.css`：新增 `.cc-sect` 大分类标题样式（小字灰色 + 左侧竖条，首组贴顶）。
  - 确认无 JS 遍历 page-chatcard 直接子元素，加标题不影响任何模块；全部 li id 与点击跳转不变。
  - 提交附带此前待提交的 chat.js 切桌面回复串桌修复 / music-player 播放恢复提示 / ta-ask 快捷项人称修正。


- [本会话·完成]（已改 src/js/ta-ask.js，未构建未提交，请构建者执行 node build.mjs 后随下次统一提交）：
  1. cp6「如果能给十年前的自己捎一句话」快捷项『再等等，会遇到我』→『再等等，会遇到你』（用户指定人称修正）。
  2. 同类型排查：全量扫描 ta-ask.js 四题库（询问/小问题/好奇/吐槽）所有用户视角快捷项/选项 + 反扫（用户选项含你无我），另核对 default-cards-data.js 回应池、mood-followup-data.js、quote-cards.js、chat-settings.js 拍一拍预设——仅再发现 1 处同类问题：cy11「你觉得自己最柔软的部分，藏在什么地方？」快捷项『只给我看』→『只给你看』（TA 回应『只给我看的，我看到了』证实原意是只给TA看，用户视角应用『你』）。
  3. 老用户数据同步：tcuLoad 迁移块扩展（沿用 cw4「你身边→我身边」既有模式）——cp6/cy11 已存数据 + 历史答案 h.my 同步修正并写回 LS（idbRestore 仅回填缺失键，不会回退迁移）。
  4. node --check 通过。
### 2026-08-20（用户要求「聊天设置的全屏模式下面新增音乐悬浮小窗开关」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 9/9，本次提交一并包含 AI-A 已保存的占卜/字卡库改动**）：聊天设置页「全屏」组内、全屏模式开关下方新增「音乐悬浮小窗」开关 `#cs-music-float`。
  - 与音乐页 `#music-float-en` / 音乐设置 `#sm-set-float` **同源**（`music-global.floatEn`，每桌面独立）：music-player.js 新增 `window.musicFloatGet()` / `window.musicFloatSet(en)` 钩子（复用 saveSettings/syncFloatToggle/renderFloat 完整流程，切关立即隐藏浮框）；chat-settings.js 仿 cs-fullscreen 模式绑定：初始同步 + change 写回 + 500ms 轮询 + contact-switched 立即同步；music-player.js 加载晚于 chat-settings.js，钩子未就绪时退化为直读写 store（默认开）。
  - 涉及 `src/template.html` `src/js/music-player.js` `src/js/chat-settings.js`。CDP 验证：开关位置在全屏行正下方/初始同步/关→music-global=false+音乐页开关同步/音乐页开→500ms 同步/直调 musicFloatSet 同步/刷新持久化，9/9。
  - ⚠️ 并行会话 AI-A 留话请构建者一并构建的改动已包含本次构建：divination.js+chat.js（占卜重新抽牌先清空问题输入栏）+ chatcard.js（删除字卡 scheduleSave 延后写、离开字卡页自动退出批量管理），均已 verify 通过，提交 message 注明双方范围。

### 2026-08-20（用户反馈「占卜点重新抽牌无法先清空问题输入栏再重新输入问题开始抽牌」）
- [AI-A·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：`src/js/divination.js` + `src/js/chat.js`（均 AI-A 域）。
  - 根因：点「重新抽牌」立即开抽，问题在点击瞬间快照——上轮问题还留在输入栏，用户来不及清空/重输，新抽仍带旧问题。
  - 修复：按钮处于「重新抽牌」状态（上轮结果已展示）时，点击改为**先清空问题输入框 + 清空结果区**，按钮恢复「抽牌」（含原 SVG 图标），用户重新输入问题后再点一次开始抽牌；桌面占卜页（`#div-draw`）与聊天页占卜半框（`#div-chat-draw`）同步修复。清空走 `input.value=''`，安卓 ce-box 代理已支持（mobile-adapt.js setter）。
  - 顺带：`clearResult()` 空态文案「点击下方按钮」→「点击上方按钮」（按钮在结果区上方，原文案错误）。
  - 验证：node --check 双文件通过；功能未构建未验证，需构建后无头/真机确认。

### 2026-08-20（用户反馈 iOS Safari 多角色四个问题·本会话修复）
- [AI-A·完成]（**已构建 verify 10/10，未提交**）：`src/js/chat.js` `mail.js` `feed.js`（AI-A 域）、`src/js/contacts.js`（AI-B 域，代改 renameContact 同步 lbl-partner，若需调整请留话）。
  - **① 切桌面再切回消息消失**：`chat.js` loadMsgs 合并原规则 localNew 只保留本地比 IDB 末条 ts 更新的消息，若 IDB 缺旧消息（写入失败/竞态），本地旧消息 ts < idbLastTs 被 filter 掉 → 丢消息。改为按指纹（ts+text+side+img）取并集，不限 ts，merged 按 ts 排序。聊天只增不改，取并集不会加回已删消息。
  - **② 聊天顶部栏显示"系统默认"非角色名**：`chat.js` 原只在模块加载时读一次 lbl-partner，切换联系人后从不刷新；window.renderChatHeader 从未定义。改为 updateChatPartnerName()（读 lbl-partner，缺失回退 contacts.name，再回退 'TA'），contact-switched 时调用并刷新头像，挂 window.renderChatHeader。`contacts.js` renameContact 改名后同步写该联系人 lbl-partner（仅当为空或等于旧 contacts.name 时，避免覆盖设置页单独设的 TA 昵称）。
  - **③ 信箱数据串桌面**：`mail.js` 原来信/回信单定时器用 store（当前激活桌面），用户在 default 桌面时所有联系人的来信都写到 default → 串桌面。改为 maybeIncomingLetterFor(cid)/checkPendingReplyFor(cid) 遍历各联系人用 storeFor(cid) 读写各自命名空间；load/save 等全部加 cid 参数。来信系统消息走 notifyMailToChat(cid)（当前桌面 chatAddSystem，非当前桌面直接写该桌面 IDB 聊天+LS）。前台弹窗仅当前激活桌面才弹。
  - **④ 朋友圈统一显示"TA"**：`feed.js` taFeedNameFor/taAvFor 原 owner==='default' 时回退 partnerName()（当前激活桌面）——从 default 桌面打开朋友圈时所有动态都显示 default 的 TA 名字。改为始终按 owner 桌面取（含 default），owner 桌面 lbl-partner 空时回退该联系人注册名，再回退 'TA'/''。
  - 验证：node --check 全过；verify 10/10。本次构建同时包含工作区已保存的 music-player.js/pong.js 改动。


### 2026-08-20（用户反馈「iOS Safari：音乐导入网易云歌单无反应，只显示一首，无法播放」）
- [AI-A·完成]（**已构建 verify 10/10 + 音乐专项 8/8，未提交**）：`src/js/music-player.js`（AI-A 域）。
  - 根因1（播放）：`resolveNeteaseDirectUrl` 用 XHR `responseURL` 解析 meting 302 拿 CDN 直链——iOS Safari 上 XHR `responseURL` 对跨域 302 不返回最终 URL（只返回原始请求 URL），导致 `retryWithHttpsUrl` 拿不到 CDN 直链、回退到 meting URL 重试无意义。
  - 根因2（歌单导入"无反应"）：`fetchNeteasePlaylist` 每源超时 10 秒，5 源全挂时用户等 50 秒才看到"歌单导入失败"——iOS Safari 上 meting API 不可达/超时时体感"无反应"。
  - 修复1：`resolveNeteaseDirectUrl` 改用 `fetch`——`response.url` 跟随重定向后返回最终 URL（iOS Safari 15.4+ 支持），收到响应头即 `abort` body 不下载音频。fetch 拿到 https CDN 直链后直接播放，不经 meting 302。
  - 修复2：`retryWithHttpsUrl` 增加备用播放源——meting API 不可达（直链为空）时，用网易云官方外链 `music.163.com/song/media/outer/url?id=xxx`（`<audio>` 不走 CORS，直接跟随 302 到 CDN mp3 播放）。
  - 修复3：歌单导入超时 10 秒→7 秒，让备用源（i-meto 镜像）更快被尝试。
  - 修复4：播放失败提示补充"或该歌曲为VIP付费歌曲"，帮助用户区分原因。
  - 验证：无头 Chrome 8/8（歌单导入 200 首 / 播放进度推进 / fetch 拿 https CDN 直链 / 官方外链 audio 播放成功 有时长）；verify 10/10。临时脚本已删。

### 2026-08-20（用户反馈「iQOO Neo5 SE · QQ浏览器：聊天显示联系人来信，点信箱却看不到信」）
- [本会话·完成]（**已改 src，未构建未提交，请构建者执行 `node build.mjs` 后随本次统一提交**）：`src/js/mail.js`（AI-A 域）+ 新增 `tools/smoke-mail-qq.mjs`（回归脚本，保留）。
  - 根因：mail.js 与 chat.js 在 IDB 未就绪时的持久化策略不对称——QQ浏览器 X5 的 IndexedDB 打开可能挂起（`indexedDB.open` 永不回调），`mailDbReady` 保持 false；此时 `save()` 只把来信存进内存 `mailPending`、完全不落盘（原 `if (!mailDbReady) { mailPending=...; return; }`），而 chat.js 同场景 `saveMsgs()` 会立即写 LS 快照。于是来信的聊天系统通知「给你寄来了一封信」重载后仍在，信箱整封丢失（保险丝 15s 触发前页面被 X5 后台冻结/杀进程/重载即丢）。
  - 修复：`save(list, cid)` 在 `!cid && !mailDbReady` 分支补 `writeSnap(list, cid)`——立即写剥图 LS 快照（文本+标题+时间，≤200KB），与 chat.js 同策略；IDB 权威读回后 `mailMergeFromIdb` 按 id 合并恢复完整数据（含图片），不破坏 v3.5.120 权威防护（主键 `store.set` 仍等就绪，不会被空列表覆盖 IDB）。
  - 验证：`node --check` 通过；`node tools/smoke-mail-qq.mjs` 4/4（X5 挂起 IDB 场景：来信产生→本会话可见→保险丝前重载→聊天通知存活+信箱可见）；`REPRO_NORMAL=1` 正常 IDB 路径 4/4 回归通过。
  - ⚠️ 并行会话（对方）正在同文件重构多联系人来信（`save/load/writeSnap/letter*` 加 `cid` 参数、`checkPendingReplyFor`、`maybeIncomingLetterFor`），本改动与其兼容（改动点在其新 `save(list, cid)` 内部，用其新 `writeSnap(list, cid)`）；构建前请确认对方 mail.js 已保存完整。

### 2026-08-20（聊天搜索记录新增按日期查询）
- [本会话·完成]（**已构建 verify 10/10 + 日期搜索专项 CDP 18/18，已随对方提交 492be69 入库**——提交信息未列本功能但内容已含）：用户要求聊天更多→搜索聊天记录支持按日期查询。
  - 实现：搜索半框关键词栏下新增「开始日期 至 结束日期 + 清除」行（`<input type="date">`，安卓端 native picker 不受 ce-box 转换影响）；`runChatSearch()` 支持 仅关键词 / 仅开始日期 / 日期范围 / 单日 / 日期+关键词组合 五种查询；结束日期含当天 24 点（本地时区解析，避免 `new Date('YYYY-MM-DD')` UTC 偏移）；结果时间改 `fmtSearchTime`（MM-DD HH:MM，跨天搜索可分辨）；日期 change 自动搜索、清除按钮重置；无关键词无日期时提示「输入关键词，或选择日期范围搜索聊天记录」；空结果按条件给不同提示。
  - 涉及：`src/js/chat.js`（openChatSearch 重置日期 / searchDateToTs / fmtSearchTime / runChatSearch / 事件绑定）、`src/template.html`（chat-search-date 行）、`src/css/chat-main.css`（.chat-search-date 样式）。
  - 验证：`tools/smoke-search-date.mjs` 新增专项 18/18（含注入跨日期种子消息、IDB+LS 双写、五类查询断言、跳转/清除/无异常）。
  - ⚠️ 当前工作区剩余未提交：chat.js（对方拍一拍字卡「含我」处理）、index.html/sw.js/version.json（对方已 build 产物）、WORKLOG——均非本会话改动，勿动。

### 2026-08-20（用户反馈「聊天里点引用后，发送前输入栏上方无法显示引用了什么、无法删除引用」）
- [本会话·完成]（**已构建 verify 10/10 + 引用预览冒烟 12/12，本次提交**）：`src/js/chat.js`（AI-A 域）、`src/css/chat-main.css`（AI-A 域）、`src/template.html`（AI-B 域代改一行）、`tools/smoke-quote-preview.mjs`（新增专项测试）。
  - 根因：点气泡操作「引用」只写内存 `lastQuote` + toast，输入栏上方没有任何引用预览 UI，也没有删除入口。
  - 实现：`#chat-draft` 草稿区（template 锚点）内新增 `#chat-draft-quote` 引用预览条——`renderDraft()` 内新增 `renderQuoteBar()`：显示引用文本（单行省略，组合消息带图片缩略图）+ ✕ 删除按钮（点击清 `lastQuote` 重渲染）；引用操作后 `renderDraft()` 即时刷新（去掉原 toast）；`sendSticker`/`addMsg` 发送后清引用并刷新（无文字分支也清，防残留）；`.chat-draft` 改纵向 flex（引用条在上、图片缩略图在下可共存）。引用条用中性灰底 + 左侧竖条，深浅主题通吃（不依赖 dark.css）。
  - 验证：CDP 冒烟 12/12（发消息→点气泡→引用→预览条出现含内容+✕→点 ✕ 消失→再引用→发送→新气泡带 `.msg-quote` 引用块且内容正确→预览条消失→无 JS 异常）。
  - ⚠️ 本次构建统一包含对方未提交改动：`base.css`（开屏确认层小屏修复）、`chat-pages.css`、`music-player.js`，一次 build 全部打进。

### 2026-08-20（用户反馈「iOS 默认浏览器依旧无法点击、无法使用、页面完全卡住」· 本会话诊断修复）
- [本会话·完成]（**已改 src，未构建未提交**，请构建者执行 `node build.mjs`）：根因——v3.7.x 开屏报修确认层在小屏 iPhone（375×667 iPhone 6/7/8/SE2、360×640、320×568 SE1）上，**确认按钮在屏幕可视区下方**：`.splash-confirm-card` 整卡 `overflow-y:auto`，按钮随长文本被推到卡片底部、被 iOS Safari 底部工具栏遮挡或完全看不见，整层盖住全屏看起来就是「页面卡死、什么也点不了」；390×844 以上现代机型不滚动可见，所以无头 Chrome 默认尺寸一直没复现。CDP 实测（修复前）：375×667 按钮底边 667=视口底、320×568 按钮底边 705 完全出屏。修复（`src/css/base.css`，AI-B 名下，本会话代改）：`.splash-confirm-card` 改 `display:flex; flex-direction:column; height:min(560px,100%)`（按钮不再被文本推走），`.splash-confirm-text` 改 `flex:1; min-height:0; overflow-y:auto`（仅正文滚动），按钮 `flex-shrink:0` 常驻卡片底部。CDP 验证（注入修复后线上 index.html）：320×568 / 360×640 / 375×667 / 390×844 四尺寸按钮全部完整可见（btnBot 527/583/597/685 < 视口高），完整流程 6/6：进入按钮→确认层弹出→按钮可见→点 OK 开屏移除（DOM 删除）→主页可开。⚠️ 工作区另有对方未提交的 chat-pages.css/music-player.js + 已构建产物，本次改动未含在内，需构建者统一再 build 一次。
- [本会话·补充]（**已构建 verify 10/10 + smoke 16/16 + iOS 全尺寸 CDP 30+ 项全过**）：用户追问「稳妥检查 iOS 总是用不了」——已执行 `node build.mjs`（14:31 产物，含上述 base.css 修复 + 对方已保存的 chat-pages.css/music-player.js 改动）并全面验证：
  1. **确认层按钮四尺寸全过**：320×568（SE1）/ 375×667（6/7/8/SE2）/ 390×844 / 430×932 均完整可见，真实触摸坐标点确认按钮→开屏移除→主页可开。
  2. **聊天全流程四尺寸全过**：进聊天页→输入栏可见（320 下 top 512<568）→contenteditable 输入（textContent 写入）→点发送→消息上屏→输入框清空，12/12。此前 4 项 FAIL 系测试脚本误用 `input.value`（chat-input 是 contenteditable div，AGENTS.md 已注明），改用 textContent 后全过，非产品 bug。
  3. **splash 点击路径确认**：点「点击进入」按钮与点 splash 任意处均弹确认层（`splash.addEventListener('click', enter)`），点确认层内文字不误关（stopPropagation）；`splash-logo` 无 id（class 选择器），无 JS 报错。
  4. **通用弹窗（openModal）按钮**四尺寸均可见、可达。
  5. verify 10/10、smoke-splash-confirm 16/16、页面零 JS 异常。⚠️ 仍待提交：工作区含对方 music-player/chat-pages 改动 + 本会话 base.css 修复 + 构建产物，一次 commit 带上（v3.7.x: iOS 开屏确认层按钮小屏不可见修复 + 对方已保存改动）。

### 2026-08-20（用户需求「查岗日常字卡：单个字卡添加后可修改/移动，增加分组修改及移动功能」）
- [AI-A·完成]（**已构建 verify 10/10 + 查岗冒烟 9/9，未提交**）：`src/js/p2-features.js`（AI-A 域）、`src/css/chat-pages.css`（AI-A 域）。
  - **字卡编辑**：`ckMineItemHtml` 字卡内容加 `data-edit`，点击打开 `openModal` 编辑内容（校验同分类去重），保存后 `ckSaveItems` + 重渲染。
  - **字卡移动分组**：每张卡加 ↪ 移动按钮，点击 `openModal` pills 选目标分组（未分组 + 各分组），确认后更新 `item.grp`。
  - **分组拖动排序**：分组区块标题加 ≡ 手柄（`bindCkGroupOps` 绑定 pointerdown），克隆标题行跟随手指 + 蓝色指示线，释放 `splice` 重排 `ckGroups` 数组；未分组区块固定最后不参与排序。
  - 验证：无头 Chrome 9/9（手柄/移动按钮/编辑触发存在 / 分组拖动 A→B 下方变 B,A / 字卡编辑生效 / 字卡移动 grp g1→g2 / 无 JS 异常）。临时脚本已删。

### 2026-08-20（用户需求「自定义聊天字卡：分组可移动位置/改名，字卡可拖动到其他字卡上下方」）
- [AI-A·完成]（**已构建 verify 10/10 + 字卡拖动冒烟 12/12，随 775b503 提交**）：`src/js/chatcard.js`（AI-A 域）、`src/css/chat-pages.css`（AI-A 域）、`src/css/dark.css`（AI-B 域深色适配）。
  - **分组排序+改名**（管理分组面板）：每行加 ≡ 拖动手柄（pointerdown 触发，克隆行跟随手指 + 蓝色指示线，释放 splice 重排 `groups[cur]`）；加 ✎ 改名按钮（openModal 输入，校验重名，同步 curGroup/selected key）。内置分组不可改名/删除但可排序。
  - **字卡拖动**（主列表）：长按 350ms 触发（移动超 10px 取消），克隆项跟随手指 + 指示线；computeCardDrop 按 clientY 落点找目标字卡上半/下半（含空分组 header 兜底）；moveCardTo 跨分组 splice 删除插入。仅主字卡/颜文字/emoji/表情包启用；管理模式/搜索/分块渲染中禁用。
  - 验证：无头 Chrome 12/12（分组栏/手柄+改名按钮/拖动排序 A→末尾变 B,C,A/改名/字卡跨分组拖动源减目标增/无 JS 异常）。临时脚本已删。

### 2026-08-20（用户需求「公告点击进入后新增弹窗，需点【我已知晓】关闭」）
- [AI-B·完成]（**已构建 verify 10/10 + 确认层专项冒烟 9/9，随本次提交**）：`src/js/clock.js` `src/template.html` `src/css/base.css`（均 AI-B 域）。
  - 需求：开屏「点击进入」后先弹「关于 bug 报修」确认层（内测报修须知：报修需附手机型号/浏览器/具体现象），点【我已知晓】才关闭并进入页面。
  - 实现：开屏内部新增 `#splash-confirm` 确认层（开屏 z-index 999 > 全局 modal-mask 90，故不用 openModal 而做在开屏内）；`enter()` 改为先检查公告可见（`hasNotice()`：notice.json 隐藏公告时跳过确认层直接进入）→ 显示确认层；点【我已知晓】→ `confirmEl.hidden=true` + `hide()` 进入。确认层内点击 stopPropagation，不会误触 splash 重弹。20s 保险丝改为 `ready()?enter():hide()`（就绪也先弹确认层）。
  - 文案：写死在 template（报修要求是固定须知，不随 notice.json 远程化）。
  - 验证：verify 10/10；专项冒烟 9/9（就绪可进入/点进入弹确认层/含报修文案/开屏未关/点已知晓关闭+进入/点文字不误关/公告隐藏时不弹直接进入）。
  - 本次构建统一包含对方已保存改动：`chat.js`（LS 快照+IDB 合并后同步 lastMineText、TA 回复独立掷骰不再连环引用同一条消息）、`p2-features.js`（备忘/心情按天显示 + 跨天自动刷新 + 老数据迁移）。
  - 新增 `tools/smoke-splash-confirm.mjs` 专项测试（保留供回归）。
- [AI-B·完成·按钮文案修改]（**已构建 verify 10/10 + 冒烟 11/11，未提交**）：按钮文案「我已知晓」→「确认我已知晓，我已知道如何报修设备bug」；`.splash-confirm-btn` 改 `padding 10px 16px + max-width:100% + white-space:normal` 支持长文案换行（按钮不超卡片）。冒烟新增两项：按钮文案正确 + 按钮不超出确认卡片。
- [AI-B·完成·确认层文案改版]（**已构建 verify 10/10 + 冒烟 12/12，本次提交**）：确认层顶部加红色加粗「【报修必填】机型 + 浏览器，缺一不回。」；正文换成用户原话（很多人不看开屏公告、上来就问为什么好多bug、很多问题是设备兼容、报修请附机型/浏览器/具体现象、光说用不了点不动不够、麻烦配合不然没法查）。新增 `.splash-confirm-top` 样式。冒烟新增「顶部必填提示正确」检查。
- [AI-B·完成·文案补充]（**已构建 verify 10/10 + 冒烟 13/13，本次提交**）：结尾补一句「而且我后台的消息堆的非常多，麻烦说明清楚避免无效沟通。」。冒烟新增「文案含后台消息堆的非常多提醒」检查。
- [AI-B·完成·恢复完整文案]（**已构建 verify 10/10 + 冒烟 16/16，本次提交**）：确认层恢复用户提供的完整报修须知（此前精简过度删了段落）——顶部必填提示 + 正文完整三段：①说实话我有点无语（很多人不看开屏公告/很多问题是设备兼容）；②麻烦配合（后台消息堆的多避免无效沟通）；③关于bug【内测一直在更新无可避免】+ 简单说明（特定机型/不报修测不出修不了）+ 详细说明（光说用不了点不动不够/设备差异）+ 要修得先知道（机型+浏览器/复现不了修不了）。新增 `.splash-confirm-sec`/`.splash-confirm-lbl` 小标题样式。冒烟改为逐段检查关键短语。本次构建含对方已保存 fullscreen.js 改动（浏览器标签模式不自动重入全屏优化）。

### 2026-08-20（用户反馈「OPPO Reno6 5G · Edge：朋友圈评论发不出去；联系人的评论看不到」）
- [AI-A·完成]（**已随本会话统一构建 verify 10/10 + CDP 端到端验证**）：`src/js/feed.js`。
  - 根因：`mobile-adapt.js` 在安卓把 `<textarea>`（`#feed-comment-input` 评论框、`#feed-input` 发布框）转成 ce-box（contenteditable 转换框）——OPPO Edge 对 ce-box 聚焦/输入失效（与回复设置 stp-val 同源，WORKLOG 2026-08 OPPO Edge 记录）：打不出字，点发送时 `submitComment` 读到空内容静默返回 → 「评论发不出去」；用户互动链路断裂 → 也看不到 TA 的评论/回应。
  - 修复：评论输入框与发布框预标记 `dataset.ceDone='1'` 让转换器跳过，保持原生 textarea（原生仅弹自动填充条，不影响输入）。
  - 验证：CDP 手机模拟（390×844 安卓 UA）修复前两输入框均被转 ce-box（ce-ghost+__ceBox），修复后保持原生；端到端：发布→评论→发送→评论显示 + TA 回应评论显示 + 通知「TA 评论了你的动态」全部通过。多桌面链路（联系人2桌面评论二宝动态→切回默认桌面可见）同时验证通过。
  - 本次构建同时包含 AI-A 已保存改动（chatcard.js 分组/字卡拖动排序+重命名、calendar.js/p2-features.js/home.css 本周日常点击查看其他日期）。

### 2026-08-20（用户需求「本周日常可以点击其他日期，查看其他日期的当日留言/备忘/心情等内容」）
- [AI-A·完成]（**未构建，请 AI-B 统一执行 node build.mjs**）：`src/js/calendar.js` `src/js/p2-features.js` `src/css/home.css`（均 AI-A 域）。
  - calendar.js：抽出 `getDayEntry(dateStr)`（任意日期首次访问生成 TA 心情/正在做/留言并落盘 cal-YYYY-MM-DD + IDB），`getToday` 改调用它；暴露 `window.calGetDayEntry` / `window.calGetMyMessage(ds)` 供本周日常复用。
  - p2-features.js：备忘/心情保存时补写按日期快照（`memo-YYYY-MM-DD` / `today-mood-YYYY-MM-DD` + IDB），供其他日期查看；本周日常 `.week-day` 渲染加 `data-date`，新增点击事件——其他日期用 openModal(noInput+staticText) 弹窗展示该日期的【今日心情/TA 正在/TA 留言/我的留言/备忘/心情】，今天保持原状（cursor:default），装修模式下不触发。
  - home.css：`.week-day` 加 cursor:pointer + :active 反馈，`.week-day.today` cursor:default。
  - 验证：node --check 全通过。功能需构建后真机/无头验证。

### 2026-08-20（用户反馈「通话小框里联系人的头像没变，没有跟随联系人更换聊天头像变化」）
- [AI-B·完成]（**已构建 verify 10/10 + CDP 冒烟 8/8，随本次提交**）：`src/js/call.js`（AI-B 域）。
  根因：通话开始 `bindCall` 时把 `avatar-partner` 快照进 `currentCall.av`，小框/面板渲染走 `currentCall.av || partnerAv()`——通话中联系人换头像（头像库手动/自动/设置页）后小框头像永远是旧快照。
  修复：新增 `syncCallAv()`——按归属桌面（`storeFor(currentCall.cid)`）实时读 `avatar-partner`，有变化才重绘面板 `#call-av` + 小框 `#call-mini-av`（`shownAv` 防抖，每秒计时 tick 只做字符串比较，不重建 DOM）。接入点：来电/去电开始（重置 shownAv + 首绘）、响铃倒计时每秒、通话中计时每秒、minimizeCall、接听/接通后 2 秒最小化、挂断重置。
  验证：CDP 冒烟 8/8（来电面板初始头像 → 换头像后面板+小框跟随 → 接听小框出现且头像正确 → 小框可见时再换头像实时跟随 → 挂断状态清空 → 无 JS 异常）。临时脚本已删。
  本次构建统一包含对方 12:47-12:49 已保存改动：`chat.js`（七夕标签显隐 rpQixiTag）、`chat-settings.js`（mochi-restore-done 后兜底 applyFont，修复大键字体刷新不应用），均语法通过、内容完整。

### 2026-08-19（本会话，用户需求「聊天更多功能里加双人 Pong 小游戏」）
- [本会话·完成·snake 第二轮]（**已构建 verify 10/10 + snake 冒烟 16/16，未提交**）：贪吃蛇补难度选择 + 暂停 + 全屏 + 保存/继续对局 + 方向键加大。
  - **难度**：顶栏加 select（慢/普通/快），tick 间隔 easy[200,180,160,140] / normal[160,140,120,100] / hard[120,110,100,90]（按 0-30s/30-60s/60-90s/90s+ 分段），默认 normal 比第一轮慢。
  - **暂停**：顶栏加暂停按钮，playing↔paused，暂停时记 pauseAt，恢复时 startTime 补偿 Date.now()-pauseAt。
  - **全屏**：顶栏加全屏按钮，`#chat-snake-panel` 加 `.snake-fs` 类（position:fixed 占满视口、深色沉浸背景、canvas/方向键反色）。
  - **保存/继续**：关闭时若 status==='playing' → 存 localStorage（键 `:snake-saved`）；同会话重开走内存继续；切联系人/刷新后重开 → 显示「继续上局」按钮从 localStorage 恢复；游戏结束/开始新局 → 清保存。
  - **方向键加大**：52×44 → 64×56，字号 16→20px（手机更好按）。面板 max-height 74%→86%。
  - **涉及**：`src/js/snake-game.js`（重写）、`src/template.html`（head 加按钮容器 + controls 加 resume 按钮）、`src/css/chat-pages.css`（head-actions/icon-btn/diff/fs 样式 + 方向键加大）。临时测试脚本已删。
- [本会话·完成·补充]（**已构建 verify 10/10 + 全屏/暂停/保存恢复 12/12，未提交**）：Pong 补全屏 + 暂停 + 保存对局。
  - **全屏**：顶栏加全屏按钮，点击 `#chat-pong-panel` 加 `.pong-fs` 类（position:fixed 占满视口、沉浸式深色背景、游戏区域居中放大到 560px），再点退出。
  - **暂停**：顶栏加暂停按钮，游戏中可暂停/继续（停循环保留 state、显示「已暂停」提示）。
  - **保存恢复**：关闭半框时若对局进行中（有比分或球已发）→ 序列化 state 存 localStorage（每联系人独立键 `:pong-saved`）；同会话重开 → 内存 state 直接继续；刷新页面后打开 → 显示「继续上局」按钮从 localStorage 恢复；游戏结束 → 清除保存。开始新游戏也清除保存。
  - **涉及**：`src/js/pong.js`、`src/template.html`、`src/css/chat-pages.css`。临时测试脚本已删。
- [本会话·完成]（**已构建 verify 10/10 + Pong 专项冒烟 11/11，未提交，请构建者统一执行**）：新增双人 Pong 小游戏。
  - **游戏**：玩家左挡板 / TA 右挡板 AI，球持续运动，先得 5 分获胜。Canvas 渲染（逻辑 400×240 + DPR 清晰），球速随回合 +0.2（上限 8），反弹角度按击球点偏移，发球随机方向 ±15°。
  - **TA AI**：基础轨迹预测（含上下边界反弹推演）+ 反应延迟（0.12~0.5s 按难度）+ 移动速度限制（3.2~5.5px/tick）+ 预测误差 + 概率行为池（提前移动/反应慢/偏离预测/提前改变站位/随机失误/连续成功冒险，各带 3~6s 冷却）+ 危险状态提高 AI 更新频率。三难度（简单/普通/困难）。
  - **控制**：手机左半边触摸拖动 / 电脑 ↑↓WS，挡板最大速度限制。
  - **结束**：写入聊天记录（special:'pong' 居中白底卡片）+ TA 随机回应（内置三组字卡池：玩家胜/TA胜/平局，不依赖聊天 AI）。
  - **音效**：Web Audio 短促 beep（碰墙/碰挡板/得分/胜利），可静音。
  - **涉及**：新增 `src/js/pong.js`（AI-A 域业务功能）；`src/template.html`（more-pong 入口 + #chat-pong-panel 半框，AI-B 域）；`src/css/chat-pages.css`（游戏样式，AI-A 域）；`src/js/chat.js`（more-pong 监听 + renderMsg special:'pong' 渲染，AI-A 域）；`src/js/mobile-adapt.js`（FLOAT_SELECTORS 加 #chat-pong-panel，AI-B 域）；`build.mjs`（jsFiles 加 pong.js，AI-B 域）。
  - **验证**：node --check 全过；verify 10/10；Pong 专项冒烟 11/11（入口/面板/Canvas/接口/倒计时/触摸/无JS异常/关闭/重开/难度/静音）。临时测试脚本已删。

### 2026-08-19（GIF 动图上传变静态图修复——用户反馈字卡库表情包/我的表情包动图不动）
- [本会话·完成]（**已构建 index.html；本次提交一并带上 AI-A 已保存的红包长按退回 + ta-ask 第四批等改动**）：
  根因：字卡库【表情包】【图片】批量导入走 `compressImage` canvas 重绘（sticker→PNG 480 / image→JPEG 720），
  「我的表情包」添加走 `compressMyEmoji` canvas 重绘（PNG 260）——canvas 只能画出 GIF 第一帧，动图全被压成静态图。
  修复：两处上传识别 GIF（`f.type` 或文件名 `.gif`）时跳过 canvas 压缩、直存原始 dataURL（保留全部动画帧）；非 GIF 仍走原压缩；我的表情包动图 >8MB base64 跳过并提示。
  涉及：`src/js/chatcard.js`（批量导入）、`src/js/chat.js`（我的表情包添加）。
  验证：node --check 全通过；verify 10/10；无头 Chrome 端到端（劫持 file input click 注入真实 GIF 走完整上传链路）3/3：
  两条路径存储均为 `data:image/gif`（修复前为 `data:image/png`），PNG 仍走压缩回归正常。
  遗留：已上传的旧动图已被压成静态 PNG，无法自动恢复，需用户重新上传。

### 2026-08-19（桌面美化缺陷修复——已随 a49d263 统一构建提交入库，产物已含全部修复）
- [本会话·完成]（**已随 a49d263 构建提交推送**）：对「桌面美化」做缺陷审计（先静态分析 + node 模拟，再对真实构建产物无头 Chrome 18/18 证实），随后修复 7 项（全 AI-B 域 `src/js/personalize.js` `src/css/home.css` `src/css/dark.css` `src/template.html`）：
  ① **文字/倒计时组件编辑+删除彻底失效**：原 setTimeout 里 `querySelectorAll('.modal-pill')` 选择器不存在（pills 实际类名 `.pill`、容器 `#modal-pills`），字号+/字号-/换颜色/删除从未绑定；且保存用 `saveDeskTextsMeta(loadDeskTextsMeta())` 读旧数据存回、编辑丢失。修复：一次 load 持有 meta 引用、pill 动作走 openModal 确定回调（与全站一致）。
  ② **美化方案导出键名不匹配**：BEAUTY_KEYS 写成 `widget-color/widget-border/widget-btn/widget-btn-text/widget-heart`，与真实存储键 `widget-bg-color/widget-border-color/widget-btn-color/widget-btn-text-color/widget-heart-color` 全部对不上，导出静默漏掉 5 项颜色。已改键名。
  ③ **美化方案导出漏图片本体/自定义图标**：`desk-image-src-<id>`（IDB）、`app-icon-*`、`app-icon-order-*` 不在方案里，导入后图片组件空壳、图标自定义搬不走。新增 collectBeauty 动态收集（按 data-app 枚举）+ 导入同步写入。
  ④ **导出 fallback 空弹窗**：clipboard 不可用时原 `noInput:true` 隐藏输入框、JSON 不可见。改用 textarea 展示 JSON 供手动复制。
  ⑤ **删页后 desk-layout 残留**：buildDeskPages 删页不移组件回池但不收缩布局，之后新增页刷新把旧页组件插回新页（"复活"）。修复：删页时已有自定义布局则 saveDeskLayout() 收缩。
  ⑥ **背景模糊常驻 backdrop-filter**（iOS 红线）：blur(0px) 也保持 filter 激活、全屏每帧栅格化。改为 `.phone-bg-mask` 仅 `blur-on` 类（px>0）启用 backdrop-filter，默认移除。顺带深色模式遮罩改黑（dark.css 补 `.phone-bg-mask` 覆盖）。
  ⑦ **组件圆角漏新组件 + 默认值不一致**：`.desk-text-widget/.desk-countdown-widget` 漏写圆角（恒直角）、`.desk-image-widget` 用图标圆角；已全部改 `--desk-card-radius`，:root 默认 16px→20px 对齐 JS。
  另：设置页「桌面字号/卡片大小」补「仅桌面/大屏生效 · 手机端为 iOS 性能保持默认」副标题（手机端 zoom 强制 1 的现状提示）。
  验证：隔离构建 + 无头 Chrome 17+4 项全过（编辑保存/字号+/删除/倒计时编辑删除/导出 5 键/fallback textarea/删页收缩/圆角 12px/blur 10px 开启+dark/0px 关闭 none）。临时脚本已删。

### 2026-08-19（用户三次反馈「正在输入行是整行图形、滑动遮挡」——真实根因是版本更新机制失效，用户从未加载到修复版）
- [本会话·完成]（**已构建 verify 10/10 + CDP 端到端验证，已随 a49d263 提交推送**）：用户三次反馈同一问题，前两轮只改 `.chat-typing` CSS（fit-content→align-self:flex-start）并验证线上已部署，但用户始终看不到修复。**深挖发现真正根因不是 typing 样式，而是版本更新机制从未生效**：
  ① **`template.html` 结构性 bug（核心）**：`ver-update-bar`/`backup-remind-bar` 位于 `<script>`（`/*__SCRIPTS__*/`）**之后**，而 pwa.js 启动即 `getElementById('ver-update-bar')` → null → `if(!bar) return` 直接退出 → **版本检测/备份提醒整块逻辑从未执行**（desk-image-viewer 曾有同类坑，注释明确要求必须在 script 前，两个 bar 漏了）。用户永远收不到「检测到新版本」提示，一直停留在旧缓存（悬浮式/全宽式 typing 行）。
  ② **pwa.js 基线 bug**：基线取「首次 fetch 的 version.json」——旧缓存页面 + version.json 拿到最新时间戳时基线被污染成最新版 → `ts > baseTs` 永远 false → 永不提示。
  ③ **sw.js 拦截 version.json**：网络优先 8s 超时 + 带 `?v=` 唯一参数缓存永不命中 → 慢网络下版本检测 fetch 静默失败。
  修复：①ver-update-bar/backup-remind-bar 移到 `<script>` 前；②build.mjs 注入 `__BUILD_TS__` → template `splash-ver data-build-ts`，pwa.js 加载时直接取页面自身构建时间戳当基线（首次 fetch 即可比较，不依赖 30s 轮询）；③sw.js 放行 version.json/notice.json 不走 SW；④sw.js 导航回退兜底找任意旧缓存 index.html。无头验证：注入旧基线 + 服务器返回新 version.json → 更新条 barHidden=false 正确触发（修复前从未触发）。涉及 `src/template.html`、`src/js/pwa.js`、`src/pwa/sw.js`、`build.mjs`（全 AI-B 域）。

### 2026-08-19（本会话，用户需求「猜拳手势矢量图重设计，旧版太丑」）
- [本会话·完成]（**已构建 verify 10/10，已提交**）：猜拳全套手势图标换为 Phosphor Icons（MIT）三件套——石头=hand-fist 拳头 / 剪刀=hand-peace V 手势 / 布=hand-palm 张开手掌（viewBox 0 0 256 256，path 带 fill="currentColor"，颜色仍走各处 CSS color，深浅色自动适配）。替换 4 处：①`src/template.html` more-rps 更多面板入口图标——旧版是四指抬手，与「拍一拍」入口几乎一模一样（用户觉得丑/混淆的主因），改用拳头（「猜拳」字面即拳头，区分度明显）；②③④半框三个出拳按钮（template.html rps-choices）+ `src/js/chat.js` renderMsg 消息卡片 rpsIco 映射——旧版为手绘直线拼凑路径（石头=带竖线方块、剪刀=两根悬空竖线，辨识度差）。选型过程：Iconify API 拉取 Phosphor 常规与 FA6 实心两套候选 → 无头 Chrome 截图对比页 + 视觉评估（Phosphor 手势一眼可辨、线宽与邻居图标协调，胜出）；构建产物里拳头 3 处（入口+按钮+消息卡）/剪刀布各 2 处嵌入计数验证，浅色卡片/深色卡片/出拳按钮三场景渲染确认正常。`.shot-tmp/` 临时预览已清理。
- 本次提交同时包含对方 20:25-20:34 保存的完整批次（feed.js IndexedDB 就绪门槛 feedDbReady+feedPending 防 Edge 丢动态 / mail.js / music-player.js / ta-ask.js 相关完善），均已进过 20:35 产物、内容完整自洽，按惯例随本次产物统一提交。

### 2026-08-19（本会话，用户需求「来电概率也改成每 30 秒检查一次」）
- [本会话·完成]（**已构建 verify 10/10 + 已提交 2276bb7**）：`src/js/call.js`（AI-B 域）来电触发机制微调——
  TA 回复消息/主动发消息后按「通话设置-来电概率」掷一次来电**保持不变**（chat.js 钩子未动）；独立兜底定时器 `setInterval(maybeIncoming, 60000)` → **30000**（每 30 秒检查一次，5 分钟冷却与后台不触发逻辑不变），同步更新文件头/段注释。
  附带：本次提交包含对方 18:21 刚保存的 `src/js/personalize.js` 改动（单功能图标仍在 app-grid 内时不移到 slide，避免刷新后图标横变竖）——已 node --check 通过、内容完整自洽，产物同次提交。
  ⚠️ 注：对方挂断仍为「接通满 3 分钟后每 60 秒检查」（v3.6.x 起故意放宽），用户口述「和挂电话一样每 30 秒」与现状有出入——如需挂断也改 30 秒请告知。

### 2026-08-19（⚠️ push 阻塞：用户反馈批量管理搜索「还是不行」）
- [本会话] 排查结论：**修复已在本地构建产物中且功能验证通过，但从未 push 上线**（`git push` 报 `could not read Username for 'https://github.com'`——本环境无 GitHub 凭据，也无 gh CLI/credential store）。线上 GitHub Pages 一直是旧版 → 用户手机访问的仍是旧行为（管理模式搜索输入即清空）。
- 当前待 push 的本地提交（按序）：`605db6b`（批量管理放开搜索+修复 chat.js 语法错误）→ `223cfb5`（TA 话术池区块）→ `c22e3b8`（网易云时长 no-referrer）。**请有凭据的一方执行 `git push origin main`**；push 后 PWA 用户需等 sw 更新/二次刷新才生效。
- 已再次验证当前构建（17:16）搜索链路：冒烟通过（管理态输入即筛/输入保留/全选过滤感知/退出管理，0 JS 错误；1 个 FAIL 为测试脚本选择器误报，非产品问题）。

### 2026-08-19（本会话，用户需求「批量管理字卡时无法搜索字卡」——已放开搜索，已构建 verify 10/10 + CDP 功能 19/19，本次统一提交）
- [本会话·完成]：**字卡库「批量管理」模式放开搜索**（AI-A 域 chatcard.js，用户直接反馈故本会话实现）。原 v3.5.130 出于安全禁用（搜索过滤曾导致勾选下标与原始数组错位、删除误删别的卡）；v3.7.x 搜索已保留原始索引（{c,oi}），根因消除，本次拆锁并补 3 个配套安全点：
  ①搜索输入事件去掉 `if (manageMode) 清空` 拦截，过滤视图变化时清空已选（防残留屏幕外选中）；②`selectedKeys`（全选）改为过滤感知——搜索/分组筛选态只选当前可见卡，不连选屏幕外；③`delSelected` 搜索态强制全量 render（rebuildGroupAfterRemove 重建整组不带过滤会"复活"不匹配卡）；分组 chip 切换视图同样清空已选。enterManage 不再清空搜索，保留当前视图继续筛选。
  CDP 功能 19/19：非管理搜索回归、管理态搜索过滤/保留关键字/勾选/全选切换/全选只选可见、无搜索全选全部回归、搜索态删除只删匹配卡（甜话剩2+日常2）、空态、清空恢复、进出管理。
- ⚠️ **代修 AI-A 语法错误**：`src/js/chat.js` 16:41 保存的改动把 `tryCollectPending` 重复定义（新函数带「TA 收取后发感谢」插在旧函数前 + 多一个 `}` + 旧函数未删）→ **整包 JS SyntaxError，`__mochiDataReady` 永置 false、开屏卡死、verify 全挂**。已删多余 `}` 与旧重复函数，保留带感谢逻辑的新版。请 AI-A 确认意图无误。
- ⚠️ 本次构建包含 16:23 后双方全部累积改动（通话半框/猜拳/红包封面+领取概率/音乐歌单时长/桌面美化/dark.css 微调/本搜索放开），**已统一提交**，产物与源码同次提交。

### 2026-08-19（本会话，用户需求「聊天页更多功能→通话：新增通话半框 + 可开关通话小框」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 16/16，未提交，请构建者统一执行**）：新增「通话半框」。
  ①**入口**：`src/js/chat.js` 更多功能「通话」(#more-call) 不再直接拨打 → 改为打开底部半框 `#chat-call-panel`（复用 .poke-card 容器，`src/template.html` 置于占卜/猜拳半框旁）；切联系人桌面自动关半框。
  ②**半框内容**：当前通话状态行（空闲/正在呼叫/来电/通话中+时长，每秒刷新）+「拨打语音通话」大按钮（placeCall，降级旧逻辑兜底）+「挂断通话」红色按钮（window.hangupCall）+「通话小框」开关 + 说明文案。
  ③**通话小框开关**：`src/js/call.js` 新增 `call-mini-enabled`（每联系人桌面独立，默认开）——开启：接通 2 秒自动最小化悬浮小框（原行为）；隐藏：接通后保持大面板常驻、点「缩小」收起进后台不弹小框（经半框挂断）；暴露 `window.getCallMiniEnabled/setCallMiniEnabled/getCallState/hangupCall`；answerCall/placeCall 的 2 秒最小化与 minimizeCall 均按开关分支。
  ④**适配**：`src/js/mobile-adapt.js` FLOAT_SELECTORS 加 `#chat-call-panel`（锁背景滚动）；`src/css/chat-main.css` 加 .call-panel-status/.call-panel-dial/.call-panel-hang/.call-panel-switch/.call-panel-hint（dark.css 由 .poke-card/var(--ink) 自动适配）。
  ⑤**验证**：CDP 冒烟 11/11（更多面板→半框打开/状态文案/按钮显隐/开关默认开/切换持久化 0↔1/重开保持/无 JS 错误）+ 行为 5/5（关：接通后 mini 不显示、大面板常驻通话中；开：接通后 mini 显示、大面板收起）。
  ⚠️ **提示构建者**：16:24 对方还在改 `src/css/dark.css`（红包/猜拳暗色微调，**未构建**）——请确认其保存完整后统一重新构建提交（当前 index.html 为 16:23 产物，已含双方 16:23 前的全部改动：通话半框 + music-player.js 歌单时长/文案 + bg-keep.js 媒体会话让位）。

### 2026-08-19（本会话，用户反馈「网易云歌单导入：批量导入没写可导入歌单/没写仅免费可播；导入后列表无时长、播放才加载；手机浏览器可能拦截」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 冒烟 9/9 + 真实歌单 E2E，本次统一提交**）：`src/js/music-player.js`（AI-A 域，用户直接反馈故本会话统一实现）。三点全修：
  ①**文案补全（issue#1）**：批量导入面板重写提示——3 种方式置顶（网易云歌单链接 / 网易云单曲 ID / 本地直链格式），明确「⚠ 网易云导入仅支持播放免费歌曲，VIP/付费歌曲可能无法播放；部分手机浏览器可能拦截，失败可稍后重试」；占位符加歌单链接示例；链接添加面板同补免费说明 + 歌单链接说明；歌单导入失败 toast 改「可能私密/已失效/被浏览器拦截」。
  ②**时长一次性补全（issue#2）**：新增时长补全链路——`fetchV6Durations`（官方 v6 歌单详情含每曲 dt，经 3 个 CORS 代理并行拉、7s 兜底）+ `enqueueDurProbe`/`probeOneDuration`（<audio preload=metadata> 探测，与播放同源 meting URL、无需 CORS 代理、移动端可用，并发 4 后台跑）；`importNeteasePlaylist` 导入后自动触发（v6 快路径 → 探测兜底），链接添加/批量导入单曲同步探测，打开音乐页时 `probeAllMissingDurations()` 补历史遗留歌曲；`parseNeteasePageTitle` 顺带解析歌曲页 `music:duration` meta（零额外请求）；播放 `loadedmetadata` 补 `updateDurUI` 即时刷新列表时长（不再等整页重渲染）。CDP 实测：种子 2 首 1s 内补全（04:55/03:30 与官方 dt 一致）、真实导入热歌榜 200 首全部时长补全显示（仅 2 首 VIP 保持 00:00 属预期）。
  ③**移动端防拦截（issue#3）**：`fetchNeteasePlaylist` 新增 i-meto meting 镜像源（独立域名，主源被拦时兜底，字段 title/author 兼容解析）；保留官方 v6 代理兜底；失败提示引导重试。
  `node --check` 通过；本次构建同时包含会话内 RPS 猜拳/正在输入修复/表情包分组等已保存改动，统一提交。

### 2026-08-19（本会话，用户需求「聊天更多功能新增猜拳互动，联系人随机出拳」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 猜拳功能 12/12，未提交**）：新增「猜拳」互动。①**入口**：`src/template.html` more-grid-fun 加 `more-rps` 按钮（手势 SVG 图标，位于拍一拍与头像互动之间）；②**半框**：`chat-rps-panel`（复用 .poke-card 容器）含战绩行（胜/负/平，存 localStorage `rps-score`）+ 提示行 + 三大出拳按钮（石头/剪刀/布，各带手势 SVG）；③**逻辑**：`src/js/chat.js` 绑定 more-rps→openRpsPanel（关闭其他半框+more-panel）、出拳→sendRps：联系人出拳 `['rock','scissors','paper'][Math.floor(Math.random()*3)]` 纯 1/3 均匀随机每次独立 → rpsJudge 判定 → addRec({special:'rps',rpsMine,rpsTa,rpsResult}) 写入聊天 → 战绩更新；④**消息卡片**：renderMsg 加 `special==='rps'` 分支，居中白底灰边卡片，双方手势 SVG 图标+「你·石头 VS TA·布」+ 结果文字（你赢了/你输了/平局），简约无彩色；⑤**样式**：`src/css/chat-main.css` 加 .rps-score/.rps-hint/.rps-choices/.rps-choice/.rps-c-ico + .msg-rps/.msg-rps-card/.msg-rps-hands/.msg-rps-hand/.msg-rps-ico/.msg-rps-name/.msg-rps-vs/.msg-rps-result；⑥**接线**：`src/js/mobile-adapt.js` FLOAT_SELECTORS 加 `#chat-rps-panel`（锁背景滚动）；`src/css/dark.css` 加暗色适配。涉及 AI-A 域（chat.js/chat-main.css）+ AI-B 域（template.html 已进对方 20adafe 提交/mobile-adapt.js/dark.css），用户直接反馈故跨域。**未提交**（chat.js 含对方未提交的 partialRetactMsg 改动，等待统一提交）。

### 2026-08-19（用户反馈「聊天页正在输入行又变成一整行图形、滑动遮挡消息」，二次反馈未解决）
- [本会话·完成]（**已构建 verify 10/10 + CDP 双场景验证，随本次提交**）：`src/css/chat-main.css` `.chat-typing`（AI-A 域文件，用户直接反馈故越界修复）。**真实根因**：聊天页设置壁纸（cs-bg 铺满 #page-chat）时，`.chat-typing` 是 `#page-chat`（flex column）直接子项，`align-items` 默认 stretch 把它拉成**整行全宽透明块**（实测 354px），整行透出壁纸图案 = 用户看到"这一整行是一个图形"；v3.5.47 曾用 `width:fit-content` 解决，v3.6.x 改内嵌时漏掉，仅加 fit-content 在部分内核不可靠。修复：`.chat-typing` 加 **`align-self:flex-start`**（flex 交叉轴不拉伸，宽度收缩到内容，flex 基础属性所有内核必支持，不依赖 fit-content 关键字）+ 保留 `width:fit-content` 双保险。CDP 验证两场景（fit-content 正常 / 用 `width:auto!important` 模拟 fit-content 失效）：typing 行宽度均 121px 窄条、alignSelf=flex-start、滚动后无消息在行下（msgsUnderTyping=0）、elementFromPoint 命中 page-chat 而非消息。涉及 `src/css/chat-main.css` + 产物。本次构建同时包含 AI-A 已保存改动（chat.js 问问TA半框文字错位修复/音乐批量链接/互动回应池等 7 文件，node --check 全过），统一提交。

### 2026-08-19（本会话，用户反馈「聊天表情包→我的表情包：管理分组图层不在最顶 + 新建分组不显示在顶部」）
- [本会话·完成]（**已随 1f14419 构建提交推送**）：`src/js/chat.js` + `src/css/chat-pages.css`（均 AI-A 域）。三个问题一并修复：
  ①**管理分组弹层不在最顶**：`.mg-mask` z-index 60 < 聊天表情半框 `.poke-card` 70 → 弹层被半框盖住。改 z-index 85（高于 poke-card 70/消息气泡菜单 80，低于 openModal `.modal-mask` 90，重命名/删除确认仍盖在其上）。
  ②**新建分组不显示在顶部**：a) 分组栏 `renderEmojiGroupsBar` 只显示有内容的分组（`filter(g => g[1].length)`），新建的空分组永远不可见（且无法选中，点「添加」会加进别的组）→ 我的表情包模式改为显示全部分组（含空的，计数显示 0），TA 的表情包仍只显示有内容分组；b) 新建分组 `push` 到末尾 → 改 `unshift` 插到最前，创建后自动选中并打开该分组、自动关掉管理弹层（与字卡库管理分组一致）；「添加」无分组时自动建的「默认」同样 unshift。
  ③**顺带修复隐藏大 bug：我的表情包刷新后整组消失**——`myEmojiLoad()`（读 localStorage）定义了但**从未被调用**，启动恢复块只在「IDB 内容比 LS 多」时才覆盖赋值，正常双写（LS=IDB）时 `myGroups` 恒为空数组 → 每次刷新后我的表情包显示「暂无」。修复：启动即 `myGroups = myEmojiLoad()`（与 chatcard.js cc-groups 的 loadGroups 模式对齐，恢复块仍保留 IDB 更多时覆盖）。
  temp 隔离构建 + CDP 复测（seed LS+IDB → 刷新 → 全部通过）：刷新后分组栏 `[默认1, 猫咪0]`（修复前为空）、管理弹层 z 85>70、新建「猫猫」→ 弹层自动关 + chips `[猫猫0, 默认1, 猫咪0]` 置顶且选中、存储顺序 `[猫猫, 默认, 猫咪]`、再刷新持久。**已随 1f14419 构建提交推送**（对方统一构建包含本改动+产物）。

### 2026-08-19（本会话，用户反馈「问问TA 半框输入文字显示在输入框外面」（安卓 Chrome/Edge））
- [本会话·完成]（**已随 1f14419 构建提交推送**）：`src/js/chat.js` + `src/css/chat-main.css`（均 AI-A 域）。排查：半框输入框是安卓转换的 contenteditable（ce-box），位于 `position:fixed` 的 `.poke-card` 面板内；新版安卓 Chrome 键盘只缩放视觉视口（chromium issue 40251217），键盘弹出动画把 fixed 半框整体上移时，聚焦 contenteditable 的文本合成层偶发停在旧位置 = 文字显示在框外（聊天主输入栏在文档流内，不受影响）。修复：①chat-main.css `.chat-ask-input:focus`/`.chat-ask-opts:focus` 加 `transform:translateZ(0)`（聚焦期间独立合成层，逐帧按当前布局位置合成）；②chat.js `openChatAskPanel` 聚焦后给输入框内联 `translateZ(0)`（无头验证 `:focus` 在部分焦点态不匹配，内联样式兜底），`closeChatAskPanel` 与单选选项框显隐（syncOptsHidden）时清除/设置同款。已 temp 隔离构建 + CDP 复测：聚焦态 transform=matrix、键盘弹出动画后输入文字仍在框内（textInBox=true）、单选选项框同款、无 JS 错误。**已随 1f14419 构建提交推送**。提示 AI-B：如需通用化，可在 mobile-adapt.js 对 fixed 面板内（`#chat-search-input`/帮我决定/占卜问题框等）ce-box 聚焦时同样加内联 translateZ(0)——当前仅修了问问TA 半框。

### 2026-08-19（本会话，AI-A：网易云歌单一键导入）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：用户需求「直接导入网易云的歌单」。`src/js/music-player.js`（AI-A 域，未动 template.html）：
  ①**识别**：`extractPlaylistId` 识别歌单分享链接（music.163.com/playlist?id=、y.music.163.com/m/playlist?id=、#/playlist?id= 等格式，8/8 单测通过）；
  ②**数据源**：`fetchNeteasePlaylist` 主源 meting API `type=playlist`（api.injahow.cn，与播放同源稳定无 CORS，约 200 首上限；响应 url 提取歌曲 ID 复用 `neteaseMetingUrl` 播放）+ 兜底网易云官方 v6 歌单详情 API（无 Cookie 全曲目，经 allorigins/corsproxy/codetabs 代理——实测当前代理基本失效，保留作未来恢复能力）；
  ③**入口**：「链接添加」输入框粘贴歌单链接自动导入整歌单（可多个混排，歌单行+单曲行共存时分别处理）；「批量导入」同样识别歌单链接（纯链接行、标签格式里的 URL 值均支持）；提示文案同步更新；
  ④**去重**：按 neteaseId 跳过已有歌曲（重导入全跳过，实测）；失败歌单 toast 提示「可能私密或已失效」；封面 http→https 规范化；
  ⑤**实测**：真实导入热歌榜 200 首（名/歌手/封面/直链齐全）、重导入 0 新增、无效歌单快速失败。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-A：音乐支持批量上传数字链接）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：用户需求「音乐里上传数字链接，可以批量上传」。`src/js/music-player.js`（AI-A 域，未动 template.html）：
  ①**「链接添加」支持批量**：输入框改为多行 textarea，一次粘贴多个网易云数字 ID / 音乐直链，每行一个，逐条导入（多行时歌曲名/歌手自动识别，单行行为不变）；toast 区分「已批量添加 N 首」/「链接音乐已添加」。
  ②**「批量导入」兼容纯链接粘贴**：整段无「歌曲名称：xxx」式标签时自动按每行一个 ID/链接导入（无需格式标签），歌名取链接文件名或默认名，网易云 ID 自动识别歌名；原格式模式不受影响。`node --check` 通过，解析正则已单测。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-B：桌面美化自由度+便捷增强）
- [本会话·完成]（**已构建 verify 10/10，未提交**）：用户需求「增加桌面美化自由度和便捷」。新增 5 项功能（全在 AI-B 域）：
  ①**背景模糊/遮罩**（`src/template.html`加`.phone-bg-mask`层 + `src/css/home.css` backdrop-filter + `src/js/personalize.js` slider 0-20px / 0-80%）——不破坏现有背景逻辑，backdrop-filter 模糊 .phone 背景图，白色遮罩调透明度；
  ②**组件卡片圆角**（CSS 变量 `--desk-card-radius` 统一应用到所有桌面组件，slider 0-30px，默认 20px 保持兼容）；
  ③**自定义文字组件**（可多个，`desk-texts` 元数据，装修模式点击编辑文字/字号+/字号-/换颜色/删除）；
  ④**通用倒计时组件**（可多个，`desk-countdowns` 元数据，格式"标题|日期"，自动计算剩余天数，装修模式点击编辑/删除）；
  ⑤**美化方案导入导出**（收集所有美化 key 打包 JSON，导出复制到剪贴板，导入粘贴写回+刷新）。
  每页独立背景/主色调/组件透明度/图标圆角等已有功能确认存在，未重复开发。
  涉及 `src/template.html`+`src/js/personalize.js`+`src/css/home.css`+`WORKLOG.md`+产物。**未提交**（不含 AI-A 进行中改动 chat.js/ta-ask.js/default-cards*.js），等待统一提交。

### 2026-08-19（本会话，用户需求「互动卡片系统预设回应话术池，在字卡库→系统预设字卡里展示」）
- [本会话·完成]（**未构建未提交**，请构建者统一执行）：新增「互动回应」tab + 逐张开关联动回复抽取。①**数据**：`src/js/default-cards-data.js`（AI-A 域）`DEFAULT_CARD_DATA` 新增 `interact` 分类（7 分组：邀请TA·接受 5 / 邀请TA·拒绝 4 / 问问TA·回应 11 / 小问题·回应 96 / 好奇·回应 113 / 吐槽·回应 7 / 询问·回应 5，共 241 条）——小问题/好奇两池由临时脚本从 ta-ask.js `TC_DEFAULT`/`TCU_DEFAULT` 提取去重合并，脚本已删；②**UI**：`src/js/default-cards.js` JS 注入「互动回应」tab（**未动 template.html**，避免越界），复用现有分组/搜索/单卡开关体系；③**接线**：`src/js/ta-ask.js` `pickAskCardReply` 过滤 `isDefaultCardOff('interact', …)` 已关闭话术；吐槽池（ta-ask.js 2059）、邀请TA 接受/拒绝与问问TA 文字题池（chat.js）改为 `getInteractPool(分组名, 回退内置池)` 同源读取；`src/js/chat.js` `chatChooseReply` 默契命中路径同样过滤已关闭话术（`presetOff`）。普通聊天回复池 keys 不含 interact，不受影响。`node --check` 4 个文件全过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19（本会话，AI-B：apps/p2apps 添加 bug 修复 + 回前台汇总通知）
- [本会话·完成]（**已构建 verify 10/10 + CDP apps/p2apps 添加测试通过，未提交**）：
  ①**功能图标添加无反应 bug 修复**（用户反馈）：根因——`WIDGET_IDS` 含 `'apps'`/`'p2apps'` 但 template app-grid/p2-grid 无 `data-desk-widget` 属性，`querySelector('[data-desk-widget="apps"]')` 返回 null → `if(!node) return` 静默退出。修复：template app-grid 加 `data-desk-widget="apps"`、p2-grid 加 `data-desk-widget="p2apps"`；`applyDeskLayout` 跳过 apps/p2apps 池逻辑（老兼容：老 layout 不含它们，避免老用户功能图标被移到隐藏池消失）。CDP 复测：apps 从 p0 成功添加到 p1（toast"已添加到本页"）、p2apps 已在目标页时按钮正确 disabled。涉及 `src/template.html`+`src/js/personalize.js`（AI-B 域）。
  ②**回前台汇总系统通知**（`src/js/bg-keep.js`，AI-B 域）：回前台瞬间若有未读消息且不在聊天页，除应用内横幅外再发一条汇总系统通知「你不在的时候收到 N 条新消息」（后台冻结导致消息/通知没能实时到达，回前台一次告知），30 秒去重防刷屏。涉及 `src/js/bg-keep.js`。
  临时测试文件 `tools/test-apps.mjs`+`.shot-tmp/` 已清理，`personalize.js` 临时 `__openDeskLib` 暴露行已删。**未提交**，等待统一提交/部署。

### 2026-08-19（本会话，用户反馈「编辑字卡点确认会卡顿」）
- [本会话·完成]（**已构建 verify 10/10 + CDP 延迟/功能复测 11/11，已提交**）：`src/js/chatcard.js`（AI-A 域）——单卡编辑确认卡顿修复。**根因量化**：确认回调里 `saveGroups` 同步 `JSON.stringify(整个字卡库)`，14.8MB 库（30 图+10 语音 1MB×10+300 文字）序列化 66ms 阻塞在弹窗关闭前（真实语音库手机上可放大到几百 ms）。**修复**：①持久化延后——确认只更新内存+DOM（弹窗即时关、卡片即时变），`scheduleSave()` 120ms 合并写入；②搜索态编辑不再整列表重渲染——仍匹配关键词原地更新，不匹配则局部移除卡片+同步 header 计数（`rendering` 分块渲染进行中才走全量 render，防旧批次复活）。**CDP 复测**：普通视图确认 65.5ms→2.9ms、搜索态 69.7ms→2.6ms、连续编辑 3 次 6.7ms 全落库、延后保存 300ms 落库正确、搜索态不匹配卡移除+计数-1、仍匹配原地更新、无 JS 错误（11/11）。**本次构建不含对方进行中改动**（personalize.js/template.html 刚被对方保存 + 未跟踪 `tools/test-apps.mjs`/`.shot-tmp/`），提交只含 chatcard.js+产物+本记录，对方批次由对方提交。

### 2026-08-19（本会话，用户反馈「联系人的回复设置没有按已设置保存的数字和概率触发」）
- [本会话·完成]（部署确认）：对方已统一构建并提交推送（fdb3e87「主动发送设置立即生效」+ eabeb02，main=origin/main，线上已更新）。本会话对**线上构建产物**（仓库 index.html）复测：`window.rescheduleAutoSend` 存在、被动回复按 rs-min=2 于 3.6s 到达 PASS。用户反馈的问题（主动发送间隔被压回 30 分钟/改设置不立即生效/切桌面不重排/免打扰 1 秒就发）已全部修复并上线。遗留：仓库根 `.shot-tmp/` 未跟踪目录（对方 CDP 截图临时目录，请确认后清理或忽略）。
- [本会话·诊断完成]（用户反馈「联系人的回复设置没有按已设置保存的数字和概率触发」——**结论：线上版本（origin/main 25a8cbd）缺 v3.7.x 主动发送修复，对方未提交批次已含全部修复，待构建部署；本会话已在隔离副本构建 + CDP 全链路验证通过**）：未动仓库任何文件（对方正在编辑中）。排查与验证：
  1. **线上版本 bug 确认**（`git show origin/main:src/js/chat.js`）：①`Math.min(30, as-min)` 把「发送间隔最短」>30 分钟一律压回 30 分钟（设 60 分钟实际 30 分钟就来）；②无保存后重排（改了概率/间隔要等挂起定时器最长几小时才生效）；③无 contact-switched 重排（切桌面后旧桌面定时器继续用旧设置）；④dnd-en=1 时 asMin=1（秒）——免打扰反而 1 秒就发。**均已在对方未提交的 chat.js v3.7.x 批次中修复**。
  2. **隔离副本验证**（temp 目录复制 src + node build.mjs + CDP 390×844）：①设置页 UI 保存全链路（stepper ± 点击落库、直接输入数字落库、保存按钮、回显）7/7；②被动回复 rs-min=2 → 首条 2.5s 到达、条数按 reply-min/max=2~3、rn-prob=100 只发已读不回、无 JS 错误；③UI 设 rs-min=8 → 回复 9.15s 到达；④主动发送 as-min=as-max=1 → 60s 到达；⑤保存 as-min=2 后定时器立即重排（60s 内不再发）；⑥切到新桌面 B（as-min=1）→ 55s 按 B 的设置发，聊天无 A 残留。
  3. 结论：**当前 src 已正确按保存的数字/概率触发，问题只在未部署**。请构建者（对方批次完成后）执行 `node build.mjs` + `npm run verify` + 提交推送（对方当前批次：chat.js/chatcard.js/reply-settings.js/personalize.js/template.html/home.css 等未提交改动 + 本会话无改动）。临时测试脚本在 temp 目录（mochi-replytest），未入库。

### 2026-08-19
- [本会话] 完成（用户需求「开屏公告里『【关于mochi字卡】』标题删掉」——**未构建未提交**，请构建者统一执行）：移除开屏公告标题「关于 Mochi 字卡」——`src/template.html` 删除 `.splash-notice-title` 行（离线兜底）、`src/pwa/notice.json` 删除 `title` 字段（在线覆盖源；clock.js 对缺失 title 已有兼容，不影响）。涉及 `src/template.html`（AI-B 域，用户直接反馈故越界，仅删文案行无逻辑改动，请知悉）。**未构建未提交**，等待统一构建/提交。

### 2026-08-19
- [本会话] 完成（用户需求「装修模式组件库可直接看到小组件样式预览；新增日历/时间等桌面小组件」——**已构建 verify 10/10，未提交**）：`src/template.html` + `src/js/personalize.js` + `src/css/home.css`（AI-B 域为主，home.css 桌面组件样式历来由此方改）。①**组件库静态预览**：`openDeskLib` 每项左侧加 72×52 缩略图（`WIDGET_PREV_HTML`，纯 HTML+CSS 示意，不依赖真实数据/事件），右侧名称+位置+按钮（`.dl-prev/.dl-meta/.dl-name`）；图片项也加预览。②**4 个新组件**（默认放 `#desk-widget-pool` 隐藏池，用户从组件库添加）：**时钟** `desk-clock`（大时:分 + 星期 + 月日，5 秒更新）、**月历** `desk-calendar`（当月 7 列网格，高亮今天，有留言日子标红点 `cal-my-<date>`，点击跳日历页）、**计时器** `desk-timer`（正计时/倒计时切换，开始/暂停/继续/重置，倒计时输分钟数，到 0 提醒+震动）、**纪念日倒计时** `desk-anniv`（读 `love-start`+`mem-extras` 找未来最近纪念日显示天数）。渲染入口 `renderDeskWidgets` 在启动/`applyDeskLayout`/`contact-switched` 调用，时钟/计时器 init 幂等。③**回应对方 12:33 警告**：home.css 配套样式已补全（`.desk-clock/.desk-cal/.desk-timer/.desk-anniv` + `.dcal-grid` + `.dt-btn` 等），12:38 构建产物完整。`node --check` 通过，verify 10/10。**未提交**，等待统一提交/部署。⚠️ 本次构建同时带上对方已保存改动（chat.js/chatcard.js/reply-settings.js，语法均通过），一并进产物。
- [本会话] 单卡编辑功能**并行重复实现确认**（用户需求「自定义聊天字卡单卡可点击编辑」）：本会话在 chatcard.js 独立实现了相同的 openEditCard/updateCardDom（12:32 构建时发现对方 e7b9a93 已提交同功能，代码一致无冲突）。本会话**净增量 = 搜索态原始索引修复**：对方提交的版本在搜索过滤下 `data-idx` 是过滤后索引，搜索态点击编辑会按错位索引改错字卡（CDP 复现）；已修复——搜索分支把元素映射为 `{c, oi}` 保留原始索引，`render()` flat 构建按 `q` 分支取值。**已构建 verify 10/10 + CDP 端到端 19/19**（点击文字卡弹编辑/预填/保存落库/计数不变/未变化不保存/组内重复拦截/空内容拦截/emoji·kaomoji·拍一拍可编辑/图片卡仍开大图/管理模式仍勾选/搜索态编辑不串位/无 JS 错误），**未提交**（产物与对方进行中批次耦合，见下）。
- ✅ 我方 12:33 警告的「home.css 样式缺失」已被对方补全（见上一条对方记录），组件库预览+4 新组件批次完整；本会话 12:44 已重新构建（index.html 含全部双方改动，含对方 12:41 补充的 `ip-opt-row` 已作答选项样式）+ verify 10/10 + 冒烟 9/9（时钟/月历/计时器/纪念日初始化正常、组件库 14 项、单卡编辑回归、无 JS 错误）。**本次统一提交含：搜索态索引修复（chatcard.js）+ 新组件批次（template/personalize/home.css/reply-settings/chat.js）+ ip-opt-row 样式（chat-main/dark.css）+ 产物。**
- [本会话] 完成（用户反馈 HUAWEI 70 Pro Edge 两个问题：「聊天里联系人发布了一条朋友圈，但点进朋友圈没有」+「聊天里的系统消息错误显示其他桌面的联系人消息」——**已构建 verify 10/10 + CDP 复现/复测 8 项全过，已随对方 e7b9a93 提交，未 push**）：`src/js/feed.js`（AI-A 域）。①**跨桌面系统消息串桌面**（复现确认）：`maybeAutoPost()` 遍历所有联系人，`maybeAutoPostFor(cid)` 发的「X 发布了一条朋友圈动态」用 `chatAddSystem` 写进【当前激活桌面】聊天——用户停在 A 桌面时 B 的 TA 自动发动态，消息进 A 聊天（A 桌面收到其他联系人消息）。修复：新增 `notifyFeedPostToChat(cid, taName)`（仿 call.js `notifyCallEnd` 模式）——cid=当前桌面走内存链路实时渲染；非当前桌面直接写该桌面 IDB `chat-msgs` + LS 快照，消息归位到动态所属桌面。②**朋友圈发布不显示**（Edge 丢 IDB 数据类，WORKLOG 有 vivo S16 Edge 实录）：feed-posts 含图片 dataURL 时主键 >200KB → `xyStore.set` 只进 IDB+内存缓存、跳过 LS（5MB 配额保护），Edge 杀后台/强制关闭丢 IDB → 聊天里的系统消息还在（chat 有 ≤2MB LS 快照），朋友圈空空如也。修复：仿聊天 `writeLsSnapshot`——`save()` 在主键 >200KB 时写「剥图快照」（imgs/头像 dataURL 剥掉只保文本，限制 ≤200KB 防被 idb.js 大键迁移搬走）到 `xy-home-v2:default:feed-posts-snap`（default 命名空间防 contacts.js migrateLegacy 迁移）；`load()` 主键缺失（null）时回读快照（注意：原 `store.get(KEY)||'[]'` 写法在键缺失时返回空数组提前 return，快照兜底永不生效，已改为 `raw!==null` 判断）；清空动态时同步删旧快照；启动 idbGet 恢复加「IDB 比快照旧不回退」（防 Edge 重建空库/上次写失败导致新动态消失）。CDP 复测：B 桌面 TA 自动发动态 → A 聊天无 B 消息（只剩 A 自己的）、B 聊天 IDB+LS 含「小红 发布了一条朋友圈动态」、朋友圈页可见 B 动态、>200KB 主键不入 LS 但剥图快照落 LS、删 IDB 后刷新朋友圈从快照恢复 5 条动态。**已提交**（对方 12:30 统一提交含本改动+产物），**未 push**。⚠️ 对方正在编辑 `src/template.html`（进行中，勿动）。

### 2026-08-19
- [本会话] 完成（用户反馈「聊天更多→拍一拍：顶部已有分组切换，下方字卡列表不应再显示分组标题」——**已构建 verify 10/10，已提交 e7b9a93，未 push**）：`src/js/chat.js`（AI-A 域，用户直接反馈故越界修复）——`renderPokeCard()` 移除 `.cc-group-header` 分组标题渲染，字卡直接平铺（顶部 `pokeGroupsBar` 切换栏已承担分组标识）。本次构建同时带上 AI-A 累积批次（ta-ask 两池混合/chatcard/feed/avatar-lib/bg-keep/chat-main.css 等），一并提交。
- 构建/部署只由约定的构建者执行（见 AGENTS.md）。

### 2026-08-19
- [本会话] 完成（用户需求「互动卡片 TA 回应：预设池 90% 抽取 / 字卡库 10% 抽取，抽字卡库时最多连用 5 张、每张空一格」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js`（AI-A 域）`pickAskCardReply` 概率模型再调（v3.7.2）。当前规则：两池都在时——**90% 走预设池**（池内随机 1 条）、**10% 走字卡库**（随机 1~5 张不重复、空格连接，上限受池大小约束）；单池为空自动全走另一池；皆空兜底 5 句默认甜话。7 条路径（邀请TA 接受/拒绝、问问TA 文字题、TA的询问、小问题未命中、好奇、吐槽）全部经由此函数自动生效；问问TA 单选题（选项内随机）不受影响。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户反馈「互动卡片看不到联系人使用预设池的答案」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js`（AI-A 域）`pickAskCardReply` 概率模型修正。根因：v3.7.x 首版把「预设池 + 全部自定义字卡」**合并成一个大池**随机抽——用户字卡库字卡一多（几十~几百张），预设池仅 4~11 句被稀释到几乎抽不中（如 7/207≈3%），表现为"永远只回字卡库的答案"。修复：改为**两池各 50% 机会**——先 `Math.random()<0.5` 决定抽预设池还是字卡库，再在选中池内随机抽 1 条；单池为空时自动全走另一池，两池皆空兜底 5 句默认甜话。7 条路径全部经由此函数（邀请TA 接受/拒绝、问问TA 文字题 11 句、TA的询问预设回应、小问题未命中选项预设、好奇题预设 replies、吐槽 7 句，各 + 字卡库 50/50），无需逐点改。单选题（选项内随机）不受影响。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户反馈「字卡库里 TA 没有统一大写」——**未构建未提交**，请构建者统一执行）：全仓库 `Ta的好奇/Ta的吐槽` → `TA的好奇/TA的吐槽`（中文语境大小写统一）。涉及 `src/template.html`（**AI-B 域，用户直接反馈故越界修复，仅文案大小写，无逻辑改动，请知悉**）、`src/js/ta-ask.js`（通知名/弹窗标题/toast/注释）、`src/css/chat-pages.css`（注释）。已 grep 复核 `[^a-zA-Z0-9_-]Ta[^a-zA-Z0-9_-]` 零残留（剩余 ta- 前缀均为 id/class/枚举值非显示文本）。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「问问TA 单选题：联系人只能用选项回复；点击已作答卡片可展开查看设置的单选答案」——**未构建未提交**，请构建者统一执行）：`src/js/chat.js` + `src/css/chat-main.css` + `src/css/dark.css`（均 AI-A 域）。①**单选题只用选项回复**：submitChatAsk 单选分支 TA 的聊天回复消息由「预设回应/字卡库混合」改为**选项文字本身**（`addIn(text)`），卡片不再显示「TA：预设回应」行；预设回应仍存于 askOptions 里供展开查看（旧历史数据不受影响）。②**已作答卡片点击展开**：聊天点击已作答的问问TA 单选题卡片 → 展开「选项查看」区（复用 `.msg-inplace`，再点收起），列出我给 TA 设置的全部选项+各选项预设回应，TA 选中的选项高亮（`.ip-opt-row.sel`）；展开同时照常切换收藏按钮显示；点击展开区内部不折叠。新增 `.ip-opt-row/.ip-opt-t/.ip-opt-reply` 样式 + dark.css 暗色覆盖。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「互动卡片联系人的回复全部增加『硬编码/系统预设池 + 字卡库自定义字卡』两池混合随机」——**未构建未提交**，请构建者统一执行）：`src/js/ta-ask.js` + `src/js/chat.js`（均 AI-A 域）。核心：`pickAskCardReply(presetPool)` 升级——可选接收预设回应池，与字卡库自定义文字字卡合并成一个随机池抽 1 条，无池无字卡时兜底 5 句默认甜话。逐卡改造：①**好奇**（弹窗+就地，ta-ask submitCurious / chat expandCardInPlace）：题预设 replies 池+字卡库混合；②**吐槽**（两处）：7 句固定池+字卡库混合；③**小问题**：`chatChooseReply` 第三参由回应字符串改为**选项对象**，默契命中（选到 TA 心里想的/TA 喜欢的答案）保留选项预设回应作高光，未命中时该选项预设回应+字卡库混合随机；④**询问/问问TA**（chatAskReply 与半框单选题）：选项预设回应同样参与混合，无预设走两池混合；⑤**问问TA 文字题**：11 句固定话术池+字卡库混合；⑥**邀请TA**：接受 5 句/拒绝 4 句话术池各自+字卡库混合（接受/拒绝概率不变）。`node --check` 通过。**未构建未提交**，等待统一提交/部署。

### 2026-08-19
- [本会话] 完成（用户需求「音乐歌单新增上传歌单图片；播放歌单时可切换桌面音乐小组件显示歌单图片还是歌曲图片」——**已构建 verify 10/10，未提交**）：`src/js/music-player.js` + `src/css/chat-pages.css`（均 AI-A 域）。①**歌单封面**：`playlists[i].cover`（dataURL，复用 `compressCover` 压缩 512px JPEG）；歌单列表项 `.sm-pl-ico` 有封面时显示背景图（`has-cov`）；新增编辑按钮（铅笔图标）→ `openPlaylistEditor`：上传/更换/清除封面 + 重命名 + 删除歌单（默认歌单无删除项）。②**小组件封面来源切换**：`settings.widgetCoverMode`（`'song'` 默认 / `'playlist'`）；`setWidgetCover` 按模式决定——playlist 模式优先显示当前歌曲所在歌单的封面，无歌单封面时回退歌曲封面；入口在「音乐设置」弹窗新增「桌面小组件封面」select，切换即保存并实时刷新小组件；编辑歌单封面后若当前正播此歌单且模式为 playlist 也同步刷新。`node --check` 通过，verify 10/10。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「设置里『自定义手机桌面图标』应该放在『卡片大小』下面」——**已构建 verify 10/10，已提交未 push**）：`src/template.html`——把 `row-custom-icon` 从独立 set-group 移到「美化」分组内 `row-desk-card-scale`（卡片大小）之后，删除原独立分组。仅位置调整，无逻辑改动。本次构建同时带上 AI-A 未提交批次（chat.js/chatcard.js/idb.js/bg-keep.js/chat-main.css/chat-pages.css，语法通过），一并提交。
- [本会话] 完成（用户反馈「红米 K80 Pro Chrome 打开部署的 GitHub Pages 安装到桌面一直显示『正在安装』」——**已构建 verify 10/10，已提交 82ebbee，待 push**）：`src/pwa/sw.js`（AI-B 域）+ 产物。根因：SW 的 `install` 预缓存（`caches.addAll`）与 `fetch` 均无超时，GitHub Pages 在国内网络经常慢/卡，SW 一旦卡在 `installing` 状态，Chrome 安卓「安装到桌面」的 WebAPK 安装流程要经 SW 拉 start_url/图标，会一直显示「正在安装」永不完成。修复：①`fetchWithTimeout` 带 8 秒超时；②install 预缓存改为逐文件超时 + `Promise.allSettled`，单文件失败不影响整体，SW 最迟约 10 秒内必激活；③fetch 网络优先带 8 秒超时，超时/失败回退缓存（导航回退 index.html、资源回退自身缓存，无缓存 `Response.error()` 快速失败）；④只接管同源请求（跨域不再拦截）。`npm run verify` 10/10。已提交待推送。
- [本会话] 完成（用户反馈「桌面美化添加的图片无法上下左右移动；退出装修模式后第三页仍显示『空白主页 可上传整页背景图』和『添加卡片』按钮」——**已构建 verify 10/10 + CDP 复测 10/10，已提交未 push**）：涉及 `src/js/personalize.js` + `src/css/home.css`（home.css 是 AI-A 文件，本次为图片组件/空白页装饰规则改动，请知悉）。①**图片移动**：装修模式点图片菜单新增「移动」子菜单——上移/下移（同页相邻交换，持久化 meta 顺序，`moveDeskImage`）+ 靠左/居中/靠右（窄图水平对齐，meta 存 `align`，满宽图无效果）。②**空白页提示**：根因是 `.desk-page-hint`/`.desk-page-add` 无条件显示（CSS 只判断 `.page-slide.desk-page`，不判断装修态）。修复：CSS 改为默认 `display:none`，仅 `.decor-on` 下显示；JS 新增 `syncPageHint`（有 `[data-desk-widget]/[data-desk-image]` 的页内联隐藏），接入 applyDeskLayout/组件库添加/移出此页/图片渲染。③自查修复：嵌套子菜单误引 `openCardMenuNext`（它是 openCardBgMenu 的局部变量，跨作用域 ReferenceError）→ 改为内联 setTimeout 模式。**注意：本次构建同时带上 AI-A 正在保存的大批次改动**（ta-ask.js +518、quote-cards.js +166、p2-features.js +174、chat-pages.css、dark.css、template.html，语法均通过）——若 AI-A 该批次未完，请继续保存并后续自行构建提交；本地 main 领先 origin 6 个提交（沙箱无 GitHub 凭据无法 push）。
- [本会话] 完成（用户反馈「美化→桌面上传图片无法按不同尺寸当小组件；点开图片后点 × 无反应无法关闭」——**已构建 verify 10/10 + CDP 复现 4/4 + 尺寸功能测试通过，已提交未 push**）：涉及 `src/js/personalize.js` + `src/template.html`。①**查看器 × 关闭无响应根因**：`#desk-image-viewer` 在 template.html 里位于 `<script>` 块之后，启动时 JS 查询该元素为 null → `setupDeskImageViewerClose()` 提前 return，关闭监听从未绑定（打开路径在点击时才查元素所以正常）。修复：查看器 div 移到 `<script>` 前（仍是 body 直子节点，position:fixed 不受影响）；加 `viewerBound` 幂等守卫 + 打开路径防御性补绑。②**不同尺寸**：原所有图片组件 width:100% 等宽。meta 增加 `w`（40 小/70 中/100 大），装修模式点图片菜单新增「尺寸：小/中/大」选项（当前尺寸打 ✓），`renderDeskImages` 按 w 渲染（<100% 时 align-self:flex-start）。③自查修复两处 TDZ：`DESK_IMG_SIZES`/`viewerBound` 若声明在 IIFE 底部会被启动阶段调用触发 ReferenceError（已上移顶部，构建中途发现）。本次构建同时带上 AI-A 已保存改动（ta-ask.js 移除「已了解」汇总面板 + 模板对应区块，改动完整无悬挂引用），一并提交。**push 失败**：沙箱无 GitHub 凭据（helper-selector 需交互），本地 main 领先 origin 5 个提交，待有凭据环境推送。
- [本会话] 完成（用户反馈「字卡库自定义聊天字卡：主字卡/颜文字/emoji/表情包/图片/拍一拍/语音 大分类 tab 不显示该分类字卡数量」——**已构建 verify 10/10 + CDP 端到端功能点全过，随本次提交 b015e28**）：`src/js/chatcard.js` + `src/css/chat-pages.css` + `src/css/dark.css`。①chatcard.js 新增 `renderTabCounts()`：遍历 `#cc-tabs .cc-tab` 按 data-type 统计该分类所有分组字卡数，在 tab 尾部追加 `<em class="cc-tab-n">N</em>` 徽标（0 时显示 0 并加 `.zero` 弱化）；在 `render()` 开头调用——所有数据变更（增删/导入/IDB 恢复/切分类/搜索）都汇聚到 render，计数实时刷新；②样式：圆角小徽标（浅色半透明底灰字，选中态白底白字），dark.css 补暗色覆盖。CDP 验证：注入 7 分类测试数据后徽标 3/1/3/1/2/1/0 全部正确、空分类显示 0、选中态样式、切换分类后徽标保留（注意：测试内容若撞 BUILTIN 预设会被 stripBuiltins 清掉，验证时避开）。**已提交**（commit 统一包含对方 5 个字卡库双 tab 批次 ta-ask.js/template.html/p2-features.js/pwa.js/chat-main.css）。

- [本会话] 完成（用户需求「桌面字卡库【今日情话】顶部双分类：系统预设 / 我的添加，数据分开不乱」，**已构建 verify 10/10 + CDP 端到端 22/22，未提交**）：`src/js/quote-cards.js` + `src/template.html` + `src/css/chat-pages.css`（复用 `.cc-tab`）。①`page-quote-cards` 顶部加两个 tab（系统预设/我的添加，复用字卡库 `.cc-tab` 样式）；②`renderList` 拆为 `renderSysList`（系统 46 句带单卡开关、不可删、标【系统】）+ `renderMineList`（用户自定义、带删除按钮），`switchTab` 切换面板；③**修复数据污染根因**：原批量添加走 `getQuotes()`，无自定义库时返回 `DEFAULT_QUOTES.slice()` → 用户首次添加会把系统 46 句+新内容一起存进自定义库（系统预设"转正"）；改为 `getCustom()` 只追加纯自定义库；④入口计数 `cc-quote-count` 改为实时计算（系统开启且未关的 + 自定义数），关闭总开关/删条目即时更新；⑤关闭系统预设总开关时系统 tab 显示灰化提示而非空。CDP 22/22：双 tab 切换/系统 46 行带开关无删除/我的添加空提示/批量添加 3 句落自定义/入口计数 49/切回系统未污染/关闭系统后计数 3/重开恢复 46/删除一条剩 2 计数 48/自定义库不含系统预设。**未提交**，等待统一提交/部署。

- [本会话] 完成（用户反馈「聊天更多→占卜：无法查看历史记录（应每桌面独立）/无法开关记录自动发送至聊天/抽牌无动画无 2 行可滑动牌面；联系人撤回的情绪字卡不显示被撤、无法点击查看」——**已构建 verify 10/10 + CDP 端到端 27/27，随本次提交**）：
  1. **占卜抽牌全新交互（仿星言 d2）**：`divination.js` 新增共享 `startDivineDraw(stageEl,opts)`——①洗牌动画（卡片四散飞舞后收拢 ~1.8s）→②两行牌面（全部牌背分 2 行、每行横向自由滑动，hint 实时显示「剩 N · 已抽 M/K」）→③点击牌背抽取（翻牌动画展示已抽牌：图标+牌名+正/逆位+位置标签）→④抽满自动出结果。桌面占卜页与聊天占卜半框共用；连点/切换模式张数自动取消进行中流程（`window.__divActiveDraw` / `chatDrawCancel`）。
  2. **历史记录每桌面独立且可查看**：历史本就存动态 store（每联系人命名空间隔离），但桌面页只在抽牌后才渲染（首次打开空白看不到记录）→ 新增 `renderHistOnOpen()` 模块初始化即渲染 + `contact-switched` 重渲染；聊天半框新增「📜 占卜记录」展开/收起（每次打开刷新，条目可查看/删除/清空，与桌面页同一命名空间共用记录）。
  3. **自动发送开关（每联系人独立记忆）**：`divine-send-auto` 存动态 store；桌面页新增「发送设置」卡片、聊天半框新增「自动发送到聊天」开关（打开时同步）；开启后每次抽牌完成自动把结果发到聊天（`divineSendResult` 复用 sendToChat；onDone 内自动发送置于历史保存之前，与历史渲染解耦，互不阻塞）。
  4. **撤回的情绪字卡显示**：原实现被撤情绪字卡直接隐藏（无法看到被撤、无法查看）→ 改为字卡区尾部「对方/我撤回了 N 条情绪字卡 ▾」胶囊，点击展开查看（已撤回）标签+内容，与文本段撤回同风格（复用 `.msg-poke-seg`）。涉及 `src/js/divination.js` `src/js/chat.js` `src/template.html` `src/css/chat-pages.css` + 产物。CDP 27/27：洗牌动画/两行牌面 22 张/翻牌抽取/结果渲染/历史保存渲染/自动发送落聊天（桌面+半框）/半框历史查看删除清空/新桌面历史为空+开关独立/切回恢复/情绪字卡撤回胶囊显示+展开查看。⚠️ 本次构建已包含此前双方未提交累积改动（personalize 组件透明度、home.css 查看器黑遮罩、desktop-slider gap、idb.js 回填、chat.js 跨桌面残留清理等 13 文件），统一提交。

- [本会话] 完成（用户反馈「美化设置的小组件透明度没有原图直出了 + 想在装修模式点小组件直接设置组件透明度」，**已构建 verify 10/10 + CDP 端到端 11/11，随本次提交**）：`src/js/personalize.js`（AI-B 域）。①装修模式点卡片菜单**恢复「原图直出」快捷项**（有背景图时显示，当前已直出时带 ✓），并把**「组件透明度」加进装修模式点卡片菜单**（0~100% 滑块，与设置页「小组件透明度」共用 `widget-opacity` 存储，全局生效，含「恢复默认」）；②**遮罩浓度滑块弹窗修复**：根因——v3.6 改滑块后，遮罩浓度/任何从卡片菜单 OK 按钮里嵌套打开的弹窗都会**闪关**（openModal 的 okBtn 回调 `finally close()` 在嵌套 openModal 打开后立即执行，`cb` 被置 null，fire 早退）→ 用户点「遮罩浓度」菜单项弹窗开一下就没 = 「没有原图直出了」（遮罩 0% 就是原图直出）。修复：openCardMenuNext 用 `setTimeout(0)` 延迟到外层弹窗关闭后再开嵌套弹窗（遮罩浓度/组件透明度两处）；③**遮罩浓度弹窗内新增「原图直出」pill（=0%）**+ 浓度 0 时 toast「已切换为原图直出」；④**修复设置页「小组件透明度」输入数字无效**：fire() 的 pills 分支（`if (pillsEl && !pillsEl.hidden)`）在弹窗带 pills 且未点 pill 时把确定传给 `cb(null)` → 输入框里的数字永不生效（只能点快捷百分比）——改为 `(pillVal !== null || noInput)` 才走 pills 分支；已核对全站其余 pills 弹窗（chatcard/chat-settings/avatar-lib/p2-features/其余 personalize）均带 noInput 或有初始 pill 值，行为不变。CDP 11/11：菜单含原图直出/组件透明度/原图直出落库 mask=0 且背景无白色渐变层/组件透明度嵌套弹窗不闪关/拖 60 落库 CSS=0.6/恢复默认/遮罩浓度弹窗含原图直出 pill 且落库/设置页输入 40 落库/全程无 JS 错误。涉及 `src/js/personalize.js` + 产物。⚠️ 对方累积改动（chat.js 跨桌面残留清理等 13 文件）已随本次构建一起进产物，统一提交。

### 2026-08-18
- [本会话] 完成（用户反馈「开屏有一层黑色遮挡开屏页面」——**已构建 verify 10/10 + CDP 验证，未提交**）：根因——上一轮「桌面图片组件」新增的全屏查看器 `.desk-image-viewer`（`src/css/home.css`，fixed inset:0 z-index:10000 黑底 rgba(0,0,0,.92)）**漏写 `[hidden]{display:none}` 规则**（全站其他全屏遮罩 `.modal-mask`/`.img-view-mask`/`.cc-import-progress` 均成对书写）。template 里该元素默认带 `hidden` 属性，但 CSS 没有配套规则，`display:flex` 恒定生效 → 打开页面即整屏黑遮罩盖在开屏（z-index 999）之上（黑底 92% 不透明 + 内容区 10000 挡住开屏点击 = 「黑色遮挡」）。修复：`src/css/home.css` 补 `.desk-image-viewer[hidden]{display:none;}`；打开查看器移除 hidden 自动恢复 flex，功能不受影响。已 `node build.mjs` + `npm run verify` 10/10 + CDP 验证（开屏期 viewer display:none 不可见 / 点击进入后仍隐藏）。涉及 `src/css/home.css`（AI-A 域，用户直接反馈故越界修复）+ 产物。**未提交**，等待统一提交/部署。⚠️ 顺带发现：`desk-image-viewer` 未加入 `mobile-adapt.js` 的 `FLOAT_SELECTORS` 列表（打开查看器时背景滚动不锁）——影响很小（全屏黑底本就盖住一切），是否补由 AI-B 决定。

### 2026-08-18
- [本会话] 完成（用户需求「桌面可新增/删除页数 + 桌面图片组件（上传/更换/删除/点击放大）」，**未构建未提交**）：两块：
  1. **桌面页数管理 UI 补全**（`src/template.html`）：personalize.js 的页数管理 JS 逻辑（2-5 页增删、每页独立背景图）早已就绪，但 template 缺 4 个锚点（`row-desk-add-page`/`row-desk-del-page`/`desk-pages-val`/`desk-page-bgs`）导致用户看不到入口。本次在「手机桌面美化」分组补齐这 4 个锚点，JS 自动生效无需改。
  2. **桌面图片组件**（`src/template.html` + `src/css/home.css` + `src/js/personalize.js`）：用户可在任意桌面页上传图片组件（可多个），装修模式可换图/删除，非装修模式点击全屏查看。
     - 存储：元数据 `desk-images`（`[{id,page,addedAt}]`）存 localStorage，图片 dataURL `desk-image-src-<id>` 存 IDB（压缩 1280px JPEG 0.85）；idbRestore 的 `LS_BIG_LIMIT`(200KB) 自动阻止大图回填 localStorage，无需改 idb.js。
     - 设计：图片组件用 `data-desk-image` 属性（非 `data-desk-widget`），不参与 `desk-layout`，避免与现有组件系统的 saveDeskLayout/applyDeskLayout 冲突。
     - 装修模式集成：`openDeskLib` 面板加「图片」选项上传新图；点已有图片弹「换图/删除」菜单；删页时 `removeDeskImagesOnPage` 清理该页所有图片。
     - 全屏查看器：`desk-image-viewer` fixed inset:0 z-index:10000 黑底，点击图片组件（非装修模式）打开，点关闭按钮/点遮罩关闭。
  3. **音乐播放修复**（`src/js/music-player.js`）：永恒浏览器（安卓 WebView）对 `blob:` URL 音频静默失败——`play()` Promise 既不 resolve 也不 reject、`onplay` 永不触发。`playLocal` 改为 blob:/dataURL 双路径互为兜底 + 4 秒 watchdog 无 onplay 切另一种 src 重试。
  `node --check` 通过（music-player.js + personalize.js）。涉及 `src/template.html`、`src/css/home.css`、`src/js/personalize.js`、`src/js/music-player.js`。**未构建未提交**，等待构建者执行 `node build.mjs` + `npm run verify`。

### 2026-08-18
- [本会话] 完成（用户需求「桌面收藏新增：联系人可收藏聊天里的互动卡片整卡（问题+我的回答+联系人的回复）/ 互动卡片我可点击收藏 / 联系人可收藏信箱我的回信 / 联系人可收藏我发布的朋友圈」，已构建 verify 10/10 + CDP 端到端 15/15，**待统一提交/部署**）：
  - **收藏存储扩展**（`src/js/chat.js`）：`fav-msgs` 条目新增 `kind` 字段（msg=聊天消息原样 / card=互动卡片 / mail=信箱回信 / feed=朋友圈动态）；新增全局入口 `window.addMyFavItem/addTaFavItem`（按 kind+q/text+ts 去重，供 mail/feed 调用）；互动卡片快照 `cardSnapshot`（小问题 choice* / 好奇 curious* / 吐槽 roast* / 询问 ask* / 邀请 invite*，含问题+我的回答+TA回复）+ `favCardFromMsg(idx)`。
  - **互动卡片可点击收藏**：5 种卡片（含未作答/已作答）渲染底部小爱心「收藏」按钮（`.msg-fav-heart`，chat-main.css），点击整卡入「我的收藏」，重复点击提示已收藏；就地作答/邀请回调/ask 作答的 7 处卡片重建补上按钮。
  - **TA 收藏互动卡片**：回答小问题/好奇/吐槽/询问、TA 回应邀请后，30% 概率整卡收藏进「联系人的收藏」+ toast「TA 收藏了你们的互动卡片」。
  - **信箱回信**（`src/js/mail.js` submitReply）：我提交回信后 30% 概率 TA 收藏该回信（存来信标题 + 回信内容）+ toast「TA 收藏了你的回信」。
  - **朋友圈**（`src/js/feed.js` publish）：我发布动态后 30% 概率 TA 收藏（内容 + imgs 数组，延迟同点赞节奏）+ toast「TA 收藏了你的朋友圈动态」。
  - **收藏页渲染**（chat.js renderFav）：按 kind 分卡片式条目（互动卡片带分类标签/问题/✓我/TA；信箱回信带「来信《标题》」；朋友圈带内容+图片缩略图可点击放大），头像时间列沿用，长按/右键删除按 kind+内容+ts 匹配（旧消息收藏兼容）。chat-pages.css 新增 `.fav-item-*` 样式。
  - ⚠️ 踩坑：`renderFav` 内 `const FAV_KIND_LABEL` 声明在 `list.forEach(f => renderFavItem(f))` 之后——renderFavItem 提升后引用 const 触发 TDZ 报错（`Cannot access before initialization`），已移至 forEach 之前（CDP 抓到）。
  - 涉及 `src/js/chat.js` `src/js/mail.js` `src/js/feed.js` `src/css/chat-main.css` `src/css/chat-pages.css` + 产物。CDP 15/15：心形按钮/收藏写入/去重/收藏页渲染三类型/TA 收藏三入口/tab 归属/旧收藏回归/邀请卡/无 JS 错误。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「另一个桌面的聊天里的联系人，可以引用其他桌面的聊天的消息数据没有隔开」——聊天数据跨桌面串数据）：根因——`src/js/chat.js` `contact-switched` 处理只重置了 msgs/pendingLocal/chatDbReady，**会话内跨桌面残留未清**：`lastQuote`（用户点的「引用」内容）→ 在 A 聊天选了引用、切到 B 发消息，B 消息带上 A 的消息内容；`lastMineText`（TA 引用/收藏「我」最后一条消息用）→ TA 在 B 桌面会引用/收藏 A 桌面我发的消息；`draftImgs`（待发送图片草稿）+ 输入框草稿文本 → 切桌面原样带到新聊天。修复：`contact-switched` 处理补齐 4 项重置（lastQuote=null / lastMineText='' / draftImgs=[] + renderDraft / input.textContent=''，各包 try/catch 防 TDZ）。已 `node build.mjs` + `node tools/verify.mjs` 10/10 + CDP 端到端 8/8（A 发消息→点气泡引用+输草稿→切 B：草稿已清空 / B 发的消息无引用块 / B 记录无 A 内容 / A 记录未被污染）。涉及 `src/js/chat.js`（AI-A 域，用户直接反馈故越界修复）+ 产物（构建顺带包含对方未提交的 personalize.js）。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「不同桌面的联系人电话挂断，显示成当前桌面联系人的电话」——通话中切到其他桌面再挂断，挂断消息/记录显示成当前桌面联系人）：根因——`src/js/call.js` 的 `currentCall` 不绑定发起通话的桌面，`endCall()` 动态读 `partnerName()` + `chatAddSystem/addCallRecord` 全走当前桌面。修复：①新增 `bindCall()`——来电/去电开始时把 `cid`（__activeCid）+ 昵称 + 头像快照进 `currentCall`；②`endCall()` 姓名改用快照值，新增 `notifyCallEnd(cid,…)`——当前桌面走原内存链路，非当前桌面直接写该桌面 IDB 聊天记录（`xy-home-v2:<cid>:chat-msgs` 追加 + LS 快照）+ 通话记录（storeFor(cid)）；③`minimizeCall`/接听自动缩小/去电接通自动缩小的小框名字头像同样改用快照（切桌面后最小化不显示成新联系人）。已 `node build.mjs` + `node tools/verify.mjs` 10/10 + CDP 端到端 8/8（A 来电→接听→切 B→挂断：小框仍显 A 昵称 / A 聊天含「小美 来电·通话已挂断」/ B 聊天与记录零污染 / 记录归属 A / IDB 权威同步）。涉及 `src/js/call.js`（AI-B 域）+ 产物。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈「iPhone 15 Pro 打开部署的 GitHub Pages 页面依旧卡顿，iOS 都会这样」——iOS Safari 性能专项，已构建 verify 10/10 + CDP 双端对照验证，**随本次提交推送**）：定位两个遗留 iOS 卡顿源——①**桌面 zoom 回归**：v3.6.x「桌面字号/卡片大小」滑块在 `src/css/home.css` 用 `zoom:var(--desk-font-scale/--desk-card-scale)` 重新引入了 AGENTS.md 红线禁用的整页 zoom（WebKit 下整页/整组件踢出 GPU 合成路径、滚动每帧 CPU 重排重绘；verify.mjs 只查 `.phone` 没查 `.page-slide`/小组件，回归未被发现）；②**6 处全屏遮罩 backdrop-filter blur**（base.css `.modal-mask` blur4 + `.cc-import-progress` blur3、chat-main.css `.call-mask` blur6、chat-pages.css `.mg-mask`/`.tc-mask`/`.qa-mask` blur4）——iOS Safari 每次弹窗打开都对全屏做模糊栅格化（弹窗是全站最高频操作，openModal 全站统一走它）。修复：①home.css 加 `@media (max-width:900px)` 把桌面页/小组件 zoom 强制 1（手机端禁用缩放，设置仍可保存、桌面 >900px 模拟器端功能保留；手机端如需缩放后续用字号/间距方案重做）；②6 处遮罩全部去掉 blur 行（纯 rgba 遮罩视觉几乎无差，浅色 rgba(0,0,0,.35)/深色 .6 不透明足够）。CDP 双端对照：注入 --desk-card-scale=1.2 后 mobile(390x844) 组件 zoom=1、desktop(1280x800) zoom=1.2 功能保留、modal-mask 显示/隐藏两态 backdropFilter=none、遮罩色 rgba(0,0,0,.35) 正常。涉及 `src/css/home.css`（AI-A 域，红线违规故越界修复）、`src/css/base.css`、`src/css/chat-main.css`、`src/css/chat-pages.css`。⚠️ 另清理了遗留临时脚本 tools/diag-cc-tmp.mjs（对方曾留言待清理）。
- [对方 16:51 已提交未 push] ef16467 v3.6.68（字卡库首页 chat-item 压缩 + 对方累积含音乐封面）。本会话已复核：对方构建已包含本会话 CSS 修复（built index.html 无 backdrop-filter、含 zoom 媒体查询），16:53 重新构建（仅版本时间戳差异）+ verify 10/10，**本次随本会话记录一起提交推送**。


### 2026-08-18
- [本会话] 完成（用户需求「上传歌曲时，可自定义上传歌曲封面图片」，已构建 verify 10/10 + CDP 端到端 18/18，**待提交**）：`src/js/music-player.js`（AI-A 域）+ `src/css/chat-pages.css`，未动 template.html。①「管理音乐」弹窗（歌曲 ⋯ 按钮）新增「歌曲封面」行：圆形预览（点击也可上传）+ 上传封面 + 清除封面按钮；图片压缩到最长边 512px JPEG dataURL 存 `m.cover`（画布失败回退原图；保存后列表/收藏/歌单/桌面部件同步刷新）；② 音乐库/收藏/歌单内歌曲列表有封面时渲染缩略图（`.sm-song-ico.has-cov`，替换音符图标），无封面保持原样；③ 上传完成 toast 改为「已上传 N 首音乐（点歌曲右侧 ⋯ 可设置封面）」。隐藏 file input 挂 body（`document.body.appendChild`，保证老内核/无头环境 click 可用）。数据量：每封面 ~几十 KB，走既有 xyStore 大键机制，备份导入导出自动包含。CDP 18/18：种子带/无封面列表缩略图/面板预览与清除按钮状态/真实 PNG 注入→m.cover 压缩为 jpeg dataURL/预览与列表同步/toast/清除后恢复占位与音符图标/无 JS 错误。涉及 `src/js/music-player.js`、`src/css/chat-pages.css` + 产物。**未提交**，等待统一提交/部署。临时探测脚本已删。

### 2026-08-18
- [本会话] 排查完成（用户反馈「联系人主动发送的消息气泡左上角没有小爱心标识」，结论=构建产物语法崩溃，已修复并随 8a1df3f 提交）：排查过程——① CDP 加载 HEAD 构建（2dbe6ad）无头实测：带 `initiative:true` 的消息渲染出 14px 粉红爱心、普通回复无爱心、`as-badge` 开关关→无/开→恢复，**老构建本身没问题**；② 复测时发现**当前 index.html（16:16 构建）整包 JS 抛 `SyntaxError: missing ) after argument list`（@index.html:8883）→ 全站 JS 不执行（`__mochiDataReady` 恒 false、splash 不消失、聊天/设置全部失效）——**根因是 `src/js/chat.js` 上一轮改动（myPrefix 跨联系人写串修复 + pendingLocal 合并落盘）在 loadMsgs 里留下 3 行孤儿代码（`} catch (e) {}` / `}` / `return;`，约 221-223 行），`node --check` 直接报错**。已删除孤儿行恢复结构（对方新加的 pendingLocal 合并逻辑原样保留，未动其他），`node --check` 通过后已 `node build.mjs`（16:23）+ `npm run verify` 10/10 + CDP 端到端（as-min=1 强制真实主动发送：85s 后 TA 发来消息气泡左上角爱心 14px 正常渲染；开机问候消息无爱心符合预期）。产物 index.html/sw.js/version.json 已随 8a1df3f 一起提交。涉及 `src/js/chat.js` + 产物。⚠️ 遗留：`tools/diag-cc-tmp.mjs` 未跟踪文件请对方确认后清理；另外 chat.js 新注释里有 GBK 乱码（如「写串）�?」「LS 拋留」）和注释内 `）` 后丢行尾的拼接现象，不影响运行，建议顺手修一下注释编码。

### 2026-08-18
- [本会话] 完成（tabbar 去投影 + 设置页/gs-scroll 底部留白——"还有一点灰/滑动遮挡"收尾，已构建 verify 10/10 + CDP 验证，**随本次提交**）：用户反馈去 radial 后"依旧还是有一点"，且在字卡库/设置页上下滑动遮挡。定位两处残留：①`src/css/tabbar.css` tabbar 自身 `box-shadow:0 2px 8px rgba(0,0,0,.05)`——纯白背景上投影即卡片下方一道淡灰（"形状旁边还有一点灰"），去掉（`dark.css` 深色覆盖同步去）；②设置页 `.page` 直接滚动（无 gs-scroll 容器），滚动到底最后一行距 tabbar 仅 14px（page padding 4px + tabbar margin 10px）视觉"被压住/遮挡"——`setting.css` 给 `#page-setting` 加 `padding-bottom:20px`（滚动到底最后一行距 tabbar 实测 86px）；同时给 `.gs-scroll` 加 `padding-bottom:20px`（日历/占卜等 gs-scroll 页面同样受益）。字卡库页已修（gap 44px）。CDP 验证：tabbar 下方无 shadow、设置页最后一行完整可见。涉及 `src/css/tabbar.css`、`src/css/dark.css`、`src/css/setting.css`。

### 2026-08-18
- [本会话] 完成（去掉 .phone 背景 radial 黑晕——导航栏形状旁灰彻底消除，已构建 verify 10/10 + 三页 CDP 采样验证，**随本次提交**）：用户反馈"恢复原形状后形状旁边依旧有灰色，字卡库/设置页上下滑动会遮挡"。根因——`src/css/base.css` `.phone` 背景除 linear 渐变外还有三个 radial-gradient 微黑晕（`circle at 30% 90% rgba(0,0,0,.05)` 主体 + `18% 12%` 尾巴，恰好压在页面底部导航栏区域的 .phone padding 区），黑晕叠白 = 淡灰；此前只把 `--bg-b` 改白，radial 仍残留。修复：删除 .phone 背景全部三个 radial-gradient，只留 `linear-gradient(168deg, var(--bg-a), var(--bg-b))`（--bg-b 已 #ffffff → 纯白）。深色模式黑晕本就不可见无影响；壁纸机制（background-image 覆盖）不受影响。CDP 三页验证（主页/字卡库滚动到底/设置页滚动到底）：tabbar 四周采样全部纯白渐变、无灰。涉及 `src/css/base.css`。

### 2026-08-18
- [本会话] 完成（tabbar 恢复圆角悬浮原形状 + 背景纯白根治去灰，已构建 verify 10/10 + CDP 采样验证，**随本次提交**）：用户反馈"桌面里的底部栏形状变了，和原来不一样"——24c157c 的满宽贴底方形不满足预期。恢复方案：①`src/css/tabbar.css` `.tabbar` 恢复原样（margin-top:10px、border-radius:22px、去负 margin/方形）；②`src/css/base.css` 浅色 `--bg-b` 由 `#f2f2f2` 改 `#ffffff`（.phone 渐变底部变纯白）——tabbar 悬浮卡片的上/下/左右留白与圆角外全部是白色，**形状恢复且无灰，两诉求兼得**（此前去灰靠"满宽贴底方形"改变形状，现改为背景色根治）。深色模式 --bg-b #0e0e0e 不变；聊天页 --page-bg-grad #f6f6f6 不变。CDP 验证：主页/字卡库页 tabbar rect=18,762 354x64、radius=22px、四周白色（--bg-b=#ffffff）。涉及 `src/css/tabbar.css`、`src/css/base.css`。⚠️ 全局视觉变化：浅色模式页面背景从"白→淡灰渐变"变为纯白（更干净），含主页/设置页/字卡库页。

### 2026-08-18
- [本会话] 完成（「正在输入」提示行由悬浮改内嵌——消除灰色一行遮挡消息，已构建 verify 10/10 + CDP 验证，**随本次提交**）：用户确认聊天页"除底部栏之外还有一点灰色、滑动遮挡聊天消息"的正是联系人触发的【正在输入中】行（chat-typing）。根因——v3.5.49 把 chat-typing 改成悬浮式（`position:absolute; bottom:calc(100%+4px); z-index:5` 相对输入栏定位），悬浮层固定在输入栏上方，**消息滚动时从这行灰色小字下方穿过被盖住**（chat.js 注释 1987 "typing 行占位时保持最后一条可见"证明原设计就是占位行，CSS/JS 语义矛盾）。修复（改回 v3.5.27/44 内嵌方案）：① `src/template.html` chat-typing 从 chat-input-row 内移到 chat-body 之后（消息区与输入栏之间）；② `src/css/chat-main.css` `.chat-typing` 由 absolute 改静态内嵌占位行（flex-shrink:0 + padding 2px 18px 4px，透明背景灰字）。CDP 验证：typing pos=static、rect 390x22 在消息区与输入栏之间、insideBody=false 不再悬浮、不遮挡消息；chat.js showTyping/hideTyping 已有的占位滚动处理直接复用。涉及 `src/template.html`、`src/css/chat-main.css`。
- [对方改动·本次统一构建随提交] `src/js/music-player.js` 网易云直链改 meting API 方案（fetchNeteaseUrl allorigins/codetabs 代理替换为 api.injahow.cn/meting 302 https 直链，大陆可直连，已实测两首种子歌稳定返回）。

### 2026-08-18
- [本会话] 完成（聊天页背景统一——输入栏四周灰条消失，已构建 verify 10/10 + CDP 采样验证，**随本次提交**）：用户反馈"聊天页面里的底部栏也有这个情况（除底部栏之外还有点灰色，滑动遮挡聊天消息）"。定位：聊天页底部栏 = `chat-input-row` 输入栏；`#page-chat` 背景透明 → 透出 `.phone` 渐变灰底（#f2f2f2 + body #e9e9e9），输入栏四周（手机通栏贴底时的上方 padding 区 / 桌面悬浮圆角卡片的左右下方及圆角外）出现突兀灰条灰角。修复（`src/css/base.css`）：`#page-chat { background: var(--page-bg-grad); }`（浅色 #f6f6f6 / 深色 #1a1a1a 自动），输入栏四周与消息区同色，灰条消失；消息气泡白/深色对比正常。CDP 验证：chatBg=rgb(246,246,246)，输入栏上方=#f6f6f6（原深灰）。滚动遮挡由 chat-body padding-bottom:28px 保证（最后消息距输入栏 28px 留白）。涉及 `src/css/base.css`。
- [对方累积·本次统一构建随提交]（WORKLOG 下详）：pwa.js 备份提醒条 + `navigator.storage.persist()` Safari 清数据防护；data-backup.js 导出记录时间戳 + `runBackupExport` 抽离；contacts.js / chatcard.js / default-cards.js / mood-reply-cards.js / template.html 相关累积。均为对方已完成并验证、标记"未提交等待统一提交"的改动。

### 2026-08-18
- [本会话] 完成（tabbar 满宽贴底方形化——消除"导航栏形状之外"的灰色，已构建 verify 10/10 + CDP 四周采样验证，**随本次提交**）：用户刷新 69b3038 后反馈"底部导航栏的形状之外还有一点灰色"。像素级采样定位：灰来自 `.phone` 左右 18px 内边距区（`.page` 354 宽盖不到 18px 边条）+ 底部 18px padding + 圆角 22px 切线外角落，均透出 `.phone` 渐变灰底。修复（`src/css/tabbar.css`）：① `margin-left/right:-18px` 满宽；② `margin-bottom:-18px` 贴底；③ `border-radius 22px→0`（方形，无圆角灰角）。CDP 采样验证：tabbar 四周（左/右/上角/下角/底部）全部 `rgb(255,255,255)`，无灰。涉及 `src/css/tabbar.css`。⚠️ **全站 tabbar 视觉变化**：白色满宽贴底方形导航栏（含主页/设置页），符合 iOS 底部导航形态。
- [对方改动·本次统一构建随提交] `src/js/music-player.js` 网易云 https 直链获取（music.163.com API 返回 CDN 地址 http→https，解决 GitHub Pages HTTPS 下混合内容拦截导致外链全失败只能播内置旋律；API 无 CORS 走 allorigins 代理兜底，8s 超时）。

### 2026-08-18
- [本会话] 完成（字卡库页底部灰条修复——真实根因，已构建 verify 10/10 + CDP 精确验证，**随本次提交**）：用户追问"是灰色的条"——上轮深色 tabbar 修复未覆盖浅色模式。用真实点击 tab 复现：字卡库首页（page-chatcard）是 10 张 chat-item 卡片列表，内容 899>728 超出、`.page` 直接滚动；未滚动时最后卡片被 page 底边裁剪、副标题被切（视觉"灰色长方形遮挡上方文字"），且 `.page` 透明 → tabbar 上方永远透出 .phone 渐变灰底（14px 灰条，margin-top:10px 时更明显）。修复（`src/css/tabbar.css`）：①`.tabbar` margin-top 10px→0（去掉上间隙灰带）；②`#page-chatcard { padding-bottom:24px; background:var(--card-bg); }`（滚动到底最后卡片完整可见 + 页面背景不透明，浅色白/深色 #1e1e1e 自动切换，灰条彻底消失）。CDP 精确验证：滚动到底「Ta的吐槽」完整 75px + 距 tabbar 34px 白底留白；未滚动被裁为正常滚动行为。涉及 `src/css/tabbar.css`。⚠️ 对方留话「13:59 构建可能夹带半成品」——本次已重新 `node build.mjs` 覆盖后提交。

### 2026-08-18
- [本会话] 完成（深色模式 tabbar 覆盖，已构建 verify 10/10 + 深色截图视觉验证，**随本次提交**）：用户反馈字卡库页底部白色 tabbar 上面有一块灰色长方形遮挡上方文字。根因——`src/css/tabbar.css` 的 `.tabbar` 硬编码白底/黑边/浅阴影，而 `src/css/dark.css` 完全没有 `.tabbar` 的 `[data-theme="dark"]` 覆盖（dark.css 有 home/setting/chat-main/chat-pages 覆盖唯独漏 tabbar）。深色页面下 tabbar 仍是突兀白条 + 间隙露出深色背景 = 视觉"多出一块灰色长方形"；active 浅灰底 + svg 在白底上几乎看不见。修复：dark.css 新增 `/* ---- tabbar.css ---- */` 分组（.tabbar → dark-card-92 / dark-border-12 / 深阴影；.tab.active → dark-hover）。浅色模式零影响。深色 CDP 视觉验证通过。
- [对方改动·本次统一构建随提交] `src/js/idb.js` 聊天记录键判定 `isChatMsgsKey`（修复原 `indexOf(uidPrefix+'chat-msgs')!==0` 不匹配命名空间键 `xy-home-v2:default:chat-msgs` 的 bug + 大键搬移跳过聊天记录保护 Edge 杀后台丢唯一备份）；`src/js/music-player.js` 音乐相关后续完善；`src/js/chat.js` `addIn` 透传 `initiative` 修复（漏传导致主动发送爱心标识从不显示）+ 撤回补发也加 initiative；`src/js/personalize.js` 桌面图标隐藏/恢复（装修模式「隐藏图标」+ 装修栏「恢复图标」按钮配套）；`src/template.html` 装修栏新增 `<button id="decor-restore-icon">` 配套按钮。
- [本会话·诊断验证]（vivo S16 Edge「大退/挂后台后聊天记录整体消失，收藏/音乐/字卡/信/朋友圈都在」用户反馈）：根因链与 idb.js 修复一致（已随 4dcfa4d 提交）——①v3.6.x 起聊天记录是唯一「只写 IndexedDB」的数据（其他功能 LS+IDB 双写）；②Edge 杀后台/强制关闭时 IndexedDB 数据丢失；③idb.js 大键迁移（>200KB 键搬 IDB 后删 LS）把聊天 LS 兜底快照（200KB~2MB）当大图键搬走删除 → 聊天唯一备份也没了 → 只剩启动时日常/查岗注入的几条新消息。修复后 idbRestore 与大键迁移都跳过 `:chat-msgs` 键，快照永不被删。已验证：构建 verify 10/10 + 临时 CDP 探测（种子 300KB 快照 + 300KB 控制大键：快照保留在 LS / chat.js 自动回迁 IDB / 控制大键仍正常迁移 / 页面正常启动，4 项全过）。⚠️ **注意：本会话 13:59 有一次构建（当时对方 template.html/dark.css 正在改，13:59:59 仍在写入）——当前 index.html 可能夹带对方进行中的半成品改动，提交前请构建者重新 `node build.mjs` 覆盖后再提交。**

### 2026-08-18
- [本会话] 完成（桌面默认头像矢量图恢复，已构建 verify 10/10 + CDP 冒烟 7/7，**随本次提交**）：用户反馈桌面第一页顶部头像圆圈里没有聊天默认头像那种人形矢量图。根因——`template.html` 的 `.ring` 内本来有默认 SVG，但 `personalize.js` `applyAvatar()` 在「当前联系人未设置头像」时执行 `ring.innerHTML=''`，把模板默认 SVG 一并清掉（v3.6.x 多桌面「不残留旧头像 img」逻辑的副作用）；聊天页 `fillAvatar` 无头像时会主动重建 SVG 所以正常。修复：else 分支改为重建默认人形 SVG（与 template.html 一致 `#111111`）。CDP 7/7：无头像桌面两圈均渲染 SVG / 人形路径 / 有头像渲染 img / 清空恢复 SVG。涉及 `src/js/personalize.js`。
- [对方改动·本次统一构建随提交] `music-player.js` 自动播放被拒后手势恢复（armAutoResume/disarmAutoResume，失败 toast 提示）+ `src/template.html` 小组件颜色图标换调色板图标（13:17 保存，已重新构建进产物）。

### 2026-08-18
- [本会话] 完成（用户反馈两处，已构建 verify 10/10 + CDP 端到端 14/14，**随本次提交**）：
  - **聊天设置里气泡颜色设置不见了**（我的/联系人气泡颜色+双方消息文字颜色）：根因——4 行 DOM（cs-out-bg/cs-out-ink/cs-in-bg/cs-in-ink）在 `src/template.html` 聊天设置页丢失（与 row-contacts 同因：此前模板被 checkout 回退+截断重写），`chat-settings.js` bindBubbleColorRow 匹配不到行静默 return。修复：`src/template.html`「气泡样式」组后新增「气泡颜色」组 4 行（默认值回显与 applySettings 一致）。
  - **切换桌面后桌面仍显示上一个联系人的昵称**：根因——`personalize.js` bindLabel 只在启动时写一次 lbl-user/lbl-partner，contact-switched 监听器未重读。修复：监听器补刷新（新联系人无昵称回退默认「我 / TA」）。
- 涉及 `src/template.html`、`src/js/personalize.js`。已 build+verify+提交推送。

### 2026-08-18
- [本会话] 完成（主动发送爱心标识，已构建 verify 10/10 + CDP 探测 10/10，**本行记录随本次统一提交**）：需求——联系人主动发送消息的气泡左上角新增一枚极小爱心矢量图作为标识；回复设置→主动发送组新增开关可开/关。① `src/js/chat.js`：tryAutoSend 主动消息 `addIn(..., {initiative:true})`（撤回补发那条同步补 initiative:true）；`renderMsg` 对 `side==='in' && initiative && !retracted` 的消息读 `reply-as-badge`（默认 1）在气泡顶部注入 `.msg-hi-heart` SVG 爱心（Material heart 路径）；② `src/css/chat-main.css`：`.msg-bubble` 加 `position:relative`；`.msg-hi-heart` 绝对定位于气泡左上（top:-4 left:-5，14×14，`#ff4d6a` 粉红，pointer-events:none 不挡点击）；③ `src/template.html`：「免打扰」行后新增「主动发送爱心标识」开关 `as-badge`；④ `src/js/reply-settings.js`：DEFAULTS 加 `'as-badge':1`，开关数组（syncUI/保存/change）三处加 `as-badge`。CDP 10/10：产物含标记/SVG/主动消息爱心 14px 左上角粉红/正文正常/被动无爱心/拍一拍无爱心/关→无/开→恢复/设置页开关默认勾选且位于主动发送分组/点击落库 as-badge=0 且 UI 同步/无 JS 错误。涉及 `src/js/chat.js`、`src/css/chat-main.css`、`src/template.html`、`src/js/reply-settings.js`。已 build+verify+提交推送。

### 2026-08-18
- [本会话] 开工/通知（12:33）：用户已确认由**本会话统一构建提交部署**。对方已多轮完成（聊天记录保险丝/朋友圈去重/OPPO K13 三问题/深色模式），**请停止新改动**，完成当前轮后不要再开工新任务；本会话会在对方 10 分钟无新写入后执行 `node build.mjs` + verify + git 提交推送（一次提交含全部待提交改动）。若对方还有未保存改动请尽快保存并留话。

### 2026-08-18
- [本会话] 完成（深色模式，已构建 verify 10/10 + CDP 探测 15/15，**待提交**）：新增完整深色模式（两档手动开关：浅色/深色，不跟随系统）。① `src/css/base.css` :root 扩充语义变量集（--page-bg/--card-bg/--card-border/--input-bg/--btn-bg/--overlay-bg/--static-bg/--track-bg/--hint-ink/--soft-ink/--pill-border/--glass-bg/--bg-a/--bg-b/--shadow-strong 等）+ [data-theme="dark"] 覆盖块；base.css 通用组件（splash/modal/pwa-install/ce-box/glass/pill/cc-ip 等）硬编码色替换为变量；② 新建 `src/css/dark.css`（加进 build.mjs cssFiles 最后）用 [data-theme="dark"] 选择器覆盖 home/setting/chat-main/chat-pages 中硬编码色（已用 var 的元素由 base.css 自动切换，不重复）；③ `src/template.html` 美化页顶部新增「深色模式」行（row-theme-mode）+ head 加早期内联脚本防 FOUC；④ `src/js/personalize.js` 主题切换逻辑（全局键 xy-home-v2:theme-mode，不按联系人隔离）；⑤ `src/js/contacts.js` EXCLUDE 加 'theme-mode'（防 migrateLegacy 把全局键迁到 default 命名空间）。CDP 15/15：行存在/初始浅色/点击切深色/data-theme=dark/CSS 变量切换/持久化/刷新后仍深色/切回浅色/变量恢复。涉及 `src/css/base.css`、`src/css/dark.css`（新建）、`src/template.html`、`src/js/personalize.js`、`src/js/contacts.js`、`build.mjs`。**未提交**。

  - **内置壁纸预设**（`src/template.html` + `src/js/personalize.js`）：美化页新增「内置壁纸预设」行，8 个 CSS 渐变预设（晨曦/暮色/森林/暖阳/极简/星空/樱花/海洋）+ 清除预设，per-contact 存储 `phone-bg-preset`，与上传图片互斥（选预设清图片、上传图片清预设），contact-switched 重应用。
  - CDP 25/25 + 10/10：全部功能验证通过。涉及 `src/template.html`、`src/js/personalize.js`、`src/js/contacts.js`、`src/css/base.css`、`src/css/home.css`。**未提交**。

### 2026-08-18
- [本会话] 完成（用户反馈「朋友圈联系人主动发布的动态里字卡大量重复一直重复」，已构建 verify 10/10，**待提交**）：根因——`src/js/feed.js` `genPostContent`（TA 动态）与 `genMixedCards`（TA 评论/回复）每张卡都用独立 `rand()` 有放回抽取，字卡池小（尤其自定义字卡少/默认池）而每条动态默认 4~15 张卡时，同一张卡被反复抽中拼成「爱你爱你爱你…」式重复长文。修复：①新增 `makePicker(arr)` 无重复抽取器（洗牌取完一轮再重新洗牌，同轮不抽同一张卡）；②新增 `uniqArr` 去重（字卡库同内容重复条目不再放大重复率）；③两个生成器按类别（文字/颜文字/emoji/表情包/图片/内置兜底池）各自改用 picker，概率逻辑与参数完全不变，仅抽卡方式变无放回；④删除不再使用的 `rand()`。纯逻辑改动不涉及布局/样式。涉及 `src/js/feed.js`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。

### 2026-08-18
- [本会话] 完成（用户反馈 OPPO K13：雨见浏览器收不到信、Edge 默认音乐打不开、Edge 退后台清聊天记录；已构建 verify 10/10 + 临时 CDP 脚本 8/8，**待统一构建提交**）：
  - **音乐打不开根因**（`src/js/music-player.js`）：网易云外链 302 跳 CDN 在部分浏览器被拦/挂起——audio.play() 既不报错也不出声（Error 事件不触发 → 原有 onerror 兜底永不生效），播放条却正常点亮，用户看到"点了没声音"。修复（本会话收尾 AI-A 11:43 留下的进行中改动）：①停滞守卫 armStallGuard（12s 内 currentTime 恒 0 且无真实播放 → 种子歌切内置旋律兜底+toast「外链播放失败，已改用内置示例旋律」，普通歌 toast「播放失败：网络链接可能已失效」+停止）；②play() 被拒时 playRejected=true 不再静默；③onloadedmetadata 就绪后补播一次；④onplay/播放进度清除守卫，正常播放不误伤。CDP 验证 8/8：外链挂起桩→播放条点亮（假象）→12s toast→内置 WAV 写入 IDB→blob 源播放有进度→守卫不重复触发。
  - 雨见收不到信：mail 15s 保险丝已在线（v3.6.x），属系统侧（ColorOS 后台冻结/隐私清理），建议用户设后台白名单。
  - Edge 退后台清记录：AI-A 11:39 chat.js 保险丝改动（writeLsSnapshot + armReadyFuse）已在本轮构建内，建议用户关掉 Edge「退出时清除浏览数据」。
  - 涉及 `src/js/music-player.js`（AI-B 域）；chat.js 改动属 AI-A（未动）。已 `node build.mjs`（11:43，index.html 已含双方改动）+ `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交。另：tools/ 下残留 _probe-dcoff/_probe-idb-fuse/_probe-mecheck/_probe-swatch.mjs（前会话遗留，WORKLOG 曾记已删），下个会话顺手清掉。

### 2026-08-18
- [本会话] 完成（用户反馈 OPPO Find X9s Pro · X浏览器「昨天用了一天，今天早上聊天记录全没了，壁纸/头像/字卡/朋友圈/日历都在」，已构建 verify 10/10 + 临时 CDP 脚本 8/8，**待统一构建提交**）：诊断——线上 32f20a1（11:35 部署）已修复本 bug 根因（loadMsgs 的 store.remove 三连删 + writeLsSnapshot LS 兜底快照）；本次补强残留漏洞：**IDB 打开/读取挂起时 chatDbReady 恒 false → saveMsgs 只暂存内存、连 LS 快照都不写**（X浏览器/OPPO 后台挂起时 indexedDB 请求可能永不返回，mail.js 早有 15s 保险丝先例）——聊一天全在内存、刷新即全丢，且其他数据因 LS+IDB 双写不受影响，与用户症状完全吻合。改动 `src/js/chat.js` 三处：① saveMsgs 未就绪分支也调 writeLsSnapshot；② flushSave 未就绪且有消息时写快照；③ 新增 armReadyFuse() 15s 保险丝（loadMsgs 开头武装 + contact-switched 重新武装，就绪时把 pendingLocal/msgs 顺手写快照）。CDP 验证 8/8：IDB 挂起→开屏 12s 保险丝放行/发消息正常/快照落 LS/15s 无异常/刷新后从快照恢复聊天记录/正常环境 LS+IDB 双写回归。临时脚本已删。⚠️ **发现对方进行中改动**：`src/js/music-player.js`（11:43:31 保存，播放停滞守卫 armStallGuard/playRejected，未写 WORKLOG 未验证）——本会话 11:39 的构建**不含它**，当前 index.html 与 src 不同步，**请收尾后统一构建提交**，勿直接提交现有 index.html。

### 2026-08-18
- [本会话] 完成（用户反馈 iQOO/QQ浏览器两个问题：①每次重进后聊天记录全部消失（信箱信件还在）；②添加音乐后「已上传音乐」弹窗一直不消失+页面卡顿，已构建 verify 10/10 + 无头浏览器端到端 11/11，**待提交**）：
  - **① 聊天记录消失根因**（`src/js/chat.js`）：v3.6.x 起聊天记录权威数据只写 IndexedDB，但 `loadMsgs` 在读到 IDB 权威后执行 `store.remove('chat-msgs')`——它是「内存缓存+localStorage+IndexedDB」三连删（注释只说是清 LS 残留）。同一会话**再次进入聊天页**时 merged 与内存条数一致（changed=false）→ 删掉后不重写 → 杀 App 再进 IDB/LS 全空 → 记录整体丢失且无法恢复（信箱是 LS+IDB 双写、读 LS，所以没事）。修复：读路径只清 legacy 顶层键 `xy-home-v2:chat-msgs` 的 LS 副本，IDB 权威与快照一律不删；另补 **LS 兜底快照**（writeLsSnapshot：≤2MB 全文，超限剥 img/voice 字段只保文本），写 IDB 同时写 LS，IDB 丢失时 loadMsgs 自动从快照恢复（复用原迁入分支，恢复后保留快照作双保险）；LS→IDB 迁移分支改为不删源（原 idbSet 失败会清掉唯一备份）。端到端 5/5：重进后 IDB 仍在/刷新后完整显示/快照已写入/模拟删 IDB 后从快照恢复/快照保留。
  - **② 音乐弹窗卡住根因**（`src/js/music-player.js`）：多文件并行 FileReader.readAsArrayBuffer（每文件整段读内存）+ 并行 idbSet 写 Blob → 主线程长阻塞，toast 的 2s 隐藏 setTimeout 被严重延迟；X5 内核下 CSS 动画兜底也可能不执行；且个别文件 `tmp.onloadedmetadata/onerror` 都不触发时 pending 永不归零，「正在上传…」永远不被「已上传」替换。修复：①上传改**串行队列**（逐个文件读+存，结束统一 saveLibrary/renderPage/toast）——主线程不再长阻塞、内存峰值降 N 倍；②每文件 3s 时长读取**超时兜底**，队列必然走完、最终 toast 必然弹出；③toast() 增加**内联 opacity 双保险**（显示置 1、2s 后置 0，内联优先级最高，动画/定时器任一生效即隐藏）。端到端 6/6（CDP 文件选择器拦截 + 真实 WAV）：真实链路触发/「已上传 1 首音乐」/2s 后 class 移除+opacity 0/进音乐库/Blob 入 IDB。
  - 涉及 `src/js/chat.js`、`src/js/music-player.js`（均为 AI-A 域文件，用户直接反馈故本会话处理，已 build+verify+端到端验证）。已 `node build.mjs` + `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] AI-B 完成（备份提醒功能，已构建 verify 10/10，**未提交**）：用户确认要「定期备份提醒」。实现：①`src/template.html` 新增 `#backup-remind-bar` 顶部提醒条（复用 ver-update-bar 样式，零新增 CSS，含「去备份/稍后」按钮）；②`src/js/pwa.js` 新增提醒逻辑 IIFE——距上次成功导出超 7 天且近 7 天未提醒过时显示；数据就绪后才判断（全新安装/被清空的空状态不提醒）；版本更新提示条显示时让位不重叠；③`src/js/data-backup.js` 导出成功后记录 `xy-home-v2:__last-backup` 时间戳，并抽 `window.runBackupExport` 供提醒条与设置页共用。**待办**：提醒文案为「数据只存在本机浏览器里」，与 iOS Safari 清数据风险呼应。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。
- [本会话] AI-B 完成（用户反馈 iOS Safari「每次重开数据全丢、聊天记录丢失」根因排查 + 防护，已构建 verify 10/10，**未提交**）：排除 App 代码问题（聊天记录有 IDB 权威 + LS 有损快照 + 退出强制落盘三重兜底，启动流程不删数据）——"完全全新 + 每次都丢 + 普通标签页"指向 **Safari 系统级清空源数据**：WebKit 已知 bug 266559（配额记账未初始化，周期性清掉所有网站 localStorage+IDB，2024-01 修复，Safari 17.4 前受影响）、iOS 26.3 仍有回归报告、设备低存储会触发清理。**防护：`src/js/pwa.js` 新增 `navigator.storage.persist()`**（获批后豁免存储压力清理，iOS 15.4+ 支持，失败静默）。已 `node build.mjs` + `npm run verify` 10/10；本次构建**顺带包含 AI-A 已保存的 `src/css/tabbar.css`、`src/js/music-player.js` 改动**（非本会话所改，构建前已在工作区）。**未提交**，等待统一提交/部署。
- [本会话] 完成（iOS Safari 全景排查 + 修复，已构建 verify 10/10，**未提交**）：接「双击放大」修复后，逐文件排查 iOS Safari 全部系统层。发现并修复一条真实缺口：**聊天输入框（模板原生 contenteditable div，15px）不在 base.css 16px 防聚焦缩放规则覆盖范围内**（原规则只匹配 input/textarea/select）——iOS Safari 聚焦 <16px 的可编辑元素同样会整页自动放大（与双击放大同症状「页面越变越大」）。`src/css/base.css` 16px 规则补 `.phone [contenteditable="true"]`（特异性 0,2,0 压过 .chat-input 的 0,1,0，与加载顺序无关；Android ce-box 一并覆盖无副作用）。其余排查结论（均已验证无需改动）：iOS 键盘收缩 + 自愈看门狗、无 Fullscreen API 走 ios-fs-active + 引导、音频自动播放三处解锁、大图渲染防护、捏合/长按菜单/滚动穿透锁/safe-area max() 兜底/日期 T00:00:00 本地时区解析/RENDER_MAX=200/大键只进 IDB/version.json 轮询均已覆盖。涉及 `src/css/base.css`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「桌面美化新增自定义第一页摸鱼打卡横幅爱心外框（黑色圆底）的颜色」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：新增「爱心外框颜色」设置。① `src/css/home.css` 新增 `--widget-heart:#111111` 变量，`.ck-heart`（打卡横幅「和 TA 一起摸鱼」的爱心圆底）`background:var(--ink)` 改 `var(--widget-heart)`（心形符号保持白色）；② `src/template.html` 「按钮文字颜色」行后新增 `row-widget-heart`/`widget-heart-val`（爱心图标）；③ `src/js/personalize.js` 新增 applyWidgetHeart（存储 `widget-heart-color`，默认 `#111111`，16 色板 + 自定义取色 + 恢复默认），contact-switched 监听补重应用。8/8：入口/色板 16 色/樱花粉生效（--widget-heart + 打卡横幅爱心实际背景色）/♥ 文字仍白/恢复默认/自定义取色。涉及 `src/css/home.css`、`src/template.html`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「我的头像库图片可直接点击更换 + 我换头像要发聊天系统消息 + 联系人主动换我头像的记录（同意/拒绝都算）全部进桌面主页」，已构建 verify 10/10 + 无头浏览器端到端 20/20，**未提交**）：① `src/js/avatar-lib.js` `renderMeGrid` 头像图片加点击 → 新增 `switchMyAvatarFromLib(data)`：直接换 `avatar-user` + 应用头像 + 网格高亮 + toast「头像已更换」+ 聊天系统消息「我的昵称 更换了头像」；② `chatSystem` 调 `addAvatarRecord(img, text)` 把**事件文案**一并写入主页记录（延迟补写同样带 text）；③ `src/js/records.js` `addAvatarRecord(img, text)` 记录 `{img, text, ts}`，主页「换头像记录」tab 渲染事件原文（转义 + 缩略图），旧记录（无 text）回退「昵称 更换了头像」；④ `src/template.html` 主页 tab「联系人换头像」→「换头像记录」（面板标题同步）。端到端 20/20：点我的头像库图片直接换/聊天消息「小美 更换了头像」/记录带文案/高亮/主页展示事件原文+缩略图/邀请同意与拒绝记录文案均正确进主页/旧记录兼容/全程无 JS 错误。涉及 `src/js/avatar-lib.js`、`src/js/records.js`、`src/template.html`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「图标形状删掉圆形，新增自定义图标圆角滑块调整 + 页面预览形状」，已构建 verify 10/10 + 无头浏览器端到端 17/17，**未提交**）：① `src/js/personalize.js` openModal 新增**通用滑块支持** `opts.slider={min,max,step,value,label,unit,preview,onChange}`——`src/template.html` modal 内新增 `modal-slider`（ms-head 标签+实时值 + `ms-range` range + `ms-preview` 图标预览块），拖动 input 事件实时更新值/预览块圆角/onChange，确定时提交滑块数值；**fire() 顺序坑**：滑块分支必须先于 pills 分支，否则带「恢复默认」pill 的滑块弹窗点确定被 pills 拦截传 null；② 图标形状改「图标圆角」：删除圆形/圆角方/直角方 pills 三选一，改滑块 0~30px 实时预览（弹窗预览块 + 桌面图标实时变 --app-ico-radius），存储 `ico-radius`（数字），旧 `ico-shape` 迁移 circle→30/square→0/rounded→18，`src/css/base.css` 新增滑块/预览样式，`src/template.html` 入口改「图标圆角」。17/17：入口文案/默认 18px（默认）/无圆形选项/滑块存在/预览块/拖动 30px 预览+桌面实时变/确定存储/恢复默认/旧 circle 迁移。涉及 `src/template.html`、`src/js/personalize.js`、`src/css/base.css`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「美化页新增自定义组件按钮里的文字的颜色」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：新增「按钮文字颜色」设置。① `src/css/home.css` 新增 `--widget-btn-text:#ffffff` 变量，`.ck-btn`（打卡按钮）与 `.we-btn`（周末倒计时按钮）的 `color:#fff` 改为 `var(--widget-btn-text)`；② `src/template.html` 在「按钮颜色」行后新增 `row-widget-btn-text`/`widget-btn-text-val`；③ `src/js/personalize.js` 新增 applyWidgetBtnText（存储 `widget-btn-text-color`，默认 `#ffffff`，16 色板 + 自定义取色 + 恢复默认，色板顺序：8 白灰黑阶 + 8 彩色），contact-switched 监听补重应用。8/8：入口/色板 16 色/樱花粉生效（--widget-btn-text + 打卡/周末按钮文字颜色）/恢复默认/自定义取色。涉及 `src/css/home.css`、`src/template.html`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「头像互动半框顶部加页签，点击切换 联系人昵称的头像库 / 我的昵称的头像库」+ 反馈「TA 邀请我换头像的弹窗会误触关闭，还没点同意/拒绝」，已构建 verify 10/10 + 无头浏览器端到端 22/22，**未提交**）：① 页签：`src/template.html` 半框顶部改两页签 `avlib-tab-a`（联系人昵称 + 头像库 + 计数）/`avlib-tab-b`（我的昵称 / 无昵称回退「我的头像库」+ 计数），原「随机换头像」「头像池（N 张）」「我的头像池」标题删除，内容分装 `avlib-pane-a`（开关+网格+上传+清空）/`avlib-pane-b`（TA 主动给我换开关+网格+上传+清空，默认隐藏）；`src/js/avatar-lib.js` 新增 `switchAvTab(me)` + 页签点击监听，syncVal 页签文案改「头像库」并同步 lbl-user 昵称；`src/css/chat-pages.css` 新增 `.avlib-tabs/.avlib-tab(.active)/.avlib-tab-cnt`。② 弹窗锁定：`src/js/personalize.js` openModal 新增 `opts.lock`——点遮罩不关闭 + 隐藏取消按钮（只能走确定/选择路径），`src/js/avatar-lib.js` showMeAvatarInvite 传 `lock:true`（换头像邀请必须点同意/拒绝，防误触关闭丢失邀请）。端到端 22/22：页签结构/默认激活/昵称文案/计数/点击切换双向/无昵称回退/开关仍在/邀请弹窗无取消按钮/点遮罩不关闭/同意后正常关闭并换上/普通弹窗仍可点遮罩关闭。涉及 `src/template.html`、`src/js/avatar-lib.js`、`src/css/chat-pages.css`、`src/js/personalize.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「我的头像池：头像互动半框新增我的头像池，联系人按同机制定时主动换我的头像」，已构建 verify 10/10 + 无头浏览器端到端 42/42，**未提交**）：① `src/template.html` 半框新增「我的头像池」区块：`avlib-me-enabled` 开关（默认开，「TA 会每隔 1-8 小时主动给你换头像，直接换或弹窗征求你同意」）+ `avlib-me-grid`/`avlib-me-count`/`avlib-me-empty`/`avlib-me-upload`/`avlib-me-clear`；联系人池标题改 `<span id="avlib-pool-name">`（「昵称 的头像池」）。② `src/js/avatar-lib.js` 新增 me-lib 全套：`getMeLib/saveMeLib/getMeEnabled`（键 `avatar-me-lib*`，启用键 `avatar-me-lib-enabled` 默认开）、`renderMeGrid()`（含 avlib-now 高亮、删除按钮、不可手动切换）、共享 `bindPoolUpload/bindPoolClear`、`applyAvatarImg(data, out)`、`replyMeInvite`/`showMeAvatarInvite`（openModal pills 同意/拒绝 + modal-static 内 96px 圆形头像预览）、`checkMeAvatarRefresh` + 60s interval（独立计时 next=1+random*7 小时；弹窗被占用则跳过不推进、随机到当前头像跳过；概率/直换/邀请与联系人池一致）。③ 修复预存缺口：`chatSystem` 里 `window.addAvatarRecord` 在 records.js 加载前（启动即触发）未定义 → 记录页不写 `records-avatar`，加 setTimeout 600ms 延迟补写。端到端 42/42：半框 UI 结构/上传(1 张→计数+持久化+网格)/删除/清空确认弹窗/启动直换(头像=池第2张、聊天消息+附新头像图、记录写入、计时推进、桌面环应用、当前头像高亮)/弹窗邀请同意(换上+消息+关闭+计时)/拒绝(不变+消息)/开关关闭不触发/联系人池回归。涉及 `src/js/avatar-lib.js`、`src/template.html`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户反馈「切换联系人后桌面仍显示上一个联系人的头像/纪念日/摸鱼/今日情话」，已构建 verify 10/10 + 无头浏览器端到端 15/15，**未提交**）：根因——这些渲染函数只在页面加载时执行一次、不监听 `contact-switched`；头像另有双 bug（refreshActiveContactUI 只设 backgroundImage 但头像实际渲染在 `.ring` 内的 `<img>`，清不掉；applyAvatar 在新联系人无头像时不清 `.ring` 导致旧头像残留）。修复：① `src/js/contacts.js` `refreshActiveContactUI` 改调 `window.applyAvatars()`（按当前联系人 store 重读 avatar-user/avatar-partner）；② `src/js/personalize.js` `applyAvatar` 补 else 清空 `.ring` 分支；③ 今日情话 IIFE 抽成 `renderQuoteOfDay()`，contact-switched 监听（1970 行）补 `updateFishDays/updateLove/renderQuoteOfDay/renderExtras`。15/15：两联系人不同头像/纪念日/摸鱼切换全部正确、无头像桌面头像清空、切回恢复。涉及 `src/js/contacts.js`、`src/js/personalize.js`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户要求「自定义手机桌面图标入口同时可装修卡片背景，删除多余的卡片背景功能按钮」，已构建 verify 10/10 + 无头浏览器端到端 9/9，**未提交**）：① `src/template.html` **删除美化页「卡片背景」分组**（含入口行 `row-card-bg-decor`「装修模式设置卡片背景」+ 计数 `card-bg-decor-val`）——用户认为多余；② `src/js/personalize.js` 同步清理 `cardBgDecorRow`/`cardBgDecorVal` 引用与 syncCardBgUIs 中入口计数逻辑；③ 确认「自定义手机桌面图标」入口（`row-custom-icon` → `enterDecor()`）**本就同时开启** 图标网格 `editing`（点图标换图）+ `decor-on`（点卡片设背景）+ 装饰条「装修模式 · 点图标换图 · 点卡片设背景」——两个能力一体，无需单独入口。无头浏览器验证 9/9：美化页无卡片背景入口行/无卡片背景分组/点自定义图标入口进装修模式（editing+decor-on+装饰条）/点图标弹「图标已自定义」/点卡片弹背景菜单（含遮罩切换）/「完成」退出。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` **10/10**（上一轮 9/10 的 chat 输入栏贴底失败在重建后恢复通过，疑为构建产物残留，非代码问题）。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「桌面图标位置也可自定义」，已构建 verify 10/10 + 无头浏览器端到端 8/8，**未提交**）：装修模式点图标弹出的菜单**增加「上移/下移」**，可在图标网格内调整单个图标位置（之前只能整网格移动）。实现 `src/js/personalize.js`：① 图标点击菜单统一为「图标设置」——上传/更换图片 + 清除图片（有自定义图时）+ 上移 + 下移；② `moveApp(dir)` 移动节点（insertBefore，节点移动不重建、事件绑定保留）并持久化 `app-icon-order-<grid.app>`（data-app 数组 JSON）；③ `restoreAppIconOrder()` 启动时按存储顺序重排（移动节点恢复）；④ `src/template.html` 给两个图标网格加 `data-app="main"`（首页）/`data-app="p2"`（第二页）标记。无头浏览器验证 8/8：进装修模式/点图标弹「图标设置」菜单（含更换+清除+上移+下移）/chat 图标下移变第 1 位/顺序持久化 app-icon-order-main/刷新后顺序保持/上移回第 0 位。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户要求「自定义手机桌面图标行下方加说明」，已构建 verify 10/10 + 无头浏览器端到端 3/3，**未提交**）：`src/template.html` 该行 `.txt` 内加 `<span class="sub">自定义图标图片 · 桌面组件卡片位置 · 卡片背景图片</span>`；`src/css/setting.css` 新增 `.set-row .txt .sub` 样式（block 灰色 11.5px 小字）。无头浏览器验证 3/3：副标题文字/样式生效/入口仍正常进装修。涉及 `src/template.html`、`src/css/setting.css`。已构建 verify 10/10。**未提交**。
- [本会话] 完成（用户反馈「桌面美化的小组件颜色恢复默认，没有保存」，已构建 verify 10/10 + 无头浏览器复现 6/6，**未提交**）：根因——`src/js/contacts.js` `defaultStore().remove(k)` 删 default 命名空间键后，只手动 `localStorage.removeItem` + `idbDelete` 清旧顶层键，**漏了 memoryCache**；而 `defaultStore().get(k)` 有回退逻辑（default 命名空间读不到 → 回退读旧顶层键 `xy-home-v2:widget-bg-color`），memoryCache 里的残留旧值被读到 → 点「恢复默认」后 `store.remove('widget-bg-color')` 已执行、LS/IDB 已删，但 get 仍返回旧色（切桌面/重进设置时 CSS 变量又变回旧色，刷新后才正常——用户感知"恢复默认没保存"）。修复：defaultStore 的 `set/remove` 清旧顶层键改走 `window.xyStore(G).remove(k)`（memoryCache + LS + IDB 三处彻底清）；`deleteContact` 删联系人数据同样改走 `xyStore(prefix).remove`（原来裸 removeItem/idbDelete 漏 memoryCache）。无头浏览器复现：老用户升级（旧顶层键 widget-bg-color）→ 恢复默认 → `store.get` 由残留 `#f5f0eb` 变为 `null`（修复前）→ 修复后立即 null、刷新后仍默认白 6/6。涉及 `src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户反馈「联系人邀请玩游戏没有弹窗让我同意或拒绝，直接就打开了」，已构建 verify 10/10 + 邀请专项 27/27，**未提交**）：根因——v3.9.x `tryActiveInvite`（chat.js）命中邀请概率后发邀请消息 + typing → **直接自动打开游戏半框**，没有确认环节。修复：新增 `openInviteConfirm(title, staticText, onAccept)`——typing 结束后改弹 `openModal` 锁定弹窗（lock:true + pills 同意/拒绝 + staticText，复用 showMeAvatarInvite 同款模式），同意才打开对应半框（猜拳 openRpsPanel / Pong openPongPanel / 贪吃蛇 openSnakePanel），拒绝则 `addOut(pick(INVITE_DECLINE))` 发一条拒绝消息（4 句随机：下次吧/等会儿/先不玩啦/没状态），半框不打开；弹窗被占用或 openModal 未就绪时退回直接打开（避免邀请消息没下文）。同步更新 `tools/verify-invite-settings.mjs` 第 5/6 断言：由"半框自动打开"改为"弹窗弹出 + 含同意/拒绝 + 半框未开 + 点同意+确定后打开 / 点拒绝+确定后发拒绝消息(.msg-out +1)且半框不打开"。27/27 全过。涉及 `src/js/chat.js`（AI-A 域，用户直接反馈故本会话处理）、`tools/verify-invite-settings.mjs`。已 `node build.mjs` + `node tools/verify.mjs` 10/10 + `node tools/verify-invite-settings.mjs` 27/27。⚠️ 本次构建同时包含工作区已保存的对方改动（call.js/contacts.js），未提交，待统一提交/部署。

## 记录

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库页面里有灰色的滑动栏滚动条删掉」）：`src/css/chat-pages.css` 顶部给 `#page-chatcard` 加滚动条隐藏（`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`，ID 选择器覆盖 base.css .page 的 4px 细滚动条），只影响字卡库首页，其他页面保持 v3.6.69 细滚动条不动。**未构建未提交**，请构建者统一 `node build.mjs`。

### 2026-08-17
- [本会话] 完成（用户反馈两处：①默认聊天字卡顶部总开关无弹窗提醒；②系统预设字卡单卡关闭后联系人仍在使用，已构建 verify 10/10 + CDP 端到端 6/6，**未提交**）：① `src/js/default-cards.js` 总开关（dc-enabled）change 时补 toast「已开启/已关闭：使用系统预设字卡」。② 根因——系统字卡进回复有三条链路，其中 chat.js `getPool()` 的「字卡池空兜底」（自定义字卡分类为空时用系统字卡补池）**完全不过滤开关**：兜底直接把全部系统字卡塞进回复池（getDefaultCards 混入链路和回应/情绪字卡链路都有过滤，唯独这条没有）。修复：`default-cards.js` 暴露 `window.isDefaultCardOff(cat, c)`；`chat.js` 兜底改两处——`dc-enabled` 关闭时整个兜底不注入系统字卡、单卡「关闭使用」的字卡跳过（main/kaomoji/emoji 三分类各按来源分类查开关）。CDP 6/6：总开关 toast 弹「已开启：使用系统预设字卡」/模拟全关后新回复全为「收到～」/dc-enabled=0 后无系统字卡/恢复后系统字卡正常回复/真实关闭一张字卡 12 轮采样零次出现/采样期间系统字卡仍在回复。探测注意：聊天输入框是模板原生 contenteditable div（不是 input），探测发送需 `input.textContent=...`；查岗/通话等特殊消息会混入采样需按 `m.special` 过滤。涉及 `src/js/default-cards.js`、`src/js/chat.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「内置字卡单卡开关（开启/关闭使用）没有弹窗提醒」，已构建 verify 10/10 + CDP 端到端 6/6，**未提交**）：`src/js/default-cards.js`（聊天默认字卡）、`mood-reply-cards.js`（回应字卡 + 情绪字卡两处）、`quote-cards.js`（桌面今日情话）、`p2-features.js`（查岗日常字卡）四个模块的单卡开关点击后加轻提示 toast「已开启：/已关闭：」+字卡内容（超 18 字符截断加 …），default-cards 与 mood-reply-cards 各自补齐本模块的 toast/toastCard 函数（复用 #cc-toast 元素、2 秒自动消失，其余两个模块复用已有 toast）。CDP 6/6：五个开关（dc/mc/rc/quote/ck）点击均弹出正确 toast + 关闭状态落库 `dc-off-*/rc-off-*/mc-off-*/ck-off-*/quote-off:`。注意：聊天默认字卡页为懒渲染（点 `li-default-cards` 入口才构建 DOM），探测需先点入口。涉及 `src/js/default-cards.js`、`mood-reply-cards.js`、`quote-cards.js`、`p2-features.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（朋友圈两项需求：清除所有数据按钮 + 单条动态删除按钮，已构建 verify 10/10 + CDP 端到端 13/13，**未提交**）：① `src/template.html` 回复设置→朋友圈 tab 底部新增「数据」分组 + `#feed-clear-all` 危险行「清除所有朋友圈数据」（复用 set-row danger 样式，与聊天设置删除记录同款）；`src/js/feed.js` 绑定确认弹窗（noInput+staticText）→ 清空 `feed-posts`/`feed-notices`/`feed-app-unread` 三个全局键 + 关评论条 + 刷新角标/列表/通知面板。② 单条删除按钮扩展到所有动态：主列表删除按钮原来只显示在我的动态上（isMine），现所有动态（含 TA 的）都显示 `.feed-del`；「全部朋友圈」页原先完全没有删除按钮，现每条动态头部加 `.feed-del`；删除逻辑抽成公共函数 `deletePostConfirm(pid)`（主列表+全部朋友圈共用，确认后按当前可见页面重渲染，删除的是评论条目标时同步关闭评论条）。CDP 13/13：主列表 3 条（含 TA）均有删除按钮/确认弹窗/删除后剩 2 条/全部朋友圈页有按钮/删除+重渲染/设置页入口可见/确认弹窗/清除后动态+通知+未读角标全空/空态文案。涉及 `src/template.html`、`src/js/feed.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「设置里的切换不同联系人桌面的按钮不见了」修复，已构建 verify 10/10 + CDP 验证 6/6，**未提交**）：根因——`row-contacts`（联系人 / 桌面入口）是上上轮多联系人功能加进工作区但**从未提交**（git 全历史 `-S row-contacts` 无记录），之后 template.html 因误操作被 `git checkout HEAD` 回退 + Python 截断重写时丢失；`contacts.js` 入口绑定（`getElementById('row-contacts')`）仍在但永远匹配不到。修复：① `src/template.html` 设置页顶部补回独立 set-group 入口行 `row-contacts`「联系人 / 桌面」（用户图标 + `contacts-val` + 箭头，恢复 WORKLOG 所述原设计）；② `src/js/contacts.js` 新增 `refreshContactsVal()`——入口行 val 显示当前联系人名（跟随 `contact-switched` 刷新，切换桌面后名称同步更新）。CDP 验证 6/6：入口存在/设置页可见/文本正确/val 显示「默认」/点击打开联系人管理弹窗（display:flex）/弹窗标题与说明正确。涉及 `src/template.html`、`src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 开工（用户反馈「iOS 手机端依旧打开页面卡顿什么也点不了」，诊断中）：已排查启动链路（idb/clock/bg-keep/mobile-adapt/contacts/chat loadMsgs）+ 无头 Chrome iOS UA 空数据复现（无 JS 错误、无遮罩、无长任务、点击正常）→ 定位为存量超大图渲染防护缺口：上次 iOS 大图崩溃修复只清了头像/自定义图标存量（applyAvatar/restoreAppIcons >500KB），壁纸 phone-bg / 聊天壁纸 cs-bg / 卡片背景 card-bg-* / 每页背景 page-bg-* / 朋友圈封面 feed-cover-bg/feed-ta-cover 的渲染路径全部无防护——旧版压缩失败回退存原图（48MP/ProRAW 十几 MB）时，iOS Safari 每次启动渲染 backgroundImage 解码数百 MB 位图 → 渲染进程卡死（打开页面卡顿点不动、刷新依旧）。已完成修复并构建验证：personalize.js 新增 sanitizeBg 统一防护（BG_SAFE_LIMIT=6MB 壁纸类 phone-bg/page-bg-*/cs-bg，IMG_SAFE_LIMIT=500KB 卡片背景 card-bg-*），chat-settings.js cs-bg 6MB 防护，feed.js safeBg 500KB 防护（feed-cover-bg/feed-ta-cover/feedAllBg/feed-ta-avatar，activeStore+全局回退两层）。已 node build.mjs + npm run verify 10/10 + CDP 端到端验证（临时阈值方案：坏值 3000 字符被清除且不进 default 命名空间、正常 1KB 小图保留迁移、.phone 无背景、无 JS 错误；验证后恢复真实阈值重新构建）。临时脚本 tools/_probe-*.mjs 已删。
- [本会话] 追加优化（已构建 verify 10/10 + 真实数据规模 CDP 验证）：default-cards.js（AI-A 域）系统字卡 4621+ 张改懒渲染——原启动时同步构建全部 DOM（含逐卡 isCardOff 读 LS），低端 iOS 启动卡顿源之一；改首次打开系统字卡页才渲染，defaultCardCfg 抽取不受影响。规模模拟（5 联系人×1500 消息/300 字卡/150 朋友圈 + 头像池 60 + 背景图等，种子后 reload）：启动 ccItems 5072→451、长任务 max 67ms、无 JS 错误、打开系统字卡页 4621 张正常渲染、开屏就绪正常。另确认 idbRestore（分批 8 键/批 + 12s 保险丝）、clock（20s 保险丝）、聊天记录只存 IDB 不回填 LS——启动链路无其他死锁点。跨域提醒：chatcard.js 启动也构建自定义字卡 DOM（数百张，规模小于系统字卡），如需进一步优化由 AI-A 决定。**未提交**，等待统一提交/部署。
- [本会话] 完成（OPPO Edge「自定义字卡【拍一拍】分组字卡被联系人当普通聊天字卡发出、不触发拍一拍」修复，已构建 verify 10/10 + CDP 探测 5/5，**未提交**）：根因——`src/js/chat.js` `getPool()`（回复字卡池）把【拍一拍】分组字卡（纯文字，无表情/颜文字特征）按规则归入 `text` 池（函数里声明的 `poke` 数组从未被填充），联系人被动回复/主动发送抽中后按普通聊天字卡发出；拍一拍模式只走 `touch-prob → performPoke()`（读 `getPokeCards`），两个素材池未隔离。修复：`getPool()` 开头用 `getPokeCards()` 构建 `pokeSet`，字卡归类时命中即跳过——拍一拍字卡只经拍一拍模式使用（居中灰字「昵称+字卡+我」）。CDP 探测 5/5：getPokeCards 返回种子拍一拍词 / getCustomCards 仍含全部字卡 / 发送链路正常（6 条 out）/ 6 轮回复共 4 条 in 中拍一拍词零次作为普通聊天卡出现 / poke 渲染路径正常。涉及 `src/js/chat.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。另：`tools/` 下发现遗留 `_probe-ios-freeze.mjs`（非本会话产生），请确认后清理。

### 2026-08-17
- [本会话] 完成（用户反馈「桌面 UI 按钮全部往左移动了」修复，已构建 verify 10/10 + CDP 布局对照，**未提交**）：根因——工作区未提交的「卡片背景分组」改动在 `src/template.html` 美化页（`#page-theme` 内）插入新 set-group 时**弄丢了 `#page-theme` 的闭合 `</div>`**（原位置 `-    </div>` 被替换成新分组，且残留一段重复行 `<div class="txt">装修模式设置卡片背景</div><div class="val"…></div>` 带 2 个多余闭合），浏览器自动闭合导致 `.phone` 提前收尾、tabbar 及后续页面变成 body 直接子元素；body 是 `display:flex; justify-content:center`，.phone(390)+tabbar(118)=508 在 390 视口居中 → .phone 左移 (390-508)/2 ≈ -59px，桌面全部图标/按钮整体左移。修复：`src/template.html` 删除重复残留 4 行 + 补回 `#page-theme` 缺失的 `</div>`。CDP 对照验证：修复后与 HEAD 一致——phoneLeft=0、tabbar 直接子元素链 `[.tabbar, .phone]`、tabW=354 可见，bodyChildren 仅 phone+script 等。另：本会话中途发现 `.git/refs` 与 pack 文件被意外删除导致 git 损坏，已重建 refs + `git fetch origin` 恢复（HEAD=23a4845 在远端存在）。涉及 `src/template.html`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景分组只留入口行，其他多余行删掉」，已构建 + 无头浏览器端到端 10/10，**未提交**）：`src/template.html` 美化页「卡片背景」分组**删除 9 行具体卡片入口**（纪念日卡背景 / 今日情话卡背景 / 已摸鱼卡背景 / 打卡横幅背景 / 音乐播放器背景 / 今日备忘卡背景 / 今天的心情卡背景 / 本周日常卡背景 / 周末倒计时卡背景），**只保留入口行 `row-card-bg-decor`「装修模式设置卡片背景」**（带 `card-bg-decor-val` 计数「已设 N 个」）。理由：进装修模式点桌面卡片即可完成所有操作（更换/清除/遮罩/上移/下移/移出），9 行单独入口是冗余。过程中**意外操作失误**：`git checkout HEAD -- src/template.html` 加上 Python 脚本 -1 切片错乱导致模板损坏（桌面结构在文件末尾重复一份 + 部分缺失），**已用 Python 截断到第一个 `</body>` + Edit 工具逐个补回 9 个 `data-card-bg` 标记 + 7 个 `data-desk-widget` 标记 + 装饰条文案改通用**。无头浏览器端到端 10/10：分组只剩 1 行入口 / 9 个 data-card-bg 标记正确 / 装饰条文案通用 / 点入口进装修模式 / 点卡片弹完整设置菜单（含 上传/上移/下移/移出）。涉及 `src/template.html`。已 `node build.mjs` + `npm run verify` 9/10（**遗留**：360x640 视口下聊天页 page 高 936 vs phone 640，输入栏距 phone 底 207px 不贴底——`src/js/chat.js` 和 `src/css/chat-main.css` 不在本轮改动范围，是 HEAD 既有 chat 布局问题，需后续单独排查修复）。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景功能要像自定义桌面图标一样，点入口直接进装修模式传背景」，已构建 verify 10/10 + 无头浏览器端到端 11/11，**未提交**）：① `src/template.html` 美化页「卡片背景图片」分组**顶部新增入口行 `row-card-bg-decor`「装修模式设置卡片背景」**（画笔图标 + `card-bg-decor-val` 计数「已设 N 个」）；② `src/js/personalize.js` 把进入装修模式抽成公共函数 `enterDecor()`（切桌面 + 图标网格 editing + `decor-on` + 装饰条显示），**「自定义桌面图标」与「装修模式设置卡片背景」两个入口共用**；新入口点击 → `enterDecor()` + 轻提示「点桌面上的任意卡片即可设置背景」；③ 装饰条文案改为通用「装修模式 · 点图标换图 · 点卡片设背景」（原「点击图标更换 / 清除」）；④ `syncCardBgUIs()` 扩展同步刷新入口计数（与 9 行状态文本一起更新）。无头浏览器验证 11/11：入口存在且排分组第一/计数「已设 2 个」（刷新后）/点入口直接进装修模式（decor-on+editing+装饰条）/装饰条文案通用/点卡片弹设置菜单/菜单含上传+上移+下移+移出/「完成」退出装修。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「自定义桌面图标无法恢复默认 + 装修模式卡片上的操作条按钮多余要删」，已构建 verify 10/10 + 无头浏览器端到端 10/10，**未提交**）：根因——上一轮「卡片自由摆放」注入的悬浮操作条 `.desk-widget-ops`（↑↓✕）挂在所有 `[data-desk-widget]` 上，**包括 app-grid 图标网格**：操作条悬浮在网格右上角遮挡图标，装修模式点图标实际点到操作条按钮（stopPropagation 拦截）→ 弹不出「更换/清除」菜单 → 图标无法恢复默认；误触 ✕ 还会把整个图标网格移出此页。修复 `src/js/personalize.js`：① **删除 `injectWidgetOps()` 及调用**（`src/css/home.css` 同步删除 `.desk-widget-ops` 全部样式）；② **卡片摆放操作收进点卡片菜单**——`openCardBgMenu(type,name,anchorEl)` 增加可选 `anchorEl`：装修模式点卡片时传入点击的卡片元素，菜单在「上传/更换/清除/遮罩切换」基础上追加「上移 / 下移 / 移出此页」（对应移动组件块节点 + `saveDeskLayout`，与操作条原行为一致）；设置页行点击不传 anchorEl 保持原有菜单；③ 无背景卡片点击行为调整——装修模式点卡片一律弹菜单（含上传+摆放），不再直接弹文件选择（保证摆放操作可达）；④ `#page-phone` capture 委托移除对已删 `.desk-widget-ops` 的排除，改为排除 `.desk-lib`/`.decor-bar`/`.desk-page-add`。无头浏览器验证 10/10：桌面无操作条残留/图标自定义渲染/装修模式点图标弹「图标已自定义」/菜单含更换+清除/点清除后存储删除+恢复默认 SVG/点卡片弹设置菜单/卡片菜单含上移下移移出此页/移出后进隐藏池/清理还原。涉及 `src/js/personalize.js`、`src/css/home.css`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「卡片背景上传改为装修模式点卡片直接传，与自定义图标同交互」，已构建 verify 10/10 + 无头浏览器端到端 11/11，**未提交**）：① `src/template.html` 给 9 个卡片元素加 `data-card-bg="<type>"` 标记（deco/quote/fish/checkin/music/memo/mood/week/weekend）；② `src/js/personalize.js` `CARD_BG_TYPES` 选择器从固定位置（`.page-slide.second .music-widget` 等）**改为 `[data-card-bg="<type>"]` 属性选择**——修复隐患：卡片被挪到新增页后（上一轮「卡片自由摆放」），原位置选择器匹配不到、背景设置失效；③ 重构上传/清除/遮罩逻辑为公共函数 `openCardBgMenu(type,name)`（设置页行点击与装修模式共用）+ `syncCardBgUIs()` 统一刷新 9 行状态文本；④ **装修模式点卡片上传**：#page-phone 事件委托（capture）——`decor-on` 模式下点击 `[data-card-bg]` 卡片即弹背景设置菜单（无背景直接弹文件选择，有背景弹「更换/清除/遮罩切换」），`preventDefault+stopPropagation` 保证不触发卡片自身功能（备忘/心情/打卡/音乐），与「装修模式点图标换图、不打开功能」行为一致；非装修模式点击不受影响。无头浏览器验证 11/11：9 卡标记/非装修点备忘正常弹窗/无背景点卡片直接文件选择/有背景点卡片弹菜单/标题正确/含遮罩切换/遮罩切换生效/背景应用原图直出/退出装修恢复功能/打卡横幅挪第 3 页/挪页后点卡片仍弹菜单。涉及 `src/template.html`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（桌面装修增强：卡片背景图 / 新增空白主页 / 卡片自由摆放，已构建 verify 10/10 + 无头浏览器端到端 20/20，**未提交**）：用户需求「桌面美化新增：每类卡片背景图、新增空白主页、增加自由度自由上传图片装修」。三块：
  1. **每类卡片独立背景图 + 遮罩可切换**（`src/template.html` 美化页新增「卡片背景图片」分组 9 行 + `src/js/personalize.js` `applyCardBg`）：纪念日卡/今日情话/已摸鱼/打卡横幅/音乐播放器/备忘/心情/本周日常/周末倒计时 9 类各自上传（compressImage 1000px，失败拒绝存原图防 iOS 崩溃），存储 `card-bg-<type>` + `card-bg-mask-<type>`（'on'=白色遮罩 0.78 / 'off'=原图直出），`contact-switched` 重应用。已设置卡片点行 → 弹「更换/清除/遮罩切换」菜单。
  2. **新增空白主页**（`desktop-slider.js` 动态页 + `personalize.js` buildDeskPages）：美化页新增「桌面页面」分组——新增空白主页（上限 5 页）、删除最后一页（核心 2 页不可删，页上卡片移回隐藏池）、每页独立背景图（`page-bg-<idx>`）。desktop-slider 改为动态查询 slides/dots + 圆点事件委托 + `window.deskRebuild()` 重建圆点。
  3. **卡片自由摆放**（`personalize.js` 装修模式扩展）：进入装修模式（自定义桌面图标入口）同时开启 `decor-on`，每张卡片右上角出现操作条（↑ 上移 / ↓ 下移 / ✕ 移出到隐藏池）；新增空白页始终显示「+ 添加卡片」打开组件库（9 个组件全局唯一，选中即从原位置移动到本页）。**关键原则：移动 DOM 节点不重建**——组件内部事件绑定（p2-features 的 memo/mood/week、music-player 等）全部保留。
  4. **关键坑记录**：① `background-image` 不能拼 `center/cover`（非法值被浏览器整体丢弃），url 与遮罩渐变放 backgroundImage、size/position/repeat 单独设置；② openModal 的 `noInput` 无 pills 时确定按钮回调 `'ok'`（删除页确认用静态文本 + noInput，不用需先点胶囊的 pills）。
  涉及 `src/template.html`、`src/js/personalize.js`、`src/js/desktop-slider.js`、`src/css/home.css`。已 `node build.mjs` + `npm run verify` 10/10 + 无头浏览器端到端 20/20（分组渲染/背景图遮罩切换/加页/圆点重建/空白页/每页背景/操作条/卡片移动/删页回隐藏池/组件库）。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户要求「切换桌面，每个桌面的美化要完全独立」，已构建 verify 10/10 + 无头浏览器端到端 12/12，**未提交**）：此前多桌面隔离只覆盖了聊天/字卡/头像等数据，**朋友圈美化与小组件颜色仍是全局共享**（切桌面不独立）。本次修复三处：① `src/js/feed.js`——朋友圈美化键（`feed-cover-bg` 封面背景、`feed-ta-name`/`feed-ta-avatar`/`feed-ta-cover` TA 展示名/头像/背景）改为按当前桌面（activeStore）读写，读取回退全局旧键（老数据兼容）；「全部朋友圈」页修复遗留 `feedAllOwner` 恒 undefined bug（永远走 TA 分支 + 写全局），改为按 `feedAllCid` 对应桌面的 `storeFor(cid)` 写 `feed-ta-*` 键（每个联系人桌面独立），封面头像补显示该桌面 TA 头像；末尾 IDB 大键补读全部改 `activePrefix()`；新增 `contact-switched` 监听刷新封面。② `src/js/personalize.js`——`contact-switched` 监听器补上小组件三色重新应用（`--widget-bg`/`--widget-border`/`--widget-btn` 按新桌面 CSS 变量刷新，此前只在页面加载时应用一次）。③ `src/js/chat-settings.js`——新增 `contact-switched` 监听重跑 `applySettings`（聊天壁纸/气泡颜色/字号/头像形状按新桌面）。无头浏览器验证 12/12：两桌面各自设置不同朋友圈封面/TA名/TA头像/小组件颜色 → 各自读出独立值、切换后互不影响、CSS 变量 `--widget-bg` 跟随桌面切换。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（用户反馈「桌面新建/切换联系人桌面的按钮无反应 + 不要绿色改回黑白配色」，已构建 verify 10/10 + 无头浏览器端到端 10/10，**未提交**）：根因——`src/js/contacts.js` 联系人管理弹窗两处致命 bug：① `ensureModal()` 给弹窗写死内联 `display:flex`（`m.style.cssText`），**内联样式优先级高于 `hidden` 属性的 UA 样式 `[hidden]{display:none}`** → `m.hidden=true/false` 完全失效：关闭/切换/点遮罩后弹窗永远关不掉，一直盖在页面上（"按钮无反应"）；② 弹窗 z-index 9999 高于全局 `openModal` 的 `#modal-mask`（z-index 90）→ 点「+ 添加联系人/桌面」「改名」时弹出的输入框被联系人弹窗压在下层，看不到也点不到。修复：新增 `showContactModal/hideContactModal`（`display:flex`/`none` 显式控制显隐），弹窗 z-index 降到 **89**（低于 modal-mask，openModal 输入框可浮在其上）；另按用户要求把联系人弹窗的绿色（激活圆点 `#3b6d11`、添加按钮背景 `#3b6d11`）改回项目原本黑白配色（`#111`）。无头浏览器端到端 10/10：设置页入口开弹窗/弹窗 z-index=89 无绿色/添加按钮弹出输入框且 modal-mask 在上层/新建联系人成功/新建后自动切换/切换后弹窗关闭/点行切回默认桌面/测试数据清理/「关闭」按钮/点遮罩关闭 全部通过（注：初版测试脚本选择器层级写错 `>div>div` 匹配到列表容器致 1 项误报，修正为 `>div>div>div` 后全过）。涉及 `src/js/contacts.js`（`index.html` 已构建）。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 修复（多联系人上线后「刷新重新打开，桌面我的头像/桌面壁纸/聊天壁纸丢失」，已构建 verify 10/10 + 无头浏览器复现/回归，**未提交**）：根因两条——① `contacts.js` 的 `migrateLegacy` 把**命名空间键**（`xy-home-v2:default:*`）也当"旧顶层键"再迁移一层，产生 `xy-home-v2:default:default:*` 双重前缀并删除原键（刷新后头像/壁纸/聊天壁纸丢失）；② `migrateLegacy`（删旧键）与 `idbRestore`（异步回填，12s 保险丝期间仍在后台恢复）**启动竞态**——restore 先拿到旧键列表、迁移后删掉 IDB 旧键、新键不在 restore 列表 → 大键（>200KB 只存 IDB）彻底丢失。修复 `src/js/contacts.js`：① `isExcluded` 排除命名空间键（`default` 或 `c` 开头联系人 id 前缀），**但保留含冒号的旧业务键**（`dc-off-分类:内容`/`quote-off:内容`/`day-fish-日期` 等，用已知业务前缀白名单判定，不能一刀切 `indexOf(':')` 排除——否则字卡单卡开关状态全丢）；② `migrateLegacy` 延迟到 `mochi-restore-done` 后执行（消除竞态），且**只删 localStorage 旧键、保留 IndexedDB 旧键**（restore 保险丝期间仍需回填，defaultStore 优先读新键、回退旧键，数据永不丢）；③ 幂等：default 命名空间已有键则不重复写；④ finish 不覆盖已有 `active-contact`（防止重置用户已选联系人）；⑤ 顺带清理存量 `default:default:*` 垃圾键。无头浏览器验证：老用户升级（顶层大键+含冒号业务键）4/4、刷新大键恢复 3/3、多联系人核心回归 10/10（迁移/隔离/字卡/朋友圈）。涉及 `src/js/contacts.js`。已 `node build.mjs` + `npm run verify` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（聊天设置页补上「双方气泡/文字颜色」4 项设置，已构建 verify 10/10 + CDP 端到端 12/12，**未提交**）：用户反馈「聊天设置页面里缺少 我的气泡颜色/我的消息文字颜色/联系人气泡颜色/联系人消息文字颜色」。① `src/template.html` 气泡样式组下新增「颜色」分组 4 行（cs-out-bg 我的气泡颜色 / cs-out-ink 我的消息文字颜色 / cs-in-bg 联系人气泡颜色 / cs-in-ink 联系人消息文字颜色，各带 .val 回显）；② `src/js/chat-settings.js` 新增 `bindBubbleColorRow`（openModal 色板 9 色 + 自定义取色，值存 `cs-out-bg/ink`、`cs-in-bg/ink` 键，落 applySettings 的 --msg-out/in-bg/ink CSS 变量，回显默认色显示「默认」）；③ **顺带修复 openModal 的 fire() 分支 bug**（personalize.js）：弹窗同时带 pills 与色板时 pills 分支先 return，色板选中值永远传不到回调（widget 小组件颜色此前选色板无效），现色板/自定义取色优先；widget 颜色回调同步补下标→色值映射。CDP 12/12：4 行渲染/默认回显/弹窗 9 色板+自定义/选色板生效+持久化+回显/自定义取色/联系人两行/刷新保留/聊天气泡实际渲染颜色全部通过。涉及 `src/template.html`、`src/js/chat-settings.js`、`src/js/personalize.js`。已 `node build.mjs` + `npm run verify` 10/10。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（**多联系人/多桌面功能**，已构建 verify 10/10 + 无头浏览器端到端 14/14，**未提交**）：用户需求——设置页新增「联系人/桌面」，每个桌面数据完全隔离（含"我"的身份/头像/昵称/字卡库），**仅朋友圈全局共享**（所有桌面的动态都能看到，各联系人用自己的字卡、身份独立显示、可互相评论互动）。
  - **新增 `src/js/contacts.js`**（build.mjs jsFiles 中放在 idb.js 之后，最先于功能模块加载）：存储抽象 `window.activePrefix()`（当前命名空间前缀 `xy-home-v2:<cid>:*`）/ `activeStore()`（**动态绑定当前联系人**——各模块顶部 const store 一次性缓存，若在创建时闭包固定 cid 则切换后仍读写旧桌面）/ `storeFor(cid)`；注册表 `getContacts/createContact/renameContact/deleteContact/setActiveContact`（切换前 flush 聊天防抖写盘 + 广播 `contact-switched` 事件 + 回桌面）；一次性迁移 `migrateLegacy`（旧顶层键归入 default，**只要发现旧键就迁移**，不能因标记误设而跳过——否则 idbRestore 异步回填的旧数据永不迁移；补迁移不得覆盖已有 contacts）。
  - **朋友圈 `feed.js`**：posts 存全局 `xy-home-v2:feed-posts`；作者身份快照 `{role:'me'|'ta', owner:cid, authorName, authorAv, taName, taAv}`，渲染/评论/点赞一律用快照（新数据）或 role 兜底（旧数据 by 字段）；`maybeAutoPostFor(cid)` 遍历所有联系人、TA 各自用**自己桌面字卡**（`getCustomCardsFor(cid)`/`getMediaCardsFor(cid,type)`）发动态；评论/回复内容也按动态所属桌面取字卡（`genMixedCards(...,cid)`/`pickReplyContent(cfg,cid)`）；点赞/评论/回复的身份与通知文案用 `p.taName || partnerName()`。
  - **字卡 `chatcard.js`**：新增 `contact-switched` 重载 groups + `window.getCustomCardsFor(cid)`/`getMediaCardsFor(cid,type)`（按 cid 读 cc-groups，供朋友圈 TA 用）。
  - **22 个模块 rewire 到 activePrefix/activeStore**（含 chat/mail/calendar/records/music-player/p2-features/personalize/decision 等）：`uid + ':'` 全部动态化为 `window.activePrefix() + ':'`（运行时取当前联系人，**不能**在模块顶部缓存）；模块级派生常量 MYE_KEY/MUSIC_FILE_PREFIX 改函数；各模块加 `contact-switched` 重置内存态（chat 清 msgs/chatDbReady/pendingLocal、mail 重读 IDB、calendar 清 calCache、music 重载歌单+停播、personalize/p2 刷桌面壁纸图标备忘心情打卡、records 重渲染、decision 清 pending）。
  - **data-backup.js**：导出/导入/清空/回滚恢复为**全量**（`xy-home-v2:` 前缀，覆盖所有联系人命名空间 + 全局键），摘要/核对按所有桌面聚合 chat-msgs/头像/摸鱼。
  - **template.html**：设置页新增 `row-contacts`「联系人 / 桌面」入口（含用户图标，独立 set-group 置顶）。
  - **关键坑记录**：① 正则 `/uid \+ ':'/`（`'` 后接 `:` 再**接 `'`**）会要求冒号后紧跟单引号而漏匹配，正确应为 `/uid \+ ':/`；② `JSON.stringify(async IIFE())` 同步返回 undefined（awaitPromise 也等不到），测试脚本要用同步 IIFE；③ build.mjs 健康检查会警告未跟踪 .mjs 临时脚本。
  - ⚠️ **需对方知悉**：`AGENTS.md` 文件归属按默认执行，本次 contacts.js 归「系统/全局」域；`build.mjs` jsFiles 新增 contacts.js；`index.html`/`sw.js`/`version.json` 已构建产物。**未提交**，等待统一提交/部署（版本号将随提交数自动 +1）。

### 2026-08-17
- [本会话] 完成（一加7Pro · 夸克浏览器「音乐里本地上传的音乐无法播放」修复，已构建 verify 10/10 + 无头浏览器回放探测 14/14，**未提交**）：根因——本地上传音乐以 **base64 dataURL 字符串**存 IndexedDB（`music-file:<id>`），播放时 `new Audio(); audio.src="data:audio/mpeg;base64,…"`；夸克（UC 系 Chromium 内核）对 `<audio src="data:…">`（尤其大段 base64）播放失效，且无报错（`audio.error` 为 null、play() 不 reject、只静默不出声）。修复 `src/js/music-player.js` 统一改用 **Blob + `URL.createObjectURL`（blob: URL）** 播放（标准方案，无 size 限制）：① 上传改 `readAsArrayBuffer` → 存 `Blob`（compact、可结构化克隆），读时长用对象 URL 并即时 revoke；② 新增 `playLocal(m,v)`——本地播放统一走 blob: 对象 URL，`v instanceof Blob` 直接用、旧版 dataURL 字符串自动转 Blob（fetch 优先，失败手动 base64 解码），异步转换期切歌守卫；③ `teardownAudio`/`onended` 释放对象 URL；④ 种子歌外链失败兜底旋律（`playDemoFor`）同步走 `playLocal`；⑤ 缓存统计兼容 Blob（真实字节）与旧字符串（×0.75），MB 换算统一；⑥ `src/js/data-backup.js` 导出时 **Blob→dataURL 字符串序列化**（JSON 无法存 Blob，原 JSON.stringify 会把 Blob 变 `{}`），导入后播放路径自动识别转回。无头 Chrome 回放探测 14/14：新 Blob 存储播放（blob: URL、无错误、进度走动）、旧 dataURL 兼容播放、IDB 缺失明确 toast、备份导出转换正确且 JSON.stringify 不抛错。临时探测脚本已删。涉及 `src/js/music-player.js`、`src/js/data-backup.js`。已 `node build.mjs` + `npm run verify` 10/10。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（iPhone 13 · iOS Edge「桌面卡住，点【聊天】无反应、什么都点不了」修复，已构建 verify 10/10 + CDP 复现/行为验证，**未提交**）：根因——`calendar.js`「TA 的今日留言」在**页面加载 800ms 就弹出**，早于用户点开屏「点击进入」；用户进入后第一眼就是被 `modal-mask`（z-index 90、全屏半透明遮罩 + `body.scroll-lock` 全页锁滚动）盖住的桌面，点【聊天】等图标实际点在遮罩上 =「什么都点不了」（CDP 实测：开屏关闭后 0.8s 桌面 modal 未隐藏、scroll-lock=true、聊天图标命中 modal、点击无效；上一轮只修了「聊天页打开时跳过」，桌面路径未覆盖）。修复 `src/js/calendar.js`：今日留言由**居中遮罩弹窗改为顶部非阻塞横幅**（复用 desk-msg 式 fixed 顶部横幅，z-index 89，不锁滚动、不遮操作）——① 展示时机改在**开屏关闭后**（轮询 splash 隐藏 + 1s 延迟，避免被开屏盖住/8s 自动收起过期）；② 仅桌面可见时展示（聊天/其他页或已有弹窗时不打扰）；③ 8s 自动收起，**点击横幅直接打开日历页**查看完整留言；④ 每天一次的标记逻辑保留（LS+IDB 双写）。CDP 验证：开屏关闭后 1.2s 横幅出现（330×182 顶部，内容完整）；**横幅可见时点【聊天】正常进入聊天页**（不遮挡不锁滚动）；9s 后横幅自动隐藏；刷新后不再弹（标记生效）。涉及 `src/js/calendar.js`。已 `node build.mjs` + `npm run verify` 10/10 + CDP 复现对比（修复前点聊天无效/修复后正常）。临时探测脚本已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（信箱信纸图片追加修复：统一大小+行内留空，已构建 verify 10/10 + 浏览器实测，**未提交**）：用户反馈「信箱里联系人使用的图片和表情包依旧一大一小」+「图片和表情包也是字卡，要每个字卡中间空一格，不要一行一个字卡」。修复 `src/js/mail.js` `renderBody()`：去掉 `sticker:`/`image:` 的尺寸区分（`.mail-body-img-stk` 类删除，图片/表情包统一渲染为 `class="mail-body-img"` 且 img 标签后追加空格）；`src/css/chat-pages.css` `.mail-body-img` 改为 `max-width:100px; max-height:100px; display:inline-block; vertical-align:middle; margin:2px 3px`（统一同尺寸 + 行内混排 + 字卡间留空，不再独占一行）。实测：sticker 与 image 两张图均 100x75px 相同大小、同一行、间隙 10px，点击仍可查看大图。涉及 `src/js/mail.js`、`src/css/chat-pages.css`。已 `node build.mjs` + `npm run verify` 10/10 + 浏览器实测（信纸两图 class 统一、大图查看器仍可用）。临时测量页已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（信箱/朋友圈图片显示修复，已构建 verify 10/10 + 浏览器实测 9/9，**未提交**）：用户反馈「信箱和朋友圈图片显示依旧有问题」。① **信箱**：来信/回信里的图片与表情包统一为缩略图（图片 220→150px、表情包 96→80px，`.mail-body-img` 加 `cursor:zoom-in`），并**可点击查看大图**（复用聊天 `window.viewChatImage`）——`src/js/mail.js` 新增 `bindLetterImgClicks()`，信详情（openLetter→tc-body）与回信页原信（openReply→mail-reply-original）都绑定。② **朋友圈动态**：联系人发布的图片/表情包与我的发布统一进 `.feed-imgs` 网格（同一套 CSS 尺寸规则，本就共用；实测 2 张=141px/3 张=116px 双方一致）；修复**全部朋友圈页图片点不动**——`src/js/feed.js` 把图片点击绑定抽成 `bindFeedImageClicks()` 供主列表与「全部朋友圈」页共用；**老数据兼容**：旧版动态把图片 dataURL 直接拼进正文（含 `sticker:`/`image:` 前缀与无前缀），渲染时抽出并入图片网格，保证与我的发布大小一致（注意正则：前缀与 dataURL 必须整体作为一个可选分组 `((?:sticker|image):)?(data:image…)`，若写 `(?:sticker|image):?(data:…)` 会在 `data:image` 中间误匹配 `image` 导致整体失败）。③ **评论区**：我/联系人在朋友圈评论区及回复发送的图片/表情包统一为缩略图（100→80px、回复 60→56px，`.feed-inline-img` 加 `cursor:zoom-in`），且**可点击查看大图**（主列表已有、全部朋友圈页本次补上）。涉及 `src/js/mail.js`、`src/js/feed.js`、`src/css/chat-pages.css`。已 `node build.mjs` + `npm run verify` 10/10 + 浏览器实测 9/9（信箱信纸图/回信页原信图/动态网格图/评论图/全部朋友圈主图+评论图/我的全部朋友圈图 点击均弹出大图查看器；旧格式内联图帖抽入网格后网格 1 张/内联 0 张；评论图保持内联缩略图）。临时种子/测量页已删。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（字卡库两项增强，已构建 verify 10/10 + CDP 功能探测 20/20，**未提交**）：① **批量导入弹窗顶部「确定」按钮**——安卓下多行输入被转成可自动增高的 ce-box，导入内容多时弹窗变高、底部「确定」滚出视野（用户反馈找不到确定按钮）。修复：`src/js/chatcard.js` 新增 `showImportTopOk()`，批量导入弹窗打开前在顶部标题栏右侧注入「确定」按钮（sticky 吸顶、点击复用底部按钮，弹窗关闭即还原，不影响其他弹窗），`src/css/chat-pages.css` 新增 `.cc-modal-topbar/.cc-modal-top-ok`。② **系统预设字卡逐张开关**——字卡库全部系统预设字卡（聊天默认字卡 4621 张 / 聊天回应字卡 / 聊天情绪字卡 / 查岗日常字卡 / 桌面今日情话）每张卡右侧新增单卡开关，可逐张开启/关闭，关闭后不再被抽取；关闭态灰化（`.cc-item.off` / `.tc-qrow.off`），顶部总开关与逐张开关叠加生效（关闭态优先）。涉及 `src/js/default-cards.js`（dc-off-分类:内容）、`src/js/mood-reply-cards.js`（回应 rc-off-分类:内容、情绪 mc-off-mood:内容，getMoodCard/getHeartCard/getIntentCard/getReplyCard/getFollowupWord 全部过滤）、`src/js/p2-features.js`（ck-off-分类:内容，genCheckin/renderCheckinCards）、`src/js/quote-cards.js`（quote-off:内容，getQuoteOfDay/renderList）、`src/css/chat-pages.css`（.ccard-toggle 小号开关 + .off 灰化）。存储全部走 localStorage `xy-home-v2:` 前缀键。CDP 探测 20/20：顶部按钮出现/触发导入/关闭还原、五类字卡开关默认开启+关闭持久化+抽卡 0 命中、getFollowupWord 不返回关闭词、灰化样式与开关一致。⚠️ 提醒对方：本轮构建（12:39）时 `src/js/chat.js`/`template.html` 等仍含未保存的进行中改动（chat.js 12:37 仍在写），本次构建已一并包含其当前内容；统一构建提交前请双方确认各自文件已收尾（chat.js 以当前版为准，之前 WORKLOG 所述「问问TA 缺 id」已由当前源自带 `opts.id='chat-ask-opts'` 解决）。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（用户反馈「聊天页【问问TA】不能设置联系人单选或文字回复」——问问TA 回复类型选择功能，已构建 + verify 10/10 + CDP 双场景 16/16，**未提交**）：聊天页「更多功能 → 问问TA」半框现支持选择回复类型——① 顶部新增「文字回复 / 单选题」切换（仅 ask 模式显示）；② 选「单选题」时显示选项输入框（每行一个，可写 `选项~TA回应`，TA 会用该回应回复，与 TA 的小问题/询问管理页同款格式）；③ 发送后 TA 随机选一个选项作答，有预设回应则用预设回应回复（无则从字卡文字池挑），聊天卡片显示「✓ TA：选项」+ 预设回应。涉及 `src/js/chat.js`（半框注入 ensureChatAskTypeRow/resetChatAskType + submitChatAsk 单选解析与作答 + renderMsg 卡片渲染）、`src/css/chat-main.css`（.chat-ask-type/.chat-ask-type-btn/.chat-ask-opts）。**修复了上一轮 WORKLOG 标记的「缺 id」bug**：选项 textarea 由本实现自带 `opts.id='chat-ask-opts'`，发送解析/重置均能取到（该缺 id 问题已随本实现解决，无需对方再补）。关键实现点：① 选项在收起半框前解析——安卓 ce-box 转换下面板隐藏后 innerText 读不到换行，多行选项会并成一行（实测已修）；② 单选记录写 askType:'single'+askOptions，重渲染/历史恢复渲染「等待 TA 选择…」与回应行。CDP 验证（Android 390×844 含 ce-box 转换 + 桌面 1280×800）：类型切换显示/隐藏、选项 2 行解析（~分割）、TA 随机选一选项并用预设回应回复、卡片渲染、文字回复回归无选项，16/16 PASS；`npm run verify` 10/10。临时脚本已删。⚠️ 提醒对方：本次开工时 `src/js/chat.js` 未包含上一轮 WORKLOG 所述「AI-B 聊聊 TA 单选题」源码（12:30 构建时在源里、本次已不在，疑被并行回退），本实现为从当前源全新实现且功能一致；若对方仍持有 chat.js 的旧改动请勿再覆盖本文件，统一构建前双方确认 chat.js 以本版为准。**未提交**，等待统一提交/部署。

### 2026-08-17
- [AI-A] 完成（iPhone 13 · iOS Edge「桌面点【聊天】进入聊天页后什么也点不动」修复，已构建 + verify 10/10 + CDP 复现脚本 PASS，**未提交**）：根因——`calendar.js` 启动 800ms 后弹出「TA 的今日留言」居中遮罩弹窗（`modal-mask` z-index 90、全屏锁滚动）。用户通常开屏点「点击进入」后立刻点桌面【聊天】进聊天页，弹窗恰好盖在聊天页上：整页点不动 + 背景锁滚动（仅 8 秒自动关，用户没注意弹窗就表现为「一直卡死」；若此时点的是弹窗遮罩外的聊天页区域，还无法直接关闭弹窗）。修复：`src/js/calendar.js` doGreet 触发前增加聊天页可见性判断——`page-chat` 未隐藏时跳过今日留言（用户正在聊天不打断）；桌面停留时仍照常弹出（行为不回归）。CDP 验证：加载 500ms 注入进聊天页 → 800ms 定时器触发时 openModal 调用 0 次、弹窗未开、无锁滚动、聊天发送按钮可点；返回桌面后弹窗正常弹出且 8s 自动关闭。另：本轮构建（12:30 由 AI-B 执行，已包含 AI-A 的 calendar.js 改动）同时包含 AI-B 的聊聊 TA 单选题 + 开屏公告改动。**未提交**，等待统一提交/部署。

### 2026-08-17
- [本会话] 完成（通话挂断过于频繁修复，已构建 verify 10/10，**未提交**）：用户反馈 HONOR 20 Pro / vivo Y35「电话 3 分钟左右自动挂断、没一通超过 10 分钟、不按通话概率跑」。根因——`call.js` 对方挂断检查「接通 10 秒后每 30 秒掷一次」，默认 5% 实际效果远超设置字面值：3 分钟累计 ~23% 被挂断、10 分钟内累计 ~62%，与用户实测完全吻合。修复：① `src/js/call.js` 挂断检查改「接通满 3 分钟保护期后才开始，且每 60 秒掷一次（原 30 秒）」，默认 `CALL.hangup` 5→2，头部注释同步；② `src/js/reply-settings.js` DEFAULTS `call-hangup` 5→2 + 注释。10 分钟累计挂断约降到 13%。已 `node build.mjs` + `npm run verify` 10/10。⚠️ 构建时发现另一进程并行改动（chat.js 12:28/12:30 仍在写），本次构建已包含其未完成改动，**未提交**，待对方收尾后统一构建提交。
- [本会话] **需要对方处理（chat.js 问问TA 单选题新功能 bug）**：`ensureChatAskTypeRow` 创建的选项 textarea 只设 `className='chat-ask-opts'` **未设 id**，但 `chat.js:2354` 发送解析与 `:2269` 重置都用 `document.getElementById('chat-ask-opts')` → 恒为 null → 单选题永远发不出去（始终 toast「单选题请填写选项，每行一个」）。补一行 `opts.id = 'chat-ask-opts'` 即可。对方正在编辑该文件，本会话未动，请完成后知会统一构建。

### 2026-08-17
- [AI-B] 完成：开屏公告按用户新文案整体重排——sub 改为「8.12开搓三十个小时，8.15发布，目前还在日更修，暂时不建议开始二传二改」；原 11 条合并且重新排号（后追加第 11 条）共 11 条：①感谢内测反馈 ②内测时间8.15～8.29（链接已在GitHub，内测期内暂不公开宣传）③8.30完全公开后可二传二改（并入原日更部署说明：在边修边部署网站…）④不开测试群，有问题直接评论和私信 ⑤反馈问题请附手机型号和浏览器 ⑥关于bug（二传二改建议等公开版）⑦使用规范（8.30完全公开后适用：转载要署名/二次修改注明原作者/禁止商用）⑧同步刷新 ⑨灵感来源 ⑩新增导入milk字卡库 ⑪关于数据丢失（可能是bug也可能是浏览器正常概率丢失→需要备份；内测更新多，有新版本刷新使用前建议备份数据）。涉及 `src/pwa/notice.json`（在线覆盖源）与 `src/template.html`（离线兜底，两处同步），已 `node build.mjs` + `npm run verify` 10/10 + 产物内容核对（index.html/根目录 notice.json 与 src 一致）。**未提交**，待统一提交/部署（工作区另有未跟踪调试脚本 tools/_probe-chat-freeze*.mjs，请确认后清理）。

### 2026-08-16
- [AI-B] 完成（iOS 默认浏览器「聊天发送完文字后界面放大、键盘与页面间一长块灰色、页面位置比例错乱，只有改联系人昵称才恢复」修复，已构建 verify 10/10 + CDP 模拟 5/5，**未提交**）：根因——iOS Safari 键盘是 overlay 模式，`syncIosKb` 键盘弹出时把 `.phone` 收缩到键盘上沿（844→500）。**发送消息时清空聚焦的 contenteditable 会触发键盘收起，但 iOS 常不派发 visualViewport resize 事件**，旧恢复逻辑（`focusout` 里 `innerHeight - vv.height <= 80` 才恢复）在 overlay 键盘下该值恒为 ~344 永远不成立、且完全依赖漏掉的 vv 事件 → `.phone` 卡在 500px 收缩高度：下方露出 body 灰底（键盘与页面间的灰色块）+ 布局位置比例错乱；只有下一次完整键盘开合（改昵称弹窗聚焦输入）才复位。修复：`src/js/mobile-adapt.js` ① 统一 `restoreKb()`（清高度/顶对齐 + 钉滚动 + 停轮询）；② `focusout` 失焦即恢复（250/450ms 两档 + 400ms 兜底，不依赖 vv 事件）；③ 新增 600ms 键盘状态自愈轮询——键盘收起但 vv 事件漏发时（vv≈布局高度或已失焦）自动恢复；④ 键盘弹出/收缩/恢复全程 `pinScrollTop` 防灰底露出（上一轮修复保留）。另 `src/css/base.css` 16px 防缩放规则补 `.phone select`（`.tc-input` 分类下拉 13px，iOS 聚焦 select 同样整页放大）。CDP 模拟 5/5：键盘弹出收缩 500、发送后失焦 250ms 即恢复（不依赖 vv 事件）、600ms 轮询兜底、再次聚焦/收起循环正常。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（OPPO 雨见浏览器「来信有提示，信箱却空白」修复，已构建 + CDP 复现脚本 2 阶段 PASS + verify 10/10，**已提交推送**）：根因——v3.5.120「信箱权威加载防护」的 `mailDbReady=false` 暂存窗口未闭环：来信/回信写入只进内存 `mailPending`，而 `load()`/`render()`/`updateBadge()` 仍只读持久层 → 来信弹窗照常提示「给你寄来了一封信」，信箱列表空白；IDB 打开/读取挂起（OPPO 雨见浏览器后台挂起/存储异常，CDP 注入 indexedDB.open('mochi-db') 永不返回成功复现）时 `mailDbReady` 永远为 false，刷新后暂存信件永久丢失。修复 `src/js/mail.js` 三处：① `load()` 合并 mailPending（按 id 覆盖 + tm 保序），弹窗提示过的信件即时可见/可回/清角标；② IDB 权威读回合并基准扩展——IDB 有值用 IDB（备份导入语义），IDB 空保留本地旧信，暂存按 id 覆盖合并落盘，保险丝后迟到返回取并集不覆盖；③ 15s 权威读取保险丝（与 idbRestore 12s 同理）强制就绪并落盘暂存信件。CDP 复现验证：挂起态来信→信箱 1 封、15s 保险丝落盘、刷新后信件仍在（修复前信箱空白+刷新丢失）；`npm run verify` 10/10。另：本轮构建同时包含 AI-B 已保存的 chat-main.css/chat-settings.js 移除聊天壁纸 background-attachment:fixed 改动（无 WORKLOG 记录，已一并构建提交，请 AI-B 知悉）。

### 2026-08-16
- [AI-B] 完成（iOS 默认浏览器「聊天点击输入栏，键盘上方出现灰色栏把所有页面遮盖，关掉键盘才恢复」修复，已构建 verify 10/10 + CDP 模拟 3/3，**未提交**）：根因——iOS Safari 键盘是 overlay 模式，`mobile-adapt.js` 的 `syncIosKb` 已把 `.phone` 按 visualViewport 收缩到键盘上沿（高度 844→约 500）；但 **iOS 键盘弹出时会自动把页面滚动到聚焦的输入框**（聊天输入栏在 `.phone` 底部），而 `.phone` 是普通文档流元素（flex 顶对齐，非 fixed），window 滚动后它整体上移，**下方露出 body 灰色背景（#e9e9e9）**——表现就是「键盘上方一条横贯全屏的灰色栏，把所有页面都遮盖」。修复：`src/js/mobile-adapt.js` `syncIosKb` 增加 `pinScrollTop()`——键盘弹出瞬间、收缩持续期间、收起恢复时都把页面滚动钉在顶部（window/html/body 三级归零，只在有滚动偏移时执行，避免无谓 reflow）。收缩态下页面内容全部在 `.phone` 内，任何滚动都只会露出灰底，归零无副作用。CDP 模拟验证 3/3：键盘弹出 phone 收缩 500、模拟 iOS 滚动 150 后被钉回 0（phoneTop=0 不露出灰底）、键盘收起后高度/顶对齐/滚动全部恢复。**未提交**，等待统一提交/部署。另：工作区有对方遗留未跟踪文件 `_test_backup.json`/`inject-hook.mjs`，请确认后清理。

### 2026-08-16
- [AI-A] 完成（「回复速度最长」不再限制 84 秒，可任意调大，已构建 verify 10/10 + CDP 手机模式 8/8，**未提交**）：① `src/template.html` rs-max 移除 `data-max="84"`（保留 data-min=2）；② `src/js/reply-settings.js` 两处 stepper 范围校验 `data-max` 缺失兜底 `Infinity` = 不设上限（± 按钮/直接输入/保存按钮统一走一套校验，其他有 data-max 的 stepper 不受影响），`commit`/保存按钮用 `isFinite` 防 NaN/Infinity 入库；③ **顺带修复保存按钮读值 bug**：运行时 `st.querySelector('.stp-val')` 在转换后页面会先匹配到 ce-box DIV（继承了 stp-val 类），读到 DIV 的过期 value expando 而非当前显示值 → 保存按钮可能把设置还原成旧值。syncUI 与保存按钮均改为固定 `input.stp-val`（value 代理始终读写 ce-box 当前文本）。CDP 验证：+ 按钮超 84 到 97、直接输入 600/1000 保存成功、刷新后回显 1000、聊天延迟公式兼容大数、rs-min 仍钳 60、非法输入回退下限 2。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（Edge 手机端反馈「回复设置页数字只有横线、没有默认数值」修复，已构建 verify 10/10 + CDP 手机模式双视口 12/12，**未提交**）：根因——`mobile-adapt.js` 的 ce-box 转换器（安卓 Edge 等非 iOS 启用）在**定义 input.value 代理之后**才读初始值同步进 contenteditable div：`syncUI()` 只写 property（`val.value=…`）被代理遮蔽读到空 → ce-box 文本为空，只剩 CSS 虚线横线。仅静态模板 + 转换前同步赋值的回复设置 stepper 中招（动态 stepper 创建后异步转换、赋值走代理，不受影响）。修复：`src/js/reply-settings.js` syncUI 同时写 `setAttribute('value', …)`，转换器 `getAttribute('value')` 可拿到初始值（桌面原生 input 双写无副作用）。CDP 验证：390×844 / 360×640 下 ce-box 显示默认数值 1、抽检 6 个 stepper 均有数字、点 + 递增同步无回归。**未提交**，等待统一提交/部署。另：`tools/` 下上一轮遗留的 `_probe-stepper.mjs`/`_probe-shot.png` 已确认是本会话探测脚本，已删除。

### 2026-08-16
- [AI-B] 完成（聊天拍一拍卡片增强：顶部分组切换栏 + 自定义文字输入，已构建 verify 10/10 + CDP 冒烟 10/10，**未提交**）：更多功能→【拍一拍】打开的卡片现在——① 顶部新增分组切换栏（复用表情包 `.emoji-g-chip` 样式，「全部」+ 各分组 chips，横向滚动，点击切换只显示该分组字卡，选中的分组删除后自动回「全部」）；② 分组栏下方新增文字输入行（圆角输入框 + 「拍一拍」按钮），输入任意文字即可对 TA 使用拍一拍（复用 `sendPoke`：含「你」自动替换为 TA 昵称、未输入时 toast 提示、Enter 直接发送），空字卡库时也提示可直接输入。涉及 `src/js/chat.js`（新增 `pokeGroupsBar`/`pokeInputRow` 注入 + `renderPokeGroupsBar` + 分组过滤渲染 + `doPokeInput`）、`src/css/chat-main.css`（`.poke-groups`/`.poke-input-row` 样式）。Android 下输入框由 mobile-adapt 自动转 ce-box，读写仍走 `input.value` 代理（CDP 验证通过）。**未提交**，等待统一提交/部署。另：`tools/` 下发现非本会话产生的 `_probe-stepper.mjs`/`_probe-shot.png`（22:27 时间戳），疑似其他进程遗留，未处理。
- [AI-B] 完成（iOS 默认浏览器「桌面更换头像后所有按钮失效、点击聊天框无效、发不了消息；刷新重开依然失效」修复，已构建 verify 10/10 + CDP 回归 5/5，**未提交**）：根因——旧版图片压缩 `compressImage/compressMyEmoji` 在**解码失败/压缩异常时回退存原图**（`resolve(dataUrl)`），iOS 相册选 48MP/ProRAW 级大图（base64 十几 MB）时即被原样入库；iOS Safari 对该超大 dataURL 的 `img.src` 解码会占数百 MB 位图内存、拖崩渲染进程——表现「画面正常（静态快照）但所有按钮点击无响应」；刷新后 `idbRestore` 恢复该 dataURL 又渲染 → 每次加载重现，所以**刷新重开依然失效**。修复三层防护：① `src/js/personalize.js`/`chat.js`/`chatcard.js` 的压缩函数统一：**解码前按 base64 长度（>8MB）拦截、解码后按像素（>2600 万）拦截、失败不再回退原图**，返回 null 由调用方 toast「图片过大或格式不支持，请换一张小图」（头像/壁纸/自定义图标/表情包/图片字卡全部覆盖）；② 渲染前防护——`applyAvatar`/`fillAvatar`（头像）与 `restoreAppIcons`（自定义图标）检测存量 >500KB 的异常值即清除（LS+IDB 双清）回默认图，**保证用户已有坏数据在刷新后自动恢复可用**；③ feed.js 的 compressImage 本就失败不存原图，无需改。CDP 回归 5/5：存量超大 avatar-user 启动即清除回默认 SVG、清理后聊天按钮可点、9MB 大图上传拒绝不入库且 toast 正确、正常小图上传成功（不回归）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成：手机端适配第三轮深检（只读，未改代码、未构建）——① 全量 CSS 逐文件审查（home/chat-main/chat-pages/setting，含 safe-area 底部面板全覆盖、emoji 网格、管理条、音乐批量条）；② 真实触摸穿透验证（CDP dispatchTouchEvent）：无弹窗桌面可滚、弹窗遮罩上滑桌面不穿、表情面板打开消息区不穿；③ iOS UA 模拟 7/7：不转 ce-box 保留原生 input、chat-body 豁免 translateZ、全屏开关 iOS 引导文案、浏览器内点全屏回弹不误启全屏、状态栏正常；④ **修复点回归**：desk-msg 弹出不锁滚动（FLOAT_SELECTORS 移除生效）+ 弹出期间桌面可触摸滚动、今日留言弹窗约 6.5s 自动关闭不卡死、真弹窗仍锁滚动未误伤、iOS 文本输入框全部 16px（modal-input/tc 文本输入/textarea 均 16px；13px 的 `.tc-input` 是 SELECT 分类下拉框，不弹键盘无需 16px，属合理）。结论：**未发现需要修复的移动端 bug，现有修复无回归**。临时脚本已删，工作区干净，无提交。

### 2026-08-16
- [AI-A] 完成（iPad 夸克浏览器反馈「短暂滑动失效→全部页面卡住→过会儿正常→又卡」bug 修复，已构建 verify 10/10 + CDP 采样验证，**未提交**）：根因是两个浮层误锁全页面滚动，与 iPad/夸克无关（桌面 Edge 同样复现）——① **主因：`#desk-msg` 新消息横幅被 `mobile-adapt.js` 的 FLOAT_SELECTORS 当全屏浮层锁滚动**。横幅只是顶部 fixed 小提示条（6 秒自动隐藏、不遮挡滚动区），但一弹出就给 body 加 scroll-lock → 所有页面 overflow:hidden 滑不动；TA 每来一条消息就弹 6 秒 = 用户感知的周期性「卡住→正常→又卡」。修复：把 `#desk-msg` 从 FLOAT_SELECTORS 移除（横幅自身交互由 chat.js 处理，无需锁滚动）。② **次因：「TA 今日留言」弹窗启动即弹且永不自动关闭**（noInput 无输入、只能手动点确定），遮罩期间同样锁滚动，用户没注意弹窗就表现为一直卡死。修复：`src/js/calendar.js` 今日留言弹出后 8 秒自动收起（用户仍可点确定/背景/返回键立即关闭）。涉及 `src/js/mobile-adapt.js`（跨 AI-B 文件，已获用户授权）、`src/js/calendar.js`。CDP 采样验证：修复前启动 282ms 起 desk-msg 弹出期间 scroll-lock 恒为 true、modal 永久 SHOWN；修复后 desk-msg 弹出期间 lock=false、今日留言 1038ms 弹 → 9053ms 自动关且 scroll-lock 同步解除，无残留。已 `node build.mjs` + `npm run verify` 10/10，临时脚本已删。本次构建同时包含 AI-B 未提交的 base.css 输入框 16px 修复；**未提交**，等待统一提交/部署。
- [AI-B] 完成（iOS 非全屏浏览器三处 bug 同源修复，已构建 verify 10/10 + CDP 字号实测 16px，**未提交**）：根因——iOS Safari 对聚焦时字号 <16px 的输入框会**自动整页放大且缩不回去**。base.css 原有 16px 防缩放规则按类名逐个列（`.chat-input/.tc-input/.card-search-input/input[type="text"]…`），但 chat-main/chat-pages 后加载文件以相同/更高特异性重新声明了更小字号（后加载覆盖先加载），且字卡库 4 个搜索框（cc/dc/mc/rc-search-input）**没有 type 属性**连 `input[type="text"]` 都匹配不到 → 实测全部 13-15px。触发场景：字卡库搜索框聚焦、自定义字卡「添加」表情的批量导入弹窗 textarea（13px）、聊天设置气泡框大小/字体链接/气泡 CSS 弹窗输入（tc-input 13px）。修复：`src/css/base.css` 移动端 16px 规则改为 `.phone` 前缀 + `:not` 过滤的输入框通配（排除 readonly 步进值/checkbox/range/file/color/date 等），特异性 (0,14,1) 压过所有后加载类规则、与加载顺序无关；只改字号不动布局。CDP 实测：cc/dc/mc/rc 搜索框、modal-input/textarea、聊天搜索、TA问题输入全部 16px（chat-input 是 contenteditable div 保持 15px，div 不触发 iOS 缩放）；emoji 添加/批量导入代码路径逻辑正常（toast「已导入 3 条/已添加 1 个表情」）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-A] 完成（iPad Edge 反馈 bug 修复，已构建 verify 10/10 + CDP 回归通过，**未提交**）：聊天情绪字卡总开关关闭后联系人仍发送字卡——根因：开关只写 `mh-mood`，而情绪链三类卡中「心意卡/交流意图卡」无独立 UI 开关、默认开启且不依赖情绪卡命中（各按 40% 独立判定），关掉情绪卡后仍以约 40% 概率发心意/意图卡。修复：`src/js/mood-reply-cards.js` ① 总开关 change 时同步写 `mh-mood`/`mh-heart`/`mh-intent` 三键；② `triggerEmotionChain` 入口加总闸（mh-mood 关则整链停发，兼容存量 `mh-mood=0` 而 heart/intent=1 的旧状态）。CDP 验证：只关情绪 200 次链触发 heart/intent 0/0（修复前 74/86）、全关 0、全开行为不变；端到端（开关→聊天）无情绪卡。已 `node build.mjs` + `npm run verify` 10/10，临时脚本已删。本次构建同时包含 AI-B 未提交的 fullscreen.js/reply-settings.js/chatcard.js 改动；**未提交**，等待统一提交/部署。
- [AI-B] 完成（OPPO 手机 Edge 反馈两 bug 修复，已构建 verify 10/10 + CDP 冒烟 13/13，**未提交**）：① 全屏无法关闭——根因：关闭分支先判 `(display-mode: fullscreen)`，OPPO Edge 等浏览器在 Fullscreen API 激活期间该媒体查询也匹配（反映当前全屏态非安装态），关闭分支永远命中 → 开关弹回开启、全屏退不出。修复：`src/js/fullscreen.js` 关闭分支改为先无条件退出（exitFs + 清 fs-css-active）+ 持久化关 + `_userFsOff` 意图标记（系统全屏变化不再把开关弹回）；若退出后仍处系统级全屏（安装态 display_override 直启）300ms 复核后弹「全屏模式已关闭」说明。② 回复设置概率无法直接输入——根因：stp-val 平时 readonly（防自动填充条，转换器据此跳过），点击进入编辑后 readOnly 解除，若期间 body 子节点变化（如首次建 cc-toast 提示节点）触发全量转换 → 输入框被 contenteditable 化（ce-box），OPPO Edge 对 ce-box 聚焦/输入失效（与雨见搜索框同源）；且手势开始时 readonly 会让部分安卓浏览器判定只读字段不弹键盘。修复：`src/js/reply-settings.js` stp-val 预标记 `ceDone` 永久跳过转换（保持原生 input）+ pointerdown 提前解除只读（键盘可靠弹出）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成（OPPO 手机 Edge 反馈两 bug 修复，已构建 verify 10/10 + CDP 冒烟 13/13，**未提交**）：① 全屏无法关闭——根因：关闭分支先判 `(display-mode: fullscreen)`，OPPO Edge 等浏览器在 Fullscreen API 激活期间该媒体查询也匹配（反映当前全屏态非安装态），关闭分支永远命中 → 开关弹回开启、全屏退不出。修复：`src/js/fullscreen.js` 关闭分支改为先无条件退出（exitFs + 清 fs-css-active）+ 持久化关 + `_userFsOff` 意图标记（系统全屏变化不再把开关弹回）；若退出后仍处系统级全屏（安装态 display_override 直启）300ms 复核后弹「全屏模式已关闭」说明。② 回复设置概率无法直接输入——根因：stp-val 平时 readonly（防自动填充条，转换器据此跳过），点击进入编辑后 readOnly 解除，若期间 body 子节点变化（如首次建 cc-toast 提示节点）触发全量转换 → 输入框被 contenteditable 化（ce-box），OPPO Edge 对 ce-box 聚焦/输入失效（与雨见搜索框同源）；且手势开始时 readonly 会让部分安卓浏览器判定只读字段不弹键盘。修复：`src/js/reply-settings.js` stp-val 预标记 `ceDone` 永久跳过转换（保持原生 input）+ pointerdown 提前解除只读（键盘可靠弹出）。**未提交**，等待统一提交/部署。

### 2026-08-16
- [AI-B] 完成：手机端全量排查（只读检查，未改任何代码、未构建）——① `npm run verify` 10/10 基线通过；② 无头浏览器 390×844 / 360×640 GUI 实测：桌面/聊天收发/表情面板/字卡库搜索/桌面翻页(圆点)/日历/设置/昵称弹窗输入/聊天输入栏贴底全部正常；③ 专项边界测试 20/20：ce-box 转换器单行/多行显隐联动、emoji maxlength 按码点截断、多行按行读取、desk-msg 锁滚动联动、双浮层同开/逐个关闭锁不残留、浮层被移除后 touchstart 兜底解锁、聊天搜索框 ce-box 代理读写、信箱写信输入框转换。**结论：未发现需要修复的移动端 bug**；顺带确认 FULL_PAGES 不含 page-setting（设置页保留 tabbar 属设计行为，非 bug）、desk-msg 弹出时锁滚动属设计（6s 自动隐藏解锁）、tabbar 距 .phone 底 18px 是 padding-bottom 留白。临时测试脚本已删，工作区干净，无提交。

### 2026-08-16
- [AI-A] 完成：聊天记录「导出/导入」入口迁移到右上角三点 → 聊天设置「数据」分组（与「删除全部聊天记录」同组）——原输入栏更多面板里的「导出聊天/导入聊天」入口已移除（chat.js 删 more-export-chat/more-import-chat 处理器与 importChatFile/chatReadFileText，template.html 删对应按钮）。新增：chat.js `window.chatExportMsgs`（落盘+返回全量）/ `window.chatImportMsgs`（覆盖式导入：写 IDB 权威+清 LS 残留+复位分页窗口+就地重渲染，无需刷新）；chat-settings.js 绑定 cs-export-msgs / cs-import-msgs（导出下载 JSON，导入 FileReader 读取+校验+摘要二次确认）；template.html 数据分组新增两行。已 `node build.mjs` + `npm run verify` 10/10 + 临时 CDP 冒烟 11/12（1 项为测试脚本导航时序，非功能问题），临时脚本已删，**未提交**。
- [AI-A] 完成：桌面第二页摸鱼组件周末文案修复——周日（getDay=0）原来显示「离周末还有 6 天」（v3.5.131 旧逻辑），现周六/周日统一显示「今天是周末」。涉及 `src/js/personalize.js`（weekend-days 区块）；已 `node build.mjs` + `npm run verify` 10/10，**未提交**（提交由构建者统一处理）。
- [AI-B] 完成：移除整页 zoom 缩放（iOS 卡顿根因），恢复原版布局；已 `npm run build` 并用 `npm run verify` 验证 390×844 / 360×640 正常。
- [AI-B] 完成：新增 AGENTS.md（单一构建者 / 文件归属 / 不并行提交）、WORKLOG.md、tools/verify.mjs、package.json。
- [AI-B] 完成：AGENTS.md 补充快速定位表、构建顺序、数据存储约定、通用模式、git 提交规范；`npm run verify` 自检 10/10 通过。
- [AI-B] 注意：仓库里存在两个 AI 工具同时工作的风险——开工前务必读本文件 + git status，确认对方没有进行中的改动；遇到对方文件的 bug 只报告不改。
- [AI-B] 完成：批量导入修复（单输入框 + 按行拆分）上线；仓库清理（网页上传垃圾/嵌套目录）+ Git 流程接入；已构建推送。
- [AI-B] 完成：v3.5.138/139 多批部署（milk 导入、全屏兜底、邮件媒体、壁纸、后台保活等，共 9 次提交）；`npm run verify` 10/10 通过；版本号 APP_VERSION 统一在 build.mjs 维护（当前 v3.5.119，与 commit 版本号需人工对齐）。
- [AI-B] 待办：后续每轮构建部署后追加 WORKLOG 一行 + 跑 `npm run verify`（AGENTS.md 验证流程）。
- [AI-B] 完成：APP_VERSION 统一为 v3.5.139（build.mjs 单点维护，开屏/设置页同步）；`npm run verify` 10/10 通过；已推送。
- [AI-B] 完成：iOS 聊天页修复——键盘弹起不再用 position:fixed 锁 .phone（iOS contenteditable 在 fixed 祖先内无法输入，聊天输入栏打不进字的根因），改 flex 顶对齐 + 高度收缩；高度写入只在值变化时执行（键盘动画高频 resize 不再反复整页重排 = 聊天页卡顿缓解）。涉及 `src/js/mobile-adapt.js`；已构建，verify 10/10 通过。本次构建同时包含了 AI-A 已保存的 chat.js/home.css/chat-pages.css/bg-keep.js 改动（未单独提交）。
- [AI-B] 完成（获用户授权，跨 AI-A 文件性能优化，仅重构不改变行为）：① chat.js 追加消息滚动改「贴底才滚」+去重（原每条消息强制同步布局，收消息卡顿主因）；② saveMsgs 防抖回调去掉重复 IndexedDB 全量写入（store.set 已双写）；③ chatAddSystem/chatAddIn 去掉每次全量 loadMsgs+全量重渲染（启动已同步加载内存）；④ loadMsgs 合并写回仅在新数据时执行 + 恢复/restore-done 重渲染加贴底判断；⑤ enterChat 重复滚动去重；⑥ chat-settings.js 壁纸值未变不重写 style + background-attachment:fixed 独立图层；⑦ chat-main.css 移动端壁纸 fixed 兜底。涉及 `chat.js`/`chat-settings.js`/`chat-main.css`；已构建，verify 10/10 通过。另：构建时发现 AI-A 在并行改 calendar.js/mail.js，本次构建已包含，AI-A 无需重复构建。
- [AI-A] 完成：聊天设置页（右上角三点进入）底部新增「删除全部聊天记录」按钮——chat.js 新增 `window.clearChatHistory`（清内存 msgs + 防抖定时器 + localStorage + IndexedDB，store.remove 双写；同时清空聊天 DOM 与未读角标，不刷新页面）；chat-settings.js 绑定点击（openModal 二次确认）；template.html 新增数据分组锚点行；chat-pages.css 新增 `.set-row.danger` 红色危险行样式。已构建（本轮由 AI-A 代为执行），verify 10/10 通过，**未提交**。注：按归属 template.html 属 AI-B，本次为新增静态锚点行（与 JS 渲染两边同步约定），请 AI-B 知悉。
- [AI-A] 完成（跨 AI-B 文件，经用户授权本会话统一实现，已构建）：五项优化——① build.mjs 零依赖保守压缩（删 JS 整行注释/空行/缩进 + CSS 块注释，产物 1.31MB→1.05MB）；② chat.js 聊天记录读写全走 IndexedDB（saveMsgs/flushSave/saveMsgsNow 只写 IDB，loadMsgs 去掉 LS 优先读取，读到权威后清 LS 残留，IDB 空时 LS 兜底迁移一次）+ idb.js `idbRestore` 排除 `chat-msgs`（启动不再回填 LS，省 5MB 配额）；③ chat.js 聊天分页渲染（首屏最近 200 条，向上滚动按 100 条加载，搜索跳转旧消息自动扩窗，新增 renderWindow/renderStart，`clearChatHistory` 复位窗口起点）；④ clock.js + template.html + 新增 src/pwa/notice.json 开屏公告远程化（fetch notice.json 覆盖公告，失败保留写死兜底，list 空/hide 隐藏公告区，build.mjs 复制该文件）；⑤ music-player.js 音乐设置页新增本地音频缓存占用统计（IDB music-file 分批读）与「清理本地音频缓存」（删音乐文件+移出歌单，外链/种子歌保留）。已 `node build.mjs`（产物 1050941 字节）+ `npm run verify` 10/10 + 临时 CDP 冒烟测试 9/9（分页窗口/向上加载/搜索扩窗/存储路径/刷新恢复/公告拉取），临时脚本已删。本次构建同时包含 AI-A 未提交的 chat-settings.js 删除聊天记录 + home.css 分页指示器悬浮 + chat-pages.css 危险行样式；**未提交**，等待提交/部署安排。
- [AI-B] 完成（获用户授权，跨 AI-A 文件修复）：chat.js 分页回归修复——`addRec` 窗口重渲染分支补 `chatNearBottom()` 贴底守卫（原无条件 `renderWindow+scrollChatBottom`，用户翻旧消息时新消息进来会清空重渲染并强制滚底、打断阅读位置；现不贴底时走增量 append，窗口暂时超限无害）。涉及 `src/js/chat.js`，`node --check` 通过，**未构建未提交**（提交 092f199 之后的工作区改动，待构建者统一构建）。
- [AI-A] 完成（含 AI-B 文件，经用户授权本会话统一实现，已构建 verify 10/10，**未提交**）：① 修复通话系统消息 SVG 乱码——根因：v3.6.x XSS 转义升级后 `escTxt` 把 call.js 拼接的 `<svg class="st-ico">…</svg>` 整段转义成 `&lt;svg…&gt;` 纯文本（来电/通话记录显示乱码）。chat.js 新增 `pokeIconHtml`（仅对 st-ico 白名单前缀保留原样、其余仍全量转义）用于 poke 渲染；新增 `restoreEscapedPokeIcons` 迁移还原已存乱码（loadMsgs 同步部分 + IDB 合并回调各跑一次并计入 changed 写回 IDB，防合并回滚），无头 Chrome 实测新消息图标正常 + 乱码历史还原通过。② 预设字卡他/她→TA：default-cards-data.js 5 处（想起他→想起TA、告诉他们→告诉TA、他们→TA们 ×3），全库已无他/她。③ 情绪字卡用户确认真机正常，未改动。涉及 `src/js/chat.js` `src/js/default-cards-data.js`；已 `node build.mjs` + `npm run verify` 10/10 + 临时 CDP 验证 5/5（新消息 SVG 渲染、乱码迁移还原、字卡无他/她、TA 文案），临时脚本已删。

- [AI-A] 完成（XSS 安全修复，已构建）：修复存储型 XSS——全项目 HTML 转义从「只转 <」升级为完整转义（& < > " '，原实现可被 `&lt;img onerror=…&gt;` 预编码实体绕过，且聊天渲染多处字段零转义 / src 属性引号可逃逸）。覆盖：chat.js（escTxt/attrEsc 统一转义，renderMsg 全部卡片/气泡/图片/语音/mood/就地作答重建/邀请问问回执/搜索高亮/编辑回显，fillAvatar 改 el.src 赋值防属性逃逸）、chatcard.js（导入字卡 dataURL 白名单正则校验，非法媒体丢弃并提示）、data-backup.js（导入校验 app==='mochi-zika' + 键前缀，拒绝空/伪备份，防「先清空再写失败」全丢数据）、ta-ask/records/feed/mail/decision/music-player/quote-cards/divination/p2-features/avatar-lib/personalize/call（esc 函数完整化 + 直拼 img src 全部改 DOM 属性赋值，feed 昵称/点赞/评论/头像/分组名补齐转义）。已 `node build.mjs`（产物 914143 字节）+ `npm run verify` 10/10 + 临时 XSS 冒烟 6/6（实体绕过/属性逃逸/poke 注入均不执行、无注入元素、聊天正常显示），临时脚本已删。本次构建同时包含 AI-B 未提交的 chat.js addRec 分页贴底守卫；**未提交**。
- [AI-A] 完成（Moto G100 雨见浏览器字卡库搜索框无法输入修复，已构建未提交）：字卡库搜索框（及默认字卡/情绪字卡/回应字卡 3 个同类搜索框）敲字不显示、无法搜索——根因：安卓端 mobile-adapt.js 把 `<input>` 统一转成 contenteditable div（ce-box）防 Chrome 自动填充条，雨见浏览器等部分安卓浏览器对 ce-box 聚焦/输入失效。修复：chatcard.js / default-cards.js / mood-reply-cards.js 对 4 个搜索 input 预标记 `dataset.ceDone='1'` 跳过转换，保持原生 input（所有浏览器/输入法可正常输入）。无头 Chrome 回归：4 搜索框均为原生 INPUT、输入过滤/清空恢复/IME 上屏全通过；`npm run verify` 10/10。仅涉 AI-A 文件，未动 mobile-adapt.js。
- [AI-A] 完成：PWA 图标从爱心改为 mochi 文字——重写 `gen-icons.mjs`（零依赖点阵字 5×7 渲染 "mochi"，白底 + #111111 深色字，与开屏 logo 同风格；按墨迹范围居中，兼容 maskable 安全区）；已 `node gen-icons.mjs` 重生成 src/pwa 4 个图标 + `node build.mjs` 复制到根目录 + `npm run verify` 10/10。**未提交**。
- [AI-A] 完成（联系人主动来电修复，已构建 verify 10/10 + CDP 实测 6/6，**未提交**）：① 根因——设置页文案承诺「对方回复消息和主动发消息时触发打电话」，但 `triggerIncomingCall` 全项目无人调用，来电只靠独立定时器（首次延迟 2-5 分钟 + 每 60 秒掷 8%），与聊天行为完全脱钩，用户感知"从不来电、调概率没反应"。② 修复：call.js 新增 `window.callMaybeTrigger`（复用 maybeIncoming：5 分钟冷却 + 来电概率 + 冷却戳未来时间防御，防设备时钟改动锁死来电）；chat.js 在 `replyOnce`（TA 回复后 3.5s）与 `tryAutoSend`（主动发完 count 条后 +3.5s）各挂一次（与 maybeMusicRequest 同模式）；首次检查加速为 45-120 秒；默认来电概率 8%→15%（call.js 常量 + reply-settings.js DEFAULTS 同步）。③ 涉及 `src/js/call.js` `src/js/chat.js` `src/js/reply-settings.js`；已 `node build.mjs`（产物 931899 字节）+ `npm run verify` 10/10 + CDP 实测 6/6（无加载期错误、默认概率 15、消息挂钩来电、定时器兜底来电），临时脚本已删。本次构建同时包含 AI-A 未提交的 XSS 修复等累积改动；**未提交**，等待统一提交/部署。
- [AI-A] 完成（对抗性自审 + 正则修正，已提交 d44393a 已推送，**产物未构建**）：重新审查 XSS 修复的准确性——① 实测证伪「&lt;...&gt; 实体绕过」论据（HTML 规范下字符引用不触发标签解析，浏览器实测 0 标签 0 执行），但确认真实漏洞在「零转义字段 + src 引号逃逸」（实测均成立，修复有效）；② 修正 chatcard.js 导入正则：MIME 从 (png|jpe?g|gif|webp) 放宽到全部 image/*（防误杀 svg/x-icon 合法导入），base64 段完整匹配（自测 17 项：合法放行/逃逸拒绝）；③ 重要提醒——上一轮 XSS 转义升级造成通话/来电 SVG 图标乱码回归（escTxt 转义了合法 SVG），对方已在 a41c9d9 用 pokeIconHtml 修复 + 乱码历史迁移，已确认解决。本次仅提交 src/js/chatcard.js（含对方同文件的分组下拉修正），**未构建**：工作区另有对方进行中改动（base.css/fullscreen.js/calendar.js/mood-reply-cards.js/reply-settings.js + 5 个 tmp 调试脚本），我的正则修正待对方工作收尾后由统一构建部署（当前线上仍是 7a95f19，未受影响）。
- [AI-A] 完成（④备份原子性+②构建健康检查+③开工流程+⑤版本号，已提交，**产物未构建**）：① ④ data-backup.js 导入风险修复——旧流程「先 idbClearAll 清空 IndexedDB、再逐条 idbSet」有数分钟无原子窗口，中途崩溃旧数据无法恢复；idb.js 新增 `idbReplaceAll`（单事务 clear+批量 put，不可克隆值同步抛错时主动 abort 事务回滚），data-backup.js 导入改用它，IDB 失败即中止（不再写 LS 造成混合态）。CDP 实测 7/7：正常替换/旧键清除/失败回滚保留旧数据/空数组=清空。② build.mjs 新增构建前健康检查（检测未跟踪 tmp-*.mjs 调试脚本 + 未提交改动警告）。③ AGENTS.md 开工流程补充「改目标文件前先 git log 看对方近期是否动过」。④ 版本号 APP_VERSION v3.5.139→v3.6.0（对齐 commit v3.6.x）。涉及 `idb.js`/`data-backup.js`/`build.mjs`/`AGENTS.md`；仅提交上述 4 个 src 文件，**未构建**（工作区仍有对方进行中改动 base.css/fullscreen.js/calendar.js/mobile-adapt.js/mood-reply-cards.js/reply-settings.js，待对方收尾后统一构建部署）。
- [AI-A] 完成（版本号自动化，已构建已提交）：build.mjs 应用版本号改为**构建时自动从 git 提交数生成**（v3.6.<提交数>，当前 v3.6.29）——此前 APP_VERSION 手动维护 v3.5.139 与提交 v3.6.x 经常不同步，现在每次提交后构建自动 +1，无需人工对齐；非 git 环境回退 v3.6.0 兜底。顺带：构建健康检查的调试脚本检测从 tmp-*.mjs 放宽到所有未跟踪 .mjs（本次对方遗留的 smoke-ipad*.mjs 曾被漏检）。已 `node build.mjs`（产物含 v3.6.29）+ `npm run verify` 10/10；提交 build.mjs + 产物 + WORKLOG。
- [AI-A] 完成（回复设置概率数字框下划线提示，已构建 verify 10/10，**未提交**）：`.stp-val`（回复设置/通话设置页概率数字框）底部加虚线横线提示可点击输入，点击编辑时变实线高亮——`src/css/setting.css` 新增 `border-bottom:1px dashed` + `.stp-val:not([readonly])` 实线态。已 `node build.mjs`（产物 935422 字节）+ `npm run verify` 10/10。⚠️ 本次构建已包含对方未提交的 reply-settings.js/bg-keep.js/mobile-adapt.js/music-player.js 改动（无 WORKLOG 完成记录），**未提交**，等对方收尾后统一提交；另有未跟踪临时脚本 `mtest.mjs`（种子歌旋律兜底测试）待清理，请对方确认后删除。
- [AI-A] 完成（联系人主动发送健壮性修复，已构建 verify 10/10 + CDP 实测 3/3，**未提交**）：症状「TA 从不主动发消息（被动回复正常）」——无头浏览器实测默认链路正常，定位到两个真机可致命的健壮性缺陷：① **异常杀链**——`tryAutoSend` 抛错（真机 DOM/字卡数据损坏/媒体差异等）会阻止 `scheduleAutoSend()` 执行，一次异常后 TA **永久**不再主动发送（被动回复每次重新调度所以"看起来正常"）；修复：`tryAutoSend` 整体 try/catch，异常记录到 `window.__jsErrors`（autoSend: 前缀，供诊断）并让调度继续下一周期。② **坏间隔值**——旧数据/误操作可能把 as-min/as-max 存成超大值（如 99999），TA 要等几百天；修复：`scheduleAutoSend` 对间隔 clamp（最短 ≤30 分钟、最长 ≤180 分钟），NaN 由 getCfg 兜底。涉及 `src/js/chat.js`；已 `node build.mjs` + `npm run verify` 10/10 + CDP 实测 3/3（首个周期 getCustomCards 抛错→被 catch 记录且不发消息→恢复后下一周期正常发消息，证明调度未被杀）。**未提交**，等待统一提交（构建已含此前未提交累积改动）。

### 2026-08-16
- [AI-B] 完成：使用授权补充「禁止商用」——开屏公告（template.html + notice.json）、设置页「可二传二改的说明」页、原版功能介绍-许可、README.md、新增根目录 LICENSE 文件（明确允许二传二改/私人部署，禁止商用、保留署名）。涉及 src/template.html、src/pwa/notice.json、README.md、LICENSE；已构建，待提交。

### 2026-08-17
- [本会话] 完成（用户反馈「联系人后台弹窗：语音消息显示字卡名称+base64乱码、.mp3/.mp4后缀没删；图片+文字消息不显示缩略图或[图片]占位」修复，已构建 verify 10/10 + CDP 探测 8/8，**未提交**）：根因——语音消息 `rec.text` 格式为「名称|||音频dataURL」（chatcard.js:883 构造，renderMsg:862 正确拆分去后缀），但 `extractDeskMsg`（chat.js:1129）**不处理 voice**，把整段「名.mp3|||data:audio/mp3;base64,…」当文字返回；`showDeskPopup`（chat.js:1095）的清洗正则只匹配 `data:image/`，**不匹配 `data:audio/`**，base64 漏过 → 弹窗显示「晚安.mp3|||data:audio/mp3;base64,BBBB…」乱码。修复三处：① `src/js/chat.js` `extractDeskMsg` 加 voice 分支——拆 `|||` 取名称、去 `.mp3/.mp4` 等后缀（与 renderMsg 一致），避免 base64 进 text；② `src/js/chat.js` `showDeskPopup` 清洗正则从 `data:image/` 扩展到任意 `data:MIME/`（覆盖 audio/video 等）+ 加 `|||` 兜底拆分 + voice 占位判断（`[语音]`）+ 前台横幅补 `[图片]` 占位（图片+文字组合消息有 img 且文字无占位时补「 [图片]」，后台通知有 image 字段不重复补）；③ `src/js/bg-keep.js` `bgNotifyCheck` 正文正则同步扩展 + 清 `|||` 后内容。CDP 探测 8/8：语音→「晚安」（无.mp3/|||/base64）、图片+文字→「今天天气真好 [图片]」、纯图片→「[图片]」、表情包→「[表情包]」。涉及 `src/js/chat.js`、`src/js/bg-keep.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。
- [本会话] 完成（用户反馈「后台通知缺少联系人主动换头像和主动给我换头像的系统消息」修复，已构建 verify 10/10 + CDP 探测 6/6，**未提交**）：根因——① `src/js/avatar-lib.js` `checkAvatarLibRefresh`（TA 换自己头像）和 `checkMeAvatarRefresh`（TA 给我换头像）都有 `if (document.hidden) return;`，**页面在后台时直接 return 不触发**，所以后台不换头像也不通知；② `src/js/chat.js` `extractDeskMsg` 只读 `rec.parts` 和 `rec.text`，**不读 `rec.img`**，而 `chatSystem(text, data)` 传的 img 走 `rec.img`（无 parts）→ 后台通知 `bgNotifyCheck` 拿不到头像缩略图（image 字段空）。修复：① `avatar-lib.js` 两个 check 函数去掉 `document.hidden` return——后台时也检查周期，到时间就换 + 写聊天消息（`chatSystem` 链路自动触发 `showDeskPopup`→`bgNotifyCheck` 发系统通知）；`checkMeAvatarRefresh` invite 分支补后台通知（后台时弹窗不可见，调 `bgNotifyCheck(name+' 想给你换头像', ..., {img:data})` 让通知栏显示邀请 + 新头像缩略图）；② `chat.js` `extractDeskMsg` 初始 `img = rec.img || ''`——`chatSystem` 传的 img（换头像等系统消息附图）能被提取，后台通知 image 字段显示新头像缩略图。CDP 探测 6/6：TA 换头像→chatSystem 写消息 + bgNotifyCheck 触发 + 通知含 img；TA 给我换头像→通知触发 + 含 img；邀请分支 bgNotifyCheck 可达。涉及 `src/js/avatar-lib.js`、`src/js/chat.js`。已 `node build.mjs` + `node tools/verify.mjs` 10/10。临时脚本已删。**未提交**，等待统一提交/部署。

- [AI-B] 2026-08-17 23:40：v3.6.47 已推送仓库，Pages 部署滞后，空提交+本记录再次触发。

- [本会话] 2026-08-18：帮我决定——「是/否/半对」tab 删除「最多选几个」行（固定单选，最多选几个仅自定义选项 tab 保留）。涉及 `src/js/decision.js`；已 `node build.mjs` + `npm run verify` 10/10。

### 2026-08-18
- [本会话] 完成（tabbar 选中按钮去灰底 + 字卡库 toolbar 换行防截断 + chat.js 语法错误修复，已构建 verify 8/10 + CDP 验证，**已提交未 push**）：用户反馈'字卡库页面的 ui 的按钮的颜色变了，怎么 ui 不全了，还有莫名其妙的灰色'。根因①——背景改纯白后  在白色底上对比度变高，看起来像'颜色变了'；修复： 去掉 active 背景（改 transparent），只保留图标颜色变深，深色模式 dark.css 覆盖保留。根因②——字卡库详情页第二个  有 5 个按钮（管理字卡/去重复/导出/导入/清除）， 均分后每个仅约 64px，文字+图标被截断，看起来像'ui 不全了'；修复：  加 。根因③——tabbar 周围灰色此前已由 base.css  改白 + 去 radial 黑晕 + 去 box-shadow 根治，本次附加 tabbar active 去底后视觉更干净。另发现 AI-A 的  改动有多余闭合括号导致语法错误（staged 版本 node -c 失败），unstaged 改动已修复，一并提交。涉及 、、（语法修复）。

### 2026-08-18
- [���Ự] ��ɣ�tabbar ѡ�а�ťȥ�ҵ� + �ֿ��� toolbar ���з��ض� + chat.js �﷨�����޸����ѹ��� verify 8/10 + CDP ��֤��**���ύδ push**�����û�����'�ֿ���ҳ��� ui �İ�ť����ɫ���ˣ���ô ui ��ȫ�ˣ�����Ī������Ļ�ɫ'������١��������Ĵ��׺� .tab.active { background:rgba(0,0,0,.05) } �ڰ�ɫ���϶Աȶȱ�ߣ���������'��ɫ����'���޸���src/css/tabbar.css ȥ�� active �������� transparent����ֻ����ͼ����ɫ�����ɫģʽ dark.css ���Ǳ���������ڡ����ֿ�������ҳ�ڶ��� .cc-toolbar �� 5 ����ť�������ֿ�/ȥ�ظ�/����/����/�������lex:1 ���ֺ�ÿ����Լ 64px������+ͼ�걻�ضϣ���������'ui ��ȫ��'���޸���src/css/chat-pages.css .cc-toolbar �� lex-wrap:wrap������ۡ���tabbar ��Χ��ɫ��ǰ���� base.css --bg-b �İ� + ȥ radial ���� + ȥ box-shadow ���Σ����θ��� tabbar active ȥ�׺��Ӿ����ɾ��������� AI-A �� src/js/chat.js �Ķ��ж���պ����ŵ����﷨����staged �汾 node -c ʧ�ܣ���unstaged �Ķ����޸���һ���ύ���漰 src/css/tabbar.css��src/css/chat-pages.css��src/js/chat.js���﷨�޸�����
\n### 2026-08-18\n- [AI-A] 完工：修复永恒浏览器（OPPO Find X9，安卓 WebView）音乐无法播放。根因：该 WebView 对 blob: URL 音频静默失败（play() Promise 挂起、onplay 不触发、无声无提示），原 playLocal 统一转 blob: 导致本地歌点了无反应、网易云兜底旋律也无声。改 music-player.js playLocal 为 blob:/dataURL 双路径互为兜底——Blob 优先 blob:、dataURL 字符串优先 dataURL 直接作为 src，4 秒无 onplay/无进度 teardown 切另一种 src 重试；新增 blobToDataUrl 辅助函数。夸克（dataURL 失效）和永恒（blob: 失效）都兼容。node --check 通过。未构建，待构建者执行 node build.mjs + npm run verify。涉及文件：src/js/music-player.js\n
### 2026-08-18
- [本会话] 完成（用户反馈 OPPO K13 + 雨见浏览器「信箱来信弹窗提示但点进信箱没有」排查+修复，已构建 verify 10/10 + CDP 探测 6/6 + 综合冒烟 4/4）：根因——`src/js/idb.js` idbRestore 启动回填**无条件覆盖 memoryCache[k]**；雨见等 IndexedDB 打开/读取慢的浏览器，启动回填尚未完成时收到新来信（大键信件 >200KB 只进 IDB+内存、不写 LS），迟到回填拿 IDB 旧值覆盖内存新值 → 弹窗已提示来信、信箱列表却是旧数据（空白/缺新信），直到下次写入才恢复。修复：回填只补「缺失」数据（memoryCache 已有值则跳过，含 LS 补写防污染）。CDP 复现测试：构造大键来信 + 12s 迟到回填 → 修复前内存被旧值覆盖、修复后新信保留。同时排查确认正常：正常来信/IDB挂起期间来信(mailPending)/TA回信落地/多桌面隔离/点弹窗进信箱。本次构建同时包含 AI-A 已保存改动（TA 收藏体系 chat/mail/feed + 占卜 v3.7 抽牌新流程 + 累积），18:29 构建产物与源码一致。遗留：`tools/diag-viewer-tmp.mjs`（未跟踪调试脚本，非本会话创建）待 AI-A 确认清理。

### 2026-08-18
- [本会话] 完成（开屏公告新增第12条，已构建 + 提交 v3.6.75）：公告新增「更新和bug修复」说明——灵感有但修设备bug耗时长所以慢；网站持续部署、每个反馈都修了，但只能靠用户自己设备验证，没设备无法验证修复程度；反馈修完后不一一回复，可晚点刷新新版再试；开屏无法跳过，加载完才能点进入。涉及 src/pwa/notice.json、src/template.html（离线兜底同步）。已 node build.mjs，产物与源码同次提交。

- [本会话] 完成（互动卡片收藏按钮显示乱码「function favHeartHtmlO{return收藏}」修复，已构建 verify 10/10 + 提交 v3.6.76）：根因——src/js/chat.js renderMsg 六类互动卡片（invite/ask/ask-choose/ask-curious/ask-roast/ask-card）拼 HTML 时漏写调用括号 `favHeartHtml +`（应 `favHeartHtml() +`），函数源码被 toString 拼进卡片导致乱码；其余 7 处正常。修复：6 处补 `()`。已 node build.mjs + verify 10/10，产物与源码同次提交。

- [本会话] 完成（互动卡片收藏按钮隐蔽化，已构建 verify 10/10 + CDP 探测 9/9 + 提交 v3.6.77）：收藏按钮不再常驻卡片，改为默认隐藏、点击卡片才浮现（再点收起，点卡片外区域自动收起，单选同时只显示一张卡片的按钮）。改 src/css/chat-main.css（.msg-fav-heart 默认 display:none，卡片 .show-fav 时显示+淡入动画；answered 卡片 cursor 改 pointer）+ src/js/chat.js（body click 委托：外层点非卡片区域清除 show-fav；card 分支 toggle show-fav，answered 卡片只 toggle 不再触发作答）。CDP 验证 9/9：默认隐藏/点显/再点收/点外收/未作答卡片浮现且作答区照常展开/收藏正常。本次构建同时带上 AI-A 已保存的音乐修复（music-player.js blob/dataURL 双路径）。临时脚本已删。

- [本会话] 完成（用户反馈「占卜半屏抽牌洗牌动画位置不居中、偏下要飞出屏幕；牌面需要设计图形」——**未构建未提交**）：
  1. **洗牌动画居中**：`divination.js` startDivineDraw 修两处——①卡片以 `left/top:50%` 为锚（左上角）但 transform 没做自身居中补偿，整叠牌从舞台中心向右下悬挂（偏下、出界）——所有 transform 加上 `translate(-50%,-50%)` 基础偏移，叠加随机位移/旋转；②随机偏移量收敛到舞台范围内（x∈[-76,76]、y∈[-34,34]、rot∈[-52,52]），卡牌尺寸稍缩（46-60px）。CDP 实测：卡片群中心 (dx=-1, dy=2) 精确居中，全部在舞台内（20/20）。
  2. **舞台防溢出**：`chat-pages.css` 给 `.div-shuf-box` 加 `overflow:hidden`（杜绝"飞出屏幕"），高度 170→178px 留呼吸。
  3. **牌背塔罗风格设计**（纯 CSS 无图片）：深紫渐变（#5a5270→#2b2538）+ 白色双线内画框 + 四角星点 + 中央✦星徽。`.div-shuf-card` / `.div-pile-card` 共享设计，`.ddc-face`（已抽翻面）加同风格内画框 + 浅色四角点与牌背呼应。JS 移除 `el.textContent = '✦'`（星徽改由 CSS `::after` 绘制）。
  涉及 `src/js/divination.js` `src/css/chat-pages.css`。**未构建未提交**，等待对方构建部署。

- [本会话] 完成（用户反馈「占卜完在聊天里发送的文字消息排版是乱的，而且有个 emoji 删掉」——**已构建未提交**）：
  1. **多行排版修复**：`chat.js` 渲染层根因——`escTxt` 不处理 `\n`，HTML 里 \n 被折叠成空格，多行消息显示成一坨。修复：新增 `escTxtBr(s)` = `escTxt(s).replace(/\n/g,'<br>')`，替换 renderMsg 主文本/组合消息 textPart/局部撤回 segHtml/quoteHtml 引用文本（5 处）——所有用户多行消息（占卜结果、引用块、组合消息文本段、局部撤回段）都正常换行。
  2. **删 🔮 emoji + 精简排版**：`divination.js` sendToChat 去掉 `🔮 ` 前缀，格式改为 `占卜 · 塔罗 3 张（问：...）\n1. 过去 · 愚人：...\n2. 现在 · 太阳（逆）：...\n3. 未来 · 世界：...\n综合：...`；防 summary 自带「综合：」前缀时重复。
  CDP 实测：消息文本无 🔮 含 \n，气泡 innerHTML 含 <br> 换行，半框自动发送消息同样无 🔮，8/8 通过。
  涉及 `src/js/chat.js` `src/js/divination.js`。**未提交**，等待统一构建部署。

### 2026-08-18
- [本会话] 完成（用户反馈「手机桌面美化里新增的桌面页数，重新刷新打开后会消失」修复，已构建 verify 10/10 + CDP 复现验证）：根因——`desk-page-count` 是 localStorage/IDB 双写小键，若该键只存于 IndexedDB（localStorage 缺失：旧数据迁移后残留键被清/浏览器配额清理），启动时 `idbRestore` 尚未回填，`personalize.js` 的 `buildDeskPages()` 已按默认 2 页构建完成，恢复完成后没有任何代码重建页面结构 → 刷新后新增页消失（设置页也显示「共 2 页」）。CDP 复现：清掉 LS 键仅留 IDB → 刷新后 `desk-page-count` 已回填为 3 但页面卡在 2 页。修复：`buildDeskPages()` 初始构建后追加「数据恢复完成（mochi-restore-done）后重建一次」（已 ready 直接重建，与 contacts.js/chat.js 同模式）；页数未变时幂等（不动已存在页内容，仅重设背景/圆点）。CDP 验证：正常路径与 LS 缺失路径刷新后均为 3 页。涉及 `src/js/personalize.js`（AI-B 文件，本会话统一实现）。已 `node build.mjs` + `npm run verify` 10/10。待提交。

- [AI-B] 完成（用户反馈「字卡库不流畅、删除字卡/删除分组卡顿」性能优化，已构建 verify 10/10 + 提交 v3.6.x）：**代改 AI-A 文件 src/js/chatcard.js**（用户直接要求修复，git log 确认对方最近提交 b015e28 后无未提交改动，无并发风险）。改动 4 处：① 图片字卡改 data-src + IntersectionObserver 懒加载（表情包/图片分类不再一次性解码全部 dataURL，`decoding=async`，无 IO 旧浏览器直接补 src 兜底）；② render() 改 DocumentFragment 批量挂载（原逐条 appendChild 布局抖动）+ header 加 data-g 标记；③ 删除字卡 delSelected / 删除分组改局部 DOM 更新（rebuildGroupAfterRemove / groupBlockNodes + updateCountsOnly），不再整页 render；④ 搜索输入加 120ms 防抖。本轮构建同时带上 AI-B 自动备份功能（data-backup.js/idb.js/pwa.js）与产物，同次提交 d1ac628。待对方确认无回归。

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库的 ta的询问/小问题/好奇/吐槽、查岗日常字卡、桌面今日情话 的【我的添加】无法新建分组，且我的添加分组要和系统预设隔开」修复，已构建 verify 10/10 + CDP 分组探测 30/30，提交中）：新增「我的添加自定义分组」——6 个模块共用 `window.cardGroups`（定义在 ta-ask.js 顶部：新建/重命名/删除分组弹窗流程、系统分类+我的分组合并下拉生成、`__newgrp` option 绑定与解析）。数据模型：各模块数据加 `groups=[{id,name}]` + 条目 `grp` 字段；查岗/情话列表对象化 `{t,grp}`（兼容旧字符串，`ckItems`/`getCustom` 自动转对象，抽取逻辑改 `.t`）。UI：我的添加 tab 顶部「新建分组」按钮 + 自定义分组区块置顶（分组名+数量+✎重命名/✕删除，组内条目可开关/删除，分组区块带内联添加表单）→「未分组」区块（ta 系按系统分类小节、查岗/情话单区块）始终渲染——自定义分组与系统预设分类体系彻底隔开；系统预设 tab 原样。添加表单/批量导入下拉均注入「我的分组」optgroup +「＋ 新建分组…」option（change 弹窗建组并选中；bindNewGrp 防重复绑定）。删除分组组内条目回未分组不丢失。涉及 src/js/ta-ask.js、src/js/quote-cards.js、src/js/p2-features.js、src/template.html（tc/tcu/tr/ck/cq 加「＋分组」按钮 + ck/cq 批量分组下拉）、src/css/chat-pages.css（mg-* 样式）、src/css/dark.css。本次构建同时带上 AI-A 已保存的 chatcard.js 语音卡 audio dataURL 不嵌 DOM（WeakMap）+ 大列表分块渲染（RENDER_BATCH=80）优化（21:41 并行提交后剩余未提交部分）。

- [AI-B] 完成（用户补充反馈「电脑不卡，GitHub Pages 部署后手机浏览器卡」，字卡库第二轮性能优化，CDP 实测 20/20 + verify 10/10，产物已同步 ccab79e）：仍是**代改 AI-A 文件 src/js/chatcard.js**，本轮 2 处：① **语音卡 audio dataURL 不再嵌进 DOM**（原每条几十 KB~几 MB 直接拼进按钮 data-src，几十条语音时 HTML 字符串膨胀到几十 MB 必卡）——改 WeakMap（按钮节点→音频数据）按节点取，渲染时只放文件名；搜索过滤后数组索引错位也不受影响；② **大列表分块渲染**（RENDER_BATCH=80/帧，首帧同步一批立即可见，其余 rAF 分批挂载，token 废弃被打断的旧批次）——5000 张卡不再一次性卡死主线程；局部删除遇分块渲染进行中自动降级为全量 render（防旧批次复活已删卡片）。⚠️ **并发提醒**：本轮编辑 chatcard.js 期间，对方（AI-A）在 21:49 提交 8c198b3 时把工作区未提交的 chatcard.js 改动一并打包（git add -A），消息里也写了「语音卡audio不嵌DOM/分块渲染」——内容与我的改动一致无冲突，但**再次提醒：双方同轮改 chatcard.js 风险高，建议同文件改动前先在 WORKLOG 留话**。

### 2026-08-18
- [本会话] 完成（用户反馈「字卡库的【聊天默认字卡】里缺少 可开启或关闭 聊天使用/信箱使用/朋友圈使用」——即默认字卡应分别控制三个场景，已构建 verify 10/10 + CDP 探测 13/13，提交中）：default-cards.js 新增**场景开关**——`dc-use-chat`/`dc-use-mail`/`dc-use-feed`（默认全开，localStorage '1' 开启），暴露 `window.defaultCardUse(scene)`；页面「使用默认字卡」总开关下方新增三个 .gs-row 开关行。落地：①聊天——`getDefaultCards()` 开头检查 useChat（回复混入 + 拍一拍同受控）+ chat.js 字卡池兜底补池加 useChat 条件；②信箱——mail.js `mailCardPool` 的 pushDefault 开头 `defaultCardUse('mail')` 为 false 直接不补；③朋友圈——feed.js `cardPool` 新增默认字卡补池（此前朋友圈从不使用默认字卡），仅当 useFeed 且 getDefaultCardGroups 存在时按空池补 main/kaomoji/emoji（与 mail 补池同模式）。涉及 src/js/default-cards.js、src/js/chat.js、src/js/mail.js、src/js/feed.js、src/template.html（三个开关行）。CDP 验证：三开关存在默认开、关聊天后 getDefaultCards 空、开回恢复、mail/feed 开关读写翻转。feed 补池为模块内逻辑（cardPool 未暴露），经代码审查确认守卫条件。
- [本会话] 完成（用户反馈「联系人主动发送消息的爱心标识跑出气泡外了，且可再缩小一点」——**已构建 verify 10/10 + CDP 实测 3/3，已提交 83f2b65 未 push**）：`src/css/chat-main.css`（AI-A 文件，请知悉）。`.msg-hi-heart` 原为 `top/left:-8px` 挂在气泡外角 → 改为 `top:2px; left:4px; width/height:9px`（原 11px），正好落在气泡 11/14 内边距内、不压文字。CDP 实测：爱心矩形在气泡矩形内部、9×9px、与文字区域无重叠。
- [本会话] 完成（用户反馈「桌面第二页今日心情卡片输入内容后点确定没变化」——**已构建 verify 10/10 + CDP 实测 4/4，已提交 3de4c4b 未 push**）：`src/js/personalize.js`（openModal 通用弹窗）。根因：`今天的心情` 弹窗同时带 pills（心情快捷选项）+ 输入框 + `pill:` 预设当前心情 → 用户输入文字点确定时，fire() 的 pills 分支条件 `(pillVal !== null || noInput)` 把「预设值」误判为「用户选了 pill」，回调拿到旧心情，输入被丢弃（卡片不更新）。修复：新增 `pillClicked` 标志（点 pill 才置 true），pills 分支改为 `(pillClicked || noInput)`——输入文字时走输入分支，点 pill 时仍走 pills 分支。顺带修复同款隐患「聊天气泡字体大小」弹窗；noInput 类弹窗（头像形状/导入字卡/移动到分组/删除确认等）行为不变（T4 回归通过）。

### 2026-08-19
- [本会话] 完成（用户反馈「联系人更新日常时，聊天消息顺序反了——应先发系统消息【联系人 更新了一条日常】，再发日常内容字卡消息」——已构建 verify 10/10 + CDP 实测 3/3，提交 7af16d6 未 push）：src/js/p2-features.js `doCheckin()` 原顺序为 先 chatAddIn(日常内容拼接行) 后 chatAddSystem(更新提示)，调换为 先发系统提示、再发内容消息，概率提醒「快来查岗」保持最后。CDP 实测聊天记录尾部顺序 [poke系统提示, 内容消息] 正确。本次构建同时带上 AI-A 已保存改动（chat.js/ta-ask.js/template.html/chat-main.css），全部 src JS node --check 通过。push 仍被环境阻塞（无 GitHub 凭据），提交待推送。

### 2026-08-19
- [本会话] 完成（用户要求为 TA的询问/小问题/好奇/吐槽 设计更多系统预设问题+预设答案+预设回应，高自由度情侣向+两个世界世界观，**未构建未提交**）：
  1. src/js/ta-ask.js 四个题库共新增 65 条预设：询问 22→39（14 条开放题 + 3 条单选题 type:'single'，单选选项即预设答案、每选项自带 TA 预设回应）；小问题 27→42（每选项带专属回应 + pref/liked 默契标记）；好奇 38→54（快捷项+每题回应池，8 题带 followup 自然追问）；吐槽 53→70（含 rw6-rw9 按「做梦/在哪/忙/听歌」等关键词 match 触发）。新 ID 与旧库无冲突，增量合并逻辑会自动下发给老用户。
  2. 顺带修复：文字版询问的 TA 回应此前从未接「询问·回应」池（池子只在管理页展示、实际只从字卡库/兜底句抽取）——ta-ask.js openAskReply（弹窗）与 chat.js expandCardInPlace（就地作答）两条路径均改为 getInteractPool('询问·回应') 随机取一条传入 chatAskReply（内部 90%系统预设/10%字卡库），与吐槽/好奇/小问题行为一致；chat.js 就地吐槽路径的回应池同步改接 getInteractPool('吐槽·回应')（原硬编码 7 句，与 ta-ask.js 弹窗路径不一致）。
  3. src/js/default-cards-data.js：询问·回应池 5→20、吐槽·回应池 7→18（node 临时脚本改写，紧凑 JSON+行尾分号格式与原文件一致，脚本已删）。
  4. 校验：node --check 三文件通过；四题库结构校验（选项/quick/replies/pref 范围/match）+ ID 唯一性通过。
  涉及 src/js/ta-ask.js、src/js/chat.js、src/js/default-cards-data.js（均为 AI-A 名下文件，chat.js 编辑时确认与 HEAD 无差异后进行）。
  ⚠️ 状态更新：本条目编辑进行中，对方批次提交 0aab135（20:56，猜拳图标+feed IDB门槛）把当时已保存的【询问/小问题/好奇新增 + ta-ask 分类标签栏】一并打包入库并构建；**仍待构建提交**的剩余部分：吐槽 17 条新增、询问·回应池接线（ta-ask.js openAskReply + chat.js 就地两处）、default-cards-data.js 两池扩充、本条 WORKLOG。请构建者再执行一次 node build.mjs 把剩余部分带上。
### 2026-08-19
- [AI-A] 开工（用户要求为 TA的询问/小问题/好奇/吐槽 再设计更多系统预设问题+答案+回应，高自由度情侣向+两个世界+字卡设定，**本条尚未构建**）：在 src/js/ta-ask.js 四个 DEFAULT 数组末尾各追加一批，共 +94 条：询问 +18（15 开放题 q_d13-d17/q_c11-c13/q_i15-i17/q_w15-w18 + 3 单选 q_s6-s8，type:'single' 选项即预设答案、每项自带 TA 专属回应）；小问题 +22（cd12-15/cl8-10/cf8-10/cr9-11/ch8-10/cs7-8/cw10-13，每项带专属回应+pref/liked 标记）；好奇 +25（cy11-13/cm9-11/cd10-13/cp9-11/cl10-12/ct10-11/cu9-11/cw11-14，quick 垫脚+replies 回应池，6 题带 followup 自然追问）；吐槽 +29（rl19-25/rf15-19/rs17-22/rm7-9/rsg4-5/rw10-15，其中 rw10/rw13/rw14/rw15 按 match 关键词触发）。新 ID 与旧库无冲突，增量合并逻辑会自动下发到老用户。校验：node --check 通过，四数组 ID 唯一性通过（73/77/96/99）。涉及 src/js/ta-ask.js（AI-A 名下）。**未构建未提交**，连同上一轮待构建部分，请构建者执行一次 node build.mjs 一并带上。
- [本会话] 完成（用户反馈朋友圈多桌面 2 个 bug：①非当前桌面联系人发朋友圈，后台弹窗显示的联系人身份错误（成了当前桌面 TA）；②在联系人1桌面回复联系人2发布的动态，联系人2无法回复我的评论——**已构建 verify 10/10 + CDP 复现 17/17 + 身份显示 10/10，待提交**）：
  1. **跨桌面身份显示**（根因 ①）：feed.js 的 partnerName/partnerAv/myName/myAv 读模块顶部缓存的**顶层 store**（xy-home-v2 旧键，迁移后已清空 → 全空/旧值）；跨桌面动态的 TA 头像/昵称 fallback 一律用**当前桌面**。修复：四个函数改读 activeStore（每桌面独立）；新增 `taAvFor(owner)`/`taFeedNameFor(owner)` 按**动态所属桌面**取 TA 头像/昵称；render()/renderFeedAll/taAuthorOf/点赞回赞/通知文本 fallback 全部按 owner 取；`addNotice` 加 owner 参数 → 桌面弹窗（chat.js showDeskPopup 新增 opts.av 支持）、通知列表头像（renderNotices 按通知 owner）、系统通知右侧大图标（bg-keep.js bgNotifyCheck 新增 extra.av 优先）全部显示**发布者**头像。另修 taFeedAv 缺少 activeStore.avatar-partner 回退。
  2. **全部朋友圈页无法评论/回复**（根因 ②）：openFeedAll 渲染的列表**没有评论/点赞按钮、评论点击无回复绑定**（只绑了删除/图片）→ 用户在该页无法互动。修复：拆出 `renderFeedAll()`，补 `.feed-actions` 赞/评论按钮（与主列表一致），直接复用 `bindEvents`（点赞/评论/回复/删除/图片全可用）；点赞/评论/回复/发布后按可见页面刷新（新增 `renderVisible()`：全部朋友圈页可见时刷 renderFeedAll，否则 render）；回复占位显示被回复评论作者名（'回复 二宝…' 不再一律 '回复 TA…'）。
  - CDP 验证：主列表/全部朋友圈页评论→TA(二宝)用**二宝桌面字卡库**回应、昵称二宝；回复模式 TA 回应二宝；全部朋友圈页有赞/评论按钮且可回复；主列表 TA 动态头像/通知列表头像/弹窗头像/系统通知 av 均为发布者（二宝）而非当前桌面（大宝）。
  - 涉及：src/js/feed.js、src/js/chat.js、src/js/bg-keep.js。
  - 本次构建同时带上 AI-A 已保存的 ta-ask.js 两轮新增（吐槽17条+94条新预设/回应池接线）、chat.js、default-cards-data.js 改动（上一轮留话「请构建者再执行一次 build」已执行）。
  - 遗留：`.verify-fixes-tmp.mjs`、`.shot-tmp/`（历史遗留未跟踪调试残留，非本次创建，待确认清理）。
### 2026-08-19
- [AI-A] 开工（用户追问「还有能增加的问题吗」，再追加第四批，**本条尚未构建**）：src/js/ta-ask.js 四数组末尾各加一批，共 +73 条：询问 +14（11 开放 q_d18-d20/q_c14-c15/q_i18-i19/q_w19-w22 + 3 单选 q_s9-s11）；小问题 +18（cd16-19/cl11-12/cf11-12/cr12-13/ch11-12/cs9/cw14-16）；好奇 +19（cy14-15/cm12-13/cd14-16/cp12-13/cl13-14/ct12-13/cu12-13/cw15-18，4 题带 followup）；吐槽 +22（rl26-31/rf20-24/rs23-28/rm10-12/rsg6-7/rw16-21，5 条带 match）。题材换角度：时间感/感官/未来/字卡本身/两个世界深化/情绪细微/日常碎片。校验：node --check 通过，四数组 ID 唯一性通过（87/93/115/127）。涉及 src/js/ta-ask.js。**未构建未提交**，连同前几批待构建部分，请构建者执行一次 node build.mjs 一并带上。

### 2026-08-19
- [AI-A] 完成：新增双人贪吃蛇小游戏（聊天更多功能→贪吃蛇）。已构建 verify 10/10 + CDP 冒烟 12/12。20x20地图/双蛇同时移动/统y碰撞结算(公平)/TA=生存判断+目标评分+flood-fill空间+9种概率行为池+冷却/速度120->90ms随时间/滑动+方向键+WASD+虚拟方向键/倒计时3-2-1/胜负平+长度食物得分存活时间/结束调interact字卡池(游戏胜利/失败/平局·回应)作TA回复+special:snake卡片入聊天。文件:src/js/snake-game.js(新)、template.html、chat.js、default-cards-data.js、chat-pages.css、mobile-adapt.js、tabs.js、build.mjs。仿pong.js模式。未提交。
### 2026-08-20
- [本会话] 完成（用户反馈「多桌面联系人情部下，信箱看不出是哪个联系人发的；切换到谁的桌面，来信就自动变成谁的名字」——**已构建 verify 10/10 + CDP 多桌面 7/7，待提交**）：
  - **根因**：`src/js/mail.js` 模块顶部 `const uid = window.activePrefix()` **加载时固定**，而 `loadSnap()`/`writeSnap()` 用 `uid + ':' + SNAP_KEY` → **无论切到哪个桌面都读写 default 桌面的 `mail-letters-snap`**。非 default 桌面信箱主键（每桌面独立 `mail-letters`）为空时 `load()` 兜底 `loadSnap()` 读到 **default 桌面的信** → 串桌面 + 渲染时 `partnerName()`（当前桌面 TA）显示名字 → 「同一封信在谁桌面显示谁的名字」。
  - **修复**：删除固定 uid，新增 `snapKey() { return window.activePrefix() + ':' + SNAP_KEY; }`，loadSnap/writeSnap（3 处）全部走动态键 → 每桌面各写各的快照，非 default 桌面不再读到 default 的信。排查确认：chat.js `writeLsSnapshot` 已是动态 `activePrefix()` ✓；feed.js 快照固定 default 是**故意**（feed-posts 全局共享数据）✓。
  - **CDP 验证**：修复前——联系人2桌面信箱显示 default 桌面的信（内容相同+「来自 二宝」）；修复后——隔离正确（cid2 主键空时信箱空）、两桌面各自来信独立、default 显示「来自 大宝」/cid2 显示「来自 二宝」互不串。verify 10/10。
  - 涉及 `src/js/mail.js`（AI-A 名下，本会话代改；build 产物含并行会话已保存的 chat.js/decision.js 改动，一并提交）。

### 2026-08-20（用户反馈三连：备忘心情不刷新 / 全屏退出提醒不消失+黑边 / TA 引用消息异常）
- [本会话·完成]（**已随对方多次提交构建 verify 10/10 + CDP 专项验证**）：三个用户反馈问题的修复（我的改动已被对方分次提交包含，工作区当前干净）。
  - **问题1 备忘/心情不每天刷新**（`src/js/p2-features.js`）：根因——备忘/心情存固定键 `memo`/`today-mood`，保存一次永久显示。修复——改为按「天」显示：读当日快照 `memo-YYYY-MM-DD`/`today-mood-YYYY-MM-DD`（对方 AI-A 同日也加了同款快照，合并无冲突），当天没写显示占位、第二天自动重新开始；跨天页面开着时 30s 轮询自动刷新；兼容迁移（`legacyToday`）：老用户当天写过（历史第一条 ts 是今天）则把固定键内容迁移为今日快照，不丢内容；历史记录 `memo-history`/`mood-history` 照常写入，主页「我的今日备忘/心情」可查看。
  - **问题3 TA 引用消息异常**（`src/js/chat.js`）：根因①「要么不引用」——`lastMineText` 从未在加载历史后初始化，首次回复时为空（quote-prob 命中也只显示占位省略号）；修复——`loadMsgs` 三处出口（LS 快照载入/IDB 合并完成/IDB 无数据分支）调用 `syncLastMineText()`。根因②「连续引用同一条发很多条」——`scheduleReply` 里 quote 在循环外掷一次骰、N 条回复全复用同一个引用；修复——改为每条回复独立掷骰 + 独立取值。CDP 验证：历史注入后 TA 回复带引用块；quote-prob=50 连发 2 条跑 8 轮出现 3 次「恰好 1 条带引用」（旧逻辑该情况不可能出现）。
  - **问题2 全屏退出提醒不消失 + 顶部黑边**（`src/js/fullscreen.js` + `src/pwa/manifest.json`）：根因①黑边——manifest `display_override:["fullscreen","standalone"]` 让快捷方式直启系统级全屏，挖孔屏顶部 cutout 被涂黑；修复——`display_override` 改为 `["standalone"]`（standalone 仍可隐藏浏览器栏，去系统级全屏黑边；用户可在设置里手动开全屏）。根因②退出提醒不消失——浏览器标签模式下 `FS_KEY` 保持 '1'，用户用系统 UI 退出全屏后 `reenterFs`（切后台回来/重新聚焦）强制重入 → 退出提示条反复弹出；修复——新增 `fsInPwa()` 判定：浏览器标签模式退出全屏（`handleFsExit`）清持久化标记、启动/`doRetry`/`reenterFs` 不再自动重入（`reenterFs` 仅在全屏中切后台时保留标记）；PWA 安装态行为不变照常自动恢复。CDP 验证：standalone 布局正常、浏览器模式启动清标记不再自动进全屏。
  - 验证：`node tools/verify.mjs` 10/10；临时探测脚本（probe-fs/probe-fix/probe-fs2）已删。

### 2026-08-20
- [本会话] 完成（用户反馈「拍一拍人称有问题：用自定义拍一拍字卡【弹了一下我的额头】会显示成【联系人昵称弹了一下我的额头 我】」）：`src/js/chat.js` performPoke + sendPoke。根因：拍一拍字卡分三类（含"你"如"戳了戳你的脸蛋"、含"我"如"弹了一下我的额头"、都不含如"戳一戳"），原代码只分「含你」/「不含你」两支——performPoke 不含"你"时一律末尾追加我的称呼 →「联系人昵称 弹了一下我的额头 我」多出个"我"；sendPoke 不含"你"时一律 `'我 '+字卡+' '+联系人昵称` →「我 弹了一下我的额头 TA」读成自己拍自己。修复：中间加「含我」分支——performPoke 直接「联系人昵称 + 字卡原文」（不再追加"我"）；sendPoke 把字卡里的"我"替换成联系人昵称（"弹了一下我的额头"→"我 弹了一下TA的额头"）。默认字卡（拍了拍你/戳了戳你的脸蛋/戳一戳）输出不变。node --check 通过 + 逻辑单测 6 字卡×2 方向全部正确。**已构建待提交**（构建时工作区干净、无对方在途改动）。

### 2026-08-20
- [本会话] 完成（用户要求「拍一拍页面像表情包一样分两类：联系人昵称的拍一拍 + 我的昵称的拍一拍，可新增预设拍一拍」——**已构建 verify 10/10 + CDP 实测 7/7（含刷新持久化），待提交**）：`src/js/chat.js` + `src/css/chat-main.css`。
  - 拍一拍面板改为双 tab（复用表情包 .emoji-tab 样式，JS 注入 #poke-card）：
    - Tab1「<联系人昵称> 的拍一拍」：内置预设（拍了拍我/戳了戳我的脸蛋/弹了一下我的额头/揉了揉我的头发/捏了捏我的脸颊/拍了拍我的肩膀）+ 用户新增。点卡片/输入 → 联系人拍我（显示"联系人昵称 + 字卡"，新增 performPokeWith，含 你→我的称呼 转换 + 联系人随后回复一条，节奏同 sendPoke）。
    - Tab2「我的拍一拍」：内置预设（拍了拍你/戳了戳你的脸蛋/弹了一下你的额头/揉了揉你的头发/捏了捏你的脸颊/拍了拍你的肩膀）+ 用户新增。点卡片 → sendPoke（我拍联系人）原行为。
  - 新增数据：`poke-user-ta`/`poke-user-mine`（每桌面独立，LS+IDB 双写，键带 activePrefix 命名空间，IDB 内容多时恢复覆盖）；面板「＋ 新增」按钮 openModal 输入加入当前 tab 池；自定义输入行按当前 tab 方向发送；tab 记忆 `poke-tab`（每桌面）；contact-switched 重载池+关面板。
  - 旧字卡库【拍一拍】自定义字卡仍兼容：按人称自动归类（含"你"→我的tab；含"我"→联系人的tab；中性→我的tab）显示为「自定义」小节；performPoke（联系人自动拍一拍）字卡池改为 pokeAllCards()（预设+新增+旧自定义），不再只读 getPokeCards()。
  - 已 node --check 通过。⚠️ 并行会话正在改 mail.js/music-player.js/pong.js/chat.js（未提交），本次构建已一并带上，提交信息注明双方范围。
### 2026-08-20
- [本会话] 完成（用户反馈「我发布朋友圈，好像不是所有桌面联系人都能回复我」——**已构建 verify 10/10 + CDP 全员回应 11/11，待提交**）：
  - **根因**：`src/js/feed.js` publish() 的 TA 点赞/评论回应只掷**当前桌面** TA（feedCfg() + taAuthorOf(p2)），其他桌面联系人的 TA 从不回应我发布的动态。
  - **修复**（feed.js）：
    1. 新增 `feedCfgFor(cid)`（按指定联系人桌面读 reply-fd-* 设置），`feedCfg()` 改为读当前桌面（等价原逻辑）；`maybeAutoPostFor` 改用 feedCfgFor(cid)（原用当前桌面 cfg 串设置）。
    2. 新增 `taAuthorOfCid(cid)`（按桌面取 TA 身份：feed-ta-name/feed-ta-avatar 回退 lbl-partner/avatar-partner）。
    3. publish() 遍历**所有联系人**：每个桌面的 TA 按**各自桌面设置**掷点赞/评论概率，用**各自桌面字卡库**生成内容、**各自桌面身份**署名（评论 owner=该桌面），通知/弹窗 owner 正确传递；收藏保持仅当前桌面 TA（各桌面收藏隔离）。
    4. submitComment 回复分支：TA 回应按**被回复评论的作者桌面**（tc.owner）取设置/字卡/身份——用户回复二宝的评论，由二宝（用二宝桌面字卡）回应，不再一律用动态所属桌面 TA；评论模式回应用动态所属桌面（taAuthorOf(p2) 原语义）。
    5. 点赞回赞/评论回应延迟与概率改按所属桌面设置。
  - **CDP 验证 11/11**：发布后大宝+二宝都点赞/评论；二宝评论内容用二宝桌面字卡库、owner=cid2；回复二宝评论→二宝按评论 owner 用自己桌面字卡回应。
  - 涉及 `src/js/feed.js`；提交含并行会话已保存的 calendar.js/chat.js/music-player.js 改动与构建产物（node --check 全过）。
- [本会话] 完成「音乐库分类筛选」（用户需求：我的音乐库下可切换 全部音乐/未分类音乐/已建歌单，未分类无歌不显示分组）：
  - **template.html**：`#music-lib-list` 上方加 `<div class="music-lib-filter" id="music-lib-filter">` 锚点（工具行下方）。
  - **music-player.js**：新增 `libFilter` 状态（'all'/'default'/歌单id，切桌面重置）+ `libSongsFor()` 过滤辅助 + `renderLibFilter()`（chips 渲染：全部音乐/未分类音乐[无歌自动隐藏]/各歌单，当前分组消失自动回退全部，筛选条全空歌时隐藏）；`renderLibrary()` 改按 libFilter 过滤、空态文案区分（全部/未分类/空歌单）；批量管理「全选」同步按当前筛选；`renderPage()` 先渲染筛选条。
  - **chat-pages.css**：`.music-lib-filter`/`.mlf-chip` 横向滚动 pill 样式（与 fav-tab 同风格）。
  - 验证：`tools/verify-music-filter.mjs`（新增）CDP 14/14 通过（全新数据未分类0首→chip隐藏；注入未分类歌→chip出现且筛选正确）+ verify.mjs 布局 10/10。
  - ⚠️ 未 git 提交：工作区仍有并行会话未提交改动（chat.js/chatcard.js/mood-reply-cards.js/ta-ask.js/template.html 通话小框相关等），本次 build 已一并打包；提交前请确认 AI-A 通话改动是否完整。
- [本会话] 修复「梦角邀请听歌记录不显示封面」（用户反馈）：
  - 根因：renderHistory() 只渲染固定图标（播放模式/音符），从未读封面；addRecord 也不存 cover。
  - 修复（music-player.js）：renderHistory() 记录封面——优先取记录冗余存的 x.cover，没有再按 trackId 回查当前音乐库歌曲 cover；都拿不到保留原图标（mode/拒绝/已删歌不受影响）。addRecord() 冗余存 cover（歌曲之后被删/换封面，旧记录仍显示当时封面）。
  - chat-pages.css：.sm-his-ico.has-cov 封面背景样式（cover/居中 + 隐藏 svg）。
  - 验证：tools/verify-music-history-cover.mjs（新增）8/8（回查/冗余/无封面回退/mode 图标）+ verify-music-filter.mjs 14/14 + verify 布局 10/10。构建产物已更新，未提交（同上轮，工作区有并行会话改动）。

### 2026-08-20
- [本会话] 完成（用户反馈「为什么联系人的拍一拍里还能显示联系人名称的拍一拍，这个功能是给我用的」，用户确认选「都改成我拍联系人」——**已构建 verify 10/10 + CDP 实测 4/4，待提交**）：`src/js/chat.js`。
  - 拍一拍面板两个 tab 点卡片/输入**都发送"我 拍联系人"**：tab「二宝 的拍一拍」里的"拍了拍我/弹了一下我的额头"点选后经 sendPoke 把字卡"我"替换成联系人昵称 → 显示"我 拍了拍二宝"/"我 弹了一下二宝的额头"，不再出现"二宝 拍了拍我"。
  - 删除了 performPokeWith（联系人拍我方向的发送函数）及其调用点——⚠️ 对方在它里面加的 myCid 桌面切换守卫随函数一并移除（该函数已无调用方）；若后续需要"面板触发联系人拍我"再重加。performPoke（联系人自动拍一拍）保持不变。
  - 验证：CDP 4/4（tab1 点"拍了拍我"→"我 拍了拍二宝"、tab1 点"弹了一下我的额头"→"我 弹了一下二宝的额头"、tab2 点"拍了拍你"→"我 拍了拍二宝"、tab1 输入"揉了揉我的头发"→"我 揉了揉二宝的头发"；全程无"二宝 拍…"出现），verify 10/10。

### 2026-08-20
- [本会话] 完成（用户反馈「联系人的拍一拍和我的拍一拍 下面的字卡不显示可以切换拍一拍分组了；我的拍一拍缺少新建分组的功能」——**已构建 verify 10/10 + CDP 实测 9/9，待提交**）：`src/js/chat.js` + `src/css/chat-main.css`。
  - 拍一拍面板恢复**分组切换**：每个 tab 下分组 chips（复用 .emoji-g-chip）= 「预设」+ 用户分组 + 旧字卡库【拍一拍】分组（按人称归类，含"我"进联系人tab/含"你"进我的tab，混合分组两边各显子集）；点 chip 切换显示该分组字卡；记忆 tab + 分组（poke-tab / poke-group-ta|mine，每桌面）。
  - **新建分组**：工具行「＋ 新建分组」（openModal 命名，防重名，建后自动选中）+「＋ 新增拍一拍」（添加到当前用户分组，无用户分组时自动建「我的新增」）。
  - 数据改**分组存储** `poke-groups-ta`/`poke-groups-mine`（[[分组名,[字卡]],...]，仿 my-emoji-groups，LS+IDB 双写）；老版本扁平 `poke-user-*` 自动迁移为「我的新增」分组。performPoke 自动拍一拍池 pokeAllCards() 同步读分组。
  - 验证：CDP 9/9——分组栏/工具行渲染、旧字卡按人称归类进对应分组 chips、老扁平数据迁移、新建分组+自动选中、添加进当前分组、点卡片发送「我 拍联系人」、刷新后分组持久化；verify 10/10。
- [本会话] 移除默认歌单 2 首内置种子歌（用户需求「歌单里默认歌曲的 2 首歌删掉」）：
  - **根因**：loadAll 有「首次补种」+「种子歌自愈」逻辑——自愈每轮 loadAll 检查 neteaseId 2613048732/27538343 缺失就自动补回，删了必复活。
  - **修复**（music-player.js）：删除首次补种块（原往默认歌单放 Moonlit Dream/Baby）；删除自愈块，替换为**升级迁移**——loadAll 自动删除 id 以 `sm_seed_` 开头的歌（用户自导入的同名歌 id 不同不受影响），并清理 IDB 残留 music-file:sm_seed_*；再次刷新不再复活。全新数据不再预置任何歌曲（默认歌单保留为空歌单）。
  - 保留（无害，仅对用户自导入同名歌生效）：url 规范、已知元数据识别、播放兜底旋律。
  - 验证：tools/verify-music-no-seed.mjs（新增）5/5 + verify-music-filter.mjs 15/15（适配空库：筛选条空库隐藏）+ history-cover 8/8 + 布局 10/10。构建产物已更新，未提交。
- [本会话] 去电挂断后音乐不自动恢复 bugfix（用户反馈「接通联系人电话后打断音乐，挂断后没恢复」）：
  - **根因**（call.js）：去电 placeCall 拨出时漏调 musicHoldForCall(true)，callHoldPlaying 未记录为 true；挂断 endCall 调 musicHoldForCall(false) 时 callHoldPlaying 为 false，不触发恢复播放。来电 incomingCall 有此调用故正常。
  - **修复**：placeCall 的 closeImageOverlay() 后补 `if (window.musicHoldForCall) window.musicHoldForCall(true)`，与来电对齐——拨出即暂停音乐+隐藏悬浮小框，挂断后自动恢复。
  - 验证：布局 verify 10/10。构建产物已更新。

### 2026-08-20
- [本会话] 完成（用户反馈「引用图片/表情包消息，发送出去还有『图片』两个字」修复，已构建 verify 10/10 + CDP 13/13，已提交 26d6b39，未推送）：
  - **根因**（chat.js）：引用纯图片/表情包消息时 lastQuote.text 被设为占位文案「图片/表情包」（引用设置处 4267-4270）；quoteHtml（651-670）与引用预览条 renderQuoteBar（5120-5153）把该占位当文字渲染 → 引用块/预览条出现「图片」两字。
  - **修复**（src/js/chat.js 共 3 处）：新增常量 `QUOTE_PLACEHOLDER = /^(图片|表情包|\[图片\]|\[表情包\])$/`；quoteHtml 对象分支在「有缩略图」时过滤占位文案（**历史消息里已存的引用块一并修复**）；renderQuoteBar 有缩略图时同样不显示占位文字。组合消息（文字+图）引用的真实文字不受影响（正则不匹配）。
  - **验证**：tools/verify-quote-image.mjs（新增）CDP 13/13——A 历史引用渲染 4 项（图片/表情包不显示占位、组合保留文字）+ B/C/D UI 交互引用图片/表情包/组合消息各 3 项（预览条与气泡引用块）；verify 布局 10/10。
  - ⚠️ **对方注意**：本轮 index.html 是 19:31 构建快照，**未包含**你们 19:33 保存的 chatcard.js / mobile-adapt.js / chat-pages.css / template.html 改动（仍在工作区未提交）。请收尾后重新 `node build.mjs` 并提交，避免 src 与产物不一致。

### 2026-08-20
- [本会话] 完成（用户反馈「联系人的拍一拍/我的拍一拍点击颜色一样没区分；联系人的拍一拍只需展示自定义聊天字卡【拍一拍】的分组和字卡，新增只放在我的拍一拍」——**已构建 verify 10/10 + CDP 实测 6/6，待提交**）：`src/js/chat.js` + `src/css/chat-main.css`。
  - **tab 分工**：联系人的拍一拍 = 只读展示 自定义聊天字卡 → 拍一拍 的分组和字卡（原样，不归类不混入预设/用户分组；隐藏工具行+输入行，空态提示去字卡库添加）；我的拍一拍 = 预设 + 用户分组 + 「新建分组」「新增拍一拍」+ 输入行。
  - **tab 配色区分**：联系人的=浅色描边（透明底+深色描边，对方气泡风）；我的=深色填充（我方气泡风）。
  - **根因修复（重要）**：拍一拍 tab 原来复用 .emoji-tab 类，表情包面板的全局 `document.querySelectorAll('.emoji-tab')` 点击监听会**劫持拍一拍 tab 点击**（dataset.etab 为空→emojiMode=undefined→undefined===undefined→给全部 .emoji-tab 加回 sel）→ 两个 tab 永远同时高亮。修复：拍一拍 tab 改用独立 `.poke-tab` 类（样式同 .emoji-tab）。
  - **顺带修复**：对方 19:52 新增的 chat-settings-btn 代码用 `const csBtn` 与既有 chat-continue-btn 的 csBtn 重复声明 → 整包语法错误（node --check 挂、构建挂）；已改名 csOpenBtn（对方逻辑不变），已在 WORKLOG 注明。
  - 验证：CDP 6/6（ta 只读/无工具行/原样显示字卡库、mine 预设+工具行、选中样式 ta≠mine、mine 新增进分组、ta 点卡片发「我 拍联系人」、无 sel 串扰），verify 10/10。

### 2026-08-20（用户反馈「iPhone17 Edge：开了后台通知和保活收不到信息；退了过一会进去白屏（后台还在）」）
- [AI-B·完成]（**已改 src/pwa/sw.js，未构建未提交**，请构建者执行 `node build.mjs` 后随下次统一提交）：
  - **诊断·通知收不到**：iOS 平台限制，代码无法修。① Edge 标签页无 Notification API（iOS WebKit 仅 PWA 模式暴露，bg-keep.js:268 已 toast 提示）；② 装主屏也不弹——iOS WebKit reg.showNotification() 只在收到 push 事件时弹（需真后端+VAPID+PushSubscription），本项目是页面 JS 定时调 showNotification 无 push 事件 → iOS 静默不弹（安卓 Chrome 允许）；③ 后台保活在 iOS 无效——AudioContext 后台立即挂起/JS 定时器停/wakeLock 后台无效/MediaSession 不阻止冻结，iOS 没有"网页后台保活"。要支持 iOS 通知必须接后端 Web Push，与项目纯本地定位冲突。建议设置页对 iOS 灰掉这两个开关+提示。
  - **修复·白屏**（src/pwa/sw.js 两处 bug，AI-B 域）：
    1. activate 删旧缓存太激进（主因）：precache 弱网全 8s 超时失败 → 新 CACHE 空 → activate 照旧删光旧缓存 → 导航回退 caches.match('./index.html') 拿不到 → Response.error() → 白屏（iOS PWA 切回前台弱网易触发）。修复：删旧前先确认当前 CACHE 有 index.html，没有则保留一个含 index.html 的旧缓存兜底，都没有才全删。
    2. 兜底循环首次即 return：原 for 循环 `return caches.match(...)` 只查 keys[0] 漏掉其余 cache。改为 reduce 顺序遍历所有 cache，命中即返回。
  - 验证：node --check 通过。功能未构建未验证，需构建后无头 verify + iOS 真机测试（无头无法验证 iOS PWA 切回白屏）。
  - ⚠️ 工作区另有 AI-A 进行中改动（default-cards.js + chat-pages.css 未构建），本次 sw.js 改动未含在内，构建时需 AI-A 确认已保存完整。

### 2026-08-20
- [本会话] 完成（用户反馈「联系人发送的拍一拍【景元 闷闷垂头 我】应为【景元 闷闷垂头】；联系人的拍一拍里不用显示新建分组/新增拍一拍」——**已构建 verify 10/10 + CDP 实测 6 项，待提交**）：`src/js/chat.js` + `src/css/chat-main.css`。
  - **中性字卡不再追加称呼**：performPoke/sendPoke 的「不含你/我」分支改为「主语 + 字卡」（原末尾补称呼 →「景元 闷闷垂头 我」/「我 闷闷垂头 景元」）；含"你"/含"我"分支不变。
  - **工具行/输入行视觉隐藏根因**：上一轮已设 `pokeToolsRow.hidden` 但**没生效**——`.poke-tools{display:flex}` 会覆盖 hidden 属性（UA 默认 display:none 被显式 display 覆盖），表情包面板有 `.emoji-tools[hidden]{display:none}` 兜底而我漏了。修复：补 `.poke-tools[hidden], .poke-input-row[hidden]{display:none}`。此前 CDP 断言只查了 hidden 属性没查 computed display，是漏网原因。
  - 验证：CDP——ta tab 工具行/输入行 computed display:none、mine tab 可见；点「闷闷垂头」显示「我 闷闷垂头」；15 轮 TA 回拍零「景元 xxx 我」、「景元 闷闷垂头」出现 9 次；verify 10/10。

### 2026-08-20
- [本会话] 完成（用户追问「其他格式的拍一拍会有错误吗」——全格式审计发现并修复 3 类人称错误，**已构建 verify 10/10 + CDP 实测 5 项，待提交**）：`src/js/chat.js` performPoke + sendPoke。
  - 审计矩阵（18 种卡×2 方向）发现的错误：①「我拍了拍你的头」类（"我"作主语+含"你"）sendPoke 变「我 **我**拍了拍景元的头」双"我"；②「你拍了拍我的头」类（"你"作主语）performPoke 变「景元 我拍了拍我的头」人称全乱；③「我们/你们」被误替换（"拍了拍我们"→"拍了拍景元们"）。
  - 修复：卡面以"你"/"我"开头的按**主语**处理（performPoke：主语=联系人去掉后其余"你"换我的称呼；sendPoke："你"开头翻转视角 你→我、我→联系人，"我"开头保留主语）；"你"非开头仍是目标；正则 /你(?![们])/g、/我(?![们])/g **保护"你们/我们"整词**；"我"开头+含"你"的卡不再重复加"我"前缀。
  - 验证：18 卡×2 方向矩阵断言全对；CDP 5 项（双"我"消除、我们/你们保护、TA 回拍「你拍了拍我的头」→「景元 拍了拍我的头」、无「景元 我…」错误）全过；verify 10/10。

### 2026-08-21（本会话，用户反馈「iOS Chrome：连发句1/句2/句3，TA 引用只引用最后一句且一连引用两次句3」）
- [本会话] 完成（**已构建 verify 10/10 + CDP 专项 5/5，待推送**）：`src/js/chat.js`。
  - **根因**：每发一条消息排一个回复轮，引用源 lastMineText 是执行时才读的全局槽位——连发 3 条时所有回复轮拿到的都是最后一条（引用永远指向最后一句）；且各轮独立掷 quote-prob（默认 30），多轮命中就连续引用同一条。
  - **修复**：① 引用源改为调度时快照 quoteSrc（每轮引用触发它的那条消息：句1 的回复轮引句1，句3 的引句3）；② 新增 lastQuotedText 记录上次实际引用文本，发送时再核对（并发轮交错也能挡住），同内容不连续引用；③ 切联系人时随 lastMineText 一并清空 lastQuotedText。
  - 验证：CDP 专项 5/5——连发 3 条各引各的（句3/句1/句2 无重复）、连发 2 条相同内容只引一次、无引用源不产生引用；verify 10/10。新回归脚本 tools/verify-quote-target.mjs。
  - 注意：提交包含此前未提交的对方改动（base.css iOS 灰带修复 + template.html 群聊占位锚点 + sw.js 白屏兜底 + 对应构建产物）；另遗留未跟踪调试脚本 diag-realclick/diag-scan2/poke-dbg/smoke-*/verify-quote-image.mjs 未提交，请确认是否清理或入库。

### 2026-08-21（用户反馈「桌面小组件排好顺序刷新会乱」+「添加到桌面的快捷方式切后台退出全屏」OPPO Find X9 Chrome）
- [AI-B·完成]（**已构建 verify 10/10 + 专项 4/4 + 3/3，待提交**）：`src/js/personalize.js` + `src/js/fullscreen.js` + 新脚本 `tools/verify-desk-layout.mjs`、`tools/verify-fs-reenter.mjs`。
  - **桌面小组件顺序乱根因**（personalize.js applyDeskLayout）：原实现只移动「不在本页」的节点，已在页内的节点即使顺序与 desk-layout 不一致也不重排；且第 0/1 页没有 `.desk-page-add`，移入节点被 append 到页尾 → 用户排好的顺序刷新后被 template 默认顺序覆盖。修复：分两步——先移入不在本页节点，再按布局数组顺序校正本页 widget（顺序一致跳过避免 DOM 抖动；app-* 仍在 app-grid 内的跳过逻辑保留；图片/文字组件不在 layout 内，重排不动它们）。
  - **切后台退出全屏不恢复根因**（fullscreen.js）：① handleFsExit 在非 PWA 判定（OPPO Chrome 快捷方式态 display-mode 可能报 browser）下无条件清掉 fullscreen-enabled 标记 → 切回后 reenterFs 直接放弃；② reenterFs 原 600ms 延迟才装手势重试监听，用户切回立刻触摸会落在窗口外。修复：`_wentBg` 标记区分「切后台系统退出」（保留意图）vs「前台主动退出」（非 PWA 清标记不回归）；reenterFs 重构为 FS_KEY=1 一律尝试恢复 + `armRetry()` 立即武装（去掉 600ms 延迟）；doRetry 去掉非 PWA 拦截。
  - 验证：verify-desk-layout 4/4（music 跨页移入+重排、二次刷新保持、第二页移除、默认布局不受影响）、verify-fs-reenter 3/3（非 PWA 下 FS_KEY 意图保留、前台退出清标记不回归）、布局 verify 10/10。
  - ⚠️ 本提交含 AI-A 此前保存的累积改动（calendar/chat/default-cards/feed/mail/group-chat/template/smoke-group-chat.mjs），已一并构建验证，请确认无遗漏。

### 2026-08-21（用户反馈 iOS Safari「加了自定义聊天字卡后，信箱联系人主动写信全用自定义、不用默认字卡」+「默认字卡设置页缺少主字卡/颜文字/emoji/拍一拍单独开关」）
- [AI-A·完成]（源码随 9dc9557 已入库并构建，**本会话自建 diag-mail-default-mix.mjs 10/10 + verify 10/10**）：`src/js/mail.js` + `src/js/default-cards.js` + `src/js/chat.js` + `src/js/feed.js` + `src/js/calendar.js` + `src/template.html`。
  - **信箱只发自定义字卡根因**（mail.js mailCardPool）：默认字卡只在「分类为空」时补池（`if(!text.length)` 等）——用户加了自定义文字卡后 text 非空，默认字卡永不进池 → 来信 100% 自定义。修复：默认字卡改独立子池（defText/defKaomoji/defEmoji），写信时**每张卡按 dc-overall（默认30%）+ dc-prob-* 分类占比混入默认字卡**（与聊天 getDefaultCards 同语义；拍一拍分类不进信件）；无自定义字卡时保持整体回退默认池的原行为；颜文字/emoji 尾部附加在自定义空时回退默认池。
  - **分类开关新增**（template.html + default-cards.js）：默认字卡设置页「使用默认字卡」下新增「分类使用」组——主字卡/颜文字/emoji/拍一拍 4 个独立开关（dc-cat-<k>，默认开）。关闭分类后：聊天混入（getDefaultCards 权重置 0）、信箱混入/补池、朋友圈补池、聊天字卡池兜底、performPoke 拍一拍抽取、日历每日留言 全部跳过该分类。
  - 验证：diag-mail-default-mix.mjs 10/10——场景A（有自定义卡+全开）信件 20 卡=12 自定义+8 默认（3 主+4 颜+1 emoji）混用；场景B（关 dc-cat-main）默认主字卡归零、颜/emoji 仍混；场景C（关 dc-use-mail）无任何默认卡；UI 4 开关存在/默认开/点击翻转 defaultCardCat+落库；verify 10/10。
  - ⚠️ **tools/diag-mail-default-mix.mjs 工作区有修复版未提交**（已提交版是中间稿：自定义卡仅 3 张 + 分类正则 `\s` 在模板串中被转义成 `/s+/` 导致中文不切分）。修复版：20 张卡 + 正则改 `/\\s+/`，即本会话 10/10 通过版本——下次提交请带上。

### 2026-08-21（用户反馈 iOS Safari「多个桌面联系人时，信箱在哪个角色页面就显示全部是这个角色来信，分不清谁是谁」）
- [AI-B·完成]（**已构建 verify 10/10 + 专项 8/8，待提交**）：`src/js/mail.js` + 新脚本 `tools/verify-mail-isolation.mjs`。
  - **根因**：mail.js contact-switched 权威加载的 idbGet 回调没有桌面归属校验（启动路径有 activePrefix 校验、切换路径漏了）。iOS Safari IndexedDB 慢时，旧桌面的 idbGet 在用户已切到新桌面后迟到返回，mailMergeFromIdb 用动态 store（当前桌面）把旧桌面的信合并写进新桌面 → 串桌面，信箱列表全显示成当前角色名。
  - **修复**：① mailMergeFromIdb(v, cid) 支持显式 cid，读写/快照绑定该桌面；② contact-switched 捕获 switchedCid，idbGet 回调 + catch + 15s 保险丝均校验归属（已切走则作废，新桌面监听会重新发起权威加载）；保险丝同时避免旧桌面误把新桌面 mailDbReady 置真。
  - 验证：verify-mail-isolation.mjs 修复前 6/8（cX 信箱混入 default 的信，精确复现串桌面）→ 修复后 8/8（cX 信箱只含自己的信、信箱页仅 1 封）；verify 10/10。
  - ⚠️ AI-B 越界代修 AI-A 名下 mail.js（用户直接反馈；改动带 v3.8.x 注释 + 回归脚本）。本提交含 AI-A 未提交累积改动（bg-keep 后台保活全局化 / chatcard 导入增强 / music-player / template / setting.css / diag-mail-default-mix 修复版），请确认。

## 2026-08-21 聊天昵称/头像独立设置（AI-B 构建，f5d90ab 已提交）
- 需求：桌面联系人昵称/头像、我的昵称/头像 与 聊天内 独立设置。
- 现状：v3.8.x 已有聊天设置页 cs-lbl-*/cs-avatar-* 独立入口，但聊天页内大量场景仍读桌面键，导致设置不生效/不一致。
- 本次：聊天域统一读聊天专用键（cs-lbl-*/cs-avatar-*），**未设置回退桌面键**（lbl-*/avatar-*）——平滑升级、未单独设置时与桌面一致。
  - chat.js：新增 chatPartnerName/chatUserName（cs→桌面→默认）；fillAvatar 加 cs-avatar-* 回退桌面；updateChatPartnerName 加 lbl-partner 回退；替换拍一拍(1490/2811/2875/2986)/红包(1198/3183)/猜拳(3102)/邀请(4003)/搜索(4176)/通话面板(4289)/拨打兜底(4387)/收藏页(4649) 16 处；桌面横幅 1667/1731 保持桌面键。
  - 延伸（均聊天页内功能）：divination storeName、decision partnerName、pong 对手名、avatar-lib 半框标题与聊天系统消息（头像库仍写桌面键 avatar-*，通知 bgNotifyCheck 保持桌面键）。
  - chat-settings.js：cs 昵称未设置时 val 显示「跟随桌面（xx）」。
- 未提交：tools/diag-gc-refresh*.mjs（AI-A 新诊断脚本，未跟踪，留给对方确认）。
- 构建 verify 10/10。

### 2026-08-21（用户反馈「聊天设置里想新增时间轴样式，现在只有头像下一种」）
- [AI-B·完成]（**已构建 verify 10/10 + 专项 9/9，已提交 65ca475**）：`src/js/chat.js` + `src/js/chat-settings.js` + `src/css/chat-main.css` + 新脚本 `tools/verify-time-divider.mjs`。
  - **背景**：时间轴样式（6 种：头像下方/气泡下方/时间气泡/气泡外侧悬浮/消息上方居中/隐藏）在本地工作区已实现但未提交未部署，用户线上看到的是旧版（只有头像下方）——本次提交一并让线上拥有全部样式。
  - **新增第 7 种「时间分隔线」（divider，微信式）**：消息间隔 ≥5 分钟或跨天时，在消息流中插入居中时间胶囊（「下午 3:24 / 昨天 下午 3:24 / 8月20日 / 2025年8月20日」），首条消息必插（时间不被隐藏）；聊天页 #chat-body 的 .msg-time 隐藏，**收藏页 #fav-list / 群聊 #gc-body 不含插入逻辑、msg-time 保留不受影响**（CSS 作用域限定 #chat-body）。
  - **实现要点**：divider 是唯一有 DOM 插入的样式，不能纯 CSS 即时生效——chat.js 暴露 `window.chatReRenderTime`（重渲染补插），chat-settings.js 弹窗回调切到 divider 时调用；.msg-time-divider 默认 display:none（切走样式自动隐藏不占布局），批量渲染（renderWindow 循环）与增量追加（addRec）两个路径都接 maybeInsertDivider。
  - 验证：verify-time-divider.mjs 9/9（分隔条数量/首条日期文案/msg-time 隐藏/增量补插/切回 CSS 隐藏/即时重渲染/收藏群聊隔离）+ verify 10/10。
  - ⚠️ 本提交含 AI-A 累积改动（聊天批量渲染发送贴底 pendingOutScroll / 字卡池分类开关 catOn / IDB 切换挂起 / verify-chat-scroll-bottom、verify-chat-switch-idb-hang、verify-invite-settings、verify-mail-send-reply），已一并构建验证，请确认。
  - ⚠️ 编辑期间 chat.js 有并发修改（21:57 AI-A 的 pendingOutScroll 等），我按 21:59 快照编辑，构建前全量 node --check 通过；若对方 21:59 后还有新改动未提交，请自行 commit。

### 2026-08-21（用户反馈：聊天更多功能「问问ta」点击单选题后，问题输入栏输入文字飞出输入栏）
- [AI-B·完成]（**已构建 verify 10/10 + 专项诊断通过，未提交**）：`src/css/chat-pages.css`（AI-A 域，AI-B 越界代修）。
  - **根因**：`src/css/chat-pages.css` 的 `.ta-add { display:flex; gap:8px; }` 缺 `flex-wrap:wrap`；`.ta-add .ta-opts` 是 `flex:1 0 100%`（grow 1, **shrink 0**, basis 100%）。单选切换 textarea 从 hidden 变显示时，flex 容器默认 nowrap，textarea ce-box 占据整行宽度且不允许压缩，同行问题输入框 ce-box（`flex:1`）被挤成 **25px 宽窄条**，文字在窄条内竖排溢出——视觉即"文字飞出输入栏"。
  - **旧修复（v3.7.x `.ta-add .ce-box:focus { transform:translateZ(0); }`）治标不治本**：只动合成层位置表象，未治挤压根因，对窄框场景无效；且 iOS 不转 ce-box（原生 input 同样被挤窄）——旧修复漏了 iOS。
  - **修复**：① `.ta-add` 加 `flex-wrap:wrap`；② `.ta-add .ta-opts` 去掉 `margin-top:8px`（gap 已提供行间距，避免 16px 双间距）。`askAddFormHtml` DOM 结构未动。
  - **诊断工具** `tools/diag-ta-ask-single-input.mjs`：注入一条自定义问题 + 选单选 + 输入文字，比对 boxRect/textRect。修复前 w:25 h:156（窄条）/textRect w:13 h:134（竖排）；修复后 w:251 h:39（正常）/textRect w:91 h:17（横排），optsBox top 953 > inpBox top 906 换行到第二行 ✓。
  - 验证：verify 10/10 + diag-ta-ask-single-input 实测 ✓。未提交。
  - ⚠️ AI-B 越界代修 AI-A 域 chat-pages.css（用户直接反馈 + 与 ta-ask.js askAddFormHtml 强相关）。本提交如一并提交将含 AI-A 上一轮未提交改动（music-player.js 的网易云代理更换 + mobile-adapt.js 上一轮未提交键盘 pinUntil 修复），请确认。

### 2026-08-22（用户反馈：开屏加载时间变长、一直卡在加载进不去）
- [AI-B·完成]（**已构建 verify 10/10 + 已提交 596dedc**）：`src/js/garden.js`（AI-A 域，AI-B 越界代修）。
  - **根因**：`partnerAct()` 插入新分支（浇水/一键浇/摘花/一键收/施肥）时，分支链中残留一个孤立右括号 `}`，导致后续旧分支 `} else if` 悬空 → `SyntaxError: Unexpected token 'else'`。整包 JS 合并进单文件后一个语法错误=全部脚本不执行 → `__mochiDataReady` 永 false → 开屏永久卡加载（AGENTS.md 已知坑复现）。
  - **修复**：删除孤立 `}` 让分支链连通；顺手清理被新分支完全覆盖（r<0.55/0.75/0.9 已被 r<0.35/0.50/0.65/0.78/0.90 全覆盖）的 3 段不可达旧分支死代码。
  - 提交 596dedc 同时含：chat.js 花朵卡片美化（msg-flower-bar/divider 新 DOM + 诊断 toast 清理）、ta-ask.js 题库微调、chat-main.css 花卡样式 + 构建产物。
  - ⚠️ 遗留：`tools/.probe-chat-layout.mjs`、`tools/diag-ta-ask-single-input.mjs` 未跟踪未提交，建议加 .gitignore 或删除。

- 2026-08-22 00:58: 修复真我手机Edge导出/导入完全无反应（7caf65f 已构建提交）——导出改三级降级(navigator.share→showSaveFilePicker→a[download]挂DOM)，导入input挂DOM再click；涉及 src/js/data-backup.js

- 2026-08-22 01:05: 用户反馈「导入提示 备份文件里没有 mochi数据（键前缀不匹配）」——该文案是 db91f6b 之前的旧版硬校验；db91f6b 已改前缀兼容（探测→键尾匹配→重写导入）。本会话再修兼容分支三处残留缺陷（**已随 6dde750 提交**，并行会话 git add -A 带入，verify 10/10 + 前缀单测 10/10）：① mochiKeyTails 从 v3.6 初期 13 键扩充到 v3.6~v3.9 全量（群聊 gc-*/占卜 divine-*/每日小记 quote-history/memo-*/摸鱼工作 day-fish-*/work-day-add 等新键缺位会误拒）；② 新增多桌面命名空间结构判定 deskHit（键去掉前缀后第一段是 default: 或 c<数字>:，mochi 独有，覆盖"备份只有新功能键"场景）；③ app 标识不匹配但键前缀 xy-home-v2:（mochi 独有前缀）时放行导入（原实现直接拒绝 fork/手改 app 字段的备份）。

### 2026-08-22 20:30（用户反馈：华为 Mate 60 Pro 夸克浏览器·自定义字卡批量导入多行变 1 卡）
- [AI-B·完成]（**已构建 verify 10/10 + verify-cc-batch-import 13/13 + verify-ck-question 18/18，未提交→本次提交**）：src/js/mobile-adapt.js（AI-B 域）。
  - **根因**：安卓下批量导入弹窗 #modal-textarea 被转成 ce-box（white-space:pre-wrap，Enter 插入的是**字面 \n 文本节点**，屏幕可见分行）；多行取值原依赖 box.innerText——夸克内核的 innerText 实现会丢掉文本节点里的字面 \n（读回一行）→ 批量导入「一行一个」全部并成 1 张卡。
  - **修复**：① 新增 ceMultiText(box)——按 DOM 结构还原换行（text 节点保留字面 \n、<br> 一次换行、div/p/li/pre/blockquote 前后补换行）；② value getter 多行分支 = innerText 与 DOM 遍历版**取换行更多者**（标准内核两者一致，夸克走遍历版）；③ value setter 回填改 textContent 直写（pre-wrap 字面 \n 即换行显示，不再依赖 innerText setter 的 \n→<br> 转换）。受益面：所有多行 ce-box（批量导入、帮我决定选项、聊天题库选项、美化方案粘贴等）。
  - **验证**：tools/verify-cc-batch-import.mjs——字面\n / div 分行 / br 分行 / 夸克模拟（覆写 innerText 丢换行）/ setter 回填往返，5 组用例全部导入为独立字卡。
- [AI-B·代修]（AI-A 域，随本次提交）：src/js/ta-ask.js——tc/tcu/tr 三段 TabsWrap 绑定代码各被重复粘贴第二份（const 重复声明 SyntaxError → **整包 JS 不执行、开屏卡死、verify 全挂**），已删除重复块（纯机械去重，无逻辑改动）。
- 本次提交同时包含上一轮未提交改动（ta-ask 单选切换 textarea 挤压修复 chat-pages.css、mobile-adapt 键盘 pinUntil 闪屏修复）与 AI-A 累积未提交 src 改动（chat.js/feed.js/mail.js/contacts.js/chat-settings.js/default-cards-data.js/bg-keep.js/call.js/fullscreen.js/ta-ask.js/home.css/template.html 及 tools/fix-kaomoji-chars.mjs），构建产物一并入库。

### 2026-08-22（用户反馈：iOS 信箱里联系人回信一直不触发）
- [AI-B·完成]（**已构建未提交**，mail.js 为 AI-A 域、用户直接反馈故越界代修，改动仅 mail.js）：
  - **根因**：TA 回信计划（mail-reply-pending）只由「启动后 20~60s 随机延迟 + 每 60s 定时器」的 checkPendingReply 落地。iOS 后台/锁屏冻结全部页面定时器、主屏 PWA 很快被杀，会话经常短于 20~60s 首查延迟 → 到期回信永远等不到落地时机，表现为「回了信/寄了信，联系人回信一直不触发」。逻辑本身无 bug（verify-mail-send-reply 8/8 一直通过），是触发时机对 iOS 不友好。
  - **修复**：补查不再依赖唯一定时器——①启动立即 checkPendingReply；②mailDbReady 权威加载完成回调/15s 保险丝/切桌面回调+保险丝共 4 处置真后补查；③visibilitychange(可见)/pageshow(bfcache)/focus 节流 5s 补查（含 maybeIncomingLetter，其自身 last/next 时间窗+每日上限守卫防刷屏）；④openMailPage 打开信箱即补查。
  - **防护**：checkPendingReplyFor/maybeIncomingLetterFor 对当前桌面加 mailDbReady 守卫——权威加载前 load(cid) 可能来自剥图快照，落地/来信写回会把 IDB 带图信件覆盖成 [图片] 版（顺带消除 60s 定时器在启动 0~15s 窗口的同款隐患）。
  - **回归**：新增 tools/verify-mail-ios-reply.mjs（6/6：重载 5s 内落地 / visibilitychange 1.5s 内落地 / 开信箱即落地+标签）；verify-mail-send-reply 8/8、verify-mail-isolation 8/8、verify 10/10 全通过。
  - ✅ mail.js 修复与构建产物已随 8fd0699 入库；本次追加提交：verify-mail-ios-reply.mjs 回归脚本入库 + 删除临时探针 tools/diag-mail-load.mjs。

### 2026-08-23（用户反馈：帮我决定完成后黑色弹窗不消失，很多黑色提醒弹窗不会自己消失）
- [本会话·完成]（**已构建，待提交**）：src/js/music-player.js + src/js/chat.js（均 AI-A 域）。
  - **根因**：全站 20+ 个模块各自定义 	oast() 共用同一个 #cc-toast DOM 元素。music-player.js 与 chat.js 的 toast 额外设了内联 	.style.opacity='1'（v3.6.x 为 QQ 浏览器 X5 内核 CSS 动画不执行加的兜底），但其余模块（decision.js/ta-ask.js/feed.js/mail.js 等）的 toast **不清内联 opacity**。当 music-player/chat 的 toast 设了内联 opacity=1 后，2s 回调未触发前被其他模块 toast 打断（clearTimeout(t._timer) 清掉回调），其他模块的 timer 回调只 	.className='cc-toast' 移除 show class、不清内联 → 残留的 style.opacity='1' 优先级高于 CSS #cc-toast{opacity:0}，toast 永久可见。「帮我决定已完成」是 decision.js 的 toast，恰是受害者。
  - **修复**：music-player.js 与 chat.js 的 toast 不再设内联 	.style.opacity，开头先 	.style.opacity='' 清残留，timer 回调只 	.className='cc-toast'。统一只操作 className，靠 CSS 动画 ccToastAutoHide 2.6s forwards + JS timer 双兜底自动消失。其余模块无需改动（本就不操作内联 opacity）。
  - **验证**：新增 	ools/verify-toast-cross-module.mjs 5/5——A 修复后跨模块 toast 最终 opacity=0 不可见；B 反向用例（模拟旧版肇事 toast 设内联 opacity=1 不清 + decision toast 打断）opacity=1 残留可见，证明根因诊断正确；C 单次 toast 显示 opacity=1 / 2.6s 后 opacity=0。
pm run verify 10/10。
  - ⚠️ 未提交：工作区有 26 个文件未提交改动（含 AI-A 累积改动与 AI-B 累积改动），本次只改了 music-player.js / chat.js 两个文件的 toast 函数 + 新增 verify 脚本。构建已执行（index.html/sw.js/version.json 已更新），待用户确认后统一提交。

### 2026-08-24���û����������ָ�Ĭ�����桿�İ���ʵ����Ϊ������
- [AI-B�����]��**�ѹ��� verify 10/10 + �﷨���ͨ����δ�ύ**����src/template.html����971�и����⣺�ġ��ָ�Ĭ�ϲ�����ҳ������+ src/js/personalize.js�������İ�ȥ�����������ҳ�汳��ͼ���Զ��岼�֡����Ƴ�ѭ����� page-bg-* ����ͼ���������ָ�ҳ���� desk-layout����Ƭ���֣��������û������ǻָ����沼�ֺ�ҳ�������ǻ�����ͼ��ͼ�꡹��
- ��֤��
ode --check ͨ�� + verify 10/10��


### 2026-08-24（用户需求：字卡库【图片】【表情包】+ 表情包面板「我的表情包」支持链接导入图片/批量链接导入）
- [本会话·完成]（**已构建 verify 10/10 + verify-link-import 19/19，未提交→随工作区待提交批次一起提交**）：src/js/chatcard.js、src/js/chat.js、src/js/feed.js、src/js/mail.js、src/template.html + 新增 tools/verify-link-import.mjs。
  - **功能**：两处新增「链接导入」入口——①字卡库工具行 cc-import-link（仅【表情包】【图片】分类生效，其他分类 toast 引导）；②表情包面板我的表情包工具行 mye-add-link。弹窗一行一个 URL（自动去尖括号/引号包裹、http(s) 校验、批量去重），单链接=批量 N=1。
  - **存储策略（混合）**：优先 fetch(CORS,12s 超时) 抓取→与上传同一压缩管线转存 dataURL（字卡库图片 720 JPEG/表情 480 PNG、我的表情 260 PNG、GIF 直存原图≤8MB），离线可用；图床不允许跨域读取或解码失败→回退存原始 http(s) 链接（需联网显示）；响应非 image/* 判失败不落库。结果 toast 分类统计（转存 X 个/按链接保存 Y 个/重复/失败）。
  - **放行链路的配套修改**：chatcard cardItemHtml 缩略图+点击大图、getMediaCards/getMediaGroups/getMediaCardsFor 过滤器（isMediaImg：data:image 或 ^https?:// 且无引号尖括号空白——维持 json 导入白名单的防 src 属性注入保证，RE_MEDIA_URL 并入导入校验）；chat.js extractDeskMsg 后台通知占位、引用块 qimgs 兜底/qtext 占位；插入信纸模式点击链接表情拦截并提示（信件正文 data:image 正则不认 URL）。
  - **保持旧行为（过滤非 dataURL）**：feed.js cardPool TA 配图 + comStickerGroups 朋友圈表情选择；mail.js taLetterContent TA 信件附表情——这些场景把图片拼进正文文本，URL 会显示成文字，后续如需支持再扩 feed/mail 正则。
  - **修复过程中踩坑**：runLinkPool 初版链式写法把 worker 结果丢成 undefined（res.st TypeError 静默卡住导入），改为按原始下标回填 out[idx] 再 Promise.all().then(()=>out)。
  - **回归**：tools/verify-link-import.mjs 19 项全过——fetch 打桩四类图床（成功转存/CORS 拒绝回退/非图片失败/挂起超时回退）、重复行去重、缩略图渲染、TA 回复池可用、GIF 直存、面板网格渲染、插入模式拦截与放行、空分类无副作用。
- ⚠️ 提交提醒：工作区累计未提交改动含上轮（toast 跨模块修复等 26 文件）+ 本轮链接导入（6 文件+1 新脚本），构建产物 index.html/sw.js/version.json 已随最新构建更新，待用户确认后统一提交。

### 2026-08-24（续：链接导入四项优化——并发池/防重复提交/http 升级抓取/分组路由）
- [本会话·完成]（**已构建 verify-link-import 22/22 + verify 10/10，仍未提交**）：src/js/chatcard.js、src/js/chat.js。
  - **优化1**：「我的表情包」链接导入由串行改并发池（runLinkPool 并发4，与字卡库同实现）——此前一个慢图床（12s 超时）会拖死整批。
  - **优化2**：两处导入加 busy 防重复提交标记——批量抓取进行中再点「链接导入」toast 提示且不弹窗，防止两批交叉写同一分组导致跨批重复入库；完成/出错双路径都会复位标记。
  - **优化3**：https 页面下 http:// 图链先自动升级 https 试抓（混合内容拦截规避），失败再按用户粘贴的原始链接兜底保存；结果 toast 追加「含 X 个 http 链接，本站可能拦截不显示」。注：无头环境是 http 页面，该分支未做运行时断言，逻辑为纯字符串替换+条件分支。
  - **优化4**：链接导入弹窗支持「目标分组」下拉（openModal opts.groups，与文字批量导入对齐）+ 行首【组名】前缀路由；落点优先级=行前缀 > 下拉 > 当前选中分组 > 分类默认分组（表情包/图片/「默认」），与文字导入「前缀行永远进自己的组」语义一致。顺带行为变化：chat.js 无选中分组时不再回退到「第一个分组」而是建「默认」（与字卡库口径一致，有下拉后更可预期）。结果 toast 新增新建分组数。
  - **回归**：verify-link-import 扩至 22 项——新增 A2b 防重复提交拦截、A9 【组名】前缀路由、A10 下拉选组生效；打桩改为 canvas 现生成四种颜色 PNG（字节互异，避免压缩结果相同撞去重断言）。

### 2026-08-24（用户需求：聊天设置「音乐悬浮小窗」开关改「隐藏」语义——原文案与功能方向都反了）
- [本会话·完成]（**已构建 verify 10/10 + 新增 verify-cs-music-hide 14/14，未提交→随工作区待提交批次一起提交**）：src/template.html、src/js/chat-settings.js + 新增 tools/verify-cs-music-hide.mjs。
  - **问题**：聊天设置原开关叫「音乐悬浮小窗」且勾选=开启；用户定义该功能应为「隐藏音乐悬浮小窗」（勾选=隐藏，与同页「隐藏通话小框」语义一致），文案与联动方向均反。
  - **修复**：template.html 文案改「隐藏音乐悬浮小窗」（注释同步）；chat-settings.js cs-music-float 联动反转——mfGet 返回 !floatEn（默认不隐藏）、mfSet(hide) 写 musicFloatSet(!hide)，并补 toast 反馈（已隐藏/已恢复显示）。底层状态仍是 music-global.floatEn（每桌面独立），与音乐页 #music-float-en、音乐设置 #sm-set-float 完全同源，这两处保持勾选=开启不变。
  - **回归**：verify-cs-music-hide.mjs 14 项全过——文案、默认不隐藏、勾选→floatEn=false+toast、700ms 轮询不回弹、刷新持久化、外部 musicFloatSet(true) 自动同步取消勾选、完整来回恢复 floatEn=true。

### 2026-08-24（用户需求：不同桌面的【花园】数据还是分开好，每个我和联系人的花园是独立的）
- [本会话·完成]（**已构建 verify 10/10 + 新增 verify-garden-desk 9/9，未提交→随工作区待提交批次一起提交**）：src/js/garden.js、src/css/garden.css + 新增 tools/verify-garden-desk.mjs。
  - **需求反转**：2026-08-22 曾按用户要求做「全球园」（header 注入 🌐全部/🔄重新合并按钮，把所有联系人花园合并成一份可操作副本存 xy-home-v2:garden-data-global）；本次用户明确要各桌面花园独立，故整体移除全球园功能。数据层本就是按联系人命名空间存的（xy-home-v2:<cid>:garden-data），各桌面原始数据从未被合并改写过，本次纯删视图层+清缓存，零数据丢失。
  - **实现**：garden.js 删除 G_GLOBAL/gs/isGlobal/curStore/curKey/curIdbKey 及 ensureGlobalUI/toggleGlobal/remergeGlobal/doRemerge/mergeAllToGlobal/loadGardenAsync/loadAllGardensAsync（约140行）；buildPlotInner/renderGrid 去掉全球园「来源@联系人名」标注分支；openGarden 与 contact-switched 处理器去掉 isGlobal 回切；load/save 直接读写 activeStore 的 garden-data（IDB 键 xy-home-v2:<cid>:garden-data 不变）；garden.css 删 .garden-ov-btn/.garden-remerge-btn/.garden-merge-tip/@keyframes gardenMergePulse/.garden-plant-src。window.gardenBloomDates 保留（本就读各桌面独立数据）。
  - **旧缓存清理**：garden.js 启动同步阶段一次性删根键 xy-home-v2:garden-data-global（xyStore.remove 清 memoryCache+LS+IDB 三处），早于 restore-done 后的 migrateLegacy 异步迁移跑，不会被误迁进 default 桌面（verify A2 有断言）。⚠️ 在全球园副本里浇水/收获过的临时进度随缓存清除（原本就未回写各桌面）。
  - **回归**：tools/verify-garden-desk.mjs 9 项全过——旧根键清除+default 无迁移副本、全球园按钮不存在、双桌面种子读隔离（玫瑰15EXP vs 向日葵28EXP）、ctest1 施肥只写本桌键且 default 键逐字节不变、切回 default 玫瑰原样无串桌记录。种子带 lastLoginDay/lpc/watered/daily 守卫 + Math.random 桩 0.99，屏蔽登录奖励/梦角打理/访客等随机写入保证字节级对比稳定。

### 2026-08-24（用户反馈：①网易云导入歌单歌曲过多时音乐时长不显示；②音乐封面莫名其妙被放大、不显示完整）
- [本会话·完成]（**已构建 verify 10/10 + 新增 tools/verify-music-dur-cover.mjs 9/9，未提交→随工作区待提交批次一起提交**）：src/js/music-player.js、src/css/chat-pages.css。
  - **① 时长全 00:00 根因**：旧 runDurProbe 的 running 标志在 enqueue 同步循环中被「排空队列的多余 next()」提前清掉，之后每首歌各自再起一批「并发4」→ 大歌单几百条 `<audio>` 同时探测，12s 超时内大多抢不到连接全部失败（小歌单看不出来）。改为真正的 worker pool（durProbeActive 计数 + pumpDurProbe 泵，任意时刻恒定 ≤4 并发）。附带：批量补时长/封面原来逐条 saveLibrary＝O(n) 次全量序列化大曲库会卡，新增 saveLibrarySoon()（1.5s 节流合并成一次；中途退出最多丢最后一批，下次打开对仍缺时长的歌会重新探测自愈）。
  - **② 封面被放大根因**：meting 封面代理实测 302 → 网易云 CDN `?param=90y90`＝90×90 位图；正在播放行 `.sm-song.active .sm-song-ico { background:var(--ink) }` 是 background 简写且优先级(0,3,0)高于 `.sm-song-ico.has-cov`(0,2,0)，把 background-size:cover 重置成 auto——封面按原图自然尺寸画进 34px 缩略图＝只看到左上角局部，观感即「被放大、不完整」（播放哪首哪首的封面裁切，自定义上传封面同样中招）。chat-pages.css 新增更高优先级规则 `.sm-song.active .sm-song-ico.has-cov` 显式恢复 size:cover / position:center / no-repeat（dark.css 同名简写规则同样被压制，与加载顺序无关）。
  - **回归**：tools/verify-music-dur-cover.mjs 9 项全过——mock window.Audio 统计瞬时并发峰值=4（旧实现为 24 首全并发）、24 首时长全部写回曲库并持久化、打开音乐页列表显示 02:03、非激活/.active 行缩略图 computed background-size 均=cover。

### 2026-08-24（用户反馈：聊天「更多功能」里的功能打开后页面往下掉、下面全灰、功能页不在聊天页内）
- [本会话·完成]（**已构建 verify 10/10 + verify-more-panel-scope 30/30，未提交→随工作区待提交批次一起提交**）：src/css/chat-main.css + 新增 tools/verify-more-panel-scope.mjs。
  - **根因**：宽屏（PC 浏览器预览，视口 >900px）下 `.phone` 是居中的手机模拟框，而聊天全部悬浮层（`.more-panel` 更多功能面板 + `.poke-card` 各功能半框：帮我决定/搜索记录/通话/占卜/拍一拍/猜拳/红包/送礼物/问问TA/头像互动/表情包/Pong/贪吃蛇，以及 `.call-mini` 通话小框）是 `position:fixed`——锚定【浏览器窗口】而非 .phone。打开任一功能，面板整体掉到手机框外的窗口底部灰底区（用户描述「页面往下掉、下面全灰、功能页不在聊天页面中」）。手机端（≤900px）.phone 满屏所以从不复现。
  - **修复**：chat-main.css 末尾新增 `@media (min-width: 901px) { html:not(.force-mobile) .more-panel, .poke-card, .call-mini { position:absolute; } }`——absolute 锚定 `.phone`（position:relative；面板各祖先 .page 等均未定位，已核实 DOM 链 .phone > #page-chat > .poke-card），left/right/bottom 声明沿用原值，宽屏视觉与手机端一致。`html:not(.force-mobile)` 排除「手机伪装桌面 UA」场景（真机仍走 fixed 原路径零改动）；Pong/贪吃蛇 `-fs` 全屏变体（#id.pong-fs 特异性更高）不受影响；平板 html.tablet 下 .phone 满屏，absolute 与 fixed 等价。
  - **验证**：tools/verify-more-panel-scope.mjs 30/30——1280×900 宽屏打开 6 个入口，面板矩形全部落在 .phone 内且贴输入栏上方（修复前 left=18 锚窗口、横跨全窗宽）；390×844 手机端回归行为不变（left=18/36、bottom=innerH-96）。npm run verify 10/10。
  - **已知边界（未改）**：`#cc-toast`、`.cc-manage-bar`（字卡库管理条）、`.music-batch-bar`（音乐批量条）挂在 body 下（.phone 外），宽屏下仍锚定窗口；均为次要浮层非本次反馈范围，后续如需可改 JS 挂载点到 .phone 内。

### 2026-08-24���û��������㡸�ָ�Ĭ�����桹�����ҳ�¹���ͼ���Կ�������
- [AI-B�����]��**�ѹ��� verify 10/10 + ����ָ�ר�� 10/10��δ�ύ**����src/js/personalize.js��AI-B �򣩡�
- **����**���û��� desk-layout ���������汾��̬ע��ĵ���ҳͼ�꣨��ˮ/��ʲô/ͬƵ/�����ӵȣ���pplyDeskLayout �Ѳ����������ս� #desk-widget-pool���ָ�Ĭ���߼�ֻ�һ� p3apps/desk-period��������ͼ�����ڳ��� �� �û�����������û�ָ�����
- **�޸�**���ָ�Ĭ�ϻص����� uildDeskPages() ֮��������سأ���ģ��Ĭ��Ӧ�е��������Ż�Ĭ��ҳ����apps/p2apps/p3apps �����Ȼ�λ���ٴ��� deco/quote/checkin/music/memo/week/weekend/desk-period ������ pp-* ͼ�꣨�������ҳ p3apps ���񣩣�desk-clock/calendar/timer/anniv ���ĸ�ģ��Ĭ�Ͼ��ڳ��еġ�δ���ӡ��������ԭ״��
- ��֤��
ode --check ͨ�� + verify 10/10 + verify-desk-reset-period 10/10�������ȷ�ϣ��ɲ��������ӹ��¹���ͼ���㡸�ָ�Ĭ�����桹������ҳӦ�ܿ�����ˮ/��ʲô/ͬƵ/�����ӵ�ͼ�ꡣ


### 2026-08-24（用户反馈：手机端保活有问题——音乐放着浏览器挂后台，突然音乐停了，切回前台才恢复播放）
- [本会话·完成]（**已构建 verify 10/10 + 新增 tools/verify-music-bg-resume.mjs 10/10 + verify-music-dur-cover 9/9 回归仍过，未提交→随工作区待提交批次一起提交**）：src/js/music-player.js。
  - **根因**：手机浏览器/系统在页面切后台后会因省电、音频焦点抢占、渲染进程冻结等暂停 `<audio>`（用户没点暂停）；旧代码只有 armAutoResume「等用户手势」兜底，后台毫无反击——回前台能"自己恢复"全靠冻结解除后 ended/checkAutoEnd 补处理的运气（也解释了为何"切到前台才恢复"）。bg-keep 的保活音频只能降低冻结概率，拦不住系统级音频打断。
  - **修复**：music-player.js 引入「意图播放」标记 wantPlay——只有用户主动暂停（toggle 暂停分支）、真正停止（本地文件加载失败/外链失败/内置旋律失败等 toast 失败路径）、来电 hold（musicHoldForCall(true)）才清除；其余 pause 一律视为外部打断：① 后台按 300ms~1.5s~5s~12s 退避定时补播（tryResumePlayback/scheduleBgResume）；② 补播三级降级＝原元素 play()（保留进度）→ muted 静音解锁 → 重建 audio 元素（X5 缓存 rejection 兜底，同 armAutoRetry 思路，仅限外链歌）；③ 回前台 visible/focus/pageshow 立即补播（200ms 延迟，覆盖"完全冻结定时器停摆"场景）；④ 10s 看门狗在 hidden 下周期拉起；⑤ 连续失败封顶 6 次（onplay 清零）防死链被看门狗无限重拉。全程静默不弹 toast。
  - **回归**：tools/verify-music-bg-resume.mjs 10 项全过——mock Audio 的 systemPause()（不经 pause() 直接打断+派发事件）模拟系统行为：点击列表真实起播后，切后台被打断 1.5s 内自动续播、用户暂停后不被打扰、回前台立即恢复、来电 hold 不抢播且释放后恢复、ended 未处理时自动重建元素续播。

### 2026-08-24（用户反馈：①聊天时正常听歌也会突然中断并弹「点击播放被浏览器拦截」；②导入歌单需要自动去掉 VIP 歌曲）
- [本会话·完成]（**已构建 verify 10/10 + 新增 tools/verify-music-vip-filter.mjs 6/6 + bg-resume 10/10 + dur-cover 9/9 回归全过，未提交→随工作区待提交批次一起提交**）：src/js/music-player.js。
  - **①「被拦截」误报根因**：歌播完自动切下一首 / 断链重试（retryWithHttpsUrl）/ 本地文件异步加载后补播等场景，`audio.play()` 都发生在**无用户手势上下文**里，严格内核（X5/Via/OPPO 等）直接 NotAllowedError——旧逻辑不分场景一律 toast「点击播放被浏览器拦截」+ 等手势，用户在聊天页听歌每切一首就弹一次。修复：新增最近手势时间戳（pointerdown/touchend/keydown/mousedown 捕获阶段记录），拒绝处理统一走 handlePlayReject 分流——4s 内有手势才弹提示；非手势静默走 armAutoResume（下次触摸即恢复）+ scheduleBgResume（定时补播先试，多数自动切歌直接救回）。
  - **② 歌单导入自动去 VIP**：两层过滤——(a) 前置：fetchNeteasePlaylist 的官方 v6 解析源自带 fee（1=VIP 专属、4=需购买专辑），importNeteasePlaylist 入库前直接跳过并计数；(b) 后置兜底：meting 源（主源）不带 fee——enrichImportedDurations 补时长的那趟 v6 详情现在顺带收集 fee（fetchV6Durations cb 增加 feeMap 参数），把**本次新导入**的 fee=1/4 曲目从库里移除（只动本批 addedIds，不碰已有歌曲；若正播到该曲则停止播放），toast「已自动移除 N 首 VIP/付费歌曲」。两处导入完成文案追加「VIP 歌曲 N 首未导入」，批量导入面板说明同步更新。注：v6 走 CORS 代理，代理全挂时 VIP 识别不可用（退化为旧行为，音频探测也会对 VIP 失败留 00:00）。
  - **回归**：tools/verify-music-vip-filter.mjs 6 项全过——stub meting/v6 接口驱动真实批量面板导入（1 VIP + 2 免费）：VIP 不入最终曲库、免费歌经 v6 快路径补出时长、toast 提示移除数；mock Audio rejectMode 验证无手势被拒不弹提示、pointerdown 后被拒正常提示。（排错记录：模板字符串裸插值 JSON 数组导致 `new Response([obj])` body 变 `[object Object]`，须 `${JSON.stringify(text)}` 嵌入。）

### 2026-08-24（用户反馈：朋友圈评论消失——昨晚 TA 动态下评论往返回复多个回合，次日只剩 1 条）
- [本会话·完成]（**已构建，verify 10/10 + 新增 tools/verify-feed-comment-merge.mjs 10/10（修复前跑旧产物实测复现：5条评论只剩2条），未提交→随工作区待提交批次一起提交**）：src/js/feed.js。
  - **根因**：feedMergeFromIdb 权威回读合并是 post 级「本地整条覆盖 IDB」（mergePosts(base, mergePosts(cur, pending)) 后者覆盖同 id）。而本地副本会陈旧：feed-posts 主键 >200KB 时 xyStore 只进 IDB 不进 LS，本地退化为剥图快照 feed-posts-snap；persistSnap 剥图后仍超 200KB 时【静默跳过不写】→ 快照从此冻结在旧时刻。下次启动合并时陈旧快照版本整条盖掉 IDB 里带全部后续评论的新版本，并随即 store.set 写回 IDB → 评论永久丢失（用户症状：多回合评论只剩冻结时刻的那一条）。iOS 存储压力清 LS 键 / 某次 LS 配额写失败同样触发同路径。
  - **修复①深度合并**：mergePosts 同 id 动态改为 deepMergePost——评论/回复按 ts|role|authorName|content 并集去重（带 replies 的一方保留并递归并 replies）、点赞并集、正文取未剥图完整版（剥图侧内联图被换 [图片] 必更短）、imgs/头像非空优先；任一侧新数据都不再被整条挤掉。load() 的 feedPending 合并同函数自动受益。
  - **修复②快照裁剪**：persistSnap 剥图后仍 >200KB 时按新→旧裁剪动态数（预算=逐条 JSON 长度+逗号，最终串 ≤200KB 精确成立），快照始终可写、始终含最新动态，不再冻结。
  - **回归**：tools/verify-feed-comment-merge.mjs 用 Page.addScriptToEvaluateOnNewDocument 注入 getter/setter 冻结的 idbGet/idbSet 受控桩（idb.js 后续赋值走 setter 被忽略）确定性复现「IDB 完整版×本地陈旧快照」：A 组断言权威合并落盘为并集（5 评论/3 回复/点赞并集/去重）、B 组页面渲染 5 条、C 组大列表(400条>200KB)发布后快照裁剪 ≤200KB 含最新不含最老、D 组后续保存不回退。npm run verify 10/10 无布局回归。
  - **备注**：mail.js mailMergeFromIdb 是相反优先级（base 非空时完全不读本地副本），无此 bug 类，未动。存量已丢的评论无法找回（IDB 已被覆盖+快照随后重写）；本次修复防复发。

### 2026-08-24（用户反馈：朋友圈发布评论会卡顿）
- [本会话·完成]（**已构建，verify-feed-comment-perf 18/18（跑两遍防抖）+ 旧回归 verify-feed-comment-merge 10/10 + npm run verify 10/10，未提交→随工作区待提交批次一起提交**）：src/js/feed.js。
  - **根因**：submitComment → renderVisible() 全量重渲染整个列表——所有卡片 HTML 字符串重建 + 全部 dataURL 配图 `<img>` 重新解码 + 全部事件重绑；重度图片用户主键 MB 级，发一条评论就冻结数百 ms~秒级（TA 回应定时器同路径再付一遍）。且每次 save 多付 1~2 次全量 JSON.stringify（persistSnap 先 stringify 探大小、结尾又 stringify 一次）+ render() 内部再 load() 全量 JSON.parse 一遍。
  - **修复①单卡局部刷新**：抽出主列表模板 postCardHtml(p,name) 与全部朋友圈页模板 postCardHtmlAll(p)（render/renderFeedAll 改为 map 调用），新增 refreshPostCard(pid)——只把该动态的卡片节点 replaceWith 新渲染的单卡并 bindEvents 重绑，其余卡片 DOM 原地不动（不解码图片、不重绑）；按卡片所在列表自动选模板（el.closest('#feed-all-list')），卡片不在当前列表时回退 renderVisible() 全量兜底。「单条动态变化」8 处调用点全部切换：submitComment 两分支、TA 回复我的回复定时器、TA 评论定时器、点赞、TA 回赞定时器、发布后 TA 首赞/首评定时器。发布新动态/删除/TA 自动发帖仍走全量渲染（需要插入/移除节点）。
  - **修复②persistSnap 单次序列化**：只做一次全量 stringify，超限裁剪才重串（原实现固定两次+裁剪循环逐条）；裁剪语义不变（verify-feed-comment-merge C 组回归通过）。
  - **回归**：tools/verify-feed-comment-perf.mjs——150 条含伪图 dataURL 的历史动态（≈9MB 主键走 IDB 大键路径）+ 目标动态；发评论前给全部兄弟卡片打 JS 属性标记，断言发评论/回复/点赞/TA 定时回应后兄弟节点标记原样保留（DOM 未整列表重建）、卡片总数不变、评论/回复内容入卡、落盘捕获包含新数据（8921KB 完整大对象）、快照 ≤200KB 已剥图。排错记录：①应用禁止回复自己的评论（role==='me' 直接 return），回复目标须用 TA 评论；②TA 回赞只作用于「我」的动态；③定时器作者名经 taFeedNameFor 实时取，空档案回退 'TA'，需种 lbl-partner/feed-ta-name 对齐；④until 轮询返回 -1 也是真值，条件必须布尔化。
  - **备注**：本改动只优化渲染路径，存储结构与合并逻辑未动，与上一条「评论丢失」修复完全兼容（其回归 10/10 复跑通过）。真机 iOS 性能无法无头验证，建议手机上实测发评论跟手度。

### 2026-08-25���û����ޣ�vivo Y35 + Edge ������ PC �ˣ����ֶ�����������������վ����
- [AI-B�����]���ѹ��� verify 10/10 + ���� verify-desktop-mode-force 8/8���湤���������ύ����src/js/mobile-adapt.js + ���� tools/verify-desktop-mode-force.mjs
  - **����**��v3.9.x �����С����� + screen.width<900�����û��� Edge������վ�㡹ģʽ�� screen.width ��αװ���������(��900) �� ����ʧЧ�� PC ��ǡ�
  - **�޸�**�������� UA/screen/�ӿ�αװӰ������������������� + UA �ѳ�����ϵͳ(Win/Mac/X11/CrOS) + (window.orientation ���� �� ������ pointer:coarse �� hover:none) �� ǿ���ֻ����֣�viewport ��д�� MQ ��δ����ʱ�ٸ�дΪ��ʽ���ؿ�(visualViewport.width��scale �������,200-899 �������)����֡������δ���вż� force-mobile �ౣ�ס�
  - **�ع�**��A ȫ��αװ/D �� orientation �� coarse+hover/C ��խ��·��/B ���������(.phone ���� 390px ���) ȫ����npm run verify 10/10��
  - ���ύͬʱ���� AI-A �ѱ���Ķ���group-chat.js(Ⱥ��Աͷ��� cs-avatar-partner ����)��p2-features.js(TA ����С��Ƶ�ʷſ� 45min/12��/35%)��avatar-lib.js(ͷ���Ķ�)+�������

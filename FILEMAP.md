# FILEMAP.md — 产物 ↔ 源文件映射表（多人 AI 协作）

> 目标：改功能 → 快速锁定 src 归属；回查产物 → 知道出自哪个源。分工归属见 `AGENTS.md`，构建顺序见 `build.mjs` 的 `jsFiles`/`cssFiles`。
> **以 `build.mjs` 的 `jsFiles`/`cssFiles` 数组和 `src/template.html` 锚点为唯一事实源；本表可能滞后，冲突以 build.mjs 为准。**

## 按功能 → 源文件（快速定位）
| 功能 | 源文件（src/） | 归属 |
|---|---|---|
| 全屏 / 移动端适配 / PWA | `js/fullscreen.js` `js/mobile-adapt.js` `js/pwa.js` `base.css` `pwa/` | AI-B |
| 全局样式 / 明暗主题 / 数据层 | `base.css` `dark.css` `js/idb.js` `js/data-backup.js` `js/contacts.js` | AI-B |
| 桌面美化 / 设置外观 | `js/desktop-slider.js` `js/personalize.js` `js/p2-features.js` `home.css` `setting.css` | AI-B / AI-A |
| 聊天 / 输入栏 / 字卡 / 群聊 | `js/chat.js` `js/chatcard.js` `js/default-cards.js` `js/group-chat.js` `chat-main.css` `chat-pages.css` `group-chat.css` | AI-A |
| 查岗 / 定位 / 互动 | `js/incoming-requests.js` `js/ck-question.js` `js/loc-lib.js` `js/ta-*.js` | AI-A |
| 日历 / 占卜 / 信箱 / 朋友圈 / 音乐 | `js/calendar.js` `js/divination.js` `js/mail.js` `js/feed.js` `js/music-player.js` | AI-A |
| 纪念 / 记账 / 经期 / 备忘录 / 花园 / 房间 / 漂流瓶 / 礼物 | `js/records.js` `js/accounting.js` `js/period.js` `js/memo-*.js` `js/my-arc.js` `js/garden.js` `js/room.js` `js/drift-bottle.js` `js/gift-shop.js` | AI-A |
| 小游戏 | `js/breakout.js` `js/connect-four.js` `js/coop-mine.js` `js/fishing.js` `js/memory-game.js` `js/pong.js` `js/snake-game.js` `js/cjian.js` | AI-A |

## 按源文件 → 产物（构建收口核对）
| 产物（根目录） | 由 src 生成 | 维护者 |
|---|---|---|
| `index.html`（CSS+JS 合并） | `build.mjs` 合并全部 `jsFiles`/`cssFiles` + `src/template.html` | 构建者 |
| `sw.js` / `version.json` | `build.mjs` / `src/pwa/sw.js` | AI-B |
| `manifest.json` | `src/pwa/manifest.json` | AI-B |
| `icon-*.png` | `src/pwa/` 图标 | AI-B |
| `notice.json`（线上公告） | `src/pwa/notice.json`（离线 `template.html` 同步一份） | AI-B |

## 哨兵映射（FIX_SENTINELS 的 needle → 源文件）
> 构建后由 build.mjs 自动体检；登记新哨兵时在此留一行，便于对照查源码。
| 编号 | needle 特征 | 源文件 | 说明 |
|---|---|---|---|
| | | | |
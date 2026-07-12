# 单套正式美术交付目录

项目只维护一套当前生效的正式美术，不提供运行时换肤。场景和公共图标的当前文件路径集中在
`client/src/config/visualAssets.ts`，替换时保留文件名和画布比例即可。

## 场景与公共资源

| 用途 | 当前文件 | 建议画布 | 拉伸规则 |
| --- | --- | --- | --- |
| 大厅背景 | `assets/generated-ui/citadels-main-lobby-background-v5.png` | 1920×1080 | cover，中心安全区不画文字 |
| 准备房背景 | `assets/generated-ui/citadels-ready-room-background-v3.png` | 1920×1080 | cover，中央保留座位区 |
| 对局背景 | `assets/generated-ui/citadels-game-table-background-v2.png` | 1920×1080 | cover，四周保留玩家区 |
| 王冠 | `assets/generated-ui/citadels-crown-icon-v1.png` | 透明方形 | contain，不拉伸 |
| 公告/帮助/设置/退出 | `assets/homepage-v1/icon-*` | 保留现有画布比例 | contain，不拉伸 |

颜色、圆角、阴影、面板和边框统一在 `client/src/styles/visual-tokens.css` 调整。

## 卡牌

- 角色正面：`assets/visual/cards/roles/{roleId}.webp`，共 9 张。
- 建筑正面：`assets/visual/cards/districts/{districtId}.webp`，共 65 张。
- 角色牌背：`assets/visual/cards/backs/role.webp`。
- 建筑牌背：`assets/visual/cards/backs/district.webp`。
- 所有卡面统一使用 2:3 画布，建议 600×900。
- 完整卡面模式可把费用和名称画入图片；安全文字区距离画布边缘至少 5%。
- 当前 `CARD_FACE_MODE` 为 `overlay`，缺少正式卡图时继续使用程序卡面。全部资源完成后改为 `baked`。

运行 `npm run verify:art` 可查看缺少的卡牌资源；正式交付验收使用 `npm run verify:art -- --strict`。

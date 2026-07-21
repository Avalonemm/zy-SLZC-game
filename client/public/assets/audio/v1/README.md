# 《富饶之城》正式音频包 v1

本目录只包含 2026-07-20 用户明确验收并授权接入的 24 个 WAV 文件。候选版、落选版和试听预演仍保留在 `output/audio-review/`，不得由游戏引用。

- 正式选择：17 个既有声音、7 个职业声音纹章。
- 明确静音：`ui-error`、`final-round`。
- 结束规则：只有结构化表现事件 `game_ended` 播放 `result-end.wav`。
- 循环规则：初始大厅与准备房共用 `amb-ready.wav`，切换时不重启；环境轨由运行时按清单循环窗口提前交叉衔接，跳过源文件的静音尾段。
- 许可：底层素材为 CC0 1.0 或项目原创；逐文件来源和原始试听文件见 `manifest.json`。
- 接入规则：游戏只通过 `client/src/audio/audioCatalog.ts` 引用本目录。

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const isRevisionR1 = process.argv.includes("--revision-r1");
const batchName = isRevisionR1 ? "round-01-revision-01" : "round-01";
const outputRoot = join(projectRoot, "output", "audio-review", batchName);
const roundOneOutputRoot = join(projectRoot, "output", "audio-review", "round-01");
const originalDir = join(outputRoot, "original");
const sourceDir = join(outputRoot, "sources");
const screenshotDir = join(outputRoot, "screenshots");
const shouldDownloadSources = process.argv.includes("--download-sources");
const shouldVerifyOnly = process.argv.includes("--verify");

const baseOnlineSources = [
  {
    id: "wood-click",
    title: "Wooden Click",
    author: "BenjaminNelan",
    page: "https://freesound.org/people/BenjaminNelan/sounds/321083/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "按钮确认、木槌触感"
  },
  {
    id: "metal-long",
    title: "long-metal-hit-01.wav",
    author: "newagesoup",
    page: "https://freesound.org/people/newagesoup/sounds/337832/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "错误提示、旧铜与军阀金属层"
  },
  {
    id: "card-shuffle",
    title: "Shuffle cards",
    author: "Breviceps",
    page: "https://freesound.org/people/Breviceps/sounds/447918/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "抽牌与洗牌"
  },
  {
    id: "paper-rustle",
    title: "Paper Rustle",
    author: "BenjaminNelan",
    page: "https://freesound.org/people/BenjaminNelan/sounds/353125/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "落牌、身份揭示中的纸张层"
  },
  {
    id: "coin-single",
    title: "Singular Coin Dropping.wav",
    author: "Flem0527",
    page: "https://freesound.org/s/630018/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "单枚金币"
  },
  {
    id: "coin-collect",
    title: "Coin - Rpg",
    author: "colorsCrimsonTears",
    page: "https://freesound.org/people/colorsCrimsonTears/sounds/566201/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "多枚金币与收入"
  },
  {
    id: "metal-bell",
    title: "Metal Bell Ringing",
    author: "michorvath",
    page: "https://freesound.org/people/michorvath/sounds/270587/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "皇冠落位、叫号、身份揭示"
  },
  {
    id: "sword-slash",
    title: "sword slash.wav",
    author: "ethanchase7744",
    page: "https://freesound.org/people/ethanchase7744/sounds/441666/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "刺客标记与实际跳过"
  },
  {
    id: "rocks",
    title: "Rocks.wav",
    author: "adamgryu",
    page: "https://freesound.org/people/adamgryu/sounds/336023/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "军阀破坏建筑"
  },
  {
    id: "city-bells",
    title: "City Ambience with distant church bells",
    author: "florianreichelt",
    page: "https://freesound.org/people/florianreichelt/sounds/451731/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "大厅黄昏城市环境"
  },
  {
    id: "fireplace-jmehlferber",
    title: "fire-crackling.wav",
    author: "jmehlferber",
    page: "https://freesound.org/people/jmehlferber/sounds/370938/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "准备房和对局的火光室内环境"
  }
];

const revisionOnlineSources = [
  {
    id: "soft-acoustic-guitar",
    title: "Acoustic Guitar (4).wav",
    author: "owstu",
    page: "https://freesound.org/people/owstu/sounds/508316/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "结算的温暖木质拨弦层"
  },
  {
    id: "medieval-lute-chords",
    title: "Medieval Lute Chords",
    author: "f-r-a-g-i-l-e",
    page: "https://freesound.org/people/f-r-a-g-i-l-e/sounds/506266/",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    purpose: "对局低存在感鲁特琴旋律"
  }
];

const revisionInheritedSourceIds = new Set([
  "wood-click",
  "metal-long",
  "paper-rustle",
  "coin-single",
  "metal-bell",
  "sword-slash",
  "rocks",
  "city-bells",
  "fireplace-jmehlferber"
]);
const revisionPurposeOverrides = new Map([
  ["wood-click", "已通过的按钮确认、卡牌落桌与建筑落位，以及 R1 皇冠跳动和落位"],
  ["metal-long", "R1 皇冠落位中的极低增益短铜触感"],
  ["paper-rustle", "已通过的卡牌落桌，以及 R1 抽牌和身份揭示"],
  ["coin-single", "已通过的单枚金币，以及 R1 多枚金币叠放"],
  ["metal-bell", "已通过并冻结的身份叫号"],
  ["sword-slash", "R1 刺客标记与实际跳过中的极弱钝尾音"],
  ["rocks", "已通过的建筑落位，以及 R1 军阀破坏"],
  ["city-bells", "已通过并冻结的大厅黄昏城市环境"],
  ["fireplace-jmehlferber", "原样待定的准备房环境，以及 R1 对局音乐中的轻火炉空间"]
]);
const onlineSources = isRevisionR1
  ? [...baseOnlineSources.filter((item) => revisionInheritedSourceIds.has(item.id)), ...revisionOnlineSources].map((item) => ({
      ...item,
      purpose: revisionPurposeOverrides.get(item.id) ?? item.purpose
    }))
  : baseOnlineSources;

const roundOneAnchors = [
  anchor("ui-confirm", "通用按钮确认", "大厅 / 准备房", "lobby", "短促木质触感，避免现代电子点击。", [
    source("wood-click", { duration: 0.18, gain: 0.92, playbackRate: 0.86, lowpass: 5200 })
  ]),
  anchor("ui-error", "通用错误提示", "全阶段", "lobby", "低沉但不恐怖，明确表示操作未完成。", [
    source("metal-long", { duration: 0.82, gain: 0.72, playbackRate: 0.58, lowpass: 1800 })
  ]),
  anchor("card-draw", "抽牌", "对局 · 资源阶段", "game", "纸牌滑动而不是塑料卡牌或电子扫过。", [
    source("card-shuffle", { duration: 0.62, gain: 0.86, playbackRate: 0.96, highpass: 170 })
  ]),
  anchor("card-place", "卡牌落桌", "对局 · 选牌 / 建造", "game", "纸张与桌面触碰清楚，但不抢夺技能演出。", [
    source("paper-rustle", { offset: 0.08, duration: 0.46, gain: 0.62, playbackRate: 1.1, highpass: 240 }),
    source("wood-click", { delay: 0.22, duration: 0.16, gain: 0.42, playbackRate: 0.72, lowpass: 2800 })
  ]),
  anchor("coin-single", "单枚金币", "对局 · 收入", "game", "一枚金币落在木桌上的清晰反馈。", [
    source("coin-single", { duration: 0.82, gain: 0.8, playbackRate: 0.96, highpass: 300 })
  ]),
  anchor("coin-multi", "多枚金币", "对局 · 职业收入 / 盗取", "game", "多枚金币层次分明，不形成刺耳高频雨。", [
    source("coin-collect", { duration: 1.08, gain: 0.78, playbackRate: 0.9, highpass: 260 })
  ]),
  anchor("crown-tick", "皇冠轮盘跳动", "对局 · 600ms 一次", "game", "每次换座位的轻铜片声，连续播放仍耐听。", [
    source("metal-bell", { duration: 0.24, gain: 0.38, playbackRate: 1.62, highpass: 650, lowpass: 5200 })
  ]),
  anchor("crown-land", "皇冠最终落位", "对局 · 开场", "game", "比轮盘跳动更完整的旧铜和弦，确认先手。", [
    source("metal-bell", { duration: 1.7, gain: 0.62, playbackRate: 1.08, highpass: 180 }),
    source("metal-long", { delay: 0.04, duration: 1.15, gain: 0.28, playbackRate: 0.8, lowpass: 2600 })
  ]),
  anchor("role-call", "身份叫号", "对局 · 叫号", "game", "木槌与短铜声构成仪式起点，不使用人声。", [
    source("wood-click", { duration: 0.18, gain: 0.8, playbackRate: 0.66, lowpass: 3200 }),
    source("metal-bell", { delay: 0.12, duration: 0.55, gain: 0.26, playbackRate: 1.34, highpass: 520 })
  ]),
  anchor("role-reveal", "身份揭示", "对局 · 应答", "game", "羊皮纸翻开后出现温暖金属泛音。", [
    source("paper-rustle", { duration: 0.68, gain: 0.5, playbackRate: 1.06, highpass: 180 }),
    source("metal-bell", { delay: 0.24, duration: 1.05, gain: 0.42, playbackRate: 1.22, highpass: 350 })
  ]),
  anchor("assassin-mark", "刺客标记", "对局 · 技能第一段", "game", "收紧的气息和克制刀锋，仍不关联玩家身份。", [
    source("sword-slash", { duration: 0.72, gain: 0.56, playbackRate: 0.76, highpass: 420, lowpass: 5200 })
  ]),
  anchor("assassin-skip", "刺客实际跳过", "对局 · 技能第二段", "game", "心跳终止与短刀锋同时确认本轮跳过。", [
    source("sword-slash", { duration: 1.05, gain: 0.82, playbackRate: 1.02, highpass: 360 })
  ]),
  anchor("warlord-destroy", "军阀破坏建筑", "对局 · 技能结算", "game", "石材断裂、低鼓与钝铁冲击，不使用爆炸。", [
    source("rocks", { duration: 1.72, gain: 0.72, playbackRate: 1.12, highpass: 90, lowpass: 6200 }),
    source("metal-long", { delay: 0.05, duration: 0.9, gain: 0.42, playbackRate: 0.72, lowpass: 3400 })
  ]),
  anchor("build-place", "建筑落位", "对局 · 建造", "game", "石块与木结构落定，重量高于普通卡牌落桌。", [
    source("rocks", { duration: 0.78, gain: 0.34, playbackRate: 1.42, lowpass: 3800 }),
    source("wood-click", { delay: 0.08, duration: 0.2, gain: 0.55, playbackRate: 0.58, lowpass: 2400 })
  ]),
  anchor("final-round", "最终回合", "对局 · 阶段提示", "game", "旧铜短号角和低频支撑，提高紧张度但不突然变成战争音乐。", [
    source("metal-bell", { duration: 1.55, gain: 0.58, playbackRate: 0.72, lowpass: 3600 }),
    source("metal-long", { delay: 0.06, duration: 1.3, gain: 0.35, playbackRate: 0.62, lowpass: 1900 })
  ]),
  anchor("result-end", "结算乐句", "结算", "result", "温暖、克制的结束和弦，不预设本地玩家一定获胜。", [
    source("metal-bell", { duration: 2.1, gain: 0.5, playbackRate: 0.94, highpass: 140 }),
    source("metal-long", { delay: 0.18, duration: 1.35, gain: 0.22, playbackRate: 0.84, lowpass: 2500 })
  ]),
  ambience("amb-lobby", "大厅 · 黄昏城市", "大厅", "lobby", "远处城市、钟声、风与水岸空间，保持中央菜单清晰。", [
    source("city-bells", { offset: 2.5, duration: 20, gain: 0.58, playbackRate: 0.96, highpass: 90, lowpass: 6500 })
  ]),
  ambience("amb-ready", "准备房 · 议事厅", "准备房", "ready", "火光、石墙与木梁的室内底色，不盖住聊天提示。", [
    source("fireplace-jmehlferber", { offset: 4, duration: 20, gain: 0.5, playbackRate: 0.92, highpass: 100, lowpass: 5200 })
  ]),
  ambience("amb-game", "对局 · 烛光牌桌", "对局", "game", "比准备房更安静，只保留火光与低沉房间空气。", [
    source("fireplace-jmehlferber", { offset: 12, duration: 20, gain: 0.28, playbackRate: 0.78, highpass: 70, lowpass: 2100 })
  ])
];

const revisionIds = [
  "card-draw",
  "coin-multi",
  "crown-tick",
  "crown-land",
  "role-reveal",
  "assassin-mark",
  "assassin-skip",
  "warlord-destroy",
  "result-end",
  "amb-game"
];
const pendingIds = ["amb-ready"];
const frozenIds = ["ui-confirm", "card-place", "coin-single", "role-call", "build-place", "amb-lobby"];
const silentIds = ["ui-error", "final-round"];

const revisionOverrides = {
  "card-draw": {
    description: "单张羊皮纸牌沿木桌滑动，削弱尖锐摩擦，不再模拟连续洗牌。",
    onlineRecipe: [source("paper-rustle", { offset: 0.12, duration: 0.48, gain: 0.38, playbackRate: 0.82, highpass: 90, lowpass: 3400 })]
  },
  "coin-multi": {
    description: "复用已通过的单枚金币材质，以三至四枚较低音高金币形成松散层次。",
    onlineRecipe: [
      source("coin-single", { duration: 0.5, gain: 0.32, playbackRate: 0.78, lowpass: 4200 }),
      source("coin-single", { delay: 0.13, duration: 0.46, gain: 0.28, playbackRate: 0.84, lowpass: 4200 }),
      source("coin-single", { delay: 0.29, duration: 0.42, gain: 0.24, playbackRate: 0.72, lowpass: 3900 }),
      source("coin-single", { delay: 0.44, duration: 0.36, gain: 0.2, playbackRate: 0.88, lowpass: 4000 })
    ]
  },
  "crown-tick": {
    description: "起音清楚的温和木质与旧铜轻点，按 600ms 连播可听见但不疲劳。",
    onlineRecipe: [source("wood-click", { offset: 0.02, duration: 0.18, gain: 0.62, playbackRate: 0.72, lowpass: 2600 })]
  },
  "crown-land": {
    description: "柔和木质落定与低铜触感，不保留持续钟鸣，响度低于旧版。",
    onlineRecipe: [
      source("wood-click", { duration: 0.18, gain: 0.48, playbackRate: 0.58, lowpass: 1800 }),
      source("metal-long", { delay: 0.03, duration: 0.58, gain: 0.16, playbackRate: 0.42, lowpass: 1000 })
    ]
  },
  "role-reveal": {
    description: "只保留羊皮纸或卡牌翻面，不包含钟、铜片或其他金属尾音。",
    onlineRecipe: [source("paper-rustle", { offset: 0.1, duration: 0.5, gain: 0.42, playbackRate: 0.9, highpass: 100, lowpass: 3400 })]
  },
  "assassin-mark": {
    description: "低心跳、倒放气息与短促空气收紧；刀锋仅保留极弱钝尾音。",
    onlineRecipe: [source("sword-slash", { duration: 0.62, gain: 0.16, playbackRate: 0.52, lowpass: 1700 })]
  },
  "assassin-skip": {
    description: "与刺客标记使用同一温和声音纹章，以更完整的低心跳确认实际跳过。",
    onlineRecipe: [source("sword-slash", { duration: 0.75, gain: 0.18, playbackRate: 0.48, lowpass: 1600 })]
  },
  "warlord-destroy": {
    description: "短促石块断裂与低沉撞击，移除长金属尾音和连续碎石拖尾。",
    onlineRecipe: [source("rocks", { duration: 0.78, gain: 0.42, playbackRate: 0.88, highpass: 60, lowpass: 3200 })]
  },
  "result-end": {
    description: "低弦、木质拨弦与柔和空气尾音；禁止铃铛、叮声和明亮金属泛音。",
    onlineRecipe: [source("soft-acoustic-guitar", { duration: 2.05, gain: 0.32, playbackRate: 0.82, highpass: 70, lowpass: 3600 })]
  },
  "amb-game": {
    description: "约 24 秒低存在感鲁特琴与低弦循环，无打击乐和铃声，并保留很轻的火炉空间。",
    previewDuration: 24,
    onlineRecipe: [
      source("fireplace-jmehlferber", { offset: 12, duration: 20, gain: 0.14, playbackRate: 0.78, highpass: 70, lowpass: 1700 }),
      source("medieval-lute-chords", { duration: 14.4, gain: 0.22, playbackRate: 0.56, highpass: 80, lowpass: 3800 })
    ]
  },
  "ui-error": {
    description: "用户已明确要求错误反馈保持静音，只依靠界面状态说明操作未完成。"
  },
  "final-round": {
    description: "用户已明确要求最终回合保持静音，只依靠阶段画面提示。"
  }
};

const revisionAnchorsById = new Map(roundOneAnchors.map((item) => {
  const override = revisionOverrides[item.id] ?? {};
  const batchState = revisionIds.includes(item.id)
    ? "revision-pending"
    : pendingIds.includes(item.id)
      ? "pending-unchanged"
      : frozenIds.includes(item.id)
        ? "approved-frozen"
        : "confirmed-silent";
  return [item.id, {
    ...item,
    ...override,
    batchState,
    originalFile: batchState === "revision-pending" ? item.originalFile : null,
    onlineRecipe: batchState === "confirmed-silent" ? [] : (override.onlineRecipe ?? item.onlineRecipe),
    recommended: batchState === "revision-pending" ? "C" : batchState === "confirmed-silent" ? null : "B",
    recommendation: batchState === "revision-pending"
      ? "R1 的 C 版使用低增益混合与软限制器，仍需以实际试听结论为准。"
      : batchState === "approved-frozen"
        ? "沿用第一轮已通过的 B 版，不在本批重新混音。"
        : batchState === "pending-unchanged"
          ? "沿用第一轮 B 版继续待定，不在本批修改。"
          : "用户已明确要求此事件保持静音。"
  }];
}));

const revisionAnchorOrder = [...revisionIds, ...pendingIds, ...frozenIds, ...silentIds];
const revisionAnchors = revisionAnchorOrder.map((id) => revisionAnchorsById.get(id));
const anchors = isRevisionR1 ? revisionAnchors : roundOneAnchors;

const roundOneScenarios = [
  {
    id: "crown-opening",
    title: "9 秒皇冠开场",
    description: "前 3 秒展示目标；3–7.2 秒每 600ms 跳动；7.5 秒皇冠落位。",
    duration: 9,
    events: [
      ...Array.from({ length: 8 }, (_, index) => ({ anchorId: "crown-tick", at: 3 + index * 0.6 })),
      { anchorId: "crown-land", at: 7.5 }
    ]
  },
  {
    id: "role-call-flow",
    title: "完整身份叫号",
    description: "叫号木槌、等待、身份牌揭示。",
    duration: 4.2,
    events: [
      { anchorId: "role-call", at: 0 },
      { anchorId: "role-reveal", at: 2.05 }
    ]
  },
  {
    id: "normal-turn",
    title: "金币 → 抽牌 → 建造",
    description: "普通回合的连续信息密度，用于判断音效是否互相抢夺。",
    duration: 6,
    events: [
      { anchorId: "coin-multi", at: 0.2 },
      { anchorId: "card-draw", at: 1.75 },
      { anchorId: "card-place", at: 3.05 },
      { anchorId: "build-place", at: 3.45 }
    ]
  },
  {
    id: "assassin-flow",
    title: "刺客两段式结算",
    description: "先标记秘密身份，之后在叫号时实际跳过。",
    duration: 5.4,
    events: [
      { anchorId: "assassin-mark", at: 0.25 },
      { anchorId: "role-call", at: 2.5 },
      { anchorId: "assassin-skip", at: 3.35 }
    ]
  },
  {
    id: "warlord-flow",
    title: "军阀破坏",
    description: "目标确认后只播放一次权威破坏结算。",
    duration: 3.6,
    events: [{ anchorId: "warlord-destroy", at: 0.35 }]
  },
  {
    id: "ending-flow",
    title: "最终回合与结算",
    description: "阶段警示与结算乐句之间保留阅读间隔。",
    duration: 7,
    events: [
      { anchorId: "final-round", at: 0.3 },
      { anchorId: "result-end", at: 3.7 }
    ]
  }
];

const revisionScenarios = [
  {
    id: "crown-opening",
    title: "9 秒皇冠开场 · R1",
    description: "前 3 秒保持静默展示；之后每 600ms 温和跳动，最后柔和落位。",
    duration: 9,
    events: [
      ...Array.from({ length: 8 }, (_, index) => ({ anchorId: "crown-tick", at: 3 + index * 0.6 })),
      { anchorId: "crown-land", at: 7.5 }
    ]
  },
  {
    id: "normal-turn",
    title: "金币 → 抽牌 → 建造 · R1",
    description: "使用返工后的多枚金币和单张抽牌，并沿用已通过的落牌、建筑落位。",
    duration: 5.2,
    events: [
      { anchorId: "coin-multi", at: 0.2 },
      { anchorId: "card-draw", at: 1.45 },
      { anchorId: "card-place", at: 2.65 },
      { anchorId: "build-place", at: 3.15 }
    ]
  },
  {
    id: "assassin-flow",
    title: "刺客两段式结算 · R1",
    description: "两段统一为低心跳、气息收紧和极弱钝刀尾音。",
    duration: 5.1,
    events: [
      { anchorId: "assassin-mark", at: 0.25 },
      { anchorId: "role-call", at: 2.35 },
      { anchorId: "assassin-skip", at: 3.1 }
    ]
  },
  {
    id: "warlord-flow",
    title: "军阀破坏 · R1",
    description: "只保留一次短促石材断裂与低沉撞击。",
    duration: 2.4,
    events: [{ anchorId: "warlord-destroy", at: 0.35 }]
  },
  {
    id: "ending-flow",
    title: "结算温暖低音收束 · R1",
    description: "最终回合明确静音；结算只播放无铃声的低弦与木质拨弦。",
    duration: 4.4,
    events: [{ anchorId: "result-end", at: 1.1 }]
  },
  {
    id: "gameplay-music",
    title: "对局舒缓音乐 · 24 秒",
    description: "低存在感鲁特琴与低弦循环，检查长时间背景位置和循环边界。",
    duration: 24,
    events: [{ anchorId: "amb-game", at: 0 }]
  }
];

const scenarios = isRevisionR1 ? revisionScenarios : roundOneScenarios;

mkdirSync(originalDir, { recursive: true });
mkdirSync(sourceDir, { recursive: true });
mkdirSync(screenshotDir, { recursive: true });

if (shouldVerifyOnly) {
  verifyOutput();
  process.exit(0);
}

if (isRevisionR1) generateRevisionOriginalAudio();
else generateOriginalAudio();
copySceneReferences();
if (isRevisionR1) copyRoundOneSourceCache();

if (shouldDownloadSources) {
  await downloadOnlineSources();
}

const generatedAt = new Date().toISOString();
const reviewData = {
  version: batchName,
  batchMode: isRevisionR1 ? "revision-r1" : "initial-direction",
  inheritedFrom: isRevisionR1 ? "round-01" : null,
  generatedAt,
  status: isRevisionR1 ? "revision-candidate-unapproved-not-integrated" : "candidate-unapproved-not-integrated",
  notice: isRevisionR1
    ? "R1 只返工未通过与待定项目；已通过项目冻结、明确静音项目不播放。用户明确回复“验收通过，可以接入”前，仍不得进入正式游戏。"
    : "本批音频仅用于独立试听。用户明确回复“验收通过，可以接入”前，不得进入正式游戏资源或代码。",
  onlinePreviewNotice: "B/C 版使用 Freesound 公开试听预览进行方向评估；如最终选中，正式接入前必须下载原始文件并再次核对许可。",
  screenshots: {
    lobby: "screenshots/lobby.png",
    ready: "screenshots/ready.png",
    game: "screenshots/game.png",
    result: "screenshots/game.png"
  },
  sources: onlineSources.map((item) => {
    const cachedPath = join(sourceDir, `${item.id}.mp3`);
    const downloaded = existsSync(cachedPath);
    const downloadedAt = downloaded ? statSync(cachedPath).mtime.toISOString() : null;
    return {
      ...item,
      originalFileName: item.title,
      file: `sources/${item.id}.mp3`,
      downloaded,
      downloadedAt,
      downloadDate: downloadedAt?.slice(0, 10) ?? null,
      modifications: "试听页实时裁剪、增益、播放速度、高/低通滤波与混音；逐项参数见 anchor.onlineRecipe。",
      intendedUse: item.purpose,
      status: "candidate-unapproved-not-integrated"
    };
  }),
  anchors: anchors.map((item) => ({
    ...item,
    status: item.batchState ?? "candidate-unapproved-not-integrated",
    candidates: buildCandidateRecords(item)
  })),
  scenarios
};

writeFileSync(join(outputRoot, "review-data.js"), `window.REVIEW_DATA = ${JSON.stringify(reviewData, null, 2)};\n`, "utf8");
writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify(reviewData, null, 2)}\n`, "utf8");
writeFileSync(join(outputRoot, "index.html"), reviewHtml(), "utf8");
writeFileSync(join(outputRoot, "styles.css"), reviewCss(), "utf8");
writeFileSync(join(outputRoot, "app.js"), reviewAppJs(), "utf8");
writeFileSync(join(outputRoot, "README.md"), reviewReadme(), "utf8");
writeFileSync(
  join(outputRoot, "启动试听.cmd"),
  "@echo off\r\ncd /d \"%~dp0\"\r\nstart \"\" http://127.0.0.1:4179\r\npython -m http.server 4179\r\n",
  "utf8"
);

verifyOutput();
console.log(`Audio review generated at ${outputRoot}`);

function anchor(id, title, trigger, scene, description, onlineRecipe) {
  return {
    id,
    title,
    trigger,
    scene,
    description,
    kind: "cue",
    originalFile: `original/${id}.wav`,
    onlineRecipe,
    recommended: "C",
    recommendation: "C 版保留原创声音纹章，同时用真实材质补足触感；需以实际试听结论为准。"
  };
}

function ambience(id, title, trigger, scene, description, onlineRecipe) {
  return {
    ...anchor(id, title, trigger, scene, description, onlineRecipe),
    kind: "ambience",
    recommendation: "C 版用原创空间底色控制风格，再以真实环境补充细节；默认仅试听 20 秒循环。"
  };
}

function source(sourceId, options = {}) {
  return {
    sourceId,
    offset: options.offset ?? 0,
    duration: options.duration ?? null,
    delay: options.delay ?? 0,
    gain: options.gain ?? 1,
    playbackRate: options.playbackRate ?? 1,
    highpass: options.highpass ?? null,
    lowpass: options.lowpass ?? null
  };
}

function buildCandidateRecords(item) {
  if (item.batchState === "confirmed-silent") return [];
  const isFullComparison = !isRevisionR1 || item.batchState === "revision-pending";
  const records = [];
  if (isFullComparison) {
    records.push({
      variant: "A",
      sourceType: "procedural-original",
      author: "《富饶之城》项目候选生成器",
      license: "项目原创候选，未进入正式资源",
      sourceFiles: [item.originalFile],
      modifications: isRevisionR1
        ? `固定种子 R1 程序化合成；${item.kind === "ambience" ? "32 kHz / 24 秒 / 峰值 0.18 / 循环边界淡化" : "44.1 kHz / 峰值不高于 0.36 / 首尾淡化"}。`
        : `固定种子程序化合成；${item.kind === "ambience" ? "32 kHz / 20 秒 / 峰值 0.46 / 循环边界淡化" : "44.1 kHz / 峰值 0.82 / 首尾淡化"}。`,
      intendedUse: item.title
    });
  }
  records.push({
    variant: "B",
    sourceType: "online-recording",
    author: item.onlineRecipe.map((recipe) => onlineSources.find((sourceItem) => sourceItem.id === recipe.sourceId)?.author).filter(Boolean).join(" + "),
    license: "CC0 1.0（各源逐项记录）",
    sourceFiles: item.onlineRecipe.map((recipe) => `sources/${recipe.sourceId}.mp3`),
    modifications: item.onlineRecipe,
    intendedUse: item.title,
    inheritedFrom: item.batchState === "approved-frozen" || item.batchState === "pending-unchanged" ? "round-01" : null
  });
  if (isFullComparison) {
    records.push({
      variant: "C",
      sourceType: "original-plus-recording",
      author: "项目原创候选 + 已记录 CC0 作者",
      license: "原创候选 + CC0 1.0",
      sourceFiles: [item.originalFile, ...item.onlineRecipe.map((recipe) => `sources/${recipe.sourceId}.mp3`)],
      modifications: isRevisionR1
        ? "按 R1 低增益配比将 A 与 B 送入同一软限制器；未渲染进正式资源。"
        : "按试听页设定将 A 与 B 实时混合；未渲染进正式资源。",
      intendedUse: item.title
    });
  }
  return records;
}

function copyRoundOneSourceCache() {
  for (const item of onlineSources.filter((sourceItem) => revisionInheritedSourceIds.has(sourceItem.id))) {
    const sourcePath = join(roundOneOutputRoot, "sources", `${item.id}.mp3`);
    const destinationPath = join(sourceDir, `${item.id}.mp3`);
    if (existsSync(sourcePath) && !existsSync(destinationPath)) copyFileSync(sourcePath, destinationPath);
  }
}

async function downloadOnlineSources() {
  for (const item of onlineSources) {
    const outputPath = join(sourceDir, `${item.id}.mp3`);
    if (existsSync(outputPath) && statSync(outputPath).size >= 1000) {
      console.log(`Keeping cached ${item.id}: ${Math.round(statSync(outputPath).size / 1024)} KB`);
      continue;
    }
    console.log(`Fetching ${item.title} metadata...`);
    const pageResponse = await fetch(item.page, {
      headers: { "user-agent": "Mozilla/5.0 Codex audio-review candidate builder" },
      signal: AbortSignal.timeout(60_000)
    });
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch ${item.page}: ${pageResponse.status}`);
    }
    const html = await pageResponse.text();
    const previewUrl = extractPreviewUrl(html);
    if (!previewUrl) {
      throw new Error(`No public preview URL found for ${item.page}`);
    }
    const previewResponse = await fetch(previewUrl, {
      headers: { "user-agent": "Mozilla/5.0 Codex audio-review candidate builder" },
      signal: AbortSignal.timeout(60_000)
    });
    if (!previewResponse.ok) {
      throw new Error(`Failed to fetch preview ${previewUrl}: ${previewResponse.status}`);
    }
    const bytes = Buffer.from(await previewResponse.arrayBuffer());
    if (bytes.length < 1000) {
      throw new Error(`Preview is unexpectedly small for ${item.id}`);
    }
    writeFileSync(outputPath, bytes);
    item.previewUrl = previewUrl;
    item.previewFile = `sources/${item.id}.mp3`;
    item.downloadedAt = new Date().toISOString();
    console.log(`Saved ${item.id}: ${Math.round(bytes.length / 1024)} KB`);
  }
}

function extractPreviewUrl(html) {
  const patterns = [
    /data-static-file-url="([^"]+-hq\.mp3)"/i,
    /data-mp3="([^"]+\.mp3)"/i,
    /name="twitter:player:stream" content="([^"]+\.mp3)"/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].replaceAll("&amp;", "&");
  }
  return null;
}

function generateOriginalAudio() {
  const cues = [
    cue("ui-confirm", 0.28, renderUiConfirm),
    cue("ui-error", 0.92, renderUiError),
    cue("card-draw", 0.72, renderCardDraw),
    cue("card-place", 0.52, renderCardPlace),
    cue("coin-single", 0.82, renderCoinSingle),
    cue("coin-multi", 1.18, renderCoinMulti),
    cue("crown-tick", 0.28, renderCrownTick),
    cue("crown-land", 1.82, renderCrownLand),
    cue("role-call", 0.92, renderRoleCall),
    cue("role-reveal", 1.48, renderRoleReveal),
    cue("assassin-mark", 1.05, renderAssassinMark),
    cue("assassin-skip", 1.34, renderAssassinSkip),
    cue("warlord-destroy", 2.05, renderWarlordDestroy),
    cue("build-place", 1.05, renderBuildPlace),
    cue("final-round", 2.1, renderFinalRound),
    cue("result-end", 2.85, renderResultEnd)
  ];
  for (const spec of cues) {
    const sampleRate = 44_100;
    const samples = new Float32Array(Math.ceil(spec.duration * sampleRate));
    const rng = mulberry32(hashString(`zy-audio-round-01:${spec.id}`));
    spec.render(samples, sampleRate, rng);
    softenEdges(samples, sampleRate, 0.003, 0.045);
    normalize(samples, 0.82);
    writeWav(join(originalDir, `${spec.id}.wav`), samples, sampleRate);
  }

  const ambienceSpecs = [
    { id: "amb-lobby", render: renderLobbyAmbience },
    { id: "amb-ready", render: renderReadyAmbience },
    { id: "amb-game", render: renderGameAmbience }
  ];
  for (const spec of ambienceSpecs) {
    const sampleRate = 32_000;
    const duration = 20;
    const samples = new Float32Array(duration * sampleRate);
    const rng = mulberry32(hashString(`zy-audio-round-01:${spec.id}`));
    spec.render(samples, sampleRate, rng);
    makeSeamless(samples, sampleRate, 1.5);
    softenEdges(samples, sampleRate, 0.08, 0.08);
    normalize(samples, 0.46);
    writeWav(join(originalDir, `${spec.id}.wav`), samples, sampleRate);
  }
}

function generateRevisionOriginalAudio() {
  const cues = [
    cue("card-draw", 0.5, renderRevisionCardDraw),
    cue("coin-multi", 0.82, renderRevisionCoinMulti),
    cue("crown-tick", 0.22, renderRevisionCrownTick),
    cue("crown-land", 0.92, renderRevisionCrownLand),
    cue("role-reveal", 0.58, renderRevisionRoleReveal),
    cue("assassin-mark", 0.82, renderRevisionAssassinMark),
    cue("assassin-skip", 1.05, renderRevisionAssassinSkip),
    cue("warlord-destroy", 0.82, renderRevisionWarlordDestroy),
    cue("result-end", 2.1, renderRevisionResultEnd)
  ];
  for (const spec of cues) {
    const sampleRate = 44_100;
    const samples = new Float32Array(Math.ceil(spec.duration * sampleRate));
    const rng = mulberry32(hashString(`zy-audio-round-01-r1:${spec.id}`));
    spec.render(samples, sampleRate, rng);
    softenEdges(samples, sampleRate, 0.004, spec.id === "result-end" ? 0.12 : 0.05);
    normalize(samples, spec.id === "crown-tick" ? 0.34 : 0.36);
    writeWav(join(originalDir, `${spec.id}.wav`), samples, sampleRate);
  }

  const sampleRate = 32_000;
  const duration = 24;
  const samples = new Float32Array(duration * sampleRate);
  const rng = mulberry32(hashString("zy-audio-round-01-r1:amb-game"));
  renderRevisionGameMusic(samples, sampleRate, rng);
  makeSeamless(samples, sampleRate, 1.5);
  softenEdges(samples, sampleRate, 0.1, 0.1);
  normalize(samples, 0.18);
  writeWav(join(originalDir, "amb-game.wav"), samples, sampleRate);
}

function renderRevisionCardDraw(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0.012, 0.38, 0.22, 120, 2900, "rise-fall");
  addNoise(buffer, sampleRate, rng, 0.08, 0.21, 0.12, 220, 2400, "decay");
  addDampedTone(buffer, sampleRate, 0.36, 108, 0.11, 0.12, 24, [1, 0.18]);
}

function renderRevisionCoinMulti(buffer, sampleRate, rng) {
  const starts = [0.02, 0.16, 0.34, 0.51];
  for (let index = 0; index < starts.length; index += 1) {
    const frequency = 650 + rng() * 330;
    addDampedTone(buffer, sampleRate, starts[index], frequency, 0.28, 0.22 - index * 0.025, 11, [1, 0.22], -45);
    addNoise(buffer, sampleRate, rng, starts[index], 0.055, 0.05, 130, 2500, "decay");
  }
  addDampedTone(buffer, sampleRate, 0.55, 430, 0.24, 0.08, 12, [1, 0.18]);
}

function renderRevisionCrownTick(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.035, 0.18, 100, 1800, "decay");
  addDampedTone(buffer, sampleRate, 0.001, 214, 0.18, 0.3, 24, [1, 0.28]);
  addDampedTone(buffer, sampleRate, 0.008, 392, 0.13, 0.12, 28, [1]);
}

function renderRevisionCrownLand(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.085, 0.16, 80, 1800, "decay");
  addDampedTone(buffer, sampleRate, 0.003, 104, 0.7, 0.38, 6.5, [1, 0.35]);
  addDampedTone(buffer, sampleRate, 0.035, 156, 0.66, 0.22, 7.2, [1, 0.28]);
  addDampedTone(buffer, sampleRate, 0.07, 234, 0.52, 0.12, 8.5, [1, 0.2]);
}

function renderRevisionRoleReveal(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0.01, 0.42, 0.24, 110, 3000, "rise-fall");
  addNoise(buffer, sampleRate, rng, 0.08, 0.2, 0.12, 180, 2500, "decay");
  addNoise(buffer, sampleRate, rng, 0.34, 0.08, 0.08, 90, 1500, "decay");
}

function renderRevisionAssassinMark(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0.045, 54, 0.26, 0.34, 13, [1, 0.22]);
  addDampedTone(buffer, sampleRate, 0.34, 54, 0.25, 0.29, 13, [1, 0.2]);
  addNoise(buffer, sampleRate, rng, 0.16, 0.5, 0.16, 120, 2200, "rise-fall");
  addSweep(buffer, sampleRate, 0.46, 0.24, 1380, 430, 0.06, "decay");
}

function renderRevisionAssassinSkip(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0.03, 52, 0.31, 0.38, 12, [1, 0.22]);
  addDampedTone(buffer, sampleRate, 0.39, 52, 0.3, 0.34, 12, [1, 0.2]);
  addNoise(buffer, sampleRate, rng, 0.18, 0.62, 0.17, 100, 2100, "rise-fall");
  addSweep(buffer, sampleRate, 0.58, 0.27, 1250, 360, 0.07, "decay");
  addDampedTone(buffer, sampleRate, 0.72, 92, 0.24, 0.13, 11, [1, 0.18]);
}

function renderRevisionWarlordDestroy(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0.01, 68, 0.56, 0.42, 7.5, [1, 0.3]);
  addNoise(buffer, sampleRate, rng, 0.06, 0.56, 0.26, 55, 2700, "decay");
  for (let index = 0; index < 4; index += 1) {
    const start = 0.12 + index * 0.1 + rng() * 0.035;
    addNoise(buffer, sampleRate, rng, start, 0.08 + rng() * 0.06, 0.08, 120, 2200, "decay");
    addDampedTone(buffer, sampleRate, start, 105 + rng() * 95, 0.16, 0.07, 17, [1, 0.18]);
  }
}

function renderRevisionResultEnd(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0.02, 1.75, 0.045, 70, 1600, "rise-fall");
  for (const [frequency, gain, start] of [[98, 0.28, 0], [146.83, 0.21, 0.08], [196, 0.16, 0.18]]) {
    addDampedTone(buffer, sampleRate, start, frequency, 1.82 - start, gain, 3.1, [1, 0.32, 0.1]);
  }
  for (const [frequency, start] of [[196, 0.06], [220, 0.42], [174.61, 0.78], [146.83, 1.16]]) {
    addDampedTone(buffer, sampleRate, start, frequency, 0.7, 0.09, 6.8, [1, 0.24]);
  }
}

function renderRevisionGameMusic(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 24, 0.028, 30, 720, "flat");
  const chordRoots = [65.41, 58.27, 73.42, 55];
  chordRoots.forEach((root, index) => {
    const start = index * 6;
    addDampedTone(buffer, sampleRate, start, root, 6.2, 0.07, 0.34, [1, 0.28, 0.1]);
    addDampedTone(buffer, sampleRate, start + 0.08, root * 1.5, 5.9, 0.045, 0.38, [1, 0.22]);
  });
  const melody = [196, 220, 174.61, 146.83, 164.81, 196, 146.83, 130.81, 146.83, 174.61, 164.81, 130.81];
  melody.forEach((frequency, index) => {
    const start = 0.45 + index * 1.92;
    addDampedTone(buffer, sampleRate, start, frequency, 1.18, 0.042, 4.7, [1, 0.34, 0.12], index % 3 === 0 ? -4 : 0);
  });
}

function cue(id, duration, render) {
  return { id, duration, render };
}

function renderUiConfirm(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.055, 0.44, 180, 2100, "decay");
  addDampedTone(buffer, sampleRate, 0.003, 214, 0.17, 0.52, 21, [1, 0.42, 0.18]);
  addDampedTone(buffer, sampleRate, 0.036, 392, 0.13, 0.24, 28, [1, 0.25]);
}

function renderUiError(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0, 118, 0.82, 0.6, 4.2, [1, 0.55, 0.21], -25);
  addDampedTone(buffer, sampleRate, 0.025, 181, 0.65, 0.28, 5.1, [1, 0.3], -38);
  addNoise(buffer, sampleRate, rng, 0, 0.34, 0.18, 90, 1100, "decay");
}

function renderCardDraw(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0.02, 0.46, 0.38, 420, 5200, "rise-fall");
  for (let index = 0; index < 5; index += 1) {
    addNoise(buffer, sampleRate, rng, 0.09 + index * 0.065, 0.075, 0.16, 700, 6500, "decay");
  }
  addDampedTone(buffer, sampleRate, 0.39, 165, 0.22, 0.16, 18, [1, 0.25]);
}

function renderCardPlace(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.25, 0.32, 330, 4700, "decay");
  addDampedTone(buffer, sampleRate, 0.18, 132, 0.26, 0.48, 16, [1, 0.3, 0.12]);
  addNoise(buffer, sampleRate, rng, 0.18, 0.08, 0.22, 120, 1600, "decay");
}

function renderCoinSingle(buffer, sampleRate) {
  addDampedTone(buffer, sampleRate, 0, 1540, 0.72, 0.52, 7.8, [1, 0.48, 0.2], 55);
  addDampedTone(buffer, sampleRate, 0.009, 2320, 0.55, 0.3, 10, [1, 0.32], -90);
  addDampedTone(buffer, sampleRate, 0.052, 910, 0.42, 0.24, 9, [1, 0.3]);
}

function renderCoinMulti(buffer, sampleRate, rng) {
  for (let index = 0; index < 6; index += 1) {
    const start = 0.03 + index * 0.105 + rng() * 0.035;
    const freq = 1120 + rng() * 1350;
    addDampedTone(buffer, sampleRate, start, freq, 0.55, 0.28 + rng() * 0.13, 8 + rng() * 4, [1, 0.45, 0.18], (rng() - 0.5) * 130);
  }
  addDampedTone(buffer, sampleRate, 0.56, 680, 0.46, 0.18, 9, [1, 0.35]);
}

function renderCrownTick(buffer, sampleRate) {
  addDampedTone(buffer, sampleRate, 0, 1240, 0.25, 0.46, 17, [1, 0.55, 0.18]);
  addDampedTone(buffer, sampleRate, 0.006, 1960, 0.2, 0.25, 22, [1, 0.28]);
}

function renderCrownLand(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.1, 0.22, 160, 3200, "decay");
  for (const [freq, gain, start] of [[293.66, 0.38, 0], [440, 0.32, 0.045], [587.33, 0.27, 0.09], [880, 0.16, 0.13]]) {
    addDampedTone(buffer, sampleRate, start, freq, 1.6 - start, gain, 3.8, [1, 0.46, 0.2]);
  }
}

function renderRoleCall(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.09, 0.35, 100, 1800, "decay");
  addDampedTone(buffer, sampleRate, 0, 146, 0.38, 0.56, 11, [1, 0.42]);
  addDampedTone(buffer, sampleRate, 0.19, 659.25, 0.66, 0.28, 7.2, [1, 0.4, 0.18]);
}

function renderRoleReveal(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.52, 0.26, 240, 6400, "rise-fall");
  addSweep(buffer, sampleRate, 0.05, 0.64, 280, 780, 0.2, "rise");
  for (const [freq, gain, start] of [[329.63, 0.28, 0.26], [493.88, 0.24, 0.31], [659.25, 0.2, 0.36]]) {
    addDampedTone(buffer, sampleRate, start, freq, 1.02, gain, 4.6, [1, 0.38, 0.14]);
  }
}

function renderAssassinMark(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0.06, 58, 0.24, 0.58, 13, [1, 0.35]);
  addDampedTone(buffer, sampleRate, 0.34, 58, 0.28, 0.5, 12, [1, 0.3]);
  addNoise(buffer, sampleRate, rng, 0.16, 0.66, 0.32, 520, 7200, "rise");
  addSweep(buffer, sampleRate, 0.5, 0.34, 2200, 540, 0.2, "decay");
}

function renderAssassinSkip(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0, 54, 0.34, 0.62, 12, [1, 0.3]);
  addNoise(buffer, sampleRate, rng, 0.18, 0.5, 0.5, 720, 8600, "rise-fall");
  addSweep(buffer, sampleRate, 0.22, 0.46, 4600, 690, 0.42, "decay");
  addNoise(buffer, sampleRate, rng, 0.64, 0.12, 0.36, 140, 2300, "decay");
}

function renderWarlordDestroy(buffer, sampleRate, rng) {
  addDampedTone(buffer, sampleRate, 0, 69, 0.7, 0.7, 6.2, [1, 0.48, 0.18], -12);
  addNoise(buffer, sampleRate, rng, 0.12, 1.25, 0.46, 70, 4200, "decay");
  for (let index = 0; index < 9; index += 1) {
    const start = 0.2 + rng() * 0.9;
    addNoise(buffer, sampleRate, rng, start, 0.09 + rng() * 0.2, 0.18 + rng() * 0.2, 170, 3600, "decay");
    addDampedTone(buffer, sampleRate, start, 120 + rng() * 210, 0.25, 0.12, 15, [1, 0.25]);
  }
  addDampedTone(buffer, sampleRate, 0.08, 286, 1.35, 0.35, 4.5, [1, 0.43, 0.2], -45);
}

function renderBuildPlace(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.32, 0.4, 80, 2600, "decay");
  addDampedTone(buffer, sampleRate, 0.015, 91, 0.72, 0.65, 7.2, [1, 0.5, 0.2]);
  addDampedTone(buffer, sampleRate, 0.18, 244, 0.56, 0.22, 8.2, [1, 0.32]);
}

function renderFinalRound(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.18, 0.18, 80, 1800, "decay");
  for (const [freq, gain, start] of [[146.83, 0.52, 0], [220, 0.38, 0.08], [293.66, 0.31, 0.18]]) {
    addHornTone(buffer, sampleRate, start, freq, 1.72, gain);
  }
}

function renderResultEnd(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 0.16, 0.12, 120, 2500, "decay");
  for (const [freq, gain, start] of [[196, 0.35, 0], [246.94, 0.3, 0.08], [293.66, 0.27, 0.16], [392, 0.2, 0.3]]) {
    addDampedTone(buffer, sampleRate, start, freq, 2.45 - start, gain, 2.6, [1, 0.46, 0.2]);
  }
  addDampedTone(buffer, sampleRate, 1.1, 784, 1.42, 0.1, 3.4, [1, 0.35]);
}

function renderLobbyAmbience(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 20, 0.12, 40, 1900, "flat");
  addPeriodicDrone(buffer, sampleRate, 73.42, 0.035, 20, 0.08);
  addPeriodicDrone(buffer, sampleRate, 110, 0.022, 10, 0.14);
  addDampedTone(buffer, sampleRate, 4.2, 523.25, 3.1, 0.09, 1.1, [1, 0.42, 0.16]);
  addDampedTone(buffer, sampleRate, 13.9, 392, 3.4, 0.075, 1.05, [1, 0.38, 0.14]);
}

function renderReadyAmbience(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 20, 0.11, 35, 1300, "flat");
  addPeriodicDrone(buffer, sampleRate, 65.41, 0.045, 20, 0.06);
  addPeriodicDrone(buffer, sampleRate, 98, 0.024, 10, 0.1);
  for (let index = 0; index < 75; index += 1) {
    const start = rng() * 19.7;
    addNoise(buffer, sampleRate, rng, start, 0.025 + rng() * 0.08, 0.06 + rng() * 0.13, 250, 4800, "decay");
  }
}

function renderGameAmbience(buffer, sampleRate, rng) {
  addNoise(buffer, sampleRate, rng, 0, 20, 0.075, 30, 980, "flat");
  addPeriodicDrone(buffer, sampleRate, 55, 0.042, 20, 0.055);
  addPeriodicDrone(buffer, sampleRate, 82.41, 0.025, 10, 0.09);
  for (let index = 0; index < 24; index += 1) {
    addNoise(buffer, sampleRate, rng, rng() * 19.6, 0.08 + rng() * 0.18, 0.035 + rng() * 0.05, 160, 1800, "rise-fall");
  }
}

function addDampedTone(buffer, sampleRate, start, frequency, duration, amplitude, decay, harmonics = [1], glide = 0) {
  const startIndex = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const progress = duration > 0 ? time / duration : 0;
    const currentFrequency = frequency + glide * progress;
    const attack = Math.min(1, time / 0.006);
    const envelope = attack * Math.exp(-decay * time);
    let value = 0;
    harmonics.forEach((gain, harmonicIndex) => {
      value += Math.sin(Math.PI * 2 * currentFrequency * (harmonicIndex + 1) * time) * gain;
    });
    buffer[startIndex + index] += value * envelope * amplitude;
  }
}

function addHornTone(buffer, sampleRate, start, frequency, duration, amplitude) {
  const startIndex = Math.floor(start * sampleRate);
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.18);
    const release = Math.min(1, (duration - time) / 0.5);
    const envelope = attack * release;
    const vibrato = 1 + Math.sin(time * Math.PI * 2 * 4.2) * 0.004;
    const phase = time * Math.PI * 2 * frequency * vibrato;
    const value = Math.sin(phase) + Math.sin(phase * 2) * 0.36 + Math.sin(phase * 3) * 0.16;
    buffer[startIndex + index] += value * amplitude * envelope;
  }
}

function addSweep(buffer, sampleRate, start, duration, fromFrequency, toFrequency, amplitude, shape) {
  const startIndex = Math.floor(start * sampleRate);
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const frequency = fromFrequency * Math.pow(toFrequency / fromFrequency, progress);
    phase += Math.PI * 2 * frequency / sampleRate;
    const envelope = envelopeFor(shape, progress);
    buffer[startIndex + index] += Math.sin(phase) * amplitude * envelope;
  }
}

function addNoise(buffer, sampleRate, rng, start, duration, amplitude, highpass, lowpass, shape) {
  const startIndex = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.min(buffer.length - startIndex, Math.floor(duration * sampleRate));
  if (length <= 0) return;
  const lowAlpha = lowpass ? 1 - Math.exp(-Math.PI * 2 * lowpass / sampleRate) : 1;
  const highAlpha = highpass ? 1 - Math.exp(-Math.PI * 2 * highpass / sampleRate) : 0;
  let lowState = 0;
  let highState = 0;
  for (let index = 0; index < length; index += 1) {
    const raw = rng() * 2 - 1;
    lowState += lowAlpha * (raw - lowState);
    highState += highAlpha * (lowState - highState);
    const filtered = highpass ? lowState - highState : lowState;
    const progress = index / Math.max(1, length - 1);
    buffer[startIndex + index] += filtered * amplitude * envelopeFor(shape, progress);
  }
}

function addPeriodicDrone(buffer, sampleRate, frequency, amplitude, period, phaseOffset) {
  for (let index = 0; index < buffer.length; index += 1) {
    const time = index / sampleRate;
    const breathe = 0.72 + 0.28 * Math.sin(Math.PI * 2 * time / period + phaseOffset);
    buffer[index] += Math.sin(Math.PI * 2 * frequency * time) * amplitude * breathe;
  }
}

function envelopeFor(shape, progress) {
  if (shape === "rise") return progress * progress;
  if (shape === "rise-fall") return Math.sin(Math.PI * progress) ** 1.4;
  if (shape === "flat") return 0.72 + 0.28 * Math.sin(Math.PI * progress) ** 2;
  return Math.exp(-6 * progress);
}

function softenEdges(samples, sampleRate, attackSeconds, releaseSeconds) {
  const attack = Math.min(samples.length, Math.floor(sampleRate * attackSeconds));
  const release = Math.min(samples.length, Math.floor(sampleRate * releaseSeconds));
  for (let index = 0; index < attack; index += 1) samples[index] *= index / Math.max(1, attack);
  for (let index = 0; index < release; index += 1) {
    samples[samples.length - 1 - index] *= index / Math.max(1, release);
  }
}

function makeSeamless(samples, sampleRate, seconds) {
  const length = Math.min(Math.floor(sampleRate * seconds), Math.floor(samples.length / 3));
  const tail = samples.slice(samples.length - length);
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    samples[index] = tail[index] * (1 - progress) + samples[index] * progress;
  }
}

function normalize(samples, targetPeak) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak <= 0) return;
  const gain = targetPeak / peak;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= gain;
}

function writeWav(path, samples, sampleRate) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    bytes.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + index * 2);
  }
  writeFileSync(path, bytes);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function copySceneReferences() {
  const references = isRevisionR1
    ? [
        ["lobby.png", join(roundOneOutputRoot, "screenshots", "lobby.png")],
        ["ready.png", join(roundOneOutputRoot, "screenshots", "ready.png")],
        ["game.png", join(roundOneOutputRoot, "screenshots", "game.png")]
      ]
    : [
        ["lobby.png", join(projectRoot, "client", "public", "assets", "generated-ui", "citadels-main-lobby-background-v5.png")],
        ["ready.png", join(projectRoot, "client", "public", "assets", "generated-ui", "citadels-ready-room-background-v3.png")],
        ["game.png", join(projectRoot, "client", "public", "assets", "generated-ui", "citadels-game-table-background-v2.png")]
      ];
  for (const [name, sourcePath] of references) {
    const destinationPath = join(screenshotDir, name);
    if (existsSync(sourcePath) && !existsSync(destinationPath)) copyFileSync(sourcePath, destinationPath);
  }
}

function verifyOutput() {
  const expectedOriginals = anchors.filter((item) => item.originalFile).map((item) => join(outputRoot, item.originalFile));
  const errors = [];
  let totalBytes = 0;
  for (const path of expectedOriginals) {
    if (!existsSync(path)) {
      errors.push(`missing ${path}`);
      continue;
    }
    const bytes = statSync(path).size;
    totalBytes += bytes;
    if (bytes < 1000) errors.push(`too small ${path}`);
    const wav = readFileSync(path);
    const header = wav.subarray(0, 12).toString("ascii");
    if (!header.startsWith("RIFF") || !header.includes("WAVE")) errors.push(`invalid WAV ${path}`);
    if (wav.length >= 46) {
      const sampleRate = wav.readUInt32LE(24);
      const bitsPerSample = wav.readUInt16LE(34);
      const dataBytes = wav.readUInt32LE(40);
      if (![32_000, 44_100].includes(sampleRate)) errors.push(`unexpected sample rate ${sampleRate}: ${path}`);
      if (bitsPerSample !== 16) errors.push(`unexpected bit depth ${bitsPerSample}: ${path}`);
      if (dataBytes + 44 !== wav.length) errors.push(`WAV data length mismatch: ${path}`);
      let peak = 0;
      let squareSum = 0;
      let sampleCount = 0;
      for (let offset = 44; offset + 1 < wav.length; offset += 2) {
        const sample = wav.readInt16LE(offset) / 32768;
        peak = Math.max(peak, Math.abs(sample));
        squareSum += sample * sample;
        sampleCount += 1;
      }
      const rms = Math.sqrt(squareSum / Math.max(1, sampleCount));
      if (peak > (isRevisionR1 ? 0.4 : 0.93)) errors.push(`peak too high ${peak.toFixed(3)}: ${path}`);
      if (rms < 0.0005) errors.push(`candidate is effectively silent ${rms.toFixed(6)}: ${path}`);
      if (isRevisionR1 && path.endsWith("crown-tick.wav")) {
        let firstAudibleSample = -1;
        for (let offset = 44, index = 0; offset + 1 < wav.length; offset += 2, index += 1) {
          if (Math.abs(wav.readInt16LE(offset) / 32768) >= 0.005) { firstAudibleSample = index; break; }
        }
        if (firstAudibleSample < 0 || firstAudibleSample / sampleRate > 0.02) {
          errors.push(`crown tick onset exceeds 20ms: ${path}`);
        }
      }
      if (path.includes("amb-")) {
        const first = wav.readInt16LE(44) / 32768;
        const last = wav.readInt16LE(wav.length - 2) / 32768;
        if (Math.abs(first - last) > 0.01) errors.push(`ambience loop boundary is abrupt: ${path}`);
      }
    }
  }
  for (const sourceItem of onlineSources) {
    const path = join(sourceDir, `${sourceItem.id}.mp3`);
    if ((shouldDownloadSources || shouldVerifyOnly) && (!existsSync(path) || statSync(path).size < 1000)) {
      errors.push(`missing online preview ${sourceItem.id}`);
    }
  }
  for (const name of ["lobby.png", "ready.png", "game.png"]) {
    if (!existsSync(join(screenshotDir, name))) errors.push(`missing screenshot ${name}`);
  }
  if (isRevisionR1) {
    const roleReveal = anchors.find((item) => item.id === "role-reveal");
    if (roleReveal.onlineRecipe.some((recipe) => recipe.sourceId.includes("metal") || recipe.sourceId.includes("bell"))) {
      errors.push("role reveal R1 still references a metal source");
    }
    for (const id of silentIds) {
      const item = anchors.find((anchorItem) => anchorItem.id === id);
      if (item.originalFile || item.onlineRecipe.length > 0) errors.push(`confirmed silent cue still has audio: ${id}`);
    }
    const scenarioAudioIds = new Set(scenarios.flatMap((scenario) => scenario.events.map((event) => event.anchorId)));
    for (const id of silentIds) if (scenarioAudioIds.has(id)) errors.push(`confirmed silent cue appears in a scenario: ${id}`);
  }
  if (totalBytes > 15 * 1024 * 1024) errors.push(`original candidate pack exceeds 15 MB: ${totalBytes}`);
  if (errors.length > 0) throw new Error(`Audio review verification failed:\n${errors.join("\n")}`);
  console.log(`Verified ${expectedOriginals.length} original candidates (${(totalBytes / 1024 / 1024).toFixed(2)} MB).`);
}

function reviewHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isRevisionR1 ? "《富饶之城》第一轮音频返工试听 R1" : "《富饶之城》第一轮音频方向试听"}</title>
  <link rel="icon" href="data:," />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="review-hero">
    <div>
      <span class="eyebrow">AUDIO REVIEW · ${isRevisionR1 ? "ROUND 01 · R1" : "ROUND 01"}</span>
      <h1>《富饶之城》${isRevisionR1 ? "音频返工试听 R1" : "音频方向试听"}</h1>
      <p>${isRevisionR1 ? "仅返工未通过与待定项目 · 已通过项冻结 · 未接入游戏" : "温暖写实奇幻桌游 · 候选未验收 · 未接入游戏"}</p>
    </div>
    <div class="status-seal"><strong>${isRevisionR1 ? "返工候选" : "试听候选"}</strong><span>NOT IN GAME</span></div>
  </header>
  <main>
    <section class="notice" aria-label="验收边界">
      <strong>硬性边界</strong>
      <p id="review-notice"></p>
      <p id="preview-notice"></p>
      <button id="unlock-audio" type="button">开始试听 / 解锁音频</button>
    </section>
    <section class="scene-strip" id="scene-strip" aria-label="当前 UI 场景参考"></section>
    <section class="section-heading">
      <div><span>IN-CONTEXT PREVIEW</span><h2>关键流程预演</h2></div>
      <button id="stop-all" type="button">停止全部声音</button>
    </section>
    <section class="scenario-grid" id="scenario-grid"></section>
    <section class="section-heading">
      <div><span>A / B / C CANDIDATES</span><h2>${isRevisionR1 ? "返工、待定与冻结项目" : "逐项试听与选择"}</h2></div>
      <div class="legend"><b>A 原创</b><b>B 在线素材</b><b>C 混合推荐</b>${isRevisionR1 ? "<b>已通过冻结</b><b>明确静音</b>" : ""}</div>
    </section>
    <section class="anchor-grid" id="anchor-grid"></section>
    <section class="sources" aria-label="在线素材来源">
      <div class="section-heading"><div><span>LICENSE RECORD</span><h2>在线候选与许可</h2></div></div>
      <div id="source-list"></div>
    </section>
    <section class="review-summary">
      <div><span>REVIEW RESULT</span><h2>生成验收摘要</h2></div>
      <p>选择和备注只保存在当前浏览器。复制摘要后发回即可；未明确通过的项目仍保持未接入。</p>
      <textarea id="summary-output" readonly aria-label="验收摘要"></textarea>
      <div><button id="refresh-summary" type="button">刷新摘要</button><button id="copy-summary" type="button">复制摘要</button></div>
    </section>
  </main>
  <footer>${isRevisionR1 ? "第一轮返工 R1 · 已通过项未覆盖 · 明确静音项不播放 · 未接入游戏" : "第一轮仅验证声音方向 · 未修改客户端音频层、正式资源目录或游戏协议"}</footer>
  <script src="review-data.js"></script>
  <script src="app.js"></script>
</body>
</html>`;
}

function reviewCss() {
  return `:root{color-scheme:dark;--ink:#f5e8c8;--muted:#b8aa8a;--gold:#d5b267;--gold2:#efcf86;--panel:rgba(12,21,26,.93);--soft:rgba(20,31,35,.84);--line:rgba(213,178,103,.36);--green:#6ebf85;--red:#d97568;--blue:#6ea8ce;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--ink);background:radial-gradient(circle at 50% -15%,#263d47 0,#101c24 36%,#070d12 78%);background-attachment:fixed}button,textarea{font:inherit}.review-hero{min-height:230px;padding:48px clamp(22px,6vw,96px);display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,rgba(7,13,18,.88),rgba(7,13,18,.25)),url("screenshots/lobby.png") center 44%/cover}.review-hero h1{margin:8px 0;font-family:"Noto Serif SC","Songti SC",serif;font-size:clamp(30px,4vw,58px);text-shadow:0 3px 18px #000}.review-hero p{margin:0;color:var(--gold2);font-size:18px}.eyebrow,.section-heading span,.review-summary>div>span{color:var(--gold);font-size:12px;letter-spacing:.18em;font-weight:800}.status-seal{width:128px;height:128px;display:grid;place-content:center;text-align:center;border:2px solid var(--gold);border-radius:50%;background:rgba(7,13,18,.76);box-shadow:0 0 0 7px rgba(213,178,103,.12),0 14px 40px #0008;transform:rotate(4deg)}.status-seal strong{font-family:"Noto Serif SC",serif;font-size:20px}.status-seal span{font-size:10px;letter-spacing:.1em;color:var(--gold)}main{width:min(1480px,94vw);margin:0 auto;padding:32px 0 70px}.notice{display:grid;grid-template-columns:auto 1fr;gap:6px 20px;align-items:center;padding:18px 22px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 18px 44px #0006}.notice strong{grid-row:1/3;color:var(--gold2);font-size:18px}.notice p{margin:0;color:var(--muted);line-height:1.55}.notice button{grid-column:2;justify-self:start;margin-top:8px}.scene-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:24px 0}.scene-card{min-height:180px;position:relative;overflow:hidden;border:1px solid var(--line);border-radius:14px;background-position:center;background-size:cover}.scene-card:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(5,10,14,.94),transparent 70%)}.scene-card div{position:absolute;z-index:1;left:18px;right:18px;bottom:16px}.scene-card strong{display:block;font-size:19px}.scene-card span{color:var(--gold2);font-size:12px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:18px;margin:36px 0 15px}.section-heading h2,.review-summary h2{margin:4px 0 0;font-family:"Noto Serif SC",serif;font-size:28px}.section-heading button,.notice button,.review-summary button,.scenario-card button,.candidate button,.status-buttons button{color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:9px 14px;background:linear-gradient(#29444e,#152932);cursor:pointer}.section-heading button:hover,.notice button:hover,.review-summary button:hover,.scenario-card button:hover,.candidate button:hover,.status-buttons button:hover{border-color:var(--gold2);box-shadow:0 0 14px #d5b26733}.scenario-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.scenario-card,.anchor-card,.review-summary,.sources{border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:0 14px 32px #0004}.scenario-card{padding:18px}.scenario-card h3{margin:0 0 8px}.scenario-card p{min-height:44px;margin:0 0 14px;color:var(--muted);line-height:1.45}.scenario-card small{display:block;margin-top:9px;color:var(--gold)}.legend{display:flex;gap:8px;flex-wrap:wrap}.legend b,.variant-label,.batch-badge{padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:12px}.anchor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.anchor-card{overflow:hidden}.anchor-card[data-batch-state="approved-frozen"]{border-color:rgba(110,191,133,.5)}.anchor-card[data-batch-state="confirmed-silent"]{border-color:rgba(110,168,206,.5)}.anchor-card[data-batch-state="pending-unchanged"]{border-color:rgba(213,178,103,.6)}.anchor-header{min-height:135px;position:relative;padding:18px;background-position:center;background-size:cover}.anchor-header:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,10,14,.95),rgba(5,10,14,.52))}.anchor-header>*{position:relative}.anchor-header h3{margin:7px 0 4px;font-size:23px}.anchor-header p{max-width:600px;margin:7px 0 0;color:#e8d8b7;line-height:1.45}.anchor-header small{color:var(--gold2)}.batch-badge{display:inline-block;color:var(--gold2);background:rgba(5,10,14,.7)}.candidate-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px}.candidate-row.is-single{grid-template-columns:1fr}.candidate{padding:12px;border:1px solid rgba(213,178,103,.22);border-radius:10px;background:var(--soft)}.candidate.is-selected{border-color:var(--gold2);box-shadow:0 0 14px #d5b26722}.candidate strong{display:block;margin-bottom:4px}.candidate p{min-height:34px;margin:0 0 9px;color:var(--muted);font-size:12px;line-height:1.4}.candidate-actions{display:flex;gap:6px}.candidate button{padding:6px 9px;font-size:12px}.candidate label{display:flex;align-items:center;gap:6px;margin-top:9px;color:var(--gold2);font-size:12px}.static-decision{padding:18px;color:var(--muted);line-height:1.55;background:var(--soft)}.static-decision strong{display:block;margin-bottom:6px;color:var(--gold2)}.review-controls{padding:0 14px 15px}.review-controls textarea{width:100%;min-height:64px;padding:10px;color:var(--ink);border:1px solid rgba(213,178,103,.22);border-radius:9px;background:#081116;resize:vertical}.status-buttons{display:flex;gap:7px;margin:10px 0}.status-buttons button{padding:6px 10px;font-size:12px}.status-buttons button.is-active[data-status="approved"]{border-color:var(--green);color:#b7edc5}.status-buttons button.is-active[data-status="revise"]{border-color:var(--red);color:#f2b3aa}.status-buttons button.is-active[data-status="pending"]{border-color:var(--gold);color:var(--gold2)}.sources{margin-top:28px;padding:0 20px 18px}.source-row{display:grid;grid-template-columns:1.2fr .8fr .7fr 1.3fr;gap:12px;padding:12px 0;border-top:1px solid rgba(213,178,103,.16);align-items:center}.source-row a{color:var(--gold2)}.source-row span,.source-row small{color:var(--muted)}.source-row .missing{color:var(--red)}.review-summary{margin-top:28px;padding:22px}.review-summary p{color:var(--muted)}.review-summary textarea{width:100%;min-height:220px;padding:14px;color:var(--ink);border:1px solid var(--line);border-radius:10px;background:#071014;resize:vertical}.review-summary>div:last-child{display:flex;gap:9px;margin-top:10px}footer{padding:24px;text-align:center;color:var(--muted);border-top:1px solid var(--line);background:#060c10}@media(max-width:980px){.review-hero{min-height:200px}.status-seal{display:none}.scenario-grid{grid-template-columns:repeat(2,1fr)}.anchor-grid{grid-template-columns:1fr}.scene-strip{grid-template-columns:1fr}.scene-card{min-height:150px}.source-row{grid-template-columns:1fr 1fr}}@media(max-width:650px){main{width:92vw}.notice{display:block}.notice strong{display:block;margin-bottom:8px}.notice p{margin-bottom:8px}.scenario-grid{grid-template-columns:1fr}.candidate-row{grid-template-columns:1fr}.source-row{grid-template-columns:1fr}.section-heading{align-items:start;flex-direction:column}.review-hero{padding:32px 20px}.review-hero h1{font-size:32px}}`;
}

function reviewAppJs() {
  return `(() => {
  const data = window.REVIEW_DATA;
  const stateKey = "zy-audio-review-" + data.version;
  const state = readState();
  let context = null;
  const buffers = new Map();
  const activeSources = new Set();
  const scenarioTimers = new Set();

  document.getElementById("review-notice").textContent = data.notice;
  document.getElementById("preview-notice").textContent = data.onlinePreviewNotice;
  renderScenes(); renderScenarios(); renderAnchors(); renderSources(); refreshSummary();

  document.getElementById("unlock-audio").addEventListener("click", async () => {
    await ensureContext();
    document.getElementById("unlock-audio").textContent = "音频已解锁";
  });
  document.getElementById("stop-all").addEventListener("click", stopAll);
  document.getElementById("refresh-summary").addEventListener("click", refreshSummary);
  document.getElementById("copy-summary").addEventListener("click", async () => {
    refreshSummary();
    const textarea = document.getElementById("summary-output");
    try { await navigator.clipboard.writeText(textarea.value); }
    catch { textarea.select(); document.execCommand("copy"); }
    document.getElementById("copy-summary").textContent = "已复制";
    setTimeout(() => document.getElementById("copy-summary").textContent = "复制摘要", 1200);
  });

  function renderScenes() {
    const scenes = [
      ["lobby", "大厅", "黄昏城市 · 菜单入口"],
      ["ready", "准备房", "石墙议事厅 · 玩家集结"],
      ["game", "对局", "深蓝桌布 · 木质牌桌"]
    ];
    document.getElementById("scene-strip").innerHTML = scenes.map(([id, title, copy]) =>
      '<article class="scene-card" style="background-image:url(&quot;' + data.screenshots[id] + '&quot;)"><div><span>当前 UI 参考</span><strong>' + title + '</strong><small>' + copy + '</small></div></article>'
    ).join("");
  }

  function renderScenarios() {
    document.getElementById("scenario-grid").innerHTML = data.scenarios.map((item) =>
      '<article class="scenario-card"><h3>' + item.title + '</h3><p>' + item.description + '</p><button type="button" data-scenario="' + item.id + '">播放预演</button><small>约 ' + item.duration + ' 秒 · 使用各项目当前选择版本</small></article>'
    ).join("");
    document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => playScenario(button.dataset.scenario)));
  }

  function renderAnchors() {
    document.getElementById("anchor-grid").innerHTML = data.anchors.map((item) => {
      const selection = state[item.id]?.variant || item.recommended;
      const status = state[item.id]?.status || defaultStatus(item);
      const note = escapeHtml(state[item.id]?.note || "");
      const batchState = item.batchState || "revision-pending";
      const header = '<header class="anchor-header" style="background-image:url(&quot;' + data.screenshots[item.scene] + '&quot;)"><span class="batch-badge">' + batchLabel(batchState) + '</span><small> · ' + item.trigger + '</small><h3>' + item.title + '</h3><p>' + item.description + '</p></header>';
      if (batchState === "confirmed-silent") {
        return '<article class="anchor-card" data-batch-state="' + batchState + '">' + header + '<div class="static-decision"><strong>明确静音</strong>此事件不提供音频候选，也不会出现在任何预演音轨中。正式游戏仍未修改。</div></article>';
      }
      if (batchState === "approved-frozen") {
        return '<article class="anchor-card" data-batch-state="' + batchState + '">' + header + '<div class="candidate-row is-single">' + candidate(item, "B", "已通过实录版", "沿用第一轮已通过文件，只可回听，不在 R1 重新选择。", "B", false) + '</div><div class="static-decision"><strong>通过未接入</strong>该项目已冻结，等待整包明确接入许可。</div></article>';
      }
      if (batchState === "pending-unchanged") {
        return '<article class="anchor-card" data-anchor-card="' + item.id + '" data-batch-state="' + batchState + '">' + header + '<div class="candidate-row is-single">' + candidate(item, "B", "原样继续待定", "沿用第一轮 B 版，本批未修改。", "B", false) + '</div>' + reviewControls(item.id, status, note) + '</article>';
      }
      return '<article class="anchor-card" data-anchor-card="' + item.id + '" data-batch-state="' + batchState + '">' + header +
        '<div class="candidate-row">' + candidate(item, "A", "R1 程序化原创", "降低峰值和高频，按本轮反馈重新合成。", selection) + candidate(item, "B", "R1 在线实录处理", "CC0 真实材质，经重新裁剪、降速、低通和增益控制。", selection) + candidate(item, "C", "R1 低增益混合", item.recommendation, selection) + '</div>' +
        reviewControls(item.id, status, note) + '</article>';
    }).join("");
    attachAnchorListeners();
  }

  function defaultStatus(item) {
    if (item.batchState === "approved-frozen") return "approved";
    if (item.batchState === "confirmed-silent") return "silent";
    return "pending";
  }

  function batchLabel(status) {
    return ({
      "revision-pending": "本次返工 · 待验收",
      "pending-unchanged": "原样继续待定",
      "approved-frozen": "已通过冻结",
      "confirmed-silent": "明确静音"
    })[status] || "待验收";
  }

  function reviewControls(id, status, note) {
    return '<div class="review-controls"><div class="status-buttons">' + statusButton(id, "pending", "未决定", status) + statusButton(id, "approved", "通过", status) + statusButton(id, "revise", "需修改", status) + '</div><textarea data-note="' + id + '" placeholder="填写听感、修改方向或使用场景">' + note + '</textarea></div>';
  }

  function attachAnchorListeners() {
    document.querySelectorAll("[data-play]").forEach((button) => button.addEventListener("click", () => playCandidate(button.dataset.anchorId, button.dataset.play, button.dataset.loop === "true")));
    document.querySelectorAll("[data-variant]").forEach((input) => input.addEventListener("change", () => updateVariant(input.dataset.anchorId, input.value)));
    document.querySelectorAll("[data-set-status]").forEach((button) => button.addEventListener("click", () => updateStatus(button.dataset.anchorId, button.dataset.setStatus)));
    document.querySelectorAll("[data-note]").forEach((textarea) => textarea.addEventListener("input", () => updateNote(textarea.dataset.note, textarea.value)));
    document.querySelectorAll("[data-stop-one]").forEach((button) => button.addEventListener("click", stopAll));
  }

  function candidate(item, variant, title, copy, selection, selectable = true) {
    const selected = selection === variant;
    const loop = item.kind === "ambience";
    const choice = selectable ? '<label><input type="radio" name="variant-' + item.id + '" value="' + variant + '" data-anchor-id="' + item.id + '" data-variant ' + (selected ? "checked" : "") + '>选用 ' + variant + ' 版</label>' : '';
    return '<section class="candidate ' + (selected ? "is-selected" : "") + '"><strong>' + variant + ' · ' + title + '</strong><p>' + copy + '</p><div class="candidate-actions"><button type="button" data-anchor-id="' + item.id + '" data-play="' + variant + '" data-loop="' + loop + '">播放</button><button type="button" data-stop-one>停止</button></div>' + choice + '</section>';
  }

  function statusButton(anchorId, status, label, current) {
    return '<button type="button" data-anchor-id="' + anchorId + '" data-set-status="' + status + '" data-status="' + status + '" class="' + (status === current ? "is-active" : "") + '">' + label + '</button>';
  }

  function renderSources() {
    document.getElementById("source-list").innerHTML = data.sources.map((item) =>
      '<div class="source-row"><div><strong>' + item.title + '</strong><small> by ' + item.author + '</small></div><a href="' + item.page + '" target="_blank" rel="noreferrer">原始页面</a><a href="' + item.licenseUrl + '" target="_blank" rel="noreferrer">' + item.license + '</a><span>' + item.purpose + ' · ' + (item.downloadDate || "未下载") + ' · <b class="' + (item.downloaded ? "" : "missing") + '">' + (item.downloaded ? "试听预览已缓存" : "试听预览缺失") + '</b></span></div>'
    ).join("");
  }

  async function playScenario(id) {
    stopAll();
    const scenario = data.scenarios.find((item) => item.id === id);
    if (!scenario) return;
    await ensureContext();
    for (const event of scenario.events) {
      const timer = setTimeout(() => {
        scenarioTimers.delete(timer);
        const anchor = data.anchors.find((item) => item.id === event.anchorId);
        const variant = state[event.anchorId]?.variant || anchor?.recommended || "C";
        playCandidate(event.anchorId, variant, false);
      }, event.at * 1000);
      scenarioTimers.add(timer);
    }
  }

  async function playCandidate(anchorId, variant, loop) {
    await ensureContext();
    const item = data.anchors.find((candidate) => candidate.id === anchorId);
    if (!item || item.batchState === "confirmed-silent" || !variant) return;
    const output = createPlaybackBus(item.kind, variant);
    if (variant === "A") return playOriginal(item, 1, loop, output);
    if (variant === "B") return playOnline(item, 1, loop, output);
    await Promise.all([playOriginal(item, item.kind === "ambience" ? 0.58 : 0.62, loop, output), playOnline(item, item.kind === "ambience" ? 0.4 : 0.44, loop, output)]);
  }

  async function playOriginal(item, gainScale, loop, output) {
    if (!item.originalFile) return;
    const buffer = await loadBuffer(item.originalFile);
    startBuffer(buffer, { gain: gainScale, loop, duration: item.kind === "ambience" ? (item.previewDuration || 20) : null, output });
  }

  async function playOnline(item, gainScale, loop, output) {
    for (const recipe of item.onlineRecipe) {
      const sourceMeta = data.sources.find((entry) => entry.id === recipe.sourceId);
      if (!sourceMeta?.downloaded) continue;
      const buffer = await loadBuffer(sourceMeta.file);
      startBuffer(buffer, { ...recipe, gain: recipe.gain * gainScale, loop, output });
    }
  }

  function createPlaybackBus(kind, variant) {
    const input = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    const master = context.createGain();
    master.gain.value = kind === "ambience" ? 0.72 : variant === "C" ? 0.82 : 0.9;
    input.connect(limiter); limiter.connect(master); master.connect(context.destination);
    return input;
  }

  function startBuffer(buffer, options) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate || 1;
    let tail = source;
    if (options.highpass) { const node = context.createBiquadFilter(); node.type = "highpass"; node.frequency.value = options.highpass; tail.connect(node); tail = node; }
    if (options.lowpass) { const node = context.createBiquadFilter(); node.type = "lowpass"; node.frequency.value = options.lowpass; tail.connect(node); tail = node; }
    const gain = context.createGain();
    const baseGain = options.gain ?? 1;
    gain.gain.value = baseGain;
    tail.connect(gain); gain.connect(options.output || context.destination);
    const offset = Math.min(options.offset || 0, Math.max(0, buffer.duration - 0.02));
    const requested = options.duration || Math.max(0.02, buffer.duration - offset);
    const duration = Math.min(requested, Math.max(0.02, buffer.duration - offset));
    if (options.loop) {
      source.loop = true;
      source.loopStart = offset;
      source.loopEnd = Math.min(buffer.duration, offset + duration);
      const startAt = context.currentTime + (options.delay || 0);
      const loopPeriod = Math.max(0.12, (source.loopEnd - source.loopStart) / source.playbackRate.value);
      const edgeFade = Math.min(0.06, loopPeriod * 0.18);
      gain.gain.cancelScheduledValues(startAt);
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(baseGain, startAt + edgeFade);
      for (let cycle = 1; cycle <= 24; cycle += 1) {
        const boundary = startAt + loopPeriod * cycle;
        gain.gain.setValueAtTime(baseGain, boundary - edgeFade);
        gain.gain.linearRampToValueAtTime(0, boundary);
        gain.gain.linearRampToValueAtTime(baseGain, boundary + edgeFade);
      }
      source.start(startAt, offset);
    }
    else source.start(context.currentTime + (options.delay || 0), offset, duration);
    activeSources.add(source); source.onended = () => activeSources.delete(source);
  }

  async function loadBuffer(path) {
    if (buffers.has(path)) return buffers.get(path);
    const response = await fetch(path);
    if (!response.ok) throw new Error("无法加载音频：" + path);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    buffers.set(path, buffer); return buffer;
  }

  async function ensureContext() {
    if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === "suspended") await context.resume();
    return context;
  }

  function stopAll() {
    for (const timer of scenarioTimers) clearTimeout(timer);
    scenarioTimers.clear();
    for (const source of activeSources) { try { source.stop(); } catch {} }
    activeSources.clear();
  }

  function updateVariant(id, variant) { state[id] = { ...(state[id] || {}), variant }; saveState(); renderAnchors(); refreshSummary(); }
  function updateStatus(id, status) { state[id] = { ...(state[id] || {}), status }; saveState(); renderAnchors(); refreshSummary(); }
  function updateNote(id, note) { state[id] = { ...(state[id] || {}), note }; saveState(); refreshSummary(); }
  function saveState() { localStorage.setItem(stateKey, JSON.stringify(state)); }
  function readState() { try { return JSON.parse(localStorage.getItem(stateKey) || "{}"); } catch { return {}; } }

  function refreshSummary() {
    const isRevision = data.batchMode === "revision-r1";
    const lines = [isRevision ? "《富饶之城》第一轮音频返工 R1 验收" : "《富饶之城》第一轮音频方向验收", "状态：候选、未接入", ""];
    data.anchors.forEach((item) => {
      const review = state[item.id] || {};
      if (item.batchState === "approved-frozen") {
        lines.push("- " + item.title + "：B 版 / 通过未接入（冻结）");
        return;
      }
      if (item.batchState === "confirmed-silent") {
        lines.push("- " + item.title + "：明确静音 / 未接入");
        return;
      }
      const status = review.status || "pending";
      const statusText = status === "approved" ? "通过" : status === "revise" ? "需修改" : "未决定";
      const inherited = item.batchState === "pending-unchanged" ? " / 原样继续待定" : "";
      lines.push("- " + item.title + "：" + (review.variant || item.recommended) + " 版 / " + statusText + inherited + (review.note ? " / " + review.note.trim() : ""));
    });
    lines.push("", "只有明确回复“验收通过，可以接入”后，才允许进入正式游戏。");
    document.getElementById("summary-output").value = lines.join("\\n");
  }

  function escapeHtml(value) {
    const entities = { 34: "&quot;", 38: "&amp;", 39: "&#039;", 60: "&lt;", 62: "&gt;" };
    return value.replace(/[&<>"']/g, (char) => entities[char.charCodeAt(0)]);
  }
})();`;
}

function reviewReadme() {
  return `# 《富饶之城》${isRevisionR1 ? "第一轮音频返工试听 R1" : "第一轮音频方向试听"}

状态：**${isRevisionR1 ? "返工候选、待验收、未接入游戏" : "候选、未验收、未接入游戏"}**。

## 启动

双击 \`启动试听.cmd\`，浏览器会打开 \`http://127.0.0.1:4179\`。

也可以在本目录运行：

\`\`\`powershell
python -m http.server 4179
\`\`\`

## 内容

${isRevisionR1 ? `- 本次只返工抽牌、多枚金币、皇冠两段、身份揭示、刺客两段、军阀、结算和对局音乐。
- 第一轮已通过的六项保持冻结；错误提示与最终回合明确静音；准备房 B 原样继续待定。
- A：降低峰值和高频后重新生成的固定种子原创 WAV。
- B：许可已核对为 CC0 的真实录音处理版。
- C：A 与 B 通过同一低增益总线和软限制器混合的推荐版。
- 六条 R1 流程预演不调用游戏代码。` : `- A：固定种子程序化原创 WAV。
- B：许可已核对为 CC0 的 Freesound 公开试听预览，经试听页实时裁剪、滤波和混音。
- C：A 与 B 的实时混合推荐版。
- 关键流程预演不调用游戏代码，只按当前演出时序在本页面内排程。`}

在线预览只用于方向评估。如最终选中 B/C，正式接入前仍需下载原始文件并再次核对许可。
`;
}

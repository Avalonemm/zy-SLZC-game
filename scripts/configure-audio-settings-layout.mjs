import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runDir = resolve(process.argv[2] || "output/ui-layout/audio-settings-preview-01");
const briefPath = resolve(runDir, "game-brief.json");
const blueprintPath = resolve(runDir, "ui-blueprint.json");
const initialPath = resolve(runDir, "ui-blueprint.initial.json");
const analysisPath = resolve(runDir, "reference-analysis.json");

const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const blueprint = JSON.parse(readFileSync(blueprintPath, "utf8"));

const analyses = [
  {
    id: "lobby",
    match: /lobby/i,
    name: "真实大厅截图",
    focalPoint: "中央游戏标题与创建/加入操作，设置入口固定在右上角工具组。",
    regionRelations: "工具组悬于背景上方；设置弹窗应居中覆盖但保留大厅轮廓作为场景锚点。",
    density: "主画面开阔，弹窗可采用中等宽度和较舒展的行距。",
    actionHierarchy: "关闭与静音是高频操作，滑块调整为主要内容。",
    responsiveAssumption: "紧凑视口时弹窗收窄但保持四行完整。"
  },
  {
    id: "game",
    match: /game|utility|table/i,
    name: "真实八人对局截图",
    focalPoint: "牌桌中央和底部本人手牌，设置入口在右上角工具组。",
    regionRelations: "弹窗需遮住桌面中部但不能扩展为全屏；背景变暗后仍能辨认当前对局。",
    density: "八人桌信息密集，设置面板必须单一主容器、低装饰、快速扫读。",
    actionHierarchy: "主音量与静音最高优先，其余三类为同级调节。",
    responsiveAssumption: "1365×668 下避免超过 520px 高度。"
  },
  {
    id: "result",
    match: /result|scoreboard/i,
    name: "真实八人结算截图",
    focalPoint: "城邦总榜和底部再来一局/返回大厅，当前没有设置入口。",
    regionRelations: "新增入口应位于右上角独立安全区，不与高光、榜单、聊天或底部行动冲突。",
    density: "榜单信息密集，入口只保留图标和短标签，弹窗仍复用全局样式。",
    actionHierarchy: "设置是辅助入口，视觉权重低于再来一局和返回大厅。",
    responsiveAssumption: "窄屏时入口仍固定右上并保持至少 44px 点击区。"
  }
];

brief.references = brief.references.map((reference) => {
  const analysis = analyses.find((item) => item.match.test(reference.name));
  if (!analysis) return reference;
  return {
    ...reference,
    name: analysis.name,
    analysisStatus: "analyzed",
    borrow: ["沿用真实页面中的右上工具入口语义", "保留深蓝、暖金与单层主容器", "让背景场景在遮罩后仍可辨认"],
    avoid: ["复制截图为最终背景资源", "遮挡结算底部主操作", "引入第二套设置导航"],
    observations: {
      focalPoint: analysis.focalPoint,
      regionRelations: analysis.regionRelations,
      density: analysis.density,
      actionHierarchy: analysis.actionHierarchy,
      responsiveAssumption: analysis.responsiveAssumption
    },
    confidence: "high"
  };
});

const viewports = blueprint.viewports;
const geometry = (wide, compact) => ({ wide, compact });
const makeNode = (id, role, kind, label, wide, compact, options = {}) => ({
  id,
  role,
  kind,
  label,
  geometry: geometry(wide, compact),
  requestedGeometry: geometry(wide, compact),
  layoutMode: options.layoutMode || "absolute",
  locked: Boolean(options.locked),
  hidden: false,
  zIndex: options.zIndex || 1,
  gap: options.gap || 10,
  styleRole: options.styleRole || "surface",
  content: options.content || {},
  constraints: {
    minWidth: options.minWidth || 44,
    minHeight: options.minHeight || 32,
    keepInsideSafeArea: true,
    ...(options.collisionGroup ? { collisionGroup: options.collisionGroup } : {})
  }
});

function baseNodes(modalWide, modalCompact, layout, entryWide, entryCompact) {
  const nodes = [
    makeNode("scene-anchor", "game:citadels/real-scene-reference", "board", "真实大厅 / 对局 / 结算截图锚点", { x: 16, y: 16, width: 1861, height: 849 }, { x: 16, y: 16, width: 1333, height: 636 }, { locked: true, styleRole: "canvas" }),
    makeNode("modal-dimmer", "choice-overlay", "overlay", "半透明深色遮罩，背景场景保持可辨认", { x: 16, y: 16, width: 1861, height: 849 }, { x: 16, y: 16, width: 1333, height: 636 }, { locked: true, zIndex: 2, styleRole: "overlay" }),
    makeNode("audio-settings-modal", "settings", "frame", layout.modalLabel, modalWide, modalCompact, { layoutMode: layout.modalMode, zIndex: 3, styleRole: "primary-surface" }),
    makeNode("settings-heading", "phase-header", "text", "设置 · 音频", layout.headingWide, layout.headingCompact, { zIndex: 4, styleRole: "header" }),
    makeNode("audio-sliders", "game:citadels/audio-buses", "action-zone", "主音量 100% · 环境音 40% · 游戏音效 80% · 界面音效 65%", layout.slidersWide, layout.slidersCompact, { collisionGroup: "hard", layoutMode: layout.sliderMode, zIndex: 4, styleRole: "action-surface", content: { rows: 4, values: [100, 40, 80, 65] } }),
    makeNode("mute-action", "game:citadels/master-mute", "action-zone", "全部静音 / 恢复声音", layout.muteWide, layout.muteCompact, { collisionGroup: "hard", zIndex: 4, styleRole: "action-surface" }),
    makeNode("settings-close", "utility-menu", "utility", "关闭", layout.closeWide, layout.closeCompact, { zIndex: 5, styleRole: "utility" }),
    makeNode("result-settings-entry", "utility-menu", "utility", "结算页设置入口", entryWide, entryCompact, { zIndex: 6, styleRole: "utility", minWidth: 44, minHeight: 44 })
  ];
  return nodes;
}

const concepts = {
  A: {
    name: "A · 均衡单列（推荐）",
    rationale: "保持现有设置弹窗语义：中等宽度、四行同构滑块、静音独立放在底部；结算入口置于右上角。",
    structuralAxes: { focalPoint: "balanced-control-stack", distribution: "centered-single-column", density: "balanced", interaction: "scan-and-adjust" },
    modal: {
      wide: { x: 617, y: 157, width: 660, height: 566 }, compact: { x: 405, y: 86, width: 555, height: 496 },
      layout: {
        modalLabel: "单层深蓝金边设置面板 · 660×566 / 555×496", modalMode: "column", sliderMode: "column",
        headingWide: { x: 657, y: 190, width: 580, height: 58 }, headingCompact: { x: 437, y: 113, width: 491, height: 52 },
        slidersWide: { x: 657, y: 270, width: 580, height: 302 }, slidersCompact: { x: 437, y: 184, width: 491, height: 258 },
        muteWide: { x: 657, y: 594, width: 580, height: 76 }, muteCompact: { x: 437, y: 458, width: 491, height: 64 },
        closeWide: { x: 1191, y: 181, width: 46, height: 46 }, closeCompact: { x: 882, y: 105, width: 46, height: 46 }
      },
      entryWide: { x: 1774, y: 32, width: 86, height: 62 }, entryCompact: { x: 1260, y: 24, width: 82, height: 58 }
    }
  },
  B: {
    name: "B · 宽幅双栏",
    rationale: "主音量和静音在左，三个分类在右；横向更紧凑，结算入口与底部行动同排但降低权重。",
    structuralAxes: { focalPoint: "master-volume-first", distribution: "wide-two-column", density: "compact-wide", interaction: "master-then-bus" },
    modal: {
      wide: { x: 516, y: 214, width: 860, height: 454 }, compact: { x: 309, y: 120, width: 748, height: 428 },
      layout: {
        modalLabel: "宽幅双栏设置面板 · 860×454 / 748×428", modalMode: "row", sliderMode: "grid",
        headingWide: { x: 556, y: 246, width: 780, height: 56 }, headingCompact: { x: 345, y: 150, width: 676, height: 52 },
        slidersWide: { x: 556, y: 326, width: 780, height: 216 }, slidersCompact: { x: 345, y: 224, width: 676, height: 202 },
        muteWide: { x: 556, y: 564, width: 780, height: 54 }, muteCompact: { x: 345, y: 446, width: 676, height: 54 },
        closeWide: { x: 1290, y: 238, width: 46, height: 46 }, closeCompact: { x: 975, y: 142, width: 46, height: 46 }
      },
      entryWide: { x: 1122, y: 804, width: 110, height: 54 }, entryCompact: { x: 782, y: 596, width: 102, height: 50 }
    }
  },
  C: {
    name: "C · 窄幅主控优先",
    rationale: "更窄更高，顶部先显示主音量与静音，分类滑块依次下排；结算入口使用右侧短标签。",
    structuralAxes: { focalPoint: "mute-and-master", distribution: "narrow-progressive-stack", density: "relaxed-tall", interaction: "mute-first" },
    modal: {
      wide: { x: 681, y: 109, width: 532, height: 654 }, compact: { x: 447, y: 46, width: 472, height: 576 },
      layout: {
        modalLabel: "窄幅主控优先面板 · 532×654 / 472×576", modalMode: "column", sliderMode: "column",
        headingWide: { x: 717, y: 142, width: 460, height: 58 }, headingCompact: { x: 479, y: 72, width: 408, height: 52 },
        slidersWide: { x: 717, y: 300, width: 460, height: 352 }, slidersCompact: { x: 479, y: 236, width: 408, height: 302 },
        muteWide: { x: 717, y: 218, width: 460, height: 60 }, muteCompact: { x: 479, y: 146, width: 408, height: 60 },
        closeWide: { x: 1131, y: 133, width: 46, height: 46 }, closeCompact: { x: 841, y: 64, width: 46, height: 46 }
      },
      entryWide: { x: 1817, y: 324, width: 60, height: 132 }, entryCompact: { x: 1297, y: 222, width: 52, height: 118 }
    }
  }
};

for (const [id, concept] of Object.entries(concepts)) {
  const prior = blueprint.concepts[id];
  const nodes = baseNodes(concept.modal.wide, concept.modal.compact, concept.modal.layout, concept.modal.entryWide, concept.modal.entryCompact);
  blueprint.concepts[id] = {
    ...prior,
    name: concept.name,
    rationale: concept.rationale,
    structuralAxes: concept.structuralAxes,
    referenceInfluence: {
      sourceIds: brief.references.map((reference) => reference.id),
      borrowed: ["右上设置入口语义", "深蓝暖金单层主容器", "背景场景在遮罩后可辨认"],
      intentionallyDifferent: ["不复制截图中的像素与装饰", "只设计音频设置，不改变大厅、牌桌或榜单布局"],
      interpretation: id === "A" ? "保持现有弹窗手感并强化扫读。" : id === "B" ? "用双栏压低高度。" : "用窄幅逐步操作突出主控。"
    },
    previews: prior.previews,
    screens: { match: { nodes } }
  };
}

blueprint.metadata.title = "《富饶之城》音频设置锚定预览";
blueprint.metadata.status = "draft";
blueprint.metadata.selectedConcept = null;
blueprint.metadata.activeTheme = "warm-tabletop";
blueprint.metadata.previewStatus = "pending";
blueprint.referenceAnalysis = { status: "ready", items: brief.references };
blueprint.layout.activeScreen = "match";
blueprint.layout.activeConcept = "A";
blueprint.layout.activeViewport = "wide";
blueprint.layout.activePreviewMode = "effect";
blueprint.tuning.parameters = [
  { id: "modal-width", label: "设置弹窗宽度", group: "弹窗", level: "quick", type: "range", target: "node:audio-settings-modal.width", min: 472, max: 860, step: 2, unit: "px", requested: 660, effective: 660 },
  { id: "modal-height", label: "设置弹窗高度", group: "弹窗", level: "quick", type: "range", target: "node:audio-settings-modal.height", min: 428, max: 654, step: 2, unit: "px", requested: 566, effective: 566 },
  { id: "slider-gap", label: "滑块行间距", group: "音频", level: "quick", type: "range", target: "node:audio-sliders.gap", min: 8, max: 28, step: 1, unit: "px", requested: 18, effective: 18 },
  { id: "result-entry-width", label: "结算设置入口宽度", group: "结算", level: "advanced", type: "range", target: "node:result-settings-entry.width", min: 44, max: 120, step: 2, unit: "px", requested: 86, effective: 86 }
];
blueprint.constraints.requiredScreens = brief.screens.map((screen) => screen.id);
blueprint.constraints.hiddenInformation = brief.information.hidden;
blueprint.constraints.contentLimits = brief.contentLimits;
blueprint.trial = {
  initialSatisfaction: null,
  selectedDirection: null,
  aiRefinementRounds: 0,
  manualTuning: "none",
  viewportChecks: [],
  outcome: "in-progress"
};

const analysis = { status: "ready", items: brief.references };
writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
writeFileSync(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
writeFileSync(initialPath, `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
writeFileSync(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");

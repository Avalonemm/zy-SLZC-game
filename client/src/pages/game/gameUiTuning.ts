import type { CSSProperties } from "react";

export type GameUiDensity = "roomy" | "standard" | "dense";

export type GameUiTuningConfigV4 = {
  selfCardWidth: number;
  handOverlap: number;
  handMaxWidth: number;
  playerPlateWidth: number;
  playerPlateHeight: number;
  avatarSize: number;
  resourceIconSize: number;
  resourceFontSize: number;
  resourceGap: number;
  opponentPlayerPlateWidth: number;
  opponentPlayerPlateHeight: number;
  opponentAvatarSize: number;
  opponentResourceIconSize: number;
  opponentResourceFontSize: number;
  opponentResourceGap: number;
  opponentRoleWidth: number;
  opponentHandWidth: number;
  opponentHandStackDepth: number;
  opponentDistrictWidth: number;
  actionDockWidth: number;
  actionDockRight: number;
  actionDockBottom: number;
  cardPreviewScale: number;
  activeRoleCardWidth: number;
  scoreStripScale: number;
  cornerDockLength: number;
  centerTop: number;
  cityTop: number;
  actionTop: number;
  selfBottom: number;
  showBounds: boolean;
};

export type GameUiTuningConfig = GameUiTuningConfigV4;

export type GameUiLayoutContext = {
  viewportWidth: number;
  viewportHeight: number;
  playerCount: number;
  handCount: number;
};

type StoredGameUiTuningV4 = {
  version: 4;
  config: GameUiTuningConfigV4;
};

type StoredGameUiTuningV3 = {
  version: 3;
  profiles: Partial<Record<GameUiDensity, Partial<GameUiTuningConfigV4>>>;
};

export const GAME_UI_TUNING_STORAGE_KEY = "zy-game-ui-tuning-v4";
const LEGACY_V3_STORAGE_KEY = "zy-game-ui-tuning-v3";
const LEGACY_V2_STORAGE_KEY = "zy-game-ui-tuning-v2";
const LEGACY_V1_STORAGE_KEY = "zy-game-ui-tuning-v1";

type NumericTuningKey = Exclude<keyof GameUiTuningConfigV4, "showBounds">;

export const gameUiTuningBounds: Record<NumericTuningKey, [number, number, number]> = {
  selfCardWidth: [54, 104, 1],
  handOverlap: [-48, 0, 1],
  handMaxWidth: [260, 820, 10],
  playerPlateWidth: [190, 320, 2],
  playerPlateHeight: [46, 78, 1],
  avatarSize: [34, 62, 1],
  resourceIconSize: [10, 22, 1],
  resourceFontSize: [11, 19, 1],
  resourceGap: [4, 14, 1],
  opponentPlayerPlateWidth: [190, 320, 2],
  opponentPlayerPlateHeight: [46, 78, 1],
  opponentAvatarSize: [34, 62, 1],
  opponentResourceIconSize: [10, 22, 1],
  opponentResourceFontSize: [11, 19, 1],
  opponentResourceGap: [4, 14, 1],
  opponentRoleWidth: [40, 72, 1],
  opponentHandWidth: [30, 58, 1],
  opponentHandStackDepth: [10, 26, 1],
  opponentDistrictWidth: [42, 72, 1],
  actionDockWidth: [220, 320, 2],
  actionDockRight: [2, 30, 0.5],
  actionDockBottom: [2, 12, 0.5],
  cardPreviewScale: [0.8, 1.4, 0.05],
  activeRoleCardWidth: [64, 112, 1],
  scoreStripScale: [0.8, 1.25, 0.05],
  cornerDockLength: [72, 116, 1],
  centerTop: [35, 58, 0.2],
  cityTop: [45, 65, 0.2],
  actionTop: [62, 80, 0.2],
  selfBottom: [1, 9, 0.2]
};

const globalPreset = createPreset({
  selfCardWidth: 84, handOverlap: -10, handMaxWidth: 650,
  playerPlateWidth: 280, playerPlateHeight: 60, avatarSize: 48,
  resourceIconSize: 16, resourceFontSize: 15, resourceGap: 9,
  opponentPlayerPlateWidth: 280, opponentPlayerPlateHeight: 60, opponentAvatarSize: 48,
  opponentResourceIconSize: 16, opponentResourceFontSize: 15, opponentResourceGap: 9,
  opponentRoleWidth: 58, opponentHandWidth: 45, opponentHandStackDepth: 20,
  opponentDistrictWidth: 60, actionDockWidth: 252, actionDockRight: 14,
  actionDockBottom: 5, cardPreviewScale: 1, activeRoleCardWidth: 92,
  scoreStripScale: 1, cornerDockLength: 92, centerTop: 44, cityTop: 55.2,
  actionTop: 71, selfBottom: 2.4
});

function createPreset(config: Omit<GameUiTuningConfigV4, "showBounds">): GameUiTuningConfigV4 {
  return { ...config, showBounds: false };
}

export function densityForPlayerCount(playerCount: number): GameUiDensity {
  if (playerCount <= 4) return "roomy";
  if (playerCount <= 6) return "standard";
  return "dense";
}

export function defaultGameUiTuning() {
  return { ...globalPreset };
}

function applyLowHeightCompression(input: GameUiTuningConfigV4) {
  return {
    ...input,
    selfCardWidth: Math.round(input.selfCardWidth * 0.9),
    playerPlateHeight: Math.round(input.playerPlateHeight * 0.9),
    avatarSize: Math.round(input.avatarSize * 0.9),
    resourceIconSize: Math.round(input.resourceIconSize * 0.9),
    opponentPlayerPlateHeight: Math.round(input.opponentPlayerPlateHeight * 0.9),
    opponentAvatarSize: Math.round(input.opponentAvatarSize * 0.9),
    opponentResourceIconSize: Math.round(input.opponentResourceIconSize * 0.9),
    opponentRoleWidth: Math.round(input.opponentRoleWidth * 0.9),
    opponentHandWidth: Math.round(input.opponentHandWidth * 0.9),
    opponentDistrictWidth: Math.round(input.opponentDistrictWidth * 0.9),
    activeRoleCardWidth: Math.max(64, Math.round(input.activeRoleCardWidth * 0.88))
  };
}

export function clampGameUiTuning(config: GameUiTuningConfigV4): GameUiTuningConfigV4 {
  const next = { ...config };
  for (const [key, [min, max]] of Object.entries(gameUiTuningBounds) as Array<
    [NumericTuningKey, [number, number, number]]
  >) {
    next[key] = Math.min(max, Math.max(min, Number(next[key]))) as never;
  }
  next.showBounds = Boolean(next.showBounds);
  return next;
}

const opponentDensityFactors: Record<GameUiDensity, number> = {
  roomy: 1,
  standard: 0.93,
  dense: 0.86
};

const opponentDensityKeys = [
  "opponentPlayerPlateWidth",
  "opponentPlayerPlateHeight",
  "opponentAvatarSize",
  "opponentResourceIconSize",
  "opponentResourceFontSize",
  "opponentResourceGap",
  "opponentRoleWidth",
  "opponentHandWidth",
  "opponentHandStackDepth",
  "opponentDistrictWidth"
] as const;

function applyOpponentDensity(input: GameUiTuningConfigV4, density: GameUiDensity) {
  const next = { ...input };
  const factor = opponentDensityFactors[density];
  for (const key of opponentDensityKeys) {
    const [minimum] = gameUiTuningBounds[key];
    next[key] = Math.max(minimum, Math.round(next[key] * factor));
  }
  return next;
}

export function resolveSafeGameUiTuning(input: GameUiTuningConfigV4, context: GameUiLayoutContext) {
  const lowHeight = context.viewportHeight <= 720;
  const compact = context.viewportWidth <= 1100 || (context.viewportWidth <= 1365 && context.viewportHeight <= 640);
  const density = densityForPlayerCount(context.playerCount);
  const requested = clampGameUiTuning(input);
  const compressed = lowHeight ? applyLowHeightCompression(requested) : requested;
  const config = applyOpponentDensity(compressed, density);
  const corrections: string[] = [];

  function applySafetyValue(
    key: NumericTuningKey,
    value: number,
    label: string,
    reason: string
  ) {
    const next = roundTuningValue(value, gameUiTuningBounds[key][2]);
    if (Math.abs(config[key] - next) < 0.0001) return;
    config[key] = next as never;
    corrections.push(`${label}：${formatTuningValue(requested[key])} → ${formatTuningValue(next)}（${reason}）`);
  }

  if (compact) {
    const maximumRoleWidth = context.viewportWidth <= 800 ? 64 : context.playerCount >= 7 ? 70 : 76;
    if (config.activeRoleCardWidth > maximumRoleWidth) {
      applySafetyValue("activeRoleCardWidth", maximumRoleWidth, "行动身份牌", "紧凑视口保留中央与底部安全带");
    }
    const maximumScoreScale = context.playerCount >= 7 ? 1 : 1.1;
    if (config.scoreStripScale > maximumScoreScale) {
      applySafetyValue("scoreStripScale", maximumScoreScale, "积分条缩放", "紧凑顶部最多保留两行");
    }
    if (config.cornerDockLength > 88) {
      applySafetyValue("cornerDockLength", 88, "日志聊天折叠长度", "紧凑视口同时避开对手区和底部牌堆");
    }

    const opponentRows = context.playerCount - 1 <= 4 ? 1 : 2;
    const opponentBottom = 72 + opponentRows * 88 + Math.max(0, opponentRows - 1) * 6;
    const timerClearance = 11;
    const minimumCenterTop = 100 * (
      opponentBottom + 8 + config.activeRoleCardWidth * 0.75 + timerClearance
    ) / context.viewportHeight;
    if (config.centerTop < minimumCenterTop) {
      applySafetyValue("centerTop", minimumCenterTop, "中央信息高度", "行动牌和倒计时避开对手区域");
    }

  } else if (lowHeight) {
    if (config.activeRoleCardWidth > 78) {
      applySafetyValue("activeRoleCardWidth", 78, "行动身份牌", "低高度桌面保留上下安全间距");
    }
    if (config.scoreStripScale > 1.1) {
      applySafetyValue("scoreStripScale", 1.1, "积分条缩放", "低高度顶部保留玩家座位空间");
    }
  } else if (context.viewportWidth <= 1300) {
    if (config.actionTop < 75) {
      applySafetyValue("actionTop", 75, "窄屏操作区高度", "避开两侧玩家的建筑牌");
    }
  }

  if (lowHeight && !compact && config.selfCardWidth > 76) {
    applySafetyValue("selfCardWidth", 76, "本人卡牌", "低高度桌面为建筑区和手牌保留安全间距");
  }
  if (!lowHeight && !compact && context.viewportWidth <= 1300 && config.selfCardWidth > 82) {
    applySafetyValue("selfCardWidth", 82, "本人卡牌", "中等宽度桌面为操作区和手牌保留安全间距");
  }
  if (!compact) {
    const maximumOpponentRoleWidth = lowHeight ? 44 : context.viewportWidth <= 1500 ? 50 : 58;
    const maximumOpponentHandWidth = lowHeight ? 36 : context.viewportWidth <= 1500 ? 42 : 45;
    const maximumOpponentDistrictWidth = lowHeight ? 44 : context.viewportWidth <= 1500 ? 50 : 56;
    if (config.opponentRoleWidth > maximumOpponentRoleWidth) {
      applySafetyValue("opponentRoleWidth", maximumOpponentRoleWidth, "对手身份牌", "极端尺寸下保持相邻座位的垂直安全间距");
    }
    if (config.opponentHandWidth > maximumOpponentHandWidth) {
      applySafetyValue("opponentHandWidth", maximumOpponentHandWidth, "对手手牌", "极端尺寸下保持手牌与相邻名片分离");
    }
    if (config.opponentDistrictWidth > maximumOpponentDistrictWidth) {
      applySafetyValue("opponentDistrictWidth", maximumOpponentDistrictWidth, "对手建筑牌", "极端尺寸下保持建筑、身份与相邻座位分离");
    }
  }
  if (!compact && context.viewportWidth > 1500 && config.actionDockRight < 15) {
    applySafetyValue("actionDockRight", 15, "操作区右侧间距", "宽屏操作区避开弃牌堆");
  }
  if (lowHeight && !compact && context.viewportWidth <= 1500 && config.actionDockRight < 15) {
    applySafetyValue("actionDockRight", 15, "操作区右侧间距", "右下操作区避开弃牌堆");
  }

  if (!compact) {
    const topPrivateRowTop = lowHeight ? 158 : context.viewportWidth > 1500 ? 194 : 181;
    const opponentBottom = topPrivateRowTop + config.opponentRoleWidth * 1.5;
    const minimumCenterTop = 100 * (
      opponentBottom + 10 + config.activeRoleCardWidth * 0.75
    ) / context.viewportHeight;
    if (config.centerTop < minimumCenterTop) {
      applySafetyValue("centerTop", minimumCenterTop, "中央信息高度", "行动牌避开顶部玩家的身份牌与建筑牌");
    }
  }
  if (lowHeight && !compact && context.viewportWidth <= 1500 && config.actionDockRight < 15) {
    applySafetyValue("actionDockRight", 15, "操作区右侧间距", "右下操作区避开弃牌堆");
  }

  // The active role card is centered on --ui-center-top. Reserve its real lower
  // half plus the hard gap before the city begins, in every viewport mode.
  const minimumCityTop = config.centerTop + 100 * (
    config.activeRoleCardWidth * 0.75 + 10
  ) / context.viewportHeight;
  if (config.cityTop < minimumCityTop) {
    applySafetyValue("cityTop", minimumCityTop, "自己的建筑高度", "建筑区避开行动身份牌");
  }

  // Compact and regular medium-width tables keep the normal action dock in the
  // central vertical lane. Derive its center from the rendered city/button sizes.
  // Low-height desktop and wide tables use the right-side lane instead.
  const actionUsesCentralLane = compact || (!lowHeight && context.viewportWidth <= 1500);
  if (actionUsesCentralLane) {
    // The compact count is an out-of-flow side label, so the hard city region
    // is the 66px card row instead of the previous 78px stacked block.
    const cityHeight = compact ? 66 : 140;
    const actionHeight = compact ? 38 : 44;
    const minimumActionTop = config.cityTop + 100 * (
      cityHeight + 10 + actionHeight / 2
    ) / context.viewportHeight;
    if (config.actionTop < minimumActionTop) {
      applySafetyValue("actionTop", Math.min(80, minimumActionTop), "窄屏操作区高度", "操作区避开本人建筑区");
    }
  }

  const densityPlateLimit = density === "dense"
    ? Math.max(210, Math.min(270, context.viewportWidth * 0.145))
    : Math.max(230, Math.min(300, context.viewportWidth * 0.18));
  const viewportPlateLimit = compact ? densityPlateLimit : context.viewportWidth <= 1500 ? 220 : 270;
  const plateLimit = Math.min(densityPlateLimit, viewportPlateLimit);
  if (config.opponentPlayerPlateWidth > plateLimit) {
    config.opponentPlayerPlateWidth = Math.floor(plateLimit);
    corrections.push("对手名片已限制在当前人数的座位轨道内。");
  }

  if (context.viewportWidth >= 1200) {
    const minimumHandWidth = context.viewportWidth <= 1500 ? 260 : 300;
    const center = context.viewportWidth / 2;
    const selfAreaInset = context.viewportWidth <= 1500 ? context.viewportWidth * 0.08 : context.viewportWidth * 0.085;
    const outerColumnGap = Math.min(20, Math.max(12, context.viewportWidth * 0.01));
    const identityColumnGap = Math.min(14, Math.max(8, context.viewportWidth * 0.008));
    const hardGap = lowHeight ? 4 : 6;

    // The identity cluster and the hand track are separate hard UI regions. If the
    // tuned cards/nameplate cannot coexist with the minimum hand track, reduce the
    // nameplate first and then the cards instead of letting either container overlap.
    const identityLaneBudget = center - selfAreaInset - minimumHandWidth / 2 - outerColumnGap - hardGap;
    let maximumPlateWidth = Math.floor(identityLaneBudget - config.selfCardWidth * 2 - identityColumnGap * 2);
    if (maximumPlateWidth < gameUiTuningBounds.playerPlateWidth[0]) {
      const maximumCardWidth = Math.floor(
        (identityLaneBudget - gameUiTuningBounds.playerPlateWidth[0] - identityColumnGap * 2) / 2
      );
      if (config.selfCardWidth > maximumCardWidth) {
        config.selfCardWidth = Math.max(gameUiTuningBounds.selfCardWidth[0], maximumCardWidth);
        corrections.push("自己的卡牌已缩到当前屏幕的安全尺寸，避免与手牌轨道穿插。");
      }
      maximumPlateWidth = Math.floor(identityLaneBudget - config.selfCardWidth * 2 - identityColumnGap * 2);
    }
    if (config.playerPlateWidth > maximumPlateWidth) {
      config.playerPlateWidth = Math.max(gameUiTuningBounds.playerPlateWidth[0], maximumPlateWidth);
      corrections.push("自己的名片已收窄，确保身份牌与手牌轨道保持安全间距。");
    }

    const minimumActionLeft = center + minimumHandWidth / 2 + 24;
    const maximumRight = 100 * (1 - (minimumActionLeft + config.actionDockWidth) / context.viewportWidth);
    if (config.actionDockRight > maximumRight) {
      config.actionDockRight = Math.max(gameUiTuningBounds.actionDockRight[0], Math.floor(maximumRight * 2) / 2);
      corrections.push("操作区已限制在手牌安全区右侧；继续左移会压住手牌。");
    }

    const actionLeft = context.viewportWidth * (1 - config.actionDockRight / 100) - config.actionDockWidth;
    const safeHandWidth = Math.max(minimumHandWidth, Math.floor(2 * (actionLeft - center - 24)));
    if (config.handMaxWidth > safeHandWidth) {
      config.handMaxWidth = safeHandWidth;
      corrections.push("手牌安全宽度已随操作区位置自动收窄。");
    }

    const identityWidth = config.selfCardWidth * 2 + config.playerPlateWidth + identityColumnGap * 2;
    const identitySafeHandWidth = Math.max(
      minimumHandWidth,
      Math.floor(2 * (center - selfAreaInset - outerColumnGap - hardGap - identityWidth))
    );
    if (config.handMaxWidth > identitySafeHandWidth) {
      config.handMaxWidth = identitySafeHandWidth;
      corrections.push("手牌安全宽度已避开左侧牌堆、名片和身份牌。");
    }

  }

  if (context.handCount > 1) {
    const preferredStep = Math.max(1, config.selfCardWidth + config.handOverlap);
    const preferredWidth = config.selfCardWidth + (context.handCount - 1) * preferredStep;
    if (preferredWidth > config.handMaxWidth) {
      const safeStep = Math.max(1, (config.handMaxWidth - config.selfCardWidth) / (context.handCount - 1));
      config.handOverlap = Math.floor(safeStep - config.selfCardWidth);
      corrections.push("已根据当前手牌数量加深叠放，所有手牌保持在安全区域内。");
    }
  }

  return { config, corrections: [...new Set(corrections)] };
}

function roundTuningValue(value: number, step: number) {
  const precision = step < 0.1 ? 100 : step < 1 ? 10 : 1;
  return Math.round(value * precision) / precision;
}

function formatTuningValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function readStoredGameUiTuning(
  fallback: GameUiTuningConfigV4,
  density: GameUiDensity
): { config: GameUiTuningConfigV4; hasApplied: boolean } {
  try {
    const store = readV4Store();
    if (store) {
      return { config: clampGameUiTuning({ ...fallback, ...store.config }), hasApplied: true };
    }

    const legacyV3Raw = window.localStorage.getItem(LEGACY_V3_STORAGE_KEY);
    if (legacyV3Raw) {
      const legacyStore = JSON.parse(legacyV3Raw) as StoredGameUiTuningV3;
      const profile = legacyStore?.version === 3 ? legacyStore.profiles?.[density] : null;
      if (profile) {
        const migrated = migrateLegacyConfig(fallback, profile, density);
        saveStoredGameUiTuning(migrated);
        return { config: migrated, hasApplied: true };
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_V2_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_V1_STORAGE_KEY);
    if (!legacyRaw) return { config: fallback, hasApplied: false };
    const migrated = migrateLegacyConfig(fallback, JSON.parse(legacyRaw), density);
    saveStoredGameUiTuning(migrated);
    return { config: migrated, hasApplied: true };
  } catch {
    return { config: fallback, hasApplied: false };
  }
}

export function saveStoredGameUiTuning(config: GameUiTuningConfigV4) {
  const store: StoredGameUiTuningV4 = {
    version: 4,
    config: clampGameUiTuning(config)
  };
  window.localStorage.setItem(GAME_UI_TUNING_STORAGE_KEY, JSON.stringify(store));
}

export function clearStoredGameUiTuning() {
  window.localStorage.removeItem(GAME_UI_TUNING_STORAGE_KEY);
}

function readV4Store(): StoredGameUiTuningV4 | null {
  const raw = window.localStorage.getItem(GAME_UI_TUNING_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredGameUiTuningV4;
  return parsed?.version === 4 && parsed.config ? parsed : null;
}

function migrateLegacyConfig(
  fallback: GameUiTuningConfigV4,
  legacy: Partial<GameUiTuningConfigV4>,
  density: GameUiDensity
) {
  const factor = opponentDensityFactors[density];
  const migrated = {
    ...fallback,
    ...legacy,
    cardPreviewScale: legacy.cardPreviewScale ?? fallback.cardPreviewScale,
    opponentPlayerPlateWidth: Math.round((legacy.playerPlateWidth ?? fallback.opponentPlayerPlateWidth) / factor),
    opponentPlayerPlateHeight: Math.round((legacy.playerPlateHeight ?? fallback.opponentPlayerPlateHeight) / factor),
    opponentAvatarSize: Math.round((legacy.avatarSize ?? fallback.opponentAvatarSize) / factor),
    opponentResourceIconSize: Math.round((legacy.resourceIconSize ?? fallback.opponentResourceIconSize) / factor),
    opponentResourceFontSize: Math.round((legacy.resourceFontSize ?? fallback.opponentResourceFontSize) / factor),
    opponentResourceGap: Math.round((legacy.resourceGap ?? fallback.opponentResourceGap) / factor),
    opponentRoleWidth: Math.round((legacy.opponentRoleWidth ?? fallback.opponentRoleWidth) / factor),
    opponentHandWidth: Math.round((legacy.opponentHandWidth ?? fallback.opponentHandWidth) / factor),
    opponentHandStackDepth: Math.round((legacy.opponentHandStackDepth ?? fallback.opponentHandStackDepth) / factor),
    opponentDistrictWidth: Math.round((legacy.opponentDistrictWidth ?? fallback.opponentDistrictWidth) / factor)
  };
  return clampGameUiTuning(migrated);
}

export function gameUiTuningStyle(config: GameUiTuningConfigV4): CSSProperties {
  return {
    "--ui-self-card-width": `${config.selfCardWidth}px`,
    "--ui-hand-overlap": `${config.handOverlap}px`,
    "--ui-hand-max-width": `${config.handMaxWidth}px`,
    "--ui-self-player-plate-width": `${config.playerPlateWidth}px`,
    "--ui-self-player-plate-height": `${config.playerPlateHeight}px`,
    "--ui-self-avatar-size": `${config.avatarSize}px`,
    "--ui-self-resource-icon-size": `${config.resourceIconSize}px`,
    "--ui-self-resource-font-size": `${config.resourceFontSize}px`,
    "--ui-self-resource-gap": `${config.resourceGap}px`,
    "--ui-opponent-player-plate-width": `${config.opponentPlayerPlateWidth}px`,
    "--ui-opponent-player-plate-height": `${config.opponentPlayerPlateHeight}px`,
    "--ui-opponent-avatar-size": `${config.opponentAvatarSize}px`,
    "--ui-opponent-resource-icon-size": `${config.opponentResourceIconSize}px`,
    "--ui-opponent-resource-font-size": `${config.opponentResourceFontSize}px`,
    "--ui-opponent-resource-gap": `${config.opponentResourceGap}px`,
    "--ui-opponent-role-width": `${config.opponentRoleWidth}px`,
    "--ui-opponent-hand-width": `${config.opponentHandWidth}px`,
    "--ui-opponent-hand-stack-depth": `${config.opponentHandStackDepth}px`,
    "--ui-opponent-district-width": `${config.opponentDistrictWidth}px`,
    "--ui-action-dock-width": `${config.actionDockWidth}px`,
    "--ui-action-dock-right": `${config.actionDockRight}%`,
    "--ui-action-dock-bottom": `${config.actionDockBottom}%`,
    "--ui-card-preview-scale": String(config.cardPreviewScale),
    "--ui-active-role-card-width": `${config.activeRoleCardWidth}px`,
    "--ui-score-strip-scale": String(config.scoreStripScale),
    "--ui-corner-dock-length": `${config.cornerDockLength}px`,
    "--ui-score-strip-label-font-size": `${roundCssNumber(0.7 * config.scoreStripScale)}rem`,
    "--ui-score-strip-item-font-size": `${roundCssNumber(0.66 * config.scoreStripScale)}rem`,
    "--ui-score-strip-gap": `${roundCssNumber(5 * config.scoreStripScale)}px`,
    "--ui-score-strip-padding-y": `${roundCssNumber(6 * config.scoreStripScale)}px`,
    "--ui-score-strip-padding-x": `${roundCssNumber(10 * config.scoreStripScale)}px`,
    "--ui-score-strip-compact-height": `${roundCssNumber(54 * config.scoreStripScale)}px`,
    "--ui-score-strip-compact-row-height": `${roundCssNumber(17 * config.scoreStripScale)}px`,
    "--ui-score-strip-compact-label-font-size": `${roundCssNumber(0.52 * config.scoreStripScale)}rem`,
    "--ui-score-strip-compact-item-font-size": `${roundCssNumber(0.52 * config.scoreStripScale)}rem`,
    "--ui-score-strip-compact-gap": `${roundCssNumber(4 * config.scoreStripScale)}px`,
    "--ui-score-strip-compact-padding-y": `${roundCssNumber(4 * config.scoreStripScale)}px`,
    "--ui-score-strip-compact-padding-x": `${roundCssNumber(6 * config.scoreStripScale)}px`,
    "--ui-center-top": `${config.centerTop}%`,
    "--ui-city-top": `${config.cityTop}%`,
    "--ui-action-top": `${config.actionTop}%`,
    "--ui-self-bottom": `${config.selfBottom}%`
  } as CSSProperties;
}

function roundCssNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function canShowUiTuningPanel() {
  const requested = new URLSearchParams(window.location.search).get("uiTune") === "1";
  return import.meta.env.DEV && requested;
}

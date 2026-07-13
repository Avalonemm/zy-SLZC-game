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
  centerTop: [35, 51, 0.2],
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
  actionDockBottom: 5, cardPreviewScale: 1, centerTop: 44, cityTop: 55.2,
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
    centerTop: Math.min(40.5, input.centerTop - 0.3),
    cityTop: 45.8,
    actionTop: 66.5
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
  const density = densityForPlayerCount(context.playerCount);
  const compressed = lowHeight ? applyLowHeightCompression(clampGameUiTuning(input)) : clampGameUiTuning(input);
  const config = applyOpponentDensity(compressed, density);
  const corrections: string[] = [];

  if (lowHeight) {
    config.actionTop = Math.max(66.2, Math.min(config.actionTop, 66.8));
    config.cityTop = Math.min(config.cityTop, 45.8);
  } else if (context.viewportWidth <= 1300) {
    config.actionTop = Math.max(config.actionTop, 75);
    corrections.push("窄桌面的操作区已下移，避开两侧玩家的建筑牌。");
  }

  const maximumCityTop = config.actionTop - 8;
  if (config.cityTop > maximumCityTop) {
    config.cityTop = maximumCityTop;
    corrections.push("已上移自己的建筑区，避免进入操作区。");
  }
  const maximumCenterTop = lowHeight ? 40.5 : config.cityTop - 8;
  if (config.centerTop > maximumCenterTop) {
    config.centerTop = maximumCenterTop;
    corrections.push("已上移中央信息，避免与建筑区穿插。");
  }

  const plateLimit = density === "dense"
    ? Math.max(210, Math.min(270, context.viewportWidth * 0.145))
    : Math.max(230, Math.min(300, context.viewportWidth * 0.18));
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
    "--ui-center-top": `${config.centerTop}%`,
    "--ui-city-top": `${config.cityTop}%`,
    "--ui-action-top": `${config.actionTop}%`,
    "--ui-self-bottom": `${config.selfBottom}%`
  } as CSSProperties;
}

export function canShowUiTuningPanel() {
  const requested = new URLSearchParams(window.location.search).get("uiTune") === "1";
  return import.meta.env.DEV && requested;
}

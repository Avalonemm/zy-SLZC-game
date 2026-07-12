import type { CSSProperties } from "react";

export type GameUiDensity = "roomy" | "standard" | "dense";

export type GameUiTuningConfig = {
  selfCardWidth: number;
  handOverlap: number;
  handMaxWidth: number;
  playerPlateWidth: number;
  playerPlateHeight: number;
  avatarSize: number;
  resourceIconSize: number;
  resourceFontSize: number;
  resourceGap: number;
  opponentRoleWidth: number;
  opponentHandWidth: number;
  opponentHandStackDepth: number;
  opponentDistrictWidth: number;
  actionDockWidth: number;
  actionDockRight: number;
  actionDockBottom: number;
  centerTop: number;
  cityTop: number;
  actionTop: number;
  selfBottom: number;
  showBounds: boolean;
};

export const GAME_UI_TUNING_STORAGE_KEY = "zy-game-ui-tuning-v2";
const LEGACY_GAME_UI_TUNING_STORAGE_KEY = "zy-game-ui-tuning-v1";

type NumericTuningKey = Exclude<keyof GameUiTuningConfig, "showBounds">;

export const gameUiTuningBounds: Record<NumericTuningKey, [number, number, number]> = {
  selfCardWidth: [54, 104, 1],
  handOverlap: [-30, 0, 1],
  handMaxWidth: [300, 820, 10],
  playerPlateWidth: [190, 320, 2],
  playerPlateHeight: [46, 78, 1],
  avatarSize: [34, 62, 1],
  resourceIconSize: [10, 22, 1],
  resourceFontSize: [11, 19, 1],
  resourceGap: [4, 14, 1],
  opponentRoleWidth: [40, 72, 1],
  opponentHandWidth: [30, 58, 1],
  opponentHandStackDepth: [10, 26, 1],
  opponentDistrictWidth: [42, 72, 1],
  actionDockWidth: [220, 320, 2],
  actionDockRight: [2, 14, 0.5],
  actionDockBottom: [2, 12, 0.5],
  centerTop: [35, 51, 0.2],
  cityTop: [45, 65, 0.2],
  actionTop: [62, 80, 0.2],
  selfBottom: [1, 9, 0.2]
};

const densityPresets: Record<GameUiDensity, GameUiTuningConfig> = {
  roomy: createPreset({
    selfCardWidth: 84, handOverlap: -10, handMaxWidth: 650,
    playerPlateWidth: 280, playerPlateHeight: 60, avatarSize: 48,
    resourceIconSize: 16, resourceFontSize: 15, resourceGap: 9,
    opponentRoleWidth: 58, opponentHandWidth: 45, opponentHandStackDepth: 20,
    opponentDistrictWidth: 60, actionDockWidth: 252, actionDockRight: 14,
    actionDockBottom: 5, centerTop: 44, cityTop: 55.2, actionTop: 71,
    selfBottom: 2.4
  }),
  standard: createPreset({
    selfCardWidth: 78, handOverlap: -14, handMaxWidth: 600,
    playerPlateWidth: 268, playerPlateHeight: 56, avatarSize: 46,
    resourceIconSize: 15, resourceFontSize: 14, resourceGap: 8,
    opponentRoleWidth: 54, opponentHandWidth: 42, opponentHandStackDepth: 18,
    opponentDistrictWidth: 56, actionDockWidth: 246, actionDockRight: 14,
    actionDockBottom: 5, centerTop: 44, cityTop: 55.2, actionTop: 70,
    selfBottom: 2.4
  }),
  dense: createPreset({
    selfCardWidth: 72, handOverlap: -17, handMaxWidth: 540,
    playerPlateWidth: 248, playerPlateHeight: 52, avatarSize: 42,
    resourceIconSize: 14, resourceFontSize: 13, resourceGap: 7,
    opponentRoleWidth: 50, opponentHandWidth: 38, opponentHandStackDepth: 16,
    opponentDistrictWidth: 52, actionDockWidth: 236, actionDockRight: 14,
    actionDockBottom: 4, centerTop: 43.5, cityTop: 55.2, actionTop: 68,
    selfBottom: 2
  })
};

function createPreset(config: Omit<GameUiTuningConfig, "showBounds">): GameUiTuningConfig {
  return { ...config, showBounds: false };
}

export function densityForPlayerCount(playerCount: number): GameUiDensity {
  if (playerCount <= 4) return "roomy";
  if (playerCount <= 6) return "standard";
  return "dense";
}

export function defaultGameUiTuning(playerCount: number, lowHeight: boolean) {
  const preset = { ...densityPresets[densityForPlayerCount(playerCount)] };
  if (!lowHeight) return preset;

  return resolveSafeGameUiTuning({
    ...preset,
    selfCardWidth: Math.round(preset.selfCardWidth * 0.9),
    playerPlateHeight: Math.round(preset.playerPlateHeight * 0.9),
    avatarSize: Math.round(preset.avatarSize * 0.9),
    resourceIconSize: Math.round(preset.resourceIconSize * 0.9),
    opponentRoleWidth: Math.round(preset.opponentRoleWidth * 0.9),
    opponentHandWidth: Math.round(preset.opponentHandWidth * 0.9),
    opponentDistrictWidth: Math.round(preset.opponentDistrictWidth * 0.9),
    centerTop: preset.centerTop - 0.8,
    cityTop: 45.3,
    actionTop: 69.7
  }, 1365, true).config;
}

export function clampGameUiTuning(config: GameUiTuningConfig): GameUiTuningConfig {
  const next = { ...config };
  for (const [key, [min, max]] of Object.entries(gameUiTuningBounds) as Array<
    [NumericTuningKey, [number, number, number]]
  >) {
    next[key] = Math.min(max, Math.max(min, Number(next[key]))) as never;
  }
  next.showBounds = Boolean(next.showBounds);
  return next;
}

export function resolveSafeGameUiTuning(
  input: GameUiTuningConfig,
  viewportWidth: number,
  lowHeight: boolean
) {
  const config = clampGameUiTuning(input);
  const corrections: string[] = [];

  if (lowHeight) {
    const safeActionTop = Math.max(69.5, Math.min(config.actionTop, 69.7));
    if (safeActionTop !== config.actionTop) {
      config.actionTop = safeActionTop;
      corrections.push("低高度屏幕已将操作区限制在建筑区与手牌区之间。");
    }
    if (config.cityTop > 45.3) {
      config.cityTop = 45.3;
      corrections.push("低高度屏幕已上移建筑区，避免与操作区穿插。");
    }
  }

  const maximumCityTop = config.actionTop - 8;
  if (config.cityTop > maximumCityTop) {
    config.cityTop = maximumCityTop;
    corrections.push("已限制自己的建筑区高度，避免进入操作区。");
  }
  const maximumCenterTop = lowHeight ? 40 : config.cityTop - 8;
  if (config.centerTop > maximumCenterTop) {
    config.centerTop = maximumCenterTop;
    corrections.push("已限制中央信息高度，避免与建筑区穿插。");
  }

  if (viewportWidth >= 1501) {
    const actionLeft = viewportWidth * (1 - config.actionDockRight / 100) - config.actionDockWidth;
    const safeHandWidth = Math.floor(2 * (actionLeft - viewportWidth / 2 - 24));
    if (safeHandWidth > 300 && config.handMaxWidth > safeHandWidth) {
      config.handMaxWidth = Math.max(300, safeHandWidth);
      corrections.push("已限制手牌区宽度，避免进入右侧操作台。");
    }
  }

  return { config, corrections };
}

export function readStoredGameUiTuning(fallback: GameUiTuningConfig) {
  try {
    const raw = window.localStorage.getItem(GAME_UI_TUNING_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_GAME_UI_TUNING_STORAGE_KEY);
    if (!raw) return fallback;
    const merged = { ...fallback, ...JSON.parse(raw) } as GameUiTuningConfig;
    return resolveSafeGameUiTuning(
      merged,
      window.innerWidth,
      window.innerHeight <= 720
    ).config;
  } catch {
    return fallback;
  }
}

export function gameUiTuningStyle(config: GameUiTuningConfig): CSSProperties {
  return {
    "--ui-self-card-width": `${config.selfCardWidth}px`,
    "--ui-hand-overlap": `${config.handOverlap}px`,
    "--ui-hand-max-width": `${config.handMaxWidth}px`,
    "--ui-player-plate-width": `${config.playerPlateWidth}px`,
    "--ui-player-plate-height": `${config.playerPlateHeight}px`,
    "--ui-avatar-size": `${config.avatarSize}px`,
    "--ui-resource-icon-size": `${config.resourceIconSize}px`,
    "--ui-resource-font-size": `${config.resourceFontSize}px`,
    "--ui-resource-gap": `${config.resourceGap}px`,
    "--ui-opponent-role-width": `${config.opponentRoleWidth}px`,
    "--ui-opponent-hand-width": `${config.opponentHandWidth}px`,
    "--ui-opponent-hand-stack-depth": `${config.opponentHandStackDepth}px`,
    "--ui-opponent-district-width": `${config.opponentDistrictWidth}px`,
    "--ui-action-dock-width": `${config.actionDockWidth}px`,
    "--ui-action-dock-right": `${config.actionDockRight}%`,
    "--ui-action-dock-bottom": `${config.actionDockBottom}%`,
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

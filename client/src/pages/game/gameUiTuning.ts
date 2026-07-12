import type { CSSProperties } from "react";

export type GameUiDensity = "roomy" | "standard" | "dense";

export type GameUiTuningConfig = {
  selfCardWidth: number;
  handOverlap: number;
  handMaxWidth: number;
  playerPlateWidth: number;
  playerPlateHeight: number;
  avatarSize: number;
  opponentRoleWidth: number;
  opponentHandWidth: number;
  opponentDistrictWidth: number;
  centerTop: number;
  cityTop: number;
  actionTop: number;
  selfBottom: number;
  showBounds: boolean;
};

export const GAME_UI_TUNING_STORAGE_KEY = "zy-game-ui-tuning-v1";

export const gameUiTuningBounds: Record<Exclude<keyof GameUiTuningConfig, "showBounds">, [number, number, number]> = {
  selfCardWidth: [54, 104, 1],
  handOverlap: [-30, 0, 1],
  handMaxWidth: [300, 820, 10],
  playerPlateWidth: [190, 320, 2],
  playerPlateHeight: [46, 78, 1],
  avatarSize: [34, 62, 1],
  opponentRoleWidth: [40, 72, 1],
  opponentHandWidth: [30, 58, 1],
  opponentDistrictWidth: [42, 72, 1],
  centerTop: [35, 51, 0.2],
  cityTop: [49, 65, 0.2],
  actionTop: [66, 82, 0.2],
  selfBottom: [1, 9, 0.2]
};

const densityPresets: Record<GameUiDensity, GameUiTuningConfig> = {
  roomy: {
    selfCardWidth: 84,
    handOverlap: -10,
    handMaxWidth: 650,
    playerPlateWidth: 280,
    playerPlateHeight: 60,
    avatarSize: 48,
    opponentRoleWidth: 58,
    opponentHandWidth: 45,
    opponentDistrictWidth: 60,
    centerTop: 44,
    cityTop: 55.2,
    actionTop: 75.4,
    selfBottom: 2.4,
    showBounds: false
  },
  standard: {
    selfCardWidth: 78,
    handOverlap: -14,
    handMaxWidth: 600,
    playerPlateWidth: 268,
    playerPlateHeight: 56,
    avatarSize: 46,
    opponentRoleWidth: 54,
    opponentHandWidth: 42,
    opponentDistrictWidth: 56,
    centerTop: 44,
    cityTop: 55.2,
    actionTop: 75.4,
    selfBottom: 2.4,
    showBounds: false
  },
  dense: {
    selfCardWidth: 72,
    handOverlap: -17,
    handMaxWidth: 540,
    playerPlateWidth: 248,
    playerPlateHeight: 52,
    avatarSize: 42,
    opponentRoleWidth: 50,
    opponentHandWidth: 38,
    opponentDistrictWidth: 52,
    centerTop: 43.5,
    cityTop: 55.2,
    actionTop: 74.5,
    selfBottom: 2,
    showBounds: false
  }
};

export function densityForPlayerCount(playerCount: number): GameUiDensity {
  if (playerCount <= 4) return "roomy";
  if (playerCount <= 6) return "standard";
  return "dense";
}

export function defaultGameUiTuning(playerCount: number, lowHeight: boolean) {
  const density = densityForPlayerCount(playerCount);
  const preset = { ...densityPresets[density] };
  if (!lowHeight) return preset;

  return {
    ...preset,
    selfCardWidth: Math.round(preset.selfCardWidth * 0.9),
    playerPlateHeight: Math.round(preset.playerPlateHeight * 0.9),
    avatarSize: Math.round(preset.avatarSize * 0.9),
    opponentRoleWidth: Math.round(preset.opponentRoleWidth * 0.9),
    opponentHandWidth: Math.round(preset.opponentHandWidth * 0.9),
    opponentDistrictWidth: Math.round(preset.opponentDistrictWidth * 0.9),
    centerTop: preset.centerTop - 0.8,
    cityTop: preset.cityTop - 1.2,
    actionTop: preset.actionTop - 1.4
  };
}

export function clampGameUiTuning(config: GameUiTuningConfig): GameUiTuningConfig {
  const next = { ...config };
  for (const [key, [min, max]] of Object.entries(gameUiTuningBounds) as Array<
    [Exclude<keyof GameUiTuningConfig, "showBounds">, [number, number, number]]
  >) {
    next[key] = Math.min(max, Math.max(min, Number(next[key]))) as never;
  }
  next.showBounds = Boolean(next.showBounds);
  return next;
}

export function readStoredGameUiTuning(fallback: GameUiTuningConfig) {
  try {
    const raw = window.localStorage.getItem(GAME_UI_TUNING_STORAGE_KEY);
    return raw ? clampGameUiTuning({ ...fallback, ...JSON.parse(raw) }) : fallback;
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
    "--ui-opponent-role-width": `${config.opponentRoleWidth}px`,
    "--ui-opponent-hand-width": `${config.opponentHandWidth}px`,
    "--ui-opponent-district-width": `${config.opponentDistrictWidth}px`,
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

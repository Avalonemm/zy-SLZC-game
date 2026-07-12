export const ENDING_CITY_SIZE = 4;
export const DEFAULT_END_CITY_SIZE = 8;
export const MIN_END_CITY_SIZE = 4;
export const MAX_END_CITY_SIZE = 8;

export const STANDARD_ROLE_IDS = [
  "assassin",
  "thief",
  "magician",
  "king",
  "bishop",
  "merchant",
  "architect",
  "warlord"
] as const;

export const MIN_PLAYERS_TO_START = 2;
export const DEFAULT_MAX_PLAYERS = 4;
export const MAX_PLAYERS = 8;
export const FUTURE_MAX_PLAYERS = 8;
export const TEST_BOT_UID_BASE = 900000;

export const START_COUNTDOWN_SECONDS = 10;
export const CROWN_REVEAL_TIMEOUT_MS = 5_000;
export const DEFAULT_TURN_TIMEOUT_SECONDS = 15;
export const MIN_TURN_TIMEOUT_SECONDS = 10;
export const MAX_TURN_TIMEOUT_SECONDS = 180;
export const BOT_THINK_DELAY_MS = 2_000;

export const ROLE_SELECTION_TIMEOUT_MS = 60_000;
export const ROLE_ACTION_TIMEOUT_MS = 60_000;

export function currentPlayerRangeText(maxPlayers = MAX_PLAYERS) {
  return `${MIN_PLAYERS_TO_START}-${maxPlayers}`;
}

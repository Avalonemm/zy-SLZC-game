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
export const QUEEN_ROLE_ID = "queen";
export const ALL_ROLE_IDS = [...STANDARD_ROLE_IDS, QUEEN_ROLE_ID] as const;

export const MIN_PLAYERS_TO_START = 4;
export const TEST_MIN_PLAYERS_TO_START = 2;
export const DEFAULT_MAX_PLAYERS = 4;
export const MAX_PLAYERS = 8;
export const FUTURE_MAX_PLAYERS = 8;
export const TEST_BOT_UID_BASE = 900000;

export const START_COUNTDOWN_SECONDS = 10;
export const CROWN_REVEAL_TIMEOUT_MS = 7_000;
export const DEFAULT_TURN_TIMEOUT_SECONDS = 45;
export const MIN_TURN_TIMEOUT_SECONDS = 10;
export const MAX_TURN_TIMEOUT_SECONDS = 180;
export const BOT_THINK_DELAY_MS = 2_000;

export const ROLE_SELECTION_TIMEOUT_MS = 60_000;
export const ROLE_CALL_ANNOUNCE_MS = 650;
export const ROLE_CALL_UNANSWERED_MS = 550;
export const ROLE_CALL_REVEAL_MS = 1_350;
export const ROLE_CALL_SKIPPED_MS = 2_400;
export const ROLE_ACTION_TIMEOUT_MS = 60_000;

export function currentPlayerRangeText(maxPlayers = MAX_PLAYERS) {
  return `${getMinimumPlayersToStart()}-${maxPlayers}`;
}

export function getMinimumPlayersToStart() {
  return process.env.ZY_ENABLE_SMALL_TEST_ROOMS === "1" || process.env.NODE_ENV === "test"
    ? TEST_MIN_PLAYERS_TO_START
    : MIN_PLAYERS_TO_START;
}

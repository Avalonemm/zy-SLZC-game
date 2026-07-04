import type { GameRoom, TurnTimer } from "@zy/shared";
import {
  BOT_THINK_DELAY_MS,
  CROWN_REVEAL_TIMEOUT_MS,
  DEFAULT_TURN_TIMEOUT_SECONDS,
  ROLE_ACTION_TIMEOUT_MS,
  ROLE_SELECTION_TIMEOUT_MS
} from "./gameConfig";

export function startCrownRevealTimer(
  gameRoom: GameRoom,
  playerId: string | null,
  now = new Date()
) {
  gameRoom.turnTimer = playerId
    ? createTurnTimer("CROWN_REVEAL", playerId, CROWN_REVEAL_TIMEOUT_MS, now)
    : null;
}

export function startRoleSelectionTimer(
  gameRoom: GameRoom,
  playerId: string | null,
  now = new Date()
) {
  const timeoutMs = getTurnTimeoutMsForPlayer(gameRoom, playerId, ROLE_SELECTION_TIMEOUT_MS);
  gameRoom.turnTimer = playerId
    ? createTurnTimer("ROLE_SELECTION", playerId, timeoutMs, now)
    : null;
}

export function startRoleActionTimer(
  gameRoom: GameRoom,
  playerId: string | null,
  now = new Date()
) {
  const timeoutMs = getTurnTimeoutMsForPlayer(gameRoom, playerId, ROLE_ACTION_TIMEOUT_MS);
  const timer = playerId
    ? createTurnTimer("ROLE_ACTION", playerId, timeoutMs, now)
    : null;

  gameRoom.turnTimer = timer;
  if (gameRoom.turnState && timer) {
    gameRoom.turnState.startedAt = timer.startedAt;
    gameRoom.turnState.deadlineAt = timer.deadlineAt;
    gameRoom.turnState.timeoutMs = timer.timeoutMs;
  }
}

function getTurnTimeoutMsForPlayer(
  gameRoom: GameRoom,
  playerId: string | null,
  fallbackTimeoutMs: number
) {
  const player = playerId
    ? gameRoom.players.find((candidate) => candidate.id === playerId)
    : null;
  if (player?.isBot) {
    return BOT_THINK_DELAY_MS;
  }

  return getRoomTurnTimeoutMs(gameRoom) ?? fallbackTimeoutMs;
}

function getRoomTurnTimeoutMs(gameRoom: GameRoom) {
  const seconds = gameRoom.settings?.turnTimeoutSeconds ?? DEFAULT_TURN_TIMEOUT_SECONDS;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return seconds * 1000;
}

export function clearTurnTimer(gameRoom: GameRoom) {
  gameRoom.turnTimer = null;
}

export function isTurnTimerExpired(timer: TurnTimer | null, nowInput: string | Date) {
  if (!timer) {
    return false;
  }

  const now = typeof nowInput === "string" ? new Date(nowInput) : nowInput;
  return now.getTime() >= new Date(timer.deadlineAt).getTime();
}

function createTurnTimer(
  phase: TurnTimer["phase"],
  playerId: string,
  timeoutMs: number,
  now: Date
): TurnTimer {
  const startedAt = now.toISOString();
  const deadlineAt = new Date(now.getTime() + timeoutMs).toISOString();
  return {
    phase,
    playerId,
    startedAt,
    deadlineAt,
    timeoutMs
  };
}

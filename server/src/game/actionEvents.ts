import type { ActionEventPayload, GameLog, GameRoom } from "@zy/shared";

type ActionEventOptions = {
  actorPlayerId?: string;
  targetPlayerId?: string;
  visibility?: ActionEventPayload["visibility"];
};

export function createActionEventFromLog(
  gameRoom: GameRoom,
  log: GameLog,
  options: ActionEventOptions = {}
): ActionEventPayload {
  return {
    id: `${log.id}:event`,
    roomCode: gameRoom.roomId,
    type: log.type,
    message: log.message,
    actorPlayerId: log.presentation?.actorPlayerId ?? options.actorPlayerId,
    targetPlayerId: log.presentation?.targetPlayerId ?? options.targetPlayerId,
    presentation: log.presentation,
    visibility: options.visibility ?? "public",
    phase: gameRoom.phase,
    round: gameRoom.currentRound,
    createdAt: log.createdAt
  };
}

export function createActionEventsFromLogs(
  gameRoom: GameRoom,
  logs: GameLog[],
  options: ActionEventOptions = {}
) {
  return logs.map((log) => createActionEventFromLog(gameRoom, log, options));
}

export function createLatestActionEvent(
  gameRoom: GameRoom,
  options: ActionEventOptions = {}
) {
  const latestLog = gameRoom.gameLog[0];
  if (!latestLog) {
    return null;
  }

  return createActionEventFromLog(gameRoom, latestLog, options);
}

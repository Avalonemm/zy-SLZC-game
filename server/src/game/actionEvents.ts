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
    actorPlayerId: options.actorPlayerId,
    targetPlayerId: options.targetPlayerId,
    visibility: options.visibility ?? "public",
    phase: gameRoom.phase,
    round: gameRoom.currentRound,
    createdAt: log.createdAt
  };
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

import type {
  ActionEventPresentation,
  GameActionAutoReason,
  GameActionOrigin,
  GameLog,
  GameRoom,
  Player
} from "@zy/shared";
import { randomUUID } from "node:crypto";
import { loadRoleCards } from "./cardData";
import type { Result } from "./gameEngineTypes";

export const MAX_GAME_LOGS = 500;

type ActionOriginContext = {
  origin: GameActionOrigin;
  autoReason?: GameActionAutoReason;
};

const actionOriginContexts = new WeakMap<GameRoom, ActionOriginContext>();

export function withActionOrigin<T>(
  gameRoom: GameRoom,
  context: ActionOriginContext,
  action: () => T
): T {
  const previous = actionOriginContexts.get(gameRoom);
  actionOriginContexts.set(gameRoom, context);
  try {
    return action();
  } finally {
    if (previous) {
      actionOriginContexts.set(gameRoom, previous);
    } else {
      actionOriginContexts.delete(gameRoom);
    }
  }
}

export function findRole(roleId?: string) {
  if (!roleId) {
    return null;
  }

  return loadRoleCards().find((role) => role.id === roleId) ?? null;
}

export function roleForPlayer(gameRoom: GameRoom, player: Player) {
  if (!player.selectedRoleId) {
    return null;
  }

  return loadRoleCards().find((role) => role.id === player.selectedRoleId) ?? null;
}

export function findPlayer(gameRoom: GameRoom, playerId: string) {
  return gameRoom.players.find((player) => player.id === playerId) ?? null;
}

export function addLog(
  gameRoom: GameRoom,
  type: string,
  message: string,
  presentation?: ActionEventPresentation,
  contextOverride?: ActionOriginContext
) {
  const context = contextOverride ?? actionOriginContexts.get(gameRoom);
  const log: GameLog = {
    id: randomUUID(),
    type,
    message,
    presentation,
    origin: context?.origin ?? "player",
    autoReason: context?.autoReason,
    round: gameRoom.currentRound,
    createdAt: new Date().toISOString()
  };
  gameRoom.gameLog.unshift(log);
  if (gameRoom.gameLog.length > MAX_GAME_LOGS) {
    gameRoom.gameLog.splice(MAX_GAME_LOGS);
  }
}

export function createEmptyRoleEffects() {
  return {
    skippedRoleIds: [],
    protectedPlayerIds: [],
    stealTargets: {},
    usedSkillPlayerIds: [],
    queenIncomePlayerIds: []
  };
}

export function createPlayerOrder(players: Player[], crownPlayerId: string) {
  const crownIndex = players.findIndex((player) => player.id === crownPlayerId);
  if (crownIndex === -1) {
    return players.map((player) => player.id);
  }

  return [...players.slice(crownIndex), ...players.slice(0, crownIndex)].map(
    (player) => player.id
  );
}

export function nextRoleSelectionPlayerId(gameRoom: GameRoom) {
  return (
    gameRoom.roleSelectionOrder.find((playerId) => {
      const player = findPlayer(gameRoom, playerId);
      return Boolean(player && !player.selectedRoleId);
    }) ?? null
  );
}

export function fail(error: string): Result {
  return { ok: false, error };
}

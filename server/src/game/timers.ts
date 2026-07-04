import type { GameRoom } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer } from "./gameEngineUtils";
import { endTurn } from "./actions";
import { enterRoleSelectionPhase, selectRole } from "./turnFlow";
import { isTurnTimerExpired } from "./timerState";

type TimeoutResult = Result<{ timedOut: boolean }>;

export function resolveExpiredTurn(
  gameRoom: GameRoom,
  nowInput: string | Date = new Date()
): TimeoutResult {
  if (!isTurnTimerExpired(gameRoom.turnTimer, nowInput)) {
    return { ok: true, timedOut: false };
  }

  if (gameRoom.turnTimer?.phase === "CROWN_REVEAL") {
    return resolveExpiredCrownReveal(gameRoom);
  }

  if (gameRoom.turnTimer?.phase === "ROLE_SELECTION") {
    return resolveExpiredRoleSelection(gameRoom);
  }

  if (gameRoom.turnTimer?.phase === "ROLE_ACTION") {
    return resolveExpiredRoleAction(gameRoom);
  }

  return { ok: true, timedOut: false };
}

function resolveExpiredCrownReveal(gameRoom: GameRoom): TimeoutResult {
  if (gameRoom.phase !== "CROWN_REVEAL") {
    return { ok: true, timedOut: false };
  }

  const crownPlayer = findPlayer(gameRoom, gameRoom.crownPlayerId);
  enterRoleSelectionPhase(
    gameRoom,
    `${crownPlayer?.name ?? "皇冠玩家"} 获得皇冠，进入角色选择阶段。`
  );
  return { ok: true, timedOut: true };
}

function resolveExpiredRoleSelection(gameRoom: GameRoom): TimeoutResult {
  if (gameRoom.phase !== "ROLE_SELECTION" || !gameRoom.roleSelectionTurnPlayerId) {
    return { ok: true, timedOut: false };
  }

  const player = findPlayer(gameRoom, gameRoom.roleSelectionTurnPlayerId);
  const role = gameRoom.availableRoles[0];
  if (!player || !role) {
    return { ok: false, error: "无法处理角色选择超时。" };
  }

  const result = selectRole(gameRoom, {
    playerId: player.id,
    roleId: role.id
  });
  if (!result.ok) {
    return result;
  }

  addLog(gameRoom, "turn_timeout_role_selected", `${player.name} 选择超时，系统自动选择角色。`);
  return { ok: true, timedOut: true };
}

function resolveExpiredRoleAction(gameRoom: GameRoom): TimeoutResult {
  if (gameRoom.phase !== "ROLE_ACTION" || !gameRoom.currentTurnPlayerId) {
    return { ok: true, timedOut: false };
  }

  const player = findPlayer(gameRoom, gameRoom.currentTurnPlayerId);
  if (!player) {
    return { ok: false, error: "无法处理行动超时。" };
  }

  addLog(gameRoom, "turn_timeout_action_ended", `${player.name} 行动超时，系统自动结束其回合。`);
  const result = endTurn(gameRoom, { playerId: player.id });
  if (!result.ok) {
    return result;
  }

  return { ok: true, timedOut: true };
}

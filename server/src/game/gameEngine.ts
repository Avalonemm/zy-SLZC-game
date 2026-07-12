import type { GameRoom, UseDistrictEffectPayload, UseRoleSkillPayload } from "@zy/shared";
import {
  buildDistrict,
  chooseDrawnDistrictCard,
  drawDistrictCards,
  endTurn,
  takeGold,
  validateNoPendingDrawChoice,
  validateCurrentTurn
} from "./actions";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer, roleForPlayer } from "./gameEngineUtils";
import { useDistrictEffect as applyDistrictEffect } from "./districtEffects";
import { applyRoleSkill } from "./roleSkills";
import { advanceOfflinePlayers, selectRole } from "./turnFlow";
import { resolveGraveyardChoice as applyGraveyardChoice } from "./districtDestruction";

export { buildDistrict, chooseDrawnDistrictCard, drawDistrictCards, endTurn, takeGold } from "./actions";
export { runBotTurns, runNextBotTurn } from "./botPlayer";
export { advanceOfflinePlayers, selectRole } from "./turnFlow";
export { visibleStateForPlayer } from "./visibility";

export function useRoleSkill(
  gameRoom: GameRoom,
  input: Omit<UseRoleSkillPayload, "roomCode">
): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  const pendingChoiceResult = validateNoPendingDrawChoice(gameRoom, input.playerId);
  if (!pendingChoiceResult.ok) {
    return pendingChoiceResult;
  }

  if (gameRoom.roleEffects.usedSkillPlayerIds.includes(input.playerId)) {
    return { ok: false, error: "本回合已经使用过角色技能。" };
  }

  const role = roleForPlayer(gameRoom, result.player);
  if (!role) {
    return { ok: false, error: "当前玩家没有已选择角色。" };
  }

  const skillResult = applyRoleSkill(gameRoom, result.player, role, input);
  if (!skillResult.ok) {
    return skillResult;
  }

  gameRoom.roleEffects.usedSkillPlayerIds.push(input.playerId);
  return { ok: true };
}

export function useDistrictEffect(
  gameRoom: GameRoom,
  input: Omit<UseDistrictEffectPayload, "roomCode">
): Result {
  return applyDistrictEffect(gameRoom, input);
}

export function resolveGraveyardChoice(
  gameRoom: GameRoom,
  input: { playerId: string; buyBack: boolean }
): Result {
  return applyGraveyardChoice(gameRoom, input);
}
export function skipOfflineCurrentPlayer(
  gameRoom: GameRoom,
  input: { requesterPlayerId: string } | string
): Result {
  const requesterPlayerId =
    typeof input === "string" ? input : input.requesterPlayerId;
  const requester = findPlayer(gameRoom, requesterPlayerId);
  if (!requester || !requester.isHost) {
    return { ok: false, error: "只有房主可以跳过离线玩家。" };
  }

  if (gameRoom.phase !== "ROLE_ACTION") {
    return { ok: false, error: "当前不是角色行动阶段。" };
  }

  if (!gameRoom.currentTurnPlayerId) {
    return { ok: false, error: "当前没有正在行动的玩家。" };
  }

  const currentPlayer = findPlayer(gameRoom, gameRoom.currentTurnPlayerId);
  if (!currentPlayer) {
    return { ok: false, error: "当前行动玩家不存在。" };
  }

  if (currentPlayer.connected) {
    return { ok: false, error: "当前行动玩家仍在线，不能跳过。" };
  }

  addLog(gameRoom, "skip_offline_player", `${requester.name} 跳过了离线玩家 ${currentPlayer.name}。`);
  return endTurn(gameRoom, { playerId: currentPlayer.id });
}

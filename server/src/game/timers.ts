import type { GameRoom } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer, roleForPlayer, withActionOrigin } from "./gameEngineUtils";
import { chooseDrawnDistrictCard, endTurn, takeGold } from "./actions";
import { applyRoleSkill } from "./roleSkills";
import { enterRoleSelectionPhase, resolveRoleCallTimeout, selectRole } from "./turnFlow";
import { isTurnTimerExpired } from "./timerState";
import { resolveGraveyardChoice } from "./districtDestruction";

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

  if (gameRoom.turnTimer?.phase === "ROLE_CALL") {
    return resolveExpiredRoleCall(gameRoom);
  }

  if (gameRoom.turnTimer?.phase === "ROLE_ACTION") {
    return resolveExpiredRoleAction(gameRoom);
  }

  return { ok: true, timedOut: false };
}

function resolveExpiredRoleCall(gameRoom: GameRoom): TimeoutResult {
  if (gameRoom.phase !== "ROLE_CALL" || !gameRoom.roleCallState) {
    return { ok: true, timedOut: false };
  }

  const result = resolveRoleCallTimeout(gameRoom);
  if (!result.ok) {
    return result;
  }
  return { ok: true, timedOut: true };
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
  const role = pickRandomAvailableRole(gameRoom);
  if (!player || !role) {
    return { ok: false, error: "无法处理角色选择超时。" };
  }

  const result = withActionOrigin(
    gameRoom,
    { origin: "timeout", autoReason: "role_selection_timeout" },
    () => selectRole(gameRoom, {
      playerId: player.id,
      roleId: role.id
    })
  );
  if (!result.ok) {
    return result;
  }

  addLog(
    gameRoom,
    "turn_timeout_role_selected",
    `${player.name} 选择超时，系统自动选择角色。`,
    undefined,
    { origin: "timeout", autoReason: "role_selection_timeout" }
  );
  return { ok: true, timedOut: true };
}

function pickRandomAvailableRole(gameRoom: GameRoom) {
  if (gameRoom.availableRoles.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * gameRoom.availableRoles.length);
  return gameRoom.availableRoles[index];
}

function resolveExpiredRoleAction(gameRoom: GameRoom): TimeoutResult {
  if (gameRoom.phase !== "ROLE_ACTION" || !gameRoom.currentTurnPlayerId) {
    return { ok: true, timedOut: false };
  }

  const player = findPlayer(gameRoom, gameRoom.currentTurnPlayerId);
  if (!player) {
    return { ok: false, error: "无法处理行动超时。" };
  }

  if (gameRoom.pendingGraveyardChoice) {
    const declineResult = withActionOrigin(
      gameRoom,
      { origin: "timeout", autoReason: "turn_timeout" },
      () => resolveGraveyardChoice(gameRoom, {
        playerId: gameRoom.pendingGraveyardChoice!.playerId,
        buyBack: false
      })
    );
    if (!declineResult.ok) {
      return declineResult;
    }
  }

  const autoSkillResult = autoResolveTimeoutRoleSkill(gameRoom, player.id);
  if (!autoSkillResult.ok) {
    return autoSkillResult;
  }

  if (gameRoom.pendingDrawChoice?.playerId === player.id) {
    const firstDrawnCard = gameRoom.pendingDrawChoice.drawnCards[0];
    if (firstDrawnCard) {
      const chooseResult = withActionOrigin(
        gameRoom,
        { origin: "timeout", autoReason: "draw_choice_timeout" },
        () => chooseDrawnDistrictCard(gameRoom, {
          playerId: player.id,
          districtCardId: firstDrawnCard.id
        })
      );
      if (!chooseResult.ok) {
        return chooseResult;
      }
      addLog(
        gameRoom,
        "turn_timeout_draw_selected",
        `${player.name} 抽牌选择超时，系统自动完成了抽牌选择。`,
        undefined,
        { origin: "timeout", autoReason: "draw_choice_timeout" }
      );
    }
  } else if (!gameRoom.turnState?.resourceActionTaken) {
    const goldResult = withActionOrigin(
      gameRoom,
      { origin: "timeout", autoReason: "turn_timeout" },
      () => takeGold(gameRoom, { playerId: player.id })
    );
    if (!goldResult.ok) {
      return goldResult;
    }
    addLog(
      gameRoom,
      "turn_timeout_gold_taken",
      `${player.name} 行动超时，系统自动领取 2 枚金币。`,
      undefined,
      { origin: "timeout", autoReason: "turn_timeout" }
    );
  }

  addLog(
    gameRoom,
    "turn_timeout_action_ended",
    `${player.name} 行动超时，系统自动结束其回合。`,
    undefined,
    { origin: "timeout", autoReason: "turn_timeout" }
  );
  const result = withActionOrigin(
    gameRoom,
    { origin: "timeout", autoReason: "turn_timeout" },
    () => endTurn(gameRoom, { playerId: player.id })
  );
  if (!result.ok) {
    return result;
  }

  return { ok: true, timedOut: true };
}

function autoResolveTimeoutRoleSkill(gameRoom: GameRoom, playerId: string): Result {
  const player = findPlayer(gameRoom, playerId);
  if (!player || gameRoom.roleEffects.usedSkillPlayerIds.includes(player.id)) {
    return { ok: true };
  }

  const role = roleForPlayer(gameRoom, player);
  if (!role || !canAutoResolveTimeoutSkill(role.id)) {
    return { ok: true };
  }

  const result = withActionOrigin(
    gameRoom,
    { origin: "timeout", autoReason: "turn_timeout" },
    () => applyRoleSkill(gameRoom, player, role, { playerId: player.id })
  );
  if (!result.ok) {
    return result;
  }

  gameRoom.roleEffects.usedSkillPlayerIds.push(player.id);
  addLog(
    gameRoom,
    "turn_timeout_skill_used",
    `${player.name} 行动超时，系统自动结算职业收益。`,
    undefined,
    { origin: "timeout", autoReason: "turn_timeout" }
  );
  return { ok: true };
}

function canAutoResolveTimeoutSkill(roleId: string) {
  return ["king", "bishop", "merchant", "warlord"].includes(roleId);
}

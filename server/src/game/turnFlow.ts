import type { GameRoom, Player, RoleCallStage } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import {
  addLog,
  createEmptyRoleEffects,
  createPlayerOrder,
  findPlayer,
  nextRoleSelectionPlayerId,
  roleForPlayer,
  withActionOrigin
} from "./gameEngineUtils";
import {
  ROLE_CALL_ANNOUNCE_MS,
  ROLE_CALL_REVEAL_MS,
  ROLE_CALL_SKIPPED_MS,
  ROLE_CALL_UNANSWERED_MS
} from "./gameConfig";
import { applyStealEffectBeforeTurn } from "./roleSkills";
import { createRoleSelectionPool, enabledRoleCards } from "./rolePool";
import { scoreGame } from "./scoring";
import {
  startRoleActionTimer,
  startRoleCallTimer,
  startRoleSelectionTimer
} from "./timerState";
import { resolveDeferredQueenIncome, resolveQueenIncome } from "./queenRule";

export function selectRole(
  gameRoom: GameRoom,
  input: { playerId: string; roleId: string }
): Result {
  if (gameRoom.phase !== "ROLE_SELECTION") {
    return { ok: false, error: "当前不是身份选择阶段。" };
  }

  if (gameRoom.roleSelectionTurnPlayerId !== input.playerId) {
    return { ok: false, error: "还没有轮到你选择身份。" };
  }

  const player = findPlayer(gameRoom, input.playerId);
  if (!player) {
    return { ok: false, error: "玩家不存在。" };
  }

  const roleIndex = gameRoom.availableRoles.findIndex((role) => role.id === input.roleId);
  if (roleIndex === -1) {
    return { ok: false, error: "该身份当前不可选择。" };
  }

  const [role] = gameRoom.availableRoles.splice(roleIndex, 1);
  player.selectedRoleId = role.id;
  addLog(gameRoom, "role_selected", `${player.name} 已选择身份。`, {
    kind: "role_lock",
    actorPlayerId: player.id
  });

  const nextPlayerId = nextRoleSelectionPlayerId(gameRoom);
  gameRoom.roleSelectionTurnPlayerId = nextPlayerId;
  startRoleSelectionTimer(gameRoom, nextPlayerId);

  if (!nextPlayerId) {
    enterRoleCallPhase(gameRoom);
  }

  return { ok: true };
}

export function advanceOfflinePlayers(gameRoom: GameRoom): Result {
  let guard = 0;

  while (guard < gameRoom.players.length) {
    guard += 1;

    if (gameRoom.phase !== "ROLE_SELECTION") {
      return { ok: true };
    }

    const currentChooser = gameRoom.players.find(
      (candidate) => candidate.id === gameRoom.roleSelectionTurnPlayerId
    );
    if (!currentChooser || currentChooser.connected) {
      return { ok: true };
    }

    const role = gameRoom.availableRoles[0];
    if (!role) {
      return { ok: false, error: "没有可选身份。" };
    }

    const result = withActionOrigin(
      gameRoom,
      { origin: "offline", autoReason: "offline_progress" },
      () => selectRole(gameRoom, {
        playerId: currentChooser.id,
        roleId: role.id
      })
    );
    if (!result.ok) {
      return result;
    }

    addLog(
      gameRoom,
      "offline_role_auto_selected",
      `${currentChooser.name} 已离线，系统自动为其选择身份。`,
      undefined,
      { origin: "offline", autoReason: "offline_progress" }
    );
  }

  return { ok: false, error: "离线玩家自动推进超出安全步数。" };
}

export function advanceToNextTurn(gameRoom: GameRoom) {
  startNextRoleCall(gameRoom);
}

export function resolveRoleCallTimeout(gameRoom: GameRoom): Result {
  const call = gameRoom.roleCallState;
  if (gameRoom.phase !== "ROLE_CALL" || gameRoom.turnTimer?.phase !== "ROLE_CALL" || !call) {
    return { ok: true };
  }

  if (call.stage === "calling") {
    const player = gameRoom.players.find((candidate) => candidate.selectedRoleId === call.roleId);
    markRoleCalled(gameRoom, call.roleId);

    if (!player) {
      setRoleCallStage(gameRoom, call.roleId, "unanswered", null, ROLE_CALL_UNANSWERED_MS);
      return { ok: true };
    }

    if (gameRoom.roleEffects.skippedRoleIds.includes(call.roleId)) {
      markRoleCompleted(gameRoom, call.roleId);
      addLog(
        gameRoom,
        "role_skipped",
        `${player.name} 被刺杀，本轮行动跳过。`,
        {
          kind: "assassin_skip",
          targetRoleId: call.roleId,
          targetPlayerId: player.id
        }
      );
      setRoleCallStage(gameRoom, call.roleId, "skipped", player.id, ROLE_CALL_SKIPPED_MS);
      return { ok: true };
    }

    setRoleCallStage(gameRoom, call.roleId, "revealing", player.id, ROLE_CALL_REVEAL_MS);
    return { ok: true };
  }

  if (call.stage === "revealing") {
    const player = findPlayer(gameRoom, call.playerId ?? "");
    if (!player || player.selectedRoleId !== call.roleId) {
      return { ok: false, error: "身份揭示状态与当前玩家不一致。" };
    }

    gameRoom.phase = "ROLE_ACTION";
    gameRoom.roleCallState = null;
    prepareTurn(gameRoom, player);
    return { ok: true };
  }

  gameRoom.roleCallState = null;
  startNextRoleCall(gameRoom);
  return { ok: true };
}

export function enterRoleSelectionPhase(gameRoom: GameRoom, logMessage?: string) {
  gameRoom.phase = "ROLE_SELECTION";
  gameRoom.roleSelectionOrder = createPlayerOrder(gameRoom.players, gameRoom.crownPlayerId);
  gameRoom.roleSelectionTurnPlayerId = gameRoom.roleSelectionOrder[0] ?? null;
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.roleCallState = null;
  gameRoom.calledRoleIds = [];
  startRoleSelectionTimer(gameRoom, gameRoom.roleSelectionTurnPlayerId);
  addLog(
    gameRoom,
    "role_selection_start",
    logMessage ?? `第 ${gameRoom.currentRound} 轮开始，进入身份选择阶段。`
  );
}

function enterRoleCallPhase(gameRoom: GameRoom) {
  const selectedRoleOrders = gameRoom.players
    .map((player) => roleForPlayer(gameRoom, player)?.order)
    .filter((order): order is number => typeof order === "number")
    .sort((first, second) => first - second);

  gameRoom.phase = "ROLE_CALL";
  gameRoom.roleSelectionTurnPlayerId = null;
  gameRoom.currentRoleOrder = selectedRoleOrders;
  gameRoom.completedRoleIds = [];
  gameRoom.calledRoleIds = [];
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.roleCallState = null;
  addLog(gameRoom, "role_action_start", "身份行动阶段开始，城主依次叫号。");
  startNextRoleCall(gameRoom);
}

function startNextRoleCall(gameRoom: GameRoom) {
  const nextRole = enabledRoleCards(gameRoom.settings, gameRoom.players.length)
    .find((role) => !gameRoom.calledRoleIds.includes(role.id));

  if (!nextRole) {
    finishRoleSequence(gameRoom);
    return;
  }

  gameRoom.phase = "ROLE_CALL";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  setRoleCallStage(gameRoom, nextRole.id, "calling", null, ROLE_CALL_ANNOUNCE_MS);
}

function finishRoleSequence(gameRoom: GameRoom) {
  gameRoom.roleCallState = null;
  if (gameRoom.firstCompletedCityPlayerId) {
    resolveDeferredQueenIncome(gameRoom);
    scoreGame(gameRoom);
    return;
  }

  resolveDeferredQueenIncome(gameRoom);
  startNextRound(gameRoom);
}

function startNextRound(gameRoom: GameRoom) {
  transferCrownToSelectedKing(gameRoom);
  const rolePool = createRoleSelectionPool(gameRoom.settings, gameRoom.players.length);
  gameRoom.currentRound += 1;
  gameRoom.phase = "ROLE_SELECTION";
  gameRoom.availableRoles = rolePool.availableRoles;
  gameRoom.discardedRoles = rolePool.discardedRoles;
  gameRoom.currentRoleOrder = [];
  gameRoom.completedRoleIds = [];
  gameRoom.calledRoleIds = [];
  gameRoom.roleCallState = null;
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.roleEffects = createEmptyRoleEffects();
  for (const player of gameRoom.players) {
    player.selectedRoleId = null;
  }
  enterRoleSelectionPhase(gameRoom);
}

function prepareTurn(gameRoom: GameRoom, player: Player) {
  gameRoom.currentTurnPlayerId = player.id;
  gameRoom.turnState = {
    playerId: player.id,
    resourceActionTaken: false,
    actionStep: "RESOURCE",
    buildsUsed: 0,
    maxBuilds: 1,
    usedDistrictEffectIds: []
  };
  startRoleActionTimer(gameRoom, player.id);

  const role = roleForPlayer(gameRoom, player);
  if (role?.id === "king") {
    transferCrownToPlayer(gameRoom, player);
  }
  if (role?.id === "queen") {
    resolveQueenIncome(gameRoom, player, { atRoundEnd: false });
  }
  applyStealEffectBeforeTurn(gameRoom, player, role);
  addLog(
    gameRoom,
    "turn_start",
    `轮到 ${player.name} 行动${role ? `（${role.name}）` : ""}。`,
    { kind: "turn_start", actorPlayerId: player.id, roleId: role?.id }
  );
}

function setRoleCallStage(
  gameRoom: GameRoom,
  roleId: string,
  stage: RoleCallStage,
  playerId: string | null,
  timeoutMs: number
) {
  const timer = startRoleCallTimer(gameRoom, timeoutMs, playerId);
  gameRoom.roleCallState = {
    roleId,
    stage,
    playerId,
    startedAt: timer.startedAt,
    deadlineAt: timer.deadlineAt,
    timeoutMs: timer.timeoutMs
  };
}

function markRoleCalled(gameRoom: GameRoom, roleId: string) {
  if (!gameRoom.calledRoleIds.includes(roleId)) {
    gameRoom.calledRoleIds.push(roleId);
  }
}

function markRoleCompleted(gameRoom: GameRoom, roleId: string) {
  if (!gameRoom.completedRoleIds.includes(roleId)) {
    gameRoom.completedRoleIds.push(roleId);
  }
}

function transferCrownToSelectedKing(gameRoom: GameRoom) {
  const kingPlayer = gameRoom.players.find((player) => player.selectedRoleId === "king");
  if (kingPlayer) {
    transferCrownToPlayer(gameRoom, kingPlayer);
  }
}

function transferCrownToPlayer(gameRoom: GameRoom, player: Player) {
  if (gameRoom.crownPlayerId === player.id) {
    return;
  }
  gameRoom.crownPlayerId = player.id;
  addLog(gameRoom, "crown_transferred", `${player.name} 获得了王冠。`, {
    kind: "crown_transfer",
    targetPlayerId: player.id
  });
}

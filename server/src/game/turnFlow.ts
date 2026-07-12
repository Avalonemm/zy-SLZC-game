import type { GameRoom, Player, RoleCard } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import {
  addLog,
  createEmptyRoleEffects,
  createPlayerOrder,
  findPlayer,
  nextRoleSelectionPlayerId,
  roleForPlayer
} from "./gameEngineUtils";
import { applyStealEffectBeforeTurn } from "./roleSkills";
import { createRoleSelectionPool } from "./rolePool";
import { scoreGame } from "./scoring";
import { startRoleActionTimer, startRoleSelectionTimer } from "./timerState";

export function selectRole(
  gameRoom: GameRoom,
  input: { playerId: string; roleId: string }
): Result {
  if (gameRoom.phase !== "ROLE_SELECTION") {
    return { ok: false, error: "当前不是角色选择阶段。" };
  }

  if (gameRoom.roleSelectionTurnPlayerId !== input.playerId) {
    return { ok: false, error: "还没有轮到你选择角色。" };
  }

  const player = findPlayer(gameRoom, input.playerId);
  if (!player) {
    return { ok: false, error: "玩家不存在。" };
  }

  const roleIndex = gameRoom.availableRoles.findIndex((role) => role.id === input.roleId);
  if (roleIndex === -1) {
    return { ok: false, error: "角色不可选。" };
  }

  const [role] = gameRoom.availableRoles.splice(roleIndex, 1);
  player.selectedRoleId = role.id;
  addLog(gameRoom, "role_selected", `${player.name} 已选择角色。`);

  const nextPlayerId = nextRoleSelectionPlayerId(gameRoom);
  gameRoom.roleSelectionTurnPlayerId = nextPlayerId;
  startRoleSelectionTimer(gameRoom, nextPlayerId);

  if (!nextPlayerId) {
    enterRoleActionPhase(gameRoom);
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
      return { ok: false, error: "没有可选角色。" };
    }

    const result = selectRole(gameRoom, {
      playerId: currentChooser.id,
      roleId: role.id
    });
    if (!result.ok) {
      return result;
    }

    addLog(
      gameRoom,
      "offline_role_auto_selected",
      `${currentChooser.name} 已离线，系统自动为其选择角色。`
    );
  }

  return { ok: false, error: "离线玩家自动推进超出安全步数。" };
}

export function advanceToNextTurn(gameRoom: GameRoom) {
  let nextEntry = nextPendingRoleEntry(gameRoom);

  while (nextEntry && gameRoom.roleEffects.skippedRoleIds.includes(nextEntry.role.id)) {
    gameRoom.completedRoleIds.push(nextEntry.role.id);
    addLog(
      gameRoom,
      "role_skipped",
      `${nextEntry.role.name} 被刺客跳过了行动。`,
      {
        kind: "assassin_skip",
        targetRoleId: nextEntry.role.id
      }
    );
    nextEntry = nextPendingRoleEntry(gameRoom);
  }

  if (nextEntry) {
    prepareTurn(gameRoom, nextEntry.player);
    return;
  }

  if (gameRoom.firstCompletedCityPlayerId) {
    scoreGame(gameRoom);
    return;
  }

  startNextRound(gameRoom);
}

export function enterRoleSelectionPhase(gameRoom: GameRoom, logMessage?: string) {
  gameRoom.phase = "ROLE_SELECTION";
  gameRoom.roleSelectionOrder = createPlayerOrder(gameRoom.players, gameRoom.crownPlayerId);
  gameRoom.roleSelectionTurnPlayerId = gameRoom.roleSelectionOrder[0] ?? null;
  startRoleSelectionTimer(gameRoom, gameRoom.roleSelectionTurnPlayerId);
  addLog(
    gameRoom,
    "role_selection_start",
    logMessage ?? `第 ${gameRoom.currentRound} 轮开始，进入角色选择阶段。`
  );
}

function enterRoleActionPhase(gameRoom: GameRoom) {
  const selectedRoles = gameRoom.players
    .map((player) => {
      const role = roleForPlayer(gameRoom, player);
      return role ? { player, role } : null;
    })
    .filter((entry): entry is { player: Player; role: RoleCard } => Boolean(entry))
    .sort((a, b) => a.role.order - b.role.order);

  gameRoom.phase = "ROLE_ACTION";
  gameRoom.currentRoleOrder = selectedRoles.map((entry) => entry.role.order);
  gameRoom.completedRoleIds = [];

  const firstPlayer = selectedRoles[0]?.player ?? null;
  prepareTurn(gameRoom, firstPlayer);
  addLog(gameRoom, "role_action_start", "角色行动阶段开始。");
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
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.roleEffects = createEmptyRoleEffects();
  for (const player of gameRoom.players) {
    player.selectedRoleId = null;
  }
  enterRoleSelectionPhase(gameRoom);
}

function prepareTurn(gameRoom: GameRoom, player: Player | null) {
  gameRoom.currentTurnPlayerId = player?.id ?? null;
  gameRoom.turnState = player
    ? {
        playerId: player.id,
        resourceActionTaken: false,
        actionStep: "RESOURCE",
        buildsUsed: 0,
        maxBuilds: 1,
        usedDistrictEffectIds: []
      }
    : null;
  startRoleActionTimer(gameRoom, player?.id ?? null);

  if (player) {
    const role = roleForPlayer(gameRoom, player);
    if (role?.id === "king") {
      transferCrownToPlayer(gameRoom, player);
    }
    applyStealEffectBeforeTurn(gameRoom, player, role);
    addLog(
      gameRoom,
      "turn_start",
      `轮到 ${player.name} 行动${role ? `（${role.name}）` : ""}。`
    );
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
  addLog(gameRoom, "crown_transferred", `${player.name} \u83b7\u5f97\u4e86\u738b\u51a0\u3002`);
}

function nextPendingRoleEntry(gameRoom: GameRoom) {
  return gameRoom.players
    .map((player) => {
      const role = roleForPlayer(gameRoom, player);
      return role ? { player, role } : null;
    })
    .filter((entry): entry is { player: Player; role: RoleCard } => Boolean(entry))
    .sort((a, b) => a.role.order - b.role.order)
    .find((entry) => !gameRoom.completedRoleIds.includes(entry.role.id));
}

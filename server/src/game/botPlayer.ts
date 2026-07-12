import type { GameRoom, Player } from "@zy/shared";
import { buildDistrict, chooseDrawnDistrictCard, drawDistrictCards, endTurn, takeGold } from "./actions";
import type { Result } from "./gameEngineTypes";
import { addLog, roleForPlayer, withActionOrigin } from "./gameEngineUtils";
import { applyRoleSkill } from "./roleSkills";
import { selectRole } from "./turnFlow";

export function runBotTurns(gameRoom: GameRoom): Result {
  let guard = 0;

  while (guard < 100) {
    guard += 1;

    const result = runNextBotTurn(gameRoom);
    if (!result.ok) {
      return result;
    }
    if (!result.advanced) {
      return { ok: true };
    }
  }

  return { ok: false, error: "人机自动行动超出安全步数。" };
}

export function runNextBotTurn(gameRoom: GameRoom): Result<{ advanced: boolean }> {
  if (gameRoom.phase === "ENDED") {
    return { ok: true, advanced: false };
  }

  if (gameRoom.phase === "ROLE_SELECTION") {
    const player = gameRoom.players.find(
      (candidate) => candidate.id === gameRoom.roleSelectionTurnPlayerId
    );
    if (!player || (!player.isBot && player.connected)) {
      return { ok: true, advanced: false };
    }

    const role = gameRoom.availableRoles[0];
    if (!role) {
      return { ok: false, error: "没有可选角色。" };
    }

    const result = withActionOrigin(gameRoom, { origin: "bot" }, () =>
      selectRole(gameRoom, { playerId: player.id, roleId: role.id })
    );
    if (!result.ok) {
      return result;
    }
    if (!player.connected) {
      addLog(
        gameRoom,
        "offline_role_auto_selected",
        `${player.name} 已离线，系统自动为其选择角色。`,
        undefined,
        { origin: "offline", autoReason: "offline_progress" }
      );
    }

    return { ok: true, advanced: true };
  }

  if (gameRoom.phase === "ROLE_ACTION") {
    const player = gameRoom.players.find(
      (candidate) => candidate.id === gameRoom.currentTurnPlayerId
    );
    if (!player || !player.isBot) {
      return { ok: true, advanced: false };
    }

    const actionResult = withActionOrigin(gameRoom, { origin: "bot" }, () =>
      playBotAction(gameRoom, player)
    );
    if (!actionResult.ok) {
      return actionResult;
    }

    const endResult = withActionOrigin(gameRoom, { origin: "bot" }, () =>
      endTurn(gameRoom, { playerId: player.id })
    );
    if (!endResult.ok) {
      return endResult;
    }

    return { ok: true, advanced: true };
  }

  return { ok: true, advanced: false };
}

function playBotAction(gameRoom: GameRoom, player: Player): Result {
  const skillResult = activateExtraBuildSkill(gameRoom, player);
  if (!skillResult.ok) {
    return skillResult;
  }

  const affordableAfterGold = cheapestAffordableCard(player, player.gold + 2);
  if (affordableAfterGold) {
    const goldResult = takeGold(gameRoom, { playerId: player.id });
    if (!goldResult.ok) {
      return goldResult;
    }
  } else {
    const drawResult = drawDistrictCards(gameRoom, { playerId: player.id });
    if (!drawResult.ok) {
      return drawResult;
    }

    const preferredCard = preferredDrawnCard(player, drawResult.drawnCards);
    if (gameRoom.pendingDrawChoice?.playerId === player.id && preferredCard) {
      const chooseResult = chooseDrawnDistrictCard(gameRoom, {
        playerId: player.id,
        districtCardId: preferredCard.id
      });
      if (!chooseResult.ok) {
        return chooseResult;
      }
    }
  }

  while (canBuildAgain(gameRoom, player)) {
    const card = cheapestAffordableCard(player, player.gold);
    if (!card) {
      break;
    }

    const buildResult = buildDistrict(gameRoom, {
      playerId: player.id,
      districtCardId: card.id
    });
    if (!buildResult.ok) {
      return buildResult;
    }
  }

  return { ok: true };
}

function cheapestAffordableCard(player: Player, gold: number) {
  const builtNames = new Set(player.city.map((district) => district.name));
  return [...player.hand]
    .filter((card) => card.cost <= gold && !builtNames.has(card.name))
    .sort((a, b) => a.cost - b.cost || b.score - a.score)[0];
}

function preferredDrawnCard(player: Player, drawnCards: Player["hand"]) {
  const builtNames = new Set(player.city.map((district) => district.name));
  const handNames = new Set(player.hand.map((district) => district.name));

  return [...drawnCards].sort((a, b) => {
    const priorityDifference =
      drawnCardPriority(a.name, a.cost) - drawnCardPriority(b.name, b.cost);
    return priorityDifference || a.cost - b.cost || b.score - a.score;
  })[0];

  function drawnCardPriority(name: string, cost: number) {
    if (builtNames.has(name)) {
      return 4;
    }

    const duplicateInHand = handNames.has(name);
    const affordableNow = cost <= player.gold;
    if (!duplicateInHand && affordableNow) {
      return 0;
    }
    if (!duplicateInHand) {
      return 1;
    }
    return affordableNow ? 2 : 3;
  }
}

function canBuildAgain(gameRoom: GameRoom, player: Player) {
  return Boolean(
    gameRoom.turnState &&
      gameRoom.turnState.playerId === player.id &&
      gameRoom.turnState.buildsUsed < gameRoom.turnState.maxBuilds
  );
}

function activateExtraBuildSkill(gameRoom: GameRoom, player: Player): Result {
  const role = roleForPlayer(gameRoom, player);
  if (
    role?.effectType !== "extra_build" ||
    gameRoom.roleEffects.usedSkillPlayerIds.includes(player.id)
  ) {
    return { ok: true };
  }

  const skillResult = applyRoleSkill(gameRoom, player, role, { playerId: player.id });
  if (!skillResult.ok) {
    return skillResult;
  }

  gameRoom.roleEffects.usedSkillPlayerIds.push(player.id);
  return { ok: true };
}

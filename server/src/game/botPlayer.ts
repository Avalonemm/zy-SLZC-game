import type { GameRoom, Player } from "@zy/shared";
import { buildDistrict, chooseDrawnDistrictCard, drawDistrictCards, endTurn, takeGold } from "./actions";
import type { Result } from "./gameEngineTypes";
import { addLog } from "./gameEngineUtils";
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

  return { ok: false, error: "测试人机自动行动超出安全步数。" };
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

    const result = selectRole(gameRoom, { playerId: player.id, roleId: role.id });
    if (!result.ok) {
      return result;
    }
    if (!player.connected) {
      addLog(gameRoom, "offline_role_auto_selected", `${player.name} 已离线，系统自动为其选择角色。`);
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

    playBotAction(gameRoom, player);
    const endResult = endTurn(gameRoom, { playerId: player.id });
    if (!endResult.ok) {
      return endResult;
    }

    return { ok: true, advanced: true };
  }

  return { ok: true, advanced: false };
}

function playBotAction(gameRoom: GameRoom, player: Player) {
  const affordableAfterGold = cheapestAffordableCard(player, player.gold + 2);
  if (affordableAfterGold) {
    takeGold(gameRoom, { playerId: player.id });
  } else {
    const drawResult = drawDistrictCards(gameRoom, { playerId: player.id });
    if (drawResult.ok && drawResult.drawnCards[0]) {
      chooseDrawnDistrictCard(gameRoom, {
        playerId: player.id,
        districtCardId: drawResult.drawnCards[0].id
      });
    }
  }

  const card = cheapestAffordableCard(player, player.gold);
  if (card) {
    buildDistrict(gameRoom, { playerId: player.id, districtCardId: card.id });
  }
}

function cheapestAffordableCard(player: Player, gold: number) {
  return [...player.hand].filter((card) => card.cost <= gold).sort((a, b) => a.cost - b.cost)[0];
}

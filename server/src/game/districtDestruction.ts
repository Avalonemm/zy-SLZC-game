import type { DistrictCard, GameRoom, Player } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer } from "./gameEngineUtils";

export type DistrictDestroyCostMode = "free" | "warlord";

export function destroyOpponentDistrict(
  gameRoom: GameRoom,
  player: Player,
  targetPlayerId: string | undefined,
  targetDistrictCardId: string | undefined,
  options: {
    bonusGoldBeforeCost?: number;
    costMode: DistrictDestroyCostMode;
    logType: string;
    sourceName: string;
  }
): Result {
  if (!targetPlayerId || !targetDistrictCardId) {
    return { ok: false, error: "请选择要破坏的目标建筑。" };
  }

  if (targetPlayerId === player.id) {
    return { ok: false, error: "不能破坏自己的建筑。" };
  }

  const targetPlayer = findPlayer(gameRoom, targetPlayerId);
  if (!targetPlayer) {
    return { ok: false, error: "目标玩家不存在。" };
  }

  if (gameRoom.roleEffects.protectedPlayerIds.includes(targetPlayerId)) {
    return { ok: false, error: "目标玩家的城市受到保护。" };
  }

  if (targetPlayer.city.length >= gameRoom.settings.endCitySize) {
    return { ok: false, error: "不能破坏已经完成城市的玩家建筑。" };
  }

  const districtIndex = targetPlayer.city.findIndex(
    (district) => district.id === targetDistrictCardId
  );
  if (districtIndex === -1) {
    return { ok: false, error: "目标建筑不存在。" };
  }

  const district = targetPlayer.city[districtIndex];
  const hasGreatWall = targetPlayer.city.some(
    (builtDistrict) => builtDistrict.effectType === "destroy_cost_plus_one"
  );
  if (district.effectType === "indestructible") {
    return { ok: false, error: "要塞不能被破坏。" };
  }

  const destroyCost = calculateDistrictDestroyCost(district, hasGreatWall, options.costMode);
  const bonusGold = options.bonusGoldBeforeCost ?? 0;
  if (player.gold + bonusGold < destroyCost) {
    return { ok: false, error: "金币不足，无法破坏建筑。" };
  }

  targetPlayer.city.splice(districtIndex, 1);
  player.gold += bonusGold - destroyCost;
  const targetHasGraveyard = targetPlayer.city.some(
    (builtDistrict) => builtDistrict.effectType === "destroyed_card_buyback"
  );
  if (targetHasGraveyard && targetPlayer.gold > 0) {
    if (targetPlayer.isBot || !targetPlayer.connected) {
      buyBackDestroyedDistrict(gameRoom, targetPlayer, district);
    } else {
      gameRoom.pendingGraveyardChoice = {
        playerId: targetPlayer.id,
        destroyedByPlayerId: player.id,
        districtCard: district
      };
      addLog(
        gameRoom,
        "district_graveyard_choice",
        `${targetPlayer.name} 可以决定是否通过墓地收回被破坏的 ${district.name}。`
      );
    }
  } else {
    gameRoom.districtDiscardPile.push(district);
  }

  addLog(
    gameRoom,
    options.logType,
    `${player.name} 使用${options.sourceName}，花费 ${destroyCost} 枚金币破坏了 ${targetPlayer.name} 的 ${district.name}。`
  );
  return { ok: true };
}

export function resolveGraveyardChoice(
  gameRoom: GameRoom,
  input: { playerId: string; buyBack: boolean }
): Result {
  const pendingChoice = gameRoom.pendingGraveyardChoice;
  if (!pendingChoice || pendingChoice.playerId !== input.playerId) {
    return { ok: false, error: "当前没有需要你处理的墓地选择。" };
  }

  const player = findPlayer(gameRoom, input.playerId);
  if (!player) {
    return { ok: false, error: "玩家不存在。" };
  }

  gameRoom.pendingGraveyardChoice = null;
  if (input.buyBack && player.gold > 0) {
    buyBackDestroyedDistrict(gameRoom, player, pendingChoice.districtCard);
  } else {
    gameRoom.districtDiscardPile.push(pendingChoice.districtCard);
    addLog(
      gameRoom,
      "district_graveyard_declined",
      `${player.name} 放弃通过墓地收回 ${pendingChoice.districtCard.name}。`
    );
  }
  return { ok: true };
}

function buyBackDestroyedDistrict(gameRoom: GameRoom, player: Player, district: DistrictCard) {
  player.gold -= 1;
  player.hand.push(district);
  addLog(
    gameRoom,
    "district_graveyard_buyback",
    `${player.name} 花费 1 枚金币，通过墓地收回了被破坏的 ${district.name}。`
  );
}

export function calculateDistrictDestroyCost(
  district: DistrictCard,
  targetHasGreatWall: boolean,
  costMode: DistrictDestroyCostMode
) {
  if (costMode === "free") {
    return 0;
  }
  return Math.max(district.cost - 1 + (targetHasGreatWall ? 1 : 0), 0);
}

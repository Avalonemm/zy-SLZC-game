import type { GameRoom, Player, UseDistrictEffectPayload } from "@zy/shared";
import { validateCurrentTurn, validateNoPendingDrawChoice } from "./actions";
import { drawAvailableDistrictCards } from "./districtDeck";
import type { Result } from "./gameEngineTypes";
import { addLog } from "./gameEngineUtils";

export function useDistrictEffect(
  gameRoom: GameRoom,
  input: Omit<UseDistrictEffectPayload, "roomCode">
): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  const pendingChoiceResult = validateNoPendingDrawChoice(gameRoom, input.playerId);
  if (!pendingChoiceResult.ok) {
    return pendingChoiceResult;
  }

  const district = result.player.city.find((card) => card.id === input.districtCardId);
  if (!district) {
    return { ok: false, error: "请选择你城市中可发动效果的建筑。" };
  }

  result.turnState.usedDistrictEffectIds ??= [];
  if (result.turnState.usedDistrictEffectIds.includes(district.id)) {
    return { ok: false, error: "本回合已经使用过这张建筑效果。" };
  }

  switch (district.effectType) {
    case "discard_hand_for_gold":
      return useLaboratoryEffect(gameRoom, result.player, result.turnState, district.id, input.discardCardId);
    case "pay_gold_draw_cards":
      return useSmithyEffect(gameRoom, result.player, result.turnState, district.id);
    default:
      return { ok: false, error: "这张建筑没有可主动发动的效果。" };
  }
}

function useLaboratoryEffect(
  gameRoom: GameRoom,
  player: Player,
  turnState: NonNullable<GameRoom["turnState"]>,
  districtCardId: string,
  discardCardId?: string
): Result {
  if (!discardCardId) {
    return { ok: false, error: "实验室需要选择 1 张手牌弃置。" };
  }

  const discardIndex = player.hand.findIndex((card) => card.id === discardCardId);
  if (discardIndex === -1) {
    return { ok: false, error: "手牌中没有要弃置的建筑。" };
  }

  const [discardedCard] = player.hand.splice(discardIndex, 1);
  gameRoom.districtDiscardPile.push(discardedCard);
  player.gold += 1;
  turnState.usedDistrictEffectIds?.push(districtCardId);
  addLog(gameRoom, "district_laboratory", `${player.name} 使用实验室，弃置 1 张手牌获得 1 枚金币。`);
  return { ok: true };
}

function useSmithyEffect(
  gameRoom: GameRoom,
  player: Player,
  turnState: NonNullable<GameRoom["turnState"]>,
  districtCardId: string
): Result {
  if (player.gold < 2) {
    return { ok: false, error: "金币不足，无法使用铁匠铺。" };
  }

  const drawnCards = drawAvailableDistrictCards(gameRoom, 3);
  if (drawnCards.length === 0) {
    return { ok: false, error: "没有可抽的建筑牌。" };
  }

  player.gold -= 2;
  player.hand.push(...drawnCards);
  turnState.usedDistrictEffectIds?.push(districtCardId);
  addLog(gameRoom, "district_smithy", `${player.name} 使用铁匠铺，支付 2 枚金币抽了 ${drawnCards.length} 张建筑牌。`);
  return { ok: true };
}

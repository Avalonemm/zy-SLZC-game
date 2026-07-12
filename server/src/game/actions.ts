import type { DistrictCard, GameRoom, Player } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer } from "./gameEngineUtils";
import { drawAvailableDistrictCards, returnDistrictCardsToDeckBottom } from "./districtDeck";
import { advanceToNextTurn } from "./turnFlow";

export function takeGold(
  gameRoom: GameRoom,
  input: { playerId: string }
): Result<{ player: Player }> {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  const pendingChoiceResult = validateNoPendingDrawChoice(gameRoom, input.playerId);
  if (!pendingChoiceResult.ok) {
    return pendingChoiceResult;
  }

  if (result.turnState.resourceActionTaken) {
    return { ok: false, error: "本回合已经选择过资源行动。" };
  }

  result.player.gold += 2;
  result.turnState.resourceActionTaken = true;
  result.turnState.actionStep = "ACTION";
  addLog(gameRoom, "take_gold", `${result.player.name} 拿了 2 枚金币。`, {
    kind: "take_gold",
    actorPlayerId: result.player.id,
    amount: 2
  });

  return { ok: true, player: result.player };
}

export function drawDistrictCards(
  gameRoom: GameRoom,
  input: { playerId: string }
): Result<{ drawnCards: DistrictCard[] }> {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  if (result.turnState.resourceActionTaken) {
    return { ok: false, error: "本回合已经选择过资源行动。" };
  }

  if (gameRoom.pendingDrawChoice) {
    return { ok: false, error: "当前还有未完成的抽牌选择。" };
  }

  const drawCount = result.player.city.some((district) => district.effectType === "draw_three_choose_one")
    ? 3
    : 2;
  const drawnCards = drawAvailableDistrictCards(gameRoom, drawCount);

  if (drawnCards.length === 0) {
    result.player.gold += 2;
    result.turnState.resourceActionTaken = true;
    result.turnState.actionStep = "ACTION";
    addLog(
      gameRoom,
      "draw_empty_take_gold",
      `${result.player.name} 抽牌时牌堆已空，系统改为领取 2 枚金币。`,
      { kind: "take_gold", actorPlayerId: result.player.id, amount: 2 }
    );
    return { ok: true, drawnCards };
  }

  if (
    drawnCards.length === 1 ||
    result.player.city.some((district) => district.effectType === "keep_all_drawn")
  ) {
    result.player.hand.push(...drawnCards);
    result.turnState.resourceActionTaken = true;
    result.turnState.actionStep = "ACTION";
    addLog(gameRoom, "draw_cards_kept", `${result.player.name} 保留了 ${drawnCards.length} 张建筑牌。`, {
      kind: "draw_resolved",
      actorPlayerId: result.player.id,
      cardCount: drawnCards.length
    });
    return { ok: true, drawnCards };
  }

  gameRoom.pendingDrawChoice = {
    playerId: result.player.id,
    drawnCards
  };
  addLog(gameRoom, "draw_cards", `${result.player.name} 抽了 ${drawnCards.length} 张建筑牌，等待选择 1 张。`, {
    kind: "draw_cards",
    actorPlayerId: result.player.id,
    cardCount: drawnCards.length
  });

  return { ok: true, drawnCards };
}

export function chooseDrawnDistrictCard(
  gameRoom: GameRoom,
  input: { playerId: string; districtCardId: string }
): Result<{ chosenCard: DistrictCard }> {
  const pendingChoice = gameRoom.pendingDrawChoice;
  if (!pendingChoice || pendingChoice.playerId !== input.playerId) {
    return { ok: false, error: "当前没有你的抽牌选择。" };
  }

  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  if (result.turnState.resourceActionTaken) {
    return { ok: false, error: "本回合已经选择过资源行动。" };
  }

  const chosenCard = pendingChoice.drawnCards.find((card) => card.id === input.districtCardId);
  if (!chosenCard) {
    return { ok: false, error: "请选择本次抽到的建筑牌。" };
  }

  const returnedCards = pendingChoice.drawnCards.filter((card) => card.id !== chosenCard.id);
  result.player.hand.push(chosenCard);
  returnDistrictCardsToDeckBottom(gameRoom, returnedCards);
  result.turnState.resourceActionTaken = true;
  result.turnState.actionStep = "ACTION";
  gameRoom.pendingDrawChoice = null;
  addLog(
    gameRoom,
    "choose_drawn_card",
    `${result.player.name} 保留 1 张建筑牌，未选牌放回牌堆底部。`,
    { kind: "draw_resolved", actorPlayerId: result.player.id, cardCount: 1 }
  );

  return { ok: true, chosenCard };
}

export function buildDistrict(
  gameRoom: GameRoom,
  input: { playerId: string; districtCardId: string }
): Result<{ district: DistrictCard }> {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  const pendingChoiceResult = validateNoPendingDrawChoice(gameRoom, input.playerId);
  if (!pendingChoiceResult.ok) {
    return pendingChoiceResult;
  }

  if (result.turnState.buildsUsed >= result.turnState.maxBuilds) {
    return { ok: false, error: "本回合已经建造过建筑。" };
  }

  const cardIndex = result.player.hand.findIndex((card) => card.id === input.districtCardId);
  if (cardIndex === -1) {
    return { ok: false, error: "手牌中没有这张建筑。" };
  }

  const district = result.player.hand[cardIndex];
  if (result.player.city.some((builtDistrict) => builtDistrict.name === district.name)) {
    return { ok: false, error: "不能重复建造同名建筑。" };
  }

  if (result.player.gold < district.cost) {
    return { ok: false, error: "金币不足，无法建造。" };
  }

  result.player.hand.splice(cardIndex, 1);
  result.player.gold -= district.cost;
  result.player.city.push(district);
  result.turnState.buildsUsed += 1;
  if (
    !gameRoom.firstCompletedCityPlayerId &&
    result.player.city.length >= gameRoom.settings.endCitySize
  ) {
    gameRoom.firstCompletedCityPlayerId = result.player.id;
    addLog(gameRoom, "final_round_triggered", `${result.player.name} 完成城市，本轮结束后进入结算。`, {
      kind: "final_round",
      actorPlayerId: result.player.id
    });
  }
  addLog(gameRoom, "build_district", `${result.player.name} 建造了 ${district.name}。`, {
    kind: "build_district",
    actorPlayerId: result.player.id,
    districtCardId: district.id,
    districtName: district.name,
    districtColor: district.color,
    cost: district.cost
  });

  return { ok: true, district };
}

export function endTurn(gameRoom: GameRoom, input: { playerId: string }): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  returnPendingDrawChoiceToDeck(gameRoom, input.playerId);
  if (!result.turnState.resourceActionTaken) {
    result.player.gold += 2;
    result.turnState.resourceActionTaken = true;
    result.turnState.actionStep = "ACTION";
    addLog(
      gameRoom,
      "auto_take_gold",
      `${result.player.name} 未选择资源行动，系统自动为其领取 2 枚金币。`
    );
  }
  addLog(gameRoom, "end_turn", `${result.player.name} 结束了回合。`);

  if (
    !gameRoom.firstCompletedCityPlayerId &&
    result.player.city.length >= gameRoom.settings.endCitySize
  ) {
    gameRoom.firstCompletedCityPlayerId = result.player.id;
    addLog(gameRoom, "final_round_triggered", `${result.player.name} 完成城市，本轮结束后进入结算。`, {
      kind: "final_round",
      actorPlayerId: result.player.id
    });
  }

  gameRoom.completedRoleIds.push(result.player.selectedRoleId ?? "");
  advanceToNextTurn(gameRoom);
  return { ok: true };
}

export function validateNoPendingDrawChoice(gameRoom: GameRoom, playerId: string): Result {
  if (gameRoom.pendingDrawChoice?.playerId === playerId) {
    return { ok: false, error: "请先完成本次抽牌选择，或结束回合放弃候选牌。" };
  }
  return { ok: true };
}

function returnPendingDrawChoiceToDeck(gameRoom: GameRoom, playerId: string) {
  if (!gameRoom.pendingDrawChoice || gameRoom.pendingDrawChoice.playerId !== playerId) {
    return;
  }

  returnDistrictCardsToDeckBottom(gameRoom, gameRoom.pendingDrawChoice.drawnCards);
  gameRoom.pendingDrawChoice = null;
}

export function validateCurrentTurn(
  gameRoom: GameRoom,
  playerId: string
): Result<{ player: Player; turnState: NonNullable<GameRoom["turnState"]> }> {
  if (gameRoom.pendingGraveyardChoice) {
    return { ok: false, error: "请等待墓地持有者完成是否收回建筑的选择。" };
  }
  if (gameRoom.phase !== "ROLE_ACTION") {
    return { ok: false, error: "当前不是角色行动阶段。" };
  }

  if (gameRoom.currentTurnPlayerId !== playerId) {
    return { ok: false, error: "还没有轮到你行动。" };
  }

  const player = findPlayer(gameRoom, playerId);
  if (!player) {
    return { ok: false, error: "玩家不存在。" };
  }

  if (!gameRoom.turnState || gameRoom.turnState.playerId !== playerId) {
    return { ok: false, error: "当前回合状态不存在。" };
  }

  return { ok: true, player, turnState: gameRoom.turnState };
}

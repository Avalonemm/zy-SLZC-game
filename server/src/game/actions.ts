import type { DistrictCard, GameRoom, Player } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer } from "./gameEngineUtils";
import { scoreGame } from "./scoring";
import { advanceToNextTurn } from "./turnFlow";

export function takeGold(
  gameRoom: GameRoom,
  input: { playerId: string }
): Result<{ player: Player }> {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  if (result.turnState.resourceActionTaken) {
    return { ok: false, error: "本回合已经选择过资源行动。" };
  }

  result.player.gold += 2;
  result.turnState.resourceActionTaken = true;
  addLog(gameRoom, "take_gold", `${result.player.name} 拿了 2 枚金币。`);

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

  const drawnCards = gameRoom.districtDeck.splice(0, Math.min(2, gameRoom.districtDeck.length));
  gameRoom.pendingDrawChoice = {
    playerId: result.player.id,
    drawnCards
  };
  addLog(gameRoom, "draw_cards", `${result.player.name} 抽了 ${drawnCards.length} 张建筑牌，等待选择 1 张。`);

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
  gameRoom.districtDeck.push(...returnedCards);
  result.turnState.resourceActionTaken = true;
  gameRoom.pendingDrawChoice = null;
  addLog(
    gameRoom,
    "choose_drawn_card",
    `${result.player.name} 保留 1 张建筑牌，未选牌放回牌堆底部。`
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
  addLog(gameRoom, "build_district", `${result.player.name} 建造了 ${district.name}。`);

  return { ok: true, district };
}

export function endTurn(gameRoom: GameRoom, input: { playerId: string }): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  returnPendingDrawChoiceToDeck(gameRoom, input.playerId);
  addLog(gameRoom, "end_turn", `${result.player.name} 结束了回合。`);

  if (gameRoom.players.some((player) => player.city.length >= gameRoom.settings.endCitySize)) {
    scoreGame(gameRoom);
    return { ok: true };
  }

  gameRoom.completedRoleIds.push(result.player.selectedRoleId ?? "");
  advanceToNextTurn(gameRoom);
  return { ok: true };
}

function returnPendingDrawChoiceToDeck(gameRoom: GameRoom, playerId: string) {
  if (!gameRoom.pendingDrawChoice || gameRoom.pendingDrawChoice.playerId !== playerId) {
    return;
  }

  gameRoom.districtDeck.push(...gameRoom.pendingDrawChoice.drawnCards);
  gameRoom.pendingDrawChoice = null;
}

export function validateCurrentTurn(
  gameRoom: GameRoom,
  playerId: string
): Result<{ player: Player; turnState: NonNullable<GameRoom["turnState"]> }> {
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

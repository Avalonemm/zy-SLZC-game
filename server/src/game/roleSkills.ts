import type { DistrictCard, GameRoom, Player, RoleCard, UseRoleSkillPayload } from "@zy/shared";
import type { Result } from "./gameEngineTypes";
import { addLog, findPlayer, findRole } from "./gameEngineUtils";

export function applyRoleSkill(
  gameRoom: GameRoom,
  player: Player,
  role: RoleCard,
  input: Omit<UseRoleSkillPayload, "roomCode">
): Result {
  switch (role.effectType) {
    case "skip_role":
      return applySkipRole(gameRoom, player, input.targetRoleId);
    case "steal_gold":
      return applyStealGold(gameRoom, player, input.targetRoleId);
    case "exchange_cards":
      return applyExchangeCardsSkill(gameRoom, player, input);
    case "take_crown":
      applyStandardRoleColorIncome(gameRoom, player, role);
      gameRoom.crownPlayerId = player.id;
      addLog(gameRoom, "skill_take_crown", `${player.name} 获得了下轮先手权。`);
      return { ok: true };
    case "protect_city":
      applyStandardRoleColorIncome(gameRoom, player, role);
      if (!gameRoom.roleEffects.protectedPlayerIds.includes(player.id)) {
        gameRoom.roleEffects.protectedPlayerIds.push(player.id);
      }
      addLog(gameRoom, "skill_protect_city", `${player.name} 的城市本轮受到保护。`);
      return { ok: true };
    case "income_by_color":
      return applyIncomeByColor(gameRoom, player, role);
    case "extra_build":
      if (!gameRoom.turnState || gameRoom.turnState.playerId !== player.id) {
        return { ok: false, error: "当前回合状态不存在。" };
      }
      gameRoom.turnState.maxBuilds += 1;
      drawCardsToHand(gameRoom, player, 2);
      addLog(gameRoom, "skill_extra_build", `${player.name} 抽了 2 张建筑牌，本回合可以额外建造 1 次。`);
      return { ok: true };
    case "destroy_district":
      applyStandardRoleColorIncome(gameRoom, player, role);
      if (!input.targetPlayerId && !input.targetDistrictCardId) {
        return { ok: true };
      }
      return applyDestroyDistrict(gameRoom, player, input.targetPlayerId, input.targetDistrictCardId);
    default:
      return { ok: false, error: "该角色技能暂未实现。" };
  }
}

export function applyStealEffectBeforeTurn(
  gameRoom: GameRoom,
  player: Player,
  role: RoleCard | null
) {
  if (!role) {
    return;
  }

  const thiefPlayerId = gameRoom.roleEffects.stealTargets[role.id];
  if (!thiefPlayerId || thiefPlayerId === player.id || player.gold <= 0) {
    return;
  }

  const thief = findPlayer(gameRoom, thiefPlayerId);
  if (!thief) {
    return;
  }

  const stolenGold = player.gold;
  player.gold = 0;
  thief.gold += stolenGold;
  addLog(gameRoom, "skill_steal_resolved", `${thief.name} 偷取了 ${player.name} 的 ${stolenGold} 枚金币。`);
}

function applySkipRole(gameRoom: GameRoom, player: Player, targetRoleId?: string): Result {
  const targetRole = findRole(targetRoleId);
  if (!targetRole) {
    return { ok: false, error: "请选择要跳过的角色。" };
  }

  if (targetRole.id === player.selectedRoleId) {
    return { ok: false, error: "不能指定自己的角色。" };
  }

  if (gameRoom.completedRoleIds.includes(targetRole.id)) {
    return { ok: false, error: "目标角色已经行动过。" };
  }

  if (!gameRoom.roleEffects.skippedRoleIds.includes(targetRole.id)) {
    gameRoom.roleEffects.skippedRoleIds.push(targetRole.id);
  }
  addLog(gameRoom, "skill_skip_role", `${player.name} 指定 ${targetRole.name} 本轮跳过行动。`);
  return { ok: true };
}

function applyStealGold(gameRoom: GameRoom, player: Player, targetRoleId?: string): Result {
  const targetRole = findRole(targetRoleId);
  if (!targetRole) {
    return { ok: false, error: "请选择要偷取的角色。" };
  }

  if (targetRole.id === player.selectedRoleId) {
    return { ok: false, error: "不能指定自己的角色。" };
  }

  if (targetRole.id === "assassin") {
    return { ok: false, error: "盗贼不能偷取刺客。" };
  }

  if (gameRoom.roleEffects.skippedRoleIds.includes(targetRole.id)) {
    return { ok: false, error: "不能偷取本轮被刺客跳过的角色。" };
  }

  if (gameRoom.completedRoleIds.includes(targetRole.id)) {
    return { ok: false, error: "目标角色已经行动过。" };
  }

  gameRoom.roleEffects.stealTargets[targetRole.id] = player.id;
  addLog(gameRoom, "skill_steal_gold", `${player.name} 准备偷取 ${targetRole.name} 的金币。`);
  return { ok: true };
}

function applyExchangeCardsSkill(
  gameRoom: GameRoom,
  player: Player,
  input: Omit<UseRoleSkillPayload, "roomCode">
): Result {
  if (input.targetPlayerId) {
    const targetPlayer = findPlayer(gameRoom, input.targetPlayerId);
    if (!targetPlayer) {
      return { ok: false, error: "目标玩家不存在。" };
    }

    if (targetPlayer.id === player.id) {
      return { ok: false, error: "不能与自己交换手牌。" };
    }

    const ownHand = player.hand;
    player.hand = targetPlayer.hand;
    targetPlayer.hand = ownHand;
    addLog(
      gameRoom,
      "skill_swap_hands",
      `${player.name} 与 ${targetPlayer.name} 交换了全部手牌。`
    );
    return { ok: true };
  }

  const discardCardIds = input.discardCardIds;
  const uniqueDiscardIds = [...new Set(discardCardIds ?? [])];
  if (uniqueDiscardIds.length === 0) {
    return { ok: false, error: "请选择要弃置的手牌或交换目标。" };
  }

  const discardCards = uniqueDiscardIds.map((cardId) =>
    player.hand.find((card) => card.id === cardId)
  );
  if (discardCards.some((card) => !card)) {
    return { ok: false, error: "手牌中没有要弃置的建筑。" };
  }

  player.hand = player.hand.filter((card) => !uniqueDiscardIds.includes(card.id));
  gameRoom.districtDiscardPile.push(...(discardCards as DistrictCard[]));

  const drawnCards = gameRoom.districtDeck.splice(
    0,
    Math.min(uniqueDiscardIds.length, gameRoom.districtDeck.length)
  );
  player.hand.push(...drawnCards);
  addLog(
    gameRoom,
    "skill_exchange_cards",
    `${player.name} 弃置 ${uniqueDiscardIds.length} 张手牌并抽了 ${drawnCards.length} 张牌。`
  );
  return { ok: true };
}

function applyIncomeByColor(gameRoom: GameRoom, player: Player, role: RoleCard): Result {
  const color = typeof role.effectParams.color === "string" ? role.effectParams.color : "green";
  const income =
    player.city.filter((district) => district.color === color).length +
    (role.id === "merchant" ? 1 : 0);
  player.gold += income;
  addLog(gameRoom, "skill_extra_gold", `${player.name} 通过角色技能获得 ${income} 枚金币。`);
  return { ok: true };
}

function applyStandardRoleColorIncome(gameRoom: GameRoom, player: Player, role: RoleCard) {
  const colorByRoleId: Record<string, DistrictCard["color"] | undefined> = {
    king: "yellow",
    bishop: "blue",
    warlord: "red"
  };
  const color = colorByRoleId[role.id];
  if (!color) {
    return;
  }

  const income = player.city.filter((district) => district.color === color).length;
  if (income <= 0) {
    addLog(gameRoom, "skill_color_income", `${player.name} 没有获得额外颜色收入。`);
    return;
  }

  player.gold += income;
  addLog(gameRoom, "skill_color_income", `${player.name} 获得 ${income} 枚颜色建筑收入。`);
}

function drawCardsToHand(gameRoom: GameRoom, player: Player, count: number) {
  const drawnCards = gameRoom.districtDeck.splice(0, Math.min(count, gameRoom.districtDeck.length));
  player.hand.push(...drawnCards);
  return drawnCards;
}

function applyDestroyDistrict(
  gameRoom: GameRoom,
  player: Player,
  targetPlayerId?: string,
  targetDistrictCardId?: string
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

  const districtIndex = targetPlayer.city.findIndex((district) => district.id === targetDistrictCardId);
  if (districtIndex === -1) {
    return { ok: false, error: "目标建筑不存在。" };
  }

  const district = targetPlayer.city[districtIndex];
  const destroyCost = Math.max(district.cost - 1, 0);
  if (player.gold < destroyCost) {
    return { ok: false, error: "金币不足，无法破坏建筑。" };
  }

  targetPlayer.city.splice(districtIndex, 1);
  player.gold -= destroyCost;
  gameRoom.districtDiscardPile.push(district);
  addLog(
    gameRoom,
    "skill_destroy_district",
    `${player.name} 花费 ${destroyCost} 枚金币破坏了 ${targetPlayer.name} 的 ${district.name}。`
  );
  return { ok: true };
}

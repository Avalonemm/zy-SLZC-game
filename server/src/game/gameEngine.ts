import type {
  DistrictCard,
  GameLog,
  GameRoom,
  Player,
  RoleCard,
  ScoreResult,
  UseRoleSkillPayload,
  VisibleGameState
} from "@zy/shared";
import { randomUUID } from "node:crypto";
import { loadRoleCards } from "./cardData";

type Ok<T extends object = object> = T & { ok: true };
type Fail = { ok: false; error: string };
type Result<T extends object = object> = Ok<T> | Fail;

const ENDING_CITY_SIZE = 4;

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

  if (!nextPlayerId) {
    enterRoleActionPhase(gameRoom);
  }

  return { ok: true };
}

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

  const drawnCards = gameRoom.districtDeck.splice(0, Math.min(2, gameRoom.districtDeck.length));
  result.player.hand.push(...drawnCards);
  result.turnState.resourceActionTaken = true;
  addLog(gameRoom, "draw_cards", `${result.player.name} 抽了 ${drawnCards.length} 张建筑牌。`);

  return { ok: true, drawnCards };
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

export function useRoleSkill(
  gameRoom: GameRoom,
  input: Omit<UseRoleSkillPayload, "roomCode">
): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  if (gameRoom.roleEffects.usedSkillPlayerIds.includes(input.playerId)) {
    return { ok: false, error: "本回合已经使用过角色技能。" };
  }

  const role = roleForPlayer(gameRoom, result.player);
  if (!role) {
    return { ok: false, error: "当前玩家没有已选择角色。" };
  }

  const skillResult = applyRoleSkill(gameRoom, result.player, role, input);
  if (!skillResult.ok) {
    return skillResult;
  }

  gameRoom.roleEffects.usedSkillPlayerIds.push(input.playerId);
  return { ok: true };
}

export function endTurn(gameRoom: GameRoom, input: { playerId: string }): Result {
  const result = validateCurrentTurn(gameRoom, input.playerId);
  if (!result.ok) {
    return result;
  }

  addLog(gameRoom, "end_turn", `${result.player.name} 结束了回合。`);

  if (gameRoom.players.some((player) => player.city.length >= ENDING_CITY_SIZE)) {
    scoreGame(gameRoom);
    return { ok: true };
  }

  gameRoom.completedRoleIds.push(result.player.selectedRoleId ?? "");
  advanceToNextTurn(gameRoom);
  return { ok: true };
}

export function runBotTurns(gameRoom: GameRoom): Result {
  let guard = 0;

  while (guard < 100) {
    guard += 1;

    if (gameRoom.phase === "ENDED") {
      return { ok: true };
    }

    if (gameRoom.phase === "ROLE_SELECTION") {
      const player = gameRoom.players.find(
        (candidate) => candidate.id === gameRoom.roleSelectionTurnPlayerId
      );
      if (!player || !player.isBot) {
        return { ok: true };
      }

      const role = gameRoom.availableRoles[0];
      if (!role) {
        return { ok: false, error: "没有可选角色。" };
      }

      const result = selectRole(gameRoom, { playerId: player.id, roleId: role.id });
      if (!result.ok) {
        return result;
      }
      continue;
    }

    if (gameRoom.phase === "ROLE_ACTION") {
      const player = gameRoom.players.find(
        (candidate) => candidate.id === gameRoom.currentTurnPlayerId
      );
      if (!player || !player.isBot) {
        return { ok: true };
      }

      playBotAction(gameRoom, player);
      const endResult = endTurn(gameRoom, { playerId: player.id });
      if (!endResult.ok) {
        return endResult;
      }
      continue;
    }

    return { ok: true };
  }

  return { ok: false, error: "测试人机自动行动超出安全步数。" };
}

export function visibleStateForPlayer(
  gameRoom: GameRoom,
  playerId: string
): VisibleGameState {
  const { districtDeck: _districtDeck, ...roomWithoutDeck } = gameRoom;

  return {
    ...roomWithoutDeck,
    players: gameRoom.players.map((player) => {
      const visiblePlayer = {
        ...player,
        handCount: player.hand.length,
        selectedRoleId: canSeeSelectedRole(gameRoom, player, playerId)
          ? player.selectedRoleId
          : null
      };

      if (player.id === playerId) {
        return visiblePlayer;
      }

      const { hand: _hand, ...withoutHand } = visiblePlayer;
      return withoutHand;
    }),
    districtDeckCount: gameRoom.districtDeck.length
  };
}

function canSeeSelectedRole(gameRoom: GameRoom, player: Player, viewerPlayerId: string) {
  if (player.id === viewerPlayerId || gameRoom.phase === "ENDED") {
    return true;
  }

  if (!player.selectedRoleId) {
    return false;
  }

  if (gameRoom.currentTurnPlayerId === player.id) {
    return true;
  }

  return gameRoom.completedRoleIds.includes(player.selectedRoleId);
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

function advanceToNextTurn(gameRoom: GameRoom) {
  let nextEntry = nextPendingRoleEntry(gameRoom);

  while (nextEntry && gameRoom.roleEffects.skippedRoleIds.includes(nextEntry.role.id)) {
    gameRoom.completedRoleIds.push(nextEntry.role.id);
    addLog(gameRoom, "role_skipped", `${nextEntry.role.name} 被刺客跳过了行动。`);
    nextEntry = nextPendingRoleEntry(gameRoom);
  }

  if (nextEntry) {
    prepareTurn(gameRoom, nextEntry.player);
    return;
  }

  startNextRound(gameRoom);
}

function startNextRound(gameRoom: GameRoom) {
  gameRoom.currentRound += 1;
  gameRoom.phase = "ROLE_SELECTION";
  gameRoom.availableRoles = loadRoleCards();
  gameRoom.discardedRoles = [];
  gameRoom.currentRoleOrder = [];
  gameRoom.completedRoleIds = [];
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.roleEffects = createEmptyRoleEffects();
  gameRoom.roleSelectionOrder = createPlayerOrder(gameRoom.players, gameRoom.crownPlayerId);
  gameRoom.roleSelectionTurnPlayerId = gameRoom.roleSelectionOrder[0] ?? null;
  for (const player of gameRoom.players) {
    player.selectedRoleId = null;
  }
  addLog(gameRoom, "round_start", `第 ${gameRoom.currentRound} 轮开始，进入角色选择阶段。`);
}

function scoreGame(gameRoom: GameRoom) {
  const scoringResults: ScoreResult[] = gameRoom.players
    .map((player) => {
      const districtScore = player.city.reduce((total, district) => total + district.score, 0);
      const bonusScore = player.city.length >= ENDING_CITY_SIZE ? 2 : 0;
      const totalScore = districtScore + bonusScore;
      player.score = totalScore;
      return {
        playerId: player.id,
        playerName: player.name,
        districtScore,
        bonusScore,
        totalScore
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  gameRoom.phase = "ENDED";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.scoringResults = scoringResults;
  addLog(gameRoom, "game_ended", "游戏结束，已完成自动结算。");
}

function validateCurrentTurn(
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

function playBotAction(gameRoom: GameRoom, player: Player) {
  const affordableAfterGold = cheapestAffordableCard(player, player.gold + 2);
  if (affordableAfterGold) {
    takeGold(gameRoom, { playerId: player.id });
  } else {
    drawDistrictCards(gameRoom, { playerId: player.id });
  }

  const card = cheapestAffordableCard(player, player.gold);
  if (card) {
    buildDistrict(gameRoom, { playerId: player.id, districtCardId: card.id });
  }
}

function cheapestAffordableCard(player: Player, gold: number) {
  return [...player.hand].filter((card) => card.cost <= gold).sort((a, b) => a.cost - b.cost)[0];
}

function prepareTurn(gameRoom: GameRoom, player: Player | null) {
  gameRoom.currentTurnPlayerId = player?.id ?? null;
  gameRoom.turnState = player
    ? {
        playerId: player.id,
        resourceActionTaken: false,
        buildsUsed: 0,
        maxBuilds: 1
      }
    : null;

  if (player) {
    const role = roleForPlayer(gameRoom, player);
    applyStealEffectBeforeTurn(gameRoom, player, role);
    addLog(
      gameRoom,
      "turn_start",
      `轮到 ${player.name} 行动${role ? `（${role.name}）` : ""}。`
    );
  }
}

function applyRoleSkill(
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
      return applyExchangeCardsSkill(gameRoom, player, input.discardCardIds);
    case "take_crown":
      gameRoom.crownPlayerId = player.id;
      addLog(gameRoom, "skill_take_crown", `${player.name} 获得了下轮先手权。`);
      return { ok: true };
    case "protect_city":
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
      addLog(gameRoom, "skill_extra_build", `${player.name} 本回合可以额外建造 1 次。`);
      return { ok: true };
    case "destroy_district":
      return applyDestroyDistrict(gameRoom, player, input.targetPlayerId, input.targetDistrictCardId);
    default:
      return { ok: false, error: "该角色技能暂未实现。" };
  }
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
  discardCardIds?: string[]
): Result {
  const uniqueDiscardIds = [...new Set(discardCardIds ?? [])];
  if (uniqueDiscardIds.length === 0) {
    return { ok: false, error: "请选择要弃置的手牌。" };
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
  const income = player.city.filter((district) => district.color === color).length;
  player.gold += income;
  addLog(gameRoom, "skill_extra_gold", `${player.name} 通过角色技能获得 ${income} 枚金币。`);
  return { ok: true };
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

function applyStealEffectBeforeTurn(gameRoom: GameRoom, player: Player, role: RoleCard | null) {
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

function findRole(roleId?: string) {
  if (!roleId) {
    return null;
  }

  return loadRoleCards().find((role) => role.id === roleId) ?? null;
}

function createEmptyRoleEffects() {
  return {
    skippedRoleIds: [],
    protectedPlayerIds: [],
    stealTargets: {},
    usedSkillPlayerIds: []
  };
}

function nextRoleSelectionPlayerId(gameRoom: GameRoom) {
  return (
    gameRoom.roleSelectionOrder.find((playerId) => {
      const player = findPlayer(gameRoom, playerId);
      return Boolean(player && !player.selectedRoleId);
    }) ?? null
  );
}

function roleForPlayer(gameRoom: GameRoom, player: Player) {
  if (!player.selectedRoleId) {
    return null;
  }

  return loadRoleCards().find((role) => role.id === player.selectedRoleId) ?? null;
}

function findPlayer(gameRoom: GameRoom, playerId: string) {
  return gameRoom.players.find((player) => player.id === playerId) ?? null;
}

function addLog(gameRoom: GameRoom, type: string, message: string) {
  const log: GameLog = {
    id: randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString()
  };
  gameRoom.gameLog.unshift(log);
}

function createPlayerOrder(players: Player[], crownPlayerId: string) {
  const crownIndex = players.findIndex((player) => player.id === crownPlayerId);
  if (crownIndex === -1) {
    return players.map((player) => player.id);
  }

  return [...players.slice(crownIndex), ...players.slice(0, crownIndex)].map(
    (player) => player.id
  );
}

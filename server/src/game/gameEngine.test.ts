import { describe, expect, it } from "vitest";
import { initializeGameRoom } from "./gameSetup";
import { resolveExpiredTurn } from "./timers";
import {
  buildDistrict,
  chooseDrawnDistrictCard,
  drawDistrictCards,
  endTurn,
  advanceOfflinePlayers,
  runBotTurns,
  selectRole,
  skipOfflineCurrentPlayer,
  takeGold,
  useRoleSkill,
  visibleStateForPlayer
} from "./gameEngine";
import { addLog } from "./gameEngineUtils";
import type { GameRoom, RoomSettings, RoomState } from "@zy/shared";

function createDefaultSettings(overrides: Partial<RoomSettings> = {}): RoomSettings {
  return {
    startCountdownSeconds: 10,
    turnTimeoutSeconds: 15,
    endCitySize: 8,
    enabledRoleIds: [
      "assassin",
      "thief",
      "magician",
      "king",
      "bishop",
      "merchant",
      "architect",
      "warlord"
    ],
    enableFaceUpRoleDiscard: false,
    enableFaceDownRoleDiscard: false,
    drawMode: "draw2Choose1",
    roleRulePreset: "standard4Player",
    ...overrides
  };
}

function createStartedGame() {
  const lobbyRoom: RoomState = {
    roomCode: "ROOM44",
    hostPlayerId: "player-1",
    status: "STARTED",
    minPlayers: 2,
    maxPlayers: 4,
    futureMaxPlayers: 8,
    settings: createDefaultSettings(),
    startCountdown: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    chatMessages: [],
    players: ["Alice", "Bob", "Cici", "Dan"].map((name, index) => ({
      id: `player-${index + 1}`,
      uid: 100001 + index,
      socketId: `socket-${index + 1}`,
      name,
      connected: true,
      isHost: index === 0,
      isReady: true,
      isBot: false
    }))
  };

  const gameRoom = initializeGameRoom(lobbyRoom);
  gameRoom.crownPlayerId = "player-1";
  if (gameRoom.phase === "CROWN_REVEAL") {
    const result = resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);
    expect(result.ok).toBe(true);
  }
  return gameRoom;
}

function selectRolesById(gameRoom: GameRoom, roleIds: string[]) {
  for (const [index, player] of gameRoom.players.entries()) {
    const result = selectRole(gameRoom, {
      playerId: player.id,
      roleId: roleIds[index]
    });
    expect(result.ok).toBe(true);
  }
}

function forceRoleActionTurn(gameRoom: GameRoom, playerId: string, roleId: string) {
  const player = gameRoom.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Missing player ${playerId}`);
  }

  gameRoom.phase = "ROLE_ACTION";
  gameRoom.currentTurnPlayerId = playerId;
  player.selectedRoleId = roleId;
  gameRoom.turnState = {
    playerId,
    resourceActionTaken: false,
    buildsUsed: 0,
    maxBuilds: 1
  };
}

describe("game engine", () => {
  it("selects roles in player order and enters action phase", () => {
    const gameRoom = createStartedGame();

    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-1");

    const roles = [...gameRoom.availableRoles];
    for (const [index, player] of gameRoom.players.entries()) {
      const result = selectRole(gameRoom, {
        playerId: player.id,
        roleId: roles[index].id
      });
      expect(result.ok).toBe(true);
    }

    expect(gameRoom.phase).toBe("ROLE_ACTION");
    expect(gameRoom.currentTurnPlayerId).toBe("player-1");
    expect(gameRoom.currentRoleOrder).toEqual([1, 2, 3, 4]);
  });

  it("lets the current player take gold, draw cards, build, and end turns", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    for (const [index, player] of gameRoom.players.entries()) {
      selectRole(gameRoom, {
        playerId: player.id,
        roleId: roles[index].id
      });
    }

    const firstPlayer = gameRoom.players[0];
    firstPlayer.hand[0] = { ...firstPlayer.hand[0], cost: 1 };
    const initialGold = firstPlayer.gold;
    const initialHandSize = firstPlayer.hand.length;

    const goldResult = takeGold(gameRoom, { playerId: firstPlayer.id });
    expect(goldResult.ok).toBe(true);
    expect(firstPlayer.gold).toBe(initialGold + 2);

    const secondGoldResult = takeGold(gameRoom, { playerId: firstPlayer.id });
    expect(secondGoldResult).toEqual({
      ok: false,
      error: "本回合已经选择过资源行动。"
    });

    const affordableCard = firstPlayer.hand.find((card) => card.cost <= firstPlayer.gold);
    expect(affordableCard).toBeDefined();
    if (!affordableCard) {
      throw new Error("Expected an affordable starting card.");
    }

    const buildResult = buildDistrict(gameRoom, {
      playerId: firstPlayer.id,
      districtCardId: affordableCard.id
    });
    expect(buildResult.ok).toBe(true);
    expect(firstPlayer.city).toHaveLength(1);
    expect(firstPlayer.hand).toHaveLength(initialHandSize - 1);

    const endResult = endTurn(gameRoom, { playerId: firstPlayer.id });
    expect(endResult.ok).toBe(true);
    expect(gameRoom.currentTurnPlayerId).toBe("player-2");

    const drawResult = drawDistrictCards(gameRoom, { playerId: "player-2" });
    expect(drawResult.ok).toBe(true);
    expect(gameRoom.pendingDrawChoice?.playerId).toBe("player-2");
    expect(gameRoom.players[1].hand).toHaveLength(4);

    if (!drawResult.ok) {
      throw new Error("Expected draw result.");
    }
    const chooseResult = chooseDrawnDistrictCard(gameRoom, {
      playerId: "player-2",
      districtCardId: drawResult.drawnCards[0].id
    });
    expect(chooseResult.ok).toBe(true);
    expect(gameRoom.players[1].hand).toHaveLength(5);
  });

  it("starts a new round after all selected roles act", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    for (const [index, player] of gameRoom.players.entries()) {
      selectRole(gameRoom, {
        playerId: player.id,
        roleId: roles[index].id
      });
    }

    for (const player of gameRoom.players) {
      endTurn(gameRoom, { playerId: player.id });
    }

    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.currentRound).toBe(2);
    expect(gameRoom.availableRoles).toHaveLength(8);
    expect(gameRoom.players.every((player) => player.selectedRoleId === null)).toBe(true);
  });

  it("ends the game and scores when a player reaches the configured city size after their turn", () => {
    const gameRoom = createStartedGame();
    gameRoom.settings.endCitySize = 4;
    const roles = [...gameRoom.availableRoles];
    for (const [index, player] of gameRoom.players.entries()) {
      selectRole(gameRoom, {
        playerId: player.id,
        roleId: roles[index].id
      });
    }

    const firstPlayer = gameRoom.players[0];
    firstPlayer.city = firstPlayer.hand.slice(0, 4);
    firstPlayer.hand = [];

    const endResult = endTurn(gameRoom, { playerId: firstPlayer.id });
    expect(endResult.ok).toBe(true);
    expect(gameRoom.phase).toBe("ENDED");
    expect(firstPlayer.score).toBeGreaterThan(0);
    expect(gameRoom.scoringResults).toHaveLength(4);
  });

  it("keeps the unchosen drawn district card at the bottom of the deck", () => {
    const gameRoom = createStartedGame();
    selectRolesById(gameRoom, ["assassin", "thief", "magician", "king"]);
    endTurn(gameRoom, { playerId: "player-1" });

    const player = gameRoom.players[1];
    const [drawA, drawB, nextCard] = gameRoom.districtDeck;
    const drawResult = drawDistrictCards(gameRoom, { playerId: player.id });

    expect(drawResult.ok).toBe(true);
    if (!drawResult.ok) {
      throw new Error("Expected draw result.");
    }
    expect(drawResult.drawnCards.map((card) => card.id)).toEqual([drawA.id, drawB.id]);

    const chooseResult = chooseDrawnDistrictCard(gameRoom, {
      playerId: player.id,
      districtCardId: drawA.id
    });

    expect(chooseResult.ok).toBe(true);
    expect(player.hand.map((card) => card.id)).toContain(drawA.id);
    expect(player.hand.map((card) => card.id)).not.toContain(drawB.id);
    expect(gameRoom.districtDeck[0].id).toBe(nextCard.id);
    expect(gameRoom.districtDeck.at(-1)?.id).toBe(drawB.id);
    expect(gameRoom.pendingDrawChoice).toBeNull();
    expect(gameRoom.turnState?.resourceActionTaken).toBe(true);
  });

  it("clears unresolved drawn cards when the player turn ends", () => {
    const gameRoom = createStartedGame();
    selectRolesById(gameRoom, ["assassin", "thief", "magician", "king"]);
    endTurn(gameRoom, { playerId: "player-1" });

    const player = gameRoom.players[1];
    const [drawA, drawB] = gameRoom.districtDeck;
    const drawResult = drawDistrictCards(gameRoom, { playerId: player.id });

    expect(drawResult.ok).toBe(true);
    expect(gameRoom.pendingDrawChoice?.playerId).toBe(player.id);

    const endResult = endTurn(gameRoom, { playerId: player.id });

    expect(endResult.ok).toBe(true);
    expect(gameRoom.pendingDrawChoice).toBeNull();
    expect(gameRoom.districtDeck.at(-2)?.id).toBe(drawA.id);
    expect(gameRoom.districtDeck.at(-1)?.id).toBe(drawB.id);
  });
  it("rejects draw choices from another player", () => {
    const gameRoom = createStartedGame();
    selectRolesById(gameRoom, ["assassin", "thief", "magician", "king"]);
    endTurn(gameRoom, { playerId: "player-1" });

    const drawResult = drawDistrictCards(gameRoom, { playerId: "player-2" });
    expect(drawResult.ok).toBe(true);
    if (!drawResult.ok) {
      throw new Error("Expected draw result.");
    }

    expect(
      chooseDrawnDistrictCard(gameRoom, {
        playerId: "player-3",
        districtCardId: drawResult.drawnCards[0].id
      })
    ).toEqual({
      ok: false,
      error: "当前没有你的抽牌选择。"
    });
  });

  it("prevents building another district with the same name", () => {
    const gameRoom = createStartedGame();
    selectRolesById(gameRoom, ["assassin", "thief", "magician", "king"]);
    const player = gameRoom.players[0];
    const duplicate = { ...player.hand[0], id: "duplicate-copy" };
    player.city = [player.hand[0]];
    player.hand = [duplicate];
    player.gold = duplicate.cost;

    const buildResult = buildDistrict(gameRoom, {
      playerId: player.id,
      districtCardId: duplicate.id
    });

    expect(buildResult).toEqual({
      ok: false,
      error: "不能重复建造同名建筑。"
    });
  });

  it("only exposes the requesting player's hand in visible state", () => {
    const gameRoom = createStartedGame();
    const visible = visibleStateForPlayer(gameRoom, "player-1");
    const self = visible.players.find((player) => player.id === "player-1");
    const other = visible.players.find((player) => player.id === "player-2");

    expect(self?.hand).toHaveLength(4);
    expect(self?.handCount).toBe(4);
    expect(other?.hand).toBeUndefined();
    expect(other?.handCount).toBe(4);
    expect(visible.districtDeckCount).toBe(gameRoom.districtDeck.length);
  });

  it("keeps only recent game logs so repeated state broadcasts stay bounded", () => {
    const gameRoom = createStartedGame();

    for (let index = 1; index <= 120; index += 1) {
      addLog(gameRoom, "test_log", `Log ${index}`);
    }

    const visible = visibleStateForPlayer(gameRoom, "player-1");

    expect(gameRoom.gameLog).toHaveLength(80);
    expect(visible.gameLog).toHaveLength(80);
    expect(visible.gameLog[0].message).toBe("Log 120");
    expect(visible.gameLog.at(-1)?.message).toBe("Log 41");
  });

  it("hides other players' unrevealed roles during selection and action", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];

    selectRole(gameRoom, {
      playerId: "player-1",
      roleId: roles[0].id
    });

    const selectionVisibleToBob = visibleStateForPlayer(gameRoom, "player-2");
    const aliceDuringSelection = selectionVisibleToBob.players.find(
      (player) => player.id === "player-1"
    );
    expect(aliceDuringSelection?.selectedRoleId).toBeNull();

    selectRole(gameRoom, {
      playerId: "player-2",
      roleId: roles[1].id
    });
    selectRole(gameRoom, {
      playerId: "player-3",
      roleId: roles[2].id
    });
    selectRole(gameRoom, {
      playerId: "player-4",
      roleId: roles[3].id
    });

    const actionVisibleToBob = visibleStateForPlayer(gameRoom, "player-2");
    const aliceCurrentTurn = actionVisibleToBob.players.find(
      (player) => player.id === "player-1"
    );
    const ciciNotYetRevealed = actionVisibleToBob.players.find(
      (player) => player.id === "player-3"
    );

    expect(aliceCurrentTurn?.selectedRoleId).toBe(roles[0].id);
    expect(ciciNotYetRevealed?.selectedRoleId).toBeNull();
    expect("districtDeck" in actionVisibleToBob).toBe(false);
  });

  it("only exposes available roles to the player currently choosing a role", () => {
    const gameRoom = createStartedGame();
    const initialAvailableRoleIds = gameRoom.availableRoles.map((role) => role.id);

    selectRole(gameRoom, {
      playerId: "player-1",
      roleId: initialAvailableRoleIds[0]
    });

    const visibleToCurrentChooser = visibleStateForPlayer(gameRoom, "player-2");
    const visibleToWaitingPlayer = visibleStateForPlayer(gameRoom, "player-3");

    expect(visibleToCurrentChooser.availableRoles.map((role) => role.id)).toEqual(
      initialAvailableRoleIds.slice(1)
    );
    expect(visibleToWaitingPlayer.availableRoles).toEqual([]);
    expect(visibleToWaitingPlayer.players.find((player) => player.id === "player-1")?.selectedRoleId).toBeNull();
    expect("districtDeck" in visibleToWaitingPlayer).toBe(false);
  });

  it("auto-plays bot turns until a human must act", () => {
    const gameRoom = createStartedGame();
    gameRoom.players[1].isBot = true;
    gameRoom.players[2].isBot = true;
    gameRoom.players[3].isBot = true;

    const firstProgress = runBotTurns(gameRoom);

    expect(firstProgress.ok).toBe(true);
    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-1");

    selectRole(gameRoom, {
      playerId: "player-1",
      roleId: gameRoom.availableRoles[0].id
    });
    const secondProgress = runBotTurns(gameRoom);

    expect(secondProgress.ok).toBe(true);
    expect(gameRoom.phase).toBe("ROLE_ACTION");
    expect(gameRoom.currentTurnPlayerId).toBe("player-1");
  });

  it("lets the host skip the current offline player without removing them", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    selectRolesById(gameRoom, [roles[0].id, roles[1].id, roles[2].id, roles[3].id]);

    const currentPlayer = gameRoom.players[0];
    currentPlayer.connected = false;

    const skipResult = skipOfflineCurrentPlayer(gameRoom, "player-1");

    expect(skipResult.ok).toBe(true);
    expect(gameRoom.players).toHaveLength(4);
    expect(currentPlayer.connected).toBe(false);
    expect(gameRoom.currentTurnPlayerId).toBe("player-2");
    expect(gameRoom.completedRoleIds).toContain(currentPlayer.selectedRoleId);
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("end_turn");
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("skip_offline_player");
  });

  it("auto-selects a role for the current offline chooser so role selection cannot block", () => {
    const gameRoom = createStartedGame();
    gameRoom.players[0].connected = false;
    const firstAvailableRole = gameRoom.availableRoles[0];

    const advanceResult = advanceOfflinePlayers(gameRoom);

    expect(advanceResult.ok).toBe(true);
    expect(gameRoom.players[0].selectedRoleId).toBe(firstAvailableRole.id);
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-2");
    expect(gameRoom.availableRoles.map((role) => role.id)).not.toContain(firstAvailableRole.id);
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("offline_role_auto_selected");
  });

  it("continues automatic progression when a new round starts with an offline role chooser", () => {
    const gameRoom = createStartedGame();
    gameRoom.players[0].connected = false;
    selectRolesById(gameRoom, ["assassin", "thief", "magician", "king"]);

    for (const player of gameRoom.players) {
      const endResult = endTurn(gameRoom, { playerId: player.id });
      expect(endResult.ok).toBe(true);
    }

    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-1");

    const progressResult = runBotTurns(gameRoom);

    expect(progressResult.ok).toBe(true);
    expect(gameRoom.players[0].selectedRoleId).not.toBeNull();
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-2");
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("offline_role_auto_selected");
  });

  it("lets the assassin skip a selected target role later this round", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    selectRolesById(gameRoom, [roles[0].id, roles[1].id, roles[2].id, roles[3].id]);

    const skillResult = useRoleSkill(gameRoom, {
      playerId: "player-1",
      targetRoleId: roles[1].id
    });
    expect(skillResult.ok).toBe(true);

    const endResult = endTurn(gameRoom, { playerId: "player-1" });
    expect(endResult.ok).toBe(true);
    expect(gameRoom.currentTurnPlayerId).toBe("player-3");
    expect(gameRoom.completedRoleIds).toContain(roles[1].id);
  });

  it("lets the thief mark a role and steal its gold before that role acts", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    selectRolesById(gameRoom, [roles[1].id, roles[2].id, roles[3].id, roles[4].id]);

    const thief = gameRoom.players[0];
    const target = gameRoom.players[1];
    target.gold = 5;
    thief.gold = 1;

    const skillResult = useRoleSkill(gameRoom, {
      playerId: thief.id,
      targetRoleId: roles[2].id
    });
    expect(skillResult.ok).toBe(true);

    const endResult = endTurn(gameRoom, { playerId: thief.id });
    expect(endResult.ok).toBe(true);
    expect(gameRoom.currentTurnPlayerId).toBe(target.id);
    expect(target.gold).toBe(0);
    expect(thief.gold).toBe(6);
  });

  it("lets the magician discard selected hand cards and draw the same amount", () => {
    const gameRoom = createStartedGame();
    const magician = gameRoom.players[0];
    const [discardA, discardB, keepCard] = magician.hand;
    const [drawA, drawB] = gameRoom.districtDeck;
    magician.hand = [discardA, discardB, keepCard];
    gameRoom.districtDeck = [drawA, drawB, ...gameRoom.districtDeck.slice(2)];
    forceRoleActionTurn(gameRoom, magician.id, "magician");

    const skillResult = useRoleSkill(gameRoom, {
      playerId: magician.id,
      discardCardIds: [discardA.id, discardB.id]
    });

    expect(skillResult.ok).toBe(true);
    expect(magician.hand.map((card) => card.id)).toEqual([keepCard.id, drawA.id, drawB.id]);
    expect(gameRoom.districtDiscardPile.map((card) => card.id)).toEqual([
      discardA.id,
      discardB.id
    ]);
  });

  it("lets the magician exchange their hand with another player", () => {
    const gameRoom = createStartedGame();
    const magician = gameRoom.players[0];
    const target = gameRoom.players[1];
    magician.hand = magician.hand.slice(0, 2);
    target.hand = target.hand.slice(0, 3);
    const magicianHandIds = magician.hand.map((card) => card.id);
    const targetHandIds = target.hand.map((card) => card.id);
    forceRoleActionTurn(gameRoom, magician.id, "magician");

    const skillResult = useRoleSkill(gameRoom, {
      playerId: magician.id,
      targetPlayerId: target.id
    });

    expect(skillResult.ok).toBe(true);
    expect(magician.hand.map((card) => card.id)).toEqual(targetHandIds);
    expect(target.hand.map((card) => card.id)).toEqual(magicianHandIds);
  });

  it("rejects magician discards that are not in the player's hand", () => {
    const gameRoom = createStartedGame();
    forceRoleActionTurn(gameRoom, "player-1", "magician");

    const skillResult = useRoleSkill(gameRoom, {
      playerId: "player-1",
      discardCardIds: ["missing-card"]
    });

    expect(skillResult).toEqual({
      ok: false,
      error: "手牌中没有要弃置的建筑。"
    });
    expect(gameRoom.roleEffects.usedSkillPlayerIds).not.toContain("player-1");
  });

  it("lets the merchant gain one gold plus one for each green district in their city", () => {
    const gameRoom = createStartedGame();
    const merchant = gameRoom.players[0];
    const [greenA, greenB, greenC, blueDistrict] = merchant.hand;
    merchant.gold = 2;
    merchant.city = [
      { ...greenA, id: "green-a", color: "green" },
      { ...greenB, id: "green-b", color: "green" },
      { ...greenC, id: "green-c", color: "green" },
      { ...blueDistrict, id: "blue-a", color: "blue" }
    ];
    forceRoleActionTurn(gameRoom, merchant.id, "merchant");

    const skillResult = useRoleSkill(gameRoom, { playerId: merchant.id });

    expect(skillResult.ok).toBe(true);
    expect(merchant.gold).toBe(6);
  });

  it("lets standard color roles gain income for their district color", () => {
    const cases = [
      { roleId: "king", color: "yellow" as const },
      { roleId: "bishop", color: "blue" as const },
      { roleId: "warlord", color: "red" as const }
    ];

    for (const testCase of cases) {
      const gameRoom = createStartedGame();
      const player = gameRoom.players[0];
      const [districtA, districtB, otherDistrict] = player.hand;
      player.gold = 1;
      player.city = [
        { ...districtA, id: `${testCase.roleId}-a`, color: testCase.color },
        { ...districtB, id: `${testCase.roleId}-b`, color: testCase.color },
        { ...otherDistrict, id: `${testCase.roleId}-other`, color: "purple" }
      ];
      forceRoleActionTurn(gameRoom, player.id, testCase.roleId);

      const skillResult = useRoleSkill(gameRoom, { playerId: player.id });

      expect(skillResult.ok).toBe(true);
      expect(player.gold).toBe(3);
    }
  });

  it("charges the warlord one less than the target district cost", () => {
    const gameRoom = createStartedGame();
    const warlord = gameRoom.players[0];
    const target = gameRoom.players[1];
    const district = { ...target.hand[0], cost: 4 };
    target.city = [district];
    target.hand = [];
    warlord.gold = 3;
    forceRoleActionTurn(gameRoom, warlord.id, "warlord");

    const destroyResult = useRoleSkill(gameRoom, {
      playerId: warlord.id,
      targetPlayerId: target.id,
      targetDistrictCardId: district.id
    });

    expect(destroyResult.ok).toBe(true);
    expect(warlord.gold).toBe(0);
    expect(target.city).toHaveLength(0);
    expect(gameRoom.districtDiscardPile).toContain(district);
  });

  it("rejects warlord destruction when gold is below the calculated destroy cost", () => {
    const gameRoom = createStartedGame();
    const warlord = gameRoom.players[0];
    const target = gameRoom.players[1];
    const district = { ...target.hand[0], cost: 5 };
    target.city = [district];
    target.hand = [];
    warlord.gold = 3;
    forceRoleActionTurn(gameRoom, warlord.id, "warlord");

    const destroyResult = useRoleSkill(gameRoom, {
      playerId: warlord.id,
      targetPlayerId: target.id,
      targetDistrictCardId: district.id
    });

    expect(destroyResult).toEqual({
      ok: false,
      error: "金币不足，无法破坏建筑。"
    });
    expect(warlord.gold).toBe(3);
    expect(target.city).toEqual([district]);
    expect(gameRoom.roleEffects.usedSkillPlayerIds).not.toContain(warlord.id);
  });

  it("prevents the thief from targeting the assassin or an assassinated role", () => {
    const gameRoom = createStartedGame();
    forceRoleActionTurn(gameRoom, "player-1", "thief");

    const assassinResult = useRoleSkill(gameRoom, {
      playerId: "player-1",
      targetRoleId: "assassin"
    });
    expect(assassinResult).toEqual({
      ok: false,
      error: "盗贼不能偷取刺客。"
    });

    gameRoom.roleEffects.skippedRoleIds.push("merchant");
    const skippedRoleResult = useRoleSkill(gameRoom, {
      playerId: "player-1",
      targetRoleId: "merchant"
    });
    expect(skippedRoleResult).toEqual({
      ok: false,
      error: "不能偷取本轮被刺客跳过的角色。"
    });
    expect(gameRoom.roleEffects.usedSkillPlayerIds).not.toContain("player-1");
  });

  it("applies immediate role skills once per turn", () => {
    const cases = [
      { roleId: "king", assert: (room: GameRoom) => expect(room.crownPlayerId).toBe("player-1") },
      { roleId: "bishop", assert: (room: GameRoom) => expect(room.roleEffects.protectedPlayerIds).toContain("player-1") },
      {
        roleId: "architect",
        assert: (room: GameRoom) => {
          expect(room.turnState?.maxBuilds).toBe(2);
          expect(room.players[0].hand).toHaveLength(6);
        }
      }
    ];

    for (const testCase of cases) {
      const gameRoom = createStartedGame();
      forceRoleActionTurn(gameRoom, "player-1", testCase.roleId);

      const skillResult = useRoleSkill(gameRoom, { playerId: "player-1" });
      expect(skillResult.ok).toBe(true);
      testCase.assert(gameRoom);

      const secondUse = useRoleSkill(gameRoom, { playerId: "player-1" });
      expect(secondUse).toEqual({
        ok: false,
        error: "本回合已经使用过角色技能。"
      });
    }
  });

  it("lets the warlord destroy an unprotected enemy district but not a protected one", () => {
    const gameRoom = createStartedGame();
    const warlord = gameRoom.players[0];
    const target = gameRoom.players[1];
    const district = { ...target.hand[0], cost: 2 };
    target.city = [district];
    target.hand = [];
    warlord.gold = 2;
    forceRoleActionTurn(gameRoom, warlord.id, "warlord");

    const destroyResult = useRoleSkill(gameRoom, {
      playerId: warlord.id,
      targetPlayerId: target.id,
      targetDistrictCardId: district.id
    });
    expect(destroyResult.ok).toBe(true);
    expect(target.city).toHaveLength(0);
    expect(gameRoom.districtDiscardPile).toContain(district);
    expect(warlord.gold).toBe(1);

    const protectedRoom = createStartedGame();
    const protectedTarget = protectedRoom.players[1];
    const protectedDistrict = protectedTarget.hand[0];
    protectedTarget.city = [protectedDistrict];
    protectedTarget.hand = [];
    protectedRoom.roleEffects.protectedPlayerIds.push(protectedTarget.id);
    protectedRoom.players[0].gold = 2;
    forceRoleActionTurn(protectedRoom, "player-1", "warlord");

    const protectedResult = useRoleSkill(protectedRoom, {
      playerId: "player-1",
      targetPlayerId: protectedTarget.id,
      targetDistrictCardId: protectedDistrict.id
    });
    expect(protectedResult).toEqual({
      ok: false,
      error: "目标玩家的城市受到保护。"
    });
  });

  it("prevents the warlord from destroying districts in a completed city", () => {
    const gameRoom = createStartedGame();
    gameRoom.settings.endCitySize = 4;
    const warlord = gameRoom.players[0];
    const target = gameRoom.players[1];
    target.city = target.hand.slice(0, 4);
    target.hand = [];
    warlord.gold = 10;
    forceRoleActionTurn(gameRoom, warlord.id, "warlord");

    const destroyResult = useRoleSkill(gameRoom, {
      playerId: warlord.id,
      targetPlayerId: target.id,
      targetDistrictCardId: target.city[0].id
    });

    expect(destroyResult).toEqual({
      ok: false,
      error: "不能破坏已经完成城市的玩家建筑。"
    });
  });
});

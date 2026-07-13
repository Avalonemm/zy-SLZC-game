import { describe, expect, it } from "vitest";
import type { GameRoom, LobbyPlayer, RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { resolveDeferredQueenIncome, resolveQueenIncome } from "./queenRule";

function createEightPlayerGame() {
  const players: LobbyPlayer[] = Array.from({ length: 8 }, (_, index) => ({
    id: `player-${index + 1}`,
    uid: 100001 + index,
    socketId: `socket-${index + 1}`,
    name: `玩家${index + 1}`,
    connected: true,
    isHost: index === 0,
    isReady: true,
    isBot: index > 0
  }));
  const room: RoomState = {
    roomCode: "QUEEN1",
    hostPlayerId: players[0].id,
    status: "LOBBY",
    players,
    minPlayers: 4,
    maxPlayers: 8,
    futureMaxPlayers: 8,
    settings: {
      startCountdownSeconds: 10,
      turnTimeoutSeconds: 60,
      endCitySize: 8,
      enabledRoleIds: [
        "assassin", "thief", "magician", "king", "bishop",
        "merchant", "architect", "warlord"
      ],
      enableFaceUpRoleDiscard: true,
      enableFaceDownRoleDiscard: true,
      drawMode: "draw2Choose1",
      roleRulePreset: "classicStandard"
    },
    startCountdown: null,
    createdAt: new Date().toISOString(),
    chatMessages: []
  };
  return initializeGameRoom(room);
}

function assignRoles(gameRoom: GameRoom, queenIndex: number, kingIndex: number) {
  for (const player of gameRoom.players) {
    player.selectedRoleId = "bishop";
  }
  gameRoom.players[queenIndex].selectedRoleId = "queen";
  gameRoom.players[kingIndex].selectedRoleId = "king";
}

describe("queen rule", () => {
  it("adds the queen to the eight-player role pool and keeps one role face down", () => {
    const gameRoom = createEightPlayerGame();

    expect(gameRoom.availableRoles).toHaveLength(8);
    expect(gameRoom.availableRoles.every((role) => role.order >= 1 && role.order <= 9)).toBe(true);
  });

  it("pays an adjacent queen, including wrap-around seats, only once", () => {
    const gameRoom = createEightPlayerGame();
    assignRoles(gameRoom, 0, 7);
    const queen = gameRoom.players[0];
    const initialGold = queen.gold;

    expect(resolveQueenIncome(gameRoom, queen, { atRoundEnd: false })).toBe(true);
    expect(queen.gold).toBe(initialGold + 3);
    expect(gameRoom.gameLog[0].presentation).toMatchObject({
      kind: "queen_income",
      actorPlayerId: queen.id,
      targetPlayerId: gameRoom.players[7].id,
      roleId: "queen",
      amount: 3
    });
    expect(resolveQueenIncome(gameRoom, queen, { atRoundEnd: false })).toBe(false);
    expect(queen.gold).toBe(initialGold + 3);
  });

  it("defers payment until round end when the adjacent king was assassinated", () => {
    const gameRoom = createEightPlayerGame();
    assignRoles(gameRoom, 3, 4);
    const queen = gameRoom.players[3];
    const initialGold = queen.gold;
    gameRoom.roleEffects.skippedRoleIds.push("king");

    expect(resolveQueenIncome(gameRoom, queen, { atRoundEnd: false })).toBe(false);
    expect(resolveDeferredQueenIncome(gameRoom)).toBe(true);
    expect(queen.gold).toBe(initialGold + 3);
  });

  it("does not pay a non-adjacent or assassinated queen", () => {
    const gameRoom = createEightPlayerGame();
    assignRoles(gameRoom, 0, 3);
    const queen = gameRoom.players[0];

    expect(resolveQueenIncome(gameRoom, queen, { atRoundEnd: false })).toBe(false);
    gameRoom.roleEffects.skippedRoleIds.push("queen");
    gameRoom.players[3].selectedRoleId = "bishop";
    gameRoom.players[1].selectedRoleId = "king";
    expect(resolveQueenIncome(gameRoom, queen, { atRoundEnd: false })).toBe(false);
  });
});

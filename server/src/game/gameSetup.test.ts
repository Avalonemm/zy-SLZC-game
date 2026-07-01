import { describe, expect, it } from "vitest";
import type { RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { loadDistrictCards, loadRoleCards } from "./cardData";

function createLobbyRoom(): RoomState {
  return {
    roomCode: "ABCD12",
    hostPlayerId: "player-a",
    status: "STARTED",
    maxPlayers: 4,
    createdAt: "2026-06-28T00:00:00.000Z",
    players: [
      {
        id: "player-a",
        uid: 100001,
        socketId: "socket-a",
        name: "Alice",
        connected: true,
        isHost: true,
        isReady: true,
        isBot: false
      },
      {
        id: "player-b",
        uid: 100002,
        socketId: "socket-b",
        name: "Bob",
        connected: true,
        isHost: false,
        isReady: true,
        isBot: false
      },
      {
        id: "player-c",
        uid: 100003,
        socketId: "socket-c",
        name: "Cici",
        connected: true,
        isHost: false,
        isReady: true,
        isBot: false
      },
      {
        id: "player-d",
        uid: 100004,
        socketId: "socket-d",
        name: "Dan",
        connected: true,
        isHost: false,
        isReady: true,
        isBot: false
      }
    ]
  };
}

describe("game setup", () => {
  it("loads configured role and district cards", () => {
    const roles = loadRoleCards();
    const districts = loadDistrictCards();

    expect(roles).toHaveLength(8);
    expect(roles.map((role) => role.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roles[0]).toMatchObject({
      id: "assassin",
      name: "刺客",
      effectType: "skip_role"
    });

    expect(districts.length).toBeGreaterThanOrEqual(24);
    expect(districts[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        cost: expect.any(Number),
        color: expect.any(String),
        score: expect.any(Number)
      })
    );
  });

  it("initializes a complete game room from a four-player lobby", () => {
    const gameRoom = initializeGameRoom(createLobbyRoom());

    expect(gameRoom.roomId).toBe("ABCD12");
    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.currentRound).toBe(1);
    expect(gameRoom.crownPlayerId).toBe("player-a");
    expect(gameRoom.currentRoleOrder).toEqual([]);
    expect(gameRoom.availableRoles).toHaveLength(8);
    expect(gameRoom.discardedRoles).toEqual([]);
    expect(gameRoom.districtDiscardPile).toEqual([]);
    expect(gameRoom.gameLog[0]).toMatchObject({
      type: "game_started",
      message: "游戏开始，进入角色选择阶段。"
    });

    expect(gameRoom.players).toHaveLength(4);
    for (const player of gameRoom.players) {
      expect(player.gold).toBe(2);
      expect(player.hand).toHaveLength(4);
      expect(player.city).toEqual([]);
      expect(player.selectedRoleId).toBeNull();
      expect(player.score).toBe(0);
    }

    expect(gameRoom.districtDeck).toHaveLength(loadDistrictCards().length - 16);
  });
});

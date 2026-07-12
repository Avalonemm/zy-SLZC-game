import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomSettings, RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { loadDistrictCards, loadRoleCards } from "./cardData";

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
    enableFaceUpRoleDiscard: true,
    enableFaceDownRoleDiscard: true,
    drawMode: "draw2Choose1",
    roleRulePreset: "standard4Player",
    ...overrides
  };
}

function createLobbyRoom(): RoomState {
  return {
    roomCode: "ABCD12",
    hostPlayerId: "player-a",
    status: "STARTED",
    minPlayers: 2,
    maxPlayers: 4,
    futureMaxPlayers: 8,
    settings: createDefaultSettings(),
    startCountdown: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    chatMessages: [],
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    expect(districts.length).toBeGreaterThanOrEqual(65);
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

  it("starts a complete game room in crown reveal before role selection", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const gameRoom = initializeGameRoom(createLobbyRoom());

    expect(gameRoom.roomId).toBe("ABCD12");
    expect(gameRoom.phase).toBe("CROWN_REVEAL");
    expect(gameRoom.currentRound).toBe(1);
    expect(gameRoom.crownPlayerId).toBe("player-c");
    expect(gameRoom.currentRoleOrder).toEqual([]);
    expect(gameRoom.roleSelectionTurnPlayerId).toBeNull();
    expect(gameRoom.roleSelectionOrder[0]).toBe("player-c");
    expect(gameRoom.turnTimer).toMatchObject({
      phase: "CROWN_REVEAL",
      playerId: "player-c",
      timeoutMs: 5_000
    });
    expect(gameRoom.availableRoles).toHaveLength(5);
    expect(gameRoom.discardedRoles).toHaveLength(2);
    expect(gameRoom.districtDiscardPile).toEqual([]);
    expect(gameRoom.gameLog[0]).toMatchObject({
      type: "game_started",
      message: "游戏开始，正在随机皇冠。"
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

  it("uses only a face-down discard for six-player rooms", () => {
    const lobbyRoom = createLobbyRoom();
    lobbyRoom.maxPlayers = 6;
    lobbyRoom.players.push(
      {
        id: "player-e",
        uid: 100005,
        socketId: "socket-e",
        name: "Eve",
        connected: true,
        isHost: false,
        isReady: true,
        isBot: false
      },
      {
        id: "player-f",
        uid: 100006,
        socketId: "socket-f",
        name: "Finn",
        connected: true,
        isHost: false,
        isReady: true,
        isBot: false
      }
    );

    const gameRoom = initializeGameRoom(lobbyRoom);

    expect(gameRoom.players).toHaveLength(6);
    expect(gameRoom.availableRoles).toHaveLength(7);
    expect(gameRoom.discardedRoles).toEqual([]);
  });
  it("initializes available roles from enabled roles when discards are disabled", () => {
    const lobbyRoom = createLobbyRoom();
    lobbyRoom.settings = createDefaultSettings({
      enabledRoleIds: ["assassin", "thief", "magician", "king"],
      enableFaceUpRoleDiscard: false,
      enableFaceDownRoleDiscard: false
    });

    const gameRoom = initializeGameRoom(lobbyRoom);

    expect(gameRoom.availableRoles.map((role) => role.id)).toEqual([
      "assassin",
      "thief",
      "magician",
      "king"
    ]);
    expect(gameRoom.discardedRoles).toEqual([]);
  });

  it("rejects role settings that leave too few selectable roles", () => {
    const lobbyRoom = createLobbyRoom();
    lobbyRoom.settings = createDefaultSettings({
      enabledRoleIds: ["assassin", "thief", "magician"],
      enableFaceUpRoleDiscard: true,
      enableFaceDownRoleDiscard: true
    });

    expect(() => initializeGameRoom(lobbyRoom)).toThrow(
      "启用角色和弃牌设置不足以支持当前玩家人数。"
    );
  });
});

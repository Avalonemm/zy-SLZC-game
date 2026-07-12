import { describe, expect, it } from "vitest";
import type { RoomSettings, RoomState } from "@zy/shared";
import { inspectDistrictCardIntegrity } from "./cardIntegrity";
import { initializeGameRoom } from "./gameSetup";

function createRoom(): RoomState {
  const settings: RoomSettings = {
    startCountdownSeconds: 10,
    turnTimeoutSeconds: 15,
    endCitySize: 8,
    enabledRoleIds: ["assassin", "thief", "magician", "king", "bishop", "merchant", "architect", "warlord"],
    enableFaceUpRoleDiscard: false,
    enableFaceDownRoleDiscard: false,
    drawMode: "draw2Choose1",
    roleRulePreset: "classicStandard"
  };
  return {
    roomCode: "CARDQA",
    hostPlayerId: "player-1",
    status: "STARTED",
    minPlayers: 4,
    maxPlayers: 4,
    futureMaxPlayers: 8,
    settings,
    startCountdown: null,
    createdAt: new Date(0).toISOString(),
    chatMessages: [],
    players: [1, 2, 3, 4].map((index) => ({
      id: `player-${index}`,
      uid: 100000 + index,
      socketId: `socket-${index}`,
      name: `玩家${index}`,
      connected: true,
      isHost: index === 1,
      isReady: true,
      isBot: false
    }))
  };
}

describe("district card integrity", () => {
  it("accounts for all 65 unique district cards in a new game", () => {
    const gameRoom = initializeGameRoom(createRoom());
    const result = inspectDistrictCardIntegrity(gameRoom);
    expect(result.ok).toBe(true);
    expect(result.expectedCount).toBe(65);
    expect(result.actualCount).toBe(65);
  });

  it("detects missing and duplicated card ids", () => {
    const gameRoom = initializeGameRoom(createRoom());
    const missing = gameRoom.districtDeck.pop();
    expect(missing).toBeDefined();
    gameRoom.players[0].hand.push(gameRoom.players[0].hand[0]);
    const result = inspectDistrictCardIntegrity(gameRoom);
    expect(result.ok).toBe(false);
    expect(result.duplicateIds).toContain(gameRoom.players[0].hand[0].id);
    expect(result.missingIds).toContain(missing?.id);
  });
});

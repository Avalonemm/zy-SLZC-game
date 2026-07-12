import { describe, expect, it } from "vitest";
import type { DistrictCard, RoomSettings, RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { buildDistrict, endTurn, selectRole } from "./gameEngine";
import { resolveExpiredTurn } from "./timers";

function createSettings(): RoomSettings {
  return {
    startCountdownSeconds: 10,
    turnTimeoutSeconds: 15,
    endCitySize: 1,
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
    roleRulePreset: "standard4Player"
  };
}

function createLobby(playerCount: number): RoomState {
  return {
    roomCode: `FLOW${playerCount}`,
    hostPlayerId: "player-1",
    status: "STARTED",
    minPlayers: 2,
    maxPlayers: playerCount,
    futureMaxPlayers: 8,
    settings: createSettings(),
    startCountdown: null,
    createdAt: "2026-07-09T00:00:00.000Z",
    chatMessages: [],
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `player-${index + 1}`,
      uid: 100001 + index,
      socketId: `socket-${index + 1}`,
      name: index === 0 ? "Alice" : `人机 ${index}`,
      connected: true,
      isHost: index === 0,
      isReady: true,
      isBot: index > 0
    }))
  };
}

function makeDistrict(id: string): DistrictCard {
  return {
    id,
    name: `Flow ${id}`,
    cost: 0,
    color: "blue",
    score: 1,
    description: "",
    effectType: "none",
    effectParams: {}
  };
}

describe("4-8 player full game flow", () => {
  it.each([4, 5, 6, 7, 8])("starts, plays, and scores a %i-player game", (playerCount) => {
    const gameRoom = initializeGameRoom(createLobby(playerCount));

    if (gameRoom.phase === "CROWN_REVEAL") {
      const crownResult = resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);
      expect(crownResult.ok).toBe(true);
    }

    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    while (gameRoom.phase === "ROLE_SELECTION" && gameRoom.roleSelectionTurnPlayerId) {
      const role = gameRoom.availableRoles[0];
      expect(role).toBeDefined();
      const selected = selectRole(gameRoom, {
        playerId: gameRoom.roleSelectionTurnPlayerId,
        roleId: role.id
      });
      expect(selected.ok).toBe(true);
    }

    for (const player of gameRoom.players) {
      player.hand.unshift(makeDistrict(`district-${player.id}`));
    }

    let guard = 0;
    while (gameRoom.phase !== "ENDED" && guard < 40) {
      guard += 1;
      expect(gameRoom.phase).toBe("ROLE_ACTION");
      const currentPlayer = gameRoom.players.find((player) => player.id === gameRoom.currentTurnPlayerId);
      expect(currentPlayer).toBeDefined();
      if (!currentPlayer) {
        throw new Error("missing current player");
      }

      if (currentPlayer.city.length === 0) {
        const built = buildDistrict(gameRoom, {
          playerId: currentPlayer.id,
          districtCardId: currentPlayer.hand[0].id
        });
        expect(built.ok).toBe(true);
      }

      const ended = endTurn(gameRoom, { playerId: currentPlayer.id });
      expect(ended.ok).toBe(true);
    }

    expect(gameRoom.phase).toBe("ENDED");
    expect(gameRoom.scoringResults).toHaveLength(playerCount);
    expect(gameRoom.scoringResults[0].totalScore).toBeGreaterThan(0);
  });
});
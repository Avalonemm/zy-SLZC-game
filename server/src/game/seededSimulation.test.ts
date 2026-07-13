import { describe, expect, it } from "vitest";
import type { RoomSettings, RoomState } from "@zy/shared";
import { inspectDistrictCardIntegrity } from "./cardIntegrity";
import { runNextBotTurn } from "./botPlayer";
import { initializeGameRoom } from "./gameSetup";
import { resolveExpiredTurn } from "./timers";

const STANDARD_ROLES = [
  "assassin", "thief", "magician", "king", "bishop", "merchant", "architect", "warlord"
];

describe("seeded full-game simulation", () => {
  it("finishes 125 deterministic 4-8 player games without corrupting cards or pending state", () => {
    for (let playerCount = 4; playerCount <= 8; playerCount += 1) {
      for (let seed = 1; seed <= 25; seed += 1) {
        runSeededGame(playerCount, seed);
      }
    }
  }, 30_000);
});

function runSeededGame(playerCount: number, seed: number) {
  const originalRandom = Math.random;
  Math.random = seededRandom(playerCount * 10_000 + seed);
  try {
    const gameRoom = initializeGameRoom(createBotRoom(playerCount, seed));
    let steps = 0;
    while (gameRoom.phase !== "ENDED" && steps < 1_500) {
      steps += 1;
      if (gameRoom.phase === "CROWN_REVEAL" || gameRoom.phase === "ROLE_CALL") {
        const timeoutResult = resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);
        expect(timeoutResult.ok).toBe(true);
      } else {
        const result = runNextBotTurn(gameRoom);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.advanced).toBe(true);
      }

      const integrity = inspectDistrictCardIntegrity(gameRoom);
      expect(integrity.ok, JSON.stringify({ playerCount, seed, steps, integrity })).toBe(true);
      if (gameRoom.pendingDrawChoice) {
        expect(gameRoom.pendingDrawChoice.playerId).toBe(gameRoom.currentTurnPlayerId);
      }
    }

    expect(gameRoom.phase, `simulation did not finish: players=${playerCount}, seed=${seed}`).toBe("ENDED");
    expect(gameRoom.scoringResults).toHaveLength(playerCount);
  } finally {
    Math.random = originalRandom;
  }
}

function createBotRoom(playerCount: number, seed: number): RoomState {
  const settings: RoomSettings = {
    startCountdownSeconds: 10,
    turnTimeoutSeconds: 15,
    endCitySize: 4,
    enabledRoleIds: [...STANDARD_ROLES],
    enableFaceUpRoleDiscard: true,
    enableFaceDownRoleDiscard: true,
    drawMode: "draw2Choose1",
    roleRulePreset: "classicStandard"
  };
  return {
    roomCode: `S${playerCount}${seed}`,
    hostPlayerId: "bot-1",
    status: "STARTED",
    minPlayers: 4,
    maxPlayers: playerCount,
    futureMaxPlayers: 8,
    settings,
    startCountdown: null,
    createdAt: new Date(0).toISOString(),
    chatMessages: [],
    players: Array.from({ length: playerCount }, (_, index) => ({
      id: `bot-${index + 1}`,
      uid: 200000 + index,
      socketId: `bot-socket-${index + 1}`,
      name: `人机 ${index + 1}`,
      connected: true,
      isHost: index === 0,
      isReady: true,
      isBot: true
    }))
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

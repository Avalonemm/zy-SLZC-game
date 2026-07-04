import { describe, expect, it } from "vitest";
import type { GameRoom } from "@zy/shared";
import { createActionEventFromLog } from "./actionEvents";

function createGameRoomWithLog(): GameRoom {
  return {
    roomId: "ROOM44",
    players: [],
    hostPlayerId: "player-1",
    status: "STARTED",
    settings: {
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
      roleRulePreset: "standard4Player"
    },
    phase: "ROLE_ACTION",
    currentRound: 3,
    crownPlayerId: "player-1",
    roleSelectionOrder: [],
    roleSelectionTurnPlayerId: null,
    currentTurnPlayerId: "player-1",
    currentRoleOrder: [],
    completedRoleIds: [],
    turnState: null,
    turnTimer: null,
    pendingDrawChoice: null,
    roleEffects: {
      skippedRoleIds: [],
      protectedPlayerIds: [],
      stealTargets: {},
      usedSkillPlayerIds: []
    },
    availableRoles: [],
    discardedRoles: [],
    districtDeck: [],
    districtDiscardPile: [],
    gameLog: [
      {
        id: "log-1",
        type: "take_gold",
        message: "Alice 拿了 2 枚金币。",
        createdAt: "2026-07-03T00:00:00.000Z"
      }
    ],
    scoringResults: []
  };
}

describe("action events", () => {
  it("creates a public action event from a game log entry without exposing hidden state", () => {
    const gameRoom = createGameRoomWithLog();
    const event = createActionEventFromLog(gameRoom, gameRoom.gameLog[0], {
      actorPlayerId: "player-1"
    });

    expect(event).toMatchObject({
      roomCode: "ROOM44",
      type: "take_gold",
      message: "Alice 拿了 2 枚金币。",
      actorPlayerId: "player-1",
      visibility: "public",
      phase: "ROLE_ACTION",
      round: 3
    });
    expect(event.id).toContain("log-1");
    expect("districtDeck" in event).toBe(false);
  });
});

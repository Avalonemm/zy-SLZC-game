import { describe, expect, it } from "vitest";
import type { GameRoom } from "@zy/shared";
import { createActionEventFromLog, createActionEventsFromLogs } from "./actionEvents";

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
      roleRulePreset: "classicStandard"
    },
    phase: "ROLE_ACTION",
    currentRound: 3,
    crownPlayerId: "player-1",
    roleSelectionOrder: [],
    roleSelectionTurnPlayerId: null,
    currentTurnPlayerId: "player-1",
    currentRoleOrder: [],
    completedRoleIds: [],
    firstCompletedCityPlayerId: null,
    turnState: null,
    turnTimer: null,
    pendingDrawChoice: null,
    pendingGraveyardChoice: null,
    roleEffects: {
      skippedRoleIds: [],
      protectedPlayerIds: [],
      stealTargets: {},
      usedSkillPlayerIds: [],
      queenIncomePlayerIds: []
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

  it("keeps structured presentation data and preserves the requested event order", () => {
    const gameRoom = createGameRoomWithLog();
    const logs = [
      {
        id: "log-skill",
        type: "skill_swap_hands",
        message: "Alice 与 Bob 交换了全部手牌。",
        presentation: {
          kind: "magician_swap" as const,
          actorPlayerId: "player-1",
          targetPlayerId: "player-2",
          actorHandCount: 2,
          targetHandCount: 5
        },
        createdAt: "2026-07-03T00:00:01.000Z"
      },
      gameRoom.gameLog[0]
    ];

    const events = createActionEventsFromLogs(gameRoom, logs);

    expect(events.map((event) => event.id)).toEqual(["log-skill:event", "log-1:event"]);
    expect(events[0]).toMatchObject({
      actorPlayerId: "player-1",
      targetPlayerId: "player-2",
      presentation: {
        kind: "magician_swap",
        actorHandCount: 2,
        targetHandCount: 5
      }
    });
  });
});

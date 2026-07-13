import { afterEach, describe, expect, it, vi } from "vitest";
import type { DistrictCard, GameRoom, RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { selectRole } from "./turnFlow";
import { resolveExpiredTurn } from "./timers";

function createStartedGame() {
  const lobbyRoom: RoomState = {
    roomCode: "TIMER1",
    hostPlayerId: "player-1",
    status: "STARTED",
    minPlayers: 2,
    maxPlayers: 4,
    futureMaxPlayers: 8,
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
      enableFaceUpRoleDiscard: false,
      enableFaceDownRoleDiscard: false,
      drawMode: "draw2Choose1",
      roleRulePreset: "classicStandard"
    },
    startCountdown: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    chatMessages: [],
    players: ["Alice", "Bob"].map((name, index) => ({
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

  return initializeGameRoom(lobbyRoom);
}

function selectRolesById(gameRoom: GameRoom, roleIds: string[]) {
  if (gameRoom.phase === "CROWN_REVEAL") {
    resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);
  }

  for (const roleId of roleIds) {
    const playerId = gameRoom.roleSelectionTurnPlayerId;
    expect(playerId).toBeTruthy();
    const result = selectRole(gameRoom, {
      playerId: playerId ?? "",
      roleId
    });
    expect(result.ok).toBe(true);
  }
}


function makeYellowDistrict(id: string): DistrictCard {
  return {
    id,
    name: `Yellow ${id}`,
    cost: 0,
    color: "yellow",
    score: 1,
    description: "",
    effectType: "none",
    effectParams: {}
  };
}
describe("turn timers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enters role selection from crown reveal after the seven second timer expires", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const gameRoom = createStartedGame();
    const deadlineAt = gameRoom.turnTimer?.deadlineAt;

    expect(gameRoom.phase).toBe("CROWN_REVEAL");
    expect(gameRoom.crownPlayerId).toBe("player-2");
    expect(gameRoom.roleSelectionTurnPlayerId).toBeNull();

    const result = resolveExpiredTurn(gameRoom, deadlineAt);

    expect(result).toEqual({ ok: true, timedOut: true });
    expect(gameRoom.phase).toBe("ROLE_SELECTION");
    expect(gameRoom.roleSelectionTurnPlayerId).toBe("player-2");
    expect(gameRoom.roleSelectionOrder[0]).toBe("player-2");
    expect(gameRoom.turnTimer).toMatchObject({
      phase: "ROLE_SELECTION",
      playerId: "player-2"
    });
  });

  it("adds deadline metadata when role selection starts", () => {
    const gameRoom = createStartedGame();
    resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);

    expect(gameRoom.turnTimer).toMatchObject({
      phase: "ROLE_SELECTION",
      playerId: gameRoom.crownPlayerId,
      timeoutMs: expect.any(Number)
    });
    expect(gameRoom.turnTimer?.deadlineAt).toBeTruthy();
  });

  it("refreshes deadline metadata when entering role action", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];

    selectRolesById(gameRoom, [roles[0].id, roles[1].id]);

    expect(gameRoom.phase).toBe("ROLE_ACTION");
    expect(gameRoom.turnTimer).toMatchObject({
      phase: "ROLE_ACTION",
      playerId: gameRoom.currentTurnPlayerId,
      timeoutMs: expect.any(Number)
    });
    expect(gameRoom.turnState?.deadlineAt).toBe(gameRoom.turnTimer?.deadlineAt);
  });

  it("auto-selects a legal role when role selection expires", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const gameRoom = createStartedGame();
    resolveExpiredTurn(gameRoom, gameRoom.turnTimer?.deadlineAt);
    const expectedRoleId = gameRoom.availableRoles[Math.floor(gameRoom.availableRoles.length * 0.5)].id;
    const chooserId = gameRoom.roleSelectionTurnPlayerId;

    const result = resolveExpiredTurn(gameRoom, new Date(Date.now() + 120_000).toISOString());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.timedOut).toBe(true);
    expect(gameRoom.players.find((player) => player.id === chooserId)?.selectedRoleId).toBe(
      expectedRoleId
    );
    expect(gameRoom.roleSelectionTurnPlayerId).not.toBe(chooserId);
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("turn_timeout_role_selected");
    const timeoutLog = gameRoom.gameLog.find((log) => log.type === "turn_timeout_role_selected");
    expect(timeoutLog).toMatchObject({
      origin: "timeout",
      autoReason: "role_selection_timeout"
    });
  });

  it("ends the current action turn when role action expires", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    selectRolesById(gameRoom, [roles[0].id, roles[1].id]);
    const firstActionPlayerId = gameRoom.currentTurnPlayerId;

    const result = resolveExpiredTurn(gameRoom, new Date(Date.now() + 120_000).toISOString());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.timedOut).toBe(true);
    expect(gameRoom.currentTurnPlayerId).not.toBe(firstActionPlayerId);
    expect(gameRoom.completedRoleIds).toContain(roles[0].id);
    expect(gameRoom.gameLog.map((log) => log.type)).toContain("turn_timeout_action_ended");
    const timeoutLog = gameRoom.gameLog.find((log) => log.type === "turn_timeout_action_ended");
    expect(timeoutLog).toMatchObject({ origin: "timeout", autoReason: "turn_timeout" });
  });
  it("takes gold before ending an expired action turn with no resource action", () => {
    const gameRoom = createStartedGame();
    const roles = [...gameRoom.availableRoles];
    selectRolesById(gameRoom, [roles[0].id, roles[1].id]);
    const firstActionPlayerId = gameRoom.currentTurnPlayerId;
    const player = gameRoom.players.find((candidate) => candidate.id === firstActionPlayerId);
    if (!player) {
      throw new Error("Expected current player.");
    }
    const initialGold = player.gold;

    const result = resolveExpiredTurn(gameRoom, new Date(Date.now() + 120_000).toISOString());

    expect(result.ok).toBe(true);
    expect(player.gold).toBe(initialGold + 2);
    expect(gameRoom.currentTurnPlayerId).not.toBe(firstActionPlayerId);
  });
  it("auto-resolves income role skills before ending an expired action turn", () => {
    const gameRoom = createStartedGame();
    selectRolesById(gameRoom, ["king", "merchant"]);
    const kingPlayer = gameRoom.players.find((player) => player.selectedRoleId === "king");
    if (!kingPlayer) {
      throw new Error("Expected king player.");
    }
    kingPlayer.city = [makeYellowDistrict("temple")];
    kingPlayer.gold = 2;

    const result = resolveExpiredTurn(gameRoom, new Date(Date.now() + 120_000).toISOString());

    expect(result.ok).toBe(true);
    expect(kingPlayer.gold).toBe(5);
    expect(gameRoom.roleEffects.usedSkillPlayerIds).toContain(kingPlayer.id);
    expect(gameRoom.completedRoleIds).toContain("king");
  });
});



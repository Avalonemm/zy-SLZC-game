import { describe, expect, it } from "vitest";
import type { DistrictCard, DistrictColor, GameLog, LobbyPlayer, RoomState } from "@zy/shared";
import { initializeGameRoom } from "./gameSetup";
import { applaudGameResult } from "./gameResults";
import { scoreGame } from "./scoring";
import { visibleStateForPlayer } from "./visibility";

function lobbyPlayer(index: number, isBot = false): LobbyPlayer {
  return {
    id: `player-${index}`,
    uid: 100_000 + index,
    socketId: `socket-${index}`,
    name: `玩家${index}`,
    connected: true,
    isHost: index === 1,
    isReady: true,
    isBot
  };
}

function room(): RoomState {
  const players = [lobbyPlayer(1), lobbyPlayer(2), lobbyPlayer(3), lobbyPlayer(4, true), lobbyPlayer(5)];
  return {
    roomCode: "RESULT",
    hostPlayerId: players[0].id,
    status: "LOBBY",
    players,
    minPlayers: 4,
    maxPlayers: 8,
    futureMaxPlayers: 8,
    settings: {
      startCountdownSeconds: 10,
      turnTimeoutSeconds: 15,
      endCitySize: 8,
      enabledRoleIds: ["assassin", "thief", "magician", "king", "bishop", "merchant", "architect", "warlord"],
      enableFaceUpRoleDiscard: true,
      enableFaceDownRoleDiscard: true,
      drawMode: "draw2Choose1",
      roleRulePreset: "classicStandard"
    },
    startCountdown: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    chatMessages: []
  };
}

function district(id: string, color: DistrictColor, score = 1): DistrictCard {
  return {
    id,
    name: id,
    cost: score,
    color,
    score,
    description: "公开建筑说明",
    effectType: "none",
    effectParams: {}
  };
}

function log(id: string, presentation: NonNullable<GameLog["presentation"]>): GameLog {
  return {
    id,
    type: id,
    message: "这段文案不会参与统计",
    presentation,
    createdAt: "2026-07-15T00:00:00.000Z"
  };
}

function endedGame() {
  const game = initializeGameRoom(room());
  const colors: DistrictColor[] = ["yellow", "blue", "green", "red", "purple"];
  game.players[0].city = [
    ...colors.map((color, index) => district(`p1-${index}`, color, 2)),
    ...Array.from({ length: 3 }, (_, index) => district(`p1-extra-${index}`, "yellow", 1))
  ];
  game.players[1].city = colors.map((color, index) => district(`p2-${index}`, color, 2));
  game.players[2].city = Array.from({ length: 7 }, (_, index) => district(`p3-${index}`, "red", 2));
  game.players[3].city = Array.from({ length: 4 }, (_, index) => district(`p4-${index}`, "blue", 1));
  game.players[4].city = Array.from({ length: 3 }, (_, index) => district(`p5-${index}`, "purple", 1));
  game.players[4].gold = 12;
  game.firstCompletedCityPlayerId = game.players[0].id;
  game.gameLog = [
    log("steal-1", { kind: "thief_steal", actorPlayerId: game.players[2].id, amount: 5 }),
    log("income-1", { kind: "role_income", actorPlayerId: game.players[4].id, amount: 3 }),
    log("income-2", { kind: "role_income", actorPlayerId: game.players[4].id, amount: 2 }),
    log("destroy-1", { kind: "warlord_destroy", actorPlayerId: game.players[1].id }),
    log("build-1", { kind: "build_district", actorPlayerId: game.players[2].id }),
    log("build-2", { kind: "build_district", actorPlayerId: game.players[2].id })
  ];
  scoreGame(game);
  return game;
}

describe("game result summary", () => {
  it("keeps detailed scoring and creates deterministic positive titles and highlights", () => {
    const game = endedGame();
    const summary = game.resultSummary;
    expect(summary).toBeTruthy();
    expect(summary?.results[0]).toMatchObject({
      districtCount: 8,
      colorBonusScore: 3,
      completionBonusScore: 4,
      hasFiveColors: true
    });
    expect(summary?.titles["player-1"]).toBe("first_city");
    expect(summary?.titles["player-2"]).toBe("five_color");
    expect(summary?.titles["player-3"]).toBe("red_theme");
    expect(summary?.titles["player-5"]).toBe("treasury_keeper");
    expect(summary?.highlights).toHaveLength(3);
    expect(new Set(summary?.highlights.map((highlight) => highlight.playerId)).size).toBe(3);
    expect(JSON.stringify(summary)).not.toContain("公开建筑说明");
    expect(JSON.stringify(summary)).not.toContain("这段文案不会参与统计");
  });

  it("accepts applause once and exposes only counts plus the viewer's own targets", () => {
    const game = endedGame();
    expect(applaudGameResult(game, "player-1", "player-1")).toMatchObject({ ok: false });
    expect(applaudGameResult(game, "player-1", "player-4")).toMatchObject({ ok: false });
    expect(applaudGameResult(game, "player-4", "player-1")).toMatchObject({ ok: false });
    expect(applaudGameResult(game, "player-1", "player-2")).toEqual({ ok: true, totalCount: 1 });
    expect(applaudGameResult(game, "player-1", "player-2")).toMatchObject({ ok: false });
    expect(applaudGameResult(game, "player-3", "player-2")).toEqual({ ok: true, totalCount: 2 });

    const playerOneView = visibleStateForPlayer(game, "player-1");
    const playerThreeView = visibleStateForPlayer(game, "player-3");
    expect(playerOneView.resultSummary?.applauseCounts["player-2"]).toBe(2);
    expect(playerOneView.resultSummary?.viewerApplaudedTargetIds).toEqual(["player-2"]);
    expect(playerThreeView.resultSummary?.viewerApplaudedTargetIds).toEqual(["player-2"]);
    expect("resultApplauseBySender" in playerOneView).toBe(false);
  });

  it("rejects applause before the result phase", () => {
    const game = initializeGameRoom(room());
    expect(applaudGameResult(game, "player-1", "player-2")).toMatchObject({ ok: false });
  });
});

import { describe, expect, it } from "vitest";
import { createRoomManager } from "./roomManager";
import { resolveExpiredTurn } from "./timers";

describe("room manager", () => {
  it("creates a room with a host player", () => {
    const manager = createRoomManager();

    const result = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.room.roomCode).toMatch(/^[A-Z0-9]{4,6}$/);
    expect(result.room.status).toBe("LOBBY");
    expect(result.room.minPlayers).toBe(2);
    expect(result.room.maxPlayers).toBe(4);
    expect(result.room.futureMaxPlayers).toBe(8);
    expect(result.room.settings).toEqual({
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
    });
    expect(result.room.startCountdown).toBe(null);
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0]).toMatchObject({
      uid: 100001,
      name: "Alice",
      socketId: "socket-a",
      isHost: true,
      isReady: true,
      connected: true,
      isBot: false
    });
    expect(result.room.hostPlayerId).toBe(result.playerId);
  });

  it("adds exactly one ready test bot per click", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const first = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    const second = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(second.error);
    }

    expect(second.room.players).toHaveLength(3);
    expect(second.room.players.map((player) => player.name)).toEqual([
      "Alice",
      "测试人机 1",
      "测试人机 2"
    ]);
    expect(second.room.players.slice(1).every((player) => player.isBot)).toBe(true);
    expect(second.room.players.every((player) => player.isReady)).toBe(true);
  });

  it("lets the host remove one test bot before the game starts", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const first = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    const second = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(second.error);
    }

    const targetBot = second.room.players.find((player) => player.isBot);
    expect(targetBot).toBeDefined();
    if (!targetBot) {
      throw new Error("Expected a test bot.");
    }

    const removed = manager.removeTestBot({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      targetBotPlayerId: targetBot.id
    });

    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      throw new Error(removed.error);
    }

    expect(removed.room.players).toHaveLength(2);
    expect(removed.room.players.map((player) => player.id)).not.toContain(targetBot.id);
    expect(removed.room.players.filter((player) => player.isBot)).toHaveLength(1);
  });

  it("does not let the host remove a real player as a test bot", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    expect(
      manager.removeTestBot({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        targetBotPlayerId: bob.playerId
      })
    ).toEqual({
      ok: false,
      error: "只能删除测试人机。"
    });
  });

  it("stores room chat messages from players in the room", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const chat = manager.addChatMessage({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      message: "大家准备好了吗？"
    });

    expect(chat.ok).toBe(true);
    if (!chat.ok) {
      throw new Error(chat.error);
    }

    expect(chat.message).toMatchObject({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      playerName: "Alice",
      message: "大家准备好了吗？"
    });
    expect(chat.room.chatMessages).toHaveLength(1);
  });

  it("rejects empty chat messages and players outside the room", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    expect(
      manager.addChatMessage({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        message: "   "
      })
    ).toEqual({
      ok: false,
      error: "聊天内容不能为空。"
    });

    expect(
      manager.addChatMessage({
        roomCode: host.room.roomCode,
        playerId: "missing-player",
        message: "hello"
      })
    ).toEqual({
      ok: false,
      error: "玩家不在房间中。"
    });
  });

  it("lets up to four players join and rejects a fifth", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });
    const cici = manager.joinRoom({
      uid: 100003,
      roomCode: host.room.roomCode,
      socketId: "socket-c",
      playerName: "Cici"
    });
    const dan = manager.joinRoom({
      uid: 100004,
      roomCode: host.room.roomCode,
      socketId: "socket-d",
      playerName: "Dan"
    });
    const fifth = manager.joinRoom({
      uid: 100005,
      roomCode: host.room.roomCode,
      socketId: "socket-e",
      playerName: "Eve"
    });

    expect(bob.ok).toBe(true);
    expect(cici.ok).toBe(true);
    expect(dan.ok).toBe(true);
    expect(fifth).toEqual({
      ok: false,
      error: "房间已满，当前测试版最多 4 人。"
    });

    const room = manager.getRoom(host.room.roomCode);
    expect(room?.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
      "Cici",
      "Dan"
    ]);
  });

  it("transfers host to the next player when the host leaves", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    const leave = manager.leaveRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(leave.ok).toBe(true);
    if (!leave.ok || !leave.room) {
      throw new Error("Expected room to remain after host leaves.");
    }

    expect(leave.room.hostPlayerId).toBe(bob.playerId);
    expect(leave.room.players[0]).toMatchObject({
      name: "Bob",
      isHost: true,
      isReady: true
    });
  });

  it("lets the host kick another player before the game starts", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    const kicked = manager.kickPlayer({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      targetPlayerId: bob.playerId
    });

    expect(kicked.ok).toBe(true);
    if (!kicked.ok) {
      throw new Error(kicked.error);
    }
    expect(kicked.room.players.map((player) => player.id)).toEqual([host.playerId]);
  });

  it("does not let a non-host kick players or the host kick themselves", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    expect(
      manager.kickPlayer({
        roomCode: host.room.roomCode,
        playerId: bob.playerId,
        targetPlayerId: host.playerId
      }).ok
    ).toBe(false);
    expect(
      manager.kickPlayer({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        targetPlayerId: host.playerId
      }).ok
    ).toBe(false);
    expect(manager.getRoom(host.room.roomCode)?.players).toHaveLength(2);
  });

  it("lets the host transfer host ownership to another online real player", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    const transferred = manager.transferHost({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      targetPlayerId: bob.playerId
    });

    expect(transferred.ok).toBe(true);
    if (!transferred.ok) {
      throw new Error(transferred.error);
    }
    expect(transferred.room.hostPlayerId).toBe(bob.playerId);
    expect(transferred.room.players.find((player) => player.id === host.playerId)?.isHost).toBe(false);
    expect(transferred.room.players.find((player) => player.id === bob.playerId)).toMatchObject({
      isHost: true,
      isReady: true
    });
  });

  it("updates public room settings before the game starts and applies turn timeout to the game", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const updated = manager.updateRoomSettings({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      settings: {
        turnTimeoutSeconds: 35
      }
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      throw new Error(updated.error);
    }
    expect(updated.room.settings.turnTimeoutSeconds).toBe(35);

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(bot.ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error);
    }
    expect(started.gameRoom.settings.turnTimeoutSeconds).toBe(35);
    expect(started.gameRoom.turnTimer?.timeoutMs).toBe(5_000);
    started.gameRoom.crownPlayerId = host.playerId;
    const crownResolved = resolveExpiredTurn(started.gameRoom, started.gameRoom.turnTimer?.deadlineAt);
    expect(crownResolved.ok).toBe(true);
    expect(started.gameRoom.phase).toBe("ROLE_SELECTION");
    expect(started.gameRoom.turnTimer?.timeoutMs).toBe(35_000);
  });

  it("updates standard rule settings before the game starts", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const updated = manager.updateRoomSettings({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      settings: {
        endCitySize: 4,
        enabledRoleIds: ["assassin", "thief", "magician", "king"],
        enableFaceUpRoleDiscard: false,
        enableFaceDownRoleDiscard: false,
        drawMode: "draw2Choose1"
      }
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      throw new Error(updated.error);
    }

    expect(updated.room.settings).toMatchObject({
      endCitySize: 4,
      enabledRoleIds: ["assassin", "thief", "magician", "king"],
      enableFaceUpRoleDiscard: false,
      enableFaceDownRoleDiscard: false,
      drawMode: "draw2Choose1"
    });
  });

  it("rejects invalid standard rule settings", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    expect(
      manager.updateRoomSettings({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        settings: { endCitySize: 3 }
      })
    ).toEqual({
      ok: false,
      error: "结束建筑数必须在 4-8 之间。"
    });

    expect(
      manager.updateRoomSettings({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        settings: { enabledRoleIds: ["assassin", "missing-role"] }
      })
    ).toEqual({
      ok: false,
      error: "启用角色包含未知角色。"
    });
  });

  it("starts and cancels the ready auto-start countdown from lobby readiness", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    expect(manager.beginStartCountdown(host.room.roomCode, new Date("2026-07-04T00:00:00.000Z")).ok).toBe(false);

    const ready = manager.setReady({
      roomCode: host.room.roomCode,
      playerId: bob.playerId,
      isReady: true
    });
    expect(ready.ok).toBe(true);

    const countdown = manager.beginStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:00.000Z")
    );

    expect(countdown.ok).toBe(true);
    if (!countdown.ok) {
      throw new Error(countdown.error);
    }
    expect(countdown.room.startCountdown).toMatchObject({
      seconds: 10,
      startedAt: "2026-07-04T00:00:00.000Z",
      deadlineAt: "2026-07-04T00:00:10.000Z"
    });

    const unready = manager.setReady({
      roomCode: host.room.roomCode,
      playerId: bob.playerId,
      isReady: false
    });
    expect(unready.ok).toBe(true);
    expect(unready.ok && unready.room.startCountdown).toBe(null);
  });

  it("resolves a ready countdown into game start only after its deadline", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });
    if (!bob.ok) {
      throw new Error(bob.error);
    }
    const ready = manager.setReady({
      roomCode: host.room.roomCode,
      playerId: bob.playerId,
      isReady: true
    });
    expect(ready.ok).toBe(true);

    const countdown = manager.beginStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:00.000Z")
    );
    expect(countdown.ok).toBe(true);

    const early = manager.resolveStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:09.000Z")
    );
    expect(early.ok).toBe(true);
    expect(early.ok && early.started).toBe(false);

    const resolved = manager.resolveStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:10.000Z")
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    expect(resolved.started).toBe(true);
    expect(resolved.room.status).toBe("STARTED");
    expect(resolved.gameRoom?.phase).toBe("CROWN_REVEAL");
  });

  it("does not start the ready countdown with one real player and test bots", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(bot.ok).toBe(true);

    const countdown = manager.beginStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:00.000Z")
    );

    expect(countdown.ok).toBe(false);
    expect(manager.getRoom(host.room.roomCode)?.startCountdown).toBe(null);
  });

  it("does not start the ready countdown when only test bots remain in the room", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const firstBot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    const secondBot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(firstBot.ok).toBe(true);
    expect(secondBot.ok).toBe(true);

    const leave = manager.leaveRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(leave.ok).toBe(true);
    expect(manager.getRoom(host.room.roomCode)?.players.every((player) => player.isBot)).toBe(true);

    const countdown = manager.beginStartCountdown(
      host.room.roomCode,
      new Date("2026-07-04T00:00:00.000Z")
    );

    expect(countdown.ok).toBe(false);
    expect(manager.getRoom(host.room.roomCode)?.startCountdown).toBe(null);
  });

  it("starts a two-player test game when everyone is ready", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    expect(
      manager.startGame({ roomCode: host.room.roomCode, playerId: host.playerId })
    ).toEqual({
      ok: false,
      error: "当前测试版需要 2-4 名玩家才能开始。"
    });

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(bot.ok).toBe(true);
    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error);
    }
    expect(started.room.status).toBe("STARTED");
    expect(started.gameRoom.phase).toBe("CROWN_REVEAL");
    expect(started.gameRoom.players).toHaveLength(2);
  });

  it("rejects repeated start after the game has already started", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(bot.ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error);
    }

    const originalHandIds = started.gameRoom.players[0].hand.map((card) => card.id);
    started.gameRoom.players[0].gold = 9;

    const repeatedStart = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(repeatedStart).toEqual({
      ok: false,
      error: "游戏已经开始或结束，不能重复开始。"
    });
    expect(manager.getGameRoom(host.room.roomCode)?.players[0].gold).toBe(9);
    expect(manager.getGameRoom(host.room.roomCode)?.players[0].hand.map((card) => card.id)).toEqual(originalHandIds);
  });

  it("requires all non-host players ready before start", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    expect(
      manager.startGame({ roomCode: host.room.roomCode, playerId: host.playerId })
    ).toEqual({
      ok: false,
      error: "还有玩家未准备。"
    });

    const ready = manager.setReady({
      roomCode: host.room.roomCode,
      playerId: bob.playerId,
      isReady: true
    });
    expect(ready.ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error);
    }
    expect(started.gameRoom.players).toHaveLength(2);
    expect(started.gameRoom.players[0].gold).toBe(2);
    expect(started.gameRoom.players[0].hand).toHaveLength(4);
  });

  it("reconnects an existing player and updates the active game socket", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    if (!bot.ok) {
      throw new Error(bot.error);
    }

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    if (!started.ok) {
      throw new Error(started.error);
    }

    const disconnectedRoom = manager.markDisconnectedBySocket("socket-a");
    expect(disconnectedRoom?.players[0]).toMatchObject({
      id: host.playerId,
      connected: false
    });
    expect(started.gameRoom.players[0]).toMatchObject({
      id: host.playerId,
      connected: false
    });

    const reconnect = manager.reconnectRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      socketId: "socket-new"
    });

    expect(reconnect.ok).toBe(true);
    if (!reconnect.ok) {
      throw new Error(reconnect.error);
    }

    expect(reconnect.player).toMatchObject({
      id: host.playerId,
      socketId: "socket-new",
      connected: true,
      uid: 100001
    });
    expect(started.gameRoom.players[0]).toMatchObject({
      id: host.playerId,
      socketId: "socket-new",
      connected: true
    });
  });

  it("marks a player offline instead of removing them after the game starts", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bot = manager.addTestBots({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    expect(bot.ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    if (!started.ok) {
      throw new Error(started.error);
    }

    const leave = manager.leaveRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(leave.ok).toBe(true);
    expect(leave.ok && leave.room?.players).toHaveLength(2);
    expect(started.gameRoom.players).toHaveLength(2);
    expect(leave.ok && leave.room?.players[0].connected).toBe(false);
    expect(started.gameRoom.players[0].connected).toBe(false);
  });

  it("transfers host to the next connected player when the host leaves after the game starts", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const bob = manager.joinRoom({
      uid: 100002,
      roomCode: host.room.roomCode,
      socketId: "socket-b",
      playerName: "Bob"
    });

    if (!bob.ok) {
      throw new Error(bob.error);
    }

    const ready = manager.setReady({
      roomCode: host.room.roomCode,
      playerId: bob.playerId,
      isReady: true
    });
    expect(ready.ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    if (!started.ok) {
      throw new Error(started.error);
    }

    const leave = manager.leaveRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(leave.ok).toBe(true);
    if (!leave.ok || !leave.room) {
      throw new Error("Expected started room to remain.");
    }

    expect(leave.room.hostPlayerId).toBe(bob.playerId);
    expect(leave.room.players.find((player) => player.id === bob.playerId)?.isHost).toBe(true);
    expect(started.gameRoom.hostPlayerId).toBe(bob.playerId);
    expect(started.gameRoom.players.find((player) => player.id === bob.playerId)?.isHost).toBe(true);
    expect(started.gameRoom.players.find((player) => player.id === host.playerId)?.connected).toBe(false);
  });
});

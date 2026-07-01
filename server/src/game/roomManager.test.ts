import { describe, expect, it } from "vitest";
import { createRoomManager } from "./roomManager";

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
    expect(result.room.maxPlayers).toBe(4);
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
      error: "房间已满，最多 4 人。"
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
      error: "需要 2-4 名玩家才能开始。"
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
    expect(started.gameRoom.phase).toBe("ROLE_SELECTION");
    expect(started.gameRoom.players).toHaveLength(2);
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
});

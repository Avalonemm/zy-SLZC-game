import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoomManager } from "./roomManager";
import { createRoomSnapshotStore } from "./roomSnapshotStore";
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
      turnTimeoutSeconds: 45,
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
    });
    expect(result.room.startCountdown).toBe(null);
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0]).toMatchObject({
      uid: 100001,
      name: "Alice",
      socketId: "socket-a",
      isHost: true,
      isReady: false,
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
      "人机 1",
      "人机 2"
    ]);
    expect(second.room.players.slice(1).every((player) => player.isBot)).toBe(true);
    expect(second.room.players[0].isReady).toBe(false);
    expect(second.room.players.slice(1).every((player) => player.isReady)).toBe(true);
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
      error: "只能删除人机。"
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

  it("keeps new rooms at four seats by default and rejects a fifth player", () => {
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
      error: "\u623f\u95f4\u5df2\u6ee1\uff0c\u5f53\u524d\u623f\u95f4\u6700\u591a 4 \u4eba\u3002"
    });

    const room = manager.getRoom(host.room.roomCode);
    expect(room?.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
      "Cici",
      "Dan"
    ]);
  });


  it("lets the host expand room seats to eight and rejects a ninth player", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const update = manager.updateRoomSettings({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      settings: { maxPlayers: 8 }
    });

    expect(update.ok).toBe(true);
    if (!update.ok) {
      throw new Error(update.error);
    }
    expect(update.room.maxPlayers).toBe(8);

    const names = ["Bob", "Cici", "Dan", "Eve", "Finn", "Gina", "Hugo"];
    const joins = names.map((name, index) =>
      manager.joinRoom({
        uid: 100002 + index,
        roomCode: host.room.roomCode,
        socketId: "socket-" + index,
        playerName: name
      })
    );
    const ninth = manager.joinRoom({
      uid: 100009,
      roomCode: host.room.roomCode,
      socketId: "socket-i",
      playerName: "Iris"
    });

    expect(joins.every((join) => join.ok)).toBe(true);
    expect(ninth).toEqual({
      ok: false,
      error: "\u623f\u95f4\u5df2\u6ee1\uff0c\u5f53\u524d\u623f\u95f4\u6700\u591a 8 \u4eba\u3002"
    });
    expect(manager.getRoom(host.room.roomCode)?.players).toHaveLength(8);
  });

  it("rejects reducing room seats below the current player count", () => {
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

    expect(bob.ok).toBe(true);
    expect(cici.ok).toBe(true);

    expect(
      manager.updateRoomSettings({
        roomCode: host.room.roomCode,
        playerId: host.playerId,
        settings: { maxPlayers: 2 }
      })
    ).toEqual({
      ok: false,
      error: "\u623f\u95f4\u4eba\u6570\u4e0a\u9650\u4e0d\u80fd\u5c11\u4e8e\u5f53\u524d\u73a9\u5bb6\u6570\u3002"
    });
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
      isReady: false
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
      isReady: false
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
    expect(started.gameRoom.turnTimer?.timeoutMs).toBe(9_000);
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

  it("keeps the room waiting until the host explicitly starts", () => {
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
    expect(ready.ok && ready.room.status).toBe("LOBBY");
    expect(ready.ok && ready.room.startCountdown).toBe(null);
    expect(manager.getGameRoom(host.room.roomCode)).toBeUndefined();
  });

  it("does not allow the host to toggle a ready state", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });
    if (!host.ok) {
      throw new Error(host.error);
    }
    expect(manager.setReady({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      isReady: true
    })).toEqual({
      ok: false,
      error: "房主无需准备，确认其他玩家准备后请直接开始游戏。"
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
      error: "\u5f53\u524d\u623f\u95f4\u9700\u8981 2-4 \u540d\u73a9\u5bb6\u624d\u80fd\u5f00\u59cb\u3002"
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


  it("keeps the room in lobby when role settings cannot support the current players", () => {
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

    if (!bob.ok || !cici.ok) {
      throw new Error("Expected players to join.");
    }

    const updated = manager.updateRoomSettings({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      settings: {
        enabledRoleIds: ["assassin", "thief"]
      }
    });
    expect(updated.ok).toBe(true);

    expect(manager.setReady({ roomCode: host.room.roomCode, playerId: bob.playerId, isReady: true }).ok).toBe(true);
    expect(manager.setReady({ roomCode: host.room.roomCode, playerId: cici.playerId, isReady: true }).ok).toBe(true);

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(started).toEqual({
      ok: false,
      error: "\u542f\u7528\u89d2\u8272\u548c\u5f03\u724c\u8bbe\u7f6e\u4e0d\u8db3\u4ee5\u652f\u6301\u5f53\u524d\u73a9\u5bb6\u4eba\u6570\u3002"
    });
    expect(manager.getRoom(host.room.roomCode)?.status).toBe("LOBBY");
    expect(manager.getGameRoom(host.room.roomCode)).toBeUndefined();
  });
  it("starts an eight-player room after the host expands seats", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });

    if (!host.ok) {
      throw new Error(host.error);
    }

    const update = manager.updateRoomSettings({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      settings: { maxPlayers: 8 }
    });
    expect(update.ok).toBe(true);

    for (let index = 0; index < 7; index += 1) {
      const bot = manager.addTestBots({
        roomCode: host.room.roomCode,
        playerId: host.playerId
      });
      expect(bot.ok).toBe(true);
    }

    const started = manager.startGame({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.error);
    }
    expect(started.gameRoom.players).toHaveLength(8);
    expect(started.gameRoom.availableRoles).toHaveLength(8);
    expect(started.gameRoom.discardedRoles).toEqual([]);
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
      error: "\u8fd8\u6709\u73a9\u5bb6\u672a\u51c6\u5907\u3002"
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
      reconnectToken: host.reconnectToken,
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

  it("returns an ended game to the same ready room for a rematch", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });
    if (!host.ok) {
      throw new Error(host.error);
    }
    const bot = manager.addTestBots({ roomCode: host.room.roomCode, playerId: host.playerId });
    expect(bot.ok).toBe(true);

    const started = manager.startGame({ roomCode: host.room.roomCode, playerId: host.playerId });
    if (!started.ok) {
      throw new Error(started.error);
    }
    started.gameRoom.phase = "ENDED";
    const settingsBefore = started.room.settings;

    const rematch = manager.resetForRematch({
      roomCode: host.room.roomCode,
      playerId: host.playerId
    });
    if (!rematch.ok) {
      throw new Error(rematch.error);
    }

    expect(rematch.room.status).toBe("LOBBY");
    expect(rematch.room.settings).toBe(settingsBefore);
    expect(rematch.room.players.find((player) => player.id === host.playerId)?.isReady).toBe(false);
    expect(rematch.room.players.find((player) => player.isBot)?.isReady).toBe(true);
    expect(manager.getGameRoom(host.room.roomCode)).toBeUndefined();
  });

  it("exports and restores active rooms with reconnect credentials", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });
    if (!host.ok) throw new Error(host.error);

    const restored = createRoomManager(manager.exportSnapshot());
    expect(restored.getRoom(host.room.roomCode)?.players[0].name).toBe("Alice");
    const reconnect = restored.reconnectRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      reconnectToken: host.reconnectToken,
      socketId: "socket-restored"
    });
    expect(reconnect.ok).toBe(true);
  });

  it("migrates a version-one active turn without replaying earlier role calls", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });
    if (!host.ok) throw new Error(host.error);
    for (let count = 0; count < 3; count += 1) {
      expect(manager.addTestBots({ roomCode: host.room.roomCode, playerId: host.playerId }).ok).toBe(true);
    }
    const started = manager.startGame({ roomCode: host.room.roomCode, playerId: host.playerId });
    if (!started.ok) throw new Error(started.error);

    const roleIds = ["assassin", "thief", "magician", "king"];
    started.gameRoom.players.forEach((player, index) => {
      player.selectedRoleId = roleIds[index];
    });
    started.gameRoom.phase = "ROLE_ACTION";
    started.gameRoom.currentTurnPlayerId = started.gameRoom.players[2].id;
    started.gameRoom.completedRoleIds = ["assassin", "thief"];

    const legacySnapshot = JSON.parse(JSON.stringify(manager.exportSnapshot()));
    legacySnapshot.version = 1;
    delete legacySnapshot.gameRooms[0].calledRoleIds;
    delete legacySnapshot.gameRooms[0].roleCallState;

    const directory = mkdtempSync(join(tmpdir(), "zy-role-call-snapshot-"));
    const snapshotPath = join(directory, "active-rooms.json");
    const previousPath = process.env.ROOM_SNAPSHOT_PATH;
    try {
      writeFileSync(snapshotPath, JSON.stringify(legacySnapshot), "utf8");
      process.env.ROOM_SNAPSHOT_PATH = snapshotPath;
      const restored = createRoomSnapshotStore().load();
      expect(restored?.version).toBe(3);
      expect(restored?.gameRooms[0].calledRoleIds).toEqual(["assassin", "thief", "magician"]);
      expect(restored?.gameRooms[0].roleCallState).toBeNull();
    } finally {
      if (previousPath === undefined) delete process.env.ROOM_SNAPSHOT_PATH;
      else process.env.ROOM_SNAPSHOT_PATH = previousPath;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects reconnect attempts without the private credential", () => {
    const manager = createRoomManager();
    const host = manager.createRoom({
      uid: 100001,
      socketId: "socket-a",
      playerName: "Alice"
    });
    if (!host.ok) throw new Error(host.error);

    expect(manager.reconnectRoom({
      roomCode: host.room.roomCode,
      playerId: host.playerId,
      reconnectToken: "wrong-token",
      socketId: "socket-attacker"
    })).toEqual({ ok: false, error: "无法恢复房间，恢复凭证无效。" });
  });
});

import type { Server, Socket } from "socket.io";
import type {
  ActionEventPayload,
  ClientToServerEvents,
  InterServerEvents,
  RoomState,
  ServerToClientEvents,
  SocketData
} from "@zy/shared";
import { createLatestActionEvent } from "../game/actionEvents";
import { createRoomManager } from "../game/roomManager";
import {
  advanceOfflinePlayers,
  buildDistrict,
  chooseDrawnDistrictCard,
  drawDistrictCards,
  endTurn,
  runNextBotTurn,
  selectRole,
  skipOfflineCurrentPlayer,
  takeGold,
  useRoleSkill,
  visibleStateForPlayer
} from "../game/gameEngine";
import { BOT_THINK_DELAY_MS } from "../game/gameConfig";
import { resolveExpiredTurn } from "../game/timers";

type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type ActionResult = { ok: boolean; error?: string; actionEvent?: ActionEventPayload | null };

const roomManager = createRoomManager();
let nextUid = 100001;
const startCountdownTimers = new Map<string, ReturnType<typeof setTimeout>>();
const botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const crownRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerSocketHandlers(io: GameServer) {
  io.on("connection", (socket) => {
    const connectedAt = new Date().toISOString();
    socket.data.connectedAt = connectedAt;
    socket.data.uid = nextUid;
    nextUid += 1;

    console.log(`[socket] player connected: ${socket.id}`);

    socket.emit("server_status", {
      message: "Socket connected to game server.",
      socketId: socket.id,
      connectedAt,
      uid: socket.data.uid
    });

    socket.on("ping_server", (payload) => {
      console.log(`[socket] ping from ${socket.id} at ${payload.sentAt}`);
      socket.emit("server_status", {
        message: "Pong from server.",
        socketId: socket.id,
        connectedAt: socket.data.connectedAt,
        uid: socket.data.uid ?? 0
      });
    });

    socket.on("create_room", (payload) => {
      const result = roomManager.createRoom({
        uid: socket.data.uid ?? 0,
        socketId: socket.id,
        playerName: payload.playerName
      });

      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      socket.data.playerId = result.playerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      socket.emit("room_created", {
        roomCode: result.room.roomCode,
        playerId: result.playerId
      });
      broadcastRoomState(io, result.room);
      console.log(`[room] ${payload.playerName} created room ${result.room.roomCode}`);
    });

    socket.on("join_room", (payload) => {
      const result = roomManager.joinRoom({
        uid: socket.data.uid ?? 0,
        roomCode: payload.roomCode,
        socketId: socket.id,
        playerName: payload.playerName
      });

      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      socket.data.playerId = result.playerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      socket.emit("joined_room", {
        roomCode: result.room.roomCode,
        playerId: result.playerId
      });
      syncLobbyStartCountdown(io, result.room);
      console.log(`[room] ${payload.playerName} joined room ${result.room.roomCode}`);
    });

    socket.on("reconnect_room", (payload) => {
      const result = roomManager.reconnectRoom({
        roomCode: payload.roomCode,
        playerId: payload.playerId,
        socketId: socket.id
      });

      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      socket.data.playerId = result.player.id;
      socket.data.roomCode = result.room.roomCode;
      socket.data.uid = result.player.uid;
      socket.join(result.room.roomCode);
      socket.emit("server_status", {
        message: "Socket reconnected to game server.",
        socketId: socket.id,
        connectedAt: socket.data.connectedAt,
        uid: result.player.uid
      });
      socket.emit("reconnected_room", {
        roomCode: result.room.roomCode,
        playerId: result.player.id
      });
      broadcastRoomState(io, result.room);
      if (result.gameRoom) {
        broadcastGameState(result.gameRoom);
        scheduleCrownReveal(result.gameRoom);
      }
      console.log(`[room] player ${result.player.id} reconnected to room ${result.room.roomCode}`);
    });

    socket.on("set_ready", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.setReady({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        isReady: payload.isReady
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("start_game", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.startGame({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      broadcastRoomState(io, result.room);
      clearStartCountdownTimer(result.room.roomCode);
      broadcastGameState(result.gameRoom);
      scheduleCrownReveal(result.gameRoom);
      scheduleBotTurn(result.gameRoom);
      console.log(`[room] room ${result.room.roomCode} marked as started`);
    });

    socket.on("add_test_bots", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.addTestBots({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("remove_test_bot", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.removeTestBot({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        targetBotPlayerId: payload.targetBotPlayerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("kick_player", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.kickPlayer({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        targetPlayerId: payload.targetPlayerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      const kickedSocket = io.sockets.sockets.get(result.kickedPlayer.socketId);
      if (kickedSocket) {
        kickedSocket.leave(result.room.roomCode);
        kickedSocket.data.playerId = undefined;
        kickedSocket.data.roomCode = undefined;
        kickedSocket.emit("kicked_from_room", {
          roomCode: result.room.roomCode,
          message: "你已被房主移出房间。"
        });
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("transfer_host", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.transferHost({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        targetPlayerId: payload.targetPlayerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("update_room_settings", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.updateRoomSettings({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        settings: payload.settings
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      syncLobbyStartCountdown(io, result.room);
    });

    socket.on("resolve_start_countdown", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      resolveLobbyStartCountdown(io, payload.roomCode);
    });

    socket.on("select_role", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const gameRoom = roomManager.getGameRoom(payload.roomCode);
      if (!gameRoom) {
        socket.emit("error_message", { message: "游戏房间不存在。" });
        return;
      }

      const result = selectRole(gameRoom, {
        playerId: socketPlayer.playerId,
        roleId: payload.roleId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      broadcastActionEvent(
        createLatestActionEvent(gameRoom, {
          actorPlayerId: socketPlayer.playerId
        })
      );
      broadcastGameState(gameRoom);
      scheduleBotTurn(gameRoom);
    });

    socket.on("take_gold", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        takeGoldOrError({ roomCode: payload.roomCode, playerId })
      );
    });

    socket.on("draw_district_cards", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        drawCardsOrError({ roomCode: payload.roomCode, playerId })
      );
    });

    socket.on("choose_drawn_district_card", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        chooseDrawnCardOrError({
          roomCode: payload.roomCode,
          playerId,
          districtCardId: payload.districtCardId
        })
      );
    });

    socket.on("build_district", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        buildDistrictOrError({
          roomCode: payload.roomCode,
          playerId,
          districtCardId: payload.districtCardId
        })
      );
    });

    socket.on("use_role_skill", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        useRoleSkillOrError({
          ...payload,
          playerId
        })
      );
    });

    socket.on("end_turn", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        endTurnOrError({ roomCode: payload.roomCode, playerId })
      );
    });

    socket.on("skip_current_offline_player", (payload) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        skipOfflineCurrentPlayerOrError({
          roomCode: payload.roomCode,
          requesterPlayerId: playerId
        })
      );
    });

    socket.on("resolve_turn_timeout", (payload) => {
      handleGameAction(socket, payload.roomCode, () =>
        resolveTurnTimeoutOrError({ roomCode: payload.roomCode })
      );
    });

    socket.on("send_chat_message", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.addChatMessage({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId,
        message: payload.message
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      io.to(result.room.roomCode).emit("chat_message", result.message);
      broadcastRoomState(io, result.room);
    });

    socket.on("leave_room", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.leaveRoom({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId
      });
      socket.leave(payload.roomCode);
      socket.data.playerId = undefined;
      socket.data.roomCode = undefined;

      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      if (result.room) {
        syncLobbyStartCountdown(io, result.room);
        const gameRoom = roomManager.getGameRoom(result.room.roomCode);
        if (gameRoom) {
          const advanceResult = advanceOfflinePlayers(gameRoom);
          if (!advanceResult.ok) {
            socket.emit("error_message", { message: advanceResult.error });
          }
          broadcastGameState(gameRoom);
          scheduleBotTurn(gameRoom);
        }
      }
    });

    socket.on("disconnect", (reason) => {
      const room = roomManager.markDisconnectedBySocket(socket.id);
      if (room) {
        syncLobbyStartCountdown(io, room);
        const gameRoom = roomManager.getGameRoom(room.roomCode);
        if (gameRoom) {
          broadcastGameState(gameRoom);
        }
      }
      console.log(`[socket] player disconnected: ${socket.id} (${reason})`);
    });
  });

  function assertSocketPlayer(socket: GameSocket, roomCode: string) {
    const playerId = socket.data.playerId;
    if (!playerId) {
      return { ok: false as const, error: "当前连接没有绑定玩家身份，请重新加入房间。" };
    }

    const room = roomManager.getRoom(roomCode);
    if (!room) {
      return { ok: false as const, error: "房间不存在。" };
    }

    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { ok: false as const, error: "当前玩家不属于该房间。" };
    }

    return { ok: true as const, playerId, room };
  }

  function handleGameAction(
    socket: GameSocket,
    roomCode: string,
    action: (playerId: string) => ActionResult
  ) {
    const socketPlayer = assertSocketPlayer(socket, roomCode);
    if (!socketPlayer.ok) {
      socket.emit("error_message", { message: socketPlayer.error });
      return;
    }

    const result = action(socketPlayer.playerId);
    if (!result.ok) {
      socket.emit("error_message", { message: result.error ?? "操作失败。" });
      return;
    }

    broadcastActionEvent(result.actionEvent);
    const gameRoom = roomManager.getGameRoom(roomCode);
    if (gameRoom) {
      broadcastGameState(gameRoom);
      scheduleBotTurn(gameRoom);
    }
  }

  function takeGoldOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, takeGold(gameRoom, payload), payload.playerId);
  }

  function drawCardsOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, drawDistrictCards(gameRoom, payload), payload.playerId);
  }

  function chooseDrawnCardOrError(payload: {
    roomCode: string;
    playerId: string;
    districtCardId: string;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, chooseDrawnDistrictCard(gameRoom, payload), payload.playerId);
  }

  function buildDistrictOrError(payload: {
    roomCode: string;
    playerId: string;
    districtCardId: string;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, buildDistrict(gameRoom, payload), payload.playerId);
  }

  function useRoleSkillOrError(payload: {
    roomCode: string;
    playerId: string;
    targetRoleId?: string;
    targetPlayerId?: string;
    targetDistrictCardId?: string;
    discardCardIds?: string[];
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, useRoleSkill(gameRoom, payload), payload.playerId);
  }

  function endTurnOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(gameRoom, endTurn(gameRoom, payload), payload.playerId);
  }

  function skipOfflineCurrentPlayerOrError(payload: {
    roomCode: string;
    requesterPlayerId: string;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return withActionEvent(
      gameRoom,
      skipOfflineCurrentPlayer(gameRoom, {
        requesterPlayerId: payload.requesterPlayerId
      }),
      payload.requesterPlayerId
    );
  }

  function resolveTurnTimeoutOrError(payload: { roomCode: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }

    const actorPlayerId = gameRoom.turnTimer?.playerId ?? "";
    const result = resolveExpiredTurn(gameRoom);
    if (!result.ok) {
      return result;
    }

    if (!result.timedOut) {
      return { ...result, actionEvent: null };
    }

    return withActionEvent(gameRoom, result, actorPlayerId);
  }

  function withActionEvent<T extends ActionResult>(
    gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>,
    result: T,
    actorPlayerId: string
  ): T {
    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      actionEvent: createLatestActionEvent(gameRoom, { actorPlayerId })
    };
  }

  function broadcastActionEvent(event: ActionEventPayload | null | undefined) {
    if (!event || event.visibility !== "public") {
      return;
    }

    io.to(event.roomCode).emit("action_event", event);
  }

  function broadcastGameState(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    for (const player of gameRoom.players) {
      if (!player.connected) {
        continue;
      }

      io.to(player.socketId).emit("game_state", visibleStateForPlayer(gameRoom, player.id));
    }
  }

  function scheduleCrownReveal(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    const roomCode = gameRoom.roomId;
    if (gameRoom.phase !== "CROWN_REVEAL" || gameRoom.turnTimer?.phase !== "CROWN_REVEAL") {
      clearCrownRevealTimer(roomCode);
      return;
    }

    if (crownRevealTimers.has(roomCode)) {
      return;
    }

    const delayMs = Math.max(0, new Date(gameRoom.turnTimer.deadlineAt).getTime() - Date.now());
    const timeout = setTimeout(() => {
      crownRevealTimers.delete(roomCode);
      const latestGameRoom = roomManager.getGameRoom(roomCode);
      if (!latestGameRoom) {
        return;
      }

      const result = resolveExpiredTurn(latestGameRoom);
      if (!result.ok) {
        io.to(roomCode).emit("error_message", { message: result.error });
        broadcastGameState(latestGameRoom);
        return;
      }

      broadcastGameState(latestGameRoom);
      scheduleBotTurn(latestGameRoom);
    }, delayMs);

    crownRevealTimers.set(roomCode, timeout);
  }
  function scheduleBotTurn(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    const roomCode = gameRoom.roomId;
    const autoPlayer = getAutoTurnPlayer(gameRoom);
    if (!autoPlayer) {
      clearBotTurnTimer(roomCode);
      return;
    }

    if (botTurnTimers.has(roomCode)) {
      return;
    }

    const timeout = setTimeout(() => {
      botTurnTimers.delete(roomCode);
      const latestGameRoom = roomManager.getGameRoom(roomCode);
      if (!latestGameRoom) {
        return;
      }

      const result = runNextBotTurn(latestGameRoom);
      if (!result.ok) {
        io.to(roomCode).emit("error_message", { message: result.error });
        broadcastGameState(latestGameRoom);
        return;
      }

      broadcastGameState(latestGameRoom);
      scheduleBotTurn(latestGameRoom);
    }, BOT_THINK_DELAY_MS);

    botTurnTimers.set(roomCode, timeout);
  }

  function getAutoTurnPlayer(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    if (gameRoom.phase === "ROLE_SELECTION") {
      const player = gameRoom.players.find(
        (candidate) => candidate.id === gameRoom.roleSelectionTurnPlayerId
      );
      return player && (player.isBot || !player.connected) ? player : null;
    }

    if (gameRoom.phase === "ROLE_ACTION") {
      const player = gameRoom.players.find(
        (candidate) => candidate.id === gameRoom.currentTurnPlayerId
      );
      return player?.isBot ? player : null;
    }

    return null;
  }

  function syncLobbyStartCountdown(io: GameServer, room: RoomState) {
    if (room.status !== "LOBBY") {
      clearStartCountdownTimer(room.roomCode);
      broadcastRoomState(io, room);
      return;
    }

    if (!room.startCountdown) {
      roomManager.beginStartCountdown(room.roomCode);
    }

    const latestRoom = roomManager.getRoom(room.roomCode) ?? room;
    if (!latestRoom.startCountdown) {
      clearStartCountdownTimer(latestRoom.roomCode);
      broadcastRoomState(io, latestRoom);
      return;
    }

    scheduleStartCountdown(io, latestRoom);
    broadcastRoomState(io, latestRoom);
  }

  function scheduleStartCountdown(io: GameServer, room: RoomState) {
    clearStartCountdownTimer(room.roomCode);
    if (!room.startCountdown) {
      return;
    }

    const delayMs = Math.max(
      0,
      new Date(room.startCountdown.deadlineAt).getTime() - Date.now()
    );
    const timeout = setTimeout(() => {
      resolveLobbyStartCountdown(io, room.roomCode);
    }, delayMs);
    startCountdownTimers.set(room.roomCode, timeout);
  }

  function resolveLobbyStartCountdown(io: GameServer, roomCode: string) {
    clearStartCountdownTimer(roomCode);
    const result = roomManager.resolveStartCountdown(roomCode);
    if (!result.ok) {
      const room = roomManager.getRoom(roomCode);
      if (room) {
        broadcastRoomState(io, room);
      }
      return;
    }

    broadcastRoomState(io, result.room);
    if (result.started && result.gameRoom) {
      broadcastGameState(result.gameRoom);
      scheduleCrownReveal(result.gameRoom);
      scheduleBotTurn(result.gameRoom);
      console.log(`[room] room ${result.room.roomCode} auto-started after ready countdown`);
    }
  }
}

function clearStartCountdownTimer(roomCode: string) {
  const timer = startCountdownTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    startCountdownTimers.delete(roomCode);
  }
}

function clearCrownRevealTimer(roomCode: string) {
  const timer = crownRevealTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    crownRevealTimers.delete(roomCode);
  }
}
function clearBotTurnTimer(roomCode: string) {
  const timer = botTurnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    botTurnTimers.delete(roomCode);
  }
}

function broadcastRoomState(io: GameServer, room: RoomState) {
  io.to(room.roomCode).emit("room_state", room);
}




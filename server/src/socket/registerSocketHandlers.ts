import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  RoomState,
  ServerToClientEvents,
  SocketData
} from "@zy/shared";
import { createRoomManager } from "../game/roomManager";
import {
  buildDistrict,
  drawDistrictCards,
  endTurn,
  runBotTurns,
  selectRole,
  takeGold,
  useRoleSkill,
  visibleStateForPlayer
} from "../game/gameEngine";

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

const roomManager = createRoomManager();
let nextUid = 100001;

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
      broadcastRoomState(io, result.room);
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
      }
      console.log(`[room] player ${result.player.id} reconnected to room ${result.room.roomCode}`);
    });

    socket.on("set_ready", (payload) => {
      const result = roomManager.setReady(payload);
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      broadcastRoomState(io, result.room);
    });

    socket.on("start_game", (payload) => {
      const result = roomManager.startGame(payload);
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      broadcastRoomState(io, result.room);
      runBotTurns(result.gameRoom);
      broadcastGameState(result.gameRoom);
      console.log(`[room] room ${result.room.roomCode} marked as started`);
    });

    socket.on("add_test_bots", (payload) => {
      const result = roomManager.addTestBots(payload);
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      broadcastRoomState(io, result.room);
    });

    socket.on("select_role", (payload) => {
      const gameRoom = roomManager.getGameRoom(payload.roomCode);
      if (!gameRoom) {
        socket.emit("error_message", { message: "游戏房间不存在。" });
        return;
      }

      const result = selectRole(gameRoom, payload);
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      runBotTurns(gameRoom);
      broadcastGameState(gameRoom);
    });

    socket.on("take_gold", (payload) => {
      handleGameAction(socket, payload.roomCode, () => takeGoldOrError(payload));
    });

    socket.on("draw_district_cards", (payload) => {
      handleGameAction(socket, payload.roomCode, () => drawCardsOrError(payload));
    });

    socket.on("build_district", (payload) => {
      handleGameAction(socket, payload.roomCode, () => buildDistrictOrError(payload));
    });

    socket.on("use_role_skill", (payload) => {
      handleGameAction(socket, payload.roomCode, () => useRoleSkillOrError(payload));
    });

    socket.on("end_turn", (payload) => {
      handleGameAction(socket, payload.roomCode, () => endTurnOrError(payload));
    });

    socket.on("leave_room", (payload) => {
      const result = roomManager.leaveRoom(payload);
      socket.leave(payload.roomCode);
      socket.data.playerId = undefined;
      socket.data.roomCode = undefined;

      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      if (result.room) {
        broadcastRoomState(io, result.room);
      }
    });

    socket.on("disconnect", (reason) => {
      const room = roomManager.markDisconnectedBySocket(socket.id);
      if (room) {
        broadcastRoomState(io, room);
        const gameRoom = roomManager.getGameRoom(room.roomCode);
        if (gameRoom) {
          broadcastGameState(gameRoom);
        }
      }
      console.log(`[socket] player disconnected: ${socket.id} (${reason})`);
    });
  });

  function handleGameAction(
    socket: GameSocket,
    roomCode: string,
    action: () => { ok: boolean; error?: string }
  ) {
    const result = action();
    if (!result.ok) {
      socket.emit("error_message", { message: result.error ?? "操作失败。" });
      return;
    }

    const gameRoom = roomManager.getGameRoom(roomCode);
    if (gameRoom) {
      runBotTurns(gameRoom);
      broadcastGameState(gameRoom);
    }
  }

  function takeGoldOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return takeGold(gameRoom, payload);
  }

  function drawCardsOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return drawDistrictCards(gameRoom, payload);
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
    return buildDistrict(gameRoom, payload);
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
    return useRoleSkill(gameRoom, payload);
  }

  function endTurnOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    return endTurn(gameRoom, payload);
  }

  function broadcastGameState(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    for (const player of gameRoom.players) {
      io.to(player.socketId).emit("game_state", visibleStateForPlayer(gameRoom, player.id));
    }
  }
}

function broadcastRoomState(io: GameServer, room: RoomState) {
  io.to(room.roomCode).emit("room_state", room);
}

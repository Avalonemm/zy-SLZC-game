import type { Server, Socket } from "socket.io";
import type {
  ActionEventPayload,
  ClientToServerEvents,
  GameCommandAck,
  InterServerEvents,
  RoomState,
  ServerToClientEvents,
  SocketData
} from "@zy/shared";
import { createActionEventsFromLogs, createLatestActionEvent } from "../game/actionEvents";
import { loadDistrictCards } from "../game/cardData";
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
  useDistrictEffect,
  resolveGraveyardChoice,
  visibleStateForPlayer
} from "../game/gameEngine";
import { BOT_THINK_DELAY_MS } from "../game/gameConfig";
import { resolveExpiredTurn } from "../game/timers";
import { createRoomSnapshotStore } from "../game/roomSnapshotStore";

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

type ActionResult = { ok: boolean; error?: string; actionEvents?: ActionEventPayload[] };

const roomSnapshotStore = createRoomSnapshotStore();
const roomManager = createRoomManager(roomSnapshotStore.load());
let nextUid = 100001;
const botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const crownRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();
const socketRateWindows = new Map<string, Map<string, number[]>>();
const cleanupTimer = setInterval(() => {
  const removed = roomManager.cleanupInactiveRooms();
  if (removed.length > 0) persistRoomSnapshot();
}, 60 * 60 * 1000);
cleanupTimer.unref();

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
        playerId: result.playerId,
        reconnectToken: result.reconnectToken
      });
      broadcastRoomState(io, result.room);
      console.log(`[room] ${payload.playerName} created room ${result.room.roomCode}`);
    });

    socket.on("create_tutorial_room", (payload) => {
      const result = roomManager.createRoom({
        uid: socket.data.uid ?? 0,
        socketId: socket.id,
        playerName: payload.playerName
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      for (let index = 0; index < 3; index += 1) {
        const botResult = roomManager.addTestBots({
          roomCode: result.room.roomCode,
          playerId: result.playerId
        });
        if (!botResult.ok) {
          socket.emit("error_message", { message: botResult.error });
          return;
        }
      }

      socket.data.playerId = result.playerId;
      socket.data.roomCode = result.room.roomCode;
      socket.join(result.room.roomCode);
      socket.emit("room_created", {
        roomCode: result.room.roomCode,
        playerId: result.playerId,
        reconnectToken: result.reconnectToken
      });
      broadcastRoomState(io, result.room);
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
        playerId: result.playerId,
        reconnectToken: result.reconnectToken
      });
      broadcastRoomState(io, result.room);
      console.log(`[room] ${payload.playerName} joined room ${result.room.roomCode}`);
    });

    socket.on("reconnect_room", (payload) => {
      const result = roomManager.reconnectRoom({
        roomCode: payload.roomCode,
        playerId: payload.playerId,
        reconnectToken: payload.reconnectToken,
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
        playerId: result.player.id,
        reconnectToken: result.reconnectToken
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

      broadcastRoomState(io, result.room);
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
      broadcastGameState(result.gameRoom);
      scheduleCrownReveal(result.gameRoom);
      scheduleBotTurn(result.gameRoom);
      console.log(`[room] room ${result.room.roomCode} marked as started`);
    });

    socket.on("request_rematch", (payload) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        socket.emit("error_message", { message: socketPlayer.error });
        return;
      }

      const result = roomManager.resetForRematch({
        roomCode: payload.roomCode,
        playerId: socketPlayer.playerId
      });
      if (!result.ok) {
        socket.emit("error_message", { message: result.error });
        return;
      }

      clearCrownRevealTimer(result.room.roomCode);
      clearBotTurnTimer(result.room.roomCode);
      io.to(result.room.roomCode).emit("returned_to_ready_room", {
        roomCode: result.room.roomCode
      });
      broadcastRoomState(io, result.room);
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

      broadcastRoomState(io, result.room);
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

      broadcastRoomState(io, result.room);
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

      broadcastRoomState(io, result.room);
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

      broadcastRoomState(io, result.room);
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

      broadcastRoomState(io, result.room);
    });

    socket.on("select_role", (payload, ack) => {
      const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
      if (!socketPlayer.ok) {
        reportGameCommandError(socket, ack, socketPlayer.error);
        return;
      }

      const gameRoom = roomManager.getGameRoom(payload.roomCode);
      if (!gameRoom) {
        reportGameCommandError(socket, ack, "游戏房间不存在。");
        return;
      }

      const result = selectRole(gameRoom, {
        playerId: socketPlayer.playerId,
        roleId: payload.roleId
      });
      if (!result.ok) {
        reportGameCommandError(socket, ack, result.error ?? "操作失败。");
        return;
      }

      broadcastActionEvent(
        createLatestActionEvent(gameRoom, {
          actorPlayerId: socketPlayer.playerId
        })
      );
      broadcastGameState(gameRoom);
      scheduleBotTurn(gameRoom);
      ack?.({ ok: true });
    });

    socket.on("take_gold", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        takeGoldOrError({ roomCode: payload.roomCode, playerId })
      , ack);
    });

    socket.on("draw_district_cards", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        drawCardsOrError({ roomCode: payload.roomCode, playerId })
      , ack);
    });

    socket.on("choose_drawn_district_card", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        chooseDrawnCardOrError({
          roomCode: payload.roomCode,
          playerId,
          districtCardId: payload.districtCardId
        }),
        ack
      );
    });

    socket.on("build_district", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        buildDistrictOrError({
          roomCode: payload.roomCode,
          playerId,
          districtCardId: payload.districtCardId
        }),
        ack
      );
    });

    socket.on("use_role_skill", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        useRoleSkillOrError({
          ...payload,
          playerId
        }),
        ack
      );
    });


    socket.on("use_district_effect", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        useDistrictEffectOrError({
          ...payload,
          playerId
        }),
        ack
      );
    });

    socket.on("resolve_graveyard_choice", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        resolveGraveyardChoiceOrError({
          roomCode: payload.roomCode,
          playerId,
          buyBack: payload.buyBack
        }),
        ack
      );
    });
    socket.on("end_turn", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        endTurnOrError({ roomCode: payload.roomCode, playerId })
      , ack);
    });

    socket.on("skip_current_offline_player", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, (playerId) =>
        skipOfflineCurrentPlayerOrError({
          roomCode: payload.roomCode,
          requesterPlayerId: playerId
        }),
        ack
      );
    });

    socket.on("resolve_turn_timeout", (payload, ack) => {
      handleGameAction(socket, payload.roomCode, () =>
        resolveTurnTimeoutOrError({ roomCode: payload.roomCode })
      , ack);
    });

    if (process.env.ZY_ENABLE_UI_QA === "1") {
      socket.on("qa_configure_game", (payload, ack) => {
        const socketPlayer = assertSocketPlayer(socket, payload.roomCode);
        if (!socketPlayer.ok || socketPlayer.playerId !== payload.playerId) {
          reportGameCommandError(socket, ack, socketPlayer.ok ? "仅当前玩家可配置验收场景。" : socketPlayer.error);
          return;
        }
        const gameRoom = roomManager.getGameRoom(payload.roomCode);
        if (!gameRoom) {
          reportGameCommandError(socket, ack, "游戏房间不存在。");
          return;
        }
        const cards = loadDistrictCards();
        const cloneCards = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => ({
          ...cards[index % cards.length],
          id: `qa-${prefix}-${index}-${cards[index % cards.length].id}`
        }));
        if (payload.ensureSelectedRoleId) {
          const existingRolePlayer = gameRoom.players.find(
            (player) => player.selectedRoleId === payload.ensureSelectedRoleId
          );
          if (!existingRolePlayer) {
            const target = gameRoom.players.find((player) => player.id !== payload.playerId);
            if (target) target.selectedRoleId = payload.ensureSelectedRoleId;
          }
        }
        if (
          payload.selfHandCount !== undefined ||
          payload.opponentHandCount !== undefined ||
          payload.cityCount !== undefined
        ) {
          const selfHandCount = Math.max(0, Math.min(40, Math.floor(payload.selfHandCount ?? 4)));
          const opponentHandCount = Math.max(0, Math.min(40, Math.floor(payload.opponentHandCount ?? 4)));
          const cityCount = Math.max(0, Math.min(8, Math.floor(payload.cityCount ?? 0)));
          for (const player of gameRoom.players) {
            player.gold = 99;
            player.hand = cloneCards(
              player.id === payload.playerId ? selfHandCount : opponentHandCount,
              `${player.id}-hand`
            );
            player.city = cloneCards(cityCount, `${player.id}-city`);
          }
        }
        broadcastGameState(gameRoom);
        ack?.({ ok: true });
      });
    }

    socket.on("send_chat_message", (payload) => {
      if (!allowSocketAction(socket.id, "chat", 5, 5_000)) {
        socket.emit("error_message", { message: "发送过于频繁，请稍后再试。" });
        return;
      }
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
        broadcastRoomState(io, result.room);
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
      socketRateWindows.delete(socket.id);
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
    action: (playerId: string) => ActionResult,
    ack?: GameCommandAck
  ) {
    if (!allowSocketAction(socket.id, "game", 30, 2_000)) {
      reportGameCommandError(socket, ack, "操作过于频繁，请稍后再试。");
      return;
    }
    const socketPlayer = assertSocketPlayer(socket, roomCode);
    if (!socketPlayer.ok) {
      reportGameCommandError(socket, ack, socketPlayer.error);
      return;
    }

    const result = action(socketPlayer.playerId);
    if (!result.ok) {
      reportGameCommandError(socket, ack, result.error ?? "操作失败。");
      return;
    }

    broadcastActionEvents(result.actionEvents);
    const gameRoom = roomManager.getGameRoom(roomCode);
    if (gameRoom) {
      broadcastGameState(gameRoom);
      scheduleBotTurn(gameRoom);
    }
    ack?.({ ok: true });
  }

  function reportGameCommandError(
    socket: GameSocket,
    ack: GameCommandAck | undefined,
    message: string
  ) {
    if (ack) {
      ack({ ok: false, error: message });
      return;
    }
    socket.emit("error_message", { message });
  }

  function takeGoldOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, takeGold(gameRoom, payload), payload.playerId, previousLogId);
  }

  function drawCardsOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, drawDistrictCards(gameRoom, payload), payload.playerId, previousLogId);
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
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(
      gameRoom,
      chooseDrawnDistrictCard(gameRoom, payload),
      payload.playerId,
      previousLogId
    );
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
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, buildDistrict(gameRoom, payload), payload.playerId, previousLogId);
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
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, useRoleSkill(gameRoom, payload), payload.playerId, previousLogId);
  }


  function useDistrictEffectOrError(payload: {
    roomCode: string;
    playerId: string;
    districtCardId: string;
    discardCardId?: string;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, useDistrictEffect(gameRoom, payload), payload.playerId, previousLogId);
  }

  function resolveGraveyardChoiceOrError(payload: {
    roomCode: string;
    playerId: string;
    buyBack: boolean;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(
      gameRoom,
      resolveGraveyardChoice(gameRoom, payload),
      payload.playerId,
      previousLogId
    );
  }
  function endTurnOrError(payload: { roomCode: string; playerId: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(gameRoom, endTurn(gameRoom, payload), payload.playerId, previousLogId);
  }

  function skipOfflineCurrentPlayerOrError(payload: {
    roomCode: string;
    requesterPlayerId: string;
  }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }
    const previousLogId = gameRoom.gameLog[0]?.id;
    return withActionEvents(
      gameRoom,
      skipOfflineCurrentPlayer(gameRoom, {
        requesterPlayerId: payload.requesterPlayerId
      }),
      payload.requesterPlayerId,
      previousLogId
    );
  }

  function resolveTurnTimeoutOrError(payload: { roomCode: string }) {
    const gameRoom = roomManager.getGameRoom(payload.roomCode);
    if (!gameRoom) {
      return { ok: false, error: "游戏房间不存在。" };
    }

    const actorPlayerId = gameRoom.turnTimer?.playerId ?? "";
    const previousLogId = gameRoom.gameLog[0]?.id;
    const result = resolveExpiredTurn(gameRoom);
    if (!result.ok) {
      return result;
    }

    if (!result.timedOut) {
      return { ...result, actionEvents: [] };
    }

    return withActionEvents(gameRoom, result, actorPlayerId, previousLogId);
  }

  function withActionEvents<T extends ActionResult>(
    gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>,
    result: T,
    actorPlayerId: string,
    previousLogId: string | undefined
  ): T {
    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      actionEvents: createActionEventsFromLogs(
        gameRoom,
        newLogsSince(gameRoom, previousLogId),
        { actorPlayerId }
      )
    };
  }

  function newLogsSince(
    gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>,
    previousLogId: string | undefined
  ) {
    if (!previousLogId) {
      return gameRoom.gameLog[0] ? [gameRoom.gameLog[0]] : [];
    }

    const previousIndex = gameRoom.gameLog.findIndex((log) => log.id === previousLogId);
    const newLogs = previousIndex >= 0
      ? gameRoom.gameLog.slice(0, previousIndex)
      : gameRoom.gameLog;
    return [...newLogs].reverse();
  }

  function broadcastActionEvent(event: ActionEventPayload | null | undefined) {
    if (!event || event.visibility !== "public") {
      return;
    }

    io.to(event.roomCode).emit("action_event", event);
  }

  function broadcastActionEvents(events: ActionEventPayload[] | null | undefined) {
    for (const event of events ?? []) {
      broadcastActionEvent(event);
    }
  }

  function broadcastGameState(gameRoom: NonNullable<ReturnType<typeof roomManager.getGameRoom>>) {
    for (const player of gameRoom.players) {
      if (!player.connected) {
        continue;
      }

      io.to(player.socketId).emit("game_state", visibleStateForPlayer(gameRoom, player.id));
    }
    persistRoomSnapshot();
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

      const actorPlayerId = getAutoTurnPlayer(latestGameRoom)?.id ?? "";
      const previousLogId = latestGameRoom.gameLog[0]?.id;
      const result = runNextBotTurn(latestGameRoom);
      if (!result.ok) {
        io.to(roomCode).emit("error_message", { message: result.error });
        broadcastGameState(latestGameRoom);
        return;
      }

      broadcastActionEvents(
        createActionEventsFromLogs(
          latestGameRoom,
          newLogsSince(latestGameRoom, previousLogId),
          { actorPlayerId }
        )
      );
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
  persistRoomSnapshot();
}

function allowSocketAction(socketId: string, channel: string, limit: number, windowMs: number) {
  const now = Date.now();
  const channels = socketRateWindows.get(socketId) ?? new Map<string, number[]>();
  const recent = (channels.get(channel) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  channels.set(channel, recent);
  socketRateWindows.set(socketId, channels);
  return true;
}

function persistRoomSnapshot() {
  roomSnapshotStore.save(roomManager.exportSnapshot());
}




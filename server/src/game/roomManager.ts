import type { GameRoom, LobbyPlayer, RoomState } from "@zy/shared";
import { randomUUID } from "node:crypto";
import { initializeGameRoom } from "./gameSetup";

type Ok<T> = T & { ok: true };
type Fail = { ok: false; error: string };
type Result<T> = Ok<T> | Fail;

type CreateRoomInput = {
  uid: number;
  socketId: string;
  playerName: string;
};

type JoinRoomInput = CreateRoomInput & {
  roomCode: string;
};

type PlayerActionInput = {
  roomCode: string;
  playerId: string;
};

type ReconnectRoomInput = PlayerActionInput & {
  socketId: string;
};

type ReadyInput = PlayerActionInput & {
  isReady: boolean;
};

const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS = 4;

export function createRoomManager() {
  const rooms = new Map<string, RoomState>();
  const gameRooms = new Map<string, GameRoom>();

  function createRoom(input: CreateRoomInput): Result<{
    room: RoomState;
    playerId: string;
  }> {
    const nameResult = normalizePlayerName(input.playerName);
    if (!nameResult.ok) {
      return nameResult;
    }

    const roomCode = generateUniqueRoomCode(rooms);
    const playerId = randomUUID();
    const host: LobbyPlayer = {
      id: playerId,
      uid: input.uid,
      socketId: input.socketId,
      name: nameResult.name,
      connected: true,
      isHost: true,
      isReady: true,
      isBot: false
    };
    const room: RoomState = {
      roomCode,
      hostPlayerId: playerId,
      status: "LOBBY",
      players: [host],
      maxPlayers: MAX_PLAYERS,
      createdAt: new Date().toISOString()
    };

    rooms.set(roomCode, room);

    return {
      ok: true,
      room,
      playerId
    };
  }

  function joinRoom(input: JoinRoomInput): Result<{
    room: RoomState;
    playerId: string;
  }> {
    const roomCode = normalizeRoomCode(input.roomCode);
    const room = rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: "房间不存在。" };
    }

    if (room.status !== "LOBBY") {
      return { ok: false, error: "游戏已开始，不能加入。" };
    }

    if (room.players.length >= MAX_PLAYERS) {
      return { ok: false, error: "房间已满，最多 4 人。" };
    }

    const nameResult = normalizePlayerName(input.playerName);
    if (!nameResult.ok) {
      return nameResult;
    }

    const playerId = randomUUID();
    room.players.push({
      id: playerId,
      uid: input.uid,
      socketId: input.socketId,
      name: nameResult.name,
      connected: true,
      isHost: false,
      isReady: false,
      isBot: false
    });

    return {
      ok: true,
      room,
      playerId
    };
  }

  function addTestBots(input: PlayerActionInput): Result<{ room: RoomState }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以添加测试人机。" };
    }

    if (playerResult.room.status !== "LOBBY") {
      return { ok: false, error: "游戏已开始，不能添加测试人机。" };
    }

    if (playerResult.room.players.length >= MAX_PLAYERS) {
      return { ok: false, error: "房间已满，不能继续添加测试人机。" };
    }

    const botIndex = playerResult.room.players.filter((player) => player.isBot).length + 1;
    playerResult.room.players.push({
      id: randomUUID(),
      uid: 900000 + botIndex,
      socketId: `bot-${playerResult.room.roomCode}-${botIndex}`,
      name: `测试人机 ${botIndex}`,
      connected: true,
      isHost: false,
      isReady: true,
      isBot: true
    });

    return { ok: true, room: playerResult.room };
  }

  function setReady(input: ReadyInput): Result<{ room: RoomState }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (playerResult.room.status !== "LOBBY") {
      return { ok: false, error: "游戏已开始，不能修改准备状态。" };
    }

    if (playerResult.player.isHost) {
      playerResult.player.isReady = true;
    } else {
      playerResult.player.isReady = input.isReady;
    }

    return { ok: true, room: playerResult.room };
  }

  function startGame(input: PlayerActionInput): Result<{
    room: RoomState;
    gameRoom: GameRoom;
  }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以开始游戏。" };
    }

    if (playerResult.room.status !== "LOBBY" || gameRooms.has(playerResult.room.roomCode)) {
      return { ok: false, error: "游戏已经开始或结束，不能重复开始。" };
    }

    if (
      playerResult.room.players.length < MIN_PLAYERS_TO_START ||
      playerResult.room.players.length > MAX_PLAYERS
    ) {
      return { ok: false, error: "需要 2-4 名玩家才能开始。" };
    }

    if (playerResult.room.players.some((player) => !player.isReady)) {
      return { ok: false, error: "还有玩家未准备。" };
    }

    playerResult.room.status = "STARTED";
    const gameRoom = initializeGameRoom(playerResult.room);
    gameRooms.set(playerResult.room.roomCode, gameRoom);

    return { ok: true, room: playerResult.room, gameRoom };
  }

  function leaveRoom(input: PlayerActionInput): Result<{ room?: RoomState }> {
    const room = rooms.get(normalizeRoomCode(input.roomCode));
    if (!room) {
      return { ok: false, error: "房间不存在。" };
    }

    const playerIndex = room.players.findIndex((player) => player.id === input.playerId);
    if (playerIndex === -1) {
      return { ok: false, error: "玩家不在房间中。" };
    }

    const gameRoom = gameRooms.get(room.roomCode);
    if (room.status !== "LOBBY" || gameRoom) {
      const player = room.players[playerIndex];
      player.connected = false;
      const gamePlayer = gameRoom?.players.find((candidate) => candidate.id === input.playerId);
      if (gamePlayer) {
        gamePlayer.connected = false;
      }

      if (player.isHost) {
        transferHostToNextConnectedPlayer(room, gameRoom, player.id);
      }

      return { ok: true, room };
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    if (room.players.length === 0) {
      rooms.delete(room.roomCode);
      return { ok: true };
    }

    if (removedPlayer.isHost) {
      const nextHost = room.players[0];
      nextHost.isHost = true;
      nextHost.isReady = true;
      room.hostPlayerId = nextHost.id;
    }

    return { ok: true, room };
  }

  function reconnectRoom(input: ReconnectRoomInput): Result<{
    room: RoomState;
    player: LobbyPlayer;
    gameRoom?: GameRoom;
  }> {
    const room = rooms.get(normalizeRoomCode(input.roomCode));
    if (!room) {
      return { ok: false, error: "无法恢复房间，房间不存在。" };
    }

    const player = room.players.find((candidate) => candidate.id === input.playerId);
    if (!player) {
      return { ok: false, error: "无法恢复房间，玩家身份不存在。" };
    }

    if (player.isBot) {
      return { ok: false, error: "测试人机不能重连。" };
    }

    player.socketId = input.socketId;
    player.connected = true;

    const gameRoom = gameRooms.get(room.roomCode);
    const gamePlayer = gameRoom?.players.find((candidate) => candidate.id === input.playerId);
    if (gamePlayer) {
      gamePlayer.socketId = input.socketId;
      gamePlayer.connected = true;
    }

    return { ok: true, room, player, gameRoom };
  }

  function markDisconnectedBySocket(socketId: string): RoomState | null {
    let affectedRoom: RoomState | null = null;

    for (const room of rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socketId);
      if (player) {
        player.connected = false;
        affectedRoom = room;
        break;
      }
    }

    for (const gameRoom of gameRooms.values()) {
      const player = gameRoom.players.find((candidate) => candidate.socketId === socketId);
      if (player) {
        player.connected = false;
        break;
      }
    }

    return affectedRoom;
  }

  function getRoom(roomCode: string): RoomState | undefined {
    return rooms.get(normalizeRoomCode(roomCode));
  }

  function getGameRoom(roomCode: string): GameRoom | undefined {
    return gameRooms.get(normalizeRoomCode(roomCode));
  }

  function findPlayer(input: PlayerActionInput): Result<{
    room: RoomState;
    player: LobbyPlayer;
  }> {
    const room = rooms.get(normalizeRoomCode(input.roomCode));
    if (!room) {
      return { ok: false, error: "房间不存在。" };
    }

    const player = room.players.find((candidate) => candidate.id === input.playerId);
    if (!player) {
      return { ok: false, error: "玩家不在房间中。" };
    }

    return {
      ok: true,
      room,
      player
    };
  }

  return {
    createRoom,
    joinRoom,
    setReady,
    startGame,
    addTestBots,
    leaveRoom,
    reconnectRoom,
    markDisconnectedBySocket,
    getRoom,
    getGameRoom
  };
}

function transferHostToNextConnectedPlayer(
  room: RoomState,
  gameRoom: GameRoom | undefined,
  previousHostPlayerId: string
) {
  const nextHost = room.players.find(
    (candidate) => candidate.id !== previousHostPlayerId && candidate.connected
  );
  if (!nextHost) {
    return;
  }

  for (const player of room.players) {
    player.isHost = player.id === nextHost.id;
  }
  nextHost.isReady = true;
  room.hostPlayerId = nextHost.id;

  if (gameRoom) {
    for (const player of gameRoom.players) {
      player.isHost = player.id === nextHost.id;
    }
    gameRoom.hostPlayerId = nextHost.id;
  }
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

function normalizePlayerName(name: string): Result<{ name: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "请输入昵称。" };
  }

  if (trimmed.length > 16) {
    return { ok: false, error: "昵称最多 16 个字符。" };
  }

  return { ok: true, name: trimmed };
}

function generateUniqueRoomCode(rooms: Map<string, RoomState>) {
  let roomCode = generateRoomCode();
  while (rooms.has(roomCode)) {
    roomCode = generateRoomCode();
  }

  return roomCode;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

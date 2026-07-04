import type { ChatMessage, GameRoom, LobbyPlayer, RoomSettings, RoomState } from "@zy/shared";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_END_CITY_SIZE,
  DEFAULT_TURN_TIMEOUT_SECONDS,
  FUTURE_MAX_PLAYERS,
  MAX_END_CITY_SIZE,
  MAX_PLAYERS,
  MAX_TURN_TIMEOUT_SECONDS,
  MIN_END_CITY_SIZE,
  MIN_PLAYERS_TO_START,
  MIN_TURN_TIMEOUT_SECONDS,
  START_COUNTDOWN_SECONDS,
  STANDARD_ROLE_IDS,
  TEST_BOT_UID_BASE,
  currentPlayerRangeText
} from "./gameConfig";
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

type RemoveTestBotInput = PlayerActionInput & {
  targetBotPlayerId: string;
};

type TargetPlayerInput = PlayerActionInput & {
  targetPlayerId: string;
};

type UpdateRoomSettingsInput = PlayerActionInput & {
  settings: Partial<RoomSettings>;
};

type ChatInput = PlayerActionInput & {
  message: string;
};

const MAX_CHAT_MESSAGES = 50;
const MAX_CHAT_MESSAGE_LENGTH = 200;

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
      minPlayers: MIN_PLAYERS_TO_START,
      maxPlayers: MAX_PLAYERS,
      futureMaxPlayers: FUTURE_MAX_PLAYERS,
      settings: createDefaultRoomSettings(),
      startCountdown: null,
      createdAt: new Date().toISOString(),
      chatMessages: []
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
      return { ok: false, error: `房间已满，当前测试版最多 ${MAX_PLAYERS} 人。` };
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
    room.startCountdown = null;

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
      return { ok: false, error: `房间已满，当前测试版最多 ${MAX_PLAYERS} 人。` };
    }

    const botIndex = playerResult.room.players.filter((player) => player.isBot).length + 1;
    playerResult.room.players.push({
      id: randomUUID(),
      uid: TEST_BOT_UID_BASE + botIndex,
      socketId: `bot-${playerResult.room.roomCode}-${botIndex}`,
      name: `测试人机 ${botIndex}`,
      connected: true,
      isHost: false,
      isReady: true,
      isBot: true
    });
    playerResult.room.startCountdown = null;

    return { ok: true, room: playerResult.room };
  }

  function removeTestBot(input: RemoveTestBotInput): Result<{ room: RoomState }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以删除测试人机。" };
    }

    if (playerResult.room.status !== "LOBBY") {
      return { ok: false, error: "游戏已开始，不能删除测试人机。" };
    }

    const botIndex = playerResult.room.players.findIndex(
      (player) => player.id === input.targetBotPlayerId
    );
    if (botIndex === -1) {
      return { ok: false, error: "测试人机不存在。" };
    }

    if (!playerResult.room.players[botIndex].isBot) {
      return { ok: false, error: "只能删除测试人机。" };
    }

    playerResult.room.players.splice(botIndex, 1);
    playerResult.room.startCountdown = null;
    return { ok: true, room: playerResult.room };
  }

  function kickPlayer(input: TargetPlayerInput): Result<{ room: RoomState; kickedPlayer: LobbyPlayer }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以踢出玩家。" };
    }

    if (playerResult.room.status !== "LOBBY") {
      return { ok: false, error: "游戏开始后不能踢出玩家。" };
    }

    if (input.targetPlayerId === input.playerId) {
      return { ok: false, error: "房主不能踢出自己。" };
    }

    const targetIndex = playerResult.room.players.findIndex(
      (player) => player.id === input.targetPlayerId
    );
    if (targetIndex === -1) {
      return { ok: false, error: "目标玩家不在房间中。" };
    }

    const [kickedPlayer] = playerResult.room.players.splice(targetIndex, 1);
    playerResult.room.startCountdown = null;
    return { ok: true, room: playerResult.room, kickedPlayer };
  }

  function transferHost(input: TargetPlayerInput): Result<{ room: RoomState }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以移交房主。" };
    }

    if (input.targetPlayerId === input.playerId) {
      return { ok: false, error: "目标玩家已经是房主。" };
    }

    const targetPlayer = playerResult.room.players.find(
      (player) => player.id === input.targetPlayerId
    );
    if (!targetPlayer) {
      return { ok: false, error: "目标玩家不在房间中。" };
    }

    if (targetPlayer.isBot) {
      return { ok: false, error: "不能把房主移交给测试人机。" };
    }

    if (!targetPlayer.connected) {
      return { ok: false, error: "不能把房主移交给离线玩家。" };
    }

    setHost(playerResult.room, targetPlayer.id);
    playerResult.room.startCountdown = null;
    return { ok: true, room: playerResult.room };
  }

  function updateRoomSettings(input: UpdateRoomSettingsInput): Result<{ room: RoomState }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    if (!playerResult.player.isHost) {
      return { ok: false, error: "只有房主可以修改房间设置。" };
    }

    if (playerResult.room.status !== "LOBBY") {
      return { ok: false, error: "游戏开始后不能修改房间设置。" };
    }

    const nextSettings = normalizeRoomSettings(playerResult.room.settings, input.settings);
    if (!nextSettings.ok) {
      return nextSettings;
    }

    playerResult.room.settings = nextSettings.settings;
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

    if (!isRoomReadyToStart(playerResult.room)) {
      playerResult.room.startCountdown = null;
    }

    return { ok: true, room: playerResult.room };
  }

  function addChatMessage(input: ChatInput): Result<{
    room: RoomState;
    message: ChatMessage;
  }> {
    const playerResult = findPlayer(input);
    if (!playerResult.ok) {
      return playerResult;
    }

    const message = normalizeChatMessage(input.message);
    if (!message.ok) {
      return message;
    }

    const chatMessage: ChatMessage = {
      id: randomUUID(),
      roomCode: playerResult.room.roomCode,
      playerId: playerResult.player.id,
      playerName: playerResult.player.name,
      message: message.message,
      createdAt: new Date().toISOString()
    };
    playerResult.room.chatMessages.push(chatMessage);
    if (playerResult.room.chatMessages.length > MAX_CHAT_MESSAGES) {
      playerResult.room.chatMessages.splice(
        0,
        playerResult.room.chatMessages.length - MAX_CHAT_MESSAGES
      );
    }

    return {
      ok: true,
      room: playerResult.room,
      message: chatMessage
    };
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
      return {
        ok: false,
        error: `当前测试版需要 ${currentPlayerRangeText()} 名玩家才能开始。`
      };
    }

    if (!hasConnectedRealPlayer(playerResult.room)) {
      return { ok: false, error: "房间内至少需要一名真人玩家才能开始游戏。" };
    }

    if (playerResult.room.players.some((player) => !player.isReady)) {
      return { ok: false, error: "还有玩家未准备。" };
    }

    playerResult.room.status = "STARTED";
    playerResult.room.startCountdown = null;
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

    room.startCountdown = null;
    return { ok: true, room };
  }

  function beginStartCountdown(
    roomCodeInput: string,
    now = new Date()
  ): Result<{ room: RoomState }> {
    const room = rooms.get(normalizeRoomCode(roomCodeInput));
    if (!room) {
      return { ok: false, error: "房间不存在。" };
    }

    if (room.status !== "LOBBY") {
      return { ok: false, error: "游戏已经开始，不能启动开局倒计时。" };
    }

    if (!isRoomReadyToStart(room)) {
      room.startCountdown = null;
      return { ok: false, error: "开局条件还未满足。" };
    }

    if (room.startCountdown) {
      return { ok: true, room };
    }

    const seconds = room.settings.startCountdownSeconds;
    const startedAt = now.toISOString();
    const deadlineAt = new Date(now.getTime() + seconds * 1000).toISOString();
    room.startCountdown = {
      startedAt,
      deadlineAt,
      seconds
    };

    return { ok: true, room };
  }

  function resolveStartCountdown(
    roomCodeInput: string,
    now = new Date()
  ): Result<{ room: RoomState; started: boolean; gameRoom?: GameRoom }> {
    const room = rooms.get(normalizeRoomCode(roomCodeInput));
    if (!room) {
      return { ok: false, error: "房间不存在。" };
    }

    if (!room.startCountdown) {
      return { ok: true, room, started: false };
    }

    if (!isRoomReadyToStart(room)) {
      room.startCountdown = null;
      return { ok: true, room, started: false };
    }

    if (now.getTime() < new Date(room.startCountdown.deadlineAt).getTime()) {
      return { ok: true, room, started: false };
    }

    const startResult = startGame({
      roomCode: room.roomCode,
      playerId: room.hostPlayerId
    });
    if (!startResult.ok) {
      room.startCountdown = null;
      return startResult;
    }

    return {
      ok: true,
      room: startResult.room,
      started: true,
      gameRoom: startResult.gameRoom
    };
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
        if (room.status === "LOBBY") {
          room.startCountdown = null;
        }
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
    removeTestBot,
    kickPlayer,
    transferHost,
    updateRoomSettings,
    beginStartCountdown,
    resolveStartCountdown,
    addChatMessage,
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

function setHost(room: RoomState, hostPlayerId: string) {
  for (const player of room.players) {
    player.isHost = player.id === hostPlayerId;
    if (player.isHost) {
      player.isReady = true;
    }
  }
  room.hostPlayerId = hostPlayerId;
}

function isRoomReadyToStart(room: RoomState) {
  return (
    room.status === "LOBBY" &&
    countConnectedRealPlayers(room) >= room.minPlayers &&
    room.players.length >= room.minPlayers &&
    room.players.length <= room.maxPlayers &&
    room.players.every((player) => player.isReady && player.connected)
  );
}

function hasConnectedRealPlayer(room: RoomState) {
  return countConnectedRealPlayers(room) > 0;
}

function countConnectedRealPlayers(room: RoomState) {
  return room.players.filter((player) => !player.isBot && player.connected).length;
}

function createDefaultRoomSettings(): RoomSettings {
  return {
    startCountdownSeconds: START_COUNTDOWN_SECONDS,
    turnTimeoutSeconds: DEFAULT_TURN_TIMEOUT_SECONDS,
    endCitySize: DEFAULT_END_CITY_SIZE,
    enabledRoleIds: [...STANDARD_ROLE_IDS],
    enableFaceUpRoleDiscard: true,
    enableFaceDownRoleDiscard: true,
    drawMode: "draw2Choose1",
    roleRulePreset: "standard4Player"
  };
}

function normalizeRoomSettings(
  currentSettings: RoomSettings,
  nextSettings: Partial<RoomSettings>
): Result<{ settings: RoomSettings }> {
  const settings = {
    ...currentSettings
  };

  if (nextSettings.turnTimeoutSeconds !== undefined) {
    const seconds = Math.floor(nextSettings.turnTimeoutSeconds);
    if (
      !Number.isFinite(seconds) ||
      seconds < MIN_TURN_TIMEOUT_SECONDS ||
      seconds > MAX_TURN_TIMEOUT_SECONDS
    ) {
      return {
        ok: false,
        error: `每轮等待时间需要在 ${MIN_TURN_TIMEOUT_SECONDS}-${MAX_TURN_TIMEOUT_SECONDS} 秒之间。`
      };
    }
    settings.turnTimeoutSeconds = seconds;
  }

  if (nextSettings.startCountdownSeconds !== undefined) {
    settings.startCountdownSeconds = START_COUNTDOWN_SECONDS;
  }

  if (nextSettings.endCitySize !== undefined) {
    const endCitySize = Math.floor(nextSettings.endCitySize);
    if (
      !Number.isFinite(endCitySize) ||
      endCitySize < MIN_END_CITY_SIZE ||
      endCitySize > MAX_END_CITY_SIZE
    ) {
      return {
        ok: false,
        error: `结束建筑数必须在 ${MIN_END_CITY_SIZE}-${MAX_END_CITY_SIZE} 之间。`
      };
    }
    settings.endCitySize = endCitySize;
  }

  if (nextSettings.enabledRoleIds !== undefined) {
    const enabledRoleIds = [...new Set(nextSettings.enabledRoleIds)];
    const knownRoleIds = new Set<string>(STANDARD_ROLE_IDS);
    if (
      enabledRoleIds.length === 0 ||
      enabledRoleIds.some((roleId) => !knownRoleIds.has(roleId))
    ) {
      return { ok: false, error: "启用角色包含未知角色。" };
    }

    if (enabledRoleIds.length < MIN_PLAYERS_TO_START) {
      return { ok: false, error: "启用角色数量不能少于最小开局人数。" };
    }

    settings.enabledRoleIds = enabledRoleIds;
  }

  if (nextSettings.enableFaceUpRoleDiscard !== undefined) {
    settings.enableFaceUpRoleDiscard = Boolean(nextSettings.enableFaceUpRoleDiscard);
  }

  if (nextSettings.enableFaceDownRoleDiscard !== undefined) {
    settings.enableFaceDownRoleDiscard = Boolean(nextSettings.enableFaceDownRoleDiscard);
  }

  if (nextSettings.drawMode !== undefined && nextSettings.drawMode !== "draw2Choose1") {
    return { ok: false, error: "当前只支持抽 2 选 1。" };
  }
  settings.drawMode = "draw2Choose1";
  settings.roleRulePreset = "standard4Player";

  return { ok: true, settings };
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

function normalizeChatMessage(message: string): Result<{ message: string }> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, error: "聊天内容不能为空。" };
  }

  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { ok: false, error: `聊天内容最多 ${MAX_CHAT_MESSAGE_LENGTH} 个字符。` };
  }

  return { ok: true, message: trimmed };
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

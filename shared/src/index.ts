export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type ServerStatusPayload = {
  message: string;
  socketId: string;
  connectedAt: string;
  uid: number;
};

export type RoomStatus = "LOBBY" | "STARTED";

export type LobbyPlayer = {
  id: string;
  uid: number;
  socketId: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  maxPlayers: number;
  createdAt: string;
};

export type RoomCommandResult = {
  roomCode: string;
  playerId: string;
};

export type GamePhase =
  | "LOBBY"
  | "GAME_START"
  | "ROLE_SELECTION"
  | "ROLE_ACTION"
  | "ROUND_END"
  | "SCORING"
  | "ENDED";

export type CardEffectParams = Record<string, string | number | boolean | string[] | number[]>;

export type RoleCard = {
  id: string;
  order: number;
  name: string;
  description: string;
  effectType: string;
  effectParams: CardEffectParams;
};

export type DistrictColor = "yellow" | "blue" | "green" | "red" | "purple";

export type DistrictCard = {
  id: string;
  name: string;
  cost: number;
  color: DistrictColor;
  score: number;
  description: string;
  effectType: string;
  effectParams: CardEffectParams;
};

export type GameLog = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export type TurnState = {
  playerId: string;
  resourceActionTaken: boolean;
  buildsUsed: number;
  maxBuilds: number;
};

export type RoleEffectState = {
  skippedRoleIds: string[];
  protectedPlayerIds: string[];
  stealTargets: Record<string, string>;
  usedSkillPlayerIds: string[];
};

export type UseRoleSkillPayload = {
  roomCode: string;
  playerId: string;
  targetRoleId?: string;
  targetPlayerId?: string;
  targetDistrictCardId?: string;
  discardCardIds?: string[];
};

export type ScoreResult = {
  playerId: string;
  playerName: string;
  districtScore: number;
  bonusScore: number;
  totalScore: number;
};

export type Player = LobbyPlayer & {
  gold: number;
  hand: DistrictCard[];
  city: DistrictCard[];
  selectedRoleId: string | null;
  score: number;
};

export type GameRoom = {
  roomId: string;
  players: Player[];
  hostPlayerId: string;
  status: RoomStatus;
  phase: GamePhase;
  currentRound: number;
  crownPlayerId: string;
  roleSelectionOrder: string[];
  roleSelectionTurnPlayerId: string | null;
  currentTurnPlayerId: string | null;
  currentRoleOrder: number[];
  completedRoleIds: string[];
  turnState: TurnState | null;
  roleEffects: RoleEffectState;
  availableRoles: RoleCard[];
  discardedRoles: RoleCard[];
  districtDeck: DistrictCard[];
  districtDiscardPile: DistrictCard[];
  gameLog: GameLog[];
  scoringResults: ScoreResult[];
};

export type VisiblePlayer = Omit<Player, "hand"> & {
  hand?: DistrictCard[];
  handCount: number;
};

export type VisibleGameState = Omit<GameRoom, "players" | "districtDeck"> & {
  players: VisiblePlayer[];
  districtDeckCount: number;
};

export type ErrorPayload = {
  message: string;
};

export type ServerToClientEvents = {
  server_status: (payload: ServerStatusPayload) => void;
  room_created: (payload: RoomCommandResult) => void;
  joined_room: (payload: RoomCommandResult) => void;
  reconnected_room: (payload: RoomCommandResult) => void;
  room_state: (payload: RoomState) => void;
  game_state: (payload: VisibleGameState) => void;
  error_message: (payload: ErrorPayload) => void;
};

export type ClientToServerEvents = {
  ping_server: (payload: { sentAt: string }) => void;
  create_room: (payload: { playerName: string }) => void;
  join_room: (payload: { roomCode: string; playerName: string }) => void;
  reconnect_room: (payload: { roomCode: string; playerId: string }) => void;
  set_ready: (payload: { roomCode: string; playerId: string; isReady: boolean }) => void;
  start_game: (payload: { roomCode: string; playerId: string }) => void;
  leave_room: (payload: { roomCode: string; playerId: string }) => void;
  add_test_bots: (payload: { roomCode: string; playerId: string }) => void;
  select_role: (payload: { roomCode: string; playerId: string; roleId: string }) => void;
  take_gold: (payload: { roomCode: string; playerId: string }) => void;
  draw_district_cards: (payload: { roomCode: string; playerId: string }) => void;
  build_district: (payload: { roomCode: string; playerId: string; districtCardId: string }) => void;
  use_role_skill: (payload: UseRoleSkillPayload) => void;
  end_turn: (payload: { roomCode: string; playerId: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  connectedAt: string;
  uid?: number;
  playerId?: string;
  roomCode?: string;
};

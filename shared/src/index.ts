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

export type RoomSettings = {
  startCountdownSeconds: number;
  turnTimeoutSeconds: number;
  endCitySize: number;
  enabledRoleIds: string[];
  enableFaceUpRoleDiscard: boolean;
  enableFaceDownRoleDiscard: boolean;
  drawMode: "draw2Choose1";
  roleRulePreset: "classicStandard";
};

export type RoomSettingsUpdate = Partial<RoomSettings> & {
  maxPlayers?: number;
};
export type RoleDiscardPolicy = {
  faceUpDiscardCount: number;
  faceDownDiscardCount: number;
  canUseFaceUpDiscard: boolean;
  canUseFaceDownDiscard: boolean;
};

export function getRoleDiscardPolicy(playerCount: number, roleCount = 8): RoleDiscardPolicy {
  const normalizedPlayerCount = Math.max(0, Math.floor(playerCount));
  const normalizedRoleCount = Math.max(0, Math.floor(roleCount));
  const faceDownDiscardCount = normalizedPlayerCount < normalizedRoleCount ? 1 : 0;
  const faceUpRuleLimit =
    normalizedPlayerCount <= 4 ? 2 : normalizedPlayerCount === 5 ? 1 : 0;
  const faceUpDiscardCount = Math.min(
    faceUpRuleLimit,
    Math.max(0, normalizedRoleCount - normalizedPlayerCount - faceDownDiscardCount)
  );

  return {
    faceUpDiscardCount,
    faceDownDiscardCount,
    canUseFaceUpDiscard: faceUpDiscardCount > 0,
    canUseFaceDownDiscard: faceDownDiscardCount > 0
  };
}

export type RoomStartCountdown = {
  startedAt: string;
  deadlineAt: string;
  seconds: number;
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  minPlayers: number;
  maxPlayers: number;
  futureMaxPlayers: number;
  settings: RoomSettings;
  startCountdown: RoomStartCountdown | null;
  createdAt: string;
  chatMessages: ChatMessage[];
};

export type RoomCommandResult = {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
};

export type ChatMessage = {
  id: string;
  roomCode: string;
  playerId: string;
  playerName: string;
  message: string;
  createdAt: string;
};

export type GamePhase =
  | "LOBBY"
  | "GAME_START"
  | "CROWN_REVEAL"
  | "ROLE_SELECTION"
  | "ROLE_CALL"
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
  presentation?: ActionEventPresentation;
  origin?: GameActionOrigin;
  autoReason?: GameActionAutoReason;
  round?: number;
  createdAt: string;
};

export type GameActionOrigin = "player" | "bot" | "timeout" | "offline" | "rule";

export type GameActionAutoReason =
  | "turn_timeout"
  | "role_selection_timeout"
  | "draw_choice_timeout"
  | "offline_progress"
  | "resource_skipped"
  | "deck_empty"
  | "rule_resolution";

export type GameCommandResult = {
  ok: boolean;
  error?: string;
};

export type GameCommandAck = (result: GameCommandResult) => void;

export type ActionEventPresentationKind =
  | "assassin_mark"
  | "assassin_skip"
  | "thief_mark"
  | "thief_steal"
  | "magician_swap"
  | "magician_redraw"
  | "role_income"
  | "architect_bonus"
  | "bishop_guard"
  | "queen_income"
  | "warlord_destroy"
  | "role_lock"
  | "take_gold"
  | "draw_cards"
  | "draw_resolved"
  | "build_district"
  | "turn_start"
  | "crown_transfer"
  | "final_round"
  | "game_ended";

export type ActionEventPresentation = {
  kind: ActionEventPresentationKind;
  actorPlayerId?: string;
  targetPlayerId?: string;
  targetRoleId?: string;
  roleId?: string;
  amount?: number;
  cardCount?: number;
  maxBuilds?: number;
  actorHandCount?: number;
  targetHandCount?: number;
  districtCardId?: string;
  districtName?: string;
  districtColor?: DistrictColor;
  cost?: number;
};

export type TurnState = {
  playerId: string;
  resourceActionTaken: boolean;
  actionStep: "RESOURCE" | "ACTION";
  buildsUsed: number;
  maxBuilds: number;
  startedAt?: string;
  deadlineAt?: string;
  timeoutMs?: number;
  usedDistrictEffectIds?: string[];
};

export type TurnTimer = {
  phase: "CROWN_REVEAL" | "ROLE_SELECTION" | "ROLE_CALL" | "ROLE_ACTION";
  playerId: string | null;
  startedAt: string;
  deadlineAt: string;
  timeoutMs: number;
};

export type RoleCallStage = "calling" | "revealing" | "unanswered" | "skipped";

export type RoleCallState = {
  roleId: string;
  stage: RoleCallStage;
  playerId: string | null;
  startedAt: string;
  deadlineAt: string;
  timeoutMs: number;
};

export type PendingDrawChoice = {
  playerId: string;
  drawnCards: DistrictCard[];
};

export type PendingGraveyardChoice = {
  playerId: string;
  destroyedByPlayerId: string;
  districtCard: DistrictCard;
};

export type RoleEffectState = {
  skippedRoleIds: string[];
  protectedPlayerIds: string[];
  stealTargets: Record<string, string>;
  usedSkillPlayerIds: string[];
  queenIncomePlayerIds: string[];
};

export type UseRoleSkillPayload = {
  roomCode: string;
  playerId: string;
  targetRoleId?: string;
  targetPlayerId?: string;
  targetDistrictCardId?: string;
  discardCardIds?: string[];
};

export type UseDistrictEffectPayload = {
  roomCode: string;
  playerId: string;
  districtCardId: string;
  discardCardId?: string;
};

export type ResolveGraveyardChoicePayload = {
  roomCode: string;
  playerId: string;
  buyBack: boolean;
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
  settings: RoomSettings;
  phase: GamePhase;
  currentRound: number;
  crownPlayerId: string;
  roleSelectionOrder: string[];
  roleSelectionTurnPlayerId: string | null;
  currentTurnPlayerId: string | null;
  currentRoleOrder: number[];
  completedRoleIds: string[];
  calledRoleIds: string[];
  roleCallState: RoleCallState | null;
  firstCompletedCityPlayerId: string | null;
  turnState: TurnState | null;
  turnTimer: TurnTimer | null;
  pendingDrawChoice: PendingDrawChoice | null;
  pendingGraveyardChoice: PendingGraveyardChoice | null;
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

export type VisibleGameState = Omit<
  GameRoom,
  "players" | "districtDeck" | "districtDiscardPile" | "pendingDrawChoice" | "calledRoleIds"
> & {
  players: VisiblePlayer[];
  pendingDrawChoice: PendingDrawChoice | null;
  districtDeckCount: number;
  districtDiscardPileCount: number;
};

export type ErrorPayload = {
  message: string;
};

export type KickedFromRoomPayload = {
  roomCode: string;
  message: string;
};

export type ActionEventPayload = {
  id: string;
  roomCode: string;
  type: string;
  message: string;
  actorPlayerId?: string;
  targetPlayerId?: string;
  presentation?: ActionEventPresentation;
  origin?: GameActionOrigin;
  autoReason?: GameActionAutoReason;
  visibility: "public" | "private";
  phase: GamePhase;
  round: number;
  createdAt: string;
};

export type ServerToClientEvents = {
  server_status: (payload: ServerStatusPayload) => void;
  room_created: (payload: RoomCommandResult) => void;
  joined_room: (payload: RoomCommandResult) => void;
  reconnected_room: (payload: RoomCommandResult) => void;
  returned_to_ready_room: (payload: { roomCode: string }) => void;
  room_state: (payload: RoomState) => void;
  game_state: (payload: VisibleGameState) => void;
  action_event: (payload: ActionEventPayload) => void;
  chat_message: (payload: ChatMessage) => void;
  kicked_from_room: (payload: KickedFromRoomPayload) => void;
  error_message: (payload: ErrorPayload) => void;
};

export type ClientToServerEvents = {
  ping_server: (payload: { sentAt: string }) => void;
  create_room: (payload: { playerName: string }) => void;
  create_tutorial_room: (payload: { playerName: string }) => void;
  join_room: (payload: { roomCode: string; playerName: string }) => void;
  reconnect_room: (payload: { roomCode: string; playerId: string; reconnectToken: string }) => void;
  set_ready: (payload: { roomCode: string; playerId: string; isReady: boolean }) => void;
  start_game: (payload: { roomCode: string; playerId: string }) => void;
  request_rematch: (payload: { roomCode: string; playerId: string }) => void;
  leave_room: (payload: { roomCode: string; playerId: string }) => void;
  add_test_bots: (payload: { roomCode: string; playerId: string }) => void;
  remove_test_bot: (payload: {
    roomCode: string;
    playerId: string;
    targetBotPlayerId: string;
  }) => void;
  kick_player: (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => void;
  transfer_host: (payload: { roomCode: string; playerId: string; targetPlayerId: string }) => void;
  update_room_settings: (payload: {
    roomCode: string;
    playerId: string;
    settings: RoomSettingsUpdate;
  }) => void;
  select_role: (payload: { roomCode: string; playerId: string; roleId: string }, ack?: GameCommandAck) => void;
  take_gold: (payload: { roomCode: string; playerId: string }, ack?: GameCommandAck) => void;
  draw_district_cards: (payload: { roomCode: string; playerId: string }, ack?: GameCommandAck) => void;
  choose_drawn_district_card: (payload: {
    roomCode: string;
    playerId: string;
    districtCardId: string;
  }, ack?: GameCommandAck) => void;
  build_district: (payload: { roomCode: string; playerId: string; districtCardId: string }, ack?: GameCommandAck) => void;
  use_role_skill: (payload: UseRoleSkillPayload, ack?: GameCommandAck) => void;
  use_district_effect: (payload: UseDistrictEffectPayload, ack?: GameCommandAck) => void;
  resolve_graveyard_choice: (payload: ResolveGraveyardChoicePayload, ack?: GameCommandAck) => void;
  end_turn: (payload: { roomCode: string; playerId: string }, ack?: GameCommandAck) => void;
  skip_current_offline_player: (payload: { roomCode: string; playerId: string }, ack?: GameCommandAck) => void;
  resolve_turn_timeout: (payload: { roomCode: string; playerId: string }, ack?: GameCommandAck) => void;
  qa_configure_game: (payload: {
    roomCode: string;
    playerId: string;
    selfHandCount?: number;
    opponentHandCount?: number;
    cityCount?: number;
    ensureSelectedRoleId?: string;
    distributionMode?: "drain-deck-round-robin";
    forceSelfRoleSelectionTurn?: boolean;
    deadlineMs?: number;
    nextBuildOutcome?: "reject" | "timeout";
  }, ack?: GameCommandAck) => void;
  send_chat_message: (payload: { roomCode: string; playerId: string; message: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  connectedAt: string;
  uid?: number;
  playerId?: string;
  roomCode?: string;
};

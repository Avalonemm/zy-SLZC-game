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

export const reactionTypes = ["nice", "upset", "danger", "close"] as const;

export type ReactionType = (typeof reactionTypes)[number];

export function isReactionType(value: unknown): value is ReactionType {
  return typeof value === "string" && reactionTypes.includes(value as ReactionType);
}

export type ReactionEventPayload = {
  id: string;
  roomCode: string;
  playerId: string;
  reaction: ReactionType;
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

export const STANDARD_SCORING_COLORS = ["yellow", "blue", "green", "red", "purple"] as const;
export const FIVE_COLOR_SET_BONUS = 3;
export const FIRST_CITY_COMPLETION_BONUS = 4;
export const CITY_COMPLETION_BONUS = 2;

export type CityScoreBreakdown = {
  completedDistrictCount: number;
  districtScore: number;
  effectiveColorCount: number;
  hasFiveColorSet: boolean;
  colorBonus: number;
  completionBonus: number;
  bonusScore: number;
  totalScore: number;
};

export function calculateCityScore(input: {
  city: DistrictCard[];
  endCitySize: number;
  playerId: string;
  firstCompletedCityPlayerId: string | null;
}): CityScoreBreakdown {
  const districtScore = input.city.reduce((total, district) => total + district.score, 0);
  const fixedColors = new Set(
    input.city
      .filter((district) => district.effectType !== "wildcard_scoring_color")
      .map((district) => district.color)
  );
  const wildcardCount = input.city.filter(
    (district) => district.effectType === "wildcard_scoring_color"
  ).length;
  const missingColorCount = STANDARD_SCORING_COLORS.filter(
    (color) => !fixedColors.has(color)
  ).length;
  const effectiveColorCount = Math.min(
    STANDARD_SCORING_COLORS.length,
    fixedColors.size + Math.min(wildcardCount, missingColorCount)
  );
  const hasFiveColorSet = effectiveColorCount === STANDARD_SCORING_COLORS.length;
  const colorBonus = hasFiveColorSet ? FIVE_COLOR_SET_BONUS : 0;
  const completedCity = input.city.length >= input.endCitySize;
  const completionBonus = !completedCity
    ? 0
    : input.firstCompletedCityPlayerId === input.playerId
      ? FIRST_CITY_COMPLETION_BONUS
      : CITY_COMPLETION_BONUS;
  const bonusScore = colorBonus + completionBonus;

  return {
    completedDistrictCount: input.city.length,
    districtScore,
    effectiveColorCount,
    hasFiveColorSet,
    colorBonus,
    completionBonus,
    bonusScore,
    totalScore: districtScore + bonusScore
  };
}

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
  districtCount: number;
  districtScore: number;
  colorBonusScore: number;
  completionBonusScore: number;
  hasFiveColors: boolean;
  bonusScore: number;
  totalScore: number;
};

export type ResultTitleType =
  | "first_city"
  | "five_color"
  | "city_master"
  | "treasury_keeper"
  | "yellow_theme"
  | "blue_theme"
  | "green_theme"
  | "red_theme"
  | "purple_theme"
  | "city_dreamer";

export type ResultHighlightType =
  | "first_city"
  | "five_color"
  | "largest_steal"
  | "most_builds"
  | "highest_role_income"
  | "warlord_destroy"
  | "district_score";

export type ResultHighlight = {
  id: string;
  type: ResultHighlightType;
  playerId: string;
  playerName: string;
  value: number;
};

export type GameResultSummary = {
  resultId: string;
  createdAt: string;
  results: ScoreResult[];
  highlights: ResultHighlight[];
  titles: Record<string, ResultTitleType>;
  applauseCounts: Record<string, number>;
};

export type VisibleGameResultSummary = GameResultSummary & {
  viewerApplaudedTargetIds: string[];
};

export type ResultApplauseEventPayload = {
  id: string;
  roomCode: string;
  senderPlayerId: string;
  targetPlayerId: string;
  totalCount: number;
  createdAt: string;
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
  resultSummary?: GameResultSummary | null;
  resultApplauseBySender?: Record<string, string[]>;
};

export type VisiblePlayer = Omit<Player, "hand"> & {
  hand?: DistrictCard[];
  handCount: number;
};

export type VisibleGameState = Omit<
  GameRoom,
  | "players"
  | "districtDeck"
  | "districtDiscardPile"
  | "pendingDrawChoice"
  | "calledRoleIds"
  | "resultSummary"
  | "resultApplauseBySender"
> & {
  players: VisiblePlayer[];
  pendingDrawChoice: PendingDrawChoice | null;
  districtDeckCount: number;
  districtDiscardPileCount: number;
  resultSummary: VisibleGameResultSummary | null;
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
  reaction_event: (payload: ReactionEventPayload) => void;
  result_applause_event: (payload: ResultApplauseEventPayload) => void;
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
  send_reaction: (payload: { roomCode: string; reaction: ReactionType }) => void;
  send_result_applause: (payload: { roomCode: string; targetPlayerId: string }) => void;
};

export type InterServerEvents = Record<string, never>;

export type SocketData = {
  connectedAt: string;
  uid?: number;
  playerId?: string;
  roomCode?: string;
};

import type { DistrictCard, GameRoom, LobbyPlayer, Player, RoomState } from "@zy/shared";
import { randomUUID } from "node:crypto";
import { loadDistrictCards } from "./cardData";
import { startCrownRevealTimer } from "./timerState";
import { MIN_PLAYERS_TO_START, currentPlayerRangeText } from "./gameConfig";
import { createRoleSelectionPool } from "./rolePool";

const INITIAL_GOLD = 2;
const INITIAL_HAND_SIZE = 4;

export function initializeGameRoom(lobbyRoom: RoomState): GameRoom {
  if (
    lobbyRoom.players.length < MIN_PLAYERS_TO_START ||
    lobbyRoom.players.length > lobbyRoom.maxPlayers
  ) {
    throw new Error(`Game room requires ${currentPlayerRangeText(lobbyRoom.maxPlayers)} players for the current room.`);
  }

  const crownPlayerId = selectRandomPlayerId(lobbyRoom.players);
  const districtDeck = shuffleCards(loadDistrictCards());
  const players = lobbyRoom.players.map((lobbyPlayer) =>
    initializePlayer(lobbyPlayer, districtDeck)
  );
  const rolePool = createRoleSelectionPool(lobbyRoom.settings, players.length);

  const gameRoom: GameRoom = {
    roomId: lobbyRoom.roomCode,
    players,
    hostPlayerId: lobbyRoom.hostPlayerId,
    status: "STARTED",
    settings: lobbyRoom.settings,
    phase: "CROWN_REVEAL",
    currentRound: 1,
    crownPlayerId,
    roleSelectionOrder: createPlayerOrder(lobbyRoom.players, crownPlayerId),
    roleSelectionTurnPlayerId: null,
    currentTurnPlayerId: null,
    currentRoleOrder: [],
    completedRoleIds: [],
    firstCompletedCityPlayerId: null,
    turnState: null,
    turnTimer: null,
    pendingDrawChoice: null,
    pendingGraveyardChoice: null,
    roleEffects: createEmptyRoleEffects(),
    availableRoles: rolePool.availableRoles,
    discardedRoles: rolePool.discardedRoles,
    districtDeck,
    districtDiscardPile: [],
    gameLog: [
      {
        id: randomUUID(),
        type: "game_started",
        message: "游戏开始，正在随机皇冠。",
        createdAt: new Date().toISOString()
      }
    ],
    scoringResults: []
  };
  startCrownRevealTimer(gameRoom, gameRoom.crownPlayerId);
  return gameRoom;
}

function createEmptyRoleEffects() {
  return {
    skippedRoleIds: [],
    protectedPlayerIds: [],
    stealTargets: {},
    usedSkillPlayerIds: []
  };
}

function initializePlayer(lobbyPlayer: LobbyPlayer, districtDeck: DistrictCard[]): Player {
  return {
    ...lobbyPlayer,
    gold: INITIAL_GOLD,
    hand: drawCards(districtDeck, INITIAL_HAND_SIZE),
    city: [],
    selectedRoleId: null,
    score: 0
  };
}

function drawCards(deck: DistrictCard[], count: number) {
  const cards = deck.splice(0, count);
  if (cards.length !== count) {
    throw new Error("District deck does not have enough cards.");
  }

  return cards;
}

function shuffleCards<T>(cards: T[]) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function selectRandomPlayerId(players: LobbyPlayer[]) {
  const index = Math.floor(Math.random() * players.length);
  return players[index]?.id ?? players[0]?.id ?? "";
}

function createPlayerOrder(players: LobbyPlayer[], crownPlayerId: string) {
  const crownIndex = players.findIndex((player) => player.id === crownPlayerId);
  if (crownIndex === -1) {
    return players.map((player) => player.id);
  }

  return [...players.slice(crownIndex), ...players.slice(0, crownIndex)].map(
    (player) => player.id
  );
}

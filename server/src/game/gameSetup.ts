import type { DistrictCard, GameRoom, LobbyPlayer, Player, RoomState } from "@zy/shared";
import { randomUUID } from "node:crypto";
import { loadDistrictCards, loadRoleCards } from "./cardData";

const INITIAL_GOLD = 2;
const INITIAL_HAND_SIZE = 4;
const MIN_PLAYERS_TO_START = 2;

export function initializeGameRoom(lobbyRoom: RoomState): GameRoom {
  if (
    lobbyRoom.players.length < MIN_PLAYERS_TO_START ||
    lobbyRoom.players.length > lobbyRoom.maxPlayers
  ) {
    throw new Error("Game room requires 2-4 players for the current test build.");
  }

  const districtDeck = shuffleCards(loadDistrictCards());
  const players = lobbyRoom.players.map((lobbyPlayer) =>
    initializePlayer(lobbyPlayer, districtDeck)
  );

  return {
    roomId: lobbyRoom.roomCode,
    players,
    hostPlayerId: lobbyRoom.hostPlayerId,
    status: "STARTED",
    phase: "ROLE_SELECTION",
    currentRound: 1,
    crownPlayerId: lobbyRoom.hostPlayerId,
    roleSelectionOrder: createPlayerOrder(lobbyRoom.players, lobbyRoom.hostPlayerId),
    roleSelectionTurnPlayerId: lobbyRoom.hostPlayerId,
    currentTurnPlayerId: null,
    currentRoleOrder: [],
    completedRoleIds: [],
    turnState: null,
    roleEffects: createEmptyRoleEffects(),
    availableRoles: loadRoleCards(),
    discardedRoles: [],
    districtDeck,
    districtDiscardPile: [],
    gameLog: [
      {
        id: randomUUID(),
        type: "game_started",
        message: "游戏开始，进入角色选择阶段。",
        createdAt: new Date().toISOString()
      }
    ],
    scoringResults: []
  };
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

function createPlayerOrder(players: LobbyPlayer[], crownPlayerId: string) {
  const crownIndex = players.findIndex((player) => player.id === crownPlayerId);
  if (crownIndex === -1) {
    return players.map((player) => player.id);
  }

  return [...players.slice(crownIndex), ...players.slice(0, crownIndex)].map(
    (player) => player.id
  );
}

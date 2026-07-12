import type { GameRoom, Player } from "@zy/shared";
import { addLog } from "./gameEngineUtils";

const QUEEN_ROLE_ID = "queen";
const KING_ROLE_ID = "king";
const QUEEN_INCOME = 3;

export function resolveQueenIncome(
  gameRoom: GameRoom,
  queenPlayer: Player,
  options: { atRoundEnd: boolean }
) {
  if (
    queenPlayer.selectedRoleId !== QUEEN_ROLE_ID ||
    gameRoom.players.length < 5 ||
    gameRoom.roleEffects.queenIncomePlayerIds.includes(queenPlayer.id) ||
    gameRoom.roleEffects.skippedRoleIds.includes(QUEEN_ROLE_ID)
  ) {
    return false;
  }

  const kingPlayer = gameRoom.players.find((player) => player.selectedRoleId === KING_ROLE_ID);
  if (!kingPlayer || !areCircularNeighbors(gameRoom.players, queenPlayer.id, kingPlayer.id)) {
    return false;
  }

  const kingWasSkipped = gameRoom.roleEffects.skippedRoleIds.includes(KING_ROLE_ID);
  if (kingWasSkipped !== options.atRoundEnd) {
    return false;
  }

  queenPlayer.gold += QUEEN_INCOME;
  gameRoom.roleEffects.queenIncomePlayerIds.push(queenPlayer.id);
  addLog(
    gameRoom,
    "queen_adjacent_income",
    `${queenPlayer.name} 与国王相邻，获得 ${QUEEN_INCOME} 枚金币。`
  );
  return true;
}

export function resolveDeferredQueenIncome(gameRoom: GameRoom) {
  const queenPlayer = gameRoom.players.find((player) => player.selectedRoleId === QUEEN_ROLE_ID);
  return queenPlayer
    ? resolveQueenIncome(gameRoom, queenPlayer, { atRoundEnd: true })
    : false;
}

function areCircularNeighbors(players: Player[], firstPlayerId: string, secondPlayerId: string) {
  if (players.length < 2) {
    return false;
  }

  const firstIndex = players.findIndex((player) => player.id === firstPlayerId);
  const secondIndex = players.findIndex((player) => player.id === secondPlayerId);
  if (firstIndex === -1 || secondIndex === -1) {
    return false;
  }

  const distance = Math.abs(firstIndex - secondIndex);
  return distance === 1 || distance === players.length - 1;
}

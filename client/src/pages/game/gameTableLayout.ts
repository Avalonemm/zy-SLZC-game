import type { GamePlayer } from "./gameTypes";

export type GameSeatPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "right-upper"
  | "right-lower"
  | "left-lower"
  | "left-upper";

const seatPositionSets: Record<number, GameSeatPosition[]> = {
  1: ["top-center"],
  2: ["left-upper", "right-upper"],
  3: ["left-upper", "top-center", "right-upper"],
  4: ["left-upper", "top-left", "top-right", "right-upper"],
  5: ["left-upper", "top-left", "top-center", "top-right", "right-upper"],
  6: ["left-lower", "left-upper", "top-left", "top-right", "right-upper", "right-lower"],
  7: ["left-lower", "left-upper", "top-left", "top-center", "top-right", "right-upper", "right-lower"]
};

export function arrangeGameTableSeats(players: GamePlayer[], selfPlayerId: string | null) {
  const selfIndex = players.findIndex((player) => player.id === selfPlayerId);
  if (selfIndex === -1) {
    return { self: null, opponents: [] };
  }

  const self = players[selfIndex];
  const opponents = [
    ...players.slice(selfIndex + 1),
    ...players.slice(0, selfIndex)
  ];
  const positions = seatPositionSets[Math.min(7, Math.max(1, opponents.length))] ?? [];

  return {
    self,
    opponents: opponents.map((player, index) => ({
      player,
      position: positions[index] ?? "top-center"
    }))
  };
}

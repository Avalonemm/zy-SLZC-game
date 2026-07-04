import type { LobbyPlayer } from "@zy/shared";

export type PlayerSeatSlot =
  | {
      kind: "player";
      index: number;
      player: LobbyPlayer;
    }
  | {
      kind: "empty";
      index: number;
    };

export function createPlayerSeatSlots(players: LobbyPlayer[], maxPlayers: number) {
  const slotCount = Math.max(players.length, maxPlayers);
  return Array.from({ length: slotCount }, (_, index): PlayerSeatSlot => {
    const player = players[index];
    return player ? { kind: "player", index, player } : { kind: "empty", index };
  });
}

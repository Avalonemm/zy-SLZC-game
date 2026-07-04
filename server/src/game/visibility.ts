import type { GameRoom, Player, VisibleGameState } from "@zy/shared";
import { MAX_GAME_LOGS } from "./gameEngineUtils";

export function visibleStateForPlayer(
  gameRoom: GameRoom,
  playerId: string
): VisibleGameState {
  const { districtDeck: _districtDeck, pendingDrawChoice: _pendingDrawChoice, ...roomWithoutDeck } = gameRoom;
  const canSeeAvailableRoles =
    gameRoom.phase === "ROLE_SELECTION" && gameRoom.roleSelectionTurnPlayerId === playerId;

  return {
    ...roomWithoutDeck,
    gameLog: gameRoom.gameLog.slice(0, MAX_GAME_LOGS),
    availableRoles: canSeeAvailableRoles ? gameRoom.availableRoles : [],
    pendingDrawChoice:
      gameRoom.pendingDrawChoice?.playerId === playerId ? gameRoom.pendingDrawChoice : null,
    discardedRoles: gameRoom.discardedRoles,
    players: gameRoom.players.map((player) => {
      const visiblePlayer = {
        ...player,
        handCount: player.hand.length,
        selectedRoleId: canSeeSelectedRole(gameRoom, player, playerId)
          ? player.selectedRoleId
          : null
      };

      if (player.id === playerId) {
        return visiblePlayer;
      }

      const { hand: _hand, ...withoutHand } = visiblePlayer;
      return withoutHand;
    }),
    districtDeckCount: gameRoom.districtDeck.length
  };
}

function canSeeSelectedRole(gameRoom: GameRoom, player: Player, viewerPlayerId: string) {
  if (player.id === viewerPlayerId || gameRoom.phase === "ENDED") {
    return true;
  }

  if (!player.selectedRoleId) {
    return false;
  }

  if (gameRoom.currentTurnPlayerId === player.id) {
    return true;
  }

  return gameRoom.completedRoleIds.includes(player.selectedRoleId);
}

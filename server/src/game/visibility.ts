import type { GameRoom, Player, VisibleGameState } from "@zy/shared";
import { findRole, MAX_GAME_LOGS } from "./gameEngineUtils";

export function visibleStateForPlayer(
  gameRoom: GameRoom,
  playerId: string
): VisibleGameState {
  const {
    districtDeck: _districtDeck,
    districtDiscardPile: _districtDiscardPile,
    pendingDrawChoice: _pendingDrawChoice,
    ...roomWithoutPrivatePiles
  } = gameRoom;
  const canSeeAvailableRoles =
    gameRoom.phase === "ROLE_SELECTION" && gameRoom.roleSelectionTurnPlayerId === playerId;

  return {
    ...roomWithoutPrivatePiles,
    currentRoleOrder: visibleRoleOrder(gameRoom),
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
    districtDeckCount: gameRoom.districtDeck.length,
    districtDiscardPileCount: gameRoom.districtDiscardPile.length
  };
}

function visibleRoleOrder(gameRoom: GameRoom) {
  if (gameRoom.phase === "ROLE_SELECTION" || gameRoom.phase === "CROWN_REVEAL") {
    return [];
  }

  const publicRoleIds = new Set(gameRoom.completedRoleIds);
  const currentPlayer = gameRoom.players.find(
    (player) => player.id === gameRoom.currentTurnPlayerId
  );
  if (currentPlayer?.selectedRoleId) {
    publicRoleIds.add(currentPlayer.selectedRoleId);
  }

  return [...publicRoleIds]
    .map((roleId) => findRole(roleId)?.order)
    .filter((order): order is number => typeof order === "number")
    .sort((a, b) => a - b);
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

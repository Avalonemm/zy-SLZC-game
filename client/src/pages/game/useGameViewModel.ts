import { useEffect, useState } from "react";
import type { VisibleGameState } from "@zy/shared";
import { playerName } from "./gameText";
import { getSkillTargetSpec } from "./skillTargeting";

type UseGameViewModelParams = {
  gameState: VisibleGameState;
  playerId: string | null;
};

export function useGameViewModel(params: UseGameViewModelParams) {
  const [discardCardIds, setDiscardCardIds] = useState<string[]>([]);
  const self = params.gameState.players.find((player) => player.id === params.playerId) ?? null;
  const isSelectingRole =
    params.gameState.phase === "ROLE_SELECTION" &&
    params.gameState.roleSelectionTurnPlayerId === params.playerId;
  const isMyTurn =
    params.gameState.phase === "ROLE_ACTION" &&
    params.gameState.currentTurnPlayerId === params.playerId;
  const selfRoleId = self?.selectedRoleId ?? null;
  const skillTargetSpec = getSkillTargetSpec(selfRoleId);
  const currentTurnName = playerName(params.gameState, params.gameState.currentTurnPlayerId);
  const roleSelectionTurnName = playerName(
    params.gameState,
    params.gameState.roleSelectionTurnPlayerId
  );
  const turnState = params.gameState.turnState;
  const skillUsed = Boolean(
    params.playerId && params.gameState.roleEffects.usedSkillPlayerIds.includes(params.playerId)
  );
  const needsTargetDistrict = skillTargetSpec.kind === "district";
  const canUseSkill =
    isMyTurn &&
    !skillUsed &&
    Boolean(selfRoleId) &&
    params.gameState.phase === "ROLE_ACTION";
  const canTakeResource =
    isMyTurn &&
    Boolean(turnState) &&
    !turnState?.resourceActionTaken &&
    params.gameState.pendingDrawChoice?.playerId !== params.playerId;
  const canBuild =
    isMyTurn &&
    Boolean(turnState) &&
    params.gameState.pendingDrawChoice?.playerId !== params.playerId &&
    (turnState?.buildsUsed ?? 0) < (turnState?.maxBuilds ?? 0);
  const currentTurnPlayer =
    params.gameState.players.find((player) => player.id === params.gameState.currentTurnPlayerId) ??
    null;
  const canSkipCurrentOfflinePlayer =
    params.gameState.phase === "ROLE_ACTION" &&
    Boolean(self?.isHost) &&
    Boolean(currentTurnPlayer && !currentTurnPlayer.connected);
  const scoringResults = [...params.gameState.scoringResults].sort(
    (first, second) => second.totalScore - first.totalScore
  );
  const otherPlayers = params.gameState.players.filter((player) => player.id !== params.playerId);

  useEffect(() => {
    const handIds = new Set((self?.hand ?? []).map((card) => card.id));
    setDiscardCardIds((current) => current.filter((cardId) => handIds.has(cardId)));
  }, [self?.hand]);

  function toggleDiscardCard(cardId: string) {
    setDiscardCardIds((current) =>
      current.includes(cardId)
        ? current.filter((selectedCardId) => selectedCardId !== cardId)
        : [...current, cardId]
    );
  }

  function clearDiscardCards() {
    setDiscardCardIds([]);
  }

  function skillBlockedReason() {
    if (!isMyTurn) {
      return "\u8fd8\u6ca1\u6709\u8f6e\u5230\u4f60\u3002";
    }

    if (skillUsed) {
      return "\u672c\u8f6e\u4f60\u5df2\u7ecf\u4f7f\u7528\u8fc7\u6280\u80fd\u3002";
    }

    if (!selfRoleId) {
      return "\u4f60\u8fd8\u6ca1\u6709\u53ef\u516c\u5f00\u4f7f\u7528\u7684\u89d2\u8272\u3002";
    }

    return "";
  }

  return {
    canBuild,
    canSkipCurrentOfflinePlayer,
    canTakeResource,
    canUseSkill,
    clearDiscardCards,
    currentTurnName,
    discardCardIds,
    isMyTurn,
    isSelectingRole,
    needsTargetDistrict,
    otherPlayers,
    roleSelectionTurnName,
    scoringResults,
    self,
    selfRoleId,
    skillTargetSpec,
    skillBlockedReason: skillBlockedReason(),
    skillUsed,
    turnState,
    toggleDiscardCard
  };
}

import { useEffect, useState } from "react";
import type { VisibleGameState } from "@zy/shared";
import { playerName, roleOptions } from "./testGameUtils";
import { getSkillTargetSpec } from "./skillTargeting";

type UseTestGameViewModelParams = {
  gameState: VisibleGameState;
  playerId: string | null;
};

export function useTestGameViewModel(params: UseTestGameViewModelParams) {
  const [targetRoleId, setTargetRoleId] = useState(roleOptions[1]?.id ?? "");
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [targetDistrictCardId, setTargetDistrictCardId] = useState("");
  const [discardCardIds, setDiscardCardIds] = useState<string[]>([]);
  const self = params.gameState.players.find((player) => player.id === params.playerId) ?? null;
  const targetPlayer =
    params.gameState.players.find((player) => player.id === targetPlayerId) ??
    params.gameState.players.find((player) => player.id !== params.playerId) ??
    null;
  const resolvedTargetPlayerId = targetPlayer?.id ?? "";
  const targetDistricts = targetPlayer?.city ?? [];
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
  const needsTargetRole = skillTargetSpec.kind === "role";
  const needsDiscardCards = skillTargetSpec.kind === "discardCards";
  const needsTargetDistrict = skillTargetSpec.kind === "district";
  const noTargetSkill = skillTargetSpec.kind === "none" && Boolean(selfRoleId);
  const hasMagicianSwapTarget = selfRoleId === "magician" && Boolean(targetPlayer?.id);
  const hasSkillRequirements =
    noTargetSkill ||
    (needsTargetRole && Boolean(targetRoleId)) ||
    (needsDiscardCards && (discardCardIds.length > 0 || hasMagicianSwapTarget)) ||
    (needsTargetDistrict && Boolean(targetPlayer?.id && targetDistrictCardId));
  const canUseSkill =
    isMyTurn &&
    !skillUsed &&
    Boolean(selfRoleId) &&
    params.gameState.phase === "ROLE_ACTION" &&
    hasSkillRequirements;
  const canTakeResource =
    isMyTurn &&
    Boolean(turnState) &&
    !turnState?.resourceActionTaken &&
    params.gameState.pendingDrawChoice?.playerId !== params.playerId;
  const canBuild =
    isMyTurn && Boolean(turnState) && (turnState?.buildsUsed ?? 0) < (turnState?.maxBuilds ?? 0);
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
    const firstOpponent = params.gameState.players.find((player) => player.id !== params.playerId);
    if (!targetPlayerId && firstOpponent) {
      setTargetPlayerId(firstOpponent.id);
    }
  }, [params.gameState.players, params.playerId, targetPlayerId]);

  useEffect(() => {
    const hasSelectedDistrict = targetDistricts.some(
      (district) => district.id === targetDistrictCardId
    );
    if (targetDistricts[0] && !hasSelectedDistrict) {
      setTargetDistrictCardId(targetDistricts[0].id);
    }
  }, [targetDistrictCardId, targetDistricts]);

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

  function skillBlockedReason() {
    if (!isMyTurn) {
      return "还没有轮到你。";
    }

    if (skillUsed) {
      return "本轮你已经使用过技能。";
    }

    if (needsDiscardCards && discardCardIds.length === 0 && !hasMagicianSwapTarget) {
      return "请选择要弃置的手牌或交换目标。";
    }

    if (needsTargetDistrict && !targetDistrictCardId) {
      return "请选择要破坏的建筑。";
    }

    if (!selfRoleId) {
      return "你还没有可公开使用的角色。";
    }

    return "";
  }

  return {
    canBuild,
    canSkipCurrentOfflinePlayer,
    canTakeResource,
    canUseSkill,
    currentTurnName,
    discardCardIds,
    isMyTurn,
    isSelectingRole,
    needsDiscardCards,
    needsTargetDistrict,
    needsTargetRole,
    otherPlayers,
    resolvedTargetPlayerId,
    roleSelectionTurnName,
    scoringResults,
    self,
    selfRoleId,
    skillTargetSpec,
    skillBlockedReason: skillBlockedReason(),
    skillUsed,
    targetDistrictCardId,
    targetDistricts,
    targetRoleId,
    turnState,
    setTargetDistrictCardId,
    setTargetPlayerId,
    setTargetRoleId,
    toggleDiscardCard
  };
}

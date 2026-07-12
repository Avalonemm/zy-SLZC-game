import type { VisibleGameState } from "@zy/shared";
import { roleOptions } from "./gameText";

export type RoleSkillTargeting =
  | { kind: "role"; sourceRoleId: "assassin" | "thief"; selectedRoleId: string | null }
  | { kind: "magician-choice" }
  | { kind: "magician-discard"; selectedCardIds: string[] }
  | { kind: "magician-player"; selectedPlayerId: string | null };

export function legalRoleTargets(
  gameState: VisibleGameState,
  sourceRoleId: "assassin" | "thief"
) {
  const enabledRoleIds = new Set(gameState.settings.enabledRoleIds);
  return roleOptions.filter((role) => {
    if (!enabledRoleIds.has(role.id) || role.id === sourceRoleId) {
      return false;
    }
    if (gameState.completedRoleIds.includes(role.id)) {
      return false;
    }
    if (sourceRoleId === "thief") {
      return role.id !== "assassin" && !gameState.roleEffects.skippedRoleIds.includes(role.id);
    }
    return true;
  });
}

export function roleTargetPrompt(sourceRoleId: "assassin" | "thief") {
  return sourceRoleId === "assassin"
    ? "选择一个尚未行动的身份，本轮该身份会被跳过。"
    : "选择一个尚未行动的身份，当该身份开始行动时你会获得其全部金币。";
}

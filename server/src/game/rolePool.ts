import { getRoleDiscardPolicy, type RoleCard, type RoomSettings } from "@zy/shared";
import { loadRoleCards } from "./cardData";

export function createRoleSelectionPool(settings: RoomSettings, playerCount: number) {
  const enabledRoleIds = new Set(settings.enabledRoleIds);
  const roles = loadRoleCards().filter((role) => enabledRoleIds.has(role.id));
  const availableRoles = [...roles];
  const discardedRoles: RoleCard[] = [];

  const discardPolicy = getRoleDiscardPolicy(playerCount, availableRoles.length);

  if (settings.enableFaceDownRoleDiscard && discardPolicy.canUseFaceDownDiscard) {
    availableRoles.shift();
  }

  if (settings.enableFaceUpRoleDiscard && discardPolicy.canUseFaceUpDiscard) {
    discardedRoles.push(...availableRoles.splice(0, discardPolicy.faceUpDiscardCount));
  }

  if (availableRoles.length < playerCount) {
    throw new Error("启用角色和弃牌设置不足以支持当前玩家人数。");
  }

  return {
    availableRoles,
    discardedRoles
  };
}

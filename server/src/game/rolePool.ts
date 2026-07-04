import type { RoleCard, RoomSettings } from "@zy/shared";
import { loadRoleCards } from "./cardData";

export function createRoleSelectionPool(settings: RoomSettings, playerCount: number) {
  const enabledRoleIds = new Set(settings.enabledRoleIds);
  const roles = loadRoleCards().filter((role) => enabledRoleIds.has(role.id));
  const availableRoles = [...roles];
  const discardedRoles: RoleCard[] = [];

  if (settings.enableFaceDownRoleDiscard) {
    availableRoles.shift();
  }

  if (settings.enableFaceUpRoleDiscard) {
    discardedRoles.push(...availableRoles.splice(0, Math.min(2, availableRoles.length)));
  }

  if (availableRoles.length < playerCount) {
    throw new Error("启用角色和弃牌设置不足以支持当前玩家人数。");
  }

  return {
    availableRoles,
    discardedRoles
  };
}

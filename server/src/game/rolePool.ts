import { getRoleDiscardPolicy, type RoleCard, type RoomSettings } from "@zy/shared";
import { loadRoleCards } from "./cardData";
import { QUEEN_ROLE_ID } from "./gameConfig";

export function createRoleSelectionPool(settings: RoomSettings, playerCount: number) {
  const enabledRoleIds = new Set(settings.enabledRoleIds);
  if (playerCount === 8) {
    enabledRoleIds.add(QUEEN_ROLE_ID);
  } else {
    enabledRoleIds.delete(QUEEN_ROLE_ID);
  }
  const roles = loadRoleCards().filter((role) => enabledRoleIds.has(role.id));
  const availableRoles = [...roles];
  const discardedRoles: RoleCard[] = [];

  const discardPolicy = getRoleDiscardPolicy(playerCount, availableRoles.length);

  if (settings.enableFaceDownRoleDiscard && discardPolicy.canUseFaceDownDiscard) {
    removeRandomRole(availableRoles);
  }

  if (settings.enableFaceUpRoleDiscard && discardPolicy.canUseFaceUpDiscard) {
    for (let count = 0; count < discardPolicy.faceUpDiscardCount; count += 1) {
      const discarded = removeRandomRole(availableRoles, (role) => role.id !== "king");
      if (discarded) discardedRoles.push(discarded);
    }
  }

  if (availableRoles.length < playerCount) {
    throw new Error("启用角色和弃牌设置不足以支持当前玩家人数。");
  }

  return {
    availableRoles: availableRoles.sort((first, second) => first.order - second.order),
    discardedRoles: discardedRoles.sort((first, second) => first.order - second.order)
  };
}

function removeRandomRole(roles: RoleCard[], predicate: (role: RoleCard) => boolean = () => true) {
  const candidateIndexes = roles
    .map((role, index) => (predicate(role) ? index : -1))
    .filter((index) => index >= 0);
  if (candidateIndexes.length === 0) return null;
  const candidateIndex = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
  return roles.splice(candidateIndex, 1)[0] ?? null;
}

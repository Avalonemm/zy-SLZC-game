import type { DistrictCard } from "@zy/shared";
import type { GamePlayer } from "./gameTypes";

export type TableDistrictTargetSource = {
  kind: "role";
  roleId: "warlord";
  name: string;
  costMode: "warlord";
};

export type DistrictTargetStatus = {
  eligible: boolean;
  reason: string;
  cost: number;
  reasonCode?: "protected" | "completed" | "indestructible" | "insufficient-gold";
};

export function getTableTargetingGold(
  actor: GamePlayer | null
) {
  if (!actor) {
    return 0;
  }
  const pendingRoleIncome = actor.city.filter(
    (district) => district.color === "red" || district.effectType === "wildcard_income_color"
  ).length;
  return actor.gold + pendingRoleIncome;
}

export function getDistrictTargetStatus(input: {
  actorGold: number;
  endCitySize: number;
  protectedPlayerIds: string[];
  targetDistrict: DistrictCard;
  targetPlayer: GamePlayer;
}): DistrictTargetStatus {
  const targetHasGreatWall = input.targetPlayer.city.some(
    (district) => district.effectType === "destroy_cost_plus_one"
  );
  const cost = Math.max(input.targetDistrict.cost - 1 + (targetHasGreatWall ? 1 : 0), 0);

  if (input.protectedPlayerIds.includes(input.targetPlayer.id)) {
    return { eligible: false, reason: "该玩家的城市受到保护", cost, reasonCode: "protected" };
  }
  if (input.targetPlayer.city.length >= input.endCitySize) {
    return { eligible: false, reason: "该玩家已经完成城市", cost, reasonCode: "completed" };
  }
  if (input.targetDistrict.effectType === "indestructible") {
    return { eligible: false, reason: "要塞不能被破坏", cost, reasonCode: "indestructible" };
  }
  if (input.actorGold < cost) {
    return { eligible: false, reason: `需要 ${cost} 枚金币`, cost, reasonCode: "insufficient-gold" };
  }
  return {
    eligible: true,
    reason: cost > 0 ? `点击选择，需支付 ${cost} 枚金币` : "点击选择这座建筑",
    cost
  };
}

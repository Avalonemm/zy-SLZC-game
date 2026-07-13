import type { DistrictCard, DistrictColor } from "@zy/shared";

type IncomeRoleRule = {
  baseGold: number;
  color: DistrictColor;
  colorLabel: string;
};

export type RoleIncomeSummary = IncomeRoleRule & {
  amount: number;
  coloredDistrictCount: number;
  detail: string;
  wildcardDistrictCount: number;
};

const INCOME_ROLE_RULES: Record<string, IncomeRoleRule | undefined> = {
  king: { baseGold: 0, color: "yellow", colorLabel: "黄色" },
  bishop: { baseGold: 0, color: "blue", colorLabel: "蓝色" },
  merchant: { baseGold: 1, color: "green", colorLabel: "绿色" },
  warlord: { baseGold: 0, color: "red", colorLabel: "红色" }
};

export function roleIncomeRule(roleId: string | null) {
  const rule = roleId ? INCOME_ROLE_RULES[roleId] : undefined;
  if (!rule) {
    return null;
  }
  const base = rule.baseGold > 0 ? `，并固定获得 ${rule.baseGold} 枚金币` : "";
  return `职业收入：每座${rule.colorLabel}建筑获得 1 枚金币${base}；魔法学校也计为${rule.colorLabel}建筑。`;
}

export function roleIncomeSummary(
  roleId: string | null,
  city: readonly DistrictCard[]
): RoleIncomeSummary | null {
  const rule = roleId ? INCOME_ROLE_RULES[roleId] : undefined;
  if (!rule) {
    return null;
  }

  const coloredDistrictCount = city.filter((district) => district.color === rule.color).length;
  const wildcardDistrictCount = city.filter(
    (district) => district.color !== rule.color && district.effectType === "wildcard_income_color"
  ).length;
  const amount = coloredDistrictCount + wildcardDistrictCount + rule.baseGold;
  const parts = [`${rule.colorLabel}建筑 ${coloredDistrictCount}`];
  if (wildcardDistrictCount > 0) {
    parts.push(`魔法学校 ${wildcardDistrictCount}`);
  }
  if (rule.baseGold > 0) {
    parts.push(`固定 ${rule.baseGold}`);
  }

  return {
    ...rule,
    amount,
    coloredDistrictCount,
    detail: `职业收入：${parts.join(" + ")} = ${amount} 枚金币`,
    wildcardDistrictCount
  };
}

export type SkillTargetKind = "none" | "role" | "discardCards" | "district";

export type SkillTargetSpec = {
  kind: SkillTargetKind;
  label: string;
};

const skillTargetSpecs: Record<string, SkillTargetSpec> = {
  assassin: { kind: "role", label: "目标角色" },
  thief: { kind: "role", label: "目标角色" },
  magician: { kind: "discardCards", label: "弃置手牌" },
  king: { kind: "none", label: "无需目标" },
  bishop: { kind: "none", label: "无需目标" },
  merchant: { kind: "none", label: "无需目标" },
  architect: { kind: "none", label: "无需目标" },
  warlord: { kind: "district", label: "目标玩家与建筑" }
};

export function getSkillTargetSpec(roleId: string | null): SkillTargetSpec {
  if (!roleId) {
    return { kind: "none", label: "未选择角色" };
  }

  return skillTargetSpecs[roleId] ?? { kind: "none", label: "无需目标" };
}

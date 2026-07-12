export type SkillTargetKind = "none" | "role" | "discardCards" | "district";

export type SkillTargetSpec = {
  kind: SkillTargetKind;
  label: string;
};

const skillTargetSpecs: Record<string, SkillTargetSpec> = {
  assassin: { kind: "role", label: "\u76ee\u6807\u89d2\u8272" },
  thief: { kind: "role", label: "\u76ee\u6807\u89d2\u8272" },
  magician: { kind: "discardCards", label: "\u5f03\u7f6e\u624b\u724c" },
  king: { kind: "none", label: "\u65e0\u9700\u76ee\u6807" },
  bishop: { kind: "none", label: "\u65e0\u9700\u76ee\u6807" },
  merchant: { kind: "none", label: "\u65e0\u9700\u76ee\u6807" },
  architect: { kind: "none", label: "\u65e0\u9700\u76ee\u6807" },
  warlord: { kind: "district", label: "\u76ee\u6807\u73a9\u5bb6\u4e0e\u5efa\u7b51" }
};

export function getSkillTargetSpec(roleId: string | null): SkillTargetSpec {
  if (!roleId) {
    return { kind: "none", label: "\u672a\u9009\u62e9\u89d2\u8272" };
  }

  return skillTargetSpecs[roleId] ?? { kind: "none", label: "\u65e0\u9700\u76ee\u6807" };
}
import type { ActionEventPresentation } from "@zy/shared";

export type PresentationTiming = {
  motionMs: number;
  noticeMs: number;
};

const resourceKinds = new Set<ActionEventPresentation["kind"]>([
  "take_gold",
  "draw_cards",
  "draw_resolved"
]);

const normalActionKinds = new Set<ActionEventPresentation["kind"]>([
  "build_district",
  "role_lock",
  "turn_start"
]);

const settlementKinds = new Set<ActionEventPresentation["kind"]>([
  "assassin_skip",
  "thief_steal"
]);

const roleEffectKinds = new Set<ActionEventPresentation["kind"]>([
  "assassin_mark",
  "thief_mark",
  "magician_swap",
  "magician_redraw",
  "role_income",
  "architect_bonus",
  "bishop_guard",
  "queen_income",
  "warlord_destroy"
]);

const phaseKinds = new Set<ActionEventPresentation["kind"]>([
  "final_round",
  "game_ended"
]);

export function presentationTiming(kind?: ActionEventPresentation["kind"]): PresentationTiming {
  if (!kind || resourceKinds.has(kind)) return { motionMs: 1_100, noticeMs: 1_800 };
  if (normalActionKinds.has(kind)) return { motionMs: 1_200, noticeMs: 1_900 };
  if (settlementKinds.has(kind)) return { motionMs: 2_400, noticeMs: 2_600 };
  if (kind === "crown_transfer") return { motionMs: 2_000, noticeMs: 2_200 };
  if (roleEffectKinds.has(kind)) return { motionMs: 2_150, noticeMs: 2_400 };
  if (phaseKinds.has(kind)) return { motionMs: 1_800, noticeMs: 3_000 };
  return { motionMs: 1_800, noticeMs: 2_200 };
}

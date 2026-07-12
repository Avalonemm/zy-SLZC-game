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
  "turn_start",
  "crown_transfer"
]);

const phaseKinds = new Set<ActionEventPresentation["kind"]>([
  "final_round",
  "game_ended"
]);

export function presentationTiming(kind?: ActionEventPresentation["kind"]): PresentationTiming {
  if (!kind || resourceKinds.has(kind)) return { motionMs: 1_200, noticeMs: 2_800 };
  if (normalActionKinds.has(kind)) return { motionMs: 1_400, noticeMs: 3_000 };
  if (phaseKinds.has(kind)) return { motionMs: 1_600, noticeMs: 4_000 };
  return { motionMs: 2_200, noticeMs: 3_600 };
}

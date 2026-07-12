import type { DistrictCard } from "@zy/shared";

export type CardInspectorPlacement = "auto" | "top" | "bottom" | "left" | "right" | "hand";
export type CardInspectorSize = "standard" | "table-small";

export function districtInspectorAttributes(
  card: DistrictCard,
  placement: CardInspectorPlacement = "auto",
  size: CardInspectorSize = "standard"
) {
  return {
    "data-card-inspector": "district",
    "data-inspector-placement": placement,
    "data-inspector-size": size,
    "data-inspector-name": card.name,
    "data-inspector-cost": String(card.cost),
    "data-inspector-score": String(card.score),
    "data-inspector-color": card.color,
    "data-inspector-description": card.description || "普通建筑，没有额外效果。"
  } as const;
}

export function roleInspectorAttributes(
  roleId: string | null,
  placement: CardInspectorPlacement = "auto",
  size: CardInspectorSize = "standard"
) {
  return {
    "data-card-inspector": "role",
    "data-inspector-placement": placement,
    "data-inspector-size": size,
    "data-inspector-role-id": roleId ?? ""
  } as const;
}

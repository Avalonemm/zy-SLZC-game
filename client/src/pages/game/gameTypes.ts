import type { DistrictCard, VisibleGameState } from "@zy/shared";

export type GamePlayer = VisibleGameState["players"][number];
export type GameRole = VisibleGameState["availableRoles"][number];
export type GameScoringResult = VisibleGameState["scoringResults"][number];

export type RoleOption = {
  id: string;
  name: string;
};

export type UseRoleSkillPayload = {
  targetRoleId?: string;
  targetPlayerId?: string;
  targetDistrictCardId?: string;
  discardCardIds?: string[];
};

export type UseDistrictEffectPayload = {
  districtCardId: string;
  discardCardId?: string;
};

export type BuildableDistrictCard = DistrictCard;

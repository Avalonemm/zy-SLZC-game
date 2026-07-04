import type { DistrictCard, VisibleGameState } from "@zy/shared";

export type TestGamePlayer = VisibleGameState["players"][number];
export type TestGameRole = VisibleGameState["availableRoles"][number];
export type TestGameScoringResult = VisibleGameState["scoringResults"][number];

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

export type BuildableDistrictCard = DistrictCard;

import { describe, expect, it } from "vitest";
import { loadDistrictCards, loadRoleCards } from "./cardData";

const supportedDistrictEffects = new Set([
  "none",
  "wildcard_scoring_color",
  "indestructible",
  "discard_hand_for_gold",
  "pay_gold_draw_cards",
  "draw_three_choose_one",
  "destroyed_card_buyback",
  "keep_all_drawn",
  "wildcard_income_color",
  "destroy_cost_plus_one"
]);

const supportedRoleEffects = new Set([
  "skip_role",
  "steal_gold",
  "exchange_cards",
  "take_crown",
  "protect_city",
  "income_by_color",
  "extra_build",
  "destroy_district",
  "queen_adjacent_income"
]);

describe("rule data coverage", () => {
  it("recognizes every one of the 65 district cards and all configured effect types", () => {
    const districts = loadDistrictCards();
    expect(districts).toHaveLength(65);
    expect(new Set(districts.map((card) => card.id)).size).toBe(65);
    const unknown = [...new Set(districts.map((card) => card.effectType))]
      .filter((effect) => !supportedDistrictEffects.has(effect));
    expect(unknown).toEqual([]);
  });

  it("recognizes all nine roles and configured effect types", () => {
    const roles = loadRoleCards();
    expect(roles).toHaveLength(9);
    expect(new Set(roles.map((role) => role.id)).size).toBe(9);
    const unknown = roles.map((role) => role.effectType)
      .filter((effect) => !supportedRoleEffects.has(effect));
    expect(unknown).toEqual([]);
  });
});

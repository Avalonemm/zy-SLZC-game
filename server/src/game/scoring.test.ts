import { describe, expect, it } from "vitest";
import { calculateCityScore, type DistrictCard, type DistrictColor } from "@zy/shared";

function district(id: string, color: DistrictColor, score = 1, effectType = "none"): DistrictCard {
  return {
    id,
    name: id,
    cost: score,
    color,
    score,
    description: "",
    effectType,
    effectParams: {}
  };
}

function score(city: DistrictCard[], overrides: Partial<Parameters<typeof calculateCityScore>[0]> = {}) {
  return calculateCityScore({
    city,
    endCitySize: 8,
    playerId: "player-1",
    firstCompletedCityPlayerId: null,
    ...overrides
  });
}

describe("calculateCityScore", () => {
  it("adds the printed scores of built districts", () => {
    expect(score([
      district("one", "yellow", 1),
      district("three", "blue", 3),
      district("five", "purple", 5)
    ])).toMatchObject({ districtScore: 9, bonusScore: 0, totalScore: 9 });
  });

  it("awards three points for all five standard colors", () => {
    const result = score([
      district("yellow", "yellow"),
      district("blue", "blue"),
      district("green", "green"),
      district("red", "red"),
      district("purple", "purple")
    ]);

    expect(result).toMatchObject({
      effectiveColorCount: 5,
      hasFiveColorSet: true,
      colorBonus: 3,
      totalScore: 8
    });
  });

  it("lets Ghost City fill one missing color without counting its printed color twice", () => {
    const result = score([
      district("yellow", "yellow"),
      district("blue", "blue"),
      district("green", "green"),
      district("red", "red"),
      district("ghost", "purple", 2, "wildcard_scoring_color")
    ]);

    expect(result).toMatchObject({ effectiveColorCount: 5, colorBonus: 3, districtScore: 6 });
  });

  it("awards four points to the first completed city and two to later completed cities", () => {
    const city = Array.from({ length: 5 }, (_, index) => district(`district-${index}`, "yellow"));

    expect(score(city, {
      endCitySize: 5,
      firstCompletedCityPlayerId: "player-1"
    }).completionBonus).toBe(4);
    expect(score(city, {
      endCitySize: 5,
      firstCompletedCityPlayerId: "another-player"
    }).completionBonus).toBe(2);
    expect(score(city.slice(0, 4), {
      endCitySize: 5,
      firstCompletedCityPlayerId: "player-1"
    }).completionBonus).toBe(0);
  });
});

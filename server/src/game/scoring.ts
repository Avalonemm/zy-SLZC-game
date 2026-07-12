import type { DistrictCard, GameRoom, ScoreResult } from "@zy/shared";
import { addLog } from "./gameEngineUtils";

const STANDARD_COMPLETION_BONUS = 2;
const FIRST_COMPLETION_BONUS = 4;
const FIVE_COLOR_BONUS = 3;
const STANDARD_COLORS: DistrictCard["color"][] = ["yellow", "blue", "green", "red", "purple"];

export function scoreGame(gameRoom: GameRoom) {
  const scoringResults: ScoreResult[] = gameRoom.players
    .map((player) => {
      const districtScore = player.city.reduce((total, district) => total + district.score, 0);
      const completionBonus = getCompletionBonus(gameRoom, player.id, player.city.length);
      const colorBonus = hasFiveColorSet(player.city) ? FIVE_COLOR_BONUS : 0;
      const bonusScore = completionBonus + colorBonus;
      const totalScore = districtScore + bonusScore;
      player.score = totalScore;
      return {
        playerId: player.id,
        playerName: player.name,
        districtScore,
        bonusScore,
        totalScore
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.districtScore - a.districtScore);

  gameRoom.phase = "ENDED";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.turnTimer = null;
  gameRoom.scoringResults = scoringResults;
  addLog(gameRoom, "game_ended", "本局结束，进入最终结算。");
}

function getCompletionBonus(gameRoom: GameRoom, playerId: string, citySize: number) {
  if (citySize < gameRoom.settings.endCitySize) {
    return 0;
  }

  return gameRoom.firstCompletedCityPlayerId === playerId
    ? FIRST_COMPLETION_BONUS
    : STANDARD_COMPLETION_BONUS;
}

function hasFiveColorSet(city: DistrictCard[]) {
  const fixedColors = new Set(
    city
      .filter((district) => district.effectType !== "wildcard_scoring_color")
      .map((district) => district.color)
  );
  const wildcardCount = city.filter((district) => district.effectType === "wildcard_scoring_color").length;
  const missingColors = STANDARD_COLORS.filter((color) => !fixedColors.has(color));

  return missingColors.length <= wildcardCount;
}

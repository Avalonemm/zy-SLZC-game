import { calculateCityScore, type GameRoom, type ScoreResult } from "@zy/shared";
import { addLog } from "./gameEngineUtils";

export function scoreGame(gameRoom: GameRoom) {
  const scoringResults: ScoreResult[] = gameRoom.players
    .map((player) => {
      const score = calculateCityScore({
        city: player.city,
        endCitySize: gameRoom.settings.endCitySize,
        playerId: player.id,
        firstCompletedCityPlayerId: gameRoom.firstCompletedCityPlayerId
      });
      player.score = score.totalScore;
      return {
        playerId: player.id,
        playerName: player.name,
        districtScore: score.districtScore,
        bonusScore: score.bonusScore,
        totalScore: score.totalScore
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || b.districtScore - a.districtScore);

  gameRoom.phase = "ENDED";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.turnTimer = null;
  gameRoom.scoringResults = scoringResults;
  addLog(gameRoom, "game_ended", "本局结束，进入最终结算。", { kind: "game_ended" });
}

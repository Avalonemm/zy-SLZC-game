import type { GameRoom, ScoreResult } from "@zy/shared";
import { addLog } from "./gameEngineUtils";

export function scoreGame(gameRoom: GameRoom) {
  const scoringResults: ScoreResult[] = gameRoom.players
    .map((player) => {
      const districtScore = player.city.reduce((total, district) => total + district.score, 0);
      const bonusScore = player.city.length >= gameRoom.settings.endCitySize ? 2 : 0;
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
    .sort((a, b) => b.totalScore - a.totalScore);

  gameRoom.phase = "ENDED";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.turnTimer = null;
  gameRoom.scoringResults = scoringResults;
  addLog(gameRoom, "game_ended", "娓告垙缁撴潫锛屽凡瀹屾垚鑷姩缁撶畻銆?");
}

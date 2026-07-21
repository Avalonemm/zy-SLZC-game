import type { GameRoom } from "@zy/shared";
import { addLog } from "./gameEngineUtils";
import { buildScoreResults, createGameResultSummary } from "./gameResults";

export function scoreGame(gameRoom: GameRoom) {
  const scoringResults = buildScoreResults(gameRoom);

  gameRoom.phase = "ENDED";
  gameRoom.currentTurnPlayerId = null;
  gameRoom.turnState = null;
  gameRoom.turnTimer = null;
  gameRoom.scoringResults = scoringResults;
  gameRoom.resultApplauseBySender = {};
  addLog(gameRoom, "game_ended", "本局结束，进入最终结算。", { kind: "game_ended" });
  gameRoom.resultSummary = createGameResultSummary(gameRoom, scoringResults, {
    createdAt: gameRoom.gameLog[0]?.createdAt
  });
}

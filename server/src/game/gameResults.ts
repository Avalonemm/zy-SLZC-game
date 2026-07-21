import {
  STANDARD_SCORING_COLORS,
  calculateCityScore,
  type DistrictColor,
  type GameResultSummary,
  type GameRoom,
  type ResultHighlight,
  type ResultHighlightType,
  type ResultTitleType,
  type ScoreResult
} from "@zy/shared";
import { randomUUID } from "node:crypto";

type HighlightCandidate = Omit<ResultHighlight, "id"> & { priority: number };

const HIGHLIGHT_PRIORITY: ResultHighlightType[] = [
  "first_city",
  "five_color",
  "largest_steal",
  "most_builds",
  "highest_role_income",
  "warlord_destroy",
  "district_score"
];

const THEME_TITLE: Record<DistrictColor, ResultTitleType> = {
  yellow: "yellow_theme",
  blue: "blue_theme",
  green: "green_theme",
  red: "red_theme",
  purple: "purple_theme"
};

export function buildScoreResults(gameRoom: GameRoom): ScoreResult[] {
  const seatIndex = new Map(gameRoom.players.map((player, index) => [player.id, index]));
  return gameRoom.players
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
        districtCount: score.completedDistrictCount,
        districtScore: score.districtScore,
        colorBonusScore: score.colorBonus,
        completionBonusScore: score.completionBonus,
        hasFiveColors: score.hasFiveColorSet,
        bonusScore: score.bonusScore,
        totalScore: score.totalScore
      };
    })
    .sort((a, b) =>
      b.totalScore - a.totalScore ||
      b.districtScore - a.districtScore ||
      (seatIndex.get(a.playerId) ?? 0) - (seatIndex.get(b.playerId) ?? 0)
    );
}

export function createGameResultSummary(
  gameRoom: GameRoom,
  results: ScoreResult[],
  options: { resultId?: string; createdAt?: string } = {}
): GameResultSummary {
  const resultId = options.resultId ?? randomUUID();
  const createdAt = options.createdAt ?? new Date().toISOString();
  return {
    resultId,
    createdAt,
    results,
    highlights: createHighlights(gameRoom, results, resultId),
    titles: createTitles(gameRoom, results),
    applauseCounts: Object.fromEntries(results.map((result) => [result.playerId, 0]))
  };
}

export function ensureGameResultSummary(gameRoom: GameRoom, resultId?: string) {
  gameRoom.resultApplauseBySender ??= {};
  if (gameRoom.phase !== "ENDED") {
    gameRoom.resultSummary ??= null;
    return gameRoom.resultSummary;
  }

  const results = normalizeScoreResults(gameRoom);
  gameRoom.scoringResults = results;
  gameRoom.resultSummary ??= createGameResultSummary(gameRoom, results, {
    resultId: resultId ?? legacyResultId(gameRoom),
    createdAt: gameRoom.gameLog.find((log) => log.presentation?.kind === "game_ended")?.createdAt
  });
  for (const result of results) {
    gameRoom.resultSummary.applauseCounts[result.playerId] ??= 0;
  }
  return gameRoom.resultSummary;
}

export function applaudGameResult(
  gameRoom: GameRoom,
  senderPlayerId: string,
  targetPlayerId: string
): { ok: true; totalCount: number } | { ok: false; error: string } {
  if (gameRoom.phase !== "ENDED" || !gameRoom.resultSummary) {
    return { ok: false, error: "结算结束后才能鼓掌。" };
  }
  const sender = gameRoom.players.find((player) => player.id === senderPlayerId);
  const target = gameRoom.players.find((player) => player.id === targetPlayerId);
  if (!sender || !target) {
    return { ok: false, error: "玩家不在当前对局中。" };
  }
  if (sender.isBot || target.isBot) {
    return { ok: false, error: "机器人不能参与赛后鼓掌。" };
  }
  if (sender.id === target.id) {
    return { ok: false, error: "不能给自己鼓掌。" };
  }

  gameRoom.resultApplauseBySender ??= {};
  const applaudedTargets = gameRoom.resultApplauseBySender[sender.id] ?? [];
  if (applaudedTargets.includes(target.id)) {
    return { ok: false, error: "你已经为这位玩家鼓过掌了。" };
  }

  gameRoom.resultApplauseBySender[sender.id] = [...applaudedTargets, target.id];
  const totalCount = (gameRoom.resultSummary.applauseCounts[target.id] ?? 0) + 1;
  gameRoom.resultSummary.applauseCounts[target.id] = totalCount;
  return { ok: true, totalCount };
}

function normalizeScoreResults(gameRoom: GameRoom) {
  const calculated = buildScoreResults(gameRoom);
  const calculatedByPlayer = new Map(calculated.map((result) => [result.playerId, result]));
  if (gameRoom.scoringResults.length === 0) return calculated;
  return gameRoom.scoringResults
    .map((stored) => ({ ...calculatedByPlayer.get(stored.playerId), ...stored } as ScoreResult))
    .sort((a, b) =>
      b.totalScore - a.totalScore ||
      b.districtScore - a.districtScore ||
      gameRoom.players.findIndex((player) => player.id === a.playerId) -
        gameRoom.players.findIndex((player) => player.id === b.playerId)
    );
}

function createTitles(gameRoom: GameRoom, results: ScoreResult[]) {
  const maxDistrictCount = Math.max(0, ...results.map((result) => result.districtCount));
  const maxGold = Math.max(0, ...gameRoom.players.map((player) => player.gold));
  return Object.fromEntries(results.map((result) => {
    const player = gameRoom.players.find((candidate) => candidate.id === result.playerId);
    let title: ResultTitleType = "city_dreamer";
    if (result.playerId === gameRoom.firstCompletedCityPlayerId) {
      title = "first_city";
    } else if (result.hasFiveColors) {
      title = "five_color";
    } else if (result.districtCount === maxDistrictCount && maxDistrictCount > 0) {
      title = "city_master";
    } else if (player && player.gold === maxGold) {
      title = "treasury_keeper";
    } else if (player) {
      const counts = new Map<DistrictColor, number>();
      for (const district of player.city) {
        counts.set(district.color, (counts.get(district.color) ?? 0) + 1);
      }
      const theme = [...STANDARD_SCORING_COLORS]
        .map((color) => ({ color, count: counts.get(color) ?? 0 }))
        .sort((a, b) => b.count - a.count || STANDARD_SCORING_COLORS.indexOf(a.color) - STANDARD_SCORING_COLORS.indexOf(b.color))[0];
      if (theme && theme.count >= 3) title = THEME_TITLE[theme.color];
    }
    return [result.playerId, title];
  }));
}

function createHighlights(gameRoom: GameRoom, results: ScoreResult[], resultId: string) {
  const rankIndex = new Map(results.map((result, index) => [result.playerId, index]));
  const playerName = (playerId: string) =>
    gameRoom.players.find((player) => player.id === playerId)?.name ??
    results.find((result) => result.playerId === playerId)?.playerName ?? "";
  const candidates: HighlightCandidate[] = [];
  const add = (type: ResultHighlightType, playerId: string, value: number) => {
    if (!playerId || value <= 0) return;
    candidates.push({
      type,
      playerId,
      playerName: playerName(playerId),
      value,
      priority: HIGHLIGHT_PRIORITY.indexOf(type)
    });
  };

  if (gameRoom.firstCompletedCityPlayerId) {
    add("first_city", gameRoom.firstCompletedCityPlayerId, 1);
  }
  for (const result of results.filter((result) => result.hasFiveColors)) {
    add("five_color", result.playerId, result.districtCount);
  }

  const totalsByKind = new Map<ResultHighlightType, Map<string, number>>([
    ["largest_steal", new Map()],
    ["most_builds", new Map()],
    ["highest_role_income", new Map()],
    ["warlord_destroy", new Map()]
  ]);
  for (const log of gameRoom.gameLog) {
    const presentation = log.presentation;
    const actorId = presentation?.actorPlayerId;
    if (!presentation || !actorId) continue;
    if (presentation.kind === "thief_steal") {
      const current = totalsByKind.get("largest_steal")?.get(actorId) ?? 0;
      totalsByKind.get("largest_steal")?.set(actorId, Math.max(current, presentation.amount ?? 0));
    } else if (presentation.kind === "build_district") {
      const map = totalsByKind.get("most_builds");
      map?.set(actorId, (map.get(actorId) ?? 0) + 1);
    } else if (presentation.kind === "role_income") {
      const map = totalsByKind.get("highest_role_income");
      map?.set(actorId, (map.get(actorId) ?? 0) + (presentation.amount ?? 0));
    } else if (presentation.kind === "warlord_destroy") {
      const map = totalsByKind.get("warlord_destroy");
      map?.set(actorId, (map.get(actorId) ?? 0) + 1);
    }
  }

  for (const type of ["largest_steal", "most_builds", "highest_role_income", "warlord_destroy"] as const) {
    const entries = [...(totalsByKind.get(type)?.entries() ?? [])]
      .sort((a, b) => b[1] - a[1] || (rankIndex.get(a[0]) ?? 999) - (rankIndex.get(b[0]) ?? 999));
    if (entries[0]) add(type, entries[0][0], entries[0][1]);
  }
  for (const result of results) add("district_score", result.playerId, result.districtScore);

  candidates.sort((a, b) =>
    a.priority - b.priority ||
    b.value - a.value ||
    (rankIndex.get(a.playerId) ?? 999) - (rankIndex.get(b.playerId) ?? 999)
  );
  const selected: HighlightCandidate[] = [];
  const usedPlayers = new Set<string>();
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (usedPlayers.has(candidate.playerId)) continue;
    selected.push(candidate);
    usedPlayers.add(candidate.playerId);
  }
  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
  }

  return selected.map(({ priority: _priority, ...candidate }, index) => ({
    ...candidate,
    id: `${resultId}:${candidate.type}:${candidate.playerId}:${index}`
  }));
}

function legacyResultId(gameRoom: GameRoom) {
  const endedLog = gameRoom.gameLog.find((log) => log.presentation?.kind === "game_ended");
  return `legacy-${gameRoom.roomId}-${endedLog?.id ?? gameRoom.currentRound}`;
}

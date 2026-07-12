import type { DistrictCard, GameRoom } from "@zy/shared";
import { loadDistrictCards } from "./cardData";

export type DistrictCardIntegrityResult = {
  ok: boolean;
  expectedCount: number;
  actualCount: number;
  duplicateIds: string[];
  missingIds: string[];
  unexpectedIds: string[];
};

export function inspectDistrictCardIntegrity(gameRoom: GameRoom): DistrictCardIntegrityResult {
  const expectedCards = loadDistrictCards();
  const cards = collectDistrictCards(gameRoom);
  const expectedIds = new Set(expectedCards.map((card) => card.id));
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);

  const duplicateIds = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
  const missingIds = [...expectedIds].filter((id) => !counts.has(id)).sort();
  const unexpectedIds = [...counts.keys()].filter((id) => !expectedIds.has(id)).sort();

  return {
    ok: cards.length === expectedCards.length && duplicateIds.length === 0 && missingIds.length === 0 && unexpectedIds.length === 0,
    expectedCount: expectedCards.length,
    actualCount: cards.length,
    duplicateIds,
    missingIds,
    unexpectedIds
  };
}

function collectDistrictCards(gameRoom: GameRoom): DistrictCard[] {
  return [
    ...gameRoom.districtDeck,
    ...gameRoom.districtDiscardPile,
    ...gameRoom.players.flatMap((player) => [...player.hand, ...player.city]),
    ...(gameRoom.pendingDrawChoice?.drawnCards ?? []),
    ...(gameRoom.pendingGraveyardChoice ? [gameRoom.pendingGraveyardChoice.districtCard] : [])
  ];
}

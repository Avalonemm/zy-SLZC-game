import type { DistrictCard, GameRoom } from "@zy/shared";

export function drawAvailableDistrictCards(gameRoom: GameRoom, count: number): DistrictCard[] {
  refillDistrictDeckFromDiscard(gameRoom, count);
  return gameRoom.districtDeck.splice(0, Math.min(count, gameRoom.districtDeck.length));
}

export function refillDistrictDeckFromDiscard(gameRoom: GameRoom, desiredCount = 1) {
  if (gameRoom.districtDeck.length >= desiredCount || gameRoom.districtDiscardPile.length === 0) {
    return;
  }

  const shuffledDiscard = shuffleCards(gameRoom.districtDiscardPile);
  gameRoom.districtDiscardPile = [];
  gameRoom.districtDeck.push(...shuffledDiscard);
}

export function returnDistrictCardsToDeckBottom(gameRoom: GameRoom, cards: DistrictCard[]) {
  gameRoom.districtDeck.push(...cards);
}

function shuffleCards<T>(cards: T[]) {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
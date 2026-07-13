import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ActionEventPayload, DistrictCard, VisibleGameState } from "@zy/shared";
import type { RefObject } from "react";
import type { GameCommandFeedback } from "./useGameCommandFeedback";

export type BuildAnimationStatus = "pending" | "success" | "failure";
export type BuildAnimationVariant = "self" | "opponent" | "late-entry";

export type BuildAnimationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type BuildAnimationTransaction = {
  id: string;
  actorPlayerId: string;
  card: DistrictCard;
  sourceRect: BuildAnimationRect;
  startedAt: number;
  status: BuildAnimationStatus;
  variant: BuildAnimationVariant;
};

type RolledBackBuild = {
  card: DistrictCard;
  sourceRect: BuildAnimationRect;
  expiresAt: number;
};

const ROLLBACK_CACHE_MS = 15_000;

export function useBuildAnimationTransactions(input: {
  actionEvents: ActionEventPayload[];
  commandFeedback: GameCommandFeedback | null;
  gameState: VisibleGameState;
  selfPlayerId: string | null;
  tableRef: RefObject<HTMLElement | null>;
}) {
  const [transactions, setTransactions] = useState<BuildAnimationTransaction[]>([]);
  const [arrivalHighlights, setArrivalHighlights] = useState<string[]>([]);
  const transactionsRef = useRef<BuildAnimationTransaction[]>([]);
  const sequenceRef = useRef(0);
  const seenEventIdsRef = useRef(new Set<string>());
  const seenFeedbackIdRef = useRef<number | null>(null);
  const rolledBackRef = useRef(new Map<string, RolledBackBuild>());
  const opponentHandSourceRectsRef = useRef(new Map<string, BuildAnimationRect>());
  transactionsRef.current = transactions;

  useLayoutEffect(() => {
    const table = input.tableRef.current;
    if (!table) {
      return;
    }
    for (const player of input.gameState.players) {
      if (player.id === input.selfPlayerId) {
        continue;
      }
      const hand = findByDataValue(table, "data-opponent-hand-player-id", player.id);
      const cards = hand?.querySelectorAll<HTMLElement>(".citadel-mini-card") ?? [];
      const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
      const rect = snapshotRect(topCard);
      if (rect) {
        opponentHandSourceRectsRef.current.set(player.id, rect);
      }
    }
  }, [input.gameState.players, input.selfPlayerId, input.tableRef]);

  const beginSelfBuild = useCallback((card: DistrictCard, send: () => boolean) => {
    const table = input.tableRef.current;
    const source = table
      ? findByDataValue(table, "data-hand-card-id", card.id)
      : null;
    const fallback = table?.querySelector<HTMLElement>(".citadel-hand-zone") ?? null;
    const sourceRect = snapshotRect(source ?? fallback);
    const selfPlayerId = input.selfPlayerId;
    if (!sourceRect || !selfPlayerId) {
      return false;
    }
    const sent = send();
    if (!sent) {
      return false;
    }

    sequenceRef.current += 1;
    setTransactions((current) => [
      ...current,
      {
        id: `build-${selfPlayerId}-${card.id}-${sequenceRef.current}`,
        actorPlayerId: selfPlayerId,
        card,
        sourceRect,
        startedAt: performance.now(),
        status: "pending" as const,
        variant: "self" as const
      }
    ].slice(-6));
    return true;
  }, [input.selfPlayerId, input.tableRef]);

  useEffect(() => {
    const feedback = input.commandFeedback;
    if (
      !feedback ||
      feedback.id === seenFeedbackIdRef.current ||
      feedback.commandKey !== "build" ||
      feedback.kind !== "error"
    ) {
      return;
    }
    seenFeedbackIdRef.current = feedback.id;
    setTransactions((current) => {
      const pendingIndex = findLastIndex(
        current,
        (transaction) => transaction.variant === "self" && transaction.status === "pending"
      );
      if (pendingIndex < 0) {
        return current;
      }
      return current.map((transaction, index) =>
        index === pendingIndex ? { ...transaction, status: "failure" } : transaction
      );
    });
  }, [input.commandFeedback]);

  useEffect(() => {
    const incoming = [...input.actionEvents]
      .reverse()
      .filter((event) =>
        event.presentation?.kind === "build_district" &&
        !seenEventIdsRef.current.has(event.id)
      );
    if (incoming.length === 0) {
      return;
    }

    for (const event of incoming) {
      seenEventIdsRef.current.add(event.id);
    }

    setTransactions((current) => {
      let next = current;
      for (const event of incoming) {
        const presentation = event.presentation;
        const actorPlayerId = presentation?.actorPlayerId;
        const districtCardId = presentation?.districtCardId;
        if (!actorPlayerId || !districtCardId) {
          continue;
        }

        const existingIndex = next.findIndex(
          (transaction) =>
            transaction.actorPlayerId === actorPlayerId &&
            transaction.card.id === districtCardId &&
            transaction.status !== "success"
        );
        if (existingIndex >= 0) {
          next = next.map((transaction, index) =>
            index === existingIndex ? { ...transaction, status: "success" } : transaction
          );
          continue;
        }

        const actor = input.gameState.players.find((player) => player.id === actorPlayerId);
        const card = actor?.city.find((district) => district.id === districtCardId) ??
          presentationCard(event);
        if (!card) {
          continue;
        }

        const rolledBack = actorPlayerId === input.selfPlayerId
          ? rolledBackRef.current.get(districtCardId)
          : null;
        const sourceElement = actorPlayerId === input.selfPlayerId
          ? input.tableRef.current?.querySelector<HTMLElement>(".citadel-hand-zone") ?? null
          : input.tableRef.current
            ? topOpponentHandCard(input.tableRef.current, actorPlayerId)
            : null;
        const sourceRect = rolledBack?.sourceRect ??
          (actorPlayerId === input.selfPlayerId
            ? snapshotRect(sourceElement)
            : opponentHandSourceRectsRef.current.get(actorPlayerId) ?? snapshotRect(sourceElement));
        if (!sourceRect) {
          continue;
        }

        sequenceRef.current += 1;
        next = [...next, {
          id: `build-${actorPlayerId}-${districtCardId}-${sequenceRef.current}`,
          actorPlayerId,
          card,
          sourceRect,
          startedAt: performance.now(),
          status: "success" as const,
          variant: actorPlayerId === input.selfPlayerId ? "late-entry" as const : "opponent" as const
        }].slice(-6);
        rolledBackRef.current.delete(districtCardId);
      }
      return next;
    });
  }, [input.actionEvents, input.gameState.players, input.selfPlayerId, input.tableRef]);

  useEffect(() => {
    if (!input.selfPlayerId) {
      return;
    }
    const self = input.gameState.players.find((player) => player.id === input.selfPlayerId);
    if (!self) {
      return;
    }
    const cityIds = new Set(self.city.map((card) => card.id));

    setTransactions((current) => {
      let changed = false;
      const next = current.map((transaction) => {
        if (
          transaction.actorPlayerId === input.selfPlayerId &&
          transaction.status !== "success" &&
          cityIds.has(transaction.card.id)
        ) {
          changed = true;
          return { ...transaction, status: "success" as const };
        }
        return transaction;
      });
      return changed ? next : current;
    });

    const now = Date.now();
    for (const [cardId, rolledBack] of rolledBackRef.current) {
      if (rolledBack.expiresAt <= now) {
        rolledBackRef.current.delete(cardId);
        continue;
      }
      if (!cityIds.has(cardId)) {
        continue;
      }
      setTransactions((current) => {
        if (current.some((transaction) => transaction.card.id === cardId)) {
          return current;
        }
        sequenceRef.current += 1;
        return [...current, {
          id: `build-${input.selfPlayerId}-${cardId}-${sequenceRef.current}`,
          actorPlayerId: input.selfPlayerId!,
          card: rolledBack.card,
          sourceRect: rolledBack.sourceRect,
          startedAt: performance.now(),
          status: "success" as const,
          variant: "late-entry" as const
        }].slice(-6);
      });
      rolledBackRef.current.delete(cardId);
    }
  }, [input.gameState.players, input.selfPlayerId]);

  const finishTransaction = useCallback((transactionId: string, outcome: "success" | "failure") => {
    const transaction = transactionsRef.current.find((candidate) => candidate.id === transactionId);
    if (!transaction) {
      return;
    }
    if (outcome === "failure") {
      rolledBackRef.current.set(transaction.card.id, {
        card: transaction.card,
        sourceRect: transaction.sourceRect,
        expiresAt: Date.now() + ROLLBACK_CACHE_MS
      });
    } else {
      setArrivalHighlights((ids) => ids.includes(transaction.card.id)
        ? ids
        : [...ids, transaction.card.id]);
      window.setTimeout(() => {
        setArrivalHighlights((ids) => ids.filter((id) => id !== transaction.card.id));
      }, 900);
    }
    setTransactions((current) => current.filter((candidate) => candidate.id !== transactionId));
  }, []);

  const selfCityIds = useMemo(() => new Set(
    input.gameState.players
      .find((player) => player.id === input.selfPlayerId)
      ?.city.map((card) => card.id) ?? []
  ), [input.gameState.players, input.selfPlayerId]);

  const pendingSelfCards = useMemo(() => transactions
    .filter((transaction) =>
      transaction.actorPlayerId === input.selfPlayerId &&
      transaction.variant !== "late-entry" &&
      !selfCityIds.has(transaction.card.id)
    )
    .map((transaction) => transaction.card), [input.selfPlayerId, selfCityIds, transactions]);

  return {
    arrivalHighlights,
    beginSelfBuild,
    finishTransaction,
    hiddenDistrictCardIds: new Set(transactions
      .filter((transaction) => transaction.status !== "failure")
      .map((transaction) => transaction.card.id)),
    pendingSelfCardIds: new Set(transactions
      .filter((transaction) => transaction.actorPlayerId === input.selfPlayerId && transaction.variant !== "late-entry")
      .map((transaction) => transaction.card.id)),
    pendingSelfCards,
    transactions
  };
}

function snapshotRect(element: Element | null): BuildAnimationRect | null {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function findByDataValue(root: HTMLElement, attribute: string, value: string) {
  return [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)]
    .find((element) => element.getAttribute(attribute) === value) ?? null;
}

function topOpponentHandCard(root: HTMLElement, playerId: string) {
  const hand = findByDataValue(root, "data-opponent-hand-player-id", playerId);
  const cards = hand?.querySelectorAll<HTMLElement>(".citadel-mini-card") ?? [];
  return cards.length > 0 ? cards[cards.length - 1] : null;
}

function presentationCard(event: ActionEventPayload): DistrictCard | null {
  const presentation = event.presentation;
  if (!presentation?.districtCardId || !presentation.districtColor) {
    return null;
  }
  return {
    id: presentation.districtCardId,
    name: presentation.districtName ?? "已建建筑",
    cost: presentation.cost ?? 0,
    color: presentation.districtColor,
    score: presentation.cost ?? 0,
    description: "",
    effectType: "none",
    effectParams: {}
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }
  return -1;
}

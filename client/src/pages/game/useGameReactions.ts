import { useCallback, useEffect, useState } from "react";
import type { ReactionEventPayload, ReactionType } from "@zy/shared";
import { socket } from "../../socket/socketClient";

export type ActiveGameReaction = ReactionEventPayload & {
  expiresAt: number;
};

const reactionVisibleMs = 2_200;

export function useGameReactions(roomCode: string) {
  const [activeReactions, setActiveReactions] = useState<ActiveGameReaction[]>([]);

  useEffect(() => {
    setActiveReactions([]);

    function handleReaction(event: ReactionEventPayload) {
      if (event.roomCode !== roomCode) return;
      setActiveReactions((current) => [
        ...current.filter((reaction) => reaction.playerId !== event.playerId),
        { ...event, expiresAt: Date.now() + reactionVisibleMs }
      ].slice(-8));
    }

    socket.on("reaction_event", handleReaction);
    return () => {
      socket.off("reaction_event", handleReaction);
    };
  }, [roomCode]);

  useEffect(() => {
    if (activeReactions.length === 0) return;
    const nextExpiry = Math.min(...activeReactions.map((reaction) => reaction.expiresAt));
    const timeout = window.setTimeout(() => {
      const now = Date.now();
      setActiveReactions((current) => current.filter((reaction) => reaction.expiresAt > now));
    }, Math.max(0, nextExpiry - Date.now()) + 10);
    return () => window.clearTimeout(timeout);
  }, [activeReactions]);

  const sendReaction = useCallback((reaction: ReactionType) => {
    socket.emit("send_reaction", { roomCode, reaction });
  }, [roomCode]);

  return { activeReactions, sendReaction };
}

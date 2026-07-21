import { useLayoutEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ReactionType, VisibleGameState } from "@zy/shared";
import type { ActiveGameReaction } from "./useGameReactions";

type ReactionPoint = { left: number; top: number; tailOffset: number };

const reactionLabels: Record<ReactionType, string> = {
  nice: "👏 漂亮",
  upset: "😤 可恶",
  danger: "⚠️ 危险",
  close: "😮 好险"
};

export function GameReactionLayer(props: {
  reactions: ActiveGameReaction[];
  gameState: VisibleGameState;
  tableRef: RefObject<HTMLElement | null>;
}) {
  const [points, setPoints] = useState<Record<string, ReactionPoint>>({});

  useLayoutEffect(() => {
    const table = props.tableRef.current;
    if (!table || props.reactions.length === 0) {
      setPoints({});
      return;
    }

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const tableRect = table.getBoundingClientRect();
        const next: Record<string, ReactionPoint> = {};
        for (const reaction of props.reactions) {
          const anchor = [...table.querySelectorAll<HTMLElement>(".citadel-player-mini[data-player-id]")]
            .find((element) => element.dataset.playerId === reaction.playerId);
          if (!anchor) continue;
          const rect = anchor.getBoundingClientRect();
          const anchorX = rect.left - tableRect.left + rect.width / 2;
          const inwardDirection = anchorX < tableRect.width / 2 ? 1 : -1;
          const preferredLeft = anchorX + inwardDirection * 8;
          const left = Math.max(72, Math.min(tableRect.width - 72, preferredLeft));
          next[reaction.playerId] = {
            left,
            top: Math.max(44, rect.top - tableRect.top - 8),
            tailOffset: Math.max(-38, Math.min(38, anchorX - left))
          };
        }
        setPoints(next);
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(table);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [props.reactions, props.tableRef]);

  if (props.reactions.length === 0) return null;

  return (
    <aside className="citadel-reaction-layer" aria-live="polite" aria-label="玩家快捷反应">
      {props.reactions.map((reaction) => {
        const point = points[reaction.playerId];
        if (!point) return null;
        const playerName = props.gameState.players.find((player) => player.id === reaction.playerId)?.name ?? "玩家";
        const label = reactionLabels[reaction.reaction];
        return (
          <div
            aria-label={`${playerName}：${label}`}
            className="citadel-reaction-bubble"
            data-reaction-player-id={reaction.playerId}
            data-reaction-type={reaction.reaction}
            key={reaction.id}
            role="status"
            style={{
              left: point.left,
              top: point.top,
              "--reaction-tail-offset": `${point.tailOffset}px`
            } as CSSProperties}
          >
            {label}
          </div>
        );
      })}
    </aside>
  );
}

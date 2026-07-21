import { useEffect, useRef, useState } from "react";
import type { ReactionType } from "@zy/shared";
import type { GamePlayer } from "./gameTypes";
import { GamePlayerMiniStatus } from "./GamePlayerMiniStatus";

const reactionOptions: Array<{ type: ReactionType; label: string }> = [
  { type: "nice", label: "👏 漂亮" },
  { type: "upset", label: "😤 可恶" },
  { type: "danger", label: "⚠️ 危险" },
  { type: "close", label: "😮 好险" }
];

export function GameSelfReactionControl(props: {
  avatarImage: string | null;
  avatarLabel: string;
  hasCrown: boolean;
  isCurrent: boolean;
  player: GamePlayer;
  onSendReaction: (reaction: ReactionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerId = `citadel-reaction-picker-${props.player.id}`;

  function focusTrigger() {
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>(".citadel-player-mini")?.focus();
    });
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      focusTrigger();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="citadel-self-reaction-control" data-reaction-picker-open={open ? "true" : "false"} ref={rootRef}>
      {open && (
        <div
          aria-label="选择快捷反应"
          className="citadel-reaction-picker"
          id={pickerId}
          role="group"
        >
          {reactionOptions.map((option) => (
            <button
              data-reaction-option={option.type}
              key={option.type}
              type="button"
              onClick={() => {
                props.onSendReaction(option.type);
                setOpen(false);
                focusTrigger();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <GamePlayerMiniStatus
        avatarImage={props.avatarImage}
        avatarLabel={props.avatarLabel}
        controls={pickerId}
        expanded={open}
        hasCrown={props.hasCrown}
        interactionLabel={open ? "关闭快捷反应" : "发送快捷反应"}
        interactionTitle="发送快捷反应"
        isCurrent={props.isCurrent}
        player={props.player}
        reactionOpen={open}
        self
        onClick={() => setOpen((current) => !current)}
      />
    </div>
  );
}

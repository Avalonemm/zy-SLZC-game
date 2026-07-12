import { useState } from "react";
import type { ActionEventPayload, ChatMessage, VisibleGameState } from "@zy/shared";
import { ChatPanel } from "../../components/ui/ChatPanel";
import { GameLogPanel } from "./GameLogPanel";

export function GameCornerDocks(props: {
  actionEvents: ActionEventPayload[];
  chatMessages: ChatMessage[];
  gameState: VisibleGameState;
  onSendChatMessage: (message: string) => void;
}) {
  const [openPanel, setOpenPanel] = useState<"log" | "chat" | null>(null);
  return (
    <>
      <button
        className="citadel-corner-dock citadel-corner-dock--log"
        type="button"
        onClick={() => setOpenPanel((current) => (current === "log" ? null : "log"))}
      >
        <span aria-hidden="true">⌕</span>
        {"\u6e38\u620f\u65e5\u5fd7"}
        <b>{openPanel === "log" ? "⌃" : "⌄"}</b>
      </button>
      <button
        className="citadel-corner-dock citadel-corner-dock--chat"
        type="button"
        onClick={() => setOpenPanel((current) => (current === "chat" ? null : "chat"))}
      >
        <span aria-hidden="true">⌕</span>
        {"\u804a\u5929"}
        <b>{openPanel === "chat" ? "⌃" : "⌄"}</b>
      </button>
      {openPanel === "log" && (
        <aside className="citadel-pop-dock citadel-pop-dock--log" aria-label={"\u6e38\u620f\u65e5\u5fd7"}>
          <GameLogPanel actionEvents={props.actionEvents} gameLog={props.gameState.gameLog} />
        </aside>
      )}
      {openPanel === "chat" && (
        <aside className="citadel-pop-dock citadel-pop-dock--chat" aria-label={"\u804a\u5929"}>
          <ChatPanel messages={props.chatMessages} onSendMessage={props.onSendChatMessage} />
        </aside>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ActionEventPayload, ChatMessage, VisibleGameState } from "@zy/shared";
import { ChatPanel } from "../../components/ui/ChatPanel";
import { GameLogPanel } from "./GameLogPanel";

type PanelId = "log" | "chat";

export function GameCornerDocks(props: {
  actionEvents: ActionEventPayload[];
  chatMessages: ChatMessage[];
  compact: boolean;
  gameState: VisibleGameState;
  resultMode: boolean;
  onSendChatMessage: (message: string) => void;
}) {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  function focusTrigger(panel: PanelId) {
    window.requestAnimationFrame(() => {
      (panel === "log" ? logButtonRef.current : chatButtonRef.current)?.focus();
    });
  }

  function closePanel() {
    if (!openPanel) {
      return;
    }
    const closingPanel = openPanel;
    setOpenPanel(null);
    focusTrigger(closingPanel);
  }

  function togglePanel(panel: PanelId) {
    if (openPanel === panel) {
      closePanel();
      return;
    }
    setOpenPanel(panel);
  }

  useEffect(() => {
    if (props.resultMode && openPanel === "log") {
      setOpenPanel(null);
      window.requestAnimationFrame(() => chatButtonRef.current?.focus());
    }
  }, [openPanel, props.resultMode]);

  useEffect(() => {
    if (!openPanel) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (!props.compact || event.key !== "Tab" || !drawerRef.current) {
        return;
      }
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openPanel, props.compact]);

  const panelContent = openPanel === "log"
    ? <GameLogPanel actionEvents={props.actionEvents} gameLog={props.gameState.gameLog} />
    : openPanel === "chat"
      ? <ChatPanel messages={props.chatMessages} onSendMessage={props.onSendChatMessage} />
      : null;
  const panelLabel = openPanel === "log" ? "\u6e38\u620f\u65e5\u5fd7" : "\u804a\u5929";

  return (
    <>
      {!props.resultMode ? (
        <button
          aria-controls="citadel-log-panel"
          aria-expanded={openPanel === "log"}
          className="citadel-corner-dock citadel-corner-dock--log"
          ref={logButtonRef}
          type="button"
          onClick={() => togglePanel("log")}
        >
          <span aria-hidden="true" className="citadel-corner-dock__icon">{"\u2315"}</span>
          <span className="citadel-corner-dock__label">{"\u6e38\u620f\u65e5\u5fd7"}</span>
          <b>{openPanel === "log" ? "\u2303" : "\u2304"}</b>
        </button>
      ) : null}
      <button
        aria-controls="citadel-chat-panel"
        aria-expanded={openPanel === "chat"}
        className={`citadel-corner-dock citadel-corner-dock--chat ${props.resultMode ? "citadel-corner-dock--result" : ""}`}
        ref={chatButtonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          togglePanel("chat");
        }}
      >
        <span aria-hidden="true" className="citadel-corner-dock__icon">{"\u2315"}</span>
        <span className="citadel-corner-dock__label">{"\u804a\u5929"}</span>
        <b>{openPanel === "chat" ? "\u2303" : "\u2304"}</b>
      </button>
      {openPanel && props.compact ? (
        <div className={`citadel-drawer-backdrop ${props.resultMode ? "citadel-drawer-backdrop--result" : ""}`} role="presentation" onMouseDown={closePanel}>
          <aside
            aria-labelledby={`citadel-${openPanel}-panel-title`}
            aria-modal="true"
            className={`citadel-pop-dock citadel-pop-dock--drawer citadel-pop-dock--${openPanel} ${props.resultMode ? "citadel-pop-dock--result" : ""}`}
            id={`citadel-${openPanel}-panel`}
            ref={drawerRef}
            role="dialog"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="citadel-pop-dock__header">
              <h2 id={`citadel-${openPanel}-panel-title`}>{panelLabel}</h2>
              <button autoFocus aria-label={"\u5173\u95ed"} type="button" onClick={closePanel}>×</button>
            </header>
            {panelContent}
          </aside>
        </div>
      ) : openPanel ? (
        <aside
          aria-label={panelLabel}
          className={`citadel-pop-dock citadel-pop-dock--${openPanel} ${props.resultMode ? "citadel-pop-dock--result" : ""}`}
          id={`citadel-${openPanel}-panel`}
        >
          {panelContent}
        </aside>
      ) : null}
    </>
  );
}

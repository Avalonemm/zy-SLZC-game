import { useState } from "react";
import type { FormEvent } from "react";
import type { ChatMessage } from "@zy/shared";
import { GameButton } from "./GameButton";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
};

export function ChatPanel(props: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) {
      return;
    }

    props.onSendMessage(message);
    setDraft("");
  }

  return (
    <section className="chat-panel">
      <h3>聊天</h3>
      <div className="chat-panel__messages">
        {props.messages.slice(-20).map((message) => (
          <p key={message.id}>
            <strong>{message.playerName}：</strong>
            <span>{message.message}</span>
          </p>
        ))}
        {props.messages.length === 0 && <p>暂无聊天。</p>}
      </div>
      <form className="chat-panel__form" onSubmit={submitMessage}>
        <input
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="输入消息..."
          type="text"
          value={draft}
        />
        <GameButton size="sm" type="submit" variant="secondary">
          发送
        </GameButton>
      </form>
    </section>
  );
}

import { GameButton } from "./GameButton";
import { GameInput } from "./GameInput";
import { GamePanel } from "./GamePanel";

type ChatMessage = {
  id: string;
  author: string;
  content: string;
  time: string;
};

type ChatBoxProps = {
  messages?: ChatMessage[];
};

export function ChatBox({ messages = [] }: ChatBoxProps) {
  return (
    <GamePanel className="chat-box" title="聊天">
      <div className="chat-box__messages">
        {messages.map((message) => (
          <p key={message.id}>
            <span>{message.time}</span> {message.author}：{message.content}
          </p>
        ))}
      </div>
      <GameInput
        placeholder="输入消息..."
        rightSlot={<GameButton size="sm" variant="secondary">发送</GameButton>}
      />
    </GamePanel>
  );
}

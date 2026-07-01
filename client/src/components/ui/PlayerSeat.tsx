import { GameBadge } from "./GameBadge";

type PlayerSeatProps = {
  avatar?: string | null;
  avatarLabel: string;
  connected?: boolean;
  isBot?: boolean;
  isHost?: boolean;
  isReady?: boolean;
  name: string;
};

export function PlayerSeat({
  avatar,
  avatarLabel,
  connected = true,
  isBot = false,
  isHost = false,
  isReady = false,
  name
}: PlayerSeatProps) {
  return (
    <article className="player-seat">
      <div className="player-seat__avatar">
        {avatar ? <img src={avatar} alt="" /> : <span>{avatarLabel}</span>}
      </div>
      <div className="player-seat__copy">
        <strong>{name}</strong>
        <p>
          {connected ? "在线" : "离线"}
          {isBot ? " · 人机" : ""}
        </p>
      </div>
      <div className="player-seat__state">
        {isHost && <GameBadge tone="active">房主</GameBadge>}
        <GameBadge tone={isReady ? "ready" : "default"}>
          {isReady ? "已准备" : "等待中"}
        </GameBadge>
      </div>
    </article>
  );
}

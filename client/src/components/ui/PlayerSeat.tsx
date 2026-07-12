import { GameBadge } from "./GameBadge";

type PlayerSeatProps = {
  avatar?: string | null;
  avatarLabel: string;
  connected?: boolean;
  isBot?: boolean;
  isHost?: boolean;
  isReady?: boolean;
  name?: string;
  onKickPlayer?: () => void;
  onRemoveBot?: () => void;
  onTransferHost?: () => void;
};

export function PlayerSeat({
  avatar,
  avatarLabel,
  connected = true,
  isBot = false,
  isHost = false,
  isReady = false,
  name,
  onKickPlayer,
  onRemoveBot,
  onTransferHost
}: PlayerSeatProps) {
  if (!name) {
    return (
      <article className="player-seat player-seat--empty">
        <div className="player-seat__avatar">
          <span>空</span>
        </div>
        <div className="player-seat__copy">
          <strong>空席位</strong>
          <p>等待玩家加入</p>
        </div>
      </article>
    );
  }

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
        {!isHost && (
          <GameBadge tone={isReady ? "ready" : "default"}>
            {isReady ? "已准备" : "等待中"}
          </GameBadge>
        )}
        {isBot && onRemoveBot && (
          <button className="player-seat__mini-action" type="button" onClick={onRemoveBot}>
            删除
          </button>
        )}
        {!isBot && onTransferHost && (
          <button className="player-seat__mini-action" type="button" onClick={onTransferHost}>
            移交
          </button>
        )}
        {!isBot && onKickPlayer && (
          <button
            className="player-seat__mini-action player-seat__mini-action--danger"
            type="button"
            onClick={onKickPlayer}
          >
            踢出
          </button>
        )}
      </div>
    </article>
  );
}

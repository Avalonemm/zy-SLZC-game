import type { GamePlayer } from "./gameTypes";

export function GamePlayerMiniStatus(props: {
  avatarImage?: string | null;
  avatarLabel?: string;
  hasCrown: boolean;
  isCurrent?: boolean;
  player: GamePlayer;
  self?: boolean;
  targetable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const avatarText = props.avatarLabel || (props.self ? "\u4f60" : props.player.name.slice(0, 1));
  const className = `citadel-player-mini ${props.self ? "citadel-player-mini--self" : ""} ${props.isCurrent ? "is-current" : ""} ${props.targetable ? "is-player-targetable" : ""} ${props.selected ? "is-player-target-selected" : ""}`;
  const body = (
    <>
      <span className="citadel-player-mini__avatar-wrap">
        {props.hasCrown && (
          <span
            className="citadel-player-mini__crown"
            title={"\u738b\u51a0\u6301\u6709\u8005"}
            aria-label={"\u738b\u51a0\u6301\u6709\u8005"}
            role="img"
          />
        )}
        <span className="citadel-player-mini__avatar">
          {props.avatarImage ? <img alt="" src={props.avatarImage} /> : avatarText}
        </span>
      </span>
      <span className="citadel-player-mini__copy">
        <span className="citadel-player-mini__name-line">
          <strong>{props.self ? "\u4f60" : props.player.name}</strong>
        </span>
        <small>
          <i aria-hidden="true">{props.player.connected ? "\u25cf" : "\u25cb"}</i>
          {props.player.isBot ? "人机" : "玩家"} · {props.player.connected ? "在线" : "离线"}
        </small>
      </span>
      <span className="citadel-player-mini__resources" aria-label="玩家资源">
        <span className="citadel-player-mini__stat citadel-player-mini__stat--gold" aria-label={`金币 ${props.player.gold}`} title={`金币 ${props.player.gold}`}>{props.player.gold}</span>
        <span className="citadel-player-mini__stat citadel-player-mini__stat--hand" aria-label={`手牌 ${props.player.handCount} 张`} title={`手牌 ${props.player.handCount} 张`}>{props.player.handCount}</span>
        <span className="citadel-player-mini__stat citadel-player-mini__stat--city" data-player-city-count={props.player.city.length} aria-label={`建筑 ${props.player.city.length}`} title={`建筑 ${props.player.city.length}`}>{props.player.city.length}</span>
      </span>
      {props.isCurrent && <em className="citadel-player-mini__turn-badge">行动中</em>}
    </>
  );

  if (props.onClick) {
    return (
      <button
        className={className}
        data-player-id={props.player.id}
        data-player-gold={props.player.gold}
        type="button"
        onClick={props.onClick}
        aria-label={`选择 ${props.player.name} 交换手牌`}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={className}
      data-player-id={props.player.id}
      data-player-gold={props.player.gold}
    >
      {body}
    </div>
  );
}

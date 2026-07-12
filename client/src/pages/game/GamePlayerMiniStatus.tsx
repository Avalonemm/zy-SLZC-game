import type { GamePlayer } from "./gameTypes";

export function GamePlayerMiniStatus(props: {
  avatarImage?: string | null;
  avatarLabel?: string;
  hasCrown: boolean;
  player: GamePlayer;
  self?: boolean;
  targetable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const avatarText = props.avatarLabel || (props.self ? "\u4f60" : props.player.name.slice(0, 1));
  const className = `citadel-player-mini ${props.self ? "citadel-player-mini--self" : ""} ${props.targetable ? "is-player-targetable" : ""} ${props.selected ? "is-player-target-selected" : ""}`;
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
        <small>{props.player.connected ? "\u25cf" : "\u25cb"}</small>
      </span>
      <span className="citadel-player-mini__stat citadel-player-mini__stat--gold">{props.player.gold}</span>
      <span className="citadel-player-mini__stat citadel-player-mini__stat--hand">{props.player.handCount}</span>
      <span className="citadel-player-mini__stat citadel-player-mini__stat--city">{props.player.city.length}</span>
    </>
  );

  if (props.onClick) {
    return (
      <button
        className={className}
        data-player-id={props.player.id}
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
    >
      {body}
    </div>
  );
}

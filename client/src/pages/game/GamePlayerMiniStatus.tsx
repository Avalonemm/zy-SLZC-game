import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import type { GamePlayer } from "./gameTypes";
import { FittedPlayerName } from "./FittedPlayerName";
import { PLAYER_RESOURCE_DELTA_MS } from "./presentationTiming";

type ResourceDeltas = {
  gold: number;
  hand: number;
  revision: number;
};

export function GamePlayerMiniStatus(props: {
  avatarImage?: string | null;
  avatarLabel?: string;
  hasCrown: boolean;
  isCurrent?: boolean;
  player: GamePlayer;
  self?: boolean;
  targetable?: boolean;
  selected?: boolean;
  interactionLabel?: string;
  interactionTitle?: string;
  expanded?: boolean;
  controls?: string;
  reactionOpen?: boolean;
  resourceDeltaEpoch?: string | number;
  showResourceDeltas?: boolean;
  onClick?: () => void;
}) {
  const resourceSnapshot = useRef({
    epoch: props.resourceDeltaEpoch,
    gold: props.player.gold,
    hand: props.player.handCount
  });
  const [resourceDeltas, setResourceDeltas] = useState<ResourceDeltas | null>(null);

  useEffect(() => {
    const previous = resourceSnapshot.current;
    const epochChanged = previous.epoch !== props.resourceDeltaEpoch;
    const gold = props.player.gold - previous.gold;
    const hand = props.player.handCount - previous.hand;
    resourceSnapshot.current = {
      epoch: props.resourceDeltaEpoch,
      gold: props.player.gold,
      hand: props.player.handCount
    };

    if (epochChanged || !props.showResourceDeltas) {
      setResourceDeltas(null);
      return;
    }
    if (gold !== 0 || hand !== 0) {
      setResourceDeltas((current) => ({
        gold,
        hand,
        revision: (current?.revision ?? 0) + 1
      }));
    }
  }, [
    props.player.gold,
    props.player.handCount,
    props.resourceDeltaEpoch,
    props.showResourceDeltas
  ]);

  useEffect(() => {
    if (!resourceDeltas) return;
    const timeout = window.setTimeout(() => setResourceDeltas(null), PLAYER_RESOURCE_DELTA_MS);
    return () => window.clearTimeout(timeout);
  }, [resourceDeltas?.revision]);

  const avatarText = props.avatarLabel || (props.self ? "\u4f60" : Array.from(props.player.name)[0] ?? "");
  const visibleStatus = !props.player.connected ? "\u79bb\u7ebf" : props.player.isBot ? "\u4eba\u673a" : "\u5728\u7ebf";
  const className = `citadel-player-mini ${props.self ? "citadel-player-mini--self" : ""} ${props.isCurrent ? "is-current" : ""} ${props.targetable ? "is-player-targetable" : ""} ${props.selected ? "is-player-target-selected" : ""} ${props.reactionOpen ? "is-reaction-open" : ""}`;
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
          <FittedPlayerName name={props.player.name} />
        </span>
        <small aria-label={`${props.player.name}\uff0c${visibleStatus}`}>
          <i aria-hidden="true">{props.player.connected ? "\u25cf" : "\u25cb"}</i>
          {visibleStatus}
        </small>
      </span>
      <span className="citadel-player-mini__resources" aria-label="玩家资源">
        <span className="citadel-player-mini__stat citadel-player-mini__stat--gold" aria-label={`金币 ${props.player.gold}`} title={`金币 ${props.player.gold}`}>
          <span className="citadel-player-mini__stat-value">
            {props.player.gold}
            {resourceDeltas?.gold ? (
              <ResourceDelta
                key={`gold-${resourceDeltas.revision}`}
                amount={resourceDeltas.gold}
                resource="gold"
              />
            ) : null}
          </span>
        </span>
        <span className="citadel-player-mini__stat citadel-player-mini__stat--hand" aria-label={`手牌 ${props.player.handCount} 张`} title={`手牌 ${props.player.handCount} 张`}>
          <span className="citadel-player-mini__stat-value">
            {props.player.handCount}
            {resourceDeltas?.hand ? (
              <ResourceDelta
                key={`hand-${resourceDeltas.revision}`}
                amount={resourceDeltas.hand}
                resource="hand"
              />
            ) : null}
          </span>
        </span>
        <span className="citadel-player-mini__stat citadel-player-mini__stat--city" data-player-city-count={props.player.city.length} aria-label={`建筑 ${props.player.city.length}`} title={`建筑 ${props.player.city.length}`}>{props.player.city.length}</span>
      </span>
    </>
  );

  if (props.onClick) {
    return (
      <button
        className={className}
        data-player-id={props.player.id}
        data-player-gold={props.player.gold}
        data-player-hand-count={props.player.handCount}
        type="button"
        onClick={props.onClick}
        aria-controls={props.controls}
        aria-expanded={props.expanded}
        aria-haspopup={props.controls ? "true" : undefined}
        aria-label={props.interactionLabel ?? `选择 ${props.player.name} 交换手牌`}
        title={props.interactionTitle}
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
      data-player-hand-count={props.player.handCount}
    >
      {body}
    </div>
  );
}

function ResourceDelta(props: {
  amount: number;
  resource: "gold" | "hand";
}) {
  const sign = props.amount > 0 ? "+" : "";
  return (
    <i
      aria-hidden="true"
      className={`citadel-player-mini__resource-delta ${props.amount > 0 ? "is-positive" : "is-negative"}`}
      data-resource-delta={props.resource}
      data-resource-delta-amount={props.amount}
      style={{ "--citadel-resource-delta-duration": `${PLAYER_RESOURCE_DELTA_MS}ms` } as CSSProperties}
    >
      {sign}{props.amount}
    </i>
  );
}

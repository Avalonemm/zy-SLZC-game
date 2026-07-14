import type { DistrictCard } from "@zy/shared";
import type { CSSProperties } from "react";
import { useState } from "react";
import type { GameSeatPosition } from "./gameTableLayout";
import type { GamePlayer } from "./gameTypes";
import { GamePlayerMiniStatus } from "./GamePlayerMiniStatus";
import { RoleIdentityCard } from "./RoleIdentityCard";
import type { DistrictTargetStatus } from "./tableDistrictTargeting";
import { districtInspectorAttributes } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

export function GameOpponentSeat(props: {
  dense: boolean;
  hasCrown: boolean;
  roleCallHighlighted: boolean;
  currentTurnPlayerId: string | null;
  hiddenDistrictCardIds: Set<string>;
  arrivalHighlightCardIds: Set<string>;
  player: GamePlayer;
  position: GameSeatPosition;
  handStackDepth: number;
  districtTargeting: boolean;
  playerTargeting: boolean;
  playerTargetSelected: boolean;
  selectedDistrictCardId: string | null;
  getDistrictTargetStatus: (card: DistrictCard) => DistrictTargetStatus;
  onSelectDistrictTarget: (card: DistrictCard) => void;
  onSelectPlayerTarget: () => void;
}) {
  const isCurrent = props.player.id === props.currentTurnPlayerId;
  return (
    <article
      className={`citadel-opponent-seat citadel-opponent-seat--${props.position} ${props.dense ? "is-dense" : ""} ${isCurrent ? "is-current" : ""} ${props.roleCallHighlighted ? "is-role-revealing" : ""}`}
      data-player-id={props.player.id}
      data-city-count={props.player.city.length}
      data-seat-position={props.position}
    >
      <GamePlayerMiniStatus
        hasCrown={props.hasCrown}
        isCurrent={isCurrent}
        player={props.player}
        targetable={props.playerTargeting}
        selected={props.playerTargetSelected}
        onClick={props.playerTargeting ? props.onSelectPlayerTarget : undefined}
      />
      <div className="citadel-opponent-card-line">
        <RoleIdentityCard
          roleId={props.player.selectedRoleId}
          compact
          inspectorPlacement={seatInspectorPlacement(props.position)}
          inspectorSize="table-small"
        />
        <HiddenHandStack count={props.player.handCount} maximumDepth={props.handStackDepth} playerId={props.player.id} />
      </div>
      <OpponentCityRow
        arrivalHighlightCardIds={props.arrivalHighlightCardIds}
        cards={props.player.city}
        hiddenDistrictCardIds={props.hiddenDistrictCardIds}
        targeting={props.districtTargeting}
        selectedDistrictCardId={props.selectedDistrictCardId}
        getTargetStatus={props.getDistrictTargetStatus}
        onSelectTarget={props.onSelectDistrictTarget}
        inspectorPlacement={seatInspectorPlacement(props.position)}
      />
    </article>
  );
}

function OpponentCityRow(props: {
  arrivalHighlightCardIds: Set<string>;
  cards: DistrictCard[];
  hiddenDistrictCardIds: Set<string>;
  targeting: boolean;
  selectedDistrictCardId: string | null;
  getTargetStatus: (card: DistrictCard) => DistrictTargetStatus;
  onSelectTarget: (card: DistrictCard) => void;
  inspectorPlacement: "left" | "right" | "bottom";
}) {
  const [blockedCardId, setBlockedCardId] = useState<string | null>(null);

  return (
    <div className="citadel-mini-city-row" aria-label={`\u5df2\u5efa\u5efa\u7b51 ${props.cards.length}`}>
      {props.cards.map((card) => {
        const targetStatus = props.getTargetStatus(card);
        const targetClass = props.targeting
          ? targetStatus.eligible
            ? "is-targetable"
            : "is-untargetable"
          : "";
        const selectedClass = props.selectedDistrictCardId === card.id ? "is-target-selected" : "";
        const protectedClass = props.targeting && targetStatus.reasonCode === "protected"
          ? "is-protected"
          : "";
        const blockedClass = blockedCardId === card.id ? "is-protection-blocked" : "";
        const tooltip = props.targeting
          ? `${card.name}\uff1a${card.description}\n${targetStatus.reason}`
          : `${card.name}\uff1a${card.description}`;
        const selectTarget = () => {
          if (props.targeting && targetStatus.eligible) {
            props.onSelectTarget(card);
          } else if (props.targeting && targetStatus.reasonCode === "protected") {
            setBlockedCardId(card.id);
          }
        };
        return (
          <article
            aria-disabled={props.targeting && !targetStatus.eligible}
            aria-label={`${card.name}\uff0c\u8d39\u7528 ${card.cost}\uff0c${card.score} \u5206\u3002${card.description}${props.targeting ? `\u3002${targetStatus.reason}` : ""}`}
            className={`citadel-mini-city-card citadel-mini-city-card--${card.color} ${targetClass} ${selectedClass} ${protectedClass} ${blockedClass} ${props.hiddenDistrictCardIds.has(card.id) ? "is-build-arriving" : ""} ${props.arrivalHighlightCardIds.has(card.id) ? "is-build-arrived" : ""}`}
            data-district-card-id={card.id}
            data-tooltip={tooltip}
            {...cardFaceAttributes()}
            {...districtInspectorAttributes(card, props.inspectorPlacement, "table-small")}
            key={card.id}
            role={props.targeting ? "button" : undefined}
            tabIndex={0}
            onClick={selectTarget}
            onAnimationEnd={() => {
              if (blockedCardId === card.id) setBlockedCardId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectTarget();
              }
            }}
          >
            <CardArtwork kind="district" cardId={card.id} alt={card.name} />
            {protectedClass && <i className="citadel-protection-shield" aria-hidden="true">◆</i>}
            <span className="citadel-mini-city-card__cost">{card.cost}</span>
            <strong className="citadel-mini-city-card__name">{card.name}</strong>
          </article>
        );
      })}
    </div>
  );
}

function seatInspectorPlacement(position: GameSeatPosition): "left" | "right" | "bottom" {
  if (position.startsWith("right-")) {
    return "left";
  }
  if (position.startsWith("left-")) {
    return "right";
  }
  return "bottom";
}

function HiddenHandStack(props: { count: number; maximumDepth: number; playerId: string }) {
  const count = Math.max(0, Math.floor(props.count));
  if (count === 0) {
    return <div className="citadel-mini-card-row citadel-mini-card-row--empty" data-opponent-hand-player-id={props.playerId} />;
  }
  const maximumDepth = props.maximumDepth;
  const layerOffset = count <= 1 ? 0 : Math.min(2.5, maximumDepth / (count - 1));
  const stackDepth = layerOffset * Math.max(0, count - 1);
  return (
    <div
      className="citadel-mini-card-row citadel-mini-card-row--stacked"
      data-opponent-hand-player-id={props.playerId}
      aria-label={`\u672a\u516c\u5f00\u624b\u724c ${count} \u5f20`}
      data-hand-count={count}
      style={{ "--opponent-stack-depth": `${stackDepth}px` } as CSSProperties}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="citadel-mini-card citadel-mini-card--back"
          style={{ left: `${index * layerOffset}px` }}
          aria-hidden="true"
        />
      ))}
      <b className="citadel-mini-card-count" aria-hidden="true">{count}</b>
    </div>
  );
}

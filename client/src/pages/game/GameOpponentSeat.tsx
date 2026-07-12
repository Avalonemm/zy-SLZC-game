import type { DistrictCard } from "@zy/shared";
import type { GameSeatPosition } from "./gameTableLayout";
import type { GamePlayer } from "./gameTypes";
import { GamePlayerMiniStatus } from "./GamePlayerMiniStatus";
import { RoleIdentityCard } from "./RoleIdentityCard";
import type { DistrictTargetStatus } from "./tableDistrictTargeting";
import { districtInspectorAttributes } from "./cardInspectorData";

export function GameOpponentSeat(props: {
  dense: boolean;
  hasCrown: boolean;
  currentTurnPlayerId: string | null;
  player: GamePlayer;
  position: GameSeatPosition;
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
      className={`citadel-opponent-seat citadel-opponent-seat--${props.position} ${props.dense ? "is-dense" : ""} ${isCurrent ? "is-current" : ""}`}
      data-city-count={props.player.city.length}
      data-seat-position={props.position}
    >
      <GamePlayerMiniStatus
        hasCrown={props.hasCrown}
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
        <HiddenHandRow count={props.player.handCount} maxVisible={3} />
      </div>
      <OpponentCityRow
        cards={props.player.city}
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
  cards: DistrictCard[];
  targeting: boolean;
  selectedDistrictCardId: string | null;
  getTargetStatus: (card: DistrictCard) => DistrictTargetStatus;
  onSelectTarget: (card: DistrictCard) => void;
  inspectorPlacement: "left" | "right" | "bottom";
}) {
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
        const tooltip = props.targeting
          ? `${card.name}\uff1a${card.description}\n${targetStatus.reason}`
          : `${card.name}\uff1a${card.description}`;
        const selectTarget = () => {
          if (props.targeting && targetStatus.eligible) {
            props.onSelectTarget(card);
          }
        };
        return (
          <article
            aria-disabled={props.targeting && !targetStatus.eligible}
            aria-label={`${card.name}\uff0c\u8d39\u7528 ${card.cost}\uff0c${card.score} \u5206\u3002${card.description}${props.targeting ? `\u3002${targetStatus.reason}` : ""}`}
            className={`citadel-mini-city-card citadel-mini-city-card--${card.color} ${targetClass} ${selectedClass}`}
            data-tooltip={tooltip}
            {...districtInspectorAttributes(card, props.inspectorPlacement, "table-small")}
            key={card.id}
            role={props.targeting ? "button" : undefined}
            tabIndex={0}
            onClick={selectTarget}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectTarget();
              }
            }}
          >
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

function HiddenHandRow(props: { count: number; maxVisible: number }) {
  const count = Math.min(props.maxVisible, Math.max(0, props.count));
  if (count === 0) {
    return <div className="citadel-mini-card-row citadel-mini-card-row--empty" />;
  }
  return (
    <div className="citadel-mini-card-row" aria-label={`\u672a\u516c\u5f00\u624b\u724c ${props.count} \u5f20`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="citadel-mini-card citadel-mini-card--back" aria-hidden="true" />
      ))}
      {props.count > props.maxVisible && (
        <b className="citadel-mini-card-count">+{props.count - props.maxVisible}</b>
      )}
    </div>
  );
}

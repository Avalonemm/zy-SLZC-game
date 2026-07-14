import type { CityScoreBreakdown } from "@zy/shared";
import type { BuildableDistrictCard } from "./gameTypes";
import { districtInspectorAttributes } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

const ACTIVE_EFFECT_TYPES = new Set(["discard_hand_for_gold", "pay_gold_draw_cards"]);

export function GameSelfCity(props: {
  activeDistrictCardId: string | null;
  canUseDistrictEffects: boolean;
  city: BuildableDistrictCard[];
  cityTarget: number;
  score: CityScoreBreakdown;
  hiddenDistrictCardIds: Set<string>;
  pendingBuildCards: BuildableDistrictCard[];
  arrivalHighlightCardIds: Set<string>;
  usedDistrictEffectIds: string[];
  onSelectDistrictEffect: (card: BuildableDistrictCard) => void;
}) {
  return (
    <section className="citadel-self-city" aria-label={"\u4f60\u7684\u5efa\u7b51"}>
      <div className="citadel-self-city__cards">
        {props.city.slice(0, 8).map((card) => {
          const hasActiveEffect = ACTIVE_EFFECT_TYPES.has(card.effectType);
          const effectUsed = props.usedDistrictEffectIds.includes(card.id);
          const canActivate = props.canUseDistrictEffects && hasActiveEffect && !effectUsed;
          return (
            <BuiltDistrictCard
              active={props.activeDistrictCardId === card.id}
              arriving={props.hiddenDistrictCardIds.has(card.id)}
              arrived={props.arrivalHighlightCardIds.has(card.id)}
              canActivate={canActivate}
              effectUsed={effectUsed}
              key={card.id}
              card={card}
              onClick={() => props.onSelectDistrictEffect(card)}
            />
          );
        })}
        {props.pendingBuildCards
          .filter((card) => !props.city.some((builtCard) => builtCard.id === card.id))
          .map((card) => (
            <span
              className="citadel-built-card citadel-build-target-slot"
              data-build-target-id={card.id}
              key={`build-target-${card.id}`}
            />
          ))}
      </div>
      <span className="citadel-self-city__scoreline">
        已建 {props.city.length}/{props.cityTarget} · 建筑分 {props.score.districtScore} · 当前总分 {props.score.totalScore}
      </span>
    </section>
  );
}

function BuiltDistrictCard(props: {
  active: boolean;
  arriving: boolean;
  arrived: boolean;
  canActivate: boolean;
  card: BuildableDistrictCard;
  effectUsed: boolean;
  onClick: () => void;
}) {
  const effectHint = props.effectUsed
    ? "\u672c\u56de\u5408\u5df2\u4f7f\u7528"
    : props.canActivate
      ? `\u70b9\u51fb\u4f7f\u7528\uff1a${props.card.description}`
      : props.card.description;
  return (
    <button
      aria-pressed={props.active}
      aria-disabled={!props.canActivate}
      className={`citadel-built-card citadel-built-card--${props.card.color} ${props.canActivate ? "is-activatable" : ""} ${props.active ? "is-selected" : ""} ${props.effectUsed ? "is-used" : ""} ${props.arriving ? "is-build-arriving" : ""} ${props.arrived ? "is-build-arrived" : ""}`}
      data-district-card-id={props.card.id}
      data-tooltip={effectHint}
      {...cardFaceAttributes()}
      {...districtInspectorAttributes(props.card)}
      type="button"
      onClick={() => {
        if (props.canActivate) {
          props.onClick();
        }
      }}
    >
      <CardArtwork kind="district" cardId={props.card.id} alt={props.card.name} />
      <span>{props.card.cost}</span>
      <strong>{props.card.name}</strong>
    </button>
  );
}

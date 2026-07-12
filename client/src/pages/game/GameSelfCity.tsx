import type { BuildableDistrictCard } from "./gameTypes";
import { districtInspectorAttributes } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

const ACTIVE_EFFECT_TYPES = new Set(["discard_hand_for_gold", "pay_gold_draw_cards"]);

export function GameSelfCity(props: {
  activeDistrictCardId: string | null;
  canUseDistrictEffects: boolean;
  city: BuildableDistrictCard[];
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
              canActivate={canActivate}
              effectUsed={effectUsed}
              key={card.id}
              card={card}
              onClick={() => props.onSelectDistrictEffect(card)}
            />
          );
        })}
      </div>
      {props.city.length > 0 && (
        <span>{"\u5df2\u5efa\u5efa\u7b51 "}{props.city.length}</span>
      )}
    </section>
  );
}

function BuiltDistrictCard(props: {
  active: boolean;
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
      className={`citadel-built-card citadel-built-card--${props.card.color} ${props.canActivate ? "is-activatable" : ""} ${props.active ? "is-selected" : ""} ${props.effectUsed ? "is-used" : ""}`}
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

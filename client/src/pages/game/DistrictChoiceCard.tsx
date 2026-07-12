import type { BuildableDistrictCard } from "./gameTypes";
import { districtInspectorAttributes } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

const colorLabels: Record<BuildableDistrictCard["color"], string> = {
  blue: "\u5b97\u6559",
  green: "\u5546\u4e1a",
  red: "\u519b\u4e8b",
  yellow: "\u8d35\u65cf",
  purple: "\u7279\u6b8a"
};

export function DistrictChoiceCard(props: {
  card: BuildableDistrictCard;
  disabled?: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      className={`citadel-district-choice-card citadel-district-choice-card--${props.card.color}`}
      {...cardFaceAttributes()}
      {...districtInspectorAttributes(props.card)}
      disabled={props.disabled}
      type="button"
      onClick={props.onChoose}
    >
      <CardArtwork kind="district" cardId={props.card.id} alt={props.card.name} />
      <span className="citadel-district-choice-card__cost" aria-label={`\u8d39\u7528 ${props.card.cost}`}>
        {props.card.cost}
      </span>
      <span className="citadel-district-choice-card__score" aria-label={`\u5206\u6570 ${props.card.score}`}>
        {props.card.score}{" \u5206"}
      </span>
      <span className="citadel-district-choice-card__art" aria-hidden="true">
        {props.card.name.slice(0, 1)}
      </span>
      <strong>{props.card.name}</strong>
      <small>{colorLabels[props.card.color]}{"\u5efa\u7b51"}</small>
      <p>{props.card.description || "\u666e\u901a\u5efa\u7b51\u5361"}</p>
      <b>{"\u9009\u62e9\u6b64\u724c"}</b>
    </button>
  );
}

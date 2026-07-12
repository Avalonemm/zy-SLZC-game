import type { DistrictCard } from "@zy/shared";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

export function ResultDistrictCard(props: { card: DistrictCard }) {
  return (
    <article
      className={`citadel-result-district citadel-result-district--${props.card.color}`}
      {...cardFaceAttributes()}
      title={`${props.card.name}\n${props.card.description}`}
    >
      <CardArtwork kind="district" cardId={props.card.id} alt={props.card.name} />
      <span className="citadel-result-district__cost">{props.card.cost}</span>
      <span className="citadel-result-district__art" aria-hidden="true">
        {props.card.name.slice(0, 1)}
      </span>
      <strong>{props.card.name}</strong>
      <small>{props.card.score}{"\u5206"}</small>
    </article>
  );
}

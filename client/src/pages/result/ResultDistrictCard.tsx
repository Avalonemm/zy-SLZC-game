import type { DistrictCard } from "@zy/shared";

export function ResultDistrictCard(props: { card: DistrictCard }) {
  return (
    <article
      className={`citadel-result-district citadel-result-district--${props.card.color}`}
      title={`${props.card.name}\n${props.card.description}`}
    >
      <span className="citadel-result-district__cost">{props.card.cost}</span>
      <span className="citadel-result-district__art" aria-hidden="true">
        {props.card.name.slice(0, 1)}
      </span>
      <strong>{props.card.name}</strong>
      <small>{props.card.score}{"\u5206"}</small>
    </article>
  );
}

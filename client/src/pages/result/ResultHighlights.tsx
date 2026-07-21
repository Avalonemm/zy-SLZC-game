import type { ResultHighlight } from "@zy/shared";
import { highlightAwardLabel, highlightIcon, highlightPerformanceText } from "./resultText";

export function ResultHighlights(props: { highlights: ResultHighlight[] }) {
  return (
    <section className="citadel-result-highlights" aria-label="本局高光">
      <header>
        <b>本局高光</b>
        <small>{props.highlights.length} 项精彩表现</small>
      </header>
      {props.highlights.map((highlight) => {
        const award = highlightAwardLabel(highlight);
        const performance = highlightPerformanceText(highlight);
        return (
          <span
            className="citadel-result-highlight"
            key={highlight.id}
            aria-label={`${award}，${highlight.playerName}，${performance}`}
          >
            <img aria-hidden="true" alt="" src={highlightIcon(highlight)} />
            <span className="citadel-result-highlight__copy">
              <strong>{award}</strong>
              <span><b>{highlight.playerName}</b> · {performance}</span>
            </span>
          </span>
        );
      })}
    </section>
  );
}

import type { TestGameScoringResult } from "./testGameTypes";

type ScoringPanelProps = {
  results: TestGameScoringResult[];
};

export function ScoringPanel(props: ScoringPanelProps) {
  if (props.results.length === 0) {
    return null;
  }

  return (
    <section className="test-game-section test-game-section--wide">
      <h3>结算排名</h3>
      <div className="test-score-table">
        {props.results.map((result, index) => (
          <div className="test-score-row" key={result.playerId}>
            <strong>#{index + 1} {result.playerName}</strong>
            <span>建筑分 {result.districtScore}</span>
            <span>奖励分 {result.bonusScore}</span>
            <span>总分 {result.totalScore}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

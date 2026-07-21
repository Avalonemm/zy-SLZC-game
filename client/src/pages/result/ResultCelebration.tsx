import type { GamePlayer, GameScoringResult } from "../game/gameTypes";
import { visualAssets } from "../../config/visualAssets";

export function ResultCelebration(props: {
  winner: GamePlayer | null;
  result: GameScoringResult;
  onSkip: () => void;
}) {
  return (
    <div
      aria-label="冠军庆典，点击或按任意跳过键查看成绩"
      className="citadel-result-celebration"
      role="button"
      tabIndex={0}
      onClick={props.onSkip}
    >
      <div className="citadel-result-celebration__spotlight" aria-hidden="true" />
      <div className="citadel-result-celebration__city" aria-hidden="true">
        <img alt="" src={visualAssets.result.championCity} />
      </div>
      <p>本局冠军</p>
      <h1>{props.result.playerName}</h1>
      <div className="citadel-result-celebration__formula">
        <span>建筑分 <b>{props.result.districtScore}</b></span>
        <i>+</i>
        <span>奖励分 <b>{props.result.bonusScore}</b></span>
        <i>=</i>
        <strong>{props.result.totalScore}</strong>
      </div>
      <div className="citadel-result-celebration__crown" aria-hidden="true" />
      <small>{props.winner?.name ?? props.result.playerName} 的城邦荣登榜首 · 点击或按 Enter / Space / Esc 跳过</small>
    </div>
  );
}

import type { ResultTitleType } from "@zy/shared";
import type { GamePlayer, GameScoringResult } from "../game/gameTypes";
import { ResultApplauseButton } from "./ResultApplauseButton";
import { ResultDistrictLane } from "./ResultDistrictLane";
import { resultTitleLabels } from "./resultText";

export function ResultPlayerRow(props: {
  activeApplause: boolean;
  applauseCount: number;
  avatarImage: string | null;
  avatarLabel: string;
  index: number;
  player: GamePlayer | null;
  pressedApplause: boolean;
  result: GameScoringResult;
  selfPlayerId: string | null;
  title: ResultTitleType;
  onApplaud: () => void;
}) {
  const isWinner = props.index === 0;
  const isSelf = props.result.playerId === props.selfPlayerId;
  const avatarText = isSelf && props.avatarLabel
    ? props.avatarLabel
    : Array.from(props.result.playerName)[0] ?? "";
  return (
    <article
      className={`citadel-result-player ${isWinner ? "is-winner" : ""}`}
      data-player-id={props.result.playerId}
      data-rank={props.index + 1}
    >
      <div className="citadel-result-player__rank" aria-label={`第 ${props.index + 1} 名`}>
        {isWinner ? <span className="citadel-result-player__crown" aria-hidden="true" /> : null}
        <b>{props.index + 1}</b>
      </div>
      <div className="citadel-result-player-tag">
        <span className="citadel-result-player-tag__avatar">
          {isSelf && props.avatarImage ? <img alt="" src={props.avatarImage} /> : avatarText}
        </span>
        <span className="citadel-result-player-tag__copy">
          <strong aria-label={props.result.playerName} title={props.result.playerName}>{props.result.playerName}</strong>
          <small title={resultTitleLabels[props.title]}>{resultTitleLabels[props.title]}</small>
        </span>
      </div>
      <ResultDistrictLane cards={props.player?.city ?? []} playerName={props.result.playerName} />
      <div className="citadel-result-player__scores" aria-label="计分明细">
        <span><small>建筑</small><b>{props.result.districtScore}</b></span>
        <span><small>奖励</small><b>{props.result.bonusScore}</b></span>
        <strong><small>总分</small><b>{props.result.totalScore}</b></strong>
      </div>
      <ResultApplauseButton
        active={props.activeApplause}
        count={props.applauseCount}
        disabled={isSelf || Boolean(props.player?.isBot)}
        pressed={props.pressedApplause}
        playerName={props.result.playerName}
        onClick={props.onApplaud}
      />
    </article>
  );
}

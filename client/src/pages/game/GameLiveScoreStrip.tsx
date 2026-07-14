import type { GamePlayer } from "./gameTypes";

type LiveScore = {
  totalScore: number;
};

export function GameLiveScoreStrip(props: {
  currentTurnPlayerId: string | null;
  players: GamePlayer[];
  scores: ReadonlyMap<string, LiveScore>;
  selfPlayerId: string | null;
}) {
  const accessibleSummary = props.players
    .map((player) => `${player.id === props.selfPlayerId ? "你" : player.name} ${props.scores.get(player.id)?.totalScore ?? 0} 分`)
    .join("，");

  return (
    <section
      className="citadel-live-score-strip"
      aria-label={`实时积分：${accessibleSummary}`}
      data-live-score-strip
    >
      <strong>积分：</strong>
      <ol>
        {props.players.map((player) => {
          const isCurrent = player.id === props.currentTurnPlayerId;
          const isSelf = player.id === props.selfPlayerId;
          const score = props.scores.get(player.id)?.totalScore ?? 0;
          const visibleName = isSelf ? "你" : player.name;
          const fullName = isSelf ? `你（${player.name}）` : player.name;

          return (
            <li
              className={isCurrent ? "is-current" : ""}
              data-live-score-player-id={player.id}
              data-live-score-value={score}
              key={player.id}
              title={`${fullName}：${score} 分`}
            >
              <span>{visibleName}</span>
              <b>{score}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

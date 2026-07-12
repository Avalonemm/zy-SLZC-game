import type { GamePlayer, GameScoringResult } from "../game/gameTypes";
import { ResultDistrictCard } from "./ResultDistrictCard";

export function GameResultOverlay(props: {
  avatarImage: string | null;
  avatarLabel: string;
  players: GamePlayer[];
  results: GameScoringResult[];
  selfPlayerId: string | null;
  canRematch: boolean;
  onRematch: () => void;
  onReturnLobby: () => void;
}) {
  if (props.results.length === 0) {
    return null;
  }

  const winnerResult = props.results[0];
  const winner = props.players.find((player) => player.id === winnerResult.playerId) ?? null;

  return (
    <section className="citadel-result-overlay" aria-label={"\u7ed3\u7b97"}>
      <div className="citadel-result-screen">
        <header className="citadel-result-winner">
          <div>
            <span>{"\u672c\u5c40\u7ed3\u7b97"}</span>
            <strong>{"\u80dc\u5229\u73a9\u5bb6"}</strong>
          </div>
          <ResultPlayerTag
            avatarImage={winner?.id === props.selfPlayerId ? props.avatarImage : null}
            avatarLabel={winner?.id === props.selfPlayerId ? props.avatarLabel : ""}
            player={winner}
            playerName={winnerResult.playerName}
          />
          <div className="citadel-result-winner__score">
            <b>{winnerResult.totalScore}</b>
            <span>{"\u603b\u5206"}</span>
          </div>
        </header>

        <div className="citadel-result-ranking" aria-label={"\u73a9\u5bb6\u6392\u540d\u4e0e\u5efa\u7b51"}>
          {props.results.map((result, index) => {
            const player = props.players.find((candidate) => candidate.id === result.playerId) ?? null;
            return (
              <article className={`citadel-result-player ${index === 0 ? "is-winner" : ""}`} key={result.playerId}>
                <div className="citadel-result-player__summary">
                  <b className="citadel-result-player__rank">{index + 1}</b>
                  <ResultPlayerTag
                    avatarImage={player?.id === props.selfPlayerId ? props.avatarImage : null}
                    avatarLabel={player?.id === props.selfPlayerId ? props.avatarLabel : ""}
                    player={player}
                    playerName={result.playerName}
                  />
                  <span>{"\u5efa\u7b51\u5206 "}<strong>{result.districtScore}</strong></span>
                  <span>{"\u5956\u52b1\u5206 "}<strong>{result.bonusScore}</strong></span>
                  <em>{result.totalScore}</em>
                </div>
                <div className="citadel-result-player__city" aria-label={`${result.playerName} \u7684\u5efa\u7b51`}>
                  {player && player.city.length > 0 ? (
                    player.city.map((card) => <ResultDistrictCard card={card} key={card.id} />)
                  ) : (
                    <p>{"\u672a\u5efa\u9020\u5efa\u7b51"}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <footer>
          <button
            className="citadel-action-button citadel-action-button--green"
            type="button"
            disabled={!props.canRematch}
            title={props.canRematch ? "保留房间和座位，返回准备房间" : "等待房主发起下一局"}
            onClick={props.onRematch}
          >
            {props.canRematch ? "再来一局" : "等待房主"}
          </button>
          <button
            className="citadel-action-button citadel-action-button--gold"
            type="button"
            onClick={props.onReturnLobby}
          >
            {"\u8fd4\u56de\u5927\u5385"}
          </button>
        </footer>
      </div>
    </section>
  );
}

function ResultPlayerTag(props: {
  avatarImage: string | null;
  avatarLabel: string;
  player: GamePlayer | null;
  playerName: string;
}) {
  const avatarText = props.avatarLabel || props.playerName.slice(0, 1);
  return (
    <div className="citadel-result-player-tag">
      <span className="citadel-result-player-tag__avatar">
        {props.avatarImage ? <img alt="" src={props.avatarImage} /> : avatarText}
      </span>
      <span>
        <strong>{props.playerName}</strong>
        <small>{props.player ? `UID: ${props.player.uid}` : ""}</small>
      </span>
    </div>
  );
}

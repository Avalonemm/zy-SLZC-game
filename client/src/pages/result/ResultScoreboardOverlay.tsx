import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { VisibleGameResultSummary } from "@zy/shared";
import { visualAssets } from "../../config/visualAssets";
import { UtilityMenuButton } from "../../components/ui/UtilityMenuButton";
import type { GamePlayer, GameScoringResult } from "../game/gameTypes";
import { ResultCelebration } from "./ResultCelebration";
import { ResultHighlights } from "./ResultHighlights";
import { ResultPlayerRow } from "./ResultPlayerRow";
import { useResultApplause } from "./useResultApplause";

const celebrationDurationMs = 1_800;

type RankingStyle = CSSProperties & { "--result-player-count": number };

export function ResultScoreboardOverlay(props: {
  avatarImage: string | null;
  avatarLabel: string;
  players: GamePlayer[];
  results: GameScoringResult[];
  resultSummary: VisibleGameResultSummary;
  roomCode: string;
  selfPlayerId: string | null;
  canRematch: boolean;
  onOpenSettings: () => void;
  onRematch: () => void;
  onReturnLobby: () => void;
}) {
  const celebrationKey = `zy-result-celebration:${props.resultSummary.resultId}`;
  const [celebrating, setCelebrating] = useState(() => shouldPlayCelebration(celebrationKey));
  const applause = useResultApplause({
    roomCode: props.roomCode,
    selfPlayerId: props.selfPlayerId,
    summary: props.resultSummary
  });
  const skipCelebration = useCallback(() => {
    completeCelebration(celebrationKey);
    setCelebrating(false);
  }, [celebrationKey]);

  useEffect(() => {
    const shouldPlay = shouldPlayCelebration(celebrationKey);
    setCelebrating(shouldPlay);
    if (!shouldPlay) return;
    startCelebration(celebrationKey);
    const timeout = window.setTimeout(skipCelebration, celebrationDurationMs);
    return () => window.clearTimeout(timeout);
  }, [celebrationKey, skipCelebration]);

  useEffect(() => {
    if (!celebrating) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (["Enter", " ", "Escape"].includes(event.key)) {
        event.preventDefault();
        skipCelebration();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [celebrating, skipCelebration]);

  if (props.results.length === 0) return null;
  const winnerResult = props.results[0];
  const winner = props.players.find((player) => player.id === winnerResult.playerId) ?? null;

  return (
    <section
      className={`citadel-result-overlay ${celebrating ? "is-celebrating" : "is-scoreboard"}`}
      aria-label="结算"
      data-result-id={props.resultSummary.resultId}
    >
      <UtilityMenuButton
        className="citadel-result-settings-entry"
        icon="settings"
        label="设置"
        onClick={props.onOpenSettings}
      />
      {celebrating ? (
        <ResultCelebration winner={winner} result={winnerResult} onSkip={skipCelebration} />
      ) : (
        <div className="citadel-result-screen">
          <header className="citadel-result-heading">
            <span>FINAL SCORE</span>
            <img className="citadel-result-heading__ornament" aria-hidden="true" alt="" src={visualAssets.result.titleOrnament} />
            <h1>城邦总榜</h1>
            <i aria-hidden="true" />
          </header>
          <ResultHighlights highlights={props.resultSummary.highlights} />
          <div className="citadel-result-table" aria-label="最终成绩板">
            <div className="citadel-result-table__head" aria-hidden="true">
              <span>名次</span><span>城主与称号</span><span>城市建筑</span><span>计分</span><span>鼓掌</span>
            </div>
            <div
              className="citadel-result-ranking"
              style={{ "--result-player-count": props.results.length } as RankingStyle}
            >
              {props.results.map((result, index) => {
                const player = props.players.find((candidate) => candidate.id === result.playerId) ?? null;
                return (
                  <ResultPlayerRow
                    activeApplause={Boolean(applause.activeEventByTarget[result.playerId])}
                    applauseCount={applause.counts[result.playerId] ?? 0}
                    avatarImage={player?.id === props.selfPlayerId ? props.avatarImage : null}
                    avatarLabel={player?.id === props.selfPlayerId ? props.avatarLabel : ""}
                    index={index}
                    key={result.playerId}
                    player={player}
                    pressedApplause={applause.applaudedTargetIds.includes(result.playerId)}
                    result={result}
                    selfPlayerId={props.selfPlayerId}
                    title={props.resultSummary.titles[result.playerId] ?? "city_dreamer"}
                    onApplaud={() => applause.sendApplause(result.playerId)}
                  />
                );
              })}
            </div>
          </div>
          <footer>
            <button
              className="citadel-action-button citadel-action-button--green"
              type="button"
              disabled={!props.canRematch}
              title={props.canRematch ? "保留房间与座位，返回准备房间" : "等待房主发起下一局"}
              onClick={props.onRematch}
            >
              {props.canRematch ? "再来一局" : "等待房主"}
            </button>
            <button
              className="citadel-action-button citadel-action-button--gold"
              type="button"
              onClick={props.onReturnLobby}
            >
              返回大厅
            </button>
          </footer>
        </div>
      )}
    </section>
  );
}

function shouldPlayCelebration(storageKey: string) {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const status = window.sessionStorage.getItem(storageKey);
  if (status === "played") return false;
  if (status === "playing" && !activeCelebrations().has(storageKey)) {
    window.sessionStorage.setItem(storageKey, "played");
    return false;
  }
  return true;
}

function startCelebration(storageKey: string) {
  activeCelebrations().add(storageKey);
  window.sessionStorage.setItem(storageKey, "playing");
}

function completeCelebration(storageKey: string) {
  activeCelebrations().delete(storageKey);
  window.sessionStorage.setItem(storageKey, "played");
}

function activeCelebrations() {
  const gameWindow = window as Window & { __zyActiveResultCelebrations?: Set<string> };
  gameWindow.__zyActiveResultCelebrations ??= new Set<string>();
  return gameWindow.__zyActiveResultCelebrations;
}

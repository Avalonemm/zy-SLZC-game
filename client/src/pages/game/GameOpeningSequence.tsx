import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { VisibleGameState } from "@zy/shared";
import { GameObjectiveNotice } from "./GameObjectiveNotice";

type OpeningStage = "objective" | "roulette" | "settle";
type Point = { x: number; y: number };
type OpeningGeometry = { center: Point; seat: Point };

const OBJECTIVE_END_MS = 3_000;
const ROULETTE_END_MS = 7_500;
const ROULETTE_STEP_MS = 600;
const SETTLE_DURATION_MS = 1_500;

export function GameOpeningSequence(props: {
  gameState: VisibleGameState;
  tableRef: RefObject<HTMLElement | null>;
}) {
  const timer = props.gameState.turnTimer?.phase === "CROWN_REVEAL"
    ? props.gameState.turnTimer
    : null;
  const [now, setNow] = useState(() => Date.now());
  const [geometry, setGeometry] = useState<OpeningGeometry | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!timer) return;
    const intervalId = window.setInterval(() => setNow(Date.now()), reducedMotion ? 250 : 60);
    return () => window.clearInterval(intervalId);
  }, [reducedMotion, timer?.startedAt]);

  const elapsedMs = timer
    ? Math.max(0, Math.min(timer.timeoutMs, now - new Date(timer.startedAt).getTime()))
    : 0;
  const stage: OpeningStage = elapsedMs < OBJECTIVE_END_MS
    ? "objective"
    : elapsedMs < ROULETTE_END_MS
      ? "roulette"
      : "settle";
  const roulettePlayers = props.gameState.players;
  const activePlayerId = useMemo(() => {
    if (!timer || stage === "objective") return null;
    if (stage === "settle" || reducedMotion || roulettePlayers.length === 0) {
      return props.gameState.crownPlayerId;
    }
    const index = Math.floor((elapsedMs - OBJECTIVE_END_MS) / ROULETTE_STEP_MS) % roulettePlayers.length;
    return roulettePlayers[index]?.id ?? props.gameState.crownPlayerId;
  }, [elapsedMs, props.gameState.crownPlayerId, reducedMotion, roulettePlayers, stage, timer]);

  useLayoutEffect(() => {
    if (!timer || stage === "objective" || !props.tableRef.current) {
      setGeometry(null);
      return;
    }

    const updatePoint = () => {
      const table = props.tableRef.current;
      if (!table) return;
      const tableRect = table.getBoundingClientRect();
      const playerRoot = [...table.querySelectorAll<HTMLElement>("[data-player-id]")]
        .find((element) => element.dataset.playerId === activePlayerId);
      const anchor = playerRoot?.querySelector<HTMLElement>(".citadel-player-mini__avatar-wrap") ?? playerRoot;
      const rect = anchor?.getBoundingClientRect();
      setGeometry({
        center: { x: tableRect.width / 2, y: tableRect.height * 0.42 },
        seat: rect
          ? {
              x: rect.left - tableRect.left + rect.width / 2,
              y: rect.top - tableRect.top + rect.height / 2
            }
          : { x: tableRect.width / 2, y: tableRect.height * 0.42 }
      });
    };

    updatePoint();
    window.addEventListener("resize", updatePoint);
    return () => window.removeEventListener("resize", updatePoint);
  }, [activePlayerId, props.tableRef, stage, timer]);

  if (!timer) return null;

  const crownPlayerName = props.gameState.players.find(
    (player) => player.id === props.gameState.crownPlayerId
  )?.name ?? "皇冠玩家";
  const remainingSeconds = Math.max(0, Math.ceil((timer.timeoutMs - elapsedMs) / 1_000));
  const openingTitle = stage === "settle"
    ? `第 ${props.gameState.currentRound} 轮 · 皇冠归属已确定`
    : `第 ${props.gameState.currentRound} 轮 · 皇冠随机`;
  const openingDescription = stage === "settle"
    ? `${crownPlayerName} 获得本轮皇冠`
    : "正在决定本轮皇冠持有者";

  return (
    <aside
      className={`citadel-game-opening citadel-game-opening--${stage} ${reducedMotion ? "citadel-game-opening--reduced-motion" : ""}`}
      data-opening-stage={stage}
      aria-live="polite"
      aria-label={stage === "objective"
        ? "本局目标"
        : stage === "settle"
          ? `皇冠归属已确定，${crownPlayerName} 获得本轮皇冠`
          : `第 ${props.gameState.currentRound} 轮，正在随机皇冠`}
    >
      <GameObjectiveNotice
        endCitySize={props.gameState.settings.endCitySize}
        visible={stage === "objective"}
      />
      {stage !== "objective" && (
        <div className={`citadel-opening-status citadel-opening-status--${stage}`}>
          <span>{openingTitle}</span>
          <strong>{openingDescription}</strong>
          <b
            className="citadel-opening-status__timer"
            aria-label={`剩余 ${remainingSeconds} 秒`}
            data-opening-seconds={remainingSeconds}
          >
            {remainingSeconds}<small>秒</small>
          </b>
        </div>
      )}
      {stage !== "objective" && geometry && (
        <>
          <span
            key={`halo-${activePlayerId}`}
            className="citadel-opening-seat-halo"
            data-highlight-player-id={activePlayerId ?? ""}
            style={{ left: geometry.seat.x, top: geometry.seat.y } as CSSProperties}
            aria-hidden="true"
          />
          <span
            className="citadel-opening-crown"
            data-crown-player-id={activePlayerId ?? ""}
            style={openingCrownStyle(stage, geometry, elapsedMs, reducedMotion)}
            aria-hidden="true"
          />
        </>
      )}
    </aside>
  );
}

function openingCrownStyle(
  stage: OpeningStage,
  geometry: OpeningGeometry,
  elapsedMs: number,
  reducedMotion: boolean
) {
  if (reducedMotion) {
    return { left: geometry.seat.x, top: geometry.seat.y } as CSSProperties;
  }
  if (stage !== "settle") {
    return { left: geometry.center.x, top: geometry.center.y } as CSSProperties;
  }

  const settleElapsedMs = Math.max(0, Math.min(SETTLE_DURATION_MS, elapsedMs - ROULETTE_END_MS));
  return {
    left: geometry.seat.x,
    top: geometry.seat.y,
    "--opening-crown-from-x": `${geometry.center.x - geometry.seat.x}px`,
    "--opening-crown-from-y": `${geometry.center.y - geometry.seat.y}px`,
    "--opening-crown-settle-delay": `-${settleElapsedMs}ms`
  } as CSSProperties;
}

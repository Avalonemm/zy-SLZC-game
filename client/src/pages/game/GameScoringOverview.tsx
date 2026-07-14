import { useEffect, useMemo, useRef } from "react";
import type { CityScoreBreakdown, DistrictColor } from "@zy/shared";
import type { GamePlayer } from "./gameTypes";

const COLORS: Array<{ id: DistrictColor; label: string }> = [
  { id: "yellow", label: "黄" },
  { id: "blue", label: "蓝" },
  { id: "green", label: "绿" },
  { id: "red", label: "红" },
  { id: "purple", label: "紫" }
];

export function GameScoringOverview(props: {
  endCitySize: number;
  players: GamePlayer[];
  scores: ReadonlyMap<string, CityScoreBreakdown>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const rankedPlayers = useMemo(
    () => [...props.players].sort((left, right) => {
      const leftScore = props.scores.get(left.id);
      const rightScore = props.scores.get(right.id);
      return (rightScore?.totalScore ?? 0) - (leftScore?.totalScore ?? 0)
        || (rightScore?.districtScore ?? 0) - (leftScore?.districtScore ?? 0);
    }),
    [props.players, props.scores]
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.onClose]);

  return (
    <div
      className="citadel-scoring-backdrop"
      data-scoring-overview="open"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby="citadel-scoring-title"
        aria-modal="true"
        className="citadel-scoring-overview"
        role="dialog"
      >
        <header className="citadel-scoring-overview__header">
          <div>
            <span>实时公开信息</span>
            <h2 id="citadel-scoring-title">全员计分总览</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="关闭计分总览" onClick={props.onClose}>×</button>
        </header>

        <div className="citadel-scoring-rules" aria-label="计分规则">
          <strong>五色 +3</strong>
          <strong>首位完城 +4</strong>
          <strong>其他完城 +2</strong>
          <strong>鬼城补 1 种缺色</strong>
        </div>

        <div className="citadel-scoring-list" role="list">
          {rankedPlayers.map((player, index) => {
            const score = props.scores.get(player.id);
            if (!score) return null;
            const fixedColors = new Set(
              player.city
                .filter((district) => district.effectType !== "wildcard_scoring_color")
                .map((district) => district.color)
            );
            const hasGhostCity = player.city.some(
              (district) => district.effectType === "wildcard_scoring_color"
            );
            return (
              <article
                className="citadel-scoring-player"
                data-scoring-player-id={player.id}
                data-city-count={score.completedDistrictCount}
                data-city-target={props.endCitySize}
                data-district-score={score.districtScore}
                data-color-count={score.effectiveColorCount}
                data-color-bonus={score.colorBonus}
                data-completion-bonus={score.completionBonus}
                data-total-score={score.totalScore}
                key={player.id}
                role="listitem"
              >
                <div className="citadel-scoring-player__identity">
                  <span>{index + 1}</span>
                  <strong>{player.name}</strong>
                </div>
                <span><small>建筑</small><b>{score.completedDistrictCount}/{props.endCitySize}</b></span>
                <span><small>建筑分</small><b>{score.districtScore}</b></span>
                <span className="citadel-scoring-player__colors">
                  <small>五色 {score.effectiveColorCount}/5{score.colorBonus ? " · +3" : ""}</small>
                  <i aria-label={`${score.effectiveColorCount} 种有效颜色${hasGhostCity ? "，含鬼城补色" : ""}`}>
                    {COLORS.map((color) => (
                      <em
                        className={`${fixedColors.has(color.id) ? "is-owned" : ""}`}
                        data-color={color.id}
                        key={color.id}
                        title={`${color.label}色${fixedColors.has(color.id) ? "已拥有" : "未拥有"}`}
                      />
                    ))}
                    {hasGhostCity ? <u title="鬼城可补一种缺失颜色">鬼</u> : null}
                  </i>
                </span>
                <span><small>完城奖励</small><b>+{score.completionBonus}</b></span>
                <span className="citadel-scoring-player__total"><small>当前总分</small><b>★ {score.totalScore}</b></span>
              </article>
            );
          })}
        </div>
        <p className="citadel-scoring-overview__note">当前总分只计算已经达成的奖励；同分时建筑分更高者优先。</p>
      </div>
    </div>
  );
}

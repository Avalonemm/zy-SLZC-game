import { useMemo, useState } from "react";
import type { ActionEventPayload, GameActionOrigin, VisibleGameState } from "@zy/shared";

const automaticOrigins = new Set<GameActionOrigin>(["timeout", "offline", "rule"]);

export function GameLogPanel(props: {
  actionEvents: ActionEventPayload[];
  gameLog: VisibleGameState["gameLog"];
}) {
  const [automaticOnly, setAutomaticOnly] = useState(false);
  const logs = useMemo(
    () => automaticOnly
      ? props.gameLog.filter((log) => log.origin && automaticOrigins.has(log.origin))
      : props.gameLog,
    [automaticOnly, props.gameLog]
  );

  return (
    <section className="game-log-panel">
      <header className="game-log-panel__header">
        <h3>游戏日志</h3>
        <label>
          <input
            type="checkbox"
            checked={automaticOnly}
            onChange={(event) => setAutomaticOnly(event.target.checked)}
          />
          只看系统代操作
        </label>
      </header>
      {props.actionEvents.length > 0 && (
        <div className="game-log-panel__events">
          <strong>最近操作</strong>
          {props.actionEvents.slice(0, 4).map((event) => (
            <LogEntry
              key={event.id}
              createdAt={event.createdAt}
              message={event.message}
              origin={event.origin}
              round={event.round}
            />
          ))}
        </div>
      )}
      <div className="game-log-panel__list">
        {logs.map((log) => (
          <LogEntry
            key={log.id}
            createdAt={log.createdAt}
            message={log.message}
            origin={log.origin}
            round={log.round}
          />
        ))}
        {logs.length === 0 && <p>暂无符合条件的日志。</p>}
      </div>
    </section>
  );
}

function LogEntry(props: {
  createdAt: string;
  message: string;
  origin?: GameActionOrigin;
  round?: number;
}) {
  const originLabel = actionOriginLabel(props.origin);
  return (
    <article className={`game-log-entry ${originLabel ? "is-automatic" : ""}`}>
      <small>
        {props.round ? `第 ${props.round} 轮` : ""}
        {props.round ? " · " : ""}
        {formatTime(props.createdAt)}
        {originLabel && <b>{originLabel}</b>}
      </small>
      <p>{props.message}</p>
    </article>
  );
}

function actionOriginLabel(origin?: GameActionOrigin) {
  if (origin === "timeout") return "超时代操作";
  if (origin === "offline") return "离线代操作";
  if (origin === "rule") return "规则自动";
  if (origin === "bot") return "人机行动";
  return "";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

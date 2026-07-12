import type { ActionEventPayload, VisibleGameState } from "@zy/shared";

export function GameLogPanel(props: {
  actionEvents: ActionEventPayload[];
  gameLog: VisibleGameState["gameLog"];
}) {
  return (
    <section className="game-log-panel">
      <h3>游戏日志</h3>
      {props.actionEvents.length > 0 && (
        <div className="game-log-panel__events">
          <strong>最近操作</strong>
          {props.actionEvents.slice(0, 4).map((event) => (
            <p key={event.id}>{event.message}</p>
          ))}
        </div>
      )}
      <div className="game-log-panel__list">
        {props.gameLog.slice(0, 10).map((log) => (
          <p key={log.id}>{log.message}</p>
        ))}
        {props.gameLog.length === 0 && <p>暂无日志。</p>}
      </div>
    </section>
  );
}

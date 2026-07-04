import type { ActionEventPayload, VisibleGameState } from "@zy/shared";

type GameLogPanelProps = {
  actionEvents: ActionEventPayload[];
  gameLog: VisibleGameState["gameLog"];
};

export function GameLogPanel(props: GameLogPanelProps) {
  return (
    <section className="test-game-section test-game-section--wide">
      <h3>游戏日志</h3>
      {props.actionEvents.length > 0 && (
        <div className="test-action-event-list">
          <strong>最近操作</strong>
          {props.actionEvents.slice(0, 4).map((event) => (
            <p key={event.id}>{event.message}</p>
          ))}
        </div>
      )}
      <div className="test-log-list">
        {props.gameLog.slice(0, 10).map((log) => (
          <p key={log.id}>{log.message}</p>
        ))}
        {props.gameLog.length === 0 && <p>暂无日志。</p>}
      </div>
    </section>
  );
}

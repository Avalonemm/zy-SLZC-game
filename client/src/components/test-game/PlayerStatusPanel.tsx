import { GameBadge } from "../ui/GameBadge";
import type { TestGamePlayer } from "./testGameTypes";
import { roleName } from "./testGameUtils";

type PlayerStatusPanelProps = {
  currentTurnPlayerId: string | null;
  players: TestGamePlayer[];
  selfPlayerId: string | null;
};

export function PlayerStatusPanel(props: PlayerStatusPanelProps) {
  return (
    <section className="test-game-section">
      <h3>玩家状态</h3>
      <div className="test-player-list">
        {props.players.map((player) => (
          <article
            className={`test-player-row ${
              props.currentTurnPlayerId === player.id ? "is-current" : ""
            }`}
            key={player.id}
          >
            <strong>
              {player.name}
              {player.id === props.selfPlayerId ? "（你）" : ""}
            </strong>
            <span className="test-player-badges">
              {player.isHost && <GameBadge tone="active">房主</GameBadge>}
              <GameBadge tone={player.connected ? "ready" : "muted"}>
                {player.connected ? "在线" : "已离开 / 离线"}
              </GameBadge>
            </span>
            <span>
              金币 {player.gold} · 手牌 {player.handCount} · 建筑 {player.city.length}
            </span>
            <span>角色：{roleName(player.selectedRoleId)}</span>
            <CitySummary player={player} />
          </article>
        ))}
      </div>
    </section>
  );
}

function CitySummary(props: { player: TestGamePlayer }) {
  if (props.player.city.length === 0) {
    return <span className="test-city-empty">城市：无</span>;
  }

  return (
    <div className="test-city-list" aria-label={`${props.player.name} 的城市`}>
      {props.player.city.map((district) => (
        <span className="test-city-chip" key={district.id}>
          {district.name} · {district.cost}
        </span>
      ))}
    </div>
  );
}

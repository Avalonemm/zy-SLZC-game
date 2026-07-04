import { GameButton } from "../ui/GameButton";
import { GameCard } from "../ui/GameCard";
import type { BuildableDistrictCard, TestGamePlayer } from "./testGameTypes";

type HandCityPanelProps = {
  canBuild: boolean;
  self: TestGamePlayer | null;
  otherPlayers: TestGamePlayer[];
  onBuildDistrict: (district: BuildableDistrictCard) => void;
};

export function HandCityPanel(props: HandCityPanelProps) {
  const hand = props.self?.hand ?? [];
  const city = props.self?.city ?? [];

  return (
    <>
      <section className="test-game-section test-game-section--wide">
        <h3>你的手牌</h3>
        <div className="test-card-row">
          {hand.map((card) => (
            <TestDistrictCard
              key={card.id}
              card={card}
              disabled={!props.canBuild}
              onBuild={() => props.onBuildDistrict(card)}
            />
          ))}
          {hand.length === 0 && <p>暂无手牌。</p>}
        </div>
      </section>

      <section className="test-game-section test-game-section--wide">
        <h3>你的城市</h3>
        <div className="test-card-row">
          {city.map((card) => (
            <GameCard
              key={card.id}
              cost={card.cost}
              description={card.description}
              name={card.name}
            />
          ))}
          {city.length === 0 && <p>你还没有建造建筑。</p>}
        </div>
      </section>

      <section className="test-game-section test-game-section--wide">
        <h3>其他玩家城市</h3>
        <div className="test-player-list">
          {props.otherPlayers.map((player) => (
            <article className="test-player-row" key={player.id}>
              <strong>{player.name}</strong>
              {player.city.length === 0 ? (
                <span className="test-city-empty">城市：无</span>
              ) : (
                <div className="test-city-list">
                  {player.city.map((district) => (
                    <span className="test-city-chip" key={district.id}>
                      {district.name} · {district.cost}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {props.otherPlayers.length === 0 && <p>暂无其他玩家。</p>}
        </div>
      </section>
    </>
  );
}

function TestDistrictCard(props: {
  card: BuildableDistrictCard;
  disabled: boolean;
  onBuild: () => void;
}) {
  return (
    <GameCard cost={props.card.cost} description={props.card.description} name={props.card.name}>
      <GameButton variant="secondary" size="sm" disabled={props.disabled} onClick={props.onBuild}>
        建造
      </GameButton>
    </GameCard>
  );
}

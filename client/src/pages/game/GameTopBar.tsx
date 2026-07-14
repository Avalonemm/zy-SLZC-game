import type { VisibleGameState } from "@zy/shared";
import type { RefObject } from "react";
import type { InfoModalId } from "../../components/ui/infoModalTypes";
import { UtilityMenuButton, type UtilityMenuIcon } from "../../components/ui/UtilityMenuButton";
import { phaseText } from "./gameText";
import { objectiveSummary } from "./GameObjectiveNotice";

export function GameTopBar(props: {
  gameState: VisibleGameState;
  objectiveIntroVisible: boolean;
  scoringButtonRef: RefObject<HTMLButtonElement>;
  onLeaveRoom: () => void;
  onOpenInfoModal: (modal: InfoModalId) => void;
  onOpenScoring: () => void;
}) {
  return (
    <header className="citadel-game-topbar">
      <section className="citadel-game-room-card" aria-label={"\u623f\u95f4\u4fe1\u606f"}>
        <strong>{"\u623f\u95f4\u53f7\uff1a"}{props.gameState.roomId}</strong>
        <span>{"\u7b2c "}{props.gameState.currentRound}{" \u8f6e · "}{phaseText(props.gameState.phase)}</span>
        <small className={props.objectiveIntroVisible ? "is-hidden" : ""}>
          {objectiveSummary(props.gameState.settings.endCitySize)}
        </small>
        <button
          ref={props.scoringButtonRef}
          className="citadel-game-room-card__score-button"
          data-scoring-trigger
          type="button"
          aria-label="打开计分总览"
          onClick={props.onOpenScoring}
        >
          <span aria-hidden="true">★</span> 计分
        </button>
      </section>
      <nav className="citadel-game-top-actions" aria-label={"\u5bf9\u5c40\u83dc\u5355"}>
        <GameTopAction label={"\u516c\u544a"} icon="announcement" onClick={() => props.onOpenInfoModal("announcements")} />
        <GameTopAction label={"\u5e2e\u52a9"} icon="help" onClick={() => props.onOpenInfoModal("help")} />
        <GameTopAction label={"\u8bbe\u7f6e"} icon="settings" onClick={() => props.onOpenInfoModal("settings")} />
        <GameTopAction label={"\u9000\u51fa\u623f\u95f4"} icon="exit" onClick={props.onLeaveRoom} />
      </nav>
    </header>
  );
}

function GameTopAction(props: {
  icon: UtilityMenuIcon;
  label: string;
  onClick: () => void;
}) {
  return <UtilityMenuButton icon={props.icon} label={props.label} onClick={props.onClick} />;
}

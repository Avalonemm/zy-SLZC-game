import { UtilityMenuButton } from "../../components/ui/UtilityMenuButton";
import { USE_LIGHTWEIGHT_UI } from "./lobbyScreenConfig";
import type { InfoModalId } from "../../components/ui/infoModalTypes";

export function LobbyFooter(props: {
  hasRoom: boolean;
  onLeaveRoom: () => void;
  onOpenModal: (modal: InfoModalId) => void;
}) {
  return (
    <footer
      className={
        USE_LIGHTWEIGHT_UI
          ? "fantasy-footer fantasy-footer--lite"
          : "fantasy-footer fantasy-footer--image"
      }
    >
      <UtilityMenuButton
        icon="announcement"
        label={"\u516c\u544a"}
        onClick={() => props.onOpenModal("announcements")}
      />
      <UtilityMenuButton
        icon="help"
        label={"\u5e2e\u52a9"}
        onClick={() => props.onOpenModal("help")}
      />
      <UtilityMenuButton
        icon="settings"
        label={"\u8bbe\u7f6e"}
        onClick={() => props.onOpenModal("settings")}
      />
      {props.hasRoom && (
        <UtilityMenuButton icon="exit" label={"\u9000\u51fa\u623f\u95f4"} onClick={props.onLeaveRoom} />
      )}
      <span>v1.0.0</span>
    </footer>
  );
}

export function getLobbyInfoModalTitle(modal: InfoModalId) {
  if (modal === "settings") {
    return "\u8bbe\u7f6e";
  }
  if (modal === "announcements") {
    return "\u516c\u544a";
  }
  return "\u5e2e\u52a9";
}

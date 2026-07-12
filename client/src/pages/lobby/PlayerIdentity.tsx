import { GameButton } from "../../components/ui/GameButton";
import { GameInput } from "../../components/ui/GameInput";
import { GamePanel } from "../../components/ui/GamePanel";
import { assetBase, presetAvatars, USE_LIGHTWEIGHT_UI } from "./lobbyScreenConfig";

export function PlayerIdentity(props: {
  avatarImage: string | null;
  avatarLabel: string;
  isOpen: boolean;
  playerName: string;
  uid: number;
  onChooseAvatar: (label: string) => void;
  onNameChange: (name: string) => void;
  onOpenFile: () => void;
  onToggleOpen: () => void;
}) {
  return (
    <section
      className={
        USE_LIGHTWEIGHT_UI
          ? "player-identity player-identity--lite"
          : "player-identity player-identity--image"
      }
    >
      <button
        className={
          USE_LIGHTWEIGHT_UI
            ? "identity-avatar identity-avatar--lite"
            : "identity-avatar identity-avatar--image"
        }
        type="button"
        onClick={props.onToggleOpen}
      >
        {!USE_LIGHTWEIGHT_UI && (
          <img className="identity-avatar__frame" src={`${assetBase}/avatar-frame.png`} alt="" />
        )}
        <span className="identity-avatar__content">
          {props.avatarImage ? <img src={props.avatarImage} alt="" /> : props.avatarLabel}
        </span>
      </button>
      <button className="identity-copy" type="button" onClick={props.onToggleOpen}>
        <strong>{props.playerName || "\u73a9\u5bb6"}</strong>
        <span>UID: {props.uid}</span>
      </button>
      {props.isOpen && (
        <GamePanel className="profile-popover">
          <GameInput
            label={"\u6635\u79f0"}
            maxLength={16}
            onChange={(event) => props.onNameChange(event.target.value)}
            placeholder={"\u8f93\u5165\u6635\u79f0"}
            type="text"
            value={props.playerName}
          />
          <div className="avatar-choice-row">
            {presetAvatars.map((label) => (
              <button key={label} type="button" onClick={() => props.onChooseAvatar(label)}>
                {label}
              </button>
            ))}
          </div>
          <GameButton variant="secondary" size="sm" onClick={props.onOpenFile}>
            {"\u4e0a\u4f20\u5934\u50cf"}
          </GameButton>
        </GamePanel>
      )}
    </section>
  );
}

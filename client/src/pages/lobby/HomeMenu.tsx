import { useRef, type FormEvent } from "react";
import { assetBase } from "./lobbyScreenConfig";

export function HomeMenu(props: {
  isConnected: boolean;
  playerName: string;
  roomCodeInput: string;
  onCreateRoom: () => void;
  onCreateTutorialRoom: () => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
  onRoomCodeChange: (value: string) => void;
}) {
  const roomCodeInputRef = useRef<HTMLInputElement | null>(null);
  const canUseRoomActions = props.isConnected && Boolean(props.playerName.trim());
  const canJoin = canUseRoomActions && Boolean(props.roomCodeInput.trim());

  return (
    <section className="home-menu">
      <div className="home-menu__content">
        <div className="home-menu__brand" aria-label={"\u5bcc\u9976\u4e4b\u57ce"}>
          <img className="home-menu__logo" src={assetBase + "/logo-title.png"} alt={"\u5bcc\u9976\u4e4b\u57ce Citadels"} />
        </div>

        <div className="home-menu__actions">
          <button
            className="home-action-card home-action-card--create"
            disabled={!canUseRoomActions}
            onClick={props.onCreateRoom}
            type="button"
          >
            <span className="home-action-card__icon" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="img">
                <path d="M17 10h30l4 8v36l-19-8-19 8V18l4-8Z" />
                <path d="M32 22v18M23 31h18" />
              </svg>
            </span>
            <span className="home-action-card__copy">
              <strong>{"\u521b\u5efa\u623f\u95f4"}</strong>
              <small>{"\u521b\u5efa\u65b0\u623f\u95f4"}</small>
            </span>
          </button>

          <button
            className="home-action-card home-action-card--join"
            disabled={!canUseRoomActions}
            onClick={() => roomCodeInputRef.current?.focus()}
            type="button"
          >
            <span className="home-action-card__icon" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="img">
                <circle cx="22" cy="26" r="9" />
                <circle cx="42" cy="26" r="9" />
                <circle cx="32" cy="22" r="10" />
                <path d="M10 50c3-10 10-15 21-15s19 5 23 15" />
              </svg>
            </span>
            <span className="home-action-card__copy">
              <strong>{"\u52a0\u5165\u623f\u95f4"}</strong>
              <small>{"\u52a0\u5165\u5df2\u6709\u623f\u95f4"}</small>
            </span>
          </button>
        </div>

        <button
          className="home-menu__tutorial"
          disabled={!canUseRoomActions}
          type="button"
          onClick={props.onCreateTutorialRoom}
        >
          第一次玩？创建新手教学房（你 + 3 名人机）
        </button>

        <form className="home-menu__join" onSubmit={props.onJoinRoom}>
          <label className="home-menu__field" aria-label={"\u623f\u95f4\u53f7"}>
            <span aria-hidden="true">
              <svg viewBox="0 0 32 32" role="img">
                <path d="M8 4h12v24H8z" />
                <path d="M20 9l6 3v16h-6" />
                <circle cx="17" cy="17" r="1.6" />
              </svg>
            </span>
            <input
              ref={roomCodeInputRef}
              maxLength={6}
              onChange={(event) => props.onRoomCodeChange(event.target.value)}
              placeholder={"\u8f93\u5165\u623f\u95f4\u53f7"}
              type="text"
              value={props.roomCodeInput}
            />
          </label>
          <button className="home-menu__join-submit" disabled={!canJoin} type="submit">
            {"\u52a0\u5165"}
          </button>
        </form>
        <p className="home-menu__hint">{"\u8f93\u5165\u623f\u95f4\u53f7\u540e\u70b9\u51fb\u52a0\u5165"}</p>
      </div>
    </section>
  );
}

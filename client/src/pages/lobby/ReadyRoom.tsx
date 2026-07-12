import type { LobbyPlayer, RoomState } from "@zy/shared";
import { ChatPanel } from "../../components/ui/ChatPanel";
import { GameBadge } from "../../components/ui/GameBadge";
import { GamePanel } from "../../components/ui/GamePanel";
import { PlayerSeat } from "../../components/ui/PlayerSeat";
import { createPlayerSeatSlots } from "../../components/ui/playerSeatLayout";
import { presetAvatars, USE_LIGHTWEIGHT_UI } from "./lobbyScreenConfig";

export function ReadyRoom(props: {
  roomState: RoomState;
  playerId: string | null;
  avatarImage: string | null;
  currentPlayer: LobbyPlayer | null;
  isHost: boolean;
  canStartGame: boolean;
  roomDiscardSummary: string;
  onOpenSettings: () => void;
  onAddRoomSeat: () => void;
  onRemoveRoomSeat: () => void;
  onRemoveBot: (targetBotPlayerId: string) => void;
  onKickPlayer: (targetPlayerId: string) => void;
  onTransferHost: (targetPlayerId: string) => void;
  onStartGame: () => void;
  onAddBot: () => void;
  onToggleReady: () => void;
  onLeaveRoom: () => void;
  onSendChatMessage: (message: string) => void;
}) {
  const lobbySeatSlots = createPlayerSeatSlots(props.roomState.players, props.roomState.maxPlayers);
  const nonHostPlayers = props.roomState.players.filter((player) => !player.isHost);
  const readyCount = nonHostPlayers.filter((player) => player.isReady).length;
  const startDisabledReason = getStartDisabledReason(props.roomState);

  return (
    <section className="lobby-shell">
      <GamePanel
        className={
          USE_LIGHTWEIGHT_UI ? "lobby-panel lobby-panel--lite" : "lobby-panel lobby-panel--image"
        }
      >
        <header className="lobby-header">
          <div>
            <span className="section-label">{"\u623f\u95f4\u7801"}</span>
            <strong className="room-code">{props.roomState.roomCode}</strong>
          </div>
          <div className="lobby-badges">
            <GameBadge>{"\u7b49\u5f85\u4e2d"}</GameBadge>
            <GameBadge>
              {props.roomState.players.length}/{props.roomState.maxPlayers} {"\u4eba"}
            </GameBadge>
            <GameBadge tone="ready">
              {readyCount}/{nonHostPlayers.length} {"\u5df2\u51c6\u5907"}
            </GameBadge>
          </div>
        </header>

        <section className="lobby-room-settings lobby-room-summary" aria-label={"\u623f\u95f4\u8bbe\u7f6e"}>
          <div className="lobby-room-settings__public">
            <span className="lobby-room-summary__item">
              <strong>{"\u6bcf\u8f6e\u65f6\u95f4"}</strong>
              <b>{props.roomState.settings.turnTimeoutSeconds} {"\u79d2"}</b>
            </span>
            <span className="lobby-room-summary__item">
              <strong>{"\u7ed3\u675f\u6761\u4ef6"}</strong>
              <b>{"\u5efa\u9020"} {props.roomState.settings.endCitySize} {"\u680b"}</b>
            </span>
            <span className="lobby-room-summary__item">
              <strong>{"\u672c\u5c40\u5f03\u724c"}</strong>
              <b>{props.roomDiscardSummary}</b>
            </span>
          </div>
          {props.isHost && (
            <button className="lobby-room-settings__open" type="button" onClick={props.onOpenSettings}>
              {"\u623f\u95f4\u8bbe\u7f6e"}
            </button>
          )}
        </section>

        <div className={props.roomState.maxPlayers > 4 ? "player-seat-list player-seat-list--many" : "player-seat-list"}>
          {lobbySeatSlots.map((slot) => {
            const canRemoveSeat =
              slot.kind === "empty" &&
              props.isHost &&
              slot.index === props.roomState.maxPlayers - 1 &&
              props.roomState.maxPlayers > Math.max(props.roomState.minPlayers, props.roomState.players.length);

            return slot.kind === "player" ? (
              <PlayerSeat
                key={slot.player.id}
                avatar={slot.player.id === props.playerId ? props.avatarImage : null}
                avatarLabel={
                  slot.player.isBot ? "\u673a" : presetAvatars[slot.index % presetAvatars.length]
                }
                connected={slot.player.connected}
                isBot={slot.player.isBot}
                isHost={slot.player.isHost}
                isReady={slot.player.isReady}
                name={slot.player.name}
                onRemoveBot={
                  props.isHost && slot.player.isBot ? () => props.onRemoveBot(slot.player.id) : undefined
                }
                onKickPlayer={
                  props.isHost && !slot.player.isBot && slot.player.id !== props.playerId
                    ? () => props.onKickPlayer(slot.player.id)
                    : undefined
                }
                onTransferHost={
                  props.isHost &&
                  !slot.player.isBot &&
                  slot.player.connected &&
                  slot.player.id !== props.playerId
                    ? () => props.onTransferHost(slot.player.id)
                    : undefined
                }
              />
            ) : canRemoveSeat ? (
              <button className="player-seat player-seat--remove-seat" key={`remove-seat-${slot.index}`} type="button" onClick={props.onRemoveRoomSeat}>
                <span className="player-seat__avatar player-seat__avatar--remove" aria-hidden="true">
                  -
                </span>
                <span className="player-seat__copy">
                  <strong>{"\u6536\u8d77\u5ea7\u4f4d"}</strong>
                  <p>{"\u6536\u8d77\u540e"} {props.roomState.players.length}/{props.roomState.maxPlayers - 1} {"\u4eba"}</p>
                </span>
              </button>
            ) : (
              <PlayerSeat key={`empty-${slot.index}`} avatarLabel={"\u7a7a"} />
            );
          })}
          {props.isHost && props.roomState.maxPlayers < props.roomState.futureMaxPlayers && (
            <button className="player-seat player-seat--add-seat" type="button" onClick={props.onAddRoomSeat}>
              <span className="player-seat__avatar player-seat__avatar--add" aria-hidden="true">
                +
              </span>
              <span className="player-seat__copy">
                <strong>{"\u6dfb\u52a0\u5ea7\u4f4d"}</strong>
                <p>{"\u6269\u5c55\u5230"} {props.roomState.maxPlayers + 1}/{props.roomState.futureMaxPlayers} {"\u4eba"}</p>
              </span>
            </button>
          )}
        </div>

        <div className="lobby-actions">
          {props.isHost ? (
            <>
              <LobbyImageButton
                className="lobby-image-button--start"
                label={"\u5f00\u59cb\u6e38\u620f"}
                onClick={props.onStartGame}
                disabled={!props.canStartGame}
                disabledReason={startDisabledReason}
              />
              <LobbyImageButton
                className="lobby-image-button--add-bot"
                label={"\u6dfb\u52a0\u4eba\u673a"}
                onClick={props.onAddBot}
                disabled={props.roomState.players.length >= props.roomState.maxPlayers}
              />
            </>
          ) : (
            <LobbyImageButton
              className={props.currentPlayer?.isReady ? "lobby-image-button--cancel-ready" : "lobby-image-button--ready"}
              label={props.currentPlayer?.isReady ? "\u53d6\u6d88\u51c6\u5907" : "\u51c6\u5907"}
              onClick={props.onToggleReady}
            />
          )}
          <LobbyImageButton
            className="lobby-image-button--leave"
            label={"\u79bb\u5f00\u623f\u95f4"}
            onClick={props.onLeaveRoom}
          />
        </div>
      </GamePanel>
      <aside className="lobby-chat-column" aria-label={"\u623f\u95f4\u804a\u5929"}>
        <ChatPanel messages={props.roomState.chatMessages} onSendMessage={props.onSendChatMessage} />
      </aside>
    </section>
  );
}

function LobbyImageButton(props: {
  className: string;
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      className={
        USE_LIGHTWEIGHT_UI
          ? `lite-button lobby-lite-button ${props.className}`
          : `lobby-image-button ${props.className}`
      }
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.disabled ? props.disabledReason : props.label}
      type="button"
    >
      <span>{props.label}</span>
    </button>
  );
}

function getStartDisabledReason(roomState: RoomState) {
  if (roomState.status !== "LOBBY") {
    return "当前房间不能开始游戏。";
  }
  if (roomState.players.length < roomState.minPlayers) {
    return `至少需要 ${roomState.minPlayers} 名玩家才能开始。`;
  }
  if (roomState.players.length > roomState.maxPlayers) {
    return "当前玩家人数超过房间上限。";
  }
  if (roomState.players.some((player) => !player.connected)) {
    return "还有玩家离线，暂时不能开始。";
  }
  if (roomState.players.some((player) => !player.isHost && !player.isReady)) {
    return "还有玩家未准备。";
  }
  return undefined;
}

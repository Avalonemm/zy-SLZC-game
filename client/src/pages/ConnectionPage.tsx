import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type {
  ActionEventPayload,
  ChatMessage,
  ConnectionStatus,
  ErrorPayload,
  RoomCommandResult,
  RoomState,
  ServerStatusPayload,
  VisibleGameState
} from "@zy/shared";
import { GameBadge } from "../components/ui/GameBadge";
import { GameButton } from "../components/ui/GameButton";
import { GameInput } from "../components/ui/GameInput";
import { GamePanel } from "../components/ui/GamePanel";
import { PlayerSeat } from "../components/ui/PlayerSeat";
import { createPlayerSeatSlots } from "../components/ui/playerSeatLayout";
import { ChatPanel } from "../components/ui/ChatPanel";
import { RulebookHelp } from "../components/help/RulebookHelp";
import { TestGameView } from "../components/test-game/TestGameView";
import {
  defaultHelpDocuments,
  helpTabs,
  type HelpTabId
} from "../components/help/helpTabs";
import { serverUrl, socket } from "../socket/socketClient";

const connectionStatusText: Record<ConnectionStatus, string> = {
  connecting: "连接中",
  connected: "已连接",
  disconnected: "已断开"
};

const presetAvatars = ["王冠", "骑士", "城堡", "金币"];
const assetBase = "/assets/homepage-v1";
const USE_LIGHTWEIGHT_UI = true;
const savedSessionKey = "zy-board-game-session";
const standardRoles = [
  { id: "assassin", name: "刺客" },
  { id: "thief", name: "盗贼" },
  { id: "magician", name: "魔术师" },
  { id: "king", name: "国王" },
  { id: "bishop", name: "主教" },
  { id: "merchant", name: "商人" },
  { id: "architect", name: "建筑师" },
  { id: "warlord", name: "军阀" }
];

type SavedSession = {
  roomCode: string;
  playerId: string;
};

function readSavedSession(): SavedSession | null {
  const rawSession = window.localStorage.getItem(savedSessionKey);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as Partial<SavedSession>;
    if (!parsedSession.roomCode || !parsedSession.playerId) {
      return null;
    }

    return {
      roomCode: parsedSession.roomCode,
      playerId: parsedSession.playerId
    };
  } catch {
    clearSavedSession();
    return null;
  }
}

function persistSavedSession(session: SavedSession) {
  window.localStorage.setItem(savedSessionKey, JSON.stringify(session));
}

function clearSavedSession() {
  window.localStorage.removeItem(savedSessionKey);
}

export function ConnectionPage() {
  const [status, setStatus] = useState<ConnectionStatus>(
    socket.connected ? "connected" : "connecting"
  );
  const [serverStatus, setServerStatus] = useState<ServerStatusPayload | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<VisibleGameState | null>(null);
  const [actionEvents, setActionEvents] = useState<ActionEventPayload[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const [turnTimeoutInput, setTurnTimeoutInput] = useState("15");
  const [endCitySizeInput, setEndCitySizeInput] = useState("8");
  const [enabledRoleIdsInput, setEnabledRoleIdsInput] = useState<string[]>(
    standardRoles.map((role) => role.id)
  );
  const [enableFaceUpRoleDiscardInput, setEnableFaceUpRoleDiscardInput] = useState(true);
  const [enableFaceDownRoleDiscardInput, setEnableFaceDownRoleDiscardInput] = useState(true);
  const [isRoomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [avatarLabel, setAvatarLabel] = useState("王冠");
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<"settings" | "announcements" | "help" | null>(null);
  const [announcementText, setAnnouncementText] = useState("公告内容加载中。");
  const [activeHelpTab, setActiveHelpTab] = useState<HelpTabId>("rules");
  const [helpDocuments, setHelpDocuments] =
    useState<Record<HelpTabId, string>>(defaultHelpDocuments);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reconnectAttemptedRef = useRef(false);

  useEffect(() => {
    function handleConnect() {
      setStatus("connected");
    }

    function handleDisconnect() {
      setStatus("disconnected");
    }

    function handleServerStatus(payload: ServerStatusPayload) {
      setServerStatus(payload);
      setPlayerName((current) => current || `玩家${payload.uid}`);
    }

    function handleRoomCreated(payload: RoomCommandResult) {
      setPlayerId(payload.playerId);
      persistSavedSession(payload);
      setMessage(`已创建房间 ${payload.roomCode}`);
    }

    function handleJoinedRoom(payload: RoomCommandResult) {
      setPlayerId(payload.playerId);
      persistSavedSession(payload);
      setMessage(`已加入房间 ${payload.roomCode}`);
    }

    function handleReconnectedRoom(payload: RoomCommandResult) {
      setPlayerId(payload.playerId);
      persistSavedSession(payload);
      setMessage(`已恢复房间 ${payload.roomCode}`);
    }

    function handleRoomState(payload: RoomState) {
      setRoomState(payload);
      setRoomCodeInput(payload.roomCode);
      setTurnTimeoutInput(String(payload.settings.turnTimeoutSeconds));
      setEndCitySizeInput(String(payload.settings.endCitySize));
      setEnabledRoleIdsInput(payload.settings.enabledRoleIds);
      setEnableFaceUpRoleDiscardInput(payload.settings.enableFaceUpRoleDiscard);
      setEnableFaceDownRoleDiscardInput(payload.settings.enableFaceDownRoleDiscard);
    }

    function handleGameState(payload: VisibleGameState) {
      setGameState(payload);
    }

    function handleActionEvent(payload: ActionEventPayload) {
      setActionEvents((current) => [payload, ...current].slice(0, 8));
      setMessage(payload.message);
    }

    function handleChatMessage(payload: ChatMessage) {
      setRoomState((current) => {
        if (!current || current.roomCode !== payload.roomCode) {
          return current;
        }

        if (current.chatMessages.some((message) => message.id === payload.id)) {
          return current;
        }

        return {
          ...current,
          chatMessages: [...current.chatMessages, payload].slice(-50)
        };
      });
    }

    function handleKickedFromRoom(payload: { roomCode: string; message: string }) {
      setRoomState(null);
      setGameState(null);
      setActionEvents([]);
      setPlayerId(null);
      clearSavedSession();
      setMessage(payload.message);
    }

    function handleError(payload: ErrorPayload) {
      setMessage(payload.message);
      if (payload.message.includes("无法恢复房间")) {
        clearSavedSession();
      }
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("server_status", handleServerStatus);
    socket.on("room_created", handleRoomCreated);
    socket.on("joined_room", handleJoinedRoom);
    socket.on("reconnected_room", handleReconnectedRoom);
    socket.on("room_state", handleRoomState);
    socket.on("game_state", handleGameState);
    socket.on("action_event", handleActionEvent);
    socket.on("chat_message", handleChatMessage);
    socket.on("kicked_from_room", handleKickedFromRoom);
    socket.on("error_message", handleError);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("server_status", handleServerStatus);
      socket.off("room_created", handleRoomCreated);
      socket.off("joined_room", handleJoinedRoom);
      socket.off("reconnected_room", handleReconnectedRoom);
      socket.off("room_state", handleRoomState);
      socket.off("game_state", handleGameState);
      socket.off("action_event", handleActionEvent);
      socket.off("chat_message", handleChatMessage);
      socket.off("kicked_from_room", handleKickedFromRoom);
      socket.off("error_message", handleError);
    };
  }, []);

  useEffect(() => {
    fetch("/announcements.txt")
      .then((response) => (response.ok ? response.text() : "暂无公告。"))
      .then(setAnnouncementText)
      .catch(() => setAnnouncementText("公告读取失败，请检查公告文件。"));
  }, []);

  useEffect(() => {
    let isMounted = true;

    Promise.all(
      helpTabs.map((tab) =>
        fetch(tab.path)
          .then((response) => (response.ok ? response.text() : `${tab.label} 暂无内容。`))
          .then((content) => [tab.id, content] as const)
          .catch(() => [tab.id, `${tab.label} 读取失败，请检查 ${tab.path}。`] as const)
      )
    ).then((entries) => {
      if (!isMounted) {
        return;
      }

      setHelpDocuments(Object.fromEntries(entries) as Record<HelpTabId, string>);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (status !== "connected" || playerId || reconnectAttemptedRef.current) {
      return;
    }

    const savedSession = readSavedSession();
    if (!savedSession) {
      return;
    }

    reconnectAttemptedRef.current = true;
    socket.emit("reconnect_room", savedSession);
    setMessage("正在尝试恢复上次房间...");
  }, [playerId, status]);

  useEffect(() => {
    if (!roomState?.startCountdown) {
      return;
    }

    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [roomState?.startCountdown?.deadlineAt]);

  const uid = serverStatus?.uid ?? 100001;
  const isConnected = status === "connected";
  const currentPlayer = useMemo(
    () => roomState?.players.find((player) => player.id === playerId) ?? null,
    [playerId, roomState]
  );
  const isHost = currentPlayer?.isHost ?? false;
  const readyCount = roomState?.players.filter((player) => player.isReady).length ?? 0;
  const canStartGame = useMemo(() => {
    if (!roomState || !isHost) {
      return false;
    }

    return (
      roomState.players.length >= roomState.minPlayers &&
      roomState.players.length <= roomState.maxPlayers &&
      roomState.players.every((player) => player.isReady && player.connected) &&
      roomState.status === "LOBBY"
    );
  }, [isHost, roomState]);
  const lobbySeatSlots = useMemo(
    () => (roomState ? createPlayerSeatSlots(roomState.players, roomState.maxPlayers) : []),
    [roomState]
  );
  const startCountdownSeconds = roomState?.startCountdown
    ? Math.max(0, Math.ceil((new Date(roomState.startCountdown.deadlineAt).getTime() - nowMs) / 1000))
    : null;

  function createRoom(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMessage("");
    socket.emit("create_room", { playerName });
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    socket.emit("join_room", {
      playerName,
      roomCode: roomCodeInput
    });
  }

  function toggleReady() {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("set_ready", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      isReady: !currentPlayer.isReady
    });
  }

  function startGame() {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("start_game", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id
    });
    setActionEvents([]);
  }

  function addTestBot() {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("add_test_bots", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id
    });
  }

  function removeTestBot(targetBotPlayerId: string) {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("remove_test_bot", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      targetBotPlayerId
    });
  }

  function kickPlayer(targetPlayerId: string) {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("kick_player", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      targetPlayerId
    });
  }

  function transferHost(targetPlayerId: string) {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("transfer_host", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      targetPlayerId
    });
  }

  function updateRoomSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("update_room_settings", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      settings: {
        turnTimeoutSeconds: Number(turnTimeoutInput),
        endCitySize: Number(endCitySizeInput),
        enabledRoleIds: enabledRoleIdsInput,
        enableFaceUpRoleDiscard: enableFaceUpRoleDiscardInput,
        enableFaceDownRoleDiscard: enableFaceDownRoleDiscardInput,
        drawMode: "draw2Choose1"
      }
    });
    setRoomSettingsOpen(false);
  }

  function toggleEnabledRole(roleId: string) {
    setEnabledRoleIdsInput((current) =>
      current.includes(roleId)
        ? current.filter((enabledRoleId) => enabledRoleId !== roleId)
        : [...current, roleId]
    );
  }

  function sendChatMessage(message: string) {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("send_chat_message", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id,
      message
    });
  }

  function leaveRoom() {
    if (!roomState || !currentPlayer) {
      return;
    }

    socket.emit("leave_room", {
      roomCode: roomState.roomCode,
      playerId: currentPlayer.id
    });
    setRoomState(null);
    setGameState(null);
    setActionEvents([]);
    setPlayerId(null);
    clearSavedSession();
    setMessage("已离开房间。");
  }

  function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarImage(String(reader.result));
      setAvatarLabel("");
    };
    reader.readAsDataURL(file);
  }

  const baseScreenClassName = gameState
    ? "fantasy-screen fantasy-screen--game"
    : roomState
      ? "fantasy-screen fantasy-screen--lobby"
      : "fantasy-screen fantasy-screen--home";
  const screenClassName = USE_LIGHTWEIGHT_UI
    ? `${baseScreenClassName} lightweight-ui`
    : baseScreenClassName;

  return (
    <main className={screenClassName}>
      {!gameState && (
        <PlayerIdentity
          avatarImage={avatarImage}
          avatarLabel={avatarLabel}
          isOpen={isProfileOpen}
          playerName={playerName}
          uid={uid}
          onChooseAvatar={(label) => {
            setAvatarLabel(label);
            setAvatarImage(null);
          }}
          onNameChange={setPlayerName}
          onOpenFile={() => fileInputRef.current?.click()}
          onToggleOpen={() => setProfileOpen((value) => !value)}
        />
      )}

      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        onChange={handleAvatarFile}
      />

      {gameState ? (
        <TestGameView
          actionEvents={actionEvents}
          chatMessages={roomState?.chatMessages ?? []}
          gameState={gameState}
          message={message}
          playerId={playerId}
          onBuildDistrict={(districtCardId) => {
            if (!playerId) {
              return;
            }
            socket.emit("build_district", {
              roomCode: gameState.roomId,
              playerId,
              districtCardId
            });
          }}
          onChooseDrawnCard={(districtCardId) => {
            if (!playerId) {
              return;
            }
            socket.emit("choose_drawn_district_card", {
              roomCode: gameState.roomId,
              playerId,
              districtCardId
            });
          }}
          onDrawCards={() => {
            if (!playerId) {
              return;
            }
            socket.emit("draw_district_cards", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onEndTurn={() => {
            if (!playerId) {
              return;
            }
            socket.emit("end_turn", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onSkipCurrentOfflinePlayer={() => {
            if (!playerId) {
              return;
            }
            socket.emit("skip_current_offline_player", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onLeaveRoom={leaveRoom}
          onSendChatMessage={sendChatMessage}
          onResolveTurnTimeout={() => {
            if (!playerId) {
              return;
            }
            socket.emit("resolve_turn_timeout", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onSelectRole={(roleId) => {
            if (!playerId) {
              return;
            }
            socket.emit("select_role", {
              roomCode: gameState.roomId,
              playerId,
              roleId
            });
          }}
          onTakeGold={() => {
            if (!playerId) {
              return;
            }
            socket.emit("take_gold", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onUseSkill={(payload) => {
            if (!playerId) {
              return;
            }
            socket.emit("use_role_skill", {
              roomCode: gameState.roomId,
              playerId,
              ...payload
            });
          }}
        />
      ) : roomState ? (
        <section className="lobby-shell">
          <GamePanel
            className={
              USE_LIGHTWEIGHT_UI ? "lobby-panel lobby-panel--lite" : "lobby-panel lobby-panel--image"
            }
          >
            <header className="lobby-header">
              <div>
                <span className="section-label">房间码</span>
                <strong className="room-code">{roomState.roomCode}</strong>
              </div>
              <div className="lobby-badges">
                <GameBadge>等待中</GameBadge>
                <GameBadge>
                  {roomState.players.length}/{roomState.maxPlayers} 人
                </GameBadge>
                <GameBadge tone="ready">
                  {readyCount}/{roomState.maxPlayers} 已准备
                </GameBadge>
              </div>
            </header>

          <section className="lobby-room-settings" aria-label="房间设置">
            <div className="lobby-room-settings__public">
              <strong>房间设置</strong>
              <span>每轮等待：{roomState.settings.turnTimeoutSeconds} 秒</span>
              <span>结束条件：{roomState.settings.endCitySize} 建筑</span>
              <span className="lobby-room-settings__roles-summary">
                角色：
                {roomState.settings.enabledRoleIds
                  .map((roleId) => standardRoles.find((role) => role.id === roleId)?.name ?? roleId)
                  .join("、")}
              </span>
              <span>明弃：{roomState.settings.enableFaceUpRoleDiscard ? "启用" : "关闭"}</span>
              <span>暗弃：{roomState.settings.enableFaceDownRoleDiscard ? "启用" : "关闭"}</span>
              <span className="lobby-room-settings__draw-summary">抽牌：抽 2 选 1，未选放回底部</span>
              {startCountdownSeconds !== null && (
                <span className="lobby-countdown">全员已准备，{startCountdownSeconds} 秒后自动开始</span>
              )}
            </div>
            {isHost && (
              <button
                className="lobby-room-settings__open"
                type="button"
                onClick={() => setRoomSettingsOpen(true)}
              >
                房间设置
              </button>
            )}
          </section>

          <div className="player-seat-list">
            {lobbySeatSlots.map((slot) =>
              slot.kind === "player" ? (
                <PlayerSeat
                  key={slot.player.id}
                  avatar={slot.player.id === playerId ? avatarImage : null}
                  avatarLabel={
                    slot.player.isBot ? "机" : presetAvatars[slot.index % presetAvatars.length]
                  }
                  connected={slot.player.connected}
                  isBot={slot.player.isBot}
                  isHost={slot.player.isHost}
                  isReady={slot.player.isReady}
                  name={slot.player.name}
                  onRemoveBot={
                    isHost && slot.player.isBot ? () => removeTestBot(slot.player.id) : undefined
                  }
                  onKickPlayer={
                    isHost && !slot.player.isBot && slot.player.id !== playerId
                      ? () => kickPlayer(slot.player.id)
                      : undefined
                  }
                  onTransferHost={
                    isHost &&
                    !slot.player.isBot &&
                    slot.player.connected &&
                    slot.player.id !== playerId
                      ? () => transferHost(slot.player.id)
                      : undefined
                  }
                />
              ) : (
                <PlayerSeat key={`empty-${slot.index}`} avatarLabel="空" />
              )
            )}
          </div>

          <div className="lobby-actions">
            {isHost ? (
              <>
                <LobbyImageButton
                  className="lobby-image-button--add-bot"
                  label="添加测试人机"
                  onClick={addTestBot}
                  disabled={roomState.players.length >= roomState.maxPlayers}
                />
                <LobbyImageButton
                  className="lobby-image-button--start"
                  label="开始游戏"
                  onClick={startGame}
                  disabled={!canStartGame}
                />
              </>
            ) : (
              <LobbyImageButton
                className={currentPlayer?.isReady ? "lobby-image-button--cancel-ready" : "lobby-image-button--ready"}
                label={currentPlayer?.isReady ? "取消准备" : "准备"}
                onClick={toggleReady}
              />
            )}
            <LobbyImageButton
              className="lobby-image-button--leave"
              label="离开房间"
              onClick={leaveRoom}
            />
          </div>

            <p className="lobby-tip">
              测试版支持 {roomState.minPlayers}-{roomState.maxPlayers} 人开局；后续预留到{" "}
              {roomState.futureMaxPlayers} 人。添加测试人机每次只会加入 1 个。
            </p>
            {message && <p className="fantasy-toast">{message}</p>}
          </GamePanel>
          <aside className="lobby-chat-column" aria-label="房间聊天">
            <ChatPanel messages={roomState.chatMessages} onSendMessage={sendChatMessage} />
          </aside>
        </section>
      ) : (
        <HomeMenu
          isConnected={isConnected}
          message={message}
          playerName={playerName}
          roomCodeInput={roomCodeInput}
          serverUrl={serverUrl}
          status={status}
          uid={uid}
          onCreateRoom={() => createRoom()}
          onJoinRoom={joinRoom}
          onRoomCodeChange={(value) => setRoomCodeInput(value.toUpperCase())}
        />
      )}

      {!gameState && (
        <footer
          className={
            USE_LIGHTWEIGHT_UI
              ? "fantasy-footer fantasy-footer--lite"
              : "fantasy-footer fantasy-footer--image"
          }
        >
          <FooterImageButton
            icon={USE_LIGHTWEIGHT_UI ? undefined : `${assetBase}/icon-settings.png`}
            label="设置"
            onClick={() => setModal("settings")}
          />
          <FooterImageButton
            icon={USE_LIGHTWEIGHT_UI ? undefined : `${assetBase}/icon-announcement.png`}
            label="公告"
            onClick={() => setModal("announcements")}
          />
          <FooterImageButton
            icon={USE_LIGHTWEIGHT_UI ? undefined : `${assetBase}/icon-help.png`}
            label="帮助"
            onClick={() => setModal("help")}
          />
          <span>v1.0.0</span>
        </footer>
      )}

      {roomState && isRoomSettingsOpen && (
        <InfoModal title="房间设置" onClose={() => setRoomSettingsOpen(false)}>
          <form className="room-settings-form" onSubmit={updateRoomSettings}>
            <label>
              <span>每轮玩家等待秒数</span>
              <input
                min={10}
                max={180}
                type="number"
                value={turnTimeoutInput}
                onChange={(event) => setTurnTimeoutInput(event.target.value)}
              />
            </label>
            <label>
              <span>结束建筑数</span>
              <input
                min={4}
                max={8}
                type="number"
                value={endCitySizeInput}
                onChange={(event) => setEndCitySizeInput(event.target.value)}
              />
            </label>
            <fieldset className="room-settings-form__fieldset">
              <legend>本局启用角色</legend>
              <div className="room-settings-form__roles">
                {standardRoles.map((role) => (
                  <label key={role.id}>
                    <input
                      type="checkbox"
                      checked={enabledRoleIdsInput.includes(role.id)}
                      onChange={() => toggleEnabledRole(role.id)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="room-settings-form__check">
              <input
                type="checkbox"
                checked={enableFaceUpRoleDiscardInput}
                onChange={(event) => setEnableFaceUpRoleDiscardInput(event.target.checked)}
              />
              启用明弃角色
            </label>
            <label className="room-settings-form__check">
              <input
                type="checkbox"
                checked={enableFaceDownRoleDiscardInput}
                onChange={(event) => setEnableFaceDownRoleDiscardInput(event.target.checked)}
              />
              启用暗弃角色
            </label>
            <p>默认按 4 人标准包配置。当前开发测试继续支持 2-4 人，5-8 人完整规则后置。</p>
            <p>抽牌固定为抽 2 选 1，未选择的牌放回建筑牌堆底部。</p>
            <button type="submit">保存设置</button>
          </form>
        </InfoModal>
      )}

      {modal && (
        <InfoModal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal === "settings" && (
            <p>这里后续会填充完整玩法规则、职业说明和基础设置。</p>
          )}
          {modal === "announcements" && <pre>{announcementText}</pre>}
          {modal === "help" && (
            <RulebookHelp
              activeTab={activeHelpTab}
              documents={helpDocuments}
              onChangeTab={setActiveHelpTab}
            />
          )}
        </InfoModal>
      )}
    </main>
  );
}

function HomeMenu(props: {
  isConnected: boolean;
  message: string;
  playerName: string;
  roomCodeInput: string;
  serverUrl: string;
  status: ConnectionStatus;
  uid: number;
  onCreateRoom: () => void;
  onJoinRoom: (event: FormEvent<HTMLFormElement>) => void;
  onRoomCodeChange: (value: string) => void;
}) {
  const canUseRoomActions = props.isConnected && Boolean(props.playerName.trim());
  const canJoin = canUseRoomActions && Boolean(props.roomCodeInput.trim());

  return (
    <section className="home-menu">
      {!USE_LIGHTWEIGHT_UI && (
        <img className="home-menu__panel" src={`${assetBase}/main-menu-panel.png`} alt="" />
      )}
      <div className="home-menu__content">
        {USE_LIGHTWEIGHT_UI ? (
          <div className="home-menu__lite-title">
            <strong>富饶之城</strong>
            <span>轻量测试模式</span>
          </div>
        ) : (
          <>
            <img className="home-menu__crest" src={`${assetBase}/title-crest.png`} alt="" />
            <img className="home-menu__logo" src={`${assetBase}/logo-title.png`} alt="富饶之城" />
          </>
        )}

        <ImageButton
          className="image-button--create home-menu__create"
          disabled={!canUseRoomActions}
          label="创建房间"
          onClick={props.onCreateRoom}
          type="button"
        />

        <form className="home-menu__join" onSubmit={props.onJoinRoom}>
          <div className="home-menu__join-title" aria-hidden="true">
            <span />
            加入房间
            <span />
          </div>
          <label className="home-menu__field">
            <span>房间号</span>
            <input
              maxLength={6}
              onChange={(event) => props.onRoomCodeChange(event.target.value)}
              placeholder="请输入房间号"
              type="text"
              value={props.roomCodeInput}
            />
          </label>
          <ImageButton
            className="image-button--join"
            disabled={!canJoin}
            label="加入房间"
            type="submit"
          />
        </form>

        <p className="socket-line socket-line--home">
          Socket：{connectionStatusText[props.status]} · UID：{props.uid} · 后端：{props.serverUrl}
        </p>
        {props.message && <p className="fantasy-toast fantasy-toast--home">{props.message}</p>}
      </div>
    </section>
  );
}

function ImageButton(props: {
  className: string;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  type: "button" | "submit";
}) {
  return (
    <button
      aria-label={props.label}
      className={
        USE_LIGHTWEIGHT_UI ? `lite-button ${props.className}` : `image-button ${props.className}`
      }
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type}
    >
      <span>{props.label}</span>
    </button>
  );
}

function FooterImageButton(props: {
  icon?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="footer-image-button" type="button" onClick={props.onClick}>
      {props.icon && <img src={props.icon} alt="" />}
      <span>{props.label}</span>
    </button>
  );
}

function LobbyImageButton(props: {
  className: string;
  disabled?: boolean;
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
      type="button"
    >
      <span>{props.label}</span>
    </button>
  );
}

function PlayerIdentity(props: {
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
          USE_LIGHTWEIGHT_UI ? "identity-avatar identity-avatar--lite" : "identity-avatar identity-avatar--image"
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
      <div
        className={
          USE_LIGHTWEIGHT_UI ? "identity-uid identity-uid--lite" : "identity-uid identity-uid--image"
        }
      >
        {!USE_LIGHTWEIGHT_UI && <img src={`${assetBase}/uid-plaque.png`} alt="" />}
        <span>UID：{props.uid}</span>
      </div>
      {props.isOpen && (
        <GamePanel className="profile-popover">
          <GameInput
            label="昵称"
            maxLength={16}
            onChange={(event) => props.onNameChange(event.target.value)}
            placeholder="输入昵称"
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
            上传头像
          </GameButton>
        </GamePanel>
      )}
    </section>
  );
}

function InfoModal(props: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <GamePanel className="fantasy-modal" title={props.title}>
        <button className="modal-close" type="button" onClick={props.onClose}>
          关闭
        </button>
        <div className="modal-body" onClick={(event) => event.stopPropagation()}>
          {props.children}
        </div>
      </GamePanel>
    </div>
  );
}

function modalTitle(modal: "settings" | "announcements" | "help") {
  if (modal === "settings") {
    return "设置";
  }
  if (modal === "announcements") {
    return "公告";
  }
  return "帮助";
}

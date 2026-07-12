import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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
import { RulebookHelp } from "../components/help/RulebookHelp";
import type { InfoModalId } from "../components/ui/infoModalTypes";
import { FirstTimeGuide, getCurrentGuideStep } from "../components/ui/FirstTimeGuide";
import { GameTableView } from "./game/GameTableView";
import { useGameCommandFeedback } from "./game/useGameCommandFeedback";
import {
  defaultHelpDocuments,
  helpTabs,
  type HelpTabId
} from "../components/help/helpTabs";
import { socket } from "../socket/socketClient";
import { HomeMenu } from "./lobby/HomeMenu";
import { InfoModal } from "./lobby/InfoModal";
import {
  getLobbyInfoModalTitle,
  LobbyFooter
} from "./lobby/LobbyFooter";
import { PlayerIdentity } from "./lobby/PlayerIdentity";
import { ReadyRoom } from "./lobby/ReadyRoom";
import { RoomSettingsModal } from "./lobby/RoomSettingsModal";
import { USE_LIGHTWEIGHT_UI } from "./lobby/lobbyScreenConfig";
import { useLobbyRoom } from "./lobby/useLobbyRoom";
import { useRoomSettings } from "./lobby/useRoomSettings";

const savedSessionKey = "zy-board-game-session";
const guideCompletionKey = "zy-board-game-guide-complete";
type SavedSession = {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
};

function readSavedSession(): SavedSession | null {
  const rawSession = window.localStorage.getItem(savedSessionKey);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession) as Partial<SavedSession>;
    if (!parsedSession.roomCode || !parsedSession.playerId || !parsedSession.reconnectToken) {
      return null;
    }

    return {
      roomCode: parsedSession.roomCode,
      playerId: parsedSession.playerId,
      reconnectToken: parsedSession.reconnectToken
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
  const [isRoomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [avatarLabel, setAvatarLabel] = useState("王冠");
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<InfoModalId | null>(null);
  const [announcementText, setAnnouncementText] = useState("公告内容加载中。");
  const [activeHelpTab, setActiveHelpTab] = useState<HelpTabId>("rules");
  const [helpDocuments, setHelpDocuments] =
    useState<Record<HelpTabId, string>>(defaultHelpDocuments);
  const [guideEnabled, setGuideEnabled] = useState(
    () => window.localStorage.getItem(guideCompletionKey) !== "1"
  );
  const [dismissedGuideStepId, setDismissedGuideStepId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reconnectAttemptedRef = useRef(false);
  const {
    dismissFeedback: dismissGameFeedback,
    feedback: gameFeedback,
    pendingCommand,
    runCommand,
    showError: showGameError
  } = useGameCommandFeedback();

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

    function handleReturnedToReadyRoom() {
      setGameState(null);
      setActionEvents([]);
      setMessage("已返回准备房间，请重新准备下一局。");
    }

    function handleRoomState(payload: RoomState) {
      setRoomState(payload);
      setRoomCodeInput(payload.roomCode);
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
      clearLocalRoomState(payload.message);
    }

    function handleError(payload: ErrorPayload) {
      setMessage(payload.message);
      showGameError(payload.message);
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
    socket.on("returned_to_ready_room", handleReturnedToReadyRoom);
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
      socket.off("returned_to_ready_room", handleReturnedToReadyRoom);
      socket.off("room_state", handleRoomState);
      socket.off("game_state", handleGameState);
      socket.off("action_event", handleActionEvent);
      socket.off("chat_message", handleChatMessage);
      socket.off("kicked_from_room", handleKickedFromRoom);
      socket.off("error_message", handleError);
    };
  }, [showGameError]);

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

  const uid = serverStatus?.uid ?? 100001;
  const isConnected = status === "connected";
  const currentPlayer = useMemo(
    () => roomState?.players.find((player) => player.id === playerId) ?? null,
    [playerId, roomState]
  );
  const isHost = currentPlayer?.isHost ?? false;
  const guideStep = useMemo(
    () => getCurrentGuideStep({ roomState, gameState, playerId }),
    [gameState, playerId, roomState]
  );
  const isGuideVisible = guideEnabled && dismissedGuideStepId !== guideStep.id;
  const canStartGame = useMemo(() => {
    if (!roomState || !isHost) {
      return false;
    }

    return (
      roomState.players.length >= roomState.minPlayers &&
      roomState.players.length <= roomState.maxPlayers &&
      roomState.players.every((player) => player.connected) &&
      roomState.players.every((player) => player.isHost || player.isReady) &&
      roomState.status === "LOBBY"
    );
  }, [isHost, roomState]);
  const {
    turnTimeoutInput,
    endCitySizeInput,
    enabledRoleIdsInput,
    enableFaceUpRoleDiscardInput,
    enableFaceDownRoleDiscardInput,
    canUseFaceUpRoleDiscard,
    canUseFaceDownRoleDiscard,
    roomDiscardSummary,
    requiredRoleCount,
    queenRequired,
    canSaveRoomSettings,
    setTurnTimeoutInput,
    setEndCitySizeInput,
    setEnableFaceUpRoleDiscardInput,
    setEnableFaceDownRoleDiscardInput,
    toggleEnabledRole
  } = useRoomSettings(roomState);
  const {
    createRoom,
    joinRoom,
    toggleReady,
    startGame,
    addBot,
    addRoomSeat,
    removeRoomSeat,
    removeBot,
    kickPlayer,
    transferHost,
    updateRoomSettings,
    sendChatMessage,
    leaveRoom
  } = useLobbyRoom({
    roomState,
    currentPlayer,
    isHost,
    playerName,
    roomCodeInput,
    turnTimeoutInput,
    endCitySizeInput,
    enabledRoleIdsInput,
    enableFaceUpRoleDiscardInput,
    enableFaceDownRoleDiscardInput,
    canUseFaceUpRoleDiscard,
    canUseFaceDownRoleDiscard,
    canSaveRoomSettings,
    requiredRoleCount,
    onMessage: setMessage,
    onResetActionEvents: () => setActionEvents([]),
    onRoomSettingsSaved: () => setRoomSettingsOpen(false),
    onLeaveRoomLocally: clearLocalRoomState
  });

  function clearLocalRoomState(nextMessage: string) {
    setRoomState(null);
    setGameState(null);
    setActionEvents([]);
    setPlayerId(null);
    clearSavedSession();
    setMessage(nextMessage);
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
    <main className={screenClassName} data-guide-stage={isGuideVisible ? guideStep.id : undefined}>
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
        <GameTableView
          actionEvents={actionEvents}
          commandFeedback={gameFeedback}
          selfAvatarImage={avatarImage}
          selfAvatarLabel={avatarLabel}
          chatMessages={roomState?.chatMessages ?? []}
          gameState={gameState}
          pendingCommand={pendingCommand}
          playerId={playerId}
          onDismissCommandFeedback={dismissGameFeedback}
          onBuildDistrict={(districtCardId) => {
            if (!playerId) {
              return;
            }
            runCommand("build", "建造", (ack) =>
              socket.emit("build_district", {
                roomCode: gameState.roomId,
                playerId,
                districtCardId
              }, ack)
            );
          }}
          onChooseDrawnCard={(districtCardId) => {
            if (!playerId) {
              return;
            }
            runCommand("choose-drawn-card", "选择建筑牌", (ack) =>
              socket.emit("choose_drawn_district_card", {
                roomCode: gameState.roomId,
                playerId,
                districtCardId
              }, ack)
            );
          }}
          onDrawCards={() => {
            if (!playerId) {
              return;
            }
            runCommand("draw", "抽卡", (ack) =>
              socket.emit("draw_district_cards", {
                roomCode: gameState.roomId,
                playerId
              }, ack)
            );
          }}
          onEndTurn={() => {
            if (!playerId) {
              return;
            }
            runCommand("end-turn", "结束回合", (ack) =>
              socket.emit("end_turn", {
                roomCode: gameState.roomId,
                playerId
              }, ack)
            );
          }}
          onSkipCurrentOfflinePlayer={() => {
            if (!playerId) {
              return;
            }
            runCommand("skip-offline", "跳过离线玩家", (ack) =>
              socket.emit("skip_current_offline_player", {
                roomCode: gameState.roomId,
                playerId
              }, ack)
            );
          }}
          onLeaveRoom={leaveRoom}
          onRematch={() => {
            if (!playerId) {
              return;
            }
            socket.emit("request_rematch", {
              roomCode: gameState.roomId,
              playerId
            });
          }}
          onOpenInfoModal={setModal}
          onSendChatMessage={sendChatMessage}
          onResolveTurnTimeout={() => {
            if (!playerId) {
              return;
            }
            runCommand("resolve-timeout", "处理超时", (ack) =>
              socket.emit("resolve_turn_timeout", {
                roomCode: gameState.roomId,
                playerId
              }, ack)
            );
          }}
          onResolveGraveyardChoice={(buyBack) => {
            if (!playerId) {
              return;
            }
            runCommand("graveyard", "处理墓地效果", (ack) =>
              socket.emit("resolve_graveyard_choice", {
                roomCode: gameState.roomId,
                playerId,
                buyBack
              }, ack)
            );
          }}
          onSelectRole={(roleId) => {
            if (!playerId) {
              return;
            }
            runCommand("select-role", "选择身份", (ack) =>
              socket.emit("select_role", {
                roomCode: gameState.roomId,
                playerId,
                roleId
              }, ack)
            );
          }}
          onTakeGold={() => {
            if (!playerId) {
              return;
            }
            runCommand("take-gold", "获取金币", (ack) =>
              socket.emit("take_gold", {
                roomCode: gameState.roomId,
                playerId
              }, ack)
            );
          }}
          onUseSkill={(payload) => {
            if (!playerId) {
              return;
            }
            runCommand("role-skill", "使用技能", (ack) =>
              socket.emit("use_role_skill", {
                roomCode: gameState.roomId,
                playerId,
                ...payload
              }, ack)
            );
          }}
          onUseDistrictEffect={(payload) => {
            if (!playerId) {
              return;
            }
            runCommand("district-effect", "使用建筑效果", (ack) =>
              socket.emit("use_district_effect", {
                roomCode: gameState.roomId,
                playerId,
                ...payload
              }, ack)
            );
          }}
        />
      ) : roomState ? (
        <ReadyRoom
          roomState={roomState}
          playerId={playerId}
          avatarImage={avatarImage}
          currentPlayer={currentPlayer}
          isHost={isHost}
          canStartGame={canStartGame}
          roomDiscardSummary={roomDiscardSummary}
          onOpenSettings={() => setRoomSettingsOpen(true)}
          onAddRoomSeat={addRoomSeat}
          onRemoveRoomSeat={removeRoomSeat}
          onRemoveBot={removeBot}
          onKickPlayer={kickPlayer}
          onTransferHost={transferHost}
          onStartGame={startGame}
          onAddBot={addBot}
          onToggleReady={toggleReady}
          onLeaveRoom={leaveRoom}
          onSendChatMessage={sendChatMessage}
        />
      ) : (
        <HomeMenu
          isConnected={isConnected}
          playerName={playerName}
          roomCodeInput={roomCodeInput}
          onCreateRoom={() => createRoom()}
          onCreateTutorialRoom={() => {
            setMessage("");
            socket.emit("create_tutorial_room", { playerName });
          }}
          onJoinRoom={joinRoom}
          onRoomCodeChange={(value) => setRoomCodeInput(value.toUpperCase())}
        />
      )}

      {!gameState && (
        <LobbyFooter
          hasRoom={Boolean(roomState)}
          onLeaveRoom={leaveRoom}
          onOpenModal={setModal}
        />
      )}

      {roomState && isRoomSettingsOpen && (
        <RoomSettingsModal
          turnTimeoutInput={turnTimeoutInput}
          endCitySizeInput={endCitySizeInput}
          enabledRoleIdsInput={enabledRoleIdsInput}
          enableFaceUpRoleDiscardInput={enableFaceUpRoleDiscardInput}
          enableFaceDownRoleDiscardInput={enableFaceDownRoleDiscardInput}
          canUseFaceUpRoleDiscard={canUseFaceUpRoleDiscard}
          canUseFaceDownRoleDiscard={canUseFaceDownRoleDiscard}
          canSaveRoomSettings={canSaveRoomSettings}
          requiredRoleCount={requiredRoleCount}
          queenRequired={queenRequired}
          onTurnTimeoutChange={setTurnTimeoutInput}
          onEndCitySizeChange={setEndCitySizeInput}
          onToggleEnabledRole={toggleEnabledRole}
          onFaceUpRoleDiscardChange={setEnableFaceUpRoleDiscardInput}
          onFaceDownRoleDiscardChange={setEnableFaceDownRoleDiscardInput}
          onSubmit={updateRoomSettings}
          onClose={() => setRoomSettingsOpen(false)}
        />
      )}

      {modal && (
        <InfoModal title={getLobbyInfoModalTitle(modal)} onClose={() => setModal(null)}>
          {modal === "settings" && (
            <p>这里后续会填充完整玩法规则、职业说明和基础设置。</p>
          )}
          {modal === "announcements" && <pre>{announcementText}</pre>}
          {modal === "help" && (
            <>
              <button
                className="rulebook-replay-guide"
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(guideCompletionKey);
                  setGuideEnabled(true);
                  setDismissedGuideStepId(null);
                  setModal(null);
                }}
              >
                重新开启新手引导
              </button>
              <RulebookHelp
                activeTab={activeHelpTab}
                documents={helpDocuments}
                onChangeTab={setActiveHelpTab}
              />
            </>
          )}
        </InfoModal>
      )}
      {isGuideVisible && (
        <FirstTimeGuide
          step={guideStep}
          onDismissStep={() => setDismissedGuideStepId(guideStep.id)}
          onFinish={() => {
            window.localStorage.setItem(guideCompletionKey, "1");
            setGuideEnabled(false);
          }}
        />
      )}
    </main>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type {
  ConnectionStatus,
  DistrictCard,
  ErrorPayload,
  RoomCommandResult,
  RoomState,
  ServerStatusPayload,
  VisibleGameState
} from "@zy/shared";
import { GameBadge } from "../components/ui/GameBadge";
import { GameButton } from "../components/ui/GameButton";
import { GameCard } from "../components/ui/GameCard";
import { GameInput } from "../components/ui/GameInput";
import { GamePanel } from "../components/ui/GamePanel";
import { PlayerSeat } from "../components/ui/PlayerSeat";
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
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [avatarLabel, setAvatarLabel] = useState("王冠");
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [modal, setModal] = useState<"settings" | "announcements" | "help" | null>(null);
  const [announcementText, setAnnouncementText] = useState("公告内容加载中。");
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
    }

    function handleGameState(payload: VisibleGameState) {
      setGameState(payload);
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
  const readyCount = roomState?.players.filter((player) => player.isReady).length ?? 0;
  const canStartGame = useMemo(() => {
    if (!roomState || !isHost) {
      return false;
    }

    return (
      roomState.players.length >= 2 &&
      roomState.players.length <= roomState.maxPlayers &&
      roomState.players.every((player) => player.isReady) &&
      roomState.status === "LOBBY"
    );
  }, [isHost, roomState]);

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

          <div className="player-seat-list">
            {roomState.players.map((player, index) => (
              <PlayerSeat
                key={player.id}
                avatar={player.id === playerId ? avatarImage : null}
                avatarLabel={player.isBot ? "机" : presetAvatars[index % presetAvatars.length]}
                connected={player.connected}
                isBot={player.isBot}
                isHost={player.isHost}
                isReady={player.isReady}
                name={player.name}
              />
            ))}
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

          <p className="lobby-tip">测试版支持 2-4 人开局；添加测试人机每次只会加入 1 个。</p>
          {message && <p className="fantasy-toast">{message}</p>}
        </GamePanel>
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

      {modal && (
        <InfoModal title={modalTitle(modal)} onClose={() => setModal(null)}>
          {modal === "settings" && (
            <p>这里后续会填充完整玩法规则、职业说明和基础设置。</p>
          )}
          {modal === "announcements" && <pre>{announcementText}</pre>}
          {modal === "help" && (
            <p>创建房间后可邀请玩家或逐个添加测试人机。2-4 人且全部准备后，房主可以开始游戏。</p>
          )}
        </InfoModal>
      )}
    </main>
  );
}

const roleOptions = [
  { id: "assassin", name: "刺客" },
  { id: "thief", name: "盗贼" },
  { id: "magician", name: "魔术师" },
  { id: "king", name: "国王" },
  { id: "bishop", name: "主教" },
  { id: "merchant", name: "商人" },
  { id: "architect", name: "建筑师" },
  { id: "warlord", name: "军阀" }
];

function TestGameView(props: {
  gameState: VisibleGameState;
  message: string;
  playerId: string | null;
  onBuildDistrict: (districtCardId: string) => void;
  onDrawCards: () => void;
  onEndTurn: () => void;
  onLeaveRoom: () => void;
  onSelectRole: (roleId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onUseSkill: (payload: {
    targetRoleId?: string;
    targetPlayerId?: string;
    targetDistrictCardId?: string;
    discardCardIds?: string[];
  }) => void;
}) {
  const [targetRoleId, setTargetRoleId] = useState(roleOptions[1]?.id ?? "");
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [targetDistrictCardId, setTargetDistrictCardId] = useState("");
  const [discardCardIds, setDiscardCardIds] = useState<string[]>([]);
  const self = props.gameState.players.find((player) => player.id === props.playerId) ?? null;
  const targetPlayer =
    props.gameState.players.find((player) => player.id === targetPlayerId) ??
    props.gameState.players.find((player) => player.id !== props.playerId) ??
    null;
  const targetDistricts = targetPlayer?.city ?? [];
  const isSelectingRole =
    props.gameState.phase === "ROLE_SELECTION" &&
    props.gameState.roleSelectionTurnPlayerId === props.playerId;
  const isMyTurn =
    props.gameState.phase === "ROLE_ACTION" &&
    props.gameState.currentTurnPlayerId === props.playerId;
  const selfRoleId = self?.selectedRoleId ?? null;
  const currentTurnName = playerName(props.gameState, props.gameState.currentTurnPlayerId);
  const roleSelectionTurnName = playerName(
    props.gameState,
    props.gameState.roleSelectionTurnPlayerId
  );
  const turnState = props.gameState.turnState;
  const skillUsed = Boolean(
    props.playerId && props.gameState.roleEffects.usedSkillPlayerIds.includes(props.playerId)
  );
  const needsTargetRole = selfRoleId === "assassin" || selfRoleId === "thief";
  const needsDiscardCards = selfRoleId === "magician";
  const needsTargetDistrict = selfRoleId === "warlord";
  const noTargetSkill =
    selfRoleId === "king" ||
    selfRoleId === "bishop" ||
    selfRoleId === "merchant" ||
    selfRoleId === "architect";
  const hasSkillRequirements =
    noTargetSkill ||
    (needsTargetRole && Boolean(targetRoleId)) ||
    (needsDiscardCards && discardCardIds.length > 0) ||
    (needsTargetDistrict && Boolean(targetPlayer?.id && targetDistrictCardId));
  const canUseSkill =
    isMyTurn &&
    !skillUsed &&
    Boolean(selfRoleId) &&
    props.gameState.phase === "ROLE_ACTION" &&
    hasSkillRequirements;
  const canTakeResource =
    isMyTurn && Boolean(turnState) && !turnState?.resourceActionTaken;
  const canBuild =
    isMyTurn && Boolean(turnState) && (turnState?.buildsUsed ?? 0) < (turnState?.maxBuilds ?? 0);
  const currentTurnPlayer =
    props.gameState.players.find((player) => player.id === props.gameState.currentTurnPlayerId) ??
    null;
  const canSkipCurrentOfflinePlayer =
    props.gameState.phase === "ROLE_ACTION" &&
    Boolean(self?.isHost) &&
    Boolean(currentTurnPlayer && !currentTurnPlayer.connected);
  const buildProgress = turnState
    ? `${turnState.buildsUsed}/${turnState.maxBuilds}`
    : "0/0";
  const scoringResults = [...props.gameState.scoringResults].sort(
    (first, second) => second.totalScore - first.totalScore
  );

  useEffect(() => {
    const firstOpponent = props.gameState.players.find((player) => player.id !== props.playerId);
    if (!targetPlayerId && firstOpponent) {
      setTargetPlayerId(firstOpponent.id);
    }
  }, [props.gameState.players, props.playerId, targetPlayerId]);

  useEffect(() => {
    const hasSelectedDistrict = targetDistricts.some(
      (district) => district.id === targetDistrictCardId
    );
    if (targetDistricts[0] && !hasSelectedDistrict) {
      setTargetDistrictCardId(targetDistricts[0].id);
    }
  }, [targetDistrictCardId, targetDistricts]);

  useEffect(() => {
    const handIds = new Set((self?.hand ?? []).map((card) => card.id));
    setDiscardCardIds((current) => current.filter((cardId) => handIds.has(cardId)));
  }, [self?.hand]);

  function toggleDiscardCard(cardId: string) {
    setDiscardCardIds((current) =>
      current.includes(cardId)
        ? current.filter((selectedCardId) => selectedCardId !== cardId)
        : [...current, cardId]
    );
  }

  function renderCitySummary(player: (typeof props.gameState.players)[number]) {
    if (player.city.length === 0) {
      return <span className="test-city-empty">城市：无</span>;
    }

    return (
      <div className="test-city-list" aria-label={`${player.name} 的城市`}>
        {player.city.map((district) => (
          <span className="test-city-chip" key={district.id}>
            {district.name} · {district.cost}
          </span>
        ))}
      </div>
    );
  }

  function skillHint() {
    if (!selfRoleId) {
      return "先完成秘密角色选择，进入你的角色行动后才能使用技能。";
    }

    const hints: Record<string, string> = {
      assassin: "刺客：选择一个还未行动的目标角色，本轮该角色跳过行动。",
      thief: "盗贼：选择一个还未行动的目标角色，目标行动前会被偷走金币；不能偷刺客或被刺客跳过的角色。",
      magician: "魔术师：勾选任意手牌，弃掉后抽等量新牌。",
      king: "国王：使用后获得下一轮先手权。",
      bishop: "主教：使用后本轮你的建筑受到保护。",
      merchant: "商人：按你城市里的绿色建筑数量获得额外金币。",
      architect: "建筑师：使用后抽额外建筑牌，并且本轮可额外建造。",
      warlord: "军阀：选择其他玩家的一座建筑，支付建筑费用 -1 的金币后破坏。"
    };

    return hints[selfRoleId] ?? "当前角色暂无技能说明。";
  }

  function skillBlockedReason() {
    if (!isMyTurn) {
      return "还没有轮到你。";
    }

    if (skillUsed) {
      return "本轮你已经使用过技能。";
    }

    if (needsDiscardCards && discardCardIds.length === 0) {
      return "请选择要弃置的手牌。";
    }

    if (needsTargetDistrict && !targetDistrictCardId) {
      return "请选择要破坏的建筑。";
    }

    if (!selfRoleId) {
      return "你还没有可公开使用的角色。";
    }

    return "";
  }

  return (
    <section className="test-game-layout">
      <GamePanel className="test-game-panel" title="对战测试界面">
        <header className="test-game-header">
          <div>
            <span>房间：{props.gameState.roomId}</span>
            <strong>
              第 {props.gameState.currentRound} 轮 · {phaseText(props.gameState.phase)}
            </strong>
          </div>
          <GameButton variant="neutral" size="sm" onClick={props.onLeaveRoom}>
            返回大厅
          </GameButton>
        </header>

        <div className="test-status-strip">
          <span className="test-status-pill">当前行动：{currentTurnName}</span>
          <span className="test-status-pill">角色选择：{roleSelectionTurnName}</span>
          <span className="test-status-pill">你的角色：{roleName(selfRoleId)}</span>
          <span className="test-status-pill">
            资源行动：{turnState?.resourceActionTaken ? "已选择" : "未选择"}
          </span>
          <span className="test-status-pill">建造次数：{buildProgress}</span>
          <span className="test-status-pill">
            技能：{skillUsed ? "已使用" : "未使用"}
          </span>
        </div>

        {props.gameState.phase === "ENDED" && scoringResults.length > 0 && (
          <section className="test-game-section test-game-section--wide">
            <h3>结算排名</h3>
            <div className="test-score-table">
              {scoringResults.map((result, index) => (
                <div className="test-score-row" key={result.playerId}>
                  <strong>#{index + 1} {result.playerName}</strong>
                  <span>建筑分 {result.districtScore}</span>
                  <span>奖励分 {result.bonusScore}</span>
                  <span>总分 {result.totalScore}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="test-game-grid">
          <section className="test-game-section">
            <h3>玩家状态</h3>
            <div className="test-player-list">
              {props.gameState.players.map((player) => (
                <article
                  className={`test-player-row ${
                    props.gameState.currentTurnPlayerId === player.id ? "is-current" : ""
                  }`}
                  key={player.id}
                >
                  <strong>
                    {player.name}
                    {player.id === props.playerId ? "（你）" : ""}
                  </strong>
                  <span>
                    金币 {player.gold} · 手牌 {player.handCount} · 建筑 {player.city.length}
                  </span>
                  <span>角色：{roleName(player.selectedRoleId)}</span>
                  {renderCitySummary(player)}
                </article>
              ))}
            </div>
          </section>

          <section className="test-game-section">
            <h3>角色选择</h3>
            {isSelectingRole ? (
              <div className="test-action-grid">
                {props.gameState.availableRoles.map((role) => (
                  <GameButton
                    key={role.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => props.onSelectRole(role.id)}
                  >
                    {role.name}
                  </GameButton>
                ))}
              </div>
            ) : (
              <p>当前选择玩家：{playerName(props.gameState, props.gameState.roleSelectionTurnPlayerId)}</p>
            )}
          </section>

          <section className="test-game-section">
            <h3>行动与技能</h3>
            <div className="test-action-grid">
              <GameButton variant="secondary" size="sm" disabled={!canTakeResource} onClick={props.onTakeGold}>
                拿金币
              </GameButton>
              <GameButton variant="secondary" size="sm" disabled={!canTakeResource} onClick={props.onDrawCards}>
                抽牌
              </GameButton>
              <GameButton variant="neutral" size="sm" disabled={!isMyTurn} onClick={props.onEndTurn}>
                结束回合
              </GameButton>
              <GameButton
                variant="neutral"
                size="sm"
                disabled={!canSkipCurrentOfflinePlayer}
                onClick={props.onSkipCurrentOfflinePlayer}
              >
                跳过离线玩家
              </GameButton>
            </div>

            <div className="test-skill-box">
              <p className="test-skill-hint">{skillHint()}</p>
              {needsTargetRole && (
                <label>
                  目标角色
                  <select value={targetRoleId} onChange={(event) => setTargetRoleId(event.target.value)}>
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsTargetDistrict && (
                <>
                  <label>
                    目标玩家
                    <select
                      value={targetPlayer?.id ?? ""}
                      onChange={(event) => setTargetPlayerId(event.target.value)}
                    >
                      {props.gameState.players
                        .filter((player) => player.id !== props.playerId)
                        .map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    目标建筑
                    <select
                      value={targetDistrictCardId}
                      onChange={(event) => setTargetDistrictCardId(event.target.value)}
                    >
                      {targetDistricts.length === 0 ? (
                        <option value="">无建筑</option>
                      ) : (
                        targetDistricts.map((district) => (
                          <option key={district.id} value={district.id}>
                            {district.name} · 费用 {district.cost}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </>
              )}
              {needsDiscardCards && (
                <div className="test-discard-options">
                  <span>魔术师弃牌</span>
                  <div>
                    {(self?.hand ?? []).map((card) => (
                      <label key={card.id}>
                        <input
                          type="checkbox"
                          checked={discardCardIds.includes(card.id)}
                          onChange={() => toggleDiscardCard(card.id)}
                        />
                        {card.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <GameButton
                variant="primary"
                size="sm"
                disabled={!canUseSkill}
                onClick={() =>
                  props.onUseSkill({
                    targetRoleId,
                    targetPlayerId: targetPlayer?.id,
                    targetDistrictCardId: targetDistrictCardId || undefined,
                    discardCardIds: discardCardIds.length > 0 ? discardCardIds : undefined
                  })
                }
              >
                使用技能
              </GameButton>
              {skillBlockedReason() && (
                <span className="test-skill-blocked">{skillBlockedReason()}</span>
              )}
            </div>
          </section>

          <section className="test-game-section test-game-section--wide">
            <h3>你的手牌</h3>
            <div className="test-card-row">
              {(self?.hand ?? []).map((card) => (
                <TestDistrictCard
                  key={card.id}
                  card={card}
                  disabled={!canBuild}
                  onBuild={() => props.onBuildDistrict(card.id)}
                />
              ))}
              {(self?.hand ?? []).length === 0 && <p>暂无手牌。</p>}
            </div>
          </section>

          <section className="test-game-section test-game-section--wide">
            <h3>你的城市</h3>
            <div className="test-card-row">
              {(self?.city ?? []).map((card) => (
                <GameCard
                  key={card.id}
                  cost={card.cost}
                  description={card.description}
                  name={card.name}
                />
              ))}
              {(self?.city ?? []).length === 0 && <p>你还没有建造建筑。</p>}
            </div>
          </section>

          <section className="test-game-section test-game-section--wide">
            <h3>游戏日志</h3>
            <div className="test-log-list">
              {props.gameState.gameLog.slice(0, 10).map((log) => (
                <p key={log.id}>{log.message}</p>
              ))}
              {props.gameState.gameLog.length === 0 && <p>暂无日志。</p>}
            </div>
          </section>
        </div>

        {props.message && <p className="fantasy-toast">{props.message}</p>}
      </GamePanel>
    </section>
  );
}

function TestDistrictCard(props: {
  card: DistrictCard;
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

function phaseText(phase: VisibleGameState["phase"]) {
  const text: Record<VisibleGameState["phase"], string> = {
    LOBBY: "大厅",
    GAME_START: "游戏开始",
    ROLE_SELECTION: "角色选择",
    ROLE_ACTION: "角色行动",
    ROUND_END: "回合结束",
    SCORING: "结算",
    ENDED: "已结束"
  };
  return text[phase];
}

function playerName(gameState: VisibleGameState, playerId: string | null) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? "无";
}

function roleName(roleId: string | null) {
  if (!roleId) {
    return "未公开";
  }
  return roleOptions.find((role) => role.id === roleId)?.name ?? roleId;
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

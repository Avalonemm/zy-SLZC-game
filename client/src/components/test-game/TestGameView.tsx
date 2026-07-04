import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActionEventPayload, ChatMessage, RoleCard, VisibleGameState } from "@zy/shared";
import { GameButton } from "../ui/GameButton";
import { ChatPanel } from "../ui/ChatPanel";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ActionPanel } from "./ActionPanel";
import { GameLogPanel } from "./GameLogPanel";
import { ScoringPanel } from "./ScoringPanel";
import type { SkillTargetSpec } from "./skillTargeting";
import type { BuildableDistrictCard, TestGamePlayer, UseRoleSkillPayload } from "./testGameTypes";
import { phaseText, roleName, roleOptions, skillHint } from "./testGameUtils";
import { useTestGameViewModel } from "./useTestGameViewModel";

export type TestGameViewProps = {
  actionEvents: ActionEventPayload[];
  chatMessages: ChatMessage[];
  gameState: VisibleGameState;
  message: string;
  playerId: string | null;
  onBuildDistrict: (districtCardId: string) => void;
  onChooseDrawnCard: (districtCardId: string) => void;
  onDrawCards: () => void;
  onEndTurn: () => void;
  onLeaveRoom: () => void;
  onResolveTurnTimeout: () => void;
  onSendChatMessage: (message: string) => void;
  onSelectRole: (roleId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
};

type PendingConfirm =
  | {
      type: "build";
      district: BuildableDistrictCard;
    }
  | {
      type: "skill";
      payload: UseRoleSkillPayload;
      targetPlayerName: string;
      targetDistrictName: string;
    };

export function TestGameView(props: TestGameViewProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const viewModel = useTestGameViewModel({
    gameState: props.gameState,
    playerId: props.playerId
  });
  const [now, setNow] = useState(() => Date.now());
  const lastResolvedDeadlineRef = useRef<string | null>(null);
  const timerDeadlineAt = props.gameState.turnTimer?.deadlineAt ?? null;
  const remainingSeconds = useMemo(() => {
    if (!timerDeadlineAt) {
      return null;
    }

    return Math.ceil((new Date(timerDeadlineAt).getTime() - now) / 1000);
  }, [now, timerDeadlineAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    lastResolvedDeadlineRef.current = null;
  }, [timerDeadlineAt]);

  useEffect(() => {
    if (!timerDeadlineAt || remainingSeconds === null || remainingSeconds > 0) {
      return;
    }

    if (lastResolvedDeadlineRef.current === timerDeadlineAt) {
      return;
    }

    const timerPlayer = props.gameState.players.find(
      (player) => player.id === props.gameState.turnTimer?.playerId
    );
    if (timerPlayer?.isBot) {
      return;
    }

    lastResolvedDeadlineRef.current = timerDeadlineAt;
    props.onResolveTurnTimeout();
  }, [props, remainingSeconds, timerDeadlineAt]);

  function requestBuildDistrict(district: BuildableDistrictCard) {
    setPendingConfirm({
      type: "build",
      district
    });
  }

  function requestUseSkill(payload: UseRoleSkillPayload) {
    if (viewModel.selfRoleId !== "warlord") {
      props.onUseSkill(payload);
      return;
    }

    const targetPlayer = props.gameState.players.find(
      (player) => player.id === payload.targetPlayerId
    );
    const targetDistrict = targetPlayer?.city.find(
      (district) => district.id === payload.targetDistrictCardId
    );
    setPendingConfirm({
      type: "skill",
      payload,
      targetPlayerName: targetPlayer?.name ?? "目标玩家",
      targetDistrictName: targetDistrict?.name ?? "目标建筑"
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm) {
      return;
    }

    if (pendingConfirm.type === "build") {
      props.onBuildDistrict(pendingConfirm.district.id);
    } else {
      props.onUseSkill(pendingConfirm.payload);
    }
    setPendingConfirm(null);
  }

  const tableSeats = arrangeTableSeats(props.gameState.players, props.playerId);
  const selfCity = viewModel.self?.city ?? [];
  const selfHand = viewModel.self?.hand ?? [];

  return (
    <section className="test-game-layout test-game-layout--tabletop">
      <div className="tabletop-game-panel">
        <header className="tabletop-header">
          <div>
            <span>房间：{props.gameState.roomId}</span>
            <strong>对战测试界面</strong>
          </div>
          <div className="tabletop-round"><span>第 {props.gameState.currentRound} 轮 · {phaseText(props.gameState.phase)}</span></div>
          <GameButton variant="neutral" size="sm" onClick={props.onLeaveRoom}>
            返回大厅
          </GameButton>
        </header>
<div className="tabletop-content">
          <section className="tabletop-board" aria-label="桌游桌面预览">
            <div className="tabletop-felt">
              {tableSeats.others.map((seat) => (
                <TableOpponentArea
                  key={seat.player.id}
                  currentTurnPlayerId={props.gameState.currentTurnPlayerId}
                  player={seat.player}
                  position={seat.position}
                />
              ))}

              <div
                className="tabletop-center-stack"
                key={`${props.gameState.phase}-${props.gameState.currentTurnPlayerId ?? "none"}-${props.gameState.roleSelectionTurnPlayerId ?? "none"}`}
              >
                <div className="tabletop-public-title">
                  <span>公共区</span>
                  <strong>{phaseText(props.gameState.phase)}</strong>
                </div>
                <TabletopCountdownBar
                  gameState={props.gameState}
                  remainingSeconds={remainingSeconds}
                />
                <PublicFlowPanel
                  canSkipCurrentOfflinePlayer={viewModel.canSkipCurrentOfflinePlayer}
                  canTakeResource={viewModel.canTakeResource}
                  canUseSkill={viewModel.canUseSkill}
                  currentTurnName={viewModel.currentTurnName}
                  discardCardIds={viewModel.discardCardIds}
                  gameState={props.gameState}
                  hand={viewModel.self?.hand ?? []}
                  isMyTurn={viewModel.isMyTurn}
                  isSelectingRole={viewModel.isSelectingRole}
                  playerId={props.playerId}
                  roleSelectionTurnName={viewModel.roleSelectionTurnName}
                  skillBlockedReason={viewModel.skillBlockedReason}
                  skillHint={skillHint(viewModel.selfRoleId)}
                  skillTargetSpec={viewModel.skillTargetSpec}
                  targetDistrictCardId={viewModel.targetDistrictCardId}
                  targetDistricts={viewModel.targetDistricts}
                  targetPlayerId={viewModel.resolvedTargetPlayerId}
                  targetRoleId={viewModel.targetRoleId}
                  turnState={viewModel.turnState}
                  onDrawCards={props.onDrawCards}
                  onEndTurn={props.onEndTurn}
                  onChooseDrawnCard={props.onChooseDrawnCard}
                  onSelectRole={props.onSelectRole}
                  onSkipCurrentOfflinePlayer={props.onSkipCurrentOfflinePlayer}
                  onTakeGold={props.onTakeGold}
                  onTargetDistrictChange={viewModel.setTargetDistrictCardId}
                  onTargetPlayerChange={viewModel.setTargetPlayerId}
                  onTargetRoleChange={viewModel.setTargetRoleId}
                  onToggleDiscardCard={viewModel.toggleDiscardCard}
                  onUseSkill={requestUseSkill}
                />
              </div>

              {tableSeats.self && (
                <TablePlayerSeat
                  currentTurnPlayerId={props.gameState.currentTurnPlayerId}
                  player={tableSeats.self}
                  position="self"
                  selfPlayerId={props.playerId}
                />
              )}
            </div>


            <section className="tabletop-self-zone" aria-label="你的卡牌区">
              <CardLane title="你的手牌" count={selfHand.length}>
                {selfHand.map((card) => (
                  <TableDistrictCard
                    key={card.id}
                    card={card}
                    cta="建造"
                    disabled={!viewModel.canBuild}
                    size="hand"
                    onClick={() => requestBuildDistrict(card)}
                  />
                ))}
                {selfHand.length === 0 && <p className="tabletop-empty">暂无手牌。</p>}
              </CardLane>
              <CardLane title="你的城市" count={selfCity.length}>
                {selfCity.map((card) => (
                  <TableDistrictCard key={card.id} card={card} size="city" />
                ))}
                {selfCity.length === 0 && <p className="tabletop-empty">你还没有建造建筑。</p>}
              </CardLane>
            </section>
          </section>

          <aside className="tabletop-drawer" aria-label="收缩信息面板">
            <div className="tabletop-drawer-stack">
              {props.gameState.phase === "ENDED" && viewModel.scoringResults.length > 0 && (
                <details open>
                  <summary>结算</summary>
                  <ScoringPanel results={viewModel.scoringResults} />
                </details>
              )}
              <details>
                <summary>游戏日志</summary>
                <GameLogPanel actionEvents={props.actionEvents} gameLog={props.gameState.gameLog} />
              </details>
              <SideInfoPanel gameState={props.gameState} />
            </div>
            <section className="tabletop-chat-mini" aria-label="聊天">
              <ChatPanel messages={props.chatMessages} onSendMessage={props.onSendChatMessage} />
            </section>
          </aside>
        </div>

        {props.message && <p className="fantasy-toast">{props.message}</p>}
      </div>
      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.type === "build" ? "确认建造" : "确认使用技能"}
          confirmLabel="确定"
          body={
            pendingConfirm.type === "build" ? (
              <p>
                是否建造 {pendingConfirm.district.name}？需要支付{" "}
                {pendingConfirm.district.cost} 枚金币。
              </p>
            ) : (
              <p>
                是否使用军阀技能，破坏 {pendingConfirm.targetPlayerName} 的{" "}
                {pendingConfirm.targetDistrictName}？
              </p>
            )
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
        />
      )}
    </section>
  );
}

function arrangeTableSeats(players: TestGamePlayer[], selfPlayerId: string | null) {
  const self = players.find((player) => player.id === selfPlayerId) ?? players[0] ?? null;
  const others = players.filter((player) => player.id !== self?.id);
  const positions = seatPositionsForCount(others.length);

  return {
    self,
    others: others.map((player, index) => ({
      player,
      position: positions[index] ?? "left-bottom"
    }))
  };
}

type TableOpponentPosition = "left-top" | "right-top" | "left-bottom" | "right-bottom";

function seatPositionsForCount(count: number): TableOpponentPosition[] {
  const fixedSlots: TableOpponentPosition[] = [
    "left-top",
    "right-top",
    "left-bottom",
    "right-bottom"
  ];

  return fixedSlots.slice(0, count);
}

function PublicFlowPanel(props: {
  canSkipCurrentOfflinePlayer: boolean;
  canTakeResource: boolean;
  canUseSkill: boolean;
  currentTurnName: string;
  discardCardIds: string[];
  gameState: VisibleGameState;
  hand: BuildableDistrictCard[];
  isMyTurn: boolean;
  isSelectingRole: boolean;
  playerId: string | null;
  roleSelectionTurnName: string;
  skillBlockedReason: string;
  skillHint: string;
  skillTargetSpec: SkillTargetSpec;
  targetDistrictCardId: string;
  targetDistricts: BuildableDistrictCard[];
  targetPlayerId: string;
  targetRoleId: string;
  turnState: VisibleGameState["turnState"];
  onDrawCards: () => void;
  onEndTurn: () => void;
  onChooseDrawnCard: (districtCardId: string) => void;
  onSelectRole: (roleId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onTargetDistrictChange: (districtCardId: string) => void;
  onTargetPlayerChange: (playerId: string) => void;
  onTargetRoleChange: (roleId: string) => void;
  onToggleDiscardCard: (cardId: string) => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
}) {
  if (props.gameState.phase === "CROWN_REVEAL") {
    return <CrownRevealFlowPanel gameState={props.gameState} />;
  }

  if (props.gameState.phase === "ROLE_SELECTION") {
    return <RoleSelectionFlowPanel {...props} />;
  }

  return <RoleActionFlowPanel {...props} />;
}

function TabletopCountdownBar(props: {
  gameState: VisibleGameState;
  remainingSeconds: number | null;
}) {
  const timer = props.gameState.turnTimer;
  if (!timer) {
    return null;
  }

  const player =
    props.gameState.players.find((candidate) => candidate.id === timer.playerId) ?? null;
  const totalSeconds = Math.max(1, Math.ceil(timer.timeoutMs / 1000));
  const remaining = Math.max(
    0,
    Math.min(totalSeconds, props.remainingSeconds ?? totalSeconds)
  );
  const progress = Math.max(0, Math.min(100, (remaining / totalSeconds) * 100));
  const phaseLabel =
    timer.phase === "CROWN_REVEAL"
      ? "皇冠倒计时"
      : timer.phase === "ROLE_SELECTION"
        ? "选角倒计时"
        : "行动倒计时";
  const playerLabel = player
    ? timer.phase === "CROWN_REVEAL"
      ? `${player.name} 获得皇冠`
      : player.isBot
        ? `${player.name} 思考中`
        : player.name
    : "当前玩家";

  return (
    <section className="tabletop-countdown" aria-label="阶段倒计时">
      <div className="tabletop-countdown__meta">
        <span>{phaseLabel}</span>
        <strong>{playerLabel}</strong>
        <b>{remaining} 秒</b>
      </div>
      <div className="tabletop-countdown__track">
        <span style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}

function SideInfoPanel(props: { gameState: VisibleGameState }) {
  const faceDownCount = props.gameState.settings.enableFaceDownRoleDiscard ? 1 : 0;
  const faceUpRoles = props.gameState.discardedRoles.map((role) => role.name);
  const selectedCount = props.gameState.players.filter((player) => player.selectedRoleId).length;
  const rolePoolCount =
    props.gameState.phase !== "ROLE_ACTION"
      ? Math.max(
          0,
          props.gameState.settings.enabledRoleIds.length -
            faceDownCount -
            faceUpRoles.length -
            selectedCount
        )
      : props.gameState.availableRoles.length;

  return (
    <section className="tabletop-side-info" aria-label="局面信息">
      <strong>局面信息</strong>
      <div className="tabletop-side-info__grid">
        <span>阶段</span>
        <b>{phaseText(props.gameState.phase)}</b>
        <span>轮次</span>
        <b>{props.gameState.currentRound}</b>
        <span>角色池</span>
        <b>{rolePoolCount}</b>
        <span>建筑牌堆</span>
        <b>{props.gameState.districtDeckCount}</b>
        <span>明弃</span>
        <b>{faceUpRoles.length}</b>
        <span>暗弃</span>
        <b>{faceDownCount}</b>
        <span>弃牌</span>
        <b>{props.gameState.districtDiscardPile.length}</b>
      </div>
      {faceUpRoles.length > 0 && <p>明弃：{faceUpRoles.join("、")}</p>}
    </section>
  );
}

function CrownRevealFlowPanel(props: { gameState: VisibleGameState }) {
  const crownPlayer =
    props.gameState.players.find((player) => player.id === props.gameState.crownPlayerId) ?? null;

  return (
    <section className="tabletop-public-flow tabletop-public-flow--crown">
      <div className="tabletop-crown-reveal">
        <span>皇冠归属</span>
        <strong>{crownPlayer?.name ?? "随机玩家"}</strong>
        <p>倒计时结束后，由皇冠玩家开始选择身份牌。</p>
      </div>
    </section>
  );
}
function RoleSelectionFlowPanel(props: {
  gameState: VisibleGameState;
  isSelectingRole: boolean;
  playerId: string | null;
  roleSelectionTurnName: string;
  onSelectRole: (roleId: string) => void;
}) {
  const currentIndex = props.gameState.roleSelectionOrder.findIndex(
    (playerId) => playerId === props.gameState.roleSelectionTurnPlayerId
  );
  const allSelected = props.gameState.roleSelectionTurnPlayerId === null;
  const orderPlayers = props.gameState.roleSelectionOrder
    .map((playerId) => props.gameState.players.find((player) => player.id === playerId) ?? null)
    .filter((player): player is TestGamePlayer => Boolean(player));

  return (
    <section className="tabletop-public-flow tabletop-public-flow--selection">
      <header className="tabletop-flow-heading">
        <strong>角色选择</strong>
      </header>
      <div className="tabletop-selection-track" aria-label="角色选择顺序">
        {orderPlayers.map((player, index) => {
          const status = allSelected
            ? "done"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "active"
                : "waiting";
          return (
            <span
              className={`tabletop-selection-step tabletop-selection-step--${status}`}
              key={player.id}
            >
              <strong>{index + 1}</strong>
              {player.name}
              {player.id === props.gameState.crownPlayerId ? " · 皇冠" : ""}
              {player.id === props.playerId ? " · 你" : ""}
            </span>
          );
        })}
      </div>
      {props.isSelectingRole ? (
        <div className="tabletop-role-card-rail" aria-label="可选择身份牌">
          {props.gameState.availableRoles.map((role) => (
            <RoleIdentityCard key={role.id} role={role} onSelect={props.onSelectRole} />
          ))}
        </div>
      ) : (
        <p className="tabletop-waiting-copy">
          等待 {props.roleSelectionTurnName} 选择角色。
        </p>
      )}
    </section>
  );
}

function RoleIdentityCard(props: { role: RoleCard; onSelect?: (roleId: string) => void }) {
  const content = (
    <>
      <span className="tabletop-role-card__order">{props.role.order}</span>
      <strong>{props.role.name}</strong>
      <p>{props.role.description}</p>
      <small>身份牌</small>
    </>
  );

  if (props.onSelect) {
    return (
      <button
        className="tabletop-role-card"
        type="button"
        onClick={() => props.onSelect?.(props.role.id)}
      >
        {content}
      </button>
    );
  }

  return <article className="tabletop-role-card">{content}</article>;
}

function RoleActionFlowPanel(props: {
  canSkipCurrentOfflinePlayer: boolean;
  canTakeResource: boolean;
  canUseSkill: boolean;
  currentTurnName: string;
  discardCardIds: string[];
  gameState: VisibleGameState;
  hand: BuildableDistrictCard[];
  isMyTurn: boolean;
  playerId: string | null;
  skillBlockedReason: string;
  skillHint: string;
  skillTargetSpec: SkillTargetSpec;
  targetDistrictCardId: string;
  targetDistricts: BuildableDistrictCard[];
  targetPlayerId: string;
  targetRoleId: string;
  turnState: VisibleGameState["turnState"];
  onDrawCards: () => void;
  onEndTurn: () => void;
  onChooseDrawnCard: (districtCardId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onTargetDistrictChange: (districtCardId: string) => void;
  onTargetPlayerChange: (playerId: string) => void;
  onTargetRoleChange: (roleId: string) => void;
  onToggleDiscardCard: (cardId: string) => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
}) {
  const currentTurnPlayer =
    props.gameState.players.find((player) => player.id === props.gameState.currentTurnPlayerId) ??
    null;
  const selectedRoleOrders = new Set(props.gameState.currentRoleOrder);

  return (
    <section className="tabletop-public-flow tabletop-public-flow--action">
      <header className="tabletop-flow-heading">
        <strong>角色叫号行动阶段</strong>
      </header>
      <div className="tabletop-role-call-track" aria-label="角色叫号顺序">
        {roleOptions.map((role, index) => {
          const order = index + 1;
          const isSelected = selectedRoleOrders.has(order);
          const isCurrent = currentTurnPlayer?.selectedRoleId === role.id;
          const isDone = props.gameState.completedRoleIds.includes(role.id);
          return (
            <span
              className={`tabletop-role-call-step ${
                isCurrent
                  ? "is-current"
                  : isDone
                    ? "is-done"
                    : isSelected
                      ? "is-pending"
                      : "is-muted"
              }`}
              key={role.id}
            >
              {order}. {role.name}
            </span>
          );
        })}
      </div>
      {props.gameState.pendingDrawChoice ? (
        <DrawChoicePanel
          pendingDrawChoice={props.gameState.pendingDrawChoice}
          onChooseDrawnCard={props.onChooseDrawnCard}
        />
      ) : !props.isMyTurn ? (
        <CurrentActorTableau player={currentTurnPlayer} turnState={props.turnState} />
      ) : (
        <ActionPanel
          canSkipCurrentOfflinePlayer={props.canSkipCurrentOfflinePlayer}
          canTakeResource={props.canTakeResource}
          canUseSkill={props.canUseSkill}
          discardCardIds={props.discardCardIds}
          hand={props.hand}
          isMyTurn={props.isMyTurn}
          players={props.gameState.players}
          selfPlayerId={props.playerId}
          skillBlockedReason={props.skillBlockedReason}
          skillHint={props.skillHint}
          skillTargetSpec={props.skillTargetSpec}
          targetDistrictCardId={props.targetDistrictCardId}
          targetDistricts={props.targetDistricts}
          targetPlayerId={props.targetPlayerId}
          targetRoleId={props.targetRoleId}
          onDrawCards={props.onDrawCards}
          onEndTurn={props.onEndTurn}
          onSkipCurrentOfflinePlayer={props.onSkipCurrentOfflinePlayer}
          onTakeGold={props.onTakeGold}
          onTargetDistrictChange={props.onTargetDistrictChange}
          onTargetPlayerChange={props.onTargetPlayerChange}
          onTargetRoleChange={props.onTargetRoleChange}
          onToggleDiscardCard={props.onToggleDiscardCard}
          onUseSkill={props.onUseSkill}
        />
      )}
    </section>
  );
}

function DrawChoicePanel(props: {
  pendingDrawChoice: NonNullable<VisibleGameState["pendingDrawChoice"]>;
  onChooseDrawnCard: (districtCardId: string) => void;
}) {
  return (
    <section className="tabletop-draw-choice">
      <div className="tabletop-flow-heading">
        <strong>抽牌选择</strong>
        <span>选择 1 张加入手牌，另一张放回建筑牌堆底部。</span>
      </div>
      <div className="tabletop-card-row tabletop-card-row--choice">
        {props.pendingDrawChoice.drawnCards.map((card) => (
          <TableDistrictCard
            key={card.id}
            card={card}
            cta="选择"
            size="hand"
            onClick={() => props.onChooseDrawnCard(card.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CurrentActorTableau(props: {
  player: TestGamePlayer | null;
  turnState: VisibleGameState["turnState"];
}) {
  if (!props.player) {
    return <p className="tabletop-waiting-copy">等待下一位玩家行动。</p>;
  }

  return (
    <div className="tabletop-actor-tableau">
      <header>
        <div className="tabletop-seat__avatar">{props.player.name.slice(0, 1)}</div>
        <div>
          <strong>{props.player.name}</strong>
          <span>角色：{roleName(props.player.selectedRoleId)}</span>
        </div>
      </header>
      <div className="tabletop-actor-stats">
        <span>金币 {props.player.gold}</span>
        <span>手牌 {props.player.handCount}</span>
        <span>
          建造 {props.turnState ? `${props.turnState.buildsUsed}/${props.turnState.maxBuilds}` : "0/0"}
        </span>
        <span>{props.turnState?.resourceActionTaken ? "资源已选" : "资源未选"}</span>
      </div>
      <div className="tabletop-actor-city">
        <div>
          <strong>{props.player.name} 的城市</strong>
          <span>{props.player.city.length} 张</span>
        </div>
        <div className="tabletop-actor-city__cards">
          {props.player.city.slice(0, 8).map((card) => (
            <TableDistrictCard key={card.id} card={card} size="opponent" />
          ))}
          {props.player.city.length === 0 && <span className="tabletop-city-empty">未建造</span>}
        </div>
      </div>
    </div>
  );
}

function TablePlayerSeat(props: {
  currentTurnPlayerId: string | null;
  player: TestGamePlayer;
  position: "top" | "left" | "right" | "self";
  selfPlayerId?: string | null;
}) {
  const isSelf = props.player.id === props.selfPlayerId || props.position === "self";
  const isCurrent = props.player.id === props.currentTurnPlayerId;

  return (
    <article
      className={`tabletop-seat tabletop-seat--${props.position} ${
        isCurrent ? "is-current" : ""
      } ${isSelf ? "is-self" : ""}`}
    >
      <div className="tabletop-seat__avatar">{isSelf ? "你" : props.player.name.slice(0, 1)}</div>
      <div className="tabletop-seat__body">
        <strong>
          {props.player.name}
          {isSelf ? "（你）" : ""}
        </strong>
        <span>
          金币 {props.player.gold} · 手牌 {props.player.handCount} · 建筑{" "}
          {props.player.city.length}
        </span>
        <span>角色：{roleName(props.player.selectedRoleId)}</span>
      </div>
    </article>
  );
}

function TableOpponentArea(props: {
  currentTurnPlayerId: string | null;
  player: TestGamePlayer;
  position: TableOpponentPosition;
}) {
  const isCurrent = props.player.id === props.currentTurnPlayerId;

  return (
    <article
      className={`tabletop-opponent-area tabletop-opponent-area--${props.position} ${
        isCurrent ? "is-current" : ""
      }`}
      aria-label={`${props.player.name} 的城市`}
    >
      <header className="tabletop-opponent-area__status">
        <div className="tabletop-seat__avatar">{props.player.name.slice(0, 1)}</div>
        <div>
          <strong>{props.player.name}</strong>
          <span>
            金币 {props.player.gold} · 手牌 {props.player.handCount} · 建筑{" "}
            {props.player.city.length}
          </span>
          <span>角色：{roleName(props.player.selectedRoleId)}</span>
        </div>
      </header>
      <div className="tabletop-opponent-area__city-title">
        <strong>{props.player.name} 的城市</strong>
        <span>{props.player.city.length} 张</span>
      </div>
      <div className="tabletop-opponent-area__cards">
        {props.player.city.slice(0, 8).map((card) => (
          <TableDistrictCard key={card.id} card={card} size="opponent" />
        ))}
        {props.player.city.length === 0 && <span className="tabletop-city-empty">未建造</span>}
      </div>
    </article>
  );
}

function CardLane(props: { children: ReactNode; count: number; title: string }) {
  return (
    <div className="tabletop-card-lane">
      <header>
        <strong>{props.title}</strong>
        <span>{props.count} 张</span>
      </header>
      <div className="tabletop-card-row">{props.children}</div>
    </div>
  );
}

function TableDistrictCard(props: {
  card: BuildableDistrictCard;
  cta?: string;
  disabled?: boolean;
  onClick?: () => void;
  size: "hand" | "city" | "opponent";
}) {
  const cardContent = (
    <>
      <span className="tabletop-district-card__cost">{props.card.cost}</span>
      <strong>{props.card.name}</strong>
      {props.size !== "opponent" && <p>{props.card.description}</p>}
      {props.cta && <small>{props.cta}</small>}
    </>
  );
  const className = `tabletop-district-card tabletop-district-card--${props.size} tabletop-district-card--${props.card.color}`;

  if (props.onClick) {
    return (
      <button
        className={className}
        disabled={props.disabled}
        type="button"
        onClick={props.onClick}
      >
        {cardContent}
      </button>
    );
  }

  return <article className={className}>{cardContent}</article>;
}



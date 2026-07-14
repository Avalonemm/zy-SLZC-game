import { useEffect, useMemo, useRef, useState } from "react";
import { calculateCityScore, type ActionEventPayload, type ChatMessage, type VisibleGameState } from "@zy/shared";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useGameViewModel } from "./useGameViewModel";
import { skillHint } from "./gameText";
import type { BuildableDistrictCard, UseDistrictEffectPayload, UseRoleSkillPayload } from "./gameTypes";
import type { InfoModalId } from "../../components/ui/infoModalTypes";
import { arrangeGameTableSeats } from "./gameTableLayout";
import { GameActionDock } from "./GameActionDock";
import { GameCenterStatus } from "./GameCenterStatus";
import { GameCornerDocks } from "./GameCornerDocks";
import { GameOpponentSeat } from "./GameOpponentSeat";
import { GameOpeningSequence } from "./GameOpeningSequence";
import { GameRoleCallSequence } from "./GameRoleCallSequence";
import { GameSelfArea } from "./GameSelfArea";
import { GameSelfCity } from "./GameSelfCity";
import { GameScoringOverview } from "./GameScoringOverview";
import { GameResultOverlay } from "../result/GameResultOverlay";
import { GameTopBar } from "./GameTopBar";
import {
  getDistrictTargetStatus,
  getTableTargetingGold,
  type TableDistrictTargetSource
} from "./tableDistrictTargeting";
import { useTableDistrictTargeting } from "./useTableDistrictTargeting";
import { legalRoleTargets, type RoleSkillTargeting } from "./roleSkillTargeting";
import { GameCardInspector } from "./GameCardInspector";
import { GameSkillPresentationLayer } from "./GameSkillPresentationLayer";
import { GameBuildAnimationLayer } from "./GameBuildAnimationLayer";
import { useBuildAnimationTransactions } from "./useBuildAnimationTransactions";
import { GameActionNoticeLayer } from "./GameActionNoticeLayer";
import { GameUiTuningPanel } from "./GameUiTuningPanel";
import { GameCommandFeedbackToast } from "./GameCommandFeedbackToast";
import type { GameCommandFeedback } from "./useGameCommandFeedback";
import {
  canShowUiTuningPanel,
  clampGameUiTuning,
  clearStoredGameUiTuning,
  defaultGameUiTuning,
  densityForPlayerCount,
  gameUiTuningStyle,
  readStoredGameUiTuning,
  resolveSafeGameUiTuning,
  saveStoredGameUiTuning
} from "./gameUiTuning";

export type GameTableViewProps = {
  actionEvents: ActionEventPayload[];
  chatMessages: ChatMessage[];
  commandFeedback: GameCommandFeedback | null;
  gameState: VisibleGameState;
  pendingCommand: string | null;
  playerId: string | null;
  selfAvatarImage: string | null;
  selfAvatarLabel: string;
  onDismissCommandFeedback: () => void;
  onBuildDistrict: (districtCardId: string) => boolean;
  onChooseDrawnCard: (districtCardId: string) => void;
  onDrawCards: () => void;
  onEndTurn: () => void;
  onLeaveRoom: () => void;
  onRematch: () => void;
  onOpenInfoModal: (modal: InfoModalId) => void;
  onResolveGraveyardChoice: (buyBack: boolean) => void;
  onSendChatMessage: (message: string) => void;
  onSelectRole: (roleId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
  onUseDistrictEffect: (payload: UseDistrictEffectPayload) => void;
};

type PendingConfirm =
  | { type: "build"; district: BuildableDistrictCard }
  | { type: "magician-swap"; targetPlayerId: string; targetPlayerName: string; targetHandCount: number }
  | {
      type: "table-target";
      source: TableDistrictTargetSource;
      targetPlayerId: string;
      targetPlayerName: string;
      targetDistrictCardId: string;
      targetDistrictName: string;
      cost: number;
    };

export function GameTableView(props: GameTableViewProps) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [districtEffectCardId, setDistrictEffectCardId] = useState<string | null>(null);
  const [districtEffectDiscardCardId, setDistrictEffectDiscardCardId] = useState<string | null>(null);
  const [roleSkillTargeting, setRoleSkillTargeting] = useState<RoleSkillTargeting | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tuningSafetyMessages, setTuningSafetyMessages] = useState<string[]>([]);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [scoringOverviewOpen, setScoringOverviewOpen] = useState(false);
  const density = densityForPlayerCount(props.gameState.players.length);
  const tuningDefaults = useMemo(() => defaultGameUiTuning(), []);
  const tuningPanelVisible = canShowUiTuningPanel();
  const initialStoredTuning = useMemo(
    () => readStoredGameUiTuning(tuningDefaults, density),
    [density, tuningDefaults]
  );
  const [uiTuning, setUiTuning] = useState(() => initialStoredTuning.config);
  const [appliedUiTuning, setAppliedUiTuning] = useState(() => initialStoredTuning.config);
  const [hasAppliedUiTuning, setHasAppliedUiTuning] = useState(() => initialStoredTuning.hasApplied);
  const [uiTuningDirty, setUiTuningDirty] = useState(false);
  const gameShellRef = useRef<HTMLElement>(null);
  const gameTableRef = useRef<HTMLElement>(null);
  const scoringButtonRef = useRef<HTMLButtonElement>(null);
  const tableTargeting = useTableDistrictTargeting();
  const viewModel = useGameViewModel({ gameState: props.gameState, playerId: props.playerId });
  const buildAnimations = useBuildAnimationTransactions({
    actionEvents: props.actionEvents,
    commandFeedback: props.commandFeedback,
    gameState: props.gameState,
    selfPlayerId: props.playerId,
    tableRef: gameTableRef
  });
  const buildArrivalHighlightIds = useMemo(
    () => new Set(buildAnimations.arrivalHighlights),
    [buildAnimations.arrivalHighlights]
  );
  const districtEffectCard =
    viewModel.self?.city.find((card) => card.id === districtEffectCardId) ?? null;
  const usedDistrictEffectIds = viewModel.turnState?.usedDistrictEffectIds ?? [];
  const canConfirmDistrictEffect = Boolean(
    districtEffectCard &&
    viewModel.isMyTurn &&
    !usedDistrictEffectIds.includes(districtEffectCard.id) &&
    (districtEffectCard.effectType === "discard_hand_for_gold"
      ? districtEffectDiscardCardId && viewModel.self?.hand?.some((card) => card.id === districtEffectDiscardCardId)
      : districtEffectCard.effectType === "pay_gold_draw_cards" && (viewModel.self?.gold ?? 0) >= 2)
  );

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const stored = readStoredGameUiTuning(tuningDefaults, density);
    setUiTuning(stored.config);
    setAppliedUiTuning(stored.config);
    setHasAppliedUiTuning(stored.hasApplied);
    setUiTuningDirty(false);
    setTuningSafetyMessages([]);
  }, [density, tuningDefaults]);
  const tableSeats = useMemo(
    () => arrangeGameTableSeats(props.gameState.players, props.playerId),
    [props.gameState.players, props.playerId]
  );
  const scoreByPlayerId = useMemo(() => new Map(
    props.gameState.players.map((player) => [
      player.id,
      calculateCityScore({
        city: player.city,
        endCitySize: props.gameState.settings.endCitySize,
        playerId: player.id,
        firstCompletedCityPlayerId: props.gameState.firstCompletedCityPlayerId
      })
    ])
  ), [
    props.gameState.firstCompletedCityPlayerId,
    props.gameState.players,
    props.gameState.settings.endCitySize
  ]);
  const timerDeadlineAt = props.gameState.turnTimer?.deadlineAt ?? null;
  const remainingSeconds = useMemo(() => {
    if (!timerDeadlineAt) {
      return null;
    }
    return Math.max(0, Math.ceil((new Date(timerDeadlineAt).getTime() - now) / 1000));
  }, [now, timerDeadlineAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  function requestBuildDistrict(district: BuildableDistrictCard) {
    tableTargeting.cancel();
    setRoleSkillTargeting(null);
    setDistrictEffectCardId(null);
    setDistrictEffectDiscardCardId(null);
    setPendingConfirm({ type: "build", district });
  }

  function requestDistrictEffect(card: BuildableDistrictCard) {
    if (!viewModel.isMyTurn || usedDistrictEffectIds.includes(card.id)) {
      return;
    }
    if (card.effectType !== "discard_hand_for_gold" && card.effectType !== "pay_gold_draw_cards") {
      return;
    }
    tableTargeting.cancel();
    setRoleSkillTargeting(null);
    setPendingConfirm(null);
    setDistrictEffectCardId(card.id);
    setDistrictEffectDiscardCardId(null);
  }

  function cancelDistrictEffect() {
    setDistrictEffectCardId(null);
    setDistrictEffectDiscardCardId(null);
  }

  function confirmDistrictEffect() {
    if (!districtEffectCard || !canConfirmDistrictEffect) {
      return;
    }
    props.onUseDistrictEffect({
      districtCardId: districtEffectCard.id,
      discardCardId:
        districtEffectCard.effectType === "discard_hand_for_gold"
          ? districtEffectDiscardCardId ?? undefined
          : undefined
    });
    cancelDistrictEffect();
  }

  useEffect(() => {
    if (!pendingConfirm) {
      return;
    }
    if (props.gameState.phase !== "ROLE_ACTION" || !viewModel.isMyTurn) {
      setPendingConfirm(null);
      return;
    }
    if (pendingConfirm.type === "build") {
      const stillInHand = viewModel.self?.hand?.some((card) => card.id === pendingConfirm.district.id) ?? false;
      if (!stillInHand || !viewModel.canBuild) {
        setPendingConfirm(null);
      }
    }
  }, [
    pendingConfirm,
    props.gameState.phase,
    props.gameState.currentTurnPlayerId,
    viewModel.canBuild,
    viewModel.isMyTurn,
    viewModel.self?.hand
  ]);

  useEffect(() => {
    if (!tableTargeting.source) {
      return;
    }
    if (
      props.gameState.phase !== "ROLE_ACTION" ||
      !viewModel.isMyTurn ||
      props.gameState.pendingDrawChoice ||
      viewModel.skillUsed
    ) {
      tableTargeting.cancel();
      if (pendingConfirm?.type === "table-target") {
        setPendingConfirm(null);
      }
    }
  }, [
    pendingConfirm,
    props.gameState.pendingDrawChoice,
    props.gameState.phase,
    tableTargeting.cancel,
    tableTargeting.source,
    viewModel.isMyTurn,
    viewModel.skillUsed
  ]);

  useEffect(() => {
    if (!districtEffectCardId) {
      return;
    }
    const selectedCardStillExists = viewModel.self?.city.some(
      (card) => card.id === districtEffectCardId
    );
    if (
      props.gameState.phase !== "ROLE_ACTION" ||
      !viewModel.isMyTurn ||
      props.gameState.pendingDrawChoice ||
      !selectedCardStillExists ||
      usedDistrictEffectIds.includes(districtEffectCardId)
    ) {
      cancelDistrictEffect();
    }
  }, [
    districtEffectCardId,
    props.gameState.currentTurnPlayerId,
    props.gameState.pendingDrawChoice,
    props.gameState.phase,
    usedDistrictEffectIds,
    viewModel.isMyTurn,
    viewModel.self?.city
  ]);

  useEffect(() => {
    if (!roleSkillTargeting) {
      return;
    }
    if (
      props.gameState.phase !== "ROLE_ACTION" ||
      !viewModel.isMyTurn ||
      props.gameState.pendingDrawChoice ||
      viewModel.skillUsed
    ) {
      setRoleSkillTargeting(null);
    }
  }, [
    props.gameState.pendingDrawChoice,
    props.gameState.phase,
    roleSkillTargeting,
    viewModel.isMyTurn,
    viewModel.skillUsed
  ]);

  function requestUseSkill(payload: UseRoleSkillPayload) {
    if (viewModel.selfRoleId === "assassin" || viewModel.selfRoleId === "thief") {
      tableTargeting.cancel();
      cancelDistrictEffect();
      setPendingConfirm(null);
      setRoleSkillTargeting({
        kind: "role",
        sourceRoleId: viewModel.selfRoleId,
        selectedRoleId: null
      });
      return;
    }
    if (viewModel.selfRoleId === "magician") {
      tableTargeting.cancel();
      cancelDistrictEffect();
      viewModel.clearDiscardCards();
      setPendingConfirm(null);
      setRoleSkillTargeting({ kind: "magician-choice" });
      return;
    }
    if (viewModel.selfRoleId !== "warlord") {
      props.onUseSkill(payload);
      return;
    }
    setRoleSkillTargeting(null);
    setPendingConfirm(null);
    cancelDistrictEffect();
    tableTargeting.begin({
      kind: "role",
      roleId: "warlord",
      name: "军阀技能",
      costMode: "warlord"
    });
  }

  function chooseRoleTarget(roleId: string) {
    setRoleSkillTargeting((current) =>
      current?.kind === "role" ? { ...current, selectedRoleId: roleId } : current
    );
  }

  function confirmRoleTarget() {
    if (roleSkillTargeting?.kind !== "role" || !roleSkillTargeting.selectedRoleId) {
      return;
    }
    props.onUseSkill({ targetRoleId: roleSkillTargeting.selectedRoleId });
    setRoleSkillTargeting(null);
  }

  function chooseMagicianMode(mode: "discard" | "player") {
    viewModel.clearDiscardCards();
    setRoleSkillTargeting(
      mode === "discard"
        ? { kind: "magician-discard", selectedCardIds: [] }
        : { kind: "magician-player", selectedPlayerId: null }
    );
  }

  function confirmMagicianDiscard() {
    if (roleSkillTargeting?.kind !== "magician-discard" || viewModel.discardCardIds.length === 0) {
      return;
    }
    props.onUseSkill({ discardCardIds: viewModel.discardCardIds });
    viewModel.clearDiscardCards();
    setRoleSkillTargeting(null);
  }

  function requestMagicianPlayerTarget(targetPlayer: (typeof props.gameState.players)[number]) {
    if (roleSkillTargeting?.kind !== "magician-player") {
      return;
    }
    setRoleSkillTargeting({ kind: "magician-player", selectedPlayerId: targetPlayer.id });
    setPendingConfirm({
      type: "magician-swap",
      targetPlayerId: targetPlayer.id,
      targetPlayerName: targetPlayer.name,
      targetHandCount: targetPlayer.handCount
    });
  }

  function requestTableDistrictTarget(
    targetPlayer: (typeof props.gameState.players)[number],
    targetDistrict: BuildableDistrictCard
  ) {
    if (!tableTargeting.source) {
      return;
    }
    const targetStatus = getDistrictTargetStatus({
      actorGold: getTableTargetingGold(viewModel.self),
      endCitySize: props.gameState.settings.endCitySize,
      protectedPlayerIds: props.gameState.roleEffects.protectedPlayerIds,
      targetDistrict,
      targetPlayer
    });
    if (!targetStatus.eligible) {
      return;
    }
    setPendingConfirm({
      type: "table-target",
      source: tableTargeting.source,
      targetPlayerId: targetPlayer.id,
      targetPlayerName: targetPlayer.name,
      targetDistrictCardId: targetDistrict.id,
      targetDistrictName: targetDistrict.name,
      cost: targetStatus.cost
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm) {
      return;
    }
    if (pendingConfirm.type === "build") {
      buildAnimations.beginSelfBuild(
        pendingConfirm.district,
        () => props.onBuildDistrict(pendingConfirm.district.id)
      );
    } else if (pendingConfirm.type === "magician-swap") {
      props.onUseSkill({ targetPlayerId: pendingConfirm.targetPlayerId });
      setRoleSkillTargeting(null);
    } else {
      props.onUseSkill({
        targetPlayerId: pendingConfirm.targetPlayerId,
        targetDistrictCardId: pendingConfirm.targetDistrictCardId
      });
    }
    tableTargeting.cancel();
    setPendingConfirm(null);
  }

  const layoutContext = {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    playerCount: props.gameState.players.length,
    handCount: viewModel.self?.handCount ?? 0
  };
  const resolvedDraftTuning = resolveSafeGameUiTuning(uiTuning, layoutContext);
  const resolvedAppliedTuning = resolveSafeGameUiTuning(appliedUiTuning, layoutContext);
  const displayedUiTuning = tuningPanelVisible ? resolvedDraftTuning.config : resolvedAppliedTuning.config;
  const openingVisible = props.gameState.phase === "CROWN_REVEAL";
  const compactViewport = viewport.width <= 1100 || (viewport.width <= 1365 && viewport.height <= 640);
  const roleCallHighlightedPlayerId = props.gameState.roleCallState?.playerId ?? null;

  function updateUiTuning(nextConfig: typeof uiTuning) {
    const rawConfig = clampGameUiTuning(nextConfig);
    setUiTuning(rawConfig);
    setUiTuningDirty(true);
    setTuningSafetyMessages(resolveSafeGameUiTuning(rawConfig, layoutContext).corrections);
  }

  function applyUiTuning() {
    const rawConfig = clampGameUiTuning(uiTuning);
    saveStoredGameUiTuning(rawConfig);
    setUiTuning(rawConfig);
    setAppliedUiTuning(rawConfig);
    setHasAppliedUiTuning(true);
    setUiTuningDirty(false);
    setTuningSafetyMessages(resolveSafeGameUiTuning(rawConfig, layoutContext).corrections);
  }

  function closeScoringOverview() {
    setScoringOverviewOpen(false);
    window.requestAnimationFrame(() => scoringButtonRef.current?.focus());
  }

  return (
    <section
      ref={gameShellRef}
      className={`citadel-game-shell citadel-game-shell--players-${props.gameState.players.length} citadel-game-shell--density-${density} ${compactViewport ? "citadel-game-shell--compact" : ""} ${pendingConfirm ? "citadel-game-shell--confirming" : ""} ${districtEffectCard ? "citadel-game-shell--hand-choice" : ""} ${tableTargeting.source ? "citadel-game-shell--table-targeting" : ""} ${openingVisible ? "citadel-game-shell--objective-intro citadel-game-shell--opening" : ""} ${props.gameState.pendingDrawChoice ? "citadel-game-shell--draw-choice" : ""} ${tuningPanelVisible && uiTuning.showBounds ? "ui-show-bounds" : ""}`}
      data-crown-player-id={props.gameState.crownPlayerId}
      data-compact-layout={compactViewport ? "true" : "false"}
      data-role-call-player-id={roleCallHighlightedPlayerId ?? undefined}
      aria-busy={Boolean(props.pendingCommand)}
      style={gameUiTuningStyle(displayedUiTuning)}
    >
      {tuningPanelVisible && (
        <GameUiTuningPanel
          config={uiTuning}
          dirty={uiTuningDirty}
          hasApplied={hasAppliedUiTuning}
          safetyMessages={tuningSafetyMessages}
          onChange={updateUiTuning}
          onApply={applyUiTuning}
          onReset={() => {
            clearStoredGameUiTuning();
            setUiTuning(tuningDefaults);
            setAppliedUiTuning(tuningDefaults);
            setHasAppliedUiTuning(false);
            setUiTuningDirty(false);
            setTuningSafetyMessages([]);
          }}
        />
      )}
      <GameTopBar
        gameState={props.gameState}
        objectiveIntroVisible={openingVisible}
        scoringButtonRef={scoringButtonRef}
        onLeaveRoom={props.onLeaveRoom}
        onOpenInfoModal={props.onOpenInfoModal}
        onOpenScoring={() => setScoringOverviewOpen(true)}
      />
      {scoringOverviewOpen && (
        <GameScoringOverview
          endCitySize={props.gameState.settings.endCitySize}
          players={props.gameState.players}
          scores={scoreByPlayerId}
          onClose={closeScoringOverview}
        />
      )}
      <main ref={gameTableRef} className="citadel-game-table" aria-label={"\u5bf9\u5c40\u684c\u9762"}>
        <div className="citadel-game-board" aria-hidden="true" />
        <GameOpeningSequence gameState={props.gameState} tableRef={gameTableRef} />
        <div
          className="citadel-opponent-rail"
          data-opponent-count={tableSeats.opponents.length}
          aria-label={"\u5176\u4ed6\u73a9\u5bb6"}
        >
          {tableSeats.opponents.map((seat) => (
            <GameOpponentSeat
              arrivalHighlightCardIds={buildArrivalHighlightIds}
              key={seat.player.id}
              dense={
                props.gameState.players.length >= 7 &&
                (seat.position.startsWith("left-") || seat.position.startsWith("right-"))
              }
              hasCrown={seat.player.id === props.gameState.crownPlayerId}
              roleCallHighlighted={seat.player.id === roleCallHighlightedPlayerId}
              currentTurnPlayerId={props.gameState.currentTurnPlayerId}
              hiddenDistrictCardIds={buildAnimations.hiddenDistrictCardIds}
              districtTargeting={Boolean(tableTargeting.source)}
              playerTargeting={roleSkillTargeting?.kind === "magician-player"}
              playerTargetSelected={
                roleSkillTargeting?.kind === "magician-player" &&
                roleSkillTargeting.selectedPlayerId === seat.player.id
              }
              selectedDistrictCardId={pendingConfirm?.type === "table-target" ? pendingConfirm.targetDistrictCardId : null}
              getDistrictTargetStatus={(card) => tableTargeting.source
                ? getDistrictTargetStatus({
                    actorGold: getTableTargetingGold(viewModel.self),
                    endCitySize: props.gameState.settings.endCitySize,
                    protectedPlayerIds: props.gameState.roleEffects.protectedPlayerIds,
                    targetDistrict: card,
                    targetPlayer: seat.player
                  })
                : { eligible: false, reason: "", cost: 0 }}
              onSelectDistrictTarget={(card) => requestTableDistrictTarget(seat.player, card)}
              onSelectPlayerTarget={() => requestMagicianPlayerTarget(seat.player)}
              player={seat.player}
              position={seat.position}
              handStackDepth={displayedUiTuning.opponentHandStackDepth}
            />
          ))}
        </div>
        <GameRoleCallSequence gameState={props.gameState} />
        <div className="citadel-center-feedback-rail">
          <GameCenterStatus
            currentTurnName={viewModel.currentTurnName}
            gameState={props.gameState}
            remainingSeconds={remainingSeconds}
            roleSelectionTurnName={viewModel.roleSelectionTurnName}
          />
          <GameActionNoticeLayer actionEvents={props.actionEvents} gameState={props.gameState} />
        </div>
        {tableSeats.self && (
          <GameSelfCity
            activeDistrictCardId={districtEffectCardId}
            arrivalHighlightCardIds={buildArrivalHighlightIds}
            canUseDistrictEffects={viewModel.isMyTurn && !pendingConfirm && !tableTargeting.source && !roleSkillTargeting && !props.gameState.pendingDrawChoice}
            city={tableSeats.self.city ?? []}
            hiddenDistrictCardIds={buildAnimations.hiddenDistrictCardIds}
            pendingBuildCards={buildAnimations.pendingSelfCards}
            usedDistrictEffectIds={usedDistrictEffectIds}
            onSelectDistrictEffect={requestDistrictEffect}
          />
        )}
        {tableSeats.self && (
          <GameSelfArea
            avatarImage={props.selfAvatarImage}
            avatarLabel={props.selfAvatarLabel}
            canBuild={viewModel.canBuild && !districtEffectCard && !tableTargeting.source && !roleSkillTargeting}
            canConfirmDistrictEffect={canConfirmDistrictEffect}
            districtEffectCard={districtEffectCard}
            districtEffectDiscardCardId={districtEffectDiscardCardId}
            magicianDiscardSelection={roleSkillTargeting?.kind === "magician-discard"}
            magicianDiscardCardIds={viewModel.discardCardIds}
            pendingBuildCardIds={buildAnimations.pendingSelfCardIds}
            gameState={props.gameState}
            hasCrown={tableSeats.self.id === props.gameState.crownPlayerId}
            roleCallHighlighted={tableSeats.self.id === roleCallHighlightedPlayerId}
            self={tableSeats.self}
            onBuildDistrict={requestBuildDistrict}
            onCancelDistrictEffect={cancelDistrictEffect}
            onConfirmDistrictEffect={confirmDistrictEffect}
            onSelectDistrictDiscardCard={(cardId) => {
              setDistrictEffectDiscardCardId((current) => current === cardId ? null : cardId);
            }}
            onToggleMagicianDiscardCard={viewModel.toggleDiscardCard}
          />
        )}
        <GameActionDock
          canSkipCurrentOfflinePlayer={viewModel.canSkipCurrentOfflinePlayer}
          canBuild={viewModel.canBuild}
          canTakeResource={viewModel.canTakeResource}
          canUseSkill={viewModel.canUseSkill}
          discardCardIds={viewModel.discardCardIds}
          gameState={props.gameState}
          pendingCommand={props.pendingCommand}
          remainingSeconds={remainingSeconds}
          isMyTurn={viewModel.isMyTurn}
          isSelectingRole={viewModel.isSelectingRole}
          currentTurnName={viewModel.currentTurnName}
          players={props.gameState.players}
          selfPlayerId={props.playerId}
          skillBlockedReason={viewModel.skillBlockedReason}
          skillHint={skillHint(viewModel.selfRoleId)}
          skillTargetSpec={viewModel.skillTargetSpec}
          roleSkillTargeting={roleSkillTargeting}
          legalRoleTargets={roleSkillTargeting?.kind === "role"
            ? legalRoleTargets(props.gameState, roleSkillTargeting.sourceRoleId)
            : []}
          tableTargeting={tableTargeting.source
            ? {
                sourceName: tableTargeting.source.name,
                canSkip: true
              }
            : null}
          turnState={viewModel.turnState}
          onChooseDrawnCard={props.onChooseDrawnCard}
          onDrawCards={props.onDrawCards}
          onEndTurn={props.onEndTurn}
          onSelectRole={props.onSelectRole}
          onSkipCurrentOfflinePlayer={props.onSkipCurrentOfflinePlayer}
          onTakeGold={props.onTakeGold}
          onCancelRoleSkillTargeting={() => {
            viewModel.clearDiscardCards();
            setRoleSkillTargeting(null);
            setPendingConfirm(null);
          }}
          onChooseRoleTarget={chooseRoleTarget}
          onChooseMagicianMode={chooseMagicianMode}
          onConfirmRoleTarget={confirmRoleTarget}
          onConfirmMagicianDiscard={confirmMagicianDiscard}
          onUseSkill={requestUseSkill}
          onCancelTableTargeting={() => {
            tableTargeting.cancel();
            setPendingConfirm(null);
          }}
          onSkipTableTargeting={() => {
            props.onUseSkill({});
            tableTargeting.cancel();
            setPendingConfirm(null);
          }}
        />
        <GameCornerDocks
          actionEvents={props.actionEvents}
          chatMessages={props.chatMessages}
          gameState={props.gameState}
          compact={compactViewport}
          onSendChatMessage={props.onSendChatMessage}
        />
        <GameSkillPresentationLayer
          actionEvents={props.actionEvents}
          gameState={props.gameState}
          selfPlayerId={props.playerId}
          tableRef={gameTableRef}
        />
        <GameBuildAnimationLayer
          tableRef={gameTableRef}
          transactions={buildAnimations.transactions}
          onFinish={buildAnimations.finishTransaction}
        />
        {props.gameState.phase === "ENDED" && viewModel.scoringResults.length > 0 && (
          <GameResultOverlay
            avatarImage={props.selfAvatarImage}
            avatarLabel={props.selfAvatarLabel}
            players={props.gameState.players}
            results={viewModel.scoringResults}
            selfPlayerId={props.playerId}
            canRematch={viewModel.self?.isHost ?? false}
            onRematch={props.onRematch}
            onReturnLobby={props.onLeaveRoom}
          />
        )}
      </main>
      <GameCommandFeedbackToast
        feedback={props.commandFeedback}
        onDismiss={props.onDismissCommandFeedback}
      />
      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.type === "build"
            ? "\u786e\u8ba4\u5efa\u9020"
            : pendingConfirm.type === "magician-swap"
              ? "确认交换手牌"
              : `确认使用${pendingConfirm.source.name}`}
          confirmLabel={"\u786e\u5b9a"}
          body={
            pendingConfirm.type === "build" ? (
              <p>{"\u662f\u5426\u5efa\u9020 "}{pendingConfirm.district.name}{"\uff1f\u9700\u8981 "}{pendingConfirm.district.cost}{" \u679a\u91d1\u5e01\u3002"}</p>
            ) : pendingConfirm.type === "magician-swap" ? (
              <p>是否与 {pendingConfirm.targetPlayerName} 交换全部手牌？对方当前有 {pendingConfirm.targetHandCount} 张手牌。</p>
            ) : (
              <p>
                {"是否破坏 "}{pendingConfirm.targetPlayerName}{" 的 "}{pendingConfirm.targetDistrictName}{"？"}
                {pendingConfirm.cost > 0 ? `需要 ${pendingConfirm.cost} 枚金币。` : "无需支付金币。"}
              </p>
            )
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
        />
      )}
      {props.gameState.pendingGraveyardChoice?.playerId === props.playerId && (
        <ConfirmDialog
          title="墓地：是否收回建筑"
          confirmLabel="支付 1 金币收回"
          body={(
            <p>
              你的 {props.gameState.pendingGraveyardChoice.districtCard.name} 刚被破坏。
              是否支付 1 枚金币，将它放回手牌？
            </p>
          )}
          onCancel={() => props.onResolveGraveyardChoice(false)}
          onConfirm={() => props.onResolveGraveyardChoice(true)}
        />
      )}
      <GameCardInspector previewScale={displayedUiTuning.cardPreviewScale} rootRef={gameShellRef} />
    </section>
  );
}


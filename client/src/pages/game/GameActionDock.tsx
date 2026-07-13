import type { VisibleGameState } from "@zy/shared";
import type { ReactNode } from "react";
import type { SkillTargetSpec } from "./skillTargeting";
import type { GamePlayer, RoleOption, UseRoleSkillPayload } from "./gameTypes";
import { DistrictChoiceCard } from "./DistrictChoiceCard";
import { RoleIdentityCard } from "./RoleIdentityCard";
import type { RoleSkillTargeting } from "./roleSkillTargeting";
import { roleTargetPrompt } from "./roleSkillTargeting";
import { GameSelectionOverlay } from "./GameSelectionOverlay";
import { GameRoleSelectionDock } from "./GameRoleSelectionDock";
import { roleIncomeSummary } from "./roleIncome";

export function GameActionDock(props: {
  canBuild: boolean;
  canSkipCurrentOfflinePlayer: boolean;
  canTakeResource: boolean;
  canUseSkill: boolean;
  currentTurnName: string;
  discardCardIds: string[];
  gameState: VisibleGameState;
  isMyTurn: boolean;
  isSelectingRole: boolean;
  pendingCommand: string | null;
  remainingSeconds: number | null;
  players: GamePlayer[];
  selfPlayerId: string | null;
  skillBlockedReason: string;
  skillHint: string;
  skillTargetSpec: SkillTargetSpec;
  turnState: VisibleGameState["turnState"];
  tableTargeting: { sourceName: string; canSkip: boolean } | null;
  roleSkillTargeting: RoleSkillTargeting | null;
  legalRoleTargets: RoleOption[];
  onChooseDrawnCard: (districtCardId: string) => void;
  onDrawCards: () => void;
  onEndTurn: () => void;
  onSelectRole: (roleId: string) => void;
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onCancelRoleSkillTargeting: () => void;
  onChooseRoleTarget: (roleId: string) => void;
  onChooseMagicianMode: (mode: "discard" | "player") => void;
  onConfirmRoleTarget: () => void;
  onConfirmMagicianDiscard: () => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
  onCancelTableTargeting: () => void;
  onSkipTableTargeting: () => void;
}) {
  const commandPending = Boolean(props.pendingCommand);
  if (props.gameState.pendingDrawChoice) {
    return (
      <DrawChoiceDock
        pendingDrawChoice={props.gameState.pendingDrawChoice}
        pending={commandPending}
        remainingSeconds={props.remainingSeconds}
        onChooseDrawnCard={props.onChooseDrawnCard}
      />
    );
  }

  if (props.gameState.phase === "ROLE_SELECTION") {
    return props.isSelectingRole ? (
      <GameRoleSelectionDock
        pending={commandPending}
        remainingSeconds={props.remainingSeconds}
        roles={props.gameState.availableRoles}
        onSelectRole={props.onSelectRole}
      />
    ) : null;
  }

  if (props.gameState.phase !== "ROLE_ACTION") {
    return null;
  }

  const self = props.players.find((player) => player.id === props.selfPlayerId) ?? null;
  const incomeSummary = roleIncomeSummary(self?.selectedRoleId ?? null, self?.city ?? []);
  const skillUsed = Boolean(
    props.selfPlayerId && props.gameState.roleEffects.usedSkillPlayerIds.includes(props.selfPlayerId)
  );

  if (props.tableTargeting) {
    return (
      <section className="citadel-action-layer citadel-action-layer--table-targeting" aria-label={"选择牌桌目标"}>
        <div className="citadel-action-dock citadel-action-dock--table-targeting">
          <p className="citadel-action-guidance">
            <span>
              {props.tableTargeting.sourceName}
              {incomeSummary ? ` · 职业收入预计 +${incomeSummary.amount}` : ""}
            </span>
            {"请选择一座高亮的其他玩家建筑"}
          </p>
          {props.tableTargeting.canSkip && (
            <button
              className="citadel-action-button"
              type="button"
              onClick={props.onSkipTableTargeting}
            >
              {incomeSummary ? `只领取收入（+${incomeSummary.amount}）` : "只领取收入"}
            </button>
          )}
          <button
            className="citadel-action-button"
            type="button"
            onClick={props.onCancelTableTargeting}
          >
            {"取消选择"}
          </button>
        </div>
      </section>
    );
  }

  if (props.roleSkillTargeting?.kind === "role") {
    const selectedRoleId = props.roleSkillTargeting.selectedRoleId;
    return (
      <GameSelectionOverlay
        ariaLabel="选择身份目标"
        className="citadel-action-dock--roles citadel-action-dock--skill-roles citadel-action-dock--skill-role-row"
        remainingSeconds={props.remainingSeconds}
        subtitle={`通过身份牌指定目标，暂不公开玩家身份。${roleTargetPrompt(props.roleSkillTargeting.sourceRoleId)}`}
        title={props.roleSkillTargeting.sourceRoleId === "assassin" ? "选择一名玩家刺杀" : "选择一名玩家偷窃"}
        controls={(
          <>
            <button className="citadel-action-button citadel-action-button--gold" disabled={!selectedRoleId} type="button" onClick={props.onConfirmRoleTarget}>
              确认目标
            </button>
            <button className="citadel-action-button" type="button" onClick={props.onCancelRoleSkillTargeting}>
              取消选择
            </button>
          </>
        )}
      >
          <div className="citadel-role-choice-grid citadel-skill-role-options">
            {props.legalRoleTargets.map((role) => (
              <RoleIdentityCard
                caption={selectedRoleId === role.id ? "已选中" : "选择该身份"}
                className={`citadel-role-choice ${selectedRoleId === role.id ? "is-selected" : ""}`}
                key={role.id}
                roleId={role.id}
                onClick={() => props.onChooseRoleTarget(role.id)}
              />
            ))}
          </div>
      </GameSelectionOverlay>
    );
  }

  if (props.roleSkillTargeting?.kind === "magician-choice") {
    return (
      <SkillTargetDock title="魔术师技能" guidance="选择一种使用方式。">
        <button className="citadel-action-button citadel-action-button--draw" type="button" onClick={() => props.onChooseMagicianMode("discard")}>
          弃牌并重抽
        </button>
        <button className="citadel-action-button citadel-action-button--skill" type="button" onClick={() => props.onChooseMagicianMode("player")}>
          与玩家交换手牌
        </button>
        <button className="citadel-action-button" type="button" onClick={props.onCancelRoleSkillTargeting}>取消</button>
      </SkillTargetDock>
    );
  }

  if (props.roleSkillTargeting?.kind === "magician-discard") {
    return (
      <SkillTargetDock title="弃牌并重抽" guidance={`在你的手牌区选择任意张牌，当前已选 ${props.discardCardIds.length} 张。`}>
        <button className="citadel-action-button citadel-action-button--draw" disabled={props.discardCardIds.length === 0} type="button" onClick={props.onConfirmMagicianDiscard}>
          确认弃牌重抽
        </button>
        <button className="citadel-action-button" type="button" onClick={props.onCancelRoleSkillTargeting}>取消选择</button>
      </SkillTargetDock>
    );
  }

  if (props.roleSkillTargeting?.kind === "magician-player") {
    return (
      <SkillTargetDock title="交换全部手牌" guidance="点击牌桌上任意一名其他玩家的信息栏。">
        <button className="citadel-action-button" type="button" onClick={props.onCancelRoleSkillTargeting}>取消选择</button>
      </SkillTargetDock>
    );
  }

  const incomeTooltip = incomeSummary ? `\n${incomeSummary.detail}` : "";
  const skillTooltip = props.skillBlockedReason
    ? `${props.skillHint}${incomeTooltip}\n${props.skillBlockedReason}`
    : `${props.skillHint}${incomeTooltip}`;
  const resourceTooltip = !props.isMyTurn
    ? `等待 ${props.currentTurnName} 完成行动。`
    : !props.canTakeResource
      ? "本回合已经选择过金币或抽卡。"
      : "获取 2 枚金币，或抽 2 张建筑牌后选择 1 张。两项只能选择一次。";
  const endTurnTooltip = props.isMyTurn
    ? "结束当前角色的行动；如果尚未选择资源，系统会自动领取 2 枚金币。"
    : `等待 ${props.currentTurnName} 完成行动。`;

  return (
    <section className="citadel-action-layer" aria-label={"\u5f53\u524d\u64cd\u4f5c"}>
      <div className="citadel-action-dock">
        <p className="citadel-action-guidance">
          <span>{"\u5f53\u524d\u6b65\u9aa4"}</span>
          {actionGuidance(props)}
        </p>
        <button
          className="citadel-action-button citadel-action-button--gold citadel-has-tooltip"
          data-tooltip={resourceTooltip}
          title={resourceTooltip}
          disabled={!props.canTakeResource || commandPending}
          type="button"
          onClick={props.onTakeGold}
        >
          {props.pendingCommand === "take-gold" ? "处理中…" : "\u83b7\u53d6\u91d1\u5e01"}
        </button>
        <button
          className="citadel-action-button citadel-action-button--draw citadel-has-tooltip"
          data-tooltip={resourceTooltip}
          title={resourceTooltip}
          disabled={!props.canTakeResource || commandPending}
          type="button"
          onClick={props.onDrawCards}
        >
          {props.pendingCommand === "draw" ? "处理中…" : "\u62bd\u5361"}
        </button>
        <button
          className={`citadel-action-button citadel-action-button--skill citadel-has-tooltip ${incomeSummary ? "citadel-action-button--skill-income" : ""}`}
          data-tooltip={skillTooltip}
          data-role-income-amount={incomeSummary?.amount}
          data-role-income-detail={incomeSummary?.detail}
          title={skillTooltip}
          disabled={!props.canUseSkill || commandPending}
          type="button"
          onClick={() => props.onUseSkill({})}
        >
          <span>{props.pendingCommand === "role-skill" ? "处理中…" : "\u4f7f\u7528\u6280\u80fd"}</span>
          {incomeSummary ? (
            <small>{skillUsed ? "职业收入已结算" : `职业收入预计 +${incomeSummary.amount}`}</small>
          ) : null}
        </button>
        <button
          className="citadel-action-button citadel-has-tooltip"
          data-tooltip={endTurnTooltip}
          title={endTurnTooltip}
          disabled={!props.isMyTurn || commandPending}
          type="button"
          onClick={props.onEndTurn}
        >
          {props.pendingCommand === "end-turn" ? "处理中…" : "\u7ed3\u675f\u56de\u5408"}
        </button>
        {props.canSkipCurrentOfflinePlayer && (
          <button
            className="citadel-action-button citadel-has-tooltip"
            data-tooltip={"\u8df3\u8fc7\u5f53\u524d\u79bb\u7ebf\u73a9\u5bb6\uff0c\u4fdd\u6301\u5bf9\u5c40\u7ee7\u7eed\u3002"}
            type="button"
            onClick={props.onSkipCurrentOfflinePlayer}
          >
            {"\u8df3\u8fc7\u79bb\u7ebf"}
          </button>
        )}
      </div>
    </section>
  );
}

function SkillTargetDock(props: { title: string; guidance: string; children: ReactNode }) {
  return (
    <section className="citadel-action-layer citadel-action-layer--skill-targeting" aria-label={props.title}>
      <div className="citadel-action-dock citadel-action-dock--skill-targeting">
        <p className="citadel-action-guidance">
          <span>{props.title}</span>
          {props.guidance}
        </p>
        {props.children}
      </div>
    </section>
  );
}

function DrawChoiceDock(props: {
  pendingDrawChoice: NonNullable<VisibleGameState["pendingDrawChoice"]>;
  pending: boolean;
  remainingSeconds?: number | null;
  onChooseDrawnCard: (districtCardId: string) => void;
}) {
  return (
    <GameSelectionOverlay
      ariaLabel={"\u62bd\u5361\u9009\u62e9"}
      className="citadel-action-dock--draw-choice"
      remainingSeconds={props.remainingSeconds}
      subtitle={"\u9009\u4e2d\u7684\u724c\u52a0\u5165\u624b\u724c\uff0c\u5176\u4f59\u653e\u56de\u724c\u5806\u5e95\u90e8"}
      title={"\u9009\u62e9 1 \u5f20\u5efa\u7b51\u724c"}
    >
        <div className="citadel-draw-choice-cards">
          {props.pendingDrawChoice.drawnCards.map((card) => (
            <DistrictChoiceCard
              card={card}
              disabled={props.pending}
              key={card.id}
              onChoose={() => props.onChooseDrawnCard(card.id)}
            />
          ))}
        </div>
    </GameSelectionOverlay>
  );
}

function actionGuidance(props: {
  canBuild: boolean;
  canTakeResource: boolean;
  currentTurnName: string;
  isMyTurn: boolean;
  turnState: VisibleGameState["turnState"];
}) {
  if (!props.isMyTurn) {
    return `\u7b49\u5f85 ${props.currentTurnName} \u5b8c\u6210\u884c\u52a8`;
  }

  if (props.canTakeResource) {
    return "\u5148\u9009\u62e9\uff1a\u83b7\u53d6 2 \u91d1\u5e01\uff0c\u6216\u62bd\u53d6\u5efa\u7b51\u724c";
  }

  const remainingBuilds = Math.max(
    0,
    (props.turnState?.maxBuilds ?? 0) - (props.turnState?.buildsUsed ?? 0)
  );
  if (props.canBuild && remainingBuilds > 0) {
    return `\u53ef\u70b9\u51fb\u624b\u724c\u5efa\u9020\uff08\u8fd8\u53ef\u5efa ${remainingBuilds} \u5ea7\uff09\uff0c\u4e5f\u53ef\u4f7f\u7528\u6280\u80fd`;
  }

  return "\u8d44\u6e90\u5df2\u9009\u62e9\uff1a\u4f7f\u7528\u6280\u80fd\u540e\u7ed3\u675f\u56de\u5408";
}

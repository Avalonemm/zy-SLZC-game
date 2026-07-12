import { useEffect, useState } from "react";
import type { VisibleGameState } from "@zy/shared";
import { GameButton } from "../ui/GameButton";
import type {
  BuildableDistrictCard,
  TestGamePlayer,
  UseDistrictEffectPayload,
  UseRoleSkillPayload
} from "./testGameTypes";
import { roleOptions } from "./testGameUtils";
import type { SkillTargetSpec } from "./skillTargeting";

type ActionPanelProps = {
  canSkipCurrentOfflinePlayer: boolean;
  canTakeResource: boolean;
  canUseSkill: boolean;
  city: BuildableDistrictCard[];
  discardCardIds: string[];
  hand: BuildableDistrictCard[];
  isMyTurn: boolean;
  players: TestGamePlayer[];
  selfPlayerId: string | null;
  selfGold: number;
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
  onSkipCurrentOfflinePlayer: () => void;
  onTakeGold: () => void;
  onTargetDistrictChange: (districtCardId: string) => void;
  onTargetPlayerChange: (playerId: string) => void;
  onTargetRoleChange: (roleId: string) => void;
  onToggleDiscardCard: (cardId: string) => void;
  onUseSkill: (payload: UseRoleSkillPayload) => void;
  onUseDistrictEffect: (payload: UseDistrictEffectPayload) => void;
};

export function ActionPanel(props: ActionPanelProps) {
  const opponentPlayers = props.players.filter((player) => player.id !== props.selfPlayerId);
  const [laboratoryDiscardCardId, setLaboratoryDiscardCardId] = useState("");
  const laboratory = props.city.find((card) => card.effectType === "discard_hand_for_gold") ?? null;
  const smithy = props.city.find((card) => card.effectType === "pay_gold_draw_cards") ?? null;
  const usedDistrictEffectIds = props.turnState?.usedDistrictEffectIds ?? [];
  const laboratoryDiscardTarget = props.hand.find((card) => card.id === laboratoryDiscardCardId) ?? props.hand[0] ?? null;

  useEffect(() => {
    if (!laboratoryDiscardTarget) {
      setLaboratoryDiscardCardId("");
      return;
    }
    if (laboratoryDiscardTarget.id !== laboratoryDiscardCardId) {
      setLaboratoryDiscardCardId(laboratoryDiscardTarget.id);
    }
  }, [laboratoryDiscardCardId, laboratoryDiscardTarget]);

  return (
    <section className="test-game-section">
      <h3>行动与技能</h3>
      <div className="test-action-grid">
        <GameButton
          variant="secondary"
          size="sm"
          disabled={!props.canTakeResource}
          onClick={props.onTakeGold}
        >
          拿金币
        </GameButton>
        <GameButton
          variant="secondary"
          size="sm"
          disabled={!props.canTakeResource}
          onClick={props.onDrawCards}
        >
          抽牌
        </GameButton>
        <GameButton
          variant="neutral"
          size="sm"
          disabled={!props.isMyTurn}
          onClick={props.onEndTurn}
        >
          结束回合
        </GameButton>
        <GameButton
          variant="neutral"
          size="sm"
          disabled={!props.canSkipCurrentOfflinePlayer}
          onClick={props.onSkipCurrentOfflinePlayer}
        >
          跳过离线玩家
        </GameButton>
      </div>

      <div className="test-skill-box">
        <p className="test-skill-hint">{props.skillHint}</p>
        {props.skillTargetSpec.kind === "role" && (
          <label>
            {props.skillTargetSpec.label}
            <select
              value={props.targetRoleId}
              onChange={(event) => props.onTargetRoleChange(event.target.value)}
            >
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {props.skillTargetSpec.kind === "district" && (
          <>
            <label>
              目标玩家
              <select
                value={props.targetPlayerId}
                onChange={(event) => props.onTargetPlayerChange(event.target.value)}
              >
                {opponentPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              目标建筑
              <select
                value={props.targetDistrictCardId}
                onChange={(event) => props.onTargetDistrictChange(event.target.value)}
              >
                {props.targetDistricts.length === 0 ? (
                  <option value="">无建筑</option>
                ) : (
                  props.targetDistricts.map((district) => (
                    <option key={district.id} value={district.id}>
                      {district.name} · 费用 {district.cost}
                    </option>
                  ))
                )}
              </select>
            </label>
          </>
        )}
        {props.skillTargetSpec.kind === "discardCards" && (
          <div className="test-discard-options">
            <span>{props.skillTargetSpec.label}，或不勾选手牌并选择目标玩家交换手牌</span>
            <label>
              交换目标
              <select
                value={props.targetPlayerId}
                onChange={(event) => props.onTargetPlayerChange(event.target.value)}
              >
                {opponentPlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              {props.hand.map((card) => (
                <label key={card.id}>
                  <input
                    type="checkbox"
                    checked={props.discardCardIds.includes(card.id)}
                    onChange={() => props.onToggleDiscardCard(card.id)}
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
          disabled={!props.canUseSkill}
          onClick={() =>
            props.onUseSkill({
              targetRoleId: props.targetRoleId,
              targetPlayerId:
                props.skillTargetSpec.kind === "discardCards" && props.discardCardIds.length > 0
                  ? undefined
                  : props.targetPlayerId || undefined,
              targetDistrictCardId: props.targetDistrictCardId || undefined,
              discardCardIds:
                props.discardCardIds.length > 0 ? props.discardCardIds : undefined
            })
          }
        >
          使用技能
        </GameButton>
        {props.skillBlockedReason && (
          <span className="test-skill-blocked">{props.skillBlockedReason}</span>
        )}
      </div>

      {(laboratory || smithy) && (
        <div className="test-district-effect-box">
          <strong>建筑效果</strong>
          {laboratory && (
            <div className="test-district-effect-row">
              <label>
                实验室弃牌
                <select
                  value={laboratoryDiscardCardId}
                  onChange={(event) => setLaboratoryDiscardCardId(event.target.value)}
                >
                  {props.hand.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <GameButton
                variant="secondary"
                size="sm"
                disabled={
                  !props.isMyTurn ||
                  !laboratoryDiscardTarget ||
                  usedDistrictEffectIds.includes(laboratory.id)
                }
                onClick={() =>
                  props.onUseDistrictEffect({
                    districtCardId: laboratory.id,
                    discardCardId: laboratoryDiscardTarget?.id
                  })
                }
              >
                发动实验室
              </GameButton>
            </div>
          )}
          {smithy && (
            <GameButton
              variant="secondary"
              size="sm"
              disabled={!props.isMyTurn || props.selfGold < 2 || usedDistrictEffectIds.includes(smithy.id)}
              onClick={() => props.onUseDistrictEffect({ districtCardId: smithy.id })}
            >
              铁匠铺：2 金币抽 3 张
            </GameButton>
          )}
        </div>
      )}    </section>
  );
}

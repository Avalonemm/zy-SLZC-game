import type { VisibleGameState } from "@zy/shared";
import type { BuildableDistrictCard, GamePlayer } from "./gameTypes";
import { GamePlayerMiniStatus } from "./GamePlayerMiniStatus";
import { RoleIdentityCard } from "./RoleIdentityCard";
import { districtInspectorAttributes } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

export function GameSelfArea(props: {
  avatarImage: string | null;
  avatarLabel: string;
  canBuild: boolean;
  canConfirmDistrictEffect: boolean;
  districtEffectCard: BuildableDistrictCard | null;
  districtEffectDiscardCardId: string | null;
  magicianDiscardSelection: boolean;
  magicianDiscardCardIds: string[];
  gameState: VisibleGameState;
  hasCrown: boolean;
  self: GamePlayer | null;
  onBuildDistrict: (card: BuildableDistrictCard) => void;
  onCancelDistrictEffect: () => void;
  onConfirmDistrictEffect: () => void;
  onSelectDistrictDiscardCard: (cardId: string) => void;
  onToggleMagicianDiscardCard: (cardId: string) => void;
}) {
  const hand = props.self?.hand ?? [];
  const availableGold = props.self?.gold ?? 0;
  const selectingDiscard = props.districtEffectCard?.effectType === "discard_hand_for_gold";
  const selectingMagicianDiscard = props.magicianDiscardSelection;
  const selectionMode = selectingDiscard || selectingMagicianDiscard;
  const builtNames = new Set(props.self?.city.map((district) => district.name) ?? []);

  return (
    <section className="citadel-self-area" aria-label={"\u4f60\u7684\u533a\u57df"}>
      <div className="citadel-self-identity-cluster">
        <DeckStack label={"\u5efa\u7b51\u724c\u5806"} count={props.gameState.districtDeckCount} />
        <div className="citadel-self-profile">
          {props.self ? (
            <GamePlayerMiniStatus
              avatarImage={props.avatarImage}
              avatarLabel={props.avatarLabel}
              hasCrown={props.hasCrown}
              isCurrent={props.gameState.currentTurnPlayerId === props.self.id}
              player={props.self}
              self
            />
          ) : null}
        </div>
        <div className="citadel-self-role-card">
          <RoleIdentityCard roleId={props.self?.selectedRoleId ?? null} self inspectorPlacement="right" />
        </div>
      </div>

      <div className="citadel-self-hand-column">
        {props.districtEffectCard && (
          <p className="citadel-hand-choice-prompt" role="status">
            <strong>{props.districtEffectCard.name}</strong>
            <span>{districtEffectInstruction(props.districtEffectCard)}</span>
          </p>
        )}
        <div
          className={`citadel-hand-zone ${hand.length > 10 ? "citadel-hand-zone--scrollable" : ""}`}
          data-hand-count={hand.length}
          tabIndex={hand.length > 10 ? 0 : undefined}
          aria-label={selectionMode ? "\u9009\u62e9\u8981\u5f03\u7f6e\u7684\u624b\u724c" : "\u4f60\u7684\u624b\u724c"}
          onWheel={(event) => {
            if (hand.length <= 10 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.currentTarget.scrollLeft += event.deltaY;
            event.preventDefault();
          }}
        >
          {hand.length > 0 ? (
            hand.map((card) => (
              <HandCard
                key={card.id}
                card={card}
                disabled={selectionMode ? false : !props.canBuild || card.cost > availableGold || builtNames.has(card.name)}
                disabledReason={selectionMode
                  ? ""
                  : !props.canBuild
                    ? "请等待自己的行动，并先完成资源选择。"
                    : card.cost > availableGold
                      ? `金币不足，需要 ${card.cost} 枚金币。`
                      : builtNames.has(card.name)
                        ? "城市中已经有同名建筑。"
                        : ""}
                selected={selectingMagicianDiscard
                  ? props.magicianDiscardCardIds.includes(card.id)
                  : selectingDiscard && props.districtEffectDiscardCardId === card.id}
                selectionMode={selectionMode}
                onClick={() => {
                  if (selectingMagicianDiscard) {
                    props.onToggleMagicianDiscardCard(card.id);
                    return;
                  }
                  if (selectingDiscard) {
                    props.onSelectDistrictDiscardCard(card.id);
                    return;
                  }
                  props.onBuildDistrict(card);
                }}
              />
            ))
          ) : (
            <p className="citadel-hand-empty">{"\u6682\u65e0\u624b\u724c"}</p>
          )}
        </div>
        <span className="citadel-hand-caption">{"\u4f60\u7684\u624b\u724c\uff08"}{hand.length}{"\u5f20\uff09"}</span>
      </div>

      <div className="citadel-self-hand-side">
        {props.districtEffectCard && (
          <div className="citadel-hand-choice-controls" aria-label={"\u5efa\u7b51\u6548\u679c\u786e\u8ba4"}>
            <button
              className="citadel-action-button citadel-action-button--gold"
              disabled={!props.canConfirmDistrictEffect}
              type="button"
              onClick={props.onConfirmDistrictEffect}
            >
              {selectingDiscard ? "确认弃置" : "确定"}
            </button>
            <button className="citadel-action-button" type="button" onClick={props.onCancelDistrictEffect}>
              {"取消选择"}
            </button>
          </div>
        )}
        <DeckStack label={"\u5f03\u724c\u5806"} count={props.gameState.districtDiscardPileCount} muted />
      </div>
    </section>
  );
}

function districtEffectInstruction(card: BuildableDistrictCard) {
  if (card.effectType === "discard_hand_for_gold") {
    return "点击 1 张手牌将它选中，然后确认弃置并获得 1 枚金币。";
  }
  if (card.effectType === "pay_gold_draw_cards") {
    return "\u652f\u4ed8 2 \u679a\u91d1\u5e01\uff0c\u62bd\u53d6 3 \u5f20\u5efa\u7b51\u724c\u3002";
  }
  return card.description;
}

function DeckStack(props: { count: number; label: string; muted?: boolean }) {
  return (
    <div className={`citadel-deck-stack ${props.muted ? "citadel-deck-stack--muted" : ""}`}>
      <span className="citadel-card-back" aria-hidden="true" />
      <b>{props.count}</b>
      <small>{props.label}</small>
    </div>
  );
}

function HandCard(props: {
  card: BuildableDistrictCard;
  disabled: boolean;
  disabledReason: string;
  selected: boolean;
  selectionMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={props.selectionMode ? props.selected : undefined}
      aria-disabled={props.disabled}
      aria-label={`${props.card.name}，费用 ${props.card.cost}，${props.card.score} 分。${props.card.description}`}
      title={props.disabledReason || props.card.description}
      className={`citadel-hand-card citadel-hand-card--${props.card.color} ${props.selectionMode ? "is-targetable" : ""} ${props.selected ? "is-selected" : ""}`}
      {...cardFaceAttributes()}
      type="button"
      onClick={() => {
        if (!props.disabled) {
          props.onClick();
        }
      }}
      {...districtInspectorAttributes(props.card, "hand")}
    >
      <CardArtwork kind="district" cardId={props.card.id} alt={props.card.name} />
      <span>{props.card.cost}</span>
      <strong>{props.card.name}</strong>
    </button>
  );
}

import type { VisibleGameState } from "@zy/shared";
import { phaseText, roleName, roleOrder } from "./gameText";
import { RoleIdentityCard } from "./RoleIdentityCard";

export function GameCenterStatus(props: {
  currentTurnName: string;
  gameState: VisibleGameState;
  remainingSeconds: number | null;
  roleSelectionTurnName: string;
}) {
  const phase = phaseText(props.gameState.phase);
  const waitingText = centerStatusText(
    props.gameState,
    props.currentTurnName,
    props.roleSelectionTurnName
  );
  const currentPlayer = props.gameState.players.find(
    (player) => player.id === props.gameState.currentTurnPlayerId
  ) ?? null;
  const activeRoleId = props.gameState.phase === "ROLE_ACTION"
    ? currentPlayer?.selectedRoleId ?? null
    : null;

  if (activeRoleId && currentPlayer) {
    return (
      <section
        className="citadel-game-center citadel-game-center--active-turn"
        aria-label={`\u5f53\u524d\u884c\u52a8\uff1a${roleName(activeRoleId)}\uff0c${currentPlayer.name}`}
        data-current-role-id={activeRoleId}
      >
        <RoleIdentityCard
          caption={"\u5f53\u524d\u8eab\u4efd"}
          className="citadel-game-center__role-card"
          compact
          inspectorPlacement="bottom"
          inspectorSize="table-small"
          roleId={activeRoleId}
        />
        <div className="citadel-game-center__turn-copy">
          <p className="citadel-game-center__callout">
            {roleOrder(activeRoleId)}{"\u53f7"}{roleName(activeRoleId)}{" \u00b7 "}{currentPlayer.name}{"\u884c\u52a8"}
          </p>
          <strong>{currentPlayer.name}</strong>
          <span>{roleName(activeRoleId)}{"\u6b63\u5728\u884c\u52a8"}</span>
        </div>
        {props.remainingSeconds !== null ? (
          <b
            className="citadel-game-center__timer"
            aria-label={`\u5269\u4f59 ${props.remainingSeconds} \u79d2`}
          >
            {props.remainingSeconds}<small>{"\u79d2"}</small>
          </b>
        ) : null}
      </section>
    );
  }

  return (
    <section className="citadel-game-center" aria-label={"\u5bf9\u5c40\u72b6\u6001"}>
      <div className="citadel-game-center__mark" aria-hidden="true">{"\u2666"}</div>
      <strong>{"\u5bcc\u9976\u4e4b\u57ce"}</strong>
      <span>CITADELS</span>
      <p>{"\u7b2c "}{props.gameState.currentRound}{" \u8f6e \u00b7 "}{phase}</p>
      {waitingText && <p className="citadel-game-center__callout">{waitingText}</p>}
      {props.remainingSeconds !== null && (
        <b className="citadel-game-center__timer">{props.remainingSeconds}</b>
      )}
    </section>
  );
}

function centerStatusText(
  gameState: VisibleGameState,
  currentTurnName: string,
  roleSelectionTurnName: string
) {
  if (gameState.phase === "CROWN_REVEAL") {
    return "";
  }
  if (gameState.phase === "ROLE_SELECTION") {
    return `\u7b49\u5f85 ${roleSelectionTurnName} \u9009\u62e9\u8eab\u4efd...`;
  }
  if (gameState.phase === "ROLE_CALL") {
    const call = gameState.roleCallState;
    return call
      ? `\u6b63\u5728\u53eb\u53f7\uff1a${roleOrder(call.roleId)}\u53f7${roleName(call.roleId)}`
      : "\u57ce\u4e3b\u6b63\u5728\u51c6\u5907\u53eb\u53f7...";
  }
  if (gameState.phase === "ROLE_ACTION") {
    return gameState.currentTurnPlayerId
      ? `\u7b49\u5f85 ${currentTurnName} \u884c\u52a8...`
      : "\u6b63\u5728\u53eb\u53f7\uff0c\u7b49\u5f85\u5f53\u524d\u8eab\u4efd\u63ed\u6653...";
  }
  if (gameState.phase === "ROUND_END") {
    return "\u672c\u8f6e\u884c\u52a8\u7ed3\u675f\uff0c\u51c6\u5907\u8fdb\u5165\u4e0b\u4e00\u8f6e...";
  }
  if (gameState.phase === "SCORING") {
    return "\u6b63\u5728\u7ed3\u7b97\u672c\u5c40\u6210\u7ee9...";
  }
  if (gameState.phase === "ENDED") {
    return "\u5bf9\u5c40\u5df2\u7ed3\u675f";
  }
  return "\u7b49\u5f85\u5bf9\u5c40\u63a8\u8fdb...";
}

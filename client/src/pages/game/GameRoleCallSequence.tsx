import type { CSSProperties } from "react";
import type { VisibleGameState } from "@zy/shared";
import { RoleIdentityCard } from "./RoleIdentityCard";
import { roleName, roleOrder } from "./gameText";

export function GameRoleCallSequence(props: { gameState: VisibleGameState }) {
  const call = props.gameState.roleCallState;
  if (props.gameState.phase !== "ROLE_CALL" || !call) {
    return null;
  }

  const player = call.playerId
    ? props.gameState.players.find((candidate) => candidate.id === call.playerId) ?? null
    : null;
  const roleLabel = `${roleOrder(call.roleId)}\u53f7 \u00b7 ${roleName(call.roleId)}`;
  const elapsedMs = Math.max(0, Date.now() - new Date(call.startedAt).getTime());
  const animationDelayMs = -Math.min(call.timeoutMs, elapsedMs);
  const revealed = call.stage === "revealing" || call.stage === "skipped";
  const announcement = roleCallAnnouncement(call.stage, roleLabel, player?.name ?? null);

  return (
    <aside
      aria-label={announcement}
      aria-live={call.stage === "skipped" ? "assertive" : "polite"}
      className={`citadel-role-call citadel-role-call--${call.stage}`}
      data-role-call-player-id={call.playerId ?? undefined}
      data-role-call-role-id={call.roleId}
      data-role-call-stage={call.stage}
      role="status"
      style={{
        "--role-call-duration": `${call.timeoutMs}ms`,
        "--role-call-delay": `${animationDelayMs}ms`
      } as CSSProperties}
    >
      <div className="citadel-role-call__eyebrow">
        {call.stage === "calling"
          ? "\u57ce\u4e3b\u53eb\u53f7"
          : call.stage === "unanswered"
            ? "\u65e0\u4eba\u5e94\u7b54"
            : "\u8eab\u4efd\u63ed\u793a"}
      </div>
      <div className={`citadel-role-call__card ${revealed ? "is-revealed" : ""}`} aria-hidden="true">
        <div className="citadel-role-call__card-inner">
          <div className="citadel-role-call__card-back">
            <span>{roleOrder(call.roleId)}</span>
            <strong>{roleName(call.roleId)}</strong>
          </div>
          <div className="citadel-role-call__card-front">
            <RoleIdentityCard
              caption={call.stage === "skipped" ? "\u8eab\u4efd\u5c01\u5370" : "\u8eab\u4efd\u63ed\u793a"}
              className="citadel-role-call__identity-card"
              roleId={call.roleId}
            />
          </div>
        </div>
        {call.stage === "unanswered" ? (
          <strong className="citadel-role-call__stamp">{"\u65e0\u4eba\u5e94\u7b54"}</strong>
        ) : null}
        {call.stage === "skipped" ? (
          <span className="citadel-role-call__slash" aria-hidden="true" />
        ) : null}
      </div>
      <strong className="citadel-role-call__role-name">{roleLabel}</strong>
      <span className="citadel-role-call__response">
        {call.stage === "calling"
          ? "\u8bf7\u8be5\u8eab\u4efd\u5e94\u7b54"
          : call.stage === "unanswered"
            ? "\u672c\u8f6e\u6ca1\u6709\u73a9\u5bb6\u6301\u6709\u8be5\u8eab\u4efd"
            : call.stage === "skipped"
              ? `${player?.name ?? "\u8be5\u73a9\u5bb6"} \u88ab\u523a\u6740\uff0c\u672c\u8f6e\u8df3\u8fc7`
              : `${player?.name ?? "\u73a9\u5bb6"} \u73b0\u8eab`}
      </span>
      <span className="citadel-role-call__progress" aria-hidden="true" />
    </aside>
  );
}

function roleCallAnnouncement(
  stage: NonNullable<VisibleGameState["roleCallState"]>["stage"],
  roleLabel: string,
  playerName: string | null
) {
  if (stage === "calling") {
    return `\u6b63\u5728\u53eb\u53f7\uff1a${roleLabel}`;
  }
  if (stage === "unanswered") {
    return `${roleLabel}\uff0c\u65e0\u4eba\u5e94\u7b54`;
  }
  if (stage === "skipped") {
    return `${roleLabel}\u63ed\u793a\uff0c${playerName ?? "\u8be5\u73a9\u5bb6"}\u88ab\u523a\u6740\uff0c\u672c\u8f6e\u8df3\u8fc7`;
  }
  return `${roleLabel}\u63ed\u793a\uff0c${playerName ?? "\u73a9\u5bb6"}\u5f00\u59cb\u5e94\u7b54`;
}

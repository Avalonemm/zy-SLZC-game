import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ActionEventPayload, ActionEventPresentation, VisibleGameState } from "@zy/shared";
import { roleName } from "./gameText";
import { presentationTiming } from "./presentationTiming";

type Point = { x: number; y: number };
type PresentationGeometry = {
  actor: Point;
  source: Point;
  target: Point;
  width: number;
  height: number;
};

const ignoredPresentationKinds = new Set<ActionEventPresentation["kind"]>([
  "build_district",
  "turn_start"
]);

export function GameSkillPresentationLayer(props: {
  actionEvents: ActionEventPayload[];
  gameState: VisibleGameState;
  selfPlayerId: string | null;
  tableRef: RefObject<HTMLElement | null>;
}) {
  const [queue, setQueue] = useState<ActionEventPayload[]>([]);
  const [geometry, setGeometry] = useState<PresentationGeometry | null>(null);
  const seenEventIds = useRef(new Set<string>());
  const activeEvent = queue[0] ?? null;

  useEffect(() => {
    const incoming = [...props.actionEvents]
      .reverse()
      .filter((event) =>
        event.presentation &&
        !ignoredPresentationKinds.has(event.presentation.kind) &&
        !seenEventIds.current.has(event.id)
      );
    if (incoming.length === 0) return;
    for (const event of incoming) seenEventIds.current.add(event.id);

    setQueue((current) => {
      const active = current[0] ?? null;
      const waiting = [...current.slice(active ? 1 : 0), ...incoming]
        .sort((first, second) => presentationPriority(second.presentation?.kind) - presentationPriority(first.presentation?.kind));
      const guaranteed = waiting.filter((event) => isGuaranteedPresentation(event.presentation?.kind));
      const ordinary = waiting.filter((event) => !isGuaranteedPresentation(event.presentation?.kind)).slice(-2);
      return active ? [active, ...guaranteed, ...ordinary] : [...guaranteed, ...ordinary];
    });
  }, [props.actionEvents]);

  useEffect(() => {
    if (!activeEvent) return;
    const timeout = window.setTimeout(() => {
      setQueue((current) => current.filter((event) => event.id !== activeEvent.id));
    }, presentationTiming(activeEvent.presentation?.kind).motionMs);
    return () => window.clearTimeout(timeout);
  }, [activeEvent]);

  useLayoutEffect(() => {
    if (!activeEvent?.presentation || !props.tableRef.current) {
      setGeometry(null);
      return;
    }

    const updateGeometry = () => {
      const table = props.tableRef.current;
      const presentation = activeEvent.presentation;
      if (!table || !presentation) return;
      const tableRect = table.getBoundingClientRect();
      const center = elementCenter(table.querySelector<HTMLElement>(".citadel-game-center"), tableRect) ?? {
        x: tableRect.width / 2,
        y: tableRect.height * 0.4
      };
      const actor = playerCenter(table, presentation.actorPlayerId, tableRect) ?? center;
      const playerTarget = playerCenter(table, presentation.targetPlayerId, tableRect) ?? center;
      const hand = elementCenter(table.querySelector<HTMLElement>(".citadel-hand-zone"), tableRect) ?? actor;
      const deck = elementCenter(table.querySelector<HTMLElement>(".citadel-self-area .citadel-deck-stack"), tableRect) ?? center;
      const district = districtCenter(table, presentation.districtCardId, tableRect);
      const roleTarget = { x: center.x, y: Math.min(tableRect.height - 170, center.y + 120) };
      const kind = presentation.kind;
      let source = actor;
      let destination = playerTarget;

      if (kind === "thief_steal" || kind === "queen_income") {
        source = playerTarget;
        destination = actor;
      } else if (kind === "warlord_destroy") {
        destination = district ?? playerTarget;
      } else if (kind === "magician_redraw") {
        source = hand;
        destination = deck;
      } else if (kind === "architect_bonus") {
        source = deck;
        destination = presentation.actorPlayerId === props.selfPlayerId ? hand : actor;
      } else if (kind === "role_income") {
        source = { x: actor.x, y: Math.min(tableRect.height - 42, actor.y + 76) };
        destination = actor;
      } else if (kind === "bishop_guard") {
        source = actor;
        destination = actor;
      } else if (kind === "take_gold") {
        source = center;
        destination = actor;
      } else if (kind === "draw_cards" || kind === "draw_resolved") {
        source = deck;
        destination = presentation.actorPlayerId === props.selfPlayerId ? hand : actor;
      } else if (kind === "assassin_mark" || kind === "thief_mark") {
        destination = roleTarget;
      } else if (kind === "assassin_skip" || kind === "role_lock") {
        destination = kind === "assassin_skip" ? playerTarget : actor;
      } else if (kind === "crown_transfer") {
        source = center;
        destination = playerTarget;
      }
      setGeometry({ actor, source, target: destination, width: tableRect.width, height: tableRect.height });
    };

    updateGeometry();
    window.addEventListener("resize", updateGeometry);
    return () => window.removeEventListener("resize", updateGeometry);
  }, [activeEvent, props.selfPlayerId, props.tableRef]);

  const selfRoleId = useMemo(
    () => props.gameState.players.find((player) => player.id === props.selfPlayerId)?.selectedRoleId ?? null,
    [props.gameState.players, props.selfPlayerId]
  );

  if (!activeEvent?.presentation || !geometry) return null;

  const presentation = activeEvent.presentation;
  const kind = presentation.kind;
  const timing = presentationTiming(kind);
  const selfAffected = presentation.targetPlayerId === props.selfPlayerId || (
    kind === "assassin_skip" && !presentation.targetPlayerId && selfRoleId === presentation.targetRoleId
  );
  const path = curvedPath(geometry.source, geometry.target);
  const sourceStyle = movingStyle(geometry.source, geometry.target);
  const reverseStyle = movingStyle(geometry.target, geometry.source);
  const normalAction = isNormalPresentation(kind);
  const guaranteed = isGuaranteedPresentation(kind);
  const roleClass = presentation.roleId ? `citadel-skill-presentation--role-${presentation.roleId}` : "";
  const showRoute = !["role_lock", "bishop_guard", "final_round", "game_ended"].includes(kind);
  const coinCount = presentationCoinCount(presentation);

  return (
    <aside
      className={`citadel-skill-presentation citadel-skill-presentation--${kind} ${roleClass} ${normalAction ? "is-normal-action" : ""} ${guaranteed ? "is-guaranteed" : ""} ${selfAffected ? "is-self-affected" : ""}`}
      data-presentation-kind={kind}
      data-role-id={presentation.roleId ?? ""}
      data-presentation-amount={presentation.amount ?? ""}
      data-actor-player-id={presentation.actorPlayerId ?? ""}
      data-target-player-id={presentation.targetPlayerId ?? ""}
      style={{
        "--presentation-motion-duration": `${timing.motionMs}ms`,
        "--presentation-particle-duration": `${Math.max(700, timing.motionMs - 480)}ms`,
        "--skill-district-color": districtColor(presentation.districtColor)
      } as CSSProperties}
      aria-live={guaranteed ? "assertive" : "polite"}
      aria-label={activeEvent.message}
    >
      <div className="citadel-skill-presentation__vignette" />
      {showRoute && (
        <svg className="citadel-skill-presentation__route" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={path} pathLength="1" />
        </svg>
      )}
      {!normalAction && <span className="citadel-skill-presentation__halo citadel-skill-presentation__halo--actor" style={pointStyle(geometry.actor)} />}
      <span className="citadel-skill-presentation__halo citadel-skill-presentation__halo--target" style={pointStyle(geometry.target)} />

      {(kind === "magician_swap" || kind === "magician_redraw") && (
        <>
          <span className="citadel-skill-card-stack citadel-skill-card-stack--forward" style={sourceStyle} />
          <span className="citadel-skill-card-stack citadel-skill-card-stack--reverse" style={reverseStyle} />
        </>
      )}

      {kind === "architect_bonus" && (
        <div className="citadel-skill-blueprint" style={pointStyle(geometry.target)} aria-hidden="true">
          <b>蓝图</b>
          <span>本轮可建 {presentation.maxBuilds ?? 3} 次</span>
          {Array.from({ length: Math.max(1, presentation.cardCount ?? 2) }, (_, index) => (
            <i key={index} style={{ "--skill-delay": `${index * 150}ms` } as CSSProperties} />
          ))}
        </div>
      )}

      {coinCount > 0 && (
        <div className="citadel-skill-coin-stream" aria-hidden="true">
          {Array.from({ length: coinCount }, (_, index) => (
            <span key={index} style={{ ...sourceStyle, "--skill-delay": `${index * 82}ms` } as CSSProperties}>$</span>
          ))}
        </div>
      )}

      {!usesSpecialMovingArt(kind, coinCount) && (
        <span className="citadel-skill-projectile" style={sourceStyle} aria-hidden="true">
          {presentationGlyph(kind)}
        </span>
      )}

      {kind === "role_income" && (
        <span className="citadel-skill-income-burst" style={pointStyle(geometry.actor)} aria-hidden="true">
          <b>{roleName(presentation.roleId ?? null)}</b>
          <strong>+{presentation.amount ?? 0}</strong>
        </span>
      )}

      {kind === "bishop_guard" && (
        <span className="citadel-skill-bishop-shield" style={pointStyle(geometry.actor)} aria-hidden="true">
          <b>◆</b><span>城市受保护</span>
        </span>
      )}

      {kind === "queen_income" && (
        <span className="citadel-skill-queen-bond" style={pointStyle(geometry.actor)} aria-hidden="true">
          王后相邻 <b>+{presentation.amount ?? 3}</b>
        </span>
      )}

      {kind === "warlord_destroy" && (
        <span className={`citadel-skill-district-ghost citadel-skill-district-ghost--${presentation.districtColor ?? "red"}`} style={pointStyle(geometry.target)} aria-hidden="true">
          <b>{presentation.cost ?? 0}</b>
          <strong>{presentation.districtName ?? "目标建筑"}</strong>
        </span>
      )}

      {(kind === "assassin_mark" || kind === "assassin_skip" || kind === "thief_mark") && (
        <span className="citadel-skill-role-seal" style={pointStyle(geometry.target)} aria-hidden="true">
          <b>{roleName(presentation.targetRoleId ?? null)}</b>
          <i>{kind === "thief_mark" ? "$" : "×"}</i>
        </span>
      )}

      {kind === "assassin_skip" && (
        <span className="citadel-skill-assassin-slash" style={pointStyle(geometry.target)} aria-hidden="true" />
      )}

      {(kind === "assassin_skip" || kind === "thief_steal") && (
        <span className="citadel-skill-settlement" style={pointStyle(geometry.target)} aria-hidden="true">
          {kind === "assassin_skip"
            ? "本轮跳过"
            : (presentation.amount ?? 0) > 0
              ? `-${presentation.amount} 金币`
              : "未偷到金币"}
        </span>
      )}

      {selfAffected && (kind === "assassin_skip" || kind === "thief_steal") && (
        <div className={`citadel-skill-private-warning citadel-skill-private-warning--${kind}`}>
          <b>{kind === "assassin_skip" ? "你被刺杀" : "你的金币被盗"}</b>
          <span>{kind === "assassin_skip"
            ? "本轮行动已跳过"
            : (presentation.amount ?? 0) > 0
              ? `${presentation.amount} 枚金币被盗走`
              : "盗贼没有偷到金币"}</span>
        </div>
      )}
    </aside>
  );
}

function presentationPriority(kind?: ActionEventPresentation["kind"]) {
  if (kind === "assassin_skip" || kind === "thief_steal" || kind === "game_ended" || kind === "final_round") return 4;
  if (isGuaranteedPresentation(kind)) return 3;
  return 1;
}

function isGuaranteedPresentation(kind?: ActionEventPresentation["kind"]) {
  return Boolean(kind && [
    "assassin_mark", "assassin_skip", "thief_mark", "thief_steal",
    "magician_swap", "magician_redraw", "role_income", "architect_bonus",
    "bishop_guard", "queen_income", "warlord_destroy", "crown_transfer",
    "final_round", "game_ended"
  ].includes(kind));
}

function playerCenter(table: HTMLElement, playerId: string | undefined, tableRect: DOMRect) {
  if (!playerId) return null;
  const element = [...table.querySelectorAll<HTMLElement>("[data-player-id]")]
    .find((candidate) => candidate.dataset.playerId === playerId);
  return elementCenter(element ?? null, tableRect);
}

function districtCenter(table: HTMLElement, districtCardId: string | undefined, tableRect: DOMRect) {
  if (!districtCardId) return null;
  const element = [...table.querySelectorAll<HTMLElement>("[data-district-card-id]")]
    .find((candidate) => candidate.dataset.districtCardId === districtCardId);
  return elementCenter(element ?? null, tableRect);
}

function elementCenter(element: HTMLElement | null, rootRect: DOMRect): Point | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left + rect.width / 2,
    y: rect.top - rootRect.top + rect.height / 2
  };
}

function pointStyle(point: Point): CSSProperties {
  return { left: point.x, top: point.y };
}

function movingStyle(source: Point, target: Point): CSSProperties {
  return {
    left: source.x,
    top: source.y,
    "--skill-dx": `${target.x - source.x}px`,
    "--skill-dy": `${target.y - source.y}px`
  } as CSSProperties;
}

function curvedPath(source: Point, target: Point) {
  const controlX = (source.x + target.x) / 2;
  const controlY = Math.min(source.y, target.y) - Math.max(42, Math.abs(target.x - source.x) * 0.08);
  return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
}

function presentationCoinCount(presentation: ActionEventPresentation) {
  if (presentation.kind === "thief_steal" && (presentation.amount ?? 0) <= 0) return 0;
  if (!["thief_steal", "take_gold", "role_income", "queen_income"].includes(presentation.kind)) return 0;
  return Math.min(8, Math.max(1, presentation.amount ?? (presentation.kind === "queen_income" ? 3 : 2)));
}

function usesSpecialMovingArt(kind: ActionEventPresentation["kind"], coinCount: number) {
  return kind === "magician_swap" || kind === "magician_redraw" || kind === "architect_bonus" ||
    kind === "bishop_guard" || kind === "role_income" || kind === "queen_income" || coinCount > 0;
}

function presentationGlyph(kind: ActionEventPresentation["kind"]) {
  if (kind === "warlord_destroy") return "⚒";
  if (kind === "draw_cards" || kind === "draw_resolved") return "▤";
  if (kind === "crown_transfer") return "♛";
  if (kind === "final_round" || kind === "game_ended") return "◆";
  if (kind.startsWith("assassin")) return "×";
  return "$";
}

function districtColor(color: ActionEventPresentation["districtColor"]) {
  const colors = {
    blue: "#6ec8ff",
    green: "#7fd66d",
    red: "#ef7254",
    yellow: "#f2c65f",
    purple: "#bc82eb"
  };
  return color ? colors[color] : "#e9c26f";
}

function isNormalPresentation(kind: ActionEventPresentation["kind"]) {
  return ["role_lock", "take_gold", "draw_cards", "draw_resolved"].includes(kind);
}

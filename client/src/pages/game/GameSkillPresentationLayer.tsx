import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ActionEventPayload, ActionEventPresentation, VisibleGameState } from "@zy/shared";
import { roleName } from "./gameText";

type Point = { x: number; y: number };
type PresentationGeometry = {
  actor: Point;
  source: Point;
  target: Point;
  width: number;
  height: number;
};

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
      .filter((event) => event.presentation && !seenEventIds.current.has(event.id));
    if (incoming.length === 0) {
      return;
    }
    for (const event of incoming) {
      seenEventIds.current.add(event.id);
    }
    setQueue((current) => {
      const active = current[0] ?? null;
      const waiting = [...current.slice(active ? 1 : 0), ...incoming]
        .sort((first, second) => presentationPriority(second.presentation?.kind) - presentationPriority(first.presentation?.kind));
      return (active ? [active, ...waiting] : waiting).slice(0, 5);
    });
  }, [props.actionEvents]);

  useEffect(() => {
    if (!activeEvent) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setQueue((current) => current.slice(1));
    }, presentationDuration(activeEvent.presentation?.kind));
    return () => window.clearTimeout(timeout);
  }, [activeEvent]);

  useLayoutEffect(() => {
    if (!activeEvent?.presentation || !props.tableRef.current) {
      setGeometry(null);
      return;
    }

    const updateGeometry = () => {
      const table = props.tableRef.current;
      if (!table || !activeEvent.presentation) {
        return;
      }
      const tableRect = table.getBoundingClientRect();
      const center = elementCenter(table.querySelector<HTMLElement>(".citadel-game-center"), tableRect) ?? {
        x: tableRect.width / 2,
        y: tableRect.height * 0.4
      };
      const actor = playerCenter(table, activeEvent.presentation.actorPlayerId, tableRect) ?? center;
      const playerTarget = playerCenter(table, activeEvent.presentation.targetPlayerId, tableRect) ?? center;
      const hand = elementCenter(table.querySelector<HTMLElement>(".citadel-hand-zone"), tableRect) ?? actor;
      const deck = elementCenter(table.querySelector<HTMLElement>(".citadel-self-area .citadel-deck-stack"), tableRect) ?? center;
      const district = districtCenter(table, activeEvent.presentation.districtCardId, tableRect);
      const roleTarget = { x: center.x, y: Math.min(tableRect.height - 170, center.y + 120) };
      const kind = activeEvent.presentation.kind;
      let source = actor;
      let destination = playerTarget;

      if (kind === "thief_steal") {
        source = playerTarget;
        destination = actor;
      } else if (kind === "warlord_destroy" || kind === "build_district") {
        source = kind === "build_district" ? hand : actor;
        destination = district ?? playerTarget;
      } else if (kind === "magician_redraw") {
        source = hand;
        destination = deck;
      } else if (kind === "take_gold") {
        source = center;
        destination = actor;
      } else if (kind === "draw_cards" || kind === "draw_resolved") {
        source = deck;
        destination = activeEvent.presentation.actorPlayerId === props.selfPlayerId ? hand : actor;
      } else if (kind === "assassin_mark" || kind === "thief_mark") {
        destination = roleTarget;
      } else if (kind === "role_lock" || kind === "turn_start") {
        destination = actor;
      } else if (kind === "crown_transfer") {
        destination = playerTarget;
      }
      setGeometry({
        actor,
        source,
        target: destination,
        width: tableRect.width,
        height: tableRect.height
      });
    };

    updateGeometry();
    window.addEventListener("resize", updateGeometry);
    return () => window.removeEventListener("resize", updateGeometry);
  }, [activeEvent, props.tableRef]);

  const selfRoleId = useMemo(
    () => props.gameState.players.find((player) => player.id === props.selfPlayerId)?.selectedRoleId ?? null,
    [props.gameState.players, props.selfPlayerId]
  );

  if (!activeEvent?.presentation || !geometry) {
    return null;
  }

  const presentation = activeEvent.presentation;
  const kind = presentation.kind;
  const selfAssassinated = kind === "assassin_skip" && selfRoleId === presentation.targetRoleId;
  const path = curvedPath(geometry.source, geometry.target);
  const sourceStyle = movingStyle(geometry.source, geometry.target);
  const reverseStyle = movingStyle(geometry.target, geometry.source);
  const isNormalAction = isNormalPresentation(kind);
  const showRoute = !["role_lock", "turn_start", "final_round", "game_ended"].includes(kind);

  return (
    <aside
      className={`citadel-skill-presentation citadel-skill-presentation--${kind} ${isNormalAction ? "is-normal-action" : ""} ${selfAssassinated ? "is-self-affected" : ""}`}
      aria-live="polite"
      aria-label={activeEvent.message}
    >
      <div className="citadel-skill-presentation__vignette" />
      {showRoute && (
        <svg
          className="citadel-skill-presentation__route"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={path} pathLength="1" />
        </svg>
      )}
      {!isNormalAction && <span className="citadel-skill-presentation__halo citadel-skill-presentation__halo--actor" style={pointStyle(geometry.actor)} />}
      <span className="citadel-skill-presentation__halo citadel-skill-presentation__halo--target" style={pointStyle(geometry.target)} />

      {kind === "magician_swap" || kind === "magician_redraw" ? (
        <>
          <span className="citadel-skill-card-stack citadel-skill-card-stack--forward" style={sourceStyle} />
          <span className="citadel-skill-card-stack citadel-skill-card-stack--reverse" style={reverseStyle} />
        </>
      ) : kind === "thief_steal" || kind === "take_gold" ? (
        <div className="citadel-skill-coin-stream" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              style={{ ...sourceStyle, "--skill-delay": `${index * 90}ms` } as CSSProperties}
            >
              $</span>
          ))}
        </div>
      ) : (
        <span className="citadel-skill-projectile" style={sourceStyle} aria-hidden="true">
          {presentationGlyph(kind)}
        </span>
      )}

      {(kind === "warlord_destroy" || kind === "build_district") && (
        <span
          className={`citadel-skill-district-ghost citadel-skill-district-ghost--${presentation.districtColor ?? "red"}`}
          style={pointStyle(geometry.target)}
          aria-hidden="true"
        >
          <b>{presentation.cost ?? 0}</b>
          <strong>{presentation.districtName ?? "目标建筑"}</strong>
        </span>
      )}

      {(kind === "assassin_mark" || kind === "assassin_skip" || kind === "thief_mark") && (
        <span className="citadel-skill-role-seal" style={pointStyle(geometry.target)} aria-hidden="true">
          <b>{roleName(presentation.targetRoleId ?? null)}</b>
          <i>{kind === "thief_mark" ? "$" : "†"}</i>
        </span>
      )}

      <div className="citadel-skill-presentation__banner">
        <small>{presentationTitle(kind)}</small>
        <strong>{activeEvent.message}</strong>
        <span>{presentationDetail(presentation)}</span>
      </div>

      {selfAssassinated && (
        <div className="citadel-skill-private-warning">
          <b>你被刺杀</b>
          <span>本轮行动已跳过</span>
        </div>
      )}
    </aside>
  );
}

function presentationDuration(kind?: ActionEventPresentation["kind"]) {
  if (!kind) return 700;
  if (kind === "final_round" || kind === "game_ended") return 1100;
  return isNormalPresentation(kind) ? 700 : 1500;
}

function presentationPriority(kind?: ActionEventPresentation["kind"]) {
  if (kind === "game_ended" || kind === "final_round") return 3;
  return kind && !isNormalPresentation(kind) ? 2 : 1;
}

function playerCenter(table: HTMLElement, playerId: string | undefined, tableRect: DOMRect) {
  if (!playerId) {
    return null;
  }
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
  if (!element) {
    return null;
  }
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

function presentationGlyph(kind: ActionEventPresentation["kind"]) {
  if (kind === "warlord_destroy") {
    return "⚔";
  }
  if (kind === "magician_redraw") {
    return "✦";
  }
  if (kind === "build_district") return "▣";
  if (kind === "draw_cards" || kind === "draw_resolved") return "▤";
  if (kind === "crown_transfer") return "♛";
  if (kind === "final_round" || kind === "game_ended") return "◆";
  if (kind.startsWith("assassin")) {
    return "◆";
  }
  return "$";
}

function presentationTitle(kind: ActionEventPresentation["kind"]) {
  const titles: Record<ActionEventPresentation["kind"], string> = {
    assassin_mark: "刺客出手",
    assassin_skip: "刺杀生效",
    thief_mark: "盗贼锁定目标",
    thief_steal: "金币被盗",
    magician_swap: "扭转手牌",
    magician_redraw: "魔术重塑",
    warlord_destroy: "军阀攻城",
    role_lock: "身份已锁定",
    take_gold: "获取金币",
    draw_cards: "抽取建筑牌",
    draw_resolved: "建筑牌已收入手牌",
    build_district: "建筑落成",
    turn_start: "回合开始",
    crown_transfer: "王冠转移",
    final_round: "进入最后一轮",
    game_ended: "本局结束"
  };
  return titles[kind];
}

function presentationDetail(presentation: ActionEventPresentation) {
  if (presentation.kind === "magician_swap") {
    return `${presentation.actorHandCount ?? 0} 张 ↔ ${presentation.targetHandCount ?? 0} 张`;
  }
  if (presentation.kind === "magician_redraw") {
    return `重新抽取 ${presentation.cardCount ?? 0} 张`;
  }
  if (presentation.kind === "thief_steal") {
    return `转移 ${presentation.amount ?? 0} 枚金币`;
  }
  if (presentation.kind === "warlord_destroy") {
    return `${presentation.districtName ?? "建筑"} · 花费 ${presentation.cost ?? 0} 金币`;
  }
  if (presentation.kind === "take_gold") return `获得 ${presentation.amount ?? 0} 枚金币`;
  if (presentation.kind === "draw_cards" || presentation.kind === "draw_resolved") {
    return `${presentation.cardCount ?? 0} 张建筑牌`;
  }
  if (presentation.kind === "build_district") return presentation.districtName ?? "建筑";
  if (presentation.targetRoleId) {
    return `目标身份：${roleName(presentation.targetRoleId)}`;
  }
  return "";
}

function isNormalPresentation(kind: ActionEventPresentation["kind"]) {
  return [
    "role_lock", "take_gold", "draw_cards", "draw_resolved", "build_district",
    "turn_start", "crown_transfer", "final_round", "game_ended"
  ].includes(kind);
}

import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { VisibleGameState } from "@zy/shared";

type Point = { x: number; y: number };
type RouteGeometry = {
  width: number;
  height: number;
  source: Point;
  target: Point;
};

export function GameRoleCallTargetRoute(props: {
  gameState: VisibleGameState;
  tableRef: RefObject<HTMLElement | null>;
}) {
  const call = props.gameState.roleCallState;
  const targetPlayerId = props.gameState.phase === "ROLE_CALL" &&
    (call?.stage === "revealing" || call?.stage === "skipped")
    ? call.playerId
    : null;
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);

  useLayoutEffect(() => {
    if (!targetPlayerId || !props.tableRef.current) {
      setGeometry(null);
      return;
    }

    const updateGeometry = () => {
      const table = props.tableRef.current;
      if (!table) return;
      const tableRect = table.getBoundingClientRect();
      const roleCard = table.querySelector<HTMLElement>(".citadel-role-call__card");
      const playerRoot = [...table.querySelectorAll<HTMLElement>("[data-player-id]")]
        .find((element) => element.dataset.playerId === targetPlayerId);
      const playerAnchor = playerRoot?.querySelector<HTMLElement>(".citadel-player-mini__avatar-wrap") ??
        playerRoot?.querySelector<HTMLElement>(".citadel-player-mini") ??
        playerRoot;
      const source = elementCenter(roleCard, tableRect);
      const target = elementCenter(playerAnchor ?? null, tableRect);
      if (!source || !target) {
        setGeometry(null);
        return;
      }
      setGeometry({ width: tableRect.width, height: tableRect.height, source, target });
    };

    updateGeometry();
    window.addEventListener("resize", updateGeometry);
    return () => window.removeEventListener("resize", updateGeometry);
  }, [props.tableRef, targetPlayerId]);

  if (!targetPlayerId || !call || !geometry) return null;

  return (
    <aside
      className={`citadel-role-call-route citadel-role-call-route--${call.stage}`}
      data-role-call-route-player-id={targetPlayerId}
      data-role-call-route-stage={call.stage}
      aria-hidden="true"
    >
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none">
        <path d={curvedPath(geometry.source, geometry.target)} pathLength="1" />
      </svg>
    </aside>
  );
}

function elementCenter(element: HTMLElement | null, rootRect: DOMRect): Point | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - rootRect.left + rect.width / 2,
    y: rect.top - rootRect.top + rect.height / 2
  };
}

function curvedPath(source: Point, target: Point) {
  const controlX = (source.x + target.x) / 2;
  const controlY = Math.min(source.y, target.y) - Math.max(36, Math.abs(target.x - source.x) * 0.07);
  return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
}

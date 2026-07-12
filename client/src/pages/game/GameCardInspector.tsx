import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { roleName, roleOrder, skillHint } from "./gameText";
import type { CardInspectorPlacement, CardInspectorSize } from "./cardInspectorData";

const OPEN_DELAY_MS = 80;
const CLOSE_DELAY_MS = 50;
const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 14;

type Anchor = {
  rect: DOMRect;
  placement: CardInspectorPlacement;
  size: CardInspectorSize;
  contextRect?: DOMRect;
};

type RolePreview = {
  kind: "role";
  roleId: string | null;
};

type DistrictPreview = {
  kind: "district";
  name: string;
  cost: number;
  score: number;
  color: "blue" | "green" | "red" | "yellow" | "purple";
  description: string;
};

type InspectorState = {
  anchor: Anchor;
  card: RolePreview | DistrictPreview;
};

export function GameCardInspector(props: { rootRef: RefObject<HTMLElement | null> }) {
  const [inspector, setInspector] = useState<InspectorState | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const root = props.rootRef.current;
    if (!root) {
      return;
    }

    const clearOpenTimer = () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    };
    const clearCloseTimer = () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    const openFor = (element: HTMLElement, immediate = false) => {
      clearOpenTimer();
      clearCloseTimer();
      if (activeElementRef.current === element && inspector) {
        return;
      }
      activeElementRef.current = element;
      const show = () => {
        const card = readPreview(element);
        if (!card || activeElementRef.current !== element) {
          return;
        }
        setInspector({
          card,
          anchor: {
            rect: element.getBoundingClientRect(),
            placement: readPlacement(element),
            size: readSize(element),
            contextRect: element.closest<HTMLElement>(".citadel-hand-zone")?.getBoundingClientRect()
          }
        });
      };
      if (immediate) {
        show();
      } else {
        openTimerRef.current = window.setTimeout(show, OPEN_DELAY_MS);
      }
    };
    const scheduleClose = (element?: HTMLElement) => {
      if (element && activeElementRef.current !== element) {
        return;
      }
      clearOpenTimer();
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        activeElementRef.current = null;
        setInspector(null);
      }, CLOSE_DELAY_MS);
    };
    const cardFromEvent = (event: Event) => {
      const target = event.target;
      return target instanceof Element
        ? target.closest<HTMLElement>("[data-card-inspector]")
        : null;
    };
    const onPointerOver = (event: PointerEvent) => {
      const card = cardFromEvent(event);
      if (card && root.contains(card)) {
        openFor(card);
      }
    };
    const onPointerOut = (event: PointerEvent) => {
      const card = cardFromEvent(event);
      if (!card) {
        return;
      }
      if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) {
        return;
      }
      scheduleClose(card);
    };
    const onFocusIn = (event: FocusEvent) => {
      const card = cardFromEvent(event);
      if (card && root.contains(card)) {
        openFor(card, true);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const card = cardFromEvent(event);
      if (card) {
        scheduleClose(card);
      }
    };
    const closeImmediately = () => {
      clearOpenTimer();
      clearCloseTimer();
      activeElementRef.current = null;
      setInspector(null);
    };

    root.addEventListener("pointerover", onPointerOver);
    root.addEventListener("pointerout", onPointerOut);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", closeImmediately);
    window.addEventListener("scroll", closeImmediately, true);
    return () => {
      clearOpenTimer();
      clearCloseTimer();
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", closeImmediately);
      window.removeEventListener("scroll", closeImmediately, true);
    };
  }, [inspector, props.rootRef]);

  const position = useMemo(
    () => inspector ? getInspectorPosition(inspector.anchor, inspector.card) : null,
    [inspector]
  );

  if (!inspector || !position) {
    return null;
  }

  const isHandPreview = inspector.card.kind === "district" && inspector.anchor.placement === "hand";
  const handInspectorWidth = isHandPreview && "width" in position ? position.width : undefined;
  const sizeClass = inspector.anchor.size === "table-small" ? "citadel-card-inspector--table-small" : "";

  return (
    <aside
      aria-label="卡牌详情"
      className={`citadel-card-inspector citadel-card-inspector--${inspector.card.kind} ${sizeClass} ${isHandPreview ? `citadel-card-inspector--hand is-${position.side ?? "left"}` : ""}`}
      role="status"
      style={{ left: position.left, top: position.top, width: handInspectorWidth }}
    >
      {isHandPreview
        ? <HandDistrictDescription card={inspector.card as DistrictPreview} />
        : inspector.card.kind === "role"
        ? <RoleInspectorCard card={inspector.card} />
        : <DistrictInspectorCard card={inspector.card} />}
    </aside>
  );
}

function HandDistrictDescription(props: { card: DistrictPreview }) {
  return (
    <div className="citadel-card-inspector__description citadel-card-inspector__hand-description">
      <header>
        <strong>{props.card.name}</strong>
      </header>
      <p>{props.card.description}</p>
    </div>
  );
}

function RoleInspectorCard(props: { card: RolePreview }) {
  const hidden = !props.card.roleId;
  return (
    <>
      <div className={`citadel-card-inspector__card citadel-card-inspector__role ${hidden ? "is-hidden" : `is-${props.card.roleId}`}`}>
        <span className="citadel-card-inspector__role-order">
          {hidden ? "?" : roleOrder(props.card.roleId)}
        </span>
        <span className="citadel-card-inspector__art" aria-hidden="true">
          {hidden ? "?" : roleName(props.card.roleId).slice(0, 1)}
        </span>
        <strong>{roleName(props.card.roleId)}</strong>
        <small>{hidden ? "身份尚未公开" : "身份牌"}</small>
      </div>
      <InspectorDescription
        title={hidden ? "身份信息" : "技能说明"}
        text={hidden ? "该玩家的身份尚未公开。" : skillHint(props.card.roleId)}
      />
    </>
  );
}

function DistrictInspectorCard(props: { card: DistrictPreview }) {
  return (
    <>
      <div className={`citadel-card-inspector__card citadel-card-inspector__district is-${props.card.color}`}>
        <span className="citadel-card-inspector__cost" aria-label={`费用 ${props.card.cost}`}>
          {props.card.cost}
        </span>
        <span className="citadel-card-inspector__score" aria-label={`分数 ${props.card.score}`}>
          {props.card.score}
        </span>
        <span className="citadel-card-inspector__art" aria-hidden="true">
          {props.card.name.slice(0, 1)}
        </span>
        <strong>{props.card.name}</strong>
        <small>{districtColorLabel(props.card.color)}建筑</small>
      </div>
      <InspectorDescription title="建筑说明" text={props.card.description} />
    </>
  );
}

function InspectorDescription(props: { title: string; text: string }) {
  return (
    <div className="citadel-card-inspector__description">
      <strong>{props.title}</strong>
      <p>{props.text}</p>
    </div>
  );
}

function readPreview(element: HTMLElement): RolePreview | DistrictPreview | null {
  if (element.dataset.cardInspector === "role") {
    return { kind: "role", roleId: element.dataset.inspectorRoleId || null };
  }
  if (element.dataset.cardInspector !== "district") {
    return null;
  }
  const color = element.dataset.inspectorColor;
  if (!isDistrictColor(color)) {
    return null;
  }
  return {
    kind: "district",
    name: element.dataset.inspectorName || "未命名建筑",
    cost: Number(element.dataset.inspectorCost || 0),
    score: Number(element.dataset.inspectorScore || 0),
    color,
    description: element.dataset.inspectorDescription || "普通建筑，没有额外效果。"
  };
}

function readPlacement(element: HTMLElement): CardInspectorPlacement {
  const placement = element.dataset.inspectorPlacement;
  return placement === "top" || placement === "bottom" || placement === "left" || placement === "right" || placement === "hand"
    ? placement
    : "auto";
}

function readSize(element: HTMLElement): CardInspectorSize {
  return element.dataset.inspectorSize === "table-small" ? "table-small" : "standard";
}

function getInspectorPosition(anchor: Anchor, card: RolePreview | DistrictPreview) {
  const kind = card.kind;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const compact = viewportHeight <= 720 || viewportWidth <= 1100;
  const tableSmall = anchor.size === "table-small";
  const width = tableSmall
    ? compact ? (kind === "role" ? 91 : 94) : (kind === "role" ? 98 : 100)
    : compact ? (kind === "role" ? 116 : 120) : (kind === "role" ? 128 : 132);
  const height = tableSmall
    ? compact ? (kind === "role" ? 198 : 202) : (kind === "role" ? 214 : 217)
    : compact ? (kind === "role" ? 238 : 246) : (kind === "role" ? 268 : 276);
  const clampLeft = (value: number) => clamp(value, VIEWPORT_GAP, viewportWidth - width - VIEWPORT_GAP);
  const clampTop = (value: number) => clamp(value, VIEWPORT_GAP, viewportHeight - height - VIEWPORT_GAP);

  if (anchor.placement === "hand") {
    const handWidth = card.kind === "district"
      ? handInspectorWidth(card.description, compact)
      : compact ? 116 : 128;
    const handGap = compact ? 10 : 12;
    const left = anchor.rect.left - handWidth - handGap;
    const right = anchor.rect.right + handGap;
    const anchorCenter = anchor.rect.left + anchor.rect.width / 2;
    const contextCenter = anchor.contextRect
      ? anchor.contextRect.left + anchor.contextRect.width / 2
      : viewportWidth / 2;
    const preferLeft = anchorCenter <= contextCenter;
    const leftFits = left >= VIEWPORT_GAP;
    const rightFits = right + handWidth <= viewportWidth - VIEWPORT_GAP;
    const useLeft = preferLeft ? leftFits || !rightFits : !rightFits && leftFits;
    return {
      left: useLeft
        ? left
        : clamp(right, VIEWPORT_GAP, viewportWidth - handWidth - VIEWPORT_GAP),
      top: clamp(anchor.rect.top + anchor.rect.height / 2, VIEWPORT_GAP + 24, viewportHeight - VIEWPORT_GAP - 24),
      side: useLeft ? "left" : "right",
      width: handWidth
    };
  }

  if (anchor.placement === "top") {
    const top = anchor.rect.top - height - ANCHOR_GAP;
    if (top >= VIEWPORT_GAP) {
      return {
        left: clampLeft(anchor.rect.left + anchor.rect.width / 2 - width / 2),
        top
      };
    }
  }
  if (anchor.placement === "bottom") {
    const top = anchor.rect.bottom + ANCHOR_GAP;
    if (top + height <= viewportHeight - VIEWPORT_GAP) {
      return {
        left: clampLeft(anchor.rect.left + anchor.rect.width / 2 - width / 2),
        top
      };
    }
  }

  if (anchor.placement === "right") {
    const right = anchor.rect.right + ANCHOR_GAP;
    if (right + width <= viewportWidth - VIEWPORT_GAP) {
      return { left: right, top: clampTop(anchor.rect.bottom - height) };
    }
  }
  if (anchor.placement === "left") {
    const left = anchor.rect.left - width - ANCHOR_GAP;
    if (left >= VIEWPORT_GAP) {
      return { left, top: clampTop(anchor.rect.bottom - height) };
    }
  }

  const right = anchor.rect.right + ANCHOR_GAP;
  if (right + width <= viewportWidth - VIEWPORT_GAP) {
    return {
      left: right,
      top: clampTop(anchor.rect.bottom - height)
    };
  }
  const left = anchor.rect.left - width - ANCHOR_GAP;
  if (left >= VIEWPORT_GAP) {
    return {
      left,
      top: clampTop(anchor.rect.bottom - height)
    };
  }
  return {
    left: clampLeft(anchor.rect.left + anchor.rect.width / 2 - width / 2),
    top: clampTop(anchor.rect.bottom + ANCHOR_GAP)
  };
}

function handInspectorWidth(description: string, compact: boolean) {
  const length = Array.from(description.trim()).length;
  if (compact) {
    if (length <= 8) return 112;
    if (length <= 20) return 140;
    if (length <= 36) return 164;
    return 190;
  }
  if (length <= 8) return 126;
  if (length <= 20) return 154;
  if (length <= 36) return 184;
  return 214;
}

function districtColorLabel(color: DistrictPreview["color"]) {
  return {
    blue: "宗教",
    green: "商业",
    red: "军事",
    yellow: "贵族",
    purple: "特殊"
  }[color];
}

function isDistrictColor(value: string | undefined): value is DistrictPreview["color"] {
  return value === "blue" || value === "green" || value === "red" || value === "yellow" || value === "purple";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

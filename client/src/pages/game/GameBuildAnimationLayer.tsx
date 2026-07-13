import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";
import type { BuildAnimationRect, BuildAnimationTransaction } from "./useBuildAnimationTransactions";

const BUILD_FLIGHT_MS = 1_000;
const LATE_ENTRY_MS = 520;
const BUILD_RETURN_MS = 620;

export function GameBuildAnimationLayer(props: {
  tableRef: RefObject<HTMLElement | null>;
  transactions: BuildAnimationTransaction[];
  onFinish: (transactionId: string, outcome: "success" | "failure") => void;
}) {
  if (props.transactions.length === 0) {
    return null;
  }

  return (
    <aside className="citadel-build-animation-layer" aria-hidden="true">
      {props.transactions.map((transaction) => (
        <BuildFlight
          key={transaction.id}
          tableRef={props.tableRef}
          transaction={transaction}
          onFinish={props.onFinish}
        />
      ))}
    </aside>
  );
}

function BuildFlight(props: {
  tableRef: RefObject<HTMLElement | null>;
  transaction: BuildAnimationTransaction;
  onFinish: (transactionId: string, outcome: "success" | "failure") => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const directionRef = useRef<"outbound" | "waiting" | "returning">("outbound");
  const reducedMotionRef = useRef(false);
  const finishedRef = useRef(false);
  const statusRef = useRef(props.transaction.status);
  const geometryRef = useRef<{ source: BuildAnimationRect; target: BuildAnimationRect } | null>(null);
  const finishRef = useRef(props.onFinish);

  statusRef.current = props.transaction.status;
  finishRef.current = props.onFinish;

  useLayoutEffect(() => {
    const table = props.tableRef.current;
    const element = cardRef.current;
    if (!table || !element) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedMotionRef.current = reducedMotion;

    const settle = (outcome: "success" | "failure") => {
      if (finishedRef.current || cancelled) {
        return;
      }
      finishedRef.current = true;
      finishRef.current(props.transaction.id, outcome);
    };

    const start = (targetRect: BuildAnimationRect) => {
      if (cancelled) {
        return;
      }
      const tableRect = table.getBoundingClientRect();
      const source = props.transaction.sourceRect;
      geometryRef.current = { source, target: targetRect };
      element.style.width = `${targetRect.width}px`;
      element.style.height = `${targetRect.height}px`;

      const sourceTransform = transformForRect(targetRect, source, tableRect);
      const targetTransform = transformForRect(targetRect, targetRect, tableRect);
      element.dataset.buildAnimationReady = "true";
      if (reducedMotion) {
        element.style.transform = targetTransform;
        element.style.opacity = "1";
        directionRef.current = "waiting";
        if (statusRef.current !== "pending") {
          settle(statusRef.current === "success" ? "success" : "failure");
        }
        return;
      }

      const duration = props.transaction.variant === "late-entry" ? LATE_ENTRY_MS : BUILD_FLIGHT_MS;
      const animation = element.animate(
        [
          { opacity: 1, transform: sourceTransform, offset: 0 },
          { opacity: 1, transform: `${intermediateTransform(targetRect, source, targetRect, tableRect)} rotate(-2deg)`, offset: 0.72 },
          { opacity: 1, transform: targetTransform, offset: 1 }
        ],
        { duration, easing: "cubic-bezier(.2,.76,.2,1)", fill: "forwards" }
      );
      animationRef.current = animation;
      directionRef.current = "outbound";
      animation.onfinish = () => {
        if (directionRef.current === "returning") {
          settle("failure");
          return;
        }
        directionRef.current = "waiting";
        if (statusRef.current === "success") {
          settle("success");
        } else if (statusRef.current === "failure") {
          startReturnAnimation(element, sourceTransform, settle, animationRef, directionRef);
        }
      };

      if (statusRef.current === "failure") {
        window.requestAnimationFrame(() => {
          if (
            !cancelled &&
            animation.playState === "running" &&
            directionRef.current === "outbound"
          ) {
            startReturnAnimation(element, sourceTransform, settle, animationRef, directionRef);
          }
        });
      }
    };

    let attempts = 0;
    const measureTarget = () => {
      if (cancelled) {
        return;
      }
      const target = findTarget(table, props.transaction);
      if (target) {
        start(target);
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        frameId = window.requestAnimationFrame(measureTarget);
        return;
      }
      const fallback = fallbackTarget(table, props.transaction);
      if (fallback) {
        start(fallback);
      } else {
        settle(props.transaction.status === "failure" ? "failure" : "success");
      }
    };

    frameId = window.requestAnimationFrame(measureTarget);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      animationRef.current?.cancel();
    };
  }, [props.tableRef, props.transaction.actorPlayerId, props.transaction.card.id, props.transaction.id, props.transaction.sourceRect, props.transaction.variant]);

  useEffect(() => {
    const element = cardRef.current;
    const animation = animationRef.current;
    const geometry = geometryRef.current;
    const table = props.tableRef.current;
    if (!element || !geometry || !table || finishedRef.current) {
      return;
    }

    const settle = (outcome: "success" | "failure") => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      finishRef.current(props.transaction.id, outcome);
    };
    const tableRect = table.getBoundingClientRect();
    const sourceTransform = transformForRect(geometry.target, geometry.source, tableRect);
    const targetTransform = transformForRect(geometry.target, geometry.target, tableRect);

    if (props.transaction.status === "failure") {
      if (reducedMotionRef.current) {
        settle("failure");
        return;
      }
      if (directionRef.current === "outbound" && animation?.playState === "running") {
        startReturnAnimation(element, sourceTransform, settle, animationRef, directionRef);
      } else if (directionRef.current === "waiting") {
        startReturnAnimation(element, sourceTransform, settle, animationRef, directionRef);
      }
      return;
    }

    if (props.transaction.status === "success") {
      if (reducedMotionRef.current) {
        settle("success");
        return;
      }
      if (directionRef.current === "returning") {
        startForwardAnimation(element, targetTransform, settle, animationRef, directionRef);
      } else if (directionRef.current === "waiting") {
        settle("success");
      }
    }
  }, [props.tableRef, props.transaction.id, props.transaction.status]);

  const opponent = props.transaction.variant === "opponent";
  return (
    <div
      ref={cardRef}
      className={`citadel-build-flight-card citadel-build-flight-card--${props.transaction.card.color} ${opponent ? "is-opponent" : ""}`}
      data-build-animation-card-id={props.transaction.card.id}
      data-build-animation-status={props.transaction.status}
      data-build-source-left={props.transaction.sourceRect.left}
      data-build-source-top={props.transaction.sourceRect.top}
      data-build-source-width={props.transaction.sourceRect.width}
      data-build-source-height={props.transaction.sourceRect.height}
      {...cardFaceAttributes()}
    >
      <CardArtwork kind="district" cardId={props.transaction.card.id} alt={props.transaction.card.name} />
      <span>{props.transaction.card.cost}</span>
      <strong>{props.transaction.card.name}</strong>
      {opponent ? <i className="citadel-build-flight-card__back" /> : null}
    </div>
  );
}

function startReturnAnimation(
  element: HTMLElement,
  sourceTransform: string,
  settle: (outcome: "success" | "failure") => void,
  animationRef: { current: Animation | null },
  directionRef: { current: "outbound" | "waiting" | "returning" }
) {
  const currentTransform = visibleTransform(element, sourceTransform);
  animationRef.current?.cancel();
  const animation = element.animate(
    [
      { opacity: 1, transform: currentTransform },
      { opacity: 1, transform: sourceTransform }
    ],
    { duration: BUILD_RETURN_MS, easing: "cubic-bezier(.35,.05,.3,1)", fill: "forwards" }
  );
  animationRef.current = animation;
  directionRef.current = "returning";
  animation.onfinish = () => {
    if (directionRef.current === "returning") settle("failure");
  };
}

function startForwardAnimation(
  element: HTMLElement,
  targetTransform: string,
  settle: (outcome: "success" | "failure") => void,
  animationRef: { current: Animation | null },
  directionRef: { current: "outbound" | "waiting" | "returning" }
) {
  const currentTransform = visibleTransform(element, targetTransform);
  animationRef.current?.cancel();
  const animation = element.animate(
    [
      { opacity: 1, transform: currentTransform },
      { opacity: 1, transform: targetTransform }
    ],
    { duration: LATE_ENTRY_MS, easing: "cubic-bezier(.2,.76,.2,1)", fill: "forwards" }
  );
  animationRef.current = animation;
  directionRef.current = "outbound";
  animation.onfinish = () => {
    if (directionRef.current === "outbound") settle("success");
  };
}

function visibleTransform(element: HTMLElement, fallback: string) {
  const transform = getComputedStyle(element).transform;
  return transform && transform !== "none" ? transform : fallback;
}

function findTarget(table: HTMLElement, transaction: BuildAnimationTransaction): BuildAnimationRect | null {
  const district = findByDataValue(table, "data-district-card-id", transaction.card.id);
  const placeholder = findByDataValue(table, "data-build-target-id", transaction.card.id);
  return snapshotRect(district ?? placeholder);
}

function fallbackTarget(table: HTMLElement, transaction: BuildAnimationTransaction) {
  if (transaction.variant !== "opponent") {
    return snapshotRect(table.querySelector(".citadel-self-city__cards"));
  }
  const seat = [...table.querySelectorAll<HTMLElement>(".citadel-opponent-seat")]
    .find((candidate) => candidate.dataset.playerId === transaction.actorPlayerId);
  return snapshotRect(seat?.querySelector(".citadel-mini-city-row") ?? null);
}

function snapshotRect(element: Element | null): BuildAnimationRect | null {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function findByDataValue(root: HTMLElement, attribute: string, value: string) {
  return [...root.querySelectorAll<HTMLElement>(`[${attribute}]`)]
    .find((element) => element.getAttribute(attribute) === value) ?? null;
}

function transformForRect(base: BuildAnimationRect, destination: BuildAnimationRect, tableRect: DOMRect) {
  const scale = uniformScale(base, destination);
  const renderedWidth = base.width * scale;
  const renderedHeight = base.height * scale;
  const x = destination.left - tableRect.left + (destination.width - renderedWidth) / 2;
  const y = destination.top - tableRect.top + (destination.height - renderedHeight) / 2;
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

function intermediateTransform(
  base: BuildAnimationRect,
  source: BuildAnimationRect,
  target: BuildAnimationRect,
  tableRect: DOMRect
) {
  const progress = 0.72;
  const sourceCenterX = source.left + source.width / 2;
  const sourceCenterY = source.top + source.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const centerX = sourceCenterX + (targetCenterX - sourceCenterX) * progress;
  const centerY = sourceCenterY + (targetCenterY - sourceCenterY) * progress;
  const arc = Math.min(72, Math.max(24, Math.abs(target.left - source.left) * 0.08));
  const sourceScale = uniformScale(base, source);
  const targetScale = uniformScale(base, target);
  const scale = sourceScale + (targetScale - sourceScale) * progress;
  const x = centerX - tableRect.left - base.width * scale / 2;
  const y = centerY - tableRect.top - base.height * scale / 2 - arc;
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

function uniformScale(base: BuildAnimationRect, destination: BuildAnimationRect) {
  return Math.min(destination.width / base.width, destination.height / base.height);
}

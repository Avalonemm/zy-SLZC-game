import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ActionEventPayload, GameActionOrigin } from "@zy/shared";
import { presentationTiming } from "./presentationTiming";

type NoticeItem = {
  event: ActionEventPayload;
  duration: number;
  timeoutId: number;
};

export function GameActionNoticeLayer(props: { actionEvents: ActionEventPayload[] }) {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const seenIds = useRef(new Set<string>());
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const incoming = [...props.actionEvents]
      .reverse()
      .filter((event) => !seenIds.current.has(event.id));

    for (const event of incoming) {
      seenIds.current.add(event.id);
      const duration = presentationTiming(event.presentation?.kind).noticeMs;
      const timeoutId = window.setTimeout(() => {
        timers.current.delete(timeoutId);
        setItems((current) => current.filter((item) => item.event.id !== event.id));
      }, duration);
      timers.current.add(timeoutId);
      setItems((current) => {
        const eventKey = `${event.type}:${event.actorPlayerId ?? "system"}`;
        const withoutDuplicate = current.filter((item) =>
          `${item.event.type}:${item.event.actorPlayerId ?? "system"}` !== eventKey
        );
        return [...withoutDuplicate, { event, timeoutId, duration }].slice(-2);
      });
    }
  }, [props.actionEvents]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current.clear();
  }, []);

  if (items.length === 0) return null;

  return (
    <aside className="citadel-action-notices" aria-live="polite" aria-label="最近行动结果">
      {items.map(({ event, duration }) => {
        const originLabel = automaticOriginLabel(event.origin);
        return (
          <article
            key={event.id}
            className={originLabel ? "is-automatic" : ""}
            style={{ "--action-notice-duration": `${duration}ms` } as CSSProperties}
          >
            <small>
              {event.presentation ? presentationLabel(event.presentation.kind) : "行动结果"}
              {originLabel && <b>{originLabel}</b>}
            </small>
            <strong>{event.message}</strong>
          </article>
        );
      })}
    </aside>
  );
}

function automaticOriginLabel(origin?: GameActionOrigin) {
  if (origin === "timeout") return "系统·超时";
  if (origin === "offline") return "系统·离线";
  if (origin === "rule") return "系统·规则";
  if (origin === "bot") return "人机";
  return "";
}

function presentationLabel(kind: NonNullable<ActionEventPayload["presentation"]>["kind"]) {
  const labels: Record<typeof kind, string> = {
    assassin_mark: "刺客出手",
    assassin_skip: "刺杀生效",
    thief_mark: "盗贼锁定",
    thief_steal: "金币被盗",
    magician_swap: "交换手牌",
    magician_redraw: "弃牌重抽",
    warlord_destroy: "军阀破坏",
    role_lock: "身份锁定",
    take_gold: "获取金币",
    draw_cards: "抽取建筑牌",
    draw_resolved: "抽牌完成",
    build_district: "建造完成",
    turn_start: "回合开始",
    crown_transfer: "王冠转移",
    final_round: "最后一轮",
    game_ended: "本局结束"
  };
  return labels[kind];
}

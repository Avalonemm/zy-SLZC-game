import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ActionEventPayload, VisibleGameState } from "@zy/shared";
import { roleName } from "./gameText";
import { presentationTiming } from "./presentationTiming";

type NoticeItem = {
  event: ActionEventPayload;
  text: string;
  duration: number;
  critical: boolean;
  group: string;
};

const hiddenEventTypes = new Set([
  "end_turn",
  "turn_start",
  "role_action_start",
  "role_selection_start",
  "role_selected"
]);

export function GameActionNoticeLayer(props: {
  actionEvents: ActionEventPayload[];
  gameState: VisibleGameState;
}) {
  const [queue, setQueue] = useState<NoticeItem[]>([]);
  const seenIds = useRef(new Set<string>());
  const recentGroups = useRef(new Map<string, number>());
  const active = queue[0] ?? null;

  useEffect(() => {
    const incoming = [...props.actionEvents]
      .reverse()
      .filter((event) => !seenIds.current.has(event.id));
    const additions: NoticeItem[] = [];

    for (const event of incoming) {
      seenIds.current.add(event.id);
      const item = createNoticeItem(event, props.gameState);
      if (!item) continue;
      const lastShownAt = recentGroups.current.get(item.group) ?? 0;
      if (!item.critical && Date.now() - lastShownAt < 2_800) continue;
      recentGroups.current.set(item.group, Date.now());
      additions.push(item);
    }

    if (additions.length === 0) return;
    setQueue((current) => {
      let next = [...current];
      for (const item of additions) {
        if (item.critical) {
          if (next[0] && !next[0].critical) next = [];
          next.push(item);
          continue;
        }
        if (next.some((entry) => entry.critical)) continue;
        next = [item];
      }
      return next.slice(0, 6);
    });
  }, [props.actionEvents, props.gameState]);

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => {
      setQueue((current) => current.filter((item) => item.event.id !== active.event.id));
    }, active.duration);
    return () => window.clearTimeout(timeoutId);
  }, [active]);

  if (!active) return null;

  return (
    <aside
      className="citadel-action-notices"
      aria-live={active.critical ? "assertive" : "polite"}
      aria-label="最近行动结果"
    >
      <article
        className={`${active.critical ? "is-critical" : ""} ${active.event.origin && active.event.origin !== "player" ? "is-automatic" : ""}`}
        style={{ "--action-notice-duration": `${active.duration}ms` } as CSSProperties}
      >
        <strong>{active.text}</strong>
      </article>
    </aside>
  );
}

function createNoticeItem(
  event: ActionEventPayload,
  gameState: VisibleGameState
): NoticeItem | null {
  if (hiddenEventTypes.has(event.type)) return null;
  const presentation = event.presentation;
  const actorName = playerName(gameState, presentation?.actorPlayerId ?? event.actorPlayerId);
  const targetName = playerName(gameState, presentation?.targetPlayerId ?? event.targetPlayerId);
  const kind = presentation?.kind;
  const group = kind === "draw_cards" || kind === "draw_resolved"
    ? `draw:${presentation?.actorPlayerId ?? event.actorPlayerId ?? "system"}`
    : `${kind ?? event.type}:${event.actorPlayerId ?? "system"}`;
  const critical = isCriticalEvent(event);
  let text: string | null = null;

  switch (kind) {
    case "assassin_mark":
      text = `刺客锁定了${roleName(presentation?.targetRoleId ?? null)}`;
      break;
    case "assassin_skip":
      text = `${targetName}被刺杀，本轮跳过`;
      break;
    case "thief_mark":
      text = `盗贼锁定了${roleName(presentation?.targetRoleId ?? null)}`;
      break;
    case "thief_steal":
      text = (presentation?.amount ?? 0) > 0
        ? `盗贼偷走了${targetName}的${presentation?.amount}枚金币`
        : `盗贼没有从${targetName}身上偷到金币`;
      break;
    case "magician_swap":
      text = `魔术师与${targetName}交换了手牌`;
      break;
    case "magician_redraw":
      text = `魔术师重新抽取了${presentation?.cardCount ?? 0}张牌`;
      break;
    case "role_income":
      text = `${actorName}获得${presentation?.amount ?? 0}枚职业收入`;
      break;
    case "architect_bonus":
      text = `${actorName}抽取额外卡牌，本轮可建造${presentation?.maxBuilds ?? 3}次`;
      break;
    case "bishop_guard":
      text = `${actorName}的城市受到主教保护`;
      break;
    case "queen_income":
      text = `${actorName}与国王相邻，获得${presentation?.amount ?? 3}枚金币`;
      break;
    case "warlord_destroy":
      text = `${actorName}破坏了${presentation?.districtName ?? "一座建筑"}`;
      break;
    case "take_gold":
      text = `${actorName}获得了金币`;
      break;
    case "draw_cards":
    case "draw_resolved":
      text = `${actorName}抽取了卡牌`;
      break;
    case "build_district":
      text = `${actorName}建造了${presentation?.districtName ?? "建筑"}`;
      break;
    case "crown_transfer":
      text = `王冠转移至${targetName}`;
      break;
    case "final_round":
      text = `${actorName}完成城市，进入最后结算轮`;
      break;
    case "game_ended":
      text = "本局结束，正在结算";
      break;
  }

  if (!text && event.origin === "timeout") {
    text = `${actorName}超时，系统已自动处理`;
  } else if (!text && event.origin === "offline") {
    text = "已自动跳过离线玩家";
  }
  if (!text) return null;

  return {
    event,
    text,
    duration: Math.max(critical ? 2_200 : 1_800, presentationTiming(kind).noticeMs),
    critical,
    group
  };
}

function playerName(gameState: VisibleGameState, playerId?: string) {
  return gameState.players.find((player) => player.id === playerId)?.name ?? "玩家";
}

function isCriticalEvent(event: ActionEventPayload) {
  if (event.origin === "timeout" || event.origin === "offline") return true;
  return [
    "assassin_mark",
    "assassin_skip",
    "thief_mark",
    "thief_steal",
    "magician_swap",
    "magician_redraw",
    "role_income",
    "architect_bonus",
    "bishop_guard",
    "queen_income",
    "warlord_destroy",
    "final_round",
    "game_ended"
  ].includes(event.presentation?.kind ?? "");
}

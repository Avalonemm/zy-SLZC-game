import { useEffect, useRef } from "react";
import type {
  ActionEventPayload,
  ActionEventPresentation,
  RoomState,
  VisibleGameState
} from "@zy/shared";
import { useAudio } from "./AudioProvider";
import type { AudioCueId, AudioScene } from "./audioTypes";

const openingObjectiveMs = 3_000;
const openingRouletteEndMs = 7_500;
const openingTickMs = 600;

export function useGameAudio(input: {
  actionEvents: ActionEventPayload[];
  gameState: VisibleGameState | null;
  roomState: RoomState | null;
  selfPlayerId: string | null;
}) {
  const { playCue, setScene } = useAudio();
  const initialRoleCallKeyRef = useRef(roleCallKey(input.gameState));

  useEffect(() => {
    setScene(resolveScene(input.roomState, input.gameState));
  }, [input.gameState?.phase, input.roomState, setScene]);

  useEffect(() => {
    for (const event of input.actionEvents) {
      playActionEvent(event, input.gameState, input.selfPlayerId, playCue);
    }
  }, [input.actionEvents, input.gameState, input.selfPlayerId, playCue]);

  useEffect(() => {
    const key = roleCallKey(input.gameState);
    if (key === initialRoleCallKeyRef.current) return;
    initialRoleCallKeyRef.current = key;
    const call = input.gameState?.phase === "ROLE_CALL" ? input.gameState.roleCallState : null;
    if (!call) return;
    const cueId: AudioCueId | null = call.stage === "calling"
      ? "role-call"
      : call.stage === "revealing" || call.stage === "skipped"
        ? "role-reveal"
        : null;
    if (!cueId) return;
    playCue(cueId, {
      eventId: `role-call:${input.gameState?.roomId}:${call.startedAt}:${call.roleId}:${call.stage}:${cueId}`,
      pan: playerPan(input.gameState, input.selfPlayerId, call.playerId)
    });
  }, [input.gameState, input.selfPlayerId, playCue]);

  useEffect(() => {
    const timer = input.gameState?.phase === "CROWN_REVEAL" && input.gameState.turnTimer?.phase === "CROWN_REVEAL"
      ? input.gameState.turnTimer
      : null;
    if (!timer) return;
    const startedAt = new Date(timer.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return;
    const now = Date.now();
    const timeoutIds: number[] = [];

    for (let offset = openingObjectiveMs, index = 0; offset < openingRouletteEndMs; offset += openingTickMs, index += 1) {
      const delay = startedAt + offset - now;
      if (delay < -60) continue;
      timeoutIds.push(window.setTimeout(() => {
        playCue("crown-tick", { eventId: `crown:${timer.startedAt}:tick:${index}` });
      }, Math.max(0, delay)));
    }

    const landingDelay = startedAt + openingRouletteEndMs - now;
    if (landingDelay >= -60) {
      timeoutIds.push(window.setTimeout(() => {
        playCue("crown-land", { eventId: `crown:${timer.startedAt}:land` });
      }, Math.max(0, landingDelay)));
    }

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [input.gameState?.phase, input.gameState?.turnTimer?.startedAt, playCue]);
}

type PlayCue = ReturnType<typeof useAudio>["playCue"];

function playActionEvent(
  event: ActionEventPayload,
  gameState: VisibleGameState | null,
  selfPlayerId: string | null,
  playCue: PlayCue
) {
  const presentation = event.presentation;
  if (!presentation) return;
  const pan = playerPan(
    gameState,
    selfPlayerId,
    presentation.actorPlayerId ?? event.actorPlayerId ?? presentation.targetPlayerId ?? event.targetPlayerId
  );
  const play = (cueId: AudioCueId, suffix: string = cueId, intensity = 1) => {
    playCue(cueId, { eventId: `${event.id}:audio:${suffix}`, intensity, pan });
  };
  const playCoins = (amount = 1, suffix = "coins") => {
    play(amount > 1 ? "coin-multi" : "coin-single", suffix, amount >= 4 ? 1.08 : 1);
  };

  switch (presentation.kind) {
    case "take_gold":
      playCoins(presentation.amount, "take-gold");
      break;
    case "draw_cards":
      play("card-draw");
      break;
    case "draw_resolved":
    case "role_lock":
      play("card-place");
      break;
    case "build_district":
      play("build-place", "build", buildIntensity(presentation));
      break;
    case "assassin_mark":
      play("assassin-mark");
      break;
    case "assassin_skip":
      play("assassin-skip");
      break;
    case "thief_mark":
      play("role-thief");
      break;
    case "thief_steal":
      play("role-thief", "thief");
      if ((presentation.amount ?? 0) > 0) playCoins(presentation.amount, "stolen-coins");
      break;
    case "magician_swap":
      play("role-magician", "magician");
      play("card-place", "swap-cards", 0.72);
      break;
    case "magician_redraw":
      play("role-magician", "magician");
      play("card-draw", "redraw-cards", 0.76);
      break;
    case "role_income":
      playRoleCue(presentation.roleId, play);
      if ((presentation.amount ?? 0) > 0) playCoins(presentation.amount, "income-coins");
      break;
    case "architect_bonus":
      play("role-architect");
      play("card-draw", "bonus-cards", 0.72);
      break;
    case "bishop_guard":
      play("role-bishop");
      break;
    case "queen_income":
      play("role-queen");
      if ((presentation.amount ?? 0) > 0) playCoins(presentation.amount, "queen-coins");
      break;
    case "warlord_destroy":
      play("warlord-destroy");
      break;
    case "crown_transfer":
      play("crown-land", "transfer");
      break;
    case "game_ended":
      play("result-end", "game-ended");
      break;
    case "final_round":
    case "turn_start":
      // Both are intentionally silent. `game_ended` is the only ending cue.
      break;
  }
}

function playRoleCue(roleId: string | undefined, play: (cueId: AudioCueId, suffix?: string, intensity?: number) => void) {
  const cueByRole: Partial<Record<string, AudioCueId>> = {
    architect: "role-architect",
    bishop: "role-bishop",
    king: "role-king",
    merchant: "role-merchant",
    queen: "role-queen"
  };
  const cueId = roleId ? cueByRole[roleId] : undefined;
  if (cueId) play(cueId, `role-${roleId}`);
}

function resolveScene(roomState: RoomState | null, gameState: VisibleGameState | null): AudioScene {
  if (gameState?.phase === "ENDED") return "result";
  if (gameState) return "game";
  if (roomState) return "ready";
  return "lobby";
}

function roleCallKey(gameState: VisibleGameState | null) {
  const call = gameState?.phase === "ROLE_CALL" ? gameState.roleCallState : null;
  return call
    ? `${gameState?.roomId}:${call.startedAt}:${call.roleId}:${call.stage}`
    : null;
}

function buildIntensity(presentation: ActionEventPresentation) {
  const cost = presentation.cost ?? 1;
  if (cost >= 5) return 1.15;
  if (cost >= 3) return 1;
  return 0.82;
}

function playerPan(
  gameState: VisibleGameState | null,
  selfPlayerId: string | null,
  playerId: string | null | undefined
) {
  if (!gameState || !selfPlayerId || !playerId || gameState.players.length < 2) return 0;
  const selfIndex = gameState.players.findIndex((player) => player.id === selfPlayerId);
  const playerIndex = gameState.players.findIndex((player) => player.id === playerId);
  if (selfIndex < 0 || playerIndex < 0 || selfIndex === playerIndex) return 0;
  const count = gameState.players.length;
  let relativeIndex = playerIndex - selfIndex;
  if (relativeIndex > count / 2) relativeIndex -= count;
  if (relativeIndex < -count / 2) relativeIndex += count;
  return Math.max(-0.3, Math.min(0.3, relativeIndex / Math.max(1, Math.ceil(count / 2)) * 0.3));
}

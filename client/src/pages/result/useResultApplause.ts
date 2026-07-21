import { useCallback, useEffect, useState } from "react";
import type { ResultApplauseEventPayload, VisibleGameResultSummary } from "@zy/shared";
import { socket } from "../../socket/socketClient";

const applauseAnimationMs = 900;

export function useResultApplause(input: {
  roomCode: string;
  selfPlayerId: string | null;
  summary: VisibleGameResultSummary;
}) {
  const [counts, setCounts] = useState(input.summary.applauseCounts);
  const [applaudedTargetIds, setApplaudedTargetIds] = useState(
    input.summary.viewerApplaudedTargetIds
  );
  const [activeEventByTarget, setActiveEventByTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    setCounts(input.summary.applauseCounts);
    setApplaudedTargetIds(input.summary.viewerApplaudedTargetIds);
    setActiveEventByTarget({});
  }, [input.summary.resultId]);

  useEffect(() => {
    setCounts(input.summary.applauseCounts);
    setApplaudedTargetIds(input.summary.viewerApplaudedTargetIds);
  }, [input.summary.applauseCounts, input.summary.viewerApplaudedTargetIds]);

  useEffect(() => {
    const timers = new Map<string, number>();
    function handleApplause(event: ResultApplauseEventPayload) {
      if (event.roomCode !== input.roomCode) return;
      setCounts((current) => ({ ...current, [event.targetPlayerId]: event.totalCount }));
      if (event.senderPlayerId === input.selfPlayerId) {
        setApplaudedTargetIds((current) =>
          current.includes(event.targetPlayerId) ? current : [...current, event.targetPlayerId]
        );
      }
      setActiveEventByTarget((current) => ({ ...current, [event.targetPlayerId]: event.id }));
      const previous = timers.get(event.targetPlayerId);
      if (previous) window.clearTimeout(previous);
      timers.set(event.targetPlayerId, window.setTimeout(() => {
        setActiveEventByTarget((current) => {
          if (current[event.targetPlayerId] !== event.id) return current;
          const next = { ...current };
          delete next[event.targetPlayerId];
          return next;
        });
      }, applauseAnimationMs));
    }

    socket.on("result_applause_event", handleApplause);
    return () => {
      socket.off("result_applause_event", handleApplause);
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, [input.roomCode, input.selfPlayerId]);

  const sendApplause = useCallback((targetPlayerId: string) => {
    if (applaudedTargetIds.includes(targetPlayerId)) return;
    socket.emit("send_result_applause", {
      roomCode: input.roomCode,
      targetPlayerId
    });
  }, [applaudedTargetIds, input.roomCode]);

  return { activeEventByTarget, applaudedTargetIds, counts, sendApplause };
}

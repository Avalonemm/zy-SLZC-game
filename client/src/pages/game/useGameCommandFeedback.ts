import { useCallback, useEffect, useRef, useState } from "react";
import type { GameCommandAck, GameCommandResult } from "@zy/shared";

export type GameCommandFeedback = {
  id: number;
  kind: "error" | "info";
  message: string;
};

type SendGameCommand = (ack: GameCommandAck) => void;

const COMMAND_TIMEOUT_MS = 5_000;

export function useGameCommandFeedback() {
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<GameCommandFeedback | null>(null);
  const pendingRef = useRef<string | null>(null);
  const feedbackIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const finishCommand = useCallback((result: GameCommandResult) => {
    clearTimer();
    pendingRef.current = null;
    setPendingCommand(null);
    if (!result.ok) {
      feedbackIdRef.current += 1;
      setFeedback({
        id: feedbackIdRef.current,
        kind: "error",
        message: result.error || "操作失败，请重试。"
      });
    }
  }, [clearTimer]);

  const runCommand = useCallback((key: string, label: string, send: SendGameCommand) => {
    if (pendingRef.current) {
      return false;
    }

    pendingRef.current = key;
    setPendingCommand(key);
    clearTimer();
    timeoutRef.current = window.setTimeout(() => {
      pendingRef.current = null;
      setPendingCommand(null);
      feedbackIdRef.current += 1;
      setFeedback({
        id: feedbackIdRef.current,
        kind: "error",
        message: `${label}未收到服务器确认，请检查连接后重试。`
      });
    }, COMMAND_TIMEOUT_MS);
    send(finishCommand);
    return true;
  }, [clearTimer, finishCommand]);

  const showError = useCallback((message: string) => {
    feedbackIdRef.current += 1;
    setFeedback({ id: feedbackIdRef.current, kind: "error", message });
  }, []);

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    dismissFeedback,
    feedback,
    pendingCommand,
    runCommand,
    showError
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameCommandAck, GameCommandResult } from "@zy/shared";

export type GameCommandFeedback = {
  id: number;
  commandKey?: string;
  kind: "error" | "info";
  message: string;
  reason?: "rejected" | "timeout";
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

  const runCommand = useCallback((key: string, label: string, send: SendGameCommand) => {
    if (pendingRef.current) {
      return false;
    }

    pendingRef.current = key;
    setPendingCommand(key);
    clearTimer();

    const finishCommand = (result: GameCommandResult) => {
      if (pendingRef.current !== key) {
        return;
      }
      clearTimer();
      pendingRef.current = null;
      setPendingCommand(null);
      if (!result.ok) {
        feedbackIdRef.current += 1;
        setFeedback({
          id: feedbackIdRef.current,
          commandKey: key,
          kind: "error",
          message: result.error || "操作失败，请重试。",
          reason: "rejected"
        });
      }
    };

    timeoutRef.current = window.setTimeout(() => {
      if (pendingRef.current !== key) {
        return;
      }
      pendingRef.current = null;
      setPendingCommand(null);
      timeoutRef.current = null;
      feedbackIdRef.current += 1;
      setFeedback({
        id: feedbackIdRef.current,
        commandKey: key,
        kind: "error",
        message: `${label}结果尚未确认，已恢复界面；请检查连接后重试。`,
        reason: "timeout"
      });
    }, COMMAND_TIMEOUT_MS);
    send(finishCommand);
    return true;
  }, [clearTimer]);

  const showError = useCallback((message: string) => {
    feedbackIdRef.current += 1;
    setFeedback({ id: feedbackIdRef.current, kind: "error", message, reason: "rejected" });
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

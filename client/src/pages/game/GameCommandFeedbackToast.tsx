import { useEffect } from "react";
import type { GameCommandFeedback } from "./useGameCommandFeedback";

export function GameCommandFeedbackToast(props: {
  feedback: GameCommandFeedback | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!props.feedback) return;
    const timeout = window.setTimeout(props.onDismiss, 4_000);
    return () => window.clearTimeout(timeout);
  }, [props.feedback, props.onDismiss]);

  if (!props.feedback) return null;

  return (
    <aside
      className={`citadel-command-feedback citadel-command-feedback--${props.feedback.kind}`}
      role="alert"
    >
      <strong>{props.feedback.kind === "error" ? "操作未完成" : "系统提示"}</strong>
      <span>{props.feedback.message}</span>
      <button type="button" aria-label="关闭提示" onClick={props.onDismiss}>×</button>
    </aside>
  );
}

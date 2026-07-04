import type { ReactNode } from "react";
import { GameButton } from "./GameButton";
import { GamePanel } from "./GamePanel";

type ConfirmDialogProps = {
  body: ReactNode;
  confirmLabel?: string;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onCancel}>
      <GamePanel className="fantasy-modal confirm-dialog" title={props.title}>
        <div className="modal-body" onClick={(event) => event.stopPropagation()}>
          <div className="confirm-dialog__body">{props.body}</div>
          <div className="confirm-dialog__actions">
            <GameButton variant="neutral" size="sm" onClick={props.onCancel}>
              取消
            </GameButton>
            <GameButton variant="secondary" size="sm" onClick={props.onConfirm}>
              {props.confirmLabel ?? "确认"}
            </GameButton>
          </div>
        </div>
      </GamePanel>
    </div>
  );
}

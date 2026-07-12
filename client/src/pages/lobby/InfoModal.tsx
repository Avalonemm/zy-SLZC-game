import type { ReactNode } from "react";
import { GamePanel } from "../../components/ui/GamePanel";

export function InfoModal(props: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <GamePanel className="fantasy-modal" title={props.title}>
        <button className="modal-close" type="button" onClick={props.onClose}>
          {"\u5173\u95ed"}
        </button>
        <div className="modal-body" onClick={(event) => event.stopPropagation()}>
          {props.children}
        </div>
      </GamePanel>
    </div>
  );
}

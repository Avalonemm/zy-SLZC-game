import { GameButton } from "../ui/GameButton";
import type { TestGameRole } from "./testGameTypes";

type RoleSelectionPanelProps = {
  availableRoles: TestGameRole[];
  isSelectingRole: boolean;
  selectionTurnPlayerName: string;
  onSelectRole: (roleId: string) => void;
};

export function RoleSelectionPanel(props: RoleSelectionPanelProps) {
  return (
    <section className="test-game-section">
      <h3>角色选择</h3>
      {props.isSelectingRole ? (
        <div className="test-action-grid">
          {props.availableRoles.map((role) => (
            <GameButton
              key={role.id}
              variant="secondary"
              size="sm"
              onClick={() => props.onSelectRole(role.id)}
            >
              {role.name}
            </GameButton>
          ))}
        </div>
      ) : (
        <p>当前选择玩家：{props.selectionTurnPlayerName}</p>
      )}
    </section>
  );
}

import type { RoleOption } from "./gameTypes";
import { RoleIdentityCard } from "./RoleIdentityCard";

export function GameRoleSelectionDock(props: {
  pending: boolean;
  remainingSeconds: number | null;
  roles: RoleOption[];
  onSelectRole: (roleId: string) => void;
}) {
  return (
    <section className="citadel-action-dock citadel-action-dock--roles citadel-role-selection-dock" aria-label="角色选择">
      <header className="citadel-role-selection-dock__header">
        <strong>选择你的身份</strong>
        {props.remainingSeconds !== null ? (
          <b className="citadel-role-selection-dock__timer" aria-label={`剩余 ${props.remainingSeconds} 秒`}>
            {props.remainingSeconds}
            <small>秒</small>
          </b>
        ) : null}
      </header>
      <div className="citadel-role-selection-dock__viewport">
        <div className="citadel-role-selection-dock__cards">
          {props.roles.map((role) => (
            <RoleIdentityCard
              caption="选择身份"
              className="citadel-role-choice citadel-role-selection-dock__card"
              disabled={props.pending}
              key={role.id}
              roleId={role.id}
              inspectorPlacement="top"
              inspectorSize="table-small"
              onClick={() => props.onSelectRole(role.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

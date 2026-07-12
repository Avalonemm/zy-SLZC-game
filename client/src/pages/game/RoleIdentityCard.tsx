import { roleName, roleOrder, skillHint } from "./gameText";
import { roleInspectorAttributes } from "./cardInspectorData";
import type { CardInspectorPlacement } from "./cardInspectorData";
import type { CardInspectorSize } from "./cardInspectorData";
import { CardArtwork, cardFaceAttributes } from "../../config/cardArt";

export function RoleIdentityCard(props: {
  className?: string;
  compact?: boolean;
  caption?: string;
  onClick?: () => void;
  roleId: string | null;
  self?: boolean;
  inspectorPlacement?: CardInspectorPlacement;
  inspectorSize?: CardInspectorSize;
}) {
  const hidden = !props.roleId;
  const name = roleName(props.roleId);
  const tooltip = skillHint(props.roleId);
  const order = roleOrder(props.roleId);
  const className = [
    "citadel-role-card",
    props.compact ? "citadel-role-card--compact" : "",
    hidden ? "citadel-role-card--hidden" : `citadel-role-card--${props.roleId}`,
    props.className ?? ""
  ].filter(Boolean).join(" ");
  const ariaLabel = `${props.self ? "\u4f60\u7684" : "\u73a9\u5bb6"}\u8eab\u4efd\u724c\uff1a${name}\u3002${tooltip}`;
  const inspectorAttributes = roleInspectorAttributes(
    props.roleId,
    props.inspectorPlacement ?? "auto",
    props.inspectorSize ?? "standard"
  );
  const body = (
    <>
      <CardArtwork kind="role" cardId={props.roleId} alt={name} />
      <span className="citadel-role-card__order">{hidden ? "?" : order}</span>
      <strong>{name}</strong>
      <small>{props.caption ?? (hidden ? "\u8eab\u4efd\u672a\u516c\u5f00" : "\u8eab\u4efd\u724c")}</small>
    </>
  );

  if (props.onClick) {
    return (
      <button className={className} type="button" onClick={props.onClick} aria-label={ariaLabel} {...cardFaceAttributes()} {...inspectorAttributes}>
        {body}
      </button>
    );
  }

  return (
    <div className={className} tabIndex={0} aria-label={ariaLabel} {...cardFaceAttributes()} {...inspectorAttributes}>
      {body}
    </div>
  );
}

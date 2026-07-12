import { visualAssets } from "../../config/visualAssets";

export type UtilityMenuIcon = "announcement" | "help" | "settings" | "exit";

const utilityMenuIconSources: Record<UtilityMenuIcon, string> = {
  announcement: visualAssets.icons.announcement,
  help: visualAssets.icons.help,
  settings: visualAssets.icons.settings,
  exit: visualAssets.icons.exit,
};

export function UtilityMenuButton(props: {
  icon: UtilityMenuIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="utility-menu-button" type="button" onClick={props.onClick} aria-label={props.label}>
      <img className="utility-menu-button__image" src={utilityMenuIconSources[props.icon]} alt="" />
      <span>{props.label}</span>
    </button>
  );
}

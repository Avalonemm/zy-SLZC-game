export type UtilityMenuIcon = "announcement" | "help" | "settings" | "exit";

const utilityMenuIconSources: Record<UtilityMenuIcon, string> = {
  announcement: "/assets/homepage-v1/icon-announcement.png",
  help: "/assets/homepage-v1/icon-help.png",
  settings: "/assets/homepage-v1/icon-settings.png",
  exit: "/assets/homepage-v1/icon-exit.svg",
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

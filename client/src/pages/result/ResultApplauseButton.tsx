import { visualAssets } from "../../config/visualAssets";

export function ResultApplauseButton(props: {
  active: boolean;
  count: number;
  disabled: boolean;
  pressed: boolean;
  playerName: string;
  onClick: () => void;
}) {
  const label = props.disabled && !props.pressed
    ? `不能为 ${props.playerName} 鼓掌`
    : props.pressed
      ? `已为 ${props.playerName} 鼓掌`
      : `为 ${props.playerName} 鼓掌`;
  return (
    <div className={`citadel-result-applause ${props.active ? "is-active" : ""}`}>
      <button
        aria-label={label}
        aria-pressed={props.pressed}
        disabled={props.disabled || props.pressed}
        type="button"
        onClick={props.onClick}
      >
        <img aria-hidden="true" alt="" src={visualAssets.result.applause} />
        <b>{props.count}</b>
      </button>
      {props.active ? <i aria-hidden="true">+1</i> : null}
    </div>
  );
}

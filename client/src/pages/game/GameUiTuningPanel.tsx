import { gameUiTuningBounds, type GameUiDensity, type GameUiTuningConfig } from "./gameUiTuning";

const labels: Record<Exclude<keyof GameUiTuningConfig, "showBounds">, string> = {
  selfCardWidth: "自己手牌宽度",
  handOverlap: "手牌叠放",
  handMaxWidth: "手牌区最大宽度",
  playerPlateWidth: "玩家名片宽度",
  playerPlateHeight: "玩家名片高度",
  avatarSize: "头像大小",
  opponentRoleWidth: "对手身份牌",
  opponentHandWidth: "对手手牌牌背",
  opponentDistrictWidth: "对手建筑牌",
  centerTop: "中央信息高度",
  cityTop: "自己建筑高度",
  actionTop: "操作区高度",
  selfBottom: "底部区域间距"
};

export function GameUiTuningPanel(props: {
  config: GameUiTuningConfig;
  density: GameUiDensity;
  onChange: (config: GameUiTuningConfig) => void;
  onReset: () => void;
}) {
  async function copyConfig() {
    await navigator.clipboard.writeText(JSON.stringify(props.config, null, 2));
  }

  return (
    <aside className="game-ui-tuning-panel" aria-label="UI 比例调音台">
      <header>
        <strong>UI 比例调音台</strong>
        <small>当前密度：{props.density}</small>
      </header>
      <div className="game-ui-tuning-panel__fields">
        {(Object.keys(gameUiTuningBounds) as Array<Exclude<keyof GameUiTuningConfig, "showBounds">>).map((key) => {
          const [min, max, step] = gameUiTuningBounds[key];
          return (
            <label key={key}>
              <span>{labels[key]} <b>{props.config[key]}</b></span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={props.config[key]}
                onChange={(event) => props.onChange({ ...props.config, [key]: Number(event.target.value) })}
              />
            </label>
          );
        })}
      </div>
      <label className="game-ui-tuning-panel__check">
        <input
          type="checkbox"
          checked={props.config.showBounds}
          onChange={(event) => props.onChange({ ...props.config, showBounds: event.target.checked })}
        />
        显示区域边界
      </label>
      <footer>
        <button type="button" onClick={props.onReset}>恢复当前密度默认值</button>
        <button type="button" onClick={copyConfig}>复制配置</button>
      </footer>
    </aside>
  );
}

import { gameUiTuningBounds, type GameUiDensity, type GameUiTuningConfig } from "./gameUiTuning";

type NumericKey = Exclude<keyof GameUiTuningConfig, "showBounds">;

const labels: Record<NumericKey, string> = {
  selfCardWidth: "自己手牌大小",
  handOverlap: "手牌叠放",
  handMaxWidth: "手牌安全宽度",
  playerPlateWidth: "玩家名片宽度",
  playerPlateHeight: "玩家名片高度",
  avatarSize: "头像大小",
  resourceIconSize: "资源图标大小",
  resourceFontSize: "资源数字大小",
  resourceGap: "资源间距",
  opponentRoleWidth: "对手身份牌",
  opponentHandWidth: "对手手牌牌背",
  opponentHandStackDepth: "对手牌堆厚度",
  opponentDistrictWidth: "对手建筑牌",
  actionDockWidth: "操作台宽度",
  actionDockRight: "操作台右边距",
  actionDockBottom: "操作台底边距",
  centerTop: "中央信息高度",
  cityTop: "自己的建筑高度",
  actionTop: "窄屏操作区高度",
  selfBottom: "底部区域间距"
};

const quickKeys: NumericKey[] = [
  "selfCardWidth",
  "handMaxWidth",
  "playerPlateWidth",
  "opponentHandWidth",
  "opponentDistrictWidth",
  "actionDockWidth"
];

const advancedKeys = (Object.keys(gameUiTuningBounds) as NumericKey[])
  .filter((key) => !quickKeys.includes(key));

export function GameUiTuningPanel(props: {
  config: GameUiTuningConfig;
  density: GameUiDensity;
  safetyMessages: string[];
  onChange: (config: GameUiTuningConfig) => void;
  onReset: () => void;
}) {
  async function copyConfig() {
    await navigator.clipboard.writeText(JSON.stringify(props.config, null, 2));
  }

  return (
    <aside className="game-ui-tuning-panel" aria-label="UI 比例调音台">
      <header>
        <strong>UI 比例调音台 V2</strong>
        <small>当前密度：{props.density}</small>
      </header>
      <section className="game-ui-tuning-panel__group">
        <b>快速调整</b>
        <div className="game-ui-tuning-panel__fields">
          {quickKeys.map((key) => <TuningField key={key} config={props.config} fieldKey={key} onChange={props.onChange} />)}
        </div>
      </section>
      <details className="game-ui-tuning-panel__group">
        <summary>高级微调</summary>
        <div className="game-ui-tuning-panel__fields">
          {advancedKeys.map((key) => <TuningField key={key} config={props.config} fieldKey={key} onChange={props.onChange} />)}
        </div>
      </details>
      {props.safetyMessages.length > 0 && (
        <div className="game-ui-tuning-panel__safety" role="status">
          <strong>安全布局已自动修正</strong>
          {props.safetyMessages.map((message) => <span key={message}>{message}</span>)}
        </div>
      )}
      <label className="game-ui-tuning-panel__check">
        <input
          type="checkbox"
          checked={props.config.showBounds}
          onChange={(event) => props.onChange({ ...props.config, showBounds: event.target.checked })}
        />
        显示区域边界
      </label>
      <footer>
        <button type="button" onClick={props.onReset}>恢复当前人数安全预设</button>
        <button type="button" onClick={copyConfig}>复制安全配置</button>
      </footer>
    </aside>
  );
}

function TuningField(props: {
  config: GameUiTuningConfig;
  fieldKey: NumericKey;
  onChange: (config: GameUiTuningConfig) => void;
}) {
  const [min, max, step] = gameUiTuningBounds[props.fieldKey];
  return (
    <label>
      <span>{labels[props.fieldKey]} <b>{props.config[props.fieldKey]}</b></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.config[props.fieldKey]}
        onChange={(event) => props.onChange({
          ...props.config,
          [props.fieldKey]: Number(event.target.value)
        })}
      />
    </label>
  );
}

import { gameUiTuningBounds, type GameUiTuningConfig } from "./gameUiTuning";

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
  opponentPlayerPlateWidth: "对手名片宽度",
  opponentPlayerPlateHeight: "对手名片高度",
  opponentAvatarSize: "对手头像大小",
  opponentResourceIconSize: "对手资源图标",
  opponentResourceFontSize: "对手资源数字",
  opponentResourceGap: "对手资源间距",
  opponentRoleWidth: "对手身份牌",
  opponentHandWidth: "对手手牌牌背",
  opponentHandStackDepth: "对手牌堆厚度",
  opponentDistrictWidth: "对手建筑牌",
  actionDockWidth: "操作台宽度",
  actionDockRight: "操作台向左位置",
  actionDockBottom: "操作台底边距",
  cardPreviewScale: "卡牌预览大小",
  activeRoleCardWidth: "行动身份牌大小",
  scoreStripScale: "顶部积分条大小",
  cornerDockLength: "日志聊天折叠长度",
  centerTop: "中央信息高度",
  cityTop: "自己的建筑高度",
  actionTop: "窄屏操作区高度",
  selfBottom: "底部区域间距"
};

const quickKeys: NumericKey[] = [
  "selfCardWidth",
  "handMaxWidth",
  "playerPlateWidth",
  "opponentPlayerPlateWidth",
  "opponentHandWidth",
  "opponentDistrictWidth",
  "actionDockWidth",
  "cardPreviewScale",
  "activeRoleCardWidth",
  "scoreStripScale",
  "cornerDockLength"
];

const advancedKeys = (Object.keys(gameUiTuningBounds) as NumericKey[])
  .filter((key) => !quickKeys.includes(key));

export function GameUiTuningPanel(props: {
  config: GameUiTuningConfig;
  effectiveConfig: GameUiTuningConfig;
  compactLayout: boolean;
  dirty: boolean;
  hasApplied: boolean;
  safetyMessages: string[];
  onChange: (config: GameUiTuningConfig) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const compactDisabledReasons: Partial<Record<NumericKey, string>> = props.compactLayout
    ? {
        actionDockRight: "紧凑布局使用居中的操作区，此位置项不适用。",
        actionDockBottom: "紧凑布局由“窄屏操作区高度”控制，此底边距不适用。"
      }
    : {};

  async function copyConfig() {
    await navigator.clipboard.writeText(JSON.stringify(props.config, null, 2));
  }

  return (
    <aside className="game-ui-tuning-panel" aria-label="UI 比例调音台">
      <header>
        <strong>UI 比例调音台 V4</strong>
        <small>全局布局，适用于 4–8 人</small>
      </header>
      <div className={`game-ui-tuning-panel__status ${props.dirty ? "is-dirty" : "is-applied"}`}>
        {props.dirty ? "存在未保存修改" : props.hasApplied ? "全局配置已应用" : "当前使用安全默认值"}
      </div>
      <section className="game-ui-tuning-panel__group">
        <b>快速调整</b>
        <div className="game-ui-tuning-panel__fields">
          {quickKeys.map((key) => <TuningField key={key} config={props.config} effectiveConfig={props.effectiveConfig} fieldKey={key} disabledReason={compactDisabledReasons[key]} onChange={props.onChange} />)}
        </div>
      </section>
      <details className="game-ui-tuning-panel__group">
        <summary>高级微调</summary>
        <div className="game-ui-tuning-panel__fields">
          {advancedKeys.map((key) => <TuningField key={key} config={props.config} effectiveConfig={props.effectiveConfig} fieldKey={key} disabledReason={compactDisabledReasons[key]} onChange={props.onChange} />)}
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
        <button className="is-primary" disabled={!props.dirty} type="button" onClick={props.onApply}>保存并应用到 4–8 人</button>
        <button type="button" onClick={props.onReset}>恢复安全预设</button>
        <button type="button" onClick={copyConfig}>复制安全配置</button>
      </footer>
    </aside>
  );
}

function TuningField(props: {
  config: GameUiTuningConfig;
  effectiveConfig: GameUiTuningConfig;
  fieldKey: NumericKey;
  disabledReason?: string;
  onChange: (config: GameUiTuningConfig) => void;
}) {
  const [min, max, step] = gameUiTuningBounds[props.fieldKey];
  const requestedValue = props.config[props.fieldKey];
  const effectiveValue = props.effectiveConfig[props.fieldKey];
  const corrected = Math.abs(requestedValue - effectiveValue) > 0.0001;
  return (
    <label
      className={props.disabledReason ? "is-disabled" : undefined}
      data-tuning-field={props.fieldKey}
      data-effective-value={effectiveValue}
      data-tuning-applicable={props.disabledReason ? "false" : "true"}
    >
      <span>
        {labels[props.fieldKey]}
        <b>{requestedValue}{corrected ? <em>→ {effectiveValue}</em> : null}</b>
      </span>
      <input
        type="range"
        disabled={Boolean(props.disabledReason)}
        min={min}
        max={max}
        step={step}
        value={props.config[props.fieldKey]}
        onChange={(event) => props.onChange({
          ...props.config,
          [props.fieldKey]: Number(event.target.value)
        })}
      />
      {props.disabledReason ? <small className="game-ui-tuning-panel__disabled-reason">{props.disabledReason}</small> : null}
    </label>
  );
}

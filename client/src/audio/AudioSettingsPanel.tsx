import { useAudio } from "./AudioProvider";
import type { AudioSettings } from "./audioTypes";

const controls: Array<{
  key: "master" | "ambience" | "game" | "ui";
  label: string;
  hint: string;
}> = [
  { key: "master", label: "主音量", hint: "统一控制所有声音" },
  { key: "ambience", label: "环境音", hint: "大厅、议事厅与牌桌背景" },
  { key: "game", label: "游戏音效", hint: "卡牌、金币、皇冠与职业动作" },
  { key: "ui", label: "界面音效", hint: "按钮确认等界面反馈" }
];

export function AudioSettingsPanel() {
  const { settings, toggleMute, updateSetting } = useAudio();

  return (
    <section className="audio-settings-panel" aria-label="音频设置">
      <header className="audio-settings-panel__header">
        <div>
          <span>AUDIO</span>
          <h3>声音控制</h3>
        </div>
        <button
          className={`audio-settings-panel__mute ${settings.muted ? "is-muted" : ""}`}
          data-testid="audio-mute"
          type="button"
          aria-pressed={settings.muted}
          onClick={toggleMute}
        >
          <span aria-hidden="true">{settings.muted ? "×" : "♪"}</span>
          {settings.muted ? "恢复声音" : "全部静音"}
        </button>
      </header>

      <div className="audio-settings-panel__controls">
        {controls.map((control, index) => (
          <VolumeControl
            emphasized={index === 0}
            hint={control.hint}
            key={control.key}
            label={control.label}
            settingKey={control.key}
            settings={settings}
            onChange={updateSetting}
          />
        ))}
      </div>
      <p className="audio-settings-panel__note">切到后台时会自动暂停声音，返回游戏后恢复。</p>
    </section>
  );
}

function VolumeControl(props: {
  emphasized: boolean;
  hint: string;
  label: string;
  settingKey: "master" | "ambience" | "game" | "ui";
  settings: AudioSettings;
  onChange: (key: "master" | "ambience" | "game" | "ui", value: number) => void;
}) {
  const percentage = Math.round(props.settings[props.settingKey] * 100);
  return (
    <label className={`audio-volume-control ${props.emphasized ? "is-master" : ""}`}>
      <span className="audio-volume-control__copy">
        <strong>{props.label}</strong>
        <small>{props.hint}</small>
      </span>
      <span className="audio-volume-control__value">{percentage}%</span>
      <input
        aria-label={props.label}
        data-testid={`audio-${props.settingKey}`}
        max="100"
        min="0"
        step="1"
        type="range"
        value={percentage}
        onChange={(event) => props.onChange(props.settingKey, Number(event.target.value) / 100)}
      />
    </label>
  );
}

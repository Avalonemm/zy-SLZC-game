import type { AudioSettings } from "./audioTypes";

export const audioSettingsStorageKey = "zy-audio-settings-v1";

export const defaultAudioSettings: AudioSettings = {
  master: 1,
  ambience: 0.4,
  game: 0.8,
  ui: 0.65,
  muted: false,
  muteWhenHidden: true
};

export function readAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return defaultAudioSettings;
  try {
    const saved = JSON.parse(window.localStorage.getItem(audioSettingsStorageKey) || "{}") as Partial<AudioSettings>;
    return normalizeAudioSettings({ ...defaultAudioSettings, ...saved });
  } catch {
    return defaultAudioSettings;
  }
}

export function writeAudioSettings(settings: AudioSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(audioSettingsStorageKey, JSON.stringify(normalizeAudioSettings(settings)));
}

export function normalizeAudioSettings(settings: AudioSettings): AudioSettings {
  return {
    master: clampVolume(settings.master),
    ambience: clampVolume(settings.ambience),
    game: clampVolume(settings.game),
    ui: clampVolume(settings.ui),
    muted: Boolean(settings.muted),
    muteWhenHidden: settings.muteWhenHidden !== false
  };
}

function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

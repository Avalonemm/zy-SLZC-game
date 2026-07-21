import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { audioEngine } from "./audioEngine";
import {
  readAudioSettings,
  writeAudioSettings
} from "./audioSettings";
import type {
  AudioCueId,
  AudioScene,
  AudioSettings,
  PlayCueOptions
} from "./audioTypes";

type AudioContextValue = {
  settings: AudioSettings;
  playCue: (cueId: AudioCueId, options?: PlayCueOptions) => void;
  setScene: (scene: AudioScene) => void;
  toggleMute: () => void;
  updateSetting: (key: "master" | "ambience" | "game" | "ui", value: number) => void;
};

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider(props: { children: ReactNode }) {
  const [settings, setSettings] = useState(readAudioSettings);

  useEffect(() => {
    audioEngine.setSettings(settings);
    writeAudioSettings(settings);
  }, [settings]);

  useEffect(() => {
    const unlock = () => {
      void audioEngine.unlock();
    };
    const handleVisibility = () => {
      void audioEngine.setHidden(document.hidden);
    };
    const playButtonConfirmation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button:not(:disabled)");
      if (!button || button.dataset.audioSilent === "true") return;
      audioEngine.playCue("ui-confirm");
    };

    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock);
    document.addEventListener("click", playButtonConfirmation, true);
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("click", playButtonConfirmation, true);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const updateSetting = useCallback<AudioContextValue["updateSetting"]>((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);
  const toggleMute = useCallback(() => {
    setSettings((current) => ({ ...current, muted: !current.muted }));
  }, []);
  const playCue = useCallback((cueId: AudioCueId, options?: PlayCueOptions) => {
    audioEngine.playCue(cueId, options);
  }, []);
  const setScene = useCallback((scene: AudioScene) => {
    audioEngine.setScene(scene);
  }, []);

  const value = useMemo<AudioContextValue>(() => ({
    settings,
    playCue,
    setScene,
    toggleMute,
    updateSetting
  }), [playCue, setScene, settings, toggleMute, updateSetting]);

  return <AudioContext.Provider value={value}>{props.children}</AudioContext.Provider>;
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio must be used inside AudioProvider");
  return context;
}

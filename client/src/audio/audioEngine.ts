import { audioCatalog, audioSceneCue } from "./audioCatalog";
import { defaultAudioSettings, normalizeAudioSettings } from "./audioSettings";
import type { AudioBus, AudioCueId, AudioScene, AudioSettings, PlayCueOptions } from "./audioTypes";

type ActiveAmbience = {
  cueId: AudioCueId;
  buffer: AudioBuffer;
  nextStartTime: number;
  scheduledCount: number;
  schedulerId: number;
  sources: Set<{ source: AudioBufferSourceNode; gain: GainNode }>;
};

const maximumRememberedEventIds = 512;

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private busGains: Partial<Record<AudioBus, GainNode>> = {};
  private buffers = new Map<AudioCueId, Promise<AudioBuffer | null>>();
  private settings: AudioSettings = defaultAudioSettings;
  private unlocked = false;
  private hidden = false;
  private scene: AudioScene = "lobby";
  private ambience: ActiveAmbience | null = null;
  private playedEventIds = new Set<string>();
  private playedEventOrder: string[] = [];

  setSettings(nextSettings: AudioSettings) {
    this.settings = normalizeAudioSettings(nextSettings);
    this.applySettings();
  }

  async unlock() {
    this.unlocked = true;
    const context = this.ensureContext();
    if (!context || this.hidden) return;
    try {
      if (context.state === "suspended") await context.resume();
      await this.startSceneAmbience();
    } catch {
      // Audio is optional. Browsers may still refuse playback after the first gesture.
    }
  }

  setScene(scene: AudioScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    void this.startSceneAmbience();
  }

  playCue(cueId: AudioCueId, options: PlayCueOptions = {}) {
    if (options.eventId && !this.claimEventId(options.eventId)) return;
    if (!this.unlocked || this.hidden || this.settings.muted) return;
    const definition = audioCatalog[cueId];
    if (!definition || definition.loop) return;
    void this.playOneShot(cueId, options);
  }

  async setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (!this.context || !this.unlocked || !this.settings.muteWhenHidden) return;
    try {
      if (hidden && this.context.state === "running") {
        await this.context.suspend();
      } else if (!hidden && this.context.state === "suspended") {
        await this.context.resume();
        await this.startSceneAmbience();
      }
    } catch {
      // Visibility audio control must never affect the game.
    }
  }

  private async playOneShot(cueId: AudioCueId, options: PlayCueOptions) {
    const context = this.ensureContext();
    if (!context || context.state !== "running") return;
    const buffer = await this.loadBuffer(cueId);
    if (!buffer || this.hidden || this.settings.muted || context.state !== "running") return;

    const definition = audioCatalog[cueId];
    const source = context.createBufferSource();
    const gain = context.createGain();
    const intensity = Math.min(1.25, Math.max(0.25, options.intensity ?? 1));
    gain.gain.value = definition.gain * intensity;
    source.buffer = buffer;

    const bus = this.busGains[definition.bus];
    if (!bus) return;
    const panValue = Math.min(0.3, Math.max(-0.3, options.pan ?? 0));
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = panValue;
      source.connect(gain).connect(panner).connect(bus);
    } else {
      source.connect(gain).connect(bus);
    }
    source.start();
    source.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  private async startSceneAmbience() {
    const cueId = audioSceneCue[this.scene];
    if (!cueId) {
      this.fadeOutAmbience();
      return;
    }
    if (!this.unlocked || this.hidden || this.settings.muted || this.ambience?.cueId === cueId) return;

    const context = this.ensureContext();
    if (!context || context.state !== "running") return;
    const requestedScene = this.scene;
    const buffer = await this.loadBuffer(cueId);
    if (
      !buffer ||
      requestedScene !== this.scene ||
      this.hidden ||
      this.settings.muted ||
      this.ambience?.cueId === cueId
    ) return;

    this.fadeOutAmbience();
    const definition = audioCatalog[cueId];
    const bus = this.busGains.ambience;
    if (!bus) return;
    const loopStart = Math.max(0, definition.loopStart ?? 0);
    const loopEnd = Math.min(buffer.duration, definition.loopEnd ?? buffer.duration);
    if (loopEnd - loopStart < 1) return;
    const crossfade = Math.min(definition.crossfade ?? 0.8, (loopEnd - loopStart) * 0.25);
    const firstStartTime = context.currentTime + 0.035;
    const active: ActiveAmbience = {
      cueId,
      buffer,
      nextStartTime: firstStartTime,
      scheduledCount: 0,
      schedulerId: 0,
      sources: new Set()
    };
    this.ambience = active;
    this.scheduleAmbienceSegments(active, loopStart, loopEnd, crossfade, definition.gain, bus);
    active.schedulerId = window.setInterval(() => {
      this.scheduleAmbienceSegments(active, loopStart, loopEnd, crossfade, definition.gain, bus);
    }, 2_000);
  }

  private fadeOutAmbience() {
    const active = this.ambience;
    const context = this.context;
    this.ambience = null;
    if (!active || !context) return;
    window.clearInterval(active.schedulerId);
    const now = context.currentTime;
    for (const node of active.sources) {
      if (typeof node.gain.gain.cancelAndHoldAtTime === "function") {
        node.gain.gain.cancelAndHoldAtTime(now);
      } else {
        node.gain.gain.cancelScheduledValues(now);
        node.gain.gain.setValueAtTime(0, now);
      }
      node.gain.gain.linearRampToValueAtTime(0, now + 0.35);
      try {
        node.source.stop(now + 0.38);
      } catch {
        // A scheduled segment may already have ended during a scene race.
      }
    }
  }

  private scheduleAmbienceSegments(
    active: ActiveAmbience,
    loopStart: number,
    loopEnd: number,
    crossfade: number,
    level: number,
    bus: GainNode
  ) {
    const context = this.context;
    if (!context || this.ambience !== active) return;
    const duration = loopEnd - loopStart;
    const step = duration - crossfade;
    const horizon = context.currentTime + Math.max(24, step * 4);
    while (active.nextStartTime < horizon) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const startTime = active.nextStartTime;
      const fadeInDuration = active.scheduledCount === 0 ? Math.min(0.55, crossfade) : crossfade;
      source.buffer = active.buffer;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.setValueCurveAtTime(fadeCurve(level, false), startTime, fadeInDuration);
      gain.gain.setValueAtTime(level, startTime + fadeInDuration);
      gain.gain.setValueCurveAtTime(fadeCurve(level, true), startTime + duration - crossfade, crossfade);
      source.connect(gain).connect(bus);
      const node = { source, gain };
      active.sources.add(node);
      source.addEventListener("ended", () => {
        active.sources.delete(node);
        source.disconnect();
        gain.disconnect();
      }, { once: true });
      source.start(startTime, loopStart, duration);
      active.nextStartTime += step;
      active.scheduledCount += 1;
    }
  }

  private loadBuffer(cueId: AudioCueId) {
    const existing = this.buffers.get(cueId);
    if (existing) return existing;
    const loading = this.fetchBuffer(cueId);
    this.buffers.set(cueId, loading);
    return loading;
  }

  private async fetchBuffer(cueId: AudioCueId) {
    const context = this.ensureContext();
    if (!context) return null;
    try {
      const response = await fetch(audioCatalog[cueId].file);
      if (!response.ok) return null;
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  private ensureContext() {
    if (this.context || typeof window === "undefined") return this.context;
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 16;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;
    master.connect(limiter).connect(context.destination);
    this.context = context;
    this.masterGain = master;
    for (const busName of ["ambience", "game", "ui"] as const) {
      const gain = context.createGain();
      gain.connect(master);
      this.busGains[busName] = gain;
    }
    this.applySettings();
    return context;
  }

  private applySettings() {
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, now, 0.025);
    this.busGains.ambience?.gain.setTargetAtTime(this.settings.ambience, now, 0.025);
    this.busGains.game?.gain.setTargetAtTime(this.settings.game, now, 0.025);
    this.busGains.ui?.gain.setTargetAtTime(this.settings.ui, now, 0.025);
    if (this.settings.muted) this.fadeOutAmbience();
    else void this.startSceneAmbience();
  }

  private claimEventId(eventId: string) {
    if (this.playedEventIds.has(eventId)) return false;
    this.playedEventIds.add(eventId);
    this.playedEventOrder.push(eventId);
    while (this.playedEventOrder.length > maximumRememberedEventIds) {
      const oldest = this.playedEventOrder.shift();
      if (oldest) this.playedEventIds.delete(oldest);
    }
    return true;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export const audioEngine = new AudioEngine();

function fadeCurve(level: number, fadeOut: boolean) {
  const points = 32;
  const curve = new Float32Array(points);
  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    curve[index] = level * Math.sqrt(fadeOut ? 1 - progress : progress);
  }
  return curve;
}

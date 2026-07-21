import type { AudioBus, AudioCueId, AudioScene } from "./audioTypes";

export type AudioCueDefinition = {
  file: string;
  bus: AudioBus;
  gain: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  crossfade?: number;
};

const root = "/assets/audio/v1";

export const audioCatalog: Record<AudioCueId, AudioCueDefinition> = {
  "amb-game": { file: `${root}/amb-game.wav`, bus: "ambience", gain: 0.9, loop: true, loopStart: 0, loopEnd: 8.55, crossfade: 1.1 },
  "amb-lobby": { file: `${root}/amb-lobby.wav`, bus: "ambience", gain: 0.85, loop: true, loopStart: 0, loopEnd: 17.3, crossfade: 1.1 },
  "amb-ready": { file: `${root}/amb-ready.wav`, bus: "ambience", gain: 0.88, loop: true, loopStart: 0, loopEnd: 19.95, crossfade: 1.25 },
  "assassin-mark": { file: `${root}/assassin-mark.wav`, bus: "game", gain: 0.9 },
  "assassin-skip": { file: `${root}/assassin-skip.wav`, bus: "game", gain: 0.92 },
  "build-place": { file: `${root}/build-place.wav`, bus: "game", gain: 0.82 },
  "card-draw": { file: `${root}/card-draw.wav`, bus: "game", gain: 0.82 },
  "card-place": { file: `${root}/card-place.wav`, bus: "game", gain: 0.78 },
  "coin-multi": { file: `${root}/coin-multi.wav`, bus: "game", gain: 0.78 },
  "coin-single": { file: `${root}/coin-single.wav`, bus: "game", gain: 0.78 },
  "crown-land": { file: `${root}/crown-land.wav`, bus: "game", gain: 0.82 },
  "crown-tick": { file: `${root}/crown-tick.wav`, bus: "game", gain: 0.66 },
  "result-end": { file: `${root}/result-end.wav`, bus: "game", gain: 0.92 },
  "role-architect": { file: `${root}/role-architect.wav`, bus: "game", gain: 0.88 },
  "role-bishop": { file: `${root}/role-bishop.wav`, bus: "game", gain: 0.94 },
  "role-call": { file: `${root}/role-call.wav`, bus: "game", gain: 0.8 },
  "role-king": { file: `${root}/role-king.wav`, bus: "game", gain: 0.9 },
  "role-magician": { file: `${root}/role-magician.wav`, bus: "game", gain: 0.88 },
  "role-merchant": { file: `${root}/role-merchant.wav`, bus: "game", gain: 0.86 },
  "role-queen": { file: `${root}/role-queen.wav`, bus: "game", gain: 0.9 },
  "role-reveal": { file: `${root}/role-reveal.wav`, bus: "game", gain: 0.78 },
  "role-thief": { file: `${root}/role-thief.wav`, bus: "game", gain: 0.88 },
  "ui-confirm": { file: `${root}/ui-confirm.wav`, bus: "ui", gain: 0.58 },
  "warlord-destroy": { file: `${root}/warlord-destroy.wav`, bus: "game", gain: 0.9 }
};

export const audioSceneCue: Record<AudioScene, AudioCueId | null> = {
  lobby: "amb-ready",
  ready: "amb-ready",
  game: "amb-game",
  result: null
};

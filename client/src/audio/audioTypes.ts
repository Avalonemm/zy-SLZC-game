export type AudioScene = "lobby" | "ready" | "game" | "result";

export type AudioBus = "ambience" | "game" | "ui";

export type AudioCueId =
  | "amb-game"
  | "amb-lobby"
  | "amb-ready"
  | "assassin-mark"
  | "assassin-skip"
  | "build-place"
  | "card-draw"
  | "card-place"
  | "coin-multi"
  | "coin-single"
  | "crown-land"
  | "crown-tick"
  | "result-end"
  | "role-architect"
  | "role-bishop"
  | "role-call"
  | "role-king"
  | "role-magician"
  | "role-merchant"
  | "role-queen"
  | "role-reveal"
  | "role-thief"
  | "ui-confirm"
  | "warlord-destroy";

export type AudioSettings = {
  master: number;
  ambience: number;
  game: number;
  ui: number;
  muted: boolean;
  muteWhenHidden: boolean;
};

export type PlayCueOptions = {
  eventId?: string;
  intensity?: number;
  pan?: number;
};

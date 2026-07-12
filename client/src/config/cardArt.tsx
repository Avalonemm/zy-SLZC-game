import { useState } from "react";

export const CARD_FACE_MODE = "overlay" as "overlay" | "baked";
const CARD_ART_ROOT = "/assets/visual/cards";

export function cardFaceAttributes() {
  return { "data-card-face-mode": CARD_FACE_MODE } as const;
}

export function CardArtwork(props: {
  kind: "role" | "district";
  cardId: string | null | undefined;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (CARD_FACE_MODE !== "baked" || !props.cardId || failed) {
    return null;
  }

  const folder = props.kind === "role" ? "roles" : "districts";
  return (
    <img
      className="card-artwork"
      src={`${CARD_ART_ROOT}/${folder}/${props.cardId}.webp`}
      alt={props.alt}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

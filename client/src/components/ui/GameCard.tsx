import type { ReactNode } from "react";

type GameCardProps = {
  children?: ReactNode;
  className?: string;
  cost?: number;
  description?: string;
  disabled?: boolean;
  name?: string;
  selected?: boolean;
  type?: "district" | "role" | "back";
};

export function GameCard({
  children,
  className = "",
  cost,
  description,
  disabled = false,
  name,
  selected = false,
  type = "district"
}: GameCardProps) {
  return (
    <article
      className={`game-card game-card--${type} ${selected ? "is-selected" : ""} ${
        disabled ? "is-disabled" : ""
      } ${className}`}
    >
      {cost !== undefined && <span className="game-card__cost">{cost}</span>}
      {name && <strong>{name}</strong>}
      {description && <p>{description}</p>}
      {children}
    </article>
  );
}

import type { ReactNode } from "react";

type GameBadgeProps = {
  children: ReactNode;
  className?: string;
  tone?: "default" | "ready" | "active" | "muted";
};

export function GameBadge({ children, className = "", tone = "default" }: GameBadgeProps) {
  return <span className={`game-badge game-badge--${tone} ${className}`}>{children}</span>;
}

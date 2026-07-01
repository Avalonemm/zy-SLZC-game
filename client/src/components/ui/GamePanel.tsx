import type { ReactNode } from "react";

type GamePanelProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function GamePanel({ children, className = "", title }: GamePanelProps) {
  return (
    <section className={`game-panel ${className}`}>
      {title && <h2 className="game-panel__title fantasy-text">{title}</h2>}
      {children}
    </section>
  );
}

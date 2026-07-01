import type { ButtonHTMLAttributes, ReactNode } from "react";

type GameButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "neutral" | "danger";
};

export function GameButton({
  children,
  className = "",
  size = "md",
  variant = "primary",
  ...props
}: GameButtonProps) {
  return (
    <button
      className={`game-button game-button--${variant} game-button--${size} ${className}`}
      type="button"
      {...props}
    >
      <span>{children}</span>
    </button>
  );
}

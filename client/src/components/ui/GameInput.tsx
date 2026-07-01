import type { InputHTMLAttributes, ReactNode } from "react";

type GameInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  rightSlot?: ReactNode;
};

export function GameInput({ className = "", label, rightSlot, ...props }: GameInputProps) {
  return (
    <label className={`game-input ${className}`}>
      {label && <span className="game-input__label">{label}</span>}
      <span className="game-input__control">
        <input {...props} />
        {rightSlot}
      </span>
    </label>
  );
}

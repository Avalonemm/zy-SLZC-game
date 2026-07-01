import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
};

export function IconButton({ children, className = "", label, ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${className}`} type="button" aria-label={label} {...props}>
      {children}
      <span>{label}</span>
    </button>
  );
}

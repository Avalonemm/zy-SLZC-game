import type { ReactNode } from "react";

export function GameSelectionOverlay(props: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  controls?: ReactNode;
  remainingSeconds?: number | null;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="citadel-selection-layer" aria-label={props.ariaLabel}>
      <div className="citadel-selection-layer__backdrop" aria-hidden="true" />
      <section className={`citadel-action-dock citadel-selection-panel ${props.className ?? ""}`}>
        <header className="citadel-selection-panel__header">
          <strong>{props.title}</strong>
          {props.subtitle ? <span>{props.subtitle}</span> : null}
          {props.remainingSeconds !== null && props.remainingSeconds !== undefined ? (
            <b className="citadel-selection-timer" aria-label={`剩余 ${props.remainingSeconds} 秒`}>
              {props.remainingSeconds}
              <small>秒</small>
            </b>
          ) : null}
        </header>
        <div className="citadel-selection-panel__content">{props.children}</div>
        {props.controls ? <footer className="citadel-selection-panel__controls">{props.controls}</footer> : null}
      </section>
    </section>
  );
}

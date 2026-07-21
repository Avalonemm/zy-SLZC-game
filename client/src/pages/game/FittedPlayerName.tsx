import { useLayoutEffect, useRef } from "react";

const FIT_EPSILON_PX = 0.5;
const FIT_ITERATIONS = 8;

export function FittedPlayerName(props: { name: string }) {
  const nameRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    let frame = 0;

    const fitName = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.removeProperty("font-size");
        const computed = window.getComputedStyle(element);
        const defaultSize = Number.parseFloat(computed.fontSize);
        const configuredMinimum = Number.parseFloat(
          computed.getPropertyValue("--citadel-player-name-min-size")
        );
        const minimumSize = Number.isFinite(configuredMinimum)
          ? Math.min(configuredMinimum, defaultSize)
          : Math.min(11, defaultSize);

        element.style.fontSize = `${defaultSize}px`;

        if (element.scrollWidth <= element.clientWidth + FIT_EPSILON_PX) {
          element.dataset.nameFit = "full";
          return;
        }

        let lower = minimumSize;
        let upper = defaultSize;
        for (let iteration = 0; iteration < FIT_ITERATIONS; iteration += 1) {
          const candidate = (lower + upper) / 2;
          element.style.fontSize = `${candidate}px`;
          if (element.scrollWidth <= element.clientWidth + FIT_EPSILON_PX) {
            lower = candidate;
          } else {
            upper = candidate;
          }
        }

        element.style.fontSize = `${lower}px`;
        element.dataset.nameFit = element.scrollWidth <= element.clientWidth + FIT_EPSILON_PX
          ? "scaled"
          : "ellipsis";
      });
    };

    const resizeObserver = new ResizeObserver(fitName);
    resizeObserver.observe(element.parentElement ?? element);
    const card = element.closest(".citadel-player-mini");
    if (card instanceof HTMLElement) resizeObserver.observe(card);
    const mutationObserver = new MutationObserver(fitName);
    mutationObserver.observe(element, { childList: true, characterData: true, subtree: true });

    fitName();
    void document.fonts?.ready.then(fitName);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [props.name]);

  return (
    <strong
      ref={nameRef}
      aria-label={props.name}
      data-full-player-name={props.name}
      title={props.name}
    >
      {props.name}
    </strong>
  );
}

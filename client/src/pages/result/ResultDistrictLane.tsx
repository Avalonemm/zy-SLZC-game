import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DistrictCard } from "@zy/shared";
import { ResultDistrictCard } from "./ResultDistrictCard";

type LaneStyle = CSSProperties & { "--result-card-width": string };

export function ResultDistrictLane(props: { cards: DistrictCard[]; playerName: string }) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(68);

  useEffect(() => {
    const lane = laneRef.current;
    if (!lane || props.cards.length === 0) return;
    const update = () => {
      const style = window.getComputedStyle(lane);
      const gap = Number.parseFloat(style.columnGap || style.gap) || 3;
      const availableWidth = lane.clientWidth - gap * Math.max(0, props.cards.length - 1);
      const availableHeight = lane.clientHeight;
      const widthByLane = availableWidth / props.cards.length;
      const widthByHeight = Math.max(0, availableHeight) * 2 / 3;
      setCardWidth(Math.max(10, Math.min(68, widthByLane, widthByHeight)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(lane);
    return () => observer.disconnect();
  }, [props.cards.length]);

  const style: LaneStyle = { "--result-card-width": `${cardWidth}px` };
  return (
    <div
      className="citadel-result-player__city"
      aria-label={`${props.playerName} 的全部建筑`}
      ref={laneRef}
      style={style}
    >
      {props.cards.length > 0
        ? props.cards.map((card) => <ResultDistrictCard card={card} key={card.id} />)
        : <p>未建造建筑</p>}
    </div>
  );
}

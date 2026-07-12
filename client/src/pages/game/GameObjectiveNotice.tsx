export function objectiveSummary(endCitySize: number) {
  return `\u76ee\u6807\uff1a\u5efa\u6210 ${endCitySize} \u5ea7\u5efa\u7b51\u89e6\u53d1\u7ec8\u5c40\uff0c\u603b\u5206\u6700\u9ad8\u8005\u83b7\u80dc`;
}

export function GameObjectiveNotice(props: {
  endCitySize: number;
  visible: boolean;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <section className="citadel-game-objective-intro" aria-label={"\u672c\u5c40\u83b7\u80dc\u6761\u4ef6"}>
      <span>{"\u672c\u5c40\u76ee\u6807"}</span>
      <strong>{"\u7387\u5148\u5efa\u6210 "}{props.endCitySize}{" \u5ea7\u5efa\u7b51"}</strong>
      <p>{"\u5b8c\u6210\u5f53\u524d\u8f6e\u540e\u8fdb\u5165\u7ed3\u7b97\uff0c\u5efa\u7b51\u5206\u548c\u5956\u52b1\u5206\u8ba1\u5165\u603b\u5206\uff0c\u603b\u5206\u6700\u9ad8\u8005\u83b7\u80dc\u3002"}</p>
    </section>
  );
}

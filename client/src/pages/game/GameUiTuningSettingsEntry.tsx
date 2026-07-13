export function GameUiTuningSettingsEntry() {
  if (!import.meta.env.DEV) {
    return null;
  }

  const tuningVisible = new URLSearchParams(window.location.search).get("uiTune") === "1";

  function toggleTuningPanel() {
    const url = new URL(window.location.href);
    if (tuningVisible) {
      url.searchParams.delete("uiTune");
    } else {
      url.searchParams.set("uiTune", "1");
    }
    window.location.assign(url.toString());
  }

  return (
    <section className="citadel-ui-tuning-entry" aria-label="UI 布局调试">
      <div>
        <strong>UI 布局调试</strong>
        <p>调整当前人数的卡牌、名片、操作区和预览比例。</p>
      </div>
      <button
        className="citadel-ui-tuning-entry__button"
        type="button"
        onClick={toggleTuningPanel}
      >
        {tuningVisible ? "关闭调音台" : "打开调音台"}
      </button>
    </section>
  );
}

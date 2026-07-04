import type { ReactNode } from "react";
import { helpTabs, type HelpTabId } from "./helpTabs";

type RulebookHelpProps = {
  activeTab: HelpTabId;
  documents: Record<HelpTabId, string>;
  onChangeTab: (tabId: HelpTabId) => void;
};

export function RulebookHelp(props: RulebookHelpProps) {
  const activeDocument = props.documents[props.activeTab];

  return (
    <section className="rulebook-help">
      <nav className="rulebook-tabs" aria-label="帮助章节">
        {helpTabs.map((tab) => (
          <button
            className={tab.id === props.activeTab ? "is-active" : ""}
            key={tab.id}
            type="button"
            onClick={() => props.onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <MarkdownLikeContent content={activeDocument} />
    </section>
  );
}

function MarkdownLikeContent(props: { content: string }) {
  const elements: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    elements.push(
      <ul key={`list-${elements.length}`}>
        {listItems.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const rawLine of props.content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushList();
      elements.push(<h2 key={`h2-${elements.length}`}>{line.slice(2)}</h2>);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={`h3-${elements.length}`}>{line.slice(3)}</h3>);
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    elements.push(<p key={`p-${elements.length}`}>{line}</p>);
  }

  flushList();

  return <article className="rulebook-content">{elements}</article>;
}

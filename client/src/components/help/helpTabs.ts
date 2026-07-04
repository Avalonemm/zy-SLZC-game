export const helpTabs = [
  { id: "rules", label: "玩法规则", path: "/help/rules.md" },
  { id: "roles", label: "角色说明", path: "/help/roles.md" },
  { id: "districts", label: "建筑说明", path: "/help/districts.md" },
  { id: "faq", label: "常见问题", path: "/help/faq.md" }
] as const;

export type HelpTabId = (typeof helpTabs)[number]["id"];

export const defaultHelpDocuments: Record<HelpTabId, string> = {
  rules: "规则内容加载中。",
  roles: "角色说明加载中。",
  districts: "建筑说明加载中。",
  faq: "常见问题加载中。"
};

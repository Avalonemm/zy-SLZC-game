# Rulebook Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintainable rulebook-style help section for the current MVP rules.

**Architecture:** Keep rule content as Markdown files under `client/public/help/`. The React help modal fetches those files and displays them in tabs, so future rule edits do not require code changes.

**Tech Stack:** React, TypeScript, Vite static public assets, CSS.

---

### Task 1: Add Rulebook Content Files

**Files:**
- Create: `client/public/help/rules.md`
- Create: `client/public/help/roles.md`
- Create: `client/public/help/districts.md`
- Create: `client/public/help/faq.md`

- [x] **Step 1: Write current MVP rule text**

Use Chinese rulebook wording and explicitly mention that this is a test version.

- [x] **Step 2: Keep dynamic game rules out of React**

All long-form help content lives in Markdown files, not JSX strings.

### Task 2: Add Help Tabs To Modal

**Files:**
- Modify: `client/src/pages/ConnectionPage.tsx`
- Modify: `client/src/styles.css`

- [x] **Step 1: Fetch help Markdown files**

Load `rules.md`, `roles.md`, `districts.md`, and `faq.md` from `/help/`.

- [x] **Step 2: Add tab buttons**

Tabs: `玩法规则`, `角色说明`, `建筑说明`, `常见问题`.

- [x] **Step 3: Render Markdown-like text safely**

Render headings, bullets, and paragraphs without adding a new dependency.

### Task 3: Update Roadmap

**Files:**
- Modify: `制作序列.txt`

- [x] **Step 1: Add stage 11A**

Document that help content is now file-driven and rulebook-style.

### Task 4: Verify

**Commands:**

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0.

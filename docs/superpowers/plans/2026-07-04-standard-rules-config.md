# Standard Rules Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stage 25B rule configuration for the standard 8-role package while keeping the current 2-4 player test loop working.

**Architecture:** Extend `RoomSettings` as the single server-authoritative rule source, copy those settings into `GameRoom`, and make setup, turn flow, actions, skills, and lobby UI read from those settings. Keep the lightweight UI and existing Socket.IO flow, adding only the minimal pending draw-choice state and event needed for draw 2 choose 1.

**Tech Stack:** TypeScript, Node.js, Express, Socket.IO, React, Vite, Vitest.

---

### File Structure

- Modify `shared/src/index.ts`: add rule setting fields, pending draw choice types, and draw choice socket event.
- Modify `server/src/game/gameConfig.ts`: add default rule constants and setting ranges.
- Modify `server/src/game/roomManager.ts`: default and validate room rule settings.
- Modify `server/src/game/gameSetup.ts`: initialize role pool from enabled roles and apply optional face-up / face-down role discards.
- Modify `server/src/game/turnFlow.ts`: reset enabled role pool and discards each round.
- Modify `server/src/game/actions.ts`: make draw cards a pending draw choice, add choose-card resolution, use configurable end city size, prevent duplicate district names.
- Modify `server/src/game/roleSkills.ts`: add standard color income and standard skill additions.
- Modify `server/src/game/scoring.ts`: use configurable end city size for the existing MVP scoring bonus.
- Modify `server/src/socket/registerSocketHandlers.ts`: wire `choose_drawn_district_card`.
- Modify `client/src/pages/ConnectionPage.tsx`: expose room rule settings, show public rule summary, and add draw choice UI.
- Modify server tests in `server/src/game/*.test.ts`: cover default settings, validation, setup, draw choice, end condition, duplicate districts, income, and skills.
- Modify `制作序列.txt`: insert stage 25B after approval.

### Task 1: Shared Settings And Room Validation

- [ ] **Step 1: Write failing room settings tests**

Add tests in `server/src/game/roomManager.test.ts` asserting default settings include `endCitySize: 8`, 8 enabled role ids, discard toggles, and `drawMode: "draw2Choose1"`, and invalid settings are rejected.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- roomManager.test.ts`

- [ ] **Step 3: Implement shared types, constants, defaults, and validation**

Update `RoomSettings`, `gameConfig.ts`, and `roomManager.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server -- roomManager.test.ts`

### Task 2: Role Pool And Discards

- [ ] **Step 1: Write failing setup / turn flow tests**

Add tests in `server/src/game/gameSetup.test.ts` and `server/src/game/gameEngine.test.ts` asserting enabled roles are respected and face-up / face-down discards follow settings.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- gameSetup.test.ts gameEngine.test.ts`

- [ ] **Step 3: Implement role pool helper and use it during setup / next rounds**

Filter enabled roles, move discarded roles into `discardedRoles`, and keep hidden discard information out of `availableRoles`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server -- gameSetup.test.ts gameEngine.test.ts`

### Task 3: Draw 2 Choose 1 And End Condition

- [ ] **Step 1: Write failing action tests**

Add tests in `server/src/game/gameEngine.test.ts` asserting drawing creates a pending choice, choosing one card adds it to hand, returns the other to deck bottom, marks resource action used, rejects wrong players, uses configurable end city size, and prevents duplicate district names.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- gameEngine.test.ts`

- [ ] **Step 3: Implement pending draw choice and duplicate / end-condition rules**

Add `pendingDrawChoice` state, `chooseDrawnDistrictCard`, and update socket exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server -- gameEngine.test.ts`

### Task 4: Standard Role Income And Skills

- [ ] **Step 1: Write failing role skill tests**

Add tests covering king yellow income, bishop blue income, merchant green income plus 1 gold, warlord red income, architect extra two cards plus extra build, magician swap-hand option, and warlord cannot destroy a player at the configured completed city size.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- gameEngine.test.ts`

- [ ] **Step 3: Implement standard role income and skills**

Keep the existing active skill entry point and add behavior without introducing new game phases.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server -- gameEngine.test.ts`

### Task 5: Socket And Lightweight UI

- [ ] **Step 1: Add TypeScript-backed UI state**

Expose all room settings in the settings dialog and public room summary, and add a pending draw-choice panel in the game view.

- [ ] **Step 2: Wire socket event**

Emit `choose_drawn_district_card` and handle existing `game_state` updates.

- [ ] **Step 3: Run type/build checks**

Run: `npm run typecheck` and `npm run build`.

### Task 6: Stage Document And Full Verification

- [ ] **Step 1: Insert stage 25B into `制作序列.txt`**

Add the approved scope between 25A and 26, marking it complete only after verification.

- [ ] **Step 2: Run full verification**

Run: `npm test --workspace server`, `npm run typecheck`, and `npm run build`.

- [ ] **Step 3: Summarize outcomes**

Report changed behavior, verification results, and any deferred 5-8 player or formal UI work.

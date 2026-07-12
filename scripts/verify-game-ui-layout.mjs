import { io } from "socket.io-client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const serverUrl = process.env.SERVER_URL ?? "http://127.0.0.1:3000";
const chromePort = Number(process.env.CHROME_PORT ?? 9341);
const screenshotDir = process.env.UI_QA_SCREENSHOT_DIR ?? join(tmpdir(), "zy-game-ui-layout-qa");
const viewports = parseViewports(process.env.UI_QA_VIEWPORTS ?? "1920x946,1893x881,1365x668");
const qaMode = process.env.UI_QA_MODE ?? "full";
const opponentPlayerCounts = (process.env.UI_QA_PLAYER_COUNTS ?? "4,5,6,7,8")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 4 && value <= 8);

function parseViewports(value) {
  return value.split(",").map((part) => {
    const [width, height] = part.trim().split("x").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid viewport: ${part}`);
    }
    return { width, height };
  });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 20000, label = event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);

    function onEvent(payload) {
      try {
        if (!predicate(payload)) {
          return;
        }
        clearTimeout(timer);
        socket.off(event, onEvent);
        resolve(payload);
      } catch (error) {
        clearTimeout(timer);
        socket.off(event, onEvent);
        reject(error);
      }
    }

    socket.on(event, onEvent);
  });
}

function fail(message) {
  throw new Error(message);
}

async function setupGame(playerCount = 4, options = {}) {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  socket.on("error_message", (payload) => {
    throw new Error(`Server error: ${payload.message ?? payload}`);
  });

  await waitFor(socket, "server_status");

  const createdPromise = waitFor(socket, "room_created");
  const firstRoomStatePromise = waitFor(socket, "room_state");
  socket.emit("create_room", { playerName: "LayoutQA" });
  const created = await createdPromise;
  const firstRoomState = await firstRoomStatePromise;

  for (let nextMaxPlayers = firstRoomState.maxPlayers + 1; nextMaxPlayers <= playerCount; nextMaxPlayers += 1) {
    const expandedRoomPromise = waitFor(
      socket,
      "room_state",
      (room) => room.roomCode === created.roomCode && room.maxPlayers === nextMaxPlayers,
      12000,
      `room expanded to ${nextMaxPlayers} players`
    );
    socket.emit("update_room_settings", {
      ...created,
      settings: { maxPlayers: nextMaxPlayers }
    });
    await expandedRoomPromise;
  }

  for (let expectedPlayers = 2; expectedPlayers <= playerCount; expectedPlayers += 1) {
    const roomStatePromise = waitFor(
      socket,
      "room_state",
      (room) => room.roomCode === created.roomCode && room.players.length === expectedPlayers
    );
    socket.emit("add_test_bots", created);
    await roomStatePromise;
  }

  const firstGameStatePromise = waitFor(
    socket,
    "game_state",
    (state) => state.roomId === created.roomCode
  );
  socket.emit("start_game", created);
  let gameState = await firstGameStatePromise;

  gameState = await waitFor(
    socket,
    "game_state",
    (state) => state.roomId === created.roomCode && state.phase === "ROLE_SELECTION",
    12000,
    "role selection phase"
  );

  if (options.stopAtRoleSelection) {
    return { created, socket, gameState };
  }

  const deadline = Date.now() + (options.actionDeadlineMs ?? 30000);
  while (gameState.phase !== "ROLE_ACTION" || gameState.currentTurnPlayerId !== created.playerId) {
    if (Date.now() > deadline) {
      fail(`Game did not reach the human action turn. Last phase: ${gameState.phase}`);
    }

    if (gameState.phase === "ROLE_SELECTION" && gameState.roleSelectionTurnPlayerId === created.playerId) {
      const preferredRoleId = gameState.availableRoles.find((role) => role.id === options.preferredRoleId)?.id;
      if (options.failIfPreferredUnavailable && options.preferredRoleId && !preferredRoleId) {
        return { created, socket, gameState, preferredUnavailable: true };
      }
      const roleId = preferredRoleId ?? gameState.availableRoles[0]?.id;
      if (!roleId) {
        fail("No available role for the layout QA player.");
      }
      const nextStatePromise = waitFor(
        socket,
        "game_state",
        (state) => state.roomId === created.roomCode && state !== gameState,
        12000,
        "state after selecting role"
      );
      socket.emit("select_role", { roomCode: created.roomCode, playerId: created.playerId, roleId });
      gameState = await nextStatePromise;
      continue;
    }

    gameState = await waitFor(
      socket,
      "game_state",
      (state) => state.roomId === created.roomCode,
      12000,
      "state while reaching human action"
    );
  }

  return { created, socket, gameState };
}

async function setupPreferredRoleGame(playerCount, roleId, maxAttempts = 24) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const setup = await setupGame(playerCount, {
      actionDeadlineMs: 90000,
      preferredRoleId: roleId,
      failIfPreferredUnavailable: true
    });
    if (setup.preferredUnavailable) {
      setup.socket.disconnect();
      continue;
    }
    const selectedRoleId = setup.gameState.players.find(
      (player) => player.id === setup.created.playerId
    )?.selectedRoleId;
    if (selectedRoleId === roleId) {
      return setup;
    }
    setup.socket.disconnect();
  }
  fail(`Could not assign preferred role ${roleId} after ${maxAttempts} attempts.`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        } else {
          resolve(message.result ?? {});
        }
        return;
      }
      this.events.push(message);
    });
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = 10000) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  async waitEvent(method, sessionId, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.events.findIndex((event) =>
        event.method === method && (!sessionId || event.sessionId === sessionId)
      );
      if (index !== -1) {
        const [event] = this.events.splice(index, 1);
        return event;
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for CDP event: ${method}`);
  }

  close() {
    this.socket?.close();
  }
}

async function createBrowserPage() {
  await closeStaleQaPages();
  const version = await fetch(`http://127.0.0.1:${chromePort}/json/version`).then((response) => response.json());
  const cdp = new CdpClient(version.webSocketDebuggerUrl);
  await cdp.connect();
  const browserContext = await cdp.send("Target.createBrowserContext");
  const target = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId: browserContext.browserContextId
  });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true
  });
  const sessionId = attached.sessionId;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  return { cdp, sessionId, targetId: target.targetId, browserContextId: browserContext.browserContextId };
}

async function closeBrowserPage(browser) {
  if (!browser) return;
  try {
    await browser.cdp.send("Target.closeTarget", { targetId: browser.targetId }, undefined, 3000);
  } catch {
    // The target may already be closed after a failed run.
  }
  try {
    await browser.cdp.send("Target.disposeBrowserContext", { browserContextId: browser.browserContextId }, undefined, 3000);
  } catch {
    // Disposing the temporary context is best-effort cleanup.
  }
  browser.cdp.close();
  await closeStaleQaPages();
}

async function closeStaleQaPages() {
  try {
    const targets = await fetch(`http://127.0.0.1:${chromePort}/json/list`).then((response) => response.json());
    const stalePages = targets.filter((target) =>
      target.type === "page" &&
      (target.url === "about:blank" || target.url.startsWith(`${appUrl}/?qa-room=`))
    );
    await Promise.allSettled(
      stalePages.map((target) =>
        fetch(`http://127.0.0.1:${chromePort}/json/close/${encodeURIComponent(target.id)}`)
      )
    );
  } catch {
    // The dedicated QA browser may already be closed.
  }
}

async function setViewport(cdp, sessionId, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  }, sessionId);
}

async function navigate(cdp, sessionId, url) {
  await cdp.send("Page.navigate", { url }, sessionId);
  await cdp.waitEvent("Page.loadEventFired", sessionId, 15000);
}

async function evaluate(cdp, sessionId, expression, timeoutMs = 10000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  }, sessionId, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function waitForSelector(cdp, sessionId, selector, timeoutMs = 15000) {
  const escapedSelector = JSON.stringify(selector);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(cdp, sessionId, `Boolean(document.querySelector(${escapedSelector}))`);
    if (found) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function waitForSelectorAbsent(cdp, sessionId, selector, timeoutMs = 15000) {
  const escapedSelector = JSON.stringify(selector);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(cdp, sessionId, `Boolean(document.querySelector(${escapedSelector}))`);
    if (!found) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for selector to disappear: ${selector}`);
}

async function waitForPageText(cdp, sessionId, text, timeoutMs = 15000) {
  const expectedText = JSON.stringify(text);
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, sessionId, `(() => ({
      found: document.body.innerText.includes(${expectedText}),
      text: document.body.innerText.slice(0, 500)
    }))()`);
    if (state?.found) {
      return;
    }
    lastText = state?.text ?? "";
    await delay(100);
  }
  throw new Error(`Timed out waiting for page text: ${text}. Last page text: ${lastText}`);
}
async function captureScreenshot(cdp, sessionId, name) {
  mkdirSync(screenshotDir, { recursive: true });
  const result = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId, 15000);
  const path = join(screenshotDir, `${name}.png`);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function preparePage(cdp, sessionId, session, viewport, options = {}) {
  await setViewport(cdp, sessionId, viewport);
  await navigate(cdp, sessionId, "about:blank");
  const extraQuery = options.extraQuery ? `&${options.extraQuery}` : "";
  const qaUrl = `${appUrl}?qa-room=${encodeURIComponent(session.roomCode)}&qa-ts=${Date.now()}${extraQuery}`;
  const objectiveStorageKey = `citadel-objective-intro:${session.roomCode}`;
  const skipObjectiveIntro = options.skipObjectiveIntro !== false;
  const initScript = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (() => {
        if (
          location.origin !== ${JSON.stringify(new URL(appUrl).origin)} ||
          new URLSearchParams(location.search).get("qa-room") !== ${JSON.stringify(session.roomCode)}
        ) return;
        localStorage.clear();
        localStorage.setItem("zy-board-game-session", ${JSON.stringify(JSON.stringify(session))});
        if (${JSON.stringify(skipObjectiveIntro)}) {
          sessionStorage.setItem(${JSON.stringify(objectiveStorageKey)}, "seen");
        } else {
          sessionStorage.removeItem(${JSON.stringify(objectiveStorageKey)});
        }
      })();
    `
  }, sessionId);

  try {
    await navigate(cdp, sessionId, qaUrl);
  } finally {
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: initScript.identifier
    }, sessionId);
  }
  await waitForSelector(cdp, sessionId, ".citadel-game-shell", 20000);
  let objectiveIntro = null;
  let objectiveScreenshot = null;
  if (!skipObjectiveIntro) {
    await waitForSelector(cdp, sessionId, ".citadel-game-objective-intro", 3000);
    await delay(600);
    objectiveIntro = await evaluate(cdp, sessionId, `
      (() => {
        const element = document.querySelector(".citadel-game-objective-intro");
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          text: element.innerText
        };
      })()
    `);
    objectiveScreenshot = await captureScreenshot(
      cdp,
      sessionId,
      options.objectiveScreenshotName ?? `${session.roomCode}-objective-intro`
    );
    await waitForSelectorAbsent(cdp, sessionId, ".citadel-game-objective-intro", 7000);
  }
  await waitForSelector(cdp, sessionId, ".citadel-action-dock", 20000);
  await waitForPageText(cdp, sessionId, session.roomCode, 20000);
  await delay(500);
  return { objectiveIntro, objectiveScreenshot };
}

async function collectLayout(cdp, sessionId, exerciseSkillButton = false) {
  if (exerciseSkillButton) {
    await evaluate(cdp, sessionId, `
      (() => {
        const button = document.querySelector(".citadel-action-button--skill") ??
          document.querySelector(".citadel-action-button--panel");
        if (button) button.click();
      })();
    `);
    await delay(250);
  }

  return evaluate(cdp, sessionId, `
    (() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return {
          selector,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          text: (element.innerText || element.textContent || "").trim().slice(0, 120)
        };
      };
      const rects = (selector) => [...document.querySelectorAll(selector)].map((element) => {
        const r = element.getBoundingClientRect();
        return {
          selector,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          text: (element.innerText || element.textContent || "").trim().slice(0, 120)
        };
      });
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          bodyScrollWidth: document.documentElement.scrollWidth,
          bodyScrollHeight: document.documentElement.scrollHeight
        },
        text: document.body.innerText,
        shellClass: document.querySelector(".citadel-game-shell")?.className ?? "",
        crownPlayerId: document.querySelector(".citadel-game-shell")?.getAttribute("data-crown-player-id") ?? "",
        shell: rect(".citadel-game-shell"),
        table: rect(".citadel-game-table"),
        tableVisual: (() => {
          const element = document.querySelector(".citadel-game-table");
          if (!element) return null;
          const style = getComputedStyle(element);
          return { backgroundImage: style.backgroundImage };
        })(),
        board: rect(".citadel-game-board"),
        boardVisual: (() => {
          const element = document.querySelector(".citadel-game-board");
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow,
            beforeDisplay: getComputedStyle(element, "::before").display,
            afterDisplay: getComputedStyle(element, "::after").display
          };
        })(),
        topbar: rect(".citadel-game-topbar"),
        center: rect(".citadel-game-center"),
        centerCallout: rect(".citadel-game-center__callout"),
        centerTimer: rect(".citadel-game-center__timer"),
        objectiveIntro: rect(".citadel-game-objective-intro"),
        objectiveSummary: rect(".citadel-game-room-card small"),
        centerLines: rects(".citadel-game-center p, .citadel-game-center__timer"),
        actionDock: rect(".citadel-action-dock"),
        actionDockVisual: (() => {
          const element = document.querySelector(".citadel-action-layer .citadel-action-dock");
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            borderTopWidth: style.borderTopWidth,
            borderRightWidth: style.borderRightWidth,
            borderBottomWidth: style.borderBottomWidth,
            borderLeftWidth: style.borderLeftWidth,
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow
          };
        })(),
        actionPopover: rect(".citadel-action-popover"),
        actionButtons: rects(".citadel-action-button"),
        actionGuidance: rect(".citadel-action-guidance"),
        drawChoicePanel: rect(".citadel-action-dock--draw-choice"),
        drawChoiceCards: rects(".citadel-district-choice-card"),
        drawChoiceCardParts: [...document.querySelectorAll(".citadel-district-choice-card")].map((card) => ({
          cost: Boolean(card.querySelector(".citadel-district-choice-card__cost")),
          score: Boolean(card.querySelector(".citadel-district-choice-card__score")),
          art: Boolean(card.querySelector(".citadel-district-choice-card__art")),
          name: Boolean(card.querySelector(":scope > strong")),
          type: Boolean(card.querySelector(":scope > small")),
          description: Boolean(card.querySelector(":scope > p")),
          action: Boolean(card.querySelector(":scope > b"))
        })),
        selfArea: rect(".citadel-self-area"),
        selfProfile: rect(".citadel-self-profile"),
        deckCard: rect(".citadel-self-identity-cluster .citadel-card-back"),
        discardCard: rect(".citadel-self-hand-side .citadel-deck-stack--muted .citadel-card-back"),
        selfCity: rect(".citadel-self-city"),
        builtCards: rects(".citadel-built-card"),
        handZone: rect(".citadel-hand-zone"),
        selfRoleCard: rect(".citadel-self-role-card .citadel-role-card"),
        handCards: rects(".citadel-hand-card"),
        roleCards: rects(".citadel-role-card"),
        roleChoiceCards: rects(".citadel-action-dock--roles .citadel-role-choice.citadel-role-card"),
        opponentRoleCards: rects(".citadel-opponent-card-line .citadel-role-card"),
        tooltipAnchors: rects("[data-tooltip], [data-card-inspector]"),
        confirmDialog: rect(".confirm-dialog"),
        modalBackdrop: rect(".modal-backdrop"),
        cornerDocks: rects(".citadel-corner-dock"),
        opponentSeats: [...document.querySelectorAll(".citadel-opponent-seat")].map((seat) => {
          const seatRect = seat.getBoundingClientRect();
          const elementRect = (element) => {
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
          };
          const cityCards = [...seat.querySelectorAll(".citadel-mini-city-card")];
          return {
            selector: ".citadel-opponent-seat",
            left: seatRect.left,
            top: seatRect.top,
            right: seatRect.right,
            bottom: seatRect.bottom,
            width: seatRect.width,
            height: seatRect.height,
            text: (seat.innerText || seat.textContent || "").trim().slice(0, 120),
            position: seat.getAttribute("data-seat-position") ?? "",
            dense: seat.classList.contains("is-dense"),
            cityCount: Number(seat.getAttribute("data-city-count") ?? 0),
            profile: elementRect(seat.querySelector(".citadel-player-mini")),
            privateRow: elementRect(seat.querySelector(".citadel-opponent-card-line")),
            cityRow: elementRect(seat.querySelector(".citadel-mini-city-row")),
            handCards: [...seat.querySelectorAll(".citadel-opponent-card-line .citadel-mini-card")].map((card) => elementRect(card)),
            cityCards: cityCards.map((card) => elementRect(card))
          };
        }),
        denseOpponentSeats: rects(".citadel-opponent-seat.is-dense"),
        opponentHandRows: rects(".citadel-opponent-card-line .citadel-mini-card-row"),
        opponentCityRows: rects(".citadel-mini-city-row"),
        opponentHandCardCounts: [...document.querySelectorAll(".citadel-opponent-seat")].map((seat) => ({
          dense: seat.classList.contains("is-dense"),
          visibleCards: seat.querySelectorAll(".citadel-opponent-card-line .citadel-mini-card").length,
          overflowBadge: seat.querySelector(".citadel-mini-card-count")?.textContent?.trim() ?? ""
        })),
        tableTargetingDock: rect(".citadel-action-dock--table-targeting"),
        tableTargetingPrompt: rect(".citadel-action-dock--table-targeting .citadel-action-guidance"),
        targetableDistricts: rects(".citadel-mini-city-card.is-targetable"),
        untargetableDistricts: rects(".citadel-mini-city-card.is-untargetable"),
        crownMarkers: [...document.querySelectorAll(".citadel-player-mini__crown")].map((marker) => ({
          playerId: marker.closest(".citadel-player-mini")?.getAttribute("data-player-id") ?? "",
          text: marker.textContent?.trim() ?? "",
          backgroundImage: getComputedStyle(marker).backgroundImage,
          rect: (() => {
            const box = marker.getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
          })()
        }))
      };
    })()
  `, 15000);
}

async function seedFullOpponentCities(cdp, sessionId, citySize = 8) {
  await evaluate(cdp, sessionId, `
    (() => {
      const colors = ["yellow", "blue", "green", "red", "purple"];
      for (const [seatIndex, seat] of [...document.querySelectorAll(".citadel-opponent-seat")].entries()) {
        const row = seat.querySelector(".citadel-mini-city-row");
        if (!row) continue;
        row.replaceChildren();
        for (let cardIndex = 0; cardIndex < ${citySize}; cardIndex += 1) {
          const card = document.createElement("article");
          card.className = "citadel-mini-city-card citadel-mini-city-card--" + colors[(seatIndex + cardIndex) % colors.length];
          card.tabIndex = 0;
          card.setAttribute("aria-label", "布局验收建筑 " + (cardIndex + 1));
          card.setAttribute("data-tooltip", "满建筑布局验收");
          const cost = document.createElement("span");
          cost.className = "citadel-mini-city-card__cost";
          cost.textContent = String((cardIndex % 5) + 1);
          const name = document.createElement("strong");
          name.className = "citadel-mini-city-card__name";
          name.textContent = "建筑" + (cardIndex + 1);
          card.append(cost, name);
          row.append(card);
        }
        row.setAttribute("aria-label", "已建建筑 ${citySize}");
        seat.setAttribute("data-city-count", String(${citySize}));
      }
    })()
  `);
  await delay(120);
}

async function seedFullRoleChoices(cdp, sessionId, roleCount = 8) {
  await evaluate(cdp, sessionId, `
    (() => {
      const panel = document.querySelector(".citadel-action-dock--roles");
      const source = panel?.querySelector(".citadel-role-choice");
      if (!panel || !source) return false;
      const names = ["刺客", "盗贼", "魔术师", "国王", "主教", "商人", "建筑师", "军阀"];
      panel.replaceChildren();
      for (let index = 0; index < ${roleCount}; index += 1) {
        const card = source.cloneNode(true);
        card.querySelector(".citadel-role-card__order").textContent = String(index + 1);
        card.querySelector("strong").textContent = names[index] ?? ("身份" + (index + 1));
        const caption = card.querySelector("small");
        if (caption) caption.textContent = "选择身份";
        panel.append(card);
      }
      return true;
    })()
  `);
  await delay(120);
}

async function collectCardInspectorHover(cdp, sessionId, selector) {
  const target = await evaluate(cdp, sessionId, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        text: (element.innerText || element.textContent || "").trim(),
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
      };
    })()
  `);
  if (!target) return null;

  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
    button: "none"
  }, sessionId);
  await delay(150);

  return evaluate(cdp, sessionId, `
    (() => {
      const inspector = document.querySelector(".citadel-card-inspector");
      if (!inspector) return null;
      const target = document.querySelector(${JSON.stringify(selector)});
      const rect = inspector.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const card = inspector.querySelector(".citadel-card-inspector__card")?.getBoundingClientRect();
      const description = inspector.querySelector(".citadel-card-inspector__description")?.getBoundingClientRect();
      const actionDock = document.querySelector(".citadel-action-dock")?.getBoundingClientRect();
      const center = document.querySelector(".citadel-game-center")?.getBoundingClientRect();
      const compactRect = (value) => value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        target: targetRect ? { left: targetRect.left, top: targetRect.top, right: targetRect.right, bottom: targetRect.bottom, width: targetRect.width, height: targetRect.height } : null,
        text: (inspector.innerText || inspector.textContent || "").trim(),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        card: card ? { left: card.left, top: card.top, right: card.right, bottom: card.bottom, width: card.width, height: card.height } : null,
        description: description ? { left: description.left, top: description.top, right: description.right, bottom: description.bottom, width: description.width, height: description.height } : null,
        actionDock: compactRect(actionDock),
        center: compactRect(center),
        kind: inspector.classList.contains("citadel-card-inspector--role") ? "role" : "district"
      };
    })()
  `);
}

async function collectTooltipHover(cdp, sessionId) {
  return collectCardInspectorHover(cdp, sessionId, ".citadel-self-role-card [data-card-inspector]");
}

async function closeCardInspector(cdp, sessionId) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 8,
    y: 8,
    button: "none"
  }, sessionId);
  await delay(80);
  return evaluate(cdp, sessionId, `!document.querySelector(".citadel-card-inspector")`);
}
function intersects(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function insideViewport(rect, viewport, margin = 0) {
  if (!rect) return false;
  return (
    rect.left >= margin &&
    rect.top >= margin &&
    rect.right <= viewport.width - margin &&
    rect.bottom <= viewport.height - margin
  );
}

function insideRect(child, parent, tolerance = 0) {
  if (!child || !parent) return false;
  return (
    child.left >= parent.left - tolerance &&
    child.top >= parent.top - tolerance &&
    child.right <= parent.right + tolerance &&
    child.bottom <= parent.bottom + tolerance
  );
}

function checkLayout(label, layout, options = {}) {
  const failures = [];
  const checks = [];
  const addCheck = (name, pass, details = undefined) => {
    checks.push({ name, pass, details });
    if (!pass) failures.push({ name, details });
  };

  const viewport = layout.viewport;
  const wideTurnPanel = viewport?.width >= 1501 && viewport?.height >= 700;
  addCheck("game shell exists", Boolean(layout.shell));
  addCheck("action dock exists", Boolean(layout.actionDock));
  addCheck("center status exists", Boolean(layout.center));
  addCheck("center timer exists", Boolean(layout.centerTimer));
  addCheck("role-action callout names the numbered public identity", Boolean(
    layout.centerCallout?.text.includes("\u53f7") &&
    layout.centerCallout.text.includes("\u00b7") &&
    layout.centerCallout.text.endsWith("\u884c\u52a8")
  ), layout.centerCallout);
  addCheck("exactly one crown marker follows the public crown owner", Boolean(
    layout.crownPlayerId &&
    layout.crownMarkers?.length === 1 &&
    layout.crownMarkers[0].playerId === layout.crownPlayerId
  ), {
    crownPlayerId: layout.crownPlayerId,
    crownMarkers: layout.crownMarkers
  });
  addCheck("crown marker uses the frameless generated art above the avatar", Boolean(
    layout.crownMarkers?.length === 1 &&
    layout.crownMarkers[0].text === "" &&
    layout.crownMarkers[0].backgroundImage.includes("citadels-crown-icon-v1.png")
  ), layout.crownMarkers);
  addCheck("game table uses the warm production background v2", Boolean(
    layout.tableVisual?.backgroundImage.includes("citadels-game-table-background-v2.png")
  ), layout.tableVisual);
  addCheck("board uses the background artwork without an extra solid panel", Boolean(
    layout.boardVisual &&
    layout.boardVisual.backgroundColor === "rgba(0, 0, 0, 0)" &&
    layout.boardVisual.backgroundImage === "none" &&
    layout.boardVisual.boxShadow === "none" &&
    layout.boardVisual.beforeDisplay === "none" &&
    layout.boardVisual.afterDisplay === "none"
  ), layout.boardVisual);
  addCheck(wideTurnPanel ? "wide turn controls use the lower-right action panel" : "compact turn controls have no outer frame", Boolean(
    layout.actionDockVisual && (wideTurnPanel
      ? layout.actionDockVisual.borderTopWidth !== "0px" &&
        layout.actionDockVisual.backgroundImage !== "none" &&
        layout.actionDockVisual.boxShadow !== "none"
      : layout.actionDockVisual.borderTopWidth === "0px" &&
        layout.actionDockVisual.borderRightWidth === "0px" &&
        layout.actionDockVisual.borderBottomWidth === "0px" &&
        layout.actionDockVisual.borderLeftWidth === "0px" &&
        layout.actionDockVisual.backgroundColor === "rgba(0, 0, 0, 0)" &&
        layout.actionDockVisual.backgroundImage === "none" &&
        layout.actionDockVisual.boxShadow === "none")
  ), layout.actionDockVisual);

  if (layout.shell) {
    addCheck("shell fills viewport width", Math.abs(layout.shell.width - viewport.width) <= 2 && layout.shell.left <= 1, {
      shell: layout.shell,
      viewport
    });
    addCheck("shell fills viewport height", Math.abs(layout.shell.height - viewport.height) <= 2 && layout.shell.top <= 1, {
      shell: layout.shell,
      viewport
    });
  }

  for (const [name, rect] of [
    ["topbar inside viewport", layout.topbar],
    ["center inside viewport", layout.center],
    ["timer inside viewport", layout.centerTimer],
    ["action dock inside viewport", layout.actionDock],
    ["self area inside viewport", layout.selfArea],
    ["hand zone inside viewport", layout.handZone],
    ["self city inside viewport", layout.selfCity]
  ]) {
    addCheck(name, insideViewport(rect, viewport), rect);
  }
  addCheck("victory objective remains available in the top-left room card", Boolean(
    layout.objectiveSummary && layout.objectiveSummary.text.includes("\u76ee\u6807")
  ), layout.objectiveSummary);
  addCheck("turn guidance is visible beside the action controls", Boolean(
    layout.actionGuidance && layout.actionGuidance.text.includes("\u5f53\u524d\u6b65\u9aa4")
  ), layout.actionGuidance);

  for (const line of layout.centerLines ?? []) {
    addCheck(`action dock does not overlap center line: ${line.text}`, !intersects(layout.actionDock, line, 8), {
      actionDock: layout.actionDock,
      centerLine: line
    });
  }

  if (wideTurnPanel) {
    const protectedSelfElements = [
      layout.selfProfile,
      layout.deckCard,
      layout.discardCard,
      layout.selfRoleCard,
      ...(layout.handCards ?? [])
    ].filter(Boolean);
    addCheck("lower-right action panel stays clear of the visible self cards", protectedSelfElements.every(
      (element) => !intersects(layout.actionDock, element, 8)
    ), { actionDock: layout.actionDock, protectedSelfElements });
  } else {
    addCheck("action dock does not overlap self area", !intersects(layout.actionDock, layout.selfArea, 8), {
      actionDock: layout.actionDock,
      selfArea: layout.selfArea
    });
    addCheck("action dock does not overlap hand zone", !intersects(layout.actionDock, layout.handZone, 8), {
      actionDock: layout.actionDock,
      handZone: layout.handZone
    });
    addCheck("built district zone sits above the action dock", Boolean(
      layout.selfCity && layout.actionDock && layout.selfCity.bottom + 8 <= layout.actionDock.top
    ), {
      selfCity: layout.selfCity,
      actionDock: layout.actionDock
    });
  }
  addCheck("center status does not overlap the built district zone", !intersects(layout.center, layout.selfCity, 8), {
    center: layout.center,
    selfCity: layout.selfCity
  });
  for (const seat of layout.opponentSeats ?? []) {
    addCheck(`center status does not overlap opponent seat: ${seat.text}`, !intersects(layout.center, seat, 8), {
      center: layout.center,
      opponentSeat: seat
    });
  }
  if ((layout.builtCards?.length ?? 0) > 0) {
    for (const builtCard of layout.builtCards) {
      addCheck(`built district card inside viewport: ${builtCard.text}`, insideViewport(builtCard, viewport), builtCard);
      addCheck(`built district sits above hand: ${builtCard.text}`, builtCard.bottom <= layout.handZone.top + 4, {
        builtCard,
        handZone: layout.handZone
      });
      addCheck(`action dock does not overlap built district: ${builtCard.text}`, !intersects(layout.actionDock, builtCard, 8), {
        actionDock: layout.actionDock,
        builtCard
      });
    }
    const firstHandCard = layout.handCards?.[0] ?? null;
    const firstBuiltCard = layout.builtCards[0] ?? null;
    addCheck("built district cards are larger than hand cards", Boolean(firstBuiltCard && firstHandCard && firstBuiltCard.height > firstHandCard.height && firstBuiltCard.width > firstHandCard.width), {
      builtCard: firstBuiltCard,
      handCard: firstHandCard
    });
  }
  addCheck("topbar does not overlap action dock", !intersects(layout.topbar, layout.actionDock, 8), {
    topbar: layout.topbar,
    actionDock: layout.actionDock
  });

  const firstHandCard = layout.handCards?.[0] ?? null;
  addCheck("self role card exists", Boolean(layout.selfRoleCard), layout.selfRoleCard);
  addCheck("self role card sits left of hand cards", Boolean(layout.selfRoleCard && firstHandCard && layout.selfRoleCard.right <= firstHandCard.left + 4), {
    selfRoleCard: layout.selfRoleCard,
    firstHandCard
  });
  if (layout.selfRoleCard && firstHandCard) {
    addCheck("self role card aligns with the hand-card baseline", Math.abs(layout.selfRoleCard.bottom - firstHandCard.bottom) <= 4, {
      selfRoleCard: layout.selfRoleCard,
      firstHandCard
    });
  }
  if (layout.handZone) {
    addCheck("hand zone is centered on the viewport", Math.abs((layout.handZone.left + layout.handZone.right) / 2 - viewport.width / 2) <= 8, {
      handZone: layout.handZone,
      viewport
    });
  }
  if (layout.deckCard && layout.discardCard) {
    addCheck("draw and discard piles use the same baseline", Math.abs(layout.deckCard.bottom - layout.discardCard.bottom) <= 4, {
      deckCard: layout.deckCard,
      discardCard: layout.discardCard
    });
    addCheck("game log does not cover the draw pile", !intersects(layout.cornerDocks?.[0], layout.deckCard, 4), {
      logDock: layout.cornerDocks?.[0],
      deckCard: layout.deckCard
    });
    addCheck("chat does not cover the discard pile", !intersects(layout.cornerDocks?.[1], layout.discardCard, 4), {
      chatDock: layout.cornerDocks?.[1],
      discardCard: layout.discardCard
    });
  }
  addCheck("each opponent has a role card beside cards", (layout.opponentRoleCards?.length ?? 0) === (layout.opponentSeats?.length ?? 0), {
    opponentRoleCards: layout.opponentRoleCards?.length ?? 0,
    opponentSeats: layout.opponentSeats?.length ?? 0
  });
  for (const roleCard of layout.roleCards ?? []) {
    addCheck(`role card inside viewport: ${roleCard.text}`, insideViewport(roleCard, viewport), roleCard);
  }
  addCheck("role, card-inspector, and action detail anchors are present", (layout.tooltipAnchors?.length ?? 0) >= 5, {
    count: layout.tooltipAnchors?.length ?? 0,
    labels: (layout.tooltipAnchors ?? []).map((anchor) => anchor.text)
  });
  addCheck("legacy test bot label is absent", !layout.text.includes("测试人机") && !layout.text.includes("娴嬭瘯浜烘満"));
  addCheck("framework error overlay is absent", !/vite|webpack|runtime error|failed to compile/i.test(layout.text));

  for (const seat of layout.opponentSeats ?? []) {
    addCheck(`opponent seat stays inside viewport: ${seat.text}`, insideViewport(seat, viewport, 2), seat);
    addCheck(`opponent seat does not overlap action controls: ${seat.text}`, !intersects(seat, layout.actionDock, 6), {
      opponentSeat: seat,
      actionDock: layout.actionDock
    });
    addCheck(`opponent seat does not overlap self area: ${seat.text}`, !intersects(seat, layout.selfArea, 6), {
      opponentSeat: seat,
      selfArea: layout.selfArea
    });
    addCheck(`opponent public city card count matches server state: ${seat.position}`, seat.cityCards.length === seat.cityCount, {
      position: seat.position,
      cityCount: seat.cityCount,
      renderedCards: seat.cityCards.length
    });
    for (const card of seat.handCards ?? []) {
      const ratio = card.height / card.width;
      addCheck(`opponent hand back keeps a 2:3 portrait ratio: ${seat.position}`, Math.abs(ratio - 1.5) <= 0.04, {
        position: seat.position,
        ratio,
        card
      });
      addCheck(`opponent hand back stays inside its private-card lane: ${seat.position}`, insideRect(card, seat.privateRow, 1), {
        position: seat.position,
        privateRow: seat.privateRow,
        card
      });
    }
    for (const card of seat.cityCards) {
      const minWidth = seat.dense ? 28 : 32;
      const minHeight = seat.dense ? 42 : 46;
      addCheck(`opponent district is a readable face-up card: ${seat.position}`, Boolean(
        card.width >= minWidth &&
        card.height >= minHeight &&
        card.height > card.width &&
        insideViewport(card, viewport, 2)
      ), { position: seat.position, dense: seat.dense, card });
      addCheck(`opponent district stays inside its own city lane: ${seat.position}`, insideRect(card, seat.cityRow, 1), {
        position: seat.position,
        cityRow: seat.cityRow,
        card
      });
      for (const handCard of seat.handCards ?? []) {
        addCheck(`opponent hand and public district do not interleave: ${seat.position}`, !intersects(handCard, card), {
          position: seat.position,
          handCard,
          districtCard: card
        });
      }
    }
    for (let cardIndex = 1; cardIndex < seat.cityCards.length; cardIndex += 1) {
      const previous = seat.cityCards[cardIndex - 1];
      const current = seat.cityCards[cardIndex];
      addCheck(`opponent city keeps ordered readable card strips: ${seat.position}`, current.left - previous.left >= 10, {
        position: seat.position,
        previous,
        current,
        visibleStrip: current.left - previous.left
      });
    }
    if (seat.profile && seat.privateRow && seat.cityRow) {
      if (seat.position.startsWith("top-")) {
        addCheck(`top opponent city faces down toward table center: ${seat.position}`, seat.cityRow.top >= seat.profile.bottom + 4, seat);
      } else if (seat.position.startsWith("left-")) {
        addCheck(`left opponent city faces right toward table center: ${seat.position}`, seat.cityRow.left >= seat.privateRow.right + 4, seat);
      } else if (seat.position.startsWith("right-")) {
        addCheck(`right opponent city faces left toward table center: ${seat.position}`, seat.cityRow.right <= seat.privateRow.left - 4, seat);
      }
    }
  }
  for (let leftIndex = 0; leftIndex < (layout.opponentSeats?.length ?? 0); leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layout.opponentSeats.length; rightIndex += 1) {
      addCheck(`opponent seats ${leftIndex + 1} and ${rightIndex + 1} do not overlap`, !intersects(
        layout.opponentSeats[leftIndex],
        layout.opponentSeats[rightIndex],
        6
      ), {
        first: layout.opponentSeats[leftIndex],
        second: layout.opponentSeats[rightIndex]
      });
    }
  }
  addCheck("each opponent keeps separate hand and city rows", Boolean(
    layout.opponentSeats?.length > 0 &&
    layout.opponentHandRows?.length === layout.opponentSeats.length &&
    layout.opponentCityRows?.length === layout.opponentSeats.length
  ), {
    opponents: layout.opponentSeats?.length ?? 0,
    handRows: layout.opponentHandRows?.length ?? 0,
    cityRows: layout.opponentCityRows?.length ?? 0
  });

  if (options.expectedOpponentCount) {
    addCheck(`table shows ${options.expectedOpponentCount} opponents`, layout.opponentSeats?.length === options.expectedOpponentCount, {
      opponents: layout.opponentSeats?.length ?? 0
    });
    addCheck("only constrained side seats use dense mode", layout.denseOpponentSeats?.length === (options.expectedDenseCount ?? 0), {
      denseSeats: layout.denseOpponentSeats?.length ?? 0,
      expectedDenseCount: options.expectedDenseCount ?? 0
    });
    addCheck("dense seats show at most three hand backs", (layout.opponentHandCardCounts ?? []).filter((row) => row.dense).every((row) => row.visibleCards <= 3), {
      rows: layout.opponentHandCardCounts
    });
  }

  if (options.expectedCityCount) {
    addCheck(`every opponent shows a complete ${options.expectedCityCount}-district city`, Boolean(
      layout.opponentSeats?.length > 0 &&
      layout.opponentSeats.every((seat) => seat.cityCards.length === options.expectedCityCount)
    ), (layout.opponentSeats ?? []).map((seat) => ({ position: seat.position, cityCards: seat.cityCards.length })));
  }

  if (options.afterSkillClick) {
    addCheck("action dock exposes use skill button", (layout.actionButtons ?? []).some((button) => button.text.includes("使用技能") || button.text.includes("浣跨敤鎶€鑳?")), {
      buttons: (layout.actionButtons ?? []).map((button) => button.text)
    });
    addCheck("skill button does not open a secondary panel", !layout.actionPopover, layout.actionPopover);
  }

  return { label, pass: failures.length === 0, failures, checks };
}

function checkObjectiveIntro(label, objectiveIntro, endCitySize) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass, details });
  addCheck("opening victory objective appears in the center", Boolean(objectiveIntro), objectiveIntro);
  addCheck("opening victory objective uses the room city target", Boolean(
    objectiveIntro?.text?.includes(String(endCitySize)) && objectiveIntro.text.includes("\u603b\u5206")
  ), objectiveIntro);
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectDrawChoiceFlow(cdp, sessionId, screenshotName) {
  const clicked = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector(".citadel-action-button--draw:not(:disabled)");
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) {
    return { opened: false, beforeChoice: await collectLayout(cdp, sessionId), afterChoice: null, screenshot: null };
  }
  await waitForSelector(cdp, sessionId, ".citadel-district-choice-card", 10000);
  await delay(220);
  const beforeChoice = await collectLayout(cdp, sessionId);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-district-choice-card")?.click()`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-action-dock--draw-choice", 10000);
  await delay(180);
  return { opened: true, beforeChoice, afterChoice: await collectLayout(cdp, sessionId), screenshot };
}

function checkDrawChoiceFlow(label, flow) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass, details });
  const cards = flow.beforeChoice?.drawChoiceCards ?? [];
  addCheck("draw choice opens from the visible draw button", flow.opened, flow.beforeChoice);
  addCheck("draw choice uses two or three district cards", cards.length >= 2 && cards.length <= 3, cards);
  for (const card of cards) {
    addCheck(`draw choice is a portrait card: ${card.text}`, card.height >= card.width * 1.25, card);
    addCheck(`draw choice card is inside viewport: ${card.text}`, insideViewport(card, flow.beforeChoice.viewport, 4), card);
  }
  for (const [index, parts] of (flow.beforeChoice?.drawChoiceCardParts ?? []).entries()) {
    addCheck(`draw choice card ${index + 1} exposes all card elements`, Object.values(parts).every(Boolean), parts);
  }
  addCheck("draw choice closes after selecting a card", !flow.afterChoice?.drawChoicePanel, flow.afterChoice?.drawChoicePanel);
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

function checkTooltipHover(label, tooltipHover) {
  const failures = [];
  const checks = [];
  const addCheck = (name, pass, details = undefined) => {
    checks.push({ name, pass, details });
    if (!pass) failures.push({ name, details });
  };

  addCheck("hover tooltip target exists", Boolean(tooltipHover), tooltipHover);
  if (tooltipHover) {
    addCheck("card inspector has card and explanatory text", Boolean(tooltipHover.card && tooltipHover.description && tooltipHover.text), tooltipHover);
    addCheck("self role opens the role inspector", tooltipHover.kind === "role", tooltipHover);
    addCheck("card inspector stays inside the viewport", insideViewport(tooltipHover.rect, tooltipHover.viewport, 4), tooltipHover);
  }

  return { label, pass: failures.length === 0, failures, checks };
}

function checkRoleSelectionLayout(label, layout, expectedRoleCount = null) {
  const failures = [];
  const checks = [];
  const addCheck = (name, pass, details = undefined) => {
    checks.push({ name, pass, details });
    if (!pass) failures.push({ name, details });
  };

  const roleChoiceCards = layout.roleChoiceCards ?? [];
  addCheck("role selection callout does not reveal an identity", Boolean(
    layout.centerCallout?.text.includes("\u9009\u62e9\u8eab\u4efd") &&
    !layout.centerCallout.text.includes("\u53f7")
  ), layout.centerCallout);
  addCheck("role selection keeps exactly one public crown marker", Boolean(
    layout.crownPlayerId &&
    layout.crownMarkers?.length === 1 &&
    layout.crownMarkers[0].playerId === layout.crownPlayerId
  ), {
    crownPlayerId: layout.crownPlayerId,
    crownMarkers: layout.crownMarkers
  });
  addCheck("role selection panel stays below the center status and countdown", Boolean(
    layout.actionDock &&
    layout.center &&
    layout.actionDock.top >= layout.center.bottom + 12
  ), {
    roleSelectionPanel: layout.actionDock,
    centerStatus: layout.center,
    countdown: layout.centerTimer
  });
  addCheck("role selection panel stays above the player's hand", Boolean(
    layout.actionDock &&
    layout.selfArea &&
    layout.actionDock.bottom + 12 <= layout.selfArea.top
  ), {
    roleSelectionPanel: layout.actionDock,
    selfArea: layout.selfArea,
    handZone: layout.handZone
  });
  addCheck("role selection uses card-shaped choices", roleChoiceCards.length > 0, {
    count: roleChoiceCards.length,
    labels: roleChoiceCards.map((card) => card.text)
  });
  if (expectedRoleCount) {
    addCheck(`role selection keeps all ${expectedRoleCount} choices on one row`, Boolean(
      roleChoiceCards.length === expectedRoleCount &&
      roleChoiceCards.every((card) => Math.abs(card.top - roleChoiceCards[0].top) <= 2)
    ), roleChoiceCards);
  }
  for (const card of roleChoiceCards) {
    addCheck(`role choice is portrait card: ${card.text}`, card.height >= card.width * 1.25, card);
    addCheck(`role choice inside viewport: ${card.text}`, insideViewport(card, layout.viewport), card);
  }
  for (const line of layout.centerLines ?? []) {
    const overlappingCards = roleChoiceCards.filter((card) => intersects(card, line, 8));
    addCheck(`role choices do not overlap center line: ${line.text}`, overlappingCards.length === 0, {
      centerLine: line,
      overlappingCards
    });
  }
  addCheck("role choices use tooltip-capable cards", roleChoiceCards.length > 0 && roleChoiceCards.every((card) => card.selector.includes("citadel-role-choice")), {
    roleChoiceCards
  });

  return { label, pass: failures.length === 0, failures, checks };
}

async function collectBuildConfirmFlow(cdp, sessionId, setup) {
  const goldStatePromise = waitFor(
    setup.socket,
    "game_state",
    (state) => state.roomId === setup.created.roomCode,
    12000,
    "state after take_gold before build confirm"
  );
  setup.socket.emit("take_gold", { roomCode: setup.created.roomCode, playerId: setup.created.playerId });
  try {
    await goldStatePromise;
  } catch {
    // If the player cannot take gold, continue and let the build check report the visible state.
  }
  await delay(300);

  async function clickFirstBuildableHandCard() {
    return evaluate(cdp, sessionId, `
      (() => {
        const button = [...document.querySelectorAll(".citadel-hand-card:not(:disabled)")][0];
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
  }

  let opened = await clickFirstBuildableHandCard();
  if (!opened) {
    const statePromise = waitFor(
      setup.socket,
      "game_state",
      (state) => state.roomId === setup.created.roomCode,
      12000,
      "state after take_gold for build confirm"
    );
    setup.socket.emit("take_gold", { roomCode: setup.created.roomCode, playerId: setup.created.playerId });
    await statePromise;
    await delay(300);
    opened = await clickFirstBuildableHandCard();
  }

  if (!opened) {
    return { opened: false, beforeEnd: await collectLayout(cdp, sessionId), afterEnd: null };
  }

  await waitForSelector(cdp, sessionId, ".confirm-dialog", 10000);
  await delay(180);
  const beforeEnd = await collectLayout(cdp, sessionId);
  await evaluate(cdp, sessionId, `
    (() => {
      const confirmButton = document.querySelector(".confirm-dialog__actions button:last-child");
      if (confirmButton) confirmButton.click();
    })()
  `);
  try {
    await waitForSelectorAbsent(cdp, sessionId, ".confirm-dialog", 10000);
  } catch {
    // Keep the later layout check as the source of truth if the dialog did not close.
  }
  try {
    await waitForSelector(cdp, sessionId, ".citadel-built-card", 8000);
  } catch {
    // If no built card appears, collect the current layout so the check can report it.
  }
  await delay(180);
  const afterEnd = await collectLayout(cdp, sessionId);
  return { opened, beforeEnd, afterEnd };
}

function checkBuildConfirmFlow(label, flow) {
  const failures = [];
  const checks = [];
  const addCheck = (name, pass, details = undefined) => {
    checks.push({ name, pass, details });
    if (!pass) failures.push({ name, details });
  };

  addCheck("build confirm can be opened", flow.opened, flow.beforeEnd);
  if (flow.beforeEnd) {
    addCheck("build confirm dialog exists", Boolean(flow.beforeEnd.confirmDialog), flow.beforeEnd.confirmDialog);
    addCheck("game shell marks confirming state", flow.beforeEnd.shellClass.includes("citadel-game-shell--confirming"), flow.beforeEnd.shellClass);
    addCheck("action dock does not overlap build confirm", !intersects(flow.beforeEnd.actionDock, flow.beforeEnd.confirmDialog, 6), {
      actionDock: flow.beforeEnd.actionDock,
      confirmDialog: flow.beforeEnd.confirmDialog
    });
  }
  if (flow.afterEnd) {
    addCheck("build confirm closes after confirming build", !flow.afterEnd.confirmDialog, flow.afterEnd.confirmDialog);
    addCheck("built district appears after confirming build", (flow.afterEnd.builtCards?.length ?? 0) > 0, flow.afterEnd.builtCards);
    const firstBuiltCard = flow.afterEnd.builtCards?.[0] ?? null;
    const firstHandCard = flow.afterEnd.handCards?.[0] ?? null;
    if (firstBuiltCard && firstHandCard) {
      addCheck("confirmed built district is larger than hand cards", firstBuiltCard.height > firstHandCard.height && firstBuiltCard.width > firstHandCard.width, {
        builtCard: firstBuiltCard,
        handCard: firstHandCard
      });
      addCheck("confirmed built district sits above hand", firstBuiltCard.bottom <= flow.afterEnd.handZone.top + 4, {
        builtCard: firstBuiltCard,
        handZone: flow.afterEnd.handZone
      });
      addCheck("action dock does not overlap confirmed built district", !intersects(flow.afterEnd.actionDock, firstBuiltCard, 8), {
        actionDock: flow.afterEnd.actionDock,
        builtCard: firstBuiltCard
      });
      addCheck("confirmed built district sits above the action dock", firstBuiltCard.bottom + 8 <= flow.afterEnd.actionDock.top, {
        builtCard: firstBuiltCard,
        actionDock: flow.afterEnd.actionDock
      });
    }
  }

  return { label, pass: failures.length === 0, failures, checks };
}

async function collectTableTargetingFlow(cdp, sessionId, screenshotName) {
  const opened = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector(".citadel-action-button--skill:not(:disabled)");
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) {
    return { opened: false, targeting: await collectLayout(cdp, sessionId) };
  }
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--table-targeting", 10000);
  const targeting = await collectLayout(cdp, sessionId);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  const selectedTarget = await evaluate(cdp, sessionId, `
    (() => {
      const cards = [...document.querySelectorAll(".citadel-mini-city-card.is-targetable")];
      const card = cards.at(-1);
      if (!card) return null;
      const seat = card.closest(".citadel-opponent-seat");
      const result = {
        cardName: card.querySelector(".citadel-mini-city-card__name")?.textContent?.trim() ?? "",
        playerName: seat?.querySelector(".citadel-player-mini__copy strong")?.textContent?.trim() ?? "",
        position: seat?.getAttribute("data-seat-position") ?? ""
      };
      card.click();
      return result;
    })()
  `);
  if (!selectedTarget) {
    return { opened, targeting, screenshot, selectedTarget: null };
  }
  await waitForSelector(cdp, sessionId, ".confirm-dialog", 10000);
  const confirming = await collectLayout(cdp, sessionId);
  await evaluate(cdp, sessionId, `document.querySelector(".confirm-dialog__actions button:first-child")?.click()`);
  await waitForSelectorAbsent(cdp, sessionId, ".confirm-dialog", 10000);
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--table-targeting", 10000);
  const afterCancel = await collectLayout(cdp, sessionId);

  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-mini-city-card.is-targetable")].at(-1)?.click()
  `);
  await waitForSelector(cdp, sessionId, ".confirm-dialog", 10000);
  await evaluate(cdp, sessionId, `document.querySelector(".confirm-dialog__actions button:last-child")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--warlord_destroy", 10000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const presentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-presentation`);
  await waitForSelectorAbsent(cdp, sessionId, ".confirm-dialog", 10000);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-action-dock--table-targeting", 10000);
  await delay(220);
  const afterConfirm = await collectLayout(cdp, sessionId);
  return { opened, targeting, screenshot, selectedTarget, confirming, afterCancel, afterConfirm, presentation, presentationScreenshot };
}

function checkTableTargetingFlow(label, flow) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass, details });
  addCheck("warlord skill opens table targeting", flow.opened && Boolean(flow.targeting?.tableTargetingDock), flow.targeting);
  addCheck("table targeting gives a direct instruction", Boolean(
    flow.targeting?.tableTargetingPrompt?.text.includes("请选择一座高亮的其他玩家建筑")
  ), flow.targeting?.tableTargetingPrompt);
  addCheck("table targeting exposes public opponent districts", (flow.targeting?.targetableDistricts?.length ?? 0) > 0, {
    targetable: flow.targeting?.targetableDistricts,
    untargetable: flow.targeting?.untargetableDistricts
  });
  addCheck("a table district opens confirmation for its player and card", Boolean(
    flow.selectedTarget &&
    flow.confirming?.confirmDialog?.text.includes(flow.selectedTarget.playerName) &&
    flow.confirming.confirmDialog.text.includes(flow.selectedTarget.cardName)
  ), { selectedTarget: flow.selectedTarget, confirmDialog: flow.confirming?.confirmDialog });
  addCheck("cancelling confirmation returns to table targeting", Boolean(
    flow.afterCancel?.tableTargetingDock && !flow.afterCancel?.confirmDialog
  ), flow.afterCancel);
  addCheck("confirming the target exits table targeting", Boolean(
    flow.afterConfirm &&
    !flow.afterConfirm.tableTargetingDock &&
    !flow.afterConfirm.confirmDialog &&
    !flow.afterConfirm.shellClass.includes("citadel-game-shell--table-targeting")
  ), flow.afterConfirm);
  addCheck("warlord result uses a non-layout presentation overlay", Boolean(
    flow.presentation?.className.includes("warlord_destroy") &&
    flow.presentation.position === "absolute" &&
    flow.presentation.pointerEvents === "none" &&
    flow.presentation.coversTable
  ), flow.presentation);
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectRoleSkillTargetFlow(cdp, sessionId, screenshotName) {
  const opened = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector(".citadel-action-button--skill:not(:disabled)");
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) return { opened: false };
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--skill-roles", 10000);
  const optionCount = await evaluate(cdp, sessionId, `document.querySelectorAll(".citadel-skill-role-options .citadel-role-choice").length`);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-skill-role-options .citadel-role-choice")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-role-options .is-selected", 10000);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-skill-target-controls .citadel-action-button--gold")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--assassin_mark", 10000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const presentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-presentation`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-action-dock--skill-roles", 10000);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-skill-presentation", 5000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock .citadel-action-button")]
      .find((button) => button.textContent.includes("结束回合"))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--assassin_skip", 10000);
  const skipPresentation = await collectSkillPresentation(cdp, sessionId);
  const skipPresentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-skip-presentation`);
  return {
    opened,
    optionCount,
    screenshot,
    presentation,
    presentationScreenshot,
    skipPresentation,
    skipPresentationScreenshot,
    closedAfterConfirm: true
  };
}

async function collectMagicianDiscardFlow(cdp, sessionId, screenshotName) {
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-action-button--skill:not(:disabled)")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--skill-targeting", 10000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock--skill-targeting .citadel-action-button")]
      .find((button) => button.textContent.includes("弃牌并重抽"))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-hand-card.is-targetable", 10000);
  const targetableCount = await evaluate(cdp, sessionId, `document.querySelectorAll(".citadel-hand-card.is-targetable").length`);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-hand-card.is-targetable")].slice(0, 2).forEach((card) => card.click())
  `);
  const selectedCount = await evaluate(cdp, sessionId, `document.querySelectorAll(".citadel-hand-card.is-selected").length`);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock--skill-targeting .citadel-action-button")]
      .find((button) => button.textContent.includes("确认弃牌重抽"))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--magician_redraw", 10000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const presentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-presentation`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-action-dock--skill-targeting", 10000);
  return { targetableCount, selectedCount, screenshot, presentation, presentationScreenshot, closedAfterConfirm: true };
}

async function collectMagicianPlayerFlow(cdp, sessionId, screenshotName) {
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-action-button--skill:not(:disabled)")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--skill-targeting", 10000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock--skill-targeting .citadel-action-button")]
      .find((button) => button.textContent.includes("交换手牌"))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-player-mini.is-player-targetable", 10000);
  const targetablePlayers = await evaluate(cdp, sessionId, `document.querySelectorAll(".citadel-player-mini.is-player-targetable").length`);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await evaluate(cdp, sessionId, `[...document.querySelectorAll(".citadel-player-mini.is-player-targetable")].at(-1)?.click()`);
  await waitForSelector(cdp, sessionId, ".confirm-dialog", 10000);
  const confirmText = await evaluate(cdp, sessionId, `document.querySelector(".confirm-dialog")?.textContent ?? ""`);
  await evaluate(cdp, sessionId, `document.querySelector(".confirm-dialog__actions button:last-child")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--magician_swap", 10000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const presentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-presentation`);
  await waitForSelectorAbsent(cdp, sessionId, ".confirm-dialog", 10000);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-player-mini.is-player-targetable", 10000);
  return { targetablePlayers, screenshot, confirmText, presentation, presentationScreenshot, closedAfterConfirm: true };
}

async function collectThiefPresentationFlow(cdp, sessionId, screenshotName) {
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-action-button--skill:not(:disabled)")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--skill-roles", 10000);
  const selected = await evaluate(cdp, sessionId, `
    (() => {
      const role = document.querySelector('.citadel-skill-role-options [data-inspector-role-id="magician"]');
      if (!role) return false;
      role.click();
      return true;
    })()
  `);
  if (!selected) return { selected: false };
  await waitForSelector(cdp, sessionId, ".citadel-skill-role-options .is-selected", 10000);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-skill-target-controls .citadel-action-button--gold")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--thief_mark", 10000);
  const markPresentation = await collectSkillPresentation(cdp, sessionId);
  const markScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-mark`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-skill-presentation", 5000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock .citadel-action-button")]
      .find((button) => button.textContent.includes("结束回合"))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--thief_steal", 10000);
  const stealPresentation = await collectSkillPresentation(cdp, sessionId);
  const stealScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-steal`);
  return { selected, markPresentation, markScreenshot, stealPresentation, stealScreenshot };
}

async function collectSkillPresentation(cdp, sessionId) {
  await delay(420);
  return evaluate(cdp, sessionId, `
    (() => {
      const overlay = document.querySelector(".citadel-skill-presentation");
      const table = document.querySelector(".citadel-game-table");
      if (!overlay || !table) return null;
      const overlayRect = overlay.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const style = getComputedStyle(overlay);
      return {
        className: overlay.className,
        text: overlay.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        position: style.position,
        pointerEvents: style.pointerEvents,
        coversTable:
          Math.abs(overlayRect.left - tableRect.left) <= 1 &&
          Math.abs(overlayRect.top - tableRect.top) <= 1 &&
          Math.abs(overlayRect.width - tableRect.width) <= 1 &&
          Math.abs(overlayRect.height - tableRect.height) <= 1
      };
    })()
  `);
}

function checkDirectSkillFlow(label, checks) {
  const normalized = checks.map(([name, pass, details]) => ({ name, pass: Boolean(pass), details }));
  const failures = normalized.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks: normalized };
}

async function collectCardInspectorFlow(cdp, sessionId, screenshotLabel) {
  const role = await collectCardInspectorHover(
    cdp,
    sessionId,
    ".citadel-self-role-card [data-card-inspector]"
  );
  const roleScreenshot = role
    ? await captureScreenshot(cdp, sessionId, `${screenshotLabel}-role-card-inspector`)
    : null;
  const roleClosed = await closeCardInspector(cdp, sessionId);

  const originalHandDescription = await evaluate(cdp, sessionId, `
    (() => {
      const card = document.querySelector(".citadel-hand-card[data-card-inspector]");
      if (!card) return null;
      const original = card.dataset.inspectorDescription ?? "";
      card.dataset.inspectorDescription = "普通建筑。";
      return original;
    })()
  `);
  const hand = await collectCardInspectorHover(
    cdp,
    sessionId,
    ".citadel-hand-card[data-card-inspector]"
  );
  const handScreenshot = hand
    ? await captureScreenshot(cdp, sessionId, `${screenshotLabel}-hand-card-inspector`)
    : null;
  const handClosed = await closeCardInspector(cdp, sessionId);

  await evaluate(cdp, sessionId, `
    (() => {
      const card = document.querySelector(".citadel-hand-card[data-card-inspector]");
      if (card) card.dataset.inspectorDescription = "使用此建筑效果时，选择一张手牌弃置，然后获得 1 枚金币；每轮只能使用一次。";
    })()
  `);
  const handLong = await collectCardInspectorHover(
    cdp,
    sessionId,
    ".citadel-hand-card[data-card-inspector]"
  );
  const handLongScreenshot = handLong
    ? await captureScreenshot(cdp, sessionId, `${screenshotLabel}-hand-card-inspector-long`)
    : null;
  const handLongClosed = await closeCardInspector(cdp, sessionId);
  await evaluate(cdp, sessionId, `
    (() => {
      const card = document.querySelector(".citadel-hand-card[data-card-inspector]");
      if (card) card.dataset.inspectorDescription = ${JSON.stringify(originalHandDescription ?? "")};
    })()
  `);

  await evaluate(cdp, sessionId, `
    (() => {
      if (document.querySelector(".citadel-mini-city-card[data-card-inspector]")) return;
      const row = document.querySelector(".citadel-mini-city-row");
      if (!row) return;
      const card = document.createElement("article");
      card.className = "citadel-mini-city-card citadel-mini-city-card--blue";
      card.tabIndex = 0;
      card.dataset.cardInspector = "district";
      const seat = row.closest(".citadel-opponent-seat");
      const position = seat?.getAttribute("data-seat-position") ?? "";
      card.dataset.inspectorPlacement = position.startsWith("right-")
        ? "left"
        : position.startsWith("left-") ? "right" : "bottom";
      card.dataset.inspectorSize = "table-small";
      card.dataset.inspectorName = "神殿";
      card.dataset.inspectorCost = "1";
      card.dataset.inspectorScore = "1";
      card.dataset.inspectorColor = "blue";
      card.dataset.inspectorDescription = "蓝色宗教建筑。";
      card.innerHTML = '<span class="citadel-mini-city-card__cost">1</span><strong class="citadel-mini-city-card__name">神殿</strong>';
      row.append(card);
    })()
  `);

  const publicDistrict = await collectCardInspectorHover(
    cdp,
    sessionId,
    ".citadel-mini-city-card[data-card-inspector]"
  );
  const publicDistrictScreenshot = publicDistrict
    ? await captureScreenshot(cdp, sessionId, `${screenshotLabel}-public-district-inspector`)
    : null;
  const publicDistrictClosed = await closeCardInspector(cdp, sessionId);

  const rightEdge = await collectCardInspectorHover(
    cdp,
    sessionId,
    ".citadel-opponent-seat--right-upper .citadel-role-card[data-card-inspector]"
  );
  const rightScreenshot = rightEdge
    ? await captureScreenshot(cdp, sessionId, `${screenshotLabel}-edge-card-inspector`)
    : null;
  const edgeClosed = await closeCardInspector(cdp, sessionId);

  return {
    role,
    hand,
    handLong,
    publicDistrict,
    rightEdge,
    roleClosed,
    handClosed,
    handLongClosed,
    publicDistrictClosed,
    edgeClosed,
    screenshots: [roleScreenshot, handScreenshot, handLongScreenshot, publicDistrictScreenshot, rightScreenshot].filter(Boolean)
  };
}

function checkCardInspectorFlow(label, flow) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });

  addCheck("role hover opens an enlarged role card", Boolean(
    flow.role?.kind === "role" &&
    flow.role.card?.height > flow.role.target?.height * 1.5
  ), flow.role);
  addCheck("role explanation is below the enlarged card", Boolean(
    flow.role?.description?.top >= flow.role?.card?.bottom
  ), flow.role);
  addCheck("self role inspector is anchored directly to the right", Boolean(
    flow.role?.rect?.left >= flow.role?.target?.right + 8 &&
    flow.role.rect.left <= flow.role.target.right + 24
  ), flow.role);
  addCheck("role inspector stays inside the viewport", Boolean(
    flow.role && insideViewport(flow.role.rect, flow.role.viewport, 4)
  ), flow.role);
  addCheck("role inspector closes after the 50ms leave delay", flow.roleClosed, flow.roleClosed);

  addCheck("hand hover opens a compact district explanation", Boolean(
    flow.hand?.kind === "district" && flow.hand.description && !flow.hand.card
  ), flow.hand);
  addCheck("the hovered hand card enlarges in place", Boolean(
    flow.hand?.target?.height >= 96 && flow.hand?.target?.width >= 60
  ), flow.hand);
  addCheck("hand explanation stays directly beside its source card", Boolean(
    flow.hand && (
      Math.abs(flow.hand.rect.right - flow.hand.target.left) <= 24 ||
      Math.abs(flow.hand.rect.left - flow.hand.target.right) <= 24
    ) && flow.hand.rect.bottom > flow.hand.target.top && flow.hand.rect.top < flow.hand.target.bottom
  ), flow.hand);
  addCheck("hand explanation height follows its text content", Boolean(
    flow.handLong?.rect?.height >= flow.hand?.rect?.height + 10
  ), { short: flow.hand, long: flow.handLong });
  addCheck("hand explanation width follows its text content", Boolean(
    flow.handLong?.rect?.width >= flow.hand?.rect?.width + 60
  ), { short: flow.hand, long: flow.handLong });
  addCheck("hand inspector stays inside the viewport", Boolean(
    flow.hand && insideViewport(flow.hand.rect, flow.hand.viewport, 4)
  ), flow.hand);
  addCheck("hand inspector closes after the 50ms leave delay", flow.handClosed, flow.handClosed);
  addCheck("long hand inspector closes after the 50ms leave delay", flow.handLongClosed, flow.handLongClosed);

  addCheck("a public opponent building opens the same district inspector", Boolean(
    flow.publicDistrict?.kind === "district" && flow.publicDistrict.description
  ), flow.publicDistrict);
  addCheck("opponent building preview reaches the same absolute card size as the enlarged hand card", Boolean(
    flow.publicDistrict?.card && flow.hand?.target &&
    Math.abs(flow.publicDistrict.card.width - flow.hand.target.width) <= 8 &&
    Math.abs(flow.publicDistrict.card.height - flow.hand.target.height) <= 10
  ), { hand: flow.hand?.target, opponent: flow.publicDistrict?.card });
  addCheck("public building inspector closes after the 50ms leave delay", flow.publicDistrictClosed, flow.publicDistrictClosed);

  addCheck("edge card inspector chooses a non-overlapping side and stays visible", Boolean(
    flow.rightEdge &&
    insideViewport(flow.rightEdge.rect, flow.rightEdge.viewport, 4) &&
    !intersects(flow.rightEdge.rect, flow.rightEdge.target, 4)
  ), flow.rightEdge);
  addCheck("opponent role preview reaches the same absolute card size as the enlarged hand card", Boolean(
    flow.rightEdge?.card && flow.hand?.target &&
    Math.abs(flow.rightEdge.card.width - flow.hand.target.width) <= 8 &&
    Math.abs(flow.rightEdge.card.height - flow.hand.target.height) <= 10
  ), { hand: flow.hand?.target, opponentRole: flow.rightEdge?.card });
  addCheck("edge inspector closes after the 50ms leave delay", flow.edgeClosed, flow.edgeClosed);

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectUtilityMenuState(cdp, sessionId) {
  return evaluate(cdp, sessionId, `
    (() => ({
      screenClass: document.querySelector(".fantasy-screen")?.className ?? "",
      buttons: [...document.querySelectorAll(".utility-menu-button")].map((button) => {
        const image = button.querySelector(".utility-menu-button__image");
        const icon = image ?? button.querySelector(".utility-menu-button__glyph");
        const rect = button.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        return {
          label: button.getAttribute("aria-label") ?? "",
          text: button.textContent?.trim() ?? "",
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          iconWidth: iconRect?.width ?? 0,
          iconHeight: iconRect?.height ?? 0,
          imageObjectFit: image ? getComputedStyle(image).objectFit : null,
          naturalWidth: image?.naturalWidth ?? 0,
          naturalHeight: image?.naturalHeight ?? 0
        };
      })
    }))()
  `);
}

async function collectUtilityMenuFlow(cdp, sessionId, label) {
  const modalLabels = ["公告", "帮助", "设置"];
  const openedModals = [];
  const focusedButtons = [];

  for (const modalLabel of modalLabels) {
    const interaction = await evaluate(cdp, sessionId, `
      (() => {
        const button = [...document.querySelectorAll(".utility-menu-button")]
          .find((candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(modalLabel)});
        if (!button) return { found: false, focused: false };
        button.focus();
        const focused = document.activeElement === button;
        button.click();
        return { found: true, focused };
      })()
    `);
    focusedButtons.push({ label: modalLabel, ...interaction });
    await waitForSelector(cdp, sessionId, ".modal-backdrop", 5000);
    openedModals.push(await evaluate(cdp, sessionId, `document.body.innerText.includes(${JSON.stringify(modalLabel)})`));
    await evaluate(cdp, sessionId, `document.querySelector(".modal-close")?.click()`);
    await waitForSelectorAbsent(cdp, sessionId, ".modal-backdrop", 5000);
  }

  const game = await collectUtilityMenuState(cdp, sessionId);
  const gameScreenshot = await captureScreenshot(cdp, sessionId, `${label}-game-utility-menu`);

  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".utility-menu-button")]
      .find((button) => button.getAttribute("aria-label") === "退出房间")?.click()
  `);
  await waitForSelector(cdp, sessionId, ".fantasy-screen--home", 10000);
  const home = await collectUtilityMenuState(cdp, sessionId);
  const homeScreenshot = await captureScreenshot(cdp, sessionId, `${label}-home-utility-menu`);

  await evaluate(cdp, sessionId, `document.querySelector(".home-action-card--create")?.click()`);
  await waitForSelector(cdp, sessionId, ".fantasy-screen--lobby", 10000);
  for (const botName of ["人机 1", "人机 2", "人机 3"]) {
    await evaluate(cdp, sessionId, `document.querySelector(".lobby-image-button--add-bot")?.click()`);
    await waitForPageText(cdp, sessionId, botName, 10000);
  }
  const ready = await collectUtilityMenuState(cdp, sessionId);
  const readyLayout = await evaluate(cdp, sessionId, `
    (() => {
      const rect = (element) => {
        if (!element) return null;
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height
        };
      };
      const actionButtons = [...document.querySelectorAll(".lobby-actions button")];
      const hostSeat = [...document.querySelectorAll(".player-seat")]
        .find((seat) => seat.querySelector(".game-badge")?.textContent?.includes("房主"));
      return {
        actionLabels: actionButtons.map((button) => button.getAttribute("aria-label")),
        actionButtonRects: actionButtons.map(rect),
        actions: rect(document.querySelector(".lobby-actions")),
        addSeat: rect(document.querySelector(".player-seat--add-seat")),
        hostBadges: hostSeat
          ? [...hostSeat.querySelectorAll(".game-badge")].map((badge) => badge.textContent?.trim())
          : [],
        readySummary: [...document.querySelectorAll(".lobby-badges .game-badge")]
          .map((badge) => badge.textContent?.trim())
          .find((text) => text?.includes("已准备")) ?? "",
        hasCountdown: document.body.innerText.includes("自动开始"),
        startDisabled: document.querySelector(".lobby-image-button--start")?.disabled ?? true
      };
    })()
  `);
  const readyScreenshot = await captureScreenshot(cdp, sessionId, `${label}-ready-utility-menu`);

  return {
    game,
    home,
    ready,
    readyLayout,
    focusedButtons,
    openedModals,
    screenshots: [gameScreenshot, homeScreenshot, readyScreenshot]
  };
}

function checkUtilityMenuFlow(label, flow) {
  const checks = [];
  const addCheck = (name, pass, details) => checks.push({ name, pass: Boolean(pass), details });
  const expectedGameLabels = ["公告", "帮助", "设置", "退出房间"];
  const expectedHomeLabels = ["公告", "帮助", "设置"];
  const labels = (state) => state.buttons.map((button) => button.label);
  const imagesPreserveRatio = (state) => state.buttons
    .filter((button) => button.naturalWidth && button.naturalHeight)
    .every((button) => button.imageObjectFit === "contain" && button.naturalWidth !== button.naturalHeight);

  addCheck("game uses all four shared utility buttons", JSON.stringify(labels(flow.game)) === JSON.stringify(expectedGameLabels), flow.game);
  addCheck("home keeps the three shared utility buttons", JSON.stringify(labels(flow.home)) === JSON.stringify(expectedHomeLabels), flow.home);
  addCheck("ready room restores the shared exit button", JSON.stringify(labels(flow.ready)) === JSON.stringify(expectedGameLabels), flow.ready);
  addCheck("host keeps exactly the original three room actions", JSON.stringify(flow.readyLayout.actionLabels) === JSON.stringify([
    "开始游戏",
    "添加人机",
    "离开房间"
  ]), flow.readyLayout);
  addCheck("host seat only shows the host badge", JSON.stringify(flow.readyLayout.hostBadges) === JSON.stringify(["房主"]), flow.readyLayout);
  addCheck("ready summary excludes the host", flow.readyLayout.readySummary.includes("3/3 已准备"), flow.readyLayout);
  addCheck("ready room does not auto-start", !flow.readyLayout.hasCountdown && !flow.readyLayout.startDisabled, flow.readyLayout);
  addCheck("room actions stay below the add-seat row", Boolean(
    flow.readyLayout.actions && flow.readyLayout.addSeat &&
    flow.readyLayout.actions.top >= flow.readyLayout.addSeat.bottom + 6
  ), flow.readyLayout);
  addCheck("host action buttons stay on one row", Boolean(
    flow.readyLayout.actionButtonRects.length === 3 &&
    Math.max(...flow.readyLayout.actionButtonRects.map((rect) => rect.top)) -
      Math.min(...flow.readyLayout.actionButtonRects.map((rect) => rect.top)) <= 2
  ), flow.readyLayout);
  addCheck("non-square PNG artwork preserves its original aspect ratio", [flow.game, flow.home, flow.ready].every(imagesPreserveRatio), {
    game: flow.game.buttons,
    home: flow.home.buttons,
    ready: flow.ready.buttons
  });
  addCheck("announcement, help, and settings buttons receive keyboard focus", flow.focusedButtons.every((item) => item.found && item.focused), flow.focusedButtons);
  addCheck("announcement, help, and settings open their existing modals", flow.openedModals.every(Boolean), flow.openedModals);

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function main() {
  const roleSetup = (qaMode === "full" || qaMode === "roles")
    ? await setupGame(8, { stopAtRoleSelection: true })
    : null;
  let setup = null;
  let drawSetup = null;
  let buildSetup = null;
  let denseSetup = null;
  let targetingSetup = null;
  let assassinTargetingSetup = null;
  let magicianDiscardSetup = null;
  let magicianPlayerSetup = null;
  let thiefSetup = null;
  let inspectorSetup = null;
  let utilityMenuSetup = null;
  let uiTuningSetup = null;
  let actionFeedbackSetup = null;
  const opponentSetups = [];
  const browser = await createBrowserPage();
  const results = [];
  const screenshots = [];

  try {
    if (qaMode === "roles" && roleSetup) {
      const roleViewport = viewports[0];
      const roleLabel = `${roleViewport.width}x${roleViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, roleSetup.created, roleViewport);
      await seedFullRoleChoices(browser.cdp, browser.sessionId, 8);
      const roleLayout = await collectLayout(browser.cdp, browser.sessionId);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${roleLabel}-role-selection`));
      results.push(checkRoleSelectionLayout(`${roleLabel} role-selection`, roleLayout, 8));
    }

    if (qaMode === "full" && roleSetup) {
      const roleViewport = viewports[0];
      const roleLabel = `${roleViewport.width}x${roleViewport.height}`;
      const objectivePreparation = await preparePage(
        browser.cdp,
        browser.sessionId,
        roleSetup.created,
        roleViewport,
        {
          skipObjectiveIntro: false,
          objectiveScreenshotName: `${roleLabel}-objective-intro`
        }
      );
      if (objectivePreparation.objectiveScreenshot) screenshots.push(objectivePreparation.objectiveScreenshot);
      results.push(checkObjectiveIntro(
        `${roleLabel} objective-intro`,
        objectivePreparation.objectiveIntro,
        roleSetup.gameState.settings.endCitySize
      ));
      await seedFullRoleChoices(browser.cdp, browser.sessionId, 8);
      const roleLayout = await collectLayout(browser.cdp, browser.sessionId);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${roleLabel}-role-selection`));
      results.push(checkRoleSelectionLayout(`${roleLabel} role-selection`, roleLayout, 8));

      setup = await setupGame(4);

      for (const viewport of viewports) {
        const label = `${viewport.width}x${viewport.height}`;
        await preparePage(browser.cdp, browser.sessionId, setup.created, viewport);
        const layout = await collectLayout(browser.cdp, browser.sessionId);
        const baseResult = checkLayout(`${label} base`, layout);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-base`));
        results.push(baseResult);

        const tooltipHover = await collectTooltipHover(browser.cdp, browser.sessionId);
        const tooltipResult = checkTooltipHover(`${label} tooltip-hover`, tooltipHover);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-tooltip-hover`));
        results.push(tooltipResult);

        const skillClickLayout = await collectLayout(browser.cdp, browser.sessionId, true);
        const skillClickResult = checkLayout(`${label} skill-click`, skillClickLayout, { afterSkillClick: true });
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-skill-click`));
        results.push(skillClickResult);
      }

      drawSetup = await setupGame(4);
      const drawViewport = viewports[1] ?? viewports[0];
      const drawLabel = `${drawViewport.width}x${drawViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, drawSetup.created, drawViewport);
      const drawChoiceFlow = await collectDrawChoiceFlow(
        browser.cdp,
        browser.sessionId,
        `${drawLabel}-draw-choice`
      );
      if (drawChoiceFlow.screenshot) screenshots.push(drawChoiceFlow.screenshot);
      results.push(checkDrawChoiceFlow(`${drawLabel} draw-choice`, drawChoiceFlow));

      buildSetup = await setupGame(4);
      const buildViewport = viewports[0];
      const buildLabel = `${buildViewport.width}x${buildViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, buildSetup.created, buildViewport);
      const buildConfirmFlow = await collectBuildConfirmFlow(browser.cdp, browser.sessionId, buildSetup);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${buildLabel}-build-confirm-after-end`));
      results.push(checkBuildConfirmFlow(`${buildLabel} build-confirm`, buildConfirmFlow));
    }

    if (qaMode === "full" || qaMode === "dense") {
      denseSetup = await setupGame(8, { actionDeadlineMs: 90000 });
      const denseViewport = viewports[1] ?? viewports[0];
      const denseLabel = `${denseViewport.width}x${denseViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, denseSetup.created, denseViewport);
      const denseLayout = await collectLayout(browser.cdp, browser.sessionId);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${denseLabel}-8-player-action`));
      results.push(checkLayout(`${denseLabel} 8-player-action`, denseLayout, {
        expectedOpponentCount: 7,
        expectedDenseCount: 4
      }));
    }

    if (qaMode === "ui-tuning") {
      uiTuningSetup = await setupGame(8, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, uiTuningSetup.created, viewport, {
        extraQuery: "uiTune=1"
      });
      await waitForSelector(browser.cdp, browser.sessionId, ".game-ui-tuning-panel", 10000);
      const state = await evaluate(browser.cdp, browser.sessionId, `
        (() => {
          const shell = document.querySelector('.citadel-game-shell');
          const panel = document.querySelector('.game-ui-tuning-panel');
          const slider = panel?.querySelector('input[type="range"]');
          const before = getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim();
          if (slider) {
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setValue?.call(slider, String(Math.min(Number(slider.max), Number(slider.value) + 4)));
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const bounds = panel?.querySelector('input[type="checkbox"]');
          bounds?.click();
          return new Promise((resolve) => setTimeout(() => resolve({
            panelVisible: Boolean(panel),
            sliderCount: panel?.querySelectorAll('input[type="range"]').length ?? 0,
            before,
            after: getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim(),
            boundsVisible: shell?.classList.contains('ui-show-bounds'),
            stored: Boolean(localStorage.getItem('zy-game-ui-tuning-v1'))
          }), 120));
        })()
      `);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-ui-tuning`));
      results.push(checkDirectSkillFlow(`${label} ui-tuning`, [
        ["development tuning panel is visible", state.panelVisible, state],
        ["high-impact controls are available", state.sliderCount >= 10, state],
        ["slider changes a semantic CSS variable", state.before !== state.after, state],
        ["boundary overlay can be enabled", state.boundsVisible, state],
        ["tuning config is stored locally", state.stored, state]
      ]));
    }

    if (qaMode === "action-feedback") {
      actionFeedbackSetup = await setupGame(4, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, actionFeedbackSetup.created, viewport);
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-action-button--gold')?.click()`);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-skill-presentation--take_gold", 5000);
      const state = await evaluate(browser.cdp, browser.sessionId, `
        (() => {
          const presentation = document.querySelector('.citadel-skill-presentation--take_gold');
          const timer = document.querySelector('.citadel-game-center__timer');
          const modal = document.querySelector('.modal-backdrop');
          const pStyle = presentation ? getComputedStyle(presentation) : null;
          const timerRect = timer?.getBoundingClientRect();
          return {
            presentationVisible: Boolean(presentation),
            pointerEvents: pStyle?.pointerEvents,
            timerVisible: Boolean(timerRect && timerRect.width > 0 && timerRect.height > 0),
            queueCount: document.querySelectorAll('.citadel-skill-presentation').length,
            modalAbove: !modal || Number(getComputedStyle(modal).zIndex) > Number(pStyle?.zIndex ?? 0)
          };
        })()
      `);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-action-feedback`));
      results.push(checkDirectSkillFlow(`${label} action-feedback`, [
        ["gold action produces a presentation", state.presentationVisible, state],
        ["presentation never captures pointer input", state.pointerEvents === "none", state],
        ["center timer remains visible", state.timerVisible, state],
        ["only one presentation is active", state.queueCount === 1, state],
        ["confirmation modal stays above presentations", state.modalAbove, state]
      ]));
    }

    if (qaMode === "opponents") {
      for (const playerCount of opponentPlayerCounts) {
        const opponentSetup = await setupGame(playerCount, { actionDeadlineMs: 90000 });
        opponentSetups.push(opponentSetup);
        for (const viewport of viewports) {
          const label = `${viewport.width}x${viewport.height}`;
          const expectedDenseCount = playerCount >= 7 ? 4 : 0;
          await preparePage(browser.cdp, browser.sessionId, opponentSetup.created, viewport);
          const baseLayout = await collectLayout(browser.cdp, browser.sessionId);
          screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-${playerCount}-player-opponents`));
          results.push(checkLayout(`${label} ${playerCount}-player opponents`, baseLayout, {
            expectedOpponentCount: playerCount - 1,
            expectedDenseCount
          }));

          await seedFullOpponentCities(browser.cdp, browser.sessionId, 8);
          const fullCityLayout = await collectLayout(browser.cdp, browser.sessionId);
          screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-${playerCount}-player-full-cities`));
          results.push(checkLayout(`${label} ${playerCount}-player full-cities`, fullCityLayout, {
            expectedOpponentCount: playerCount - 1,
            expectedDenseCount,
            expectedCityCount: 8
          }));
        }
      }
    }

    if (qaMode === "targeting") {
      targetingSetup = await setupPreferredRoleGame(4, "warlord");
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, targetingSetup.created, viewport);
      const flow = await collectTableTargetingFlow(
        browser.cdp,
        browser.sessionId,
        `${label}-warlord-table-targeting`
      );
      if (flow.screenshot) screenshots.push(flow.screenshot);
      if (flow.presentationScreenshot) screenshots.push(flow.presentationScreenshot);
      results.push(checkTableTargetingFlow(`${label} warlord-table-targeting`, flow));
    }

    if (qaMode === "skills") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;

      assassinTargetingSetup = await setupPreferredRoleGame(8, "assassin");
      await preparePage(browser.cdp, browser.sessionId, assassinTargetingSetup.created, viewport);
      const assassinFlow = await collectRoleSkillTargetFlow(browser.cdp, browser.sessionId, `${label}-assassin-role-targeting`);
      if (assassinFlow.screenshot) screenshots.push(assassinFlow.screenshot);
      if (assassinFlow.presentationScreenshot) screenshots.push(assassinFlow.presentationScreenshot);
      if (assassinFlow.skipPresentationScreenshot) screenshots.push(assassinFlow.skipPresentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} assassin-role-targeting`, [
        ["skill opens explicit role targets", assassinFlow.opened && assassinFlow.optionCount > 0, assassinFlow],
        ["confirming a role closes targeting", assassinFlow.closedAfterConfirm, assassinFlow],
        ["assassin confirmation launches a non-layout presentation", assassinFlow.presentation?.className.includes("assassin_mark") && assassinFlow.presentation?.pointerEvents === "none" && assassinFlow.presentation?.coversTable, assassinFlow.presentation],
        ["assassinated role visibly skips its turn", assassinFlow.skipPresentation?.className.includes("assassin_skip") && assassinFlow.skipPresentation?.text.includes("跳过"), assassinFlow.skipPresentation]
      ]));

      magicianDiscardSetup = await setupPreferredRoleGame(8, "magician");
      await preparePage(browser.cdp, browser.sessionId, magicianDiscardSetup.created, viewport);
      const discardFlow = await collectMagicianDiscardFlow(browser.cdp, browser.sessionId, `${label}-magician-discard-targeting`);
      if (discardFlow.screenshot) screenshots.push(discardFlow.screenshot);
      if (discardFlow.presentationScreenshot) screenshots.push(discardFlow.presentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} magician-discard-targeting`, [
        ["own hand cards become directly targetable", discardFlow.targetableCount > 0, discardFlow],
        ["multiple hand cards can be selected", discardFlow.selectedCount > 0, discardFlow],
        ["confirming discard exits targeting", discardFlow.closedAfterConfirm, discardFlow],
        ["redraw launches a non-layout presentation", discardFlow.presentation?.className.includes("magician_redraw") && discardFlow.presentation?.pointerEvents === "none" && discardFlow.presentation?.coversTable, discardFlow.presentation]
      ]));

      magicianPlayerSetup = await setupPreferredRoleGame(8, "magician");
      await preparePage(browser.cdp, browser.sessionId, magicianPlayerSetup.created, viewport);
      const playerFlow = await collectMagicianPlayerFlow(browser.cdp, browser.sessionId, `${label}-magician-player-targeting`);
      if (playerFlow.screenshot) screenshots.push(playerFlow.screenshot);
      if (playerFlow.presentationScreenshot) screenshots.push(playerFlow.presentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} magician-player-targeting`, [
        ["all opponents become direct player targets", playerFlow.targetablePlayers === 7, playerFlow],
        ["clicking a player opens swap confirmation", playerFlow.confirmText.includes("交换全部手牌"), playerFlow],
        ["confirming swap exits targeting", playerFlow.closedAfterConfirm, playerFlow],
        ["swap launches a non-layout presentation", playerFlow.presentation?.className.includes("magician_swap") && playerFlow.presentation?.pointerEvents === "none" && playerFlow.presentation?.coversTable, playerFlow.presentation]
      ]));
    }

    if (qaMode === "skill-discard") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      magicianDiscardSetup = await setupPreferredRoleGame(8, "magician");
      await preparePage(browser.cdp, browser.sessionId, magicianDiscardSetup.created, viewport);
      const discardFlow = await collectMagicianDiscardFlow(browser.cdp, browser.sessionId, `${label}-magician-discard-targeting`);
      if (discardFlow.screenshot) screenshots.push(discardFlow.screenshot);
      if (discardFlow.presentationScreenshot) screenshots.push(discardFlow.presentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} magician-discard-targeting`, [
        ["own hand cards become directly targetable", discardFlow.targetableCount > 0, discardFlow],
        ["multiple hand cards can be selected", discardFlow.selectedCount > 0, discardFlow],
        ["confirming discard exits targeting", discardFlow.closedAfterConfirm, discardFlow],
        ["redraw launches a non-layout presentation", discardFlow.presentation?.className.includes("magician_redraw") && discardFlow.presentation?.coversTable, discardFlow.presentation]
      ]));
    }

    if (qaMode === "skill-player") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      magicianPlayerSetup = await setupPreferredRoleGame(8, "magician");
      await preparePage(browser.cdp, browser.sessionId, magicianPlayerSetup.created, viewport);
      const playerFlow = await collectMagicianPlayerFlow(browser.cdp, browser.sessionId, `${label}-magician-player-targeting`);
      if (playerFlow.screenshot) screenshots.push(playerFlow.screenshot);
      if (playerFlow.presentationScreenshot) screenshots.push(playerFlow.presentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} magician-player-targeting`, [
        ["all opponents become direct player targets", playerFlow.targetablePlayers === 7, playerFlow],
        ["clicking a player opens swap confirmation", playerFlow.confirmText.includes("交换全部手牌"), playerFlow],
        ["confirming swap exits targeting", playerFlow.closedAfterConfirm, playerFlow],
        ["swap launches a non-layout presentation", playerFlow.presentation?.className.includes("magician_swap") && playerFlow.presentation?.coversTable, playerFlow.presentation]
      ]));
    }

    if (qaMode === "skill-thief") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      thiefSetup = await setupPreferredRoleGame(8, "thief");
      await preparePage(browser.cdp, browser.sessionId, thiefSetup.created, viewport);
      const flow = await collectThiefPresentationFlow(browser.cdp, browser.sessionId, `${label}-thief-presentation`);
      if (flow.markScreenshot) screenshots.push(flow.markScreenshot);
      if (flow.stealScreenshot) screenshots.push(flow.stealScreenshot);
      results.push(checkDirectSkillFlow(`${label} thief-presentation`, [
        ["thief can mark the magician role", flow.selected, flow],
        ["thief mark launches a non-layout presentation", flow.markPresentation?.className.includes("thief_mark") && flow.markPresentation?.pointerEvents === "none" && flow.markPresentation?.coversTable, flow.markPresentation],
        ["resolved theft launches a coin-transfer presentation", flow.stealPresentation?.className.includes("thief_steal") && flow.stealPresentation?.text.includes("金币") && flow.stealPresentation?.coversTable, flow.stealPresentation]
      ]));
    }

    if (qaMode === "skill-role") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      assassinTargetingSetup = await setupPreferredRoleGame(8, "assassin");
      await preparePage(browser.cdp, browser.sessionId, assassinTargetingSetup.created, viewport);
      const assassinFlow = await collectRoleSkillTargetFlow(browser.cdp, browser.sessionId, `${label}-assassin-role-targeting`);
      if (assassinFlow.screenshot) screenshots.push(assassinFlow.screenshot);
      if (assassinFlow.presentationScreenshot) screenshots.push(assassinFlow.presentationScreenshot);
      if (assassinFlow.skipPresentationScreenshot) screenshots.push(assassinFlow.skipPresentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} assassin-role-targeting`, [
        ["skill opens explicit role targets", assassinFlow.opened && assassinFlow.optionCount > 0, assassinFlow],
        ["confirming a role closes targeting", assassinFlow.closedAfterConfirm, assassinFlow],
        ["assassin confirmation launches a non-layout presentation", assassinFlow.presentation?.className.includes("assassin_mark") && assassinFlow.presentation?.coversTable, assassinFlow.presentation],
        ["assassinated role visibly skips its turn", assassinFlow.skipPresentation?.className.includes("assassin_skip") && assassinFlow.skipPresentation?.text.includes("跳过"), assassinFlow.skipPresentation]
      ]));
    }

    if (qaMode === "card-inspector") {
      const inspectorPlayerCount = Number(process.env.UI_QA_CARD_INSPECTOR_PLAYERS ?? 4);
      inspectorSetup = await setupGame(inspectorPlayerCount, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, inspectorSetup.created, viewport);
      const flow = await collectCardInspectorFlow(browser.cdp, browser.sessionId, label);
      screenshots.push(...flow.screenshots);
      results.push(checkCardInspectorFlow(`${label} card-inspector`, flow));
    }

    if (qaMode === "utility-menu") {
      utilityMenuSetup = await setupGame(8, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, utilityMenuSetup.created, viewport);
      const flow = await collectUtilityMenuFlow(browser.cdp, browser.sessionId, label);
      screenshots.push(...flow.screenshots);
      results.push(checkUtilityMenuFlow(`${label} utility-menu`, flow));
    }
  } finally {
    roleSetup?.socket.disconnect();
    setup?.socket.disconnect();
    drawSetup?.socket.disconnect();
    buildSetup?.socket.disconnect();
    denseSetup?.socket.disconnect();
    targetingSetup?.socket.disconnect();
    assassinTargetingSetup?.socket.disconnect();
    magicianDiscardSetup?.socket.disconnect();
    magicianPlayerSetup?.socket.disconnect();
    thiefSetup?.socket.disconnect();
    inspectorSetup?.socket.disconnect();
    utilityMenuSetup?.socket.disconnect();
    uiTuningSetup?.socket.disconnect();
    actionFeedbackSetup?.socket.disconnect();
    for (const opponentSetup of opponentSetups) opponentSetup.socket.disconnect();
    await closeBrowserPage(browser);
  }

  const failed = results.filter((result) => !result.pass);
  const report = {
    ok: failed.length === 0,
    appUrl,
    serverUrl,
    chromePort,
    screenshots,
    results
  };
  const output = process.env.UI_QA_VERBOSE === "1"
    ? report
    : {
        ok: report.ok,
        appUrl,
        serverUrl,
        screenshots,
        results: results.map((result) => ({
          label: result.label,
          pass: result.pass,
          failures: result.failures
        }))
      };
  console.log(JSON.stringify(output, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

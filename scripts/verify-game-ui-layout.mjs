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

const nicknameFixtures = [
  { name: "阿青", connected: true },
  { name: "Alexandria", connected: true },
  { name: "WWWWWWWWWWWWWWWW", connected: false },
  { name: "一二三四五六七八九十甲乙丙丁戊己", connected: true },
  { name: "玩家Player2026", connected: true },
  { name: "😀😀😀😀😀😀😀😀", connected: true },
  { name: "相同前缀玩家甲", connected: true },
  { name: "相同前缀玩家乙", connected: true }
];

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
  socket.on("game_state", (state) => {
    socket.__qaLatestGameState = state;
  });
  socket.__qaActionEvents = [];
  socket.on("action_event", (event) => {
    socket.__qaActionEvents.push(event);
  });
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

  if (options.fastOpeningForQa && gameState.phase === "CROWN_REVEAL") {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out shortening the QA opening")), 12000);
      socket.emit("qa_configure_game", {
        ...created,
        deadlineMs: 100
      }, (result) => {
        clearTimeout(timer);
        return result?.ok ? resolve(result) : reject(new Error(result?.error || "QA opening configuration failed"));
      });
    });
  }

  if (options.stopAtCrownReveal) {
    if (gameState.phase !== "CROWN_REVEAL") {
      gameState = await waitFor(
        socket,
        "game_state",
        (state) => state.roomId === created.roomCode && state.phase === "CROWN_REVEAL",
        12000,
        "crown reveal phase"
      );
    }
    return { created, socket, gameState };
  }

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

async function setupReactionGame(playerCount) {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  const guest = io(serverUrl, { transports: ["websocket"], forceNew: true });
  socket.on("game_state", (state) => {
    socket.__qaLatestGameState = state;
  });

  await Promise.all([waitFor(socket, "server_status"), waitFor(guest, "server_status")]);

  const createdPromise = waitFor(socket, "room_created");
  const firstRoomPromise = waitFor(socket, "room_state");
  socket.emit("create_room", { playerName: "LayoutQA" });
  const created = await createdPromise;
  let roomState = await firstRoomPromise;

  for (let nextMaxPlayers = roomState.maxPlayers + 1; nextMaxPlayers <= playerCount; nextMaxPlayers += 1) {
    const expanded = waitFor(socket, "room_state", (room) =>
      room.roomCode === created.roomCode && room.maxPlayers === nextMaxPlayers
    );
    socket.emit("update_room_settings", { ...created, settings: { maxPlayers: nextMaxPlayers } });
    roomState = await expanded;
  }

  const joinedPromise = waitFor(guest, "joined_room");
  const joinedRoomPromise = waitFor(socket, "room_state", (room) =>
    room.roomCode === created.roomCode && room.players.length === 2
  );
  guest.emit("join_room", { roomCode: created.roomCode, playerName: "ReactionGuest" });
  const guestSession = await joinedPromise;
  roomState = await joinedRoomPromise;

  const readyPromise = waitFor(socket, "room_state", (room) =>
    room.roomCode === created.roomCode &&
    room.players.find((player) => player.id === guestSession.playerId)?.isReady === true
  );
  guest.emit("set_ready", { roomCode: created.roomCode, playerId: guestSession.playerId, isReady: true });
  roomState = await readyPromise;

  while (roomState.players.length < playerCount) {
    const expectedPlayers = roomState.players.length + 1;
    const nextRoom = waitFor(socket, "room_state", (room) =>
      room.roomCode === created.roomCode && room.players.length === expectedPlayers
    );
    socket.emit("add_test_bots", created);
    roomState = await nextRoom;
  }

  const started = waitFor(socket, "game_state", (state) => state.roomId === created.roomCode);
  socket.emit("start_game", created);
  const gameState = await started;
  const setup = { created, socket, guest, guestSession, gameState };
  await configureQaGame(setup, {
    forceSelfActionRoleId: "architect",
    deadlineMs: 60_000
  });
  return setup;
}

async function configureQaGame(setup, options) {
  const ackPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for QA fixture acknowledgement")), 12000);
    setup.socket.emit("qa_configure_game", {
      ...setup.created,
      ...options
    }, (result) => {
      clearTimeout(timer);
      return result?.ok ? resolve(result) : reject(new Error(result?.error || "QA fixture failed"));
    });
  });
  return ackPromise;
}

async function freezeQaTimer(setup, deadlineMs = 60000) {
  await configureQaGame(setup, { deadlineMs });
  await delay(30);
  setup.gameState = setup.socket.__qaLatestGameState ?? setup.gameState;
  return setup.gameState;
}

async function reclaimQaSocket(setup) {
  const reconnected = waitFor(
    setup.socket,
    "reconnected_room",
    (payload) => payload.roomCode === setup.created.roomCode,
    12000,
    "QA control socket reconnect"
  );
  const gameState = waitFor(
    setup.socket,
    "game_state",
    (state) => state.roomId === setup.created.roomCode,
    12000,
    "game state after QA control reconnect"
  );
  setup.socket.emit("reconnect_room", setup.created);
  await reconnected;
  setup.gameState = await gameState;
  return setup.gameState;
}

async function reachRoleCall(setup) {
  let gameState = setup.gameState;
  const deadline = Date.now() + 30000;
  while (gameState.phase === "ROLE_SELECTION") {
    if (Date.now() > deadline) {
      fail(`Timed out reaching role call. Last phase: ${gameState.phase}`);
    }
    if (gameState.roleSelectionTurnPlayerId === setup.created.playerId) {
      const roleId = gameState.availableRoles.at(-1)?.id;
      if (!roleId) {
        fail("No role available for the role-call QA player.");
      }
      const nextState = waitFor(
        setup.socket,
        "game_state",
        (state) => state.roomId === setup.created.roomCode && (
          state.phase !== gameState.phase ||
          state.roleSelectionTurnPlayerId !== gameState.roleSelectionTurnPlayerId
        ),
        12000,
        "role call after human role selection"
      );
      setup.socket.emit("select_role", {
        roomCode: setup.created.roomCode,
        playerId: setup.created.playerId,
        roleId
      });
      gameState = await nextState;
    } else {
      gameState = await waitFor(
        setup.socket,
        "game_state",
        (state) => state.roomId === setup.created.roomCode && state !== gameState,
        12000,
        "bot role selection before role call"
      );
    }
  }
  if (gameState.phase !== "ROLE_CALL" || !gameState.roleCallState) {
    fail(`Expected ROLE_CALL, received ${gameState.phase}`);
  }
  setup.gameState = gameState;
  await freezeQaTimer(setup);
  return setup.gameState;
}

async function advanceQaRoleCall(setup) {
  const previous = setup.gameState;
  const previousCall = previous.roleCallState;
  const nextState = waitFor(
    setup.socket,
    "game_state",
    (state) => state.roomId === setup.created.roomCode && (
      state.phase !== previous.phase ||
      state.roleCallState?.stage !== previousCall?.stage ||
      state.roleCallState?.roleId !== previousCall?.roleId
    ),
    12000,
    "advanced role-call stage"
  );
  await configureQaGame(setup, { deadlineMs: 80 });
  setup.gameState = await nextState;
  return setup.gameState;
}

async function advanceQaTimedPhase(setup) {
  const previous = setup.socket.__qaLatestGameState ?? setup.gameState;
  const previousCall = previous.roleCallState;
  const nextState = waitFor(
    setup.socket,
    "game_state",
    (state) => state.roomId === setup.created.roomCode && (
      state.phase !== previous.phase ||
      state.currentTurnPlayerId !== previous.currentTurnPlayerId ||
      state.roleCallState?.stage !== previousCall?.stage ||
      state.roleCallState?.roleId !== previousCall?.roleId
    ),
    12000,
    "advanced timed QA phase"
  );
  await configureQaGame(setup, { deadlineMs: 80 });
  setup.gameState = await nextState;
  return setup.gameState;
}

async function setupPreferredRoleGame(playerCount, roleId, maxAttempts = 24) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const setup = await setupGame(playerCount, {
      actionDeadlineMs: 90000,
      fastOpeningForQa: true,
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
        const { resolve, reject, timer, method } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(`${method}: ${message.error.message}: ${message.error.data ?? ""}`));
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
      this.pending.set(id, { resolve, reject, timer, method });
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
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
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
  let result;
  try {
    result = await cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId, timeoutMs);
  } catch (error) {
    throw new Error(`${error.message}\nExpression: ${expression.trim().slice(0, 240)}`);
  }
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
        if (${JSON.stringify(options.skipGuide !== false)}) {
          localStorage.setItem("zy-board-game-guide-complete", "1");
        }
        const requestedTuningConfig = ${JSON.stringify(options.uiTuningConfig ?? null)};
        if (requestedTuningConfig) {
          localStorage.setItem("zy-game-ui-tuning-v4", JSON.stringify({ version: 4, config: requestedTuningConfig }));
        }
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
  const roomCardLayout = await collectRoomCardLayout(cdp, sessionId);
  let objectiveIntro = null;
  let objectiveScreenshot = null;
  let openingSequence = null;
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
  if (options.collectOpeningSequence) {
    await waitForSelector(cdp, sessionId, ".citadel-game-opening--roulette", 4500);
    const collectOpeningState = () => evaluate(cdp, sessionId, `
      (() => {
        const opening = document.querySelector('.citadel-game-opening');
        const crown = document.querySelector('.citadel-opening-crown');
        const halo = document.querySelector('.citadel-opening-seat-halo');
        const status = document.querySelector('.citadel-opening-status');
        const statusTimer = document.querySelector('.citadel-opening-status__timer');
        const table = document.querySelector('.citadel-game-table');
        const crownRect = crown?.getBoundingClientRect();
        const haloRect = halo?.getBoundingClientRect();
        const tableRect = table?.getBoundingClientRect();
        const activePlayerId = halo?.dataset.highlightPlayerId ?? crown?.dataset.crownPlayerId ?? null;
        const activePlayer = activePlayerId
          ? [...document.querySelectorAll('[data-player-id]')].find((element) => element.dataset.playerId === activePlayerId)
          : null;
        const activeAvatar = activePlayer?.querySelector('.citadel-player-mini__avatar-wrap') ?? activePlayer;
        const activeAvatarRect = activeAvatar?.getBoundingClientRect();
        const compactRect = (rect) => rect ? {
          left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height
        } : null;
        const actualCrown = document.querySelector('.citadel-player-mini__crown');
        const actualCrownStyle = actualCrown ? getComputedStyle(actualCrown) : null;
        const crownStyle = crown ? getComputedStyle(crown) : null;
        const haloStyle = halo ? getComputedStyle(halo) : null;
        const statusStyle = status ? getComputedStyle(status) : null;
        return {
          viewport: { width: innerWidth, height: innerHeight },
          playerCount: document.querySelectorAll('.citadel-player-mini[data-player-id]').length,
          stage: opening?.dataset.openingStage ?? null,
          activePlayerId,
          haloPlayerId: halo?.dataset.highlightPlayerId ?? null,
          crownRect: compactRect(crownRect),
          haloRect: compactRect(haloRect),
          statusRect: compactRect(status?.getBoundingClientRect()),
          statusText: status?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
          statusOpacity: Number(statusStyle?.opacity ?? 0),
          statusBackground: statusStyle?.backgroundColor ?? '',
          statusZIndex: Number(statusStyle?.zIndex ?? 0),
          crownZIndex: Number(crownStyle?.zIndex ?? 0),
          statusSeconds: Number(statusTimer?.dataset.openingSeconds ?? NaN),
          activeAvatarRect: compactRect(activeAvatarRect),
          expectedCenter: tableRect ? {
            x: tableRect.left + tableRect.width / 2,
            y: tableRect.top + tableRect.height * .42
          } : null,
          reducedMotion: opening?.classList.contains('citadel-game-opening--reduced-motion') ?? false,
          crownAnimationName: crownStyle?.animationName ?? null,
          haloAnimationName: haloStyle?.animationName ?? null,
          actualCrownHidden: !actualCrown || actualCrownStyle?.visibility === 'hidden' || actualCrownStyle?.opacity === '0',
          centerText: document.querySelector('.citadel-game-center')?.innerText ?? ''
        };
      })()
    `);
    const rouletteFirst = await collectOpeningState();
    const rouletteSamples = [rouletteFirst];
    const rouletteTargetCount = Math.min(5, Math.max(1, rouletteFirst.playerCount ?? 1));
    const rouletteSamplingDeadline = Date.now() + 3_100;
    while (
      Date.now() < rouletteSamplingDeadline &&
      new Set(rouletteSamples.map((sample) => sample?.haloPlayerId).filter(Boolean)).size < rouletteTargetCount
    ) {
      await delay(610);
      const sample = await collectOpeningState();
      if (sample.stage !== "roulette") break;
      rouletteSamples.push(sample);
    }
    const rouletteSecond = rouletteSamples[1] ?? rouletteFirst;
    const rouletteScreenshot = await captureScreenshot(
      cdp,
      sessionId,
      options.rouletteScreenshotName ?? `${session.roomCode}-crown-roulette`
    );

    await navigate(cdp, sessionId, `${qaUrl}&opening-reconnect=${Date.now()}`);
    await waitForSelector(cdp, sessionId, ".citadel-game-opening", 3000);
    const afterReconnect = await collectOpeningState();
    if (afterReconnect.stage === "roulette") rouletteSamples.push(afterReconnect);
    const samplingDeadline = Date.now() + 5_000;
    let settle = null;
    while (Date.now() < samplingDeadline) {
      const sample = await collectOpeningState();
      if (sample.stage === "roulette") rouletteSamples.push(sample);
      if (sample.stage === "settle") {
        settle = sample;
        break;
      }
      await delay(110);
    }
    if (!settle) {
      await waitForSelector(cdp, sessionId, ".citadel-game-opening--settle", 1000);
      settle = await collectOpeningState();
    }
    const settleScreenshot = await captureScreenshot(
      cdp,
      sessionId,
      options.settleScreenshotName ?? `${session.roomCode}-crown-settle`
    );
    await waitForSelectorAbsent(cdp, sessionId, ".citadel-game-opening", 4500);
    const finalCrown = await evaluate(cdp, sessionId, `
      (() => {
        const shell = document.querySelector('.citadel-game-shell');
        const crownPlayerId = shell?.dataset.crownPlayerId ?? null;
        const player = crownPlayerId
          ? [...document.querySelectorAll('[data-player-id]')].find((element) => element.dataset.playerId === crownPlayerId)
          : null;
        const crown = player?.querySelector('.citadel-player-mini__crown');
        const style = crown ? getComputedStyle(crown) : null;
        return {
          crownPlayerId,
          visible: Boolean(crown && style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0')
        };
      })()
    `);
    openingSequence = {
      rouletteFirst,
      rouletteSecond,
      rouletteSamples,
      afterReconnect,
      settle,
      finalCrown,
      rouletteScreenshot,
      settleScreenshot
    };
  }
  if (options.waitForActionDock !== false) {
    await waitForSelector(cdp, sessionId, ".citadel-action-dock", 20000);
  }
  await waitForPageText(cdp, sessionId, session.roomCode, 20000);
  await delay(500);
  return { objectiveIntro, objectiveScreenshot, openingSequence, roomCardLayout };
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
          text: (element.innerText || element.textContent || "").trim().slice(0, 120),
          ariaLabel: element.getAttribute("aria-label") ?? "",
          cardInspector: element.getAttribute("data-card-inspector") ?? "",
          inspectorRoleId: element.getAttribute("data-inspector-role-id") ?? ""
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
        roomCard: rect(".citadel-game-room-card"),
        roomNumber: rect(".citadel-game-room-card__room-number"),
        roomPhase: rect(".citadel-game-room-card__phase"),
        roomObjective: rect(".citadel-game-room-card__objective"),
        roomScoreButton: rect(".citadel-game-room-card__score-button"),
        liveScoreStrip: rect(".citadel-live-score-strip"),
        liveScoreItems: rects("[data-live-score-player-id]"),
        liveScoreMetrics: (() => {
          const strip = document.querySelector(".citadel-live-score-strip");
          const list = strip?.querySelector("ol");
          const items = [...(strip?.querySelectorAll("[data-live-score-player-id]") ?? [])];
          if (!strip || !list) return null;
          const rowTops = [...new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))];
          return {
            rowCount: rowTops.length,
            scrolls: list.scrollWidth > list.clientWidth + 1 || list.scrollHeight > list.clientHeight + 1
          };
        })(),
        topActions: rect(".citadel-game-top-actions"),
        utilityLabels: rects(".citadel-game-top-actions .utility-menu-button span"),
        center: rect(".citadel-game-center"),
        centerCallout: rect(".citadel-game-center__callout"),
        centerRoleCard: rect(".citadel-game-center__role-card"),
        centerTimer: rect(".citadel-game-center__turn-timer, .citadel-game-center__timer"),
        objectiveIntro: rect(".citadel-game-objective-intro"),
        objectiveSummary: rect(".citadel-game-room-card small"),
        selfCityCount: rect(".citadel-self-city__count"),
        centerLines: rects(".citadel-game-center p, .citadel-game-center__turn-timer, .citadel-game-center__timer"),
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
        selectionHeader: rect(".citadel-selection-panel__header, .citadel-role-selection-dock__header"),
        selectionTimer: (() => {
          const element = document.querySelector(".citadel-selection-timer, .citadel-role-selection-dock__timer");
          if (!element) return null;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: box.left, top: box.top, right: box.right, bottom: box.bottom,
            width: box.width, height: box.height,
            borderWidth: style.borderWidth,
            backgroundColor: style.backgroundColor
          };
        })(),
        roleSelectionMetrics: (() => {
          const panel = document.querySelector(".citadel-role-selection-dock");
          const header = panel?.querySelector(".citadel-role-selection-dock__header");
          const viewport = panel?.querySelector(".citadel-role-selection-dock__viewport");
          const cards = panel?.querySelector(".citadel-role-selection-dock__cards");
          const shell = document.querySelector(".citadel-game-shell");
          if (!panel || !header || !viewport || !cards || !shell) return null;
          const panelRect = panel.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          const cardsRect = cards.getBoundingClientRect();
          const panelStyle = getComputedStyle(panel);
          const shellStyle = getComputedStyle(shell);
          const number = (value) => Number.parseFloat(value) || 0;
          const inlineChrome =
            number(panelStyle.paddingLeft) + number(panelStyle.paddingRight) +
            number(panelStyle.borderLeftWidth) + number(panelStyle.borderRightWidth);
          return {
            panelWidth: panelRect.width,
            maxWidth: number(panelStyle.maxWidth),
            handSafeWidth: number(shellStyle.getPropertyValue("--ui-hand-max-width")),
            inlineChrome,
            intrinsicWidth: Math.max(viewport.scrollWidth, header.scrollWidth) + inlineChrome,
            viewport: {
              left: viewportRect.left,
              top: viewportRect.top,
              right: viewportRect.right,
              bottom: viewportRect.bottom,
              width: viewportRect.width,
              height: viewportRect.height
            },
            cards: {
              left: cardsRect.left,
              top: cardsRect.top,
              right: cardsRect.right,
              bottom: cardsRect.bottom,
              width: cardsRect.width,
              height: cardsRect.height
            },
            clientWidth: viewport.clientWidth,
            scrollWidth: viewport.scrollWidth,
            scrollLeft: viewport.scrollLeft,
            scrollable: viewport.scrollWidth > viewport.clientWidth + 1,
            overflowX: getComputedStyle(viewport).overflowX
          };
        })(),
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
        selfIdentityCluster: rect(".citadel-self-identity-cluster"),
        selfProfile: rect(".citadel-self-profile"),
        deckCard: rect(".citadel-self-identity-cluster .citadel-card-back"),
        discardCard: rect(".citadel-self-hand-side .citadel-deck-stack--muted .citadel-card-back"),
        selfCity: rect(".citadel-self-city"),
        builtCards: rects(".citadel-built-card"),
        buildFlight: rect(".citadel-build-flight-card"),
        handZone: rect(".citadel-hand-zone"),
        selfHandColumn: rect(".citadel-self-hand-column"),
        selfHandSide: rect(".citadel-self-hand-side"),
        selfRoleCard: rect(".citadel-self-role-card .citadel-role-card"),
        handCards: rects(".citadel-hand-card"),
        roleCards: rects(".citadel-role-card"),
        roleChoiceCards: rects(".citadel-role-selection-dock .citadel-role-choice.citadel-role-card, .citadel-selection-panel.citadel-action-dock--roles .citadel-role-choice.citadel-role-card"),
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
            playerId: seat.getAttribute("data-player-id") ?? "",
            dense: seat.classList.contains("is-dense"),
            cityCount: Number(seat.getAttribute("data-city-count") ?? 0),
            profile: elementRect(seat.querySelector(".citadel-player-mini")),
            privateRow: elementRect(seat.querySelector(".citadel-opponent-card-line")),
            roleCard: elementRect(seat.querySelector(".citadel-opponent-card-line .citadel-role-card")),
            handRow: elementRect(seat.querySelector(".citadel-opponent-card-line .citadel-mini-card-row")),
            handCountBadge: elementRect(seat.querySelector(".citadel-mini-card-count")),
            cityRow: elementRect(seat.querySelector(".citadel-mini-city-row")),
            handCards: [...seat.querySelectorAll(".citadel-opponent-card-line .citadel-mini-card")].map((card) => elementRect(card)),
            cityCards: cityCards.map((card) => elementRect(card))
          };
        }),
        denseOpponentSeats: rects(".citadel-opponent-seat.is-dense"),
        opponentHandRows: rects(".citadel-opponent-card-line .citadel-mini-card-row"),
        opponentCityRows: rects(".citadel-mini-city-row"),
        opponentHandCardCounts: [...document.querySelectorAll(".citadel-opponent-seat")].map((seat) => {
          const cards = [...seat.querySelectorAll(".citadel-opponent-card-line .citadel-mini-card")];
          const badge = seat.querySelector(".citadel-mini-card-count");
          const box = (element) => {
            if (!element) return null;
            const value = element.getBoundingClientRect();
            return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
          };
          return {
            dense: seat.classList.contains("is-dense"),
            visibleCards: cards.length,
            reportedCount: Number(seat.querySelector(".citadel-mini-card-row")?.getAttribute("data-hand-count") ?? 0),
            countBadge: badge?.textContent?.trim() ?? "",
            lastCardRect: box(cards.at(-1)),
            countBadgeRect: box(badge)
          };
        }),
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
      const grid = panel?.querySelector(".citadel-role-selection-dock__cards, .citadel-role-choice-grid");
      const source = grid?.querySelector(".citadel-role-choice");
      if (!panel || !grid || !source) return false;
      const roles = [
        ["assassin", "刺客"],
        ["thief", "盗贼"],
        ["magician", "魔术师"],
        ["king", "国王"],
        ["bishop", "主教"],
        ["merchant", "商人"],
        ["architect", "建筑师"],
        ["warlord", "军阀"]
      ];
      grid.replaceChildren();
      for (let index = 0; index < ${roleCount}; index += 1) {
        const card = source.cloneNode(true);
        const [roleId, roleName] = roles[index] ?? ["role-" + (index + 1), "身份" + (index + 1)];
        for (const className of [...card.classList]) {
          if (/^citadel-role-card--(assassin|thief|magician|king|bishop|merchant|architect|warlord)$/.test(className)) {
            card.classList.remove(className);
          }
        }
        card.classList.add("citadel-role-card--" + roleId);
        card.dataset.cardInspector = "role";
        card.dataset.inspectorPlacement = "top";
        card.dataset.inspectorSize = "table-small";
        card.dataset.inspectorRoleId = roleId;
        card.setAttribute("aria-label", "玩家身份牌：" + roleName);
        card.querySelector(".citadel-role-card__order").textContent = String(index + 1);
        card.querySelector("strong").textContent = roleName;
        const caption = card.querySelector("small");
        if (caption) caption.textContent = "选择身份";
        grid.append(card);
      }
      return true;
    })()
  `);
  await delay(120);
}

async function collectRoleSelectionViewportState(cdp, sessionId) {
  return evaluate(cdp, sessionId, `
    (() => {
      const viewport = document.querySelector(".citadel-role-selection-dock__viewport");
      if (!viewport) return null;
      return {
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        scrollLeft: viewport.scrollLeft,
        scrollable: viewport.scrollWidth > viewport.clientWidth + 1
      };
    })()
  `);
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
        ariaLabel: element.getAttribute("aria-label") ?? "",
        inspectorRoleId: element.getAttribute("data-inspector-role-id") ?? "",
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
      const descriptionText = inspector.querySelector(".citadel-card-inspector__description > p");
      const sourceViewport = target?.closest(".citadel-role-selection-dock__viewport");
      const sourceViewportRect = sourceViewport?.getBoundingClientRect();
      const actionDock = document.querySelector(".citadel-action-dock")?.getBoundingClientRect();
      const center = document.querySelector(".citadel-game-center")?.getBoundingClientRect();
      const shell = document.querySelector(".citadel-game-shell");
      const compactRect = (value) => value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        target: targetRect ? { left: targetRect.left, top: targetRect.top, right: targetRect.right, bottom: targetRect.bottom, width: targetRect.width, height: targetRect.height } : null,
        targetAriaLabel: target?.getAttribute("aria-label") ?? "",
        targetRoleId: target?.getAttribute("data-inspector-role-id") ?? "",
        text: (inspector.innerText || inspector.textContent || "").trim(),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        card: card ? { left: card.left, top: card.top, right: card.right, bottom: card.bottom, width: card.width, height: card.height } : null,
        description: description ? { left: description.left, top: description.top, right: description.right, bottom: description.bottom, width: description.width, height: description.height } : null,
        descriptionContent: descriptionText ? {
          text: (descriptionText.innerText || descriptionText.textContent || "").trim(),
          clientHeight: descriptionText.clientHeight,
          scrollHeight: descriptionText.scrollHeight
        } : null,
        sourceViewport: sourceViewport ? {
          ...compactRect(sourceViewportRect),
          clientWidth: sourceViewport.clientWidth,
          scrollWidth: sourceViewport.scrollWidth,
          scrollLeft: sourceViewport.scrollLeft,
          scrollable: sourceViewport.scrollWidth > sourceViewport.clientWidth + 1
        } : null,
        actionDock: compactRect(actionDock),
        center: compactRect(center),
        position: getComputedStyle(inspector).position,
        previewScale: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--ui-card-preview-scale")) || 1,
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

async function collectRoleCallPresentation(cdp, sessionId) {
  return evaluate(cdp, sessionId, `
    (() => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height
        };
      };
      const shell = document.querySelector('.citadel-game-shell');
      const roleCall = document.querySelector('.citadel-role-call');
      const cardInner = document.querySelector('.citadel-role-call__card-inner');
      const unansweredCard = document.querySelector('.citadel-role-call--unanswered .citadel-role-call__card');
      const unansweredStamp = document.querySelector('.citadel-role-call__stamp');
      const roleRoute = document.querySelector('.citadel-role-call-route');
      const roleRoutePath = roleRoute?.querySelector('path');
      const roleRouteSvg = roleRoute?.querySelector('svg');
      const activeCenter = document.querySelector('.citadel-game-center--active-turn');
      const highlightedPlayers = [...document.querySelectorAll('.is-role-revealing [data-player-id], .citadel-opponent-seat.is-role-revealing')]
        .map((element) => element.getAttribute('data-player-id') || element.closest('[data-player-id]')?.getAttribute('data-player-id'))
        .filter(Boolean);
      const routePlayerId = roleRoute?.getAttribute('data-role-call-route-player-id') ?? null;
      const routePlayer = routePlayerId
        ? [...document.querySelectorAll('[data-player-id]')].find((element) => element.getAttribute('data-player-id') === routePlayerId)
        : null;
      const routeTarget = routePlayer?.querySelector('.citadel-player-mini__avatar-wrap') ??
        routePlayer?.querySelector('.citadel-player-mini') ?? routePlayer;
      const routeTargetRect = routeTarget?.getBoundingClientRect();
      const routeSvgRect = roleRouteSvg?.getBoundingClientRect();
      const routeLength = roleRoutePath?.getTotalLength?.() ?? 0;
      const routeEnd = routeLength > 0 ? roleRoutePath.getPointAtLength(routeLength) : null;
      const routeTargetDistance = routeEnd && routeSvgRect && routeTargetRect
        ? Math.hypot(
            routeSvgRect.left + routeEnd.x - (routeTargetRect.left + routeTargetRect.width / 2),
            routeSvgRect.top + routeEnd.y - (routeTargetRect.top + routeTargetRect.height / 2)
          )
        : null;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        shellCompact: shell?.getAttribute('data-compact-layout') === 'true',
        pageScrolls: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
        roleCall: roleCall ? {
          rect: rect(roleCall),
          cardRect: rect(document.querySelector('.citadel-role-call__card')),
          roleId: roleCall.getAttribute('data-role-call-role-id'),
          stage: roleCall.getAttribute('data-role-call-stage'),
          playerId: roleCall.getAttribute('data-role-call-player-id'),
          pointerEvents: getComputedStyle(roleCall).pointerEvents,
          text: roleCall.innerText.trim(),
          transform: cardInner ? getComputedStyle(cardInner).transform : null,
          transitionDuration: cardInner ? getComputedStyle(cardInner).transitionDuration : null,
          unansweredCardAnimationDuration: unansweredCard ? getComputedStyle(unansweredCard).animationDuration : null,
          stampAnimationDuration: unansweredStamp ? getComputedStyle(unansweredStamp).animationDuration : null
        } : null,
        highlightedPlayers: [...new Set(highlightedPlayers)],
        roleRoute: roleRoute ? {
          count: document.querySelectorAll('.citadel-role-call-route').length,
          playerId: routePlayerId,
          stage: roleRoute.getAttribute('data-role-call-route-stage'),
          targetDistance: routeTargetDistance,
          pointerEvents: getComputedStyle(roleRoute).pointerEvents
        } : null,
        skillRouteCount: document.querySelectorAll('.citadel-skill-presentation__route').length,
        activeCenter: activeCenter ? {
          rect: rect(activeCenter),
          roleId: activeCenter.getAttribute('data-current-role-id'),
          playerId: activeCenter.getAttribute('data-current-player-id'),
          ariaLabel: activeCenter.getAttribute('aria-label'),
          cardRect: rect(activeCenter.querySelector('.citadel-game-center__role-card')),
          cardCaption: activeCenter.querySelector('.citadel-game-center__role-card small')?.textContent?.trim() ?? '',
          cardInspector: activeCenter.querySelector('.citadel-game-center__role-card')?.getAttribute('data-card-inspector') ?? '',
          cardPointerEvents: activeCenter.querySelector('.citadel-game-center__role-card')
            ? getComputedStyle(activeCenter.querySelector('.citadel-game-center__role-card')).pointerEvents
            : null,
          timerRect: rect(activeCenter.querySelector('.citadel-game-center__turn-timer')),
          timerStyle: activeCenter.querySelector('.citadel-game-center__turn-timer') ? (() => {
            const style = getComputedStyle(activeCenter.querySelector('.citadel-game-center__turn-timer'));
            return { borderRadius: style.borderRadius, backgroundImage: style.backgroundImage };
          })() : null,
          duplicateCopyCount: activeCenter.querySelectorAll('.citadel-game-center__turn-copy, .citadel-game-center__callout').length,
          text: activeCenter.innerText.trim()
        } : null
      };
    })()
  `);
}

function checkRoleCallPresentation(label, state, expectedStage, options = {}) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  const expectedCompact = state.viewport.width <= 1100 || (
    state.viewport.width <= 1365 && state.viewport.height <= 640
  );
  addCheck("role-call overlay is visible", Boolean(state.roleCall), state);
  addCheck("role-call stage matches the server", state.roleCall?.stage === expectedStage, state.roleCall);
  addCheck("role-call presentation never captures pointer input", state.roleCall?.pointerEvents === "none", state.roleCall);
  addCheck("role-call card stays inside the real viewport", insideViewport(state.roleCall?.cardRect, state.viewport, 4), state.roleCall);
  addCheck("compact layout activates only at the supported threshold", state.shellCompact === expectedCompact, state);
  addCheck("role-call page has no outer scrollbar", !state.pageScrolls, state);

  if (expectedStage === "calling") {
    addCheck("calling does not reveal the player", !state.roleCall?.playerId && state.highlightedPlayers.length === 0, state);
    addCheck("calling has no stale or premature route", !state.roleRoute && state.skillRouteCount === 0, state);
    addCheck("calling names the numbered public identity", Boolean(
      state.roleCall?.text.includes("\u53f7") && state.roleCall.text.includes("\u8bf7\u8be5\u8eab\u4efd\u5e94\u7b54")
    ), state.roleCall);
  } else if (expectedStage === "unanswered") {
    addCheck("unanswered keeps the player hidden", !state.roleCall?.playerId && state.highlightedPlayers.length === 0, state);
    addCheck("unanswered has no player route", !state.roleRoute && state.skillRouteCount === 0, state);
    addCheck("unanswered stamp is explicit", state.roleCall?.text.includes("\u65e0\u4eba\u5e94\u7b54"), state.roleCall);
    if (!options.reducedMotion) {
      addCheck("unanswered gray-and-stamp entrance lasts 320ms", Boolean(
        state.roleCall?.unansweredCardAnimationDuration === "0.32s" &&
        state.roleCall?.stampAnimationDuration === "0.32s"
      ), state.roleCall);
    }
  } else if (expectedStage === "revealing") {
    addCheck("reveal publishes exactly one responding player", Boolean(
      state.roleCall?.playerId &&
      state.highlightedPlayers.length === 1 &&
      state.highlightedPlayers[0] === state.roleCall.playerId
    ), state);
    addCheck("reveal draws exactly one dedicated route to the published player", Boolean(
      state.roleRoute?.count === 1 &&
      state.roleRoute.playerId === state.roleCall?.playerId &&
      state.roleRoute.stage === "revealing" &&
      state.roleRoute.pointerEvents === "none" &&
      state.roleRoute.targetDistance !== null &&
      state.roleRoute.targetDistance <= 4 &&
      state.skillRouteCount === 0
    ), state);
    addCheck("revealed identity card is face-up", Boolean(
      state.roleCall?.transform && state.roleCall.transform !== "none"
    ), state.roleCall);
    if (options.reducedMotion) {
      addCheck("reduced motion removes the flip transition", state.roleCall?.transitionDuration === "0s", state.roleCall);
    } else {
      addCheck("identity flip uses the readable 900ms transition", state.roleCall?.transitionDuration === "0.9s", state.roleCall);
    }
  }

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

function checkActiveRoleStatus(label, state, roleId) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  addCheck("role-call overlay closes before action", !state.roleCall, state);
  addCheck("active role status remains visible", Boolean(state.activeCenter), state);
  addCheck("active status keeps the revealed role", state.activeCenter?.roleId === roleId, state.activeCenter);
  addCheck("active status includes role card, player, and countdown", Boolean(
    state.activeCenter?.cardRect && state.activeCenter.timerRect &&
    state.activeCenter.ariaLabel?.includes("\u5f53\u524d\u884c\u52a8")
  ), state.activeCenter);
  const minimumCardWidth = state.shellCompact ? 63.5 : 77.5;
  addCheck("active identity card keeps its readable dedicated size", Boolean(
    state.activeCenter?.cardRect?.width >= minimumCardWidth &&
    Math.abs(state.activeCenter.cardRect.height / state.activeCenter.cardRect.width - 1.5) <= 0.04
  ), { minimumCardWidth, cardRect: state.activeCenter?.cardRect });
  addCheck("active identity card carries the player action caption without duplicate copy", Boolean(
    state.activeCenter?.cardCaption?.includes("\u884c\u52a8") &&
    state.activeCenter.duplicateCopyCount === 0 &&
    !state.activeCenter.text.includes("\u5f53\u524d\u8eab\u4efd") &&
    !state.activeCenter.text.includes("\u6b63\u5728\u884c\u52a8")
  ), state.activeCenter);
  addCheck("active identity card keeps the shared inspector", Boolean(
    state.activeCenter?.cardInspector && state.activeCenter.cardPointerEvents !== "none"
  ), state.activeCenter);
  addCheck("turn countdown is a circular card-corner badge", Boolean(
    state.activeCenter?.timerRect &&
    Math.abs(state.activeCenter.timerRect.width - state.activeCenter.timerRect.height) <= 1 &&
    state.activeCenter.timerStyle?.borderRadius !== "0px" &&
    state.activeCenter.timerStyle?.backgroundImage !== "none"
  ), state.activeCenter);
  addCheck("active status stays inside the real viewport", insideViewport(state.activeCenter?.rect, state.viewport, 4), state.activeCenter);
  addCheck("action page has no outer scrollbar", !state.pageScrolls, state);
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectRoomCardLayout(cdp, sessionId) {
  return evaluate(cdp, sessionId, `
    (() => {
      const rect = (target) => {
        const element = typeof target === 'string' ? document.querySelector(target) : target;
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          selector: typeof target === 'string' ? target : element.className,
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          text: element.textContent?.trim() ?? '',
          opacity: getComputedStyle(element).opacity
        };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        topbar: rect('.citadel-game-topbar'),
        card: rect('.citadel-game-room-card'),
        roomNumber: rect('.citadel-game-room-card__room-number'),
        phase: rect('.citadel-game-room-card__phase'),
        objective: rect('.citadel-game-room-card__objective'),
        scoreButton: rect('.citadel-game-room-card__score-button'),
        liveScoreStrip: rect('.citadel-live-score-strip'),
        liveScoreItems: [...document.querySelectorAll('[data-live-score-player-id]')].map((item) => rect(item)),
        liveScoreMetrics: (() => {
          const list = document.querySelector('.citadel-live-score-strip ol');
          const items = [...document.querySelectorAll('[data-live-score-player-id]')];
          if (!list) return null;
          return {
            rowCount: new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size,
            scrolls: list.scrollWidth > list.clientWidth + 1 || list.scrollHeight > list.clientHeight + 1
          };
        })(),
        topActions: rect('.citadel-game-top-actions'),
        utilityLabels: [...document.querySelectorAll('.citadel-game-top-actions .utility-menu-button span')].map((item) => rect(item))
      };
    })()
  `);
}

function checkRoomCardLayout(label, state) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  const children = [state?.roomNumber, state?.phase, state?.objective, state?.scoreButton];
  addCheck("room card and all four internal elements are present", Boolean(
    state?.card && children.every(Boolean)
  ), state);
  addCheck("room card stays inside the real viewport", insideViewport(state?.card, state?.viewport, 2), state);
  addCheck("victory objective remains visibly present in every phase", Boolean(
    state?.objective?.text?.includes("\u76ee\u6807") && Number(state.objective.opacity) >= 0.95
  ), state?.objective);
  for (const child of children.filter(Boolean)) {
    addCheck(`${child.selector} stays inside the room card`, insideRect(child, state.card, 1), {
      card: state.card,
      child
    });
  }
  const pairs = [
    [state?.roomNumber, state?.phase],
    [state?.roomNumber, state?.objective],
    [state?.roomNumber, state?.scoreButton],
    [state?.phase, state?.objective],
    [state?.phase, state?.scoreButton],
    [state?.objective, state?.scoreButton]
  ];
  for (const [first, second] of pairs) {
    addCheck(`${first?.selector ?? "missing"} does not overlap ${second?.selector ?? "missing"}`, Boolean(
      first && second && !intersects(first, second)
    ), {
      first,
      second,
      gap: rectGap(first, second)
    });
  }
  const phaseButtonGap = state?.phase && state?.scoreButton
    ? state.scoreButton.left - state.phase.right
    : null;
  addCheck("phase and scoring button keep at least 6px horizontal spacing", Boolean(
    phaseButtonGap !== null && phaseButtonGap >= 5.5
  ), { phaseButtonGap, phase: state?.phase, scoreButton: state?.scoreButton });
  addCheck("scoring button is plain text without a star", state?.scoreButton?.text === "计分", state?.scoreButton);
  addCheck("live score strip stays between the room card and utility menu", Boolean(
    state?.liveScoreStrip && state?.topActions &&
    insideViewport(state.liveScoreStrip, state.viewport, 2) &&
    !intersects(state.card, state.liveScoreStrip, 4) &&
    !intersects(state.liveScoreStrip, state.topActions, 4)
  ), { roomCard: state?.card, liveScoreStrip: state?.liveScoreStrip, topActions: state?.topActions });
  const compact = state?.viewport?.width <= 1100 || (
    state?.viewport?.width <= 1365 && state?.viewport?.height <= 640
  );
  addCheck("live score strip uses one wide row or at most two compact rows without scrolling", Boolean(
    state?.liveScoreItems?.length >= 4 &&
    state?.liveScoreMetrics &&
    !state.liveScoreMetrics.scrolls &&
    (compact ? state.liveScoreMetrics.rowCount <= 2 : state.liveScoreMetrics.rowCount === 1)
  ), { compact, items: state?.liveScoreItems, metrics: state?.liveScoreMetrics });
  addCheck("all four utility menu labels remain visibly rendered", Boolean(
    state?.utilityLabels?.length === 4 &&
    state.utilityLabels.every((item) => item.width > 2 && item.height > 2 && Number(item.opacity) >= 0.95)
  ), state?.utilityLabels);
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectScoringOverviewFlow(cdp, sessionId, screenshotName) {
  const opened = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector('[data-scoring-trigger]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) return { opened: false };
  await waitForSelector(cdp, sessionId, ".citadel-scoring-overview", 3000);
  await delay(80);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9
  }, sessionId);
  const openState = await evaluate(cdp, sessionId, `
    (() => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const miniStatuses = [...document.querySelectorAll('.citadel-player-mini[data-player-id]')].map((mini) => ({
        playerId: mini.getAttribute('data-player-id'),
        rect: rect(mini),
        contentContained: (() => {
          const bounds = mini.getBoundingClientRect();
          const content = [
            mini.querySelector('.citadel-player-mini__avatar-wrap'),
            mini.querySelector('.citadel-player-mini__copy'),
            mini.querySelector('.citadel-player-mini__resources'),
            ...mini.querySelectorAll('.citadel-player-mini__resources > *')
          ].filter(Boolean).map((element) => element.getBoundingClientRect());
          return mini.scrollWidth <= mini.clientWidth + 1 && content.length === 6 && content.every((item) =>
            item.left >= bounds.left - 1 && item.right <= bounds.right + 1 &&
            item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1
          );
        })(),
        cityCount: Number(mini.querySelector('[data-player-city-count]')?.getAttribute('data-player-city-count')),
        cityText: mini.querySelector('[data-player-city-count]')?.textContent?.trim() ?? null,
        hasCurrentScore: Boolean(mini.querySelector('[data-player-current-score], .citadel-player-mini__stat--score')),
        visibleStatusText: [...(mini.querySelector('.citadel-player-mini__copy small')?.childNodes ?? [])]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim(),
        hasTurnBadge: Boolean(mini.querySelector('.citadel-player-mini__turn-badge')),
        statRects: [...mini.querySelectorAll('.citadel-player-mini__stat')].map(rect)
      }));
      const scoreStrip = document.querySelector('.citadel-live-score-strip');
      const scoreList = scoreStrip?.querySelector('ol');
      const scoreItems = [...document.querySelectorAll('[data-live-score-player-id]')].map((item) => ({
        playerId: item.getAttribute('data-live-score-player-id'),
        score: Number(item.getAttribute('data-live-score-value')),
        text: item.innerText.trim(),
        title: item.getAttribute('title') ?? '',
        rect: rect(item)
      }));
      const activeCenter = document.querySelector('.citadel-game-center--active-turn');
      const activeCard = activeCenter?.querySelector('.citadel-game-center__role-card');
      const activeTimer = activeCenter?.querySelector('.citadel-game-center__turn-timer');
      const normalActionDock = document.querySelector('.citadel-action-layer .citadel-action-dock:not([class*="citadel-action-dock--"])');
      const utilityLabels = [...document.querySelectorAll('.citadel-game-top-actions .utility-menu-button span')].map((label) => ({
        text: label.textContent?.trim() ?? '',
        rect: rect(label),
        opacity: getComputedStyle(label).opacity,
        visibility: getComputedStyle(label).visibility
      }));
      const opponentVisibleRects = [...document.querySelectorAll([
        '.citadel-opponent-seat > .citadel-player-mini',
        '.citadel-opponent-seat .citadel-role-card',
        '.citadel-opponent-seat .citadel-card-back',
        '.citadel-opponent-seat .citadel-mini-city-card'
      ].join(','))].map(rect);
      const rows = [...document.querySelectorAll('[data-scoring-player-id]')].map((row) => ({
        playerId: row.getAttribute('data-scoring-player-id'),
        cityCount: Number(row.getAttribute('data-city-count')),
        cityTarget: Number(row.getAttribute('data-city-target')),
        districtScore: Number(row.getAttribute('data-district-score')),
        colorCount: Number(row.getAttribute('data-color-count')),
        colorBonus: Number(row.getAttribute('data-color-bonus')),
        completionBonus: Number(row.getAttribute('data-completion-bonus')),
        totalScore: Number(row.getAttribute('data-total-score')),
        rect: rect(row),
        text: row.innerText.trim()
      }));
      const dialog = document.querySelector('.citadel-scoring-overview');
      const trigger = document.querySelector('[data-scoring-trigger]');
      const active = document.activeElement;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        compact: document.querySelector('.citadel-game-shell')?.getAttribute('data-compact-layout') === 'true',
        pageScrolls: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1,
        topbarRect: rect(document.querySelector('.citadel-game-topbar')),
        roomCardRect: rect(document.querySelector('.citadel-game-room-card')),
        objectiveText: document.querySelector('.citadel-game-room-card__objective')?.textContent?.trim() ?? '',
        objectiveOpacity: document.querySelector('.citadel-game-room-card__objective')
          ? getComputedStyle(document.querySelector('.citadel-game-room-card__objective')).opacity
          : null,
        topActionsRect: rect(document.querySelector('.citadel-game-top-actions')),
        utilityLabels,
        scoreStripRect: rect(scoreStrip),
        scoreItems,
        scoreRowCount: new Set(scoreItems.map((item) => Math.round(item.rect?.top ?? -1))).size,
        scoreScrolls: scoreList ? scoreList.scrollWidth > scoreList.clientWidth + 1 || scoreList.scrollHeight > scoreList.clientHeight + 1 : null,
        activeCenter: activeCenter ? {
          rect: rect(activeCenter),
          playerId: activeCenter.getAttribute('data-current-player-id'),
          roleId: activeCenter.getAttribute('data-current-role-id'),
          text: activeCenter.innerText.trim(),
          duplicateCopyCount: activeCenter.querySelectorAll('.citadel-game-center__turn-copy, .citadel-game-center__callout').length,
          cardRect: rect(activeCard),
          cardCaption: activeCard?.querySelector('small')?.textContent?.trim() ?? '',
          cardInspector: activeCard?.getAttribute('data-card-inspector') ?? '',
          cardPointerEvents: activeCard ? getComputedStyle(activeCard).pointerEvents : null,
          timerRect: rect(activeTimer),
          timerBorderRadius: activeTimer ? getComputedStyle(activeTimer).borderRadius : null,
          timerBackgroundImage: activeTimer ? getComputedStyle(activeTimer).backgroundImage : null
        } : null,
        normalActionDockRect: rect(normalActionDock),
        normalActionGuidance: normalActionDock?.querySelector('.citadel-action-guidance')?.innerText.trim() ?? '',
        normalActionLabels: [...(normalActionDock?.querySelectorAll('.citadel-action-button') ?? [])]
          .map((button) => button.innerText.trim().replace(/\\s+/g, ' ')),
        selfCityRect: rect(document.querySelector('.citadel-self-city')),
        selfHandRect: rect(document.querySelector('.citadel-self-hand-column .citadel-hand-zone')),
        selfAreaRect: rect(document.querySelector('.citadel-self-area')),
        tuning: {
          stored: (() => {
            try { return JSON.parse(localStorage.getItem('zy-game-ui-tuning-v4') ?? 'null')?.config ?? null; }
            catch { return null; }
          })(),
          effective: {
            centerTop: getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-center-top').trim(),
            cityTop: getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-city-top').trim(),
            actionTop: getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-action-top').trim(),
            activeRoleCardWidth: getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-active-role-card-width').trim(),
            scoreStripScale: getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-score-strip-scale').trim()
          }
        },
        opponentVisibleRects,
        dialogRect: rect(dialog),
        dialogText: dialog?.innerText ?? '',
        triggerRect: rect(trigger),
        triggerText: trigger?.textContent?.trim() ?? '',
        focusInsideDialog: Boolean(dialog && active && dialog.contains(active)),
        activeLabel: active?.getAttribute?.('aria-label') ?? '',
        miniStatuses,
        rows,
        selfCityCount: document.querySelector('.citadel-self-city__count')?.textContent?.trim() ?? ''
      };
    })()
  `);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);

  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
  }, sessionId);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-scoring-overview", 3000);
  await delay(30);
  const escapeClose = await evaluate(cdp, sessionId, `
    ({
      closed: !document.querySelector('.citadel-scoring-overview'),
      focusRestored: document.activeElement?.matches?.('[data-scoring-trigger]') ?? false
    })
  `);

  await evaluate(cdp, sessionId, `document.querySelector('[data-scoring-trigger]')?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-scoring-backdrop", 3000);
  await evaluate(cdp, sessionId, `
    (() => {
      const backdrop = document.querySelector('.citadel-scoring-backdrop');
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    })()
  `);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-scoring-overview", 3000);
  await delay(30);
  const backdropClose = await evaluate(cdp, sessionId, `
    ({
      closed: !document.querySelector('.citadel-scoring-overview'),
      focusRestored: document.activeElement?.matches?.('[data-scoring-trigger]') ?? false
    })
  `);

  return { opened, openState, escapeClose, backdropClose, screenshot };
}

function checkScoringOverview(label, flow, gameState) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  const expectedScores = new Map(gameState.players.map((player) => [player.id, calculateVisibleScore(player, gameState)]));
  const state = flow.openState;
  const selfPlayer = gameState.players.find((player) => player.hand);
  const expectedScoreOrder = gameState.players.map((player) => player.id);
  const actualScoreOrder = state?.scoreItems?.map((item) => item.playerId) ?? [];
  addCheck("scoring trigger is visible and explicitly labelled", Boolean(
    state?.triggerText?.includes("计分") && insideViewport(state.triggerRect, state.viewport, 2)
  ), state);
  addCheck("scoring overview opens inside the real viewport", Boolean(
    flow.opened && insideViewport(state?.dialogRect, state?.viewport, 4)
  ), state);
  addCheck("scoring overview contains every public player", state?.rows?.length === gameState.players.length, state?.rows);
  addCheck("scoring rules expose all bonuses and Ghost City", [
    "五色 +3", "首位完城 +4", "其他完城 +2", "鬼城补 1 种缺色"
  ].every((text) => state?.dialogText?.includes(text)), state?.dialogText);
  addCheck("focus stays trapped inside the scoring dialog", Boolean(state?.focusInsideDialog), state?.activeLabel);
  addCheck("scoring overview never creates an outer page scrollbar", !state?.pageScrolls, state);
  addCheck("persistent objective remains visible while scoring is available", Boolean(
    state?.objectiveText?.includes("\u76ee\u6807") && Number(state.objectiveOpacity) >= 0.95
  ), { objectiveText: state?.objectiveText, objectiveOpacity: state?.objectiveOpacity });
  addCheck("all four utility labels stay visibly rendered", Boolean(
    state?.utilityLabels?.length === 4 &&
    state.utilityLabels.map((item) => item.text).join("|") === "\u516c\u544a|\u5e2e\u52a9|\u8bbe\u7f6e|\u9000\u51fa\u623f\u95f4" &&
    state.utilityLabels.every((item) => item.rect?.width > 2 && item.rect?.height > 2 && item.visibility !== "hidden" && Number(item.opacity) >= 0.95)
  ), state?.utilityLabels);
  addCheck("live score strip stays between room information and utility controls", Boolean(
    state?.scoreStripRect &&
    insideViewport(state.scoreStripRect, state.viewport, 2) &&
    !intersects(state.roomCardRect, state.scoreStripRect, 4) &&
    !intersects(state.scoreStripRect, state.topActionsRect, 4)
  ), { roomCard: state?.roomCardRect, scoreStrip: state?.scoreStripRect, topActions: state?.topActionsRect });
  addCheck("live score strip contains every player once in seat order", Boolean(
    JSON.stringify(actualScoreOrder) === JSON.stringify(expectedScoreOrder) &&
    new Set(actualScoreOrder).size === gameState.players.length
  ), { expectedScoreOrder, actualScoreOrder, scoreItems: state?.scoreItems });
  addCheck("live score strip uses one wide row or at most two compact rows without scrolling", Boolean(
    state?.scoreScrolls === false &&
    (state?.compact ? state.scoreRowCount >= 1 && state.scoreRowCount <= 2 : state?.scoreRowCount === 1)
  ), { compact: state?.compact, rowCount: state?.scoreRowCount, scrolls: state?.scoreScrolls });
  for (const player of gameState.players) {
    const scoreItem = state?.scoreItems?.find((item) => item.playerId === player.id);
    const expected = expectedScores.get(player.id);
    addCheck(`${player.name} live score matches the shared total`, Boolean(
      scoreItem && expected && scoreItem.score === expected.totalScore && scoreItem.title.includes(player.id === selfPlayer?.id ? player.name : player.name)
    ), { scoreItem, expected });
  }

  const minimumCardWidth = state?.compact ? 63.5 : 77.5;
  addCheck("active turn is expressed by one readable identity card", Boolean(
    state?.activeCenter?.cardRect &&
    state.activeCenter.cardRect.width >= minimumCardWidth &&
    Math.abs(state.activeCenter.cardRect.height / state.activeCenter.cardRect.width - 1.5) <= 0.04 &&
    state.activeCenter.cardCaption.includes("\u884c\u52a8") &&
    state.activeCenter.duplicateCopyCount === 0 &&
    !state.activeCenter.text.includes("\u5f53\u524d\u8eab\u4efd") &&
    !state.activeCenter.text.includes("\u6b63\u5728\u884c\u52a8")
  ), { minimumCardWidth, activeCenter: state?.activeCenter });
  addCheck("active identity card keeps inspector access and a circular timer badge", Boolean(
    state?.activeCenter?.cardInspector &&
    state.activeCenter.cardPointerEvents !== "none" &&
    state.activeCenter.timerRect &&
    Math.abs(state.activeCenter.timerRect.width - state.activeCenter.timerRect.height) <= 1 &&
    state.activeCenter.timerBorderRadius !== "0px" &&
    state.activeCenter.timerBackgroundImage !== "none"
  ), state?.activeCenter);
  const centerRects = [state?.activeCenter?.cardRect, state?.activeCenter?.timerRect].filter(Boolean);
  const activeRoleRect = centerRects.length > 0 ? {
    left: Math.min(...centerRects.map((rect) => rect.left)),
    top: Math.min(...centerRects.map((rect) => rect.top)),
    right: Math.max(...centerRects.map((rect) => rect.right)),
    bottom: Math.max(...centerRects.map((rect) => rect.bottom))
  } : null;
  if (activeRoleRect) {
    activeRoleRect.width = activeRoleRect.right - activeRoleRect.left;
    activeRoleRect.height = activeRoleRect.bottom - activeRoleRect.top;
  }
  addCheck("active identity card stays clear of seats, city, and action controls", Boolean(
    centerRects.length > 0 &&
    centerRects.every((centerRect) =>
      !intersects(centerRect, state?.selfCityRect, 4) &&
      !intersects(centerRect, state?.normalActionDockRect, 4) &&
      (state?.opponentVisibleRects ?? []).every((opponentRect) => !intersects(centerRect, opponentRect, 4))
    )
  ), {
    centerRects,
    selfCityRect: state?.selfCityRect,
    normalActionDockRect: state?.normalActionDockRect,
    opponentVisibleRects: state?.opponentVisibleRects
  });
  const centralBottomRegions = [
    { name: "active-role", rect: activeRoleRect },
    { name: "self-city", rect: state?.selfCityRect },
    { name: "action-dock", rect: state?.normalActionDockRect },
    { name: "self-hand", rect: state?.selfHandRect }
  ].filter((item) => item.rect);
  const centralBottomCollisions = [];
  for (let leftIndex = 0; leftIndex < centralBottomRegions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < centralBottomRegions.length; rightIndex += 1) {
      const left = centralBottomRegions[leftIndex];
      const right = centralBottomRegions[rightIndex];
      if (intersects(left.rect, right.rect, 8)) {
        centralBottomCollisions.push({
          left: left.name,
          right: right.name,
          leftRect: left.rect,
          rightRect: right.rect,
          gap: rectGap(left.rect, right.rect)
        });
      }
    }
  }
  addCheck("central and bottom hard regions keep an 8px safety gap", centralBottomCollisions.length === 0, {
    collisions: centralBottomCollisions,
    regions: centralBottomRegions,
    tuning: state?.tuning
  });

  const isSelfTurn = Boolean(selfPlayer && gameState.currentTurnPlayerId === selfPlayer.id);
  addCheck("normal action controls are concise and only render for the acting player", Boolean(
    isSelfTurn
      ? state?.normalActionDockRect &&
        !state.normalActionGuidance &&
        state.normalActionLabels.length === 4 &&
        state.normalActionLabels[0] === "\u91d1\u5e01" &&
        state.normalActionLabels[1] === "\u62bd\u724c" &&
        state.normalActionLabels[2].startsWith("\u6280\u80fd") &&
        state.normalActionLabels[3] === "\u7ed3\u675f"
      : !state?.normalActionDockRect
  ), { isSelfTurn, guidance: state?.normalActionGuidance, labels: state?.normalActionLabels });
  addCheck("all player nameplates stay inside the viewport", Boolean(
    state?.miniStatuses?.length === gameState.players.length &&
    state.miniStatuses.every((mini) => insideViewport(mini.rect, state.viewport, 2))
  ), state?.miniStatuses);
  addCheck("player nameplates do not collide with adjacent players", Boolean(
    state?.miniStatuses?.length === gameState.players.length &&
    !hasInternalRectCollision(state.miniStatuses.map((mini) => mini.rect))
  ), state?.miniStatuses);
  addCheck("all avatar, name/status, and resource columns stay inside their nameplates", Boolean(
    state?.miniStatuses?.length === gameState.players.length &&
    state.miniStatuses.every((mini) => mini.contentContained)
  ), state?.miniStatuses);

  for (const player of gameState.players) {
    const expected = expectedScores.get(player.id);
    const mini = state?.miniStatuses?.find((item) => item.playerId === player.id);
    const row = state?.rows?.find((item) => item.playerId === player.id);
    addCheck(`${player.name} nameplate restores the single building count`, Boolean(
      mini &&
      mini.cityCount === player.city.length &&
      mini.cityText === String(player.city.length) &&
      !mini.cityText.includes("/") &&
      !mini.hasCurrentScore
    ), { mini, expectedCityCount: player.city.length });
    const expectedStatus = !player.connected ? "\u79bb\u7ebf" : player.isBot ? "\u4eba\u673a" : "\u5728\u7ebf";
    addCheck(`${player.name} nameplate keeps only the necessary visible status`, Boolean(
      mini && mini.visibleStatusText === expectedStatus && !mini.hasTurnBadge
    ), { mini, expectedStatus });
    addCheck(`${player.name} scoring row matches the shared breakdown`, Boolean(
      row && expected &&
      row.cityCount === player.city.length &&
      row.cityTarget === gameState.settings.endCitySize &&
      row.districtScore === expected.districtScore &&
      row.colorCount === expected.effectiveColorCount &&
      row.colorBonus === expected.colorBonus &&
      row.completionBonus === expected.completionBonus &&
      row.totalScore === expected.totalScore
    ), { row, expected });
    addCheck(`${player.name} three nameplate resources do not overlap`, Boolean(
      mini?.statRects?.length === 3 && !hasInternalRectCollision(mini.statRects)
    ), mini);
  }

  const selfExpected = selfPlayer ? expectedScores.get(selfPlayer.id) : null;
  addCheck("self city caption restores the original single-count wording", Boolean(
    selfPlayer && selfExpected &&
    state?.selfCityCount === `已建建筑 ${selfPlayer.city.length}` &&
    !state.selfCityCount.includes("/") &&
    !state.selfCityCount.includes("当前总分")
  ), { selfCityCount: state?.selfCityCount, selfExpected });
  addCheck("Escape closes scoring and restores trigger focus", Boolean(
    flow.escapeClose?.closed && flow.escapeClose.focusRestored
  ), flow.escapeClose);
  addCheck("backdrop closes scoring and restores trigger focus", Boolean(
    flow.backdropClose?.closed && flow.backdropClose.focusRestored
  ), flow.backdropClose);

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

function calculateVisibleScore(player, gameState) {
  const standardColors = ["yellow", "blue", "green", "red", "purple"];
  const fixedColors = new Set(player.city
    .filter((district) => district.effectType !== "wildcard_scoring_color")
    .map((district) => district.color));
  const wildcardCount = player.city.filter((district) => district.effectType === "wildcard_scoring_color").length;
  const missing = standardColors.filter((color) => !fixedColors.has(color)).length;
  const effectiveColorCount = Math.min(5, fixedColors.size + Math.min(wildcardCount, missing));
  const colorBonus = effectiveColorCount === 5 ? 3 : 0;
  const completionBonus = player.city.length < gameState.settings.endCitySize
    ? 0
    : gameState.firstCompletedCityPlayerId === player.id ? 4 : 2;
  const districtScore = player.city.reduce((sum, district) => sum + district.score, 0);
  return {
    districtScore,
    effectiveColorCount,
    colorBonus,
    completionBonus,
    totalScore: districtScore + colorBonus + completionBonus
  };
}

function hasInternalRectCollision(rects) {
  for (let leftIndex = 0; leftIndex < rects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex += 1) {
      if (intersects(rects[leftIndex], rects[rightIndex], 0)) return true;
    }
  }
  return false;
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

function rectGap(a, b) {
  if (!a || !b) return null;
  const horizontal = Math.max(b.left - a.right, a.left - b.right);
  const vertical = Math.max(b.top - a.bottom, a.top - b.bottom);
  return {
    horizontal,
    vertical,
    separatingGap: Math.max(horizontal, vertical),
    overlaps: horizontal < 0 && vertical < 0
  };
}

function centerDistance(first, second) {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const firstX = first.left + first.width / 2;
  const firstY = first.top + first.height / 2;
  const secondX = second.left + second.width / 2;
  const secondY = second.top + second.height / 2;
  return Math.hypot(firstX - secondX, firstY - secondY);
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
  const lowHeightTurnPanel = viewport?.width >= 1101 && viewport?.width <= 1500 && viewport?.height <= 720;
  const sideTurnPanel = wideTurnPanel || lowHeightTurnPanel;
  addCheck("game shell exists", Boolean(layout.shell));
  addCheck("action dock exists", Boolean(layout.actionDock));
  addCheck("center status exists", Boolean(layout.center));
  addCheck("center timer exists", Boolean(layout.centerTimer));
  if (layout.centerRoleCard) {
    const minimumCardWidth = layout.shellClass.includes("citadel-game-shell--compact") ? 63.5 : 77.5;
    addCheck("role action is anchored by one readable identity card", Boolean(
      layout.centerRoleCard.width >= minimumCardWidth &&
      Math.abs(layout.centerRoleCard.height / layout.centerRoleCard.width - 1.5) <= 0.04 &&
      layout.centerRoleCard.text.includes("\u884c\u52a8") &&
      !layout.centerCallout
    ), { minimumCardWidth, card: layout.centerRoleCard, callout: layout.centerCallout });
  }
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
  addCheck(sideTurnPanel ? "side turn controls use the lower-right action panel" : "compact turn controls have no outer frame", Boolean(
    layout.actionDockVisual && (sideTurnPanel
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
  addCheck("live score strip stays inside the top gap without scrolling", Boolean(
    layout.liveScoreStrip &&
    insideViewport(layout.liveScoreStrip, viewport, 2) &&
    !intersects(layout.roomCard, layout.liveScoreStrip, 4) &&
    !intersects(layout.liveScoreStrip, layout.topActions, 4) &&
    layout.liveScoreMetrics &&
    !layout.liveScoreMetrics.scrolls &&
    (layout.shellClass.includes("citadel-game-shell--compact")
      ? layout.liveScoreMetrics.rowCount <= 2
      : layout.liveScoreMetrics.rowCount === 1)
  ), {
    roomCard: layout.roomCard,
    liveScoreStrip: layout.liveScoreStrip,
    topActions: layout.topActions,
    metrics: layout.liveScoreMetrics
  });
  addCheck("all four utility menu labels remain visible", Boolean(
    layout.utilityLabels?.length === 4 && layout.utilityLabels.every((item) => item.width > 2 && item.height > 2)
  ), layout.utilityLabels);
  for (const seat of layout.opponentSeats ?? []) {
    const visibleSeatElements = [seat.profile, seat.roleCard, ...(seat.handCards ?? []), ...(seat.cityCards ?? [])]
      .filter(Boolean);
    const roomCollisions = visibleSeatElements.filter((element) => intersects(layout.roomCard, element, 4));
    addCheck(`room card stays clear of opponent seat: ${seat.position}`, roomCollisions.length === 0, {
      position: seat.position,
      playerId: seat.playerId,
      roomCard: layout.roomCard,
      collisions: roomCollisions,
      requiredGap: 4
    });
  }
  if (layout.centerRoleCard && !layout.tableTargetingDock && !layout.selectionHeader) {
    addCheck("normal turn controls remove the repeated guidance paragraph", !layout.actionGuidance, layout.actionGuidance);
  }

  for (const line of layout.centerLines ?? []) {
    addCheck(`action dock does not overlap center line: ${line.text}`, !intersects(layout.actionDock, line, 8), {
      actionDock: layout.actionDock,
      centerLine: line
    });
  }

  if (sideTurnPanel) {
    const protectedSelfElements = [
      layout.selfProfile,
      layout.deckCard,
      layout.discardCard,
      layout.selfRoleCard,
      layout.handZone
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
    if ((layout.builtCards?.length ?? 0) > 0) {
      addCheck("built district cards sit above the action dock", layout.builtCards.every(
        (card) => card.bottom + 8 <= layout.actionDock.top
      ), {
        builtCards: layout.builtCards,
        actionDock: layout.actionDock
      });
    }
  }
  for (const builtCard of layout.builtCards ?? []) {
    addCheck(`center status does not overlap built district: ${builtCard.text}`, !intersects(layout.center, builtCard, 8), {
      center: layout.center,
      builtCard
    });
  }
  for (const seat of layout.opponentSeats ?? []) {
    const visibleSeatElements = [seat.profile, seat.roleCard, ...(seat.handCards ?? []), ...(seat.cityCards ?? [])]
      .filter(Boolean);
    addCheck(`center status does not overlap visible opponent elements: ${seat.position}`, visibleSeatElements.every(
      (element) => !intersects(layout.center, element, 8)
    ), {
      center: layout.center,
      position: seat.position,
      playerId: seat.playerId,
      visibleSeatElements
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
      for (const handCard of layout.handCards ?? []) {
        addCheck(`self hand and built district keep a four-pixel gap: ${builtCard.text}`, !intersects(handCard, builtCard, 4), {
          handCard,
          builtCard,
          requiredGap: 4
        });
      }
      addCheck(`self role and built district do not interleave: ${builtCard.text}`, !intersects(layout.selfRoleCard, builtCard, 4), {
        selfRoleCard: layout.selfRoleCard,
        builtCard,
        requiredGap: 4
      });
    }
    const firstBuiltCard = layout.builtCards[0] ?? null;
    if (options.allowTunedSelfCardScale) {
      addCheck("built district cards remain readable under tuning", Boolean(firstBuiltCard && firstBuiltCard.width >= 42 && firstBuiltCard.height >= 60), {
        builtCard: firstBuiltCard
      });
    } else {
      const compactLayout = layout.shellClass?.includes("citadel-game-shell--compact");
      const minimumBuiltCardWidth = compactLayout ? 42 : 64;
      const minimumBuiltCardHeight = compactLayout ? 60 : 90;
      addCheck("built district cards remain readable", Boolean(
        firstBuiltCard &&
        firstBuiltCard.width >= minimumBuiltCardWidth &&
        firstBuiltCard.height >= minimumBuiltCardHeight
      ), {
        builtCard: firstBuiltCard,
        minimumBuiltCardWidth,
        minimumBuiltCardHeight
      });
    }
  }
  addCheck("topbar does not overlap action dock", !intersects(layout.topbar, layout.actionDock, 8), {
    topbar: layout.topbar,
    actionDock: layout.actionDock
  });

  const firstHandCard = layout.handCards?.[0] ?? null;
  addCheck("self role card exists", Boolean(layout.selfRoleCard), layout.selfRoleCard);
  if (firstHandCard) {
    addCheck("self role card sits left of hand cards", Boolean(layout.selfRoleCard && layout.selfRoleCard.right <= firstHandCard.left + 4), {
      selfRoleCard: layout.selfRoleCard,
      firstHandCard
    });
  }
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
  const bottomSafetyGap = viewport.height <= 720 ? 4 : 6;
  if (layout.selfIdentityCluster && layout.selfHandColumn) {
    addCheck("identity cluster stays outside the hand track", layout.selfIdentityCluster.right + bottomSafetyGap <= layout.selfHandColumn.left, {
      identityCluster: layout.selfIdentityCluster,
      handColumn: layout.selfHandColumn,
      requiredGap: bottomSafetyGap
    });
  }
  if (layout.selfHandColumn && layout.selfHandSide) {
    addCheck("hand track stays outside the discard/control region", layout.selfHandColumn.right + bottomSafetyGap <= layout.selfHandSide.left, {
      handColumn: layout.selfHandColumn,
      handSide: layout.selfHandSide,
      requiredGap: bottomSafetyGap
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
  addCheck("collapsed log and chat are vertical edge tabs", Boolean(
    layout.cornerDocks?.length === 2 &&
    layout.cornerDocks.every((dock) => dock.height > dock.width * 1.4) &&
    layout.cornerDocks[0].left <= 1 &&
    layout.cornerDocks[1].right >= viewport.width - 1
  ), { cornerDocks: layout.cornerDocks, viewport });
  const cornerOpponentCollisions = (layout.cornerDocks ?? []).flatMap((dock, dockIndex) =>
    (layout.opponentSeats ?? []).flatMap((seat) => {
      const elements = [
        ["profile", seat.profile],
        ["role", seat.roleCard],
        ["hand count", seat.handCountBadge],
        ...(seat.handCards ?? []).map((element, index) => [`hand ${index + 1}`, element]),
        ...(seat.cityCards ?? []).map((element, index) => [`district ${index + 1}`, element])
      ];
      return elements
        .filter(([, element]) => element && intersects(dock, element, 4))
        .map(([elementName, element]) => ({
          dock: dockIndex === 0 ? "game log" : "chat",
          seat: seat.position,
          playerId: seat.playerId,
          element: elementName,
          dockRect: dock,
          elementRect: element
        }));
    })
  );
  addCheck("collapsed log and chat stay clear of every opponent element", cornerOpponentCollisions.length === 0, {
    collisions: cornerOpponentCollisions
  });
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
    const visibleSeatElements = [seat.profile, seat.roleCard, ...(seat.handCards ?? []), ...(seat.cityCards ?? [])]
      .filter(Boolean);
    addCheck(`opponent seat stays inside viewport: ${seat.text}`, insideViewport(seat, viewport, 2), seat);
    addCheck(`visible opponent elements do not overlap action controls: ${seat.position}`, visibleSeatElements.every(
      (element) => !intersects(element, layout.actionDock, 6)
    ), {
      position: seat.position,
      playerId: seat.playerId,
      visibleSeatElements,
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
    addCheck(`opponent role card exists in its private-card lane: ${seat.position}`, Boolean(
      seat.roleCard && insideRect(seat.roleCard, seat.privateRow, 1)
    ), { position: seat.position, roleCard: seat.roleCard, privateRow: seat.privateRow });
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
      addCheck(`opponent role and hidden hand keep a four-pixel gap: ${seat.position}`, !intersects(seat.roleCard, card, 4), {
        position: seat.position,
        playerId: seat.playerId,
        roleCard: seat.roleCard,
        handCard: card,
        gap: rectGap(seat.roleCard, card),
        requiredGap: 4
      });
      addCheck(`opponent profile and hidden hand do not interleave: ${seat.position}`, !intersects(seat.profile, card, 4), {
        position: seat.position,
        playerId: seat.playerId,
        profile: seat.profile,
        handCard: card,
        requiredGap: 4
      });
    }
    for (const card of seat.cityCards) {
      const compactLayout = layout.shellClass?.includes("citadel-game-shell--compact");
      const minWidth = compactLayout ? 25 : seat.dense ? 28 : 32;
      const minHeight = compactLayout ? 38 : seat.dense ? 42 : 46;
      addCheck(`opponent district is a readable face-up card: ${seat.position}`, Boolean(
        card.width >= minWidth &&
        card.height >= minHeight &&
        card.height > card.width &&
        insideViewport(card, viewport, 2)
      ), { position: seat.position, dense: seat.dense, card });
      const verticallyInsideCityLane = card.top >= seat.cityRow.top - 1 && card.bottom <= seat.cityRow.bottom + 1;
      const insideDirectionalCityLane = seat.position.startsWith("right-")
        ? verticallyInsideCityLane && card.right <= seat.cityRow.right + 1
        : seat.position.startsWith("left-")
          ? verticallyInsideCityLane && card.left >= seat.cityRow.left - 1
          : insideRect(card, seat.cityRow, 1);
      addCheck(`opponent district stays inside its own city lane: ${seat.position}`, insideDirectionalCityLane, {
        position: seat.position,
        seat: { left: seat.left, top: seat.top, right: seat.right, bottom: seat.bottom },
        cityRow: seat.cityRow,
        card
      });
      for (const handCard of seat.handCards ?? []) {
        addCheck(`opponent hand and public district keep a four-pixel gap: ${seat.position}`, !intersects(handCard, card, 4), {
          position: seat.position,
          playerId: seat.playerId,
          handCard,
          districtCard: card,
          gap: rectGap(handCard, card),
          requiredGap: 4
        });
      }
      addCheck(`opponent role and public district do not interleave: ${seat.position}`, !intersects(seat.roleCard, card, 4), {
        position: seat.position,
        playerId: seat.playerId,
        roleCard: seat.roleCard,
        districtCard: card,
        requiredGap: 4
      });
      addCheck(`opponent profile and public district do not interleave: ${seat.position}`, !intersects(seat.profile, card, 4), {
        position: seat.position,
        playerId: seat.playerId,
        profile: seat.profile,
        districtCard: card,
        requiredGap: 4
      });
    }
    for (let cardIndex = 1; cardIndex < seat.cityCards.length; cardIndex += 1) {
      const previous = seat.cityCards[cardIndex - 1];
      const current = seat.cityCards[cardIndex];
      const minimumVisibleStrip = viewport.height <= 720 ? 6 : 10;
      addCheck(`opponent city keeps ordered readable card strips: ${seat.position}`, current.left - previous.left >= minimumVisibleStrip, {
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
      const firstSeat = layout.opponentSeats[leftIndex];
      const secondSeat = layout.opponentSeats[rightIndex];
      const firstElements = [firstSeat.profile, firstSeat.roleCard, ...(firstSeat.handCards ?? []), ...(firstSeat.cityCards ?? [])]
        .filter(Boolean);
      const secondElements = [secondSeat.profile, secondSeat.roleCard, ...(secondSeat.handCards ?? []), ...(secondSeat.cityCards ?? [])]
        .filter(Boolean);
      const collisions = firstElements.flatMap((first) => secondElements
        .filter((second) => intersects(first, second, 4))
        .map((second) => ({ first, second }))
      );
      addCheck(`opponent seats ${leftIndex + 1} and ${rightIndex + 1} keep visible elements separate`, collisions.length === 0, {
        firstPlayerId: firstSeat.playerId,
        secondPlayerId: secondSeat.playerId,
        collisions
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
    addCheck("opponent hand stacks render the real card count", (layout.opponentHandCardCounts ?? []).every((row) =>
      row.visibleCards === row.reportedCount && Number(row.countBadge) === row.reportedCount
    ), {
      rows: layout.opponentHandCardCounts
    });
    addCheck("opponent hand badges stay anchored to the last card corner", (layout.opponentHandCardCounts ?? []).every((row) => {
      if (row.reportedCount === 0) return row.countBadgeRect == null;
      if (!row.lastCardRect || !row.countBadgeRect) return false;
      return row.countBadgeRect.left <= row.lastCardRect.right + 2 &&
        row.countBadgeRect.right >= row.lastCardRect.right - 2 &&
        Math.abs(row.countBadgeRect.bottom - row.lastCardRect.bottom) <= 2;
    }), {
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
    addCheck("action dock exposes the concise skill button", (layout.actionButtons ?? []).some((button) => button.text.startsWith("技能")), {
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

function checkOpeningSequence(label, preparation, gameState) {
  const sequence = preparation.openingSequence;
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass, details });
  addCheck("opening starts with the objective", Boolean(preparation.objectiveIntro), preparation.objectiveIntro);
  addCheck("opening uses the authoritative nine-second timer", gameState.turnTimer?.timeoutMs === 9000, gameState.turnTimer);
  addCheck("crown roulette follows the objective", Boolean(
    sequence?.rouletteFirst?.stage === "roulette" && sequence.rouletteFirst.crownRect
  ), sequence?.rouletteFirst);
  addCheck("roulette switches restrained seat halos", Boolean(
    sequence?.rouletteFirst?.haloPlayerId &&
    sequence?.rouletteSecond?.haloPlayerId &&
    sequence.rouletteFirst.haloPlayerId !== sequence.rouletteSecond.haloPlayerId
  ), {
    first: sequence?.rouletteFirst?.haloPlayerId,
    second: sequence?.rouletteSecond?.haloPlayerId
  });
  const sampledPlayerIds = [...new Set(
    (sequence?.rouletteSamples ?? []).map((sample) => sample?.haloPlayerId).filter(Boolean)
  )];
  addCheck("crown halo visits every observable seat across reconnect", sampledPlayerIds.length >= Math.max(1, gameState.players.length - 1), {
    expected: gameState.players.map((player) => player.id),
    sampledPlayerIds,
    reconnectMayHideOneTransition: true
  });
  addCheck("crown remains at the table center during roulette", Boolean(
    crownNearExpectedCenter(sequence?.rouletteFirst) && crownNearExpectedCenter(sequence?.rouletteSecond)
  ), {
    first: sequence?.rouletteFirst,
    second: sequence?.rouletteSecond
  });
  addCheck("roulette owns a readable status panel below the crown", Boolean(
    sequence?.rouletteFirst?.statusRect &&
    insideViewport(sequence.rouletteFirst.statusRect, sequence.rouletteFirst.viewport, 4) &&
    sequence.rouletteFirst.statusOpacity >= .9 &&
    sequence.rouletteFirst.statusText.includes(`第 ${gameState.currentRound} 轮 · 皇冠随机`) &&
    sequence.rouletteFirst.statusText.includes("正在决定本轮皇冠持有者") &&
    Number.isFinite(sequence.rouletteFirst.statusSeconds) &&
    !intersects(sequence.rouletteFirst.crownRect, sequence.rouletteFirst.statusRect, 8)
  ), sequence?.rouletteFirst);
  addCheck("reconnect resumes the current opening stage", Boolean(
    sequence?.afterReconnect?.stage === "roulette" || sequence?.afterReconnect?.stage === "settle"
  ), sequence?.afterReconnect);
  addCheck("the animated crown settles on the server-selected player", Boolean(
    sequence?.settle?.stage === "settle" &&
    sequence.settle.activePlayerId === gameState.crownPlayerId &&
    sequence?.finalCrown?.crownPlayerId === gameState.crownPlayerId &&
    sequence.finalCrown.visible
  ), {
    expected: gameState.crownPlayerId,
    settle: sequence?.settle
  });
  const crownPlayerName = gameState.players.find((player) => player.id === gameState.crownPlayerId)?.name ?? "";
  addCheck("settle status names the final crown owner without covering the crown", Boolean(
    sequence?.settle?.statusText.includes("皇冠归属已确定") &&
    crownPlayerName && sequence.settle.statusText.includes(crownPlayerName) &&
    sequence.settle.statusZIndex > sequence.settle.crownZIndex
  ), { crownPlayerName, settle: sequence?.settle });
  addCheck("the regular crown stays hidden until opening completes", Boolean(
    sequence?.rouletteFirst?.actualCrownHidden && sequence?.settle?.actualCrownHidden
  ), sequence);
  addCheck("opening removes the redundant center crown sentence", Boolean(
    !sequence?.rouletteFirst?.centerText?.includes("获得皇冠") &&
    !sequence?.settle?.centerText?.includes("获得皇冠")
  ), {
    roulette: sequence?.rouletteFirst?.centerText,
    settle: sequence?.settle?.centerText
  });
  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

function crownNearExpectedCenter(state) {
  if (!state?.crownRect || !state.expectedCenter) return false;
  const centerX = state.crownRect.left + state.crownRect.width / 2;
  const centerY = state.crownRect.top + state.crownRect.height / 2;
  return Math.hypot(centerX - state.expectedCenter.x, centerY - state.expectedCenter.y) <= 24;
}

function checkReducedOpeningSequence(label, preparation, gameState) {
  const sequence = preparation.openingSequence;
  return checkDirectSkillFlow(label, [
    ["reduced opening places the crown directly on the final seat", crownNearActiveSeat(sequence?.rouletteFirst), sequence?.rouletteFirst],
    ["reduced opening highlights only the authoritative final seat", Boolean(
      sequence?.rouletteFirst?.reducedMotion &&
      sequence.rouletteFirst.haloPlayerId === gameState.crownPlayerId &&
      sequence?.rouletteSecond?.haloPlayerId === gameState.crownPlayerId
    ), sequence],
    ["reduced opening disables roulette crown and halo motion", Boolean(
      sequence?.rouletteFirst?.crownAnimationName === "none" &&
      sequence?.rouletteFirst?.haloAnimationName === "none"
    ), sequence?.rouletteFirst],
    ["reduced opening restores the remaining stage after reconnect", Boolean(
      sequence?.afterReconnect?.stage === "roulette" || sequence?.afterReconnect?.stage === "settle"
    ), sequence?.afterReconnect],
    ["reduced opening places the crown on the final player without a flight", Boolean(
      sequence?.settle?.activePlayerId === gameState.crownPlayerId &&
      sequence?.finalCrown?.crownPlayerId === gameState.crownPlayerId &&
      sequence.finalCrown.visible
    ), sequence?.settle]
  ]);
}

function crownNearActiveSeat(state) {
  if (!state?.crownRect || !state.activeAvatarRect) return false;
  const crownX = state.crownRect.left + state.crownRect.width / 2;
  const crownY = state.crownRect.top + state.crownRect.height / 2;
  const avatarX = state.activeAvatarRect.left + state.activeAvatarRect.width / 2;
  const avatarY = state.activeAvatarRect.top + state.activeAvatarRect.height / 2;
  return Math.hypot(crownX - avatarX, crownY - avatarY) <= 42;
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
  addCheck("draw countdown is unframed in the panel top-right", Boolean(
    flow.beforeChoice?.selectionTimer && flow.beforeChoice?.drawChoicePanel &&
    flow.beforeChoice.selectionTimer.right <= flow.beforeChoice.drawChoicePanel.right - 8 &&
    flow.beforeChoice.selectionTimer.top >= flow.beforeChoice.drawChoicePanel.top + 8 &&
    flow.beforeChoice.selectionTimer.borderWidth === "0px" &&
    flow.beforeChoice.selectionTimer.backgroundColor === "rgba(0, 0, 0, 0)"
  ), {
    timer: flow.beforeChoice?.selectionTimer,
    panel: flow.beforeChoice?.drawChoicePanel
  });
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
  addCheck("zero built districts keep the original city caption hidden", !layout.selfCityCount, layout.selfCityCount);
  addCheck("role selection panel stays inside the viewport", Boolean(
    layout.actionDock && insideViewport(layout.actionDock, layout.viewport, 8)
  ), {
    roleSelectionPanel: layout.actionDock,
    centerStatus: layout.center,
    countdown: layout.centerTimer
  });
  const roleMetrics = layout.roleSelectionMetrics;
  const expectedPanelWidth = roleMetrics
    ? Math.min(roleMetrics.intrinsicWidth, roleMetrics.maxWidth)
    : 0;
  addCheck("role selection panel follows its intrinsic content width", Boolean(
    layout.actionDock && roleMetrics &&
    Math.abs(layout.actionDock.width - expectedPanelWidth) <= 4
  ), {
    panel: layout.actionDock,
    metrics: roleMetrics,
    expectedPanelWidth
  });
  addCheck("role selection lays out every role without horizontal browsing", Boolean(
    roleMetrics && roleMetrics.overflowX === "visible" &&
    !roleMetrics.scrollable && roleMetrics.scrollLeft === 0
  ), roleMetrics);
  addCheck("role selection panel stays above the player's hand", Boolean(
    layout.actionDock &&
    layout.selfArea &&
    layout.actionDock.bottom + (layout.viewport.height <= 720 ? 4 : 8) <= layout.selfArea.top
  ), {
    roleSelectionPanel: layout.actionDock,
    selfArea: layout.selfArea,
    handZone: layout.handZone
  });
  addCheck("role selection uses card-shaped choices", roleChoiceCards.length > 0, {
    count: roleChoiceCards.length,
    labels: roleChoiceCards.map((card) => card.text)
  });
  addCheck("selection countdown sits in the panel top-right without a frame", Boolean(
    layout.selectionTimer && layout.actionDock && layout.selectionHeader &&
    layout.selectionTimer.right <= layout.actionDock.right - 8 &&
    layout.selectionTimer.top >= layout.actionDock.top + 8 &&
    layout.selectionTimer.left >= layout.selectionHeader.right - 100 &&
    (layout.selectionTimer.borderWidth === "0px" || layout.selectionTimer.borderWidth === "") &&
    layout.selectionTimer.backgroundColor === "rgba(0, 0, 0, 0)"
  ), {
    timer: layout.selectionTimer,
    panel: layout.actionDock,
    header: layout.selectionHeader
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
  const headerOverlaps = roleChoiceCards.filter((card) => intersects(card, layout.selectionHeader, 8));
  addCheck("role choices do not overlap the selection title", headerOverlaps.length === 0, {
    header: layout.selectionHeader,
    overlappingCards: headerOverlaps
  });
  addCheck("role choices use the shared card inspector data", roleChoiceCards.length > 0 && roleChoiceCards.every((card) =>
    card.cardInspector === "role" && Boolean(card.inspectorRoleId)
  ), {
    roleChoiceCards
  });

  return { label, pass: failures.length === 0, failures, checks };
}

function checkRoleSelectionAdaptation(label, compactLayout, fullLayout) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  const compactMetrics = compactLayout.roleSelectionMetrics;
  const fullMetrics = fullLayout.roleSelectionMetrics;

  addCheck("a small role pool does not keep the old empty fixed-width panel", Boolean(
    compactLayout.actionDock && fullLayout.actionDock &&
    compactLayout.actionDock.width < 400 &&
    fullLayout.actionDock.width >= compactLayout.actionDock.width + 40
  ), {
    compactPanel: compactLayout.actionDock,
    fullPanel: fullLayout.actionDock
  });
  addCheck("a small role pool fits without horizontal browsing", Boolean(
    compactMetrics && !compactMetrics.scrollable && compactMetrics.scrollLeft === 0
  ), compactMetrics);
  addCheck("the full role pool stays within the viewport safety cap", Boolean(
    fullLayout.actionDock && fullMetrics &&
    fullLayout.actionDock.width <= fullMetrics.maxWidth + 2 &&
    insideViewport(fullLayout.actionDock, fullLayout.viewport, 8)
  ), { panel: fullLayout.actionDock, metrics: fullMetrics });

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

function checkRoleSelectionInspector(label, flow, viewportState, closed) {
  const checks = [];
  const addCheck = (name, pass, details = undefined) => checks.push({ name, pass: Boolean(pass), details });
  const compact = Boolean(flow && (flow.viewport.height <= 720 || flow.viewport.width <= 1100));
  const expectedCardWidth = flow ? (compact ? 94 : 104) * flow.previewScale : 0;

  addCheck("a role choice opens the shared role inspector", Boolean(
    flow?.kind === "role" && flow.targetRoleId && flow.text.includes("技能说明")
  ), flow);
  addCheck("the role preview uses the tuned absolute card size", Boolean(
    flow?.card && Math.abs(flow.card.width - expectedCardWidth) <= 2
  ), { expectedCardWidth, flow });
  addCheck("the complete role skill remains visible below the enlarged card", Boolean(
    flow?.description && flow?.card && flow.description.top >= flow.card.bottom - 1 &&
    flow.descriptionContent?.text.length >= 12 &&
    flow.descriptionContent.scrollHeight <= flow.descriptionContent.clientHeight + 1
  ), flow);
  addCheck("the inspector is fixed outside the scrolling role viewport", Boolean(
    flow?.position === "fixed" && flow.sourceViewport && flow.rect &&
    flow.rect.bottom <= flow.sourceViewport.top - 4 &&
    insideViewport(flow.rect, flow.viewport, 4)
  ), flow);
  addCheck("the hovered role uses its current visible rectangle without a scroll track", Boolean(
    flow?.target && flow.sourceViewport &&
    flow.target.left >= flow.sourceViewport.left - 1 &&
    flow.target.right <= flow.sourceViewport.right + 1 &&
    !viewportState?.scrollable && !flow.sourceViewport.scrollable &&
    viewportState?.scrollLeft === 0 && flow.sourceViewport.scrollLeft === 0
  ), { viewportState, flow });
  addCheck("the role inspector does not cover its source card", Boolean(
    flow?.rect && flow?.target && !intersects(flow.rect, flow.target)
  ), flow);
  addCheck("the role inspector closes after the 50ms leave delay", closed, closed);

  const failures = checks.filter((check) => !check.pass);
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
        const button = [...document.querySelectorAll(".citadel-hand-card:not(:disabled)")]
          .find((candidate) => candidate.getAttribute("aria-disabled") !== "true");
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        const result = {
          cardId: button.getAttribute("data-hand-card-id"),
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        };
        button.click();
        return result;
      })()
    `);
  }

  let selectedCard = await clickFirstBuildableHandCard();
  if (!selectedCard) {
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
    selectedCard = await clickFirstBuildableHandCard();
  }

  if (!selectedCard) {
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
  let flightStart = null;
  let flightNearTarget = null;
  try {
    await waitForSelector(cdp, sessionId, '.citadel-build-flight-card[data-build-animation-ready="true"]', 2500);
    flightStart = await evaluate(cdp, sessionId, `
      (() => {
        const element = document.querySelector('.citadel-build-flight-card[data-build-animation-ready="true"]');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          cardId: element.getAttribute('data-build-animation-card-id'),
          status: element.getAttribute('data-build-animation-status'),
          sourceRect: {
            left: Number(element.dataset.buildSourceLeft),
            top: Number(element.dataset.buildSourceTop),
            width: Number(element.dataset.buildSourceWidth),
            height: Number(element.dataset.buildSourceHeight),
            right: Number(element.dataset.buildSourceLeft) + Number(element.dataset.buildSourceWidth),
            bottom: Number(element.dataset.buildSourceTop) + Number(element.dataset.buildSourceHeight)
          },
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
        };
      })()
    `);
    await delay(760);
    flightNearTarget = await evaluate(cdp, sessionId, `
      (() => {
        const cardId = ${JSON.stringify(selectedCard.cardId)};
        const element = document.querySelector('[data-build-animation-card-id="' + cardId + '"]');
        const target = document.querySelector('[data-district-card-id="' + cardId + '"], [data-build-target-id="' + cardId + '"]');
        const toRect = (node) => {
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        return { flight: toRect(element), target: toRect(target) };
      })()
    `);
  } catch {
    // The checks below report a missing immediate animation with the captured state.
  }
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
  try {
    await waitForSelectorAbsent(cdp, sessionId, ".citadel-build-flight-card", 5000);
  } catch {
    // A lingering flight is reported by the final layout state.
  }
  await delay(120);
  const afterEnd = await collectLayout(cdp, sessionId);
  return { opened: true, selectedCard, flightStart, flightNearTarget, beforeEnd, afterEnd };
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
    addCheck("confirmed build starts the selected full-card animation immediately", Boolean(
      flow.flightStart &&
      flow.selectedCard &&
      flow.flightStart.cardId === flow.selectedCard.cardId &&
      centerDistance(flow.flightStart.sourceRect, flow.selectedCard.rect) <= 3 &&
      Math.abs(flow.flightStart.sourceRect.width - flow.selectedCard.rect.width) <= 1 &&
      Math.abs(flow.flightStart.sourceRect.height - flow.selectedCard.rect.height) <= 1
    ), { selectedCard: flow.selectedCard, flightStart: flow.flightStart });
    addCheck("build flight approaches the authoritative city slot", Boolean(
      flow.flightNearTarget?.flight &&
      flow.flightNearTarget?.target &&
      centerDistance(flow.flightNearTarget.flight, flow.flightNearTarget.target) <= 80
    ), flow.flightNearTarget);
    addCheck("build confirm closes after confirming build", !flow.afterEnd.confirmDialog, flow.afterEnd.confirmDialog);
    addCheck("build flight is removed after the authoritative card arrives", !flow.afterEnd.buildFlight, flow.afterEnd.buildFlight);
    addCheck("built district appears after confirming build", (flow.afterEnd.builtCards?.length ?? 0) > 0, flow.afterEnd.builtCards);
    const firstBuiltCard = flow.afterEnd.builtCards?.[0] ?? null;
    const firstHandCard = flow.afterEnd.handCards?.[0] ?? null;
    if (firstBuiltCard && firstHandCard) {
      addCheck("confirmed built district remains a readable public card", firstBuiltCard.height >= 90 && firstBuiltCard.width >= 60, {
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

async function collectOpponentBuildFlow(cdp, sessionId, setup, opponentIndex, screenshotName) {
  const opponents = setup.gameState.players.filter((player) => player.id !== setup.created.playerId);
  const actor = opponents[Math.max(0, Math.min(opponents.length - 1, opponentIndex))];
  const before = await evaluate(cdp, sessionId, `
    (() => {
      const hand = document.querySelector('[data-opponent-hand-player-id="${actor?.id ?? ""}"]');
      const cards = [...(hand?.querySelectorAll('.citadel-mini-card') ?? [])];
      const topCard = cards.at(-1);
      const compact = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      return { actorId: ${JSON.stringify(actor?.id ?? null)}, hand: compact(hand), topCard: compact(topCard) };
    })()
  `);

  await configureQaGame(setup, { triggerOpponentBuildIndex: opponentIndex });
  await waitForSelector(cdp, sessionId, '.citadel-build-flight-card.is-opponent[data-build-animation-ready="true"]', 5000);

  const collectSample = () => evaluate(cdp, sessionId, `
    (() => {
      const element = document.querySelector('.citadel-build-flight-card.is-opponent[data-build-animation-ready="true"]');
      if (!element) return null;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      const rect = element.getBoundingClientRect();
      const name = element.querySelector(':scope > strong')?.getBoundingClientRect();
      const cost = element.querySelector(':scope > span')?.getBoundingClientRect();
      return {
        cardId: element.dataset.buildAnimationCardId ?? null,
        sourceRect: {
          left: Number(element.dataset.buildSourceLeft),
          top: Number(element.dataset.buildSourceTop),
          width: Number(element.dataset.buildSourceWidth),
          height: Number(element.dataset.buildSourceHeight),
          right: Number(element.dataset.buildSourceLeft) + Number(element.dataset.buildSourceWidth),
          bottom: Number(element.dataset.buildSourceTop) + Number(element.dataset.buildSourceHeight)
        },
        scaleX: Math.hypot(matrix.a, matrix.b),
        scaleY: Math.hypot(matrix.c, matrix.d),
        baseAspect: element.offsetWidth / element.offsetHeight,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        name: name ? { width: name.width, height: name.height } : null,
        cost: cost ? { width: cost.width, height: cost.height } : null
      };
    })()
  `);

  const start = await collectSample();
  await delay(420);
  const middle = await collectSample();
  await delay(360);
  const reveal = await collectSample();
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-build-flight-card.is-opponent", 5000);
  const final = await evaluate(cdp, sessionId, `
    (() => {
      const city = document.querySelector('[data-player-id="${actor?.id ?? ""}"] .citadel-mini-city-row');
      const card = city?.querySelector('.citadel-mini-city-card');
      const name = card?.querySelector('.citadel-mini-city-card__name');
      return {
        cityCount: city?.querySelectorAll('.citadel-mini-city-card').length ?? 0,
        cardVisible: Boolean(card && getComputedStyle(card).opacity !== '0'),
        nameVisible: Boolean(name && name.getBoundingClientRect().width > 0 && name.getBoundingClientRect().height > 0),
        cardTransform: card ? getComputedStyle(card).transform : null
      };
    })()
  `);
  return { actorId: actor?.id ?? null, before, start, middle, reveal, final, screenshot };
}

function checkOpponentBuildFlow(label, flow) {
  const samples = [flow.start, flow.middle, flow.reveal].filter(Boolean);
  return checkDirectSkillFlow(label, [
    ["opponent build starts from the real top card back", Boolean(
      flow.before?.topCard && flow.before?.hand && flow.start?.rect &&
      flow.before.topCard.width < flow.before.hand.width &&
      centerDistance(flow.before.topCard, flow.start.sourceRect) <= 3 &&
      Math.abs(flow.before.topCard.width - flow.start.sourceRect.width) <= 1 &&
      Math.abs(flow.before.topCard.height - flow.start.sourceRect.height) <= 1
    ), flow],
    ["opponent build keeps one uniform scale throughout the flight", samples.length === 3 && samples.every(
      (sample) => Math.abs(sample.scaleX - sample.scaleY) <= 0.015
    ), samples],
    ["opponent build card text remains measurable during reveal", Boolean(
      flow.reveal?.name?.width > 0 && flow.reveal?.name?.height > 0 &&
      flow.reveal?.cost?.width > 0 && flow.reveal?.cost?.height > 0
    ), flow.reveal],
    ["authoritative opponent district replaces the flight card", Boolean(
      flow.final?.cityCount > 0 && flow.final.cardVisible && flow.final.nameVisible &&
      (flow.final.cardTransform === "none" || flow.final.cardTransform?.startsWith("matrix(1"))
    ), flow.final]
  ]);
}

async function collectReducedOpponentBuildFlow(cdp, sessionId, setup, opponentIndex, screenshotName) {
  const opponents = setup.gameState.players.filter((player) => player.id !== setup.created.playerId);
  const actor = opponents[Math.max(0, Math.min(opponents.length - 1, opponentIndex))];
  const citySelector = `[data-player-id="${actor?.id ?? ""}"] .citadel-mini-city-row`;
  const beforeCityCount = await evaluate(
    cdp,
    sessionId,
    `document.querySelector(${JSON.stringify(citySelector)})?.querySelectorAll('.citadel-mini-city-card').length ?? 0`
  );

  await configureQaGame(setup, { triggerOpponentBuildIndex: opponentIndex });
  const deadline = Date.now() + 5_000;
  let final = null;
  while (Date.now() < deadline) {
    final = await evaluate(cdp, sessionId, `
      (() => {
        const city = document.querySelector(${JSON.stringify(citySelector)});
        const cards = [...(city?.querySelectorAll('.citadel-mini-city-card') ?? [])];
        const card = cards.at(-1);
        const name = card?.querySelector('.citadel-mini-city-card__name');
        return {
          cityCount: cards.length,
          flightCount: document.querySelectorAll('.citadel-build-flight-card').length,
          cardVisible: Boolean(card && getComputedStyle(card).opacity !== '0'),
          nameVisible: Boolean(name && name.getBoundingClientRect().width > 0 && name.getBoundingClientRect().height > 0),
          cardTransform: card ? getComputedStyle(card).transform : null,
          animationCount: card?.getAnimations().length ?? 0
        };
      })()
    `);
    if (final.cityCount > beforeCityCount && final.flightCount === 0) break;
    await delay(50);
  }
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  return { actorId: actor?.id ?? null, beforeCityCount, final, screenshot };
}

function checkReducedOpponentBuildFlow(label, flow) {
  return checkDirectSkillFlow(label, [
    ["reduced-motion opponent build reaches the authoritative city", Boolean(
      flow.final?.cityCount === flow.beforeCityCount + 1 &&
      flow.final.cardVisible &&
      flow.final.nameVisible
    ), flow],
    ["reduced-motion opponent build leaves no moving duplicate", Boolean(
      flow.final?.flightCount === 0 &&
      flow.final.animationCount === 0 &&
      (flow.final.cardTransform === "none" || flow.final.cardTransform?.startsWith("matrix(1"))
    ), flow.final]
  ]);
}

async function collectOpponentResourceDeltaFlow(cdp, sessionId, setup, viewport, opponentIndex, screenshotName) {
  const opponents = setup.gameState.players.filter((player) => player.id !== setup.created.playerId);
  const actor = opponents[Math.max(0, Math.min(opponents.length - 1, opponentIndex))];
  const actorSelector = `[data-player-id="${actor?.id ?? ""}"]`;
  const collectState = () => evaluate(cdp, sessionId, `
    (() => {
      const actor = document.querySelector(${JSON.stringify(actorSelector)});
      const compact = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          opacity: Number(style.opacity),
          text: element.textContent?.trim() ?? '',
          amount: Number(element.dataset.resourceDeltaAmount ?? NaN)
        };
      };
      return {
        actorId: actor?.dataset.playerId ?? null,
        gold: compact(actor?.querySelector('.citadel-player-mini__stat--gold')),
        hand: compact(actor?.querySelector('.citadel-player-mini__stat--hand')),
        goldDelta: compact(actor?.querySelector('[data-resource-delta="gold"]')),
        handDelta: compact(actor?.querySelector('[data-resource-delta="hand"]')),
        selfDeltaCount: document.querySelectorAll('.citadel-player-mini--self [data-resource-delta]').length,
        routeCount: document.querySelectorAll('.citadel-skill-presentation__route').length,
        presentationCount: document.querySelectorAll('.citadel-skill-presentation').length,
        viewport: { width: innerWidth, height: innerHeight }
      };
    })()
  `);

  await configureQaGame(setup, {
    triggerOpponentResourceDelta: { opponentIndex, gold: 2, hand: 1 }
  });
  await waitForSelector(cdp, sessionId, `${actorSelector} [data-resource-delta="gold"]`, 3_000);
  await waitForSelector(cdp, sessionId, `${actorSelector} [data-resource-delta="hand"]`, 3_000);
  await delay(250);
  const positive = await collectState();
  const positiveScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-positive`);
  await waitForSelectorAbsent(cdp, sessionId, `${actorSelector} [data-resource-delta]`, 3_000);

  await configureQaGame(setup, {
    triggerOpponentResourceDelta: { opponentIndex, gold: -2, hand: -2 }
  });
  await waitForSelector(cdp, sessionId, `${actorSelector} [data-resource-delta="gold"]`, 3_000);
  await waitForSelector(cdp, sessionId, `${actorSelector} [data-resource-delta="hand"]`, 3_000);
  await delay(250);
  const negative = await collectState();
  const negativeScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-negative`);
  await waitForSelectorAbsent(cdp, sessionId, `${actorSelector} [data-resource-delta]`, 3_000);

  await preparePage(cdp, sessionId, setup.created, viewport);
  await delay(250);
  const afterRefresh = await collectState();
  return {
    actorId: actor?.id ?? null,
    positive,
    negative,
    afterRefresh,
    screenshots: [positiveScreenshot, negativeScreenshot]
  };
}

function checkOpponentResourceDeltaFlow(label, flow) {
  const isAnchoredAbove = (delta, stat) => Boolean(
    delta && stat &&
    delta.bottom <= stat.top + 1 &&
    Math.abs((delta.left + delta.right) / 2 - (stat.left + stat.right) / 2) <= Math.max(8, stat.width / 2)
  );
  const insideViewport = (rect, viewport) => Boolean(
    rect && viewport && rect.left >= 0 && rect.top >= 0 &&
    rect.right <= viewport.width && rect.bottom <= viewport.height
  );
  return checkDirectSkillFlow(label, [
    ["opponent gold and hand gains show exact signed values", Boolean(
      flow.positive?.goldDelta?.text === "+2" && flow.positive.goldDelta.amount === 2 &&
      flow.positive?.handDelta?.text === "+1" && flow.positive.handDelta.amount === 1
    ), flow.positive],
    ["opponent gold and hand losses show exact signed values", Boolean(
      flow.negative?.goldDelta?.text === "-2" && flow.negative.goldDelta.amount === -2 &&
      flow.negative?.handDelta?.text === "-2" && flow.negative.handDelta.amount === -2
    ), flow.negative],
    ["resource deltas stay anchored above their original numbers", Boolean(
      isAnchoredAbove(flow.positive?.goldDelta, flow.positive?.gold) &&
      isAnchoredAbove(flow.positive?.handDelta, flow.positive?.hand) &&
      isAnchoredAbove(flow.negative?.goldDelta, flow.negative?.gold) &&
      isAnchoredAbove(flow.negative?.handDelta, flow.negative?.hand)
    ), { positive: flow.positive, negative: flow.negative }],
    ["resource deltas remain visible inside the viewport", Boolean(
      flow.positive?.goldDelta?.opacity >= .9 && flow.positive?.handDelta?.opacity >= .9 &&
      flow.negative?.goldDelta?.opacity >= .9 && flow.negative?.handDelta?.opacity >= .9 &&
      insideViewport(flow.positive?.goldDelta, flow.positive?.viewport) &&
      insideViewport(flow.positive?.handDelta, flow.positive?.viewport) &&
      insideViewport(flow.negative?.goldDelta, flow.negative?.viewport) &&
      insideViewport(flow.negative?.handDelta, flow.negative?.viewport)
    ), { positive: flow.positive, negative: flow.negative }],
    ["plain resource updates do not draw routes or central presentations", Boolean(
      flow.positive?.routeCount === 0 && flow.positive?.presentationCount === 0 &&
      flow.negative?.routeCount === 0 && flow.negative?.presentationCount === 0
    ), { positive: flow.positive, negative: flow.negative }],
    ["opponent updates never add a delta to the local player", Boolean(
      flow.positive?.selfDeltaCount === 0 && flow.negative?.selfDeltaCount === 0
    ), { positive: flow.positive, negative: flow.negative }],
    ["refresh does not replay historical resource deltas", Boolean(
      !flow.afterRefresh?.goldDelta && !flow.afterRefresh?.handDelta &&
      flow.afterRefresh?.selfDeltaCount === 0
    ), flow.afterRefresh]
  ]);
}

async function collectRejectedBuildFlow(cdp, sessionId, setup) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2500);
    setup.socket.emit("take_gold", {
      roomCode: setup.created.roomCode,
      playerId: setup.created.playerId
    }, () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await delay(220);

  const selectedCard = await evaluate(cdp, sessionId, `
    (() => {
      const button = [...document.querySelectorAll('.citadel-hand-card:not(:disabled)')]
        .find((candidate) => candidate.getAttribute('aria-disabled') !== 'true');
      if (!button) return null;
      const id = button.getAttribute('data-hand-card-id');
      button.click();
      return id;
    })()
  `);
  if (!selectedCard) return { opened: false };
  await waitForSelector(cdp, sessionId, ".confirm-dialog", 10000);
  await configureQaGame(setup, { nextBuildOutcome: "reject" });
  await evaluate(cdp, sessionId, `document.querySelector('.confirm-dialog__actions button:last-child')?.click()`);
  await waitForSelector(cdp, sessionId, '.citadel-build-flight-card[data-build-animation-ready="true"]', 2500);
  const flightSeen = await evaluate(cdp, sessionId, `Boolean(document.querySelector('.citadel-build-flight-card'))`);
  await waitForSelector(cdp, sessionId, ".citadel-command-feedback", 5000);
  const feedbackText = await evaluate(cdp, sessionId, `document.querySelector('.citadel-command-feedback')?.textContent?.trim() ?? ''`);
  let flightRemoved = true;
  try {
    await waitForSelectorAbsent(cdp, sessionId, ".citadel-build-flight-card", 5000);
  } catch {
    flightRemoved = false;
  }
  // Capture after the bubble's short entrance has settled so headless Chromium does not
  // snapshot a partially composited frame while GPU acceleration is disabled.
  await delay(350);
  return evaluate(cdp, sessionId, `
    (() => {
      const cardId = ${JSON.stringify(selectedCard)};
      const handCard = document.querySelector('[data-hand-card-id="' + cardId + '"]');
      const builtCard = document.querySelector('[data-district-card-id="' + cardId + '"]');
      const feedback = document.querySelector('.citadel-command-feedback');
      const flight = document.querySelector('.citadel-build-flight-card');
      const animation = flight?.getAnimations()[0];
      return {
        opened: true,
        flightSeen: ${JSON.stringify(flightSeen)},
        handRestored: Boolean(handCard) && Number(getComputedStyle(handCard).opacity) > 0.9,
        builtCardAbsent: !builtCard,
        feedback: ${JSON.stringify(feedbackText)},
        flightRemoved: ${JSON.stringify(flightRemoved)},
        flightStatus: flight?.dataset.buildAnimationStatus ?? null,
        animation: animation ? {
          currentTime: animation.currentTime,
          playState: animation.playState,
          playbackRate: animation.playbackRate
        } : null
      };
    })()
  `);
}

function checkRejectedBuildFlow(label, flow) {
  return checkDirectSkillFlow(label, [
    ["rejected build opens from a legal hand card", flow.opened, flow],
    ["rejected build still starts the visual-first card flight", flow.flightSeen, flow],
    ["rejected build flight is removed after returning", flow.flightRemoved, flow],
    ["rejected build returns and restores the original hand card", flow.handRestored, flow],
    ["rejected build leaves no city card", flow.builtCardAbsent, flow],
    ["rejected build shows the server reason in the match", flow.feedback?.includes("服务器拒绝"), flow]
  ]);
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

async function collectRoleTargetDockLayout(cdp, sessionId) {
  return evaluate(cdp, sessionId, `
    (() => {
      const toRect = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const panel = document.querySelector('.citadel-action-dock--skill-role-row');
      const header = panel?.querySelector('.citadel-selection-panel__header');
      const controls = panel?.querySelector('.citadel-selection-panel__controls');
      const cards = [...(panel?.querySelectorAll('.citadel-role-choice') ?? [])];
      return {
        text: panel?.innerText?.replace(/\\s+/g, ' ').trim() ?? '',
        panel: toRect(panel),
        header: toRect(header),
        controls: toRect(controls),
        cards: cards.map(toRect)
      };
    })()
  `);
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
  const targetLayout = await collectRoleTargetDockLayout(cdp, sessionId);
  const screenshot = await captureScreenshot(cdp, sessionId, screenshotName);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-selection-panel__controls .citadel-action-button--gold")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--assassin_mark", 10000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const presentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-presentation`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-action-dock--skill-roles", 10000);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-skill-presentation", 5000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock .citadel-action-button")]
      .find((button) => button.textContent.trim() === "结束")?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--assassin_skip", 10000);
  const skipPresentation = await collectSkillPresentation(cdp, sessionId);
  const skipPresentationScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-skip-presentation`);
  return {
    opened,
    optionCount,
    targetLayout,
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
  const targetLayout = await collectRoleTargetDockLayout(cdp, sessionId);
  const targetScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-targeting`);
  await evaluate(cdp, sessionId, `document.querySelector(".citadel-selection-panel__controls .citadel-action-button--gold")?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--thief_mark", 10000);
  const markPresentation = await collectSkillPresentation(cdp, sessionId);
  const markScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-mark`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-skill-presentation", 5000);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll(".citadel-action-dock .citadel-action-button")]
      .find((button) => button.textContent.trim() === "结束")?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--thief_steal", 25000);
  const stealPresentation = await collectSkillPresentation(cdp, sessionId);
  const stealScreenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-steal`);
  return { selected, targetLayout, targetScreenshot, markPresentation, markScreenshot, stealPresentation, stealScreenshot };
}

async function collectSimpleRolePresentation(cdp, sessionId, roleId, expectedKinds, screenshotName) {
  const clicked = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector('.citadel-action-button--skill:not(:disabled)');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) return { clicked: false, roleId, presentations: [], screenshots: [] };

  const presentations = [];
  const presentationScreenshots = [];
  for (const kind of expectedKinds) {
    await waitForSelector(cdp, sessionId, `.citadel-skill-presentation--${kind}`, 12000);
    const presentation = await collectSkillPresentation(cdp, sessionId);
    const notice = await evaluate(cdp, sessionId, `
      (() => {
        const root = document.querySelector('.citadel-action-notices');
        return {
          count: root?.querySelectorAll('article').length ?? 0,
          text: root?.innerText?.replace(/\s+/g, ' ').trim() ?? ''
        };
      })()
    `);
    presentations.push({ kind, presentation, notice });
    presentationScreenshots.push(await captureScreenshot(
      cdp,
      sessionId,
      `${screenshotName}-${kind}`
    ));
    await waitForSelectorAbsent(cdp, sessionId, `.citadel-skill-presentation--${kind}`, 8000);
  }
  return { clicked, roleId, presentations, screenshots: presentationScreenshots };
}

async function collectWarlordIncomePresentation(cdp, sessionId, screenshotName) {
  const clicked = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector('.citadel-action-button--skill:not(:disabled)');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) return { clicked: false, roleId: "warlord", presentations: [], screenshots: [], targetingText: "" };
  await waitForSelector(cdp, sessionId, ".citadel-action-dock--table-targeting", 10_000);
  const targetingText = await evaluate(cdp, sessionId, `document.querySelector('.citadel-action-dock--table-targeting')?.innerText ?? ''`);
  await evaluate(cdp, sessionId, `
    [...document.querySelectorAll('.citadel-action-dock--table-targeting .citadel-action-button')]
      .find((button) => button.textContent.includes('只领取收入'))?.click()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--role_income", 12_000);
  const presentation = await collectSkillPresentation(cdp, sessionId);
  const notice = await evaluate(cdp, sessionId, `
    (() => {
      const root = document.querySelector('.citadel-action-notices');
      return { count: root?.querySelectorAll('article').length ?? 0, text: root?.innerText?.replace(/\s+/g, ' ').trim() ?? '' };
    })()
  `);
  const screenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-role_income`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-skill-presentation--role_income", 8_000);
  return {
    clicked,
    roleId: "warlord",
    presentations: [{ kind: "role_income", presentation, notice }],
    screenshots: [screenshot],
    targetingText
  };
}

async function collectRoleIncomeUi(cdp, sessionId) {
  const basics = await evaluate(cdp, sessionId, `
    (() => {
      const button = document.querySelector('.citadel-action-button--skill');
      const roleCard = document.querySelector('.citadel-self-role-card [data-card-inspector="role"]');
      return {
        buttonText: button?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
        buttonTitle: button?.getAttribute('title') ?? '',
        amount: button?.dataset.roleIncomeAmount ?? null,
        detail: button?.dataset.roleIncomeDetail ?? null,
        roleAriaLabel: roleCard?.getAttribute('aria-label') ?? ''
      };
    })()
  `);
  const inspector = await collectCardInspectorHover(
    cdp,
    sessionId,
    '.citadel-self-role-card [data-card-inspector="role"]'
  );
  await closeCardInspector(cdp, sessionId);
  return { ...basics, inspectorText: inspector?.descriptionContent?.text ?? "" };
}

async function advanceRoleSelectionToHumanRole(setup, roleId) {
  let state = setup.gameState;
  const deadline = Date.now() + 60_000;
  const waitForProgress = async (previousChooser, previousCount) => {
    const progressDeadline = Date.now() + 12_000;
    while (Date.now() <= progressDeadline) {
      const next = setup.socket.__qaLatestGameState;
      if (next?.roomId === setup.created.roomCode && (
        next.phase !== "ROLE_SELECTION" ||
        next.roleSelectionTurnPlayerId !== previousChooser ||
        next.availableRoles.length !== previousCount
      )) return next;
      await delay(50);
    }
    throw new Error("Timed out waiting for role selection progression");
  };
  while (state.phase === "ROLE_SELECTION") {
    const latestState = setup.socket.__qaLatestGameState;
    if (latestState?.roomId === setup.created.roomCode) state = latestState;
    if (state.phase !== "ROLE_SELECTION") break;
    if (Date.now() > deadline) throw new Error(`Timed out selecting ${roleId} for live role QA.`);
    if (state.roleSelectionTurnPlayerId === setup.created.playerId) {
      if (!state.availableRoles.some((role) => role.id === roleId)) {
        return { available: false, state };
      }
      const previousChooser = state.roleSelectionTurnPlayerId;
      const previousCount = state.availableRoles.length;
      setup.socket.emit("select_role", {
        roomCode: setup.created.roomCode,
        playerId: setup.created.playerId,
        roleId
      });
      state = await waitForProgress(previousChooser, previousCount);
      continue;
    }
    const previousChooser = state.roleSelectionTurnPlayerId;
    const previousCount = state.availableRoles.length;
    state = await waitForProgress(previousChooser, previousCount);
  }
  return { available: true, state };
}

async function setupQueenPresentationFlow(cdp, sessionId, viewport, setups, screenshotName) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const setup = await setupGame(8, { stopAtRoleSelection: true, fastOpeningForQa: true });
    setups.push(setup);
    await configureQaGame(setup, { forceSelfRoleSelectionTurn: true });
    await delay(80);
    const selection = await advanceRoleSelectionToHumanRole(setup, "queen");
    if (!selection.available) {
      setup.socket.disconnect();
      continue;
    }

    setup.gameState = selection.state;
    await configureQaGame(setup, { ensureSelectedRoleId: "king" });
    await delay(80);
    for (let step = 0; step < 64; step += 1) {
      const state = setup.socket.__qaLatestGameState ?? setup.gameState;
      if (
        state?.phase === "ROLE_CALL" &&
        state.roleCallState?.roleId === "queen" &&
        state.roleCallState.stage === "revealing"
      ) {
        setup.gameState = state;
        break;
      }
      if (!state || !["ROLE_CALL", "ROLE_ACTION"].includes(state.phase)) break;
      await advanceQaTimedPhase(setup);
      await delay(60);
    }
    if (
      setup.gameState?.phase !== "ROLE_CALL" ||
      setup.gameState.roleCallState?.roleId !== "queen" ||
      setup.gameState.roleCallState.stage !== "revealing"
    ) {
      throw new Error(`Queen QA did not reach the revealing stage: ${JSON.stringify({
        phase: setup.gameState?.phase,
        roleCallState: setup.gameState?.roleCallState
      })}`);
    }
    await configureQaGame(setup, { deadlineMs: 3_000 });
    await preparePage(cdp, sessionId, setup.created, viewport, { waitForActionDock: false });
    try {
      await waitForSelector(cdp, sessionId, ".citadel-skill-presentation--queen_income", 8_000);
    } catch (error) {
      throw new Error(`${error.message}\nQueen QA diagnostics: ${JSON.stringify({
        phase: setup.socket.__qaLatestGameState?.phase,
        roleCallState: setup.socket.__qaLatestGameState?.roleCallState,
        currentTurnPlayerId: setup.socket.__qaLatestGameState?.currentTurnPlayerId,
        actionEvents: setup.socket.__qaActionEvents?.map((event) => ({
          phase: event.phase,
          kind: event.presentation?.kind,
          actorPlayerId: event.presentation?.actorPlayerId,
          targetPlayerId: event.presentation?.targetPlayerId
        }))
      })}`);
    }
    const presentation = await collectSkillPresentation(cdp, sessionId);
    const screenshot = await captureScreenshot(cdp, sessionId, `${screenshotName}-queen_income`);
    return { selected: true, presentation, screenshot, attempt };
  }
  return { selected: false, presentation: null, screenshot: null, attempt: 12 };
}

async function setupForcedRoleGame(roleId, setups) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const setup = await setupGame(8, { stopAtRoleSelection: true, fastOpeningForQa: true });
    setups.push(setup);
    await configureQaGame(setup, { forceSelfRoleSelectionTurn: true });
    await delay(80);
    const selection = await advanceRoleSelectionToHumanRole(setup, roleId);
    if (!selection.available) {
      setup.socket.disconnect();
      continue;
    }

    const actionDeadline = Date.now() + 60_000;
    let state = selection.state;
    setup.gameState = state;
    while (Date.now() <= actionDeadline) {
      const latest = setup.socket.__qaLatestGameState;
      if (latest?.roomId === setup.created.roomCode) state = latest;
      if (state.phase === "ROLE_ACTION" && state.currentTurnPlayerId === setup.created.playerId) {
        setup.gameState = state;
        return setup;
      }
      if (["ROLE_CALL", "ROLE_ACTION"].includes(state.phase)) {
        setup.gameState = state;
        state = await advanceQaTimedPhase(setup);
      } else {
        await delay(60);
      }
    }
    throw new Error(`Timed out waiting for the forced ${roleId} action turn.`);
  }
  throw new Error(`Could not expose ${roleId} in the eight-player role pool.`);
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
      const animatedElements = [overlay, ...overlay.querySelectorAll('*')];
      return {
        className: overlay.className,
        text: overlay.textContent?.replace(/\\s+/g, " ").trim() ?? "",
        amount: Number(overlay.dataset.presentationAmount || 0),
        actorPlayerId: overlay.dataset.actorPlayerId ?? "",
        targetPlayerId: overlay.dataset.targetPlayerId ?? "",
        position: style.position,
        pointerEvents: style.pointerEvents,
        animations: animatedElements.map((element) => getComputedStyle(element).animationName)
          .filter((name) => name && name !== 'none'),
        animationDurationsMs: animatedElements.flatMap((element) =>
          getComputedStyle(element).animationDuration.split(',').map((value) => {
            const duration = Number.parseFloat(value);
            return value.trim().endsWith('ms') ? duration : duration * 1000;
          })
        ).filter(Number.isFinite),
        specialArt: [...overlay.querySelectorAll(
          '.citadel-skill-income-burst, .citadel-skill-blueprint, .citadel-skill-bishop-shield, .citadel-skill-queen-bond'
        )].map((element) => element.className),
        routeCount: overlay.querySelectorAll('.citadel-skill-presentation__route').length,
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
    flow.role.card?.height > flow.role.target?.height * 1.2
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
    Math.abs(flow.publicDistrict.card.height - flow.hand.target.height) <= 8
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
    Math.abs(flow.rightEdge.card.height - flow.hand.target.height) <= 8
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

async function collectNicknameLayout(cdp, sessionId, forceShortNames = false) {
  await evaluate(cdp, sessionId, `
    (() => {
      for (const element of document.querySelectorAll('[data-full-player-name]')) {
        if (${JSON.stringify(forceShortNames)}) {
          element.dataset.qaOriginalName = element.textContent ?? '';
          element.textContent = '阿青';
        } else if (element.dataset.qaOriginalName !== undefined) {
          element.textContent = element.dataset.qaOriginalName;
          delete element.dataset.qaOriginalName;
        }
      }
    })()
  `);
  await delay(180);
  return evaluate(cdp, sessionId, `
    (() => {
      const rect = (element) => {
        if (!element) return null;
        const value = element.getBoundingClientRect();
        return {
          left: value.left, top: value.top, right: value.right, bottom: value.bottom,
          width: value.width, height: value.height
        };
      };
      const measurementCanvas = document.createElement('canvas');
      const measurementContext = measurementCanvas.getContext('2d');
      const cards = [...document.querySelectorAll('.citadel-player-mini')].map((card) => {
        const name = card.querySelector('[data-full-player-name]');
        const copy = card.querySelector('.citadel-player-mini__copy');
        const status = card.querySelector('.citadel-player-mini__copy small');
        const resources = card.querySelector('.citadel-player-mini__resources');
        const nameStyle = name ? getComputedStyle(name) : null;
        let ellipsisPrefixCapacity = 0;
        let minimumFontSize = 0;
        let tenCjkWidthAtMinimum = 0;
        if (name && nameStyle && measurementContext) {
          minimumFontSize = Number.parseFloat(nameStyle.getPropertyValue('--citadel-player-name-min-size')) || 0;
          measurementContext.font = [nameStyle.fontStyle, nameStyle.fontWeight, nameStyle.fontSize, nameStyle.fontFamily].join(' ');
          const characters = Array.from(name.getAttribute('data-full-player-name') ?? '');
          for (let index = 1; index <= characters.length; index += 1) {
            if (measurementContext.measureText(characters.slice(0, index).join('') + '…').width <= name.getBoundingClientRect().width + 0.2) {
              ellipsisPrefixCapacity = index;
            } else {
              break;
            }
          }
          measurementContext.font = [
            nameStyle.fontStyle,
            nameStyle.fontWeight,
            minimumFontSize + 'px',
            nameStyle.fontFamily
          ].join(' ');
          tenCjkWidthAtMinimum = measurementContext.measureText('一二三四五六七八九十…').width;
        }
        return {
          playerId: card.getAttribute('data-player-id'),
          card: rect(card),
          clientWidth: card.clientWidth,
          scrollWidth: card.scrollWidth,
          avatar: rect(card.querySelector('.citadel-player-mini__avatar-wrap')),
          copy: rect(copy),
          name: rect(name),
          status: rect(status),
          resources: rect(resources),
          resourceItems: [...(resources?.children ?? [])].map(rect),
          fullName: name?.getAttribute('data-full-player-name') ?? '',
          text: name?.textContent?.trim() ?? '',
          title: name?.getAttribute('title') ?? '',
          ariaLabel: name?.getAttribute('aria-label') ?? '',
          fit: name?.getAttribute('data-name-fit') ?? '',
          fontSize: Number.parseFloat(name ? getComputedStyle(name).fontSize : '0'),
          ellipsisPrefixCapacity,
          minimumFontSize,
          tenCjkWidthAtMinimum,
          statusText: status?.textContent?.trim() ?? '',
          isSelf: card.classList.contains('citadel-player-mini--self'),
          seatPosition: card.closest('.citadel-opponent-seat')?.getAttribute('data-seat-position') ?? 'self',
          isCurrent: card.classList.contains('is-current'),
          hasCrown: Boolean(card.querySelector('.citadel-player-mini__crown'))
        };
      });
      const scores = [...document.querySelectorAll('.citadel-live-score-strip li span')].map((name) => ({
        text: name.textContent?.trim() ?? '',
        title: name.getAttribute('title') ?? '',
        ariaLabel: name.getAttribute('aria-label') ?? ''
      }));
      return {
        compact: document.querySelector('.citadel-game-shell')?.getAttribute('data-compact-layout') === 'true',
        cards,
        scores
      };
    })()
  `);
}

function checkNicknameLayout(label, baseline, actual, expectedNames) {
  const checks = [];
  const add = (name, pass, details) => checks.push({ name, pass: Boolean(pass), details });
  const tolerance = 0.8;
  const stableRect = (first, second) => first && second &&
    ['left', 'top', 'width', 'height'].every((key) => Math.abs(first[key] - second[key]) <= tolerance);
  const containedBy = (outer, inner) => outer && inner &&
    inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance &&
    inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
  const cardsById = new Map(actual.cards.map((card) => [card.playerId, card]));
  const baselineById = new Map(baseline.cards.map((card) => [card.playerId, card]));
  const expectedSet = new Set(expectedNames);
  const eightPlayerTopPositions = new Set(["top-left", "top-center", "top-right"]);

  add("all fixture names reach the player cards", actual.cards.length === expectedNames.length &&
    actual.cards.every((card) => expectedSet.has(card.fullName)), actual.cards);
  add("full title and accessible name are preserved", actual.cards.every((card) =>
    card.fullName && card.title === card.fullName && card.ariaLabel === card.fullName), actual.cards);
  add("visible names are never empty or only an ellipsis", actual.cards.every((card) =>
    card.text && !/^…+$/.test(card.text) && (card.name?.width ?? 0) >= 31), actual.cards);
  add("short names retain the default size and full fit", actual.cards
    .filter((card) => card.fullName === "阿青")
    .every((card) => card.fit === "full" && Math.abs(card.fontSize - baselineById.get(card.playerId)?.fontSize) <= 0.2), actual.cards);
  add("long-name fitting respects the viewport minimum", actual.cards.every((card) =>
    card.minimumFontSize > 0 && card.fontSize + 0.05 >= card.minimumFontSize), actual.cards);
  if (expectedNames.length === 8) {
    const topCards = actual.cards.filter((card) => eightPlayerTopPositions.has(card.seatPosition));
    add("all eight-player cards reserve their ten-character nickname width", actual.cards.every((card) => {
      const minimumNameWidth = card.isSelf ? 66 : actual.compact ? 70 : 72;
      return (card.name?.width ?? 0) + tolerance >= minimumNameWidth;
    }), actual.cards);
    add("all eight-player cards fit ten CJK characters at their minimum font", actual.cards.every((card) =>
      (card.name?.width ?? 0) + tolerance >= card.tenCjkWidthAtMinimum), actual.cards);
    const longChineseTopCard = topCards.find((card) => card.fullName === "一二三四五六七八九十甲乙丙丁戊己");
    add("eight-player top long Chinese name visibly fits at least ten characters before ellipsis",
      Boolean(longChineseTopCard && longChineseTopCard.ellipsisPrefixCapacity >= 10), longChineseTopCard);
  }
  add("nickname content does not move or resize cards, avatars, or resources", actual.cards.every((card) => {
    const before = baselineById.get(card.playerId);
    return before && stableRect(before.card, card.card) && stableRect(before.avatar, card.avatar) &&
      stableRect(before.resources, card.resources);
  }), { baseline: baseline.cards, actual: actual.cards });
  add("avatar, name/status, and resources remain three non-overlapping columns", actual.cards.every((card) =>
    card.avatar && card.copy && card.resources &&
    card.avatar.right <= card.copy.left + tolerance && card.copy.right <= card.resources.left + tolerance &&
    card.status && card.name && card.status.top >= card.name.bottom - 2), actual.cards);
  add("every player-card child stays fully inside the card border", actual.cards.every((card) =>
    card.scrollWidth <= card.clientWidth + 1 &&
    containedBy(card.card, card.avatar) && containedBy(card.card, card.copy) &&
    containedBy(card.card, card.name) && containedBy(card.card, card.status) &&
    containedBy(card.card, card.resources) &&
    card.resourceItems.every((item) => containedBy(card.card, item))), actual.cards);
  add("the three resources stay on one horizontal row", actual.cards.every((card) =>
    card.resourceItems.length === 3 && card.resourceItems.every((item, index, items) =>
      index === 0 || (item.left >= items[index - 1].right - tolerance && Math.abs(item.top - items[0].top) <= 2)
    )), actual.cards);
  add("online, offline, bot, current-turn, and crown states remain represented", Boolean(
    actual.cards.some((card) => card.statusText.includes("在线")) &&
    actual.cards.some((card) => card.statusText.includes("离线")) &&
    actual.cards.some((card) => card.statusText.includes("人机")) &&
    actual.cards.some((card) => card.isCurrent) && actual.cards.some((card) => card.hasCrown)
  ), actual.cards);
  add("score strip keeps full tooltip and accessibility text", actual.scores.length === expectedNames.length &&
    actual.scores.every((score) => expectedSet.has(score.title) && score.ariaLabel === score.title), actual.scores);

  const failures = checks.filter((check) => !check.pass);
  return { label, pass: failures.length === 0, failures, checks };
}

async function collectReactionState(cdp, sessionId, selfPlayerId, guestPlayerId) {
  return evaluate(cdp, sessionId, `
    (() => {
      const rect = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
      };
      const bubble = (playerId) => {
        const element = document.querySelector('[data-reaction-player-id="' + CSS.escape(playerId) + '"]');
        const style = element ? getComputedStyle(element) : null;
        return element ? {
          rect: rect(element),
          text: element.textContent?.trim() ?? '',
          type: element.getAttribute('data-reaction-type'),
          pointerEvents: style?.pointerEvents,
          animationName: style?.animationName
        } : null;
      };
      const selfTrigger = document.querySelector('.citadel-player-mini--self');
      const guestTrigger = document.querySelector('.citadel-player-mini[data-player-id="' + CSS.escape(${JSON.stringify(guestPlayerId)}) + '"]');
      const picker = document.querySelector('.citadel-reaction-picker');
      const chatDock = document.querySelector('.citadel-corner-dock--chat');
      const layer = document.querySelector('.citadel-reaction-layer');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        selfTrigger: rect(selfTrigger),
        selfTriggerId: selfTrigger?.getAttribute('data-player-id') ?? null,
        selfExpanded: selfTrigger?.getAttribute('aria-expanded') ?? null,
        selfLabel: selfTrigger?.getAttribute('aria-label') ?? '',
        guestTrigger: rect(guestTrigger),
        picker: rect(picker),
        pickerLabels: [...document.querySelectorAll('[data-reaction-option]')].map((button) => button.textContent?.trim()),
        pickerInsideChat: Boolean(document.querySelector('.citadel-pop-dock--chat [data-reaction-option]')),
        chatDockText: chatDock?.innerText ?? '',
        hasUnreadBadge: Boolean(document.querySelector('[class*="unread"], [data-chat-unread]')),
        selfBubble: bubble(${JSON.stringify(selfPlayerId)}),
        guestBubble: bubble(${JSON.stringify(guestPlayerId)}),
        reactionBubbleCount: document.querySelectorAll('.citadel-reaction-bubble').length,
        layerPointerEvents: layer ? getComputedStyle(layer).pointerEvents : null,
        layerZIndex: layer ? Number(getComputedStyle(layer).zIndex) : null,
        activeIsSelfTrigger: document.activeElement === selfTrigger
      };
    })()
  `);
}

async function dispatchClick(cdp, sessionId, selector) {
  const point = await evaluate(cdp, sessionId, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()
  `);
  if (!point) fail(`Could not click missing selector: ${selector}`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none" }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
}

async function collectReactionFlow(cdp, sessionId, setup, viewport, label, reducedMotion) {
  await preparePage(cdp, sessionId, setup.created, viewport);
  await waitForSelector(cdp, sessionId, ".citadel-player-mini--self", 5000);
  const initial = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);

  await evaluate(cdp, sessionId, `document.querySelector('.citadel-player-mini--self')?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-reaction-picker", 3000);
  const opened = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);
  const pickerScreenshot = await captureScreenshot(cdp, sessionId, `${label}-reaction-picker`);

  await evaluate(cdp, sessionId, `document.querySelector('.citadel-player-mini--self')?.click()`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-reaction-picker", 3000);
  const toggledClosed = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);

  await evaluate(cdp, sessionId, `
    (() => {
      const trigger = document.querySelector('.citadel-player-mini--self');
      trigger?.focus();
      trigger?.click();
    })()
  `);
  await waitForSelector(cdp, sessionId, ".citadel-reaction-picker", 3000);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
  }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27
  }, sessionId);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-reaction-picker", 3000);
  await delay(40);
  const escapeClosed = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);

  await evaluate(cdp, sessionId, `document.querySelector('.citadel-player-mini--self')?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-reaction-picker", 3000);
  await dispatchClick(cdp, sessionId, ".citadel-corner-dock--chat");
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-reaction-picker", 3000);
  await waitForSelector(cdp, sessionId, ".citadel-pop-dock--chat", 3000);
  const outsideClosed = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);
  const chatReceivedClick = await evaluate(cdp, sessionId, `Boolean(document.querySelector('.citadel-pop-dock--chat'))`);
  await evaluate(cdp, sessionId, `document.querySelector('.citadel-corner-dock--chat')?.click()`);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-pop-dock--chat", 3000);

  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]
  }, sessionId);
  await evaluate(cdp, sessionId, `document.querySelector('.citadel-player-mini--self')?.click()`);
  await waitForSelector(cdp, sessionId, ".citadel-reaction-picker", 3000);
  await evaluate(cdp, sessionId, `document.querySelector('[data-reaction-option="nice"]')?.click()`);
  await waitForSelector(cdp, sessionId, `[data-reaction-player-id="${setup.created.playerId}"]`, 3000);
  setup.guest.emit("send_reaction", { roomCode: setup.created.roomCode, reaction: "danger" });
  await waitForSelector(cdp, sessionId, `[data-reaction-player-id="${setup.guestSession.playerId}"]`, 3000);
  // Capture after the bubble's short entrance has settled so headless Chromium does not
  // snapshot a partially composited frame while GPU acceleration is disabled.
  await delay(350);
  const bubbles = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);
  const bubbleScreenshot = await captureScreenshot(cdp, sessionId, `${label}-reaction-bubbles${reducedMotion ? "-reduced" : ""}`);

  setup.guest.emit("send_reaction", { roomCode: setup.created.roomCode, reaction: "upset" });
  await waitForSelector(cdp, sessionId, `[data-reaction-player-id="${setup.guestSession.playerId}"][data-reaction-type="upset"]`, 3000);
  const replaced = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);
  await waitForSelectorAbsent(cdp, sessionId, ".citadel-reaction-bubble", 3000);
  const expired = await collectReactionState(cdp, sessionId, setup.created.playerId, setup.guestSession.playerId);

  await cdp.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
  }, sessionId);

  return {
    initial,
    opened,
    toggledClosed,
    escapeClosed,
    outsideClosed,
    chatReceivedClick,
    bubbles,
    replaced,
    expired,
    reducedMotion,
    screenshots: [pickerScreenshot, bubbleScreenshot]
  };
}

function checkReactionFlow(label, flow) {
  const checks = [];
  const add = (name, pass, details) => checks.push({ name, pass: Boolean(pass), details });
  const insideViewport = (rect, viewport, margin = 0) => rect &&
    rect.left >= margin && rect.top >= margin &&
    rect.right <= viewport.width - margin && rect.bottom <= viewport.height - margin;
  const anchoredAbove = (bubble, trigger) => bubble?.rect && trigger &&
    bubble.rect.bottom <= trigger.top - 3 &&
    Math.abs((bubble.rect.left + bubble.rect.right) / 2 - (trigger.left + trigger.right) / 2) <= 56;

  add("reconnect starts without replaying old reactions", flow.initial.reactionBubbleCount === 0, flow.initial);
  add("self nameplate opens the approved four-button picker", Boolean(
    flow.opened.picker &&
    flow.opened.selfExpanded === "true" &&
    JSON.stringify(flow.opened.pickerLabels) === JSON.stringify(["👏 漂亮", "😤 可恶", "⚠️ 危险", "😮 好险"])
  ), flow.opened);
  add("reaction picker is anchored above the self nameplate inside the viewport", Boolean(
    insideViewport(flow.opened.picker, flow.opened.viewport, 4) &&
    flow.opened.picker.bottom <= flow.opened.selfTrigger.top - 4
  ), flow.opened);
  add("second self-nameplate click closes the picker", !flow.toggledClosed.picker && flow.toggledClosed.selfExpanded === "false", flow.toggledClosed);
  add("Escape closes the picker and restores self-nameplate focus", !flow.escapeClosed.picker && flow.escapeClosed.activeIsSelfTrigger, flow.escapeClosed);
  add("outside click closes the picker without swallowing the target click", !flow.outsideClosed.picker && flow.chatReceivedClick, flow.outsideClosed);
  add("chat remains pure chat without reactions or unread badges", Boolean(
    !flow.opened.pickerInsideChat && !flow.opened.hasUnreadBadge && !/\d/.test(flow.opened.chatDockText)
  ), flow.opened);
  add("self and guest reactions can render concurrently", Boolean(
    flow.bubbles.reactionBubbleCount === 2 &&
    flow.bubbles.selfBubble?.text === "👏 漂亮" &&
    flow.bubbles.guestBubble?.text === "⚠️ 危险"
  ), flow.bubbles);
  add("sending closes the picker and restores self-nameplate focus", Boolean(
    !flow.bubbles.picker && flow.bubbles.activeIsSelfTrigger
  ), flow.bubbles);
  add("reaction bubbles stay anchored above both player nameplates", Boolean(
    anchoredAbove(flow.bubbles.selfBubble, flow.bubbles.selfTrigger) &&
    anchoredAbove(flow.bubbles.guestBubble, flow.bubbles.guestTrigger) &&
    insideViewport(flow.bubbles.selfBubble.rect, flow.bubbles.viewport, 3) &&
    insideViewport(flow.bubbles.guestBubble.rect, flow.bubbles.viewport, 3)
  ), flow.bubbles);
  add("reaction layer is click-through and below key skill presentations", Boolean(
    flow.bubbles.layerPointerEvents === "none" && flow.bubbles.layerZIndex < 44
  ), flow.bubbles);
  add("same-player reaction replaces instead of stacking", Boolean(
    flow.replaced.guestBubble?.type === "upset" &&
    flow.replaced.guestBubble?.text === "😤 可恶" &&
    flow.replaced.reactionBubbleCount <= 2
  ), flow.replaced);
  add("reaction bubbles expire after the presentation window", flow.expired.reactionBubbleCount === 0, flow.expired);
  if (flow.reducedMotion) {
    add("reduced-motion mode removes bubble animation", Boolean(
      flow.bubbles.selfBubble?.animationName === "none" && flow.bubbles.guestBubble?.animationName === "none"
    ), flow.bubbles);
  }

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
  let rejectedBuildSetup = null;
  let denseSetup = null;
  let targetingSetup = null;
  let assassinTargetingSetup = null;
  let magicianDiscardSetup = null;
  let magicianPlayerSetup = null;
  let thiefSetup = null;
  let inspectorSetup = null;
  let utilityMenuSetup = null;
  let uiTuningSetup = null;
  let uiTuningCrossSetup = null;
  let uiTuningCompactSetup = null;
  let actionFeedbackSetup = null;
  let roleTimeoutSetup = null;
  let roleCallSetup = null;
  const extremeSetups = [];
  const opponentSetups = [];
  const openingSetups = [];
  const scoringSetups = [];
  const roleEffectSetups = [];
  const opponentBuildSetups = [];
  const resourceDeltaSetups = [];
  const nicknameSetups = [];
  const reactionSetups = [];
  const resultSetups = [];
  const browser = await createBrowserPage();
  const results = [];
  const screenshots = [];

  try {
    if (qaMode === "opening" || qaMode === "full") {
      for (const viewport of viewports) {
        for (const playerCount of [4, 8]) {
          const openingSetup = await setupGame(playerCount, { stopAtCrownReveal: true });
          openingSetups.push(openingSetup);
          const label = `${viewport.width}x${viewport.height}-${playerCount}p`;
          const openingPreparation = await preparePage(
            browser.cdp,
            browser.sessionId,
            openingSetup.created,
            viewport,
            {
              skipObjectiveIntro: false,
              collectOpeningSequence: true,
              objectiveScreenshotName: `${label}-opening-objective`,
              rouletteScreenshotName: `${label}-opening-crown-roulette`,
              settleScreenshotName: `${label}-opening-crown-settle`
            }
          );
          if (openingPreparation.objectiveScreenshot) screenshots.push(openingPreparation.objectiveScreenshot);
          if (openingPreparation.openingSequence?.rouletteScreenshot) {
            screenshots.push(openingPreparation.openingSequence.rouletteScreenshot);
          }
          if (openingPreparation.openingSequence?.settleScreenshot) {
            screenshots.push(openingPreparation.openingSequence.settleScreenshot);
          }
          results.push(checkObjectiveIntro(
            `${label} opening-objective`,
            openingPreparation.objectiveIntro,
            openingSetup.gameState.settings.endCitySize
          ));
          results.push(checkOpeningSequence(`${label} opening-sequence`, openingPreparation, openingSetup.gameState));
          results.push(checkRoomCardLayout(`${label} opening-room-card`, openingPreparation.roomCardLayout));
        }
      }
      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "reduce" }]
      }, browser.sessionId);
      const reducedViewport = viewports.at(-1) ?? viewports[0];
      const reducedLabel = `${reducedViewport.width}x${reducedViewport.height}`;
      const reducedOpeningSetup = await setupGame(4, { stopAtCrownReveal: true });
      openingSetups.push(reducedOpeningSetup);
      const reducedPreparation = await preparePage(
        browser.cdp,
        browser.sessionId,
        reducedOpeningSetup.created,
        reducedViewport,
        {
          skipObjectiveIntro: false,
          collectOpeningSequence: true,
          objectiveScreenshotName: `${reducedLabel}-opening-reduced-objective`,
          rouletteScreenshotName: `${reducedLabel}-opening-reduced-roulette`,
          settleScreenshotName: `${reducedLabel}-opening-reduced-settle`
        }
      );
      if (reducedPreparation.objectiveScreenshot) screenshots.push(reducedPreparation.objectiveScreenshot);
      if (reducedPreparation.openingSequence?.rouletteScreenshot) screenshots.push(reducedPreparation.openingSequence.rouletteScreenshot);
      if (reducedPreparation.openingSequence?.settleScreenshot) screenshots.push(reducedPreparation.openingSequence.settleScreenshot);
      results.push(checkReducedOpeningSequence(
        `${reducedLabel} opening-reduced-motion`,
        reducedPreparation,
        reducedOpeningSetup.gameState
      ));
      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
      }, browser.sessionId);
    }

    if (qaMode === "role-call") {
      roleCallSetup = await setupGame(4, {
        fastOpeningForQa: true,
        stopAtRoleSelection: true
      });
      await reachRoleCall(roleCallSetup);
      const selfRoleId = roleCallSetup.gameState.players.find(
        (player) => player.id === roleCallSetup.created.playerId
      )?.selectedRoleId;
      if (!selfRoleId) {
        fail("Role-call QA player has no selected role.");
      }

      const captureStage = async (stage, suffix) => {
        for (const [viewportIndex, viewport] of viewports.entries()) {
          const reducedMotion = stage === "revealing" && viewportIndex === viewports.length - 1;
          await freezeQaTimer(roleCallSetup);
          await browser.cdp.send("Emulation.setEmulatedMedia", {
            media: "screen",
            features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]
          }, browser.sessionId);
          const label = `${viewport.width}x${viewport.height}`;
          await preparePage(browser.cdp, browser.sessionId, roleCallSetup.created, viewport, {
            waitForActionDock: false
          });
          await delay(120);
          const state = await collectRoleCallPresentation(browser.cdp, browser.sessionId);
          screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-role-call-${suffix}`));
          results.push(checkRoleCallPresentation(
            `${label} role-call-${suffix}${reducedMotion ? "-reduced" : ""}`,
            state,
            stage,
            { reducedMotion }
          ));
          if (stage === "calling") {
            results.push(checkRoomCardLayout(
              `${label} role-call-room-card`,
              await collectRoomCardLayout(browser.cdp, browser.sessionId)
            ));
          }

          if (stage === "revealing" && viewportIndex === 0) {
            const roleIdBeforeReconnect = state.roleCall?.roleId;
            await freezeQaTimer(roleCallSetup);
            await preparePage(browser.cdp, browser.sessionId, roleCallSetup.created, viewport, {
              extraQuery: `role-call-reconnect=${Date.now()}`,
              waitForActionDock: false
            });
            const reconnected = await collectRoleCallPresentation(browser.cdp, browser.sessionId);
            const reconnectCheck = checkRoleCallPresentation(
              `${label} role-call-reconnect`,
              reconnected,
              "revealing"
            );
            reconnectCheck.checks.push({
              name: "reconnect resumes the same revealed role",
              pass: reconnected.roleCall?.roleId === roleIdBeforeReconnect,
              details: { roleIdBeforeReconnect, reconnectedRoleId: reconnected.roleCall?.roleId }
            });
            reconnectCheck.failures = reconnectCheck.checks.filter((check) => !check.pass);
            reconnectCheck.pass = reconnectCheck.failures.length === 0;
            results.push(reconnectCheck);
          }
        }
        await browser.cdp.send("Emulation.setEmulatedMedia", {
          media: "screen",
          features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
        }, browser.sessionId);
        await reclaimQaSocket(roleCallSetup);
      };

      await captureStage("calling", "calling");
      await configureQaGame(roleCallSetup, { forceSelfRoleCallReveal: true });
      await delay(50);
      roleCallSetup.gameState = roleCallSetup.socket.__qaLatestGameState ?? roleCallSetup.gameState;
      if (
        roleCallSetup.gameState.phase !== "ROLE_CALL" ||
        roleCallSetup.gameState.roleCallState?.roleId !== selfRoleId ||
        roleCallSetup.gameState.roleCallState.stage !== "revealing"
      ) {
        fail(`Role-call QA did not create the human reveal stage: ${JSON.stringify({
          selfRoleId,
          phase: roleCallSetup.gameState.phase,
          call: roleCallSetup.gameState.roleCallState
        })}`);
      }
      await captureStage("revealing", "revealing");

      const actionState = await advanceQaRoleCall(roleCallSetup);
      if (
        actionState.phase !== "ROLE_ACTION" ||
        actionState.currentTurnPlayerId !== roleCallSetup.created.playerId
      ) {
        fail("Human action did not begin after the reveal.");
      }
      for (const viewport of viewports) {
        await freezeQaTimer(roleCallSetup);
        const label = `${viewport.width}x${viewport.height}`;
        await preparePage(browser.cdp, browser.sessionId, roleCallSetup.created, viewport);
        const activeState = await collectRoleCallPresentation(browser.cdp, browser.sessionId);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-role-call-active`));
        results.push(checkActiveRoleStatus(`${label} role-call-active`, activeState, selfRoleId));
      }

      roleCallSetup.socket.disconnect();
      roleCallSetup = await setupGame(4, {
        fastOpeningForQa: true,
        stopAtRoleSelection: true
      });
      await reachRoleCall(roleCallSetup);
      await configureQaGame(roleCallSetup, { forceUnansweredRoleCall: true });
      await delay(50);
      roleCallSetup.gameState = roleCallSetup.socket.__qaLatestGameState ?? roleCallSetup.gameState;
      await captureStage("unanswered", "unanswered");
    }

    if (qaMode === "scoring" || qaMode === "ui-tuning-stress" || qaMode === "full") {
      const stressTuningConfig = qaMode === "ui-tuning-stress" ? {
        selfCardWidth: 104,
        handOverlap: 0,
        handMaxWidth: 820,
        playerPlateWidth: 320,
        opponentPlayerPlateWidth: 320,
        opponentRoleWidth: 72,
        opponentHandWidth: 58,
        opponentDistrictWidth: 72,
        actionDockWidth: 320,
        activeRoleCardWidth: 112,
        scoreStripScale: 1.25,
        cornerDockLength: 116,
        centerTop: 35,
        cityTop: 45,
        actionTop: 62
      } : null;
      for (const playerCount of opponentPlayerCounts) {
        const scoringSetup = await setupGame(playerCount, {
          actionDeadlineMs: 90_000,
          fastOpeningForQa: true
        });
        scoringSetups.push(scoringSetup);
        await configureQaGame(scoringSetup, { scoreScenario: true, deadlineMs: 60_000 });
        await delay(80);
        scoringSetup.gameState = scoringSetup.socket.__qaLatestGameState ?? scoringSetup.gameState;

        for (const viewport of viewports) {
          await freezeQaTimer(scoringSetup);
          const label = `${viewport.width}x${viewport.height}-${playerCount}p${stressTuningConfig ? '-tuning-stress' : ''}`;
          await preparePage(browser.cdp, browser.sessionId, scoringSetup.created, viewport, {
            uiTuningConfig: stressTuningConfig
          });
          const tableLayout = await collectLayout(browser.cdp, browser.sessionId);
          results.push(checkLayout(`${label} action-table`, tableLayout, {
            expectedOpponentCount: playerCount - 1,
            expectedDenseCount: playerCount >= 7 ? 4 : 0,
            allowTunedSelfCardScale: Boolean(stressTuningConfig)
          }));
          if (stressTuningConfig && playerCount === 8 && [768, 1262, 1365, 1893].includes(viewport.width)) {
            screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-action-table`));
          }
          results.push(checkRoomCardLayout(
            `${label} action-room-card`,
            await collectRoomCardLayout(browser.cdp, browser.sessionId)
          ));
          const flow = await collectScoringOverviewFlow(
            browser.cdp,
            browser.sessionId,
            `${label}-scoring-overview`
          );
          if (flow.screenshot) screenshots.push(flow.screenshot);
          results.push(checkScoringOverview(`${label} scoring-overview`, flow, scoringSetup.gameState));
        }
      }
    }

    if (qaMode === "roles" && roleSetup) {
      for (const roleViewport of viewports) {
        const roleLabel = `${roleViewport.width}x${roleViewport.height}`;
        await preparePage(browser.cdp, browser.sessionId, roleSetup.created, roleViewport);
        results.push(checkRoomCardLayout(
          `${roleLabel} role-selection-room-card`,
          await collectRoomCardLayout(browser.cdp, browser.sessionId)
        ));
        await seedFullRoleChoices(browser.cdp, browser.sessionId, 3);
        const compactRoleLayout = await collectLayout(browser.cdp, browser.sessionId);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${roleLabel}-role-selection-3`));
        results.push(checkRoleSelectionLayout(`${roleLabel} role-selection-3`, compactRoleLayout, 3));

        await seedFullRoleChoices(browser.cdp, browser.sessionId, 8);
        const roleLayout = await collectLayout(browser.cdp, browser.sessionId);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${roleLabel}-role-selection`));
        results.push(checkRoleSelectionLayout(`${roleLabel} role-selection`, roleLayout, 8));
        results.push(checkRoleSelectionAdaptation(`${roleLabel} role-selection-adaptive-width`, compactRoleLayout, roleLayout));

        const roleViewportState = await collectRoleSelectionViewportState(browser.cdp, browser.sessionId);
        const roleInspector = await collectCardInspectorHover(
          browser.cdp,
          browser.sessionId,
          ".citadel-role-selection-dock__card:last-child"
        );
        if (roleInspector) {
          screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${roleLabel}-role-selection-inspector`));
        }
        const roleInspectorClosed = await closeCardInspector(browser.cdp, browser.sessionId);
        results.push(checkRoleSelectionInspector(
          `${roleLabel} role-selection-inspector`,
          roleInspector,
          roleViewportState,
          roleInspectorClosed
        ));
      }

      const menuReachability = await evaluate(browser.cdp, browser.sessionId, `
        (() => {
          const roleDock = document.querySelector('.citadel-role-selection-dock');
          const overlay = document.querySelector('.citadel-selection-layer');
          const exitButton = [...document.querySelectorAll('.utility-menu-button')]
            .find((button) => button.getAttribute('aria-label') === '退出房间');
          const rect = exitButton?.getBoundingClientRect();
          const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
          return {
            roleDockVisible: Boolean(roleDock),
            overlayAbsent: !overlay,
            exitReachable: Boolean(exitButton && hit && (hit === exitButton || exitButton.contains(hit)))
          };
        })()
      `);
      roleTimeoutSetup = await setupGame(4, { stopAtRoleSelection: true });
      const configuredStatePromise = waitFor(
        roleTimeoutSetup.socket,
        "game_state",
        (state) => state.roomId === roleTimeoutSetup.created.roomCode &&
          state.phase === "ROLE_SELECTION" &&
          state.roleSelectionTurnPlayerId === roleTimeoutSetup.created.playerId &&
          state.turnTimer?.timeoutMs === 1200,
        10000,
        "configured role selection deadline"
      );
      await configureQaGame(roleTimeoutSetup, {
        forceSelfRoleSelectionTurn: true,
        deadlineMs: 1200
      });
      const configuredState = await configuredStatePromise;
      const timeoutStatePromise = waitFor(
        roleTimeoutSetup.socket,
        "game_state",
        (state) => state.roomId === roleTimeoutSetup.created.roomCode &&
          (state.roleSelectionTurnPlayerId !== roleTimeoutSetup.created.playerId || state.phase !== "ROLE_SELECTION"),
        10000,
        "server-authoritative role selection timeout"
      );
      const timeoutState = await timeoutStatePromise;
      const automaticallySelectedRoleId = timeoutState.players.find(
        (player) => player.id === roleTimeoutSetup.created.playerId
      )?.selectedRoleId;
      results.push(checkDirectSkillFlow(`role-timeout`, [
        ["role dock has no full-table overlay and leaves exit reachable", menuReachability.roleDockVisible && menuReachability.overlayAbsent && menuReachability.exitReachable, menuReachability],
        ["server advances role selection without a client timeout command", timeoutState.roleSelectionTurnPlayerId !== roleTimeoutSetup.created.playerId || timeoutState.phase !== "ROLE_SELECTION", {
          forcedChooserId: roleTimeoutSetup.created.playerId,
          nextChooserId: timeoutState.roleSelectionTurnPlayerId,
          phase: timeoutState.phase
        }],
        ["server selects a role from the legal available pool", configuredState.availableRoles.some(
          (role) => role.id === automaticallySelectedRoleId
        ), {
          legalRoleIds: configuredState.availableRoles.map((role) => role.id),
          automaticallySelectedRoleId
        }],
        ["public timeout log does not reveal the selected role", timeoutState.gameLog.some((log) =>
          log.type === "turn_timeout_role_selected" &&
          !["刺客", "盗贼", "魔术师", "国王", "主教", "商人", "建筑师", "军阀", "王后"]
            .some((roleName) => log.message.includes(roleName))
        ), timeoutState.gameLog.slice(0, 3)]
      ]));
    }

    if (qaMode === "full" && roleSetup) {
      const roleViewport = viewports[0];
      const roleLabel = `${roleViewport.width}x${roleViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, roleSetup.created, roleViewport);
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

      rejectedBuildSetup = await setupGame(4);
      await preparePage(browser.cdp, browser.sessionId, rejectedBuildSetup.created, buildViewport);
      const rejectedBuildFlow = await collectRejectedBuildFlow(browser.cdp, browser.sessionId, rejectedBuildSetup);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${buildLabel}-build-rejected-return`));
      results.push(checkRejectedBuildFlow(`${buildLabel} build-rejected`, rejectedBuildFlow));
    }

    if (qaMode === "build-animation") {
      const buildViewport = viewports[0];
      const buildLabel = `${buildViewport.width}x${buildViewport.height}`;
      buildSetup = await setupGame(4);
      await preparePage(browser.cdp, browser.sessionId, buildSetup.created, buildViewport);
      const buildConfirmFlow = await collectBuildConfirmFlow(browser.cdp, browser.sessionId, buildSetup);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${buildLabel}-build-animation-success`));
      results.push(checkBuildConfirmFlow(`${buildLabel} build-animation`, buildConfirmFlow));

      rejectedBuildSetup = await setupGame(4);
      await preparePage(browser.cdp, browser.sessionId, rejectedBuildSetup.created, buildViewport);
      const rejectedBuildFlow = await collectRejectedBuildFlow(browser.cdp, browser.sessionId, rejectedBuildSetup);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${buildLabel}-build-animation-rejected`));
      results.push(checkRejectedBuildFlow(`${buildLabel} build-animation-rejected`, rejectedBuildFlow));

      const opponentBuildCases = [
        { playerCount: 4, opponentIndex: 0, viewport: viewports[0] },
        { playerCount: 8, opponentIndex: 6, viewport: viewports.at(-1) ?? viewports[0] }
      ];
      for (const testCase of opponentBuildCases) {
        const opponentBuildSetup = await setupGame(testCase.playerCount, { actionDeadlineMs: 90_000 });
        opponentBuildSetups.push(opponentBuildSetup);
        const opponentBuildLabel = `${testCase.viewport.width}x${testCase.viewport.height}-${testCase.playerCount}p-opponent-build`;
        await preparePage(browser.cdp, browser.sessionId, opponentBuildSetup.created, testCase.viewport);
        const opponentBuildFlow = await collectOpponentBuildFlow(
          browser.cdp,
          browser.sessionId,
          opponentBuildSetup,
          testCase.opponentIndex,
          opponentBuildLabel
        );
        if (opponentBuildFlow.screenshot) screenshots.push(opponentBuildFlow.screenshot);
        results.push(checkOpponentBuildFlow(opponentBuildLabel, opponentBuildFlow));
      }

      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "reduce" }]
      }, browser.sessionId);
      try {
        const reducedBuildSetup = await setupGame(4, { actionDeadlineMs: 90_000 });
        opponentBuildSetups.push(reducedBuildSetup);
        const reducedBuildLabel = `${buildLabel}-4p-opponent-build-reduced`;
        await preparePage(browser.cdp, browser.sessionId, reducedBuildSetup.created, buildViewport);
        const reducedBuildFlow = await collectReducedOpponentBuildFlow(
          browser.cdp,
          browser.sessionId,
          reducedBuildSetup,
          0,
          reducedBuildLabel
        );
        if (reducedBuildFlow.screenshot) screenshots.push(reducedBuildFlow.screenshot);
        results.push(checkReducedOpponentBuildFlow(reducedBuildLabel, reducedBuildFlow));
      } finally {
        await browser.cdp.send("Emulation.setEmulatedMedia", {
          media: "screen",
          features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
        }, browser.sessionId);
      }
    }

    if (qaMode === "resource-deltas") {
      for (const [viewportIndex, viewport] of viewports.entries()) {
        const playerCount = viewportIndex === 0 ? 8 : 4;
        const resourceDeltaSetup = await setupGame(playerCount, { actionDeadlineMs: 90_000 });
        resourceDeltaSetups.push(resourceDeltaSetup);
        const label = `${viewport.width}x${viewport.height}-${playerCount}p-resource-deltas`;
        await preparePage(browser.cdp, browser.sessionId, resourceDeltaSetup.created, viewport);
        const flow = await collectOpponentResourceDeltaFlow(
          browser.cdp,
          browser.sessionId,
          resourceDeltaSetup,
          viewport,
          Math.max(0, playerCount - 2),
          label
        );
        screenshots.push(...flow.screenshots);
        results.push(checkOpponentResourceDeltaFlow(label, flow));
      }
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

    if (qaMode === "nicknames") {
      let nicknameActionSetup = null;
      for (const playerCount of opponentPlayerCounts) {
        const nicknameSetup = await setupGame(playerCount, { stopAtCrownReveal: true });
        nicknameSetups.push(nicknameSetup);
        if (playerCount === 8) nicknameActionSetup = nicknameSetup;
        const fixtures = nicknameFixtures.slice(0, playerCount);
        await configureQaGame(nicknameSetup, {
          playerFixtures: fixtures,
          forceSelfActionRoleId: "magician",
          selfHandCount: 8,
          opponentHandCount: 8,
          cityCount: 4,
          deadlineMs: 60_000
        });
        await delay(60);

        for (const [viewportIndex, viewport] of viewports.entries()) {
          const label = `${viewport.width}x${viewport.height}-${playerCount}p-nicknames`;
          if (viewportIndex === 0) {
            await preparePage(browser.cdp, browser.sessionId, nicknameSetup.created, viewport);
          } else {
            await setViewport(browser.cdp, browser.sessionId, viewport);
            await delay(220);
          }
          const baseline = await collectNicknameLayout(browser.cdp, browser.sessionId, true);
          const actual = await collectNicknameLayout(browser.cdp, browser.sessionId, false);
          results.push(checkNicknameLayout(label, baseline, actual, fixtures.map((fixture) => fixture.name)));
          if (playerCount === 8 && (viewport === viewports[0] || viewport === viewports.at(-1))) {
            screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, label));
          }
        }
      }

      if (!nicknameActionSetup) fail("Eight-player nickname action fixture was not created.");
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-action-button--skill:not(:disabled)')?.click()`);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-action-dock--skill-targeting", 10000);
      await evaluate(browser.cdp, browser.sessionId, `
        [...document.querySelectorAll('.citadel-action-dock--skill-targeting .citadel-action-button')]
          .find((button) => button.textContent.includes('交换手牌'))?.click()
      `);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-player-mini.is-player-targetable", 10000);
      const skillTargets = await evaluate(browser.cdp, browser.sessionId, `
        [...document.querySelectorAll('.citadel-player-mini.is-player-targetable')].map((card) => ({
          fullName: card.querySelector('[data-full-player-name]')?.getAttribute('data-full-player-name') ?? '',
          ariaLabel: card.getAttribute('aria-label') ?? ''
        }))
      `);
      results.push(checkDirectSkillFlow("nickname skill-player targets", [
        ["all seven targets keep their complete original names", skillTargets.length === 7 && skillTargets.every((target) =>
          nicknameFixtures.some((fixture) => fixture.name === target.fullName) && target.ariaLabel.includes(target.fullName)
        ), skillTargets]
      ]));

      const resultSetup = await setupGame(8, { stopAtCrownReveal: true });
      nicknameSetups.push(resultSetup);
      await configureQaGame(resultSetup, {
        playerFixtures: nicknameFixtures,
        scoreScenario: true,
        finishGame: true
      });
      await preparePage(
        browser.cdp,
        browser.sessionId,
        resultSetup.created,
        viewports.at(-1) ?? viewports[0],
        { waitForActionDock: false }
      );
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-overlay", 10000);
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-result-celebration')?.click()`);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-screen", 10000);
      const resultNames = await evaluate(browser.cdp, browser.sessionId, `
        [...document.querySelectorAll('.citadel-result-player-tag strong')].map((name) => ({
          text: name.textContent?.trim() ?? '',
          title: name.getAttribute('title') ?? '',
          ariaLabel: name.getAttribute('aria-label') ?? ''
        }))
      `);
      results.push(checkDirectSkillFlow("nickname final results", [
        ["all eight ranking rows retain complete result names", resultNames.length === 8 && resultNames.every((item) =>
          nicknameFixtures.some((fixture) => fixture.name === item.text) && item.title === item.text && item.ariaLabel === item.text
        ), resultNames]
      ]));
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, "nicknames-final-results"));
    }

    if (qaMode === "ui-tuning") {
      uiTuningSetup = await setupGame(8, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, uiTuningSetup.created, viewport);
      await evaluate(browser.cdp, browser.sessionId, `
        [...document.querySelectorAll('.utility-menu-button')]
          .find((button) => button.getAttribute('aria-label') === '设置')?.click()
      `);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-ui-tuning-entry__button", 10000);
      const settingsEntryFound = await evaluate(browser.cdp, browser.sessionId, `
        Boolean(document.querySelector('.citadel-ui-tuning-entry__button')?.textContent?.includes('打开调音台'))
      `);
      await evaluate(browser.cdp, browser.sessionId, `
        document.querySelector('.citadel-ui-tuning-entry__button')?.click()
      `);
      await waitForSelector(browser.cdp, browser.sessionId, ".game-ui-tuning-panel", 10000);
      const state = await evaluate(browser.cdp, browser.sessionId, `
        (async () => {
          const shell = document.querySelector('.citadel-game-shell');
          const panel = document.querySelector('.game-ui-tuning-panel');
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const value = element.getBoundingClientRect();
            return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
          };
          const snapshot = () => ({
            center: rect('.citadel-center-feedback-rail'),
            city: rect('.citadel-self-city'),
            action: rect('.citadel-action-layer .citadel-action-dock:not([class*="citadel-action-dock--"])'),
            role: rect('.citadel-game-center__role-card'),
            score: rect('.citadel-live-score-strip'),
            cornerDock: rect('.citadel-corner-dock--log'),
            selfCardVariable: getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim(),
            roleVariable: getComputedStyle(shell).getPropertyValue('--ui-active-role-card-width').trim(),
            scoreVariable: getComputedStyle(shell).getPropertyValue('--ui-score-strip-scale').trim(),
            cornerDockVariable: getComputedStyle(shell).getPropertyValue('--ui-corner-dock-length').trim()
          });
          const wait = (duration = 90) => new Promise((resolve) => setTimeout(resolve, duration));
          const setField = async (key, value) => {
            const input = document.querySelector('[data-tuning-field="' + key + '"] input[type="range"]');
            if (!input) return false;
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            const nextValue = Math.max(Number(input.min), Math.min(Number(input.max), value));
            setValue?.call(input, String(nextValue));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await wait();
            return true;
          };

          const before = snapshot();
          const selfInput = document.querySelector('[data-tuning-field="selfCardWidth"] input');
          await setField('selfCardWidth', Number(selfInput?.value ?? 84) - 8);
          const afterSelf = snapshot();

          const centerInput = document.querySelector('[data-tuning-field="centerTop"] input');
          await setField('centerTop', Number(centerInput?.value ?? 44) - 2);
          const afterCenter = snapshot();

          const cityInput = document.querySelector('[data-tuning-field="cityTop"] input');
          await setField('cityTop', Number(cityInput?.value ?? 55.2) + 2);
          const afterCity = snapshot();

          const actionInput = document.querySelector('[data-tuning-field="actionTop"] input');
          await setField('actionTop', Number(actionInput?.value ?? 71) + 9);
          const afterAction = snapshot();

          const roleInput = document.querySelector('[data-tuning-field="activeRoleCardWidth"] input');
          await setField('activeRoleCardWidth', Number(roleInput?.value ?? 92) + 8);
          const afterRole = snapshot();

          const scoreInput = document.querySelector('[data-tuning-field="scoreStripScale"] input');
          await setField('scoreStripScale', Number(scoreInput?.value ?? 1) + 0.15);
          const afterScore = snapshot();

          const cornerDockInput = document.querySelector('[data-tuning-field="cornerDockLength"] input');
          await setField('cornerDockLength', Number(cornerDockInput?.value ?? 92) + 12);
          const afterCornerDock = snapshot();

          const bounds = panel?.querySelector('input[type="checkbox"]');
          bounds?.click();
          await wait(70);
          await setField('cardPreviewScale', 1.4);
          document.querySelector('.game-ui-tuning-panel button.is-primary')?.click();
          await wait(220);
          const correctedFields = [...document.querySelectorAll('[data-tuning-field]')]
            .filter((field) => field.querySelector('em'))
            .map((field) => ({
              key: field.getAttribute('data-tuning-field'),
              text: field.textContent?.trim(),
              effective: field.getAttribute('data-effective-value')
            }));
          return {
            panelVisible: Boolean(panel),
            sliderCount: panel?.querySelectorAll('input[type="range"]').length ?? 0,
            before,
            afterSelf,
            afterCenter,
            afterCity,
            afterAction,
            afterRole,
            afterScore,
            afterCornerDock,
            preview: getComputedStyle(shell).getPropertyValue('--ui-card-preview-scale').trim(),
            boundsVisible: shell?.classList.contains('ui-show-bounds'),
            correctedFields,
            stored: (() => {
              const raw = localStorage.getItem('zy-game-ui-tuning-v4');
              if (!raw) return false;
              const parsed = JSON.parse(raw);
              return parsed.version === 4 && Boolean(parsed.config) &&
                'activeRoleCardWidth' in parsed.config && 'scoreStripScale' in parsed.config &&
                'cornerDockLength' in parsed.config && !('profiles' in parsed);
            })()
          };
        })()
      `);
      const appliedValue = state.afterSelf.selfCardVariable;
      await navigate(
        browser.cdp,
        browser.sessionId,
        `${appUrl}?qa-room=${encodeURIComponent(uiTuningSetup.created.roomCode)}&qa-ts=${Date.now()}`
      );
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-game-shell", 20000);
      const formalState = await evaluate(browser.cdp, browser.sessionId, `(() => {
        const shell = document.querySelector('.citadel-game-shell');
        return {
          panelHidden: !document.querySelector('.game-ui-tuning-panel'),
          applied: getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim(),
          preview: getComputedStyle(shell).getPropertyValue('--ui-card-preview-scale').trim(),
          activeRoleCardWidth: getComputedStyle(shell).getPropertyValue('--ui-active-role-card-width').trim(),
          scoreStripScale: getComputedStyle(shell).getPropertyValue('--ui-score-strip-scale').trim(),
          cornerDockLength: getComputedStyle(shell).getPropertyValue('--ui-corner-dock-length').trim()
        };
      })()`);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-ui-tuning`));
      results.push(checkDirectSkillFlow(`${label} ui-tuning`, [
        ["settings exposes a discoverable UI tuning entry", settingsEntryFound, { settingsEntryFound }],
        ["development tuning panel is visible", state.panelVisible, state],
        ["high-impact controls are available", state.sliderCount >= 10, state],
        ["self-card slider changes a semantic CSS variable", state.before.selfCardVariable !== state.afterSelf.selfCardVariable, state],
        ["center slider moves the rendered center rail", state.afterCenter.center?.top < state.afterSelf.center?.top - 4, state],
        ["city slider moves the rendered city region", state.afterCity.city?.top > state.afterCenter.city?.top + 4, state],
        ["action slider moves the rendered action controls", state.afterAction.action?.top > state.afterCity.action?.top + 4, state],
        ["active-role slider resizes the rendered role card", state.afterRole.role?.width > state.afterAction.role?.width + 4, state],
        ["score-strip slider changes real reserved dimensions", state.afterScore.score?.height > state.afterRole.score?.height + 1, state],
        ["corner-dock slider changes the rendered tab length", state.afterCornerDock.cornerDock?.height > state.afterScore.cornerDock?.height + 4, state],
        ["derived values expose requested and effective values", state.correctedFields.some((field) => field.text?.includes('→')), state.correctedFields],
        ["boundary overlay can be enabled", state.boundsVisible, state],
        ["tuning config is stored once as a global V4 layout", state.stored, state],
        ["formal mode hides the tuning panel", formalState.panelHidden, formalState],
        ["formal mode applies the saved value", formalState.applied === appliedValue, { appliedValue, formalState }],
        ["formal mode applies card preview scaling", formalState.preview === "1.4", formalState],
        ["formal mode applies the saved active-role size", formalState.activeRoleCardWidth === state.afterRole.roleVariable, { formalState, state }],
        ["formal mode applies the saved score-strip scale", formalState.scoreStripScale === state.afterScore.scoreVariable, { formalState, state }],
        ["formal mode applies the saved corner-dock length", formalState.cornerDockLength === state.afterCornerDock.cornerDockVariable, { formalState, state }]
      ]));

      const denseOpponentWidth = await evaluate(browser.cdp, browser.sessionId, `
        getComputedStyle(document.querySelector('.citadel-game-shell')).getPropertyValue('--ui-opponent-player-plate-width').trim()
      `);
      uiTuningCrossSetup = await setupGame(4, { actionDeadlineMs: 90000 });
      const crossSessionValue = JSON.stringify(uiTuningCrossSetup.created);
      await evaluate(browser.cdp, browser.sessionId, `
        localStorage.setItem('zy-board-game-session', ${JSON.stringify(crossSessionValue)})
      `);
      await navigate(
        browser.cdp,
        browser.sessionId,
        `${appUrl}?qa-room=${encodeURIComponent(uiTuningCrossSetup.created.roomCode)}&qa-ts=${Date.now()}`
      );
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-game-shell", 20000);
      const crossPlayerState = await evaluate(browser.cdp, browser.sessionId, `(() => {
        const shell = document.querySelector('.citadel-game-shell');
        return {
          selfCardWidth: getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim(),
          opponentPlateWidth: getComputedStyle(shell).getPropertyValue('--ui-opponent-player-plate-width').trim()
        };
      })()`);
      results.push(checkDirectSkillFlow(`${label} ui-tuning-cross-player-count`, [
        ["the same self layout value applies in four-player games", crossPlayerState.selfCardWidth === appliedValue, { appliedValue, crossPlayerState }],
        ["opponent seats expand automatically when moving from eight to four players", Number.parseFloat(crossPlayerState.opponentPlateWidth) > Number.parseFloat(denseOpponentWidth), {
          denseOpponentWidth,
          fourPlayerOpponentWidth: crossPlayerState.opponentPlateWidth
        }]
      ]));

      uiTuningCompactSetup = await setupGame(8, { stopAtCrownReveal: true });
      await configureQaGame(uiTuningCompactSetup, {
        forceSelfActionRoleId: "magician",
        selfHandCount: 12,
        opponentHandCount: 8,
        cityCount: 4,
        deadlineMs: 60_000
      });
      const compactViewport = viewports.find((candidate) => candidate.width <= 1100) ?? { width: 1024, height: 640 };
      const compactLabel = `${compactViewport.width}x${compactViewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, uiTuningCompactSetup.created, compactViewport);
      await evaluate(browser.cdp, browser.sessionId, `
        [...document.querySelectorAll('.utility-menu-button')]
          .find((button) => button.getAttribute('aria-label') === '设置')?.click()
      `);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-ui-tuning-entry__button", 10000);
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-ui-tuning-entry__button')?.click()`);
      await waitForSelector(browser.cdp, browser.sessionId, ".game-ui-tuning-panel", 10000);
      const compactTuningState = await evaluate(browser.cdp, browser.sessionId, `
        (async () => {
          const wait = (duration = 100) => new Promise((resolve) => setTimeout(resolve, duration));
          const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
          const numericStyle = (selector, property, pseudo = null) => {
            const element = document.querySelector(selector);
            return element ? Number.parseFloat(getComputedStyle(element, pseudo).getPropertyValue(property)) : null;
          };
          const shell = document.querySelector('.citadel-game-shell');
          const measure = (key) => {
            const selfCards = [...document.querySelectorAll('.citadel-hand-card')];
            const opponentCard = '.citadel-opponent-seat .citadel-player-mini';
            switch (key) {
              case 'selfCardWidth': return rect('.citadel-hand-card')?.width ?? null;
              case 'handOverlap': return selfCards.length > 1 ? selfCards[1].getBoundingClientRect().left - selfCards[0].getBoundingClientRect().left : null;
              case 'handMaxWidth': return rect('.citadel-hand-zone')?.width ?? null;
              case 'playerPlateWidth': return rect('.citadel-player-mini--self')?.width ?? null;
              case 'playerPlateHeight': return rect('.citadel-player-mini--self')?.height ?? null;
              case 'avatarSize': return rect('.citadel-player-mini--self .citadel-player-mini__avatar')?.width ?? null;
              case 'resourceIconSize': return numericStyle('.citadel-player-mini--self .citadel-player-mini__stat', 'width', '::before');
              case 'resourceFontSize': return numericStyle('.citadel-player-mini--self .citadel-player-mini__stat', 'font-size');
              case 'resourceGap': return numericStyle('.citadel-player-mini--self .citadel-player-mini__resources', 'column-gap');
              case 'opponentPlayerPlateWidth': return rect(opponentCard)?.width ?? null;
              case 'opponentPlayerPlateHeight': return rect(opponentCard)?.height ?? null;
              case 'opponentAvatarSize': return rect('.citadel-opponent-seat .citadel-player-mini__avatar')?.width ?? null;
              case 'opponentResourceIconSize': return numericStyle('.citadel-opponent-seat .citadel-player-mini__stat', 'width', '::before');
              case 'opponentResourceFontSize': return numericStyle('.citadel-opponent-seat .citadel-player-mini__stat', 'font-size');
              case 'opponentResourceGap': return numericStyle('.citadel-opponent-seat .citadel-player-mini__resources', 'column-gap');
              case 'opponentRoleWidth': return rect('.citadel-opponent-card-line .citadel-role-card--compact')?.width ?? null;
              case 'opponentHandWidth': return rect('.citadel-opponent-card-line .citadel-mini-card')?.width ?? null;
              case 'opponentHandStackDepth': return rect('.citadel-opponent-card-line .citadel-mini-card-row--stacked')?.width ?? null;
              case 'opponentDistrictWidth': return rect('.citadel-mini-city-card')?.width ?? null;
              case 'actionDockWidth': return rect('.citadel-action-layer .citadel-action-dock:not([class*="citadel-action-dock--"])')?.width ?? null;
              case 'cardPreviewScale': return rect('.citadel-card-inspector')?.width ?? 104 * Number.parseFloat(getComputedStyle(shell).getPropertyValue('--ui-card-preview-scale'));
              case 'activeRoleCardWidth': return rect('.citadel-game-center__role-card')?.width ?? null;
              case 'scoreStripScale': return rect('.citadel-live-score-strip')?.height ?? null;
              case 'cornerDockLength': return rect('.citadel-corner-dock--log')?.height ?? null;
              case 'centerTop': return rect('.citadel-center-feedback-rail')?.top ?? null;
              case 'cityTop': return rect('.citadel-self-city')?.top ?? null;
              case 'actionTop': return rect('.citadel-action-layer .citadel-action-dock:not([class*="citadel-action-dock--"])')?.top ?? null;
              case 'selfBottom': {
                const value = rect('.citadel-self-area');
                return value ? innerHeight - value.bottom : null;
              }
              default: return null;
            }
          };
          const setField = async (field, value) => {
            const input = field.querySelector('input[type="range"]');
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setValue?.call(input, String(value));
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await wait();
          };

          const fields = [...document.querySelectorAll('[data-tuning-field]')];
          const disabled = fields.filter((field) => field.getAttribute('data-tuning-applicable') === 'false').map((field) => ({
            key: field.getAttribute('data-tuning-field'),
            disabled: field.querySelector('input')?.disabled,
            text: field.textContent?.trim() ?? ''
          }));
          const changes = [];
          const applicableKeys = fields
            .filter((candidate) => candidate.getAttribute('data-tuning-applicable') === 'true')
            .map((field) => field.getAttribute('data-tuning-field'));
          for (const key of applicableKeys) {
            document.querySelector('.game-ui-tuning-panel footer button:nth-child(2)')?.click();
            await wait(70);
            const field = document.querySelector('[data-tuning-field="' + key + '"]');
            const input = field.querySelector('input[type="range"]');
            await setField(field, input.min);
            const low = measure(key);
            await setField(field, input.max);
            const high = measure(key);
            changes.push({ key, low, high, changed: Number.isFinite(low) && Number.isFinite(high) && Math.abs(high - low) > 0.25 });
          }

          const selfCardField = document.querySelector('[data-tuning-field="selfCardWidth"]');
          const selfCardInput = selfCardField.querySelector('input[type="range"]');
          await setField(selfCardField, selfCardInput.max);
          const beforeReset = getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim();
          document.querySelector('.game-ui-tuning-panel footer button:nth-child(2)')?.click();
          await wait(160);
          const afterReset = getComputedStyle(shell).getPropertyValue('--ui-self-card-width').trim();
          const nameStressValues = {
            playerPlateWidth: 'min', avatarSize: 'max', resourceIconSize: 'max', resourceFontSize: 'max', resourceGap: 'max',
            opponentPlayerPlateWidth: 'min', opponentAvatarSize: 'max', opponentResourceIconSize: 'max',
            opponentResourceFontSize: 'max', opponentResourceGap: 'max'
          };
          for (const [key, edge] of Object.entries(nameStressValues)) {
            const field = document.querySelector('[data-tuning-field="' + key + '"]');
            const input = field.querySelector('input[type="range"]');
            await setField(field, edge === 'min' ? input.min : input.max);
          }
          const nameSafety = [...document.querySelectorAll('.citadel-player-mini')].map((card) => {
            const avatar = card.querySelector('.citadel-player-mini__avatar-wrap')?.getBoundingClientRect();
            const copy = card.querySelector('.citadel-player-mini__copy')?.getBoundingClientRect();
            const resources = card.querySelector('.citadel-player-mini__resources')?.getBoundingClientRect();
            const resourceItems = [...card.querySelectorAll('.citadel-player-mini__resources > *')]
              .map((item) => item.getBoundingClientRect());
            const bounds = card.getBoundingClientRect();
            const inside = (rect) => rect &&
              rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
              rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
            return {
              playerId: card.getAttribute('data-player-id'),
              copyWidth: copy?.width ?? 0,
              safe: Boolean(avatar && copy && resources && copy.width >= 31 &&
                avatar.right <= copy.left + 1 && copy.right <= resources.left + 1 &&
                card.scrollWidth <= card.clientWidth + 1 && inside(avatar) && inside(copy) &&
                inside(resources) && resourceItems.every(inside))
            };
          });
          return {
            compact: shell?.getAttribute('data-compact-layout') === 'true',
            disabled,
            changes,
            beforeReset,
            afterReset,
            storageCleared: localStorage.getItem('zy-game-ui-tuning-v4') === null,
            nameSafety
          };
        })()
      `);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${compactLabel}-ui-tuning-compact`));
      results.push(checkDirectSkillFlow(`${compactLabel} ui-tuning-compact`, [
        ["compact tuning runs in the compact layout", compactTuningState.compact, compactTuningState],
        ["only inapplicable compact position sliders are disabled with reasons", compactTuningState.disabled.length === 2 &&
          compactTuningState.disabled.every((field) => field.disabled && field.text.includes('不适用')) &&
          compactTuningState.disabled.some((field) => field.key === 'actionDockRight') &&
          compactTuningState.disabled.some((field) => field.key === 'actionDockBottom'), compactTuningState.disabled],
        ["every applicable compact slider changes its corresponding geometry", compactTuningState.changes.length === 28 &&
          compactTuningState.changes.every((change) => change.changed), compactTuningState.changes.filter((change) => !change.changed)],
        ["restoring the preset immediately restores preview geometry and clears V4 storage", compactTuningState.beforeReset !== compactTuningState.afterReset && compactTuningState.storageCleared, compactTuningState],
        ["combined minimum plates and maximum avatar/resources preserve all three columns", compactTuningState.nameSafety.every((card) => card.safe), compactTuningState.nameSafety]
      ]));
    }

    if (qaMode === "action-feedback") {
      actionFeedbackSetup = await setupGame(4, { actionDeadlineMs: 90000 });
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      await preparePage(browser.cdp, browser.sessionId, actionFeedbackSetup.created, viewport);
      const centerBefore = await evaluate(browser.cdp, browser.sessionId, `
        (() => {
          const rect = document.querySelector('.citadel-game-center')?.getBoundingClientRect();
          return rect ? { left: rect.left, top: rect.top } : null;
        })()
      `);
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-action-button--gold')?.click()`);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-skill-presentation--take_gold", 5000);
      const state = await evaluate(browser.cdp, browser.sessionId, `
        (() => {
          const presentation = document.querySelector('.citadel-skill-presentation--take_gold');
          const timer = document.querySelector('.citadel-game-center__turn-timer, .citadel-game-center__timer');
          const modal = document.querySelector('.modal-backdrop');
          const notice = document.querySelector('.citadel-action-notices');
          const currentPlayer = document.querySelector('.citadel-player-mini.is-current');
          const pStyle = presentation ? getComputedStyle(presentation) : null;
          const timerRect = timer?.getBoundingClientRect();
          const noticeRect = notice?.getBoundingClientRect();
          const currentStyle = currentPlayer ? getComputedStyle(currentPlayer) : null;
          const centerRect = document.querySelector('.citadel-game-center')?.getBoundingClientRect();
          const separated = !timerRect || !noticeRect ||
            timerRect.bottom + 6 <= noticeRect.top || noticeRect.bottom + 6 <= timerRect.top;
          return {
            presentationVisible: Boolean(presentation),
            pointerEvents: pStyle?.pointerEvents,
            timerVisible: Boolean(timerRect && timerRect.width > 0 && timerRect.height > 0),
            timerNoticeSeparated: separated,
            centerPosition: centerRect ? { left: centerRect.left, top: centerRect.top } : null,
            noticeCount: notice?.querySelectorAll('article').length ?? 0,
            noticeTexts: [...(notice?.querySelectorAll('article') ?? [])].map((item) => item.innerText.trim()),
            noticeHasSecondaryLine: Boolean(notice?.querySelector('small')),
            noticeWraps: [...(notice?.querySelectorAll('article') ?? [])].some((item) => {
              const style = getComputedStyle(item);
              const lineHeight = Number.parseFloat(style.lineHeight);
              return Number.isFinite(lineHeight) && item.clientHeight > lineHeight * 1.55;
            }),
            routeCount: presentation?.querySelectorAll('.citadel-skill-presentation__route').length ?? 0,
            coinCount: presentation?.querySelectorAll('.citadel-skill-coin-stream > span').length ?? 0,
            currentPlayerGlows: Boolean(currentStyle && currentStyle.boxShadow !== 'none'),
            queueCount: document.querySelectorAll('.citadel-skill-presentation').length,
            modalAbove: !modal || Number(getComputedStyle(modal).zIndex) > Number(pStyle?.zIndex ?? 0)
          };
        })()
      `);
      state.centerStable = Boolean(centerBefore && state.centerPosition &&
        Math.abs(centerBefore.left - state.centerPosition.left) <= 1 &&
        Math.abs(centerBefore.top - state.centerPosition.top) <= 1);
      screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-action-feedback`));
      results.push(checkDirectSkillFlow(`${label} action-feedback`, [
        ["gold action produces a presentation", state.presentationVisible, state],
        ["gold action keeps coin motion without a dashed route", state.coinCount > 0 && state.routeCount === 0, state],
        ["gold action keeps a readable result notice", await evaluate(browser.cdp, browser.sessionId, `Boolean(document.querySelector('.citadel-action-notices'))`), state],
        ["presentation never captures pointer input", state.pointerEvents === "none", state],
        ["center timer remains visible", state.timerVisible, state],
        ["center timer and action text remain separated", state.timerNoticeSeparated, state],
        ["the notice slot contains only one result", state.noticeCount === 1, state],
        ["the result is a short single-line sentence", !state.noticeHasSecondaryLine && !state.noticeWraps &&
          state.noticeTexts.length === 1 && state.noticeTexts[0].length <= 28, state],
        ["action notices do not move the fixed center information", state.centerStable, { centerBefore, centerAfter: state.centerPosition }],
        ["current player nameplate has an outer glow", state.currentPlayerGlows, state],
        ["only one presentation is active", state.queueCount === 1, state],
        ["confirmation modal stays above presentations", state.modalAbove, state]
      ]));
    }

    if (qaMode === "extreme-layout" || qaMode === "release") {
      for (const playerCount of [4, 8]) {
        const extremeSetup = await setupGame(playerCount, { actionDeadlineMs: 90000 });
        extremeSetups.push(extremeSetup);
        const configuredPoolSize = extremeSetup.gameState.districtDeckCount +
          extremeSetup.gameState.districtDiscardPileCount +
          extremeSetup.gameState.players.reduce((total, player) => total + player.handCount + player.city.length, 0) +
          (extremeSetup.gameState.pendingDrawChoice?.drawnCards.length ?? 0);
        await configureQaGame(extremeSetup, { distributionMode: "drain-deck-round-robin" });
        for (const viewport of viewports) {
          const viewportLabel = `${viewport.width}x${viewport.height}`;
          await preparePage(browser.cdp, browser.sessionId, extremeSetup.created, viewport);
          await new Promise((resolve) => setTimeout(resolve, 200));
          const layout = await collectLayout(browser.cdp, browser.sessionId);
          const state = await evaluate(browser.cdp, browser.sessionId, `
            (() => {
              const hand = document.querySelector('.citadel-hand-zone');
              const stacks = [...document.querySelectorAll('.citadel-mini-card-row--stacked')];
              const cards = [...document.querySelectorAll('.citadel-hand-zone .citadel-hand-card')];
              const handRect = hand?.getBoundingClientRect();
              const cardRects = cards.map((card) => {
                const rect = card.getBoundingClientRect();
                return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
              });
              const probeIndexes = [...new Set([0, Math.floor(cards.length / 2), cards.length - 1])]
                .filter((index) => index >= 0);
              const interactiveProbes = probeIndexes.map((index) => {
                const card = cards[index];
                const rect = card.getBoundingClientRect();
                const nextRect = cards[index + 1]?.getBoundingClientRect();
                const x = nextRect
                  ? Math.max(rect.left + 1, Math.min(rect.right - 1, (rect.left + nextRect.left) / 2))
                  : rect.left + rect.width / 2;
                const y = rect.top + Math.min(18, rect.height / 3);
                const hit = document.elementFromPoint(x, y);
                return {
                  index,
                  hit: Boolean(hit && (hit === card || card.contains(hit))),
                  point: { x, y },
                  rect: cardRects[index]
                };
              });
              const selfCount = Number(hand?.dataset.handCount);
              const opponentCounts = stacks.map((stack) => Number(stack.dataset.handCount));
              const counts = [selfCount, ...opponentCounts];
              return {
                scrollable: hand ? hand.scrollWidth > hand.clientWidth : false,
                overflowX: hand ? getComputedStyle(hand).overflowX : null,
                cardsInsideHand: Boolean(handRect && cardRects.every((rect) =>
                  rect.left >= handRect.left - 1 && rect.right <= handRect.right + 1 &&
                  rect.top >= handRect.top - 1 && rect.bottom <= handRect.bottom + 1
                )),
                handRect: handRect ? {
                  left: handRect.left,
                  top: handRect.top,
                  right: handRect.right,
                  bottom: handRect.bottom
                } : null,
                interactiveProbes,
                selfCount,
                opponentCounts,
                totalHands: counts.reduce((total, count) => total + count, 0),
                spread: Math.max(...counts) - Math.min(...counts),
                stackCountsMatch: stacks.every((stack) =>
                  stack.querySelectorAll('.citadel-mini-card').length === Number(stack.dataset.handCount) &&
                  Number(stack.querySelector('.citadel-mini-card-count')?.textContent) === Number(stack.dataset.handCount)
                )
              };
            })()
          `);
          const label = `${viewportLabel} ${playerCount}-player drained-pool-${configuredPoolSize}`;
          results.push(checkLayout(label, layout, {
            expectedOpponentCount: playerCount - 1,
            expectedDenseCount: playerCount >= 7 ? 4 : 0
          }));
          results.push(checkDirectSkillFlow(`${label} adaptive-hand`, [
            ["all configured district cards remain in the real hands", state.totalHands === configuredPoolSize, { configuredPoolSize, state }],
            ["round-robin drawing differs by at most one card", state.spread <= 1, state],
            ["the complete self hand stays scrollbar-free", !state.scrollable &&
              state.overflowX !== "auto" && state.overflowX !== "scroll", state],
            ["all self hand cards stay inside the safe hand zone", state.cardsInsideHand, state],
            ["first, middle, and last cards keep a real pointer target", state.interactiveProbes.every((probe) => probe.hit), state],
            ["opponent hand layers and exact badges match server counts", state.stackCountsMatch, state]
          ]));
          screenshots.push(await captureScreenshot(
            browser.cdp,
            browser.sessionId,
            `${viewportLabel}-${playerCount}-player-drained-pool-${configuredPoolSize}`
          ));
        }
      }
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

      assassinTargetingSetup = await setupForcedRoleGame("assassin", roleEffectSetups);
      await configureQaGame(assassinTargetingSetup, { ensureSelectedRoleId: "thief" });
      await preparePage(browser.cdp, browser.sessionId, assassinTargetingSetup.created, viewport);
      const assassinFlow = await collectRoleSkillTargetFlow(browser.cdp, browser.sessionId, `${label}-assassin-role-targeting`);
      if (assassinFlow.screenshot) screenshots.push(assassinFlow.screenshot);
      if (assassinFlow.presentationScreenshot) screenshots.push(assassinFlow.presentationScreenshot);
      if (assassinFlow.skipPresentationScreenshot) screenshots.push(assassinFlow.skipPresentationScreenshot);
      results.push(checkDirectSkillFlow(`${label} assassin-role-targeting`, [
        ["skill opens explicit role targets", assassinFlow.opened && assassinFlow.optionCount > 0, assassinFlow],
        ["assassin target cards stay on one compact row", assassinFlow.targetLayout?.cards?.length > 0 &&
          assassinFlow.targetLayout.cards.every((card) => Math.abs(card.top - assassinFlow.targetLayout.cards[0].top) <= 9) &&
          assassinFlow.targetLayout.panel.height <= Math.max(...assassinFlow.targetLayout.cards.map((card) => card.height)) + 32, assassinFlow.targetLayout],
        ["assassin explanation stays left and confirm controls stay right", assassinFlow.targetLayout?.header?.right + 8 <= assassinFlow.targetLayout?.cards?.[0]?.left &&
          Math.max(...assassinFlow.targetLayout.cards.map((card) => card.right)) + 8 <= assassinFlow.targetLayout?.controls?.left &&
          assassinFlow.targetLayout.text.includes("选择一名玩家刺杀"), assassinFlow.targetLayout],
        ["confirming a role closes targeting", assassinFlow.closedAfterConfirm, assassinFlow],
        ["assassin confirmation launches a non-layout presentation", assassinFlow.presentation?.className.includes("assassin_mark") && assassinFlow.presentation?.pointerEvents === "none" && assassinFlow.presentation?.coversTable, assassinFlow.presentation],
        ["assassinated role visibly skips its turn", assassinFlow.skipPresentation?.className.includes("assassin_skip") && assassinFlow.skipPresentation?.coversTable, assassinFlow.skipPresentation]
      ]));

      magicianDiscardSetup = await setupForcedRoleGame("magician", roleEffectSetups);
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

      magicianPlayerSetup = await setupForcedRoleGame("magician", roleEffectSetups);
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
      thiefSetup = await setupForcedRoleGame("thief", roleEffectSetups);
      await configureQaGame(thiefSetup, { ensureSelectedRoleId: "magician" });
      await preparePage(browser.cdp, browser.sessionId, thiefSetup.created, viewport);
      const flow = await collectThiefPresentationFlow(browser.cdp, browser.sessionId, `${label}-thief-presentation`);
      if (flow.targetScreenshot) screenshots.push(flow.targetScreenshot);
      if (flow.markScreenshot) screenshots.push(flow.markScreenshot);
      if (flow.stealScreenshot) screenshots.push(flow.stealScreenshot);
      results.push(checkDirectSkillFlow(`${label} thief-presentation`, [
        ["thief can mark the magician role", flow.selected, flow],
        ["thief target cards stay on one compact row", flow.targetLayout?.cards?.length > 0 &&
          flow.targetLayout.cards.every((card) => Math.abs(card.top - flow.targetLayout.cards[0].top) <= 9), flow.targetLayout],
        ["thief confirm controls stay to the right of the role row", flow.targetLayout?.controls?.left >=
          Math.max(...flow.targetLayout.cards.map((card) => card.right)) + 8 &&
          flow.targetLayout.text.includes("选择一名玩家偷窃"), flow.targetLayout],
        ["thief mark launches a non-layout presentation", flow.markPresentation?.className.includes("thief_mark") && flow.markPresentation?.pointerEvents === "none" && flow.markPresentation?.coversTable, flow.markPresentation],
        ["resolved theft launches a coin-transfer presentation", flow.stealPresentation?.className.includes("thief_steal") && flow.stealPresentation?.coversTable, flow.stealPresentation]
      ]));
    }

    if (qaMode === "role-effects") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      const roleSpecs = [
        { roleId: "king", expectedKinds: ["role_income"], expectedIncome: 2, colorLabel: "黄色" },
        { roleId: "bishop", expectedKinds: ["role_income", "bishop_guard"], expectedIncome: 2, colorLabel: "蓝色" },
        { roleId: "merchant", expectedKinds: ["role_income"], expectedIncome: 3, colorLabel: "绿色" },
        { roleId: "warlord", expectedKinds: ["role_income"], expectedIncome: 2, colorLabel: "红色", warlordIncomeOnly: true },
        { roleId: "architect", expectedKinds: ["architect_bonus"], reducedMotion: true, expectedIncome: null }
      ];

      for (const spec of roleSpecs) {
        await browser.cdp.send("Emulation.setEmulatedMedia", {
          media: "screen",
          features: spec.reducedMotion
            ? [{ name: "prefers-reduced-motion", value: "reduce" }]
            : [{ name: "prefers-reduced-motion", value: "no-preference" }]
        }, browser.sessionId);
        const effectSetup = await setupForcedRoleGame(spec.roleId, roleEffectSetups);
        if (spec.expectedIncome !== null) {
          await configureQaGame(effectSetup, { incomeRoleId: spec.roleId });
          await delay(100);
        }
        await preparePage(browser.cdp, browser.sessionId, effectSetup.created, viewport);
        const incomeUi = await collectRoleIncomeUi(browser.cdp, browser.sessionId);
        screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-${spec.roleId}-income-ui`));
        const flow = spec.warlordIncomeOnly
          ? await collectWarlordIncomePresentation(
              browser.cdp,
              browser.sessionId,
              `${label}-${spec.roleId}-effect`
            )
          : await collectSimpleRolePresentation(
              browser.cdp,
              browser.sessionId,
              spec.roleId,
              spec.expectedKinds,
              `${label}-${spec.roleId}-effect`
            );
        screenshots.push(...flow.screenshots);
        const expectedPresentations = spec.expectedKinds.map((kind) =>
          flow.presentations.find((item) => item.kind === kind)
        );
        await delay(120);
        const latestSelf = effectSetup.socket.__qaLatestGameState?.players.find(
          (player) => player.id === effectSetup.created.playerId
        );
        const afterSkillUi = await evaluate(
          browser.cdp,
          browser.sessionId,
          `(() => {
            const button = document.querySelector('.citadel-action-button--skill');
            const selfPlayer = document.querySelector('.citadel-player-mini--self');
            return {
              buttonText: button?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
              gold: Number(selfPlayer?.getAttribute('data-player-gold') ?? NaN)
            };
          })()`
        );
        results.push(checkDirectSkillFlow(`${label} ${spec.roleId}-effect`, [
          [`${spec.roleId} skill can be activated`, flow.clicked, flow],
          [`${spec.roleId} emits every expected presentation`, expectedPresentations.every(Boolean), flow],
          [`${spec.roleId} presentations cover the table without blocking clicks`, expectedPresentations.every((item) =>
            item?.presentation?.coversTable && item.presentation.pointerEvents === "none"
          ), flow],
          [`${spec.roleId} uses role-specific visual art`, expectedPresentations.every((item) =>
            (item?.presentation?.specialArt?.length ?? 0) > 0
          ), flow],
          [`${spec.roleId} income animations do not draw dashed routes`, expectedPresentations.every((item) =>
            item?.kind !== "role_income" || item.presentation?.routeCount === 0
          ), flow],
          [`${spec.roleId} keeps a single concise notice`, expectedPresentations.every((item) =>
            item?.notice?.count === 1 && item.notice.text.length <= 30
          ), flow],
          [`${spec.roleId} respects reduced-motion mode`, !spec.reducedMotion || expectedPresentations.every((item) =>
            Math.max(...(item?.presentation?.animationDurationsMs ?? [0])) <= 2
          ), flow],
          [`${spec.roleId} identity and skill UI describe only applicable role income`, spec.expectedIncome === null
            ? incomeUi.amount === null && !incomeUi.roleAriaLabel.includes("职业收入") && !incomeUi.inspectorText.includes("职业收入")
            : Number(incomeUi.amount) === spec.expectedIncome &&
              incomeUi.buttonText.includes(`职业收入预计 +${spec.expectedIncome}`) &&
              incomeUi.detail?.includes(`${spec.colorLabel}建筑`) &&
              incomeUi.detail?.includes(`= ${spec.expectedIncome} 枚金币`) &&
              incomeUi.roleAriaLabel.includes("职业收入") &&
              incomeUi.inspectorText.includes(`每座${spec.colorLabel}建筑`), incomeUi],
          [`${spec.roleId} displayed income matches the authoritative settlement`, spec.expectedIncome === null || (
            expectedPresentations.find((item) => item?.kind === "role_income")?.presentation?.amount === spec.expectedIncome &&
            afterSkillUi.gold === 20 + spec.expectedIncome &&
            afterSkillUi.buttonText.includes("职业收入已结算")
          ), { expectedIncome: spec.expectedIncome, latestSelf, afterSkillUi, flow }],
          [`${spec.roleId} income-only targeting shows the expected amount`, !spec.warlordIncomeOnly || (
            flow.targetingText.includes(`职业收入预计 +${spec.expectedIncome}`) &&
            flow.targetingText.includes(`只领取收入（+${spec.expectedIncome}）`)
          ), flow.targetingText]
        ]));
      }
      for (const baseline of [
        { roleId: "king", expectedIncome: 0, detail: "黄色建筑 0 = 0 枚金币" },
        { roleId: "merchant", expectedIncome: 1, detail: "绿色建筑 0 + 固定 1 = 1 枚金币" }
      ]) {
        const baselineSetup = await setupForcedRoleGame(baseline.roleId, roleEffectSetups);
        await preparePage(browser.cdp, browser.sessionId, baselineSetup.created, viewport);
        const baselineUi = await collectRoleIncomeUi(browser.cdp, browser.sessionId);
        results.push(checkDirectSkillFlow(`${label} ${baseline.roleId}-income-baseline`, [
          [`${baseline.roleId} shows the correct zero-city income`,
            Number(baselineUi.amount) === baseline.expectedIncome &&
            baselineUi.buttonText.includes(`职业收入预计 +${baseline.expectedIncome}`) &&
            baselineUi.detail?.includes(baseline.detail), baselineUi]
        ]));
      }
      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
      }, browser.sessionId);

      const queenFlow = await setupQueenPresentationFlow(
        browser.cdp,
        browser.sessionId,
        viewport,
        roleEffectSetups,
        `${label}-queen-effect`
      );
      if (queenFlow.screenshot) screenshots.push(queenFlow.screenshot);
      results.push(checkDirectSkillFlow(`${label} queen-effect`, [
        ["queen is selected in a live role-selection flow", queenFlow.selected, queenFlow],
        ["queen adjacency is emitted by the server with three coins", queenFlow.presentation?.amount === 3, queenFlow],
        ["queen adjacency has a dedicated non-blocking table presentation", queenFlow.presentation?.coversTable &&
          queenFlow.presentation?.pointerEvents === "none" &&
          queenFlow.presentation?.specialArt?.some((className) => String(className).includes("queen-bond")), queenFlow],
        ["queen income keeps coin motion without a dashed route", queenFlow.presentation?.routeCount === 0, queenFlow]
      ]));
    }

    if (qaMode === "queen-effect") {
      const viewport = viewports[0];
      const label = `${viewport.width}x${viewport.height}`;
      const queenFlow = await setupQueenPresentationFlow(
        browser.cdp,
        browser.sessionId,
        viewport,
        roleEffectSetups,
        `${label}-queen-effect`
      );
      if (queenFlow.screenshot) screenshots.push(queenFlow.screenshot);
      results.push(checkDirectSkillFlow(`${label} queen-effect`, [
        ["queen is selected in a live role-selection flow", queenFlow.selected, queenFlow],
        ["queen adjacency is emitted by the server with three coins", queenFlow.presentation?.amount === 3, queenFlow],
        ["queen adjacency has a dedicated non-blocking table presentation", queenFlow.presentation?.coversTable &&
          queenFlow.presentation?.pointerEvents === "none" &&
          queenFlow.presentation?.specialArt?.some((className) => String(className).includes("queen-bond")), queenFlow],
        ["queen income keeps coin motion without a dashed route", queenFlow.presentation?.routeCount === 0, queenFlow]
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
        ["assassinated role visibly skips its turn", assassinFlow.skipPresentation?.className.includes("assassin_skip") && assassinFlow.skipPresentation?.coversTable, assassinFlow.skipPresentation]
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

    if (qaMode === "results") {
      const celebrationSetup = await setupReactionGame(4);
      resultSetups.push(celebrationSetup);
      const celebrationViewport = viewports[0];
      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
      }, browser.sessionId);
      await preparePage(browser.cdp, browser.sessionId, celebrationSetup.created, celebrationViewport);
      const celebrationReady = configureQaGame(celebrationSetup, { cityCount: 10, finishGame: true });
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-celebration", 10000);
      await celebrationReady;
      const chatButtonState = await evaluate(browser.cdp, browser.sessionId, `(() => {
        const button = document.querySelector('.citadel-corner-dock--chat');
        const rect = button?.getBoundingClientRect();
        button?.click();
        return {
          rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
          celebrationAfterClick: Boolean(document.querySelector('.citadel-result-celebration'))
        };
      })()`);
      await delay(100);
      const chatOpenState = await evaluate(browser.cdp, browser.sessionId, `({
        celebrationStillVisible: Boolean(document.querySelector('.citadel-result-celebration')),
        championCitySrc: document.querySelector('.citadel-result-celebration__city img')?.getAttribute('src') ?? '',
        chatPanelVisible: Boolean(document.querySelector('.citadel-pop-dock--chat')),
        logButtonVisible: Boolean(document.querySelector('.citadel-corner-dock--log'))
      })`);
      await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-corner-dock--chat')?.click()`);
      await delay(80);
      const focusReturned = await evaluate(browser.cdp, browser.sessionId, `
        document.activeElement === document.querySelector('.citadel-corner-dock--chat')
      `);
      await delay(420);
      screenshots.push(await captureScreenshot(
        browser.cdp,
        browser.sessionId,
        `${celebrationViewport.width}x${celebrationViewport.height}-result-celebration`
      ));
      results.push(checkDirectSkillFlow(`${celebrationViewport.width}x${celebrationViewport.height} result-chat-during-celebration`, [
        ["chat keeps its fixed right-side trigger", Boolean(chatButtonState.rect && chatButtonState.rect.right >= celebrationViewport.width - 1), chatButtonState],
        ["opening chat does not skip the champion celebration", chatButtonState.celebrationAfterClick, { chatButtonState, chatOpenState }],
        ["champion celebration uses the approved city artwork", chatOpenState.championCitySrc.includes('/assets/generated-ui/result-screen-v1/champion-city-v1.png'), chatOpenState],
        ["chat opens above the result layer while the game log stays hidden", chatOpenState.chatPanelVisible && !chatOpenState.logButtonVisible, chatOpenState],
        ["closing chat restores focus to its trigger", focusReturned, { focusReturned }]
      ]));
      await evaluate(browser.cdp, browser.sessionId, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-screen", 10000);

      for (const playerCount of [4, 5, 6, 7, 8]) {
        const resultSetup = await setupReactionGame(playerCount);
        resultSetups.push(resultSetup);
        await configureQaGame(resultSetup, {
          cityCount: 10,
          finishGame: true,
          ...(playerCount === 8 ? { playerFixtures: nicknameFixtures } : {})
        });
        await delay(80);

        for (const [viewportIndex, viewport] of viewports.entries()) {
          const reducedMotion = playerCount === 8 && viewportIndex === 0;
          await browser.cdp.send("Emulation.setEmulatedMedia", {
            media: "screen",
            features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }]
          }, browser.sessionId);
          const label = `${viewport.width}x${viewport.height}-${playerCount}p`;
          await preparePage(browser.cdp, browser.sessionId, resultSetup.created, viewport, {
            waitForActionDock: false,
            extraQuery: `results=${playerCount}-${viewportIndex}`
          });
          await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-overlay", 10000);

          const initialStage = await evaluate(browser.cdp, browser.sessionId, `({
            celebration: Boolean(document.querySelector('.citadel-result-celebration')),
            scoreboard: Boolean(document.querySelector('.citadel-result-screen')),
            resultId: document.querySelector('.citadel-result-overlay')?.getAttribute('data-result-id') ?? ''
          })`);

          if (reducedMotion && initialStage.resultId) {
            await evaluate(browser.cdp, browser.sessionId, `sessionStorage.setItem(${JSON.stringify("zy-result-celebration:")} + ${JSON.stringify(initialStage.resultId)}, 'played')`);
          } else if (initialStage.celebration) {
            const skipKey = playerCount === 4 ? "Enter" : playerCount === 5 ? " " : playerCount === 6 ? "Escape" : null;
            if (skipKey) {
              await evaluate(browser.cdp, browser.sessionId, `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(skipKey)}, bubbles: true }))`);
            } else {
              await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-result-celebration')?.click()`);
            }
          }
          await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-screen", 10000);

          let applauseEvent = null;
          if (viewportIndex === 0) {
            const applausePromise = waitFor(
              resultSetup.socket,
              "result_applause_event",
              (event) => event.targetPlayerId === resultSetup.guestSession.playerId,
              12000,
              "result applause from browser"
            );
            await evaluate(browser.cdp, browser.sessionId, `
              document.querySelector(${JSON.stringify(`[data-player-id="${resultSetup.guestSession.playerId}"] .citadel-result-applause button`)})?.click()
            `);
            applauseEvent = await applausePromise;
            await delay(80);
          }

          const state = await evaluate(browser.cdp, browser.sessionId, `(() => {
            const compactRect = (rect) => rect ? ({
              left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
              width: rect.width, height: rect.height
            }) : null;
            const screen = document.querySelector('.citadel-result-screen');
            const table = document.querySelector('.citadel-result-table');
            const ranking = document.querySelector('.citadel-result-ranking');
            const rows = [...document.querySelectorAll('.citadel-result-player')].map((row) => {
              const lane = row.querySelector('.citadel-result-player__city');
              const cards = [...row.querySelectorAll('.citadel-result-district')].map((card) => {
                const rect = card.getBoundingClientRect();
                return { ...compactRect(rect), ratio: rect.width / rect.height };
              });
              const laneRect = lane?.getBoundingClientRect();
              const rowRect = row.getBoundingClientRect();
              return {
                rank: Number(row.getAttribute('data-rank')),
                playerId: row.getAttribute('data-player-id'),
                rect: compactRect(rowRect),
                lane: compactRect(laneRect),
                cardCount: cards.length,
                cards,
                cardsInsideLane: Boolean(laneRect && cards.every((card) =>
                  card.left >= laneRect.left - .5 && card.right <= laneRect.right + .5 &&
                  card.top >= laneRect.top - .5 && card.bottom <= laneRect.bottom + .5
                )),
                cardsDoNotOverlap: cards.every((card, index) => index === 0 || card.left >= cards[index - 1].right - .5)
              };
            });
            const scrollState = (element) => element ? ({
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              clientHeight: element.clientHeight,
              scrollHeight: element.scrollHeight
            }) : null;
            const applauseButton = document.querySelector(${JSON.stringify(`[data-player-id="${resultSetup.guestSession.playerId}"] .citadel-result-applause button`)});
            const highlightIconSrcs = [...document.querySelectorAll('.citadel-result-highlights img')]
              .map((image) => image.getAttribute('src') ?? '');
            const highlightLabels = [...document.querySelectorAll('.citadel-result-highlight')].map((highlight) => ({
              award: highlight.querySelector('.citadel-result-highlight__copy > strong')?.textContent?.trim() ?? '',
              performance: highlight.querySelector('.citadel-result-highlight__copy > span')?.textContent?.trim() ?? '',
              ariaLabel: highlight.getAttribute('aria-label') ?? ''
            }));
            return {
              viewport: { width: innerWidth, height: innerHeight },
              screen: compactRect(screen?.getBoundingClientRect()),
              heading: {
                text: document.querySelector('.citadel-result-heading')?.textContent?.trim() ?? '',
                rect: compactRect(document.querySelector('.citadel-result-heading')?.getBoundingClientRect())
              },
              titleOrnamentSrc: document.querySelector('.citadel-result-heading__ornament')?.getAttribute('src') ?? '',
              tableHeadText: document.querySelector('.citadel-result-table__head')?.textContent?.trim() ?? '',
              rows,
              highlights: document.querySelectorAll('.citadel-result-highlights > span').length,
              highlightIconSrcs,
              highlightLabels,
              resultSettings: (() => {
                const button = document.querySelector('.citadel-result-settings-entry');
                return button ? {
                  rect: compactRect(button.getBoundingClientRect()),
                  iconSrc: button.querySelector('img')?.getAttribute('src') ?? '',
                  label: button.getAttribute('aria-label') ?? ''
                } : null;
              })(),
              chatButton: compactRect(document.querySelector('.citadel-corner-dock--chat')?.getBoundingClientRect()),
              logButtonVisible: Boolean(document.querySelector('.citadel-corner-dock--log')),
              scroll: {
                document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
                screen: scrollState(screen),
                table: scrollState(table),
                ranking: scrollState(ranking)
              },
              applause: applauseButton ? {
                pressed: applauseButton.getAttribute('aria-pressed'),
                disabled: applauseButton.disabled,
                text: applauseButton.textContent?.trim() ?? '',
                iconSrc: applauseButton.querySelector('img')?.getAttribute('src') ?? '',
                active: Boolean(applauseButton.closest('.citadel-result-applause')?.classList.contains('is-active'))
              } : null
            };
          })()`);
          const allCards = state.rows.flatMap((row) => row.cards);
          results.push(checkDirectSkillFlow(`${label} result-scoreboard`, [
            ["result uses one continuous single-column rank sequence", state.rows.length === playerCount && state.rows.every((row, index) => row.rank === index + 1), state.rows.map((row) => row.rank)],
            ["the full result surface stays inside the viewport", Boolean(state.screen && state.screen.left >= 0 && state.screen.top >= 0 && state.screen.right <= viewport.width && state.screen.bottom <= viewport.height), state.screen],
            ["scoreboard uses the approved title ornament without baked text", state.titleOrnamentSrc.includes('/assets/generated-ui/result-screen-v1/title-ornament-v1.png'), { titleOrnamentSrc: state.titleOrnamentSrc }],
            ["scoreboard heading and fixed table labels remain visible", state.heading.text.includes('城邦总榜') && state.tableHeadText.includes('名次') && state.tableHeadText.includes('鼓掌'), { heading: state.heading, tableHeadText: state.tableHeadText }],
            ["every city shows all ten districts", state.rows.every((row) => row.cardCount === 10), state.rows.map((row) => row.cardCount)],
            ["all result district cards keep an exact 2:3 ratio", allCards.length === playerCount * 10 && allCards.every((card) => Math.abs(card.ratio - 2 / 3) <= .015), allCards.slice(0, 12)],
            ["district cards stay inside their own row lane without overlap", state.rows.every((row) => row.cardsInsideLane && row.cardsDoNotOverlap), state.rows],
            ["result page, surface, table and ranking have no scroll overflow", state.scroll.document.width <= viewport.width + 1 && state.scroll.document.height <= viewport.height + 1 && [state.scroll.screen, state.scroll.table, state.scroll.ranking].every((item) => item && item.scrollWidth <= item.clientWidth + 1 && item.scrollHeight <= item.clientHeight + 1), state.scroll],
            ["three positive highlights remain visible", state.highlights === 3, { highlights: state.highlights }],
            ["each highlight explains its award and the player's concrete result", state.highlightLabels.length === 3 && state.highlightLabels.every((highlight) => highlight.award && highlight.performance.includes('·') && highlight.ariaLabel.includes(highlight.award)), state.highlightLabels],
            ["highlight and applause controls use the approved result artwork", state.highlightIconSrcs.length === 3 && state.highlightIconSrcs.every((src) => src.includes('/assets/generated-ui/result-screen-v1/highlight-')) && Boolean(state.applause?.iconSrc.includes('/assets/generated-ui/result-screen-v1/applause-v1.png')), { highlightIconSrcs: state.highlightIconSrcs, applause: state.applause }],
            ["result keeps the approved settings entry inside the viewport", Boolean(state.resultSettings?.rect && state.resultSettings.rect.left >= 0 && state.resultSettings.rect.top >= 0 && state.resultSettings.rect.right <= viewport.width && state.resultSettings.rect.bottom <= viewport.height), state.resultSettings],
            ["result settings entry reuses the existing settings icon", Boolean(state.resultSettings?.label === '设置' && state.resultSettings.iconSrc.includes('/assets/homepage-v1/icon-settings.png')), state.resultSettings],
            ["only the fixed chat trigger remains above the result", Boolean(state.chatButton && state.chatButton.right >= viewport.width - 1 && !state.logButtonVisible), { chatButton: state.chatButton, logButtonVisible: state.logButtonVisible }],
            ["browser applause becomes public, pressed and animated", viewportIndex !== 0 || Boolean(applauseEvent && state.applause?.pressed === 'true' && state.applause.disabled && state.applause.text.includes('1') && state.applause.active), { applauseEvent, applause: state.applause }],
            ["reduced motion skips the forced celebration", !reducedMotion || !initialStage.celebration, initialStage]
          ]));
          screenshots.push(await captureScreenshot(browser.cdp, browser.sessionId, `${label}-result-scoreboard`));

          if (playerCount === 4 && viewportIndex === 0) {
            await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.citadel-result-settings-entry')?.click()`);
            await delay(100);
            const audioSettingsState = await evaluate(browser.cdp, browser.sessionId, `(() => {
              const panel = document.querySelector('.audio-settings-panel');
              const values = [...document.querySelectorAll('.audio-settings-panel input[type="range"]')]
                .map((input) => ({ label: input.getAttribute('aria-label'), value: input.value }));
              const mute = document.querySelector('[data-testid="audio-mute"]');
              return {
                panelVisible: Boolean(panel),
                values,
                muteLabel: mute?.textContent?.trim() ?? ''
              };
            })()`);
            results.push(checkDirectSkillFlow(`${label} result-audio-settings`, [
              ["result settings entry opens the shared audio panel", audioSettingsState.panelVisible, audioSettingsState],
              ["result audio panel keeps the four approved default controls", JSON.stringify(audioSettingsState.values) === JSON.stringify([
                { label: '主音量', value: '100' },
                { label: '环境音', value: '40' },
                { label: '游戏音效', value: '80' },
                { label: '界面音效', value: '65' }
              ]), audioSettingsState],
              ["result audio panel exposes the shared mute control", audioSettingsState.muteLabel.includes('全部静音'), audioSettingsState]
            ]));
            await evaluate(browser.cdp, browser.sessionId, `document.querySelector('.modal-close')?.click()`);

            await preparePage(browser.cdp, browser.sessionId, resultSetup.created, viewport, {
              waitForActionDock: false,
              extraQuery: `results-refresh=${Date.now()}`
            });
            await waitForSelector(browser.cdp, browser.sessionId, ".citadel-result-screen", 10000);
            const replayed = await evaluate(browser.cdp, browser.sessionId, `Boolean(document.querySelector('.citadel-result-celebration'))`);
            results.push(checkDirectSkillFlow(`${label} result-refresh`, [
              ["refresh does not force the same champion celebration again", !replayed, { replayed }]
            ]));
          }
        }
      }
      await browser.cdp.send("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
      }, browser.sessionId);
    }

    if (qaMode === "reactions") {
      for (const playerCount of [4, 8]) {
        const reactionSetup = await setupReactionGame(playerCount);
        reactionSetups.push(reactionSetup);
        for (const [viewportIndex, viewport] of viewports.entries()) {
          if (viewportIndex > 0) await delay(3_000);
          await configureQaGame(reactionSetup, { deadlineMs: 60_000 });
          const reducedMotion = playerCount === 8 && viewportIndex === viewports.length - 1;
          const label = `${viewport.width}x${viewport.height}-${playerCount}p`;
          const flow = await collectReactionFlow(
            browser.cdp,
            browser.sessionId,
            reactionSetup,
            viewport,
            label,
            reducedMotion
          );
          screenshots.push(...flow.screenshots);
          results.push(checkReactionFlow(`${label} reactions`, flow));
        }
      }
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
    rejectedBuildSetup?.socket.disconnect();
    denseSetup?.socket.disconnect();
    targetingSetup?.socket.disconnect();
    assassinTargetingSetup?.socket.disconnect();
    magicianDiscardSetup?.socket.disconnect();
    magicianPlayerSetup?.socket.disconnect();
    thiefSetup?.socket.disconnect();
    inspectorSetup?.socket.disconnect();
    utilityMenuSetup?.socket.disconnect();
    uiTuningSetup?.socket.disconnect();
    uiTuningCrossSetup?.socket.disconnect();
    uiTuningCompactSetup?.socket.disconnect();
    actionFeedbackSetup?.socket.disconnect();
    roleTimeoutSetup?.socket.disconnect();
    roleCallSetup?.socket.disconnect();
    for (const openingSetup of openingSetups) openingSetup.socket.disconnect();
    for (const scoringSetup of scoringSetups) scoringSetup.socket.disconnect();
    for (const extremeSetup of extremeSetups) extremeSetup.socket.disconnect();
    for (const opponentSetup of opponentSetups) opponentSetup.socket.disconnect();
    for (const roleEffectSetup of roleEffectSetups) roleEffectSetup.socket.disconnect();
    for (const opponentBuildSetup of opponentBuildSetups) opponentBuildSetup.socket.disconnect();
    for (const resourceDeltaSetup of resourceDeltaSetups) resourceDeltaSetup.socket.disconnect();
    for (const nicknameSetup of nicknameSetups) nicknameSetup.socket.disconnect();
    for (const resultSetup of resultSetups) {
      resultSetup.socket.disconnect();
      resultSetup.guest.disconnect();
    }
    for (const reactionSetup of reactionSetups) {
      reactionSetup.socket.disconnect();
      reactionSetup.guest.disconnect();
    }
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

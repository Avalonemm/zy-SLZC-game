import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3102;
const serverUrl = `http://127.0.0.1:${port}`;
const snapshotPath = join(tmpdir(), `zy-restart-smoke-${process.pid}.json`);
let serverProcess = null;
let socket = null;

try {
  serverProcess = await startServer();
  socket = await connect();
  const setup = await createFourPlayerGame(socket);
  const created = setup.created;
  const beforeRestart = await reachHumanAction(socket, created, setup.state);
  socket.disconnect();
  socket = null;
  stopProcessTree(serverProcess);
  serverProcess = null;

  serverProcess = await startServer();
  socket = await connect();
  const restoredStatePromise = once(socket, "game_state", 12_000);
  const restoredRoomPromise = once(socket, "reconnected_room", 12_000);
  socket.emit("reconnect_room", created);
  await restoredRoomPromise;
  const restored = await restoredStatePromise;

  if (
    restored.roomId !== created.roomCode ||
    restored.currentRound !== beforeRestart.currentRound ||
    restored.phase !== beforeRestart.phase ||
    restored.currentTurnPlayerId !== created.playerId
  ) {
    throw new Error(`Restored game state mismatch: ${JSON.stringify({
      before: summarize(beforeRestart),
      after: summarize(restored)
    })}`);
  }

  const progressedState = once(
    socket,
    "game_state",
    12_000,
    (state) => state.roomId === created.roomCode && state.turnState?.resourceActionTaken === true
  );
  const acknowledgement = emitWithAck(socket, "take_gold", created);
  const [ack] = await Promise.all([acknowledgement, progressedState]);
  if (!ack?.ok) throw new Error(ack?.error || "Restored game rejected a valid action.");

  console.log(JSON.stringify({
    ok: true,
    roomCode: created.roomCode,
    phase: restored.phase,
    round: restored.currentRound,
    continuedAfterRestart: true
  }));
} finally {
  socket?.disconnect();
  stopProcessTree(serverProcess);
  if (existsSync(snapshotPath)) rmSync(snapshotPath, { force: true });
}

process.exit(0);

async function startServer() {
  const child = spawn("npm.cmd", ["run", "start", "--workspace", "server"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      CLIENT_ORIGIN: serverUrl,
      ROOM_SNAPSHOT_PATH: snapshotPath,
      ZY_ENABLE_SMALL_TEST_ROOMS: "1"
    },
    windowsHide: true,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    await waitForUrl(`${serverUrl}/health`, 20_000);
  } catch (error) {
    stopProcessTree(child);
    throw new Error(`${error.message}\n${output.slice(-4000)}`);
  }
  return child;
}

async function connect() {
  const nextSocket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  await once(nextSocket, "server_status", 8_000);
  return nextSocket;
}

async function createFourPlayerGame(activeSocket) {
  const createdPromise = once(activeSocket, "room_created", 8_000);
  activeSocket.emit("create_room", { playerName: "RestartQA" });
  const created = await createdPromise;
  for (let playerCount = 2; playerCount <= 4; playerCount += 1) {
    const roomState = once(activeSocket, "room_state", 8_000, (room) => room.players.length === playerCount);
    activeSocket.emit("add_test_bots", created);
    await roomState;
  }
  const firstState = once(activeSocket, "game_state", 12_000);
  activeSocket.emit("start_game", created);
  return { created, state: await firstState };
}

async function reachHumanAction(activeSocket, created, initialState) {
  const deadline = Date.now() + 35_000;
  let state = initialState;
  while (Date.now() < deadline) {
    if (state.phase === "ROLE_ACTION" && state.currentTurnPlayerId === created.playerId) return state;
    if (state.phase === "ROLE_SELECTION" && state.roleSelectionTurnPlayerId === created.playerId) {
      const roleId = state.availableRoles[0]?.id;
      if (!roleId) throw new Error("No role available during restart smoke test.");
      const nextState = once(activeSocket, "game_state", 12_000);
      const ack = await emitWithAck(activeSocket, "select_role", { ...created, roleId });
      if (!ack?.ok) throw new Error(ack?.error || "Role selection failed.");
      state = await nextState;
      continue;
    }
    state = await once(activeSocket, "game_state", 12_000);
  }
  throw new Error(`Human action turn was not reached: ${JSON.stringify(summarize(state))}`);
}

function once(activeSocket, event, timeoutMs, predicate = () => true) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      activeSocket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      activeSocket.off(event, handler);
      resolvePromise(payload);
    }
    activeSocket.on(event, handler);
  });
}

function emitWithAck(activeSocket, event, payload) {
  return new Promise((resolvePromise) => activeSocket.emit(event, payload, resolvePromise));
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
  child.unref();
}

function summarize(state) {
  return {
    roomId: state.roomId,
    phase: state.phase,
    round: state.currentRound,
    currentTurnPlayerId: state.currentTurnPlayerId
  };
}

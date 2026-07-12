import { io } from "socket.io-client";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

function waitFor(socket, event, predicate = () => true, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event} at ${serverUrl}.`));
    }, timeoutMs);
    function onEvent(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    }
    socket.on(event, onEvent);
  });
}

function emitCommand(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (result) => {
      if (result?.ok) resolve(result);
      else reject(new Error(result?.error || `${event} failed`));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  try {
    await waitFor(socket, "server_status");
    const createdPromise = waitFor(socket, "room_created");
    socket.emit("create_room", { playerName: "FlowTester" });
    const created = await createdPromise;

    let roomState = await waitFor(socket, "room_state", (room) => room.roomCode === created.roomCode);
    while (roomState.players.length < 4) {
      const expected = roomState.players.length + 1;
      const nextRoomPromise = waitFor(
        socket,
        "room_state",
        (room) => room.roomCode === created.roomCode && room.players.length === expected
      );
      socket.emit("add_test_bots", created);
      roomState = await nextRoomPromise;
    }

    assert(roomState.players.length === 4, "Expected one human and three bots.");
    assert(roomState.players.filter((player) => player.isBot).length === 3, "Expected three bots.");
    assert(roomState.players.every((player) => player.isHost || player.isReady), "Expected every non-host player ready.");

    const startedPromise = waitFor(socket, "game_state", (state) => state.roomId === created.roomCode);
    socket.emit("start_game", created);
    let state = await startedPromise;
    const deadline = Date.now() + 90_000;

    while (!(state.phase === "ROLE_ACTION" && state.currentTurnPlayerId === created.playerId)) {
      if (Date.now() > deadline) throw new Error("Formal four-player smoke did not reach the human action turn.");
      if (state.phase === "ROLE_SELECTION" && state.roleSelectionTurnPlayerId === created.playerId) {
        const roleId = state.availableRoles[0]?.id;
        assert(roleId, "Expected an available role.");
        const nextState = waitFor(socket, "game_state", (next) => next !== state);
        await emitCommand(socket, "select_role", { ...created, roleId });
        state = await nextState;
      } else {
        state = await waitFor(socket, "game_state", (next) => next !== state);
      }
    }

    const self = state.players.find((player) => player.id === created.playerId);
    const opponent = state.players.find((player) => player.id !== created.playerId);
    assert(Array.isArray(self?.hand), "Expected the local hand to be visible.");
    assert(!Array.isArray(opponent?.hand), "Expected opponent hands to stay hidden.");

    const goldBefore = self.gold;
    const afterGoldPromise = waitFor(socket, "game_state", (next) =>
      next.turnState?.resourceActionTaken === true &&
      next.players.find((player) => player.id === created.playerId)?.gold === goldBefore + 2
    );
    await emitCommand(socket, "take_gold", created);
    state = await afterGoldPromise;
    const afterEndPromise = waitFor(socket, "game_state", (next) => next.currentTurnPlayerId !== created.playerId);
    await emitCommand(socket, "end_turn", created);
    state = await afterEndPromise;

    console.log(JSON.stringify({
      ok: true,
      roomCode: created.roomCode,
      players: state.players.length,
      bots: state.players.filter((player) => player.isBot).length,
      completedHumanTurn: true,
      deckCount: state.districtDeckCount
    }));
  } finally {
    socket.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

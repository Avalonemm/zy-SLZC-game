import { io } from "socket.io-client";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

function waitFor(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        socket.off(event, onEvent);
        reject(
          new Error(
            `Timed out waiting for ${event}. Please start the backend at ${serverUrl} first.`
          )
        );
      },
      timeoutMs
    );

    const onEvent = (payload) => {
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
    };

    socket.on(event, onEvent);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });

  socket.on("error_message", (message) => {
    throw new Error(`Server error: ${message}`);
  });

  try {
    await waitFor(socket, "server_status");

    const createdPromise = waitFor(socket, "room_created");
    const firstRoomStatePromise = waitFor(socket, "room_state");
    socket.emit("create_room", { playerName: "FlowTester" });
    const created = await createdPromise;
    await firstRoomStatePromise;

    const firstBotRoomStatePromise = waitFor(
      socket,
      "room_state",
      (room) => room.roomCode === created.roomCode && room.players.length === 2
    );
    socket.emit("add_test_bots", created);
    const firstBotRoomState = await firstBotRoomStatePromise;
    const firstBot = firstBotRoomState.players.find((player) => player.isBot);
    assert(firstBot, "Expected a test bot after adding one.");

    const removedBotRoomStatePromise = waitFor(
      socket,
      "room_state",
      (room) => room.roomCode === created.roomCode && room.players.length === 1
    );
    socket.emit("remove_test_bot", {
      ...created,
      targetBotPlayerId: firstBot.id
    });
    const removedBotRoomState = await removedBotRoomStatePromise;
    assert(
      removedBotRoomState.players.every((player) => !player.isBot),
      "Expected remove_test_bot to remove the selected test bot."
    );

    const botRoomStatePromise = waitFor(
      socket,
      "room_state",
      (room) => room.roomCode === created.roomCode && room.players.length === 2
    );
    socket.emit("add_test_bots", created);
    const botRoomState = await botRoomStatePromise;

    assert(botRoomState.players.length === 2, "Expected one human and one test bot.");
    assert(botRoomState.players.every((player) => player.isReady), "Expected all players ready.");
    assert(botRoomState.maxPlayers >= 2, "Expected room maxPlayers to be present.");

    const gameStatePromise = waitFor(
      socket,
      "game_state",
      (state) => state.roomId === created.roomCode && state.players.length === 2
    );
    socket.emit("start_game", created);
    const gameState = await gameStatePromise;

    const self = gameState.players.find((player) => player.id === created.playerId);
    const other = gameState.players.find((player) => player.id !== created.playerId);

    assert(self, "Expected self player in game state.");
    assert(other, "Expected another player in game state.");
    assert(Array.isArray(self.hand), "Expected self hand to be visible.");
    assert(!Array.isArray(other.hand), "Expected other player hand to be hidden.");
    assert(typeof other.handCount === "number", "Expected other player handCount.");
    assert(typeof gameState.districtDeckCount === "number", "Expected deck count instead of deck list.");
    assert(!Object.hasOwn(gameState, "districtDeck"), "Expected districtDeck to be hidden.");

    console.log(
      JSON.stringify({
        ok: true,
        roomCode: created.roomCode,
        playerId: created.playerId,
        phase: gameState.phase,
        players: gameState.players.length,
        deckCount: gameState.districtDeckCount
      })
    );
  } finally {
    socket.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

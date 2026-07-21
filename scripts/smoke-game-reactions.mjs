import { io } from "socket.io-client";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

function waitFor(socket, event, predicate = () => true, timeoutMs = 12_000) {
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

function expectNoEvent(socket, event, timeoutMs = 450) {
  return new Promise((resolve, reject) => {
    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(new Error(`Unexpected ${event}: ${JSON.stringify(payload)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, timeoutMs);
    socket.on(event, onEvent);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function connect() {
  const socket = io(serverUrl, { transports: ["websocket"], forceNew: true });
  await waitFor(socket, "server_status");
  return socket;
}

async function main() {
  const sockets = [];
  let host;
  let guest;
  let outsider;
  let reconnectedGuest;
  try {
    host = await connect();
    guest = await connect();
    outsider = await connect();
    sockets.push(host, guest, outsider);

    const createdPromise = waitFor(host, "room_created");
    const createdRoomPromise = waitFor(host, "room_state");
    host.emit("create_room", { playerName: "ReactionHost" });
    const created = await createdPromise;
    let roomState = await createdRoomPromise;

    const joinedPromise = waitFor(guest, "joined_room");
    const twoPlayersPromise = waitFor(host, "room_state", (room) =>
      room.roomCode === created.roomCode && room.players.length === 2
    );
    guest.emit("join_room", { roomCode: created.roomCode, playerName: "ReactionGuest" });
    const joined = await joinedPromise;
    roomState = await twoPlayersPromise;

    const readyPromise = waitFor(host, "room_state", (room) =>
      room.roomCode === created.roomCode &&
      room.players.find((player) => player.id === joined.playerId)?.isReady === true
    );
    guest.emit("set_ready", { roomCode: created.roomCode, playerId: joined.playerId, isReady: true });
    roomState = await readyPromise;

    while (roomState.players.length < 4) {
      const expected = roomState.players.length + 1;
      const nextRoom = waitFor(host, "room_state", (room) =>
        room.roomCode === created.roomCode && room.players.length === expected
      );
      host.emit("add_test_bots", created);
      roomState = await nextRoom;
    }

    const startedRoomPromise = waitFor(host, "room_state", (room) =>
      room.roomCode === created.roomCode && room.status === "STARTED"
    );
    const startedGamePromise = waitFor(host, "game_state", (state) => state.roomId === created.roomCode);
    host.emit("start_game", created);
    const startedRoom = await startedRoomPromise;
    await startedGamePromise;

    const identityEventPromise = waitFor(host, "reaction_event", (event) => event.reaction === "nice");
    guest.emit("send_reaction", {
      roomCode: created.roomCode,
      reaction: "nice",
      playerId: created.playerId
    });
    const identityEvent = await identityEventPromise;
    assert(identityEvent.playerId === joined.playerId, "Server must derive the reaction sender from the guest socket.");

    for (const reaction of ["upset", "danger"]) {
      const eventPromise = waitFor(host, "reaction_event", (event) =>
        event.playerId === joined.playerId && event.reaction === reaction
      );
      guest.emit("send_reaction", { roomCode: created.roomCode, reaction });
      await eventPromise;
    }

    const invalidError = waitFor(host, "error_message", (payload) => payload.message.includes("无效"));
    host.emit("send_reaction", { roomCode: created.roomCode, reaction: "custom-text" });
    await invalidError;

    const outsiderError = waitFor(outsider, "error_message", (payload) => payload.message.includes("身份"));
    outsider.emit("send_reaction", { roomCode: created.roomCode, reaction: "nice" });
    await outsiderError;

    guest.disconnect();
    reconnectedGuest = await connect();
    sockets.push(reconnectedGuest);
    const noReplay = expectNoEvent(reconnectedGuest, "reaction_event");
    const restoredPromise = waitFor(reconnectedGuest, "reconnected_room", (payload) => payload.roomCode === created.roomCode);
    const restoredRoomPromise = waitFor(reconnectedGuest, "room_state", (room) => room.roomCode === created.roomCode);
    const restoredGamePromise = waitFor(reconnectedGuest, "game_state", (state) => state.roomId === created.roomCode);
    reconnectedGuest.emit("reconnect_room", joined);
    await restoredPromise;
    const restoredRoom = await restoredRoomPromise;
    const restoredGame = await restoredGamePromise;
    await noReplay;

    const rateErrorPromise = waitFor(reconnectedGuest, "error_message", (payload) => payload.message.includes("频繁"));
    const noFourthBroadcast = expectNoEvent(host, "reaction_event");
    reconnectedGuest.emit("send_reaction", { roomCode: created.roomCode, reaction: "close" });
    await rateErrorPromise;
    await noFourthBroadcast;

    const serializedState = JSON.stringify({ room: restoredRoom, game: restoredGame });
    assert(restoredRoom.chatMessages.length === startedRoom.chatMessages.length, "Reactions must not enter chat history.");
    assert(!serializedState.includes("reaction_event"), "Reactions must not enter reconnect state.");
    assert(!serializedState.includes("漂亮") && !serializedState.includes("危险"), "Reaction labels must not enter room or game logs.");

    console.log(JSON.stringify({
      ok: true,
      roomCode: created.roomCode,
      senderBoundToSocket: true,
      acceptedWithinWindow: 3,
      fourthRejectedAfterReconnect: true,
      reconnectReplay: false
    }));
  } finally {
    for (const socket of sockets) socket?.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

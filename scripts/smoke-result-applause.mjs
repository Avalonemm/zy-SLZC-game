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

function qaConfigure(socket, payload) {
  return new Promise((resolve, reject) => {
    socket.emit("qa_configure_game", payload, (result) => {
      if (result?.ok) resolve(result);
      else reject(new Error(result?.error || "QA result fixture failed"));
    });
  });
}

async function main() {
  const sockets = [];
  try {
    const host = await connect();
    const guest = await connect();
    const outsider = await connect();
    sockets.push(host, guest, outsider);

    const createdPromise = waitFor(host, "room_created");
    const firstRoomPromise = waitFor(host, "room_state");
    host.emit("create_room", { playerName: "ResultHost" });
    const created = await createdPromise;
    let room = await firstRoomPromise;

    const joinedPromise = waitFor(guest, "joined_room");
    const joinedRoomPromise = waitFor(host, "room_state", (state) => state.players.length === 2);
    guest.emit("join_room", { roomCode: created.roomCode, playerName: "ResultGuest" });
    const joined = await joinedPromise;
    room = await joinedRoomPromise;

    const readyPromise = waitFor(host, "room_state", (state) =>
      state.players.find((player) => player.id === joined.playerId)?.isReady === true
    );
    guest.emit("set_ready", { roomCode: created.roomCode, playerId: joined.playerId, isReady: true });
    room = await readyPromise;

    while (room.players.length < 4) {
      const expected = room.players.length + 1;
      const nextRoom = waitFor(host, "room_state", (state) => state.players.length === expected);
      host.emit("add_test_bots", created);
      room = await nextRoom;
    }
    const botTarget = room.players.find((player) => player.isBot);

    const startedHost = waitFor(host, "game_state", (state) => state.roomId === created.roomCode);
    const startedGuest = waitFor(guest, "game_state", (state) => state.roomId === created.roomCode);
    host.emit("start_game", created);
    await Promise.all([startedHost, startedGuest]);

    const endedHost = waitFor(host, "game_state", (state) => state.phase === "ENDED");
    const endedGuest = waitFor(guest, "game_state", (state) => state.phase === "ENDED");
    await qaConfigure(host, { ...created, cityCount: 5, finishGame: true });
    const [hostResult, guestResult] = await Promise.all([endedHost, endedGuest]);
    assert(hostResult.resultSummary?.resultId, "Expected a structured result summary.");
    assert(guestResult.resultSummary?.viewerApplaudedTargetIds.length === 0, "Applause should start empty.");

    const applauseEvent = waitFor(host, "result_applause_event", (event) => event.targetPlayerId === created.playerId);
    guest.emit("send_result_applause", {
      roomCode: created.roomCode,
      targetPlayerId: created.playerId,
      senderPlayerId: created.playerId
    });
    const firstApplause = await applauseEvent;
    assert(firstApplause.senderPlayerId === joined.playerId, "Server must derive applause sender from the socket.");
    assert(firstApplause.totalCount === 1, "First applause should publish count one.");

    const duplicateError = waitFor(guest, "error_message", (payload) => payload.message.includes("已经"));
    guest.emit("send_result_applause", { roomCode: created.roomCode, targetPlayerId: created.playerId });
    await duplicateError;

    const selfError = waitFor(host, "error_message", (payload) => payload.message.includes("自己"));
    host.emit("send_result_applause", { roomCode: created.roomCode, targetPlayerId: created.playerId });
    await selfError;

    const botError = waitFor(host, "error_message", (payload) => payload.message.includes("机器人"));
    host.emit("send_result_applause", { roomCode: created.roomCode, targetPlayerId: botTarget.id });
    await botError;

    const outsiderError = waitFor(outsider, "error_message");
    outsider.emit("send_result_applause", { roomCode: created.roomCode, targetPlayerId: created.playerId });
    await outsiderError;

    guest.disconnect();
    const reconnectedGuest = await connect();
    sockets.push(reconnectedGuest);
    const noReplay = expectNoEvent(reconnectedGuest, "result_applause_event");
    const restored = waitFor(reconnectedGuest, "game_state", (state) => state.phase === "ENDED");
    reconnectedGuest.emit("reconnect_room", joined);
    const restoredState = await restored;
    await noReplay;
    assert(restoredState.resultSummary.applauseCounts[created.playerId] === 1, "Reconnect must retain public applause count.");
    assert(restoredState.resultSummary.viewerApplaudedTargetIds.includes(created.playerId), "Reconnect must retain the viewer's own applause target.");
    assert(!("resultApplauseBySender" in restoredState), "Reconnect state must not expose the applause relation map.");

    console.log(JSON.stringify({
      ok: true,
      roomCode: created.roomCode,
      senderBoundToSocket: true,
      duplicateRejected: true,
      selfAndBotRejected: true,
      reconnectRetained: true,
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

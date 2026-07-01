import { io } from "socket.io-client";

const serverUrl = process.env.SERVER_URL ?? "http://localhost:3000";

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out waiting for ${event}. Please start the backend at ${serverUrl} first.`
          )
        ),
      timeoutMs
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  const first = io(serverUrl, { transports: ["websocket"], forceNew: true });
  const firstStatus = await once(first, "server_status");
  first.emit("create_room", { playerName: "ReconnectTester" });
  const created = await once(first, "room_created");
  await once(first, "room_state");
  first.disconnect();

  await new Promise((resolve) => setTimeout(resolve, 250));

  const second = io(serverUrl, { transports: ["websocket"], forceNew: true });
  await once(second, "server_status");
  second.emit("reconnect_room", created);
  const restoredStatus = await once(second, "server_status");
  const restored = await once(second, "reconnected_room");
  const roomState = await once(second, "room_state");

  if (restored.playerId !== created.playerId || restored.roomCode !== created.roomCode) {
    throw new Error("Reconnect identity mismatch.");
  }

  const player = roomState.players.find((candidate) => candidate.id === created.playerId);
  if (
    !player ||
    !player.connected ||
    player.uid !== firstStatus.uid ||
    restoredStatus.uid !== firstStatus.uid
  ) {
    throw new Error("Reconnect room state mismatch.");
  }

  second.emit("leave_room", created);
  second.disconnect();
  console.log(
    JSON.stringify({
      ok: true,
      roomCode: created.roomCode,
      playerId: created.playerId,
      uid: restoredStatus.uid
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

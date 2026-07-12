import type { GameRoom, RoomState } from "@zy/shared";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RoomManagerSnapshot = {
  version: 1;
  savedAt: string;
  rooms: RoomState[];
  gameRooms: GameRoom[];
  reconnectTokens: Array<[string, string]>;
};

export function createRoomSnapshotStore() {
  const snapshotPath = resolve(
    process.env.ROOM_SNAPSHOT_PATH ?? resolve(process.cwd(), ".runtime/active-rooms.json")
  );

  function load(): RoomManagerSnapshot | undefined {
    if (!existsSync(snapshotPath)) return undefined;
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as RoomManagerSnapshot;
      if (snapshot.version !== 1 || !Array.isArray(snapshot.rooms) || !Array.isArray(snapshot.gameRooms)) {
        throw new Error("snapshot shape is invalid");
      }
      for (const room of snapshot.rooms) {
        for (const player of room.players) player.connected = false;
        room.startCountdown = null;
      }
      for (const gameRoom of snapshot.gameRooms) {
        for (const player of gameRoom.players) player.connected = false;
      }
      return snapshot;
    } catch (error) {
      console.error("[snapshot] failed to load active rooms", error);
      return undefined;
    }
  }

  function save(snapshot: RoomManagerSnapshot) {
    try {
      mkdirSync(dirname(snapshotPath), { recursive: true });
      const temporaryPath = `${snapshotPath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify(snapshot), "utf8");
      renameSync(temporaryPath, snapshotPath);
    } catch (error) {
      console.error("[snapshot] failed to save active rooms", error);
    }
  }

  return { load, save, snapshotPath };
}

import type { GameRoom, RoomState } from "@zy/shared";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { enabledRoleCards } from "./rolePool";

export type RoomManagerSnapshot = {
  version: 2;
  savedAt: string;
  rooms: RoomState[];
  gameRooms: GameRoom[];
  reconnectTokens: Array<[string, string]>;
};

type StoredGameRoom = Omit<GameRoom, "calledRoleIds" | "roleCallState"> &
  Partial<Pick<GameRoom, "calledRoleIds" | "roleCallState">>;

type StoredSnapshot = Omit<RoomManagerSnapshot, "version" | "gameRooms"> & {
  version: 1 | 2;
  gameRooms: StoredGameRoom[];
};

export function createRoomSnapshotStore() {
  const snapshotPath = resolve(
    process.env.ROOM_SNAPSHOT_PATH ?? resolve(process.cwd(), ".runtime/active-rooms.json")
  );

  function load(): RoomManagerSnapshot | undefined {
    if (!existsSync(snapshotPath)) return undefined;
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as StoredSnapshot;
      if (
        ![1, 2].includes(snapshot.version) ||
        !Array.isArray(snapshot.rooms) ||
        !Array.isArray(snapshot.gameRooms)
      ) {
        throw new Error("snapshot shape is invalid");
      }
      for (const room of snapshot.rooms) {
        for (const player of room.players) player.connected = false;
        room.startCountdown = null;
      }
      const gameRooms = snapshot.gameRooms.map((storedRoom) => migrateGameRoom(storedRoom));
      for (const gameRoom of gameRooms) {
        for (const player of gameRoom.players) player.connected = false;
      }
      return {
        version: 2,
        savedAt: snapshot.savedAt,
        rooms: snapshot.rooms,
        gameRooms,
        reconnectTokens: snapshot.reconnectTokens
      };
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

function migrateGameRoom(storedRoom: StoredGameRoom): GameRoom {
  const gameRoom = storedRoom as GameRoom;
  gameRoom.roleCallState ??= null;
  gameRoom.calledRoleIds ??= inferCalledRoleIds(gameRoom);
  return gameRoom;
}

function inferCalledRoleIds(gameRoom: GameRoom) {
  const activeRoles = enabledRoleCards(gameRoom.settings, gameRoom.players.length);
  if (gameRoom.phase === "ENDED" || gameRoom.phase === "SCORING" || gameRoom.phase === "ROUND_END") {
    return activeRoles.map((role) => role.id);
  }

  if (gameRoom.phase === "ROLE_CALL" && gameRoom.roleCallState) {
    const callOrder = activeRoles.find((role) => role.id === gameRoom.roleCallState?.roleId)?.order;
    if (callOrder === undefined) return [];
    const includeCurrent = gameRoom.roleCallState.stage !== "calling";
    return activeRoles
      .filter((role) => role.order < callOrder || (includeCurrent && role.order === callOrder))
      .map((role) => role.id);
  }

  if (gameRoom.phase !== "ROLE_ACTION") {
    return [];
  }

  const currentRoleId = gameRoom.players.find(
    (player) => player.id === gameRoom.currentTurnPlayerId
  )?.selectedRoleId;
  const publicRoleIds = [...gameRoom.completedRoleIds, ...(currentRoleId ? [currentRoleId] : [])];
  const highestCalledOrder = Math.max(
    0,
    ...publicRoleIds.map((roleId) => activeRoles.find((role) => role.id === roleId)?.order ?? 0)
  );
  return activeRoles
    .filter((role) => role.order <= highestCalledOrder)
    .map((role) => role.id);
}

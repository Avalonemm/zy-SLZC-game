import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@zy/shared";

const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const sameOriginServerUrl =
  typeof window === "undefined" ? "" : window.location.origin;
const serverUrl = configuredServerUrl || sameOriginServerUrl;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  serverUrl,
  {
    autoConnect: false,
    transports: ["websocket", "polling"]
  }
);

export { serverUrl };

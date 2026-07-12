import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@zy/shared";

const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const sameOriginServerUrl =
  typeof window === "undefined" ? "" : window.location.origin;
const localDevelopmentServerUrl =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  window.location.hostname === "127.0.0.1" &&
  window.location.port === "5173"
    ? "http://127.0.0.1:3000"
    : sameOriginServerUrl;
const serverUrl = configuredServerUrl || localDevelopmentServerUrl;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  serverUrl,
  {
    autoConnect: false,
    transports: ["websocket", "polling"]
  }
);

export { serverUrl };

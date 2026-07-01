import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "@zy/shared";
import { registerSocketHandlers } from "./socket/registerSocketHandlers";

const port = Number(process.env.PORT || 3000);
const configuredClientOrigins = (process.env.CLIENT_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const developmentClientOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const allowedClientOrigins =
  process.env.NODE_ENV === "production"
    ? configuredClientOrigins
    : [...configuredClientOrigins, ...developmentClientOrigins];

const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return true;
  }

  return allowedClientOrigins.includes(origin);
};

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    }
  })
);
app.use(express.json());

const healthHandler = (_request: express.Request, response: express.Response) => {
  response.json({
    ok: true,
    service: "zy-board-game-server",
    time: new Date().toISOString()
  });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST"]
  }
});

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`[server] HTTP + Socket.IO listening on http://localhost:${port}`);
  console.log(
    `[server] Accepting client origins: ${allowedClientOrigins.join(", ") || "none configured"}`
  );
});

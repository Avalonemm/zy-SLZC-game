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

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();

app.use(cors({ origin: clientOrigin }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "zy-board-game-server",
    time: new Date().toISOString()
  });
});

const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: clientOrigin,
    methods: ["GET", "POST"]
  }
});

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`[server] HTTP + Socket.IO listening on http://localhost:${port}`);
  console.log(`[server] Accepting client origin: ${clientOrigin}`);
});

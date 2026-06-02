import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import roomsRoutes from "./routes/rooms.routes.js";
import userRoutes from "./routes/user.routes.js";
import { authenticate } from "./middlewares/auth.middleware.js";

import roomsSocket from "./sockets/rooms.socket.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/*
Health check
*/
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/*
Routes
*/
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/user", userRoutes);

/*
Protected test route
*/
app.get("/api/profile", authenticate, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user,
  });
});

/*
HTTP Server
*/
const server = http.createServer(app);

/*
Socket.IO
*/
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

/*
Socket registration
*/
roomsSocket(io);

/*
Server Start
*/
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor RetroLink activo en puerto ${PORT}`);
});

export { io };

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import roomsRoutes from "./routes/rooms.routes.js";
import { authenticate } from "./middlewares/auth.middleware.js";

dotenv.config();

// 1️⃣ Crear app primero
const app = express();

app.use(cors());
app.use(express.json());

// 2️⃣ Rutas públicas
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomsRoutes);

// 3️⃣ Ruta protegida
app.get("/api/profile", authenticate, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user
  });
});

// 4️⃣ Servidor HTTP
const server = http.createServer(app);

// 5️⃣ Socket.io
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("message", (data) => {
    console.log("Mensaje recibido:", data);
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

// 6️⃣ Puerto
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Servidor RetroLink activo en puerto ${PORT}`);
});
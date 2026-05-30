import express from "express";
import crypto from "crypto";
import { authenticate } from "../middlewares/auth.middleware.js";
import { io } from "../index.js";

const router = express.Router();

/*
Memoria temporal
Más adelante esto va a BD
*/
const rooms = [];

/*
Crear room
POST /api/rooms
*/
router.post("/", authenticate, (req, res) => {
  const { name, game } = req.body;

  if (!name || !game) {
    return res.status(400).json({
      message: "Name and game are required"
    });
  }

  const room = {
    id: crypto.randomUUID(),
    name,
    game,
    hostId: req.user.userId,
    players: [
      {
        userId: req.user.userId,
        isHost: true,
        ready: false
      }
    ],
    maxPlayers: 8,
    status: "waiting",
    createdAt: new Date()
  };

  rooms.push(room);

  res.status(201).json(room);
});

/*
Listar rooms
GET /api/rooms
GET /api/rooms?game=quake3
*/
router.get("/", authenticate, (req, res) => {
  const { game } = req.query;

  if (game) {
    return res.json(
      rooms.filter((room) => room.game === game)
    );
  }

  res.json(rooms);
});

/*
Obtener room por ID
GET /api/rooms/:id
*/
router.get("/:id", authenticate, (req, res) => {
  const room = rooms.find(
    (room) => room.id === req.params.id
  );

  if (!room) {
    return res.status(404).json({
      message: "Room not found"
    });
  }

  res.json(room);
});

/*
Entrar a una room
POST /api/rooms/:id/join
*/
router.post("/:id/join", authenticate, (req, res) => {
  const room = rooms.find(
    (room) => room.id === req.params.id
  );

  if (!room) {
    return res.status(404).json({
      message: "Room not found"
    });
  }

  if (room.players.length >= room.maxPlayers) {
    return res.status(400).json({
      message: "Room is full"
    });
  }

  const alreadyJoined = room.players.find(
    (player) => player.userId === req.user.userId
  );

  if (!alreadyJoined) {
    room.players.push({
      userId: req.user.userId,
      isHost: false,
      ready: false
    });
  }

  res.json(room);
});

/*
Cambiar estado ready
POST /api/rooms/:id/ready
*/
router.post("/:id/ready", authenticate, (req, res) => {
  const { ready } = req.body;

  const room = rooms.find(
    (room) => room.id === req.params.id
  );

  if (!room) {
    return res.status(404).json({
      message: "Room not found"
    });
  }

  const player = room.players.find(
    (player) => player.userId === req.user.userId
  );

  if (!player) {
    return res.status(404).json({
      message: "Player not found in room"
    });
  }

  player.ready = Boolean(ready);

  const allPlayersReady =
    room.players.length > 0 &&
    room.players.every((player) => player.ready);

  room.status = allPlayersReady
    ? "ready"
    : "waiting";

  res.json(room);
});

/*
Iniciar partida
POST /api/rooms/:id/start
Solo host puede iniciar
Todos deben estar ready
*/
router.post("/:id/start", authenticate, (req, res) => {
  const room = rooms.find(
    (room) => room.id === req.params.id
  );

  if (!room) {
    return res.status(404).json({
      message: "Room not found"
    });
  }

  if (room.hostId !== req.user.userId) {
    return res.status(403).json({
      message: "Only host can start the match"
    });
  }

  const allPlayersReady =
    room.players.length > 0 &&
    room.players.every((player) => player.ready);

  if (!allPlayersReady) {
    return res.status(400).json({
      message: "Not all players are ready"
    });
  }

  room.status = "in-game";
  room.startedAt = new Date();

  res.json(room);
});

export default router;
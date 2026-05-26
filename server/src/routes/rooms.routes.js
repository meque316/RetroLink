import express from "express";
import { authenticate } from "../middlewares/auth.middleware.js";

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
        isHost: true
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
Listar rooms por juego
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

  const alreadyJoined = room.players.find(
    (player) => player.userId === req.user.userId
  );

  if (!alreadyJoined) {
    room.players.push({
      userId: req.user.userId,
      isHost: false
    });
  }

  res.json(room);
});

export default router;
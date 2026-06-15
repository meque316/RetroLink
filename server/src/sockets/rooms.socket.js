import crypto from "crypto";

const rooms = [];
const readyStates = {};
const onlineUsers = {};

export default function roomsSocket(io) {
  io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id);

    /*
    USERNAME FROM LOGIN
    */
    const user = {
      username:
        socket.handshake.auth?.username ||
        `Player-${socket.id.slice(0, 5)}`,
      role:
        socket.handshake.auth?.role || "USER",
      avatar:
        socket.handshake.auth?.avatar || "",
    };

    onlineUsers[socket.id] = user;

    // Notificar a todos (incluyendo al nuevo) el listado actualizado de usuarios
    io.emit("users-online", Object.values(onlineUsers));
    socket.emit("rooms-list", rooms);

    /*
    GET ROOMS
    */
    socket.on("get-rooms", () => {
      socket.emit("rooms-list", rooms);
    });

    /*
    GET ONLINE USERS
    */
    socket.on("get-users-online", () => {
      socket.emit("users-online", Object.values(onlineUsers));
    });

    /*
    CREATE ROOM
    */
    socket.on("create-room", (roomData) => {
      const room = {
        id: crypto.randomUUID(),
        name: roomData.name,
        game: roomData.game,
        host: socket.id,
        hostPublicIp: roomData.hostPublicIp || null,
        members: [{ id: socket.id, username: user.username }],
        players: 1,
      };

      rooms.push(room);
      readyStates[room.id] = [];
      socket.join(room.id);

      console.log(`Room creada: ${room.name}`);

      io.emit("rooms-list", rooms);
      io.to(room.id).emit("room-ready-state", readyStates[room.id]);
    });

    /*
    JOIN ROOM
    */
    socket.on("join-room", (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;

      const alreadyInside = room.members.some((m) => m.id === socket.id);
      if (alreadyInside) return;

      room.members.push({
        id: socket.id,
        username: onlineUsers[socket.id]?.username,
      });
      room.players = room.members.length;
      socket.join(roomId);

      socket.emit("host-peer-info", {
        roomId: room.id,
        hostSocketId: room.host,
        hostPublicIp: room.hostPublicIp,
      });

      io.emit("rooms-list", rooms);
      io.to(roomId).emit("room-ready-state", readyStates[roomId] || []);
    });

    /*
    TOGGLE READY
    */
    socket.on("toggle-ready", (roomId) => {
      if (!readyStates[roomId]) {
        readyStates[roomId] = [];
      }

      const alreadyReady = readyStates[roomId].includes(socket.id);

      if (alreadyReady) {
        readyStates[roomId] = readyStates[roomId].filter(
          (id) => id !== socket.id
        );
      } else {
        readyStates[roomId].push(socket.id);
      }

      io.to(roomId).emit("room-ready-state", readyStates[roomId]);
    });

    /*
    START MATCH
    */
    socket.on("start-match", (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      if (room.host !== socket.id) return;

      const readyPlayers = readyStates[roomId] || [];
      const everyoneReady = room.members.every((m) =>
        readyPlayers.includes(m.id)
      );

      if (!everyoneReady) {
        socket.emit("match-error", {
          message: "All players must be ready before starting.",
        });
        return;
      }

      io.to(roomId).emit("match-started", {
        roomId,
        hostPublicIp: room.hostPublicIp,
      });
    });

    /*
    ROOM CHAT
    */
    socket.on("room-chat", ({ roomId, message, username }) => {
      io.to(roomId).emit("room-chat", {
        username,
        message,
        timestamp: Date.now(),
      });
    });

    /*
    WEBRTC SIGNALING
    */
    socket.on("webrtc-join", ({ roomId, isHost }) => {
      console.log(`[WebRTC] ${socket.id} sincronizando señales en la sala principal ${roomId} como ${isHost ? "HOST" : "CLIENT"}`);

      if (!isHost) {
        socket.to(roomId).emit("webrtc-peer-ready");
        console.log(`[WebRTC] Notificado host de que el cliente está listo en la sala principal: ${roomId}`);
      }
    });

    socket.on("webrtc-signal", ({ roomId, ...signal }) => {
      socket.to(roomId).emit("webrtc-signal", signal);
    });

    /*
    RENAME ROOM
    */
    socket.on("rename-room", ({ roomId, name }) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;
      if (room.host !== socket.id) return;

      room.name = name.trim();
      io.emit("rooms-list", rooms);
    });

    /*
    LEAVE ROOM
    */
    socket.on("leave-room", (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;

      room.members = room.members.filter((m) => m.id !== socket.id);
      room.players = room.members.length;

      if (readyStates[roomId]) {
        readyStates[roomId] = readyStates[roomId].filter(
          (id) => id !== socket.id
        );
      }

      socket.leave(roomId);

      if (room.members.length === 0) {
        const index = rooms.findIndex((r) => r.id === roomId);
        if (index !== -1) rooms.splice(index, 1);
        delete readyStates[roomId];
        io.emit("rooms-list", rooms);
        return;
      }

      // CORRECCIÓN: Si el host se va, asignamos el nuevo y enviamos la info actualizada de inmediato
      if (room.host === socket.id) {
        room.host = room.members[0]?.id;
        // Forzamos el re-envío de la información de red del nuevo host asignado

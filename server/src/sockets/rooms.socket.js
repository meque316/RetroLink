import crypto from "crypto";

const rooms = [];
const readyStates = {};
const onlineUsers = {};
const userGames = {}; // socket.id -> { gameId: boolean }

export default function roomsSocket(io) {
  io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id);

    const user = {
      username: socket.handshake.auth?.username || `Player-${socket.id.slice(0, 5)}`,
      role: socket.handshake.auth?.role || "USER",
      avatar: socket.handshake.auth?.avatar || "",
    };

    onlineUsers[socket.id] = user;
    io.emit("users-online", Object.values(onlineUsers));
    socket.emit("rooms-list", rooms);

    socket.on("get-rooms", () => socket.emit("rooms-list", rooms));
    socket.on("get-users-online", () => socket.emit("users-online", Object.values(onlineUsers)));

    /*
    REPORT GAME CONFIG - Cliente reporta qué juegos tiene configurados
    */
    socket.on("report-game-config", ({ gameId, hasGame }) => {
      if (!userGames[socket.id]) userGames[socket.id] = {};
      userGames[socket.id][gameId] = hasGame;
      console.log(`[User] ${socket.id} (${user.username}) game ${gameId} configured: ${hasGame}`);
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

      // ✅ Verificar si el usuario tiene el juego configurado
      const hasGame = userGames[socket.id]?.[room.game] || false;
      
      room.members.push({ 
        id: socket.id, 
        username: onlineUsers[socket.id]?.username,
        gameReady: hasGame // Guardar estado del juego
      });
      room.players = room.members.length;
      socket.join(roomId);

      socket.emit("host-peer-info", {
        roomId: room.id,
        hostSocketId: room.host,
        hostPublicIp: room.hostPublicIp,
      });

      // ✅ Notificar si el jugador no tiene el juego configurado
      if (!hasGame) {
        const username = onlineUsers[socket.id]?.username || "Jugador";
        io.to(roomId).emit("player-missing-game", {
          username,
          game: room.game,
          message: `${username} no tiene ${room.game} configurado en RetroLink`
        });
        console.log(`[Room] ${username} no tiene ${room.game} configurado`);
      }

      io.emit("rooms-list", rooms);
      io.to(roomId).emit("room-ready-state", readyStates[roomId] || []);
    });

    /*
    TOGGLE READY
    */
    socket.on("toggle-ready", (roomId) => {
      if (!readyStates[roomId]) readyStates[roomId] = [];

      const alreadyReady = readyStates[roomId].includes(socket.id);
      if (alreadyReady) {
        readyStates[roomId] = readyStates[roomId].filter((id) => id !== socket.id);
      } else {
        readyStates[roomId].push(socket.id);
      }

      io.to(roomId).emit("room-ready-state", readyStates[roomId]);
    });

    /*
    START MATCH - ✅ CON VERIFICACIÓN DE JUEGOS
    */
    socket.on("start-match", (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room || room.host !== socket.id) return;

      const readyPlayers = readyStates[roomId] || [];
      const everyoneReady = room.members.every((m) => readyPlayers.includes(m.id));

      if (!everyoneReady) {
        socket.emit("match-error", { message: "Todos los jugadores deben estar listos antes de iniciar." });
        return;
      }

      // ✅ VERIFICAR QUE TODOS TENGAN EL JUEGO CONFIGURADO
      const missingGame = room.members.filter(m => 
        !userGames[m.id]?.[room.game]
      );

      if (missingGame.length > 0) {
        const names = missingGame.map(m => m.username).join(', ');
        socket.emit("match-error", { 
          message: `❌ Los siguientes jugadores no tienen ${room.game} configurado: ${names}` 
        });
        console.log(`[Room] Inicio bloqueado: ${missingGame.length} jugador(es) sin ${room.game}`);
        return;
      }

      // ✅ Todos tienen el juego, iniciar partida
      console.log(`[Room] Iniciando partida en sala ${room.name} - todos tienen el juego`);
      io.to(roomId).emit("match-started", { roomId, hostPublicIp: room.hostPublicIp });
    });

    /*
    ROOM CHAT
    */
    socket.on("room-chat", ({ roomId, message, username }) => {
      io.to(roomId).emit("room-chat", { username, message, timestamp: Date.now() });
    });

    /*
    WEBRTC SIGNALING — MULTI-PLAYER
    */
    socket.on("webrtc-join", ({ roomId, isHost, hostIP }, ack) => {
      console.log(`[WebRTC] ${socket.id} sincronizando señales en la sala principal ${roomId} como ${isHost ? "HOST" : "CLIENT"}`);
      socket.join(`webrtc-${roomId}`);

      // Guardar si es host para poder notificarlo cuando se desconecte
      socket.data.webrtcRoomId = roomId;
      socket.data.isWebrtcHost = isHost;

      if (!isHost) {
        // Notificar al host con el socketId del cliente que llegó
        socket.to(`webrtc-${roomId}`).emit("webrtc-peer-ready", {
          fromSocketId: socket.id,
        });
        console.log(`[WebRTC] Notificado host de que el cliente ${socket.id} está listo en la sala: webrtc-${roomId}`);
      }

      if (ack) ack({ otherPeerPresent: true });
    });

    // Señales WebRTC — enrutar a un socket específico si se indica toSocketId,
    // de lo contrario broadcast a toda la sala (compatibilidad con 1v1)
    socket.on("webrtc-signal", ({ roomId, toSocketId, ...signal }) => {
      if (toSocketId) {
        // Multi-player: enviar solo al socket destino, incluyendo el origen
        io.to(toSocketId).emit("webrtc-signal", { ...signal, fromSocketId: socket.id });
      } else {
        // Fallback 1v1: broadcast a toda la sala
        socket.to(`webrtc-${roomId}`).emit("webrtc-signal", { ...signal, fromSocketId: socket.id });
      }
    });

    // Puerto asignado por el host a un cliente específico
    socket.on("webrtc-client-port", ({ roomId, port, toSocketId }) => {
      if (toSocketId) {
        io.to(toSocketId).emit("webrtc-client-port", { port });
        console.log(`[WebRTC] Host asignó puerto ${port} al cliente ${toSocketId}`);
      }
    });

    /*
    RENAME ROOM
    */
    socket.on("rename-room", ({ roomId, name }) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room || room.host !== socket.id) return;
      room.name = name.trim();
      io.emit("rooms-list", rooms);
    });

    /*
    LEAVE ROOM
    */
    socket.on("leave-room", (roomId) => {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) return;

      const wasClient = room.host !== socket.id;

      room.members = room.members.filter((m) => m.id !== socket.id);
      room.players = room.members.length;

      if (readyStates[roomId]) {
        readyStates[roomId] = readyStates[roomId].filter((id) => id !== socket.id);
      }

      socket.leave(roomId);
      socket.leave(`webrtc-${roomId}`);

      // Notificar al host que este cliente se fue
      if (wasClient) {
        socket.to(`webrtc-${roomId}`).emit("webrtc-client-left", { socketId: socket.id });
      }

      if (room.members.length === 0) {
        const index = rooms.findIndex((r) => r.id === roomId);
        if (index !== -1) rooms.splice(index, 1);
        delete readyStates[roomId];
        io.emit("rooms-list", rooms);
        return;
      }

      if (room.host === socket.id) {
        room.host = room.members[0]?.id;
      }

      io.emit("rooms-list", rooms);
      io.to(roomId).emit("room-ready-state", readyStates[roomId] || []);
    });

    /*
    DISCONNECT
    */
    socket.on("disconnect", () => {
      console.log("Usuario desconectado:", socket.id);

      // Limpiar datos de juegos del usuario
      delete userGames[socket.id];

      // Notificar al host si era un cliente WebRTC
      const webrtcRoomId = socket.data.webrtcRoomId;
      if (webrtcRoomId && !socket.data.isWebrtcHost) {
        socket.to(`webrtc-${webrtcRoomId}`).emit("webrtc-client-left", { socketId: socket.id });
      }

      delete onlineUsers[socket.id];
      io.emit("users-online", Object.values(onlineUsers));

      for (let i = rooms.length - 1; i >= 0; i--) {
        const room = rooms[i];

        room.members = room.members.filter((m) => m.id !== socket.id);
        room.players = room.members.length;

        if (readyStates[room.id]) {
          readyStates[room.id] = readyStates[room.id].filter((id) => id !== socket.id);
        }

        if (room.host === socket.id && room.members.length > 0) {
          room.host = room.members[0]?.id;
        }

        if (room.players <= 0) {
          delete readyStates[room.id];
          rooms.splice(i, 1);
        } else {
          io.to(room.id).emit("room-ready-state", readyStates[room.id] || []);
        }
      }

      io.emit("rooms-list", rooms);
    });
  });
}
import crypto from "crypto";

const rooms = [];
const readyStates = {};

export default function roomsSocket(io) {
  io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id);

    /*
    SEND ROOMS ON CONNECT
    */
    socket.emit("rooms-list", rooms);

    /*
    GET ROOMS
    */
    socket.on("get-rooms", () => {
      socket.emit("rooms-list", rooms);
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
        members: [socket.id],
        players: 1,
      };

      rooms.push(room);

      readyStates[room.id] = [];

      socket.join(room.id);

      console.log("Room creada:", room.name);

      io.emit("rooms-list", rooms);

      io.to(room.id).emit(
        "room-ready-state",
        readyStates[room.id]
      );
    });

    /*
    JOIN ROOM
    */
    socket.on("join-room", (roomId) => {
      const room = rooms.find(
        (r) => r.id === roomId
      );

      if (!room) return;

      const alreadyInside =
        room.members.includes(socket.id);

      if (alreadyInside) return;

      room.members.push(socket.id);
      room.players = room.members.length;

      socket.join(roomId);

      io.emit("rooms-list", rooms);

      io.to(roomId).emit(
        "room-ready-state",
        readyStates[roomId] || []
      );
    });

    /*
    TOGGLE READY
    */
    socket.on("toggle-ready", (roomId) => {
      if (!readyStates[roomId]) {
        readyStates[roomId] = [];
      }

      const alreadyReady =
        readyStates[roomId].includes(socket.id);

      if (alreadyReady) {
        readyStates[roomId] =
          readyStates[roomId].filter(
            (id) => id !== socket.id
          );
      } else {
        readyStates[roomId].push(socket.id);
      }

      io.to(roomId).emit(
        "room-ready-state",
        readyStates[roomId]
      );
    });

    /*
    START MATCH
    */
    socket.on("start-match", (roomId) => {
      const room = rooms.find(
        (r) => r.id === roomId
      );

      if (!room) return;

      /*
      Solo host puede iniciar
      */
      if (room.host !== socket.id) return;

      const readyPlayers =
        readyStates[roomId] || [];

      /*
      Todos deben estar ready
      */
      const everyoneReady =
        room.members.every((memberId) =>
          readyPlayers.includes(memberId)
        );

      if (!everyoneReady) {
        console.log(
          `No se puede iniciar ${room.name}: faltan jugadores ready`
        );

        socket.emit("match-error", {
          message:
            "All players must be ready before starting.",
        });

        return;
      }

      console.log(
        `Match iniciada en room ${room.name}`
      );

      io.to(roomId).emit(
        "match-started",
        {
          roomId,
        }
      );
    });

    /*
LEAVE ROOM
*/
socket.on("leave-room", (roomId) => {
  const room = rooms.find(
    (r) => r.id === roomId
  );

  if (!room) return;

  room.members = room.members.filter(
    (id) => id !== socket.id
  );

  room.players = room.members.length;

  if (readyStates[roomId]) {
    readyStates[roomId] =
      readyStates[roomId].filter(
        (id) => id !== socket.id
      );
  }

  socket.leave(roomId);

  /*
  si queda vacía → eliminar sala
  */
  if (room.members.length === 0) {
    const index = rooms.findIndex(
      (r) => r.id === roomId
    );

    if (index !== -1) {
      console.log(
        "Room eliminada:",
        room.name
      );

      rooms.splice(index, 1);
    }

    delete readyStates[roomId];

    io.emit("rooms-list", rooms);
    return;
  }

  /*
  transferir host si host salió
  */
  if (room.host === socket.id) {
    room.host = room.members[0];
  }

  io.emit("rooms-list", rooms);

  io.to(roomId).emit(
    "room-ready-state",
    readyStates[roomId] || []
  );
});

    /*
    DISCONNECT
    */
    socket.on("disconnect", () => {
      console.log(
        "Usuario desconectado:",
        socket.id
      );

      for (
        let i = rooms.length - 1;
        i >= 0;
        i--
      ) {
        const room = rooms[i];

        room.members = room.members.filter(
          (memberId) =>
            memberId !== socket.id
        );

        room.players = room.members.length;

        if (readyStates[room.id]) {
          readyStates[room.id] =
            readyStates[room.id].filter(
              (id) =>
                id !== socket.id
            );
        }

        /*
        Transfer host
        */
        if (
          room.host === socket.id &&
          room.members.length > 0
        ) {
          room.host = room.members[0];
        }

        if (room.players <= 0) {
          delete readyStates[room.id];
          rooms.splice(i, 1);
        } else {
          io.to(room.id).emit(
            "room-ready-state",
            readyStates[room.id] || []
          );
        }
      }

      io.emit("rooms-list", rooms);
    });
  });
}
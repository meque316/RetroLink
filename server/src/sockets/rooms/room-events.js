import crypto from "crypto";

import {
  onlineUsers,
  readyStates,
  rooms,
} from "../state/socket-state.js";

import {
  deleteRoom,
  emitReadyState,
  emitRoomList,
  getRoom,
  hasConfiguredGame,
  isRoomMember,
  promoteNextHost,
  removeReadyPlayer,
  removeRoomMember,
} from "./room-utils.js";

import {
  deleteRelayRoom,
  notifyRelayState,
  removeRelayParticipant,
  updateRelayHost,
} from "../relay/relay-store.js";

export function registerRoomEvents({
  io,
  socket,
  user,
}) {
  socket.on(
    "create-room",
    (roomData = {}) => {
      const name =
        typeof roomData.name ===
        "string"
          ? roomData.name.trim()
          : "";

      if (!name) {
        socket.emit(
          "room-error",
          {
            message:
              "La sala necesita un nombre.",
          }
        );

        return;
      }

      if (
        !roomData.game &&
        !roomData.gameId
      ) {
        socket.emit(
          "room-error",
          {
            message:
              "Debes seleccionar un juego.",
          }
        );

        return;
      }

      const game =
        roomData.game ||
        roomData.gameId;

      const gameId =
        roomData.gameId ||
        roomData.game;

      const room = {
        id:
          crypto.randomUUID(),

        name:
          name.slice(0, 100),

        game,
        gameId,

        gameOptions:
          roomData.gameOptions ||
          {},

        host:
          socket.id,

        hostPublicIp:
          roomData.hostPublicIp ||
          null,

        members: [
          {
            id:
              socket.id,

            username:
              user.username,

            gameReady:
              hasConfiguredGame(
                socket.id,
                {
                  game,
                  gameId,
                }
              ),
          },
        ],

        players: 1,
      };

      rooms.push(room);

      readyStates[room.id] =
        [];

      socket.join(room.id);

      console.log(
        `[Room] Creada "${room.name}" (${room.id}) para ${room.gameId}`
      );

      emitRoomList(io);
      emitReadyState(
        io,
        room.id
      );
    }
  );

  socket.on(
    "join-room",
    (roomId) => {
      const room =
        getRoom(roomId);

      if (!room) {
        socket.emit(
          "room-error",
          {
            message:
              "La sala ya no existe.",
          }
        );

        return;
      }

      if (
        isRoomMember(
          socket.id,
          roomId
        )
      ) {
        return;
      }

      const hasGame =
        hasConfiguredGame(
          socket.id,
          room
        );

      const username =
        onlineUsers[socket.id]
          ?.username ||
        user.username;

      room.members.push({
        id:
          socket.id,

        username,

        gameReady:
          hasGame,
      });

      room.players =
        room.members.length;

      socket.join(roomId);

      socket.emit(
        "host-peer-info",
        {
          roomId:
            room.id,

          hostSocketId:
            room.host,

          hostPublicIp:
            room.hostPublicIp,
        }
      );

      if (!hasGame) {
        io.to(roomId).emit(
          "player-missing-game",
          {
            username,

            game:
              room.game,

            message:
              `${username} no tiene ${room.game} configurado en RetroLink`,
          }
        );
      }

      emitRoomList(io);
      emitReadyState(
        io,
        roomId
      );

      notifyRelayState(
        io,
        roomId
      );
    }
  );

  socket.on(
    "toggle-ready",
    (roomId) => {
      if (
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        return;
      }

      if (
        !readyStates[roomId]
      ) {
        readyStates[roomId] =
          [];
      }

      const ready =
        readyStates[roomId];

      readyStates[roomId] =
        ready.includes(socket.id)
          ? ready.filter(
              (id) =>
                id !== socket.id
            )
          : [
              ...ready,
              socket.id,
            ];

      emitReadyState(
        io,
        roomId
      );
    }
  );

  socket.on(
    "start-match",
    (roomId) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        room.host !== socket.id
      ) {
        return;
      }

      const readyPlayers =
        readyStates[roomId] ||
        [];

      const everyoneReady =
        room.members.every(
          (member) =>
            readyPlayers.includes(
              member.id
            )
        );

      if (!everyoneReady) {
        socket.emit(
          "match-error",
          {
            message:
              "Todos los jugadores deben estar listos antes de iniciar.",
          }
        );

        return;
      }

      const missing =
        room.members.filter(
          (member) =>
            !hasConfiguredGame(
              member.id,
              room
            )
        );

      if (missing.length > 0) {
        const names =
          missing
            .map(
              (member) =>
                member.username
            )
            .join(", ");

        socket.emit(
          "match-error",
          {
            message:
              `Los siguientes jugadores no tienen ${room.game} configurado: ${names}`,
          }
        );

        return;
      }

      io.to(roomId).emit(
        "match-started",
        {
          roomId,

          hostPublicIp:
            room.hostPublicIp,

          gameOptions:
            room.gameOptions ||
            {},
        }
      );
    }
  );

  socket.on(
    "room-chat",
    ({
      roomId,
      message,
      username,
    } = {}) => {
      if (
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        return;
      }

      const cleanMessage =
        typeof message ===
        "string"
          ? message.trim()
          : "";

      if (!cleanMessage) {
        return;
      }

      io.to(roomId).emit(
        "room-chat",
        {
          username:
            username ||
            user.username,

          message:
            cleanMessage.slice(
              0,
              2000
            ),

          timestamp:
            Date.now(),
        }
      );
    }
  );

  socket.on(
    "rename-room",
    ({
      roomId,
      name,
    } = {}) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        room.host !== socket.id ||
        typeof name !==
          "string" ||
        !name.trim()
      ) {
        return;
      }

      room.name =
        name.trim().slice(
          0,
          100
        );

      emitRoomList(io);
    }
  );

  socket.on(
    "leave-room",
    (roomId) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        return;
      }

      const wasHost =
        room.host === socket.id;

      if (!wasHost) {
        socket
          .to(
            `webrtc-${roomId}`
          )
          .emit(
            "webrtc-client-left",
            {
              socketId:
                socket.id,
            }
          );
      }

      removeRelayParticipant(
        roomId,
        socket.id
      );

      socket.leave(
        `game-relay-${roomId}`
      );

      socket.leave(
        `webrtc-${roomId}`
      );

      socket.leave(roomId);

      removeRoomMember(
        room,
        socket.id
      );

      removeReadyPlayer(
        roomId,
        socket.id
      );

      if (
        room.members.length === 0
      ) {
        deleteRoom(roomId);
        deleteRelayRoom(roomId);
        emitRoomList(io);

        return;
      }

      if (wasHost) {
        promoteNextHost(room);

        updateRelayHost(
          roomId,
          room.host
        );
      }

      emitRoomList(io);

      emitReadyState(
        io,
        roomId
      );

      notifyRelayState(
        io,
        roomId
      );
    }
  );
}
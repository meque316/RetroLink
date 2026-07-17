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

        /*
         * Este ID corresponde exclusivamente
         * al socket del frontend/lobby.
         */
        host:
          socket.id,

        /*
         * Esta IP puede venir inicialmente desde
         * el frontend, pero posteriormente el bridge
         * host puede actualizarla mediante webrtc-join.
         */
        hostPublicIp:
          typeof roomData.hostPublicIp ===
            "string" &&
          roomData.hostPublicIp.trim()
            ? roomData.hostPublicIp.trim()
            : null,

        /*
         * Este campo corresponde al socket separado
         * del bridge Electron y se completa cuando
         * el host ejecuta webrtc-join.
         */
        webrtcHostSocketId:
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

      socket.join(
        room.id
      );

      console.log(
        `[Room] Creada "${room.name}" (${room.id}) para ${room.gameId}`
      );

      emitRoomList(
        io
      );

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

      socket.join(
        roomId
      );

      /*
       * Este evento pertenece al lobby.
       * hostSocketId sigue siendo el socket del frontend,
       * no el socket del bridge Electron.
       */
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

      emitRoomList(
        io
      );

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
        ready.includes(
          socket.id
        )
          ? ready.filter(
              (id) =>
                id !==
                socket.id
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
        room.host !==
          socket.id
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

      if (
        missing.length >
        0
      ) {
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
        room.host !==
          socket.id ||
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

      emitRoomList(
        io
      );
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

      const wasLobbyHost =
        room.host ===
        socket.id;

      /*
       * Esta salida afecta únicamente al socket
       * del frontend/lobby.
       *
       * No emitimos webrtc-client-left,
       * no eliminamos participantes relay y
       * no salimos de las salas internas del bridge.
       *
       * El bridge tiene una conexión Socket.IO
       * independiente y se limpia mediante:
       *
       * - webrtc-leave
       * - game-relay-disable
       * - disconnect
       */
      socket.leave(
        roomId
      );

      removeRoomMember(
        room,
        socket.id
      );

      removeReadyPlayer(
        roomId,
        socket.id
      );

      if (
        room.members.length ===
        0
      ) {
        deleteRoom(
          roomId
        );

        deleteRelayRoom(
          roomId
        );

        console.log(
          `[Room] Sala ${roomId} eliminada porque quedó sin miembros`
        );

        emitRoomList(
          io
        );

        return;
      }

      if (wasLobbyHost) {
        promoteNextHost(
          room
        );

        /*
         * Esto sólo promociona al host del lobby.
         *
         * No se modifica el host relay, porque éste
         * se identifica mediante participant.isHost
         * dentro de la conexión separada del bridge.
         */
        console.log(
          `[Room] Nuevo host del lobby en ${roomId}: ${room.host}`
        );

        /*
         * Si el frontend host abandonó pero su bridge
         * sigue conectado momentáneamente, no tocamos
         * aquí webrtcHostSocketId.
         *
         * Ese socket se limpiará al recibir webrtc-leave
         * o disconnect desde Electron.
         */
      }

      emitRoomList(
        io
      );

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
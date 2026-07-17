import {
  rooms,
} from "../state/socket-state.js";

import {
  deleteRoom,
  emitReadyState,
  emitRoomList,
  promoteNextHost,
  removeReadyPlayer,
  removeRoomMember,
} from "../rooms/room-utils.js";

import {
  deleteRelayRoom,
  notifyRelayState,
  removeSocketFromAllRelays,
} from "../relay/relay-store.js";

import {
  removeUserSession,
} from "../users/user-events.js";

function cleanupDisconnectedBridge({
  io,
  socket,
}) {
  const roomId =
    socket.data.webrtcRoomId;

  if (!roomId) {
    return null;
  }

  const room =
    rooms.find(
      (candidate) =>
        candidate.id ===
        roomId
    );

  const wasBridgeHost =
    Boolean(
      socket.data.isWebrtcHost
    );

  const webrtcRoomName =
    `webrtc-${roomId}`;

  if (wasBridgeHost) {
    /*
     * Limpiamos solamente si esta conexión era
     * realmente el bridge host registrado.
     */
    if (
      room?.webrtcHostSocketId ===
      socket.id
    ) {
      delete room
        .webrtcHostSocketId;

      delete room
        .hostPublicIp;
    }

    socket
      .to(webrtcRoomName)
      .emit(
        "webrtc-host-left",
        {
          socketId:
            socket.id,
        }
      );

    console.log(
      `[WebRTC] Bridge host ${socket.id} desconectado de ${roomId}`
    );
  } else {
    socket
      .to(webrtcRoomName)
      .emit(
        "webrtc-client-left",
        {
          socketId:
            socket.id,
        }
      );

    console.log(
      `[WebRTC] Bridge cliente ${socket.id} desconectado de ${roomId}`
    );
  }

  return roomId;
}

export function handleDisconnect({
  io,
  socket,
}) {
  console.log(
    "Socket desconectado:",
    socket.id
  );

  /*
   * El socket desconectado puede ser:
   *
   * 1. El socket del frontend/lobby.
   * 2. El socket independiente del bridge Electron.
   *
   * Por eso ambas limpiezas se realizan por separado.
   */
  const disconnectedBridgeRoomId =
    cleanupDisconnectedBridge({
      io,
      socket,
    });

  /*
   * Elimina este socket de todos los relays en los
   * que estuviera registrado como bridge.
   */
  const affectedRelayRooms =
    removeSocketFromAllRelays(
      socket.id
    );

  /*
   * Si era un socket autenticado del frontend,
   * elimina también su sesión de usuario.
   *
   * Si era un bridge sin sesión, esta función
   * simplemente no debería encontrar una sesión.
   */
  removeUserSession({
    io,
    socket,
  });

  /*
   * Esta sección maneja exclusivamente las salas
   * del lobby. Un socket bridge normalmente no estará
   * en room.members y será ignorado correctamente.
   */
  for (
    let index =
      rooms.length - 1;
    index >= 0;
    index -= 1
  ) {
    const room =
      rooms[index];

    const wasLobbyMember =
      room.members.some(
        (member) =>
          member.id ===
          socket.id
      );

    if (!wasLobbyMember) {
      continue;
    }

    const wasLobbyHost =
      room.host ===
      socket.id;

    removeRoomMember(
      room,
      socket.id
    );

    removeReadyPlayer(
      room.id,
      socket.id
    );

    /*
     * Si ya no quedan jugadores del lobby,
     * eliminamos completamente el estado.
     */
    if (
      room.players <= 0
    ) {
      deleteRoom(
        room.id
      );

      deleteRelayRoom(
        room.id
      );

      console.log(
        `[Rooms] Sala ${room.id} eliminada porque quedó vacía`
      );

      continue;
    }

    /*
     * Esta promoción cambia solamente al host del lobby.
     *
     * No llamamos updateRelayHost(), porque el relay
     * utiliza IDs de sockets bridge y no IDs del lobby.
     */
    if (wasLobbyHost) {
      promoteNextHost(
        room
      );

      console.log(
        `[Rooms] Nuevo host del lobby en ${room.id}: ${room.host}`
      );
    }

    emitReadyState(
      io,
      room.id
    );

    notifyRelayState(
      io,
      room.id
    );
  }

  /*
   * Notificamos una sola vez por cada sala relay
   * afectada por la desaparición del socket.
   */
  const relayRoomsToNotify =
    new Set(
      affectedRelayRooms
    );

  if (
    disconnectedBridgeRoomId
  ) {
    relayRoomsToNotify.add(
      disconnectedBridgeRoomId
    );
  }

  for (const roomId of
    relayRoomsToNotify) {
    notifyRelayState(
      io,
      roomId
    );
  }

  emitRoomList(
    io
  );
}
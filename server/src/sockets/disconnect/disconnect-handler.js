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
  updateRelayHost,
} from "../relay/relay-store.js";

import {
  removeUserSession,
} from "../users/user-events.js";

export function handleDisconnect({
  io,
  socket,
}) {
  console.log(
    "Usuario desconectado:",
    socket.id
  );

  const webrtcRoomId =
    socket.data.webrtcRoomId;

  if (
    webrtcRoomId &&
    !socket.data.isWebrtcHost
  ) {
    socket
      .to(
        `webrtc-${webrtcRoomId}`
      )
      .emit(
        "webrtc-client-left",
        {
          socketId:
            socket.id,
        }
      );
  }

  const affectedRelayRooms =
    removeSocketFromAllRelays(
      socket.id
    );

  removeUserSession({
    io,
    socket,
  });

  for (
    let index =
      rooms.length - 1;
    index >= 0;
    index -= 1
  ) {
    const room =
      rooms[index];

    const wasMember =
      room.members.some(
        (member) =>
          member.id ===
          socket.id
      );

    if (!wasMember) {
      continue;
    }

    const wasHost =
      room.host === socket.id;

    removeRoomMember(
      room,
      socket.id
    );

    removeReadyPlayer(
      room.id,
      socket.id
    );

    if (
      room.players <= 0
    ) {
      deleteRoom(room.id);
      deleteRelayRoom(room.id);

      continue;
    }

    if (wasHost) {
      promoteNextHost(room);

      updateRelayHost(
        room.id,
        room.host
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

  for (const roomId of
    affectedRelayRooms) {
    notifyRelayState(
      io,
      roomId
    );
  }

  emitRoomList(io);
}
import {
  rooms,
  readyStates,
  userGames,
} from "../state/socket-state.js";

export function getRoom(roomId) {
  if (!roomId) {
    return null;
  }

  return (
    rooms.find(
      (room) => room.id === roomId
    ) || null
  );
}

export function isRoomMember(
  socketId,
  roomId
) {
  const room = getRoom(roomId);

  return Boolean(
    room?.members?.some(
      (member) =>
        member.id === socketId
    )
  );
}

export function hasConfiguredGame(
  socketId,
  room
) {
  if (!room) {
    return false;
  }

  const games =
    userGames[socketId] || {};

  const normalizedId =
    String(
      room.gameId || ""
    ).toLowerCase();

  const normalizedName =
    String(
      room.game || ""
    ).toLowerCase();

  return Boolean(
    games[room.gameId] ||
      games[room.game] ||
      games[normalizedId] ||
      games[normalizedName]
  );
}

export function removeReadyPlayer(
  roomId,
  socketId
) {
  if (!readyStates[roomId]) {
    return;
  }

  readyStates[roomId] =
    readyStates[roomId].filter(
      (id) => id !== socketId
    );
}

export function removeRoomMember(
  room,
  socketId
) {
  if (!room) {
    return false;
  }

  const previousLength =
    room.members.length;

  room.members =
    room.members.filter(
      (member) =>
        member.id !== socketId
    );

  room.players =
    room.members.length;

  return (
    previousLength !==
    room.members.length
  );
}

export function promoteNextHost(
  room
) {
  if (
    !room?.members?.length
  ) {
    return null;
  }

  room.host =
    room.members[0].id;

  return room.host;
}

export function deleteRoom(
  roomId
) {
  const index =
    rooms.findIndex(
      (room) => room.id === roomId
    );

  if (index !== -1) {
    rooms.splice(index, 1);
  }

  delete readyStates[roomId];
}

export function emitRoomList(io) {
  io.emit(
    "rooms-list",
    rooms
  );
}

export function emitReadyState(
  io,
  roomId
) {
  io.to(roomId).emit(
    "room-ready-state",
    readyStates[roomId] || []
  );
}
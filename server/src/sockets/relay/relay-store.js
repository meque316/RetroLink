import {
  gameRelayRooms,
} from "../state/socket-state.js";

import {
  getRoom,
  isRoomMember,
} from "../rooms/room-utils.js";

export const MAX_RELAY_PACKET_BYTES =
  64 * 1024;

export const RELAY_BYTES_PER_SECOND =
  512 * 1024;

export const RELAY_BURST_BYTES =
  1024 * 1024;

export function getRelayParticipants(
  roomId,
  createIfMissing = true
) {
  let participants =
    gameRelayRooms.get(roomId);

  if (
    !participants &&
    createIfMissing
  ) {
    participants =
      new Map();

    gameRelayRooms.set(
      roomId,
      participants
    );
  }

  return participants || null;
}

export function createRelayParticipant({
  socketId,
  isHost,
  reason,
}) {
  return {
    socketId,

    isHost:
      Boolean(isHost),

    reason:
      reason ||
      "ice-failed",

    enabledAt:
      Date.now(),

    lastEnabledAt:
      Date.now(),

    availableBytes:
      RELAY_BURST_BYTES,

    lastRefillAt:
      Date.now(),

    packetsReceived: 0,
    bytesReceived: 0,

    packetsForwarded: 0,
    bytesForwarded: 0,

    packetsDropped: 0,
    bytesDropped: 0,
  };
}

export function removeRelayParticipant(
  roomId,
  socketId
) {
  const participants =
    getRelayParticipants(
      roomId,
      false
    );

  if (!participants) {
    return false;
  }

  const removed =
    participants.delete(socketId);

  if (
    participants.size === 0
  ) {
    gameRelayRooms.delete(roomId);
  }

  return removed;
}

export function removeSocketFromAllRelays(
  socketId
) {
  const affectedRooms = [];

  for (const [
    roomId,
    participants,
  ] of gameRelayRooms) {
    if (
      participants.delete(socketId)
    ) {
      affectedRooms.push(roomId);
    }

    if (
      participants.size === 0
    ) {
      gameRelayRooms.delete(roomId);
    }
  }

  return affectedRooms;
}

export function deleteRelayRoom(
  roomId
) {
  gameRelayRooms.delete(roomId);
}

export function updateRelayHost(
  roomId,
  hostSocketId
) {
  const participants =
    getRelayParticipants(
      roomId,
      false
    );

  if (!participants) {
    return;
  }

  for (const [
    socketId,
    participant,
  ] of participants) {
    participant.isHost =
      socketId === hostSocketId;
  }
}

export function normalizeRelayPacket(
  packet
) {
  if (Buffer.isBuffer(packet)) {
    return packet;
  }

  if (
    packet instanceof Uint8Array
  ) {
    return Buffer.from(
      packet.buffer,
      packet.byteOffset,
      packet.byteLength
    );
  }

  if (Array.isArray(packet)) {
    return Buffer.from(packet);
  }

  if (
    packet?.type === "Buffer" &&
    Array.isArray(packet.data)
  ) {
    return Buffer.from(
      packet.data
    );
  }

  return null;
}

export function consumeRelayQuota(
  participant,
  packetBytes
) {
  const now =
    Date.now();

  const elapsedSeconds =
    Math.max(
      0,
      now -
        participant.lastRefillAt
    ) / 1000;

  participant.availableBytes =
    Math.min(
      RELAY_BURST_BYTES,

      participant.availableBytes +
        elapsedSeconds *
          RELAY_BYTES_PER_SECOND
    );

  participant.lastRefillAt =
    now;

  if (
    participant.availableBytes <
    packetBytes
  ) {
    participant.packetsDropped +=
      1;

    participant.bytesDropped +=
      packetBytes;

    return false;
  }

  participant.availableBytes -=
    packetBytes;

  participant.packetsReceived +=
    1;

  participant.bytesReceived +=
    packetBytes;

  return true;
}

export function emitRelayPacket({
  io,
  targetSocketId,
  roomId,
  sourceSocketId,
  packet,
  senderParticipant,
}) {
  io.to(targetSocketId).emit(
    "game-relay-packet",
    {
      roomId,

      fromSocketId:
        sourceSocketId,

      packet,
    }
  );

  if (senderParticipant) {
    senderParticipant
      .packetsForwarded += 1;

    senderParticipant
      .bytesForwarded +=
      packet.length;
  }
}

export function getRelayState(
  roomId
) {
  const room =
    getRoom(roomId);

  const participants =
    getRelayParticipants(
      roomId,
      false
    );

  if (!room) {
    return {
      roomId,

      ready:
        false,

      hostEnabled:
        false,

      participantCount:
        0,

      clientCount:
        0,
    };
  }

  const participantIds =
    participants
      ? [...participants.keys()]
      : [];

  const hostEnabled =
    Boolean(
      participants?.has(
        room.host
      )
    );

  const clientCount =
    participantIds.filter(
      (socketId) =>
        socketId !==
          room.host &&
        isRoomMember(
          socketId,
          roomId
        )
    ).length;

  return {
    roomId,

    ready:
      hostEnabled &&
      clientCount > 0,

    hostEnabled,

    participantCount:
      participantIds.length,

    clientCount,
  };
}

export function notifyRelayState(
  io,
  roomId
) {
  if (!roomId) {
    return;
  }

  io.to(roomId).emit(
    "game-relay-state",
    getRelayState(roomId)
  );
}
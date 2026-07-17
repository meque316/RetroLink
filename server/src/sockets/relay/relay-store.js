import {
  gameRelayRooms,
} from "../state/socket-state.js";

import {
  getRoom,
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
  if (
    !roomId ||
    typeof roomId !== "string"
  ) {
    return null;
  }

  let participants =
    gameRelayRooms.get(roomId);

  if (
    !participants &&
    createIfMissing
  ) {
    participants = new Map();

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
  const now =
    Date.now();

  return {
    socketId,

    isHost:
      Boolean(isHost),

    reason:
      typeof reason === "string" &&
      reason.trim()
        ? reason.trim()
        : "ice-failed",

    enabledAt:
      now,

    lastEnabledAt:
      now,

    availableBytes:
      RELAY_BURST_BYTES,

    lastRefillAt:
      now,

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
  if (
    !roomId ||
    !socketId
  ) {
    return false;
  }

  const participants =
    getRelayParticipants(
      roomId,
      false
    );

  if (!participants) {
    return false;
  }

  const removed =
    participants.delete(
      socketId
    );

  if (removed) {
    console.log(
      `[GameRelay] ${socketId} salió del relay ${roomId}`
    );
  }

  if (
    participants.size === 0
  ) {
    gameRelayRooms.delete(
      roomId
    );

    console.log(
      `[GameRelay] Relay ${roomId} eliminado porque quedó vacío`
    );
  }

  return removed;
}

export function removeSocketFromAllRelays(
  socketId
) {
  if (!socketId) {
    return [];
  }

  const affectedRooms = [];

  for (const [
    roomId,
    participants,
  ] of gameRelayRooms) {
    const removed =
      participants.delete(
        socketId
      );

    if (removed) {
      affectedRooms.push(
        roomId
      );

      console.log(
        `[GameRelay] ${socketId} desconectado del relay ${roomId}`
      );
    }

    if (
      participants.size === 0
    ) {
      gameRelayRooms.delete(
        roomId
      );

      console.log(
        `[GameRelay] Relay ${roomId} eliminado porque quedó vacío`
      );
    }
  }

  return affectedRooms;
}

export function deleteRelayRoom(
  roomId
) {
  if (!roomId) {
    return false;
  }

  const deleted =
    gameRelayRooms.delete(
      roomId
    );

  if (deleted) {
    console.log(
      `[GameRelay] Estado relay eliminado para la sala ${roomId}`
    );
  }

  return deleted;
}

/*
 * El host relay se determina exclusivamente mediante
 * participant.isHost, asignado por el socket del bridge.
 *
 * No debe sincronizarse usando room.host, porque ese ID
 * corresponde al socket del lobby y no al bridge Electron.
 */
export function getRelayHost(
  roomId
) {
  const participants =
    getRelayParticipants(
      roomId,
      false
    );

  if (!participants) {
    return null;
  }

  for (const [
    socketId,
    participant,
  ] of participants) {
    if (participant.isHost) {
      return {
        socketId,
        participant,
      };
    }
  }

  return null;
}

export function normalizeRelayPacket(
  packet
) {
  if (
    Buffer.isBuffer(packet)
  ) {
    return packet;
  }

  if (
    packet instanceof
    Uint8Array
  ) {
    return Buffer.from(
      packet.buffer,
      packet.byteOffset,
      packet.byteLength
    );
  }

  if (
    Array.isArray(packet)
  ) {
    return Buffer.from(
      packet
    );
  }

  if (
    packet?.type ===
      "Buffer" &&
    Array.isArray(
      packet.data
    )
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
  if (
    !participant ||
    !Number.isInteger(
      packetBytes
    ) ||
    packetBytes <= 0
  ) {
    return false;
  }

  const now =
    Date.now();

  const lastRefillAt =
    Number.isFinite(
      participant.lastRefillAt
    )
      ? participant.lastRefillAt
      : now;

  const elapsedSeconds =
    Math.max(
      0,
      now - lastRefillAt
    ) / 1000;

  const currentAvailableBytes =
    Number.isFinite(
      participant.availableBytes
    )
      ? participant.availableBytes
      : RELAY_BURST_BYTES;

  participant.availableBytes =
    Math.min(
      RELAY_BURST_BYTES,
      currentAvailableBytes +
        elapsedSeconds *
          RELAY_BYTES_PER_SECOND
    );

  participant.lastRefillAt =
    now;

  if (
    participant.availableBytes <
    packetBytes
  ) {
    participant.packetsDropped =
      (
        participant
          .packetsDropped ||
        0
      ) + 1;

    participant.bytesDropped =
      (
        participant
          .bytesDropped ||
        0
      ) + packetBytes;

    return false;
  }

  participant.availableBytes -=
    packetBytes;

  participant.packetsReceived =
    (
      participant
        .packetsReceived ||
      0
    ) + 1;

  participant.bytesReceived =
    (
      participant
        .bytesReceived ||
      0
    ) + packetBytes;

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
  if (
    !io ||
    !targetSocketId ||
    !roomId ||
    !sourceSocketId ||
    !Buffer.isBuffer(packet)
  ) {
    return false;
  }

  io.to(
    targetSocketId
  ).emit(
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
      .packetsForwarded =
      (
        senderParticipant
          .packetsForwarded ||
        0
      ) + 1;

    senderParticipant
      .bytesForwarded =
      (
        senderParticipant
          .bytesForwarded ||
        0
      ) + packet.length;
  }

  return true;
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

      ready: false,

      hostEnabled: false,

      hostSocketId: null,

      participantCount: 0,

      clientCount: 0,
    };
  }

  const participantList =
    participants
      ? [
          ...participants
            .values(),
        ]
      : [];

  const relayHost =
    getRelayHost(roomId);

  const clientCount =
    participantList.filter(
      (participant) =>
        !participant.isHost
    ).length;

  return {
    roomId,

    ready:
      Boolean(relayHost) &&
      clientCount > 0,

    hostEnabled:
      Boolean(relayHost),

    hostSocketId:
      relayHost?.socketId ||
      null,

    participantCount:
      participantList.length,

    clientCount,
  };
}

export function notifyRelayState(
  io,
  roomId
) {
  if (
    !io ||
    !roomId
  ) {
    return;
  }

  const relayState =
    getRelayState(roomId);

  /*
   * Estado para la interfaz y los sockets del lobby.
   */
  io.to(roomId).emit(
    "game-relay-state",
    relayState
  );

  /*
   * Estado para las conexiones internas
   * de los bridges Electron.
   */
  io.to(
    `game-relay-${roomId}`
  ).emit(
    "game-relay-state",
    relayState
  );
}
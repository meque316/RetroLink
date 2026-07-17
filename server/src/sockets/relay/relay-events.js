import {
  getRoom,
} from "../rooms/room-utils.js";

import {
  MAX_RELAY_PACKET_BYTES,
  RELAY_BYTES_PER_SECOND,
  consumeRelayQuota,
  createRelayParticipant,
  emitRelayPacket,
  getRelayHost,
  getRelayParticipants,
  getRelayState,
  normalizeRelayPacket,
  notifyRelayState,
  removeRelayParticipant,
} from "./relay-store.js";

const RATE_LIMIT_NOTICE_INTERVAL_MS =
  1000;

function getRelayRoomName(
  roomId
) {
  return `game-relay-${roomId}`;
}

function isBridgeJoinedToRoom(
  socket,
  roomId
) {
  return (
    typeof roomId ===
      "string" &&
    roomId.length > 0 &&
    socket.data.webrtcRoomId ===
      roomId
  );
}

function isSocketInRoom(
  io,
  socketId,
  roomName
) {
  return Boolean(
    io.sockets.adapter.rooms
      .get(roomName)
      ?.has(socketId)
  );
}

function normalizeRelayReason(
  reason
) {
  if (
    typeof reason !==
    "string"
  ) {
    return "ice-failed";
  }

  const cleanReason =
    reason.trim();

  return cleanReason
    ? cleanReason.slice(
        0,
        100
      )
    : "ice-failed";
}

function registerDroppedPacket(
  participant,
  packetBytes = 0
) {
  if (!participant) {
    return;
  }

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
    ) +
    Math.max(
      0,
      Number(packetBytes) ||
        0
    );
}

function emitRateLimitNotice({
  socket,
  roomId,
  participant,
}) {
  const now =
    Date.now();

  const lastNoticeAt =
    participant
      .lastRateLimitNoticeAt ||
    0;

  if (
    now - lastNoticeAt <
    RATE_LIMIT_NOTICE_INTERVAL_MS
  ) {
    return;
  }

  participant
    .lastRateLimitNoticeAt =
    now;

  socket.emit(
    "game-relay-rate-limited",
    {
      roomId,

      limitBytesPerSecond:
        RELAY_BYTES_PER_SECOND,
    }
  );
}

function logFirstReceivedPacket({
  socket,
  roomId,
  participant,
  packetBytes,
}) {
  if (
    participant
      .firstPacketReceivedAt
  ) {
    return;
  }

  participant
    .firstPacketReceivedAt =
    Date.now();

  console.log(
    `[GameRelay] Primer paquete recibido de ${socket.id} en ${roomId}: ${packetBytes} bytes`
  );
}

function logFirstForwardedPacket({
  roomId,
  participant,
  sourceSocketId,
  targetSocketId,
  packetBytes,
}) {
  if (
    participant
      .firstPacketForwardedAt
  ) {
    return;
  }

  participant
    .firstPacketForwardedAt =
    Date.now();

  console.log(
    `[GameRelay] Primer paquete reenviado en ${roomId}: ${sourceSocketId} -> ${targetSocketId} (${packetBytes} bytes)`
  );
}

function forwardRelayPacket({
  io,
  roomId,
  sourceSocketId,
  targetSocketId,
  packet,
  senderParticipant,
}) {
  const forwarded =
    emitRelayPacket({
      io,

      targetSocketId,

      roomId,

      sourceSocketId,

      packet,

      senderParticipant,
    });

  if (forwarded) {
    logFirstForwardedPacket({
      roomId,

      participant:
        senderParticipant,

      sourceSocketId,

      targetSocketId,

      packetBytes:
        packet.length,
    });
  }

  return forwarded;
}

export function registerRelayEvents({
  io,
  socket,
}) {
  socket.on(
    "game-relay-enable",
    (
      {
        roomId,
        reason =
          "ice-failed",
      } = {},
      ack
    ) => {
      const room =
        getRoom(roomId);

      if (!room) {
        ack?.({
          success: false,

          error:
            "La sala no existe.",
        });

        return;
      }

      /*
       * El socket del bridge es distinto al socket
       * del lobby. Su pertenencia se valida usando
       * socket.data.webrtcRoomId.
       */
      if (
        !isBridgeJoinedToRoom(
          socket,
          roomId
        )
      ) {
        ack?.({
          success: false,

          error:
            "El bridge no está unido a esta sala.",
        });

        return;
      }

      const participants =
        getRelayParticipants(
          roomId
        );

      if (!participants) {
        ack?.({
          success: false,

          error:
            "No se pudo crear el estado del relay.",
        });

        return;
      }

      const isHost =
        Boolean(
          socket.data
            .isWebrtcHost
        );

      /*
       * Sólo puede existir un bridge host relay
       * activo por sala.
       */
      if (isHost) {
        const currentHost =
          getRelayHost(
            roomId
          );

        if (
          currentHost &&
          currentHost.socketId !==
            socket.id
        ) {
          /*
           * Si el supuesto host anterior ya no está
           * conectado, eliminamos la referencia obsoleta.
           */
          const oldHostConnected =
            isSocketInRoom(
              io,
              currentHost.socketId,
              getRelayRoomName(
                roomId
              )
            );

          if (
            oldHostConnected
          ) {
            ack?.({
              success: false,

              error:
                "La sala ya tiene un bridge host relay activo.",

              hostSocketId:
                currentHost
                  .socketId,
            });

            return;
          }

          removeRelayParticipant(
            roomId,
            currentHost.socketId
          );
        }
      }

      const cleanReason =
        normalizeRelayReason(
          reason
        );

      const existing =
        participants.get(
          socket.id
        );

      if (existing) {
        existing.isHost =
          isHost;

        existing.reason =
          cleanReason;

        existing.lastEnabledAt =
          Date.now();
      } else {
        participants.set(
          socket.id,
          createRelayParticipant({
            socketId:
              socket.id,

            isHost,

            reason:
              cleanReason,
          })
        );
      }

      socket.join(
        getRelayRoomName(
          roomId
        )
      );

      console.log(
        `[GameRelay] ${socket.id} activó relay en ${roomId} como ${
          isHost
            ? "HOST"
            : "CLIENT"
        }. Motivo: ${cleanReason}`
      );

      notifyRelayState(
        io,
        roomId
      );

      const relayState =
        getRelayState(
          roomId
        );

      ack?.({
        success: true,

        ...relayState,
      });
    }
  );

  socket.on(
    "game-relay-disable",
    (
      {
        roomId,
      } = {},
      ack
    ) => {
      if (
        !isBridgeJoinedToRoom(
          socket,
          roomId
        )
      ) {
        ack?.({
          success: false,

          error:
            "El bridge no está unido a esta sala.",
        });

        return;
      }

      const removed =
        removeRelayParticipant(
          roomId,
          socket.id
        );

      socket.leave(
        getRelayRoomName(
          roomId
        )
      );

      notifyRelayState(
        io,
        roomId
      );

      console.log(
        `[GameRelay] ${socket.id} desactivó relay en ${roomId}`
      );

      ack?.({
        success: true,

        removed,

        ...getRelayState(
          roomId
        ),
      });
    }
  );

  socket.on(
    "game-relay-packet",
    ({
      roomId,
      toSocketId = null,
      packet,
    } = {}) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        !isBridgeJoinedToRoom(
          socket,
          roomId
        )
      ) {
        return;
      }

      const participants =
        getRelayParticipants(
          roomId,
          false
        );

      const sender =
        participants?.get(
          socket.id
        );

      if (
        !participants ||
        !sender
      ) {
        return;
      }

      const buffer =
        normalizeRelayPacket(
          packet
        );

      if (!buffer) {
        registerDroppedPacket(
          sender
        );

        console.warn(
          `[GameRelay] Formato de paquete inválido desde ${socket.id} en ${roomId}`
        );

        return;
      }

      if (
        buffer.length === 0 ||
        buffer.length >
          MAX_RELAY_PACKET_BYTES
      ) {
        registerDroppedPacket(
          sender,
          buffer.length
        );

        console.warn(
          `[GameRelay] Paquete inválido desde ${socket.id}: ${buffer.length} bytes`
        );

        return;
      }

      if (
        !consumeRelayQuota(
          sender,
          buffer.length
        )
      ) {
        emitRateLimitNotice({
          socket,
          roomId,
          participant:
            sender,
        });

        return;
      }

      logFirstReceivedPacket({
        socket,
        roomId,

        participant:
          sender,

        packetBytes:
          buffer.length,
      });

      const relayRoomName =
        getRelayRoomName(
          roomId
        );

      const senderIsHost =
        Boolean(
          sender.isHost
        );

      /*
       * Un cliente sólo puede enviar paquetes
       * al bridge host de la sala.
       */
      if (!senderIsHost) {
        const relayHost =
          getRelayHost(
            roomId
          );

        if (
          !relayHost ||
          relayHost.socketId ===
            socket.id ||
          !isSocketInRoom(
            io,
            relayHost.socketId,
            relayRoomName
          )
        ) {
          registerDroppedPacket(
            sender,
            buffer.length
          );

          return;
        }

        forwardRelayPacket({
          io,

          roomId,

          sourceSocketId:
            socket.id,

          targetSocketId:
            relayHost.socketId,

          packet:
            buffer,

          senderParticipant:
            sender,
        });

        return;
      }

      /*
       * El host puede responder a un cliente
       * relay específico.
       */
      if (toSocketId) {
        const targetParticipant =
          participants.get(
            toSocketId
          );

        if (
          toSocketId ===
            socket.id ||
          !targetParticipant ||
          targetParticipant.isHost ||
          !isSocketInRoom(
            io,
            toSocketId,
            relayRoomName
          )
        ) {
          registerDroppedPacket(
            sender,
            buffer.length
          );

          return;
        }

        forwardRelayPacket({
          io,

          roomId,

          sourceSocketId:
            socket.id,

          targetSocketId:
            toSocketId,

          packet:
            buffer,

          senderParticipant:
            sender,
        });

        return;
      }

      /*
       * Sin destino explícito, el host replica
       * el paquete a todos los clientes relay.
       */
      let forwardedCount =
        0;

      for (const [
        targetSocketId,
        targetParticipant,
      ] of participants) {
        if (
          targetSocketId ===
            socket.id ||
          targetParticipant.isHost ||
          !isSocketInRoom(
            io,
            targetSocketId,
            relayRoomName
          )
        ) {
          continue;
        }

        const forwarded =
          forwardRelayPacket({
            io,

            roomId,

            sourceSocketId:
              socket.id,

            targetSocketId,

            packet:
              buffer,

            senderParticipant:
              sender,
          });

        if (forwarded) {
          forwardedCount +=
            1;
        }
      }

      if (
        forwardedCount ===
        0
      ) {
        registerDroppedPacket(
          sender,
          buffer.length
        );
      }
    }
  );

  socket.on(
    "game-relay-stats",
    (
      {
        roomId,
      } = {},
      ack
    ) => {
      if (
        !isBridgeJoinedToRoom(
          socket,
          roomId
        )
      ) {
        ack?.({
          success: false,

          error:
            "El bridge no está unido a esta sala.",
        });

        return;
      }

      const participant =
        getRelayParticipants(
          roomId,
          false
        )?.get(
          socket.id
        );

      if (!participant) {
        ack?.({
          success: false,

          error:
            "El relay no está activo.",
        });

        return;
      }

      ack?.({
        success: true,

        state:
          getRelayState(
            roomId
          ),

        stats: {
          packetsReceived:
            participant
              .packetsReceived,

          bytesReceived:
            participant
              .bytesReceived,

          packetsForwarded:
            participant
              .packetsForwarded,

          bytesForwarded:
            participant
              .bytesForwarded,

          packetsDropped:
            participant
              .packetsDropped,

          bytesDropped:
            participant
              .bytesDropped,

          enabledAt:
            participant
              .enabledAt,

          lastEnabledAt:
            participant
              .lastEnabledAt,

          firstPacketReceivedAt:
            participant
              .firstPacketReceivedAt ||
            null,

          firstPacketForwardedAt:
            participant
              .firstPacketForwardedAt ||
            null,

          reason:
            participant.reason,

          isHost:
            participant.isHost,
        },
      });
    }
  );
}
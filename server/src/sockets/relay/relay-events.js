import {
  getRoom,
  isRoomMember,
} from "../rooms/room-utils.js";

import {
  MAX_RELAY_PACKET_BYTES,
  RELAY_BYTES_PER_SECOND,
  consumeRelayQuota,
  createRelayParticipant,
  emitRelayPacket,
  getRelayParticipants,
  getRelayState,
  normalizeRelayPacket,
  notifyRelayState,
  removeRelayParticipant,
} from "./relay-store.js";

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

      if (
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        ack?.({
          success: false,

          error:
            "No perteneces a esta sala.",
        });

        return;
      }

      const participants =
        getRelayParticipants(
          roomId
        );

      const existing =
        participants.get(
          socket.id
        );

      if (existing) {
        existing.isHost =
          room.host ===
          socket.id;

        existing.reason =
          reason;

        existing.lastEnabledAt =
          Date.now();
      } else {
        participants.set(
          socket.id,

          createRelayParticipant({
            socketId:
              socket.id,

            isHost:
              room.host ===
              socket.id,

            reason,
          })
        );
      }

      socket.join(
        `game-relay-${roomId}`
      );

      console.log(
        `[GameRelay] ${socket.id} activó relay en ${roomId} como ${
          room.host === socket.id
            ? "HOST"
            : "CLIENT"
        }`
      );

      notifyRelayState(
        io,
        roomId
      );

      ack?.({
        success: true,

        ...getRelayState(
          roomId
        ),

        hostSocketId:
          room.host,
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
      if (!roomId) {
        ack?.({
          success: false,

          error:
            "Sala inválida.",
        });

        return;
      }

      removeRelayParticipant(
        roomId,
        socket.id
      );

      socket.leave(
        `game-relay-${roomId}`
      );

      notifyRelayState(
        io,
        roomId
      );

      ack?.({
        success: true,

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
        !isRoomMember(
          socket.id,
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
        sender.packetsDropped +=
          1;

        return;
      }

      if (
        buffer.length === 0 ||
        buffer.length >
          MAX_RELAY_PACKET_BYTES
      ) {
        sender.packetsDropped +=
          1;

        sender.bytesDropped +=
          buffer.length;

        return;
      }

      if (
        !consumeRelayQuota(
          sender,
          buffer.length
        )
      ) {
        socket.emit(
          "game-relay-rate-limited",
          {
            roomId,

            limitBytesPerSecond:
              RELAY_BYTES_PER_SECOND,
          }
        );

        return;
      }

      const senderIsHost =
        socket.id ===
        room.host;

      /*
       * Un cliente sólo puede enviar
       * paquetes al host.
       */
      if (!senderIsHost) {
        if (
          !participants.has(
            room.host
          )
        ) {
          return;
        }

        emitRelayPacket({
          io,

          targetSocketId:
            room.host,

          roomId,

          sourceSocketId:
            socket.id,

          packet:
            buffer,

          senderParticipant:
            sender,
        });

        return;
      }

      /*
       * El host puede responder a
       * un cliente concreto.
       */
      if (toSocketId) {
        if (
          toSocketId ===
            socket.id ||
          !participants.has(
            toSocketId
          ) ||
          !isRoomMember(
            toSocketId,
            roomId
          )
        ) {
          return;
        }

        emitRelayPacket({
          io,

          targetSocketId:
            toSocketId,

          roomId,

          sourceSocketId:
            socket.id,

          packet:
            buffer,

          senderParticipant:
            sender,
        });

        return;
      }

      /*
       * Sin destino concreto, el host
       * reenvía a todos los clientes.
       */
      for (const targetSocketId of
        participants.keys()) {
        if (
          targetSocketId ===
            socket.id ||
          !isRoomMember(
            targetSocketId,
            roomId
          )
        ) {
          continue;
        }

        emitRelayPacket({
          io,

          targetSocketId,

          roomId,

          sourceSocketId:
            socket.id,

          packet:
            buffer,

          senderParticipant:
            sender,
        });
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
      const participant =
        getRelayParticipants(
          roomId,
          false
        )?.get(socket.id);

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

          reason:
            participant.reason,
        },
      });
    }
  );
}
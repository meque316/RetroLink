import {
  getRoom,
  isRoomMember,
} from "../rooms/room-utils.js";

import {
  notifyRelayState,
  removeRelayParticipant,
} from "../relay/relay-store.js";

export function registerWebRTCEvents({
  io,
  socket,
}) {
  socket.on(
    "webrtc-join",
    (
      {
        roomId,
        isHost,
        hostIP,
      } = {},
      ack
    ) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        ack?.({
          success: false,

          otherPeerPresent:
            false,

          error:
            "No perteneces a la sala.",
        });

        return;
      }

      socket.join(
        `webrtc-${roomId}`
      );

      socket.data.webrtcRoomId =
        roomId;

      socket.data.isWebrtcHost =
        Boolean(isHost);

      if (isHost) {
        /*
         * Evita que un cliente se haga pasar
         * por host de la sala.
         */
        if (
          room.host !== socket.id
        ) {
          socket.leave(
            `webrtc-${roomId}`
          );

          ack?.({
            success: false,

            otherPeerPresent:
              false,

            error:
              "Sólo el host de la sala puede iniciar como host WebRTC.",
          });

          return;
        }

        if (hostIP) {
          room.hostPublicIp =
            hostIP;
        }
      } else {
        /*
         * Entregamos la IP almacenada aunque
         * el host haya entrado anteriormente.
         */
        if (room.hostPublicIp) {
          socket.emit(
            "webrtc-host-ip",
            {
              hostIP:
                room.hostPublicIp,
            }
          );
        }

        socket
          .to(
            `webrtc-${roomId}`
          )
          .emit(
            "webrtc-peer-ready",
            {
              fromSocketId:
                socket.id,
            }
          );
      }

      const peers =
        io.sockets.adapter.rooms.get(
          `webrtc-${roomId}`
        )?.size || 0;

      ack?.({
        success: true,

        otherPeerPresent:
          peers > 1,
      });
    }
  );

  socket.on(
    "webrtc-signal",
    ({
      roomId,
      toSocketId,
      ...signal
    } = {}) => {
      if (
        !isRoomMember(
          socket.id,
          roomId
        )
      ) {
        return;
      }

      if (toSocketId) {
        if (
          !isRoomMember(
            toSocketId,
            roomId
          )
        ) {
          return;
        }

        io.to(toSocketId).emit(
          "webrtc-signal",
          {
            ...signal,

            fromSocketId:
              socket.id,
          }
        );

        return;
      }

      socket
        .to(
          `webrtc-${roomId}`
        )
        .emit(
          "webrtc-signal",
          {
            ...signal,

            fromSocketId:
              socket.id,
          }
        );
    }
  );

  socket.on(
    "webrtc-client-port",
    ({
      roomId,
      port,
      toSocketId,
    } = {}) => {
      const room =
        getRoom(roomId);

      if (
        !room ||
        room.host !== socket.id ||
        !toSocketId ||
        !Number.isInteger(port) ||
        !isRoomMember(
          toSocketId,
          roomId
        )
      ) {
        return;
      }

      io.to(toSocketId).emit(
        "webrtc-client-port",
        {
          port,
        }
      );
    }
  );

  socket.on(
    "webrtc-leave",
    ({
      roomId,
    } = {}) => {
      if (!roomId) {
        return;
      }

      if (
        !socket.data.isWebrtcHost
      ) {
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

      if (
        socket.data.webrtcRoomId ===
        roomId
      ) {
        delete socket.data
          .webrtcRoomId;

        delete socket.data
          .isWebrtcHost;
      }

      notifyRelayState(
        io,
        roomId
      );
    }
  );
}
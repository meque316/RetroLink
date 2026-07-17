import {
  getRoom,
} from "../rooms/room-utils.js";

import {
  notifyRelayState,
  removeRelayParticipant,
} from "../relay/relay-store.js";

function getWebRTCRoomName(
  roomId
) {
  return `webrtc-${roomId}`;
}

function getGameRelayRoomName(
  roomId
) {
  return `game-relay-${roomId}`;
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

function isValidPort(port) {
  return (
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
}

function clearBridgeSocketData(
  socket
) {
  delete socket.data
    .webrtcRoomId;

  delete socket.data
    .isWebrtcHost;

  delete socket.data
    .bridgeRole;
}

function leaveBridgeRoom({
  io,
  socket,
  roomId,
  notifyPeers = true,
}) {
  if (!roomId) {
    return;
  }

  const room =
    getRoom(roomId);

  const wasHost =
    Boolean(
      socket.data.isWebrtcHost
    );

  const webrtcRoomName =
    getWebRTCRoomName(
      roomId
    );

  const relayRoomName =
    getGameRelayRoomName(
      roomId
    );

  if (wasHost) {
    if (
      room?.webrtcHostSocketId ===
      socket.id
    ) {
      delete room
        .webrtcHostSocketId;
    }

    if (notifyPeers) {
      socket
        .to(webrtcRoomName)
        .emit(
          "webrtc-host-left",
          {
            socketId:
              socket.id,
          }
        );
    }
  } else if (notifyPeers) {
    socket
      .to(webrtcRoomName)
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
    relayRoomName
  );

  socket.leave(
    webrtcRoomName
  );

  clearBridgeSocketData(
    socket
  );

  notifyRelayState(
    io,
    roomId
  );

  console.log(
    `[WebRTC] ${socket.id} abandonó ${roomId} como ${
      wasHost
        ? "HOST"
        : "CLIENT"
    }`
  );
}

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
      if (
        !roomId ||
        typeof roomId !==
          "string"
      ) {
        ack?.({
          success: false,
          otherPeerPresent:
            false,
          error:
            "Sala inválida.",
        });

        return;
      }

      const room =
        getRoom(roomId);

      if (!room) {
        ack?.({
          success: false,
          otherPeerPresent:
            false,
          error:
            "La sala no existe.",
        });

        return;
      }

      const requestedHostRole =
        Boolean(isHost);

      /*
       * Si este socket ya estaba unido a otra sala,
       * limpiamos primero su estado anterior.
       */
      const previousRoomId =
        socket.data.webrtcRoomId;

      if (
        previousRoomId &&
        previousRoomId !==
          roomId
      ) {
        leaveBridgeRoom({
          io,
          socket,
          roomId:
            previousRoomId,
        });
      }

      /*
       * Sólo puede existir un bridge host activo
       * por sala.
       */
      if (
        requestedHostRole &&
        room.webrtcHostSocketId &&
        room.webrtcHostSocketId !==
          socket.id &&
        isSocketInRoom(
          io,
          room.webrtcHostSocketId,
          getWebRTCRoomName(
            roomId
          )
        )
      ) {
        ack?.({
          success: false,
          otherPeerPresent:
            true,
          error:
            "La sala ya tiene un bridge host activo.",
        });

        return;
      }

      /*
       * Si quedó guardado un host antiguo que ya no está
       * conectado a la sala WebRTC, eliminamos la referencia.
       */
      if (
        room.webrtcHostSocketId &&
        !isSocketInRoom(
          io,
          room.webrtcHostSocketId,
          getWebRTCRoomName(
            roomId
          )
        )
      ) {
        delete room
          .webrtcHostSocketId;
      }

      socket.join(
        getWebRTCRoomName(
          roomId
        )
      );

      socket.data.webrtcRoomId =
        roomId;

      socket.data.isWebrtcHost =
        requestedHostRole;

      socket.data.bridgeRole =
        requestedHostRole
          ? "host"
          : "client";

      /*
       * Estos son IDs de las conexiones del bridge
       * Electron, no IDs de los sockets del lobby.
       */
      if (requestedHostRole) {
        room.webrtcHostSocketId =
          socket.id;

        if (
          typeof hostIP ===
            "string" &&
          hostIP.trim()
        ) {
          room.hostPublicIp =
            hostIP.trim();
        }

        /*
         * Si ya había clientes esperando, les avisamos
         * que el host bridge está disponible.
         */
        socket
          .to(
            getWebRTCRoomName(
              roomId
            )
          )
          .emit(
            "webrtc-host-ready",
            {
              hostSocketId:
                socket.id,

              hostIP:
                room.hostPublicIp ||
                null,
            }
          );
      } else {
        if (
          room.hostPublicIp
        ) {
          socket.emit(
            "webrtc-host-ip",
            {
              hostIP:
                room.hostPublicIp,
            }
          );
        }

        const bridgeHostSocketId =
          room.webrtcHostSocketId;

        if (
          bridgeHostSocketId &&
          bridgeHostSocketId !==
            socket.id &&
          isSocketInRoom(
            io,
            bridgeHostSocketId,
            getWebRTCRoomName(
              roomId
            )
          )
        ) {
          io.to(
            bridgeHostSocketId
          ).emit(
            "webrtc-peer-ready",
            {
              fromSocketId:
                socket.id,
            }
          );
        }
      }

      const peers =
        io.sockets.adapter.rooms
          .get(
            getWebRTCRoomName(
              roomId
            )
          )?.size || 0;

      console.log(
        `[WebRTC] ${socket.id} unido a ${roomId} como ${
          requestedHostRole
            ? "HOST"
            : "CLIENT"
        }. Peers: ${peers}`
      );

      ack?.({
        success: true,

        otherPeerPresent:
          peers > 1,

        role:
          requestedHostRole
            ? "host"
            : "client",

        hostSocketId:
          room.webrtcHostSocketId ||
          null,
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
        !roomId ||
        socket.data.webrtcRoomId !==
          roomId
      ) {
        return;
      }

      const webrtcRoomName =
        getWebRTCRoomName(
          roomId
        );

      /*
       * Una señal dirigida sólo puede enviarse a otro
       * bridge registrado en la misma sala WebRTC.
       */
      if (toSocketId) {
        if (
          toSocketId ===
            socket.id ||
          !isSocketInRoom(
            io,
            toSocketId,
            webrtcRoomName
          )
        ) {
          return;
        }

        io.to(
          toSocketId
        ).emit(
          "webrtc-signal",
          {
            ...signal,

            fromSocketId:
              socket.id,
          }
        );

        return;
      }

      /*
       * Sin destino explícito, se transmite únicamente
       * a los demás bridges de la misma sala.
       */
      socket
        .to(webrtcRoomName)
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
      if (
        !roomId ||
        socket.data.webrtcRoomId !==
          roomId ||
        !socket.data.isWebrtcHost ||
        !toSocketId ||
        toSocketId ===
          socket.id ||
        !isValidPort(port)
      ) {
        return;
      }

      const webrtcRoomName =
        getWebRTCRoomName(
          roomId
        );

      /*
       * El host sólo puede asignar puertos a clientes
       * bridge que pertenezcan a su misma sala.
       */
      if (
        !isSocketInRoom(
          io,
          toSocketId,
          webrtcRoomName
        )
      ) {
        return;
      }

      io.to(
        toSocketId
      ).emit(
        "webrtc-client-port",
        {
          port,

          fromSocketId:
            socket.id,
        }
      );

      console.log(
        `[WebRTC] Host bridge ${socket.id} asignó puerto ${port} al cliente bridge ${toSocketId}`
      );
    }
  );

  socket.on(
    "webrtc-leave",
    (
      {
        roomId,
      } = {},
      ack
    ) => {
      const joinedRoomId =
        socket.data.webrtcRoomId;

      if (
        !joinedRoomId ||
        roomId !==
          joinedRoomId
      ) {
        ack?.({
          success: false,

          error:
            "El bridge no pertenece a esa sala.",
        });

        return;
      }

      leaveBridgeRoom({
        io,
        socket,
        roomId:
          joinedRoomId,
      });

      ack?.({
        success: true,
      });
    }
  );
}
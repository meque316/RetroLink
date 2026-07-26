// electron/bridge/core/signaling/index.js

function configureSignaling({
  signaling,
  NDC,
  getState,
  sendStatus,
  getLocalIP,
  getNextClientPort,
  createHostPeer,
  createClientPeer,
  flushHostCandidates,
  flushClientCandidates,
  cleanupClient,
}) {
  if (!signaling) {
    throw new Error(
      "[Core-Signaling] signaling es obligatorio."
    );
  }

  if (typeof getState !== "function") {
    throw new Error(
      "[Core-Signaling] getState debe ser una función."
    );
  }

  signaling.on(
    "connect_error",
    (error) => {
      console.error(
        "[Core-Signaling] Error de señalización:",
        error.message
      );

      sendStatus(
        "Error al conectar al servidor de señales."
      );
    }
  );

  signaling.on(
    "connect",
    () => {
      const state = getState();

      console.log(
        "[Core-Signaling] Signaling conectado:",
        signaling.id
      );

      if (state.isHost) {
        state.hostIP =
          getLocalIP();
      }

      signaling.emit(
        "webrtc-join",
        {
          roomId:
            state.roomId,
          isHost:
            state.isHost,
          hostIP:
            state.hostIP,
        },
        () => {
          sendStatus(
            state.isHost
              ? "Esperando jugadores..."
              : "Buscando rival en la sala..."
          );
        }
      );
    }
  );

  signaling.on(
    "webrtc-host-ip",
    ({ hostIP } = {}) => {
      const state = getState();

      if (
        !state.isHost &&
        hostIP
      ) {
        state.hostIP =
          hostIP;
      }
    }
  );

  signaling.on(
    "webrtc-peer-ready",
    ({ fromSocketId } = {}) => {
      const state = getState();

      if (
        !state.isHost ||
        !fromSocketId ||
        state.clients.has(
          fromSocketId
        )
      ) {
        return;
      }

      const clientPort =
        getNextClientPort(
          state
        );

      if (!clientPort) {
        sendStatus(
          "La sala alcanzó su máximo de jugadores."
        );

        return;
      }

      state.clients.set(
        fromSocketId,
        {
          peer: null,
          channel: null,
          udpTransport: null,
          transportManager: null,
          relayTransport: null,
          switchingToRelay: false,

          clientPort,

          pendingCandidates: [],
          remoteDescSet: false,

          iceConnectionState:
            null,
          iceTimeoutHandle:
            null,

          gatheredCandidateTypes:
            new Set(),
        }
      );

      sendStatus(
        "Rival encontrado. Creando conexión P2P..."
      );

      createHostPeer(
        NDC,
        signaling,
        fromSocketId
      );
    }
  );

  signaling.on(
    "webrtc-client-port",
    ({ port } = {}) => {
      const state = getState();

      if (
        !state.isHost &&
        Number.isInteger(port)
      ) {
        state.clientPort =
          port;

        console.log(
          `[Core-Signaling] Puerto cliente asignado: ${port}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-signal",
    ({
      type,
      sdp,
      candidate,
      mid,
      fromSocketId,
    } = {}) => {
      const state = getState();

      try {
        if (state.isHost) {
          const client =
            state.clients.get(
              fromSocketId
            );

          if (!client) {
            return;
          }

          if (
            type === "answer"
          ) {
            client.peer.setRemoteDescription(
              sdp,
              "answer"
            );

            client.remoteDescSet =
              true;

            flushHostCandidates(
              fromSocketId
            );

            return;
          }

          if (
            type === "candidate"
          ) {
            client.pendingCandidates.push({
              candidate,
              mid,
            });

            flushHostCandidates(
              fromSocketId
            );
          }

          return;
        }

        if (
          type === "offer"
        ) {
          if (!state.peer) {
            createClientPeer(
              NDC,
              signaling
            );
          }

          sendStatus(
            "Procesando oferta de conexión..."
          );

          /*
           * node-datachannel genera automáticamente
           * la respuesta después de recibir la oferta.
           * No debe llamarse después a
           * setLocalDescription(), porque eso
           * generaría una nueva oferta.
           */
          state.peer.setRemoteDescription(
            sdp,
            "offer"
          );

          state.remoteDescSet =
            true;

          flushClientCandidates();

          return;
        }

        if (
          type === "candidate"
        ) {
          state.pendingCandidates.push({
            candidate,
            mid,
          });

          flushClientCandidates();
        }
      } catch (error) {
        console.error(
          "[Core-Signaling] Error procesando señal:",
          error.message
        );

        sendStatus(
          `Error procesando señal: ${error.message}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-client-left",
    ({ socketId } = {}) => {
      const state = getState();

      if (
        !state.isHost ||
        !socketId
      ) {
        return;
      }

      cleanupClient(
        socketId
      );

      sendStatus(
        state.clients.size > 0
          ? `${state.clients.size} jugador(es) conectado(s)`
          : "Esperando jugadores..."
      );
    }
  );
}

module.exports = {
  configureSignaling,
};
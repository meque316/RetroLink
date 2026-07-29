// electron/bridge/core/relay.js

function createRelayModule() {
  let deps = null;

  function initializeRelay(injectedDeps) {
    deps = injectedDeps;
  }

  function isRelayActiveOrConnecting(
    relayTransport
  ) {
    if (!relayTransport) {
      return false;
    }

    if (relayTransport.isOpen?.()) {
      return true;
    }

    const relayState =
      relayTransport.getState?.();

    return (
      relayState?.state ===
        "connecting" ||
      relayState?.state === "open"
    );
  }

  function normalizeErrorMessage(
    error
  ) {
    return (
      error?.message ||
      String(error)
    );
  }

  /*
   * Activa (o reutiliza) el transporte Relay de un cliente
   * del host concreto. Es idempotente:
   *
   * - Si ya hay un relay abierto o conectando, no crea otro
   *   ni vuelve a llamar useRelay().
   * - Si hay un relay CLOSED/ERROR, lo descarta y crea uno
   *   nuevo.
   * - useRelay() se llama exactamente una vez, justo después
   *   de crear el relayTransport (useRelay() ya dispara
   *   connect() internamente).
   * - Los callbacks capturan la instancia local (relayTransport)
   *   y se ignoran a sí mismos si client.relayTransport ya
   *   cambió (instancia obsoleta).
   */
  function activateHostRelay(
    socketId,
    reason = "ice-failed"
  ) {
    const state = deps.getState();

    const client =
      deps.ensureHostTransportResources(
        socketId
      );

    if (
      !client ||
      !state.signalingSocket ||
      !state.roomId
    ) {
      return false;
    }

    if (
      isRelayActiveOrConnecting(
        client.relayTransport
      )
    ) {
      return true;
    }

    if (client.relayTransport) {
      try {
        client.relayTransport.close?.();
      } catch {}

      client.relayTransport = null;
    }

    client.switchingToRelay = true;

    const relayTransport =
      deps.createSocketRelayTransport({
        socket:
          state.signalingSocket,
        roomId: state.roomId,
        isHost: true,
        peerSocketId: socketId,
        reason,

        onPacket(buffer, metadata) {
          if (
            client.relayTransport !==
            relayTransport
          ) {
            return;
          }

          client.transportManager
            ?.handleRelayMessage(
              buffer,
              metadata
            );
        },

        onConnected() {
          if (
            client.relayTransport !==
            relayTransport
          ) {
            return;
          }

          client.switchingToRelay =
            false;

          deps.sendStatus(
            "Relay activado con el cliente."
          );
        },

        onDisconnected() {
          if (
            client.relayTransport !==
            relayTransport
          ) {
            return;
          }

          client.relayTransport = null;
          client.switchingToRelay =
            false;

          const currentMode =
            client.transportManager
              ?.getState?.()
              ?.mode;

          if (currentMode === "relay") {
            client.transportManager.disableRelay();
          }
        },

        onError(error) {
          if (
            client.relayTransport !==
            relayTransport
          ) {
            return;
          }

          const message =
            normalizeErrorMessage(
              error
            );

          console.error(
            `[Bridge-Q3] Error relay host ${socketId}:`,
            message
          );

          client.switchingToRelay =
            false;

          if (
            !client.transportManager
              ?.isWebRTCOpen()
          ) {
            deps.sendStatus(
              `No se pudo conectar con el jugador ${socketId}: falló WebRTC y Relay.`
            );
          }
        },

        onRateLimited(info) {
          if (
            client.relayTransport !==
            relayTransport
          ) {
            return;
          }

          console.warn(
            `[Bridge-Q3] Relay host limitado para ${socketId}:`,
            info
          );
        },
      });

    client.relayTransport =
      relayTransport;

    client.transportManager?.useRelay(
      relayTransport
    );

    return true;
  }

  /*
   * Igual que activateHostRelay(), pero para el cliente
   * local. No usa peerSocketId: el cliente se relaciona con
   * el host únicamente mediante roomId.
   */
  function activateClientRelay(
    reason = "ice-failed"
  ) {
    const state = deps.getState();

    deps.ensureClientTransportResources();

    if (
      !state.signalingSocket ||
      !state.roomId
    ) {
      return false;
    }

    if (
      isRelayActiveOrConnecting(
        state.relayTransport
      )
    ) {
      return true;
    }

    if (state.relayTransport) {
      try {
        state.relayTransport.close?.();
      } catch {}

      state.relayTransport = null;
    }

    state.switchingToRelay = true;

    const relayTransport =
      deps.createSocketRelayTransport({
        socket:
          state.signalingSocket,
        roomId: state.roomId,
        isHost: false,
        peerSocketId: null,
        reason,

        onPacket(buffer, metadata) {
          if (
            state.relayTransport !==
            relayTransport
          ) {
            return;
          }

          state.transportManager
            ?.handleRelayMessage(
              buffer,
              metadata
            );
        },

        onConnected() {
          if (
            state.relayTransport !==
            relayTransport
          ) {
            return;
          }

          state.switchingToRelay =
            false;

          deps.sendStatus(
            "Conexión establecida mediante Relay."
          );
        },

        onDisconnected() {
          if (
            state.relayTransport !==
            relayTransport
          ) {
            return;
          }

          state.relayTransport = null;
          state.switchingToRelay =
            false;

          const currentMode =
            state.transportManager
              ?.getState?.()
              ?.mode;

          if (currentMode === "relay") {
            state.transportManager.disableRelay();
          }
        },

        onError(error) {
          if (
            state.relayTransport !==
            relayTransport
          ) {
            return;
          }

          const message =
            normalizeErrorMessage(
              error
            );

          console.error(
            "[Bridge-Q3] Error relay cliente:",
            message
          );

          state.switchingToRelay =
            false;

          if (
            !state.transportManager
              ?.isWebRTCOpen()
          ) {
            deps.sendStatus(
              "No se pudo conectar: falló WebRTC y Relay."
            );
          }
        },

        onRateLimited(info) {
          if (
            state.relayTransport !==
            relayTransport
          ) {
            return;
          }

          console.warn(
            "[Bridge-Q3] Relay cliente limitado:",
            info
          );
        },
      });

    state.relayTransport =
      relayTransport;

    state.transportManager?.useRelay(
      relayTransport
    );

    return true;
  }

  return {
    initializeRelay,
    isRelayActiveOrConnecting,
    activateHostRelay,
    activateClientRelay,
  };
}

module.exports = {
  createRelayModule,
};
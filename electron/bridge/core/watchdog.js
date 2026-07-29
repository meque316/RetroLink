// electron/bridge/core/watchdog.js

function createWatchdogModule() {
  let deps = null;

  function initializeWatchdog(injectedDeps) {
    deps = injectedDeps;
  }

  function assertInitialized() {
    if (!deps) {
      throw new Error(
        "[Watchdog] El módulo no fue inicializado."
      );
    }
  }

  function createHostWatchdog(
    socketId,
    client
  ) {
    assertInitialized();

    deps.clearClientTimeout(client);

    client.iceTimeoutHandle =
      setTimeout(async () => {
        const currentClient =
          deps.getState()
            .clients
            .get(socketId);

        if (!currentClient) {
          return;
        }

        if (
          currentClient.iceConnectionState ===
            "connected" ||
          currentClient.iceConnectionState ===
            "completed" ||
          currentClient.transportManager
            ?.isWebRTCOpen()
        ) {
          currentClient.iceTimeoutHandle =
            null;

          return;
        }

        if (
          currentClient.switchingToRelay ||
          currentClient.transportManager
            ?.isRelayOpen() ||
          deps.isRelayActiveOrConnecting(
            currentClient.relayTransport
          )
        ) {
          currentClient.iceTimeoutHandle =
            null;

          return;
        }

        const candidates =
          deps.describeCandidateTypes(
            currentClient
              .gatheredCandidateTypes
          );

        console.error(
          `${deps.logPrefix || "[Bridge]"} Timeout ICE con ${socketId}. Estado: ${
            currentClient
              .iceConnectionState ||
            "desconocido"
          }. Candidatos: ${candidates}.`
        );

        currentClient.iceTimeoutHandle =
          null;

        currentClient.transportManager
          ?.disableWebRTC();

        /*
         * Marcamos la transición ANTES de esperar a Relay:
         * evita que channel.onClosed() (u otro evento
         * concurrente) elimine al cliente de state.clients
         * mientras activateHostRelay() todavía se está
         * inicializando.
         */
        currentClient.switchingToRelay =
          true;

        console.log(
          `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Iniciando fallback host: ${socketId}`
        );

        let relayStarted = false;

        try {
          relayStarted =
            await deps.activateHostRelay(
              socketId,
              "ice-timeout"
            );
        } catch (error) {
          console.error(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Error activando Relay host:`,
            error
          );

          relayStarted = false;
        }

        /*
         * El cliente pudo haber sido eliminado mientras
         * esperábamos (ej. desconexión real). Releemos el
         * estado antes de tocar sus recursos.
         */
        const clientAfterRelay =
          deps.getState()
            .clients
            .get(socketId);

        if (!clientAfterRelay) {
          return;
        }

        if (relayStarted) {
          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Relay host inicializado: ${socketId}`
          );

          clientAfterRelay.closingWebRTCForRelay =
            true;

          deps.closeHostWebRTCResources(
            socketId,
            clientAfterRelay
          );

          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Cerrando WebRTC después de activar Relay: ${socketId}`
          );

          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Cliente conservado durante transición: ${socketId}`
          );
        } else {
          clientAfterRelay.switchingToRelay =
            false;

          console.error(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Relay host no pudo iniciarse: ${socketId}`
          );
        }

        deps.sendStatus(
          relayStarted
            ? "P2P agotó el tiempo de espera. Intentando Relay..."
            : "Tiempo de espera agotado. La red puede requerir un servidor TURN."
        );
      }, deps.ICE_CONNECT_TIMEOUT_MS);
  }

  function createClientWatchdog() {
    assertInitialized();

    const state = deps.getState();

    if (state.iceTimeoutHandle) {
      clearTimeout(
        state.iceTimeoutHandle
      );
    }

    state.iceTimeoutHandle =
      setTimeout(async () => {
        const currentState =
          deps.getState();

        if (
          currentState
            .iceConnectionState ===
              "connected" ||
          currentState
            .iceConnectionState ===
              "completed" ||
          currentState
            .transportManager
            ?.isWebRTCOpen()
        ) {
          currentState.iceTimeoutHandle =
            null;

          return;
        }

        if (
          currentState
            .switchingToRelay ||
          currentState
            .transportManager
            ?.isRelayOpen() ||
          deps.isRelayActiveOrConnecting(
            currentState
              .relayTransport
          )
        ) {
          currentState.iceTimeoutHandle =
            null;

          return;
        }

        const candidates =
          deps.describeCandidateTypes(
            currentState
              .gatheredCandidateTypes
          );

        console.error(
          `${deps.logPrefix || "[Bridge]"} Timeout ICE cliente. Estado: ${
            currentState
              .iceConnectionState ||
            "desconocido"
          }. Candidatos: ${candidates}.`
        );

        currentState.iceTimeoutHandle =
          null;

        currentState.transportManager
          ?.disableWebRTC();

        currentState.switchingToRelay =
          true;

        console.log(
          `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Iniciando fallback cliente`
        );

        let relayStarted = false;

        try {
          relayStarted =
            await deps.activateClientRelay(
              "ice-timeout"
            );
        } catch (error) {
          console.error(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Error activando Relay cliente:`,
            error
          );

          relayStarted = false;
        }

        const stateAfterRelay =
          deps.getState();

        if (relayStarted) {
          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Relay cliente inicializado`
          );

          stateAfterRelay.closingWebRTCForRelay =
            true;

          deps.closeClientWebRTCResources();

          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Cerrando WebRTC después de activar Relay (cliente)`
          );

          console.log(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Cliente conservado durante transición (self)`
          );
        } else {
          stateAfterRelay.switchingToRelay =
            false;

          console.error(
            `${deps.logPrefix || "[Bridge]"} [Relay-Fallback] Relay cliente no pudo iniciarse`
          );
        }

        deps.sendStatus(
          relayStarted
            ? "P2P agotó el tiempo de espera. Intentando Relay..."
            : "Tiempo de espera agotado. La red puede requerir un servidor TURN."
        );
      }, deps.ICE_CONNECT_TIMEOUT_MS);
  }

  return {
    initializeWatchdog,
    createHostWatchdog,
    createClientWatchdog,
  };
}

module.exports = {
  createWatchdogModule,
};
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
      setTimeout(() => {
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
          `${deps.logPrefix} Timeout ICE con ${socketId}. Estado: ${
            currentClient
              .iceConnectionState ||
            "desconocido"
          }. Candidatos: ${candidates}.`
        );

        currentClient.iceTimeoutHandle =
          null;

        currentClient.transportManager
          ?.disableWebRTC();

        const relayStarted =
          deps.activateHostRelay(
            socketId,
            "ice-timeout"
          );

        if (relayStarted) {
          deps.closeHostWebRTCResources(
            socketId,
            currentClient
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
      setTimeout(() => {
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
          `${deps.logPrefix} Timeout ICE cliente. Estado: ${
            currentState
              .iceConnectionState ||
            "desconocido"
          }. Candidatos: ${candidates}.`
        );

        currentState.iceTimeoutHandle =
          null;

        currentState.transportManager
          ?.disableWebRTC();

        const relayStarted =
          deps.activateClientRelay(
            "ice-timeout"
          );

        if (relayStarted) {
          deps.closeClientWebRTCResources();
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
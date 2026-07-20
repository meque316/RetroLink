// electron/bridge/quake3/watchdog.js

let deps = null;

function initializeWatchdog(injectedDeps) {
  deps = injectedDeps;
}

function createHostWatchdog(
  socketId,
  client
) {
  deps.clearClientTimeout(client);

  client.iceTimeoutHandle =
    setTimeout(() => {
      if (
        client.iceConnectionState ===
          "connected" ||
        client.iceConnectionState ===
          "completed"
      ) {
        return;
      }

      /*
       * Evita fallback duplicado si onStateChange("failed")
       * ya activó Relay para este mismo cliente.
       */
      if (
        client.switchingToRelay ||
        client.transportManager
          ?.isRelayOpen() ||
        deps.isRelayActiveOrConnecting(
          client.relayTransport
        )
      ) {
        return;
      }

      const candidates =
        deps.describeCandidateTypes(
          client.gatheredCandidateTypes
        );

      console.error(
        `[Bridge-Q3] Timeout ICE con ${socketId}. Estado: ${
          client.iceConnectionState ||
          "desconocido"
        }. Candidatos: ${candidates}.`
      );

      client.transportManager
        ?.disableWebRTC();

      const relayStarted =
        deps.activateHostRelay(
          socketId,
          "ice-timeout"
        );

      if (relayStarted) {
        deps.closeHostWebRTCResources(
          socketId,
          client
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
  const state = deps.getState();

  if (state.iceTimeoutHandle) {
    clearTimeout(
      state.iceTimeoutHandle
    );
  }

  state.iceTimeoutHandle =
    setTimeout(() => {
      const state = deps.getState();

      if (
        state.iceConnectionState ===
          "connected" ||
        state.iceConnectionState ===
          "completed"
      ) {
        return;
      }

      /*
       * Evita fallback duplicado si onStateChange("failed")
       * ya activó Relay.
       */
      if (
        state.switchingToRelay ||
        state.transportManager
          ?.isRelayOpen() ||
        deps.isRelayActiveOrConnecting(
          state.relayTransport
        )
      ) {
        return;
      }

      const candidates =
        deps.describeCandidateTypes(
          state.gatheredCandidateTypes
        );

      console.error(
        `[Bridge-Q3] Timeout ICE cliente. Estado: ${
          state.iceConnectionState ||
          "desconocido"
        }. Candidatos: ${candidates}.`
      );

      if (state.iceTimeoutHandle) {
        clearTimeout(
          state.iceTimeoutHandle
        );

        state.iceTimeoutHandle =
          null;
      }

      state.transportManager
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

module.exports = {
  initializeWatchdog,
  createHostWatchdog,
  createClientWatchdog,
};

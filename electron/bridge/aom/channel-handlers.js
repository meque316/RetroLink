// electron/bridge/aom/channel-handlers.js

function getDebugStateId(state) {
  globalThis.__RETROLINK_STATE_IDS__ ||=
    new WeakMap();

  globalThis.__RETROLINK_STATE_ID_COUNTER__ ||=
    0;

  if (
    state &&
    typeof state === "object" &&
    !globalThis.__RETROLINK_STATE_IDS__.has(state)
  ) {
    globalThis.__RETROLINK_STATE_ID_COUNTER__ += 1;

    globalThis.__RETROLINK_STATE_IDS__.set(
      state,
      globalThis.__RETROLINK_STATE_ID_COUNTER__
    );
  }

  return state &&
    typeof state === "object"
      ? globalThis.__RETROLINK_STATE_IDS__.get(state)
      : null;
}

function createChannelHandlers() {
  let deps = null;

  function initializeChannelHandlers(
    injectedDeps
  ) {
    deps = injectedDeps;
  }

  function handleChannelMessage(
    message,
    socketId = null
  ) {
    const state =
      deps.getState();

    const buffer =
      deps.normalizeMessage(message);

    if (deps.isKeepAlive(buffer)) {
      return;
    }

    if (state.isHost) {
      const client =
        state.clients.get(socketId);

      client?.transportManager
        ?.handleWebRTCMessage(buffer);

      return;
    }

    state.transportManager
      ?.handleWebRTCMessage(buffer);
  }

  function onHostChannelOpen(
    socketId,
    channel
  ) {
    const state =
      deps.getState();

    const client =
      deps.ensureHostTransportResources(
        socketId
      );

    if (!client) {
      return;
    }

    console.log(
      `[Bridge-AoM] DataChannel host abierto para ${socketId}`
    );

    client.channel =
      channel;

    client.transportManager.useWebRTC(
      channel
    );

    if (client.iceTimeoutHandle) {
      clearTimeout(
        client.iceTimeoutHandle
      );

      client.iceTimeoutHandle =
        null;

      console.log(
        `[Bridge-AoM] Watchdog ICE cancelado para ${socketId} (DataChannel abierto).`
      );
    }

    if (client.relayTransport) {
      client.transportManager.disableRelay();

      client.relayTransport =
        null;
    }

    client.switchingToRelay =
      false;

    deps.startKeepAlive(
      socketId,
      channel
    );

    const connected =
      [
        ...state.clients.values(),
      ].filter(
        (item) =>
          item.transportManager
            ?.isWebRTCOpen() ||
          item.transportManager
            ?.isRelayOpen()
      ).length;

    deps.sendStatus(
      `¡${connected} jugador(es) conectado(s)! Listos para jugar.`
    );
  }

  function onClientChannelOpen() {
    const state =
      deps.getState();

    const stateDebugId =
      getDebugStateId(state);

    console.log(
      `[AoM-CLIENT-OPEN 1] DataChannel cliente abierto; puerto=${state.clientPort}`,
      {
        stateDebugId,
        clientPort:
          state.clientPort,

        hasChannel:
          Boolean(state.channel),

        hasTransportManager:
          Boolean(
            state.transportManager
          ),

        hasUDPTransport:
          Boolean(
            state.udpTransport
          ),

        iceState:
          state.iceConnectionState,
      }
    );

    if (!state.clientPort) {
      console.error(
        "[AoM-CLIENT-OPEN ERROR] No se recibió clientPort."
      );

      deps.sendStatus(
        "Error: no se recibió el puerto local del cliente."
      );

      return;
    }

    deps.ensureClientTransportResources();

    const stateAfter =
      deps.getState();

    console.log(
      "[AoM-CLIENT-OPEN 2] Recursos de transporte preparados.",
      {
        stateDebugId:
          getDebugStateId(
            stateAfter
          ),

        clientPort:
          stateAfter.clientPort,

        hasTransportManager:
          Boolean(
            stateAfter.transportManager
          ),

        hasUDPTransport:
          Boolean(
            stateAfter.udpTransport
          ),
      }
    );

    state.transportManager.useWebRTC(
      state.channel
    );

    if (state.iceTimeoutHandle) {
      clearTimeout(
        state.iceTimeoutHandle
      );

      state.iceTimeoutHandle =
        null;
    }

    if (state.relayTransport) {
      state.transportManager.disableRelay();

      state.relayTransport =
        null;
    }

    state.switchingToRelay =
      false;

    deps.startKeepAlive(
      "self",
      state.channel
    );

    deps.sendStatus(
      "¡Conexión P2P establecida! Listos para jugar."
    );

    console.log(
      "[AoM-CLIENT-OPEN] Cliente completamente inicializado."
    );
  }

  return {
    initializeChannelHandlers,
    handleChannelMessage,
    onHostChannelOpen,
    onClientChannelOpen,
  };
}

module.exports = {
  createChannelHandlers,
};
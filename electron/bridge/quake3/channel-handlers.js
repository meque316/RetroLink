// electron/bridge/quake3/channel-handlers.js

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

  function initializeChannelHandlers(injectedDeps) {
    deps = injectedDeps;
  }

  function handleChannelMessage(
    message,
    socketId = null
  ) {
    const state = deps.getState();

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
    const state = deps.getState();

    const client =
      deps.ensureHostTransportResources(
        socketId
      );

    if (!client) {
      return;
    }

    console.log(
      `[Bridge-Q3] DataChannel host abierto para ${socketId}`
    );

    client.channel = channel;

    client.transportManager.useWebRTC(
      channel
    );

    /*
     * El DataChannel ya está abierto: el watchdog ICE ya
     * no tiene motivo para disparar.
     */
    if (client.iceTimeoutHandle) {
      clearTimeout(
        client.iceTimeoutHandle
      );

      client.iceTimeoutHandle = null;

      console.log(
        `[Bridge-Q3] Watchdog ICE cancelado para ${socketId} (DataChannel abierto).`
      );
    }

    /*
     * WebRTC volvió a estar disponible.
     */
    if (client.relayTransport) {
      client.transportManager.disableRelay();
      client.relayTransport = null;
    }

    client.switchingToRelay = false;

    deps.startKeepAlive(
      socketId,
      channel
    );

    const connected =
      [...state.clients.values()].filter(
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
    const state = deps.getState();

    const stateDebugId = getDebugStateId(state);

    console.log(
      `[CLIENT-OPEN 1] DataChannel cliente abierto; puerto=${state.clientPort}`,
      {
        stateDebugId: stateDebugId,
        clientPort: state.clientPort,
        hasChannel: Boolean(state.channel),
        hasTransportManager:
          Boolean(state.transportManager),
        hasUDPTransport:
          Boolean(state.udpTransport),
        iceState:
          state.iceConnectionState,
      }
    );

    if (!state.clientPort) {
      console.error(
        "[CLIENT-OPEN ERROR] No se recibió clientPort."
      );

      deps.sendStatus(
        "Error: no se recibió el puerto local del cliente."
      );

      return;
    }

    console.log(
      "[CLIENT-OPEN 2] Llamando ensureClientTransportResources()...",
      {
        stateDebugId: getDebugStateId(deps.getState()),
      }
    );

    deps.ensureClientTransportResources();

    const stateAfter = deps.getState();
    const stateAfterDebugId = getDebugStateId(stateAfter);

    console.log(
      "[CLIENT-OPEN 3] ensureClientTransportResources() completado.",
      {
        stateDebugId: stateAfterDebugId,
        clientPort: stateAfter.clientPort,
        hasTransportManager:
          Boolean(stateAfter.transportManager),
        hasUDPTransport:
          Boolean(stateAfter.udpTransport),
      }
    );

    console.log(
      "[CLIENT-OPEN 4] Llamando transportManager.useWebRTC()...",
      {
        stateDebugId: getDebugStateId(deps.getState()),
        hasTransportManager:
          Boolean(deps.getState().transportManager),
        hasChannel:
          Boolean(deps.getState().channel),
      }
    );

    state.transportManager.useWebRTC(
      state.channel
    );

    console.log(
      "[CLIENT-OPEN 5] useWebRTC() completado."
    );

    /*
     * El DataChannel ya está abierto: el watchdog ICE ya
     * no tiene motivo para disparar.
     */
    if (state.iceTimeoutHandle) {
      clearTimeout(
        state.iceTimeoutHandle
      );

      state.iceTimeoutHandle = null;

      console.log(
        "[CLIENT-OPEN 6] Watchdog ICE cancelado."
      );
    } else {
      console.log(
        "[CLIENT-OPEN 6] No había watchdog ICE activo."
      );
    }

    /*
     * Si veníamos usando Relay, volvemos a WebRTC.
     */
    if (state.relayTransport) {
      console.log(
        "[CLIENT-OPEN 7] Deshabilitando Relay..."
      );

      state.transportManager.disableRelay();
      state.relayTransport = null;
    }

    state.switchingToRelay = false;

    console.log(
      "[CLIENT-OPEN 8] Iniciando KeepAlive..."
    );

    deps.startKeepAlive(
      "self",
      state.channel
    );

    console.log(
      "[CLIENT-OPEN 9] KeepAlive iniciado."
    );

    deps.sendStatus(
      "¡Conexión P2P establecida! Listos para jugar."
    );

    console.log(
      "[CLIENT-OPEN 10] Cliente completamente inicializado."
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
// electron/bridge/ut99/channel-handlers.js

let deps = null;

function initializeChannelHandlers(
  injectedDeps
) {
  deps =
    injectedDeps;
}

function handleChannelMessage(
  message,
  socketId = null
) {
  const state =
    deps.getState();

  const buffer =
    deps.normalizeMessage(
      message
    );

  if (deps.isKeepAlive(buffer)) {
    return;
  }

  if (state.isHost) {
    const client =
      state.clients.get(
        socketId
      );

    client?.transportManager
      ?.handleWebRTCMessage(
        buffer
      );

    return;
  }

  state.transportManager
    ?.handleWebRTCMessage(
      buffer
    );
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
    `[Bridge-UT99] DataChannel host abierto para ${socketId}`
  );

  client.channel =
    channel;

  client.transportManager.useWebRTC(
    channel
  );

  /*
   * Si WebRTC volvió a quedar disponible,
   * TransportManager cierra el Relay anterior.
   */
  if (client.relayTransport) {
    client.transportManager
      .disableRelay();

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
    [...state.clients.values()]
      .filter(
        (item) =>
          item.transportManager
            ?.isWebRTCOpen() ||
          item.transportManager
            ?.isRelayOpen()
      )
      .length;

  deps.sendStatus(
    `¡${connected} jugador(es) conectado(s)! Listos para jugar.`
  );
}

function onClientChannelOpen() {
  const state =
    deps.getState();

  console.log(
    `[Bridge-UT99] DataChannel cliente abierto; puerto ${state.clientPort}`
  );

  if (!state.clientPort) {
    deps.sendStatus(
      "Error: no se recibió el puerto local del cliente."
    );

    return;
  }

  deps.ensureClientTransportResources();

  state.transportManager.useWebRTC(
    state.channel
  );

  /*
   * Si la conexión P2P se recuperó,
   * se desactiva el Relay anterior.
   */
  if (state.relayTransport) {
    state.transportManager
      .disableRelay();

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
}

module.exports = {
  initializeChannelHandlers,
  handleChannelMessage,
  onHostChannelOpen,
  onClientChannelOpen,
};
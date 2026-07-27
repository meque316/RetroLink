// electron/bridge/cs16/channel-handlers.js

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

  /*
   * Los mensajes keepalive sólo mantienen viva la conexión.
   * Nunca deben entregarse al juego.
   */
  if (deps.isKeepAlive(buffer)) {
    return;
  }

  if (state.isHost) {
    const client =
      state.clients.get(socketId);

    client
      ?.transportManager
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
    console.warn(
      `[Bridge-CS16] No existe el cliente ${socketId}`
    );

    return;
  }

  console.log(
    `[Bridge-CS16] DataChannel host abierto para ${socketId}`
  );

  client.channel =
    channel;

  client.transportManager
    .useWebRTC(channel);

  /*
   * Si el cliente estaba usando Relay y WebRTC se recuperó,
   * volvemos a P2P y soltamos la referencia al relay anterior.
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
      .filter((item) =>
        item.transportManager
          ?.isWebRTCOpen() ||
        item.transportManager
          ?.isRelayOpen()
      )
      .length;

  deps.sendStatus(
    `¡${connected} jugador(es) conectado(s) a Counter-Strike 1.6! Listos para jugar.`
  );
}

function onClientChannelOpen() {
  const state =
    deps.getState();

  console.log(
    `[Bridge-CS16] DataChannel cliente abierto; puerto virtual ${state.clientPort}`
  );

  if (!state.clientPort) {
    deps.sendStatus(
      "Error: no se recibió el puerto asignado al cliente."
    );

    return;
  }

  deps.ensureClientTransportResources();

  if (!state.transportManager) {
    deps.sendStatus(
      "Error: no se pudo iniciar el transporte local."
    );

    return;
  }

  state.transportManager
    .useWebRTC(state.channel);

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
    "¡Conexión P2P establecida con Counter-Strike 1.6! Listos para jugar."
  );
}

module.exports = {
  initializeChannelHandlers,
  handleChannelMessage,
  onHostChannelOpen,
  onClientChannelOpen,
};
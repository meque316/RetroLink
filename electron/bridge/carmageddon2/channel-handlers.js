// electron/bridge/carmageddon2/channel-handlers.js

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
  const state = deps.getState();

  const buffer =
    deps.normalizeMessage(message);

  if (deps.isKeepAlive(buffer)) {
    return;
  }

  if (state.isHost) {
    state.clients
      .get(socketId)
      ?.transportManager
      ?.handleWebRTCMessage(buffer, {
        socketId,
      });

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
    `[Bridge-C2] DataChannel host abierto para ${socketId}`
  );

  client.channel = channel;

  client.transportManager
    .useWebRTC(channel);

  if (client.iceTimeoutHandle) {
    clearTimeout(
      client.iceTimeoutHandle
    );

    client.iceTimeoutHandle = null;
  }

  if (client.relayTransport) {
    client.transportManager
      .disableRelay();

    client.relayTransport = null;
  }

  client.switchingToRelay = false;

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
  const state = deps.getState();

  console.log(
    "[Bridge-C2] DataChannel cliente abierto"
  );

  deps.ensureClientTransportResources();

  if (!state.transportManager) {
    deps.sendStatus(
      "Error: no se pudo iniciar el transporte IPX local."
    );

    return;
  }

  state.transportManager
    .useWebRTC(state.channel);

  if (state.iceTimeoutHandle) {
    clearTimeout(
      state.iceTimeoutHandle
    );

    state.iceTimeoutHandle = null;
  }

  if (state.relayTransport) {
    state.transportManager
      .disableRelay();

    state.relayTransport = null;
  }

  state.switchingToRelay = false;

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

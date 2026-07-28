// electron/bridge/carmageddon2/ipx-transport.js

const {
  createIPXBroadcastTransport,
  DEFAULT_IPX_PORT,
} = require("../ipx/ipx-broadcast-transport");

function normalizeBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
  }

  return Buffer.from(value);
}

function createCarmageddon2TransportModule({
  profile,
  sendStatus,
} = {}) {
  let deps = null;
  let startPromise = null;
  let startedTransport = null;

  function debugLog(...args) {
    if (profile.debugIPX) {
      console.log("[Bridge-C2]", ...args);
    }
  }

  function initializeTransport(injectedDeps) {
    deps = injectedDeps;
  }

  function assertInitialized() {
    if (!deps) {
      throw new Error(
        "[Bridge-C2-IPX] El transporte no fue inicializado."
      );
    }
  }

  function getState() {
    assertInitialized();
    return deps.getState();
  }

  function getIPXTransport() {
    return getState().udpTransport ?? null;
  }

  function injectIntoLocalGame(buffer) {
    const transport = getIPXTransport();

    if (!transport) {
      debugLog(
        "Paquete remoto descartado: transporte IPX no disponible."
      );

      return false;
    }

    Promise.resolve(
      transport.injectPacket(
        normalizeBuffer(buffer)
      )
    ).catch((error) => {
      console.error(
        "[Bridge-C2] Error reinyectando paquete IPX:",
        error.message
      );
    });

    return true;
  }

  function sendHostPacketToClients(
    buffer,
    exceptSocketId = null
  ) {
    const state = getState();
    let sentCount = 0;

    for (const [
      socketId,
      client,
    ] of state.clients) {
      if (socketId === exceptSocketId) {
        continue;
      }

      if (
        client.transportManager
          ?.send(buffer)
      ) {
        sentCount += 1;
      }
    }

    return sentCount;
  }

  function handleLocalIPXPacket(
    message,
    remoteInfo
  ) {
    const state = getState();
    const buffer =
      normalizeBuffer(message);

    debugLog(
      `IPX local: ${buffer.length} bytes`,
      remoteInfo
        ? `desde ${remoteInfo.address}:${remoteInfo.port}`
        : ""
    );

    if (state.isHost) {
      const sentCount =
        sendHostPacketToClients(buffer);

      debugLog(
        `Host → ${sentCount} cliente(s): ${buffer.length} bytes`
      );

      return;
    }

    state.transportManager
      ?.send(buffer);
  }

  function ensureSharedIPXTransport() {
    const state = getState();

    if (!state.udpTransport) {
      const transport =
        createIPXBroadcastTransport({
          label: "Bridge-C2-IPX",
          port:
            profile.ipxPort ??
            DEFAULT_IPX_PORT,
          debug:
            Boolean(profile.debugIPX),
          onPacket:
            handleLocalIPXPacket,
        });

      /*
       * bridge-reset.js ya cierra state.udpTransport mediante
       * close(). Adaptamos stop() a esa interfaz genérica.
       */
      transport.close = () => {
        if (startedTransport === transport) {
          startedTransport = null;
          startPromise = null;
        }

        return transport.stop();
      };

      state.udpTransport = transport;
    }

    if (
      startedTransport !==
      state.udpTransport
    ) {
      startedTransport =
        state.udpTransport;

      startPromise = null;
    }

    if (!startPromise) {
      sendStatus(
        "Preparando transporte IPX..."
      );

      startPromise = Promise.resolve(
        state.udpTransport.start()
      )
        .then(() => {
          sendStatus(
            "Túnel IPX local activo."
          );

          return state.udpTransport;
        })
        .catch((error) => {
          startPromise = null;

          console.error(
            "[Bridge-C2] No se pudo iniciar el transporte IPX:",
            error
          );

          sendStatus(
            `No se pudo abrir el transporte IPX: ${error.message}`
          );

          return null;
        });
    }

    return state.udpTransport;
  }

  function ensureHostTransportResources(
    socketId
  ) {
    const state = getState();
    const client =
      state.clients.get(socketId);

    if (!client) {
      return null;
    }

    ensureSharedIPXTransport();

    client.transportManager ||=
      deps.createTransportManager({
        label: `host-${socketId}`,

        onPacket: (buffer) => {
          /*
           * El host entrega el paquete al juego local y también
           * lo replica a los demás clientes, preservando la
           * semántica broadcast del antiguo relay-c2.js.
           */
          injectIntoLocalGame(buffer);

          sendHostPacketToClients(
            buffer,
            socketId
          );
        },
      });

    return client;
  }

  function ensureClientTransportResources() {
    const state = getState();

    ensureSharedIPXTransport();

    state.transportManager ||=
      deps.createTransportManager({
        label: "client",

        onPacket: (buffer) =>
          injectIntoLocalGame(buffer),
      });

    return state;
  }

  function getClientPort() {
    const transportState =
      getIPXTransport()
        ?.getState?.();

    return (
      transportState?.port ??
      profile.ipxPort ??
      DEFAULT_IPX_PORT
    );
  }

  function getStateExtension() {
    return {
      maxClients:
        profile.maxClients,

      debugIPX:
        Boolean(profile.debugIPX),

      ipx:
        getIPXTransport()
          ?.getState?.() ??
        null,
    };
  }

  return {
    initializeTransport,
    ensureHostTransportResources,
    ensureClientTransportResources,
    getClientPort,
    getStateExtension,
  };
}

module.exports = {
  createCarmageddon2TransportModule,
};

// electron/bridge/quake3/index.js

const {
  io: socketClient,
} = require("socket.io-client");

const {
  SIGNALING_URL,
  ICE_CONNECT_TIMEOUT_MS,
  buildIceServers,
} = require("./config");

const {
  sendStatus,
} = require("./status");

const {
  getCandidateType,
  describeCandidateTypes,
  flushCandidateQueue,
  logGatheringResult,
} = require("../core/ice-utils");

const {
  createHostUDPProxy,
  createClientUDPTransport,
} = require("./udp-transport");

const {
  createTransportManager,
} = require("../core/transport-manager");

const {
  createSocketRelayTransport,
} = require("../core/socket-relay-transport");

const {
  createInitialState,
} = require("./state");

let state = createInitialState();

const {
  getLocalIP,
  getNextClientPort,
} = require("./network-utils");

const {
  normalizeMessage,
  isKeepAlive,
  startKeepAlive,
  stopKeepAlive,
  clearAllKeepAlives,
} = require("./keepalive");

const {
  initializeWatchdog,
  createHostWatchdog,
  createClientWatchdog,
} = require("./watchdog");

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
 * Cierra WebRTC (channel + peer) de un cliente del host de
 * forma segura. Se usa únicamente DESPUÉS de haber iniciado
 * Relay con éxito, nunca antes.
 */
function closeHostWebRTCResources(
  socketId,
  client
) {
  stopKeepAlive(socketId);

  try {
    client.channel?.close();
  } catch {}

  try {
    client.peer?.close();
  } catch {}

  client.channel = null;
  client.peer = null;
  client.remoteDescSet = false;
  client.pendingCandidates = [];
}

/*
 * Igual que closeHostWebRTCResources(), pero para el
 * cliente local.
 */
function closeClientWebRTCResources() {
  stopKeepAlive("self");

  try {
    state.channel?.close();
  } catch {}

  try {
    state.peer?.close();
  } catch {}

  state.channel = null;
  state.peer = null;
  state.remoteDescSet = false;
  state.pendingCandidates = [];
}

function clearClientTimeout(client) {
  if (!client?.iceTimeoutHandle) {
    return;
  }
  clearTimeout(client.iceTimeoutHandle);
  client.iceTimeoutHandle = null;
}

function clearClientResources(
  socketId,
  client
) {
  clearClientTimeout(client);
  stopKeepAlive(socketId);

  /*
   * Un solo propietario cierra el relay: si existe
   * TransportManager, su close() ya cierra el relay
   * internamente (relayTransport.close() emite
   * game-relay-disable). Solo cerramos relayTransport
   * directamente cuando no hay TransportManager.
   */
  if (client?.transportManager) {
    try {
      client.transportManager.close();
    } catch {}
  } else if (client?.relayTransport) {
    try {
      client.relayTransport.close?.();
    } catch {}
  }

  if (client) {
    client.relayTransport = null;
    client.switchingToRelay = false;
  }

  try {
    client?.udpTransport?.close();
  } catch {}

  try {
    client?.channel?.close();
  } catch {}

  try {
    client?.peer?.close();
  } catch {}
}

function cleanupClient(socketId) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  clearClientResources(
    socketId,
    client
  );

  state.clients.delete(socketId);
}

function resetBridge() {
  clearAllKeepAlives();

  if (state.iceTimeoutHandle) {
    clearTimeout(
      state.iceTimeoutHandle
    );
  }

  try {
    if (
      state.signalingSocket &&
      state.roomId
    ) {
      state.signalingSocket.emit(
        "webrtc-leave",
        {
          roomId: state.roomId,
        }
      );
    }
  } catch {}

  for (const [
    socketId,
    client,
  ] of state.clients) {
    clearClientResources(
      socketId,
      client
    );
  }

  state.clients.clear();

  /*
   * Mismo principio: un solo propietario cierra el relay.
   */
  if (state.transportManager) {
    try {
      state.transportManager.close();
    } catch {}
  } else if (state.relayTransport) {
    try {
      state.relayTransport.close?.();
    } catch {}
  }

  state.relayTransport = null;

  try {
    state.udpTransport?.close();
  } catch {}

  try {
    state.channel?.close();
  } catch {}

  try {
    state.peer?.close();
  } catch {}

  try {
    state.signalingSocket?.disconnect();
  } catch {}

  state = createInitialState();

  console.log(
    "[Bridge-Q3] Reset complete"
  );
}

function flushHostCandidates(
  socketId
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  client.pendingCandidates =
    flushCandidateQueue({
      peer: client.peer,
      remoteDescSet:
        client.remoteDescSet,
      candidates:
        client.pendingCandidates,
      label: `host/${socketId}`,
    });
}

function flushClientCandidates() {
  state.pendingCandidates =
    flushCandidateQueue({
      peer: state.peer,
      remoteDescSet:
        state.remoteDescSet,
      candidates:
        state.pendingCandidates,
      label: "cliente",
    });
}

/*
 * Crea (una única vez) el TransportManager y el UDP proxy
 * de un cliente del host. El UDP debe existir aunque el
 * DataChannel nunca llegue a abrirse, porque Relay depende
 * de él para poder alcanzar Quake III.
 */
function ensureHostTransportResources(
  socketId
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return null;
  }

  client.transportManager ||=
    createTransportManager({
      label: `host-${socketId}`,
      onPacket: (buffer) => {
        client.udpTransport
          ?.sendToGame(buffer);
      },
    });

  if (client.clientPort) {
    client.udpTransport ||=
      createHostUDPProxy({
        socketId,
        clientPort:
          client.clientPort,
        onGamePacket: (buffer) =>
          client.transportManager
            ?.send(buffer),
      });
  }

  return client;
}

/*
 * Igual que la anterior, pero para el cliente local.
 */
function ensureClientTransportResources() {
  state.transportManager ||=
    createTransportManager({
      label: "client",
      onPacket: (buffer) => {
        state.udpTransport
          ?.sendToGame(buffer);
      },
    });

  if (state.clientPort) {
    state.udpTransport ||=
      createClientUDPTransport({
        localPort:
          state.clientPort,
        onGamePacket: (buffer) =>
          state.transportManager
            ?.send(buffer),
      });
  }

  return state;
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
  const client =
    ensureHostTransportResources(
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
    createSocketRelayTransport({
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

        sendStatus(
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
          sendStatus(
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
  ensureClientTransportResources();

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
    createSocketRelayTransport({
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

        sendStatus(
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
          sendStatus(
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

function handleChannelMessage(
  message,
  socketId = null
) {
  const buffer =
    normalizeMessage(message);

  if (isKeepAlive(buffer)) {
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
  const client =
    ensureHostTransportResources(
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
   * WebRTC volvió a estar disponible: disableRelay() ya
   * cierra el relayTransport internamente (una sola vez).
   * Aquí solo soltamos la referencia local, sin volver a
   * llamar close().
   */
  if (client.relayTransport) {
    client.transportManager.disableRelay();
    client.relayTransport = null;
  }

  client.switchingToRelay = false;

  startKeepAlive(
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

  sendStatus(
    `¡${connected} jugador(es) conectado(s)! Listos para jugar.`
  );
}

function onClientChannelOpen() {
  console.log(
    `[Bridge-Q3] DataChannel cliente abierto; puerto ${state.clientPort}`
  );

  if (!state.clientPort) {
    sendStatus(
      "Error: no se recibió el puerto local del cliente."
    );

    return;
  }

  ensureClientTransportResources();

  state.transportManager.useWebRTC(
    state.channel
  );

  /*
   * Igual que en el host: disableRelay() ya cierra el
   * relayTransport internamente. Solo soltamos la
   * referencia local.
   */
  if (state.relayTransport) {
    state.transportManager.disableRelay();
    state.relayTransport = null;
  }

  state.switchingToRelay = false;

  startKeepAlive(
    "self",
    state.channel
  );

  sendStatus(
    "¡Conexión P2P establecida! Listos para jugar."
  );
}

initializeWatchdog({
  getState: () => state,
  sendStatus,
  activateHostRelay,
  activateClientRelay,
  closeHostWebRTCResources,
  closeClientWebRTCResources,
  clearClientTimeout,
  isRelayActiveOrConnecting,
  describeCandidateTypes,
  ICE_CONNECT_TIMEOUT_MS,
});

function createHostPeer(
  NDC,
  signaling,
  socketId
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  const peer =
    new NDC.PeerConnection(
      `RetroLink-Q3-Host-${socketId}`,
      {
        iceServers:
          buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  client.peer = peer;

  createHostWatchdog(
    socketId,
    client
  );

  peer.onStateChange(
    (connectionState) => {
      client.iceConnectionState =
        connectionState;

      console.log(
        `[Bridge-Q3] Estado peer host ${socketId}: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        clearClientTimeout(client);

        sendStatus(
          "Conexión P2P establecida con el cliente."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        /*
         * Evita fallback duplicado si el watchdog ya
         * activó Relay para este cliente.
         */
        if (
          client.switchingToRelay ||
          client.transportManager
            ?.isRelayOpen() ||
          isRelayActiveOrConnecting(
            client.relayTransport
          )
        ) {
          return;
        }

        clearClientTimeout(client);

        client.transportManager
          ?.disableWebRTC();

        const relayStarted =
          activateHostRelay(
            socketId,
            "ice-failed"
          );

        if (relayStarted) {
          closeHostWebRTCResources(
            socketId,
            client
          );
        }

        sendStatus(
          relayStarted
            ? "Falló P2P. Intentando conexión mediante Relay..."
            : "Falló la conexión P2P con el cliente."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `[Bridge-Q3] Gathering host ${socketId}: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        logGatheringResult(
          `Host/${socketId}`,
          client.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
          toSocketId:
            socketId,
        }
      );

      signaling.emit(
        "webrtc-client-port",
        {
          roomId:
            state.roomId,
          port:
            client.clientPort,
          toSocketId:
            socketId,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        getCandidateType(candidate);

      client.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `[Bridge-Q3] Candidato host ${socketId} [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
          toSocketId:
            socketId,
        }
      );
    }
  );

  const channel =
    peer.createDataChannel(
      "game",
      {
        ordered: true,
      }
    );

  client.channel = channel;

  channel.onOpen(() => {
    onHostChannelOpen(
      socketId,
      channel
    );
  });

  channel.onMessage((message) => {
    handleChannelMessage(
      message,
      socketId
    );
  });

  channel.onClosed(() => {
    console.log(
      `[Bridge-Q3] Canal cerrado: ${socketId}`
    );

    stopKeepAlive(socketId);

    client.transportManager
      ?.disableWebRTC();

    client.channel = null;

    const relayUsable =
      Boolean(
        client.transportManager
          ?.isRelayOpen()
      ) ||
      client.switchingToRelay ||
      isRelayActiveOrConnecting(
        client.relayTransport
      );

    /*
     * Si el relay sigue disponible o intentando conectar,
     * NO destruimos el cliente: la salida real del jugador
     * se maneja mediante "webrtc-client-left".
     */
    if (!relayUsable) {
      cleanupClient(socketId);
    }

    const connected =
      [...state.clients.values()].filter(
        (item) =>
          item.transportManager
            ?.isWebRTCOpen() ||
          item.transportManager
            ?.isRelayOpen()
      ).length;

    sendStatus(
      connected > 0
        ? `${connected} jugador(es) conectado(s)`
        : relayUsable
          ? "Conexión WebRTC cerrada. Usando Relay..."
          : "Esperando jugadores..."
    );
  });

  channel.onError((error) => {
    console.error(
      `[Bridge-Q3] Error DataChannel ${socketId}:`,
      error
    );
  });

  /*
   * El host debe iniciar la oferta.
   */
  setTimeout(() => {
    try {
      peer.setLocalDescription();
    } catch (error) {
      console.error(
        `[Bridge-Q3] Error creando oferta para ${socketId}:`,
        error.message
      );

      cleanupClient(socketId);
    }
  }, 200);
}

function createClientPeer(
  NDC,
  signaling
) {
  const peer =
    new NDC.PeerConnection(
      "RetroLink-Q3-Client",
      {
        iceServers:
          buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  state.peer = peer;

  createClientWatchdog();

  peer.onStateChange(
    (connectionState) => {
      state.iceConnectionState =
        connectionState;

      console.log(
        `[Bridge-Q3] Estado peer cliente: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        if (
          state.iceTimeoutHandle
        ) {
          clearTimeout(
            state.iceTimeoutHandle
          );

          state.iceTimeoutHandle =
            null;
        }

        sendStatus(
          "Conexión P2P establecida."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        /*
         * Evita fallback duplicado si el watchdog ya
         * activó Relay.
         */
        if (
          state.switchingToRelay ||
          state.transportManager
            ?.isRelayOpen() ||
          isRelayActiveOrConnecting(
            state.relayTransport
          )
        ) {
          return;
        }

        if (
          state.iceTimeoutHandle
        ) {
          clearTimeout(
            state.iceTimeoutHandle
          );

          state.iceTimeoutHandle =
            null;
        }

        state.transportManager
          ?.disableWebRTC();

        const relayStarted =
          activateClientRelay(
            "ice-failed"
          );

        if (relayStarted) {
          closeClientWebRTCResources();
        }

        sendStatus(
          relayStarted
            ? "Falló P2P. Intentando conexión mediante Relay..."
            : "Falló la conexión P2P."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `[Bridge-Q3] Gathering cliente: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        logGatheringResult(
          "Cliente",
          state.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      console.log(
        `[Bridge-Q3] Descripción local cliente: ${type}`
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        getCandidateType(candidate);

      state.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `[Bridge-Q3] Candidato cliente [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
        }
      );
    }
  );

  peer.onDataChannel((channel) => {
    state.channel = channel;

    channel.onOpen(
      onClientChannelOpen
    );

    channel.onMessage(
      handleChannelMessage
    );

    channel.onClosed(() => {
      stopKeepAlive("self");

      state.transportManager
        ?.disableWebRTC();

      state.channel = null;

      const relayUsable =
        Boolean(
          state.transportManager
            ?.isRelayOpen()
        ) ||
        state.switchingToRelay ||
        isRelayActiveOrConnecting(
          state.relayTransport
        );

      /*
       * No cerramos TransportManager, UDP ni Relay: si el
       * relay está activo o conectando, la partida sigue
       * funcionando.
       */
      sendStatus(
        relayUsable
          ? "Conexión P2P cerrada. Usando Relay."
          : "Conexión P2P cerrada."
      );
    });

    channel.onError((error) => {
      console.error(
        "[Bridge-Q3] Error DataChannel cliente:",
        error
      );
    });
  });
}

function configureSignaling(
  NDC,
  signaling
) {
  signaling.on(
    "connect_error",
    (error) => {
      console.error(
        "[Bridge-Q3] Error de señalización:",
        error.message
      );

      sendStatus(
        "Error al conectar al servidor de señales."
      );
    }
  );

  signaling.on("connect", () => {
    console.log(
      "[Bridge-Q3] Signaling conectado:",
      signaling.id
    );

    if (state.isHost) {
      state.hostIP =
        getLocalIP();
    }

    signaling.emit(
      "webrtc-join",
      {
        roomId:
          state.roomId,
        isHost:
          state.isHost,
        hostIP:
          state.hostIP,
      },
      () => {
        sendStatus(
          state.isHost
            ? "Esperando jugadores..."
            : "Buscando rival en la sala..."
        );
      }
    );
  });

  signaling.on(
    "webrtc-host-ip",
    ({ hostIP } = {}) => {
      if (
        !state.isHost &&
        hostIP
      ) {
        state.hostIP = hostIP;
      }
    }
  );

  signaling.on(
    "webrtc-peer-ready",
    ({ fromSocketId } = {}) => {
      if (
        !state.isHost ||
        !fromSocketId ||
        state.clients.has(
          fromSocketId
        )
      ) {
        return;
      }

      const clientPort =
        getNextClientPort(state);

      if (!clientPort) {
        sendStatus(
          "La sala alcanzó su máximo de jugadores."
        );

        return;
      }

      state.clients.set(
        fromSocketId,
        {
          peer: null,
          channel: null,
          udpTransport: null,
          transportManager: null,
          relayTransport: null,
          switchingToRelay: false,

          clientPort,

          pendingCandidates: [],
          remoteDescSet: false,

          iceConnectionState:
            null,
          iceTimeoutHandle:
            null,

          gatheredCandidateTypes:
            new Set(),
        }
      );

      sendStatus(
        "Rival encontrado. Creando conexión P2P..."
      );

      createHostPeer(
        NDC,
        signaling,
        fromSocketId
      );
    }
  );

  signaling.on(
    "webrtc-client-port",
    ({ port } = {}) => {
      if (
        !state.isHost &&
        Number.isInteger(port)
      ) {
        state.clientPort = port;

        console.log(
          `[Bridge-Q3] Puerto cliente asignado: ${port}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-signal",
    ({
      type,
      sdp,
      candidate,
      mid,
      fromSocketId,
    } = {}) => {
      try {
        if (state.isHost) {
          const client =
            state.clients.get(
              fromSocketId
            );

          if (!client) {
            return;
          }

          if (type === "answer") {
            client.peer.setRemoteDescription(
              sdp,
              "answer"
            );

            client.remoteDescSet =
              true;

            flushHostCandidates(
              fromSocketId
            );

            return;
          }

          if (
            type === "candidate"
          ) {
            client.pendingCandidates.push({
              candidate,
              mid,
            });

            flushHostCandidates(
              fromSocketId
            );
          }

          return;
        }

        if (type === "offer") {
          if (!state.peer) {
            createClientPeer(
              NDC,
              signaling
            );
          }

          sendStatus(
            "Procesando oferta de conexión..."
          );

          /*
           * Corrección importante:
           *
           * node-datachannel genera automáticamente
           * la respuesta después de recibir la oferta.
           * No debemos llamar después a
           * setLocalDescription(), porque generaría
           * una nueva oferta.
           */
          state.peer.setRemoteDescription(
            sdp,
            "offer"
          );

          state.remoteDescSet =
            true;

          flushClientCandidates();

          return;
        }

        if (type === "candidate") {
          state.pendingCandidates.push({
            candidate,
            mid,
          });

          flushClientCandidates();
        }
      } catch (error) {
        console.error(
          "[Bridge-Q3] Error procesando señal:",
          error.message
        );

        sendStatus(
          `Error procesando señal: ${error.message}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-client-left",
    ({ socketId } = {}) => {
      if (
        !state.isHost ||
        !socketId
      ) {
        return;
      }

      cleanupClient(socketId);

      sendStatus(
        state.clients.size > 0
          ? `${state.clients.size} jugador(es) conectado(s)`
          : "Esperando jugadores..."
      );
    }
  );
}

async function startBridge(
  roomId,
  isHost
) {
  resetBridge();

  if (!roomId) {
    return {
      success: false,
      error:
        "No se proporcionó una sala.",
    };
  }

  state.roomId = roomId;
  state.isHost =
    Boolean(isHost);

  const NDC =
    require("node-datachannel");

  console.log(
    `[Bridge-Q3] Iniciando sala ${roomId} como ${
      state.isHost
        ? "HOST"
        : "CLIENTE"
    }`
  );

  sendStatus(
    "Conectando al servidor de señales..."
  );

  const signaling =
    socketClient(
      SIGNALING_URL,
      {
        transports: [
          "websocket",
        ],

        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      }
    );

  state.signalingSocket =
    signaling;

  configureSignaling(
    NDC,
    signaling
  );

  return {
    success: true,
  };
}

function getBridgeState() {
  const connectedClients =
    [...state.clients.entries()]
      .filter(
        ([, client]) =>
          client.transportManager
            ?.isWebRTCOpen() ||
          client.transportManager
            ?.isRelayOpen()
      )
      .map(
        ([socketId, client]) => ({
          socketId,
          clientPort:
            client.clientPort,
          iceConnectionState:
            client.iceConnectionState,
          candidateTypes: [
            ...client.gatheredCandidateTypes,
          ],
          switchingToRelay:
            client.switchingToRelay,
          transport:
            client.transportManager?.getState() ??
            null,
          relay:
            client.relayTransport?.getState?.() ??
            null,
        })
      );

  const clientConnected =
    Boolean(
      state.transportManager
        ?.isWebRTCOpen() ||
      state.transportManager
        ?.isRelayOpen()
    );

  return {
    isReady: state.isHost
      ? connectedClients.length > 0
      : clientConnected,

    isHost:
      state.isHost,

    roomId:
      state.roomId,

    clientCount:
      state.isHost
        ? connectedClients.length
        : clientConnected
          ? 1
          : 0,

    clientPort:
      state.clientPort,

    hostIP:
      state.hostIP,

    iceConnectionState:
      state.iceConnectionState,

    candidateTypes: [
      ...state.gatheredCandidateTypes,
    ],

    signalingConnected:
      Boolean(
        state.signalingSocket
          ?.connected
      ),

    clients:
      connectedClients,

    switchingToRelay:
      state.switchingToRelay,

    transport:
      state.transportManager?.getState() ??
      null,

    relay:
      state.relayTransport?.getState?.() ??
      null,
  };
}

module.exports = {
  startBridge,
  resetBridge,

  getClientPort: () =>
    state.clientPort,

  getHostIP: () =>
    state.hostIP,

  getBridgeState,
};

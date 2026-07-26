// electron/bridge/quake3/index.js

const {
  io: socketClient,
} = require("socket.io-client");

const {
  createSignalingSession,
} = require("../core/signaling-session");

const {
  createGameNetworkEngine,
} = require("../core/game-network-engine");

const {
  SIGNALING_URL,
  ICE_CONNECT_TIMEOUT_MS,
  buildIceServers,
} = require("../core/engine-config");

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
  createUDPTransportFactory,
} = require("../core/udp-transport");

const quake3Profile =
  require("./profile");

const {
  createHostUDPProxy,
  createClientUDPTransport,
} = createUDPTransportFactory({
  gamePort: quake3Profile.gamePort,
  debug: quake3Profile.debugUDP,
  logPrefix: "Bridge-Q3-UDP",
  gameName: quake3Profile.name,
});

const {
  createTransportManager,
} = require("../core/transport-manager");

const {
  createSocketRelayTransport,
} = require("../core/socket-relay-transport");

const {
  createInitialState,
} = require("../core/state");

const engine =
  createGameNetworkEngine({
    name: "Bridge-Q3",
    createState:
      createInitialState,
  });

let state =
  engine.getMutableState();

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

const {
  initializeCleanup,
  closeHostWebRTCResources,
  closeClientWebRTCResources,
  clearClientResources,
  cleanupClient,
} = require("./cleanup");

const {
  initializeChannelHandlers,
  handleChannelMessage,
  onHostChannelOpen,
  onClientChannelOpen,
} = require("./channel-handlers");

const {
  initializeTransport,
  ensureHostTransportResources,
  ensureClientTransportResources,
} = require("../core/transport");

const {
  initializeRelay,
  isRelayActiveOrConnecting,
  activateHostRelay,
  activateClientRelay,
} = require("./relay");

const {
  initializePeer,
  flushHostCandidates,
  flushClientCandidates,
  createHostPeer,
  createClientPeer,
} = require("./peer");

function clearClientTimeout(client) {
  if (!client?.iceTimeoutHandle) {
    return;
  }
  clearTimeout(client.iceTimeoutHandle);
  client.iceTimeoutHandle = null;
}

initializeCleanup({
  getState: () => state,
  stopKeepAlive,
  clearClientTimeout,
});

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

  engine.stopSignaling();

  state =
    engine.resetOwnedState();

  console.log(
    "[Bridge-Q3] Reset complete"
  );
}

initializeTransport({
  getState: () => state,
  createTransportManager,
  createHostUDPProxy,
  createClientUDPTransport,
});

initializeRelay({
  getState: () => state,
  createSocketRelayTransport,
  ensureHostTransportResources,
  ensureClientTransportResources,
  sendStatus,
});

initializeChannelHandlers({
  getState: () => state,
  normalizeMessage,
  isKeepAlive,
  ensureHostTransportResources,
  ensureClientTransportResources,
  startKeepAlive,
  sendStatus,
});

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

initializePeer({
  getState: () => state,
  buildIceServers,
  flushCandidateQueue,
  getCandidateType,
  logGatheringResult,
  createHostWatchdog,
  createClientWatchdog,
  clearClientTimeout,
  sendStatus,
  isRelayActiveOrConnecting,
  activateHostRelay,
  activateClientRelay,
  closeHostWebRTCResources,
  closeClientWebRTCResources,
  cleanupClient,
  stopKeepAlive,
  onHostChannelOpen,
  onClientChannelOpen,
  handleChannelMessage,
});

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

  engine.startSignaling({
    createSession:
      createSignalingSession,

    socketFactory:
      socketClient,

    url:
      SIGNALING_URL,

    options: {
      transports: [
        "websocket",
      ],

      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
    },

    configure:
      (signaling) => {
        configureSignaling(
          NDC,
          signaling
        );
      },
  });

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

engine.setHandlers({
  start:
    startBridge,

  reset:
    resetBridge,

  getState:
    getBridgeState,

  getClientPort: () =>
    engine
      .getMutableState()
      .clientPort,

  getHostIP: () =>
    engine
      .getMutableState()
      .hostIP,
});

module.exports =
  engine.toBridgeAPI();

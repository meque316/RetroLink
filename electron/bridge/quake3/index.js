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
  configureSignaling,
} = require("../core/signaling");

const {
  peer,
} = require("../core/peer");

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

peer.initialize({
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
  // Config específica de Quake 3, inyectada hacia el módulo
  // genérico del motor (electron/bridge/core/peer.js).
  peerNamePrefix: "RetroLink-Q3",
  logPrefix: "[Bridge-Q3]",
});

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
        configureSignaling({
          signaling,
          NDC,
          getState: () => state,
          sendStatus,
          getLocalIP,
          getNextClientPort,
          createHostPeer:
            peer.createHost,
          createClientPeer:
            peer.createClient,
          flushHostCandidates:
            peer.flushHostCandidates,
          flushClientCandidates:
            peer.flushClientCandidates,
          cleanupClient,
        });
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
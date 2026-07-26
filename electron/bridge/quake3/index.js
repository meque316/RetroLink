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
  createBridgeReset,
} = require("../core/bridge-reset");

const {
  createBridgeStateGetter,
} = require("../core/bridge-state");

const {
  createBridgeStarter,
} = require("../core/bridge-start");

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
  gamePort:
    quake3Profile.gamePort,

  debug:
    quake3Profile.debugUDP,

  logPrefix:
    "Bridge-Q3-UDP",

  gameName:
    quake3Profile.name,
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
    name:
      "Bridge-Q3",

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

/*
 * Getter único para el estado mutable del bridge.
 *
 * Todos los módulos reciben esta función, evitando conservar
 * referencias antiguas después de resetBridge().
 */
const getState =
  () => state;

function clearClientTimeout(client) {
  if (!client?.iceTimeoutHandle) {
    return;
  }

  clearTimeout(
    client.iceTimeoutHandle
  );

  client.iceTimeoutHandle =
    null;
}

initializeCleanup({
  getState,
  stopKeepAlive,
  clearClientTimeout,
});

const resetBridge =
  createBridgeReset({
    engine,
    getState,

    setState:
      (nextState) => {
        state =
          nextState;
      },

    clearAllKeepAlives,
    clearClientResources,

    logPrefix:
      "Bridge-Q3",
  });

const getBridgeState =
  createBridgeStateGetter({
    getState,
  });

initializeTransport({
  getState,

  createTransportManager,
  createHostUDPProxy,
  createClientUDPTransport,
});

initializeRelay({
  getState,

  createSocketRelayTransport,

  ensureHostTransportResources,
  ensureClientTransportResources,

  sendStatus,
});

initializeChannelHandlers({
  getState,

  normalizeMessage,
  isKeepAlive,

  ensureHostTransportResources,
  ensureClientTransportResources,

  startKeepAlive,
  sendStatus,
});

initializeWatchdog({
  getState,

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
  getState,

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

  peerNamePrefix:
    "RetroLink-Q3",

  logPrefix:
    "[Bridge-Q3]",
});

/*
 * El proceso de inicio ya pertenece al motor genérico.
 *
 * Quake inyecta únicamente sus dependencias y configuración.
 */
const startBridge =
  createBridgeStarter({
    engine,
    getState,
    resetBridge,

    createSignalingSession,

    socketFactory:
      socketClient,

    signalingUrl:
      SIGNALING_URL,

    socketOptions: {
      transports: [
        "websocket",
      ],

      reconnection:
        true,

      reconnectionAttempts:
        3,

      reconnectionDelay:
        1000,
    },

    configureSignaling,

    getNodeDataChannel:
      () =>
        require(
          "node-datachannel"
        ),

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

    logPrefix:
      "[Bridge-Q3]",

    connectingStatus:
      "Conectando al servidor de señales...",
  });

engine.setHandlers({
  start:
    startBridge,

  reset:
    resetBridge,

  getState:
    getBridgeState,

  getClientPort:
    () =>
      engine
        .getMutableState()
        .clientPort,

  getHostIP:
    () =>
      engine
        .getMutableState()
        .hostIP,
});

module.exports =
  engine.toBridgeAPI();
// electron/bridge/core/create-bridge.js

const {
  io: socketClient,
} = require("socket.io-client");

const {
  createSignalingSession,
} = require("./signaling-session");

const {
  createGameNetworkEngine,
} = require("./game-network-engine");

const {
  createBridgeReset,
} = require("./bridge-reset");

const {
  createBridgeStateGetter,
} = require("./bridge-state");

const {
  createBridgeStarter,
} = require("./bridge-start");

const {
  initializeBridgeModules,
} = require("./initialize-bridge-modules");

const {
  SIGNALING_URL,
  ICE_CONNECT_TIMEOUT_MS,
  buildIceServers,
} = require("./engine-config");

const {
  getCandidateType,
  describeCandidateTypes,
  flushCandidateQueue,
  logGatheringResult,
} = require("./ice-utils");

const {
  createUDPTransportFactory,
} = require("./udp-transport");

const {
  createTransportManager,
} = require("./transport-manager");

const {
  createSocketRelayTransport,
} = require("./socket-relay-transport");

const {
  createInitialState,
} = require("./state");

const {
  getLocalIP,
  createClientPortAllocator,
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
  initializeTransport,
  ensureHostTransportResources,
  ensureClientTransportResources,
} = require("./transport");

const {
  initializeRelay,
  isRelayActiveOrConnecting,
  activateHostRelay,
  activateClientRelay,
} = require("./relay");

const {
  configureSignaling,
} = require("./signaling");

const {
  peer,
} = require("./peer");

/**
 * Crea y ensambla un bridge de red completo para un juego.
 *
 * Cada adaptador entrega:
 *
 * - identidad para logs y peers;
 * - perfil declarativo de red;
 * - sistema de estados para el frontend;
 * - handlers de DataChannel.
 */
function createBridge({
  identity,
  profile,
  sendStatus,
  channels,
  connectingStatus =
    "Conectando al servidor de señales...",
} = {}) {
  if (!identity) {
    throw new TypeError(
      "[CreateBridge] identity es obligatorio."
    );
  }

  if (!profile) {
    throw new TypeError(
      "[CreateBridge] profile es obligatorio."
    );
  }

  if (
    typeof sendStatus !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] sendStatus debe ser una función."
    );
  }

  if (!channels) {
    throw new TypeError(
      "[CreateBridge] channels es obligatorio."
    );
  }

  const {
    bridgeName,
    logPrefix,
    peerNamePrefix,
    udpLogPrefix,
  } = identity;

  const {
    initializeChannelHandlers,
    handleChannelMessage,
    onHostChannelOpen,
    onClientChannelOpen,
  } = channels;

  if (
    typeof bridgeName !==
      "string" ||
    !bridgeName
  ) {
    throw new TypeError(
      "[CreateBridge] identity.bridgeName es obligatorio."
    );
  }

  if (
    typeof logPrefix !==
      "string" ||
    !logPrefix
  ) {
    throw new TypeError(
      "[CreateBridge] identity.logPrefix es obligatorio."
    );
  }

  if (
    typeof peerNamePrefix !==
      "string" ||
    !peerNamePrefix
  ) {
    throw new TypeError(
      "[CreateBridge] identity.peerNamePrefix es obligatorio."
    );
  }

  if (
    typeof udpLogPrefix !==
      "string" ||
    !udpLogPrefix
  ) {
    throw new TypeError(
      "[CreateBridge] identity.udpLogPrefix es obligatorio."
    );
  }

  if (
    typeof initializeChannelHandlers !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.initializeChannelHandlers debe ser una función."
    );
  }

  if (
    typeof handleChannelMessage !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.handleChannelMessage debe ser una función."
    );
  }

  if (
    typeof onHostChannelOpen !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.onHostChannelOpen debe ser una función."
    );
  }

  if (
    typeof onClientChannelOpen !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.onClientChannelOpen debe ser una función."
    );
  }

  /*
   * Cada juego define su rango virtual de clientes.
   * El motor genérico encuentra el siguiente puerto disponible.
   */
  const getNextClientPort =
    createClientPortAllocator({
      clientPortBase:
        profile.clientPortBase,

      maxClients:
        profile.maxClients,
    });

  /*
   * Crea los transportes UDP según las capacidades
   * declaradas por el perfil.
   *
   * Ninguna condición depende del identificador del juego.
   */
  const {
    createHostUDPProxy,
    createClientUDPTransport,
  } = createUDPTransportFactory({
    gamePort:
      profile.gamePort,

    gameHost:
      profile.gameHost ??
      "127.0.0.1",

    bindHost:
      profile.bindHost ??
      "127.0.0.1",

    debug:
      profile.debugUDP,

    logPrefix:
      udpLogPrefix,

    gameName:
      profile.name,

    /*
     * Cuando true, el destino real del ejecutable cliente
     * se aprende desde el primer datagrama local.
     */
    dynamicClientEndpoint:
      Boolean(
        profile.dynamicClientEndpoint
      ),

    /*
     * Puerto local fijo donde escucha el bridge.
     *
     * Si el perfil no lo declara, se utiliza el puerto
     * virtual asignado por señalización.
     */
    clientListenPort:
      profile.clientListenPort ??
      null,

    /*
     * Puerto fijo donde escucha el ejecutable cliente.
     *
     * Por defecto coincide con gamePort.
     */
    configuredClientGamePort:
      profile.clientGamePort ??
      profile.gamePort,
  });

  /*
   * El engine mantiene el estado y expone
   * la API pública del bridge.
   */
  const engine =
    createGameNetworkEngine({
      name:
        bridgeName,

      createState:
        createInitialState,
    });

  let state =
    engine.getMutableState();

  /*
   * Todos los módulos acceden al estado actual
   * mediante esta función.
   */
  const getState =
    () => state;

  /*
   * Restablece una sesión anterior y sustituye
   * la instancia mutable del estado.
   */
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

      /*
       * bridge-reset agrega los corchetes.
       */
      logPrefix:
        bridgeName,
    });

  /*
   * Resumen seguro para IPC y frontend.
   */
  const getBridgeState =
    createBridgeStateGetter({
      getState,
    });

  /*
   * Inicializa todos los módulos internos.
   */
  initializeBridgeModules({
    getState,
    sendStatus,

    cleanup: {
      initialize:
        initializeCleanup,

      stopKeepAlive,

      closeHostWebRTCResources,
      closeClientWebRTCResources,
      cleanupClient,
    },

    transport: {
      initialize:
        initializeTransport,

      createTransportManager,
      createHostUDPProxy,
      createClientUDPTransport,

      ensureHostTransportResources,
      ensureClientTransportResources,
    },

    relay: {
      initialize:
        initializeRelay,

      createSocketRelayTransport,

      isRelayActiveOrConnecting,
      activateHostRelay,
      activateClientRelay,
    },

    channels: {
      initialize:
        initializeChannelHandlers,

      normalizeMessage,
      isKeepAlive,
      startKeepAlive,

      handleChannelMessage,
      onHostChannelOpen,
      onClientChannelOpen,
    },

    watchdog: {
      initialize:
        initializeWatchdog,

      createHostWatchdog,
      createClientWatchdog,

      describeCandidateTypes,
      ICE_CONNECT_TIMEOUT_MS,
    },

    peerConfig: {
      peer,

      buildIceServers,
      flushCandidateQueue,
      getCandidateType,
      logGatheringResult,

      peerNamePrefix,

      logPrefix,
    },
  });

  /*
   * Punto de entrada de una nueva sesión.
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

      logPrefix,

      connectingStatus,
    });

  /*
   * API utilizada por Electron y los handlers IPC.
   */
  engine.setHandlers({
    start:
      startBridge,

    reset:
      resetBridge,

    getState:
      getBridgeState,

    getClientPort:
      () =>
        getState()
          .clientPort,

    getHostIP:
      () =>
        getState()
          .hostIP,
  });

  return engine.toBridgeAPI();
}

module.exports = {
  createBridge,
};
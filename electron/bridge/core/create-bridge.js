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
  createWatchdogModule,
} = require("./watchdog");

const {
  initializeCleanup,
  closeHostWebRTCResources,
  closeClientWebRTCResources,
  clearClientResources,
  cleanupClient,
} = require("./cleanup");

const {
  createTransportModule,
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
  createPeerModule,
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
  localTransport = null,
  connectingStatus =
    "Conectando al servidor de seÃ±ales...",
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
      "[CreateBridge] sendStatus debe ser una funciÃ³n."
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
    localTransportLogPrefix,
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
    !localTransport &&
    (
      typeof udpLogPrefix !==
        "string" ||
      !udpLogPrefix
    )
  ) {
    throw new TypeError(
      "[CreateBridge] identity.udpLogPrefix es obligatorio para el transporte UDP."
    );
  }

  if (
    typeof initializeChannelHandlers !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.initializeChannelHandlers debe ser una funciÃ³n."
    );
  }

  if (
    typeof handleChannelMessage !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.handleChannelMessage debe ser una funciÃ³n."
    );
  }

  if (
    typeof onHostChannelOpen !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.onHostChannelOpen debe ser una funciÃ³n."
    );
  }

  if (
    typeof onClientChannelOpen !==
    "function"
  ) {
    throw new TypeError(
      "[CreateBridge] channels.onClientChannelOpen debe ser una funciÃ³n."
    );
  }

  /*
   * Cada bridge posee su propia instancia del motor de peers,
   * evitando el antiguo singleton global compartido.
   */
  const peer = createPeerModule();

  /*
   * Cada bridge posee su propia instancia del watchdog ICE,
   * evitando el antiguo singleton global compartido.
   */
  const watchdog = createWatchdogModule();

  /*
   * Por defecto se utiliza el transporte UDP genérico. Los juegos
   * con una topología local distinta (por ejemplo IPX broadcast)
   * pueden inyectar un módulo compatible mediante localTransport.
   */
  const transport =
    localTransport ??
    createTransportModule();

  let createHostUDPProxy = null;
  let createClientUDPTransport = null;

  if (!localTransport) {
    ({
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

      dynamicClientEndpoint:
        Boolean(
          profile.dynamicClientEndpoint
        ),

      clientListenPort:
        profile.clientListenPort ??
        null,

      configuredClientGamePort:
        profile.clientGamePort ??
        profile.gamePort,
    }));
  } else {
    console.log(
      `[${identity.bridgeName}] Usando transporte local personalizado: ${
        localTransportLogPrefix ??
        profile.id
      }`
    );
  }

  /*
   * Cada juego define su rango virtual de clientes.
   */
  const getNextClientPort =
    createClientPortAllocator({
      clientPortBase:
        profile.clientPortBase,

      maxClients:
        profile.maxClients,
    });

  /*
   * El engine mantiene el estado y expone
   * la API pÃºblica del bridge.
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
   * Todos los mÃ³dulos acceden al estado actual
   * mediante esta funciÃ³n.
   */
  const getState =
    () => state;

  /*
   * Restablece una sesiÃ³n anterior y sustituye
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

      extendState:
        typeof transport.getStateExtension ===
          "function"
          ? () =>
              transport.getStateExtension()
          : null,
    });

  /*
   * Inicializa todos los mÃ³dulos internos.
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
        transport.initializeTransport,

      createTransportManager,
      createHostUDPProxy,
      createClientUDPTransport,

      ensureHostTransportResources:
        transport.ensureHostTransportResources,

      ensureClientTransportResources:
        transport.ensureClientTransportResources,
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
        watchdog.initializeWatchdog,

      createHostWatchdog:
        watchdog.createHostWatchdog,

      createClientWatchdog:
        watchdog.createClientWatchdog,

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
   * Punto de entrada de una nueva sesiÃ³n.
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
        typeof transport.getClientPort ===
          "function"
          ? transport.getClientPort()
          : getState()
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


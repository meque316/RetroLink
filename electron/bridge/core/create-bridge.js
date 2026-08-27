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
  createCleanupModule,
} = require("./cleanup");

const {
  createRelayModule,
} = require("./relay");

const {
  createTransportModule,
} = require("./transport");

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
   * Cada bridge posee su propia instancia de cleanup,
   * evitando el antiguo singleton global compartido.
   */
  const cleanup = createCleanupModule();

  /*
   * Cada bridge posee su propia instancia de relay,
   * evitando el antiguo singleton global compartido.
   */
  const relay = createRelayModule();

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
      clearClientResources:
        cleanup.clearClientResources,

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
   * Inicializa todos los módulos internos.
   */
  initializeBridgeModules({
    getState,
    sendStatus,

    cleanup: {
      initialize:
        cleanup.initializeCleanup,

      stopKeepAlive,

      closeHostWebRTCResources:
        cleanup.closeHostWebRTCResources,

      closeClientWebRTCResources:
        cleanup.closeClientWebRTCResources,

      cleanupClient:
        cleanup.cleanupClient,
    },

    transport: {
      initialize:
        transport.initializeTransport,

      createTransportManager,
      createHostUDPProxy,
      createClientUDPTransport,

      /*
       * Envuelve ensureHostTransportResources para inyectar el
       * default de bindToClientPort declarado en el profile del
       * juego. Esto asegura que el proxy UDP del host respete esa
       * opción incluso cuando lo invoca un módulo genérico (como
       * relay.js) que no conoce el profile y por lo tanto no puede
       * pasarlo explícitamente. Cualquier `options` explícito que
       * el llamador sí pase (por ejemplo channel-handlers.js) tiene
       * prioridad sobre este default.
       */
      ensureHostTransportResources:
        (socketId, options = {}) =>
          transport.ensureHostTransportResources(
            socketId,
            {
              bindToClientPort:
                profile.bindToClientPort ??
                false,

              ...options,
            }
          ),

      ensureClientTransportResources:
        transport.ensureClientTransportResources,
    },

    relay: {
      initialize:
        relay.initializeRelay,

      createSocketRelayTransport,

      isRelayActiveOrConnecting:
        relay.isRelayActiveOrConnecting,

      activateHostRelay:
        relay.activateHostRelay,

      activateClientRelay:
        relay.activateClientRelay,
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

      cleanupClient:
        cleanup.cleanupClient,

      logPrefix,

      connectingStatus,
    });

  // ===== NUEVO: Método testGame =====
  const testGame = async (roomId) => {
    console.log(`[${identity.bridgeName}] 🧪 Test Game en sala ${roomId}`);

    const currentState = getState();

    // Verificar si ya hay clientes
    if (currentState.clients.size > 0) {
      console.log(`[${identity.bridgeName}] Ya hay ${currentState.clients.size} cliente(s) real(es).`);
      return {
        success: true,
        message: `${currentState.clients.size} cliente(s) conectado(s)`,
        clients: currentState.clients.size,
      };
    }

    // Crear un cliente simulado
    const fakeSocketId = `test-client-${Date.now()}`;

    console.log(`[${identity.bridgeName}] No hay clientes reales. Simulando cliente local...`);

    // ===== NUEVO: Crear un DataChannel simulado con isOpen =====
    let isOpen = true;

    const fakeChannel = {
      send: (data) => {
        console.log(`[${identity.bridgeName}] 📤 DataChannel simulado enviando ${data?.length || 0} bytes`);
        return true;
      },
      close: () => {
        console.log(`[${identity.bridgeName}] 🔒 DataChannel simulado cerrado`);
        isOpen = false;
      },
      isOpen: () => {
        return isOpen;
      },
      readyState: 'open',
      label: `test-channel-${fakeSocketId}`,
      id: Math.floor(Math.random() * 1000),
    };
    // ===== FIN NUEVO =====

    // Guardar el channel simulado en el estado
    currentState.channel = fakeChannel;

    // Simular la conexión del cliente
    currentState.clients.set(fakeSocketId, {
      clientPort: currentState.clientPort || 2300,
      transportManager: currentState.transportManager,
      udpTransport: currentState.udpTransport,
      isTestClient: true,
      channel: fakeChannel,
    });

    // Simular la apertura del DataChannel
    if (onHostChannelOpen) {
      try {
        onHostChannelOpen(fakeSocketId, fakeChannel);
        console.log(`[${identity.bridgeName}] ✅ DataChannel simulado abierto para ${fakeSocketId}`);
      } catch (error) {
        console.error(`[${identity.bridgeName}] Error simulando DataChannel:`, error.message);
        currentState.clients.delete(fakeSocketId);
        currentState.channel = null;
        return {
          success: false,
          error: error.message,
        };
      }
    } else {
      console.warn(`[${identity.bridgeName}] No se pudo simular DataChannel: onHostChannelOpen no disponible`);
      return {
        success: false,
        error: 'No se pudo simular la conexión del cliente',
      };
    }

    console.log(`[${identity.bridgeName}] ✅ Cliente simulado conectado: ${fakeSocketId}`);

    return {
      success: true,
      message: 'Cliente simulado conectado correctamente',
      clientId: fakeSocketId,
      clients: currentState.clients.size,
    };
  };
  // ===== FIN NUEVO =====

  /*
   * API utilizada por Electron y los handlers IPC.
   */
  engine.setHandlers({
    start: startBridge,
    reset: resetBridge,
    getState: getBridgeState,
    getClientPort: () =>
      typeof transport.getClientPort === "function"
        ? transport.getClientPort()
        : getState().clientPort,
    getHostIP: () => getState().hostIP,
  });

  // ===== NUEVO: Obtener bridge API y agregar testGame manualmente =====
  const bridgeAPI = engine.toBridgeAPI();
  bridgeAPI.testGame = testGame;
  console.log(`[${identity.bridgeName}] testGame agregado al bridge API`);
  return bridgeAPI;
  // ===== FIN NUEVO =====
}

module.exports = {
  createBridge,
};
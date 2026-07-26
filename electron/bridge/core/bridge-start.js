// electron/bridge/core/bridge-start.js

function createBridgeStarter({
  engine,
  getState,
  resetBridge,

  createSignalingSession,
  socketFactory,
  signalingUrl,
  socketOptions,

  configureSignaling,
  getNodeDataChannel,

  sendStatus,
  getLocalIP,
  getNextClientPort,

  createHostPeer,
  createClientPeer,
  flushHostCandidates,
  flushClientCandidates,
  cleanupClient,

  logPrefix = "[Bridge]",
  connectingStatus =
    "Conectando al servidor de señales...",
}) {
  if (!engine) {
    throw new TypeError(
      "[BridgeStart] engine es obligatorio."
    );
  }

  if (typeof getState !== "function") {
    throw new TypeError(
      "[BridgeStart] getState debe ser una función."
    );
  }

  if (typeof resetBridge !== "function") {
    throw new TypeError(
      "[BridgeStart] resetBridge debe ser una función."
    );
  }

  if (
    typeof createSignalingSession !==
    "function"
  ) {
    throw new TypeError(
      "[BridgeStart] createSignalingSession debe ser una función."
    );
  }

  if (typeof socketFactory !== "function") {
    throw new TypeError(
      "[BridgeStart] socketFactory debe ser una función."
    );
  }

  if (
    typeof configureSignaling !==
    "function"
  ) {
    throw new TypeError(
      "[BridgeStart] configureSignaling debe ser una función."
    );
  }

  if (
    typeof getNodeDataChannel !==
    "function"
  ) {
    throw new TypeError(
      "[BridgeStart] getNodeDataChannel debe ser una función."
    );
  }

  return async function startBridge(
    roomId,
    isHost
  ) {
    /*
     * Una nueva sesión siempre comienza desde
     * un estado completamente limpio.
     */
    resetBridge();

    if (!roomId) {
      return {
        success: false,
        error:
          "No se proporcionó una sala.",
      };
    }

    const state =
      getState();

    state.roomId =
      roomId;

    state.isHost =
      Boolean(isHost);

    const NDC =
      getNodeDataChannel();

    console.log(
      `${logPrefix} Iniciando sala ${roomId} como ${
        state.isHost
          ? "HOST"
          : "CLIENTE"
      }`
    );

    sendStatus(
      connectingStatus
    );

    engine.startSignaling({
      createSession:
        createSignalingSession,

      socketFactory,

      url:
        signalingUrl,

      options:
        socketOptions ?? {
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

      configure:
        (signaling) => {
          configureSignaling({
            signaling,
            NDC,

            getState,

            sendStatus,
            getLocalIP,
            getNextClientPort,

            createHostPeer,
            createClientPeer,

            flushHostCandidates,
            flushClientCandidates,

            cleanupClient,
          });
        },
    });

    return {
      success: true,
    };
  };
}

module.exports = {
  createBridgeStarter,
};
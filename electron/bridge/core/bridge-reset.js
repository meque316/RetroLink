// electron/bridge/core/bridge-reset.js

function createBridgeReset({
  engine,
  getState,
  setState,
  clearAllKeepAlives,
  clearClientResources,
  logPrefix = "Bridge",
}) {
  if (!engine) {
    throw new Error(
      "[BridgeReset] engine es obligatorio."
    );
  }

  if (
    typeof getState !== "function"
  ) {
    throw new Error(
      "[BridgeReset] getState debe ser una función."
    );
  }

  if (
    typeof setState !== "function"
  ) {
    throw new Error(
      "[BridgeReset] setState debe ser una función."
    );
  }

  return function resetBridge() {
    const state = getState();

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
            roomId:
              state.roomId,
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
     * El TransportManager es el propietario
     * principal de los transportes.
     */
    if (state.transportManager) {
      try {
        state.transportManager.close();
      } catch {}
    } else if (
      state.relayTransport
    ) {
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

    const nextState =
      engine.resetOwnedState();

    setState(nextState);

    console.log(
      `[${logPrefix}] Reset complete`
    );
  };
}

module.exports = {
  createBridgeReset,
};
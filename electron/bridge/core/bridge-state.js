// electron/bridge/core/bridge-state.js

function createBridgeStateGetter({
  getState,
}) {
  if (typeof getState !== "function") {
    throw new TypeError(
      "[BridgeState] getState debe ser una función."
    );
  }

  return function getBridgeState() {
    const state = getState();

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
              ...client
                .gatheredCandidateTypes,
            ],

            switchingToRelay:
              client.switchingToRelay,

            transport:
              client.transportManager
                ?.getState() ??
              null,

            relay:
              client.relayTransport
                ?.getState?.() ??
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
      isReady:
        state.isHost
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
        state.transportManager
          ?.getState() ??
        null,

      relay:
        state.relayTransport
          ?.getState?.() ??
        null,
    };
  };
}

module.exports = {
  createBridgeStateGetter,
};
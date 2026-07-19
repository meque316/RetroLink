// electron/bridge/quake3/state.js

function createInitialState() {
  return {
    signalingSocket: null,

    roomId: null,
    isHost: false,
    hostIP: null,

    clients: new Map(),

    peer: null,
    channel: null,
    udpTransport: null,
    transportManager: null,
    relayTransport: null,
    switchingToRelay: false,

    pendingCandidates: [],
    remoteDescSet: false,

    clientPort: null,

    iceConnectionState: null,
    iceTimeoutHandle: null,

    gatheredCandidateTypes: new Set(),
  };
}

module.exports = {
  createInitialState,
};
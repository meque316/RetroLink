// electron/bridge/core/initialize-bridge-modules.js

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

function initializeBridgeModules({
  getState,
  sendStatus,

  cleanup,
  transport,
  relay,
  channels,
  watchdog,
  peerConfig,
}) {
  if (typeof getState !== "function") {
    throw new TypeError(
      "[BridgeModules] getState debe ser una función."
    );
  }

  if (typeof sendStatus !== "function") {
    throw new TypeError(
      "[BridgeModules] sendStatus debe ser una función."
    );
  }

  cleanup.initialize({
    getState,
    stopKeepAlive:
      cleanup.stopKeepAlive,
    clearClientTimeout,
  });

  transport.initialize({
    getState,
    createTransportManager:
      transport.createTransportManager,
    createHostUDPProxy:
      transport.createHostUDPProxy,
    createClientUDPTransport:
      transport.createClientUDPTransport,
  });

  relay.initialize({
    getState,
    createSocketRelayTransport:
      relay.createSocketRelayTransport,
    ensureHostTransportResources:
      transport.ensureHostTransportResources,
    ensureClientTransportResources:
      transport.ensureClientTransportResources,
    sendStatus,
  });

  channels.initialize({
    getState,
    normalizeMessage:
      channels.normalizeMessage,
    isKeepAlive:
      channels.isKeepAlive,
    ensureHostTransportResources:
      transport.ensureHostTransportResources,
    ensureClientTransportResources:
      transport.ensureClientTransportResources,
    startKeepAlive:
      channels.startKeepAlive,
    sendStatus,
  });

  watchdog.initialize({
    getState,
    sendStatus,

    activateHostRelay:
      relay.activateHostRelay,

    activateClientRelay:
      relay.activateClientRelay,

    closeHostWebRTCResources:
      cleanup.closeHostWebRTCResources,

    closeClientWebRTCResources:
      cleanup.closeClientWebRTCResources,

    clearClientTimeout,

    isRelayActiveOrConnecting:
      relay.isRelayActiveOrConnecting,

    describeCandidateTypes:
      watchdog.describeCandidateTypes,

    ICE_CONNECT_TIMEOUT_MS:
      watchdog.ICE_CONNECT_TIMEOUT_MS,
  });

  peerConfig.peer.initialize({
    getState,

    buildIceServers:
      peerConfig.buildIceServers,

    flushCandidateQueue:
      peerConfig.flushCandidateQueue,

    getCandidateType:
      peerConfig.getCandidateType,

    logGatheringResult:
      peerConfig.logGatheringResult,

    createHostWatchdog:
      watchdog.createHostWatchdog,

    createClientWatchdog:
      watchdog.createClientWatchdog,

    clearClientTimeout,

    sendStatus,

    isRelayActiveOrConnecting:
      relay.isRelayActiveOrConnecting,

    activateHostRelay:
      relay.activateHostRelay,

    activateClientRelay:
      relay.activateClientRelay,

    closeHostWebRTCResources:
      cleanup.closeHostWebRTCResources,

    closeClientWebRTCResources:
      cleanup.closeClientWebRTCResources,

    cleanupClient:
      cleanup.cleanupClient,

    stopKeepAlive:
      cleanup.stopKeepAlive,

    onHostChannelOpen:
      channels.onHostChannelOpen,

    onClientChannelOpen:
      channels.onClientChannelOpen,

    handleChannelMessage:
      channels.handleChannelMessage,

    peerNamePrefix:
      peerConfig.peerNamePrefix,

    logPrefix:
      peerConfig.logPrefix,
  });
}

module.exports = {
  initializeBridgeModules,
};
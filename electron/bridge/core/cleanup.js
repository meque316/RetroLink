// electron/bridge/quake3/cleanup.js

let deps = null;

function initializeCleanup(injectedDeps) {
  deps = injectedDeps;
}

/*
 * Cierra WebRTC (channel + peer) de un cliente del host de
 * forma segura. Se usa únicamente DESPUÉS de haber iniciado
 * Relay con éxito, nunca antes.
 */
function closeHostWebRTCResources(
  socketId,
  client
) {
  deps.stopKeepAlive(socketId);

  try {
    client.channel?.close();
  } catch {}

  try {
    client.peer?.close();
  } catch {}

  client.channel = null;
  client.peer = null;
  client.remoteDescSet = false;
  client.pendingCandidates = [];
}

/*
 * Igual que closeHostWebRTCResources(), pero para el
 * cliente local.
 */
function closeClientWebRTCResources() {
  const state = deps.getState();

  deps.stopKeepAlive("self");

  try {
    state.channel?.close();
  } catch {}

  try {
    state.peer?.close();
  } catch {}

  state.channel = null;
  state.peer = null;
  state.remoteDescSet = false;
  state.pendingCandidates = [];
}

function clearClientResources(
  socketId,
  client
) {
  deps.clearClientTimeout(client);
  deps.stopKeepAlive(socketId);

  /*
   * Un solo propietario cierra el relay: si existe
   * TransportManager, su close() ya cierra el relay
   * internamente (relayTransport.close() emite
   * game-relay-disable). Solo cerramos relayTransport
   * directamente cuando no hay TransportManager.
   */
  if (client?.transportManager) {
    try {
      client.transportManager.close();
    } catch {}
  } else if (client?.relayTransport) {
    try {
      client.relayTransport.close?.();
    } catch {}
  }

  if (client) {
    client.relayTransport = null;
    client.switchingToRelay = false;
    client.closingWebRTCForRelay = false;
  }

  try {
    client?.udpTransport?.close();
  } catch {}

  try {
    client?.channel?.close();
  } catch {}

  try {
    client?.peer?.close();
  } catch {}
}

function cleanupClient(socketId) {
  const state = deps.getState();

  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  clearClientResources(
    socketId,
    client
  );

  state.clients.delete(socketId);
}

module.exports = {
  initializeCleanup,
  closeHostWebRTCResources,
  closeClientWebRTCResources,
  clearClientResources,
  cleanupClient,
};

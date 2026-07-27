// electron/bridge/core/transport.js

let deps = null;

function initializeTransport(
  injectedDeps
) {
  deps = injectedDeps;
}

/*
 * Crea una sola vez el TransportManager y el proxy UDP
 * correspondiente a cada cliente conectado al host.
 *
 * El proxy debe existir incluso si WebRTC no llega a abrir,
 * porque el modo Relay también necesita reutilizarlo.
 */
function ensureHostTransportResources(
  socketId
) {
  const state =
    deps.getState();

  const client =
    state.clients.get(socketId);

  if (!client) {
    return null;
  }

  client.transportManager ||=
    deps.createTransportManager({
      label:
        `host-${socketId}`,

      onPacket: (buffer) => {
        client.udpTransport
          ?.sendToGame(buffer);
      },
    });

  if (client.clientPort) {
    client.udpTransport ||=
      deps.createHostUDPProxy({
        socketId,

        clientPort:
          client.clientPort,

        onGamePacket: (buffer) =>
          client.transportManager
            ?.send(buffer),
      });
  }

  return client;
}

/*
 * Crea una sola vez los recursos de transporte
 * correspondientes al cliente local.
 *
 * state.clientPort conserva el puerto virtual asignado por
 * RetroLink. El factory UDP decide si debe hacer bind en ese
 * puerto o en un clientListenPort fijo definido por el perfil.
 */
function ensureClientTransportResources() {
  const state =
    deps.getState();

  state.transportManager ||=
    deps.createTransportManager({
      label:
        "client",

      onPacket: (buffer) => {
        state.udpTransport
          ?.sendToGame(buffer);
      },
    });

  if (state.clientPort) {
    state.udpTransport ||=
      deps.createClientUDPTransport({
        localPort:
          state.clientPort,

        onGamePacket: (buffer) =>
          state.transportManager
            ?.send(buffer),
      });
  }

  return state;
}

module.exports = {
  initializeTransport,
  ensureHostTransportResources,
  ensureClientTransportResources,
};
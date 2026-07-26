// electron/bridge/quake3/transport.js

let deps = null;

function initializeTransport(injectedDeps) {
  deps = injectedDeps;
}

/*
 * Crea (una única vez) el TransportManager y el UDP proxy
 * de un cliente del host. El UDP debe existir aunque el
 * DataChannel nunca llegue a abrirse, porque Relay depende
 * de él para poder alcanzar Quake III.
 */
function ensureHostTransportResources(
  socketId
) {
  const state = deps.getState();

  const client =
    state.clients.get(socketId);

  if (!client) {
    return null;
  }

  client.transportManager ||=
    deps.createTransportManager({
      label: `host-${socketId}`,
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
 * Igual que la anterior, pero para el cliente local.
 */
function ensureClientTransportResources() {
  const state = deps.getState();

  state.transportManager ||=
    deps.createTransportManager({
      label: "client",
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

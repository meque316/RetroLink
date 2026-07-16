// electron/bridge/quake3/index.js

const {
  io: socketClient,
} = require("socket.io-client");

const os = require("os");

const {
  SIGNALING_URL,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  ICE_CONNECT_TIMEOUT_MS,
  KEEPALIVE_INTERVAL_MS,
  buildIceServers,
} = require("./config");

const {
  sendStatus,
} = require("./status");

const {
  getCandidateType,
  describeCandidateTypes,
  flushCandidateQueue,
  logGatheringResult,
} = require("./ice-utils");

const {
  createHostUDPProxy,
  createClientUDPTransport,
} = require("./udp-transport");

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

    pendingCandidates: [],
    remoteDescSet: false,

    clientPort: null,

    iceConnectionState: null,
    iceTimeoutHandle: null,
    gatheredCandidateTypes:
      new Set(),
  };
}

let state = createInitialState();

const keepAliveIntervals =
  new Map();

function getLocalIP() {
  const interfaces =
    os.networkInterfaces();

  const addresses = [];

  for (const [
    name,
    networks,
  ] of Object.entries(interfaces)) {
    for (const network of
      networks || []) {
      if (
        network.family === "IPv4" &&
        !network.internal
      ) {
        addresses.push({
          name,
          address: network.address,
        });
      }
    }
  }

  const vpn = addresses.find(
    ({ address }) =>
      address.startsWith("26.") ||
      address.startsWith("10.")
  );

  if (vpn) {
    return vpn.address;
  }

  const lan = addresses.find(
    ({ address }) =>
      address.startsWith("192.168.")
  );

  if (lan) {
    return lan.address;
  }

  return (
    addresses[0]?.address ||
    "127.0.0.1"
  );
}

function getNextClientPort() {
  const usedPorts =
    new Set(
      [...state.clients.values()].map(
        (client) =>
          client.clientPort
      )
    );

  for (
    let offset = 0;
    offset < MAX_CLIENTS;
    offset += 1
  ) {
    const port =
      CLIENT_PORT_BASE + offset;

    if (!usedPorts.has(port)) {
      return port;
    }
  }

  return null;
}

function normalizeMessage(message) {
  return Buffer.isBuffer(message)
    ? message
    : Buffer.from(message);
}

function isKeepAlive(message) {
  const buffer =
    normalizeMessage(message);

  return (
    buffer.length <= 12 &&
    buffer
      .toString("latin1")
      .includes("ping")
  );
}

function sendKeepAlive(channel) {
  if (!channel?.isOpen()) {
    return false;
  }

  try {
    channel.sendMessageBinary(
      Buffer.from(
        "\xFF\xFF\xFF\xFFping"
      )
    );

    return true;
  } catch {
    return false;
  }
}

function stopKeepAlive(key) {
  const interval =
    keepAliveIntervals.get(key);

  if (!interval) {
    return;
  }

  clearInterval(interval);
  keepAliveIntervals.delete(key);
}

function startKeepAlive(
  key,
  channel
) {
  stopKeepAlive(key);

  const interval =
    setInterval(() => {
      if (!sendKeepAlive(channel)) {
        stopKeepAlive(key);
      }
    }, KEEPALIVE_INTERVAL_MS);

  keepAliveIntervals.set(
    key,
    interval
  );
}

function clearClientTimeout(client) {
  if (!client?.iceTimeoutHandle) {
    return;
  }

  clearTimeout(
    client.iceTimeoutHandle
  );

  client.iceTimeoutHandle = null;
}

function clearClientResources(
  socketId,
  client
) {
  clearClientTimeout(client);
  stopKeepAlive(socketId);

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

function resetBridge() {
  for (const interval of
    keepAliveIntervals.values()) {
    clearInterval(interval);
  }

  keepAliveIntervals.clear();

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
          roomId: state.roomId,
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

  try {
    state.udpTransport?.close();
  } catch {}

  try {
    state.channel?.close();
  } catch {}

  try {
    state.peer?.close();
  } catch {}

  try {
    state.signalingSocket?.disconnect();
  } catch {}

  state = createInitialState();

  console.log(
    "[Bridge-Q3] Reset complete"
  );
}

function flushHostCandidates(
  socketId
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  client.pendingCandidates =
    flushCandidateQueue({
      peer: client.peer,
      remoteDescSet:
        client.remoteDescSet,
      candidates:
        client.pendingCandidates,
      label: `host/${socketId}`,
    });
}

function flushClientCandidates() {
  state.pendingCandidates =
    flushCandidateQueue({
      peer: state.peer,
      remoteDescSet:
        state.remoteDescSet,
      candidates:
        state.pendingCandidates,
      label: "cliente",
    });
}

function handleChannelMessage(
  message,
  socketId = null
) {
  const buffer =
    normalizeMessage(message);

  if (isKeepAlive(buffer)) {
    return;
  }

  if (state.isHost) {
    const client =
      state.clients.get(socketId);

    client?.udpTransport
      ?.sendToGame(buffer);

    return;
  }

  state.udpTransport
    ?.sendToGame(buffer);
}

function onHostChannelOpen(
  socketId,
  channel
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  console.log(
    `[Bridge-Q3] DataChannel host abierto para ${socketId}`
  );

  client.udpTransport =
    createHostUDPProxy({
      socketId,
      clientPort:
        client.clientPort,
      channel,
    });

  startKeepAlive(
    socketId,
    channel
  );

  const connected =
    [...state.clients.values()].filter(
      (item) =>
        item.channel?.isOpen()
    ).length;

  sendStatus(
    `¡${connected} jugador(es) conectado(s)! Listos para jugar.`
  );
}

function onClientChannelOpen() {
  console.log(
    `[Bridge-Q3] DataChannel cliente abierto; puerto ${state.clientPort}`
  );

  if (!state.clientPort) {
    sendStatus(
      "Error: no se recibió el puerto local del cliente."
    );

    return;
  }

  state.udpTransport =
    createClientUDPTransport({
      localPort:
        state.clientPort,
      channel:
        state.channel,
    });

  startKeepAlive(
    "self",
    state.channel
  );

  sendStatus(
    "¡Conexión P2P establecida! Listos para jugar."
  );
}

function createHostWatchdog(
  socketId,
  client
) {
  clearClientTimeout(client);

  client.iceTimeoutHandle =
    setTimeout(() => {
      if (
        client.iceConnectionState ===
          "connected" ||
        client.iceConnectionState ===
          "completed"
      ) {
        return;
      }

      const candidates =
        describeCandidateTypes(
          client.gatheredCandidateTypes
        );

      console.error(
        `[Bridge-Q3] Timeout ICE con ${socketId}. Estado: ${
          client.iceConnectionState ||
          "desconocido"
        }. Candidatos: ${candidates}.`
      );

      sendStatus(
        "Tiempo de espera agotado. La red puede requerir un servidor TURN."
      );

      cleanupClient(socketId);
    }, ICE_CONNECT_TIMEOUT_MS);
}

function createClientWatchdog() {
  if (state.iceTimeoutHandle) {
    clearTimeout(
      state.iceTimeoutHandle
    );
  }

  state.iceTimeoutHandle =
    setTimeout(() => {
      if (
        state.iceConnectionState ===
          "connected" ||
        state.iceConnectionState ===
          "completed"
      ) {
        return;
      }

      const candidates =
        describeCandidateTypes(
          state.gatheredCandidateTypes
        );

      console.error(
        `[Bridge-Q3] Timeout ICE cliente. Estado: ${
          state.iceConnectionState ||
          "desconocido"
        }. Candidatos: ${candidates}.`
      );

      sendStatus(
        "Tiempo de espera agotado. La red puede requerir un servidor TURN."
      );

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
    }, ICE_CONNECT_TIMEOUT_MS);
}

function createHostPeer(
  NDC,
  signaling,
  socketId
) {
  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  const peer =
    new NDC.PeerConnection(
      `RetroLink-Q3-Host-${socketId}`,
      {
        iceServers:
          buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  client.peer = peer;

  createHostWatchdog(
    socketId,
    client
  );

  peer.onStateChange(
    (connectionState) => {
      client.iceConnectionState =
        connectionState;

      console.log(
        `[Bridge-Q3] Estado peer host ${socketId}: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        clearClientTimeout(client);

        sendStatus(
          "Conexión P2P establecida con el cliente."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        clearClientTimeout(client);

        sendStatus(
          "Falló la conexión P2P con el cliente."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `[Bridge-Q3] Gathering host ${socketId}: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        logGatheringResult(
          `Host/${socketId}`,
          client.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
          toSocketId:
            socketId,
        }
      );

      signaling.emit(
        "webrtc-client-port",
        {
          roomId:
            state.roomId,
          port:
            client.clientPort,
          toSocketId:
            socketId,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        getCandidateType(candidate);

      client.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `[Bridge-Q3] Candidato host ${socketId} [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
          toSocketId:
            socketId,
        }
      );
    }
  );

  const channel =
    peer.createDataChannel(
      "game",
      {
        ordered: true,
      }
    );

  client.channel = channel;

  channel.onOpen(() => {
    onHostChannelOpen(
      socketId,
      channel
    );
  });

  channel.onMessage((message) => {
    handleChannelMessage(
      message,
      socketId
    );
  });

  channel.onClosed(() => {
    console.log(
      `[Bridge-Q3] Canal cerrado: ${socketId}`
    );

    cleanupClient(socketId);

    sendStatus(
      state.clients.size > 0
        ? `${state.clients.size} jugador(es) conectado(s)`
        : "Esperando jugadores..."
    );
  });

  channel.onError((error) => {
    console.error(
      `[Bridge-Q3] Error DataChannel ${socketId}:`,
      error
    );
  });

  /*
   * El host debe iniciar la oferta.
   */
  setTimeout(() => {
    try {
      peer.setLocalDescription();
    } catch (error) {
      console.error(
        `[Bridge-Q3] Error creando oferta para ${socketId}:`,
        error.message
      );

      cleanupClient(socketId);
    }
  }, 200);
}

function createClientPeer(
  NDC,
  signaling
) {
  const peer =
    new NDC.PeerConnection(
      "RetroLink-Q3-Client",
      {
        iceServers:
          buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  state.peer = peer;

  createClientWatchdog();

  peer.onStateChange(
    (connectionState) => {
      state.iceConnectionState =
        connectionState;

      console.log(
        `[Bridge-Q3] Estado peer cliente: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        if (
          state.iceTimeoutHandle
        ) {
          clearTimeout(
            state.iceTimeoutHandle
          );

          state.iceTimeoutHandle =
            null;
        }

        sendStatus(
          "Conexión P2P establecida."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        sendStatus(
          "Falló la conexión P2P."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `[Bridge-Q3] Gathering cliente: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        logGatheringResult(
          "Cliente",
          state.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      console.log(
        `[Bridge-Q3] Descripción local cliente: ${type}`
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        getCandidateType(candidate);

      state.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `[Bridge-Q3] Candidato cliente [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
        }
      );
    }
  );

  peer.onDataChannel((channel) => {
    state.channel = channel;

    channel.onOpen(
      onClientChannelOpen
    );

    channel.onMessage(
      handleChannelMessage
    );

    channel.onClosed(() => {
      stopKeepAlive("self");

      try {
        state.udpTransport?.close();
      } catch {}

      state.udpTransport = null;

      sendStatus(
        "Conexión P2P cerrada."
      );
    });

    channel.onError((error) => {
      console.error(
        "[Bridge-Q3] Error DataChannel cliente:",
        error
      );
    });
  });
}

function configureSignaling(
  NDC,
  signaling
) {
  signaling.on(
    "connect_error",
    (error) => {
      console.error(
        "[Bridge-Q3] Error de señalización:",
        error.message
      );

      sendStatus(
        "Error al conectar al servidor de señales."
      );
    }
  );

  signaling.on("connect", () => {
    console.log(
      "[Bridge-Q3] Signaling conectado:",
      signaling.id
    );

    if (state.isHost) {
      state.hostIP =
        getLocalIP();
    }

    signaling.emit(
      "webrtc-join",
      {
        roomId:
          state.roomId,
        isHost:
          state.isHost,
        hostIP:
          state.hostIP,
      },
      () => {
        sendStatus(
          state.isHost
            ? "Esperando jugadores..."
            : "Buscando rival en la sala..."
        );
      }
    );
  });

  signaling.on(
    "webrtc-host-ip",
    ({ hostIP } = {}) => {
      if (
        !state.isHost &&
        hostIP
      ) {
        state.hostIP = hostIP;
      }
    }
  );

  signaling.on(
    "webrtc-peer-ready",
    ({ fromSocketId } = {}) => {
      if (
        !state.isHost ||
        !fromSocketId ||
        state.clients.has(
          fromSocketId
        )
      ) {
        return;
      }

      const clientPort =
        getNextClientPort();

      if (!clientPort) {
        sendStatus(
          "La sala alcanzó su máximo de jugadores."
        );

        return;
      }

      state.clients.set(
        fromSocketId,
        {
          peer: null,
          channel: null,
          udpTransport: null,

          clientPort,

          pendingCandidates: [],
          remoteDescSet: false,

          iceConnectionState:
            null,
          iceTimeoutHandle:
            null,

          gatheredCandidateTypes:
            new Set(),
        }
      );

      sendStatus(
        "Rival encontrado. Creando conexión P2P..."
      );

      createHostPeer(
        NDC,
        signaling,
        fromSocketId
      );
    }
  );

  signaling.on(
    "webrtc-client-port",
    ({ port } = {}) => {
      if (
        !state.isHost &&
        Number.isInteger(port)
      ) {
        state.clientPort = port;

        console.log(
          `[Bridge-Q3] Puerto cliente asignado: ${port}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-signal",
    ({
      type,
      sdp,
      candidate,
      mid,
      fromSocketId,
    } = {}) => {
      try {
        if (state.isHost) {
          const client =
            state.clients.get(
              fromSocketId
            );

          if (!client) {
            return;
          }

          if (type === "answer") {
            client.peer.setRemoteDescription(
              sdp,
              "answer"
            );

            client.remoteDescSet =
              true;

            flushHostCandidates(
              fromSocketId
            );

            return;
          }

          if (
            type === "candidate"
          ) {
            client.pendingCandidates.push({
              candidate,
              mid,
            });

            flushHostCandidates(
              fromSocketId
            );
          }

          return;
        }

        if (type === "offer") {
          if (!state.peer) {
            createClientPeer(
              NDC,
              signaling
            );
          }

          sendStatus(
            "Procesando oferta de conexión..."
          );

          /*
           * Corrección importante:
           *
           * node-datachannel genera automáticamente
           * la respuesta después de recibir la oferta.
           * No debemos llamar después a
           * setLocalDescription(), porque generaría
           * una nueva oferta.
           */
          state.peer.setRemoteDescription(
            sdp,
            "offer"
          );

          state.remoteDescSet =
            true;

          flushClientCandidates();

          return;
        }

        if (type === "candidate") {
          state.pendingCandidates.push({
            candidate,
            mid,
          });

          flushClientCandidates();
        }
      } catch (error) {
        console.error(
          "[Bridge-Q3] Error procesando señal:",
          error.message
        );

        sendStatus(
          `Error procesando señal: ${error.message}`
        );
      }
    }
  );

  signaling.on(
    "webrtc-client-left",
    ({ socketId } = {}) => {
      if (
        !state.isHost ||
        !socketId
      ) {
        return;
      }

      cleanupClient(socketId);

      sendStatus(
        state.clients.size > 0
          ? `${state.clients.size} jugador(es) conectado(s)`
          : "Esperando jugadores..."
      );
    }
  );
}

async function startBridge(
  roomId,
  isHost
) {
  resetBridge();

  if (!roomId) {
    return {
      success: false,
      error:
        "No se proporcionó una sala.",
    };
  }

  state.roomId = roomId;
  state.isHost =
    Boolean(isHost);

  const NDC =
    require("node-datachannel");

  console.log(
    `[Bridge-Q3] Iniciando sala ${roomId} como ${
      state.isHost
        ? "HOST"
        : "CLIENTE"
    }`
  );

  sendStatus(
    "Conectando al servidor de señales..."
  );

  const signaling =
    socketClient(
      SIGNALING_URL,
      {
        transports: [
          "websocket",
        ],

        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      }
    );

  state.signalingSocket =
    signaling;

  configureSignaling(
    NDC,
    signaling
  );

  return {
    success: true,
  };
}

function getBridgeState() {
  const connectedClients =
    [...state.clients.entries()]
      .filter(
        ([, client]) =>
          client.channel?.isOpen()
      )
      .map(
        ([socketId, client]) => ({
          socketId,
          clientPort:
            client.clientPort,
          iceConnectionState:
            client.iceConnectionState,
          candidateTypes: [
            ...client.gatheredCandidateTypes,
          ],
        })
      );

  const clientConnected =
    Boolean(
      state.channel?.isOpen()
    );

  return {
    isReady: state.isHost
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
  };
}

module.exports = {
  startBridge,
  resetBridge,

  getClientPort: () =>
    state.clientPort,

  getHostIP: () =>
    state.hostIP,

  getBridgeState,
};
// electron/bridge/relay-c2.js

const {
  io: socketClient,
} = require("socket.io-client");

const os = require("os");
const { BrowserWindow } = require("electron");

const {
  createIPXBroadcastTransport,
  DEFAULT_IPX_PORT,
} = require("./ipx/ipx-broadcast-transport");

const SIGNALING_URL =
  "https://retrolink-server.onrender.com";

const MAX_CLIENTS = 16;

/*
 * Activar con:
 * $env:RETROLINK_DEBUG_IPX="1"
 *
 * En producción queda desactivado para evitar
 * llenar la consola con cada paquete IPX.
 */
const DEBUG_IPX =
  process.env.RETROLINK_DEBUG_IPX === "1";

const CONTROL_PREFIX =
  "__RETROLINK_C2_CONTROL__:";

const KEEPALIVE_INTERVAL_MS = 10000;

const ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",

  "turn:openrelay.metered.ca:80",
  "turn:openrelay.metered.ca:443",
  "turn:openrelay.metered.ca:5349",
];

function createInitialState() {
  return {
    signalingSocket: null,

    roomId: null,
    isHost: false,

    iceConnectionStart: null,
    hostIP: null,

    clients: new Map(),

    peer: null,
    channel: null,

    pendingCandidates: [],
    remoteDescSet: false,

    ipxTransport: null,
  };
}

let state = createInitialState();
const keepAliveIntervals = new Map();

function debugLog(...args) {
  if (DEBUG_IPX) {
    console.log("[Bridge-C2]", ...args);
  }
}

function buildIceServers() {
  /*
   * node-datachannel trabaja correctamente con
   * una lista de URLs ICE como cadenas.
   */
  return [...ICE_SERVERS];
}

function sendToFrontend(channel, data) {
  try {
    const windows =
      BrowserWindow.getAllWindows();

    const mainWindow = windows[0];

    if (
      mainWindow &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(
        channel,
        data
      );
    }
  } catch (error) {
    console.error(
      "[Bridge-C2] Error enviando al frontend:",
      error.message
    );
  }
}

function sendStatus(message) {
  console.log(
    `[Bridge-C2] Status: ${message}`
  );

  sendToFrontend(
    "bridge-status-update",
    message
  );
}

function getLocalIP() {
  const interfaces =
    os.networkInterfaces();

  const results = [];

  for (const [
    interfaceName,
    networks,
  ] of Object.entries(interfaces)) {
    for (const network of networks || []) {
      if (
        network.family === "IPv4" &&
        !network.internal
      ) {
        results.push({
          name: interfaceName,
          address: network.address,
        });
      }
    }
  }

  /*
   * Conservamos la prioridad histórica de RetroLink:
   * VPN primero y luego red LAN.
   */
  const vpnIP = results.find(
    ({ address }) =>
      address.startsWith("26.") ||
      address.startsWith("10.")
  );

  if (vpnIP) {
    return vpnIP.address;
  }

  const lanIP = results.find(
    ({ address }) =>
      address.startsWith("192.168.")
  );

  if (lanIP) {
    return lanIP.address;
  }

  return results[0]?.address || "127.0.0.1";
}

function encodeControlMessage(
  type,
  data = {}
) {
  return Buffer.from(
    `${CONTROL_PREFIX}${JSON.stringify({
      type,
      data,
    })}`,
    "utf8"
  );
}

function decodeControlMessage(buffer) {
  const text = buffer.toString("utf8");

  if (!text.startsWith(CONTROL_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(
      text.slice(CONTROL_PREFIX.length)
    );
  } catch (error) {
    debugLog(
      "Mensaje de control inválido:",
      error.message
    );

    return null;
  }
}

function normalizeBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
  }

  return Buffer.from(value);
}

function sendBinary(channel, value) {
  if (!channel?.isOpen()) {
    return false;
  }

  try {
    const buffer = normalizeBuffer(value);

    channel.sendMessageBinary(buffer);

    return true;
  } catch (error) {
    console.error(
      "[Bridge-C2] Error enviando por DataChannel:",
      error.message
    );

    return false;
  }
}

function broadcastToClients(
  buffer,
  exceptSocketId = null
) {
  let sentCount = 0;

  for (const [
    socketId,
    client,
  ] of state.clients) {
    if (socketId === exceptSocketId) {
      continue;
    }

    if (
      sendBinary(
        client.channel,
        buffer
      )
    ) {
      sentCount += 1;
    }
  }

  return sentCount;
}

function forwardLocalIPXPacket(
  message,
  remoteInfo
) {
  const buffer = normalizeBuffer(message);

  debugLog(
    `IPX local: ${buffer.length} bytes`,
    `desde ${remoteInfo.address}:${remoteInfo.port}`
  );

  if (state.isHost) {
    const sentCount =
      broadcastToClients(buffer);

    if (sentCount > 0) {
      debugLog(
        `Host → ${sentCount} cliente(s):`,
        `${buffer.length} bytes`
      );
    }

    return;
  }

  if (
    sendBinary(
      state.channel,
      buffer
    )
  ) {
    debugLog(
      `Cliente → host: ${buffer.length} bytes`
    );
  }
}

async function injectRemoteIPXPacket(
  buffer
) {
  if (!state.ipxTransport) {
    debugLog(
      "Paquete remoto ignorado: transporte IPX no disponible"
    );

    return;
  }

  try {
    await state.ipxTransport.injectPacket(
      normalizeBuffer(buffer)
    );
  } catch (error) {
    console.error(
      "[Bridge-C2] Error reinyectando paquete IPX:",
      error.message
    );
  }
}

function startIPXTransport() {
  if (state.ipxTransport) {
    return state.ipxTransport.start();
  }

  state.ipxTransport =
    createIPXBroadcastTransport({
      label: "Bridge-C2-IPX",
      port: DEFAULT_IPX_PORT,
      debug: DEBUG_IPX,
      onPacket: forwardLocalIPXPacket,
    });

  return state.ipxTransport.start();
}

function getActiveIPXPort() {
  const transportState =
    state.ipxTransport?.getState?.();

  return (
    transportState?.port ??
    DEFAULT_IPX_PORT
  );
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

  const interval = setInterval(() => {
    if (!channel?.isOpen()) {
      stopKeepAlive(key);
      return;
    }

    sendBinary(
      channel,
      encodeControlMessage(
        "keepalive",
        {
          timestamp: Date.now(),
        }
      )
    );
  }, KEEPALIVE_INTERVAL_MS);

  keepAliveIntervals.set(
    key,
    interval
  );
}

function closeClientConnection(
  socketId,
  client
) {
  stopKeepAlive(socketId);

  try {
    client?.channel?.close();
  } catch {}

  try {
    client?.peer?.close();
  } catch {}
}

function resetBridge() {
  for (const interval of
    keepAliveIntervals.values()) {
    clearInterval(interval);
  }

  keepAliveIntervals.clear();

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
    closeClientConnection(
      socketId,
      client
    );
  }

  state.clients.clear();

  try {
    state.channel?.close();
  } catch {}

  try {
    state.peer?.close();
  } catch {}

  try {
    state.signalingSocket?.disconnect();
  } catch {}

  try {
    state.ipxTransport?.stop();
  } catch {}

  state = createInitialState();

  console.log(
    "[Bridge-C2] Reset complete"
  );
}

function handleChannelMessage(
  message,
  sourceSocketId = null
) {
  const buffer =
    normalizeBuffer(message);

  const control =
    decodeControlMessage(buffer);

  if (control) {
    if (
      control.type !== "keepalive"
    ) {
      debugLog(
        "Mensaje de control:",
        control
      );
    }

    return;
  }

  debugLog(
    `DataChannel → IPX local: ${buffer.length} bytes`
  );

  /*
   * El paquete se reinyecta mediante broadcast
   * para que IPXWrapper lo reciba localmente.
   */
  void injectRemoteIPXPacket(buffer);

  /*
   * El host actúa como concentrador:
   * un paquete recibido desde un cliente también
   * se entrega a los demás clientes de la sala.
   */
  if (
    state.isHost &&
    sourceSocketId
  ) {
    const sentCount =
      broadcastToClients(
        buffer,
        sourceSocketId
      );

    debugLog(
      `Paquete del cliente ${sourceSocketId} reenviado a ${sentCount} cliente(s)`
    );
  }
}

function onHostChannelOpen(
  socketId,
  channel
) {
  console.log(
    `[Bridge-C2] DataChannel del host abierto para ${socketId}`
  );

  startKeepAlive(
    socketId,
    channel
  );

  const connectedCount = [
    ...state.clients.values(),
  ].filter(
    (client) =>
      client.channel?.isOpen()
  ).length;

  sendStatus(
    `¡${connectedCount} jugador(es) conectado(s)! Listos para jugar.`
  );
}

function onClientChannelOpen() {
  console.log(
    "[Bridge-C2] DataChannel del cliente abierto"
  );

  startKeepAlive(
    "self",
    state.channel
  );

  sendStatus(
    "¡Conexión P2P establecida! Listos para jugar."
  );
}

function flushCandidates(
  socketId = null
) {
  if (state.isHost) {
    const client =
      state.clients.get(socketId);

    if (
      !client?.peer ||
      !client.remoteDescSet
    ) {
      return;
    }

    for (const {
      candidate,
      mid,
    } of client.pendingCandidates) {
      try {
        client.peer.addRemoteCandidate(
          candidate,
          mid
        );
      } catch (error) {
        debugLog(
          "No se pudo agregar candidato ICE del cliente:",
          error.message
        );
      }
    }

    client.pendingCandidates = [];
    return;
  }

  if (
    !state.peer ||
    !state.remoteDescSet
  ) {
    return;
  }

  for (const {
    candidate,
    mid,
  } of state.pendingCandidates) {
    try {
      state.peer.addRemoteCandidate(
        candidate,
        mid
      );
    } catch (error) {
      debugLog(
        "No se pudo agregar candidato ICE del host:",
        error.message
      );
    }
  }

  state.pendingCandidates = [];
}

function createHostPeer(
  NDC,
  signaling,
  roomId,
  clientSocketId
) {
  const client =
    state.clients.get(clientSocketId);

  if (!client) {
    return;
  }

  const peer =
    new NDC.PeerConnection(
      `RetroLink-C2-Host-${clientSocketId}`,
      {
        iceServers:
          buildIceServers(),

        iceTransportPolicy: "all",
      }
    );

  client.peer = peer;

  peer.onLocalDescription(
    (sdp, type) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId,
          type,
          sdp,
          toSocketId:
            clientSocketId,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId,
          type: "candidate",
          candidate,
          mid,
          toSocketId:
            clientSocketId,
        }
      );
    }
  );

  const channel =
    peer.createDataChannel(
      "carmageddon2-ipx",
      {
        ordered: true,
      }
    );

  client.channel = channel;

  channel.onOpen(() => {
    onHostChannelOpen(
      clientSocketId,
      channel
    );
  });

  channel.onMessage((message) => {
    handleChannelMessage(
      message,
      clientSocketId
    );
  });

  channel.onClosed(() => {
    console.log(
      `[Bridge-C2] DataChannel cerrado para ${clientSocketId}`
    );

    stopKeepAlive(clientSocketId);
  });

  channel.onError((error) => {
    console.error(
      `[Bridge-C2] Error de DataChannel para ${clientSocketId}:`,
      error
    );
  });

  setTimeout(() => {
    try {
      peer.setLocalDescription();
    } catch (error) {
      console.error(
        "[Bridge-C2] Error creando oferta:",
        error.message
      );
    }
  }, 200);
}

function createClientPeer(
  NDC,
  signaling,
  roomId
) {
  const peer =
    new NDC.PeerConnection(
      "RetroLink-C2-Client",
      {
        iceServers:
          buildIceServers(),

        iceTransportPolicy: "all",
      }
    );

  state.peer = peer;

  peer.onLocalDescription(
    (sdp, type) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId,
          type,
          sdp,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId,
          type: "candidate",
          candidate,
          mid,
        }
      );
    }
  );

  peer.onDataChannel((channel) => {
    state.channel = channel;

    channel.onOpen(() => {
      onClientChannelOpen();
    });

    channel.onMessage((message) => {
      handleChannelMessage(message);
    });

    channel.onClosed(() => {
      console.log(
        "[Bridge-C2] DataChannel del cliente cerrado"
      );

      stopKeepAlive("self");

      sendStatus(
        "La conexión P2P se cerró."
      );
    });

    channel.onError((error) => {
      console.error(
        "[Bridge-C2] Error en DataChannel del cliente:",
        error
      );
    });
  });
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
        "No se proporcionó un identificador de sala.",
    };
  }

  state.roomId = roomId;
  state.isHost = Boolean(isHost);
  state.iceConnectionStart =
    Date.now();

  const NDC =
    require("node-datachannel");

  console.log(
    `[Bridge-C2] Starting — room: ${roomId}, role: ${
      state.isHost
        ? "HOST"
        : "CLIENT"
    }, IPX UDP: ${DEFAULT_IPX_PORT}, max clients: ${MAX_CLIENTS}`
  );

  sendStatus(
    "Preparando transporte IPX..."
  );

  try {
    await startIPXTransport();
  } catch (error) {
    console.error(
      "[Bridge-C2] No se pudo iniciar el transporte IPX:",
      error
    );

    sendStatus(
      `No se pudo abrir el transporte IPX (${DEFAULT_IPX_PORT}): ${error.message}`
    );

    resetBridge();

    return {
      success: false,
      error: error.message,
    };
  }

  sendStatus(
    "Conectando al servidor de señales..."
  );

  const signaling =
    socketClient(
      SIGNALING_URL,
      {
        transports: ["websocket"],
        reconnection: false,
      }
    );

  state.signalingSocket =
    signaling;

  signaling.on(
    "connect_error",
    (error) => {
      console.error(
        "[Bridge-C2] Error de señalización:",
        error.message
      );

      sendStatus(
        "Error al conectar al servidor de señales."
      );
    }
  );

  signaling.on("connect", () => {
    console.log(
      "[Bridge-C2] Signaling connected:",
      signaling.id
    );

    sendStatus(
      "Uniéndose a la sala..."
    );

    if (state.isHost) {
      state.hostIP = getLocalIP();

      console.log(
        `[Bridge-C2] Host IP: ${state.hostIP}`
      );
    }

    signaling.emit(
      "webrtc-join",
      {
        roomId,
        isHost: state.isHost,
        hostIP: state.hostIP,
      },
      (response) => {
        console.log(
          "[Bridge-C2] webrtc-join acknowledged:",
          response
        );

        sendStatus(
          state.isHost
            ? "Esperando jugadores..."
            : "Buscando al host en la sala..."
        );
      }
    );
  });

  signaling.on(
    "webrtc-host-ip",
    ({ hostIP } = {}) => {
      if (
        state.isHost ||
        !hostIP
      ) {
        return;
      }

      state.hostIP = hostIP;

      console.log(
        `[Bridge-C2] Host IP received: ${hostIP}`
      );
    }
  );

  signaling.on(
    "webrtc-peer-ready",
    ({ fromSocketId } = {}) => {
      if (!state.isHost) {
        return;
      }

      if (!fromSocketId) {
        console.warn(
          "[Bridge-C2] webrtc-peer-ready sin fromSocketId"
        );

        return;
      }

      if (
        state.clients.has(
          fromSocketId
        )
      ) {
        return;
      }

      if (
        state.clients.size >=
        MAX_CLIENTS
      ) {
        console.warn(
          `[Bridge-C2] Sala llena (${MAX_CLIENTS} clientes)`
        );

        sendStatus(
          `La sala alcanzó el máximo de ${MAX_CLIENTS} clientes.`
        );

        return;
      }

      console.log(
        `[Bridge-C2] Nuevo cliente: ${fromSocketId}`
      );

      sendStatus(
        "Rival encontrado — creando conexión P2P..."
      );

      state.clients.set(
        fromSocketId,
        {
          peer: null,
          channel: null,

          pendingCandidates: [],
          remoteDescSet: false,
        }
      );

      createHostPeer(
        NDC,
        signaling,
        roomId,
        fromSocketId
      );
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
            debugLog(
              `Señal ignorada de cliente desconocido: ${fromSocketId}`
            );

            return;
          }

          if (type === "answer") {
            client.peer.setRemoteDescription(
              sdp,
              "answer"
            );

            client.remoteDescSet =
              true;

            flushCandidates(
              fromSocketId
            );

            console.log(
              `[Bridge-C2] Host recibió respuesta de ${fromSocketId}`
            );

            return;
          }

          if (type === "candidate") {
            if (
              client.peer &&
              client.remoteDescSet
            ) {
              try {
                client.peer.addRemoteCandidate(
                  candidate,
                  mid
                );
              } catch (error) {
                debugLog(
                  "Error agregando candidato remoto del cliente:",
                  error.message
                );
              }
            } else {
              client.pendingCandidates.push({
                candidate,
                mid,
              });
            }
          }

          return;
        }

        if (type === "offer") {
          if (!state.peer) {
            createClientPeer(
              NDC,
              signaling,
              roomId
            );
          }

          console.log(
            "[Bridge-C2] Cliente recibió oferta"
          );

          sendStatus(
            "Procesando oferta de conexión..."
          );

          state.peer.setRemoteDescription(
            sdp,
            "offer"
          );

          state.remoteDescSet = true;

          flushCandidates();

          setTimeout(() => {
            try {
              state.peer.setLocalDescription();

              console.log(
                "[Bridge-C2] Cliente envió respuesta"
              );
            } catch (error) {
              console.error(
                "[Bridge-C2] Error creando respuesta:",
                error.message
              );

              sendStatus(
                `Error respondiendo conexión: ${error.message}`
              );
            }
          }, 500);

          return;
        }

        if (type === "candidate") {
          if (
            state.peer &&
            state.remoteDescSet
          ) {
            try {
              state.peer.addRemoteCandidate(
                candidate,
                mid
              );
            } catch (error) {
              debugLog(
                "Error agregando candidato remoto del host:",
                error.message
              );
            }
          } else {
            state.pendingCandidates.push({
              candidate,
              mid,
            });
          }
        }
      } catch (error) {
        console.error(
          "[Bridge-C2] Error procesando señal:",
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

      const client =
        state.clients.get(socketId);

      if (!client) {
        return;
      }

      console.log(
        `[Bridge-C2] Cliente desconectado: ${socketId}`
      );

      closeClientConnection(
        socketId,
        client
      );

      state.clients.delete(socketId);

      const remaining =
        state.clients.size;

      sendStatus(
        remaining > 0
          ? `${remaining} jugador(es) conectado(s)`
          : "Esperando jugadores..."
      );
    }
  );

  console.log(
    "[Bridge-C2] Túnel IPX activo"
  );

  return {
    success: true,
    ipxPort: getActiveIPXPort(),
  };
}

function getBridgeState() {
  const connectedClients = [
    ...state.clients.values(),
  ].filter(
    (client) =>
      client.channel?.isOpen()
  ).length;

  const clientReady =
    Boolean(
      state.channel?.isOpen()
    );

  return {
    isReady: state.isHost
      ? connectedClients > 0
      : clientReady,

    isHost: state.isHost,
    roomId: state.roomId,

    clientCount: state.isHost
      ? connectedClients
      : clientReady
        ? 1
        : 0,

    clientPort:
      getActiveIPXPort(),

    hostIP:
      state.hostIP,

    maxClients:
      MAX_CLIENTS,

    debugIPX:
      DEBUG_IPX,

    signalingConnected:
      Boolean(
        state.signalingSocket?.connected
      ),

    ipx:
      state.ipxTransport?.getState?.() ||
      null,
  };
}

module.exports = {
  startBridge,
  resetBridge,

  getClientPort:
    getActiveIPXPort,

  getHostIP: () =>
    state.hostIP,

  getBridgeState,
};
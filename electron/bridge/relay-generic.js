// electron/bridge/relay-generic.js

const { io: socketClient } = require("socket.io-client");
const os = require("os");
const dgram = require("dgram");
const { BrowserWindow } = require("electron");

const DEFAULT_SIGNALING_URL =
  "https://retrolink-server.onrender.com";

const DEFAULT_ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",
  "turn:openrelay.metered.ca:80",
  "turn:openrelay.metered.ca:443",
  "turn:openrelay.metered.ca:5349",
];

function createGenericRelay({
  label = "Generic",
  gamePort,
  clientPortBase,
  maxClients = 8,
  signalingUrl = DEFAULT_SIGNALING_URL,
  iceServers = DEFAULT_ICE_SERVERS,
  bindAddress = "127.0.0.1",
  targetAddress = "127.0.0.1",
  ordered = true,
  keepAliveMs = 10000,
  debugPackets = false,
} = {}) {
  if (!Number.isInteger(gamePort) || gamePort <= 0) {
    throw new Error(
      "[Relay Generic] gamePort debe ser un puerto válido."
    );
  }

  if (!Number.isInteger(clientPortBase) || clientPortBase <= 0) {
    throw new Error(
      "[Relay Generic] clientPortBase debe ser un puerto válido."
    );
  }

  const prefix = `[Bridge-${label}]`;

  const state = {
    signalingSocket: null,
    roomId: null,
    isHost: false,
    iceConnectionStart: null,
    hostIP: null,

    clients: new Map(),

    peer: null,
    channel: null,
    udpLocal: null,

    pendingCandidates: [],
    remoteDescSet: false,
    clientPort: null,
  };

  const keepAliveIntervals = new Map();

  function log(...args) {
    console.log(prefix, ...args);
  }

  function warn(...args) {
    console.warn(prefix, ...args);
  }

  function error(...args) {
    console.error(prefix, ...args);
  }

  function sendToFrontend(channel, data) {
    try {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];

      if (
        mainWindow &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send(channel, data);
      }
    } catch (err) {
      error("Error enviando evento al frontend:", err.message);
    }
  }

  function sendStatus(message) {
    log(`Status: ${message}`);
    sendToFrontend("bridge-status-update", message);
  }

  function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const networkInterface of interfaces[name] || []) {
        if (
          networkInterface.family === "IPv4" &&
          !networkInterface.internal
        ) {
          addresses.push({
            name,
            address: networkInterface.address,
          });
        }
      }
    }

    const vpnAddress = addresses.find(
      ({ address }) =>
        address.startsWith("26.") ||
        address.startsWith("10.")
    );

    if (vpnAddress) {
      return vpnAddress.address;
    }

    const lanAddress = addresses.find(({ address }) =>
      address.startsWith("192.168.")
    );

    if (lanAddress) {
      return lanAddress.address;
    }

    return addresses[0]?.address || "127.0.0.1";
  }

  function getNextClientPort() {
    const usedPorts = new Set(
      [...state.clients.values()].map(
        (client) => client.clientPort
      )
    );

    for (let index = 0; index < maxClients; index += 1) {
      const port = clientPortBase + index;

      if (!usedPorts.has(port)) {
        return port;
      }
    }

    return null;
  }

  function clearKeepAlive(key) {
    const interval = keepAliveIntervals.get(key);

    if (interval) {
      clearInterval(interval);
      keepAliveIntervals.delete(key);
    }
  }

  function startKeepAlive(key, channel) {
    clearKeepAlive(key);

    const interval = setInterval(() => {
      if (!channel?.isOpen()) {
        clearKeepAlive(key);
        return;
      }

      try {
        channel.sendMessageBinary(
          Buffer.from("\xFF\xFF\xFF\xFFping")
        );
      } catch (err) {
        error("Error enviando keepalive:", err.message);
        clearKeepAlive(key);
      }
    }, keepAliveMs);

    keepAliveIntervals.set(key, interval);
  }

  function closeClient(client) {
    try {
      client.channel?.close();
    } catch {}

    try {
      client.peer?.close();
    } catch {}

    try {
      client.udpProxy?.close();
    } catch {}
  }

  function resetBridge() {
    for (const interval of keepAliveIntervals.values()) {
      clearInterval(interval);
    }

    keepAliveIntervals.clear();

    try {
      if (state.signalingSocket && state.roomId) {
        state.signalingSocket.emit("webrtc-leave", {
          roomId: state.roomId,
        });
      }
    } catch {}

    for (const client of state.clients.values()) {
      closeClient(client);
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
      state.udpLocal?.close();
    } catch {}

    state.signalingSocket = null;
    state.roomId = null;
    state.isHost = false;
    state.iceConnectionStart = null;
    state.hostIP = null;

    state.peer = null;
    state.channel = null;
    state.udpLocal = null;

    state.pendingCandidates = [];
    state.remoteDescSet = false;
    state.clientPort = null;

    log("Reset complete");
  }

  function createHostUDPProxy(
    socketId,
    clientPort,
    channel
  ) {
    const udpProxy = dgram.createSocket("udp4");

    udpProxy.on("error", (err) => {
      error(
        `Host proxy error para cliente ${socketId}:`,
        err.message
      );
    });

    udpProxy.bind(0, bindAddress, () => {
      const address = udpProxy.address();

      log(
        `Host proxy para cliente ${socketId} escuchando en ` +
          `${address.address}:${address.port} ` +
          `(puerto virtual del cliente: ${clientPort}, ` +
          `puerto del juego: ${gamePort})`
      );
    });

    udpProxy.on("message", (message, remoteInfo) => {
      if (debugPackets) {
        log(
          `Host proxy recibió ${message.length} bytes desde ` +
            `${remoteInfo.address}:${remoteInfo.port}`
        );
      }

      if (!channel?.isOpen()) {
        return;
      }

      try {
        channel.sendMessageBinary(Buffer.from(message));

        if (debugPackets) {
          log(
            `Host → DataChannel: ${message.length} bytes`
          );
        }
      } catch (err) {
        error(
          `Error enviando paquete del host al cliente ${socketId}:`,
          err.message
        );
      }
    });

    return udpProxy;
  }

  function onHostChannelOpen(
    socketId,
    channel,
    clientPort
  ) {
    log(
      `DataChannel host abierto para ${socketId}, ` +
        `puerto virtual ${clientPort}`
    );

    const client = state.clients.get(socketId);

    if (!client) {
      return;
    }

    client.udpProxy = createHostUDPProxy(
      socketId,
      clientPort,
      channel
    );

    startKeepAlive(socketId, channel);

    const connectedCount = [
      ...state.clients.values(),
    ].filter((clientData) => clientData.udpProxy).length;

    sendStatus(
      `¡${connectedCount} jugador(es) conectado(s)! ` +
        "Listos para jugar."
    );
  }

  function onClientChannelOpen() {
    log(
      `DataChannel cliente abierto, puerto local: ` +
        `${state.clientPort}`
    );

    sendStatus(
      "¡Conexión P2P establecida! Listos para jugar."
    );

    if (!state.clientPort) {
      error(
        "No se recibió un puerto local para el cliente."
      );

      sendStatus(
        "No se pudo asignar el puerto local del juego."
      );

      return;
    }

    state.udpLocal = dgram.createSocket("udp4");

    state.udpLocal.on("error", (err) => {
      error("Error UDP del cliente:", err.message);

      if (err.code === "EADDRINUSE") {
        sendStatus(
          `El puerto ${state.clientPort} está ocupado. ` +
            "Cierra RetroLink y vuelve a abrirlo."
        );
      }
    });

    state.udpLocal.bind(
      state.clientPort,
      bindAddress,
      () => {
        log(
          `Cliente UDP escuchando en ` +
            `${bindAddress}:${state.clientPort}`
        );
      }
    );

    state.udpLocal.on(
      "message",
      (message, remoteInfo) => {
        if (debugPackets) {
          log(
            `Cliente UDP recibió ${message.length} bytes desde ` +
              `${remoteInfo.address}:${remoteInfo.port}`
          );
        }

        if (!state.channel?.isOpen()) {
          return;
        }

        try {
          state.channel.sendMessageBinary(
            Buffer.from(message)
          );

          if (debugPackets) {
            log(
              `Cliente → DataChannel: ` +
                `${message.length} bytes`
            );
          }
        } catch (err) {
          error(
            "Error enviando paquete del cliente:",
            err.message
          );
        }
      }
    );

    startKeepAlive("self", state.channel);
  }

  function onChannelMessage(message, socketId = null) {
    const buffer = Buffer.isBuffer(message)
      ? message
      : Buffer.from(message);

    if (
      buffer.length <= 12 &&
      buffer.toString("latin1").includes("ping")
    ) {
      return;
    }

    if (state.isHost) {
      const client = state.clients.get(socketId);

      if (!client?.udpProxy) {
        return;
      }

      client.udpProxy.send(
        buffer,
        0,
        buffer.length,
        gamePort,
        targetAddress,
        (err) => {
          if (err) {
            error(
              `DataChannel → juego host (${gamePort}):`,
              err.message
            );
          } else if (debugPackets) {
            log(
              `DataChannel → juego host: ` +
                `${buffer.length} bytes a ` +
                `${targetAddress}:${gamePort}`
            );
          }
        }
      );

      return;
    }

    if (!state.udpLocal) {
      return;
    }

    state.udpLocal.send(
      buffer,
      0,
      buffer.length,
      gamePort,
      targetAddress,
      (err) => {
        if (err) {
          error(
            `DataChannel → juego cliente (${gamePort}):`,
            err.message
          );
        } else if (debugPackets) {
          log(
            `DataChannel → juego cliente: ` +
              `${buffer.length} bytes a ` +
              `${targetAddress}:${gamePort}`
          );
        }
      }
    );
  }

  function flushCandidates(socketId = null) {
    if (state.isHost) {
      const client = state.clients.get(socketId);

      if (!client?.peer || !client.remoteDescSet) {
        return;
      }

      for (const { candidate, mid } of client.pendingCandidates) {
        try {
          client.peer.addRemoteCandidate(candidate, mid);
        } catch (err) {
          error(
            `Error agregando candidato remoto para ${socketId}:`,
            err.message
          );
        }
      }

      client.pendingCandidates = [];
      return;
    }

    if (!state.peer || !state.remoteDescSet) {
      return;
    }

    for (const { candidate, mid } of state.pendingCandidates) {
      try {
        state.peer.addRemoteCandidate(candidate, mid);
      } catch (err) {
        error(
          "Error agregando candidato remoto del cliente:",
          err.message
        );
      }
    }

    state.pendingCandidates = [];
  }

  function createHostPeer(
    NodeDataChannel,
    signalingSocket,
    roomId,
    clientSocketId,
    clientPort
  ) {
    const peer = new NodeDataChannel.PeerConnection(
      `RetroLink-${label}-Host-${clientSocketId}`,
      {
        iceServers: [...iceServers],
        iceTransportPolicy: "all",
      }
    );

    const client = state.clients.get(clientSocketId);

    if (!client) {
      peer.close();
      return;
    }

    client.peer = peer;

    peer.onLocalDescription((sdp, type) => {
      signalingSocket.emit("webrtc-signal", {
        roomId,
        type,
        sdp,
        toSocketId: clientSocketId,
      });

      signalingSocket.emit("webrtc-client-port", {
        roomId,
        port: clientPort,
        toSocketId: clientSocketId,
      });
    });

    peer.onLocalCandidate((candidate, mid) => {
      signalingSocket.emit("webrtc-signal", {
        roomId,
        type: "candidate",
        candidate,
        mid,
        toSocketId: clientSocketId,
      });
    });

    const channel = peer.createDataChannel("game", {
      ordered,
    });

    client.channel = channel;

    channel.onOpen(() => {
      onHostChannelOpen(
        clientSocketId,
        channel,
        clientPort
      );
    });

    channel.onMessage((message) => {
      onChannelMessage(message, clientSocketId);
    });

    setTimeout(() => {
      try {
        peer.setLocalDescription();
      } catch (err) {
        error(
          `Error creando oferta para ${clientSocketId}:`,
          err.message
        );
      }
    }, 200);
  }

  function createClientPeer(
    NodeDataChannel,
    signalingSocket,
    roomId
  ) {
    const peer = new NodeDataChannel.PeerConnection(
      `RetroLink-${label}-Client`,
      {
        iceServers: [...iceServers],
        iceTransportPolicy: "all",
      }
    );

    state.peer = peer;

    peer.onLocalDescription((sdp, type) => {
      signalingSocket.emit("webrtc-signal", {
        roomId,
        type,
        sdp,
      });
    });

    peer.onLocalCandidate((candidate, mid) => {
      signalingSocket.emit("webrtc-signal", {
        roomId,
        type: "candidate",
        candidate,
        mid,
      });
    });

    peer.onDataChannel((channel) => {
      state.channel = channel;

      channel.onOpen(() => {
        onClientChannelOpen();
      });

      channel.onMessage((message) => {
        onChannelMessage(message);
      });
    });
  }

  async function startBridge(roomId, isHost) {
    resetBridge();

    if (!roomId) {
      return {
        success: false,
        error: "Room ID inválido.",
      };
    }

    state.roomId = roomId;
    state.isHost = Boolean(isHost);
    state.iceConnectionStart = Date.now();

    const NodeDataChannel = require("node-datachannel");

    log(
      `Starting — room: ${roomId}, ` +
        `role: ${state.isHost ? "HOST" : "CLIENT"}, ` +
        `game port: ${gamePort}, ` +
        `client port base: ${clientPortBase}`
    );

    sendStatus("Conectando al servidor de señales...");

    const signalingSocket = socketClient(signalingUrl, {
      transports: ["websocket"],
      reconnection: false,
    });

    state.signalingSocket = signalingSocket;

    signalingSocket.on("connect_error", (err) => {
      error("Error del servidor de señales:", err.message);

      sendStatus(
        "Error al conectar al servidor de señales."
      );
    });

    signalingSocket.on("connect", () => {
      log(
        `Signaling connected: ${signalingSocket.id}`
      );

      sendStatus("Uniéndose a la sala...");

      if (state.isHost) {
        state.hostIP = getLocalIP();
        log(`Host IP: ${state.hostIP}`);
      }

      signalingSocket.emit(
        "webrtc-join",
        {
          roomId,
          isHost: state.isHost,
          hostIP: state.hostIP,
        },
        (response) => {
          log(
            "webrtc-join acknowledged:",
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

    signalingSocket.on(
      "webrtc-host-ip",
      ({ hostIP } = {}) => {
        if (state.isHost) {
          return;
        }

        state.hostIP = hostIP || null;
        log(`Host IP received: ${state.hostIP}`);
      }
    );

    signalingSocket.on(
      "webrtc-peer-ready",
      ({ fromSocketId } = {}) => {
        if (!state.isHost) {
          return;
        }

        const clientSocketId =
          fromSocketId || "unknown";

        if (state.clients.has(clientSocketId)) {
          return;
        }

        const clientPort = getNextClientPort();

        if (!clientPort) {
          warn(
            `Sala llena. Máximo de clientes: ${maxClients}`
          );

          sendStatus("La sala alcanzó su capacidad máxima.");
          return;
        }

        log(
          `New client ${clientSocketId} → ` +
            `port ${clientPort}`
        );

        sendStatus(
          "Jugador encontrado — creando conexión P2P..."
        );

        state.clients.set(clientSocketId, {
          peer: null,
          channel: null,
          udpProxy: null,
          clientPort,
          pendingCandidates: [],
          remoteDescSet: false,
        });

        createHostPeer(
          NodeDataChannel,
          signalingSocket,
          roomId,
          clientSocketId,
          clientPort
        );
      }
    );

    signalingSocket.on(
      "webrtc-client-port",
      ({ port } = {}) => {
        if (state.isHost) {
          return;
        }

        const numericPort = Number(port);

        if (
          !Number.isInteger(numericPort) ||
          numericPort <= 0
        ) {
          error(
            "Puerto de cliente inválido recibido:",
            port
          );
          return;
        }

        state.clientPort = numericPort;

        log(
          `Assigned client port: ${state.clientPort}`
        );

        sendToFrontend(
          "client-port-assigned",
          state.clientPort
        );
      }
    );

    signalingSocket.on(
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
              state.clients.get(fromSocketId);

            if (!client) {
              return;
            }

            if (type === "answer") {
              client.peer.setRemoteDescription(
                sdp,
                "answer"
              );

              client.remoteDescSet = true;
              flushCandidates(fromSocketId);

              log(
                `Host received answer from ${fromSocketId}`
              );
            } else if (type === "candidate") {
              if (
                client.peer &&
                client.remoteDescSet
              ) {
                client.peer.addRemoteCandidate(
                  candidate,
                  mid
                );
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
                NodeDataChannel,
                signalingSocket,
                roomId
              );
            }

            log("Client received offer");
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
                log("Client answer sent");
              } catch (err) {
                error(
                  "Error creando respuesta del cliente:",
                  err.message
                );

                sendStatus(
                  `Error respondiendo conexión: ${err.message}`
                );
              }
            }, 500);
          } else if (type === "candidate") {
            if (
              state.peer &&
              state.remoteDescSet
            ) {
              state.peer.addRemoteCandidate(
                candidate,
                mid
              );
            } else {
              state.pendingCandidates.push({
                candidate,
                mid,
              });
            }
          }
        } catch (err) {
          error(
            "Error procesando señal WebRTC:",
            err.message
          );

          sendStatus(
            `Error procesando señal: ${err.message}`
          );
        }
      }
    );

    signalingSocket.on(
      "webrtc-client-left",
      ({ socketId } = {}) => {
        if (!state.isHost || !socketId) {
          return;
        }

        const client = state.clients.get(socketId);

        if (!client) {
          return;
        }

        log(`Client ${socketId} disconnected`);

        closeClient(client);
        clearKeepAlive(socketId);
        state.clients.delete(socketId);

        const remaining = state.clients.size;

        sendStatus(
          remaining > 0
            ? `${remaining} jugador(es) conectado(s)`
            : "Esperando jugadores..."
        );

        sendToFrontend("client-disconnected", {
          socketId,
          remaining,
        });
      }
    );

    log("Tunnel running");

    return {
      success: true,
      gamePort,
      clientPortBase,
      label,
    };
  }

  function getBridgeState() {
    const connectedClients = [
      ...state.clients.values(),
    ].filter((client) => client.channel?.isOpen()).length;

    return {
      isReady: state.isHost
        ? connectedClients > 0
        : Boolean(state.channel?.isOpen()),

      isHost: state.isHost,
      roomId: state.roomId,

      clientCount: connectedClients,
      clientPort: state.clientPort,
      hostIP: state.hostIP,

      gamePort,
      clientPortBase,
      label,

      iceConnectionStart: state.iceConnectionStart,
    };
  }

  return {
    startBridge,
    resetBridge,

    getClientPort: () => state.clientPort,
    getHostIP: () => state.hostIP,
    getBridgeState,

    getConfig: () => ({
      label,
      gamePort,
      clientPortBase,
      maxClients,
      signalingUrl,
      bindAddress,
      targetAddress,
      ordered,
      keepAliveMs,
      debugPackets,
    }),
  };
}

module.exports = createGenericRelay;
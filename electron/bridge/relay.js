const { io: socketClient } = require("socket.io-client");
const os = require("os");
const dgram = require("dgram");
const { getGame } = require("../games");

const SIGNALING_URL = "https://retrolink-server.onrender.com";
const MAX_CLIENTS = 8;

let state = {
  signalingSocket: null,
  roomId: null,
  isHost: false,
  currentGame: null,
  hostIP: null,
  clients: new Map(), // HOST: socketId -> { peer, channel, udpProxy, clientPort, pendingCandidates, remoteDescSet }
  peer: null,         // CLIENTE
  channel: null,      // CLIENTE
  udpLocal: null,     // CLIENTE
  clientPort: null,   // CLIENTE
  pendingCandidates: [],
  remoteDescSet: false
};

let keepAliveIntervals = new Map();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  const vpnIP = results.find(ip => ip.address.startsWith('26.') || ip.address.startsWith('10.'));
  if (vpnIP) return vpnIP.address;
  const lanIP = results.find(ip => ip.address.startsWith('192.168.'));
  if (lanIP) return lanIP.address;
  return results[0]?.address || '127.0.0.1';
}

function getNextClientPort(game) {
  const usedPorts = new Set([...state.clients.values()].map(c => c.clientPort));
  for (let i = 0; i < MAX_CLIENTS; i++) {
    const port = game.clientPortBase + i;
    if (!usedPorts.has(port)) return port;
  }
  return null;
}

function resetBridge() {
  for (const [, interval] of keepAliveIntervals) clearInterval(interval);
  keepAliveIntervals.clear();

  try { if (state.signalingSocket && state.roomId) state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId }); } catch(e) {}
  for (const [socketId, client] of state.clients) {
    try { client.channel?.close(); } catch(e) {}
    try { client.peer?.close(); } catch(e) {}
    try { client.udpProxy?.close(); } catch(e) {}
  }
  state.clients.clear();

  try { state.channel?.close(); } catch(e) {}
  try { state.peer?.close(); } catch(e) {}
  try { state.signalingSocket?.disconnect(); } catch(e) {}
  try { state.udpLocal?.close(); } catch(e) {}

  state.signalingSocket = null;
  state.peer = null;
  state.channel = null;
  state.udpLocal = null;
  state.roomId = null;
  state.currentGame = null;
  state.pendingCandidates = [];
  state.remoteDescSet = false;
  console.log("[Bridge] Reset complete via Module");
}

function onChannelMessage(buf, sendStatus, socketId = null) {
  if (buf.length <= 12 && buf.toString("latin1").includes("ping")) return;
  const game = state.currentGame;
  if (!game) return;

  if (state.isHost) {
    const client = state.clients.get(socketId);
    if (!client?.udpProxy) return;
    client.udpProxy.send(buf, 0, buf.length, game.defaultPort, "127.0.0.1");
  } else {
    if (!state.udpLocal) return;
    state.udpLocal.send(buf, 0, buf.length, game.defaultPort, "127.0.0.1");
  }
}

function createHostUDPProxy(socketId, clientPort, channel, sendStatus) {
  const udpProxy = dgram.createSocket("udp4");
  const game = state.currentGame;

  udpProxy.on("error", (err) => {
    console.error(`[Bridge] Host proxy error (client ${socketId}):`, err.message);
  });

  udpProxy.bind(0, "127.0.0.1", () => {
    const addr = udpProxy.address();
    console.log(`[Bridge] Proxy UDP de Host para cliente ${socketId} en puerto local ${addr.port} (Puerto Juego: ${clientPort})`);
  });

  udpProxy.on("message", (msg) => {
    if (channel?.isOpen()) {
      try { channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
    }
  });

  return udpProxy;
}

function onHostChannelOpen(socketId, channel, clientPort, sendStatus) {
  console.log(`[Bridge] Host DataChannel abierto para cliente ${socketId} en puerto de juego ${clientPort}`);
  const client = state.clients.get(socketId);
  if (!client) return;

  const udpProxy = createHostUDPProxy(socketId, clientPort, channel, sendStatus);
  client.udpProxy = udpProxy;

  const interval = setInterval(() => {
    if (channel?.isOpen()) {
      try { channel.sendMessageBinary(Buffer.from("\xFF\xFF\xFF\xFFping")); } catch(e) {
        clearInterval(interval);
        keepAliveIntervals.delete(socketId);
      }
    } else {
      clearInterval(interval);
      keepAliveIntervals.delete(socketId);
    }
  }, 10000);
  keepAliveIntervals.set(socketId, interval);

  const connectedCount = [...state.clients.values()].filter(c => c.udpProxy).length;
  sendStatus(`¡${connectedCount} jugador(es) conectado(s)! Conexión establecida.`);
}

function onClientChannelOpen(sendStatus) {
  console.log(`[Bridge] Client DataChannel abierto (puerto: ${state.clientPort})`);
  sendStatus("Conexión establecida — ¡Listos para jugar!");

  state.udpLocal = dgram.createSocket("udp4");

  state.udpLocal.on("error", (err) => {
    console.error("[Bridge] Client UDP error:", err.message);
    if (err.code === "EADDRINUSE") {
      sendStatus(`Puerto ${state.clientPort} ocupado. Cierra el juego o app y reintenta.`);
    }
  });

  state.udpLocal.bind(state.clientPort, "127.0.0.1", () => {
    console.log(`[Bridge] Cliente UDP escuchando en 127.0.0.1:${state.clientPort}`);
  });

  state.udpLocal.on("message", (msg) => {
    if (state.channel?.isOpen()) {
      try { state.channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
    }
  });

  const interval = setInterval(() => {
    if (state.channel?.isOpen()) {
      try { state.channel.sendMessageBinary(Buffer.from("\xFF\xFF\xFF\xFFping")); } catch(e) {
        clearInterval(interval);
        keepAliveIntervals.delete("self");
      }
    } else {
      clearInterval(interval);
      keepAliveIntervals.delete("self");
    }
  }, 10000);
  keepAliveIntervals.set("self", interval);
}

function flushCandidates(socketId = null) {
  if (state.isHost) {
    const client = state.clients.get(socketId);
    if (!client?.peer || !client.remoteDescSet) return;
    client.pendingCandidates.forEach(({ candidate, mid }) => {
      try { client.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
    });
    client.pendingCandidates = [];
  } else {
    if (!state.peer || !state.remoteDescSet) return;
    state.pendingCandidates.forEach(({ candidate, mid }) => {
      try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
    });
    state.pendingCandidates = [];
  }
}

function createHostPeer(NDC, sig, roomId, clientSocketId, clientPort, sendStatus) {
  const peer = new NDC.PeerConnection(`RetroLink-Host-${clientSocketId}`, {
    iceServers: ["stun:stun.l.google.com:19302"],
    iceTransportPolicy: "all"
  });

  const client = state.clients.get(clientSocketId);
  client.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    sig.emit("webrtc-signal", { roomId, type, sdp, toSocketId: clientSocketId });
    sig.emit("webrtc-client-port", { roomId, port: clientPort, toSocketId: clientSocketId });
  });

  peer.onLocalCandidate((candidate, mid) => {
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid, toSocketId: clientSocketId });
  });

  const channel = peer.createDataChannel("game", { ordered: true });
  client.channel = channel;

  channel.onOpen(() => onHostChannelOpen(clientSocketId, channel, clientPort, sendStatus));
  channel.onMessage((msg) => onChannelMessage(msg, sendStatus, clientSocketId));

  setTimeout(() => { peer.setLocalDescription(); }, 200);
}

function createClientPeer(NDC, sig, roomId, sendStatus) {
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: ["stun:stun.l.google.com:19302"],
    iceTransportPolicy: "all"
  });
  state.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
  });

  peer.onDataChannel((channel) => {
    state.channel = channel;
    channel.onOpen(() => onClientChannelOpen(sendStatus));
    channel.onMessage((msg) => onChannelMessage(msg, sendStatus));
  });

  peer.onStateChange((s) => {
    if (s === "failed") sendStatus("❌ Conexión P2P falló.");
    if (s === "connected") sendStatus("Conexión establecida");
  });
}

module.exports = {
  startBridge: async (roomId, isHost, gameId, sendStatus) => {
    resetBridge();
    const game = getGame(gameId);
    if (!game) throw new Error("Juego no soportado o registrado");
    
    state.roomId = roomId;
    state.isHost = isHost;
    state.currentGame = game;
    
    if (isHost) state.hostIP = getLocalIP();
    
    const NDC = require("node-datachannel");
    sendStatus("Iniciando conexión...");

    const sig = socketClient(SIGNALING_URL, {
      transports: ["websocket"],
      reconnection: false,
    });
    state.signalingSocket = sig;

    sig.on("connect_error", () => sendStatus("Error al conectar al servidor de señales."));

    sig.on("connect", () => {
      sig.emit("webrtc-join", { roomId, isHost, hostIP: state.hostIP }, () => {
        sendStatus(isHost ? "Esperando jugadores..." : "Buscando host de la sala...");
      });
    });

    sig.on("webrtc-host-ip", ({ hostIP }) => {
      if (!isHost) state.hostIP = hostIP;
    });

    sig.on("webrtc-peer-ready", ({ fromSocketId } = {}) => {
      if (!isHost) return;
      const clientSocketId = fromSocketId || "unknown";
      if (state.clients.has(clientSocketId)) return;

      const clientPort = getNextClientPort(game);
      if (!clientPort) return console.warn("[Bridge] Sala llena.");

      state.clients.set(clientSocketId, {
        peer: null, channel: null, udpProxy: null, clientPort, pendingCandidates: [], remoteDescSet: false
      });

      createHostPeer(NDC, sig, roomId, clientSocketId, clientPort, sendStatus);
    });

    sig.on("webrtc-client-port", ({ port }) => {
      if (isHost) return;
      state.clientPort = port;
    });

    sig.on("webrtc-signal", ({ type, sdp, candidate, mid, fromSocketId }) => {
      try {
        if (isHost) {
          const client = state.clients.get(fromSocketId);
          if (!client) return;

          if (type === "answer") {
            client.peer.setRemoteDescription(sdp, "answer");
            client.remoteDescSet = true;
            flushCandidates(fromSocketId);
          } else if (type === "candidate") {
            if (client.peer && client.remoteDescSet) {
              try { client.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
            } else {
              client.pendingCandidates.push({ candidate, mid });
            }
          }
        } else {
          if (type === "offer") {
            if (!state.peer) createClientPeer(NDC, sig, roomId, sendStatus);
            state.peer.setRemoteDescription(sdp, "offer");
            state.remoteDescSet = true;
            flushCandidates();

            setTimeout(() => {
              try { state.peer.setLocalDescription(); } catch (err) {}
            }, 500);
          } else if (type === "candidate") {
            if (state.peer && state.remoteDescSet) {
              try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
            } else {
              state.pendingCandidates.push({ candidate, mid });
            }
          }
        }
      } catch (err) { console.error(err); }
    });

    sig.on("webrtc-client-left", ({ socketId: leftSocketId }) => {
      if (!isHost) return;
      const client = state.clients.get(leftSocketId);
      if (!client) return;

      try { client.channel?.close(); } catch(e) {}
      try { client.peer?.close(); } catch(e) {}
      try { client.udpProxy?.close(); } catch(e) {}
      clearInterval(keepAliveIntervals.get(leftSocketId));
      state.clients.delete(leftSocketId);

      const remaining = state.clients.size;
      sendStatus(remaining > 0 ? `${remaining} jugador(es) en sala` : "Esperando jugadores...");
    });

    console.log(`[Bridge] Tunnel running dynamically for ${game.name}`);
    return { success: true };
  },
  stopBridge: () => { resetBridge(); },
  getClientPort: () => state.clientPort,
  getHostIP: () => state.hostIP
};
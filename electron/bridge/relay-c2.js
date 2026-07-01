const { io: socketClient } = require("socket.io-client");
const os = require("os");
const dgram = require("dgram");
const { BrowserWindow } = require("electron");

const SIGNALING_URL = "https://retrolink-server.onrender.com";
const CLIENT_PORT_BASE = 8056; // ✅ Carmageddon 2 usa puertos 8056+
const MAX_CLIENTS = 8;

let state = {
  signalingSocket: null,
  roomId: null,
  isHost: false,
  iceConnectionStart: null,
  hostIP: null,
  gameProcess: null,
  gameRoomId: null,
  clients: new Map(),
  peer: null,
  channel: null,
  udpLocal: null,
  pendingCandidates: [],
  remoteDescSet: false,
  clientPort: null,
};

let keepAliveIntervals = new Map();

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

function buildIceServers() { return ICE_SERVERS; }

function sendToFrontend(channel, data) {
  try {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0] && !wins[0].webContents.isDestroyed()) {
      wins[0].webContents.send(channel, data);
    }
  } catch (e) {
    console.error(`[Bridge-C2] Error sending to frontend:`, e.message);
  }
}

function sendStatus(msg) {
  console.log(`[Bridge-C2] Status: ${msg}`);
  sendToFrontend("bridge-status-update", msg);
}

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

function getNextClientPort() {
  const usedPorts = new Set([...state.clients.values()].map(c => c.clientPort));
  for (let i = 0; i < MAX_CLIENTS; i++) {
    const port = CLIENT_PORT_BASE + i;
    if (!usedPorts.has(port)) return port;
  }
  return null;
}

function resetBridge() {
  for (const [, interval] of keepAliveIntervals) clearInterval(interval);
  keepAliveIntervals.clear();

  try {
    if (state.signalingSocket && state.roomId) {
      state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId });
    }
  } catch(e) {}

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
  state.pendingCandidates = [];
  state.remoteDescSet = false;
  state.iceConnectionStart = null;
  state.hostIP = null;
  state.clientPort = null;

  console.log("[Bridge-C2] Reset complete");
}

function createHostUDPProxy(socketId, clientPort, channel) {
  const udpProxy = dgram.createSocket("udp4");

  udpProxy.on("error", (err) => {
    console.error(`[Bridge-C2] Host proxy error (client ${socketId}):`, err.message);
  });

  udpProxy.bind(0, "127.0.0.1", () => {
    const addr = udpProxy.address();
    console.log(`[Bridge-C2] Host proxy for client ${socketId} bound on port ${addr.port} (C2 port: ${clientPort})`);
  });

  udpProxy.on("message", (msg) => {
    if (channel?.isOpen()) {
      try {
        channel.sendMessageBinary(Buffer.from(msg));
      } catch(e) {
        console.error(`[Bridge-C2] Host proxy send error (client ${socketId}):`, e.message);
      }
    }
  });

  return udpProxy;
}

function onHostChannelOpen(socketId, channel, clientPort) {
  console.log(`[Bridge-C2] Host DataChannel open for client ${socketId} on port ${clientPort}`);

  const client = state.clients.get(socketId);
  if (!client) return;

  const udpProxy = createHostUDPProxy(socketId, clientPort, channel);
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
  sendStatus(`¡${connectedCount} jugador(es) conectado(s)! Listos para jugar.`);
}

function onClientChannelOpen() {
  console.log(`[Bridge-C2] Client DataChannel open (port: ${state.clientPort})`);
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");

  state.udpLocal = dgram.createSocket("udp4");

  state.udpLocal.on("error", (err) => {
    console.error("[Bridge-C2] Client UDP error:", err.message);
    if (err.code === "EADDRINUSE") {
      sendStatus(`Puerto ${state.clientPort} ocupado. Cierra RetroLink y vuelve a abrirlo.`);
    }
  });

  state.udpLocal.bind(state.clientPort, "127.0.0.1", () => {
    console.log(`[Bridge-C2] Client UDP listening on 127.0.0.1:${state.clientPort}`);
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

function onChannelMessage(msg, socketId = null) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);

  if (buf.length <= 12 && buf.toString("latin1").includes("ping")) return;

  if (state.isHost) {
    const client = state.clients.get(socketId);
    if (!client?.udpProxy) return;
    client.udpProxy.send(buf, 0, buf.length, 8055, "127.0.0.1", (err) => {
      if (err) console.error(`[Bridge-C2] Host→C2 error:`, err.message);
    });
  } else {
    if (!state.udpLocal) return;
    state.udpLocal.send(buf, 0, buf.length, 8055, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge-C2] Client→C2 error:", err.message);
    });
  }
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

function createHostPeer(NDC, sig, roomId, clientSocketId, clientPort) {
  const peer = new NDC.PeerConnection(`RetroLink-Host-${clientSocketId}`, {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
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

  channel.onOpen(() => onHostChannelOpen(clientSocketId, channel, clientPort));
  channel.onMessage((msg) => onChannelMessage(msg, clientSocketId));

  setTimeout(() => { peer.setLocalDescription(); }, 200);
}

function createClientPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
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
    channel.onOpen(() => onClientChannelOpen());
    channel.onMessage((msg) => onChannelMessage(msg));
  });
}

async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;
  state.iceConnectionStart = Date.now();

  const NDC = require("node-datachannel");

  console.log(`[Bridge-C2] Starting — room: ${roomId}, role: ${isHost ? "HOST" : "CLIENT"}`);
  sendStatus("Conectando al servidor de señales...");

  const sig = socketClient(SIGNALING_URL, {
    transports: ["websocket"],
    reconnection: false,
  });
  state.signalingSocket = sig;

  sig.on("connect_error", (err) => {
    console.error("[Bridge-C2] Signaling error:", err.message);
    sendStatus("Error al conectar al servidor de señales.");
  });

  sig.on("connect", () => {
    console.log("[Bridge-C2] Signaling connected:", sig.id);
    sendStatus("Uniéndose a la sala...");

    if (isHost) {
      state.hostIP = getLocalIP();
      console.log(`[Bridge-C2] Host IP: ${state.hostIP}`);
    }

    sig.emit("webrtc-join", { roomId, isHost, hostIP: state.hostIP }, (response) => {
      console.log("[Bridge-C2] webrtc-join acknowledged:", response);
      sendStatus(isHost ? "Esperando jugadores..." : "Buscando rival en la sala...");
    });
  });

  sig.on("webrtc-host-ip", ({ hostIP }) => {
    if (!isHost) {
      state.hostIP = hostIP;
      console.log(`[Bridge-C2] Host IP received: ${hostIP}`);
    }
  });

  sig.on("webrtc-peer-ready", ({ fromSocketId } = {}) => {
    if (!isHost) return;
    const clientSocketId = fromSocketId || "unknown";
    if (state.clients.has(clientSocketId)) return;

    const clientPort = getNextClientPort();
    if (!clientPort) {
      console.warn("[Bridge-C2] Sala llena");
      return;
    }

    console.log(`[Bridge-C2] New client ${clientSocketId} → port ${clientPort}`);
    sendStatus(`Rival encontrado — creando conexión P2P...`);

    state.clients.set(clientSocketId, {
      peer: null,
      channel: null,
      udpProxy: null,
      clientPort,
      pendingCandidates: [],
      remoteDescSet: false,
    });

    createHostPeer(NDC, sig, roomId, clientSocketId, clientPort);
  });

  sig.on("webrtc-client-port", ({ port }) => {
    if (isHost) return;
    state.clientPort = port;
    console.log(`[Bridge-C2] Assigned client port: ${port}`);
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
          console.log(`[Bridge-C2] Host received answer from ${fromSocketId}`);
        } else if (type === "candidate") {
          if (client.peer && client.remoteDescSet) {
            try { client.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
          } else {
            client.pendingCandidates.push({ candidate, mid });
          }
        }
      } else {
        if (type === "offer") {
          if (!state.peer) createClientPeer(NDC, sig, roomId);

          console.log("[Bridge-C2] Client received offer");
          sendStatus("Procesando oferta de conexión...");
          state.peer.setRemoteDescription(sdp, "offer");
          state.remoteDescSet = true;
          flushCandidates();

          setTimeout(() => {
            try {
              state.peer.setLocalDescription();
              console.log("[Bridge-C2] Client answer sent");
            } catch (err) {
              console.error("[Bridge-C2] setLocalDescription error:", err.message);
              sendStatus("Error respondiendo conexión: " + err.message);
            }
          }, 500);

        } else if (type === "candidate") {
          if (state.peer && state.remoteDescSet) {
            try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
          } else {
            state.pendingCandidates.push({ candidate, mid });
          }
        }
      }
    } catch (err) {
      console.error("[Bridge-C2] Signal error:", err.message);
      sendStatus("Error procesando señal: " + err.message);
    }
  });

  sig.on("webrtc-client-left", ({ socketId: leftSocketId }) => {
    if (!isHost) return;
    const client = state.clients.get(leftSocketId);
    if (!client) return;

    console.log(`[Bridge-C2] Client ${leftSocketId} disconnected`);
    try { client.channel?.close(); } catch(e) {}
    try { client.peer?.close(); } catch(e) {}
    try { client.udpProxy?.close(); } catch(e) {}
    const interval = keepAliveIntervals.get(leftSocketId);
    if (interval) { clearInterval(interval); keepAliveIntervals.delete(leftSocketId); }
    state.clients.delete(leftSocketId);

    const remaining = state.clients.size;
    sendStatus(remaining > 0 ? `${remaining} jugador(es) conectado(s)` : "Esperando jugadores...");
  });

  console.log(`[Bridge-C2] Tunnel running`);
  return { success: true };
}

module.exports = {
  startBridge,
  resetBridge,
  getClientPort: () => state.clientPort,
  getHostIP: () => state.hostIP,
  getBridgeState: () => ({
    isReady: state.clients.size > 0,
    isHost: state.isHost,
    roomId: state.roomId,
    clientCount: state.clients.size,
    clientPort: state.clientPort,
    hostIP: state.hostIP,
  })
};
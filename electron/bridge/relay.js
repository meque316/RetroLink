const { io: socketClient } = require("socket.io-client");
const os = require("os");
const dgram = require("dgram");

const SIGNALING_URL = "https://retrolink-server.onrender.com";
const CLIENT_PORT_BASE = 27961;
const MAX_CLIENTS = 8;

// Estado del bridge (igual que en el monolítico)
let state = {
  signalingSocket: null,
  roomId: null,
  isHost: false,
  hostIP: null,
  clients: new Map(),
  peer: null,
  channel: null,
  udpLocal: null,
  clientPort: null,
  pendingCandidates: [],
  remoteDescSet: false,
  gameProcess: null,
  gameRoomId: null
};

let keepAliveIntervals = new Map();

const ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",
];

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
  state.pendingCandidates = [];
  state.remoteDescSet = false;
  state.hostIP = null;
  state.clientPort = null;
  state.gameProcess = null;
  state.gameRoomId = null;

  console.log("[Bridge] Reset complete");
}

// ✅ FUNCIONES DE PROXY (igual que en el monolítico)
function createHostUDPProxy(socketId, clientPort, channel) {
  const udpProxy = dgram.createSocket("udp4");

  udpProxy.on("error", (err) => {
    console.error(`[Bridge] Host proxy error (client ${socketId}):`, err.message);
  });

  udpProxy.bind(0, "127.0.0.1", () => {
    const addr = udpProxy.address();
    console.log(`[Bridge] Host proxy for client ${socketId} bound on port ${addr.port} (Q3 port: ${clientPort})`);
  });

  udpProxy.on("message", (msg) => {
    if (channel?.isOpen()) {
      try { channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
    }
  });

  return udpProxy;
}

function onHostChannelOpen(socketId, channel, clientPort) {
  console.log(`[Bridge] Host DataChannel open for client ${socketId} on port ${clientPort}`);
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
}

function onClientChannelOpen() {
  console.log(`[Bridge] Client DataChannel open (port: ${state.clientPort})`);
  
  state.udpLocal = dgram.createSocket("udp4");

  state.udpLocal.on("error", (err) => {
    console.error("[Bridge] Client UDP error:", err.message);
  });

  state.udpLocal.bind(state.clientPort || CLIENT_PORT_BASE, "127.0.0.1", () => {
    console.log(`[Bridge] Client UDP listening on 127.0.0.1:${state.clientPort || CLIENT_PORT_BASE}`);
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
    client.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error(`[Bridge] Host→Q3 error:`, err.message);
    });
  } else {
    if (!state.udpLocal) return;
    state.udpLocal.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Client→Q3 error:", err.message);
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
    iceServers: ICE_SERVERS,
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
    iceServers: ICE_SERVERS,
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

// ✅ FUNCIÓN PRINCIPAL startBridge (sin gameId)
async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;

  const NDC = require("node-datachannel");

  console.log(`[Bridge] Starting — room: ${roomId}, role: ${isHost ? "HOST" : "CLIENT"}`);

  const sig = socketClient(SIGNALING_URL, {
    transports: ["websocket"],
    reconnection: false,
  });
  state.signalingSocket = sig;

  sig.on("connect_error", (err) => {
    console.error("[Bridge] Signaling error:", err.message);
  });

  sig.on("connect", () => {
    console.log("[Bridge] Signaling connected:", sig.id);

    if (isHost) {
      state.hostIP = getLocalIP();
      console.log(`[Bridge] Host IP: ${state.hostIP}`);
    }

    sig.emit("webrtc-join", { roomId, isHost, hostIP: state.hostIP });
  });

  sig.on("webrtc-host-ip", ({ hostIP }) => {
    if (!isHost) {
      state.hostIP = hostIP;
      console.log(`[Bridge] Host IP received: ${hostIP}`);
    }
  });

  sig.on("webrtc-peer-ready", ({ fromSocketId } = {}) => {
    if (!isHost) return;
    const clientSocketId = fromSocketId || "unknown";
    if (state.clients.has(clientSocketId)) return;

    const clientPort = getNextClientPort();
    if (!clientPort) {
      console.warn("[Bridge] Sala llena");
      return;
    }

    console.log(`[Bridge] New client ${clientSocketId} → port ${clientPort}`);

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
    console.log(`[Bridge] Assigned client port: ${port}`);
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
          if (!state.peer) createClientPeer(NDC, sig, roomId);
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
    } catch (err) {
      console.error("[Bridge] Signal error:", err.message);
    }
  });

  sig.on("webrtc-client-left", ({ socketId: leftSocketId }) => {
    if (!isHost) return;
    const client = state.clients.get(leftSocketId);
    if (!client) return;

    try { client.channel?.close(); } catch(e) {}
    try { client.peer?.close(); } catch(e) {}
    try { client.udpProxy?.close(); } catch(e) {}
    const interval = keepAliveIntervals.get(leftSocketId);
    if (interval) { clearInterval(interval); keepAliveIntervals.delete(leftSocketId); }
    state.clients.delete(leftSocketId);
  });

  console.log(`[Bridge] Tunnel running`);
  return { success: true };
}

module.exports = {
  startBridge,
  resetBridge,
  getClientPort: () => state.clientPort,
  getHostIP: () => state.hostIP
};
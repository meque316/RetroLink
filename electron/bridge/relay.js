const { io: socketClient } = require("socket.io-client");
const os = require("os");
const dgram = require("dgram");
const { BrowserWindow } = require("electron");

const SIGNALING_URL = "https://retrolink-server.onrender.com";
const CLIENT_PORT_BASE = 27961;
const MAX_CLIENTS = 8;

// Tiempo máximo esperando que un peer llegue a "connected" antes de reportar
// timeout y limpiar. Antes no existía ningún watchdog: si STUN/TURN no eran
// alcanzables, la conexión podía quedar "esperando" indefinidamente sin que
// el usuario o los logs se enteraran de nada.
const ICE_CONNECT_TIMEOUT_MS = 20000;

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
  iceConnectionState: null,
  iceTimeoutHandle: null,
  gatheredCandidateTypes: new Set(),
};

let keepAliveIntervals = new Map();

// ✅ ICE_SERVERS CORREGIDOS - Formato real de node-datachannel
//
// FIX CRÍTICO: node-datachannel NO usa el formato RTCConfiguration del
// navegador ({ urls, username, credential }). Su tipo real es
// `iceServers: (string | IceServer)[]`, donde IceServer usa las claves
// `hostname` / `port` / `username` / `password` (no `urls` / `credential`).
// La forma más simple y la que usa la documentación oficial es directamente
// un string: "stun:host:port" o "turn:USERNAME:PASSWORD@HOST:PORT".
//
// El objeto { urls, username, credential } que había antes no matchea
// ninguno de los dos formatos válidos: el binding nativo lo descarta en
// silencio (sin excepción JS visible), por lo que STUN/TURN nunca se
// registraban de verdad. Esto explica por qué nunca se reunían candidatos
// srflx/relay y el ICE se quedaba en "checking" indefinidamente.
const ICE_SERVERS = [
  // STUN servers
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",
  "stun:stun.services.mozilla.com",

  // TURN servers - SOLO openrelay (funciona con node-datachannel)
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:80",
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:443",
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:5349",
];

function buildIceServers() { return ICE_SERVERS; }

function sendToFrontend(channel, data) {
  try {
    const wins = BrowserWindow.getAllWindows();
    if (wins[0] && !wins[0].webContents.isDestroyed()) {
      wins[0].webContents.send(channel, data);
    }
  } catch (e) {
    console.error(`[Bridge] Error sending to frontend:`, e.message);
  }
}

function sendStatus(msg) {
  console.log(`[Bridge] Status: ${msg}`);
  sendToFrontend("bridge-status-update", msg);
}

// NUEVO: extrae el tipo de candidato ICE (host / srflx / relay) de la línea
// SDP para poder diagnosticar si STUN/TURN están respondiendo realmente.
// Esto es clave para el caso "se queda esperando indefinidamente": si nunca
// aparece "srflx" ni "relay" en los logs, es NAT/firewall bloqueando UDP
// saliente hacia STUN/TURN, no un bug de señalización.
function getCandidateType(candidateStr) {
  if (typeof candidateStr !== "string") return "unknown";
  const match = candidateStr.match(/\styp\s+(\w+)/);
  return match ? match[1] : "unknown";
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

function cleanupClient(socketId) {
  const client = state.clients.get(socketId);
  if (!client) return;

  // FIX (memory leak): el watchdog de ICE debe limpiarse siempre que se
  // destruye un cliente, o el timer queda vivo referenciando un peer/canal
  // ya cerrado y dispara un timeout falso más tarde.
  if (client.iceTimeoutHandle) {
    clearTimeout(client.iceTimeoutHandle);
    client.iceTimeoutHandle = null;
  }

  try { client.channel?.close(); } catch (e) {}
  try { client.peer?.close(); } catch (e) {}
  try { client.udpProxy?.close(); } catch (e) {}

  const interval = keepAliveIntervals.get(socketId);
  if (interval) {
    clearInterval(interval);
    keepAliveIntervals.delete(socketId);
  }

  state.clients.delete(socketId);
}

function resetBridge() {
  for (const [, interval] of keepAliveIntervals) clearInterval(interval);
  keepAliveIntervals.clear();

  if (state.iceTimeoutHandle) {
    clearTimeout(state.iceTimeoutHandle);
    state.iceTimeoutHandle = null;
  }

  try {
    if (state.signalingSocket && state.roomId) {
      state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId });
    }
  } catch (e) {}

  for (const [socketId] of state.clients) {
    cleanupClient(socketId);
  }
  state.clients.clear();

  try { state.channel?.close(); } catch (e) {}
  try { state.peer?.close(); } catch (e) {}
  try { state.signalingSocket?.disconnect(); } catch (e) {}
  try { state.udpLocal?.close(); } catch (e) {}

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
  state.iceConnectionState = null;
  state.gatheredCandidateTypes = new Set();

  console.log("[Bridge] Reset complete");
}

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
      try {
        channel.sendMessageBinary(Buffer.from(msg));
      } catch (e) {
        console.error(`[Bridge] Host proxy send error (client ${socketId}):`, e.message);
      }
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
      try {
        channel.sendMessageBinary(Buffer.from("\xFF\xFF\xFF\xFFping"));
      } catch (e) {
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
  console.log(`[Bridge] Client DataChannel open (port: ${state.clientPort})`);
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");

  state.udpLocal = dgram.createSocket("udp4");

  state.udpLocal.on("error", (err) => {
    console.error("[Bridge] Client UDP error:", err.message);
    if (err.code === "EADDRINUSE") {
      sendStatus(`Puerto ${state.clientPort} ocupado. Cierra RetroLink y vuelve a abrirlo.`);
    }
  });

  state.udpLocal.bind(state.clientPort, "127.0.0.1", () => {
    console.log(`[Bridge] Client UDP listening on 127.0.0.1:${state.clientPort}`);
  });

  state.udpLocal.on("message", (msg) => {
    if (state.channel?.isOpen()) {
      try { state.channel.sendMessageBinary(Buffer.from(msg)); } catch (e) {}
    }
  });

  const interval = setInterval(() => {
    if (state.channel?.isOpen()) {
      try {
        state.channel.sendMessageBinary(Buffer.from("\xFF\xFF\xFF\xFFping"));
      } catch (e) {
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

// FIX CRÍTICO: antes, si addRemoteCandidate() lanzaba una excepción, el
// candidato se logueaba y se perdía para siempre (el array se vaciaba
// igual). Si ese candidato era justo el único candidato "relay" (TURN)
// viable para atravesar el NAT, el ICE se quedaba en "checking" para
// siempre sin ningún error visible — exactamente el síntoma reportado
// ("Procesando oferta de conexión..." colgado). Ahora los candidatos que
// fallan se re-encolan y se reintentan en el siguiente flush.
function flushCandidates(socketId = null) {
  if (state.isHost) {
    const client = state.clients.get(socketId);
    if (!client?.peer || !client.remoteDescSet) return;
    const stillPending = [];
    client.pendingCandidates.forEach(({ candidate, mid }) => {
      try {
        client.peer.addRemoteCandidate(candidate, mid);
      } catch (e) {
        console.warn(`[Bridge] No se pudo aplicar candidato ICE pendiente (host, cliente ${socketId}), se reintentará:`, e.message || e);
        stillPending.push({ candidate, mid });
      }
    });
    client.pendingCandidates = stillPending;
  } else {
    if (!state.peer || !state.remoteDescSet) return;
    const stillPending = [];
    state.pendingCandidates.forEach(({ candidate, mid }) => {
      try {
        state.peer.addRemoteCandidate(candidate, mid);
      } catch (e) {
        console.warn("[Bridge] No se pudo aplicar candidato ICE pendiente (cliente), se reintentará:", e.message || e);
        stillPending.push({ candidate, mid });
      }
    });
    state.pendingCandidates = stillPending;
  }
}

function createHostPeer(NDC, sig, roomId, clientSocketId, clientPort) {
  const peer = new NDC.PeerConnection(`RetroLink-Host-${clientSocketId}`, {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });

  const client = state.clients.get(clientSocketId);
  client.peer = peer;

  // NUEVO: watchdog de ICE. Si en ICE_CONNECT_TIMEOUT_MS no llegamos a
  // "connected", reportamos el problema con diagnóstico (estado actual +
  // qué tipos de candidato local se reunieron) y limpiamos, en vez de
  // dejar la UI colgada indefinidamente en "Enviando oferta..." / esperando.
  client.iceTimeoutHandle = setTimeout(() => {
    if (client.iceConnectionState === "connected" || client.iceConnectionState === "completed") return;
    const gathered = client.gatheredCandidateTypes && client.gatheredCandidateTypes.size
      ? [...client.gatheredCandidateTypes].join(", ")
      : "ninguno";
    console.error(
      `[Bridge] ⏱️ Timeout de ICE esperando al cliente ${clientSocketId} tras ${ICE_CONNECT_TIMEOUT_MS / 1000}s. ` +
      `Estado actual: ${client.iceConnectionState || "desconocido"}. Tipos de candidato local reunidos: ${gathered}.`
    );
    sendStatus("❌ Tiempo de espera agotado buscando conexión P2P con el rival. Puede ser un bloqueo de NAT/firewall o STUN/TURN inalcanzable.");
    cleanupClient(clientSocketId);
  }, ICE_CONNECT_TIMEOUT_MS);

  // FIX: parámetro renombrado de "state" a "connState". Antes tapaba
  // (shadowing) el objeto global "state" del módulo, haciendo que
  // "state.iceConnectionState = state" intentara asignarle una propiedad
  // a un string primitivo (ej. "connected") en vez de al objeto real.
  peer.onStateChange((connState) => {
    console.log(`[Bridge] Host peer state (${clientSocketId}):`, connState);
    state.iceConnectionState = connState;
    if (client) client.iceConnectionState = connState;

    if (connState === "connected" || connState === "completed") {
      if (client.iceTimeoutHandle) {
        clearTimeout(client.iceTimeoutHandle);
        client.iceTimeoutHandle = null;
      }
      sendStatus(`✅ Conexión P2P establecida con cliente`);
    } else if (connState === "failed") {
      if (client.iceTimeoutHandle) {
        clearTimeout(client.iceTimeoutHandle);
        client.iceTimeoutHandle = null;
      }
      console.error(`[Bridge] ICE failed for client ${clientSocketId}`);
      sendStatus(`❌ Falló conexión P2P con cliente`);
    } else if (connState === "disconnected") {
      sendStatus(`⚠️ Conexión P2P perdida`);
    }
  });

  peer.onGatheringStateChange((gatherState) => {
    console.log(`[Bridge] Host gathering (${clientSocketId}):`, gatherState);
    // NUEVO: diagnóstico de NAT/STUN/TURN. Si al completar el gathering
    // nunca se reunió un candidato srflx o relay, es una señal fuerte de
    // que el tráfico UDP saliente hacia STUN/TURN está bloqueado.
    if (gatherState === "complete") {
      const types = client.gatheredCandidateTypes && client.gatheredCandidateTypes.size
        ? [...client.gatheredCandidateTypes].join(", ")
        : "ninguno";
      console.log(`[Bridge] Host: gathering completo para ${clientSocketId}. Tipos de candidato reunidos: ${types}.`);
      if (!client.gatheredCandidateTypes?.has("relay") && !client.gatheredCandidateTypes?.has("srflx")) {
        console.warn(`[Bridge] ⚠️ No se reunió ningún candidato srflx/relay para ${clientSocketId}. Verificá conectividad UDP saliente hacia STUN/TURN (posible firewall bloqueando UDP).`);
      }
    }
  });

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Host offer ready for ${clientSocketId}, type: ${type}`);
    sig.emit("webrtc-signal", { roomId, type, sdp, toSocketId: clientSocketId });
    sig.emit("webrtc-client-port", { roomId, port: clientPort, toSocketId: clientSocketId });
  });

  peer.onLocalCandidate((candidate, mid) => {
    const candType = getCandidateType(candidate);
    client.gatheredCandidateTypes?.add(candType);
    console.log(`[Bridge] Host candidate for ${clientSocketId} [${candType}]:`, candidate);
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid, toSocketId: clientSocketId });
  });

  const channel = peer.createDataChannel("game", { ordered: true });
  client.channel = channel;

  channel.onOpen(() => {
    console.log(`[Bridge] channel.onOpen for ${clientSocketId}`);
    onHostChannelOpen(clientSocketId, channel, clientPort);
  });

  channel.onClosed(() => {
    console.log(`[Bridge] DataChannel closed for ${clientSocketId}`);
    // FIX: antes esto no limpiaba nada. Si el canal se caía sin que el socket
    // de señalización se desconectara, el cliente quedaba "fantasma" en el Map,
    // con su intervalo de keepalive y proxy UDP colgados.
    cleanupClient(clientSocketId);
    const remaining = state.clients.size;
    sendStatus(remaining > 0 ? `${remaining} jugador(es) conectado(s)` : "Esperando jugadores...");
  });

  channel.onMessage((msg) => {
    onChannelMessage(msg, clientSocketId);
  });

  channel.onError((e) => {
    console.error(`[Bridge] DataChannel error (${clientSocketId}):`, e);
  });

  setTimeout(() => {
    console.log(`[Bridge] Host creating offer for ${clientSocketId}...`);
    sendStatus(`Enviando oferta de conexión al rival...`);
    // FIX: antes esta llamada no tenía try/catch (el lado cliente sí lo
    // tenía para su setLocalDescription() de la respuesta). Si esto
    // lanzaba una excepción acá, quedaba sin manejar y sin ningún status
    // para el usuario — otra vía posible hacia el "queda esperando
    // indefinidamente".
    try {
      peer.setLocalDescription();
    } catch (err) {
      console.error(`[Bridge] Error creando oferta para ${clientSocketId}:`, err.message);
      sendStatus(`❌ Error creando oferta de conexión: ${err.message}`);
      cleanupClient(clientSocketId);
    }
  }, 200);
}

function createClientPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });
  state.peer = peer;

  // NUEVO: mismo watchdog de ICE que en el host, para el lado cliente.
  state.iceTimeoutHandle = setTimeout(() => {
    if (state.iceConnectionState === "connected" || state.iceConnectionState === "completed") return;
    const gathered = state.gatheredCandidateTypes && state.gatheredCandidateTypes.size
      ? [...state.gatheredCandidateTypes].join(", ")
      : "ninguno";
    console.error(
      `[Bridge] ⏱️ Timeout de ICE en el cliente tras ${ICE_CONNECT_TIMEOUT_MS / 1000}s. ` +
      `Estado actual: ${state.iceConnectionState || "desconocido"}. Tipos de candidato local reunidos: ${gathered}.`
    );
    sendStatus("❌ Tiempo de espera agotado estableciendo conexión P2P con el host. Puede ser un bloqueo de NAT/firewall o STUN/TURN inalcanzable.");
    try { state.channel?.close(); } catch (e) {}
    try { state.peer?.close(); } catch (e) {}
    state.peer = null;
    state.channel = null;
    state.remoteDescSet = false;
    state.pendingCandidates = [];
  }, ICE_CONNECT_TIMEOUT_MS);

  // Mismo fix que en createHostPeer: parámetro renombrado para no tapar
  // el objeto "state" global.
  peer.onStateChange((connState) => {
    console.log("[Bridge] Client peer state:", connState);
    state.iceConnectionState = connState;

    if (connState === "connected" || connState === "completed") {
      if (state.iceTimeoutHandle) {
        clearTimeout(state.iceTimeoutHandle);
        state.iceTimeoutHandle = null;
      }
      sendStatus("✅ Conexión P2P establecida!");
    } else if (connState === "failed") {
      if (state.iceTimeoutHandle) {
        clearTimeout(state.iceTimeoutHandle);
        state.iceTimeoutHandle = null;
      }
      console.error("[Bridge] ICE failed for client");
      sendStatus("❌ Falló conexión P2P");
    }
  });

  peer.onGatheringStateChange((gatherState) => {
    console.log("[Bridge] Client gathering:", gatherState);
    if (gatherState === "complete") {
      const types = state.gatheredCandidateTypes && state.gatheredCandidateTypes.size
        ? [...state.gatheredCandidateTypes].join(", ")
        : "ninguno";
      console.log(`[Bridge] Cliente: gathering completo. Tipos de candidato reunidos: ${types}.`);
      if (!state.gatheredCandidateTypes?.has("relay") && !state.gatheredCandidateTypes?.has("srflx")) {
        console.warn("[Bridge] ⚠️ No se reunió ningún candidato srflx/relay en el cliente. Verificá conectividad UDP saliente hacia STUN/TURN (posible firewall bloqueando UDP).");
      }
    }
  });

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Client local description ready (${type})`);
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
    const candType = getCandidateType(candidate);
    state.gatheredCandidateTypes.add(candType);
    console.log(`[Bridge] Client candidate [${candType}]:`, candidate);
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
  });

  peer.onDataChannel((channel) => {
    console.log("[Bridge] Client received DataChannel");
    state.channel = channel;

    channel.onOpen(() => {
      console.log("[Bridge] channel.onOpen fired");
      onClientChannelOpen();
    });

    channel.onClosed(() => {
      console.log("[Bridge] DataChannel closed");
      sendStatus("Conexión P2P cerrada.");
      const interval = keepAliveIntervals.get("self");
      if (interval) { clearInterval(interval); keepAliveIntervals.delete("self"); }
    });

    channel.onMessage((msg) => {
      onChannelMessage(msg);
    });

    channel.onError((e) => {
      console.error("[Bridge] DataChannel error:", e);
    });
  });
}

async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;
  state.iceConnectionStart = Date.now();

  const NDC = require("node-datachannel");

  // Diagnóstico opcional: si necesitás ver el detalle interno de
  // libdatachannel (negociación SDP, ICE checks candidato por candidato),
  // descomentá la siguiente línea. Se deja apagado por defecto para no
  // saturar la consola en uso normal.
  // NDC.initLogger("Debug");

  console.log(`[Bridge] Starting — room: ${roomId}, role: ${isHost ? "HOST" : "CLIENT"}`);
  sendStatus("Conectando al servidor de señales...");

  const sig = socketClient(SIGNALING_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
  });
  state.signalingSocket = sig;

  sig.on("connect_error", (err) => {
    console.error("[Bridge] Signaling error:", err.message);
    sendStatus("Error al conectar al servidor de señales.");
  });

  sig.on("connect", () => {
    console.log("[Bridge] Signaling connected:", sig.id);
    sendStatus("Uniéndose a la sala...");

    if (isHost) {
      state.hostIP = getLocalIP();
      console.log(`[Bridge] Host IP: ${state.hostIP}`);
    }

    sig.emit("webrtc-join", { roomId, isHost, hostIP: state.hostIP }, (response) => {
      console.log("[Bridge] webrtc-join acknowledged:", response);
      sendStatus(isHost ? "Esperando jugadores..." : "Buscando rival en la sala...");
    });
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
    sendStatus(`Rival encontrado — creando conexión P2P...`);

    state.clients.set(clientSocketId, {
      peer: null,
      channel: null,
      udpProxy: null,
      clientPort,
      pendingCandidates: [],
      remoteDescSet: false,
      iceConnectionState: null,
      iceTimeoutHandle: null,
      gatheredCandidateTypes: new Set(),
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
          console.log(`[Bridge] Host received answer from ${fromSocketId}`);
          client.peer.setRemoteDescription(sdp, "answer");
          client.remoteDescSet = true;
          flushCandidates(fromSocketId);
        } else if (type === "candidate") {
          // FIX: antes, si remoteDescSet ya era true y addRemoteCandidate()
          // fallaba, el candidato se perdía para siempre (solo un
          // console.warn). Ahora siempre pasa por la cola + flushCandidates,
          // que reintenta automáticamente y nunca descarta un candidato en
          // silencio.
          client.pendingCandidates.push({ candidate, mid });
          flushCandidates(fromSocketId);
        }
      } else {
        if (type === "offer") {
          if (!state.peer) createClientPeer(NDC, sig, roomId);

          console.log("[Bridge] Client received offer");
          sendStatus("Procesando oferta de conexión...");
          state.peer.setRemoteDescription(sdp, "offer");
          state.remoteDescSet = true;
          flushCandidates();

          setTimeout(() => {
            try {
              state.peer.setLocalDescription();
              console.log("[Bridge] Client answer sent");
            } catch (err) {
              console.error("[Bridge] setLocalDescription error:", err.message);
              sendStatus("Error respondiendo conexión: " + err.message);
            }
          }, 500);

        } else if (type === "candidate") {
          // Mismo fix que en la rama host: encolar y reintentar vía
          // flushCandidates en vez de arriesgarse a perder el candidato.
          state.pendingCandidates.push({ candidate, mid });
          flushCandidates();
        }
      }
    } catch (err) {
      console.error("[Bridge] Signal error:", err.message);
      sendStatus("Error procesando señal: " + err.message);
    }
  });

  sig.on("webrtc-client-left", ({ socketId: leftSocketId }) => {
    if (!isHost) return;
    if (!state.clients.has(leftSocketId)) return;

    console.log(`[Bridge] Client ${leftSocketId} disconnected`);
    cleanupClient(leftSocketId);

    const remaining = state.clients.size;
    sendStatus(remaining > 0 ? `${remaining} jugador(es) conectado(s)` : "Esperando jugadores...");
  });

  console.log(`[Bridge] Tunnel running`);
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
    iceConnectionState: state.iceConnectionState,
    // NUEVO: estado por-cliente (útil para depurar el caso de múltiples
    // clientes en el host, donde antes un solo campo global se pisaba
    // entre clientes).
    clients: [...state.clients.entries()].map(([socketId, c]) => ({
      socketId,
      iceConnectionState: c.iceConnectionState,
      connected: !!c.udpProxy,
    })),
  })
};

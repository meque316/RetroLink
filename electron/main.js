const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} = require("electron");

const path = require("path");
const fs = require("fs");
const { exec, execFile } = require("child_process");
const dgram = require("dgram");
const natUpnp = require("nat-upnp");
const { io: socketClient } = require("socket.io-client");
const os = require("os");

const isDev = !app.isPackaged;

// Puerto base para clientes — cada cliente recibe un puerto distinto
// Cliente 1: 27961, Cliente 2: 27962, Cliente 3: 27963, etc.
const CLIENT_PORT_BASE = 27961;
const MAX_CLIENTS = 8;

/*
FILE LOGGING
*/
const setupLogging = () => {
  const logPath = path.join(app.getPath("userData"), "retrolink.log");
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const write = (lvl, args) => {
    try { fs.appendFileSync(logPath, `[${new Date().toISOString()}][${lvl}] ${args.join(" ")}\n`); } catch(e) {}
  };
  console.log   = (...a) => { orig.log(...a);   write("LOG",  a); };
  console.error = (...a) => { orig.error(...a); write("ERR",  a); };
  console.warn  = (...a) => { orig.warn(...a);  write("WARN", a); };
  try { fs.appendFileSync(logPath, `\n=== RetroLink session started ${new Date().toISOString()} ===\n`); } catch(e) {}
  console.log("[Log] File:", logPath);
};

/*
UI STATUS
*/
const sendStatus = (msg) => {
  const wins = BrowserWindow.getAllWindows();
  if (wins[0]) wins[0].webContents.send("bridge-status-update", msg);
};

/*
FIREWALL
*/
const allowFirewall = (programPath, ruleName) => {
  if (!programPath) return;
  exec(`netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow program="${programPath}" enable=yes`,
    (err) => console.log(err ? `[FW] Already exists: ${ruleName}` : `[FW] Allowed: ${ruleName}`)
  );
};

/*
PORT CHECK
*/
const checkPort = (port) => new Promise((resolve) => {
  const s = dgram.createSocket("udp4");
  s.bind(port, () => { s.close(); resolve(true); });
  s.on("error", () => resolve(false));
});

/*
UPNP
*/
const openUPnP = (port) => new Promise((resolve) => {
  const c = natUpnp.createClient();
  c.portMapping({ public: port, private: port, protocol: "UDP", description: "RetroLink", ttl: 0 }, (err) => {
    c.close();
    resolve({ success: !err });
    if (!err) console.log(`[UPnP] Port ${port} opened`);
  });
});

const closeUPnP = (port) => new Promise((resolve) => {
  const c = natUpnp.createClient();
  c.portUnmapping({ public: port, protocol: "UDP" }, () => { c.close(); resolve(); });
});

/*
GET LOCAL IP
*/
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
  if (vpnIP) { console.log(`[Network] VPN IP: ${vpnIP.address}`); return vpnIP.address; }
  const lanIP = results.find(ip => ip.address.startsWith('192.168.'));
  if (lanIP) { console.log(`[Network] LAN IP: ${lanIP.address}`); return lanIP.address; }
  if (results.length > 0) { console.log(`[Network] IP: ${results[0].address}`); return results[0].address; }
  return '127.0.0.1';
}

/*
================================================================
WebRTC P2P BRIDGE — MULTI-PLAYER
================================================================

ARQUITECTURA:
- HOST: mantiene un mapa de clientes (peers), cada uno con su propio
  DataChannel y udpProxy en un puerto distinto. Quake3 del host ve
  múltiples conexiones entrando como si fueran jugadores LAN distintos.

- CLIENTE: igual que antes — escucha en su puerto asignado (27961+N)
  y reenvía por DataChannel al host.

Flujo multi-jugador:
  Cliente1 (puerto 27961) ──DataChannel1──┐
  Cliente2 (puerto 27962) ──DataChannel2──┤── HOST Q3:27960
  Cliente3 (puerto 27963) ──DataChannel3──┘
*/

let state = {
  signalingSocket: null,
  roomId: null,
  isHost: false,
  iceConnectionStart: null,
  hostIP: null,
  gameProcess: null,
  gameRoomId: null,

  // HOST: mapa de clientes { socketId -> { peer, channel, udpProxy, clientPort, pendingCandidates, remoteDescSet } }
  clients: new Map(),

  // CLIENTE: conexión única al host
  peer: null,
  channel: null,
  udpLocal: null,
  pendingCandidates: [],
  remoteDescSet: false,
  clientPort: null, // puerto asignado por el host (27961, 27962, etc.)
};

let keepAliveIntervals = new Map(); // socketId -> interval (host) o "self" -> interval (cliente)

function getNextClientPort() {
  const usedPorts = new Set([...state.clients.values()].map(c => c.clientPort));
  for (let i = 0; i < MAX_CLIENTS; i++) {
    const port = CLIENT_PORT_BASE + i;
    if (!usedPorts.has(port)) return port;
  }
  return null; // sala llena
}

function resetBridge() {
  // Limpiar todos los keep-alive
  for (const [, interval] of keepAliveIntervals) {
    clearInterval(interval);
  }
  keepAliveIntervals.clear();

  try {
    if (state.signalingSocket && state.roomId) {
      state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId });
    }
  } catch(e) {}

  // Limpiar clientes del host
  for (const [socketId, client] of state.clients) {
    try { client.channel?.close(); } catch(e) {}
    try { client.peer?.close(); } catch(e) {}
    try { client.udpProxy?.close(); } catch(e) {}
  }
  state.clients.clear();

  // Limpiar estado del cliente
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

  console.log("[Bridge] Reset complete");
}

/*
HOST: crear proxy UDP para un cliente específico
Cada cliente tiene su propio socket UDP que escucha en un puerto distinto.
Los paquetes que lleguen de Quake3 host por ese socket se reenvían al cliente
correspondiente por su DataChannel.
*/
function createHostUDPProxy(socketId, clientPort, channel) {
  const udpProxy = dgram.createSocket("udp4");

  udpProxy.on("error", (err) => {
    console.error(`[Bridge] Host proxy error (client ${socketId}):`, err.message);
  });

  // Puerto random — el proxy envía a Q3:27960 y recibe respuestas
  udpProxy.bind(0, "127.0.0.1", () => {
    const addr = udpProxy.address();
    console.log(`[Bridge] Host proxy for client ${socketId} bound on port ${addr.port} (Q3 port: ${clientPort})`);
  });

  // Quake3 host → DataChannel → cliente
  udpProxy.on("message", (msg, rinfo) => {
    if (channel?.isOpen()) {
      try {
        channel.sendMessageBinary(Buffer.from(msg));
      } catch(e) {
        console.error(`[Bridge] Host proxy send error (client ${socketId}):`, e.message);
      }
    }
  });

  return udpProxy;
}

/*
HOST: manejar apertura de DataChannel con un cliente nuevo
*/
function onHostChannelOpen(socketId, channel, clientPort) {
  console.log(`[Bridge] Host DataChannel open for client ${socketId} on port ${clientPort}`);

  const client = state.clients.get(socketId);
  if (!client) return;

  // Crear proxy UDP para este cliente
  const udpProxy = createHostUDPProxy(socketId, clientPort, channel);
  client.udpProxy = udpProxy;

  // Keep-alive para este cliente
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

  // Actualizar status con conteo de conexiones
  const connectedCount = [...state.clients.values()].filter(c => c.udpProxy).length;
  sendStatus(`¡${connectedCount} jugador(es) conectado(s)! Listos para jugar.`);
}

/*
CLIENTE: manejar apertura de DataChannel con el host
*/
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

  // Quake3 cliente → DataChannel → host
  state.udpLocal.on("message", (msg) => {
    if (state.channel?.isOpen()) {
      try { state.channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
    }
  });

  // Keep-alive
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

/*
Procesar mensaje recibido por DataChannel
*/
function onChannelMessage(msg, socketId = null) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);

  // Ignorar pings de keep-alive
  if (buf.length <= 12 && buf.toString("latin1").includes("ping")) return;

  if (state.isHost) {
    // HOST: reenviar paquete del cliente a Quake3 local
    const client = state.clients.get(socketId);
    if (!client?.udpProxy) return;
    client.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error(`[Bridge] Host→Q3 error (${socketId}):`, err.message);
    });
  } else {
    // CLIENTE: reinyectar respuesta del host a Quake3 local
    // Q3 escucha en 27960 sin importar el puerto de conexión (+connect usa 27961+N)
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

async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;
  state.iceConnectionStart = Date.now();

  const NDC = require("node-datachannel");

  console.log(`[Bridge] Starting — room: ${roomId}, role: ${isHost ? "HOST" : "CLIENT"}`);
  sendStatus("Conectando al servidor de señales...");

  const sig = socketClient(SIGNALING_URL, {
    transports: ["websocket"],
    reconnection: false,
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

  // HOST: nuevo cliente listo — crear peer para ese cliente específico
  sig.on("webrtc-peer-ready", ({ fromSocketId } = {}) => {
    if (!isHost) return;
    const clientSocketId = fromSocketId || "unknown";
    if (state.clients.has(clientSocketId)) return; // ya existe

    const clientPort = getNextClientPort();
    if (!clientPort) {
      console.warn("[Bridge] Sala llena — no se pueden agregar más clientes");
      return;
    }

    console.log(`[Bridge] New client ${clientSocketId} → port ${clientPort}`);
    sendStatus(`Rival encontrado — creando conexión P2P...`);

    // Registrar cliente
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

  // CLIENTE: recibir puerto asignado por el host
  sig.on("webrtc-client-port", ({ port }) => {
    if (isHost) return;
    state.clientPort = port;
    console.log(`[Bridge] Assigned client port: ${port}`);
  });

  sig.on("webrtc-signal", ({ type, sdp, candidate, mid, fromSocketId, toSocketId }) => {
    try {
      if (isHost) {
        // HOST: procesar señales de un cliente específico
        const clientSocketId = fromSocketId;
        const client = state.clients.get(clientSocketId);
        if (!client) return;

        if (type === "answer") {
          client.peer.setRemoteDescription(sdp, "answer");
          client.remoteDescSet = true;
          flushCandidates(clientSocketId);
          console.log(`[Bridge] Host received answer from ${clientSocketId}`);
        } else if (type === "candidate") {
          if (client.peer && client.remoteDescSet) {
            try { client.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
          } else {
            client.pendingCandidates.push({ candidate, mid });
          }
        }
      } else {
        // CLIENTE: procesar señales del host
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
          if (state.peer && state.remoteDescSet) {
            try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
          } else {
            state.pendingCandidates.push({ candidate, mid });
          }
        }
      }
    } catch (err) {
      console.error("[Bridge] Signal error:", err.message);
      sendStatus("Error procesando señal: " + err.message);
    }
  });

  // HOST: cliente desconectado — limpiar su peer y proxy
  sig.on("webrtc-client-left", ({ socketId: leftSocketId }) => {
    if (!isHost) return;
    const client = state.clients.get(leftSocketId);
    if (!client) return;

    console.log(`[Bridge] Client ${leftSocketId} disconnected`);
    try { client.channel?.close(); } catch(e) {}
    try { client.peer?.close(); } catch(e) {}
    try { client.udpProxy?.close(); } catch(e) {}
    const interval = keepAliveIntervals.get(leftSocketId);
    if (interval) { clearInterval(interval); keepAliveIntervals.delete(leftSocketId); }
    state.clients.delete(leftSocketId);

    const remaining = state.clients.size;
    sendStatus(remaining > 0 ? `${remaining} jugador(es) conectado(s)` : "Esperando jugadores...");
  });
}

function createHostPeer(NDC, sig, roomId, clientSocketId, clientPort) {
  const peer = new NDC.PeerConnection(`RetroLink-Host-${clientSocketId}`, {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });

  const client = state.clients.get(clientSocketId);
  client.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Host offer ready for ${clientSocketId}`);
    // Notificar al cliente su puerto asignado junto con el offer
    sig.emit("webrtc-signal", { roomId, type, sdp, toSocketId: clientSocketId });
    sig.emit("webrtc-client-port", { roomId, port: clientPort, toSocketId: clientSocketId });
  });

  peer.onLocalCandidate((candidate, mid) => {
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid, toSocketId: clientSocketId });
  });

  peer.onStateChange((s) => {
    console.log(`[Bridge] Host peer state (${clientSocketId}):`, s);
    if (s === "failed") {
      console.error(`[Bridge] ICE failed for client ${clientSocketId}`);
    }
  });

  peer.onGatheringStateChange((s) => console.log(`[Bridge] Host gathering (${clientSocketId}):`, s));

  const channel = peer.createDataChannel("game", { ordered: true });
  client.channel = channel;

  channel.onOpen(() => {
    console.log(`[Bridge] channel.onOpen for ${clientSocketId}`);
    onHostChannelOpen(clientSocketId, channel, clientPort);
  });

  channel.onClosed(() => {
    console.log(`[Bridge] DataChannel closed for ${clientSocketId}`);
  });

  channel.onMessage((msg) => {
    onChannelMessage(msg, clientSocketId);
  });

  channel.onError((e) => {
    console.error(`[Bridge] DataChannel error (${clientSocketId}):`, e);
  });

  setTimeout(() => {
    console.log(`[Bridge] Host creating offer for ${clientSocketId}...`);
    sendStatus("Enviando oferta de conexión al rival...");
    peer.setLocalDescription();
  }, 200);
}

function createClientPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });
  state.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Client local description ready (${type})`);
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
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

  peer.onStateChange((s) => {
    console.log("[Bridge] Client peer state:", s);
    if (s === "failed") sendStatus("❌ Conexión P2P falló.");
    if (s === "connected") sendStatus("¡Conexión P2P establecida!");
  });

  peer.onGatheringStateChange((s) => console.log("[Bridge] Client gathering:", s));
}

/*
WINDOW
*/
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(app.getAppPath(), "client", "dist", "index.html"));
  }

  return win;
}

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message);
  console.error("[FATAL] Stack:", err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

app.whenReady().then(() => {
  setupLogging();
  if (app.isPackaged) allowFirewall(process.execPath, "RetroLink");
  const win = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("render-process-gone", (event, webContents, details) => {
    console.error("[FATAL] Render process gone:", JSON.stringify(details));
  });

  app.on("child-process-gone", (event, details) => {
    console.error("[FATAL] Child process gone:", JSON.stringify(details));
  });
});

app.on("window-all-closed", () => {
  resetBridge();
  if (process.platform !== "darwin") app.quit();
});

/*
IPC HANDLERS
*/
ipcMain.handle("select-game-exe", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Executable Files", extensions: ["exe"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("prepare-host", async (_, port = 27960) => {
  const portAvailable = await checkPort(port);
  allowFirewall(process.execPath, "RetroLink Game Host");
  const upnp = await openUPnP(port);
  return { portAvailable, upnpSuccess: upnp.success, port };
});

ipcMain.handle("close-host-port", async (_, port = 27960) => {
  await closeUPnP(port);
  return { success: true };
});

ipcMain.handle("start-relay", async (_, roomId, isHost) => {
  try {
    await startBridge(roomId, isHost);
    return { success: true };
  } catch (err) {
    console.error("[Bridge] Start error:", err);
    sendStatus("Error al iniciar el bridge: " + err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("stop-relay", async () => {
  resetBridge();
  return { success: true };
});

ipcMain.handle("get-host-ip", async () => {
  return state.hostIP || null;
});

ipcMain.handle("get-local-ips", async () => {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  return results;
});

ipcMain.handle("launch-game", async (_, gamePath, hostIp = null, roomId = null, isHost = false, extraArgs = []) => {
  if (!gamePath) return { success: false, error: "No game path provided" };

  try {
    const gameDir = path.dirname(gamePath);
    allowFirewall(gamePath, "RetroLink Game");

    let args = [...(extraArgs || [])];

    if (isHost) {
      args = [
        "+set", "net_port", "27960",
        "+set", "sv_lanForce", "1",
        "+set", "sv_strictAuth", "0",
        "+set", "sv_pure", "0",
        ...args
      ];
    } else {
      // Usar el puerto asignado por el host, o 27961 por defecto
      const port = state.clientPort || CLIENT_PORT_BASE;
      args = [
        "+connect", `127.0.0.1:${port}`,
        ...args
      ];
      console.log(`[Game] Client connecting to bridge at 127.0.0.1:${port}`);
    }

    console.log(`[Game] Launching ${isHost ? "HOST" : "CLIENT"} — args: ${args.join(" ")}`);

    state.gameRoomId = roomId;

    const proc = execFile(gamePath, args, { cwd: gameDir }, (err) => {
      if (err && err.code !== null) console.error("[Game] Error:", err.message);
    });

    state.gameProcess = proc;

    if (isHost && roomId) {
      proc.on("close", () => {
        console.log("[Game] Host closed game — notifying clients");
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.webContents.send("host-game-closed", { roomId });
        state.gameProcess = null;
        state.gameRoomId = null;
      });
    } else {
      proc.on("close", () => {
        state.gameProcess = null;
        state.gameRoomId = null;
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[Game] Launch error:", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("set-host-ip", async (_, ip) => {
  console.log("[Bridge] set-host-ip called with:", ip);
  state.hostIP = ip;
  return { success: true };
});

ipcMain.handle("kill-game", async () => {
  if (state.gameProcess) {
    try { state.gameProcess.kill(); state.gameProcess = null; }
    catch(e) { console.error("[Game] Kill error:", e.message); }
  }
  return { success: true };
});

 // Cliente: hola uwu3xxxxx eeyyee wn
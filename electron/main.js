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
WebRTC P2P BRIDGE
================================================================
*/

let state = {
  signalingSocket: null,
  peer: null,
  channel: null,
  udpLocal: null,
  udpProxy: null,
  roomId: null,
  isHost: false,
  pendingCandidates: [],
  remoteDescSet: false,
  gameProcess: null,
  gameRoomId: null,
  iceConnectionStart: null,
  hostIP: null,
};

let keepAliveInterval = null;

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

const SIGNALING_URL = "https://retrolink-server.onrender.com";

function resetBridge() {
  stopKeepAlive();
  
  try {
    if (state.signalingSocket && state.roomId) {
      state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId });
    }
  } catch(e) {}
  try { state.channel?.close(); }              catch(e) {}
  try { state.peer?.close(); }                 catch(e) {}
  try { state.signalingSocket?.disconnect(); } catch(e) {}
  try { state.udpLocal?.close(); }             catch(e) {}
  try { state.udpProxy?.close(); }             catch(e) {}

  state.signalingSocket = null;
  state.peer = null;
  state.channel = null;
  state.udpLocal = null;
  state.udpProxy = null;
  state.roomId = null;
  state.pendingCandidates = [];
  state.remoteDescSet = false;
  state.iceConnectionStart = null;
  state.hostIP = null;

  console.log("[Bridge] Reset complete");
}

function startKeepAlive() {
  if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
  
  keepAliveInterval = setInterval(() => {
    if (state.channel?.isOpen()) {
      try {
        const pingMsg = Buffer.from("\xFF\xFF\xFF\xFFping");
        state.channel.sendMessageBinary(pingMsg);
      } catch(e) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    } else {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
}

function onChannelOpen() {
  console.log("[Bridge] DataChannel open — P2P established!");
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");
  startKeepAlive();

  if (state.isHost) {
    // HOST: escucha respuestas de Quake3 local (27960) y las manda al cliente
    state.udpProxy = dgram.createSocket("udp4");

    state.udpProxy.on("error", (err) => {
      console.error("[Bridge] Host UDP proxy error:", err.message);
    });

    // No bindeamos en un puerto fijo — usamos send para enviar a Q3:27960
    // y recibimos las respuestas desde ese socket
    state.udpProxy.bind(0, "127.0.0.1", () => {
      const addr = state.udpProxy.address();
      console.log(`[Bridge] Host UDP proxy bound on port ${addr.port}`);
    });

    state.udpProxy.on("message", (msg, rinfo) => {
      console.log(`[Bridge] Host Q3→DataChannel: ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
        } catch(e) {
          console.error("[Bridge] Host DataChannel send error:", e.message);
        }
      }
    });

  } else {
    // CLIENTE: escucha paquetes salientes de Quake3 (que sale desde 27960 hacia 27961)
    state.udpLocal = dgram.createSocket("udp4");

    state.udpLocal.on("error", (err) => {
      console.error("[Bridge] Client UDP error:", err.message);
      if (err.code === "EADDRINUSE") {
        sendStatus("Puerto 27961 ocupado. Cierra RetroLink y vuelve a abrirlo.");
      }
    });

    state.udpLocal.bind(27961, "127.0.0.1", () => {
      console.log("[Bridge] Client UDP listening on 127.0.0.1:27961");
    });

    state.udpLocal.on("message", (msg) => {
      console.log(`[Bridge] Client Q3→DataChannel: ${msg.length} bytes`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
        } catch(e) {
          console.error("[Bridge] Client DataChannel send error:", e.message);
        }
      }
    });
  }
}

function onChannelMessage(msg) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);

  // Ignorar pings de keep-alive
  if (buf.length === 8 && buf.toString("latin1").includes("ping")) return;

  console.log(`[Bridge] DataChannel→Game: ${buf.length} bytes (isHost=${state.isHost})`);

  if (state.isHost) {
    // HOST: reenviar al Quake3 local en 27960
    if (!state.udpProxy) { console.warn("[Bridge] udpProxy null!"); return; }
    state.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Host→Q3 send error:", err.message);
      else console.log(`[Bridge] Host forwarded ${buf.length} bytes to Q3:27960`);
    });
  } else {
    // CLIENTE: reinyectar respuesta al Quake3 local.
    // CRÍTICO: Quake3 siempre usa su puerto fijo 27960 para escuchar respuestas,
    // sin importar que haya conectado via +connect 127.0.0.1:27961.
    // Confirmado con netstat: "UDP 0.0.0.0:27960 *:* [quake3.exe PID]"
    if (!state.udpLocal) { console.warn("[Bridge] udpLocal null!"); return; }
    state.udpLocal.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Client→Q3 send error:", err.message);
      else console.log(`[Bridge] Client forwarded ${buf.length} bytes to Q3:27960`);
    });
  }
}

function setupChannel(channel) {
  state.channel = channel;
  console.log(`[Bridge] setupChannel called, isHost=${state.isHost}`);

  channel.onOpen(() => {
    console.log("[Bridge] channel.onOpen fired");
    onChannelOpen();
  });

  channel.onClosed(() => {
    console.log("[Bridge] DataChannel closed");
    sendStatus("Conexión P2P cerrada.");
    stopKeepAlive();
  });

  channel.onMessage((msg) => {
    onChannelMessage(msg);
  });

  channel.onError((e) => {
    console.error("[Bridge] DataChannel error:", e);
  });

  console.log(`[Bridge] setupChannel handlers registered, isHost=${state.isHost}`);
}

function flushCandidates() {
  if (!state.peer || !state.remoteDescSet) return;
  state.pendingCandidates.forEach(({ candidate, mid }) => {
    try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
  });
  state.pendingCandidates = [];
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
      if (isHost && !state.peer) {
        sendStatus("Creando conexión P2P...");
        createHostPeer(NDC, sig, roomId);
      }
    });
  });

  sig.on("webrtc-host-ip", ({ hostIP }) => {
    if (!isHost) {
      state.hostIP = hostIP;
      console.log(`[Bridge] Host IP received: ${hostIP}`);
    }
  });

  sig.on("webrtc-peer-ready", () => {
    if (!isHost || state.peer) return;
    console.log("[Bridge] Client ready — creating host peer...");
    sendStatus("Rival encontrado — creando conexión P2P...");
    createHostPeer(NDC, sig, roomId);
  });

  sig.on("webrtc-signal", ({ type, sdp, candidate, mid }) => {
    try {
      if (type === "offer" && !isHost) {
        if (!state.peer) createClientPeer(NDC, sig, roomId);

        console.log("[Bridge] Client received offer — setting remote description...");
        sendStatus("Procesando oferta de conexión...");
        state.peer.setRemoteDescription(sdp, "offer");
        state.remoteDescSet = true;
        flushCandidates();

        setTimeout(() => {
          try {
            console.log("[Bridge] Client sending answer...");
            sendStatus("Respondiendo conexión...");
            state.peer.setLocalDescription();
            console.log("[Bridge] Client answer call completed");
          } catch (err) {
            console.error("[Bridge] setLocalDescription error:", err.message);
            sendStatus("Error respondiendo conexión: " + err.message);
          }
        }, 500);

      } else if (type === "answer" && isHost) {
        console.log("[Bridge] Host received answer — setting remote description...");
        state.peer.setRemoteDescription(sdp, "answer");
        state.remoteDescSet = true;
        flushCandidates();
        console.log("[Bridge] Host remote description set");

      } else if (type === "candidate") {
        if (state.peer && state.remoteDescSet) {
          try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
        } else {
          state.pendingCandidates.push({ candidate, mid });
        }
      }
    } catch (err) {
      console.error("[Bridge] Signal error:", err.message);
      sendStatus("Error procesando señal: " + err.message);
    }
  });
}

function createHostPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Host", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });
  state.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Host local description ready (${type})`);
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
  });

  peer.onStateChange((s) => {
    console.log("[Bridge] Host peer state:", s);
    if (s === "failed") sendStatus("❌ Conexión P2P falló.");
    if (s === "connected") sendStatus("¡Conexión P2P establecida!");
  });

  peer.onGatheringStateChange((s) => console.log("[Bridge] Host gathering:", s));

  const channel = peer.createDataChannel("game", { ordered: true });
  setupChannel(channel);

  setTimeout(() => {
    console.log("[Bridge] Host creating offer...");
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
    setupChannel(channel);
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
      // Cliente conecta al bridge en 27961 — el bridge intercepta y reenvía
      // Las respuestas del host se reinyectan al puerto 27960 (donde Q3 escucha)
      args = [
        "+connect", "127.0.0.1:27961",
        ...args
      ];
      console.log(`[Game] Client connecting to bridge at 127.0.0.1:27961`);
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

ipcMain.handle("kill-game", async () => {
  if (state.gameProcess) {
    try { state.gameProcess.kill(); state.gameProcess = null; }
    catch(e) { console.error("[Game] Kill error:", e.message); }
  }
  return { success: true };
});
 // Cliente: hola uwu3xxxx
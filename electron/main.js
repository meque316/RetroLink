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
================================================================
UTILITY: GET LOCAL IP
================================================================
*/
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const results = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({
          name: name,
          address: iface.address,
        });
      }
    }
  }
  
  // Priorizar VPN (Radmin: 26.x.x.x, ZeroTier: 10.x.x.x)
  const vpnIP = results.find(ip => ip.address.startsWith('26.') || ip.address.startsWith('10.'));
  if (vpnIP) {
    console.log(`[Network] VPN IP detected: ${vpnIP.address} (${vpnIP.name})`);
    return vpnIP.address;
  }
  
  // Priorizar LAN (192.168.x.x)
  const lanIP = results.find(ip => ip.address.startsWith('192.168.'));
  if (lanIP) {
    console.log(`[Network] LAN IP detected: ${lanIP.address} (${lanIP.name})`);
    return lanIP.address;
  }
  
  if (results.length > 0) {
    console.log(`[Network] Using IP: ${results[0].address}`);
    return results[0].address;
  }
  
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

function buildIceServers() {
  return ICE_SERVERS;
}

const SIGNALING_URL = "https://retrolink-server.onrender.com";

// Limpiar todo el estado del bridge
function resetBridge() {
  stopKeepAlive();
  
  try {
    if (state.signalingSocket && state.roomId) {
      state.signalingSocket.emit("webrtc-leave", { roomId: state.roomId });
    }
  } catch(e) {}
  try { state.channel?.close(); }         catch(e) {}
  try { state.peer?.close(); }            catch(e) {}
  try { state.signalingSocket?.disconnect(); } catch(e) {}
  try { state.udpLocal?.close(); }        catch(e) {}
  try { state.udpProxy?.close(); }        catch(e) {}

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

// Keep-alive para mantener el DataChannel abierto
function startKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  keepAliveInterval = setInterval(() => {
    if (state.channel?.isOpen()) {
      try {
        const pingMsg = Buffer.from("\xFF\xFF\xFF\xFFgetchallenge");
        state.channel.sendMessageBinary(pingMsg);
        console.log("[Bridge] Keep-alive ping sent (getchallenge)");
      } catch(e) {
        console.warn("[Bridge] Keep-alive ping failed:", e.message);
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
      }
    } else {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    }
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("[Bridge] Keep-alive stopped");
  }
}

// Configurar DataChannel una vez abierto
function onChannelOpen() {
  console.log("[Bridge] ✅ DataChannel open — P2P established!");
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");
  
  startKeepAlive();

  if (state.isHost) {
    state.udpProxy = dgram.createSocket("udp4");

    state.udpProxy.on("error", (err) => {
      console.error("[Bridge] Host UDP proxy error:", err.message);
      sendStatus("Error de red en el proxy del host: " + err.message);
    });

    state.udpProxy.bind(27960, "127.0.0.1", () => {
      console.log("[Bridge] Host UDP listening on 127.0.0.1:27960 (for game)");
    });

    state.udpProxy.on("message", (msg, rinfo) => {
      console.log(`[Bridge] Host GAME → DataChannel: ${msg.length} bytes`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
          console.log(`[Bridge] Host sent ${msg.length} bytes via DataChannel to client`);
        } catch(e) {
          console.error("[Bridge] Host DataChannel send error:", e.message);
        }
      } else {
        console.warn("[Bridge] Host received game msg but DataChannel not open!");
      }
    });

  } else {
    state.udpLocal = dgram.createSocket("udp4");

    state.udpLocal.on("error", (err) => {
      console.error("[Bridge] Client UDP error:", err.message);
      if (err.code === "EADDRINUSE") {
        sendStatus("Puerto 27961 ocupado. Cierra RetroLink y vuelve a abrirlo.");
      } else {
        sendStatus("Error de red: " + err.message);
      }
      try { state.udpLocal.close(); } catch(e) {}
      state.udpLocal = null;
    });

    state.udpLocal.bind(27961, "127.0.0.1", () => {
      console.log("[Bridge] Client UDP listening on 127.0.0.1:27961 (for game)");
    });

    state.udpLocal.on("message", (msg) => {
      console.log(`[Bridge] Client GAME → DataChannel: ${msg.length} bytes`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
          console.log(`[Bridge] Client sent ${msg.length} bytes via DataChannel to host`);
        } catch(e) {
          console.error("[Bridge] Client DataChannel send error:", e.message);
        }
      } else {
        console.warn("[Bridge] Client received game msg but DataChannel not open!");
      }
    });
  }
}

// 📥 Datos recibidos por DataChannel → reenviar al juego local
function onChannelMessage(msg) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
  
  // 🔥 FILTRAR PINGS EN AMBOS LADOS - SOLO keep-alive, no tráfico real del juego
  if (buf.length === 16 && buf.toString("hex") === "ffffffff6765746368616c6c656e6765") {
    console.log("[Bridge] Keep-alive ping (getchallenge) received - ignored");
    return;
  }
  
  console.log(`[Bridge] DataChannel → GAME: ${buf.length} bytes (isHost=${state.isHost})`);

  if (state.isHost) {
    if (!state.udpProxy) {
      console.warn("[Bridge] Host received DataChannel msg but udpProxy is null!");
      return;
    }
    state.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Host send to game error:", err.message);
      else console.log(`[Bridge] Host sent ${buf.length} bytes to game (127.0.0.1:27960)`);
    });
  } else {
    if (!state.udpLocal) {
      console.warn("[Bridge] Client received DataChannel msg but udpLocal is null!");
      return;
    }
    state.udpLocal.send(buf, 0, buf.length, 27961, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Client send to game error:", err.message);
      else console.log(`[Bridge] Client sent ${buf.length} bytes to game (127.0.0.1:27961)`);
    });
  }
}

function setupChannel(channel) {
  state.channel = channel;
  console.log(`[Bridge] setupChannel called, isHost=${state.isHost}, channel.isOpen()=${channel.isOpen?.()}`);

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
    console.log(`[Bridge] RAW onMessage fired, isHost=${state.isHost}, type=${typeof msg}, len=${msg?.length ?? msg?.byteLength ?? "unknown"}`);
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
    try { 
      console.log(`[Bridge] Flushing candidate: ${candidate} (${mid})`);
      state.peer.addRemoteCandidate(candidate, mid); 
    } catch(e) {
      console.error("[Bridge] Error adding remote candidate:", e.message);
    }
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
    console.error("[Bridge] Signaling connection error:", err.message);
    sendStatus("Error al conectar al servidor de señales.");
  });

  sig.on("connect", () => {
    console.log("[Bridge] Signaling connected:", sig.id);
    sendStatus("Uniéndose a la sala...");

    if (isHost) {
      const localIP = getLocalIP();
      state.hostIP = localIP;
      console.log(`[Bridge] Host IP: ${localIP}`);
    }

    sig.emit("webrtc-join", { roomId, isHost, hostIP: state.hostIP }, (response) => {
      console.log("[Bridge] webrtc-join acknowledged:", response);

      if (isHost && !state.peer) {
        console.log("[Bridge] Host creating peer immediately after join...");
        sendStatus("Creando conexión P2P...");
        createHostPeer(NDC, sig, roomId);
      }
    });
  });

  // Recibir la IP del host desde el servidor (para el cliente)
  sig.on("webrtc-host-ip", ({ hostIP }) => {
    if (!isHost) {
      state.hostIP = hostIP;
      console.log(`[Bridge] ✅ Host IP received from server: ${hostIP}`);
      sendStatus(`IP del host recibida: ${hostIP}`);
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send('host-ip-received', { hostIP });
      }
    }
  });

  sig.on("webrtc-peer-ready", () => {
    if (!isHost || state.peer) return;
    console.log("[Bridge] Client ready (late) — creating host peer...");
    sendStatus("Rival encontrado — creando conexión P2P...");
    createHostPeer(NDC, sig, roomId);
  });

  // ── SEÑALES WebRTC entrantes ──────────────────────────────────
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
            console.log("[Bridge] Client answer call completed without throwing");
          } catch (innerErr) {
            console.error("[Bridge] Error in delayed setLocalDescription:", innerErr.message);
            sendStatus("Error respondiendo conexión: " + innerErr.message);
          }
        }, 500);

      } else if (type === "answer" && isHost) {
        console.log("[Bridge] Host received answer — setting remote description...");
        sendStatus("Conectando túnel P2P...");
        state.peer.setRemoteDescription(sdp, "answer");
        state.remoteDescSet = true;
        flushCandidates();
        console.log("[Bridge] Host remote description set without throwing");

      } else if (type === "candidate") {
        console.log(`[Bridge] Received candidate: ${candidate} (${mid})`);
        if (state.peer && state.remoteDescSet) {
          try { 
            state.peer.addRemoteCandidate(candidate, mid); 
            console.log("[Bridge] Candidate added successfully");
          } catch(e) {
            console.error("[Bridge] addRemoteCandidate error:", e.message);
          }
        } else {
          console.log("[Bridge] Candidate queued (remote desc not set yet)");
          state.pendingCandidates.push({ candidate, mid });
        }
      }
    } catch (err) {
      console.error("[Bridge] FATAL error processing webrtc-signal:", err.message);
      console.error("[Bridge] Stack:", err.stack);
      sendStatus("Error procesando señal de conexión: " + err.message);
    }
  });
}

function createHostPeer(NDC, sig, roomId) {
  console.log("[Bridge] Creating Host Peer with ICE servers:", buildIceServers());
  
  const peer = new NDC.PeerConnection("RetroLink-Host", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });
  state.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Host local description ready (${type})`);
    console.log(`[Bridge] SDP (first 200 chars): ${sdp.substring(0, 200)}...`);
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
    console.log(`[Bridge] Host local candidate: ${candidate} (${mid})`);
    if (candidate.includes("host")) {
      console.log(`[Bridge] ✅ Host candidate found: ${candidate}`);
    }
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
  });

  peer.onStateChange((s) => {
    console.log("[Bridge] Host peer state:", s);
    if (s === "failed") {
      console.error("[Bridge] ❌ ICE connection failed!");
      const elapsed = ((Date.now() - state.iceConnectionStart) / 1000).toFixed(1);
      console.error(`[Bridge] ICE failed after ${elapsed}s`);
      sendStatus("❌ Conexión P2P falló. Revisa que ambos estén en la misma red o VPN.");
    }
    if (s === "connected") {
      console.log("[Bridge] ✅ ICE connection established!");
      sendStatus("¡Conexión P2P establecida!");
    }
    if (s === "disconnected") {
      console.log("[Bridge] ⚠️ ICE connection disconnected");
    }
  });

  peer.onGatheringStateChange((s) => console.log("[Bridge] Host gathering:", s));

  const channel = peer.createDataChannel("game", {
    ordered: true,
  });
  setupChannel(channel);

  setTimeout(() => {
    console.log("[Bridge] Host creating offer...");
    sendStatus("Enviando oferta de conexión al rival...");
    peer.setLocalDescription();
  }, 200);
}

function createClientPeer(NDC, sig, roomId) {
  console.log("[Bridge] Creating Client Peer with ICE servers:", buildIceServers());
  
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: buildIceServers(),
    iceTransportPolicy: "all",
  });
  state.peer = peer;

  peer.onLocalDescription((sdp, type) => {
    console.log(`[Bridge] Client local description ready (${type})`);
    console.log(`[Bridge] SDP (first 200 chars): ${sdp.substring(0, 200)}...`);
    sig.emit("webrtc-signal", { roomId, type, sdp });
  });

  peer.onLocalCandidate((candidate, mid) => {
    console.log(`[Bridge] Client local candidate: ${candidate} (${mid})`);
    if (candidate.includes("host")) {
      console.log(`[Bridge] ✅ Client host candidate found: ${candidate}`);
    }
    sig.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
  });

  peer.onDataChannel((channel) => {
    console.log("[Bridge] Client received DataChannel");
    setupChannel(channel);
  });

  peer.onStateChange((s) => {
    console.log("[Bridge] Client peer state:", s);
    if (s === "failed") {
      console.error("[Bridge] ❌ ICE connection failed!");
      const elapsed = ((Date.now() - state.iceConnectionStart) / 1000).toFixed(1);
      console.error(`[Bridge] ICE failed after ${elapsed}s`);
      sendStatus("❌ Conexión P2P falló. Revisa que ambos estén en la misma red o VPN.");
    }
    if (s === "connected") {
      console.log("[Bridge] ✅ ICE connection established!");
      sendStatus("¡Conexión P2P establecida!");
    }
    if (s === "disconnected") {
      console.log("[Bridge] ⚠️ ICE connection disconnected");
    }
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
        results.push({
          name: name,
          address: iface.address,
        });
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
      args = [
        "+connect", "127.0.0.1:27961",
        ...args
      ];
      console.log(`[Game] Client connecting to localhost:27961 (bridge will relay)`);
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
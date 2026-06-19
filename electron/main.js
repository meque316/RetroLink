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
  try { fs.writeFileSync(logPath, `=== RetroLink ${new Date().toISOString()} ===\n`); } catch(e) {}
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
WebRTC P2P BRIDGE (OPTIMIZED)
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
};

const STUN = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:openrelay.metered.ca:80",
];

const SIGNALING_URL = "https://retrolink-server.onrender.com";

function resetBridge() {
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

  console.log("[Bridge] Reset complete");
}

function onChannelOpen() {
  console.log("[Bridge] DataChannel open — P2P established!");
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");

  if (state.isHost) {
    state.udpProxy = dgram.createSocket("udp4");
    state.udpProxy.bind(0, "127.0.0.1", () => {
      console.log(`[Bridge] Host UDP proxy bound on port ${state.udpProxy.address().port}`);
    });

    state.udpProxy.on("message", (msg) => {
      if (state.channel?.isOpen()) {
        try { state.channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
      }
    });
  }
}

function onChannelMessage(msg) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);

  if (state.isHost) {
    if (!state.udpProxy) return;
    state.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1");
  } else {
    if (!state.udpLocal) return;
    state.udpLocal.send(buf, 0, buf.length, 27961, "127.0.0.1");
  }
}

function setupChannel(channel) {
  state.channel = channel;
  channel.onOpen(onChannelOpen);
  channel.onClosed(() => {
    console.log("[Bridge] DataChannel closed");
    sendStatus("Conexión P2P cerrada.");
  });
  channel.onMessage(onChannelMessage);
  channel.onError((e) => {
    console.error("[Bridge] DataChannel error:", e);
  });
}

function flushCandidates() {
  if (!state.peer || !state.remoteDescSet) return;
  console.log(`[Bridge] Flushing ${state.pendingCandidates.length} delayed candidates`);
  state.pendingCandidates.forEach(({ candidate, mid }) => {
    try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
  });
  state.pendingCandidates = [];
}

async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;

  const NDC = require("node-datachannel");

  // LOG DE CONTROL CRÍTICO: Verifica aquí si ambos reciben exactamente el mismo string de ID
  console.log(`[DEBUG - CONTROL] ROOM ID ENVIADO DESDE REACT: "${roomId}"`);
  console.log(`[Bridge] Starting — role: ${isHost ? "HOST" : "CLIENT"}`);
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
    sendStatus("Buscando rival en la sala...");
    sig.emit("webrtc-join", { roomId, isHost });
  });

  sig.on("webrtc-peer-ready", () => {
    if (!isHost || state.peer) return;
    console.log("[Bridge] Client ready — creating host peer...");
    sendStatus("Rival encontrado — creando conexión P2P...");
    createHostPeer(NDC, sig, roomId);
  });

  // ── SEÑALES WebRTC entrantes (CORREGIDO PARSEO) ──────────────────
  sig.on("webrtc-signal", (data) => {
    if (!data) return;

    // Forzamos la extracción directa sin importar desestructuraciones del server
    const type = data.type;
    const sdp = data.sdp;
    const candidate = data.candidate;
    const mid = data.mid;

    if (type === "offer" && !isHost) {
      if (!state.peer) createClientPeer(NDC, sig, roomId);

      console.log("[Bridge] Client received offer — setting remote description...");
      sendStatus("Procesando oferta de conexión...");
      
      try {
        state.peer.setRemoteDescription(sdp, "offer");
        state.remoteDescSet = true;
        
        console.log("[Bridge] Client sending answer...");
        sendStatus("Respondiendo conexión...");
        state.peer.setLocalDescription("answer");
        
        flushCandidates();
      } catch (err) {
        console.error("[Bridge] Error setting remote offer / local answer:", err);
      }

    } else if (type === "answer" && isHost) {
      console.log("[Bridge] Host received answer — setting remote description...");
      sendStatus("Conectando túnel P2P...");
      
      try {
        state.peer.setRemoteDescription(sdp, "answer");
        state.remoteDescSet = true;
        flushCandidates();
      } catch (err) {
        console.error("[Bridge] Error setting remote answer:", err);
      }

    } else if (type === "candidate" || candidate) {
      if (state.peer && state.remoteDescSet) {
        try { 
          state.peer.addRemoteCandidate(candidate, mid); 
          console.log("[Bridge] Remote candidate added successfully");
        } catch(e) {
          console.warn("[Bridge] Failed to add immediate remote candidate:", e.message);
        }
      } else {
        state.pendingCandidates.push({ candidate, mid });
      }
    }
  });

  if (!isHost) {
    state.udpLocal = dgram.createSocket("udp4");
    state.udpLocal.bind(27961, "127.0.0.1", () => {
      console.log("[Bridge] Client UDP listening on 127.0.0.1:27961");
    });

    state.udpLocal.on("message", (msg) => {
      if (state.channel?.isOpen()) {
        try { state.channel.sendMessageBinary(Buffer.from(msg)); } catch(e) {}
      }
    });
  }
}

function createHostPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Host", {
    iceServers: STUN,
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

  peer.onStateChange((s) => console.log("[Bridge] Host peer state:", s));
  peer.onGatheringStateChange((s) => console.log("[Bridge] Host gathering:", s));

  const channel = peer.createDataChannel("game", {
    ordered: false,
    maxRetransmits: 0,
  });
  setupChannel(channel);

  // Subido a 500ms para asegurar la recolección de candidatos WAN estables
  setTimeout(() => {
    console.log("[Bridge] Host creating offer...");
    sendStatus("Enviando oferta de conexión al rival...");
    try {
      peer.setLocalDescription("offer");
    } catch(e) {
      console.error("[Bridge] Error creating host offer:", e.message);
    }
  }, 500);
}

function createClientPeer(NDC, sig, roomId) {
  const peer = new NDC.PeerConnection("RetroLink-Client", {
    iceServers: STUN,
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

  peer.onStateChange((s) => console.log("[Bridge] Client peer state:", s));
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
}

app.whenReady().then(() => {
  setupLogging();
  if (app.isPackaged) allowFirewall(process.execPath, "RetroLink");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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

ipcMain.handle("launch-game", async (_, gamePath, hostIp = null, roomId = null, isHost = false, extraArgs = []) => {
  if (!gamePath) return { success: false, error: "No game path provided" };

  try {
    const gameDir = path.dirname(gamePath);
    allowFirewall(gamePath, "RetroLink Game");

    const args = [...(extraArgs || []), ...(hostIp ? ["+connect", hostIp] : [])];
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
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
  // NO sobrescribimos el log — usamos append para conservar el historial
  // de sesiones anteriores, incluyendo crashes, a través de reinicios.
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
WebRTC P2P BRIDGE
================================================================

Arquitectura:
  HOST:
    - signalingSocket conecta a Render (socket.io-client)
    - PeerConnection con DataChannel (offerer)
    - udpProxy: socket UDP que habla con Quake 3 en 27960
      * Paquetes entrantes del DataChannel → udpProxy → Q3:27960
      * Respuestas de Q3:27960 → udpProxy → DataChannel

  CLIENTE:
    - signalingSocket conecta a Render (socket.io-client)
    - PeerConnection (answerer)
    - udpLocal en 27961
      * Q3 cliente conecta a 127.0.0.1:27961
      * Paquetes de Q3 → udpLocal → DataChannel
      * Respuestas del DataChannel → udpLocal → Q3:27961

Reglas clave:
  1. Solo signalingSocket maneja el WebRTC signaling (NUNCA el socket del frontend)
  2. El host espera webrtc-peer-ready antes de crear el PeerConnection
  3. ICE candidates se encolan hasta que remote description esté lista
  4. setLocalDescription SIN argumentos — la librería infiere el tipo
================================================================
*/

let state = {
  signalingSocket: null,
  peer: null,
  channel: null,
  udpLocal: null,   // cliente: 27961 / host: no usado para escucha
  udpProxy: null,   // host: habla con Q3 en 27960
  roomId: null,
  isHost: false,
  pendingCandidates: [],
  remoteDescSet: false,
  gameProcess: null,
  gameRoomId: null,
};

// STUN — descubre la IP pública (gratis, sin límite)
// TURN — relay cuando STUN no alcanza por NAT restrictivo (Open Relay Project, 20GB/mes gratis)
//
// Confirmado por pruebas: sin TURN, dos redes distintas con NAT restrictivo
// (o VPN de por medio) nunca completan el ICE — el offer/answer se intercambian
// bien mediante el signaling, pero la conexión P2P directa no se establece.
//
// Probamos antes con credenciales embebidas en string (turn:user:pass@host:port)
// y causó un crash nativo. Usamos formato de string SIN credenciales embebidas,
// más simple, para minimizar el riesgo de malformación que cause un segfault.
// TURN TEMPORALMENTE DESACTIVADO — sospecha confirmada de crash nativo
// en node-datachannel al incluir las URLs TURN de Open Relay Project.
// Volver a probar con formato de objeto IceServer en vez de string si
// se necesita TURN más adelante.
const ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
];

function buildIceServers() {
  return ICE_SERVERS;
}

const SIGNALING_URL = "https://retrolink-server.onrender.com";

// Limpiar todo el estado del bridge
function resetBridge() {
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

  console.log("[Bridge] Reset complete");
}

// Configurar DataChannel una vez abierto
function onChannelOpen() {
  console.log("[Bridge] DataChannel open — P2P established!");
  sendStatus("¡Conexión P2P establecida! Listos para jugar.");

  if (state.isHost) {
    // Host: crear socket UDP para hablar con Quake 3 en 27960
    state.udpProxy = dgram.createSocket("udp4");

    state.udpProxy.on("error", (err) => {
      console.error("[Bridge] UDP proxy error:", err.message);
      sendStatus("Error de red en el proxy del host: " + err.message);
    });

    state.udpProxy.bind(0, "127.0.0.1", () => {
      console.log(`[Bridge] Host UDP proxy bound on port ${state.udpProxy.address().port}`);
    });

    // Respuestas de Q3 → DataChannel → cliente
    state.udpProxy.on("message", (msg) => {
      console.log(`[Bridge] Host udpProxy RECV from Q3: ${msg.length} bytes`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
          console.log(`[Bridge] Host sent ${msg.length} bytes via DataChannel to client`);
        } catch(e) {
          console.error("[Bridge] Host DataChannel send error:", e.message);
        }
      } else {
        console.warn("[Bridge] Host udpProxy received Q3 msg but DataChannel not open!");
      }
    });
  }
}

// Cuando llegan datos por el DataChannel
function onChannelMessage(msg) {
  const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
  console.log(`[Bridge] DataChannel RECV: ${buf.length} bytes (isHost=${state.isHost})`);

  if (state.isHost) {
    // Host: reenviar paquete del cliente a Q3 local
    if (!state.udpProxy) {
      console.warn("[Bridge] Host received DataChannel msg but udpProxy is null!");
      return;
    }
    state.udpProxy.send(buf, 0, buf.length, 27960, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Host udpProxy send error:", err.message);
      else console.log(`[Bridge] Host forwarded ${buf.length} bytes to Q3:27960`);
    });
  } else {
    // Cliente: reenviar respuesta del host a Q3 local en 27961
    if (!state.udpLocal) {
      console.warn("[Bridge] Client received DataChannel msg but udpLocal is null!");
      return;
    }
    state.udpLocal.send(buf, 0, buf.length, 27961, "127.0.0.1", (err) => {
      if (err) console.error("[Bridge] Client udpLocal send error:", err.message);
      else console.log(`[Bridge] Client forwarded ${buf.length} bytes to Q3:27961`);
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
    try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {}
  });
  state.pendingCandidates = [];
}

async function startBridge(roomId, isHost) {
  resetBridge();

  state.roomId = roomId;
  state.isHost = isHost;

  const NDC = require("node-datachannel");

  console.log(`[Bridge] Starting — room: ${roomId}, role: ${isHost ? "HOST" : "CLIENT"}`);
  sendStatus("Conectando al servidor de señales...");

  // ── SIGNALING SOCKET ──────────────────────────────────────────
  // Este socket es EXCLUSIVO para WebRTC signaling.
  // NO es el mismo socket que usa el frontend React.
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

    // Unirse a la sala WebRTC dedicada (SOLO este socket, nunca el del frontend)
    // Usamos ack para confirmar que el join() se completó antes de continuar
    sig.emit("webrtc-join", { roomId, isHost }, (response) => {
      console.log("[Bridge] webrtc-join acknowledged:", response);

      // CASO CLAVE: si somos el host y el cliente YA estaba esperando en la sala
      // (llegó antes que nosotros), no podemos depender de recibir webrtc-peer-ready
      // porque ya se emitió y se perdió. Creamos el peer inmediatamente.
      if (isHost && response?.otherPeerPresent && !state.peer) {
        console.log("[Bridge] Client was already waiting — creating peer immediately...");
        createHostPeer(NDC, sig, roomId);
      }
    });
  });

  // ── HOST: esperar al cliente antes de crear peer ──────────────
  sig.on("webrtc-peer-ready", () => {
    if (!isHost || state.peer) return;
    console.log("[Bridge] Client ready — creating host peer...");
    sendStatus("Rival encontrado — creando conexión P2P...");
    createHostPeer(NDC, sig, roomId);
  });

  // ── SEÑALES WebRTC entrantes ──────────────────────────────────
  sig.on("webrtc-signal", ({ type, sdp, candidate, mid }) => {
    try {
      if (type === "offer" && !isHost) {
        // Cliente crea su peer al recibir el offer
        if (!state.peer) createClientPeer(NDC, sig, roomId);

        console.log("[Bridge] Client received offer — setting remote description...");
        sendStatus("Procesando oferta de conexión...");
        state.peer.setRemoteDescription(sdp, "offer");
        state.remoteDescSet = true;
        flushCandidates();

        // CRÍTICO: dejamos que el event loop respire entre setRemoteDescription
        // y setLocalDescription. El crash nativo (crashpad "not connected")
        // ocurre de forma intermitente justo en esta secuencia — sospecha de
        // condición de carrera en el estado interno de libdatachannel cuando
        // ambas llamadas se hacen de forma síncrona consecutiva.
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
        if (state.peer && state.remoteDescSet) {
          try { state.peer.addRemoteCandidate(candidate, mid); } catch(e) {
            console.error("[Bridge] addRemoteCandidate error:", e.message);
          }
        } else {
          state.pendingCandidates.push({ candidate, mid });
        }
      }
    } catch (err) {
      console.error("[Bridge] FATAL error processing webrtc-signal:", err.message);
      console.error("[Bridge] Stack:", err.stack);
      sendStatus("Error procesando señal de conexión: " + err.message);
    }
  });

  // ── UDP LOCAL (solo cliente) ──────────────────────────────────
  if (!isHost) {
    state.udpLocal = dgram.createSocket("udp4");

    state.udpLocal.on("error", (err) => {
      console.error("[Bridge] UDP bind error:", err.message);
      if (err.code === "EADDRINUSE") {
        sendStatus("Puerto 27961 ocupado por una sesión anterior. Cierra RetroLink completamente (revisa el Administrador de Tareas) y vuelve a abrirlo.");
      } else {
        sendStatus("Error de red: " + err.message);
      }
      try { state.udpLocal.close(); } catch(e) {}
      state.udpLocal = null;
    });

    state.udpLocal.bind(27961, "127.0.0.1", () => {
      console.log("[Bridge] Client UDP listening on 127.0.0.1:27961");
    });

    // Q3 cliente → DataChannel → host
    state.udpLocal.on("message", (msg) => {
      console.log(`[Bridge] Client UDP RECV from Q3: ${msg.length} bytes`);
      if (state.channel?.isOpen()) {
        try {
          state.channel.sendMessageBinary(Buffer.from(msg));
          console.log(`[Bridge] Client sent ${msg.length} bytes via DataChannel`);
        } catch(e) {
          console.error("[Bridge] Client DataChannel send error:", e.message);
        }
      } else {
        console.warn("[Bridge] Client received UDP but DataChannel is not open!");
      }
    });
  }
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

  peer.onStateChange((s) => console.log("[Bridge] Host peer state:", s));
  peer.onGatheringStateChange((s) => console.log("[Bridge] Host gathering:", s));

  // Crear DataChannel
  // TEMPORALMENTE reliable (ordered, sin límite de retransmisiones) para
  // descartar pérdida de paquetes como causa de que el host no reciba nada.
  // TODO: volver a unordered/maxRetransmits:0 una vez confirmado el flujo.
  const channel = peer.createDataChannel("game", {
    ordered: true,
  });
  setupChannel(channel);

  // Delay mínimo para asegurar que el socket del cliente está listo en Render
  setTimeout(() => {
    console.log("[Bridge] Host creating offer...");
    sendStatus("Enviando oferta de conexión al rival...");
    // Igual que en el cliente: sin argumento de tipo, dejamos que la
    // librería nativa infiera "offer" automáticamente del estado del peer.
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


const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} = require("electron");

const path = require("path");
const { exec, execFile } = require("child_process");
const dgram = require("dgram");
const natUpnp = require("nat-upnp");
const { io: socketClient } = require("socket.io-client");

/*
Detect environment
*/
const isDev = !app.isPackaged;

/*
WINDOWS FIREWALL
*/
function allowAppThroughFirewall(programPath, ruleName) {
  if (!programPath) return;

  const command =
    `netsh advfirewall firewall add rule ` +
    `name="${ruleName}" ` +
    `dir=in action=allow ` +
    `program="${programPath}" ` +
    `enable=yes`;

  exec(command, (error) => {
    if (error) {
      console.log(`[Firewall] Rule may already exist for ${ruleName}`);
      return;
    }
    console.log(`[Firewall] ${ruleName} allowed`);
  });
}

/*
CHECK PORT
*/
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.bind(port, () => { socket.close(); resolve(true); });
    socket.on("error", () => resolve(false));
  });
}

/*
UPNP PORT MAPPING
*/
function openPortUPnP(port) {
  return new Promise((resolve) => {
    const client = natUpnp.createClient();
    client.portMapping(
      { public: port, private: port, protocol: "UDP", description: "RetroLink Game", ttl: 0 },
      (err) => {
        client.close();
        if (err) { console.log("[UPnP] Failed:", err.message); resolve({ success: false }); }
        else { console.log(`[UPnP] Port ${port} opened`); resolve({ success: true }); }
      }
    );
  });
}

function closePortUPnP(port) {
  return new Promise((resolve) => {
    const client = natUpnp.createClient();
    client.portUnmapping({ public: port, protocol: "UDP" }, (err) => {
      client.close();
      if (err) console.log("[UPnP] Failed to close port:", err.message);
      else console.log(`[UPnP] Port ${port} closed`);
      resolve();
    });
  });
}

/*
UDP ↔ WebRTC BRIDGE
Usa WebRTC DataChannel para P2P directo con NAT traversal.
El signaling va por el servidor Socket.io en Render.
*/
let signalingSocket = null;
let peerConnection = null;
let dataChannel = null;
let udpSocket = null;
let currentRoomId = null;
let bridgeIsHost = false;

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

async function startWebRTCBridge(roomId, isHost) {
  currentRoomId = roomId;
  bridgeIsHost = isHost;

  // Importar node-datachannel dinámicamente
  const NodeDataChannel = require("node-datachannel");

  console.log(`[WebRTC] Starting bridge — roomId: ${roomId}, isHost: ${isHost}`);

  // Conectar al servidor de signaling (Render)
  signalingSocket = socketClient("https://retrolink-server.onrender.com");

  signalingSocket.on("connect", async () => {
    console.log("[WebRTC] Signaling connected:", signalingSocket.id);
    signalingSocket.emit("webrtc-join", { roomId, isHost });

    if (isHost) {
      // Host crea el peer y el DataChannel
      peerConnection = new NodeDataChannel.PeerConnection("RetroLink", {
        iceServers: STUN_SERVERS.map(s => s.urls),
      });

      dataChannel = peerConnection.createDataChannel("game", {
        ordered: false,      // UDP-like, sin orden
        maxRetransmits: 0,   // UDP-like, sin reenvíos
      });

      setupDataChannel();

      peerConnection.onLocalDescription((sdp, type) => {
        console.log("[WebRTC] Host SDP offer ready, sending to signaling...");
        signalingSocket.emit("webrtc-signal", { roomId, type, sdp });
      });

      peerConnection.onLocalCandidate((candidate, mid) => {
        signalingSocket.emit("webrtc-signal", {
          roomId,
          type: "candidate",
          candidate,
          mid,
        });
      });

      peerConnection.setLocalDescription();
    }
  });

  // Recibir señales del otro peer
  signalingSocket.on("webrtc-signal", async ({ type, sdp, candidate, mid }) => {
    if (!peerConnection) {
      // Cliente recibe la oferta y crea su peer
      peerConnection = new NodeDataChannel.PeerConnection("RetroLink", {
        iceServers: STUN_SERVERS.map(s => s.urls),
      });

      peerConnection.onDataChannel((channel) => {
        dataChannel = channel;
        setupDataChannel();
      });

      peerConnection.onLocalDescription((sdp, type) => {
        console.log("[WebRTC] Client SDP answer ready, sending...");
        signalingSocket.emit("webrtc-signal", { roomId, type, sdp });
      });

      peerConnection.onLocalCandidate((candidate, mid) => {
        signalingSocket.emit("webrtc-signal", {
          roomId,
          type: "candidate",
          candidate,
          mid,
        });
      });
    }

    if (type === "offer") {
      peerConnection.setRemoteDescription(sdp, type);
      peerConnection.setLocalDescription();
    } else if (type === "answer") {
      peerConnection.setRemoteDescription(sdp, type);
    } else if (type === "candidate") {
      peerConnection.addRemoteCandidate(candidate, mid);
    }
  });

  // Crear socket UDP local para interceptar tráfico de Quake 3
  udpSocket = dgram.createSocket("udp4");
  const localPort = isHost ? 27960 : 27961;

  udpSocket.bind(localPort, "127.0.0.1", () => {
    console.log(`[UDP Bridge] Listening on 127.0.0.1:${localPort}`);
  });

  // UDP → WebRTC DataChannel
  udpSocket.on("message", (msg) => {
    if (dataChannel && dataChannel.isOpen()) {
      try {
        dataChannel.sendMessageBinary(msg);
      } catch (e) {
        console.error("[WebRTC] Send error:", e.message);
      }
    }
  });
}

function setupDataChannel() {
  if (!dataChannel) return;

  dataChannel.onOpen(() => {
    console.log("[WebRTC] DataChannel open — P2P connection established!");
  });

  dataChannel.onClosed(() => {
    console.log("[WebRTC] DataChannel closed");
  });

  // WebRTC DataChannel → UDP local (reinyecta al juego)
  dataChannel.onMessage((msg) => {
    if (!udpSocket) return;
    const buffer = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
    const targetPort = bridgeIsHost ? 27960 : 27961;
    udpSocket.send(buffer, 0, buffer.length, targetPort, "127.0.0.1");
  });
}

function stopWebRTCBridge() {
  if (dataChannel) { try { dataChannel.close(); } catch(e) {} dataChannel = null; }
  if (peerConnection) { try { peerConnection.close(); } catch(e) {} peerConnection = null; }
  if (signalingSocket) { signalingSocket.disconnect(); signalingSocket = null; }
  if (udpSocket) { try { udpSocket.close(); } catch(e) {} udpSocket = null; }
  currentRoomId = null;
  console.log("[WebRTC] Bridge stopped");
}

/*
CREATE WINDOW
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
    const indexPath = path.join(app.getAppPath(), "client", "dist", "index.html");
    win.loadFile(indexPath);
  }
}

/*
APP READY
*/
app.whenReady().then(() => {
  if (app.isPackaged) {
    allowAppThroughFirewall(process.execPath, "RetroLink");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/*
CLOSE APP
*/
app.on("window-all-closed", () => {
  stopWebRTCBridge();
  if (process.platform !== "darwin") app.quit();
});

/*
SELECT GAME EXE
*/
ipcMain.handle("select-game-exe", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Executable Files", extensions: ["exe"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

/*
PREPARE HOST
*/
ipcMain.handle("prepare-host", async (_, port = 27960) => {
  console.log(`[RetroLink] Preparing host on port ${port}...`);
  const portAvailable = await checkPortAvailable(port);
  allowAppThroughFirewall(process.execPath, "RetroLink Game Host");
  const upnp = await openPortUPnP(port);
  return { portAvailable, upnpSuccess: upnp.success, port };
});

/*
CLOSE HOST PORT
*/
ipcMain.handle("close-host-port", async (_, port = 27960) => {
  await closePortUPnP(port);
  return { success: true };
});

/*
START RELAY (ahora usa WebRTC)
*/
ipcMain.handle("start-relay", async (_, roomId, isHost) => {
  try {
    stopWebRTCBridge();
    await startWebRTCBridge(roomId, isHost);
    return { success: true };
  } catch (error) {
    console.error("[WebRTC] Error starting bridge:", error);
    return { success: false, error: error.message };
  }
});

/*
STOP RELAY
*/
ipcMain.handle("stop-relay", async () => {
  stopWebRTCBridge();
  return { success: true };
});

/*
LAUNCH GAME
*/
ipcMain.handle("launch-game", async (_, gamePath, hostIp = null) => {
  if (!gamePath) return { success: false, error: "No game path provided" };

  try {
    const gameDir = path.dirname(gamePath);
    allowAppThroughFirewall(gamePath, "RetroLink - Game");

    const args = hostIp ? ["+connect", hostIp] : [];

    console.log(
      hostIp
        ? `[RetroLink] Launching as CLIENT → connecting to ${hostIp}`
        : `[RetroLink] Launching as HOST`
    );

    execFile(gamePath, args, { cwd: gameDir }, (error) => {
      if (error) console.error("Error launching game:", error);
    });

    return { success: true };
  } catch (error) {
    console.error("Error launching game:", error);
    return { success: false, error: error.message };
  }
});


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
MESSAGING TO FRONTEND
Envía estados legibles al banner de Room.jsx
*/
function sendStatusToFrontend(statusMessage) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("bridge-status-update", statusMessage);
  }
}

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
*/
let signalingSocket = null;
let peerConnection = null;
let dataChannel = null;
let udpSocket = null;
let currentRoomId = null;
let bridgeIsHost = false;

let gameProcess = null; 
let gameRoomId = null;  
let gameIsHost = false; 

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

async function startWebRTCBridge(roomId, isHost) {
  currentRoomId = roomId;
  bridgeIsHost = isHost;

  const NodeDataChannel = require("node-datachannel");

  console.log(`[WebRTC] Starting bridge — roomId: ${roomId}, isHost: ${isHost}`);
  sendStatusToFrontend("Conectando al servidor de señales...");

  signalingSocket = socketClient("https://retrolink-server.onrender.com");

  const createHostPeer = () => {
    console.log("[WebRTC] Creating host peer connection...");
    sendStatusToFrontend("Creando canal de conexión (Host)...");

    peerConnection = new NodeDataChannel.PeerConnection("RetroLink", {
      iceServers: STUN_SERVERS.map(s => s.urls),
    });

    dataChannel = peerConnection.createDataChannel("game", {
      ordered: false,
      maxRetransmits: 0,
    });

    setupDataChannel();

    peerConnection.onLocalDescription((sdp, type) => {
      console.log(`[WebRTC] Host local description ready (${type}), sending...`);
      signalingSocket.emit("webrtc-signal", { roomId, type, sdp });
    });

    peerConnection.onLocalCandidate((candidate, mid) => {
      console.log("[WebRTC] Host ICE candidate ready, sending...");
      signalingSocket.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
    });

    console.log("[WebRTC] Calling setLocalDescription('offer')...");
    sendStatusToFrontend("Enviando oferta de red al rival...");
    peerConnection.setLocalDescription("offer"); 
  };

  signalingSocket.on("connect", () => {
    console.log("[WebRTC] Signaling connected:", signalingSocket.id);
    sendStatusToFrontend("Buscando emparejamiento en la sala...");
    signalingSocket.emit("webrtc-join", { roomId, isHost });
  });

  signalingSocket.on("webrtc-peer-ready", () => {
    console.log("[WebRTC] Client is ready — creating peer connection...");
    if (isHost && !peerConnection) {
      createHostPeer();
    }
  });

  let pendingCandidates = [];
  let remoteDescriptionSet = false;

  const flushPendingCandidates = () => {
    pendingCandidates.forEach(({ candidate, mid }) => {
      try { peerConnection.addRemoteCandidate(candidate, mid); } catch(e) {}
    });
    pendingCandidates = [];
  };

  signalingSocket.on("webrtc-signal", async ({ type, sdp, candidate, mid }) => {
    // El cliente construye su estructura SOLO al recibir la oferta inicial del Host
    if (!peerConnection && !isHost && type === "offer") {
      console.log("[WebRTC] Client receiving offer — creating peer connection...");
      sendStatusToFrontend("Procesando oferta de conexión del Host...");

      peerConnection = new NodeDataChannel.PeerConnection("RetroLink", {
        iceServers: STUN_SERVERS.map(s => s.urls),
      });

      peerConnection.onDataChannel((channel) => {
        dataChannel = channel;
        setupDataChannel();
      });

      peerConnection.onLocalDescription((sdp, type) => {
        console.log(`[WebRTC] Client local description ready (${type}), sending...`);
        signalingSocket.emit("webrtc-signal", { roomId, type, sdp });
      });

      peerConnection.onLocalCandidate((candidate, mid) => {
        signalingSocket.emit("webrtc-signal", { roomId, type: "candidate", candidate, mid });
      });
    }

    if (type === "offer") {
      console.log("[WebRTC] Client setting remote description (offer)...");
      peerConnection.setRemoteDescription(sdp, type);
      
      console.log("[WebRTC] Client generating local description (answer)...");
      sendStatusToFrontend("Respondiendo saludo de red (Answer)...");
      peerConnection.setLocalDescription("answer"); 
      
      remoteDescriptionSet = true;
      flushPendingCandidates();
    } else if (type === "answer") {
      console.log("[WebRTC] Host setting remote description (answer)...");
      sendStatusToFrontend("Conectando túneles P2P...");
      peerConnection.setRemoteDescription(sdp, type);
      remoteDescriptionSet = true;
      flushPendingCandidates();
    } else if (type === "candidate") {
      if (peerConnection && remoteDescriptionSet) {
        try { peerConnection.addRemoteCandidate(candidate, mid); } catch(e) {
          console.warn("[WebRTC] Failed to add candidate:", e.message);
        }
      } else {
        pendingCandidates.push({ candidate, mid });
      }
    }
  });

  udpSocket = dgram.createSocket("udp4");
  const localPort = isHost ? 27962 : 27961;

  udpSocket.bind(localPort, "127.0.0.1", () => {
    console.log(`[UDP Bridge] Listening on 127.0.0.1:${localPort}`);
  });

  udpSocket.on("message", (msg, rinfo) => {
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
    sendStatusToFrontend("¡Conexión establecida! Listos para jugar.");
  });

  dataChannel.onClosed(() => {
    console.log("[WebRTC] DataChannel closed");
    sendStatusToFrontend("Conexión privada cerrada.");
  });

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
  sendStatusToFrontend("Puente de red detenido.");
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
ipcMain.handle("launch-game", async (_, gamePath, hostIp = null, roomId = null, isHost = false, extraArgs = []) => {
  if (!gamePath) return { success: false, error: "No game path provided" };

  try {
    const gameDir = path.dirname(gamePath);
    allowAppThroughFirewall(gamePath, "RetroLink - Game");

    const args = [...(extraArgs || []), ...(hostIp ? ["+connect", hostIp] : [])];

    console.log(
      hostIp
        ? `[RetroLink] Launching as CLIENT → connecting to ${hostIp}`
        : `[RetroLink] Launching as HOST`
    );

    gameRoomId = roomId;
    gameIsHost = isHost;

    gameProcess = execFile(gamePath, args, { cwd: gameDir }, (error) => {
      if (error && error.code !== null) {
        console.error("Error launching game:", error);
      }
    });

    if (isHost && roomId) {
      gameProcess.on("close", () => {
        console.log("[RetroLink] Host closed the game — notifying clients...");

        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
          win.webContents.send("host-game-closed", { roomId });
        }

        gameProcess = null;
        gameRoomId = null;
      });
    } else {
      gameProcess.on("close", () => {
        gameProcess = null;
        gameRoomId = null;
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error launching game:", error);
    return { success: false, error: error.message };
  }
});

/*
KILL GAME
*/
ipcMain.handle("kill-game", async () => {
  if (gameProcess) {
    try {
      gameProcess.kill();
      gameProcess = null;
      console.log("[RetroLink] Game process killed");
    } catch (e) {
      console.error("[RetroLink] Error killing game:", e.message);
    }
  }
  return { success: true };
});

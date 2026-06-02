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

    socket.bind(port, () => {
      socket.close();
      resolve(true);
    });

    socket.on("error", () => {
      resolve(false);
    });
  });
}

/*
UPNP PORT MAPPING
*/
function openPortUPnP(port) {
  return new Promise((resolve) => {
    const client = natUpnp.createClient();

    client.portMapping(
      {
        public: port,
        private: port,
        protocol: "UDP",
        description: "RetroLink Game",
        ttl: 0,
      },
      (err) => {
        client.close();
        if (err) {
          console.log("[UPnP] Failed:", err.message);
          resolve({ success: false });
        } else {
          console.log(`[UPnP] Port ${port} opened successfully`);
          resolve({ success: true });
        }
      }
    );
  });
}

/*
CLOSE UPNP PORT MAPPING
*/
function closePortUPnP(port) {
  return new Promise((resolve) => {
    const client = natUpnp.createClient();

    client.portUnmapping(
      { public: port, protocol: "UDP" },
      (err) => {
        client.close();
        if (err) {
          console.log("[UPnP] Failed to close port:", err.message);
        } else {
          console.log(`[UPnP] Port ${port} closed`);
        }
        resolve();
      }
    );
  });
}

/*
UDP ↔ WEBSOCKET BRIDGE
*/
let relaySocket = null;
let udpSocket = null;
let currentRoomId = null;

function startUDPBridge(roomId, isHost) {
  currentRoomId = roomId;

  // Conectar al relay en Fly.io
  relaySocket = socketClient("https://retrolink-relay.fly.dev");

  relaySocket.on("connect", () => {
    console.log("[Relay] Connected:", relaySocket.id);
    relaySocket.emit("join-relay", roomId);
  });

  // Crear socket UDP local
  udpSocket = dgram.createSocket("udp4");

  const localPort = isHost ? 27960 : 27961;

  udpSocket.bind(localPort, "127.0.0.1", () => {
    console.log(`[UDP Bridge] Listening on 127.0.0.1:${localPort}`);
  });

  // UDP → WebSocket (paquetes del juego → relay)
  udpSocket.on("message", (msg) => {
    if (relaySocket?.connected) {
      relaySocket.emit("game-packet", {
        roomId,
        data: msg.toString("base64"),
      });
    }
  });

  // WebSocket → UDP (paquetes del relay → juego local)
  relaySocket.on("game-packet", ({ from, data }) => {
    const buffer = Buffer.from(data, "base64");
    const targetPort = isHost ? 27960 : 27961;
    udpSocket.send(buffer, 0, buffer.length, targetPort, "127.0.0.1");
  });

  relaySocket.on("disconnect", () => {
    console.log("[Relay] Disconnected");
  });
}

function stopUDPBridge() {
  if (relaySocket) {
    relaySocket.disconnect();
    relaySocket = null;
  }
  if (udpSocket) {
    udpSocket.close();
    udpSocket = null;
  }
  currentRoomId = null;
  console.log("[UDP Bridge] Stopped");
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
    const indexPath = path.join(
      app.getAppPath(),
      "client",
      "dist",
      "index.html"
    );
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/*
CLOSE APP
*/
app.on("window-all-closed", () => {
  stopUDPBridge(); // limpia el bridge al cerrar
  if (process.platform !== "darwin") {
    app.quit();
  }
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
  console.log(`[RetroLink] Port ${port} available locally:`, portAvailable);

  allowAppThroughFirewall(process.execPath, "RetroLink Game Host");

  const upnp = await openPortUPnP(port);

  return {
    portAvailable,
    upnpSuccess: upnp.success,
    port,
  };
});

/*
CLOSE HOST PORT
*/
ipcMain.handle("close-host-port", async (_, port = 27960) => {
  await closePortUPnP(port);
  return { success: true };
});

/*
START RELAY BRIDGE
Inicia el puente UDP ↔ WebSocket para el juego
*/
ipcMain.handle("start-relay", async (_, roomId, isHost) => {
  try {
    stopUDPBridge();
    startUDPBridge(roomId, isHost);
    return { success: true };
  } catch (error) {
    console.error("[Relay] Error starting bridge:", error);
    return { success: false, error: error.message };
  }
});

/*
STOP RELAY BRIDGE
*/
ipcMain.handle("stop-relay", async () => {
  stopUDPBridge();
  return { success: true };
});

/*
LAUNCH GAME
- hostIp null   → host, abre el juego normal
- hostIp string → cliente, conecta con +connect IP:puerto
*/
ipcMain.handle("launch-game", async (_, gamePath, hostIp = null) => {
  if (!gamePath) {
    return { success: false, error: "No game path provided" };
  }

  try {
    const gameDir = path.dirname(gamePath);

    allowAppThroughFirewall(gamePath, "RetroLink - Game");

    const args = hostIp ? ["+connect", hostIp] : [];

    console.log(
      hostIp
        ? `[RetroLink] Launching as CLIENT → connecting to ${hostIp}:27960`
        : `[RetroLink] Launching as HOST`
    );

    execFile(gamePath, args, { cwd: gameDir }, (error) => {
      if (error) {
        console.error("Error launching game:", error);
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error launching game:", error);
    return { success: false, error: error.message };
  }
});

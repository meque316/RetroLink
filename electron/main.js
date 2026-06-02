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

/*
Detect environment
*/
const isDev = !app.isPackaged;

/*
WINDOWS FIREWALL
Adds app/game to firewall exceptions
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
Verifica si el puerto UDP está disponible localmente
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
Intenta abrir el puerto en el router via UPnP
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
Cierra el puerto UPnP al salir de la sala
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
1. Verifica si el puerto está disponible localmente
2. Abre el puerto en el firewall de Windows
3. Intenta abrir el puerto en el router via UPnP
Retorna el estado para mostrarlo en la UI
*/
ipcMain.handle("prepare-host", async (_, port = 27960) => {
  console.log(`[RetroLink] Preparing host on port ${port}...`);

  // 1. Verificar puerto local
  const portAvailable = await checkPortAvailable(port);
  console.log(`[RetroLink] Port ${port} available locally:`, portAvailable);

  // 2. Abrir en firewall de Windows
  allowAppThroughFirewall(process.execPath, "RetroLink Game Host");

  // 3. Intentar UPnP
  const upnp = await openPortUPnP(port);

  return {
    portAvailable,
    upnpSuccess: upnp.success,
    port,
  };
});

/*
CLOSE HOST PORT
Libera el puerto UPnP al salir de la sala
*/
ipcMain.handle("close-host-port", async (_, port = 27960) => {
  await closePortUPnP(port);
  return { success: true };
});

/*
LAUNCH GAME
- hostIp null  → es el host, abre el juego normal
- hostIp string → es cliente, conecta con +connect IP:puerto
*/
ipcMain.handle("launch-game", async (_, gamePath, hostIp = null) => {
  if (!gamePath) {
    return { success: false, error: "No game path provided" };
  }

  try {
    const gameDir = path.dirname(gamePath);

    allowAppThroughFirewall(gamePath, "RetroLink - Game");

    const args = hostIp ? ["+connect", `${hostIp}:27960`] : [];

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

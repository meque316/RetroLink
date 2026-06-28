const { ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os"); 
const { execFile } = require("child_process");

// ✅ CORREGIDO: Los juegos están en electron/games/
const gamesPath = path.join(__dirname, '../games/index.js');
console.log('[Handlers] Cargando juegos desde:', gamesPath);
const { getGame, listGames } = require(gamesPath);

const { startBridge, resetBridge, getClientPort } = require("../bridge/relay");
const { allowFirewall, checkPort, openUPnP, closeUPnP } = require("../network/utils");

let gameProcess = null;
let savedHostIP = null;

const GAME_ID_MAP = {
  'cs16': 'cs16',
  'counter-strike': 'cs16',
  'counter-strike 1.6': 'cs16',
  'cs': 'cs16',
  'quake3': 'quake3',
  'quake': 'quake3',
  'quake 3': 'quake3',
  'quake iii': 'quake3',
  'quake iii arena': 'quake3',
  'q3': 'quake3'
};

function registerIPCHandlers() {
  ipcMain.handle("select-game-exe", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Executable Files", extensions: ["exe"] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("prepare-host", async (_, port, gameId) => {
    const game = getGame(gameId);
    const targetPort = port || game?.defaultPort || 27960;
    const portAvailable = await checkPort(targetPort);
    const upnp = await openUPnP(targetPort);
    return { portAvailable, upnpSuccess: upnp.success, port: targetPort };
  });

  // ✅ start-relay SIMPLIFICADO (sin gameId)
  ipcMain.handle("start-relay", async (event, roomId, isHost) => {
    try {
      console.log('[Handlers] start-relay llamado:', { roomId, isHost });
      
      const sendStatus = (msg) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("bridge-status-update", msg);
        }
      };

      const res = await startBridge(roomId, isHost);
      return res;
    } catch (err) {
      console.error("[Handlers] Error en start-relay:", err.message);
      return { success: false, error: err.message };
    }
  });

  // ✅ launch-game - EXACTAMENTE IGUAL QUE EL MONOLÍTICO
  ipcMain.handle("launch-game", async (_, gamePath, hostIp, roomId, isHost, gameId, extraArgs = []) => {
    if (!gamePath) return { success: false, error: "No game path provided" };

    try {
      const gameDir = path.dirname(gamePath);
      allowFirewall(gamePath, "RetroLink Game");

      // ✅ USAR EXACTAMENTE LOS MISMOS ARGUMENTOS QUE EN LA VERSIÓN MONOLÍTICA
      let args = [...(extraArgs || [])];

      if (isHost) {
        // ✅ ARGUMENTOS DEL HOST - IGUAL QUE EL MONOLÍTICO
        args = [
          "+set", "net_port", "27960",
          "+set", "sv_lanForce", "1",
          "+set", "sv_strictAuth", "0",
          "+set", "sv_pure", "0",
          ...args  // ← Los extraArgs se agregan al final (como en el monolítico)
        ];
        console.log(`[Game Launcher] Host args: ${args.join(" ")}`);
      } else {
        // ✅ ARGUMENTOS DEL CLIENTE - IGUAL QUE EL MONOLÍTICO
        const port = getClientPort() || 27961;
        args = [
          "+connect", `127.0.0.1:${port}`,
          ...args
        ];
        console.log(`[Game Launcher] Client connecting to bridge at 127.0.0.1:${port}`);
      }

      console.log(`[Game Launcher] Executing ${gamePath} with args: ${args.join(" ")}`);

      // ✅ EJECUTAR EXACTAMENTE IGUAL QUE EL MONOLÍTICO
      const proc = execFile(gamePath, args, { cwd: gameDir }, (err) => {
        if (err && err.code !== null) console.error("[Game Process Error]:", err.message);
      });

      gameProcess = proc;

      // ✅ MANEJAR EL CIERRE IGUAL QUE EL MONOLÍTICO
      if (isHost && roomId) {
        proc.on("close", () => {
          console.log("[Game] Host closed game — notifying clients");
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.webContents.isDestroyed()) {
            win.webContents.send("host-game-closed", { roomId });
          }
          gameProcess = null;
        });
      } else {
        proc.on("close", () => {
          gameProcess = null;
        });
      }

      return { success: true };
    } catch (err) {
      console.error("[Handlers] Error en launch-game:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stop-relay", async () => {
    resetBridge();
    return { success: true };
  });

  ipcMain.handle("kill-game", async () => {
    if (gameProcess) { 
      try { gameProcess.kill(); } catch(e) {}
      gameProcess = null; 
    }
    return { success: true };
  });

  ipcMain.handle("get-local-ips", async () => {
    try {
      const interfaces = os.networkInterfaces();
      const result = [];

      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.family === "IPv4" && !net.internal) {
            result.push({
              name: name,          
              address: net.address 
            });
          }
        }
      }
      return result;
    } catch (err) {
      console.error("[IPC] Error en get-local-ips:", err);
      return [];
    }
  });

  ipcMain.handle("set-host-ip", async (_, ip) => {
    console.log(`[IPC] Host IP configurada manualmente: ${ip}`);
    savedHostIP = ip;
    return { success: true };
  });

  ipcMain.handle("get-host-ip", async () => {
    return savedHostIP;
  });
}

module.exports = registerIPCHandlers;
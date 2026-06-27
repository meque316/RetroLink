const { ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os"); 
const { execFile } = require("child_process");
const { getGame } = require("../games");
// Asegúrate de que esta ruta hacia relay.js sea la correcta en tu proyecto
const { startBridge, stopBridge, getClientPort } = require("../bridge/relay");
const { allowFirewall, checkPort, openUPnP, closeUPnP } = require("../network/utils");

let gameProcess = null;
let savedHostIP = null;

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

  // CORREGIDO: Mapeo de argumentos exacto hacia relay.js y callback dinámico por evento
  ipcMain.handle("start-relay", async (event, roomId, isHost, gameId) => {
    try {
      // Creamos el sendStatus usando el sender específico que gatilló este evento
      const sendStatus = (msg) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("bridge-status-update", msg);
        }
      };

      // Invocamos pasándole los 4 argumentos requeridos por relay.js
      const res = await startBridge(roomId, isHost, gameId, sendStatus);
      return res;
    } catch (err) {
      console.error("[Handlers] Error en start-relay:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("launch-game", async (_, gamePath, hostIp, roomId, isHost, gameId, extraArgs = []) => {
    if (!gamePath) return { success: false, error: "No game path provided" };
    const game = getGame(gameId);
    if (!game) return { success: false, error: "Invalid game engine" };

    try {
      const gameDir = path.dirname(gamePath);
      allowFirewall(gamePath, `RetroLink ${game.name}`);

      const args = isHost 
        ? game.getHostArgs(extraArgs) 
        : game.getClientArgs(getClientPort() || game.clientPortBase, extraArgs);

      console.log(`[Game Launcher] Executing ${game.name} with flags: ${args.join(" ")}`);
      
      gameProcess = execFile(gamePath, args, { cwd: gameDir }, (err) => {
        if (err && err.code !== null) console.error("[Game Process Error]:", err.message);
      });

      gameProcess.on("close", () => {
        if (isHost) {
          const wins = BrowserWindow.getAllWindows();
          if (wins[0] && !wins[0].webContents.isDestroyed()) {
            wins[0].webContents.send("host-game-closed", { roomId });
          }
        }
        gameProcess = null;
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("stop-relay", async () => {
    stopBridge();
    return { success: true };
  });

  ipcMain.handle("kill-game", async () => {
    if (gameProcess) { gameProcess.kill(); gameProcess = null; }
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
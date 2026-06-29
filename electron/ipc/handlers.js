const { ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os"); 
const { execFile } = require("child_process");

const gamesPath = path.join(__dirname, '../games/index.js');
console.log('[Handlers] Cargando juegos desde:', gamesPath);
const { getGame, listGames } = require(gamesPath);

// ✅ IMPORTAR AMBOS BRIDGES
const relayQuake = require("../bridge/relay");
const relayCS = require("../bridge/relay-cs");

const { allowFirewall, checkPort, openUPnP, closeUPnP } = require("../network/utils");

let gameProcess = null;
let savedHostIP = null;
let activeBridge = null; // Para saber qué bridge está activo

const GAME_ID_MAP = {
  'cs16': 'cs16',
  'counter-strike': 'cs16',
  'counter-strike 1.6': 'cs16',
  'cs': 'cs16',
  'counterstrike': 'cs16',
  'cstrike': 'cs16',
  'cs1.6': 'cs16',
  'cs 1.6': 'cs16',
  'counter strike': 'cs16',
  'counter strike 1.6': 'cs16',
  
  'quake3': 'quake3',
  'quake': 'quake3',
  'quake 3': 'quake3',
  'quake iii': 'quake3',
  'quake iii arena': 'quake3',
  'q3': 'quake3'
};

// ✅ Función para obtener el bridge correcto según el juego
function getBridge(gameId) {
  const normalizedId = GAME_ID_MAP[gameId?.toLowerCase?.()] || gameId;
  
  // Si es CS 1.6
  if (normalizedId === 'cs16') {
    console.log('[Handlers] Usando bridge para CS 1.6');
    return relayCS;
  }
  
  // Si es Quake III o cualquier otro
  console.log('[Handlers] Usando bridge para Quake III');
  return relayQuake;
}

// ✅ Función para obtener el bridge activo (o el de Quake por defecto)
function getActiveBridge() {
  return activeBridge || relayQuake;
}

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

  // ✅ start-relay - usa el bridge correcto según gameId
  ipcMain.handle("start-relay", async (event, roomId, isHost, gameId) => {
    try {
      console.log('[Handlers] start-relay llamado:', { roomId, isHost, gameId });
      
      const bridge = getBridge(gameId);
      activeBridge = bridge;
      
      const sendStatus = (msg) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("bridge-status-update", msg);
        }
      };

      // ✅ Pasar gameId al bridge (aunque no lo use, por compatibilidad)
      const res = await bridge.startBridge(roomId, isHost);
      return res;
    } catch (err) {
      console.error("[Handlers] Error en start-relay:", err.message);
      return { success: false, error: err.message };
    }
  });

  // ✅ launch-game - usa el bridge correcto para obtener el puerto del cliente
  ipcMain.handle("launch-game", async (_, gamePath, hostIp, roomId, isHost, gameId, extraArgs = []) => {
    if (!gamePath) return { success: false, error: "No game path provided" };

    try {
      const gameDir = path.dirname(gamePath);
      allowFirewall(gamePath, "RetroLink Game");

      const normalizedGameId = GAME_ID_MAP[gameId?.toLowerCase?.()] || gameId;
      const game = getGame(normalizedGameId);
      
      let args = [];
      let gameName = "Desconocido";

      // ✅ Obtener el puerto del cliente del bridge correcto
      const bridge = getBridge(gameId);
      const clientPort = bridge.getClientPort() || 27961;

      if (game) {
        gameName = game.name;
        if (isHost) {
          args = game.getHostArgs(extraArgs || []);
          console.log(`[Game Launcher] Host args (${gameName}): ${args.join(" ")}`);
        } else {
          // ✅ Usar el puerto del bridge correcto
          const port = bridge.getClientPort() || game.clientPortBase || 27015;
          args = game.getClientArgs(port, extraArgs || []);
          console.log(`[Game Launcher] Client args (${gameName}): ${args.join(" ")}`);
        }
      } else {
        console.warn(`[Game Launcher] Juego no encontrado: ${gameId}, usando args genéricos (Quake III)`);
        if (isHost) {
          args = [
            "+set", "net_port", "27960",
            "+set", "sv_lanForce", "1",
            "+set", "sv_strictAuth", "0",
            "+set", "sv_pure", "0",
            ...extraArgs
          ];
        } else {
          const port = bridge.getClientPort() || 27961;
          args = ["+connect", `127.0.0.1:${port}`, ...extraArgs];
        }
      }

      console.log(`[Game Launcher] Executing ${gamePath} with args: ${args.join(" ")}`);

      const proc = execFile(gamePath, args, { cwd: gameDir }, (err) => {
        if (err && err.code !== null) console.error("[Game Process Error]:", err.message);
      });

      gameProcess = proc;

      if (isHost && roomId) {
        proc.on("close", (code) => {
          console.log(`[Game] Host closed game (${gameName}) — notifying clients, code: ${code}`);
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.webContents.isDestroyed()) {
            win.webContents.send("host-game-closed", { roomId });
          }
          gameProcess = null;
        });
      } else {
        proc.on("close", (code) => {
          console.log(`[Game] Client game (${gameName}) closed, code: ${code}`);
          gameProcess = null;
        });
      }

      proc.on("error", (err) => {
        console.error(`[Game] Error ejecutando ${gameName}:`, err.message);
        gameProcess = null;
      });

      return { success: true };
    } catch (err) {
      console.error("[Handlers] Error en launch-game:", err);
      return { success: false, error: err.message };
    }
  });

  // ✅ stop-relay - usa el bridge activo
  ipcMain.handle("stop-relay", async () => {
    const bridge = getActiveBridge();
    bridge.resetBridge();
    activeBridge = null;
    return { success: true };
  });

  ipcMain.handle("kill-game", async () => {
    if (gameProcess) { 
      try { 
        gameProcess.kill(); 
        console.log("[Game] Proceso terminado por kill-game");
      } catch(e) {
        console.error("[Game] Error al matar proceso:", e.message);
      }
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

  // ✅ get-bridge-state - usa el bridge activo
  ipcMain.handle("get-bridge-state", async () => {
    try {
      const bridge = getActiveBridge();
      return bridge.getBridgeState();
    } catch (err) {
      console.error("[IPC] Error getting bridge state:", err);
      return null;
    }
  });

  // ✅ get-client-port - usa el bridge activo
  ipcMain.handle("get-client-port", async () => {
    const bridge = getActiveBridge();
    return bridge.getClientPort();
  });
}

module.exports = registerIPCHandlers;
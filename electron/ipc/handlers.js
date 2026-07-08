const { ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const gamesPath = path.join(__dirname, "../games/index.js");
console.log("[Handlers] Cargando juegos desde:", gamesPath);

const { getGame, getRealGameId } = require(gamesPath);

const relayQuake = require("../bridge/relay");
const relayCS = require("../bridge/relay-cs");
const relayC2 = require("../bridge/relay-c2");

const { allowFirewall, checkPort, openUPnP } = require("../network/utils");

let gameProcess = null;
let savedHostIP = null;
let activeBridge = null;

function getBridge(gameId) {
  const realGameId = getRealGameId(gameId);

  if (realGameId === "cs16") {
    console.log("[Handlers] Usando bridge para CS 1.6");
    return relayCS;
  }

  if (realGameId === "carmageddon2") {
    console.log("[Handlers] Usando bridge para Carmageddon 2");
    return relayC2;
  }

  console.log("[Handlers] Usando bridge para Quake III");
  return relayQuake;
}

function getActiveBridge() {
  return activeBridge || relayQuake;
}

function buildGameArgs({ game, bridge, isHost, gameOptions, extraArgs }) {
  if (isHost) {
    if (game.supportsRoomOptions) {
      return game.getHostArgs(gameOptions, extraArgs || []);
    }

    return game.getHostArgs(extraArgs || []);
  }

  const port =
    bridge.getClientPort() ||
    game.clientPortBase ||
    game.defaultPort ||
    27961;

  if (game.supportsRoomOptions) {
    return game.getClientArgs(port, gameOptions, extraArgs || []);
  }

  return game.getClientArgs(port, extraArgs || []);
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

    return {
      portAvailable,
      upnpSuccess: upnp.success,
      port: targetPort,
    };
  });

  ipcMain.handle("start-relay", async (_, roomId, isHost, gameId) => {
    try {
      console.log("[Handlers] start-relay llamado:", {
        roomId,
        isHost,
        gameId,
      });

      const bridge = getBridge(gameId);
      activeBridge = bridge;

      return await bridge.startBridge(roomId, isHost, gameId);
    } catch (err) {
      console.error("[Handlers] Error en start-relay:", err.message);

      return {
        success: false,
        error: err.message,
      };
    }
  });

  ipcMain.handle(
    "launch-game",
    async (
      _,
      gamePath,
      hostIp,
      roomId,
      isHost,
      gameId,
      gameOptions = {},
      extraArgs = []
    ) => {
      if (!gamePath) {
        return {
          success: false,
          error: "No game path provided",
        };
      }

      try {
        const gameDir = path.dirname(gamePath);

        allowFirewall(gamePath, "RetroLink Game");

        const realGameId = getRealGameId(gameId);
        const game = getGame(realGameId);
        const bridge = getBridge(realGameId);

        let args = [];
        let gameName = "Desconocido";

        if (game) {
          gameName = game.name;

          if (!isHost && game.serverWarmupMs) {
            console.log(
              `[Game Launcher] Esperando ${game.serverWarmupMs}ms antes de lanzar cliente...`
            );

            await new Promise((resolve) =>
              setTimeout(resolve, game.serverWarmupMs)
            );
          }

          args = buildGameArgs({
            game,
            bridge,
            isHost,
            gameOptions,
            extraArgs,
          });

          console.log(
            `[Game Launcher] ${isHost ? "Host" : "Client"} args (${gameName}): ${args.join(" ")}`
          );
        } else {
          console.warn(
            `[Game Launcher] Juego no encontrado: ${gameId}, usando args genéricos de Quake III`
          );

          if (isHost) {
            args = [
              "+set",
              "net_port",
              "27960",
              "+set",
              "sv_lanForce",
              "1",
              "+set",
              "sv_strictAuth",
              "0",
              "+set",
              "sv_pure",
              "0",
              ...extraArgs,
            ];
          } else {
            const port = bridge.getClientPort() || 27961;

            args = ["+connect", `127.0.0.1:${port}`, ...extraArgs];
          }
        }

        console.log(
          `[Game Launcher] Executing ${gamePath} with args: ${args.join(" ")}`
        );

        const proc = execFile(gamePath, args, { cwd: gameDir }, (err) => {
          if (err && err.code !== null) {
            console.error("[Game Process Error]:", err.message);
          }
        });

        gameProcess = proc;

        if (isHost && roomId) {
          proc.on("close", (code) => {
            console.log(
              `[Game] Host closed game (${gameName}) — notifying clients, code: ${code}`
            );

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

        return {
          success: false,
          error: err.message,
        };
      }
    }
  );

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
      } catch (err) {
        console.error("[Game] Error al matar proceso:", err.message);
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
              name,
              address: net.address,
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

  ipcMain.handle("get-bridge-state", async () => {
    try {
      const bridge = getActiveBridge();
      return bridge.getBridgeState();
    } catch (err) {
      console.error("[IPC] Error getting bridge state:", err);
      return null;
    }
  });

  ipcMain.handle("get-client-port", async () => {
    const bridge = getActiveBridge();
    return bridge.getClientPort();
  });
}

module.exports = registerIPCHandlers;
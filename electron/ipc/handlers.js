const { ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, spawn } = require("child_process");

const gamesPath = path.join(__dirname, "../games/index.js");
console.log("[Handlers] Cargando juegos desde:", gamesPath);

const { getGame, getRealGameId } = require(gamesPath);

const relayQuake = require("../bridge/relay");
const relayCS = require("../bridge/relay-cs");
const relayC2 = require("../bridge/relay-c2");
const relayUT99 = require("../bridge/relay-ut99");

const { allowFirewall, checkPort, openUPnP } = require("../network/utils");

let gameProcess = null;
let serverProcess = null;
let savedHostIP = null;
let activeBridge = null;

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

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

  if (realGameId === "ut99") {
    console.log("[Handlers] Usando bridge genérico para UT99");
    return relayUT99;
  }

  console.log("[Handlers] Usando bridge para Quake III");
  return relayQuake;
}

function getActiveBridge() {
  return activeBridge || relayQuake;
}

function buildGameArgs({
  game,
  bridge,
  isHost,
  gameOptions,
  extraArgs,
}) {
  if (isHost) {
    return game.supportsRoomOptions
      ? game.getHostArgs(gameOptions, extraArgs || [])
      : game.getHostArgs(extraArgs || []);
  }

  const port =
    bridge.getClientPort() ||
    game.clientPortBase ||
    game.defaultPort ||
    27961;

  return game.supportsRoomOptions
    ? game.getClientArgs(port, gameOptions, extraArgs || [])
    : game.getClientArgs(port, extraArgs || []);
}

function launchProcess({
  gamePath,
  args,
  gameDir,
  realGameId,
}) {
  const isCarmageddon2 = realGameId === "carmageddon2";

  if (isCarmageddon2) {
    const process = spawn(gamePath, args, {
      cwd: gameDir,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    process.unref();
    return process;
  }

  return execFile(
    gamePath,
    args,
    {
      cwd: gameDir,
    },
    (error) => {
      if (error && error.code !== null) {
        console.error("[Game Process Error]:", error.message);
      }
    }
  );
}

function launchUT99Server({
  game,
  gamePath,
  gameOptions,
  extraArgs,
}) {
  const gameDir = path.dirname(gamePath);
  const serverExecutable = game.serverExecutable || "UCC.exe";
  const serverPath = path.join(gameDir, serverExecutable);

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `No se encontró el servidor dedicado de UT99: ${serverPath}`
    );
  }

  const serverArgs = game.getServerArgs(
    gameOptions || {},
    extraArgs || []
  );

  console.log(
    `[UT99 Server] Executing ${serverPath} with args: ${serverArgs.join(" ")}`
  );

  allowFirewall(serverPath, "RetroLink UT99 Server");

  const process = spawn(serverPath, serverArgs, {
    cwd: gameDir,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  process.stdout?.on("data", (data) => {
    const text = data.toString().trim();

    if (text) {
      console.log(`[UT99 Server] ${text}`);
    }
  });

  process.stderr?.on("data", (data) => {
    const text = data.toString().trim();

    if (text) {
      console.error(`[UT99 Server Error] ${text}`);
    }
  });

  process.on("error", (error) => {
    console.error(
      "[UT99 Server] No se pudo iniciar UCC.exe:",
      error.message
    );

    if (serverProcess === process) {
      serverProcess = null;
    }
  });

  process.on("close", (code) => {
    console.log(`[UT99 Server] UCC.exe cerrado, código: ${code}`);

    if (serverProcess === process) {
      serverProcess = null;
    }
  });

  return process;
}

function stopProcess(process, label) {
  if (!process) return;

  try {
    if (!process.killed) {
      process.kill();
      console.log(`[Game] ${label} terminado`);
    }
  } catch (error) {
    console.error(
      `[Game] Error terminando ${label}:`,
      error.message
    );
  }
}

function notifyHostGameClosed(roomId) {
  if (!roomId) return;

  const window = BrowserWindow.getAllWindows()[0];

  if (window && !window.webContents.isDestroyed()) {
    window.webContents.send("host-game-closed", {
      roomId,
    });
  }
}

function registerIPCHandlers() {
  ipcMain.handle("select-game-exe", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Executable Files",
          extensions: ["exe"],
        },
      ],
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

  ipcMain.handle(
    "start-relay",
    async (_, roomId, isHost, gameId) => {
      try {
        console.log("[Handlers] start-relay llamado:", {
          roomId,
          isHost,
          gameId,
        });

        const bridge = getBridge(gameId);
        activeBridge = bridge;

        return await bridge.startBridge(
          roomId,
          isHost,
          gameId
        );
      } catch (error) {
        console.error(
          "[Handlers] Error en start-relay:",
          error.message
        );

        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

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
        const realGameId = getRealGameId(gameId);
        const game = getGame(realGameId);

        if (!game) {
          return {
            success: false,
            error: `Juego no encontrado: ${gameId}`,
          };
        }

        const bridge = getBridge(realGameId);
        const gameDir = path.dirname(gamePath);
        const gameName = game.name;

        allowFirewall(gamePath, "RetroLink Game");

        /*
        =========================================
        CASO ESPECIAL: UNREAL TOURNAMENT 99
        =========================================
        El host ejecuta:
        1. UCC.exe como servidor dedicado.
        2. UnrealTournament.exe como cliente local.

        Los clientes remotos ejecutan solamente:
        UnrealTournament.exe conectado al puerto local
        asignado por el bridge.
        */
        if (realGameId === "ut99") {
          if (isHost) {
            if (serverProcess) {
              stopProcess(
                serverProcess,
                "servidor dedicado UT99 anterior"
              );

              serverProcess = null;
            }

            serverProcess = launchUT99Server({
              game,
              gamePath,
              gameOptions,
              extraArgs: [],
            });

            const warmupMs =
              Number(game.serverWarmupMs) > 0
                ? Number(game.serverWarmupMs)
                : 3000;

            console.log(
              `[UT99] Esperando ${warmupMs}ms para que UCC.exe abra el puerto ${game.defaultPort}...`
            );

            await delay(warmupMs);

            if (
              serverProcess &&
              serverProcess.exitCode !== null
            ) {
              throw new Error(
                `UCC.exe se cerró antes de iniciar el cliente. Código: ${serverProcess.exitCode}`
              );
            }

            const hostArgs = game.getHostArgs(
              gameOptions || {},
              extraArgs || []
            );

            console.log(
              `[UT99 Client Host] Executing ${gamePath} with args: ${hostArgs.join(" ")}`
            );

            gameProcess = execFile(
              gamePath,
              hostArgs,
              {
                cwd: gameDir,
              },
              (error) => {
                if (error && error.code !== null) {
                  console.error(
                    "[UT99 Host Client Error]:",
                    error.message
                  );
                }
              }
            );
          } else {
            const clientPort =
              bridge.getClientPort() ||
              game.clientPortBase ||
              game.defaultPort;

            const clientArgs = game.getClientArgs(
              clientPort,
              gameOptions || {},
              extraArgs || []
            );

            console.log(
              `[UT99 Client] Puerto local del bridge: ${clientPort}`
            );

            console.log(
              `[UT99 Client] Executing ${gamePath} with args: ${clientArgs.join(" ")}`
            );

            gameProcess = execFile(
              gamePath,
              clientArgs,
              {
                cwd: gameDir,
              },
              (error) => {
                if (error && error.code !== null) {
                  console.error(
                    "[UT99 Client Error]:",
                    error.message
                  );
                }
              }
            );
          }

          const currentProcess = gameProcess;

          currentProcess.on("close", (code) => {
            console.log(
              `[Game] ${isHost ? "Host" : "Client"} game (${gameName}) closed, code: ${code}`
            );

            if (gameProcess === currentProcess) {
              gameProcess = null;
            }

            if (isHost) {
              stopProcess(
                serverProcess,
                "servidor dedicado UT99"
              );

              serverProcess = null;
              notifyHostGameClosed(roomId);
            }
          });

          currentProcess.on("error", (error) => {
            console.error(
              `[Game] Error ejecutando ${gameName}:`,
              error.message
            );

            if (gameProcess === currentProcess) {
              gameProcess = null;
            }

            if (isHost) {
              stopProcess(
                serverProcess,
                "servidor dedicado UT99"
              );

              serverProcess = null;
            }
          });

          return {
            success: true,
            dedicatedServer: isHost,
            gamePort: game.defaultPort,
            clientPort: isHost
              ? game.defaultPort
              : bridge.getClientPort(),
          };
        }

        /*
        =========================================
        FLUJO NORMAL: QUAKE, CS 1.6, CARMAGEDDON
        =========================================
        */
        if (!isHost && game.serverWarmupMs) {
          console.log(
            `[Game Launcher] Esperando ${game.serverWarmupMs}ms antes de lanzar cliente...`
          );

          await delay(game.serverWarmupMs);
        }

        const args = buildGameArgs({
          game,
          bridge,
          isHost,
          gameOptions,
          extraArgs,
        });

        console.log(
          `[Game Launcher] ${isHost ? "Host" : "Client"} args (${gameName}): ${args.join(" ")}`
        );

        console.log(
          `[Game Launcher] Executing ${gamePath} with args: ${args.join(" ")}`
        );

        const process = launchProcess({
          gamePath,
          args,
          gameDir,
          realGameId,
        });

        gameProcess = process;

        process.on("close", (code) => {
          console.log(
            `[Game] ${isHost ? "Host" : "Client"} game (${gameName}) closed, code: ${code}`
          );

          if (gameProcess === process) {
            gameProcess = null;
          }

          if (isHost) {
            notifyHostGameClosed(roomId);
          }
        });

        process.on("error", (error) => {
          console.error(
            `[Game] Error ejecutando ${gameName}:`,
            error.message
          );

          if (gameProcess === process) {
            gameProcess = null;
          }
        });

        return {
          success: true,
        };
      } catch (error) {
        console.error(
          "[Handlers] Error en launch-game:",
          error
        );

        stopProcess(
          serverProcess,
          "servidor dedicado tras error"
        );

        serverProcess = null;

        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  ipcMain.handle("stop-relay", async () => {
    const bridge = getActiveBridge();

    bridge.resetBridge();
    activeBridge = null;

    return {
      success: true,
    };
  });

  ipcMain.handle("kill-game", async () => {
    stopProcess(gameProcess, "cliente del juego");
    stopProcess(serverProcess, "servidor dedicado");

    gameProcess = null;
    serverProcess = null;

    return {
      success: true,
    };
  });

  ipcMain.handle("get-local-ips", async () => {
    try {
      const interfaces = os.networkInterfaces();
      const result = [];

      for (const name of Object.keys(interfaces)) {
        for (const network of interfaces[name] || []) {
          if (
            network.family === "IPv4" &&
            !network.internal
          ) {
            result.push({
              name,
              address: network.address,
            });
          }
        }
      }

      return result;
    } catch (error) {
      console.error(
        "[IPC] Error en get-local-ips:",
        error
      );

      return [];
    }
  });

  ipcMain.handle("set-host-ip", async (_, ip) => {
    console.log(
      `[IPC] Host IP configurada manualmente: ${ip}`
    );

    savedHostIP = ip;

    return {
      success: true,
    };
  });

  ipcMain.handle("get-host-ip", async () => {
    return savedHostIP;
  });

  ipcMain.handle("get-bridge-state", async () => {
    try {
      const bridge = getActiveBridge();
      return bridge.getBridgeState();
    } catch (error) {
      console.error(
        "[IPC] Error getting bridge state:",
        error
      );

      return null;
    }
  });

  ipcMain.handle("get-client-port", async () => {
    const bridge = getActiveBridge();
    return bridge.getClientPort();
  });
}

module.exports = registerIPCHandlers;
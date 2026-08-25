// electron/ipc/game.handlers.js

const {
  ipcMain,
  dialog,
  BrowserWindow,
} = require("electron");

const path = require("path");

const gamesPath = path.join(
  __dirname,
  "../games/index.js"
);

console.log(
  "[Handlers] Cargando juegos desde:",
  gamesPath
);

const {
  getGame,
  getRealGameId,
} = require(gamesPath);

const {
  getBridge,
  getActiveBridge,
} = require("../bridge/bridge-registry");

const {
  launchStandardGame,
} = require("../launchers/game-launcher");

const {
  launchUT99,
} = require("../launchers/ut99-launcher");

const processManager =
  require("../runtime/process-manager");

function notifyHostGameClosed(roomId) {
  if (!roomId) {
    return;
  }

  const window =
    BrowserWindow.getAllWindows()[0];

  if (
    window &&
    !window.webContents.isDestroyed()
  ) {
    window.webContents.send(
      "host-game-closed",
      {
        roomId,
      }
    );
  }
}

function attachGameProcessEvents({
  process,
  isHost,
  roomId,
  gameName,
  isUT99,
}) {
  if (!process || typeof process.on !== "function") {
    throw new Error(
      `No se recibió un proceso válido para ${gameName}`
    );
  }

  process.on("close", (code) => {
    console.log(
      `[Game] ${
        isHost ? "Host" : "Client"
      } game (${gameName}) closed, code: ${code}`
    );

    processManager.clearGameProcess(
      process
    );

    if (isHost && isUT99) {
      processManager.stopServerProcess(
        "servidor dedicado UT99"
      );
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

    processManager.clearGameProcess(
      process
    );

    if (isHost && isUT99) {
      processManager.stopServerProcess(
        "servidor dedicado UT99"
      );
    }
  });
}

function registerGameHandlers() {
  // ===== Handler: Seleccionar ejecutable del juego =====
  ipcMain.handle(
    "select-game-exe",
    async () => {
      const result =
        await dialog.showOpenDialog({
          properties: ["openFile"],

          filters: [
            {
              name: "Executable Files",
              extensions: ["exe"],
            },
          ],
        });

      return result.canceled
        ? null
        : result.filePaths[0];
    }
  );

  // ===== Handler: Lanzar el juego =====
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
        // ===== NUEVO: Normalizar gameId antes de usarlo =====
        let realGameId = getRealGameId(gameId);
        
        // Si no se encuentra, intentar con una versión normalizada
        if (!realGameId) {
          const normalizedId = gameId.toLowerCase().trim().replace(/\s+/g, ' ');
          realGameId = getRealGameId(normalizedId);
        }
        
        // Si aún no se encuentra, intentar con el gameId original
        if (!realGameId) {
          realGameId = gameId;
        }
        // ===== FIN NUEVO =====

        const game =
          getGame(realGameId);

        if (!game) {
          return {
            success: false,
            error:
              `Juego no encontrado: ${gameId}`,
          };
        }

        const bridge =
          getBridge(realGameId);

        // Caso especial: UT99
        if (realGameId === "ut99") {
          if (
            isHost &&
            processManager.getServerProcess()
          ) {
            processManager.stopServerProcess(
              "servidor dedicado UT99 anterior"
            );
          }

          const result =
            await launchUT99({
              game,
              bridge,
              gamePath,
              isHost,
              gameOptions,
              extraArgs,
            });

          if (!result?.gameProcess) {
            throw new Error(
              `No se pudo iniciar el proceso de ${game.name}`
            );
          }

          processManager.setGameProcess(
            result.gameProcess
          );

          if (result.serverProcess) {
            processManager.setServerProcess(
              result.serverProcess
            );
          }

          attachGameProcessEvents({
            process: result.gameProcess,
            isHost,
            roomId,
            gameName: game.name,
            isUT99: true,
          });

          return {
            success: true,
            dedicatedServer: isHost,
            gamePort: result.gamePort,
            clientPort: result.clientPort,
          };
        }

        // Juegos estándar
        const result =
          await launchStandardGame({
            game,
            bridge,
            gamePath,
            hostIp,
            isHost,
            realGameId,
            gameOptions,
            extraArgs,
          });

        if (!result?.process) {
          throw new Error(
            `No se pudo iniciar el proceso de ${game.name}`
          );
        }

        processManager.setGameProcess(
          result.process
        );

        attachGameProcessEvents({
          process: result.process,
          isHost,
          roomId,
          gameName: game.name,
          isUT99: false,
        });

        return {
          success: true,
        };
      } catch (error) {
        console.error(
          "[Handlers] Error en launch-game:",
          error
        );

        processManager.stopServerProcess(
          "servidor dedicado tras error"
        );

        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  // ===== Handler: Matar el proceso del juego =====
  ipcMain.handle(
    "kill-game",
    async () => {
      processManager.stopAllProcesses();

      return {
        success: true,
      };
    }
  );

  // ===== Handler Test Game =====
  ipcMain.handle('test-game', async (_, roomId) => {
    try {
      console.log('[IPC] 🧪 Test Game iniciado para sala:', roomId);

      const bridge = getActiveBridge();
      if (!bridge) {
        throw new Error('No hay bridge activo');
      }

      const result = await bridge.testGame?.(roomId);

      if (!result) {
        throw new Error('El bridge no soporta testGame');
      }

      console.log('[IPC] ✅ Test Game completado:', result);
      return { success: true, ...result };
    } catch (error) {
      console.error('[IPC] ❌ Error en Test Game:', error.message);
      return { success: false, error: error.message };
    }
  });
}

module.exports = registerGameHandlers;
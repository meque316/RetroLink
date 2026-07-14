// electron/ipc/network.handlers.js

const {
  ipcMain,
} = require("electron");

const os = require("os");
const path = require("path");

const gamesPath = path.join(
  __dirname,
  "../games/index.js"
);

const {
  getGame,
} = require(gamesPath);

const {
  checkPort,
  openUPnP,
} = require("../network/utils");

let savedHostIP = null;

function registerNetworkHandlers() {
  ipcMain.handle(
    "prepare-host",
    async (_, port, gameId) => {
      const game = getGame(gameId);

      const targetPort =
        port ||
        game?.defaultPort ||
        27960;

      const portAvailable =
        await checkPort(targetPort);

      const upnp =
        await openUPnP(targetPort);

      return {
        portAvailable,
        upnpSuccess: upnp.success,
        port: targetPort,
      };
    }
  );

  ipcMain.handle(
    "get-local-ips",
    async () => {
      try {
        const interfaces =
          os.networkInterfaces();

        const result = [];

        for (
          const name of
          Object.keys(interfaces)
        ) {
          for (
            const network of
            interfaces[name] || []
          ) {
            if (
              network.family ===
                "IPv4" &&
              !network.internal
            ) {
              result.push({
                name,
                address:
                  network.address,
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
    }
  );

  ipcMain.handle(
    "set-host-ip",
    async (_, ip) => {
      console.log(
        `[IPC] Host IP configurada manualmente: ${ip}`
      );

      savedHostIP = ip;

      return {
        success: true,
      };
    }
  );

  ipcMain.handle(
    "get-host-ip",
    async () => {
      return savedHostIP;
    }
  );
}

module.exports =
  registerNetworkHandlers;
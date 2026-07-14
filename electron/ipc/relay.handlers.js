// electron/ipc/relay.handlers.js

const {
  ipcMain,
} = require("electron");

const {
  getBridge,
  setActiveBridge,
  getActiveBridge,
  clearActiveBridge,
} = require("../bridge/bridge-registry");

function registerRelayHandlers() {
  ipcMain.handle(
    "start-relay",
    async (
      _,
      roomId,
      isHost,
      gameId
    ) => {
      try {
        console.log(
          "[Handlers] start-relay llamado:",
          {
            roomId,
            isHost,
            gameId,
          }
        );

        const bridge =
          getBridge(gameId);

        setActiveBridge(bridge);

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
    "stop-relay",
    async () => {
      const bridge =
        getActiveBridge();

      bridge.resetBridge();

      clearActiveBridge();

      return {
        success: true,
      };
    }
  );

  ipcMain.handle(
    "get-bridge-state",
    async () => {
      try {
        const bridge =
          getActiveBridge();

        return bridge.getBridgeState();
      } catch (error) {
        console.error(
          "[IPC] Error getting bridge state:",
          error
        );

        return null;
      }
    }
  );

  ipcMain.handle(
    "get-client-port",
    async () => {
      const bridge =
        getActiveBridge();

      return bridge.getClientPort();
    }
  );
}

module.exports = registerRelayHandlers;
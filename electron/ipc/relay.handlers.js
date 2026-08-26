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

const { getRealGameId } = require("../games/index.js");

// ===== NUEVO: Puertos por defecto según el juego =====
const GAME_PORTS = {
  dow_soulstorm: 6112,
  aom: 2300,
  swgb: 2300,
  quake3: 27960,
  cs16: 27015,
  ut99: 7777,
  carmageddon2: 2300,
};
// ===== FIN NUEVO =====

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

        // Normalizar gameId
        let realGameId = getRealGameId(gameId);
        if (!realGameId) {
          const normalizedId = gameId.toLowerCase().trim().replace(/\s+/g, ' ');
          realGameId = getRealGameId(normalizedId);
        }
        if (!realGameId) {
          realGameId = gameId; // Fallback
        }
        console.log(`[Handlers] gameId normalizado: "${gameId}" → "${realGameId}"`);

        const bridge = getBridge(realGameId);

        setActiveBridge(bridge, realGameId);

        return await bridge.startBridge(
          roomId,
          isHost,
          realGameId
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

      if (bridge && typeof bridge.resetBridge === 'function') {
        bridge.resetBridge();
      }

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

        if (!bridge) {
          return null;
        }

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

  // ===== MODIFICADO: get-client-port con gameId y fallback =====
  ipcMain.handle(
    "get-client-port",
    async (_, gameId) => {
      try {
        console.log("[Handlers] get-client-port llamado para:", gameId);

        const bridge = getActiveBridge();

        // 1. Si tenemos bridge activo, preguntarle por el puerto
        if (bridge && typeof bridge.getClientPort === 'function') {
          const port = bridge.getClientPort();
          if (port) {
            console.log("[Handlers] Puerto del bridge:", port);
            return port;
          }
        }

        // 2. Fallback: puerto por defecto según el juego
        const defaultPort = GAME_PORTS[gameId] || 6112;
        console.log("[Handlers] Puerto por defecto para", gameId, ":", defaultPort);
        return defaultPort;
      } catch (error) {
        console.error("[Handlers] Error en get-client-port:", error);
        return 6112;
      }
    }
  );
  // ===== FIN MODIFICADO =====
}

module.exports = registerRelayHandlers;
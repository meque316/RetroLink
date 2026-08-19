// electron/bridge/aom/channel-handlers.js

const { BrowserWindow } = require('electron');

function getDebugStateId(state) {
  globalThis.__RETROLINK_STATE_IDS__ ||=
    new WeakMap();

  globalThis.__RETROLINK_STATE_ID_COUNTER__ ||=
    0;

  if (
    state &&
    typeof state === "object" &&
    !globalThis.__RETROLINK_STATE_IDS__.has(state)
  ) {
    globalThis.__RETROLINK_STATE_ID_COUNTER__ += 1;

    globalThis.__RETROLINK_STATE_IDS__.set(
      state,
      globalThis.__RETROLINK_STATE_ID_COUNTER__
    );
  }

  return state &&
    typeof state === "object"
      ? globalThis.__RETROLINK_STATE_IDS__.get(state)
      : null;
}

function createChannelHandlers() {
  let deps = null;

  function initializeChannelHandlers(
    injectedDeps
  ) {
    deps = injectedDeps;
  }

  function handleChannelMessage(
    message,
    socketId = null
  ) {
    const state =
      deps.getState();

    const buffer =
      deps.normalizeMessage(message);

    if (deps.isKeepAlive(buffer)) {
      return;
    }

    if (state.isHost) {
      const client =
        state.clients.get(socketId);

      client?.transportManager
        ?.handleWebRTCMessage(buffer);

      return;
    }

    state.transportManager
      ?.handleWebRTCMessage(buffer);
  }

  function onHostChannelOpen(
    socketId,
    channel
  ) {
    const state =
      deps.getState();

    // ===== Callback para NetBIOS =====
    // Este callback se ejecuta cuando el proxy UDP detecta tráfico NetBIOS
    const netBIOSCallback = (buffer, remoteInfo) => {
      console.log(
        `[Bridge-AoM] NetBIOS detectado desde ${remoteInfo.address}:${remoteInfo.port}, ` +
        `reenviando a ${state.clients.size} clientes`
      );

      // Reenviar a todos los clientes conectados (excepto el que envió)
      for (const [otherSocketId, otherClient] of state.clients) {
        if (otherSocketId !== socketId && otherClient.transportManager) {
          try {
            otherClient.transportManager.send(buffer);
            console.log(`[Bridge-AoM] NetBIOS reenviado a ${otherSocketId}`);
          } catch (error) {
            console.error(
              `[Bridge-AoM] Error reenviando NetBIOS a ${otherSocketId}:`,
              error.message
            );
          }
        }
      }
    };
    // ===== FIN Callback NetBIOS =====

    // Pasar el callback a ensureHostTransportResources
    const client = deps.ensureHostTransportResources(
      socketId,
      {
        onNetBIOS: netBIOSCallback
      }
    );

    if (!client) {
      return;
    }

    console.log(
      `[Bridge-AoM] DataChannel host abierto para ${socketId}`
    );

    client.channel =
      channel;

    client.transportManager.useWebRTC(
      channel
    );

    if (client.iceTimeoutHandle) {
      clearTimeout(
        client.iceTimeoutHandle
      );

      client.iceTimeoutHandle =
        null;

      console.log(
        `[Bridge-AoM] Watchdog ICE cancelado para ${socketId} (DataChannel abierto).`
      );
    }

    if (client.relayTransport) {
      client.transportManager.disableRelay();

      client.relayTransport =
        null;
    }

    client.switchingToRelay =
      false;

    deps.startKeepAlive(
      socketId,
      channel
    );

    const connected =
      [
        ...state.clients.values(),
      ].filter(
        (item) =>
          item.transportManager
            ?.isWebRTCOpen() ||
          item.transportManager
            ?.isRelayOpen()
      ).length;

    deps.sendStatus(
      `¡${connected} jugador(es) conectado(s)! Listos para jugar.`
    );

    console.log(
      `[Bridge-AoM] NetBIOS reenvío configurado para ${socketId}`
    );
  }

  function onClientChannelOpen() {
    const state =
      deps.getState();

    const stateDebugId =
      getDebugStateId(state);

    console.log(
      `[AoM-CLIENT-OPEN 1] DataChannel cliente abierto; puerto=${state.clientPort}`,
      {
        stateDebugId,
        clientPort:
          state.clientPort,

        hasChannel:
          Boolean(state.channel),

        hasTransportManager:
          Boolean(
            state.transportManager
          ),

        hasUDPTransport:
          Boolean(
            state.udpTransport
          ),

        iceState:
          state.iceConnectionState,
      }
    );

    if (!state.clientPort) {
      console.error(
        "[AoM-CLIENT-OPEN ERROR] No se recibió clientPort."
      );

      deps.sendStatus(
        "Error: no se recibió el puerto local del cliente."
      );

      return;
    }

    // Enviar el puerto al frontend
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('client-port-update', state.clientPort);
        console.log(
          `[AoM] Puerto ${state.clientPort} enviado al frontend`
        );
      }
    } catch (error) {
      console.error('[AoM] Error enviando puerto al frontend:', error.message);
    }

    deps.ensureClientTransportResources();

    const stateAfter =
      deps.getState();

    console.log(
      "[AoM-CLIENT-OPEN 2] Recursos de transporte preparados.",
      {
        stateDebugId:
          getDebugStateId(
            stateAfter
          ),

        clientPort:
          stateAfter.clientPort,

        hasTransportManager:
          Boolean(
            stateAfter.transportManager
          ),

        hasUDPTransport:
          Boolean(
            stateAfter.udpTransport
          ),
      }
    );

    state.transportManager.useWebRTC(
      state.channel
    );

    if (state.iceTimeoutHandle) {
      clearTimeout(
        state.iceTimeoutHandle
      );

      state.iceTimeoutHandle =
        null;
    }

    if (state.relayTransport) {
      state.transportManager.disableRelay();

      state.relayTransport =
        null;
    }

    state.switchingToRelay =
      false;

    deps.startKeepAlive(
      "self",
      state.channel
    );

    deps.sendStatus(
      "¡Conexión P2P establecida! Listos para jugar."
    );

    console.log(
      "[AoM-CLIENT-OPEN] Cliente completamente inicializado."
    );

    // ===== NUEVO: El cliente debe recibir NetBIOS =====
    if (state.transportManager && state.udpTransport) {
      console.log(`[Bridge-AoM] Cliente configurado para recibir NetBIOS`);

      const transportManager = state.transportManager;
      const udpTransport = state.udpTransport;

      // Usar el nuevo método onReceive
      if (typeof transportManager.onReceive === 'function') {
        transportManager.onReceive((buffer, metadata) => {
          try {
            // Reenviar al juego local
            udpTransport.sendToGame(buffer);
            console.log(`[Bridge-AoM] NetBIOS reenviado al juego local`);
          } catch (error) {
            console.error(`[Bridge-AoM] Error reenviando NetBIOS al juego local:`, error.message);
          }
        });
        console.log(`[Bridge-AoM] ✅ Cliente configurado con onReceive para NetBIOS`);
      } else {
        console.warn(`[Bridge-AoM] ⚠️ transportManager no tiene método onReceive, NetBIOS puede no funcionar en el cliente`);
      }
    }
    // ===== FIN NUEVO =====
  }

  return {
    initializeChannelHandlers,
    handleChannelMessage,
    onHostChannelOpen,
    onClientChannelOpen,
  };
}

module.exports = {
  createChannelHandlers,
};
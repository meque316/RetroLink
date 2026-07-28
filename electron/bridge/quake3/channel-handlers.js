function onClientChannelOpen() {
  const state = deps.getState();

  console.log(
    `[CLIENT-OPEN 1] DataChannel cliente abierto; puerto=${state.clientPort}`,
    {
      clientPort: state.clientPort,
      hasChannel: Boolean(state.channel),
      hasTransportManager: Boolean(state.transportManager),
      hasUDPTransport: Boolean(state.udpTransport),
      iceState: state.iceConnectionState,
    }
  );

  if (!state.clientPort) {
    console.error(
      "[CLIENT-OPEN ERROR] No se recibió clientPort."
    );

    deps.sendStatus(
      "Error: no se recibió el puerto local del cliente."
    );

    return;
  }

  console.log(
    "[CLIENT-OPEN 2] Llamando ensureClientTransportResources()..."
  );

  deps.ensureClientTransportResources();

  console.log(
    "[CLIENT-OPEN 3] ensureClientTransportResources() completado.",
    {
      hasTransportManager: Boolean(state.transportManager),
      hasUDPTransport: Boolean(state.udpTransport),
    }
  );

  console.log(
    "[CLIENT-OPEN 4] Llamando transportManager.useWebRTC()..."
  );

  state.transportManager.useWebRTC(
    state.channel
  );

  console.log(
    "[CLIENT-OPEN 5] useWebRTC() completado."
  );

  /*
   * El DataChannel ya está abierto: el watchdog ICE ya
   * no tiene motivo para disparar.
   */
  if (state.iceTimeoutHandle) {
    clearTimeout(
      state.iceTimeoutHandle
    );

    state.iceTimeoutHandle = null;

    console.log(
      "[CLIENT-OPEN 6] Watchdog ICE cancelado."
    );
  } else {
    console.log(
      "[CLIENT-OPEN 6] No había watchdog ICE activo."
    );
  }

  /*
   * Si veníamos usando Relay volvemos a WebRTC.
   */
  if (state.relayTransport) {
    console.log(
      "[CLIENT-OPEN 7] Deshabilitando Relay..."
    );

    state.transportManager.disableRelay();

    state.relayTransport = null;
  }

  state.switchingToRelay = false;

  console.log(
    "[CLIENT-OPEN 8] Iniciando KeepAlive..."
  );

  deps.startKeepAlive(
    "self",
    state.channel
  );

  console.log(
    "[CLIENT-OPEN 9] KeepAlive iniciado."
  );

  deps.sendStatus(
    "¡Conexión P2P establecida! Listos para jugar."
  );

  console.log(
    "[CLIENT-OPEN 10] Cliente completamente inicializado."
  );
}
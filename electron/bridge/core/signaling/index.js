// electron/bridge/core/signaling/index.js

function configureSignaling({
  signaling,
  NDC,
  getState,
  sendStatus,
  getLocalIP,
  getNextClientPort,
  createHostPeer,
  createClientPeer,
  flushHostCandidates,
  flushClientCandidates,
  cleanupClient,
}) {
  if (!signaling) {
    throw new Error("[Core-Signaling] signaling es obligatorio.");
  }

  if (typeof getState !== "function") {
    throw new Error("[Core-Signaling] getState debe ser una función.");
  }

  signaling.on("connect_error", (error) => {
    console.error("[Core-Signaling] Error de señalización:", error.message);
    sendStatus("Error al conectar al servidor de señales.");
  });

  signaling.on("connect", () => {
    const state = getState();

    console.log("[Core-Signaling] Signaling conectado:", signaling.id);

    // ===== NUEVO: Asignar hostIP si es el host =====
    if (state.isHost) {
      state.hostIP = getLocalIP();
      console.log("[Core-Signaling] 🏠 Host IP establecida:", state.hostIP);
    } else {
      console.log("[Core-Signaling] Cliente conectado, esperando IP del host...");
    }
    // ===== FIN NUEVO =====

    signaling.emit(
      "webrtc-join",
      {
        roomId: state.roomId,
        isHost: state.isHost,
        hostIP: state.hostIP,
      },
      () => {
        sendStatus(
          state.isHost
            ? "Esperando jugadores..."
            : "Buscando rival en la sala..."
        );
      }
    );
  });

  signaling.on("webrtc-host-ip", ({ hostIP } = {}) => {
    const state = getState();

    if (!state.isHost && hostIP) {
      state.hostIP = hostIP;
      console.log("[Core-Signaling] 📥 Cliente recibió Host IP:", hostIP);
    }
  });

  signaling.on("webrtc-peer-ready", ({ fromSocketId } = {}) => {
    const state = getState();

    console.log("[DEBUG-SIGNALING] webrtc-peer-ready recibido:", {
      fromSocketId,
      roomId: state.roomId,
      isHost: state.isHost,
      clientsCount: state.clients?.size,
    });

    if (!state.isHost || !fromSocketId || state.clients.has(fromSocketId)) {
      console.log("[DEBUG-SIGNALING] webrtc-peer-ready ignorado.");
      return;
    }

    // ===== NUEVO: Enviar la IP del host al cliente que se está uniendo =====
    if (state.hostIP) {
      console.log("[DEBUG-SIGNALING] 📤 Enviando Host IP al cliente:", state.hostIP);
      signaling.emit("webrtc-host-ip", {
        hostIP: state.hostIP,
      });
    } else {
      console.warn("[DEBUG-SIGNALING] ⚠️ No hay Host IP para enviar al cliente");
    }
    // ===== FIN NUEVO =====

    const clientPort = getNextClientPort(state);

    console.log("[DEBUG-SIGNALING] Puerto virtual calculado:", {
      fromSocketId,
      clientPort,
    });

    if (!clientPort) {
      sendStatus("La sala alcanzó su máximo de jugadores.");
      return;
    }

    state.clients.set(fromSocketId, {
      peer: null,
      channel: null,
      udpTransport: null,
      transportManager: null,
      relayTransport: null,
      switchingToRelay: false,

      clientPort,

      pendingCandidates: [],
      remoteDescSet: false,

      iceConnectionState: null,
      iceTimeoutHandle: null,

      gatheredCandidateTypes: new Set(),
    });

    console.log("[DEBUG-SIGNALING] Cliente agregado a state.clients:", {
      fromSocketId,
      clientPort,
      clientsCount: state.clients.size,
    });

    sendStatus("Rival encontrado. Creando conexión P2P...");

    try {
      console.log("[DEBUG-SIGNALING] Llamando createHostPeer...", {
        fromSocketId,
        roomId: state.roomId,
      });

      createHostPeer(NDC, signaling, fromSocketId);

      console.log("[DEBUG-SIGNALING] createHostPeer terminó sin lanzar error:", fromSocketId);
    } catch (error) {
      console.error("[DEBUG-SIGNALING] Error ejecutando createHostPeer:", error);
      sendStatus(`Error creando peer host: ${error.message}`);
    }
  });

  signaling.on("webrtc-client-port", ({ port } = {}) => {
    const state = getState();

    console.log("[DEBUG-SIGNALING] webrtc-client-port recibido:", {
      port,
      isHost: state.isHost,
      roomId: state.roomId,
    });

    if (!state.isHost && Number.isInteger(port)) {
      state.clientPort = port;
      console.log(`[Core-Signaling] Puerto cliente asignado: ${port}`);
    }
  });

  signaling.on("webrtc-signal", (payload = {}) => {
    const { type, sdp, candidate, mid, fromSocketId } = payload;
    const state = getState();

    console.log("[DEBUG-SIGNALING] webrtc-signal recibido:", {
      type,
      fromSocketId,
      roomId: state.roomId,
      isHost: state.isHost,
      hasSdp: typeof sdp === "string",
      sdpLength: typeof sdp === "string" ? sdp.length : null,
      hasCandidate: Boolean(candidate),
      mid,
    });

    try {
      if (state.isHost) {
        const client = state.clients.get(fromSocketId);

        if (!client) {
          console.warn("[DEBUG-SIGNALING] Señal host ignorada: cliente no encontrado.", {
            fromSocketId,
            type,
            clientsCount: state.clients.size,
          });
          return;
        }

        if (type === "answer") {
          console.log("[DEBUG-SIGNALING] Host procesando answer:", fromSocketId);
          client.peer.setRemoteDescription(sdp, "answer");
          client.remoteDescSet = true;
          flushHostCandidates(fromSocketId);
          console.log("[DEBUG-SIGNALING] Answer aplicada correctamente:", fromSocketId);
          return;
        }

        if (type === "candidate") {
          client.pendingCandidates.push({ candidate, mid });
          console.log("[DEBUG-SIGNALING] Candidate host encolado:", {
            fromSocketId,
            pendingCandidates: client.pendingCandidates.length,
          });
          flushHostCandidates(fromSocketId);
        }

        return;
      }

      if (type === "offer") {
        console.log("[DEBUG-SIGNALING] Cliente procesando offer:", {
          roomId: state.roomId,
          peerAlreadyExists: Boolean(state.peer),
        });

        if (!state.peer) {
          console.log("[DEBUG-SIGNALING] Creando peer cliente...");
          createClientPeer(NDC, signaling);
          console.log("[DEBUG-SIGNALING] createClientPeer terminó sin lanzar error.");
        }

        sendStatus("Procesando oferta de conexión...");

        state.peer.setRemoteDescription(sdp, "offer");
        console.log("[DEBUG-SIGNALING] Oferta aplicada al peer cliente.");
        state.remoteDescSet = true;
        flushClientCandidates();
        console.log("[DEBUG-SIGNALING] Candidates cliente procesados tras la oferta.");
        return;
      }

      if (type === "candidate") {
        state.pendingCandidates.push({ candidate, mid });
        console.log("[DEBUG-SIGNALING] Candidate cliente encolado:", {
          pendingCandidates: state.pendingCandidates.length,
        });
        flushClientCandidates();
      }
    } catch (error) {
      console.error("[Core-Signaling] Error procesando señal:", error);
      sendStatus(`Error procesando señal: ${error.message}`);
    }
  });

  signaling.on("webrtc-client-left", ({ socketId } = {}) => {
    const state = getState();

    console.log("[DEBUG-SIGNALING] webrtc-client-left recibido:", {
      socketId,
      isHost: state.isHost,
      roomId: state.roomId,
    });

    if (!state.isHost || !socketId) {
      return;
    }

    cleanupClient(socketId);

    sendStatus(
      state.clients.size > 0
        ? `${state.clients.size} jugador(es) conectado(s)`
        : "Esperando jugadores..."
    );
  });
}

module.exports = {
  configureSignaling,
};
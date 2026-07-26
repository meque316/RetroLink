// electron/bridge/quake3/peer.js
// (Módulo genérico del motor de peers WebRTC. Será trasladado a
//  electron/bridge/core/peer.js — la API pública ya queda estable
//  desde ahora. No contiene referencias específicas a ningún juego;
//  los nombres de PeerConnection y el prefijo de logs se reciben
//  mediante `deps`.)

let deps = null;

function initialize(injectedDeps) {
  deps = injectedDeps;
}

function flushHostCandidates(
  socketId
) {
  const state = deps.getState();

  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  client.pendingCandidates =
    deps.flushCandidateQueue({
      peer: client.peer,
      remoteDescSet:
        client.remoteDescSet,
      candidates:
        client.pendingCandidates,
      label: `host/${socketId}`,
    });
}

function flushClientCandidates() {
  const state = deps.getState();

  state.pendingCandidates =
    deps.flushCandidateQueue({
      peer: state.peer,
      remoteDescSet:
        state.remoteDescSet,
      candidates:
        state.pendingCandidates,
      label: "cliente",
    });
}

function createHost(
  NDC,
  signaling,
  socketId
) {
  const state = deps.getState();

  const client =
    state.clients.get(socketId);

  if (!client) {
    return;
  }

  const peer =
    new NDC.PeerConnection(
      `${deps.peerNamePrefix}-Host-${socketId}`,
      {
        iceServers:
          deps.buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  client.peer = peer;

  deps.createHostWatchdog(
    socketId,
    client
  );

  peer.onStateChange(
    (connectionState) => {
      client.iceConnectionState =
        connectionState;

      console.log(
        `${deps.logPrefix} Estado peer host ${socketId}: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        deps.clearClientTimeout(client);

        deps.sendStatus(
          "Conexión P2P establecida con el cliente."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        /*
         * Evita fallback duplicado si el watchdog ya
         * activó Relay para este cliente.
         */
        if (
          client.switchingToRelay ||
          client.transportManager
            ?.isRelayOpen() ||
          deps.isRelayActiveOrConnecting(
            client.relayTransport
          )
        ) {
          return;
        }

        deps.clearClientTimeout(client);

        client.transportManager
          ?.disableWebRTC();

        const relayStarted =
          deps.activateHostRelay(
            socketId,
            "ice-failed"
          );

        if (relayStarted) {
          deps.closeHostWebRTCResources(
            socketId,
            client
          );
        }

        deps.sendStatus(
          relayStarted
            ? "Falló P2P. Intentando conexión mediante Relay..."
            : "Falló la conexión P2P con el cliente."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `${deps.logPrefix} Gathering host ${socketId}: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        deps.logGatheringResult(
          `Host/${socketId}`,
          client.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
          toSocketId:
            socketId,
        }
      );

      signaling.emit(
        "webrtc-client-port",
        {
          roomId:
            state.roomId,
          port:
            client.clientPort,
          toSocketId:
            socketId,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        deps.getCandidateType(candidate);

      client.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `${deps.logPrefix} Candidato host ${socketId} [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
          toSocketId:
            socketId,
        }
      );
    }
  );

  const channel =
    peer.createDataChannel(
      "game",
      {
        ordered: true,
      }
    );

  client.channel = channel;

  channel.onOpen(() => {
    deps.onHostChannelOpen(
      socketId,
      channel
    );
  });

  channel.onMessage((message) => {
    deps.handleChannelMessage(
      message,
      socketId
    );
  });

  channel.onClosed(() => {
    console.log(
      `${deps.logPrefix} Canal cerrado: ${socketId}`
    );

    deps.stopKeepAlive(socketId);

    client.transportManager
      ?.disableWebRTC();

    client.channel = null;

    const relayUsable =
      Boolean(
        client.transportManager
          ?.isRelayOpen()
      ) ||
      client.switchingToRelay ||
      deps.isRelayActiveOrConnecting(
        client.relayTransport
      );

    /*
     * Si el relay sigue disponible o intentando conectar,
     * NO destruimos el cliente: la salida real del jugador
     * se maneja mediante "webrtc-client-left".
     */
    if (!relayUsable) {
      deps.cleanupClient(socketId);
    }

    const connected =
      [...state.clients.values()].filter(
        (item) =>
          item.transportManager
            ?.isWebRTCOpen() ||
          item.transportManager
            ?.isRelayOpen()
      ).length;

    deps.sendStatus(
      connected > 0
        ? `${connected} jugador(es) conectado(s)`
        : relayUsable
          ? "Conexión WebRTC cerrada. Usando Relay..."
          : "Esperando jugadores..."
    );
  });

  channel.onError((error) => {
    console.error(
      `${deps.logPrefix} Error DataChannel ${socketId}:`,
      error
    );
  });

  /*
   * El host debe iniciar la oferta.
   */
  setTimeout(() => {
    try {
      peer.setLocalDescription();
    } catch (error) {
      console.error(
        `${deps.logPrefix} Error creando oferta para ${socketId}:`,
        error.message
      );

      deps.cleanupClient(socketId);
    }
  }, 200);
}

function createClient(
  NDC,
  signaling
) {
  const state = deps.getState();

  const peer =
    new NDC.PeerConnection(
      `${deps.peerNamePrefix}-Client`,
      {
        iceServers:
          deps.buildIceServers(),
        iceTransportPolicy: "all",
      }
    );

  state.peer = peer;

  deps.createClientWatchdog();

  peer.onStateChange(
    (connectionState) => {
      state.iceConnectionState =
        connectionState;

      console.log(
        `${deps.logPrefix} Estado peer cliente: ${connectionState}`
      );

      if (
        connectionState ===
          "connected" ||
        connectionState ===
          "completed"
      ) {
        if (
          state.iceTimeoutHandle
        ) {
          clearTimeout(
            state.iceTimeoutHandle
          );

          state.iceTimeoutHandle =
            null;
        }

        deps.sendStatus(
          "Conexión P2P establecida."
        );
      }

      if (
        connectionState ===
        "failed"
      ) {
        /*
         * Evita fallback duplicado si el watchdog ya
         * activó Relay.
         */
        if (
          state.switchingToRelay ||
          state.transportManager
            ?.isRelayOpen() ||
          deps.isRelayActiveOrConnecting(
            state.relayTransport
          )
        ) {
          return;
        }

        if (
          state.iceTimeoutHandle
        ) {
          clearTimeout(
            state.iceTimeoutHandle
          );

          state.iceTimeoutHandle =
            null;
        }

        state.transportManager
          ?.disableWebRTC();

        const relayStarted =
          deps.activateClientRelay(
            "ice-failed"
          );

        if (relayStarted) {
          deps.closeClientWebRTCResources();
        }

        deps.sendStatus(
          relayStarted
            ? "Falló P2P. Intentando conexión mediante Relay..."
            : "Falló la conexión P2P."
        );
      }
    }
  );

  peer.onGatheringStateChange(
    (gatheringState) => {
      console.log(
        `${deps.logPrefix} Gathering cliente: ${gatheringState}`
      );

      if (
        gatheringState ===
        "complete"
      ) {
        deps.logGatheringResult(
          "Cliente",
          state.gatheredCandidateTypes
        );
      }
    }
  );

  peer.onLocalDescription(
    (sdp, type) => {
      console.log(
        `${deps.logPrefix} Descripción local cliente: ${type}`
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type,
          sdp,
        }
      );
    }
  );

  peer.onLocalCandidate(
    (candidate, mid) => {
      const type =
        deps.getCandidateType(candidate);

      state.gatheredCandidateTypes.add(
        type
      );

      console.log(
        `${deps.logPrefix} Candidato cliente [${type}]:`,
        candidate
      );

      signaling.emit(
        "webrtc-signal",
        {
          roomId:
            state.roomId,
          type: "candidate",
          candidate,
          mid,
        }
      );
    }
  );

  peer.onDataChannel((channel) => {
    state.channel = channel;

    channel.onOpen(
      deps.onClientChannelOpen
    );

    channel.onMessage(
      deps.handleChannelMessage
    );

    channel.onClosed(() => {
      deps.stopKeepAlive("self");

      state.transportManager
        ?.disableWebRTC();

      state.channel = null;

      const relayUsable =
        Boolean(
          state.transportManager
            ?.isRelayOpen()
        ) ||
        state.switchingToRelay ||
        deps.isRelayActiveOrConnecting(
          state.relayTransport
        );

      /*
       * No cerramos TransportManager, UDP ni Relay: si el
       * relay está activo o conectando, la partida sigue
       * funcionando.
       */
      deps.sendStatus(
        relayUsable
          ? "Conexión P2P cerrada. Usando Relay."
          : "Conexión P2P cerrada."
      );
    });

    channel.onError((error) => {
      console.error(
        `${deps.logPrefix} Error DataChannel cliente:`,
        error
      );
    });
  });
}

const peer = {
  initialize,
  createHost,
  createClient,
  flushHostCandidates,
  flushClientCandidates,
};

module.exports = {
  peer,
};

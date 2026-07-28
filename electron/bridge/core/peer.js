// electron/bridge/quake3/peer.js
// (Módulo genérico del motor de peers WebRTC. Será trasladado a
//  electron/bridge/core/peer.js — la API pública ya queda estable
//  desde ahora. No contiene referencias específicas a ningún juego;
//  los nombres de PeerConnection y el prefijo de logs se reciben
//  mediante `deps`.)

function createPeerModule() {
  let deps = null;

  function initialize(injectedDeps) {
    deps = injectedDeps;

    console.log(
      "[DEBUG-PEER] initialize() ejecutado:",
      {
        peerNamePrefix:
          injectedDeps?.peerNamePrefix,
        logPrefix:
          injectedDeps?.logPrefix,
        hasGetState:
          typeof injectedDeps?.getState ===
          "function",
        hasSendStatus:
          typeof injectedDeps?.sendStatus ===
          "function",
      }
    );
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
    console.log(
      "[DEBUG-PEER] createHost() iniciado:",
      {
        socketId,
        hasDeps: Boolean(deps),
        hasNDC: Boolean(NDC),
        hasPeerConnection:
          typeof NDC?.PeerConnection ===
          "function",
        hasSignaling:
          Boolean(signaling),
        signalingId:
          signaling?.id,
      }
    );

    if (!deps) {
      console.error(
        "[DEBUG-PEER] peer.initialize() no fue ejecutado."
      );

      return;
    }

    const state = deps.getState();

    console.log(
      "[DEBUG-PEER] Estado obtenido en createHost():",
      {
        roomId:
          state?.roomId,
        isHost:
          state?.isHost,
        clientsCount:
          state?.clients?.size,
        clientExists:
          Boolean(
            state?.clients?.has(
              socketId
            )
          ),
        peerNamePrefix:
          deps.peerNamePrefix,
        logPrefix:
          deps.logPrefix,
      }
    );

    const client =
      state.clients.get(socketId);

    if (!client) {
      console.error(
        "[DEBUG-PEER] Cliente no encontrado en state.clients:",
        {
          socketId,
          roomId:
            state?.roomId,
          clients:
            state?.clients
              ? [
                  ...state.clients.keys(),
                ]
              : null,
        }
      );

      return;
    }

    console.log(
      "[DEBUG-PEER] Creando PeerConnection host:",
      {
        socketId,
        peerName:
          `${deps.peerNamePrefix}-Host-${socketId}`,
        roomId:
          state.roomId,
        clientPort:
          client.clientPort,
      }
    );

    const peer =
      new NDC.PeerConnection(
        `${deps.peerNamePrefix}-Host-${socketId}`,
        {
          iceServers:
            deps.buildIceServers(),
          iceTransportPolicy: "all",
        }
      );

    console.log(
      "[DEBUG-PEER] PeerConnection host creado:",
      socketId
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
        const state = deps.getState();

        console.log(
          "[DEBUG-PEER] Descripción local host generada:",
          {
            socketId,
            roomId:
              state.roomId,
            type,
            sdpLength:
              typeof sdp === "string"
                ? sdp.length
                : null,
            signalingConnected:
              signaling?.connected,
            signalingId:
              signaling?.id,
          }
        );

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

        console.log(
          "[DEBUG-PEER] webrtc-signal enviado al servidor:",
          {
            socketId,
            roomId:
              state.roomId,
            type,
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

        console.log(
          "[DEBUG-PEER] webrtc-client-port enviado:",
          {
            socketId,
            roomId:
              state.roomId,
            port:
              client.clientPort,
          }
        );
      }
    );

    peer.onLocalCandidate(
      (candidate, mid) => {
        const state = deps.getState();

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

    console.log(
      "[DEBUG-PEER] Creando DataChannel host:",
      socketId
    );

    const channel =
      peer.createDataChannel(
        "game",
        {
          ordered: true,
        }
      );

    client.channel = channel;

    console.log(
      "[DEBUG-PEER] DataChannel host creado:",
      {
        socketId,
        clientPort:
          client.clientPort,
      }
    );

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
      const state = deps.getState();

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
    console.log(
      "[DEBUG-PEER] DataChannel configurado. Programando oferta en 200 ms:",
      {
        socketId,
        roomId:
          state.roomId,
        clientPort:
          client.clientPort,
        peerNamePrefix:
          deps.peerNamePrefix,
        logPrefix:
          deps.logPrefix,
      }
    );

    setTimeout(() => {
      console.log(
        "[DEBUG-PEER] Timeout ejecutado. Llamando setLocalDescription():",
        {
          socketId,
          roomId:
            state.roomId,
          clientStillExists:
            state.clients.has(
              socketId
            ),
          signalingConnected:
            signaling?.connected,
        }
      );

      try {
        const result =
          peer.setLocalDescription();

        console.log(
          "[DEBUG-PEER] setLocalDescription() ejecutado sin excepción:",
          {
            socketId,
            resultType:
              typeof result,
          }
        );
      } catch (error) {
        console.error(
          `[DEBUG-PEER] Error creando oferta para ${socketId}:`,
          error
        );

        deps.cleanupClient(socketId);
      }
    }, 200);
  }

  function createClient(
    NDC,
    signaling
  ) {
    console.log(
      "[DEBUG-PEER] createClient() iniciado:",
      {
        hasDeps:
          Boolean(deps),
        hasNDC:
          Boolean(NDC),
        hasPeerConnection:
          typeof NDC?.PeerConnection ===
          "function",
        hasSignaling:
          Boolean(signaling),
        signalingId:
          signaling?.id,
      }
    );

    if (!deps) {
      console.error(
        "[DEBUG-PEER] peer.initialize() no fue ejecutado antes de createClient()."
      );

      return;
    }

    const state = deps.getState();

    console.log(
      "[DEBUG-PEER] Estado obtenido en createClient():",
      {
        roomId:
          state?.roomId,
        isHost:
          state?.isHost,
        peerAlreadyExists:
          Boolean(
            state?.peer
          ),
        peerNamePrefix:
          deps.peerNamePrefix,
        logPrefix:
          deps.logPrefix,
      }
    );

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
        /*
         * Se relee el estado actual en el momento del evento
         * en vez de usar la referencia cerrada al crear el
         * peer, para evitar escribir sobre un estado huérfano
         * si hubo un resetBridge() de por medio.
         */
        const state = deps.getState();

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
        const state = deps.getState();

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
        const state = deps.getState();

        console.log(
          `${deps.logPrefix} Descripción local cliente: ${type}`
        );

        console.log(
          "[DEBUG-PEER] Descripción local cliente generada:",
          {
            roomId:
              state.roomId,
            type,
            sdpLength:
              typeof sdp === "string"
                ? sdp.length
                : null,
            signalingConnected:
              signaling?.connected,
            signalingId:
              signaling?.id,
          }
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

        console.log(
          "[DEBUG-PEER] Señal cliente enviada al servidor:",
          {
            roomId:
              state.roomId,
            type,
          }
        );
      }
    );

    peer.onLocalCandidate(
      (candidate, mid) => {
        const state = deps.getState();

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
      const state = deps.getState();

      state.channel = channel;

      channel.onOpen(() => {
        deps.onClientChannelOpen();
      });

      channel.onMessage(
        deps.handleChannelMessage
      );

      channel.onClosed(() => {
        const state = deps.getState();

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

  return {
    initialize,
    createHost,
    createClient,
    flushHostCandidates,
    flushClientCandidates
  };
}

module.exports = {
  createPeerModule
};
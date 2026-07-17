// electron/bridge/quake3/socket-relay-transport.js

/*
 * Transporte Relay binario sobre un socket Socket.IO existente.
 *
 * Este módulo:
 *
 * - NO conoce Quake III.
 * - NO conoce UDP.
 * - NO conoce ICE.
 * - NO conoce PeerConnection.
 * - NO implementa fallback.
 * - NO crea ni desconecta el socket de señalización.
 *
 * Solamente activa/desactiva el relay de una sala y transporta
 * paquetes binarios mediante los eventos game-relay-*.
 */

const RELAY_STATE = Object.freeze({
  IDLE: "idle",
  CONNECTING: "connecting",
  OPEN: "open",
  CLOSED: "closed",
  ERROR: "error",
});

function toError(value) {
  if (value instanceof Error) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.message === "string"
  ) {
    return new Error(
      value.message
    );
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.error === "string"
  ) {
    return new Error(
      value.error
    );
  }

  return new Error(
    typeof value === "string"
      ? value
      : "Error desconocido del transporte relay."
  );
}

function normalizePacket(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (
    value instanceof ArrayBuffer
  ) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
  }

  /*
   * Socket.IO puede reconstruir buffers con esta forma
   * dependiendo del parser o de cómo viaje el objeto.
   */
  if (
    value &&
    value.type === "Buffer" &&
    Array.isArray(value.data)
  ) {
    return Buffer.from(
      value.data
    );
  }

  return null;
}

function createSocketRelayTransport(
  options = {}
) {
  const {
    socket,
    roomId,
    isHost = false,

    /*
     * En el host identifica al cliente remoto asociado
     * con este transporte.
     *
     * El cliente normalmente lo deja en null porque el
     * servidor dirige automáticamente su tráfico al host.
     */
    peerSocketId = null,

    reason = "ice-failed",

    onPacket = null,
    onConnected = null,
    onDisconnected = null,
    onError = null,
    onRateLimited = null,
  } = options;

  if (!socket) {
    throw new Error(
      "[GameRelay] Se requiere una instancia de Socket.IO."
    );
  }

  if (
    typeof roomId !== "string" ||
    !roomId.trim()
  ) {
    throw new Error(
      "[GameRelay] Se requiere un roomId válido."
    );
  }

  if (
    isHost &&
    peerSocketId !== null &&
    typeof peerSocketId !== "string"
  ) {
    throw new Error(
      "[GameRelay] peerSocketId debe ser string o null."
    );
  }

  const packetHandler =
    typeof onPacket === "function"
      ? onPacket
      : null;

  const connectedHandler =
    typeof onConnected === "function"
      ? onConnected
      : null;

  const disconnectedHandler =
    typeof onDisconnected === "function"
      ? onDisconnected
      : null;

  const errorHandler =
    typeof onError === "function"
      ? onError
      : null;

  const rateLimitedHandler =
    typeof onRateLimited === "function"
      ? onRateLimited
      : null;

  let relayState =
    RELAY_STATE.IDLE;

  let listenersBound = false;
  let manuallyClosed = false;

  const stats = {
    packetsSent: 0,
    bytesSent: 0,

    packetsReceived: 0,
    bytesReceived: 0,

    packetsDropped: 0,
    bytesDropped: 0,

    rateLimitNotices: 0,

    connectedAt: null,
    disconnectedAt: null,

    lastPacketSentAt: null,
    lastPacketReceivedAt: null,

    lastError: null,
  };

  function emitError(rawError) {
    const error =
      toError(rawError);

    stats.lastError = {
      message: error.message,
      at: Date.now(),
    };

    try {
      errorHandler?.(error);
    } catch {}
  }

  function setState(nextState) {
    relayState = nextState;
  }

  function markDisconnected(
    reasonValue = null
  ) {
    if (
      relayState ===
      RELAY_STATE.CLOSED
    ) {
      return;
    }

    setState(
      RELAY_STATE.CLOSED
    );

    stats.disconnectedAt =
      Date.now();

    try {
      disconnectedHandler?.(
        reasonValue
      );
    } catch {}
  }

  function getIncomingPacket(
    payload
  ) {
    if (
      Buffer.isBuffer(payload) ||
      payload instanceof
        ArrayBuffer ||
      ArrayBuffer.isView(payload)
    ) {
      return {
        roomId: null,
        sourceSocketId: null,
        packet: payload,
      };
    }

    if (
      !payload ||
      typeof payload !== "object"
    ) {
      return {
        roomId: null,
        sourceSocketId: null,
        packet: null,
      };
    }

    return {
      roomId:
        payload.roomId ?? null,

      /*
       * El backend debería enviar sourceSocketId.
       * Se acepta fromSocketId para tolerar implementaciones
       * anteriores o variantes del relay-store.
       */
      sourceSocketId:
        payload.sourceSocketId ??
        payload.fromSocketId ??
        null,

      packet:
        payload.packet ?? null,
    };
  }

  function handleRelayPacket(
    payload
  ) {
    if (
      relayState !==
      RELAY_STATE.OPEN
    ) {
      return;
    }

    const incoming =
      getIncomingPacket(payload);

    if (
      incoming.roomId &&
      incoming.roomId !== roomId
    ) {
      return;
    }

    /*
     * Cada TransportManager del host representa a un cliente.
     * Por eso solo debe aceptar paquetes provenientes del
     * socket remoto asociado.
     */
    if (
      isHost &&
      peerSocketId &&
      incoming.sourceSocketId &&
      incoming.sourceSocketId !==
        peerSocketId
    ) {
      return;
    }

    const buffer =
      normalizePacket(
        incoming.packet
      );

    if (!buffer) {
      stats.packetsDropped += 1;

      emitError(
        "Se recibió un paquete relay con formato inválido."
      );

      return;
    }

    if (buffer.length === 0) {
      stats.packetsDropped += 1;

      return;
    }

    stats.packetsReceived += 1;
    stats.bytesReceived +=
      buffer.length;

    stats.lastPacketReceivedAt =
      Date.now();

    if (!packetHandler) {
      return;
    }

    try {
      packetHandler(
        buffer,
        {
          roomId,
          sourceSocketId:
            incoming.sourceSocketId,
        }
      );
    } catch (error) {
      emitError(error);
    }
  }

  function handleRateLimited(
    payload = {}
  ) {
    if (
      payload.roomId &&
      payload.roomId !== roomId
    ) {
      return;
    }

    stats.rateLimitNotices += 1;

    try {
      rateLimitedHandler?.({
        roomId,

        limitBytesPerSecond:
          payload
            .limitBytesPerSecond ??
          null,
      });
    } catch {}

    emitError(
      payload
        .limitBytesPerSecond
        ? `El relay superó el límite de ${payload.limitBytesPerSecond} bytes por segundo.`
        : "El relay superó el límite de tráfico permitido."
    );
  }

  function handleSocketDisconnect(
    reasonValue
  ) {
    if (manuallyClosed) {
      return;
    }

    markDisconnected(
      reasonValue ||
        "socket-disconnected"
    );
  }

  function handleSocketConnectError(
    error
  ) {
    emitError(error);

    /*
     * Si aún intentábamos activarlo, queda en error.
     * Si ya estaba abierto, Socket.IO puede reconectarse,
     * pero deberá reactivarse expresamente más adelante.
     */
    if (
      relayState ===
        RELAY_STATE.CONNECTING ||
      relayState ===
        RELAY_STATE.OPEN
    ) {
      setState(
        RELAY_STATE.ERROR
      );
    }
  }

  function bindListeners() {
    if (listenersBound) {
      return;
    }

    socket.on(
      "game-relay-packet",
      handleRelayPacket
    );

    socket.on(
      "game-relay-rate-limited",
      handleRateLimited
    );

    socket.on(
      "disconnect",
      handleSocketDisconnect
    );

    socket.on(
      "connect_error",
      handleSocketConnectError
    );

    listenersBound = true;
  }

  function unbindListeners() {
    if (!listenersBound) {
      return;
    }

    socket.off(
      "game-relay-packet",
      handleRelayPacket
    );

    socket.off(
      "game-relay-rate-limited",
      handleRateLimited
    );

    socket.off(
      "disconnect",
      handleSocketDisconnect
    );

    socket.off(
      "connect_error",
      handleSocketConnectError
    );

    listenersBound = false;
  }

  function connect() {
    if (
      relayState ===
        RELAY_STATE.CONNECTING ||
      relayState ===
        RELAY_STATE.OPEN
    ) {
      return false;
    }

    manuallyClosed = false;

    setState(
      RELAY_STATE.CONNECTING
    );

    bindListeners();

    try {
      socket.emit(
        "game-relay-enable",
        {
          roomId,
          reason,
        },
        (ack = {}) => {
          if (
            !ack ||
            ack.success !== true
          ) {
            setState(
              RELAY_STATE.ERROR
            );

            emitError(
              ack?.error ||
                "El servidor rechazó la activación del relay."
            );

            return;
          }

          if (
            relayState ===
            RELAY_STATE.CLOSED
          ) {
            return;
          }

          setState(
            RELAY_STATE.OPEN
          );

          stats.connectedAt =
            Date.now();

          stats.disconnectedAt =
            null;

          try {
            connectedHandler?.(
              ack
            );
          } catch {}
        }
      );
    } catch (error) {
      setState(
        RELAY_STATE.ERROR
      );

      emitError(error);

      return false;
    }

    return true;
  }

  function disconnect() {
    if (
      relayState ===
        RELAY_STATE.CLOSED
    ) {
      unbindListeners();

      return false;
    }

    manuallyClosed = true;

    try {
      socket.emit(
        "game-relay-disable",
        {
          roomId,
        },
        () => {}
      );
    } catch {}

    unbindListeners();

    setState(
      RELAY_STATE.CLOSED
    );

    stats.disconnectedAt =
      Date.now();

    return true;
  }

  function send(packet) {
    if (
      relayState !==
      RELAY_STATE.OPEN
    ) {
      return false;
    }

    const buffer =
      normalizePacket(packet);

    if (!buffer) {
      stats.packetsDropped += 1;

      emitError(
        "send() requiere un Buffer o una vista binaria válida."
      );

      return false;
    }

    if (buffer.length === 0) {
      stats.packetsDropped += 1;

      return false;
    }

    const payload = {
      roomId,
      packet: buffer,
    };

    /*
     * Solo el host debe seleccionar explícitamente el
     * cliente destinatario. Los clientes siempre envían
     * al host según la lógica del backend.
     */
    if (
      isHost &&
      peerSocketId
    ) {
      payload.toSocketId =
        peerSocketId;
    }

    try {
      socket.emit(
        "game-relay-packet",
        payload
      );
    } catch (error) {
      stats.packetsDropped += 1;
      stats.bytesDropped +=
        buffer.length;

      emitError(error);

      return false;
    }

    stats.packetsSent += 1;
    stats.bytesSent +=
      buffer.length;

    stats.lastPacketSentAt =
      Date.now();

    return true;
  }

  function isOpen() {
    return (
      relayState ===
      RELAY_STATE.OPEN
    );
  }

  function getState() {
    return {
      roomId,
      isHost,
      peerSocketId,

      state: relayState,

      connected:
        relayState ===
        RELAY_STATE.OPEN,

      socketConnected:
        Boolean(
          socket.connected
        ),

      stats: {
        ...stats,
      },
    };
  }

  /*
   * Alias útil para TransportManager, que suele cerrar
   * transportes mediante close().
   */
  function close() {
    return disconnect();
  }

  return {
    connect,
    disconnect,
    close,

    send,
    isOpen,
    getState,
  };
}

module.exports = {
  RELAY_STATE,
  createSocketRelayTransport,
};
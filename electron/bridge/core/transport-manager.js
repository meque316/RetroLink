// electron/bridge/quake3/transport-manager.js

const TRANSPORT_MODE = Object.freeze({
  NONE: "none",
  WEBRTC: "webrtc",
  RELAY: "relay",
});

function normalizePacket(packet) {
  if (Buffer.isBuffer(packet)) {
    return packet;
  }

  if (packet instanceof ArrayBuffer) {
    return Buffer.from(packet);
  }

  if (ArrayBuffer.isView(packet)) {
    return Buffer.from(
      packet.buffer,
      packet.byteOffset,
      packet.byteLength
    );
  }

  try {
    return Buffer.from(packet);
  } catch {
    return null;
  }
}

function createTransportManager({
  label = "transport",
  onPacket = null,
  onModeChange = null,
} = {}) {
  let mode = TRANSPORT_MODE.NONE;

  let webrtcChannel = null;
  let relayTransport = null;

  let packetHandler =
    typeof onPacket === "function"
      ? onPacket
      : null;

  let modeChangeHandler =
    typeof onModeChange === "function"
      ? onModeChange
      : null;

  let closed = false;

  const stats = {
    packetsSent: 0,
    bytesSent: 0,

    packetsReceived: 0,
    bytesReceived: 0,

    packetsDropped: 0,
    bytesDropped: 0,

    lastPacketSentAt: null,
    lastPacketReceivedAt: null,

    firstPacketSentAt: null,
    firstPacketReceivedAt: null,
  };

  function log(...args) {
    console.log(
      `[Bridge-Q3-Transport:${label}]`,
      ...args
    );
  }

  function warn(...args) {
    console.warn(
      `[Bridge-Q3-Transport:${label}]`,
      ...args
    );
  }

  function setMode(nextMode) {
    if (
      !Object.values(
        TRANSPORT_MODE
      ).includes(nextMode)
    ) {
      throw new Error(
        `Modo de transporte inválido: ${nextMode}`
      );
    }

    if (mode === nextMode) {
      return;
    }

    const previousMode = mode;

    mode = nextMode;

    log(
      `Modo cambiado: ${previousMode} -> ${nextMode}`
    );

    try {
      modeChangeHandler?.({
        previousMode,
        mode: nextMode,
      });
    } catch (error) {
      console.error(
        `[Bridge-Q3-Transport:${label}] Error en onModeChange:`,
        error.message
      );
    }
  }

  function isWebRTCOpen() {
    try {
      return Boolean(
        webrtcChannel?.isOpen?.()
      );
    } catch {
      return false;
    }
  }

  function isRelayOpen() {
    try {
      return Boolean(
        relayTransport?.isOpen?.()
      );
    } catch {
      return false;
    }
  }

  function connectRelayIfNeeded() {
    if (
      !relayTransport ||
      isRelayOpen()
    ) {
      return isRelayOpen();
    }

    try {
      relayTransport.connect?.();

      return isRelayOpen();
    } catch (error) {
      console.error(
        `[Bridge-Q3-Transport:${label}] Error activando relay:`,
        error.message
      );

      return false;
    }
  }

  function registerDroppedPacket(
    packetLength = 0
  ) {
    stats.packetsDropped += 1;

    stats.bytesDropped += Math.max(
      0,
      Number(packetLength) || 0
    );
  }

  function receive(
    packet,
    source,
    metadata = {}
  ) {
    if (closed) {
      return false;
    }

    const buffer =
      normalizePacket(packet);

    if (!buffer) {
      registerDroppedPacket();

      warn(
        `Paquete remoto inválido desde ${source}`
      );

      return false;
    }

    stats.packetsReceived += 1;
    stats.bytesReceived +=
      buffer.length;

    stats.lastPacketReceivedAt =
      Date.now();

    if (
      !stats.firstPacketReceivedAt
    ) {
      stats.firstPacketReceivedAt =
        stats.lastPacketReceivedAt;

      log(
        `Primer paquete recibido mediante ${source}: ${buffer.length} bytes`
      );
    }

    if (!packetHandler) {
      registerDroppedPacket(
        buffer.length
      );

      warn(
        `No existe onPacket para procesar ${buffer.length} bytes`
      );

      return false;
    }

    try {
      const result =
        packetHandler(
          buffer,
          {
            source,
            mode,
            ...metadata,
          }
        );

      return result !== false;
    } catch (error) {
      registerDroppedPacket(
        buffer.length
      );

      console.error(
        `[Bridge-Q3-Transport:${label}] Error procesando paquete remoto:`,
        error.message
      );

      return false;
    }
  }

  function handleWebRTCMessage(
    packet,
    metadata = {}
  ) {
    return receive(
      packet,
      TRANSPORT_MODE.WEBRTC,
      metadata
    );
  }

  function handleRelayMessage(
    packet,
    metadata = {}
  ) {
    return receive(
      packet,
      TRANSPORT_MODE.RELAY,
      metadata
    );
  }

  function useWebRTC(channel) {
    if (closed) {
      return false;
    }

    if (!channel) {
      warn(
        "No se proporcionó un DataChannel."
      );

      return false;
    }

    webrtcChannel = channel;

    setMode(
      TRANSPORT_MODE.WEBRTC
    );

    return true;
  }

  function useRelay(transport) {
    if (closed) {
      return false;
    }

    if (!transport) {
      warn(
        "No se proporcionó un transporte relay."
      );

      return false;
    }

    if (
      relayTransport &&
      relayTransport !== transport
    ) {
      try {
        relayTransport.close?.();
      } catch {}
    }

    relayTransport = transport;

    /*
     * La activación mediante Socket.IO es asíncrona.
     * connect() inicia el proceso; isRelayOpen() puede
     * seguir siendo false hasta recibir el ACK.
     */
    connectRelayIfNeeded();

    setMode(
      TRANSPORT_MODE.RELAY
    );

    return true;
  }

  function disableWebRTC() {
    webrtcChannel = null;

    if (
      mode ===
      TRANSPORT_MODE.WEBRTC
    ) {
      if (isRelayOpen()) {
        setMode(
          TRANSPORT_MODE.RELAY
        );
      } else {
        setMode(
          TRANSPORT_MODE.NONE
        );
      }
    }
  }

  function disableRelay() {
    try {
      relayTransport?.close?.();
    } catch {}

    relayTransport = null;

    if (
      mode ===
      TRANSPORT_MODE.RELAY
    ) {
      if (isWebRTCOpen()) {
        setMode(
          TRANSPORT_MODE.WEBRTC
        );
      } else {
        setMode(
          TRANSPORT_MODE.NONE
        );
      }
    }
  }

  function sendViaWebRTC(buffer) {
    if (!isWebRTCOpen()) {
      return false;
    }

    webrtcChannel.sendMessageBinary(
      buffer
    );

    return true;
  }

  function sendViaRelay(buffer) {
    if (!relayTransport) {
      return false;
    }

    if (!isRelayOpen()) {
      /*
       * Inicia o reintenta la activación del relay.
       * Este paquete puede perderse mientras el ACK
       * todavía está pendiente; no se implementa cola
       * dentro del TransportManager.
       */
      connectRelayIfNeeded();

      if (!isRelayOpen()) {
        return false;
      }
    }

    return Boolean(
      relayTransport.send(
        buffer
      )
    );
  }

  function send(packet) {
    if (closed) {
      return false;
    }

    const buffer =
      normalizePacket(packet);

    if (!buffer) {
      registerDroppedPacket();

      warn(
        "No se pudo normalizar el paquete local."
      );

      return false;
    }

    let sent = false;
    let usedMode = mode;

    try {
      if (
        mode ===
        TRANSPORT_MODE.WEBRTC
      ) {
        sent =
          sendViaWebRTC(buffer);

        if (!sent) {
          sent =
            sendViaRelay(buffer);

          if (sent) {
            setMode(
              TRANSPORT_MODE.RELAY
            );

            usedMode =
              TRANSPORT_MODE.RELAY;
          }
        }
      } else if (
        mode ===
        TRANSPORT_MODE.RELAY
      ) {
        sent =
          sendViaRelay(buffer);

        if (!sent) {
          sent =
            sendViaWebRTC(buffer);

          if (sent) {
            setMode(
              TRANSPORT_MODE.WEBRTC
            );

            usedMode =
              TRANSPORT_MODE.WEBRTC;
          }
        }
      } else {
        sent =
          sendViaWebRTC(buffer);

        if (sent) {
          setMode(
            TRANSPORT_MODE.WEBRTC
          );

          usedMode =
            TRANSPORT_MODE.WEBRTC;
        } else {
          sent =
            sendViaRelay(buffer);

          if (sent) {
            setMode(
              TRANSPORT_MODE.RELAY
            );

            usedMode =
              TRANSPORT_MODE.RELAY;
          }
        }
      }
    } catch (error) {
      console.error(
        `[Bridge-Q3-Transport:${label}] Error enviando mediante ${mode}:`,
        error.message
      );

      sent = false;
    }

    if (!sent) {
      registerDroppedPacket(
        buffer.length
      );

      return false;
    }

    stats.packetsSent += 1;
    stats.bytesSent +=
      buffer.length;

    stats.lastPacketSentAt =
      Date.now();

    if (
      !stats.firstPacketSentAt
    ) {
      stats.firstPacketSentAt =
        stats.lastPacketSentAt;

      log(
        `Primer paquete enviado mediante ${usedMode}: ${buffer.length} bytes`
      );
    }

    return true;
  }

  function setPacketHandler(
    handler
  ) {
    packetHandler =
      typeof handler ===
      "function"
        ? handler
        : null;
  }

  function setModeChangeHandler(
    handler
  ) {
    modeChangeHandler =
      typeof handler ===
      "function"
        ? handler
        : null;
  }

  function getState() {
    let relayState = null;

    try {
      relayState =
        relayTransport
          ?.getState?.() ??
        null;
    } catch {
      relayState = null;
    }

    return {
      label,
      mode,
      closed,

      webrtcAvailable:
        isWebRTCOpen(),

      relayAvailable:
        isRelayOpen(),

      relayState,

      stats: {
        ...stats,
      },
    };
  }

  function close() {
    if (closed) {
      return;
    }

    closed = true;

    try {
      relayTransport?.close?.();
    } catch {}

    webrtcChannel = null;
    relayTransport = null;

    packetHandler = null;
    modeChangeHandler = null;

    mode =
      TRANSPORT_MODE.NONE;

    log(
      "Transport manager cerrado."
    );
  }

  return {
    send,

    useWebRTC,
    useRelay,

    disableWebRTC,
    disableRelay,

    handleWebRTCMessage,
    handleRelayMessage,

    setPacketHandler,
    setModeChangeHandler,

    isWebRTCOpen,
    isRelayOpen,

    getMode: () => mode,

    getState,

    close,
  };
}

module.exports = {
  TRANSPORT_MODE,
  createTransportManager,
};
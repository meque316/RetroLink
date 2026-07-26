// electron/bridge/core/udp-transport.js

const dgram = require("dgram");

function normalizeMessage(message) {
  return Buffer.isBuffer(message)
    ? message
    : Buffer.from(message);
}

function createUDPTransportFactory({
  gamePort,
  gameHost = "127.0.0.1",
  bindHost = "127.0.0.1",
  debug = false,
  logPrefix = "Game-UDP",
  gameName = "juego",
} = {}) {
  if (
    !Number.isInteger(gamePort) ||
    gamePort < 1 ||
    gamePort > 65535
  ) {
    throw new Error(
      `[${logPrefix}] gamePort debe ser un puerto UDP válido.`
    );
  }

  function debugLog(...args) {
    if (debug) {
      console.log(
        `[${logPrefix}]`,
        ...args
      );
    }
  }

  function safelyForwardGamePacket({
    message,
    onGamePacket,
    label,
  }) {
    if (
      typeof onGamePacket !==
      "function"
    ) {
      debugLog(
        `${label}: no existe callback onGamePacket`
      );

      return false;
    }

    try {
      return (
        onGamePacket(
          Buffer.from(message)
        ) !== false
      );
    } catch (error) {
      console.error(
        `[${logPrefix}] ${label}:`,
        error.message
      );

      return false;
    }
  }

  function createHostUDPProxy({
    socketId,
    clientPort,
    onGamePacket,
  }) {
    const socket =
      dgram.createSocket("udp4");

    let closed = false;

    socket.on("error", (error) => {
      console.error(
        `[${logPrefix}] Error proxy host (${socketId}):`,
        error.message
      );
    });

    socket.on(
      "message",
      (message, remoteInfo) => {
        debugLog(
          `Host recibió ${message.length} bytes`,
          `desde ${remoteInfo.address}:${remoteInfo.port}`
        );

        const forwarded =
          safelyForwardGamePacket({
            message,
            onGamePacket,
            label:
              `Host → transporte remoto (${socketId})`,
          });

        if (!forwarded) {
          debugLog(
            `Paquete host descartado para ${socketId}: ${message.length} bytes`
          );
        }
      }
    );

    socket.bind(
      0,
      bindHost,
      () => {
        const address =
          socket.address();

        console.log(
          `[${logPrefix}] Proxy host ${socketId} escuchando en ${bindHost}:${address.port}; puerto virtual cliente ${clientPort}`
        );
      }
    );

    return {
      socket,

      sendToGame(message) {
        if (closed) {
          return false;
        }

        const buffer =
          normalizeMessage(message);

        socket.send(
          buffer,
          0,
          buffer.length,
          gamePort,
          gameHost,
          (error) => {
            if (error) {
              console.error(
                `[${logPrefix}] Remoto → ${gameName} host:`,
                error.message
              );
            } else {
              debugLog(
                `Transporte remoto → host ${gameName}: ${buffer.length} bytes`
              );
            }
          }
        );

        return true;
      },

      getLocalPort() {
        try {
          return socket.address().port;
        } catch {
          return null;
        }
      },

      isOpen() {
        return !closed;
      },

      close() {
        if (closed) {
          return;
        }

        closed = true;

        try {
          socket.close();
        } catch {}
      },
    };
  }

  function createClientUDPTransport({
    localPort,
    onGamePacket,
  }) {
    const socket =
      dgram.createSocket("udp4");

    let closed = false;

    socket.on("error", (error) => {
      console.error(
        `[${logPrefix}] Error UDP cliente:`,
        error.message
      );
    });

    socket.on(
      "message",
      (message, remoteInfo) => {
        debugLog(
          `Cliente recibió ${message.length} bytes`,
          `desde ${remoteInfo.address}:${remoteInfo.port}`
        );

        const forwarded =
          safelyForwardGamePacket({
            message,
            onGamePacket,
            label:
              "Cliente → transporte remoto",
          });

        if (!forwarded) {
          debugLog(
            `Paquete cliente descartado: ${message.length} bytes`
          );
        }
      }
    );

    socket.bind(
      localPort,
      bindHost,
      () => {
        console.log(
          `[${logPrefix}] Cliente escuchando en ${bindHost}:${localPort}`
        );
      }
    );

    return {
      socket,

      sendToGame(message) {
        if (closed) {
          return false;
        }

        const buffer =
          normalizeMessage(message);

        socket.send(
          buffer,
          0,
          buffer.length,
          gamePort,
          gameHost,
          (error) => {
            if (error) {
              console.error(
                `[${logPrefix}] Remoto → ${gameName} cliente:`,
                error.message
              );
            } else {
              debugLog(
                `Transporte remoto → cliente ${gameName}: ${buffer.length} bytes`
              );
            }
          }
        );

        return true;
      },

      getLocalPort() {
        try {
          return socket.address().port;
        } catch {
          return null;
        }
      },

      isOpen() {
        return !closed;
      },

      close() {
        if (closed) {
          return;
        }

        closed = true;

        try {
          socket.close();
        } catch {}
      },
    };
  }

  return {
    createHostUDPProxy,
    createClientUDPTransport,
  };
}

module.exports = {
  createUDPTransportFactory,
};

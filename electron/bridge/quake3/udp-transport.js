// electron/bridge/quake3/udp-transport.js

const dgram = require("dgram");

const {
  GAME_PORT,
  DEBUG_UDP,
} = require("./config");

function debugLog(...args) {
  if (DEBUG_UDP) {
    console.log(
      "[Bridge-Q3-UDP]",
      ...args
    );
  }
}

function normalizeMessage(message) {
  if (Buffer.isBuffer(message)) {
    return message;
  }

  return Buffer.from(message);
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
      `[Bridge-Q3-UDP] ${label}:`,
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
      `[Bridge-Q3-UDP] Error proxy host (${socketId}):`,
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
    "127.0.0.1",
    () => {
      const address =
        socket.address();

      console.log(
        `[Bridge-Q3-UDP] Proxy host ${socketId} escuchando en 127.0.0.1:${address.port}; puerto virtual cliente ${clientPort}`
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
        GAME_PORT,
        "127.0.0.1",
        (error) => {
          if (error) {
            console.error(
              "[Bridge-Q3-UDP] Remoto → Quake III host:",
              error.message
            );
          } else {
            debugLog(
              `Transporte remoto → host Quake III: ${buffer.length} bytes`
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
      "[Bridge-Q3-UDP] Error UDP cliente:",
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
    "127.0.0.1",
    () => {
      console.log(
        `[Bridge-Q3-UDP] Cliente escuchando en 127.0.0.1:${localPort}`
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
        GAME_PORT,
        "127.0.0.1",
        (error) => {
          if (error) {
            console.error(
              "[Bridge-Q3-UDP] Remoto → Quake III cliente:",
              error.message
            );
          } else {
            debugLog(
              `Transporte remoto → cliente Quake III: ${buffer.length} bytes`
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

module.exports = {
  createHostUDPProxy,
  createClientUDPTransport,
};
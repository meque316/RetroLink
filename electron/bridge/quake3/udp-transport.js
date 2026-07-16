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

function createHostUDPProxy({
  socketId,
  clientPort,
  channel,
}) {
  const socket =
    dgram.createSocket("udp4");

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

      if (!channel?.isOpen()) {
        return;
      }

      try {
        channel.sendMessageBinary(
          Buffer.from(message)
        );
      } catch (error) {
        console.error(
          `[Bridge-Q3-UDP] Error enviando al cliente ${socketId}:`,
          error.message
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
      const buffer =
        Buffer.isBuffer(message)
          ? message
          : Buffer.from(message);

      socket.send(
        buffer,
        0,
        buffer.length,
        GAME_PORT,
        "127.0.0.1",
        (error) => {
          if (error) {
            console.error(
              "[Bridge-Q3-UDP] Host → Quake III:",
              error.message
            );
          } else {
            debugLog(
              `DataChannel → host Quake III: ${buffer.length} bytes`
            );
          }
        }
      );
    },

    close() {
      try {
        socket.close();
      } catch {}
    },
  };
}

function createClientUDPTransport({
  localPort,
  channel,
}) {
  const socket =
    dgram.createSocket("udp4");

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

      if (!channel?.isOpen()) {
        return;
      }

      try {
        channel.sendMessageBinary(
          Buffer.from(message)
        );
      } catch (error) {
        console.error(
          "[Bridge-Q3-UDP] Cliente → DataChannel:",
          error.message
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
      const buffer =
        Buffer.isBuffer(message)
          ? message
          : Buffer.from(message);

      socket.send(
        buffer,
        0,
        buffer.length,
        GAME_PORT,
        "127.0.0.1",
        (error) => {
          if (error) {
            console.error(
              "[Bridge-Q3-UDP] Cliente → Quake III:",
              error.message
            );
          } else {
            debugLog(
              `DataChannel → cliente Quake III: ${buffer.length} bytes`
            );
          }
        }
      );
    },

    close() {
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
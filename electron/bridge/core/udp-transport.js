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

  /*
   * Algunos juegos crean el socket del cliente en un puerto
   * UDP dinámico distinto del puerto del servidor.
   *
   * Cuando esta opción está activada, RetroLink aprende el
   * endpoint real desde el primer paquete enviado por el juego
   * y devuelve allí las respuestas recibidas desde la red.
   */
  dynamicClientEndpoint = false,
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
    if (!debug) {
      return;
    }

    console.log(
      `[${logPrefix}]`,
      ...args
    );
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
          `[${logPrefix}] Proxy host ${socketId} escuchando en ` +
            `${address.address}:${address.port}; ` +
            `puerto virtual cliente ${clientPort}; ` +
            `destino del juego ${gameHost}:${gamePort}`
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

              return;
            }

            debugLog(
              `Transporte remoto → host ${gameName}: ` +
                `${buffer.length} bytes a ${gameHost}:${gamePort}`
            );
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

    /*
     * Endpoint UDP real del ejecutable cliente.
     *
     * En modo dinámico se obtiene desde remoteInfo cuando
     * el juego envía su primer paquete al puerto virtual.
     */
    let clientGameAddress = null;
    let clientGamePort = null;

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

        if (dynamicClientEndpoint) {
          const endpointChanged =
            clientGameAddress !==
              remoteInfo.address ||
            clientGamePort !==
              remoteInfo.port;

          clientGameAddress =
            remoteInfo.address;

          clientGamePort =
            remoteInfo.port;

          if (endpointChanged) {
            console.log(
              `[${logPrefix}] Endpoint dinámico de ${gameName} detectado: ` +
                `${clientGameAddress}:${clientGamePort}`
            );
          }
        }

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
        const address =
          socket.address();

        console.log(
          `[${logPrefix}] Cliente escuchando en ` +
            `${address.address}:${address.port}`
        );

        if (dynamicClientEndpoint) {
          console.log(
            `[${logPrefix}] Esperando detectar el endpoint UDP dinámico de ${gameName}...`
          );
        } else {
          debugLog(
            `Destino fijo del cliente: ${gameHost}:${gamePort}`
          );
        }
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

        const targetAddress =
          dynamicClientEndpoint
            ? clientGameAddress
            : gameHost;

        const targetPort =
          dynamicClientEndpoint
            ? clientGamePort
            : gamePort;

        /*
         * Cuando el juego usa un endpoint dinámico, no debemos
         * asumir que escucha en gamePort.
         *
         * Esperamos a que el ejecutable envíe su primer paquete
         * para aprender el puerto correcto.
         */
        if (
          dynamicClientEndpoint &&
          (
            !targetAddress ||
            !Number.isInteger(
              targetPort
            ) ||
            targetPort < 1 ||
            targetPort > 65535
          )
        ) {
          debugLog(
            `Respuesta remota descartada temporalmente: ` +
              `todavía no se detecta el endpoint UDP de ${gameName}.`
          );

          return false;
        }

        socket.send(
          buffer,
          0,
          buffer.length,
          targetPort,
          targetAddress,
          (error) => {
            if (error) {
              console.error(
                `[${logPrefix}] Remoto → ${gameName} cliente ` +
                  `(${targetAddress}:${targetPort}):`,
                error.message
              );

              return;
            }

            debugLog(
              `Transporte remoto → cliente ${gameName}: ` +
                `${buffer.length} bytes a ` +
                `${targetAddress}:${targetPort}`
            );
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

      getGameEndpoint() {
        if (dynamicClientEndpoint) {
          return {
            address:
              clientGameAddress,

            port:
              clientGamePort,

            detected:
              Boolean(
                clientGameAddress &&
                Number.isInteger(
                  clientGamePort
                )
              ),

            dynamic:
              true,
          };
        }

        return {
          address:
            gameHost,

          port:
            gamePort,

          detected:
            true,

          dynamic:
            false,
        };
      },

      isOpen() {
        return !closed;
      },

      close() {
        if (closed) {
          return;
        }

        closed = true;

        clientGameAddress =
          null;

        clientGamePort =
          null;

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
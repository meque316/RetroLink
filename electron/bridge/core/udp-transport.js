// electron/bridge/core/udp-transport.js

const dgram = require("dgram");

function normalizeMessage(message) {
  return Buffer.isBuffer(message)
    ? message
    : Buffer.from(message);
}

function isValidPort(port) {
  return (
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  );
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

  /*
   * Puerto fijo donde debe escuchar el bridge del cliente.
   *
   * Si es null, el bridge escucha en el puerto virtual
   * asignado por RetroLink mediante señalización.
   *
   * Ejemplo:
   *
   *   Quake III:
   *     clientListenPort = null
   *
   *   UT99:
   *     clientListenPort = null
   *
   *   Counter-Strike 1.6:
   *     clientListenPort = 27015
   */
  clientListenPort = null,

  /*
   * Puerto UDP fijo donde escucha el ejecutable cliente.
   *
   * Si no se declara, utiliza gamePort para conservar el
   * comportamiento anterior.
   *
   * Se ignora cuando dynamicClientEndpoint está activado,
   * porque en ese caso se utiliza el endpoint aprendido.
   *
   * Ejemplo:
   *
   *   Quake III:
   *     configuredClientGamePort = gamePort
   *
   *   Counter-Strike 1.6:
   *     configuredClientGamePort = 27005
   */
  configuredClientGamePort = gamePort,
} = {}) {
  if (!isValidPort(gamePort)) {
    throw new Error(
      `[${logPrefix}] gamePort debe ser un puerto UDP válido.`
    );
  }

  if (
    clientListenPort !== null &&
    !isValidPort(clientListenPort)
  ) {
    throw new Error(
      `[${logPrefix}] clientListenPort debe ser null o un puerto UDP válido.`
    );
  }

  if (
    !isValidPort(
      configuredClientGamePort
    )
  ) {
    throw new Error(
      `[${logPrefix}] configuredClientGamePort debe ser un puerto UDP válido.`
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
            `Paquete host descartado para ${socketId}: ` +
              `${message.length} bytes`
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
                `${buffer.length} bytes a ` +
                `${gameHost}:${gamePort}`
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
    if (!isValidPort(localPort)) {
      throw new Error(
        `[${logPrefix}] localPort debe ser un puerto UDP válido.`
      );
    }

    const socket =
      dgram.createSocket("udp4");

    /*
     * Puerto virtual asignado por RetroLink.
     *
     * En la mayoría de los juegos también es el puerto donde
     * escucha el bridge, pero algunos perfiles pueden declarar
     * un clientListenPort fijo.
     */
    const assignedClientPort =
      localPort;

    const effectiveListenPort =
      clientListenPort ??
      assignedClientPort;

    let closed = false;

    /*
     * Endpoint UDP real aprendido desde el ejecutable.
     *
     * Sólo se utiliza cuando dynamicClientEndpoint está activo.
     */
    let learnedClientAddress =
      null;

    let learnedClientPort =
      null;

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
            learnedClientAddress !==
              remoteInfo.address ||
            learnedClientPort !==
              remoteInfo.port;

          learnedClientAddress =
            remoteInfo.address;

          learnedClientPort =
            remoteInfo.port;

          if (endpointChanged) {
            console.log(
              `[${logPrefix}] Endpoint dinámico de ${gameName} detectado: ` +
                `${learnedClientAddress}:${learnedClientPort}`
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
            `Paquete cliente descartado: ` +
              `${message.length} bytes`
          );
        }
      }
    );

    socket.bind(
      effectiveListenPort,
      bindHost,
      () => {
        const address =
          socket.address();

        console.log(
          `[${logPrefix}] Cliente escuchando en ` +
            `${address.address}:${address.port}`
        );

        if (
          effectiveListenPort !==
          assignedClientPort
        ) {
          console.log(
            `[${logPrefix}] Puerto virtual asignado por RetroLink: ` +
              `${assignedClientPort}; ` +
              `puerto de escucha definido por el perfil: ` +
              `${effectiveListenPort}`
          );
        }

        if (dynamicClientEndpoint) {
          console.log(
            `[${logPrefix}] Esperando detectar el endpoint UDP dinámico de ${gameName}...`
          );

          return;
        }

        debugLog(
          `Destino fijo del cliente: ` +
            `${gameHost}:${configuredClientGamePort}`
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

        const targetAddress =
          dynamicClientEndpoint
            ? learnedClientAddress
            : gameHost;

        const targetPort =
          dynamicClientEndpoint
            ? learnedClientPort
            : configuredClientGamePort;

        /*
         * Cuando el juego usa un endpoint dinámico no debemos
         * asumir que escucha en gamePort ni en otro puerto fijo.
         *
         * Esperamos a que el ejecutable envíe su primer paquete
         * para aprender el destino correcto.
         */
        if (
          dynamicClientEndpoint &&
          (
            !targetAddress ||
            !isValidPort(targetPort)
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

      getAssignedClientPort() {
        return assignedClientPort;
      },

      getGameEndpoint() {
        if (dynamicClientEndpoint) {
          return {
            address:
              learnedClientAddress,

            port:
              learnedClientPort,

            detected:
              Boolean(
                learnedClientAddress &&
                isValidPort(
                  learnedClientPort
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
            configuredClientGamePort,

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

        learnedClientAddress =
          null;

        learnedClientPort =
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
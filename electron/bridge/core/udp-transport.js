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

function describeError(error) {
  if (!error) {
    return null;
  }

  return {
    message: error.message,
    code: error.code ?? null,
    errno: error.errno ?? null,
    syscall: error.syscall ?? null,
    address: error.address ?? null,
    port: error.port ?? null,
    stack: error.stack,
  };
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
  console.log(
    `[UDP-Debug] [${logPrefix}] createUDPTransportFactory() invocado:`,
    {
      gamePort,
      gameHost,
      bindHost,
      dynamicClientEndpoint,
      clientListenPort,
      configuredClientGamePort,
      gameName,
    }
  );

  if (!isValidPort(gamePort)) {
    console.error(
      `[UDP-Debug] [${logPrefix}] gamePort inválido:`,
      { gamePort }
    );

    throw new Error(
      `[${logPrefix}] gamePort debe ser un puerto UDP válido.`
    );
  }

  if (
    clientListenPort !== null &&
    !isValidPort(clientListenPort)
  ) {
    console.error(
      `[UDP-Debug] [${logPrefix}] clientListenPort inválido:`,
      { clientListenPort }
    );

    throw new Error(
      `[${logPrefix}] clientListenPort debe ser null o un puerto UDP válido.`
    );
  }

  if (
    !isValidPort(
      configuredClientGamePort
    )
  ) {
    console.error(
      `[UDP-Debug] [${logPrefix}] configuredClientGamePort inválido:`,
      { configuredClientGamePort }
    );

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
      console.warn(
        `[UDP-Debug] [${logPrefix}] ${label}: no existe callback onGamePacket, ` +
          "paquete descartado.",
        { bytes: message?.length }
      );

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
        `[UDP-Debug] [${logPrefix}] Excepción en onGamePacket (${label}):`,
        describeError(error)
      );

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
    onNetBIOS, // <-- NUEVO: Callback para NetBIOS
  }) {
    console.log(
      `[UDP-Debug] [${logPrefix}] [HOST-STEP 2] createHostUDPProxy() invocado:`,
      { socketId, clientPort, gameHost, gamePort, bindHost }
    );

    let socket;

    try {
      socket =
        dgram.createSocket("udp4");
    } catch (error) {
      console.error(
        `[UDP-Debug] [${logPrefix}] Excepción creando socket UDP host:`,
        { socketId, ...describeError(error) }
      );

      throw error;
    }

    let closed = false;

    socket.on("error", (error) => {
      console.error(
        `[UDP-Debug] [${logPrefix}] [HOST-ERROR] Error en socket UDP host (${socketId}):`,
        describeError(error)
      );

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

        // === NUEVO: DETECTAR NetBIOS ===
        // AoM y otros juegos clásicos usan NetBIOS (puerto 137) para discovery
        // También detectamos broadcast y multicast que pueden estar relacionados
        const isNetBIOS =
          remoteInfo.port === 137 ||
          remoteInfo.port === 138 ||
          remoteInfo.port === 139 ||
          remoteInfo.address === '255.255.255.255' ||
          remoteInfo.address === '192.168.1.255' ||
          remoteInfo.address === '224.0.0.252' ||
          remoteInfo.address.endsWith('.255');

        if (isNetBIOS && typeof onNetBIOS === 'function') {
          debugLog(
            `NetBIOS detectado en puerto ${remoteInfo.port} ` +
            `desde ${remoteInfo.address}:${remoteInfo.port}`
          );

          // Llamar al callback de NetBIOS para que channel-handlers lo reenvíe
          try {
            onNetBIOS(message, remoteInfo);
          } catch (error) {
            console.error(
              `[UDP-Debug] [${logPrefix}] Error en onNetBIOS:`,
              describeError(error)
            );
          }

          // No seguir procesando como paquete normal
          // (NetBIOS no debe ir al juego, solo a otros clientes)
          return;
        }
        // === FIN NUEVO ===

        // Procesar paquete normal (para juegos como Quake III, CS 1.6, UT99, etc.)
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

    console.log(
      `[UDP-Debug] [${logPrefix}] [HOST-STEP 3] intentando bind (puerto efímero) para host ${socketId}...`
    );

    socket.bind(
      0,
      bindHost,
      () => {
        const address =
          socket.address();

        console.log(
          `[UDP-Debug] [${logPrefix}] [HOST-STEP 4] bind exitoso para host ${socketId}:`,
          { address: address.address, port: address.port }
        );

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
          console.warn(
            `[UDP-Debug] [${logPrefix}] sendToGame() llamado con socket ya cerrado (host ${socketId}).`
          );

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
                `[UDP-Debug] [${logPrefix}] Error enviando a ${gameName} (host ${socketId}):`,
                describeError(error)
              );

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

        console.log(
          `[UDP-Debug] [${logPrefix}] Cerrando socket UDP host (${socketId}).`
        );

        try {
          socket.close();
        } catch (error) {
          console.error(
            `[UDP-Debug] [${logPrefix}] Excepción cerrando socket UDP host (${socketId}):`,
            describeError(error)
          );
        }
      },
    };
  }

  function createClientUDPTransport({
    localPort,
    onGamePacket,
  }) {
    console.log(
      `[UDP-Debug] [${logPrefix}] [CLIENT-STEP 2] createClientUDPTransport() invocado:`,
      {
        localPort,
        clientListenPort,
        dynamicClientEndpoint,
        configuredClientGamePort,
        gameHost,
        bindHost,
      }
    );

    if (!isValidPort(localPort)) {
      console.error(
        `[UDP-Debug] [${logPrefix}] localPort inválido:`,
        { localPort }
      );

      throw new Error(
        `[${logPrefix}] localPort debe ser un puerto UDP válido.`
      );
    }

    let socket;

    try {
      socket =
        dgram.createSocket("udp4");
    } catch (error) {
      console.error(
        `[UDP-Debug] [${logPrefix}] Excepción creando socket UDP cliente:`,
        describeError(error)
      );

      throw error;
    }

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
        `[UDP-Debug] [${logPrefix}] [CLIENT-ERROR] Error en socket UDP cliente ` +
          "(puede corresponder a un bind fallido, p. ej. EADDRINUSE):",
        {
          ...describeError(error),
          effectiveListenPort,
          bindHost,
        }
      );

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
              `[UDP-Debug] [${logPrefix}] Endpoint dinámico de ${gameName} detectado:`,
              {
                address: learnedClientAddress,
                port: learnedClientPort,
              }
            );

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

    console.log(
      `[UDP-Debug] [${logPrefix}] [CLIENT-STEP 3] intentando bind puerto ${effectiveListenPort} ` +
        `en ${bindHost}...`
    );

    socket.bind(
      effectiveListenPort,
      bindHost,
      () => {
        const address =
          socket.address();

        console.log(
          `[UDP-Debug] [${logPrefix}] [CLIENT-STEP 4] bind exitoso:`,
          { address: address.address, port: address.port }
        );

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
          console.warn(
            `[UDP-Debug] [${logPrefix}] sendToGame() llamado con socket cliente ya cerrado.`
          );

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
          console.warn(
            `[UDP-Debug] [${logPrefix}] Respuesta remota descartada: endpoint dinámico ` +
              `de ${gameName} aún no detectado.`
          );

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
                `[UDP-Debug] [${logPrefix}] Error enviando a ${gameName} cliente ` +
                  `(${targetAddress}:${targetPort}):`,
                describeError(error)
              );

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

        console.log(
          `[UDP-Debug] [${logPrefix}] Cerrando socket UDP cliente.`
        );

        learnedClientAddress =
          null;

        learnedClientPort =
          null;

        try {
          socket.close();
        } catch (error) {
          console.error(
            `[UDP-Debug] [${logPrefix}] Excepción cerrando socket UDP cliente:`,
            describeError(error)
          );
        }
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
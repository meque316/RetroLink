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

  dynamicClientEndpoint = false,
  clientListenPort = null,
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

  // ===== MODIFICADO: createHostUDPProxy con lógica anti-loop =====
  function createHostUDPProxy({
    socketId,
    clientPort,
    onGamePacket,
    onNetBIOS,
    bindToClientPort = false,
  }) {
    console.log(
      `[UDP-Debug] [${logPrefix}] [HOST-STEP 2] createHostUDPProxy() invocado:`,
      { socketId, clientPort, gameHost, gamePort, bindHost, bindToClientPort }
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
          `desde ${remoteInfo.address}:${remoteInfo.port}`,
          `hex: ${message.toString("hex")}`
        );

        // === DETECTAR NetBIOS ===
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

          try {
            onNetBIOS(message, remoteInfo);
          } catch (error) {
            console.error(
              `[UDP-Debug] [${logPrefix}] Error en onNetBIOS:`,
              describeError(error)
            );
          }

          return;
        }
        // === FIN NetBIOS ===

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

    // ===== CORRECCIÓN ANTI-LOOP =====
    // Si bindToClientPort está activo Y clientPort es igual a gamePort,
    // usar puerto efímero (0) para evitar el loop de auto-alimentación.
    const shouldBindToClientPort = bindToClientPort && (clientPort !== gamePort);
    const bindPort = shouldBindToClientPort ? clientPort : 0;

    console.log(
      `[UDP-Debug] [${logPrefix}] [HOST-STEP 3] intentando bind en puerto ${bindPort} para host ${socketId} (clientPort=${clientPort}, gamePort=${gamePort}, bindToClientPort=${bindToClientPort}, shouldBindToClientPort=${shouldBindToClientPort})...`
    );

    socket.bind(
      bindPort,
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
    // ===== FIN CORRECCIÓN =====

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

        debugLog(
          `Host enviando al juego ${buffer.length} bytes`,
          `a ${gameHost}:${gamePort}`,
          `hex: ${buffer.toString("hex")}`
        );

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
  // ===== FIN MODIFICADO =====

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

    const assignedClientPort =
      localPort;

    const effectiveListenPort =
      clientListenPort ??
      assignedClientPort;

    let closed = false;

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
          `desde ${remoteInfo.address}:${remoteInfo.port}`,
          `hex: ${message.toString("hex")}`
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

        debugLog(
          `Cliente enviando al juego ${buffer.length} bytes`,
          `a ${targetAddress}:${targetPort}`,
          `hex: ${buffer.toString("hex")}`
        );

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
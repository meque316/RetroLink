// electron/bridge/core/transport.js

let deps = null;

function initializeTransport(
  injectedDeps
) {
  deps = injectedDeps;

  console.log(
    "[Transport-Debug] initializeTransport() ejecutado.",
    {
      hasGetState:
        typeof injectedDeps
          ?.getState === "function",
      hasCreateTransportManager:
        typeof injectedDeps
          ?.createTransportManager ===
        "function",
      hasCreateHostUDPProxy:
        typeof injectedDeps
          ?.createHostUDPProxy ===
        "function",
      hasCreateClientUDPTransport:
        typeof injectedDeps
          ?.createClientUDPTransport ===
        "function",
    }
  );
}

/*
 * Crea una sola vez el TransportManager y el proxy UDP
 * correspondiente a cada cliente conectado al host.
 *
 * El proxy debe existir incluso si WebRTC no llega a abrir,
 * porque el modo Relay también necesita reutilizarlo.
 */
function ensureHostTransportResources(
  socketId
) {
  console.log(
    "[Transport-Debug] [HOST-STEP 1] entrando a ensureHostTransportResources:",
    { socketId }
  );

  let state;

  try {
    state = deps.getState();
  } catch (error) {
    console.error(
      "[Transport-Debug] [HOST-ERROR] Excepción en deps.getState():",
      {
        socketId,
        message: error?.message,
        stack: error?.stack,
      }
    );

    throw error;
  }

  const client =
    state.clients.get(socketId);

  if (!client) {
    console.error(
      "[Transport-Debug] [HOST-STEP 1] Cliente no encontrado en state.clients; " +
        "se aborta ensureHostTransportResources:",
      {
        socketId,
        clientsConocidos:
          [...state.clients.keys()],
      }
    );

    return null;
  }

  console.log(
    "[Transport-Debug] [HOST-STEP 1] cliente encontrado:",
    {
      socketId,
      clientPort: client.clientPort,
      transportManagerYaExiste:
        Boolean(
          client.transportManager
        ),
      udpTransportYaExiste:
        Boolean(
          client.udpTransport
        ),
    }
  );

  try {
    const transportManagerYaExistia =
      Boolean(
        client.transportManager
      );

    console.log(
      "[Transport-Debug] [HOST-STEP 2] " +
        (transportManagerYaExistia
          ? "transportManager host ya existía, se reutiliza."
          : "creando transportManager host..."),
      { socketId }
    );

    client.transportManager ||=
      deps.createTransportManager({
        label:
          `host-${socketId}`,

        onPacket: (buffer) => {
          console.log(
            "[Transport-Debug] [HOST-PACKET] onPacket recibido desde transportManager, " +
              "reenviando al proxy UDP host:",
            {
              socketId,
              bytes: buffer?.length,
              udpTransportDisponible:
                Boolean(
                  client.udpTransport
                ),
            }
          );

          try {
            client.udpTransport
              ?.sendToGame(buffer);
          } catch (error) {
            console.error(
              "[Transport-Debug] [HOST-ERROR] Excepción en onPacket " +
                "(transportManager -> UDP):",
              {
                socketId,
                message: error?.message,
                stack: error?.stack,
              }
            );

            throw error;
          }
        },
      });

    console.log(
      "[Transport-Debug] [HOST-STEP 2] transportManager host listo.",
      { socketId }
    );
  } catch (error) {
    console.error(
      "[Transport-Debug] [HOST-ERROR] Excepción creando/usando transportManager host:",
      {
        socketId,
        message: error?.message,
        stack: error?.stack,
      }
    );

    throw error;
  }

  if (client.clientPort) {
    try {
      const udpYaExistia =
        Boolean(
          client.udpTransport
        );

      console.log(
        "[Transport-Debug] [HOST-STEP 3] " +
          (udpYaExistia
            ? "proxy UDP host ya existía, se reutiliza."
            : "creando proxy UDP host..."),
        {
          socketId,
          clientPort:
            client.clientPort,
        }
      );

      client.udpTransport ||=
        deps.createHostUDPProxy({
          socketId,

          clientPort:
            client.clientPort,

          onGamePacket: (buffer) => {
            console.log(
              "[Transport-Debug] [HOST-PACKET] onGamePacket recibido desde UDP, " +
                "reenviando por transportManager:",
              {
                socketId,
                bytes: buffer?.length,
                transportManagerDisponible:
                  Boolean(
                    client.transportManager
                  ),
              }
            );

            try {
              return client.transportManager
                ?.send(buffer);
            } catch (error) {
              console.error(
                "[Transport-Debug] [HOST-ERROR] Excepción en onGamePacket " +
                  "(UDP -> transportManager):",
                {
                  socketId,
                  message: error?.message,
                  stack: error?.stack,
                }
              );

              throw error;
            }
          },
        });

      console.log(
        "[Transport-Debug] [HOST-STEP 4] createHostUDPProxy() retornó sin excepción. " +
          "El bind real es asíncrono; ver logs [UDP-Debug] en udp-transport.js " +
          "para confirmar éxito/fallo del bind.",
        { socketId }
      );
    } catch (error) {
      console.error(
        "[Transport-Debug] [HOST-ERROR] Excepción síncrona creando proxy UDP host:",
        {
          socketId,
          clientPort:
            client.clientPort,
          message: error?.message,
          stack: error?.stack,
        }
      );

      throw error;
    }
  } else {
    console.warn(
      "[Transport-Debug] [HOST-STEP 3] client.clientPort no está definido todavía; " +
        "se omite creación del proxy UDP host.",
      { socketId }
    );
  }

  console.log(
    "[Transport-Debug] [HOST-STEP 5] ensureHostTransportResources completado.",
    { socketId }
  );

  return client;
}

/*
 * Crea una sola vez los recursos de transporte
 * correspondientes al cliente local.
 *
 * state.clientPort conserva el puerto virtual asignado por
 * RetroLink. El factory UDP decide si debe hacer bind en ese
 * puerto o en un clientListenPort fijo definido por el perfil.
 */
function ensureClientTransportResources() {
  console.log(
    "[Transport-Debug] [CLIENT-STEP 1] entrando a ensureClientTransportResources"
  );

  let state;

  try {
    state = deps.getState();
  } catch (error) {
    console.error(
      "[Transport-Debug] [CLIENT-ERROR] Excepción en deps.getState():",
      {
        message: error?.message,
        stack: error?.stack,
      }
    );

    throw error;
  }

  console.log(
    "[Transport-Debug] [CLIENT-STEP 1] estado obtenido:",
    {
      clientPort: state.clientPort,
      transportManagerYaExiste:
        Boolean(
          state.transportManager
        ),
      udpTransportYaExiste:
        Boolean(state.udpTransport),
    }
  );

  try {
    const transportManagerYaExistia =
      Boolean(
        state.transportManager
      );

    console.log(
      "[Transport-Debug] [CLIENT-STEP 2] " +
        (transportManagerYaExistia
          ? "transportManager cliente ya existía, se reutiliza."
          : "creando transportManager cliente...")
    );

    state.transportManager ||=
      deps.createTransportManager({
        label: "client",

        onPacket: (buffer) => {
          console.log(
            "[Transport-Debug] [CLIENT-PACKET] onPacket recibido desde transportManager, " +
              "reenviando al proxy UDP cliente:",
            {
              bytes: buffer?.length,
              udpTransportDisponible:
                Boolean(
                  state.udpTransport
                ),
            }
          );

          try {
            state.udpTransport
              ?.sendToGame(buffer);
          } catch (error) {
            console.error(
              "[Transport-Debug] [CLIENT-ERROR] Excepción en onPacket " +
                "(transportManager -> UDP):",
              {
                message: error?.message,
                stack: error?.stack,
              }
            );

            throw error;
          }
        },
      });

    console.log(
      "[Transport-Debug] [CLIENT-STEP 2] transportManager cliente listo."
    );
  } catch (error) {
    console.error(
      "[Transport-Debug] [CLIENT-ERROR] Excepción creando/usando transportManager cliente:",
      {
        message: error?.message,
        stack: error?.stack,
      }
    );

    throw error;
  }

  if (state.clientPort) {
    try {
      const udpYaExistia =
        Boolean(state.udpTransport);

      console.log(
        "[Transport-Debug] [CLIENT-STEP 3] " +
          (udpYaExistia
            ? "transporte UDP cliente ya existía, se reutiliza."
            : "creando transporte UDP cliente..."),
        { clientPort: state.clientPort }
      );

      state.udpTransport ||=
        deps.createClientUDPTransport({
          localPort:
            state.clientPort,

          onGamePacket: (buffer) => {
            console.log(
              "[Transport-Debug] [CLIENT-PACKET] onGamePacket recibido desde UDP, " +
                "reenviando por transportManager:",
              {
                bytes: buffer?.length,
                transportManagerDisponible:
                  Boolean(
                    state.transportManager
                  ),
              }
            );

            try {
              return state.transportManager
                ?.send(buffer);
            } catch (error) {
              console.error(
                "[Transport-Debug] [CLIENT-ERROR] Excepción en onGamePacket " +
                  "(UDP -> transportManager):",
                {
                  message: error?.message,
                  stack: error?.stack,
                }
              );

              throw error;
            }
          },
        });

      console.log(
        "[Transport-Debug] [CLIENT-STEP 4] createClientUDPTransport() retornó sin excepción. " +
          "El bind real es asíncrono; ver logs [UDP-Debug] [CLIENT-STEP 3]/[CLIENT-STEP 4] " +
          "en udp-transport.js para confirmar éxito/fallo del bind."
      );
    } catch (error) {
      console.error(
        "[Transport-Debug] [CLIENT-ERROR] Excepción síncrona creando transporte UDP cliente:",
        {
          clientPort: state.clientPort,
          message: error?.message,
          stack: error?.stack,
        }
      );

      throw error;
    }
  } else {
    console.warn(
      "[Transport-Debug] [CLIENT-STEP 3] state.clientPort no está definido todavía; " +
        "se omite creación del transporte UDP cliente."
    );
  }

  console.log(
    "[Transport-Debug] [CLIENT-STEP 4] ensureClientTransportResources completado " +
      "(nota: el bind UDP puede seguir pendiente de forma asíncrona)."
  );

  return state;
}

module.exports = {
  initializeTransport,
  ensureHostTransportResources,
  ensureClientTransportResources,
};

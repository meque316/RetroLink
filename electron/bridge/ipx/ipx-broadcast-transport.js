// electron/bridge/ipx/ipx-broadcast-transport.js

const dgram = require("dgram");
const crypto = require("crypto");
const os = require("os");

const DEFAULT_IPX_PORT = 54792;
const DEFAULT_DEDUPE_TTL_MS = 2500;
const DEFAULT_CLEANUP_INTERVAL_MS = 1000;

function isUsableIPv4(network) {
  return (
    network &&
    network.family === "IPv4" &&
    !network.internal &&
    network.address &&
    network.netmask
  );
}

function ipv4ToInteger(address) {
  return address
    .split(".")
    .map(Number)
    .reduce(
      (result, octet) =>
        ((result << 8) | (octet & 0xff)) >>> 0,
      0
    );
}

function integerToIPv4(value) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ].join(".");
}

function calculateBroadcast(address, netmask) {
  const ip = ipv4ToInteger(address);
  const mask = ipv4ToInteger(netmask);

  return integerToIPv4(
    (ip | (~mask >>> 0)) >>> 0
  );
}

function isLinkLocal(address) {
  return address.startsWith("169.254.");
}

function getBroadcastInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = [];

  for (const [name, networks] of Object.entries(
    interfaces
  )) {
    for (const network of networks || []) {
      if (!isUsableIPv4(network)) {
        continue;
      }

      if (isLinkLocal(network.address)) {
        continue;
      }

      result.push({
        name,
        address: network.address,
        netmask: network.netmask,
        broadcast: calculateBroadcast(
          network.address,
          network.netmask
        ),
      });
    }
  }

  return result;
}

function createPacketHash(buffer) {
  return crypto
    .createHash("sha1")
    .update(buffer)
    .digest("hex");
}

function createIPXBroadcastTransport({
  label = "C2-IPX",
  port = DEFAULT_IPX_PORT,
  debug = true,
  dedupeTTL = DEFAULT_DEDUPE_TTL_MS,
  onPacket,
} = {}) {
  let socket = null;
  let running = false;
  let cleanupInterval = null;

  const locallyInjectedPackets = new Map();

  function log(...args) {
    if (debug) {
      console.log(`[${label}]`, ...args);
    }
  }

  function cleanupDedupeCache() {
    const now = Date.now();

    for (const [hash, expiresAt] of
      locallyInjectedPackets.entries()) {
      if (expiresAt <= now) {
        locallyInjectedPackets.delete(hash);
      }
    }
  }

  function rememberInjectedPacket(buffer) {
    const hash = createPacketHash(buffer);

    locallyInjectedPackets.set(
      hash,
      Date.now() + dedupeTTL
    );

    return hash;
  }

  function consumeInjectedPacket(buffer) {
    const hash = createPacketHash(buffer);
    const expiresAt =
      locallyInjectedPackets.get(hash);

    if (!expiresAt) {
      return false;
    }

    locallyInjectedPackets.delete(hash);
    return true;
  }

  function sendToAddress(
    buffer,
    address,
    callback
  ) {
    socket.send(
      buffer,
      0,
      buffer.length,
      port,
      address,
      callback
    );
  }

  function injectPacket(buffer) {
    if (!running || !socket) {
      return Promise.reject(
        new Error(
          `${label}: transporte no iniciado`
        )
      );
    }

    const packet = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer);

    const interfaces =
      getBroadcastInterfaces();

    if (interfaces.length === 0) {
      return Promise.reject(
        new Error(
          `${label}: no hay interfaces IPv4 disponibles`
        )
      );
    }

    /*
    El socket también puede recibir el broadcast
    que nosotros mismos reinyectamos. Lo recordamos
    para no devolverlo nuevamente por WebRTC.
    */
    rememberInjectedPacket(packet);

    return new Promise((resolve, reject) => {
      let pending = interfaces.length;
      let successes = 0;
      const errors = [];

      for (const network of interfaces) {
        sendToAddress(
          packet,
          network.broadcast,
          (error) => {
            pending -= 1;

            if (error) {
              errors.push({
                interface: network.name,
                broadcast:
                  network.broadcast,
                message: error.message,
              });

              log(
                `Error enviando ${packet.length} bytes a`,
                `${network.broadcast}:${port}`,
                error.message
              );
            } else {
              successes += 1;

              log(
                `WebRTC → broadcast ${packet.length} bytes`,
                `${network.broadcast}:${port}`,
                `(${network.name})`
              );
            }

            if (pending > 0) {
              return;
            }

            if (successes === 0) {
              reject(
                new Error(
                  `No fue posible reinyectar el paquete IPX: ${JSON.stringify(
                    errors
                  )}`
                )
              );
              return;
            }

            resolve({
              success: true,
              sentTo: successes,
              errors,
            });
          }
        );
      }
    });
  }

  function start() {
    if (running) {
      return Promise.resolve({
        success: true,
        alreadyRunning: true,
        port,
      });
    }

    return new Promise((resolve, reject) => {
      socket = dgram.createSocket({
        type: "udp4",
        reuseAddr: true,
      });

      socket.on("error", (error) => {
        console.error(
          `[${label}] Error UDP:`,
          error.message
        );

        if (!running) {
          reject(error);
        }
      });

      socket.on(
        "message",
        (message, remoteInfo) => {
          /*
          Evitamos reenviar el broadcast que acabamos
          de inyectar desde el peer remoto.
          */
          if (consumeInjectedPacket(message)) {
            log(
              `Paquete reinyectado ignorado: ${message.length} bytes`
            );
            return;
          }

          log(
            `Broadcast local → WebRTC: ${message.length} bytes`,
            `desde ${remoteInfo.address}:${remoteInfo.port}`
          );

          try {
            onPacket?.(
              Buffer.from(message),
              {
                address:
                  remoteInfo.address,
                port: remoteInfo.port,
                size: remoteInfo.size,
              }
            );
          } catch (error) {
            console.error(
              `[${label}] Error procesando paquete local:`,
              error.message
            );
          }
        }
      );

      socket.bind(
        {
          address: "0.0.0.0",
          port,
          exclusive: false,
        },
        () => {
          try {
            socket.setBroadcast(true);
          } catch (error) {
            console.warn(
              `[${label}] No se pudo activar broadcast:`,
              error.message
            );
          }

          running = true;

          cleanupInterval = setInterval(
            cleanupDedupeCache,
            DEFAULT_CLEANUP_INTERVAL_MS
          );

          const address = socket.address();

          console.log(
            `[${label}] Escuchando broadcasts IPX en ${address.address}:${address.port}`
          );

          const interfaces =
            getBroadcastInterfaces();

          for (const network of interfaces) {
            log(
              `Interfaz: ${network.name}`,
              `${network.address}/${network.netmask}`,
              `broadcast ${network.broadcast}`
            );
          }

          resolve({
            success: true,
            port,
            interfaces,
          });
        }
      );
    });
  }

  function stop() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }

    locallyInjectedPackets.clear();

    if (socket) {
      try {
        socket.removeAllListeners();
        socket.close();
      } catch {}

      socket = null;
    }

    running = false;

    console.log(`[${label}] Transporte detenido`);
  }

  function getState() {
    return {
      running,
      port,
      interfaces: getBroadcastInterfaces(),
      dedupeSize:
        locallyInjectedPackets.size,
    };
  }

  return {
    start,
    stop,
    injectPacket,
    getState,
  };
}

module.exports = {
  createIPXBroadcastTransport,
  getBroadcastInterfaces,
  calculateBroadcast,
  DEFAULT_IPX_PORT,
};
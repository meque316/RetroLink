// electron/bridge/core/network-utils.js

const os = require("os");

/**
 * Determina si una IPv4 pertenece al bloque privado
 * 172.16.0.0/12.
 */
function isPrivate172Address(address) {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);

  return (
    first === 172 &&
    Number.isInteger(second) &&
    second >= 16 &&
    second <= 31
  );
}

/**
 * Detecta si una IP es de ENE (rango 10.x.x.x, 26.x.x.x, o 100.x.x.x)
 */
function isENEIP(address) {
  return (
    address.startsWith("10.") ||
    address.startsWith("26.") ||
    address.startsWith("100.") // Tailscale u otras VPN
  );
}

/**
 * Obtiene una dirección IPv4 local utilizable.
 *
 * Prioridad actual:
 * 1. IP de ENE: 10.x.x.x o 26.x.x.x
 * 2. VPN/Radmin/Hamachi: 26.x.x.x, 10.x.x.x o 172.16-31.x.x
 * 3. Red LAN: 192.168.x.x
 * 4. Primera IPv4 externa disponible
 * 5. Loopback
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();

  const addresses = [];

  for (const [name, networks] of Object.entries(interfaces)) {
    for (const network of networks || []) {
      if (network.family === "IPv4" && !network.internal) {
        addresses.push({
          name,
          address: network.address,
        });
      }
    }
  }

  console.log("[NetworkUtils] Interfaces detectadas:", addresses.map(a => `${a.name}: ${a.address}`).join(", "));

  // 1. IP de ENE (prioridad máxima)
  const eneIP = addresses.find(({ address }) => isENEIP(address));
  if (eneIP) {
    console.log("[NetworkUtils] ✅ IP de ENE detectada:", eneIP.address);
    return eneIP.address;
  }

  // 2. VPN / Hamachi / Radmin (172.16-31.x.x)
  const vpn = addresses.find(
    ({ address }) =>
      address.startsWith("26.") ||
      address.startsWith("10.") ||
      isPrivate172Address(address)
  );
  if (vpn) {
    console.log("[NetworkUtils] ✅ IP de VPN detectada:", vpn.address);
    return vpn.address;
  }

  // 3. LAN (192.168.x.x)
  const lan = addresses.find(({ address }) => address.startsWith("192.168."));
  if (lan) {
    console.log("[NetworkUtils] ✅ IP de LAN detectada:", lan.address);
    return lan.address;
  }

  // 4. Fallback: primera IP o loopback
  const fallback = addresses[0]?.address || "127.0.0.1";
  console.log("[NetworkUtils] ⚠️ Fallback a IP:", fallback);
  return fallback;
}

/**
 * Crea un asignador de puertos para clientes.
 */
function createClientPortAllocator({
  clientPortBase,
  maxClients,
} = {}) {
  if (
    !Number.isInteger(clientPortBase) ||
    clientPortBase < 1 ||
    clientPortBase > 65535
  ) {
    throw new TypeError(
      "[NetworkUtils] clientPortBase debe ser un puerto válido."
    );
  }

  if (!Number.isInteger(maxClients) || maxClients < 1) {
    throw new TypeError(
      "[NetworkUtils] maxClients debe ser un entero mayor que cero."
    );
  }

  const lastPort = clientPortBase + maxClients - 1;

  if (lastPort > 65535) {
    throw new RangeError(
      "[NetworkUtils] El rango de puertos supera el puerto 65535."
    );
  }

  return function getNextClientPort(state) {
    if (!state || !(state.clients instanceof Map)) {
      throw new TypeError(
        "[NetworkUtils] state.clients debe ser un Map."
      );
    }

    if (state.clients.size >= maxClients) {
      return null;
    }

    const usedPorts = new Set(
      [...state.clients.values()]
        .map((client) => client?.clientPort)
        .filter((port) => Number.isInteger(port) && port >= clientPortBase && port <= lastPort)
    );

    for (let offset = 0; offset < maxClients; offset += 1) {
      const port = clientPortBase + offset;
      if (!usedPorts.has(port)) {
        return port;
      }
    }

    return null;
  };
}

module.exports = {
  getLocalIP,
  createClientPortAllocator,
  isENEIP,
};
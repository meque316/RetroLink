// electron/bridge/quake3/network-utils.js

const os = require("os");

const {
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
} = require("./config");

function getLocalIP() {
  const interfaces =
    os.networkInterfaces();

  const addresses = [];

  for (const [
    name,
    networks,
  ] of Object.entries(interfaces)) {
    for (const network of
      networks || []) {
      if (
        network.family === "IPv4" &&
        !network.internal
      ) {
        addresses.push({
          name,
          address: network.address,
        });
      }
    }
  }

  const vpn = addresses.find(
    ({ address }) =>
      address.startsWith("26.") ||
      address.startsWith("10.")
  );

  if (vpn) {
    return vpn.address;
  }

  const lan = addresses.find(
    ({ address }) =>
      address.startsWith("192.168.")
  );

  if (lan) {
    return lan.address;
  }

  return (
    addresses[0]?.address ||
    "127.0.0.1"
  );
}

function getNextClientPort(state) {
  const usedPorts =
    new Set(
      [...state.clients.values()].map(
        (client) =>
          client.clientPort
      )
    );

  for (
    let offset = 0;
    offset < MAX_CLIENTS;
    offset += 1
  ) {
    const port =
      CLIENT_PORT_BASE + offset;

    if (!usedPorts.has(port)) {
      return port;
    }
  }

  return null;
}

module.exports = {
  getLocalIP,
  getNextClientPort,
};
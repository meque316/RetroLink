// electron/bridge/carmageddon2/index.js

const {
  createBridge,
} = require("../core/create-bridge");

const {
  sendStatus,
} = require("./status");

const channels =
  require("./channel-handlers");

const profile =
  require("./profile");

const {
  createCarmageddon2TransportModule,
} = require("./ipx-transport");

const identity = {
  bridgeName:
    "Bridge-C2",

  logPrefix:
    "[Bridge-C2]",

  peerNamePrefix:
    "RetroLink-C2",

  localTransportLogPrefix:
    "Bridge-C2-IPX",
};

const localTransport =
  createCarmageddon2TransportModule({
    profile,
    sendStatus,
  });

module.exports =
  createBridge({
    identity,
    profile,
    sendStatus,
    channels,
    localTransport,

    connectingStatus:
      "Conectando Carmageddon II al servidor de señales...",
  });

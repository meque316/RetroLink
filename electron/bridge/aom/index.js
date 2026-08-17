// electron/bridge/aom/index.js

const {
  createBridge,
} = require("../core/create-bridge");

const {
  sendStatus,
} = require("./status");

const {
  createChannelHandlers,
} = require("./channel-handlers");

const aomProfile =
  require("./profile");

const channels =
  createChannelHandlers();

const identity = {
  bridgeName:
    "Bridge-AoM",

  logPrefix:
    "[Bridge-AoM]",

  peerNamePrefix:
    "RetroLink-AoM",

  udpLogPrefix:
    "Bridge-AoM-UDP",
};

module.exports =
  createBridge({
    identity,

    profile:
      aomProfile,

    sendStatus,

    channels,

    connectingStatus:
      "Conectando al servidor de señales...",
  });
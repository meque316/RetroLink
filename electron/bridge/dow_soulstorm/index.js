// electron/bridge/dow_soulstorm/index.js

const {
  createBridge,
} = require("../core/create-bridge");

const {
  sendStatus,
} = require("./status");

const {
  createChannelHandlers,
} = require("./channel-handlers");

const dowProfile =
  require("./profile");

const channels =
  createChannelHandlers();

const identity = {
  bridgeName:
    "Bridge-DoW",

  logPrefix:
    "[Bridge-DoW]",

  peerNamePrefix:
    "RetroLink-DoW",

  udpLogPrefix:
    "Bridge-DoW-UDP",
};

module.exports =
  createBridge({
    identity,

    profile:
      dowProfile,

    sendStatus,

    channels,

    connectingStatus:
      "Conectando al servidor de señales...",
  });
// electron/bridge/cs16/index.js

const {
  createBridge,
} = require("../core/create-bridge");

const {
  sendStatus,
} = require("./status");

const {
  initializeChannelHandlers,
  handleChannelMessage,
  onHostChannelOpen,
  onClientChannelOpen,
} = require("./channel-handlers");

const cs16Profile =
  require("./profile");

const identity = {
  bridgeName:
    "Bridge-CS16",

  logPrefix:
    "[Bridge-CS16]",

  peerNamePrefix:
    "RetroLink-CS16",

  udpLogPrefix:
    "Bridge-CS16-UDP",
};

module.exports =
  createBridge({
    identity,

    profile:
      cs16Profile,

    sendStatus,

    channels: {
      initializeChannelHandlers,
      handleChannelMessage,
      onHostChannelOpen,
      onClientChannelOpen,
    },

    connectingStatus:
      "Conectando Counter-Strike 1.6 al servidor de señales...",
  });
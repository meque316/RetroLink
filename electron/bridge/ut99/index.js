// electron/bridge/ut99/index.js

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

const ut99Profile =
  require("./profile");

const identity = {
  bridgeName:
    "Bridge-UT99",

  logPrefix:
    "[Bridge-UT99]",

  peerNamePrefix:
    "RetroLink-UT99",

  udpLogPrefix:
    "Bridge-UT99-UDP",
};

module.exports =
  createBridge({
    identity,

    profile:
      ut99Profile,

    sendStatus,

    channels: {
      initializeChannelHandlers,
      handleChannelMessage,
      onHostChannelOpen,
      onClientChannelOpen,
    },

    connectingStatus:
      "Conectando al servidor de señales...",
  });
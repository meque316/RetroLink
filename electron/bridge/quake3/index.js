// electron/bridge/quake3/index.js

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

const quake3Profile =
  require("./profile");


const identity = {
  bridgeName:
    "Bridge-Q3",

  logPrefix:
    "[Bridge-Q3]",

  peerNamePrefix:
    "RetroLink-Q3",

  udpLogPrefix:
    "Bridge-Q3-UDP",
};


module.exports =
  createBridge({
    identity,

    profile:
      quake3Profile,

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
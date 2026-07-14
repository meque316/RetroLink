// electron/ipc/handlers.js

const registerGameHandlers = require("./game.handlers");
const registerRelayHandlers = require("./relay.handlers");
const registerNetworkHandlers = require("./network.handlers");

function registerIPCHandlers() {
  registerGameHandlers();
  registerRelayHandlers();
  registerNetworkHandlers();

  console.log("[Handlers] IPC handlers registrados");
}

module.exports = registerIPCHandlers;
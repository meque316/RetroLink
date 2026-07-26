// electron/bridge/core/game-network-engine.js

class GameNetworkEngine {
  constructor({
    name = "GameNetworkEngine",
    createState,
    handlers = {},
  } = {}) {
    this.name = name;

    if (
      typeof createState !==
      "function"
    ) {
      throw new TypeError(
        `[${this.name}] createState debe ser una función.`
      );
    }

    this.createState =
      createState;

    this.state =
      this.createState();

    this.handlers = {};

    this.setHandlers(
      handlers,
      {
        validate: false,
      }
    );
  }

  setHandlers(
    handlers = {},
    {
      validate = true,
    } = {}
  ) {
    this.handlers = {
      ...this.handlers,
      ...handlers,
    };

    if (validate) {
      this.validateHandlers();
    }

    return this;
  }

  validateHandlers() {
    const requiredHandlers = [
      "start",
      "reset",
      "getState",
      "getClientPort",
      "getHostIP",
    ];

    for (const handlerName of
      requiredHandlers) {
      if (
        typeof this.handlers[
          handlerName
        ] !== "function"
      ) {
        throw new TypeError(
          `[${this.name}] El handler "${handlerName}" debe ser una función.`
        );
      }
    }
  }

  getMutableState() {
    return this.state;
  }

  resetOwnedState() {
    this.state =
      this.createState();

    return this.state;
  }

  replaceOwnedState(
    nextState
  ) {
    if (
      !nextState ||
      typeof nextState !==
        "object"
    ) {
      throw new TypeError(
        `[${this.name}] El nuevo estado debe ser un objeto.`
      );
    }

    this.state = nextState;

    return this.state;
  }

  startSignaling({
    createSession,
    socketFactory,
    url,
    options,
    configure,
  } = {}) {
    if (
      typeof createSession !==
      "function"
    ) {
      throw new TypeError(
        `[${this.name}] createSession debe ser una función.`
      );
    }

    this.stopSignaling();

    const signalingSocket =
      createSession({
        socketFactory,
        url,
        options,
        configure,
      });

    this.state.signalingSocket =
      signalingSocket;

    return signalingSocket;
  }

  stopSignaling() {
    const signalingSocket =
      this.state
        ?.signalingSocket;

    if (!signalingSocket) {
      return false;
    }

    try {
      signalingSocket.disconnect?.();
    } catch {}

    this.state.signalingSocket =
      null;

    return true;
  }

  async start(roomId, isHost) {
    return this.handlers.start(
      roomId,
      isHost
    );
  }

  reset() {
    return this.handlers.reset();
  }

  getState() {
    return this.handlers.getState();
  }

  getClientPort() {
    return this.handlers.getClientPort();
  }

  getHostIP() {
    return this.handlers.getHostIP();
  }

  toBridgeAPI() {
    this.validateHandlers();

    return {
      startBridge:
        this.start.bind(this),

      resetBridge:
        this.reset.bind(this),

      getClientPort:
        this.getClientPort.bind(this),

      getHostIP:
        this.getHostIP.bind(this),

      getBridgeState:
        this.getState.bind(this),
    };
  }
}

function createGameNetworkEngine(
  options
) {
  return new GameNetworkEngine(
    options
  );
}

module.exports = {
  GameNetworkEngine,
  createGameNetworkEngine,
};

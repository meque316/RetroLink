// electron/bridge/bridge-registry.js

const path = require("path");

const gamesPath = path.join(
  __dirname,
  "../games/index.js"
);

const { getRealGameId } = require(gamesPath);

const bridgeProfiles = {
  quake3: {
    label: "Quake III",
    bridge: require("./profiles/quake3"),
  },

  cs16: {
    label: "CS 1.6",
    bridge: require("./profiles/cs16"),
  },

  carmageddon2: {
    label: "Carmageddon 2",
    bridge: require("./profiles/carmageddon2"),
  },

  ut99: {
    label: "UT99",
    bridge: require("./profiles/ut99"),
  },
  
  aom: {
    label: "Age of Mythology",
    bridge: require("./profiles/aom"),
  },
};

const DEFAULT_GAME_ID = "quake3";

let activeBridge = null;
let activeGameId = null;

function getBridgeProfile(gameId) {
  const realGameId = getRealGameId(gameId);

  if (realGameId && bridgeProfiles[realGameId]) {
    return {
      gameId: realGameId,
      ...bridgeProfiles[realGameId],
    };
  }

  console.warn(
    `[Bridge Registry] No existe un perfil para "${gameId}". ` +
      `Se usará ${bridgeProfiles[DEFAULT_GAME_ID].label}.`
  );

  return {
    gameId: DEFAULT_GAME_ID,
    ...bridgeProfiles[DEFAULT_GAME_ID],
  };
}

function getBridge(gameId) {
  const profile = getBridgeProfile(gameId);

  console.log(
    `[Handlers] Usando bridge para ${profile.label}`
  );

  return profile.bridge;
}

function setActiveBridge(bridge, gameId = null) {
  activeBridge = bridge;
  activeGameId = gameId
    ? getRealGameId(gameId)
    : null;
}

function getActiveBridge() {
  return (
    activeBridge ||
    bridgeProfiles[DEFAULT_GAME_ID].bridge
  );
}

function getActiveGameId() {
  return activeGameId;
}

function clearActiveBridge() {
  activeBridge = null;
  activeGameId = null;
}

function hasBridgeProfile(gameId) {
  const realGameId = getRealGameId(gameId);

  return Boolean(
    realGameId &&
      bridgeProfiles[realGameId]
  );
}

function getRegisteredBridgeIds() {
  return Object.keys(bridgeProfiles);
}

module.exports = {
  getBridge,
  getBridgeProfile,

  setActiveBridge,
  getActiveBridge,
  getActiveGameId,
  clearActiveBridge,

  hasBridgeProfile,
  getRegisteredBridgeIds,
};
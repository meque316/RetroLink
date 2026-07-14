// electron/bridge/bridge-registry.js

const path = require("path");

const gamesPath = path.join(
  __dirname,
  "../games/index.js"
);

const { getRealGameId } = require(gamesPath);

const relayQuake = require("./relay");
const relayCS = require("./relay-cs");
const relayC2 = require("./relay-c2");
const relayUT99 = require("./relay-ut99");

let activeBridge = null;

function getBridge(gameId) {
  const realGameId = getRealGameId(gameId);

  if (realGameId === "cs16") {
    console.log(
      "[Handlers] Usando bridge para CS 1.6"
    );

    return relayCS;
  }

  if (realGameId === "carmageddon2") {
    console.log(
      "[Handlers] Usando bridge para Carmageddon 2"
    );

    return relayC2;
  }

  if (realGameId === "ut99") {
    console.log(
      "[Handlers] Usando bridge genérico para UT99"
    );

    return relayUT99;
  }

  console.log(
    "[Handlers] Usando bridge para Quake III"
  );

  return relayQuake;
}

function setActiveBridge(bridge) {
  activeBridge = bridge;
}

function getActiveBridge() {
  return activeBridge || relayQuake;
}

function clearActiveBridge() {
  activeBridge = null;
}

module.exports = {
  getBridge,
  setActiveBridge,
  getActiveBridge,
  clearActiveBridge,
};
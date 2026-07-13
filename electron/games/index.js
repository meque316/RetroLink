// electron/games/index.js

const quake3 = require("./quake3");
const cs16 = require("./cs16");
const carmageddon2 = require("./carmageddon2");
const ut99 = require("./ut99");

const gamesRegistry = {
  [quake3.id]: quake3,
  [cs16.id]: cs16,
  [carmageddon2.id]: carmageddon2,
  [ut99.id]: ut99,
};

const GAME_ALIASES = {
  // Counter-Strike 1.6
  cs16: "cs16",
  "counter-strike": "cs16",
  "counter-strike 1.6": "cs16",
  cs: "cs16",
  counterstrike: "cs16",
  cstrike: "cs16",
  "cs1.6": "cs16",
  "cs 1.6": "cs16",
  "counter strike": "cs16",
  "counter strike 1.6": "cs16",
  "counter-strike1.6": "cs16",
  "cstrike1.6": "cs16",
  hl: "cs16",
  "half-life": "cs16",
  "half life": "cs16",

  // Quake III Arena
  quake3: "quake3",
  quake: "quake3",
  "quake 3": "quake3",
  "quake iii": "quake3",
  "quake iii arena": "quake3",
  q3: "quake3",
  quake3arena: "quake3",
  "quake3 arena": "quake3",
  quak3: "quake3",
  q3a: "quake3",

  // Carmageddon 2
  carmageddon2: "carmageddon2",
  "carmageddon 2": "carmageddon2",
  "carmageddon ii": "carmageddon2",
  "carmageddon ii: carpocalypse now": "carmageddon2",
  carmageddon: "carmageddon2",
  carma2: "carmageddon2",
  "carma 2": "carmageddon2",
  c2: "carmageddon2",

  // Unreal Tournament 99
  ut99: "ut99",
  "ut 99": "ut99",
  "ut'99": "ut99",
  "ut '99": "ut99",
  "unreal tournament": "ut99",
  "unreal tournament 99": "ut99",
  "unreal tournament '99": "ut99",
  "unreal tournament goty": "ut99",
  "unreal tournament goty edition": "ut99",
  "unreal tournament game of the year": "ut99",
  "unreal tournament game of the year edition": "ut99",
  "unrealtournament": "ut99",
  "unreal tournament 1999": "ut99",
};

function normalizeGameId(gameId) {
  if (!gameId || typeof gameId !== "string") {
    return null;
  }

  return gameId
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function getRealGameId(gameId) {
  const normalizedId = normalizeGameId(gameId);

  if (!normalizedId) {
    return null;
  }

  return GAME_ALIASES[normalizedId] || normalizedId;
}

function getGame(gameId) {
  const realGameId = getRealGameId(gameId);

  if (!realGameId) {
    console.error("[Games] getGame: gameId inválido:", gameId);
    return null;
  }

  const game = gamesRegistry[realGameId];

  if (!game) {
    console.error(`[Games] Juego no encontrado: "${gameId}"`);
    console.error(`[Games] - Real ID: "${realGameId}"`);
    console.log(
      `[Games] Juegos disponibles: ${Object.keys(gamesRegistry).join(", ")}`
    );

    return null;
  }

  console.log(
    `[Games] Juego encontrado: "${gameId}" → ${game.name} (ID: ${game.id})`
  );

  return game;
}

function listGames() {
  return Object.keys(gamesRegistry);
}

function getGamesInfo() {
  const result = {};

  for (const [id, game] of Object.entries(gamesRegistry)) {
    const aliases = Object.keys(GAME_ALIASES).filter(
      (alias) => GAME_ALIASES[alias] === id
    );

    result[id] = {
      id: game.id,
      name: game.name,
      executable: game.executable || null,
      serverExecutable: game.serverExecutable || null,
      defaultPort: game.defaultPort,
      queryPort: game.queryPort || null,
      clientPortBase: game.clientPortBase,
      supportsRoomOptions: Boolean(game.supportsRoomOptions),
      usesDedicatedServer: Boolean(game.usesDedicatedServer),
      hostAlsoLaunchesClient: Boolean(game.hostAlsoLaunchesClient),
      aliases,
    };
  }

  return result;
}

function gameExists(gameId) {
  const realGameId = getRealGameId(gameId);

  if (!realGameId) {
    return false;
  }

  return Boolean(gamesRegistry[realGameId]);
}

function getGamesWithAliases() {
  const result = {};

  for (const [id, game] of Object.entries(gamesRegistry)) {
    const aliases = Object.keys(GAME_ALIASES).filter(
      (alias) => GAME_ALIASES[alias] === id
    );

    result[id] = {
      ...game,
      aliases,
    };
  }

  return result;
}

module.exports = {
  getGame,
  listGames,
  getGameAliases: () => GAME_ALIASES,
  getGamesInfo,
  getGamesWithAliases,
  gameExists,
  getRealGameId,
  normalizeGameId,
  GAME_ALIASES,
  gamesRegistry,
};
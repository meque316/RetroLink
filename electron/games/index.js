// electron/games/index.js
const quake3 = require("./quake3");
const cs16 = require("./cs16");

const gamesRegistry = {
  [quake3.id]: quake3,
  [cs16.id]: cs16
};

const GAME_ALIASES = {
  // Aliases para CS 1.6
  'cs16': 'cs16',
  'counter-strike': 'cs16',
  'counter-strike 1.6': 'cs16',
  'cs': 'cs16',
  'counterstrike': 'cs16',
  'cstrike': 'cs16',
  'cs1.6': 'cs16',
  'cs 1.6': 'cs16',
  'counter strike': 'cs16',
  'counter strike 1.6': 'cs16',
  'counter-strike1.6': 'cs16',
  'cstrike1.6': 'cs16',
  'hl': 'cs16',
  'half-life': 'cs16',
  'half life': 'cs16',
  
  // Aliases para Quake 3
  'quake3': 'quake3',
  'quake': 'quake3',
  'quake 3': 'quake3',
  'quake iii': 'quake3',
  'quake iii arena': 'quake3',
  'q3': 'quake3',
  'quake3arena': 'quake3',
  'quake3 arena': 'quake3',
  'quak3': 'quake3',
  'q3a': 'quake3'
};

function getGame(gameId) {
  if (!gameId || typeof gameId !== 'string') {
    console.error('[Games] getGame: gameId inválido:', gameId);
    return null;
  }
  
  const normalizedId = gameId.toLowerCase().trim().replace(/\s+/g, ' ');
  const realGameId = GAME_ALIASES[normalizedId] || normalizedId;
  const game = gamesRegistry[realGameId];
  
  if (!game) {
    console.error(`[Games] Juego no encontrado: "${gameId}"`);
    console.error(`[Games] - Normalizado: "${normalizedId}"`);
    console.error(`[Games] - Real ID: "${realGameId}"`);
    console.log(`[Games] Juegos disponibles: ${Object.keys(gamesRegistry).join(', ')}`);
    return null;
  }
  
  console.log(`[Games] Juego encontrado: "${gameId}" → ${game.name} (ID: ${game.id})`);
  return game;
}

function listGames() {
  return Object.keys(gamesRegistry);
}

function getGamesInfo() {
  const result = {};
  for (const [id, game] of Object.entries(gamesRegistry)) {
    const aliases = Object.keys(GAME_ALIASES).filter(key => GAME_ALIASES[key] === id);
    result[id] = {
      id: game.id,
      name: game.name,
      defaultPort: game.defaultPort,
      clientPortBase: game.clientPortBase,
      aliases: aliases
    };
  }
  return result;
}

function gameExists(gameId) {
  if (!gameId || typeof gameId !== 'string') return false;
  const normalizedId = gameId.toLowerCase().trim();
  const realGameId = GAME_ALIASES[normalizedId] || normalizedId;
  return !!gamesRegistry[realGameId];
}

function getRealGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') return null;
  const normalizedId = gameId.toLowerCase().trim();
  return GAME_ALIASES[normalizedId] || normalizedId;
}

module.exports = {
  getGame,
  listGames,
  getGameAliases: () => GAME_ALIASES,
  getGamesInfo,
  getGamesWithAliases: () => {
    const result = {};
    for (const [id, game] of Object.entries(gamesRegistry)) {
      const aliases = Object.keys(GAME_ALIASES).filter(key => GAME_ALIASES[key] === id);
      result[id] = {
        ...game,
        aliases
      };
    }
    return result;
  },
  gameExists,
  getRealGameId,
  GAME_ALIASES,
  gamesRegistry
};
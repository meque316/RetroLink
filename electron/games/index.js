// electron/games/index.js
const quake3 = require("./quake3");
const cs16 = require("./cs16");

const gamesRegistry = {
  [quake3.id]: quake3,
  [cs16.id]: cs16
};

// ✅ Agregar alias para nombres alternativos
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
  'hl': 'cs16',                    // Half-Life (puede ser CS)
  'half-life': 'cs16',             // Half-Life (puede ser CS)
  'half life': 'cs16',             // Half-Life (puede ser CS)
  
  // Aliases para Quake 3
  'quake3': 'quake3',
  'quake': 'quake3',
  'quake 3': 'quake3',
  'quake iii': 'quake3',
  'quake iii arena': 'quake3',
  'q3': 'quake3',
  'quake3arena': 'quake3',
  'quake3 arena': 'quake3',
  'quak3': 'quake3',               // Typo común
  'q3a': 'quake3'                  // Abreviatura común
};

// ✅ Función para obtener el juego con más información de debug
function getGame(gameId) {
  // Si no es un string, devolver null
  if (!gameId || typeof gameId !== 'string') {
    console.error('[Games] getGame: gameId inválido:', gameId);
    return null;
  }
  
  // Normalizar: convertir a minúsculas, trim y eliminar espacios extra
  const normalizedId = gameId.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Buscar el ID real usando el mapa de alias
  const realGameId = GAME_ALIASES[normalizedId] || normalizedId;
  
  // Buscar en el registro
  const game = gamesRegistry[realGameId];
  
  if (!game) {
    console.error(`[Games] Juego no encontrado: "${gameId}"`);
    console.error(`[Games] - Normalizado: "${normalizedId}"`);
    console.error(`[Games] - Real ID: "${realGameId}"`);
    console.log(`[Games] Juegos disponibles: ${Object.keys(gamesRegistry).join(', ')}`);
    console.log(`[Games] Aliases disponibles: ${Object.keys(GAME_ALIASES).join(', ')}`);
    return null;
  }
  
  // ✅ Log de éxito con información del juego
  console.log(`[Games] Juego encontrado: "${gameId}" → ${game.name} (ID: ${game.id})`);
  
  return game;
}

// ✅ Función para obtener todos los juegos disponibles (para el frontend)
function listGames() {
  return Object.keys(gamesRegistry);
}

// ✅ Función para obtener todos los juegos con información completa
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

// ✅ Función para verificar si un juego existe
function gameExists(gameId) {
  if (!gameId || typeof gameId !== 'string') return false;
  const normalizedId = gameId.toLowerCase().trim();
  const realGameId = GAME_ALIASES[normalizedId] || normalizedId;
  return !!gamesRegistry[realGameId];
}

// ✅ Función para obtener el alias real de un juego
function getRealGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') return null;
  const normalizedId = gameId.toLowerCase().trim();
  return GAME_ALIASES[normalizedId] || normalizedId;
}

module.exports = {
  // Funciones principales
  getGame,
  listGames,
  
  // Funciones auxiliares
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
  
  // Exportar datos para uso externo
  GAME_ALIASES,
  gamesRegistry
};
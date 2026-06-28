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
  
  // Aliases para Quake 3
  'quake3': 'quake3',
  'quake': 'quake3',
  'quake 3': 'quake3',
  'quake iii': 'quake3',
  'quake iii arena': 'quake3',
  'q3': 'quake3',
  'quake3arena': 'quake3'
};

module.exports = {
  getGame: (gameId) => {
    // Si no es un string, devolver null
    if (!gameId || typeof gameId !== 'string') {
      console.error('[Games] getGame: gameId inválido:', gameId);
      return null;
    }
    
    // Normalizar: convertir a minúsculas y trim
    const normalizedId = gameId.toLowerCase().trim();
    
    // Buscar el ID real usando el mapa de alias
    const realGameId = GAME_ALIASES[normalizedId] || normalizedId;
    
    // Buscar en el registro
    const game = gamesRegistry[realGameId];
    
    if (!game) {
      console.error(`[Games] Juego no encontrado: "${gameId}" (normalizado: "${normalizedId}", realId: "${realGameId}")`);
      console.log('[Games] Juegos disponibles:', Object.keys(gamesRegistry));
      console.log('[Games] Aliases disponibles:', Object.keys(GAME_ALIASES));
    }
    
    return game || null;
  },
  
  listGames: () => Object.keys(gamesRegistry),
  
  // Función para obtener todos los aliases (útil para el frontend)
  getGameAliases: () => GAME_ALIASES,
  
  // Función para obtener todos los juegos con sus aliases
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
  }
};
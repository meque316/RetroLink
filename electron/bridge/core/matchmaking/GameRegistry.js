// electron/bridge/core/matchmaking/GameRegistry.js

class GameRegistry {
  constructor() {
    this.games = new Map();
    this._defaultConfig = {
      maxPlayers: 8,
      requiresMatchmaking: true,
    };
  }

  /**
   * Registrar un juego
   */
  register(gameId, config) {
    this.games.set(gameId, {
      id: gameId,
      name: config.name || gameId,
      maxPlayers: config.maxPlayers || 8,
      requiresMatchmaking: config.requiresMatchmaking !== false,
      emulator: config.emulator || null,
      ...config,
    });
  }

  /**
   * Obtener la configuración de un juego
   */
  get(gameId) {
    return this.games.get(gameId) || null;
  }

  /**
   * Obtener todos los juegos
   */
  getAll() {
    return Array.from(this.games.values());
  }

  /**
   * Obtener juegos activos (con matchmaking)
   */
  getActive() {
    const result = [];
    for (const [id, game] of this.games) {
      if (game.requiresMatchmaking) {
        result.push(game);
      }
    }
    return result;
  }

  /**
   * Obtener el máximo de jugadores para un juego
   */
  getMaxPlayers(gameId) {
    const game = this.games.get(gameId);
    return game ? game.maxPlayers : 8;
  }

  /**
   * Verificar si un juego requiere matchmaking
   */
  requiresMatchmaking(gameId) {
    const game = this.games.get(gameId);
    return game ? game.requiresMatchmaking : false;
  }
}

module.exports = GameRegistry;
// electron/bridge/core/matchmaking/StateManager.js

class StateManager {
  constructor() {
    this.state = {
      rooms: [],
      players: [],
      games: [],
      emulators: [],
    };
  }

  /**
   * Actualizar el estado
   */
  update(data) {
    this.state = {
      ...this.state,
      ...data,
    };
  }

  /**
   * Obtener el estado
   */
  get() {
    return { ...this.state };
  }

  /**
   * Obtener un resumen del estado
   */
  getSummary() {
    return {
      totalRooms: this.state.rooms.length,
      totalPlayers: this.state.players.length,
      totalGames: this.state.games.length,
    };
  }
}

module.exports = StateManager;
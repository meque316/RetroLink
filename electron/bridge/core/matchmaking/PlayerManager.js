// electron/bridge/core/matchmaking/PlayerManager.js

class PlayerManager {
  constructor() {
    this.players = new Map();
  }

  /**
   * Registrar un jugador
   */
  register(playerId, data) {
    const existing = this.players.get(playerId);
    if (existing) {
      // Actualizar datos existentes
      this.players.set(playerId, {
        ...existing,
        ...data,
        updatedAt: Date.now(),
      });
      return this.players.get(playerId);
    }

    const player = {
      id: playerId,
      username: data.username || 'Jugador',
      isHost: data.isHost || false,
      roomId: data.roomId || null,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
      ...data,
    };

    this.players.set(playerId, player);
    return player;
  }

  /**
   * Obtener un jugador
   */
  get(playerId) {
    return this.players.get(playerId);
  }

  /**
   * Obtener todos los jugadores
   */
  getAll() {
    return Array.from(this.players.values());
  }

  /**
   * Contar jugadores
   */
  count() {
    return this.players.size;
  }

  /**
   * Remover un jugador
   */
  remove(playerId) {
    return this.players.delete(playerId);
  }

  /**
   * Actualizar la sala de un jugador
   */
  setRoom(playerId, roomId) {
    const player = this.players.get(playerId);
    if (player) {
      player.roomId = roomId;
      player.updatedAt = Date.now();
      this.players.set(playerId, player);
      return player;
    }
    return null;
  }

  /**
   * Limpiar todos los jugadores
   */
  clear() {
    this.players.clear();
  }
}

module.exports = PlayerManager;
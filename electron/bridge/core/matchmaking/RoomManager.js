// electron/bridge/core/matchmaking/RoomManager.js

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.nextId = 1;
  }

  /**
   * Crear una nueva sala
   */
  create(data) {
    const room = {
      id: this.nextId++,
      name: data.name || 'Sala sin nombre',
      gameId: data.gameId,
      hostId: data.hostId,
      players: [data.hostId],
      maxPlayers: data.maxPlayers || 8,
      options: data.options || {},
      status: 'waiting', // waiting | playing | closed
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rooms.set(room.id, room);
    return room;
  }

  /**
   * Unirse a una sala
   */
  join(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status === 'closed') return null;
    if (room.players.includes(playerId)) return room;

    room.players.push(playerId);
    room.updatedAt = Date.now();
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Salir de una sala
   */
  leave(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter(id => id !== playerId);
    room.updatedAt = Date.now();

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return null;
    }

    // Si el host se fue, elegir un nuevo host
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0];
    }

    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Cerrar una sala
   */
  close(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.status = 'closed';
    room.updatedAt = Date.now();
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Obtener una sala
   */
  get(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Obtener salas por juego
   */
  getByGame(gameId) {
    const result = [];
    for (const [id, room] of this.rooms) {
      if (room.gameId === gameId && room.status === 'waiting') {
        result.push(this._sanitize(room));
      }
    }
    return result;
  }

  /**
   * Obtener todas las salas
   */
  getAll() {
    const result = [];
    for (const [id, room] of this.rooms) {
      result.push(this._sanitize(room));
    }
    return result;
  }

  /**
   * Contar salas
   */
  count() {
    return this.rooms.size;
  }

  /**
   * Limpiar todas las salas
   */
  clear() {
    this.rooms.clear();
  }

  /**
   * Sanitizar sala (remover datos sensibles)
   */
  _sanitize(room) {
    return {
      id: room.id,
      name: room.name,
      gameId: room.gameId,
      hostId: room.hostId,
      players: [...room.players],
      maxPlayers: room.maxPlayers,
      options: { ...room.options },
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }
}

module.exports = RoomManager;
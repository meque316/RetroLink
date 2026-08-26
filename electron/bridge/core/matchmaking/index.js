// electron/bridge/core/matchmaking/index.js

const RoomManager = require('./RoomManager');
const PlayerManager = require('./PlayerManager');
const GameRegistry = require('./GameRegistry');
const StateManager = require('./StateManager');
const ESOEmulator = require('./emulators/ESOEmulator');
const GameSpyEmulator = require('./emulators/GameSpyEmulator');
const GPServer = require('./emulators/GPServer'); // <-- NUEVO: Servidor GP para Soulstorm

/**
 * EXODUS MATCHMAKING ENGINE (EME)
 * 
 * Motor de matchmaking para juegos que no tienen LAN Discovery funcional.
 * 
 * Características:
 * - Gestión de salas (crear, unirse, salir, listar)
 * - Gestión de jugadores (registrar, conectar, desconectar)
 * - Registro de juegos (cada juego tiene su configuración)
 * - Emulación de servidores de matchmaking muertos (ESO, GameSpy, Zone.com)
 * - Servidor GP nativo para Soulstorm (TCP 29900, protocolo GameSpy Presence)
 * - Integración con ENE (LAN Virtual)
 * 
 * EME es OPCIONAL. Solo se activa para juegos que lo necesitan.
 * Quake III, CS 1.6, UT99 NO usan EME (tienen LAN Discovery funcional).
 */
class MatchmakingEngine {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      autoStartEmulators: options.autoStartEmulators !== false,
      ...options
    };

    // Módulos internos
    this.rooms = new RoomManager();
    this.players = new PlayerManager();
    this.games = new GameRegistry();
    this.state = new StateManager();

    // Emuladores HTTP/JSON por juego (se inician bajo demanda)
    this.emulators = new Map();
    this.emulatorConfigs = {
      aom: {
        class: ESOEmulator,
        port: this.options.port,
        autoStart: this.options.autoStartEmulators
      },
      dow_soulstorm: {
        class: GameSpyEmulator,
        port: 3001,
        autoStart: this.options.autoStartEmulators
      },
      // aoe2: { class: ZoneEmulator, port: 3002 },
    };

    // ===== NUEVO: Servidores GP (protocolo nativo de GameSpy) =====
    // Estos servidores manejan el protocolo TCP/UDP nativo que Soulstorm espera
    this.gpServers = new Map();
    this.gpServerConfigs = {
      dow_soulstorm: {
        class: GPServer,
        port: 29900,              // Puerto estándar de GameSpy Presence
        autoStart: this.options.autoStartEmulators,
        debug: true,              // Logs detallados para depuración
      },
    };
    // ===== FIN NUEVO =====

    // Eventos
    this.listeners = {
      'room-created': [],
      'room-updated': [],
      'room-closed': [],
      'player-joined': [],
      'player-left': [],
      'game-started': [],
    };

    console.log('[EME] 🚀 Matchmaking Engine inicializado');
  }

  // ============================================================
  // 1. GESTIÓN DE SALAS
  // ============================================================

  /**
   * Crea una nueva sala
   * @param {Object} data - Datos de la sala
   * @param {string} data.gameId - ID del juego (ej: 'aom')
   * @param {string} data.name - Nombre de la sala
   * @param {string} data.hostId - ID del host (socketId)
   * @param {Object} data.options - Opciones del juego (mapa, etc.)
   * @param {number} data.maxPlayers - Máximo de jugadores
   * @returns {Object} Sala creada
   */
  createRoom(data) {
    const room = this.rooms.create({
      gameId: data.gameId,
      name: data.name || `Sala de ${data.hostId}`,
      hostId: data.hostId,
      options: data.options || {},
      maxPlayers: data.maxPlayers || this.games.getMaxPlayers(data.gameId) || 8,
    });

    // Registrar al host como jugador
    this.players.register(data.hostId, {
      username: data.hostUsername || 'Host',
      isHost: true,
    });

    // Iniciar emuladores si es necesario
    this._ensureEmulator(data.gameId);
    this._ensureGPServer(data.gameId); // <-- NUEVO: Iniciar servidor GP

    // Emitir evento
    this._emit('room-created', room);

    console.log(`[EME] 📝 Sala creada: "${room.name}" (${room.id}) para ${data.gameId}`);
    return room;
  }

  /**
   * Unirse a una sala
   * @param {string} roomId - ID de la sala
   * @param {string} playerId - ID del jugador (socketId)
   * @param {Object} playerData - Datos del jugador
   * @returns {Object} Sala actualizada
   */
  joinRoom(roomId, playerId, playerData = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[EME] ❌ Sala ${roomId} no existe`);
      return null;
    }

    if (room.isFull()) {
      console.log(`[EME] ❌ Sala ${roomId} está llena`);
      return null;
    }

    // Registrar jugador
    this.players.register(playerId, {
      username: playerData.username || 'Jugador',
      isHost: false,
    });

    // Agregar a la sala
    const updatedRoom = this.rooms.join(roomId, playerId);

    // Emitir evento
    this._emit('player-joined', { roomId, playerId, room: updatedRoom });

    console.log(`[EME] 👤 Jugador ${playerId} se unió a sala ${roomId}`);
    return updatedRoom;
  }

  /**
   * Salir de una sala
   * @param {string} roomId - ID de la sala
   * @param {string} playerId - ID del jugador
   * @returns {Object} Sala actualizada o null si se cerró
   */
  leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`[EME] ❌ Sala ${roomId} no existe`);
      return null;
    }

    const updatedRoom = this.rooms.leave(roomId, playerId);

    // Emitir evento
    this._emit('player-left', { roomId, playerId, room: updatedRoom });

    // Si la sala quedó vacía, cerrarla
    if (!updatedRoom || updatedRoom.isEmpty()) {
      this.closeRoom(roomId);
      console.log(`[EME] 🚪 Sala ${roomId} cerrada (sin jugadores)`);
      return null;
    }

    console.log(`[EME] 👋 Jugador ${playerId} salió de sala ${roomId}`);
    return updatedRoom;
  }

  /**
   * Cerrar una sala
   * @param {string} roomId - ID de la sala
   */
  closeRoom(roomId) {
    const room = this.rooms.close(roomId);
    if (room) {
      this._emit('room-closed', room);
      console.log(`[EME] 🚪 Sala ${roomId} cerrada`);
    }
    return room;
  }

  /**
   * Obtener todas las salas de un juego
   * @param {string} gameId - ID del juego
   * @returns {Array} Lista de salas
   */
  getRooms(gameId) {
    return this.rooms.getByGame(gameId);
  }

  /**
   * Obtener una sala por ID
   * @param {string} roomId - ID de la sala
   * @returns {Object} Sala
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  // ============================================================
  // 2. GESTIÓN DE JUGADORES
  // ============================================================

  /**
   * Registrar un jugador
   * @param {string} playerId - ID del jugador (socketId)
   * @param {Object} data - Datos del jugador
   * @returns {Object} Jugador registrado
   */
  registerPlayer(playerId, data) {
    return this.players.register(playerId, data);
  }

  /**
   * Obtener un jugador
   * @param {string} playerId - ID del jugador
   * @returns {Object} Jugador
   */
  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  /**
   * Desconectar un jugador (removerlo de todas las salas)
   * @param {string} playerId - ID del jugador
   */
  disconnectPlayer(playerId) {
    // Remover de todas las salas
    const rooms = this.rooms.getAll();
    for (const room of rooms) {
      if (room.hasPlayer(playerId)) {
        this.leaveRoom(room.id, playerId);
      }
    }

    // Remover del registro de jugadores
    this.players.remove(playerId);
    console.log(`[EME] 🔌 Jugador ${playerId} desconectado`);
  }

  // ============================================================
  // 3. GESTIÓN DE JUEGOS
  // ============================================================

  /**
   * Registrar un juego en EME
   * @param {string} gameId - ID del juego
   * @param {Object} config - Configuración del juego
   */
  registerGame(gameId, config) {
    this.games.register(gameId, config);
    console.log(`[EME] 🎮 Juego registrado: ${config.name || gameId}`);
  }

  /**
   * Obtener la configuración de un juego
   * @param {string} gameId - ID del juego
   * @returns {Object} Configuración del juego
   */
  getGameConfig(gameId) {
    return this.games.get(gameId);
  }

  // ============================================================
  // 4. EMULADORES (HTTP/JSON)
  // ============================================================

  /**
   * Asegurar que el emulador HTTP de un juego está iniciado
   * @param {string} gameId - ID del juego
   * @private
   */
  _ensureEmulator(gameId) {
    const config = this.emulatorConfigs[gameId];
    if (!config) return;

    if (this.emulators.has(gameId)) {
      const emulator = this.emulators.get(gameId);
      if (emulator.isRunning()) return;
    }

    if (!config.autoStart) return;

    console.log(`[EME] 🔄 Iniciando emulador HTTP para ${gameId}...`);
    const EmulatorClass = config.class;
    const emulator = new EmulatorClass({
      port: config.port,
      matchmaking: this,
    });
    emulator.start();
    this.emulators.set(gameId, emulator);
  }

  // ============================================================
  // 4b. SERVIDORES GP (protocolo nativo de GameSpy) - NUEVO
  // ============================================================

  /**
   * Asegurar que el servidor GP para un juego está iniciado
   * @param {string} gameId - ID del juego
   * @private
   */
  _ensureGPServer(gameId) {
    const config = this.gpServerConfigs[gameId];
    if (!config) return;

    if (this.gpServers.has(gameId)) {
      const server = this.gpServers.get(gameId);
      if (server.isRunning()) return;
    }

    if (!config.autoStart) return;

    console.log(`[EME] 🔄 Iniciando servidor GP para ${gameId}...`);
    const GPServerClass = config.class;
    const server = new GPServerClass({
      port: config.port,
      matchmaking: this,
      debug: config.debug !== false,
    });
    server.start();
    this.gpServers.set(gameId, server);
  }

  /**
   * Obtener el servidor GP para un juego
   * @param {string} gameId - ID del juego
   * @returns {GPServer|null}
   */
  getGPServer(gameId) {
    return this.gpServers.get(gameId) || null;
  }

  /**
   * Detener todos los emuladores y servidores GP
   */
  stopAllEmulators() {
    // Detener emuladores HTTP
    for (const [gameId, emulator] of this.emulators) {
      emulator.stop();
      console.log(`[EME] 🛑 Emulador HTTP ${gameId} detenido`);
    }
    this.emulators.clear();

    // Detener servidores GP
    for (const [gameId, server] of this.gpServers) {
      server.stop();
      console.log(`[EME] 🛑 Servidor GP ${gameId} detenido`);
    }
    this.gpServers.clear();
  }

  // ============================================================
  // 5. EVENTOS
  // ============================================================

  /**
   * Registrar un listener de evento
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Función a ejecutar
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  /**
   * Emitir un evento
   * @param {string} event - Nombre del evento
   * @param {*} data - Datos del evento
   * @private
   */
  _emit(event, data) {
    const callbacks = this.listeners[event] || [];
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EME] Error en evento ${event}:`, error);
      }
    }
  }

  // ============================================================
  // 6. ESTADO
  // ============================================================

  /**
   * Obtener el estado completo de EME
   * @returns {Object} Estado
   */
  getState() {
    return {
      rooms: this.rooms.getAll(),
      players: this.players.getAll(),
      games: this.games.getAll(),
      emulators: Array.from(this.emulators.keys()),
      gpServers: Array.from(this.gpServers.keys()),
    };
  }

  /**
   * Obtener un resumen del estado (para el frontend)
   * @returns {Object} Resumen
   */
  getSummary() {
    return {
      totalRooms: this.rooms.count(),
      totalPlayers: this.players.count(),
      activeGames: this.games.getActive(),
      emulators: Array.from(this.emulators.keys()),
      gpServers: Array.from(this.gpServers.keys()),
    };
  }

  // ============================================================
  // 7. LIMPIEZA
  // ============================================================

  /**
   * Apagar EME
   */
  shutdown() {
    this.stopAllEmulators();
    this.rooms.clear();
    this.players.clear();
    console.log('[EME] 🛑 Matchmaking Engine apagado');
  }
}

module.exports = MatchmakingEngine;
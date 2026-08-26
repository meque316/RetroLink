// electron/bridge/core/matchmaking/emulators/GameSpyEmulator.js

const http = require('http');
const url = require('url');

/**
 * GameSpyEmulator - Emulador de GameSpy para Warhammer: Soulstorm
 * 
 * GameSpy era el servicio de matchmaking que Soulstorm usaba originalmente.
 * Fue eliminado en la versión 1.30 (Steam).
 * 
 * Este emulador restaura el matchmaking redirigiendo las peticiones
 * de Soulstorm a un servidor local que emula las APIs de GameSpy.
 * 
 * GameSpy usaba HTTP/JSON sobre puertos dinámicos. Soulstorm espera
 * respuestas en formato JSON con información de salas, jugadores, etc.
 */
class GameSpyEmulator {
  constructor(options = {}) {
    this.port = options.port || 3001;
    this.host = options.host || '127.0.0.1';
    this.matchmaking = options.matchmaking || null;
    this.server = null;
    this.running = false;
    
    // Endpoints que Soulstorm espera
    this.endpoints = {
      '/gamespy/lobby': this._handleLobby.bind(this),
      '/gamespy/join': this._handleJoin.bind(this),
      '/gamespy/host': this._handleHost.bind(this),
      '/gamespy/status': this._handleStatus.bind(this),
      '/gamespy/players': this._handlePlayers.bind(this),
    };
    
    console.log('[GameSpy] 🎮 Emulador GameSpy inicializado');
  }

  /**
   * Iniciar el servidor
   */
  start() {
    if (this.running) {
      console.log('[GameSpy] ℹ️ Emulador ya está corriendo');
      return;
    }

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    this.server.listen(this.port, this.host, () => {
      this.running = true;
      console.log(`[GameSpy] 🎮 Emulador GameSpy en http://${this.host}:${this.port}`);
      console.log('[GameSpy] 📋 Endpoints disponibles:');
      console.log('[GameSpy]   - GET  /gamespy/lobby  (listar salas)');
      console.log('[GameSpy]   - POST /gamespy/join   (unirse a sala)');
      console.log('[GameSpy]   - POST /gamespy/host   (crear sala)');
      console.log('[GameSpy]   - GET  /gamespy/status (estado de sala)');
      console.log('[GameSpy]   - GET  /gamespy/players (jugadores en sala)');
    });
  }

  /**
   * Detener el servidor
   */
  stop() {
    if (!this.running) return;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.running = false;
    console.log('[GameSpy] 🛑 Emulador GameSpy detenido');
  }

  /**
   * Verificar si está corriendo
   */
  isRunning() {
    return this.running;
  }

  // ============================================================
  // MANEJO DE PETICIONES
  // ============================================================

  _handleRequest(req, res) {
    const parsedUrl = url.parse(req.url || '');
    let pathname = parsedUrl.pathname || '';

    console.log(`[GameSpy] 📥 ${req.method} ${pathname}`);

    // Configurar CORS (para permitir peticiones desde el frontend si es necesario)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Buscar el endpoint correspondiente
    let handler = this.endpoints[pathname];
    if (handler) {
      handler(req, res);
      return;
    }

    // Endpoint por defecto
    console.log(`[GameSpy] ⚠️ Endpoint no reconocido: ${pathname}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  // ============================================================
  // ENDPOINTS DE GAMESPY
  // ============================================================

  /**
   * GET /gamespy/lobby - Listar todas las salas disponibles
   */
  _handleLobby(req, res) {
    console.log('[GameSpy] 📋 Lobby solicitado');

    // Obtener salas de EME
    const rooms = this.matchmaking ? this.matchmaking.getRooms('dow_soulstorm') : [];
    console.log(`[GameSpy] 📋 ${rooms.length} salas encontradas`);

    // Formato que Soulstorm espera (similar al original de GameSpy)
    const response = rooms.map(room => ({
      id: room.id,
      name: room.name,
      host: room.hostId,
      players: room.players ? room.players.length : 0,
      maxPlayers: room.maxPlayers || 8,
      map: room.options?.map || 'Random',
      gameType: room.options?.gameType || 'Annihilation',
      status: room.status || 'waiting',
      createdAt: room.createdAt,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      games: response,
      total: response.length,
    }));
  }

  /**
   * POST /gamespy/join - Unirse a una sala
   * Body: { gameId: number, playerName: string }
   */
  _handleJoin(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('[GameSpy] 🔗 Join solicitado');

      let data = {};
      try {
        data = JSON.parse(body);
      } catch (e) {
        console.log('[GameSpy] ⚠️ Body no es JSON válido:', body);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
        return;
      }

      const roomId = data.gameId;
      const playerName = data.playerName || 'Jugador';

      console.log(`[GameSpy] 🔗 Uniendo a sala ${roomId} como ${playerName}`);

      // Obtener sala de EME
      const room = this.matchmaking ? this.matchmaking.getRoom(roomId) : null;
      if (!room) {
        console.log(`[GameSpy] ❌ Sala ${roomId} no encontrada`);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Room not found' }));
        return;
      }

      if (room.isFull && room.isFull()) {
        console.log(`[GameSpy] ❌ Sala ${roomId} está llena`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Room is full' }));
        return;
      }

      // Devolver información de conexión (IP y puerto del host a través de ENE)
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        host: '127.0.0.1',
        port: 6112,
        roomId: roomId,
        playerName: playerName,
      }));
    });
  }

  /**
   * POST /gamespy/host - Crear una sala (desde Soulstorm)
   * Body: { gameName: string, maxPlayers: number, map: string }
   */
  _handleHost(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      console.log('[GameSpy] 🏗️ Host solicitado');

      let data = {};
      try {
        data = JSON.parse(body);
      } catch (e) {
        console.log('[GameSpy] ⚠️ Body no es JSON válido:', body);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
        return;
      }

      const roomName = data.gameName || 'Sala de Soulstorm';
      const maxPlayers = data.maxPlayers || 8;
      const map = data.map || 'Random';

      console.log(`[GameSpy] 🏗️ Creando sala: ${roomName}`);

      // En un flujo real, EME debería crear la sala aquí
      // Pero normalmente la sala ya fue creada por el frontend de RetroLink
      // Este endpoint es para cuando Soulstorm intenta crear la sala directamente

      // Si no hay matchmaking, devolver error
      if (!this.matchmaking) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Matchmaking not available' }));
        return;
      }

      // Crear sala en EME (si no existe)
      const existingRooms = this.matchmaking.getRooms('dow_soulstorm');
      const existing = existingRooms.find(r => r.name === roomName);

      let roomId;
      if (existing) {
        roomId = existing.id;
      } else {
        const newRoom = this.matchmaking.createRoom({
          gameId: 'dow_soulstorm',
          name: roomName,
          hostId: 'soulstorm-host', // En un flujo real, esto sería un socketId
          options: { map, gameType: 'Annihilation' },
          maxPlayers: maxPlayers,
        });
        roomId = newRoom.id;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        gameId: roomId,
        gameName: roomName,
        maxPlayers: maxPlayers,
        map: map,
      }));
    });
  }

  /**
   * GET /gamespy/status - Estado de una sala
   * Query: ?gameId=123
   */
  _handleStatus(req, res) {
    const parsedUrl = url.parse(req.url || '');
    const query = new URLSearchParams(parsedUrl.search);
    const roomId = query.get('gameId');

    console.log(`[GameSpy] 📊 Estado solicitado para sala ${roomId}`);

    if (!roomId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing gameId' }));
      return;
    }

    const room = this.matchmaking ? this.matchmaking.getRoom(parseInt(roomId)) : null;
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Room not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      game: {
        id: room.id,
        name: room.name,
        host: room.hostId,
        players: room.players ? room.players.length : 0,
        maxPlayers: room.maxPlayers || 8,
        status: room.status || 'waiting',
      },
    }));
  }

  /**
   * GET /gamespy/players - Lista de jugadores en una sala
   * Query: ?gameId=123
   */
  _handlePlayers(req, res) {
    const parsedUrl = url.parse(req.url || '');
    const query = new URLSearchParams(parsedUrl.search);
    const roomId = query.get('gameId');

    console.log(`[GameSpy] 👥 Jugadores solicitados para sala ${roomId}`);

    if (!roomId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing gameId' }));
      return;
    }

    const room = this.matchmaking ? this.matchmaking.getRoom(parseInt(roomId)) : null;
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Room not found' }));
      return;
    }

    // Obtener nombres de jugadores
    const players = (room.players || []).map(playerId => {
      const player = this.matchmaking ? this.matchmaking.getPlayer(playerId) : null;
      return {
        id: playerId,
        name: player ? player.username : 'Jugador',
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      players: players,
    }));
  }
}

module.exports = GameSpyEmulator;
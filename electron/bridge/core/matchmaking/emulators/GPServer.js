// electron/bridge/core/matchmaking/emulators/GPServer.js

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * GPServer - Servidor GameSpy Presence (GP) para Soulstorm v1.2 Boxed
 * 
 * Este servidor emula el protocolo GP nativo de GameSpy en TCP.
 * Escucha en el puerto 29900 y maneja:
 * - Login (autenticación)
 * - Challenge-response
 * - Lobby (listado de salas)
 * - Heartbeat
 * 
 * Referencia: UniSpyServer (https://github.com/GameProgressive/UniSpyServer)
 */
class GPServer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.port = options.port || 29900;
    this.host = options.host || '0.0.0.0';
    this.matchmaking = options.matchmaking || null;
    this.debug = options.debug || true;
    
    this.server = null;
    this.running = false;
    this.clients = new Map(); // socketId -> client data
    
    // Generar un challenge estático para pruebas
    // En producción, esto debería ser aleatorio por sesión
    this.serverChallenge = '1234567890';
    
    // Sesiones activas (para mantener estado entre peticiones)
    this.sessions = new Map();
    
    // Logging
    this.logs = [];
    
    console.log('[GPServer] 🎮 Servidor GP inicializado');
    console.log(`[GPServer] 📡 Puerto: ${this.port}`);
    console.log(`[GPServer] 🔧 Debug: ${this.debug ? 'ON' : 'OFF'}`);
  }

  /**
   * Iniciar el servidor
   */
  start() {
    if (this.running) {
      console.log('[GPServer] ℹ️ El servidor ya está corriendo');
      return;
    }

    try {
      this.server = net.createServer((socket) => {
        this._handleConnection(socket);
      });

      this.server.listen(this.port, this.host, () => {
        this.running = true;
        console.log(`[GPServer] ✅ Servidor GP escuchando en ${this.host}:${this.port}`);
        console.log('[GPServer] 📋 Esperando conexiones de Soulstorm...');
      });

      this.server.on('error', (error) => {
        console.error('[GPServer] ❌ Error en el servidor:', error.message);
      });

    } catch (error) {
      console.error('[GPServer] ❌ Error al iniciar:', error.message);
    }
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
    this.clients.clear();
    this.sessions.clear();
    
    console.log('[GPServer] 🛑 Servidor GP detenido');
  }

  /**
   * Verificar si está corriendo
   */
  isRunning() {
    return this.running;
  }

  // ============================================================
  // MANEJO DE CONEXIONES
  // ============================================================

  _handleConnection(socket) {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    
    console.log(`[GPServer] 🔗 Nueva conexión desde ${clientId}`);
    
    // Crear estado del cliente
    const clientData = {
      id: clientId,
      socket: socket,
      buffer: '',
      sessionId: null,
      userId: null,
      profileId: null,
      authenticated: false,
      challengeSent: false,
      loginAttempts: 0,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };
    
    this.clients.set(clientId, clientData);
    
    // Configurar eventos del socket
    socket.on('data', (data) => {
      this._handleData(clientId, data);
    });
    
    socket.on('end', () => {
      console.log(`[GPServer] 🔌 Conexión cerrada por el cliente: ${clientId}`);
      this.clients.delete(clientId);
    });
    
    socket.on('error', (error) => {
      console.error(`[GPServer] ❌ Error en socket ${clientId}:`, error.message);
      this.clients.delete(clientId);
    });
    
    // Si el cliente no envía nada en 30 segundos, desconectar
    socket.setTimeout(30000, () => {
      console.log(`[GPServer] ⏰ Timeout para ${clientId}`);
      socket.end();
    });
  }

  // ============================================================
  // MANEJO DE DATOS
  // ============================================================

  _handleData(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    client.lastActivity = Date.now();
    
    // Convertir a string ASCII (GameSpy usa ASCII)
    const message = data.toString('ascii');
    
    this._log('📥', `[${clientId}] Recibido: ${message}`);
    
    // Acumular en buffer (los mensajes pueden llegar fragmentados)
    client.buffer += message;
    
    // Procesar mensajes completos (terminan con \final\)
    const messages = client.buffer.split('\\final\\');
    
    // Procesar todos los mensajes completos
    for (let i = 0; i < messages.length - 1; i++) {
      const fullMessage = messages[i] + '\\final\\';
      this._processMessage(clientId, fullMessage);
    }
    
    // Guardar lo que sobró (mensaje incompleto)
    client.buffer = messages[messages.length - 1] || '';
  }

  // ============================================================
  // PROCESAMIENTO DE MENSAJES
  // ============================================================

  _processMessage(clientId, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('📝', `[${clientId}] Procesando: ${rawMessage}`);
    
    // Parsear el mensaje en pares key-value
    const parts = rawMessage.split('\\').filter(part => part.length > 0);
    
    if (parts.length === 0) {
      this._log('⚠️', `[${clientId}] Mensaje vacío`);
      return;
    }
    
    // El primer elemento suele ser el comando
    const command = parts[0].toLowerCase();
    this._log('🎯', `[${clientId}] Comando: ${command}`);
    
    // Construir un objeto con los pares
    const params = {};
    for (let i = 1; i < parts.length; i += 2) {
      if (i + 1 < parts.length) {
        params[parts[i]] = parts[i + 1];
      }
    }
    
    this._log('📋', `[${clientId}] Parámetros:`, params);
    
    // Manejar el comando
    switch (command) {
      case 'login':
        this._handleLogin(clientId, params, rawMessage);
        break;
        
      case 'newuser':
        this._handleNewUser(clientId, params, rawMessage);
        break;
        
      case 'list':
        this._handleList(clientId, params, rawMessage);
        break;
        
      case 'ka':
        this._handleKeepAlive(clientId, params, rawMessage);
        break;
        
      case 'logout':
        this._handleLogout(clientId, params, rawMessage);
        break;
        
      case 'status':
        this._handleStatus(clientId, params, rawMessage);
        break;
        
      case 'statusinfo':
        this._handleStatusInfo(clientId, params, rawMessage);
        break;
        
      case 'addbuddy':
        this._handleAddBuddy(clientId, params, rawMessage);
        break;
        
      default:
        this._log('❓', `[${clientId}] Comando desconocido: ${command}`);
        this._sendResponse(clientId, `\\error\\Comando desconocido: ${command}\\final\\`);
    }
  }

  // ============================================================
  // HANDLERS DE COMANDOS (prioridad: login y list)
  // ============================================================

  /**
   * HANDLER: login - Autenticación de usuario
   */
  _handleLogin(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('🔑', `[${clientId}] Login solicitado`);
    
    // Extraer información del login
    const username = params['user'] || params['uniquenick'] || 'testuser';
    const password = params['pass'] || params['password'] || 'testpass';
    const productId = params['productid'] || '1';
    const gameName = params['gamename'] || 'dow';
    const sdkRevision = params['sdkrev'] || '0';
    
    this._log('👤', `[${clientId}] Usuario: ${username}`);
    this._log('🔐', `[${clientId}] Producto: ${productId}, Juego: ${gameName}`);
    
    // Verificar si tenemos un challenge pendiente
    if (params['challenge'] && params['response']) {
      // El cliente ya tiene un challenge y está respondiendo
      this._log('📝', `[${clientId}] Challenge recibido: ${params['challenge']}`);
      this._log('📝', `[${clientId}] Response: ${params['response']}`);
      
      // Para la versión simplificada, aceptamos cualquier respuesta
      // En producción, deberíamos validar el hash
      this._sendLoginSuccess(clientId, username);
      return;
    }
    
    // Si estamos en modo simplificado, respondemos éxito directamente
    // Pero también podemos enviar un challenge para probar el flujo completo
    
    // OPCIÓN 1: Respuesta directa (éxito sin challenge)
    this._log('⚡', `[${clientId}] Modo simplificado: login exitoso directo`);
    this._sendLoginSuccess(clientId, username);
    
    // OPCIÓN 2: Enviar challenge (descomentar para probar el flujo completo)
    // this._sendChallenge(clientId);
  }

  /**
   * HANDLER: newuser - Creación de cuenta
   */
  _handleNewUser(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('📝', `[${clientId}] NewUser solicitado`);
    
    const nick = params['nick'] || 'testuser';
    const email = params['email'] || 'test@test.com';
    const password = params['pass'] || 'testpass';
    
    this._log('👤', `[${clientId}] Nick: ${nick}, Email: ${email}`);
    
    // Para pruebas, siempre éxito
    this._sendResponse(clientId, 
      `\\nur\\userid\\${Date.now()}\\profileid\\${Date.now()}\\id\\1\\final\\`
    );
  }

  /**
   * HANDLER: list - Listado de salas (lobby)
   */
  _handleList(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('📋', `[${clientId}] List (lobby) solicitado`);
    
    // Obtener salas de EME
    let rooms = [];
    if (this.matchmaking) {
      rooms = this.matchmaking.getRooms('dow_soulstorm');
    }
    
    this._log('📊', `[${clientId}] ${rooms.length} salas encontradas`);
    
    if (rooms.length === 0) {
      // Sin salas - responder con lista vacía
      this._sendResponse(clientId, `\\list\\0\\rooms\\\\final\\`);
    } else {
      // Construir lista de IDs de sala
      const roomIds = rooms.map(room => room.id).join(',');
      const roomNames = rooms.map(room => room.name).join(',');
      
      // Formato esperado por Soulstorm según UniSpyServer
      // \list\<count>\rooms\<id1,id2,...>\names\<name1,name2,...>\final\
      this._sendResponse(clientId, 
        `\\list\\${rooms.length}\\rooms\\${roomIds}\\names\\${roomNames}\\final\\`
      );
    }
  }

  /**
   * HANDLER: ka - Keep Alive
   */
  _handleKeepAlive(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('💓', `[${clientId}] Keep Alive recibido`);
    
    // Responder con keep alive
    this._sendResponse(clientId, `\\ka\\final\\`);
  }

  /**
   * HANDLER: logout - Cierre de sesión
   */
  _handleLogout(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('👋', `[${clientId}] Logout solicitado`);
    client.authenticated = false;
    
    this._sendResponse(clientId, `\\logout\\final\\`);
  }

  /**
   * HANDLER: status - Estado del jugador
   */
  _handleStatus(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('📊', `[${clientId}] Status solicitado`);
    
    const status = params['status'] || '1'; // 1 = online
    const statString = params['statstring'] || 'Jugando';
    const locString = params['locstring'] || 'Sala de prueba';
    
    this._sendResponse(clientId, 
      `\\status\\status\\${status}\\statstring\\${statString}\\locstring\\${locString}\\final\\`
    );
  }

  /**
   * HANDLER: statusinfo - Información de estado (para el sistema de amigos)
   */
  _handleStatusInfo(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('📊', `[${clientId}] StatusInfo solicitado`);
    
    // Responder con información básica
    this._sendResponse(clientId, 
      `\\bsi\\state\\online\\profile\\${client.profileId || 1}\\bip\\127.0.0.1\\hostIp\\127.0.0.1\\hprivIp\\127.0.0.1\\qport\\6112\\hport\\6112\\sessflags\\0\\rstatus\\Jugando\\gameType\\0\\gameVnt\\0\\gameMn\\default\\product\\1\\qmodeflags\\0\\final\\`
    );
  }

  /**
   * HANDLER: addbuddy - Agregar amigo
   */
  _handleAddBuddy(clientId, params, rawMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    this._log('👥', `[${clientId}] AddBuddy solicitado`);
    
    const newProfileId = params['newprofileid'] || '0';
    const reason = params['reason'] || 'Amigo';
    
    // Responder con éxito
    this._sendResponse(clientId, `\\bm\\1\\f\\${newProfileId}\\date\\${Date.now()}\\final\\`);
  }

  // ============================================================
  // FUNCIONES DE RESPUESTA
  // ============================================================

  /**
   * Enviar challenge al cliente (para autenticación)
   */
  _sendChallenge(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Generar challenge (en producción, aleatorio)
    const challenge = this.serverChallenge;
    
    this._log('🔑', `[${clientId}] Enviando challenge: ${challenge}`);
    
    const response = `\\lc\\1\\challenge\\${challenge}\\id\\1\\final\\`;
    this._sendResponse(clientId, response);
    
    client.challengeSent = true;
  }

  /**
   * Enviar respuesta de login exitoso
   */
  _sendLoginSuccess(clientId, username) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Crear IDs de sesión
    const userId = Math.floor(Math.random() * 10000) + 1;
    const profileId = Math.floor(Math.random() * 10000) + 1;
    const sessionId = Math.floor(Math.random() * 10000);
    const loginTicket = 'ticket_' + Date.now();
    
    // Guardar en cliente
    client.userId = userId;
    client.profileId = profileId;
    client.sessionId = sessionId;
    client.authenticated = true;
    
    // Construir respuesta en formato GP
    // Formato: \lc\2\sesskey\<session>\proof\<hash>\userid\<id>\profileid\<id>\lt\<ticket>\id\<id>\final\
    const response = 
      `\\lc\\2` +
      `\\sesskey\\${sessionId}` +
      `\\proof\\0000000000000000` + // En producción, esto sería el hash real
      `\\userid\\${userId}` +
      `\\profileid\\${profileId}` +
      `\\lt\\${loginTicket}` +
      `\\id\\1` +
      `\\final\\`;
    
    this._log('✅', `[${clientId}] Login exitoso para ${username}`);
    this._log('📋', `[${clientId}] Sesión: ${sessionId}, Usuario: ${userId}, Perfil: ${profileId}`);
    
    this._sendResponse(clientId, response);
  }

  /**
   * Enviar respuesta al cliente
   */
  _sendResponse(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Asegurar que termina en \final\
    let response = message;
    if (!response.endsWith('\\final\\')) {
      response += '\\final\\';
    }
    
    this._log('📤', `[${clientId}] Enviando: ${response}`);
    
    try {
      client.socket.write(response, 'ascii');
    } catch (error) {
      this._log('❌', `[${clientId}] Error al enviar: ${error.message}`);
    }
  }

  // ============================================================
  // FUNCIONES DE UTILIDAD
  // ============================================================

  /**
   * Logging con timestamp
   */
  _log(icon, message, data = null) {
    if (!this.debug) return;
    
    const timestamp = new Date().toISOString().slice(11, 19);
    const logMessage = `[GPServer] ${timestamp} ${icon} ${message}`;
    
    console.log(logMessage);
    
    if (data) {
      console.log('  └─', data);
    }
    
    // Guardar en historial
    this.logs.push({
      timestamp: Date.now(),
      icon,
      message,
      data,
    });
    
    // Mantener solo los últimos 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
  }

  /**
   * Obtener logs recientes
   */
  getLogs(count = 20) {
    return this.logs.slice(-count);
  }

  /**
   * Obtener estadísticas del servidor
   */
  getStats() {
    return {
      running: this.running,
      clients: this.clients.size,
      sessions: this.sessions.size,
      port: this.port,
      host: this.host,
      logs: this.logs.length,
      connectedAt: this.running ? new Date().toISOString() : null,
    };
  }
}

module.exports = GPServer;
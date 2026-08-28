// electron/bridge/dow_soulstorm/index.js

const { createBridge } = require('../core/create-bridge');
const { sendStatus } = require('./status');
const { createChannelHandlers } = require('./channel-handlers');
const dowProfile = require('./profile');
const MatchmakingEngine = require('../core/matchmaking');
const { enableGameSpyRedirect, disableGameSpyRedirect } = require('./hosts-manager');

// ===== NUEVO: Crear instancia de EME =====
const matchmaking = new MatchmakingEngine({
  port: 3000,
  autoStartEmulators: true,
});

// Registrar Soulstorm en EME
matchmaking.registerGame('dow_soulstorm', {
  name: 'Warhammer 40,000: Dawn of War - Soulstorm',
  maxPlayers: 8,
  requiresMatchmaking: true,
  emulator: 'gamespy',
});

// ===== NUEVO: Eventos de EME =====
matchmaking.on('room-created', (room) => {
  console.log(`[Bridge-DoW] 🏠 Sala creada en EME: ${room.name} (${room.id})`);
});

matchmaking.on('room-closed', (room) => {
  console.log(`[Bridge-DoW] 🚪 Sala cerrada en EME: ${room.name} (${room.id})`);
});

matchmaking.on('player-joined', (data) => {
  console.log(`[Bridge-DoW] 👤 Jugador unido a sala ${data.roomId}`);
});

// ===== Crear bridge como siempre =====
const channels = createChannelHandlers();

const identity = {
  bridgeName: 'Bridge-DoW',
  logPrefix: '[Bridge-DoW]',
  peerNamePrefix: 'RetroLink-DoW',
  udpLogPrefix: 'Bridge-DoW-UDP',
};

// ===== NUEVO: Pasar matchmaking al bridge =====
const bridge = createBridge({
  identity,
  profile: dowProfile,
  sendStatus,
  channels,
  matchmaking,
  connectingStatus: 'Conectando al servidor de señales...',
});

// ===== NUEVO: Activar redirección de GameSpy al iniciar el bridge =====
const originalStartBridge = bridge.startBridge;

bridge.startBridge = async function(...args) {
  console.log('[Bridge-DoW] 🔄 Activando redirección de GameSpy...');
  
  const success = enableGameSpyRedirect();
  if (!success) {
    console.warn('[Bridge-DoW] ⚠️ No se pudo activar la redirección de GameSpy. Ejecuta como administrador.');
  }
  
  return originalStartBridge.apply(this, args);
};

// ===== NUEVO: Desactivar redirección de GameSpy al resetear el bridge =====
const originalResetBridge = bridge.resetBridge;

bridge.resetBridge = function(...args) {
  console.log('[Bridge-DoW] 🔄 Desactivando redirección de GameSpy...');
  disableGameSpyRedirect();
  return originalResetBridge.apply(this, args);
};

// ===== NUEVO: Guardar el puerto asignado para usarlo en el mensaje =====
let assignedClientPort = null;

// ===== NUEVO: Función para obtener la IP virtual del host desde ENE =====
function getVirtualHostIP() {
  // La IP virtual del host en la red de ENE siempre es 10.0.0.1
  // Nota: si el host no es 10.0.0.1 (por ejemplo, si se asigna otra IP), 
  // habría que obtenerla del estado de ENE. Por ahora la fijamos.
  return '10.0.0.1';
}
// ===== FIN NUEVO =====

// ===== NUEVO: Sobrescribir launchGame para inyectar el puerto dinámico =====
const originalLaunchGame = bridge.launchGame;

bridge.launchGame = function(gamePath, hostIp, roomId, isHost, gameId, gameOptions, extraArgs) {
  // Obtener el puerto asignado del bridge (esto es para logs internos)
  const port = bridge.getClientPort ? bridge.getClientPort() : 6112;
  assignedClientPort = port;

  console.log(`[Bridge-DoW] 🎮 Lanzando juego con puerto interno: ${port}`);

  // ===== NUEVO: Usar IP virtual de ENE en lugar de 127.0.0.1 =====
  const virtualIP = getVirtualHostIP();

  if (isHost) {
    console.log(`
╔═══════════════════════════════════════════════════════════════════
║  🎮 HOST: Warhammer 40,000: Dawn of War - Soulstorm
║
║  1. Abre Soulstorm
║  2. Multiplayer → LAN → Create Game
║  3. Espera a que los clientes se conecten
║
║  Los clientes deben conectarse a la IP virtual de ENE:
║  ${virtualIP}:6112
╚═══════════════════════════════════════════════════════════════════`);
  } else {
    console.log(`
╔═══════════════════════════════════════════════════════════════════
║  🎮 CLIENTE: Warhammer 40,000: Dawn of War - Soulstorm
║
║  1. Abre Soulstorm
║  2. Multiplayer → LAN → Direct IP
║  3. Ingresa: ${virtualIP}:6112
║  4. Presiona Connect
╚═══════════════════════════════════════════════════════════════════`);
  }
  // ===== FIN NUEVO =====

  // Llamar al launch original
  return originalLaunchGame.call(this, gamePath, hostIp, roomId, isHost, gameId, gameOptions, extraArgs);
};

// ===== NUEVO: Obtener el puerto asignado =====
bridge.getAssignedClientPort = function() {
  return assignedClientPort || 6112;
};

// Exportar el bridge y EME
module.exports = bridge;
module.exports.matchmaking = matchmaking;
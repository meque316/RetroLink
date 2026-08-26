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
  matchmaking, // <-- Esto permite que el bridge use EME
  connectingStatus: 'Conectando al servidor de señales...',
});

// ===== NUEVO: Activar redirección de GameSpy al iniciar el bridge =====
const originalStartBridge = bridge.startBridge;

bridge.startBridge = async function(...args) {
  console.log('[Bridge-DoW] 🔄 Activando redirección de GameSpy...');
  
  // Intentar activar la redirección del hosts file
  const success = enableGameSpyRedirect();
  if (!success) {
    console.warn('[Bridge-DoW] ⚠️ No se pudo activar la redirección de GameSpy. Ejecuta como administrador.');
  }
  
  // Llamar al start original
  return originalStartBridge.apply(this, args);
};

// ===== NUEVO: Desactivar redirección de GameSpy al resetear el bridge =====
const originalResetBridge = bridge.resetBridge;

bridge.resetBridge = function(...args) {
  console.log('[Bridge-DoW] 🔄 Desactivando redirección de GameSpy...');
  
  // Intentar desactivar la redirección del hosts file
  disableGameSpyRedirect();
  
  // Llamar al reset original
  return originalResetBridge.apply(this, args);
};

// Exportar el bridge y EME (para acceso externo)
module.exports = bridge;
module.exports.matchmaking = matchmaking;
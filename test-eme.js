// test-eme.js

const MatchmakingEngine = require('./electron/bridge/core/matchmaking');

// Crear instancia de EME
const eme = new MatchmakingEngine({
  port: 3000,
  autoStartEmulators: true,
});

// Registrar el juego Soulstorm
eme.registerGame('dow_soulstorm', {
  name: 'Warhammer 40,000: Dawn of War - Soulstorm',
  maxPlayers: 8,
  requiresMatchmaking: true,
  emulator: 'gamespy',
});

// Crear una sala de prueba
console.log('\n[TEST] Creando sala de prueba...');
const room = eme.createRoom({
  gameId: 'dow_soulstorm',
  name: 'Sala de Prueba',
  hostId: 'test-host-123',
  hostUsername: 'TestHost',
  options: { map: 'Random' },
  maxPlayers: 4,
});

console.log(`[TEST] Sala creada: ID=${room.id}, Nombre=${room.name}`);

// Verificar que la sala está en EME
const rooms = eme.getRooms('dow_soulstorm');
console.log(`[TEST] Salas en EME: ${rooms.length}`);

// Esperar 2 segundos para que el emulador se inicie
setTimeout(() => {
  console.log('\n[TEST] Probando GameSpyEmulator...');
  
  // El emulador debería estar corriendo en el puerto 3001
  const http = require('http');
  
  const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/gamespy/lobby',
    method: 'GET',
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      console.log(`[TEST] Respuesta del lobby: ${res.statusCode}`);
      if (res.statusCode === 200) {
        try {
          const parsed = JSON.parse(data);
          console.log(`[TEST] Partidas encontradas: ${parsed.total || 0}`);
          console.log(`[TEST] Datos:`, JSON.stringify(parsed, null, 2));
          console.log('\n✅ ¡EME + GameSpyEmulator funcionan!');
        } catch (e) {
          console.log('[TEST] Error parseando respuesta:', e.message);
        }
      }
      
      // Detener EME
      eme.shutdown();
      console.log('\n[TEST] Prueba completada.');
    });
  });
  
  req.on('error', (err) => {
    console.log('[TEST] ❌ Error conectando al emulador:', err.message);
    console.log('[TEST] ¿El emulador se inició correctamente?');
    eme.shutdown();
  });
  
  req.end();
}, 3000);
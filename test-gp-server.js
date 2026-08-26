// test-gp-server.js

const GPServer = require('./electron/bridge/core/matchmaking/emulators/GPServer');

// Crear servidor sin EME para pruebas
const server = new GPServer({
  port: 29900,
  host: '0.0.0.0',
  debug: true,
});

server.start();

console.log('Servidor GP iniciado. Esperando conexiones...');
console.log('Presiona Ctrl+C para detener');

// Mantener el proceso vivo
process.stdin.resume();

// Manejar cierre
process.on('SIGINT', () => {
  console.log('\nDeteniendo servidor...');
  server.stop();
  process.exit(0);
});
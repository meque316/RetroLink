// electron/games/cs16.js
module.exports = {
  id: 'cs16',
  name: 'Counter-Strike 1.6',
  defaultPort: 27015,
  clientPortBase: 27015,
  
  // ✅ Argumentos para HOST (servidor)
  getHostArgs(extraArgs = []) {
    return [
      '-game', 'cstrike',           // Modo CS
      '+sv_lan', '1',               // Modo LAN
      '+maxplayers', '16',          // Máximo de jugadores
      '+map', 'de_dust2',           // Mapa por defecto
      '+port', this.defaultPort.toString(), // Puerto
      '+sv_allowdownload', '1',     // Permitir descargas
      '+sv_allowupload', '1',       // Permitir subidas
      '+sv_pure', '0',              // Desactivar pure
      '+sv_cheats', '0',            // Sin cheats
      '+sv_aim', '0',               // Sin aimbot
      '+sv_autobunnyhopping', '0',  // Sin bunny hopping automático
      '+sv_gravity', '800',         // Gravedad normal
      '+sv_friction', '4',          // Fricción normal
      '+sv_airaccelerate', '10',    // Aceleración normal
      '+sv_voiceenable', '1',       // Voz habilitada
      '+sv_alltalk', '0',           // Solo equipo
      '+mp_timelimit', '30',        // Tiempo límite
      '+mp_winlimit', '0',          // Sin límite de victorias
      '+mp_maxrounds', '0',         // Sin límite de rondas
      '+mp_friendlyfire', '0',      // Sin friendly fire
      '+mp_autoteambalance', '1',   // Balanceo automático
      '+mp_limitteams', '2',        // Límite de diferencia de equipos
      '+mp_startmoney', '800',      // Dinero inicial
      '+mp_roundtime', '5',         // Tiempo por ronda
      '+mp_freezetime', '5',        // Tiempo de congelamiento
      '+mp_buytime', '0.25',        // Tiempo de compra
      '+sv_restartround', '0',      // Sin reinicio automático
      '+sv_restart', '0',           // Sin reinicio automático
      ...extraArgs
    ];
  },
  
  // ✅ Argumentos para CLIENTE
  getClientArgs(port, extraArgs = []) {
    return [
      '-game', 'cstrike',           // Modo CS
      '+connect', `127.0.0.1:${port}`, // Conectar al bridge
      '+port', port.toString(),     // Puerto local
      '+rate', '25000',             // Tasa de datos
      '+cl_updaterate', '20',       // Actualizaciones por segundo
      '+cl_cmdrate', '20',          // Comandos por segundo
      '+cl_dynamiccrosshair', '0',  // Mira estática
      '+fps_max', '100',            // FPS máximos
      '+cl_showfps', '1',           // Mostrar FPS
      '+developer', '0',            // Sin modo desarrollador
      '+condebug', '0',             // Sin debug de consola
      ...extraArgs
    ];
  }
};
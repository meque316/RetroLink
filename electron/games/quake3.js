// electron/games/quake3.js
module.exports = {
  id: 'quake3',
  name: 'Quake III Arena',
  defaultPort: 27960,
  clientPortBase: 27960,
  
  getHostArgs(extraArgs = []) {
    // ✅ SIN dedicated - modo normal con interfaz gráfica
    return [
      '+set', 'sv_lanForce', '1',         // Forzar modo LAN
      '+set', 'sv_pure', '0',             // Desactivar pure
      '+set', 'net_port', this.defaultPort.toString(),
      '+set', 'sv_maxclients', '8',
      '+set', 'sv_allowAnonymous', '1',
      '+set', 'sv_strictAuth', '0',       // Desactivar autenticación
      '+set', 'sv_cheats', '0',
      '+set', 'g_gametype', '0',
      '+set', 'mapname', 'q3dm17',
      '+set', 'sv_hostname', 'RetroLink Server',
      '+set', 'g_inactivity', '0',
      '+set', 'g_doWarmup', '0',
      '+set', 'timelimit', '20',
      '+set', 'fraglimit', '30',
      '+set', 'sv_master1', '',           // Sin maestros (LAN)
      '+set', 'sv_master2', '',
      '+set', 'sv_master3', '',
      '+set', 'sv_master4', '',
      '+set', 'sv_master5', '',
      ...extraArgs
    ];
  },
  
  getClientArgs(port, extraArgs = []) {
    return [
      '+set', 'net_port', port.toString(),
      '+connect', '127.0.0.1',
      ...extraArgs
    ];
  }
};
// electron/games/quake3.js
module.exports = {
  id: 'quake3',
  name: 'Quake III Arena',
  defaultPort: 27960,
  clientPortBase: 27960,
  
  getHostArgs(extraArgs = []) {
    // ✅ Argumentos correctos para host
    return [
      '+set', 'dedicated', '1',           // Modo dedicado
      '+set', 'sv_pure', '0',             // Desactivar pure (para mods)
      '+set', 'net_port', this.defaultPort.toString(), // Puerto fijo
      '+set', 'sv_maxclients', '8',       // Máximo de jugadores
      '+set', 'sv_allowAnonymous', '1',   // Permitir conexiones anónimas
      ...extraArgs
    ];
  },
  
  getClientArgs(port, extraArgs = []) {
    // ✅ Argumentos correctos para cliente
    // El port que recibe es el puerto local del cliente
    return [
      '+set', 'net_port', port.toString(), // Puerto local del cliente
      '+connect', '127.0.0.1',             // Conectar a localhost (el bridge redirige)
      ...extraArgs
    ];
  }
};
// electron/games/quake3.js
module.exports = {
  id: 'quake3',
  name: 'Quake III Arena',
  defaultPort: 27960,
  clientPortBase: 27961,
  
  getHostArgs(extraArgs = []) {
    return [
      '+set', 'dedicated', '1',
      '+set', 'sv_pure', '0',
      '+set', 'net_port', this.defaultPort.toString(),
      '+set', 'sv_maxclients', '8',
      '+set', 'sv_allowAnonymous', '1',
      '+set', 'g_gametype', '0',
      '+set', 'mapname', 'q3dm17',
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
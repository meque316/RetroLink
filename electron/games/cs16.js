// electron/games/cs16.js
module.exports = {
  id: 'cs16',
  name: 'Counter-Strike 1.6',
  defaultPort: 27015,
  clientPortBase: 27016,
  
  getHostArgs(extraArgs = []) {
    return [
      '-console',
      '-game', 'cstrike',
      '+sv_lan', '1',
      '+maxplayers', '16',
      '+map', 'de_dust2',
      '+port', this.defaultPort.toString(),
      '+ip', '0.0.0.0',
      '+sv_allowdownload', '1',
      '+sv_allowupload', '1',
      '+sv_pure', '0',
      '+sv_cheats', '0',
      '+sv_aim', '0',
      '+sv_autobunnyhopping', '0',
      '+sv_gravity', '800',
      '+sv_friction', '4',
      '+sv_airaccelerate', '10',
      '+sv_voiceenable', '1',
      '+sv_alltalk', '0',
      '+mp_timelimit', '30',
      '+mp_winlimit', '0',
      '+mp_maxrounds', '0',
      '+mp_friendlyfire', '0',
      '+mp_autoteambalance', '1',
      '+mp_limitteams', '2',
      '+mp_startmoney', '800',
      '+mp_roundtime', '5',
      '+mp_freezetime', '5',
      '+mp_buytime', '0.25',
      '+sv_restartround', '0',
      '+sv_restart', '0',
      ...extraArgs
    ];
  },
  
  getClientArgs(port, extraArgs = []) {
    return [
      '-console',
      '-game', 'cstrike',
      '+connect', `127.0.0.1:${this.defaultPort}`,
      '+port', port.toString(),
      '+rate', '25000',
      '+cl_updaterate', '20',
      '+cl_cmdrate', '20',
      '+cl_dynamiccrosshair', '0',
      '+fps_max', '100',
      '+cl_showfps', '1',
      '+developer', '0',
      '+condebug', '0',
      '+sv_lan', '1',
      '+ip', '127.0.0.1',
      ...extraArgs
    ];
  }
};
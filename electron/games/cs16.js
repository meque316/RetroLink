// electron/games/cs16.js
module.exports = {
  id: 'cs16',
  name: 'Counter-Strike 1.6',
  
  // ✅ Argumentos para HOST (estilo monolítico)
  getHostArgs(extraArgs = []) {
    return [
      '-game', 'cstrike',
      '+sv_lan', '1',
      '+map', 'de_dust2',
      '+maxplayers', '16',
      '+port', '27015',
      '+sv_allowdownload', '1',
      '+sv_allowupload', '1',
      '+sv_pure', '0',
      '+sv_cheats', '0',
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
      ...extraArgs
    ];
  },
  
  // ✅ Argumentos para CLIENTE (estilo monolítico)
  getClientArgs(port, extraArgs = []) {
    return [
      '-game', 'cstrike',
      '+connect', `127.0.0.1:${port}`,
      '+port', port.toString(),
      '+rate', '25000',
      '+cl_updaterate', '20',
      '+cl_cmdrate', '20',
      '+fps_max', '100',
      '+cl_showfps', '1',
      ...extraArgs
    ];
  }
};
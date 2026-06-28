// games/cs16.js
module.exports = {
  id: 'cs16',
  name: 'Counter-Strike 1.6',
  defaultPort: 27015,
  clientPortBase: 27015,
  
  getHostArgs(extraArgs = []) {
    return ['-game', 'cstrike', '+sv_lan', '1', '+maxplayers', '16', ...extraArgs];
  },
  
  getClientArgs(port, extraArgs = []) {
    return ['-game', 'cstrike', '+connect', `localhost:${port}`, ...extraArgs];
  }
};
// electron/games/cs16.js

module.exports = {
  id: "cs16",
  name: "Counter-Strike 1.6",
  executable: "hl.exe",
  defaultPort: 27015,
  clientPortBase: 27016,

  getHostArgs(options = {}, extraArgs = []) {
    const map = options.map || "de_dust2";
    const maxPlayers = options.maxPlayers || 16;
    const port = options.port || this.defaultPort;

    return [
      "-console",
      "-game", "cstrike",

      "+sv_lan", "1",
      "+maxplayers", String(maxPlayers),
      "+map", map,
      "+port", String(port),
      "+ip", "0.0.0.0",

      "+sv_allowdownload", "1",
      "+sv_allowupload", "1",
      "+sv_pure", "0",
      "+sv_cheats", "0",

      "+mp_timelimit", String(options.timeLimit || 30),
      "+mp_friendlyfire", String(options.friendlyFire ? 1 : 0),
      "+mp_autoteambalance", "1",
      "+mp_limitteams", "2",
      "+mp_startmoney", "800",
      "+mp_roundtime", "5",
      "+mp_freezetime", "5",
      "+mp_buytime", "0.25",

      ...extraArgs,
    ];
  },

  getClientArgs(clientPort, options = {}, extraArgs = []) {
    const connectHost = options.connectHost || "127.0.0.1";
    const connectPort = options.connectPort || this.defaultPort;

    return [
      "-console",
      "-game", "cstrike",

      "+connect", `${connectHost}:${connectPort}`,
      "+port", String(clientPort),
      "+rate", "25000",
      "+cl_updaterate", "20",
      "+cl_cmdrate", "20",
      "+fps_max", "100",
      "+cl_showfps", "1",
      "+developer", "0",
      "+condebug", "0",

      ...extraArgs,
    ];
  },
};
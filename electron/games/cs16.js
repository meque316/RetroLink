module.exports = {
  id: "cs16",
  name: "Counter-Strike 1.6",
  defaultPort: 27015,
  clientPortBase: 27016,
  clientGamePort: 27005,
  serverWarmupMs: 7000,
  supportsRoomOptions: true,

  getHostArgs(options = {}, extraArgs = []) {
    const map = options.map || "de_dust2";
    const maxPlayers = options.maxPlayers || 16;
    const timeLimit = options.timeLimit || 30;
    const friendlyFire = options.friendlyFire ? "1" : "0";

    return [
      "-console",
      "-game", "cstrike",
      "+sv_lan", "1",
      "+maxplayers", String(maxPlayers),
      "+map", map,
      "+port", String(this.defaultPort),
      "+ip", "0.0.0.0",
      "+hostname", "RetroLink CS 1.6",
      "+sv_allowdownload", "1",
      "+sv_allowupload", "1",
      "+sv_pure", "0",
      "+sv_cheats", "0",
      "+mp_timelimit", String(timeLimit),
      "+mp_friendlyfire", friendlyFire,
      "+mp_autoteambalance", "1",
      "+mp_limitteams", "2",
      "+mp_startmoney", "800",
      "+mp_roundtime", "5",
      "+mp_freezetime", "5",
      "+mp_buytime", "0.25",
      ...extraArgs,
    ];
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    return [
      "-console",
      "-game", "cstrike",

      "+clientport", String(this.clientGamePort),
      "+port", String(port),
      "+connect", `127.0.0.1:${this.defaultPort}`,

      "+rate", "25000",
      "+cl_updaterate", "20",
      "+cl_cmdrate", "20",
      "+fps_max", "100",

      ...extraArgs,
    ];
  },
};
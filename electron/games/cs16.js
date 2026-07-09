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
    const startMoney = options.startMoney || 800;
    const freezeTime = options.freezeTime ?? 5;
    const buyTime = options.buyTime ?? 0.25;
    const allTalk = options.allTalk ? "1" : "0";
    const password = options.password?.trim() || "";

    return [
      "-console",
      "-game", "cstrike",

      "+sv_lan", "1",
      "+maxplayers", String(maxPlayers),
      "+map", map,
      "+port", String(this.defaultPort),
      "+ip", "0.0.0.0",

      "+hostname", "RetroLink CS 1.6",
      "+sv_password", password,

      "+sv_allowdownload", "1",
      "+sv_allowupload", "1",
      "+sv_pure", "0",
      "+sv_cheats", "0",

      "+mp_timelimit", String(timeLimit),
      "+mp_friendlyfire", friendlyFire,
      "+mp_startmoney", String(startMoney),
      "+mp_freezetime", String(freezeTime),
      "+mp_buytime", String(buyTime),
      "+mp_autoteambalance", "1",
      "+mp_limitteams", "2",
      "+mp_roundtime", "5",

      "+sv_voiceenable", "1",
      "+sv_alltalk", allTalk,

      ...extraArgs,
    ];
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    const password = options.password?.trim() || "";

    const args = [
      "-console",
      "-game", "cstrike",

      "+clientport", String(this.clientGamePort),
      "+port", String(port),
    ];

    if (password) {
      args.push("+password", password);
    }

    args.push(
      "+connect", `127.0.0.1:${this.defaultPort}`,
      "+rate", "25000",
      "+cl_updaterate", "20",
      "+cl_cmdrate", "20",
      "+fps_max", "100",
      ...extraArgs
    );

    return args;
  },
};
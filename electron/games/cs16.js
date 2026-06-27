module.exports = {
  id: "cs16",
  name: "Counter-Strike 1.6",
  defaultPort: 27015,
  clientPortBase: 27016,

  getHostArgs: (extraArgs = []) => {
    return [
      "-game", "cstrike",
      "+port", "27015",
      "+sv_lan", "1",
      "+maxplayers", "32",
      ...(extraArgs || [])
    ];
  },

  getClientArgs: (port, extraArgs = []) => {
    return [
      "-game", "cstrike",
      "+connect", `127.0.0.1:${port}`,
      ...(extraArgs || [])
    ];
  }
};
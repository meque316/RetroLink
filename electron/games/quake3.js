module.exports = {
  id: "quake3",
  name: "Quake III Arena",
  defaultPort: 27960,
  clientPortBase: 27961,

  getHostArgs: (extraArgs = []) => {
    return [
      "+set", "net_port", "27960",
      "+set", "sv_lanForce", "1",
      "+set", "sv_strictAuth", "0",
      "+set", "sv_pure", "0",
      ...(extraArgs || [])
    ];
  },

  getClientArgs: (port, extraArgs = []) => {
    return [
      "+connect", `127.0.0.1:${port}`,
      ...(extraArgs || [])
    ];
  }
};
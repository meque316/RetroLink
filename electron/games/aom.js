// electron/games/aom.js

function normalizeOptions(options = {}) {
  return {};
}

module.exports = {
  id: "aom",
  name: "Age of Mythology: Extended Edition",

  executable: "AoMX.exe",

  defaultPort: 2296,
  clientPortBase: 2300,

  maxClients: 8,

  supportsRoomOptions: false,
  usesDedicatedServer: false,
  hostAlsoLaunchesClient: false,

  normalizeOptions,

  getHostArgs(options = {}, extraArgs = []) {
    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

    // AoM no necesita argumentos especiales para hostear
    // El usuario crea la partida desde el lobby del juego
    return safeExtraArgs;
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    const parsedPort =
      Number(port);

    const targetPort =
      Number.isInteger(parsedPort) &&
      parsedPort > 0 &&
      parsedPort <= 65535
        ? parsedPort
        : this.clientPortBase;

    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

    // Intentar conectar por Direct IP usando argumentos
    // Si no funciona, el usuario conecta manualmente
    return [
      `-connect 127.0.0.1:${targetPort}`,
      ...safeExtraArgs,
    ];
  },
};
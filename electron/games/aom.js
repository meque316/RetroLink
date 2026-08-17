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

    // Forzar la IP local para el host (igual que hace GameRanger)
    const overrideArg = `+OverrideAddress="127.0.0.1"`;

    console.log(
      `[AoM] ════════════════════════════════════════════════════`
    );
    console.log(
      `[AoM] 🎮 HOST: Abriendo AoM con OverrideAddress=127.0.0.1`
    );
    console.log(
      `[AoM] 📌 1. Abre AoM`
    );
    console.log(
      `[AoM] 📌 2. Multiplayer → LAN → Create Game`
    );
    console.log(
      `[AoM] 📌 3. Espera a que los clientes se conecten`
    );
    console.log(
      `[AoM] ════════════════════════════════════════════════════`
    );

    return [overrideArg, ...safeExtraArgs];
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

    // 1. Forzar la IP local (igual que GameRanger)
    const overrideArg = `+OverrideAddress="127.0.0.1"`;

    // 2. Intentar conectar automáticamente
    const connectArg = `-connect 127.0.0.1:${port}`;

    console.log(
      `[AoM] ════════════════════════════════════════════════════`
    );
    console.log(
      `[AoM] 🎮 CLIENTE: Usando OverrideAddress=127.0.0.1`
    );
    console.log(
      `[AoM] 🔗 Intentando conectar a 127.0.0.1:${port}`
    );
    console.log(
      `[AoM] 📌 Si no conecta automáticamente:`
    );
    console.log(
      `[AoM]    1. Multiplayer → LAN → Direct IP`
    );
    console.log(
      `[AoM]    2. Ingresa: 127.0.0.1:${port}`
    );
    console.log(
      `[AoM]    3. Presiona Connect`
    );
    console.log(
      `[AoM] ════════════════════════════════════════════════════`
    );

    return [overrideArg, connectArg, ...safeExtraArgs];
  },
};
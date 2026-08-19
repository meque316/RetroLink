// electron/games/aom.js

function normalizeOptions(options = {}) {
  return {};
}

module.exports = {
  id: "aom",
  name: "Age of Mythology: Extended Edition",

  executable: "aomx.exe",  // Nota: ahora es aomx.exe (con el crack)

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

    // 🔥 IMPORTANTE: Usar la IP pública del host (26.156.79.92)
    // En lugar de 127.0.0.1
    const overrideArg = `+OverrideAddress="26.156.79.92"`;

    console.log(
      `[AoM] ════════════════════════════════════════════════════════════`
    );
    console.log(
      `[AoM] 🎮 HOST: Abriendo AoM con OverrideAddress=26.156.79.92`
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
      `[AoM] ════════════════════════════════════════════════════════════`
    );

    return [overrideArg, ...safeExtraArgs];
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

    // 🔥 IMPORTANTE: El cliente también debe usar la IP pública del host
    const overrideArg = `+OverrideAddress="26.156.79.92"`;
    const connectArg = `-connect 26.156.79.92:${port}`;

    console.log(
      `[AoM] ════════════════════════════════════════════════════════════`
    );
    console.log(
      `[AoM] 🎮 CLIENTE: Usando OverrideAddress=26.156.79.92`
    );
    console.log(
      `[AoM] 🔗 Intentando conectar a 26.156.79.92:${port}`
    );
    console.log(
      `[AoM] 📌 Si no conecta automáticamente:`
    );
    console.log(
      `[AoM]    1. Multiplayer → LAN → Direct IP`
    );
    console.log(
      `[AoM]    2. Ingresa: 26.156.79.92:${port}`
    );
    console.log(
      `[AoM]    3. Presiona Connect`
    );
    console.log(
      `[AoM] ════════════════════════════════════════════════════════════`
    );

    return [overrideArg, connectArg, ...safeExtraArgs];
  },
};
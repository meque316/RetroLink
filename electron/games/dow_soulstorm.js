// electron/games/dow_soulstorm.js

function normalizeOptions(options = {}) {
  return {};
}

module.exports = {
  id: "dow_soulstorm",
  name: "Warhammer 40,000: Dawn of War - Soulstorm",

  executable: "Soulstorm.exe",

  defaultPort: 6112,
  clientPortBase: 6112,

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

    console.log(
      `[DoW] ════════════════════════════════════════════════════════════`
    );
    console.log(
      `[DoW] 🎮 HOST:`
    );
    console.log(
      `[DoW] 1. Abre Soulstorm`
    );
    console.log(
      `[DoW] 2. Multiplayer → LAN → Create Game`
    );
    console.log(
      `[DoW] 3. Espera a que los clientes se conecten`
    );
    console.log(
      `[DoW] ════════════════════════════════════════════════════════════`
    );

    return safeExtraArgs;
  },

  getClientArgs(port, options = {}, extraArgs = []) {
    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

    console.log(
      `[DoW] ════════════════════════════════════════════════════════════`
    );
    console.log(
      `[DoW] 🎮 CLIENTE: Conecta manualmente por Direct IP`
    );
    console.log(
      `[DoW] 📌 1. Abre Soulstorm`
    );
    console.log(
      `[DoW] 📌 2. Multiplayer → LAN → Direct IP`
    );
    console.log(
      `[DoW] 📌 3. Ingresa: 127.0.0.1:${port}`
    );
    console.log(
      `[DoW] 📌 4. Presiona Connect`
    );
    console.log(
      `[DoW] ════════════════════════════════════════════════════════════`
    );

    return safeExtraArgs;
  },
};
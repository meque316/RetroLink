// electron/bridge/quake3/profile.js

const GAME_PORT = 27960;
const CLIENT_PORT_BASE = 27961;
const MAX_CLIENTS = 8;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

module.exports = {
  id: "quake3",
  name: "Quake III Arena",

  GAME_PORT,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  DEBUG_UDP,

  // Alias en camelCase para el futuro GameNetworkEngine.
  gamePort: GAME_PORT,
  clientPortBase: CLIENT_PORT_BASE,
  maxClients: MAX_CLIENTS,
  debugUDP: DEBUG_UDP,
};

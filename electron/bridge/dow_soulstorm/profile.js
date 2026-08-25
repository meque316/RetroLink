// electron/bridge/dow_soulstorm/profile.js

const GAME_PORT = 6112;
const CLIENT_PORT_BASE = 6112;
const MAX_CLIENTS = 8;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

module.exports = {
  id: "dow_soulstorm",
  name: "Warhammer 40,000: Dawn of War - Soulstorm",

  GAME_PORT,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  DEBUG_UDP,

  gamePort: GAME_PORT,
  clientPortBase: CLIENT_PORT_BASE,
  maxClients: MAX_CLIENTS,
  debugUDP: DEBUG_UDP,
};
// electron/bridge/ut99/profile.js

const GAME_PORT = 7777;
const CLIENT_PORT_BASE = 7801;
const MAX_CLIENTS = 16;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

module.exports = {
  id: "ut99",
  name: "Unreal Tournament",

  /*
   * Constantes conservadas por compatibilidad
   * y para facilitar la depuración.
   */
  GAME_PORT,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  DEBUG_UDP,

  /*
   * Propiedades utilizadas por createBridge().
   */
  gamePort: GAME_PORT,
  clientPortBase: CLIENT_PORT_BASE,
  maxClients: MAX_CLIENTS,
  debugUDP: DEBUG_UDP,
};
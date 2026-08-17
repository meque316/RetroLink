// electron/bridge/aom/profile.js

const GAME_PORT = 2296;
const CLIENT_PORT_BASE = 2300;
const MAX_CLIENTS = 8;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

module.exports = {
  id: "aom",
  name: "Age of Mythology: Extended Edition",

  GAME_PORT,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  DEBUG_UDP,

  // Alias usados por el core.
  gamePort: GAME_PORT,
  clientPortBase: CLIENT_PORT_BASE,
  maxClients: MAX_CLIENTS,
  debugUDP: DEBUG_UDP,

  /*
   * Por ahora NO fijamos clientListenPort ni clientGamePort.
   *
   * Queremos que la primera prueba utilice el mecanismo
   * genérico del core exactamente igual que Quake III.
   */
};
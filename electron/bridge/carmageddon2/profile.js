// electron/bridge/carmageddon2/profile.js

const {
  DEFAULT_IPX_PORT,
} = require("../ipx/ipx-broadcast-transport");

const MAX_CLIENTS = 16;

const DEBUG_IPX =
  process.env.RETROLINK_DEBUG_IPX === "1";

module.exports = {
  id: "carmageddon2",
  name: "Carmageddon II: Carpocalypse Now",

  /*
   * Estos puertos son identificadores virtuales usados por
   * la señalización para distinguir clientes. El transporte
   * local real de IPXWrapper sigue usando DEFAULT_IPX_PORT.
   */
  clientPortBase: DEFAULT_IPX_PORT,
  maxClients: MAX_CLIENTS,

  ipxPort: DEFAULT_IPX_PORT,
  debugIPX: DEBUG_IPX,
};

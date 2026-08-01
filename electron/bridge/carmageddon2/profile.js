// electron/bridge/carmageddon2/profile.js

const {
  DEFAULT_IPX_PORT,
} = require("../ipx/ipx-broadcast-transport");

const MAX_CLIENTS = 16;

// Activado temporalmente para depurar el transporte IPX.
const DEBUG_IPX = true;

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
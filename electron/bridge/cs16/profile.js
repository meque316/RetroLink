// electron/bridge/cs16/profile.js

const GAME_PORT = 27015;
const CLIENT_PORT_BASE = 27016;
const CLIENT_GAME_PORT = 27005;
const MAX_CLIENTS = 8;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

module.exports = {
  id:
    "cs16",

  name:
    "Counter-Strike 1.6",

  /*
   * Puerto del servidor de Counter-Strike.
   */
  gamePort:
    GAME_PORT,

  /*
   * Rango virtual usado por RetroLink para identificar
   * clientes dentro de la sala.
   */
  clientPortBase:
    CLIENT_PORT_BASE,

  maxClients:
    MAX_CLIENTS,

  /*
   * El cliente se conecta localmente a 127.0.0.1:27015,
   * por lo que el bridge debe escuchar en ese puerto.
   */
  clientListenPort:
    GAME_PORT,

  /*
   * El ejecutable cliente escucha las respuestas en 27005,
   * configurado mediante +clientport.
   */
  clientGamePort:
    CLIENT_GAME_PORT,

  /*
   * CS utiliza un puerto fijo conocido.
   */
  dynamicClientEndpoint:
    false,

  debugUDP:
    DEBUG_UDP,
};
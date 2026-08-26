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

  // Soulstorm no usa un puerto de cliente fijo distinto del de host:
  // el ejecutable envía su probe de conexión desde un puerto UDP
  // efímero hacia host:6112, y espera la respuesta en ese mismo
  // puerto efímero. Sin esto, sendToGame() del lado cliente le
  // devuelve la respuesta a un puerto fijo (6112, el propio socket
  // de escucha del bridge) en vez del puerto real de origen del
  // paquete de Soulstorm, y el handshake nunca cierra.
  dynamicClientEndpoint: true,
};
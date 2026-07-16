// electron/bridge/quake3/config.js

const SIGNALING_URL =
  "https://retrolink-server.onrender.com";

const GAME_PORT = 27960;
const CLIENT_PORT_BASE = 27961;
const MAX_CLIENTS = 8;

const ICE_CONNECT_TIMEOUT_MS = 45000;
const KEEPALIVE_INTERVAL_MS = 10000;

const DEBUG_UDP =
  process.env.RETROLINK_DEBUG_UDP === "1";

const ICE_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",

  /*
   * Estos servidores TURN públicos pueden no estar
   * disponibles o no aceptar estas credenciales.
   * Se dejan para diagnóstico hasta instalar coturn.
   */
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:80?transport=udp",
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:80?transport=tcp",
  "turn:openrelayproject:openrelayproject@openrelay.metered.ca:443?transport=tcp",
  "turns:openrelayproject:openrelayproject@openrelay.metered.ca:5349",
];

function buildIceServers() {
  return [...ICE_SERVERS];
}

module.exports = {
  SIGNALING_URL,
  GAME_PORT,
  CLIENT_PORT_BASE,
  MAX_CLIENTS,
  ICE_CONNECT_TIMEOUT_MS,
  KEEPALIVE_INTERVAL_MS,
  DEBUG_UDP,
  ICE_SERVERS,
  buildIceServers,
};
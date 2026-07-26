// electron/bridge/core/signaling-session.js

function createSignalingSession({
  socketFactory,
  url,
  options = {},
  configure,
} = {}) {
  if (
    typeof socketFactory !==
    "function"
  ) {
    throw new TypeError(
      "[SignalingSession] socketFactory debe ser una función."
    );
  }

  if (!url) {
    throw new Error(
      "[SignalingSession] No se proporcionó la URL de señalización."
    );
  }

  if (
    typeof configure !==
    "function"
  ) {
    throw new TypeError(
      "[SignalingSession] configure debe ser una función."
    );
  }

  const socket =
    socketFactory(
      url,
      options
    );

  configure(socket);

  return socket;
}

module.exports = {
  createSignalingSession,
};

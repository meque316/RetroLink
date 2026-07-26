// electron/bridge/quake3/keepalive.js

const {
  KEEPALIVE_INTERVAL_MS,
} = require("../core/engine-config");

const keepAliveIntervals =
  new Map();

function normalizeMessage(message) {
  return Buffer.isBuffer(message)
    ? message
    : Buffer.from(message);
}

function isKeepAlive(message) {
  const buffer =
    normalizeMessage(message);

  return (
    buffer.length <= 12 &&
    buffer
      .toString("latin1")
      .includes("ping")
  );
}

function sendKeepAlive(channel) {
  if (!channel?.isOpen()) {
    return false;
  }

  try {
    channel.sendMessageBinary(
      Buffer.from(
        "\xFF\xFF\xFF\xFFping"
      )
    );

    return true;
  } catch {
    return false;
  }
}

function stopKeepAlive(key) {
  const interval =
    keepAliveIntervals.get(key);

  if (!interval) {
    return;
  }

  clearInterval(interval);
  keepAliveIntervals.delete(key);
}

function startKeepAlive(
  key,
  channel
) {
  stopKeepAlive(key);

  const interval =
    setInterval(() => {
      if (!sendKeepAlive(channel)) {
        stopKeepAlive(key);
      }
    }, KEEPALIVE_INTERVAL_MS);

  keepAliveIntervals.set(
    key,
    interval
  );
}

function clearAllKeepAlives() {
  for (const interval of
    keepAliveIntervals.values()) {
    clearInterval(interval);
  }

  keepAliveIntervals.clear();
}

module.exports = {
  normalizeMessage,
  isKeepAlive,
  startKeepAlive,
  stopKeepAlive,
  clearAllKeepAlives,
};

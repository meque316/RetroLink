// electron/bridge/aom/status.js

const {
  BrowserWindow,
} = require("electron");

function sendToFrontend(channel, data) {
  try {
    const windows =
      BrowserWindow.getAllWindows();

    const mainWindow =
      windows[0];

    if (
      mainWindow &&
      !mainWindow.webContents.isDestroyed()
    ) {
      mainWindow.webContents.send(
        channel,
        data
      );
    }
  } catch (error) {
    console.error(
      "[Bridge-AoM] Error enviando al frontend:",
      error.message
    );
  }
}

function sendStatus(message) {
  console.log(
    `[Bridge-AoM] Status: ${message}`
  );

  sendToFrontend(
    "bridge-status-update",
    message
  );
}

module.exports = {
  sendToFrontend,
  sendStatus,
};
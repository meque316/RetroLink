// electron/bridge/ut99/status.js

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
      "[Bridge-UT99] Error enviando al frontend:",
      error.message
    );
  }
}

function sendStatus(message) {
  console.log(
    `[Bridge-UT99] Status: ${message}`
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
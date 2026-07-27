// electron/bridge/cs16/status.js

const {
  BrowserWindow,
} = require("electron");

function sendToFrontend(
  channel,
  data
) {
  try {
    const windows =
      BrowserWindow.getAllWindows();

    const mainWindow =
      windows[0];

    if (
      !mainWindow ||
      mainWindow.webContents.isDestroyed()
    ) {
      return false;
    }

    mainWindow.webContents.send(
      channel,
      data
    );

    return true;
  } catch (error) {
    console.error(
      "[Bridge-CS16] Error enviando al frontend:",
      error.message
    );

    return false;
  }
}

function sendStatus(message) {
  console.log(
    `[Bridge-CS16] Status: ${message}`
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
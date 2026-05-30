const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} = require("electron");

const path = require("path");
const {
  execFile,
} = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b0f14",

    webPreferences: {
      preload: path.join(
        __dirname,
        "preload.js"
      ),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(
    "http://localhost:5173"
  );
}

app.whenReady().then(() => {
  createWindow();

  app.on(
    "activate",
    function () {
      if (
        BrowserWindow.getAllWindows()
          .length === 0
      ) {
        createWindow();
      }
    }
  );
});

app.on(
  "window-all-closed",
  function () {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);

/*
SELECT GAME EXE
*/
ipcMain.handle(
  "select-game-exe",
  async () => {
    const result =
      await dialog.showOpenDialog({
        properties: [
          "openFile",
        ],

        filters: [
          {
            name:
              "Executable Files",
            extensions: [
              "exe",
            ],
          },
        ],
      });

    if (
      result.canceled ||
      result.filePaths.length === 0
    ) {
      return null;
    }

    return result.filePaths[0];
  }
);

/*
LAUNCH GAME
*/
ipcMain.handle(
  "launch-game",
  async (_, gamePath) => {
    if (!gamePath) {
      return {
        success: false,
        error:
          "No game path provided",
      };
    }

    try {
      execFile(
        gamePath,
        (error) => {
          if (error) {
            console.error(
              "Error launching game:",
              error
            );
          }
        }
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "Error launching game:",
        error
      );

      return {
        success: false,
        error: error.message,
      };
    }
  }
);
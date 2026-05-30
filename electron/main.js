const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} = require("electron");

const path = require("path");
const { execFile } = require("child_process");

/*
CREATE WINDOW
*/
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

/*
APP READY
*/
app.whenReady().then(() => {
  createWindow();

  app.on(
    "activate",
    () => {
      if (
        BrowserWindow.getAllWindows()
          .length === 0
      ) {
        createWindow();
      }
    }
  );
});

/*
CLOSE APP
*/
app.on(
  "window-all-closed",
  () => {
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
Lets user choose quake3.exe
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
Important:
Quake must run from its own folder
so it can find /baseq3 and pak0.pk3
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
      /*
      Example:
      gamePath:
      C:\Users\Capitan Meque\Desktop\Quake 3 Arena\quake3.exe

      gameDir becomes:
      C:\Users\Capitan Meque\Desktop\Quake 3 Arena
      */
      const gameDir =
        path.dirname(gamePath);

      execFile(
        gamePath,
        [],
        {
          cwd: gameDir,
        },
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
        error:
          error.message,
      };
    }
  }
);
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
} = require("electron");

const path = require("path");
const { execFile } = require("child_process");

/*
Detect environment

Development:
Loads Vite server

Production:
Loads built frontend files
*/
const isDev = !app.isPackaged;

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

  /*
  DEVELOPMENT
  */
  if (isDev) {
    win.loadURL(
      "http://localhost:5173"
    );
  }

  /*
  PRODUCTION
  */
  else {
    const indexPath = path.join(
      app.getAppPath(),
      "client",
      "dist",
      "index.html"
    );

    win.loadFile(indexPath);
  }
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
Runs Quake from its own folder
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
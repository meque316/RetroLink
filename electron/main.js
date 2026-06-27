const { app, BrowserWindow } = require("electron");
const path = require("path");
const registerIPCHandlers = require("./ipc/handlers");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(app.getAppPath(), "client", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // Inicializa de forma transparente los listeners desacoplados
  registerIPCHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

 // Cliente: hola uwu3xxxxx eeyyee wn eye


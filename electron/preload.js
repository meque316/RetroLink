const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    selectGameExe: () =>
      ipcRenderer.invoke(
        "select-game-exe"
      ),

    launchGame: (gamePath) =>
      ipcRenderer.invoke(
        "launch-game",
        gamePath
      ),
  }
);
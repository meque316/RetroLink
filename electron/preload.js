const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    selectGameExe: () =>
      ipcRenderer.invoke("select-game-exe"),

    launchGame: (gamePath, hostIp = null, roomId = null, isHost = false, extraArgs = []) =>
      ipcRenderer.invoke("launch-game", gamePath, hostIp, roomId, isHost, extraArgs),

    prepareHost: (port = 27960) =>
      ipcRenderer.invoke("prepare-host", port),

    closeHostPort: (port = 27960) =>
      ipcRenderer.invoke("close-host-port", port),

    startRelay: (roomId, isHost) =>
      ipcRenderer.invoke("start-relay", roomId, isHost),

    stopRelay: () =>
      ipcRenderer.invoke("stop-relay"),

    // Mata el proceso del juego (usado cuando el host cierra)
    killGame: () =>
      ipcRenderer.invoke("kill-game"),

    // Escucha cuando el host cierra el juego
    onHostGameClosed: (callback) =>
      ipcRenderer.on("host-game-closed", (_, data) => callback(data)),

    // Limpia el listener
    offHostGameClosed: () =>
      ipcRenderer.removeAllListeners("host-game-closed"),
  }
);



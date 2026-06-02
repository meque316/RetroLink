const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    selectGameExe: () =>
      ipcRenderer.invoke("select-game-exe"),

    launchGame: (gamePath, hostIp = null) =>
      ipcRenderer.invoke("launch-game", gamePath, hostIp),

    // Prepara el host: verifica puerto y abre via UPnP
    prepareHost: (port = 27960) =>
      ipcRenderer.invoke("prepare-host", port),

    // Libera el puerto UPnP al salir de la sala
    closeHostPort: (port = 27960) =>
      ipcRenderer.invoke("close-host-port", port),
  }
);

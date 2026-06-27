const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    selectGameExe: () =>
      ipcRenderer.invoke("select-game-exe"),

    // CORRECCIÓN: Añadido gameId como 5to parámetro antes de extraArgs para coincidir con Room.jsx
    launchGame: (gamePath, hostIp = null, roomId = null, isHost = false, gameId = null, extraArgs = []) =>
      ipcRenderer.invoke("launch-game", gamePath, hostIp, roomId, isHost, gameId, extraArgs),

    prepareHost: (port = 27960) =>
      ipcRenderer.invoke("prepare-host", port),

    closeHostPort: (port = 27960) =>
      ipcRenderer.invoke("close-host-port", port),

    // CORRECCIÓN: Añadido gameId para que el bridge sepa qué puertos UDP levantar automáticamente
    startRelay: (roomId, isHost, gameId) =>
      ipcRenderer.invoke("start-relay", roomId, isHost, gameId),

    stopRelay: () =>
      ipcRenderer.invoke("stop-relay"),

    killGame: () =>
      ipcRenderer.invoke("kill-game"),

    getHostIP: () =>
      ipcRenderer.invoke("get-host-ip"),

    setHostIP: (ip) =>
      ipcRenderer.invoke("set-host-ip", ip),

    getLocalIPs: () =>
      ipcRenderer.invoke("get-local-ips"),

    onHostGameClosed: (callback) =>
      ipcRenderer.on("host-game-closed", (_, data) => callback(data)),

    offHostGameClosed: () =>
      ipcRenderer.removeAllListeners("host-game-closed"),

    onHostIPReceived: (callback) =>
      ipcRenderer.on("host-ip-received", (_, data) => callback(data)),

    offHostIPReceived: () =>
      ipcRenderer.removeAllListeners("host-ip-received"),

    onBridgeStatus: (callback) =>
      ipcRenderer.on("bridge-status-update", (_, message) => callback(message)),

    offBridgeStatus: () =>
      ipcRenderer.removeAllListeners("bridge-status-update"),
  }
);
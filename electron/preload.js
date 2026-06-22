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

    // 🔥 NUEVO: Obtener la IP del host
    getHostIP: () =>
      ipcRenderer.invoke("get-host-ip"),

    // Escucha cuando el host cierra el juego
    onHostGameClosed: (callback) =>
      ipcRenderer.on("host-game-closed", (_, data) => callback(data)),

    // Limpia el listener
    offHostGameClosed: () =>
      ipcRenderer.removeAllListeners("host-game-closed"),

    // 🔥 NUEVO: Escuchar cuando se recibe la IP del host
    onHostIPReceived: (callback) =>
      ipcRenderer.on("host-ip-received", (_, data) => callback(data)),

    // 🔥 NUEVO: Limpiar listener de IP del host
    offHostIPReceived: () =>
      ipcRenderer.removeAllListeners("host-ip-received"),

    // Estado del bridge WebRTC (mensajes legibles para la UI)
    onBridgeStatus: (callback) =>
      ipcRenderer.on("bridge-status-update", (_, message) => callback(message)),

    offBridgeStatus: () =>
      ipcRenderer.removeAllListeners("bridge-status-update"),
  }
);


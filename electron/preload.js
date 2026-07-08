const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    // ============ JUEGOS ============
    selectGameExe: () =>
      ipcRenderer.invoke("select-game-exe"),

    launchGame: (
      gamePath,
      hostIp = null,
      roomId = null,
      isHost = false,
      gameId = null,
      gameOptions = {},
      extraArgs = []
    ) =>
      ipcRenderer.invoke(
        "launch-game",
        gamePath,
        hostIp,
        roomId,
        isHost,
        gameId,
        gameOptions,
        extraArgs
      ),

    killGame: () =>
      ipcRenderer.invoke("kill-game"),

    // ============ RED ============
    prepareHost: (port = 27960, gameId = null) =>
      ipcRenderer.invoke("prepare-host", port, gameId),

    closeHostPort: (port = 27960) =>
      ipcRenderer.invoke("close-host-port", port),

    getHostIP: () =>
      ipcRenderer.invoke("get-host-ip"),

    setHostIP: (ip) =>
      ipcRenderer.invoke("set-host-ip", ip),

    getLocalIPs: () =>
      ipcRenderer.invoke("get-local-ips"),

    getClientPort: () =>
      ipcRenderer.invoke("get-client-port"),

    // ============ BRIDGE ============
    startRelay: (roomId, isHost, gameId = null) =>
      ipcRenderer.invoke("start-relay", roomId, isHost, gameId),

    stopRelay: () =>
      ipcRenderer.invoke("stop-relay"),

    getBridgeState: () =>
      ipcRenderer.invoke("get-bridge-state"),

    // ============ EVENTOS ============
    onBridgeStatus: (callback) =>
      ipcRenderer.on("bridge-status-update", (_, message) => callback(message)),

    offBridgeStatus: () =>
      ipcRenderer.removeAllListeners("bridge-status-update"),

    onBridgeReady: (callback) =>
      ipcRenderer.on("bridge-ready", (_, data) => callback(data)),

    offBridgeReady: () =>
      ipcRenderer.removeAllListeners("bridge-ready"),

    onHostIPReceived: (callback) =>
      ipcRenderer.on("host-ip-received", (_, data) => callback(data)),

    offHostIPReceived: () =>
      ipcRenderer.removeAllListeners("host-ip-received"),

    onClientPortAssigned: (callback) =>
      ipcRenderer.on("client-port-assigned", (_, port) => callback(port)),

    offClientPortAssigned: () =>
      ipcRenderer.removeAllListeners("client-port-assigned"),

    onClientConnected: (callback) =>
      ipcRenderer.on("client-connected", (_, data) => callback(data)),

    offClientConnected: () =>
      ipcRenderer.removeAllListeners("client-connected"),

    onClientDisconnected: (callback) =>
      ipcRenderer.on("client-disconnected", (_, data) => callback(data)),

    offClientDisconnected: () =>
      ipcRenderer.removeAllListeners("client-disconnected"),

    onHostGameClosed: (callback) =>
      ipcRenderer.on("host-game-closed", (_, data) => callback(data)),

    offHostGameClosed: () =>
      ipcRenderer.removeAllListeners("host-game-closed"),

    onGamePortDetected: (callback) =>
      ipcRenderer.on("game-port-detected", (_, port) => callback(port)),

    offGamePortDetected: () =>
      ipcRenderer.removeAllListeners("game-port-detected"),

    onGameDetected: (callback) =>
      ipcRenderer.on("game-detected", (_, game) => callback(game)),

    offGameDetected: () =>
      ipcRenderer.removeAllListeners("game-detected"),
  }
);
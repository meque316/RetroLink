const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "retroLink",
  {
    // ✅ Seleccionar ejecutable del juego
    selectGameExe: () =>
      ipcRenderer.invoke("select-game-exe"),

    // ✅ Lanzar juego - CORREGIDO: gameId es opcional (null para Quake III)
    launchGame: (gamePath, hostIp = null, roomId = null, isHost = false, gameId = null, extraArgs = []) =>
      ipcRenderer.invoke("launch-game", gamePath, hostIp, roomId, isHost, gameId, extraArgs),

    // ✅ Preparar host (firewall, puertos, UPnP)
    prepareHost: (port = 27960, gameId = null) =>
      ipcRenderer.invoke("prepare-host", port, gameId),

    closeHostPort: (port = 27960) =>
      ipcRenderer.invoke("close-host-port", port),

    // ✅ Iniciar relay - CORREGIDO: gameId es opcional (null para Quake III)
    startRelay: (roomId, isHost, gameId = null) =>
      ipcRenderer.invoke("start-relay", roomId, isHost, gameId),

    // ✅ Detener relay
    stopRelay: () =>
      ipcRenderer.invoke("stop-relay"),

    // ✅ Matar proceso del juego
    killGame: () =>
      ipcRenderer.invoke("kill-game"),

    // ✅ Obtener IP del host
    getHostIP: () =>
      ipcRenderer.invoke("get-host-ip"),

    // ✅ Establecer IP del host
    setHostIP: (ip) =>
      ipcRenderer.invoke("set-host-ip", ip),

    // ✅ Obtener IPs locales
    getLocalIPs: () =>
      ipcRenderer.invoke("get-local-ips"),

    // ✅ Evento: Juego del host cerrado
    onHostGameClosed: (callback) =>
      ipcRenderer.on("host-game-closed", (_, data) => callback(data)),

    offHostGameClosed: () =>
      ipcRenderer.removeAllListeners("host-game-closed"),

    // ✅ Evento: IP del host recibida (cliente)
    onHostIPReceived: (callback) =>
      ipcRenderer.on("host-ip-received", (_, data) => callback(data)),

    offHostIPReceived: () =>
      ipcRenderer.removeAllListeners("host-ip-received"),

    // ✅ Evento: Estado del bridge (actualizaciones)
    onBridgeStatus: (callback) =>
      ipcRenderer.on("bridge-status-update", (_, message) => callback(message)),

    offBridgeStatus: () =>
      ipcRenderer.removeAllListeners("bridge-status-update"),

    // ✅ NUEVO: Evento - Bridge listo (conexión P2P establecida)
    onBridgeReady: (callback) =>
      ipcRenderer.on("bridge-ready", (_, data) => callback(data)),

    offBridgeReady: () =>
      ipcRenderer.removeAllListeners("bridge-ready"),

    // ✅ NUEVO: Evento - Puerto del cliente asignado
    onClientPortAssigned: (callback) =>
      ipcRenderer.on("client-port-assigned", (_, port) => callback(port)),

    offClientPortAssigned: () =>
      ipcRenderer.removeAllListeners("client-port-assigned"),

    // ✅ NUEVO: Evento - Cliente conectado (solo host)
    onClientConnected: (callback) =>
      ipcRenderer.on("client-connected", (_, data) => callback(data)),

    offClientConnected: () =>
      ipcRenderer.removeAllListeners("client-connected"),

    // ✅ NUEVO: Evento - Cliente desconectado (solo host)
    onClientDisconnected: (callback) =>
      ipcRenderer.on("client-disconnected", (_, data) => callback(data)),

    offClientDisconnected: () =>
      ipcRenderer.removeAllListeners("client-disconnected"),

    // ✅ NUEVO: Obtener estado del bridge
    getBridgeState: () =>
      ipcRenderer.invoke("get-bridge-state"),

    // ✅ NUEVO: Obtener puerto del cliente
    getClientPort: () =>
      ipcRenderer.invoke("get-client-port"),
  }
);
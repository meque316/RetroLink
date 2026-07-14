// electron/runtime/process-manager.js

let gameProcess = null;
let serverProcess = null;

function stopProcess(process, label) {
  if (!process) {
    return;
  }

  try {
    if (!process.killed) {
      process.kill();

      console.log(`[Game] ${label} terminado`);
    }
  } catch (error) {
    console.error(
      `[Game] Error terminando ${label}:`,
      error.message
    );
  }
}

function setGameProcess(process) {
  gameProcess = process || null;
}

function getGameProcess() {
  return gameProcess;
}

function clearGameProcess(process = null) {
  if (!process || gameProcess === process) {
    gameProcess = null;
  }
}

function setServerProcess(process) {
  serverProcess = process || null;
}

function getServerProcess() {
  return serverProcess;
}

function clearServerProcess(process = null) {
  if (!process || serverProcess === process) {
    serverProcess = null;
  }
}

function stopGameProcess(label = "cliente del juego") {
  stopProcess(gameProcess, label);
  gameProcess = null;
}

function stopServerProcess(
  label = "servidor dedicado"
) {
  stopProcess(serverProcess, label);
  serverProcess = null;
}

function stopAllProcesses() {
  stopGameProcess("cliente del juego");
  stopServerProcess("servidor dedicado");
}

module.exports = {
  stopProcess,

  setGameProcess,
  getGameProcess,
  clearGameProcess,

  setServerProcess,
  getServerProcess,
  clearServerProcess,

  stopGameProcess,
  stopServerProcess,
  stopAllProcesses,
};
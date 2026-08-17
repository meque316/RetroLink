// electron/launchers/game-launcher.js

const path = require("path");
const {
  execFile,
  spawn,
} = require("child_process");
const fs = require("fs");

const {
  allowFirewall,
} = require("../network/utils");

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function buildGameArgs({
  game,
  bridge,
  isHost,
  gameOptions,
  extraArgs,
}) {
  if (isHost) {
    return game.supportsRoomOptions
      ? game.getHostArgs(
          gameOptions,
          extraArgs || []
        )
      : game.getHostArgs(
          extraArgs || []
        );
  }

  const port =
    bridge.getClientPort() ||
    game.clientPortBase ||
    game.defaultPort ||
    27961;

  return game.supportsRoomOptions
    ? game.getClientArgs(
        port,
        gameOptions,
        extraArgs || []
      )
    : game.getClientArgs(
        port,
        extraArgs || []
      );
}

function createProcess({
  gamePath,
  args,
  gameDir,
  realGameId,
}) {
  const isCarmageddon2 =
    realGameId === "carmageddon2";

  const isAoM =
    realGameId === "aom";

  // Verificar que el directorio existe
  if (!fs.existsSync(gameDir)) {
    console.error(
      `[Game Launcher] ERROR: El directorio no existe: ${gameDir}`
    );
  }

  // Verificar que el ejecutable existe
  if (!fs.existsSync(gamePath)) {
    console.error(
      `[Game Launcher] ERROR: El ejecutable no existe: ${gamePath}`
    );
  }

  console.log(
    `[Game Launcher] Working directory: ${gameDir}`
  );
  console.log(
    `[Game Launcher] Executable path: ${gamePath}`
  );
  console.log(
    `[Game Launcher] Args: ${args.join(" ")}`
  );
  console.log(
    `[Game Launcher] realGameId: ${realGameId}`
  );

  // Caso especial: Carmageddon 2
  if (isCarmageddon2) {
    console.log(
      `[Game Launcher] Usando modo especial para Carmageddon 2`
    );

    const childProcess = spawn(
      gamePath,
      args,
      {
        cwd: gameDir,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }
    );

    childProcess.unref();
    return childProcess;
  }

  // Caso especial: Age of Mythology
  // AoM necesita:
  // 1. El directorio de trabajo correcto (cwd)
  // 2. Shell habilitado para que funcione correctamente
  // 3. El path del ejecutable entre comillas (por los espacios)
  if (isAoM) {
    console.log(
      `[Game Launcher] Usando modo especial para Age of Mythology`
    );
    console.log(
      `[Game Launcher] Directorio de trabajo: ${gameDir}`
    );

    // IMPORTANTE: Envolver gamePath entre comillas para manejar espacios
    const quotedGamePath = `"${gamePath}"`;

    const childProcess = spawn(
      quotedGamePath,
      args,
      {
        cwd: gameDir,
        stdio: "inherit",
        windowsHide: false,
        shell: true,
        env: {
          ...process.env,
          CD: gameDir,
        },
      }
    );

    childProcess.on("error", (error) => {
      console.error(
        `[Game Launcher] Error spawning AoM:`,
        error.message
      );
    });

    childProcess.on("close", (code) => {
      console.log(
        `[Game Launcher] AoM closed with code: ${code}`
      );
    });

    return childProcess;
  }

  // Para todos los demás juegos
  console.log(
    `[Game Launcher] Usando modo estándar`
  );

  const childProcess = spawn(
    gamePath,
    args,
    {
      cwd: gameDir,
      stdio: "inherit",
      windowsHide: false,
      shell: false,
    }
  );

  childProcess.on("error", (error) => {
    console.error(
      `[Game Launcher] Error spawning process:`,
      error.message
    );
  });

  childProcess.on("close", (code) => {
    console.log(
      `[Game Launcher] Process closed with code: ${code}`
    );
  });

  return childProcess;
}

async function launchStandardGame({
  game,
  bridge,
  gamePath,
  isHost,
  realGameId,
  gameOptions = {},
  extraArgs = [],
}) {
  const gameDir = path.dirname(gamePath);

  console.log(
    `[Game Launcher] ========================================`
  );
  console.log(
    `[Game Launcher] Lanzando ${game.name} (${realGameId})`
  );
  console.log(
    `[Game Launcher] isHost: ${isHost}`
  );
  console.log(
    `[Game Launcher] gamePath: ${gamePath}`
  );
  console.log(
    `[Game Launcher] gameDir: ${gameDir}`
  );
  console.log(
    `[Game Launcher] ========================================`
  );

  // Permitir el juego en el firewall
  allowFirewall(
    gamePath,
    "RetroLink Game"
  );

  if (
    !isHost &&
    game.serverWarmupMs
  ) {
    console.log(
      `[Game Launcher] Esperando ${game.serverWarmupMs}ms antes de lanzar cliente...`
    );

    await delay(game.serverWarmupMs);
  }

  const args = buildGameArgs({
    game,
    bridge,
    isHost,
    gameOptions,
    extraArgs,
  });

  console.log(
    `[Game Launcher] ${
      isHost ? "Host" : "Client"
    } args (${game.name}): ${args.join(" ")}`
  );

  console.log(
    `[Game Launcher] Executing ${gamePath} with args: ${args.join(" ")}`
  );
  console.log(
    `[Game Launcher] Working directory: ${gameDir}`
  );

  const childProcess = createProcess({
    gamePath,
    args,
    gameDir,
    realGameId,
  });

  return {
    process: childProcess,
    args,
  };
}

module.exports = {
  delay,
  buildGameArgs,
  launchStandardGame,
};
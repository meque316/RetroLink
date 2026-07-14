// electron/launchers/ut99-launcher.js

const fs = require("fs");
const path = require("path");

const {
  execFile,
  spawn,
} = require("child_process");

const {
  allowFirewall,
} = require("../network/utils");

const {
  prepareUT99ServerConfig,
} = require("../config/ut99-config");

const {
  delay,
} = require("./game-launcher");

function createUT99ServerProcess({
  game,
  gamePath,
  gameOptions,
  extraArgs,
}) {
  const gameDir = path.dirname(gamePath);

  const serverExecutable =
    game.serverExecutable || "UCC.exe";

  const serverPath = path.join(
    gameDir,
    serverExecutable
  );

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `No se encontró el servidor dedicado de UT99: ${serverPath}`
    );
  }

  const configArgs =
    prepareUT99ServerConfig({
      game,
      gameDir,
      gameOptions,
    });

  const serverArgs =
    game.getServerArgs(
      gameOptions || {},
      [
        ...configArgs,
        ...(extraArgs || []),
      ]
    );

  console.log(
    `[UT99 Server] Executing ${serverPath} with args: ${serverArgs.join(" ")}`
  );

  allowFirewall(
    serverPath,
    "RetroLink UT99 Server"
  );

  const process = spawn(
    serverPath,
    serverArgs,
    {
      cwd: gameDir,
      windowsHide: false,
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    }
  );

  process.stdout?.on(
    "data",
    (data) => {
      const text =
        data.toString().trim();

      if (text) {
        console.log(
          `[UT99 Server] ${text}`
        );
      }
    }
  );

  process.stderr?.on(
    "data",
    (data) => {
      const text =
        data.toString().trim();

      if (text) {
        console.error(
          `[UT99 Server Error] ${text}`
        );
      }
    }
  );

  process.on("error", (error) => {
    console.error(
      "[UT99 Server] No se pudo iniciar UCC.exe:",
      error.message
    );
  });

  process.on("close", (code) => {
    console.log(
      `[UT99 Server] UCC.exe cerrado, código: ${code}`
    );
  });

  return {
    process,
    serverArgs,
  };
}

function createUT99ClientProcess({
  gamePath,
  args,
  gameDir,
  isHost,
}) {
  console.log(
    isHost
      ? `[UT99 Client Host] Executing ${gamePath} with args: ${args.join(" ")}`
      : `[UT99 Client] Executing ${gamePath} with args: ${args.join(" ")}`
  );

  return execFile(
    gamePath,
    args,
    {
      cwd: gameDir,
    },
    (error) => {
      if (
        error &&
        error.code !== null
      ) {
        console.error(
          isHost
            ? "[UT99 Host Client Error]:"
            : "[UT99 Client Error]:",
          error.message
        );
      }
    }
  );
}

async function launchUT99({
  game,
  bridge,
  gamePath,
  isHost,
  gameOptions = {},
  extraArgs = [],
}) {
  const gameDir = path.dirname(gamePath);

  allowFirewall(
    gamePath,
    "RetroLink Game"
  );

  let serverProcess = null;

  try {
    if (isHost) {
      const serverResult =
        createUT99ServerProcess({
          game,
          gamePath,
          gameOptions,
          extraArgs: [],
        });

      serverProcess =
        serverResult.process;

      const warmupMs =
        Number(game.serverWarmupMs) > 0
          ? Number(game.serverWarmupMs)
          : 3000;

      console.log(
        `[UT99] Esperando ${warmupMs}ms para que UCC.exe abra el puerto ${game.defaultPort}...`
      );

      await delay(warmupMs);

      if (
        serverProcess.exitCode !== null
      ) {
        throw new Error(
          `UCC.exe se cerró antes de iniciar el cliente. Código: ${serverProcess.exitCode}`
        );
      }

      const hostArgs =
        game.getHostArgs(
          gameOptions || {},
          extraArgs || []
        );

      const gameProcess =
        createUT99ClientProcess({
          gamePath,
          args: hostArgs,
          gameDir,
          isHost: true,
        });

      return {
        gameProcess,
        serverProcess,
        gamePort: game.defaultPort,
        clientPort: game.defaultPort,
      };
    }

    const clientPort =
      bridge.getClientPort() ||
      game.clientPortBase ||
      game.defaultPort;

    const clientArgs =
      game.getClientArgs(
        clientPort,
        gameOptions || {},
        extraArgs || []
      );

    console.log(
      `[UT99 Client] Puerto local del bridge: ${clientPort}`
    );

    const gameProcess =
      createUT99ClientProcess({
        gamePath,
        args: clientArgs,
        gameDir,
        isHost: false,
      });

    return {
      gameProcess,
      serverProcess: null,
      gamePort: game.defaultPort,
      clientPort,
    };
  } catch (error) {
    if (
      serverProcess &&
      !serverProcess.killed
    ) {
      try {
        serverProcess.kill();
      } catch {}
    }

    throw error;
  }
}

module.exports = {
  launchUT99,
};
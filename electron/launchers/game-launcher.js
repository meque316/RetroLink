// electron/launchers/game-launcher.js

const path = require("path");
const {
  execFile,
  spawn,
} = require("child_process");

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

  if (isCarmageddon2) {
    const process = spawn(
      gamePath,
      args,
      {
        cwd: gameDir,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }
    );

    process.unref();

    return process;
  }

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
          "[Game Process Error]:",
          error.message
        );
      }
    }
  );
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

  const process = createProcess({
    gamePath,
    args,
    gameDir,
    realGameId,
  });

  return {
    process,
    args,
  };
}

module.exports = {
  delay,
  buildGameArgs,
  launchStandardGame,
};
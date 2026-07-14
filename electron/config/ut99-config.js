// electron/config/ut99-config.js

const fs = require("fs");
const path = require("path");

function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function setIniValue(
  content,
  section,
  key,
  value
) {
  const normalizedContent = String(
    content || ""
  ).replace(/\r\n/g, "\n");

  const escapedSection = escapeRegExp(section);
  const escapedKey = escapeRegExp(key);

  const sectionPattern = new RegExp(
    `(^|\\n)\\[${escapedSection}\\]\\s*\\n`,
    "i"
  );

  const sectionMatch = sectionPattern.exec(
    normalizedContent
  );

  if (!sectionMatch) {
    const separator =
      normalizedContent.endsWith("\n")
        ? "\n"
        : "\n\n";

    return (
      normalizedContent +
      separator +
      `[${section}]\n` +
      `${key}=${value}\n`
    );
  }

  const sectionBodyStart =
    sectionMatch.index +
    sectionMatch[0].length;

  const nextSectionPattern =
    /\n\[[^\]]+\]\s*\n/g;

  nextSectionPattern.lastIndex =
    sectionBodyStart;

  const nextSectionMatch =
    nextSectionPattern.exec(
      normalizedContent
    );

  const sectionEnd = nextSectionMatch
    ? nextSectionMatch.index + 1
    : normalizedContent.length;

  const beforeSection =
    normalizedContent.slice(
      0,
      sectionBodyStart
    );

  const sectionBody =
    normalizedContent.slice(
      sectionBodyStart,
      sectionEnd
    );

  const afterSection =
    normalizedContent.slice(sectionEnd);

  const keyPattern = new RegExp(
    `(^|\\n)\\s*${escapedKey}\\s*=.*(?=\\n|$)`,
    "i"
  );

  let updatedSectionBody;

  if (keyPattern.test(sectionBody)) {
    updatedSectionBody =
      sectionBody.replace(
        keyPattern,
        `$1${key}=${value}`
      );
  } else {
    const bodyWithoutTrailingBreaks =
      sectionBody.replace(/\n+$/g, "");

    updatedSectionBody =
      `${bodyWithoutTrailingBreaks}\n` +
      `${key}=${value}\n`;
  }

  return (
    beforeSection +
    updatedSectionBody +
    afterSection
  );
}

function prepareUT99ServerConfig({
  game,
  gameDir,
  gameOptions,
}) {
  if (
    typeof game.getServerConfig !==
    "function"
  ) {
    console.warn(
      "[UT99 Config] getServerConfig no está definido."
    );

    return [];
  }

  const config = game.getServerConfig(
    gameOptions || {}
  );

  const sourceIniPath = path.join(
    gameDir,
    "UnrealTournament.ini"
  );

  const sourceUserIniPath = path.join(
    gameDir,
    "User.ini"
  );

  const serverIniName =
    "RetroLinkServer.ini";

  const serverUserIniName =
    "RetroLinkUser.ini";

  const serverIniPath = path.join(
    gameDir,
    serverIniName
  );

  const serverUserIniPath = path.join(
    gameDir,
    serverUserIniName
  );

  if (!fs.existsSync(sourceIniPath)) {
    throw new Error(
      `No se encontró UnrealTournament.ini: ${sourceIniPath}`
    );
  }

  if (!fs.existsSync(sourceUserIniPath)) {
    throw new Error(
      `No se encontró User.ini: ${sourceUserIniPath}`
    );
  }

  let serverIni = fs.readFileSync(
    sourceIniPath,
    "utf8"
  );

  let serverUserIni = fs.readFileSync(
    sourceUserIniPath,
    "utf8"
  );

  /*
  MinPlayers pertenece a DeathMatchPlus.

  TeamGamePlus, CTFGame, Domination y
  LastManStanding heredan esta configuración.
  */
  serverIni = setIniValue(
    serverIni,
    "Botpack.DeathMatchPlus",
    "MinPlayers",
    config.minPlayers
  );

  const isTeamGame = [
    "teamDeathmatch",
    "captureTheFlag",
    "domination",
  ].includes(config.gameType);

  if (isTeamGame) {
    serverIni = setIniValue(
      serverIni,
      "Botpack.TeamGamePlus",
      "bBalanceTeams",
      "True"
    );

    serverIni = setIniValue(
      serverIni,
      "Botpack.TeamGamePlus",
      "bPlayersBalanceTeams",
      "True"
    );
  }

  serverIni = setIniValue(
    serverIni,
    "Engine.GameReplicationInfo",
    "ServerName",
    config.serverName
  );

  serverUserIni = setIniValue(
    serverUserIni,
    "Botpack.ChallengeBotInfo",
    "Difficulty",
    config.difficulty
  );

  fs.writeFileSync(
    serverIniPath,
    serverIni.replace(/\r?\n/g, "\r\n"),
    "utf8"
  );

  fs.writeFileSync(
    serverUserIniPath,
    serverUserIni.replace(
      /\r?\n/g,
      "\r\n"
    ),
    "utf8"
  );

  console.log(
    "[UT99 Config] Configuración preparada:",
    {
      gameType: config.gameType,
      gameClass: config.gameClass,
      minPlayers: config.minPlayers,
      difficulty: config.difficulty,
      serverName: config.serverName,
      serverIni: serverIniName,
      userIni: serverUserIniName,
    }
  );

  return [
    `ini=${serverIniName}`,
    `userini=${serverUserIniName}`,
  ];
}

module.exports = {
  setIniValue,
  prepareUT99ServerConfig,
};
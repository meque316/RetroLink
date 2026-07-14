// electron/games/ut99.js

const GAME_TYPES = {
  deathmatch: "Botpack.DeathMatchPlus",
  teamDeathmatch: "Botpack.TeamGamePlus",
  captureTheFlag: "Botpack.CTFGame",
  domination: "Botpack.Domination",
  lastManStanding: "Botpack.LastManStanding",
};

const DEFAULT_MAPS = {
  deathmatch: "DM-Deck16][",
  teamDeathmatch: "DM-Deck16][",
  captureTheFlag: "CTF-Face",
  domination: "DOM-Cinder",
  lastManStanding: "DM-Deck16][",
};

const MAP_PREFIXES = {
  deathmatch: "DM-",
  teamDeathmatch: "DM-",
  captureTheFlag: "CTF-",
  domination: "DOM-",
  lastManStanding: "DM-",
};

const DEFAULT_OPTIONS = {
  map: "DM-Deck16][",
  gameType: "deathmatch",
  maxPlayers: 16,
  fragLimit: 30,
  timeLimit: 20,
  minPlayers: 0,
  difficulty: 3,
  friendlyFire: 0,
  password: "",
  serverName: "RetroLink UT99",
};

function sanitizeNumber(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeGameType(gameType) {
  return GAME_TYPES[gameType]
    ? gameType
    : DEFAULT_OPTIONS.gameType;
}

function getGameClass(gameType) {
  const normalizedGameType = normalizeGameType(gameType);
  return GAME_TYPES[normalizedGameType];
}

function getCompatibleMap(gameType, requestedMap) {
  const normalizedGameType = normalizeGameType(gameType);

  const map =
    sanitizeText(
      requestedMap,
      DEFAULT_MAPS[normalizedGameType]
    ) || DEFAULT_MAPS[normalizedGameType];

  const expectedPrefix =
    MAP_PREFIXES[normalizedGameType];

  if (
    map.toUpperCase().startsWith(
      expectedPrefix.toUpperCase()
    )
  ) {
    return map;
  }

  return DEFAULT_MAPS[normalizedGameType];
}

function normalizeOptions(options = {}) {
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const gameType = normalizeGameType(
    mergedOptions.gameType
  );

  const maxPlayers = sanitizeNumber(
    mergedOptions.maxPlayers,
    DEFAULT_OPTIONS.maxPlayers,
    1,
    32
  );

  return {
    map: getCompatibleMap(
      gameType,
      mergedOptions.map
    ),

    gameType,

    gameClass: getGameClass(gameType),

    maxPlayers,

    fragLimit: sanitizeNumber(
      mergedOptions.fragLimit,
      DEFAULT_OPTIONS.fragLimit,
      0,
      999
    ),

    timeLimit: sanitizeNumber(
      mergedOptions.timeLimit,
      DEFAULT_OPTIONS.timeLimit,
      0,
      999
    ),

    minPlayers: sanitizeNumber(
      mergedOptions.minPlayers,
      DEFAULT_OPTIONS.minPlayers,
      0,
      maxPlayers
    ),

    difficulty: sanitizeNumber(
      mergedOptions.difficulty,
      DEFAULT_OPTIONS.difficulty,
      0,
      7
    ),

    friendlyFire: sanitizeNumber(
      mergedOptions.friendlyFire,
      DEFAULT_OPTIONS.friendlyFire,
      0,
      100
    ),

    password: sanitizeText(
      mergedOptions.password
    ),

    serverName:
      sanitizeText(
        mergedOptions.serverName,
        DEFAULT_OPTIONS.serverName
      ) || DEFAULT_OPTIONS.serverName,
  };
}

module.exports = {
  id: "ut99",
  name: "Unreal Tournament",
  executable: "UnrealTournament.exe",
  serverExecutable: "UCC.exe",

  defaultPort: 7777,
  queryPort: 7778,
  clientPortBase: 7801,
  serverWarmupMs: 3000,

  supportsRoomOptions: true,
  usesDedicatedServer: true,
  hostAlsoLaunchesClient: true,

  defaultOptions: {
    ...DEFAULT_OPTIONS,
  },

  gameTypes: {
    ...GAME_TYPES,
  },

  defaultMaps: {
    ...DEFAULT_MAPS,
  },

  normalizeOptions,

  /*
  Configuración que handlers.js debe escribir en los INI
  antes de iniciar UCC.exe.
  */
  getServerConfig(options = {}) {
    const normalized = normalizeOptions(options);

    return {
      gameType: normalized.gameType,
      gameClass: normalized.gameClass,
      minPlayers: normalized.minPlayers,
      difficulty: normalized.difficulty,
      serverName: normalized.serverName,
    };
  },

  getServerArgs(options = {}, extraArgs = []) {
    const normalized = normalizeOptions(options);

    const friendlyFireScale =
      normalized.friendlyFire / 100;

    const serverUrlOptions = [
      `Game=${normalized.gameClass}`,
      `MaxPlayers=${normalized.maxPlayers}`,
      `FragLimit=${normalized.fragLimit}`,
      `TimeLimit=${normalized.timeLimit}`,
      `FriendlyFireScale=${friendlyFireScale}`,
    ];

    /*
    MinPlayers y Difficulty no se incluyen aquí.
    UT99 los toma desde UnrealTournament.ini/User.ini.
    */

    if (normalized.password) {
      serverUrlOptions.push(
        `GamePassword=${encodeURIComponent(
          normalized.password
        )}`
      );
    }

    const serverUrl =
      `${normalized.map}?${serverUrlOptions.join("?")}`;

    return [
      "server",
      serverUrl,
      `-port=${this.defaultPort}`,
      "-log=RetroLinkServer.log",
      "-nohomedir",
      ...extraArgs,
    ];
  },

  getHostArgs(options = {}, extraArgs = []) {
    const normalized = normalizeOptions(options);

    const connectionUrl = normalized.password
      ? `127.0.0.1:${this.defaultPort}?Password=${encodeURIComponent(
          normalized.password
        )}`
      : `127.0.0.1:${this.defaultPort}`;

    return [
      connectionUrl,
      "-nohomedir",
      ...extraArgs,
    ];
  },

  getClientArgs(
    port,
    options = {},
    extraArgs = []
  ) {
    const parsedPort = Number(port);

    const targetPort =
      Number.isInteger(parsedPort) &&
      parsedPort > 0 &&
      parsedPort <= 65535
        ? parsedPort
        : this.defaultPort;

    const normalized = normalizeOptions(options);

    const connectionUrl = normalized.password
      ? `127.0.0.1:${targetPort}?Password=${encodeURIComponent(
          normalized.password
        )}`
      : `127.0.0.1:${targetPort}`;

    return [
      connectionUrl,
      "-nohomedir",
      ...extraArgs,
    ];
  },
};
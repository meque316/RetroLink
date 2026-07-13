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

function getGameClass(gameType) {
  return GAME_TYPES[gameType] || GAME_TYPES.deathmatch;
}

function getCompatibleMap(gameType, requestedMap) {
  const normalizedGameType = GAME_TYPES[gameType]
    ? gameType
    : "deathmatch";

  const map = sanitizeText(
    requestedMap,
    DEFAULT_MAPS[normalizedGameType]
  );

  const expectedPrefix =
    MAP_PREFIXES[normalizedGameType];

  if (
    map &&
    map.toUpperCase().startsWith(
      expectedPrefix.toUpperCase()
    )
  ) {
    return map;
  }

  return DEFAULT_MAPS[normalizedGameType];
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

  getServerArgs(options = {}, extraArgs = []) {
    const mergedOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    const gameType = GAME_TYPES[
      mergedOptions.gameType
    ]
      ? mergedOptions.gameType
      : "deathmatch";

    const gameClass = getGameClass(gameType);

    const map = getCompatibleMap(
      gameType,
      mergedOptions.map
    );

    const maxPlayers = sanitizeNumber(
      mergedOptions.maxPlayers,
      DEFAULT_OPTIONS.maxPlayers,
      1,
      32
    );

    const fragLimit = sanitizeNumber(
      mergedOptions.fragLimit,
      DEFAULT_OPTIONS.fragLimit,
      0,
      999
    );

    const timeLimit = sanitizeNumber(
      mergedOptions.timeLimit,
      DEFAULT_OPTIONS.timeLimit,
      0,
      999
    );

    const minPlayers = sanitizeNumber(
      mergedOptions.minPlayers,
      DEFAULT_OPTIONS.minPlayers,
      0,
      maxPlayers
    );

    const difficulty = sanitizeNumber(
      mergedOptions.difficulty,
      DEFAULT_OPTIONS.difficulty,
      0,
      7
    );

    const friendlyFirePercent = sanitizeNumber(
      mergedOptions.friendlyFire,
      DEFAULT_OPTIONS.friendlyFire,
      0,
      100
    );

    const friendlyFireScale =
      friendlyFirePercent / 100;

    const password = sanitizeText(
      mergedOptions.password
    );

    const serverUrlOptions = [
      `Game=${gameClass}`,
      `MaxPlayers=${maxPlayers}`,
      `FragLimit=${fragLimit}`,
      `TimeLimit=${timeLimit}`,
      `MinPlayers=${minPlayers}`,
      `Difficulty=${difficulty}`,
      `FriendlyFireScale=${friendlyFireScale}`,
    ];

    if (password) {
      serverUrlOptions.push(
        `GamePassword=${encodeURIComponent(password)}`
      );
    }

    const serverUrl =
      `${map}?${serverUrlOptions.join("?")}`;

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
    const password = sanitizeText(
      options.password
    );

    const connectionUrl = password
      ? `127.0.0.1:${this.defaultPort}?Password=${encodeURIComponent(
          password
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

    const password = sanitizeText(
      options.password
    );

    const connectionUrl = password
      ? `127.0.0.1:${targetPort}?Password=${encodeURIComponent(
          password
        )}`
      : `127.0.0.1:${targetPort}`;

    return [
      connectionUrl,
      "-nohomedir",
      ...extraArgs,
    ];
  },
};
// electron/games/quake3.js

const GAME_TYPES = {
  freeForAll: 0,
  tournament: 1,
  teamDeathmatch: 3,
  captureTheFlag: 4,
};

const DEFAULT_MAPS = {
  freeForAll: "q3dm17",
  tournament: "q3tourney2",
  teamDeathmatch: "q3dm7",
  captureTheFlag: "q3ctf1",
};

const DEFAULT_OPTIONS = {
  map: "q3dm17",
  gameType: "freeForAll",
  maxPlayers: 16,
  fragLimit: 20,
  timeLimit: 15,
  minPlayers: 0,
  botSkill: 3,
  friendlyFire: false,
  password: "",
  hostname: "RetroLink Quake III",
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
  return Object.prototype.hasOwnProperty.call(
    GAME_TYPES,
    gameType
  )
    ? gameType
    : DEFAULT_OPTIONS.gameType;
}

function normalizeMapName(map, gameType) {
  const fallback =
    DEFAULT_MAPS[gameType] ||
    DEFAULT_MAPS.freeForAll;

  const sanitized =
    sanitizeText(map, fallback) || fallback;

  /*
  Evita inyectar comandos mediante el campo mapa.
  Los nombres normales de mapas de Quake III usan
  letras, números, guiones y guiones bajos.
  */
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return fallback;
  }

  return sanitized;
}

function normalizeOptions(options = {}) {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const gameType = normalizeGameType(
    merged.gameType
  );

  const maxPlayers = sanitizeNumber(
    merged.maxPlayers,
    DEFAULT_OPTIONS.maxPlayers,
    2,
    32
  );

  return {
    gameType,
    gameTypeId: GAME_TYPES[gameType],

    map: normalizeMapName(
      merged.map,
      gameType
    ),

    maxPlayers,

    fragLimit: sanitizeNumber(
      merged.fragLimit,
      DEFAULT_OPTIONS.fragLimit,
      0,
      999
    ),

    timeLimit: sanitizeNumber(
      merged.timeLimit,
      DEFAULT_OPTIONS.timeLimit,
      0,
      999
    ),

    minPlayers: sanitizeNumber(
      merged.minPlayers,
      DEFAULT_OPTIONS.minPlayers,
      0,
      maxPlayers
    ),

    botSkill: sanitizeNumber(
      merged.botSkill,
      DEFAULT_OPTIONS.botSkill,
      1,
      5
    ),

    friendlyFire: Boolean(
      merged.friendlyFire
    ),

    password: sanitizeText(
      merged.password
    ),

    hostname:
      sanitizeText(
        merged.hostname,
        DEFAULT_OPTIONS.hostname
      ) || DEFAULT_OPTIONS.hostname,
  };
}

module.exports = {
  id: "quake3",
  name: "Quake III Arena",

  executable: "quake3.exe",

  defaultPort: 27960,
  clientPortBase: 27961,

  supportsRoomOptions: true,

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

  getHostArgs(
    options = {},
    extraArgs = []
  ) {
    const normalized =
      normalizeOptions(options);

    const args = [
      "+set",
      "net_port",
      String(this.defaultPort),

      "+set",
      "sv_lanForce",
      "1",

      "+set",
      "sv_strictAuth",
      "0",

      "+set",
      "sv_pure",
      "0",

      "+set",
      "sv_maxclients",
      String(normalized.maxPlayers),

      "+set",
      "sv_hostname",
      normalized.hostname,

      "+set",
      "g_gametype",
      String(normalized.gameTypeId),

      "+set",
      "fraglimit",
      String(normalized.fragLimit),

      "+set",
      "timelimit",
      String(normalized.timeLimit),

      "+set",
      "g_friendlyFire",
      normalized.friendlyFire
        ? "1"
        : "0",

      "+set",
      "bot_minplayers",
      String(normalized.minPlayers),

      "+set",
      "g_spSkill",
      String(normalized.botSkill),
    ];

    if (normalized.password) {
      args.push(
        "+set",
        "g_password",
        normalized.password
      );
    } else {
      args.push(
        "+set",
        "g_password",
        ""
      );
    }

    args.push(
      "+map",
      normalized.map,
      ...extraArgs
    );

    return args;
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
        : this.clientPortBase;

    const normalized =
      normalizeOptions(options);

    const args = [];

    if (normalized.password) {
      args.push(
        "+set",
        "password",
        normalized.password
      );
    }

    args.push(
      "+connect",
      `127.0.0.1:${targetPort}`,
      ...extraArgs
    );

    return args;
  },
};
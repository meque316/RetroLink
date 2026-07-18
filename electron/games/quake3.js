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

/*
 * Convierte el valor en un número entero y lo limita
 * entre los valores mínimo y máximo permitidos.
 */
function sanitizeInteger(
  value,
  fallback,
  min,
  max
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const integer = Math.trunc(parsed);

  return Math.min(
    max,
    Math.max(min, integer)
  );
}

/*
 * Normaliza campos de texto.
 */
function sanitizeText(
  value,
  fallback = ""
) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

/*
 * Convierte correctamente valores booleanos provenientes
 * del frontend o de datos serializados.
 *
 * Evita que Boolean("false") dé como resultado true.
 */
function sanitizeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized =
      value.trim().toLowerCase();

    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === ""
    ) {
      return false;
    }
  }

  return fallback;
}

/*
 * Comprueba que el tipo de partida exista.
 */
function normalizeGameType(gameType) {
  return Object.prototype.hasOwnProperty.call(
    GAME_TYPES,
    gameType
  )
    ? gameType
    : DEFAULT_OPTIONS.gameType;
}

/*
 * Normaliza el nombre del mapa.
 *
 * Permite mapas originales y mapas personalizados, pero
 * impide introducir comandos mediante el nombre.
 */
function normalizeMapName(
  map,
  gameType
) {
  const fallback =
    DEFAULT_MAPS[gameType] ||
    DEFAULT_MAPS.freeForAll;

  const sanitized =
    sanitizeText(map, fallback) ||
    fallback;

  /*
   * Los nombres normales de mapas de Quake III usan
   * letras, números, guiones y guiones bajos.
   */
  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      sanitized
    )
  ) {
    return fallback;
  }

  return sanitized;
}

/*
 * Normaliza todos los parámetros recibidos desde la sala
 * o desde el frontend.
 */
function normalizeOptions(
  options = {}
) {
  const sourceOptions =
    options &&
    typeof options === "object" &&
    !Array.isArray(options)
      ? options
      : {};

  const merged = {
    ...DEFAULT_OPTIONS,
    ...sourceOptions,
  };

  const gameType =
    normalizeGameType(
      merged.gameType
    );

  const maxPlayers =
    sanitizeInteger(
      merged.maxPlayers,
      DEFAULT_OPTIONS.maxPlayers,
      2,
      32
    );

  /*
   * Si no se proporcionó explícitamente un mapa,
   * seleccionamos el mapa predeterminado correspondiente
   * al tipo de partida.
   *
   * Esto permite:
   *
   * freeForAll      -> q3dm17
   * tournament      -> q3tourney2
   * teamDeathmatch  -> q3dm7
   * captureTheFlag  -> q3ctf1
   */
  const providedMap =
    Object.prototype.hasOwnProperty.call(
      sourceOptions,
      "map"
    )
      ? sourceOptions.map
      : DEFAULT_MAPS[gameType];

  return {
    gameType,

    gameTypeId:
      GAME_TYPES[gameType],

    map: normalizeMapName(
      providedMap,
      gameType
    ),

    maxPlayers,

    fragLimit:
      sanitizeInteger(
        merged.fragLimit,
        DEFAULT_OPTIONS.fragLimit,
        0,
        999
      ),

    timeLimit:
      sanitizeInteger(
        merged.timeLimit,
        DEFAULT_OPTIONS.timeLimit,
        0,
        999
      ),

    minPlayers:
      sanitizeInteger(
        merged.minPlayers,
        DEFAULT_OPTIONS.minPlayers,
        0,
        maxPlayers
      ),

    botSkill:
      sanitizeInteger(
        merged.botSkill,
        DEFAULT_OPTIONS.botSkill,
        1,
        5
      ),

    friendlyFire:
      sanitizeBoolean(
        merged.friendlyFire,
        DEFAULT_OPTIONS.friendlyFire
      ),

    password:
      sanitizeText(
        merged.password
      ),

    hostname:
      sanitizeText(
        merged.hostname,
        DEFAULT_OPTIONS.hostname
      ) ||
      DEFAULT_OPTIONS.hostname,
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

    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

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
      String(
        normalized.maxPlayers
      ),

      "+set",
      "sv_hostname",
      normalized.hostname,

      "+set",
      "g_gametype",
      String(
        normalized.gameTypeId
      ),

      "+set",
      "fraglimit",
      String(
        normalized.fragLimit
      ),

      "+set",
      "timelimit",
      String(
        normalized.timeLimit
      ),

      "+set",
      "g_friendlyFire",
      normalized.friendlyFire
        ? "1"
        : "0",

      "+set",
      "bot_minplayers",
      String(
        normalized.minPlayers
      ),

      "+set",
      "g_spSkill",
      String(
        normalized.botSkill
      ),

      "+set",
      "g_password",
      normalized.password,

      "+map",
      normalized.map,

      ...safeExtraArgs,
    ];

    return args;
  },

  getClientArgs(
    port,
    options = {},
    extraArgs = []
  ) {
    const parsedPort =
      Number(port);

    const targetPort =
      Number.isInteger(
        parsedPort
      ) &&
      parsedPort > 0 &&
      parsedPort <= 65535
        ? parsedPort
        : this.clientPortBase;

    const normalized =
      normalizeOptions(options);

    const safeExtraArgs =
      Array.isArray(extraArgs)
        ? extraArgs
        : [];

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
      ...safeExtraArgs
    );

    return args;
  },
};

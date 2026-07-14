import { Gamepad2, X } from "lucide-react";

const UT99_MAPS = {
  deathmatch: [
    "DM-Deck16][",
    "DM-Codex",
    "DM-Morbias][",
    "DM-Turbine",
    "DM-Phobos",
    "DM-HyperBlast",
    "DM-Gothic",
  ],

  teamDeathmatch: [
    "DM-Deck16][",
    "DM-Codex",
    "DM-Morbias][",
    "DM-Turbine",
    "DM-Phobos",
    "DM-HyperBlast",
    "DM-Gothic",
  ],

  captureTheFlag: [
    "CTF-Face",
    "CTF-Coret",
    "CTF-Command",
    "CTF-Dreary",
    "CTF-Gauntlet",
    "CTF-LavaGiant",
    "CTF-November",
  ],

  domination: [
    "DOM-Cinder",
    "DOM-Condemned",
    "DOM-Cryptic",
    "DOM-Gearbolt",
    "DOM-Ghardhen",
    "DOM-Lament",
    "DOM-Leadworks",
    "DOM-MetalDream",
    "DOM-Olden",
    "DOM-Sesmar",
  ],

  lastManStanding: [
    "DM-Deck16][",
    "DM-Codex",
    "DM-Morbias][",
    "DM-Turbine",
    "DM-Phobos",
    "DM-HyperBlast",
    "DM-Gothic",
  ],
};

const UT99_GAME_TYPES = [
  {
    id: "deathmatch",
    name: "DeathMatch",
  },
  {
    id: "teamDeathmatch",
    name: "Team DeathMatch",
  },
  {
    id: "captureTheFlag",
    name: "Capture the Flag",
  },
  {
    id: "domination",
    name: "Domination",
  },
  {
    id: "lastManStanding",
    name: "Last Man Standing",
  },
];

export default function CreateRoomModal({
  isOpen,
  onClose,
  roomName,
  setRoomName,
  selectedGame,
  setSelectedGame,
  games = [],
  library = [],
  currentUser,
  onCreateRoom,
  isGameSupported,
  gameOptions,
  setGameOptions,
}) {
  if (!isOpen) return null;

  const updateGameOption = (key, value) => {
    setGameOptions((previousOptions) => ({
      ...previousOptions,
      [key]: value,
    }));
  };

  const handleUT99GameTypeChange = (gameType) => {
    const availableMaps =
      UT99_MAPS[gameType] || UT99_MAPS.deathmatch;

    setGameOptions((previousOptions) => ({
      ...previousOptions,
      gameType,
      map: availableMaps[0],
    }));
  };

  const selectedUT99GameType =
    gameOptions?.gameType || "deathmatch";

  const availableUT99Maps =
    UT99_MAPS[selectedUT99GameType] ||
    UT99_MAPS.deathmatch;

  const canCreateRoom =
    selectedGame?.id &&
    isGameSupported(selectedGame.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-800 bg-[#121821] p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Host a Match
          </h2>

          <button
            onClick={onClose}
            className="text-zinc-500 transition hover:text-white"
            type="button"
            aria-label="Close modal"
          >
            <X size={22} />
          </button>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm text-zinc-400">
            Room name
          </label>

          <input
            type="text"
            placeholder={`${currentUser?.username || "Player"}'s Room`}
            value={roomName}
            onChange={(event) =>
              setRoomName(event.target.value)
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="mb-8">
          <label className="mb-2 block text-sm text-zinc-400">
            Select game
          </label>

          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {games.map((game) => {
              const supported = game.supported;

              const configured = library.some(
                (libraryGame) =>
                  libraryGame.id === game.id &&
                  Boolean(libraryGame.exePath)
              );

              const selected =
                selectedGame?.id === game.id &&
                supported;

              return (
                <button
                  key={game.id}
                  onClick={() => {
                    if (supported) {
                      setSelectedGame(game);
                    }
                  }}
                  disabled={!supported}
                  type="button"
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-green-500 bg-green-500/10 text-green-400"
                      : supported
                        ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                        : "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600 opacity-60"
                  }`}
                >
                  <Gamepad2
                    size={16}
                    className="shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium leading-tight">
                      <span className="truncate">
                        {game.name}
                      </span>

                      {!supported && (
                        <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-500">
                          Pronto
                        </span>
                      )}

                      {supported && configured && (
                        <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
                          ✓
                        </span>
                      )}
                    </p>

                    <p className="text-xs text-zinc-500">
                      {game.year}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            Juegos soportados: Quake III Arena,
            Counter-Strike 1.6, Unreal Tournament y
            Carmageddon 2.
          </p>

          {selectedGame?.id === "cs16" && (
            <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
              <h3 className="text-sm font-semibold text-green-400">
                Opciones de Counter-Strike 1.6
              </h3>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Mapa
                </label>

                <select
                  value={gameOptions.map}
                  onChange={(event) =>
                    updateGameOption(
                      "map",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="de_dust2">
                    de_dust2
                  </option>
                  <option value="de_inferno">
                    de_inferno
                  </option>
                  <option value="de_nuke">
                    de_nuke
                  </option>
                  <option value="de_train">
                    de_train
                  </option>
                  <option value="de_aztec">
                    de_aztec
                  </option>
                  <option value="de_cbble">
                    de_cbble
                  </option>
                  <option value="cs_assault">
                    cs_assault
                  </option>
                  <option value="cs_office">
                    cs_office
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Max players
                  </label>

                  <input
                    type="number"
                    min="2"
                    max="32"
                    value={gameOptions.maxPlayers}
                    onChange={(event) =>
                      updateGameOption(
                        "maxPlayers",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Time limit
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={gameOptions.timeLimit}
                    onChange={(event) =>
                      updateGameOption(
                        "timeLimit",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Start money
                  </label>

                  <input
                    type="number"
                    min="800"
                    max="16000"
                    step="100"
                    value={gameOptions.startMoney}
                    onChange={(event) =>
                      updateGameOption(
                        "startMoney",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Freeze time
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={gameOptions.freezeTime}
                    onChange={(event) =>
                      updateGameOption(
                        "freezeTime",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Buy time
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.25"
                    value={gameOptions.buyTime}
                    onChange={(event) =>
                      updateGameOption(
                        "buyTime",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Password
                  </label>

                  <input
                    type="text"
                    value={gameOptions.password}
                    onChange={(event) =>
                      updateGameOption(
                        "password",
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      gameOptions.friendlyFire
                    )}
                    onChange={(event) =>
                      updateGameOption(
                        "friendlyFire",
                        event.target.checked
                      )
                    }
                  />

                  Friendly fire
                </label>

                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      gameOptions.allTalk
                    )}
                    onChange={(event) =>
                      updateGameOption(
                        "allTalk",
                        event.target.checked
                      )
                    }
                  />

                  All talk
                </label>
              </div>
            </div>
          )}

          {selectedGame?.id === "ut99" && (
            <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
              <h3 className="text-sm font-semibold text-green-400">
                Opciones de Unreal Tournament
              </h3>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Tipo de partida
                </label>

                <select
                  value={selectedUT99GameType}
                  onChange={(event) =>
                    handleUT99GameTypeChange(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {UT99_GAME_TYPES.map((gameType) => (
                    <option
                      key={gameType.id}
                      value={gameType.id}
                    >
                      {gameType.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Mapa
                </label>

                <select
                  value={gameOptions.map}
                  onChange={(event) =>
                    updateGameOption(
                      "map",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {availableUT99Maps.map((map) => (
                    <option key={map} value={map}>
                      {map}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Max players
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={gameOptions.maxPlayers}
                    onChange={(event) =>
                      updateGameOption(
                        "maxPlayers",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Frag limit
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={gameOptions.fragLimit}
                    onChange={(event) =>
                      updateGameOption(
                        "fragLimit",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Time limit
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={gameOptions.timeLimit}
                    onChange={(event) =>
                      updateGameOption(
                        "timeLimit",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Min players / bots
                  </label>

                  <input
                    type="number"
                    min="0"
                    max={gameOptions.maxPlayers || 32}
                    value={gameOptions.minPlayers}
                    onChange={(event) =>
                      updateGameOption(
                        "minPlayers",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Bot difficulty
                  </label>

                  <select
                    value={gameOptions.difficulty}
                    onChange={(event) =>
                      updateGameOption(
                        "difficulty",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value={0}>Novice</option>
                    <option value={1}>Average</option>
                    <option value={2}>Experienced</option>
                    <option value={3}>Skilled</option>
                    <option value={4}>Adept</option>
                    <option value={5}>Masterful</option>
                    <option value={6}>Inhuman</option>
                    <option value={7}>Godlike</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Friendly fire %
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={gameOptions.friendlyFire}
                    onChange={(event) =>
                      updateGameOption(
                        "friendlyFire",
                        Number(event.target.value)
                      )
                    }
                    className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Password
                </label>

                <input
                  type="text"
                  value={gameOptions.password}
                  onChange={(event) =>
                    updateGameOption(
                      "password",
                      event.target.value
                    )
                  }
                  placeholder="Optional"
                  className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <p className="text-xs text-zinc-500">
                Min players completa los espacios vacíos con
                bots hasta alcanzar el número indicado.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onCreateRoom}
          disabled={!canCreateRoom}
          type="button"
          className={`w-full rounded-xl py-3 font-semibold transition ${
            canCreateRoom
              ? "bg-green-500 text-black hover:bg-green-400"
              : "cursor-not-allowed bg-zinc-700 text-zinc-500"
          }`}
        >
          Create Room
        </button>
      </div>
    </div>
  );
}